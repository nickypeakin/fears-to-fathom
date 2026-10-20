// The mountain and its forest. Near the tower: detailed ground, every
// tree you can walk between (the same trees the host knows about), the
// dirt road and the trails. Further out: thousands of simpler trees, then
// ground painted to look like forest from above, rolling away to the high
// country on the horizon. The far part lives in its own scene, which is
// painted into the cube map behind everything (see backdrop.js).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainH, slope, fbm, CLEARING_R } from '../shared/terrain.js';
import { TREES, NEAR_R } from '../shared/forest.js';
import { ROAD, TRAIL, SPRING_TRAIL, nearPath } from '../shared/layout.js';
import { makeRng } from '../shared/rng.js';
import * as TX from './textures.js';

const NEAR_EDGE = 640;      // the near ground reaches this far from the tower
const FAR_START = 580;      // ... and the far ground starts here
const MID_R = 540;          // the simple trees stop here

const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

// colour of the ground at (x, z): dry grass in the clearing, needles under
// the trees, dirt on the paths, rock where it's steep, forest from afar
function groundColor(x, z, h) {
  const r = Math.hypot(x, z);
  const n = fbm(x / 9, z / 9, 3), m = fbm(x / 40 + 7, z / 40, 3);
  let c = mix3([0.34, 0.29, 0.21], [0.24, 0.27, 0.16], n);                           // needles and moss
  c = mix3([0.58, 0.52, 0.34], c, smoothstep(CLEARING_R - 3, CLEARING_R + 5, r));    // the clearing's dry grass
  if (r < CLEARING_R + 2) c = mix3(c, [0.5, 0.43, 0.32], smoothstep(0.55, 0.75, n) * 0.8);   // bare patches
  c = mix3(c, [0.22, 0.3, 0.17], smoothstep(110, 190, r) * (0.75 + 0.25 * m));       // under the far canopy
  if (r < 700) {
    const road = nearPath(ROAD, x, z), trail = Math.min(nearPath(TRAIL, x, z), nearPath(SPRING_TRAIL, x, z));
    c = mix3(c, [0.48, 0.41, 0.3], (1 - smoothstep(1.8, 3.4, road)) * 0.9);
    c = mix3(c, [0.42, 0.36, 0.27], (1 - smoothstep(0.6, 1.4, trail)) * 0.8);
  }
  const s = r > 600 ? 0 : slope(x, z);
  c = mix3(c, [0.4, 0.38, 0.35], smoothstep(0.9, 1.5, s));
  // high country: thinning forest, meadow and rock
  c = mix3(c, mix3([0.36, 0.38, 0.3], [0.46, 0.44, 0.4], m), smoothstep(220, 520, h));
  return c;
}

// A disc (or ring) of ground around the tower, with rings that space out
// further away.
function polarGround(r0, r1, seg, minStep, ratio, uvScale) {
  const radii = [];
  let r = r0;
  while (r < r1) { radii.push(r); r = Math.max(r + minStep, r * ratio); }
  radii.push(r1);
  const center = r0 === 0;
  const pos = [], col = [], uv = [], idx = [];
  const vert = (x, z) => {
    const h = terrainH(x, z);
    pos.push(x, h, z);
    col.push(...groundColor(x, z, h));
    uv.push(x / uvScale, z / uvScale);
  };
  if (center) vert(0, 0);
  const rings = center ? radii.slice(1) : radii;
  for (const rr of rings) for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; vert(Math.cos(a) * rr, Math.sin(a) * rr); }
  const base = center ? 1 : 0;
  if (center) for (let i = 0; i < seg; i++) idx.push(0, 1 + ((i + 1) % seg), 1 + i);
  for (let k = 0; k < rings.length - 1; k++) {
    const a0 = base + k * seg, a1 = base + (k + 1) * seg;
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      idx.push(a0 + i, a0 + j, a1 + i, a0 + j, a1 + j, a1 + i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------- trees --
function colored(g, c) {
  g = g.index ? g.toNonIndexed() : g;
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
}

// a fir one unit tall and one unit wide at the base of its crown
function firGeo(n = 7, sides = 9) {
  const parts = [colored(new THREE.CylinderGeometry(0.1, 0.16, 0.4, 5, 1, true).translate(0, 0.18, 0), [0.26, 0.18, 0.12])];
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1), r = 1 - t * 0.86, h = (0.2 - t * 0.06) * 7 / n, y = 0.14 + t * 0.74;
    const cone = new THREE.ConeGeometry(r, h, sides, 1, true).rotateY(k * 1.3).translate(0, y + h / 2, 0);
    // droop the tips of each tier a little
    const p = cone.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < y + 0.01) p.setY(i, p.getY(i) - 0.03 * r);
    const v = 0.8 + t * 0.35;
    parts.push(colored(cone, [0.12 * v, 0.2 * v, 0.11 * v]));
    parts.push(colored(new THREE.CircleGeometry(r * 0.96, sides).rotateX(Math.PI / 2).rotateY(k * 1.3).translate(0, y - 0.02 * r, 0), [0.05, 0.08, 0.045]));
  }
  parts.push(colored(new THREE.ConeGeometry(0.05, 0.12, 4, 1, true).translate(0, 1.0, 0), [0.14, 0.23, 0.12]));
  return mergeGeometries(parts);
}

// a ponderosa pine: tall bare trunk, a few rounded clumps on top
function pineGeo(n = 11, branches = true) {
  const parts = [colored(new THREE.CylinderGeometry(0.035, 0.065, 0.8, 5, 1, true).translate(0, 0.4, 0), [0.4, 0.26, 0.16])];
  // clumps of needles on short branches round the top third of the trunk
  for (let i = 0; i < n; i++) {
    const a = i * 2.4 * (11 / n), y = 0.66 + (i / (n - 1)) * 0.3, d = 0.32 * (1 - (i / (n - 1)) * 0.6), r = (0.2 + ((i * 7) % 5) * 0.03) * Math.sqrt(11 / n);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (branches) parts.push(colored(new THREE.CylinderGeometry(0.008, 0.012, d, 3, 1, true).rotateZ(Math.PI / 2).rotateY(-a).translate(x / 2, y - 0.02, z / 2), [0.3, 0.2, 0.13]));
    const v = 0.8 + (i % 3) * 0.1;
    parts.push(colored(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.38, 1).rotateY(a).translate(x, y, z), [0.11 * v, 0.18 * v, 0.08 * v]));
  }
  return mergeGeometries(parts);
}

// far away a tree is just a dark cone
function farTreeGeo() {
  return colored(new THREE.ConeGeometry(1, 1, 6, 1, true).translate(0, 0.62, 0), [0.13, 0.21, 0.11]);
}

function instanced(geo, mat, list, matrixOf, colorOf) {
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  list.forEach((t, i) => {
    mesh.setMatrixAt(i, matrixOf(t, m));
    mesh.setColorAt(i, colorOf(t, c));
  });
  mesh.computeBoundingSphere();
  return mesh;
}

// ------------------------------------------------------------- paths --
// a ribbon along a path, draped over the ground
function ribbon(path, width, mat, lift = 0.06) {
  const pts = new THREE.CatmullRomCurve3(path.map(([x, z]) => new THREE.Vector3(x, 0, z))).getSpacedPoints(Math.ceil(lengthOf(path) / 1.2));
  const pos = [], uv = [], idx = [];
  let v = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
    const dx = q.x - o.x, dz = q.z - o.z, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    if (i > 0) v += p.distanceTo(pts[i - 1]) / 4;
    for (const s of [-1, 1]) {
      const x = p.x + nx * s * width / 2, z = p.z + nz * s * width / 2;
      pos.push(x, terrainH(x, z) + lift, z);
      uv.push(s < 0 ? 0 : 1, v);
    }
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  return mesh;
}
const lengthOf = (path) => path.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) : 0), 0);

export class Land {
  constructor() {
    this.near = new THREE.Group();
    this.far = new THREE.Group();

    // ---------------------------------------------------------- ground
    const floor = TX.forestFloor();
    const nearMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: floor });
    const nearGround = new THREE.Mesh(polarGround(0, NEAR_EDGE, 288, 1.1, 1.034, 2.6), nearMat);
    nearGround.receiveShadow = true;
    this.near.add(nearGround);
    this.ground = nearGround;
    const farMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: TX.canopy() });
    this.far.add(new THREE.Mesh(polarGround(FAR_START, 11000, 200, 8, 1.035, 70), farMat));

    // ---------------------------------------------------------- trees
    const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    // close up the trees get every tier and branch; further out, fewer
    const geo = [[firGeo(7, 9), pineGeo(11, true)], [firGeo(4, 6), pineGeo(5, false)]];
    const far = farTreeGeo();
    const sectors = new Map();
    for (const t of TREES) {
      const r = Math.hypot(t.x, t.z);
      const k = `${Math.floor(((Math.atan2(t.z, t.x) + Math.PI) / (Math.PI * 2)) * 16)}:${r < 50 ? 0 : 1}:${t.kind}`;
      if (!sectors.has(k)) sectors.set(k, []);
      sectors.get(k).push(t);
    }
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s = new THREE.Vector3();
    for (const [k, list] of sectors) {
      const [, ring, kind] = k.split(':').map(Number);
      const mesh = instanced(geo[ring][kind], treeMat, list, (t, m) => {
        q.setFromAxisAngle(up, t.tint * 40);
        const w = t.h * (kind ? 0.28 : 0.13);
        return m.compose(v.set(t.x, t.y - 0.3, t.z), q, s.set(w, t.h, w));
      }, (t, c) => c.setScalar(0.8 + t.tint * 0.4));
      mesh.castShadow = ring === 0;
      this.near.add(mesh);
    }
    // the forest beyond, as far as the near ground goes
    const rng = makeRng('cinder-far-trees');
    const mid = new Map();
    const cell = 6.6;
    for (let gx = -MID_R; gx <= MID_R; gx += cell) {
      for (let gz = -MID_R; gz <= MID_R; gz += cell) {
        const x = gx + (rng() - 0.5) * cell, z = gz + (rng() - 0.5) * cell;
        const r = Math.hypot(x, z), keep = rng(), h = 14 + rng() * 14, tint = rng();
        if (r < NEAR_R + 4 || r > MID_R || keep < 0.15) continue;
        if (nearPath(ROAD, x, z) < 4) continue;
        const y = terrainH(x, z);
        if (y > 240 || slope(x, z) > 1.3) continue;
        const key = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 24) * 2 + (r < 330 ? 0 : 1);
        if (!mid.has(key)) mid.set(key, []);
        mid.get(key).push({ x, y, z, h, tint });
      }
    }
    for (const list of mid.values()) {
      this.near.add(instanced(far, treeMat, list, (t, m) => m.compose(v.set(t.x, t.y - 0.5, t.z), q.identity(), s.set(t.h * 0.2, t.h, t.h * 0.2)),
        (t, c) => c.setScalar(0.75 + t.tint * 0.5)));
    }

    // ---------------------------------------------------------- paths
    const roadMat = new THREE.MeshLambertMaterial({ map: TX.dirt(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.near.add(ribbon(ROAD, 3.6, roadMat));
    const trailMat = new THREE.MeshLambertMaterial({ map: TX.dirt(), color: 0x9a8a72, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.near.add(ribbon(TRAIL, 1.2, trailMat, 0.05));
    this.near.add(ribbon(SPRING_TRAIL, 1.1, trailMat, 0.05));

    // ---------------------------------------------------------- smoke
    // a wildfire's column, far off on a ridge, for the fire finder
    this.smoke = new THREE.Group();
    this.smoke.visible = false;
    const puffMat = (o) => new THREE.SpriteMaterial({ map: TX.puff(), color: 0xd8d0c4, transparent: true, depthWrite: false, opacity: o });
    this.puffs = [];
    for (let i = 0; i < 26; i++) {
      const sp = new THREE.Sprite(puffMat(0.8));
      this.smoke.add(sp);
      this.puffs.push({ sp, k: i / 26, drift: (rng() - 0.5) * 0.4 });
    }
    this.far.add(this.smoke);
  }

  // a column of smoke at a compass bearing (degrees), or none
  setSmoke(bearing) {
    if (bearing == null) { this.smoke.visible = false; return; }
    const a = bearing * Math.PI / 180, d = 2700;
    const x = Math.sin(a) * d, z = -Math.cos(a) * d;
    this.smoke.position.set(x, terrainH(x, z) + 10, z);
    this.smoke.visible = true;
    this.smokeBearing = bearing;
  }

  update(t) {
    if (!this.smoke.visible) return;
    for (const p of this.puffs) {
      const k = (p.k + t * 0.012) % 1;
      const size = 60 + k * 260;
      p.sp.position.set(k * 160 + p.drift * k * 200, k * 520, p.drift * 120 * k);
      p.sp.scale.set(size, size, 1);
      p.sp.material.opacity = Math.min(1, k * 8) * (1 - k) * 0.55;
      p.sp.material.color.setRGB(0.8 - k * 0.1, 0.76 - k * 0.12, 0.7 - k * 0.12);
    }
  }
}
