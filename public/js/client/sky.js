// The sky over Cinder Peak through a summer day and night: blue overhead
// at noon, a long orange evening, stars and a bright moon, the grey before
// dawn. setHour() also works out the light the rest of the world needs:
// the sun (or moon), the sky's fill light, and the colour of the haze.

import * as THREE from 'three';

const DEG = Math.PI / 180;
export const SUNRISE = 6.0, SUNSET = 20.75;

// where the sun is at hour h (0..24): up in the east, highest a little
// after one in the afternoon in the south, down in the west-north-west
export function sunAt(h) {
  const f = (h - SUNRISE) / (SUNSET - SUNRISE);
  let e;
  if (f >= 0 && f <= 1) e = 62 * Math.sin(Math.PI * f);
  else {
    // below the horizon: how far into the night
    const n = f > 1 ? (h - SUNSET) : (h + 24 - SUNSET);
    const len = 24 - (SUNSET - SUNRISE);
    e = -38 * Math.sin(Math.PI * Math.min(1, n / len));
  }
  const az = (90 + 200 * Math.max(-0.15, Math.min(1.15, f))) * DEG;
  const ce = Math.cos(e * DEG);
  return { dir: new THREE.Vector3(Math.sin(az) * ce, Math.sin(e * DEG), -Math.cos(az) * ce), elev: e };
}

const skyVert = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const skyFrag = /* glsl */`
  uniform vec3 sunDir, moonDir;
  uniform float time, stars;
  uniform vec3 zenith, horizon, sunHorizon, glowColor;
  uniform float sunGlow, sunDisc, clouds;
  varying vec3 vDir;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float e = d.y;
    vec2 hdir = normalize(d.xz + 1e-5);
    vec2 sflat = normalize(sunDir.xz + 1e-5);
    float towardSun = max(dot(hdir, sflat), 0.0);
    vec3 hor = mix(horizon, sunHorizon, pow(towardSun, 2.5));
    float up = pow(clamp(e, 0.0, 1.0), 0.45);
    vec3 col = mix(hor, zenith, up);
    // the sun's glow and disc
    float cs = max(dot(d, sunDir), 0.0);
    col += glowColor * (pow(cs, 14.0) * 0.4 + pow(cs, 160.0) * 0.9) * sunGlow;
    col += vec3(5.0, 3.6, 2.2) * smoothstep(0.99955, 0.9997, cs) * sunDisc;
    // high summer clouds, lit gold in the evening
    vec2 cp = d.xz / (e + 0.15) * 1.2 + vec2(time * 0.003, 0.0);
    float c = fbm(cp * vec2(0.8, 2.2));
    float cloud = smoothstep(0.55, 0.82, c) * smoothstep(0.0, 0.08, e) * (1.0 - smoothstep(0.4, 0.75, e)) * clouds;
    vec3 lit = mix(mix(zenith, horizon, 0.6) * 0.85 + vec3(0.12) * sunDisc, glowColor * 0.95, sunGlow * (0.25 + 0.75 * pow(towardSun, 2.0)));
    col = mix(col, lit, cloud * 0.8);
    // stars and the Milky Way, far from any town
    if (stars > 0.0 && e > 0.02) {
      vec2 sp = d.xz / (e + 0.3) * 320.0;
      vec2 cell = floor(sp);
      float h = hash(cell);
      float s = step(0.9955, h) * smoothstep(0.5, 0.0, length(fract(sp) - 0.5));
      col += vec3(0.9, 0.92, 1.0) * s * stars * (0.55 + 0.45 * sin(time * 2.0 + h * 50.0)) * (1.0 - cloud);
      float band = exp(-pow(dot(d, normalize(vec3(0.5, 0.35, -0.8))) * 3.2, 2.0));
      col += vec3(0.035, 0.038, 0.05) * band * fbm(d.xz * 9.0) * stars * (1.0 - cloud);
    }
    // the moon
    float cm = max(dot(d, moonDir), 0.0);
    col += vec3(2.2, 2.2, 2.3) * smoothstep(0.99975, 0.99985, cm) * stars;
    col += vec3(0.07, 0.085, 0.13) * pow(cm, 60.0) * stars;
    if (e < 0.0) col = hor * 0.5;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// elevation (degrees), zenith, horizon away from the sun, horizon under the
// sun, glow colour, glow strength
const KEYS = [
  [60, 0x2b5ca6, 0x9ab8d6, 0xc4d8ea, 0xfff6e8, 0.4],
  [25, 0x3262ae, 0xa4bfdc, 0xd2e0ee, 0xfff2e0, 0.5],
  [8, 0x4677b8, 0xb2c4d8, 0xf8dcb4, 0xffeccc, 0.8],
  [2, 0x34589a, 0xc29aa0, 0xffaa66, 0xffc890, 0.95],
  [-2, 0x223a78, 0x8c6c8c, 0xf08850, 0xffa070, 0.75],
  [-6, 0x121c48, 0x40406a, 0x9c5848, 0xd07050, 0.35],
  [-11, 0x070b22, 0x161a34, 0x2c2034, 0x5a3a38, 0.1],
  [-18, 0x03060f, 0x0c1022, 0x0c1022, 0x120e14, 0.0],
].map((k) => [k[0], ...k.slice(1, 5).map((c) => new THREE.Color(c)), k[5]]);

const _c = new THREE.Color();

export class Sky {
  constructor() {
    this.u = {
      sunDir: { value: new THREE.Vector3() }, moonDir: { value: new THREE.Vector3(0.42, 0.36, 0.83).normalize() },
      time: { value: 0 }, stars: { value: 0 }, clouds: { value: 1 },
      zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunHorizon: { value: new THREE.Color() },
      glowColor: { value: new THREE.Color() }, sunGlow: { value: 1 }, sunDisc: { value: 1 },
    };
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), new THREE.ShaderMaterial({
      uniforms: this.u, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;     // after the land, so only open sky is shaded
    this.state = {
      sun: new THREE.Vector3(), elev: 0, day: 1, night: 0,
      sunColor: new THREE.Color(), sunIntensity: 1, light: new THREE.Vector3(),
      skyColor: new THREE.Color(), groundColor: new THREE.Color(), hemi: 1,
      fogColor: new THREE.Color(), fogDensity: 0.0002,
    };
  }

  // h: hour of the day, 0..24
  setHour(h) {
    const { dir, elev: e } = sunAt(h);
    const u = this.u, S = this.state;
    u.sunDir.value.copy(dir);
    S.sun.copy(dir);
    S.elev = e;
    let i = 0;
    while (i < KEYS.length - 2 && e < KEYS[i + 1][0]) i++;
    const a = KEYS[i], c = KEYS[i + 1];
    const t = Math.max(0, Math.min(1, (a[0] - e) / (a[0] - c[0])));
    u.zenith.value.lerpColors(a[1], c[1], t);
    u.horizon.value.lerpColors(a[2], c[2], t);
    u.sunHorizon.value.lerpColors(a[3], c[3], t);
    u.glowColor.value.lerpColors(a[4], c[4], t);
    u.sunGlow.value = a[5] + (c[5] - a[5]) * t;
    const k = (lo, hi) => Math.max(0, Math.min(1, (e - lo) / (hi - lo)));
    u.sunDisc.value = k(-1.2, 0.6);
    u.stars.value = 1 - k(-13, -6);
    S.day = k(-4, 10);
    S.night = 1 - k(-12, -3);
    // the light on the land: the sun, warm and low in the evening; at
    // night a cold moon
    if (e > -3) {
      S.sunColor.copy(u.glowColor.value).lerp(_c.set(0xfff4e4), k(4, 30));
      S.sunIntensity = 3.0 * k(-3, 6) + 0.6 * k(6, 40);
      S.light.copy(dir);
      if (S.light.y < 0.06) S.light.y = 0.06;
    } else {
      S.sunColor.set(0x8ea6d8);
      S.sunIntensity = 0.62 * S.night;
      S.light.copy(u.moonDir.value);
    }
    S.light.normalize();
    // the sky's fill light: its colour at full strength, then dimmed
    S.skyColor.copy(u.zenith.value).lerp(u.horizon.value, 0.5);
    S.skyColor.multiplyScalar(1 / Math.max(0.001, S.skyColor.r, S.skyColor.g, S.skyColor.b));
    S.skyColor.lerp(_c.set(0xffffff), 0.35);
    S.groundColor.set(0x6a5a40).lerp(_c.set(0x101418), S.night);
    S.hemi = 0.13 + 0.35 * k(-14, -4) + 1.3 * k(-4, 20);
    // the haze: blue by day, gold in the evening, almost black at night
    S.fogColor.copy(u.horizon.value).lerp(u.sunHorizon.value, 0.25).multiplyScalar(0.8 + 0.2 * S.day);
    S.fogDensity = 0.00019 + 0.00006 * (1 - S.day) + 0.0006 * S.night;
    return S;
  }

  update(t) {
    this.u.time.value = t;
  }
}
