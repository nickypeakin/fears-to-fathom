// People as this client sees them: your friends (players and bots) and
// everyone in the corridor (him and his visitors). A model, a quiet name
// tag for friends, and smoothing between the host's snapshots. The
// cutscene drives friends directly while `scripted` is set.

import * as THREE from 'three';
import { makePerson, FRIEND_LOOKS } from './humans.js';
import * as TX from './textures.js';
import { lerp, angleLerp } from './util.js';
import { DOOR, doorPoint } from '../shared/layout.js';

const PEEP = doorPoint({ ...DOOR.parts.peephole, z: -DOOR.t }, 0);
PEEP.y = DOOR.parts.peephole.y;

export class Avatar {
  constructor(r, game, isMe) {
    this.game = game;
    this.id = r.id;
    this.name = r.name;
    this.bot = r.bot;
    this.color = r.color;
    this.isMe = isMe;
    this.root = makePerson(FRIEND_LOOKS[r.color % 4]);
    this.rig = this.root.userData.rig;
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TX.sign(r.name, { w: 256, h: 64, bg: 'rgba(8,8,8,0.35)', fg: '#efe6d8', font: '600 40px Inter, sans-serif' }),
      transparent: true, depthWrite: false, opacity: 0.7,
    }));
    this.label.scale.set(0.5, 0.125, 1);
    this.label.position.y = 2.0;
    this.root.add(this.label);
    this.x = this.z = this.tx = this.tz = 0;
    this.ry = this.tr = this.rx = 0;
    this.flags = 0;
    this.hide = -1;
    this.taken = false;
    this.speed = 0;
    this.scripted = false;
    this.snapNext = true;
  }

  get hidden() { return (this.flags & 1) !== 0; }
  get peeping() { return (this.flags & 2) !== 0; }
  get flash() { return (this.flags & 4) !== 0; }
  get alive() { return !this.taken; }

  // one row of a host snapshot: [id, x, z, ry, rx, flags, hide, mv, seat]
  apply(row) {
    this.tx = row[1];
    this.tz = row[2];
    this.tr = row[3];
    this.rx = row[4];
    this.flags = row[5];
    this.hide = row[6];
    this.taken = (row[5] & 8) !== 0;
  }

  // put them somewhere without smoothing
  place(x, z, ry) {
    this.x = this.tx = x;
    this.z = this.tz = z;
    this.ry = this.tr = ry;
    this.snapNext = false;
    this.root.position.set(x, 0, z);
    this.root.rotation.y = ry + Math.PI;
  }

  update(dt) {
    if (this.scripted) return;
    if (this.snapNext) {
      this.x = this.tx; this.z = this.tz; this.ry = this.tr;
      this.snapNext = false;
    }
    const k = 1 - Math.exp(-dt * 12);
    const px = this.x, pz = this.z;
    this.x = lerp(this.x, this.tx, k);
    this.z = lerp(this.z, this.tz, k);
    this.ry = angleLerp(this.ry, this.tr, k);
    this.speed = lerp(this.speed, Math.hypot(this.x - px, this.z - pz) / Math.max(dt, 1e-3), 0.2);
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.ry + Math.PI;
    this.root.visible = this.alive && !this.hidden && !this.isMe && this.game.viewing !== this;
    if (!this.root.visible) return;
    const f = this.flags;
    const pose = f & 16 ? 'sit' : f & 32 ? 'crouch' : this.peeping ? 'peep' : 'walk';
    this.rig.update(dt, { pose, speed: this.speed, lookYaw: this.bot ? null : 0, lookPitch: this.bot ? 0 : this.rx, panic: this.game.power < 0.5 });
  }
}

// Him, and whoever comes knocking.
// row: [id, look, x, z, ry, anim, possessed, tilt, knocking, self, color, hunting]
export class Actor {
  constructor(row, game) {
    this.game = game;
    this.id = row[0];
    this.look = row[1];
    this.color = row[10];
    const look = this.look === 'friend' ? FRIEND_LOOKS[Math.max(0, this.color) % 4] : this.look;
    this.root = makePerson(look);
    this.rig = this.root.userData.rig;
    this.x = this.tx = row[2];
    this.z = this.tz = row[3];
    this.ry = this.tr = row[4];
    this.speed = 0;
    this.knocking = 0;
    this.eyeH = 1.62 * this.root.scale.y;
    this.apply(row);
    game.world.scene.add(this.root);
  }

  get him() { return this.look === 'stalker'; }

  apply(row) {
    this.tx = row[2];
    this.tz = row[3];
    this.tr = row[4];
    this.anim = row[5];
    this.possessed = !!row[6];
    this.tilt = row[7];
    if (row[8] && !this.knocking) this.rig.knock();
    this.knocking = row[8];
    this.hunting = !!row[11];
  }

  update(dt, t) {
    const k = 1 - Math.exp(-dt * 10);
    const px = this.x, pz = this.z;
    this.x = lerp(this.x, this.tx, k);
    this.z = lerp(this.z, this.tz, k);
    this.ry = angleLerp(this.ry, this.tr, k);
    this.speed = lerp(this.speed, Math.hypot(this.x - px, this.z - pz) / Math.max(dt, 1e-3), 0.2);
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.ry + Math.PI;
    // at the door they look at the peephole; he never looks anywhere else
    let lookYaw = null, lookPitch = 0;
    const atDoor = Math.hypot(this.x - DOOR.stand.x, this.z - DOOR.stand.z) < 0.6;
    if ((atDoor && (this.him || this.possessed)) || (atDoor && Math.sin(t * 0.7 + this.id) > 0.4)) {
      const dx = PEEP.x - this.x, dz = PEEP.z - this.z;
      lookYaw = Math.atan2(-dx, -dz) - this.ry;
      while (lookYaw > Math.PI) lookYaw -= Math.PI * 2;
      while (lookYaw < -Math.PI) lookYaw += Math.PI * 2;
      lookPitch = Math.atan2(PEEP.y - this.eyeH, Math.hypot(dx, dz));
    }
    if (this.him && !atDoor) lookYaw = this.hunting ? 0.6 * Math.sin(t * 0.8 + this.id) : 0;
    let pose = this.anim;
    if (pose === 'stand' && this.him && !this.hunting) pose = 'pockets';
    if (pose === 'walk' && this.look === 'delivery' && this.anim === 'hold') pose = 'hold';
    this.rig.update(dt, {
      pose, speed: this.speed, lookYaw, lookPitch,
      possessed: this.possessed, noBlink: this.him, tilt: this.tilt + (this.him ? 0.12 : 0), stiff: this.him || this.possessed,
      stride: this.him ? 0.85 : 1,
    });
  }

  dispose() {
    this.root.removeFromParent();
  }
}
