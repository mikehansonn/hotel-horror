// Test bot: a staff member that knows every job, teleports to it and performs real actions.
// realistic = true charges walking time for every trip (distance x 1.35 detour / 4.5 m/s) plus
// action time, which approximates how much one human player can get done in a shift.
// The bot leaves jobs alone once a helper has claimed them, like a player reading the task list.
import * as L from '../public/src/layout.js';
import { ITEMS, MESSES, cleanTime } from '../public/src/content.js';

const STOVE_IDS = ['stove0', 'stove1', 'stove2', 'stove3', 'stove4', 'stove5', 'stove6', 'stove7', 'toaster', 'waffle'];
const DIRECT = { coffee: 'coffee', juice: 'juicer', cocoa: 'cocoa', blood: 'fridge_blood', battery: 'batteries', egg_raw: 'fridge_egg' };
const RAW = { eggs: 'fridge_egg', omelette: 'fridge_egg', pancakes: 'fridge_batter', waffles: 'fridge_batter', bacon: 'fridge_bacon', toast: 'bread' };
const SLOT = { toast: 'toaster', waffles: 'waffle' }; // dishes that need a particular appliance

export function makeBot(sim, pid, lazy, realistic = false, slow = 1) {
  const pl = () => sim.players[pid];
  let travel = 0, extra = 0;
  let cd = 0;

  const act = a => {
    if (a.a === 'clean') {
      const m = sim.messes[a.id];
      if (m) extra += cleanTime(m.t, sim.upgrades);
    }
    sim.handleAction(pid, a);
  };
  const go = (x, z, mul = 1) => {
    const p = pl();
    travel += Math.hypot(x - p.x, z - p.z) * 1.35 * mul;
    sim.setPose(pid, { x, y: 0, z, yaw: 0, pitch: 0, fl: true });
  };
  const held = () => { const p = pl(); return p.held ? sim.items[p.held] : null; };
  const drop = () => { if (held()) act({ a: 'drop', x: pl().x, z: pl().z }); };
  const dist = (o) => Math.hypot(o.x - pl().x, o.z - pl().z);
  const mine = key => !sim.claimedBy(key);
  const stoves = () => STOVE_IDS.filter(id => L.isActive(L.STATIONS[id]));

  function grabTool(t) {
    if (held()?.t === t) return true;
    drop();
    const tools = Object.values(sim.items).filter(it => it.t === t && !it.holder).sort((a, b) => dist(a) - dist(b));
    if (!tools.length) return false;
    go(tools[0].x, tools[0].z);
    act({ a: 'pickup', id: tools[0].id });
    return held()?.t === t;
  }

  function neededDishes() {
    const want = [];
    for (const [gid, o] of Object.entries(sim.orders)) {
      if (!mine(`o${gid}`)) continue;
      o.dishes.forEach((d, k) => { if (!o.got[k]) want.push({ dish: d, gid: Number(gid) }); });
    }
    for (const p of Object.values(sim.parties)) if (p.request?.type === 'food' && p.room && mine(`q${p.id}`)) want.push({ dish: p.request.dish, room: p.room });
    return want;
  }

  function serveHeld() {
    const h = held();
    const dish = h.t === 'burnt' ? h.of : h.t;
    for (const [gid, o] of Object.entries(sim.orders)) {
      const g = sim.guests[gid];
      if (g && o.dishes.some((d, k) => !o.got[k] && d === dish)) { go(g.x, g.z); act({ a: 'serve', g: g.id }); return; }
    }
    for (const p of Object.values(sim.parties)) {
      if (p.request?.type === 'food' && p.request.dish === dish && p.room) {
        const st = L.STATIONS[`door_${p.room}`];
        go(st.x, st.z);
        act({ a: 'door', room: p.room, verb: 'deliver' });
        return;
      }
    }
    go(L.STATIONS.ktrash.x, L.STATIONS.ktrash.z);
    act({ a: 'station', s: 'ktrash' });
  }

  // Whatever went wrong: first aid, a lost kid, a spare key, a passed-out guest, the elevator, the
  // vending machine or the raccoon. True if the bot spent its turn on one.
  function incident() {
    const list = Object.values(sim.incidents).sort((a, b) => a.t - b.t);
    for (const inc of list) {
      const g = sim.guests[inc.g];
      switch (inc.type) {
        case 'slip':
          if (!grabTool('medkit')) continue;
          go(g.x, g.z); extra += 2; act({ a: 'help', g: g.id });
          return true;
        case 'lostkid': case 'drunk':
          if (inc.type === 'drunk') drop();
          go(g.x, g.z); extra += 1.5; act({ a: 'help', g: g.id });
          return true;
        case 'lockout':
          if (held()?.t !== 'keycard') { drop(); const st = L.STATIONS.spare_keys; go(st.x, st.z + 0.8); act({ a: 'station', s: 'spare_keys' }); return true; }
          go(g.x, g.z); act({ a: 'help', g: g.id });
          return true;
        case 'elevator': { const st = L.STATIONS.elev_0; go(st.x, st.z + 1.5); extra += 3; act({ a: 'station', s: 'elev_0' }); return true; }
        case 'vending':
          if (inc.walking) continue;
          go(L.STATIONS.vending.x + 0.7, L.STATIONS.vending.z); extra += 1.2; act({ a: 'station', s: 'vending' });
          return true;
        case 'raccoon': {
          const m = sim.monsters[inc.m];
          if (!m || !grabTool('mop')) continue;
          go(m.x, m.z); extra += 0.8; act({ a: 'shoo', m: m.id });
          return true;
        }
      }
    }
    return false;
  }

  function job() {
    const p0 = pl();
    if (p0.car) { // finish the drive
      const c = sim.cars[p0.car];
      if (!c) return;
      let dest;
      if (c.st === 'retrieve') { const i = sim.freeDrop(); dest = L.DROPS[i >= 0 ? i : 1]; }
      else dest = sim.freeSpot() || { x: c.x, z: c.z, ry: c.ry };
      go(dest.x - 1.5, dest.z, 0.5);
      extra += 2.5;
      act({ a: 'car-exit', c: c.id, x: dest.x, z: dest.z, r: dest.ry });
      return;
    }
    const g = sim.deskGuest();
    if (g) {
      const p = sim.parties[g.party];
      const tier = sim.bestTier(p);
      const can = g.qmode === 'out' || tier || p.threat;
      if (can) {
        go(6, -8.2);
        extra += 1.5;
        if (g.qmode === 'out') act({ a: 'desk', g: g.id, ch: 'checkout' });
        else if (p.threat && !lazy) act({ a: 'desk', g: g.id, ch: 'deny' });
        else act({ a: 'desk', g: g.id, ch: 'admit', tier: tier || 'basic' });
        return;
      }
    }
    if (lazy) return;
    if (!sim.power && mine('power')) { drop(); go(L.STATIONS.breaker.x, L.STATIONS.breaker.z); extra += 2.5; act({ a: 'station', s: 'breaker' }); return; }
    const snoop = sim.trespassers().filter(t => mine(`e${t.id}`)).sort((a, b) => dist(a) - dist(b))[0];
    if (snoop) { go(snoop.x, snoop.z); extra += 1; act({ a: 'escort', g: snoop.id }); return; }
    const fire = sim.fires.findIndex(Boolean);
    if (fire >= 0) {
      if (!grabTool('extinguisher')) return;
      const st = L.STATIONS[`stove${fire}`];
      go(st.x, st.z + 1);
      extra += 1.2;
      act({ a: 'station', s: st.id });
      return;
    }
    if (incident()) return;
    // Burnt food on a burner is a fire waiting to happen: scrape it off first.
    const burnt = stoves().find(id => { const s = sim.stoves[L.STATIONS[id].idx]; return s && !s.bot && sim.stoveState(s).st === 'b'; });
    if (burnt && !held()) { const st = L.STATIONS[burnt]; go(st.x, st.z + 1); act({ a: 'station', s: burnt }); return; }
    if (held()?.t === 'dishes') { const st = L.STATIONS.sink; go(st.x, st.z + 0.8); act({ a: 'station', s: 'sink' }); return; }
    if (['cheese', 'extinguisher', 'medkit', 'keycard'].includes(held()?.t)) drop();
    // No clean plates means nothing comes off the stove: wash up first.
    if (sim.platesOn() && sim.plates < 2 && sim.sinkPile && mine('sink')) { drop(); const st = L.STATIONS.sink; go(st.x, st.z + 0.8); extra += 2.5; act({ a: 'station', s: 'sink' }); return; }
    const h = held();
    const wanted = h && neededDishes().some(w => w.dish === (h.t === 'burnt' ? h.of : h.t));
    if (h && ITEMS[h.t].food && (wanted || !ITEMS[h.t].cook)) { serveHeld(); return; }
    if (h && h.t === 'body') { go(L.STATIONS.dumpster.x, L.STATIONS.dumpster.z); act({ a: 'station', s: 'dumpster' }); return; }
    if (h && h.t === 'luggage') { const r = L.ROOM_BY_ID[h.room]; const n = L.NODES[`r${h.room}_mid`]; go(n?.x ?? r.cx, n?.z ?? (r.z1 + r.z2) / 2); return; }
    if (h && h.t === 'towels') {
      const p = Object.values(sim.parties).find(p => p.request?.type === 'towels' && p.room);
      if (p) { const st = L.STATIONS[`door_${p.room}`]; go(st.x, st.z); act({ a: 'door', room: p.room, verb: 'deliver' }); }
      else drop();
      return;
    }
    const body = Object.values(sim.items).find(it => it.t === 'body' && !it.holder);
    if (body) { drop(); go(body.x, body.z); act({ a: 'pickup', id: body.id }); return; }
    for (const c of Object.values(sim.cars)) {
      if ((c.st === 'valet' || c.st === 'retrieve') && !c.driver && mine(`c${c.id}`)) { drop(); go(c.x - 1.5, c.z); act({ a: 'car-enter', c: c.id }); return; }
    }
    const noPlates = sim.platesOn() && sim.plates === 0;
    for (const id of stoves()) {
      const st = L.STATIONS[id];
      const s = sim.stoves[st.idx];
      if (!s || s.bot) continue;
      const state = sim.stoveState(s).st;
      if (state === 'b' || (state === 'd' && !noPlates)) { drop(); go(st.x, st.z + 1); act({ a: 'station', s: id }); return; }
    }
    const cooking = sim.stoves.filter(s => s && !s.bot).map(s => sim.cookedOf(s));
    for (const w of neededDishes()) {
      const direct = DIRECT[w.dish];
      if (direct) { drop(); const st = L.STATIONS[direct]; go(st.x, st.z); if (['coffee', 'juicer', 'cocoa'].includes(direct)) extra += 2; act({ a: 'station', s: direct }); return; }
      const ci = cooking.indexOf(w.dish);
      if (ci >= 0) { cooking.splice(ci, 1); continue; }
      const slot = SLOT[w.dish];
      const stove = stoves().find(id => { const i = L.STATIONS[id].idx; return !sim.stoves[i] && !sim.fires[i] && (slot ? id === slot : !['toaster', 'waffle'].includes(id)); });
      if (!stove || !RAW[w.dish]) continue;
      drop();
      go(L.STATIONS[RAW[w.dish]].x, L.STATIONS[RAW[w.dish]].z);
      act({ a: 'station', s: RAW[w.dish] });
      const st = L.STATIONS[stove];
      go(st.x, st.z + 1);
      act({ a: 'station', s: stove });
      if (w.dish === 'omelette') { // fetch cheese and stir it in
        go(L.STATIONS.fridge_cheese.x, L.STATIONS.fridge_cheese.z);
        act({ a: 'station', s: 'fridge_cheese' });
        go(st.x, st.z + 1);
        act({ a: 'station', s: stove });
      }
      return;
    }
    for (const p of Object.values(sim.parties)) {
      if (!p.request || !p.room) continue;
      const rq = p.request;
      if (rq.type === 'towels' && mine(`t${p.id}`)) { drop(); go(L.STATIONS.towels.x, L.STATIONS.towels.z); act({ a: 'station', s: 'towels' }); return; }
      if (rq.type === 'noise') { const st = L.STATIONS[`door_${rq.target}`]; go(st.x, st.z); act({ a: 'door', room: rq.target, verb: 'knock' }); return; }
      if (rq.type === 'cold') { const st = L.STATIONS[`thermo_${p.room}`]; go(st.x, st.z); act({ a: 'thermo', room: p.room }); return; }
    }
    if (sim.hour() > 27.5) for (const p of Object.values(sim.parties)) {
      if (p.kind === 'vampire' && p.st === 'staying' && p.room && sim.rooms[p.room].curtains) {
        const st = L.STATIONS[`curtain_${p.room}`];
        go(st.x, st.z);
        act({ a: 'curtain', room: p.room });
        return;
      }
    }
    const lug = Object.values(sim.items).filter(it => it.t === 'luggage' && !it.holder && mine(`l${it.id}`)).sort((a, b) => dist(a) - dist(b))[0];
    if (lug) { drop(); go(lug.x, lug.z); act({ a: 'pickup', id: lug.id }); return; }
    const urgent = m => (m.t === 'circle' || m.t === 'blood' || m.t === 'clog' ? 1 : 0) + (sim.rooms[m.room]?.st === 'dirty' && sim.queue.length ? 1 : 0);
    const messes = Object.values(sim.messes)
      .filter(m => mine(`m${m.id}`) && !(m.room && sim.claimedBy(`r${m.room}`)) && !(m.room && sim.rooms[m.room]?.dnd) && !(m.t === 'debris' && sim.lvl('skimmer')))
      .sort((a, b) => urgent(b) - urgent(a) || dist(a) - dist(b));
    for (const m of messes) {
      const tool = MESSES[m.t].tool;
      if (tool) { if (!grabTool(tool)) continue; } else drop();
      go(m.x, m.z);
      act({ a: 'clean', id: m.id });
      return;
    }
    const tub = Object.values(sim.items).find(it => it.t === 'dishes' && !it.holder);
    if (tub) { drop(); go(tub.x, tub.z); act({ a: 'pickup', id: tub.id }); return; }
    if (sim.sinkPile && mine('sink') && !sim.lvl('dishwasher')) { drop(); const st = L.STATIONS.sink; go(st.x, st.z + 0.8); extra += 2.5; act({ a: 'station', s: 'sink' }); }
  }

  return function tick(dt) {
    cd -= dt;
    if (cd > 0 || pl().down > 0) return;
    travel = 0;
    extra = 0;
    job();
    cd = lazy ? 1.0 : realistic ? Math.max(0.3, travel / 4.5 + 0.4 + extra) * slow : 0.25;
  };
}
