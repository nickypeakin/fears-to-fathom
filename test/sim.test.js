// Headless check of the host simulation: whole nights with a scripted
// player and three bots. Each scripted player has a habit at the door
// (never answers, answers with the chain on, opens it wide for anyone,
// checks who it is first), and every night has to run the cutscene, bring
// knocks and visitors, resolve them, and end at dawn or with everyone gone.
// Usage: npm test

import assert from 'node:assert/strict';
import { Match } from '../public/js/host/match.js';
import { TICK, INTRO_LEN, NIGHT_LEN, PLAYER_R } from '../public/js/shared/config.js';
import { DOOR, HIDES, PLAYER_SOLIDS, ROOMS, SPOTS } from '../public/js/shared/layout.js';
import { Grid, walkTo } from '../public/js/shared/nav.js';
import { makeRng } from '../public/js/shared/rng.js';

const grid = new Grid(PLAYER_SOLIDS, PLAYER_R);

// A stand-in for a person, talking to the match exactly like a client.
//   habit 'ignore': never touches the door (he should break in eventually)
//   habit 'chain':  opens with the chain on, closes again after a look
//   habit 'wide':   unlocks, takes the chain off and opens it all the way
//   habit 'smart':  looks, opens wide only for people who aren't possessed
function fakeHuman(m, id, habit, seed) {
  const me = { x: 0, z: 0, ry: 0, rng: makeRng(seed), busy: 0, hidden: false };
  const act = (a) => m.handle(id, { t: 'door', a });
  return (dt) => {
    const p = m.player(id);
    if (p.st !== 'in' || m.phase !== 'night') return;
    if (me.x === 0) Object.assign(me, { x: p.x, z: p.z });
    // he's in: run and hide
    if (m.hunt) {
      if (p.hide >= 0) return;
      const free = HIDES.filter((h) => !m.players.some((q) => q.hide === h.id));
      const h = free.sort((a, b) => Math.hypot(a.enter.x - me.x, a.enter.z - me.z) - Math.hypot(b.enter.x - me.x, b.enter.z - me.z))[0];
      if (!h) return;
      walkTo(grid, me, h.enter.x, h.enter.z, 3.6, dt);
      m.handle(id, { t: 'st', x: me.x, z: me.z, ry: me.ry, rx: 0, mv: 2, fl: 0, br: 1 });
      if (Math.hypot(h.enter.x - me.x, h.enter.z - me.z) < 1.2) m.handle(id, { t: 'hide', s: h.id });
      return;
    }
    if (p.hide >= 0) { m.handle(id, { t: 'unhide' }); return; }
    me.x = p.x; me.z = p.z;
    const ev = m.event;
    const a = ev && m.actors.get(ev.actor);
    const atDoor = a && a.at >= a.path.length && !a.leaving;
    const goal = ev ? DOOR.use : SPOTS[0];
    walkTo(grid, me, goal.x, goal.z, 2.2, dt);
    m.handle(id, { t: 'st', x: me.x, z: me.z, ry: me.ry, rx: 0, mv: 1, fl: 0, br: 0 });
    me.busy -= dt;
    if (me.busy > 0) return;
    const d = m.door;
    const near = Math.hypot(DOOR.use.x - me.x, DOOR.use.z - me.z) < 1.5;
    if (!near) return;
    // between visitors: shut, bolt, chain
    if (!ev || !atDoor) {
      if (d.angle > 0.03) act('close');
      else if (!d.bolt) act('bolt');
      else if (!d.chain) act('chain');
      me.busy = 0.5;
      return;
    }
    if (habit === 'ignore') return;
    if (ev.t < 6 + me.rng() * 10) return;
    m.handle(id, { t: 'talk', k: me.rng.int(0, 1) });
    me.busy = 1;
    const wide = habit === 'wide' || (habit === 'smart' && ev.kind === 'visitor' && !ev.possessed);
    if (d.bolt) { act('bolt'); return; }
    if (wide && d.chain && d.angle < 0.03) { act('chain'); return; }
    if (d.angle < 0.03) { act('open'); me.busy = 3; return; }
    act('close');
    me.busy = 1;
  };
}

const habits = process.argv[2] ? [process.argv[2]] : ['ignore', 'chain', 'wide', 'smart', 'smart', 'chain'];
let failures = 0;
const tally = {};

habits.forEach((habit, n) => {
  const seed = `night-${n}-${habit}`;
  const roster = ['You', 'Maya', 'Leo', 'Nina'].map((name, i) => ({ id: `p${i}`, name, bot: i > 0, color: i }));
  const events = [];
  let crashed = null;
  const m = new Match({ seed, roster, send: (to, msg) => { if (msg.t !== 's') events.push({ at: m.nightT, ...msg }); } });
  const human = fakeHuman(m, 'p0', habit, seed);
  const LIMIT = INTRO_LEN + NIGHT_LEN + 60;
  try {
    while (!m.over && m.t < LIMIT) {
      human(TICK);
      m.step(TICK);
      if (m.ticks % 3 === 0) JSON.stringify(m.snapshot());
    }
  } catch (e) { crashed = e; }
  const count = (pred) => events.filter(pred).length;
  const over = events.find((e) => e.t === 'over');
  const line = {
    knocks: count((e) => e.t === 'fx' && (e.k === 'knock' || e.k === 'bang')),
    opened: events.filter((e) => e.t === 'opened').map((e) => e.outcome).join(','),
    breaches: events.filter((e) => e.t === 'breach').map((e) => e.reason).join(','),
    taken: count((e) => e.t === 'taken'),
    lines: count((e) => e.t === 'say'),
  };
  console.log(`${habit.padEnd(6)} | over ${over ? Math.round(over.at) + 's' : '-'}${over?.dawn ? ' (dawn)' : ''} | knocks ${line.knocks} | opened [${line.opened}] | breaches [${line.breaches}] | taken ${line.taken} | ${over ? over.results.map((r) => `${r.name}:${r.st}`).join(' ') : ''}`);
  for (const o of line.opened.split(',').filter(Boolean)) tally[o] = (tally[o] || 0) + 1;
  for (const b of line.breaches.split(',').filter(Boolean)) tally[`breach:${b}`] = (tally[`breach:${b}`] || 0) + 1;
  try {
    assert.equal(crashed, null, `the simulation crashed: ${crashed && crashed.stack}`);
    assert.ok(events.some((e) => e.t === 'go'), 'the night started after the cutscene');
    assert.ok(over, 'the night finished');
    assert.ok(line.knocks > 0, 'someone knocked');
    if (habit === 'ignore') assert.ok(line.breaches.length > 0, 'ignoring him gets you a visit');
    if (over.dawn) assert.ok(m.nightT >= NIGHT_LEN - 0.1, 'dawn comes at 6 AM');
    else assert.ok(!m.players.some((p) => !p.bot && p.st === 'in'), 'it only ends early when nobody is left');
    if (over.dawn) assert.ok(!m.hunt || m.hunt.state === 'leave', 'he is not still hunting at dawn');
  } catch (e) {
    failures++;
    console.error(`  FAIL (${habit}): ${e.message}`);
  }
});
console.log('outcomes seen:', JSON.stringify(tally));

// layout sanity: every hiding spot and room can be reached from the door
{
  for (const h of HIDES) assert.ok(grid.path(DOOR.use.x, DOOR.use.z, h.enter.x, h.enter.z), `can walk to ${h.name}`);
  for (const r of ROOMS) assert.ok(grid.path(DOOR.use.x, DOOR.use.z, r.x, r.z), `can walk to the ${r.id}`);
}

if (failures) { console.error(`${failures} night(s) failed`); process.exit(1); }
console.log('all good');
