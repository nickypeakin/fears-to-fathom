// The far distance (sky, ridges, the valley floor) is drawn into a cube
// map around the camera, which is then laid behind the near scene as its
// background. Turning your head only changes which part of the cube you
// see, so the cube can be repainted a face at a time, every few frames,
// with the faces in view first. Each face is painted from wherever the
// camera is at that moment, so walking about (or climbing the tower) keeps
// the distance in its place.

import * as THREE from 'three';

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
const _axes = Array.from({ length: 6 }, () => new THREE.Vector3());

// one cube, shared by whatever scene is on screen
const cube = { size: 768, every: 2, target: null, cam: null, owner: null };

export class Backdrop {
  // size: pixels along each face; every: repaint one face every this many frames
  static configure({ size, every }) {
    cube.size = size;
    cube.every = every;
  }

  constructor(scene) {
    this.scene = scene;
    this.age = new Float32Array(6).fill(Infinity);
    this.from = Array.from({ length: 6 }, () => new THREE.Vector3(1e9, 0, 0));
    this.frame = 0;
  }

  // repaint everything on the next frame (a camera cut, a jump in time)
  invalidate() { this.age.fill(Infinity); }

  face(renderer, i) {
    renderer.setRenderTarget(cube.target, i);
    renderer.render(this.scene, cube.cam.children[i]);
    this.age[i] = 0;
    this.from[i].copy(cube.cam.position);
  }

  // which faces the camera can see: sample directions across its view and
  // note which face each one lands on
  seen(camera) {
    const tv = Math.tan((camera.fov * Math.PI) / 360), th = tv * camera.aspect;
    camera.getWorldQuaternion(_q);
    cube.cam.children.forEach((c, i) => c.getWorldDirection(_axes[i]));
    let mask = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      _d.set(a * th, b * tv, -1).applyQuaternion(_q);
      let f = 0;
      for (let i = 1; i < 6; i++) if (_d.dot(_axes[i]) > _d.dot(_axes[f])) f = i;
      mask |= 1 << f;
    }
    return mask;
  }

  // brings the cube up to date for `camera` and returns it as a texture
  render(renderer, camera) {
    if (!cube.target) {
      cube.target = new THREE.WebGLCubeRenderTarget(cube.size, { type: THREE.HalfFloatType, generateMipmaps: false });
      cube.cam = new THREE.CubeCamera(4, 9000, cube.target);
    }
    if (cube.target.width !== cube.size) cube.target.setSize(cube.size, cube.size);
    if (cube.owner !== this || cube.target.width !== this.painted) {
      cube.owner = this;
      this.painted = cube.target.width;
      this.invalidate();
    }
    const cc = cube.cam;
    if (cc.coordinateSystem !== renderer.coordinateSystem) {
      cc.coordinateSystem = renderer.coordinateSystem;
      cc.updateCoordinateSystem();
    }
    camera.getWorldPosition(_v);
    cc.position.copy(_v);
    cc.updateMatrixWorld(true);
    const keep = renderer.getRenderTarget();
    for (let i = 0; i < 6; i++) {
      // a face painted from far away (a cut to another part of the floor) is wrong
      if (this.from[i].distanceToSquared(_v) > 9) this.age[i] = Infinity;
      if (this.age[i] === Infinity) this.face(renderer, i);
    }
    if (++this.frame % cube.every === 0) {
      const seen = this.seen(camera);
      let best = 0, score = -1;
      for (let i = 0; i < 6; i++) {
        // stale faces first, faces in view far more urgently, and faces
        // painted from somewhere else in the room before those
        const s = (this.age[i] + 30 * this.from[i].distanceTo(_v)) * (seen & (1 << i) ? 6 : 1);
        if (s > score) { score = s; best = i; }
      }
      this.face(renderer, best);
    }
    for (let i = 0; i < 6; i++) this.age[i]++;
    renderer.setRenderTarget(keep);
    return cube.target.texture;
  }
}
