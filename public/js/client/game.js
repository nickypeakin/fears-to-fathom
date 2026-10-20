// One night from this player's point of view: the opening cutscene, then
// first person in the apartment. Answer the door (or don't), look through
// the peephole, talk through the wood, hide when he gets in, and watch the
// others if he takes you. The host decides everything that matters; this
// file shows it and sends back what you do.

import * as THREE from 'three';
import { resolveCircle } from '../shared/collision.js';
import { PLAYER_R, EYE, WALK, SPRINT, STAMINA_MAX, STAMINA_REGEN, BREATH_MAX, NIGHT_LEN, NIGHT_START_HOUR } from '../shared/config.js';
import { DOOR, HIDES, PLAYER_SOLIDS, inside } from '../shared/layout.js';
import { KNOCKS, TALK } from '../shared/lines.js';
import { START_SPOTS } from '../host/match.js';
import { Avatar, Actor } from './avatar.js';
import { Cutscene } from './cutscene.js';
import { makePerson } from './humans.js';
import { sound } from './audio.js';
import { voice } from './voice.js';
import { lerp, clamp01, span } from './util.js';

const DOOR_POS = { x: 1.6, y: 1.2, z: -0.06 };
const HIDE_VERB = { closet: 'Hide in', wardrobe: 'Hide in', shower: 'Hide behind the curtain in', bed: 'Crawl' };

export class Game {
  constructor({ renderer, post, world, ground, link, start, hud, input, settings }) {
    this.renderer = renderer;
    this.post = post;
    this.world = world;
    this.ground = ground;
    this.link = link;
    this.hud = hud;
    this.input = input;
    this.settings = settings;
    this.me = link.id;
    this.isHost = start.host === link.id;
    this.roster = start.roster;
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.03, 400);
    this.camera.rotation.order = 'YXZ';

    const myIndex = Math.max(0, this.roster.findIndex((r) => r.id === this.me));
    const spot = START_SPOTS[myIndex % 4];
    this.p = {
      x: spot.x, z: spot.z, ry: spot.ry, rx: 0, eye: EYE, vx: 0, vz: 0,
      stamina: STAMINA_MAX, tired: false, flash: false, crouch: false, stepDist: 0, mv: 0,
      breath: BREATH_MAX, holding: false,
    };
    this.mode = 'intro';
    this.t = 0;
    this.nightT = 0;
    this.fx = { fade: 1, fadeColor: 0x000000, bars: 1, peep: false, fear: 0, staticAmt: 0, glitch: 0, exposure: 1 };
    this.fadeTo = 0;
    this.power = 1;
    this.viewing = null;
    this.sendT = 0;
    this.peepLook = { yaw: 0, pitch: 0 };
    this.hideLook = { yaw: 0, pitch: 0 };
    this.door = { bolt: true, chain: true, angle: 0, lock: 100, strain: 0 };
    this.hiding = -1;
    this.pendingHide = -1;
    this.heartT = 0;
    this.raspT = 0;
    this.whisperT = 25;
    this.tmp = new THREE.Vector3();
    this.fear = 0;

    // reset the shared world for a new night
    world.setPower(1, 1);
    world.door.set({ bolt: false, chain: false, angle: 0 });
    for (let i = 0; i < HIDES.length; i++) world.setHideOpen(i, 0);
    world.setSwing('50D', 0);
    world.setSwing('stair', 0);

    this.avatars = new Map();
    for (const r of this.roster) this.avatars.set(r.id, new Avatar(r, this, r.id === this.me));
    this.actors = new Map();
    this.cutscene = new Cutscene(this);
    this.scare = makePerson('stalker');
    this.scare.visible = false;
    world.scene.add(this.scare);

    const L = this.link;
    this.off = [
      L.on('s', (m) => this.onSnapshot(m)),
      L.on('go', () => { if (this.mode === 'intro') this.beginPlay(); }),
      L.on('fx', (m) => this.onFx(m)),
      L.on('say', (m) => this.onSay(m)),
      L.on('opened', (m) => this.onOpened(m)),
      L.on('breach', () => this.onBreach()),
      L.on('taken', (m) => this.onTaken(m)),
      L.on('hid', (m) => this.onHid(m)),
      L.on('nohide', (m) => { this.pendingHide = -1; this.hud.toast(m.text); }),
      L.on('unhid', (m) => this.onUnhid(m)),
      L.on('reward', (m) => { this.hud.toast(m.text); sound.chime(); }),
      L.on('toast', (m) => this.hud.toast(m.text)),
      L.on('dropped', (m) => this.hud.toast(`${this.nameOf(m.id)} lost connection. A bot is playing as them now.`)),
    ];

    sound.setScene('street', 0.5);
    hud.show();
    hud.cinematic(true);
    hud.prompt(this.isHost ? 'Hold SPACE to skip' : null);
    this.updateTeam();
  }

  nameOf(id) {
    const r = this.roster.find((x) => x.id === id);
    return r ? r.name : '???';
  }

  // ----------------------------------------------------------- network --
  onSnapshot(m) {
    this.nightT = m.T;
    for (const row of m.ps) {
      const a = this.avatars.get(row[0]);
      if (!a) continue;
      if (!a.isMe) a.apply(row);
      else { a.taken = (row[5] & 8) !== 0; a.flags = row[5]; }
    }
    const [bolt, chain, angle, lock, strain] = m.d;
    this.door = { bolt: !!bolt, chain: !!chain, angle, lock, strain };
    if (this.mode !== 'intro') this.world.door.set({ bolt: !!bolt, chain: !!chain, angle });
    // the people in the corridor (and him)
    const seen = new Set();
    for (const row of m.a) {
      seen.add(row[0]);
      let a = this.actors.get(row[0]);
      if (!a) {
        a = new Actor(row, this);
        this.actors.set(row[0], a);
        a.root.visible = this.mode !== 'intro';
      } else a.apply(row);
    }
    for (const [id, a] of this.actors) if (!seen.has(id)) { a.dispose(); this.actors.delete(id); }
    this.power = m.pw;
    this.flicker = m.fl;
    if (this.mode !== 'intro') {
      this.world.setSwing('50D', m.sw[0]);
      this.world.setSwing('stair', m.sw[1]);
      this.world.liftDoors.setOpen(m.lf);
    }
    this.hunt = m.h;
    this.updateTeam();
  }

  updateTeam() {
    this.hud.team(this.roster.map((r) => {
      const a = this.avatars.get(r.id);
      return { name: r.name, me: r.id === this.me, bot: r.bot, out: a && a.taken };
    }));
  }

  // where a sound comes from, and whether the door is between you and it
  heard(x, y, z) {
    const camIn = inside(this.camera.position.x, this.camera.position.z) || this.mode === 'peep';
    const outside = z < -0.1;
    return { pos: { x, y, z }, muffled: camIn && outside && this.door.angle < 0.05 };
  }

  onFx(m) {
    if (this.mode === 'intro') return;
    const D = { x: DOOR_POS.x, y: 1.2, z: DOOR_POS.z };
    const W = this.world;
    switch (m.k) {
      case 'knock': sound.knock(KNOCKS[m.p] || KNOCKS.him, D, m.p === 'heavy' ? 1.4 : 1); W.door.hit(m.p === 'heavy' ? 1.5 : 1); break;
      case 'bang': sound.bang(D); W.door.hit(2); break;
      case 'rattle': sound.rattle(D); break;
      case 'force': sound.force(D); W.door.hit(3); break;
      case 'bolt': sound.bolt(m.on); break;
      case 'chain': sound.chain(m.on); break;
      case 'locked': sound.locked(); if (this.nearDoor()) this.hud.toast('It\'s locked. Turn the deadbolt first.'); break;
      case 'open': sound.creak(0.7); break;
      case 'close': sound.creak(0.4, 1.2); break;
      case 'shut': sound.shut(); break;
      case 'strain': sound.chain(false); sound.bang(D); W.door.hit(2); break;
      case 'snap': sound.snap(); W.door.hit(3); break;
      case 'break': sound.splinter(); W.door.hit(3); break;
      case 'ding': { const h = this.heard(9.2, 2.2, -2.4); sound.ding(h.pos, h.muffled); sound.liftDoors(h.pos, h.muffled); break; }
      case 'stairs': { const h = this.heard(m.far ? 22 : 21.8, 1.2, -1.3); sound.slam(h.pos, h.muffled, m.far ? 0.6 : 1); break; }
      case 'neighbourDoor': { const h = this.heard(2.65, 1.2, -2.4); sound.slam(h.pos, h.muffled, 0.35); break; }
      case 'window': sound.tapGlass({ x: 7.3, y: 1.6, z: 8.55 }); if (this.mode === 'play') setTimeout(() => this.hud.say('', '*tap tap tap* ...on the bedroom window. Fifty floors up.'), 900); break;
      case 'steps': {
        for (let i = 0; i < 8; i++) setTimeout(() => { const h = this.heard(6 - i * 0.6, 0.1, -1.3); sound.step('carpet', 1.4, h.pos, h.muffled); }, i * 520);
        break;
      }
      case 'power':
        sound.power(m.on);
        if (!m.on) this.hud.flash('');
        break;
      case 'check': sound.creak(0.5, 0.8); break;
      case 'spotted': if (m.id === this.me) { sound.stinger(1); this.hud.flash('RUN'); } break;
    }
  }

  onSay(m) {
    if (m.id) {
      // a friend (or you)
      const r = this.roster.find((x) => x.id === m.id);
      this.hud.say(r ? r.name : '???', m.text);
      const a = this.avatars.get(m.id);
      if (a) a.rig.talk(1.3);
      if (r && r.bot && m.voice === 'friend') voice.say(m.text, 'friend', { salt: r.color, sex: r.color % 2 ? 'f' : 'm' });
      return;
    }
    const a = m.a != null ? this.actors.get(m.a) : null;
    if (a) a.rig.talk(1.6);
    const who = m.who === '???' ? (this.cutscene && !this.cutscene.done ? 'The man in the coat' : 'Through the door') : m.who;
    this.hud.say(who, m.text, m.voice === 'him' || m.voice === 'whisper');
    voice.say(m.text, m.voice, { salt: m.a || 0 });
  }

  onOpened(m) {
    if (m.outcome === 'gone' && this.nearDoor(3)) {
      setTimeout(() => this.hud.toast('There\'s nobody there.'), 600);
      sound.setTension(0.35, 3);
    }
  }

  onBreach() {
    sound.stinger(1.2);
    sound.setTension(1, 1);
    this.hud.flash('HIDE');
    this.hud.objective('He\'s inside. Hide, and hold your breath when he\'s close [SPACE].');
    this.fear = 1;
  }

  onTaken(m) {
    if (m.id === this.me) { this.startTaken(); return; }
    const a = this.avatars.get(m.id);
    this.hud.toast(`He took ${this.nameOf(m.id)}.`);
    if (a) sound.gasp();
    if (this.viewing && this.viewing.id === m.id) this.viewing = null;
    this.updateTeam();
  }

  onHid(m) {
    this.pendingHide = -1;
    this.hiding = m.s;
    this.mode = 'hide';
    const h = HIDES[m.s];
    this.hideLook = { yaw: 0, pitch: 0 };
    this.p.breath = BREATH_MAX;
    this.hud.prompt(`[E] Come out   [SPACE] Hold your breath`);
    sound.creak(0.4, 1.1);
    this.hud.toast(h.kind === 'bed' ? 'You squeeze under the bed.' : `You hide in ${h.name}.`);
  }

  onUnhid(m) {
    this.hiding = -1;
    this.p.x = m.x;
    this.p.z = m.z;
    this.p.holding = false;
    if (this.mode === 'hide') this.mode = 'play';
    this.hud.prompt(null);
  }

  send() {
    const p = this.p;
    this.link.send({
      t: 'st', x: +p.x.toFixed(2), z: +p.z.toFixed(2), ry: +p.ry.toFixed(2), rx: +p.rx.toFixed(2),
      mv: p.mv, fl: p.flash ? 1 : 0, pp: this.mode === 'peep' ? 1 : 0, br: p.holding ? 1 : 0, cr: p.crouch ? 1 : 0,
    });
  }

  nearDoor(r = 2.4) {
    return Math.hypot(DOOR.use.x - this.p.x, DOOR.use.z - this.p.z) < r && this.mode !== 'taken' && this.mode !== 'spectate';
  }

  // --------------------------------------------------------------- tick --
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const inp = this.input, p = this.p, cam = this.camera;

    if ((this.mode === 'play') && inp.locked) {
      const s = 0.0022 * this.settings.sens;
      p.ry -= inp.mx * s;
      p.rx -= inp.my * s * (this.settings.invert ? -1 : 1);
      p.rx = Math.max(-1.45, Math.min(1.45, p.rx));
    } else if ((this.mode === 'peep' || this.mode === 'hide') && inp.locked) {
      const L = this.mode === 'peep' ? this.peepLook : this.hideLook;
      const s = 0.0016 * this.settings.sens;
      L.yaw = Math.max(-0.45, Math.min(0.45, L.yaw - inp.mx * s));
      L.pitch = Math.max(-0.3, Math.min(0.3, L.pitch - inp.my * s * (this.settings.invert ? -1 : 1)));
    }

    switch (this.mode) {
      case 'intro': this.updateIntro(dt); break;
      case 'play': this.move(dt); if (this.mode === 'play') this.interact(); break;
      case 'peep': this.updatePeep(dt); break;
      case 'hide': this.updateHide(dt); break;
      case 'taken': this.updateTaken(dt); break;
      case 'spectate': this.updateSpectate(); break;
    }
    if (this.mode !== 'intro' && this.mode !== 'taken' && this.mode !== 'spectate') this.talkKeys();

    for (const a of this.avatars.values()) a.update(dt);
    for (const a of this.actors.values()) {
      a.root.visible = this.mode !== 'intro';
      a.update(dt, this.t);
    }

    this.sendT -= dt;
    if (this.sendT <= 0 && (this.mode === 'play' || this.mode === 'peep' || this.mode === 'hide')) {
      this.sendT = 0.05;
      this.send();
    }

    // camera
    const H = this.hiding >= 0 ? HIDES[this.hiding] : null;
    if (this.mode === 'intro') {
      // placed by the cutscene
    } else if (this.mode === 'peep') {
      const pc = this.world.door.peepCam;
      cam.position.copy(pc.position);
      cam.rotation.set(this.peepLook.pitch, this.peepLook.yaw, 0);
    } else if (this.mode === 'hide' && H) {
      // squeezed in, peering out: a narrower view
      cam.fov = lerp(cam.fov, 56, 1 - Math.exp(-dt * 6));
      cam.updateProjectionMatrix();
      cam.position.set(H.eye.x, H.eye.y + Math.sin(this.t * 1.3) * (p.holding ? 0.001 : 0.006), H.eye.z);
      cam.rotation.set(this.hideLook.pitch, H.eye.ry + this.hideLook.yaw, 0);
    } else if (this.mode === 'spectate' && this.viewing) {
      const v = this.viewing;
      const hide = v.hidden && v.hide >= 0 ? HIDES[v.hide] : null;
      if (hide) { cam.position.set(hide.eye.x, hide.eye.y, hide.eye.z); cam.rotation.set(0, hide.eye.ry, 0); }
      else { cam.position.set(v.x, EYE, v.z); cam.rotation.set(v.rx * 0.8, v.ry, 0); }
    } else if (this.mode !== 'taken') {
      if (cam.fov !== 72) { cam.fov = lerp(cam.fov, 72, Math.min(1, dt * 8)); if (Math.abs(cam.fov - 72) < 0.1) cam.fov = 72; cam.updateProjectionMatrix(); }
      const speed = Math.hypot(p.vx, p.vz);
      const bob = this.mode === 'play' ? Math.abs(Math.sin((p.stepDist / (p.mv === 2 ? 0.9 : 0.7)) * Math.PI)) * 0.035 * Math.min(1, speed / 2.5) : 0;
      p.eye = lerp(p.eye, p.crouch ? 1.05 : EYE, 1 - Math.exp(-dt * 10));
      cam.position.set(p.x, p.eye + bob, p.z);
      cam.rotation.set(p.rx, p.ry, 0);
    }
    cam.updateMatrixWorld();
    sound.setListener(cam);
    sound.update(dt);

    this.updateWorld(dt);
    this.updateMood(dt);
    this.updateFx(dt);
    this.updateHud();
    inp.endFrame();
  }

  updateWorld(dt) {
    const W = this.world;
    if (this.mode === 'intro') { W.update(dt, this.t, {}); return; }
    W.setHour(NIGHT_START_HOUR + this.nightT / 60);
    // power and the corridor's stutter
    this.powerShown = lerp(this.powerShown ?? 1, this.power, 1 - Math.exp(-dt * (this.power > this.powerShown ? 3 : 12)));
    W.setPower(this.powerShown, this.powerShown);
    const cam = this.camera;
    const flashOn = this.p.flash && (this.mode === 'play' || this.mode === 'hide');
    W.update(dt, this.t, {
      flicker: this.flicker,
      flash: flashOn ? { on: true, pos: cam.position.clone().add(new THREE.Vector3(0.12, -0.18, 0).applyEuler(cam.rotation)), dir: cam.getWorldDirection(this.tmp).clone() } : null,
    });
    // hiding spots he's looking into
    const checking = this.hunt ? this.hunt[0] : -1;
    for (let i = 0; i < HIDES.length; i++) W.setHideOpen(i, i === checking ? this.hunt[1] : 0);
    sound.setDoorMuffle(this.door.angle < 0.05 ? 1 : 0.2);
  }

  // music, heartbeat, his breathing, whispers in the dark
  updateMood(dt) {
    if (this.mode === 'intro') return;
    let tension = 0.08 + Math.min(0.15, this.nightT / NIGHT_LEN * 0.15);
    let him = null;
    for (const a of this.actors.values()) if (a.him) him = a;
    const anyone = [...this.actors.values()].some((a) => Math.hypot(a.x - DOOR.stand.x, a.z - DOOR.stand.z) < 1.2);
    if (anyone) tension = Math.max(tension, 0.32);
    if (him && !him.hunting && Math.hypot(him.x - DOOR.stand.x, him.z - DOOR.stand.z) < 1.2) tension = Math.max(tension, 0.45 + (100 - this.door.lock) / 300);
    if (this.power < 0.5) tension = 1;
    if (Math.abs(tension - sound.tension) > 0.04) sound.setTension(tension, 2.5);
    // him, inside
    const cam = this.camera.position;
    if (him && him.hunting) {
      const d = Math.hypot(him.x - cam.x, him.z - cam.z);
      sound.setLoop('him', { x: him.x, y: 1.7, z: him.z }, 0.25);
      him.stepAcc = (him.stepAcc || 0) + him.speed * dt;
      if (him.stepAcc > 0.85) { him.stepAcc = 0; sound.heavyStep({ x: him.x, y: 0.1, z: him.z }); }
      this.heartT -= dt;
      if (d < 7 && this.mode !== 'taken' && this.mode !== 'spectate' && this.heartT <= 0) {
        this.heartT = 0.35 + d * 0.12;
        sound.heartbeat(1 + (7 - d) / 4, 0.4 + (7 - d) / 9);
      }
      this.fear = Math.max(this.fear, clamp01((6 - d) / 6));
    } else sound.setLoop('him', null, 0);
    // the corridor: people walking on carpet, heard through the door
    for (const a of this.actors.values()) {
      if (a.hunting || a.anim !== 'walk') continue;
      a.stepAcc = (a.stepAcc || 0) + a.speed * dt;
      if (a.stepAcc > 0.75) {
        a.stepAcc = 0;
        const h = this.heard(a.x, 0.1, a.z);
        if (a.z < 0) sound.step('carpet', a.him ? 1.6 : 1.2, h.pos, h.muffled);
      }
    }
    // alone in a dark room, you start hearing things
    this.whisperT -= dt;
    if (this.whisperT <= 0) {
      this.whisperT = 25 + Math.random() * 30;
      if (this.power < 0.5 || (this.nightT > 240 && Math.random() < 0.4)) sound.whisper();
    }
    this.fear = Math.max(0, this.fear - dt * 0.25);
  }

  updateFx(dt) {
    const fx = this.fx;
    if (this.mode !== 'intro') {
      fx.bars = 0;
      fx.peep = this.mode === 'peep';
    }
    fx.fear = this.fear * 0.8;
    fx.exposure = this.mode === 'peep' ? 1.15 : lerp(1.0, 0.8, 1 - (this.powerShown ?? 1));
    fx.saturation = this.power < 0.5 ? 0.6 : 1;
    if (this.mode !== 'taken' && this.mode !== 'intro') { fx.staticAmt = lerp(fx.staticAmt, 0, 1 - Math.exp(-dt * 6)); fx.glitch = lerp(fx.glitch, 0, 1 - Math.exp(-dt * 6)); }
    fx.fade = lerp(fx.fade, this.fadeTo, 1 - Math.exp(-dt * 2.5));
  }

  updateHud() {
    const hud = this.hud, p = this.p;
    if (this.mode === 'intro') return;
    const h = NIGHT_START_HOUR + this.nightT / 60;
    hud.clock(h);
    const playing = this.mode === 'play' || this.mode === 'peep' || this.mode === 'hide';
    hud.lock(playing && (this.door.lock < 99.5 || this.forcing()) ? this.door.lock / 100 : null);
    hud.breath(this.mode === 'hide' ? p.breath / BREATH_MAX : null);
    hud.stamina(this.mode === 'play' && p.stamina < STAMINA_MAX - 0.05 ? p.stamina / STAMINA_MAX : null);
    hud.flashlight(p.flash && playing);
    hud.talk(playing && this.nearDoor(2.6) && this.hiding < 0 ? TALK : null);
    hud.crosshair(this.mode === 'play');
  }

  forcing() {
    for (const a of this.actors.values()) if (a.him && a.knocking && this.door.lock < 100) return true;
    return false;
  }

  render() {
    const fx = this.fx;
    fx.time = this.t;
    const ground = this.mode === 'intro' && this.cutscene.scene === 'ground';
    const camera = this.mode === 'peep' || (this.mode === 'intro' && fx.peep) ? this.world.door.peepCam : this.camera;
    if (camera === this.world.door.peepCam) {
      camera.aspect = this.camera.aspect;
      camera.fov = 110;
      if (this.mode === 'peep') camera.rotation.set(0.1 + this.peepLook.pitch, this.peepLook.yaw, 0);
      else camera.rotation.set(0.14, 0, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    }
    this.post.render((target) => (ground ? this.ground : this.world).render(this.renderer, camera, target), fx);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------- cutscene --
  updateIntro(dt) {
    const pos = this.cutscene.update(dt);
    this.camera.position.copy(pos);
    this.camera.lookAt(this.cutscene.lookAt);
    this.fx.fade = lerp(this.fx.fade, 0, 1 - Math.exp(-dt * 1.5));
    if (this.cutscene.scene === 'ground') this.ground.update(this.t);
    if (this.isHost) {
      this.skipHeld = this.input.down('Space') ? (this.skipHeld || 0) + dt : 0;
      if (this.skipHeld > 0.6 && !this.skipSent) {
        this.skipSent = true;
        this.link.send({ t: 'skip' });
      }
    }
  }

  // the cutscene's over: you're standing inside, and he's knocking
  beginPlay() {
    if (this.mode !== 'intro') return;
    this.cutscene.finish();
    this.mode = 'play';
    this.fx.bars = 0;
    this.fx.peep = false;
    this.fadeTo = 0;
    const W = this.world;
    W.setHour(NIGHT_START_HOUR);
    W.liftDoors.setOpen(0);
    this.roster.forEach((r, i) => this.avatars.get(r.id).place(START_SPOTS[i % 4].x, START_SPOTS[i % 4].z, START_SPOTS[i % 4].ry));
    const p = this.p;
    p.rx = 0;
    sound.setScene('apt', 1);
    sound.stopMuzak(0.2);
    this.hud.cinematic(false);
    this.hud.banner(null);
    this.hud.prompt(null);
    this.hud.objective('He\'s at the door. Look through the peephole first. He won\'t stop knocking until you answer.');
    this.hud.toast('[WASD] walk  [SHIFT] run  [E] use  [F] phone light  [1-3] talk through the door');
    setTimeout(() => this.hud.objective('Survive until 6 AM. Keep the deadbolt locked. Only open the door all the way for someone you\'re sure about.'), 45000);
  }

  // ---------------------------------------------------------- walking --
  move(dt) {
    const inp = this.input, p = this.p;
    const f = (inp.down('KeyW') || inp.down('ArrowUp') ? 1 : 0) - (inp.down('KeyS') || inp.down('ArrowDown') ? 1 : 0);
    const s = (inp.down('KeyD') || inp.down('ArrowRight') ? 1 : 0) - (inp.down('KeyA') || inp.down('ArrowLeft') ? 1 : 0);
    const len = Math.hypot(f, s);
    if (inp.hit('KeyC') || inp.hit('ControlLeft')) p.crouch = !p.crouch;
    const sprint = (inp.down('ShiftLeft') || inp.down('ShiftRight')) && f > 0 && !p.tired && !p.crouch;
    if (sprint && len > 0) {
      p.stamina = Math.max(0, p.stamina - dt);
      if (p.stamina <= 0) p.tired = true;
    } else {
      p.stamina = Math.min(STAMINA_MAX, p.stamina + dt * STAMINA_REGEN);
      if (p.tired && p.stamina > 1.5) p.tired = false;
    }
    const speed = p.crouch ? 1.2 : sprint && len > 0 ? SPRINT : WALK;
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
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    resolveCircle(p, PLAYER_R, PLAYER_SOLIDS);
    const moved = Math.hypot(p.x - ox, p.z - oz);
    const v = moved / dt;
    p.mv = v > 3 ? 2 : v > 0.3 ? 1 : 0;
    const stride = p.mv === 2 ? 0.9 : 0.7;
    const before = Math.floor(p.stepDist / stride);
    p.stepDist += moved;
    const tile = p.x > 4.66 && p.x < 6.54 && p.z > 0 && p.z < 2.94;
    if (Math.floor(p.stepDist / stride) !== before) sound.step(tile ? 'marble' : 'wood', (p.mv === 2 ? 1.2 : 0.7) * (p.crouch ? 0.4 : 1));
  }

  // what you're looking at that you can use
  targets() {
    const p = this.p, W = this.world, out = [];
    const nearDoor = Math.hypot(DOOR.use.x - p.x, DOOR.use.z - p.z) < 1.9;
    if (nearDoor) {
      const d = this.door;
      const closed = d.angle < 0.03;
      out.push({ kind: 'peep', pos: W.door.part('peephole', new THREE.Vector3()), r: 0.08, label: '[E] Look through the peephole' });
      out.push({ kind: 'bolt', pos: W.door.part('bolt', new THREE.Vector3()), r: 0.07, label: closed ? (d.bolt ? '[E] Unlock the deadbolt' : '[E] Lock the deadbolt') : 'Close the door to use the deadbolt' });
      const chainPos = W.door.part('chain', new THREE.Vector3());
      chainPos.x -= 0.1;
      out.push({ kind: 'chain', pos: chainPos, r: 0.085, label: d.angle > DOOR.chainAngle + 0.02 ? 'Close the door to reach the chain' : d.chain ? '[E] Take the chain off' : '[E] Put the chain on' });
      const handle = W.door.part('handle', new THREE.Vector3());
      let label;
      if (!closed) label = '[E] Close the door';
      else if (d.bolt) label = 'Locked. Turn the deadbolt (above the handle) to open it';
      else label = d.chain ? '[E] Open the door (on the chain)' : '[E] Open the door';
      out.push({ kind: 'handle', pos: handle, r: 0.09, label });
      // the whole door, as a fallback for opening and closing
      out.push({ kind: 'handle', pos: W.door.part('peephole', new THREE.Vector3()).setY(1.2), r: 0.32, label, weak: true });
    }
    for (const h of HIDES) {
      if (Math.hypot(h.enter.x - p.x, h.enter.z - p.z) > 1.7) continue;
      const pos = new THREE.Vector3(h.enter.x + (h.eye.x - h.enter.x) * 0.55, h.kind === 'bed' ? 0.45 : 1.2, h.enter.z + (h.eye.z - h.enter.z) * 0.55);
      const label = h.kind === 'bed' ? '[E] Crawl under the bed' : `[E] ${HIDE_VERB[h.kind]} ${h.name}`;
      out.push({ kind: 'hide', id: h.id, pos, r: h.kind === 'bed' ? 0.6 : 0.5, label });
    }
    return out;
  }

  interact() {
    const inp = this.input, p = this.p;
    if (inp.hit('KeyF')) {
      p.flash = !p.flash;
      sound.burst(sound.ready ? sound.now : 0, 0.02, sound.sfx, 0.15, 'bandpass', 3000, 3);
    }
    const cam = this.camera;
    const o = cam.position, dir = cam.getWorldDirection(this.tmp);
    let best = null, bestScore = Infinity;
    for (const c of this.targets()) {
      const v = c.pos.clone().sub(o);
      const along = v.dot(dir);
      if (along < 0.1 || along > 2.0) continue;
      const perp = v.clone().sub(dir.clone().multiplyScalar(along)).length();
      const r = c.r + along * 0.02;
      if (perp > r) continue;
      const score = perp / r + (c.weak ? 1 : 0);
      if (score < bestScore) { bestScore = score; best = c; }
    }
    this.hud.prompt(best ? best.label : null);
    if (!best || !inp.hit('KeyE')) return;
    const d = this.door;
    switch (best.kind) {
      case 'peep':
        this.mode = 'peep';
        this.peepLook = { yaw: 0, pitch: 0 };
        this.hud.prompt('[E] Step back');
        sound.burst(sound.now, 0.05, sound.sfx, 0.06, 'lowpass', 600, 1);
        break;
      case 'bolt': this.link.send({ t: 'door', a: 'bolt' }); break;
      case 'chain': this.link.send({ t: 'door', a: 'chain' }); break;
      case 'handle': this.link.send({ t: 'door', a: d.angle < 0.03 ? 'open' : 'close' }); break;
      case 'hide':
        if (this.pendingHide < 0) {
          this.pendingHide = best.id;
          this.link.send({ t: 'hide', s: best.id });
          setTimeout(() => { if (this.pendingHide === best.id) this.pendingHide = -1; }, 1500);
        }
        break;
    }
  }

  talkKeys() {
    const inp = this.input;
    if (!this.nearDoor(2.6) || this.hiding >= 0) return;
    for (let k = 0; k < 3; k++) if (inp.hit(`Digit${k + 1}`) || inp.hit(`Numpad${k + 1}`)) this.link.send({ t: 'talk', k });
  }

  updatePeep() {
    const inp = this.input;
    this.hud.prompt('[E] Step back');
    if (inp.hit('KeyE') || inp.hit('KeyS') || inp.hit('Space') || inp.rightClicks > 0) {
      this.mode = 'play';
      this.hud.prompt(null);
    }
  }

  updateHide(dt) {
    const inp = this.input, p = this.p;
    const wantHold = inp.down('Space');
    if (wantHold && p.breath > 0) {
      if (!p.holding) { p.holding = true; sound.breath(false, 0.6); }
      p.breath = Math.max(0, p.breath - dt);
      if (p.breath <= 0) {
        // can't hold it any more
        p.holding = false;
        sound.gasp();
        this.link.send({ t: 'gasp' });
        p.breath = -1.5;
      }
    } else {
      if (p.holding) { p.holding = false; sound.breath(true, 0.8); }
      p.breath = Math.min(BREATH_MAX, p.breath + dt * (p.breath < 0 ? 1 : 0.8));
      this.breathT = (this.breathT || 0) - dt;
      if (this.breathT <= 0 && this.power < 0.5) { this.breathT = 2.6; sound.breath(true, 0.35); }
    }
    if (inp.hit('KeyE')) this.link.send({ t: 'unhide' });
  }

  // ------------------------------------------------------- taken -------
  startTaken() {
    this.mode = 'taken';
    this.hiding = -1;
    this.cine = { t: 0 };
    sound.jumpscare();
    voice.stop();
    const cam = this.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    fwd.y = 0;
    fwd.normalize();
    const s = this.scare;
    s.position.set(cam.position.x + fwd.x * 0.42, cam.position.y - 1.72, cam.position.z + fwd.z * 0.42);
    s.rotation.y = Math.atan2(-fwd.x, -fwd.z);
    s.visible = true;
    this.hud.prompt(null);
    this.hud.objective(null);
    this.p.flash = false;
  }

  updateTaken(dt) {
    const c = this.cine, t = (c.t += dt);
    const s = this.scare;
    s.userData.rig.update(dt, { pose: 'reach', speed: 0, lookYaw: 0, lookPitch: 0.2, tilt: Math.sin(t * 30) * 0.15, possessed: true });
    this.camera.rotation.z = (Math.random() - 0.5) * 0.1 * (1 - span(t, 0.8, 1.5));
    this.fx.glitch = t < 1.6 ? 1 : 0;
    this.fx.staticAmt = t < 1.3 ? (Math.random() < 0.3 ? 0.5 : 0.08) : span(t, 1.3, 1.7);
    this.fear = 1;
    if (t > 1.7) { s.visible = false; this.fadeTo = 1; }
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
    const list = [...this.avatars.values()].filter((a) => a.alive && !a.isMe);
    list.sort((a, b) => (a.bot === b.bot ? 0 : a.bot ? 1 : -1));
    if (!list.length) { this.viewing = null; this.hud.prompt(null); return; }
    let i = list.indexOf(this.viewing);
    if (i < 0) i = 0;
    else if (this.input.clicks > 0 || this.input.hit('Space')) i = (i + 1) % list.length;
    this.viewing = list[i];
    this.hud.prompt(`Watching ${this.viewing.name}. Click to switch.`);
  }

  // morning
  dawn() {
    this.mode = 'over';
    this.fx.fadeColor = 0xf2e6d0;
    this.fadeTo = 0.7;
    this.hud.banner('6:00 AM', 'The sun comes up. The knocking stops.');
    sound.setTension(0, 3);
  }

  dispose() {
    for (const f of this.off) f();
    sound.quiet();
    voice.stop();
    this.cutscene.finish();
    for (const a of this.avatars.values()) a.root.removeFromParent();
    for (const a of this.actors.values()) a.dispose();
    this.scare.removeFromParent();
    this.world.setPower(1, 1);
  }
}
