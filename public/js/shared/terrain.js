// The shape of the land. Cinder Peak is a rounded summit with the lookout
// on top of it; the ground falls away on every side into forested slopes
// and drainages, with higher ridges standing all around on the horizon.
// Pure maths, shared by the host (to keep people on the ground) and every
// client (to build the same mountain).

function hash(ix, iz) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

export function fbm(x, z, oct = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += a * vnoise(x * f + i * 17.3, z * f - i * 9.1); f *= 2.03; a *= 0.5; }
  return v;
}

// sharp-crested ridges
function ridges(x, z, oct = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { const n = vnoise(x * f + i * 5.7, z * f + i * 3.3); v += a * (1 - Math.abs(n * 2 - 1)) ** 2; f *= 2.1; a *= 0.5; }
  return v;
}

const softplus = (x, k) => (x > 20 * k ? x : k * Math.log1p(Math.exp(x / k)));
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const SP0 = softplus(-12, 6), SP1 = softplus(-420, 160);

// the clearing on the summit is flat out to here
export const CLEARING_R = 19;

// height of the ground in metres (the clearing is at 0)
export function terrainH(x, z) {
  const r = Math.hypot(x, z);
  const d = Math.max(0, r - CLEARING_R + 2);
  // the summit: gentle at first, steepening, then easing out onto the valley floor
  let h = -0.05 * d - 0.2 * (softplus(d - 12, 6) - SP0) + 0.25 * (softplus(d - 420, 160) - SP1);
  // lumps and hollows on the slopes
  h += (fbm(x / 55, z / 55, 3) - 0.5) * 9 * smoothstep(CLEARING_R, 60, r);
  // ridges and drainages further out
  h += (ridges(x / 900, z / 900, 4) - 0.35) * 260 * smoothstep(300, 1600, r);
  // the high country on the horizon
  h += (ridges(x / 2600 + 3.1, z / 2600, 3) * 900 + 380) * smoothstep(2200, 6500, r);
  return h;
}

// downhill direction and steepness, for placing trees and colouring rock
export function slope(x, z) {
  const e = 0.75;
  const dx = (terrainH(x + e, z) - terrainH(x - e, z)) / (2 * e);
  const dz = (terrainH(x, z + e) - terrainH(x, z - e)) / (2 * e);
  return Math.hypot(dx, dz);
}
