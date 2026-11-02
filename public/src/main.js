// The Last Resort — bootstrap, menu, game loop and the glue between sim, network and rendering.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as L from './layout.js';
import { Sim } from './sim.js';
import { Net } from './net.js';
import { buildWorld } from './world.js';
import { View } from './view.js';
import { Player } from './player.js';
import { Interact } from './interact.js';
import { Hud, CONTROLS } from './hud.js';
import { Sfx } from './audio.js';
import { PLAYER_COLORS, hasPerk } from './content.js';
import { PRESETS } from './difficulty.js';
import { rand, pick } from './util.js';

const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('tlr.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tlr.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
$('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 600);
scene.add(camera);
// A soft bloom makes lamps, neon and the fire glow (Balanced and Sharp graphics only). The threshold
// sits above what a lit wall reaches, so only things that give off light bloom.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.38, 0.4, 1.05);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let useBloom = true;
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
renderer.info.autoReset = false; // count draw calls for the whole frame, bloom passes included
function draw() { renderer.info.reset(); if (useBloom) composer.render(); else renderer.render(scene, camera); }

const world = buildWorld(scene);
const view = new View(scene, camera);
const player = new Player(camera);
const sfx = new Sfx();
const net = new Net();
const peers = new Map();
const settings = {
  sens: store.get('sens', 1), vol: store.get('vol', 0.7), invert: store.get('invert', false), fov: store.get('fov', 72),
  quality: store.get('quality', 1), grain: store.get('grain', true), calm: store.get('calm', false),
};
function applySettings() {
  player.sens = settings.sens;
  player.invertY = settings.invert;
  sfx.setVolume(settings.vol);
  camera.fov = settings.fov;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(settings.quality >= 1.5 ? Math.min(window.devicePixelRatio, 1.5) : settings.quality);
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);
  useBloom = settings.quality >= 1;
  world.calm = settings.calm;
}
applySettings();

let sim = null;
let snap = null;
let started = false;
let myName = 'Bellhop';
let lastDown = 0;
let poseT = 0, netT = 0, stutterT = 0;
let bgTimer = null;

const hud = new Hud({
  act: a => net.toHost({ k: 'act', ...a }),
  chat: tx => {
    const me = snap?.pl.find(p => p.i === net.id);
    const msg = { k: 'chat', n: myName, c: me ? me.c : 0, tx };
    net.broadcast(msg);
    onChat(msg);
  },
  leave: () => { net.close(); location.reload(); },
  resume: () => lock(),
  settings: () => ({ ...settings, online: net.online }),
  setting: (k, v) => {
    settings[k] = v;
    store.set(k, v);
    applySettings();
  },
  onOverlay: open => { if (open && document.pointerLockElement) document.exitPointerLock(); },
  sound: n => sfx.play(n),
});

const interact = new Interact({
  camera, player, hud, view, sfx, act: a => net.toHost({ k: 'act', ...a }),
  ui: {
    cctv: () => openCCTV(),
    letter: () => hud.showLetter(snap?.brk?.r || (snap?.rd || 0) + 1),
    ledger: () => hud.showLedger(),
    terminal: () => hud.openTerminal(),
    down: () => goDown(),
    up: () => goUp(),
  },
});

// ---------- effects (no lights, so no shader recompiles) ----------
const fxTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const effects = [];
function flash(x, z, color, size = 6) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.position.set(x, 1.4, z);
  s.scale.set(size, size, 1);
  scene.add(s);
  effects.push({ s, t: 0, life: 1.2 });
}

// ---------- events ----------
// What goes through your head the first time you see something.
const SIGHT_LINES = {
  porter: ['What... is that?', 'That is not a guest.', 'Who let THAT in?', 'Why is it looking at me?'],
  mimic: ['That suitcase has TEETH.', 'There is no Room 000. There is no Room 000.', 'Luggage does not do that.'],
  shade: ['What is that shadow doing?', 'That shadow just moved.', 'Something is wrong with that shadow.'],
};
const GLIMPSE_LINES = ['Was somebody standing there?', 'Did you see that?', 'There was someone at the end of the hall...', 'Just the lights playing tricks. Right?'];
function onEvent(ev) {
  switch (ev.e) {
    case 'toast': hud.toast(ev.tx, ev.cl); if (ev.cl === 'horror') sfx.play('sting'); break;
    case 'snd': { const w = L.toWorld(ev.x, ev.z, 1.2); sfx.play(ev.n, w); break; }
    case 'survey': hud.survey(ev.s); sfx.play(ev.s.stars >= 4 ? 'money' : ev.s.stars <= 2 ? 'bad' : 'click'); break;
    case 'money': if (ev.v >= 5) hud.money(ev.v); break;
    case 'shift': hud.titleCard(ev); sfx.play('bell'); closeCCTV(); break;
    case 'break': hud.toast(`☕ Clock out in the break room. Mr. Harrow has left a letter for Shift ${ev.round}.`, 'info'); break;
    case 'call': hud.call(ev.who, ev.tx, ev.by, ev.eerie); sfx.play(ev.eerie ? 'whisper' : 'click'); break;
    case 'taken': if (ev.p === net.id) { hud.taken(ev.why); sfx.play('down'); closeCCTV(); if (player.car) player.car = null; } break;
    case 'flashed': { const i = cctv.list.findIndex(c => c?.id === ev.cam); if (i >= 0 && ev.hit) { hud.cctvFlash(i, true); sfx.play('screech'); } break; }
    case 'quake': world.flicker(2.5); sfx.play('quake'); break;
    case 'sighting': sfx.play('sting'); hud.scare(pick(ev.glimpse ? GLIMPSE_LINES : SIGHT_LINES[ev.kind] || SIGHT_LINES.porter)); break;
    case 'found': sfx.play('creak'); hud.scare(ev.what === 'body' ? 'Is that... somebody?' : 'Is that... blood?'); break;
    case 'flicker': world.flicker(ev.d); sfx.play('powerdown', { x: camera.position.x, y: camera.position.y + 1.4, z: camera.position.z }); break;
    case 'fx': flash(ev.x, ev.z, ev.t === 'beam' ? '#7dffb0' : '#bfe8ff'); sfx.play(ev.t === 'beam' ? 'ufo' : 'vanish', { x: ev.x, z: ev.z }); break;
    case 'twins': view.addTwins(ev.x, ev.z); break;
    case 'down': if (ev.p === net.id) { hud.down(ev.t, ev.why); sfx.play('down'); if (player.car) player.car = null; } break;
    case 'drive': player.enterCar(ev); break;
  }
}

function onChat(d) {
  hud.chatLine(d.n, PLAYER_COLORS[d.c] || '#fff', d.tx);
  sfx.play('click');
}

net.on('msg', (from, d) => {
  if (!d) return;
  switch (d.k) {
    case 'act': if (net.isHost && sim) sim.handleAction(from, d); break;
    case 'p': peers.set(from, d); if (net.isHost && sim) sim.setPose(from, d); break;
    case 'snap': if (!net.isHost) { snap = d; if (d.ht) L.setFlags(d.ht.f); } break;
    case 'ev': onEvent(d); break;
    case 'chat': onChat(d); break;
    case 'ping': hud.addPing(d); sfx.play('ping'); break;
  }
});

// Mark the spot you're looking at for the whole crew.
const pingDir = new THREE.Vector3(), pingFrom = new THREE.Vector3();
function sendPing() {
  camera.getWorldDirection(pingDir);
  camera.getWorldPosition(pingFrom);
  pingFrom.x += player.floor * L.FLOOR_DX; // aim in layout space
  pingFrom.y -= L.levelY(player.floor);
  let reach = 12;
  if (pingDir.y < -0.04) reach = Math.min(30, (pingFrom.y - 0.05) / -pingDir.y);
  const flat = Math.hypot(pingDir.x, pingDir.z) || 1;
  for (let s = 0.4; s < reach * flat; s += 0.25) {
    if (L.pointBlocked(pingFrom.x + (pingDir.x / flat) * s, pingFrom.z + (pingDir.z / flat) * s)) { reach = Math.max(0.5, s - 0.3) / flat; break; }
  }
  const me = snap?.pl.find(p => p.i === net.id);
  const msg = { k: 'ping', x: +(pingFrom.x + pingDir.x * reach).toFixed(2), z: +(pingFrom.z + pingDir.z * reach).toFixed(2), n: myName, c: me ? me.c : 0 };
  net.broadcast(msg);
  hud.addPing(msg);
  sfx.play('ping');
}
net.on('join', (id, name) => {
  if (net.isHost && sim) { sim.addPlayer(id, name); sim.toast(null, `👋 ${name} clocked in.`, 'good'); }
});
net.on('leave', (id, name) => {
  peers.delete(id);
  if (net.isHost && sim) { sim.removePlayer(id); sim.toast(null, `🚪 ${name || 'Someone'} left the shift.`, 'info'); }
});
net.on('hostleft', () => { alert('The host closed the hotel.'); location.reload(); });
net.on('close', () => { if (!net.isHost) { alert('Lost connection to the hotel.'); location.reload(); } });

// ---------- the security monitors ----------
// Sitting at the desk in the Security Office swaps your view for four camera feeds. The Static lives on
// layer 1, which only these cameras draw.
const cctv = { on: false, page: 0, list: [], cams: [0, 1, 2, 3].map(() => new THREE.PerspectiveCamera(64, 16 / 9, 0.5, 90)) }; // near: in front of the camera's own housing
for (const c of cctv.cams) c.layers.enable(1);
function cctvPage() {
  const live = L.CAMERAS.filter(c => !c.on || L.FLAGS[c.on]);
  const pages = Math.max(1, Math.ceil(live.length / 4));
  cctv.page = ((cctv.page % pages) + pages) % pages;
  const list = live.slice(cctv.page * 4, cctv.page * 4 + 4);
  while (list.length < 4) list.push(null);
  return { list, pages };
}
function showCCTV() {
  const { list, pages } = cctvPage();
  cctv.list = list;
  hud.showCCTV(list, cctv.page, pages, snap?.sto?.cams !== 0);
  net.toHost({ k: 'act', a: 'cctv', on: true, cams: list.filter(Boolean).map(c => c.id) });
}
function openCCTV() {
  if (cctv.on) return;
  cctv.on = true;
  cctv.page = 0;
  renderer.domElement.style.filter = 'grayscale(0.75) contrast(1.2) brightness(1.2)';
  document.body.classList.add('cctv');
  showCCTV();
  sfx.play('beep');
}
function closeCCTV() {
  if (!cctv.on) return;
  cctv.on = false;
  renderer.domElement.style.filter = '';
  document.body.classList.remove('cctv');
  hud.hideCCTV();
  net.toHost({ k: 'act', a: 'cctv', on: false });
}
function drawCCTV() {
  const W = window.innerWidth, H = window.innerHeight, dead = snap?.sto?.cams === 0;
  renderer.info.reset();
  renderer.setScissorTest(true);
  cctv.list.forEach((c, i) => {
    const x = (i % 2) * (W / 2), y = i < 2 ? H / 2 : 0; // the viewport's origin is the bottom left
    renderer.setViewport(x, y, W / 2, H / 2);
    renderer.setScissor(x, y, W / 2, H / 2);
    if (!c || dead) { renderer.setClearColor('#050607'); renderer.clear(); return; }
    const cam = cctv.cams[i], from = L.toWorld(c.x, c.z, c.y), to = L.toWorld(c.tx, c.tz, c.ty);
    cam.position.set(from.x, from.y, from.z);
    cam.lookAt(to.x, to.y, to.z);
    cam.aspect = W / H;
    cam.updateProjectionMatrix();
    renderer.render(scene, cam);
  });
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, W, H);
}
function flashCamera(i) {
  const c = cctv.list[i];
  if (!c || snap?.sto?.cams === 0) return;
  hud.cctvFlash(i, false);
  sfx.play('click');
  net.toHost({ k: 'act', a: 'flash', cam: c.id });
}

// ---------- the basement door ----------
function goDown() {
  const S = L.BSM_STEPS;
  hud.fade();
  sfx.play('creak');
  setTimeout(() => player.teleport(S.x3 - 0.55, (S.z1 + S.z2) / 2, Math.PI / 2, S.rise), 200);
}
function goUp() {
  hud.fade();
  sfx.play('creak');
  setTimeout(() => player.teleport(L.BASEMENT.x - 0.6, L.BASEMENT.z, Math.PI / 2), 200);
}

// ---------- taken: watching the rest of the shift through a teammate's eyes ----------
let watch = 0;
function spectate() {
  const others = (snap?.pl || []).filter(p => p.i !== net.id && !p.out && peers.get(p.i));
  if (!others.length) return null;
  const p = others[watch % others.length], st = peers.get(p.i);
  const w = L.toWorld(st.x, st.z, st.y || 0);
  camera.position.set(w.x, w.y + 1.62, w.z);
  camera.rotation.set(st.pitch || 0, st.yaw || 0, 0, 'YXZ');
  return p.n;
}

// ---------- input ----------
function lock() {
  if (!started || hud.overlay) return;
  sfx.init();
  const req = renderer.domElement.requestPointerLock?.();
  if (req?.catch) req.catch(() => { /* re-locking too soon after Esc; the next click retries */ });
}
renderer.domElement.addEventListener('click', () => {
  if (!player.locked) lock();
  else if (snap?.pl.find(p => p.i === net.id)?.out) watch++; // taken: watch somebody else
});
document.addEventListener('pointerlockchange', () => {
  player.locked = document.pointerLockElement === renderer.domElement;
  if (!player.locked && started && !hud.overlay && !hud.chatOpen && snap?.ph === 'shift') hud.openOverlay('pause');
});

document.addEventListener('keydown', e => {
  if (!started || player.typing()) return;
  if (e.code === 'Tab') { e.preventDefault(); return; }
  if (e.code === 'Enter' && net.isHost && snap && (snap.ph === 'lobby' || snap.ph === 'break') && !hud.overlay) { net.toHost({ k: 'act', a: 'cmd', cmd: 'start' }); return; }
  if ((hud.overlay === 'letter' || hud.overlay === 'office') && (e.code === 'KeyE' || e.code === 'Escape')) { hud.closeOverlay(); lock(); return; }
  if (hud.overlay) return;
  if (cctv.on) {
    const i = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[e.code];
    if (i !== undefined && !e.repeat) flashCamera(i);
    else if ((e.code === 'KeyA' || e.code === 'ArrowLeft') && !e.repeat) { cctv.page--; showCCTV(); sfx.play('beep'); }
    else if ((e.code === 'KeyD' || e.code === 'ArrowRight') && !e.repeat) { cctv.page++; showCCTV(); sfx.play('beep'); }
    else if ((e.code === 'KeyE' || e.code === 'Escape') && !e.repeat) closeCCTV();
    return;
  }
  if (e.code === 'KeyT') { e.preventDefault(); hud.openChat(); return; }
  if (e.code === 'KeyM') { hud.toggleBigMap(); return; }
  if (e.code === 'KeyF' && !e.repeat) { player.toggleFlash(); sfx.play('click'); return; }
  if (e.code === 'KeyG' && !e.repeat && player.locked) { sendPing(); return; }
  if (e.code === 'KeyR' && !e.repeat && player.locked && !hud.deskOpen) { hud.nextWaypoint(); sfx.play('click'); return; }
  if (!player.locked && !hud.deskOpen && !hud.elevOpen) return;
  if (!e.repeat || e.code !== 'KeyE') interact.key(e.code);
});

// ---------- menu ----------
$('name').value = store.get('name', ['Bellhop', 'Concierge', 'Night Clerk', 'Valet', 'Housekeeper'][Math.floor(Math.random() * 5)]);
$('howto').innerHTML = `
  <p><b>The Last Resort</b> sits alone at the top of a mountain road. When the snow comes, nobody gets in or out.</p>
  <p><b>Goal:</b> survive seven shifts working for Mr. Harrow, who owns the place and is never seen. Every guest leaves a review when they check out, and he reads every one: if a shift's average rating ends below the target, you're let go. He has his reasons. There's a letter from him on the break room corkboard before every shift, and he calls the front desk when something is wrong.</p>
  <p><b>The job:</b> check guests in at the front desk computer (and pick the right kind of room), park their cars, carry their luggage, deliver towels and room service, cook breakfast, clean rooms, mop up messes, skim the pool, fix the power, walk snooping guests out of staff areas, and check guests out. Everything is on the task list at the right; the ◆ marker points at the most urgent job.</p>
  <p><b>Guest rooms:</b> a red light by a door means DO NOT DISTURB: the guests are in. Walk in on them and they'll hate you for it, so clean that room once they've gone out.</p>
  <p><b>The phone:</b> guests ring the front desk for towels, room service and complaints. Nothing happens until somebody answers (at the desk, or the extension in the Security Office).</p>
  <p><b>Things go wrong:</b> kids slip by the pool or get lost, guests lock themselves out, the elevator jams, a raccoon gets in. Each one goes on the task list with a timer. First aid kits hang by the lobby supplies rack and by the pool nets; spare key cards are behind the front desk.</p>
  <p><b>The kitchen:</b> cook from the fridge, stir cheese into eggs for omelettes, and get burnt food off the stove before it catches fire (the extinguisher is by the island). Cleared tables give you dirty dishes for the sink, and no clean plates means no breakfast. Plates set on the pass can be picked up from the dining room.</p>
  <p><b>Between shifts:</b> everyone heads back to the break room (east end of the hallway). Read the letter, order upgrades at the terminal by the door, and once all of you have been in and walked back out, the next shift starts. Build new floors on top of the hotel (reached by the elevator or the stairs at the west end of the hallway), add a presidential suite and renovate rooms into suites. The hotel's general upgrades (front desk, rooms, kitchen, housekeeping, staff gear, security, amenities) go up five levels each, and the robots and staff you hire can be trained twice. It all costs real money: choose.</p>
  <p><b>Closing time:</b> a shift only ends once every job on the list is done.</p>
  <p><b>The night:</b> each shift brings stranger guests. Read the check-in cards. Some guests should never be let in. And keep your eyes open: nobody will warn you about what walks these halls after dark. Listen for footsteps, watch the lights, and carry a flashlight (F). If something catches you, you're out for the rest of the shift. The breaker box for blackouts is outside, round the back. The Security Office's monitors show things you can't see with your own eyes. And never open the basement door. Unless you have to.</p>
  <div class="controls">${CONTROLS}</div>
  <p>Co-op: one person clicks <b>Host co-op</b> and shares the 4-letter code. Friends on the same network open this page at the host's address (shown in the server window) and click <b>Join</b>. More staff means a busier hotel — the host can tune that under Difficulty.</p>`;

// Difficulty preset for hosted games (fine-tuned later at the break room terminal).
let menuPreset = PRESETS[store.get('preset', 'normal')] ? store.get('preset', 'normal') : 'normal';
const PRESET_HINT = { chill: 'relaxed', normal: 'as intended', hard: 'busy & picky', nightmare: 'good luck' };
function renderPresetPick() {
  $('preset-pick').innerHTML = Object.entries(PRESETS).map(([id, p]) => `<button class="${id === menuPreset ? 'on' : ''}" data-p="${id}" title="${p.desc}">${p.name}<small>${PRESET_HINT[id] || ''}</small></button>`).join('');
  $('preset-pick').querySelectorAll('[data-p]').forEach(b => b.onclick = () => { menuPreset = b.dataset.p; store.set('preset', menuPreset); renderPresetPick(); });
}
renderPresetPick();

function menuError(msg) { $('menu-error').textContent = msg; }

async function start(mode) {
  myName = ($('name').value.trim() || 'Bellhop').slice(0, 16);
  store.set('name', myName);
  const shiftLen = Number($('shiftlen').value) || 480;
  sfx.init();
  menuError('');
  $('loading').classList.remove('hidden');
  try {
    if (mode === 'solo') net.startSolo(myName);
    else if (mode === 'host') await net.host(myName);
    else {
      const code = $('code').value.trim().toUpperCase();
      if (code.length !== 4) throw new Error('Enter the 4-letter code from your host.');
      await net.join(code, myName);
    }
  } catch (e) {
    $('loading').classList.add('hidden');
    menuError(e.message || String(e));
    return;
  }
  if (net.isHost) {
    sim = new Sim({
      shiftLen,
      hostId: net.id,
      settings: { preset: menuPreset, shiftLen },
      send: ev => { onEvent(ev); net.broadcast(ev); },
      sendTo: (pid, ev) => { if (pid === net.id) onEvent(ev); else net.sendTo(pid, ev); },
    });
    sim.addPlayer(net.id, myName);
    snap = sim.snapshot();
  }
  const sp = L.SPAWNS[(net.id - 1) % L.SPAWNS.length];
  player.spawnAt(sp[0], sp[1], 0); // in the break room, facing the corkboard
  started = true;
  $('menu').classList.add('hidden');
  $('loading').classList.add('hidden');
  hud.show(true);
  if (net.code) hud.toast(`Hotel open! Share the room code: ${net.code}`, 'good');
}

$('btn-solo').onclick = () => start('solo');
$('btn-host').onclick = () => start('host');
$('btn-join').onclick = () => start('join');
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') start('join'); });
// On a static host (no server.js) there's nobody to relay co-op, so only solo is offered.
if (window.SOLO_ONLY) {
  $('btn-host').remove();
  document.querySelector('.row.join').remove();
}

// Keep the host's simulation alive while its tab is in the background.
// Browsers throttle background timers, so step by real elapsed time rather than a fixed tick.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && net.isHost && net.online && sim) {
    let prev = performance.now();
    bgTimer = setInterval(() => {
      const now = performance.now();
      for (let left = Math.min(5, (now - prev) / 1000); left > 0; left -= 0.1) sim.update(Math.min(0.1, left));
      prev = now;
      net.broadcast(sim.snapshot());
    }, 100);
  } else if (bgTimer) { clearInterval(bgTimer); bgTimer = null; last = performance.now(); }
});

// Handy for debugging from the browser console (and for automated screenshots).
window.TLR = {
  player, camera, net, hud, world, view, renderer, get sim() { return sim; }, get snap() { return snap; },
  cctv: { open: openCCTV, close: closeCCTV, flash: flashCamera, turn: d => { cctv.page += d; showCCTV(); }, get on() { return cctv.on; } },
};

// ---------- loop ----------
const menuSnap = { ph: 'shift', H: 21.2, pw: 1, hz: 0.2, m: [], rm: L.ROOMS.map(() => ['vacant', 0, 1, 0, '', '', 0]), sv: Array(9).fill(null), g: [], c: [], it: [], mn: [], pl: [], hp: [], ufo: null };
let last = performance.now();
let menuT = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (!started) {
    menuT += dt * 0.05;
    camera.position.set(Math.sin(menuT) * 46, 15, 32 + Math.cos(menuT) * 22);
    camera.lookAt(0, 2, -6);
    world.update(menuSnap, dt, [], null, camera.position);
    draw();
    return;
  }

  // local player
  const me = snap?.pl.find(p => p.i === net.id);
  const dn = me ? me.dn : 0;
  if (dn <= 0 && lastDown > 0) player.spawnAt(L.RESPAWN.x + rand(-1, 1), L.RESPAWN.z + rand(-0.5, 0.5), 0);
  lastDown = dn;
  player.down = dn;
  if (player.car && snap && !snap.c.some(c => c.i === player.car.id && c.d === net.id)) {
    if (!snap.c.some(c => c.i === player.car.id)) player.car = null;
  }
  const up = snap?.up || {};
  player.speedMul = 1 + 0.05 * (up.gear || 0);
  player.sprintMul = hasPerk(up, 'skates') ? 2.0 : 1.6;
  player.staminaMul = 1 + 0.15 * (up.gear || 0) + (hasPerk(up, 'energy') ? 0.4 : 0);
  player.carryMul = me?.h === 'body' ? 0.55 : me?.h === 'luggage' && !hasPerk(up, 'cart') ? 0.85 : 1;
  player.flashPower = 55 + 6 * (up.security || 0);
  const out = !!me?.out && snap?.ph === 'shift';
  if (cctv.on && (snap?.ph !== 'shift' || out || (player.pos.x - L.STATIONS.cctv.x) ** 2 + (player.pos.z - L.STATIONS.cctv.z) ** 2 > 9)) closeCCTV();
  player.frozen = cctv.on || out;
  player.update(dt, {
    block: !!hud.overlay || hud.chatOpen || cctv.on || out,
    onStep: wet => sfx.play(wet ? 'stepwet' : 'step'),
    onSplash: () => sfx.play('splash'),
    onLand: () => sfx.play('land'),
    onBonk: () => sfx.play('bonk'),
  });

  // simulation (host) and networking
  const pose = player.pose();
  if (net.isHost && sim) {
    sim.setPose(net.id, pose);
    const paused = hud.overlay === 'pause' && !net.online;
    if (!paused) sim.update(dt);
    snap = sim.snapshot();
    netT += dt;
    if (net.online && netT > 0.1) { netT = 0; net.broadcast(snap); }
  }
  poseT += dt;
  if (net.online && poseT > 0.05) { poseT = 0; net.broadcast(pose); }

  // render state
  const heldItem = me?.hi && snap?.it.find(i => i.i === me.hi);
  const ctx = {
    me: net.id, peers, localCar: player.car, driving: !!player.car, moving: player.moving,
    using: interact.using, heldColor: heldItem?.cl, flashPower: player.flashPower, myPos: player.pos,
  };
  view.update(snap, dt, ctx);
  const watching = out ? spectate() : null;
  const eye = { x: camera.position.x + player.floor * L.FLOOR_DX, z: camera.position.z };
  // With something close by that nobody has seen yet, the lights stutter now and then. That's all.
  stutterT -= dt;
  if (stutterT <= 0 && snap?.mn?.some(m => !m.sn && m.k !== 'raccoon' && L.floorOf(m.x) === player.floor && (m.x - player.pos.x) ** 2 + (m.z - player.pos.z) ** 2 < 81)) {
    stutterT = rand(3, 6);
    world.flicker(rand(0.15, 0.35));
  }
  world.update(snap, dt, view.doorOpeners(player.pos), eye, camera.position);
  interact.update(dt, snap, { me: net.id, view, down: dn > 0 || out || cctv.on });
  hud.update(snap, dt, {
    me: net.id, peers, stamina: player.stamina, pos: player.pos, yaw: player.yaw, isHost: net.isHost,
    hostId: net.hostId, code: net.code, locked: player.locked, camera, calm: settings.calm, grain: settings.grain, out, watching,
  });
  for (let i = effects.length - 1; i >= 0; i--) {
    const f = effects[i];
    f.t += dt;
    f.s.material.opacity = Math.max(0, 1 - f.t / f.life);
    f.s.scale.multiplyScalar(1 + dt * 0.8);
    if (f.t > f.life) { scene.remove(f.s); f.s.material.dispose(); effects.splice(i, 1); }
  }

  const H = snap?.ph === 'shift' ? snap.H : 15.5;
  sfx.listen(camera);
  const outside = player.floor === 0 && L.zoneAt(player.pos.x, player.pos.z).id === 'outside' ? 1 : 0;
  sfx.update(dt, { night: H >= 21 && H < 30 ? 1 : 0, horror: snap?.hz || 0, power: !!snap?.pw, driving: player.car, outside, gust: world.wind });
  if (cctv.on) drawCCTV(); else draw();
}
requestAnimationFrame(frame);
