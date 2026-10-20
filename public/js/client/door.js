// Our front door, 50C: a solid wood door with a lever handle, a deadbolt
// thumb-turn, a security chain and a peephole. It rattles when someone
// knocks, shudders when they bang, and the chain pulls taut when the door
// is opened against it.

import * as THREE from 'three';
import * as TX from './textures.js';
import { mat, block, cyl, ball } from './props.js';
import { DOOR, doorPoint } from '../shared/layout.js';

const LINKS = 13;
const CHAIN_LEN = 0.17;
const ANCHOR = new THREE.Vector3(1.075, 1.44, 0.03);   // chain plate on the casing
const UP = new THREE.Vector3(0, 1, 0);

export class FrontDoor {
  constructor(scene) {
    this.angle = 0;          // shown, radians
    this.target = 0;
    this.bolt = true;
    this.chain = true;
    this.boltTurn = 0;
    this.jolt = 0;
    this.joltT = 0;

    const pivot = (this.pivot = new THREE.Group());
    pivot.position.set(DOOR.hinge.x, 0, DOOR.hinge.z);
    scene.add(pivot);
    const wood = mat(0xffffff, { map: TX.wood('#4a2c1c', 'doorWood'), rough: 0.45 });
    const brass = mat(0xc9a35a, { rough: 0.22, metal: 1 });
    const steel = mat(0xb8b8b4, { rough: 0.3, metal: 0.9 });
    const W = DOOR.w, H = DOOR.h, T = DOOR.t;
    // the slab, with raised panels on both faces
    block(pivot, wood, -W / 2, H / 2, -T / 2, W - 0.006, H, T, 0.006);
    for (const zf of [0.004, -T - 0.004]) {
      for (const [y, h] of [[0.55, 0.75], [1.55, 0.85]]) {
        block(pivot, wood, -W / 2, y, zf, W - 0.24, h, 0.01, 0.004);
      }
    }
    // inside: lever, deadbolt thumb-turn, chain track, peephole ring
    const P = DOOR.parts;
    const lever = (z, s) => {
      const g = new THREE.Group();
      g.position.set(P.handle.x, P.handle.y, z);
      pivot.add(g);
      cyl(g, brass, 0, 0, 0, 0.028, 0.012).rotation.x = Math.PI / 2;
      const arm = block(g, brass, 0.06, 0, s * 0.03, 0.13, 0.018, 0.018, 0.008);
      arm.castShadow = true;
      block(g, brass, 0, 0, s * 0.015, 0.02, 0.02, 0.03, 0.006);
      return g;
    };
    this.leverIn = lever(0.004, 1);
    this.leverOut = lever(-T - 0.004, -1);
    block(pivot, brass, P.bolt.x, P.bolt.y, 0.006, 0.06, 0.1, 0.008, 0.004);
    this.thumb = new THREE.Group();
    this.thumb.position.set(P.bolt.x, P.bolt.y, 0.016);
    pivot.add(this.thumb);
    block(this.thumb, brass, 0, 0, 0.008, 0.016, 0.055, 0.016, 0.006);
    block(pivot, brass, P.bolt.x, P.bolt.y, -T - 0.006, 0.065, 0.065, 0.008, 0.03); // key cylinder outside
    block(pivot, steel, P.chain.x, P.chain.y, 0.006, 0.12, 0.03, 0.01, 0.004);
    const peepIn = cyl(pivot, brass, P.peephole.x, P.peephole.y, 0.004, 0.016, 0.012);
    peepIn.rotation.x = Math.PI / 2;
    const lensIn = new THREE.Mesh(new THREE.CircleGeometry(0.008, 16), mat(0x0a0a0c, { rough: 0.05, metal: 0.5 }));
    lensIn.position.set(P.peephole.x, P.peephole.y, 0.0105);
    pivot.add(lensIn);
    // outside: brass number, peephole lens, kick plate
    const peepOut = cyl(pivot, brass, P.peephole.x, P.peephole.y, -T - 0.004, 0.012, 0.012);
    peepOut.rotation.x = Math.PI / 2;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.07), new THREE.MeshStandardMaterial({ map: TX.sign('50C', { w: 256, h: 112, bg: '#c9a35a', fg: '#2a1a0a', font: 'bold 84px Georgia, serif' }), roughness: 0.3, metalness: 0.8 }));
    plate.position.set(P.peephole.x, 1.68, -T - 0.007);
    plate.rotation.y = Math.PI;
    pivot.add(plate);
    block(pivot, brass, -W / 2, 0.12, -T - 0.004, W - 0.1, 0.2, 0.004, 0.002);
    pivot.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    // the chain: links between the plate on the casing and the door track
    block(scene, steel, ANCHOR.x, ANCHOR.y, ANCHOR.z - 0.012, 0.03, 0.06, 0.012, 0.004);
    const link = new THREE.TorusGeometry(0.0062, 0.0019, 6, 10);
    link.scale(1, 1.6, 1);
    this.links = new THREE.InstancedMesh(link, steel, LINKS);
    this.links.castShadow = true;
    this.links.frustumCulled = false;
    scene.add(this.links);
    this.knob = ball(scene, steel, 0, 0, 0, 0.011, 0.011, 0.011);
    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpV = new THREE.Vector3();
    this.tmpS = new THREE.Vector3(1, 1, 1);
    this.tmpD = new THREE.Vector3();
    this.tmpP = new THREE.Vector3();
    this.twist = [new THREE.Quaternion(), new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2)];

    // what you see through the peephole: a very wide lens on the outside
    this.peepCam = new THREE.PerspectiveCamera(118, 1, 0.03, 80);
    this.peepCam.rotation.order = 'YXZ';
    this.updateChain();
  }

  // shake the door: 1 for knocking, 2 for banging, 3 for forcing the lock
  hit(strength = 1) {
    this.jolt = Math.max(this.jolt, strength);
    this.joltT = 0.12 + strength * 0.08;
  }

  set(st) {
    this.bolt = st.bolt;
    this.chain = st.chain;
    this.target = st.angle;
  }

  // world position of a part on the inside face
  part(name, out = new THREE.Vector3()) {
    const p = doorPoint(DOOR.parts[name], this.angle + this.jitter(), {});
    return out.set(p.x, p.y, p.z);
  }

  jitter() { return this.joltT > 0 ? Math.sin(performance.now() * 0.09) * 0.004 * this.jolt : 0; }

  update(dt) {
    // swing towards where the host says the door is
    const k = 1 - Math.exp(-dt * 10);
    this.angle += (this.target - this.angle) * k;
    if (this.joltT > 0) { this.joltT -= dt; if (this.joltT <= 0) this.jolt = 0; }
    this.pivot.rotation.y = this.angle + this.jitter();
    this.boltTurn += ((this.bolt ? Math.PI / 2 : 0) - this.boltTurn) * (1 - Math.exp(-dt * 14));
    this.thumb.rotation.z = this.boltTurn;
    const lev = this.target > this.angle + 0.02 || this.target < this.angle - 0.02 ? -0.5 : 0;
    this.leverIn.rotation.z += (lev - this.leverIn.rotation.z) * k;
    this.leverOut.rotation.z = -this.leverIn.rotation.z;
    this.updateChain();
    // peephole lens on the outside face, looking out into the corridor
    const P = DOOR.parts.peephole;
    const out = doorPoint({ x: P.x, y: P.y, z: -DOOR.t - 0.02 }, this.angle, {});
    this.peepCam.position.set(out.x, out.y, out.z);
  }

  updateChain() {
    const T = this.chain ? this.part('chain', this.tmpV).setZ(this.tmpV.z + 0.012) : null;
    const A = ANCHOR;
    for (let i = 0; i < LINKS; i++) {
      const t = i / (LINKS - 1);
      let x, y, z;
      if (T) {
        // hang between the plate and the track, sagging when slack
        const span = A.distanceTo(T);
        const sag = Math.sqrt(Math.max(0, CHAIN_LEN * CHAIN_LEN - span * span)) * 0.5;
        x = A.x + (T.x - A.x) * t;
        z = A.z + (T.z - A.z) * t;
        y = A.y + (T.y - A.y) * t - Math.sin(t * Math.PI) * sag;
      } else {
        x = A.x; z = A.z + 0.004; y = A.y - t * CHAIN_LEN;
      }
      // each link lies along the chain, every other one turned a quarter
      const dir = T ? this.tmpD.set(T.x - A.x, (T.y - A.y) - Math.cos(t * Math.PI) * 0.02, T.z - A.z).normalize() : this.tmpD.set(0, -1, 0);
      this.tmpQ.setFromUnitVectors(UP, dir).multiply(this.twist[i % 2]);
      this.tmpM.compose(this.tmpP.set(x, y, z), this.tmpQ, this.tmpS);
      this.links.setMatrixAt(i, this.tmpM);
      if (i === LINKS - 1) this.knob.position.set(x, y - (T ? 0 : 0.012), z);
    }
    this.links.instanceMatrix.needsUpdate = true;
  }
}
