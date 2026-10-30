// Procedural canvas textures: floors, wallpapers, signs, emoji sprites and mess splats.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function grain(ctx, w, h, amount, seed = 1) {
  const r = mulberry32(seed);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function paint(size, draw, noise = 14, seed = 1) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  draw(ctx, size, mulberry32(seed));
  if (noise) grain(ctx, size, size, noise, seed);
  return toTexture(c);
}

// Wall textures span floor (bottom) to ceiling (top): v = y / WALL_H.
function wainscot(ctx, s, upper, lower, rail = '#3b2414') {
  ctx.fillStyle = upper; ctx.fillRect(0, 0, s, s);
  const h = s * 0.32;
  ctx.fillStyle = lower; ctx.fillRect(0, s - h, s, h);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let x = 0; x < s; x += s / 4) ctx.fillRect(x, s - h, 2, h);
  ctx.fillStyle = rail; ctx.fillRect(0, s - h - 6, s, 6);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, s - 8, s, 8);
}

export function makeSurfaces() {
  const T = {};
  T.marble = paint(256, (c, s, r) => {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      c.fillStyle = (i + j) % 2 ? '#2c3531' : '#e7dfcc';
      c.fillRect(i * 128, j * 128, 128, 128);
    }
    c.strokeStyle = 'rgba(120,110,90,0.35)'; c.lineWidth = 1.5;
    for (let k = 0; k < 9; k++) {
      c.beginPath(); let x = r() * s, y = r() * s; c.moveTo(x, y);
      for (let q = 0; q < 6; q++) { x += (r() - 0.5) * 70; y += (r() - 0.5) * 70; c.lineTo(x, y); }
      c.stroke();
    }
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 2; c.strokeRect(0, 0, 128, 128); c.strokeRect(128, 128, 128, 128);
  }, 10);
  T.wood = paint(256, (c, s, r) => {
    const h = s / 8;
    for (let i = 0; i < 8; i++) {
      const v = 70 + r() * 30;
      c.fillStyle = `rgb(${v + 40},${v + 8},${v - 25})`;
      c.fillRect(0, i * h, s, h);
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, i * h, s, 2);
      c.fillRect(((i * 97) % 200) + 20, i * h, 2, h);
      c.strokeStyle = 'rgba(40,20,5,0.18)';
      for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(0, i * h + r() * h); c.bezierCurveTo(80, i * h + r() * h, 170, i * h + r() * h, s, i * h + r() * h); c.stroke(); }
    }
  }, 12, 3);
  T.checker = paint(256, c => {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? '#1d1d1f' : '#e9e6df'; c.fillRect(i * 64, j * 64, 64, 64); }
  }, 10, 4);
  T.tile = paint(256, c => {
    c.fillStyle = '#d9dcd8'; c.fillRect(0, 0, 256, 256);
    c.fillStyle = '#9da39c';
    for (let i = 0; i <= 4; i++) { c.fillRect(i * 64 - 1, 0, 3, 256); c.fillRect(0, i * 64 - 1, 256, 3); }
  }, 10, 5);
  T.concrete = paint(256, (c, s, r) => {
    c.fillStyle = '#7d7d79'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 18; i++) { c.fillStyle = `rgba(40,40,35,${r() * 0.12})`; c.beginPath(); c.arc(r() * s, r() * s, 10 + r() * 40, 0, 7); c.fill(); }
  }, 26, 6);
  T.carpet = paint(256, c => {
    c.fillStyle = '#5e1720'; c.fillRect(0, 0, 256, 256);
    c.strokeStyle = '#b07a2a'; c.lineWidth = 5;
    for (let i = -1; i < 3; i++) for (let j = -1; j < 3; j++) {
      const x = i * 128 + 64, y = j * 128 + 64;
      c.beginPath(); c.moveTo(x, y - 52); c.lineTo(x + 52, y); c.lineTo(x, y + 52); c.lineTo(x - 52, y); c.closePath(); c.stroke();
      c.fillStyle = '#3a0d14'; c.beginPath(); c.moveTo(x, y - 20); c.lineTo(x + 20, y); c.lineTo(x, y + 20); c.lineTo(x - 20, y); c.fill();
    }
    c.strokeStyle = '#7d2a30'; c.lineWidth = 3;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { c.beginPath(); c.arc(i * 128, j * 128, 14, 0, 7); c.stroke(); }
  }, 18, 7);
  T.roomcarpet = paint(256, (c, s) => {
    c.fillStyle = '#9c8a6e'; c.fillRect(0, 0, s, s);
    c.fillStyle = 'rgba(70,55,35,0.18)';
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) c.fillRect(i * 32 + 12, j * 32 + 12, 8, 8);
  }, 26, 8);
  T.pooltile = paint(256, c => {
    c.fillStyle = '#d6eef0'; c.fillRect(0, 0, 256, 256);
    c.fillStyle = '#8fc4cc';
    for (let i = 0; i <= 8; i++) { c.fillRect(i * 32 - 1, 0, 2, 256); c.fillRect(0, i * 32 - 1, 256, 2); }
  }, 8, 9);
  T.poolwall = paint(256, c => {
    c.fillStyle = '#3aa7c4'; c.fillRect(0, 0, 256, 256);
    c.fillStyle = '#2b87a3';
    for (let i = 0; i <= 8; i++) { c.fillRect(i * 32 - 1, 0, 2, 256); c.fillRect(0, i * 32 - 1, 256, 2); }
  }, 8, 10);
  T.asphalt = paint(256, (c, s, r) => {
    c.fillStyle = '#2f3032'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(255,255,255,${r() * 0.06})`; c.fillRect(r() * s, r() * s, 2, 2); }
  }, 22, 11);
  T.grass = paint(256, (c, s, r) => {
    c.fillStyle = '#2f4a25'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(${60 + r() * 40},${90 + r() * 50},${30 + r() * 20},0.6)`; c.fillRect(r() * s, r() * s, 1.5, 4); }
  }, 16, 12);
  T.sidewalk = paint(256, c => {
    c.fillStyle = '#8f8d87'; c.fillRect(0, 0, 256, 256);
    c.fillStyle = '#6a6863'; c.fillRect(0, 0, 256, 3); c.fillRect(0, 0, 3, 256);
  }, 20, 13);
  T.ceiling = paint(256, c => {
    c.fillStyle = '#bfb9aa'; c.fillRect(0, 0, 256, 256);
    c.fillStyle = '#8f8a7c';
    for (let i = 0; i <= 2; i++) { c.fillRect(i * 128 - 2, 0, 4, 256); c.fillRect(0, i * 128 - 2, 256, 4); }
  }, 18, 14);
  T.brick = paint(256, (c, s, r) => {
    c.fillStyle = '#5b5550'; c.fillRect(0, 0, s, s);
    const bh = 16, bw = 48;
    for (let y = 0; y < s; y += bh) for (let x = -bw; x < s; x += bw) {
      const off = (y / bh) % 2 ? bw / 2 : 0;
      const v = 100 + r() * 40;
      c.fillStyle = `rgb(${v + 30},${v * 0.55},${v * 0.42})`;
      c.fillRect(x + off + 2, y + 2, bw - 4, bh - 4);
    }
  }, 14, 15);
  T.wallLobby = paint(256, c => {
    wainscot(c, 256, '#cdb98f', '#4a2e1c');
    c.fillStyle = 'rgba(120,90,40,0.18)';
    for (let x = 0; x < 256; x += 32) c.fillRect(x, 0, 12, 166);
  }, 8, 16);
  T.wallHall = paint(256, c => {
    wainscot(c, 256, '#5b1c25', '#2e1a12', '#9c7a3c');
    c.strokeStyle = 'rgba(190,140,70,0.35)'; c.lineWidth = 2;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const x = i * 64 + 32, y = j * 56 + 30;
      c.beginPath(); c.moveTo(x, y - 18); c.quadraticCurveTo(x + 18, y, x, y + 18); c.quadraticCurveTo(x - 18, y, x, y - 18); c.stroke();
    }
  }, 10, 17);
  T.wallRoom = paint(256, c => {
    c.fillStyle = '#a7ae93'; c.fillRect(0, 0, 256, 256);
    c.fillStyle = 'rgba(255,255,255,0.08)';
    for (let x = 0; x < 256; x += 16) c.fillRect(x, 0, 6, 256);
    c.fillStyle = '#e8e2d2'; c.fillRect(0, 244, 256, 12);
  }, 10, 18);
  T.wallDining = paint(256, c => {
    wainscot(c, 256, '#2e4436', '#3b2416', '#a88a3c');
    c.fillStyle = 'rgba(200,170,90,0.25)';
    for (let x = 0; x < 256; x += 42) c.fillRect(x, 0, 2, 166);
  }, 8, 19);
  T.wallTile = paint(256, c => {
    c.fillStyle = '#d2c9b5'; c.fillRect(0, 0, 256, 256);
    c.fillStyle = '#dedcd2'; c.fillRect(0, 120, 256, 136);
    c.fillStyle = '#a3a39a';
    for (let y = 120; y < 256; y += 16) { c.fillRect(0, y, 256, 1.5); for (let x = ((y / 16) % 2) * 16; x < 256; x += 32) c.fillRect(x, y, 1.5, 16); }
  }, 8, 20);
  T.wallPlain = paint(256, c => { c.fillStyle = '#b6b0a2'; c.fillRect(0, 0, 256, 256); c.fillStyle = '#6d675c'; c.fillRect(0, 246, 256, 10); }, 14, 21);
  T.wallConcrete = paint(256, c => {
    c.fillStyle = '#76736c'; c.fillRect(0, 0, 256, 256);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < 256; y += 32) { c.fillRect(0, y, 256, 2); for (let x = ((y / 32) % 2) * 32; x < 256; x += 64) c.fillRect(x, y, 2, 32); }
  }, 22, 22);
  T.wallPool = paint(256, c => {
    c.fillStyle = '#e8f1ee'; c.fillRect(0, 0, 256, 256);
    c.fillStyle = '#5fb4c4'; c.fillRect(0, 150, 256, 106);
    c.fillStyle = '#3f8e9f';
    for (let i = 0; i <= 8; i++) c.fillRect(i * 32, 150, 1.5, 106);
    for (let y = 150; y < 256; y += 32) c.fillRect(0, y, 256, 1.5);
  }, 8, 23);
  T.wallStaff = paint(256, c => { c.fillStyle = '#9fb3c2'; c.fillRect(0, 0, 256, 256); c.fillStyle = '#56697a'; c.fillRect(0, 160, 256, 8); c.fillRect(0, 246, 256, 10); }, 10, 24);
  T.carpet = hexCarpet();
  T.snow = paint(512, (c, s, r) => {
    c.fillStyle = '#e8eef4'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(150,170,195,${r() * 0.12})`; c.beginPath(); c.ellipse(r() * s, r() * s, 20 + r() * 70, 8 + r() * 30, r() * 3, 0, 7); c.fill(); }
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.6})`; c.fillRect(r() * s, r() * s, 1.5, 1.5); }
    for (let i = 0; i < 220; i++) { c.fillStyle = `rgba(120,140,165,${r() * 0.18})`; c.fillRect(r() * s, r() * s, 2, 1); }
  }, 5, 25);
  // Exterior of the lodge: a fieldstone base under dark horizontal timber.
  T.lodge = paint(512, (c, s, r) => {
    logs(c, s, r);
    const h = s * 0.3;
    c.fillStyle = '#5d5a55'; c.fillRect(0, s - h, s, h);
    for (let y = s - h + 4; y < s; y += 26) for (let x = -20 + (y % 52 ? 0 : 24); x < s; x += 40 + r() * 16) {
      const v = 95 + r() * 55;
      c.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
      c.beginPath(); c.ellipse(x + 18, y + 11, 18 + r() * 5, 10 + r() * 2, 0, 0, 7); c.fill();
    }
    c.fillStyle = '#2b2420'; c.fillRect(0, s - h - 10, s, 10);
    c.fillStyle = 'rgba(255,255,255,0.75)'; c.fillRect(0, s - 6, s, 6); // snow drifting against the base
  }, 10, 26);
  T.siding = paint(512, (c, s, r) => { logs(c, s, r); c.fillStyle = '#2b2420'; c.fillRect(0, s - 14, s, 14); }, 10, 27);
  T.wallLounge = paint(256, c => {
    c.fillStyle = '#5a3420'; c.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 64) { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x, 0, 3, 256); c.fillStyle = 'rgba(255,220,170,0.06)'; c.fillRect(x + 8, 20, 48, 140); }
    c.fillStyle = '#3a2214'; c.fillRect(0, 170, 256, 86);
    c.fillStyle = '#b08d3c'; c.fillRect(0, 166, 256, 4);
  }, 12, 28);
  return T;
}

// Stacked logs/planks with knots, shared by the lodge exterior textures.
function logs(c, s, r) {
  const h = s / 14;
  for (let i = 0; i < 14; i++) {
    const v = 52 + r() * 22;
    c.fillStyle = `rgb(${v + 30},${v + 8},${v - 12})`;
    c.fillRect(0, i * h, s, h);
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, i * h + h - 3, s, 3);
    c.fillStyle = 'rgba(255,230,190,0.08)'; c.fillRect(0, i * h + 2, s, 3);
    for (let k = 0; k < 3; k++) { c.fillStyle = 'rgba(30,15,5,0.4)'; c.beginPath(); c.ellipse(r() * s, i * h + h / 2, 4, 2.5, 0, 0, 7); c.fill(); }
  }
}

// The hallway carpet: interlocking orange, red and brown hexagons (seamless).
function hexCarpet() {
  const R = 30, w = R * Math.sqrt(3), cols = 8, rows = 4;
  const c = canvas(Math.round(w * cols), R * 3 * rows);
  const g = c.getContext('2d');
  g.fillStyle = '#6e1d12'; g.fillRect(0, 0, c.width, c.height);
  const hex = (cx, cy, r, fill, stroke, lw) => {
    g.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
  };
  for (let row = -1; row <= rows * 2 + 1; row++) for (let col = -1; col <= cols + 1; col++) {
    const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * R * 1.5;
    hex(cx, cy, R, null, '#d9692a', 7);
    hex(cx, cy, R * 0.66, '#9a2a18', '#3a170c', 6);
    hex(cx, cy, R * 0.28, '#d9692a', null, 0);
  }
  grain(g, c.width, c.height, 14, 31);
  return toTexture(c);
}

// ---------- labels, emoji and bubbles ----------
const labelCache = new Map();
export function labelTexture(text, { color = '#f3e6c4', bg = '#3a1d1d', font = '600 44px Georgia, serif', pad = 18, border = null, h = 72 } = {}) {
  const key = [text, color, bg, font, border, h].join('|');
  if (labelCache.has(key)) return labelCache.get(key);
  const m = canvas(8).getContext('2d');
  m.font = font;
  const w = Math.ceil(m.measureText(text).width + pad * 2);
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, h - 6); }
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const t = toTexture(c, false);
  const out = { texture: t, aspect: w / h };
  labelCache.set(key, out);
  return out;
}

const emojiCache = new Map();
export function emojiTexture(emoji) {
  if (emojiCache.has(emoji)) return emojiCache.get(emoji);
  const c = canvas(128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(40,20,20,0.6)'; ctx.lineWidth = 5; ctx.stroke();
  // Combo orders show several emoji; shrink the font so they fit the bubble.
  const family = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  ctx.font = `72px ${family}`;
  const size = Math.min(72, Math.floor(72 * 96 / Math.max(1, ctx.measureText(emoji).width)));
  ctx.font = `${size}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 64, 68 + size * 0.03);
  const t = toTexture(c, false);
  emojiCache.set(emoji, t);
  return t;
}

export function bubbleTexture(text) {
  const font = '600 30px "Trebuchet MS", sans-serif';
  const m = canvas(8).getContext('2d');
  m.font = font;
  const w = Math.min(560, Math.ceil(m.measureText(text).width + 40));
  const c = canvas(w, 76);
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255,253,240,0.95)';
  ctx.strokeStyle = '#2a1a1a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(3, 3, w - 6, 56, 16);
  ctx.moveTo(w / 2 - 10, 58); ctx.lineTo(w / 2, 73); ctx.lineTo(w / 2 + 10, 58);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1d1414';
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, 32, w - 24);
  return { texture: toTexture(c, false), aspect: w / 76 };
}

export function nameTexture(name, color) {
  return labelTexture(name, { color: '#ffffff', bg: 'rgba(0,0,0,0.55)', font: '700 40px "Trebuchet MS", sans-serif', border: color, h: 64 });
}

// ---------- mess splats ----------
const splatCache = new Map();
export function splatTexture(kind, seed) {
  const key = `${kind}:${seed % 4}`;
  if (splatCache.has(key)) return splatCache.get(key);
  const r = mulberry32((seed % 4) * 977 + kind.length * 31);
  const c = canvas(128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  if (kind === 'mud') {
    for (let i = 0; i < 4; i++) {
      const x = 30 + i * 22 + (i % 2) * 6, y = 100 - i * 24;
      ctx.beginPath(); ctx.ellipse(x + (i % 2 ? 14 : 0), y, 7, 13, 0.3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + (i % 2 ? 14 : 0), y - 16, 6, 6, 0, 0, 7); ctx.fill();
    }
  } else if (kind === 'circle') {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(64, 64, 56, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(64, 64, 46, 0, 7); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
      const x = 64 + Math.cos(a) * 46, y = 64 + Math.sin(a) * 46;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.font = '16px serif'; ctx.fillStyle = '#fff';
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.fillText('ᛟᚱᛉᚦᛗᛞᛜᛚ'[i], 60 + Math.cos(a) * 51, 68 + Math.sin(a) * 51); }
  } else {
    const blobs = kind === 'blood' ? 9 : 6;
    for (let i = 0; i < blobs; i++) {
      const a = r() * Math.PI * 2, d = r() * 26;
      ctx.beginPath(); ctx.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 14 + r() * 18, 0, 7); ctx.fill();
    }
    for (let i = 0; i < 10; i++) {
      const a = r() * Math.PI * 2, d = 38 + r() * 22;
      ctx.beginPath(); ctx.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + r() * 5, 0, 7); ctx.fill();
    }
  }
  const t = toTexture(c, false);
  t.colorSpace = THREE.NoColorSpace;
  splatCache.set(key, t);
  return t;
}

// Room status board behind the front desk. rooms: [{id, st, tier}] for every open room.
export function drawStatusBoard(ctx, rooms) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.fillStyle = '#1b130f'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#d9b46a'; ctx.font = 'bold 24px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('ROOM STATUS', W / 2, 27);
  const colors = { vacant: '#3fae5a', occupied: '#3a6fd8', dirty: '#a4622a' };
  const n = rooms.length;
  const cols = n <= 12 ? 6 : n <= 21 ? 7 : n <= 32 ? 8 : 10;
  const rows = Math.ceil(n / cols);
  const top = 38, gap = 6;
  const cw = (W - 24) / cols, ch = Math.min(62, (H - top - 6) / rows);
  rooms.forEach((r, i) => {
    const x = 12 + (i % cols) * cw, y = top + Math.floor(i / cols) * ch;
    const w = cw - gap, h = ch - gap;
    ctx.fillStyle = colors[r.st] || '#555';
    ctx.fillRect(x, y, w, h);
    if (r.tier !== 'basic') { ctx.strokeStyle = r.tier === 'pres' ? '#ffd166' : '#a9c1ff'; ctx.lineWidth = 4; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4); }
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(h * 0.42)}px monospace`;
    ctx.fillText(r.id === 'PRES' ? 'PRES' : r.id, x + w / 2, y + h * 0.52);
    ctx.font = `${Math.max(9, Math.round(h * 0.24))}px monospace`;
    const label = r.st === 'vacant' ? 'READY' : r.st === 'occupied' ? (r.dnd ? 'DND' : 'IN USE') : 'DIRTY';
    if (r.dnd) { ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(x + w - 7, y + 7, 4, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; }
    ctx.fillText(r.tier === 'suite' ? `${label}·S` : label, x + w / 2, y + h * 0.86);
  });
}

// The order tickets over the kitchen pass: one paper ticket per order, most urgent first.
// tickets: [{ n: 'T3' | '#105', d: [dish icons], f: fraction of patience left }]
export function drawTickets(ctx, tickets) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.fillStyle = '#16181a'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#6d7378'; ctx.fillRect(0, 10, W, 6);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (!tickets.length) {
    ctx.fillStyle = '#7f868b'; ctx.font = 'bold 30px Georgia, serif';
    ctx.fillText('NO ORDERS', W / 2, H / 2 + 8);
    return;
  }
  const n = 6, gap = 8, w = (W - gap * (n + 1)) / n;
  tickets.slice(0, n).forEach((t, i) => {
    const x = gap + i * (w + gap), y = 20, h = H - 28;
    ctx.save();
    ctx.translate(x + w / 2, y);
    ctx.rotate(((i * 37) % 7 - 3) * 0.008);
    ctx.fillStyle = '#f3ecd9'; ctx.fillRect(-w / 2, 0, w, h);
    ctx.fillStyle = t.f < 0.3 ? '#c1121f' : t.f < 0.6 ? '#e09f1f' : '#3a8a4a';
    ctx.fillRect(-w / 2, h - 12, w * Math.max(0.05, t.f), 12);
    ctx.fillStyle = '#2a1a10'; ctx.font = 'bold 26px monospace';
    ctx.fillText(t.n, 0, 22);
    ctx.font = '34px sans-serif';
    t.d.slice(0, 2).forEach((ic, k, all) => ctx.fillText(ic, all.length > 1 ? (k ? 20 : -20) : 0, 72));
    ctx.restore();
  });
}
