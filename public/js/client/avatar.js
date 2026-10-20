// People as this client sees them: your friends, and Wade (plus the ranger
// and the deputy in the cutscenes). A model, a quiet name tag for friends,
// whatever they're carrying, and smoothing between the host's snapshots.
// The cutscenes drive them directly while `scripted` is set.

import * as THREE from 'three';
import { makePerson, FRIEND_LOOKS } from './humans.js';
import * as TX from './textures.js';
import { item } from './models.js';
import { lerp, angleLerp } from './util.js';
import { BEDS } from '../shared/layout.js';

const _lie = new THREE.Euler(), _yaw = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);

// what's in someone's hands, held out in front of them
function holding(root, kind, state) {
  const g = item(kind, state);
  const heavy = kind === 'box' || kind === 'jug' || kind === 'fuel';
  g.position.set(0, heavy ? 0.95 : 1.05, heavy ? 0.34 : 0.3);
  if (kind === 'fuel') g.rotation.y = Math.PI / 2;
  root.add(g);
  return g;
}

export class Avatar {
  constructor(r, game, isMe) {
    this.game = game;
    this.id = r.id;
    this.name = r.name;
    this.color = r.color;
    this.isMe = isMe;
    this.root = makePerson(FRIEND_LOOKS[r.color % 4]);
    this.rig = this.root.userData.rig;
    this.height = this.root.scale.y * 1.75;
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TX.sign(r.name, { w: 256, h: 64, bg: 'rgba(8,8,8,0.35)', fg: '#efe6d8', font: '600 40px Inter, sans-serif' }),
      transparent: true, depthWrite: false, opacity: 0.7,
    }));
    this.label.scale.set(0.5, 0.125, 1);
    this.label.position.y = 2.05;
    this.root.add(this.label);
    this.x = this.y = this.z = this.tx = this.ty = this.tz = 0;
    this.ry = this.tr = this.rx = 0;
    this.flags = 0;
    this.bed = -1;
    this.carry = '';
    this.held = null;
    this.speed = 0;
    this.scripted = false;
    this.snapNext = true;
    game.world.scene.add(this.root);
  }

  get taken() { return (this.flags & 1) !== 0; }
  get flash() { return (this.flags & 2) !== 0; }
  get crouch() { return (this.flags & 4) !== 0; }
  get zoom() { return (this.flags & 8) !== 0; }
  get inTruck() { return (this.flags & 16) !== 0; }
  get alive() { return !this.taken; }

  // one row of a host snapshot: [id, x, y, z, ry, rx, flags, carry, bed]
  apply(row) {
    [, this.tx, this.ty, this.tz, this.tr, this.rx, this.flags, this.carry, this.bed] = row;
  }

  // put them somewhere without smoothing
  place(x, y, z, ry) {
    this.x = this.tx = x;
    this.y = this.ty = y;
    this.z = this.tz = z;
    this.ry = this.tr = ry;
    this.snapNext = false;
    this.root.position.set(x, y, z);
    this.root.rotation.set(0, ry + Math.PI, 0);
  }

  setHeld(kind, state = 1) {
    if (this.heldKind === kind && this.heldState === state) return;
    if (this.held) this.held.removeFromParent();
    this.held = kind ? holding(this.root, kind, state) : null;
    this.heldKind = kind;
    this.heldState = state;
  }

  update(dt) {
    if (this.scripted) { this.rig.update(dt, this.pose || { pose: 'stand' }); return; }
    if (this.snapNext) {
      this.x = this.tx; this.y = this.ty; this.z = this.tz; this.ry = this.tr;
      this.snapNext = false;
    }
    const k = 1 - Math.exp(-dt * 12);
    const px = this.x, pz = this.z;
    this.x = lerp(this.x, this.tx, k);
    this.y = lerp(this.y, this.ty, k);
    this.z = lerp(this.z, this.tz, k);
    this.ry = angleLerp(this.ry, this.tr, k);
    this.speed = lerp(this.speed, Math.hypot(this.x - px, this.z - pz) / Math.max(dt, 1e-3), 0.2);
    const bed = this.bed >= 0 ? BEDS[this.bed] : null;
    this.root.visible = this.alive && !this.inTruck && !this.isMe && this.game.viewing !== this;
    this.label.visible = !bed;
    if (bed) {
      // lying on their back, head towards the bed's head end
      const dx = -Math.sin(bed.yaw), dz = -Math.cos(bed.yaw), half = this.height / 2 - 0.08;
      this.root.position.set(bed.x - dx * half, bed.y + 0.08, bed.z - dz * half);
      this.root.quaternion.setFromEuler(_lie.set(-Math.PI / 2, 0, 0)).premultiply(_yaw.setFromAxisAngle(_up, bed.yaw));
    } else {
      this.root.position.set(this.x, this.y, this.z);
      this.root.rotation.set(0, this.ry + Math.PI, 0);
    }
    const it = this.game.heldState(this.id);
    this.setHeld(this.carry || null, it);
    if (!this.root.visible) return;
    const pose = bed ? 'stand' : this.carry === 'box' || this.carry === 'jug' || this.carry === 'fuel' || this.zoom ? 'hold' : this.crouch ? 'crouch' : 'walk';
    this.rig.update(dt, { pose, speed: bed ? 0 : this.speed, lookYaw: 0, lookPitch: this.zoom ? -0.1 : bed ? 0 : this.rx, eyesClosed: !!bed && this.game.mode !== 'play' });
  }

  dispose() {
    this.root.removeFromParent();
  }
}

// Wade (and anyone else the story moves about): [x, y, z, ry, anim]
export class Actor {
  constructor(look, game) {
    this.game = game;
    this.look = look;
    this.root = makePerson(look);
    this.rig = this.root.userData.rig;
    this.x = this.y = this.z = this.tx = this.ty = this.tz = 0;
    this.ry = this.tr = 0;
    this.anim = 'stand';
    this.speed = 0;
    this.fresh = true;
    this.stepAcc = 0;
    game.world.scene.add(this.root);
  }

  apply(row) {
    [this.tx, this.ty, this.tz, this.tr, this.anim] = row;
    if (this.fresh) { this.x = this.tx; this.y = this.ty; this.z = this.tz; this.ry = this.tr; this.fresh = false; }
  }

  update(dt, t, lookAt = null) {
    const k = 1 - Math.exp(-dt * 10);
    const px = this.x, pz = this.z, py = this.y;
    this.x = lerp(this.x, this.tx, k);
    this.y = lerp(this.y, this.ty, k);
    this.z = lerp(this.z, this.tz, k);
    this.ry = angleLerp(this.ry, this.tr, k);
    this.moved = Math.hypot(this.x - px, this.z - pz, this.y - py);
    this.speed = lerp(this.speed, Math.hypot(this.x - px, this.z - pz) / Math.max(dt, 1e-3), 0.2);
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.ry + Math.PI;
    // he looks at you when you're near
    let lookYaw = null, lookPitch = 0;
    if (lookAt) {
      const dx = lookAt.x - this.x, dz = lookAt.z - this.z, d = Math.hypot(dx, dz);
      if (d < 12) {
        lookYaw = Math.atan2(-dx, -dz) - this.ry;
        while (lookYaw > Math.PI) lookYaw -= Math.PI * 2;
        while (lookYaw < -Math.PI) lookYaw += Math.PI * 2;
        lookYaw = Math.max(-1.1, Math.min(1.1, lookYaw));
        lookPitch = Math.atan2(lookAt.y - (this.y + 1.7), Math.max(0.3, d));
      }
    }
    const pose = this.anim === 'reach' ? 'reach' : this.anim === 'stand' ? 'stand' : 'walk';
    this.rig.update(dt, { pose, speed: this.speed, lookYaw, lookPitch, stiff: this.look === 'wade' && pose !== 'walk', stride: this.anim === 'run' ? 1.2 : 0.95 });
  }

  dispose() {
    this.root.removeFromParent();
  }
}

// The things lying about (anything somebody's carrying is drawn in their hands).
export class ItemsView {
  constructor(scene) {
    this.scene = scene;
    this.meshes = new Map();
  }

  // rows: [id, kind, x, y, z, holder, state]
  apply(rows) {
    const seen = new Set();
    for (const [id, kind, x, y, z, holder, state] of rows) {
      seen.add(id);
      let e = this.meshes.get(id);
      if (!e || e.state !== state) {
        if (e) e.mesh.removeFromParent();
        e = { mesh: item(kind, state), state, kind };
        this.scene.add(e.mesh);
        this.meshes.set(id, e);
      }
      e.mesh.visible = !holder;
      e.holder = holder;
      e.mesh.position.set(x, y, z);
      if (kind === 'keys') e.mesh.rotation.x = 0;
    }
    for (const [id, e] of this.meshes) if (!seen.has(id)) { e.mesh.removeFromParent(); this.meshes.delete(id); }
  }

  dispose() {
    for (const e of this.meshes.values()) e.mesh.removeFromParent();
    this.meshes.clear();
  }
}
