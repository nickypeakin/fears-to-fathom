// The elevator: a brushed-steel car with a handrail, a button panel and an
// amber floor display, and the sliding doors you wait at. The same car
// stands in the lobby and on the 50th floor; the opening cutscene rides it
// up between the two.
//
// Car coordinates: origin on the floor in the middle of the doorway, the
// car runs back towards -z, the doors face +z.

import * as THREE from 'three';
import * as TX from './textures.js';
import { mat, block, cyl } from './props.js';

export const CAR = { w: 1.8, d: 1.55, h: 2.5, door: 1.0 };

function display() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const x = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  let shown = null;
  const set = (floor, dir = 0) => {
    const key = `${floor}:${dir}`;
    if (key === shown) return;
    shown = key;
    x.fillStyle = '#0a0604';
    x.fillRect(0, 0, 256, 96);
    x.fillStyle = '#ffb030';
    x.shadowColor = '#ff8a00';
    x.shadowBlur = 12;
    x.font = 'bold 66px "Courier New", monospace';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(floor === 0 ? 'L' : String(floor), 150, 52);
    if (dir) {
      x.beginPath();
      if (dir > 0) { x.moveTo(40, 66); x.lineTo(62, 30); x.lineTo(84, 66); }
      else { x.moveTo(40, 30); x.lineTo(62, 66); x.lineTo(84, 30); }
      x.fill();
    }
    x.shadowBlur = 0;
    tex.needsUpdate = true;
  };
  set(0);
  return { tex, set };
}

// Sliding doors in a steel frame; `open(k)` slides them apart (0..1).
export function liftDoors(width = CAR.door, height = 2.2) {
  const g = new THREE.Group();
  const steel = mat(0xc8cacc, { map: TX.brushed(), rough: 0.3, metal: 0.9 });
  const frame = mat(0x9a9c9e, { rough: 0.25, metal: 0.9 });
  const panels = [];
  for (const s of [-1, 1]) {
    const p = block(g, steel, s * width / 4, height / 2, 0, width / 2 - 0.005, height, 0.04, 0.004);
    panels.push(p);
  }
  // frame
  block(g, frame, -width / 2 - 0.05, height / 2, 0.03, 0.1, height + 0.1, 0.08, 0.01);
  block(g, frame, width / 2 + 0.05, height / 2, 0.03, 0.1, height + 0.1, 0.08, 0.01);
  block(g, frame, 0, height + 0.05, 0.03, width + 0.2, 0.1, 0.08, 0.01);
  // floor display above
  const disp = display();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.11), new THREE.MeshBasicMaterial({ map: disp.tex, toneMapped: false }));
  screen.position.set(0, height + 0.24, 0.052);
  g.add(screen);
  block(g, frame, 0, height + 0.24, 0.03, 0.36, 0.16, 0.04, 0.01);
  // call button beside it
  block(g, frame, width / 2 + 0.28, 1.15, 0.01, 0.1, 0.22, 0.02, 0.008);
  const btn = new THREE.Mesh(new THREE.CircleGeometry(0.022, 20), mat(0xfff0d0, { emissive: 0xffa040, ei: 0.4 }));
  btn.position.set(width / 2 + 0.28, 1.18, 0.022);
  g.add(btn);
  let k = 0;
  return {
    group: g, display: disp, button: btn,
    get open() { return k; },
    setOpen(v) {
      k = v;
      panels[0].position.x = -width / 4 - v * width / 2 * 0.98;
      panels[1].position.x = width / 4 + v * width / 2 * 0.98;
    },
  };
}

export function elevatorCar() {
  const g = new THREE.Group();
  const { w, d, h } = CAR;
  const steel = mat(0xb0b2b4, { map: TX.brushed(), rough: 0.42, metal: 0.7, env: 0.5 });
  const dark = mat(0x2a2624, { rough: 0.6 });
  // floor, walls, ceiling
  block(g, mat(0xffffff, { map: TX.tiles('#3a3632', 'liftFloor', 3), rough: 0.35 }), 0, -0.01, -d / 2, w, 0.02, d, 0.002);
  block(g, steel, 0, h / 2, -d - 0.02, w, h, 0.04, 0.004);
  for (const s of [-1, 1]) block(g, steel, s * (w / 2 + 0.02), h / 2, -d / 2, 0.04, h, d, 0.004);
  for (const s of [-1, 1]) block(g, steel, s * (w / 2 + CAR.door / 2) / 2, h / 2, 0.0, (w - CAR.door) / 2, h, 0.04, 0.004);
  block(g, steel, 0, h - 0.12, 0, CAR.door, 0.24, 0.04, 0.004);
  block(g, mat(0xf2f0ea, { rough: 0.6 }), 0, h + 0.01, -d / 2, w, 0.02, d, 0.002);
  // a glowing ceiling panel and a wood back panel with a handrail
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, d - 0.4), mat(0xffffff, { emissive: 0xfff2dc, ei: 1.1, rough: 0.6 }));
  panel.rotation.x = Math.PI / 2;
  panel.position.set(0, h - 0.005, -d / 2);
  panel.userData.lamp = true;
  g.add(panel);
  block(g, mat(0xffffff, { map: TX.wood('#5a3a26', 'liftWood'), rough: 0.4 }), 0, 1.25, -d + 0.005, w - 0.2, 1.6, 0.02, 0.004);
  const rail = cyl(g, mat(0xb8a070, { rough: 0.25, metal: 0.9 }), 0, 0.95, -d + 0.07, 0.018, w - 0.3);
  rail.rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) {
    const r2 = cyl(g, mat(0xb8a070, { rough: 0.25, metal: 0.9 }), s * (w / 2 - 0.07), 0.95, -d / 2, 0.018, d - 0.3);
    r2.rotation.x = Math.PI / 2;
  }
  // button panel on the right as you face the doors from inside
  block(g, dark, w / 2 - 0.01, 1.2, -0.28, 0.02, 0.6, 0.2, 0.006);
  for (let i = 0; i < 12; i++) {
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.014, 14), mat(0xd8d0c0, { emissive: i === 11 ? 0xffa040 : 0x000000, ei: 0.8, rough: 0.3, metal: 0.6 }));
    b.position.set(w / 2 - 0.022, 1.0 + Math.floor(i / 2) * 0.06, -0.33 + (i % 2) * 0.08);
    b.rotation.y = -Math.PI / 2;
    g.add(b);
  }
  // floor display inside, above the doors
  const disp = display();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.1), new THREE.MeshBasicMaterial({ map: disp.tex, toneMapped: false }));
  screen.position.set(0, h - 0.12, -0.025);
  screen.rotation.y = Math.PI;
  g.add(screen);
  const light = new THREE.PointLight(0xfff0dc, 2.6, 4, 2);
  light.position.set(0, h - 0.3, -d / 2);
  g.add(light);
  return { group: g, display: disp, light, panel };
}
