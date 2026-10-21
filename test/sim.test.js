// Plays the whole story on the host simulation, in Node, with scripted
// players who do what the objectives ask (and sometimes the wrong thing),
// making different choices each run. Checks every run reaches an ending
// without errors and that the pieces along the way work: supplies counted,
// the generator, the radio, Wade's visits, the trapdoor, the truck, the
// phone.
//
// usage: node test/sim.test.js

import { Match } from '../public/js/host/match.js';
import { SPOTS, CAB_Y, HATCH } from '../public/js/shared/layout.js';
import { SEGMENTS } from '../public/js/shared/story.js';
import { INTRO_LEN, TICK } from '../public/js/shared/config.js';
import { terrainH } from '../public/js/shared/terrain.js';
import { makeRng } from '../public/js/shared/rng.js';

let failures = 0;
const check = (ok, what) => { if (!ok) { failures++; console.log('  FAIL:', what); } };

function run(n, seed, plan) {
  const rng = makeRng(seed);
  const log = [];
  const roster = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: ['Ana', 'Ben', 'Cal', 'Dee'][i], color: i }));
  const m = new Match({ seed, roster, send: (to, msg) => log.push({ to, msg }) });
  const P = (i) => m.players[i];
  const st = (i, x, y, z, extra = {}) => m.handle(P(i).id, { t: 'st', x, y, z, ry: 0, rx: 0, mv: 0, ...extra });
  const at = (i, spot, dy = -1.4) => { const s = SPOTS[spot]; st(i, s.x, Math.max(terrainH(s.x, s.z), s.y + dy), s.z); };
  const use = (i, k) => m.handle(P(i).id, { t: 'use', k });
  const step = (sec) => { for (let k = 0; k < sec / TICK; k++) { m.step(TICK); if (m.over) break; } };
  const objDone = (id) => m.isDone(id);
  const answer = (k) => { if (m.ask) m.handle(P(0).id, { t: 'answer', id: m.ask.id, k }); };
  const intoCab = (i) => st(i, -1.0, CAB_Y, 1.0);
  const waitSeg = (id, max = 900) => { for (let k = 0; k < max && m.segId !== id && !m.over; k++) step(1); };
  const pumpAsks = (choose) => { if (m.ask) answer(choose(m.ask)); };

  step(INTRO_LEN + 0.5);
  check(m.segId === 'day1', `${seed}: day one starts after the intro (got ${m.segId})`);
  step(SEGMENTS[1].from ? 30 : 0);

  // ---------------- day one: supplies, generator, radio, the water visit
  const supplies = [...m.items.values()].filter((it) => it.kind === 'box');
  supplies.forEach((it, k) => {
    const i = k % n;
    st(i, it.x, 0, it.z + 0.5);
    m.handle(P(i).id, { t: 'take', id: it.id });
    check(P(i).carry === it.id, `${seed}: picked up ${it.kind}`);
    intoCab(i);
    m.handle(P(i).id, { t: 'drop' });
    step(0.3);
  });
  check(supplies.length === 2 && m.delivered() === 2, `${seed}: both boxes delivered (got ${m.delivered()})`);
  at(0, 'generator', -1.0);
  for (let k = 0; k < 6 && !m.gen.on; k++) { use(0, 'generator'); step(0.5); }
  check(m.gen.on, `${seed}: generator starts`);
  intoCab(0);
  at(0, 'radio');
  m.handle(P(0).id, { t: 'radio', k: 'checkin' });
  step(25);
  check(objDone('checkin'), `${seed}: checked in`);
  // wait for Wade, answer him
  for (let k = 0; k < 160 && !m.flags.w1Done; k++) { pumpAsks((a) => (a.opts.length === 2 ? plan.water : rng.int(0, 2))); step(1); }
  check(m.flags.w1Done, `${seed}: water visit finished (${m.flags.water})`);
  check(!!m.objective('sleep'), `${seed}: told to sleep`);
  for (let i = 0; i < n; i++) { intoCab(i); use(i, `bed${i}`); }
  waitSeg('night1', 200);
  check(m.segId === 'night1', `${seed}: night one`);

  // ---------------- night one: the radio, the light, the stairs, the trapdoor
  step(m.hold - m.t + 0.1);
  for (let k = 0; k < 20 && !m.flags.call; k++) step(1);
  check(!!m.flags.call, `${seed}: somebody on the radio`);
  if (plan.answer) {
    use(0, 'bed0');
    at(0, 'radio');
    step(12);
    check(m.radioOptions().includes('who'), `${seed}: can answer the radio`);
    m.handle(P(0).id, { t: 'radio', k: 'who' });
    step(1);
    check(m.flags.callAnswered, `${seed}: answered the radio`);
  }
  for (let k = 0; k < 60 && !m.flags.watch; k++) step(1);
  check(!!m.flags.watch && m.wade.light, `${seed}: a flashlight in the trees`);
  if (plan.binocs) {
    if (P(0).bed >= 0) use(0, `bed${P(0).bed}`);
    const b = [...m.items.values()].find((it) => it.kind === 'binocs');
    st(0, b.x, CAB_Y, b.z + 0.6);
    m.handle(P(0).id, { t: 'take', id: b.id });
    st(0, 0.5, CAB_Y, -1.6, { zm: 1 });
    m.handle(P(0).id, { t: 'saw' });
    check(m.flags.waved && m.wade.anim === 'wave', `${seed}: he waves at whoever's watching`);
    m.handle(P(0).id, { t: 'drop' });
  }
  if (plan.night === 'bolt') {
    if (P(0).bed >= 0) use(0, `bed${P(0).bed}`);
    at(0, 'hatchBolt', -1.0);
    use(0, 'hatchBolt');
    check(m.hatch.bolt, `${seed}: bolted the trapdoor before he came`);
  }
  for (let k = 0; k < 120 && !m.flags.knockedAt; k++) step(1);
  check(!!m.flags.knockedAt, `${seed}: he came up the stairs and knocked on the trapdoor`);
  if (plan.night === 'open') {
    if (P(0).bed >= 0) use(0, `bed${P(0).bed}`);
    at(0, 'hatch', -1.0);
    use(0, 'hatch');
    step(1);
    check(m.flags.peeked, `${seed}: opened the trapdoor on him`);
  }
  if (plan.night === 'slam') {
    for (let k = 0; k < 20 && !(m.hatch.lift > 0); k++) step(0.5);
    check(m.hatch.lift > 0, `${seed}: he pushes the trapdoor up`);
    if (P(0).bed >= 0) use(0, `bed${P(0).bed}`);
    st(0, (HATCH.x0 + HATCH.x1) / 2, CAB_Y, HATCH.z1 + 0.5);
    step(1);
    use(0, 'hatch');
    step(1);
    check(m.flags.slammed && !m.flags.peeked, `${seed}: slammed it on him`);
  }
  for (let k = 0; k < 60 && !m.flags.fled; k++) step(1);
  check(m.flags.fled, `${seed}: he went away`);
  if (plan.night === 'peek') check(m.flags.peeked, `${seed}: with nobody stopping him, he looked in`);
  if (plan.night === 'bolt') check(!m.flags.peeked && !m.flags.slammed, `${seed}: bolted, he only knocked`);
  for (let k = 0; k < 120 && m.wade.on; k++) step(1);
  check(!m.wade.on, `${seed}: he walked off into the trees`);
  check(log.some((e) => e.msg.t === 'fx' && e.msg.k === 'camFlash'), `${seed}: the elk camera flashed as he went`);
  if (P(0).bed >= 0) use(0, `bed${P(0).bed}`);
  if (m.hatch.target || m.hatch.open > 0.05) { at(0, 'hatch', -1.0); use(0, 'hatch'); step(1.5); }
  at(0, 'hatchBolt', -1.0);
  if (!m.hatch.bolt) use(0, 'hatchBolt');
  check(m.hatch.bolt, `${seed}: trapdoor bolted`);
  for (let i = 0; i < n; i++) { if (P(i).bed < 0) { intoCab(i); use(i, `bed${i}`); } }
  waitSeg('day2', 200);
  check(m.segId === 'day2', `${seed}: day two (got ${m.segId})`);
  check(m.tank === (m.flags.water !== 'refused' && m.flags.water !== 'took'), `${seed}: tank ${m.tank ? 'full' : 'emptied'} after "${m.flags.water}"`);

  // ---------------- day two: smoke, bearing, report, camera, water, Wade
  step(m.hold - m.t + 0.1);
  check(m.smoke != null, `${seed}: there's smoke`);
  const binocs = [...m.items.values()].find((it) => it.kind === 'binocs');
  st(0, binocs.x, CAB_Y, binocs.z + 0.6);
  m.handle(P(0).id, { t: 'take', id: binocs.id });
  st(0, 3.0, CAB_Y, 0, { zm: 1 });
  m.handle(P(0).id, { t: 'spot' });
  check(objDone('spot'), `${seed}: smoke spotted`);
  m.handle(P(0).id, { t: 'drop' });
  m.handle(P(0).id, { t: 'mark', b: m.smoke + (plan.badBearing ? 25 : 2) });
  at(0, 'radio');
  step(30);
  m.handle(P(0).id, { t: 'radio', k: 'smoke' });
  step(12);
  if (plan.badBearing) {
    check(!objDone('report'), `${seed}: a wrong bearing isn't accepted`);
    m.handle(P(0).id, { t: 'mark', b: m.smoke - 1 });
    m.handle(P(0).id, { t: 'radio', k: 'smoke' });
    step(12);
  }
  check(objDone('report'), `${seed}: bearing reported`);
  at(n > 1 ? 1 : 0, 'trailcam', -1.5);
  use(n > 1 ? 1 : 0, 'trailcam');
  check(objDone('camera'), `${seed}: camera photos seen`);
  // water: from the tank, or the spring if he emptied it
  const jug = [...m.items.values()].find((it) => it.kind === 'jug');
  st(0, jug.x, jug.y - 0.1, jug.z + 0.4);
  m.handle(P(0).id, { t: 'take', id: jug.id });
  at(0, m.tank ? 'tank' : 'spring', -1.2);
  use(0, m.tank ? 'tank' : 'spring');
  check(objDone('water') && jug.state === 1, `${seed}: jug refilled`);
  intoCab(0);
  m.handle(P(0).id, { t: 'drop' });
  for (let i = 0; i < n; i++) intoCab(i);
  // Wade walks up the road and asks to come up
  for (let k = 0; k < 200 && !m.flags.w2Done; k++) {
    if (m.ask) {
      answer(plan.relief);
      if (plan.relief === 1) { step(3); at(0, 'radio'); m.handle(P(0).id, { t: 'radio', k: 'verify' }); }
      if (plan.relief === 0) { at(0, 'hatchBolt', -1.0); use(0, 'hatchBolt'); }
    }
    step(1);
  }
  check(m.flags.w2Done, `${seed}: relief visit finished`);
  check(!!m.flags.letIn === (plan.relief === 0), `${seed}: let him in only when asked to`);
  if (plan.relief === 0) check(m.flags.keysStolen, `${seed}: he took the keys`);
  waitSeg('evening2', 200);
  check(m.segId === 'evening2', `${seed}: the evening (got ${m.segId})`);

  // ---------------- the evening: fuel and lock up
  step(m.hold - m.t + 0.1);
  const fuel = [...m.items.values()].find((it) => it.kind === 'fuel');
  st(0, fuel.x, 0, fuel.z + 0.6);
  m.handle(P(0).id, { t: 'take', id: fuel.id });
  at(0, 'generator', -1);
  use(0, 'generator');
  check(objDone('fuel'), `${seed}: refuelled`);
  m.handle(P(0).id, { t: 'drop' });
  for (let i = 0; i < n; i++) intoCab(i);
  if (m.hatch.open > 0.05) { at(0, 'hatch', -1.0); use(0, 'hatch'); step(1.5); }
  if (!m.hatch.bolt) { at(0, 'hatchBolt', -1.0); use(0, 'hatchBolt'); }
  for (let i = 0; i < n; i++) intoCab(i);
  at(0, 'doorBolt', -1.2);
  if (plan.boltDoor) use(0, 'doorBolt');
  waitSeg('night2', 200);
  check(m.segId === 'night2', `${seed}: the second night (got ${m.segId})`);

  // ---------------- the second night: stay up top, answer the fake call
  step(m.hold - m.t + 0.1);
  let taken = 0;
  for (let k = 0; k < 420 && m.segId === 'night2' && !m.over; k++) {
    if (m.ask) { at(0, 'radio'); answer(0); }
    // keep everyone in the cab (the scripted night happens around them)
    for (let i = 0; i < n; i++) if (P(i).st === 'in') st(i, -1.2 + i * 0.3, CAB_Y, 0.9);
    step(1);
  }
  taken = m.players.filter((p) => p.st === 'taken').length;
  check(m.flags.fakeExposed, `${seed}: asked the fake dispatcher for the word`);
  check(m.cut, `${seed}: the antenna's cut by morning`);
  if (plan.boltDoor) check(taken === 0, `${seed}: nobody taken with everything bolted (${taken})`);
  if (m.over) return { m, ending: lastOver(log) };
  check(m.segId === 'day3', `${seed}: day three (got ${m.segId})`);

  // ---------------- day three: the truck, or the phone
  step(m.hold - m.t + 0.1);
  const alive = () => m.players.map((p, i) => ({ p, i })).filter((x) => x.p.st === 'in');
  if (plan.out === 'phone') {
    const { i } = alive()[0];
    st(i, 3.1, CAB_Y, -3.1);
    m.handle(P(i).id, { t: 'phone', k: 'text' });
    for (let k = 0; k < 200 && !m.over; k++) {
      for (const x of alive()) st(x.i, (HATCH.x0 + HATCH.x1) / 2, CAB_Y, (HATCH.z0 + HATCH.z1) / 2);
      step(1);
    }
  } else {
    // the keys: from the hook, or from his camp
    const keys = [...m.items.values()].find((it) => it.kind === 'keys');
    const { i } = alive()[0];
    if (!keys.hidden) {
      st(i, keys.x, keys.y - 1.2, keys.z + 0.4);
      m.handle(P(i).id, { t: 'take', id: keys.id });
    }
    check(P(i).carry === keys.id, `${seed}: got the keys (${m.flags.keysAtCamp ? 'at his camp' : 'off the hook'})`);
    for (const x of alive()) { at(x.i, 'truckDoor', -1.2); use(x.i, 'truckDoor'); }
    step(20);
  }
  return { m, ending: lastOver(log) };
}

function lastOver(log) {
  for (let i = log.length - 1; i >= 0; i--) if (log[i].msg.t === 'over') return log[i].msg;
  return null;
}

const plans = [
  { n: 1, water: 0, relief: 2, answer: true, binocs: true, night: 'slam', badBearing: false, boltDoor: true, out: 'truck' },
  { n: 2, water: 1, relief: 1, answer: false, binocs: true, night: 'bolt', badBearing: true, boltDoor: true, out: 'phone' },
  { n: 3, water: 0, relief: 0, answer: true, binocs: false, night: 'open', badBearing: false, boltDoor: true, out: 'truck' },
  { n: 4, water: -1, relief: 2, answer: false, binocs: false, night: 'peek', badBearing: false, boltDoor: false, out: 'phone' },
  { n: 2, water: 1, relief: 0, answer: true, binocs: true, night: 'peek', badBearing: false, boltDoor: true, out: 'phone' },
];
plans.forEach((plan, k) => {
  const seed = `test${k}`;
  let r;
  try { r = run(plan.n, seed, plan); } catch (e) { failures++; console.log(`  FAIL: ${seed} threw`, e); return; }
  const e = r.ending;
  check(!!e, `${seed}: reached an ending`);
  const states = r.m.players.map((p) => `${p.name}:${p.st}`).join(' ');
  console.log(`${seed} | ${plan.n} player(s) | water:${r.m.flags.water} night:${plan.night} relief:${['up', 'check', 'no'][plan.relief]} out:${plan.out} | ending: ${e ? e.ending : 'none'} | ${states}`);
});

// a chase up the stairs that ends at a bolted trapdoor: he knocks, gives
// up, and the game carries on
{
  const log = [];
  const m = new Match({ seed: 'chase', roster: [{ id: 'p1', name: 'Ana', color: 0 }], send: (to, msg) => log.push(msg), start: 5 });
  try {
    for (let k = 0; k < (INTRO_LEN + 12) / TICK; k++) m.step(TICK);
    const p = m.players[0];
    m.handle(p.id, { t: 'st', x: -1.0, y: CAB_Y, z: 1.0, ry: 0, rx: 0, mv: 0 });
    m.hatch.bolt = true;
    m.wade.spawn(-4.5, 0, 0.5);
    m.flags.wadeBusy = true;
    m.wade.hunt(p);
    for (let k = 0; k < 60 / TICK && m.wade.mode === 'hunt'; k++) m.step(TICK);
    check(log.some((e) => e.t === 'fx' && e.k === 'hatchKnock'), 'chase: he knocked on the bolted trapdoor');
    check(m.wade.mode !== 'hunt' && p.st === 'in', 'chase: he gave up and nobody was taken');
    console.log('chase | a hunt up the stairs to a bolted trapdoor | ok');
  } catch (e) { failures++; console.log('  FAIL: chase threw', e); }
}

if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log('all good');
