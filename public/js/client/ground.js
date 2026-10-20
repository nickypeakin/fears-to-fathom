// Street level, for the opening: the sidewalk outside the tower at dusk,
// the marble lobby with its night concierge, and the elevator that carries
// everyone up to 50. Built when a night starts and thrown away once the
// elevator doors close.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as TX from './textures.js';
import { mat, block, cyl, ball } from './props.js';
import { City } from './city.js';
import { elevatorCar, liftDoors } from './elevator.js';
import { makePerson } from './humans.js';

export const LOBBY = { x0: 2, x1: 24, z0: -2.4, z1: 8.8, h: 4.5 };
export const ENTRANCE = { x: 13.4, z: 8.8, w: 2.0 };
export const LIFT = { x: 9.2, z: -2.4 };            // elevator A doorway, as upstairs
export const SIDEWALK = { z0: 8.8, z1: 14, curb: 0.14 };

export class Ground {
  constructor(renderer, city) {
    const s = (this.scene = new THREE.Scene());
    this.far = new THREE.Scene();
    this.city = new City({ groundY: 0, exclude: 90, tower: true });
    this.far.add(this.city.group);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    s.environment = this.env;
    s.environmentIntensity = 0.35;

    const plane = (w, d, m, x, y, z, rx = -Math.PI / 2) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
      p.rotation.x = rx;
      p.position.set(x, y, z);
      p.receiveShadow = true;
      s.add(p);
      return p;
    };
    const box = (m, x0, x1, y0, y1, z0, z1) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
      b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      b.castShadow = b.receiveShadow = true;
      s.add(b);
      return b;
    };

    // ---------------------------------------------------------- street
    const sw = mat(0xffffff, { map: TX.tiled(TX.pavers(), 160 / 2, 6 / 2), rough: 0.8 });
    plane(160, 5.2, sw, 15, SIDEWALK.curb, 11.4);
    plane(160, 4, sw, 15, SIDEWALK.curb, 28);
    box(mat(0x8a8884, { rough: 0.7 }), -65, 95, 0, SIDEWALK.curb, 13.9, 14.1);
    box(mat(0x8a8884, { rough: 0.7 }), -65, 95, 0, SIDEWALK.curb, 25.9, 26.1);
    plane(160, 12, mat(0xffffff, { map: TX.tiled(TX.asphalt(), 160 / 6, 12 / 6), rough: 0.9 }), 15, 0, 20);
    const paint = mat(0xd8d2b0, { rough: 0.7 });
    for (let x = -60; x < 95; x += 6) plane(3, 0.12, paint, x, 0.004, 20);
    for (const z of [14.6, 25.4]) plane(160, 0.1, mat(0xc8c4b8, { rough: 0.7 }), 15, 0.004, z);
    // crosswalk by the entrance
    for (let k = 0; k < 9; k++) plane(0.5, 3.2, paint, 2 + k * 1.0, 0.005, 20, -Math.PI / 2).rotation.z = Math.PI / 2;

    // ---------------------------------------------------------- the tower and its neighbours
    const boxes = [
      { x: 14.85, z: -3.1, w: 30.3, d: 23.8, h: 185, y0: 4.6, seed: 0.37 },   // ours, above the lobby
      { x: -24, z: -6, w: 36, d: 30, h: 46, seed: 0.81 },
      { x: 52, z: -8, w: 38, d: 34, h: 32, seed: 0.13 },
      { x: -30, z: 42, w: 44, d: 24, h: 38, seed: 0.55 },
      { x: 18, z: 44, w: 30, d: 26, h: 64, seed: 0.91 },
      { x: 58, z: 42, w: 36, d: 24, h: 28, seed: 0.24 },
    ];
    s.add(this.city.buildings(boxes));
    // stone base of the tower around the lobby glass
    const stone = mat(0xffffff, { map: TX.tiled(TX.paint('#3e3a36', 'stone'), 0.3, 0.3), rough: 0.6 });
    box(stone, -0.3, LOBBY.x0, 0, 4.6, -15, 8.8);
    box(stone, LOBBY.x1, 30, 0, 4.6, -15, 8.8);
    box(stone, -0.3, 30, 4.5, 4.62, -15, 9.0);
    // the glass storefront
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x8aa0aa, roughness: 0.05, transparent: true, opacity: 0.18, envMapIntensity: 1.2, side: THREE.DoubleSide, depthWrite: false });
    const front = plane(LOBBY.x1 - LOBBY.x0, 4.4, glass, (LOBBY.x0 + LOBBY.x1) / 2, 2.2, LOBBY.z1, 0);
    front.renderOrder = 5;
    const frame = mat(0x1a1a1c, { rough: 0.3, metal: 0.7 });
    for (let x = LOBBY.x0; x <= LOBBY.x1 + 0.01; x += 2.2) if (Math.abs(x - ENTRANCE.x) > 1.2) box(frame, x - 0.04, x + 0.04, 0, 4.4, LOBBY.z1 - 0.05, LOBBY.z1 + 0.05);
    box(frame, LOBBY.x0, LOBBY.x1, 2.9, 2.98, LOBBY.z1 - 0.05, LOBBY.z1 + 0.05);
    // entrance doors (they swing in) and a canopy with the building's name
    this.entrance = [];
    for (const sgn of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(ENTRANCE.x + sgn * ENTRANCE.w / 2, 0, LOBBY.z1);
      s.add(pivot);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(ENTRANCE.w / 2 - 0.02, 2.5, 0.04), glass);
      leaf.position.set(-sgn * ENTRANCE.w / 4, 1.25, 0);
      pivot.add(leaf);
      for (const x of [-sgn * 0.03, -sgn * (ENTRANCE.w / 2 - 0.03)]) block(pivot, frame, x, 1.25, 0, 0.06, 2.5, 0.05, 0.005);
      for (const y of [0.04, 2.46]) block(pivot, frame, -sgn * ENTRANCE.w / 4, y, 0, ENTRANCE.w / 2, 0.08, 0.05, 0.005);
      block(pivot, mat(0xc0c0c0, { rough: 0.2, metal: 1 }), -sgn * (ENTRANCE.w / 2 - 0.15), 1.1, 0.06, 0.03, 0.9, 0.03, 0.01);
      this.entrance.push({ pivot, sgn });
    }
    box(mat(0x161616, { rough: 0.4, metal: 0.5 }), ENTRANCE.x - 3.5, ENTRANCE.x + 3.5, 3.6, 3.8, LOBBY.z1, LOBBY.z1 + 3.2);
    const name = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.45), new THREE.MeshBasicMaterial({ map: TX.sign('THE HALCYON', { w: 1024, h: 116, bg: '#161616', fg: '#e8d8b0', font: '600 76px Georgia, serif' }), toneMapped: false }));
    name.position.set(ENTRANCE.x, 3.7, LOBBY.z1 + 3.21);
    s.add(name);
    for (const sgn of [-1, 1]) {
      const l = new THREE.PointLight(0xffd8a0, 6, 7, 2);
      l.position.set(ENTRANCE.x + sgn * 2.2, 3.4, LOBBY.z1 + 2.2);
      s.add(l);
      ball(s, mat(0xfff0d0, { emissive: 0xffd8a0, ei: 2 }), ENTRANCE.x + sgn * 2.2, 3.55, LOBBY.z1 + 2.2, 0.12, 0.04, 0.12).userData.lamp = true;
    }

    // ---------------------------------------------------------- street furniture
    const pole = mat(0x1e1e20, { rough: 0.5, metal: 0.6 });
    for (const x of [-12, 4, 22, 40]) {
      cyl(s, pole, x, 2.6, 13.3, 0.07, 5.2);
      const arm = cyl(s, pole, x, 5.2, 12.8, 0.04, 1.1);
      arm.rotation.x = Math.PI / 2;
      block(s, pole, x, 5.15, 12.25, 0.3, 0.12, 0.5, 0.04);
      const lamp = block(s, mat(0xfff0d0, { emissive: 0xffb060, ei: 2.5 }), x, 5.08, 12.25, 0.24, 0.02, 0.4, 0.01);
      lamp.userData.lamp = true;
      const l = new THREE.PointLight(0xffb870, 14, 14, 2);
      l.position.set(x, 4.9, 12.3);
      s.add(l);
    }
    // planters with small trees
    for (const x of [6.5, 20.5]) {
      block(s, stone, x, 0.35, 10.2, 1.4, 0.7, 1.4, 0.04);
      cyl(s, mat(0x3a2a1a, { rough: 1 }), x, 1.6, 10.2, 0.06, 2.0);
      for (let k = 0; k < 6; k++) ball(s, mat(k % 2 ? 0x2f4a2a : 0x3a5a30, { rough: 0.9 }), x + Math.sin(k * 2.1) * 0.5, 2.8 + (k % 3) * 0.3, 10.2 + Math.cos(k * 2.1) * 0.5, 0.75);
    }
    // parked cars along the far curb
    const parked = (x, z, color, ry) => {
      const g = new THREE.Group();
      const body = mat(color, { rough: 0.25, metal: 0.6 });
      block(g, body, 0, 0.62, 0, 1.8, 0.6, 4.4, 0.18);
      block(g, body, 0, 1.08, -0.2, 1.6, 0.5, 2.2, 0.2);
      block(g, mat(0x0a0c10, { rough: 0.05, metal: 0.4 }), 0, 1.1, -0.2, 1.62, 0.36, 2.0, 0.15);
      for (const sx of [-1, 1]) for (const sz of [-1.35, 1.35]) {
        const w = cyl(g, mat(0x111111, { rough: 0.8 }), sx * 0.85, 0.34, sz, 0.34, 0.24);
        w.rotation.z = Math.PI / 2;
      }
      for (const sx of [-0.65, 0.65]) block(g, mat(0xff2a1a, { emissive: 0xff2010, ei: 1.5 }), sx, 0.75, -2.19, 0.3, 0.1, 0.03, 0.01);
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      s.add(g);
    };
    parked(-6, 24.6, 0x2a3a5a, 0);
    parked(30, 24.6, 0x8a8a88, Math.PI);
    parked(46, 15.4, 0x5a1a1a, 0);
    // a bus shelter, where he waits
    const SX = 5.0;
    block(s, frame, SX - 1.4, 1.2, 13.2, 0.06, 2.4, 0.06, 0.01);
    block(s, frame, SX + 1.4, 1.2, 13.2, 0.06, 2.4, 0.06, 0.01);
    block(s, frame, SX, 2.42, 12.7, 3.0, 0.06, 1.3, 0.02);
    const ad = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.7), new THREE.MeshBasicMaterial({ map: TX.painting(1), toneMapped: false, color: 0xbbbbbb }));
    ad.position.set(SX - 1.38, 1.25, 12.6);
    ad.rotation.y = Math.PI / 2;
    s.add(ad);
    block(s, mat(0x5a4a3a, { rough: 0.6 }), SX, 0.62, 13.0, 2.4, 0.06, 0.4, 0.02);

    // ---------------------------------------------------------- lobby
    plane(LOBBY.x1 - LOBBY.x0, LOBBY.z1 - LOBBY.z0, mat(0xffffff, { map: TX.tiled(TX.marble(), (LOBBY.x1 - LOBBY.x0) / 1.2, (LOBBY.z1 - LOBBY.z0) / 1.2), rough: 0.12, env: 1.2 }), (LOBBY.x0 + LOBBY.x1) / 2, 0.01, (LOBBY.z0 + LOBBY.z1) / 2);
    plane(LOBBY.x1 - LOBBY.x0, LOBBY.z1 - LOBBY.z0, mat(0xffffff, { map: TX.tiled(TX.paint('#e8e2d6', 'lobbyCeil'), 3, 3), rough: 0.9 }), (LOBBY.x0 + LOBBY.x1) / 2, LOBBY.h - 0.01, (LOBBY.z0 + LOBBY.z1) / 2, Math.PI / 2);
    const wood = mat(0xffffff, { map: TX.tiled(TX.wood('#5a3a26', 'lobbyWood'), 0.5, 0.5), rough: 0.4 });
    const lobbyWall = mat(0xffffff, { map: TX.tiled(TX.paint('#d8d0c0', 'lobbyWall'), 0.4, 0.4), rough: 0.7 });
    box(lobbyWall, LOBBY.x0, LOBBY.x0 + 0.1, 0, LOBBY.h, LOBBY.z0, LOBBY.z1);
    box(lobbyWall, LOBBY.x1 - 0.1, LOBBY.x1, 0, LOBBY.h, LOBBY.z0, LOBBY.z1);
    // back wall: wood panelling with the two elevators
    const backZ = LOBBY.z0;
    const liftXs = [[8.7, 9.7], [11.2, 12.2]];
    let at = LOBBY.x0;
    for (const [a, b] of liftXs) {
      box(wood, at, a, 0, LOBBY.h, backZ - 0.2, backZ);
      box(wood, a, b, 2.2, LOBBY.h, backZ - 0.2, backZ);
      at = b;
    }
    box(wood, at, LOBBY.x1, 0, LOBBY.h, backZ - 0.2, backZ);
    this.lifts = liftXs.map(([a, b], i) => {
      const d = liftDoors(b - a, 2.2);
      d.group.position.set((a + b) / 2, 0, backZ + 0.001);
      s.add(d.group);
      d.display.set(i === 0 ? 0 : 31, i === 0 ? 0 : -1);
      return d;
    });
    box(mat(0x060606), 11.2, 12.2, 0, 2.2, backZ - 1.4, backZ - 0.2);
    const car = (this.car = elevatorCar());
    car.group.position.set(LIFT.x, 0, backZ - 0.16);
    s.add(car.group);
    // reception desk, the concierge, seating, plants and pendant lights
    block(s, wood, 17.6, 0.55, 3.2, 3.2, 1.1, 0.7, 0.03);
    block(s, mat(0x1e1c1a, { rough: 0.2 }), 17.6, 1.12, 3.2, 3.3, 0.05, 0.8, 0.01);
    const lamp = cyl(s, mat(0x222222, { metal: 0.5, rough: 0.4 }), 16.5, 1.3, 3.2, 0.012, 0.3);
    lamp.castShadow = false;
    ball(s, mat(0xfff0d0, { emissive: 0xffd8a0, ei: 1.5 }), 16.5, 1.47, 3.2, 0.08, 0.05, 0.08).userData.lamp = true;
    const concierge = (this.concierge = makePerson('concierge'));
    concierge.position.set(17.6, 0, 2.5);
    s.add(concierge);
    const sofaM = mat(0x4a3a30, { map: TX.fabric(), rough: 0.9 });
    for (const [x, z, ry] of [[4.2, 4.5, Math.PI / 2], [6.4, 3.0, 0]]) {
      const g = new THREE.Group();
      block(g, sofaM, 0, 0.25, 0, 2.0, 0.3, 0.85, 0.05);
      block(g, sofaM, 0, 0.6, -0.35, 2.0, 0.5, 0.15, 0.05);
      for (const sx of [-0.95, 0.95]) block(g, sofaM, sx, 0.4, 0, 0.12, 0.5, 0.85, 0.05);
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      s.add(g);
    }
    block(s, mat(0x1e1c1a, { rough: 0.15 }), 5.4, 0.4, 5.0, 1.0, 0.04, 1.0, 0.01);
    for (const [x, z] of [[3.0, 0.0], [22.8, 0.0], [22.8, 7.6], [3.0, 7.8]]) {
      cyl(s, mat(0x2a2a2a, { rough: 0.4 }), x, 0.35, z, 0.3, 0.7);
      for (let k = 0; k < 7; k++) ball(s, mat(k % 2 ? 0x2f5a2a : 0x3f6a33, { rough: 0.7 }), x + Math.sin(k * 2.4) * 0.25, 1.0 + k * 0.12, z + Math.cos(k * 2.4) * 0.25, 0.28, 0.4, 0.28);
    }
    for (const [x, z] of [[7, 3], [13, 3], [19, 6], [7, 7], [13, 7]]) {
      cyl(s, mat(0x111111), x, LOBBY.h - 0.5, z, 0.004, 1.0);
      const shade = ball(s, mat(0xfff4e0, { emissive: 0xffd8a8, ei: 1.8 }), x, LOBBY.h - 1.05, z, 0.22, 0.14, 0.22);
      shade.userData.lamp = true;
      shade.castShadow = false;
    }
    for (const [x, z, i] of [[7, 3, 5], [13, 5, 7], [19, 4, 5]]) {
      const l = new THREE.PointLight(0xffe0b8, i, 12, 2);
      l.position.set(x, LOBBY.h - 1.3, z);
      s.add(l);
    }
    // mailboxes on the west wall
    for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) block(s, mat(0xb8a070, { rough: 0.3, metal: 0.8 }), LOBBY.x0 + 0.12, 1.0 + i * 0.22, 0.6 + j * 0.3, 0.02, 0.2, 0.28, 0.006);

    // ---------------------------------------------------------- dusk light
    s.add(new THREE.HemisphereLight(0x7a88b8, 0x3a2a20, 0.6));
    const sun = (this.sun = new THREE.DirectionalLight(0xffb070, 1.6));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 120 });
    sun.shadow.bias = -0.0005;
    sun.target.position.set(12, 0, 6);
    s.add(sun, sun.target);
    this.setHour(19.8);
  }

  setHour(h) {
    const S = this.city.setHour(h);
    this.sun.color.copy(this.city.skyU.glowColor.value);
    this.sun.position.copy(S.sun).multiplyScalar(60).add(this.sun.target.position);
    this.sun.position.y = Math.max(this.sun.position.y, 8);
  }

  // entrance doors open k (0..1)
  setEntrance(k) {
    for (const e of this.entrance) e.pivot.rotation.y = e.sgn * k * 1.3;
  }

  update(t) {
    this.city.update(t);
  }

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

  dispose() {
    // built once and kept: the geometry is shared with other scenes
  }
}
