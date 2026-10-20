// Cinder Peak from this player's point of view: the opening, then first
// person on the mountain. Walk, climb, carry, use things, look through the
// binoculars, take bearings, talk on the radio, read, sleep, and keep an
// eye on the trees. The host decides everything that matters; this file
// shows it and sends back what you do.

import * as THREE from 'three';
import { PLAYER_R, EYE, WALK, SPRINT, CARRY_SPEED, STAMINA_MAX, STAMINA_REGEN, GRAVITY, REACH, BOUNDS_R } from '../shared/config.js';
import { CAB_Y, BEDS, SPOTS, FINDER, PLACES, START_SPOTS, floorAt, inCab, upTop, hasSignal, Solids, HATCH_WALL, DOOR_WALL, STAIR } from '../shared/layout.js';
import { solidBoxes } from '../shared/forest.js';
import { ITEMS } from '../shared/items.js';
import { LOGBOOK, RADIO_LINES, SHOUTS } from '../shared/story.js';
import { CLEARING_R } from '../shared/terrain.js';
import { Avatar, Actor, ItemsView } from './avatar.js';
import { Cutscene } from './cutscene.js';
import { makePerson } from './humans.js';
import * as TX from './textures.js';
import { sound } from './audio.js';
import { voice } from './voice.js';
import { lerp, clamp01, span } from './util.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const HEAVY = (k) => !!(k && ITEMS[k] && ITEMS[k].heavy);
const GEN_POS = { x: PLACES.generator.x, y: 0.6, z: PLACES.generator.z };
const HATCH_POS = { x: SPOTS.hatch.x, y: CAB_Y - 0.1, z: SPOTS.hatch.z };
const DOOR_POS = { x: SPOTS.door.x, y: SPOTS.door.y, z: SPOTS.door.z };

export class Game {
  constructor({ renderer, post, world, link, start, hud, input, settings }) {
    this.renderer = renderer;
    this.post = post;
    this.world = world;
    this.link = link;
    this.hud = hud;
    this.input = input;
    this.settings = settings;
    this.me = link.id;
    this.isHost = start.host === link.id;
    this.roster = start.roster;
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 1100);
    this.camera.rotation.order = 'YXZ';
    this.myIndex = Math.max(0, this.roster.findIndex((r) => r.id === this.me));
    const spot = START_SPOTS[this.myIndex % 4];
    this.p = {
      x: spot.x, y: 0, z: spot.z, vy: 0, ry: spot.ry, rx: 0, eye: EYE, vx: 0, vz: 0,
      stamina: STAMINA_MAX, tired: false, flash: false, crouch: false, stepDist: 0, mv: 0,
    };
    this.mode = 'intro';
    this.t = 0;
    this.clock = 18.9;
    this.shownClock = 18.9;
    this.seg = null;
    this.fx = { fade: 1, fadeColor: 0x000000, bars: 1, binoc: false, fear: 0, staticAmt: 0, glitch: 0, exposure: 1 };
    this.fadeTo = 0;
    this.fear = 0;
    this.ws = { gen: 0, light: 1, hatch: 0, bolt: 0, door: 0, doorBolt: 0, stove: 0, cut: 0, finder: 0, smoke: -1, tank: 1, hp: 100 };
    this.items = [];
    this.ro = [];
    this.ask = null;
    this.carry = '';
    this.myBed = -1;
    this.inTruck = false;
    this.taken = false;
    this.viewing = null;
    this.inbox = [];
    this.pending = [];
    this.mark = null;
    this.fb = 0;
    this.sendT = 0;
    this.heartT = 0;
    this.whisperT = 40;
    this.boundsT = 0;
    this.tmp = new THREE.Vector3();
    this.solids = new Solids(solidBoxes());
    this.word = null;
    this.lights = [];          // flashlights blinking in the trees

    const W = world;
    W.setState({ gen: false, light: true, hatch: 0, bolt: false, door: 0, doorBolt: false, stove: false, cut: false, finder: 0, smoke: null, word: null });
    W.truck.group.position.set(PLACES.truck.x, 0, PLACES.truck.z);
    W.truck.group.rotation.set(0, PLACES.truck.ry, 0);

    this.avatars = new Map();
    for (const r of this.roster) this.avatars.set(r.id, new Avatar(r, this, r.id === this.me));
    this.itemsView = new ItemsView(W.scene);
    this.wade = null;
    this.cutscene = new Cutscene(this, 'intro');
    this.scare = makePerson('wade');
    this.scare.visible = false;
    W.scene.add(this.scare);

    const L = this.link;
    this.off = [
      L.on('s', (m) => this.onSnapshot(m)),
      L.on('seg', (m) => this.onSeg(m)),
      L.on('obj', (m) => { this.hud.objectives(m.list, m.done); if (m.done) sound.chime(); }),
      L.on('say', (m) => this.onSay(m)),
      L.on('ask', (m) => { this.ask = { ...m, until: this.t + m.timeout }; if (!m.radio) sound.chime(); }),
      L.on('asked', (m) => { if (this.ask && this.ask.id === m.id) this.ask = null; }),
      L.on('fx', (m) => this.onFx(m)),
      L.on('text', (m) => this.pending.push(m)),
      L.on('photos', (m) => this.showPhotos(m.set)),
      L.on('note', (m) => this.openPanel(`<div class="sheet"><p>${esc(m.text)}</p><div class="close">[E] PUT IT DOWN</div></div>`)),
      L.on('tp', (m) => this.teleport(m)),
      L.on('bed', (m) => { this.myBed = m.i; }),
      L.on('truck', () => { this.inTruck = true; }),
      L.on('taken', (m) => this.onTaken(m)),
      L.on('breach', () => { sound.stinger(1.3); this.hud.flash('HE\'S INSIDE'); this.fear = 1; }),
      L.on('escape', () => this.startEscape()),
      L.on('word', (m) => { this.word = m.word; W.setState({ word: m.word }); this.hud.toast(`The code word's on the clipboard by the radio: ${m.word}.`); }),
      L.on('toast', (m) => this.hud.toast(m.text)),
      L.on('dropped', (m) => this.hud.toast(`${this.nameOf(m.id)} lost connection.`)),
    ];

    sound.setScene('outside', 2);
    hud.show();
    hud.cinematic(true);
    hud.prompt(this.isHost ? 'Hold SPACE to skip' : null);
    this.updateTeam();
  }

  nameOf(id) {
    const r = this.roster.find((x) => x.id === id);
    return r ? r.name : '???';
  }

  heldState(id) {
    for (const it of this.items) if (it[5] === id) return it[6];
    return 1;
  }

  // ----------------------------------------------------------- network --
  onSnapshot(m) {
    this.clock = m.T;
    for (const row of m.ps) {
      const a = this.avatars.get(row[0]);
      if (!a) continue;
      if (!a.isMe) a.apply(row);
      else {
        a.flags = row[6];
        a.carry = row[7];
        a.bed = row[8];
        this.carry = row[7];
        if (row[8] < 0) this.myBed = -1;
        this.inTruck = (row[6] & 16) !== 0;
      }
    }
    this.items = m.it;
    this.itemsView.apply(m.it);
    const w = m.w;
    this.ws = { gen: w[0], light: w[1], hatch: w[2], bolt: w[3], door: w[4], doorBolt: w[5], stove: w[6], cut: w[7], finder: w[8], smoke: w[9], tank: w[10], hp: w[11] };
    const st = { gen: !!w[0], light: !!w[1], hatch: w[2], bolt: !!w[3], door: w[4], doorBolt: !!w[5], stove: !!w[6], cut: !!w[7], smoke: w[9] >= 0 ? w[9] : null };
    if (this.mode !== 'finder') st.finder = w[8];
    if (this.mode !== 'intro' && this.mode !== 'escape') this.world.setState(st);
    sound.setGenerator(!!w[0], GEN_POS);
    if (m.a) {
      if (!this.wade) this.wade = new Actor('wade', this);
      this.wade.apply(m.a);
    } else if (this.wade) { this.wade.dispose(); this.wade = null; }
    this.ro = m.ro || [];
    const dyn = [];
    if (w[2] < 0.3) dyn.push(HATCH_WALL);
    if (w[4] < 0.3) dyn.push(DOOR_WALL);
    this.solids.dynamic = dyn;
    this.updateTeam();
  }

  updateTeam() {
    this.hud.team(this.roster.map((r) => {
      const a = this.avatars.get(r.id);
      return { name: r.name, me: r.id === this.me, color: r.color, out: a && a.taken };
    }));
  }

  // a new part of the story: the title card, the narrator, then you're in
  onSeg(m) {
    this.seg = m;
    if (this.mode === 'intro') this.endIntro();
    this.closePanel();
    if (this.mode === 'taken' || this.mode === 'spectate') {
      this.hud.card(m.title, m.sub, m.lines, m.hold);
      return;
    }
    this.mode = 'card';
    this.cardUntil = this.t + m.hold;
    this.hud.card(m.title, m.sub, m.lines, m.hold);
    this.fx.fade = 1;
    this.fadeTo = 1;
    this.shownClock = m.clock;
    let at = m.title ? 1.6 : 0.3;
    for (const ln of m.lines) {
      setTimeout(() => { if (this.seg === m) voice.say(ln, 'narrator'); }, at * 1000);
      at += 1.8 + ln.length * 0.045;
    }
    this.ask = null;
  }

  teleport(m) {
    const p = this.p;
    p.x = m.x; p.y = m.y; p.z = m.z; p.vy = 0;
    if (m.ry != null) p.ry = m.ry;
    p.vx = p.vz = 0;
    if (this.mode === 'bed') this.mode = 'play';
  }

  endIntro() {
    this.cutscene.finish();
    this.hud.cinematic(false);
    this.hud.prompt(null);
    this.fx.bars = 0;
    for (const a of this.avatars.values()) a.snapNext = true;
  }

  // where a voice comes from: near enough to hear the radio?
  nearRadio() {
    const c = this.camera.position;
    return Math.hypot(c.x - SPOTS.radio.x, c.y - SPOTS.radio.y, c.z - SPOTS.radio.z) < 9;
  }

  onSay(m) {
    if (m.radio) {
      const near = this.nearRadio() || this.mode === 'radio';
      const pos = near ? null : { x: SPOTS.radio.x, y: SPOTS.radio.y, z: SPOTS.radio.z };
      if (m.who !== '' && !m.id) sound.radio(1 + m.text.length * 0.05, pos);
      if (m.who === '') sound.static(2.5);
      this.hud.say(m.who ? `${m.who} (radio)` : '', m.text, 'radio');
      if (!m.id || m.id !== this.me) voice.say(m.text, m.id ? 'friend' : m.voice || 'radio', { salt: 3 });
      return;
    }
    if (m.id) {
      const r = this.roster.find((x) => x.id === m.id);
      this.hud.say(r ? r.name : '???', m.text);
      const a = this.avatars.get(m.id);
      if (a) a.rig.talk(1.3);
      if (m.id !== this.me) voice.say(m.text, 'friend', { salt: r ? r.color : 0, sex: r && r.color % 2 ? 'f' : 'm' });
      return;
    }
    if (m.a === 'wade' && this.wade) {
      this.wade.rig.talk(1.6);
      // too far away to hear him? then you don't
      const c = this.camera.position;
      if (Math.hypot(c.x - this.wade.x, c.y - this.wade.y, c.z - this.wade.z) > 48 && m.voice !== 'whisper') return;
    }
    const creepy = m.voice === 'whisper';
    this.hud.say(m.who, m.text, creepy ? 'creepy' : '');
    voice.say(m.text, m.voice || 'wade');
  }

  onFx(m) {
    switch (m.k) {
      case 'pull': sound.pull(GEN_POS); break;
      case 'genStart': sound.chime(); break;
      case 'genStop': if (upTop(this.p.x, this.p.y, this.p.z)) this.hud.toast('The lights die. Down below, the generator coughs and stops.'); break;
      case 'pour': sound.pour(GEN_POS); break;
      case 'fill': sound.water(m.at === 'spring' ? SPOTS.spring : SPOTS.tank); break;
      case 'tapDry': sound.locked(SPOTS.tank); break;
      case 'hatchOpen': sound.creak(0.7, 0.8, HATCH_POS); break;
      case 'hatchShut': case 'slam': sound.shut(m.k === 'slam' ? 1.5 : 1, HATCH_POS); this.lifting = false; break;
      case 'bolt': sound.bolt(m.on); break;
      case 'locked': sound.locked(); break;
      case 'doorOpen': sound.creak(0.8, 1, DOOR_POS); break;
      case 'doorShut': sound.shut(0.9, DOOR_POS); break;
      case 'switch': sound.bolt(true); break;
      case 'stoveOn': sound.creak(0.4, 1.4); break;
      case 'stoveOff': sound.shut(0.3); break;
      case 'hatchKnock': sound.knock(HATCH_POS, 1, 1.2); break;
      case 'knockHatch': sound.knock(HATCH_POS, 3, 0.8); break;
      case 'hatchLift': sound.creak(2.4, 0.6, HATCH_POS); sound.stinger(1); this.lifting = true; this.hud.flash('THE TRAPDOOR'); break;
      case 'treeLight': this.treeLight(m.x, m.z); break;
      case 'catwalk': sound.heavyStep('wood', { x: -3, y: CAB_Y, z: 0 }); break;
      case 'tap': sound.tapGlass({ x: m.x, y: m.y, z: m.z }); break;
      case 'rattle': sound.rattle(DOOR_POS); break;
      case 'bang': sound.bang(DOOR_POS); break;
      case 'snap': sound.snap({ x: 2.6, y: CAB_Y + 2.8, z: -2.6 }); break;
      case 'mark': sound.bolt(false); break;
      case 'pickup': if (m.id === this.me) sound.pickup(m.kind); break;
      case 'drop': sound.drop(m.kind); break;
      case 'keys': sound.pickup('keys'); break;
      case 'truckDoor': sound.shut(0.8, { x: PLACES.truck.x, y: 1, z: PLACES.truck.z }); break;
      case 'sting': sound.stinger(1.2); this.fear = 1; break;
      case 'siren': sound.siren({ x: 30, y: -5, z: 80 }); break;
      case 'pry': sound.pry(HATCH_POS); break;
      case 'thump': sound.knock(HATCH_POS, 1, 1.6); break;
      case 'splinter': sound.splinter(HATCH_POS); break;
      case 'gone': break;
    }
  }

  // a flashlight blinking three times out in the trees, then nothing
  treeLight(x, z) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.glow(), color: 0xfff2d0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(x, floorAt(x, z, 50) + 1.5, z);
    sp.scale.setScalar(1.2);
    this.world.scene.add(sp);
    this.lights.push({ sp, t: 0 });
    sound.branch({ x, y: 1, z });
  }

  onTaken(m) {
    if (m.id === this.me) { this.startTaken(); return; }
    this.hud.toast(`${this.nameOf(m.id)} is gone.`);
    sound.gasp();
    if (this.viewing && this.viewing.id === m.id) this.viewing = null;
    this.updateTeam();
  }

  send() {
    const p = this.p;
    this.link.send({
      t: 'st', x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), ry: +p.ry.toFixed(2), rx: +p.rx.toFixed(2),
      mv: p.mv, fl: p.flash ? 1 : 0, zm: this.zoom ? 1 : 0, fd: this.mode === 'finder' ? 1 : 0, fb: Math.round(this.fb * 10) / 10, cr: p.crouch ? 1 : 0,
    });
  }

  // --------------------------------------------------------------- tick --
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const inp = this.input, p = this.p;
    const sens = 0.0022 * this.settings.sens * (this.zoom ? 0.2 : 1);
    const inv = this.settings.invert ? -1 : 1;
    if ((this.mode === 'play' || this.mode === 'bed' || this.mode === 'truck') && inp.locked) {
      p.ry -= inp.mx * sens;
      p.rx -= inp.my * sens * inv;
      p.rx = Math.max(-1.45, Math.min(1.45, p.rx));
    }

    switch (this.mode) {
      case 'intro': this.updateIntro(dt); break;
      case 'card': if (this.t >= this.cardUntil) this.mode = 'play'; break;
      case 'play':
        if (this.myBed >= 0) { this.mode = 'bed'; p.rx = 0.9; p.ry = BEDS[this.myBed].yaw + Math.PI; break; }
        if (this.inTruck) { this.mode = 'truck'; p.ry = 0; p.rx = 0; break; }
        this.move(dt);
        this.interact();
        this.keys();
        break;
      case 'bed': this.updateBed(); break;
      case 'finder': this.updateFinder(dt); break;
      case 'panel': this.updatePanel(); break;
      case 'truck': if (inp.hit('KeyP')) this.openPhone(); break;
      case 'taken': this.updateTaken(dt); break;
      case 'spectate': this.updateSpectate(); break;
      case 'escape': this.cutscene.update(dt); break;
    }
    this.zoom = this.mode === 'play' && this.carry === 'binocs' && inp.aiming;
    if (this.zoom) this.lookForSmoke();

    for (const a of this.avatars.values()) a.update(dt);
    if (this.wade) this.wade.update(dt, this.t, this.camera.position);
    this.stepSounds(dt);

    this.sendT -= dt;
    if (this.sendT <= 0 && (this.mode === 'play' || this.mode === 'finder' || this.mode === 'panel')) {
      this.sendT = 0.05;
      this.send();
    }
    this.placeCamera(dt);
    this.deliverTexts();
    this.updateWorld(dt);
    this.updateMood(dt);
    this.updateFx(dt);
    this.updateHud();
    inp.endFrame();
  }

  placeCamera(dt) {
    const cam = this.camera, p = this.p;
    const wantFov = this.zoom ? 9 : this.mode === 'finder' ? 32 : 72;
    if (Math.abs(cam.fov - wantFov) > 0.05) { cam.fov = lerp(cam.fov, wantFov, 1 - Math.exp(-dt * 10)); cam.updateProjectionMatrix(); }
    if (this.mode === 'intro' || this.mode === 'escape') {
      cam.position.copy(this.cutscene.pos);
      cam.lookAt(this.cutscene.lookAt);
    } else if (this.mode === 'bed' && this.myBed >= 0) {
      const b = BEDS[this.myBed];
      cam.position.set(b.x - Math.sin(b.yaw) * 0.72, b.y + 0.22, b.z - Math.cos(b.yaw) * 0.72);
      cam.rotation.set(p.rx, p.ry, 0);
    } else if (this.mode === 'finder') {
      const b = this.fb * Math.PI / 180;
      cam.position.set(FINDER.x - Math.sin(b) * 0.37, FINDER.y + 0.15, FINDER.z + Math.cos(b) * 0.37);
      cam.rotation.set(-0.04, -b, 0);
    } else if (this.mode === 'truck') {
      cam.position.set(PLACES.truck.x - 0.4, 1.66, PLACES.truck.z - 0.15);
      cam.rotation.set(p.rx, p.ry, 0);
    } else if (this.mode === 'spectate' && this.viewing) {
      const v = this.viewing;
      cam.position.set(v.x, v.y + EYE, v.z);
      cam.rotation.set(v.rx * 0.8, v.ry, 0);
    } else if (this.mode !== 'taken') {
      const speed = Math.hypot(p.vx, p.vz);
      const bob = this.mode === 'play' ? Math.abs(Math.sin((p.stepDist / (p.mv === 2 ? 0.9 : 0.7)) * Math.PI)) * 0.035 * Math.min(1, speed / 2.5) : 0;
      p.eye = lerp(p.eye, p.crouch ? 1.05 : EYE, 1 - Math.exp(-dt * 10));
      cam.position.set(p.x, p.y + p.eye + bob, p.z);
      cam.rotation.set(p.rx, p.ry, 0);
    }
    cam.updateMatrixWorld();
    sound.setListener(cam);
  }

  // ---------------------------------------------------------- the intro --
  updateIntro(dt) {
    this.cutscene.update(dt);
    this.fx.fade = lerp(this.fx.fade, this.fadeTo, 1 - Math.exp(-dt * 1.5));
    if (this.isHost) {
      this.skipHeld = this.input.down('Space') ? (this.skipHeld || 0) + dt : 0;
      if (this.skipHeld > 0.6 && !this.skipSent) {
        this.skipSent = true;
        this.link.send({ t: 'skip' });
      }
    }
  }

  // ---------------------------------------------------------- walking --
  move(dt) {
    const inp = this.input, p = this.p;
    const f = (inp.down('KeyW') || inp.down('ArrowUp') ? 1 : 0) - (inp.down('KeyS') || inp.down('ArrowDown') ? 1 : 0);
    const s = (inp.down('KeyD') || inp.down('ArrowRight') ? 1 : 0) - (inp.down('KeyA') || inp.down('ArrowLeft') ? 1 : 0);
    const len = Math.hypot(f, s);
    if (inp.hit('KeyC') || inp.hit('ControlLeft')) p.crouch = !p.crouch;
    const heavy = HEAVY(this.carry);
    const sprint = (inp.down('ShiftLeft') || inp.down('ShiftRight')) && f > 0 && !p.tired && !p.crouch && !heavy;
    if (sprint && len > 0) {
      p.stamina = Math.max(0, p.stamina - dt);
      if (p.stamina <= 0) { p.tired = true; sound.breath(true, 0.8); }
    } else {
      p.stamina = Math.min(STAMINA_MAX, p.stamina + dt * STAMINA_REGEN);
      if (p.tired && p.stamina > 1.5) p.tired = false;
    }
    const speed = p.crouch ? 1.2 : sprint && len > 0 ? SPRINT : heavy ? WALK * CARRY_SPEED : WALK;
    let wx = 0, wz = 0;
    if (len > 0) {
      const fx = -Math.sin(p.ry), fz = -Math.cos(p.ry);
      const rx = Math.cos(p.ry), rz = -Math.sin(p.ry);
      wx = ((fx * f + rx * s) / len) * speed;
      wz = ((fz * f + rz * s) / len) * speed;
    }
    const k = 1 - Math.exp(-dt * 12);
    p.vx = lerp(p.vx, wx, k);
    p.vz = lerp(p.vz, wz, k);
    const ox = p.x, oz = p.z;
    const pos = { x: p.x + p.vx * dt, z: p.z + p.vz * dt };
    this.solids.resolve(pos, PLAYER_R, p.y);
    // the forest's too thick to wander off into
    const r = Math.hypot(pos.x, pos.z);
    if (r > BOUNDS_R) {
      pos.x *= BOUNDS_R / r; pos.z *= BOUNDS_R / r;
      if (this.t > this.boundsT) { this.boundsT = this.t + 12; this.hud.toast('The trees close in that way. Better not get lost out here.'); }
    }
    p.x = pos.x; p.z = pos.z;
    // up and down: stairs, the trapdoor's hole, the ground
    const floor = floorAt(p.x, p.z, p.y, this.ws.hatch < 0.3);
    if (p.y - floor < 0.45 && p.vy <= 0) { p.y = floor; p.vy = 0; } else {
      p.vy -= GRAVITY * dt;
      p.y += p.vy * dt;
      if (p.y <= floor) {
        if (p.vy < -7) sound.shut(0.6);
        p.y = floor; p.vy = 0;
      }
    }
    const moved = Math.hypot(p.x - ox, p.z - oz);
    const v = moved / dt;
    p.mv = v > 3 ? 2 : v > 0.3 ? 1 : 0;
    const stride = p.mv === 2 ? 0.9 : 0.7;
    const before = Math.floor(p.stepDist / stride);
    p.stepDist += moved;
    if (Math.floor(p.stepDist / stride) !== before) sound.step(this.surface(p.x, p.y, p.z), (p.mv === 2 ? 1.2 : 0.7) * (p.crouch ? 0.4 : 1));
  }

  surface(x, y, z) {
    if (y > CAB_Y - 0.4) return 'wood';
    if (y > 0.05 && Math.abs(x) < STAIR.end + 0.1 && Math.abs(z) < 1.1) return 'metal';
    return Math.hypot(x, z) < CLEARING_R ? 'grass' : 'dirt';
  }

  // ------------------------------------------------------- using things --
  targets() {
    const p = this.p, ws = this.ws, out = [];
    const up = p.y > CAB_Y - 0.6, inside = inCab(p.x, p.y, p.z), carry = this.carry;
    const add = (kind, key, at, r, label) => out.push({ kind, key, pos: at instanceof THREE.Vector3 ? at : v3(at.x, at.y, at.z), r, label });
    const S = SPOTS;
    for (const [id, kind, x, y, z, holder] of this.items) {
      if (holder) continue;
      const big = kind === 'box' || kind === 'jug' || kind === 'fuel';
      add('take', id, v3(x, y + (big ? 0.2 : 0.04), z), big ? 0.3 : 0.13, carry ? `Your hands are full ([G] to put it down)` : `[E] Pick up ${ITEMS[kind].name}`);
    }
    if (!up) {
      add('use', 'generator', S.generator, S.generator.r, carry === 'fuel' ? '[E] Pour the fuel in' : ws.gen ? 'The generator\'s running' : '[E] Pull the starter cord');
      add('use', 'tank', S.tank, S.tank.r, carry === 'jug' ? '[E] Fill the jug at the tap' : 'The water tank');
      add('use', 'spring', S.spring, S.spring.r, carry === 'jug' ? '[E] Fill the jug' : 'A spring, piped out of the rock');
      add('use', 'trailcam', S.trailcam, S.trailcam.r, '[E] Look at the trail camera\'s photos');
      add('use', 'truckDoor', S.truckDoor, S.truckDoor.r, this.seg && this.seg.id === 'day3' ? '[E] Get in the truck' : 'The truck');
      add('use', 'campPhotos', S.campPhotos, S.campPhotos.r, '[E] Look at the photos');
      if (this.hud.last.objectives && this.hud.last.objectives.includes('open the gate')) add('use', 'gate', S.gate, S.gate.r, '[E] Open the gate');
      if (p.y > 10) add('use', 'hatchBelow', S.hatchBelow, S.hatchBelow.r, ws.hatch > 0.5 ? null : ws.bolt ? '[E] Knock on the trapdoor' : '[E] Push the trapdoor open');
    } else {
      add('use', 'radio', S.radio, S.radio.r, ws.cut ? '[E] Use the radio (it hisses)' : '[E] Use the radio');
      add('use', 'logbook', S.logbook, S.logbook.r, '[E] Read the logbook');
      add('use', 'finder', S.finder, S.finder.r, '[E] Use the fire finder');
      const lift = this.lifting && ws.hatch < 0.5;
      add('use', 'hatch', S.hatch, S.hatch.r, lift ? '[E] SLAM IT SHUT' : ws.hatch < 0.05 ? (ws.bolt ? 'The trapdoor (bolted)' : '[E] Open the trapdoor') : '[E] Shut the trapdoor');
      if (ws.hatch < 0.05) add('use', 'hatchBolt', S.hatchBolt, S.hatchBolt.r, ws.bolt ? '[E] Unbolt the trapdoor' : '[E] Bolt the trapdoor');
      add('use', 'door', S.door, S.door.r, ws.door < 0.05 ? (ws.doorBolt ? (inside ? 'The door (bolted)' : '[E] Try the door') : '[E] Open the door') : '[E] Shut the door');
      if (inside && ws.door < 0.05) add('use', 'doorBolt', S.doorBolt, S.doorBolt.r, ws.doorBolt ? '[E] Unbolt the door' : '[E] Bolt the door');
      add('use', 'lightSwitch', S.lightSwitch, S.lightSwitch.r, '[E] Light switch');
      add('use', 'stove', S.stove, S.stove.r, ws.stove ? '[E] Let the stove go out' : '[E] Light the stove');
      if (inside) BEDS.forEach((b, i) => add('use', `bed${i}`, v3(b.x, b.y + 0.15, b.z), 0.55, `[E] Lie down on ${b.name}`));
    }
    return out;
  }

  interact() {
    const inp = this.input, p = this.p;
    if (inp.hit('KeyF')) { p.flash = !p.flash; sound.bolt(p.flash); }
    if (inp.hit('KeyG') && this.carry) this.link.send({ t: 'drop' });
    const cam = this.camera, o = cam.position, dir = cam.getWorldDirection(this.tmp);
    let best = null, bestScore = Infinity;
    for (const c of this.targets()) {
      if (!c.label) continue;
      const v = c.pos.clone().sub(o);
      const along = v.dot(dir);
      if (along < 0.1 || along > REACH) continue;
      const perp = v.clone().sub(dir.clone().multiplyScalar(along)).length();
      const r = c.r + along * 0.02;
      if (perp > r) continue;
      const score = perp / r + (c.kind === 'take' ? -0.2 : 0);
      if (score < bestScore) { bestScore = score; best = c; }
    }
    this.target = best;
    if (!best || !inp.hit('KeyE')) return;
    if (best.kind === 'take') { if (!this.carry) this.link.send({ t: 'take', id: best.key }); else this.link.send({ t: 'drop' }); return; }
    switch (best.key) {
      case 'radio': this.openRadio(); return;
      case 'logbook': this.openLog(); return;
      case 'finder':
        this.mode = 'finder';
        this.fb = this.ws.finder;
        sound.bolt(false);
        return;
      default:
        if (best.label.startsWith('[E]')) this.link.send({ t: 'use', k: best.key });
        else if (best.key === 'truckDoor') this.hud.toast('Not yet. We just got here.');
    }
  }

  // number keys: answer whoever's asking, or shout to your friends
  keys() {
    const inp = this.input;
    let k = -1;
    for (let i = 0; i < 4; i++) if (inp.hit(`Digit${i + 1}`) || inp.hit(`Numpad${i + 1}`)) k = i;
    if (inp.hit('KeyP')) { this.openPhone(); return; }
    if (k < 0) return;
    const a = this.liveAsk();
    if (a && !a.radio) { if (k < a.opts.length) this.link.send({ t: 'answer', id: a.id, k }); return; }
    if (SHOUTS[k]) this.link.send({ t: 'shout', k });
  }

  // the question you can answer from where you are
  liveAsk() {
    const a = this.ask;
    if (!a || this.t > a.until) return null;
    if (a.radio) return this.nearRadio() ? a : null;
    const c = this.camera.position;
    return a.at && Math.hypot(c.x - a.at[0], c.y - a.at[1], c.z - a.at[2]) < a.r ? a : null;
  }

  lookForSmoke() {
    if (this.spotSent || !this.seg || this.seg.id !== 'day2' || this.ws.smoke < 0) return;
    const d = this.camera.getWorldDirection(this.tmp);
    const b = (Math.atan2(d.x, -d.z) * 180 / Math.PI + 360) % 360;
    if (angDiff(b, this.ws.smoke) < 5 && d.y > -0.2 && d.y < 0.25) {
      this.spotSent = true;
      this.link.send({ t: 'spot' });
      this.hud.toast('There: a column of smoke off a far ridge. Now get a bearing on it with the fire finder.');
    }
  }

  // ------------------------------------------------------ the fire finder --
  updateFinder(dt) {
    const inp = this.input;
    const s = 0.035 * this.settings.sens;
    this.fb += inp.mx * s;
    if (inp.down('KeyA')) this.fb -= 25 * dt;
    if (inp.down('KeyD')) this.fb += 25 * dt;
    this.fb = ((this.fb % 360) + 360) % 360;
    this.world.setState({ finder: this.fb });
    if (inp.hit('KeyE')) {
      this.mark = Math.round(this.fb);
      this.link.send({ t: 'mark', b: this.mark });
      this.hud.toast(`Bearing marked: ${String(this.mark).padStart(3, '0')} degrees. Radio it in to dispatch.`);
    }
    if (inp.hit('KeyQ') || inp.hit('KeyS') || inp.rightClicks > 0 || inp.hit('Space')) this.mode = 'play';
  }

  // ------------------------------------------------------------- panels --
  openPanel(html, cls = '') {
    this.hud.panel(html, cls);
    this.mode = 'panel';
    this.panelOpenedAt = this.t;
  }
  closePanel() {
    this.hud.panel(null);
    this.panelKind = null;
    if (this.mode === 'panel') this.mode = 'play';
  }

  updatePanel() {
    const inp = this.input;
    if (this.panelKind === 'radio') this.renderRadio();
    if (this.panelKind === 'phone') this.renderPhone();
    let k = -1;
    for (let i = 0; i < 6; i++) if (inp.hit(`Digit${i + 1}`) || inp.hit(`Numpad${i + 1}`)) k = i;
    if (k >= 0 && this.panelKeys && this.panelKeys[k]) this.panelKeys[k]();
    if (this.t - this.panelOpenedAt > 0.15 && (inp.hit('KeyE') || inp.hit('Escape') || inp.hit('KeyQ') || (this.panelKind === 'phone' && inp.hit('KeyP')) || inp.clicks > 0)) this.closePanel();
  }

  openRadio() {
    this.panelKind = 'radio';
    this.openPanel('<div class="sheet radio"></div>');
    this.renderRadio();
    sound.radio(0.2);
  }

  renderRadio() {
    const keys = [];
    const rows = [];
    const a = this.ask && this.ask.radio && this.t < this.ask.until ? this.ask : null;
    if (a) {
      rows.push(`<div class="dead">${esc(a.who)} is on the channel, waiting.</div>`);
      a.opts.forEach((o, i) => { keys.push(() => this.link.send({ t: 'answer', id: a.id, k: i })); rows.push(`<div><b>${keys.length}</b>${esc(o)}</div>`); });
    } else {
      for (const k of this.ro) {
        const text = RADIO_LINES[k].replace('{b}', String(this.mark ?? '---').padStart(3, '0'));
        keys.push(() => { this.link.send({ t: 'radio', k }); this.closePanel(); });
        rows.push(`<div><b>${keys.length}</b>${esc(text)}</div>`);
      }
    }
    if (this.ws.cut) rows.unshift('<div class="dead">Nothing but static. Something\'s wrong with the antenna.</div>');
    this.panelKeys = keys;
    const html = `<div class="sheet radio"><h3>CH 4 · LYLE CREEK DISPATCH</h3>${rows.join('')}<div class="close">[E] STEP AWAY</div></div>`;
    if (html !== this.lastRadio) { this.lastRadio = html; this.hud.panel(html); }
  }

  openLog() {
    const rows = LOGBOOK.map(([d, t], i) => `<p class="${i === LOGBOOK.length - 1 ? 'last' : ''}"><b>${esc(d)}</b>${esc(t)}</p>`).join('');
    this.openPanel(`<div class="sheet log"><h3>Cinder Peak lookout: daily log</h3>${rows}<div class="close">[E] CLOSE THE BOOK</div></div>`);
  }

  openPhone() {
    this.panelKind = 'phone';
    this.openPanel('<div class="phone"></div>');
    this.renderPhone();
  }

  renderPhone() {
    const p = this.p, sig = hasSignal(p.x, p.y, p.z);
    const keys = [];
    const opts = [];
    if (sig && this.seg && this.seg.id === 'day3' && !this.texted) {
      keys.push(() => this.link.send({ t: 'phone', k: 'call' }));
      opts.push(`<div>${keys.length} Call 911</div>`);
      keys.push(() => { this.texted = true; this.link.send({ t: 'phone', k: 'text' }); });
      opts.push(`<div>${keys.length} Text the sheriff's office</div>`);
    }
    this.panelKeys = keys;
    const msgs = this.inbox.slice().reverse().map((m) => `<div class="msg2"><b>${esc(m.from)}</b>${esc(m.text)}</div>`).join('') || '<div class="msg2">No messages.</div>';
    const html = `<div class="phone"><div class="screen2"><div class="bars">${sig ? 'T Mobile ▂▄ 1 bar' : 'No service'}</div>${msgs}${opts.length ? `<div class="opts">${opts.join('')}</div>` : ''}</div><div class="close" style="color:#8a9aa8;margin-top:10px">[P] PUT IT AWAY</div></div>`;
    if (html !== this.lastPhone) { this.lastPhone = html; this.hud.panel(html); }
  }

  // messages only arrive where there's signal
  deliverTexts() {
    if (!this.pending.length) return;
    const p = this.p;
    if (!hasSignal(p.x, p.y, p.z) && !(this.seg && this.seg.id === 'day3' && this.pending.some((m) => m.from.startsWith('Sheriff')))) return;
    this.inbox.push(...this.pending);
    const n = this.pending.length;
    this.pending = [];
    sound.buzz();
    this.hud.toast(`Your phone buzzes: ${n} new message${n > 1 ? 's' : ''}. [P]`);
  }

  // the trail camera's card (rendered from where it hangs), or his photographs
  showPhotos(set) {
    let figs;
    if (set === 'camp') {
      figs = this.world.campPhotos.slice(2, 6).map((tex) => ({ src: tex.image.toDataURL(), cap: '' }));
      this.openPanel(`<div class="photos">${figs.map((f, i) => `<figure style="--r:${(i % 2 ? 2 : -2) + i}deg"><img src="${f.src}"><figcaption>${f.cap}</figcaption></figure>`).join('')}</div><div style="position:absolute;bottom:8%;width:100%;text-align:center;font:600 12px var(--ui);letter-spacing:.2em;color:#d8cebf">PHOTOS OF THE TOWER AT NIGHT. OF THE CAB WINDOWS. OF YOU, ASLEEP. [E]</div>`);
      return;
    }
    figs = this.renderTrailcam();
    this.openPanel(`<div class="photos">${figs.map((f, i) => `<figure style="--r:${(i % 2 ? 1.5 : -1.5)}deg"><img src="${f.src}"><figcaption>${f.cap}</figcaption></figure>`).join('')}</div>`);
  }

  // four infrared shots from the camera on the pine: an empty clearing, an
  // elk... and somebody standing under the tower looking up, then right in
  // front of the lens
  renderTrailcam() {
    const W = this.world, r = this.renderer;
    const T = PLACES.trailcam, dx = -T.x, dz = -T.z, l = Math.hypot(dx, dz);
    const cam = new THREE.PerspectiveCamera(56, 4 / 3, 0.05, 400);
    cam.position.set(T.x + (dx / l) * 0.5, 1.5, T.z + (dz / l) * 0.5);
    cam.lookAt(0, 4.5, 0);
    const target = new THREE.WebGLRenderTarget(400, 300);
    const fig = makePerson('wade');
    W.scene.add(fig);
    // nobody else in the pictures
    const hidden = [...this.avatars.values()].map((a) => a.root).concat(this.wade ? [this.wade.root] : []).filter((o) => o.visible);
    for (const o of hidden) o.visible = false;
    const keepHour = W.hour, keepBg = W.scene.background, keepFog = W.fog.density;
    W.setHour(2.2);
    W.scene.background = new THREE.Color(0x020202);
    W.fog.density = 0.004;
    const flash = W.flashlights[3];
    const keepF = { i: flash.intensity, p: flash.position.clone(), t: flash.target.position.clone() };
    flash.intensity = 60;
    flash.angle = 0.9;
    flash.position.copy(cam.position);
    flash.target.position.set(0, 2, 0);
    const shots = [
      { cap: '06/12  23:51', fig: null },
      { cap: '06/13  04:12', fig: [9.5, 0, -16, 'cam'] },
      { cap: '06/14  02:09', fig: [-4.6, 0, 1.2, 'up'] },
      { cap: '06/14  02:31', fig: [cam.position.x + (dx / l) * 1.3, 0, cam.position.z + (dz / l) * 1.3, 'lens'] },
    ];
    const out = [];
    const buf = new Uint8Array(400 * 300 * 4);
    for (const s of shots) {
      fig.visible = !!s.fig;
      if (s.fig) {
        fig.position.set(s.fig[0], 0, s.fig[2]);
        const fx = s.fig[3] === 'up' ? 0 : cam.position.x, fz = s.fig[3] === 'up' ? 0 : cam.position.z;
        fig.rotation.y = Math.atan2(fx - s.fig[0], fz - s.fig[2]);
        for (let i = 0; i < 20; i++) fig.userData.rig.update(0.05, { pose: 'stand', lookYaw: 0, lookPitch: s.fig[3] === 'up' ? 0.9 : 0, stiff: true });
        fig.updateMatrixWorld(true);
      }
      r.setRenderTarget(target);
      r.render(W.scene, cam);
      r.readRenderTargetPixels(target, 0, 0, 400, 300, buf);
      const c = document.createElement('canvas');
      c.width = 400; c.height = 300;
      const x = c.getContext('2d');
      const img = x.createImageData(400, 300);
      for (let yy = 0; yy < 300; yy++) {
        for (let xx = 0; xx < 400; xx++) {
          const si = ((299 - yy) * 400 + xx) * 4, di = (yy * 400 + xx) * 4;
          let v = (buf[si] * 0.3 + buf[si + 1] * 0.5 + buf[si + 2] * 0.2) * 2.4 + (Math.random() - 0.5) * 34;
          v = Math.max(0, Math.min(255, v));
          img.data[di] = v * 0.92; img.data[di + 1] = v; img.data[di + 2] = v * 0.9; img.data[di + 3] = 255;
        }
      }
      x.putImageData(img, 0, 0);
      x.fillStyle = 'rgba(0,0,0,0.6)';
      x.fillRect(0, 276, 400, 24);
      x.fillStyle = '#e8e8e0';
      x.font = '14px "Courier New", monospace';
      x.fillText(`TRAILCAM 02  ${s.cap}  38F`, 10, 293);
      out.push({ src: c.toDataURL(), cap: s.cap });
    }
    r.setRenderTarget(null);
    target.dispose();
    fig.removeFromParent();
    for (const o of hidden) o.visible = true;
    flash.intensity = keepF.i; flash.position.copy(keepF.p); flash.target.position.copy(keepF.t); flash.angle = 0.42;
    W.scene.background = keepBg;
    W.fog.density = keepFog;
    W.hour = null;
    W.setHour(keepHour ?? this.clock);
    return out;
  }

  // ------------------------------------------------------------- sleep --
  updateBed() {
    const inp = this.input, p = this.p;
    p.rx = Math.max(-0.3, Math.min(1.35, p.rx));
    if (this.myBed < 0) { this.mode = 'play'; return; }
    if (inp.hit('KeyE') || inp.hit('KeyW') || inp.hit('Space')) this.link.send({ t: 'use', k: `bed${this.myBed}` });
    if (inp.hit('KeyP')) this.openPhone();
  }

  // ------------------------------------------------------- taken -------
  startTaken() {
    this.mode = 'taken';
    this.taken = true;
    this.cine = { t: 0 };
    sound.jumpscare();
    voice.stop();
    this.closePanel();
    const cam = this.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    fwd.y = 0;
    fwd.normalize();
    const s = this.scare;
    s.position.set(cam.position.x + fwd.x * 0.42, cam.position.y - 1.75, cam.position.z + fwd.z * 0.42);
    s.rotation.y = Math.atan2(-fwd.x, -fwd.z);
    s.visible = true;
    this.hud.prompt(null);
    this.p.flash = false;
  }

  updateTaken(dt) {
    const c = this.cine, t = (c.t += dt);
    this.scare.userData.rig.update(dt, { pose: 'reach', speed: 0, lookYaw: 0, lookPitch: 0.2, stiff: true });
    this.camera.rotation.z = (Math.random() - 0.5) * 0.1 * (1 - span(t, 0.8, 1.5));
    this.fx.glitch = t < 1.6 ? 1 : 0;
    this.fx.staticAmt = t < 1.3 ? (Math.random() < 0.3 ? 0.5 : 0.08) : span(t, 1.3, 1.7);
    this.fear = 1;
    if (t > 1.7) { this.scare.visible = false; this.fadeTo = 1; }
    if (t > 3.2) {
      this.fx.staticAmt = 0;
      this.fx.glitch = 0;
      this.fadeTo = 0;
      this.camera.rotation.z = 0;
      this.hud.banner('HE TOOK YOU', 'Watching the others...');
      setTimeout(() => this.hud.banner(null), 4000);
      this.mode = 'spectate';
      this.viewing = null;
    }
  }

  updateSpectate() {
    const list = [...this.avatars.values()].filter((a) => a.alive && !a.isMe && !a.inTruck);
    if (!list.length) { this.viewing = null; this.hud.prompt(null); return; }
    let i = list.indexOf(this.viewing);
    if (i < 0) i = 0;
    else if (this.input.clicks > 0 || this.input.hit('Space')) i = (i + 1) % list.length;
    this.viewing = list[i];
    this.hud.prompt(`Watching ${this.viewing.name}. Click to switch.`);
  }

  startEscape() {
    this.closePanel();
    this.mode = 'escape';
    this.hud.cinematic(true);
    this.fx.bars = 1;
    this.cutscene = new Cutscene(this, 'escape');
  }

  // --------------------------------------------------- the world, sound --
  updateWorld(dt) {
    const W = this.world;
    if (this.mode !== 'intro') {
      if (this.mode === 'card') this.shownClock = this.seg ? this.seg.clock : this.clock;
      else this.shownClock = Math.abs(this.clock - this.shownClock) > 1 ? this.clock : lerp(this.shownClock, this.clock, 1 - Math.exp(-dt * 2));
      W.setHour(this.shownClock);
    }
    // everyone's flashlights: yours from your eyes, theirs from their heads
    const flashes = [];
    for (const r of this.roster) {
      const a = this.avatars.get(r.id);
      if (r.id === this.me) {
        const cam = this.camera;
        const on = this.p.flash && (this.mode === 'play' || this.mode === 'panel' || this.mode === 'bed');
        flashes.push({ on, pos: cam.position.clone().add(new THREE.Vector3(0.12, -0.18, 0).applyEuler(cam.rotation)), dir: cam.getWorldDirection(new THREE.Vector3()) });
      } else {
        const on = a && a.flash && a.alive && !a.inTruck;
        const dir = new THREE.Vector3(-Math.sin(a.ry) * Math.cos(a.rx), Math.sin(a.rx), -Math.cos(a.ry) * Math.cos(a.rx));
        flashes.push({ on, pos: new THREE.Vector3(a.x, a.y + 1.45, a.z).addScaledVector(dir, 0.3), dir });
      }
    }
    W.update(dt, this.t, { flashes });
    // flashlights in the trees: three blinks, then gone
    for (const L of this.lights) {
      L.t += dt;
      L.sp.visible = Math.floor(L.t * 2.2) % 2 === 0 && L.t < 3;
      if (L.t > 3) L.sp.removeFromParent();
    }
    this.lights = this.lights.filter((L) => L.t <= 3);
    const p = this.p;
    sound.setEnv({ day: W.sky.state.day, height: this.camera.position.y, cab: inCab(this.camera.position.x, this.camera.position.y - 1.6, this.camera.position.z), gen: !!this.ws.gen });
    sound.update(dt);
    void p;
  }

  // his footsteps, and everyone else's
  stepSounds(dt) {
    const w = this.wade;
    if (w && w.moved > 0) {
      w.stepAcc += w.moved;
      if (w.stepAcc > 0.8) {
        w.stepAcc = 0;
        const surf = this.surface(w.x, w.y, w.z);
        sound.heavyStep(surf, { x: w.x, y: w.y + 0.1, z: w.z });
      }
    }
    for (const a of this.avatars.values()) {
      if (a.isMe || !a.alive || a.bed >= 0 || a.inTruck) continue;
      a.stepAcc = (a.stepAcc || 0) + a.speed * dt;
      if (a.stepAcc > 0.75) { a.stepAcc = 0; sound.step(this.surface(a.x, a.y, a.z), 0.55, { x: a.x, y: a.y + 0.1, z: a.z }); }
    }
  }

  // the drone, his breathing when he's close, your heart
  updateMood(dt) {
    if (this.mode === 'intro' || this.mode === 'escape') return;
    const night = 1 - this.world.sky.state.day;
    let tension = 0.03 + night * 0.12;
    const w = this.wade, cam = this.camera.position;
    if (w) {
      const d = Math.hypot(w.x - cam.x, w.y - cam.y, w.z - cam.z);
      tension = Math.max(tension, clamp01((40 - d) / 40) * 0.6);
      if (w.anim === 'run') tension = 1;
      if (d < 9 && (night > 0.5 || w.anim === 'run')) {
        sound.setLoop('him', { x: w.x, y: w.y + 1.7, z: w.z }, 0.2);
        this.heartT -= dt;
        if (this.heartT <= 0 && this.mode !== 'spectate') {
          this.heartT = 0.35 + d * 0.1;
          sound.heartbeat(1 + (9 - d) / 4, 0.4 + (9 - d) / 10);
        }
        this.fear = Math.max(this.fear, clamp01((8 - d) / 8));
      } else sound.setLoop('him', null, 0);
    } else sound.setLoop('him', null, 0);
    if (Math.abs(tension - sound.tension) > 0.04) sound.setTension(tension, 2.5);
    // alone in the dark, you start hearing things
    this.whisperT -= dt;
    if (this.whisperT <= 0) {
      this.whisperT = 30 + Math.random() * 40;
      if (night > 0.7 && this.seg && this.seg.id === 'night2' && Math.random() < 0.5) sound.whisper();
    }
    this.fear = Math.max(0, this.fear - dt * 0.25);
  }

  updateFx(dt) {
    const fx = this.fx;
    if (this.mode !== 'intro' && this.mode !== 'escape') fx.bars = 0;
    fx.binoc = this.zoom;
    fx.fear = this.fear * 0.8;
    fx.exposure = 1.0;
    fx.saturation = 1;
    if (this.mode === 'card') this.fadeTo = 1;
    else if (this.mode !== 'taken' && this.mode !== 'escape' && this.mode !== 'intro') this.fadeTo = 0;
    if (this.mode !== 'taken' && this.mode !== 'intro') { fx.staticAmt = lerp(fx.staticAmt, 0, 1 - Math.exp(-dt * 6)); fx.glitch = lerp(fx.glitch, 0, 1 - Math.exp(-dt * 6)); }
    fx.fade = lerp(fx.fade, this.fadeTo, 1 - Math.exp(-dt * (this.mode === 'card' ? 6 : 2)));
  }

  updateHud() {
    const hud = this.hud, p = this.p;
    if (this.mode === 'intro' || this.mode === 'escape') return;
    const seg = this.seg;
    hud.clock(this.shownClock, seg ? seg.title : '');
    const playing = this.mode === 'play';
    hud.stamina(playing && p.stamina < STAMINA_MAX - 0.05 ? p.stamina / STAMINA_MAX : null);
    hud.flashlight(p.flash);
    hud.crosshair(playing && !this.zoom);
    hud.bearing(this.mode === 'finder' ? this.fb : null);
    if (this.mode === 'finder') hud.prompt('Mouse or A/D: turn the sight onto the smoke   [E] mark the bearing   [Q] step back');
    else if (this.mode === 'bed') hud.prompt(this.myBed >= 0 ? '[E] Get up' : null);
    else if (this.mode === 'truck') hud.prompt('Waiting for everyone to get in...');
    else if (playing) hud.prompt(this.zoom ? null : this.target ? this.target.label : null);
    else if (this.mode !== 'spectate') hud.prompt(null);
    hud.carry(playing && this.carry ? `Carrying ${ITEMS[this.carry]?.name || this.carry}   [G] put it down${this.carry === 'binocs' ? '   [Right mouse] look' : ''}` : '');
    const a = playing ? this.liveAsk() : null;
    if (a && !a.radio) hud.ask(a.who, a.opts);
    else if (a && a.radio) hud.ask('On the radio (go to it)', null);
    else hud.ask(null, null);
    hud.hint(playing ? '[1-4] shout   [P] phone   [F] flashlight' : '');
  }

  render() {
    const fx = this.fx;
    fx.time = this.t;
    this.post.render((target) => this.world.render(this.renderer, this.camera, target), fx);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // the end
  over() {
    this.mode = 'over';
    this.hud.ask(null, null);
    sound.setTension(0, 3);
  }

  dispose() {
    for (const f of this.off) f();
    sound.quiet();
    sound.setGenerator(false, GEN_POS);
    voice.stop();
    this.cutscene.finish();
    for (const a of this.avatars.values()) a.dispose();
    if (this.wade) this.wade.dispose();
    this.itemsView.dispose();
    for (const L of this.lights) L.sp.removeFromParent();
    this.scare.removeFromParent();
    this.world.setState({ gen: true, light: true, hatch: 0, bolt: false, door: 0, doorBolt: false, cut: false, smoke: null, word: null });
  }
}
