// Walks a player around the tower with the same rules the game uses
// (surfaces, steps, walls, gravity) and checks the routes that matter:
// up the stairs and through the trapdoor into the cab, out of the door and
// round the catwalk, back down; that a shut trapdoor stops you underneath
// it; and that you can't fall off the stairs or the catwalk.
//
// usage: node test/walk.test.js

import { PLAYER_R, WALK, GRAVITY } from '../public/js/shared/config.js';
import { floorAt, Solids, HATCH_WALL, DOOR_WALL, UP_STAIRS, CAB_Y, inCab, onCatwalk } from '../public/js/shared/layout.js';
import { solidBoxes } from '../public/js/shared/forest.js';

let failures = 0;
const check = (ok, what) => { if (!ok) { failures++; console.log('  FAIL:', what); } else console.log('  ok:', what); };

const solids = new Solids(solidBoxes());
const DT = 1 / 60;

// steer at each waypoint in turn; returns where you ended up
function walk(p, pts, { hatchShut = false, doorShut = false, maxT = 120 } = {}) {
  solids.dynamic = [...(hatchShut ? [HATCH_WALL] : []), ...(doorShut ? [DOOR_WALL] : [])];
  let i = 0, t = 0, lowest = p.y;
  while (i < pts.length && t < maxT) {
    const [x, , z] = pts[i];
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.2) { i++; continue; }
    const pos = { x: p.x + (dx / d) * WALK * DT, z: p.z + (dz / d) * WALK * DT };
    solids.resolve(pos, PLAYER_R, p.y);
    p.x = pos.x; p.z = pos.z;
    const floor = floorAt(p.x, p.z, p.y, hatchShut);
    if (p.y - floor < 0.45 && p.vy <= 0) { p.y = floor; p.vy = 0; } else {
      p.vy -= GRAVITY * DT;
      p.y += p.vy * DT;
      if (p.y <= floor) { p.y = floor; p.vy = 0; }
    }
    lowest = Math.min(lowest, p.y);
    t += DT;
  }
  return { reached: i >= pts.length, t, lowest };
}

const fresh = () => ({ x: -4.5, y: 0, z: 0.5, vy: 0 });

console.log('up the stairs, through the open trapdoor, into the cab');
{
  const p = fresh();
  const r = walk(p, [[-2.6, 0, 0.5], ...UP_STAIRS, [0.9, 13, 0.52], [1.9, 14, 0.52], [1.9, 14, 1.8], [0, 14, 1.8]]);
  check(r.reached && inCab(p.x, p.y, p.z) && Math.abs(p.y - CAB_Y) < 0.01, `in the cab at y ${p.y.toFixed(2)} after ${r.t.toFixed(1)} s`);
}

console.log('a shut trapdoor stops you underneath it');
{
  const p = fresh();
  const r = walk(p, [[-2.6, 0, 0.5], ...UP_STAIRS, [0.9, 13, 0.52], [1.9, 14, 0.52]], { hatchShut: true, maxT: 60 });
  check(!r.reached && p.y < 13 && p.y > 11.9, `stuck under the trapdoor at y ${p.y.toFixed(2)}, x ${p.x.toFixed(2)}`);
}

console.log('out of the cab door and right round the catwalk');
{
  const p = { x: 0, y: CAB_Y, z: 1.6, vy: 0 };
  const loop = [[0, 14, 3.05], [3.05, 14, 3.05], [3.05, 14, -3.05], [-3.05, 14, -3.05], [-3.05, 14, 3.05], [0, 14, 3.05], [0, 14, 1.6]];
  const r = walk(p, loop);
  check(r.reached && r.lowest > CAB_Y - 0.01, `round the catwalk and back in (lowest ${r.lowest.toFixed(2)})`);
}

console.log('a shut door keeps you in the cab');
{
  const p = { x: 0, y: CAB_Y, z: 1.6, vy: 0 };
  const r = walk(p, [[0, 14, 3.1]], { doorShut: true, maxT: 5 });
  check(!r.reached && inCab(p.x, p.y, p.z), 'still inside');
}

console.log('the catwalk railing holds');
{
  const p = { x: 3.0, y: CAB_Y, z: 0, vy: 0 };
  const r = walk(p, [[6, 14, 0]], { maxT: 4 });
  check(!r.reached && onCatwalk(p.x, p.y, p.z) && r.lowest > CAB_Y - 0.01, `x ${p.x.toFixed(2)}, still on the catwalk`);
}

console.log('back down from the cab through the trapdoor to the ground');
{
  const p = { x: 2.0, y: CAB_Y, z: 0.52, vy: 0 };
  const down = [[1.2, 13.5, 0.52], [0.05, 12, 0.52], ...[...UP_STAIRS].reverse(), [-4.5, 0, 0.5]];
  const r = walk(p, down);
  check(r.reached && Math.abs(p.y) < 0.2, `on the ground at y ${p.y.toFixed(2)} after ${r.t.toFixed(1)} s`);
}

console.log('you can\'t step off the stairs sideways');
{
  const p = fresh();
  walk(p, [[-2.6, 0, 0.5], ...UP_STAIRS.slice(0, 8)]);
  const y0 = p.y;
  const r = walk(p, [[p.x, 0, 4]], { maxT: 3 });
  check(!r.reached && p.y > y0 - 0.6, `held at y ${p.y.toFixed(2)} (was ${y0.toFixed(2)})`);
}

if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log('all good');
