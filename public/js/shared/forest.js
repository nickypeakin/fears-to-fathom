// The trees near enough to walk among, placed the same way for the host
// and every player (they're solid). The forest further out is scenery
// only and is grown by the client.

import { makeRng } from './rng.js';
import { terrainH, CLEARING_R } from './terrain.js';
import { PLACES, ROAD, TRAIL, SPRING_TRAIL, nearPath, BASE_SOLIDS, WALLS, CAB_SOLIDS } from './layout.js';

export const NEAR_R = 145;
export const TRUNK = 0.02;       // trunk radius as a fraction of the tree's height

function grow() {
  const rng = makeRng('cinder-trees');
  const out = [];
  const cell = 4.3;
  const clear = (x, z, r) => {
    for (const k of ['shed', 'tank', 'outhouse', 'woodpile', 'generator']) {
      const p = PLACES[k];
      if (Math.hypot(x - p.x, z - p.z) < 3.5 + r) return false;
    }
    return true;
  };
  for (let gx = -NEAR_R; gx <= NEAR_R; gx += cell) {
    for (let gz = -NEAR_R; gz <= NEAR_R; gz += cell) {
      const x = gx + (rng() - 0.5) * cell * 0.9, z = gz + (rng() - 0.5) * cell * 0.9;
      const r = Math.hypot(x, z);
      const keep = rng();
      if (r > NEAR_R || r < CLEARING_R + 1.5 + rng() * 3) continue;
      if (keep < 0.12) continue;
      if (nearPath(ROAD, x, z) < 3.6 || nearPath(TRAIL, x, z) < 1.9 || nearPath(SPRING_TRAIL, x, z) < 1.7) continue;
      if (Math.hypot(x - PLACES.camp.x, z - PLACES.camp.z) < 7.5) continue;
      if (Math.hypot(x - PLACES.spring.x, z - PLACES.spring.z) < 3.5) continue;
      if (!clear(x, z, 0)) continue;
      // stunted and wind-bent up on the summit, taller down the slopes, so
      // the cab always looks out over the tops
      const grow = Math.max(0, Math.min(1, (r - 20) / 75));
      const h = (6.5 + 17 * grow * grow * (3 - 2 * grow)) * (0.8 + rng() * 0.4);
      out.push({ x, z, y: terrainH(x, z), h, w: Math.max(0.16, h * TRUNK), kind: rng() < 0.75 ? 0 : 1, tint: rng() });
    }
  }
  // the pine with the trail camera strapped to it, at the edge of the clearing
  const T = PLACES.trailcam;
  out.push({ x: T.x, z: T.z, y: terrainH(T.x, T.z), h: 9, w: 0.3, kind: 1, tint: 0.5 });
  // a few scattered in the clearing for shade
  for (const [x, z] of [[-14, -11], [15, -3], [-16, 2]]) out.push({ x, z, y: 0, h: 8, w: 0.26, kind: 1, tint: 0.3 });
  return out;
}

export const TREES = grow();

// everything solid: the tower, the furniture up top, the clearing's
// buildings, and every trunk
export function solidBoxes() {
  const boxes = [...WALLS, ...CAB_SOLIDS, ...BASE_SOLIDS];
  for (const t of TREES) boxes.push({ x0: t.x - t.w, z0: t.z - t.w, x1: t.x + t.w, z1: t.z + t.w, y0: t.y - 2, y1: t.y + 8 });
  return boxes;
}
