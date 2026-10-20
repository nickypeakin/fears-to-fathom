// Friends played by the computer. They sit on the sofa, look out of the
// window, drift over to watch the door when someone knocks, say what
// everyone's thinking, and dive for a hiding place when he gets in. They
// never touch the door: that's your job. Runs on the host.

import { SPOTS, HIDES } from '../shared/layout.js';
import { walkTo, turn, yawTowards } from '../shared/nav.js';
import { FRIENDS } from '../shared/lines.js';
import { SPRINT } from '../shared/config.js';

const WATCH = [{ x: 2.7, z: 2.3 }, { x: 3.3, z: 1.7 }, { x: 1.2, z: 2.6 }];

// one of the bots says something about what's going on
export function botSay(m, kind) {
  if (m.t < (m.chatterAt || 0)) return;
  const bots = m.players.filter((p) => p.bot && p.st === 'in');
  if (!bots.length) return;
  const p = m.rng.pick(bots);
  m.chatterAt = m.t + 4;
  m.emit({ t: 'say', id: p.id, text: m.rng.pick(FRIENDS[kind]), voice: 'friend' });
}

function taken(m, i, self) {
  return m.players.some((q) => q !== self && q.st === 'in' && q.brain && q.brain.spot === i);
}

export function updateBot(m, p, dt) {
  const b = p.brain || (p.brain = { spot: -1, until: 0, seated: false, watch: -1, hideAt: 0 });

  // he's inside: hide
  if (m.hunt) {
    b.spot = -1;
    b.seated = false;
    p.pose = 'stand';
    if (p.hide >= 0) return;
    if (b.hide == null || m.players.some((q) => q !== p && q.hide === b.hide)) {
      const claimed = new Set(m.players.filter((q) => q !== p && (q.hide >= 0 || q.brain?.hide != null)).map((q) => (q.hide >= 0 ? q.hide : q.brain.hide)));
      const free = HIDES.filter((h) => !claimed.has(h.id)).sort((a, c) => Math.hypot(a.enter.x - p.x, a.enter.z - p.z) - Math.hypot(c.enter.x - p.x, c.enter.z - p.z));
      b.hide = free.length ? free[Math.min(free.length - 1, m.rng() < 0.7 ? 0 : 1)].id : null;
    }
    if (b.hide == null) return;
    const h = HIDES[b.hide];
    p.mv = 2;
    const left = walkTo(m.gridPlayers, p, h.enter.x, h.enter.z, SPRINT * 0.85, dt);
    if (left < 0.45) {
      p.hide = h.id;
      p.mv = 0;
      if (m.hunt) m.hunt.sawHide(p);
    }
    return;
  }
  if (p.hide >= 0) {
    // wait a little after he's gone before coming out
    b.outAt = b.outAt || m.t + 3 + m.rng() * 6;
    if (m.t < b.outAt) return;
    const h = HIDES[p.hide];
    p.hide = -1;
    p.x = h.enter.x; p.z = h.enter.z;
    b.outAt = 0;
    b.hide = null;
    b.until = 0;
  }

  // someone at the door: some of them come and watch
  const ev = m.event;
  if (ev && !ev.resolved && b.watch < 0 && m.rng() < dt * 0.15) {
    const i = m.rng.int(0, WATCH.length - 1);
    if (!m.players.some((q) => q.brain && q.brain.watch === i)) { b.watch = i; b.spot = -1; b.seated = false; }
  }
  if (b.watch >= 0) {
    if (!ev || ev.resolved) { b.watch = -1; b.until = 0; }
    else {
      const w = WATCH[b.watch];
      p.pose = 'stand';
      const left = walkTo(m.gridPlayers, p, w.x, w.z, 1.6, dt);
      p.mv = left > 0.3 ? 1 : 0;
      if (left < 0.3) p.ry = turn(p.ry, yawTowards(1.6 - p.x, 0 - p.z), 3 * dt);
      return;
    }
  }

  // otherwise: somewhere to sit or stand for a while
  if (b.spot < 0 || m.t > b.until) {
    let i = -1;
    for (let k = 0; k < 6; k++) {
      const c = m.rng.int(0, SPOTS.length - 1);
      if (c !== b.spot && !taken(m, c, p)) { i = c; break; }
    }
    if (i >= 0) { b.spot = i; b.seated = false; b.until = m.t + 18 + m.rng() * 30; }
  }
  if (b.spot < 0) return;
  const s = SPOTS[b.spot];
  if (b.seated) { p.x = s.x; p.z = s.z; p.ry = s.ry; p.mv = 0; return; }
  // walk up to it: sitting spots are approached from in front of the seat
  const fx = -Math.sin(s.ry), fz = -Math.cos(s.ry);
  const ax = s.pose === 'sit' ? s.x + fx * 0.62 : s.x, az = s.pose === 'sit' ? s.z + fz * 0.62 : s.z;
  p.pose = 'stand';
  const left = walkTo(m.gridPlayers, p, ax, az, 1.5, dt);
  p.mv = left > 0.2 ? 1 : 0;
  if (left < 0.25) {
    if (s.pose === 'sit') { b.seated = true; p.pose = 'sit'; p.x = s.x; p.z = s.z; }
    p.ry = s.ry;
    if (!m.event && !m.hunt && m.rng() < 0.08) botSay(m, 'calm');
  }
}
