// All sound is synthesised with the Web Audio API: the hum of the
// apartment and the city fifty floors down, wind on the glass, knocks of
// every kind on a solid wood door, the deadbolt and the chain, the elevator,
// his footsteps and breathing, your heartbeat, and the music under it all.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

class Sound {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.tension = 0;
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
    // brown noise for rumbles
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }

    // a small room: short, warm reverb
    this.verb = ctx.createConvolver();
    const ir = ctx.createBuffer(2, ctx.sampleRate * 1.2, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 4);
    }
    this.verb.buffer = ir;
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 0.18;
    this.verbSend.connect(this.verb).connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.sfx.connect(this.verbSend);
    // sounds from the corridor reach you through the door, dulled
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 900;
    this.muffle.connect(this.sfx);

    this.buildAmbience();
    this.buildDrone();
    this.buildMuzak();
    this.loops = new Map();
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

  // how dull the door makes the corridor: 0 = open or you're outside
  setDoorMuffle(k) {
    if (!this.ctx) return;
    this.muffle.frequency.setTargetAtTime(600 + (1 - k) * 12000, this.now, 0.1);
  }

  // ------------------------------------------------------------ helpers --
  src(buf = this.noise, loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = loop;
    return s;
  }

  env(gainNode, t, a, peak, dur) {
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
    p.maxDistance = 200;
    this.place(p, x, y, z);
    return p;
  }

  place(p, x, y, z) {
    if (p.positionX) {
      const t = this.now;
      p.positionX.setTargetAtTime(x, t, 0.03); p.positionY.setTargetAtTime(y, t, 0.03); p.positionZ.setTargetAtTime(z, t, 0.03);
    } else p.setPosition(x, y, z);
  }

  // where a one-shot goes: straight to the mix, or placed in the world,
  // optionally through the door
  out(pos, muffled = false) {
    if (!pos) return this.sfx;
    const p = this.panner(pos.x, pos.y ?? 1.4, pos.z);
    p.connect(muffled ? this.muffle : this.sfx);
    return p;
  }

  osc(type, f, t, dur, dst, peak, a = 0.005) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    const g = this.ctx.createGain();
    this.env(g, t, a, peak, dur);
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
    this.env(g, t, a, peak, dur);
    n.connect(f).connect(g).connect(dst);
    n.start(t, Math.random() * 1.5, dur + 0.05);
    return f;
  }

  // ---------------------------------------------------------- ambience --
  buildAmbience() {
    const ctx = this.ctx;
    const mk = (buf, type, freq, q, gain) => {
      const s = this.src(buf, true);
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      s.connect(f).connect(g).connect(this.master);
      s.start(0, Math.random() * 1.5);
      return { g, f, base: gain };
    };
    this.amb = {
      room: mk(this.brown, 'lowpass', 140, 0.7, 0.32),       // fridge, ventilation
      city: mk(this.brown, 'bandpass', 320, 0.6, 0.22),      // traffic far below
      wind: mk(this.noise, 'bandpass', 700, 0.9, 0.035),     // wind on the glass
      street: mk(this.brown, 'lowpass', 900, 0.5, 0.0),      // at street level
    };
    // the fridge's 60 Hz, very quiet
    const o = ctx.createOscillator();
    o.frequency.value = 60;
    const og = ctx.createGain();
    og.gain.value = 0;
    o.connect(og).connect(this.master);
    o.start();
    this.amb.hum = { g: og, base: 0.008 };
    this.windT = 0;
    this.sirenT = 20 + Math.random() * 40;
  }

  // where you are decides what you hear: 'apt', 'street', 'lift', 'silent'
  setScene(kind, time = 1.5) {
    if (!this.ctx) return;
    const A = this.amb, t = this.now, tc = time / 3;
    const lv = {
      apt: { room: 1, city: 1, wind: 1, street: 0, hum: 1 },
      street: { room: 0, city: 0.6, wind: 0.3, street: 1, hum: 0 },
      lift: { room: 0.8, city: 0, wind: 0, street: 0, hum: 0 },
      silent: { room: 0, city: 0, wind: 0, street: 0, hum: 0 },
      title: { room: 0.5, city: 0.8, wind: 0.8, street: 0, hum: 0.5 },
    }[kind];
    A.street.base = 0.3;
    for (const k of Object.keys(lv)) A[k].g.gain.setTargetAtTime(A[k].base * lv[k], t, tc);
    this.scene = kind;
  }

  // called every frame for things that change slowly
  update(dt) {
    if (!this.ctx) return;
    // gusts of wind against fifty floors of glass
    this.windT -= dt;
    if (this.windT <= 0) {
      this.windT = 3 + Math.random() * 6;
      const A = this.amb.wind;
      if (this.scene === 'apt' || this.scene === 'title') {
        A.f.frequency.setTargetAtTime(400 + Math.random() * 700, this.now, 1.5);
        A.g.gain.setTargetAtTime(A.base * (0.4 + Math.random() * 1.4), this.now, 1.2);
      }
    }
    this.sirenT -= dt;
    if (this.sirenT <= 0) {
      this.sirenT = 40 + Math.random() * 70;
      if (this.scene === 'apt' || this.scene === 'title') this.siren();
    }
  }

  // a siren somewhere far below, doppler and all
  siren() {
    const ctx = this.ctx, t = this.now;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.35;
    const lg = ctx.createGain();
    lg.gain.value = 180;
    lfo.connect(lg).connect(o.frequency);
    o.frequency.setValueAtTime(820, t);
    o.frequency.linearRampToValueAtTime(700, t + 12);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.018, t + 4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 12);
    o.connect(f).connect(g).connect(this.master);
    o.start(t); lfo.start(t);
    o.stop(t + 12.2); lfo.stop(t + 12.2);
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
    this.drone.gain.setTargetAtTime(0.03 + k * 0.32, this.now, time / 3);
    this.droneF.frequency.setTargetAtTime(220 + k * 900, this.now, time / 3);
  }

  // soft elevator jazz for the ride up
  buildMuzak() {
    const ctx = this.ctx;
    this.muzakGain = ctx.createGain();
    this.muzakGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    this.muzakBus = ctx.createGain();
    this.muzakBus.connect(lp).connect(this.muzakGain).connect(this.master);
    this.muzakOn = false;
  }

  startMuzak() {
    if (!this.ctx || this.muzakOn) return;
    this.muzakOn = true;
    this.muzakGain.gain.setTargetAtTime(0.35, this.now, 0.4);
    const beat = 60 / 92;
    const chords = [[62, 65, 69, 72], [55, 59, 62, 65], [60, 64, 67, 71], [57, 60, 64, 67]];
    const scale = [74, 76, 77, 79, 81, 84];
    let next = this.now + 0.1, step = 0;
    const tick = () => {
      if (!this.muzakOn) return;
      while (next < this.now + 0.4) {
        const bar = Math.floor(step / 8) % 4, half = step % 8;
        const ch = chords[bar];
        if (half === 0) for (const m of ch) this.note(mtof(m), next, beat * 3.8, 'triangle', 0.03);
        if (half % 2 === 0) this.note(mtof(ch[0] - 24 + (half === 4 ? 7 : 0)), next, beat * 0.9, 'sine', 0.1);
        if (Math.random() < 0.4) this.note(mtof(scale[Math.floor(Math.random() * scale.length)]), next, beat * 0.8, 'sine', 0.04);
        next += beat / 2;
        step++;
      }
    };
    tick();
    this.muzakTimer = setInterval(tick, 120);
  }

  note(freq, t, dur, type, peak) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.06, dur * 0.2));
    g.gain.setTargetAtTime(0.0001, t + dur * 0.6, dur * 0.2);
    o.connect(g).connect(this.muzakBus);
    o.start(t);
    o.stop(t + dur + 0.5);
  }

  stopMuzak(time = 1) {
    if (!this.ctx || !this.muzakOn) return;
    this.muzakOn = false;
    clearInterval(this.muzakTimer);
    this.muzakGain.gain.setTargetAtTime(0, this.now, time / 3);
  }

  // ----------------------------------------------------- the front door --
  // one knock of a fist on solid wood
  thump(t, dst, loud = 1, low = 1) {
    this.osc('sine', 110 * low, t, 0.22, dst, 0.55 * loud).frequency.exponentialRampToValueAtTime(55 * low, t + 0.15);
    this.burst(t, 0.09, dst, 0.5 * loud, 'bandpass', 260 * low, 1.6);
    this.burst(t, 0.05, dst, 0.18 * loud, 'bandpass', 1400, 2);
  }

  // a pattern of knocks (gaps in seconds) at the door
  knock(gaps, pos, loud = 1, muffled = false) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos, muffled);
    for (const g of gaps) this.thump(t + g, dst, loud * (0.85 + Math.random() * 0.3), loud > 1.3 ? 0.8 : 1);
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

  // forcing the lock: wood groaning against the bolt, then a heave
  force(pos) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now, dst = this.out(pos);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70 + Math.random() * 30, t);
    o.frequency.linearRampToValueAtTime(140 + Math.random() * 60, t + 0.6);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 8;
    const g = ctx.createGain();
    this.env(g, t, 0.15, 0.25, 0.7);
    o.connect(f).connect(g).connect(dst);
    o.start(t); o.stop(t + 0.8);
    this.thump(t + 0.65, dst, 2, 0.6);
    this.burst(t + 0.66, 0.08, dst, 0.3, 'highpass', 2000, 1);
  }

  bolt(on) {
    if (!this.ctx) return;
    const t = this.now;
    this.burst(t, 0.04, this.sfx, 0.3, 'bandpass', on ? 1800 : 1500, 4);
    this.osc('square', on ? 160 : 140, t + 0.02, 0.06, this.sfx, 0.08);
    this.burst(t + 0.05, 0.05, this.sfx, 0.25, 'bandpass', 900, 3);
  }

  chain(on) {
    if (!this.ctx) return;
    const t = this.now;
    for (let i = 0; i < 6; i++) this.osc('triangle', 3200 + Math.random() * 2400, t + i * 0.05 + Math.random() * 0.03, 0.12, this.sfx, 0.035);
    this.burst(t + (on ? 0.3 : 0.05), 0.04, this.sfx, 0.2, 'bandpass', 2400, 5);
  }

  locked() {
    if (!this.ctx) return;
    const t = this.now;
    for (let i = 0; i < 3; i++) this.burst(t + i * 0.09, 0.04, this.sfx, 0.25, 'bandpass', 1300, 4);
  }

  creak(dur = 0.9, pitch = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(380 * pitch, t);
    for (let k = 0; k < 8; k++) o.frequency.setValueAtTime((300 + Math.random() * 260) * pitch, t + (k / 8) * dur);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1100 * pitch; f.Q.value = 10;
    const g = ctx.createGain();
    this.env(g, t, 0.1, 0.05, dur);
    o.connect(f).connect(g).connect(this.sfx);
    o.start(t); o.stop(t + dur + 0.1);
  }

  shut(loud = 1) {
    if (!this.ctx) return;
    const t = this.now;
    this.thump(t, this.sfx, 1.2 * loud, 0.7);
    this.burst(t + 0.03, 0.05, this.sfx, 0.25 * loud, 'bandpass', 2200, 4);
  }

  snap() {
    if (!this.ctx) return;
    const t = this.now;
    this.osc('triangle', 4200, t, 0.25, this.sfx, 0.2);
    this.burst(t, 0.12, this.sfx, 0.7, 'highpass', 1800, 1);
    this.thump(t + 0.05, this.sfx, 2.2, 0.6);
    this.chain(false);
  }

  splinter() {
    if (!this.ctx) return;
    const t = this.now;
    for (let i = 0; i < 6; i++) this.burst(t + i * 0.025, 0.08, this.sfx, 0.6, 'bandpass', 900 + Math.random() * 2500, 2);
    this.thump(t, this.sfx, 2.6, 0.5);
    this.thump(t + 0.3, this.sfx, 1.8, 0.6);
  }

  // --------------------------------------------------- around the floor --
  ding(pos, muffled) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos, muffled);
    for (const [f, a] of [[1318.5, 0.18], [2637, 0.05], [1975.5, 0.03]]) this.osc('sine', f, t, 2.2, dst, a, 0.004);
  }

  liftDoors(pos, muffled) {
    if (!this.ctx) return;
    this.burst(this.now, 1.6, this.out(pos, muffled), 0.08, 'lowpass', 500, 1, 0.3, this.brown);
  }

  // a heavy fire door somewhere down the hall
  slam(pos, muffled, loud = 1) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos, muffled);
    this.thump(t, dst, 2.2 * loud, 0.55);
    this.burst(t, 0.6, dst, 0.12 * loud, 'lowpass', 300, 1, 0.01, this.brown);
    this.burst(t + 0.02, 0.06, dst, 0.2 * loud, 'bandpass', 2600, 3);
  }

  step(surface, loud = 1, pos = null, muffled = false) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos, muffled);
    if (surface === 'wood') {
      this.burst(t, 0.09, dst, 0.22 * loud, 'bandpass', 520 + Math.random() * 120, 1.4);
      this.burst(t + 0.01, 0.03, dst, 0.06 * loud, 'bandpass', 2400, 3);
    } else if (surface === 'carpet') this.burst(t, 0.12, dst, 0.2 * loud, 'lowpass', 380 + Math.random() * 100, 0.8, 0.012);
    else if (surface === 'marble') {
      this.burst(t, 0.05, dst, 0.22 * loud, 'bandpass', 2200 + Math.random() * 600, 2.5);
      this.burst(t, 0.07, dst, 0.12 * loud, 'bandpass', 700, 1.5);
    } else this.burst(t, 0.07, dst, 0.2 * loud, 'bandpass', 1100 + Math.random() * 300, 0.9);
  }

  // his steps: heavy, unhurried
  heavyStep(pos, muffled) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos, muffled);
    this.osc('sine', 75, t, 0.18, dst, 0.3).frequency.exponentialRampToValueAtTime(45, t + 0.15);
    this.burst(t, 0.1, dst, 0.18, 'bandpass', 450, 1.3);
  }

  tapGlass(pos) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    for (let i = 0; i < 3; i++) {
      this.burst(t + i * 0.32, 0.03, dst, 0.4, 'bandpass', 3800, 6);
      this.osc('sine', 2100, t + i * 0.32, 0.12, dst, 0.05);
    }
  }

  power(on) {
    if (!this.ctx) return;
    const t = this.now;
    if (!on) {
      this.thump(t, this.sfx, 1.8, 0.4);
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(30, t + 1.2);
      const g = this.ctx.createGain();
      this.env(g, t, 0.01, 0.12, 1.2);
      o.connect(g).connect(this.sfx);
      o.start(t); o.stop(t + 1.3);
      this.amb.room.g.gain.setTargetAtTime(0, t, 0.2);
      this.amb.hum.g.gain.setTargetAtTime(0, t, 0.2);
    } else {
      this.burst(t, 0.03, this.sfx, 0.3, 'bandpass', 3000, 3);
      this.amb.room.g.gain.setTargetAtTime(this.amb.room.base, t, 0.6);
      this.amb.hum.g.gain.setTargetAtTime(this.amb.hum.base, t, 0.6);
    }
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

  // his breathing, close by in the dark
  rasp(pos) {
    if (!this.ctx) return;
    const t = this.now, dst = this.out(pos);
    const f = this.burst(t, 1.3, dst, 0.14, 'bandpass', 500, 4, 0.4, this.brown);
    f.frequency.linearRampToValueAtTime(320, t + 1.2);
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
    this.env(g, t, 0.01, 0.9, 1.8);
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
    for (const [f, d] of [[880, 0], [1320, 0.12]]) this.osc('sine', f, t + d, 0.8, this.sfx, 0.06, 0.01);
  }

  // ------------------------------------------------- positional loops ---
  // his breathing while he's inside: follows him around
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
    this.stopMuzak(0.3);
    for (const L of this.loops.values()) L.g.gain.setTargetAtTime(0, this.now, 0.1);
    this.setTension(0, 0.5);
  }
}

export const sound = new Sound();
