// Difficulty: presets, per-area options and crew-size scaling. Shared by the simulation and the UI.
import { clamp } from './util.js';

// Each option: [label, value, hint]
export const DIFF_OPTIONS = {
  guests: { label: 'Guests per shift', choices: [['Fewer', 0.75], ['Normal', 1], ['More', 1.3], ['Packed', 1.6]] },
  patience: { label: 'Guest patience', choices: [['Saintly', 1.35], ['Normal', 1], ['Impatient', 0.8], ['Furious', 0.65]] },
  kitchen: {
    label: 'Kitchen', choices: [['Simple', 'simple'], ['Normal', 'normal'], ['Advanced', 'advanced']],
    hints: { simple: 'Food cooks fast and never burns. No dishes to wash.', normal: 'Cook it, don\'t burn it, don\'t set the kitchen on fire. Omelettes, and dishes to wash.', advanced: 'Toast, juice and two-dish combo orders. Food burns fast and fires spread. Trays help.' },
  },
  messes: { label: 'Messes', choices: [['Tidy', 0.6], ['Normal', 1], ['Messy', 1.4], ['Disgusting', 1.8]] },
  horror: { label: 'Horror', choices: [['Mild', 0.6], ['Normal', 1], ['Intense', 1.35], ['Nightmare', 1.7]] },
  rating: { label: 'Rating targets', choices: [['Relaxed', -0.5], ['Normal', 0], ['Strict', 0.25], ['Brutal', 0.5]] },
  scaling: {
    label: 'Crew scaling', choices: [['Off', 'off'], ['Normal', 'normal'], ['Brutal', 'brutal']],
    hints: { off: 'Same hotel no matter how many staff. More friends = easier.', normal: 'More staff means more guests and less patience.', brutal: 'Every extra staff member makes the night much worse.' },
  },
  shiftLen: { label: 'Shift length', choices: [['5 min', 300], ['8 min', 480], ['12 min', 720]] },
};

export const PRESETS = {
  chill: { name: 'Chill', desc: 'Relaxed targets, patient guests, simple kitchen.', guests: 0.75, patience: 1.35, kitchen: 'simple', messes: 0.6, horror: 0.6, rating: -0.5, scaling: 'normal' },
  normal: { name: 'Normal', desc: 'The intended experience.', guests: 1, patience: 1, kitchen: 'normal', messes: 1, horror: 1, rating: 0, scaling: 'normal' },
  hard: { name: 'Hard', desc: 'Busier, pickier, scarier. Advanced kitchen.', guests: 1.3, patience: 0.8, kitchen: 'advanced', messes: 1.4, horror: 1.35, rating: 0.25, scaling: 'normal' },
  nightmare: { name: 'Nightmare', desc: 'Packed, furious, haunted. Brutal crew scaling.', guests: 1.6, patience: 0.65, kitchen: 'advanced', messes: 1.8, horror: 1.7, rating: 0.5, scaling: 'brutal' },
};
const KEYS = ['guests', 'patience', 'kitchen', 'messes', 'horror', 'rating', 'scaling'];

export const DEFAULT_SETTINGS = { preset: 'normal', ...strip(PRESETS.normal), shiftLen: 480 };

function strip(p) { const o = {}; for (const k of KEYS) o[k] = p[k]; return o; }

export function matchPreset(s) {
  for (const [id, p] of Object.entries(PRESETS)) if (KEYS.every(k => p[k] === s[k])) return id;
  return 'custom';
}

// Accepts untrusted input (from the network) and returns valid settings.
export function sanitizeSettings(input, base = DEFAULT_SETTINGS) {
  const out = { ...base };
  if (input?.preset && PRESETS[input.preset]) Object.assign(out, strip(PRESETS[input.preset]));
  for (const [k, opt] of Object.entries(DIFF_OPTIONS)) {
    if (input && k in input && opt.choices.some(c => c[1] === input[k])) out[k] = input[k];
  }
  out.preset = matchPreset(out);
  return out;
}

// Crew scaling tables, indexed by staff count - 1 (1..6 players).
const SCALE = {
  off: { count: [1, 1, 1, 1, 1, 1], patience: [1, 1, 1, 1, 1, 1], chores: [1, 1, 1, 1, 1, 1], horror: [1, 1, 1, 1, 1, 1], target: [0, 0, 0, 0, 0, 0] },
  normal: {
    count: [0.55, 0.95, 1.3, 1.6, 1.9, 2.2], patience: [1.25, 1.1, 1, 0.95, 0.9, 0.85],
    chores: [0.6, 0.85, 1, 1.08, 1.16, 1.24], horror: [0.9, 1, 1.1, 1.2, 1.3, 1.4], target: [0, 0, 0, 0, 0, 0],
  },
  brutal: {
    count: [0.65, 1.15, 1.6, 2.0, 2.4, 2.8], patience: [1.1, 0.95, 0.88, 0.8, 0.74, 0.68],
    chores: [0.8, 1, 1.15, 1.3, 1.45, 1.6], horror: [1, 1.15, 1.3, 1.45, 1.6, 1.75], target: [0, 0.05, 0.1, 0.15, 0.2, 0.25],
  },
};

export function crewFactors(scaling, np) {
  const s = SCALE[scaling] || SCALE.normal;
  const i = clamp(np, 1, 6) - 1;
  return { count: s.count[i], patience: s.patience[i], chores: s.chores[i], horror: s.horror[i], target: s.target[i] };
}

// Everything the simulation multiplies by, for a given crew size.
export function difficulty(settings, np) {
  const c = crewFactors(settings.scaling, np);
  return {
    count: c.count * settings.guests,
    patience: c.patience * settings.patience,
    chores: c.chores * settings.messes,
    horror: c.horror * settings.horror,
    target: c.target + settings.rating,
    kitchen: settings.kitchen,
    crew: c,
  };
}

// Plain-language summary of what the crew size is doing right now.
export function crewSummary(settings, np) {
  const c = crewFactors(settings.scaling, np);
  const parts = [`×${c.count.toFixed(2)} guests`];
  if (c.patience !== 1) parts.push(c.patience > 1 ? `guests ${Math.round((c.patience - 1) * 100)}% more patient` : `guests ${Math.round((1 - c.patience) * 100)}% less patient`);
  if (c.chores !== 1) parts.push(`${c.chores > 1 ? '+' : ''}${Math.round((c.chores - 1) * 100)}% messes`);
  if (c.horror !== 1) parts.push(`${c.horror > 1 ? '+' : ''}${Math.round((c.horror - 1) * 100)}% horror`);
  if (c.target) parts.push(`+${c.target.toFixed(2)}★ target`);
  return `With ${np} staff: ${parts.join(' · ')}`;
}
