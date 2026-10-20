// One night, simulated by the hosting player's browser. It opens with the
// cutscene (everyone watches the same one), then runs the night from 8 PM
// to 6 AM: the door and its locks, who comes knocking and what they do when
// it opens, and what happens when he gets inside. Clients move their own
// characters and report where they are; the host moves bots, him and every
// visitor, and decides who gets taken. No DOM or three.js here, so tests run
// it in Node.

import { makeRng } from '../shared/rng.js';
import { INTRO_LEN, NIGHT_LEN, SNAP_EVERY, KNOCKING, PLAYER_R } from '../shared/config.js';
import { DOOR, HIDES, ROUTES, PLAYER_SOLIDS, ACTOR_SOLIDS } from '../shared/layout.js';
import { Grid, stepTowards } from '../shared/nav.js';
import { HIM, VISITORS, TALK } from '../shared/lines.js';
import { Hunt } from './stalker.js';
import { updateBot, botSay } from './bots.js';
import { later, runTimers } from './timers.js';

const round = (v) => Math.round(v * 100) / 100;
const OUTCOMES = [['gone', 0.4], ['talks', 0.35], ['possess', 0.25]];
const GENUINE = ['neighbor', 'delivery', 'super', 'police'];

// where everyone stands when the night begins, just inside the door
export const START_SPOTS = [
  { x: 1.3, z: 1.1, ry: 0 }, { x: 2.1, z: 1.3, ry: 0.2 }, { x: 1.6, z: 1.9, ry: -0.1 }, { x: 2.6, z: 1.8, ry: 0.4 },
];

export class Match {
  // roster: [{ id, name, bot, color }]; send(to, msg): to is a player id or null for everyone
  constructor({ seed, roster, send }) {
    this.seed = seed;
    this.send = send;
    this.rng = makeRng(`${seed}:host`);
    this.t = 0;
    this.ticks = 0;
    this.phase = 'intro';
    this.over = false;
    this.endAt = null;
    this.players = roster.map((r, i) => ({
      id: r.id, name: r.name, bot: !!r.bot, color: r.color,
      x: START_SPOTS[i % 4].x, z: START_SPOTS[i % 4].z, ry: START_SPOTS[i % 4].ry, rx: 0,
      st: 'in', hide: -1, peep: false, fl: false, br: false, mv: 0, pose: 'stand', tEnd: null,
    }));
    this.door = { bolt: true, chain: true, angle: 0, target: 0, lock: 100, strain: 0 };
    this.power = 1;
    this.flicker = 0;
    this.swing = { '50D': 0, stair: 0 };
    this.swingTarget = { '50D': 0, stair: 0 };
    this.lift = 0;
    this.actors = new Map();
    this.nextActor = 1;
    this.event = null;
    this.hunt = null;
    this.nextEventAt = 0;
    this.pending = [];         // visitors that will come back (possessed)
    this.used = [];            // recent visitor kinds
    this.ambientAt = 30;
    this.chatterAt = 0;
    this.quietBonus = 0;
    this.gridPlayers = new Grid(PLAYER_SOLIDS, PLAYER_R);
    this.gridActors = new Grid(ACTOR_SOLIDS, 0.28);
  }

  emit(msg) { this.send(null, msg); }
  player(id) { return this.players.find((p) => p.id === id); }
  get nightT() { return Math.max(0, this.t - INTRO_LEN); }
  // a player's name for him to use; prefers people over bots
  victimName() {
    const people = this.players.filter((p) => p.st === 'in');
    const humans = people.filter((p) => !p.bot);
    const p = this.rng.pick(humans.length ? humans : people.length ? people : this.players);
    return p ? p.name : 'friend';
  }
  fill(text, extra = {}) {
    return text.replace(/\{name\}/g, () => this.victimName()).replace(/\{self\}/g, extra.self || '');
  }

  say(who, text, opts = {}) {
    this.emit({ t: 'say', ...who, text: this.fill(text, opts), voice: opts.voice || 'him' });
  }

  // ------------------------------------------------- messages from people --
  handle(id, msg) {
    const p = this.player(id);
    if (!p || p.bot || this.over) return;
    if (msg.t === 'skip' || this.phase !== 'night') return;
    switch (msg.t) {
      case 'st': {
        if (p.st !== 'in') return;
        if (Number.isFinite(msg.x) && Number.isFinite(msg.z) && p.hide < 0) { p.x = msg.x; p.z = msg.z; }
        if (Number.isFinite(msg.ry)) p.ry = msg.ry;
        if (Number.isFinite(msg.rx)) p.rx = msg.rx;
        p.mv = msg.mv | 0;
        p.fl = !!msg.fl;
        p.peep = !!msg.pp;
        p.br = !!msg.br;
        p.pose = msg.cr ? 'crouch' : 'stand';
        break;
      }
      case 'door': this.doorAction(p, msg.a); break;
      case 'talk': this.talk(p, msg.k | 0); break;
      case 'hide': {
        const h = HIDES[msg.s];
        if (!h || p.st !== 'in' || p.hide >= 0) return;
        if (Math.hypot(h.enter.x - p.x, h.enter.z - p.z) > 1.6) return;
        if (this.players.some((q) => q.hide === h.id && q.st === 'in')) { this.send(p.id, { t: 'nohide', s: h.id, text: `Someone's already in ${h.name}.` }); return; }
        if (this.hunt && this.hunt.checking === h.id) return;
        p.hide = h.id;
        p.x = h.enter.x; p.z = h.enter.z;
        if (this.hunt) this.hunt.sawHide(p);
        this.send(p.id, { t: 'hid', s: h.id });
        break;
      }
      case 'unhide': {
        if (p.hide < 0) return;
        const h = HIDES[p.hide];
        p.hide = -1;
        p.x = h.enter.x; p.z = h.enter.z;
        this.send(p.id, { t: 'unhid', x: p.x, z: p.z });
        break;
      }
      case 'gasp': if (this.hunt && p.hide >= 0) this.hunt.heard(p, 6); break;
    }
  }

  // a person dropped out: a bot carries on as them
  drop(id) {
    const p = this.player(id);
    if (!p || p.bot) return;
    p.bot = true;
    p.brain = null;
    p.peep = false;
    p.br = false;
    this.emit({ t: 'dropped', id });
  }

  skipIntro() {
    if (this.phase === 'intro') this.t = Math.max(this.t, INTRO_LEN);
  }

  // ------------------------------------------------------------ the door --
  doorAction(p, a) {
    if (p.st !== 'in' || p.hide >= 0) return;
    if (Math.hypot(DOOR.use.x - p.x, DOOR.use.z - p.z) > 2.2) return;
    const d = this.door;
    const closed = d.angle < 0.03 && d.target === 0;
    if (a === 'bolt') {
      if (!closed) { this.send(p.id, { t: 'toast', text: 'Close the door first.' }); return; }
      if (this.event && this.event.forcing && d.bolt) { this.send(p.id, { t: 'toast', text: 'The bolt won\'t turn. He\'s forcing it.' }); return; }
      d.bolt = !d.bolt;
      this.emit({ t: 'fx', k: 'bolt', on: d.bolt });
    } else if (a === 'chain') {
      if (d.angle > DOOR.chainAngle + 0.02) { this.send(p.id, { t: 'toast', text: 'Close the door to reach the chain.' }); return; }
      d.chain = !d.chain;
      if (d.chain && d.angle > 0.02) d.target = Math.min(d.target, DOOR.chainAngle);
      this.emit({ t: 'fx', k: 'chain', on: d.chain });
    } else if (a === 'open') {
      if (d.bolt) { this.emit({ t: 'fx', k: 'locked' }); return; }
      d.target = d.chain ? DOOR.chainAngle : DOOR.openAngle;
      this.emit({ t: 'fx', k: 'open' });
    } else if (a === 'close') {
      if (this.hunt) return;
      d.target = 0;
      d.strain = 0;
      this.emit({ t: 'fx', k: 'close' });
    }
  }

  stepDoor(dt) {
    const d = this.door;
    const before = d.angle;
    const rate = d.target > d.angle ? 1.8 : 3.2;
    d.angle += Math.max(-rate * dt, Math.min(rate * dt, d.target - d.angle));
    if (before > 0.02 && d.angle <= 0.02 && d.target === 0) this.emit({ t: 'fx', k: 'shut' });
  }

  get doorOpen() { return this.door.angle > 0.05; }
  get doorWide() { return this.door.angle > DOOR.chainAngle + 0.15; }

  // ------------------------------------------------------------- actors --
  spawn(look, route, opts = {}) {
    const path = ROUTES[route].map((p) => ({ ...p }));
    const a = {
      id: this.nextActor++, look, x: path[0].x, z: path[0].z, ry: Math.PI, anim: 'walk',
      possessed: !!opts.possessed, path, at: 1, speed: opts.speed || 1.25, tilt: 0, visible: true,
      self: opts.self || '', color: opts.color ?? -1,
    };
    this.actors.set(a.id, a);
    if (opts.quiet) return a;
    if (route === 'elevator') { this.liftOpenFor(4); this.emit({ t: 'fx', k: 'ding' }); }
    if (route === 'stairs') { this.swingTarget.stair = 1; later(this, 1.6, () => { this.swingTarget.stair = 0; this.emit({ t: 'fx', k: 'stairs' }); }); }
    if (route === 'across') { this.swingTarget['50D'] = 1; this.emit({ t: 'fx', k: 'neighbourDoor' }); later(this, 3, () => { this.swingTarget['50D'] = 0; }); }
    return a;
  }

  liftOpenFor(sec) {
    this.liftUntil = this.t + sec;
  }

  // send an actor back the way they came, then remove them
  dismiss(a, route) {
    a.path = [...(ROUTES[route] || ROUTES.stairs)].reverse().map((p) => ({ ...p }));
    a.at = 0;
    a.leaving = true;
    a.anim = 'walk';
    if (route === 'elevator') { this.liftOpenFor(5); this.emit({ t: 'fx', k: 'ding' }); }
  }

  stepActors(dt) {
    for (const a of [...this.actors.values()]) {
      if (a.hunting) continue;
      if (a.path && a.at < a.path.length) {
        const w = a.path[a.at];
        const left = stepTowards(a, w.x, w.z, a.speed, dt);
        a.anim = a.anim === 'hold' ? 'hold' : 'walk';
        if (left < 0.03) {
          a.at++;
          if (a.at >= a.path.length) {
            a.anim = a.carry ? 'hold' : 'stand';
            if (a.leaving) { this.actors.delete(a.id); continue; }
            a.ry = Math.PI;   // face the door (+z)
          }
        }
      } else if (!a.leaving && a.anim === 'walk') a.anim = 'stand';
      if (a.possessed && !a.leaving) a.tilt = Math.min(0.32, a.tilt + dt * 0.05);
    }
  }

  // ------------------------------------------------------------- events --
  startNight() {
    this.phase = 'night';
    this.players.forEach((p, i) => Object.assign(p, START_SPOTS[i % 4]));
    // he's already at the door when the cutscene ends
    const him = this.spawn('stalker', 'stairs', { quiet: true });
    Object.assign(him, { x: DOOR.stand.x, z: DOOR.stand.z, ry: Math.PI, at: him.path.length, anim: 'stand' });
    this.event = this.stalkerEvent(him, { gentle: true });
    this.emit({ t: 'go' });
  }

  stalkerEvent(him, { gentle = false } = {}) {
    const roll = this.rng();
    let acc = 0, outcome = 'gone';
    for (const [o, w] of OUTCOMES) { acc += w; if (roll < acc) { outcome = o; break; } }
    return { kind: 'stalker', actor: him.id, t: 0, ign: gentle ? -8 : 0, knockAt: gentle ? 1.5 : 0.5, stage: 0, outcome, resolved: false, said: 0 };
  }

  newEvent() {
    const nt = this.nightT;
    // possessed visitors that are owed come first
    if (this.pending.length && this.pending[0].at <= nt) {
      const v = this.pending.shift();
      return this.visitorEvent(v.look, true, v);
    }
    const r = this.rng();
    if (r < 0.48 || nt < 40) return this.stalkerArrives();
    const pool = GENUINE.filter((k) => !this.used.slice(-2).includes(k));
    const look = this.rng.pick(pool);
    // later in the night, some of them aren't who they look like
    const possessed = this.rng() < Math.min(0.4, 0.12 + nt / NIGHT_LEN * 0.4);
    return this.visitorEvent(look, possessed);
  }

  stalkerArrives() {
    const route = this.rng.pick(['stairs', 'elevator']);
    const him = this.spawn('stalker', route, { speed: 1.05 });
    return this.stalkerEvent(him);
  }

  visitorEvent(look, possessed, extra = {}) {
    let route = VISITORS[look].route;
    let self = '', color = -1;
    if (look === 'friend') { self = extra.self; color = extra.color; }
    const a = this.spawn(look, route, { possessed, self, color, speed: look === 'neighbor' ? 0.85 : 1.15 });
    if (look === 'delivery' && !possessed) a.carry = true;
    this.used.push(look);
    if (possessed) this.flicker = 0.35;
    return { kind: 'visitor', actor: a.id, look, possessed, t: 0, ign: 0, knockAt: 0.6, talked: 0, goAways: 0, resolved: false, route, returning: !!extra.returning };
  }

  // the stalker's event, every tick
  stepStalkerEvent(ev, dt) {
    const him = this.actors.get(ev.actor);
    if (!him) { this.endEvent(); return; }
    const atDoor = him.at >= him.path.length && !him.leaving;
    if (ev.resolved) {
      ev.after -= dt;
      if (ev.outcome === 'talks' && ev.after <= 0 && !him.leaving) {
        this.say({ a: him.id, who: '???' }, this.rng.pick(HIM.leave));
        this.dismiss(him, this.rng.pick(['stairs', 'elevator']));
      }
      if (!this.actors.has(ev.actor)) this.endEvent();
      return;
    }
    if (!atDoor) return;
    // opened (or already open): what's waiting behind it
    if (this.doorOpen && !ev.letIn) { this.resolveStalker(ev, him); return; }
    ev.ign += dt;
    const S = KNOCKING.stages;
    const stage = ev.ign < S[0] ? 0 : ev.ign < S[1] ? 1 : ev.ign < S[2] ? 2 : 3;
    if (stage !== ev.stage) {
      ev.stage = stage;
      if (stage === 1) this.say({ a: him.id, who: '???' }, this.rng.pick(HIM.knock));
      if (stage === 2) this.say({ a: him.id, who: '???' }, this.rng.pick(HIM.angry));
      if (stage === 3) { this.say({ a: him.id, who: '???' }, this.rng.pick(HIM.force)); ev.forcing = true; }
      if (stage >= 2) botSay(this, 'escalate');
    }
    ev.knockAt -= dt;
    if (ev.knockAt <= 0) {
      if (stage === 0) { this.emit({ t: 'fx', k: 'knock', p: 'him', a: him.id }); ev.knockAt = 5 + this.rng() * 2; him.knockT = 1.3; if (this.rng() < 0.3) botSay(this, 'knock'); }
      else if (stage === 1) { this.emit({ t: 'fx', k: 'knock', p: 'heavy', a: him.id }); ev.knockAt = 3.5 + this.rng(); him.knockT = 1.3; }
      else if (stage === 2) { this.emit({ t: 'fx', k: 'bang', a: him.id }); this.emit({ t: 'fx', k: 'rattle' }); ev.knockAt = 1.6 + this.rng(); him.knockT = 1.3; }
      else { this.emit({ t: 'fx', k: 'force', a: him.id }); ev.knockAt = 1.1; him.knockT = 1.0; }
      if (stage === 1 && ev.said < 3 && this.rng() < 0.5) { ev.said++; this.say({ a: him.id, who: '???' }, this.rng.pick(HIM.knock)); }
    }
    // rattling the handle: an unlocked door opens for him
    if (stage >= 2 && !this.door.bolt) {
      ev.unlockedT = (ev.unlockedT || 0) + dt;
      if (ev.unlockedT > KNOCKING.unlockedRattle) {
        this.say({ a: him.id, who: '???' }, this.rng.pick(HIM.unlocked));
        this.door.target = this.door.chain ? DOOR.chainAngle : DOOR.openAngle;
        ev.letIn = true;
      }
    }
    if (ev.letIn && this.door.angle > 0.05) {
      if (this.door.chain) this.strainChain(him, dt);
      else this.breach('unlocked', him);
      return;
    }
    if (stage === 3 && this.door.bolt) {
      this.door.lock = Math.max(0, this.door.lock - KNOCKING.force * dt);
      if (this.door.lock <= 0) {
        this.emit({ t: 'fx', k: 'break' });
        this.door.bolt = false;
        this.door.chain = false;
        this.door.target = DOOR.openAngle;
        this.breach('forced', him);
      }
    }
  }

  strainChain(a, dt) {
    const d = this.door;
    d.strain += dt;
    a.anim = 'reach';
    if (!this.strainSaid) { this.strainSaid = true; this.emit({ t: 'fx', k: 'strain' }); }
    if (d.strain > KNOCKING.chainHold) {
      d.chain = false;
      d.target = DOOR.openAngle;
      this.emit({ t: 'fx', k: 'snap' });
      this.breach('chain', a);
    }
  }

  resolveStalker(ev, him) {
    ev.resolved = true;
    ev.after = 6.5;
    const o = ev.outcome;
    this.emit({ t: 'opened', outcome: o === 'possess' ? 'gone' : o });
    if (o === 'talks') {
      him.ry = Math.PI;
      him.anim = 'stand';
      const lines = this.rng.shuffle([...HIM.talk]).slice(0, 2);
      if (this.doorWide) lines[1] = 'Aren\'t you going to invite me in?';
      this.say({ a: him.id, who: '???' }, lines[0]);
      later(this, 3.2, () => { if (this.actors.has(him.id)) this.say({ a: him.id, who: '???' }, lines[1]); });
    } else {
      // gone: he isn't there. Somewhere down the hall a door bangs shut.
      this.actors.delete(him.id);
      this.emit({ t: 'fx', k: 'stairs', far: true });
      if (o === 'possess') {
        const who = this.pickHost();
        this.pending.push({ look: who.look, at: this.nightT + 14 + this.rng() * 12, self: who.self, color: who.color });
        later(this, 4, () => this.emit({ t: 'fx', k: this.rng() < 0.5 ? 'ding' : 'neighbourDoor', far: true }));
      }
      this.endEvent();
    }
  }

  // who he goes and wears next: a taken friend if there is one
  pickHost() {
    const taken = this.players.filter((p) => p.st === 'taken' && !p.wornBy);
    if (taken.length && this.rng() < 0.6) {
      const p = this.rng.pick(taken);
      p.wornBy = true;
      return { look: 'friend', self: p.name, color: p.color };
    }
    return { look: this.rng.pick(GENUINE.filter((k) => !this.used.slice(-1).includes(k))) };
  }

  stepVisitorEvent(ev, dt) {
    const a = this.actors.get(ev.actor);
    if (!a) { this.endEvent(); return; }
    const V = VISITORS[ev.look];
    const lines = ev.possessed ? V.him : V.real;
    const atDoor = a.at >= a.path.length && !a.leaving;
    if (ev.resolved) {
      if (!this.actors.has(ev.actor)) this.endEvent();
      return;
    }
    if (!atDoor) return;
    const who = { a: a.id, who: this.visitorName(ev, a) };
    const voice = ev.possessed ? `possessed:${ev.look}` : ev.look;
    if (!ev.arrived) {
      ev.arrived = true;
      ev.knockAt = 0.3;
      later(this, 1.6, () => { if (!ev.resolved) this.say(who, this.rng.pick(lines.arrive), { voice, self: a.self }); });
      if (this.rng() < 0.5) later(this, 3.5, () => botSay(this, 'visitor'));
    }
    if (this.doorOpen) {
      if (this.doorWide) {
        if (ev.possessed) { this.breach('invited', a); return; }
        // the real thing: hand it over, say goodnight
        ev.giveT = (ev.giveT || 0) + dt;
        if (!ev.gave) {
          ev.gave = true;
          this.say(who, this.rng.pick(lines.give), { voice });
          this.emit({ t: 'opened', outcome: 'visitor' });
          later(this, 3, () => this.reward(ev.look));
          later(this, 4, () => { if (this.actors.has(a.id)) { a.carry = false; this.dismiss(a, ev.route); ev.resolved = true; } });
        }
        return;
      }
      // chained: a gap the width of a face
      ev.chainT = (ev.chainT || 0) + dt;
      if (!ev.chainSaid) {
        ev.chainSaid = true;
        this.say(who, this.rng.pick(lines.chain), { voice, self: a.self });
        this.emit({ t: 'opened', outcome: 'chain' });
      }
      if (ev.possessed && ev.chainT > 1.2) this.strainChain(a, dt);
      return;
    }
    if (ev.chainT) { ev.chainT = 0; this.door.strain = 0; a.anim = 'stand'; this.strainSaid = false; }
    ev.ign += dt;
    ev.knockAt -= dt;
    if (ev.knockAt <= 0) {
      this.emit({ t: 'fx', k: 'knock', p: ev.possessed ? 'him' : V.knock, a: a.id });
      a.knockT = 1.3;
      ev.knockAt = ev.possessed ? 6 + this.rng() * 2 : 7 + this.rng() * 3;
    }
    const patience = ev.possessed ? 55 : 32;
    if (ev.ign > patience || (!ev.possessed && ev.goAways > 0) || (ev.possessed && ev.goAways > 2)) {
      if (!ev.possessed && ev.goAways === 0) this.say(who, this.rng.pick(lines.leave), { voice });
      if (!ev.possessed) {
        // turned away at the door: he'll find them later
        if (this.rng() < 0.75) this.pending.push({ look: ev.look, at: this.nightT + 40 + this.rng() * 50, returning: true });
      } else this.quietBonus = -10;
      ev.resolved = true;
      this.dismiss(a, ev.route);
    }
  }

  visitorName(ev, a) {
    if (ev.look === 'friend') return a.self;
    return VISITORS[ev.look].name;
  }

  talk(p, k) {
    if (p.st !== 'in' || p.hide >= 0) return;
    if (Math.hypot(DOOR.use.x - p.x, DOOR.use.z - p.z) > 2.6) return;
    if ((p.talkAt || 0) > this.t) return;
    p.talkAt = this.t + 1.2;
    this.emit({ t: 'say', id: p.id, text: TALK[k] || TALK[0], voice: 'player' });
    const ev = this.event;
    const a = ev && this.actors.get(ev.actor);
    if (!a || a.at < a.path.length || a.leaving) {
      // nobody there. Usually.
      if (this.rng() < 0.12) later(this, 2, () => this.emit({ t: 'say', who: '???', text: '...', voice: 'whisper' }));
      return;
    }
    later(this, 0.9 + this.rng() * 0.6, () => {
      if (!this.actors.has(a.id) || ev.resolved) return;
      const key = ['whoIsIt', 'want', 'goAway'][k] || 'whoIsIt';
      if (ev.kind === 'stalker') {
        this.say({ a: a.id, who: '???' }, this.rng.pick(HIM[key]));
        if (k === 2) { ev.ign += 4; this.emit({ t: 'fx', k: 'knock', p: 'heavy', a: a.id }); }
      } else {
        const V = VISITORS[ev.look];
        const lines = ev.possessed ? V.him : V.real;
        this.say({ a: a.id, who: this.visitorName(ev, a) }, this.rng.pick(lines[key]), { voice: ev.possessed ? `possessed:${ev.look}` : ev.look, self: a.self });
        if (k === 2) ev.goAways++;
        else ev.ign = Math.max(0, ev.ign - 6);
      }
    });
  }

  reward(look) {
    if (look === 'super') {
      this.door.lock = 100;
      this.emit({ t: 'reward', text: 'The super fixed the deadbolt. It\'ll hold a lot longer now.' });
    } else if (look === 'police') {
      this.quietBonus += 40;
      this.emit({ t: 'reward', text: 'An officer is watching the floor. He\'ll stay away for a while.' });
    } else if (look === 'neighbor') {
      this.emit({ t: 'reward', text: 'Margaret\'s cookies. Nobody feels quite so alone.', kind: 'cookies' });
    } else if (look === 'delivery') {
      this.emit({ t: 'reward', text: 'Pizza. For a minute, it almost feels like a normal night.', kind: 'pizza' });
    }
  }

  endEvent() {
    const ev = this.event;
    this.event = null;
    this.door.strain = 0;
    this.strainSaid = false;
    this.flicker = 0;
    const nt = this.nightT;
    // the night gets busier as it goes on
    const gap = 26 - nt / NIGHT_LEN * 12 + this.rng() * 14 + this.quietBonus;
    this.quietBonus = 0;
    this.nextEventAt = nt + Math.max(8, gap);
    if (ev && ev.kind === 'stalker' && ev.stage >= 3) this.door.lock = Math.max(this.door.lock, 20);
  }

  // ------------------------------------------------------------- inside --
  breach(reason, entrant) {
    if (this.hunt) return;
    const ev = this.event;
    if (ev) ev.resolved = true;
    this.door.target = DOOR.openAngle;
    this.door.bolt = false;
    this.door.chain = false;
    this.power = 0;
    this.flicker = 0;
    this.emit({ t: 'fx', k: 'power', on: 0 });
    this.emit({ t: 'breach', reason });
    let him = entrant;
    if (entrant.look !== 'stalker') {
      // the person he was wearing falls; he's standing where they stood
      entrant.anim = 'collapse';
      entrant.body = true;
      entrant.x = 1.6; entrant.z = 0.45;
      him = this.spawn('stalker', 'stairs', { quiet: true });
      Object.assign(him, { x: 1.6, z: 0.95, ry: Math.PI, at: him.path.length, anim: 'stand' });
    }
    if (entrant.look === 'stalker') {
      // through the doorway, standing just inside
      Object.assign(him, { x: DOOR.stand.x, z: 0.55, ry: Math.PI, anim: 'stand' });
    }
    him.hunting = true;
    him.path = null;
    this.hunt = new Hunt(this, him, reason);
    later(this, 2, () => botSay(this, 'breach'));
  }

  endHunt() {
    const h = this.hunt;
    this.hunt = null;
    const him = h.him;
    this.actors.delete(him.id);
    // whoever he wore gets up and stumbles off
    for (const a of [...this.actors.values()]) {
      if (a.body) {
        a.body = false;
        a.possessed = false;
        a.tilt = 0;
        a.anim = 'stand';
        later(this, 2.5, () => { if (this.actors.has(a.id)) { this.emit({ t: 'say', a: a.id, who: a.look === 'friend' ? a.self : VISITORS[a.look].name, text: 'What... where am I?', voice: a.look }); a.x = DOOR.stand.x; a.z = DOOR.stand.z - 0.3; this.dismiss(a, 'elevator'); } });
      }
    }
    this.door.target = 0;
    this.door.lock = Math.max(40, this.door.lock);
    later(this, 3, () => {
      this.power = 1;
      this.emit({ t: 'fx', k: 'power', on: 1 });
    });
    this.event = null;
    this.endEvent();
    this.nextEventAt = this.nightT + 30 + this.rng() * 10;
  }

  take(p) {
    if (p.st !== 'in') return;
    p.st = 'taken';
    p.tEnd = this.nightT;
    p.hide = -1;
    p.peep = false;
    this.emit({ t: 'taken', id: p.id });
    later(this, 2.5, () => botSay(this, 'taken'));
  }

  // ------------------------------------------------------------ ambient --
  ambient() {
    const nt = this.nightT;
    const k = this.rng.pick(['flicker', 'flicker', 'ding', 'walkby', 'window', 'steps']);
    if (k === 'flicker') { this.flicker = 0.6; later(this, 2.5, () => { if (!this.event || !this.event.possessed) this.flicker = 0; }); }
    else if (k === 'ding') { this.liftOpenFor(3.5); this.emit({ t: 'fx', k: 'ding' }); }
    else if (k === 'walkby' && nt > 60) {
      // he walks past the door without stopping
      const him = this.spawn('stalker', 'elevator', { speed: 1.0 });
      him.path = [{ x: 9.2, z: -3.3 }, { x: 9.2, z: -1.3 }, { x: 0.8, z: -1.3 }, { x: 0.6, z: -1.6 }];
      him.walkby = true;
      later(this, 14, () => { if (this.actors.has(him.id) && !this.hunt) this.actors.delete(him.id); });
    } else if (k === 'window') this.emit({ t: 'fx', k: 'window' });
    else this.emit({ t: 'fx', k: 'steps' });
    this.ambientAt = nt + 18 + this.rng() * 22;
  }

  // --------------------------------------------------------------- tick --
  step(dt) {
    if (this.over) return;
    this.t += dt;
    this.ticks++;
    runTimers(this);
    if (this.phase === 'intro') {
      if (this.t >= INTRO_LEN) this.startNight();
      return;
    }
    const nt = this.nightT;
    this.stepDoor(dt);
    this.stepActors(dt);
    for (const a of this.actors.values()) if (a.knockT) a.knockT = Math.max(0, a.knockT - dt);
    // doors in the corridor and the elevator
    for (const k of ['50D', 'stair']) this.swing[k] += Math.max(-dt * 1.5, Math.min(dt * 1.5, this.swingTarget[k] - this.swing[k]));
    const liftTarget = this.liftUntil && this.t < this.liftUntil ? 1 : 0;
    this.lift += Math.max(-dt * 0.8, Math.min(dt * 0.8, liftTarget - this.lift));

    for (const p of this.players) if (p.bot && p.st === 'in') updateBot(this, p, dt);

    if (this.hunt) this.hunt.step(dt);
    else if (this.event) {
      this.event.t += dt;
      if (this.event.kind === 'stalker') this.stepStalkerEvent(this.event, dt);
      else this.stepVisitorEvent(this.event, dt);
    } else {
      if (nt >= this.nextEventAt && nt < NIGHT_LEN - 12) this.event = this.newEvent();
      else if (nt >= this.ambientAt) this.ambient();
    }

    // the end: dawn, or nobody left
    const people = this.players.some((p) => !p.bot) ? this.players.filter((p) => !p.bot) : this.players;
    if (this.endAt == null) {
      if (!people.some((p) => p.st === 'in')) this.endAt = this.t + 4;
      else if (nt >= NIGHT_LEN) { this.endAt = this.t + 0.1; this.dawn = true; }
    }
    if (this.endAt != null && this.t >= this.endAt) { this.finish(); return; }
    if (this.ticks % SNAP_EVERY === 0) this.emit(this.snapshot());
  }

  snapshot() {
    const d = this.door;
    const F = (p) => (p.hide >= 0 ? 1 : 0) | (p.peep ? 2 : 0) | (p.fl ? 4 : 0) | (p.st === 'taken' ? 8 : 0) | (p.pose === 'sit' ? 16 : 0) | (p.pose === 'crouch' ? 32 : 0);
    return {
      t: 's',
      T: round(this.nightT),
      ps: this.players.map((p) => [p.id, round(p.x), round(p.z), round(p.ry), round(p.rx), F(p), p.hide, p.mv, p.seat ?? -1]),
      d: [d.bolt ? 1 : 0, d.chain ? 1 : 0, round(d.angle), Math.round(d.lock), d.strain > 0 ? 1 : 0],
      a: [...this.actors.values()].map((a) => [a.id, a.look, round(a.x), round(a.z), round(a.ry), a.anim, a.possessed ? 1 : 0, round(a.tilt), a.knockT > 0 ? 1 : 0, a.self || '', a.color ?? -1, a.hunting ? 1 : 0]),
      pw: this.power,
      fl: this.flicker,
      sw: [round(this.swing['50D']), round(this.swing.stair)],
      lf: round(this.lift),
      h: this.hunt ? [this.hunt.checking ?? -1, round(this.hunt.checkK || 0)] : null,
    };
  }

  finish() {
    this.over = true;
    const results = this.players.map((p) => ({
      id: p.id, name: p.name, bot: p.bot, color: p.color, st: p.st,
      time: round(p.tEnd ?? this.nightT),
    }));
    this.emit({ t: 'over', results, dawn: !!this.dawn });
  }
}
