// Cinder Peak lookout: the steel tower and its stairs, the glass cab on
// top with its catwalk, everything inside it, and the clearing round its
// feet, in the middle of the forest (land.js) under the sky (sky.js).
// Built once at start-up and reused by the title screen and every game.
//
// Two scenes: `far` holds the sky and the distant country and is painted
// into a cube map (see backdrop.js); `scene` holds everything near and is
// drawn with that cube behind it.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import { mat, block, box, cyl, beam, wood, METAL } from './props.js';
import * as M from './models.js';
import { Sky } from './sky.js';
import { Land } from './land.js';
import { Backdrop } from './backdrop.js';
import { terrainH } from '../shared/terrain.js';
import { CAB_Y, CAB, WALK, FRAME, STAIR, HATCH, DOOR, LEGS, PLACES, BEDS, FINDER, DESK, KEY_HOOK, SPOTS } from '../shared/layout.js';

// Static meshes with the same material are merged into one, so the tower
// draws in a few dozen calls rather than hundreds.
function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const byMat = new Map();
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.keep) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const key = o.material;
    if (!byMat.has(key)) byMat.set(key, { list: [], cast: false });
    const e = byMat.get(key);
    e.list.push(g);
    e.cast ||= o.castShadow;
  });
  const out = new THREE.Group();
  for (const [material, e] of byMat) {
    const merged = new THREE.Mesh(mergeGeometries(e.list), material);
    merged.castShadow = e.cast;
    merged.receiveShadow = true;
    out.add(merged);
    for (const g of e.list) g.dispose();
  }
  return out;
}

// a model's parts merged by material, so it draws in a handful of calls
// (its materials stay shared, so lights on it can still be switched)
function bake(group) {
  const out = mergeStatic(group);
  out.position.copy(group.position);
  out.rotation.copy(group.rotation);
  return out;
}

const hw = (y) => FRAME.base + (FRAME.top - FRAME.base) * (y / CAB_Y);    // half-width of the frame at height y

export class Lookout {
  constructor(renderer) {
    const s = (this.scene = new THREE.Scene());
    this.far = new THREE.Scene();
    this.fog = new THREE.FogExp2(0x8899aa, 0.0002);
    s.fog = this.fog;
    this.far.fog = this.fog;
    this.sky = new Sky();
    this.far.add(this.sky.mesh);
    this.land = new Land();
    s.add(this.land.near);
    this.far.add(this.land.far);
    this.backdrop = new Backdrop(this.far);
    this.frame = 0;

    const pmrem = new THREE.PMREMGenerator(renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    s.environment = this.env;
    s.environmentIntensity = 0.3;

    const statics = new THREE.Group();
    this.buildTower(statics);
    this.buildCab(statics);
    this.buildClearing(statics);
    s.add(mergeStatic(statics));
    this.buildMoving();
    this.buildLights();

    this.state = {};
    this.setState({ gen: true, light: true, hatch: 0, bolt: false, door: 0, doorBolt: false, stove: false, cut: false, finder: 0, smoke: null, word: null });
    this.setHour(19.5);
  }

  // ------------------------------------------------------------- tower --
  buildTower(g) {
    const steel = mat(0x7a7d78, { rough: 0.6, metal: 0.55 });
    const concrete = mat(0x8a8780, { rough: 0.95 });
    // legs on concrete footings
    for (const L of LEGS) {
      box(g, concrete, L.x, 0.1, L.z, 0.7, 0.5, 0.7);
      const t = FRAME.top / FRAME.base;
      beam(g, steel, [L.x, 0.3, L.z], [L.x * t, CAB_Y - 0.2, L.z * t], 0.17);
    }
    // girts and X-braces between the legs
    const corners = (y) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [a * hw(y), y, b * hw(y)]);
    const levels = [3.5, 7, 10.5, CAB_Y - 0.25];
    for (const y of levels) {
      const c = corners(y);
      for (let i = 0; i < 4; i++) beam(g, steel, c[i], c[(i + 1) % 4], 0.1);
    }
    for (let k = 0; k < levels.length - 1; k++) {
      const lo = corners(levels[k]), hi = corners(levels[k + 1]);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        beam(g, steel, lo[i], hi[j], 0.03, 0.03, true);
        beam(g, steel, lo[j], hi[i], 0.03, 0.03, true);
      }
    }
    // knee braces at the bottom, leaving the ground open to walk under
    const base = corners(0.3), first = corners(3.5);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const mid = (a, b, k) => a.map((v, n) => v + (b[n] - v) * k);
      beam(g, steel, mid(base[i], first[i], 0.6), mid(first[i], first[j], 0.2), 0.05);
      beam(g, steel, mid(base[j], first[j], 0.6), mid(first[j], first[i], 0.2), 0.05);
    }
    // the frame under the cab and catwalk
    const y = CAB_Y - 0.2;
    for (const s of [-1, 1]) {
      beam(g, steel, [-WALK, y, s * WALK], [WALK, y, s * WALK], 0.12);
      beam(g, steel, [s * WALK, y, -WALK], [s * WALK, y, WALK], 0.12);
      for (let i = -2; i <= 2; i++) {
        beam(g, steel, [i * 1.4, y - 0.02, -WALK], [i * 1.4, y - 0.02, WALK], 0.08);
        // brackets from the legs out to the catwalk's edge
        beam(g, steel, [s * hw(11.5), 11.5, i * 0.8], [s * WALK, y, i * 1.2], 0.05);
        beam(g, steel, [i * 0.8, 11.5, s * hw(11.5)], [i * 1.2, y, s * WALK], 0.05);
      }
    }
    this.buildStairs(g, steel);
  }

  buildStairs(g, steel) {
    const S = STAIR;
    const grate = mat(0x6e716c, { rough: 0.6, metal: 0.6, alphaMap: TX.tiled(TX.grating(), 3, 6), side: THREE.DoubleSide });
    const tread = mat(0x707370, { rough: 0.55, metal: 0.6, alphaMap: TX.tiled(TX.grating(), 1, 3), side: THREE.DoubleSide });
    const rail = mat(0x8a8d88, { rough: 0.4, metal: 0.7 });
    const flight = (xa, xb, ya, yb, lane, n) => {
      const [z0, z1] = lane === 'A' ? S.laneA : S.laneB;
      const zc = (z0 + z1) / 2, run = xb - xa;
      for (let i = 1; i < n; i++) {
        const k = i / n;
        box(g, tread, xa + run * k, ya + (yb - ya) * k - 0.02, zc, Math.abs(run) / n + 0.04, 0.03, z1 - z0);
      }
      for (const z of [z0, z1]) beam(g, steel, [xa, ya - 0.14, z], [xb, yb - 0.14, z], 0.2, 0.04);
      // handrails: on the outside, and along the middle between the lanes
      const zo = lane === 'A' ? z1 + 0.02 : z0 - 0.02, zi = lane === 'A' ? z0 + 0.02 : z1 - 0.02;
      for (const z of [zo, zi]) {
        beam(g, rail, [xa, ya + 0.92, z], [xb, yb + 0.92, z], 0.022, 0.022, true);
        beam(g, rail, [xa, ya + 0.5, z], [xb, yb + 0.5, z], 0.016, 0.016, true);
        for (const k of [0, 0.5, 1]) beam(g, rail, [xa + run * k, ya + (yb - ya) * k, z], [xa + run * k, ya + (yb - ya) * k + 0.92, z], 0.02, 0.02, true);
      }
    };
    const landing = (x0, x1, z0, z1, y) => {
      box(g, grate, (x0 + x1) / 2, y - 0.02, (z0 + z1) / 2, x1 - x0, 0.04, z1 - z0);
      beam(g, steel, [x0, y - 0.1, z0], [x1, y - 0.1, z0], 0.08);
      beam(g, steel, [x0, y - 0.1, z1], [x1, y - 0.1, z1], 0.08);
      // posts down to the frame
      for (const x of [x0, x1]) for (const z of [z0, z1]) beam(g, steel, [x, y - 0.1, z], [x, Math.max(0, y - 2.1), z], 0.06);
    };
    for (let k = 0; k < 6; k++) {
      const y = k * 2;
      if (k % 2 === 0) {
        flight(S.x0, S.x1, y, y + 2, 'A', 11);
        landing(S.x1, S.end, -1.0, 1.0, y + 2);
        // rail round the end of the landing
        beam(g, rail, [S.end, y + 2.95, -1.02], [S.end, y + 2.95, 1.02], 0.022, 0.022, true);
        for (const z of [-1.02, 1.02]) beam(g, rail, [S.end, y + 2, z], [S.end, y + 2.95, z], 0.02, 0.02, true);
      } else {
        flight(S.x1, S.x0, y, y + 2, 'B', 11);
        landing(-S.end, S.x0, -1.0, 1.0, y + 2);
        beam(g, rail, [-S.end, y + 2.95, -1.02], [-S.end, y + 2.95, 1.02], 0.022, 0.022, true);
        for (const z of [-1.02, 1.02]) beam(g, rail, [-S.end, y + 2, z], [-S.end, y + 2.95, z], 0.02, 0.02, true);
      }
    }
    // the walkway at the top, the steep last flight up into the cab
    landing(S.x0, 0.0, S.laneA[0], S.laneA[1], 12);
    flight(0.0, HATCH.x1, 12, CAB_Y, 'A', 9);
    // a concrete pad at the bottom step
    box(g, mat(0x8a8780, { rough: 0.95 }), -2.3, 0.02, 0.5, 1.2, 0.08, 1.2);
  }

  // --------------------------------------------------------------- cab --
  buildCab(g) {
    const Y = CAB_Y, C = CAB.half;
    const deck = mat(0xffffff, { map: TX.tiled(TX.deck(), 1.2, 1.2), rough: 0.85 });
    const floor = mat(0xffffff, { map: TX.tiled(TX.deck(), 1.4, 1.4), rough: 0.7 });
    const H = HATCH;
    // the floor, with its hole for the trapdoor
    for (const [x0, x1, z0, z1] of [[-C, H.x0, -C, C], [H.x1, C, -C, C], [H.x0, H.x1, -C, H.z0], [H.x0, H.x1, H.z1, C]]) box(g, floor, (x0 + x1) / 2, Y - 0.06, (z0 + z1) / 2, x1 - x0, 0.12, z1 - z0);
    // the catwalk round it
    for (const [x0, x1, z0, z1] of [[-WALK, WALK, -WALK, -C], [-WALK, WALK, C, WALK], [-WALK, -C, -C, C], [C, WALK, -C, C]]) box(g, deck, (x0 + x1) / 2, Y - 0.05, (z0 + z1) / 2, x1 - x0, 0.08, z1 - z0);
    // the catwalk railing
    const post = wood('#5e4a36', 'railing');
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const t = -WALK + (2 * WALK * i) / n;
      for (const [x, z] of [[t, -WALK], [t, WALK], [-WALK, t], [WALK, t]]) box(g, post, x, Y + 0.52, z, 0.08, 1.05, 0.08);
    }
    for (const s of [-1, 1]) {
      for (const y of [Y + 1.05, Y + 0.55]) {
        box(g, post, 0, y, s * WALK, 2 * WALK + 0.1, y > Y + 1 ? 0.06 : 0.05, 0.1);
        box(g, post, s * WALK, y, 0, 0.1, y > Y + 1 ? 0.06 : 0.05, 2 * WALK + 0.1);
      }
    }
    // the railing round the trapdoor
    for (const [a, b] of [[[H.x0, H.z0 - 0.03], [H.x1, H.z0 - 0.03]], [[H.x0, H.z1 + 0.03], [H.x1, H.z1 + 0.03]], [[H.x0 - 0.03, H.z0], [H.x0 - 0.03, H.z1]]]) {
      beam(g, post, [a[0], Y + 0.95, a[1]], [b[0], Y + 0.95, b[1]], 0.05);
      for (const p of [a, b]) box(g, post, p[0], Y + 0.47, p[1], 0.05, 0.95, 0.05);
    }

    // walls: wood up to the sill, then glass all round, then the header
    const wall = mat(0xffffff, { map: TX.tiled(TX.siding('#e2dccb', 'sidingWhite'), 2, 0.6), rough: 0.85 });
    const trim = mat(0x4a3a2a, { rough: 0.7 });
    const sill = Y + CAB.sill, head = Y + CAB.head;
    for (const s of [-1, 1]) {
      box(g, wall, 0, Y + CAB.sill / 2, -C, 2 * C, CAB.sill, 0.07);
      box(g, wall, s * C, Y + CAB.sill / 2, 0, 0.07, CAB.sill, 2 * C);
      box(g, wall, 0, (head + Y + CAB.h) / 2, s * C, 2 * C + 0.1, Y + CAB.h - head, 0.08);
      box(g, wall, s * C, (head + Y + CAB.h) / 2, 0, 0.08, Y + CAB.h - head, 2 * C + 0.1);
    }
    // the south wall's lower panels either side of the door
    box(g, wall, (-C + DOOR.x0) / 2, Y + CAB.sill / 2, C, DOOR.x0 + C, CAB.sill, 0.07);
    box(g, wall, (C + DOOR.x1) / 2, Y + CAB.sill / 2, C, C - DOOR.x1, CAB.sill, 0.07);
    box(g, trim, 0, Y + DOOR.h + 0.05, C, DOOR.x1 - DOOR.x0 + 0.1, 0.1, 0.1);
    for (const x of [DOOR.x0 - 0.04, DOOR.x1 + 0.04]) box(g, trim, x, Y + DOOR.h / 2, C, 0.08, DOOR.h, 0.1);
    // corner posts, mullions and sills
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, trim, sx * C, Y + CAB.h / 2, sz * C, 0.12, CAB.h, 0.12);
    const panes = 5;
    for (let i = 1; i < panes; i++) {
      const t = -C + (2 * C * i) / panes;
      for (const [x, z] of [[t, -C], [-C, t], [C, t]]) box(g, trim, x, (sill + head) / 2, z, 0.05, head - sill, 0.05);
      if (t < DOOR.x0 - 0.1 || t > DOOR.x1 + 0.1) box(g, trim, t, (sill + head) / 2, C, 0.05, head - sill, 0.05);
    }
    for (const s of [-1, 1]) {
      box(g, trim, 0, sill, s * C, 2 * C, 0.05, 0.14);
      box(g, trim, s * C, sill, 0, 0.14, 0.05, 2 * C);
      box(g, trim, 0, Y + 1.72, s * C, 2 * C, 0.035, 0.05);
      box(g, trim, s * C, Y + 1.72, 0, 0.05, 0.035, 2 * C);
    }
    // glass
    const glass = new THREE.MeshStandardMaterial({ color: 0xa8bcc8, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.2 });
    const pane = (w, h, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass); m.position.set(x, y, z); m.rotation.y = ry; this.scene.add(m); this.glass.push(m); return m; };
    this.glass = [];
    pane(2 * C, head - sill, 0, (sill + head) / 2, -C, 0);
    pane(2 * C, head - sill, -C, (sill + head) / 2, 0, Math.PI / 2);
    pane(2 * C, head - sill, C, (sill + head) / 2, 0, Math.PI / 2);
    pane(DOOR.x0 + C, head - sill, (-C + DOOR.x0) / 2, (sill + head) / 2, C, 0);
    pane(C - DOOR.x1, head - sill, (C + DOOR.x1) / 2, (sill + head) / 2, C, 0);
    // ceiling
    box(g, wood('#9a7a52', 'ceiling'), 0, Y + CAB.h + 0.02, 0, 2 * C, 0.04, 2 * C);

    // the roof: four slopes up to a peak, wide eaves
    const R = 3.15, top = Y + CAB.h + 1.1, eave = Y + CAB.h + 0.02;
    const roofMat = mat(0xffffff, { map: TX.tiled(TX.roofing(), 4, 4), rough: 0.55, metal: 0.45, side: THREE.DoubleSide });
    const pos = [];
    const c4 = [[-R, -R], [R, -R], [R, R], [-R, R]];
    for (let i = 0; i < 4; i++) {
      const a = c4[i], b = c4[(i + 1) % 4];
      pos.push(a[0], eave, a[1], 0, top, 0, b[0], eave, b[1]);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0.5, 1, 1, 0, 0, 0, 0.5, 1, 1, 0, 0, 0, 0.5, 1, 1, 0, 0, 0, 0.5, 1, 1, 0], 2));
    rg.computeVertexNormals();
    const roof = new THREE.Mesh(rg, roofMat);
    roof.castShadow = true;
    g.add(roof);
    for (const s of [-1, 1]) {
      box(g, trim, 0, eave - 0.06, s * R, 2 * R, 0.14, 0.04);
      box(g, trim, s * R, eave - 0.06, 0, 0.04, 0.14, 2 * R);
    }
    // shutters propped open over the windows, like awnings
    const shutter = mat(0xffffff, { map: TX.tiled(TX.siding('#3a5a40', 'sidingGreen'), 1, 0.5), rough: 0.8 });
    for (let side = 0; side < 4; side++) {
      const grp = new THREE.Group();
      grp.rotation.y = (side * Math.PI) / 2;
      g.add(grp);
      for (const s of [-1, 1]) {
        const hinge = new THREE.Group();
        hinge.position.set(s * 1.24, head + 0.18, -C - 0.06);
        hinge.rotation.x = 1.15;
        grp.add(hinge);
        box(hinge, shutter, 0, -0.62, 0, 2.4, 1.24, 0.04);
        beam(grp, trim, [s * 2.1, sill + 0.02, -C - 0.08], [s * 2.1, head + 0.18 - Math.cos(1.15) * 1.18, -C - 0.06 - Math.sin(1.15) * 1.18], 0.03, 0.03, true);
      }
    }
    // the antenna on the peak, and its cable down the north-east corner
    const mast = METAL();
    cyl(g, mast, 0, top + 1.3, 0, 0.03, 2.6);
    beam(g, mast, [-0.7, top + 2.3, 0], [0.7, top + 2.3, 0], 0.012, 0.012, true);
    beam(g, mast, [0, top + 2.0, -0.5], [0, top + 2.0, 0.5], 0.012, 0.012, true);
    cyl(g, mat(0x111111), 0, top + 2.65, 0, 0.004, 0.5);

    // inside
    const deskG = M.desk();
    deskG.group.position.set(DESK.x, Y, DESK.z);
    g.add(deskG.group);
    this.desk = deskG;
    const ff = M.fireFinder();
    ff.group.position.set(FINDER.x, Y, FINDER.z);
    g.add(ff.group);
    this.alidade = ff.alidade;
    ff.alidade.removeFromParent();
    ff.alidade.position.set(FINDER.x, Y + 1.04, FINDER.z);
    const bunks = M.bunks();
    bunks.position.set(BEDS[0].x, Y, BEDS[0].z);
    bunks.rotation.y = BEDS[0].yaw;
    g.add(bunks);
    const cot = M.cot();
    cot.position.set(BEDS[2].x, Y, BEDS[2].z);
    cot.rotation.y = BEDS[2].yaw;
    g.add(cot);
    const bag = M.sleepingBag();
    bag.position.set(BEDS[3].x, Y, BEDS[3].z);
    bag.rotation.y = BEDS[3].yaw;
    g.add(bag);
    const st = M.stove();
    st.group.position.set(-2.02, Y, -2.02);
    g.add(st.group);
    this.stoveFire = st.fire;
    const stool = M.lightningStool();
    stool.position.set(-1.65, Y, -1.15);
    g.add(stool);
    // the key hook, the light switch, a map on the wall, a shelf of tins
    block(g, wood('#6a4a30', 'hook'), KEY_HOOK.x, KEY_HOOK.y, KEY_HOOK.z + 0.03, 0.22, 0.12, 0.02, 0.004);
    cyl(g, METAL(), KEY_HOOK.x, KEY_HOOK.y, KEY_HOOK.z, 0.004, 0.06).rotation.x = Math.PI / 2;
    block(g, mat(0xd8d2c0, { rough: 0.5 }), SPOTS.lightSwitch.x, SPOTS.lightSwitch.y, SPOTS.lightSwitch.z + 0.02, 0.08, 0.12, 0.03, 0.005);
    const map = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ map: TX.finderMap(), roughness: 0.8 }));
    map.position.set(-C + 0.045, Y + 0.6, -0.6);
    map.rotation.y = Math.PI / 2;
    g.add(map);
    box(g, wood('#6a4a30', 'shelf'), C - 0.16, Y + 0.85, 0.9, 0.24, 0.03, 0.9);
    for (let i = 0; i < 5; i++) cyl(g, mat([0xa83a2a, 0xd8c070, 0x3a6a3a][i % 3], { rough: 0.4, metal: 0.5 }), C - 0.16, Y + 0.93, 0.55 + i * 0.17, 0.04, 0.12);
  }

  // ------------------------------------------------------- the clearing --
  buildClearing(g) {
    const at = (o, x, z, ry = 0) => { o.position.set(x, terrainH(x, z), z); o.rotation.y = ry; g.add(o); return o; };
    const sh = M.shed();
    at(sh.group, PLACES.shed.x, PLACES.shed.z);
    this.shedBulb = sh.bulbMat;
    const tank = M.waterTank();
    at(tank.group, PLACES.tank.x, PLACES.tank.z);
    at(M.outhouse().group, PLACES.outhouse.x, PLACES.outhouse.z);
    at(M.woodpile(), PLACES.woodpile.x, PLACES.woodpile.z);
    const T = PLACES.trailcam, dx = -T.x, dz = -T.z, l = Math.hypot(dx, dz);
    const cam = at(M.trailCam(), T.x + (dx / l) * 0.42, T.z + (dz / l) * 0.42, Math.atan2(dx, dz));
    cam.position.y = 1.5;
    at(M.signboard('CINDER PEAK LOOKOUT\nELEV. 7,212 FT', 1.8, 0.62), 11.8, 17.2, -0.9);
    at(M.signboard('LYLE CREEK TRAIL\nSPRING 0.1 MI  >', 1.3, 0.55), PLACES.trailhead.x - 1.2, PLACES.trailhead.z + 0.8, 2.6);
    const gate = M.roadGate();
    at(gate.group, PLACES.gate.x, PLACES.gate.z, 0.43);
    at(M.spring(), PLACES.spring.x, PLACES.spring.z, Math.PI / 2);
    const photos = [
      TX.photo(1, { stamp: '06/14 02:09', figure: [100, 160, 0.9] }),
      TX.photo(2, { stamp: '06/14 02:31', tower: false, figure: [100, 100, 2.6] }),
      TX.photo(3, { stamp: '06/15 23:48', figure: [70, 150, 1.0], tint: '#d8a8a0' }),
      TX.photo(4, { stamp: '06/15 23:49', figure: [120, 150, 1.0], tint: '#a8b8d8' }),
      TX.photo(5, { stamp: '06/16 01:12' }),
      TX.photo(6, { stamp: '06/16 01:14', figure: [96, 120, 1.6], tint: '#c8c8a8' }),
      TX.photo(7, { stamp: '06/16 03:40', figure: [140, 150, 1.0] }),
      TX.photo(8, { stamp: '06/17 00:02', tower: false, figure: [100, 90, 3.2] }),
    ];
    at(M.camp(photos), PLACES.camp.x, PLACES.camp.z, 0.6);
    this.campPhotos = photos;
    // boulders
    for (const [x, z, s] of [[-17, -8, 1.2], [16, 9, 0.8], [-6, 16, 0.7], [14, -12, 1.0], [-15, -15, 0.9]]) {
      const r = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), mat(0x6e6a62, { rough: 1 }));
      r.scale.y = 0.6;
      r.rotation.y = x;
      at(r, x, z);
      r.castShadow = r.receiveShadow = true;
    }
  }

  // things that move, light up or change: never merged
  buildMoving() {
    const s = this.scene, Y = CAB_Y;
    s.add(this.alidade);
    // the trapdoor, hinged along its west edge
    const H = HATCH;
    this.hatch = new THREE.Group();
    this.hatch.position.set(H.x0, Y, (H.z0 + H.z1) / 2);
    s.add(this.hatch);
    const lid = wood('#7a6448', 'hatch');
    block(this.hatch, lid, (H.x1 - H.x0) / 2, -0.035, 0, H.x1 - H.x0 - 0.02, 0.06, H.z1 - H.z0 - 0.02, 0.005);
    block(this.hatch, mat(0x2a2a2a, { rough: 0.5, metal: 0.6 }), 0.3, 0.0, 0, 0.12, 0.02, 0.5, 0.004);
    this.boltBar = block(this.hatch, METAL(), H.x1 - H.x0 - 0.16, 0.012, 0.32, 0.12, 0.02, 0.03, 0.005);
    block(s, METAL(), H.x1 + 0.04, Y + 0.012, H.z0 + 0.32 + (H.z0 + H.z1) / 2 - 0.52, 0.06, 0.03, 0.05, 0.005);
    // the cab door, hinged on its west side, opening inwards
    this.door = new THREE.Group();
    this.door.position.set(DOOR.x0, Y, CAB.half);
    s.add(this.door);
    const dw = DOOR.x1 - DOOR.x0;
    const paint = mat(0xffffff, { map: TX.tiled(TX.siding('#3a5a40', 'sidingGreen'), 0.5, 1), rough: 0.8 });
    block(this.door, paint, dw / 2, 0.5, 0, dw - 0.02, 1.0, 0.05, 0.01);
    block(this.door, paint, dw / 2, 1.95, 0, dw - 0.02, 0.2, 0.05, 0.01);
    for (const x of [0.05, dw - 0.05]) block(this.door, paint, x, 1.42, 0, 0.08, 0.86, 0.05, 0.01);
    const dg = new THREE.Mesh(new THREE.PlaneGeometry(dw - 0.18, 0.85), this.glass[0].material);
    dg.position.set(dw / 2, 1.42, 0);
    this.door.add(dg);
    for (const z of [-0.04, 0.04]) block(this.door, METAL(), dw - 0.1, 1.0, z, 0.05, 0.05, 0.03, 0.01);
    this.doorBolt = block(this.door, METAL(), dw - 0.12, 1.25, -0.035, 0.03, 0.05, 0.02, 0.004);
    // the antenna cable where it comes down the north-east corner (cut on the last night)
    const cable = mat(0x111111, { rough: 0.6 });
    const C = CAB.half;
    this.cable = new THREE.Group();
    s.add(this.cable);
    this.cableWhole = beam(this.cable, cable, [C + 0.08, Y + CAB.h, -C - 0.08], [C + 0.08, Y + 1.0, -C - 0.08], 0.008, 0.008, true);
    this.cableCut = new THREE.Group();
    this.cable.add(this.cableCut);
    beam(this.cableCut, cable, [C + 0.08, Y + CAB.h, -C - 0.08], [C + 0.08, Y + 1.75, -C - 0.08], 0.008, 0.008, true);
    beam(this.cableCut, cable, [C + 0.08, Y + 1.75, -C - 0.08], [C + 0.25, Y + 1.5, -C - 0.2], 0.008, 0.008, true);
    beam(this.cableCut, cable, [C + 0.08, Y + 1.0, -C - 0.08], [C + 0.08, Y + 1.32, -C - 0.08], 0.008, 0.008, true);
    // the ceiling lamp
    const lamp = M.lamp();
    lamp.group.position.set(0, Y + CAB.h, -0.3);
    s.add(lamp.group);
    this.bulb = lamp.bulb;
    // our pickup, and the ranger's (only there in the opening)
    const t = M.truck(0x8a3a2c);
    t.group = bake(t.group);
    t.group.position.set(PLACES.truck.x, 0, PLACES.truck.z);
    t.group.rotation.y = PLACES.truck.ry;
    s.add(t.group);
    this.truck = t;
    const r = M.truck(0xe6e4dc, { decal: 'FOREST\nSERVICE' });
    r.group = bake(r.group);
    r.group.position.set(PLACES.rangerTruck.x, 0, PLACES.rangerTruck.z);
    r.group.rotation.y = PLACES.rangerTruck.ry;
    s.add(r.group);
    this.rangerTruck = r;
    r.group.visible = false;
    const gen = M.generator();
    gen.group = bake(gen.group);
    gen.group.position.set(PLACES.generator.x, 0, PLACES.generator.z);
    gen.group.rotation.y = Math.PI;
    s.add(gen.group);
    this.gen = gen;
  }

  buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0x8899bb, 0x2a2418, 0.6);
    s.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff0d8, 2.5));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.autoUpdate = false;
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 160 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.04;
    sun.target.position.set(0, 5, 0);
    s.add(sun, sun.target);
    // the cab's bulb, and the one over the shed: both on the generator
    this.cabLight = new THREE.PointLight(0xffd8a0, 0, 10, 1.6);
    this.cabLight.position.set(0, CAB_Y + 2.2, -0.3);
    s.add(this.cabLight);
    this.shedLight = new THREE.PointLight(0xffd0a0, 0, 16, 1.6);
    this.shedLight.position.set(PLACES.shed.x, 1.95, PLACES.shed.z + 1.3);
    s.add(this.shedLight);
    // everyone's flashlight (always in the scene so nothing recompiles when one comes on)
    this.flashlights = [];
    for (let i = 0; i < 4; i++) {
      const f = new THREE.SpotLight(0xf4f0ff, 0, 26, 0.42, 0.5, 1.3);
      s.add(f, f.target);
      this.flashlights.push(f);
    }
    // headlights, for the drives
    this.headlights = new THREE.SpotLight(0xfff0d0, 0, 60, 0.5, 0.4, 1.2);
    s.add(this.headlights, this.headlights.target);
    // the distance gets the same sun and sky (without shadows)
    this.farHemi = new THREE.HemisphereLight();
    this.farSun = new THREE.DirectionalLight();
    this.far.add(this.farHemi, this.farSun);
  }

  // ------------------------------------------------------------- state --
  // the hour of the day (0..24; 26.5 is half past two the next morning)
  setHour(h) {
    h = ((h % 24) + 24) % 24;
    if (this.hour != null && Math.abs(h - this.hour) < 0.003) return this.sky.state;
    if (this.hour != null && Math.abs(h - this.hour) > 0.25) this.backdrop.invalidate();
    this.hour = h;
    const S = this.sky.setHour(h);
    this.sun.color.copy(S.sunColor);
    this.sun.intensity = S.sunIntensity;
    this.sun.position.copy(S.light).multiplyScalar(80).add(this.sun.target.position);
    this.hemi.color.copy(S.skyColor);
    this.hemi.groundColor.copy(S.groundColor);
    this.hemi.intensity = S.hemi;
    this.farHemi.color.copy(S.skyColor);
    this.farHemi.groundColor.copy(S.groundColor);
    this.farHemi.intensity = S.hemi;
    this.farSun.color.copy(S.sunColor);
    this.farSun.intensity = S.sunIntensity;
    this.farSun.position.copy(S.light);
    this.fog.color.copy(S.fogColor);
    this.fog.density = S.fogDensity;
    this.scene.environmentIntensity = 0.06 + 0.3 * S.day;
    return S;
  }

  // st: { gen, light, hatch (0 shut .. 1 open), bolt, door (radians open),
  // doorBolt, stove, cut, finder (degrees), smoke (degrees or null), word }
  setState(st) {
    const o = this.state;
    Object.assign(o, st);
    const lit = o.gen && o.light;
    this.cabLight.intensity = lit ? 7 : 0;
    this.bulb.emissiveIntensity = lit ? 3 : 0;
    this.shedLight.intensity = o.gen ? 6 : 0;
    this.shedBulb.emissiveIntensity = o.gen ? 3 : 0;
    this.gen.light.emissiveIntensity = o.gen ? 2 : 0;
    this.desk.lamp.emissiveIntensity = o.cut ? 0 : 1.5;
    this.desk.dial.emissiveIntensity = o.cut ? 0 : 0.8;
    this.stoveFire.emissiveIntensity = o.stove ? 2.5 : 0;
    this.hatch.rotation.z = o.hatch * 1.72;
    this.boltBar.position.x = HATCH.x1 - HATCH.x0 - (o.bolt ? 0.08 : 0.16);
    this.door.rotation.y = o.door;
    this.doorBolt.position.x = DOOR.x1 - DOOR.x0 - (o.doorBolt ? 0.07 : 0.12);
    this.cableWhole.visible = !o.cut;
    this.cableCut.visible = !!o.cut;
    this.alidade.rotation.y = -o.finder * Math.PI / 180;
    if (st.smoke !== undefined) this.land.setSmoke(o.smoke);
    if (st.word !== undefined && st.word !== this.word) {
      this.word = st.word;
      const m = this.desk.clip.material;
      if (m.map) m.map.dispose();
      m.map = TX.codeNote(st.word);
      m.needsUpdate = true;
    }
  }

  // flashes: [{ on, pos, dir }] for up to four flashlights
  update(dt, t, { flashes = [] } = {}) {
    this.sky.update(t);
    this.land.update(t);
    for (let i = 0; i < this.flashlights.length; i++) {
      const f = this.flashlights[i], F = flashes[i];
      if (F && F.on) {
        f.intensity = 14;
        f.position.copy(F.pos);
        f.target.position.copy(F.pos).add(F.dir);
      } else f.intensity = 0;
    }
    // the generator shakes a little while it runs
    if (this.state.gen) this.gen.group.position.x = PLACES.generator.x + Math.sin(t * 90) * 0.003;
    // shadows only need redrawing now and then
    this.frame++;
    if (this.frame % (this.sun.intensity > 0.6 ? 3 : 30) === 1) this.sun.shadow.needsUpdate = true;
  }

  // bring the distance up to date, then draw everything near in front of it
  render(renderer, camera, target) {
    this.scene.background = this.backdrop.render(renderer, camera);
    renderer.setRenderTarget(target);
    renderer.render(this.scene, camera);
  }
}
