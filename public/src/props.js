// Furniture and fixtures for the hotel. Each builder returns a Group in local space (front = +Z).
// Meshes flagged userData.keep stay separate (they animate); everything else gets merged.
import * as THREE from 'three';
import { box, rbox, cyl, ball, mat, glow, cylGeo } from './models.js';
import { labelTexture } from './textures.js';

// Shared emissive materials the world dims/flickers as a group.
export const LIGHTS = {
  lamp: new THREE.MeshLambertMaterial({ color: '#fff1c1', emissive: '#ffd27a', emissiveIntensity: 1.5 }),
  outdoor: new THREE.MeshLambertMaterial({ color: '#fff5d6', emissive: '#ffe2a0', emissiveIntensity: 1.6 }),
  exit: new THREE.MeshBasicMaterial({ color: '#ff2b2b' }),
  vending: new THREE.MeshLambertMaterial({ color: '#cfe8ff', emissive: '#7fb8ff', emissiveIntensity: 1.1 }),
  neon: new THREE.MeshLambertMaterial({ color: '#ff3d6e', emissive: '#ff2a5f', emissiveIntensity: 2 }),
  window: new THREE.MeshLambertMaterial({ color: '#9ec9ff', emissive: '#9ec9ff', emissiveIntensity: 0.9 }),
  facade: new THREE.MeshLambertMaterial({ color: '#ffd98a', emissive: '#ffc864', emissiveIntensity: 0.6 }),
  screen: new THREE.MeshLambertMaterial({ color: '#69e0a5', emissive: '#38c483', emissiveIntensity: 1.2 }),
  eyes: new THREE.MeshLambertMaterial({ color: '#3a0000', emissive: '#ff1a1a', emissiveIntensity: 0 }),
  arcade: new THREE.MeshLambertMaterial({ color: '#ff6bd6', emissive: '#c43cff', emissiveIntensity: 1.3 }),
  uv: new THREE.MeshLambertMaterial({ color: '#c77dff', emissive: '#9d4edd', emissiveIntensity: 1.8 }),
  heat: new THREE.MeshLambertMaterial({ color: '#ff9a3c', emissive: '#ff5a1f', emissiveIntensity: 1.4 }),
  fire: new THREE.MeshLambertMaterial({ color: '#ffb347', emissive: '#ff6a1a', emissiveIntensity: 1.6 }),
};
const SNOW = '#eef3f8';

const keep = m => { m.userData.keep = true; return m; };

function signPlane(text, w, h, opt = {}) {
  const { texture, aspect } = labelTexture(text, opt);
  const width = w || h * aspect;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, h), new THREE.MeshBasicMaterial({ map: texture, transparent: !opt.bg }));
  return keep(m);
}

const WOOD = '#5a3a24', DARKWOOD = '#3a2416', BRASS = '#b08d3c', STEEL = '#9aa1a6', WHITE = '#efece6';

// A stair tread: a slice of a ring from the pole out to radius r, `span` radians wide, top at y = 0.
const treadCache = new Map();
function treadGeometry(r, span) {
  const key = `${r}|${span}`;
  if (treadCache.has(key)) return treadCache.get(key);
  const r0 = 0.1, s = new THREE.Shape();
  s.moveTo(r0, 0);
  s.lineTo(r, 0);
  s.absarc(0, 0, r, 0, span, false);
  s.lineTo(r0 * Math.cos(span), r0 * Math.sin(span));
  s.absarc(0, 0, r0, span, 0, true);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false, curveSegments: 4 });
  geo.rotateX(Math.PI / 2); // the shape's y becomes +z, its thickness hangs below y = 0
  treadCache.set(key, geo);
  return geo;
}

export const PROPS = {
  bed(f) {
    const g = new THREE.Group();
    rbox(g, 1.8, 0.3, 2.2, DARKWOOD, 0, 0.15, 0);
    rbox(g, 1.72, 0.22, 2.1, '#f2efe8', 0, 0.41, 0.02);
    rbox(g, 1.76, 0.06, 1.45, ['#7a2531', '#2d4a6e', '#3e5c3a', '#6b4c7a'][Number(f.room) % 4], 0, 0.54, 0.38);
    rbox(g, 1.8, 1.0, 0.1, DARKWOOD, 0, 0.6, -0.98);
    for (const s of [-1, 1]) rbox(g, 0.62, 0.14, 0.36, WHITE, 0.42 * s, 0.6, -0.82);
    return g;
  },
  nightstand() {
    const g = new THREE.Group();
    box(g, 0.5, 0.55, 0.45, WOOD, 0, 0.275, 0);
    box(g, 0.4, 0.02, 0.02, BRASS, 0, 0.4, 0.23);
    cyl(g, 0.07, 0.09, 0.22, BRASS, 0, 0.66, 0, 8);
    cyl(g, 0.16, 0.2, 0.2, LIGHTS.lamp, 0, 0.86, 0, 10);
    return g;
  },
  desk(f = {}) {
    const g = new THREE.Group();
    box(g, 1.4, 0.05, 0.7, f.fancy ? '#2a1a10' : WOOD, 0, 0.74, 0);
    for (const sx of [-1, 1]) box(g, 0.05, 0.72, 0.65, DARKWOOD, 0.66 * sx, 0.36, 0);
    box(g, 0.32, 0.22, 0.24, '#2b2b2b', 0.4, 0.88, -0.1);
    if (f.fancy) {
      box(g, 1.42, 0.02, 0.72, BRASS, 0, 0.775, 0);
      cyl(g, 0.05, 0.07, 0.3, BRASS, -0.45, 0.92, -0.15, 8);
      cyl(g, 0.12, 0.16, 0.14, mat('#2d6a4f', { emissive: '#1b4332', emissiveIntensity: 0.4 }), -0.45, 1.1, -0.15, 10);
    }
    return g;
  },
  chair(f = {}) {
    const g = new THREE.Group();
    const seat = f.fancy ? '#6e1f2a' : DARKWOOD;
    box(g, 0.45, 0.06, 0.45, seat, 0, 0.45, 0);
    box(g, 0.45, 0.5, 0.05, seat, 0, 0.72, -0.2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.04, 0.45, 0.04, DARKWOOD, 0.19 * sx, 0.22, 0.19 * sz);
    return g;
  },
  diningChair(f) {
    const g = new THREE.Group();
    const wood = DARKWOOD;
    rbox(g, 0.46, 0.08, 0.46, f.fancy ? '#6e1f2a' : '#5c1a22', 0, 0.48, 0.01);
    box(g, 0.46, 0.04, 0.46, wood, 0, 0.43, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.024, 0.018, 0.42, wood, 0.19 * sx, 0.21, 0.19 * sz, 6);
    for (const sx of [-1, 1]) box(g, 0.045, 0.62, 0.045, wood, 0.2 * sx, 0.75, -0.21);
    rbox(g, 0.46, 0.12, 0.05, wood, 0, 1.04, -0.21);
    box(g, 0.13, 0.46, 0.025, wood, 0, 0.74, -0.21);
    return g;
  },
  armchair(f) {
    const g = new THREE.Group();
    const c = f.color === 'room' ? '#6b5a48' : f.color || '#7a2531';
    rbox(g, 0.85, 0.4, 0.8, c, 0, 0.25, 0);
    rbox(g, 0.85, 0.6, 0.18, c, 0, 0.65, -0.32);
    for (const s of [-1, 1]) rbox(g, 0.14, 0.32, 0.75, c, 0.36 * s, 0.56, 0);
    return g;
  },
  sofa(f) {
    const g = new THREE.Group();
    const c = f.color || '#7a2531';
    rbox(g, f.w, 0.4, f.d, c, 0, 0.25, 0);
    rbox(g, f.w, 0.55, 0.18, c, 0, 0.67, -f.d / 2 + 0.09);
    for (const s of [-1, 1]) rbox(g, 0.16, 0.3, f.d, c, (f.w / 2 - 0.08) * s, 0.58, 0);
    for (let i = 0; i < 3; i++) rbox(g, f.w / 3 - 0.08, 0.1, f.d - 0.25, c, (i - 1) * (f.w / 3), 0.49, 0.06);
    return g;
  },
  coffeeTable(f) {
    const g = new THREE.Group();
    box(g, f.w, 0.05, f.d, DARKWOOD, 0, 0.42, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.05, 0.4, 0.05, DARKWOOD, (f.w / 2 - 0.08) * sx, 0.2, (f.d / 2 - 0.08) * sz);
    box(g, 0.3, 0.04, 0.22, '#c9b27c', 0.2, 0.47, 0);
    return g;
  },
  dresserTV(f = {}) {
    const g = new THREE.Group();
    const tw = f.big ? 1.35 : 1.0;
    box(g, 1.6, 0.8, 0.55, f.big ? '#2a1a10' : WOOD, 0, 0.4, 0);
    for (let i = 0; i < 3; i++) box(g, 0.4, 0.03, 0.02, BRASS, (i - 1) * 0.5, 0.55, 0.28);
    box(g, tw, tw * 0.6, 0.06, '#111111', 0, 0.85 + tw * 0.3, -0.1);
    box(g, tw - 0.06, tw * 0.6 - 0.06, 0.01, '#1a2230', 0, 0.85 + tw * 0.3, -0.065);
    return g;
  },
  window(f) {
    const g = new THREE.Group();
    box(g, 1.5, 1.2, 0.06, '#e8e2d2', 0, 1.6, -0.02);
    box(g, 1.36, 1.06, 0.02, LIGHTS.window, 0, 1.6, 0.02);
    box(g, 1.7, 0.05, 0.12, BRASS, 0, 2.28, 0.06);
    const curtain = mat('#6e1f2a');
    const L = keep(box(g, 0.8, 1.45, 0.05, curtain, -0.42, 1.52, 0.1));
    const R = keep(box(g, 0.8, 1.45, 0.05, curtain, 0.42, 1.52, 0.1));
    g.userData.curtains = [L, R];
    return g;
  },
  painting(f) {
    const g = new THREE.Group();
    const big = f.big;
    const w = big ? 1.4 : 1.0, h = big ? 1.0 : 0.7;
    box(g, w + 0.1, h + 0.1, 0.05, BRASS, 0, f.y || 1.9, 0);
    const palettes = [['#2e4057', '#d1495b', '#edae49'], ['#3d405b', '#81b29a', '#f2cc8f'], ['#1b4332', '#95d5b2', '#d8f3dc'], ['#4a1942', '#c4a7e7', '#ffd6a5'], ['#161616', '#5a0000', '#999999']];
    const p = palettes[(f.seed || 0) % palettes.length];
    box(g, w, h, 0.02, p[0], 0, f.y || 1.9, 0.03);
    box(g, w * 0.7, h * 0.25, 0.02, p[1], 0, (f.y || 1.9) - h * 0.2, 0.04);
    ball(g, h * 0.18, p[2], w * 0.2, (f.y || 1.9) + h * 0.15, 0.045, 1, 1, 0.1);
    return g;
  },
  toilet() {
    const g = new THREE.Group();
    box(g, 0.4, 0.4, 0.5, WHITE, 0, 0.2, 0.02);
    box(g, 0.42, 0.04, 0.5, '#ffffff', 0, 0.42, 0.04);
    box(g, 0.44, 0.45, 0.18, WHITE, 0, 0.62, -0.22);
    return g;
  },
  sink() {
    const g = new THREE.Group();
    box(g, 0.5, 0.08, 0.42, WHITE, 0, 0.85, 0);
    cyl(g, 0.06, 0.08, 0.8, WHITE, 0, 0.42, -0.05, 8);
    box(g, 0.04, 0.12, 0.04, STEEL, 0, 0.95, -0.15);
    box(g, 0.5, 0.65, 0.03, mat('#bfd6e6', { emissive: '#3a4e5c', emissiveIntensity: 0.3 }), 0, 1.5, -0.2);
    return g;
  },
  thermostat() {
    const g = new THREE.Group();
    box(g, 0.16, 0.22, 0.04, '#f4f1ea', 0, 1.45, 0);
    g.userData.screen = keep(box(g, 0.1, 0.07, 0.01, LIGHTS.screen, 0, 1.49, 0.022));
    return g;
  },
  rug(f) {
    const g = new THREE.Group();
    box(g, f.rw, 0.012, f.rd, f.color || '#5a1f2b', 0, 0.006, 0);
    box(g, f.rw - 0.3, 0.014, f.rd - 0.3, '#8a6a3a', 0, 0.006, 0).scale.y = 0.012;
    box(g, f.rw - 0.4, 0.016, f.rd - 0.4, f.color || '#5a1f2b', 0, 0.007, 0);
    return g;
  },
  frontDesk() {
    const g = new THREE.Group();
    box(g, 5, 1.05, 0.8, DARKWOOD, 0, 0.525, 0);
    box(g, 5.1, 0.06, 0.9, '#d8cfbd', 0, 1.08, 0);
    for (let i = 0; i < 5; i++) box(g, 0.9, 0.7, 0.02, WOOD, -2 + i, 0.5, 0.41);
    box(g, 5, 0.06, 0.02, BRASS, 0, 0.92, 0.41);
    box(g, 0.5, 0.36, 0.05, '#1a1a1a', 0, 1.33, -0.05);
    box(g, 0.44, 0.3, 0.01, LIGHTS.screen, 0, 1.33, -0.08);
    box(g, 0.08, 0.14, 0.08, '#1a1a1a', 0, 1.17, -0.05);
    box(g, 0.4, 0.02, 0.15, '#2b2b2b', 0, 1.12, -0.25);
    cyl(g, 0.06, 0.07, 0.04, BRASS, 1.3, 1.13, 0.2, 10);
    ball(g, 0.045, BRASS, 1.3, 1.17, 0.2, 1, 0.7, 1);
    box(g, 0.25, 0.2, 0.15, '#c1121f', -1.4, 1.2, 0.05);
    return g;
  },
  backCounter(f) {
    const g = new THREE.Group();
    box(g, f.w, 1.0, f.d, WOOD, 0, 0.5, 0);
    box(g, f.w + 0.05, 0.05, f.d + 0.05, '#d8cfbd', 0, 1.02, 0);
    for (let i = 0; i < 12; i++) box(g, 0.05, 0.12, 0.03, BRASS, -2.6 + i * 0.45, 1.6, -0.2);
    return g;
  },
  statusBoard() {
    const g = new THREE.Group();
    box(g, 2.5, 1.3, 0.05, DARKWOOD, 0, 0, 0);
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const screen = keep(new THREE.Mesh(new THREE.PlaneGeometry(2.36, 1.18), new THREE.MeshBasicMaterial({ map: tex })));
    screen.position.z = 0.03;
    g.add(screen);
    g.userData.board = { canvas: c, tex };
    return g;
  },
  // A potted palm: a glazed pot with a rim and soil, and long leaves arching out in two rings.
  plant(f = {}) {
    const g = new THREE.Group();
    cyl(g, 0.28, 0.2, 0.44, '#7a4a2a', 0, 0.22, 0, 12);
    cyl(g, 0.3, 0.3, 0.07, '#5e3820', 0, 0.45, 0, 12);
    cyl(g, 0.26, 0.26, 0.02, '#2a1a10', 0, 0.48, 0, 12);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + (i % 2) * 0.3;
      const outer = i % 2 === 0, len = outer ? 0.36 : 0.42, tilt = outer ? 0.75 : 0.35;
      const leaf = ball(g, 1, outer ? '#2f6b2f' : '#3d8b3d', 0, 0, 0, 0.022, len, 0.08);
      leaf.rotation.set(0, -a, 0);
      leaf.rotateZ(-tilt);
      leaf.position.set(Math.cos(a) * (0.05 + Math.sin(tilt) * len), 0.5 + Math.cos(tilt) * len, Math.sin(a) * (0.05 + Math.sin(tilt) * len));
    }
    ball(g, 0.05, '#2a5a2a', 0, 0.55, 0);
    if (f.small) g.scale.setScalar(0.65);
    return g;
  },
  toolRack(f) {
    const g = new THREE.Group();
    box(g, f.w, 1.2, 0.06, '#4a3a2a', 0, 1.3, -0.07);
    for (let i = 0; i < 6; i++) box(g, 0.04, 0.04, 0.2, STEEL, -1.7 + i * 0.68, 1.75, 0.04);
    const lbl = signPlane('SUPPLIES', 0, 0.22, { color: '#f3e6c4', bg: '#3a1d1d', font: '600 40px Georgia, serif', h: 64 });
    lbl.position.set(0, 2.05, -0.03);
    g.add(lbl);
    return g;
  },
  trashCan() {
    const g = new THREE.Group();
    cyl(g, 0.22, 0.19, 0.7, '#3d4447', 0, 0.35, 0, 12);
    cyl(g, 0.23, 0.23, 0.04, '#2b3033', 0, 0.71, 0, 12);
    return g;
  },
  luggageCart() {
    const g = new THREE.Group();
    box(g, 1.1, 0.06, 0.6, BRASS, 0, 0.25, 0);
    for (const s of [-1, 1]) { cyl(g, 0.025, 0.025, 1.5, BRASS, 0.52 * s, 1.0, 0, 6); }
    box(g, 1.1, 0.04, 0.04, BRASS, 0, 1.74, 0);
    box(g, 1.04, 0.035, 0.035, '#8a1a1a', 0, 0.3, 0.28);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.06, 0.06, 0.04, '#111', 0.45 * sx, 0.06, 0.25 * sz, 8).rotation.z = Math.PI / 2;
    return g;
  },
  chandelier() {
    const g = new THREE.Group();
    cyl(g, 0.02, 0.02, 0.6, BRASS, 0, 2.9, 0, 6);
    cyl(g, 0.5, 0.3, 0.08, BRASS, 0, 2.6, 0, 12);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ball(g, 0.07, LIGHTS.lamp, Math.cos(a) * 0.48, 2.7, Math.sin(a) * 0.48);
    }
    ball(g, 0.12, LIGHTS.lamp, 0, 2.5, 0);
    return g;
  },
  sconce(f) {
    const g = new THREE.Group();
    box(g, 0.12, 0.2, 0.05, BRASS, 0, f.y || 2.2, -0.02);
    cyl(g, 0.08, 0.12, 0.16, LIGHTS.lamp, 0, (f.y || 2.2) + 0.08, 0.1, 8);
    return g;
  },
  bulb() {
    const g = new THREE.Group();
    cyl(g, 0.01, 0.01, 0.6, '#222', 0, 2.9, 0, 4);
    ball(g, 0.08, LIGHTS.lamp, 0, 2.55, 0);
    return g;
  },
  exitSign(f) {
    const g = new THREE.Group();
    box(g, 0.6, 0.24, 0.06, '#1a1a1a', 0, f.y || 2.6, 0);
    const p = signPlane('EXIT', 0.52, 0.18, { color: '#ff3030', bg: '#200000', font: 'bold 52px Arial, sans-serif', h: 72 });
    p.position.set(0, f.y || 2.6, 0.035);
    g.add(p);
    return g;
  },
  elevator() {
    const g = new THREE.Group();
    box(g, 2.4, 2.6, 0.12, BRASS, 0, 1.3, 0);
    for (const s of [-1, 1]) box(g, 1.0, 2.3, 0.06, '#8d8d8d', 0.51 * s, 1.17, 0.07);
    box(g, 0.02, 2.3, 0.07, '#333', 0, 1.17, 0.08);
    box(g, 0.9, 0.18, 0.05, '#1a1a1a', 0, 2.75, 0.06);
    box(g, 0.1, 0.1, 0.02, glow('#ff8a00', 1.5), 0.3, 2.75, 0.09);
    box(g, 0.12, 0.25, 0.05, BRASS, 1.45, 1.2, 0.06);
    return g;
  },
  vending() {
    const g = new THREE.Group();
    box(g, 1.2, 1.9, 0.8, '#7a1020', 0, 0.95, 0);
    box(g, 0.8, 1.3, 0.02, LIGHTS.vending, -0.12, 1.15, 0.41);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) box(g, 0.14, 0.2, 0.03, ['#ffd166', '#06d6a0', '#ef476f', '#118ab2'][(r + c) % 4], -0.4 + c * 0.18, 0.7 + r * 0.3, 0.42);
    box(g, 0.2, 0.5, 0.02, '#1a1a1a', 0.45, 1.2, 0.41);
    return g;
  },
  iceMachine() {
    const g = new THREE.Group();
    box(g, 1.0, 1.4, 0.8, STEEL, 0, 0.7, 0);
    box(g, 0.6, 0.4, 0.02, '#3a4a55', 0, 0.9, 0.41);
    const p = signPlane('ICE', 0.4, 0.15, { color: '#0d3b66', bg: '#e0f7ff', font: 'bold 48px Arial', h: 64 });
    p.position.set(0, 1.25, 0.42);
    g.add(p);
    return g;
  },
  diningTable() {
    const g = new THREE.Group();
    // a tablecloth with a red hem, a place setting facing each chair and a candle in the middle
    box(g, 1.4, 0.05, 1.4, '#f4efe2', 0, 0.76, 0);
    box(g, 1.46, 0.24, 1.46, '#ece5d4', 0, 0.65, 0);
    box(g, 1.47, 0.03, 1.47, '#7a1f2b', 0, 0.535, 0);
    cyl(g, 0.08, 0.12, 0.52, DARKWOOD, 0, 0.26, 0, 8);
    cyl(g, 0.3, 0.34, 0.04, DARKWOOD, 0, 0.02, 0, 12);
    for (const [x, z, r] of [[0, -0.47, 0], [0, 0.47, Math.PI], [-0.47, 0, Math.PI / 2], [0.47, 0, -Math.PI / 2]]) {
      const s = new THREE.Group();
      s.position.set(x, 0.79, z);
      s.rotation.y = r;
      g.add(s);
      cyl(s, 0.14, 0.12, 0.014, '#fbfaf6', 0, 0, 0, 16);
      cyl(s, 0.085, 0.085, 0.004, '#e2dccd', 0, 0.008, 0, 16);
      box(s, 0.022, 0.006, 0.17, STEEL, -0.19, 0, 0);
      box(s, 0.022, 0.006, 0.19, STEEL, 0.19, 0, 0);
      box(s, 0.09, 0.02, 0.15, '#7a1f2b', -0.29, 0.004, 0);
    }
    cyl(g, 0.05, 0.065, 0.04, BRASS, 0, 0.8, 0, 10);
    cyl(g, 0.024, 0.024, 0.15, '#f4ecd8', 0, 0.895, 0, 8);
    ball(g, 0.018, LIGHTS.fire, 0, 0.985, 0, 1, 1.7, 1);
    cyl(g, 0.028, 0.022, 0.12, '#bcd0d8', 0.17, 0.84, 0.12, 8);
    ball(g, 0.042, '#9b1020', 0.17, 0.93, 0.12);
    return g;
  },
  buffet(f) {
    const g = new THREE.Group();
    box(g, f.w, 0.9, f.d, DARKWOOD, 0, 0.45, 0);
    for (let i = 0; i < 4; i++) { box(g, 0.6, 0.12, 0.4, STEEL, -1.8 + i * 1.2, 0.97, 0); box(g, 0.62, 0.04, 0.42, '#c9ced2', -1.8 + i * 1.2, 1.05, 0); }
    return g;
  },
  hostStand() {
    const g = new THREE.Group();
    box(g, 0.7, 1.1, 0.5, DARKWOOD, 0, 0.55, 0);
    box(g, 0.75, 0.04, 0.55, BRASS, 0, 1.12, 0);
    return g;
  },
  // Steel kitchen cabinets: a worktop, a recessed toe kick and doors (on both sides for an island).
  counter(f, both = false) {
    const g = new THREE.Group();
    box(g, f.w, 0.8, f.d, '#c3c9ce', 0, 0.48, 0);
    box(g, f.w - 0.06, 0.08, f.d - 0.12, '#24282c', 0, 0.04, 0);
    box(g, f.w + 0.03, 0.05, f.d + 0.03, '#3d4247', 0, 0.905, 0);
    const n = Math.max(1, Math.round(f.w / 0.6));
    for (const side of both ? [-1, 1] : [1]) {
      for (let i = 0; i < n; i++) {
        const x = -f.w / 2 + (i + 0.5) * (f.w / n);
        box(g, f.w / n - 0.04, 0.68, 0.014, '#d3d8dc', x, 0.48, (f.d / 2 + 0.005) * side);
        box(g, 0.14, 0.018, 0.022, STEEL, x, 0.76, (f.d / 2 + 0.02) * side);
      }
    }
    return g;
  },
  sinkCounter(f) {
    const g = PROPS.counter(f);
    box(g, 0.98, 0.03, 0.58, STEEL, 0, 0.935, 0);
    for (const s of [-1, 1]) box(g, 0.42, 0.006, 0.44, '#3e474e', 0.235 * s, 0.952, 0);
    cyl(g, 0.026, 0.03, 0.42, STEEL, 0, 1.15, -0.25, 8);
    box(g, 0.036, 0.036, 0.3, STEEL, 0, 1.35, -0.12);
    cyl(g, 0.02, 0.016, 0.1, STEEL, 0, 1.3, 0.02, 6);
    for (const s of [-1, 1]) cyl(g, 0.032, 0.032, 0.05, s < 0 ? '#c1121f' : '#1d4ed8', 0.13 * s, 0.975, -0.25, 8);
    return g;
  },
  island(f) {
    const g = PROPS.counter(f, true);
    box(g, 0.5, 0.03, 0.34, '#a8784a', 1.5, 0.945, 0.15);
    box(g, 0.22, 0.008, 0.035, STEEL, 1.45, 0.965, 0.12).rotation.y = 0.4;
    box(g, 0.09, 0.022, 0.03, '#1a1a1a', 1.6, 0.97, 0.18).rotation.y = 0.4;
    return g;
  },
  fridge(f) {
    const g = new THREE.Group();
    const labels = f.labels || ['EGGS', 'BATTER', 'BACON', 'BLOOD'];
    const front = f.d / 2;
    box(g, f.w, 2.1, f.d, '#b9c0c6', 0, 1.05, 0);
    box(g, f.w + 0.04, 0.14, f.d + 0.04, '#8d949a', 0, 2.17, 0);
    for (let i = 0; i < 10; i++) box(g, 0.2, 0.025, 0.01, '#3a3f44', -f.w / 2 + 0.3 + i * (f.w - 0.6) / 9, 2.17, front + 0.025);
    box(g, 0.16, 0.06, 0.01, glow('#5dff8a', 0.9), 0, 2.17, front + 0.031);
    labels.forEach((lbl, i) => {
      const x = -f.w / 2 + 0.45 + i * 0.9;
      const blood = lbl === 'BLOOD';
      box(g, 0.86, 1.94, 0.04, blood ? '#d8c2c2' : '#dde2e6', x, 1.04, front + 0.012);
      box(g, 0.035, 0.66, 0.05, STEEL, x + 0.33, 1.2, front + 0.065);
      for (const y of [0.9, 1.5]) box(g, 0.04, 0.035, 0.05, STEEL, x + 0.33, y, front + 0.04);
      for (const y of [0.3, 1.78]) box(g, 0.04, 0.14, 0.03, '#7d848a', x - 0.4, y, front + 0.04);
      const p = signPlane(lbl, 0.5, 0.16, { color: blood ? '#ffffff' : '#1d1d1d', bg: blood ? '#8b0000' : '#f6f0d8', font: 'bold 44px Arial', h: 64 });
      p.position.set(x, 1.75, front + 0.036);
      g.add(p);
    });
    return g;
  },
  // A commercial range: four burners under cast-iron grates, two ovens, knobs and a steel backsplash.
  stove(f) {
    const g = new THREE.Group();
    const front = f.d / 2;
    box(g, f.w, 0.82, f.d, '#33383d', 0, 0.49, 0);
    box(g, f.w - 0.06, 0.08, f.d - 0.12, '#15181b', 0, 0.04, 0);
    box(g, f.w + 0.02, 0.05, f.d + 0.02, '#1a1d20', 0, 0.925, 0);
    box(g, f.w + 0.02, 0.13, 0.07, '#4a5056', 0, 0.85, front + 0.02);
    box(g, f.w + 0.02, 0.62, 0.03, STEEL, 0, 1.26, -front + 0.01);
    for (const s of [-1, 1]) {
      box(g, 1.76, 0.56, 0.02, '#2a2e32', s, 0.47, front + 0.01);
      box(g, 1.0, 0.24, 0.01, '#0d0f11', s, 0.5, front + 0.022);
      cyl(g, 0.02, 0.02, 1.5, STEEL, s, 0.73, front + 0.07, 8).rotation.z = Math.PI / 2;
    }
    const burners = [];
    for (let i = 0; i < 4; i++) {
      const x = -1.5 + i;
      const m = new THREE.MeshLambertMaterial({ color: '#2a2a2a', emissive: '#ff3a00', emissiveIntensity: 0 });
      const b = keep(new THREE.Mesh(cylGeo(0.17, 0.17, 0.03, 16), m));
      b.position.set(x, 0.95, 0);
      g.add(b);
      burners.push(b);
      box(g, 0.44, 0.022, 0.035, '#101214', x, 0.972, 0);
      box(g, 0.035, 0.022, 0.44, '#101214', x, 0.972, 0);
      for (const k of [-1, 1]) cyl(g, 0.032, 0.032, 0.045, '#d8dadc', x + k * 0.16, 0.85, front + 0.075, 10).rotation.x = Math.PI / 2;
    }
    g.userData.burners = burners;
    return g;
  },
  hood() {
    const g = new THREE.Group();
    box(g, 4.3, 0.1, 1.05, STEEL, 0, 2.3, 0.12);
    box(g, 4.3, 0.42, 0.62, '#a8afb4', 0, 2.56, -0.1);
    box(g, 4.3, 0.46, 0.05, '#b6bdc2', 0, 2.55, 0.43).rotation.x = -0.45;
    for (let i = 0; i < 6; i++) box(g, 0.62, 0.012, 0.5, '#6c747a', -1.75 + i * 0.7, 2.245, 0.12);
    for (let i = 0; i < 3; i++) box(g, 0.24, 0.012, 0.12, LIGHTS.lamp, -1.4 + i * 1.4, 2.243, 0.5);
    box(g, 0.9, 0.55, 0.6, STEEL, 0, 2.95, -0.1);
    return g;
  },
  coffeeMachine() {
    const g = new THREE.Group();
    rbox(g, 0.45, 0.6, 0.4, '#1d1d1f', 0, 1.25, -0.02);
    box(g, 0.36, 0.035, 0.24, '#55595d', 0, 0.97, 0.08);
    box(g, 0.3, 0.06, 0.2, '#2e2e31', 0, 1.42, 0.12);
    cyl(g, 0.075, 0.065, 0.16, '#2a1a10', -0.08, 1.07, 0.1, 12);
    cyl(g, 0.078, 0.078, 0.03, '#111111', -0.08, 1.165, 0.1, 12);
    box(g, 0.12, 0.06, 0.01, glow('#ff6b2b', 1.4), 0.1, 1.47, 0.185);
    for (let i = 0; i < 3; i++) cyl(g, 0.014, 0.014, 0.012, '#bbbbbb', 0.05 + i * 0.045, 1.34, 0.185, 6).rotation.x = Math.PI / 2;
    cyl(g, 0.045, 0.04, 0.09, '#f4f1ea', 0.1, 1.035, 0.1, 10);
    return g;
  },
  washers(f) {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const x = -f.w / 2 + 0.475 + i * 0.95;
      box(g, 0.9, 0.9, f.d, '#eef0f2', x, 0.45, 0);
      cyl(g, 0.28, 0.28, 0.04, '#9db4c0', x, 0.45, f.d / 2, 16).rotation.x = Math.PI / 2;
      box(g, 0.9, 0.9, f.d, '#e2e5e8', x, 1.36, 0);
      cyl(g, 0.24, 0.24, 0.04, '#5c6b73', x, 1.36, f.d / 2, 16).rotation.x = Math.PI / 2;
    }
    return g;
  },
  towelShelf(f) {
    const g = new THREE.Group();
    for (let s = 0; s < 4; s++) box(g, f.w, 0.04, f.d, WOOD, 0, 0.1 + s * 0.55, 0);
    for (const sx of [-1, 1]) box(g, 0.05, 1.9, f.d, DARKWOOD, (f.w / 2) * sx, 0.95, 0);
    for (let s = 0; s < 3; s++) for (let i = 0; i < 5; i++) for (let k = 0; k < 3; k++) box(g, 0.42, 0.08, 0.5, (i + k) % 2 ? '#ffffff' : '#a8dadc', -1.1 + i * 0.55, 0.17 + s * 0.55 + k * 0.085, 0);
    const p = signPlane('TOWELS', 0, 0.22, { color: '#ffffff', bg: '#2a6f97', font: 'bold 44px Arial', h: 64 });
    p.position.set(0, 2.1, 0.2);
    g.add(p);
    return g;
  },
  foldTable(f) {
    const g = new THREE.Group();
    box(g, f.w, 0.05, f.d, '#c9c2b5', 0, 0.85, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.05, 0.83, 0.05, STEEL, (f.w / 2 - 0.1) * sx, 0.42, (f.d / 2 - 0.1) * sz);
    for (let i = 0; i < 3; i++) box(g, 0.4, 0.15, 0.3, i % 2 ? '#ffffff' : '#e9d8a6', -0.8 + i * 0.6, 0.95, 0);
    return g;
  },
  breaker() {
    const g = new THREE.Group();
    box(g, 0.75, 1.0, 0.16, '#5c6670', 0, 1.4, 0.08);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) box(g, 0.12, 0.06, 0.04, '#1a1a1a', -0.2 + c * 0.2, 1.7 - r * 0.18, 0.18);
    box(g, 0.14, 0.3, 0.06, '#c1121f', 0.25, 1.2, 0.18);
    const p = signPlane('BREAKER', 0.6, 0.15, { color: '#1a1a1a', bg: '#f2d64b', font: 'bold 40px Arial', h: 56 });
    p.position.set(0, 2.05, 0.17);
    g.add(p);
    return g;
  },
  boiler() {
    const g = new THREE.Group();
    cyl(g, 0.85, 0.85, 2.4, '#6b5e4e', 0, 1.2, 0, 16);
    for (let i = 0; i < 4; i++) cyl(g, 0.87, 0.87, 0.05, '#3a332a', 0, 0.4 + i * 0.55, 0, 16);
    cyl(g, 0.12, 0.12, 1.2, '#7a6a55', 0, 2.8, 0, 8);
    box(g, 0.12, 0.12, 0.04, glow('#ff3a00', 1.2), 0, 1.3, 0.86);
    return g;
  },
  waterHeater() {
    const g = new THREE.Group();
    cyl(g, 0.42, 0.42, 1.7, '#d8dde0', 0, 0.85, 0, 14);
    cyl(g, 0.05, 0.05, 1.2, '#b87333', 0.2, 2.3, 0, 6);
    return g;
  },
  batteryShelf(f) {
    const g = PROPS.shelf(f);
    for (let i = 0; i < 8; i++) box(g, 0.18, 0.12, 0.12, i % 2 ? '#d4a017' : '#1d1d1d', -1.0 + i * 0.28, 1.2, 0);
    const p = signPlane('BATTERIES', 0, 0.2, { color: '#1a1a1a', bg: '#d4a017', font: 'bold 40px Arial', h: 56 });
    p.position.set(0, 2.0, 0.3);
    g.add(p);
    return g;
  },
  shelf(f) {
    const g = new THREE.Group();
    for (let s = 0; s < 4; s++) box(g, f.w, 0.04, f.d, STEEL, 0, 0.15 + s * 0.55, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.04, 1.9, 0.04, '#5c6670', (f.w / 2) * sx, 0.95, (f.d / 2) * sz);
    for (let i = 0; i < Math.floor(f.w / 0.6); i++) box(g, 0.45, 0.35, 0.4, '#a0805a', -f.w / 2 + 0.35 + i * 0.6, 0.35 + (i % 3) * 0.55, 0);
    return g;
  },
  lockers(f) {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const x = -f.w / 2 + 0.375 + i * 0.75;
      box(g, 0.72, 1.9, f.d, ['#5c7a8a', '#4f6b7a'][i % 2], x, 0.95, 0);
      for (let k = 0; k < 3; k++) box(g, 0.4, 0.02, 0.02, '#2e3d45', x, 1.6 + k * 0.06, f.d / 2 + 0.01);
    }
    return g;
  },
  staffTable(f) {
    const g = new THREE.Group();
    box(g, f.w, 0.05, f.d, '#c9b79c', 0, 0.75, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.05, 0.73, 0.05, STEEL, (f.w / 2 - 0.1) * sx, 0.37, (f.d / 2 - 0.1) * sz);
    cyl(g, 0.05, 0.045, 0.1, '#f4f1ea', 0.5, 0.82, 0.2, 10);
    box(g, 0.3, 0.02, 0.22, '#f8f8f8', -0.6, 0.79, -0.1).rotation.y = 0.4;
    box(g, 0.35, 0.06, 0.35, '#c1121f', 0.9, 0.81, -0.3);
    return g;
  },
  couch(f) { return PROPS.sofa({ ...f, color: '#4f5b66' }); },
  corkboard() {
    const g = new THREE.Group();
    box(g, 1.6, 1.0, 0.04, '#b5895a', 0, 1.6, 0);
    const notes = ['#fff59d', '#f8bbd0', '#b3e5fc', '#ffffff'];
    for (let i = 0; i < 6; i++) box(g, 0.25, 0.25, 0.01, notes[i % 4], -0.55 + (i % 3) * 0.55, 1.85 - Math.floor(i / 3) * 0.45, 0.03).rotation.z = (i - 3) * 0.08;
    const p = signPlane('DO NOT GO IN THE BASEMENT', 1.4, 0.12, { color: '#8b0000', bg: '#ffffff', font: 'bold 34px Arial', h: 48 });
    p.position.set(0, 1.18, 0.03);
    g.add(p);
    return g;
  },
  basementDoor() {
    const g = new THREE.Group();
    box(g, 1.5, 2.4, 0.1, '#2b1d14', 0, 1.2, 0);
    for (let i = 0; i < 3; i++) box(g, 1.6, 0.05, 0.14, '#5a5a5a', 0, 0.6 + i * 0.6, 0.04).rotation.z = (i - 1) * 0.25;
    box(g, 0.2, 0.25, 0.12, '#7a6a2a', 0.1, 1.2, 0.1);
    return g;
  },
  lounger() {
    const g = new THREE.Group();
    box(g, 0.7, 0.08, 2.0, '#f4f1ea', 0, 0.38, 0);
    const back = box(g, 0.7, 0.08, 0.8, '#f4f1ea', 0, 0.6, -0.78);
    back.rotation.x = -0.6;
    for (let i = 0; i < 6; i++) box(g, 0.66, 0.085, 0.12, '#2a9d8f', 0, 0.385, -0.2 + i * 0.22);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.04, 0.36, 0.04, STEEL, 0.3 * sx, 0.18, 0.85 * sz);
    return g;
  },
  umbrella() {
    const g = new THREE.Group();
    cyl(g, 0.03, 0.03, 2.3, '#e8e8e8', 0, 1.15, 0, 6);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.5, 8), mat('#e76f51'));
    top.position.y = 2.4;
    g.add(top);
    return g;
  },
  lifeguardChair() {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.06, 1.8, 0.06, '#f4f1ea', 0.3 * sx, 0.9, 0.3 * sz);
    box(g, 0.7, 0.06, 0.7, '#f4f1ea', 0, 1.8, 0);
    box(g, 0.7, 0.6, 0.06, '#c1121f', 0, 2.1, -0.33);
    return g;
  },
  dumpster(f) {
    const g = new THREE.Group();
    box(g, f.w, 1.3, f.d, '#2d6a4f', 0, 0.7, 0);
    const lid = box(g, f.w + 0.05, 0.08, f.d * 0.55, '#1b4332', 0, 1.42, -f.d * 0.2);
    lid.rotation.x = -0.25;
    for (const sx of [-1, 1]) cyl(g, 0.1, 0.1, 0.1, '#111', 1.2 * sx, 0.1, 0.7, 8).rotation.x = Math.PI / 2;
    const p = signPlane('DUMPSTER', 1.6, 0.25, { color: '#ffffff', bg: '#1b4332', font: 'bold 40px Arial', h: 56 });
    p.position.set(0, 0.9, f.d / 2 + 0.01);
    g.add(p);
    return g;
  },
  valetPodium() {
    const g = new THREE.Group();
    box(g, 0.6, 1.1, 0.5, '#7a1f2b', 0, 0.55, 0);
    box(g, 0.66, 0.05, 0.56, BRASS, 0, 1.12, 0);
    return g;
  },
  bollard() {
    const g = new THREE.Group();
    cyl(g, 0.13, 0.15, 0.9, '#e9c46a', 0, 0.45, 0, 10);
    cyl(g, 0.135, 0.135, 0.08, '#1a1a1a', 0, 0.7, 0, 10);
    return g;
  },
  lamp() {
    const g = new THREE.Group();
    cyl(g, 0.16, 0.2, 0.4, '#1f1f1f', 0, 0.2, 0, 8);
    cyl(g, 0.07, 0.1, 4.6, '#2b2b2b', 0, 2.3, 0, 8);
    box(g, 0.9, 0.08, 0.12, '#2b2b2b', 0.35, 4.55, 0);
    box(g, 0.46, 0.14, 0.34, '#1f1f1f', 0.65, 4.56, 0);
    box(g, 0.4, 0.1, 0.3, LIGHTS.outdoor, 0.65, 4.46, 0);
    box(g, 0.44, 0.06, 0.32, SNOW, 0.65, 4.66, 0);
    cyl(g, 0.3, 0.38, 0.22, SNOW, 0, 0.08, 0, 9);
    return g;
  },
  // A snow-laden pine: layered boughs, each with a cap of snow.
  tree(f) {
    const g = new THREE.Group();
    const seed = Math.abs(f.x * 7 + f.z * 3);
    const s = 0.95 + ((seed % 10) / 10) * 0.6;
    cyl(g, 0.16 * s, 0.26 * s, 2.0 * s, '#3b2a1e', 0, 1.0 * s, 0, 7);
    const greens = ['#1b3524', '#20402b', '#173020'];
    for (let i = 0; i < 4; i++) {
      const r = (1.9 - i * 0.42) * s, h = 1.7 * s, y = (1.8 + i * 0.95) * s;
      const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), mat(greens[(i + seed) % 3]));
      c.position.y = y;
      c.rotation.y = i * 0.7;
      g.add(c);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.72, h * 0.42, 9), mat(SNOW));
      cap.position.y = y + h * 0.3;
      cap.rotation.y = i * 0.7;
      g.add(cap);
    }
    cyl(g, 1.3 * s, 1.6 * s, 0.25, SNOW, 0, 0.06, 0, 10);
    return g;
  },
  snowbank(f) {
    const g = new THREE.Group();
    const n = Math.max(2, Math.round(f.w / 2.2)), h = f.low ? 0.45 : 0.8;
    for (let i = 0; i < n; i++) {
      const x = -f.w / 2 + (i + 0.5) * (f.w / n);
      ball(g, 1, SNOW, x, 0, (i % 2 ? 0.1 : -0.1) * f.d, (f.w / n) * 0.75, h * (0.8 + ((i * 7) % 5) / 10), f.d * 0.62);
    }
    return g;
  },
  mazeHedge(f) {
    const g = new THREE.Group();
    box(g, f.w, 2.3, f.d, '#203d22', 0, 1.15, 0);
    box(g, f.w - 0.1, 0.08, f.d + 0.06, '#26472a', 0, 0.6, 0);
    box(g, f.w + 0.04, 0.22, f.d + 0.08, SNOW, 0, 2.38, 0);
    return g;
  },
  mazeStatue() {
    const g = new THREE.Group();
    box(g, 1.2, 0.5, 1.2, '#8d8a84', 0, 0.25, 0);
    cyl(g, 0.3, 0.4, 1.1, '#a7a39b', 0, 1.05, 0, 10);
    ball(g, 0.36, '#a7a39b', 0, 1.85, 0, 1, 1.2, 1);
    box(g, 1.24, 0.12, 1.24, SNOW, 0, 0.56, 0);
    ball(g, 0.3, SNOW, 0, 2.18, 0, 1, 0.4, 1);
    return g;
  },
  postSign(f) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) cyl(g, 0.05, 0.05, 1.6, '#4a3424', 0.6 * s, 0.8, 0, 6);
    box(g, 1.5, 0.5, 0.06, '#5a3a24', 0, 1.35, 0);
    const p = signPlane(f.text || '', 1.4, 0.18, { color: '#f3e6c4', bg: '#3a2416', font: 'bold 34px Georgia, serif', h: 52 });
    p.position.set(0, 1.35, 0.035);
    g.add(p);
    box(g, 1.56, 0.08, 0.14, SNOW, 0, 1.63, 0);
    return g;
  },
  // A great stone fireplace with a fire that never quite goes out.
  fireplace(f) {
    const g = new THREE.Group();
    const stone = '#6d655c';
    box(g, f.w, 1.6, f.d, stone, 0, 0.8, 0);
    box(g, f.w * 0.62, 3.2, f.d * 0.8, stone, 0, 1.6, -0.05);
    box(g, f.w + 0.2, 0.16, f.d + 0.2, '#4a3b30', 0, 1.62, 0.02);
    box(g, 1.3, 0.9, 0.05, '#120a06', 0, 0.62, f.d / 2 + 0.01);
    for (let i = 0; i < 3; i++) box(g, 0.7, 0.1, 0.14, '#3a2416', -0.1 + (i - 1) * 0.12, 0.25 + i * 0.06, f.d / 2 - 0.05).rotation.y = (i - 1) * 0.5;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 7), LIGHTS.fire);
    flame.position.set(0, 0.55, f.d / 2 - 0.06);
    g.add(flame);
    box(g, 0.9, 0.12, 0.08, LIGHTS.fire, 0, 0.3, f.d / 2 - 0.02);
    for (let y = 0.3; y < 3.2; y += 0.42) for (let x = -1; x <= 1; x++) box(g, 0.34, 0.05, 0.02, '#5a534b', x * 0.42 + (y * 7 % 1) * 0.1, y, f.d * 0.4 + 0.01);
    return g;
  },
  typewriter(f) {
    const g = new THREE.Group();
    const y = f.y || 0.77;
    box(g, 0.42, 0.12, 0.32, '#1f2a24', 0, y + 0.06, 0);
    box(g, 0.44, 0.06, 0.08, '#2b2b2b', 0, y + 0.16, -0.1);
    for (let i = 0; i < 4; i++) box(g, 0.34, 0.02, 0.04, '#d8d0c0', 0, y + 0.13, 0.02 + i * 0.03);
    const paper = box(g, 0.24, 0.3, 0.005, '#f4efe2', 0, y + 0.3, -0.12);
    paper.rotation.x = -0.25;
    const p = signPlane('ALL WORK AND NO PLAY', 0.22, 0.03, { color: '#2a2a2a', bg: '#f4efe2', font: '600 26px "Courier New", monospace', h: 40, pad: 4 });
    p.position.set(0, y + 0.35, -0.115);
    p.rotation.x = -0.25;
    g.add(p);
    for (let i = 0; i < 5; i++) box(g, 0.22, 0.004, 0.3, '#f4efe2', 0.32 + (i % 2) * 0.03, y + 0.005 + i * 0.006, 0.05).rotation.y = i * 0.15;
    return g;
  },
  bookshelf(f) {
    const g = new THREE.Group();
    box(g, f.w, 2.3, f.d, '#3a2416', 0, 1.15, 0);
    const cols = ['#7a1f2b', '#1d3557', '#2d6a4f', '#b08d3c', '#4a2c1a', '#5c4b3b'];
    for (let s = 0; s < 5; s++) {
      box(g, f.w - 0.1, 0.04, f.d - 0.04, '#2a1a10', 0, 0.12 + s * 0.44, 0.02);
      let x = -f.w / 2 + 0.12;
      while (x < f.w / 2 - 0.12) {
        const w = 0.05 + ((x * 31 + s * 7) % 1 + 1) % 1 * 0.06, h = 0.26 + ((x * 13 + s) % 1 + 1) % 1 * 0.12;
        box(g, w, h, f.d - 0.12, cols[Math.floor(Math.abs(x * 10 + s * 3)) % cols.length], x + w / 2, 0.14 + s * 0.44 + h / 2, 0.04);
        x += w + 0.01;
      }
    }
    return g;
  },
  vacancySign() {
    const g = new THREE.Group();
    for (const s of [-1, 1]) cyl(g, 0.08, 0.08, 4, '#2b2b2b', 1.3 * s, 2, 0, 8);
    box(g, 3, 1.6, 0.2, '#1d1d24', 0, 4.3, 0);
    const t = signPlane('THE LAST RESORT', 2.8, 0.55, { color: '#ffd166', bg: '#1d1d24', font: 'bold 54px Georgia, serif', h: 80 });
    t.position.set(0, 4.65, 0.11);
    g.add(t);
    const v = signPlane('VACANCY', 2.2, 0.5, { color: '#ff3d6e', bg: '#1d1d24', font: 'bold 64px Arial', h: 80 });
    v.position.set(0, 4.0, 0.11);
    g.add(v);
    g.userData.neon = v;
    return g;
  },
  hotelSign() {
    const g = new THREE.Group();
    box(g, 9.6, 1.5, 0.25, '#14141a', 0, 4.4, 0);
    const letters = 'THE LAST RESORT';
    const meshes = [];
    let x = -4.3;
    for (const ch of letters) {
      if (ch !== ' ') {
        const p = signPlane(ch, 0.58, 1.0, { color: '#ffffff', bg: null, font: 'bold 120px Georgia, serif', h: 140, pad: 4 });
        p.position.set(x, 4.4, 0.14);
        g.add(p);
        meshes.push(p);
      }
      x += 0.62;
    }
    g.userData.letters = meshes;
    return g;
  },
  awning() {
    const g = new THREE.Group();
    const a = box(g, 7, 0.12, 3.2, '#5a1f2b', 0, 3.0, 1.6);
    a.rotation.x = 0.08;
    for (const s of [-1, 1]) cyl(g, 0.06, 0.06, 3.0, BRASS, 3.3 * s, 1.5, 3.0, 8);
    for (let i = 0; i < 6; i++) ball(g, 0.08, LIGHTS.outdoor, -2.5 + i, 2.88, 2.6);
    return g;
  },
};

// ---------- suites and the presidential suite ----------
const VELVET = '#26365f', CLARET = '#5c1a28', GOLD = '#d4a017';
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
Object.assign(PROPS, {
  kingBed() {
    const g = new THREE.Group();
    rbox(g, 2.0, 0.32, 2.25, DARKWOOD, 0, 0.16, 0);
    rbox(g, 1.92, 0.24, 2.15, '#f6f2ea', 0, 0.44, 0.02);
    rbox(g, 1.96, 0.07, 1.4, VELVET, 0, 0.58, 0.4);
    rbox(g, 1.98, 0.075, 0.28, GOLD, 0, 0.585, 0.75);
    rbox(g, 2.1, 1.35, 0.12, '#3b2a4a', 0, 0.75, -0.98);
    for (let i = 0; i < 5; i++) rbox(g, 0.03, 1.15, 0.02, '#2a1d35', -0.8 + i * 0.4, 0.8, -0.91);
    rbox(g, 2.14, 0.08, 0.16, BRASS, 0, 1.45, -0.98);
    for (const s of [-1, 1]) { rbox(g, 0.62, 0.16, 0.36, WHITE, 0.48 * s, 0.63, -0.82); rbox(g, 0.48, 0.14, 0.18, VELVET, 0.3 * s, 0.67, -0.6); }
    return g;
  },
  wingback() {
    const g = new THREE.Group();
    rbox(g, 0.85, 0.42, 0.8, VELVET, 0, 0.26, 0);
    rbox(g, 0.85, 0.95, 0.16, VELVET, 0, 0.85, -0.33);
    for (const s of [-1, 1]) { rbox(g, 0.13, 0.36, 0.72, VELVET, 0.37 * s, 0.6, 0); rbox(g, 0.1, 0.45, 0.3, VELVET, 0.38 * s, 1.05, -0.2); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) rbox(g, 0.05, 0.08, 0.05, DARKWOOD, 0.35 * sx, 0.04, 0.33 * sz);
    return g;
  },
  ottoman() {
    const g = new THREE.Group();
    rbox(g, 0.6, 0.36, 0.5, VELVET, 0, 0.22, 0);
    rbox(g, 0.62, 0.04, 0.52, BRASS, 0, 0.03, 0);
    return g;
  },
  floorLamp() {
    const g = new THREE.Group();
    cyl(g, 0.16, 0.18, 0.04, BRASS, 0, 0.02, 0, 10);
    cyl(g, 0.02, 0.02, 1.5, BRASS, 0, 0.77, 0, 6);
    cyl(g, 0.17, 0.24, 0.3, LIGHTS.lamp, 0, 1.6, 0, 12);
    return g;
  },
  vase(f) {
    const g = new THREE.Group();
    const y = f.y || 0;
    cyl(g, 0.06, 0.1, 0.28, '#1d3557', 0, y + 0.14, 0, 10);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26;
      cyl(g, 0.006, 0.006, 0.3, '#2f6b2f', Math.cos(a) * 0.04, y + 0.4, Math.sin(a) * 0.04, 4);
      ball(g, 0.045, i % 2 ? '#c1121f' : '#f4f1de', Math.cos(a) * 0.07, y + 0.56, Math.sin(a) * 0.07);
    }
    return g;
  },
  minibar() {
    const g = new THREE.Group();
    box(g, 0.5, 0.85, 0.5, '#2a1a10', 0, 0.425, 0);
    box(g, 0.4, 0.6, 0.02, LIGHTS.vending, 0, 0.45, 0.255);
    for (let i = 0; i < 3; i++) cyl(g, 0.035, 0.04, 0.22, ['#1b4332', '#7a1f2b', '#d4a017'][i], -0.13 + i * 0.13, 0.96, 0, 8);
    return g;
  },
  // Luxury bedding laid over a standard bed or king bed.
  bedding(f) {
    const g = new THREE.Group();
    const w = f.king ? 2.0 : 1.82;
    box(g, w, 0.09, 1.5, '#f8f4ec', 0, 0.6, 0.36);
    box(g, w + 0.02, 0.1, 0.32, GOLD, 0, 0.61, 0.75);
    for (const s of [-1, 1]) box(g, 0.55, 0.2, 0.3, '#f8f4ec', (w / 4) * s, 0.74, -0.7);
    box(g, 0.08, 0.02, 0.06, '#3a2416', 0.25, 0.71, -0.45);
    return g;
  },
  fourPoster() {
    const g = new THREE.Group();
    rbox(g, 2.3, 0.36, 2.5, DARKWOOD, 0, 0.18, 0);
    rbox(g, 2.2, 0.26, 2.4, '#f6f2ea', 0, 0.48, 0.02);
    rbox(g, 2.24, 0.08, 1.6, CLARET, 0, 0.64, 0.45);
    rbox(g, 2.26, 0.085, 0.3, GOLD, 0, 0.645, 0.85);
    rbox(g, 2.3, 1.5, 0.12, DARKWOOD, 0, 0.9, -1.22);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.06, 0.07, 2.5, DARKWOOD, 1.12 * sx, 1.25, 1.2 * sz, 8);
    rbox(g, 2.36, 0.1, 2.5, DARKWOOD, 0, 2.52, 0);
    rbox(g, 2.32, 0.32, 2.46, CLARET, 0, 2.32, 0);
    for (const sx of [-1, 1]) rbox(g, 0.06, 1.9, 0.45, CLARET, 1.16 * sx, 1.45, 1.0);
    for (let i = 0; i < 4; i++) rbox(g, 0.5, 0.2, 0.3, i % 3 ? WHITE : CLARET, -0.75 + i * 0.5, 0.76, -0.98);
    return g;
  },
  wardrobe(f) {
    const g = new THREE.Group();
    box(g, f.w, 2.2, f.d, '#3a2416', 0, 1.1, 0);
    box(g, f.w + 0.1, 0.12, f.d + 0.1, '#2a1a10', 0, 2.26, 0);
    box(g, 0.02, 2.0, 0.02, '#1d120a', 0, 1.1, f.d / 2 + 0.01);
    for (const s of [-1, 1]) box(g, 0.04, 0.22, 0.05, BRASS, 0.08 * s, 1.15, f.d / 2 + 0.03);
    return g;
  },
  vanityTable(f) {
    const g = new THREE.Group();
    box(g, f.w, 0.06, f.d, '#f4efe2', 0, 0.78, 0);
    for (const sx of [-1, 1]) box(g, 0.06, 0.76, f.d - 0.06, '#e8dfc8', (f.w / 2 - 0.05) * sx, 0.38, 0);
    box(g, 0.9, 1.0, 0.04, BRASS, 0, 1.4, -f.d / 2 + 0.02);
    box(g, 0.8, 0.9, 0.02, mat('#bfd6e6', { emissive: '#3a4e5c', emissiveIntensity: 0.3 }), 0, 1.4, -f.d / 2 + 0.05);
    cyl(g, 0.2, 0.2, 0.45, CLARET, 0, 0.23, 0.55, 12);
    return g;
  },
  presTV(f) {
    const g = new THREE.Group();
    box(g, f.w, 0.55, f.d, '#1d120a', 0, 0.28, 0);
    box(g, 1.9, 1.07, 0.06, '#0d0d0d', 0, 1.4, -0.12);
    box(g, 1.82, 0.99, 0.01, '#121a26', 0, 1.4, -0.085);
    for (const s of [-1, 1]) box(g, 0.2, 0.9, 0.2, '#111', 0.95 * s, 1.0, 0);
    return g;
  },
  grandPiano() {
    const g = new THREE.Group();
    const black = mat('#0b0b0d');
    box(g, 1.5, 0.35, 2.0, black, 0, 0.85, 0);
    cyl(g, 0.75, 0.75, 0.35, black, -0.05, 0.85, -0.9, 16);
    box(g, 0.3, 0.06, 1.32, WHITE, 0.86, 0.8, 0);
    for (let i = 0; i < 9; i++) box(g, 0.16, 0.03, 0.06, '#111', 0.8, 0.84, -0.56 + i * 0.14);
    const lid = box(g, 1.4, 0.03, 1.9, black, -0.3, 1.4, -0.1);
    lid.rotation.z = 0.55;
    cyl(g, 0.012, 0.012, 0.7, BRASS, 0.2, 1.3, 0, 4).rotation.z = 0.55;
    for (const [x, z] of [[0.6, 0.85], [0.6, -0.85], [-0.6, -1.3]]) cyl(g, 0.06, 0.05, 0.68, black, x, 0.34, z, 8);
    box(g, 0.4, 0.5, 0.9, black, 1.78, 0.25, 0);
    box(g, 0.42, 0.06, 0.92, CLARET, 1.78, 0.52, 0);
    return g;
  },
  bar(f) {
    const g = new THREE.Group();
    box(g, f.w, 1.05, f.d, '#2a1a10', 0, 0.525, 0);
    box(g, f.w + 0.1, 0.06, f.d + 0.1, '#1a1a1a', 0, 1.08, 0);
    box(g, f.w, 0.04, 0.04, BRASS, 0, 0.2, f.d / 2 + 0.04);
    const colors = ['#1b4332', '#7a1f2b', '#d4a017', '#2d3a4a', '#f4f1de'];
    for (let i = 0; i < 7; i++) cyl(g, 0.035, 0.04, 0.3, colors[i % 5], -0.75 + i * 0.25, 1.26, -0.15, 8);
    for (let i = 0; i < 3; i++) cyl(g, 0.04, 0.03, 0.12, mat('#dfe9f2', { transparent: true, opacity: 0.6 }), -0.4 + i * 0.4, 1.17, 0.15, 8);
    for (let s = 0; s < 2; s++) box(g, f.w, 0.04, 0.3, '#2a1a10', 0, 1.6 + s * 0.45, -0.55);
    for (let i = 0; i < 6; i++) cyl(g, 0.035, 0.04, 0.3, colors[(i + 2) % 5], -0.7 + i * 0.28, 1.78, -0.55, 8);
    return g;
  },
  jacuzzi(f) {
    const g = new THREE.Group();
    const s = f.w, t = 0.28, h = 0.5;
    for (const k of [-1, 1]) { box(g, s, h, t, '#f4f1ea', 0, h / 2, (s / 2 - t / 2) * k); box(g, t, h, s - 2 * t, '#f4f1ea', (s / 2 - t / 2) * k, h / 2, 0); }
    box(g, s - 2 * t, 0.02, s - 2 * t, '#2b87a3', 0, 0.02, 0);
    const water = keep(new THREE.Mesh(new THREE.PlaneGeometry(s - 2 * t, s - 2 * t), mat('#58c8e0', { transparent: true, opacity: 0.6, emissive: '#0d4a5c', emissiveIntensity: 0.5, depthWrite: false })));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.4;
    g.add(water);
    for (const k of [-1, 1]) cyl(g, 0.04, 0.04, 0.2, STEEL, 0.6 * k, 0.6, -s / 2 + 0.15, 6);
    return g;
  },
  doubleSink(f) {
    const g = new THREE.Group();
    box(g, f.w, 0.85, f.d, '#e8dfc8', 0, 0.425, 0);
    box(g, f.w + 0.04, 0.06, f.d + 0.04, '#2c3531', 0, 0.88, 0);
    for (const s of [-1, 1]) { box(g, 0.5, 0.05, 0.36, WHITE, 0.55 * s, 0.92, 0.04); box(g, 0.04, 0.14, 0.04, BRASS, 0.55 * s, 1.0, -0.2); }
    box(g, f.w, 0.9, 0.04, BRASS, 0, 1.6, -f.d / 2 + 0.02);
    box(g, f.w - 0.1, 0.8, 0.02, mat('#bfd6e6', { emissive: '#3a4e5c', emissiveIntensity: 0.3 }), 0, 1.6, -f.d / 2 + 0.05);
    return g;
  },
  shower(f) {
    const g = new THREE.Group();
    box(g, f.w, 0.08, f.d, '#f4f1ea', 0, 0.04, 0);
    const glass = mat('#cfe8f5', { transparent: true, opacity: 0.28, depthWrite: false });
    for (const [w, d, x, z] of [[f.w, 0.03, 0, f.d / 2], [0.03, f.d, f.w / 2, 0]]) {
      const pane = keep(new THREE.Mesh(UNIT_BOX, glass));
      pane.scale.set(w, 2.1, d);
      pane.position.set(x, 1.13, z);
      g.add(pane);
    }
    cyl(g, 0.02, 0.02, 0.4, STEEL, -f.w / 2 + 0.2, 2.1, -f.d / 2 + 0.2, 6);
    cyl(g, 0.14, 0.14, 0.03, STEEL, -f.w / 2 + 0.35, 2.05, -f.d / 2 + 0.35, 12);
    return g;
  },
});

// ---------- upgrade fixtures ----------
Object.assign(PROPS, {
  // Sealed-off construction across a corridor that hasn't been bought yet.
  barrier(f) {
    const g = new THREE.Group();
    const w = f.w || 4;
    const sheet = keep(new THREE.Mesh(new THREE.PlaneGeometry(w, 3.1), mat('#c9ced2', { transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false })));
    sheet.position.set(0, 1.55, -0.3);
    g.add(sheet);
    const n = Math.round(w / 0.5);
    for (const y of [0.6, 1.15]) for (let i = 0; i < n; i++) box(g, w / n, 0.2, 0.05, i % 2 ? '#f8f9fa' : '#e85d04', -w / 2 + (i + 0.5) * (w / n), y, 0);
    for (const s of [-1, 1]) for (const k of [-1, 1]) { const leg = box(g, 0.06, 1.25, 0.06, '#c9c2b5', (w / 2 - 0.35) * s, 0.6, 0.25 * k); leg.rotation.x = 0.2 * k; }
    const t = signPlane(`${f.label || 'NEW WING'} — OPENING SOON`, 0, 0.3, { color: '#1a1a1a', bg: '#f2d64b', font: 'bold 40px Arial', h: 56 });
    t.position.set(0, 1.62, 0.04);
    g.add(t);
    box(g, 0.25, 0.25, 0.25, glow('#ff8a00', 1.5), (w / 2 - 0.35), 1.35, 0);
    return g;
  },
  garlic() {
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      ball(g, 0.055, '#f1ead8', -0.6 + t * 1.2, 2.34 - Math.sin(t * Math.PI) * 0.14, 0.03, 1, 1.15, 1);
    }
    for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6; box(g, 0.2, 0.012, 0.012, '#8a7a5a', -0.6 + t * 1.2, 2.36 - Math.sin(t * Math.PI) * 0.14, 0.03); }
    return g;
  },
  salt() {
    const g = new THREE.Group();
    box(g, 1.3, 0.008, 0.1, '#f7f7f7', 0, 0.005, 0);
    return g;
  },
  snackMachine(f) {
    const g = new THREE.Group();
    box(g, f.w, 1.85, f.d, '#1d3557', 0, 0.93, 0);
    box(g, f.w - 0.35, 1.25, 0.02, LIGHTS.vending, -0.1, 1.1, f.d / 2 + 0.01);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) box(g, 0.14, 0.12, 0.03, ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a'][(r + c) % 4], -0.32 + c * 0.17, 0.62 + r * 0.24, f.d / 2 + 0.02);
    box(g, 0.18, 0.4, 0.02, '#111', f.w / 2 - 0.15, 1.2, f.d / 2 + 0.01);
    const p = signPlane('SNACKS', 0, 0.16, { color: '#ffffff', bg: '#e63946', font: 'bold 40px Arial', h: 56 });
    p.position.set(0, 1.74, f.d / 2 + 0.02);
    g.add(p);
    return g;
  },
  arcade(f) {
    const g = new THREE.Group();
    const c = f.seed === 1 ? '#3a0ca3' : '#9d0208';
    box(g, f.w, 1.65, f.d, c, 0, 0.83, 0);
    const scr = box(g, f.w - 0.12, 0.45, 0.04, LIGHTS.arcade, 0, 1.25, f.d / 2 - 0.08);
    scr.rotation.x = -0.25;
    box(g, f.w, 0.12, 0.3, '#111', 0, 0.95, f.d / 2 + 0.05);
    ball(g, 0.035, '#e63946', -0.12, 1.03, f.d / 2 + 0.06);
    for (let i = 0; i < 2; i++) ball(g, 0.025, '#ffd166', 0.08 + i * 0.09, 1.02, f.d / 2 + 0.08);
    const p = signPlane(f.seed === 1 ? 'GHOST RACER' : 'HAUNT-MAN', f.w - 0.06, 0.16, { color: '#ffd166', bg: '#111111', font: 'bold 40px Arial', h: 56 });
    p.position.set(0, 1.58, f.d / 2 + 0.01);
    g.add(p);
    return g;
  },
  kiosk() {
    const g = new THREE.Group();
    box(g, 0.45, 1.0, 0.35, '#2b2f33', 0, 0.5, 0);
    const s = box(g, 0.55, 0.42, 0.06, '#1a1a1a', 0, 1.25, 0.05);
    s.rotation.x = -0.35;
    const scr = box(g, 0.48, 0.35, 0.01, LIGHTS.screen, 0, 1.26, 0.09);
    scr.rotation.x = -0.35;
    const p = signPlane('SELF CHECK-IN', 0.55, 0.12, { color: '#ffffff', bg: '#2a6f97', font: 'bold 36px Arial', h: 52 });
    p.position.set(0, 1.62, 0.02);
    g.add(p);
    return g;
  },
  giftShop(f) {
    const g = new THREE.Group();
    box(g, f.w, 0.95, f.d, '#5a3a24', 0, 0.48, 0);
    box(g, f.w + 0.05, 0.05, f.d + 0.05, BRASS, 0, 0.97, 0);
    for (let i = 0; i < 3; i++) {
      cyl(g, 0.07, 0.07, 0.04, '#3a2416', -0.5 + i * 0.5, 1.02, 0.15, 10);
      ball(g, 0.08, mat('#cfe8f5', { transparent: true, opacity: 0.6 }), -0.5 + i * 0.5, 1.12, 0.15);
    }
    for (let i = 0; i < 4; i++) cyl(g, 0.05, 0.05, 0.1, ['#f4f1de', '#c1121f', '#1d3557', '#f4f1de'][i], -0.6 + i * 0.4, 1.04, -0.2, 10);
    for (let s = 0; s < 2; s++) box(g, f.w, 0.04, 0.3, WOOD, 0, 1.55 + s * 0.45, -f.d / 2 + 0.15);
    for (let i = 0; i < 5; i++) box(g, 0.18, 0.22, 0.14, ['#e76f51', '#2a9d8f', '#e9c46a', '#8338ec', '#f4f1de'][i], -0.6 + i * 0.3, 1.7, -f.d / 2 + 0.15);
    const p = signPlane('GIFTS & SOUVENIRS', 0, 0.2, { color: '#3a1d1d', bg: '#e9c46a', font: '600 40px Georgia, serif', h: 56 });
    p.position.set(0, 2.25, -f.d / 2 + 0.02);
    g.add(p);
    return g;
  },
  cookies(f) {
    const g = new THREE.Group();
    const y = f.y || 1.11;
    cyl(g, 0.16, 0.14, 0.02, WHITE, 0, y, 0, 14);
    for (let i = 0; i < 5; i++) cyl(g, 0.05, 0.05, 0.018, '#b5793a', Math.cos(i * 1.3) * 0.07, y + 0.02 + (i > 2 ? 0.018 : 0), Math.sin(i * 1.3) * 0.07, 10);
    return g;
  },
  monitor2(f) {
    const g = new THREE.Group();
    const y = f.y || 1.11;
    box(g, 0.08, 0.14, 0.08, '#1a1a1a', 0, y + 0.07, 0);
    box(g, 0.44, 0.3, 0.04, '#1a1a1a', 0, y + 0.28, 0);
    box(g, 0.4, 0.26, 0.01, glow('#c1121f', 0.9), 0, y + 0.28, 0.022);
    return g;
  },
  keyBox() {
    const g = new THREE.Group();
    box(g, 0.12, 1.0, 0.12, '#2a1a10', 0, 0.5, 0);
    box(g, 0.4, 0.32, 0.32, BRASS, 0, 1.15, 0);
    box(g, 0.24, 0.03, 0.02, '#1a1a1a', 0, 1.24, 0.165);
    const p = signPlane('KEY DROP', 0.36, 0.1, { color: '#3a1d1d', bg: '#f3e6c4', font: 'bold 34px Arial', h: 48 });
    p.position.set(0, 1.08, 0.17);
    g.add(p);
    return g;
  },
  wallSign(f) {
    const g = new THREE.Group();
    const p = signPlane(f.text, f.w, 0.24, { color: '#f3e6c4', bg: '#1d3557', font: '600 40px Georgia, serif', h: 56 });
    p.position.set(0, f.y || 1.6, 0.02);
    g.add(p);
    return g;
  },
  // Lobby Makeover I: brass lamps, velvet queue ropes and wall sconces (positions are world space).
  lobbyLamps() {
    const g = new THREE.Group();
    for (const [x, z] of [[-9.5, 3.7], [-4.7, 7.35], [9.4, 0.3]]) {
      cyl(g, 0.2, 0.22, 0.05, BRASS, x, 0.025, z, 10);
      cyl(g, 0.025, 0.025, 1.7, BRASS, x, 0.88, z, 6);
      cyl(g, 0.2, 0.28, 0.34, LIGHTS.lamp, x, 1.85, z, 12);
    }
    const posts = [];
    for (const x of [4.9, 7.1]) for (const z of [-5.4, -3.2, -1.0]) { posts.push([x, z]); cyl(g, 0.05, 0.05, 0.95, BRASS, x, 0.48, z, 8); ball(g, 0.06, BRASS, x, 0.98, z); cyl(g, 0.15, 0.15, 0.03, BRASS, x, 0.015, z, 10); }
    for (const x of [4.9, 7.1]) for (const z of [-4.3, -2.1]) { const r = box(g, 0.035, 0.035, 2.2, CLARET, x, 0.82, z); r.scale.y = 0.035; }
    for (const [x, z, ry] of [[-9.84, 1.0, Math.PI / 2], [-9.84, -2.2, Math.PI / 2], [9.84, -4.6, -Math.PI / 2], [9.84, 6.4, -Math.PI / 2]]) {
      const s = new THREE.Group();
      box(s, 0.14, 0.24, 0.06, BRASS, 0, 2.2, 0);
      cyl(s, 0.08, 0.12, 0.18, LIGHTS.lamp, 0, 2.32, 0.1, 8);
      s.position.set(x, 0, z);
      s.rotation.y = ry;
      g.add(s);
    }
    return g;
  },
  // Lobby Makeover II: gilded portraits whose eyes follow you at night, a stopped clock and a bust.
  lobbyPortraits() {
    const g = new THREE.Group();
    const faces = ['#e0ac69', '#f1c27d', '#c68642', '#ffdbac'];
    [[-9.84, 5.4, Math.PI / 2], [9.84, -0.6, -Math.PI / 2], [9.84, 6.6, -Math.PI / 2], [-9.84, -3.0, Math.PI / 2]].forEach(([x, z, ry], i) => {
      const p = new THREE.Group();
      box(p, 1.0, 1.3, 0.08, GOLD, 0, 2.05, 0);
      box(p, 0.84, 1.14, 0.02, ['#1b263b', '#2d1e2f', '#1a2e1f', '#2b1d14'][i], 0, 2.05, 0.05);
      box(p, 0.5, 0.3, 0.02, '#111', 0, 1.62, 0.06);
      box(p, 0.3, 0.38, 0.02, faces[i], 0, 2.15, 0.065);
      box(p, 0.32, 0.12, 0.02, '#2b1b0e', 0, 2.36, 0.066);
      for (const s of [-1, 1]) box(p, 0.045, 0.035, 0.01, LIGHTS.eyes, 0.065 * s, 2.2, 0.077);
      p.position.set(x, 0, z);
      p.rotation.y = ry;
      g.add(p);
    });
    const clock = new THREE.Group();
    box(clock, 0.55, 2.1, 0.4, '#2a1a10', 0, 1.05, 0);
    box(clock, 0.65, 0.12, 0.48, '#2a1a10', 0, 2.16, 0);
    cyl(clock, 0.2, 0.2, 0.02, '#f4efe2', 0, 1.75, 0.21, 16).rotation.x = Math.PI / 2;
    box(clock, 0.015, 0.14, 0.01, '#111', 0.02, 1.79, 0.225).rotation.z = -1.4;
    box(clock, 0.015, 0.1, 0.01, '#111', 0, 1.72, 0.226).rotation.z = 2.6;
    box(clock, 0.3, 0.7, 0.01, '#1a0f08', 0, 0.95, 0.205);
    cyl(clock, 0.07, 0.07, 0.02, BRASS, 0, 0.8, 0.215, 12).rotation.x = Math.PI / 2;
    clock.position.set(-9.45, 0, -10.45);
    g.add(clock);
    cyl(g, 0.25, 0.3, 1.1, '#e7dfcc', -2.6, 0.55, -10.4, 10);
    box(g, 0.34, 0.4, 0.26, '#d9d2c3', -2.6, 1.3, -10.4);
    box(g, 0.2, 0.26, 0.22, '#d9d2c3', -2.6, 1.62, -10.38);
    return g;
  },
  buffetFood() {
    const g = new THREE.Group();
    const y = 1.08;
    for (let i = 0; i < 3; i++) cyl(g, 0.12, 0.12, 0.04, '#c98a3b', -1.8, y + i * 0.045, 0, 12);
    for (let i = 0; i < 4; i++) { cyl(g, 0.07, 0.07, 0.012, '#fbfbf5', -0.6 + (i % 2) * 0.16 - 0.08, y, (i < 2 ? -1 : 1) * 0.08, 10); ball(g, 0.026, '#f4b400', -0.6 + (i % 2) * 0.16 - 0.08, y + 0.012, (i < 2 ? -1 : 1) * 0.08, 1, 0.6, 1); }
    for (let i = 0; i < 4; i++) box(g, 0.22, 0.016, 0.04, '#8b3a1a', 0.6, y, -0.12 + i * 0.08);
    for (let i = 0; i < 5; i++) ball(g, 0.06, i % 2 ? '#f77f00' : '#d4a373', 1.7 + (i % 3) * 0.12 - 0.12, y + 0.04, (i < 3 ? -1 : 1) * 0.07, 1.3, 0.8, 1);
    const p = signPlane('HELP YOURSELF', 0, 0.16, { color: '#f3e6c4', bg: '#3a1d1d', font: '600 40px Georgia, serif', h: 56 });
    p.position.set(0, 1.5, -0.35);
    g.add(p);
    return g;
  },
  breadBox() {
    const g = new THREE.Group();
    box(g, 0.45, 0.24, 0.3, '#8a5a3a', 0, 1.05, 0);
    box(g, 0.47, 0.03, 0.32, '#6b4423', 0, 1.18, 0);
    box(g, 0.3, 0.1, 0.16, '#d9a35f', 0, 1.22, 0.02);
    return g;
  },
  toaster() {
    const g = new THREE.Group();
    box(g, 0.3, 0.2, 0.2, '#c8ccd0', 0, 1.03, 0);
    const m = new THREE.MeshLambertMaterial({ color: '#2a2a2a', emissive: '#ff3a00', emissiveIntensity: 0 });
    const slots = keep(new THREE.Mesh(UNIT_BOX, m));
    slots.scale.set(0.22, 0.01, 0.12);
    slots.position.set(0, 1.135, 0);
    g.add(slots);
    box(g, 0.03, 0.05, 0.03, '#1a1a1a', 0.16, 1.05, 0);
    g.userData.burners = [slots];
    return g;
  },
  juicer() {
    const g = new THREE.Group();
    box(g, 0.28, 0.35, 0.28, '#f77f00', 0, 1.1, -0.02);
    cyl(g, 0.1, 0.1, 0.06, '#e8e2d0', 0, 1.31, -0.02, 12);
    cyl(g, 0.07, 0.07, 0.2, mat('#ffb703', { transparent: true, opacity: 0.85 }), 0.2, 1.02, 0.08, 10);
    for (let i = 0; i < 3; i++) ball(g, 0.045, '#f77f00', -0.22, 0.97, -0.08 + i * 0.08);
    return g;
  },
  trayStack() {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) box(g, 0.42, 0.018, 0.3, i % 2 ? '#3a2416' : '#4a2c1a', 0, 0.93 + i * 0.02, 0);
    return g;
  },
  cooktop() {
    const g = new THREE.Group();
    box(g, 3.9, 0.02, 0.9, '#111316', 0, 0.935, 0);
    box(g, 3.9, 0.1, 0.05, '#4a5056', 0, 0.86, -0.63);
    const burners = [];
    for (let i = 0; i < 4; i++) {
      const x = -1.5 + i;
      const m = new THREE.MeshLambertMaterial({ color: '#2a2a2a', emissive: '#ff3a00', emissiveIntensity: 0 });
      const b = keep(new THREE.Mesh(cylGeo(0.17, 0.17, 0.03, 16), m));
      b.position.set(x, 0.95, 0);
      g.add(b);
      burners.push(b);
      box(g, 0.44, 0.022, 0.035, '#101214', x, 0.972, 0);
      box(g, 0.035, 0.022, 0.44, '#101214', x, 0.972, 0);
      cyl(g, 0.03, 0.03, 0.04, '#d8dadc', x, 0.86, -0.675, 10).rotation.x = Math.PI / 2;
    }
    g.userData.burners = burners;
    return g;
  },
  // Hot cocoa: a copper pot on a warmer, a ladle and a stack of mugs.
  cocoaPot() {
    const g = new THREE.Group();
    box(g, 0.36, 0.05, 0.32, '#2b2f33', 0, 0.955, 0);
    box(g, 0.03, 0.02, 0.01, glow('#ff6b2b', 1.2), 0.13, 0.955, 0.162);
    cyl(g, 0.15, 0.14, 0.26, '#b0603a', 0, 1.11, 0, 16);
    cyl(g, 0.156, 0.156, 0.03, '#8a4528', 0, 1.235, 0, 16);
    cyl(g, 0.136, 0.136, 0.01, '#4a2412', 0, 1.243, 0, 16);
    for (const s of [-1, 1]) box(g, 0.05, 0.03, 0.08, '#8a4528', 0.17 * s, 1.18, 0);
    cyl(g, 0.012, 0.012, 0.34, STEEL, 0.06, 1.33, -0.02, 6).rotation.z = -0.35;
    for (let i = 0; i < 3; i++) cyl(g, 0.045, 0.04, 0.09, i % 2 ? '#7a1f2b' : '#f4f1ea', -0.29, 0.98 + i * 0.09, 0.06, 10);
    return g;
  },
  waffleIron() {
    const g = new THREE.Group();
    box(g, 0.34, 0.08, 0.34, '#1d1f22', 0, 0.97, 0);
    cyl(g, 0.15, 0.15, 0.05, '#2b2e31', 0, 1.035, 0, 16);
    cyl(g, 0.15, 0.14, 0.06, '#3a3e42', 0, 1.09, 0, 16);
    for (let i = -2; i <= 2; i++) { box(g, 0.24, 0.006, 0.012, '#24272a', 0, 1.123, i * 0.05); box(g, 0.012, 0.006, 0.24, '#24272a', i * 0.05, 1.123, 0); }
    box(g, 0.05, 0.03, 0.22, '#111111', 0, 1.1, 0.24);
    const led = keep(new THREE.Mesh(UNIT_BOX, new THREE.MeshLambertMaterial({ color: '#2a2a2a', emissive: '#ff3a00', emissiveIntensity: 0 })));
    led.scale.set(0.05, 0.03, 0.01);
    led.position.set(0.1, 0.97, 0.175);
    g.add(led);
    g.userData.burners = [led];
    return g;
  },
  // The dishwasher's door, set into the cabinet front under the sink counter.
  dishwasher() {
    const g = new THREE.Group();
    box(g, 0.6, 0.72, 0.02, '#aeb5ba', 0, 0.48, 0.42);
    box(g, 0.5, 0.025, 0.03, STEEL, 0, 0.8, 0.44);
    box(g, 0.56, 0.06, 0.012, '#2b2f33', 0, 0.865, 0.43);
    box(g, 0.03, 0.02, 0.01, glow('#3dff8a', 1.2), 0.2, 0.865, 0.437);
    return g;
  },
  // Clean plates; the world scales the stack to however many are left.
  plateRack() {
    const g = new THREE.Group();
    box(g, 0.42, 0.025, 0.36, STEEL, 0, 0.94, 0);
    for (const s of [-1, 1]) for (const t of [-1, 1]) cyl(g, 0.008, 0.008, 0.34, STEEL, 0.19 * s, 1.1, 0.16 * t, 4);
    for (const t of [-1, 1]) box(g, 0.4, 0.012, 0.012, STEEL, 0, 1.26, 0.16 * t);
    const stack = keep(new THREE.Mesh(cylGeo(0.15, 0.13, 1, 16), mat('#f7f5ef')));
    stack.position.set(0, 1.1, 0);
    stack.scale.y = 0.26;
    g.add(stack);
    g.userData.plates = stack;
    return g;
  },
  // Pots and pans hung from a ceiling rail over the island.
  potRack() {
    const g = new THREE.Group();
    for (const s of [-1, 1]) cyl(g, 0.012, 0.012, 0.72, '#4a4f54', 1.35 * s, 2.84, 0, 4);
    for (const t of [-1, 1]) box(g, 2.9, 0.035, 0.035, '#5a5f63', 0, 2.48, 0.16 * t);
    for (const s of [-1, 1]) box(g, 0.035, 0.035, 0.36, '#5a5f63', 1.35 * s, 2.48, 0);
    const hooks = [[-1.2, -0.16, 'pan'], [-0.85, 0.16, 'pot'], [-0.45, -0.16, 'ladle'], [-0.1, 0.16, 'pan'], [0.3, -0.16, 'pot'], [0.65, 0.16, 'pan'], [1.0, -0.16, 'ladle'], [1.25, 0.16, 'pot']];
    hooks.forEach(([x, z, kind], i) => {
      cyl(g, 0.006, 0.006, 0.1, '#333333', x, 2.42, z, 4);
      if (kind === 'pan') {
        const r = 0.13 + (i % 3) * 0.02;
        box(g, 0.03, 0.26, 0.012, '#1a1a1a', x, 2.24, z);
        cyl(g, r, r * 0.85, 0.045, '#2b2b2b', x, 2.1 - r, z, 14).rotation.x = Math.PI / 2;
      } else if (kind === 'pot') {
        cyl(g, 0.12, 0.11, 0.18, i % 2 ? '#b0603a' : '#9aa1a6', x, 2.22, z, 12);
        box(g, 0.2, 0.02, 0.02, '#333333', x, 2.33, z);
      } else {
        cyl(g, 0.01, 0.01, 0.34, STEEL, x, 2.2, z, 5);
        ball(g, 0.05, STEEL, x, 2.02, z, 1, 0.6, 1);
      }
    });
    return g;
  },
  // Dry goods on a pair of wall shelves.
  kitchenShelf(f) {
    const g = new THREE.Group();
    [1.35, 1.85].forEach((y, row) => {
      box(g, f.w, 0.035, f.d, '#8a6a4a', 0, y, 0);
      for (const s of [-1, 1]) box(g, 0.04, 0.16, f.d * 0.8, '#3a2a1c', (f.w / 2 - 0.2) * s, y - 0.09, -0.02);
      for (let i = 0; i < 8; i++) {
        const x = -f.w / 2 + 0.25 + i * (f.w - 0.5) / 7;
        const k = (i + row * 3) % 5;
        if (k === 0) { cyl(g, 0.07, 0.07, 0.22, '#e8e1cf', x, y + 0.13, 0, 10); cyl(g, 0.073, 0.073, 0.04, '#7a1f2b', x, y + 0.26, 0, 10); }
        else if (k === 1) rbox(g, 0.24, 0.3, 0.18, '#d8c8a8', x, y + 0.17, 0);
        else if (k === 2) for (let j = 0; j < 2; j++) cyl(g, 0.045, 0.045, 0.12, ['#c1121f', '#2d6a4f'][j], x - 0.05 + j * 0.1, y + 0.08, 0, 10);
        else if (k === 3) box(g, 0.2, 0.26, 0.12, ['#f4a261', '#264653', '#e9c46a'][i % 3], x, y + 0.15, 0);
        else { cyl(g, 0.06, 0.06, 0.18, '#a8c5d1', x, y + 0.11, 0, 10); cyl(g, 0.062, 0.062, 0.03, '#b08d3c', x, y + 0.215, 0, 10); }
      }
    });
    return g;
  },
  // Fire suppression: an agent tank, a pipe along the hood and a nozzle over every burner.
  suppression() {
    const g = new THREE.Group();
    cyl(g, 0.12, 0.12, 0.62, '#b3121f', -2.32, 1.62, -0.11, 12);
    ball(g, 0.12, '#b3121f', -2.32, 1.93, -0.11, 1, 0.6, 1);
    cyl(g, 0.04, 0.04, 0.05, '#222222', -2.32, 2.01, -0.11, 8);
    cyl(g, 0.018, 0.018, 0.3, STEEL, -2.32, 2.18, -0.11, 6);
    box(g, 4.4, 0.035, 0.035, STEEL, -0.12, 2.33, 0.62);
    box(g, 0.035, 0.035, 0.75, STEEL, -2.32, 2.33, 0.25);
    for (let i = 0; i < 4; i++) cyl(g, 0.025, 0.012, 0.06, '#d4a017', -1.5 + i, 2.29, 0.62, 6);
    box(g, 0.14, 0.18, 0.06, '#c1121f', -2.32, 1.18, -0.2);
    box(g, 0.08, 0.04, 0.02, '#f0f0f0', -2.32, 1.2, -0.165);
    return g;
  },
  // The pass: a steel shelf through the hatch, with a bell and a row of heat lamps above it.
  passCounter(f) {
    const g = new THREE.Group();
    box(g, f.w, 0.94, f.d - 0.08, '#c3c9ce', 0, 0.47, 0);
    box(g, f.w + 0.06, 0.04, f.d + 0.06, STEEL, 0, 0.98, 0);
    cyl(g, 0.045, 0.055, 0.02, '#2b2b2b', 0.85, 1.01, 0.18, 10);
    ball(g, 0.04, BRASS, 0.85, 1.03, 0.18, 1, 0.75, 1);
    box(g, f.w - 0.1, 0.07, 0.14, '#3a3f44', 0, 2.235, 0);
    for (let i = 0; i < 3; i++) box(g, 0.42, 0.02, 0.09, LIGHTS.heat, -0.6 + i * 0.6, 2.195, 0);
    return g;
  },
  // One turn of a spiral staircase, from this floor up to the next: oak treads cantilevered off an iron
  // pole, a baluster at the end of every tread and a handrail that follows the climb.
  spiralFlight(f) {
    const g = new THREE.Group();
    const n = 16, rise = 3.6 / n, step = (Math.PI * 2) / n, r = f.r - 0.04;
    const tread = treadGeometry(r, step * 1.12);
    const oak = mat('#6b4528'), nosing = mat('#3a2416'), iron = mat('#26272a');
    const rail = [];
    for (let k = 0; k < n; k++) {
      const a = f.exit + k * step, y = (k + 0.6) * rise;
      const t = new THREE.Mesh(tread, k % 2 ? oak : mat('#714a2b'));
      t.position.y = y;
      t.rotation.y = -a;
      g.add(t);
      const am = a + step * 0.55, bx = Math.cos(am) * (r - 0.07), bz = Math.sin(am) * (r - 0.07);
      cyl(g, 0.014, 0.014, 0.9, iron, bx, y + 0.45, bz, 5);
      rail.push(new THREE.Vector3(bx, y + 0.92, bz));
      if (k === n - 1) rail.push(new THREE.Vector3(Math.cos(f.exit + n * step) * (r - 0.07), 3.6 + 0.92, Math.sin(f.exit + n * step) * (r - 0.07)));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 64, 0.028, 6, false), nosing));
    cyl(g, 0.09, 0.09, 3.6, iron, 0, 1.8, 0, 10);
    for (let k = 0; k < 4; k++) cyl(g, 0.12, 0.12, 0.06, iron, 0, 0.3 + k * 0.9, 0, 10);
    return g;
  },
  // The balustrade round a stairwell on its open sides, with a gap at the opening.
  stairRail(f) {
    const g = new THREE.Group();
    const r = f.r, hall = f.exit === 0 ? 1 : -1;
    const wood = mat('#4a2c1a'), iron = mat('#26272a');
    const run = (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1), along = Math.abs(x2 - x1) > Math.abs(z2 - z1);
      const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
      box(g, along ? len : 0.07, 0.07, along ? 0.07 : len, wood, cx, 1.0, cz);
      box(g, along ? len : 0.04, 0.04, along ? 0.04 : len, iron, cx, 0.12, cz);
      const k = Math.max(1, Math.round(len / 0.14));
      for (let i = 0; i <= k; i++) cyl(g, 0.012, 0.012, 0.88, iron, x1 + ((x2 - x1) * i) / k, 0.56, z1 + ((z2 - z1) * i) / k, 4);
      for (const [x, z] of [[x1, z1], [x2, z2]]) box(g, 0.08, 1.06, 0.08, wood, x, 0.53, z);
    };
    run(-r, r, r, r);                       // the side facing the hallway's far wall
    run(hall * r, -r, hall * r, -0.6);      // the opening side, either side of the gap
    run(hall * r, 0.6, hall * r, r);
    if (f.east) run(r, -r, r, r);           // downstairs there's no end wall behind the east stair
    return g;
  },
  // A short rail across the top step where the spiral ends: nothing to climb past it.
  stairStop(f) {
    const g = new THREE.Group();
    const r = f.r, hall = f.exit === 0 ? 1 : -1, z = Math.cos(f.exit) * 0.06;
    box(g, r - 0.1, 0.07, 0.07, mat('#4a2c1a'), hall * (r + 0.1) / 2, 1.0, z);
    for (let i = 0; i < 5; i++) cyl(g, 0.012, 0.012, 0.9, mat('#26272a'), hall * (0.12 + (i * (r - 0.12)) / 4), 0.5, z, 4);
    cyl(g, 0.09, 0.09, 1.0, mat('#26272a'), 0, 0.5, 0, 10); // the pole ends here, with a brass finial
    ball(g, 0.13, mat('#b08d3c'), 0, 1.08, 0);
    return g;
  },
  // Spare key cards on a little rack behind the front desk.
  keyRack() {
    const g = new THREE.Group();
    box(g, 0.6, 0.42, 0.03, DARKWOOD, 0, 1.5, 0);
    box(g, 0.62, 0.05, 0.05, BRASS, 0, 1.73, 0.01);
    for (let i = 0; i < 6; i++) {
      const x = -0.22 + (i % 3) * 0.22, y = 1.6 - Math.floor(i / 3) * 0.2;
      box(g, 0.012, 0.012, 0.05, BRASS, x, y + 0.04, 0.03);
      box(g, 0.08, 0.12, 0.006, i % 2 ? '#f2efe8' : '#e8d29a', x, y - 0.03, 0.035);
    }
    const p = signPlane('SPARE KEYS', 0.5, 0.08, { color: '#e8d29a', bg: '#2a1a10', font: 'bold 40px Georgia, serif', h: 60 });
    p.position.set(0, 1.81, 0.03);
    g.add(p);
    return g;
  },
  // A first aid cabinet on the wall; the kit itself waits on the floor below it.
  firstAid() {
    const g = new THREE.Group();
    box(g, 0.46, 0.42, 0.12, '#f2efe8', 0, 1.45, 0);
    box(g, 0.3, 0.08, 0.01, '#c1121f', 0, 1.45, 0.065);
    box(g, 0.08, 0.3, 0.01, '#c1121f', 0, 1.45, 0.065);
    const p = signPlane('FIRST AID', 0.42, 0.1, { color: '#ffffff', bg: '#c1121f', font: 'bold 40px Arial', h: 56 });
    p.position.set(0, 1.76, 0.03);
    g.add(p);
    return g;
  },
  // Order tickets over the pass; the world draws them.
  ticketRail() {
    const g = new THREE.Group();
    box(g, 2.0, 0.62, 0.03, '#1d1f22', 0, 2.66, 0);
    box(g, 2.0, 0.03, 0.06, STEEL, 0, 2.95, 0.02);
    const c = document.createElement('canvas');
    c.width = 512; c.height = 154;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const screen = keep(new THREE.Mesh(new THREE.PlaneGeometry(1.92, 0.56), new THREE.MeshBasicMaterial({ map: tex })));
    screen.position.set(0, 2.65, 0.02);
    g.add(screen);
    g.userData.board = { canvas: c, tex };
    return g;
  },
  heatLamps() {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const x = -1.5 + i;
      cyl(g, 0.01, 0.01, 0.22, '#222', x, 2.14, 0, 4);
      cyl(g, 0.1, 0.18, 0.16, STEEL, x, 1.96, 0, 10);
      ball(g, 0.07, LIGHTS.heat, x, 1.86, 0);
    }
    return g;
  },
  generator(f) {
    const g = new THREE.Group();
    box(g, f.w, 0.8, f.d, '#e9c46a', 0, 0.5, 0);
    box(g, f.w + 0.08, 0.06, f.d + 0.08, '#2b2b2b', 0, 0.92, 0);
    box(g, 0.4, 0.3, 0.02, '#2b2b2b', -0.3, 0.6, f.d / 2 + 0.01);
    box(g, 0.08, 0.06, 0.02, glow('#38c483', 1.5), -0.3, 0.68, f.d / 2 + 0.02);
    cyl(g, 0.05, 0.05, 0.5, '#555', 0.5, 1.15, 0, 8);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.08, 0.08, 0.06, '#111', 0.55 * sx, 0.08, 0.35 * sz, 10).rotation.z = Math.PI / 2;
    return g;
  },
  towelCabinet(f) {
    const g = new THREE.Group();
    box(g, f.w, 1.9, 0.05, WOOD, 0, 0.95, -f.d / 2 + 0.025);
    for (let s = 0; s < 4; s++) box(g, f.w, 0.04, f.d, WOOD, 0, 0.1 + s * 0.55, 0);
    for (const sx of [-1, 1]) box(g, 0.05, 1.9, f.d, DARKWOOD, (f.w / 2) * sx, 0.95, 0);
    for (let s = 0; s < 3; s++) for (let i = 0; i < 2; i++) for (let k = 0; k < 3; k++) box(g, 0.42, 0.08, 0.32, (i + k) % 2 ? '#ffffff' : '#a8dadc', -0.26 + i * 0.52, 0.17 + s * 0.55 + k * 0.085, 0);
    const p = signPlane('TOWELS', 0, 0.18, { color: '#ffffff', bg: '#2a6f97', font: 'bold 40px Arial', h: 56 });
    p.position.set(0, 2.05, f.d / 2);
    g.add(p);
    return g;
  },
  energyFridge(f) {
    const g = new THREE.Group();
    box(g, f.w, 1.7, f.d, '#111316', 0, 0.85, 0);
    box(g, f.w - 0.12, 1.4, 0.02, LIGHTS.vending, 0, 0.85, f.d / 2 + 0.01);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) cyl(g, 0.035, 0.035, 0.12, ['#8ac926', '#ffca3a', '#ff595e', '#1982c4'][(r + c) % 4], -0.24 + c * 0.16, 0.35 + r * 0.33, f.d / 2 - 0.05, 8);
    const p = signPlane('ENERGY', f.w - 0.1, 0.16, { color: '#111316', bg: '#8ac926', font: 'bold 44px Arial', h: 56 });
    p.position.set(0, 1.62, f.d / 2 + 0.02);
    g.add(p);
    return g;
  },
  hotTub(f) {
    const g = new THREE.Group();
    const r = f.w / 2;
    const rim = new THREE.Mesh(cylGeo(r, r, 0.6, 20, true), mat('#6b4423', { side: THREE.DoubleSide }));
    rim.position.y = 0.3;
    g.add(rim);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(r, 0.08, 6, 24), mat('#8a5a3a'));
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.6;
    g.add(lip);
    const water = keep(new THREE.Mesh(new THREE.CircleGeometry(r - 0.05, 20), mat('#7fd8e8', { transparent: true, opacity: 0.65, emissive: '#1a6a7a', emissiveIntensity: 0.6, depthWrite: false })));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.48;
    g.add(water);
    for (let i = 0; i < 6; i++) ball(g, 0.05, mat('#e8fbff', { transparent: true, opacity: 0.7 }), Math.cos(i) * r * 0.5, 0.5, Math.sin(i * 1.7) * r * 0.5).userData.keep = true;
    return g;
  },
  chlorinator(f) {
    const g = new THREE.Group();
    box(g, f.w, 0.7, f.d, '#2a6f97', 0, 0.35, 0);
    cyl(g, 0.12, 0.12, 0.3, '#e0f2fe', 0, 0.85, 0, 10);
    cyl(g, 0.04, 0.04, 0.6, '#9aa1a6', 0.2, 0.3, f.d / 2 + 0.05, 6).rotation.x = Math.PI / 2;
    cyl(g, 0.06, 0.06, 0.02, '#f4f1ea', -0.12, 0.5, f.d / 2 + 0.01, 10).rotation.x = Math.PI / 2;
    return g;
  },
  camera(f) {
    const g = new THREE.Group();
    const y = f.y || 2.95;
    box(g, 0.06, 0.06, 0.25, '#2b2b2b', 0, y, -0.05);
    const body = box(g, 0.16, 0.14, 0.32, '#e8e8e8', 0, y - 0.1, 0.1);
    body.rotation.x = 0.35;
    box(g, 0.08, 0.08, 0.02, '#111', 0, y - 0.16, 0.26);
    ball(g, 0.018, glow('#ff1a1a', 2.5), 0.05, y - 0.06, 0.25);
    return g;
  },
  uvTube(f) {
    const g = new THREE.Group();
    const y = f.y || 3.08;
    box(g, 1.7, 0.06, 0.14, '#2b2b2b', 0, y + 0.06, 0);
    const tube = cyl(g, 0.035, 0.035, 1.6, LIGHTS.uv, 0, y, 0, 8);
    tube.rotation.z = Math.PI / 2;
    return g;
  },
  sprinkler(f) {
    const g = new THREE.Group();
    const y = f.y || 3.14;
    cyl(g, 0.02, 0.02, 0.08, BRASS, 0, y, 0, 6);
    cyl(g, 0.06, 0.06, 0.01, BRASS, 0, y - 0.05, 0, 10);
    box(g, 0.012, 0.06, 0.012, '#c9a227', 0, y - 0.09, 0);
    box(g, 0.04, 0.012, 0.012, '#c9a227', 0, y - 0.08, 0);
    return g;
  },
  billboard(f) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) cyl(g, 0.15, 0.18, 6, '#3b3b3b', (f.w / 2 - 0.8) * s, 3, 0, 8);
    box(g, f.w, 3.0, 0.25, '#1d1d24', 0, 6.4, 0);
    const p = signPlane('THE LAST RESORT', f.w - 0.4, 1.2, { color: '#ffd166', bg: '#1d1d24', font: 'bold 70px Georgia, serif', h: 100 });
    p.position.set(0, 6.9, 0.14);
    g.add(p);
    const q = signPlane('VACANCY · CHECK IN ANY TIME', f.w - 0.6, 0.6, { color: '#ff3d6e', bg: '#1d1d24', font: 'bold 54px Arial', h: 80 });
    q.position.set(0, 5.9, 0.14);
    g.add(q);
    for (const s of [-1, 0, 1]) { box(g, 0.06, 0.06, 0.9, '#2b2b2b', s * 2, 8.0, 0.4); box(g, 0.35, 0.15, 0.25, LIGHTS.outdoor, s * 2, 7.95, 0.85); }
    return g;
  },
  tinfoilSign() {
    const g = new THREE.Group();
    cyl(g, 0.05, 0.05, 2.2, '#5c5c5c', 0, 1.1, 0, 6);
    box(g, 1.6, 0.6, 0.05, mat('#cfd4d8', { emissive: '#30363a', emissiveIntensity: 0.4 }), 0, 2.1, 0);
    const p = signPlane('TINFOIL-PROTECTED PARKING', 1.5, 0.2, { color: '#111111', bg: '#e9ecef', font: 'bold 36px Arial', h: 52 });
    p.position.set(0, 2.15, 0.03);
    g.add(p);
    return g;
  },
});

// ---------- the hotel frontage ----------
const STONE = '#d8cfbd', FACADE = '#5b4038';
Object.assign(PROPS, {
  // Porte-cochère over the drop-off lane: from the facade (z 8.35) out to the columns (z 17.3).
  canopy(f) {
    const g = new THREE.Group();
    const W = 25.6, z1 = 8.35 - f.z, z2 = 17.4 - f.z, D = z2 - z1, zc = (z1 + z2) / 2, Y = 3.92;
    box(g, W, 0.34, D, '#2a1d1a', 0, Y, zc);
    box(g, W - 0.3, 0.2, D - 0.3, SNOW, 0, Y + 0.27, zc);
    const ice = mat('#cfe6f5', { emissive: '#203040', emissiveIntensity: 0.2 });
    for (let x = -W / 2 + 0.5; x < W / 2; x += 0.9 + ((x * 13) % 1 + 1) % 1 * 0.8) {
      const h = 0.2 + ((x * 7) % 1 + 1) % 1 * 0.4;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, h, 5), ice);
      c.position.set(x, Y - 0.33 - h / 2, z2 + 0.1);
      c.rotation.x = Math.PI;
      g.add(c);
    }
    box(g, W + 0.2, 0.62, 0.25, '#5a1f2b', 0, Y - 0.02, z2);
    for (const s of [-1, 1]) box(g, 0.25, 0.62, D, '#5a1f2b', (W / 2) * s, Y - 0.02, zc);
    box(g, W + 0.24, 0.07, 0.29, BRASS, 0, Y + 0.3, z2);
    box(g, W + 0.24, 0.05, 0.27, BRASS, 0, Y - 0.32, z2);
    for (let x = -10; x <= 10; x += 4) for (const z of [zc - 2.4, zc + 2.0]) box(g, 0.5, 0.03, 0.5, LIGHTS.outdoor, x, Y - 0.18, z);
    const t = signPlane('THE LAST RESORT', 0, 0.44, { color: '#e8d29a', bg: '#5a1f2b', font: '600 64px Georgia, serif', h: 90 });
    t.position.set(0, Y - 0.02, z2 + 0.13);
    g.add(t);
    return g;
  },
  column() {
    const g = new THREE.Group();
    box(g, 0.78, 0.28, 0.78, STONE, 0, 0.14, 0);
    cyl(g, 0.26, 0.3, 3.2, '#ece4d4', 0, 1.88, 0, 12);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; box(g, 0.03, 3.0, 0.03, '#d6ccb8', Math.cos(a) * 0.29, 1.88, Math.sin(a) * 0.29); }
    box(g, 0.72, 0.24, 0.72, STONE, 0, 3.6, 0);
    cyl(g, 0.12, 0.12, 0.16, LIGHTS.outdoor, 0, 2.6, 0.3, 8);
    return g;
  },
  // Raised entrance facade with the neon name (the world animates userData.letters).
  tower() {
    const g = new THREE.Group();
    const W = 12, H = 8.6, zf = 0.32, cy = 6.15;
    box(g, W, H - 3.2, 0.5, FACADE, 0, 3.2 + (H - 3.2) / 2, 0.05);
    box(g, W + 0.5, 0.26, 0.85, STONE, 0, H, 0.12);
    box(g, W - 4.4, 0.7, 0.5, FACADE, 0, H + 0.48, 0.05);
    box(g, W - 4.1, 0.16, 0.72, STONE, 0, H + 0.88, 0.12);
    for (const s of [-1, 1]) box(g, 0.5, H - 0.2, 0.62, STONE, (W / 2 - 0.25) * s, (H - 0.2) / 2 + 0.1, 0.1);
    box(g, W, 0.18, 0.7, STONE, 0, 4.25, 0.1);
    // a clock that stopped at 3:33
    cyl(g, 0.55, 0.55, 0.08, STONE, 0, cy, zf, 20).rotation.x = Math.PI / 2;
    cyl(g, 0.46, 0.46, 0.04, '#f4efe2', 0, cy, zf + 0.04, 20).rotation.x = Math.PI / 2;
    box(g, 0.04, 0.3, 0.02, '#111', 0.11, cy + 0.05, zf + 0.07).rotation.z = -1.0;
    box(g, 0.035, 0.36, 0.02, '#111', 0.05, cy - 0.17, zf + 0.075).rotation.z = 2.9;
    for (const x of [-3.6, 3.6]) {
      box(g, 1.3, 1.5, 0.06, '#2b2420', x, cy, zf);
      box(g, 1.14, 1.34, 0.04, LIGHTS.facade, x, cy, zf + 0.02);
      box(g, 1.4, 0.1, 0.16, STONE, x, cy - 0.79, zf + 0.04);
    }
    const letters = 'THE LAST RESORT';
    const meshes = [];
    let x = -5.04;
    for (const ch of letters) {
      if (ch !== ' ') {
        const p = signPlane(ch, 0.66, 1.0, { color: '#ffffff', bg: null, font: 'bold 120px Georgia, serif', h: 140, pad: 4 });
        p.position.set(x, 7.6, zf + 0.02);
        g.add(p);
        meshes.push(p);
      }
      x += 0.72;
    }
    g.userData.letters = meshes;
    return g;
  },
  bladeSign() {
    const g = new THREE.Group();
    box(g, 0.5, 0.12, 1.2, '#2b2b2b', 0, 6.3, 0.6);
    box(g, 0.5, 0.12, 1.2, '#2b2b2b', 0, 2.9, 0.6);
    box(g, 0.32, 3.8, 1.1, '#14141a', 0, 4.6, 1.05);
    for (const side of [-1, 1]) {
      'HOTEL'.split('').forEach((ch, i) => {
        const p = signPlane(ch, 0.62, 0.62, { color: '#ff3d6e', bg: '#14141a', font: 'bold 110px Georgia, serif', h: 130, pad: 6 });
        p.position.set(0.17 * side, 6.0 - i * 0.7, 1.05);
        p.rotation.y = (Math.PI / 2) * side;
        g.add(p);
      });
      for (let i = 0; i < 9; i++) ball(g, 0.04, LIGHTS.outdoor, 0.17 * side, 2.8 + i * 0.45, 0.52);
    }
    return g;
  },
  redCarpet() {
    const g = new THREE.Group();
    box(g, 2.6, 0.02, 2.4, '#8b0d1a', 0, 0.03, 0);
    for (const s of [-1, 1]) box(g, 0.06, 0.025, 2.4, BRASS, 1.3 * s, 0.03, 0);
    for (const sx of [-1, 1]) for (const z of [-0.9, 0.9]) { cyl(g, 0.045, 0.045, 0.95, BRASS, 1.55 * sx, 0.48, z, 8); ball(g, 0.06, BRASS, 1.55 * sx, 0.98, z); }
    for (const sx of [-1, 1]) { const r = box(g, 0.035, 0.035, 1.8, CLARET, 1.55 * sx, 0.82, 0); r.scale.y = 0.035; }
    return g;
  },
  topiary() {
    const g = new THREE.Group();
    cyl(g, 0.3, 0.24, 0.55, '#3a3a3a', 0, 0.28, 0, 10);
    cyl(g, 0.04, 0.04, 0.5, '#4a3424', 0, 0.75, 0, 6);
    ball(g, 0.34, '#2f5d2a', 0, 1.15, 0);
    ball(g, 0.22, '#356b30', 0, 1.62, 0);
    ball(g, 0.3, SNOW, 0, 1.36, 0, 1, 0.35, 1);
    ball(g, 0.19, SNOW, 0, 1.78, 0, 1, 0.4, 1);
    return g;
  },
  bench(f) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) box(g, f.w, 0.04, 0.13, '#6b4423', 0, 0.45, -0.18 + i * 0.16);
    for (let i = 0; i < 2; i++) box(g, f.w, 0.12, 0.04, '#6b4423', 0, 0.62 + i * 0.17, -0.27);
    for (const s of [-1, 1]) { box(g, 0.06, 0.45, 0.5, '#1a1a1a', (f.w / 2 - 0.12) * s, 0.22, 0); box(g, 0.06, 0.45, 0.05, '#1a1a1a', (f.w / 2 - 0.12) * s, 0.68, -0.27); }
    return g;
  },
  hedge(f) {
    const g = new THREE.Group();
    const n = Math.max(1, Math.round(f.w / 1.5));
    for (let i = 0; i < n; i++) {
      const h = 0.85 + (i % 3) * 0.06, x = -f.w / 2 + (i + 0.5) * (f.w / n);
      box(g, f.w / n + 0.05, h, f.d, i % 2 ? '#22401f' : '#274a24', x, h / 2, 0);
      box(g, f.w / n + 0.08, 0.14, f.d + 0.06, SNOW, x, h + 0.05, 0);
    }
    return g;
  },
  flagpole(f) {
    const g = new THREE.Group();
    cyl(g, 0.05, 0.07, 7.5, '#d9d9d9', 0, 3.75, 0, 8);
    ball(g, 0.09, GOLD, 0, 7.55, 0);
    const pal = [['#7a1f2b', '#e8d29a'], ['#1d3557', '#f4f1de'], ['#1b4332', '#e9c46a']][(f.seed || 0) % 3];
    box(g, 0.02, 0.9, 1.5, pal[0], 0, 6.9, 0.78);
    box(g, 0.025, 0.3, 1.5, pal[1], 0, 6.9, 0.78);
    return g;
  },
  fence(f) {
    const g = new THREE.Group();
    const n = Math.round(f.w / 0.2);
    for (let i = 0; i < n; i++) box(g, 0.16, 1.8, 0.04, i % 2 ? '#6b4f3a' : '#5a4230', -f.w / 2 + (i + 0.5) * (f.w / n), 0.9, 0);
    for (const y of [0.4, 1.5]) box(g, f.w, 0.08, 0.06, '#4a3424', 0, y, -0.04);
    return g;
  },
});
