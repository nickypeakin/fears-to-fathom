// Him, inside the apartment with the lights out. He searches room by room,
// opens wardrobes and closets and pulls back the shower curtain, looks under
// beds, chases anyone he sees, and listens for breathing. He takes one
// person and leaves, or gives up when his time runs out. Runs on the host.

import { STALKER, PLAYER_R } from '../shared/config.js';
import { HIDES, ROOMS, DOOR, los } from '../shared/layout.js';
import { walkTo, turn, yawTowards } from '../shared/nav.js';
import { HIM } from '../shared/lines.js';
import { later } from './timers.js';

export class Hunt {
  constructor(m, him, reason) {
    this.m = m;
    this.him = him;
    this.reason = reason;
    this.t = 0;
    this.state = 'rise';
    this.known = new Set();      // hiding spots he's sure about
    this.checked = new Set();
    this.checking = null;
    this.checkK = 0;
    this.rooms = m.rng.shuffle(ROOMS.map((r) => r.id));
    this.roomI = 0;
    this.target = null;
    this.lostT = 0;
    this.caught = false;
    this.lookT = 0;
    this.saidT = 6;
    him.anim = 'stand';
    him.speed = STALKER.prowl;
  }

  say(text) { this.m.say({ a: this.him.id, who: '???' }, text); }

  // can he see this player right now?
  sees(p) {
    const h = this.him;
    const dx = p.x - h.x, dz = p.z - h.z, d = Math.hypot(dx, dz);
    if (d < 1.1) return true;
    const range = p.fl ? STALKER.seeLit : STALKER.seeDark + (p.mv === 2 ? 1.5 : 0);
    if (d > range) return false;
    const fx = -Math.sin(h.ry), fz = -Math.cos(h.ry);
    if ((dx * fx + dz * fz) / d < STALKER.fov && !p.fl) return false;
    return los(h.x, h.z, p.x, p.z, true);
  }

  // a player just climbed into a hiding spot
  sawHide(p) {
    if (this.state !== 'rise' && this.sees(p)) this.known.add(p.hide);
  }

  heard(p, range = STALKER.hearBreath) {
    const h = HIDES[p.hide];
    if (!h) return;
    if (Math.hypot(h.eye.x - this.him.x, h.eye.z - this.him.z) < range) this.known.add(h.id);
  }

  step(dt) {
    const m = this.m, h = this.him;
    this.t += dt;
    if (this.state === 'rise') {
      h.anim = 'stand';
      if (this.t > STALKER.rise) { this.state = 'search'; this.say(m.rng.pick(HIM.inside)); }
      return;
    }
    if (this.state === 'leave') { this.stepLeave(dt); return; }
    if (this.t > STALKER.hunt && !this.caught && this.checking == null) {
      this.say(m.rng.pick(HIM.lose));
      this.leave();
      return;
    }
    // listening for breath from hiding places nearby
    for (const p of m.players) {
      if (p.st !== 'in' || p.hide < 0 || p.bot) continue;
      if (!p.br) this.heard(p);
    }
    // anyone in plain sight?
    if (this.state !== 'check') {
      let best = null, bd = Infinity;
      for (const p of m.players) {
        if (p.st !== 'in' || p.hide >= 0) continue;
        if (!this.sees(p)) continue;
        const d = Math.hypot(p.x - h.x, p.z - h.z);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) {
        if (this.state !== 'chase') { this.state = 'chase'; m.emit({ t: 'fx', k: 'spotted', id: best.id }); }
        this.target = best.id;
        this.lastSeen = { x: best.x, z: best.z };
        this.lostT = 0;
      }
    }
    this.saidT -= dt;
    if (this.saidT <= 0) { this.saidT = 9 + m.rng() * 6; this.say(m.rng.pick(HIM.inside)); }

    if (this.state === 'chase') this.stepChase(dt);
    else if (this.state === 'check') this.stepCheck(dt);
    else this.stepSearch(dt);
  }

  stepChase(dt) {
    const m = this.m, h = this.him;
    const p = m.player(this.target);
    if (!p || p.st !== 'in') { this.state = 'search'; return; }
    if (p.hide >= 0) {
      // ducked into somewhere while he was looking
      if (this.lostT < 0.6) this.known.add(p.hide);
      this.startCheckNear(p.x, p.z);
      return;
    }
    if (!this.sees(p)) this.lostT += dt;
    if (this.lostT > STALKER.giveUp) { this.startCheckNear(this.lastSeen.x, this.lastSeen.z); return; }
    const gx = this.lostT > 0 ? this.lastSeen.x : p.x, gz = this.lostT > 0 ? this.lastSeen.z : p.z;
    h.anim = 'reach';
    walkTo(m.gridActors, h, gx, gz, STALKER.chase, dt);
    if (Math.hypot(p.x - h.x, p.z - h.z) < STALKER.catchDist) this.grab(p);
  }

  // search nearby hiding places, the known ones first
  startCheckNear(x, z) {
    const cands = HIDES.filter((s) => !this.checked.has(s.id) && Math.hypot(s.enter.x - x, s.enter.z - z) < 4);
    cands.sort((a, b) => (this.known.has(b.id) - this.known.has(a.id)) || (Math.hypot(a.enter.x - x, a.enter.z - z) - Math.hypot(b.enter.x - x, b.enter.z - z)));
    if (cands.length) this.beginCheck(cands[0].id);
    else this.state = 'search';
  }

  beginCheck(id) {
    this.state = 'check';
    this.checkId = id;
    this.checkPhase = 'walk';
    this.checkT = 0;
    this.checkSaid = false;
  }

  stepSearch(dt) {
    const m = this.m, h = this.him;
    // spots he knows about come first
    const sure = [...this.known].find((id) => !this.checked.has(id));
    if (sure != null) { this.beginCheck(sure); return; }
    const room = ROOMS.find((r) => r.id === this.rooms[this.roomI % this.rooms.length]);
    h.anim = 'walk';
    h.speed = STALKER.prowl;
    const left = walkTo(m.gridActors, h, room.x, room.z, STALKER.prowl, dt);
    if (left < 0.4) {
      // stand and look around, then pick a place to look into
      h.anim = 'stand';
      this.lookT += dt;
      h.ry += Math.sin(this.lookT * 1.7) * dt * 1.6;
      if (this.lookT > 1.8) {
        this.lookT = 0;
        this.roomI++;
        const open = room.hides.filter((id) => !this.checked.has(id));
        const pick = open.find((id) => this.known.has(id)) ?? open.find(() => m.rng() < 0.36);
        if (pick != null) this.beginCheck(pick);
      }
    }
  }

  stepCheck(dt) {
    const m = this.m, h = this.him;
    const s = HIDES[this.checkId];
    if (this.checkPhase === 'walk') {
      h.anim = 'walk';
      const left = walkTo(m.gridActors, h, s.check.x, s.check.z, STALKER.prowl * 1.2, dt);
      if (left < 0.25) { this.checkPhase = 'open'; this.checkT = 0; }
      return;
    }
    // face the spot, open it, look
    h.ry = turn(h.ry, yawTowards(s.eye.x - h.x, s.eye.z - h.z), 6 * dt);
    h.anim = s.kind === 'bed' ? 'crouch' : 'reach';
    this.checking = s.id;
    this.checkT += dt;
    if (this.checkPhase === 'open') {
      this.checkK = Math.min(1, this.checkT / 0.7);
      if (!this.checkSaid) { this.checkSaid = true; m.emit({ t: 'fx', k: 'check', s: s.id }); }
      if (this.checkT > 0.9) {
        const p = m.players.find((q) => q.st === 'in' && q.hide === s.id);
        if (p) { this.grab(p); return; }
        this.checkPhase = 'close';
        this.checkT = 0;
      }
    } else {
      this.checkK = Math.max(0, 1 - this.checkT / 0.6);
      if (this.checkT > 0.7) {
        this.checked.add(s.id);
        this.known.delete(s.id);
        this.checking = null;
        this.checkK = 0;
        this.state = 'search';
      }
    }
  }

  grab(p) {
    const m = this.m;
    if (this.caught) return;
    this.caught = true;
    this.him.anim = 'reach';
    this.say(HIM.found[0]);
    m.take(p);
    later(m, 2.4, () => {
      this.checking = null;
      this.checkK = 0;
      this.say(m.rng.pick(HIM.lose));
      this.leave();
    });
  }

  leave() {
    this.state = 'leave';
    this.checking = null;
    this.checkK = 0;
  }

  stepLeave(dt) {
    const m = this.m, h = this.him;
    h.anim = 'walk';
    const goal = { x: DOOR.stand.x, z: DOOR.stand.z - 0.6 };
    const left = walkTo(m.gridActors, h, goal.x, goal.z, STALKER.prowl * 1.3, dt);
    if (left < 0.3 || this.t > STALKER.hunt + 25) m.endHunt();
  }
}

export const CATCH_R = PLAYER_R;
