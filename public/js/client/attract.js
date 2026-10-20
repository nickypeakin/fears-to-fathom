// The title screen's background: the lookout at sundown, the camera
// drifting round the tower, along the catwalk and through the cab.

import * as THREE from 'three';

const SHOTS = [
  { from: [16, 1.6, 15], to: [12, 2.4, 17], look: [0, 12, 0], dur: 20 },
  { from: [-3.1, 15.5, 3.1], to: [-3.1, 15.6, -1.0], look: [-60, 8, -30], dur: 20 },
  { from: [1.6, 15.6, 1.8], to: [0.4, 15.5, 1.9], look: [-12, 13, -14], dur: 18 },
  { from: [-22, 4, -12], to: [-18, 7, -16], look: [0, 13, 0], dur: 18 },
];

export class Attract {
  constructor(world) {
    this.world = world;
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.05, 1100);
    this.t = 0;
    this.i = 0;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.t += dt;
    let s = SHOTS[this.i];
    if (this.t > s.dur) { this.t = 0; this.i = (this.i + 1) % SHOTS.length; s = SHOTS[this.i]; }
    const k = this.t / s.dur;
    const e = k * k * (3 - 2 * k);
    const c = this.camera;
    c.position.set(...s.from.map((v, j) => v + (s.to[j] - v) * e));
    c.lookAt(...s.look);
    const W = this.world;
    W.setHour(20.05);
    W.setState({ gen: true, light: true });
    W.update(dt, performance.now() / 1000, {});
  }

  // fades in and out at the cuts
  get fade() {
    const s = SHOTS[this.i];
    return Math.max(0, 1 - this.t / 1.2, 1 - (s.dur - this.t) / 1.2);
  }
}
