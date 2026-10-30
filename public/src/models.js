// Low-poly model builders: guests, staff, monsters, carried items, messes, cars and the UFO.
// Every model faces +Z at rotation 0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeLook } from './looks.js';
import { splatTexture } from './textures.js';

export const UNIT = new THREE.BoxGeometry(1, 1, 1);

// Characters are built from many boxes; bake each animated part into one vertex-colored
// mesh so a guest costs ~6 draw calls instead of ~25. Glowing and see-through bits stay separate.
const VC_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const VC_GHOST = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, emissive: '#1d2c3a' });

export function compactGroup(group, ghost) {
  const parts = group.children.filter(o => o.isMesh && (ghost || (!o.material.transparent && o.material.emissive?.getHex() === 0)));
  if (parts.length < 2) return;
  const geos = parts.map(m => {
    m.updateMatrix();
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(m.matrix);
    const c = m.material.color, n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const merged = mergeGeometries(geos);
  merged.userData.owned = true;
  for (const g of geos) g.dispose();
  for (const m of parts) group.remove(m);
  group.add(new THREE.Mesh(merged, ghost ? VC_GHOST : VC_MAT));
}

function compactRig(rig, ghost = false) {
  for (const k of ['body', 'legL', 'legR', 'armL', 'armR', 'head']) if (rig[k]) compactGroup(rig[k], ghost);
}

export function disposeModel(obj) {
  obj.traverse(o => { if (o.isMesh && o.geometry.userData.owned) o.geometry.dispose(); });
}
const SPHERE = new THREE.SphereGeometry(1, 14, 10);
const matCache = new Map();

export function mat(color, extra) {
  const key = extra ? color + JSON.stringify(extra) : color;
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshLambertMaterial({ color, ...extra }); matCache.set(key, m); }
  return m;
}

// A color darkened by k (k < 1), or blended a fraction 1 - k of the way toward `toward`.
const tmpColor = new THREE.Color();
export function shade(hex, k, toward) {
  const c = new THREE.Color(hex);
  if (toward) c.lerp(tmpColor.set(toward), 1 - k);
  else c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

export function glow(color, intensity = 1) {
  return mat(color, { emissive: color, emissiveIntensity: intensity });
}

export function box(parent, w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(UNIT, typeof color === 'string' ? mat(color) : color);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// A box with softened edges, for anything that shouldn't look like a crate (people, cushions).
const ROUND = new RoundedBoxGeometry(1, 1, 1, 2, 0.2);
export function rbox(parent, w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(ROUND, typeof color === 'string' ? mat(color) : color);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

const cylCache = new Map();
export function cylGeo(rt, rb, h, seg = 12, open = false) {
  const k = `${rt}|${rb}|${h}|${seg}|${open}`;
  if (!cylCache.has(k)) cylCache.set(k, new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
  return cylCache.get(k);
}

export function cyl(parent, rt, rb, h, color, x = 0, y = 0, z = 0, seg = 12) {
  const m = new THREE.Mesh(cylGeo(rt, rb, h, seg), typeof color === 'string' ? mat(color) : color);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export function ball(parent, r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(SPHERE, typeof color === 'string' ? mat(color) : color);
  m.scale.set(r * sx, r * sy, r * sz);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// ---------- characters ----------
export function buildCharacter(kind, seed, opts = {}) {
  const L = opts.look || makeLook(kind, seed, opts.wrong);
  const ghost = L.alpha < 1;
  const C = c => (ghost ? mat(c, { transparent: true, opacity: L.alpha, depthWrite: false, emissive: '#1d2c3a' }) : mat(c));
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hip = 0.86, W = L.wide;
  const mk = (p, w, h, d, c, x, y, z) => rbox(p, w, h, d, C(c), x, y, z);

  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(0.11 * side * W, hip, 0);
    body.add(leg);
    if (L.shorts) { mk(leg, 0.17, 0.36, 0.19, L.pants, 0, -0.18, 0); mk(leg, 0.14, 0.46, 0.15, L.skin, 0, -0.59, 0); }
    else { mk(leg, 0.17, 0.82, 0.19, L.pants, 0, -0.41, 0); box(leg, 0.175, 0.04, 0.195, C(shade(L.pants, 0.8)), 0, -0.74, 0); }
    mk(leg, 0.18, 0.1, 0.27, L.shoes, 0, -0.81, 0.04);
    box(leg, 0.185, 0.03, 0.28, C(shade(L.shoes, 0.55)), 0, -0.855, 0.04);
    legs.push(leg);
  }
  mk(body, 0.46 * W, 0.62, 0.26, L.coat || L.shirt, 0, hip + 0.31, 0);
  if (L.coat) {
    // an open coat: the shirt shows down the middle, with lapels, pockets and a hem over the hips
    mk(body, 0.13, 0.5, 0.02, L.shirt, 0, hip + 0.38, 0.135);
    mk(body, 0.47 * W, 0.2, 0.27, L.coat, 0, hip - 0.04, 0);
    const lapel = C(shade(L.coat, 0.78));
    for (const s of [-1, 1]) {
      box(body, 0.065, 0.28, 0.02, lapel, 0.075 * s, hip + 0.48, 0.138).rotation.z = -0.32 * s;
      box(body, 0.1, 0.07, 0.02, lapel, 0.15 * W * s, hip + 0.06, 0.142);
    }
  } else if (!L.dress && !L.robe && !L.belt) {
    mk(body, 0.47 * W, 0.05, 0.27, '#2b2018', 0, hip + 0.02, 0);
    box(body, 0.06, 0.045, 0.02, glow('#b08d3c', 0.25), 0, hip + 0.02, 0.138);
    box(body, 0.2, 0.05, 0.03, C(shade(L.shirt, 0.85)), 0, hip + 0.6, 0.12);
  }
  if (L.tie) mk(body, 0.055, 0.38, 0.02, L.tie, 0, hip + 0.4, 0.146);
  if (L.buttons) for (let i = 0; i < 3; i++) box(body, 0.04, 0.04, 0.02, glow('#d4a017', 0.3), 0.09, hip + 0.48 - i * 0.14, 0.14);
  if (L.lanyard) { mk(body, 0.03, 0.28, 0.02, '#1d4ed8', 0, hip + 0.47, 0.14); mk(body, 0.1, 0.13, 0.02, '#f8f8f8', 0, hip + 0.28, 0.146); }
  if (L.camera) mk(body, 0.16, 0.11, 0.07, '#1a1a1a', 0.08, hip + 0.42, 0.16);
  if (L.apron) box(body, 0.44 * W, 0.95, 0.02, mat('#dff4ff', { transparent: true, opacity: 0.45 }), 0, hip + 0.02, 0.15);
  if (L.maidApron) { mk(body, 0.34 * W, 0.62, 0.02, '#f8f8f6', 0, hip + 0.02, 0.15); mk(body, 0.3 * W, 0.08, 0.02, '#f8f8f6', 0, hip + 0.5, 0.14); }
  if (L.badge) box(body, 0.07, 0.07, 0.02, glow('#d4a017', 0.4), -0.1 * W, hip + 0.48, 0.14);
  if (L.belt) { mk(body, 0.48 * W, 0.08, 0.28, '#4a3424', 0, hip + 0.02, 0); mk(body, 0.1, 0.16, 0.08, '#2b2b2b', 0.17 * W, hip - 0.06, 0.1); mk(body, 0.03, 0.18, 0.03, '#c1121f', 0.12 * W, hip - 0.02, 0.15); }
  if (L.dress) { const sk = new THREE.Mesh(cylGeo(0.2 * W, 0.34 * W, 0.6, 10), C(L.shirt)); sk.position.set(0, hip - 0.24, 0); body.add(sk); }
  if (L.robe) {
    const rb = new THREE.Mesh(cylGeo(0.24, 0.38, hip + 0.64, 10), C(L.robe));
    rb.position.set(0, (hip + 0.64) / 2, 0);
    body.add(rb);
    legs.forEach(l => (l.visible = false));
  }
  if (L.cape) { mk(body, 0.6 * W, 1.2, 0.04, L.cape, 0, hip + 0.02, -0.16); mk(body, 0.54, 0.22, 0.06, '#7a0f14', 0, hip + 0.64, -0.12); }
  if (L.scarf) { mk(body, 0.34 * W, 0.11, 0.3, L.scarf, 0, hip + 0.6, 0.01); mk(body, 0.1, 0.3, 0.045, L.scarf, 0.09, hip + 0.42, 0.15); }

  const arms = [];
  const sleeve = L.robe || L.coat || L.shirt;
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set((0.23 * W + 0.075) * side, hip + 0.58, 0);
    body.add(arm);
    ball(arm, 0.078, C(sleeve), 0, -0.03, 0, 1, 0.85, 1);
    mk(arm, 0.13, 0.58, 0.14, sleeve, 0, -0.29, 0);
    box(arm, 0.135, 0.05, 0.145, C(shade(sleeve, 0.8)), 0, -0.56, 0);
    mk(arm, 0.11, 0.11, L.gloves ? 0.12 : 0.11, L.gloves || L.skin, 0, -0.63, 0);
    box(arm, 0.035, 0.06, 0.045, C(L.gloves || L.skin), -0.05 * side, -0.61, 0.045);
    arms.push(arm);
  }
  if (L.phone) box(arms[1], 0.07, 0.13, 0.015, glow('#bde0fe', 0.9), 0, -0.68, 0.08);

  const head = new THREE.Group();
  head.position.set(0, hip + 0.64, 0);
  head.scale.setScalar(L.head);
  body.add(head);
  const eyeMat = L.glow ? glow(L.glow, 2) : C(L.eyes);
  if (L.bigHead) {
    ball(head, 1, C(L.skin), 0, 0.24, 0, 0.24, 0.28, 0.22);
    for (const s of [-1, 1]) {
      const e = ball(head, 1, mat('#050505'), 0.09 * s, 0.24, 0.17, 0.065, 0.1, 0.04);
      e.rotation.z = 0.45 * s;
    }
  } else {
    mk(head, 0.3, 0.32, 0.3, L.skin, 0, 0.17, 0);
    mk(head, 0.055, 0.075, 0.06, L.skin, 0, 0.15, 0.16);
    const whites = !L.glow && !L.wrong && !ghost;
    for (const s of [-1, 1]) {
      mk(head, 0.045, 0.085, 0.07, L.skin, 0.155 * s, 0.17, 0);
      if (whites) box(head, 0.07, 0.052, 0.012, mat('#f4f1ea'), 0.07 * s, 0.205, 0.151);
      box(head, 0.036, 0.042, 0.02, eyeMat, 0.07 * s, 0.203, 0.155);
      box(head, 0.078, 0.018, 0.02, C(L.hair), 0.07 * s, 0.252, 0.153).rotation.z = (L.wrong ? 0.35 : 0.08) * s;
    }
    if (L.mouth === 'wide') { box(head, 0.22, 0.04, 0.02, mat('#1a0505'), 0, 0.08, 0.152); box(head, 0.18, 0.015, 0.022, mat('#f2f2f2'), 0, 0.09, 0.153); }
    else if (L.mouth === 'smile') box(head, 0.11, 0.018, 0.02, mat('#5a2a2a'), 0, 0.085, 0.152);
    else if (whites) box(head, 0.075, 0.014, 0.02, mat('#6e3c38'), 0, 0.088, 0.152);
    // cheeks pink from the cold
    if (whites) for (const s of [-1, 1]) box(head, 0.05, 0.028, 0.012, mat(shade(L.skin, 0.62, '#e06a6a')), 0.1 * s, 0.13, 0.152);
    const hc = L.hair;
    switch (L.hairStyle) {
      case 1: mk(head, 0.32, 0.07, 0.32, hc, 0, 0.35, 0); mk(head, 0.32, 0.14, 0.05, hc, 0, 0.27, -0.14); box(head, 0.3, 0.05, 0.04, C(hc), 0, 0.315, 0.145); break;
      case 2: mk(head, 0.32, 0.07, 0.32, hc, 0, 0.35, 0); mk(head, 0.33, 0.4, 0.06, hc, 0, 0.16, -0.15); mk(head, 0.04, 0.3, 0.26, hc, -0.16, 0.2, -0.01); mk(head, 0.04, 0.3, 0.26, hc, 0.16, 0.2, -0.01); box(head, 0.26, 0.06, 0.04, C(hc), -0.02, 0.31, 0.145).rotation.z = 0.12; break;
      case 3: mk(head, 0.32, 0.07, 0.32, hc, 0, 0.35, 0); mk(head, 0.14, 0.12, 0.14, hc, 0, 0.42, -0.1); break;
      case 4: mk(head, 0.08, 0.12, 0.3, hc, 0, 0.38, 0); break;
    }
  }
  if (L.glasses === 1) box(head, 0.27, 0.05, 0.02, mat('#222222'), 0, 0.2, 0.162);
  if (L.glasses === 2) box(head, 0.28, 0.07, 0.03, mat('#050505'), 0, 0.2, 0.164);
  if (L.antenna) for (const s of [-1, 1]) {
    cyl(head, 0.012, 0.012, 0.24, C(L.skin), 0.08 * s, 0.6, 0, 6);
    ball(head, 0.035, glow('#c6ff4f', 1.5), 0.08 * s, 0.73, 0);
  }
  const hcol = L.hatColor;
  switch (L.hat) {
    case 'cap': cyl(head, 0.17, 0.17, 0.1, C(hcol), 0, 0.37, 0); mk(head, 0.24, 0.02, 0.15, hcol, 0, 0.33, 0.18); break;
    case 'sunhat': cyl(head, 0.3, 0.3, 0.02, C(hcol), 0, 0.35, 0); cyl(head, 0.15, 0.17, 0.12, C(hcol), 0, 0.42, 0); break;
    case 'fedora': cyl(head, 0.25, 0.25, 0.02, C(hcol), 0, 0.36, 0); cyl(head, 0.14, 0.16, 0.15, C(hcol), 0, 0.44, 0); cyl(head, 0.161, 0.161, 0.03, C('#1a1a1a'), 0, 0.39, 0); break;
    case 'party': { const m = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 8), C(hcol)); m.position.set(0.04, 0.48, 0); m.rotation.z = -0.2; head.add(m); break; }
    case 'hood': mk(head, 0.38, 0.08, 0.38, hcol, 0, 0.37, -0.01); mk(head, 0.05, 0.38, 0.36, hcol, -0.19, 0.18, -0.02); mk(head, 0.05, 0.38, 0.36, hcol, 0.19, 0.18, -0.02); mk(head, 0.38, 0.38, 0.05, hcol, 0, 0.18, -0.19); mk(head, 0.28, 0.06, 0.02, '#100808', 0, 0.3, 0.153); break;
    case 'mitre': mk(head, 0.24, 0.42, 0.22, hcol, 0, 0.52, 0); box(head, 0.05, 0.42, 0.225, glow('#d4a017', 0.4), 0, 0.52, 0); break;
    case 'band': mk(head, 0.33, 0.04, 0.33, hcol, 0, 0.3, 0); mk(head, 0.02, 0.18, 0.02, '#f0f0f0', 0.15, 0.4, 0); break;
    case 'bellhop': cyl(head, 0.15, 0.15, 0.12, C(hcol), 0, 0.38, 0); cyl(head, 0.152, 0.152, 0.03, glow('#d4a017', 0.3), 0, 0.34, 0); break;
    case 'beanie': ball(head, 0.168, C(hcol), 0, 0.31, 0, 1, 0.8, 1); mk(head, 0.33, 0.08, 0.33, hcol, 0, 0.27, 0); ball(head, 0.055, C('#f4f1ea'), 0, 0.46, 0); break;
    case 'hardhat': ball(head, 0.19, C(hcol), 0, 0.34, 0, 1, 0.62, 1.05); cyl(head, 0.23, 0.23, 0.025, C(hcol), 0, 0.32, 0.02); break;
    case 'tophat': cyl(head, 0.25, 0.25, 0.02, C(hcol), 0, 0.35, 0); cyl(head, 0.15, 0.15, 0.34, C(hcol), 0, 0.53, 0); cyl(head, 0.152, 0.152, 0.05, C('#7a1f2b'), 0, 0.39, 0); break;
  }

  const hand = new THREE.Group();
  hand.position.set(0, -0.62, 0.1);
  arms[0].add(hand);
  root.userData = { rig: { body, legL: legs[1], legR: legs[0], armL: arms[1], armR: arms[0], head }, look: L, hand, kind };
  compactRig(root.userData.rig, ghost);
  root.scale.setScalar(L.scale);
  return root;
}

export function buildStaff(color, seed = 7) {
  const look = makeLook('adult', seed);
  Object.assign(look, { coat: color, shirt: '#f4efe6', pants: '#16161a', tie: null, dress: false, shorts: false, hat: 'bellhop', hatColor: color, glasses: 0, buttons: true, scale: 1, wide: 1 });
  return buildCharacter('staff', seed, { look });
}

// ---------- helpers (bought staff and robots) ----------
const NPC_LOOKS = {
  valet: { coat: '#7a1f2b', shirt: '#f4efe6', pants: '#16161a', tie: '#111111', hat: 'cap', hatColor: '#7a1f2b', buttons: true },
  housekeeper: { dress: true, shirt: '#4a4e69', pants: '#4a4e69', maidApron: true, hat: 'band', hatColor: '#ffffff', hairStyle: 3 },
  electrician: { shirt: '#3d5a80', pants: '#3d5a80', hat: 'hardhat', hatColor: '#ffc300', belt: true, gloves: '#e9c46a' },
  guard: { coat: '#1b263b', pants: '#1b263b', shirt: '#cfd8e3', tie: '#0d1b2a', hat: 'cap', hatColor: '#0d1b2a', badge: true, wide: 1.1 },
  doorman: { coat: '#5a1f2b', pants: '#16161a', shirt: '#f4efe6', hat: 'tophat', hatColor: '#111111', buttons: true, gloves: '#f4f1ea', scale: 1.04 },
};
const ROBOT_LOOKS = {
  bellhop: { body: '#7a1f2b', trim: '#d4a017', face: '#7fffd4', hat: 'bellhop', bowtie: true },
  chef: { body: '#e8e8e8', trim: '#9aa1a6', face: '#ffb703', hat: 'chef', apron: true },
  busboy: { body: '#2a6f97', trim: '#e8e8e8', face: '#bde0fe', small: true, tub: true, bowtie: true },
  towelbot: { body: '#a8dadc', trim: '#ffffff', face: '#ff70a6', small: true, towels: true },
};

export function buildHelper(kind) {
  if (kind === 'roomba') return buildRoomba();
  if (kind === 'skimmer') return buildPoolBot();
  if (ROBOT_LOOKS[kind]) return buildRobot(ROBOT_LOOKS[kind]);
  const look = makeLook('adult', kind.length * 977 + 13);
  Object.assign(look, { tie: null, dress: false, shorts: false, glasses: 0, coat: null, scale: 1, wide: 1 }, NPC_LOOKS[kind] || {});
  return buildCharacter('staff', 1, { look });
}

function buildRobot(o) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const s = o.small ? 0.78 : 1;
  const dark = '#2e3135', joint = '#4a4f55';
  // a wheeled base with hubcaps, a rounded torso with a chest panel, and a neck
  cyl(body, 0.3 * s, 0.34 * s, 0.22 * s, '#2b2b2b', 0, 0.14 * s, 0, 14);
  cyl(body, 0.31 * s, 0.31 * s, 0.03 * s, o.trim, 0, 0.26 * s, 0, 14);
  for (const sx of [-1, 1]) {
    cyl(body, 0.12 * s, 0.12 * s, 0.08 * s, '#111111', 0.31 * s * sx, 0.12 * s, 0, 12).rotation.z = Math.PI / 2;
    cyl(body, 0.06 * s, 0.06 * s, 0.09 * s, o.trim, 0.315 * s * sx, 0.12 * s, 0, 8).rotation.z = Math.PI / 2;
  }
  rbox(body, 0.5 * s, 0.62 * s, 0.36 * s, o.body, 0, 0.58 * s, 0);
  box(body, 0.52 * s, 0.06 * s, 0.38 * s, o.trim, 0, 0.3 * s, 0);
  box(body, 0.52 * s, 0.05 * s, 0.38 * s, o.trim, 0, 0.88 * s, 0);
  box(body, 0.32 * s, 0.2 * s, 0.02, mat(dark), 0, 0.66 * s, 0.181 * s);
  box(body, 0.14 * s, 0.1 * s, 0.02, glow(o.face, 1.0), -0.06 * s, 0.67 * s, 0.188 * s);
  ['#ff3b30', '#ffcc00', '#34c759'].forEach((c, i) => box(body, 0.03 * s, 0.03 * s, 0.02, glow(c, 0.8), 0.06 * s + i * 0.04 * s, 0.67 * s, 0.188 * s));
  if (o.apron) { box(body, 0.36 * s, 0.4 * s, 0.015, mat('#f7f5ef'), 0, 0.5 * s, 0.183 * s); box(body, 0.2 * s, 0.07 * s, 0.03, mat('#c1121f'), 0, 0.84 * s, 0.17 * s); }
  if (o.bowtie) for (const e of [-1, 1]) box(body, 0.06 * s, 0.05 * s, 0.03, mat('#111111'), 0.035 * s * e, 0.84 * s, 0.19 * s).rotation.z = 0.4 * e;
  cyl(body, 0.06 * s, 0.08 * s, 0.1 * s, joint, 0, 0.95 * s, 0, 10);
  if (o.tub) box(body, 0.46 * s, 0.14 * s, 0.3 * s, '#5c6670', 0, 0.98 * s, -0.04);
  if (o.towels) ['#ffffff', '#ff70a6', '#ffffff'].forEach((c, i) => box(body, 0.34 * s, 0.07 * s, 0.24 * s, c, 0, 0.94 * s + i * 0.07 * s, -0.08));
  const head = new THREE.Group();
  head.position.set(0, 1.0 * s, 0);
  body.add(head);
  rbox(head, 0.42 * s, 0.3 * s, 0.32 * s, o.body, 0, 0.17 * s, 0);
  box(head, 0.36 * s, 0.22 * s, 0.02, mat(dark), 0, 0.17 * s, 0.158 * s);
  box(head, 0.32 * s, 0.17 * s, 0.02, glow(o.face, 1.2), 0, 0.17 * s, 0.166 * s);
  for (const e of [-1, 1]) {
    box(head, 0.05 * s, 0.07 * s, 0.01, mat('#101418'), 0.07 * s * e, 0.19 * s, 0.177 * s);
    cyl(head, 0.05 * s, 0.05 * s, 0.04 * s, joint, 0.22 * s * e, 0.17 * s, 0, 10).rotation.z = Math.PI / 2;
  }
  box(head, 0.12 * s, 0.02 * s, 0.01, mat('#101418'), 0, 0.12 * s, 0.177 * s);
  cyl(head, 0.012, 0.012, 0.16 * s, '#3a3a3a', 0.14 * s, 0.4 * s, 0, 5);
  ball(head, 0.03, glow('#ff3b30', 1.6), 0.14 * s, 0.49 * s, 0);
  if (o.hat === 'bellhop') { cyl(head, 0.15 * s, 0.15 * s, 0.11 * s, o.body, 0, 0.38 * s, 0); cyl(head, 0.152 * s, 0.152 * s, 0.03 * s, glow('#d4a017', 0.3), 0, 0.35 * s, 0); }
  if (o.hat === 'chef') { cyl(head, 0.15 * s, 0.13 * s, 0.22 * s, '#ffffff', 0, 0.43 * s, 0); ball(head, 0.17 * s, '#ffffff', 0, 0.58 * s, 0, 1, 0.7, 1); }
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(0.31 * s * side, 0.82 * s, 0);
    body.add(arm);
    ball(arm, 0.075 * s, o.trim, 0, 0, 0);
    rbox(arm, 0.09 * s, 0.22 * s, 0.09 * s, o.trim, 0, -0.12 * s, 0);
    ball(arm, 0.05 * s, joint, 0, -0.25 * s, 0);
    rbox(arm, 0.08 * s, 0.18 * s, 0.08 * s, o.body, 0, -0.35 * s, 0);
    box(arm, 0.1 * s, 0.05 * s, 0.1 * s, joint, 0, -0.45 * s, 0.01);
    for (const k of [-1, 1]) box(arm, 0.025 * s, 0.07 * s, 0.03 * s, dark, 0.03 * s * k, -0.5 * s, 0.03);
    arms.push(arm);
  }
  const hand = new THREE.Group();
  hand.position.set(0, -0.46 * s, 0.12);
  arms[0].add(hand);
  const legL = new THREE.Group(), legR = new THREE.Group();
  root.userData = { rig: { body, legL, legR, armL: arms[1], armR: arms[0], head }, hand, robot: true };
  compactRig(root.userData.rig);
  return root;
}

function buildRoomba() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  cyl(body, 0.24, 0.25, 0.09, '#2b2d42', 0, 0.06, 0, 18);
  cyl(body, 0.2, 0.2, 0.02, '#8d99ae', 0, 0.115, 0, 18);
  box(body, 0.16, 0.03, 0.04, '#1a1a1a', 0, 0.12, 0.13);
  const light = box(body, 0.06, 0.02, 0.06, glow('#38c483', 1.6), 0, 0.13, 0.02);
  const brush = new THREE.Group();
  brush.position.set(0.17, 0.02, 0.15);
  body.add(brush);
  for (let i = 0; i < 3; i++) box(brush, 0.14, 0.008, 0.012, '#c9c2b5', 0, 0, 0).rotation.y = (i * Math.PI) / 3;
  g.userData = { roomba: true, body, brush, light };
  return g;
}

function buildPoolBot() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  box(body, 0.72, 0.2, 0.5, '#f4a261', 0, 0.02, 0);
  box(body, 0.5, 0.14, 0.36, '#e9ecef', 0, 0.18, -0.03);
  for (const s of [-1, 1]) ball(body, 0.035, glow('#4fd8ff', 1.8), 0.12 * s, 0.2, 0.15);
  cyl(body, 0.012, 0.012, 0.36, '#9aa1a6', 0.18, 0.42, -0.12, 5);
  ball(body, 0.03, glow('#ff3b30', 1.6), 0.18, 0.61, -0.12);
  const arm = new THREE.Group();
  arm.position.set(0, 0.1, 0.25);
  body.add(arm);
  box(arm, 0.04, 0.04, 0.55, '#9aa1a6', 0, 0, 0.27);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 6, 14), mat('#d9d9d9'));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, -0.02, 0.62);
  arm.add(ring);
  g.userData = { pool: true, body, arm };
  return g;
}

// anim: idle|walk|run|work|clean|pickup|wave|aim|drive
export function animateHelper(obj, anim, t) {
  const u = obj.userData;
  if (u.roomba) {
    u.brush.rotation.y = t * (anim === 'idle' ? 4 : 22);
    u.body.position.y = anim === 'clean' ? Math.abs(Math.sin(t * 24)) * 0.012 : 0;
    u.light.visible = anim === 'idle' || Math.sin(t * 10) > 0;
    return;
  }
  if (u.pool) {
    u.body.position.y = Math.sin(t * 2.2) * 0.035;
    u.body.rotation.z = Math.sin(t * 1.7) * 0.05;
    u.arm.rotation.x = anim === 'clean' ? 0.25 + Math.sin(t * 7) * 0.2 : -0.1;
    return;
  }
  const base = anim === 'walk' || anim === 'run' ? anim : 'idle';
  animateCharacter(obj, base, null, t);
  const r = u.rig;
  if (u.robot) r.body.position.y = (base === 'idle' ? Math.sin(t * 2) * 0.01 : Math.abs(Math.sin(t * 9)) * 0.015);
  if (anim === 'work' || anim === 'clean') {
    r.armR.rotation.x = -0.95 + Math.sin(t * 13) * 0.35;
    r.armL.rotation.x = -0.6 + Math.sin(t * 13 + 1.3) * 0.25;
    r.body.rotation.x = 0.12;
  } else r.body.rotation.x = 0;
  if (anim === 'pickup') r.armL.rotation.x = r.armR.rotation.x = -1.1;
  if (anim === 'wave') { r.armR.rotation.x = -2.7 + Math.sin(t * 9) * 0.25; r.head.rotation.x = 0.15; }
  else r.head.rotation.x = 0;
  if (anim === 'aim') r.armR.rotation.x = -1.55;
}

// Character animation. anim: walk|run|idle|stun; pose: sit|lie|swim|null
export function animateCharacter(obj, anim, pose, t) {
  const r = obj.userData.rig;
  if (!r) return;
  r.body.position.y = 0;
  r.body.rotation.z = 0;
  if (pose === 'sit') {
    r.legL.rotation.x = r.legR.rotation.x = -Math.PI / 2;
    r.body.position.y = -0.42;
    r.armL.rotation.x = r.armR.rotation.x = -0.45;
    return;
  }
  if (pose === 'lie') {
    r.legL.rotation.x = r.legR.rotation.x = 0;
    r.armL.rotation.x = r.armR.rotation.x = 0;
    return;
  }
  if (pose === 'swim') {
    const s = t * 4;
    r.armL.rotation.x = -1.6 + Math.sin(s) * 1.2;
    r.armR.rotation.x = -1.6 + Math.sin(s + Math.PI) * 1.2;
    r.legL.rotation.x = Math.sin(s * 1.6) * 0.35;
    r.legR.rotation.x = -Math.sin(s * 1.6) * 0.35;
    return;
  }
  if (anim === 'walk' || anim === 'run') {
    const f = anim === 'run' ? 12 : 7.5, a = anim === 'run' ? 0.95 : 0.55;
    const s = Math.sin(t * f);
    r.legL.rotation.x = s * a;
    r.legR.rotation.x = -s * a;
    r.armL.rotation.x = -s * a * 0.9;
    r.armR.rotation.x = s * a * 0.9 - (obj.userData.carrying ? 0.6 : 0);
    r.body.position.y = Math.abs(Math.cos(t * f)) * 0.045;
  } else if (anim === 'stun') {
    r.body.rotation.z = Math.sin(t * 30) * 0.08;
    r.armL.rotation.x = r.armR.rotation.x = -2.6;
  } else {
    r.legL.rotation.x = r.legR.rotation.x = 0;
    r.armL.rotation.x = Math.sin(t * 1.3) * 0.04;
    r.armR.rotation.x = -Math.sin(t * 1.3) * 0.04 - (obj.userData.carrying ? 0.6 : 0);
  }
}

// ---------- monsters ----------
export function buildPorter() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const red = '#3d0a10', skin = '#ece6dc';
  const hip = 1.35;
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(0.1 * s, hip, 0);
    body.add(leg);
    box(leg, 0.11, 1.32, 0.13, '#0e0a0b', 0, -0.66, 0);
    box(leg, 0.13, 0.08, 0.3, '#050505', 0, -1.31, 0.06);
    legs.push(leg);
  }
  box(body, 0.36, 0.86, 0.2, red, 0, hip + 0.43, 0);
  for (let i = 0; i < 4; i++) box(body, 0.04, 0.04, 0.02, glow('#6b5a1a', 0.2), 0.08, hip + 0.7 - i * 0.16, 0.11);
  box(body, 0.08, 0.38, 0.08, skin, 0, hip + 1.05, 0);
  const head = new THREE.Group();
  head.position.set(0, hip + 1.22, 0.04);
  body.add(head);
  box(head, 0.28, 0.38, 0.27, skin, 0, 0.17, 0);
  for (const s of [-1, 1]) { box(head, 0.08, 0.09, 0.02, '#000000', 0.07 * s, 0.22, 0.137); box(head, 0.02, 0.02, 0.02, glow('#ff1a1a', 3), 0.07 * s, 0.22, 0.142); }
  box(head, 0.18, 0.025, 0.02, '#1a0000', 0, 0.06, 0.137);
  cyl(head, 0.14, 0.14, 0.12, red, 0, 0.42, 0);
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(0.24 * s, hip + 0.8, 0);
    body.add(arm);
    box(arm, 0.1, 1.12, 0.11, red, 0, -0.56, 0);
    for (let f = 0; f < 3; f++) box(arm, 0.02, 0.24, 0.02, skin, (f - 1) * 0.03, -1.22, 0.02);
    arms.push(arm);
  }
  root.userData = { rig: { body, legL: legs[1], legR: legs[0], armL: arms[1], armR: arms[0], head } };
  compactRig(root.userData.rig);
  return root;
}

export function buildShade() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const dark = mat('#050307', { transparent: true, opacity: 0.88 });
  const robe = new THREE.Mesh(cylGeo(0.22, 0.5, 1.5, 9, true), dark);
  robe.position.y = 0.95;
  body.add(robe);
  ball(body, 0.24, dark, 0, 1.9, 0);
  for (const s of [-1, 1]) ball(body, 0.04, glow('#ff2020', 4), 0.08 * s, 1.93, 0.2);
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(0.28 * s, 1.6, 0);
    body.add(arm);
    box(arm, 0.08, 0.9, 0.08, dark, 0, -0.45, 0);
    arms.push(arm);
  }
  const legL = new THREE.Group(), legR = new THREE.Group();
  root.userData = { rig: { body, legL, legR, armL: arms[1], armR: arms[0], head: body }, float: true };
  return root;
}

// ---------- carried items ----------
const HANDLE = new THREE.TorusGeometry(0.035, 0.011, 6, 12, Math.PI); // a mug handle
const STEEL_C = '#9aa1a6';
export function buildItem(type, opts = {}) {
  const g = new THREE.Group();
  const plate = () => cyl(g, 0.17, 0.15, 0.025, '#f4f1ea', 0, 0.0125, 0, 16);
  const mug = (r, color) => { const h = new THREE.Mesh(HANDLE, mat(color)); h.position.set(r, 0.065, 0); h.rotation.z = -Math.PI / 2; g.add(h); };
  switch (type) {
    case 'mop':
      cyl(g, 0.022, 0.022, 1.35, '#c9a26b', 0, 0.78, 0, 6);
      cyl(g, 0.13, 0.17, 0.16, '#d6d2c4', 0, 0.08, 0, 10);
      box(g, 0.2, 0.04, 0.06, '#5a6b7a', 0, 0.17, 0);
      break;
    case 'net': {
      cyl(g, 0.018, 0.018, 1.6, '#9aa5b1', 0, 0.8, 0, 6);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.015, 6, 16), mat('#d9d9d9'));
      ring.position.y = 1.72;
      ring.rotation.y = Math.PI / 2;
      g.add(ring);
      const netMesh = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 10, 1, true), mat('#ffffff', { transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
      netMesh.position.set(0.12, 1.72, 0);
      netMesh.rotation.z = -Math.PI / 2;
      g.add(netMesh);
      break;
    }
    case 'plunger':
      cyl(g, 0.02, 0.02, 0.6, '#8b5a2b', 0, 0.4, 0, 6);
      cyl(g, 0.08, 0.12, 0.11, '#c1121f', 0, 0.06, 0, 10);
      break;
    case 'luggage': {
      const c = opts.color || '#b23a48';
      box(g, 0.46, 0.6, 0.24, c, 0, 0.36, 0);
      box(g, 0.48, 0.03, 0.26, '#1f1f1f', 0, 0.36, 0);
      box(g, 0.03, 0.18, 0.03, '#2b2b2b', -0.08, 0.75, 0);
      box(g, 0.03, 0.18, 0.03, '#2b2b2b', 0.08, 0.75, 0);
      box(g, 0.2, 0.03, 0.04, '#2b2b2b', 0, 0.84, 0);
      box(g, 0.07, 0.1, 0.01, '#fff8e1', 0.14, 0.55, 0.125);
      for (const s of [-1, 1]) cyl(g, 0.03, 0.03, 0.03, '#111', 0.17 * s, 0.03, -0.08, 8).rotation.z = Math.PI / 2;
      break;
    }
    case 'towels':
      ['#ffffff', '#a8dadc', '#ffffff'].forEach((c, i) => box(g, 0.36, 0.075, 0.24, c, 0, 0.04 + i * 0.075, 0));
      break;
    case 'egg_raw':
      box(g, 0.3, 0.07, 0.13, '#cdb891', 0, 0.035, 0);
      for (let i = 0; i < 6; i++) ball(g, 0.035, '#f8f4ea', -0.1 + (i % 3) * 0.1, 0.09, (i < 3 ? -1 : 1) * 0.03, 1, 1.25, 1);
      break;
    case 'batter':
      cyl(g, 0.1, 0.08, 0.16, '#e8e2d0', 0, 0.08, 0);
      cyl(g, 0.095, 0.095, 0.01, '#f1d58a', 0, 0.155, 0);
      break;
    case 'bacon_raw':
      plate();
      for (let i = 0; i < 3; i++) box(g, 0.22, 0.012, 0.04, '#f09a9a', 0, 0.03, -0.05 + i * 0.05);
      break;
    case 'blood':
      box(g, 0.2, 0.26, 0.05, mat('#7a0000', { emissive: '#2a0000' }), 0, 0.14, 0);
      box(g, 0.12, 0.05, 0.051, '#f0f0f0', 0, 0.2, 0);
      cyl(g, 0.01, 0.01, 0.12, '#7a0000', 0, 0.32, 0, 5);
      break;
    case 'battery':
      for (const s of [-1, 1]) { cyl(g, 0.03, 0.03, 0.14, '#d4a017', 0.04 * s, 0.07, 0, 10); cyl(g, 0.031, 0.031, 0.05, '#111', 0.04 * s, 0.03, 0, 10); }
      break;
    case 'eggs':
      plate();
      for (const s of [-1, 1]) { cyl(g, 0.065, 0.065, 0.012, '#fbfbf5', 0.05 * s, 0.03, 0, 12); ball(g, 0.028, '#f4b400', 0.05 * s, 0.04, 0, 1, 0.6, 1); }
      break;
    case 'pancakes':
      plate();
      for (let i = 0; i < 3; i++) cyl(g, 0.12 - i * 0.005, 0.12, 0.03, i % 2 ? '#d6964a' : '#c98a3b', 0, 0.04 + i * 0.032, 0, 14);
      cyl(g, 0.1, 0.1, 0.006, '#8a4a12', 0, 0.12, 0, 14);
      box(g, 0.012, 0.05, 0.03, '#8a4a12', 0.105, 0.1, 0.02);
      box(g, 0.05, 0.025, 0.05, '#fff2a8', 0, 0.135, 0);
      break;
    case 'bacon':
      plate();
      for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) box(g, 0.058, 0.015, 0.04, j % 2 ? '#a3482a' : '#7d3016', -0.087 + j * 0.058, 0.03 + (j % 2) * 0.01, -0.05 + i * 0.05);
      break;
    case 'coffee':
      cyl(g, 0.06, 0.055, 0.12, '#f4f1ea', 0, 0.06, 0, 12);
      cyl(g, 0.055, 0.055, 0.005, '#3b2414', 0, 0.118, 0, 12);
      mug(0.062, '#f4f1ea');
      cyl(g, 0.09, 0.08, 0.01, '#f4f1ea', 0, 0.005, 0, 14);
      break;
    case 'cocoa':
      cyl(g, 0.062, 0.056, 0.13, '#7a1f2b', 0, 0.065, 0, 12);
      cyl(g, 0.056, 0.056, 0.005, '#5a2e14', 0, 0.128, 0, 12);
      mug(0.064, '#7a1f2b');
      ball(g, 0.05, '#fbf7ee', 0, 0.14, 0, 1, 0.55, 1);
      for (let i = 0; i < 3; i++) box(g, 0.022, 0.022, 0.022, '#ffffff', Math.cos(i * 2.1) * 0.03, 0.165, Math.sin(i * 2.1) * 0.03).rotation.y = i;
      break;
    case 'omelette': {
      plate();
      const om = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 14, 1, false, 0, Math.PI), mat('#f3cf5f'));
      om.position.y = 0.045;
      g.add(om);
      box(g, 0.2, 0.012, 0.02, '#f29e1f', 0, 0.035, 0.005);
      for (let i = 0; i < 4; i++) box(g, 0.012, 0.004, 0.012, '#3c7a2a', -0.06 + i * 0.04, 0.067, 0.05 - (i % 2) * 0.03);
      break;
    }
    case 'waffles':
      plate();
      rbox(g, 0.2, 0.035, 0.2, '#d9a03f', 0, 0.045, 0);
      for (let i = -1; i <= 1; i++) { box(g, 0.19, 0.006, 0.012, '#9c6a22', 0, 0.064, i * 0.05); box(g, 0.012, 0.006, 0.19, '#9c6a22', i * 0.05, 0.064, 0); }
      box(g, 0.05, 0.022, 0.05, '#fff2a8', 0.02, 0.075, -0.02);
      box(g, 0.13, 0.004, 0.08, '#8a4a12', -0.02, 0.066, 0.03).rotation.y = 0.5;
      break;
    case 'cheese': {
      const w = new THREE.Mesh(cylGeo(0.12, 0.12, 0.08, 3), mat('#f2c14e'));
      w.position.y = 0.04;
      g.add(w);
      for (let i = 0; i < 3; i++) ball(g, 0.014, '#d9a322', Math.cos(i * 2.1 + 0.5) * 0.05, 0.081, Math.sin(i * 2.1 + 0.5) * 0.05, 1, 0.3, 1);
      break;
    }
    case 'pan': // what the stove shows under food that's cooking
      cyl(g, 0.16, 0.13, 0.04, '#232323', 0, 0.02, 0, 16);
      cyl(g, 0.14, 0.14, 0.005, '#3a3a3a', 0, 0.04, 0, 16);
      box(g, 0.24, 0.02, 0.035, '#151515', 0.27, 0.04, 0);
      break;
    case 'extinguisher':
      cyl(g, 0.085, 0.085, 0.42, '#c1121f', 0, 0.23, 0, 14);
      ball(g, 0.085, '#c1121f', 0, 0.44, 0, 1, 0.55, 1);
      cyl(g, 0.088, 0.088, 0.1, '#f2efe6', 0, 0.25, 0, 14);
      cyl(g, 0.03, 0.03, 0.07, '#222222', 0, 0.5, 0, 8);
      box(g, 0.16, 0.02, 0.04, '#2b2b2b', 0.04, 0.55, 0);
      box(g, 0.14, 0.02, 0.035, '#2b2b2b', 0.03, 0.525, 0).rotation.z = -0.2;
      cyl(g, 0.012, 0.012, 0.28, '#151515', -0.09, 0.38, 0.02, 6).rotation.z = 0.25;
      cyl(g, 0.02, 0.012, 0.07, '#151515', -0.13, 0.22, 0.03, 6);
      cyl(g, 0.088, 0.088, 0.03, '#151515', 0, 0.015, 0, 14);
      break;
    case 'bread':
      box(g, 0.26, 0.12, 0.15, '#d9a35f', 0, 0.06, 0);
      box(g, 0.24, 0.025, 0.13, '#f3d9a4', 0, 0.125, 0);
      break;
    case 'toast':
      plate();
      for (const s of [-1, 1]) {
        const slice = new THREE.Group();
        slice.position.set(0.045 * s, 0.035 + (s > 0 ? 0.017 : 0), 0.01 * s);
        slice.rotation.y = 0.35 * s;
        g.add(slice);
        rbox(slice, 0.125, 0.016, 0.125, '#8a5420', 0, 0, 0);
        box(slice, 0.1, 0.004, 0.1, '#d39a4a', 0, 0.008, 0);
      }
      break;
    case 'juice':
      cyl(g, 0.05, 0.045, 0.14, '#ffb703', 0, 0.07, 0, 12);
      cyl(g, 0.051, 0.051, 0.02, '#f4f1ea', 0, 0.12, 0, 12);
      box(g, 0.012, 0.12, 0.012, '#ff4d6d', 0.02, 0.17, 0).rotation.z = 0.2;
      break;
    case 'dishes': // a bus tub of dirty plates, cups and cutlery
      box(g, 0.46, 0.16, 0.32, '#5c6670', 0, 0.08, 0);
      box(g, 0.48, 0.02, 0.34, '#4a535b', 0, 0.16, 0);
      for (let i = 0; i < 4; i++) cyl(g, 0.12, 0.1, 0.02, '#f4f1ea', -0.08 + (i % 2) * 0.16, 0.17 + Math.floor(i / 2) * 0.025, 0, 12);
      cyl(g, 0.04, 0.035, 0.08, '#f4f1ea', 0.15, 0.2, 0.08, 8);
      for (let i = 0; i < 3; i++) box(g, 0.035, 0.015, 0.03, ['#c98a3b', '#f4b400', '#7d3016'][i], -0.1 + i * 0.09, 0.22, -0.03 + (i % 2) * 0.05);
      box(g, 0.02, 0.008, 0.18, STEEL_C, -0.12, 0.215, 0.02).rotation.y = 0.6;
      break;
    case 'tray': {
      box(g, 0.5, 0.02, 0.34, '#4a2c1a', 0, 0.01, 0);
      for (const s of [-1, 1]) { box(g, 0.5, 0.035, 0.02, '#3a2416', 0, 0.03, 0.17 * s); box(g, 0.02, 0.035, 0.34, '#3a2416', 0.25 * s, 0.03, 0); }
      (opts.c || []).slice(0, 3).forEach((d, i) => {
        const sub = buildItem(String(d).startsWith('burnt:') ? 'burnt' : d);
        sub.scale.setScalar(0.7);
        sub.position.set(-0.15 + i * 0.15, 0.02, 0);
        g.add(sub);
      });
      break;
    }
    case 'burnt': {
      plate();
      const lump = new THREE.Mesh(new THREE.DodecahedronGeometry(0.08), mat('#151010'));
      lump.position.y = 0.07;
      lump.scale.y = 0.6;
      g.add(lump);
      break;
    }
    case 'body': {
      const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.25, 4, 10), mat('#101012'));
      bag.rotation.x = Math.PI / 2;
      bag.position.y = 0.24;
      bag.scale.y = 1;
      bag.scale.set(1, 1, 0.75);
      g.add(bag);
      box(g, 0.02, 0.02, 1.3, '#4a4a4a', 0, 0.42, 0);
      break;
    }
  }
  return g;
}

// What's in the pan on a burner: raw (state 'c'), cooked ('d') or burnt ('b').
const LUMP = new THREE.DodecahedronGeometry(0.05);
export function buildPanFood(raw, st, cheese) {
  const g = buildItem('pan');
  const y = 0.048, done = st === 'd';
  if (st === 'b') {
    for (let i = 0; i < 3; i++) {
      const l = new THREE.Mesh(LUMP, mat('#151010'));
      l.position.set(Math.cos(i * 2.1) * 0.05, y + 0.015, Math.sin(i * 2.1) * 0.05);
      l.scale.y = 0.5;
      g.add(l);
    }
  } else if (raw === 'egg_raw' && cheese && done) {
    const om = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.035, 14, 1, false, 0, Math.PI), mat('#f3cf5f'));
    om.position.y = y + 0.012;
    g.add(om);
  } else if (raw === 'egg_raw') {
    for (const s of [-1, 1]) { cyl(g, 0.06, 0.06, 0.01, done ? '#fbfbf5' : '#e9e6da', 0.05 * s, y, 0, 12); ball(g, 0.026, '#f4b400', 0.05 * s, y + 0.008, 0, 1, 0.6, 1); }
    if (cheese) for (let i = 0; i < 6; i++) box(g, 0.035, 0.006, 0.008, '#f2c14e', Math.cos(i * 1.1) * 0.06, y + 0.012, Math.sin(i * 1.7) * 0.05).rotation.y = i;
  } else if (raw === 'batter') {
    cyl(g, 0.115, 0.115, 0.02, done ? '#c98a3b' : '#efd9a0', 0, y + 0.004, 0, 14);
  } else if (raw === 'bacon_raw') {
    for (let i = 0; i < 3; i++) box(g, 0.2, 0.012, 0.034, done ? '#8b3a1a' : '#f09a9a', 0, y, -0.045 + i * 0.045);
  }
  return g;
}

// ---------- messes ----------
const decalGeo = new THREE.PlaneGeometry(1, 1);
const decalMats = new Map();
function decalMat(kind, seed, color, basic, opacity = 0.9) {
  const key = `${kind}:${seed % 4}:${color}`;
  if (decalMats.has(key)) return decalMats.get(key);
  const opts = { color, map: splatTexture(kind, seed), transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 };
  const m = basic ? new THREE.MeshBasicMaterial(opts) : new THREE.MeshLambertMaterial(opts);
  decalMats.set(key, m);
  return m;
}

export function buildMess(type, id) {
  const g = new THREE.Group();
  const rot = (id * 2.399) % (Math.PI * 2);
  const decal = (color, size, basic = false, opacity) => {
    const m = new THREE.Mesh(decalGeo, decalMat(type, id, color, basic, opacity));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rot;
    m.scale.set(size, size, 1);
    m.position.y = 0.012;
    g.add(m);
    return m;
  };
  switch (type) {
    case 'spill': decal('#b98b4a', 1.0); break;
    case 'stain': decal('#5e4126', 0.85); break;
    case 'mud': decal('#3f2b18', 1.1); break;
    case 'vomit':
      decal('#9aa33c', 1.0);
      for (let i = 0; i < 5; i++) box(g, 0.05, 0.03, 0.05, '#c2b34a', Math.cos(i * 2.1 + id) * 0.2, 0.02, Math.sin(i * 2.1 + id) * 0.2);
      break;
    case 'blood': decal('#5a0000', 1.35, false, 0.95); break;
    case 'slime': decal('#5dff5d', 1.0, true, 0.8); break;
    case 'ecto': decal('#c4f6ff', 1.0, true, 0.75); break;
    case 'circle': {
      const m = decal('#ff2222', 1.9, true, 0.9);
      m.material = m.material.clone();
      m.material.blending = THREE.AdditiveBlending;
      g.userData.circle = m;
      break;
    }
    case 'debris':
      for (let i = 0; i < 3; i++) {
        const leaf = box(g, 0.16, 0.01, 0.09, i % 2 ? '#6b8e23' : '#7a5230', Math.cos(i * 2 + id) * 0.18, 0, Math.sin(i * 2 + id) * 0.18);
        leaf.rotation.y = i + id;
      }
      cyl(g, 0.035, 0.035, 0.12, '#c1121f', 0.05, 0.01, -0.05, 8).rotation.z = Math.PI / 2;
      break;
    case 'trash':
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.065, 0), mat(i ? '#e8e4dc' : '#c9c2b5'));
        b.position.set(Math.cos(i * 2.3 + id) * 0.16, 0.06, Math.sin(i * 2.3 + id) * 0.16);
        g.add(b);
      }
      cyl(g, 0.035, 0.035, 0.12, ['#c1121f', '#1d4ed8', '#2d6a4f'][id % 3], 0.1, 0.035, -0.12, 8).rotation.z = Math.PI / 2;
      break;
    case 'table':
      for (const s of [-1, 1]) { cyl(g, 0.15, 0.13, 0.02, '#f4f1ea', 0.3 * s, 0.01, 0.1 * s, 14); box(g, 0.12, 0.012, 0.06, '#7a4a20', 0.3 * s, 0.026, 0.1 * s); }
      cyl(g, 0.05, 0.045, 0.1, '#f4f1ea', 0.05, 0.05, -0.3, 10);
      box(g, 0.14, 0.01, 0.14, '#e8e0d0', -0.2, 0.01, -0.3).rotation.y = 0.5;
      break;
    case 'bed':
      for (let i = 0; i < 4; i++) {
        const b = box(g, 0.7, 0.12, 0.6, i % 2 ? '#e9e4da' : '#d8d0c0', Math.cos(i * 1.7) * 0.4, 0.03 + i * 0.03, Math.sin(i * 1.7) * 0.5);
        b.rotation.set(0.15 * (i - 1.5), i * 0.7, 0.1);
      }
      box(g, 0.5, 0.14, 0.32, '#ffffff', 0.35, 0.12, 0.7).rotation.y = 0.6;
      break;
    case 'clog':
      cyl(g, 0.15, 0.15, 0.02, '#4a3018', 0, 0, 0, 14);
      break;
  }
  return g;
}

// ---------- cars ----------
const CAR_LEN = { sedan: 4.3, hatch: 3.8, van: 4.8, pickup: 5.0, wagon: 4.6, limo: 6.8, hearse: 5.8, black: 4.4, sports: 4.4 };
export function carLength(model) { return CAR_LEN[model] || 4.3; }

export function buildCar(model, color) {
  const g = new THREE.Group();
  const len = carLength(model);
  const paint = mat(color);
  const glass = mat('#1a2633');
  const trim = mat('#1b1b1b');
  box(g, 2.0, 0.62, len, paint, 0, 0.56, 0);
  box(g, 2.04, 0.18, 0.16, trim, 0, 0.36, len / 2);
  box(g, 2.04, 0.18, 0.16, trim, 0, 0.36, -len / 2);
  let cabin = null;
  if (model === 'van') {
    cabin = box(g, 1.94, 0.9, len * 0.78, paint, 0, 1.3, -len * 0.08);
    box(g, 1.96, 0.42, len * 0.7, glass, 0, 1.4, -len * 0.08);
  } else if (model === 'pickup') {
    cabin = box(g, 1.88, 0.62, 1.7, paint, 0, 1.18, len * 0.08);
    box(g, 1.9, 0.38, 1.6, glass, 0, 1.24, len * 0.08);
    for (const s of [-1, 1]) box(g, 0.08, 0.4, len * 0.38, paint, 0.96 * s, 1.0, -len * 0.27);
    box(g, 2.0, 0.4, 0.08, paint, 0, 1.0, -len / 2 + 0.04);
  } else if (model === 'hearse' || model === 'limo' || model === 'wagon') {
    const cabinLen = model === 'limo' ? 0.72 : 0.7;
    cabin = box(g, 1.86, model === 'hearse' ? 0.82 : 0.58, len * cabinLen, paint, 0, model === 'hearse' ? 1.27 : 1.15, -len * 0.08);
    box(g, 1.88, 0.4, len * cabinLen * 0.94, glass, 0, model === 'hearse' ? 1.3 : 1.17, -len * 0.08);
    if (model === 'hearse') box(g, 1.9, 0.36, len * 0.42, mat('#4a0e3a'), 0, 1.3, -len * 0.22);
  } else if (model === 'sports') {
    cabin = box(g, 1.7, 0.36, len * 0.36, paint, 0, 1.03, -len * 0.1);
    box(g, 1.72, 0.26, len * 0.34, glass, 0, 1.05, -len * 0.1);
    box(g, 1.9, 0.06, 0.32, trim, 0, 1.12, -len / 2 + 0.2);
    for (const s of [-1, 1]) box(g, 0.06, 0.24, 0.06, trim, 0.7 * s, 0.98, -len / 2 + 0.2);
  } else {
    const cl = model === 'hatch' ? 0.55 : 0.48;
    cabin = box(g, 1.8, 0.56, len * cl, paint, 0, 1.15, model === 'hatch' ? -len * 0.12 : -len * 0.04);
    box(g, 1.82, 0.38, len * cl * 0.94, glass, 0, 1.16, model === 'hatch' ? -len * 0.12 : -len * 0.04);
  }
  // a crust of mountain snow on the roof
  if (cabin) box(g, cabin.scale.x - 0.14, 0.09, cabin.scale.z - 0.3, '#f4f7fa', 0, cabin.position.y + cabin.scale.y / 2 + 0.04, cabin.position.z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = cyl(g, 0.36, 0.36, 0.28, '#121212', 0.92 * sx, 0.36, len * 0.32 * sz, 12);
    w.rotation.z = Math.PI / 2;
    cyl(g, 0.18, 0.18, 0.29, '#8d99ae', 0.92 * sx, 0.36, len * 0.32 * sz, 8).rotation.z = Math.PI / 2;
  }
  for (const s of [-1, 1]) {
    box(g, 0.42, 0.14, 0.05, glow('#fff6c2', 1.2), 0.68 * s, 0.66, len / 2 + 0.01);
    box(g, 0.36, 0.12, 0.05, glow('#ff2a2a', 1.0), 0.7 * s, 0.68, -len / 2 - 0.01);
  }
  g.userData.len = len;
  return g;
}

// ---------- UFO ----------
export function buildUfo() {
  const g = new THREE.Group();
  ball(g, 1, '#8e9aaf', 0, 0, 0, 5, 0.9, 5);
  ball(g, 1, mat('#7dffb0', { emissive: '#2dff8a', emissiveIntensity: 0.8, transparent: true, opacity: 0.75 }), 0, 0.7, 0, 1.7, 1.2, 1.7);
  const lights = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    lights.push(ball(g, 0.22, glow(i % 2 ? '#ff4fd8' : '#4fd8ff', 3), Math.cos(a) * 4.6, -0.1, Math.sin(a) * 4.6));
  }
  const beam = new THREE.Mesh(cylGeo(1.2, 3.4, 14, 20, true), new THREE.MeshBasicMaterial({ color: '#9dffb5', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = -7;
  beam.visible = false;
  g.add(beam);
  g.userData = { beam, lights };
  return g;
}
