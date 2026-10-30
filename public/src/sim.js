// The Last Resort — host-authoritative game simulation.
// Runs only on the host (and in Node tests). Clients render snapshots and send actions.
import * as L from './layout.js';
import {
  ARCH, ITEMS, MESSES, DISHES, REQUESTS, ROUNDS, UPGRADES, UPGRADE_BY_ID, LUGGAGE_COLORS, CAR_COLORS, CAR_NAMES, LINES,
  TIERS, TASTE_BONUS, SUITE_COST, SNOOP, SNOOP_SPOTS, CHEF_DISHES,
  partyName, makeCard, surveyText, satToStars, endlessRound,
} from './content.js';
import { DEFAULT_SETTINGS, sanitizeSettings, difficulty } from './difficulty.js';
import { helperMethods } from './helpers.js';
import { clamp, rand, randi, pick, chance, shuffle, weighted, axisDiff } from './util.js';

export const START_H = 15;
export const END_H = 36;
const PUBLIC_ZONES = new Set(['lobby', 'hall', 'elev', 'dining', 'pool']);
// The most any one kind of annoyance can cost a party, so a single neglected chore
// costs a star or so instead of wiping out the whole review.
const COMPLAINT_CAPS = { mess: 18, pool: 16, roomDirty: 16, blackout: 12, wait: 45, valet: 30, noise: 6, cold: 6, thrown: 12, privacy: 18, harassed: 40, room: 25, smoke: 10, plates: 10, injury: 25, lostkid: 25, locked: 14, elevator: 6, raccoon: 8, vending: 5 };
const STOVE_SLOTS = 10; // 0-3 main range, 4-7 island cooktop, 8 toaster, 9 waffle iron
const BURNERS = 8;      // the slots that can catch fire
const PLATES = 12;      // clean plates at the start of a shift
const TUB_PLATES = 4;   // plates in one tub of dirty dishes
const PASS_SLOTS = 4;
const FIRE_DELAY = { normal: 12, advanced: 8 };   // seconds burnt food sits before it catches fire
const FIRE_SPREAD = { normal: 20, advanced: 12 }; // seconds before a fire jumps to the next burner
// Which tiers a guest of each taste would like, best first.
const TIER_PREF = { budget: ['basic', 'suite', 'pres'], standard: ['basic', 'suite', 'pres'], luxury: ['suite', 'pres', 'basic'], vip: ['pres', 'suite', 'basic'] };
const END_ROOMS = ['101', '106', '107', '112', '201', '206', '207', '212', '301', '306', '307', '312'];
const CLOSING_LIMIT = 480; // seconds of closing time before corporate's cleaners take over
const DND_CHANCE = 0.65;   // how often guests resting in their room hang the sign (sleepers always do)
const INCIDENT_FIRST = 75; // seconds into a shift before the first incident can happen
const INCIDENT_GAP = [55, 115];
const INCIDENT_ICON = { slip: '🤕', lostkid: '😢', lockout: '🚪', drunk: '🥴', vending: '😤' };
const RACCOON_SPOTS = ['kit_w', 'kit_c', 'kit_e', 'kit_pass', 'kit_l', 'din_door', 'ais_m_-26.00', 'ais_m_-20.50', 'ais_m_-15.00'];
const SEPARATION = 0.6; // how close walkers get before stepping around each other
const BASE_SAT = 72;
const LUGGAGE_TIME = 95;
const REQUEST_TIME = 90;
const ORDER_TIME = 85;
const r2 = v => Math.round(v * 100) / 100;
const dsq = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

export class Sim {
  constructor({ send = () => {}, sendTo = () => {}, shiftLen = 480, hostId = 1, settings = null } = {}) {
    this.send = send;
    this.sendTo = sendTo;
    this.hostId = hostId;
    this.settings = sanitizeSettings({ ...(settings || {}), shiftLen }, { ...DEFAULT_SETTINGS, shiftLen });
    this.players = {};
    this.items = {};
    this.helpers = {};
    this.claims = {};
    this.nid = 1;
    this.newGame();
  }

  get shiftLen() { return this.settings.shiftLen; }

  newGame() {
    this.money = 400;
    this.upgrades = {};
    this.tiers = {};
    this.round = 0;
    this.phase = 'lobby';
    this.def = null;
    this.results = null;
    this.threshold = 0;
    this.horror = 0;
    this.kitchen = this.settings.kitchen;
    this.stats = { guests: 0, deaths: 0, caught: 0, fled: 0, helperJobs: 0, escorts: 0 };
    this.D = difficulty(this.settings, Math.max(1, Object.keys(this.players).length));
    this.helpers = {};
    this.applyFlags();
    this.resetShift();
    for (const id in this.items) if (ITEMS[this.items[id].t].tool && (this.items[id].extra || this.items[id].floorTool)) { this.detachItem(this.items[id]); delete this.items[id]; }
    this.spawnTools();
  }

  // Mirrors owned upgrades and opened wings into the shared layout flags.
  applyFlags() {
    const f = {};
    for (const u of UPGRADES) if (this.lvl(u.id)) f[u.id] = true;
    f.lobby1 = this.lvl('lobby') >= 1;
    f.lobby2 = this.lvl('lobby') >= 2;
    f.trays_ok = this.kitchenMode() === 'advanced' || !!this.lvl('trays');
    f.elev_out = !!this.elevOut;
    L.setFlags(f);
    this.syncHelpers();
  }

  kitchenMode() { return this.phase === 'shift' ? this.kitchen : this.settings.kitchen; }

  tierOf(id) { return id === 'PRES' ? 'pres' : this.tiers[id] || 'basic'; }

  roomOpen(id) {
    const w = L.ROOM_BY_ID[id]?.wing;
    return !w || !!this.lvl(w);
  }

  openRooms() { return L.ROOMS.filter(r => this.roomOpen(r.id)); }

  resetShift() {
    this.clock = 0;
    this.slack = this.slack || 1;
    this.chores = this.chores || 1;
    this.power = true;
    this.powerT = 0;
    this.guests = {};
    this.parties = {};
    this.cars = {};
    this.messes = {};
    this.monsters = {};
    this.orders = {};
    this.queue = [];
    this.taken = {};
    this.rooms = {};
    for (const r of L.ROOMS) this.rooms[r.id] = { id: r.id, st: 'vacant', party: null, dnd: false, curtains: true, cold: false };
    this.stoves = Array(STOVE_SLOTS).fill(null);
    this.fires = Array(BURNERS).fill(0);
    this.sinkPile = 0;
    this.plates = PLATES;
    this.pass = Array(PASS_SLOTS).fill(null);
    this.smokeT = 0;
    this.washT = 0;
    this.incidents = {};
    this.incidentT = INCIDENT_FIRST;
    this.elevOut = false;
    this.autoCurtains = false;
    this.resetHelpers();
    this.roundSurveys = [];
    this.schedule = [];
    this.events = [];
    this.alerts = [];
    this.ufo = null;
    this.tasks = [];
    this.revenue = 0;
    this.slowT = 0;
    this.debrisT = 8;
    this.flickerT = 15;
    this.creepT = 25;
    this.circles = false;
    this.closingAt = 0;
    this.twinsT = 90;
    for (const id in this.items) {
      const it = this.items[id];
      if (ITEMS[it.t].tool) { if (!it.holder) this.returnHome(it); }
      else { this.detachItem(it); delete this.items[id]; }
    }
  }

  spawnTools() {
    if (!Object.values(this.items).some(it => ITEMS[it.t].tool && !it.extra)) {
      for (const h of L.TOOL_HOMES) this.spawnItem(h.t, h.x, 0, h.z, { home: { x: h.x, z: h.z } });
    }
    if (this.lvl('supplies') && !Object.values(this.items).some(it => it.extra)) {
      for (const h of L.EXTRA_TOOL_HOMES) this.spawnItem(h.t, h.x, 0, h.z, { home: { x: h.x, z: h.z }, extra: true });
    }
    for (const h of L.FLOOR_TOOL_HOMES) {
      if (this.lvl(h.flag) && !Object.values(this.items).some(it => it.floorTool === h.id)) this.spawnItem(h.t, h.x, 0, h.z, { home: { x: h.x, z: h.z }, floorTool: h.id });
    }
  }

  hour() { return START_H + (END_H - START_H) * clamp(this.clock / this.shiftLen, 0, 1); }
  isNight() { const H = this.hour(); return H >= 23 && H < 29.5; }
  isBreakfast() { const H = this.hour(); return H >= 30 && H < 34; }
  lvl(id) { return this.upgrades[id] || 0; }
  id() { return this.nid++; }

  // ---------- messaging ----------
  toast(pid, tx, cl = 'info') {
    const msg = { k: 'ev', e: 'toast', tx, cl };
    if (pid == null) this.send(msg); else this.sendTo(pid, msg);
  }
  sound(n, pos, extra = {}) { this.send({ k: 'ev', e: 'snd', n, x: r2(pos.x), z: r2(pos.z), ...extra }); }
  say(g, tx, t = 3) { g.say = tx; g.sayT = t; }
  emote(g, ic, t = 2.5) { if (g) { g.emo = ic; g.emoT = t; } }
  addMoney(v) {
    this.money += v;
    this.revenue += v;
    this.send({ k: 'ev', e: 'money', v });
  }
  alert(ic, tx, pos, secs = 60, secret = false) {
    this.alerts.push({ ic, tx, x: pos.x, z: pos.z, until: this.clock + secs, secret });
  }

  // ---------- players ----------
  addPlayer(id, name) {
    if (this.players[id]) return;
    const used = new Set(Object.values(this.players).map(p => p.color));
    let color = 0;
    while (used.has(color)) color++;
    const sp = L.SPAWNS[Object.keys(this.players).length % L.SPAWNS.length];
    this.players[id] = { id, name: String(name || 'Staff').slice(0, 16), color: color % 6, x: sp[0], y: 0, z: sp[1], yaw: 0, pitch: 0, fl: false, held: null, down: 0, car: null };
  }

  removePlayer(id) {
    const pl = this.players[id];
    if (!pl) return;
    this.dropHeld(pl);
    if (pl.car && this.cars[pl.car]) this.cars[pl.car].driver = null;
    delete this.players[id];
  }

  setPose(id, d) {
    const pl = this.players[id];
    if (!pl || typeof d.x !== 'number') return;
    pl.x = d.x; pl.y = d.y || 0; pl.z = d.z;
    pl.yaw = d.yaw || 0; pl.pitch = d.pitch || 0; pl.fl = !!d.fl;
    if (d.car && pl.car === d.car.i) {
      const c = this.cars[d.car.i];
      if (c && c.driver === id) { c.x = d.car.x; c.z = d.car.z; c.ry = d.car.r; }
    }
  }

  // ---------- phase control ----------
  command(pid, a) {
    if (pid !== this.hostId) return;
    if (a.cmd === 'start' && (this.phase === 'lobby' || this.phase === 'shop')) { this.round += 1; this.beginShift(); }
    else if (a.cmd === 'continue' && this.phase === 'results') this.afterResults();
    else if (a.cmd === 'retry' && this.phase === 'gameover') {
      this.money = this.roundStart.money;
      this.upgrades = { ...this.roundStart.upgrades };
      this.tiers = { ...this.roundStart.tiers };
      this.applyFlags();
      this.beginShift();
    } else if (a.cmd === 'endless' && this.phase === 'victory') { this.round += 1; this.beginShift(); }
    else if (a.cmd === 'newgame') this.newGame();
  }

  setSettings(s) {
    if (!['lobby', 'shop', 'gameover', 'victory'].includes(this.phase)) return;
    this.settings = sanitizeSettings(s, this.settings);
    this.kitchen = this.settings.kitchen;
    this.applyFlags();
    this.toast(null, '⚙️ The host changed the difficulty settings.', 'info');
  }

  beginShift() {
    this.resetShift();
    this.roundStart = { money: this.money, upgrades: { ...this.upgrades }, tiers: { ...this.tiers }, stats: { ...this.stats } };
    const def = this.def = this.round <= ROUNDS.length ? ROUNDS[this.round - 1] : endlessRound(this.round);
    this.phase = 'shift';
    const np = clamp(Object.keys(this.players).length, 1, 6);
    const D = this.D = difficulty(this.settings, np);
    this.kitchen = D.kitchen;
    this.slack = D.patience;   // timer multiplier (crew size x patience setting)
    this.chores = D.chores;    // mess frequency
    this.horror = (def.horror || 0) * D.horror;
    this.threshold = r2(clamp(def.threshold + D.target, 1.5, 4.8));
    this.applyFlags();
    // More rooms (expansions) and a billboard bring more guests; never book far beyond capacity.
    const rooms = this.openRooms().length;
    const capacity = 1 + 0.2 * Math.max(0, rooms - 12) / 12;
    const raw = def.count * D.count * capacity * (this.lvl('billboard') ? 1.2 : 1) * clamp(this.shiftLen / 480, 0.7, 1.4);
    const count = clamp(Math.round(raw), 3, Math.round(rooms * 1.2));
    const early = clamp((count - rooms * 0.85) / count, 0.18, 0.4);
    for (let i = 0; i < count; i++) {
      const kind = weighted(def.mix);
      const late = i > 2 && chance(0.15);
      const h = late ? rand(22, 25.2) : 15.25 + (i / count) * 6.6 + rand(-0.25, 0.25);
      let checkoutH = rand(32.4, 35.4);
      if (!late && h < 19.5 && chance(early)) checkoutH = rand(20.5, 23.5);
      this.schedule.push({ h: Math.max(15.2, h), kind, checkoutH });
    }
    for (const sp of def.specials || []) this.schedule.push({ h: sp.h, kind: sp.kind, checkoutH: rand(33, 35) });
    this.schedule.sort((a, b) => a.h - b.h);
    this.events = (def.events || []).map(e => ({ ...e, done: false }));
    if (D.horror >= 1.3 && (def.horror || 0) >= 0.3) this.events.push({ h: 26.9, type: 'blackout', done: false }, { h: 23.8, type: 'flicker', d: 3, done: false });
    this.send({ k: 'ev', e: 'shift', round: this.round, title: def.title, blurb: def.blurb, clientele: def.clientele, threshold: this.threshold });
  }

  avgStars() {
    let sum = 0, w = 0;
    for (const s of this.roundSurveys) { sum += s.stars * (s.w || 1); w += s.w || 1; }
    return w ? sum / w : 3;
  }

  endShift() {
    for (const p of Object.values(this.parties)) {
      if (p.surveyed || p.st === 'gone') continue;
      if (p.threat && !p.checkedIn) continue;
      if (!p.checkedIn) this.adjust(p, -30, 'wait');
      this.finishParty(p);
    }
    const avg = this.avgStars();
    const passed = avg >= this.threshold - 1e-9;
    const bonus = passed ? Math.round(150 + 75 * this.round + 400 * Math.max(0, avg - this.threshold)) : 0;
    this.money += bonus;
    const stats = {};
    for (const k in this.stats) stats[k] = this.stats[k] - (this.roundStart?.stats?.[k] || 0);
    this.results = {
      round: this.round, title: this.def.title, avg: r2(avg), threshold: this.threshold, passed, bonus,
      revenue: this.revenue, surveys: this.roundSurveys.slice(), last: this.round === ROUNDS.length, stats,
    };
    this.phase = 'results';
    for (const pl of Object.values(this.players)) pl.car = null;
    this.guests = {};
    this.cars = {};
    this.monsters = {};
    this.ufo = null;
    this.orders = {};
    this.queue = [];
    this.taken = {};
    this.power = true;
    this.elevOut = false;
    this.applyFlags();
    this.send({ k: 'ev', e: 'results', r: this.results });
  }

  afterResults() {
    if (!this.results.passed) this.phase = 'gameover';
    else if (this.round === ROUNDS.length) this.phase = 'victory';
    else this.phase = 'shop';
  }

  // ---------- main loop ----------
  update(dt) {
    dt = Math.min(dt, 0.1);
    for (const pl of Object.values(this.players)) if (pl.down > 0) pl.down = Math.max(0, pl.down - dt);
    this.updateItems(dt);
    if (this.phase === 'shift') this.updateShift(dt);
    this.updateHelpers(dt);
    if (this.phase === 'shift') this.separate(dt);
  }

  // Walkers step around each other and around the crew instead of passing through them.
  separate(dt) {
    const all = [], movers = [];
    for (const g of Object.values(this.guests)) if (!g.hidden) { all.push(g); if (g.path.length && !g.rideT) movers.push(g); }
    for (const h of Object.values(this.helpers)) if (!h.hidden && h.k !== 'skimmer' && h.k !== 'roomba') { all.push(h); if (h.path.length && !h.rideT) movers.push(h); }
    for (const pl of Object.values(this.players)) if (!pl.car && !pl.down) all.push(pl);
    for (const a of movers) {
      if (L.inStairwell(a.x, a.z)) continue;
      let px = 0, pz = 0;
      for (const b of all) {
        if (b === a) continue;
        const dx = a.x - b.x, dz = a.z - b.z, d2 = dx * dx + dz * dz;
        if (d2 > SEPARATION * SEPARATION || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), push = 1 - d / SEPARATION;
        px += (dx / d) * push;
        pz += (dz / d) * push;
      }
      if (!px && !pz) continue;
      // Sidestep rather than get shoved backwards: drop the part of the push that opposes the walk,
      // so two people meeting in a doorway slip past each other instead of locking up.
      const t = a.path[0], ux = t.x - a.x, uz = t.z - a.z, ul = Math.hypot(ux, uz) || 1;
      const back = (px * ux + pz * uz) / ul;
      if (back < 0) { px -= (back * ux) / ul; pz -= (back * uz) / ul; }
      const pos = { x: a.x + px * 1.1 * dt, z: a.z + pz * 1.1 * dt };
      L.resolveCircle(pos, 0.25, 'player');
      if (L.inPool(pos.x, pos.z) !== L.inPool(a.x, a.z) || L.inStairwell(pos.x, pos.z)) continue;
      a.x = pos.x;
      a.z = pos.z;
    }
  }

  updateShift(dt) {
    this.clock += dt;
    const H = this.hour();
    while (this.schedule.length && this.schedule[0].h <= H) this.arrive(this.schedule.shift());
    for (const ev of this.events) if (!ev.done && H >= ev.h) { ev.done = true; this.fireEvent(ev); }
    for (const g of Object.values(this.guests)) this.updateGuest(g, dt);
    this.updateQueue(dt);
    for (const p of Object.values(this.parties)) this.updateParty(p, dt);
    this.updateCars(dt);
    this.updateStoves(dt);
    this.updateMessTimers(dt);
    this.updateMonsters(dt);
    this.updateUfo(dt);
    this.updateAmbience(dt);
    if (!this.power && this.lvl('generator')) { this.powerT += dt; if (this.powerT > 15) this.restorePower(null); }
    this.slowT -= dt;
    if (this.slowT <= 0) { this.slowT = 0.5; this.slowTick(0.5); }
    this.closingTick(H);
  }

  slowTick(dt) {
    this.checkSightings();
    this.checkLuggage();
    this.spawnGuestMesses(dt);
    this.poolTick(dt);
    this.roomTick(dt);
    this.curtainTick();
    this.smokeTick(dt);
    this.incidentTick(dt);
    this.alerts = this.alerts.filter(a => a.until > this.clock);
    this.buildTasks();
  }

  // ---------- parties & guests ----------
  arrive(entry) {
    const A = ARCH[entry.kind];
    const p = this.makeParty(entry.kind, entry);
    if (!p) return;
    this.stats.guests += p.size;
    if (p.hasCar) this.spawnArrivalCar(p);
    else if (A.arrive === 'beam' || A.arrive === 'fade') {
      this.spawnMembers(p, L.NODES.door_out.x, L.NODES.door_out.z + 0.6);
      this.send({ k: 'ev', e: 'fx', t: A.arrive, x: L.NODES.door_out.x, z: L.NODES.door_out.z + 0.6 });
    } else {
      const n = L.NODES[pick(L.EXITS)];
      this.spawnMembers(p, n.x, n.z);
    }
  }

  makeParty(kind, entry) {
    const A = ARCH[kind];
    let size = randi(A.size[0], A.size[1]);
    const id = this.id();
    const p = {
      id, kind, size, memberKinds: A.members(size), members: [], leader: null, spawned: false,
      room: null, roomWas: null, st: 'arriving', checkedIn: false,
      sat: clamp(BASE_SAT + 7 * this.lvl('lobby'), 0, 100), comp: {}, praise: {},
      hasCar: chance(A.car || 0), car: null,
      luggage: randi(A.luggage[0], A.luggage[1]), luggageItems: [], luggageDue: 0, luggagePen: false,
      checkoutH: entry.checkoutH, request: null, nextReq: this.clock + rand(30, 70) / (A.reqRate || 1),
      threat: !!A.threat, flags: {}, seen: new Set(), surveyed: false, color: pick(LUGGAGE_COLORS),
      nextCircle: 0, taste: A.taste || 'standard', tier: null, greeted: false,
    };
    if (kind === 'couple' && chance(0.25)) p.taste = 'luxury';
    p.size = p.memberKinds.length;
    p.name = partyName(kind, p.size);
    if (kind === 'doppel' && !this.setupDoppel(p)) return null;
    if (!p.card) p.card = makeCard(kind, p);
    this.parties[id] = p;
    return p;
  }

  setupDoppel(p) {
    const victims = Object.values(this.parties).filter(q => q.st === 'staying' && !q.threat && this.guests[q.leader]);
    if (!victims.length) return false;
    const v = pick(victims);
    const vg = this.guests[v.leader];
    p.name = v.name;
    p.taste = v.taste;
    p.doppelOf = { party: v.id, kind: vg.rk, seed: vg.seed };
    p.card = makeCard('doppel', p, { dupeRoom: v.room });
    return true;
  }

  spawnMembers(p, x, z) {
    p.memberKinds.forEach((k, i) => this.makeGuest(p, k, i === 0, x + rand(-0.7, 0.7), z + rand(-0.5, 0.5)));
    p.spawned = true;
    for (const gid of p.members) this.walkTo(this.guests[gid], 'door_in', 'enter');
  }

  makeGuest(p, kind, leader, x, z) {
    const A = ARCH[p.kind];
    const g = {
      id: this.id(), party: p.id, kind, rk: kind, seed: (Math.random() * 2147483647) | 0, leader,
      x, z, y: 0, ry: 0, anim: 'idle', pose: null, path: [], goal: null, dest: null, st: 'walk', t: 0,
      say: '', sayT: 0, emo: '', emoT: 0, spot: null, run: 1, hidden: false, ate: false,
      speed: (A.speed || 1.15) * (kind === 'kid' ? 1.35 : 1) * rand(0.9, 1.1),
    };
    if (p.doppelOf) { g.rk = p.doppelOf.kind; g.seed = p.doppelOf.seed; g.wrong = true; }
    this.guests[g.id] = g;
    p.members.push(g.id);
    if (leader) p.leader = g.id;
    return g;
  }

  removeGuest(g) {
    if (!this.guests[g.id]) return;
    if (g.incident) this.dropIncident(this.incidents[g.incident]);
    this.releaseSpot(g);
    this.cancelOrder(g);
    this.queueRemove(g);
    delete this.guests[g.id];
    const p = this.parties[g.party];
    if (!p) return;
    p.members = p.members.filter(id => id !== g.id);
    if (p.leader === g.id) p.leader = p.members[0] || null;
    if (!p.members.length && p.spawned) {
      if (p.room && this.rooms[p.room]?.party === p.id) { this.rooms[p.room].party = null; this.rooms[p.room].st = 'dirty'; }
      p.st = 'gone';
    }
  }

  releaseSpot(g) {
    if (g.spot && this.taken[g.spot] === g.id) delete this.taken[g.spot];
    g.spot = null;
  }

  cancelOrder(g) { delete this.orders[g.id]; }

  // Guests path around staff-only areas unless opts.free (snooping) is set. Sending a guest somewhere
  // ends whatever incident they were part of, unless the walk is part of it (opts.incident).
  walkTo(g, target, goal, run = 1, opts = {}) {
    if (g.incident && !opts.incident) this.dropIncident(this.incidents[g.incident]);
    if (!opts.keepSpot) this.releaseSpot(g);
    g.path = L.planPath(g.x, g.z, target, { guest: !opts.free });
    g.goal = goal;
    g.dest = target;
    g.pose = null;
    g.st = 'walk';
    g.run = run;
    if (L.NODES[target]?.spot) { this.taken[target] = g.id; g.spot = target; }
    return true;
  }

  walkDirect(g, x, z, goal, run = 1) {
    this.releaseSpot(g);
    g.path = [{ x, z }];
    g.goal = goal;
    g.dest = null;
    g.pose = null;
    g.st = 'walk';
    g.run = run;
  }

  updateGuest(g, dt) {
    if (g.sayT > 0) g.sayT -= dt;
    if (g.emoT > 0) g.emoT -= dt;
    if (g.hidden) return;
    if (g.path.length) {
      if (this.ride(g, g.path, dt)) { if (!g.path.length) this.arrived(g); return; }
      this.stepAlong(g, g.path, g.speed * g.run, dt);
      g.anim = g.run > 1.4 ? 'run' : 'walk';
      if (!g.path.length) this.arrived(g);
      return;
    }
    g.anim = 'idle';
    g.t -= dt;
    switch (g.st) {
      case 'incident': this.incidentIdle(g); break;
      case 'room': case 'lounge': case 'swim': case 'chill':
        if (g.t <= 0) this.nextActivity(g);
        break;
      case 'sleep': this.updateSleeper(g); break;
      case 'dine': this.updateDiner(g, dt); break;
      case 'ritual':
        if (g.t <= 0) this.finishRitual(g);
        break;
      case 'lurk':
        if (g.t <= 0) this.goRoom(g, 'bed');
        break;
      case 'kiosk': if (g.t <= 0) this.kioskCheckIn(g); break;
      case 'keydrop':
        if (g.t <= 0) { const p = this.parties[g.party]; if (p) { this.vacate(p); this.depart(p); this.sound('ding', g); } }
        break;
      case 'buffet': if (g.t <= 0) this.walkTo(g, g.spot, 'seatBack', 1, { keepSpot: true }); break;
      case 'shop': case 'spa': case 'arcade':
        if (g.t <= 0) this.finishAmenity(g);
        break;
      case 'trespass':
        if (g.t <= 0) this.mischief(g);
        break;
    }
  }

  finishAmenity(g) {
    const p = this.parties[g.party];
    if (p) {
      p.flags.amen ||= {};
      if (g.st === 'shop') { this.addMoney(randi(5, 20)); if (!p.flags.amen.shop) this.adjust(p, 2, 'shopping'); }
      if (g.st === 'spa' && !p.flags.amen.spa) this.adjust(p, 5, 'spa');
      if (g.st === 'arcade' && !p.flags.amen.arcade) this.adjust(p, 3, 'fun');
      p.flags.amen[g.st] = true;
    }
    this.nextActivity(g);
  }

  arrived(g) {
    const nd = g.dest ? L.NODES[g.dest] : null;
    g.pose = nd?.pose || null;
    if (nd && nd.ry !== undefined) g.ry = nd.ry;
    g.y = nd?.y ?? L.floorY(g.x, g.z) + (L.inPool(g.x, g.z) ? 0.35 : 0);
    const p = this.parties[g.party];
    switch (g.goal) {
      case 'enter':
        if (!p) return;
        if (g.leader) this.joinQueue(g, 'in');
        else this.waitInLobby(g);
        break;
      case 'queue': g.st = 'queue'; g.ry = Math.PI; break;
      case 'lobbyWait': g.st = 'waitParty'; break;
      case 'roomSpot': g.st = 'room'; g.t = rand(6, 14); break;
      case 'bed': g.st = 'sleep'; g.t = g.nap ? rand(12, 24) : 0; break;
      case 'seat': g.st = 'dine'; g.t = rand(1.5, 3); g.eatT = 0; break;
      case 'lounge': g.st = 'lounge'; g.t = rand(14, 26); break;
      case 'swim': g.st = 'swim'; g.t = rand(14, 26); break;
      case 'sofa': g.st = 'lounge'; g.t = rand(10, 18); break;
      case 'wander':
        g.st = 'chill';
        g.t = rand(2, 6);
        if (g.dest === 'elev' && this.lvl('vending') && p) { this.addMoney(4); this.adjust(p, 1, 'snack'); }
        break;
      case 'kiosk': g.st = 'kiosk'; g.t = 4; this.emote(g, '🖥️', 4); break;
      case 'keydrop': g.st = 'keydrop'; g.t = 1.5; this.emote(g, '🔑', 1.5); break;
      case 'buffet': g.st = 'buffet'; g.t = 2; break;
      case 'seatBack':
        g.st = 'dine';
        g.eatT = 7;
        if (this.usePlate()) { if (p) this.adjust(p, 6, 'food'); }
        else { if (p) this.adjust(p, -6, 'plates'); this.say(g, 'No clean plates at the buffet?!'); }
        break;
      case 'gift': g.st = 'shop'; g.t = rand(6, 9); break;
      case 'spa': g.st = 'spa'; g.t = rand(15, 25); break;
      case 'arcade': g.st = 'arcade'; g.t = rand(15, 28); break;
      case 'trespass':
        g.st = 'trespass';
        g.t = 32;
        this.emote(g, '👀', 32);
        this.say(g, pick(LINES.snoop));
        break;
      case 'curb': g.st = 'curb'; g.ry = 0; break;
      case 'toCheckout': this.joinQueue(g, 'out'); break;
      case 'toCar': {
        const car = p && this.cars[p.car];
        if (car) this.walkDirect(g, car.x + rand(-0.5, 0.5), car.z - 1.3, 'board');
        else this.idleFor(g, 2);
        break;
      }
      case 'board': this.boardCar(g); break;
      case 'exit': this.removeGuest(g); break;
      case 'hunt': this.killerStrike(g); break;
      case 'inspect': this.agentInspect(g); break;
      case 'ritual': g.st = 'ritual'; g.t = 5; this.emote(g, '🔥', 5); break;
      case 'replace': this.doppelStrike(g); break;
      case 'lost': case 'lockout': case 'vending': this.incidentArrived(g); break;
      default: g.st = 'chill'; g.t = rand(2, 5);
    }
  }

  waitInLobby(g) {
    const free = L.SOFAS.filter(id => !this.taken[id]);
    if (free.length) this.walkTo(g, pick(free), 'lobbyWait');
    else this.walkTo(g, pick(['lob_c', 'lob_w', 'lob_pool', 'door_in']), 'lobbyWait');
  }

  idleFor(g, t) { g.st = 'chill'; g.t = t; }

  nextActivity(g) {
    const p = this.parties[g.party];
    if (!p) return;
    if (p.st !== 'staying') { this.idleFor(g, 2); return; }
    if (g.special) { this.goRoom(g, 'bed'); return; }
    const A = ARCH[p.kind];
    const H = this.hour();
    if (A.vampire && H >= 29) { this.goRoom(g, 'bed'); return; }
    if (this.isNight() && !chance(A.nightOwl || 0.08)) { this.goRoom(g, 'bed'); return; }
    if (this.isBreakfast() && !g.ate && chance(A.foodLove ?? 0.8) && this.goDine(g)) return;
    const snoop = (SNOOP[g.kind] || 0) * 0.02 * (this.chores || 1) * (g.kind === 'kid' && this.lvl('arcade') ? 0.3 : 1);
    if (snoop && !this.isNight() && chance(snoop) && this.trespassers().length < 2) { this.goTrespass(g); return; }
    const w = { room: 3, pool: (A.pool || 0) * 10, lobby: 1.2, wander: 1, dine: H >= 17.5 && H < 21.5 && (A.foodLove || 0) > 0.2 ? 0.7 : 0 };
    if (this.lvl('giftshop')) w.gift = 0.6;
    if (this.lvl('spa')) w.spa = (A.pool || 0.1) * 5;
    if (this.lvl('arcade')) w.arcade = g.kind === 'kid' ? 3 : 0.15;
    if (this.lvl('floor3')) w.lounge = this.isNight() ? 0.3 : 0.9;
    if (this.isNight()) { w.pool *= 0.5; w.lobby *= 0.5; w.gift = 0; }
    if (g.kind === 'kid') { w.pool *= 1.8; w.wander *= 2.5; w.room *= 0.6; }
    if (!this.power) { w.pool = 0; w.dine = 0; w.spa = 0; w.arcade = 0; }
    switch (weighted(w)) {
      case 'pool': if (!this.goPool(g)) this.goRoom(g); break;
      case 'lobby': if (!this.goSofa(g)) this.goRoom(g); break;
      case 'wander': this.walkTo(g, pick(this.wanderSpots()), 'wander'); break;
      case 'lounge': if (!this.goSpot(g, L.LOUNGE, 'sofa')) this.goRoom(g); break;
      case 'dine': if (!this.goDine(g)) this.goRoom(g); break;
      case 'gift': this.walkTo(g, 'gift', 'gift'); break;
      case 'spa': if (!this.goSpot(g, L.SPA_SPOTS, 'spa')) this.goRoom(g); break;
      case 'arcade': if (!this.goSpot(g, L.ARCADE_SPOTS, 'arcade')) this.goRoom(g); break;
      default: this.goRoom(g);
    }
  }

  goSpot(g, spots, goal) {
    const free = spots.filter(id => !this.taken[id]);
    if (!free.length) return false;
    this.walkTo(g, pick(free), goal);
    return true;
  }

  // ---------- snooping guests ----------
  trespassers() { return Object.values(this.guests).filter(g => !g.hidden && (g.st === 'trespass' || g.snoop)); }

  goTrespass(g) {
    const A = ARCH[this.parties[g.party].kind];
    let spots = SNOOP_SPOTS;
    if (A.cult) spots = spots.filter(s => s.mischief === 'basement' || s.mischief === 'breaker');
    else if (A.vampire) spots = spots.filter(s => s.mischief === 'kitchen');
    g.snoop = pick(spots);
    this.walkTo(g, g.snoop.node, 'trespass', 1, { free: true });
  }

  mischief(g) {
    const spot = g.snoop;
    g.snoop = null;
    const p = this.parties[g.party];
    if (spot) switch (spot.mischief) {
      case 'kitchen': {
        const i = this.stoves.findIndex(s => s && !s.bot);
        if (i >= 0) { this.stoves[i].t += 99; this.toast(null, '🚷 A snooping guest burned the food on the stove!', 'bad'); }
        else { this.spawnMess('spill', g.x, g.z, { force: true }); this.spawnMess('trash', g.x + 0.6, g.z + 0.3, { force: true }); this.toast(null, '🚷 A snooping guest trashed the Kitchen.', 'bad'); }
        break;
      }
      case 'laundry':
        for (let i = 0; i < 2; i++) this.spawnMess('trash', g.x + rand(-1, 1), g.z + rand(-1, 1), { force: true });
        this.toast(null, '🚷 A snooping guest threw towels all over the Laundry.', 'bad');
        break;
      case 'breaker':
        if (this.power) { this.blackout(); this.toast(null, '🚷 A snooping guest flipped the breaker!', 'bad'); }
        break;
      case 'basement':
        if ((ARCH[p?.kind]?.cult || ARCH[p?.kind]?.ghost) && chance(0.6)) {
          this.spawnMonster('shade', L.BASEMENT.x - 1, L.BASEMENT.z, 50);
          this.sound('sting', L.BASEMENT);
          this.toast(null, '🚷 Someone opened the basement door. Something came out.', 'horror');
        } else { this.spawnMess('trash', g.x, g.z, { force: true }); this.toast(null, '🚷 A snooping guest rummaged through Storage.', 'bad'); }
        break;
      case 'snack':
        this.money = Math.max(0, this.money - 20);
        this.toast(null, '🚷 A snooping guest ate the staff\'s lunch. (−$20)', 'bad');
        break;
      case 'tipjar':
        this.money = Math.max(0, this.money - 25);
        this.sound('bell', L.STATIONS.desk);
        this.toast(null, '🚷 A guest behind the front desk pocketed the tip jar. (−$25)', 'bad');
        break;
    }
    this.emote(g, '😈', 3);
    if (p?.room) this.walkTo(g, `r${p.room}_mid`, 'roomSpot'); else this.walkTo(g, 'lob_c', 'wander');
  }

  // A player (or the doorman / night guard) walks a snooping guest back out.
  escortGuest(g, pl, helper) {
    if (!g || g.hidden) return false;
    if (!(g.st === 'trespass' || g.snoop || L.isStaffArea(g.x, g.z))) return false;
    g.snoop = null;
    this.say(g, pick(g.kind === 'kid' ? LINES.escortKid : LINES.escort));
    const p = this.parties[g.party];
    if (p?.room && p.st === 'staying') this.walkTo(g, `r${p.room}_mid`, 'roomSpot'); else this.walkTo(g, 'lob_c', 'wander');
    this.stats.escorts++;
    if (pl) this.toast(pl.id, '🚷 Guest escorted out of the staff area.', 'good');
    if (helper) this.say(helper, 'Staff only, please.');
    return true;
  }

  goRoom(g, which) {
    const p = this.parties[g.party];
    if (!p || !p.room) { this.idleFor(g, 3); return false; }
    which = which || pick(['mid', 'desk', 'tv', 'bath', 'mid', 'bed']);
    g.nap = which === 'bed' && !this.isNight();
    this.walkTo(g, `r${p.room}_${which}`, which === 'bed' ? 'bed' : 'roomSpot');
    return true;
  }

  goPool(g) {
    const swim = chance(0.6);
    const free = (swim ? L.SWIMS : L.LOUNGERS).filter(id => !this.taken[id]);
    if (!free.length) return false;
    this.walkTo(g, pick(free), swim ? 'swim' : 'lounge');
    return true;
  }

  goSofa(g) {
    const free = L.SOFAS.filter(id => !this.taken[id]);
    if (!free.length) return false;
    this.walkTo(g, pick(free), 'sofa');
    return true;
  }

  goDine(g) {
    const dirty = new Set(Object.values(this.messes).filter(m => m.t === 'table').map(m => m.table));
    const free = L.SEATS.filter(id => !this.taken[id] && !dirty.has(L.NODES[id].table));
    if (!free.length) return false;
    const p = this.parties[g.party];
    const myTables = new Set(p.members.map(id => this.guests[id]?.spot).filter(s => s && L.NODES[s].table !== undefined).map(s => L.NODES[s].table));
    const near = free.filter(id => myTables.has(L.NODES[id].table));
    this.walkTo(g, pick(near.length ? near : free), 'seat');
    return true;
  }

  updateSleeper(g) {
    const p = this.parties[g.party];
    const A = ARCH[p?.kind] || {};
    let wake;
    if (A.vampire) wake = this.hour() >= 20 && this.hour() < 29 && g.t <= -20;
    else wake = g.nap ? g.t <= 0 : !this.isNight();
    if (!wake) return;
    if (p?.room && chance(0.6)) this.ensureBedMess(p.room);
    this.nextActivity(g);
  }


  wanderSpots() { return L.WANDER.filter(id => L.isActive(L.NODES[id])); }

  // Walks e along its waypoints. It rounds the corner at each intermediate waypoint rather than stopping
  // dead on it, keeps to the ground (the pool floor, the stair treads) and faces where it's going.
  stepAlong(e, path, speed, dt) {
    let step = speed * (L.inPool(e.x, e.z) ? 0.6 : 1) * dt;
    while (path.length && step > 0) {
      const tgt = path[0];
      const dx = tgt.x - e.x, dz = tgt.z - e.z, d = Math.hypot(dx, dz);
      if (d > 0.01) e.ry = Math.atan2(dx, dz);
      const cut = !tgt.hard && path.length > 1 ? 0.3 : 0;
      if (d > step + cut) { e.x += (dx / d) * step; e.z += (dz / d) * step; break; }
      if (d <= step) { e.x = tgt.x; e.z = tgt.z; step -= d; }
      else { e.x += (dx / d) * step; e.z += (dz / d) * step; step = 0; }
      path.shift();
      if (path.length && L.floorOf(path[0].x) !== L.floorOf(e.x)) break; // the elevator or the stairs take over
    }
    e.y = this.groundY(e);
  }

  groundY(e) { return L.inPool(e.x, e.z) ? L.POOL.floorY + 0.35 : L.surfaceY(e.x, e.z, e.y || 0); }

  // Floor changes: halfway up a spiral, stepping onto the upper floor's half of the stairwell is
  // instant (the two waypoints are the same spot); anything else waits for the elevator, then steps out
  // on the new floor. Returns true while a ride is under way (the caller skips walking).
  ride(e, path, dt) {
    const tgt = path[0];
    if (!tgt || L.floorOf(tgt.x) === L.floorOf(e.x)) return false;
    if (tgt.stair) {
      const df = L.floorOf(tgt.x) - L.floorOf(e.x);
      e.x = tgt.x;
      e.z = tgt.z;
      e.y = (e.y || 0) - df * L.FLOOR_H;
      path.shift();
      if (this.elevOut && e.party && df > 0) this.stairGrumble(e);
      return !path.length;
    }
    e.anim = 'idle';
    e.rideT = (e.rideT || 0) + dt;
    if (e.rideT < 1.4) return true;
    e.rideT = 0;
    e.x = tgt.x;
    e.z = tgt.z;
    path.shift();
    this.sound('ding', tgt);
    return true;
  }

  // The shift ends only once every guest is gone and the task list is empty. From noon (or once the
  // last guest has left after breakfast) the clock stops and the crew closes up. If nobody finishes,
  // corporate's cleaners turn up after a while and bill the hotel for whatever is left.
  closingTick(H) {
    const guestsDone = !this.schedule.length && !Object.values(this.parties).some(p => p.st !== 'gone' && !p.surveyed);
    if (!this.closingAt && (H >= END_H || (H > 30.5 && guestsDone))) {
      this.closingAt = this.clock;
      this.buildTasks();
      this.toast(null, '🔔 Closing time. The shift ends when every job on the list is done.', 'info');
      this.sound('bell', L.STATIONS.desk);
    }
    if (!this.closingAt) return;
    const left = this.openTasks();
    if (guestsDone && !left) { this.endShift(); return; }
    if (this.clock - this.closingAt > CLOSING_LIMIT) {
      const bill = Math.min(this.money, 60 + 35 * left);
      this.money -= bill;
      this.toast(null, `🧹 Corporate's cleaners finished the last ${left} job${left === 1 ? '' : 's'} and billed you ${bill}.`, 'bad');
      for (const p of Object.values(this.parties)) if (!p.surveyed && p.st !== 'gone') this.finishParty(p);
      this.endShift();
    }
  }

  openTasks() { return this.tasks.filter(t => !t.mon).length; }

  // ---------- queue & front desk ----------
  joinQueue(g, mode) {
    const p = this.parties[g.party];
    const A = ARCH[p.kind];
    g.qmode = mode;
    g.qwait = 0;
    g.bellT = 7;
    g.deskT = 0;
    g.patience = (mode === 'in' ? 85 : 65) * (A.patience || 1) * (this.lvl('muzak') ? 1.5 : 1) * this.slack;
    this.queue.push(g.id);
    g.qspot = -1;
    this.reflowQueue();
  }

  queueRemove(g) {
    const i = this.queue.indexOf(g.id);
    if (i < 0) return;
    this.queue.splice(i, 1);
    g.qspot = undefined;
    this.reflowQueue();
  }

  reflowQueue() {
    this.queue.forEach((gid, i) => {
      const g = this.guests[gid];
      if (!g || g.qspot === i) return;
      g.qspot = i;
      if (i < L.QUEUE.length) this.walkTo(g, L.QUEUE[i], 'queue');
      else this.walkTo(g, pick(['lob_c', 'lob_pool', 'door_in']), 'queue');
    });
  }

  deskGuest() {
    const g = this.guests[this.queue[0]];
    if (!g || g.path.length || g.st !== 'queue') return null;
    return g;
  }

  updateQueue(dt) {
    for (let i = 0; i < this.queue.length; i++) {
      const g = this.guests[this.queue[i]];
      if (!g) { this.queue.splice(i--, 1); continue; }
      const p = this.parties[g.party];
      g.qwait += dt;
      g.patience -= dt;
      if (g.qwait > 22) this.adjust(p, -0.11 * dt * (this.lvl('muzak') ? 0.5 : 1), 'wait');
      if (g.patience <= 0) {
        this.queueRemove(g);
        this.giveUp(p, g);
        i--;
      }
    }
    const f = this.deskGuest();
    if (f) {
      f.deskT += dt;
      f.bellT -= dt;
      if (f.bellT <= 0) { f.bellT = 9; this.sound('bell', L.STATIONS.desk); }
      if (this.lvl('kiosk') && f.qmode === 'in' && f.deskT > 5) {
        const p = this.parties[f.party];
        if (p.card.res && this.bestTier(p)) { this.queueRemove(f); this.walkTo(f, 'kiosk', 'kiosk'); }
      }
    }
  }

  kioskCheckIn(g) {
    const p = this.parties[g.party];
    if (!p) return;
    const tier = this.bestTier(p);
    const room = tier && this.pickRoom(p, tier);
    if (!room) { this.joinQueue(g, 'in'); return; }
    this.checkIn(p, room, null);
    this.toast(null, `🖥️ ${p.name} checked in at the kiosk.`, 'info');
  }

  giveUp(p, g) {
    if (g.qmode === 'in') {
      this.say(g, pick(LINES.angryWait));
      this.adjust(p, -35, 'wait');
      if (p.threat) p.surveyed = true;
      this.leaveHotel(p, true);
    } else {
      this.say(g, 'I\'m just leaving.');
      this.adjust(p, -15, 'wait');
      this.vacate(p);
      this.depart(p);
    }
  }

  deskAction(pl, a) {
    const g = this.deskGuest();
    if (!g || g.id !== a.g) { this.toast(pl.id, 'Nobody is at the desk anymore.'); return; }
    if (dsq(pl, L.STATIONS.desk) > 16) return;
    const p = this.parties[g.party];
    if (g.qmode === 'in' && a.ch === 'admit') {
      const tier = TIERS[a.tier] ? a.tier : 'basic';
      const room = this.pickRoom(p, tier);
      if (!room) { this.toast(pl.id, `No clean ${TIERS[tier].name.toLowerCase()} available!`, 'bad'); return; }
      this.queueRemove(g);
      if (g.qwait < 25) this.adjust(p, 5, 'fast');
      this.checkIn(p, room, pl);
    } else if (g.qmode === 'in' && a.ch === 'deny') {
      this.queueRemove(g);
      this.turnAway(p, pl);
    } else if (g.qmode === 'out' && a.ch === 'checkout') {
      this.queueRemove(g);
      if (g.qwait < 20) this.adjust(p, 3, 'fast');
      this.vacate(p);
      this.depart(p);
      this.sound('ding', L.STATIONS.desk);
    }
  }

  vacantRooms(tier) {
    return Object.values(this.rooms).filter(r => r.st === 'vacant' && this.roomOpen(r.id) && (!tier || this.tierOf(r.id) === tier));
  }

  pickRoom(p, tier) {
    const free = this.vacantRooms(tier);
    if (!free.length) return null;
    if (p.kind === 'killer') {
      const ends = free.filter(r => END_ROOMS.includes(r.id));
      if (ends.length) return pick(ends);
    }
    return pick(free);
  }

  // The tier this guest would like most among the rooms that are free right now.
  bestTier(p) {
    for (const t of TIER_PREF[p.taste] || TIER_PREF.standard) if (this.vacantRooms(t).length) return t;
    return null;
  }

  checkIn(p, room, pl) {
    const A = ARCH[p.kind];
    const tier = this.tierOf(room.id);
    p.tier = tier;
    let bonus = TASTE_BONUS[p.taste]?.[tier] || 0;
    if (bonus < 0) {
      // Fancy guests forgive a plain room when nothing better was free, and mostly shrug if the
      // hotel has no suites at all. Handing out a plain room while a suite sits empty stings.
      const prefs = TIER_PREF[p.taste] || [];
      const better = prefs.slice(0, Math.max(0, prefs.indexOf(tier)));
      if (!better.some(t => this.vacantRooms(t).length)) {
        bonus = better.some(t => this.openRooms().some(r => this.tierOf(r.id) === t)) ? Math.round(bonus / 2) : Math.max(bonus, -3);
      }
    }
    if (bonus) this.adjust(p, bonus, 'room');
    if (this.lvl('cookies')) this.adjust(p, 3, 'welcome');
    room.st = 'occupied';
    room.party = p.id;
    room.curtains = true;
    room.cold = false;
    room.dnd = p.kind === 'killer';
    p.room = room.id;
    p.roomWas = room.id;
    p.st = 'staying';
    p.checkedIn = true;
    p.checkinClock = this.clock;
    this.addMoney(Math.round(A.rate * TIERS[tier].price * (this.lvl('billboard') ? 1.1 : 1)));
    for (let i = 0; i < p.luggage; i++) {
      const spot = L.LUGGAGE_SPOTS.find(([x, z]) => !Object.values(this.items).some(it => it.t === 'luggage' && !it.holder && (it.x - x) ** 2 + (it.z - z) ** 2 < 0.2));
      const [x, z] = spot || [rand(0.4, 2.4), rand(-6.4, -4.4)];
      const it = this.spawnItem('luggage', x, 0, z, { room: room.id, party: p.id, color: p.color });
      p.luggageItems.push(it.id);
    }
    p.luggageDue = this.clock + LUGGAGE_TIME * (this.lvl('cart') ? 1.5 : 1) * this.slack;
    p.luggagePen = false;
    const leader = this.guests[p.leader];
    if (leader) this.say(leader, pick(LINES.checkin));
    for (const gid of p.members) this.walkTo(this.guests[gid], `r${room.id}_mid`, 'roomSpot');
    this.sound('kaching', L.STATIONS.desk);
    if (pl && p.threat) this.toast(null, `🛎️ ${p.name} checked into ${L.roomName(room.id)}.`, 'info');
  }

  turnAway(p, pl) {
    if (p.threat) {
      p.surveyed = true;
      this.stats.caught++;
      const line = { killer: 'Another time, then.', agent: 'We\'ll be watching.', priest: 'The stars will wait.', doppel: 'WE WILL COME BACK.' }[p.kind] || 'Hmph.';
      const g = this.guests[p.leader];
      if (g) this.say(g, line, 4);
      this.toast(null, `🚫 ${pl.name} turned away ${p.name}. Good instincts.`, 'good');
      this.addMoney(50);
    } else {
      this.finishParty(p, { stars: 1, reason: 'turnedAway' });
      this.toast(pl.id, `${p.name} stormed off. That's a 1-star review.`, 'bad');
    }
    this.leaveHotel(p, true);
  }

  // Party leaves on foot (or in its car, if the car is still at the curb).
  leaveHotel(p, angry) {
    p.st = 'departing';
    for (const iid of p.luggageItems) { this.detachItem(this.items[iid]); delete this.items[iid]; }
    p.luggageItems = [];
    const car = p.car && this.cars[p.car];
    if (car && !car.driver && car.st === 'valet') { car.st = 'pickup'; this.boardAll(p, car); }
    else {
      if (car && !car.driver) { delete this.cars[car.id]; p.car = null; }
      if (!p.surveyed) this.finishParty(p);
      for (const gid of p.members) {
        const g = this.guests[gid];
        if (g) { this.cancelOrder(g); this.walkTo(g, pick(L.EXITS), 'exit', angry ? 1.3 : 1); }
      }
    }
  }

  vacate(p) {
    const room = p.room && this.rooms[p.room];
    if (room && room.party === p.id) {
      const tier = this.tierOf(room.id);
      room.st = 'dirty';
      room.party = null;
      room.dnd = false;
      room.cold = false;
      this.spawnRoomMess(room.id, tier === 'pres' ? randi(4, 6) : tier === 'suite' ? randi(2, 4) : randi(1, 3));
      this.ensureBedMess(room.id);
      if (this.lvl('minibar') && p.checkedIn) this.addMoney(tier === 'basic' ? 15 : 40);
    }
    p.room = null;
    p.request = null;
  }

  depart(p) {
    p.st = 'departing';
    for (const iid of p.luggageItems) { this.detachItem(this.items[iid]); delete this.items[iid]; }
    p.luggageItems = [];
    for (const gid of p.members) { const g = this.guests[gid]; if (g) this.cancelOrder(g); }
    const car = p.car && this.cars[p.car];
    if (car) {
      if (car.st !== 'departing' && this.inPickup(car) && !car.driver) { car.st = 'pickup'; this.boardAll(p, car); }
      else { car.st = 'retrieve'; car.retrieveAt = this.clock; car.due = this.clock + 50 * this.slack; p.st = 'curb'; p.curbDue = car.due; this.membersToCurb(p); }
    } else if (p.flags.carGone) {
      p.st = 'curb'; p.curbDue = this.clock + 10; p.flags.noCar = true; this.membersToCurb(p);
    } else {
      this.finishParty(p);
      for (const gid of p.members) { const g = this.guests[gid]; if (g) this.walkTo(g, pick(L.EXITS), 'exit'); }
    }
  }

  membersToCurb(p) {
    for (const gid of p.members) { const g = this.guests[gid]; if (g) this.walkTo(g, pick(['curb_w', 'curb_c', 'curb_e']), 'curb'); }
  }

  boardAll(p, car) {
    const curb = ['curb_w', 'curb_c', 'curb_e'].sort((a, b) => dsq(L.NODES[a], car) - dsq(L.NODES[b], car))[0];
    for (const gid of p.members) {
      const g = this.guests[gid];
      if (!g) continue;
      if (L.zoneAt(g.x, g.z).id === 'outside') this.walkDirect(g, car.x + rand(-0.5, 0.5), car.z - 1.3, 'board');
      else this.walkTo(g, curb, 'toCar');
    }
  }

  boardCar(g) {
    g.hidden = true;
    const p = this.parties[g.party];
    if (!p) return;
    const car = this.cars[p.car];
    if (!car || p.members.some(id => this.guests[id] && !this.guests[id].hidden)) return;
    this.finishParty(p);
    for (const id of [...p.members]) this.removeGuest(this.guests[id]);
    p.st = 'gone';
    car.st = 'departing';
    car.party = null;
    car.path = [{ x: car.x - 8, z: L.ROAD_Z }, { x: -100, z: L.ROAD_Z }];
    this.sound('honk', car);
  }

  updateParty(p, dt) {
    if (p.st === 'gone') return;
    const A = ARCH[p.kind];
    if (p.st === 'staying') {
      if (this.hour() >= p.checkoutH && !p.busy) { this.startCheckout(p); return; }
      if (p.request) { p.request.t -= dt; if (p.request.t <= 0) this.failRequest(p); }
      else if (this.clock >= p.nextReq && !this.partyAsleep(p) && Object.keys(A.req).length) this.makeRequest(p);
      if (p.luggageItems.length && this.clock > p.luggageDue && !p.luggagePen) { p.luggagePen = true; this.adjust(p, -8, 'luggage'); }
      if (this.circles && A.cult && p.kind === 'cultist' && this.clock >= p.nextCircle) this.drawCircle(p);
    } else if (p.st === 'curb') {
      if (this.clock > p.curbDue) this.adjust(p, -0.22 * dt, 'valet');
      if (p.flags.noCar && this.clock > p.curbDue) {
        this.adjust(p, -40, 'carGone');
        p.flags.noCar = false;
        this.finishParty(p);
        for (const gid of p.members) { const g = this.guests[gid]; if (g) this.walkTo(g, pick(L.EXITS), 'exit'); }
        p.st = 'departing';
      }
    }
  }

  partyAsleep(p) { return p.members.every(id => this.guests[id]?.st === 'sleep'); }

  startCheckout(p) {
    p.st = 'checkout';
    p.request = null;
    if (!this.guests[p.leader]) { this.vacate(p); this.depart(p); return; }
    for (const gid of p.members) {
      const g = this.guests[gid];
      if (!g) continue;
      this.cancelOrder(g);
      if (gid === p.leader) this.walkTo(g, this.lvl('express') ? 'keybox' : 'lob_c', this.lvl('express') ? 'keydrop' : 'toCheckout');
      else this.waitInLobby(g);
    }
  }

  adjust(p, d, reason) {
    if (!p || p.surveyed) return;
    if (d < 0) {
      const cap = COMPLAINT_CAPS[reason];
      const had = p.comp[reason] || 0;
      if (cap !== undefined) d = -Math.min(-d, Math.max(0, cap - had));
      if (d === 0) return;
      p.comp[reason] = had - d;
    } else p.praise[reason] = (p.praise[reason] || 0) + d;
    p.sat = clamp(p.sat + d, 0, 100);
    if (Math.abs(d) >= 3) this.emote(this.guests[p.leader], d > 0 ? '😊' : '😠');
  }

  finishParty(p, opt = {}) {
    if (p.surveyed) return;
    if (this.lvl('bedding') && p.checkedIn && !opt.reason) this.adjust(p, 4, 'room');
    p.surveyed = true;
    let stars = opt.stars ?? satToStars(p.sat);
    if (p.kind === 'killer') stars = this.evidenceLeft() ? 3 : 5;
    const text = p.kind === 'killer' ? surveyText(p, stars) : surveyText(p, stars, opt.reason);
    const s = { name: p.name, kind: p.kind, stars, text, room: p.roomWas, tier: p.tier, w: ARCH[p.kind].reviewWeight || 1 };
    this.roundSurveys.push(s);
    this.send({ k: 'ev', e: 'survey', s });
    if (stars >= 4.5) { this.addMoney(20); if (this.lvl('loyalty')) this.addMoney(25); }
  }

  // ---------- requests ----------
  otherOccupied(roomId) {
    return Object.values(this.rooms).filter(r => r.st === 'occupied' && r.id !== roomId && r.party && this.parties[r.party]?.st === 'staying').map(r => r.id);
  }

  makeRequest(p) {
    const A = ARCH[p.kind];
    const w = { ...A.req };
    const room = this.rooms[p.room];
    if (room.cold) delete w.cold;
    const others = this.otherOccupied(p.room);
    if (!others.length) delete w.noise;
    if (this.roomMesses(p.room).some(m => m.t === 'clog')) delete w.clog;
    if (this.lvl('soundproof') && w.noise) w.noise *= 0.3;
    if (this.lvl('toilets') && w.clog) w.clog *= 0.5;
    const type = weighted(w);
    if (!type) { p.nextReq = this.clock + 30; return; }
    const req = { type, t: REQUEST_TIME * REQUESTS[type].time * this.slack };
    req.max = req.t;
    if (type === 'food') req.dish = pick(A.roomService || this.menuFor(p));
    if (type === 'noise') {
      const loud = others.filter(id => ['office', 'family', 'cultist', 'ghost'].includes(this.parties[this.rooms[id].party]?.kind));
      req.target = pick(loud.length ? loud : others);
    }
    if (type === 'clog') { const r = L.ROOM_BY_ID[p.room]; this.spawnMess('clog', r.toilet.x, r.toilet.z, { room: p.room, y: 0.42, force: true }); }
    if (type === 'housekeeping') { this.spawnRoomMess(p.room, randi(1, 2)); this.ensureBedMess(p.room); }
    p.request = req;
    this.sound('phone', L.STATIONS.desk);
  }

  failRequest(p) {
    this.adjust(p, -14, 'request');
    const g = this.guests[p.leader];
    if (g) this.say(g, 'Does anyone work here?!');
    const hungry = ARCH[p.kind].vampire && p.request.type === 'food';
    p.request = null;
    p.nextReq = this.clock + rand(45, 100) / (ARCH[p.kind].reqRate || 1);
    if (hungry && !this.lvl('uv')) this.vampireBite(p);
  }

  // A vampire whose blood never came helps itself to another guest.
  vampireBite(vp) {
    const victims = Object.values(this.guests).filter(g => {
      const q = this.parties[g.party];
      return q && q !== vp && q.st === 'staying' && !q.threat && !ARCH[q.kind].vampire && !g.hidden;
    });
    if (!victims.length) return;
    const g = pick(victims);
    const q = this.parties[g.party];
    this.adjust(q, -30, 'bitten');
    this.say(g, 'OW! Did you just BITE me?!', 4);
    this.spawnMess('stain', g.x + 0.3, g.z, { force: true });
    this.sound('scream', g);
    this.toast(null, '🧛 A hungry vampire bit one of the guests!', 'horror');
  }

  fulfill(p, pl) {
    if (!p?.request) return;
    const fast = p.request.t > p.request.max * 0.5;
    this.adjust(p, 10, 'request');
    if (fast) this.adjust(p, 4, 'fast');
    const tip = fast ? randi(10, 18) : randi(4, 9);
    this.addMoney(tip);
    if (pl) this.toast(pl.id, `✅ ${L.roomName(p.room || p.roomWas)}: thanks! (+$${tip} tip)`, 'good');
    p.request = null;
    p.nextReq = this.clock + rand(45, 100) / (ARCH[p.kind].reqRate || 1);
    this.sound('chime', L.ROOM_BY_ID[p.roomWas]?.door || L.STATIONS.desk);
  }

  // ---------- items ----------
  spawnItem(t, x, y, z, extra = {}) {
    const it = { id: this.id(), t, x, y, z, ry: rand(0, 6.28), holder: null, vx: 0, vy: 0, vz: 0, fly: false, idle: 0, born: this.clock, ...extra };
    this.items[it.id] = it;
    return it;
  }

  // Items can be held by a player (positive holder id) or by a helper robot (negative id).
  detachItem(it) {
    if (!it?.holder) return;
    if (it.holder > 0 && this.players[it.holder]?.held === it.id) this.players[it.holder].held = null;
    if (it.holder < 0 && this.helpers[-it.holder]) this.helpers[-it.holder].carry = null;
  }

  returnHome(it) {
    if (!it.home) return;
    it.x = it.home.x; it.z = it.home.z; it.y = 0; it.fly = false; it.idle = 0; it.ry = 0;
  }

  heldItem(pl) { return pl.held ? this.items[pl.held] : null; }

  giveNew(pl, t, extra) {
    if (pl.held) return null;
    const it = this.spawnItem(t, pl.x, 1, pl.z, extra);
    it.holder = pl.id;
    pl.held = it.id;
    this.sound('pickup', pl);
    return it;
  }

  consumeHeld(pl) {
    if (pl.held) delete this.items[pl.held];
    pl.held = null;
  }

  dropHeld(pl, x, z) {
    const it = this.heldItem(pl);
    pl.held = null;
    if (!it) return null;
    it.holder = null;
    it.x = x ?? pl.x;
    it.z = z ?? pl.z;
    if (L.pointBlocked(it.x, it.z)) { it.x = pl.x; it.z = pl.z; }
    it.y = L.surfaceY(it.x, it.z, pl.y || 0);
    it.idle = 0;
    return it;
  }

  updateItems(dt) {
    for (const it of Object.values(this.items)) {
      if (it.holder) {
        const who = it.holder > 0 ? this.players[it.holder] : this.helpers[-it.holder];
        if (!who) { it.holder = null; continue; }
        it.x = who.x; it.z = who.z; it.y = (who.y || 0) + 1;
        continue;
      }
      if (it.fly) {
        it.vy -= 16 * dt;
        let nx = it.x + it.vx * dt, nz = it.z + it.vz * dt;
        if (L.pointBlocked(nx, nz)) { it.vx *= -0.3; it.vz *= -0.3; nx = it.x; nz = it.z; }
        it.x = nx; it.z = nz; it.y += it.vy * dt;
        const fy = L.floorY(it.x, it.z);
        if (it.y <= fy) {
          it.y = fy;
          if (Math.abs(it.vy) > 3) { it.vy *= -0.3; it.vx *= 0.55; it.vz *= 0.55; this.sound('thud', it); }
          else { it.fly = false; it.vx = it.vy = it.vz = 0; it.thrower = null; }
        }
        if (it.fly && it.thrower && this.phase === 'shift') {
          for (const g of Object.values(this.guests)) {
            if (g.hidden) continue;
            if ((g.x - it.x) ** 2 + (g.z - it.z) ** 2 < 0.4 && it.y > g.y + 0.2 && it.y < g.y + 2) { this.bonk(g, it); break; }
          }
        }
        it.ry += dt * 8;
      } else if (it.home && ITEMS[it.t].tool) {
        if ((it.x - it.home.x) ** 2 + (it.z - it.home.z) ** 2 > 1) { it.idle += dt; if (it.idle > 75) this.returnHome(it); }
        else it.idle = 0;
      }
    }
  }

  bonk(g, it) {
    const p = this.parties[g.party];
    this.adjust(p, -4, 'thrown');
    this.say(g, pick(LINES.bonk));
    this.sound('bonk', g);
    it.vx = it.vz = 0;
    it.thrower = null;
  }

  checkLuggage() {
    for (const it of Object.values(this.items)) {
      if (it.t !== 'luggage') continue;
      const p = this.parties[it.party];
      if (!p || p.room !== it.room) continue;
      const r = L.ROOM_BY_ID[it.room];
      const pos = !it.holder ? it : it.holder > 0 ? this.players[it.holder] : this.helpers[-it.holder];
      if (!pos || !L.inRect(pos.x, pos.z, r)) continue;
      const holder = it.holder > 0 ? this.players[it.holder] : null;
      if (it.holder < 0 && this.helpers[-it.holder]?.job) this.helpers[-it.holder].job.done = true; // the bellhop made it
      this.detachItem(it);
      delete this.items[it.id];
      p.luggageItems = p.luggageItems.filter(id => id !== it.id);
      const onTime = this.clock <= p.luggageDue;
      this.adjust(p, onTime ? 6 : 2, 'luggage');
      if (onTime) this.addMoney(5);
      if (holder) this.toast(holder.id, `🧳 Luggage delivered to ${L.roomName(r.id)}${onTime ? ' (+$5)' : ''}`, 'good');
      this.sound('chime', pos);
    }
  }

  // ---------- messes ----------
  spawnMess(t, x, z, extra = {}) {
    if (!extra.force && Object.keys(this.messes).length > 85) return null;
    const m = { id: this.id(), t, x, z, y: extra.y ?? 0.02, room: extra.room ?? null, ...extra };
    delete m.force;
    this.messes[m.id] = m;
    return m;
  }

  roomMesses(roomId) { return Object.values(this.messes).filter(m => m.room === roomId); }

  spawnRoomMess(roomId, n) {
    const r = L.ROOM_BY_ID[roomId];
    const p = this.parties[this.rooms[roomId].party];
    const types = p?.kind === 'alien' ? ['slime', 'trash'] : p?.kind === 'ghost' ? ['ecto', 'trash'] : p?.kind === 'office' ? ['stain', 'trash', 'vomit'] : ['trash', 'stain'];
    const used = this.roomMesses(roomId);
    const spots = shuffle(r.messSpots.slice()).filter(s => !used.some(m => (m.x - s.x) ** 2 + (m.z - s.z) ** 2 < 0.3));
    for (let i = 0; i < n && i < spots.length; i++) this.spawnMess(pick(types), spots[i].x + rand(-0.2, 0.2), spots[i].z + rand(-0.2, 0.2), { room: roomId, force: true });
  }

  ensureBedMess(roomId) {
    if (this.roomMesses(roomId).some(m => m.t === 'bed')) return;
    const r = L.ROOM_BY_ID[roomId];
    this.spawnMess('bed', r.bed.x, r.bed.z, { room: roomId, y: 0.62, force: true });
  }

  clean(pl, a) {
    const m = this.messes[a.id];
    if (!m) return;
    const def = MESSES[m.t];
    const held = this.heldItem(pl);
    if (def.tool ? held?.t !== def.tool : !!held) return;
    if (dsq(pl, m) > 20) return;
    delete this.messes[m.id];
    this.sound('clean', m);
    if (m.t === 'table' && this.platesOn()) this.giveNew(pl, 'dishes'); // the plates go back to the sink
    this.afterClean(m, pl);
  }

  // Shared bookkeeping once a mess is gone, whoever cleaned it (pl may be null for helpers).
  afterClean(m, pl) {
    if (m.room) {
      const room = this.rooms[m.room];
      const p = room.party && this.parties[room.party];
      if (m.t === 'clog' && p?.request?.type === 'clog') this.fulfill(p, pl);
      if (!this.roomMesses(m.room).length) {
        if (room.st === 'dirty') { room.st = 'vacant'; this.toast(pl ? pl.id : null, `🛏️ ${L.roomName(room.id)} is ready for guests.`, 'good'); }
        if (p?.request?.type === 'housekeeping') this.fulfill(p, pl);
      }
    }
    if (m.t === 'circle') for (const p of Object.values(this.parties)) if (p.kind === 'cultist' && p.st === 'staying') this.adjust(p, -3, 'circle');
    if (m.evidence) this.checkEvidence();
  }

  evidenceLeft() {
    return Object.values(this.messes).some(m => m.evidence) || Object.values(this.items).some(it => it.t === 'body');
  }

  checkEvidence() {
    if (this.evidenceLeft()) return;
    for (const p of Object.values(this.parties)) if (p.kind === 'killer' && !p.flags.thanked && p.st === 'staying') {
      p.flags.thanked = true;
      this.adjust(p, 15, 'discreet');
    }
  }

  updateMessTimers(dt) {
    for (const m of Object.values(this.messes)) {
      if (m.t !== 'circle') continue;
      m.charge = Math.min(1, (m.charge || 0) + dt / (70 * (this.lvl('holy') ? 2 : 1)));
      if (m.charge >= 1) {
        delete this.messes[m.id];
        this.spawnMonster('shade', m.x, m.z, 60);
        this.sound('sting', m);
        this.toast(null, '⛧ A summoning circle finished... something is loose in the hotel!', 'horror');
        for (const p of Object.values(this.parties)) if (p.kind === 'cultist' && p.st === 'staying') this.adjust(p, 8, 'ritual');
      }
    }
  }

  spawnGuestMesses(dt) {
    const count = Object.keys(this.messes).length;
    for (const g of Object.values(this.guests)) {
      if (g.hidden) continue;
      const p = this.parties[g.party];
      if (!p || p.st !== 'staying') continue;
      const A = ARCH[p.kind];
      const rate = (A.mess || 0) * (g.kind === 'kid' ? 2.2 : 1) * (this.isNight() && A.nightOwl > 0.4 ? 1.6 : 1) * this.chores;
      if (!rate) continue;
      const zn = L.zoneAt(g.x, g.z);
      if (zn.id === 'room' && zn.room === p.room && (g.st === 'room' || g.st === 'sleep')) {
        if (chance(rate * 0.005 * dt) && this.roomMesses(p.room).length < 3) this.spawnRoomMess(p.room, 1);
      } else if (PUBLIC_ZONES.has(zn.id) && g.path.length && !L.inPool(g.x, g.z) && count < 60) {
        if (chance(rate * 0.011 * dt)) {
          const t = pick(A.messTypes || ['spill', 'trash', 'mud']);
          this.spawnMess(t, g.x + rand(-0.3, 0.3), g.z + rand(-0.3, 0.3));
        }
      }
    }
  }

  // Guests notice messes and bodies near them — but only in the same room/area (no x-ray vision).
  checkSightings() {
    const zkey = (x, z) => { const zn = L.zoneAt(x, z); return zn.room ? 'R' + zn.room : zn.id; };
    const messes = Object.values(this.messes).map(m => ({ m, k: zkey(m.x, m.z) }));
    const bodies = Object.values(this.items).filter(it => it.t === 'body' && !it.holder).map(b => ({ b, k: zkey(b.x, b.z) }));
    for (const g of Object.values(this.guests)) {
      if (g.hidden || g.run > 1.4) continue;
      const p = this.parties[g.party];
      if (!p || p.surveyed || p.threat || p.st === 'arriving' && !p.spawned) continue;
      const zn = L.zoneAt(g.x, g.z);
      const gk = zn.room ? 'R' + zn.room : zn.id;
      for (const { m, k } of messes) {
        if (k !== gk || p.seen.has(m.id) || !this.messes[m.id]) continue;
        if ((m.x - g.x) ** 2 + (m.z - g.z) ** 2 > 12.25) continue;
        p.seen.add(m.id);
        this.reactToMess(p, g, m, zn);
        if (p.surveyed) break;
      }
      if (p.surveyed) continue;
      for (const { b, k } of bodies) {
        if (k !== gk || (b.x - g.x) ** 2 + (b.z - g.z) ** 2 > 9) continue;
        this.horrify(p, g);
        break;
      }
    }
  }

  reactToMess(p, g, m, zn) {
    const A = ARCH[p.kind];
    switch (m.t) {
      case 'blood':
        if (A.vampire) this.adjust(p, 3, 'snack');
        else this.horrify(p, g);
        return;
      case 'circle':
        if (A.cult) this.adjust(p, 2, 'ritual'); else this.adjust(p, -6, 'creepy');
        return;
      case 'slime': if (p.kind !== 'alien') this.adjust(p, -3, 'mess'); return;
      case 'ecto': if (!A.ghost) this.adjust(p, -3, 'mess'); return;
      case 'vomit': this.adjust(p, -4, 'mess'); return;
      case 'debris': return;
      case 'bed': case 'clog':
        if (m.room === p.room) this.adjust(p, -1.5, 'roomDirty');
        return;
      default:
        if (m.room && m.room === p.room) this.adjust(p, -1.5, 'roomDirty');
        else if (!m.room && zn.pub) this.adjust(p, -1.5, 'mess');
    }
  }

  horrify(p, g, reason = 'horror') {
    if (p.surveyed || p.threat || p.st === 'gone') return;
    this.adjust(p, -65, reason);
    this.say(g, pick(LINES.scared), 4);
    this.sound('scream', g);
    this.stats.fled++;
    this.vacate(p);
    for (const iid of p.luggageItems) { this.detachItem(this.items[iid]); delete this.items[iid]; }
    p.luggageItems = [];
    const car = p.car && this.cars[p.car];
    if (car && !car.driver) delete this.cars[p.car];
    p.car = null;
    p.st = 'fled';
    this.finishParty(p);
    for (const gid of p.members) {
      const m = this.guests[gid];
      if (!m || m.hidden) continue;
      this.queueRemove(m);
      this.cancelOrder(m);
      this.emote(m, '😱', 99);
      this.walkTo(m, pick(L.EXITS), 'exit', 2.6);
    }
    this.toast(null, `😱 ${p.name} saw something horrible and fled the hotel!`, 'horror');
  }

  roomTick(dt) {
    for (const p of Object.values(this.parties)) {
      if (p.st !== 'staying' || !p.room) continue;
      const r = L.ROOM_BY_ID[p.room];
      const room = this.rooms[p.room];
      // Everyone inside who isn't on their way out.
      const inside = p.members.map(id => this.guests[id]).filter(g => g && !g.hidden && L.inRect(g.x, g.z, r) && (!g.path.length || L.inRect(g.path[g.path.length - 1].x, g.path[g.path.length - 1].z, r)));
      this.updateDnd(p, room, inside);
      const present = inside.filter(g => !g.path.length);
      if (!present.length) continue;
      const n = this.roomMesses(p.room).length;
      if (n >= 2) this.adjust(p, -0.06 * (n - 1) * dt, 'roomDirty');
      if (!this.power) this.adjust(p, -0.05 * dt, 'blackout');
      if (room.dnd) this.checkIntruders(p, room, r, present, dt);
    }
    if (!this.power) for (const p of Object.values(this.parties)) if (p.st === 'staying') this.adjust(p, -0.03 * dt, 'blackout');
  }

  // Guests settling into their room usually hang the DO NOT DISTURB sign (always, if they're going to
  // sleep). It comes down when they head out or call for someone to come in. The quiet guest's never does.
  updateDnd(p, room, inside) {
    if (p.kind === 'killer') { room.dnd = true; return; }
    const invited = ['housekeeping', 'clog', 'cold'].includes(p.request?.type);
    if (!inside.length || invited || p.luggageItems.length) { room.dnd = false; room.dndRoll = null; return; }
    if (inside.some(g => g.st === 'sleep' || g.goal === 'bed')) room.dndRoll = true;
    else room.dndRoll ??= chance(DND_CHANCE);
    room.dnd = room.dndRoll;
  }

  // Walking in on guests behind a DO NOT DISTURB sign: they shout at once, and keep getting angrier
  // for as long as you stay. Waking them up is worse.
  checkIntruders(p, room, r, present, dt) {
    const intruder = Object.values(this.players).find(pl => !pl.down && L.inRect(pl.x, pl.z, r) && !this.carriesLuggageFor(pl, room.id));
    if (!intruder) { room.intrudeT = 0; return; }
    const g = present.find(m => m.st === 'sleep') || present[0];
    const t0 = room.intrudeT || 0;
    room.intrudeT = t0 + dt;
    if (!t0) {
      const woke = g.st === 'sleep';
      this.adjust(p, woke ? -10 : -6, 'privacy');
      this.say(g, woke ? pick(LINES.dndWoke) : pick(LINES.dnd), 3.5);
      this.emote(g, '😡', 4);
      this.sound('bad', g);
      this.toast(intruder.id, `🚫 ${L.roomName(room.id)} has DO NOT DISTURB up, and the guests are inside. Get out!`, 'bad');
    } else if (Math.floor((room.intrudeT + 1) / 4) > Math.floor((t0 + 1) / 4)) { // at 3 s, 7 s, 11 s...
      this.adjust(p, -4, 'privacy');
      this.say(g, pick(LINES.dnd), 3);
      this.emote(g, '😡', 3);
    }
  }

  carriesLuggageFor(pl, roomId) {
    const it = this.heldItem(pl);
    return it?.t === 'luggage' && it.room === roomId;
  }

  poolTick(dt) {
    const swimmers = Object.values(this.guests).filter(g => g.st === 'swim' && !g.path.length);
    const debris = Object.values(this.messes).filter(m => m.t === 'debris');
    this.debrisT -= dt * (1 + swimmers.length * 0.45 + swimmers.filter(g => g.kind === 'kid').length * 0.8) * this.chores;
    if (this.debrisT <= 0 && !this.closingAt) {
      this.debrisT = 26 * (this.lvl('chlorine') ? 1.65 : 1);
      if (debris.length < 12) this.spawnMess('debris', rand(L.POOL.x1 + 0.6, L.POOL.x2 - 0.6), rand(L.POOL.z1 + 0.6, L.POOL.z2 - 0.6), { y: L.POOL.waterY + 0.03 });
    }
    const parties = new Set(swimmers.map(g => this.parties[g.party]));
    for (const p of parties) {
      if (!p) continue;
      if (debris.length > 1) this.adjust(p, -0.08 * (debris.length - 1) * dt, 'pool');
      else if (!p.flags.poolPraised) { p.flags.poolPraised = true; this.adjust(p, 2, 'pool'); }
    }
  }

  // Automatic curtains close everything just before dawn.
  curtainTick() {
    if (this.lvl('curtains') && !this.autoCurtains && this.hour() >= 29) {
      this.autoCurtains = true;
      for (const r of Object.values(this.rooms)) r.curtains = false;
    }
  }

  // ---------- dining ----------
  // What a party may order, given the kitchen difficulty.
  menuFor(p) {
    const A = ARCH[p.kind];
    let menu = A.food.slice();
    if (this.kitchen === 'advanced') { if (menu.some(d => ['pancakes', 'eggs', 'bacon'].includes(d))) menu.push('toast', 'juice'); }
    else menu = menu.filter(d => d !== 'toast' && d !== 'juice');
    if (this.kitchen === 'simple') menu = menu.filter(d => d !== 'omelette');
    if (this.lvl('waffle') && menu.includes('pancakes')) menu.push('waffles');
    if (!menu.length) menu = ['coffee'];
    return [...new Set(menu)];
  }

  orderDishes(p) {
    const menu = this.menuFor(p);
    const first = pick(menu);
    if (this.kitchen === 'advanced' && chance(0.45)) {
      const rest = menu.filter(d => d !== first);
      if (rest.length) return [first, pick(rest)];
    }
    return [first];
  }

  updateDiner(g, dt) {
    const p = this.parties[g.party];
    if (g.eatT > 0) { g.eatT -= dt; if (g.eatT <= 0) this.finishMeal(g); return; }
    const o = this.orders[g.id];
    if (!o) {
      if (g.t <= 0) {
        const A = ARCH[p.kind];
        const dishes = this.orderDishes(p);
        if (this.lvl('buffet') && chance(0.33) && dishes.every(d => CHEF_DISHES.has(d))) {
          this.walkTo(g, 'buffet_spot', 'buffet', 1, { keepSpot: true });
          return;
        }
        const t = ORDER_TIME * (A.patience || 1) * (this.lvl('muzak') ? 1.25 : 1) * this.slack * (dishes.length > 1 ? 1.25 : 1);
        this.orders[g.id] = { dishes, got: dishes.map(() => false), t, max: t, table: L.NODES[g.spot]?.table ?? 0 };
      }
      return;
    }
    o.t -= dt;
    if (o.t <= 0) {
      delete this.orders[g.id];
      this.adjust(p, -14, 'food');
      this.say(g, pick(LINES.foodLate));
      g.ate = true;
      this.nextActivity(g);
    }
  }

  finishMeal(g) {
    const tbl = L.NODES[g.spot]?.table;
    if (tbl !== undefined && chance(0.75)) this.dirtyTable(tbl);
    g.ate = true;
    this.nextActivity(g);
  }

  dirtyTable(i) {
    if (Object.values(this.messes).some(m => m.t === 'table' && m.table === i)) return;
    const t = L.TABLES[i];
    this.spawnMess('table', t.x, t.z, { y: 0.78, table: i, force: true });
  }

  // Food a player is offering: a single dish, or everything on a tray. Burnt food is 'burnt:<dish>'.
  heldPieces(held) {
    if (!held) return [];
    if (held.t === 'tray') return held.c || [];
    return [held.t === 'burnt' ? `burnt:${held.of}` : held.t];
  }

  // Remove the given piece indexes from what the player holds.
  usePieces(pl, held, used) {
    if (held.t === 'tray') held.c = held.c.filter((_, i) => !used.includes(i));
    else this.consumeHeld(pl);
  }

  serve(pl, a) {
    const g = this.guests[a.g];
    const held = this.heldItem(pl);
    if (!g || !held || g.hidden || dsq(pl, g) > 20) return;
    const p = this.parties[g.party];
    const pieces = this.heldPieces(held);
    const o = this.orders[g.id];
    if (o) {
      const used = [];
      let burnt = 0;
      pieces.forEach((pc, idx) => {
        const dish = pc.startsWith('burnt:') ? pc.slice(6) : pc;
        const k = o.dishes.findIndex((d, j) => !o.got[j] && d === dish);
        if (k < 0) return;
        o.got[k] = true;
        used.push(idx);
        if (pc !== dish) burnt++;
      });
      if (!used.length) { this.say(g, pick(LINES.wrongFood)); this.adjust(p, -3, 'food'); return; }
      this.usePieces(pl, held, used);
      if (burnt) { this.adjust(p, -8 * burnt, 'burnt'); this.say(g, 'Is this... charcoal?'); }
      if (o.got.every(Boolean)) this.orderDone(g, o, p, burnt);
      else { this.say(g, 'And the rest of it?'); this.sound('pickup', g); }
      return;
    }
    if (p?.request?.type === 'food' && this.deliverFood(pl, held, p)) return;
    this.say(g, 'I didn\'t order that.');
  }

  // Everything on the order has arrived (from the crew or the Chef Bot): the guest eats.
  orderDone(g, o, p, burnt) {
    delete this.orders[g.id];
    g.eatT = 7;
    if (!burnt) {
      this.adjust(p, o.t > o.max * 0.6 ? 10 : 7, 'food');
      if (o.dishes.includes('coffee') && this.lvl('espresso')) this.adjust(p, 3, 'food');
      if (o.dishes.includes('waffles')) { this.adjust(p, 3, 'waffles'); this.addMoney(4); }
      this.addMoney(randi(4, 10) * o.dishes.length);
    }
    this.sound('chime', g);
  }

  // Room service: hand over the requested dish (from hand or tray).
  deliverFood(pl, held, p) {
    const pieces = this.heldPieces(held);
    const idx = pieces.findIndex(pc => (pc.startsWith('burnt:') ? pc.slice(6) : pc) === p.request.dish);
    if (idx < 0) return false;
    if (pieces[idx].startsWith('burnt:')) this.adjust(p, -8, 'burnt');
    this.usePieces(pl, held, [idx]);
    this.fulfill(p, pl);
    return true;
  }

  // ---------- the kitchen: stoves, fires, plates and the pass ----------
  updateStoves(dt) {
    for (const s of this.stoves) if (s) s.t += dt;
    const mode = this.kitchenMode();
    if (mode !== 'simple') {
      for (let i = 0; i < BURNERS; i++) {
        const s = this.stoves[i];
        if (!this.fires[i]) {
          if (s && !s.bot && s.t - this.stoveTimes(i).burn > FIRE_DELAY[mode]) this.ignite(i);
          continue;
        }
        const was = this.fires[i];
        this.fires[i] += dt;
        if (this.lvl('suppress') && this.fires[i] > 3) { this.extinguish(i, null); continue; }
        // every so often the fire jumps to a neighbouring burner on the same range
        if (Math.floor(this.fires[i] / FIRE_SPREAD[mode]) > Math.floor(was / FIRE_SPREAD[mode])) {
          const next = [i - 1, i + 1].find(j => j >= 0 && j < BURNERS && (j >> 2) === (i >> 2) && !this.fires[j] && !this.stoves[j]?.bot && L.isActive(L.STATIONS[`stove${j}`]));
          if (next !== undefined) this.ignite(next);
        }
      }
    }
    // the dishwasher works through the sink pile by itself
    if (this.lvl('dishwasher') && this.sinkPile > 0) {
      this.washT += dt;
      if (this.washT > 8) { this.washT = 0; this.washTub(); this.sound('splash', L.STATIONS.sink); }
    } else this.washT = 0;
  }

  ignite(i) {
    const first = !this.fires.some(Boolean);
    this.fires[i] = 0.01;
    this.sound('burn', L.STATIONS[`stove${i}`]);
    if (first) this.toast(null, '🔥 GREASE FIRE in the kitchen! The extinguisher is by the island.', 'bad');
  }

  // Put out one burner (pl is null when the suppression hood does it). Whatever was cooking is ruined.
  extinguish(i, pl) {
    this.fires[i] = 0;
    this.stoves[i] = null;
    this.sound('spray', L.STATIONS[`stove${i}`]);
    const [x, z] = L.APPROACH[`stove${i}`];
    this.spawnMess('foam', x + rand(-0.25, 0.25), z + rand(-0.15, 0.15), { force: true });
    if (!this.fires.some(Boolean)) this.toast(null, `🧯 ${pl ? pl.name : 'The suppression hood'} put out the fire.`, 'good');
  }

  // Smoke from a kitchen fire fills the dining room (and the lobby once it spreads), and the alarm goes off.
  smokeTick(dt) {
    const burning = this.fires.filter(Boolean).length;
    if (!burning) { this.smokeT = 0; return; }
    this.smokeT += dt;
    const tick = Math.round(this.smokeT / dt);
    if (tick % 4 === 1) this.sound('alarm', L.STATIONS.stove1);
    if (tick % 12) return;
    for (const g of Object.values(this.guests)) {
      if (g.hidden) continue;
      const zone = L.zoneAt(g.x, g.z).id;
      if (zone !== 'kitchen' && zone !== 'dining' && (zone !== 'lobby' || burning < 2)) continue;
      this.adjust(this.parties[g.party], zone === 'lobby' ? -1 : -2, 'smoke');
      if (chance(0.3)) this.say(g, pick(['Is something burning?!', 'Why is the smoke alarm going off?', '*cough* *cough*']));
    }
  }

  // What a slot turns its ingredient into: cheese stirred into eggs makes an omelette.
  cookedOf(s) {
    if (s.slot === 9) return 'waffles';
    if (s.add === 'cheese') return 'omelette';
    return ITEMS[s.raw].cook;
  }

  stoveFits(st, t) {
    if (st.toaster) return t === 'bread';
    if (st.waffle) return t === 'batter';
    return !!ITEMS[t]?.cook && t !== 'bread';
  }

  // Plating cooked food takes a clean plate. The Simple kitchen never runs out.
  platesOn() { return this.kitchenMode() !== 'simple'; }

  usePlate() {
    if (!this.platesOn()) return true;
    if (this.plates <= 0) return false;
    this.plates--;
    if (this.plates === 3) this.toast(null, '🍽️ Running low on clean plates. Somebody wash the dishes!', 'bad');
    if (this.plates === 0) this.toast(null, '🍽️ Out of clean plates! Cooked food stays on the stove until someone washes dishes.', 'bad');
    return true;
  }

  washTub() {
    if (this.sinkPile <= 0) return;
    this.sinkPile--;
    this.returnPlates(1);
  }

  returnPlates(tubs) { this.plates = Math.min(PLATES, this.plates + TUB_PLATES * tubs); }

  stoveAct(pl, st, held, tray) {
    const i = st.idx;
    const s = this.stoves[i];
    if (this.fires[i]) { if (held?.t === 'extinguisher') this.extinguish(i, pl); return; }
    if (!s) {
      if (held && this.stoveFits(st, held.t)) {
        this.stoves[i] = { raw: held.t, t: 0, slot: i };
        this.consumeHeld(pl);
        this.sound('sizzle', st);
      }
      return;
    }
    if (s.bot) return;
    const ss = this.stoveState(s);
    if (held?.t === 'cheese' && s.raw === 'egg_raw' && !s.add && ss.st !== 'b' && this.kitchenMode() !== 'simple') {
      s.add = 'cheese';
      this.consumeHeld(pl);
      this.sound('sizzle', st);
      return;
    }
    if ((held && !tray) || (tray && ss.st === 'c')) return;
    const cooked = this.cookedOf(s);
    if (ss.st === 'd' && !this.usePlate()) { this.toast(pl.id, '🍽️ No clean plates! Wash some dishes at the sink.', 'bad'); return; }
    this.stoves[i] = null;
    if (ss.st === 'c') this.giveNew(pl, s.raw);
    else if (tray) tray.c.push(ss.st === 'd' ? cooked : `burnt:${cooked}`);
    else if (ss.st === 'd') this.giveNew(pl, cooked);
    else this.giveNew(pl, 'burnt', { of: cooked });
  }

  // The pass: plates go down on the kitchen side of the hatch and get picked up from the dining room.
  passAct(pl, st, held) {
    const free = this.pass.indexOf(null);
    if (held?.t === 'tray') {
      const c = (held.c ||= []);
      if (this.pass.some(Boolean) && c.length < 3) {
        for (let k = 0; k < PASS_SLOTS && c.length < 3; k++) if (this.pass[k]) { c.push(this.pass[k]); this.pass[k] = null; }
        this.sound('pickup', st);
      } else if (c.length && free >= 0) {
        while (c.length && this.pass.includes(null)) this.pass[this.pass.indexOf(null)] = c.shift();
        this.sound('bell', st);
      }
      return;
    }
    if (held) {
      if (!ITEMS[held.t].food || free < 0) return;
      this.pass[free] = this.heldPieces(held)[0];
      this.consumeHeld(pl);
      this.sound('bell', st);
      return;
    }
    const k = this.pass.findIndex(Boolean);
    if (k < 0) return;
    const pc = this.pass[k];
    this.pass[k] = null;
    if (pc.startsWith('burnt:')) this.giveNew(pl, 'burnt', { of: pc.slice(6) });
    else this.giveNew(pl, pc);
  }

  // Order tickets for the rail over the pass: table or room, what's still owed and how much time is left.
  tickets() {
    const out = [];
    for (const [gid, o] of Object.entries(this.orders)) {
      const left = o.dishes.filter((d, k) => !o.got[k]);
      if (this.guests[gid] && left.length) out.push({ n: `T${o.table + 1}`, d: left, f: r2(o.t / o.max) });
    }
    for (const p of Object.values(this.parties)) {
      const rq = p.request;
      if (rq?.type === 'food' && p.room) out.push({ n: p.room === 'PRES' ? 'PRES' : `#${p.room}`, d: [rq.dish], f: r2(rq.t / rq.max) });
    }
    return out.sort((a, b) => a.f - b.f).slice(0, 6);
  }

  stoveTimes(slot = 0) {
    const mode = this.kitchenMode();
    const base = { simple: 3, normal: 7, advanced: 8 }[mode] || 7;
    const cook = base * (slot === 8 ? 0.65 : slot === 9 ? 0.8 : 1) * (this.lvl('stove') ? 0.6 : 1);
    const window = ({ simple: Infinity, normal: 9, advanced: 6 }[mode] || 9) * (this.lvl('stove') ? 1.8 : 1) * (this.lvl('warmers') ? 2.5 : 1);
    return { cook, burn: cook + window };
  }

  stoveState(s) {
    const { cook, burn } = this.stoveTimes(s.slot || 0);
    if (s.t < cook) return { st: 'c', p: s.t / cook };
    if (s.t < burn) return { st: 'd', p: burn === Infinity ? 0 : (s.t - cook) / (burn - cook) };
    return { st: 'b', p: 1 };
  }

  // ---------- stations & world interactions ----------
  station(pl, a) {
    const st = L.STATIONS[a.s];
    if (!st || !L.isActive(st) || dsq(pl, st) > 20) return;
    const held = this.heldItem(pl);
    const tray = held?.t === 'tray' && (held.c ||= []).length < 3 ? held : null;
    switch (st.kind) {
      case 'fridge': case 'shelf':
        if (!held) this.giveNew(pl, st.item);
        else if (tray && DISHES[st.item]) { tray.c.push(st.item); this.sound('pickup', st); }
        break;
      case 'coffee': case 'juice': case 'cocoa': // the station kind is also the drink it pours
        if (!held) this.giveNew(pl, st.kind);
        else if (tray) { tray.c.push(st.kind); this.sound('pickup', st); }
        break;
      case 'trays':
        if (!held) this.giveNew(pl, 'tray', { c: [] });
        break;
      case 'stove': this.stoveAct(pl, st, held, tray); break;
      case 'sink':
        if (held?.t === 'dishes') { this.consumeHeld(pl); this.sinkPile++; this.sound('thud', st); }
        else if (!held && this.sinkPile > 0) { this.washTub(); this.sound('splash', st); }
        break;
      case 'pass': this.passAct(pl, st, held); break;
      case 'trash':
        if (held?.t === 'tray') { held.c = []; this.sound('thud', st); }
        else if (held && !ITEMS[held.t].tool && !['luggage', 'body', 'dishes'].includes(held.t)) { this.consumeHeld(pl); this.sound('thud', st); }
        break;
      case 'dumpster':
        if (held && (held.t === 'body' || (!ITEMS[held.t].tool && held.t !== 'luggage' && held.t !== 'dishes'))) {
          const wasBody = held.t === 'body';
          this.consumeHeld(pl);
          this.sound('thud', st);
          if (wasBody) { this.toast(null, `🗑️ ${pl.name} disposed of the... evidence.`, 'horror'); this.checkEvidence(); }
        }
        break;
      case 'breaker':
        if (!this.power) this.restorePower(pl);
        break;
      case 'elevator':
        if (this.elevOut && st.floor === 0) this.fixElevator(pl);
        break;
      case 'vending': {
        const inc = Object.values(this.incidents).find(i => i.type === 'vending' && !i.walking);
        if (inc) this.fixVending(inc, pl);
        break;
      }
    }
  }

  restorePower(pl, who) {
    this.power = true;
    this.powerT = 0;
    this.sound('powerup', L.STATIONS.breaker);
    this.toast(null, pl ? `⚡ ${pl.name} got the power back on.` : who === 'electrician' ? '⚡ The electrician got the power back on.' : '⚡ The backup generator kicked in.', 'good');
  }

  doorAct(pl, a) {
    const room = this.rooms[a.room];
    if (!room || dsq(pl, L.STATIONS[`door_${a.room}`]) > 20) return;
    const p = room.party ? this.parties[room.party] : null;
    const held = this.heldItem(pl);
    if (a.verb === 'knock') {
      const complainers = Object.values(this.parties).filter(q => q.request?.type === 'noise' && q.request.target === a.room);
      this.sound('knock', L.STATIONS[`door_${a.room}`]);
      for (const q of complainers) this.fulfill(q, pl);
      if (p) {
        const g = this.guests[p.leader];
        if (complainers.length) { this.adjust(p, -2, 'noise'); if (g) this.say(g, pick(LINES.knock)); }
        else if (p.kind === 'killer' && g) this.say(g, 'Not now. I\'m... busy.', 3);
        else if (g && room.dnd) { this.adjust(p, -3, 'privacy'); this.say(g, 'Can\'t you READ the sign?!', 3); }
        else if (g) this.adjust(p, -1, 'noise');
      }
      return;
    }
    if (a.verb === 'deliver' && p?.request && held) {
      if (p.request.type === 'towels' && held.t === 'towels') { this.consumeHeld(pl); this.fulfill(p, pl); }
      else if (p.request.type === 'food' && !this.deliverFood(pl, held, p)) this.toast(pl.id, `${L.roomName(a.room)} wanted ${DISHES[p.request.dish].name}.`, 'bad');
    }
  }

  curtainAct(pl, a) {
    const room = this.rooms[a.room];
    if (!room || dsq(pl, L.STATIONS[`curtain_${a.room}`]) > 20) return;
    room.curtains = !room.curtains;
    this.sound('curtain', L.STATIONS[`curtain_${a.room}`]);
  }

  thermoAct(pl, a) {
    const room = this.rooms[a.room];
    if (!room || dsq(pl, L.STATIONS[`thermo_${a.room}`]) > 20) return;
    room.cold = !room.cold;
    this.sound('beep', L.STATIONS[`thermo_${a.room}`]);
    const p = room.party && this.parties[room.party];
    if (p?.request?.type === 'cold' && room.cold) this.fulfill(p, pl);
    else if (p && p.kind !== 'alien' && room.cold) this.adjust(p, -3, 'cold');
  }

  // ---------- cars ----------
  spawnArrivalCar(p) {
    const A = ARCH[p.kind];
    const model = A.carModel || pick(['sedan', 'sedan', 'hatch', 'van', 'pickup', 'wagon']);
    const color = A.carColor || pick(CAR_COLORS);
    const c = {
      id: this.id(), x: 100, z: L.ROAD_Z, ry: -Math.PI / 2, model, color: color.hex, name: `${color.name} ${CAR_NAMES[model]}`,
      party: p.id, st: 'arriving', driver: null, path: [], drop: -1, due: 0, lift: 0, spot: null,
    };
    this.cars[c.id] = c;
    p.car = c.id;
  }

  freeDrop() {
    for (let i = 0; i < L.DROPS.length; i++) {
      const d = L.DROPS[i];
      const busy = Object.values(this.cars).some(c => c.st !== 'departing' && (c.drop === i && (c.st === 'arriving' || c.botMode === 'fetch') || (c.x - d.x) ** 2 + (c.z - d.z) ** 2 < 11));
      if (!busy) return i;
    }
    return -1;
  }

  inPickup(c) { return L.inRect(c.x, c.z, L.PICKUP); }

  updateCars(dt) {
    for (const c of Object.values(this.cars)) {
      const p = this.parties[c.party];
      // Cars whose owners are gone (fled, or worse) don't wait around for the valet.
      if ((c.st === 'valet' || c.st === 'retrieve') && !c.driver && (!p || p.st === 'gone' || p.st === 'fled' || (p.surveyed && p.st !== 'curb'))) {
        c.st = 'departing';
        c.party = null;
        c.reserved = null;
        c.path = [{ x: c.x, z: L.ROAD_Z }, { x: -100, z: L.ROAD_Z }];
        continue;
      }
      if (c.st === 'arriving') {
        if (c.drop < 0) {
          const i = this.freeDrop();
          if (i >= 0) { c.drop = i; const d = L.DROPS[i]; c.path = [{ x: d.x + 10, z: L.ROAD_Z }, { x: d.x, z: d.z }]; }
          else if (!c.path.length && c.x > 25) c.path = [{ x: 22, z: L.ROAD_Z }];
        }
        if (c.path.length) this.driveScripted(c, dt);
        else if (c.drop >= 0) {
          c.st = 'valet';
          c.due = this.clock + 45 * this.slack;
          c.arrivedAt = this.clock;
          c.drop = -1;
          if (p) {
            p.memberKinds.forEach((k, i) => this.makeGuest(p, k, i === 0, c.x + (i - (p.memberKinds.length - 1) / 2) * 0.7, c.z - 1.4));
            p.spawned = true;
            for (const gid of p.members) this.walkTo(this.guests[gid], 'door_in', 'enter');
          }
          this.sound('doorslam', c);
        }
      } else if (c.st === 'departing') {
        if (c.path.length) this.driveScripted(c, dt);
        else delete this.cars[c.id];
      } else if (!c.driver && p && !p.surveyed && c.st === 'valet' && this.clock > c.due) {
        if (!c.pen) { c.pen = true; this.adjust(p, -10, 'valet'); }
        else this.adjust(p, -0.07 * dt, 'valet');
      }
    }
  }

  driveScripted(c, dt, vmax = 12) {
    const t = c.path[0];
    const dx = t.x - c.x, dz = t.z - c.z;
    const d = Math.hypot(dx, dz);
    const sp = c.path.length === 1 ? Math.min(vmax, 1.2 + d * 1.1) : vmax;
    const step = sp * dt;
    if (d <= Math.max(step, 0.05)) { c.x = t.x; c.z = t.z; c.path.shift(); }
    else { c.x += (dx / d) * step; c.z += (dz / d) * step; c.ry = Math.atan2(dx, dz); }
  }

  freeSpot() {
    const used = new Set();
    for (const c of Object.values(this.cars)) { if (c.st === 'parked' && c.spot) used.add(c.spot); if (c.reserved) used.add(c.reserved); }
    const free = L.PARKING.filter(s => !used.has(s.id) && !Object.values(this.cars).some(c => (c.x - s.x) ** 2 + (c.z - s.z) ** 2 < 4));
    return free.length ? pick(free) : null;
  }

  parkCheck(c) {
    for (const s of L.PARKING) {
      if ((c.x - s.x) ** 2 + (c.z - s.z) ** 2 > 2.4 || axisDiff(c.ry, s.ry) > 0.6) continue;
      if (Object.values(this.cars).some(o => o !== c && ((o.st === 'parked' && o.spot === s.id) || o.reserved === s.id))) continue;
      return s;
    }
    return null;
  }

  carEnter(pl, a) {
    const c = this.cars[a.c];
    if (!c || c.driver || pl.car || pl.down || ['arriving', 'departing', 'pickup'].includes(c.st) || c.lift > 0.5) return;
    if (dsq(pl, c) > 30) return;
    c.driver = pl.id;
    pl.car = c.id;
    if (c.st === 'parked') { c.st = 'moved'; c.spot = null; }
    this.sendTo(pl.id, { k: 'ev', e: 'drive', c: c.id, x: c.x, z: c.z, r: c.ry, m: c.model });
  }

  carExit(pl, a) {
    const c = this.cars[a.c];
    if (!c || c.driver !== pl.id) { pl.car = null; return; }
    if (typeof a.x === 'number') { c.x = a.x; c.z = a.z; c.ry = a.r; }
    c.driver = null;
    pl.car = null;
    const p = this.parties[c.party];
    const spot = this.parkCheck(c);
    if (c.st === 'valet' || c.st === 'moved') {
      if (spot) {
        const fresh = c.st === 'valet';
        c.st = 'parked';
        c.spot = spot.id;
        if (fresh && p && !p.surveyed && this.clock <= c.due) { this.adjust(p, 5, 'valet'); this.addMoney(5); }
        this.toast(pl.id, `🅿️ Parked in spot ${spot.id}.`, 'good');
      }
    } else if (c.st === 'retrieve' && this.inPickup(c) && p) {
      c.st = 'pickup';
      if (this.clock <= c.due) { this.adjust(p, 4, 'valet'); this.addMoney(5); }
      this.boardAll(p, c);
      this.toast(pl.id, `🔑 ${p.name} are getting in.`, 'good');
    }
  }

  // ---------- horror ----------
  fireEvent(ev) {
    switch (ev.type) {
      case 'flicker': this.send({ k: 'ev', e: 'flicker', d: ev.d || 2 }); break;
      case 'blackout': this.blackout(); break;
      case 'murder': this.startHunt(); break;
      case 'ufo': this.startUfo(); break;
      case 'interrogate': this.startInspection(); break;
      case 'circles':
        this.circles = true;
        for (const p of Object.values(this.parties)) if (p.kind === 'cultist') p.nextCircle = this.clock + rand(5, 25);
        this.events.push({ h: 28.5, type: 'circlesEnd', done: false });
        break;
      case 'circlesEnd': this.circles = false; break;
      case 'ritual': this.startRitual(); break;
      case 'curtains':
        if (Object.values(this.parties).some(p => p.kind === 'vampire' && p.st === 'staying')) this.toast(null, '🌅 Sunrise soon. Close the curtains in the vampire rooms!', 'horror');
        break;
      case 'sunrise': this.sunrise(); break;
      case 'stalker':
        this.spawnMonster('porter', L.BASEMENT.x, L.BASEMENT.z, 9999, ev.until);
        this.sound('sting', L.BASEMENT);
        this.toast(null, '🚪 The basement door is open. Something is walking the halls.', 'horror');
        break;
      case 'replace': this.startReplace(); break;
    }
  }

  blackout() {
    if (!this.power) return;
    this.power = false;
    this.powerT = 0;
    this.sound('powerdown', L.STATIONS.breaker);
    this.toast(null, '⚡ The power went out! Reset the breaker in the Utility Room.', 'bad');
  }

  killerGuest() {
    for (const p of Object.values(this.parties)) {
      if (p.kind === 'killer' && p.st === 'staying') { const g = this.guests[p.leader]; if (g && !g.hidden) return g; }
    }
    return null;
  }

  startHunt() {
    const k = this.killerGuest();
    if (!k) return;
    const kp = this.parties[k.party];
    const candidates = Object.values(this.guests).filter(g => {
      const p = this.parties[g.party];
      return p && p.st === 'staying' && !p.threat && p.room && !g.hidden && !g.path.length && (g.st === 'room' || g.st === 'sleep') && L.inRect(g.x, g.z, L.ROOM_BY_ID[p.room]);
    });
    if (!candidates.length) { kp.huntTries = (kp.huntTries || 0) + 1; if (kp.huntTries < 6) this.events.push({ h: this.hour() + 0.6, type: 'murder', done: false }); return; }
    const solo = candidates.filter(g => this.parties[g.party].members.length === 1);
    const v = pick(solo.length ? solo : candidates);
    k.special = true;
    k.victim = v.id;
    k.huntRoom = this.parties[v.party].room;
    kp.busy = true;
    this.rooms[kp.room].dnd = true;
    this.walkTo(k, `r${k.huntRoom}_in`, 'hunt', 1.15);
  }

  killerStrike(k) {
    const kp = this.parties[k.party];
    const v = this.guests[k.victim];
    const vp = v && this.parties[v.party];
    if (!v || v.hidden || !vp || vp.st !== 'staying' || vp.room !== k.huntRoom) {
      kp.busy = false;
      k.special = false;
      kp.huntTries = (kp.huntTries || 0) + 1;
      if (kp.huntTries < 6) this.events.push({ h: this.hour() + 0.5, type: 'murder', done: false });
      this.goRoom(k, 'bed');
      return;
    }
    const r = L.ROOM_BY_ID[k.huntRoom];
    this.kill(v, r);
    kp.busy = false;
    this.goRoom(k, 'bed');
    this.alert('🔪', `Someone screamed in Room ${r.id}...`, r.door, 90);
  }

  // Removes a guest violently and leaves evidence behind.
  kill(v, r, body = true) {
    const vp = this.parties[v.party];
    this.removeGuest(v);
    this.stats.deaths++;
    const spots = shuffle(r.messSpots.slice());
    for (let i = 0; i < 3; i++) this.spawnMess('blood', spots[i].x, spots[i].z, { room: r.id, force: true, evidence: true });
    if (body) this.spawnItem('body', spots[3].x, 0, spots[3].z, { ry: rand(0, 6) });
    for (let i = 0; i < 2; i++) this.spawnMess('blood', r.door.x + rand(-1.2, 1.2), -20 + rand(-1, 1), { force: true, evidence: true });
    this.sound('scream', r.door);
    if (!vp) return;
    if (!vp.members.length) {
      vp.surveyed = true;
      vp.st = 'gone';
      const room = this.rooms[r.id];
      if (room.party === vp.id) { room.party = null; room.st = 'dirty'; }
      for (const iid of vp.luggageItems) { this.detachItem(this.items[iid]); delete this.items[iid]; }
      const car = vp.car && this.cars[vp.car];
      if (car) car.party = null;
    } else {
      vp.flags.missing = true;
      this.adjust(vp, -100, 'missing');
      vp.checkoutH = Math.min(vp.checkoutH, this.hour() + 0.4);
    }
  }

  startInspection() {
    const agentParty = Object.values(this.parties).find(p => p.kind === 'agent' && p.st === 'staying');
    const g = agentParty && this.guests[agentParty.leader];
    if (!g) return;
    const targets = shuffle(Object.values(this.parties).filter(p => p.kind === 'alien' && p.st === 'staying' && p.room)).slice(0, 4).map(p => p.room);
    if (!targets.length) return;
    g.special = true;
    g.targets = targets;
    agentParty.busy = true;
    this.nextInspection(g);
  }

  nextInspection(g) {
    const room = g.targets.shift();
    if (!room) { g.special = false; this.parties[g.party].busy = false; this.goRoom(g, 'bed'); return; }
    g.inspecting = room;
    this.walkTo(g, L.ROOM_BY_ID[room].hall, 'inspect');
  }

  agentInspect(g) {
    const room = this.rooms[g.inspecting];
    const p = room?.party && this.parties[room.party];
    if (p && p.kind === 'alien') {
      this.adjust(p, -18, 'harassed');
      this.say(g, pick(['Routine inspection.', 'Papers, please.', 'Nice antennae. Real?']), 3);
      this.sound('knock', L.STATIONS[`door_${room.id}`]);
    }
    this.nextInspection(g);
  }

  startRitual() {
    const pp = Object.values(this.parties).find(p => p.kind === 'priest' && p.st === 'staying');
    const g = pp && this.guests[pp.leader];
    if (!g) return;
    g.special = true;
    pp.busy = true;
    this.walkTo(g, 'h0', 'ritual');
  }

  finishRitual(g) {
    this.blackout();
    this.spawnMonster('shade', g.x, g.z + 1, 75);
    for (let i = 0; i < 3; i++) this.spawnMess('circle', g.x + rand(-3, 3), -20 + rand(-1.2, 1.2), { charge: 0.5, force: true });
    this.sound('sting', g);
    this.toast(null, '🔥 The High Priest completed a ritual in the hallway!', 'horror');
    g.special = false;
    this.parties[g.party].busy = false;
    this.goRoom(g, 'bed');
  }

  drawCircle(p) {
    p.nextCircle = this.clock + rand(45, 70);
    if (Object.values(this.messes).filter(m => m.t === 'circle').length >= 3) return;
    const r = L.ROOM_BY_ID[p.room];
    if (chance(0.5)) { const s = pick(r.messSpots); this.spawnMess('circle', s.x, s.z, { room: p.room, charge: 0, force: true }); }
    else this.spawnMess('circle', r.door.x + rand(-2, 2), -20 + rand(-1, 1), { charge: 0, force: true });
    this.sound('whisper', r.door);
  }

  sunrise() {
    for (const p of Object.values(this.parties)) {
      if (p.kind !== 'vampire' || p.st !== 'staying' || !p.room) continue;
      const room = this.rooms[p.room];
      if (room.curtains) {
        const r = L.ROOM_BY_ID[p.room];
        const inside = p.members.map(id => this.guests[id]).filter(g => g && L.inRect(g.x, g.z, r));
        if (!inside.length) continue;
        this.sound('burn', r.window);
        this.toast(null, `🔥 The vampire in Room ${p.room} caught the sunrise!`, 'horror');
        this.adjust(p, -80, 'sunlight');
        this.finishParty(p, { reason: 'sunlight' });
        this.spawnMess('stain', r.bed.x, r.bed.z + 0.8, { room: p.room, force: true });
        for (const g of inside) this.removeGuest(g);
        if (p.members.length) this.leaveHotel(p, true);
        if (p.room && this.rooms[p.room].party === p.id) this.vacate(p);
      } else this.adjust(p, 8, 'curtains');
    }
  }

  startReplace() {
    for (const p of Object.values(this.parties)) {
      if (p.kind !== 'doppel' || p.st !== 'staying' || !p.doppelOf) continue;
      const vp = this.parties[p.doppelOf.party];
      const g = this.guests[p.leader];
      if (!g || !vp || vp.st !== 'staying' || !vp.room) continue;
      g.special = true;
      g.target = vp.id;
      p.busy = true;
      this.walkTo(g, `r${vp.room}_in`, 'replace', 1.1);
    }
  }

  doppelStrike(g) {
    const p = this.parties[g.party];
    const vp = this.parties[g.target];
    g.special = false;
    if (p) p.busy = false;
    const vg = vp && this.guests[vp.leader];
    if (vp && vg && vp.st === 'staying' && vp.room) {
      this.kill(vg, L.ROOM_BY_ID[vp.room], false);
      this.alert('👥', `Something happened in Room ${vp.roomWas}...`, L.ROOM_BY_ID[vp.roomWas].door, 90);
    }
    this.goRoom(g, 'bed');
  }

  // ---------- incidents: the everyday disasters of a busy hotel ----------
  // Every minute or two something goes wrong. Each incident goes on the task list with a timer: sort it
  // out in time and the guests are grateful; let it run out and they remember it in their review.
  incidentTick(dt) {
    for (const inc of Object.values(this.incidents)) {
      inc.t -= dt;
      if (inc.t <= 0) this.incidentTimeout(inc);
    }
    if (this.closingAt) return;
    this.incidentT -= dt * (0.55 + 0.45 * this.chores);
    if (this.incidentT > 0) return;
    this.incidentT = rand(...INCIDENT_GAP);
    if (Object.keys(this.incidents).length >= 2) return;
    const options = this.incidentOptions();
    if (!options.length) return;
    const type = weighted(Object.fromEntries(options.map(o => [o.type, o.w])));
    options.find(o => o.type === type)?.start();
  }

  incidentOptions() {
    const out = [];
    const busy = type => Object.values(this.incidents).some(i => i.type === type);
    const free = g => g && !g.hidden && !g.incident && !g.special && !g.snoop && this.parties[g.party]?.st === 'staying';
    const H = this.hour();
    const guests = Object.values(this.guests).filter(free);
    const onDeck = g => L.zoneAt(g.x, g.z).id === 'pool' && !L.inPool(g.x, g.z);
    if (!busy('slip')) {
      const deck = guests.filter(g => onDeck(g) && (g.path.length || g.st === 'lounge'));
      const kids = deck.filter(g => g.kind === 'kid');
      const wet = Object.values(this.messes).filter(m => m.t === 'spill' && L.zoneAt(m.x, m.z).id === 'pool').length;
      if (deck.length) out.push({ type: 'slip', w: (1 + wet * 0.6 + kids.length * 0.5) * (this.lvl('nonslip') ? 0.3 : 1), start: () => this.startSlip(pick(kids.length ? kids : deck)) });
    }
    if (!busy('lostkid') && H < 23) {
      const kids = guests.filter(g => g.kind === 'kid' && !g.path.length && !this.orders[g.id] && g.eatT <= 0 && ['room', 'chill', 'lounge', 'swim'].includes(g.st));
      if (kids.length) out.push({ type: 'lostkid', w: 1, start: () => this.startLostKid(pick(kids)) });
    }
    if (!busy('lockout') && !this.isNight()) {
      const leaders = guests.filter(g => g.leader && !g.path.length && ['chill', 'lounge', 'swim'].includes(g.st) && this.parties[g.party].room && !this.parties[g.party].request && !this.parties[g.party].threat);
      if (leaders.length) out.push({ type: 'lockout', w: 0.9, start: () => this.startLockout(pick(leaders)) });
    }
    if (!busy('drunk') && H >= 21 && H < 28.5) {
      const office = guests.filter(g => this.parties[g.party].kind === 'office' && PUBLIC_ZONES.has(L.zoneAt(g.x, g.z).id) && !L.inPool(g.x, g.z) && g.st !== 'dine' && g.st !== 'queue');
      if (office.length) out.push({ type: 'drunk', w: 1.6, start: () => this.startDrunk(pick(office)) });
    }
    if (!busy('elevator') && !this.elevOut && this.lvl('floor2')) out.push({ type: 'elevator', w: 0.55, start: () => this.startElevator() });
    if (!busy('vending')) {
      const idle = guests.filter(g => !g.path.length && ['chill', 'lounge'].includes(g.st) && !L.floorOf(g.x) && PUBLIC_ZONES.has(L.zoneAt(g.x, g.z).id) && !L.inPool(g.x, g.z));
      if (idle.length) out.push({ type: 'vending', w: 0.6, start: () => this.startVending(pick(idle)) });
    }
    if (!busy('raccoon') && this.power) out.push({ type: 'raccoon', w: 0.5, start: () => this.startRaccoon() });
    return out;
  }

  addIncident(type, secs, extra = {}) {
    const inc = { id: this.id(), type, t: secs * this.slack, max: secs * this.slack, ...extra };
    this.incidents[inc.id] = inc;
    if (inc.g) this.guests[inc.g].incident = inc.id;
    return inc;
  }

  endIncident(inc) {
    delete this.incidents[inc.id];
    const g = this.guests[inc.g];
    if (g && g.incident === inc.id) g.incident = null;
  }

  // Quietly forgets an incident whose guest has to be somewhere else (checking out, fleeing...).
  dropIncident(inc) {
    if (inc) this.endIncident(inc);
  }

  // Sat or lying where the incident left them; the stuck ones look miserable.
  incidentIdle(g) {
    if (!this.incidents[g.incident]) { g.incident = null; g.pose = null; this.idleFor(g, 1); }
  }

  startSlip(g) {
    const p = this.parties[g.party];
    if (L.NODES[g.spot]?.pose === 'lie') g.z += g.z > 0 ? -1.0 : 1.0; // up off the lounger and straight down
    this.releaseSpot(g);
    Object.assign(g, { path: [], st: 'incident', pose: 'lie', y: 0, anim: 'idle', ry: rand(0, 6.28) });
    this.spawnMess('spill', g.x + rand(-0.5, 0.5), g.z + rand(-0.5, 0.5), { force: true });
    this.say(g, g.kind === 'kid' ? 'WAAAAH! My head!' : 'Ow! The floor is soaking wet!', 4);
    this.sound('thud', g);
    this.addIncident('slip', 70, { g: g.id, p: p.id });
    this.toast(null, `🤕 ${g.kind === 'kid' ? 'A kid' : 'A guest'} slipped on the wet pool deck! Bring a first aid kit.`, 'bad');
  }

  startLostKid(g) {
    const p = this.parties[g.party];
    const spots = [['mz_4_2', 'hedge maze'], ['mz_4_2', 'hedge maze'], ['laun_c', 'laundry'], ['util_c', 'utility room'], ['stor_c', 'storage room'], ['vend', 'elevators'], ['pd_ne', 'pool']]
      .filter(([id]) => L.NODES[id] && L.isActive(L.NODES[id]));
    if (this.lvl('floor2')) spots.push([`h${-26.4 + L.FLOOR_DX}`, 'second floor'], ['hend@2', 'second floor']);
    const [node, where] = pick(spots.filter(([id]) => L.NODES[id]));
    this.releaseSpot(g);
    g.pose = null;
    this.addIncident('lostkid', 130, { g: g.id, p: p.id, where, walking: true });
    this.walkTo(g, node, 'lost', 1.15, { free: true, incident: true });
    const lead = this.guests[p.leader];
    if (lead && lead !== g) { this.say(lead, 'Has anyone seen our kid?!', 4); this.emote(lead, '😰', 8); }
    this.toast(null, `😰 ${p.name}: their kid wandered off toward the ${where}!`, 'bad');
  }

  startLockout(g) {
    const p = this.parties[g.party];
    this.addIncident('lockout', 95, { g: g.id, p: p.id, room: p.room, walking: true });
    this.walkTo(g, L.ROOM_BY_ID[p.room].hall, 'lockout', 1, { incident: true });
  }

  startDrunk(g) {
    const p = this.parties[g.party];
    this.releaseSpot(g);
    Object.assign(g, { path: [], st: 'incident', pose: 'lie', anim: 'idle', ry: rand(0, 6.28) });
    g.y = this.groundY(g);
    this.addIncident('drunk', 80, { g: g.id, p: p.id });
    this.say(g, '*hic*... jus\' restin\' my eyes...', 4);
    this.toast(null, `🥴 Someone from ${p.name} passed out in the ${L.zoneAt(g.x, g.z).name}.`, 'bad');
  }

  startElevator() {
    this.elevOut = true;
    this.applyFlags();
    this.addIncident('elevator', 150, { x: 1.45, z: -28.7 });
    this.sound('powerdown', L.STATIONS.elev_0);
    this.toast(null, '🛗 The elevator is stuck! Everyone is taking the stairs. Reset it at the elevator panel on the ground floor.', 'bad');
  }

  fixElevator(pl, paid = false) {
    for (const inc of Object.values(this.incidents)) if (inc.type === 'elevator') this.endIncident(inc);
    this.elevOut = false;
    this.applyFlags();
    this.sound('elevator', L.STATIONS.elev_0);
    if (pl) this.toast(null, `🛗 ${pl.name} got the elevator running again.`, 'good');
    else if (paid) { this.money = Math.max(0, this.money - 80); this.toast(null, '🛗 The elevator company finally fixed the elevator, and billed you $80.', 'bad'); }
  }

  // Taking the stairs while the elevator is out: nobody's happy about it, least of all the retirees.
  stairGrumble(g) {
    const p = this.parties[g.party];
    if (!p) return;
    this.adjust(p, p.kind === 'retiree' ? -2 : -1, 'elevator');
    if (chance(0.35)) this.say(g, p.kind === 'retiree' ? 'My KNEES!' : 'The elevator\'s broken? Seriously?', 3);
  }

  startVending(g) {
    const p = this.parties[g.party];
    this.addIncident('vending', 70, { g: g.id, p: p.id, walking: true, x: -1.1, z: -26.4 });
    this.walkTo(g, 'vend', 'vending', 1, { incident: true });
  }

  startRaccoon() {
    const m = this.spawnMonster('raccoon', -26.2, -10.0, 9999);
    m.messT = 5;
    this.addIncident('raccoon', 110, { m: m.id });
    this.sound('creak', m);
    this.toast(null, '🦝 A raccoon got into the kitchen through the back door! Shoo it out with a mop.', 'bad');
  }

  // Someone arrived where their incident happens.
  incidentArrived(g) {
    const inc = this.incidents[g.incident];
    if (!inc) { this.idleFor(g, 2); return; }
    inc.walking = false;
    g.st = 'incident';
    switch (inc.type) {
      case 'lostkid':
        this.say(g, pick(['I want my mommy...', 'Where am I?', 'I\'m not lost. You\'re lost.']), 4);
        this.sound('whisper', g);
        break;
      case 'lockout': {
        const r = L.ROOM_BY_ID[inc.room];
        g.ry = Math.atan2(r.door.x - g.x, r.door.z - g.z);
        this.say(g, 'I locked my key card inside!', 4);
        this.toast(null, `🚪 ${L.roomName(inc.room)} is locked out. Bring them a spare key card from behind the front desk.`, 'bad');
        break;
      }
      case 'vending':
        this.say(g, 'It ATE my money!', 4);
        this.sound('thud', g);
        break;
    }
  }

  // A player helps a guest in trouble: the right thing in hand (or empty hands) and a moment's work.
  helpGuest(pl, a) {
    const g = this.guests[a.g];
    const inc = g && this.incidents[g.incident];
    if (!inc || dsq(pl, g) > 12) return;
    const p = this.parties[g.party];
    const held = this.heldItem(pl);
    const quick = inc.t > inc.max * 0.5;
    switch (inc.type) {
      case 'slip':
        if (held?.t !== 'medkit') return;
        this.endIncident(inc);
        g.pose = null;
        this.say(g, g.kind === 'kid' ? 'It doesn\'t hurt anymore!' : 'Thank you. I\'ll watch my step.', 3);
        this.emote(g, '🩹', 4);
        this.adjust(p, quick ? 8 : 5, 'care');
        this.toast(pl.id, '🩹 Patched up. The family is very grateful.', 'good');
        this.idleFor(g, 2);
        break;
      case 'lostkid':
        this.endIncident(inc);
        this.say(g, pick(['Mommy!', 'Daddy!', 'Can we go back now?']), 3);
        this.adjust(p, quick ? 9 : 6, 'kid');
        this.toast(pl.id, `👨‍👩‍👧 You found the lost kid. They're on their way back to ${p.name}.`, 'good');
        this.goRoom(g);
        break;
      case 'lockout':
        if (held?.t !== 'keycard') return;
        this.consumeHeld(pl);
        this.endIncident(inc);
        this.say(g, 'Oh, thank goodness.', 3);
        this.adjust(p, quick ? 6 : 4, 'care');
        this.toast(pl.id, `🔑 ${L.roomName(inc.room)} is back in.`, 'good');
        this.goRoom(g, 'mid');
        break;
      case 'drunk':
        if (held) return;
        this.endIncident(inc);
        g.pose = null;
        this.say(g, '*hic* You\'re... my best friend.', 3);
        this.adjust(p, 3, 'care');
        this.goRoom(g, 'bed');
        break;
      default: return;
    }
    this.sound('chime', g);
  }

  fixVending(inc, pl) {
    const g = this.guests[inc.g];
    this.endIncident(inc);
    this.sound('thud', L.STATIONS.vending);
    if (g) {
      this.say(g, 'There it is! Thanks!', 3);
      this.adjust(this.parties[g.party], 3, 'fun');
      this.idleFor(g, 2);
    }
    this.toast(pl.id, '🥤 One good whack and the snack dropped.', 'good');
  }

  shoo(pl, a) {
    const m = this.monsters[a.m];
    if (!m || m.k !== 'raccoon' || m.flee || dsq(pl, m) > 12 || this.heldItem(pl)?.t !== 'mop') return;
    this.raccoonFlee(m);
    this.toast(null, `🦝 ${pl.name} chased the raccoon out.`, 'good');
  }

  raccoonFlee(m) {
    m.flee = true;
    m.path = L.planPath(m.x, m.z, 'kit_l', {});
    this.sound('screech', m);
    for (const inc of Object.values(this.incidents)) if (inc.m === m.id) this.endIncident(inc);
  }

  // The raccoon ambles around the kitchen and dining room, raiding the trash and the stove.
  raccoonTick(m, dt) {
    if (m.flee) {
      if (m.path.length) this.stepAlong(m, m.path, 3.2, dt);
      else { delete this.monsters[m.id]; this.sound('creak', m); }
      m.anim = 'run';
      return;
    }
    if (m.path.length) { this.stepAlong(m, m.path, 1.5, dt); m.anim = 'walk'; }
    else {
      m.anim = 'idle';
      m.wait = (m.wait ?? 0) - dt;
      if (m.wait <= 0) {
        m.wait = rand(1.5, 4);
        m.path = L.planPath(m.x, m.z, pick(RACCOON_SPOTS), {});
      }
    }
    m.messT -= dt;
    if (m.messT <= 0) {
      m.messT = rand(9, 14);
      this.spawnMess('trash', m.x + rand(-0.3, 0.3), m.z + rand(-0.3, 0.3), { force: true });
      this.sound('thud', m);
      const i = this.stoves.findIndex((s, k) => s && !s.bot && k < 8 && dsq(m, L.STATIONS[`stove${k}`]) < 4);
      if (i >= 0) { this.stoves[i] = null; this.toast(null, '🦝 The raccoon ran off with breakfast from the stove!', 'bad'); }
    }
    for (const g of Object.values(this.guests)) {
      const p = this.parties[g.party];
      if (g.hidden || !p || p.threat || m.scared.has(p.id) || dsq(g, m) > 9 || L.floorOf(g.x)) continue;
      m.scared.add(p.id);
      this.adjust(p, -3, 'raccoon');
      this.say(g, pick(['Is that a RACCOON?!', 'There\'s an animal in here!', 'Aww. Wait, no. Ew.']), 3);
    }
  }

  incidentTimeout(inc) {
    const g = this.guests[inc.g], p = this.parties[inc.p];
    this.endIncident(inc);
    switch (inc.type) {
      case 'slip': {
        const parent = p && p.members.map(id => this.guests[id]).find(m => m && m !== g && !m.hidden);
        this.adjust(p, -22, 'injury');
        if (parent) this.say(parent, 'We are calling our LAWYER!', 4);
        if (g) { g.pose = null; this.goRoom(g, 'bed'); }
        this.toast(null, '🤕 Nobody helped the guest who slipped. That family is livid.', 'bad');
        break;
      }
      case 'lostkid':
        this.adjust(p, -22, 'lostkid');
        if (g) {
          this.say(g, this.horror >= 0.5 ? 'The twins showed me the way back.' : 'I found my way back... by myself.', 4);
          this.goRoom(g);
        }
        this.toast(null, '😰 The lost kid wandered back on their own. The parents are furious.', 'bad');
        break;
      case 'lockout':
        this.adjust(p, -12, 'locked');
        if (g) { this.say(g, 'Forget it. I\'ll sleep in the lobby.', 4); if (!this.goSofa(g)) this.idleFor(g, 4); }
        break;
      case 'drunk':
        if (g) {
          this.spawnMess('vomit', g.x + rand(-0.4, 0.4), g.z + rand(-0.4, 0.4), { force: true });
          g.pose = null;
          this.say(g, 'Ugh. Nobody even brought me a pillow.', 3);
          this.goRoom(g, 'bed');
        }
        this.adjust(p, -6, 'drunk');
        break;
      case 'elevator': this.fixElevator(null, true); break;
      case 'vending':
        this.adjust(p, -5, 'vending');
        if (g) { this.say(g, 'Keep it, then!', 3); this.sound('thud', g); this.idleFor(g, 2); }
        break;
      case 'raccoon': {
        const m = this.monsters[inc.m];
        if (m) { this.raccoonFlee(m); this.toast(null, '🦝 The raccoon wandered off, but not before raiding the trash.', 'bad'); }
        break;
      }
    }
  }

  incidentTask(inc) {
    const g = this.guests[inc.g], p = this.parties[inc.p], m = this.monsters[inc.m];
    const at = g || m || inc;
    const base = { t: inc.t, x: at.x, z: at.z, u: 1 };
    switch (inc.type) {
      case 'slip': return g && { ...base, ic: '🤕', tx: `${g.kind === 'kid' ? 'A kid' : 'A guest'} slipped by the pool — bring a first aid kit`, u: 2 };
      case 'lostkid': return g && p && { ...base, ic: '😰', tx: `${p.name}: their kid is lost${inc.walking ? '' : ` in the ${inc.where}`} — take them back`, u: 2 };
      case 'lockout': return g && { ...base, ic: '🚪', tx: `${L.roomName(inc.room)} is locked out — bring a spare key card from the front desk` };
      case 'drunk': return g && { ...base, ic: '🥴', tx: `A guest passed out in the ${L.zoneAt(g.x, g.z).name} — help them up` };
      case 'elevator': return { ...base, ic: '🛗', tx: 'The elevator is stuck — reset it at the ground floor panel' };
      case 'vending': return { ...base, ic: '🥤', tx: 'The vending machine ate a guest\'s money — give it a whack', x: inc.x, z: inc.z };
      case 'raccoon': return m && { ...base, ic: '🦝', tx: 'A raccoon is loose — shoo it out with a mop' };
    }
    return null;
  }

  // ---------- monsters ----------
  spawnMonster(k, x, z, life, until) {
    if (this.lvl('uv') && life < 1000) life *= 0.6;
    const m = { id: this.id(), k, x, z, ry: 0, path: [], repath: 0, life, until: until || null, stun: 0, lit: 0, cool: 0, scared: new Set(), anim: 'walk', wander: null };
    this.monsters[m.id] = m;
    return m;
  }

  litBy(pl, m) {
    const ex = pl.x, ey = pl.y + 1.6, ez = pl.z;
    const dx = m.x - ex, dy = 1.4 - ey, dz = m.z - ez;
    const d = Math.hypot(dx, dy, dz);
    if (d > 11 || d < 0.01) return false;
    const cp = Math.cos(pl.pitch);
    const lx = -Math.sin(pl.yaw) * cp, ly = Math.sin(pl.pitch), lz = -Math.cos(pl.yaw) * cp;
    return (dx * lx + dy * ly + dz * lz) / d > 0.94;
  }

  updateMonsters(dt) {
    const H = this.hour();
    for (const m of Object.values(this.monsters)) {
      if (m.k === 'raccoon') { this.raccoonTick(m, dt); continue; }
      m.life -= dt;
      if (m.life <= 0 || (m.until && H >= m.until)) { delete this.monsters[m.id]; this.sound('vanish', m); continue; }
      if (m.cool > 0) m.cool -= dt;
      const speed = (m.k === 'porter' ? 4.0 : 3.5) * (this.lvl('garlic') ? 0.7 : 1) * clamp(1 + ((this.D?.horror || 1) - 1) * 0.15, 0.9, 1.12);
      const players = Object.values(this.players).filter(pl => !pl.down && !pl.car);
      let lit = false;
      for (const pl of players) if (pl.fl && this.litBy(pl, m)) lit = true;
      if (lit) m.lit += dt; else m.lit = Math.max(0, m.lit - dt * 0.5);
      if (m.lit > (this.lvl('flashlight') ? 0.6 : 1.2)) { m.stun = 3.5; m.lit = 0; m.path = []; this.sound('screech', m); }
      if (m.stun > 0) {
        m.stun -= dt;
        m.anim = 'stun';
        const near = players.sort((a, b) => dsq(a, m) - dsq(b, m))[0];
        if (near) {
          const dx = m.x - near.x, dz = m.z - near.z, d = Math.hypot(dx, dz) || 1;
          const pos = { x: m.x + (dx / d) * 1.5 * dt, z: m.z + (dz / d) * 1.5 * dt };
          L.resolveCircle(pos, 0.4, 'player');
          m.x = pos.x; m.z = pos.z;
        }
        continue;
      }
      m.anim = 'walk';
      let target = null, td = 28 * 28;
      if (m.cool <= 0) for (const pl of players) { const d = dsq(pl, m); if (d < td) { td = d; target = pl; } }
      if (target) {
        m.wander = null;
        if (td < 20 && L.zoneAt(m.x, m.z).id === L.zoneAt(target.x, target.z).id) this.monsterStep(m, target.x, target.z, speed * 1.08, dt);
        else {
          m.repath -= dt;
          if (m.repath <= 0 || !m.path.length) {
            m.repath = 0.7;
            const ids = L.findPath(L.nearestNode(m.x, m.z), L.nearestNode(target.x, target.z)) || [];
            m.path = ids.map(id => L.NODES[id]);
            if (m.path.length > 1 && dsq(m.path[0], m) < 1) m.path.shift();
          }
          if (m.path.length && !this.ride(m, m.path, dt)) { this.monsterStep(m, m.path[0].x, m.path[0].z, speed, dt); if (dsq(m.path[0], m) < 0.04) m.path.shift(); }
        }
        if (td < 0.9) { this.knockDown(target, 10, 'caught'); m.cool = 4; m.path = []; }
      } else {
        if (!m.wander || dsq(m.wander, m) < 0.3) {
          m.wanderPath = (L.findPath(L.nearestNode(m.x, m.z), pick(this.wanderSpots())) || []).map(id => L.NODES[id]);
          m.wander = m.wanderPath[m.wanderPath.length - 1] || { x: m.x, z: m.z };
        }
        if (m.wanderPath?.length) { if (!this.ride(m, m.wanderPath, dt)) { this.monsterStep(m, m.wanderPath[0].x, m.wanderPath[0].z, speed * 0.6, dt); if (dsq(m.wanderPath[0], m) < 0.04) m.wanderPath.shift(); } }
        else m.wander = null;
      }
      const mzone = L.zoneAt(m.x, m.z);
      for (const g of Object.values(this.guests)) {
        if (g.hidden || dsq(g, m) > 25) continue;
        const p = this.parties[g.party];
        if (!p || p.threat || p.surveyed || m.scared.has(p.id) || ARCH[p.kind].cult || ARCH[p.kind].vampire) continue;
        const gz = L.zoneAt(g.x, g.z);
        if (gz.id !== mzone.id || gz.room !== mzone.room) continue;
        m.scared.add(p.id);
        this.adjust(p, -25, 'horror');
        this.say(g, pick(LINES.scared), 3);
        this.sound('scream', g);
        if (p.st === 'staying' && p.room) this.walkTo(g, `r${p.room}_bed`, 'bed', 2.4);
      }
    }
  }

  monsterStep(m, tx, tz, speed, dt) {
    const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
    if (d < 0.001) return;
    const step = Math.min(d, speed * dt);
    const nx = m.x + (dx / d) * step, nz = m.z + (dz / d) * step;
    m.ry = Math.atan2(dx, dz);
    if (this.lvl('salt') && L.roomAt(nx, nz) && !L.roomAt(m.x, m.z)) { m.path = []; return; } // salt line at the door
    m.x = nx;
    m.z = nz;
    m.y = L.surfaceY(m.x, m.z, m.y || 0);
  }

  knockDown(pl, secs, why) {
    if (pl.down > 0) return;
    pl.down = secs;
    const it = this.dropHeld(pl);
    if (it) it.y = L.floorY(it.x, it.z);
    if (pl.car && this.cars[pl.car]) this.cars[pl.car].driver = null;
    pl.car = null;
    this.send({ k: 'ev', e: 'down', p: pl.id, t: secs, why });
    this.sound(why === 'abducted' ? 'ufo' : 'scream', pl);
  }

  // ---------- UFO ----------
  startUfo() {
    const parked = Object.values(this.cars).filter(c => (c.st === 'parked' || c.st === 'moved') && !c.driver);
    const car = parked.length ? pick(parked) : null;
    const tx = car ? car.x : rand(-20, 20), tz = car ? car.z : rand(22, 32);
    this.ufo = { x: -140, y: 45, z: tz, tx, tz, ph: 'in', t: 0, car: car?.id ?? null };
    this.sound('ufo', { x: tx, z: tz });
    this.toast(null, '🛸 Strange lights over the parking lot...', 'horror');
  }

  updateUfo(dt) {
    const u = this.ufo;
    if (!u) return;
    u.t += dt;
    if (u.ph === 'in') {
      const dx = u.tx - u.x, dz = u.tz - u.z, d = Math.hypot(dx, dz);
      const step = Math.min(d, 26 * dt);
      if (d > 0.01) { u.x += (dx / d) * step; u.z += (dz / d) * step; }
      u.y += (14 - u.y) * Math.min(1, dt * 1.2);
      if (d < 0.5) { u.ph = 'beam'; u.bt = 0; }
    } else if (u.ph === 'beam') {
      u.bt += dt;
      const c = u.car && this.cars[u.car];
      if (c && this.lvl('tinfoil')) {
        if (!u.foiled) { u.foiled = true; this.toast(null, '🛸 The tractor beam bounced off the tinfoil. Take that, aliens.', 'good'); }
        if (u.bt > 6) u.ph = 'out';
      } else if (c && !c.driver && (c.x - u.x) ** 2 + (c.z - u.z) ** 2 < 9) {
        c.lift = Math.min(1, c.lift + dt / 9);
        if (c.lift >= 1) {
          const p = this.parties[c.party];
          if (p) { p.flags.carGone = true; p.car = null; }
          delete this.cars[c.id];
          this.toast(null, `🛸 The ${c.name} was abducted!`, 'horror');
          u.ph = 'out';
        }
      } else if (c) { c.lift = 0; u.car = null; }
      for (const pl of Object.values(this.players)) {
        if (!pl.down && !pl.car && (pl.x - u.x) ** 2 + (pl.z - u.z) ** 2 < 4.8) this.knockDown(pl, 8, 'abducted');
      }
      if (u.bt > 14) u.ph = 'out';
    } else {
      u.y += 18 * dt;
      u.x += 30 * dt;
      if (u.t > 60 || u.y > 60) {
        for (const c of Object.values(this.cars)) c.lift = 0;
        this.ufo = null;
      }
    }
  }

  // Creepy flavor that everyone experiences together.
  updateAmbience(dt) {
    const hz = this.horror || 0;
    if (!hz || !this.isNight()) return;
    this.flickerT -= dt;
    if (this.flickerT <= 0) {
      this.flickerT = rand(20, 50) / hz;
      if (chance(0.5 + hz * 0.4)) this.send({ k: 'ev', e: 'flicker', d: rand(0.4, 1.4) });
    }
    this.creepT -= dt;
    if (this.creepT <= 0) {
      this.creepT = rand(25, 60) / hz;
      const n = L.NODES[pick(['elev', 'h-18.6', 'h15.4', 'util_c', 'basement', 'laun_c', 'h27.5', ...L.PATROL].filter(id => L.isActive(L.NODES[id])))];
      this.sound(pick(['elevator', 'knock', 'whisper', 'creak', 'laugh']), n);
    }
    // Two little girls at the end of a hallway, there and gone.
    this.twinsT -= dt;
    if (this.twinsT <= 0) {
      this.twinsT = rand(80, 160) / hz;
      const n = hz >= 0.5 && L.NODES[pick(L.PATROL.filter(id => id.startsWith('h') && L.isActive(L.NODES[id])))];
      if (n) { this.send({ k: 'ev', e: 'twins', x: n.x, z: n.z }); this.sound('whisper', n); }
    }
  }

  // ---------- actions from players ----------
  handleAction(pid, a) {
    const pl = this.players[pid];
    if (!pl || !a) return;
    if (a.a === 'cmd') { this.command(pid, a); return; }
    if (a.a === 'buy') { this.buy(pl, a.u, a.room); return; }
    if (a.a === 'settings') { if (pid === this.hostId) this.setSettings(a.s); return; }
    if (pl.down > 0) return;
    switch (a.a) {
      case 'pickup': {
        const it = this.items[a.id];
        if (!it || it.holder || pl.held || pl.car || dsq(pl, it) > 20) return;
        it.holder = pl.id;
        it.fly = false;
        pl.held = it.id;
        it.idle = 0;
        this.sound('pickup', it);
        break;
      }
      case 'drop': this.dropHeld(pl, a.x, a.z); break;
      case 'throw': {
        const it = this.heldItem(pl);
        if (!it || pl.car) return;
        pl.held = null;
        it.holder = null;
        const power = it.t === 'body' ? 3.5 : it.t === 'luggage' ? 7 : 10;
        it.x = pl.x; it.z = pl.z; it.y = pl.y + 1.4;
        it.vx = a.dx * power; it.vy = a.dy * power + 2; it.vz = a.dz * power;
        it.fly = true;
        it.thrower = pl.id;
        this.sound('whoosh', pl);
        break;
      }
      case 'clean': if (this.phase === 'shift') this.clean(pl, a); break;
      case 'desk': if (this.phase === 'shift') this.deskAction(pl, a); break;
      case 'station': this.station(pl, a); break;
      case 'serve': if (this.phase === 'shift') this.serve(pl, a); break;
      case 'door': if (this.phase === 'shift') this.doorAct(pl, a); break;
      case 'curtain': this.curtainAct(pl, a); break;
      case 'thermo': this.thermoAct(pl, a); break;
      case 'car-enter': this.carEnter(pl, a); break;
      case 'car-exit': this.carExit(pl, a); break;
      case 'honk': this.sound('honk', pl); break;
      case 'escort': {
        const g = this.guests[a.g];
        if (g && dsq(pl, g) < 25) this.escortGuest(g, pl, null);
        break;
      }
      case 'help': if (this.phase === 'shift') this.helpGuest(pl, a); break;
      case 'shoo': if (this.phase === 'shift') this.shoo(pl, a); break;
    }
  }

  buy(pl, uid, roomId) {
    if (!['shop', 'lobby'].includes(this.phase)) return;
    if (uid === 'suites') { // renovate one standard room into a suite
      const r = L.ROOM_BY_ID[roomId];
      if (!r || r.pres || this.tierOf(roomId) !== 'basic' || !this.roomOpen(roomId) || this.money < SUITE_COST) return;
      this.money -= SUITE_COST;
      this.tiers[roomId] = 'suite';
      this.toast(null, `🛋️ ${pl.name} renovated Room ${roomId} into a suite!`, 'good');
      this.sound('kaching', pl);
      return;
    }
    const u = UPGRADE_BY_ID[uid];
    if (!u || u.hotelTab || (u.req && !this.lvl(u.req))) return;
    const lv = this.lvl(uid);
    const cost = u.cost[lv];
    if (cost === undefined || this.money < cost) return;
    this.money -= cost;
    this.upgrades[uid] = lv + 1;
    this.applyFlags();
    if (uid === 'supplies' || L.FLOORS.some(F => F.flag === uid)) this.spawnTools();
    this.toast(null, `${u.icon} ${pl.name} bought ${u.name}!`, 'good');
    this.sound('kaching', pl);
  }

  // ---------- tasks (HUD list) ----------
  buildTasks() {
    const T = [];
    const H = this.hour();
    if (this.queue.length) {
      const f = this.guests[this.queue[0]];
      const outs = this.queue.filter(id => this.guests[id]?.qmode === 'out').length;
      const ins = this.queue.length - outs;
      const label = [ins && `${ins} check-in`, outs && `${outs} check-out`].filter(Boolean).join(', ');
      T.push({ ic: '🛎️', tx: `Front desk: ${label}`, t: f ? f.patience : -1, x: 6, z: -7.2, u: this.queue.length >= 3 ? 1 : 0 });
    }
    if (!this.power) {
      const fixer = this.claimedBy('power');
      T.push({ ic: '⚡', tx: fixer ? 'Power out — the electrician is on the way' : 'Power out! Reset the breaker (Utility Room)', t: -1, x: -29.5, z: -25.5, u: fixer ? 1 : 2, bot: fixer ? 1 : 0 });
    }
    for (const g of this.trespassers()) {
      const zone = g.snoop?.zone || L.zoneAt(g.x, g.z).name;
      T.push({ ic: '🚷', tx: `A guest is snooping in the ${zone} — walk them out`, t: g.st === 'trespass' ? g.t : -1, x: g.x, z: g.z, u: 1, bot: this.claimedBy('e' + g.id) ? 1 : 0 });
    }
    for (const c of Object.values(this.cars)) {
      const bot = c.driver < 0 || this.claimedBy('c' + c.id) ? 1 : 0;
      if (c.driver > 0) continue;
      if (c.st === 'valet') T.push({ ic: '🚗', tx: bot ? `The valet intern is parking the ${c.name}` : `Park the ${c.name}`, t: c.due - this.clock, x: c.x, z: c.z, bot });
      else if (c.st === 'retrieve') T.push({ ic: '🔑', tx: bot ? `The intern is fetching the ${c.name}` : `Bring the ${c.name} to the front`, t: c.due - this.clock, x: c.x, z: c.z, u: bot ? 0 : 1, bot });
    }
    const lugRooms = {};
    for (const it of Object.values(this.items)) if (it.t === 'luggage' && (!it.holder || it.holder < 0)) (lugRooms[it.room] ||= it);
    for (const [room, it] of Object.entries(lugRooms)) {
      const p = this.parties[it.party];
      const bot = it.holder < 0 || this.claimedBy('l' + it.id) ? 1 : 0;
      T.push({ ic: '🧳', tx: `Luggage → ${L.roomName(room)}${bot ? ' (Bellhop Bot)' : ''}`, t: p ? p.luggageDue - this.clock : -1, x: it.x, z: it.z, bot });
    }
    for (const p of Object.values(this.parties)) {
      if (!p.request || !p.room) continue;
      const rq = p.request;
      const r = L.ROOM_BY_ID[p.room];
      const name = L.roomName(p.room);
      let tx = `${name}: ${REQUESTS[rq.type].label}`;
      if (rq.type === 'food') tx = `${name}: room service — ${DISHES[rq.dish].name}`;
      if (rq.type === 'noise') tx = `${name}: noise complaint (knock on ${rq.target})`;
      const tgt = rq.type === 'noise' ? L.ROOM_BY_ID[rq.target].door : r.door;
      const bot = this.claimedBy('t' + p.id) || this.claimedBy('q' + p.id) || this.claimedBy('r' + p.room) ? 1 : 0;
      T.push({ ic: rq.type === 'food' ? DISHES[rq.dish].icon : REQUESTS[rq.type].icon, tx, t: rq.t, x: tgt.x, z: tgt.z, bot });
    }
    for (const [gid, o] of Object.entries(this.orders)) {
      const t = L.TABLES[o.table];
      if (!this.guests[gid]) continue;
      const left = o.dishes.filter((d, k) => !o.got[k]);
      T.push({ ic: left.map(d => DISHES[d].icon).join(''), tx: `${t.name}: ${left.map(d => DISHES[d].name).join(' + ')}`, t: o.t, x: t.x, z: t.z, bot: this.claimedBy('o' + gid) ? 1 : 0 });
    }
    for (const r of Object.values(this.rooms)) {
      if (r.st !== 'dirty' || !this.roomOpen(r.id)) continue;
      const lr = L.ROOM_BY_ID[r.id];
      const bot = this.claimedBy('r' + r.id) ? 1 : 0;
      T.push({ ic: '🛏️', tx: `${L.roomName(r.id)} needs cleaning${bot ? ' (Housekeeper)' : ''}`, t: -1, x: lr.cx, z: (lr.z1 + lr.z2) / 2, u: !bot && this.queue.length && !this.vacantRooms().length ? 1 : 0, bot });
    }
    for (const p of Object.values(this.parties)) {
      if (p.kind === 'vampire' && p.st === 'staying' && p.room && this.rooms[p.room].curtains && H >= 27.5 && H < 30) {
        const r = L.ROOM_BY_ID[p.room];
        T.push({ ic: '🌅', tx: `Close the curtains in ${L.roomName(p.room)} before sunrise!`, t: (30 - H) / 21 * this.shiftLen, x: r.window.x, z: r.window.z, u: 1 });
      }
    }
    const circles = Object.values(this.messes).filter(m => m.t === 'circle');
    for (const m of circles) T.push({ ic: '⛧', tx: `Scrub the summoning circle (${L.zoneAt(m.x, m.z).name})`, t: (1 - (m.charge || 0)) * 70, x: m.x, z: m.z, u: 1 });
    const bodies = Object.values(this.items).filter(it => it.t === 'body' && !it.holder);
    const blood = Object.values(this.messes).filter(m => m.t === 'blood');
    if (bodies.length) T.push({ ic: '⚰️', tx: 'Get the body to the dumpster before a guest sees it', t: -1, x: bodies[0].x, z: bodies[0].z, u: 2, secret: !this.lvl('cameras') });
    if (blood.length) T.push({ ic: '🩸', tx: `Mop up the blood (${blood.length})`, t: -1, x: blood[0].x, z: blood[0].z, u: 2, secret: !this.lvl('cameras') });
    for (const a of this.alerts) T.push({ ic: a.ic, tx: a.tx, t: -1, x: a.x, z: a.z, u: 2 });
    const zones = {};
    for (const m of Object.values(this.messes)) {
      if (m.room || ['circle', 'blood', 'debris', 'table'].includes(m.t)) continue;
      const zn = L.zoneAt(m.x, m.z);
      (zones[zn.name] ||= { n: 0, m });
      zones[zn.name].n++;
    }
    for (const [name, z] of Object.entries(zones)) T.push({ ic: '🧹', tx: `${name}: ${z.n} mess${z.n > 1 ? 'es' : ''}`, t: -1, x: z.m.x, z: z.m.z });
    const tables = Object.values(this.messes).filter(m => m.t === 'table');
    if (tables.length) {
      const bot = tables.every(m => this.claimedBy('m' + m.id)) ? 1 : 0;
      T.push({ ic: '🍽️', tx: `Clear ${tables.length} dirty table${tables.length > 1 ? 's' : ''}${bot ? ' (Dish Bot)' : ''}`, t: -1, x: tables[0].x, z: tables[0].z, bot });
    }
    const fire = this.fires.findIndex(Boolean);
    if (fire >= 0) { const st = L.STATIONS[`stove${fire}`]; T.push({ ic: '🔥', tx: 'KITCHEN FIRE! Put it out with the extinguisher', t: -1, x: st.x, z: st.z, u: 2 }); }
    const tubs = Object.values(this.items).filter(it => it.t === 'dishes' && !it.holder);
    if (tubs.length) T.push({ ic: '🍽️', tx: `Take the dirty dishes to the sink (${tubs.length})`, t: -1, x: tubs[0].x, z: tubs[0].z });
    if (this.sinkPile) {
      const who = this.lvl('dishwasher') ? 'Dishwasher' : this.claimedBy('sink') ? 'Dish Bot' : '';
      const n = `${this.sinkPile} tub${this.sinkPile > 1 ? 's' : ''}`;
      T.push({ ic: '🫧', tx: `Wash the dishes (${n})${this.plates ? '' : ' — OUT OF PLATES'}${who ? ` (${who})` : ''}`, t: -1, x: L.STATIONS.sink.x, z: L.STATIONS.sink.z, u: this.plates ? 0 : 2, bot: who ? 1 : 0 });
    }
    const debris = Object.values(this.messes).filter(m => m.t === 'debris');
    if (debris.length >= 2) T.push({ ic: '🏊', tx: `Skim the pool (${debris.length} gunk)${this.lvl('skimmer') ? ' (Pool Bot)' : ''}`, t: -1, x: 20, z: -2, u: debris.length > 5 ? 1 : 0, bot: this.lvl('skimmer') ? 1 : 0 });
    for (const inc of Object.values(this.incidents)) { const t = this.incidentTask(inc); if (t) T.push(t); }
    for (const m of Object.values(this.monsters)) if (m.k !== 'raccoon') T.push({ ic: '👁️', tx: m.k === 'porter' ? 'The Night Porter is hunting staff' : 'A shade is loose!', t: -1, x: m.x, z: m.z, u: 2, secret: !this.lvl('cameras'), mon: 1 });
    // Jobs a helper already has are listed after the ones that need a person.
    T.sort((a, b) => (a.bot || 0) - (b.bot || 0) || (b.u || 0) - (a.u || 0) || (a.t < 0 ? 1e9 : a.t) - (b.t < 0 ? 1e9 : b.t));
    this.tasks = T.slice(0, 18).map(t => ({ ...t, t: t.t < 0 ? -1 : Math.round(t.t), x: r2(t.x), z: r2(t.z) }));
  }

  // ---------- snapshot for rendering/network ----------
  iconFor(g) {
    if (g.incident && g.st === 'incident') return INCIDENT_ICON[this.incidents[g.incident]?.type] || '';
    const o = this.orders[g.id];
    if (o) return o.dishes.filter((d, k) => !o.got[k]).map(d => DISHES[d].icon).join('');
    if (g.eatT > 0) return '😋';
    if (g.emoT > 0) return g.emo;
    if (g.st === 'trespass' || g.snoop) return '👀';
    if (g.st === 'queue' && this.queue[0] === g.id && !g.path.length) return g.qmode === 'in' ? '🛎️' : '🔑';
    if (g.st === 'sleep') return '💤';
    if (g.st === 'curb') return '🚗';
    return '';
  }

  deskInfo() {
    const g = this.deskGuest();
    if (!g) return null;
    const p = this.parties[g.party];
    const A = ARCH[p.kind];
    const tiers = {};
    for (const t of Object.keys(TIERS)) tiers[t] = this.vacantRooms(t).length;
    const prices = {};
    for (const t of Object.keys(TIERS)) prices[t] = Math.round(A.rate * TIERS[t].price * (this.lvl('billboard') ? 1.1 : 1));
    return {
      g: g.id, m: g.qmode, c: p.card, n: p.name, sz: p.size, room: p.room, k: g.rk, s: g.seed, w: g.wrong ? 1 : 0,
      free: this.vacantRooms().length, pt: Math.round(g.patience), tiers, prices, taste: p.taste,
      pres: !!this.lvl('pres'), suites: Object.values(this.tiers).filter(t => t === 'suite').length,
      flag: this.lvl('background') && p.threat ? 1 : 0,
    };
  }

  snapshot() {
    const H = this.hour();
    const st = this.stoveTimes();
    const noiseTargets = new Set(Object.values(this.parties).filter(p => p.request?.type === 'noise').map(p => p.request.target));
    const rs = [];
    for (const s of this.roundSurveys) for (let i = 0; i < (s.w || 1); i++) rs.push(s.stars);
    return {
      k: 'snap', ph: this.phase, rd: this.round, ck: r2(this.clock), sl: this.shiftLen, H: r2(H), mo: this.money,
      pw: this.power ? 1 : 0, hz: this.phase === 'shift' ? r2(this.horror) : 0, th: this.threshold || this.def?.threshold || 0, ttl: this.def?.title || '',
      rs, q: this.queue.length, up: this.upgrades, cook: r2(st.cook),
      st: this.settings, km: this.kitchenMode(), np: Object.keys(this.players).length,
      ht: { t: L.ROOMS.map(r => this.tierOf(r.id)[0]), f: { ...L.FLAGS } },
      hp: this.helperSnapshot(),
      g: Object.values(this.guests).filter(g => !g.hidden).map(g => ({
        i: g.id, k: g.rk, s: g.seed, x: r2(g.x), z: r2(g.z), y: r2(g.y), r: r2(g.ry), a: g.anim, p: g.pose,
        ic: this.iconFor(g), sy: g.sayT > 0 ? g.say : '', w: g.wrong ? 1 : 0,
      })),
      c: Object.values(this.cars).map(c => ({ i: c.id, m: c.model, cl: c.color, x: r2(c.x), z: r2(c.z), r: r2(c.ry), d: c.driver, st: c.st, lf: r2(c.lift), n: c.name })),
      it: Object.values(this.items).map(it => ({ i: it.id, t: it.t, x: r2(it.x), y: r2(it.y), z: r2(it.z), r: r2(it.ry), h: it.holder, rm: it.room, cl: it.color, of: it.of, c: it.c, hm: it.home && !it.holder && (it.x - it.home.x) ** 2 + (it.z - it.home.z) ** 2 < 0.05 ? 1 : 0 })),
      m: Object.values(this.messes).map(m => ({ i: m.id, t: m.t, x: r2(m.x), y: r2(m.y), z: r2(m.z), ch: m.charge !== undefined ? r2(m.charge) : undefined, rm: m.room })),
      mn: Object.values(this.monsters).map(m => ({ i: m.id, k: m.k, x: r2(m.x), z: r2(m.z), y: r2(m.y || 0), r: r2(m.ry), a: m.anim })),
      rm: L.ROOMS.map(r => {
        const s = this.rooms[r.id];
        const p = s.party && this.parties[s.party];
        return [s.st, s.dnd ? 1 : 0, s.curtains ? 1 : 0, s.cold ? 1 : 0, p?.request ? (p.request.type === 'food' ? DISHES[p.request.dish].icon : REQUESTS[p.request.type].icon) : '', p?.request?.type || '', noiseTargets.has(r.id) ? 1 : 0];
      }),
      sv: this.stoves.map(s => { if (!s) return null; const ss = this.stoveState(s); return [s.raw, ss.st, r2(ss.p), s.bot ? 1 : 0, s.add ? 1 : 0]; }),
      kt: { fi: this.fires.map(f => (f ? 1 : 0)), sk: this.sinkPile, pt: this.platesOn() ? this.plates : -1, ps: this.pass, od: this.tickets() },
      tk: this.tasks, dk: this.deskInfo(),
      cl: this.closingAt ? { t: Math.max(0, Math.round(CLOSING_LIMIT - (this.clock - this.closingAt))), n: this.openTasks() } : null,
      ufo: this.ufo ? { x: r2(this.ufo.x), y: r2(this.ufo.y), z: r2(this.ufo.z), b: this.ufo.ph === 'beam' ? 1 : 0 } : null,
      pl: Object.values(this.players).map(p => ({ i: p.id, n: p.name, c: p.color, h: p.held ? this.items[p.held]?.t : null, hi: p.held, of: p.held ? this.items[p.held]?.of : undefined, hc: p.held ? this.items[p.held]?.c : undefined, dn: r2(p.down), car: p.car })),
      res: this.phase === 'results' || this.phase === 'gameover' || this.phase === 'victory' ? this.results : null,
    };
  }
}

Object.assign(Sim.prototype, helperMethods);
