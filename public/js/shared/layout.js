// Cinder Peak lookout: the tower, the clearing around it and the paths
// into the woods. x runs east, z runs south, y is up, in metres; the
// clearing on the summit is at y = 0 and the tower stands on its middle.
//
// The tower is a steel frame with seven flights of switchback stairs inside
// it. The last, steep flight comes up through a trapdoor in the floor of the
// cab: a 5 m glass room on top, with a catwalk all the way round outside it.
//
// Everything people walk on is a list of surfaces (flat rectangles and
// ramps); everything that stops them is a list of walls, each with the
// heights it covers, so the stairs can stack up without the flights getting
// in each other's way.

import { terrainH } from './terrain.js';
import { STEP_UP } from './config.js';

export const CAB_Y = 14;                 // the cab floor
export const CAB = { half: 2.45, h: 2.6, sill: 0.95, head: 2.35 };
export const WALK = 3.6;                 // outer edge of the catwalk
export const FRAME = { base: 4.0, top: 2.85 };

// the stairs: lane A (z > 0) climbs east, lane B (z < 0) climbs west
export const STAIR = { x0: -1.6, x1: 1.6, end: 2.62, laneA: [0.04, 1.0], laneB: [-1.0, -0.04] };
export const HATCH = { x0: 0.1, x1: 1.6, z0: 0.0, z1: 1.04 };
export const DOOR = { x0: -0.45, x1: 0.45, z: CAB.half, h: 2.05 };   // the cab door, hinged at x0, opens inwards
// his way onto the catwalk when the trapdoor's bolted: a service ladder
export const LADDER = { x: -2.95, z: 0.0, y0: 12, y1: CAB_Y };

// ---------------------------------------------------------------- surfaces
const flat = (x0, x1, z0, z1, y, tag = '') => ({ x0, x1, z0, z1, y0: y, y1: y, ax: 0, tag });
// a ramp climbing along x from (xa, ya) to (xb, yb)
const ramp = (xa, xb, z0, z1, ya, yb, tag = '') => ({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0, z1, xa, xb, y0: ya, y1: yb, ax: 1, tag });

export const SURFACES = [];
{
  const A = STAIR.laneA, B = STAIR.laneB, S = STAIR;
  for (let k = 0; k < 6; k++) {
    const y = k * 2;
    if (k % 2 === 0) {
      SURFACES.push(ramp(S.x0, S.x1, A[0] - 0.04, A[1], y, y + 2, `flight${k}`));
      SURFACES.push(flat(S.x1 - 0.02, S.end, -1.0, 1.0, y + 2, `east${y + 2}`));
    } else {
      SURFACES.push(ramp(S.x1, S.x0, B[0], B[1] + 0.04, y, y + 2, `flight${k}`));
      SURFACES.push(flat(-S.end, S.x0 + 0.02, -1.0, 1.0, y + 2, `west${y + 2}`));
    }
  }
  // the top: a short walkway at 12 m, then the steep flight up through the trapdoor
  SURFACES.push(flat(S.x0 - 0.02, 0.02, A[0] - 0.04, A[1], 12, 'walkway'));
  SURFACES.push(ramp(0.0, HATCH.x1 + 0.02, A[0] - 0.04, A[1], 12, CAB_Y, 'flight6'));
  // the cab floor around the trapdoor
  const C = CAB.half, H = HATCH;
  SURFACES.push(flat(-C, H.x0, -C, C, CAB_Y, 'cab'));
  SURFACES.push(flat(H.x1, C, -C, C, CAB_Y, 'cab'));
  SURFACES.push(flat(H.x0, H.x1, -C, H.z0, CAB_Y, 'cab'));
  SURFACES.push(flat(H.x0, H.x1, H.z1, C, CAB_Y, 'cab'));
  // the catwalk
  SURFACES.push(flat(-WALK, WALK, -WALK, -C, CAB_Y, 'catwalk'));
  SURFACES.push(flat(-WALK, WALK, C, WALK, CAB_Y, 'catwalk'));
  SURFACES.push(flat(-WALK, -C, -C, C, CAB_Y, 'catwalk'));
  SURFACES.push(flat(C, WALK, -C, C, CAB_Y, 'catwalk'));
}
// the trapdoor itself, when it's down
const HATCH_SURFACE = flat(HATCH.x0, HATCH.x1, HATCH.z0, HATCH.z1, CAB_Y, 'hatch');

function heightOn(s, x) {
  if (!s.ax) return s.y0;
  const t = Math.max(0, Math.min(1, (x - s.xa) / (s.xb - s.xa)));
  return s.y0 + (s.y1 - s.y0) * t;
}

// The floor under someone standing at (x, z) whose feet were at y: the
// highest surface they could step onto. `hatchShut` puts the trapdoor in.
export function floorAt(x, z, y, hatchShut = true) {
  let best = terrainH(x, z);
  for (const s of SURFACES) {
    if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
    const h = heightOn(s, x);
    if (h <= y + STEP_UP && h > best) best = h;
  }
  if (hatchShut) {
    const s = HATCH_SURFACE;
    if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && CAB_Y <= y + STEP_UP && CAB_Y > best) best = CAB_Y;
  }
  return best;
}

// is (x, y, z) inside the cab?
export const inCab = (x, y, z) => y > CAB_Y - 0.6 && Math.abs(x) < CAB.half && Math.abs(z) < CAB.half;
export const onCatwalk = (x, y, z) => y > CAB_Y - 0.6 && !inCab(x, y, z) && Math.abs(x) < WALK + 0.1 && Math.abs(z) < WALK + 0.1;
export const upTop = (x, y, z) => y > CAB_Y - 0.6 && Math.abs(x) < WALK + 0.1 && Math.abs(z) < WALK + 0.1;
// the only place on the mountain a phone gets a bar: the north-east corner of the catwalk
export const hasSignal = (x, y, z) => y > CAB_Y - 0.6 && x > 2.6 && z < -2.6;

// ------------------------------------------------------------------- walls
// { x0, z0, x1, z1, y0, y1 }: stops anyone whose legs (y + 0.25 .. y + 1.3)
// are between y0 and y1
const wall = (x0, x1, z0, z1, y0, y1, tag = '') => ({ x0, z0, x1, z1, y0, y1, tag });

export const WALLS = [];
{
  const S = STAIR, C = CAB.half, Y = CAB_Y;
  // the stairwell: outer sides, the ends (above ground), the rail between the lanes
  WALLS.push(wall(-S.end - 0.06, S.end + 0.06, 1.0, 1.08, 0, Y - 0.4));
  WALLS.push(wall(-S.end - 0.06, S.end + 0.06, -1.08, -1.0, 0, Y - 0.4));
  WALLS.push(wall(S.end, S.end + 0.08, -1.08, 1.08, 0.3, Y - 1));
  WALLS.push(wall(-S.end - 0.08, -S.end, -1.08, 1.08, 2.2, Y - 0.4));
  WALLS.push(wall(S.x0, S.x1, -0.04, 0.04, 0.3, Y - 0.2));
  // at the bottom only lane A is open: the space under the first flights is fenced off
  WALLS.push(wall(-S.end - 0.08, S.x0, -1.08, -0.02, -1, 1.9));
  // the cab's walls (the doorway is a gap in the south wall)
  WALLS.push(wall(-C - 0.1, C + 0.1, -C - 0.1, -C, Y, Y + 3));
  WALLS.push(wall(-C - 0.1, -C, -C, C, Y, Y + 3));
  WALLS.push(wall(C, C + 0.1, -C, C, Y, Y + 3));
  WALLS.push(wall(-C - 0.1, DOOR.x0, C, C + 0.1, Y, Y + 3));
  WALLS.push(wall(DOOR.x1, C + 0.1, C, C + 0.1, Y, Y + 3));
  // the catwalk railing
  WALLS.push(wall(-WALK - 0.06, WALK + 0.06, -WALK - 0.06, -WALK, Y, Y + 1.2));
  WALLS.push(wall(-WALK - 0.06, WALK + 0.06, WALK, WALK + 0.06, Y, Y + 1.2));
  WALLS.push(wall(-WALK - 0.06, -WALK, -WALK, WALK, Y, Y + 1.2));
  WALLS.push(wall(WALK, WALK + 0.06, -WALK, WALK, Y, Y + 1.2));
  // the railing round the trapdoor (open at its east end, where the stairs come up)
  WALLS.push(wall(HATCH.x0, HATCH.x1, HATCH.z1, HATCH.z1 + 0.06, Y, Y + 1.0));
  WALLS.push(wall(HATCH.x0, HATCH.x1, HATCH.z0 - 0.06, HATCH.z0, Y, Y + 1.0));
  WALLS.push(wall(HATCH.x0 - 0.06, HATCH.x0, HATCH.z0 - 0.06, HATCH.z1 + 0.06, Y, Y + 1.0));
}

// the trapdoor when it's down: a lid over the last flight
export const HATCH_WALL = wall(HATCH.x0 + 0.25, HATCH.x1, HATCH.z0, HATCH.z1, 12.2, 14.2, 'hatch');
// the cab door when it's shut
export const DOOR_WALL = wall(DOOR.x0, DOOR.x1, CAB.half - 0.04, CAB.half + 0.06, CAB_Y, CAB_Y + 3, 'door');

// ------------------------------------------------------- the clearing
// the four legs of the tower, where they meet the ground
export const LEGS = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => ({ x: sx * FRAME.base, z: sz * FRAME.base }));

export const PLACES = {
  truck: { x: 8.6, z: 9.6, ry: Math.PI },       // our pickup, nose to the tower
  rangerTruck: { x: 3.4, z: 12.8, ry: 0.4 },
  shed: { x: -8.7, z: -8.3, w: 2.6, d: 2.2 },     // open to the south
  generator: { x: -6.3, z: -8.3 },
  tank: { x: 7.6, z: -8.0 },
  outhouse: { x: -11.5, z: 7.0 },
  woodpile: { x: -4.2, z: 10.6 },
  trailcam: { x: -15.4, z: 12.6 },               // strapped to a pine, watching the tower
  trailhead: { x: 13.2, z: -14.4 },
  camp: { x: 57, z: -66 },
  spring: { x: -37, z: -13 },
  gate: { x: 20.4, z: 56 },
};

// paths through the trees (no trees grow on them)
export const ROAD = [[8.6, 13.5], [12.6, 24], [12.4, 36], [17.4, 49], [20.4, 56], [27, 70], [40, 92], [60, 120], [85, 152], [118, 190], [150, 240], [170, 300]];
export const TRAIL = [[13.2, -14.4], [20, -22], [27, -31], [34, -40], [42, -48], [50, -57], [57, -66]];
export const SPRING_TRAIL = [[-15, -4], [-22, -7], [-29, -10], [-37, -13]];

export function nearPath(path, x, z) {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

// solid things around the clearing (the trees are added in forest.js)
export const BASE_SOLIDS = [];
{
  const g = (x0, x1, z0, z1, h = 3) => BASE_SOLIDS.push({ x0, z0, x1, z1, y0: -2, y1: h });
  for (const L of LEGS) g(L.x - 0.18, L.x + 0.18, L.z - 0.18, L.z + 0.18, 14);
  const T = PLACES.truck;
  g(T.x - 1.0, T.x + 1.0, T.z - 2.65, T.z + 2.65, 2);
  const S = PLACES.shed;
  g(S.x - S.w / 2, S.x + S.w / 2, S.z - S.d / 2, S.z - S.d / 2 + 0.1);    // back wall
  g(S.x - S.w / 2, S.x - S.w / 2 + 0.1, S.z - S.d / 2, S.z + S.d / 2);
  g(S.x + S.w / 2 - 0.1, S.x + S.w / 2, S.z - S.d / 2, S.z + S.d / 2);
  g(S.x - S.w / 2 + 0.1, S.x + S.w / 2 - 0.1, S.z - S.d / 2 + 0.1, S.z - S.d / 2 + 0.55, 1.2);  // the workbench
  const G = PLACES.generator;
  g(G.x - 0.45, G.x + 0.45, G.z - 0.35, G.z + 0.35, 1);
  const K = PLACES.tank;
  g(K.x - 0.95, K.x + 0.95, K.z - 0.95, K.z + 0.95, 4);
  const O = PLACES.outhouse;
  g(O.x - 0.65, O.x + 0.65, O.z - 0.65, O.z + 0.65);
  const W = PLACES.woodpile;
  g(W.x - 1.1, W.x + 1.1, W.z - 0.4, W.z + 0.4, 1);
}

// --------------------------------------------------------- inside the cab
// sleeping spots: the middle of each bed, and which way the sleeper's head
// points (0 is north; a quarter turn is west). Everything low stays on the
// east side, so the view towards the smoke stays clear.
export const BEDS = [
  { x: -1.48, y: CAB_Y + 0.5, z: 2.08, yaw: Math.PI / 2, name: 'the bottom bunk' },
  { x: -1.48, y: CAB_Y + 1.62, z: 2.08, yaw: Math.PI / 2, name: 'the top bunk' },
  { x: 2.08, y: CAB_Y + 0.5, z: -1.4, yaw: 0, name: 'the cot' },
  { x: -1.9, y: CAB_Y + 0.14, z: 0.2, yaw: 0, name: 'the sleeping bag' },
];
// where furniture stops you inside the cab
export const CAB_SOLIDS = [
  { x0: -0.2, x1: 1.65, z0: -2.45, z1: -1.85 },     // the desk with the radio
  { x0: -2.45, x1: -0.52, z0: 1.72, z1: 2.45 },     // the bunks
  { x0: 1.7, x1: 2.45, z0: -2.4, z1: -0.45 },       // the cot
  { x0: -2.45, x1: -1.6, z0: -2.45, z1: -1.6 },     // the stove
  { x0: -1.2, x1: -0.4, z0: -0.9, z1: -0.1 },       // the fire finder
].map((b) => ({ ...b, y0: CAB_Y, y1: CAB_Y + 2.5 }));
export const FINDER = { x: -0.8, y: CAB_Y + 1.06, z: -0.5 };
export const RADIO = { x: 0.97, y: CAB_Y + 0.9, z: -2.23 };
export const DESK = { x: 0.72, z: -2.15 };
export const SUPPLY_SPOT = { x: 2.0, z: 1.9 };     // where delivered boxes are stacked
export const KEY_HOOK = { x: 0.85, y: CAB_Y + 1.45, z: CAB.half - 0.06 };

// Things you can use, and where. The host checks you're close enough; the
// client shows the prompt for whichever one you're looking at.
export const SPOTS = {
  truckDoor: { x: PLACES.truck.x - 1.0, y: 1.3, z: PLACES.truck.z - 0.25, r: 0.8 },
  generator: { x: PLACES.generator.x, y: 0.65, z: PLACES.generator.z, r: 0.6 },
  tank: { x: PLACES.tank.x, y: 0.75, z: PLACES.tank.z + 1.0, r: 0.45 },
  spring: { x: PLACES.spring.x, y: terrainH(PLACES.spring.x, PLACES.spring.z) + 0.6, z: PLACES.spring.z, r: 0.6 },
  radio: { x: RADIO.x, y: RADIO.y, z: RADIO.z, r: 0.3 },
  logbook: { x: 0.17, y: CAB_Y + 0.8, z: -2.13, r: 0.25 },
  finder: { x: FINDER.x, y: FINDER.y, z: FINDER.z, r: 0.45 },
  hatch: { x: (HATCH.x0 + HATCH.x1) / 2, y: CAB_Y + 0.05, z: (HATCH.z0 + HATCH.z1) / 2, r: 0.65 },
  hatchBolt: { x: HATCH.x1 - 0.12, y: CAB_Y + 0.06, z: HATCH.z1 - 0.2, r: 0.18 },
  hatchBelow: { x: 0.55, y: 13.3, z: 0.52, r: 0.6 },
  door: { x: 0.32, y: CAB_Y + 1.0, z: CAB.half, r: 0.35 },
  doorBolt: { x: 0.3, y: CAB_Y + 1.25, z: CAB.half - 0.05, r: 0.12 },
  lightSwitch: { x: -0.75, y: CAB_Y + 1.25, z: CAB.half - 0.06, r: 0.14 },
  stove: { x: -2.02, y: CAB_Y + 0.55, z: -2.02, r: 0.4 },
  trailcam: { x: PLACES.trailcam.x + 0.35, y: 1.5, z: PLACES.trailcam.z - 0.29, r: 0.25 },
  antenna: { x: 2.62, y: CAB_Y + 1.1, z: -2.62, r: 0.35 },
  gate: { x: PLACES.gate.x, y: terrainH(PLACES.gate.x, PLACES.gate.z) + 1.0, z: PLACES.gate.z, r: 1.4 },
  campPhotos: { x: PLACES.camp.x + 1.6, y: terrainH(PLACES.camp.x + 1.6, PLACES.camp.z - 1.2) + 1.5, z: PLACES.camp.z - 1.2, r: 0.6 },
};
for (const [i, b] of BEDS.entries()) SPOTS[`bed${i}`] = { x: b.x, y: b.y, z: b.z, r: 0.7 };

// where the four of you stand when the evening begins, by the truck, looking up at the tower
export const START_SPOTS = [[7.0, 6.4], [6.0, 7.4], [7.8, 5.4], [5.6, 5.9]].map(([x, z]) => ({ x, z, ry: Math.atan2(x, z) }));

// --------------------------------------------------- his ways around
// Waypoints [x, y, z]. He walks straight between them, rising with the stairs.
export const UP_STAIRS = [
  [-2.3, 0, 0.52], [-1.6, 0, 0.52], [1.6, 2, 0.52], [2.1, 2, 0], [1.6, 2, -0.52], [-1.6, 4, -0.52], [-2.1, 4, 0],
  [-1.6, 4, 0.52], [1.6, 6, 0.52], [2.1, 6, 0], [1.6, 6, -0.52], [-1.6, 8, -0.52], [-2.1, 8, 0],
  [-1.6, 8, 0.52], [1.6, 10, 0.52], [2.1, 10, 0], [1.6, 10, -0.52], [-1.6, 12, -0.52], [-2.1, 12, 0],
  [-1.6, 12, 0.52], [0.05, 12, 0.52],
];
export const UNDER_HATCH = [0.22, 12.27, 0.52];
export const INTO_CAB = [[0.9, 13.1, 0.52], [1.62, 14, 0.52], [2.0, 14, 0.9]];
export const UP_LADDER = [[-2.1, 12, 0], [-2.95, 12, 0], [-2.95, 14.0, 0], [-3.1, 14, 0.3]];
export const CATWALK_LOOP = [[-3.05, 14, 3.05], [-3.05, 14, -3.05], [3.05, 14, -3.05], [3.05, 14, 3.05]];
export const OUTSIDE_DOOR = [0, 14, 3.1];
// at the edge of the trees, all round the clearing
export const TREELINE = [[21, -15], [23, 4], [-21, -4], [2, 23], [-5, -22], [-17, 15], [16, 18]].map(([x, z]) => [x, terrainH(x, z), z]);

// ------------------------------------------------------------ collision
// Walls and solids in a coarse grid so that the hundreds of tree trunks
// don't all have to be checked every step.
export class Solids {
  constructor(boxes) {
    this.cell = 4;
    this.grid = new Map();
    this.dynamic = [];
    for (const b of boxes) this.add(b);
  }

  add(b) {
    const c = this.cell;
    for (let ix = Math.floor(b.x0 / c); ix <= Math.floor(b.x1 / c); ix++) {
      for (let iz = Math.floor(b.z0 / c); iz <= Math.floor(b.z1 / c); iz++) {
        const k = ix * 100003 + iz;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(b);
      }
    }
  }

  near(x, z, r) {
    const c = this.cell, out = new Set(this.dynamic);
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix++) {
      for (let iz = Math.floor((z - r) / c); iz <= Math.floor((z + r) / c); iz++) {
        const l = this.grid.get(ix * 100003 + iz);
        if (l) for (const b of l) out.add(b);
      }
    }
    return out;
  }

  // push the circle at pos ({x, z}) with feet at y out of everything it's in
  resolve(pos, r, y) {
    const lo = y + 0.25, hi = y + 1.3;
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      for (const b of this.near(pos.x, pos.z, r + 0.5)) {
        if (b.y1 < lo || b.y0 > hi) continue;
        const cx = Math.max(b.x0, Math.min(pos.x, b.x1));
        const cz = Math.max(b.z0, Math.min(pos.z, b.z1));
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * r;
          pos.z = cz + (dz / d) * r;
        } else {
          const l = pos.x - b.x0, rr = b.x1 - pos.x, t = pos.z - b.z0, bt = b.z1 - pos.z;
          const m = Math.min(l, rr, t, bt);
          if (m === l) pos.x = b.x0 - r;
          else if (m === rr) pos.x = b.x1 + r;
          else if (m === t) pos.z = b.z0 - r;
          else pos.z = b.z1 + r;
        }
      }
    }
    return hit;
  }
}
