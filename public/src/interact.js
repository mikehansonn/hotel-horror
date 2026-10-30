// Looking at things and doing things: targeting, prompts, press/hold actions, drop and throw.
import * as THREE from 'three';
import * as L from './layout.js';
import { ITEMS, MESSES, DISHES } from './content.js';
import { axisDiff } from './util.js';

const REACH = 2.7;
const origin = new THREE.Vector3();
const dir = new THREE.Vector3();
const STATION_LIST = Object.values(L.STATIONS);
const ITEM_HIT = { mop: [0.1, 0.45], net: [0.1, 0.5], plunger: [0.1, 0.35], luggage: [0.4, 0.42], body: [0.25, 0.7], towels: [0.12, 0.3], tray: [0.05, 0.3], extinguisher: [0.3, 0.32], dishes: [0.12, 0.32], medkit: [0.14, 0.3], keycard: [0.02, 0.2] };
// Tools that wait on the floor at home instead of hanging on a rack.
const FLOOR_TOOLS = new Set(['extinguisher', 'medkit']);
const MESS_HIT = { circle: 0.95, bed: 0.95, table: 0.6, clog: 0.38, debris: 0.55 };
const RAW_TO_COOKED = { egg_raw: 'eggs', batter: 'pancakes', bacon_raw: 'bacon', bread: 'toast' };
// What a stove slot makes, from the snapshot entry [raw, state, progress, bot, cheese].
const cookedName = (st, s) => (st.waffle ? 'waffles' : s[4] ? 'cheese omelette' : ITEMS[RAW_TO_COOKED[s[0]]]?.name.toLowerCase());
const TOOL_NAME = { mop: 'a mop', net: 'the pool net', plunger: 'a plunger' };
const DESK_TIERS = { Digit1: 'basic', Numpad1: 'basic', Digit2: 'suite', Numpad2: 'suite', Digit3: 'pres', Numpad3: 'pres' };
const dishName = pc => (String(pc).startsWith('burnt:') ? 'burnt food' : (DISHES[pc]?.name || ITEMS[pc]?.name || pc).toLowerCase());

export class Interact {
  constructor({ camera, player, hud, act, sfx, view }) {
    Object.assign(this, { camera, player, hud, act, sfx, view });
    this.action = null;
    this.holdT = 0;
    this.holding = false;
    this.holdKey = '';
    this.scrubT = 0;
    this.mouseLeft = false;
    this.snap = null;
    this.wallsNear = [];
    document.addEventListener('mousedown', e => {
      if (!this.player.locked) return;
      if (e.button === 0) { this.mouseLeft = true; this.press(); }
      if (e.button === 2) this.throwItem();
    });
    document.addEventListener('mouseup', e => { if (e.button === 0) this.mouseLeft = false; });
    document.addEventListener('contextmenu', e => e.preventDefault());
  }

  get using() { return this.holding; }

  // Called by main's key handler for gameplay keys.
  key(code) {
    const snap = this.snap;
    if (this.hud.elevOpen) {
      const f = { Digit1: 0, Numpad1: 0, Digit2: 1, Numpad2: 1, Digit3: 2, Numpad3: 2 }[code];
      if (f !== undefined) {
        const built = f === 0 || !!snap?.ht?.f?.[L.FLOORS[f].flag];
        if (!built) { this.sfx.play('bad'); this.hud.toast(`The ${L.FLOORS[f].name.toLowerCase()} hasn't been built yet.`, 'bad'); return true; }
        this.hud.closeElevator();
        if (L.FLAGS.elev_out) { this.sfx.play('bad'); this.hud.toast('The elevator is stuck. Take the stairs at either end of the hall.', 'bad'); return true; }
        if (f !== this.player.floor) { this.hud.fade(); this.sfx.play('elevator'); setTimeout(() => this.player.rideTo(f), 180); }
      } else if (code === 'Escape' || code === 'KeyE') this.hud.closeElevator();
      return true;
    }
    if (this.hud.deskOpen) {
      const dk = snap?.dk;
      const tier = DESK_TIERS[code];
      if (dk && dk.m === 'out' && tier === 'basic') {
        this.act({ a: 'desk', g: dk.g, ch: 'checkout' });
        this.hud.closeDesk();
      } else if (dk && dk.m === 'in' && tier) {
        if (!dk.tiers?.[tier]) { this.sfx.play('bad'); this.hud.toast(`No ${tier === 'basic' ? 'standard room' : tier === 'suite' ? 'suite' : 'presidential suite'} is ready.`, 'bad'); return true; }
        this.act({ a: 'desk', g: dk.g, ch: 'admit', tier });
        this.hud.closeDesk();
      } else if (code === 'KeyX' && dk?.m === 'in') {
        this.act({ a: 'desk', g: dk.g, ch: 'deny' });
        this.hud.closeDesk();
      } else if (code === 'Escape' || code === 'KeyE') this.hud.closeDesk();
      return true;
    }
    switch (code) {
      case 'KeyE':
        if (this.player.car) { const ex = this.player.exitCar(); if (ex) this.act({ a: 'car-exit', ...ex }); this.sfx.play('doorslam'); }
        else this.press();
        return true;
      case 'KeyQ': this.dropItem(); return true;
      case 'KeyH': if (this.player.car) this.act({ a: 'honk' }); return true;
    }
    return false;
  }

  press() {
    const a = this.action;
    if (!a || this.player.car) return;
    if (a.type === 'press') { this.act(a.act); this.sfx.play(a.sound || 'pickup'); }
    else if (a.type === 'desk') this.hud.openDesk();
    else if (a.type === 'elevator') { this.hud.openElevator(this.player.floor); this.sfx.play('beep'); }
  }

  dropItem() {
    if (this.player.car) return;
    const p = this.player;
    this.act({ a: 'drop', x: p.pos.x - Math.sin(p.yaw) * 0.9, z: p.pos.z - Math.cos(p.yaw) * 0.9 });
    this.sfx.play('thud');
  }

  throwItem() {
    if (this.player.car) return;
    this.camera.getWorldDirection(dir);
    this.act({ a: 'throw', dx: +dir.x.toFixed(3), dy: +dir.y.toFixed(3), dz: +dir.z.toFixed(3) });
  }

  update(dt, snap, ctx) {
    this.snap = snap;
    if (!snap || ctx.down) { this.clear(); return; }
    if (this.player.car) { this.clear(); this.hud.setPrompt(this.carPrompt(snap)); return; }
    if (this.hud.deskOpen && (!snap.dk || (this.player.pos.x - 6) ** 2 + (this.player.pos.z + 7.6) ** 2 > 9)) this.hud.closeDesk();
    if (this.hud.elevOpen && Math.abs(this.player.pos.z + 26) > 3.5) this.hud.closeElevator();
    if (this.hud.elevOpen && L.FLAGS.elev_out) { this.hud.closeElevator(); this.hud.toast('The elevator just jammed. Take the stairs at either end of the hall.', 'bad'); }
    const me = snap.pl.find(p => p.i === ctx.me);
    const held = me?.h || null;
    this.tray = held === 'tray' ? me.hc || [] : null;
    const target = this.findTarget(snap, ctx);
    this.action = target ? this.resolve(target, held, snap, ctx) : null;

    const down = this.player.keys.KeyE || this.mouseLeft;
    const a = this.action;
    if (a?.type === 'hold' && down && this.player.locked && !this.hud.deskOpen) {
      if (!this.holding || this.holdKey !== a.key) { this.holding = true; this.holdKey = a.key; this.holdT = 0; }
      this.holdT += dt;
      this.scrubT -= dt;
      if (this.scrubT <= 0) { this.scrubT = 0.2; this.sfx.play(a.sfx || 'scrub'); }
      if (this.holdT >= a.dur) { this.act(a.act); this.sfx.play(a.done || 'clean'); this.holding = false; this.holdT = 0; }
    } else { this.holding = false; this.holdT = 0; }
    this.hud.setHold(this.holding ? this.holdT / a.dur : 0);
    this.hud.setPrompt(a ? a.label : '', a?.type);
  }

  clear() { this.action = null; this.holding = false; this.holdT = 0; this.hud.setHold(0); this.hud.setPrompt(''); }

  findTarget(snap, ctx) {
    this.camera.getWorldPosition(origin);
    this.camera.getWorldDirection(dir);
    // Aim in layout space: upper floors sit FLOOR_DX along x there instead of FLOOR_H up.
    const f = this.player.floor;
    origin.x += f * L.FLOOR_DX;
    origin.y -= f * L.FLOOR_H;
    const px = this.player.pos.x, pz = this.player.pos.z;
    this.wallsNear = L.WALLS.filter(w => w.x2 > px - 5 && w.x1 < px + 5 && w.z2 > pz - 5 && w.z1 < pz + 5);
    let best = null, bestT = Infinity;
    const test = (cx, cy, cz, r, reach, obj) => {
      const ox = cx - origin.x, oy = cy - origin.y, oz = cz - origin.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0) return;
      const d2 = ox * ox + oy * oy + oz * oz - t * t;
      if (d2 > r * r) return;
      const hit = t - Math.sqrt(r * r - d2);
      if (hit > reach || hit >= bestT || this.blocked(cx, cz)) return;
      best = obj;
      bestT = hit;
    };
    const near = (x, z, r = 4.5) => (x - px) ** 2 + (z - pz) ** 2 < r * r;
    for (const st of STATION_LIST) if (near(st.x, st.z) && L.isActive(st)) test(st.x, st.y, st.z, st.r, REACH, { kind: 'station', st });
    for (const it of snap.it) {
      if (it.h || !near(it.x, it.z)) continue;
      const [h, r] = ITEM_HIT[it.t] || [0.1, 0.28];
      const tool = ITEMS[it.t]?.tool;
      test(it.x, it.y + (tool && it.hm && !FLOOR_TOOLS.has(it.t) ? 0.9 : h), it.z, r, REACH, { kind: 'item', it });
    }
    for (const m of snap.m) if (near(m.x, m.z)) test(m.x, m.y + 0.05, m.z, MESS_HIT[m.t] || 0.55, REACH + 0.4, { kind: 'mess', m });
    const byId = new Map(snap.g.map(g => [g.i, g]));
    for (const [id, o] of ctx.view.guests) {
      const p = o.sim;
      if (!near(p.x, p.z)) continue;
      const g = byId.get(id);
      if (!g) continue;
      const lying = g.p === 'lie';
      test(p.x, p.y + (lying ? 0.1 : g.p === 'sit' ? 0.75 : 1.0) * o.mesh.scale.y, p.z, lying ? 0.8 : 0.5, REACH, { kind: 'guest', g });
    }
    for (const c of snap.c) if (near(c.x, c.z, 6)) test(c.x, 0.9, c.z, 1.7, 4.4, { kind: 'car', c });
    for (const m of snap.mn) if (m.k === 'raccoon' && near(m.x, m.z)) test(m.x, (m.y || 0) + 0.3, m.z, 0.45, REACH + 0.5, { kind: 'critter', m });
    return best;
  }

  blocked(tx, tz) {
    const ox = origin.x, oz = origin.z;
    const dx = tx - ox, dz = tz - oz;
    const n = Math.ceil(Math.hypot(dx, dz) / 0.2);
    for (let i = 1; i < n; i++) {
      const x = ox + (dx * i) / n, z = oz + (dz * i) / n;
      for (const w of this.wallsNear) if (x > w.x1 && x < w.x2 && z > w.z1 && z < w.z2) return true;
    }
    return false;
  }

  resolve(t, held, snap, ctx) {
    const tray = this.tray;
    const trayRoom = !!tray && tray.length < 3;
    const heldName = held ? (held === 'burnt' ? 'burnt food' : held === 'tray' ? 'the tray' : ITEMS[held].name.toLowerCase()) : '';
    const holdsFood = !!held && (!!ITEMS[held]?.food || (held === 'tray' && tray.length > 0));
    const info = label => ({ type: 'info', label });
    const press = (label, act, sound) => ({ type: 'press', label, act, sound });
    const hold = (label, dur, act, key, extra = {}) => ({ type: 'hold', label, dur, act, key, ...extra });
    const up = snap.up || {};

    if (t.kind === 'item') {
      const it = t.it;
      let name = ITEMS[it.t].name;
      if (it.t === 'luggage') name = `suitcase for ${L.roomName(it.rm)}`;
      if (it.t === 'burnt') name = 'burnt food';
      if (it.t === 'tray') name = it.c?.length ? `tray (${it.c.map(dishName).join(', ')})` : 'serving tray';
      if (held) return info(`Hands full (Q drop · Right-click throw)`);
      return press(`Pick up ${name}`, { a: 'pickup', id: it.i });
    }
    if (t.kind === 'mess') {
      const m = t.m;
      const def = MESSES[m.t];
      const verb = { trash: 'Pick up', bed: 'Make the bed', table: 'Clear the dishes', clog: 'Plunge the toilet', debris: 'Skim the', circle: 'Scrub away the' }[m.t] || 'Mop up the';
      let label = m.t === 'bed' || m.t === 'table' || m.t === 'clog' ? verb : `${verb} ${def.name.toLowerCase()}`;
      if (m.t === 'circle') label += ` (${Math.round((m.ch || 0) * 100)}% charged!)`;
      if (def.tool) {
        if (held !== def.tool) return info(`${def.name}: needs ${TOOL_NAME[def.tool]}`);
        const dur = def.time * (up.mop && def.tool === 'mop' ? 0.5 : 1);
        return hold(label, dur, { a: 'clean', id: m.i }, `m${m.i}`, { sfx: def.tool === 'net' ? 'splash' : 'scrub' });
      }
      if (held) return info(`${def.name}: hands must be empty`);
      return hold(label, def.time, { a: 'clean', id: m.i }, `m${m.i}`, { sfx: m.t === 'bed' ? 'curtain' : 'scrub' });
    }
    if (t.kind === 'critter') {
      if (held !== 'mop') return info('A raccoon! Grab a mop to shoo it out');
      return hold('Shoo the raccoon out', 0.8, { a: 'shoo', m: t.m.i }, `rac${t.m.i}`, { sfx: 'whoosh', done: 'whoosh' });
    }
    if (t.kind === 'guest') {
      const g = t.g;
      const help = { a: 'help', g: g.i };
      switch (g.ic) {
        case '🤕': return held === 'medkit' ? hold('Patch them up', 2.0, help, `help${g.i}`, { sfx: 'scrub', done: 'chime' }) : info('Hurt! Bring a first aid kit (lobby supplies, or by the pool door)');
        case '😢': return press('Take them back to their family', help, 'chime');
        case '🚪': return held === 'keycard' ? press('Hand over the spare key card', help, 'chime') : info('Locked out. Spare key cards hang behind the front desk');
        case '🥴': return held ? info('Passed out. Free your hands to help them up') : hold('Help them up and send them to bed', 1.5, help, `help${g.i}`, { sfx: 'scrub', done: 'chime' });
        case '😤': return info('The vending machine ate their money. Give the machine a whack');
      }
      if (g.ic === '👀' || L.isStaffArea(g.x, g.z)) return press('Escort them out of the staff area', { a: 'escort', g: g.i }, 'knock');
      const wants = g.ic ? Object.keys(DISHES).filter(k => g.ic.includes(DISHES[k].icon)) : [];
      if (holdsFood && (wants.length || this.roomServiceFor(g, snap))) return press(held === 'tray' ? 'Serve from the tray' : `Serve ${heldName}`, { a: 'serve', g: g.i }, 'chime');
      if (wants.length) return info(`Wants ${wants.map(k => DISHES[k].name).join(' + ')} ${g.ic}`);
      if (g.ic === '🛎️' || g.ic === '🔑') return info('Waiting at the front desk');
      if (g.ic === '🚗') return info('Waiting for their car');
      return info(g.k === 'ghost' ? 'A guest... from 1926' : 'Guest');
    }
    if (t.kind === 'car') {
      const c = t.c;
      if (c.d) return info(c.d < 0 ? `The valet intern is driving the ${c.n}` : `The ${c.n} (someone is driving)`);
      if (['arriving', 'departing', 'pickup'].includes(c.st)) return info(`The ${c.n}`);
      const why = c.st === 'valet' ? ' → park it in the lot' : c.st === 'retrieve' ? ' → bring it to the front' : '';
      return press(`Drive the ${c.n}${why}`, { a: 'car-enter', c: c.i }, 'doorslam');
    }
    const st = t.st;
    switch (st.kind) {
      case 'elevator':
        if (L.FLAGS.elev_out) return st.floor === 0 ? hold('Reset the stuck elevator', 3, { a: 'station', s: st.id }, 'elev_fix', { sfx: 'beep', done: 'elevator' }) : info('Out of order. Take the stairs at either end of the hall (the reset panel is downstairs)');
        return { type: 'elevator', label: 'Call the elevator' };
      case 'vending':
        if (snap.g.some(g => g.ic === '😤')) return hold('Give the vending machine a good whack', 1.2, { a: 'station', s: st.id }, 'vend', { sfx: 'thud', done: 'thud' });
        return info('Vending machine');
      case 'desk':
        if (this.player.pos.z > -7.45) return info('Front desk — go around to the staff side');
        if (!snap.dk) return info(snap.q ? 'Next guest is walking up...' : 'Front desk — nobody waiting');
        return { type: 'desk', label: snap.dk.m === 'in' ? `Check in ${snap.dk.n}` : `Check out ${snap.dk.n}` };
      case 'fridge': case 'shelf':
        if (!held) return press(`Take ${st.label.toLowerCase()}`, { a: 'station', s: st.id });
        if (trayRoom && DISHES[st.item]) return press(`Add ${st.label.toLowerCase()} to the tray (${tray.length}/3)`, { a: 'station', s: st.id });
        return info(`${st.label} (hands full)`);
      case 'coffee': case 'juice': case 'cocoa': {
        const dur = st.kind === 'coffee' ? (up.espresso ? 0.4 : 2.0) : st.kind === 'cocoa' ? 1.8 : 1.6;
        const what = { coffee: 'Brew coffee', juice: 'Squeeze orange juice', cocoa: 'Ladle out a hot cocoa' }[st.kind];
        if (!held) return hold(what, dur, { a: 'station', s: st.id }, st.id, { sfx: 'sizzle', done: 'ding' });
        if (trayRoom) return hold(`${what} onto the tray (${tray.length}/3)`, dur, { a: 'station', s: st.id }, st.id, { sfx: 'sizzle', done: 'ding' });
        return info(`${{ coffee: 'Coffee machine', juice: 'Juicer', cocoa: 'Hot cocoa' }[st.kind]} (hands full)`);
      }
      case 'trays':
        return held ? info('Serving trays (hands full)') : press('Take a serving tray (carries 3 dishes)', { a: 'station', s: st.id });
      case 'stove': return this.stovePrompt(st, snap, held, heldName, tray, trayRoom, { info, press, hold });
      case 'sink': {
        const kt = snap.kt || {};
        const plates = kt.pt >= 0 ? ` · ${kt.pt} clean plate${kt.pt === 1 ? '' : 's'}` : '';
        if (held === 'dishes') return press('Drop the dirty dishes in the sink', { a: 'station', s: st.id }, 'thud');
        if (!kt.sk) return info(`Sink (nothing to wash${plates})`);
        if (held) return info(`Sink: ${kt.sk} tub${kt.sk > 1 ? 's' : ''} to wash (hands full)`);
        return hold(`Wash the dishes (${kt.sk} tub${kt.sk > 1 ? 's' : ''}${plates})`, 2.5, { a: 'station', s: st.id }, `sink${kt.sk}`, { sfx: 'scrub', done: 'splash' });
      }
      case 'pass': {
        const ps = snap.kt?.ps || [];
        const on = ps.filter(Boolean);
        const free = ps.length - on.length;
        if (held === 'tray') {
          if (on.length && trayRoom) return press(`Load the tray from the pass (${on.map(dishName).join(', ')})`, { a: 'station', s: st.id }, 'pickup');
          if (tray.length && free) return press('Set the tray\'s dishes on the pass', { a: 'station', s: st.id });
          return info(on.length ? 'The tray is full' : 'The pass is empty');
        }
        if (held && ITEMS[held]?.food) return free ? press(`Put ${heldName} on the pass — order up!`, { a: 'station', s: st.id }) : info('The pass is full');
        if (held) return info('The pass (hands full)');
        if (on.length) return press(`Take ${dishName(on[0])} from the pass${on.length > 1 ? ` (+${on.length - 1} more)` : ''}`, { a: 'station', s: st.id });
        return info('The pass: cooks set plates here, servers grab them from the dining room');
      }
      case 'trash':
        if (held === 'tray') return tray.length ? press('Empty the tray', { a: 'station', s: st.id }, 'thud') : info('Trash can');
        if (held === 'dishes') return info('Those plates go in the sink, not the trash');
        if (held && !ITEMS[held].tool && held !== 'luggage' && held !== 'body') return press(`Throw away ${heldName}`, { a: 'station', s: st.id }, 'thud');
        return info(held === 'body' ? 'Too big. Use the dumpster outside.' : 'Trash can');
      case 'dumpster':
        if (held === 'body') return press('Dump the body bag', { a: 'station', s: st.id }, 'thud');
        if (held && !ITEMS[held].tool && held !== 'luggage' && held !== 'dishes') return press(`Dump ${heldName}`, { a: 'station', s: st.id }, 'thud');
        return info('Dumpster');
      case 'breaker':
        return snap.pw ? info('Breaker panel (power is on)') : hold('Reset the breaker', 2.5, { a: 'station', s: st.id }, 'breaker', { sfx: 'beep', done: 'powerup' });
      case 'door': {
        const idx = L.ROOMS.findIndex(r => r.id === st.room);
        const rm = snap.rm[idx] || [];
        const req = rm[5];
        const name = L.roomName(st.room);
        if (held === 'towels' && req === 'towels') return press(`Deliver towels to ${name}`, { a: 'door', room: st.room, verb: 'deliver' }, 'chime');
        if (holdsFood && req === 'food') return press(`Deliver room service to ${name}`, { a: 'door', room: st.room, verb: 'deliver' }, 'chime');
        if (rm[6]) return press(`Knock — tell ${name} to keep it down`, { a: 'door', room: st.room, verb: 'knock' }, 'knock');
        const state = { vacant: 'ready', occupied: 'occupied', dirty: 'needs cleaning' }[rm[0]] || '';
        if (rm[1]) return press(`Knock on ${name} — DO NOT DISTURB (guests inside)`, { a: 'door', room: st.room, verb: 'knock' }, 'knock');
        return press(`Knock on ${name} (${state})`, { a: 'door', room: st.room, verb: 'knock' }, 'knock');
      }
      case 'curtain': {
        const idx = L.ROOMS.findIndex(r => r.id === st.room);
        return press(snap.rm[idx]?.[2] ? 'Close the curtains' : 'Open the curtains', { a: 'curtain', room: st.room }, 'curtain');
      }
      case 'thermo': {
        const idx = L.ROOMS.findIndex(r => r.id === st.room);
        return press(snap.rm[idx]?.[3] ? 'Thermostat: set back to normal' : 'Thermostat: set to ❄️ FREEZING', { a: 'thermo', room: st.room }, 'beep');
      }
    }
    return null;
  }

  // Prompts for a burner, the toaster or the waffle iron.
  stovePrompt(st, snap, held, heldName, tray, trayRoom, { info, press, hold }) {
    const s = snap.sv[st.idx];
    const kt = snap.kt || {};
    const act = { a: 'station', s: st.id };
    if (kt.fi?.[st.idx]) {
      if (held === 'extinguisher') return hold('Put out the fire!', 1.2, act, `fire${st.idx}`, { sfx: 'spray', done: 'spray' });
      return info('🔥 ON FIRE! Grab the fire extinguisher by the island');
    }
    if (!s) {
      const fits = held && (st.toaster ? held === 'bread' : st.waffle ? held === 'batter' : RAW_TO_COOKED[held] && held !== 'bread');
      if (fits) return press(st.toaster ? 'Toast the bread' : st.waffle ? 'Pour the batter into the waffle iron' : `Cook ${heldName}`, act, 'sizzle');
      const what = st.toaster ? 'toaster' : st.waffle ? 'waffle iron' : 'burner';
      if (held) return info(`Can't put ${heldName} in the ${what}`);
      return info(st.toaster ? 'Toaster (put bread in it)' : st.waffle ? 'Waffle iron (pour batter in it)' : 'Burner (raw eggs, batter or bacon)');
    }
    if (s[3]) return info(`The Chef Bot is using this${s[1] === 'c' ? ` (${Math.round(s[2] * 100)}%)` : ''}`);
    const cooked = cookedName(st, s);
    const pct = `${Math.round(s[2] * 100)}%`;
    if (held === 'cheese' && s[0] === 'egg_raw' && !s[4] && s[1] !== 'b' && snap.km !== 'simple') return press('Stir in the cheese to make an omelette', act, 'sizzle');
    const noPlates = kt.pt === 0 && s[1] === 'd';
    if (tray) {
      if (s[1] === 'c') return info(`Cooking ${cooked}... ${pct}`);
      if (!trayRoom) return info('The tray is full');
      if (noPlates) return info('No clean plates! Wash some dishes at the sink');
      return press(s[1] === 'd' ? `Put the ${cooked} on the tray${s[2] > 0.6 ? ' — about to burn!' : ''}` : 'Scrape the burnt mess onto the tray', act);
    }
    if (held) return info(s[1] === 'c' ? `Cooking ${cooked}... ${pct}` : s[1] === 'd' ? `The ${cooked} is done! (hands full)` : 'BURNT (hands full) — it could catch fire!');
    if (s[1] === 'c') return press(`Take the ${ITEMS[s[0]].name.toLowerCase()} back (${pct} cooked)`, act);
    if (noPlates) return info(`The ${cooked} is done, but there are no clean plates! Wash dishes at the sink`);
    if (s[1] === 'd') return press(`Take the ${cooked}${s[2] > 0.6 ? ' — about to burn!' : ''}`, act);
    return press('Take the burnt mess before it catches fire', act);
  }

  roomServiceFor(g, snap) {
    // a guest standing in a room whose party ordered room service
    const r = L.roomAt(g.x, g.z);
    if (!r) return false;
    const idx = L.ROOMS.indexOf(r);
    return snap.rm[idx]?.[5] === 'food';
  }

  carPrompt(snap) {
    const c = this.player.car;
    const car = snap.c.find(x => x.i === c.id);
    let where = '';
    const spot = L.PARKING.find(s => (c.x - s.x) ** 2 + (c.z - s.z) ** 2 < 2.4 && axisDiff(c.ry, s.ry) < 0.6);
    if (spot) where = `✅ Lined up in spot ${spot.id} — `;
    else if (car?.st === 'retrieve' && L.inRect(c.x, c.z, L.PICKUP)) where = '✅ At the curb — ';
    return `${where}[E] get out · [H] honk · [Space] brake`;
  }
}
