// Small math/random helpers shared by the simulation and the client.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const chance = p => Math.random() < p;

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Picks a key from {key: weight}; returns null when every weight is zero.
export function weighted(obj) {
  let total = 0;
  for (const k in obj) total += Math.max(0, obj[k] || 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const k in obj) {
    r -= Math.max(0, obj[k] || 0);
    if (r <= 0) return k;
  }
  return Object.keys(obj)[0];
}

// Deterministic PRNG so every client builds the same guest from the same seed.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function wrapAngle(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

export const angleLerp = (a, b, t) => a + wrapAngle(b - a) * t;

// Angle difference that treats facing forward and backward as the same (for parking).
export function axisDiff(a, b) {
  const d = Math.abs(wrapAngle(a - b));
  return Math.min(d, Math.PI - d);
}

export function fmtClock(H) {
  const h = Math.floor(H) % 24;
  const m = Math.floor((H % 1) * 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function starsText(stars) {
  const full = Math.floor(stars);
  const half = stars - full >= 0.5;
  return '★'.repeat(full) + (half ? '⯨' : '') + '☆'.repeat(5 - full - (half ? 1 : 0));
}
