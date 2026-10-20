// The opening, and the drive out at the end. Nobody has control.
//
// Opening: early evening in June. The camera comes in low over the forest
// towards the peak; your pickup grinds up the last of the dirt road and
// pulls in under the tower; Ranger Pruitt is waiting by his truck. He says
// his piece, hands over the place and drives off, and you're on your own.
//
// The drive out: the engine catches, you bounce down the road in the first
// grey light, and somebody is standing in the road at the bend.
//
// Every client plays the same script from the same start message, so
// everyone sees the same thing at the same time.

import * as THREE from 'three';
import { INTRO_LEN } from '../shared/config.js';
import { ROAD, PLACES, START_SPOTS } from '../shared/layout.js';
import { NARRATION, RANGER } from '../shared/story.js';
import { terrainH } from '../shared/terrain.js';
import { makePerson } from './humans.js';
import { sound } from './audio.js';
import { voice } from './voice.js';
import { lerp, span } from './util.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const road = new THREE.CatmullRomCurve3(ROAD.map(([x, z]) => v3(x, 0, z)));

// where along the road (0 at the tower end) is closest to (x, z)
function along(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i <= 400; i++) {
    const p = road.getPointAt(i / 400);
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) { bd = d; best = i / 400; }
  }
  return best;
}

// a vehicle at road position u (0..1), heading `dir` (+1 away from the tower)
function onRoad(obj, u, dir, side = 0) {
  u = Math.max(0, Math.min(1, u));
  const p = road.getPointAt(u), t = road.getTangentAt(u).multiplyScalar(dir);
  const nx = -t.z, nz = t.x;
  const x = p.x + nx * side, z = p.z + nz * side;
  obj.position.set(x, terrainH(x, z) + 0.02, z);
  obj.rotation.set(0, Math.atan2(t.x, t.z), 0);
  return obj.position;
}

const mix = (a, b, k) => v3(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));

export class Cutscene {
  constructor(game, kind = 'intro') {
    this.g = game;
    this.kind = kind;
    this.t = 0;
    this.done = false;
    this.fired = new Set();
    this.cast = game.roster.map((r) => game.avatars.get(r.id));
    this.lookAt = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.solo = this.cast.length === 1;
    for (const a of this.cast) { a.scripted = true; a.label.visible = false; a.root.visible = false; a.pose = { pose: 'stand' }; }
    const W = game.world;
    if (kind === 'intro') {
      this.ranger = makePerson('ranger');
      W.scene.add(this.ranger);
      this.ranger.position.set(PLACES.rangerTruck.x - 1.6, 0, PLACES.rangerTruck.z - 1.5);
      W.rangerTruck.group.visible = true;
      W.rangerTruck.group.position.set(PLACES.rangerTruck.x, 0, PLACES.rangerTruck.z);
      W.rangerTruck.group.rotation.y = PLACES.rangerTruck.ry;
      this.uPark = along(PLACES.truck.x, PLACES.truck.z + 4);
      this.uRanger = along(PLACES.rangerTruck.x, PLACES.rangerTruck.z);
    } else {
      this.wade = makePerson('wade');
      W.scene.add(this.wade);
      const p = road.getPointAt(0.18);
      this.wade.position.set(p.x, terrainH(p.x, p.z), p.z);
      this.wadeU = 0.18;
      sound.engine(true);
      sound.setScene('truck', 1);
      W.truck.lamp.emissiveIntensity = 4;
    }
  }

  cue(name, at, fn) {
    if (this.t >= at && !this.fired.has(name)) {
      this.fired.add(name);
      fn();
    }
  }

  // narration and dialogue on cue
  line(name, at, who, text, voiceKind, kind = '') {
    this.cue(name, at, () => {
      this.g.hud.say(who, text, kind);
      voice.say(text, voiceKind);
    });
  }

  we(text) {
    return text.replace(/\{We\}/g, this.solo ? 'I' : 'We').replace(/\{we\}/g, this.solo ? 'I' : 'we').replace(/\{us\}/g, this.solo ? 'me' : 'us').replace(/\{as\}/g, this.solo ? 'as a volunteer fire lookout' : 'as volunteer fire lookouts');
  }

  update(dt) {
    this.t += dt;
    if (this.kind === 'intro') this.intro(dt);
    else this.escape(dt);
    return this.pos;
  }

  intro(dt) {
    const t = this.t, W = this.g.world, truck = W.truck.group;
    W.setHour(18.85 + (t / INTRO_LEN) * 0.25);
    const N = NARRATION.intro.map((l) => this.we(l));
    this.line('n0', 1.5, '', N[0], 'narrator', 'narrate');
    this.line('n1', 7.5, '', N[1], 'narrator', 'narrate');
    this.line('n2', 15, '', N[2], 'narrator', 'narrate');
    this.line('n3', 22, '', N[3], 'narrator', 'narrate');
    this.cue('scene', 0, () => sound.setScene('outside', 2));

    // our pickup grinding up the road, then pulling in under the tower
    const uStart = 0.42;
    const k = span(t, 10, 26);
    const u = lerp(uStart, this.uPark, k);
    if (t < 26) onRoad(truck, u, -1);
    else {
      const p = span(t, 26, 29);
      const from = road.getPointAt(this.uPark);
      truck.position.set(lerp(from.x, PLACES.truck.x, p), 0.02, lerp(from.z, PLACES.truck.z, p));
      truck.rotation.set(0, lerp(truck.rotation.y, PLACES.truck.ry, Math.min(1, dt * 3)), 0);
    }
    this.cue('engine', 10, () => sound.engine(true));
    this.cue('stop', 28.5, () => { sound.engine(false); sound.shut(0.8, { x: PLACES.truck.x, y: 1, z: PLACES.truck.z }); });

    // everyone climbs out
    this.cue('out', 29.5, () => {
      this.cast.forEach((a, i) => {
        const s = START_SPOTS[i % 4];
        a.place(s.x, 0, s.z, s.ry);
        a.root.visible = true;
      });
    });

    // the ranger: waiting, talking, leaving
    const R = this.ranger, rp = PLACES.rangerTruck;
    const talkAt = v3(rp.x + 0.6, 0, rp.z - 4.2);
    if (t > 30 && t < 46) {
      const k2 = span(t, 30, 33);
      R.position.set(lerp(rp.x - 1.6, talkAt.x, k2), 0, lerp(rp.z - 1.5, talkAt.z, k2));
      R.rotation.y = Math.atan2(START_SPOTS[0].x - R.position.x, START_SPOTS[0].z - R.position.z);
      R.userData.rig.update(dt, { pose: 'walk', speed: k2 < 1 ? 1.3 : 0, lookYaw: 0, lookPitch: 0 });
    } else if (t >= 46) {
      const k3 = span(t, 46, 48.5);
      R.position.set(lerp(talkAt.x, rp.x - 1.1, k3), 0, lerp(talkAt.z, rp.z, k3));
      R.rotation.y = Math.PI * 0.85;
      R.userData.rig.update(dt, { pose: 'walk', speed: k3 < 1 ? 1.3 : 0 });
      if (t > 48.5) R.visible = false;
    } else R.userData.rig.update(dt, { pose: 'stand', speed: 0 });
    RANGER.forEach((ln, i) => this.line(`r${i}`, 31 + i * 3.1, 'Ranger Pruitt', ln, 'ranger'));
    // he drives away down the road
    if (t > 48.5) {
      this.cue('rEngine', 48.5, () => sound.engine(true));
      onRoad(W.rangerTruck.group, this.uRanger + span(t, 48.5, INTRO_LEN + 4) * 0.4, 1);
    }

    // the camera (it jumps at each cut, then eases)
    const shot = t < 10 ? 0 : t < 26 ? 1 : t < 30 ? 2 : t < 46 ? 3 : 4;
    const cut = shot !== this.shot;
    this.shot = shot;
    const ease = (want, look, rate = 2) => {
      if (cut) { this.pos.copy(want); this.lookAt.copy(look); return; }
      this.pos.lerp(want, 1 - Math.exp(-dt * rate));
      this.lookAt.lerp(look, 1 - Math.exp(-dt * rate * 1.5));
    };
    if (shot === 0) {
      // in over the forest towards the peak
      const k4 = span(t, 0, 10);
      this.pos.copy(mix(v3(-150, 95, 190), v3(-70, 58, 92), k4));
      this.lookAt.set(0, 10 - k4 * 3, 0);
    } else if (shot === 1) {
      // behind the pickup on the road
      const tp = truck.position;
      const back = v3(Math.sin(truck.rotation.y), 0, Math.cos(truck.rotation.y));
      ease(v3(tp.x - back.x * 9 + 3, tp.y + 4.2, tp.z - back.z * 9), v3(tp.x + back.x * 6, tp.y + 1.8 + span(t, 18, 26) * 6, tp.z + back.z * 6), 3);
    } else if (shot === 2) {
      // the tower over the cab roof
      ease(v3(13.5, 1.9, 19), v3(2, 9, -1));
    } else if (shot === 3) {
      // over the group's shoulders at the ranger, the tower behind him
      ease(v3(9.6, 1.75, 2.2), v3(R.position.x, 1.5, R.position.z));
    } else {
      // looking up at the tower as the ranger's engine fades away
      const k5 = span(t, 46, INTRO_LEN);
      this.pos.copy(mix(v3(5.5, 1.6, 6.5), v3(3.2, 1.4, 4.4), k5));
      this.lookAt.copy(mix(v3(0, 6, 0), v3(0, 14.5, 0), k5));
      this.g.fadeTo = span(t, INTRO_LEN - 1.5, INTRO_LEN) * 0.9;
    }
  }

  escape(dt) {
    const t = this.t, W = this.g.world, truck = W.truck.group;
    // turned round and away down the road
    const u = span(t, 2.5, 15) * 0.5;
    const swerve = Math.exp(-Math.pow((u - this.wadeU) / 0.02, 2)) * 1.7;
    const tp = onRoad(truck, u, 1, swerve);
    this.cue('go', 2.5, () => sound.engine(true));
    W.headlights.intensity = 30;
    const fwd = v3(Math.sin(truck.rotation.y), 0, Math.cos(truck.rotation.y));
    W.headlights.position.set(tp.x + fwd.x * 2.6, tp.y + 1.0, tp.z + fwd.z * 2.6);
    W.headlights.target.position.set(tp.x + fwd.x * 14, tp.y, tp.z + fwd.z * 14);
    // him, at the bend, turning to watch you go by
    const wd = this.wade;
    const dx = tp.x - wd.position.x, dz = tp.z - wd.position.z;
    wd.rotation.y = Math.atan2(dx, dz);
    wd.userData.rig.update(dt, { pose: 'stand', speed: 0, lookYaw: 0, lookPitch: 0 });
    this.cue('see', 6.2, () => { sound.stinger(0.9); this.g.hud.say('', 'Somebody\'s standing in the road.', 'narrate'); });
    this.cue('pass', 8.3, () => { sound.bang({ x: tp.x, y: 1.2, z: tp.z }); this.g.fear = 1; });
    // the camera: in the cab, then watching the truck go
    if (t < 11.5) {
      this.pos.set(tp.x + fwd.x * 0.2 - fwd.z * 0.35, tp.y + 1.62, tp.z + fwd.z * 0.2 + fwd.x * 0.35);
      const near = Math.hypot(dx, dz) < 9 && t > 7.6;
      this.lookAt.lerp(near ? v3(wd.position.x, wd.position.y + 1.6, wd.position.z) : v3(tp.x + fwd.x * 20, tp.y + 0.8, tp.z + fwd.z * 20), 1 - Math.exp(-dt * (near ? 8 : 4)));
    } else {
      this.pos.lerp(v3(wd.position.x - 2, wd.position.y + 1.7, wd.position.z - 3), 1 - Math.exp(-dt * 2));
      this.lookAt.lerp(v3(tp.x, tp.y + 1, tp.z), 1 - Math.exp(-dt * 3));
      this.g.fadeTo = span(t, 13.5, 16.5);
      this.g.fx.fadeColor = 0xf2ece0;
    }
  }

  finish() {
    if (this.done) return;
    this.done = true;
    for (const a of this.cast) { a.scripted = false; a.label.visible = true; a.snapNext = true; }
    const W = this.g.world;
    if (this.ranger) { this.ranger.removeFromParent(); W.rangerTruck.group.visible = false; }
    if (this.wade) this.wade.removeFromParent();
    W.truck.group.position.set(PLACES.truck.x, 0, PLACES.truck.z);
    W.truck.group.rotation.set(0, PLACES.truck.ry, 0);
    W.truck.lamp.emissiveIntensity = 0;
    W.headlights.intensity = 0;
    sound.engine(false);
  }
}

