// Three days and two nights at Cinder Peak, run by the hosting player's
// browser. It keeps the story moving (who's where, what everyone has to do
// next, what dispatch says, what Wade does), owns everything shared (the
// trapdoor, the door, the generator, the things you carry) and decides who
// he catches. Clients move their own characters and report where they are.
// No DOM or three.js here, so tests run it in Node.

import { makeRng } from '../shared/rng.js';
import { INTRO_LEN, SNAP_EVERY, REACH } from '../shared/config.js';
import { CAB_Y, HATCH, BEDS, SPOTS, START_SPOTS, PLACES, KEY_HOOK, floorAt, inCab, upTop, hasSignal, Solids, HATCH_WALL, DOOR_WALL, UP_STAIRS, UNDER_HATCH, INTO_CAB, UP_LADDER, CATWALK_LOOP, OUTSIDE_DOOR, TREELINE, TRAIL, ROAD, WATCH_SPOT, TO_STAIRS, PAST_CAMERA, INTO_TREES } from '../shared/layout.js';
import { solidBoxes } from '../shared/forest.js';
import { START_ITEMS } from '../shared/items.js';
import { SEGMENTS, NARRATION, DISPATCH, WADE as LINES, ASK, WORDS, TEXTS, ENDINGS, RADIO_LINES, SHOUTS } from '../shared/story.js';
import { terrainH } from '../shared/terrain.js';
import { Wade } from './wade.js';
import { later, runTimers } from './timers.js';

const r2 = (v) => Math.round(v * 100) / 100;
const dist = (a, b) => Math.hypot(a.x - b.x, (a.y ?? 0) - (b.y ?? 0), a.z - b.z);
const onGround = (p) => p.y < 0.8 && !p.truck;
const ground = (x, z) => [x, terrainH(x, z), z];

export class Match {
  // roster: [{ id, name, color }]; send(to, msg): to is a player id or null for everyone
  constructor({ seed, roster, send, start = 0 }) {
    this.seed = seed;
    this.send = send;
    this.rng = makeRng(`${seed}:host`);
    this.t = 0;
    this.ticks = 0;
    this.over = false;
    this.players = roster.map((r, i) => ({
      id: r.id, name: r.name, color: r.color, i,
      x: START_SPOTS[i % 4].x, y: 0, z: START_SPOTS[i % 4].z, ry: START_SPOTS[i % 4].ry, rx: 0,
      st: 'in', carry: null, bed: -1, truck: false, fl: false, zoom: false, finder: false, mv: 0, cr: false, tEnd: null, read: new Set(),
    }));
    this.items = new Map();
    this.nextItem = 1;
    for (const [kind, x, y, z, state] of START_ITEMS) this.addItem(kind, x, y, z, state);
    this.hatch = { open: 0, target: 0, bolt: false, lift: 0, hp: 100, slamT: 0 };
    this.door = { angle: 0, target: 0, bolt: false };
    this.gen = { on: false, fuel: 1, pulls: 0, need: 3 };
    this.light = true;
    this.stove = false;
    this.cut = false;
    this.tank = true;
    this.finder = 0;
    this.mark = null;
    this.smoke = null;
    this.word = this.rng.pick(WORDS);
    this.wrongWord = this.rng.pick(WORDS.filter((w) => w !== this.word));
    this.flags = {};
    this.obj = [];
    this.ask = null;
    this.askId = 1;
    this.radioBusy = 0;
    this.texts = [];
    this.wade = new Wade(this);
    this.solids = new Solids(solidBoxes());
    this.seg = 0;
    this.segT = 0;
    this.timeScale = 1;
    this.clock = SEGMENTS[0].from;
    this.hold = 0;
    this.endAt = null;
    this.startSeg = start;
  }

  emit(msg) { this.send(null, msg); }
  player(id) { return this.players.find((p) => p.id === id); }
  get alive() { return this.players.filter((p) => p.st === 'in'); }
  get segId() { return SEGMENTS[this.seg].id; }
  isDark() { const h = ((this.clock % 24) + 24) % 24; return h > 21.0 || h < 5.3; }
  we(text) {
    const solo = this.players.length === 1;
    return text.replace(/\{We\}/g, solo ? 'I' : 'We').replace(/\{we\}/g, solo ? 'I' : 'we').replace(/\{us\}/g, solo ? 'me' : 'us').replace(/\{as\}/g, solo ? 'as a volunteer fire lookout' : 'as volunteer fire lookouts').replace(/\{word\}/g, this.word).replace(/\{wrong\}/g, this.wrongWord);
  }

  // ------------------------------------------------------------ items --
  addItem(kind, x, y, z, state = 0) {
    const it = { id: `i${this.nextItem++}`, kind, x, y, z, holder: null, state, hidden: false };
    this.items.set(it.id, it);
    return it;
  }
  itemOf(p) { return p.carry ? this.items.get(p.carry) : null; }
  item(kind) { for (const it of this.items.values()) if (it.kind === kind) return it; return null; }
  delivered() {
    let n = 0;
    for (const it of this.items.values()) if (it.kind === 'box' && !it.holder && inCab(it.x, it.y, it.z)) n++;
    return n;
  }

  // ------------------------------------------------------- objectives --
  setObjectives(list) {
    this.obj = list.map((o) => ({ n: 0, done: false, ...o }));
    this.emit({ t: 'obj', list: this.obj });
  }
  addObjective(o) {
    if (this.obj.some((x) => x.id === o.id)) return;
    this.obj.push({ n: 0, done: false, ...o });
    this.emit({ t: 'obj', list: this.obj });
  }
  objective(id) { return this.obj.find((o) => o.id === id); }
  done(id) {
    const o = this.objective(id);
    if (!o || o.done) return false;
    o.done = true;
    if (o.of) o.n = o.of;
    this.emit({ t: 'obj', list: this.obj, done: id });
    return true;
  }
  progress(id, n) {
    const o = this.objective(id);
    if (!o || o.n === n) return;
    o.n = n;
    if (o.of && n >= o.of) this.done(id);
    else this.emit({ t: 'obj', list: this.obj });
  }
  isDone(id) { const o = this.objective(id); return !!(o && o.done); }

  // ---------------------------------------------------------- talking --
  // a line from someone at (x, y, z): Wade, the ranger, a player, dispatch
  say(who, text, extra = {}) {
    this.emit({ t: 'say', who, text: this.we(text), ...extra });
  }
  // dispatch (or whoever's on the channel) over the radio, a line at a time
  radioSay(lines, { who = 'Dispatch', voice = 'radio', then = null, b = null } = {}) {
    let at = Math.max(0, this.radioBusy - this.t);
    for (const ln of lines) {
      const text = this.we(ln).replace(/\{b\}/g, String(b ?? '').padStart(3, '0'));
      later(this, at, () => { if (!this.over) this.emit({ t: 'say', who, text, voice, radio: true }); });
      at += 1.6 + text.length * 0.055;
    }
    this.radioBusy = this.t + at;
    if (then) later(this, at, then);
  }
  // a question for whoever's near (x, y, z) (or, on the radio, whoever's at it)
  question(who, opts, { at = null, r = 30, radio = false, timeout = 30, then }) {
    const id = this.askId++;
    this.ask = { id, who, opts, at, r, radio, until: this.t + timeout, then };
    this.emit({ t: 'ask', id, who, opts, at, r, radio, timeout });
    return id;
  }
  closeAsk(k, p) {
    const a = this.ask;
    if (!a) return;
    this.ask = null;
    this.emit({ t: 'asked', id: a.id, k, by: p ? p.id : null });
    a.then(k, p);
  }
  text(list) {
    for (const [from, text] of list) this.emit({ t: 'text', from, text: this.we(text) });
  }

  // ------------------------------------------------- messages from people --
  handle(id, msg) {
    const p = this.player(id);
    if (!p || this.over) return;
    if (msg.t === 'st') {
      if (p.st !== 'in' || p.truck) return;
      if (p.bed < 0 && Number.isFinite(msg.x) && Number.isFinite(msg.z) && Number.isFinite(msg.y)) { p.x = msg.x; p.y = msg.y; p.z = msg.z; }
      if (Number.isFinite(msg.ry)) p.ry = msg.ry;
      if (Number.isFinite(msg.rx)) p.rx = msg.rx;
      p.mv = msg.mv | 0;
      p.fl = !!msg.fl;
      p.zoom = !!msg.zm && p.carry && this.items.get(p.carry)?.kind === 'binocs';
      p.finder = !!msg.fd;
      p.cr = !!msg.cr;
      if (p.finder && Number.isFinite(msg.fb)) this.finder = ((msg.fb % 360) + 360) % 360;
      return;
    }
    if (p.st !== 'in' || this.hold > this.t || this.seg === 0) return;
    switch (msg.t) {
      case 'use': this.use(p, String(msg.k || '')); break;
      case 'take': this.take(p, String(msg.id || '')); break;
      case 'drop': this.drop(p); break;
      case 'answer': if (this.ask && this.ask.id === msg.id && msg.k >= 0 && msg.k < this.ask.opts.length) this.closeAsk(msg.k | 0, p); break;
      case 'radio': this.radio(p, String(msg.k || '')); break;
      case 'mark': this.markBearing(p, Number(msg.b)); break;
      // (these can arrive just ahead of the 'st' that says you're looking
      // through the binoculars, so carrying them is enough)
      case 'spot': if (this.segId === 'day2' && this.itemOf(p)?.kind === 'binocs') this.done('spot'); break;
      case 'saw': if (this.segId === 'night1' && this.itemOf(p)?.kind === 'binocs') this.sawWatcher(); break;
      case 'shout': if (SHOUTS[msg.k]) this.emit({ t: 'say', id: p.id, who: p.name, text: SHOUTS[msg.k], voice: 'friend', pos: [r2(p.x), r2(p.y + 1.6), r2(p.z)] }); break;
      case 'phone': this.phone(p, String(msg.k || '')); break;
      case 'read': p.read.add(String(msg.k)); break;
    }
  }

  near(p, spot, extra = 0.8) {
    const s = SPOTS[spot];
    return s && Math.hypot(p.x - s.x, p.y + 1.4 - s.y, p.z - s.z) < REACH + s.r + extra;
  }

  use(p, k) {
    if (k.startsWith('bed')) { this.useBed(p, k.slice(3) | 0); return; }
    if (!SPOTS[k] || !this.near(p, k)) return;
    const H = this.hatch, D = this.door;
    const it = this.itemOf(p);
    switch (k) {
      case 'generator': {
        if (it && it.kind === 'fuel') {
          if (it.state) { it.state = 0; this.gen.fuel = 1; this.emit({ t: 'fx', k: 'pour' }); this.done('fuel'); }
          else this.toast(p, 'The can\'s empty.');
          return;
        }
        if (this.gen.on) { this.toast(p, 'It\'s running.'); return; }
        if (this.gen.fuel <= 0.01) { this.toast(p, 'It\'s out of fuel. There\'s a can in the shed.'); this.emit({ t: 'fx', k: 'pull', ok: false }); return; }
        this.gen.pulls++;
        if (this.gen.pulls >= this.gen.need) {
          this.gen.on = true;
          this.gen.pulls = 0;
          this.gen.need = 2 + Math.floor(this.rng() * 3);
          this.emit({ t: 'fx', k: 'genStart' });
          this.done('generator');
          this.done('restart');
        } else this.emit({ t: 'fx', k: 'pull', ok: false });
        return;
      }
      case 'tank':
      case 'spring': {
        if (k === 'tank' && !this.tank) { this.toast(p, 'Empty. Somebody left the tap open all night. There\'s a spring down the Lyle Creek trail.'); this.emit({ t: 'fx', k: 'tapDry' }); return; }
        if (!it || it.kind !== 'jug') { this.toast(p, 'You need something to carry the water in.'); return; }
        if (it.state) { this.toast(p, 'The jug\'s already full.'); return; }
        it.state = 1;
        this.emit({ t: 'fx', k: 'fill', at: k });
        this.done('water');
        return;
      }
      case 'hatch': case 'hatchBelow': {
        const below = k === 'hatchBelow' || p.y < CAB_Y - 0.5;
        if (H.lift > 0 && !below) {
          // slam it back down on him
          H.lift = 0; H.open = 0; H.target = 0; H.slamT = this.t;
          this.emit({ t: 'fx', k: 'slam' });
          return;
        }
        if (H.bolt) { this.emit({ t: 'fx', k: below ? 'knockHatch' : 'locked', by: p.id }); if (!below) this.toast(p, 'It\'s bolted.'); return; }
        H.target = H.target > 0.5 ? 0 : 1;
        this.emit({ t: 'fx', k: H.target ? 'hatchOpen' : 'hatchShut' });
        return;
      }
      case 'hatchBolt':
        if (H.open > 0.05) { this.toast(p, 'Shut the trapdoor first.'); return; }
        H.bolt = !H.bolt;
        this.emit({ t: 'fx', k: 'bolt', on: H.bolt });
        return;
      case 'door': {
        const inside = inCab(p.x, p.y, p.z);
        if (D.angle < 0.05 && D.bolt) {
          this.emit({ t: 'fx', k: 'locked' });
          if (inside) this.toast(p, 'It\'s bolted. The bolt\'s just above the handle.');
          return;
        }
        D.target = D.target > 0.5 ? 0 : 1.45;
        this.emit({ t: 'fx', k: D.target ? 'doorOpen' : 'doorShut' });
        return;
      }
      case 'doorBolt':
        if (!inCab(p.x, p.y, p.z)) return;
        if (D.angle > 0.05) { this.toast(p, 'Shut the door first.'); return; }
        D.bolt = !D.bolt;
        this.emit({ t: 'fx', k: 'bolt', on: D.bolt });
        return;
      case 'lightSwitch':
        this.light = !this.light;
        this.emit({ t: 'fx', k: 'switch' });
        if (!this.gen.on) this.toast(p, 'Nothing. The generator\'s off.');
        return;
      case 'stove':
        this.stove = !this.stove;
        this.emit({ t: 'fx', k: this.stove ? 'stoveOn' : 'stoveOff' });
        return;
      case 'trailcam':
        this.send(p.id, { t: 'photos', set: 'trailcam' });
        if (this.segId === 'day2' || this.flags.cameraSeen) { this.flags.cameraSeen = true; this.done('camera'); }
        return;
      case 'campPhotos':
        this.send(p.id, { t: 'photos', set: 'camp' });
        this.flags.campSeen = true;
        return;
      case 'truckDoor': this.useTruck(p, it); return;
      case 'gate':
        if (this.flags.gateTrap && !this.flags.gateSprung) this.springGate(p);
        else this.toast(p, 'The gate\'s locked. Nobody\'s here.');
        return;
    }
  }

  toast(p, text) { this.send(p.id, { t: 'toast', text }); }

  useBed(p, i) {
    const b = BEDS[i];
    if (!b) return;
    if (p.bed === i) { this.getUp(p); return; }
    if (this.players.some((q) => q.bed === i && q.st === 'in')) { this.toast(p, `Someone's in ${b.name}.`); return; }
    if (Math.hypot(p.x - b.x, p.z - b.z) > 2.6 || Math.abs(p.y - CAB_Y) > 1) return;
    if (p.carry) this.drop(p);
    p.bed = i;
    p.x = b.x; p.y = b.y; p.z = b.z;
    this.send(p.id, { t: 'bed', i });
  }

  getUp(p) {
    if (p.bed < 0) return;
    const b = BEDS[p.bed];
    p.bed = -1;
    // step off towards the middle of the cab
    const d = Math.hypot(b.x, b.z), x = b.x - (b.x / d) * 0.85, z = b.z - (b.z / d) * 0.85;
    p.x = x; p.y = CAB_Y; p.z = z;
    this.send(p.id, { t: 'tp', x, y: CAB_Y, z, ry: Math.atan2(b.x, b.z) });
  }

  take(p, id) {
    const it = this.items.get(id);
    if (!it || it.holder || it.hidden || p.carry || p.bed >= 0) return;
    if (Math.hypot(p.x - it.x, p.y + 1.2 - it.y, p.z - it.z) > REACH + 1.2) return;
    it.holder = p.id;
    p.carry = it.id;
    this.emit({ t: 'fx', k: 'pickup', kind: it.kind, id: p.id });
    if (it.kind === 'jar' && !this.flags.jarRead) { this.flags.jarRead = true; this.send(p.id, { t: 'note', text: 'Huckleberries. A note on the lid, in pencil: "FOR THE WATER. -W"' }); }
    if (it.kind === 'keys' && this.flags.keysAtCamp && !this.flags.keysFound) {
      this.flags.keysFound = true;
      this.done('keys');
      this.alertWade(p, LINES.finale[0]);
    }
  }

  drop(p) {
    const it = this.itemOf(p);
    if (!it) return;
    const fx = -Math.sin(p.ry), fz = -Math.cos(p.ry);
    let x = p.x + fx * 0.45, z = p.z + fz * 0.45;
    // in the cab, keep things out of the trapdoor's hole
    if (x > HATCH.x0 - 0.2 && x < HATCH.x1 + 0.1 && z > HATCH.z0 - 0.2 && z < HATCH.z1 + 0.2 && p.y > CAB_Y - 0.5) { x = p.x; z = p.z; }
    it.holder = null;
    it.x = x; it.z = z;
    it.y = floorAt(x, z, p.y + 0.4, this.hatch.open < 0.3);
    p.carry = null;
    this.emit({ t: 'fx', k: 'drop', kind: it.kind });
  }

  // ------------------------------------------------------------- radio --
  radioOptions() {
    if (this.seg === 0) return [];
    const o = [];
    const f = this.flags;
    if (this.segId === 'day1' && !f.checkedIn) o.push('checkin');
    if (this.smoke != null && !this.isDone('report')) o.push('smoke');
    if (f.cameraSeen && !f.cameraReported) o.push('camera');
    if (f.reliefAsked && !f.verified) o.push('verify');
    if (f.metWade && !f.revealed && !f.reliefAsked && this.segId !== 'night1') o.push('stranger');
    if (this.segId === 'night1' && f.call && !f.callAnswered && !f.fled) o.push('who');
    o.push('help');
    return o;
  }

  radio(p, k) {
    if (!this.radioOptions().includes(k)) return;
    if (!this.near(p, 'radio', 1.5)) return;
    if (this.radioBusy > this.t + 0.5) { this.toast(p, 'Wait for them to finish.'); return; }
    // fake dispatch is on the channel and someone answers by picking up the radio
    this.emit({ t: 'say', id: p.id, who: p.name, text: RADIO_LINES[k].replace('{b}', String(Math.round(this.mark ?? 0)).padStart(3, '0')), voice: 'friend', radio: true });
    this.radioBusy = this.t + 2.2;
    if (this.cut) { later(this, 2.4, () => this.radioSay(DISPATCH.dead, { who: '' })); return; }
    const f = this.flags;
    switch (k) {
      case 'who': this.answerCall(); break;
      case 'checkin':
        f.checkedIn = true;
        this.radioSay(DISPATCH.checkin, { then: () => { this.emit({ t: 'word', word: this.word }); this.done('checkin'); } });
        break;
      case 'smoke': {
        if (this.mark == null) { this.radioSay(DISPATCH.noBearing); break; }
        const b = Math.round(this.mark);
        const off = Math.abs(((b - this.smoke + 540) % 360) - 180);
        if (off <= 5) this.radioSay(DISPATCH.bearingGood, { b, then: () => this.done('report') });
        else this.radioSay(DISPATCH.bearingBad, { b });
        break;
      }
      case 'camera':
        f.cameraReported = true;
        this.radioSay(DISPATCH.camera);
        break;
      case 'verify':
        f.verified = true;
        this.done('verify');
        this.radioSay(DISPATCH.verify, { then: () => { this.reveal(); this.caughtOut(); } });
        break;
      case 'stranger':
        this.radioSay(this.seg >= 3 ? DISPATCH.verify.slice(1) : DISPATCH.camera, { then: () => { if (this.seg >= 3) this.reveal(); } });
        break;
      case 'help':
        if (this.segId === 'night2' || this.segId === 'evening2') this.radioSay(DISPATCH.revealAgain);
        else this.radioSay(['Say again, Cinder Peak? You\'re breaking up.']);
        break;
    }
  }

  reveal() {
    if (this.flags.revealed) return;
    this.flags.revealed = true;
    later(this, 1, () => this.radioSay(DISPATCH.reveal));
  }

  markBearing(p, b) {
    if (!Number.isFinite(b)) return;
    this.mark = ((b % 360) + 360) % 360;
    this.finder = this.mark;
    this.emit({ t: 'fx', k: 'mark', b: Math.round(this.mark) });
    if (this.smoke != null) {
      const off = Math.abs(((this.mark - this.smoke + 540) % 360) - 180);
      if (off <= 5) this.done('bearing');
    }
  }

  phone(p, k) {
    if (!hasSignal(p.x, p.y, p.z)) { this.toast(p, 'No signal.'); return; }
    if (k === 'call') { this.send(p.id, { t: 'toast', text: 'Calling 911... the call drops after one ring. One bar isn\'t enough for a call.' }); return; }
    if (k === 'text' && this.segId === 'day3' && !this.flags.sheriff) {
      this.flags.sheriff = true;
      this.emit({ t: 'toast', text: `${p.name} texted the sheriff's office.` });
      later(this, 5, () => {
        this.text(TEXTS.sheriff);
        this.holdoutUntil = this.t + 110;
        this.setObjectives([{ id: 'holdout', text: 'Hold out until the deputy gets here. Keep him out of the cab.', until: Math.round(110) }]);
        later(this, 14, () => this.finalAssault());
      });
    } else if (k === 'text') this.toast(p, 'Message sent.');
  }

  // --------------------------------------------------------- the truck --
  useTruck(p, it) {
    if (this.segId !== 'day3') { this.toast(p, 'We\'re not going anywhere yet.'); return; }
    if (!this.flags.keysIn) {
      if (it && it.kind === 'keys') { this.flags.keysIn = true; it.holder = null; it.hidden = true; p.carry = null; this.emit({ t: 'fx', k: 'keys' }); }
      else { this.toast(p, this.flags.keysStolen && !this.flags.keysFound ? 'Locked, and the keys are gone. He took them.' : 'Locked. The keys are on the hook in the cab.'); return; }
    }
    if (p.carry) this.drop(p);
    p.truck = true;
    p.x = PLACES.truck.x; p.y = 0.9; p.z = PLACES.truck.z;
    this.emit({ t: 'fx', k: 'truckDoor' });
    this.send(p.id, { t: 'truck' });
    this.progress('truck', this.alive.filter((q) => q.truck).length);
    if (this.alive.every((q) => q.truck)) this.escape();
  }

  escape() {
    if (this.flags.escaping) return;
    this.flags.escaping = true;
    this.emit({ t: 'escape' });
    if (this.wade.on) this.wade.retreat();
    later(this, 17, () => this.finish('escaped'));
  }

  // --------------------------------------------------------- the story --
  toSegment(i) {
    const S = SEGMENTS[i];
    this.seg = i;
    this.segT = 0;
    this.timeScale = 1;
    this.clock = S.from;
    this.flags.phase = null;
    if (this.ask) { this.emit({ t: 'asked', id: this.ask.id, k: -1 }); this.ask = null; }
    const lines = (NARRATION[S.id] || []).map((l) => this.we(l));
    const hold = 2.5 + lines.reduce((s, l) => s + 1.8 + l.length * 0.045, 0);
    this.hold = this.t + hold;
    this.emit({ t: 'seg', i, id: S.id, title: S.title, sub: S.sub, lines, clock: S.from, hold });
    this['start_' + S.id]();
  }

  // `sec` seconds after the title card and the narrator have finished
  afterCard(sec, fn) { later(this, Math.max(0, this.hold - this.t) + sec, fn); }

  // put someone somewhere (they're told, so their view jumps there too)
  place(p, x, y, z, ry = p.ry) {
    Object.assign(p, { x, y, z, ry });
    this.send(p.id, { t: 'tp', x, y, z, ry });
  }
  toBeds() {
    this.players.forEach((p, i) => {
      if (p.st !== 'in') return;
      if (p.carry) this.drop(p);
      p.truck = false;
      const b = BEDS[i % 4];
      p.bed = i % 4;
      this.place(p, b.x, b.y, b.z, 0);
      this.send(p.id, { t: 'bed', i: p.bed });
    });
  }
  wakeUp() {
    for (const p of this.alive) if (p.bed >= 0) this.getUp(p);
  }

  start_intro() {}

  // ------------------------------------------------- day one: arriving
  start_day1() {
    this.players.forEach((p, i) => this.place(p, START_SPOTS[i % 4].x, 0, START_SPOTS[i % 4].z, START_SPOTS[i % 4].ry));
    this.setObjectives([
      { id: 'supplies', text: 'Carry the two boxes of supplies up to the cab', of: 2 },
      { id: 'generator', text: 'Start the generator by the shed' },
      { id: 'checkin', text: 'Check in with dispatch on the radio' },
    ]);
    later(this, 20, () => this.text(TEXTS.day1));
  }
  step_day1() {
    this.progress('supplies', this.delivered());
    const tasks = ['supplies', 'generator', 'checkin'].every((k) => this.isDone(k));
    if (!this.flags.w1 && (this.segT > 75 || this.delivered() >= 1)) { this.flags.w1 = true; this.waterVisit(); }
    if (!this.flags.dusk && ((tasks && this.flags.w1Done) || this.segT > SEGMENTS[1].len)) {
      this.flags.dusk = this.t;
      this.timeScale = 2.5;
      later(this, 4, () => { if (!this.cut) this.radioSay(DISPATCH.goodnight); });
      this.setObjectives([{ id: 'sleep', text: 'Get some sleep', of: this.alive.length }]);
    }
    if (this.flags.dusk) this.sleepCheck('night1', 150);
  }

  // everyone in bed (or it's been long enough): on to the next part
  sleepCheck(next, timeout) {
    const inBed = this.alive.filter((p) => p.bed >= 0).length;
    this.progress('sleep', inBed);
    if (!this.flags.sleepAt && inBed === this.alive.length) this.flags.sleepAt = this.t + 2.5;
    if (this.flags.sleepAt && inBed < this.alive.length) this.flags.sleepAt = null;
    if ((this.flags.sleepAt && this.t >= this.flags.sleepAt) || this.t - this.flags.dusk > timeout) {
      this.flags.sleepAt = null;
      this.flags.dusk = null;
      this.toSegment(SEGMENTS.findIndex((s) => s.id === next));
    }
  }

  // He comes out of the woods and asks for water.
  waterVisit() {
    const w = this.wade;
    const path = TRAIL.slice(0, 4).reverse().map(([x, z]) => ground(x, z));
    const stop = ground(PLACES.tank.x - 1.6, PLACES.tank.z + 2.6);
    w.spawn(...path[0]);
    w.walk([...path, stop], { ground: true, then: () => {
      this.flags.metWade = true;
      const p = this.nearestTo(w);
      if (p) w.face(p.x, p.z);
      this.say('Stranger', LINES.hello, { a: 'wade', voice: 'wade' });
      later(this, 1.5, () => this.question('Stranger', ASK.hello, { at: [w.x, w.y + 1.6, w.z], r: 40, timeout: 30, then: (k) => {
        const reply = k >= 0 ? LINES.helloReplies[k] : LINES.helloReplies[1];
        this.say('Wade', reply, { a: 'wade', voice: 'wade' });
        later(this, 3, () => {
          this.say('Wade', LINES.askWater, { a: 'wade', voice: 'wade' });
          later(this, 1.5, () => this.question('Wade', ASK.water, { at: [w.x, w.y + 1.6, w.z], r: 40, timeout: 25, then: (k2) => {
            const choice = k2 === 0 ? 'gave' : k2 === 1 ? 'refused' : 'took';
            this.flags.water = choice;
            this.say('Wade', LINES[choice], { a: 'wade', voice: 'wade' });
            const leave = () => {
              this.say('Wade', LINES.leaving, { a: 'wade', voice: 'wade' });
              this.flags.w1Done = true;
              w.walk([...path].reverse(), { ground: true, then: () => w.despawn() });
            };
            if (choice === 'refused') later(this, 4, leave);
            else {
              later(this, 1, () => w.walk([ground(PLACES.tank.x + 0.3, PLACES.tank.z + 1.4)], { ground: true, then: () => {
                w.stand(Math.PI, 'reach');
                this.emit({ t: 'fx', k: 'fill', at: 'tank' });
                later(this, 4, leave);
              } }));
            }
          } }));
        });
      } }));
    } });
  }

  nearestTo(a) {
    let best = null, bd = Infinity;
    for (const p of this.alive) { const d = dist(p, a); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  // ------------------------------------------ the first night: a visit
  // The radio wakes you: somebody breathing on the channel. Then there's a
  // flashlight at the edge of the trees, pointed up at the cab, and a man
  // holding it. The light goes out; a minute later there are footsteps on
  // the stairs, and knocking under the trapdoor. If it isn't bolted he
  // pushes it up, and if nobody slams it he gets his head through. Then
  // he's gone, past the elk camera and into the trees.
  start_night1() {
    this.toBeds();
    this.light = false;
    this.hatch.open = this.hatch.target = this.hatch.lift = 0;
    this.door.angle = this.door.target = 0;
    this.setObjectives([{ id: 'woke', text: 'Something woke you up' }]);
    this.afterCard(2.5, () => this.nightCall());
  }

  nightCall() {
    const f = this.flags;
    f.call = this.t;
    this.radioSay(DISPATCH.nightCall, { who: 'Someone', voice: 'radioWade', then: () => {
      if (!f.watch) this.setObjectives([{ id: 'answer', text: 'Somebody\'s on the radio. Answer it? (the radio\'s on the desk)', optional: true }]);
    } });
    later(this, 30, () => this.watcher());
  }

  // somebody answered the radio at two in the morning
  answerCall() {
    const f = this.flags;
    f.callAnswered = true;
    this.done('answer');
    later(this, 2, () => this.radioSay(DISPATCH.nightCallReply, { who: 'Someone', voice: 'radioWade', then: () => later(this, 5, () => this.watcher()) }));
  }

  // a man at the edge of the trees, shining a flashlight up at the cab
  watcher() {
    const f = this.flags, w = this.wade;
    if (f.watch || this.segId !== 'night1') return;
    f.watch = this.t;
    f.visit = 'watch';
    w.spawn(...ground(...WATCH_SPOT));
    w.face(0, 0);
    w.stand(w.ry, 'torch');
    w.light = true;
    this.emit({ t: 'fx', k: 'click', x: w.x, y: w.y + 1.4, z: w.z });
    this.setObjectives([{ id: 'light', text: 'There\'s a flashlight down the road, pointed up at the tower. Look at it through the binoculars (south windows)' }]);
    later(this, 45, () => { if (f.visit === 'watch') this.watcherGone(); });
  }

  // somebody looked at him through the binoculars: he waves, slowly
  sawWatcher() {
    const f = this.flags;
    if (f.visit !== 'watch' || f.waved) return;
    f.waved = true;
    this.done('light');
    this.wade.stand(this.wade.ry, 'wave');
    later(this, 4.5, () => { if (f.visit === 'watch') this.watcherGone(); });
  }

  // three blinks, then dark; then he walks to the stairs where you can't see him
  watcherGone() {
    const f = this.flags, w = this.wade;
    f.visit = 'walk';
    w.stand(w.ry, 'torch');
    [0, 0.45, 0.9, 1.35, 1.8].forEach((at, i) => later(this, at, () => {
      w.light = i % 2 === 1;
      this.emit({ t: 'fx', k: 'click', x: w.x, y: w.y + 1.4, z: w.z });
    }));
    later(this, 2.2, () => {
      if (!f.waved) this.done('light');
      this.setObjectives([{ id: 'where', text: 'The light went out. Where did he go?' }]);
    });
    later(this, 4, () => w.walk(TO_STAIRS.map(([x, z]) => ground(x, z)), { ground: true, speed: 1.25, then: () => this.climb() }));
  }

  climb() {
    const f = this.flags, w = this.wade;
    f.visit = 'climb';
    this.setObjectives([{ id: 'bolt', text: 'Footsteps on the stairs. Bolt the trapdoor!' }]);
    w.walk([...UP_STAIRS, UNDER_HATCH], { speed: 1.0, then: () => this.atHatch() });
  }

  // under the trapdoor. Bolted: he knocks and talks and goes. Not bolted:
  // he pushes it up. Already open: there he is.
  atHatch() {
    const f = this.flags, w = this.wade, H = this.hatch;
    f.knockedAt = this.t;
    w.stand(0, 'reach');
    if (H.open > 0.5) { this.peek(); return; }
    f.visit = 'knock';
    this.knockSeq(3);
    const stage = (at, fn) => later(this, at, () => { if (f.visit === 'knock' && !this.over) fn(); });
    stage(2, () => this.say('', LINES.knock[0], { a: 'wade', voice: 'whisper' }));
    stage(5, () => { if (!H.bolt) this.nightLift(); else this.emit({ t: 'fx', k: 'thump' }); });
    stage(6, () => this.emit({ t: 'fx', k: 'thump' }));
    stage(9, () => this.say('', LINES.knock[1], { a: 'wade', voice: 'whisper' }));
    stage(14, () => this.knockSeq(4));
    stage(17, () => this.say('', LINES.knock[2], { a: 'wade', voice: 'whisper' }));
    stage(22, () => this.leaveNight());
  }

  // he pushes the trapdoor up, slowly: slam it, or he gets his head through
  nightLift() {
    const H = this.hatch, f = this.flags;
    f.visit = 'lift';
    H.lift = 0.01;
    this.emit({ t: 'fx', k: 'hatchLift' });
    this.setObjectives([{ id: 'slam', text: 'He\'s pushing the trapdoor up! Slam it shut!' }]);
    const tick = () => {
      if (this.over || f.visit !== 'lift') return;
      if (H.lift <= 0) { this.slammed(); return; }
      H.lift = Math.min(1, H.lift + 0.045);
      if (H.lift >= 1) { H.lift = 0; H.target = 1; H.open = Math.max(H.open, 0.5); this.peek(); return; }
      later(this, 0.4, tick);
    };
    tick();
  }

  slammed() {
    const f = this.flags;
    f.visit = 'slammed';
    f.slammed = true;
    this.done('slam');
    this.knockSeq(6);
    later(this, 3.5, () => this.say('', LINES.slammed, { a: 'wade', voice: 'whisper' }));
    later(this, 9, () => this.leaveNight());
  }

  // his head and shoulders up through the hole in the floor, flashlight on
  peek() {
    const f = this.flags, w = this.wade;
    if (f.visit === 'peek' || f.fled) return;
    f.visit = 'peek';
    f.peeked = true;
    this.setObjectives([{ id: 'shut', text: 'He\'s looking in at you. Shut the trapdoor on him!' }]);
    const flight = (x) => [x, CAB_Y - 2 + (2 * x) / 1.62, 0.52];
    w.light = true;
    w.walk([flight(0.6), flight(1.0)], { speed: 0.6, then: () => {
      if (f.visit !== 'peek') return;
      const p = this.nearestTo(w);
      if (p) w.face(p.x, p.z);
      w.stand(w.ry, 'torch');
      this.emit({ t: 'fx', k: 'sting' });
      this.say('', LINES.peek, { a: 'wade', voice: 'whisper' });
      later(this, 5, () => { if (f.visit === 'peek') this.leaveNight(); });
    } });
  }

  // back down the stairs, past the elk camera and into the trees
  leaveNight() {
    const f = this.flags, w = this.wade;
    if (f.fled) return;
    f.fled = true;
    f.visit = 'gone';
    w.light = false;
    const quick = !!f.peeked;
    w.walk([UNDER_HATCH, ...[...UP_STAIRS].reverse()], { speed: quick ? 2.6 : 1.3, then: () => {
      w.walk(PAST_CAMERA.map(([x, z]) => ground(x, z)), { ground: true, speed: 1.5, then: () => {
        this.emit({ t: 'fx', k: 'camFlash' });
        w.walk(INTO_TREES.map(([x, z]) => ground(x, z)), { ground: true, speed: 1.5, then: () => w.despawn() });
      } });
    } });
    if (f.water === 'gave') this.addItem('jar', -0.6, 12.0, 0.55);
    else this.tank = false;
    later(this, 5, () => this.setObjectives([
      { id: 'look', text: f.water === 'gave' ? 'He left something on the stairs' : 'He\'s gone. For now', optional: f.water !== 'gave' },
      { id: 'bolt', text: 'Shut and bolt the trapdoor' },
      { id: 'sleep', text: 'Go back to bed', of: this.alive.length },
    ]));
  }

  step_night1() {
    const f = this.flags, H = this.hatch;
    // somebody opened the trapdoor on him while he was knocking
    if (f.visit === 'knock' && H.target > 0.5) this.peek();
    // or shut it on him while he was looking in
    if (f.visit === 'peek' && H.target < 0.5 && H.lift <= 0) { this.done('shut'); this.leaveNight(); }
    if (f.visit === 'climb' && H.bolt) this.done('bolt');
    if (f.fled) {
      if (H.bolt && H.open < 0.05) this.done('bolt');
      const jar = this.item('jar');
      if (jar && jar.holder) this.done('look');
      if (this.isDone('bolt')) {
        if (!f.dusk) f.dusk = this.t;
        // everybody back in bed: one more word on the radio, then morning
        const inBed = this.alive.filter((p) => p.bed >= 0).length;
        this.progress('sleep', inBed);
        if (!f.goodnight && (inBed === this.alive.length || this.t - f.dusk > 100)) {
          f.goodnight = true;
          this.radioSay(DISPATCH.nightGoodnight, { who: 'Someone', voice: 'radioWade', then: () => later(this, 3, () => this.morning()) });
        }
      }
    }
    if (this.segT > SEGMENTS[2].len + 60) this.morning();
  }

  morning() {
    if (this.segId !== 'night1') return;
    this.flags.dusk = null;
    if (this.wade.on) this.wade.despawn();
    this.toSegment(3);
  }

  // he chased someone up the stairs and the trapdoor's shut
  hatchKnocked() {
    this.knockSeq(3);
    if (this.rng() < 0.6) later(this, 1.8, () => this.say('', this.rng.pick(LINES.knock), { a: 'wade', voice: 'whisper' }));
  }

  knockSeq(n) {
    for (let i = 0; i < n; i++) later(this, i * 0.55, () => this.emit({ t: 'fx', k: 'hatchKnock' }));
  }

  // ------------------------------------- day two: smoke and a visitor
  start_day2() {
    this.wakeUp();
    this.light = false;
    this.smoke = 58 + Math.floor(this.rng() * 60);
    const jug = this.item('jug');
    if (jug) jug.state = 0;
    this.setObjectives([
      { id: 'spot', text: 'Find the smoke with the binoculars (look east from the catwalk)' },
      { id: 'bearing', text: 'Take a bearing on it with the fire finder' },
      { id: 'report', text: 'Radio the bearing in to dispatch' },
      { id: 'camera', text: 'Look at the photos on the elk camera by the outhouse' },
      { id: 'water', text: 'Refill the water jug (it\'s empty)' },
    ]);
    this.afterCard(3, () => this.radioSay(this.flags.call ? [...DISPATCH.morning, DISPATCH.morningCall] : DISPATCH.morning));
    later(this, 40, () => this.text(TEXTS.day2));
  }
  step_day2() {
    const f = this.flags;
    if (this.isDone('report')) { this.done('spot'); this.done('bearing'); }
    const main = ['report', 'camera'].every((k) => this.isDone(k));
    if (!f.w2 && (main || this.segT > 240)) { f.w2 = true; this.reliefVisit(); }
    if (f.w2Done && (this.isDone('water') || this.segT > SEGMENTS[3].len) && !f.end2) {
      f.end2 = true;
      later(this, 6, () => this.toSegment(4));
    }
  }

  // He walks up the road and says Pruitt sent him.
  reliefVisit() {
    const w = this.wade, f = this.flags;
    const road = ROAD.slice(0, 6).reverse().map(([x, z]) => ground(x, z));
    const stop = ground(-1.5, 6.5);
    w.spawn(...road[0]);
    w.walk([...road, stop], { ground: true, speed: 1.6, then: () => {
      w.face(0, 0);
      f.metWade = true;
      this.say('Wade', LINES.relief[0], { a: 'wade', voice: 'wade' });
      later(this, 3, () => {
        this.say('Wade', LINES.relief[1], { a: 'wade', voice: 'wade' });
        later(this, 1.5, () => this.question('Wade', ASK.relief, { at: [w.x, w.y + 1.6, w.z], r: 45, timeout: 40, then: (k) => {
          if (k === 0) this.letHimUp();
          else if (k === 1) {
            f.reliefAsked = true;
            this.addObjective({ id: 'verify', text: 'Ask dispatch about him on the radio' });
            later(this, 45, () => { if (!f.verified) this.declined(LINES.declined); });
          } else this.declined(LINES.declined);
        } }));
      });
    } });
  }

  // you checked up on him: he heard, and he goes
  caughtOut() {
    const w = this.wade, f = this.flags;
    if (f.w2Done || !w.on) return;
    f.w2Done = true;
    this.say('Wade', LINES.checked[0], { a: 'wade', voice: 'wade' });
    later(this, 4, () => this.say('Wade', LINES.checked[1], { a: 'wade', voice: 'wade' }));
    later(this, 6, () => w.retreat());
  }

  declined(line) {
    const w = this.wade, f = this.flags;
    if (f.w2Done) return;
    f.w2Done = true;
    this.say('Wade', line, { a: 'wade', voice: 'wade' });
    later(this, 3, () => w.retreat());
    later(this, 20, () => this.reveal());
  }

  // up the stairs, into the cab, a look round, and out with your keys
  letHimUp() {
    const w = this.wade, f = this.flags;
    f.letIn = true;
    w.walk([...UP_STAIRS, UNDER_HATCH], { speed: 1.5, then: () => {
      const tryIn = (left) => {
        if (this.hatch.bolt) {
          if (left === 25) this.say('Wade', LINES.reliefBolted, { a: 'wade', voice: 'wade' });
          if (left <= 0) { this.declined(LINES.declined); return; }
          later(this, 1, () => tryIn(left - 1));
          return;
        }
        this.hatch.target = 1;
        later(this, 1.5, () => w.walk([...INTO_CAB, [KEY_HOOK.x, CAB_Y, KEY_HOOK.z - 0.55]], { speed: 1.2, then: () => {
          w.stand(0);
          this.say('Wade', LINES.inCab[0], { a: 'wade', voice: 'wade' });
          later(this, 4, () => {
            w.stand(Math.PI, 'reach');
            this.say('Wade', LINES.inCab[1], { a: 'wade', voice: 'wade' });
            const keys = this.item('keys');
            if (keys && !keys.holder && Math.hypot(keys.x - KEY_HOOK.x, keys.z - KEY_HOOK.z) < 0.5) { keys.hidden = true; f.keysStolen = true; }
            later(this, 4, () => {
              this.say('Wade', LINES.inCab[2], { a: 'wade', voice: 'wade' });
              f.w2Done = true;
              w.walk([[2.0, CAB_Y, 0.9], [1.62, CAB_Y, 0.52], UNDER_HATCH, ...[...UP_STAIRS].reverse()], { speed: 1.4, then: () => w.retreat() });
              later(this, 30, () => this.reveal());
            });
          });
        } }));
      };
      tryIn(25);
    } });
  }

  // ------------------------------------ the evening: fuel, and lock up
  start_evening2() {
    this.light = true;
    this.gen.fuel = Math.min(this.gen.fuel, 0.1);
    this.setObjectives([
      { id: 'fuel', text: 'Refuel the generator before dark (the can\'s in the shed)' },
      { id: 'up', text: 'Everybody back up the tower', of: this.alive.length },
      { id: 'bolt', text: 'Bolt the trapdoor' },
    ]);
    later(this, 8, () => { if (this.flags.revealed) this.radioSay(DISPATCH.revealAgain); else this.reveal(); });
  }
  step_evening2() {
    const upN = this.alive.filter((p) => upTop(p.x, p.y, p.z)).length;
    this.progress('up', upN);
    if (this.hatch.bolt && this.hatch.open < 0.05 && this.isDone('fuel')) this.done('bolt');
    if (!this.flags.end3 && ((this.isDone('fuel') && upN === this.alive.length && this.hatch.bolt) || this.segT > SEGMENTS[4].len + 40)) {
      this.flags.end3 = true;
      later(this, 3, () => this.toSegment(5));
    }
  }

  // --------------------------------------- the second night: he comes
  start_night2() {
    this.setObjectives([{ id: 'watch', text: 'Keep watch. Stay together. Don\'t go down alone.' }]);
    const f = this.flags;
    later(this, 10, () => this.text(TEXTS.night2.slice(0, 1)));
    later(this, 28, () => this.emit({ t: 'fx', k: 'treeLight', x: -22, z: -16 }));
    later(this, 58, () => {
      if (!this.gen.on) return;
      this.gen.on = false;
      this.emit({ t: 'fx', k: 'genStop' });
      this.addObjective({ id: 'restart', text: 'The generator\'s stopped. Someone could go down and restart it...', optional: true });
    });
    later(this, 100, () => this.fakeDispatch());
    later(this, 150, () => { f.climb = true; this.climbAndKnock(); });
    later(this, 205, () => this.text(TEXTS.night2.slice(1)));
    later(this, 300, () => this.cutCable());
  }
  step_night2() {
    this.stalk(45);
    if (this.segT > SEGMENTS[5].len && !this.flags.end4) { this.flags.end4 = true; this.toSegment(6); }
  }

  fakeDispatch() {
    if (this.cut) return;
    const f = this.flags;
    this.radioSay(DISPATCH.fake, { then: () => this.question('Dispatch?', ASK.fake, { radio: true, timeout: 30, then: (k, p) => {
      if (p) this.emit({ t: 'say', id: p.id, who: p.name, text: ASK.fake[k], voice: 'friend', radio: true });
      if (k === 0) {
        f.fakeExposed = true;
        later(this, 2.5, () => this.radioSay(DISPATCH.fakeWord, { who: 'Dispatch?', voice: 'radioWade' }));
      } else if (k === 1) {
        f.gateTrap = true;
        this.addObjective({ id: 'gate', text: 'Walk down the road and open the gate' });
      } else later(this, 8, () => this.radioSay(DISPATCH.fakeIgnored, { who: 'Dispatch?', voice: 'radioWade' }));
    } }) });
  }

  springGate(p) {
    const f = this.flags;
    f.gateSprung = true;
    this.done('gate');
    const w = this.wade;
    const behind = ground(PLACES.gate.x - 9, PLACES.gate.z - 6);
    w.spawn(...behind);
    w.face(p.x, p.z);
    this.say('Wade', LINES.gate, { a: 'wade', voice: 'wade' });
    this.emit({ t: 'fx', k: 'sting' });
    later(this, 1.2, () => w.hunt(p));
    f.wadeBusy = true;
  }

  // up the stairs to the trapdoor; in if it's not bolted; otherwise up the
  // ladder and round the catwalk to the door
  climbAndKnock() {
    const w = this.wade, f = this.flags;
    if (w.mode === 'hunt') { later(this, 20, () => this.climbAndKnock()); return; }
    f.wadeBusy = true;
    const start = ground(-12, 3);
    if (!w.on) w.spawn(...start);
    w.walk([ground(-5, 1.5), ...UP_STAIRS, UNDER_HATCH], { speed: 1.2, then: () => {
      w.stand(0, 'reach');
      this.knockSeq(3);
      later(this, 2, () => this.say('', this.rng.pick(LINES.knock), { a: 'wade', voice: 'whisper' }));
      later(this, 5, () => {
        if (!this.hatch.bolt) this.liftHatch(() => this.toLadder());
        else { this.knockSeq(5); later(this, 7, () => this.toLadder()); }
      });
    } });
  }

  // he pushes the trapdoor up; slam it within a few seconds or he's in
  liftHatch(otherwise) {
    const H = this.hatch, w = this.wade;
    H.lift = 0.01;
    this.emit({ t: 'fx', k: 'hatchLift' });
    const tick = (n) => {
      if (H.lift <= 0 || this.over) { otherwise(); return; }
      H.lift = Math.min(1, H.lift + 0.12);
      if (H.lift >= 1) { H.lift = 0; H.target = 1; H.open = Math.max(H.open, 0.7); this.breach(w); return; }
      later(this, 0.4, () => tick(n + 1));
    };
    tick(0);
  }

  toLadder() {
    const w = this.wade;
    w.walk([...[...UP_STAIRS].slice(-3).reverse(), ...UP_LADDER], { speed: 1.1, then: () => {
      this.emit({ t: 'fx', k: 'catwalk' });
      this.catwalkLaps(0);
    } });
  }

  catwalkLaps(n) {
    const w = this.wade;
    const loop = CATWALK_LOOP;
    const start = loop.reduce((bi, p, i) => (Math.hypot(p[0] - w.x, p[2] - w.z) < Math.hypot(loop[bi][0] - w.x, loop[bi][2] - w.z) ? i : bi), 0);
    const route = [];
    for (let i = 1; i <= 4; i++) route.push(loop[(start + i) % 4]);
    w.walk(route, { speed: 0.9, then: () => {
      // he stops and looks in at whoever's nearest the glass
      const p = this.nearestTo(w);
      if (p) w.face(p.x, p.z);
      w.stand(w.ry, 'stand');
      this.emit({ t: 'fx', k: 'tap', x: w.x, y: w.y + 1.5, z: w.z });
      this.say('', LINES.catwalk[n % LINES.catwalk.length], { a: 'wade', voice: 'whisper' });
      later(this, 4, () => {
        if (n < 1) this.catwalkLaps(n + 1);
        else this.tryDoor();
      });
    } });
  }

  tryDoor() {
    const w = this.wade;
    w.walk([OUTSIDE_DOOR], { speed: 0.9, then: () => {
      w.stand(0, 'reach');
      this.emit({ t: 'fx', k: 'rattle' });
      later(this, 1.2, () => {
        if (!this.door.bolt) { this.door.target = 1.45; this.breach(w); return; }
        this.emit({ t: 'fx', k: 'bang' });
        later(this, 3, () => {
          w.walk([[-3.1, CAB_Y, 0.3], ...[...UP_LADDER].reverse()], { speed: 1.2, then: () => { this.flags.wadeBusy = false; w.retreat(); } });
        });
      });
    } });
  }

  // he's in the cab: he takes the nearest of you and goes
  breach(w) {
    if (this.flags.inside) return;
    this.flags.inside = true;
    this.emit({ t: 'breach' });
    this.say('', LINES.breach, { a: 'wade', voice: 'whisper' });
    const victim = () => {
      let best = null, bd = Infinity;
      for (const p of this.alive) { if (!upTop(p.x, p.y, p.z)) continue; const d = dist(p, w); if (d < bd) { bd = d; best = p; } }
      return best;
    };
    const go = () => {
      const p = victim();
      if (!p) { this.flags.inside = false; this.flags.wadeBusy = false; w.retreat(); return; }
      w.hunt(p, { until: () => !upTop(p.x, p.y, p.z) });
      w.stairs = { i: UP_STAIRS.length };
    };
    if (w.mode === 'walk' || w.mode === 'hunt-climb') {
      const then = w.then;
      w.then = () => { if (then) then(); go(); };
    } else go();
  }

  // a hunt ended (he caught someone, or lost them)
  wadeDone(caught) {
    this.flags.inside = false;
    this.flags.wadeBusy = false;
    this.lastHunt = this.t;
    if (this.wade.on) this.wade.retreat();
    if (caught) this.emit({ t: 'fx', k: 'gone' });
  }

  // Anyone on the ground in the dark (or, on the last day, at all) gets
  // hunted: he comes out of the trees where you can't see him.
  stalk(after) {
    const w = this.wade, f = this.flags;
    if (this.segT < after || f.wadeBusy || w.mode === 'hunt' || w.mode === 'hunt-climb' || (this.lastHunt && this.t < this.lastHunt + 10)) return;
    const prey = this.alive.filter((p) => onGround(p) && !p.truck);
    if (!prey.length) return;
    const p = prey[0];
    if (!w.on) {
      // the treeline spot behind them, out of their sight
      let best = TREELINE[0], bs = -Infinity;
      for (const s of TREELINE) {
        const dx = s[0] - p.x, dz = s[2] - p.z, d = Math.hypot(dx, dz);
        const facing = (-Math.sin(p.ry) * dx - Math.cos(p.ry) * dz) / Math.max(1e-6, d);
        const score = -facing * 10 - Math.abs(d - 22);
        if (score > bs && Math.min(...this.alive.map((q) => Math.hypot(s[0] - q.x, s[2] - q.z))) > 12) { bs = score; best = s; }
      }
      w.spawn(...best);
      w.face(p.x, p.z);
      this.say('', this.rng.pick(LINES.hunt), { a: 'wade', voice: 'whisper' });
    }
    if (w.mode === 'walk') return;
    f.wadeBusy = true;
    w.hunt(p);
  }

  alertWade(p, line) {
    const w = this.wade;
    if (w.mode === 'hunt') return;
    const at = ground(PLACES.camp.x - 12, PLACES.camp.z + 6);
    if (!w.on) w.spawn(...at);
    w.face(p.x, p.z);
    this.say('Wade', line, { a: 'wade', voice: 'wade' });
    this.emit({ t: 'fx', k: 'sting' });
    this.flags.wadeBusy = true;
    later(this, 1, () => w.hunt(p));
  }

  cutCable() {
    if (this.cut) return;
    this.cut = true;
    this.emit({ t: 'fx', k: 'snap' });
    this.radioSay(DISPATCH.dead, { who: '' });
  }

  // ------------------------------------------- day three: getting out
  start_day3() {
    const f = this.flags;
    this.cutCable();
    this.light = false;
    if (this.wade.on) this.wade.despawn();
    f.wadeBusy = false;
    const keys = this.item('keys');
    if (f.keysStolen && keys) {
      keys.hidden = false;
      keys.holder = null;
      keys.x = PLACES.camp.x - 1.25; keys.z = PLACES.camp.z + 0.75;
      keys.y = terrainH(keys.x, keys.z) + 0.46;
      f.keysAtCamp = true;
    }
    const list = [
      { id: 'out', text: 'Get off the mountain. Two ways:' },
      { id: 'truck', text: 'Drive out: everyone into the truck', of: this.alive.length },
      { id: 'phone', text: 'Or find a phone signal and text for help (one bar, north-east corner of the catwalk)' },
    ];
    if (f.keysAtCamp) list.splice(2, 0, { id: 'keys', text: 'The truck keys are gone. Find where he lives (the Lyle Creek trail?)' });
    this.setObjectives(list);
  }
  step_day3() {
    const f = this.flags;
    // he's away from the tower at first: a chance to get to the truck, or to his camp
    if (!f.escaping && !this.holdoutUntil) this.stalk(75);
    if (this.holdoutUntil && this.t >= this.holdoutUntil && !f.rescued) {
      f.rescued = true;
      this.emit({ t: 'fx', k: 'siren' });
      this.say('Deputy', 'Sheriff\'s department! Anybody up there?', { voice: 'police', pos: [9, 1.6, 14] });
      if (this.wade.on) this.wade.retreat();
      later(this, 6, () => this.finish('rescued'));
    }
  }

  // while you wait for the deputy, he tries everything to get in
  finalAssault() {
    if (this.over || this.flags.rescued) return;
    const w = this.wade;
    if (w.mode === 'hunt') { later(this, 10, () => this.finalAssault()); return; }
    this.flags.wadeBusy = true;
    const prey = this.alive.filter((p) => onGround(p));
    if (prey.length) { if (!w.on) w.spawn(...TREELINE[0]); w.hunt(prey[0]); return; }
    if (!w.on) w.spawn(...TREELINE[2]);
    w.walk([ground(-5, 1.5), ...UP_STAIRS, UNDER_HATCH], { speed: 1.6, then: () => {
      w.stand(0, 'reach');
      this.say('', LINES.finale[1], { a: 'wade', voice: 'whisper' });
      if (!this.hatch.bolt) { this.liftHatch(() => this.pry()); return; }
      this.pry();
    } });
  }

  // he forces the bolted trapdoor; standing on it holds it down
  pry() {
    const H = this.hatch, w = this.wade;
    const tick = () => {
      if (this.over || this.flags.rescued || !w.on) return;
      const held = this.alive.some((p) => p.y > CAB_Y - 0.3 && p.x > HATCH.x0 && p.x < HATCH.x1 && p.z > HATCH.z0 - 0.1 && p.z < HATCH.z1 + 0.1);
      if (!held) H.hp -= 9;
      this.emit({ t: 'fx', k: held ? 'thump' : 'pry' });
      if (H.hp <= 0) { H.bolt = false; H.target = 1; H.open = 0.8; this.emit({ t: 'fx', k: 'splinter' }); this.breach(w); return; }
      later(this, 1, tick);
    };
    this.addObjective({ id: 'hold', text: 'He\'s forcing the trapdoor! Stand on it!' });
    tick();
  }

  // --------------------------------------------------------- the end --
  // he caught someone
  capture(p, by) {
    if (p.st !== 'in') return;
    if (p.carry) this.drop(p);
    p.st = 'taken';
    p.bed = -1;
    p.tEnd = this.clock;
    this.emit({ t: 'taken', id: p.id, by });
    if (!this.alive.length && this.endAt == null) this.endAt = this.t + 5;
    if (this.segId === 'day3') this.progress('truck', this.alive.filter((q) => q.truck).length);
    if (this.segId === 'day3' && this.alive.length && this.alive.every((q) => q.truck)) this.escape();
  }

  // someone left: they're gone from the story
  leave(id) {
    const p = this.player(id);
    if (!p) return;
    this.drop(p);
    p.st = 'gone';
    this.emit({ t: 'dropped', id });
    if (!this.alive.length && this.endAt == null) this.endAt = this.t + 1;
  }

  skipIntro() {
    if (this.seg === 0) this.t = Math.max(this.t, INTRO_LEN);
    else if (this.hold > this.t) this.hold = this.t;
  }

  finish(ending) {
    if (this.over) return;
    this.over = true;
    const E = ENDINGS[ending] || ENDINGS.taken;
    for (const p of this.players) if (p.st === 'in') p.st = ending === 'escaped' ? 'escaped' : ending === 'rescued' ? 'rescued' : p.st;
    const results = this.players.map((p) => ({ id: p.id, name: p.name, color: p.color, st: p.st, time: p.tEnd }));
    this.emit({ t: 'over', ending, title: E.title, lines: E.lines.map((l) => this.we(l)), results });
  }

  // --------------------------------------------------------------- tick --
  step(dt) {
    if (this.over) return;
    this.t += dt;
    this.ticks++;
    runTimers(this);
    if (this.seg === 0) {
      if (this.t >= INTRO_LEN) this.toSegment(this.startSeg || 1);
    } else if (this.t >= this.hold) {
      const S = SEGMENTS[this.seg];
      this.segT += dt * this.timeScale;
      if (S.len) this.clock = S.from + (S.to - S.from) * Math.min(1, this.segT / S.len);
      if (this.ask && this.t > this.ask.until) this.closeAsk(-1, null);
      this.stepWorld(dt);
      this.wade.step(dt);
      const f = this['step_' + S.id];
      if (f) f.call(this, dt);
    }
    if (this.endAt != null && this.t >= this.endAt) this.finish('taken');
    if (this.ticks % SNAP_EVERY === 0) this.emit(this.snapshot());
  }

  stepWorld(dt) {
    const H = this.hatch, D = this.door;
    H.open += Math.max(-dt * 2.2, Math.min(dt * 2.2, (H.lift > 0 ? H.lift * 0.35 : H.target) - H.open));
    D.angle += Math.max(-dt * 2.5, Math.min(dt * 2.5, D.target - D.angle));
    if (H.open > 0.05) H.bolt = false;
    // doors and the trapdoor are solid while they're shut
    const dyn = [];
    if (H.open < 0.3) dyn.push(HATCH_WALL);
    if (D.angle < 0.3) dyn.push(DOOR_WALL);
    this.solids.dynamic = dyn;
    // the generator burns its fuel through the evening
    if (this.gen.on && this.segId === 'evening2' && !this.isDone('fuel')) {
      this.gen.fuel -= dt / 200;
      if (this.gen.fuel <= 0) { this.gen.fuel = 0; this.gen.on = false; this.emit({ t: 'fx', k: 'genStop' }); }
    }
    // carried things go where their carrier goes
    for (const it of this.items.values()) {
      if (!it.holder) continue;
      const p = this.player(it.holder);
      if (p) { it.x = p.x; it.y = p.y + 1.0; it.z = p.z; }
    }
  }

  snapshot() {
    const F = (p) => (p.st === 'taken' || p.st === 'gone' ? 1 : 0) | (p.fl ? 2 : 0) | (p.cr ? 4 : 0) | (p.zoom ? 8 : 0) | (p.truck ? 16 : 0) | (p.bed >= 0 ? 32 : 0) | (p.finder ? 64 : 0);
    const H = this.hatch, D = this.door, w = this.wade;
    return {
      t: 's',
      T: r2(this.clock),
      g: this.seg,
      ps: this.players.map((p) => [p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.ry), r2(p.rx), F(p), p.carry ? this.items.get(p.carry).kind : '', p.bed]),
      it: [...this.items.values()].filter((it) => !it.hidden).map((it) => [it.id, it.kind, r2(it.x), r2(it.y), r2(it.z), it.holder || '', it.state]),
      w: [this.gen.on ? 1 : 0, this.light ? 1 : 0, r2(H.open), H.bolt ? 1 : 0, r2(D.angle), D.bolt ? 1 : 0, this.stove ? 1 : 0, this.cut ? 1 : 0, Math.round(this.finder), this.smoke ?? -1, this.tank ? 1 : 0, Math.round(H.hp)],
      a: w.on ? w.row() : null,
      ro: this.radioOptions(),
    };
  }
}

