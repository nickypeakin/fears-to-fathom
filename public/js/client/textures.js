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

// ---------------------------------------------------------- surfaces ----
// painted plaster: almost flat, a little uneven
export const paint = (tint = '#e9e4da', key = 'paint') => cached(key, () => {
  const S = 128, rng = makeRng(key);
  const [c, x] = canvas(S, S);
  x.fillStyle = tint;
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 6; k++) blotch(x, rng() * S, rng() * S, 30 + rng() * 40, 'rgba(120,110,90,A)', 0.03);
  grain(x, 6, rng);
  return toTexture(c);
});

// oak planks, 4 per tile, running along the texture's v
export const oakFloor = () => cached('oakFloor', () => {
  const W = 256, H = 512, rng = makeRng('oak');
  const [c, x] = canvas(W, H);
  const tones = ['#9a6e45', '#a77a4e', '#8f6440', '#b0845a', '#966a43'];
  const pw = W / 4;
  for (let i = 0; i < 4; i++) {
    let y = -rng() * H;
    while (y < H) {
      const len = 180 + rng() * 260;
      x.fillStyle = tones[Math.floor(rng() * tones.length)];
      x.fillRect(i * pw, y, pw, len);
      // grain lines
      for (let k = 0; k < 14; k++) {
        const gx = i * pw + 3 + rng() * (pw - 6);
        x.strokeStyle = `rgba(60,35,15,${0.06 + rng() * 0.12})`;
        x.lineWidth = 0.6 + rng() * 1.2;
        x.beginPath();
        x.moveTo(gx, y);
        for (let t = 0; t <= len; t += 20) x.lineTo(gx + Math.sin(t * 0.02 + k) * 2.2, y + t);
        x.stroke();
      }
      if (rng() < 0.5) blotch(x, i * pw + pw / 2, y + rng() * len, 10 + rng() * 10, 'rgba(70,40,15,A)', 0.25);
      x.fillStyle = 'rgba(30,18,8,0.55)';
      x.fillRect(i * pw, y, pw, 1.2);
      y += len;
    }
    x.fillStyle = 'rgba(30,18,8,0.5)';
    x.fillRect(i * pw, 0, 1.2, H);
  }
  grain(x, 10, rng);
  return toTexture(c);
});

export const tiles = (tint = '#dcdcd6', key = 'tiles', n = 4) => cached(key, () => {
  const S = 256, rng = makeRng(key);
  const [c, x] = canvas(S, S);
  x.fillStyle = '#9a9a94';
  x.fillRect(0, 0, S, S);
  const t = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = (rng() - 0.5) * 10;
    const col = new THREE.Color(tint).offsetHSL(0, 0, v / 255);
    x.fillStyle = `#${col.getHexString()}`;
    x.fillRect(i * t + 1.5, j * t + 1.5, t - 3, t - 3);
    const g = x.createLinearGradient(i * t, j * t, i * t + t, j * t + t);
    g.addColorStop(0, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0.05)');
    x.fillStyle = g;
    x.fillRect(i * t + 1.5, j * t + 1.5, t - 3, t - 3);
  }
  grain(x, 6, rng);
  return toTexture(c);
});

// hotel-style corridor carpet: a dark ground with a repeating lattice
export const corridorCarpet = () => cached('corridorCarpet', () => {
  const S = 256, rng = makeRng('ccarpet');
  const [c, x] = canvas(S, S);
  x.fillStyle = '#3a2326';
  x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(176,138,84,0.55)';
  x.lineWidth = 2;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
    const cx = i * 64, cy = j * 64;
    x.beginPath();
    x.moveTo(cx, cy - 20); x.lineTo(cx + 20, cy); x.lineTo(cx, cy + 20); x.lineTo(cx - 20, cy); x.closePath();
    x.stroke();
    x.fillStyle = 'rgba(120,60,50,0.6)';
    x.beginPath(); x.arc(cx + 32, cy + 32, 6, 0, Math.PI * 2); x.fill();
  }
  for (let k = 0; k < 6000; k++) {
    x.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,220,200,0.06)';
    x.fillRect(rng() * S, rng() * S, 1, 1);
  }
  grain(x, 14, rng);
  return toTexture(c);
});

// corridor wallpaper: soft vertical stripes over a damask-like motif
export const wallpaper = () => cached('wallpaper', () => {
  const S = 256, rng = makeRng('wallpaper');
  const [c, x] = canvas(S, S);
  x.fillStyle = '#b9ad94';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 32) {
    x.fillStyle = 'rgba(255,245,220,0.12)';
    x.fillRect(i, 0, 16, S);
  }
  x.strokeStyle = 'rgba(110,90,60,0.22)';
  x.lineWidth = 1.4;
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    const cx = col * 64 + (row % 2 ? 48 : 16), cy = row * 64 + 32;
    x.beginPath();
    x.ellipse(cx, cy, 9, 16, 0, 0, Math.PI * 2);
    x.moveTo(cx, cy - 22); x.lineTo(cx, cy + 22);
    x.stroke();
  }
  grain(x, 8, rng);
  return toTexture(c);
});

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

export const rugPattern = (color) => cached(`rug${color}`, () => {
  const S = 256, rng = makeRng(`rug${color}`);
  const [c, x] = canvas(S, S);
  const base = new THREE.Color(color);
  x.fillStyle = `#${base.getHexString()}`;
  x.fillRect(0, 0, S, S);
  const light = base.clone().lerp(new THREE.Color(0xf0e6d0), 0.45);
  x.strokeStyle = `#${light.getHexString()}`;
  x.lineWidth = 6;
  x.strokeRect(14, 14, S - 28, S - 28);
  x.lineWidth = 2;
  x.strokeRect(28, 28, S - 56, S - 56);
  for (let k = 0; k < 9000; k++) {
    x.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.06)';
    x.fillRect(rng() * S, rng() * S, 1.5, 1.5);
  }
  grain(x, 18, rng);
  return toTexture(c, { repeat: false });
});

export const marble = () => cached('marble', () => {
  const S = 256, rng = makeRng('marble');
  const [c, x] = canvas(S, S);
  x.fillStyle = '#e6e2da';
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 26; k++) {
    x.strokeStyle = `rgba(110,100,95,${0.05 + rng() * 0.18})`;
    x.lineWidth = 0.6 + rng() * 1.6;
    x.beginPath();
    let px = rng() * S, py = rng() * S;
    x.moveTo(px, py);
    for (let i = 0; i < 12; i++) { px += (rng() - 0.3) * 30; py += (rng() - 0.5) * 30; x.lineTo(px, py); }
    x.stroke();
  }
  x.strokeStyle = 'rgba(80,75,70,0.35)';
  x.lineWidth = 1;
  x.strokeRect(0, 0, S, S);
  grain(x, 6, rng);
  return toTexture(c);
});

export const asphalt = () => cached('asphalt', () => {
  const S = 256, rng = makeRng('asphalt');
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = '#2b2b2d';
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 9000; k++) {
    x.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.08)';
    x.fillRect(rng() * S, rng() * S, 1, 1);
  }
  for (let k = 0; k < 6; k++) blotch(x, rng() * S, rng() * S, 30 + rng() * 40, 'rgba(0,0,0,A)', 0.2);
  return toTexture(c);
});

export const pavers = () => cached('pavers', () => {
  const S = 256, rng = makeRng('pavers');
  const [c, x] = canvas(S, S, 1);
  x.fillStyle = '#5a5854';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const v = 120 + Math.floor(rng() * 20);
    x.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
    x.fillRect(i * 64 + 1, j * 64 + 1, 62, 62);
  }
  grain(x, 16, rng);
  return toTexture(c);
});

export const brushed = () => cached('brushed', () => {
  const W = 256, H = 64, rng = makeRng('brushed');
  const [c, x] = canvas(W, H, 1);
  x.fillStyle = '#b4b6b8';
  x.fillRect(0, 0, W, H);
  for (let k = 0; k < 500; k++) {
    x.fillStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '0,0,0'},${0.04 + rng() * 0.06})`;
    x.fillRect(0, rng() * H, W, 0.6);
  }
  return toTexture(c);
});

export const books = () => cached('books', () => {
  const W = 256, H = 64, rng = makeRng('books');
  const [c, x] = canvas(W, H);
  x.fillStyle = '#2a2018';
  x.fillRect(0, 0, W, H);
  const colors = ['#7a2b22', '#2b4a6b', '#3d5a35', '#c9b27a', '#5b3b5e', '#a8642c', '#d8d0c0', '#333'];
  let px = 2;
  while (px < W - 4) {
    const w = 6 + rng() * 10, h = H * (0.62 + rng() * 0.36);
    x.fillStyle = colors[Math.floor(rng() * colors.length)];
    x.fillRect(px, H - h, w, h);
    x.fillStyle = 'rgba(255,255,255,0.18)';
    x.fillRect(px + 1, H - h + 6, w - 2, 2);
    px += w + 1;
  }
  return toTexture(c, { repeat: false });
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

export const painting = (seed) => cached(`painting${seed}`, () => {
  const W = 256, H = 192, rng = makeRng(`painting${seed}`);
  const [c, x] = canvas(W, H);
  const palettes = [
    ['#e9e1cf', '#c96a3d', '#2f4858', '#d9a441', '#8aa39b'],
    ['#f1ece2', '#3d5a80', '#98c1d9', '#ee6c4d', '#293241'],
    ['#efe6d8', '#6b705c', '#a5a58d', '#cb997e', '#3f4238'],
  ];
  const pal = palettes[seed % palettes.length];
  x.fillStyle = pal[0];
  x.fillRect(0, 0, W, H);
  for (let k = 0; k < 7; k++) {
    x.fillStyle = pal[1 + Math.floor(rng() * (pal.length - 1))];
    x.globalAlpha = 0.65 + rng() * 0.35;
    if (rng() < 0.5) {
      x.beginPath();
      x.arc(rng() * W, rng() * H, 18 + rng() * 60, 0, Math.PI * 2);
      x.fill();
    } else x.fillRect(rng() * W * 0.8, rng() * H * 0.8, 30 + rng() * 120, 14 + rng() * 80);
  }
  x.globalAlpha = 1;
  grain(x, 10, rng);
  return toTexture(c, { repeat: false });
});

// Louvred closet doors: horizontal slats with dark gaps between them,
// as an alpha map so you can see through the gaps from inside.
export const louvres = () => cached('louvres', () => {
  const W = 64, H = 256;
  const [c, x] = canvas(W, H, 1);
  x.fillStyle = '#fff';
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#000';
  for (let y = 18; y < H - 18; y += 10) x.fillRect(5, y, W - 10, 5);
  return toTexture(c, { srgb: false, repeat: false });
});

// the building's own window wall, seen from the street: a dense grid of
// lit and dark windows with mullions
export const facade = () => cached('facade', () => {
  const W = 512, H = 1024, rng = makeRng('facade');
  const [c, x] = canvas(W, H, 1);
  x.fillStyle = '#1a1f26';
  x.fillRect(0, 0, W, H);
  const cols = 16, rows = 50;
  const cw = W / cols, rh = H / rows;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const lit = rng() < 0.32;
    const warm = rng() < 0.7;
    x.fillStyle = lit ? (warm ? `rgba(255,${190 + rng() * 40},${120 + rng() * 40},1)` : 'rgba(200,220,255,1)') : `rgba(${30 + rng() * 25},${40 + rng() * 25},${55 + rng() * 25},1)`;
    x.fillRect(i * cw + 1.5, j * rh + 2, cw - 3, rh - 5);
  }
  return toTexture(c);
});

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
