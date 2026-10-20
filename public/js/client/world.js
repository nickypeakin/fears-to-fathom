// Floor 50: our apartment, the corridor outside it and the elevator that
// opens onto it, with the city beyond the glass. Built once at start-up and
// reused by the title screen and every night.
//
// Two scenes: `far` holds the sky and the skyline and is drawn first with a
// distant near plane; `scene` holds everything on this floor and is drawn
// over it. That keeps depth precise from 5 cm to 5 km.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import { furniture, pendant, ceilingLight, sconce, mat } from './props.js';
import { City } from './city.js';
import { FrontDoor } from './door.js';
import { elevatorCar, liftDoors } from './elevator.js';
import { WALLS, alongX, CEIL, HALL_CEIL, CORRIDOR, FURNITURE, HIDES, ELEVATOR, inside } from '../shared/layout.js';

// Bake a group of static meshes into one mesh per material.
function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const byMat = new Map();
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const key = o.material;
    if (!byMat.has(key)) byMat.set(key, { list: [], cast: false, lamp: false });
    const e = byMat.get(key);
    e.list.push(g);
    e.cast ||= o.castShadow;
    e.lamp ||= !!o.userData.lamp;
  });
  const out = new THREE.Group();
  for (const [material, e] of byMat) {
    const merged = new THREE.Mesh(mergeGeometries(e.list), material);
    merged.castShadow = e.cast;
    merged.receiveShadow = true;
    merged.userData.lamp = e.lamp;
    out.add(merged);
    for (const g of e.list) g.dispose();
  }
  return out;
}

// Merge every mesh under `group` (multi-material ones split by face group)
// into one mesh per material: hundreds of wall pieces become a few draw calls.
function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const byMat = new Map();
  const push = (m, g) => { if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(g); };
  group.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(src.attributes)) if (!['position', 'normal', 'uv'].includes(name)) src.deleteAttribute(name);
    if (!Array.isArray(o.material)) { push(o.material, src.index ? src.toNonIndexed() : src); return; }
    for (const grp of src.groups) {
      const part = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(src.attributes)) {
        const out = new Float32Array(grp.count * attr.itemSize);
        for (let k = 0; k < grp.count; k++) {
          const i = src.index.getX(grp.start + k);
          for (let c = 0; c < attr.itemSize; c++) out[k * attr.itemSize + c] = attr.array[i * attr.itemSize + c];
        }
        part.setAttribute(name, new THREE.BufferAttribute(out, attr.itemSize));
      }
      push(o.material[grp.materialIndex], part);
    }
  });
  const out = new THREE.Group();
  for (const [material, list] of byMat) {
    const m = new THREE.Mesh(mergeGeometries(list), material);
    m.castShadow = m.receiveShadow = true;
    out.add(m);
  }
  return out;
}

// A box whose faces carry world-space UVs (1 unit = 1 m) and a material
// chosen per face by what the face looks into.
function wallBox(x0, x1, z0, z1, y0, y1, pick) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const nx = nor.getX(i), nz = nor.getZ(i);
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (Math.abs(nx) > 0.5) uv.setXY(i, z, y);
    else if (Math.abs(nz) > 0.5) uv.setXY(i, x, y);
    else uv.setXY(i, x, z);
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  const probes = [[x1 + 0.05, cz], [x0 - 0.05, cz], null, null, [cx, z1 + 0.05], [cx, z0 - 0.05]];
  const mats = probes.map((p, i) => pick(p, i, cy));
  const m = new THREE.Mesh(g, mats);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const placed = (o, x, z) => { o.position.set(x, 0, z); return o; };
const inBath = (x, z) => x > 4.66 && x < 6.54 && z > 0 && z < 2.94;
const inCorridor = (x, z) => x > CORRIDOR.x0 - 0.3 && x < CORRIDOR.x1 + 0.3 && z > CORRIDOR.z0 && z < CORRIDOR.z1;

export class Tower {
  constructor(renderer) {
    const s = (this.scene = new THREE.Scene());
    this.far = new THREE.Scene();
    this.city = new City({ groundY: -150 });
    this.far.add(this.city.group);

    const pmrem = new THREE.PMREMGenerator(renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    s.environment = this.env;
    s.environmentIntensity = 0.25;

    this.lamps = { apt: [], corr: [] };       // emissive lamp materials by circuit
    this.lights = [];                          // { light, base, zone }
    this.hideParts = new Map();                // hide id -> [{ obj, kind, side }]
    this.swingers = {};                        // named doors that open

    this.buildShell();
    this.buildFurniture();
    this.buildLights();
    this.door = new FrontDoor(s);
    this.buildElevator();
    this.collectLamps();

    this.power = 1;
    this.flicker = 0;
    this.corrPower = 1;
    this.setHour(20);
  }

  // ------------------------------------------------------------- shell --
  buildShell() {
    const s = this.scene;
    const M = {
      paint: mat(0xffffff, { map: TX.tiled(TX.paint('#ebe5da', 'aptPaint'), 0.5, 0.5), rough: 0.92 }),
      accent: mat(0xffffff, { map: TX.tiled(TX.paint('#5b6a6e', 'aptAccent'), 0.5, 0.5), rough: 0.9 }),
      corr: mat(0xffffff, { map: TX.tiled(TX.wallpaper(), 1 / 1.1, 1 / 1.1), rough: 0.88 }),
      bath: mat(0xffffff, { map: TX.tiled(TX.tiles('#d6dcdc', 'bathWall', 4), 1 / 1.2, 1 / 1.2), rough: 0.25 }),
      ext: mat(0x2a2c30, { rough: 0.8 }),
      shaft: mat(0x111214, { rough: 0.9 }),
    };
    this.M = M;
    const pick = (p, face, cy) => {
      if (!p) return M.paint;
      const [x, z] = p;
      if (inCorridor(x, z)) return M.corr;
      if (inBath(x, z)) return M.bath;
      if (inside(x, z)) return (Math.abs(x - 4.6) < 0.2 && z > 4.2 && z < 8.5 && face === 1) ? M.accent : M.paint;
      if (z < -2.4 && x > 8 && x < 12.6) return M.shaft;
      return M.ext;
    };
    const walls = new THREE.Group();
    const trim = mat(0xf4f2ec, { rough: 0.5 });
    const darkTrim = mat(0xffffff, { map: TX.wood('#3a2418', 'corrWood'), rough: 0.45 });
    for (const w of WALLS) {
      const ax = alongX(w);
      const lo = ax ? w.x0 : w.z0, hi = ax ? w.x1 : w.z1;
      const seg = (a, b, y0, y1) => {
        if (b - a < 1e-3 || y1 - y0 < 1e-3) return;
        walls.add(ax ? wallBox(a, b, w.z0, w.z1, y0, y1, pick) : wallBox(w.x0, w.x1, a, b, y0, y1, pick));
      };
      const holes = [...w.holes].sort((a, b) => a.a0 - b.a0);
      let at = lo;
      for (const h of holes) {
        seg(at, h.a0, 0, w.h);
        seg(h.a0, h.a1, 0, h.y0);
        seg(h.a0, h.a1, h.y1, w.h);
        at = h.a1;
        this.fitHole(w, h, ax, trim, darkTrim);
      }
      seg(at, hi, 0, w.h);
      // baseboards (and wainscot in the corridor) on each side
      for (const side of [-1, 1]) {
        const face = ax ? (side < 0 ? w.z0 : w.z1) : (side < 0 ? w.x0 : w.x1);
        const mid = (lo + hi) / 2;
        const probe = ax ? [mid, face + side * 0.05] : [face + side * 0.05, mid];
        const corr = inCorridor(...probe);
        const room = inside(...probe) && !inBath(...probe);
        if (!corr && !room) continue;
        let a = lo;
        const runs = [];
        for (const h of holes) { if (h.y0 < 0.1) { runs.push([a, h.a0]); a = h.a1; } }
        runs.push([a, hi]);
        for (const [r0, r1] of runs) {
          if (r1 - r0 < 0.02) continue;
          const t = corr ? 0.025 : 0.012, ht = corr ? 0.95 : 0.1;
          const m = corr ? darkTrim : trim;
          const x0 = ax ? r0 : (side < 0 ? face - t : face), x1 = ax ? r1 : (side < 0 ? face : face + t);
          const z0 = ax ? (side < 0 ? face - t : face) : r0, z1 = ax ? (side < 0 ? face : face + t) : r1;
          const bb = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, ht, z1 - z0), m);
          bb.position.set((x0 + x1) / 2, ht / 2, (z0 + z1) / 2);
          bb.receiveShadow = true;
          walls.add(bb);
          if (corr) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + (ax ? 0 : 0.02), 0.05, z1 - z0 + (ax ? 0.02 : 0)), m);
            rail.position.set((x0 + x1) / 2, ht + 0.02, (z0 + z1) / 2);
            walls.add(rail);
          }
        }
      }
    }
    s.add(mergeByMaterial(walls));

    // floors and ceilings
    const plane = (w, d, m, x, y, z, up = true) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
      p.rotation.x = up ? -Math.PI / 2 : Math.PI / 2;
      p.position.set(x, y, z);
      p.receiveShadow = true;
      s.add(p);
      return p;
    };
    plane(10.2, 8.7, mat(0xffffff, { map: TX.tiled(TX.oakFloor(), 10.2 / 0.72, 8.7 / 1.44), rough: 0.38, env: 0.8 }), 5, 0, 4.25);
    plane(1.88, 2.94, mat(0xffffff, { map: TX.tiled(TX.tiles('#e4e0d8', 'bathFloor', 4), 1.88 / 1.0, 2.94 / 1.0), rough: 0.3 }), 5.6, 0.003, 1.47);
    plane(22.4, 2.4, mat(0xffffff, { map: TX.tiled(TX.corridorCarpet(), 22.4 / 1.3, 2.4 / 1.3), rough: 1 }), 11, 0, -1.3);
    plane(10.4, 8.9, mat(0xffffff, { map: TX.tiled(TX.paint('#f4f2ee', 'ceiling'), 2, 2), rough: 0.95 }), 5, CEIL, 4.25, false);
    plane(22.4, 2.5, mat(0xffffff, { map: TX.tiled(TX.paint('#e8e2d4', 'corrCeil'), 4, 1), rough: 0.95 }), 11, HALL_CEIL, -1.3, false);
    // the doormats either side of our door
    const matIn = plane(0.8, 0.5, mat(0x5a4a3c, { map: TX.fabric(), rough: 1 }), 1.6, 0.006, 0.5);
    matIn.castShadow = false;
    const welcome = plane(0.85, 0.52, new THREE.MeshStandardMaterial({ map: TX.sign('WELCOME', { w: 340, h: 208, bg: '#6a4a30', fg: '#c8a878', font: 'bold 54px Georgia, serif', border: '#4a3020' }), roughness: 1 }), 1.6, 0.006, -0.5);
    welcome.rotation.z = Math.PI;
    // curtains at the bedroom windows
    const curtain = mat(0xd8cfc0, { map: TX.fabric(), rough: 0.95, side: THREE.DoubleSide });
    const drape = (x, z, ry, w) => {
      const g = new THREE.PlaneGeometry(w, 2.3, 24, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 30) * 0.03);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, curtain);
      m.position.set(x, 1.3, z);
      m.rotation.y = ry;
      m.castShadow = true;
      s.add(m);
    };
    for (const x of [4.85, 9.75]) drape(x, 8.38, 0, 0.45);
    for (const z of [0.3, 2.7]) drape(9.88, z, Math.PI / 2, 0.4);
    // art
    const art = (x, z, ry, w, h, y, seed) => {
      const g = furniture({ type: 'art', x, z, rot: ry, w, h, y, seed });
      s.add(g);
    };
    art(4.53, 7.2, -Math.PI / 2, 1.1, 0.8, 1.55, 0);
    art(8.7, 0.01, 0, 0.9, 0.6, 1.62, 1);
    art(9.99, 6.4, -Math.PI / 2, 1.2, 0.7, 1.75, 2);
    art(7.4, 4.13, Math.PI, 0.8, 0.55, 1.55, 3);
    art(6.0, -2.39, 0, 0.9, 0.6, 1.6, 4);
    art(14.5, -2.39, 0, 0.9, 0.6, 1.6, 5);
    // a little table at the west end of the corridor, under the window
    const side = furniture({ type: 'console', x: 0.25, z: -1.3, rot: Math.PI / 2 });
    s.add(side);
    this.walls = walls;
  }

  // frames, glass and doors for one hole in a wall
  fitHole(w, h, ax, trim, darkTrim) {
    const s = this.scene;
    const t = ax ? w.z1 - w.z0 : w.x1 - w.x0;
    const c = ax ? (w.z0 + w.z1) / 2 : (w.x0 + w.x1) / 2;   // wall centreline across
    const mid = (h.a0 + h.a1) / 2, len = h.a1 - h.a0;
    const at = (a, across, y) => (ax ? new THREE.Vector3(a, y, across) : new THREE.Vector3(across, y, a));
    const boxAt = (m, a, across, y, la, lc, ly) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(ax ? la : lc, ly, ax ? lc : la), m);
      b.position.copy(at(a, across, y));
      b.castShadow = true;
      b.receiveShadow = true;
      s.add(b);
      return b;
    };
    const casing = (m, depth = t + 0.04) => {
      const hh = h.y1;
      boxAt(m, h.a0 - 0.035, c, hh / 2, 0.07, depth, hh + 0.07);
      boxAt(m, h.a1 + 0.035, c, hh / 2, 0.07, depth, hh + 0.07);
      boxAt(m, mid, c, hh + 0.035, len + 0.14, depth, 0.07);
    };
    // a door leaf hinged at one end of the hole, opened `open` radians
    const swing = (m, open, thick = 0.04) => {
      const pivot = new THREE.Group();
      const ha = h.hinge === 'hi' ? h.a1 : h.a0;
      const dirA = h.hinge === 'hi' ? -1 : 1;
      pivot.position.copy(at(ha, c + h.swing * (t / 2 - thick / 2), 0));
      s.add(pivot);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(ax ? len - 0.01 : thick, h.y1 - 0.01, ax ? thick : len - 0.01), m);
      leaf.position.copy(ax ? new THREE.Vector3(dirA * len / 2, (h.y1 - 0.01) / 2, 0) : new THREE.Vector3(0, (h.y1 - 0.01) / 2, dirA * len / 2));
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      pivot.add(leaf);
      // a knob on both faces near the free edge
      for (const f of [-1, 1]) {
        const k = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 8), mat(0xb8a070, { rough: 0.25, metal: 0.9 }));
        k.position.copy(ax ? new THREE.Vector3(dirA * (len - 0.07), 1.0, f * 0.04) : new THREE.Vector3(f * 0.04, 1.0, dirA * (len - 0.07)));
        k.castShadow = true;
        pivot.add(k);
      }
      // rotate so +swing across the wall is where it opens to
      const sign = (ax ? -1 : 1) * dirA * h.swing;
      pivot.userData.sign = sign;
      pivot.rotation.y = sign * open;
      return pivot;
    };
    switch (h.kind) {
      case 'front':
        casing(trim, t + 0.06);
        boxAt(mat(0x3a3a38, { rough: 0.5, metal: 0.4 }), mid, c, 0.006, len, t, 0.012);
        break;
      case 'door': {
        casing(trim);
        swing(mat(0xf2f0ea, { rough: 0.5 }), Math.PI / 2 - 0.05);
        break;
      }
      case 'closet': {
        casing(trim);
        const p = swing(mat(0xe4e0d8, { rough: 0.6, alphaMap: TX.louvres(), side: THREE.DoubleSide }), 0, 0.03);
        this.addHidePart(h.hide, { obj: p, kind: 'swing', sign: p.userData.sign });
        break;
      }
      case 'shut': {
        casing(darkTrim);
        const p = swing(mat(0xffffff, { map: TX.wood('#4a2c1c', 'doorWood'), rough: 0.45 }), 0, 0.045);
        this.swingers[h.unit] = p;
        // number plate and peephole on the corridor side
        const face = c + (ax ? (w.z0 < -1 ? 1 : -1) : 1) * (t / 2 + 0.03);
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.07), new THREE.MeshStandardMaterial({ map: TX.sign(h.unit, { w: 256, h: 112, bg: '#c9a35a', fg: '#2a1a0a', font: 'bold 84px Georgia, serif' }), roughness: 0.3, metalness: 0.8 }));
        plate.position.copy(at(mid, face, 1.68));
        plate.rotation.y = w.z0 < -1 ? 0 : Math.PI;
        s.add(plate);
        break;
      }
      case 'lift': {
        const doors = liftDoors(len, h.y1);
        doors.group.position.copy(at(mid, w.z1 + 0.001, 0));
        s.add(doors.group);
        if (Math.abs(mid - (ELEVATOR.doorX0 + ELEVATOR.doorX1) / 2) < 0.01) this.liftDoors = doors;
        else {
          doors.display.set(23, -1);
          // the other shaft is just dark behind its doors
          boxAt(mat(0x060606), mid, c - 0.6, 1.2, len, 1.0, 2.4);
        }
        break;
      }
      case 'stair': {
        casing(mat(0x6a6a66, { rough: 0.5, metal: 0.5 }));
        const p = swing(mat(0x7a2a22, { rough: 0.5, metal: 0.3 }), 0, 0.05);
        this.swingers.stair = p;
        const exit = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), new THREE.MeshBasicMaterial({ map: TX.sign('EXIT', { w: 256, h: 96, bg: '#1a0303', fg: '#ff3a2a', font: 'bold 70px Arial, sans-serif' }), toneMapped: false }));
        exit.position.set(w.x0 - 0.02, 2.32, mid);
        exit.rotation.y = -Math.PI / 2;
        s.add(exit);
        this.exitSign = exit;
        break;
      }
      case 'glass':
      case 'window': {
        const frame = mat(0x1e1f22, { rough: 0.35, metal: 0.6 });
        const glass = new THREE.MeshPhysicalMaterial({ color: 0x9fb4c0, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.1, envMapIntensity: 0.9, side: THREE.DoubleSide, depthWrite: false });
        const hh = h.y1 - h.y0;
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(len, hh), glass);
        pane.position.copy(at(mid, c, h.y0 + hh / 2));
        pane.rotation.y = ax ? 0 : Math.PI / 2;
        pane.renderOrder = 5;
        s.add(pane);
        const n = Math.max(1, Math.round(len / 1.5));
        for (let i = 0; i <= n; i++) boxAt(frame, h.a0 + (len * i) / n, c, h.y0 + hh / 2, 0.06, t * 0.6, hh);
        boxAt(frame, mid, c, h.y0 + 0.03, len, t * 0.7, 0.06);
        boxAt(frame, mid, c, h.y1 - 0.03, len, t * 0.7, 0.06);
        if (h.kind === 'window') {
          const inward = ax ? (w.z0 > 4 ? -1 : 1) : (w.x0 > 5 ? -1 : 1);
          boxAt(trim, mid, c + inward * (t / 2 + 0.04), h.y0 - 0.02, len + 0.12, 0.12, 0.04);
        }
        break;
      }
    }
  }

  addHidePart(id, part) {
    if (!this.hideParts.has(id)) this.hideParts.set(id, []);
    this.hideParts.get(id).push(part);
  }

  // --------------------------------------------------------- furniture --
  buildFurniture() {
    const s = this.scene;
    const props = new THREE.Group();
    const hideFor = (f) => {
      // which hiding spot a piece of furniture is
      for (const h of HIDES) {
        if (h.kind === 'bed') continue;
        if (Math.hypot(h.eye.x - f.x, h.eye.z - f.z) < 1.0 && (f.type === 'wardrobe' || f.type === 'coatCloset' || f.type === 'tub')) return h.id;
      }
      return -1;
    };
    for (const f of FURNITURE) {
      const g = furniture(f);
      const id = hideFor(f);
      if (id >= 0) {
        s.add(g);
        g.updateMatrixWorld(true);
        // moving parts stay as they are; the rest gets merged
        const moving = [];
        g.traverse((o) => { if (o.userData.moving) moving.push(o); });
        for (const o of moving) this.addHidePart(id, o.userData.curtain ? { obj: o, kind: 'curtain' } : { obj: o, kind: 'louvre', side: o.userData.side });
        const rest = new THREE.Group();
        for (const c of [...g.children]) if (!c.userData.moving) rest.add(c);
        rest.position.copy(g.position);
        rest.rotation.copy(g.rotation);
        props.add(rest);
      } else props.add(g);
    }
    s.add(mergeStatic(props));
  }

  // ------------------------------------------------------------ lights --
  buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0x8a9ac8, 0x3a2a20, 0.35);
    s.add(this.hemi);
    // the sun, later the moon, through the west and south glass
    const sun = (this.sun = new THREE.DirectionalLight(0xffc890, 2.5));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 80 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.target.position.set(5, 0, 4.2);
    s.add(sun, sun.target);

    const point = (x, y, z, color, intensity, dist, zone) => {
      const l = new THREE.PointLight(color, intensity, dist, 2);
      l.position.set(x, y, z);
      s.add(l);
      this.lights.push({ light: l, base: intensity, zone });
      return l;
    };
    // apartment
    s.add(placed(pendant(CEIL, 0.95), 2.6, 3.2));
    point(2.6, 1.5, 3.2, 0xffd8a8, 7, 7, 'apt');
    point(3.55, 1.45, 5.55, 0xffcf96, 5, 5.5, 'apt');      // floor lamp
    point(3.9, 1.55, 0.5, 0xfff0d8, 2.5, 3.5, 'apt');     // under the kitchen cabinets
    for (const [x, z] of [[5.6, 1.5], [8.2, 1.4], [7.4, 3.6], [6.9, 6.0]]) s.add(placed(ceilingLight(CEIL), x, z));
    point(5.6, 2.3, 1.5, 0xfff2e2, 3.5, 3.6, 'apt');      // bathroom
    point(8.2, 2.3, 1.4, 0xffe2c0, 3.5, 4.2, 'apt');      // second bedroom
    point(7.4, 2.35, 3.6, 0xffe2c0, 2.2, 3.4, 'apt');     // hall
    point(9.55, 1.0, 5.3, 0xffc888, 2.2, 4.5, 'apt');     // bedside lamp
    // corridor: sconces on the far wall and a light by the elevators
    for (const x of [0.7, 4.3, 12.5, 18.0]) {
      const sc = sconce();
      sc.position.set(x, 1.9, -2.4);
      s.add(sc);
    }
    point(0.7, 1.95, -2.15, 0xffcf96, 2.6, 3.4, 'corr');
    point(4.3, 1.95, -2.15, 0xffcf96, 2.6, 3.4, 'corr');
    point(10.4, 2.4, -1.8, 0xffe8cc, 3.0, 4.0, 'corr');
    for (const x of [7.0, 10.4, 15.5, 20.5]) s.add(placed(ceilingLight(HALL_CEIL, 0.13), x, -1.3));
    point(18.0, 1.95, -2.15, 0xffcf96, 2.2, 3.6, 'corr');

    // your phone's flashlight: always in the scene (adding lights later
    // would make every material recompile), dark until you switch it on
    const fl = (this.flash = new THREE.SpotLight(0xf4f0ff, 0, 14, 0.5, 0.45, 1.6));
    fl.castShadow = true;
    fl.shadow.mapSize.set(1024, 1024);
    fl.shadow.bias = -0.0005;
    s.add(fl, fl.target);
  }

  collectLamps() {
    const seen = new Set();
    this.scene.traverse((o) => {
      if (!o.isMesh || !o.userData.lamp) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      const zone = o.getWorldPosition(new THREE.Vector3()).z < -0.15 ? 'corr' : 'apt';
      for (const m of ms) {
        if (seen.has(m) || !m.emissive) continue;
        seen.add(m);
        // lamps share materials, so each material's circuit is where it was first seen
        this.lamps[zone].push({ m, base: m.emissiveIntensity });
      }
    });
  }

  // --------------------------------------------------------- elevator ---
  buildElevator() {
    const car = (this.car = elevatorCar());
    car.group.position.set((ELEVATOR.doorX0 + ELEVATOR.doorX1) / 2, 0, ELEVATOR.z1 + 0.04);
    this.scene.add(car.group);
    car.display.set(50);
    this.liftDoors.display.set(50);
    this.carLight = { light: car.light, base: car.light.intensity };
  }

  // ------------------------------------------------------------- state --
  setHour(h) {
    const S = this.city.setHour(h);
    const e = S.elev * 180 / Math.PI;
    const day = Math.max(0, Math.min(1, (e + 2) / 8));
    const sun = this.sun;
    if (day > 0.02) {
      sun.color.copy(this.city.skyU.glowColor.value);
      sun.intensity = 3.2 * day;
      sun.position.copy(S.sun).multiplyScalar(40).add(sun.target.position);
    } else {
      // moonlight
      sun.color.set(0x9ab0e0);
      sun.intensity = 0.35 * this.city.skyU.stars.value;
      sun.position.copy(this.city.skyU.moonDir.value).multiplyScalar(40).add(sun.target.position);
    }
    this.hemi.color.copy(this.city.skyU.zenith.value).lerp(new THREE.Color(0x404a60), 0.5);
    this.hemi.intensity = 0.12 + 0.4 * day;
    this.hour = h;
    return S;
  }

  // power: 0..1 for the apartment (the corridor is on its own circuit);
  // flicker: 0..1, the corridor lights stutter
  setPower(apt, corr = apt) {
    this.power = apt;
    this.corrPower = corr;
  }

  // open a hiding spot's doors (or curtain) by k (0..1)
  setHideOpen(id, k) {
    for (const p of this.hideParts.get(id) || []) {
      if (p.kind === 'swing') p.obj.rotation.y = p.sign * k * 1.6;
      else if (p.kind === 'louvre') p.obj.rotation.y = -p.side * k * 1.7;
      else if (p.kind === 'curtain') { p.obj.scale.x = 1 - k * 0.65; p.obj.position.x = -k * 0.6; }
    }
  }

  // swing a corridor door ('50D', 'stair') open by k
  setSwing(name, k) {
    const p = this.swingers[name];
    if (p) p.rotation.y = p.userData.sign * k * 1.4;
  }

  update(dt, t, { flash = null, flicker = 0 } = {}) {
    this.city.update(t);
    this.door.update(dt);
    // circuits, with an occasional stutter in the corridor
    let corr = this.corrPower;
    if (flicker > 0) {
      const n = Math.sin(t * 23) + Math.sin(t * 37.3) + Math.sin(t * 7.1);
      corr *= n > 1.6 - flicker * 2.4 ? 0.08 : 1;
    }
    this.corrShown = corr;
    for (const L of this.lights) L.light.intensity = L.base * (L.zone === 'apt' ? this.power : corr);
    for (const l of this.lamps.apt) l.m.emissiveIntensity = l.base * (0.03 + 0.97 * this.power);
    for (const l of this.lamps.corr) l.m.emissiveIntensity = l.base * (0.03 + 0.97 * corr);
    this.scene.environmentIntensity = 0.06 + 0.2 * this.power;
    if (flash) {
      this.flash.intensity = flash.on ? 9 : 0;
      this.flash.position.copy(flash.pos);
      this.flash.target.position.copy(flash.pos).add(flash.dir);
    } else this.flash.intensity = 0;
  }

  // draw the skyline, then this floor over it
  render(renderer, camera, target) {
    const far = this.farCam || (this.farCam = new THREE.PerspectiveCamera());
    far.copy(camera);
    far.near = 4;
    far.far = 9000;
    far.updateProjectionMatrix();
    renderer.setRenderTarget(target);
    renderer.autoClear = false;
    renderer.clear(true, true, true);
    renderer.render(this.far, far);
    renderer.clearDepth();
    renderer.render(this.scene, camera);
    renderer.autoClear = true;
  }
}
