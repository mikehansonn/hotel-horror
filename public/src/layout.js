// The Last Resort — floor plan, furniture, interactable stations and the guest navigation graph.
// Pure data (no three.js) so the host simulation, the renderer, the minimap and the tests share it.
//
// Coordinates are meters. +x is east, +z is south (toward the parking lot), y is up.
// A model/prop with rotation `ry` faces the direction (sin ry, cos ry).
//
// Parts of the hotel switch on at runtime (expansion wings, upgrade props). FLAGS holds that state,
// and colliders, nav nodes, stations and props can depend on it:
//   on: 'x'   exists only while FLAGS.x is true       off: 'x'  exists only while FLAGS.x is false
//   gate: 'x' (nodes/stations) usable only once the area 'x' has been opened

export const WALL_H = 3.2;
export const WALL_T = 0.3;
export const DOOR_H = 2.3;
export const BUILDING = { x1: -30, x2: 30, z1: -29, z2: 8 };
export const WORLD = { x1: -95, x2: 95, z1: -55, z2: 55 };
export const POOL = { x1: 14, x2: 26, z1: -7, z2: 3, floorY: -1.5, waterY: -0.3 };
export const PICKUP = { x1: -11, x2: 11, z1: 10.6, z2: 16.8 };
export const LOT = { x1: -30, x2: 30, z1: 17, z2: 37 };
export const ROAD = { z1: 10.4, z2: 17 };
export const ROAD_Z = 14.8;
export const RESPAWN = { x: 24.5, z: -16.6 };
export const BASEMENT = { x: 28.9, z: -23.9 }; // the basement door, at the back of Storage
// Everyone clocks in (and starts the game) in the break room.
export const SPAWNS = [[23.2, -16.4], [24.6, -16.4], [26.0, -16.4], [27.4, -16.4], [23.6, -12.4], [26.6, -12.4]];

// Upper floors: the simulation stays flat, so each storey above the ground floor is laid out
// FLOOR_DX meters further east and drawn FLOOR_H higher. toWorld() lifts a point onto its storey.
export const FLOOR_H = 3.6;
export const FLOOR_DX = 1000;
export const FLOORS = [
  { f: 0, flag: null, name: 'Ground Floor', short: 'G' },
  { f: 1, flag: 'floor2', name: 'Second Floor', short: '2F', first: 201 },
  { f: 2, flag: 'floor3', name: 'Third Floor', short: '3F', first: 301 },
];
// The basement is level 3: laid out 3000 m east like a storey, but drawn 6 m below the ground floor.
export const BASEMENT_F = 3;
export const BASEMENT_Y = -6;
export const levelY = f => (f === BASEMENT_F ? BASEMENT_Y : f * FLOOR_H);
export const floorOf = x => (x > 2500 ? BASEMENT_F : Math.max(0, Math.min(FLOORS.length - 1, Math.round(x / FLOOR_DX))));
export function toWorld(x, z, y = 0) {
  const f = floorOf(x);
  return { x: x - f * FLOOR_DX, y: y + levelY(f), z };
}
export const floorBuilt = f => f === 0 || f === BASEMENT_F || !!FLAGS[FLOORS[f].flag];
export const floorName = f => (f === BASEMENT_F ? 'Basement' : FLOORS[f].name);
export const floorShort = f => (f === BASEMENT_F ? 'B' : FLOORS[f].short);
// The steps down from the basement door: a ramp from the foot (x1) up to a landing at the door.
export const BSM_STEPS = { x1: 3026.3, x2: 3028.8, x3: 3029.85, z1: -23.1, z2: -21.7, rise: 1.5 };
// The guest-room tower: the part of the building that grows upward.
export const TOWER = { x1: -30, x2: 30, z1: -29, z2: -11 };
// Roofed blocks of the building (ceilings, roofs and the minimap).
export const BLOCKS = [
  { x1: -30, x2: 30, z1: -29, z2: 8, wing: null, floor: 0 },
  ...FLOORS.slice(1).map(F => ({ x1: TOWER.x1 + F.f * FLOOR_DX, x2: TOWER.x2 + F.f * FLOOR_DX, z1: TOWER.z1, z2: TOWER.z2, wing: F.flag, floor: F.f })),
  { x1: 3006, x2: 3030, z1: -29, z2: -11, wing: null, floor: BASEMENT_F, cellar: true },
];
export const STAFF_ZONES = new Set(['kitchen', 'laundry', 'office', 'staff', 'storage', 'linen', 'closet', 'basement']);
export const HEDGE_MAZE = { x1: -66, x2: -40, z1: -9, z2: 7 };
// One straight staircase at the west end of the hallway, along its north wall, like the stairs in a
// house: every storey's flight climbs toward the end of the hall, right above the flight below. At the
// top you step off onto a landing at the end of the hall and walk back past a banister round the
// opening. It's built along with the second floor. x1 is the top of each flight, x2 its foot.
export const STAIRS = { x1: -28.6, x2: -23.9, z1: -21.85, z2: -20.6, steps: 18 };

const PI = Math.PI;

export const FLAGS = {};
export const isActive = o => (!o.on || !!FLAGS[o.on]) && (!o.off || !FLAGS[o.off]) && (!o.gate || !!FLAGS[o.gate]);
export function setFlags(f) {
  let changed = false;
  for (const k of new Set([...Object.keys(FLAGS), ...Object.keys(f)])) {
    const v = !!f[k];
    if (FLAGS[k] !== v) { FLAGS[k] = v; changed = true; }
  }
  if (changed) pathCache.clear();
  return changed;
}

export const ZONES = [
  { id: 'lobby', name: 'Lobby', x1: -10, z1: -11, x2: 10, z2: 8, floor: 'marble', wall: 'lobby', pub: true },
  { id: 'dining', name: 'Dining Room', x1: -30, z1: -3, x2: -10, z2: 8, floor: 'wood', wall: 'dining', pub: true },
  { id: 'kitchen', name: 'Kitchen', x1: -30, z1: -11, x2: -10, z2: -3, floor: 'checker', wall: 'tile' },
  { id: 'laundry', name: 'Laundry', x1: -30, z1: -18, x2: -20, z2: -11, floor: 'tile', wall: 'plain' },
  { id: 'office', name: 'Security Office', x1: -30, z1: -29, x2: -20, z2: -22, floor: 'tile', wall: 'staff' },
  { id: 'hall', name: 'Hallway', x1: -30, z1: -22, x2: 30, z2: -18, floor: 'carpet', wall: 'hall', pub: true },
  { id: 'hall', name: 'Hallway', x1: -2, z1: -18, x2: 2, z2: -11, floor: 'carpet', wall: 'hall', pub: true },
  { id: 'elev', name: 'Elevators', x1: -2, z1: -29, x2: 2, z2: -22, floor: 'carpet', wall: 'hall', pub: true },
  { id: 'pool', name: 'Pool', x1: 10, z1: -11, x2: 30, z2: 8, floor: 'pooltile', wall: 'pool', pub: true },
  { id: 'staff', name: 'Break Room', x1: 20, z1: -18, x2: 30, z2: -11, floor: 'tile', wall: 'staff' },
  { id: 'storage', name: 'Storage', x1: 20, z1: -29, x2: 30, z2: -22, floor: 'concrete', wall: 'concrete' },
  // the basement: a long cellar hall, the boiler room off its north side and the lost luggage to the south
  { id: 'basement', name: 'Basement', x1: 3006, z1: -24, x2: 3030, z2: -16, floor: 'stone', wall: 'stone' },
  { id: 'basement', name: 'Boiler Room', x1: 3016, z1: -29, x2: 3026, z2: -24, floor: 'stone', wall: 'stone' },
  { id: 'basement', name: 'Lost Luggage', x1: 3012, z1: -16, x2: 3024, z2: -11, floor: 'stone', wall: 'stone' },
];
// Security cameras: what the monitors in the Security Office can show, four at a time. Each looks from
// (x, y, z) toward (tx, ty, tz); on: only once that part of the hotel exists.
export const CAMERAS = [
  { id: 'lobby', name: 'LOBBY', x: 9.5, y: 2.95, z: -10.5, tx: -3, ty: 0.6, tz: 4 },
  { id: 'door', name: 'FRONT DOOR', x: -9.5, y: 2.95, z: 7.5, tx: 4, ty: 0.6, tz: -4 },
  { id: 'hallw', name: 'HALL WEST', x: -29.4, y: 2.95, z: -21.6, tx: 0, ty: 0.6, tz: -19.6 },
  { id: 'halle', name: 'HALL EAST', x: 29.4, y: 2.95, z: -21.6, tx: 0, ty: 0.6, tz: -19.6 },
  { id: 'pool', name: 'POOL', x: 29.5, y: 2.95, z: -10.5, tx: 16, ty: 0, tz: 2 },
  { id: 'dining', name: 'DINING ROOM', x: -29.5, y: 2.95, z: 7.5, tx: -15, ty: 0.6, tz: -1 },
  { id: 'storage', name: 'STORAGE', x: 20.6, y: 2.95, z: -28.6, tx: 29, ty: 0.8, tz: -23.6 },
  { id: 'back', name: 'BEHIND THE HOTEL', x: -9, y: 4.2, z: -42, tx: 0, ty: 0.8, tz: -30 },
  { id: 'hall2', name: '2F HALL', x: 970.6, y: 2.95, z: -18.4, tx: 1000, ty: 0.6, tz: -20.4, on: 'floor2' },
  { id: 'hall3', name: '3F HALL', x: 1970.6, y: 2.95, z: -18.4, tx: 2000, ty: 0.6, tz: -20.4, on: 'floor3' },
  { id: 'cellar', name: 'BASEMENT', x: 3029.4, y: 2.9, z: -16.6, tx: 3008, ty: 0.6, tz: -20.4 },
];
const OUTSIDE = { id: 'outside', name: 'Outside', pub: true, wall: 'brick' };

export const ROOMS = [];
export const ROOM_BY_ID = {};
export const WALLS = [];     // {x1,z1,x2,z2,h,thin?}
export const LINTELS = [];   // boxes above door gaps (visual only)
export const GLASS = [];     // glass panes in the facade {x1,x2,z}
export const COLLIDERS = []; // {x1,z1,x2,z2,who:'all'|'car'|'player', on?, off?}
export const DOORS = [];     // swinging door leaves {x,z,axis,w,room?,label?,double?}
export const FURN = [];      // props for the renderer {kind,x,z,ry,...,on?,off?}
export const STATIONS = {};  // interactables {id,kind,x,y,z,r,...}
export const NODES = {};     // nav graph {id,x,z,n:[ids],pose?,ry?,y?,spot?,staff?,gate?,on?}
export const SEATS = [];
export const TABLES = [];
export const LOUNGERS = [];
export const SWIMS = [];
export const SOFAS = [];
export const QUEUE = [];
export const WANDER = [];
export const EXITS = ['street_w', 'street_e'];
export const PARKING = [];
export const DROPS = [];
export const LUGGAGE_SPOTS = [];
export const TOOL_HOMES = [];
export const EXTRA_TOOL_HOMES = [];
export const TREES = [];
export const LAMPS = [];
export const WINDOWS = [];   // exterior decorative windows {x,z,axis,w,side,wing}
export const SIGNS = [];     // {text,x,y,z,ry,w,h,color,bg}
export const SPA_SPOTS = [];
export const ARCADE_SPOTS = [];
export const LOUNGE = [];           // seats in the third-floor lounge
export const PATROL = [];           // hallway spots the night guard walks between
export const FLOOR_TOOL_HOMES = []; // supply closets on the upper floors

// ---------- builders ----------
// While an upper floor is being built, everything created is tagged with that floor's flag.
let GATE = null;
const gated = () => (GATE ? { gate: GATE } : {});

function collider(x1, z1, x2, z2, who = 'all', cond = {}) {
  COLLIDERS.push({ x1: Math.min(x1, x2), z1: Math.min(z1, z2), x2: Math.max(x1, x2), z2: Math.max(z1, z2), who, ...cond });
}

function spans(a, b, gaps) {
  const out = [];
  let cur = a;
  for (const [g1, g2] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g1 > cur + 0.01) out.push([cur, g1]);
    cur = Math.max(cur, g2);
  }
  if (b > cur + 0.01) out.push([cur, b]);
  return out;
}

function hWall(z, xa, xb, gaps = []) {
  const t = WALL_T / 2;
  for (const [a, b] of spans(xa, xb, gaps)) {
    WALLS.push({ x1: a, z1: z - t, x2: b, z2: z + t, h: WALL_H, ...gated() });
    collider(a, z - t, b, z + t);
  }
  for (const [a, b] of gaps) if (a >= xa && b <= xb) LINTELS.push({ x1: a, z1: z - t, x2: b, z2: z + t, ...gated() });
}

function vWall(x, za, zb, gaps = []) {
  const t = WALL_T / 2;
  for (const [a, b] of spans(za, zb, gaps)) {
    WALLS.push({ x1: x - t, z1: a, x2: x + t, z2: b, h: WALL_H, ...gated() });
    collider(x - t, a, x + t, b);
  }
  for (const [a, b] of gaps) if (a >= za && b <= zb) LINTELS.push({ x1: x - t, z1: a, x2: x + t, z2: b, ...gated() });
}

function thinWall(x1, z1, x2, z2) {
  WALLS.push({ x1, z1, x2, z2, h: WALL_H, thin: true, ...gated() });
  collider(x1, z1, x2, z2);
}

// Furniture with an optional axis-aligned collider (w = local x size, d = local z size).
function furn(kind, x, z, ry = 0, opt = {}) {
  const f = { kind, x, z, ry, ...gated(), ...opt };
  FURN.push(f);
  if (opt.w && opt.d && opt.solid !== false) {
    const swap = Math.abs(Math.sin(ry)) > 0.5;
    const hw = (swap ? opt.d : opt.w) / 2, hd = (swap ? opt.w : opt.d) / 2;
    collider(x - hw, z - hd, x + hw, z + hd, opt.who || 'all', { on: opt.on, off: opt.off });
  }
  return f;
}

function station(id, kind, x, y, z, r, extra = {}) {
  STATIONS[id] = { id, kind, x, y, z, r, ...gated(), ...extra };
}

function node(id, x, z, extra = {}) {
  NODES[id] = { id, x, z, n: [], ...gated(), ...extra };
  return id;
}

function link(a, b) {
  if (!NODES[a] || !NODES[b]) throw new Error(`nav link to missing node: ${a} <-> ${b}`);
  if (!NODES[a].n.includes(b)) NODES[a].n.push(b);
  if (!NODES[b].n.includes(a)) NODES[b].n.push(a);
}

function chain(ids) {
  for (let i = 0; i < ids.length - 1; i++) link(ids[i], ids[i + 1]);
}

function sign(text, x, y, z, ry, w, h, opt = {}) {
  SIGNS.push({ text, x, y, z, ry, w, h, color: '#f3e6c4', bg: '#3a1d1d', ...gated(), ...opt });
}

export const roomName = id => (id === 'PRES' ? 'the Presidential Suite' : `Room ${id}`);

// ---------- shell & walls (ground floor) ----------
const MAIN_CX = [-17, -11, -5, 5, 11, 17];
const doorX = cx => cx - 1.6;
const corridorGaps = [[-23.3, -21.7], ...MAIN_CX.map(cx => [doorX(cx) - 0.6, doorX(cx) + 0.6]), [-2, 2], [23.2, 24.8]];

hWall(-29, -30, 30);                                                   // north facade
hWall(BUILDING.z2, -30, 30, [[-2.5, 2.5], [-8.6, -3.4], [3.4, 8.6]]);  // south facade: doors + lobby glass
vWall(-30, -29, 8);
vWall(30, -29, 8);
hWall(-22, -30, 30, corridorGaps);
hWall(-18, -30, 30, corridorGaps);
hWall(-11, -30, 30, [[-27, -25.4], [-2, 2], [25, 26.6]]);
hWall(-3, -30, -10, [[-16, -13], [-20.4, -18.4]]); // kitchen door + the pass hatch
for (const x of [-20, -14, -8, -2, 2, 8, 14, 20]) { vWall(x, -29, -22); vWall(x, -18, -11); }
vWall(-10, -11, 8, [[-9, -7.4], [-1, 3]]);
vWall(10, -11, 8, [[1.5, 5.5]]);
for (const [x1, x2] of [[-8.6, -3.4], [3.4, 8.6]]) { GLASS.push({ x1, x2, z: BUILDING.z2 }); collider(x1, BUILDING.z2 - 0.15, x2, BUILDING.z2 + 0.15); }

DOORS.push(
  { x: -22.5, z: -22, axis: 'x', w: 1.6, label: 'UTILITY' },
  { x: -22.5, z: -18, axis: 'x', w: 1.6, label: 'LAUNDRY' },
  { x: 24, z: -22, axis: 'x', w: 1.6, label: 'STORAGE' },
  { x: 24, z: -18, axis: 'x', w: 1.6, label: 'STAFF' },
  { x: -10, z: -8.2, axis: 'z', w: 1.6, label: 'KITCHEN' },
  { x: -26.2, z: -11, axis: 'x', w: 1.6 },
  { x: 25.8, z: -11, axis: 'x', w: 1.6 },
);

// Exterior decorative windows.
for (const cx of MAIN_CX) WINDOWS.push({ x: cx + 1.95, z: BUILDING.z1, axis: 'x', w: 1.5, side: -1, wing: null });
for (const x of [-25, 25]) WINDOWS.push({ x, z: BUILDING.z1, axis: 'x', w: 1.4, side: -1, wing: null });
for (const x of [-26, -21, -16, 13, 17, 21, 25]) WINDOWS.push({ x, z: BUILDING.z2, axis: 'x', w: 2.2, side: 1, wing: null });
for (const z of [-25.5, -14.5, -7, -1, 5]) { WINDOWS.push({ x: BUILDING.x1, z, axis: 'z', w: 1.6, side: -1, wing: null }); WINDOWS.push({ x: BUILDING.x2, z, axis: 'z', w: 1.6, side: 1, wing: null }); }

// ---------- guest rooms ----------
function makeRoom(id, cx, side, wing = null) {
  const s = side === 'N' ? -1 : 1;           // direction from the corridor into the room along z
  const wallZ = side === 'N' ? -22 : -18;     // the wall with the door
  const P = (u, v) => ({ x: cx + u, z: wallZ + s * v });
  const B = (u1, v1, u2, v2) => {
    const a = P(u1, v1), b = P(u2, v2);
    return [Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z)];
  };
  const backRy = Math.atan2(0, -s); // faces back toward the door
  const g = wing ? { gate: wing } : {};
  const r = {
    id, cx, side, s, wallZ, wing, P, backRy, hall: `h${doorX(cx)}`,
    x1: cx - 3, x2: cx + 3, z1: Math.min(wallZ, wallZ + 7 * s), z2: Math.max(wallZ, wallZ + 7 * s),
  };
  r.door = P(-1.6, 0);
  r.bathBox = B(0.6, 0, 3, 2.6);
  r.bed = P(0, 5.9);
  r.toilet = P(2.55, 1.9);
  r.window = P(1.95, 6.95);
  r.messSpots = [P(-1.0, 2.2), P(-0.4, 3.9), P(1.5, 3.4), P(-1.5, 4.7), P(1.6, 5.3), P(0.4, 4.3)];

  thinWall(...B(0.6, 2.54, 3, 2.66));
  thinWall(...B(0.54, 0, 0.66, 0.75));
  thinWall(...B(0.54, 1.75, 0.66, 2.66));
  { const b = B(0.54, 0.75, 0.66, 1.75); LINTELS.push({ x1: b[0], z1: b[1], x2: b[2], z2: b[3] }); }

  // Colliders for the furniture footprint (the same in every tier; decor comes from roomDecor()).
  collider(...B(-0.9, 4.8, 0.9, 7.0));
  for (const u of [-1.32, 1.32]) collider(...B(u - 0.25, 6.5, u + 0.25, 6.95));
  collider(...B(-2.95, 2.9, -2.25, 4.3));
  collider(...B(2.375, 3.6, 2.925, 5.2));
  collider(...B(-2.725, 5.475, -1.875, 6.325));
  collider(...B(2.3, 1.625, 2.95, 2.275));

  { const wp = P(1.95, 6.8); furn('window', wp.x, wp.z, backRy, { room: id }); } // on the wall's face, not inside it
  { const p = P(2.6, 1.95); furn('toilet', p.x, p.z, -PI / 2, {}); }
  { const p = P(2.72, 0.6); furn('sink', p.x, p.z, -PI / 2, {}); }
  { const p = P(-2.87, 1.25); furn('thermostat', p.x, p.z, PI / 2, { room: id }); }
  furn('garlic', r.door.x, wallZ - s * 0.17, s > 0 ? PI : 0, { on: 'garlic' });
  furn('salt', r.door.x, wallZ, 0, { on: 'salt' });

  station(`door_${id}`, 'door', r.door.x, 1.3, wallZ - s * 0.35, 0.65, { room: id, ...g });
  { const p = P(1.95, 6.75); station(`curtain_${id}`, 'curtain', p.x, 1.55, p.z, 0.6, { room: id, ...g }); }
  { const p = P(-2.78, 1.25); station(`thermo_${id}`, 'thermo', p.x, 1.45, p.z, 0.3, { room: id, ...g }); }

  DOORS.push({ x: r.door.x, z: wallZ, axis: 'x', w: 1.2, room: id, s, wing });

  const nid = k => `r${id}_${k}`;
  node(nid('in'), ...Object.values(P(-1.6, 1.2)), { ...g });
  node(nid('mid'), ...Object.values(P(-0.5, 3.4)), { ...g });
  node(nid('bed'), ...Object.values(P(0, 5.05)), { pose: 'lie', ry: s > 0 ? PI : 0, y: 0.72, ...g });
  node(nid('bath'), ...Object.values(P(1.85, 1.25)), { ry: PI / 2, ...g });
  node(nid('desk'), ...Object.values(P(-2.0, 3.6)), { pose: 'sit', ry: -PI / 2, ...g });
  node(nid('tv'), ...Object.values(P(0.4, 4.2)), { ry: PI / 2, ...g });
  link(nid('in'), nid('mid'));
  link(nid('mid'), nid('bed'));
  link(nid('in'), nid('bath'));
  link(nid('mid'), nid('desk'));
  link(nid('mid'), nid('tv'));
  return r;
}

// Furniture for a standard room or suite (positions are fixed; the look depends on the tier).
export function roomDecor(r, tier, extras = {}) {
  if (r.pres) return [];
  const out = [];
  const add = (kind, u, v, ry, opt = {}) => { const p = r.P(u, v); out.push({ kind, x: p.x, z: p.z, ry, room: r.id, ...opt }); };
  const b = r.backRy;
  if (tier === 'suite') {
    add('kingBed', 0, 5.9, b);
    add('nightstand', -1.32, 6.72, b);
    add('nightstand', 1.32, 6.72, b);
    add('desk', -2.6, 3.6, PI / 2, { fancy: true });
    add('chair', -2.0, 3.6, -PI / 2, { fancy: true });
    add('dresserTV', 2.65, 4.4, -PI / 2, { big: true });
    add('wingback', -2.3, 5.9, PI / 2);
    add('ottoman', -1.5, 5.15, 0);
    add('floorLamp', -2.65, 6.62, 0);
    add('plant', 2.62, 6.45, 0, { small: true });
    add('painting', 0, 6.97, b, { y: 1.95, seed: Number(r.id) + 2, big: true, gold: true });
    add('rug', -0.4, 3.4, 0, { rw: 2.6, rd: 2.0, color: '#26365f' });
    add('vase', 2.65, 4.95, 0, { y: 0.8 });
  } else {
    add('bed', 0, 5.9, b);
    add('nightstand', -1.32, 6.72, b);
    add('nightstand', 1.32, 6.72, b);
    add('desk', -2.6, 3.6, PI / 2);
    add('chair', -2.0, 3.6, -PI / 2);
    add('dresserTV', 2.65, 4.4, -PI / 2);
    add('armchair', -2.3, 5.9, PI / 2, { color: 'room' });
    add('painting', 0, 6.97, b, { y: 1.95, seed: Number(r.id) });
    add('rug', -0.4, 3.5, 0, { rw: 2.2, rd: 1.6, color: '#6b4f3a' });
  }
  if (extras.minibar) add('minibar', 2.62, 5.65, -PI / 2);
  if (extras.bedding) add('bedding', 0, 5.9, b, { king: tier === 'suite' });
  return out;
}

// The presidential suite fills the east end of the second floor: bedroom, living room, bathroom.
function makePres() {
  const X = x => x + FLOOR_DX, id = 'PRES';
  const r = { id, cx: X(25), side: 'E', s: 1, wallZ: null, wing: 'pres', pres: true, hall: null, x1: X(20), x2: X(30), z1: -29, z2: -11 };
  r.door = { x: X(20), z: -20 };
  r.bathBox = [X(20), -16, X(30), -11];
  r.bed = { x: X(25), z: -27.4 };
  r.toilet = { x: X(29.4), z: -12.0 };
  r.window = { x: X(27.8), z: -28.95 };
  r.messSpots = [{ x: X(22.2), z: -20.4 }, { x: X(24.6), z: -18.2 }, { x: X(27.4), z: -20.6 }, { x: X(22.6), z: -26 }, { x: X(28.2), z: -26.2 }, { x: X(26.4), z: -13.2 }, { x: X(28.4), z: -14.2 }];
  hWall(-24, X(20), X(30), [[X(25.4), X(28)]]);
  hWall(-16, X(20), X(30), [[X(26.8), X(29.2)]]);
  // bedroom
  furn('fourPoster', X(25), -27.4, 0, { w: 2.4, d: 2.6 });
  furn('nightstand', X(23.2), -28.45, 0, { w: 0.5, d: 0.45 });
  furn('nightstand', X(26.8), -28.45, 0, { w: 0.5, d: 0.45 });
  furn('wardrobe', X(21), -27.6, PI / 2, { w: 1.8, d: 0.7 });
  furn('vanityTable', X(29.2), -26.5, -PI / 2, { w: 1.4, d: 0.6 });
  furn('rug', X(25), -26.4, 0, { rw: 4.2, rd: 3.0, color: '#5c1a28' });
  furn('window', r.window.x, -28.8, 0, { room: id });
  furn('painting', X(22.4), -28.97, 0, { y: 1.9, seed: 11, big: true, gold: true });
  // living room
  furn('sofa', X(23.2), -23.3, 0, { w: 3.0, d: 0.9, color: '#6e1f2a' });
  furn('coffeeTable', X(23.2), -21.8, 0, { w: 1.6, d: 0.8 });
  furn('armchair', X(21.2), -21.6, PI / 2, { w: 0.85, d: 0.85, color: '#6e1f2a' });
  furn('armchair', X(25.2), -21.6, -PI / 2, { w: 0.85, d: 0.85, color: '#6e1f2a' });
  furn('presTV', X(23.2), -16.45, PI, { w: 2.2, d: 0.5 });
  furn('grandPiano', X(28.4), -22.6, -PI / 2, { w: 1.5, d: 2.0 });
  furn('bar', X(29.4), -18.4, -PI / 2, { w: 1.8, d: 0.6 });
  furn('diningTable', X(26.6), -18.4, 0, { w: 1.4, d: 1.4 });
  for (const [dx, dz, ry] of [[0, -1, 0], [0, 1, PI], [-1, 0, PI / 2], [1, 0, -PI / 2]]) furn('diningChair', X(26.6) + dx * 1.05, -18.4 + dz * 1.05, ry, { solid: false, fancy: true });
  furn('chandelier', X(25), -20, 0, { gold: true });
  furn('rug', X(24.5), -20, 0, { rw: 6, rd: 5, color: '#3b2a5c' });
  furn('plant', X(20.7), -16.7, 0, { w: 0.7, d: 0.7 });
  furn('plant', X(29.3), -16.8, 0, { w: 0.7, d: 0.7 });
  furn('painting', X(29.83), -21.4, -PI / 2, { y: 1.9, seed: 5, big: true, gold: true });
  // bathroom
  furn('jacuzzi', X(23.2), -13.4, 0, { w: 2.6, d: 2.6 });
  furn('doubleSink', X(27.0), -11.42, PI, { w: 2.2, d: 0.6 });
  furn('toilet', X(29.4), -12.0, -PI / 2, { w: 0.45, d: 0.65 });
  furn('shower', X(20.95), -12.6, 0, { w: 1.6, d: 1.6 });
  furn('thermostat', X(20.16), -22.6, PI / 2, { room: id });
  station('door_PRES', 'door', X(19.55), 1.3, -20, 0.8, { room: id });
  station('curtain_PRES', 'curtain', r.window.x, 1.55, -28.75, 0.6, { room: id });
  station('thermo_PRES', 'thermo', X(20.3), 1.45, -22.6, 0.3, { room: id });
  node('rPRES_in', X(21.6), -20);
  node('rPRES_mid', X(25.6), -20);
  node('rPRES_m2', X(28.5), -20);
  node('rPRES_desk', X(23.2), -23.0, { pose: 'sit', ry: 0 });
  node('rPRES_tv', X(23.2), -19.0, { ry: 0 });
  node('rPRES_bd', X(26.7), -23.95);
  node('rPRES_bed', X(25), -26.3, { pose: 'lie', ry: 0, y: 0.86 });
  node('rPRES_bt', X(28.3), -16.6);
  node('rPRES_bt2', X(28.3), -14.8);
  node('rPRES_bath', X(23.2), -13.4, { pose: 'swim', y: -0.45, ry: PI / 2 });
  node('rPRES_piano', X(28.4), -20.6, { pose: 'sit', ry: PI });
  chain(['rPRES_in', 'rPRES_mid', 'rPRES_bd', 'rPRES_bed']);
  chain(['rPRES_mid', 'rPRES_m2', 'rPRES_bt', 'rPRES_bt2', 'rPRES_bath']);
  link('rPRES_mid', 'rPRES_desk');
  link('rPRES_mid', 'rPRES_tv');
  link('rPRES_m2', 'rPRES_piano');
  return r;
}

MAIN_CX.forEach((cx, i) => ROOMS.push(makeRoom(String(101 + i), cx, 'N')));
MAIN_CX.forEach((cx, i) => ROOMS.push(makeRoom(String(107 + i), cx, 'S')));
for (const r of ROOMS) ROOM_BY_ID[r.id] = r;

// ---------- hallway ----------
const hallXs = [...MAIN_CX.map(doorX), -26.4, -22.5, 0, 24, 27.5].sort((a, b) => a - b);
for (const x of hallXs) node(`h${x}`, x, -20);
chain(hallXs.map(x => `h${x}`));
for (const r of ROOMS) link(r.hall, `r${r.id}_in`);
PATROL.push('h-26.4', 'h-12.6', 'h0', 'h15.4', 'h27.5');
node('conn', 0, -14.5);
link('conn', 'h0');
node('elev', 0, -25.4, { ry: PI, lift: true });
link('elev', 'h0');
station('elev_0', 'elevator', 1.45, 1.2, -28.7, 0.4, { floor: 0 });
for (const x of [-17, -9, 9, 17]) furn('sconce', x, -21.8, 0, { y: 2.2 });
for (const x of [-17, -9, 9, 17]) furn('sconce', x, -18.2, PI, { y: 2.2 });
furn('exitSign', -29.8, -20, PI / 2, { y: 2.6 });
furn('exitSign', 29.8, -20, -PI / 2, { y: 2.6 });

// elevator alcove
furn('elevator', 0, -28.85, 0);
furn('vending', -1.55, -26.4, PI / 2, { w: 1.2, d: 0.8 });
station('vending', 'vending', -1.1, 1.2, -26.4, 0.55);
node('vend', -0.55, -26.4, { ry: -PI / 2 });
link('vend', 'elev');
furn('iceMachine', 1.55, -26.4, -PI / 2, { w: 1.0, d: 0.8 });
furn('snackMachine', -1.55, -23.6, PI / 2, { on: 'vending', w: 1.0, d: 0.8 });
for (const [x, seed] of [[-1.62, 1], [1.62, 2]]) furn('arcade', x, -28.35, 0, { on: 'arcade', w: 0.65, d: 0.7, seed });

// ---------- lobby ----------
furn('frontDesk', 6, -7.2, 0, { w: 5, d: 0.8 });
furn('backCounter', 6.6, -10.55, 0, { w: 6.2, d: 0.6 });
furn('statusBoard', 6.6, -10.83, 0, { y: 2.05 });
station('desk', 'desk', 6.0, 1.25, -7.35, 0.5);
furn('deskPhone', 7.9, -7.25, PI, { y: 1.08 });
station('phone', 'phone', 7.9, 1.17, -7.3, 0.35);
furn('keyRack', 3.95, -10.8, 0, {});
station('spare_keys', 'shelf', 3.95, 1.45, -10.6, 0.4, { item: 'keycard', label: 'Spare Key Cards' });
furn('sofa', -8.1, 4.8, 0, { w: 2.6, d: 0.85, color: '#7a2531' });
furn('coffeeTable', -8.1, 6.5, 0, { w: 1.4, d: 0.8 });
furn('armchair', -5.6, 6.4, -PI / 2, { w: 0.9, d: 0.9, color: '#7a2531' });
furn('sofa', -9.2, -4.2, PI / 2, { w: 2.6, d: 0.85, color: '#2d4a3e' });
for (const [x, z] of [[-9.25, 7.25], [-3.4, 7.3], [3.4, 7.3], [9.2, -4.6], [-9.3, -1.6]]) furn('plant', x, z, 0, { w: 0.7, d: 0.7 });
furn('toolRack', -6.5, -10.72, 0, { w: 4, d: 0.25 });
furn('trashCan', -3.7, -10.3, 0, { w: 0.5, d: 0.5 });
station('trash_lobby', 'trash', -3.7, 0.7, -10.3, 0.45);
furn('luggageCart', 1.8, -9.7, 0, { solid: false });
furn('rug', 0, 1.0, 0, { rw: 7, rd: 9, color: '#5a1f2b' });
furn('chandelier', 0, 1.0, 0, {});
furn('chandelier', 0, -6, 0, {});
furn('painting', -9.84, -6.5, PI / 2, { y: 1.9, seed: 7, big: true });
furn('painting', 9.84, -7.6, -PI / 2, { y: 1.9, seed: 13, big: true });
furn('kiosk', 9.45, -2.7, -PI / 2, { on: 'kiosk', w: 0.6, d: 0.6 });
furn('giftShop', 9.0, 6.4, -PI / 2, { on: 'giftshop', w: 1.6, d: 0.9 });
furn('cookies', 3.95, -7.1, 0, { on: 'cookies', y: 1.11 });
furn('monitor2', 4.9, -7.3, 0, { on: 'background', y: 1.11 });
furn('keyBox', 3.2, -6.72, 0, { on: 'express' });
furn('lobbyLamps', 0, 0, 0, { on: 'lobby1' });
furn('lobbyPortraits', 0, 0, 0, { on: 'lobby2' });
sign('FRONT DESK', 6, 2.75, -10.84, 0, 2.6, 0.45);
sign('ROOMS 101–112', 0, 2.75, -10.84, 0, 2.3, 0.4);
sign('DINING', -9.83, 2.75, 1.0, PI / 2, 1.6, 0.4);
sign('POOL', 9.83, 2.75, 3.5, -PI / 2, 1.4, 0.4);
sign('STAFF ONLY', -9.83, 2.6, -8.2, PI / 2, 1.3, 0.32, { color: '#ffdddd', bg: '#6b0000' });
sign('STAFF ONLY', 2.9, 1.0, -9.0, PI / 2, 0.9, 0.24, { color: '#ffdddd', bg: '#6b0000' });

// ---------- dining ----------
const TABLE_POS = [[-26, 0.6], [-20.5, 0.6], [-15, 0.6], [-26, 5.2], [-20.5, 5.2], [-15, 5.2]];
TABLE_POS.forEach(([tx, tz], i) => {
  furn('diningTable', tx, tz, 0, { w: 1.4, d: 1.4 });
  const t = { i, x: tx, z: tz, name: `Table ${i + 1}`, seats: [] };
  for (const [k, dx, dz, ry] of [['N', 0, -1, 0], ['S', 0, 1, PI], ['W', -1, 0, PI / 2], ['E', 1, 0, -PI / 2]]) {
    const id = node(`seat${i}${k}`, tx + dx, tz + dz, { pose: 'sit', ry, table: i, spot: true });
    furn('diningChair', tx + dx * 1.05, tz + dz * 1.05, ry, { solid: false });
    t.seats.push(id);
    SEATS.push(id);
  }
  TABLES.push(t);
});
const AISLE_Z = { n: -1.9, m: 2.9, s: 7.2 };
const aisles = { n: new Map(), m: new Map(), s: new Map() };
const aisle = (row, x) => {
  const key = x.toFixed(2);
  if (!aisles[row].has(key)) aisles[row].set(key, node(`ais_${row}_${key}`, x, AISLE_Z[row]));
  return aisles[row].get(key);
};
for (const t of TABLES) {
  link(`seat${t.i}N`, aisle(t.z < 3 ? 'n' : 'm', t.x));
  link(`seat${t.i}S`, aisle(t.z < 3 ? 'm' : 's', t.x));
  link(`seat${t.i}W`, aisle('m', t.x - 1));
  link(`seat${t.i}E`, aisle('m', t.x + 1));
}
for (const row of ['n', 'm', 's']) { aisle(row, -28.4); aisle(row, -11.3); }
aisle('n', -14.5);
for (const row of ['n', 'm', 's']) {
  chain([...aisles[row].entries()].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])).map(e => e[1]));
}
node('din_door', -11.3, 1.0);
chain([aisle('n', -28.4), aisle('m', -28.4), aisle('s', -28.4)]);
chain([aisle('n', -11.3), 'din_door', aisle('m', -11.3), aisle('s', -11.3)]);
furn('buffet', -29.4, 2.6, PI / 2, { w: 5, d: 0.8 });
furn('hostStand', -11.8, 4.6, -PI / 2, { w: 0.7, d: 0.5 });
for (const [x, z] of [[-29.2, -2.3], [-29.2, 7.3], [-10.8, 7.3]]) furn('plant', x, z, 0, { w: 0.7, d: 0.7 });
furn('chandelier', -20.5, 2.9, 0, {});
furn('painting', -20.5, 7.84, PI, { y: 1.9, seed: 3, big: true });
sign('BREAKFAST 6–10 AM', -19.4, 2.75, -2.84, 0, 2.6, 0.4);

// ---------- kitchen ----------
// Fridge doors from north to south, the same order as their stations.
const FRIDGE_DOORS = [['egg', 'egg_raw', 'Eggs'], ['batter', 'batter', 'Pancake Batter'], ['bacon', 'bacon_raw', 'Bacon'], ['cheese', 'cheese', 'Cheese'], ['blood', 'blood', 'Blood Bags']];
const DOOR_LABEL = { egg: 'EGGS', batter: 'BATTER', bacon: 'BACON', cheese: 'CHEESE', blood: 'BLOOD' };
furn('counter', -28.45, -10.45, 0, { w: 2.5, d: 0.8 });
// Turned a quarter turn, the fridge's local +x runs south to north, so its labels go in reverse.
furn('fridge', -29.2, -7.55, PI / 2, { w: 4.5, d: 1.2, labels: FRIDGE_DOORS.map(d => DOOR_LABEL[d[0]]).reverse() });
furn('stove', -22.6, -10.45, 0, { w: 4.0, d: 0.8 });
furn('counter', -24.9, -10.45, 0, { w: 0.6, d: 0.8 });
furn('sinkCounter', -18.55, -10.45, 0, { w: 4.1, d: 0.8 });
furn('counter', -13.4, -10.45, 0, { w: 6.2, d: 0.8 });
furn('coffeeMachine', -12.2, -10.5, 0, { y: 0.95 });
furn('breadBox', -16.0, -10.45, 0, {});
furn('toaster', -15.0, -10.45, 0, {});
furn('juicer', -13.8, -10.45, 0, {});
furn('trayStack', -10.9, -10.45, 0, { on: 'trays_ok' });
furn('cocoaPot', -20.05, -10.45, 0, {});
furn('dishwasher', -19.75, -10.45, 0, { on: 'dishwasher' });
furn('waffleIron', -17.15, -10.45, 0, { on: 'waffle' });
furn('island', -20.5, -6.6, 0, { w: 6, d: 1.2 });
furn('cooktop', -21.4, -6.6, 0, { on: 'stove2' });
furn('plateRack', -18.2, -6.6, 0, {});
furn('potRack', -20.5, -6.6, 0, {});
furn('trashCan', -16.6, -6.6, 0, { w: 0.5, d: 0.5 });
furn('hood', -22.6, -10.6, 0, {});
furn('heatLamps', -22.6, -10.2, 0, { on: 'warmers' });
furn('suppression', -22.6, -10.6, 0, { on: 'suppress' });
furn('kitchenShelf', -25.6, -3.3, PI, { w: 3.6, d: 0.35, solid: false });
// The pass: a hatch to the dining room. Cooks set plates on it, servers take them from the other side.
furn('passCounter', -19.4, -3, 0, { w: 2.0, d: 0.7 });
furn('ticketRail', -19.4, -3.17, PI, {});
sign('FIRE EXTINGUISHER', -23.52, 0.72, -6.6, -PI / 2, 0.9, 0.16, { color: '#ffffff', bg: '#9b0000' });
FRIDGE_DOORS.forEach(([id, item, label], i) => station(`fridge_${id}`, 'fridge', -28.5, 1.25, -9.35 + i * 0.9, 0.4, { item, label }));
station('cocoa', 'cocoa', -20.05, 1.15, -10.45, 0.36);
station('sink', 'sink', -18.55, 1.0, -10.4, 0.45);
station('waffle', 'stove', -17.15, 1.05, -10.45, 0.36, { idx: 9, waffle: true, on: 'waffle' });
station('pass', 'pass', -19.4, 1.05, -3, 0.55);
for (let i = 0; i < 4; i++) station(`stove${i}`, 'stove', -24.1 + i, 1.0, -10.45, 0.38, { idx: i });
for (let i = 0; i < 4; i++) station(`stove${4 + i}`, 'stove', -22.9 + i, 1.0, -6.6, 0.38, { idx: 4 + i, on: 'stove2' });
station('toaster', 'stove', -15.0, 1.05, -10.45, 0.36, { idx: 8, toaster: true });
station('bread', 'fridge', -16.0, 1.05, -10.45, 0.36, { item: 'bread', label: 'Bread' });
station('juicer', 'juice', -13.8, 1.15, -10.4, 0.38);
station('coffee', 'coffee', -12.2, 1.15, -10.35, 0.42);
station('trays', 'trays', -10.9, 1.05, -10.45, 0.38, { on: 'trays_ok' });
station('ktrash', 'trash', -16.6, 0.7, -6.6, 0.45);
sign('KITCHEN — STAFF ONLY', -14.5, 2.7, -3.16, PI, 2.4, 0.34, { color: '#ffdddd', bg: '#6b0000' });

// ---------- laundry & utility ----------
furn('washers', -29.4, -15.5, PI / 2, { w: 3.8, d: 0.8 });
furn('towelShelf', -20.55, -15.0, -PI / 2, { w: 2.8, d: 0.7 });
furn('foldTable', -25.2, -15.0, 0, { w: 2.5, d: 1.2 });
station('towels', 'shelf', -21.05, 1.1, -15.0, 0.65, { item: 'towels', label: 'Towels' });
// The Security Office (where the old utility room was): a bank of monitors, the night phone and a
// framed newspaper from 1926 nobody has taken down.
furn('cctvDesk', -26.2, -28.35, 0, { w: 3.4, d: 0.9 });
furn('officeChair', -26.2, -27.2, PI, {});
furn('deskPhone', -28.25, -28.3, 0, { y: 0.78 });
furn('fileCabinet', -29.45, -23.4, PI / 2, { w: 0.6, d: 0.7 });
furn('newsClipping', -29.83, -25.6, PI / 2, { y: 1.65 });
furn('batteryShelf', -22.25, -28.55, 0, { w: 2.5, d: 0.55 });
furn('generator', -23.6, -26.6, 0, { on: 'generator', w: 1.4, d: 0.9 });
furn('bulb', -25, -25.5, 0, {});
station('cctv', 'cctv', -26.2, 1.25, -27.95, 0.7);
station('phone2', 'phone', -28.25, 0.95, -28.2, 0.35);
station('batteries', 'shelf', -22.25, 1.15, -28.1, 0.6, { item: 'battery', label: 'Batteries' });
furn('towelCabinet', -2.9, -18.42, PI, { on: 'chute', w: 1.2, d: 0.45 });
station('towels2', 'shelf', -2.9, 1.1, -18.9, 0.6, { item: 'towels', label: 'Towels', on: 'chute' });
sign('SECURITY', -22.5, 2.6, -21.84, 0, 1.3, 0.3);
sign('LAUNDRY', -22.5, 2.6, -18.16, PI, 1.2, 0.3);

// ---------- break room & storage ----------
furn('lockers', 29.5, -15.2, -PI / 2, { w: 4.5, d: 0.6 });
furn('staffTable', 25, -14.5, 0, { w: 3, d: 1.4 });
furn('couch', 20.6, -15.5, PI / 2, { w: 3, d: 0.85 });
furn('corkboard', 27.5, -17.84, 0, { y: 1.6 });
furn('terminal', 22.3, -17.84, 0, { y: 1.15 });
station('letter', 'letter', 27.5, 1.6, -17.6, 0.6);
station('terminal', 'terminal', 22.3, 1.35, -17.6, 0.5);
furn('energyFridge', 21.2, -11.7, PI, { on: 'energy', w: 0.8, d: 0.6 });
furn('shelf', 22.25, -28.5, 0, { w: 2.5, d: 0.6 });
furn('shelf', 27.75, -28.5, 0, { w: 3.5, d: 0.6 });
furn('shelf', 26, -25.3, 0, { w: 3, d: 0.6 });
furn('basementDoor', 29.83, -23.9, -PI / 2, {});
station('bsm_door', 'cellarDoor', 29.55, 1.3, -23.9, 0.6);
sign('BREAK ROOM', 24, 2.6, -18.16, PI, 1.4, 0.3);
sign('STORAGE', 24, 2.6, -21.84, 0, 1.2, 0.3);
sign('DO NOT OPEN', 29.8, 2.45, -23.9, -PI / 2, 1.3, 0.3, { color: '#ffdddd', bg: '#6b0000' });

// ---------- pool ----------
for (const x of [15.5, 18.5, 21.5, 24.5]) {
  furn('lounger', x, 6.7, PI, { solid: false });
  furn('lounger', x, -9.4, 0, { solid: false });
}
for (const x of [17, 23]) furn('umbrella', x, 7.1, 0, { solid: false });
furn('lifeguardChair', 10.9, 0.8, PI / 2, { solid: false });
for (const [x, z] of [[10.8, 7.2], [29.2, 7.2], [29.2, -10.2]]) furn('plant', x, z, 0, { w: 0.7, d: 0.7 });
furn('hotTub', 29.0, 1.0, 0, { on: 'spa', w: 2.0, d: 2.0 });
furn('chlorinator', 11.0, -6.0, PI / 2, { on: 'chlorine', w: 0.6, d: 0.6 });
sign('NO DIVING', 20, 2.3, -10.84, 0, 1.6, 0.36, { color: '#ffffff', bg: '#b3261e' });
sign('POOL HOURS: WHENEVER', 29.84, 2.3, -5, -PI / 2, 2.2, 0.32, { color: '#103040', bg: '#cfeef7' });

// ---------- upgrade fixtures around the building ----------
for (const c of CAMERAS) if (c.id !== 'back') furn('camera', c.x, c.z, Math.atan2(c.tx - c.x, c.tz - c.z), { y: c.y, on: c.on, gate: c.on });
furn('cameraPole', -9, -42, Math.atan2(9, 12), {});
for (const x of [-26, -16, -6, 6, 16, 26]) furn('uvTube', x, -20, 0, { on: 'uv', y: 3.08 });
for (const x of [-21, -11, -1, 11, 21]) furn('sprinkler', x, -20.6, 0, { on: 'holy', y: 3.14 });

// ---------- outside: the hotel frontage ----------
furn('canopy', 0, 12.6, 0, {});
for (const x of [-11.6, -4.2, 4.2, 11.6]) furn('column', x, 16.95, 0, { w: 0.7, d: 0.7 });
furn('tower', 0, BUILDING.z2, 0, {});
furn('bladeSign', -12.7, BUILDING.z2 + 0.15, 0, {});
furn('redCarpet', 0, 9.2, 0, { solid: false });
for (const s of [-1, 1]) {
  furn('topiary', 3.1 * s, 8.75, 0, { w: 0.7, d: 0.7 });
  furn('bench', 8.4 * s, 9.75, 0, { w: 1.6, d: 0.55 });
  furn('hedge', 21 * s, 8.8, 0, { w: 15, d: 0.8 });
  furn('sconce', 2.85 * s, BUILDING.z2 + 0.17, 0, { y: 2.3, outdoor: true });
}
for (const x of [-16.2, -17.8, -19.4]) furn('flagpole', x, 10.0, 0, { w: 0.3, d: 0.3, seed: Math.round(-x * 10) });
furn('dumpster', -32.4, -3.5, PI / 2, { w: 3, d: 1.6 });
// The breaker box is outside, on the back wall: a long cold walk round the building in a blackout.
furn('breaker', 0, -29.3, PI, {});
furn('sconce', 1.0, -29.17, PI, { y: 2.4, outdoor: true });
station('breaker', 'breaker', 0, 1.4, -29.65, 0.6);
furn('fence', -33.7, -3.5, PI / 2, { w: 4.8 });
station('dumpster', 'dumpster', -31.3, 1.35, -3.5, 1.0);
furn('valetPodium', 4.6, 9.5, 0, { w: 0.6, d: 0.5 });
for (const bx of [-2.0, -0.8, 0.8, 2.0]) furn('bollard', bx, 9.4, 0, { w: 0.3, d: 0.3, who: 'car' });
for (const [x, z] of [[-31.5, 18.5], [31.5, 18.5], [-31.5, 36.5], [31.5, 36.5], [-15.5, 10.2], [15.5, 10.2]]) {
  LAMPS.push({ x, z });
  furn('lamp', x, z, 0, { w: 0.35, d: 0.35 });
}
// snowy pines all around, thinning out toward the mountains
for (const [x, z] of [[-36, 19], [-37, 27], [-36, 34], [36, 19], [37, 27], [36, 34], [-24, 42], [-10, 44], [6, 42], [20, 45], [34, 41],
  [-34, 48], [0, 54], [26, 56], [-20, 58], [50, 27], [54, 36], [42, 46], [-46, 26], [-58, 36], [-40, 40],
  [-50, -36], [-38, -38], [-24, -35], [-10, -37], [4, -35], [18, -38], [32, -35], [46, -37], [60, -33], [-62, -30],
  [38, -24], [44, -14], [40, -4], [48, 5], [56, -20], [62, -6], [70, 8], [-36, -22], [-44, -16], [-72, -14], [-74, 2], [-72, 18], [-36.5, 5.5]]) {
  TREES.push({ x, z });
  furn('tree', x, z, 0, { w: 0.8, d: 0.8 });
}
// banks of plowed snow along the road and around the lot
for (const [x, z, w, ry] of [[-68, 9.8, 54, 0], [68, 9.8, 54, 0], [-64, 17.6, 62, 0], [64, 17.6, 62, 0], [-31.2, 27, 19, PI / 2], [31.2, 27, 19, PI / 2], [0, 37.8, 62, 0]]) furn('snowbank', x, z, ry, { w, d: 1.4, solid: false });
for (const [x, z, w, ry] of [[-15, -29.9, 24, 0], [15, -29.9, 24, 0], [-30.9, -20, 16, PI / 2], [30.9, -20, 16, PI / 2]]) furn('snowbank', x, z, ry, { w, d: 0.9, low: true, solid: false });
// the hedge maze, closed for the winter
{
  const M = HEDGE_MAZE, cw = (M.x2 - M.x1) / 8, ch = (M.z2 - M.z1) / 5;
  const mx = c => M.x1 + c * cw, mz = r => M.z1 + r * ch;
  const H = (r, a, b) => furn('mazeHedge', (mx(a) + mx(b)) / 2, mz(r), 0, { w: mx(b) - mx(a) + 0.8, d: 0.8 });
  const V = (c, a, b) => furn('mazeHedge', mx(c), (mz(a) + mz(b)) / 2, PI / 2, { w: mz(b) - mz(a) + 0.8, d: 0.8 });
  // [line, from, to]: hedges along a row line (between cell rows) or a column line. Every cell connects;
  // the winding route from the east gate ends at the statue in the middle.
  const rows = [[0, 0, 8], [5, 0, 3], [5, 4, 8], [1, 1, 4], [1, 5, 6], [2, 2, 7], [3, 1, 5], [3, 6, 7], [4, 1, 7]];
  const cols = [[0, 0, 5], [8, 0, 2], [8, 3, 5], [1, 1, 4], [4, 0, 1], [5, 1, 3], [7, 1, 2], [7, 3, 4]];
  rows.forEach(w => H(...w));
  cols.forEach(w => V(...w));
  furn('mazeStatue', mx(4.5), mz(2.5), 0, { w: 1.2, d: 1.2 });
  // A node in every cell, linked wherever no hedge stands between neighbours (lost children find it).
  const cell = (c, r) => `mz_${c}_${r}`;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) {
    const statue = c === 4 && r === 2; // the statue fills the middle of this dead end
    node(cell(c, r), mx(c + 0.5) - (statue ? 1.05 : 0), mz(r + 0.5), statue ? { ry: PI / 2 } : {});
  }
  const walled = (list, line, i) => list.some(([l, a, b]) => l === line && i >= a && i < b);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) {
    if (c < 7 && !walled(cols, c + 1, r)) link(cell(c, r), cell(c + 1, r));
    if (r < 4 && !walled(rows, r + 1, c)) link(cell(c, r), cell(c, r + 1));
  }
  node('maze_out', mx(8) + 1.4, mz(2.5) - 1.6);
  node('maze_turn', -37.3, mz(2.5) - 1.6);
  node('maze_path', -37.3, 8.6);
  chain([cell(7, 2), 'maze_out', 'maze_turn', 'maze_path']); // joins the street once that exists
  furn('postSign', mx(8) + 1.4, mz(2.5) + 1.8, PI / 2, { text: 'HEDGE MAZE · CLOSED FOR THE WINTER' });
}
furn('vacancySign', 33.5, 18.6, 0, { w: 3, d: 0.5 });
furn('billboard', 46, 20, -0.35, { on: 'billboard', w: 6, d: 0.6 });
sign('VALET', 4.6, 1.25, 9.78, 0, 0.55, 0.22, { color: '#ffffff', bg: '#7a1f2b' });

// world bounds
collider(WORLD.x2, WORLD.z1 - 5, WORLD.x2 + 5, WORLD.z2 + 5);
collider(WORLD.x1 - 5, WORLD.z1 - 5, WORLD.x1, WORLD.z2 + 5);
collider(WORLD.x1, WORLD.z1 - 5, WORLD.x2, WORLD.z1);
collider(WORLD.x1, WORLD.z2, WORLD.x2, WORLD.z2 + 5);

for (let i = 0; i < 16; i++) {
  const x = -26.25 + 3.5 * i;
  PARKING.push({ id: `A${i + 1}`, x, z: 21.8, ry: PI });
  PARKING.push({ id: `B${i + 1}`, x, z: 32.2, ry: 0 });
}
DROPS.push({ x: -7, z: 13.2, ry: -PI / 2 }, { x: 0, z: 13.2, ry: -PI / 2 }, { x: 7, z: 13.2, ry: -PI / 2 });
LUGGAGE_SPOTS.push([2.3, -6.3], [2.3, -5.4], [1.4, -6.3], [1.4, -5.4], [2.3, -4.5], [1.4, -4.5], [0.5, -6.3], [0.5, -5.4], [0.5, -4.5]);
TOOL_HOMES.push(
  { t: 'mop', x: -8.0, z: -10.3 }, { t: 'mop', x: -7.25, z: -10.3 }, { t: 'net', x: -6.4, z: -10.3 },
  { t: 'plunger', x: -5.4, z: -10.3 }, { t: 'mop', x: -29.3, z: -12.0 }, { t: 'plunger', x: -28.5, z: -12.0 },
  { t: 'net', x: 11.0, z: -10.35 }, { t: 'extinguisher', x: -23.95, z: -6.6 },
  { t: 'medkit', x: 12.3, z: -10.45 }, { t: 'medkit', x: -4.45, z: -10.45 },
);
furn('firstAid', 12.3, -10.83, 0, {});
furn('firstAid', -4.45, -10.83, 0, {});
EXTRA_TOOL_HOMES.push({ t: 'mop', x: 24.6, z: -12.4 }, { t: 'mop', x: -0.7, z: -24.3 }, { t: 'net', x: 12.6, z: 7.4 }, { t: 'plunger', x: 0.7, z: -24.3 });

// Where helpers stand while they wait for work.
export const HELPER_HOMES = {
  roomba: [[-6.0, -9.6], [-5.2, -9.6], [-4.4, -9.6], [-3.0, -9.6]],
  skimmer: [[20, -2]],
  valet: [[5.4, 9.8]],
  bellhop: [[1.2, -8.8], [0.4, -8.8]],
  housekeeper: [[-23.4, -12.6], [-24.6, -12.8]],
  chef: [[-19.8, -8.8]],
  busboy: [[-17.8, -8.8]],
  towelbot: [[-21.8, -16.8]],
  electrician: [[22.4, -16.6]],
  guard: [[26.4, -16.8]],
  doorman: [[-3.6, 9.7]],
};
// Where a helper stands to use a station that sits on a counter.
export const APPROACH = {
  fridge_egg: [-27.7, -9.35], fridge_batter: [-27.7, -8.45], fridge_bacon: [-27.7, -7.55], fridge_cheese: [-27.7, -6.65], fridge_blood: [-27.7, -5.75],
  cocoa: [-20.05, -9.6], sink: [-18.55, -9.6], waffle: [-17.15, -9.6], pass: [-19.4, -3.9],
  stove0: [-24.1, -9.6], stove1: [-23.1, -9.6], stove2: [-22.1, -9.6], stove3: [-21.1, -9.6],
  stove4: [-22.9, -7.75], stove5: [-21.9, -7.75], stove6: [-20.9, -7.75], stove7: [-19.9, -7.75],
  toaster: [-15.0, -9.6], bread: [-16.0, -9.6], juicer: [-13.8, -9.6], coffee: [-12.2, -9.6],
  towels: [-21.8, -15.0], towels2: [-2.9, -19.4], breaker: [0, -30.5], batteries: [-22.25, -27.7],
};

// ---------- navigation: outside & lobby ----------
node('door_in', 0, 6.6);
node('door_out', 0, 9.0);
node('curb_w', -7, 10.4);
node('curb_c', 0, 10.4);
node('curb_e', 7, 10.4);
node('walk_w', -15, 9.3);
node('walk_e', 15, 9.3);
node('street_w', -36, 9.3);
node('street_e', 36, 9.3);
chain(['street_w', 'walk_w', 'curb_w', 'curb_c', 'curb_e', 'walk_e', 'street_e']);
link('maze_path', 'street_w');
// round either side of the building to the breaker box at the back
node('out_e1', 33, 2);
node('out_e2', 33, -14);
node('out_e3', 33, -31);
node('out_n1', 16, -31.4);
node('out_w1', -35.4, 0);
node('out_w2', -34.4, -14);
node('out_w3', -33, -31);
node('out_n2', -16, -31.4);
node('breaker_out', 0, -30.6);
chain(['street_e', 'out_e1', 'out_e2', 'out_e3', 'out_n1', 'breaker_out']);
chain(['street_w', 'out_w1', 'out_w2', 'out_w3', 'out_n2', 'breaker_out']);
link('door_out', 'curb_c');
link('door_in', 'door_out');

node('lob_c', 0, 1.5);
node('lob_w', -6.2, 1.0);
node('lob_sofa', -6.2, 5.7);
node('lob_nw', -8.3, -8.2);
node('lob_nw2', -7.9, -4.2);
node('lob_n', 0, -8.6);
node('lob_pool', 8.4, 3.5);
for (let i = 0; i < 7; i++) QUEUE.push(node(`q${i}`, 6.0, -6.0 + i * 1.1, { ry: PI, queue: true })); // only for queuing, not a shortcut
chain(QUEUE);
link('door_in', 'lob_c');
link('door_in', 'lob_sofa');
link('lob_c', 'lob_w');
link('lob_c', 'lob_n');
link('lob_c', 'q6');
link('lob_c', 'lob_pool');
link('lob_pool', 'q6');
link('lob_w', 'lob_sofa');
link('lob_w', 'din_door');
link('lob_w', 'lob_nw2');
link('lob_nw2', 'lob_nw');
link('lob_nw', 'lob_n');
link('lob_n', 'conn');
const sofaA = [[-8.85, 4.8], [-8.1, 4.8], [-7.35, 4.8]].map(([x, z], i) => node(`sofaA${i}`, x, z, { pose: 'sit', ry: 0, spot: true }));
sofaA.forEach(id => link(id, 'lob_sofa'));
const sofaArm = node('sofaArm', -5.6, 6.4, { pose: 'sit', ry: -PI / 2, spot: true });
link(sofaArm, 'lob_sofa');
const sofaB = [[-9.2, -5.0], [-9.2, -4.2], [-9.2, -3.4]].map(([x, z], i) => node(`sofaB${i}`, x, z, { pose: 'sit', ry: PI / 2, spot: true }));
sofaB.forEach(id => link(id, 'lob_nw2'));
SOFAS.push(...sofaA, sofaArm, ...sofaB);
node('desk_back', 6.6, -9.3, { staff: true });
link('desk_back', 'lob_n');
node('kiosk', 8.5, -2.7, { on: 'kiosk', ry: PI / 2 });
link('kiosk', 'q3');
link('kiosk', 'lob_pool');
node('keybox', 3.2, -5.9, { on: 'express', ry: PI });
link('keybox', 'q0');
link('keybox', 'lob_c');
node('gift', 7.7, 6.4, { on: 'giftshop', ry: PI / 2 });
link('gift', 'door_in');
link('gift', 'lob_pool');

// kitchen, laundry, utility
node('kit_e', -11.4, -8.2);
node('kit_c', -15.2, -8.7);
node('kit_w', -24.2, -8.7);
node('kit_l', -26.2, -9.7);
node('kit_pass', -14.5, -4.2);
chain(['kit_e', 'kit_c', 'kit_w', 'kit_l']);
link('kit_c', 'kit_pass');
link('kit_pass', aisle('n', -14.5));
link('lob_nw', 'kit_e');
node('laun_in', -22.5, -16.6);
node('laun_c', -22.6, -13.0);
node('laun_k', -26.2, -12.2);
chain(['h-22.5', 'laun_in', 'laun_c', 'laun_k', 'kit_l']);
node('util_in', -22.5, -23.4);
node('util_c', -26.0, -24.6);
chain(['h-22.5', 'util_in', 'util_c']);
node('cctv_seat', -26.2, -27.2, { ry: 0 });
link('util_c', 'cctv_seat');

// break room & storage
node('staff_in', 24, -16.6);
node('staff_e', 27.6, -16.0);
node('staff_p', 25.8, -12.1);
chain(['h24', 'staff_in', 'staff_e', 'staff_p']);
node('stor_in', 24, -23.4);
node('stor_c', 22.4, -26.6);
node('basement', BASEMENT.x, BASEMENT.z);
chain(['h24', 'stor_in', 'basement']);
link('stor_in', 'stor_c');

// pool
node('pool_in', 11.6, 3.5);
const ring = [['pd_sw', 12, 5.0], ['pd_s1', 17, 4.7], ['pd_s2', 23, 4.7], ['pd_se', 27, 4.7], ['pd_e', 27, -2],
  ['pd_ne', 27, -8.0], ['pd_n2', 23, -8.0], ['pd_n1', 17, -8.0], ['pd_nw', 12, -8.0], ['pd_w', 12, -2]];
for (const [id, x, z] of ring) node(id, x, z);
chain([...ring.map(r => r[0]), 'pd_sw']);
link('pool_in', 'pd_sw');
link('pool_in', 'pd_w');
link('pool_in', 'lob_pool');
node('pool_staff', 25.8, -9.9);
link('pool_staff', 'pd_ne');
link('pool_staff', 'pd_n2');
link('pool_staff', 'staff_p');
[15.5, 18.5, 21.5, 24.5].forEach((x, i) => {
  LOUNGERS.push(node(`lng_s${i}`, x, 5.85, { pose: 'lie', ry: PI, y: 0.5, spot: true }));
  link(`lng_s${i}`, x < 20 ? 'pd_s1' : 'pd_s2');
  LOUNGERS.push(node(`lng_n${i}`, x, -8.55, { pose: 'lie', ry: 0, y: 0.5, spot: true }));
  link(`lng_n${i}`, x < 20 ? 'pd_n1' : 'pd_n2');
});
[[16.5, -4.5, ['pd_n1']], [20, -4.5, ['pd_n1', 'pd_n2']], [23.5, -4.5, ['pd_n2']],
  [16.5, 0.6, ['pd_s1']], [20, 0.6, ['pd_s1', 'pd_s2']], [23.5, 0.6, ['pd_s2']]].forEach(([x, z, links], i) => {
  SWIMS.push(node(`swim${i}`, x, z, { pose: 'swim', ry: i * 1.3, y: POOL.floorY + 0.35, spot: true }));
  for (const l of links) link(`swim${i}`, l);
});
[[28.6, 0.5], [29.3, 1.6]].forEach(([x, z], i) => {
  SPA_SPOTS.push(node(`spa${i}`, x, z, { on: 'spa', pose: 'swim', y: -0.45, ry: -PI / 2, spot: true }));
  link(`spa${i}`, 'pd_e');
  link(`spa${i}`, 'pd_se');
});
[-1.62, 1.62].forEach((x, i) => {
  ARCADE_SPOTS.push(node(`arc${i}`, x, -27.6, { on: 'arcade', ry: PI, spot: true }));
  link(`arc${i}`, 'elev');
});

WANDER.push('lob_c', 'lob_w', 'lob_pool', 'h-12.6', 'h-6.6', 'h3.4', 'h9.4', 'elev', 'pd_sw', 'pd_n1', 'pd_se', 'din_door', 'curb_c');

// ---------- upper floors ----------
// Each storey repeats the ground floor's twelve rooms above the tower, with a linen closet, a
// housekeeping closet, an elevator lobby and a landing. The second floor ends in the presidential
// suite, the third in the lounge.
function buildFloor(F) {
  const o = F.f * FLOOR_DX, X = x => x + o, n = F.f + 1;
  GATE = F.flag;
  ZONES.push(
    { id: 'hall', name: `${F.name} Hallway`, x1: X(-30), z1: -22, x2: X(20), z2: -18, floor: 'carpet', wall: 'hall', pub: true, wing: F.flag },
    { id: 'hall', name: `${F.name} Landing`, x1: X(-2), z1: -18, x2: X(2), z2: -11, floor: 'carpet', wall: 'hall', pub: true, wing: F.flag },
    { id: 'elev', name: 'Elevators', x1: X(-2), z1: -29, x2: X(2), z2: -22, floor: 'carpet', wall: 'hall', pub: true, wing: F.flag },
    { id: 'linen', name: 'Linen Closet', x1: X(-30), z1: -29, x2: X(-20), z2: -22, floor: 'tile', wall: 'plain', wing: F.flag },
    { id: 'closet', name: 'Housekeeping Closet', x1: X(-30), z1: -18, x2: X(-20), z2: -11, floor: 'tile', wall: 'plain', wing: F.flag },
  );
  if (F.f === 2) ZONES.push({ id: 'lounge', name: 'The Lounge', x1: X(20), z1: -29, x2: X(30), z2: -11, floor: 'wood', wall: 'lounge', pub: true, wing: F.flag });
  const gaps = [[-23.3, -21.7], ...MAIN_CX.map(cx => [doorX(cx) - 0.6, doorX(cx) + 0.6]), [-2, 2]].map(([a, b]) => [X(a), X(b)]);
  hWall(-29, X(-30), X(30));
  hWall(-11, X(-30), X(30));
  vWall(X(-30), -29, -11);
  vWall(X(30), -29, -11);
  hWall(-22, X(-30), X(20), gaps);
  hWall(-18, X(-30), X(20), gaps);
  for (const x of [-20, -14, -8, -2, 2, 8, 14]) { vWall(X(x), -29, -22); vWall(X(x), -18, -11); }
  vWall(X(20), -29, -11, [[-21.2, -18.8]]);
  const first = ROOMS.length;
  MAIN_CX.forEach((cx, i) => ROOMS.push(makeRoom(String(F.first + i), X(cx), 'N', F.flag)));
  MAIN_CX.forEach((cx, i) => ROOMS.push(makeRoom(String(F.first + 6 + i), X(cx), 'S', F.flag)));
  const xs = [...MAIN_CX.map(cx => doorX(X(cx))), X(-26.4), X(-22.5), X(0), X(18.6)].sort((a, b) => a - b);
  const hall = xs.map(x => node(`h${x}`, x, -20));
  chain(hall);
  for (const r of ROOMS.slice(first)) link(r.hall, `r${r.id}_in`);
  const hAt = x => hall[xs.indexOf(xs.reduce((b, v) => (Math.abs(v - X(x)) < Math.abs(b - X(x)) ? v : b)))];
  node(`elev@${n}`, X(0), -25.4, { ry: PI, lift: true });
  link(`elev@${n}`, hAt(0));
  node(`land@${n}`, X(0), -14.2);
  link(`land@${n}`, hAt(0));
  node(`lin_in@${n}`, X(-22.5), -23.4);
  node(`lin_c@${n}`, X(-26), -25.6);
  chain([hAt(-22.5), `lin_in@${n}`, `lin_c@${n}`]);
  node(`clo_in@${n}`, X(-22.5), -16.6);
  node(`clo_c@${n}`, X(-26), -14.4);
  chain([hAt(-22.5), `clo_in@${n}`, `clo_c@${n}`]);
  WANDER.push(`land@${n}`, hAt(-12.6), hAt(9.4));
  PATROL.push(hAt(-26.4), hAt(-12.6), hAt(0), hAt(15.4), `land@${n}`);
  station(`elev_${F.f}`, 'elevator', X(1.45), 1.2, -28.7, 0.4, { floor: F.f });
  station(`towels@${n}`, 'shelf', X(-28.9), 1.1, -25.5, 0.65, { item: 'towels', label: 'Towels' });
  APPROACH[`towels@${n}`] = [X(-28.2), -25.5];
  DOORS.push({ x: X(-22.5), z: -22, axis: 'x', w: 1.6, label: 'LINEN', wing: F.flag }, { x: X(-22.5), z: -18, axis: 'x', w: 1.6, label: 'HOUSEKEEPING', wing: F.flag });
  // furniture
  furn('elevator', X(0), -28.85, 0);
  furn('iceMachine', X(1.55), -26.4, -PI / 2, { w: 1.0, d: 0.8 });
  furn('plant', X(-1.5), -26.4, 0, { w: 0.7, d: 0.7 });
  furn('towelShelf', X(-29.4), -25.5, PI / 2, { w: 2.8, d: 0.7 });
  furn('shelf', X(-25), -28.5, 0, { w: 3, d: 0.6 });
  furn('shelf', X(-25), -11.5, PI, { w: 3, d: 0.6 });
  furn('toolRack', X(-28.2), -11.28, PI, { w: 2.2, d: 0.25 });
  FLOOR_TOOL_HOMES.push({ id: `mop@${n}`, t: 'mop', x: X(-28.9), z: -11.65, flag: F.flag }, { id: `plunger@${n}`, t: 'plunger', x: X(-27.5), z: -11.65, flag: F.flag });
  furn('bench', X(0), -11.6, PI, { w: 1.6, d: 0.55 });
  for (const s of [-1, 1]) furn('plant', X(1.4 * s), -12.0, 0, { w: 0.7, d: 0.7 });
  furn('painting', X(-1.84), -14.5, PI / 2, { y: 1.9, seed: 3 + n });
  for (const x of [-17, -9, 9, 17]) { furn('sconce', X(x), -21.8, 0, { y: 2.2 }); furn('sconce', X(x), -18.2, PI, { y: 2.2 }); }
  furn('exitSign', X(-29.8), -20, PI / 2, { y: 2.6 });
  for (const x of [-26, -16, -6, 6, 16]) furn('uvTube', X(x), -20, 0, { on: 'uv', y: 3.08 });
  for (const x of [-21, -11, -1, 11]) furn('sprinkler', X(x), -20.6, 0, { on: 'holy', y: 3.14 });
  for (const [x, ry] of [[-29.6, PI / 2], [19.6, -PI / 2]]) furn('camera', X(x), -21.7, ry, { on: 'cameras', y: 2.95 });
  sign(`ROOMS ${F.first}–${F.first + 11}`, X(0), 2.75, -21.84, 0, 2.3, 0.4);
  sign(F.name.toUpperCase(), X(0), 2.75, -18.16, PI, 2.2, 0.36);
  sign('LINEN', X(-22.5), 2.6, -21.84, 0, 1.0, 0.3);
  sign('HOUSEKEEPING', X(-22.5), 2.6, -18.16, PI, 1.6, 0.3);
  // exterior windows
  for (const cx of MAIN_CX) {
    WINDOWS.push({ x: X(cx) + 1.95, z: -29, axis: 'x', w: 1.5, side: -1, wing: F.flag });
    WINDOWS.push({ x: X(cx) + 1.95, z: -11, axis: 'x', w: 1.5, side: 1, wing: F.flag });
  }
  WINDOWS.push({ x: X(0), z: -11, axis: 'x', w: 1.4, side: 1, wing: F.flag });
  for (const z of [-25.5, -14.5]) WINDOWS.push({ x: X(-30), z, axis: 'z', w: 1.5, side: -1, wing: F.flag });
  for (const z of [-26, -20, -14]) WINDOWS.push({ x: X(30), z, axis: 'z', w: 1.8, side: 1, wing: F.flag });
  for (const x of F.f === 1 ? [22.4, 27.8] : [22.5, 27.5]) WINDOWS.push({ x: X(x), z: -29, axis: 'x', w: F.f === 1 ? 1.5 : 2.4, side: -1, wing: F.flag });
  for (const x of [22.5, 27.5]) WINDOWS.push({ x: X(x), z: -11, axis: 'x', w: 1.8, side: 1, wing: F.flag });

  if (F.f === 1) { // the presidential suite, sealed until it's bought
    collider(X(19.85), -21.2, X(20.15), -18.8, 'all', { off: 'pres' });
    furn('barrier', X(20), -20, -PI / 2, { off: 'pres', w: 2.4, label: 'PRESIDENTIAL SUITE' });
    GATE = 'pres';
    const pres = makePres();
    pres.hall = hAt(18.6);
    ROOMS.push(pres);
    link(pres.hall, 'rPRES_in');
    DOORS.push({ x: X(20), z: -20, axis: 'z', w: 2.4, room: 'PRES', double: true, wing: 'pres' });
    GATE = F.flag;
  }
  if (F.f === 2) { // the lounge: a roaring fire, deep sofas and a typewriter nobody admits to using
    node(`lng_in@${n}`, X(21.6), -20);
    node(`lng_c@${n}`, X(24), -20);
    chain([hAt(18.6), `lng_in@${n}`, `lng_c@${n}`]);
    WANDER.push(`lng_c@${n}`);
    furn('fireplace', X(29.45), -20, -PI / 2, { w: 3.0, d: 0.9 });
    furn('rug', X(25.5), -20, 0, { rw: 5.2, rd: 6.0, color: '#7a2a18' });
    furn('sofa', X(26), -23.4, 0, { w: 2.8, d: 0.9, color: '#8a4a26' });
    furn('sofa', X(26), -16.6, PI, { w: 2.8, d: 0.9, color: '#8a4a26' });
    furn('coffeeTable', X(26), -20, 0, { w: 1.6, d: 0.9 });
    furn('bookshelf', X(26.5), -28.65, 0, { w: 3.2, d: 0.45 });
    furn('desk', X(22.2), -27.6, 0, {});
    furn('typewriter', X(22.2), -27.7, 0, { y: 0.77 });
    furn('chair', X(22.2), -26.9, PI, {});
    furn('armchair', X(29.0), -27.2, -PI * 0.75, { w: 0.85, d: 0.85, color: '#6e2a1a' });
    for (const [x, z] of [[20.8, -28.3], [29.3, -11.8], [20.8, -11.8]]) furn('plant', X(x), z, 0, { w: 0.7, d: 0.7 });
    furn('chandelier', X(25), -20, 0, {});
    furn('painting', X(25), -11.17, PI, { y: 1.9, seed: 9, big: true });
    sign('THE LOUNGE', X(20) - 0.16, 2.75, -20, -PI / 2, 1.6, 0.36);
    for (const [x, z, ry] of [[25.3, -23.4, 0], [26.7, -23.4, 0], [25.3, -16.6, PI], [26.7, -16.6, PI]]) {
      const id = node(`lng_s${LOUNGE.length}@${n}`, X(x), z, { pose: 'sit', ry, spot: true });
      LOUNGE.push(id);
      link(id, `lng_c@${n}`);
    }
  }
  GATE = null;
}
for (const F of FLOORS.slice(1)) buildFloor(F);
for (const r of ROOMS) ROOM_BY_ID[r.id] = r;
// The elevator ties the floors together: anyone whose path crosses floors rides it.
link('elev', 'elev@2');
link('elev@2', 'elev@3');

// ---------- the staircase ----------
// The flights stack in one slot along the north wall. Downstairs the space under the first flight is
// boarded up (a cupboard under the stairs); upstairs a banister runs along the opening, and on the top
// floor a rail closes its far end too. NPCs walk foot → halfway → top. The halfway node is doubled, once
// on each floor: reaching it means stepping onto the upper floor's half of the flight (see Sim.ride()).
const hallNodeNear = (x, f) => {
  let best = null, bd = Infinity;
  for (const id in NODES) {
    const nd = NODES[id];
    if (!/^h-?\d/.test(id) || floorOf(nd.x) !== f || Math.abs(nd.z + 20) > 0.01) continue;
    const d = Math.abs(nd.x - x);
    if (d < bd) { bd = d; best = id; }
  }
  return best;
};
{
  const S = STAIRS, run = S.x2 - S.x1, span = S.z2 - S.z1, midX = (S.x1 + S.x2) / 2, lane = (S.z1 + S.z2) / 2;
  collider(-29.85, S.z2 - 0.05, S.x2 - 0.3, S.z2 + 0.05, 'all', { on: 'floor2' });
  for (const F of FLOORS.slice(1)) {
    const o = F.f * FLOOR_DX, above = FLOORS[F.f + 1];
    const end = above ? { on: F.flag, off: above.flag } : { on: F.flag }; // no flight up from here
    collider(S.x1 + o, S.z2 - 0.04, S.x2 + o, S.z2 + 0.04, 'all', { on: F.flag });
    collider(S.x2 + o - 0.04, S.z1, S.x2 + o + 0.04, S.z2, 'all', end);
    furn('stairRail', midX + o, S.z2, 0, { on: F.flag, run });
    furn('stairRail', S.x2 + o, lane, PI / 2, { ...end, run: span });
    // the landing at the end of the hall, where the flight from below arrives
    const top = node(`st_top@${F.f}`, S.x1 - 0.55 + o, lane, { on: F.flag, stairEntry: true });
    const land = node(`st_land@${F.f}`, S.x1 - 0.65 + o, -19.4, { on: F.flag });
    link(top, land);
    link(land, hallNodeNear(-26.4 + o, F.f));
  }
  for (let k = 0; k < FLOORS.length - 1; k++) {
    const flag = FLOORS[k + 1].flag, lo = k * FLOOR_DX, hi = lo + FLOOR_DX;
    const foot = node(`st_foot@${k}`, S.x2 + 0.5 + lo, lane, { on: flag, stairEntry: true });
    link(foot, hallNodeNear(-22.5 + lo, k));
    chain([
      foot,
      node(`st_${k}_mid`, midX + lo, lane, { on: flag, stair: true }),
      node(`st_${k}_midu`, midX + hi, lane, { on: flag, stair: true }),
      `st_top@${k + 1}`,
    ]);
    furn('stairFlight', S.x2 + lo, lane, 0, { on: flag, run, span, steps: S.steps, closed: k === 0 });
  }
}

// ---------- the basement ----------
// Down the steps from the door in Storage: a long cellar hall with the boiler room off it to the north,
// a room of lost luggage to the south and, at the far west end, an iron door in chains. NPCs cross the
// threshold like an elevator ride (see Sim.ride()); the way through only exists while the door is open.
{
  const o = BASEMENT_F * FLOOR_DX, X = x => x + o, S = BSM_STEPS;
  hWall(-29, X(16), X(26));
  hWall(-24, X(6), X(16));
  hWall(-24, X(26), X(30));
  hWall(-16, X(6), X(12));
  hWall(-16, X(24), X(30));
  hWall(-11, X(12), X(24));
  vWall(X(6), -24, -16);
  vWall(X(30), -24, -16);
  vWall(X(16), -29, -24);
  vWall(X(26), -29, -24);
  vWall(X(12), -16, -11);
  vWall(X(24), -16, -11);
  // the steps: stone walls on either side, so the only way on is from the foot
  collider(S.x1, -23.85, S.x3, S.z1, 'all');
  collider(S.x1 + 0.35, S.z2, S.x3, S.z2 + 0.12, 'all');
  furn('cellarSteps', S.x1, (S.z1 + S.z2) / 2, 0, { run: S.x2 - S.x1, land: S.x3 - S.x2, rise: S.rise, span: S.z2 - S.z1 });
  furn('furnace', X(21), -27.6, 0, { w: 3.2, d: 2.0 });
  furn('coalPile', X(24.4), -27.9, 0, { w: 1.6, d: 1.4 });
  furn('pipeRun', X(18), -23.6, 0, { len: 22 });
  furn('pipeRun', X(18), -16.5, 0, { len: 22, low: true });
  furn('trunkPile', X(22.6), -12.4, 0, { w: 2.2, d: 1.4, seed: 1 });
  furn('trunkPile', X(19.2), -11.9, 0, { w: 2.4, d: 1.2, seed: 2 });
  furn('trunkPile', X(13.4), -14.6, PI / 2, { w: 2.0, d: 1.2, seed: 3 });
  furn('porterCart', X(16.2), -12.0, 0, { w: 1.3, d: 0.7 });
  furn('ledgerDesk', X(21.8), -15.2, PI, { w: 1.3, d: 0.7 });
  furn('ironDoor', X(6.15), -20, PI / 2, {});
  for (const x of [9, 15, 21, 27]) furn('bulb', X(x), -20, 0, { cellar: true });
  furn('bulb', X(21), -26.4, 0, { cellar: true });
  furn('bulb', X(18), -13.4, 0, { cellar: true });
  station('bsm_up', 'cellarUp', S.x3 - 0.2, 2.3, (S.z1 + S.z2) / 2, 0.7);
  station('bsm_iron', 'ironDoor', X(6.5), 1.3, -20, 0.9);
  station('bsm_ledger', 'ledger', X(21.8), 1.0, -14.9, 0.45);
  station('bsm_cart', 'cart', X(16.2), 1.2, -12.0, 0.5);
  const bn = (id, x, z, extra) => node(id, X(x), z, { staff: true, ...extra });
  bn('bsm_top', 29.25, -22.4, { door: true, on: 'bsm_open' });
  bn('bsm_foot', 25.6, -22.4, { stairEntry: true });
  bn('bsm_e', 23.4, -20.2);
  bn('bsm_c', 17.5, -20.2);
  bn('bsm_w', 9.6, -20.2);
  bn('bsm_iron', 7.5, -20, { ry: -PI / 2 });
  bn('bsm_boiler', 21, -25.6);
  bn('bsm_lug', 18, -14.2);
  bn('bsm_cart', 16.2, -13.1, { ry: PI });
  bn('bsm_desk', 21.8, -14.3, { ry: PI });
  chain(['bsm_top', 'bsm_foot', 'bsm_e', 'bsm_c', 'bsm_w', 'bsm_iron']);
  link('bsm_c', 'bsm_boiler');
  link('bsm_e', 'bsm_boiler');
  link('bsm_c', 'bsm_lug');
  link('bsm_lug', 'bsm_cart');
  link('bsm_lug', 'bsm_desk');
  NODES.basement.door = true;
  link('basement', 'bsm_top');
}

// ---------- queries ----------
export function inRect(x, z, r) { return x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2; }
export function inPool(x, z) { return x > POOL.x1 && x < POOL.x2 && z > POOL.z1 && z < POOL.z2; }
export function floorY(x, z) { return inPool(x, z) ? POOL.floorY : 0; }

// The staircase's slot at a layout point, if it's there (whether or not the stairs are built yet).
export function stairAt(x, z) {
  const wx = x - floorOf(x) * FLOOR_DX;
  return wx > STAIRS.x1 && wx < STAIRS.x2 && z > STAIRS.z1 && z < STAIRS.z2 ? STAIRS : null;
}
// The highest floor the stairs reach (0: no stairs yet).
export const stairsTop = () => (FLAGS.floor3 ? 2 : FLAGS.floor2 ? 1 : 0);
// A built flight (or the opening above one) at a layout point: somewhere to walk only by climbing.
export const inStairwell = (x, z) => !!stairsTop() && !!stairAt(x, z) && floorOf(x) <= stairsTop();

const STEP = 0.45; // the highest step anyone takes without jumping
// Where the ground is (relative to the floor) for someone at height y: the highest surface at or just
// above their feet. Flat everywhere except the pool and the staircase, where the flights stack one per
// storey in the same slot. The slope runs through the middle of each tread, not along the nosings.
export function surfaceY(x, z, y = 0) {
  if (inPool(x, z)) return POOL.floorY;
  const B = BSM_STEPS;
  if (x > B.x1 && x < B.x3 && z > B.z1 && z < B.z2) return Math.min(1, (x - B.x1) / (B.x2 - B.x1)) * B.rise;
  if (!inStairwell(x, z)) return 0;
  const f = floorOf(x), wx = x - f * FLOOR_DX;
  const up = Math.min(1, (STAIRS.x2 - wx) / (STAIRS.x2 - STAIRS.x1) + 0.5 / STAIRS.steps);
  const reach = f * FLOOR_H + y + STEP;
  let best = -Infinity;
  for (let k = 0; k < stairsTop(); k++) { // flight k climbs from floor k to floor k + 1
    const c = (k + up) * FLOOR_H;
    if (c <= reach && c > best) best = c;
  }
  return best === -Infinity ? 0 : best - f * FLOOR_H;
}

// Can an NPC walk straight from a to b? Not through walls, furniture or a stairwell, not across the pool
// (unless swimming) and, for guests, never through a staff-only area.
const tmpWalk = [];
function circleHits(x, z, r) {
  for (const c of collidersNear(x, z, r + 0.05, tmpWalk)) {
    if (c.who === 'car') continue;
    const px = Math.max(c.x1, Math.min(x, c.x2)), pz = Math.max(c.z1, Math.min(z, c.z2));
    if ((x - px) ** 2 + (z - pz) ** 2 < r * r) return true;
  }
  return false;
}
export function clearWalk(ax, az, bx, bz, opts = {}) {
  if (floorOf(ax) !== floorOf(bx)) return false;
  const r = opts.r ?? 0.28;
  const dx = bx - ax, dz = bz - az;
  const n = Math.ceil(Math.hypot(dx, dz) / 0.3);
  for (let i = 1; i < n; i++) {
    const x = ax + (dx * i) / n, z = az + (dz * i) / n;
    if (circleHits(x, z, r) || inStairwell(x, z)) return false;
    if (!opts.swim && inPool(x, z)) return false;
    if (opts.guest && isStaffArea(x, z)) return false;
  }
  return true;
}
// Can you see from a to b? Only walls block the view (furniture is low enough to look over, and
// doorways are open); both points should be on the same floor.
export function clearSight(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const lx = Math.min(ax, bx), hx = Math.max(ax, bx), lz = Math.min(az, bz), hz = Math.max(az, bz);
  for (const w of WALLS) {
    if (w.x2 < lx || w.x1 > hx || w.z2 < lz || w.z1 > hz || !isActive(w)) continue;
    // slab test: the part of the segment inside the wall's x range, then its z range
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) { if (ax < w.x1 || ax > w.x2) continue; }
    else {
      let a = (w.x1 - ax) / dx, b = (w.x2 - ax) / dx;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    }
    if (Math.abs(dz) < 1e-9) { if (az < w.z1 || az > w.z2) continue; }
    else {
      let a = (w.z1 - az) / dz, b = (w.z2 - az) / dz;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    }
    if (t0 <= t1) return false;
  }
  return true;
}
export function roomAt(x, z) { for (const r of ROOMS) if (inRect(x, z, r)) return r; return null; }

export function zoneAt(x, z) {
  const r = roomAt(x, z);
  if (r) return { id: 'room', name: r.pres ? 'Presidential Suite' : `Room ${r.id}`, room: r.id, pub: false, wall: 'room' };
  for (const zn of ZONES) if (inRect(x, z, zn)) return zn;
  return OUTSIDE;
}

export const isStaffArea = (x, z) => STAFF_ZONES.has(zoneAt(x, z).id) || (x > 3 && x < 10 && z > -11 && z < -7.6);

function zoneKey(x, z) {
  const zn = zoneAt(x, z);
  return zn.room ? `R${zn.room}` : zn.id;
}

for (const id in NODES) {
  const nd = NODES[id];
  nd.zk = zoneKey(nd.x, nd.z);
  if (STAFF_ZONES.has(zoneAt(nd.x, nd.z).id)) nd.staff = true;
}

export function nearestNode(x, z) {
  const zk = zoneKey(x, z);
  let best = null, bd = Infinity, any = null, ad = Infinity;
  for (const id in NODES) {
    const nd = NODES[id];
    if (!isActive(nd)) continue;
    const d = (nd.x - x) ** 2 + (nd.z - z) ** 2;
    if (d < ad) { ad = d; any = id; }
    if (nd.zk === zk && d < bd) { bd = d; best = id; }
  }
  return best || any;
}

// A* over the nav graph, measured in the real building (a storey's x offset doesn't count). Guests
// ({guest:true}) never cut through staff-only areas unless they start or end in one (e.g. a snooping
// guest being walked back out). Floors connect by the elevator (unless it's broken down) and the stairs.
const LIFT_COST = 6;   // waiting for the elevator, in meters of walking
const CLIMB_COST = 1.6; // stairs are harder going than a flat hallway
const QUEUE_COST = 3;  // the check-in line is for queuing, not for walking through
const worldX = nd => nd.x - floorOf(nd.x) * FLOOR_DX;
function hop(a, b) {
  if (floorOf(a.x) !== floorOf(b.x)) return a.lift && b.lift ? LIFT_COST : a.door && b.door ? 3 : 0.05;
  return Math.hypot(a.x - b.x, a.z - b.z) * (b.queue ? QUEUE_COST : a.stair && b.stair ? CLIMB_COST : 1);
}
const hopOk = (a, b) => !(FLAGS.elev_out && a.lift && b.lift && floorOf(a.x) !== floorOf(b.x));

function search(starts, ends, gx, gz, allowStaff) {
  const usable = id => { const nd = NODES[id]; return isActive(nd) && (allowStaff || !nd.staff); };
  const gwx = gx - floorOf(gx) * FLOOR_DX;
  const h = nd => Math.hypot(worldX(nd) - gwx, nd.z - gz);
  const g = new Map(), prev = new Map(), open = new Map(), closed = new Set();
  for (const s of starts) {
    if (!NODES[s.id]) continue; // wherever the walker starts, even a staff-only spot
    if (!g.has(s.id) || s.c < g.get(s.id)) { g.set(s.id, s.c); prev.set(s.id, null); open.set(s.id, s.c + h(NODES[s.id])); }
  }
  let best = null, bestCost = Infinity;
  while (open.size) {
    let cur = null, bf = Infinity;
    for (const [id, f] of open) if (f < bf) { bf = f; cur = id; }
    if (bf >= bestCost) break;
    open.delete(cur);
    closed.add(cur);
    if (ends.has(cur)) {
      const tot = g.get(cur) + ends.get(cur);
      if (tot < bestCost) { bestCost = tot; best = cur; }
    }
    const cn = NODES[cur];
    for (const nid of cn.n) {
      if (closed.has(nid) || !usable(nid)) continue;
      const nn = NODES[nid];
      if (!hopOk(cn, nn)) continue;
      const ng = g.get(cur) + hop(cn, nn);
      if (!g.has(nid) || ng < g.get(nid)) { g.set(nid, ng); prev.set(nid, cur); open.set(nid, ng + h(nn)); }
    }
  }
  if (best === null) return null;
  const out = [];
  for (let c = best; c !== null; c = prev.get(c)) out.push(c);
  return out.reverse();
}

const pathCache = new Map();
export function findPath(from, to, opts = {}) {
  if (from === to) return [from];
  const start = NODES[from], goal = NODES[to];
  if (!start || !goal) return null;
  const allowStaff = !opts.guest || !!start.staff || !!goal.staff;
  const key = `${from}>${to}|${allowStaff ? 1 : 0}`;
  if (pathCache.has(key)) return pathCache.get(key);
  const result = search([{ id: from, c: 0 }], new Map([[to, 0]]), goal.x, goal.z, allowStaff);
  pathCache.set(key, result);
  return result;
}

// Up to `max` nodes near a point that can be walked to in a straight line, nearest first.
function visibleNodes(x, z, opts, max = 5) {
  const f = floorOf(x), onStairs = inStairwell(x, z), cand = [];
  for (const id in NODES) {
    const nd = NODES[id];
    if (!isActive(nd) || floorOf(nd.x) !== f || (nd.stair && !onStairs) || (nd.pose === 'swim' && !opts.swim) || (opts.guest && nd.staff)) continue;
    const d2 = (nd.x - x) ** 2 + (nd.z - z) ** 2;
    if (d2 < 196) cand.push([d2, id]);
  }
  cand.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (let i = 0; i < cand.length && i < 16 && out.length < max; i++) {
    const nd = NODES[cand[i][1]];
    if (cand[i][0] < 0.01 || (onStairs ? nd.stair || nd.stairEntry : clearWalk(x, z, nd.x, nd.z, opts))) out.push({ id: cand[i][1], c: Math.sqrt(cand[i][0]) });
  }
  if (!out.length) {
    const id = nearestNode(x, z);
    if (id) out.push({ id, c: Math.hypot(NODES[id].x - x, NODES[id].z - z) });
  }
  return out;
}

// Plans a walk from (sx, sz) to a node id or a point {x, z}. Starts and ends at whichever visible nodes
// make the trip shortest, then straightens the route wherever a straight line is clear, never past a
// stairwell, a floor change or a seat. Returns plain waypoints {x, z, hard, stair}.
// opts: guest (keep out of staff areas), swim (may cross the pool).
export function planPath(sx, sz, goal, opts = {}) {
  const goalNode = typeof goal === 'string' ? NODES[goal] : null;
  const gx = goalNode ? goalNode.x : goal.x, gz = goalNode ? goalNode.z : goal.z;
  const wopts = {
    guest: !!opts.guest && !isStaffArea(sx, sz) && !isStaffArea(gx, gz),
    swim: !!opts.swim || inPool(sx, sz) || (goalNode ? goalNode.pose === 'swim' : inPool(gx, gz)),
  };
  const fin = { x: gx, z: gz, hard: true, stair: !!goalNode?.stair };
  if (floorOf(sx) === floorOf(gx) && !inStairwell(sx, sz) && clearWalk(sx, sz, gx, gz, wopts)) return [fin];
  const starts = visibleNodes(sx, sz, wopts);
  const ends = goalNode ? new Map([[goal, 0]]) : new Map(visibleNodes(gx, gz, wopts).map(e => [e.id, e.c]));
  const allowStaff = !wopts.guest;
  const ids = search(starts, ends, gx, gz, allowStaff) || search(starts, ends, gx, gz, true);
  if (!ids) return [fin];
  const pts = ids.map(id => NODES[id]);
  if (!goalNode) pts.push({ x: gx, z: gz });
  return straighten(sx, sz, pts, wopts);
}

function straighten(sx, sz, pts, opts) {
  const n = pts.length;
  const hard = pts.map((p, i) => !!p.stair || !!p.stairEntry || !!p.pose || (i > 0 && floorOf(pts[i - 1].x) !== floorOf(p.x)) || (i < n - 1 && floorOf(pts[i + 1].x) !== floorOf(p.x)));
  const out = [];
  let cx = sx, cz = sz, i = 0;
  while (i < n) {
    let end = i;
    while (end < n - 1 && !hard[end]) end++;
    let pick = i;
    if (!inStairwell(cx, cz)) for (let k = end; k > i; k--) if (clearWalk(cx, cz, pts[k].x, pts[k].z, opts)) { pick = k; break; }
    const p = pts[pick];
    if ((p.x - cx) ** 2 + (p.z - cz) ** 2 > 0.0025 || pick === n - 1) out.push({ x: p.x, z: p.z, hard: hard[pick] || pick === n - 1, stair: !!p.stair, door: !!p.door });
    cx = p.x; cz = p.z; i = pick + 1;
  }
  return out;
}

// Uniform grid over the colliders for fast circle-vs-box queries.
const CELL = 4;
const grid = new Map();
function cellKey(ix, iz) { return ix * 10007 + iz; }
COLLIDERS.forEach((c, i) => {
  for (let ix = Math.floor(c.x1 / CELL); ix <= Math.floor(c.x2 / CELL); ix++)
    for (let iz = Math.floor(c.z1 / CELL); iz <= Math.floor(c.z2 / CELL); iz++) {
      const k = cellKey(ix, iz);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    }
});

export function collidersNear(x, z, r, out = []) {
  out.length = 0;
  const seen = new Set();
  for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix++)
    for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz++) {
      const list = grid.get(cellKey(ix, iz));
      if (!list) continue;
      for (const i of list) if (!seen.has(i)) { seen.add(i); const c = COLLIDERS[i]; if (isActive(c)) out.push(c); }
    }
  return out;
}

// Push a circle out of every box it overlaps. `who` is 'player' or 'car'. Returns true on contact.
const tmp = [];
export function resolveCircle(pos, r, who) {
  let hit = false;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const c of collidersNear(pos.x, pos.z, r + 0.1, tmp)) {
      if (c.who !== 'all' && c.who !== who) continue;
      const cx = Math.max(c.x1, Math.min(pos.x, c.x2));
      const cz = Math.max(c.z1, Math.min(pos.z, c.z2));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = moved = true;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2), push = r - d;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
      } else {
        const l = pos.x - c.x1, rr = c.x2 - pos.x, t = pos.z - c.z1, b = c.z2 - pos.z;
        const m = Math.min(l, rr, t, b);
        if (m === l) pos.x = c.x1 - r; else if (m === rr) pos.x = c.x2 + r;
        else if (m === t) pos.z = c.z1 - r; else pos.z = c.z2 + r;
      }
    }
    if (!moved) break;
  }
  return hit;
}

export function pointBlocked(x, z, who = 'player') {
  for (const c of collidersNear(x, z, 0.05, tmp)) {
    if (c.who !== 'all' && c.who !== who) continue;
    if (x > c.x1 && x < c.x2 && z > c.z1 && z < c.z2) return true;
  }
  return false;
}
