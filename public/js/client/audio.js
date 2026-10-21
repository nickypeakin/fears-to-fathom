// All sound is synthesised with the Web Audio API: wind in the pines (and
// harder at the top of the tower), birds by day, crickets and owls at
// night, the generator chugging by the shed, radio static, boots on dirt,
// on steel stairs and on the cab's boards, the trapdoor, the door, the
// truck, his footsteps, your heartbeat, and a low drone under it all.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

class Sound {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.tension = 0;
    this.env = { day: 1, height: 0, cab: false, gen: false };
  }

  // must be called from a user gesture
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }

    // outdoors: a long, thin reverb (the valley); the cab is dry
    this.verb = ctx.createConvolver();
    const ir = ctx.createBuffer(2, ctx.sampleRate * 2.2, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 5) * 0.6;
    }
    this.verb.buffer = ir;
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 0.14;
    this.verbSend.connect(this.verb).connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.sfx.connect(this.verbSend);
    // what you hear over the radio: narrow, crackly
    this.radioBus = ctx.createGain();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800;
    this.radioBus.connect(hp).connect(lp).connect(this.master);

    this.loops = new Map();
    this.buildAmbience();
    this.buildDrone();
    this.timers = { bird: 2, cricket: 0, owl: 20, far: 30, gust: 1 };
  }

  get ready() { return !!this.ctx; }
  get now() { return this.ctx.currentTime; }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.now, 0.05);
  }

  setListener(cam) {
    if (!this.ctx) return;
    const l = this.ctx.listener, p = cam.position;
    const f = cam.getWorldDirection(this._fwd || (this._fwd = cam.position.clone()));
    if (l.positionX) {
      const t = this.now;
      l.positionX.setValueAtTime(p.x, t); l.positionY.setValueAtTime(p.y, t); l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(f.x, t); l.forwardY.setValueAtTime(f.y, t); l.forwardZ.setValueAtTime(f.z, t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }

  // ------------------------------------------------------------ helpers --
  src(buf = this.noise, loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = loop;
    return s;
  }

  envelope(gainNode, t, a, peak, dur) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  panner(x, y, z, ref = 1.5, roll = 1.2) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = roll;
    p.maxDistance = 300;
    this.place(p, x, y, z);
    return p;
  }

  place(p, x, y, z) {
    if (p.positionX) {
      const t = this.now;
      p.positionX.setTargetAtTime(x, t, 0.03); p.positionY.setTargetAtTime(y, t, 0.03); p.positionZ.setTargetAtTime(z, t, 0.03);
    } else p.setPosition(x, y, z);
  }

  // where a one-shot goes: straight to the mix, or placed in the world
  out(pos, ref = 1.5) {
    if (!pos) return this.sfx;
    const p = this.panner(pos.x, pos.y ?? 1.4, pos.z, ref);
    p.connect(this.sfx);
    return p;
  }

  osc(type, f, t, dur, dst, peak, a = 0.005) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    const g = this.ctx.createGain();
    this.envelope(g, t, a, peak, dur);
    o.connect(g).connect(dst);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  burst(t, dur, dst, peak, type, freq, q = 1, a = 0.002, buf = this.noise) {
    const n = this.src(buf);
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.envelope(g, t, a, peak, dur);
    n.connect(f).connect(g).connect(dst);
    n.start(t, Math.random() * 1.5, dur + 0.05);
    return f;
  }

  // ---------------------------------------------------------- ambience --
  buildAmbience() {
    const ctx = this.ctx;
    const mk = (buf, type, freq, q, gain, dst = this.master) => {
      const s = this.src(buf, true);
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      s.connect(f).connect(g).connect(dst);
      s.start(0, Math.random() * 1.5);
      return { g, f, base: gain };
    };
    this.amb = {
      wind: mk(this.noise, 'bandpass', 500, 0.7, 0.05),        // wind in the pines
      hiss: mk(this.noise, 'highpass', 3500, 0.5, 0.012),      // needles
      low: mk(this.brown, 'lowpass', 120, 0.7, 0.18),          // the valley's rumble
      engine: mk(this.brown, 'lowpass', 260, 1.2, 0.0),        // the truck, in the cutscenes
    };
    this.ambLevel = 0;
  }

  // what kind of place you're in: 'outside', 'title', 'truck', 'silent'
  setScene(kind, time = 1.5) {
    if (!this.ctx) return;
    this.scene = kind;
    const t = this.now, tc = time / 3;
    this.ambLevel = kind === 'silent' ? 0 : 1;
    const A = this.amb;
    A.engine.g.gain.setTargetAtTime(kind === 'truck' ? 0.5 : 0, t, tc);
    A.low.g.gain.setTargetAtTime(this.ambLevel * A.low.base, t, tc);
  }

  // where you are and what time it is: { day (0..1), height (m), cab, gen }
  setEnv(e) {
    Object.assign(this.env, e);
  }

  // called every frame for things that change slowly
  update(dt) {
    if (!this.ctx) return;
    const E = this.env, T = this.timers, t = this.now, A = this.amb;
    const up = Math.min(1, Math.max(0, E.height / 14));
    // gusts: stronger up the tower, dulled inside the glass
    T.gust -= dt;
    if (T.gust <= 0) {
      T.gust = 2.5 + Math.random() * 5;
      const k = this.ambLevel * (0.5 + Math.random() * 1.2) * (0.6 + up * 0.9) * (E.cab ? 0.45 : 1);
      A.wind.f.frequency.setTargetAtTime(300 + Math.random() * 500 + up * 200, t, 1.5);
      A.wind.g.gain.setTargetAtTime(A.wind.base * k, t, 1.2);
      A.hiss.g.gain.setTargetAtTime(A.hiss.base * k * (E.cab ? 0.3 : 1), t, 1.2);
    }
    if (this.ambLevel <= 0 || this.scene === 'truck') return;
    const night = 1 - E.day;
    // birds by day
    T.bird -= dt;
    if (T.bird <= 0) {
      T.bird = 1.5 + Math.random() * 5;
      if (E.day > 0.4 && Math.random() < E.day) this.bird();
    }
    // crickets at dusk and through the night
    T.cricket -= dt;
    if (T.cricket <= 0) {
      T.cricket = 0.35 + Math.random() * 0.5;
      if (night > 0.3) this.cricket(night * (E.cab ? 0.35 : 1) * (1 - up * 0.5));
    }
    T.owl -= dt;
    if (T.owl <= 0) {
      T.owl = 18 + Math.random() * 30;
      if (night > 0.6) this.owl();
    }
    T.far -= dt;
    if (T.far <= 0) {
      T.far = 25 + Math.random() * 40;
      if (night > 0.6 && Math.random() < 0.5) this.coyotes();
      else if (Math.random() < 0.6) this.branch();
    }
  }

  bird() {
    const t = this.now, a = Math.random() * Math.PI * 2, r = 15 + Math.random() * 40;
    const dst = this.out({ x: Math.cos(a) * r, y: 6 + Math.random() * 8, z: Math.sin(a) * r }, 6);
    const base = 2600 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const o = this.osc('sine', base, t + i * 0.13, 0.1, dst, 0.05);
      o.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.6), t + i * 0.13 + 0.09);
    }
  }

  cricket(k) {
    const t = this.now, a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 20;
    const dst = this.out({ x: Math.cos(a) * r, y: 0.2, z: Math.sin(a) * r }, 3);
    const f = 4200 + Math.random() * 600;
    for (let i = 0; i < 3; i++) this.osc('sine', f, t + i * 0.045, 0.03, dst, 0.012 * k, 0.003);
  }

  owl() {
    const t = this.now, a = Math.random() * Math.PI * 2;
    const dst = this.out({ x: Math.cos(a) * 60, y: 12, z: Math.sin(a) * 60 }, 12);
    for (const [d, f, l] of [[0, 400, 0.35], [0.5, 380, 0.25], [0.8, 380, 0.5]]) {
      const o = this.osc('sine', f, t + d, l, dst, 0.06, 0.06);
      o.frequency.linearRampToValueAtTime(f * 0.9, t + d + l);
    }
  }

  coyotes() {
    const t = this.now, a = Math.random() * Math.PI * 2;
    const dst = this.out({ x: Math.cos(a) * 400, y: -40, z: Math.sin(a) * 400 }, 80);
    for (let i = 0; i < 4; i++) {
      const s = t + i * 0.4 + Math.random() * 0.3;
      const o = this.osc('sawtooth', 700 + Math.random() * 300, s, 1.4, dst, 0.012, 0.2);
      o.frequency.linearRampToValueAtTime(1100 + Math.random() * 300, s + 0.6);
      o.frequency.linearRampToValueAtTime(600, s + 1.3);
    }
  }

  // a stick breaking somewhere in the trees
  branch(pos = null) {
    const t = this.now;
    const a = Math.random() * Math.PI * 2;
    const dst = this.out(pos || { x: Math.cos(a) * 24, y: 0.3, z: Math.sin(a) * 24 }, 4);
    this.burst(t, 0.05, dst, 0.4, 'bandpass', 1800, 2);
    this.burst(t + 0.04, 0.04, dst, 0.25, 'bandpass', 2600, 3);
  }

  // a low, uneasy pad that rises with tension (0..1)
  buildDrone() {
    const ctx = this.ctx;
    this.drone = ctx.createGain();
    this.drone.gain.value = 0;
    const f = (this.droneF = ctx.createBiquadFilter());
    f.type = 'lowpass';
    f.frequency.value = 300;
    f.connect(this.drone).connect(this.master);
    for (const [m, det] of [[33, 0], [33, 9], [40, -6], [44, 4], [46, 12]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(m);
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = 0.035;
      o.connect(g).connect(f);
      o.start();
    }
  }

  setTension(k, time = 2) {
    if (!this.ctx) return;
    this.tension = k;
    this.drone.gain.setTargetAtTime(0.01 + k * 0.32, this.now, time / 3);
    this.droneF.frequency.setTargetAtTime(220 + k * 900, this.now, time / 3);
  }

  // -------------------------------------------------------------- steps --
  step(surface, loud = 1, pos = null) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    if (surface === 'wood') {
      this.burst(t, 0.09, dst, 0.22 * loud, 'bandpass', 480 + Math.random() * 120, 1.4);
      this.burst(t + 0.01, 0.03, dst, 0.05 * loud, 'bandpass', 2400, 3);
    } else if (surface === 'metal') {
      this.burst(t, 0.05, dst, 0.24 * loud, 'bandpass', 1100 + Math.random() * 400, 3);
      this.osc('triangle', 380 + Math.random() * 60, t, 0.25, dst, 0.04 * loud, 0.002);
      this.osc('sine', 1220 + Math.random() * 90, t, 0.18, dst, 0.015 * loud, 0.002);
    } else if (surface === 'grass') {
      this.burst(t, 0.13, dst, 0.12 * loud, 'bandpass', 2600 + Math.random() * 800, 0.7, 0.02);
      this.burst(t, 0.08, dst, 0.1 * loud, 'lowpass', 400, 0.8, 0.01);
    } else {
      // dirt and needles
      this.burst(t, 0.1, dst, 0.18 * loud, 'bandpass', 900 + Math.random() * 400, 0.8, 0.01);
      this.burst(t + 0.02, 0.06, dst, 0.06 * loud, 'highpass', 3000, 0.7, 0.01);
    }
  }

  // his steps: heavy, unhurried
  heavyStep(surface, pos) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos, 2);
    this.osc('sine', 70, t, 0.18, dst, 0.3).frequency.exponentialRampToValueAtTime(42, t + 0.15);
    if (surface === 'metal') this.osc('triangle', 300, t, 0.35, dst, 0.07, 0.002);
    this.burst(t, 0.1, dst, 0.18, 'bandpass', surface === 'wood' ? 420 : 700, 1.3);
  }

  // ---------------------------------------------------- doors and wood --
  thump(t, dst, loud = 1, low = 1) {
    this.osc('sine', 110 * low, t, 0.22, dst, 0.55 * loud).frequency.exponentialRampToValueAtTime(55 * low, t + 0.15);
    this.burst(t, 0.09, dst, 0.5 * loud, 'bandpass', 260 * low, 1.6);
    this.burst(t, 0.05, dst, 0.18 * loud, 'bandpass', 1400, 2);
  }

  // someone knocking on wood at pos (the trapdoor, from underneath)
  knock(pos, n = 3, loud = 1) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    for (let i = 0; i < n; i++) this.thump(t + i * 0.32 + Math.random() * 0.04, dst, loud * (0.85 + Math.random() * 0.3), 0.85);
  }

  bang(pos) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    for (let i = 0; i < 4; i++) this.thump(t + i * 0.22 + Math.random() * 0.04, dst, 1.7, 0.75);
    this.rattle(pos, t + 0.1);
  }

  rattle(pos, t = this.now) {
    if (!this.ctx) return;
    const dst = this.out(pos);
    for (let i = 0; i < 9; i++) this.burst(t + i * 0.07 + Math.random() * 0.03, 0.03, dst, 0.12, 'bandpass', 2600 + Math.random() * 1500, 6);
  }

  bolt(on, pos = null) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    this.burst(t, 0.04, dst, 0.3, 'bandpass', on ? 1800 : 1500, 4);
    this.osc('square', on ? 160 : 140, t + 0.02, 0.06, dst, 0.08);
    this.burst(t + 0.05, 0.05, dst, 0.25, 'bandpass', 900, 3);
  }

  locked(pos = null) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    for (let i = 0; i < 3; i++) this.burst(t + i * 0.09, 0.04, dst, 0.25, 'bandpass', 1300, 4);
  }

  creak(dur = 0.9, pitch = 1, pos = null) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(380 * pitch, t);
    for (let k = 0; k < 8; k++) o.frequency.setValueAtTime((300 + Math.random() * 260) * pitch, t + (k / 8) * dur);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1100 * pitch; f.Q.value = 10;
    const g = ctx.createGain();
    this.envelope(g, t, 0.1, 0.05, dur);
    o.connect(f).connect(g).connect(this.out(pos));
    o.start(t); o.stop(t + dur + 0.1);
  }

  shut(loud = 1, pos = null) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    this.thump(t, dst, 1.2 * loud, 0.7);
    this.burst(t + 0.03, 0.05, dst, 0.25 * loud, 'bandpass', 2200, 4);
  }

  // a cable or bolt giving way
  snap(pos = null) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos, 4);
    const o = this.osc('triangle', 900, t, 0.5, dst, 0.18);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.45);
    this.burst(t, 0.12, dst, 0.6, 'highpass', 1800, 1);
  }

  splinter(pos = null) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    for (let i = 0; i < 6; i++) this.burst(t + i * 0.025, 0.08, dst, 0.6, 'bandpass', 900 + Math.random() * 2500, 2);
    this.thump(t, dst, 2.6, 0.5);
    this.thump(t + 0.3, dst, 1.8, 0.6);
  }

  // prying at the trapdoor: wood groaning against the bolt
  pry(pos) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now, dst = this.out(pos);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70 + Math.random() * 30, t);
    o.frequency.linearRampToValueAtTime(140 + Math.random() * 60, t + 0.6);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 8;
    const g = ctx.createGain();
    this.envelope(g, t, 0.15, 0.25, 0.7);
    o.connect(f).connect(g).connect(dst);
    o.start(t); o.stop(t + 0.8);
    this.thump(t + 0.65, dst, 1.6, 0.6);
  }

  tapGlass(pos) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    for (let i = 0; i < 3; i++) {
      this.burst(t + i * 0.32, 0.03, dst, 0.4, 'bandpass', 3800, 6);
      this.osc('sine', 2100, t + i * 0.32, 0.12, dst, 0.05);
    }
  }

  // a flashlight switch
  click(pos = null) {
    if (!this.ctx) return;
    this.burst(this.now, 0.012, this.out(pos), 0.25, 'bandpass', 2600, 4);
  }

  // the elk camera taking a picture: shutter, and the flash charging back up
  shutter(pos) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos, 3);
    this.burst(t, 0.02, dst, 0.35, 'bandpass', 3200, 3);
    this.burst(t + 0.07, 0.015, dst, 0.25, 'bandpass', 2400, 3);
    this.osc('sine', 5400, t + 0.15, 0.6, dst, 0.012, 0.2);
  }

  // ------------------------------------------------------ things you do --
  pickup(kind) {
    if (!this.ctx) return;
    const t = this.now;
    if (kind === 'keys') for (let i = 0; i < 4; i++) this.osc('triangle', 3000 + Math.random() * 2000, t + i * 0.04, 0.1, this.sfx, 0.03);
    else this.burst(t, 0.12, this.sfx, 0.18, 'bandpass', kind === 'box' ? 500 : 900, 1.2, 0.01);
  }

  drop(kind) {
    if (!this.ctx) return;
    const t = this.now;
    if (kind === 'keys') for (let i = 0; i < 3; i++) this.osc('triangle', 2500 + Math.random() * 2000, t + i * 0.05, 0.12, this.sfx, 0.03);
    else this.thump(t, this.sfx, kind === 'box' || kind === 'jug' || kind === 'fuel' ? 0.5 : 0.25, 1.4);
  }

  // the generator's pull cord, and whether it caught
  pull(pos) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    const f = this.burst(t, 0.45, dst, 0.25, 'bandpass', 500, 2, 0.02);
    f.frequency.exponentialRampToValueAtTime(1800, t + 0.35);
    for (let i = 0; i < 4; i++) this.thump(t + 0.1 + i * 0.09, dst, 0.4, 0.6);
  }

  // the generator running: a positional loop by the shed
  setGenerator(on, pos) {
    if (!this.ctx) return;
    let L = this.loops.get('gen');
    if (!L) {
      const ctx = this.ctx;
      const p = this.panner(pos.x, pos.y, pos.z, 3, 1.1);
      const g = ctx.createGain();
      g.gain.value = 0;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 29;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      const n = this.src(this.brown, true);
      const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 180; nf.Q.value = 1;
      const og = ctx.createGain(); og.gain.value = 0.25;
      o.connect(lp).connect(og).connect(g);
      n.connect(nf).connect(g);
      g.connect(p).connect(this.sfx);
      o.start(); n.start();
      L = { p, g, o };
      this.loops.set('gen', L);
    }
    if (on && !L.on) {
      const t = this.now;
      for (let i = 0; i < 5; i++) this.thump(t + i * 0.11, this.out(pos), 0.6, 0.5);
    }
    if (!on && L.on) {
      L.o.frequency.setTargetAtTime(12, this.now, 0.4);
      setTimeout(() => { if (!L.on) L.o.frequency.value = 29; }, 2500);
    }
    L.on = on;
    L.g.gain.setTargetAtTime(on ? 0.5 : 0, this.now, on ? 0.6 : 0.5);
  }

  // fuel glugging into the generator
  pour(pos) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    for (let i = 0; i < 10; i++) this.burst(t + i * 0.18 + Math.random() * 0.05, 0.12, dst, 0.12, 'bandpass', 500 + Math.random() * 300, 6, 0.02);
  }

  water(pos) {
    if (!this.ctx) return;
    this.burst(this.now, 2.4, this.out(pos), 0.08, 'bandpass', 2200, 0.6, 0.2);
  }

  // the radio: a squelch at the start and end of each line, hiss under it
  radio(len = 2, pos = null) {
    if (!this.ctx) return;
    const t = this.now;
    const dst = pos ? this.out(pos, 2) : this.radioBus;
    this.burst(t, 0.08, dst, 0.3, 'highpass', 1500, 0.7);
    this.burst(t, len, dst, 0.035, 'bandpass', 1800, 0.5, 0.05);
    this.burst(t + len, 0.12, dst, 0.25, 'highpass', 1500, 0.7);
  }

  static(len = 2.5) {
    if (!this.ctx) return;
    this.burst(this.now, len, this.radioBus, 0.18, 'bandpass', 2000, 0.4, 0.05);
  }

  engine(on) {
    if (!this.ctx) return;
    const t = this.now;
    if (on) {
      // cranking, then catching
      for (let i = 0; i < 7; i++) this.thump(t + i * 0.13, this.sfx, 0.5, 0.4);
      this.amb.engine.g.gain.setTargetAtTime(0.5, t + 1, 0.3);
    } else this.amb.engine.g.gain.setTargetAtTime(0, t, 0.5);
  }

  siren(pos) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.5;
    const lg = ctx.createGain();
    lg.gain.value = 220;
    lfo.connect(lg).connect(o.frequency);
    o.frequency.value = 820;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 14);
    o.connect(f).connect(g).connect(this.out(pos, 30));
    o.start(t); lfo.start(t);
    o.stop(t + 14.2); lfo.stop(t + 14.2);
  }

  // ----------------------------------------------------------- the body --
  heartbeat(rate = 1, loud = 1) {
    if (!this.ctx) return;
    const t = this.now;
    for (const [dt, a] of [[0, 1], [0.28 / rate, 0.7]]) {
      this.osc('sine', 52, t + dt, 0.18, this.master, 0.5 * loud * a, 0.01).frequency.exponentialRampToValueAtTime(38, t + dt + 0.15);
    }
  }

  breath(out = true, loud = 1) {
    if (!this.ctx) return;
    const t = this.now;
    const f = this.burst(t, out ? 0.9 : 0.7, this.master, 0.05 * loud, 'bandpass', out ? 700 : 1100, 0.8, 0.25);
    f.frequency.linearRampToValueAtTime(out ? 450 : 1400, t + 0.7);
  }

  gasp() {
    if (!this.ctx) return;
    const t = this.now;
    const f = this.burst(t, 0.6, this.master, 0.3, 'bandpass', 1300, 1.2, 0.03);
    f.frequency.linearRampToValueAtTime(2200, t + 0.3);
  }

  whisper(pan = Math.random() < 0.5 ? -0.8 : 0.8) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now;
    const n = this.src();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 7;
    for (let k = 0; k < 12; k++) bp.frequency.setValueAtTime(600 + Math.random() * 2200, t + k * 0.13);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let k = 0; k < 12; k++) g.gain.setValueAtTime(Math.random() < 0.7 ? 0.2 : 0.02, t + k * 0.13);
    g.gain.setValueAtTime(0.0001, t + 1.6);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    n.connect(bp).connect(g).connect(p).connect(this.sfx);
    n.start(t, Math.random(), 1.7);
  }

  distort(amount) {
    const ws = this.ctx.createWaveShaper();
    const k = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      k[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
    }
    ws.curve = k;
    return ws;
  }

  // a dissonant hit when something isn't right
  stinger(loud = 1) {
    if (!this.ctx) return;
    const t = this.now;
    for (const m of [38, 39, 45, 50, 51]) {
      const o = this.osc('sawtooth', mtof(m), t, 2.5, this.master, 0.05 * loud, 0.02);
      o.detune.linearRampToValueAtTime(-60, t + 2.5);
    }
    this.burst(t, 0.6, this.master, 0.25 * loud, 'lowpass', 200, 1, 0.01, this.brown);
  }

  jumpscare() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now;
    const ws = this.distort(90);
    const g = ctx.createGain();
    this.envelope(g, t, 0.01, 0.9, 1.8);
    ws.connect(g).connect(this.master);
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(220 + i * 140, t);
      for (let k = 0; k < 16; k++) o.frequency.setValueAtTime(200 + Math.random() * 1300, t + k * 0.1);
      o.connect(ws);
      o.start(t);
      o.stop(t + 1.8);
    }
    const n = this.src();
    n.connect(ws);
    n.start(t, 0, 1.8);
  }

  chime() {
    if (!this.ctx) return;
    const t = this.now;
    for (const [f, d] of [[880, 0], [1320, 0.12]]) this.osc('sine', f, t + d, 0.8, this.sfx, 0.05, 0.01);
  }

  // a phone buzzing in your pocket
  buzz() {
    if (!this.ctx) return;
    const t = this.now;
    for (let i = 0; i < 2; i++) this.osc('square', 140, t + i * 0.35, 0.22, this.master, 0.025, 0.01);
  }

  // ------------------------------------------------- positional loops ---
  // his breathing when he's close: follows him around
  setLoop(name, pos, level) {
    if (!this.ctx) return;
    let L = this.loops.get(name);
    if (!L) {
      const ctx = this.ctx;
      const p = this.panner(0, 1.6, 0, 1.2, 1.6);
      const g = ctx.createGain();
      g.gain.value = 0;
      const s = this.src(this.brown, true);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 5;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.4;
      const lg = ctx.createGain();
      lg.gain.value = 0.5;
      const amp = ctx.createGain();
      amp.gain.value = 0.5;
      lfo.connect(lg).connect(amp.gain);
      s.connect(f).connect(amp).connect(g).connect(p).connect(this.sfx);
      s.start(); lfo.start();
      L = { p, g };
      this.loops.set(name, L);
    }
    if (pos) this.place(L.p, pos.x, pos.y ?? 1.6, pos.z);
    L.g.gain.setTargetAtTime(level, this.now, 0.2);
  }

  quiet() {
    if (!this.ctx) return;
    for (const L of this.loops.values()) { L.on = false; L.g.gain.setTargetAtTime(0, this.now, 0.1); }
    this.amb.engine.g.gain.setTargetAtTime(0, this.now, 0.2);
    this.setTension(0, 0.5);
  }
}

export const sound = new Sound();
