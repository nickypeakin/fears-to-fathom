// The 50th floor: our apartment (50C), the corridor outside it and the
// elevator that brings everyone up. The host and every client build from
// these numbers: walls to collide with, where the furniture stands, the
// front door and its peephole, the hiding spots and where visitors wait.
//
// Metres. x runs east, z runs south, y is up; the floor is y = 0. The
// apartment is the south-west corner unit: floor-to-ceiling glass faces
// west (the sunset) and south (the river). The corridor runs east along its
// north wall to the elevators and the stairwell.

import { box } from './collision.js';

export const CEIL = 2.7;
export const HALL_CEIL = 2.6;

export const APT = { x0: 0, x1: 10, z0: 0, z1: 8.5 };
export const CORRIDOR = { x0: 0, x1: 22, z0: -2.4, z1: -0.15 };
export const ELEVATOR = { x0: 8.3, x1: 10.1, z0: -4.15, z1: -2.6, doorX0: 8.7, doorX1: 9.7, h: 2.5 };

// Walls: boxes on the floor plan with holes cut along their length.
// hole { a0, a1 } runs along the wall's long side, { y0, y1 } is its height.
// kinds: front (our door), door (an open interior doorway), shut (a closed
// door you can't use), closet (a closet door you can hide behind),
// glass (floor-to-ceiling window), window, lift (elevator doors), stair.
export const WALLS = [
  // apartment shell
  { x0: -0.2, x1: 10.2, z0: -0.15, z1: 0, h: CEIL, holes: [{ a0: 1.14, a1: 2.06, y0: 0, y1: 2.1, kind: 'front' }] },
  { x0: -0.2, x1: 0, z0: 0, z1: 8.7, h: CEIL, ext: true, holes: [{ a0: 2.4, a1: 8.45, y0: 0, y1: CEIL, kind: 'glass' }] },
  { x0: 0, x1: 10.2, z0: 8.5, z1: 8.7, h: CEIL, ext: true, holes: [{ a0: 0.05, a1: 4.5, y0: 0, y1: CEIL, kind: 'glass' }, { a0: 5.0, a1: 9.6, y0: 0.5, y1: 2.45, kind: 'window' }] },
  { x0: 10, x1: 10.2, z0: 0, z1: 8.5, h: CEIL, ext: true, holes: [{ a0: 0.5, a1: 2.5, y0: 0.7, y1: 2.3, kind: 'window' }] },
  // inside
  { x0: 4.54, x1: 4.66, z0: 0, z1: 3.0, h: CEIL, holes: [] },
  { x0: 4.54, x1: 4.66, z0: 4.2, z1: 8.5, h: CEIL, holes: [] },
  { x0: 6.54, x1: 6.66, z0: 0, z1: 2.94, h: CEIL, holes: [] },
  // doors: hinge at the 'lo' or 'hi' end of the hole, swinging towards -1/+1 across the wall
  { x0: 4.66, x1: 10, z0: 2.94, z1: 3.06, h: CEIL, holes: [{ a0: 5.0, a1: 5.8, y0: 0, y1: 2.05, kind: 'door', hinge: 'hi', swing: -1 }, { a0: 6.95, a1: 7.75, y0: 0, y1: 2.05, kind: 'door', hinge: 'lo', swing: -1 }] },
  { x0: 4.66, x1: 10, z0: 4.14, z1: 4.26, h: CEIL, holes: [{ a0: 5.0, a1: 5.8, y0: 0, y1: 2.05, kind: 'door', hinge: 'lo', swing: 1 }] },
  { x0: 9.24, x1: 9.36, z0: 3.06, z1: 4.14, h: CEIL, holes: [{ a0: 3.15, a1: 4.05, y0: 0, y1: 2.05, kind: 'closet', hinge: 'hi', swing: -1, hide: 6 }] },
  // corridor
  { x0: 10.2, x1: 22.2, z0: -0.15, z1: 0, h: HALL_CEIL, holes: [{ a0: 13.55, a1: 14.45, y0: 0, y1: 2.1, kind: 'shut', unit: '50B', hinge: 'lo', swing: 1 }, { a0: 19.05, a1: 19.95, y0: 0, y1: 2.1, kind: 'shut', unit: '50A', hinge: 'lo', swing: 1 }] },
  { x0: -0.2, x1: 22.2, z0: -2.6, z1: -2.4, h: HALL_CEIL, holes: [
    { a0: 2.2, a1: 3.1, y0: 0, y1: 2.1, kind: 'shut', unit: '50D', hinge: 'lo', swing: -1 },
    { a0: ELEVATOR.doorX0, a1: ELEVATOR.doorX1, y0: 0, y1: 2.2, kind: 'lift' },
    { a0: 11.2, a1: 12.2, y0: 0, y1: 2.2, kind: 'lift' },
    { a0: 16.4, a1: 17.3, y0: 0, y1: 2.1, kind: 'shut', unit: '50E', hinge: 'hi', swing: -1 },
  ] },
  { x0: -0.2, x1: 0, z0: -2.4, z1: -0.15, h: HALL_CEIL, holes: [{ a0: -2.1, a1: -0.55, y0: 0.85, y1: 2.2, kind: 'window' }] },
  { x0: 22, x1: 22.2, z0: -2.4, z1: -0.15, h: HALL_CEIL, holes: [{ a0: -1.75, a1: -0.85, y0: 0, y1: 2.1, kind: 'stair', hinge: 'lo', swing: 1 }] },
];

export const alongX = (w) => w.x1 - w.x0 >= w.z1 - w.z0;

// The solid pieces of each wall (windows count as solid; doorways don't).
function solidParts(w, passable) {
  const ax = alongX(w);
  const lo = ax ? w.x0 : w.z0, hi = ax ? w.x1 : w.z1;
  const cuts = w.holes.filter((h) => passable.has(h.kind)).sort((a, b) => a.a0 - b.a0);
  const out = [];
  let at = lo;
  for (const h of cuts) {
    if (h.a0 > at) out.push([at, h.a0]);
    at = Math.max(at, h.a1);
  }
  if (hi > at) out.push([at, hi]);
  return out.map(([a, b]) => (ax ? { x0: a, x1: b, z0: w.z0, z1: w.z1 } : { x0: w.x0, x1: w.x1, z0: a, z1: b }));
}

// ------------------------------------------------------------- the door --
// Hinged on its east side, opening inwards (into the apartment). In the
// leaf's own frame the hinge is the origin and the leaf runs along -x; +z
// is the side facing into the apartment.
export const DOOR = {
  hinge: { x: 2.04, z: -0.02 },
  w: 0.9, h: 2.08, t: 0.045,
  chainAngle: 0.13,           // how far the chain lets it open (radians)
  openAngle: 1.62,            // fully open
  stand: { x: 1.6, z: -0.66 }, // where someone knocking stands
  use: { x: 1.6, z: 0.7 },     // where you stand to use it
  // parts on the inside face, in leaf coordinates
  parts: {
    peephole: { x: -0.45, y: 1.5, z: 0.025 },
    bolt: { x: -0.8, y: 1.2, z: 0.03 },
    handle: { x: -0.8, y: 1.0, z: 0.04 },
    chain: { x: -0.75, y: 1.44, z: 0.03 },
  },
};

// leaf coordinates -> world, with the door open `angle` radians
export function doorPoint(p, angle, out = {}) {
  const c = Math.cos(angle), s = Math.sin(angle);
  out.x = DOOR.hinge.x + p.x * c + p.z * s;
  out.y = p.y ?? 0;
  out.z = DOOR.hinge.z - p.x * s + p.z * c;
  return out;
}

// --------------------------------------------------------- furniture ----
// type, centre, rotation (0 = facing +z / south) and floor footprint w x d
// before rotation. `solid: false` things don't block anyone.
export const FURNITURE = [
  // living room, kitchen, entry
  { type: 'coatCloset', x: 0.31, z: 1.025, rot: Math.PI / 2, w: 1.45, d: 0.62 },
  { type: 'fridge', x: 2.875, z: 0.36, rot: 0, w: 0.74, d: 0.72 },
  { type: 'counter', x: 3.895, z: 0.31, rot: 0, w: 1.29, d: 0.62, sink: true },
  { type: 'counter', x: 4.23, z: 1.56, rot: -Math.PI / 2, w: 1.88, d: 0.62, stove: true },
  { type: 'diningTable', x: 2.6, z: 3.2, rot: 0, w: 1.4, d: 0.85 },
  { type: 'chair', x: 2.25, z: 2.62, rot: 0, w: 0.44, d: 0.44, solid: false },
  { type: 'chair', x: 2.95, z: 2.62, rot: 0, w: 0.44, d: 0.44, solid: false },
  { type: 'chair', x: 2.25, z: 3.8, rot: Math.PI, w: 0.44, d: 0.44, solid: false },
  { type: 'chair', x: 2.95, z: 3.8, rot: Math.PI, w: 0.44, d: 0.44, solid: false },
  { type: 'rug', x: 2.1, z: 6.55, rot: 0, w: 3.0, d: 2.2, solid: false, color: '#6b5a4a' },
  { type: 'sofa', x: 2.15, z: 5.95, rot: 0, w: 2.2, d: 0.92 },
  { type: 'coffeeTable', x: 2.15, z: 6.95, rot: 0, w: 1.1, d: 0.6 },
  { type: 'armchair', x: 0.72, z: 6.85, rot: Math.PI / 2, w: 0.9, d: 0.88 },
  { type: 'floorLamp', x: 3.55, z: 5.55, rot: 0, w: 0.3, d: 0.3 },
  { type: 'bookshelf', x: 4.36, z: 5.95, rot: -Math.PI / 2, w: 1.0, d: 0.34 },
  { type: 'plant', x: 0.45, z: 8.05, rot: 0, w: 0.45, d: 0.45 },
  { type: 'plant', x: 4.15, z: 8.1, rot: 0, w: 0.45, d: 0.45 },
  { type: 'console', x: 0.22, z: 2.3, rot: Math.PI / 2, w: 0.9, d: 0.35 },
  // bathroom
  { type: 'tub', x: 5.53, z: 0.4, rot: 0, w: 1.74, d: 0.78 },
  { type: 'toilet', x: 6.22, z: 1.75, rot: -Math.PI / 2, w: 0.42, d: 0.66 },
  { type: 'vanity', x: 4.92, z: 1.85, rot: Math.PI / 2, w: 0.9, d: 0.5 },
  { type: 'bathMat', x: 5.5, z: 1.15, rot: 0, w: 0.9, d: 0.55, solid: false },
  // second bedroom
  { type: 'bed', x: 8.7, z: 1.03, rot: 0, w: 1.42, d: 2.06, color: 0x5c7a8c, size: 'double' },
  { type: 'wardrobe', x: 6.96, z: 0.95, rot: Math.PI / 2, w: 1.4, d: 0.6 },
  { type: 'nightstand', x: 9.72, z: 0.3, rot: 0, w: 0.46, d: 0.4 },
  { type: 'rug', x: 8.4, z: 2.4, rot: 0, w: 1.8, d: 0.9, solid: false, color: '#8a6e58' },
  // hall
  { type: 'runner', x: 7.3, z: 3.6, rot: 0, w: 3.6, d: 0.7, solid: false, color: '#5a4a44' },
  // main bedroom
  { type: 'bed', x: 8.97, z: 6.4, rot: -Math.PI / 2, w: 1.62, d: 2.06, color: 0x8c6a5a, size: 'queen' },
  { type: 'nightstand', x: 9.75, z: 5.3, rot: -Math.PI / 2, w: 0.46, d: 0.4 },
  { type: 'nightstand', x: 9.75, z: 7.5, rot: -Math.PI / 2, w: 0.46, d: 0.4 },
  { type: 'wardrobe', x: 8.0, z: 4.56, rot: 0, w: 1.6, d: 0.6 },
  { type: 'dresser', x: 4.92, z: 6.8, rot: Math.PI / 2, w: 1.2, d: 0.5 },
  { type: 'armchair', x: 5.4, z: 7.85, rot: Math.PI * 0.75, w: 0.85, d: 0.85, small: true },
  { type: 'plant', x: 6.25, z: 8.15, rot: 0, w: 0.4, d: 0.4 },
  { type: 'rug', x: 7.6, z: 6.4, rot: Math.PI / 2, w: 2.4, d: 1.6, solid: false, color: '#b8a890' },
];

// footprint of a piece of furniture on the floor plan
export function footprint(f) {
  const turned = Math.abs(Math.sin(f.rot || 0)) > 0.5;
  return box(f.x, f.z, turned ? f.d : f.w, turned ? f.w : f.d);
}

// ------------------------------------------------------- hiding spots ---
// enter: where you stand to get in. eye: where your eye is once you're in
// (yaw 0 looks towards -z, like everywhere else). check: where he stands to
// look inside. Beds are crawled under; the rest have doors or a curtain.
const yaw = (dx, dz) => Math.atan2(-dx, -dz);
export const HIDES = [
  { id: 0, kind: 'closet', name: 'the coat closet', room: 'living', enter: { x: 1.05, z: 1.0 }, eye: { x: 0.32, y: 1.5, z: 1.0, ry: yaw(1, 0) }, check: { x: 1.0, z: 1.0 } },
  { id: 1, kind: 'shower', name: 'the shower', room: 'bath', enter: { x: 5.5, z: 1.35 }, eye: { x: 5.5, y: 1.48, z: 0.38, ry: yaw(0, 1) }, check: { x: 5.5, z: 1.25 } },
  { id: 2, kind: 'wardrobe', name: 'the wardrobe', room: 'bed2', enter: { x: 7.65, z: 0.95 }, eye: { x: 6.94, y: 1.48, z: 0.95, ry: yaw(1, 0) }, check: { x: 7.6, z: 0.95 } },
  { id: 3, kind: 'bed', name: 'under the bed', room: 'bed2', enter: { x: 8.7, z: 2.5 }, eye: { x: 8.7, y: 0.17, z: 1.35, ry: yaw(0, 1) }, check: { x: 8.7, z: 2.5 } },
  { id: 4, kind: 'wardrobe', name: 'the wardrobe', room: 'master', enter: { x: 8.0, z: 5.25 }, eye: { x: 8.0, y: 1.48, z: 4.55, ry: yaw(0, 1) }, check: { x: 8.0, z: 5.2 } },
  { id: 5, kind: 'bed', name: 'under the bed', room: 'master', enter: { x: 7.5, z: 6.4 }, eye: { x: 8.75, y: 0.17, z: 6.4, ry: yaw(-1, 0) }, check: { x: 7.5, z: 6.4 } },
  { id: 6, kind: 'closet', name: 'the linen closet', room: 'hall', enter: { x: 8.85, z: 3.6 }, eye: { x: 9.68, y: 1.5, z: 3.6, ry: yaw(-1, 0) }, check: { x: 8.85, z: 3.6 } },
];

// rooms he searches, and where to stand in each
export const ROOMS = [
  { id: 'living', x: 1.9, z: 4.6, hides: [0] },
  { id: 'kitchen', x: 3.0, z: 1.6, hides: [] },
  { id: 'bath', x: 5.55, z: 1.95, hides: [1] },
  { id: 'bed2', x: 7.5, z: 2.1, hides: [2, 3] },
  { id: 'hall', x: 7.6, z: 3.6, hides: [6] },
  { id: 'master', x: 6.5, z: 6.2, hides: [4, 5] },
];

export function roomAt(x, z) {
  if (z < 0) return 'corridor';
  if (x < 4.6) return z < 2.6 && x > 2.2 ? 'kitchen' : 'living';
  if (z < 3.0) return x < 6.6 ? 'bath' : 'bed2';
  if (z < 4.2) return x > 9.3 ? 'closet' : 'hall';
  return 'master';
}

// Places friends hang out when they aren't doing anything (bots use them).
// pose sit/stand; ry the way they face.
export const SPOTS = [
  { x: 1.55, z: 6.0, ry: yaw(0, 1), pose: 'sit', seat: 0.42 },
  { x: 2.75, z: 6.0, ry: yaw(0, 1), pose: 'sit', seat: 0.42 },
  { x: 0.78, z: 6.85, ry: yaw(1, 0), pose: 'sit', seat: 0.42 },
  { x: 2.25, z: 3.85, ry: yaw(0, -1), pose: 'sit', seat: 0.46 },
  { x: 2.95, z: 2.55, ry: yaw(0, 1), pose: 'sit', seat: 0.46 },
  { x: 0.75, z: 4.6, ry: yaw(-1, 0.2), pose: 'stand' },
  { x: 1.6, z: 8.0, ry: yaw(0, 1), pose: 'stand' },
  { x: 3.5, z: 1.35, ry: yaw(1, -0.2), pose: 'stand' },
  { x: 8.6, z: 2.3, ry: yaw(0, 1), pose: 'sit', seat: 0.5 },
  { x: 7.8, z: 6.0, ry: yaw(-1, 0), pose: 'sit', seat: 0.52 },
];

// --------------------------------------------------------- the corridor --
// Ways people arrive at our door (and leave again).
export const ROUTES = {
  elevator: [{ x: 9.2, z: -3.3 }, { x: 9.2, z: -1.5 }, { x: 2.4, z: -1.1 }, { x: DOOR.stand.x, z: DOOR.stand.z }],
  stairs: [{ x: 22.6, z: -1.3 }, { x: 21.4, z: -1.3 }, { x: 3.0, z: -1.2 }, { x: DOOR.stand.x, z: DOOR.stand.z }],
  across: [{ x: 2.65, z: -2.9 }, { x: 2.65, z: -1.9 }, { x: 1.9, z: -1.0 }, { x: DOOR.stand.x, z: DOOR.stand.z }],
};

// --------------------------------------------------------- collisions ----
const DOORWAYS = new Set(['door', 'lift', 'stair']);
export const WALL_BOXES = WALLS.flatMap((w) => solidParts(w, DOORWAYS));
// the front doorway is open for anyone the door lets through
const WALLS_FRONT_OPEN = WALLS.flatMap((w) => solidParts(w, new Set([...DOORWAYS, 'front'])));
const FURN_BOXES = FURNITURE.filter((f) => f.solid !== false).map(footprint);

// what blocks the players: you can't leave the apartment
export const PLAYER_SOLIDS = [...WALL_BOXES, ...FURN_BOXES];
// what blocks him and visitors when the front door is open
export const ACTOR_SOLIDS = [...WALLS_FRONT_OPEN, ...FURN_BOXES];

// Is the straight line from a to b clear of walls? (sight ignores furniture;
// the front door blocks it unless `doorOpen`.)
export function los(ax, az, bx, bz, doorOpen = false) {
  const boxes = doorOpen ? WALLS_FRONT_OPEN : WALL_BOXES;
  const dx = bx - ax, dz = bz - az;
  for (const b of boxes) {
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) { if (ax < b.x0 || ax > b.x1) continue; }
    else {
      let a = (b.x0 - ax) / dx, c = (b.x1 - ax) / dx;
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-9) { if (az < b.z0 || az > b.z1) continue; }
    else {
      let a = (b.z0 - az) / dz, c = (b.z1 - az) / dz;
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      if (t0 > t1) continue;
    }
    return false;
  }
  return true;
}

// is the point inside the apartment (not the corridor)?
export const inside = (x, z) => x > APT.x0 && x < APT.x1 && z > 0 && z < APT.z1;
