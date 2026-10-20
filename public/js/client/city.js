// The city at night, as seen from the 50th floor (and, in the opening, from
// the street): a sky that goes from sunset to deep night to the first grey
// of dawn, thousands of towers whose windows light up and go dark through
// the night, streets of sodium lamps with traffic crawling along the
// avenues, a river with a lit bridge, and red beacons on the tallest roofs.
//
// It lives in its own scene, drawn first with a camera whose near plane is
// metres away, so the apartment and the skyline never fight over depth.

import * as THREE from 'three';
import { makeRng } from '../shared/rng.js';

// The night clock (hours, 19.75 = 7:45 PM, 30 = 6 AM) as sun and sky.
// Not astronomy: the evening glow is stretched so there's a sunset to look
// at for the first stretch of the night, and dawn arrives right at 6.
const ELEV = [[19.5, 6], [20, 2], [20.5, -1], [21, -3.5], [21.5, -7], [22, -11], [23, -18], [28.5, -17], [29, -11], [29.5, -5], [30, 0.5]];
export function skyAt(h) {
  let d = ELEV[ELEV.length - 1][1];
  for (let i = 0; i < ELEV.length - 1; i++) {
    const [h0, e0] = ELEV[i], [h1, e1] = ELEV[i + 1];
    if (h <= h0) { d = e0; break; }
    if (h <= h1) { d = e0 + (e1 - e0) * (h - h0) / (h1 - h0); break; }
  }
  const elev = d * Math.PI / 180;
  const az = Math.PI * (h - 13) / 12;
  const sun = new THREE.Vector3(-Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev));
  // fraction of windows lit: busy in the evening, few by 4 AM
  const hh = h % 24;
  const late = h < 24 ? (h - 20) / 4 : 1 + (h - 24) / 4;
  const lit = Math.max(0.1, Math.min(0.42, 0.42 - late * 0.16)) + (h > 29 ? (h - 29) * 0.08 : 0);
  return { sun, elev, lit, hour: hh };
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
  uniform float time, stars, cityGlow;
  uniform vec3 zenith, horizon, sunHorizon, glowColor;
  uniform float sunGlow, sunDisc;
  varying vec3 vDir;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float e = d.y;
    vec2 hdir = normalize(d.xz + 1e-5);
    vec2 sflat = normalize(sunDir.xz + 1e-5);
    float towardSun = max(dot(hdir, sflat), 0.0);
    // horizon warms towards the sun; overhead fades to the zenith colour
    vec3 hor = mix(horizon, sunHorizon, pow(towardSun, 2.5));
    float up = pow(clamp(e, 0.0, 1.0), 0.45);
    vec3 col = mix(hor, zenith, up);
    // light pollution: an orange haze low over the city all night
    col += vec3(0.16, 0.085, 0.045) * cityGlow * exp(-max(e, 0.0) * 9.0);
    // the sun's glow and disc
    float cs = max(dot(d, sunDir), 0.0);
    col += glowColor * (pow(cs, 16.0) * 0.35 + pow(cs, 180.0) * 0.9) * sunGlow;
    col += vec3(4.0, 2.4, 1.2) * smoothstep(0.99955, 0.9997, cs) * sunDisc;
    // clouds: thin streaks near the horizon, lit from below by the sunset
    // and later by the city
    vec2 cp = d.xz / (e + 0.12) * 1.4 + vec2(time * 0.004, 0.0);
    float c = fbm(cp * vec2(0.7, 2.6));
    float cloud = smoothstep(0.52, 0.8, c) * smoothstep(0.0, 0.06, e) * (1.0 - smoothstep(0.35, 0.7, e));
    vec3 lit = mix(mix(zenith, horizon, 0.5) * 0.7, glowColor * 0.9, sunGlow * (0.25 + 0.75 * pow(towardSun, 2.0)));
    lit += vec3(0.07, 0.04, 0.025) * cityGlow;
    col = mix(col, lit, cloud * 0.75);
    // stars
    if (stars > 0.0 && e > 0.05) {
      vec2 sp = d.xz / (e + 0.3) * 300.0;
      vec2 cell = floor(sp);
      float h = hash(cell);
      float s = step(0.996, h) * smoothstep(0.5, 0.0, length(fract(sp) - 0.5));
      col += vec3(0.9, 0.92, 1.0) * s * stars * (0.6 + 0.4 * sin(time * 2.0 + h * 50.0)) * (1.0 - cloud);
    }
    // the moon
    float cm = max(dot(d, moonDir), 0.0);
    col += vec3(1.6, 1.62, 1.7) * smoothstep(0.99985, 0.99992, cm) * stars;
    col += vec3(0.12, 0.14, 0.2) * pow(cm, 400.0) * stars;
    // far hills below the horizon
    float hill = 0.012 + 0.012 * fbm(hdir * 6.0);
    if (e < hill) col = mix(col, hor * 0.35 + vec3(0.01), 0.85);
    if (e < 0.0) col = hor * 0.3;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const bldVert = /* glsl */`
  attribute float aSeed;
  varying vec3 vWorld;
  varying vec3 vNormal;
  flat varying float vSeed;
  void main() {
    vec4 p = instanceMatrix * vec4(position, 1.0);
    vec4 w = modelMatrix * p;
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vSeed = aSeed;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const bldFrag = /* glsl */`
  uniform vec3 sunDir, sunColor, ambient, hazeColor, hazeSun, skyRefl;
  uniform float lit, groundY, haze, time;
  varying vec3 vWorld;
  varying vec3 vNormal;
  flat varying float vSeed;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec3 n = normalize(vNormal);
    float s1 = fract(vSeed * 13.17), s2 = fract(vSeed * 71.31), s3 = fract(vSeed * 5.77);
    vec3 facade = mix(vec3(0.09, 0.095, 0.105), vec3(0.2, 0.18, 0.16), s1);
    if (s3 > 0.7) facade = vec3(0.16, 0.12, 0.1);         // brick-ish
    vec3 V = normalize(cameraPosition - vWorld);
    float dist = length(cameraPosition - vWorld);
    vec3 col;
    if (n.y > 0.5) {
      col = facade * 0.6 * (ambient + sunColor * max(sunDir.y, 0.0));
    } else {
      vec2 f = abs(n.x) > 0.5 ? vWorld.zy : vWorld.xy;
      f.y -= groundY;
      vec2 size = vec2(mix(2.2, 3.6, s2), mix(3.3, 4.1, s1));
      vec2 g = f / size + vec2(vSeed * 37.0, 0.0);
      vec2 cell = floor(g);
      vec2 fr = fract(g);
      // window shape, softened by how many pixels a window covers
      vec2 w = fwidth(g);
      float aa = max(w.x, w.y);
      vec2 inset = vec2(mix(0.1, 0.25, s3), 0.22);
      vec2 e = smoothstep(inset - aa, inset + aa, fr) * (1.0 - smoothstep(1.0 - inset * vec2(1.0, 0.4) - aa, 1.0 - inset * vec2(1.0, 0.4) + aa, fr));
      float win = e.x * e.y;
      // a mullion down the middle of each window and a transom near the top
      float mul = (1.0 - smoothstep(0.012, 0.012 + aa, abs(fr.x - 0.5))) + (1.0 - smoothstep(0.01, 0.01 + aa, abs(fr.y - 0.72)));
      win *= 1.0 - clamp(mul, 0.0, 1.0) * (1.0 - smoothstep(0.1, 0.3, aa));
      float h = hash(cell + vSeed * 17.0);
      float rowLit = hash(vec2(cell.y, vSeed * 9.0));
      float on = step(h, lit * mix(0.6, 1.4, rowLit));
      if (cell.y < 1.0) on = step(h, 0.7);
      vec3 warm = mix(vec3(2.6, 1.6, 0.8), vec3(1.6, 1.9, 2.4), step(0.78, hash(cell * 1.7 + vSeed)));
      warm *= 0.4 + 0.55 * hash(cell * 3.1);
      // dark glass reflects the sky; towards the sun it blazes
      float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
      vec3 glass = skyRefl * (0.25 + 0.75 * fres) + hazeSun * pow(max(dot(reflect(-V, n), sunDir), 0.0), 8.0) * 1.2;
      vec3 winCol = mix(glass, warm, on);
      // far away the grid is smaller than a pixel: use its average
      float far = smoothstep(0.35, 0.8, aa);
      vec3 avg = mix(glass, warm * 0.75, lit * 0.8) * 0.55 + facade * 0.45;
      vec3 sunLit = facade * (ambient + sunColor * max(dot(n, sunDir), 0.0));
      col = mix(mix(sunLit, winCol, win), avg, far);
    }
    // haze: thicker towards the horizon and brighter towards the sun
    float hz = 1.0 - exp(-dist * haze);
    vec3 hc = mix(hazeColor, hazeSun, pow(max(dot(-V, sunDir), 0.0), 3.0));
    col = mix(col, hc, hz);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const groundVert = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const groundFrag = /* glsl */`
  uniform float time, haze, block, street, riverZ, riverW, groundY, nightAmt;
  uniform vec3 hazeColor, hazeSun, sunDir, skyRefl;
  varying vec3 vWorld;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  // a row of lights along a line: d is distance across, a is along
  float lamps(float d, float a, float spacing, float r, float aa) {
    float k = abs(fract(a / spacing) - 0.5) * spacing;
    return smoothstep(r + aa, r - aa * 0.5, length(vec2(k, d)));
  }

  void main() {
    vec2 p = vWorld.xz;
    float dist = length(cameraPosition - vWorld);
    float aa = fwidth(p.x) + fwidth(p.y);
    float river = riverZ + sin(p.x * 0.0012) * 120.0;
    vec3 col;
    float inRiver = smoothstep(riverW + aa * 2.0, riverW - aa * 2.0, abs(p.y - river));
    // the street grid
    vec2 g = mod(p + block * 0.5, block);
    vec2 sd = min(g, block - g);              // distance to the nearest street centreline
    float onX = 1.0 - smoothstep(street - aa, street + aa, sd.y);
    float onZ = 1.0 - smoothstep(street - aa, street + aa, sd.x);
    float roads = max(onX, onZ);
    vec3 blockCol = vec3(0.022, 0.024, 0.026);
    vec3 roadCol = vec3(0.03, 0.03, 0.032);
    col = mix(blockCol, roadCol, roads);
    // sodium lamps along every street, lights spilling on the asphalt
    float lampAA = aa * 0.6 + 0.4;
    float l = 0.0;
    l += lamps(sd.y - street * 0.8, p.x, 34.0, 0.9, lampAA) * onX;
    l += lamps(sd.x - street * 0.8, p.y, 34.0, 0.9, lampAA) * onZ;
    col += vec3(2.2, 1.2, 0.45) * l * nightAmt;
    col += vec3(0.14, 0.08, 0.03) * roads * nightAmt;
    // traffic: headlights one way, tail lights the other, on the avenues
    vec2 av = mod(p + block * 0.5, block * 4.0);
    vec2 ad = min(av, block * 4.0 - av);
    float avX = 1.0 - step(street * 1.2, ad.y);
    float avZ = 1.0 - step(street * 1.2, ad.x);
    float laneX = floor((p.y + block * 0.5) / (block * 4.0));
    float laneZ = floor((p.x + block * 0.5) / (block * 4.0));
    float spd = 11.0;
    float ax = p.x + time * spd * (ad.y < street * 0.5 ? 1.0 : -1.0) + hash(vec2(laneX, 1.0)) * 300.0;
    float az = p.y + time * spd * (ad.x < street * 0.5 ? 1.0 : -1.0) + hash(vec2(laneZ, 2.0)) * 300.0;
    float carX = lamps(abs(ad.y - street * 0.5) - street * 0.25, ax + floor(ax / 23.0) * 7.0, 23.0, 0.8, lampAA) * avX;
    float carZ = lamps(abs(ad.x - street * 0.5) - street * 0.25, az + floor(az / 23.0) * 7.0, 23.0, 0.8, lampAA) * avZ;
    vec3 head = vec3(2.4, 2.3, 2.0), tail = vec3(2.4, 0.2, 0.1);
    col += (ad.y < street * 0.5 ? head : tail) * carX;
    col += (ad.x < street * 0.5 ? head : tail) * carZ;
    // water: dark, reflecting the sky and the lights on the far bank
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(V.y, 0.0), 4.0);
    float ripple = 0.5 + 0.5 * sin(p.x * 0.09 + time * 0.6 + sin(p.y * 0.05) * 3.0);
    vec3 water = skyRefl * (0.25 + 0.65 * fres) + hazeSun * pow(max(dot(reflect(-V, vec3(0, 1, 0)), sunDir), 0.0), 30.0) * 2.0 * (0.6 + 0.4 * ripple);
    water += vec3(1.2, 0.7, 0.3) * nightAmt * 0.05 * step(0.93, hash(floor(p * vec2(0.02, 0.4)))) * ripple;
    col = mix(col, water, inRiver);
    float hz = 1.0 - exp(-dist * haze);
    vec3 hc = mix(hazeColor, hazeSun, pow(max(dot(-V, sunDir), 0.0), 3.0));
    col = mix(col, hc, hz);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const pointsVert = /* glsl */`
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float time, scale;
  varying vec3 vColor;
  varying float vOn;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vColor = aColor;
    vOn = aPhase < 0.0 ? 1.0 : step(0.55, fract(time * 0.5 + aPhase));
    gl_PointSize = scale / -mv.z;
    gl_PointSize = clamp(gl_PointSize, 1.5, 24.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const pointsFrag = /* glsl */`
  varying vec3 vColor;
  varying float vOn;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * a * vOn, 1.0);
  }
`;

export const BLOCK = 92, STREET = 9;
const RIVER_Z = 520, RIVER_W = 150;
const DOWNTOWN = { x: -1100, z: 260 };

export class City {
  // groundY: where street level is in this scene; exclude: radius around
  // the origin kept clear (our own tower and its plaza)
  constructor({ groundY = -150, exclude = 70, tower = false } = {}) {
    const group = (this.group = new THREE.Group());
    this.groundY = groundY;
    const rng = makeRng('city');

    // ---------------------------------------------------------- sky
    this.skyU = {
      sunDir: { value: new THREE.Vector3(-1, 0.05, 0) }, moonDir: { value: new THREE.Vector3(0.35, 0.42, 0.84).normalize() },
      time: { value: 0 }, stars: { value: 0 }, cityGlow: { value: 0 },
      zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunHorizon: { value: new THREE.Color() },
      glowColor: { value: new THREE.Color() }, sunGlow: { value: 1 }, sunDisc: { value: 1 },
    };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(7000, 48, 24), new THREE.ShaderMaterial({
      uniforms: this.skyU, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false,
    }));
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    group.add(sky);

    // ---------------------------------------------------------- towers
    const shared = {
      sunDir: this.skyU.sunDir, time: this.skyU.time,
      sunColor: { value: new THREE.Color() }, ambient: { value: new THREE.Color() },
      hazeColor: { value: new THREE.Color() }, hazeSun: { value: new THREE.Color() }, skyRefl: { value: new THREE.Color() },
      lit: { value: 0.5 }, groundY: { value: groundY }, haze: { value: 0.00035 },
    };
    this.u = shared;
    const boxes = [];
    const add = (x, z, w, d, h, seed) => boxes.push({ x, z, w, d, h, seed });
    const R = 3400;
    for (let bx = -R; bx <= R; bx += BLOCK) {
      for (let bz = -R; bz <= R; bz += BLOCK) {
        const cx = bx, cz = bz;
        if (Math.hypot(cx, cz) > R) continue;
        const river = RIVER_Z + Math.sin(cx * 0.0012) * 120;
        if (Math.abs(cz - river) < RIVER_W + BLOCK * 0.6) continue;
        if (Math.abs(cx) < exclude + BLOCK * 0.5 && Math.abs(cz) < exclude + BLOCK * 0.5) continue;
        if (rng() < 0.05) continue;  // a park or a parking lot
        const dd = Math.hypot(cx - DOWNTOWN.x, cz - DOWNTOWN.z);
        const tall = 260 * Math.exp(-(dd * dd) / (650 * 650)) + 120 * Math.exp(-((cx - 900) ** 2 + (cz + 1400) ** 2) / (500 * 500));
        const inner = BLOCK - STREET * 2 - 4;
        const split = rng() < 0.55 ? 2 : 1;
        for (let i = 0; i < split; i++) for (let j = 0; j < split; j++) {
          if (split === 2 && rng() < 0.2) continue;
          const w = inner / split - 3 - rng() * 8, d = inner / split - 3 - rng() * 8;
          const x = cx - inner / 2 + (i + 0.5) * (inner / split), z = cz - inner / 2 + (j + 0.5) * (inner / split);
          let h = 14 + rng() * 40 + tall * (0.4 + rng() * 0.9);
          if (Math.hypot(x, z) < 400) h = Math.min(h, 40 + rng() * 80);  // the neighbours are shorter than us
          const seed = rng();
          add(x, z, w, d, h, seed);
          // setbacks on tall towers
          if (h > 90 && rng() < 0.6) add(x, z, w * 0.7, d * 0.7, h + 10 + rng() * h * 0.3, seed);
          if (h > 140 && rng() < 0.5) add(x, z, w * 0.4, d * 0.4, h + 25 + rng() * 40, seed);
        }
      }
    }
    // a few neighbours right next door that we look down onto
    for (const [x, z, w, d, h] of [[-75, 30, 40, 50, 62], [-80, -60, 36, 36, 95], [60, 95, 50, 40, 48], [-40, 110, 34, 30, 120], [110, -40, 40, 50, 80]]) {
      if (!tower) add(x, z, w, d, h, rng());
    }
    this.boxes = boxes;

    this.bldMat = new THREE.ShaderMaterial({ uniforms: shared, vertexShader: bldVert, fragmentShader: bldFrag });
    const mesh = this.buildings(boxes);
    group.add(mesh);
    this.towers = mesh;

    // ---------------------------------------------------------- ground
    this.groundU = {
      time: this.skyU.time, haze: shared.haze, block: { value: BLOCK }, street: { value: STREET },
      riverZ: { value: RIVER_Z }, riverW: { value: RIVER_W }, groundY: { value: groundY }, nightAmt: { value: 1 },
      hazeColor: shared.hazeColor, hazeSun: shared.hazeSun, sunDir: shared.sunDir, skyRefl: shared.skyRefl,
    };
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.ShaderMaterial({ uniforms: this.groundU, vertexShader: groundVert, fragmentShader: groundFrag }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = groundY;
    group.add(ground);

    // ---------------------------------------------------------- the bridge
    const bridgeX = -520;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(26, 4, RIVER_W * 2 + 160), new THREE.MeshBasicMaterial({ color: 0x0c0d10 }));
    deck.position.set(bridgeX, groundY + 22, RIVER_Z + Math.sin(bridgeX * 0.0012) * 120);
    group.add(deck);
    for (const s of [-1, 1]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(8, 90, 8), new THREE.MeshBasicMaterial({ color: 0x0d0e12 }));
      tower.position.set(bridgeX, groundY + 45, deck.position.z + s * 95);
      group.add(tower);
    }
    this.bridge = { x: bridgeX, z: deck.position.z, y: groundY + 24 };

    // ---------------------------------------------------------- lights
    // beacons on the tallest roofs, and the bridge's necklace of lamps
    const pts = [], phase = [], color = [];
    for (const b of boxes) {
      if (b.h > 150 && rng() < 0.8) { pts.push(b.x, groundY + b.h + 2, b.z); phase.push(rng()); color.push(3.5, 0.15, 0.1); }
    }
    for (let k = -1; k <= 1.001; k += 0.04) {
      for (const sd of [-1, 1]) {
        pts.push(bridgeX + sd * 12, groundY + 25, this.bridge.z + k * (RIVER_W + 80));
        phase.push(-1); color.push(2.6, 1.8, 1.0);
      }
    }
    // lamps strung along the suspension cables, sagging between the towers
    for (let k = -1; k <= 1.001; k += 0.05) {
      for (const sd of [-1, 1]) {
        pts.push(bridgeX + sd * 12, groundY + 26 + 64 * k * k, this.bridge.z + k * 95);
        phase.push(-1); color.push(2.0, 2.2, 2.6);
      }
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    pg.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
    pg.setAttribute('aColor', new THREE.Float32BufferAttribute(color, 3));
    this.pointsU = { time: this.skyU.time, scale: { value: 900 } };
    const points = new THREE.Points(pg, new THREE.ShaderMaterial({
      uniforms: this.pointsU, vertexShader: pointsVert, fragmentShader: pointsFrag,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    points.frustumCulled = false;
    group.add(points);

    this.setHour(20);
  }

  // Towers as one instanced mesh with the window shader. Boxes stand on
  // { x, y0 (default street level), z } and are { w, d, h } big.
  buildings(boxes) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const seeds = new Float32Array(boxes.length);
    const mesh = new THREE.InstancedMesh(geo, this.bldMat, boxes.length);
    const m = new THREE.Matrix4();
    boxes.forEach((b, i) => {
      m.makeScale(b.w, b.h, b.d);
      m.setPosition(b.x, b.y0 ?? this.groundY, b.z);
      mesh.setMatrixAt(i, m);
      seeds[i] = b.seed;
    });
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    mesh.frustumCulled = false;
    return mesh;
  }

  // h: hours on the night clock (19.75 .. 30)
  setHour(h) {
    const S = skyAt(h);
    this.state = S;
    const e = S.elev * 180 / Math.PI;                 // degrees
    const u = this.skyU, b = this.u;
    u.sunDir.value.copy(S.sun);
    const k = (a, c) => Math.max(0, Math.min(1, (e - a) / (c - a)));
    // colour keys from day (sun at +8 degrees) down to full night (-18)
    const keys = [
      // elevation, zenith, horizon away from the sun, horizon under it, glow, glow strength
      [8, 0x4f7fc0, 0xb8c8dc, 0xffe2b8, 0xfff0d0, 0.8],
      [2, 0x34589a, 0xc89aa2, 0xffaa66, 0xffc890, 0.9],
      [-2, 0x223a78, 0x9a7090, 0xf08850, 0xffa070, 0.7],
      [-6, 0x121c48, 0x4e4268, 0xa8584c, 0xd07050, 0.35],
      [-11, 0x070b22, 0x201c38, 0x3c2636, 0x6a3a38, 0.1],
      [-18, 0x03050c, 0x0b0b15, 0x0d0b15, 0x201010, 0.0],
    ];
    let i = 0;
    while (i < keys.length - 2 && e < keys[i + 1][0]) i++;
    const a = keys[i], c = keys[i + 1];
    const t = Math.max(0, Math.min(1, (a[0] - e) / (a[0] - c[0])));
    const mix = (j) => new THREE.Color(a[j]).lerp(new THREE.Color(c[j]), t);
    u.zenith.value.copy(mix(1));
    u.horizon.value.copy(mix(2));
    u.sunHorizon.value.copy(mix(3));
    u.glowColor.value.copy(mix(4));
    u.sunGlow.value = a[5] + (c[5] - a[5]) * t;
    u.sunDisc.value = k(-1.5, 0.5);
    u.stars.value = 1 - k(-14, -7);
    const night = 1 - k(-6, 4);
    u.cityGlow.value = 0.25 + night * 0.85;
    // towers: lit by the low sun, then only by their windows
    b.sunColor.value.copy(u.glowColor.value).multiplyScalar(1.6 * k(-2, 4));
    b.ambient.value.copy(u.zenith.value).multiplyScalar(0.6).add(new THREE.Color(0.012, 0.012, 0.016));
    b.hazeColor.value.copy(u.horizon.value).multiplyScalar(0.85);
    b.hazeSun.value.copy(u.sunHorizon.value).multiplyScalar(0.9);
    b.skyRefl.value.copy(u.horizon.value).lerp(u.zenith.value, 0.4);
    b.lit.value = S.lit;
    this.groundU.nightAmt.value = 0.3 + 0.7 * night;
    this.nightAmt = night;
    return S;
  }

  update(t) {
    this.skyU.time.value = t;
  }
}
