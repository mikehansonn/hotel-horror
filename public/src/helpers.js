// Helpers: the NPCs and robots that automation upgrades add to the hotel. Each one is a visible
// character that walks (or rolls, or paddles) to its job and does it, so the crew can see the help.
// Mixed into Sim at the end of sim.js; runs on the host only.
import * as L from './layout.js';
import { MESSES, HELPERS, LINES, CHEF_DISHES } from './content.js';
import { rand, pick, chance } from './util.js';

const r2 = v => Math.round(v * 100) / 100;
const dsq = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
const at = id => { const a = L.APPROACH[id]; return { x: a[0], z: a[1] }; };
const carSide = c => ({ x: c.x + Math.cos(c.ry) * 1.4, z: c.z - Math.sin(c.ry) * 1.4 });

const SPEED = { roomba: 1.0, skimmer: 0.8, valet: 2.0, bellhop: 1.5, housekeeper: 1.35, chef: 1.0, busboy: 1.3, towelbot: 1.4, electrician: 1.6, guard: 1.45, doorman: 1.3 };
// How many of each helper an upgrade level buys (anything not listed: one).
const COUNT = { roomba: [0, 2, 4], bellhop: [0, 1, 2], housekeeper: [0, 1, 2] };
// Which way each helper faces while it waits at its post.
const HOME_RY = { doorman: 0, valet: 0, bellhop: 0, roomba: 0, housekeeper: 0, chef: Math.PI, busboy: Math.PI, towelbot: Math.PI / 2, electrician: Math.PI, guard: Math.PI };
const ROOMBA_MESS = new Set(['spill', 'mud', 'trash', 'stain', 'vomit', 'slime', 'ecto']);
const ROOMBA_ZONES = new Set(['lobby', 'hall', 'dining', 'elev', 'pool']);
const ROOMBA_PATROL = ['lob_c', 'lob_w', 'lob_pool', 'lob_n', 'conn', 'din_door', 'h-12.6', 'h-6.6', 'h3.4', 'h9.4'];
const GUARD_EXTRA = ['lob_c', 'lob_n', 'din_door', 'pd_sw', 'pd_ne', 'elev'];
const TOWEL_SHELVES = ['towels', 'towels2', 'towels@2', 'towels@3'];
const RAW = { eggs: 'egg_raw', pancakes: 'batter', bacon: 'bacon_raw', waffles: 'batter' };
const DRINKS = { coffee: 'coffee', juice: 'juicer', cocoa: 'cocoa' };
const FRIDGE = { egg_raw: 'fridge_egg', batter: 'fridge_batter', bacon_raw: 'fridge_bacon' };
const SINK = { x: -18.55, z: -9.6 };
const CHEF_SLOW = 1.5;      // "Slowly. Very slowly."
const DOOR_POST = 28 * 28;  // the doorman only leaves the entrance for snoops this close
const LANE_X = 28.8;        // valet driving lanes down the sides of the parking lot
const AISLE_Z = 27;
const JOB_TIMEOUT = 150;

function turnToward(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * Math.min(1, k);
}

// Like L.nearestNode, but never a spot in the pool: helpers walk around it, not through it.
function navNode(x, z) {
  const zn = L.zoneAt(x, z);
  const zk = zn.room ? `R${zn.room}` : zn.id;
  let best = null, bd = Infinity, any = null, ad = Infinity;
  for (const id in L.NODES) {
    const nd = L.NODES[id];
    if (nd.pose === 'swim' || !L.isActive(nd)) continue;
    const d = (nd.x - x) ** 2 + (nd.z - z) ** 2;
    if (d < ad) { ad = d; any = id; }
    if (nd.zk === zk && d < bd) { bd = d; best = id; }
  }
  return best || any;
}

export const helperMethods = {
  // ---------- roster ----------
  helperCount(k) {
    const lv = this.lvl(k);
    if (!lv) return 0;
    const c = COUNT[k];
    return c ? c[Math.min(lv, c.length - 1)] : 1;
  },

  // Called whenever upgrades change: spawn bought helpers at their posts.
  syncHelpers() {
    for (const k of Object.keys(HELPERS)) {
      const want = this.helperCount(k);
      const have = Object.values(this.helpers).filter(h => h.k === k);
      for (let i = have.length; i < want; i++) this.spawnHelper(k, i);
      for (const h of have.slice(want)) this.removeHelper(h);
    }
  },

  spawnHelper(k, i) {
    const homes = L.HELPER_HOMES[k] || [[0, 0]];
    const [x, z] = homes[i % homes.length];
    const h = {
      id: this.id(), k, x, z, y: k === 'skimmer' ? L.POOL.waterY : 0, ry: HOME_RY[k] ?? 0, home: { x, z },
      speed: SPEED[k] || 1.2, run: 1, path: [], job: null, carry: null, keys: [], anim: 'idle', say: '', sayT: 0,
      t: 0, think: rand(0.2, 1), idleT: 0, hold: 0, cool: 0, aimT: 0, hidden: false, car: null, fl: false, label: '', dishes: false, load: 0,
    };
    this.helpers[h.id] = h;
    return h;
  },

  removeHelper(h) {
    if (h.car) {
      const c = this.cars[h.car];
      if (c && c.driver === -h.id) { c.driver = null; c.botMode = null; c.path = []; c.reserved = null; c.drop = -1; }
      this.valetOut(h, c);
    }
    this.hAbort(h);
    delete this.helpers[h.id];
  },

  // Start of every shift: everyone back at their post with empty hands.
  resetHelpers() {
    this.claims = {};
    this.hkRefused = new Set();
    for (const h of Object.values(this.helpers)) {
      Object.assign(h, {
        x: h.home.x, z: h.home.z, y: h.k === 'skimmer' ? L.POOL.waterY : 0, ry: HOME_RY[h.k] ?? 0, path: [], job: null, carry: null,
        keys: [], anim: 'idle', sayT: 0, hidden: false, car: null, fl: false, label: '', dishes: false, load: 0, hold: 0, cool: 0, aimT: 0, wander: null,
      });
    }
  },

  // ---------- claims: which helper is already on which job ----------
  claim(key, h) {
    if (this.isClaimed(key, h)) return false;
    this.claims[key] = h.id;
    if (!h.keys.includes(key)) h.keys.push(key);
    return true;
  },
  release(h, key) {
    for (const k of key ? [key] : h.keys) if (this.claims[k] === h.id) delete this.claims[k];
    h.keys = key ? h.keys.filter(k => k !== key) : [];
  },
  claimedBy(key) {
    const id = this.claims[key];
    return id && this.helpers[id] ? id : 0;
  },
  isClaimed(key, h) {
    const id = this.claimedBy(key);
    return !!id && id !== h?.id;
  },

  // ---------- movement ----------
  hGo(h, x, z, run = 1) {
    const tgt = { x, z };
    const from = navNode(h.x, h.z), to = navNode(x, z);
    const pts = (from && to && L.findPath(from, to) || []).map(id => L.NODES[id]);
    // Don't walk back to a node we're already past, or past the target to the node beyond it.
    if (pts.length > 1 && dsq(h, pts[1]) < dsq(pts[0], pts[1])) pts.shift();
    if (pts.length > 1) {
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      if (a.zk === b.zk && dsq(a, tgt) < dsq(a, b)) pts.pop();
    } else if (pts.length === 1 && dsq(h, tgt) <= dsq(h, pts[0])) pts.pop();
    if (pts.length && dsq(h, pts[0]) < 0.09) pts.shift();
    h.path = pts.map(n => ({ x: n.x, z: n.z }));
    h.path.push(tgt);
    h.run = run;
  },

  // Advances along the path; true once there.
  hStep(h, dt) {
    const t = h.path[0];
    if (!t) return true;
    if (this.ride(h, h.path, dt)) return !h.path.length; // taking the elevator
    const dx = t.x - h.x, dz = t.z - h.z, d = Math.hypot(dx, dz);
    const step = h.speed * h.run * (L.inPool(h.x, h.z) ? 0.6 : 1) * dt;
    if (d <= step) { h.x = t.x; h.z = t.z; h.path.shift(); }
    else { h.x += (dx / d) * step; h.z += (dz / d) * step; }
    if (d > 0.01) h.ry = Math.atan2(dx, dz);
    h.y = L.inPool(h.x, h.z) ? L.POOL.floorY + 0.35 : 0;
    h.anim = h.run > 1.4 ? 'run' : 'walk';
    return !h.path.length;
  },

  // ---------- jobs ----------
  // A job is a list of steps: {go:{x,z}|() => {x,z}, run} walks there, {wait, until, then, anim, face}
  // works on the spot, {fn} acts instantly. A callback returning false abandons the job.
  // Once job.done is set, the job's check is no longer consulted (its goal is already met).
  hJob(h, key, label, steps, check, abort) {
    if (key && !this.claim(key, h)) return false;
    h.job = { key, label, steps, check, abort, done: false, t0: this.clock };
    h.label = label;
    h.path = [];
    h.idleT = 0;
    return true;
  },

  runJob(h, dt) {
    const j = h.job;
    const s = j.steps[0];
    if (!s) { this.hFinish(h); return; }
    if (!j.done && ((j.check && !j.check()) || this.clock - j.t0 > JOB_TIMEOUT)) { this.hAbort(h); return; }
    if (s.go) {
      if (!s.started) {
        s.started = true;
        const p = typeof s.go === 'function' ? s.go() : s.go;
        if (!p) { this.hAbort(h); return; }
        this.hGo(h, p.x, p.z, s.run || 1);
      }
      if (this.hStep(h, dt)) j.steps.shift();
      return;
    }
    if (s.wait !== undefined) {
      if (!s.started) { s.started = true; h.t = s.wait; }
      h.anim = s.anim || 'work';
      if (s.face) h.ry = Math.atan2(s.face.x - h.x, s.face.z - h.z);
      h.t -= dt;
      if (h.t > 0 && !(s.until && s.until())) return;
      j.steps.shift();
      if (s.then && s.then() === false) this.hAbort(h);
      return;
    }
    j.steps.shift();
    if (s.fn && s.fn() === false) this.hAbort(h);
  },

  hFinish(h) {
    h.job = null;
    h.path = [];
    h.label = '';
    h.anim = 'idle';
    this.release(h);
    this.stats.helperJobs++;
  },

  hAbort(h) {
    const j = h.job;
    h.job = null;
    h.path = [];
    h.label = '';
    this.release(h);
    j?.abort?.();
    this.hDrop(h);
  },

  // Lets go of whatever the helper carries: suitcases land on the floor, anything else is binned.
  hDrop(h) {
    const it = h.carry && this.items[h.carry];
    h.carry = null;
    h.dishes = false;
    h.load = 0;
    if (!it || it.holder !== -h.id) return;
    if (it.t === 'luggage') { it.holder = null; it.x = h.x; it.z = h.z; it.y = L.floorY(h.x, h.z); it.idle = 0; }
    else delete this.items[it.id];
  },

  // ---------- main loop ----------
  updateHelpers(dt) {
    const shift = this.phase === 'shift';
    for (const h of Object.values(this.helpers)) {
      if (h.sayT > 0) h.sayT -= dt;
      if (h.k === 'skimmer') { this.skimmerTick(h, dt, shift); continue; }
      if (h.car) { this.valetDrive(h, dt); continue; }
      if (!shift && h.job) this.hAbort(h);
      if (h.k === 'guard') this.guardWatch(h, dt);
      if (h.hold > 0) { h.hold -= dt; h.anim = 'aim'; continue; }
      if (h.job) { this.runJob(h, dt); continue; }
      if (h.path.length) {
        this.hStep(h, dt);
        // Security keeps an eye out for snoops while on the move.
        if (shift && (h.k === 'guard' || h.k === 'doorman') && (h.think -= dt) <= 0) { h.think = 1; this.doEscort(h, h.k === 'doorman' ? DOOR_POST : Infinity); }
        continue;
      }
      h.anim = 'idle';
      h.label = '';
      h.idleT += dt;
      if ((h.think -= dt) > 0) continue;
      h.think = rand(0.5, 0.9);
      if (shift && this[`${h.k}Think`]?.(h)) continue;
      if (dsq(h, h.home) > 0.3) this.hGo(h, h.home.x, h.home.z);
      else h.ry = HOME_RY[h.k] ?? h.ry;
    }
  },

  // ---------- cleaning ----------
  nearestMess(h, ok) {
    let best = null, bd = Infinity;
    for (const m of Object.values(this.messes)) {
      if (!ok(m) || this.isClaimed(`m${m.id}`, h)) continue;
      const d = dsq(h, m);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  },

  // Where to stand to clean a mess: beside the bed, in front of the toilet, at a table corner.
  messSpot(m) {
    const r = m.room && L.ROOM_BY_ID[m.room];
    if (r && m.t === 'bed') return r.pres ? { x: 61.2, z: -25.5 } : r.P(0, 4.4);
    if (r && m.t === 'clog') return r.pres ? { x: 66.1, z: -12.3 } : r.P(1.9, 1.95);
    if (m.t === 'table') { const t = L.TABLES[m.table]; return { x: t.x + 1, z: t.z - 1 }; }
    return { x: m.x, z: m.z };
  },

  helperClean(h, m) {
    if (!this.messes[m.id]) return false;
    delete this.messes[m.id];
    this.sound('clean', m);
    this.afterClean(m, null);
    return true;
  },

  roombaThink(h) {
    const m = this.nearestMess(h, m => ROOMBA_MESS.has(m.t) && !m.room && !m.evidence && !L.inPool(m.x, m.z) && ROOMBA_ZONES.has(L.zoneAt(m.x, m.z).id));
    if (m) {
      return this.hJob(h, `m${m.id}`, `Cleaning up ${MESSES[m.t].name.toLowerCase()}`, [
        { go: { x: m.x, z: m.z } },
        { wait: MESSES[m.t].time * 2.2, anim: 'clean', then: () => { this.helperClean(h, m); } },
      ], () => !!this.messes[m.id]);
    }
    if (h.idleT > 10 && chance(0.2)) { // nothing to do: trundle around looking for crumbs
      const n = L.NODES[pick(ROOMBA_PATROL)];
      this.hGo(h, n.x + rand(-0.8, 0.8), n.z + rand(-0.8, 0.8));
      h.idleT = 0;
      return true;
    }
    return false;
  },

  // The pool bot never leaves the water, so it steers directly instead of using the nav graph.
  skimmerTick(h, dt, shift) {
    const P = L.POOL;
    h.y = P.waterY;
    let m = h.job && this.messes[h.job.m];
    if (h.job && !m) { this.release(h); h.job = null; h.label = ''; }
    if (!h.job && shift && (h.think -= dt) <= 0) {
      h.think = 0.5;
      m = this.nearestMess(h, x => x.t === 'debris');
      if (m && this.claim(`m${m.id}`, h)) { h.job = { m: m.id }; h.t = 1.4; h.label = 'Skimming the pool'; }
      else m = null;
    }
    const goal = m || (h.wander ||= { x: rand(P.x1 + 1.2, P.x2 - 1.2), z: rand(P.z1 + 1.2, P.z2 - 1.2) });
    const dx = goal.x - h.x, dz = goal.z - h.z, d = Math.hypot(dx, dz);
    if (d > 0.4) {
      const step = Math.min(d, h.speed * (m ? 1 : 0.45) * dt);
      h.x += (dx / d) * step;
      h.z += (dz / d) * step;
      h.ry = turnToward(h.ry, Math.atan2(dx, dz), dt * 3);
      h.anim = 'walk';
    } else if (m) {
      h.anim = 'clean';
      if ((h.t -= dt) <= 0) {
        this.helperClean(h, m);
        this.release(h);
        h.job = null;
        h.label = '';
        this.stats.helperJobs++;
      }
    } else { h.wander = null; h.anim = 'idle'; }
  },

  // ---------- housekeeper ----------
  hkCleanable(m) { return !m.evidence && m.t !== 'circle'; },

  housekeeperThink(h) {
    const waiting = this.queue.length && !this.vacantRooms().length;
    let best = null;
    for (const room of Object.values(this.rooms)) {
      if (!this.roomOpen(room.id) || this.isClaimed(`r${room.id}`, h) || this.hkRefused.has(room.id)) continue;
      const p = room.party && this.parties[room.party];
      const call = p?.st === 'staying' && (p.request?.type === 'housekeeping' || p.request?.type === 'clog');
      if (!call && room.st !== 'dirty') continue;
      const messes = this.roomMesses(room.id);
      if (!messes.length) continue;
      const lr = L.ROOM_BY_ID[room.id];
      if (messes.some(m => !this.hkCleanable(m)) || Object.values(this.items).some(it => it.t === 'body' && !it.holder && L.inRect(it.x, it.z, lr))) {
        this.hkRefused.add(room.id);
        this.toast(null, `🧹 The housekeeper refuses to set foot in ${L.roomName(room.id)}. She says you know why.`, 'horror');
        continue;
      }
      const score = (call ? 0 : waiting ? 1e4 : 2e4) + dsq(h, lr.door);
      if (!best || score < best.score) best = { id: room.id, score };
    }
    if (!best) return false;
    const id = best.id;
    return this.hJob(h, `r${id}`, `Cleaning ${L.roomName(id)}`, [{ fn: () => this.hkNext(h, id) }], () => this.roomMesses(id).length > 0);
  },

  hkNext(h, id) {
    const m = this.roomMesses(id).filter(m => this.hkCleanable(m)).sort((a, b) => dsq(h, a) - dsq(h, b))[0];
    if (!m) { h.job.done = true; return; }
    h.job.steps.push(
      { go: this.messSpot(m) },
      {
        wait: MESSES[m.t].time * 1.7, anim: 'clean', face: m, then: () => {
          this.helperClean(h, m);
          if (!this.roomMesses(id).length) h.job.done = true;
        },
      },
      { fn: () => this.hkNext(h, id) },
    );
  },

  // ---------- dish bot ----------
  busboyThink(h) {
    if (this.nearestMess(h, m => m.t === 'table')) return this.hJob(h, null, 'Clearing tables', [{ fn: () => this.busNext(h) }]);
    // Nothing to clear: wash whatever the crew left in the sink.
    if (!this.sinkPile || this.lvl('dishwasher') || this.isClaimed('sink', h)) return false;
    return this.hJob(h, 'sink', 'Washing dishes', [
      { go: SINK },
      { wait: 3, anim: 'work', face: L.STATIONS.sink, then: () => { this.washTub(); this.sound('splash', SINK); } },
    ], () => this.sinkPile > 0);
  },

  // Clears up to three tables, then takes the dishes back to the kitchen sink and washes them.
  busNext(h) {
    const m = h.load < 3 ? this.nearestMess(h, m => m.t === 'table') : null;
    if (!m) {
      if (h.load) h.job.steps.push({ go: SINK }, { wait: 1.5 + h.load, anim: 'work', then: () => { this.returnPlates(h.load); h.load = 0; h.dishes = false; } });
      return;
    }
    this.claim(`m${m.id}`, h);
    h.job.steps.push(
      { go: this.messSpot(m) },
      {
        wait: MESSES.table.time * 2, anim: 'clean', face: m, then: () => {
          if (this.helperClean(h, m)) { h.load++; h.dishes = true; }
          this.release(h, `m${m.id}`);
        },
      },
      { fn: () => this.busNext(h) },
    );
  },

  // ---------- bellhop ----------
  bellhopThink(h) {
    let best = null, bd = Infinity;
    for (const it of Object.values(this.items)) {
      if (it.t !== 'luggage' || it.holder || it.fly || this.isClaimed(`l${it.id}`, h)) continue;
      const p = this.parties[it.party];
      if (!p || p.st !== 'staying' || p.room !== it.room) continue;
      const d = dsq(h, it) + (p.luggageDue - this.clock) * 4; // close by, and due soon
      if (d < bd) { bd = d; best = it; }
    }
    if (!best) return false;
    const it = best;
    return this.hJob(h, `l${it.id}`, `Carrying luggage to ${L.roomName(it.room)}`, [
      { go: { x: it.x, z: it.z } },
      {
        wait: 0.5, anim: 'pickup', then: () => {
          if (it.holder || it.fly || !this.items[it.id]) return false;
          it.holder = -h.id;
          h.carry = it.id;
          this.sound('pickup', h);
        },
      },
      { go: () => { const n = L.NODES[`r${it.room}_mid`]; return n && { x: n.x, z: n.z }; } },
      { fn: () => { this.checkLuggage(); if (!this.items[it.id]) h.job.done = true; } },
      { wait: 0.5, anim: 'idle' },
    ], () => !!this.items[it.id] && (!it.holder || it.holder === -h.id));
  },

  // ---------- valet intern ----------
  valetThink(h) {
    const free = Object.values(this.cars).filter(c => !c.driver && !this.isClaimed(`c${c.id}`, h));
    let mode = 'fetch';
    // Guests waiting at the curb come first; then cars that have sat at the drop-off too long.
    let c = this.freeDrop() < 0 ? null : free
      .filter(c => c.st === 'retrieve' && this.clock - (c.retrieveAt || 0) > 3 && this.parties[c.party]?.st === 'curb')
      .sort((a, b) => dsq(h, a) - dsq(h, b))[0];
    if (!c && this.freeSpot()) {
      mode = 'park';
      c = free.filter(c => c.st === 'valet' && this.clock - (c.arrivedAt || 0) > 10).sort((a, b) => a.arrivedAt - b.arrivedAt)[0];
    }
    if (!c) return false;
    const st = c.st;
    return this.hJob(h, `c${c.id}`, mode === 'fetch' ? `Fetching the ${c.name}` : `Parking the ${c.name}`, [
      { go: () => carSide(c), run: 1.2 },
      { fn: () => this.valetEnter(h, c, mode) },
    ], () => !!this.cars[c.id] && !c.driver && c.st === st);
  },

  valetEnter(h, c, mode) {
    if (!this.cars[c.id] || c.driver) return false;
    let path;
    if (mode === 'park') {
      const s = this.freeSpot();
      if (!s) return false;
      c.reserved = s.id;
      const lane = s.x < 0 ? -LANE_X : LANE_X;
      path = [{ x: c.x + Math.sign(lane) * 2.5, z: 16.3 }, { x: lane, z: 18.4 }, { x: lane, z: AISLE_Z }, { x: s.x, z: AISLE_Z }, { x: s.x, z: s.z }];
    } else {
      const i = this.freeDrop();
      if (i < 0) return false;
      const d = L.DROPS[i];
      c.drop = i;
      const lane = c.x < 0 ? -LANE_X : LANE_X;
      path = [{ x: c.x, z: AISLE_Z }, { x: lane, z: AISLE_Z }, { x: lane, z: 18.4 }, { x: d.x + Math.sign(lane) * 5, z: 15.8 }, { x: d.x, z: d.z }];
    }
    c.driver = -h.id;
    c.botMode = mode;
    c.path = path;
    c.spot = null;
    h.car = c.id;
    h.hidden = true;
    this.sound('doorslam', c);
    return true;
  },

  valetDrive(h, dt) {
    const c = this.cars[h.car];
    if (!c || c.driver !== -h.id) { this.valetOut(h, c); this.hAbort(h); return; }
    h.anim = 'drive';
    if (c.path.length) {
      this.driveScripted(c, dt, 7);
      h.x = c.x; h.z = c.z; h.ry = c.ry;
      return;
    }
    const p = this.parties[c.party];
    const onTime = this.clock <= c.due;
    if (c.botMode === 'park') {
      const s = L.PARKING.find(s => s.id === c.reserved);
      c.st = 'parked';
      c.spot = c.reserved;
      c.reserved = null;
      if (s) c.ry = s.ry;
      if (p && !p.surveyed && onTime) { this.adjust(p, 5, 'valet'); this.addMoney(5); }
    } else {
      const d = L.DROPS[c.drop];
      if (d) c.ry = d.ry;
      c.drop = -1;
      if (p && p.st === 'curb') {
        c.st = 'pickup';
        if (onTime) { this.adjust(p, 4, 'valet'); this.addMoney(5); }
        this.boardAll(p, c);
      } else {
        c.st = 'departing';
        c.party = null;
        c.path = [{ x: c.x - 8, z: L.ROAD_Z }, { x: -100, z: L.ROAD_Z }];
      }
    }
    c.botMode = null;
    c.driver = null;
    this.valetOut(h, c);
    this.hFinish(h);
  },

  valetOut(h, c) {
    h.car = null;
    h.hidden = false;
    if (c) { const s = carSide(c); h.x = s.x; h.z = s.z; }
  },

  // ---------- chef bot ----------
  chefThink(h) {
    let best = null;
    for (const [gid, o] of Object.entries(this.orders)) {
      if (!this.guests[gid] || this.isClaimed(`o${gid}`, h)) continue;
      const left = o.dishes.filter((d, k) => !o.got[k]);
      if (!left.length || !left.every(d => CHEF_DISHES.has(d))) continue;
      if (!best || o.t < best.o.t) best = { gid, o, left };
    }
    if (best) {
      const { gid, o, left } = best;
      const t = L.TABLES[o.table];
      return this.chefJob(h, `o${gid}`, left, `Cooking for ${t.name}`, { x: t.x + 1, z: t.z - 1 },
        () => !!this.orders[gid] && !!this.guests[gid], () => this.chefServe(h, gid));
    }
    let p = null;
    for (const q of Object.values(this.parties)) {
      const rq = q.request;
      if (rq?.type !== 'food' || q.st !== 'staying' || !q.room || !CHEF_DISHES.has(rq.dish) || this.isClaimed(`q${q.id}`, h)) continue;
      if (!p || rq.t < p.request.t) p = q;
    }
    if (!p) return false;
    const rq = p.request, door = L.STATIONS[`door_${p.room}`];
    return this.chefJob(h, `q${p.id}`, [rq.dish], `Room service for ${L.roomName(p.room)}`, { x: door.x, z: door.z },
      () => p.request === rq, () => { this.hDrop(h); this.fulfill(p, null); });
  },

  // Fetch, cook and plate each dish in turn on a tray, then carry it out and serve.
  chefJob(h, key, dishes, label, dest, check, serve) {
    const steps = [{ fn: () => { h.carry = this.spawnItem('tray', h.x, 1, h.z, { holder: -h.id, c: [] }).id; } }];
    for (const d of dishes) steps.push({ fn: () => this.chefCook(h, d) });
    steps.push({ go: dest }, { wait: 0.8, anim: 'work', then: () => { serve(); h.job.done = true; } });
    return this.hJob(h, key, label, steps, check, () => this.chefAbort(h));
  },

  chefPlate(h, dish) {
    const tray = this.items[h.carry];
    if (tray) tray.c.push(dish);
  },

  chefCook(h, dish) {
    const st = DRINKS[dish];
    if (st) {
      const secs = (dish === 'coffee' && this.lvl('espresso') ? 0.6 : 2) * CHEF_SLOW;
      h.job.steps.unshift({ go: at(st) }, { wait: secs, anim: 'work', face: L.STATIONS[st], then: () => this.chefPlate(h, dish) });
      return;
    }
    const raw = dish === 'toast' ? 'bread' : RAW[dish];
    const src = dish === 'toast' ? 'bread' : FRIDGE[raw];
    h.job.steps.unshift({ go: at(src) }, { wait: 0.6 * CHEF_SLOW, anim: 'work', face: L.STATIONS[src] }, { fn: () => this.chefToStove(h, raw, dish) });
  },

  chefToStove(h, raw, dish) {
    const slot = this.chefStove(h, raw, dish);
    if (slot < 0) { // every burner is busy: wait a moment and look again
      h.job.steps.unshift({ wait: 1.5, anim: 'idle' }, { fn: () => this.chefToStove(h, raw, dish) });
      return;
    }
    const id = slot === 8 ? 'toaster' : slot === 9 ? 'waffle' : `stove${slot}`;
    const st = L.STATIONS[id];
    h.job.steps.unshift(
      { go: at(id) },
      {
        fn: () => {
          if (this.stoves[slot] || this.fires[slot]) { h.job.steps.unshift({ fn: () => this.chefToStove(h, raw, dish) }); return; } // someone beat it there
          this.stoves[slot] = { raw, t: 0, slot, bot: h.id };
          this.sound('sizzle', st);
        },
      },
      { wait: 90, anim: 'work', face: st, until: () => this.stoves[slot]?.bot === h.id && this.stoveState(this.stoves[slot]).st !== 'c' },
      {
        fn: () => {
          if (this.stoves[slot]?.bot !== h.id) return false;
          this.stoves[slot] = null;
          this.chefPlate(h, dish);
        },
      },
    );
  },

  chefStove(h, raw, dish) {
    if (raw === 'bread') return this.stoves[8] ? -1 : 8;
    if (dish === 'waffles') return this.stoves[9] ? -1 : 9;
    const n = this.lvl('stove2') ? 8 : 4;
    let best = -1, bd = Infinity;
    for (let i = 0; i < n; i++) {
      if (this.stoves[i] || this.fires[i]) continue;
      const d = dsq(h, at(`stove${i}`));
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  },

  // Abandoned mid-cook: whatever is on the stove is left for the crew to finish.
  chefAbort(h) {
    for (const s of this.stoves) if (s?.bot === h.id) s.bot = 0;
  },

  chefServe(h, gid) {
    const o = this.orders[gid], g = this.guests[gid], tray = this.items[h.carry];
    if (!o || !g || !tray) { this.hDrop(h); return; }
    for (const d of tray.c) {
      const k = o.dishes.findIndex((x, j) => !o.got[j] && x === d);
      if (k >= 0) o.got[k] = true;
    }
    this.hDrop(h);
    if (o.got.every(Boolean)) this.orderDone(g, o, this.parties[g.party], 0);
    else this.say(g, 'And the rest of it?');
  },

  // ---------- towel bot ----------
  towelbotThink(h) {
    let p = null;
    for (const q of Object.values(this.parties)) {
      if (q.request?.type !== 'towels' || q.st !== 'staying' || !q.room || this.isClaimed(`t${q.id}`, h)) continue;
      if (!p || q.request.t < p.request.t) p = q;
    }
    if (!p) return false;
    const rq = p.request, door = L.STATIONS[`door_${p.room}`];
    const via = id => Math.sqrt(dsq(h, at(id))) + Math.sqrt(dsq(at(id), door));
    const shelf = TOWEL_SHELVES.filter(id => L.STATIONS[id] && L.isActive(L.STATIONS[id])).sort((a, b) => via(a) - via(b))[0];
    return this.hJob(h, `t${p.id}`, `Towels for ${L.roomName(p.room)}`, [
      { go: at(shelf) },
      { wait: 1.2, anim: 'work', face: L.STATIONS[shelf], then: () => { h.carry = this.spawnItem('towels', h.x, 1, h.z, { holder: -h.id }).id; } },
      { go: { x: door.x, z: door.z } },
      { wait: 0.8, anim: 'work', then: () => { this.hDrop(h); this.fulfill(p, null); h.job.done = true; } },
    ], () => p.request === rq);
  },

  // ---------- electrician ----------
  electricianThink(h) {
    if (this.power) return false;
    this.say(h, pick(['On it!', 'Who touched the breaker?!', 'Hang tight, folks!']), 2.5);
    return this.hJob(h, 'power', 'Fixing the power', [
      { go: at('breaker'), run: 1.5 },
      { wait: 2.5, anim: 'work', face: L.STATIONS.breaker, then: () => { if (!this.power) this.restorePower(null, 'electrician'); h.job.done = true; } },
    ], () => !this.power);
  },

  // ---------- security: doorman & night guard ----------
  doEscort(h, maxD2 = Infinity) {
    let g = null, bd = maxD2;
    for (const t of this.trespassers()) {
      if (this.isClaimed(`e${t.id}`, h)) continue;
      const d = dsq(h, t);
      if (d < bd) { bd = d; g = t; }
    }
    if (!g) return false;
    const ok = this.hJob(h, `e${g.id}`, 'Escorting a snooping guest', [],
      () => !!this.guests[g.id] && !g.hidden && (g.st === 'trespass' || !!g.snoop || L.isStaffArea(g.x, g.z)));
    if (ok) { h.job.tries = 0; this.escortStep(h, g); }
    return ok;
  },

  escortStep(h, g) {
    h.job.steps.push(
      { go: () => ({ x: g.x, z: g.z }), run: 1.3 },
      {
        fn: () => {
          if (dsq(h, g) > 2.5 && ++h.job.tries < 6) { this.escortStep(h, g); return; } // they kept walking: follow
          if (!this.escortGuest(g, null, h)) return false;
          h.job.done = true;
          const n = g.path[Math.min(1, g.path.length - 1)]; // see them part of the way out
          if (n) h.job.steps.push({ go: { x: n.x, z: n.z } });
        },
      },
    );
  },

  guardThink(h) {
    if (this.doEscort(h)) return true;
    const H = this.hour();
    if (H < 21.5 || H >= 30) return false;
    const ids = [...L.PATROL, ...GUARD_EXTRA].filter(id => L.NODES[id] && L.isActive(L.NODES[id]));
    const n = L.NODES[pick(ids)];
    this.hGo(h, n.x, n.z);
    h.label = 'Patrolling';
    return true;
  },

  // At night the guard shines his flashlight at anything nearby that shouldn't exist.
  guardWatch(h, dt) {
    const H = this.hour();
    h.fl = this.phase === 'shift' && ((H >= 21.5 && H < 30) || !this.power);
    if (h.cool > 0) { h.cool -= dt; return; }
    if (!h.fl) return;
    const hz = L.zoneAt(h.x, h.z);
    for (const m of Object.values(this.monsters)) {
      if (m.stun > 0) continue;
      const d2 = dsq(h, m);
      if (d2 > 64) continue;
      const mz = L.zoneAt(m.x, m.z);
      if (d2 > 9 && (mz.id !== hz.id || mz.room !== hz.room)) continue;
      h.ry = Math.atan2(m.x - h.x, m.z - h.z);
      h.hold = 0.3;
      m.lit += dt * 1.6;
      h.aimT += dt;
      if (h.sayT <= 0) this.say(h, pick(['Hey! HEY!', 'Back off!', 'Security!', 'Not on my watch!']), 2);
      if (h.aimT > 1.6) { h.aimT = 0; h.cool = 6; } // flashlight needs a breather
      return;
    }
    h.aimT = 0;
  },

  doormanThink(h) {
    if (this.doEscort(h, DOOR_POST)) return true;
    for (const p of Object.values(this.parties)) {
      if (p.greeted || p.checkedIn || !p.spawned) continue;
      const g = this.guests[p.leader];
      if (!g || g.hidden || dsq(h, g) > 25) continue;
      p.greeted = true;
      this.say(h, pick(LINES.greet), 3);
      this.emote(g, '🎩', 2);
      this.adjust(p, 2, 'welcome');
      return this.hJob(h, null, 'Greeting guests', [{ wait: 1.6, anim: 'wave', face: g }]);
    }
    return false;
  },

  // ---------- snapshot ----------
  helperSnapshot() {
    return Object.values(this.helpers).map(h => {
      const o = { i: h.id, k: h.k, x: r2(h.x), z: r2(h.z), r: r2(h.ry), a: h.anim };
      if (h.y) o.y = r2(h.y);
      if (h.hidden) o.h = 1;
      if (h.sayT > 0 && h.say) o.s = h.say;
      if (h.fl) o.f = 1;
      if (h.dishes) o.d = 1;
      if (h.label) o.j = h.label;
      return o;
    });
  },
};
