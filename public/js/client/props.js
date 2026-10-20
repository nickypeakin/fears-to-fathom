// Furniture and fittings, built from rounded primitives. Everything faces +z
// with its origin on the floor at its centre. Pieces with moving parts
// (wardrobe and closet doors, the shower curtain) mark those parts with
// userData.moving so the world can animate them and merge the rest.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as TX from './textures.js';

const mats = new Map();
export function mat(color, o = {}) {
  const key = JSON.stringify([color, o.map && o.map.uuid, o.rough, o.metal, o.emissive, o.ei, o.opacity, o.side, o.alphaMap && o.alphaMap.uuid, o.env]);
  if (!mats.has(key)) {
    const m = new THREE.MeshStandardMaterial({
      color, map: o.map || null, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0,
      emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1,
      transparent: o.opacity != null, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide,
    });
    if (o.alphaMap) { m.alphaMap = o.alphaMap; m.alphaTest = 0.5; }
    if (o.env != null) m.envMapIntensity = o.env;
    mats.set(key, m);
  }
  return mats.get(key);
}

const geos = new Map();
function cachedGeo(key, make) {
  if (!geos.has(key)) geos.set(key, make());
  return geos.get(key);
}
const rbox = (w, h, d, r = 0.02) => cachedGeo(`rb${w}:${h}:${d}:${r}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)));
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
const ballGeo = new THREE.SphereGeometry(1, 20, 14);
const leafGeo = new THREE.SphereGeometry(1, 10, 8);   // leaves are thin: their outline is all that shows

function place(parent, geo, material, x, y, z) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
export const block = (g, m, x, y, z, w, h, d, r) => place(g, rbox(w, h, d, r), m, x, y, z);
export function cyl(g, m, x, y, z, r, h) {
  const c = place(g, cylGeo, m, x, y, z);
  c.scale.set(r, h, r);
  return c;
}
export function ball(g, m, x, y, z, sx, sy = sx, sz = sx) {
  const b = place(g, ballGeo, m, x, y, z);
  b.scale.set(sx, sy, sz);
  return b;
}
function legs(g, m, w, d, h, inset = 0.06, r = 0.025) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, m, sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset), r, h);
}
function lathe(key, pts, segs = 24) {
  return cachedGeo(key, () => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs));
}

const wood = (tone, key, rough = 0.55) => mat(0xffffff, { map: TX.wood(tone, key), rough });
const cloth = (color) => mat(color, { map: TX.fabric(), rough: 0.95 });
const DARK = 0x2a211b;
export const METAL = () => mat(0x9a9a98, { rough: 0.3, metal: 0.9 });
const STEEL = () => mat(0xc8cacc, { map: TX.brushed(), rough: 0.35, metal: 0.85 });
const PORCELAIN = () => mat(0xf4f4f0, { rough: 0.12, env: 1.2 });
const glowMat = (color = 0xffe2b0, ei = 1.4) => mat(0xfff1d8, { emissive: color, ei, rough: 0.6, side: THREE.DoubleSide });
const WHITE_CAB = () => mat(0xeeebe4, { rough: 0.45 });
const STONE = () => mat(0x3c3a38, { rough: 0.25, env: 1.0 });

// a pair of louvred doors, each hinged at its outer edge (local x = ±w/2),
// returned so they can swing open
function louvredDoors(g, w, h, y0, z, tone) {
  const doors = [];
  const m = mat(tone, { rough: 0.6, alphaMap: TX.louvres(), side: THREE.DoubleSide });
  const frame = mat(tone, { rough: 0.6 });
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(s * w / 2, y0, z);
    g.add(hinge);
    const leafW = w / 2 - 0.006;
    const panel = new THREE.Mesh(cachedGeo(`louv${leafW}:${h}`, () => new THREE.PlaneGeometry(leafW, h)), m);
    panel.position.set(-s * leafW / 2, h / 2, 0);
    panel.castShadow = true;
    hinge.add(panel);
    // stiles and rails around the slats
    for (const [x, y, ww, hh] of [[-s * 0.03, h / 2, 0.05, h], [-s * (leafW - 0.03), h / 2, 0.05, h], [-s * leafW / 2, 0.06, leafW, 0.11], [-s * leafW / 2, h - 0.06, leafW, 0.11], [-s * leafW / 2, h / 2, leafW, 0.07]]) {
      const b = block(hinge, frame, x, y, 0, ww, hh, 0.028, 0.006);
      b.castShadow = true;
    }
    block(hinge, METAL(), -s * (leafW - 0.07), h * 0.5, 0.025, 0.015, 0.12, 0.02, 0.005);
    hinge.userData.moving = true;
    hinge.userData.side = s;
    doors.push(hinge);
  }
  return doors;
}

// ------------------------------------------------------------- furniture --
const build = {
  sofa(g, f) {
    const c = cloth(f.color ?? 0x5f6b72);
    block(g, c, 0, 0.27, 0, 2.2, 0.3, 0.92, 0.06);
    for (const x of [-0.52, 0.52]) block(g, c, x, 0.5, 0.07, 1.02, 0.17, 0.76, 0.07);
    block(g, c, 0, 0.56, -0.38, 2.2, 0.58, 0.16, 0.05);
    for (const x of [-0.51, 0.51]) {
      const b = block(g, c, x, 0.76, -0.28, 1.0, 0.46, 0.2, 0.08);
      b.rotation.x = -0.14;
    }
    for (const x of [-1.0, 1.0]) block(g, c, x, 0.4, 0, 0.2, 0.6, 0.92, 0.08);
    const pil = [cloth(0xd9c9a8), cloth(0x9a5a3a)];
    [-0.7, 0.75].forEach((x, i) => {
      const p = block(g, pil[i], x, 0.72, -0.15, 0.4, 0.36, 0.12, 0.06);
      p.rotation.set(-0.2, x > 0 ? -0.25 : 0.25, x > 0 ? 0.12 : -0.12);
    });
    const throwBlanket = block(g, cloth(0xb8a88a), 0.75, 0.6, 0.12, 0.5, 0.04, 0.6, 0.02);
    throwBlanket.rotation.z = 0.05;
    legs(g, mat(DARK, { rough: 0.5 }), 2.1, 0.85, 0.12, 0.05, 0.022);
  },
  armchair(g, f) {
    const c = cloth(f.small ? 0x8a6a4a : 0x7a8a6a);
    const k = f.small ? 0.9 : 1;
    block(g, c, 0, 0.27, 0, 0.95 * k, 0.3, 0.88 * k, 0.06);
    block(g, c, 0, 0.5, 0.06, 0.6 * k, 0.16, 0.72 * k, 0.07);
    const back = block(g, c, 0, 0.74, -0.32 * k, 0.92 * k, 0.72, 0.2, 0.08);
    back.rotation.x = -0.1;
    for (const x of [-0.38, 0.38]) block(g, c, x * k, 0.42, 0, 0.18, 0.48, 0.88 * k, 0.08);
    legs(g, mat(DARK, { rough: 0.5 }), 0.85 * k, 0.78 * k, 0.12, 0.05, 0.022);
  },
  coffeeTable(g) {
    const w = wood('#6a4428', 'woodWalnut', 0.4);
    block(g, w, 0, 0.42, 0, 1.1, 0.04, 0.6, 0.012);
    block(g, w, 0, 0.13, 0, 1.0, 0.025, 0.5, 0.008);
    legs(g, w, 1.1, 0.6, 0.4, 0.05, 0.022);
    block(g, mat(0x7b2e2a, { rough: 0.7 }), -0.28, 0.46, 0.05, 0.26, 0.035, 0.2, 0.006);
    block(g, mat(0x2e4a6b, { rough: 0.7 }), -0.27, 0.49, 0.04, 0.24, 0.028, 0.18, 0.006);
    place(g, lathe('mug', [[0, 0], [0.04, 0], [0.042, 0.09], [0.038, 0.09], [0.036, 0.01], [0, 0.01]], 18), mat(0xe8e2d6, { rough: 0.2 }), 0.25, 0.44, -0.08);
    place(g, lathe('bowl', [[0, 0], [0.06, 0.005], [0.12, 0.05], [0.115, 0.055], [0.055, 0.012], [0, 0.012]], 24), mat(0x2d4a48, { rough: 0.25 }), 0.32, 0.44, 0.12);
  },
  floorLamp(g) {
    const metal = mat(0x2a2a2a, { rough: 0.4, metal: 0.6 });
    cyl(g, metal, 0, 0.015, 0, 0.16, 0.03);
    cyl(g, metal, 0, 0.78, 0, 0.012, 1.56);
    const shade = place(g, cachedGeo('shade', () => new THREE.CylinderGeometry(0.17, 0.24, 0.32, 28, 1, true)), glowMat(0xffd9a0, 1.2), 0, 1.58, 0);
    shade.userData.lamp = true;
  },
  bookshelf(g) {
    const w = wood('#c9a77a', 'woodPale');
    block(g, w, -0.48, 1.0, 0, 0.04, 2.0, 0.34, 0.01);
    block(g, w, 0.48, 1.0, 0, 0.04, 2.0, 0.34, 0.01);
    block(g, w, 0, 1.0, -0.16, 1.0, 2.0, 0.02, 0.005);
    const bk = new THREE.MeshStandardMaterial({ map: TX.books(), roughness: 0.8 });
    for (let i = 0; i < 5; i++) {
      block(g, w, 0, 0.02 + i * 0.47, 0, 0.96, 0.03, 0.34, 0.008);
      if (i < 4) {
        const p = new THREE.Mesh(cachedGeo('bookFace', () => new THREE.PlaneGeometry(0.92, 0.36)), bk);
        p.position.set(0, 0.22 + i * 0.47, 0.08);
        g.add(p);
        const blockBooks = block(g, mat(0x2a2018), 0, 0.22 + i * 0.47, -0.04, 0.92, 0.34, 0.24, 0.004);
        blockBooks.castShadow = false;
      }
    }
  },
  plant(g) {
    place(g, lathe('pot', [[0, 0], [0.15, 0], [0.2, 0.36], [0.19, 0.37], [0, 0.35]], 24), mat(0xd8d2c8, { rough: 0.5 }), 0, 0, 0);
    cyl(g, mat(0x3b2a1d, { rough: 1 }), 0, 0.345, 0, 0.18, 0.02);
    const leaf = [mat(0x3f6e33, { rough: 0.6, side: THREE.DoubleSide }), mat(0x58893f, { rough: 0.6, side: THREE.DoubleSide })];
    for (let i = 0; i < 18; i++) {
      const a = i * 2.39996, tilt = 0.3 + (i % 4) * 0.17, len = 0.36 + (i % 3) * 0.12;
      const stem = new THREE.Group();
      stem.position.set(0, 0.36, 0);
      stem.rotation.set(0, a, 0);
      g.add(stem);
      const bend = new THREE.Group();
      bend.rotation.x = tilt;
      stem.add(bend);
      place(bend, leafGeo, leaf[i % 2], 0, len, 0).scale.set(0.07, len * 0.55, 0.012);
    }
  },
  console(g) {
    const w = wood('#3b2a20', 'woodDark', 0.45);
    block(g, w, 0, 0.78, 0, 0.9, 0.04, 0.35, 0.01);
    legs(g, w, 0.9, 0.35, 0.76, 0.03, 0.016);
    place(g, lathe('keyBowl', [[0, 0], [0.05, 0.005], [0.1, 0.04], [0.095, 0.045], [0.045, 0.01], [0, 0.01]], 20), mat(0xb8a070, { rough: 0.3, metal: 0.7 }), -0.2, 0.8, 0);
    const frame = block(g, mat(0x111111, { rough: 0.4 }), 0.25, 0.9, -0.08, 0.16, 0.2, 0.015, 0.004);
    frame.rotation.x = -0.15;
    const pic = new THREE.Mesh(cachedGeo('photoFace', () => new THREE.PlaneGeometry(0.13, 0.17)), new THREE.MeshStandardMaterial({ map: TX.painting(2), roughness: 0.5 }));
    pic.position.set(0.25, 0.9, -0.071);
    pic.rotation.x = -0.15;
    g.add(pic);
  },
  fridge(g) {
    const s = STEEL();
    block(g, s, 0, 0.95, 0, 0.74, 1.9, 0.72, 0.02);
    block(g, mat(0x1a1a1a, { rough: 0.5 }), 0, 1.22, 0.362, 0.72, 0.008, 0.004, 0.001);
    for (const [y, h] of [[1.55, 0.5], [0.65, 0.5]]) block(g, METAL(), 0.3, y, 0.39, 0.025, h, 0.03, 0.008);
  },
  counter(g, f) {
    const L = f.w;
    const cab = WHITE_CAB();
    block(g, cab, 0, 0.45, 0.01, L, 0.82, 0.6, 0.01);
    block(g, mat(0x111111), 0, 0.05, 0.27, L, 0.1, 0.02, 0.004);
    block(g, STONE(), 0, 0.89, 0.02, L + 0.02, 0.04, 0.64, 0.006);
    // door seams and handles
    const n = Math.max(1, Math.round(L / 0.6));
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + (i + 0.5) * (L / n);
      block(g, mat(0xd8d4cc, { rough: 0.5 }), x - L / n / 2 + 0.002, 0.47, 0.312, 0.004, 0.72, 0.004, 0.001);
      block(g, METAL(), x + 0.18 * (i % 2 ? -1 : 1) * Math.min(1, L / n / 0.6), 0.75, 0.33, 0.012, 0.16, 0.02, 0.005);
    }
    // backsplash and wall cabinets
    block(g, mat(0xdcd8d0, { map: TX.tiles('#e2ded6', 'subway', 6), rough: 0.25 }), 0, 1.2, -0.29, L, 0.58, 0.02, 0.004);
    block(g, cab, 0, 1.9, -0.13, L, 0.72, 0.34, 0.01);
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + (i + 0.5) * (L / n);
      block(g, mat(0xd8d4cc, { rough: 0.5 }), x - L / n / 2 + 0.002, 1.9, 0.042, 0.004, 0.66, 0.004, 0.001);
      block(g, METAL(), x + 0.18 * (i % 2 ? -1 : 1) * Math.min(1, L / n / 0.6), 1.62, 0.05, 0.12, 0.012, 0.02, 0.005);
    }
    // under-cabinet light strip
    const strip = block(g, glowMat(0xfff0d0, 1.5), 0, 1.535, -0.05, L - 0.1, 0.01, 0.03, 0.003);
    strip.userData.lamp = true;
    if (f.sink) {
      block(g, mat(0x9a9c9e, { rough: 0.25, metal: 0.8 }), 0.15, 0.885, 0.02, 0.55, 0.05, 0.42, 0.02);
      block(g, mat(0x5a5c5e, { rough: 0.3, metal: 0.8 }), 0.15, 0.87, 0.02, 0.5, 0.05, 0.37, 0.02);
      const tap = new THREE.Group();
      tap.position.set(0.15, 0.91, -0.2);
      g.add(tap);
      cyl(tap, METAL(), 0, 0.15, 0, 0.014, 0.3);
      const spout = cyl(tap, METAL(), 0, 0.3, 0.08, 0.012, 0.18);
      spout.rotation.x = Math.PI / 2;
    }
    if (f.stove) {
      block(g, mat(0x0c0c0e, { rough: 0.1 }), 0, 0.913, 0.02, 0.6, 0.008, 0.52, 0.004);
      for (const [x, z, r] of [[-0.14, -0.12, 0.09], [0.14, -0.12, 0.07], [-0.14, 0.12, 0.07], [0.14, 0.12, 0.09]]) {
        const ring = place(g, cachedGeo(`hob${r}`, () => new THREE.RingGeometry(r * 0.85, r, 32)), mat(0x3a3a3a, { rough: 0.3 }), x, 0.918, z + 0.02);
        ring.rotation.x = -Math.PI / 2;
      }
      block(g, mat(0x111111, { rough: 0.15 }), 0, 0.45, 0.31, 0.58, 0.5, 0.01, 0.004);
      block(g, METAL(), 0, 0.73, 0.33, 0.45, 0.02, 0.025, 0.008);
      block(g, STEEL(), 0, 2.0, -0.15, 0.6, 0.3, 0.32, 0.01);
    }
  },
  diningTable(g) {
    const w = wood('#8a5a35', 'wood');
    block(g, w, 0, 0.74, 0, 1.4, 0.04, 0.85, 0.012);
    block(g, w, 0, 0.69, 0, 1.25, 0.06, 0.72, 0.008);
    legs(g, w, 1.4, 0.85, 0.72, 0.08, 0.028);
    place(g, lathe('vase', [[0, 0], [0.05, 0], [0.07, 0.06], [0.05, 0.16], [0.03, 0.22], [0.035, 0.24], [0, 0.24]], 20), mat(0xe8e0d0, { rough: 0.25 }), 0.1, 0.76, 0);
    for (let i = 0; i < 3; i++) {
      const st = cyl(g, mat(0x5a7a3a, { rough: 0.7 }), 0.1 + (i - 1) * 0.02, 1.08, (i - 1) * 0.015, 0.003, 0.25);
      st.rotation.z = (i - 1) * 0.2;
      ball(g, mat([0xd8402a, 0xe8c040, 0xf0e8e0][i], { rough: 0.6 }), 0.1 + (i - 1) * 0.045, 1.2, (i - 1) * 0.03, 0.03);
    }
  },
  chair(g) {
    const w = wood('#8a5a35', 'wood');
    block(g, w, 0, 0.46, 0, 0.44, 0.04, 0.44, 0.012);
    block(g, cloth(0xb8a080), 0, 0.485, 0.01, 0.4, 0.02, 0.38, 0.01);
    legs(g, w, 0.44, 0.44, 0.44, 0.03, 0.016);
    for (const x of [-0.19, 0.19]) block(g, w, x, 0.73, -0.2, 0.035, 0.55, 0.035, 0.01);
    block(g, w, 0, 0.94, -0.2, 0.42, 0.1, 0.03, 0.01);
    block(g, w, 0, 0.74, -0.2, 0.34, 0.04, 0.02, 0.008);
  },
  tub(g, f) {
    const p = PORCELAIN();
    block(g, p, 0, 0.27, 0, f.w, 0.54, f.d, 0.04);
    block(g, mat(0xeaf0f0, { rough: 0.08 }), 0, 0.5, 0.02, f.w - 0.14, 0.06, f.d - 0.16, 0.08);
    // tiled walls around the tub
    block(g, mat(0xffffff, { map: TX.tiles('#cfd8d8', 'bathTiles', 5), rough: 0.2 }), 0, 1.45, -f.d / 2 + 0.01, f.w, 1.8, 0.02, 0.004);
    const tap = new THREE.Group();
    tap.position.set(-f.w / 2 + 0.12, 0, -f.d / 2 + 0.05);
    g.add(tap);
    cyl(tap, METAL(), 0, 0.7, 0, 0.012, 0.12);
    cyl(tap, METAL(), 0, 1.25, 0.02, 0.01, 0.95);
    const head = cyl(tap, METAL(), 0, 1.75, 0.09, 0.05, 0.02);
    head.rotation.x = -0.6;
    // curtain rod and the curtain itself (it slides open when he checks)
    const rod = cyl(g, METAL(), 0, 1.95, f.d / 2 - 0.02, 0.01, f.w);
    rod.rotation.z = Math.PI / 2;
    const curtain = new THREE.Group();
    curtain.position.set(0, 0, f.d / 2 - 0.02);
    curtain.userData.moving = true;
    curtain.userData.curtain = true;
    g.add(curtain);
    const geo = cachedGeo(`curtain${f.w}`, () => {
      const pg = new THREE.PlaneGeometry(f.w, 1.55, 40, 1);
      const pos = pg.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 22) * 0.025);
      pg.computeVertexNormals();
      return pg;
    });
    const cm = new THREE.Mesh(geo, mat(0xe8e4dc, { rough: 0.85, side: THREE.DoubleSide, opacity: 0.94 }));
    cm.position.set(0, 1.92 - 0.78, 0);
    cm.castShadow = true;
    curtain.add(cm);
  },
  toilet(g) {
    const p = PORCELAIN();
    place(g, lathe('bowlBase', [[0, 0], [0.13, 0], [0.11, 0.2], [0.16, 0.36], [0.17, 0.4], [0, 0.4]], 24), p, 0, 0, 0.05).scale.set(1, 1, 1.25);
    block(g, p, 0, 0.42, 0.05, 0.36, 0.03, 0.46, 0.08).scale.z = 1;
    block(g, p, 0, 0.6, -0.24, 0.42, 0.42, 0.18, 0.03);
    block(g, p, 0, 0.82, -0.24, 0.44, 0.03, 0.2, 0.01);
    cyl(g, METAL(), 0.15, 0.74, -0.14, 0.012, 0.02).rotation.x = Math.PI / 2;
  },
  vanity(g) {
    const cab = mat(0xffffff, { map: TX.wood('#5a4a3a', 'vanityWood'), rough: 0.5 });
    block(g, cab, 0, 0.42, 0, 0.9, 0.78, 0.5, 0.01);
    block(g, mat(0xf2f2ee, { rough: 0.12 }), 0, 0.83, 0, 0.92, 0.04, 0.52, 0.01);
    const basin = place(g, lathe('basin', [[0, 0], [0.16, 0.0], [0.2, 0.08], [0.19, 0.085], [0.15, 0.01], [0, 0.01]], 28), PORCELAIN(), 0, 0.85, 0.02);
    basin.scale.set(1, 1, 0.75);
    const tap = cyl(g, METAL(), 0, 0.95, -0.17, 0.012, 0.2);
    const spout = cyl(g, METAL(), 0, 1.04, -0.12, 0.01, 0.1);
    spout.rotation.x = Math.PI / 2;
    tap.castShadow = false;
    for (const x of [-0.22, 0.22]) block(g, METAL(), x, 0.68, 0.255, 0.1, 0.012, 0.02, 0.005);
    // mirror cabinet above
    block(g, mat(0x222222, { rough: 0.4 }), 0, 1.55, -0.2, 0.7, 0.8, 0.1, 0.01);
    const mirror = new THREE.Mesh(cachedGeo('mirrorFace', () => new THREE.PlaneGeometry(0.66, 0.76)), mat(0xbfc8cc, { rough: 0.02, metal: 1, env: 1.6 }));
    mirror.position.set(0, 1.55, -0.148);
    g.add(mirror);
    const bar = block(g, glowMat(0xfff4e0, 1.6), 0, 2.0, -0.17, 0.6, 0.05, 0.06, 0.02);
    bar.userData.lamp = true;
  },
  bathMat(g, f) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.d), mat(0x7a9aa8, { map: TX.fabric(), rough: 1 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.006;
    m.receiveShadow = true;
    g.add(m);
  },
  bed(g, f) {
    const W = f.w, D = f.d;
    const w = wood('#6e4a2e', 'woodBed');
    // frame on legs: a dark gap underneath you can crawl into
    block(g, w, 0, 0.32, 0.03, W, 0.12, D - 0.06, 0.02);
    legs(g, w, W, D - 0.06, 0.28, 0.06, 0.03);
    block(g, cloth(0xf4f1ea), 0, 0.48, 0.03, W - 0.06, 0.22, D - 0.12, 0.08);
    const duvet = block(g, cloth(f.color), 0, 0.6, 0.25, W + 0.02, 0.08, D - 0.5, 0.04);
    duvet.scale.y = 1;
    block(g, cloth(f.color), 0, 0.4, D / 2 - 0.02, W + 0.02, 0.36, 0.05, 0.02);
    for (const s of [-1, 1]) block(g, cloth(f.color), s * (W / 2 + 0.005), 0.42, 0.25, 0.04, 0.34, D - 0.5, 0.02);
    const n = W > 1.5 ? 2 : 2;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * (W / n);
      const p = block(g, cloth(0xffffff), x, 0.66, -D / 2 + 0.3, W / n - 0.1, 0.15, 0.38, 0.07);
      p.rotation.x = -0.18;
    }
    block(g, cloth(0x6a5a4a), 0, 0.8, -D / 2 + 0.03, W + 0.08, 1.0, 0.07, 0.03);
  },
  nightstand(g) {
    const w = wood('#6e4a2e', 'woodBed');
    block(g, w, 0, 0.27, 0, 0.46, 0.54, 0.4, 0.02);
    block(g, w, 0, 0.38, 0.203, 0.4, 0.16, 0.02, 0.008);
    ball(g, METAL(), 0, 0.38, 0.22, 0.014);
    place(g, lathe('lampBase', [[0.001, 0], [0.05, 0], [0.07, 0.035], [0.06, 0.07], [0.02, 0.105], [0.015, 0.175]], 18), mat(0xd8d0c0, { rough: 0.3 }), 0, 0.54, -0.03);
    const shade = place(g, cachedGeo('smallShade', () => new THREE.CylinderGeometry(0.09, 0.13, 0.16, 20, 1, true)), glowMat(0xffd9a0, 1.1), 0, 0.8, -0.03);
    shade.userData.lamp = true;
  },
  dresser(g) {
    const w = wood('#a77b52', 'woodLight');
    block(g, w, 0, 0.42, 0, 1.2, 0.8, 0.5, 0.02);
    for (let i = 0; i < 3; i++) {
      block(g, w, 0, 0.17 + i * 0.25, 0.255, 1.12, 0.21, 0.02, 0.008);
      for (const x of [-0.3, 0.3]) block(g, METAL(), x, 0.17 + i * 0.25, 0.275, 0.12, 0.015, 0.02, 0.006);
    }
    place(g, lathe('jar', [[0, 0], [0.05, 0], [0.06, 0.1], [0.04, 0.16], [0, 0.16]], 16), mat(0x4a6a7a, { rough: 0.2 }), -0.4, 0.82, 0);
    block(g, mat(0x1a1a1a, { rough: 0.4 }), 0.25, 1.15, -0.2, 0.5, 0.65, 0.03, 0.01);
    const pic = new THREE.Mesh(cachedGeo('dresserArt', () => new THREE.PlaneGeometry(0.44, 0.58)), new THREE.MeshStandardMaterial({ map: TX.painting(1), roughness: 0.6 }));
    pic.position.set(0.25, 1.15, -0.183);
    g.add(pic);
  },
  wardrobe(g, f) {
    const W = f.w, D = f.d;
    const body = mat(0xe9e6df, { rough: 0.5 });
    // back, sides, top and bottom: open at the front for the doors
    block(g, body, 0, 1.05, -D / 2 + 0.01, W, 2.1, 0.02, 0.005);
    for (const s of [-1, 1]) block(g, body, s * (W / 2 - 0.01), 1.05, 0, 0.02, 2.1, D, 0.005);
    block(g, body, 0, 2.09, 0, W, 0.02, D, 0.005);
    block(g, body, 0, 0.03, 0, W, 0.06, D, 0.005);
    // clothes inside on a rail
    cyl(g, METAL(), 0, 1.75, 0, 0.01, W - 0.06).rotation.z = Math.PI / 2;
    const cols = [0x2a3a5a, 0x8a2a2a, 0xd8d0c0, 0x3a3a3a, 0x5a7a5a, 0xa88a5a];
    for (let i = 0; i < 6; i++) {
      const c = block(g, cloth(cols[i]), -W / 2 + 0.18 + i * (W - 0.36) / 5, 1.35, 0.02, 0.04, 0.75, 0.42, 0.015);
      c.rotation.y = 0.15 * (i % 2 ? 1 : -1);
    }
    g.userData.doors = louvredDoors(g, W - 0.02, 2.02, 0.05, D / 2 - 0.015, 0xe9e6df);
  },
  coatCloset(g, f) {
    const W = f.w, D = f.d;
    const body = mat(0xe4e0d8, { rough: 0.55 });
    block(g, body, 0, 1.2, -D / 2 + 0.01, W, 2.4, 0.02, 0.005);
    for (const s of [-1, 1]) block(g, body, s * (W / 2 - 0.01), 1.2, 0, 0.02, 2.4, D, 0.005);
    block(g, body, 0, 2.39, 0, W, 0.02, D, 0.005);
    block(g, body, 0, 2.2, 0, W, 0.38, D - 0.02, 0.005);
    cyl(g, METAL(), 0, 1.75, -0.02, 0.01, W - 0.06).rotation.z = Math.PI / 2;
    const cols = [0x3a2a1e, 0x22283a, 0x6a6058, 0x1a1a1a];
    for (let i = 0; i < 4; i++) {
      const c = block(g, cloth(cols[i]), -W / 2 + 0.25 + i * 0.3, 1.25, 0.0, 0.08, 0.95, 0.46, 0.03);
      c.rotation.y = 0.1 * (i % 2 ? 1 : -1);
    }
    block(g, mat(0x2a2a2a, { rough: 0.6 }), -0.3, 0.06, 0.05, 0.3, 0.1, 0.12, 0.03);
    block(g, mat(0x5a3a22, { rough: 0.6 }), 0.1, 0.06, 0.08, 0.28, 0.11, 0.11, 0.03);
    g.userData.doors = louvredDoors(g, W - 0.04, 2.0, 0.02, D / 2 - 0.015, 0xe4e0d8);
  },
  rug(g, f) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.d), new THREE.MeshStandardMaterial({ map: TX.rugPattern(f.color), roughness: 1 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.005;
    m.receiveShadow = true;
    g.add(m);
  },
  runner(g, f) { build.rug(g, f); },
  art(g, f) {
    block(g, mat(0x1e1a18, { rough: 0.5 }), 0, f.y, 0.02, f.w + 0.06, f.h + 0.06, 0.035, 0.008);
    block(g, mat(0xf2efe6, { rough: 0.9 }), 0, f.y, 0.035, f.w, f.h, 0.01, 0.002);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(f.w * 0.8, f.h * 0.8), new THREE.MeshStandardMaterial({ map: TX.painting(f.seed), roughness: 0.6 }));
    p.position.set(0, f.y, 0.042);
    g.add(p);
  },
};

export function furniture(f) {
  const g = new THREE.Group();
  build[f.type](g, f);
  g.position.set(f.x, 0, f.z);
  g.rotation.y = f.rot || 0;
  return g;
}

// a pendant lamp hanging from the ceiling at height `ceil`
export function pendant(ceil, drop = 0.9) {
  const g = new THREE.Group();
  cyl(g, mat(0x111111), 0, ceil - drop / 2, 0, 0.004, drop);
  cyl(g, mat(0x222222, { rough: 0.4 }), 0, ceil - 0.01, 0, 0.06, 0.02);
  const shade = place(g, cachedGeo('pendantShade', () => new THREE.SphereGeometry(0.24, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2)), mat(0x1b2a2a, { rough: 0.35, metal: 0.4, side: THREE.DoubleSide }), 0, ceil - drop - 0.18, 0);
  shade.castShadow = false;
  const bulb = ball(g, glowMat(0xfff0c8, 2.5), 0, ceil - drop - 0.16, 0, 0.05);
  bulb.userData.lamp = true;
  return g;
}

// a flush ceiling light
export function ceilingLight(ceil, r = 0.17) {
  const g = new THREE.Group();
  const dome = place(g, cachedGeo(`dome${r}`, () => new THREE.SphereGeometry(r, 24, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), glowMat(0xfff4e2, 1.6), 0, ceil - 0.01, 0);
  dome.scale.y = 0.35;
  dome.userData.lamp = true;
  dome.castShadow = false;
  return g;
}

// a wall sconce for the corridor
export function sconce() {
  const g = new THREE.Group();
  block(g, mat(0x8a7a5a, { rough: 0.3, metal: 0.8 }), 0, 0, 0.01, 0.1, 0.16, 0.02, 0.006);
  const shade = place(g, cachedGeo('sconceShade', () => new THREE.CylinderGeometry(0.07, 0.1, 0.18, 20, 1, true)), glowMat(0xffd8a0, 1.6), 0, 0.03, 0.1);
  shade.userData.lamp = true;
  return g;
}
