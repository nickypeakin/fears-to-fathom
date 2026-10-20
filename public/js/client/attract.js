// The title screen's background: the empty apartment at dusk, the camera
// drifting slowly past the windows while the city lights come on.

import * as THREE from 'three';

const SHOTS = [
  { from: [3.4, 1.5, 4.6], to: [2.6, 1.45, 5.6], look: [-6, 1.0, 9], dur: 22 },
  { from: [1.2, 1.6, 3.4], to: [1.9, 1.55, 4.4], look: [-8, 0.6, 2], dur: 20 },
  { from: [3.9, 1.3, 7.6], to: [2.9, 1.35, 7.9], look: [-2, 1.4, 14], dur: 20 },
];

export class Attract {
  constructor(world) {
    this.world = world;
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.05, 150);
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
    W.setHour(20.25);
    W.setPower(1, 1);
    W.update(dt, performance.now() / 1000, {});
  }

  // fades in and out at the cuts
  get fade() {
    const s = SHOTS[this.i];
    return Math.max(0, 1 - this.t / 1.2, 1 - (s.dur - this.t) / 1.2);
  }
}
