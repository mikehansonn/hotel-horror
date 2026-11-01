// Builds the static hotel scene (merged by material for speed) and drives its dynamic parts:
// doors, curtains, thermostats, stoves, the status board, pool water, lights, snow and the sky.
// Upper floors are laid out side by side in the layout (see layout.js) and lifted into place here;
// parts that depend on upgrades live in their own merged groups that are shown, hidden or rebuilt.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as L from './layout.js';
import { makeSurfaces, labelTexture, drawStatusBoard, drawTickets } from './textures.js';
import { PROPS, LIGHTS } from './props.js';
import { box, mat, buildItem, buildPanFood, compactGroup } from './models.js';
import { DISHES } from './content.js';
import { clamp, lerp, mulberry32 } from './util.js';

const WALL_STYLE = { lobby: 'wallLobby', hall: 'wallHall', room: 'wallRoom', bath: 'wallTile', dining: 'wallDining', tile: 'wallTile', plain: 'wallPlain', concrete: 'wallConcrete', pool: 'wallPool', staff: 'wallStaff', lodge: 'lodge', siding: 'siding', lounge: 'wallLounge' };
const SHINY = new Set(['marble', 'wood', 'checker', 'tile', 'pooltile']);
const TIER_CODE = { b: 'basic', s: 'suite', p: 'pres' };
const ROOF_RISE = 3.4; // height of the pitched roof over the room tower
const INTERIOR = 7.5;  // brightness of the ceiling lights
const LAMP_GLOW = 1.15; // how hard lamp shades glow (they feed the bloom)
const PASS_X = [-20.05, -19.6, -19.15, -18.7]; // where plates sit on the pass

// Plain single-color props all share one vertex-colored material once merged, so a hundred
// differently colored pieces of furniture cost one draw call instead of a hundred.
const VC_STATIC = new THREE.MeshLambertMaterial({ vertexColors: true });
const isPlain = m => m.isMeshLambertMaterial && !m.map && !m.transparent && !m.vertexColors && m.side === THREE.FrontSide && m.emissive.getHex() === 0;

class Batch {
  constructor() { this.byMat = new Map(); }
  add(mesh) {
    mesh.updateWorldMatrix(true, false);
    let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(mesh.matrixWorld);
    if (mesh.userData.worldUV) worldUV(g, ...mesh.userData.worldUV);
    let material = mesh.material;
    if (isPlain(material)) {
      const c = material.color, n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      material = VC_STATIC;
    }
    if (!this.byMat.has(material)) this.byMat.set(material, []);
    this.byMat.get(material).push(g);
  }
  // Merges every non-"keep" mesh under root; kept meshes stay in the scene graph.
  absorb(root) {
    root.updateMatrixWorld(true);
    const merge = [];
    root.traverse(o => { if (o.isMesh && !o.userData.keep && !o.material.transparent) merge.push(o); });
    for (const m of merge) { this.add(m); m.parent.remove(m); }
  }
  build(target) {
    for (const [material, geos] of this.byMat) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      const mesh = new THREE.Mesh(merged, material);
      mesh.matrixAutoUpdate = false;
      mesh.userData.merged = true;
      target.add(mesh);
    }
    this.byMat.clear();
  }
}

function worldUV(g, scale, vScale = scale) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    if (ny >= nx && ny >= nz) uv.setXY(i, p.getX(i) / scale, -p.getZ(i) / scale);
    else if (nx >= nz) uv.setXY(i, p.getZ(i) / scale, p.getY(i) / vScale);
    else uv.setXY(i, p.getX(i) / scale, p.getY(i) / vScale);
  }
}

function wallZoneStyle(x, z) {
  for (const r of L.ROOMS) {
    const b = r.bathBox;
    if (x > b[0] && x < b[2] && z > b[1] && z < b[3]) return 'bath';
  }
  const zn = L.zoneAt(x, z);
  if (zn.id === 'outside') return L.floorOf(x) ? 'siding' : 'lodge';
  return zn.wall;
}

function placeProp(f, parent) {
  const build = PROPS[f.kind];
  if (!build) { console.warn('missing prop', f.kind); return null; }
  const g = build(f);
  g.position.set(f.x, f.kind === 'statusBoard' ? f.y : 0, f.z);
  g.rotation.y = f.ry || 0;
  parent.add(g);
  return g;
}

// A soft round glow (for sprites that make a small light visible from far away).
function glowTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color + '88');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A rectangle minus some holes, as a list of rectangles.
function cutRect(r, holes) {
  let parts = [{ x1: r.x1, z1: r.z1, x2: r.x2, z2: r.z2 }];
  for (const h of holes) {
    const next = [];
    for (const p of parts) {
      const x1 = Math.max(p.x1, h.x1), x2 = Math.min(p.x2, h.x2), z1 = Math.max(p.z1, h.z1), z2 = Math.min(p.z2, h.z2);
      if (x1 >= x2 || z1 >= z2) { next.push(p); continue; }
      if (p.z1 < z1) next.push({ ...p, z2: z1 });
      if (z2 < p.z2) next.push({ ...p, z1: z2 });
      if (p.x1 < x1) next.push({ ...p, x2: x1, z1, z2 });
      if (x2 < p.x2) next.push({ ...p, x1: x2, z1, z2 });
    }
    parts = next;
  }
  return parts;
}
// The opening the staircase climbs through on storey f, in layout coordinates.
const stairHoles = f => [{ x1: L.STAIRS.x1 + f * L.FLOOR_DX, x2: L.STAIRS.x2 + f * L.FLOOR_DX, z1: L.STAIRS.z1, z2: L.STAIRS.z2 }];
const overlaps = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.z1 < b.z2 && a.z2 > b.z1;

const condKey = o => [o.on && `on:${o.on}`, o.off && `off:${o.off}`, o.gate && `gate:${o.gate}`].filter(Boolean).join('|');
const floorOffset = (obj, f) => obj.position.set(-f * L.FLOOR_DX, f * L.FLOOR_H, 0);

export function buildWorld(scene) {
  const T = makeSurfaces();
  const surf = {};
  const S = key => (surf[key] ||= SHINY.has(key)
    ? new THREE.MeshPhongMaterial({ map: T[key], shininess: 38, specular: '#2a2a2a' })
    : new THREE.MeshLambertMaterial({ map: T[key] }));
  const batch = new Batch();
  const staticRoot = new THREE.Group();
  scene.add(staticRoot);

  // Everything on an upper floor, or tied to an upgrade, goes into its own group per (floor, condition).
  const groups = new Map();
  const parentFor = (x, cond = {}) => {
    const f = L.floorOf(x), key = condKey(cond);
    if (!f && !key) return staticRoot;
    const k = `${f}|${key}`;
    if (!groups.has(k)) groups.set(k, { root: new THREE.Group(), cond: { on: cond.on, off: cond.off, gate: cond.gate }, f });
    return groups.get(k).root;
  };
  // Doors on upper floors swing, so they can't be merged: one plain group per floor holds them.
  const floorDyn = L.FLOORS.map(F => { const g = new THREE.Group(); scene.add(g); floorOffset(g, F.f); return g; });

  // Lamps and lit windows on each floor get their own material so an unbuilt floor stays dark.
  const wingMats = {};
  const lampFor = wing => (wing ? (wingMats[`lamp:${wing}`] ||= LIGHTS.lamp.clone()) : LIGHTS.lamp);
  const facadeFor = wing => (wing ? (wingMats[`facade:${wing}`] ||= LIGHTS.facade.clone()) : LIGHTS.facade);

  const slab = (x1, z1, x2, z2, y, key, scale = 2, parent = staticRoot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x2 - x1, z2 - z1), S(key));
    m.rotation.x = -Math.PI / 2;
    m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
    m.userData.worldUV = [scale];
    parent.add(m);
    return m;
  };
  const slabBox = (x1, z1, x2, z2, y1, y2, material, uv, parent = staticRoot) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, y2 - y1, z2 - z1), material);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    if (uv) m.userData.worldUV = uv;
    parent.add(m);
    return m;
  };

  // ---------- floors ----------
  const FLOOR_SCALE = { marble: 2.4, wood: 3, checker: 1.6, tile: 1.2, concrete: 4, carpet: 2.6, pooltile: 1.5 };
  for (const z of L.ZONES) {
    if (z.id === 'pool') continue;
    const parent = parentFor((z.x1 + z.x2) / 2, { gate: z.wing });
    const holes = z.wing ? stairHoles(L.floorOf(z.x1 + 1)) : []; // upstairs, the staircase comes up through the floor
    for (const r of cutRect(z, holes)) slab(r.x1, r.z1, r.x2, r.z2, 0, z.floor, FLOOR_SCALE[z.floor], parent);
  }
  const P = L.POOL, PZ = L.ZONES.find(z => z.id === 'pool');
  slab(PZ.x1, PZ.z1, PZ.x2, P.z1, 0, 'pooltile', 1.5);
  slab(PZ.x1, P.z2, PZ.x2, PZ.z2, 0, 'pooltile', 1.5);
  slab(PZ.x1, P.z1, P.x1, P.z2, 0, 'pooltile', 1.5);
  slab(P.x2, P.z1, PZ.x2, P.z2, 0, 'pooltile', 1.5);
  for (const r of L.ROOMS) {
    const parent = parentFor(r.cx, { gate: r.wing });
    slab(r.x1, r.z1, r.x2, r.z2, 0, r.pres ? 'wood' : 'roomcarpet', r.pres ? 3 : 2, parent);
    const b = r.bathBox;
    slab(b[0], b[1], b[2], b[3], 0.004, r.pres ? 'marble' : 'tile', r.pres ? 2.4 : 1.0, parent);
  }
  // pool basin
  const poolWall = S('poolwall');
  slab(P.x1, P.z1, P.x2, P.z2, P.floorY, 'poolwall', 1.5);
  slabBox(P.x1 - 0.05, P.z1, P.x1 + 0.05, P.z2, P.floorY, 0, poolWall, [1.5]);
  slabBox(P.x2 - 0.05, P.z1, P.x2 + 0.05, P.z2, P.floorY, 0, poolWall, [1.5]);
  slabBox(P.x1, P.z1 - 0.05, P.x2, P.z1 + 0.05, P.floorY, 0, poolWall, [1.5]);
  slabBox(P.x1, P.z2 - 0.05, P.x2, P.z2 + 0.05, P.floorY, 0, poolWall, [1.5]);
  const coping = mat('#e9e4d8');
  slabBox(P.x1 - 0.35, P.z1 - 0.35, P.x2 + 0.35, P.z1, 0, 0.04, coping);
  slabBox(P.x1 - 0.35, P.z2, P.x2 + 0.35, P.z2 + 0.35, 0, 0.04, coping);
  slabBox(P.x1 - 0.35, P.z1, P.x1, P.z2, 0, 0.04, coping);
  slabBox(P.x2, P.z1, P.x2 + 0.35, P.z2, 0, 0.04, coping);
  const waterMat = new THREE.MeshPhongMaterial({ color: '#3fb3d1', transparent: true, opacity: 0.64, emissive: '#0d4a5c', emissiveIntensity: 0.4, shininess: 90, specular: '#88aacc', depthWrite: false });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(P.x2 - P.x1, P.z2 - P.z1, 1, 1), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set((P.x1 + P.x2) / 2, P.waterY, (P.z1 + P.z2) / 2);
  scene.add(water);

  // outside: deep snow around the main block (in four pieces so it never covers the sunken pool)
  const B = L.BUILDING;
  slab(-260, -260, 260, B.z1, -0.02, 'snow', 7);
  slab(-260, B.z2, 260, 260, -0.02, 'snow', 7);
  slab(-260, B.z1, B.x1, B.z2, -0.02, 'snow', 7);
  slab(B.x2, B.z1, 260, B.z2, -0.02, 'snow', 7);
  slab(B.x1 - 1, B.z2, B.x2 + 1, L.ROAD.z1, 0.02, 'sidewalk', 2);
  slab(-110, L.ROAD.z1, 110, L.ROAD.z2, 0.01, 'asphalt', 6);
  slab(L.LOT.x1, L.LOT.z1, L.LOT.x2, L.LOT.z2, 0.012, 'asphalt', 6);
  const paint = mat('#e8e4d8');
  const paintY = 0.03;
  for (let i = 0; i <= 16; i++) {
    const x = -28 + 3.5 * i;
    slabBox(x - 0.06, 19.3, x + 0.06, 24.3, 0, paintY, paint);
    slabBox(x - 0.06, 29.7, x + 0.06, 34.7, 0, paintY, paint);
  }
  for (let x = -100; x < 100; x += 6) slabBox(x, L.ROAD_Z + 1.4, x + 3, L.ROAD_Z + 1.55, 0, paintY, mat('#e9c46a'));
  for (const d of L.DROPS) slabBox(d.x - 2.6, d.z - 1.2, d.x + 2.6, d.z - 1.08, 0, paintY, paint);
  { // painted VALET text at the curb
    const { texture, aspect } = labelTexture('VALET DROP-OFF', { color: '#e8e4d8', bg: null, font: 'bold 64px Arial', h: 90 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2 * aspect, 1.2), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.035, 15.6);
    scene.add(m);
  }
  // Painted lot markings only get drawn while you're outside.
  const lotMarks = new THREE.Group();
  scene.add(lotMarks);
  for (const s of L.PARKING) {
    const { texture } = labelTexture(s.id, { color: '#e8e4d8', bg: null, font: 'bold 60px Arial', h: 80 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.7), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = s.ry === 0 ? 0 : Math.PI;
    m.position.set(s.x, 0.034, s.z + (s.ry === 0 ? 1.8 : -1.8));
    lotMarks.add(m);
  }

  // ---------- walls ----------
  // Each wall is split where the zones beside it change, and each half gets the wallpaper
  // of the room it faces (e.g. the north facade is stone and timber outside, room wallpaper inside).
  const XB = new Set(), ZB = new Set();
  for (const z of L.ZONES) { XB.add(z.x1); XB.add(z.x2); ZB.add(z.z1); ZB.add(z.z2); }
  for (const r of L.ROOMS) { XB.add(r.x1); XB.add(r.x2); ZB.add(r.z1); ZB.add(r.z2); const b = r.bathBox; XB.add(b[0]); XB.add(b[2]); ZB.add(b[1]); ZB.add(b[3]); }
  const xs = [...XB].sort((a, b) => a - b), zs = [...ZB].sort((a, b) => a - b);
  const cuts = (a, b, list) => [a, ...list.filter(v => v > a + 0.05 && v < b - 0.05), b];
  const wallStyle = (x, z) => S(WALL_STYLE[wallZoneStyle(x, z)] || 'wallPlain');
  for (const w of L.WALLS) {
    const parent = parentFor((w.x1 + w.x2) / 2, w);
    const alongX = w.x2 - w.x1 >= w.z2 - w.z1;
    if (alongX) {
      const cz = (w.z1 + w.z2) / 2;
      const c = cuts(w.x1, w.x2, xs);
      for (let i = 0; i < c.length - 1; i++) {
        const mx = (c[i] + c[i + 1]) / 2;
        slabBox(c[i], w.z1, c[i + 1], cz, 0, w.h, wallStyle(mx, w.z1 - 0.4), [2, L.WALL_H], parent);
        slabBox(c[i], cz, c[i + 1], w.z2, 0, w.h, wallStyle(mx, w.z2 + 0.4), [2, L.WALL_H], parent);
      }
    } else {
      const cx = (w.x1 + w.x2) / 2;
      const c = cuts(w.z1, w.z2, zs);
      for (let i = 0; i < c.length - 1; i++) {
        const mz = (c[i] + c[i + 1]) / 2;
        slabBox(w.x1, c[i], cx, c[i + 1], 0, w.h, wallStyle(w.x1 - 0.4, mz), [2, L.WALL_H], parent);
        slabBox(cx, c[i], w.x2, c[i + 1], 0, w.h, wallStyle(w.x2 + 0.4, mz), [2, L.WALL_H], parent);
      }
    }
  }
  const trim = mat('#3a2416');
  for (const l of L.LINTELS) slabBox(l.x1, l.z1, l.x2, l.z2, L.DOOR_H, L.WALL_H, trim, null, parentFor((l.x1 + l.x2) / 2, l));

  // ceilings, roof decks and parapets for every block
  const deck = mat('#3a3633'), parapet = mat('#4a3b35'), eave = mat('#2d1f17');
  const ceiling = (r, parent) => {
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(r.x2 - r.x1, r.z2 - r.z1), S('ceiling'));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set((r.x1 + r.x2) / 2, L.WALL_H - 0.01, (r.z1 + r.z2) / 2);
    ceil.userData.worldUV = [2.4];
    parent.add(ceil);
  };
  for (const b of L.BLOCKS) {
    const parent = parentFor((b.x1 + b.x2) / 2, { gate: b.wing });
    // With a storey above, the staircase goes up through this ceiling; until it's built it's capped.
    const above = L.FLOORS[b.floor + 1];
    const holes = above ? stairHoles(b.floor) : [];
    for (const r of cutRect(b, holes)) ceiling(r, parent);
    for (const r of cutRect({ x1: b.x1 - 0.3, z1: b.z1 - 0.3, x2: b.x2 + 0.3, z2: b.z2 + 0.3 }, holes)) slabBox(r.x1, r.z1, r.x2, r.z2, L.WALL_H, L.WALL_H + 0.35, deck, null, parent);
    for (const h of holes) {
      const cap = parentFor(h.x1, { gate: b.wing, off: above.flag });
      ceiling(h, cap);
      slabBox(h.x1, h.z1, h.x2, h.z2, L.WALL_H, L.WALL_H + 0.35, deck, null, cap);
    }
    // a timber band around the outside, between storeys
    for (const [x1, z1, x2, z2] of [[b.x1 - 0.42, b.z1 - 0.42, b.x2 + 0.42, b.z1 - 0.15], [b.x1 - 0.42, b.z2 + 0.15, b.x2 + 0.42, b.z2 + 0.42], [b.x1 - 0.42, b.z1, b.x1 - 0.15, b.z2], [b.x2 + 0.15, b.z1, b.x2 + 0.42, b.z2]]) {
      slabBox(x1, z1, x2, z2, L.WALL_H - 0.12, L.WALL_H + 0.02, eave, null, parent);
    }
  }
  // the low front of the building (lobby, dining, pool) keeps a flat snowy roof
  const roofSnow = mat('#eef3f8');
  for (const [x1, z1, x2, z2] of [[B.x1 - 0.35, B.z2 + 0.1, B.x2 + 0.35, B.z2 + 0.35], [B.x1 - 0.35, -11, B.x1 - 0.1, B.z2], [B.x2 + 0.1, -11, B.x2 + 0.35, B.z2]]) slabBox(x1, z1, x2, z2, L.WALL_H, L.WALL_H + 0.8, parapet);
  slabBox(B.x1 - 0.1, -11, B.x2 + 0.1, B.z2 + 0.1, L.WALL_H + 0.35, L.WALL_H + 0.5, roofSnow);
  for (const [x, z] of [[-20, -4], [-14, 3], [16, -5], [22, 2], [3, -6]]) slabBox(x - 0.5, z - 0.5, x + 0.5, z + 0.5, L.WALL_H + 0.5, L.WALL_H + 1.2, mat('#6b6f73'));
  // The pitched, snow-covered roof (with chimneys) sits on top of whichever storey is highest.
  const towerTops = L.FLOORS.map(F => {
    const g = buildTowerRoof(F.f);
    scene.add(g);
    return g;
  });

  // ceiling light panels
  for (const z of L.ZONES) {
    if (z.id === 'lobby' || z.id === 'dining' || z.id === 'lounge') continue;
    const lamp = lampFor(z.wing), parent = parentFor((z.x1 + z.x2) / 2, { gate: z.wing });
    const holes = stairHoles(L.floorOf(z.x1 + 1));
    for (let x = z.x1 + 3; x < z.x2 - 1; x += 6) for (let zz = z.z1 + 2; zz < z.z2 - 1; zz += 6) {
      const r = { x1: x - 0.4, z1: zz - 0.4, x2: x + 0.4, z2: zz + 0.4 };
      if (holes.some(h => overlaps(r, h))) continue;
      slabBox(r.x1, r.z1, r.x2, r.z2, L.WALL_H - 0.05, L.WALL_H - 0.02, lamp, null, parent);
    }
  }
  for (const r of L.ROOMS) {
    const lamp = lampFor(r.wing), parent = parentFor(r.cx, { gate: r.wing });
    const cz = (r.z1 + r.z2) / 2;
    if (r.pres) for (const [x, z] of [[22.5, -26.5], [27.5, -26.5], [23, -13.5], [28, -13.5]]) slabBox(r.x1 - 20 + x - 0.4, z - 0.4, r.x1 - 20 + x + 0.4, z + 0.4, L.WALL_H - 0.05, L.WALL_H - 0.02, lamp, null, parent);
    else slabBox(r.cx - 0.35, cz - 0.35, r.cx + 0.35, cz + 0.35, L.WALL_H - 0.05, L.WALL_H - 0.02, lamp, null, parent);
  }

  // exterior windows (decorative), with a little snow on every sill
  for (const w of L.WINDOWS) {
    const g = new THREE.Group();
    box(g, w.w + 0.22, 1.56, 0.08, '#2b2420', 0, 1.65, 0);
    box(g, w.w, 1.32, 0.02, facadeFor(w.wing), 0, 1.65, 0.05);
    box(g, 0.05, 1.32, 0.04, '#2b2420', 0, 1.65, 0.06);
    box(g, w.w + 0.3, 0.07, 0.2, '#d8cfbd', 0, 0.86, 0.1);
    box(g, w.w + 0.24, 0.06, 0.18, roofSnow, 0, 0.92, 0.11);
    if (w.axis === 'x') { g.position.set(w.x, 0, w.z + w.side * (L.WALL_T / 2 + 0.01)); g.rotation.y = w.side > 0 ? 0 : Math.PI; }
    else { g.position.set(w.x + w.side * (L.WALL_T / 2 + 0.01), 0, w.z); g.rotation.y = w.side > 0 ? Math.PI / 2 : -Math.PI / 2; }
    parentFor(w.x, { gate: w.wing }).add(g);
  }

  // ---------- props ----------
  const dyn = { windows: {}, thermos: {}, burners: Array(10).fill(null), board: null, vacancy: null, letters: [], tickets: null, plates: null };
  for (const f of L.FURN) {
    const g = placeProp(f, parentFor(f.x, f));
    if (!g) continue;
    if (f.kind === 'window') dyn.windows[f.room] = g.userData.curtains;
    if (f.kind === 'thermostat') dyn.thermos[f.room] = g.userData.screen;
    if (f.kind === 'stove') g.userData.burners.forEach((b, i) => (dyn.burners[i] = b));
    if (f.kind === 'cooktop') g.userData.burners.forEach((b, i) => (dyn.burners[4 + i] = b));
    if (f.kind === 'toaster') dyn.burners[8] = g.userData.burners[0];
    if (f.kind === 'waffleIron') dyn.burners[9] = g.userData.burners[0];
    if (f.kind === 'ticketRail') dyn.tickets = g.userData.board;
    if (f.kind === 'plateRack') dyn.plates = g.userData.plates;
    if (f.kind === 'statusBoard') dyn.board = g.userData.board;
    if (f.kind === 'vacancySign') dyn.vacancy = g.userData.neon;
    if (f.kind === 'tower') dyn.letters = g.userData.letters;
  }
  for (const s of L.SIGNS) {
    const { texture, aspect } = labelTexture(s.text, { color: s.color, bg: s.bg, font: '600 44px Georgia, serif' });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w || s.h * aspect, s.h), new THREE.MeshBasicMaterial({ map: texture }));
    m.position.set(s.x, s.y, s.z);
    m.rotation.y = s.ry;
    m.userData.keep = true;
    parentFor(s.x, s).add(m);
  }

  // ---------- doors ----------
  const doors = [];
  const doorWood = mat('#4a2c1a'), doorMetal = mat('#6b7378'), presWood = mat('#2a1a10');
  const dndCard = mat('#b3001b'), dndLit = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a2a').multiplyScalar(2.4) });
  const dndText = labelTexture('DO NOT DISTURB', { color: '#ffffff', bg: '#b3001b', font: 'bold 34px Arial', h: 56 });
  const dndGlow = new THREE.SpriteMaterial({ map: glowTexture('#ff2a2a'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const addLeaf = (d, w, x, z, rotY, openDir, plate) => {
    const pivot = new THREE.Group();
    const leafW = w - 0.06;
    const leaf = new THREE.Group();
    box(leaf, leafW, L.DOOR_H - 0.04, 0.06, d.room === 'PRES' ? presWood : d.room ? doorWood : doorMetal, leafW / 2, (L.DOOR_H - 0.04) / 2, 0);
    if (d.room) for (const y of [0.55, 1.55]) box(leaf, leafW - 0.24, 0.62, 0.075, d.room === 'PRES' ? presWood : '#41261a', leafW / 2, y, 0); // raised panels
    box(leaf, 0.05, 0.05, 0.14, '#b08d3c', leafW - 0.12, 1.05, 0);
    if (d.room === 'PRES') box(leaf, leafW - 0.2, 0.05, 0.08, '#d4a017', leafW / 2, 1.9, 0);
    let dnd = null;
    if (plate) {
      const side = d.s ? -d.s : 1;
      const text = d.room === 'PRES' ? 'PRESIDENTIAL SUITE' : d.room;
      const { texture, aspect } = labelTexture(text, { color: '#e8d29a', bg: '#2a1a10', font: 'bold 52px Georgia, serif', h: 70, border: '#b08d3c' });
      const pw = Math.min(leafW - 0.1, 0.26 * aspect);
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(pw, pw / aspect), new THREE.MeshBasicMaterial({ map: texture }));
      pm.position.set(leafW / 2, 1.65, 0.045 * side);
      if (side < 0) pm.rotation.y = Math.PI;
      leaf.add(pm);
      // a DO NOT DISTURB card hanging from the handle on the hallway side
      dnd = new THREE.Group();
      box(dnd, 0.13, 0.3, 0.008, dndCard, 0, 0, 0);
      box(dnd, 0.03, 0.08, 0.01, dndCard, 0, 0.18, 0);
      const words = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.27 / dndText.aspect), new THREE.MeshBasicMaterial({ map: dndText.texture }));
      words.rotation.z = Math.PI / 2;
      words.position.z = 0.006;
      dnd.add(words);
      dnd.position.set(leafW - 0.12, 0.84, 0.075 * side);
      if (side < 0) dnd.rotation.y = Math.PI;
      dnd.visible = false;
      leaf.add(dnd);
    }
    compactGroup(leaf); // wood, handle and trim become one mesh; the labels stay separate
    pivot.add(leaf);
    pivot.position.set(x, 0, z);
    pivot.rotation.y = rotY;
    floorDyn[L.floorOf(d.x)].add(pivot);
    // A little privacy light on the wall beside the door, red while the sign is up: you can see it
    // from the far end of the hallway.
    let lamp = null;
    if (plate) {
      const off = d.w / 2 + 0.2, f = L.floorOf(d.x);
      const lx = d.axis === 'x' ? d.x + off : d.x - 0.17, lz = d.axis === 'x' ? d.z - (d.s || 1) * 0.17 : d.z - off;
      const fixture = new THREE.Group();
      box(fixture, 0.16, 0.12, 0.1, '#2b2420', 0, 0, 0);
      lamp = new THREE.Group();
      lamp.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.11), dndLit));
      const halo = new THREE.Sprite(dndGlow);
      halo.scale.set(0.55, 0.55, 1);
      lamp.add(halo);
      lamp.visible = false;
      fixture.add(lamp);
      fixture.position.set(lx, 2.02, lz); // floorDyn groups take layout coordinates
      floorDyn[f].add(fixture);
    }
    doors.push({ pivot, base: rotY, openDir, x: d.x, z: d.z, open: 0, room: d.room, ri: d.room ? L.ROOMS.findIndex(r => r.id === d.room) : -1, dnd, lamp, wing: d.wing || null });
  };
  for (const d of L.DOORS) {
    const openDir = d.room && d.s ? (d.s > 0 ? -1 : 1) : 1;
    if (d.double) { // two leaves hinged at either side, swinging into the suite
      const half = d.w / 2;
      if (d.axis === 'z') {
        addLeaf(d, half, d.x, d.z - d.w / 2 + 0.03, -Math.PI / 2, -1, true);
        addLeaf(d, half, d.x, d.z + d.w / 2 - 0.03, Math.PI / 2, 1, false);
      } else {
        addLeaf(d, half, d.x - d.w / 2 + 0.03, d.z, 0, openDir, true);
        addLeaf(d, half, d.x + d.w / 2 - 0.03, d.z, Math.PI, -openDir, false);
      }
      continue;
    }
    if (d.axis === 'x') addLeaf(d, d.w, d.x - d.w / 2 + 0.03, d.z, 0, openDir, !!d.room);
    else addLeaf(d, d.w, d.x, d.z - d.w / 2 + 0.03, -Math.PI / 2, openDir, !!d.room);
  }
  const glassMat = new THREE.MeshPhongMaterial({ color: '#a8d8ea', transparent: true, opacity: 0.3, shininess: 120, specular: '#ffffff', depthWrite: false });
  const slides = [-1, 1].map(s => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.3, 0.05), glassMat);
    m.position.set(1.25 * s, 1.15, B.z2);
    scene.add(m);
    return { m, s };
  });

  // merge everything, then lift each upper floor into place
  batch.absorb(staticRoot);
  batch.build(scene);
  const flagGroups = [];
  for (const g of groups.values()) {
    const b = new Batch();
    b.absorb(g.root);
    b.build(g.root);
    scene.add(g.root);
    floorOffset(g.root, g.f);
    flagGroups.push({ group: g.root, cond: g.cond, f: g.f });
  }

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight('#c9d8ff', '#e3e9f2', 1.0); // snow bounces light back up
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1e0', 1.3);
  sun.position.set(-60, 45, -40);
  scene.add(sun);
  // Interior lights hang a little below the ceiling so the tiles right above them don't blow out.
  const interior = [[0, 0.5], [6, -8.4], [-14, -20], [14, -20], [-20.5, 2.5], [-20, -7], [20, -2], [-25, -20]].map(([x, z]) => {
    const l = new THREE.PointLight('#ffd49a', INTERIOR, 20, 1.2);
    l.position.set(x, 2.3, z);
    scene.add(l);
    return l;
  });
  // Lights for the upper storeys join the scene only once they're built, so a small hotel doesn't
  // pay for lighting it doesn't have (adding one recompiles shaders once, between shifts).
  const wingLights = [['floor2', 0, 1, '#ffd49a'], ['floor3', 0, 2, '#ffd49a'], ['pres', 25, 1, '#ffd49a'], ['floor3', 25, 2, '#ffb36b']].map(([wing, x, f, color]) => {
    const l = new THREE.PointLight(color, 0, 26, 1.2);
    l.position.set(x, f * L.FLOOR_H + 2.3, -20);
    return { l, wing, added: false };
  });
  const exterior = [[0, 3.5, 12.5], [0, 6.5, 27]].map(([x, y, z]) => {
    const l = new THREE.PointLight('#ffe7b8', 30, 34, 1.3);
    l.position.set(x, y, z);
    scene.add(l);
    return l;
  });

  // ---------- the mountains, the sky and the snow ----------
  const mountains = buildMountains();
  scene.add(mountains);
  const stars = (() => {
    const pos = [];
    for (let i = 0; i < 900; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * 0.42 * Math.PI;
      pos.push(Math.cos(th) * Math.sin(ph) * 500, Math.cos(ph) * 500, Math.sin(th) * Math.sin(ph) * 500);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
    scene.add(p);
    return p;
  })();
  const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12), new THREE.MeshBasicMaterial({ color: '#f4f1de', fog: false }));
  moon.position.set(140, 190, -300);
  scene.add(moon);
  const snow = buildSnowfall();
  scene.add(snow.points);
  scene.fog = new THREE.Fog('#d3dce5', 18, 150);
  scene.background = new THREE.Color('#b7c6d4');

  const kitchen = buildKitchenDyn(scene);
  const ws = new WorldState({ scene, doors, slides, dyn, water, waterMat, hemi, sun, interior, wingLights, exterior, stars, moon, flagGroups, wingMats, lotMarks, mountains, snow, towerTops, floorDyn, kitchen });
  ws.updateDecor(null);
  return ws;
}

// The kitchen's moving parts: tubs of dirty dishes stacked in the sink, plates on the pass, stove fires.
function buildKitchenDyn(scene) {
  const sink = L.STATIONS.sink;
  const tubs = [];
  for (let i = 0; i < 6; i++) {
    const t = buildItem('dishes');
    compactGroup(t);
    t.position.set(sink.x + (i % 2 ? 0.235 : -0.235), 0.86 + Math.floor(i / 2) * 0.19, sink.z + 0.02);
    t.rotation.y = Math.PI / 2 + (i % 3) * 0.1;
    t.scale.setScalar(0.9);
    t.visible = false;
    scene.add(t);
    tubs.push(t);
  }
  return {
    tubs, pass: [null, null, null, null], passKeys: ['', '', '', ''], fires: Array(8).fill(null),
    // Flame colors go past 1 so they bloom like the lamps do.
    flameMat: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5a14').multiplyScalar(2.2), transparent: true, opacity: 0.85, depthWrite: false }),
    coreMat: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd34a').multiplyScalar(2.6) }),
    smokeMat: new THREE.MeshLambertMaterial({ color: '#4a4744', transparent: true, opacity: 0.22, depthWrite: false }),
  };
}

const FLAME = new THREE.ConeGeometry(0.06, 0.3, 6);
const PUFF = new THREE.IcosahedronGeometry(0.16, 1);
function buildFire(K) {
  const g = new THREE.Group();
  const flames = [];
  for (let i = 0; i < 7; i++) {
    const inner = i >= 5;
    const m = new THREE.Mesh(FLAME, inner ? K.coreMat : K.flameMat);
    const a = i * 2.4, r = inner ? 0.03 : 0.08 + (i % 2) * 0.04;
    m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    m.rotation.set(Math.sin(a) * 0.25, 0, Math.cos(a) * 0.25);
    m.userData.h = inner ? 0.6 : 0.8 + (i % 3) * 0.25;
    g.add(m);
    flames.push(m);
  }
  const puffs = [];
  for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(PUFF, K.smokeMat); g.add(m); puffs.push({ m, t: i / 7 }); }
  g.userData = { flames, puffs };
  return g;
}

// A pitched shingle roof with snow on it, gable ends, chimneys and icicles, on top of storey f.
function buildTowerRoof(f) {
  const g = new THREE.Group();
  const t = L.TOWER, y0 = f * L.FLOOR_H + L.WALL_H + 0.35;
  const x1 = t.x1 - 0.8, x2 = t.x2 + 0.8, z1 = t.z1 - 1.0, z2 = t.z2 + 1.0, zc = (z1 + z2) / 2, half = (z2 - z1) / 2;
  const slope = Math.atan2(ROOF_RISE, half), len = Math.hypot(half, ROOF_RISE);
  const shingles = mat('#3b2a22'), snowM = mat('#eef3f8'), wood = mat('#4a3020'), stone = mat('#6d6a66');
  for (const s of [-1, 1]) {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, 0.3, len), shingles);
    roof.position.set((x1 + x2) / 2, y0 + ROOF_RISE / 2, zc + s * half / 2);
    roof.rotation.x = s * slope;
    g.add(roof);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1 - 0.2, 0.22, len * 0.9), snowM);
    cap.position.set((x1 + x2) / 2, y0 + ROOF_RISE / 2 + 0.2 * Math.cos(slope), zc + s * (half / 2 + 0.03));
    cap.rotation.x = s * slope;
    g.add(cap);
  }
  // gable ends: triangles of dark timber
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -half + 0.6, 0, ROOF_RISE - 0.2, 0, 0, 0, half - 0.6], 3));
  tri.computeVertexNormals();
  for (const x of [t.x1 - 0.1, t.x2 + 0.1]) {
    const m = new THREE.Mesh(tri, new THREE.MeshLambertMaterial({ color: '#4a3020', side: THREE.DoubleSide }));
    m.position.set(x, y0, zc);
    g.add(m);
  }
  box(g, x2 - x1 + 0.1, 0.3, 0.3, wood, (x1 + x2) / 2, y0 + ROOF_RISE + 0.08, zc);
  box(g, x2 - x1 + 0.1, 0.18, 0.34, snowM, (x1 + x2) / 2, y0 + ROOF_RISE + 0.28, zc);
  for (const x of [-21, 21]) {
    box(g, 1.3, 3.2, 1.3, stone, x, y0 + ROOF_RISE + 0.6, zc - 1.6);
    box(g, 1.5, 0.25, 1.5, mat('#4f4c49'), x, y0 + ROOF_RISE + 2.25, zc - 1.6);
    box(g, 1.4, 0.18, 1.4, snowM, x, y0 + ROOF_RISE + 2.45, zc - 1.6);
  }
  // icicles along the eaves
  const ice = mat('#cfe6f5', { emissive: '#203040', emissiveIntensity: 0.2 });
  const rnd = mulberry32(17 + f);
  for (const z of [z1 + 0.05, z2 - 0.05]) for (let x = x1 + 0.6; x < x2 - 0.4; x += 0.7 + rnd() * 0.9) {
    const h = 0.25 + rnd() * 0.55;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, h, 5), ice);
    c.position.set(x, y0 - 0.05 - h / 2, z);
    c.rotation.x = Math.PI;
    g.add(c);
  }
  const b = new Batch();
  b.absorb(g);
  b.build(g);
  return g;
}

// A ring of jagged, snow-capped peaks far beyond the fog.
function buildMountains() {
  const rnd = mulberry32(4242);
  const geos = [];
  const rock = new THREE.Color('#5d6878'), dark = new THREE.Color('#3d4654'), snow = new THREE.Color('#f1f5f9');
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + rnd() * 0.12;
    const d = 330 + rnd() * 120, h = 90 + rnd() * 130, r = 80 + rnd() * 70;
    const g = new THREE.ConeGeometry(r, h, 9, 4).toNonIndexed();
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k), t = (y + h / 2) / h;
      if (t > 0.02 && t < 0.98) { p.setX(k, p.getX(k) * (0.85 + rnd() * 0.3)); p.setZ(k, p.getZ(k) * (0.85 + rnd() * 0.3)); p.setY(k, y + (rnd() - 0.5) * h * 0.08); }
      const c = t > 0.58 + rnd() * 0.12 ? snow : t > 0.3 ? rock : dark;
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    g.computeVertexNormals();
    g.translate(Math.cos(a) * d, h / 2 - 12, Math.sin(a) * d);
    geos.push(g);
  }
  const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, flatShading: true }));
  m.userData.mat = m.material;
  return m;
}

// Snowflakes in a box that follows the camera; flakes inside the building are tucked away.
function buildSnowfall() {
  const N = 2400;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 60; pos[i * 3 + 1] = Math.random() * 20; pos[i * 3 + 2] = (Math.random() - 0.5) * 60; seed[i] = Math.random(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = grd;
  x.fillRect(0, 0, 32, 32);
  const points = new THREE.Points(g, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), size: 0.14, transparent: true, depthWrite: false, opacity: 0.9 }));
  points.frustumCulled = false;
  return { points, pos, seed, N, local: new Float32Array(N * 3).map((_, i) => pos[i]) };
}

// ---------- dynamic world ----------
const C = (h) => new THREE.Color(h);
const SKY = { day: C('#b7c6d4'), dusk: C('#7d6f96'), night: C('#04060b'), dawn: C('#c4a3a6') };
const FOG = { day: C('#d3dce5'), dusk: C('#5d5875'), night: C('#070a12'), dawn: C('#a8949c') };

function skyMix(H) {
  // returns {k: blend daylight 0..1, sky Color, fog Color}
  const out = new THREE.Color(), fog = new THREE.Color();
  let k;
  if (H < 19) { k = 1; out.copy(SKY.day); fog.copy(FOG.day); }
  else if (H < 20.3) { const t = (H - 19) / 1.3; k = 1 - t * 0.6; out.lerpColors(SKY.day, SKY.dusk, t); fog.lerpColors(FOG.day, FOG.dusk, t); }
  else if (H < 21.5) { const t = (H - 20.3) / 1.2; k = 0.4 - t * 0.4; out.lerpColors(SKY.dusk, SKY.night, t); fog.lerpColors(FOG.dusk, FOG.night, t); }
  else if (H < 29.4) { k = 0; out.copy(SKY.night); fog.copy(FOG.night); }
  else if (H < 30.4) { const t = (H - 29.4); k = t * 0.4; out.lerpColors(SKY.night, SKY.dawn, t); fog.lerpColors(FOG.night, FOG.dawn, t); }
  else if (H < 31.6) { const t = (H - 30.4) / 1.2; k = 0.4 + t * 0.6; out.lerpColors(SKY.dawn, SKY.day, t); fog.lerpColors(FOG.dawn, FOG.day, t); }
  else { k = 1; out.copy(SKY.day); fog.copy(FOG.day); }
  return { k, sky: out, fog };
}

// Is a world-space point inside the building (where snow can't fall)?
function indoors(x, y, z, roofTop) {
  if (x > -30.6 && x < 30.6 && z > -29.6 && z < 8.6 && y < (z < -10.4 ? roofTop : 4.2)) return true;
  return x > -12.9 && x < 12.9 && z > 8 && z < 17.5 && y < 4.2; // under the canopy
}

class WorldState {
  constructor(o) {
    Object.assign(this, o);
    this.flickerT = 0;
    this.boardKey = '';
    this.stoveItems = Array(10).fill(null);
    this.stoveKeys = Array(10).fill('');
    this.coldMat = new THREE.MeshLambertMaterial({ color: '#7fd1ff', emissive: '#3fa8ff', emissiveIntensity: 1.4 });
    this.time = 0;
    this.decor = {};
    this.wind = 0;
    this.inside = 0;
    this.ticketKey = null;
  }

  flicker(d) { this.flickerT = Math.max(this.flickerT, d); }

  // Room furniture depends on each room's tier and on the minibar/bedding upgrades. Rooms are
  // merged per storey and a storey is rebuilt when it changes.
  updateDecor(snap) {
    const tiers = snap?.ht?.t;
    const extras = { minibar: !!L.FLAGS.minibar, bedding: !!L.FLAGS.bedding };
    const blocks = {};
    L.ROOMS.forEach((r, i) => { if (!r.pres) (blocks[r.wing || 'main'] ||= []).push([r, TIER_CODE[tiers?.[i]] || 'basic']); });
    for (const [name, rooms] of Object.entries(blocks)) {
      const key = rooms.map(([, t]) => t[0]).join('') + (extras.minibar ? 'M' : '') + (extras.bedding ? 'B' : '');
      const cur = this.decor[name];
      if (cur && cur.key === key) continue;
      if (cur) {
        this.scene.remove(cur.group);
        cur.group.traverse(o => { if (o.isMesh && o.userData.merged) o.geometry.dispose(); });
      }
      const group = new THREE.Group();
      for (const [r, tier] of rooms) for (const f of L.roomDecor(r, tier, extras)) placeProp(f, group);
      const b = new Batch();
      b.absorb(group);
      b.build(group);
      floorOffset(group, L.floorOf(rooms[0][0].cx));
      this.scene.add(group);
      this.decor[name] = { key, group, wing: name === 'main' ? null : name };
    }
  }

  // positions: {x,z} in layout space for everyone who can open doors. eye: the camera in layout space
  // (for skipping doors and room fixtures too far away to matter). cam: the camera in world space.
  update(snap, dt, positions, eye, cam) {
    this.time += dt;
    const t = this.time;
    const inShift = snap && snap.ph === 'shift';
    const H = inShift ? snap.H : 15.5;
    const power = !snap || snap.pw;
    const hz = inShift ? snap.hz || 0 : 0;

    // upgrade-dependent parts of the building
    for (const fg of this.flagGroups) fg.group.visible = L.isActive(fg.cond) && L.floorBuilt(fg.f);
    for (let f = 1; f < this.floorDyn.length; f++) this.floorDyn[f].visible = L.floorBuilt(f);
    const top = L.floorBuilt(2) ? 2 : L.floorBuilt(1) ? 1 : 0;
    this.towerTops.forEach((g, f) => (g.visible = f === top));
    if (snap) this.updateDecor(snap);
    for (const d of Object.values(this.decor)) d.group.visible = !d.wing || !!L.FLAGS[d.wing];

    // doors
    for (const d of this.doors) {
      d.pivot.visible = (!d.wing || !!L.FLAGS[d.wing]) && (!eye || (eye.x - d.x) ** 2 + (eye.z - d.z) ** 2 < 2500);
      if (!d.pivot.visible) continue;
      let near = false;
      for (const p of positions) if ((p.x - d.x) ** 2 + (p.z - d.z) ** 2 < (p.r2 || 3.2)) { near = true; break; }
      d.open += ((near ? 1 : 0) - d.open) * Math.min(1, dt * 6);
      d.pivot.rotation.y = d.base + d.openDir * d.open * 1.45;
    }
    let slideOpen = 0;
    for (const p of positions) if ((p.x) ** 2 + (p.z - L.BUILDING.z2) ** 2 < 14) slideOpen = 1;
    for (const s of this.slides) s.m.position.x += ((1.25 + slideOpen * 2.1) * s.s - s.m.position.x) * Math.min(1, dt * 5);

    // sky & lights
    const sm = skyMix(H);
    this.scene.background.copy(sm.sky);
    if (!power) this.scene.background.multiplyScalar(0.8);
    this.scene.fog.color.copy(sm.fog);
    this.scene.fog.near = lerp(10, 18, sm.k);
    this.scene.fog.far = lerp(110, 150, sm.k) - hz * 25;
    this.stars.material.opacity = (1 - sm.k) * 0.7 * (1 - Math.min(0.8, hz * 0.6));
    this.moon.visible = sm.k < 0.5;
    // Indoors, daylight and the snow-bright sky only come in through the windows. Nothing casts
    // shadows, so dim them while the camera is inside (it reads like your eyes adjusting).
    if (cam) {
      const inside = indoors(cam.x, cam.y, cam.z, top * L.FLOOR_H + L.WALL_H + ROOF_RISE) ? 1 : 0;
      this.inside += (inside - this.inside) * Math.min(1, dt * 2.5);
    }
    this.sun.intensity = (0.12 + sm.k * 1.25) * lerp(1, 0.3, this.inside);
    this.sun.color.set(sm.k > 0.5 ? '#fff1e0' : '#8fa6ff');
    this.hemi.intensity = ((power ? 0.38 : 0.14) + sm.k * 0.75) * lerp(1, 0.5, this.inside);
    this.mountains.material.color.setScalar(0.1 + sm.k * 0.9);

    // Flicker strobes the lights; with "reduce flashing" on it just dims them smoothly.
    let flick = 1;
    if (this.flickerT > 0) {
      this.flickerT -= dt;
      flick = this.calm ? 0.35 + Math.sin(t * 2) * 0.1 : Math.random() < 0.45 ? 0.05 : 0.6 + Math.random() * 0.5;
    } else if (!this.calm && hz > 0.4 && Math.sin(t * 7.3) * Math.sin(t * 2.1) > 0.985) flick = 0.3;
    // After midnight the hotel turns its lights down until dawn.
    const late = clamp((H - 24) / 2, 0, 1) * (1 - clamp((H - 30) / 1.5, 0, 1));
    const inten = (power ? flick : 0) * (1 - 0.3 * late);
    for (const l of this.interior) l.intensity = INTERIOR * inten;
    for (const w of this.wingLights) {
      const built = !!L.FLAGS[w.wing];
      if (built !== w.added) { w.added = built; if (built) this.scene.add(w.l); else this.scene.remove(w.l); }
      w.l.intensity = INTERIOR * inten;
    }
    LIGHTS.lamp.emissiveIntensity = LAMP_GLOW * inten;
    LIGHTS.vending.emissiveIntensity = power ? 1.1 : 0;
    LIGHTS.screen.emissiveIntensity = power ? 1.2 : 0.05;
    LIGHTS.arcade.emissiveIntensity = power ? 1.3 + Math.sin(t * 5) * 0.3 : 0;
    LIGHTS.uv.emissiveIntensity = power ? 1.8 : 0;
    LIGHTS.heat.emissiveIntensity = power ? 1.4 : 0;
    LIGHTS.fire.emissiveIntensity = 1.6 + Math.sin(t * 9) * 0.25 + Math.sin(t * 23) * 0.15; // the fire burns through blackouts
    const night = 1 - sm.k;
    for (const l of this.exterior) l.intensity = power ? 30 * Math.max(0.15, night) : 0;
    LIGHTS.outdoor.emissiveIntensity = power ? 0.3 + night * 1.4 : 0;
    LIGHTS.facade.emissiveIntensity = power ? 0.05 + night * 0.85 : 0.02;
    LIGHTS.facade.color.set(night > 0.5 ? '#ffd98a' : '#4a5a68');
    for (const [key, m] of Object.entries(this.wingMats)) {
      const [kind, wing] = key.split(':');
      const open = !!L.FLAGS[wing];
      if (kind === 'lamp') m.emissiveIntensity = open ? LAMP_GLOW * inten : 0;
      else { m.emissiveIntensity = open ? LIGHTS.facade.emissiveIntensity : 0.02; m.color.copy(open ? LIGHTS.facade.color : C('#2a2f36')); }
    }
    LIGHTS.window.emissiveIntensity = 0.12 + sm.k * 0.9;
    LIGHTS.window.color.set(sm.k > 0.5 ? '#dfeaf5' : '#1b2b4a');
    LIGHTS.neon.emissiveIntensity = power ? 2 : 0;
    // The portraits' eyes only light up on bad nights.
    LIGHTS.eyes.emissiveIntensity = power ? night * clamp(hz * 2, 0, 1) * (0.8 + Math.sin(t * 0.7) * 0.4) : 0.6 * night * clamp(hz * 2, 0, 1);
    // haunted neon
    const lettersOn = power && sm.k < 0.9;
    this.dyn.letters.forEach((m, i) => {
      const glitch = !this.calm && hz > 0.3 && Math.sin(t * (3 + i) + i * 11) > 1 - hz * 0.25;
      m.material.color.set(lettersOn && !glitch ? '#ff4778' : '#3a1020');
    });
    if (this.dyn.vacancy) this.dyn.vacancy.material.color.set(power && (hz < 0.5 || Math.sin(t * 9) > -0.6) ? '#ffffff' : '#222222');

    // snowfall: heavier at night and on bad nights
    if (cam) this.updateSnow(dt, cam, night, hz, top);

    // water
    const debris = snap ? snap.m.filter(m => m.t === 'debris').length : 0;
    const dirt = clamp(debris / 10, 0, 1);
    this.waterMat.color.setRGB(lerp(0.25, 0.36, dirt), lerp(0.7, 0.45, dirt), lerp(0.82, 0.22, dirt));
    this.water.position.y = L.POOL.waterY + Math.sin(t * 1.4) * 0.015;

    if (this.lotMarks) this.lotMarks.visible = !cam || cam.z > L.BUILDING.z2 - 1;
    if (!snap) return;
    // rooms: curtains, thermostats, dnd (only drawn when you're near enough to see into the room)
    L.ROOMS.forEach((r, i) => {
      const st = snap.rm[i];
      if (!st) return;
      const near = !eye || (eye.x - r.cx) ** 2 + (eye.z - (r.z1 + r.z2) / 2) ** 2 < 900;
      const curtains = this.dyn.windows[r.id];
      if (curtains) for (const c of curtains) c.visible = near;
      const thermo = this.dyn.thermos[r.id];
      if (thermo) thermo.visible = near;
      if (!near) return;
      if (curtains) {
        const open = st[2] === 1;
        const [Lc, Rc] = curtains;
        const tx = open ? 0.62 : 0.38, sx = open ? 0.35 : 1;
        Lc.position.x += (-tx - Lc.position.x) * Math.min(1, dt * 6);
        Rc.position.x += (tx - Rc.position.x) * Math.min(1, dt * 6);
        Lc.scale.x += (0.8 * sx - Lc.scale.x) * Math.min(1, dt * 6);
        Rc.scale.x += (0.8 * sx - Rc.scale.x) * Math.min(1, dt * 6);
      }
      if (thermo) thermo.material = st[3] ? this.coldMat : LIGHTS.screen;
    });
    for (const d of this.doors) if (d.dnd) {
      const on = !!snap.rm[d.ri]?.[1] && snap.ph === 'shift';
      d.dnd.visible = on;
      if (d.lamp) d.lamp.visible = on;
    }

    // status board: every open room, with its tier
    const open = L.ROOMS.map((r, i) => ({ r, i })).filter(({ r }) => !r.wing || L.FLAGS[r.wing]);
    const key = open.map(({ r, i }) => `${r.id}${snap.rm[i]?.[0]?.[0]}${snap.ht?.t?.[i] || 'b'}${snap.rm[i]?.[1] ? 'd' : ''}`).join(',');
    if (key !== this.boardKey && this.dyn.board) {
      this.boardKey = key;
      drawStatusBoard(this.dyn.board.canvas.getContext('2d'), open.map(({ r, i }) => ({ id: r.id, st: snap.rm[i]?.[0] || 'vacant', tier: TIER_CODE[snap.ht?.t?.[i]] || 'basic', dnd: !!snap.rm[i]?.[1] })));
      this.dyn.board.tex.needsUpdate = true;
    }

    // stoves (0-3 range, 4-7 island cooktop, 8 toaster, 9 waffle iron): a pan with whatever is in it
    (snap.sv || []).forEach((s, i) => {
      const b = this.dyn.burners[i];
      if (!b) return;
      const m = b.material;
      if (!s) { m.emissiveIntensity = 0; m.emissive.set('#ff3a00'); }
      else if (s[1] === 'c') { m.emissive.set('#ff5a00'); m.emissiveIntensity = 0.8 + Math.sin(t * 6) * 0.2; }
      else if (s[1] === 'd') { m.emissive.set('#ffb000'); m.emissiveIntensity = 0.6 + (s[2] > 0.6 ? Math.abs(Math.sin(t * 10)) : 0); }
      else { m.emissive.set('#ff0000'); m.emissiveIntensity = 1.2 + Math.random() * 0.6; }
      if (i >= 8) return; // toast and waffles stay inside their irons
      const want = s ? `${s[0]}:${s[1]}:${s[4] ? 1 : 0}` : '';
      if (want !== this.stoveKeys[i]) {
        this.stoveKeys[i] = want;
        if (this.stoveItems[i]) this.scene.remove(this.stoveItems[i]);
        this.stoveItems[i] = null;
        if (s) {
          const it = buildPanFood(s[0], s[1], s[4]);
          b.updateWorldMatrix(true, false);
          b.getWorldPosition(it.position);
          it.position.y += 0.035;
          it.rotation.y = i < 4 ? -0.5 : 0.5;
          this.scene.add(it);
          this.stoveItems[i] = it;
        }
      }
    });
    this.updateKitchen(snap, dt, t);
  }

  updateKitchen(snap, dt, t) {
    const kt = snap.kt;
    if (!kt) return;
    const K = this.kitchen;
    K.tubs.forEach((m, i) => (m.visible = i < kt.sk));
    const p = this.dyn.plates;
    if (p) {
      const n = kt.pt < 0 ? 12 : kt.pt;
      p.visible = n > 0;
      p.scale.y = Math.max(0.01, n * 0.022);
      p.position.y = 0.955 + p.scale.y / 2;
    }
    kt.ps.forEach((pc, k) => {
      const key = pc || '';
      if (key === K.passKeys[k]) return;
      K.passKeys[k] = key;
      if (K.pass[k]) this.scene.remove(K.pass[k]);
      K.pass[k] = null;
      if (!pc) return;
      const it = buildItem(pc.startsWith('burnt:') ? 'burnt' : pc);
      it.position.set(PASS_X[k], 1.0, -3);
      it.rotation.y = k * 0.7;
      this.scene.add(it);
      K.pass[k] = it;
    });
    const tk = this.dyn.tickets;
    const key = kt.od.map(o => `${o.n}${o.d.join('')}${Math.round(o.f * 10)}`).join('|');
    if (tk && key !== this.ticketKey) {
      this.ticketKey = key;
      drawTickets(tk.canvas.getContext('2d'), kt.od.map(o => ({ ...o, d: o.d.map(d => DISHES[d]?.icon || '?') })));
      tk.tex.needsUpdate = true;
    }
    // stove fires: flickering flames and rising smoke
    kt.fi.forEach((on, i) => {
      let f = K.fires[i];
      if (on && !f) {
        f = K.fires[i] = buildFire(K);
        this.dyn.burners[i].updateWorldMatrix(true, false);
        this.dyn.burners[i].getWorldPosition(f.position);
        this.scene.add(f);
      } else if (!on && f) { this.scene.remove(f); K.fires[i] = null; return; }
      if (!f) return;
      f.userData.flames.forEach((m, k) => {
        const h = m.userData.h * (0.65 + Math.abs(Math.sin(t * (8 + k * 1.9) + k * 3)) * 0.6);
        m.scale.set(1, h, 1);
        m.position.y = 0.03 + 0.15 * h;
      });
      for (const pf of f.userData.puffs) {
        pf.t = (pf.t + dt * 0.35) % 1;
        pf.m.position.set(Math.sin(pf.t * 6 + i) * 0.15, 0.45 + pf.t * 1.5, Math.cos(pf.t * 5 + i) * 0.15);
        pf.m.scale.setScalar(0.5 + pf.t * 2.4);
      }
    });
    K.flameMat.opacity = 0.7 + Math.random() * 0.25;
  }

  updateSnow(dt, cam, night, hz, top) {
    const s = this.snow, p = s.pos, l = s.local;
    this.wind = Math.sin(this.time * 0.13) * 1.6 + Math.sin(this.time * 0.41) * 0.7 + hz * 1.5;
    const fall = 1.1 + night * 0.5 + hz * 0.8;
    const roofTop = top * L.FLOOR_H + L.WALL_H + ROOF_RISE + 0.6;
    const n = Math.round(s.N * clamp(0.45 + night * 0.35 + hz * 0.4, 0, 1));
    for (let i = 0; i < s.N; i++) {
      const k = i * 3, sd = s.seed[i];
      l[k] += (this.wind + Math.sin(this.time * (1 + sd) + sd * 20) * 0.4) * dt;
      l[k + 1] -= fall * (0.7 + sd * 0.6) * dt;
      l[k + 2] += Math.cos(this.time * (0.8 + sd) + sd * 9) * 0.3 * dt;
      if (l[k + 1] < 0) l[k + 1] += 20;
      // wrap around the camera
      let x = l[k] - cam.x; x = ((x + 30) % 60 + 60) % 60 - 30; l[k] = cam.x + x;
      let z = l[k + 2] - cam.z; z = ((z + 30) % 60 + 60) % 60 - 30; l[k + 2] = cam.z + z;
      const wy = cam.y - 6 + l[k + 1];
      const close = (l[k] - cam.x) ** 2 + (wy - cam.y) ** 2 + (l[k + 2] - cam.z) ** 2 < 2.2; // no giant flakes in your face
      const hidden = i >= n || wy < 0 || close || indoors(l[k], wy, l[k + 2], roofTop);
      p[k] = l[k]; p[k + 1] = hidden ? -999 : wy; p[k + 2] = l[k + 2];
    }
    s.points.geometry.attributes.position.needsUpdate = true;
  }
}
