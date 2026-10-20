// Everything at the lookout that isn't the tower itself: the trucks, the
// generator, the water tank, the shed and the outhouse, the woodpile, the
// trail camera, signs and the road gate, his camp in the woods, the spring;
// and inside the cab, the desk and radio, the fire finder, the bunks, the
// stove. Plus the things you can pick up and carry.

import * as THREE from 'three';
import { mat, block, box, cyl, ball, beam, place, lathe, wood, cloth, METAL, STEEL, BLACK } from './props.js';
import * as TX from './textures.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------ vehicles --
// An old pickup, nose towards +z. Returns the group and the parts that
// change: the headlights' material, and the door you climb in by.
export function truck(color = 0x8a3a2c, { decal = null } = {}) {
  const g = new THREE.Group();
  const paint = mat(color, { rough: 0.5, metal: 0.25 });
  const trim = mat(0xc8c8c4, { rough: 0.25, metal: 0.9 });
  const dark = mat(0x151515, { rough: 0.7 });
  const glass = mat(0x1a2026, { rough: 0.08, metal: 0.4, opacity: 0.3, side: THREE.DoubleSide });
  // the body
  block(g, paint, 0, 0.92, 1.68, 1.86, 0.62, 1.6, 0.08);          // hood and front fenders
  block(g, paint, 0, 0.92, 0.22, 1.9, 0.78, 1.4, 0.06);           // under the cab
  block(g, paint, 0, 1.62, 0.18, 1.78, 0.66, 1.26, 0.1);          // the cab
  block(g, glass, 0, 1.64, 0.83, 1.6, 0.48, 0.05, 0.02).rotation.x = -0.25;
  block(g, glass, 0, 1.66, -0.47, 1.4, 0.4, 0.03, 0.02);
  for (const s of [-1, 1]) block(g, glass, s * 0.895, 1.66, 0.22, 0.03, 0.42, 0.95, 0.02);
  // the bed
  block(g, paint, 0, 0.82, -1.62, 1.86, 0.28, 2.0, 0.03);
  for (const s of [-1, 1]) block(g, paint, s * 0.9, 1.15, -1.62, 0.07, 0.55, 2.0, 0.02);
  block(g, paint, 0, 1.12, -2.6, 1.86, 0.5, 0.06, 0.02);           // tailgate
  block(g, mat(0x2a2622, { rough: 0.9 }), 0, 0.97, -1.62, 1.72, 0.03, 1.9, 0.01);
  // front and back
  block(g, dark, 0, 0.98, 2.47, 1.5, 0.36, 0.06, 0.02);            // grille
  block(g, trim, 0, 0.66, 2.55, 1.96, 0.16, 0.12, 0.04);           // bumper
  block(g, trim, 0, 0.62, -2.68, 1.96, 0.14, 0.1, 0.04);
  const lamp = mat(0xfff4d8, { emissive: 0xfff0d0, ei: 0, rough: 0.2 });
  for (const s of [-1, 1]) {
    cyl(g, lamp, s * 0.66, 1.02, 2.5, 0.11, 0.04).rotation.x = Math.PI / 2;
    block(g, mat(0x9a1010, { emissive: 0x400000, rough: 0.3 }), s * 0.82, 1.15, -2.64, 0.16, 0.22, 0.04, 0.01);
    block(g, trim, s * 1.0, 1.72, 0.75, 0.04, 0.14, 0.12, 0.02);  // mirrors
  }
  // wheels
  for (const [x, z] of [[-0.86, 1.6], [0.86, 1.6], [-0.86, -1.7], [0.86, -1.7]]) {
    const w = cyl(g, dark, x, 0.38, z, 0.38, 0.26);
    w.rotation.z = Math.PI / 2;
    const hub = cyl(g, trim, x + Math.sign(x) * 0.13, 0.38, z, 0.16, 0.02);
    hub.rotation.z = Math.PI / 2;
  }
  block(g, dark, 0, 0.5, 0, 1.6, 0.2, 4.6, 0.02);                  // underneath
  if (decal) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.28), new THREE.MeshStandardMaterial({ map: TX.sign(decal, { w: 512, h: 180, bg: '#e6e4dc', fg: '#1f5a3a', font: 'bold 64px Arial, sans-serif' }), roughness: 0.6 }));
    d.position.set(0.902, 1.0, 0.25);
    d.rotation.y = Math.PI / 2;
    g.add(d);
  }
  return { group: g, lamp };
}

// --------------------------------------------------------- the clearing --
export function generator() {
  const g = new THREE.Group();
  const frame = mat(0x2a2a2a, { rough: 0.5, metal: 0.6 });
  const red = mat(0xb8382a, { rough: 0.45, metal: 0.3 });
  block(g, wood('#7a6a50', 'pallet'), 0, 0.06, 0, 1.0, 0.12, 0.8, 0.01);
  for (const [x, z] of [[-0.4, -0.28], [0.4, -0.28], [0.4, 0.28], [-0.4, 0.28]]) beam(g, frame, [x, 0.12, z], [x, 0.78, z], 0.03, 0.03, true);
  for (const z of [-0.28, 0.28]) beam(g, frame, [-0.4, 0.78, z], [0.4, 0.78, z], 0.03, 0.03, true);
  block(g, red, 0.12, 0.66, 0, 0.5, 0.18, 0.46, 0.06);              // fuel tank
  block(g, mat(0x3a3a3a, { rough: 0.6, metal: 0.5 }), -0.12, 0.36, 0, 0.42, 0.36, 0.4, 0.04);   // engine
  block(g, mat(0x6a6a66, { rough: 0.4, metal: 0.8 }), 0.2, 0.32, 0.05, 0.3, 0.3, 0.32, 0.04);  // alternator
  cyl(g, METAL(), 0.12, 0.78, 0.1, 0.05, 0.04);                      // filler cap
  cyl(g, BLACK(), -0.44, 0.42, 0.0, 0.03, 0.05).rotation.z = Math.PI / 2;   // the pull cord's handle
  cyl(g, mat(0x555555, { rough: 0.4, metal: 0.8 }), -0.25, 0.62, -0.25, 0.05, 0.22);       // exhaust
  const light = mat(0x103011, { emissive: 0x30ff60, ei: 0, rough: 0.3 });
  block(g, light, 0.42, 0.45, 0.12, 0.02, 0.03, 0.03, 0.005);
  return { group: g, light };
}

export function waterTank() {
  const g = new THREE.Group();
  const steel = mat(0x8e928e, { rough: 0.45, metal: 0.7 });
  const legs = STEEL();
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) beam(g, legs, [x, 0, z], [x * 0.85, 1.85, z * 0.85], 0.07);
  for (const y of [0.9, 1.8]) {
    const k = 1 - 0.15 * (y / 1.85);
    for (const [a, b] of [[[-0.8, -0.8], [0.8, -0.8]], [[0.8, -0.8], [0.8, 0.8]], [[0.8, 0.8], [-0.8, 0.8]], [[-0.8, 0.8], [-0.8, -0.8]]]) beam(g, legs, [a[0] * k, y, a[1] * k], [b[0] * k, y, b[1] * k], 0.05);
  }
  box(g, wood('#6a5a44', 'tankDeck'), 0, 1.86, 0, 1.5, 0.06, 1.5);
  const t = cyl(g, steel, 0, 2.7, 0, 0.82, 1.6);
  t.material = steel;
  for (const y of [2.1, 2.5, 2.9, 3.3]) cyl(g, mat(0x7a7e7a, { rough: 0.5, metal: 0.7 }), 0, y, 0, 0.835, 0.03);
  place(g, lathe('tankLid', [[0, 0.22], [0.84, 0], [0, 0]], 24), steel, 0, 3.5, 0);
  // the pipe down to the tap, which faces the tower
  beam(g, METAL(), [0.3, 1.9, 0.6], [0.3, 0.85, 0.95], 0.03, 0.03, true);
  const tap = new THREE.Group();
  tap.position.set(0.3, 0.8, 0.98);
  g.add(tap);
  cyl(tap, mat(0xb08a40, { rough: 0.3, metal: 0.9 }), 0, 0, 0, 0.035, 0.12);
  block(tap, mat(0xa02020, { rough: 0.5 }), 0, 0.09, 0, 0.12, 0.02, 0.03, 0.005);
  return { group: g, tap };
}

// a small open-fronted shed with a workbench (local +z is the open side)
export function shed() {
  const g = new THREE.Group();
  const w = 2.6, d = 2.2;
  const walls = mat(0xffffff, { map: TX.tiled(TX.siding('#7a5a3e', 'sidingBrown'), 1.5, 1.2), rough: 0.85 });
  box(g, walls, 0, 1.0, -d / 2 + 0.05, w, 2.0, 0.1);
  for (const s of [-1, 1]) box(g, walls, s * (w / 2 - 0.05), 1.05, 0, 0.1, 2.1, d);
  const roof = place(g, new THREE.BoxGeometry(w + 0.4, 0.06, d + 0.5), mat(0xffffff, { map: TX.tiled(TX.roofing(), 3, 2), rough: 0.6, metal: 0.4 }), 0, 2.2, 0.1);
  roof.rotation.x = -0.12;
  // the workbench along the back
  const bench = wood('#8a6a48', 'bench');
  box(g, bench, 0, 0.9, -d / 2 + 0.38, w - 0.25, 0.05, 0.5);
  for (const x of [-1.1, 1.1]) box(g, bench, x, 0.45, -d / 2 + 0.38, 0.06, 0.9, 0.45);
  box(g, bench, 0, 1.5, -d / 2 + 0.2, w - 0.3, 0.03, 0.26);           // a shelf
  // things on the shelf and the wall
  for (let i = 0; i < 6; i++) cyl(g, mat([0x6a6a6a, 0x8a3020, 0x2a4a6a][i % 3], { rough: 0.5, metal: 0.4 }), -1.0 + i * 0.32, 1.6, -d / 2 + 0.2, 0.06, 0.16);
  const axe = new THREE.Group();
  axe.position.set(0.9, 1.25, -d / 2 + 0.12);
  axe.rotation.z = 0.3;
  g.add(axe);
  box(axe, wood('#a07a4a', 'handle'), 0, 0, 0, 0.04, 0.8, 0.03);
  box(axe, mat(0x5a5a5a, { rough: 0.4, metal: 0.8 }), 0.07, 0.35, 0, 0.16, 0.1, 0.02);
  // a bare bulb over the door, on the generator
  const bulbMat = mat(0xfff4e0, { emissive: 0xffd8a0, ei: 0, rough: 0.3 });
  ball(g, bulbMat, 0, 2.0, d / 2 - 0.1, 0.05);
  return { group: g, bulbMat };
}

export function outhouse() {
  const g = new THREE.Group();
  const walls = mat(0xffffff, { map: TX.tiled(TX.siding('#8a6a4a', 'sidingOut'), 0.8, 1.2), rough: 0.9 });
  for (const [x, z, w, d] of [[0, -0.6, 1.2, 0.06], [0, 0.6, 1.2, 0.06], [-0.6, 0, 0.06, 1.2]]) box(g, walls, x, 1.05, z, w, 2.1, d);
  // the door, with its moon
  const door = new THREE.Group();
  door.position.set(0.6, 0, -0.55);
  g.add(door);
  box(door, walls, 0, 1.0, 0.55, 0.05, 2.0, 1.1);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), mat(0x0a0806, { rough: 1 }));
  moon.position.set(0.03, 1.65, 0.55);
  moon.rotation.y = Math.PI / 2;
  door.add(moon);
  const roof = box(g, mat(0xffffff, { map: TX.roofing(), rough: 0.6, metal: 0.4 }), 0, 2.2, 0, 1.45, 0.05, 1.45);
  roof.rotation.z = 0.12;
  return { group: g, door };
}

export function woodpile() {
  const g = new THREE.Group();
  const bark = mat(0x5a4230, { rough: 0.95 });
  const end = mat(0xb8905a, { rough: 0.9 });
  let i = 0;
  for (let row = 0; row < 4; row++) {
    for (let k = 0; k < 9 - row; k++) {
      const x = -0.85 + k * 0.2 + row * 0.1, y = 0.1 + row * 0.18;
      const log = cyl(g, i % 3 ? bark : end, x, y, 0, 0.09 + (i % 2) * 0.01, 0.75);
      log.rotation.x = Math.PI / 2;
      i++;
    }
  }
  const blockG = cyl(g, mat(0x7a5a3a, { rough: 0.9 }), 1.5, 0.25, 0.4, 0.25, 0.5);
  blockG.castShadow = true;
  const axe = new THREE.Group();
  axe.position.set(1.5, 0.55, 0.4);
  axe.rotation.set(0.2, 0.4, -0.5);
  g.add(axe);
  box(axe, wood('#a07a4a', 'handle'), 0, 0.3, 0, 0.04, 0.75, 0.03);
  box(axe, mat(0x5a5a5a, { rough: 0.4, metal: 0.8 }), 0.06, 0.0, 0, 0.16, 0.1, 0.02);
  return g;
}

// the old lookout's trail camera, strapped to a pine (local +z faces where it looks)
export function trailCam() {
  const g = new THREE.Group();
  const camo = mat(0x4a4a32, { rough: 0.9 });
  block(g, camo, 0, 0, 0, 0.12, 0.17, 0.08, 0.015);
  cyl(g, mat(0x050505, { rough: 0.1 }), 0, 0.02, 0.04, 0.022, 0.02).rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) ball(g, mat(0x200808, { rough: 0.3 }), -0.035 + (i % 3) * 0.035, -0.045 - Math.floor(i / 3) * 0.02, 0.041, 0.006);
  box(g, mat(0x1a1a1a, { rough: 0.8 }), 0, 0, -0.06, 0.13, 0.03, 0.04);
  return g;
}

export function signboard(lines, w = 1.4, h = 0.6) {
  const g = new THREE.Group();
  const post = wood('#5a4630', 'post');
  for (const s of [-1, 1]) box(g, post, s * (w / 2 - 0.08), 0.9, 0, 0.1, 1.8, 0.1);
  const tex = TX.sign(lines, { w: 512, h: Math.round(512 * h / w), bg: '#5a3e26', fg: '#e8dcc0', font: 'bold 44px Georgia, serif', border: '#e8dcc0' });
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), [post, post, post, post, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), post]);
  board.position.y = 1.45;
  board.castShadow = true;
  g.add(board);
  return g;
}

// a yellow pipe gate across the road (local x runs across the road)
export function roadGate() {
  const g = new THREE.Group();
  const yel = mat(0xc8a028, { rough: 0.5, metal: 0.4 });
  for (const s of [-1, 1]) cyl(g, yel, s * 2.2, 0.6, 0, 0.07, 1.2);
  const arm = new THREE.Group();
  arm.position.set(-2.2, 0.95, 0);
  g.add(arm);
  beam(arm, yel, [0, 0, 0], [4.4, 0, 0], 0.045, 0.045, true);
  beam(arm, yel, [0, -0.4, 0], [4.4, -0.05, 0], 0.03, 0.03, true);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshStandardMaterial({ map: TX.sign('ROAD CLOSED', { w: 256, h: 128, bg: '#e8e4d8', fg: '#a01818', font: 'bold 44px Arial, sans-serif' }), roughness: 0.6, side: THREE.DoubleSide }));
  plate.position.set(2.2, -0.15, 0.03);
  arm.add(plate);
  return { group: g, arm };
}

// his camp: a tarp lean-to, a bedroll, a cold fire ring, a crate, and a
// line strung between two poles with photographs pegged to it
export function camp(photoTex) {
  const g = new THREE.Group();
  const pole = wood('#6a5236', 'campPole');
  const tarp = mat(0x4a5236, { rough: 0.9, side: THREE.DoubleSide });
  beam(g, pole, [-1.4, 0, -0.9], [-1.4, 1.5, -0.9], 0.04, 0.04, true);
  beam(g, pole, [1.4, 0, -0.9], [1.4, 1.5, -0.9], 0.04, 0.04, true);
  beam(g, mat(0x8a8a7a), [-1.4, 1.5, -0.9], [1.4, 1.5, -0.9], 0.008, 0.008, true);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.2), tarp);
  sheet.position.set(0, 0.78, -1.75);
  sheet.rotation.x = -0.86;
  sheet.castShadow = true;
  g.add(sheet);
  const roll = cyl(g, cloth(0x2a3a2a), 0, 0.14, -1.6, 0.16, 1.8);
  roll.rotation.z = Math.PI / 2;
  // the fire ring
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    ball(g, mat(0x6a665e, { rough: 1 }), 0.4 + Math.cos(a) * 0.45, 0.07, 1.0 + Math.sin(a) * 0.45, 0.12, 0.09, 0.11);
  }
  const ash = new THREE.Mesh(new THREE.CircleGeometry(0.36, 16), mat(0x1a1816, { rough: 1 }));
  ash.rotation.x = -Math.PI / 2;
  ash.position.set(0.4, 0.02, 1.0);
  g.add(ash);
  for (let i = 0; i < 3; i++) { const l = cyl(g, mat(0x141210, { rough: 1 }), 0.4, 0.06, 1.0, 0.04, 0.5); l.rotation.set(Math.PI / 2, i * 1.1, 0); }
  block(g, wood('#7a6040', 'crate'), -1.4, 0.22, 0.6, 0.6, 0.44, 0.45, 0.01);
  for (let i = 0; i < 4; i++) cyl(g, mat(0x8a8a86, { rough: 0.4, metal: 0.8 }), -1.55 + i * 0.12, 0.49, 0.55, 0.035, 0.1);
  // the line of photographs
  for (const s of [-1, 1]) beam(g, pole, [1.6, 0, -1.2 + s * 1.3], [1.6, 1.8, -1.2 + s * 1.3], 0.035, 0.035, true);
  beam(g, mat(0x8a8a7a), [1.6, 1.75, -2.5], [1.6, 1.75, 0.1], 0.006, 0.006, true);
  photoTex.forEach((tex, i) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.24), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, side: THREE.DoubleSide }));
    p.position.set(1.58, 1.58 - (i % 2) * 0.03, -2.2 + i * 0.32);
    p.rotation.y = -Math.PI / 2 + (i % 2 ? 0.08 : -0.06);
    p.rotation.z = (i % 3 - 1) * 0.06;
    g.add(p);
  });
  return g;
}

export function spring() {
  const g = new THREE.Group();
  const rock = mat(0x6e6a62, { rough: 1 });
  ball(g, rock, -0.6, 0.4, -0.5, 1.0, 0.7, 0.8);
  ball(g, rock, 0.5, 0.3, -0.7, 0.7, 0.5, 0.6);
  beam(g, mat(0x7a5a3a, { rough: 0.6, metal: 0.7 }), [0, 0.6, -0.4], [0, 0.6, 0.05], 0.03, 0.03, true);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.55, 6), mat(0xb0d0e8, { opacity: 0.6, rough: 0.05 }));
  water.position.set(0, 0.32, 0.07);
  g.add(water);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), mat(0x101820, { rough: 0.05, metal: 0.2 }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.04, 0.25);
  g.add(pool);
  return g;
}

// ------------------------------------------------------------- the cab --
// the desk under the north windows, with the radio. Returns the radio's
// lamp (lit when it has power) and the handset.
export function desk() {
  const g = new THREE.Group();
  const top = wood('#7a5a3a', 'desk');
  block(g, top, 0, 0.76, 0, 1.85, 0.04, 0.6, 0.01);
  for (const [x, z] of [[-0.88, -0.25], [0.88, -0.25], [-0.88, 0.25], [0.88, 0.25]]) box(g, top, x, 0.37, z, 0.05, 0.74, 0.05);
  block(g, top, 0.55, 0.62, 0.05, 0.7, 0.2, 0.5, 0.01);
  // the radio
  const r = new THREE.Group();
  r.position.set(0.25, 0.78, -0.08);
  g.add(r);
  block(r, mat(0x3a3e38, { rough: 0.5, metal: 0.4 }), 0, 0.12, 0, 0.44, 0.24, 0.28, 0.02);
  block(r, mat(0x1a1c1a, { rough: 0.6 }), 0, 0.13, 0.142, 0.4, 0.2, 0.01, 0.005);
  for (let i = 0; i < 3; i++) cyl(r, mat(0xd8d8d0, { rough: 0.4 }), -0.12 + i * 0.07, 0.07, 0.15, 0.018, 0.02).rotation.x = Math.PI / 2;
  const lamp = mat(0x103010, { emissive: 0x30ff60, ei: 0, rough: 0.3 });
  block(r, lamp, 0.12, 0.19, 0.15, 0.03, 0.015, 0.01, 0.003);
  const dial = mat(0x2a2010, { emissive: 0xffb050, ei: 0, rough: 0.3 });
  block(r, dial, -0.05, 0.18, 0.148, 0.16, 0.045, 0.005, 0.003);
  for (let i = 0; i < 8; i++) box(r, mat(0x0a0a0a), 0.06 + i * 0.016, 0.08, 0.148, 0.006, 0.06, 0.004);
  const hand = new THREE.Group();
  hand.position.set(-0.3, 0.06, 0.06);
  r.add(hand);
  block(hand, BLACK(), 0, 0, 0, 0.06, 0.12, 0.04, 0.015);
  beam(r, mat(0x111111), [-0.3, 0.0, 0.06], [-0.2, 0.06, 0.0], 0.004, 0.004, true);
  // the antenna lead out through the wall
  beam(g, mat(0x111111), [0.45, 0.9, -0.1], [0.9, 1.5, -0.32], 0.008, 0.008, true);
  // the logbook, a mug, a pencil
  const book = new THREE.Group();
  book.position.set(-0.55, 0.785, 0.02);
  book.rotation.y = 0.1;
  g.add(book);
  for (const s of [-1, 1]) block(book, mat(0xf0ead8, { rough: 0.9 }), s * 0.11, 0.008, 0, 0.21, 0.015, 0.29, 0.004).rotation.z = -s * 0.04;
  block(book, mat(0x5a2a1e, { rough: 0.7 }), 0, 0.0, 0, 0.46, 0.008, 0.31, 0.003);
  place(g, lathe('mug', [[0, 0], [0.04, 0], [0.042, 0.1], [0.038, 0.1], [0.036, 0.008], [0, 0.008]], 16), mat(0xe8e2d4, { rough: 0.3 }), 0.8, 0.78, 0.12);
  // the clipboard with this week's code word (drawn later)
  const clip = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), new THREE.MeshStandardMaterial({ roughness: 0.8 }));
  clip.rotation.x = -Math.PI / 2;
  clip.rotation.z = -0.2;
  clip.position.set(-0.15, 0.785, 0.14);
  g.add(clip);
  return { group: g, lamp, dial, clip };
}

// The fire finder: a round table with a map, a ring marked in degrees,
// and a sighting bar (the alidade) that turns to point at the smoke.
export function fireFinder() {
  const g = new THREE.Group();
  const wd = wood('#6a4a30', 'finder');
  cyl(g, wd, 0, 0.5, 0, 0.09, 1.0);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; beam(g, wd, [0, 0.1, 0], [Math.cos(a) * 0.35, 0.0, Math.sin(a) * 0.35], 0.05); }
  cyl(g, wd, 0, 1.0, 0, 0.44, 0.04);
  const map = new THREE.Mesh(new THREE.CircleGeometry(0.4, 48), new THREE.MeshStandardMaterial({ map: TX.finderMap(), roughness: 0.7 }));
  map.rotation.x = -Math.PI / 2;
  map.position.y = 1.022;
  g.add(map);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.012, 6, 48), mat(0xb08a40, { rough: 0.3, metal: 0.9 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.03;
  g.add(ring);
  const ali = new THREE.Group();
  ali.position.y = 1.04;
  g.add(ali);
  const brass = mat(0xb08a40, { rough: 0.3, metal: 0.9 });
  box(ali, brass, 0, 0.005, 0, 0.03, 0.01, 0.84);
  // rear sight (a slotted post) at +z, front sight (a frame with a hair
  // strung down the middle) at -z: you look through both towards -z
  for (const x of [-0.022, 0.022]) box(ali, brass, x, 0.09, 0.4, 0.012, 0.18, 0.008);
  for (const x of [-0.045, 0.045]) box(ali, brass, x, 0.13, -0.4, 0.01, 0.26, 0.008);
  box(ali, brass, 0, 0.255, -0.4, 0.1, 0.012, 0.008);
  box(ali, mat(0x111111), 0, 0.13, -0.4, 0.0015, 0.24, 0.002);
  return { group: g, alidade: ali };
}

export function bunks() {
  const g = new THREE.Group();
  const frame = mat(0x4a5a4a, { rough: 0.5, metal: 0.6 });
  for (const [x, z] of [[-0.36, -0.95], [0.36, -0.95], [0.36, 0.95], [-0.36, 0.95]]) cyl(g, frame, x, 0.85, z, 0.025, 1.7);
  for (const y of [0.32, 1.42]) {
    for (const s of [-1, 1]) beam(g, frame, [s * 0.36, y, -0.95], [s * 0.36, y, 0.95], 0.025, 0.025, true);
    block(g, cloth(0x7a7466), 0, y + 0.08, 0, 0.66, 0.12, 1.86, 0.05);
  }
  block(g, cloth(0x8a2a24), 0, 0.5, 0.25, 0.7, 0.05, 1.3, 0.02);
  block(g, cloth(0x2a4a6a), 0, 1.6, 0.3, 0.7, 0.05, 1.2, 0.02);
  for (const y of [0.52, 1.62]) block(g, cloth(0xe8e2d4), 0, y, -0.72, 0.5, 0.1, 0.32, 0.05);
  for (let i = 0; i < 4; i++) beam(g, frame, [-0.36, 0.5 + i * 0.3, 0.95], [0.36, 0.5 + i * 0.3, 0.95], 0.015, 0.015, true);
  return g;
}

export function cot() {
  const g = new THREE.Group();
  const al = mat(0xa0a4a0, { rough: 0.35, metal: 0.8 });
  for (const s of [-1, 1]) beam(g, al, [s * 0.32, 0.4, -0.95], [s * 0.32, 0.4, 0.95], 0.02, 0.02, true);
  for (const z of [-0.85, 0, 0.85]) for (const s of [-1, 1]) beam(g, al, [s * 0.32, 0.4, z], [-s * 0.32, 0.0, z], 0.012, 0.012, true);
  box(g, mat(0x5a6a4a, { rough: 0.9 }), 0, 0.41, 0, 0.62, 0.02, 1.88);
  block(g, cloth(0x6a5a3a), 0, 0.45, 0.3, 0.62, 0.06, 1.1, 0.02);
  block(g, cloth(0xe8e2d4), 0, 0.47, -0.72, 0.42, 0.08, 0.28, 0.04);
  return g;
}

export function sleepingBag() {
  const g = new THREE.Group();
  block(g, cloth(0x2a5a8a), 0, 0.07, 0, 0.75, 0.13, 1.9, 0.06);
  block(g, cloth(0x1a3a5a), 0, 0.1, -0.8, 0.6, 0.12, 0.3, 0.05);
  return g;
}

// the wood stove in the corner, its pipe going up through the roof
export function stove() {
  const g = new THREE.Group();
  const iron = mat(0x1c1c1c, { rough: 0.6, metal: 0.5 });
  block(g, iron, 0, 0.42, 0, 0.5, 0.5, 0.55, 0.02);
  for (const [x, z] of [[-0.2, -0.22], [0.2, -0.22], [0.2, 0.22], [-0.2, 0.22]]) cyl(g, iron, x, 0.09, z, 0.025, 0.18);
  const fire = mat(0x1a0a04, { emissive: 0xff6a20, ei: 0, rough: 0.8 });
  block(g, fire, 0.12, 0.4, 0.27, 0.2, 0.16, 0.02, 0.01);
  block(g, iron, 0.12, 0.4, 0.285, 0.24, 0.2, 0.01, 0.005);
  cyl(g, iron, 0, 2.2, 0, 0.07, 3.6);
  return { group: g, fire };
}

// a three-legged stool on glass insulators: where you sit in a lightning storm
export function lightningStool() {
  const g = new THREE.Group();
  const w = wood('#8a6a48', 'stool');
  cyl(g, w, 0, 0.62, 0, 0.17, 0.04);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    beam(g, w, [Math.cos(a) * 0.12, 0.6, Math.sin(a) * 0.12], [Math.cos(a) * 0.18, 0.1, Math.sin(a) * 0.18], 0.03);
    place(g, lathe('insul', [[0, 0], [0.045, 0], [0.04, 0.06], [0.025, 0.1], [0, 0.1]], 12), mat(0x6aa08a, { rough: 0.05, opacity: 0.8 }), Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18);
  }
  return g;
}

export function lamp() {
  const g = new THREE.Group();
  cyl(g, mat(0x222222), 0, -0.1, 0, 0.006, 0.2);
  place(g, lathe('shade', [[0.0, 0.0], [0.04, 0.0], [0.17, -0.1], [0.165, -0.11], [0.035, -0.012], [0, -0.012]], 24), mat(0x2a3a2a, { rough: 0.4, metal: 0.5, side: THREE.DoubleSide }), 0, -0.2, 0);
  const bulb = mat(0xfff4e1, { emissive: 0xffd8a0, ei: 0, rough: 0.3 });
  ball(g, bulb, 0, -0.27, 0, 0.045);
  return { group: g, bulb };
}

// ---------------------------------------------------------------- items --
// Things that can be carried, each standing on its own base at y = 0.
export function item(kind, state = 0) {
  const g = new THREE.Group();
  switch (kind) {
    case 'box': {
      block(g, mat(0xb8956a, { rough: 0.9 }), 0, 0.18, 0, 0.5, 0.36, 0.38, 0.015);
      box(g, mat(0xd8c8a0, { rough: 0.5 }), 0, 0.361, 0, 0.08, 0.004, 0.385);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.12), new THREE.MeshStandardMaterial({ map: TX.sign('SUPPLIES', { w: 256, h: 128, bg: '#e8e0cc', fg: '#3a2a1a', font: 'bold 40px Arial, sans-serif' }), roughness: 0.8 }));
      label.position.set(0, 0.2, 0.192);
      g.add(label);
      break;
    }
    case 'jug': {
      const plastic = mat(state ? 0x6ab0e0 : 0xa8d0ea, { rough: 0.15, opacity: state ? 0.85 : 0.5 });
      place(g, lathe('jug', [[0, 0], [0.14, 0], [0.15, 0.03], [0.15, 0.36], [0.1, 0.43], [0.045, 0.46], [0.045, 0.5], [0, 0.5]], 20), plastic);
      cyl(g, mat(0x2a5aa8, { rough: 0.4 }), 0, 0.51, 0, 0.05, 0.03);
      break;
    }
    case 'fuel': {
      const red = mat(0xb02a1e, { rough: 0.45, metal: 0.3 });
      block(g, red, 0, 0.21, 0, 0.36, 0.42, 0.17, 0.03);
      block(g, red, 0, 0.47, -0.05, 0.22, 0.06, 0.04, 0.01);
      cyl(g, mat(0xb8b8b0, { rough: 0.3, metal: 0.9 }), 0.12, 0.47, 0.03, 0.025, 0.08);
      break;
    }
    case 'binocs': {
      const blk = mat(0x1a1a1a, { rough: 0.5 });
      for (const s of [-1, 1]) { const c = cyl(g, blk, s * 0.035, 0.035, 0, 0.032, 0.14); c.rotation.x = Math.PI / 2; }
      box(g, blk, 0, 0.04, -0.02, 0.05, 0.02, 0.05);
      break;
    }
    case 'keys': {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0025, 6, 16), METAL());
      ring.position.y = 0.06;
      g.add(ring);
      for (const s of [-1, 1]) { const k = box(g, mat(0xc8b070, { rough: 0.3, metal: 0.9 }), s * 0.012, 0.025, 0, 0.012, 0.05, 0.003); k.rotation.z = s * 0.2; }
      box(g, mat(0x5a3a22, { rough: 0.7 }), 0.03, 0.04, 0.0, 0.025, 0.05, 0.004);
      break;
    }
    case 'cable': {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 20), mat(0x111111, { rough: 0.5 }));
      coil.rotation.x = Math.PI / 2;
      coil.position.y = 0.03;
      coil.castShadow = true;
      g.add(coil);
      const c2 = coil.clone();
      c2.position.y = 0.07;
      c2.scale.setScalar(0.92);
      g.add(c2);
      break;
    }
    case 'jar': {
      place(g, lathe('jar', [[0, 0], [0.05, 0], [0.055, 0.02], [0.055, 0.11], [0.04, 0.13], [0, 0.13]], 16), mat(0xc8d8e0, { rough: 0.05, opacity: 0.45 }));
      cyl(g, mat(0x2a1a3a, { rough: 0.5 }), 0, 0.05, 0, 0.048, 0.09);
      cyl(g, mat(0x8a8a86, { rough: 0.3, metal: 0.8 }), 0, 0.135, 0, 0.043, 0.012);
      const note = box(g, mat(0xe8e0cc, { rough: 0.9 }), 0.0, 0.003, 0.09, 0.09, 0.002, 0.06);
      note.rotation.y = 0.3;
      break;
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
