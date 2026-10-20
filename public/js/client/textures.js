// Every texture in the game is painted onto a canvas at start-up: there are
// no image files to download.

import * as THREE from 'three';
import { makeRng } from '../shared/rng.js';

const cache = new Map();

// Textures are painted in "design" pixels and stored at twice that size so
// they stay sharp up close.
const SCALE = 2;
function canvas(w, h, scale = SCALE) {
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  const x = c.getContext('2d');
  x.scale(scale, scale);
  return [c, x];
}

function toTexture(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// a copy of a cached texture with its own repeat
export function tiled(tex, rx, ry) {
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

// per-pixel brightness noise
function grain(ctx, amount, rng) {
  const img = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function blotch(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace('A', alpha));
  g.addColorStop(1, color.replace('A', 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}






export const wood = (tone = '#8a5a35', key = 'wood') => cached(key, () => {
  const S = 256, rng = makeRng(key);
  const [c, x] = canvas(S, S);
  x.fillStyle = tone;
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 110; k++) {
    const y = rng() * S;
    x.strokeStyle = `rgba(40,20,5,${0.03 + rng() * 0.07})`;
    x.lineWidth = 0.5 + rng() * 1.2;
    x.beginPath();
    x.moveTo(0, y);
    for (let i = 0; i <= S; i += 32) x.lineTo(i, y + Math.sin(i * 0.03 + k) * 1.4);
    x.stroke();
  }
  grain(x, 10, rng);
  return toTexture(c);
});

export const fabric = () => cached('fabric', () => {
  const S = 128, rng = makeRng('fabric');
  const [c, x] = canvas(S, S);
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 2) {
    x.fillStyle = 'rgba(0,0,0,0.045)';
    x.fillRect(i, 0, 1, S);
    x.fillRect(0, i, S, 1);
  }
  grain(x, 14, rng);
  return toTexture(c);
});







export function sign(text, { w = 512, h = 128, bg = '#1d3b2a', fg = '#f2f0e6', font = 'bold 64px Arial, sans-serif', border = null } = {}) {
  return cached(`sign:${text}:${bg}:${fg}:${w}x${h}:${font}`, () => {
    const [c, x] = canvas(w, h);
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
    if (border) {
      x.strokeStyle = border;
      x.lineWidth = 8;
      x.strokeRect(6, 6, w - 12, h - 12);
    }
    x.fillStyle = fg;
    x.font = font;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const lines = text.split('\n');
    lines.forEach((ln, i) => x.fillText(ln, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (h / (lines.length + 0.6))));
    return toTexture(c, { repeat: false });
  });
}




// a radial glow for light sprites
export const glow = () => cached('glow', () => {
  const S = 64;
  const [c, x] = canvas(S, S, 1);
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return toTexture(c, { repeat: false });
});

// ------------------------------------------------------------ the forest --
// needles, twigs and dust under the trees; neutral so vertex colours tint it
export const forestFloor = () => cached('forestFloor', () => {
  const S = 256, rng = makeRng('floor');
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = '#b8b0a0';
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 14; k++) blotch(x, rng() * S, rng() * S, 20 + rng() * 50, 'rgba(60,50,35,A)', 0.25);
  for (let k = 0; k < 2600; k++) {
    const px = rng() * S, py = rng() * S, a = rng() * Math.PI, l = 2 + rng() * 7;
    x.strokeStyle = rng() < 0.6 ? `rgba(70,50,30,${0.25 + rng() * 0.4})` : `rgba(230,215,180,${0.2 + rng() * 0.3})`;
    x.lineWidth = 0.6;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
    x.stroke();
  }
  for (let k = 0; k < 60; k++) { x.fillStyle = `rgba(110,105,95,${0.4 + rng() * 0.4})`; x.beginPath(); x.ellipse(rng() * S, rng() * S, 1 + rng() * 3, 1 + rng() * 2, rng() * 3, 0, Math.PI * 2); x.fill(); }
  grain(x, 18, rng);
  return toTexture(c);
});

// the forest seen from far above: crowns crowded together
export const canopy = () => cached('canopy', () => {
  const S = 256, rng = makeRng('canopy');
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = '#7a8a70';
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 900; k++) {
    const px = rng() * S, py = rng() * S, r = 2 + rng() * 5;
    const g = x.createRadialGradient(px - r * 0.3, py - r * 0.3, 0, px, py, r);
    const v = 150 + rng() * 80;
    g.addColorStop(0, `rgba(${v},${v + 10},${v - 20},0.9)`);
    g.addColorStop(1, 'rgba(20,30,15,0.9)');
    x.fillStyle = g;
    x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    for (const [dx, dy] of [[S, 0], [-S, 0], [0, S], [0, -S]]) { x.beginPath(); x.arc(px + dx, py + dy, r, 0, Math.PI * 2); x.fill(); }
  }
  return toTexture(c);
});

// a dirt road: ruts, gravel and dust
export const dirt = () => cached('dirt', () => {
  const W = 128, H = 256, rng = makeRng('dirt');
  const [c, x] = canvas(W, H, 1);
  x.fillStyle = '#a89878';
  x.fillRect(0, 0, W, H);
  for (const u of [0.28, 0.72]) {
    const g = x.createLinearGradient((u - 0.12) * W, 0, (u + 0.12) * W, 0);
    g.addColorStop(0, 'rgba(70,55,40,0)'); g.addColorStop(0.5, 'rgba(70,55,40,0.35)'); g.addColorStop(1, 'rgba(70,55,40,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  }
  for (let k = 0; k < 2200; k++) { x.fillStyle = rng() < 0.5 ? `rgba(60,50,40,${rng() * 0.5})` : `rgba(230,220,200,${rng() * 0.4})`; x.fillRect(rng() * W, rng() * H, 1 + rng() * 2, 1 + rng() * 2); }
  grain(x, 20, rng);
  return toTexture(c);
});

// boards on a wall, painted long ago
export const siding = (tint = '#d8d2c0', key = 'siding') => cached(key, () => {
  const W = 256, H = 256, rng = makeRng(key);
  const [c, x] = canvas(W, H, 1);
  x.fillStyle = tint;
  x.fillRect(0, 0, W, H);
  for (let i = 0; i < 8; i++) {
    x.fillStyle = 'rgba(40,30,20,0.35)';
    x.fillRect(0, i * 32, W, 2);
    x.fillStyle = 'rgba(255,255,255,0.12)';
    x.fillRect(0, i * 32 + 2, W, 2);
  }
  for (let k = 0; k < 120; k++) { x.strokeStyle = `rgba(60,45,30,${0.04 + rng() * 0.08})`; x.beginPath(); const y = rng() * H; x.moveTo(0, y); x.lineTo(W, y + (rng() - 0.5) * 3); x.stroke(); }
  for (let k = 0; k < 18; k++) blotch(x, rng() * W, rng() * H, 10 + rng() * 30, 'rgba(90,70,45,A)', 0.18);
  grain(x, 14, rng);
  return toTexture(c);
});

// grey, weathered deck boards running along v
export const deck = () => cached('deck', () => {
  const W = 256, H = 256, rng = makeRng('deck');
  const [c, x] = canvas(W, H, 1);
  const n = 6, bw = W / n;
  for (let i = 0; i < n; i++) {
    const v = 120 + rng() * 30;
    x.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
    x.fillRect(i * bw, 0, bw, H);
    for (let k = 0; k < 20; k++) { x.strokeStyle = `rgba(40,30,20,${0.08 + rng() * 0.1})`; x.beginPath(); const gx = i * bw + rng() * bw; x.moveTo(gx, 0); x.lineTo(gx + (rng() - 0.5) * 4, H); x.stroke(); }
    x.fillStyle = 'rgba(20,14,8,0.6)';
    x.fillRect(i * bw, 0, 2, H);
  }
  grain(x, 18, rng);
  return toTexture(c);
});

// steel grating for the stair landings (cut-outs are see-through)
export const grating = () => cached('grating', () => {
  const S = 64;
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = '#000';
  x.fillRect(0, 0, S, S);
  x.fillStyle = '#fff';
  for (let i = 0; i < 4; i++) x.fillRect(i * 16, 0, 3, S);
  for (let j = 0; j < 8; j++) x.fillRect(0, j * 8, S, 2);
  return toTexture(c, { srgb: false });
});

// a corrugated metal roof
export const roofing = () => cached('roofing', () => {
  const W = 128, H = 128, rng = makeRng('roof');
  const [c, x] = canvas(W, H, 1);
  for (let i = 0; i < W; i++) {
    const v = 100 + 40 * Math.sin((i / W) * Math.PI * 16);
    x.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
    x.fillRect(i, 0, 1, H);
  }
  for (let k = 0; k < 10; k++) blotch(x, rng() * W, rng() * H, 8 + rng() * 20, 'rgba(110,60,30,A)', 0.25);
  grain(x, 12, rng);
  return toTexture(c);
});

// a soft puff for smoke and dust
export const puff = () => cached('puff', () => {
  const S = 128, rng = makeRng('puff');
  const [c, x] = canvas(S, S, 1);
  for (let k = 0; k < 40; k++) {
    const px = S / 2 + (rng() - 0.5) * S * 0.45, py = S / 2 + (rng() - 0.5) * S * 0.45, r = S * (0.12 + rng() * 0.2);
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
  }
  return toTexture(c, { repeat: false });
});

// ------------------------------------------------------------ the lookout --
// the fire finder's map: the country round the peak, with the compass
// ring (0 at the top is north, 90 east)
export const finderMap = () => cached('finderMap', () => {
  const S = 512, rng = makeRng('finder');
  const [c, x] = canvas(S, S, 1);
  const cx = S / 2, R = S / 2;
  x.fillStyle = '#e8dfc6';
  x.fillRect(0, 0, S, S);
  for (let k = 1; k < 14; k++) {
    x.strokeStyle = `rgba(140,100,60,${k % 4 === 0 ? 0.55 : 0.25})`;
    x.lineWidth = k % 4 === 0 ? 1.6 : 0.8;
    x.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2, r = k * 16 * (1 + 0.12 * Math.sin(a * 3 + k) + 0.06 * Math.sin(a * 7 - k * 2));
      const px = cx + Math.cos(a) * r, py = cx + Math.sin(a) * r;
      if (i) x.lineTo(px, py); else x.moveTo(px, py);
    }
    x.stroke();
  }
  x.strokeStyle = 'rgba(40,90,150,0.6)';
  x.lineWidth = 1.5;
  for (let k = 0; k < 5; k++) {
    let a = rng() * Math.PI * 2, r = 50 + rng() * 40;
    x.beginPath();
    x.moveTo(cx + Math.cos(a) * r, cx + Math.sin(a) * r);
    for (let i = 0; i < 10; i++) { r += 18; a += (rng() - 0.5) * 0.3; x.lineTo(cx + Math.cos(a) * r, cx + Math.sin(a) * r); }
    x.stroke();
  }
  x.strokeStyle = 'rgba(170,40,30,0.7)';
  x.setLineDash([6, 4]);
  x.beginPath();
  x.moveTo(cx + 4, cx + 6);
  x.bezierCurveTo(cx + 30, cx + 80, cx + 10, cx + 150, cx + 70, cx + 240);
  x.stroke();
  x.setLineDash([]);
  // the compass ring
  x.fillStyle = '#2a2014';
  x.strokeStyle = '#2a2014';
  x.font = 'bold 22px Georgia, serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 5) {
    const a = (d * Math.PI) / 180, l = d % 30 === 0 ? 22 : d % 10 === 0 ? 14 : 8;
    x.lineWidth = d % 30 === 0 ? 2.5 : 1.2;
    x.beginPath();
    x.moveTo(cx + Math.sin(a) * (R - 4), cx - Math.cos(a) * (R - 4));
    x.lineTo(cx + Math.sin(a) * (R - 4 - l), cx - Math.cos(a) * (R - 4 - l));
    x.stroke();
    if (d % 30 === 0) x.fillText(d === 0 ? 'N' : String(d), cx + Math.sin(a) * (R - 44), cx - Math.cos(a) * (R - 44));
  }
  x.beginPath();
  x.arc(cx, cx, 5, 0, Math.PI * 2);
  x.fill();
  grain(x, 10, rng);
  return toTexture(c, { repeat: false });
});

// a night photo from the trail camera's card, or one of his: grainy grey,
// a timestamp in the corner, maybe somebody in it
export function photo(seed, { stamp = '', figure = null, tower = true, tint = '#c8c8c0' } = {}) {
  return cached(`photo:${seed}:${stamp}:${figure}`, () => {
    const W = 200, H = 240, rng = makeRng(`photo${seed}`);
    const [c, x] = canvas(W, H, 1);
    x.fillStyle = '#f4f0e6';
    x.fillRect(0, 0, W, H);
    const g = x.createLinearGradient(0, 10, 0, 190);
    g.addColorStop(0, '#1a1c1a');
    g.addColorStop(1, '#3a3c36');
    x.fillStyle = g;
    x.fillRect(10, 10, W - 20, 180);
    x.fillStyle = 'rgba(10,12,10,0.9)';
    for (let i = 0; i < 9; i++) { const px = 10 + rng() * 180; x.beginPath(); x.moveTo(px - 12, 190); x.lineTo(px, 60 + rng() * 50); x.lineTo(px + 12, 190); x.fill(); }
    if (tower) {
      x.strokeStyle = 'rgba(160,160,150,0.8)';
      x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(80, 190); x.lineTo(92, 70); x.moveTo(120, 190); x.lineTo(108, 70); x.stroke();
      x.fillStyle = 'rgba(150,150,140,0.85)';
      x.fillRect(84, 52, 32, 20);
    }
    if (figure) {
      const [fx, fy, fs] = figure;
      x.fillStyle = tint;
      x.beginPath(); x.ellipse(fx, fy, 6 * fs, 7 * fs, 0, 0, Math.PI * 2); x.fill();
      x.fillRect(fx - 7 * fs, fy + 6 * fs, 14 * fs, 34 * fs);
      x.fillStyle = 'rgba(255,255,255,0.9)';
      x.fillRect(fx - 3 * fs, fy - 1 * fs, 1.6 * fs, 1.2 * fs);
      x.fillRect(fx + 1.5 * fs, fy - 1 * fs, 1.6 * fs, 1.2 * fs);
    }
    const img = x.getImageData(10, 10, 180, 180);
    for (let i = 0; i < img.data.length; i += 4) { const n = (rng() - 0.5) * 50; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
    x.putImageData(img, 10, 10);
    x.fillStyle = '#3a3a3a';
    x.font = '14px "Courier New", monospace';
    x.fillText(stamp, 16, 214);
    return toTexture(c, { repeat: false });
  });
}

// the note on the clipboard: what dispatch said to ask for
export function codeNote(word) {
  const [c, x] = canvas(256, 340, 1);
  x.fillStyle = '#5a4a32';
  x.fillRect(0, 0, 256, 340);
  x.fillStyle = '#f2eee2';
  x.fillRect(14, 30, 228, 300);
  x.fillStyle = '#9a9a96';
  x.fillRect(90, 8, 76, 34);
  x.fillStyle = '#2a2a6a';
  x.font = '22px "Comic Sans MS", "Segoe Print", cursive';
  x.fillText('Dispatch ch. 4', 30, 80);
  x.fillText('Check in 8am', 30, 112);
  if (word) {
    x.fillText('Code word:', 30, 170);
    x.font = 'bold 34px "Comic Sans MS", "Segoe Print", cursive';
    x.fillText(word, 30, 214);
    x.strokeStyle = '#2a2a6a';
    x.lineWidth = 2;
    x.strokeRect(24, 180, 200, 46);
  }
  return toTexture(c, { repeat: false });
}
