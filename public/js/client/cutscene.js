// The opening. Nobody has control. It's just before eight; you and your
// friends walk up to the tower from the street, cross the lobby and get in
// the elevator. A man in a long coat stops the doors closing and gets in
// with you. He's going to fifty too. On fifty he follows you down the
// corridor, closer than he should. You get inside, bolt the door, put the
// chain on, and someone looks through the peephole. He's standing right
// there. Then he knocks.
//
// Every client plays the same script from the same start message, so
// everyone sees the same thing at the same time.

import * as THREE from 'three';
import { INTRO_LEN } from '../shared/config.js';
import { DOOR } from '../shared/layout.js';
import { START_SPOTS } from '../host/match.js';
import { makePerson } from './humans.js';
import { sound } from './audio.js';
import { voice } from './voice.js';
import { lerp, span, yawTo } from './util.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// where someone walking `pts` at `speed` from `t0` is at time t
function walk(pts, speed, t0, t) {
  let d = Math.max(0, t - t0) * speed;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (d <= len) {
      const k = len ? d / len : 1;
      return { x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), ry: yawTo(b.x - a.x, b.z - a.z), speed: t > t0 ? speed : 0 };
    }
    d -= len;
  }
  const b = pts[pts.length - 1], a = pts[pts.length - 2] || b;
  return { x: b.x, z: b.z, ry: b.ry ?? yawTo(b.x - a.x, b.z - a.z), speed: 0 };
}

const BACK = Math.PI;   // heading that faces +z (towards the elevator doors from inside, towards our door from outside)

// spots in the elevator car (same coordinates in the lobby and on 50)
const CAR_SPOTS = [{ x: 8.68, z: -3.72 }, { x: 9.2, z: -3.8 }, { x: 9.72, z: -3.72 }, { x: 8.75, z: -3.2 }];
const HIM_CAR = { x: 9.72, z: -2.95 };

export class Cutscene {
  constructor(game) {
    this.g = game;
    this.t = 0;
    this.done = false;
    this.fired = new Set();
    this.cast = game.roster.map((r) => game.avatars.get(r.id));
    this.n = this.cast.length;
    this.lookAt = new THREE.Vector3();
    this.him = makePerson('stalker');
    this.him.userData.rig.state = { pose: 'stand' };
    for (const a of this.cast) { a.scripted = true; a.label.visible = false; }
    this.where = null;
    this.setScene('ground');
    this.peep = false;
  }

  // move everyone into the street scene or up to fifty
  setScene(where) {
    if (where === this.where) return;
    this.where = where;
    const s = where === 'ground' ? this.g.ground.scene : this.g.world.scene;
    for (const a of this.cast) { a.root.removeFromParent(); s.add(a.root); }
    this.him.removeFromParent();
    s.add(this.him);
    if (where === 'tower') {
      sound.setScene('lift', 0.3);
    }
  }

  cue(name, at, fn) {
    if (this.t >= at && !this.fired.has(name)) {
      this.fired.add(name);
      fn();
    }
  }

  // someone in the cast says something
  say(k, text) {
    const a = this.cast[k % this.n];
    if (!a) return;
    this.g.hud.say(a.name, text);
    voice.say(text, 'friend', { salt: a.color, sex: a.color % 2 ? 'f' : 'm' });
    a.root.userData.rig.talk(1.4);
  }

  himSay(text) {
    this.g.hud.say('The man in the coat', text);
    voice.say(text, 'him');
    this.him.userData.rig.talk(1.2);
  }

  pose(a, st, dt, extra = {}) {
    a.place(st.x, st.z, st.ry);
    a.root.userData.rig.update(dt, { pose: extra.pose || 'walk', speed: st.speed, lookYaw: extra.lookYaw ?? null, lookPitch: extra.lookPitch || 0 });
  }

  placeHim(st, dt, extra = {}) {
    this.him.position.set(st.x, extra.y || 0, st.z);
    this.him.rotation.y = st.ry + Math.PI;
    this.him.userData.rig.update(dt, { pose: extra.pose || 'walk', speed: st.speed, lookYaw: extra.lookYaw ?? 0, lookPitch: extra.lookPitch || 0, tilt: extra.tilt || 0, stiff: true, noBlink: true, stride: 0.85 });
  }

  // returns the camera position; points this.lookAt at what it sees
  update(dt) {
    const t = (this.t += dt);
    const g = this.g, fx = g.fx, G = g.ground, W = g.world;
    fx.bars = 1;
    fx.peep = false;
    let cam;

    // ------------------------------------------------------------ sound
    this.cue('street', 0, () => { sound.setScene('street', 1); sound.setTension(0.05); });
    this.cue('l1', 5.8, () => this.say(0, 'Fifty floors up. I still can\'t believe you got this place.'));
    this.cue('l2', 8.2, () => this.say(1, 'Wait till you see the view.'));
    this.cue('lobby', 10.5, () => sound.setScene('lift', 1));
    this.cue('evening', 13.2, () => { g.hud.say('Concierge', 'Evening, folks.'); voice.say('Evening, folks.', 'super'); });
    this.cue('ding0', 14.6, () => sound.ding(null));
    this.cue('liftOpen0', 15, () => sound.liftDoors(null));
    this.cue('hand', 19.05, () => { sound.burst(sound.now, 0.08, sound.sfx, 0.3, 'bandpass', 1500, 3); sound.setTension(0.25); });
    this.cue('hi', 20.9, () => this.say(2, '...Hi.'));
    this.cue('floor?', 22.4, () => this.say(3, 'What floor?'));
    this.cue('fifty', 24.0, () => this.himSay('Fifty.'));
    this.cue('same', 25.6, () => this.say(1, '...Same as us.'));
    this.cue('muzak', 23, () => sound.startMuzak());
    this.cue('flick', 28.6, () => sound.setTension(0.4));
    this.cue('ding50', 33.5, () => { sound.stopMuzak(0.4); sound.ding(null); });
    this.cue('tower', 34, () => { this.setScene('tower'); sound.setScene('apt', 2); });
    this.cue('liftOpen50', 34.2, () => sound.liftDoors(v3(9.2, 1.5, -2.4)));
    this.cue('dontlook', 35.6, () => this.say(1, 'Don\'t look back. Just walk.'));
    this.cue('follow', 37.8, () => sound.setTension(0.55));
    this.cue('keys', 39.8, () => { this.say(0, 'Keys, keys, keys...'); for (let i = 0; i < 6; i++) setTimeout(() => sound.osc('triangle', 3000 + Math.random() * 3000, sound.now, 0.1, sound.sfx, 0.03), i * 90); });
    this.cue('unlock', 41.0, () => sound.bolt(false));
    this.cue('open', 41.3, () => sound.creak(0.6));
    this.cue('slam', 43.1, () => { sound.shut(1.4); sound.setTension(0.5); });
    this.cue('bolt', 44.1, () => sound.bolt(true));
    this.cue('chain', 45.0, () => sound.chain(true));
    this.cue('who', 45.8, () => this.say(3, 'Who WAS that?'));
    this.cue('look', 47.2, () => this.say(0, 'Hang on. I\'ll look.'));
    this.cue('peepSting', 49.2, () => sound.stinger(0.7));
    for (const [i, at] of [[0, 52.2], [1, 53.4], [2, 54.6]]) this.cue(`k${i}`, at, () => { sound.thump(sound.now, sound.sfx, 1.5, 0.85); this.him.userData.rig.knock(); W.door.hit(1); });
    this.cue('title', 54.9, () => { g.hud.banner('FLOOR 50', 'Don\'t let him in.'); sound.setTension(0.6); });

    const car = (k) => CAR_SPOTS[k % 4];

    if (t < 34) {
      // ======================================================= street level
      G.setHour(19.93 + t * 0.002);
      const entrance = (k) => ({ x: 13.4 + (k - 1.5) * 0.35, z: 8.4 });
      const atLift = (k) => ({ x: 9.2 + (k - 1.5) * 0.4, z: -1.5 - (k % 2) * 0.35 });
      this.cast.forEach((a, k) => {
        const st = walk([
          { x: -3.2 - k * 1.05, z: 11.0 + (k % 2) * 0.45 },
          { x: 12.4 + k * 0.3, z: 10.5 + (k % 2) * 0.3 },
          { x: 13.4 + (k - 1.5) * 0.3, z: 9.4 },
          entrance(k),
          atLift(k),
        ], 1.32, k * 0.15, t);
        const y = st.z > 8.8 && st.z < 13.9 ? 0.14 : 0;
        let s = st;
        if (t > 16.4 + k * 0.35) s = walk([atLift(k), { x: 9.2 + (k - 1.5) * 0.3, z: -2.6 }, { ...car(k), ry: BACK }], 1.1, 16.4 + k * 0.35, t);
        this.pose(a, s, dt, { lookYaw: t > 20 && t < 34 ? 0.3 * Math.sin(k + t * 0.4) : null });
        a.root.position.y = y;
      });
      // him: at the bus shelter, watching; then after them
      const himPath = [{ x: 5.0, z: 12.2 }, { x: 12.8, z: 10.4 }, { x: 13.4, z: 9.3 }, { x: 13.4, z: 8.3 }, { x: 9.8, z: -1.6 }];
      let hs = t < 8.6 ? { x: 5.0, z: 12.2, ry: yawTo(0, -1) + 0.3, speed: 0 } : walk(himPath, 1.95, 8.6, t);
      let pose = 'walk';
      if (t > 19.2) hs = walk([{ x: 9.8, z: -1.6 }, { x: 9.6, z: -2.55 }, { ...HIM_CAR, ry: BACK }], 1.1, 19.4, t);
      // watching them go by
      let lookYaw = 0;
      if (t < 8.6) {
        const a = this.cast[0];
        lookYaw = Math.max(-1.2, Math.min(1.2, Math.atan2(-(a.x - 5.0), -(a.z - 12.2)) - hs.ry));
        pose = 'pockets';
      }
      // in the car: facing the doors, then his head turns to look at you
      let tilt = 0;
      if (t > 21.5) {
        hs = { ...HIM_CAR, ry: BACK, speed: 0 };
        pose = 'pockets';
        lookYaw = span(t, 29.2, 31.5) * 1.25;
        tilt = span(t, 30, 32) * 0.25;
      }
      this.placeHim(hs, dt, { pose, lookYaw, tilt, y: hs.z > 8.8 && hs.z < 13.9 ? 0.14 : 0 });
      // the concierge looks up as they pass
      const c = G.concierge;
      c.rotation.y = 0;
      c.userData.rig.update(dt, { pose: 'stand', lookYaw: t > 12 && t < 17 ? -0.9 : null });
      // entrance doors and the elevator
      G.setEntrance(Math.max(span(t, 9.5, 10.3) - span(t, 15.5, 17), span(t, 13.5, 14.2) - span(t, 16.5, 17.5)));
      const L = G.lifts[0];
      let open = span(t, 15, 16.2) - span(t, 18, 19.2);
      if (t > 19.0) open = Math.max(open, span(t, 19.1, 19.8) - span(t, 21.2, 22.4));
      L.setOpen(open);
      // floor display: L, then counting up while the car climbs
      const climb = span(t, 22.6, 33.4);
      const floor = t < 22.6 ? 0 : Math.max(1, Math.min(50, Math.round(climb * 50)));
      G.car.display.set(floor, t > 22.6 && floor < 50 ? 1 : 0);
      L.display.set(floor, 0);
      // the lift light stutters on the way up
      G.car.light.intensity = 2.6 * (t > 28.3 && t < 29.1 && Math.sin(t * 60) > 0 ? 0.15 : 1);
      G.car.panel.material.emissiveIntensity = G.car.light.intensity / 2.6 * 1.1;

      // ------------------------------------------------------------ camera
      if (t < 5.5) {
        // from the bottom: looking straight up the tower, tilting down to the street
        const k = span(t, 0, 5.5);
        cam = v3(14.2, 0.6 + k * 0.9, 27.5);
        this.lookAt.set(14.2, lerp(180, 2.5, Math.pow(k, 0.7)), lerp(-2, 9, k));
      } else if (t < 10.5) {
        const k = span(t, 5.5, 10.5);
        cam = v3(lerp(1.5, 7.5, k), 1.55, 16.6);
        this.lookAt.set(lerp(4.5, 11.5, k), 1.4, 11.0);
      } else if (t < 19) {
        const k = span(t, 10.5, 19);
        cam = v3(lerp(19.6, 18.8, k), 1.75, lerp(6.6, 5.4, k));
        this.lookAt.set(lerp(13, 9.6, k), 1.25, lerp(6, -1.8, k));
      } else if (t < 21.6) {
        // from behind them at the back of the car: the doors closing, a hand
        cam = v3(9.45, 1.72, -3.98);
        this.lookAt.set(9.3, 1.15, -2.3);
      } else if (t < 26.2) {
        cam = v3(8.45, 2.12, -2.72);
        this.lookAt.set(9.45, 1.25, -3.85);
      } else if (t < 29) {
        // the numbers going up, and the back of his head
        const k = span(t, 26.2, 29);
        cam = v3(lerp(9.0, 9.1, k), 1.78, -3.55);
        this.lookAt.set(9.3, 2.2, -2.6);
      } else {
        // their faces, and his turning
        cam = v3(8.55, 1.62, -2.7);
        this.lookAt.set(9.45, 1.55, -3.75);
      }
      return cam;
    }

    // ========================================================= floor fifty
    W.setHour(19.95 + (t - 34) * 0.001);
    this.setScene('tower');
    const liftOpen = span(t, 34.2, 35.3);
    W.liftDoors.setOpen(liftOpen);
    W.liftDoors.display.set(50);
    W.car.display.set(50);
    const doorAt = (k) => ({ x: 2.2 + k * 0.42, z: -1.0 - (k % 2) * 0.32 });
    const inside = (k) => ({ ...START_SPOTS[k % 4], ry: START_SPOTS[k % 4].ry });
    this.cast.forEach((a, k) => {
      let st = walk([{ ...car(k) }, { x: 9.2 + (k - 1.5) * 0.25, z: -2.1 }, { x: 6.0, z: -1.25 + (k % 2) * 0.35 }, doorAt(k)], 1.55, 34.7 + k * 0.25, t);
      const go = 41.5 + k * 0.38;
      if (t > go) st = walk([doorAt(k), { x: 1.6 + (k - 1.5) * 0.12, z: -0.45 }, { x: 1.6, z: 0.55 }, inside(k)], 1.8, go, t);
      if (t < 34.7 + k * 0.25) st = { ...car(k), ry: BACK, speed: 0 };
      let pose = 'walk', lookYaw = null, lookPitch = 0;
      if (t > 43.5) { lookYaw = Math.atan2(-(1.6 - a.x), -(0 - a.z)) - st.ry; lookYaw = Math.max(-1.2, Math.min(1.2, ((lookYaw + Math.PI) % (2 * Math.PI)) - Math.PI)); }
      // whoever looks through the peephole
      if (k === 0 && t > 46.6) {
        st = walk([inside(0), { x: 1.6, z: 0.42 }], 1.2, 46.6, t);
        if (t > 47.6) { st = { x: 1.6, z: 0.42, ry: 0, speed: 0 }; pose = 'peep'; lookYaw = 0; lookPitch = 0.05; }
      }
      // glance back at him on the way
      if (t > 37 && t < 41 && k % 2) lookYaw = 1.1;
      this.pose(a, st, dt, { pose, lookYaw, lookPitch });
      a.root.position.y = 0;
    });
    let hs = { ...HIM_CAR, ry: BACK, speed: 0 };
    if (t > 36.3) hs = walk([{ ...HIM_CAR }, { x: 9.2, z: -1.7 }, { x: 4.0, z: -1.25 }, { x: DOOR.stand.x + 0.1, z: DOOR.stand.z - 0.15 }, { x: DOOR.stand.x, z: DOOR.stand.z - 0.02, ry: BACK }], 1.02, 36.3, t);
    const atDoor = Math.hypot(hs.x - DOOR.stand.x, hs.z - DOOR.stand.z) < 0.05;
    this.placeHim(hs, dt, { pose: atDoor ? 'stand' : 'walk', lookYaw: 0, lookPitch: atDoor ? -0.42 : 0, tilt: atDoor ? span(t, 49.5, 52) * 0.28 : 0 });
    if (atDoor && t > 50.5) this.him.position.z = DOOR.stand.z + span(t, 50.5, 51.8) * 0.08;
    // our door: unlocked, opened, then slammed, bolted and chained
    const open = span(t, 41.2, 41.8) - span(t, 42.8, 43.15);
    W.door.set({ bolt: t > 44.1, chain: t > 45.0, angle: open * 1.45 });
    if (t > 43.1 && t < 43.4) W.door.hit(2);

    if (t < 39.5) {
      // facing the elevator as it opens; they hurry towards us
      const k = span(t, 35, 39.5);
      cam = v3(lerp(5.4, 3.3, k), 1.62, -1.25);
      this.lookAt.set(lerp(9.2, 7.5, k), 1.35, -1.9);
    } else if (t < 43.2) {
      // at the door: them fumbling with the keys, him coming down the hall
      cam = v3(0.55, 1.62, -1.75);
      this.lookAt.set(3.0, 1.35, -0.6);
    } else if (t < 49) {
      cam = v3(3.55, 2.05, 1.45);
      this.lookAt.set(1.55, 1.15, -0.05);
    } else {
      // through the peephole
      fx.peep = true;
      W.door.update(0);
      cam = W.door.peepCam.position.clone();
      this.lookAt.copy(cam).add(v3(0, -0.03, -1));
      this.peep = true;
    }
    if (t >= INTRO_LEN) this.finish();
    return cam;
  }

  get scene() { return this.where; }

  finish() {
    if (this.done) return;
    this.done = true;
    this.him.removeFromParent();
    for (const a of this.cast) {
      a.scripted = false;
      a.label.visible = true;
      a.root.removeFromParent();
      this.g.world.scene.add(a.root);
    }
    voice.stop();
  }
}

