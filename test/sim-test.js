// Headless checks for The Last Resort: nav-graph sanity + full shifts played by bots.
// Run with: npm test
import * as L from '../public/src/layout.js';
import { Sim } from '../public/src/sim.js';
import { ROUNDS, UPGRADES } from '../public/src/content.js';
import { sanitizeSettings, difficulty, DEFAULT_SETTINGS } from '../public/src/difficulty.js';
import { makeBot } from './bot.js';

let failures = 0;
const fail = msg => { failures++; console.log('  ✗ ' + msg); };
const ok = msg => console.log('  ✓ ' + msg);
const check = (cond, good, bad = good) => (cond ? ok(good) : fail(bad));

// ---------- nav graph ----------
console.log('\nNav graph');
{
  const ids = Object.keys(L.NODES);
  const seen = new Set(['door_in']);
  const stack = ['door_in'];
  while (stack.length) for (const n of L.NODES[stack.pop()].n) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  const orphans = ids.filter(id => !seen.has(id));
  orphans.length ? fail(`unreachable nodes: ${orphans.join(', ')}`) : ok(`${ids.length} nodes, all connected`);

  const blockedByWall = (x, z) => L.WALLS.some(w => x > w.x1 + 0.02 && x < w.x2 - 0.02 && z > w.z1 + 0.02 && z < w.z2 - 0.02);
  const bad = [];
  for (const a of ids) for (const b of L.NODES[a].n) {
    if (a > b || L.floorOf(L.NODES[a].x) !== L.floorOf(L.NODES[b].x)) continue; // elevator links jump floors
    const A = L.NODES[a], B = L.NODES[b];
    const steps = Math.ceil(Math.hypot(A.x - B.x, A.z - B.z) / 0.1);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (blockedByWall(A.x + (B.x - A.x) * t, A.z + (B.z - A.z) * t)) { bad.push(`${a}–${b}`); break; }
    }
  }
  bad.length ? fail(`edges through walls: ${bad.join(', ')}`) : ok('no edge passes through a wall');

  const inWall = ids.filter(id => blockedByWall(L.NODES[id].x, L.NODES[id].z));
  inWall.length ? fail(`nodes inside walls: ${inWall.join(', ')}`) : ok('no node inside a wall');

  // Upper floors and the presidential suite are unreachable until bought.
  L.setFlags({});
  check(!L.findPath('street_e', 'r201_bed') && !L.findPath('street_e', 'r301_bed') && !L.findPath('street_e', 'rPRES_bed'), 'unbuilt floors are unreachable', 'an unbuilt floor is reachable');
  L.setFlags({ floor2: true });
  check(L.pointBlocked(L.FLOOR_DX + 20, -20) && !L.findPath('street_e', 'rPRES_bed'), 'the presidential suite stays sealed until bought', 'presidential barrier missing');
  L.setFlags({ floor2: true, floor3: true, pres: true });
  for (const r of L.ROOMS) if (!L.findPath('street_e', `r${r.id}_bed`)) fail(`no path to room ${r.id}`);
  for (const s of L.SEATS) if (!L.findPath('street_w', s)) fail(`no path to ${s}`);
  ok('paths exist to every room and seat once everything is open');
  check(!L.pointBlocked(L.FLOOR_DX + 20, -20), 'an opened suite has no barrier', 'barrier still blocks the suite');
  check(L.findPath('lob_c', 'r305_bed').some(id => id === 'elev@3'), 'guests reach the third floor by elevator', 'no elevator on the way upstairs');

  // Guests never route through staff-only rooms on their way somewhere public.
  const guestGoals = [...L.ROOMS.map(r => `r${r.id}_bed`), ...L.SEATS, ...L.SOFAS, ...L.LOUNGERS, ...L.SWIMS, 'elev', 'h-27.5', 'h27.5'];
  const leaks = [];
  for (const from of ['street_w', 'street_e', 'door_in', 'lob_c', 'pd_ne', 'h-27.5', 'h27.5']) {
    for (const to of guestGoals) {
      const path = L.findPath(from, to, { guest: true });
      if (!path) { leaks.push(`${from}→${to} (no path)`); continue; }
      const staff = path.find(id => L.NODES[id].staff);
      if (staff) leaks.push(`${from}→${to} via ${staff}`);
    }
  }
  leaks.length ? fail(`guest paths through staff areas: ${leaks.slice(0, 8).join(', ')}`) : ok('guest paths avoid every staff-only area');
  L.setFlags({});

  for (const [x, z] of L.SPAWNS) {
    const p = { x, z };
    L.resolveCircle(p, 0.35, 'player');
    if (Math.hypot(p.x - x, p.z - z) > 0.4) fail(`spawn ${x},${z} pushed far by colliders`);
  }
  ok('spawns are clear');
}

// ---------- difficulty ----------
console.log('\nDifficulty');
{
  const s = sanitizeSettings({ preset: 'hard', guests: 99, kitchen: 'lava', shiftLen: 300 });
  check(s.kitchen === 'advanced' && s.guests === 1.3 && s.shiftLen === 300 && s.preset === 'hard', 'presets apply and junk values are ignored', `bad sanitize: ${JSON.stringify(s)}`);
  const c = sanitizeSettings({ ...s, horror: 0.6 });
  check(c.preset === 'custom', 'changing one option makes the preset "custom"');
  const d = [1, 2, 3, 4, 5, 6].map(np => difficulty(DEFAULT_SETTINGS, np));
  check(d.every((x, i) => !i || (x.count > d[i - 1].count && x.patience <= d[i - 1].patience)), 'more staff means more guests and less patience');
  const off = [1, 6].map(np => difficulty({ ...DEFAULT_SETTINGS, scaling: 'off' }, np));
  check(off[0].count === off[1].count, 'crew scaling can be switched off');
  const sim = new Sim({ hostId: 1 });
  sim.addPlayer(1, 'Host');
  sim.addPlayer(2, 'Guest');
  sim.handleAction(2, { a: 'settings', s: { preset: 'nightmare' } });
  check(sim.settings.preset === 'normal', 'only the host can change difficulty');
  sim.handleAction(1, { a: 'settings', s: { preset: 'nightmare' } });
  check(sim.settings.preset === 'nightmare' && sim.kitchenMode() === 'advanced', 'host can change difficulty in the lobby');
}

// ---------- shifts ----------
function runShift(sim, bots, maxSeconds = 1200) {
  const dt = 1 / 20;
  for (let t = 0; t < maxSeconds && sim.phase === 'shift'; t += dt) {
    for (const b of bots) b(dt);
    sim.update(dt);
    sim.snapshot();
  }
  return sim.results;
}

// The order a sensible group might buy upgrades in.
const SHOPPING = ['muzak', 'lobby', 'mop', 'cart', 'sneakers', 'roomba', 'stove', 'skimmer', 'valet', 'housekeeper', 'generator', 'kiosk', 'bellhop', 'flashlight', 'cameras', 'floor2', 'garlic', 'espresso', 'electrician'];

function playGame({ lazy = false, realistic = false, slow = 1, players = 1, rounds = ROUNDS.length, retries = true, shop = true, settings = null }) {
  const events = [];
  const sim = new Sim({ send: m => events.push(m), sendTo: (_, m) => events.push(m), shiftLen: 480, hostId: 1, settings });
  const bots = [];
  for (let i = 1; i <= players; i++) { sim.addPlayer(i, `Bot${i}`); bots.push(makeBot(sim, i, lazy, realistic, slow)); }
  const out = [];
  sim.handleAction(1, { a: 'cmd', cmd: 'start' });
  for (let r = 1; r <= rounds; r++) {
    const res = runShift(sim, bots);
    if (!res) throw new Error(`round ${r} never ended (phase ${sim.phase}, H ${sim.hour().toFixed(2)})`);
    out.push({ title: res.title, avg: res.avg, th: res.threshold, passed: res.passed, n: res.surveys.length, money: sim.money, close: Math.round(sim.clock - sim.closingAt), ...sim.stats });
    sim.handleAction(1, { a: 'cmd', cmd: 'continue' });
    if (sim.phase === 'gameover') { if (!retries) break; sim.handleAction(1, { a: 'cmd', cmd: 'retry' }); continue; }
    if (sim.phase === 'victory') break;
    if (shop) for (const u of SHOPPING) for (let i = 0; i < 2; i++) sim.handleAction(1, { a: 'buy', u });
    sim.handleAction(1, { a: 'cmd', cmd: 'start' });
  }
  return { out, events, sim };
}

const show = o => `  ${o.title.padEnd(22)} ★${o.avg.toFixed(2)} / ${o.th}  ${o.passed ? 'PASS' : 'FAIL'}  surveys:${String(o.n).padStart(2)}  $${String(o.money).padStart(5)}  deaths:${o.deaths} caught:${o.caught} fled:${o.fled} helper jobs:${o.helperJobs} escorts:${o.escorts} closing:${o.close}s`;

console.log('\nFull game, omniscient bot (solo)');
try {
  const { out, events } = playGame({});
  out.forEach(o => console.log(show(o)));
  for (const s of events.filter(e => e.e === 'survey').slice(0, 5)) console.log(`    "${s.s.text}" — ${s.s.name} (${s.s.stars}★)`);
  out.every(o => o.passed) ? ok('omniscient bot passes every shift') : fail('omniscient bot failed a shift');
} catch (e) { fail('omniscient run crashed: ' + e.stack); }

console.log('\nFull game, omniscient bot (solo, Hard preset)');
try {
  const { out } = playGame({ settings: { preset: 'hard' } });
  out.forEach(o => console.log(show(o)));
  ok('hard preset runs to the end');
} catch (e) { fail('hard run crashed: ' + e.stack); }

// "Human-speed" bots: walking time plus a 1.8x hesitation factor. Used to eyeball balance.
for (const players of [1, 2, 4]) {
  console.log(`\nHuman-speed bots, ${players} player${players > 1 ? 's' : ''}`);
  try {
    const { out } = playGame({ realistic: true, slow: 1.8, players, retries: false });
    out.forEach(o => console.log(show(o)));
  } catch (e) { fail(`human-speed ${players}p run crashed: ` + e.stack); }
}

console.log('\nLazy bot (only works the desk)');
let lazyAvg = 0;
try {
  const { out } = playGame({ lazy: true, rounds: 1, retries: false });
  out.forEach(o => console.log(show(o)));
  lazyAvg = out[0].avg;
  out[0].avg < 4 ? ok('neglect lowers ratings') : fail('lazy bot still got good ratings');
} catch (e) { fail('lazy run crashed: ' + e.stack); }

// ---------- kitchen ----------
console.log('\nKitchen');
try {
  const sim = new Sim({ shiftLen: 480, hostId: 1 });
  sim.addPlayer(1, 'Cook');
  sim.handleAction(1, { a: 'cmd', cmd: 'start' });
  sim.schedule = [];
  const pl = sim.players[1];
  const stand = (x, z) => sim.setPose(1, { x, y: 0, z, yaw: 0, pitch: 0, fl: true });
  const use = id => { const st = L.STATIONS[id]; stand(st.x, st.z + 0.9); sim.handleAction(1, { a: 'station', s: id }); };
  const held = () => sim.items[pl.held]?.t || null;
  const run = secs => { for (let t = 0; t < secs; t += 0.05) sim.update(0.05); };
  const cook = sim.stoveTimes(0).cook;

  use('fridge_egg'); use('stove0'); use('fridge_cheese'); use('stove0');
  run(cook + 0.5);
  use('stove0');
  check(held() === 'omelette' && sim.plates === 11, 'eggs with cheese stirred in come off the stove as an omelette, on a plate', `omelette: held ${held()}, plates ${sim.plates}`);
  use('pass');
  check(!pl.held && sim.pass[0] === 'omelette', 'plates can be set on the pass');
  stand(-19.4, -2.1);
  sim.handleAction(1, { a: 'station', s: 'pass' });
  check(held() === 'omelette', 'and picked up from the dining room side');
  use('ktrash');
  use('cocoa');
  check(held() === 'cocoa', 'the cocoa pot pours hot cocoa');
  use('ktrash');

  use('fridge_bacon'); use('stove1');
  run(sim.stoveTimes(1).burn + 13);
  check(sim.fires[1] > 0, 'burnt food left on a burner catches fire');
  run(22);
  check(sim.fires.filter(Boolean).length >= 2, 'the fire spreads to the next burner');
  check(sim.tasks.some(t => t.ic === '🔥'), 'a fire goes on the task list');
  const ext = Object.values(sim.items).find(it => it.t === 'extinguisher');
  stand(ext.x, ext.z);
  sim.handleAction(1, { a: 'pickup', id: ext.id });
  for (let i = 0; i < 4; i++) if (sim.fires[i]) use(`stove${i}`);
  check(!sim.fires.some(Boolean) && Object.values(sim.messes).some(m => m.t === 'foam'), 'the extinguisher puts fires out and leaves foam to mop up');
  sim.handleAction(1, { a: 'drop' });

  sim.plates = 0;
  use('fridge_egg'); use('stove2');
  run(cook + 0.5);
  use('stove2');
  check(!pl.held && sim.stoves[2], 'with no clean plates, cooked food stays on the stove');
  sim.dirtyTable(0);
  const table = Object.values(sim.messes).find(m => m.t === 'table');
  stand(table.x, table.z + 1);
  sim.handleAction(1, { a: 'clean', id: table.id });
  check(held() === 'dishes', 'clearing a table hands you a tub of dirty dishes');
  use('ktrash');
  check(held() === 'dishes', 'the dishes can\'t go in the trash');
  use('sink');
  check(sim.sinkPile === 1, 'the tub goes in the sink');
  use('sink');
  check(sim.sinkPile === 0 && sim.plates === 4, 'washing a tub puts four plates back on the rack');
  use('stove2');
  check(held() === 'eggs', 'and the eggs can be plated again');
} catch (e) { fail('kitchen checks crashed: ' + e.stack); }

// ---------- expansion, suites and helpers ----------
console.log('\nExpansion, suites and helpers');
try {
  const sim = new Sim({ shiftLen: 480, hostId: 1 });
  sim.addPlayer(1, 'Host');
  sim.money = 50000;
  sim.handleAction(1, { a: 'buy', u: 'floor3' });
  check(!sim.lvl('floor3'), 'the third floor needs the second floor first');
  for (const u of ['floor2', 'floor3', 'pres']) sim.handleAction(1, { a: 'buy', u });
  check(sim.openRooms().length === 37, `${sim.openRooms().length} rooms open after building up`);
  check(!!L.findPath('street_e', 'r310_bed', { guest: true }) && !!L.findPath('street_e', 'rPRES_bed', { guest: true }), 'guests can reach the new floors');
  check(Object.values(sim.items).filter(it => it.floorTool).length === 4, 'each new floor gets a supply closet');
  for (const room of ['101', '102', '203', 'PRES']) sim.handleAction(1, { a: 'buy', u: 'suites', room });
  check(sim.tierOf('101') === 'suite' && sim.tierOf('203') === 'suite' && sim.tierOf('PRES') === 'pres' && sim.tierOf('103') === 'basic', 'suite renovations change only the chosen rooms');

  const helpers = UPGRADES.filter(u => u.helper);
  for (const u of helpers) for (let i = 0; i < 2; i++) sim.handleAction(1, { a: 'buy', u: u.id });
  const roster = {};
  for (const h of Object.values(sim.helpers)) roster[h.k] = (roster[h.k] || 0) + 1;
  check(helpers.every(u => roster[u.id] >= 1) && roster.roomba === 4, `helpers on staff: ${Object.entries(roster).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  check(sim.snapshot().hp.length === Object.keys(sim.helpers).length, 'every helper is in the snapshot');

  // A shift where the only human works the desk: everything else is up to the helpers.
  const done = {};
  const finish = sim.hFinish;
  sim.hFinish = function (h) { done[h.k] = (done[h.k] || 0) + 1; return finish.call(this, h); };
  const pool0 = sim.stats.helperJobs;
  let leftAtEnd = -1, cleaners = false;
  const end = sim.endShift;
  sim.endShift = function () { leftAtEnd = this.openTasks(); cleaners = this.clock - this.closingAt > 480; return end.call(this); };
  sim.handleAction(1, { a: 'cmd', cmd: 'start' });
  const res = runShift(sim, [makeBot(sim, 1, true)]);
  console.log(`  helper jobs: ${Object.entries(done).map(([k, n]) => `${k} ${n}`).join(', ')} (total ${sim.stats.helperJobs - pool0})`);
  console.log(`  desk-only crew with every helper: ★${res.avg.toFixed(2)} / ${res.threshold} (no helpers: ★${lazyAvg.toFixed(2)}), escorts ${sim.stats.escorts}`);
  for (const k of ['roomba', 'housekeeper', 'bellhop', 'doorman']) check(done[k] > 0, `${k} did real work`, `${k} never finished a job`);
  check(res.avg > lazyAvg, 'helpers make a neglected hotel better');
  check(cleaners || leftAtEnd === 0, `the shift ended with ${leftAtEnd} jobs left${cleaners ? ' (cleaners)' : ''}`, `the shift ended early with ${leftAtEnd} jobs left`);
} catch (e) { fail('helper run crashed: ' + e.stack); }

console.log(failures ? `\n${failures} problem(s) found.\n` : '\nAll checks passed.\n');
process.exit(failures ? 1 : 0);
