// Deterministic guest appearance from (kind, seed). Shared by the 3D models and desk portraits.
import { mulberry32 } from './util.js';

const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a8673f', '#5c3a21', '#f5d0b0'];
const HAIR = ['#2b1b0e', '#4a2f1b', '#6b4423', '#a0522d', '#d4a017', '#151515', '#8a8a8a', '#b5651d', '#e8dcc0', '#7a1f1f'];
const CASUAL = ['#3d5a80', '#98c1d9', '#ee6c4d', '#293241', '#6a994e', '#bc4749', '#f2cc8f', '#81b29a', '#e07a5f', '#7b2cbf', '#457b9d', '#e9c46a'];
const PANTS = ['#2b2d42', '#3d405b', '#5c4b3b', '#1d3557', '#4a4e69', '#6b705c', '#22223b'];
const BRIGHT = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c', '#f72585', '#4cc9f0'];
const PASTEL = ['#f4d6cc', '#cde7b0', '#bde0fe', '#ffc8dd', '#e2ece9', '#fde4cf', '#d8e2dc'];

export function makeLook(kind, seed, wrong = false) {
  const r = mulberry32(seed || 1);
  const pick = arr => arr[Math.floor(r() * arr.length)];
  const L = {
    kind, skin: pick(SKIN), hair: pick(HAIR), hairStyle: 1 + Math.floor(r() * 4), shirt: pick(CASUAL), pants: pick(PANTS),
    shoes: '#1d1a18', scale: 0.95 + r() * 0.1, wide: 0.92 + r() * 0.18, head: 1, hat: null, hatColor: '#2b2b2b',
    glasses: 0, tie: null, coat: null, shorts: false, dress: false, cape: null, robe: null, antenna: false, bigHead: false,
    eyes: '#141010', glow: null, alpha: 1, camera: false, lanyard: false, apron: false, mouth: null,
  };
  switch (kind) {
    case 'business':
      L.shirt = pick(['#f2f2f2', '#cfe0f5', '#ece6d6']); L.coat = pick(['#2b2f3a', '#3b3b3b', '#28324a', '#4a3b2a']);
      L.pants = L.coat; L.tie = pick(['#7a1f2b', '#1f3d7a', '#2d5a3d', '#5a2d6b']); L.glasses = r() < 0.3 ? 1 : 0;
      break;
    case 'adult': case 'parent':
      if (r() < 0.3) { L.dress = true; L.shirt = pick(CASUAL); }
      L.hairStyle = 1 + Math.floor(r() * 4);
      break;
    case 'tourist':
      L.shirt = pick(BRIGHT); L.shorts = true; L.pants = pick(['#d4b483', '#7f8c8d', '#e9d8a6']);
      L.hat = r() < 0.6 ? pick(['sunhat', 'cap']) : null; L.hatColor = pick(['#f4f1de', '#e63946', '#2a9d8f']);
      L.camera = r() < 0.6; L.glasses = r() < 0.4 ? 2 : 0;
      break;
    case 'retiree':
      L.hair = pick(['#d9d9d9', '#bdbdbd', '#f2f2f2', '#9e9e9e']); L.shirt = pick(PASTEL); L.coat = r() < 0.5 ? pick(['#7d6b5d', '#9c8b7a', '#5e548e']) : null;
      L.glasses = r() < 0.7 ? 1 : 0; L.scale *= 0.95; L.pants = pick(['#8d8173', '#5c5470', '#b8a99a']);
      break;
    case 'kid':
      L.scale = 0.56 + r() * 0.1; L.head = 1.3; L.shirt = pick(BRIGHT); L.shorts = r() < 0.5;
      L.hat = r() < 0.25 ? 'cap' : null; L.hatColor = pick(BRIGHT);
      break;
    case 'office':
      L.shirt = pick(['#ffffff', '#cfe0f5', '#f6d6d6', '#d8f3dc']); L.pants = pick(['#2b2d42', '#4a4e69', '#5c4b3b']);
      L.lanyard = true; L.tie = r() < 0.4 ? pick(['#7a1f2b', '#1f3d7a', '#e9c46a']) : null;
      L.hat = r() < 0.35 ? 'party' : null; L.hatColor = pick(BRIGHT); L.glasses = r() < 0.3 ? 1 : 0;
      break;
    case 'boss':
      L.coat = '#1b2440'; L.pants = '#1b2440'; L.shirt = '#ffffff'; L.tie = '#d4a017'; L.hairStyle = 1; L.hair = '#2b1b0e';
      L.wide = 1.2; L.scale = 1.04; L.glasses = 0;
      break;
    case 'killer':
      L.shirt = '#6f7378'; L.pants = '#b8a37a'; L.hairStyle = 1; L.hair = pick(['#2b1b0e', '#4a2f1b']);
      L.skin = pick(['#f1c27d', '#e0ac69', '#ffdbac']); L.apron = true; L.scale = 1.0; L.wide = 1.0; L.mouth = 'smile';
      break;
    case 'alien':
      L.skin = pick(['#7bd389', '#9aa3ad', '#b388eb', '#5fd3c7']); L.bigHead = true; L.eyes = '#050505'; L.hairStyle = 0;
      L.antenna = r() < 0.5; L.coat = r() < 0.6 ? pick(['#8a7353', '#5d5d5d', '#3d405b']) : null;
      L.hat = L.coat && r() < 0.7 ? 'fedora' : null; L.hatColor = '#3b3024'; L.glasses = !L.coat && r() < 0.3 ? 2 : 0;
      L.shirt = pick(['#c0c0c0', '#e0e0e0', '#a4c3b2']); L.pants = L.shirt;
      break;
    case 'agent':
      L.coat = '#141414'; L.pants = '#141414'; L.shirt = '#ffffff'; L.tie = '#0a0a0a'; L.glasses = 2; L.hairStyle = 1;
      break;
    case 'vampire':
      L.skin = '#e9e4ef'; L.hair = '#0f0f12'; L.hairStyle = r() < 0.5 ? 1 : 2; L.coat = '#141016'; L.pants = '#141016';
      L.shirt = '#f4f0ea'; L.cape = '#0d0b0e'; L.eyes = '#c1121f'; L.glow = '#ff2030';
      break;
    case 'cultist':
      L.robe = pick(['#5c0f14', '#2a1020', '#3b1414']); L.hat = 'hood'; L.hatColor = L.robe; L.eyes = '#ffd166'; L.glow = '#ffb703';
      break;
    case 'priest':
      L.robe = '#111111'; L.hat = 'mitre'; L.hatColor = '#7a0f14'; L.eyes = '#ff3b30'; L.glow = '#ff3b30'; L.scale = 1.08; L.tie = '#d4a017';
      break;
    case 'influencer':
      L.shirt = pick(['#ff70a6', '#ffd670', '#70d6ff', '#e9ff70', '#f8f8f8']); L.pants = pick(['#22223b', '#f4f1de', '#ff9770']);
      L.glasses = 2; L.hairStyle = r() < 0.6 ? 2 : 3; L.hair = pick(['#f4e3b1', '#ff70a6', '#2b1b0e', '#d4a017']);
      L.phone = true; L.hat = r() < 0.3 ? 'sunhat' : null; L.hatColor = '#f4f1de'; L.dress = r() < 0.35;
      break;
    case 'ghost':
      L.alpha = 0.5; L.skin = '#dfe9f2'; L.hair = '#c7d6e3'; L.shirt = '#cfdbe6'; L.pants = '#b5c4d3'; L.shoes = '#9fb0c0';
      if (r() < 0.5) { L.dress = true; L.hat = 'band'; L.hatColor = '#e6eef5'; } else { L.coat = '#b5c4d3'; L.hat = 'fedora'; L.hatColor = '#a7b6c6'; L.tie = '#8fa0b2'; }
      L.eyes = '#25323f';
      break;
  }
  // It's winter on the mountain: plenty of scarves, woolly hats and heavy coats.
  if (['business', 'adult', 'parent', 'tourist', 'retiree', 'kid', 'office', 'influencer'].includes(kind)) {
    L.shorts = L.shorts && r() < 0.2;
    if (r() < 0.45) L.scarf = pick(['#b23a48', '#2d6a4f', '#1d3557', '#e9c46a', '#6d597a', '#f4f1de']);
    if (!L.hat && r() < (kind === 'kid' ? 0.6 : 0.3)) { L.hat = 'beanie'; L.hatColor = pick(['#b23a48', '#264653', '#e76f51', '#2a9d8f', '#f4f1de']); }
    if (!L.coat && !L.dress && ['adult', 'parent', 'tourist'].includes(kind) && r() < 0.45) L.coat = pick(['#3d405b', '#6b4c3b', '#1d3557', '#7a1f2b', '#2f3e46']);
  }
  if (wrong) { L.eyes = '#000000'; L.mouth = 'wide'; L.scale *= 1.05; L.wrong = true; }
  return L;
}
