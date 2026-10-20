// Getting around the apartment: a grid over the floor plan marking where
// something of a given radius can stand, breadth-first paths through it, and
// stepping along them while sliding off walls and furniture. Used by the
// host for bots and for him.

import { resolveCircle } from './collision.js';

const CELL = 0.2;
const X0 = -0.4, Z0 = -2.6, X1 = 10.4, Z1 = 8.9;

export class Grid {
  constructor(solids, r) {
    this.solids = solids;
    this.r = r;
    this.nx = Math.ceil((X1 - X0) / CELL);
    this.nz = Math.ceil((Z1 - Z0) / CELL);
    const n = this.nx * this.nz;
    this.free = new Uint8Array(n);
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const x = X0 + (i + 0.5) * CELL, z = Z0 + (j + 0.5) * CELL;
        let ok = true;
        for (const b of solids) {
          const cx = Math.max(b.x0, Math.min(x, b.x1)), cz = Math.max(b.z0, Math.min(z, b.z1));
          if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) { ok = false; break; }
        }
        this.free[j * this.nx + i] = ok ? 1 : 0;
      }
    }
    this.prev = new Int32Array(n);
    this.queue = new Int32Array(n);
  }

  cellAt(x, z) {
    const i = Math.max(0, Math.min(this.nx - 1, Math.floor((x - X0) / CELL)));
    const j = Math.max(0, Math.min(this.nz - 1, Math.floor((z - Z0) / CELL)));
    return j * this.nx + i;
  }

  cx(c) { return X0 + ((c % this.nx) + 0.5) * CELL; }
  cz(c) { return Z0 + (Math.floor(c / this.nx) + 0.5) * CELL; }

  // the free cell nearest to (x, z)
  nearestFree(x, z) {
    const c = this.cellAt(x, z);
    if (this.free[c]) return c;
    let best = -1, bd = Infinity;
    const ci = c % this.nx, cj = Math.floor(c / this.nx);
    for (let r = 1; r < 8 && best < 0; r++) {
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
        const k = j * this.nx + i;
        if (!this.free[k]) continue;
        const d = (this.cx(k) - x) ** 2 + (this.cz(k) - z) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
    }
    return best < 0 ? c : best;
  }

  // breadth-first path of cells from a to b (8-way, no squeezing past corners)
  path(ax, az, bx, bz) {
    const a = this.nearestFree(ax, az), b = this.nearestFree(bx, bz);
    if (a === b) return [b];
    const { nx, nz, free, prev, queue } = this;
    prev.fill(-1);
    prev[a] = a;
    let head = 0, tail = 0;
    queue[tail++] = a;
    while (head < tail) {
      const c = queue[head++];
      if (c === b) break;
      const i = c % nx, j = (c / nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const k = jj * nx + ii;
        if (!free[k] || prev[k] >= 0) continue;
        if (di && dj && (!free[j * nx + ii] || !free[jj * nx + i])) continue;
        prev[k] = c;
        queue[tail++] = k;
      }
    }
    if (prev[b] < 0) return null;
    const out = [];
    for (let c = b; c !== a; c = prev[c]) out.push(c);
    out.reverse();
    return out;
  }

  // can you walk straight from a to b through free cells?
  clear(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / (CELL * 0.5));
    for (let k = 0; k <= n; k++) {
      const t = n ? k / n : 0;
      if (!this.free[this.cellAt(ax + (bx - ax) * t, az + (bz - az) * t)]) return false;
    }
    return true;
  }
}

export const yawTowards = (dx, dz) => Math.atan2(-dx, -dz);

export function turn(from, to, rate) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + Math.max(-rate, Math.min(rate, d));
}

// Walk `a` ({ x, z, ry }) towards (gx, gz) at `speed` along the grid.
// Keeps its path in a.nav between calls. Returns the distance left.
export function walkTo(grid, a, gx, gz, speed, dt) {
  const nav = a.nav || (a.nav = { path: null, gx: NaN, gz: NaN, t: 0, i: 0 });
  nav.t -= dt;
  if (!nav.path || Math.hypot(nav.gx - gx, nav.gz - gz) > 0.3 || nav.t <= 0) {
    nav.path = grid.path(a.x, a.z, gx, gz) || [];
    nav.gx = gx; nav.gz = gz; nav.t = 0.8; nav.i = 0;
  }
  let tx = gx, tz = gz;
  const left = Math.hypot(gx - a.x, gz - a.z);
  if (left > 0.35 && !grid.clear(a.x, a.z, gx, gz)) {
    // the furthest of the next few cells we can see straight to
    const p = nav.path;
    while (nav.i < p.length - 1 && Math.hypot(grid.cx(p[nav.i]) - a.x, grid.cz(p[nav.i]) - a.z) < 0.25) nav.i++;
    let pick = Math.min(nav.i, p.length - 1);
    for (let k = nav.i + 1; k < Math.min(p.length, nav.i + 8); k++) {
      if (!grid.clear(a.x, a.z, grid.cx(p[k]), grid.cz(p[k]))) break;
      pick = k;
    }
    if (p.length) { tx = grid.cx(p[pick]); tz = grid.cz(p[pick]); }
  }
  const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
  if (d > 1e-4) {
    const s = Math.min(d, speed * dt);
    a.x += (dx / d) * s;
    a.z += (dz / d) * s;
    resolveCircle(a, grid.r * 0.85, grid.solids);
    a.ry = turn(a.ry, yawTowards(dx, dz), 9 * dt);
  }
  return Math.hypot(gx - a.x, gz - a.z);
}

// straight-line step for scripted walks in the corridor
export function stepTowards(a, tx, tz, speed, dt) {
  const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
  if (d < 1e-4) return 0;
  const s = Math.min(d, speed * dt);
  a.x += (dx / d) * s;
  a.z += (dz / d) * s;
  a.ry = turn(a.ry, yawTowards(dx, dz), 8 * dt);
  return d - s;
}
