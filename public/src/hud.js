// DOM HUD: clock & timeline, rating, tasks, minimap, waypoint, pings, prompts, the check-in card,
// toasts, surveys, phone calls, the security monitors and the between-shift screens (the break room's
// letter and order terminal, results).
import * as THREE from 'three';
import * as L from './layout.js';
import { UPGRADES, UPGRADE_CATS, UPGRADE_BY_ID, PLAYER_COLORS, ITEMS, ROUNDS, TIERS, TASTE_LABEL, TASTE_WANTS, SUITE_COST, HELPERS, LETTERS, OVERTIME_LETTER, LEDGER, EPILOGUE } from './content.js';
import { DIFF_OPTIONS, PRESETS, crewSummary, difficulty } from './difficulty.js';
import { fmtClock, clamp } from './util.js';
import { makeLook } from './looks.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TIER_CODE = { b: 'basic', s: 'suite', p: 'pres' };

// The base map covers the whole property (expansions included); the minimap shows a window of it.
const MAP = { x1: -70, x2: 46, z1: -36, z2: 42 };
const PX = 8;
const MINI = 230, MINI_M = 72;
const TIPS = {
  start: 'Guests are on their way! Get behind the FRONT DESK (lobby) and press E at the computer to check them in.',
  valet: 'A guest\'s car is waiting out front. Walk up to it, press E to drive, and park it in a marked spot in the lot.',
  luggage: 'Suitcases pile up next to the desk. Pick one up (E) and carry it into the guest\'s room.',
  request: 'Room requests show on the right. Towels are in the Laundry, food comes from the Kitchen, plungers hang on the lobby SUPPLIES rack.',
  order: 'Breakfast orders! Grab ingredients from the fridge, cook them on the stove, then take the plate to the guest and press E. Tickets over the pass show every open order.',
  combo: 'Some guests order two things at once. Grab a serving tray by the coffee machine to carry up to three dishes.',
  omelette: 'Omelette order! Put raw eggs on a burner, then bring cheese from the fridge and press E on the pan while they cook.',
  fire: 'GREASE FIRE! Burnt food left on a burner catches fire. Grab the extinguisher by the end of the island and hold E on the flames.',
  dishes: 'Clearing a table hands you a tub of dirty dishes. Drop it in the kitchen sink and hold E to wash. No clean plates, no breakfast.',
  pass: 'Set plates on the pass (the hatch between the kitchen and the dining room) and a teammate can grab them from the other side.',
  mess: 'Messes cost you stars. Grab a mop from the SUPPLIES rack in the lobby and hold E on the mess.',
  pool: 'The pool is getting gross. Use the pool net and hold E on the gunk.',
  room: 'Dirty rooms can\'t be given to new guests. Make the bed and clean up the mess inside.',
  blackout: 'Blackout! Press F for your flashlight. The breaker box is outside: out the front doors and round the back of the hotel.',
  body: 'There is a body. Carry it to the DUMPSTER (outside, west of the entrance) and mop up the blood before a guest sees it.',
  circle: 'Summoning circles! Scrub them with a mop before they finish charging.',
  curtains: 'Vampires burn at sunrise. Close the curtains in their rooms before 6 AM.',
  monster: 'Whatever that was, it hunts anyone it can see. Shine your flashlight (F) at it to drive it back, or get out of its sight and run. Listen for its footsteps.',
  cold: 'The aliens want their rooms FREEZING. Use the thermostat next to the door inside their room.',
  cards: 'Read the check-in cards carefully. Some guests should NOT be let in. Press X to turn them away.',
  tiers: 'Fancy guests want fancy rooms. Pick the room type at the desk (1 Standard · 2 Suite · 3 Presidential). Renovate suites at the order terminal in the break room.',
  snoop: 'A guest wandered into a staff-only area! Walk up to them and press E to escort them out before they cause trouble.',
  elevator: 'Some jobs are upstairs. Take the elevator behind the lobby (press E at the call button), or the stairs at the west end of the hallway.',
  dnd: 'A red light by a door means DO NOT DISTURB: the guests are inside. Barge in and they will hate you for it. Clean that room once they head out.',
  slip: 'Someone slipped by the pool! Grab a first aid kit (beside the mops on the lobby\'s back wall, or by the pool nets) and hold E on them.',
  lostkid: 'A kid is lost! Follow the marker, find them and press E to send them back to their family.',
  lockout: 'A guest is locked out of their room. Take a spare key card from the rack behind the front desk and hand it over.',
  drunk: 'A guest passed out in public. Hold E on them to get them up and off to bed before they make a mess.',
  stuck: 'The elevator is stuck! Hold E at the elevator panel on the ground floor to reset it. Until then, everyone takes the stairs.',
  raccoon: 'A raccoon got in! Grab a mop and hold E on it to chase it out before it raids the trash and the stove.',
  vending: 'The vending machine by the elevators ate a guest\'s money. Hold E on the machine to give it a whack.',
  waypoint: 'The ◆ marker points at your most urgent job. Press R to cycle through jobs, G to ping a spot for your crew.',
  welcome: 'You start in the break room. Read Mr. Harrow\'s letter on the corkboard (E), order upgrades at the terminal by the door, then head out into the hotel to open for the night.',
  phone: 'The front desk phone is ringing. Guests call down for everything: answer it (E) to hear what they want. There is an extension in the Security Office.',
  cellar: 'Somebody has gone down into the basement. The door is at the back of Storage, east end of the hallway. Take your flashlight.',
  key: 'Mr. Harrow\'s brass key hangs on the porter\'s cart in the basement. Carry it to the iron door at the far end and hold E to lock it. Before dawn.',
  cctv: 'Something is on the cameras. The monitors are in the Security Office (west end of the hall): sit down (E) and press the camera\'s number to flash it.',
  mimic: 'There is no Room 000.',
};

export class Hud {
  constructor(handlers) {
    this.h = handlers;
    this.deskOpen = false;
    this.overlay = null;
    this.phase = null;
    this.tipsShown = new Set();
    this.tipQueue = [];
    this.tipT = 0;
    this.tasksKey = '';
    this.lastPrompt = null;
    this.mapT = 0;
    this.bigMap = false;
    this.bases = {};
    this.elevOpen = false;
    this.chatOpen = false;
    this.downUntil = 0;
    this.track = 0;
    this.trackKey = '';
    this.pings = [];
    this.officeTab = 'up';
    this.upCat = 'all';
    this.beatT = 0;
    this.v3 = new THREE.Vector3();
    $('chat-input').addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) this.h.chat(v); this.closeChat(); }
      if (e.key === 'Escape') this.closeChat();
    });
    $('grain').style.backgroundImage = `url(${noiseURL()})`;
  }

  show(on) { $('hud').classList.toggle('hidden', !on); }

  // ---------- small widgets ----------
  setPrompt(text, type) {
    const key = text + type;
    if (key === this.lastPrompt) return;
    this.lastPrompt = key;
    const el = $('prompt');
    if (!text) { el.classList.remove('on'); return; }
    const k = type === 'hold' ? '<b>Hold E</b>' : type === 'press' || type === 'desk' || type === 'elevator' || type === 'ui' ? '<b>E</b>' : '';
    el.innerHTML = `${k} ${esc(text)}`;
    el.classList.toggle('info', type === 'info' || !type);
    el.classList.add('on');
  }

  setHold(p) {
    const ring = document.querySelector('#crosshair .ring');
    ring.style.strokeDashoffset = String(94.2 * (1 - clamp(p, 0, 1)));
    $('crosshair').classList.toggle('holding', p > 0);
  }

  toast(text, cl = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${cl}`;
    el.textContent = text;
    $('toasts').prepend(el);
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4800);
    while ($('toasts').children.length > 5) $('toasts').lastChild.remove();
  }

  money(v) {
    const el = document.createElement('div');
    el.className = 'money-pop';
    el.textContent = `+$${v}`;
    $('money').appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  survey(s) {
    const el = document.createElement('div');
    el.className = `survey ${s.stars >= 4 ? 'good' : s.stars <= 2 ? 'bad' : 'mid'}`;
    const where = s.room ? `, ${s.room === 'PRES' ? 'Presidential Suite' : `Room ${s.room}`}` : '';
    el.innerHTML = `<div class="sv-stars">${starHtml(s.stars)}${s.w > 1 ? '<span class="sv-tag">×2 INFLUENCER</span>' : ''}</div><div class="sv-text">“${esc(s.text)}”</div><div class="sv-name">— ${esc(s.name)}${where}</div>`;
    $('feed').prepend(el);
    setTimeout(() => el.classList.add('out'), 13000);
    setTimeout(() => el.remove(), 13800);
    while ($('feed').children.length > 4) $('feed').lastChild.remove();
  }

  titleCard(ev) {
    const el = $('titlecard');
    el.innerHTML = `<div class="tc-shift">SHIFT ${ev.round}</div><div class="tc-title">${esc(ev.title)}</div><div class="tc-client">Tonight's clientele: ${esc(ev.clientele || '')}</div><div class="tc-blurb">${esc(ev.blurb)}</div><div class="tc-target">Keep the rating at <b>★ ${ev.threshold.toFixed(2)}</b> or better</div>`;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(this.tcTimer);
    this.tcTimer = setTimeout(() => el.classList.remove('on'), 7500);
  }

  down(secs, why) {
    this.downUntil = performance.now() + secs * 1000;
    this.downWhy = why === 'abducted' ? 'You were abducted. Briefly.' : 'You were caught!';
  }

  tip(key) {
    if (this.tipsShown.has(key) || !TIPS[key]) return;
    this.tipsShown.add(key);
    this.tipQueue.push(TIPS[key]);
  }

  chatLine(name, color, text) {
    const el = document.createElement('div');
    el.className = 'chat-line';
    el.innerHTML = `<b style="color:${color}">${esc(name)}:</b> ${esc(text)}`;
    $('chat-log').appendChild(el);
    setTimeout(() => el.classList.add('out'), 10000);
    setTimeout(() => el.remove(), 10800);
    while ($('chat-log').children.length > 7) $('chat-log').firstChild.remove();
  }

  openChat() { this.chatOpen = true; const i = $('chat-input'); i.classList.add('on'); i.value = ''; setTimeout(() => i.focus(), 0); }
  closeChat() { this.chatOpen = false; const i = $('chat-input'); i.classList.remove('on'); i.blur(); }
  toggleBigMap() { this.bigMap = !this.bigMap; $('mapbig').classList.toggle('on', this.bigMap); }
  nextWaypoint() { this.track++; this.trackKey = ''; }

  // A teammate (or you) marked a spot. p: {x, z, n, c}
  addPing(p) {
    const el = document.createElement('div');
    el.className = 'ping';
    el.innerHTML = `<div class="pg-dot" style="border-color:${PLAYER_COLORS[p.c] || '#fff'}"></div><div class="pg-name">${esc(p.n)}</div>`;
    $('pings').appendChild(el);
    this.pings.push({ ...p, el, until: performance.now() + 9000 });
    while (this.pings.length > 6) this.pings.shift().el.remove();
  }

  // ---------- desk ----------
  openDesk() { this.deskOpen = true; this.deskKey = ''; $('desk').classList.remove('hidden'); this.h.onDesk?.(); }
  closeDesk() { this.deskOpen = false; $('desk').classList.add('hidden'); }

  renderDesk(dk, snap) {
    if (!this.deskOpen || !dk) return;
    const key = `${dk.g}|${dk.m}|${JSON.stringify(dk.tiers)}`;
    const pt = clamp(dk.pt / (dk.m === 'in' ? 85 : 65), 0, 1);
    if (key === this.deskKey) { $('desk-patience').style.width = `${pt * 100}%`; $('desk-patience').classList.toggle('low', pt < 0.3); return; }
    this.deskKey = key;
    const c = dk.c;
    const checkin = dk.m === 'in';
    const wants = TASTE_WANTS[dk.taste] || 'basic';
    const exists = { basic: true, suite: dk.suites > 0, pres: !!dk.pres };
    const tierBtn = (t, n) => {
      const free = dk.tiers?.[t] || 0;
      const sub = free ? `${free} ready · $${dk.prices[t]}` : exists[t] ? 'none ready' : 'not built';
      return `<div class="act tier ${free ? '' : 'disabled'} ${wants === t ? 'want' : ''}"><b>${n}</b>${TIERS[t].icon} ${TIERS[t].short}<small>${sub}</small></div>`;
    };
    $('desk').innerHTML = `
      <div class="desk-head">${checkin ? 'GUEST REGISTRATION' : 'CHECK-OUT'} <span>THE LAST RESORT · EST. 1926</span></div>
      <div class="desk-body">
        <canvas id="portrait" width="120" height="150"></canvas>
        <div class="desk-info">
          <div class="desk-name">${esc(dk.n)}</div>
          ${checkin ? `
          <div class="desk-row"><span>Party</span>${c.size} ${c.size > 1 ? 'guests' : 'guest'}</div>
          <div class="desk-row"><span>Reservation</span>${c.res ? esc(c.res) : '<i>none</i>'}</div>
          <div class="desk-row"><span>Payment</span>${esc(c.pay)}</div>
          <div class="desk-row"><span>Purpose</span>${esc(c.purpose)}</div>
          <div class="desk-row taste ${wants}"><span>Room</span>${esc(TASTE_LABEL[dk.taste] || 'Any room')}</div>
          <div class="desk-notes">${c.notes.map(n => `<div>✎ ${esc(n)}</div>`).join('')}</div>` : `
          <div class="desk-row"><span>Room</span>${esc(dk.room === 'PRES' ? 'Presidential Suite' : dk.room || '?')}</div>
          <div class="desk-notes"><div>Checking out. Make it quick and painless.</div></div>`}
        </div>
        ${dk.flag ? '<div class="stamp">FLAGGED</div>' : ''}
      </div>
      <div class="desk-patience"><div id="desk-patience"></div></div>
      <div class="desk-actions">
        ${checkin ? `${tierBtn('basic', 1)}${tierBtn('suite', 2)}${tierBtn('pres', 3)}<div class="act deny"><b>X</b> Turn away</div>` : '<div class="act"><b>1</b> Check out</div>'}
        <div class="act ghost"><b>E</b> Close</div>
      </div>`;
    drawPortrait($('portrait'), dk.k, dk.s, dk.w);
    $('desk-patience').style.width = `${pt * 100}%`;
    if (checkin && snap.rd >= 2) this.tip('cards');
    if (checkin && wants !== 'basic') this.tip('tiers');
  }

  // ---------- per-frame ----------
  update(snap, dt, ctx) {
    if (!snap) return;
    this.lastSnap = snap;
    if (snap.ph !== this.phase) this.onPhase(snap.ph, snap);
    const inShift = snap.ph === 'shift';
    document.body.classList.toggle('calm', !!ctx.calm);
    $('shift-name').textContent = inShift ? `Shift ${snap.rd} · ${snap.ttl}` : snap.ph === 'lobby' ? 'Before opening' : snap.ph === 'break' ? 'Between shifts' : `Shift ${snap.rd}`;
    $('clock').textContent = inShift ? fmtClock(snap.H) : fmtClock(15);
    $('phase-label').textContent = inShift ? (snap.cl ? 'Closing up' : phaseLabel(snap.H)) : snap.ph === 'lobby' || snap.ph === 'break' ? 'On your break' : '';
    $('closing').classList.toggle('on', inShift && !!snap.cl);
    if (inShift && snap.cl) $('closing').innerHTML = `🔔 <b>CLOSING UP</b> · the shift ends when every job is done · <b>${snap.cl.n}</b> left · the day crew in ${Math.floor(snap.cl.t / 60)}:${String(snap.cl.t % 60).padStart(2, '0')}`;
    $('timeline').classList.toggle('hidden', !inShift);
    if (inShift) $('tl-now').style.left = `${clamp((snap.H - 15) / 21, 0, 1) * 100}%`;
    $('power').classList.toggle('on', !snap.pw);

    // rating
    const stars = snap.rs;
    const avg = stars.length ? stars.reduce((a, b) => a + b, 0) / stars.length : null;
    $('rating-fill').style.width = `${avg ? (avg / 5) * 100 : 0}%`;
    $('rating-mark').style.left = `${(snap.th / 5) * 100}%`;
    $('rating-num').textContent = avg ? avg.toFixed(2) : '—';
    $('rating-target').textContent = inShift ? `target ★ ${snap.th.toFixed(2)} · ${stars.length} review${stars.length === 1 ? '' : 's'}` : '';
    const danger = !!avg && inShift && avg < snap.th;
    $('rating').classList.toggle('danger', danger);
    $('rating').classList.toggle('hidden', !inShift);
    $('money-val').textContent = `$${snap.mo}`;
    $('occupancy').innerHTML = inShift ? occupancy(snap) : '';

    const me = snap.pl.find(p => p.i === ctx.me);
    let held = '';
    if (me?.h) {
      const name = me.h === 'burnt' ? 'Burnt food' : me.h === 'tray' ? `Tray (${(me.hc || []).length}/3)` : ITEMS[me.h]?.name;
      held = `Holding: <b>${esc(name)}</b> <span>Q drop · RMB throw</span>`;
    }
    $('held').innerHTML = held;
    $('stamina-fill').style.width = `${ctx.stamina * 100}%`;
    $('stamina').classList.toggle('low', ctx.stamina < 0.25);

    this.renderTasks(snap, ctx);
    this.updateWaypoint(snap, ctx);
    this.updatePings(ctx);
    this.mapT -= dt;
    if (this.mapT <= 0) {
      this.mapT = 0.1;
      this.drawMap($('minimap'), snap, ctx, false);
      if (this.bigMap) this.drawMap($('mapbig-canvas'), snap, ctx, true);
    }
    if (this.deskOpen) this.renderDesk(snap.dk, snap);

    let hint = '';
    if ((snap.ph === 'lobby' || snap.ph === 'break') && ctx.isHost && snap.np > 1) hint = 'Host: <b>Enter</b> starts the shift without waiting for everyone';
    if (inShift && !ctx.locked && !this.overlay) hint = 'Click to resume';
    $('hint').innerHTML = hint;

    if (inShift) this.autoTips(snap);
    else if (snap.ph === 'lobby') this.tip('welcome');
    this.breakStatus(snap, ctx);
    this.setOut(inShift && ctx.out, ctx.watching);
    this.tipT -= dt;
    if (this.tipT <= 0 && this.tipQueue.length) { this.tipT = 9; $('tip').textContent = this.tipQueue.shift(); $('tip').classList.add('on'); }
    else if (this.tipT <= 0) $('tip').classList.remove('on');

    // fear: a monster somebody has seen speeds up the heartbeat and closes in the vignette as it nears
    // (one nobody has seen yet gives nothing away)
    let fear = 0;
    for (const m of snap.mn) if (m.sn && L.floorOf(m.x) === L.floorOf(ctx.pos.x)) fear = Math.max(fear, 1 - Math.hypot(m.x - ctx.pos.x, m.z - ctx.pos.z) / 16);
    fear = clamp(fear, 0, 1);
    const left = (this.downUntil - performance.now()) / 1000;
    $('downscreen').classList.toggle('on', left > 0);
    if (left > 0) $('downscreen').innerHTML = `<div>${this.downWhy}</div><small>Back on shift in ${Math.ceil(left)}s</small>`;
    $('vignette').style.opacity = String(clamp((inShift ? (snap.hz || 0) * 0.3 : 0) + (snap.pw ? 0 : 0.35) + (left > 0 ? 0.5 : 0) + fear * 0.45, 0, 0.92));
    if (fear > 0 && inShift) {
      this.beatT -= dt;
      if (this.beatT <= 0) {
        this.beatT = 1.1 - fear * 0.55;
        this.h.sound?.('heartbeat');
        const p = $('pulse');
        p.classList.remove('beat');
        void p.offsetWidth;
        p.style.setProperty('--fear', String(0.25 + fear * 0.6));
        p.classList.add('beat');
      }
    }
    const night = inShift && snap.H >= 21 && snap.H < 30 ? 1 : 0;
    $('grain').style.opacity = ctx.grain === false ? '0' : String(0.045 + night * 0.035 + (inShift ? (snap.hz || 0) * 0.05 : 0) + fear * 0.05);

    if (this.overlay === 'office') this.refreshOffice(snap, ctx);
    if (this.overlay && ['results', 'gameover', 'victory'].includes(this.overlay)) this.refreshWaiting(snap, ctx);
  }

  // The thought that crosses your mind when you see something you shouldn't: a line across the middle
  // of the screen and a jolt of red at the edges.
  scare(text) {
    const el = $('scare');
    el.textContent = text;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    const p = $('pulse');
    p.style.setProperty('--fear', '0.95');
    p.classList.remove('beat');
    void p.offsetWidth;
    p.classList.add('beat');
  }

  autoTips(snap) {
    const ics = new Set(snap.tk.map(t => t.ic));
    if (snap.rd === 1) this.tip('start');
    if (ics.has('🚗')) this.tip('valet');
    if (ics.has('🧳')) this.tip('luggage');
    if (snap.tk.some(t => /room service|towels|clogged|noise|housekeeping/.test(t.tx))) this.tip('request');
    if (snap.tk.some(t => t.tx.startsWith('Table'))) { this.tip('order'); this.tip('waypoint'); }
    if (snap.tk.some(t => t.tx.startsWith('Table') && t.tx.includes(' + '))) this.tip('combo');
    if (snap.tk.some(t => t.ic.includes('🧀'))) this.tip('omelette');
    if (ics.has('🔥')) this.tip('fire');
    if (ics.has('🍽️') || ics.has('🫧')) this.tip('dishes');
    if (snap.kt?.ps?.some(Boolean)) this.tip('pass');
    if (ics.has('🧹')) this.tip('mess');
    if (ics.has('🏊')) this.tip('pool');
    if (ics.has('🛏️')) this.tip('room');
    if (ics.has('⚡')) this.tip('blackout');
    if (ics.has('⚰️') || ics.has('🩸')) this.tip('body');
    if (ics.has('⛧')) this.tip('circle');
    if (ics.has('🌅')) this.tip('curtains');
    if (ics.has('👁️')) this.tip('monster');
    if (ics.has('❄️')) this.tip('cold');
    if (ics.has('🚷')) this.tip('snoop');
    if (snap.tk.some(t => L.floorOf(t.x) > 0)) this.tip('elevator');
    if (snap.rm.some(st => st[1])) this.tip('dnd');
    for (const [ic, tip] of [['🤕', 'slip'], ['😰', 'lostkid'], ['🥴', 'drunk'], ['🛗', 'stuck'], ['🦝', 'raccoon'], ['🥤', 'vending'], ['☎️', 'phone'], ['🗝️', 'key'], ['📺', 'cctv']]) if (ics.has(ic)) this.tip(tip);
    if (snap.tk.some(t => t.ic === '🚪' && t.tx.includes('locked out'))) this.tip('lockout');
    if (snap.tk.some(t => t.ic === '🚪' && t.tx.includes('basement'))) this.tip('cellar');
    if (snap.tk.some(t => t.tx === 'Luggage → Room 000')) this.tip('mimic');
  }

  // Jobs that still need a person come first; a 🤖 tag marks ones a helper is already doing.
  // Jobs on another floor show which floor instead of a distance.
  renderTasks(snap, ctx) {
    const list = snap.ph === 'shift' ? snap.tk : [];
    const myF = L.floorOf(ctx.pos.x);
    const where = t => {
      const f = L.floorOf(t.x);
      return f === myF ? `${Math.round(Math.hypot(t.x - ctx.pos.x, t.z - ctx.pos.z))}m` : `${L.levelY(f) > L.levelY(myF) ? '↑' : '↓'} ${L.floorShort(f)}`;
    };
    const tracked = this.trackedTask(snap);
    const key = list.map(t => t.ic + t.tx + t.t + where(t).replace(/\d+m/, m => Math.round(parseInt(m, 10) / 4)) + (t === tracked ? '*' : '')).join('|');
    if (key === this.tasksKey) return;
    this.tasksKey = key;
    $('tasks').innerHTML = list.length
      ? list.map(t => {
        const cls = [t.u >= 2 ? 'crit' : t.u ? 'urgent' : '', t.t >= 0 && t.t < 15 ? 'late' : '', t.bot ? 'bot' : '', t === tracked ? 'tracked' : ''].join(' ');
        return `<div class="task ${cls}"><span class="ic">${t.ic}</span><span class="tx">${t.bot ? '<i>🤖</i> ' : ''}${esc(t.tx)}</span><span class="meta">${t.t >= 0 ? `<span class="tm">${t.t}s</span>` : ''}${t.secret ? '' : `<span class="dist">${where(t)}</span>`}</span></div>`;
      }).join('')
      : snap.ph === 'shift' ? `<div class="task calm"><span class="ic">✨</span><span class="tx">${snap.cl ? 'Everything is done. Locking up…' : 'All quiet... for now.'}</span></div>` : '';
  }

  trackedTask(snap) {
    if (snap.ph !== 'shift') return null;
    const list = snap.tk.filter(t => !t.secret && !t.bot);
    if (!list.length) return null;
    return list[this.track % list.length];
  }

  // The ◆ marker floats over the tracked job, or hugs the screen edge pointing toward it.
  updateWaypoint(snap, ctx) {
    const el = $('waypoint');
    const mine = snap.brk && snap.brk.v.includes(ctx.me);
    const t = snap.brk ? (mine ? { ic: '🚪', tx: 'back to work', x: 24, z: -19.6 } : { ic: '☕', tx: 'break room', x: 25, z: -15.5 }) : this.trackedTask(snap);
    if (!t || !ctx.camera || this.overlay) { el.classList.remove('on'); return; }
    const k = t.ic + t.tx;
    if (k !== this.trackKey) { this.trackKey = k; el.querySelector('.wp-ic').textContent = t.ic; }
    const tf = L.floorOf(t.x), myF = L.floorOf(ctx.pos.x);
    const d = Math.hypot(t.x - ctx.pos.x, t.z - ctx.pos.z);
    const route = tf === L.BASEMENT_F || myF === L.BASEMENT_F ? 'basement door, Storage' : L.FLAGS.elev_out ? 'stairs' : 'stairs or elevator';
    el.querySelector('.wp-d').textContent = tf !== myF ? `${L.levelY(tf) > L.levelY(myF) ? '↑' : '↓'} ${L.floorShort(tf)} · ${route}` : d < 2.5 ? 'here' : `${Math.round(d)}m`;
    const w = L.toWorld(t.x, t.z, 1.5);
    const v = this.v3.set(w.x, w.y, w.z).project(ctx.camera);
    const W = window.innerWidth, H = window.innerHeight;
    let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
    const behind = v.z > 1;
    const m = 48;
    const off = behind || x < m || x > W - m || y < m || y > H - m;
    if (off) {
      let dx = x - W / 2, dy = y - H / 2;
      if (behind) { dx = -dx; dy = -dy; if (Math.abs(dy) < 1) dy = 1; }
      const s = Math.min((W / 2 - m) / Math.abs(dx || 1e-3), (H / 2 - m) / Math.abs(dy || 1e-3));
      x = W / 2 + dx * s; y = H / 2 + dy * s;
      el.style.setProperty('--ang', `${Math.atan2(dy, dx)}rad`);
    }
    el.classList.toggle('edge', off);
    el.classList.toggle('urgent', (t.u || 0) >= 1);
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.classList.add('on');
  }

  updatePings(ctx) {
    const now = performance.now();
    const W = window.innerWidth, H = window.innerHeight;
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i];
      if (now > p.until) { p.el.remove(); this.pings.splice(i, 1); continue; }
      if (!ctx.camera) continue;
      const w = L.toWorld(p.x, p.z, 0.6);
      const v = this.v3.set(w.x, w.y, w.z).project(ctx.camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      p.el.style.display = visible ? '' : 'none';
      p.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * W}px, ${(-v.y * 0.5 + 0.5) * H}px)`;
      p.el.style.opacity = String(Math.min(1, (p.until - now) / 1500));
    }
  }

  // ---------- elevator ----------
  openElevator(cur) { this.elevOpen = true; this.renderElevator(cur); $('elevator').classList.remove('hidden'); }
  closeElevator() { this.elevOpen = false; $('elevator').classList.add('hidden'); }
  renderElevator(cur) {
    const flags = this.lastSnap?.ht?.f || {};
    const jobs = f => (this.lastSnap?.tk || []).filter(t => !t.secret && L.floorOf(t.x) === f).length;
    $('elevator').innerHTML = `<div class="el-head">ELEVATOR <span>${esc(L.FLOORS[cur].name)}</span></div>${[...L.FLOORS].reverse().map(F => {
      const built = F.f === 0 || !!flags[F.flag];
      const note = F.f === cur ? 'you are here' : !built ? 'not built' : jobs(F.f) ? `${jobs(F.f)} job${jobs(F.f) > 1 ? 's' : ''}` : '';
      return `<div class="el-btn ${F.f === cur ? 'cur' : ''} ${built ? '' : 'off'}"><b>${F.f + 1}</b><span>${esc(F.name)}</span><small>${note}</small></div>`;
    }).join('')}<div class="el-foot"><b>E</b> close</div>`;
  }
  fade() { const el = $('fade'); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }

  // ---------- maps ----------
  // One base image per floor: the ground floor shows the whole property, upper floors the tower.
  mapBase(f, labels) {
    const key = `${f}|${labels ? 1 : 0}`;
    const k2 = `${key}|${L.stairsTop()}`; // redraw once the stairs exist
    return (this.bases[k2] ||= this.drawMapBase(f, labels));
  }

  drawMapBase(f, labels) {
    const c = document.createElement('canvas');
    c.width = (MAP.x2 - MAP.x1) * PX;
    c.height = (MAP.z2 - MAP.z1) * PX;
    const g = c.getContext('2d');
    const o = f * L.FLOOR_DX, on = x => L.floorOf(x) === f;
    const X = x => (x - o - MAP.x1) * PX, Z = z => (z - MAP.z1) * PX;
    g.fillStyle = '#161c22';
    g.fillRect(0, 0, c.width, c.height);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (f === 0) {
      g.fillStyle = '#23272e';
      g.fillRect(X(L.LOT.x1), Z(L.ROAD.z1), (L.LOT.x2 - L.LOT.x1) * PX, (L.LOT.z2 - L.ROAD.z1) * PX);
      g.fillRect(0, Z(L.ROAD.z1), c.width, (L.ROAD.z2 - L.ROAD.z1) * PX);
      g.strokeStyle = 'rgba(255,255,255,0.16)';
      g.lineWidth = 1;
      for (const p of L.PARKING) g.strokeRect(X(p.x - 1.4), Z(p.z - 2.4), 2.8 * PX, 4.8 * PX);
      g.fillStyle = '#21402a';
      for (const fu of L.FURN) if (fu.kind === 'mazeHedge') {
        const swap = Math.abs(Math.sin(fu.ry)) > 0.5, w = swap ? fu.d : fu.w, d = swap ? fu.w : fu.d;
        g.fillRect(X(fu.x - w / 2), Z(fu.z - d / 2), w * PX, d * PX);
      }
      g.fillStyle = 'rgba(70,110,80,0.45)';
      for (const t of L.TREES) { g.beginPath(); g.arc(X(t.x), Z(t.z), PX * 1.2, 0, 7); g.fill(); }
    } else if (f !== L.BASEMENT_F) { // the roofs below
      g.fillStyle = '#20232a';
      g.fillRect(X(L.BUILDING.x1 + o), Z(L.BUILDING.z1), (L.BUILDING.x2 - L.BUILDING.x1) * PX, (L.BUILDING.z2 - L.BUILDING.z1) * PX);
    }
    const fill = { lobby: '#3b3226', dining: '#3a2a1e', kitchen: '#2e3236', laundry: '#2b3238', utility: '#262626', hall: '#3d1b20', elev: '#3d1b20', pool: '#1d4552', staff: '#25303a', storage: '#262626', linen: '#2b3238', closet: '#262626', lounge: '#4a2a18', office: '#26303a', basement: '#2a2622' };
    for (const z of L.ZONES) if (on(z.x1 + 1)) { g.fillStyle = fill[z.id] || '#333'; g.fillRect(X(z.x1), Z(z.z1), (z.x2 - z.x1) * PX, (z.z2 - z.z1) * PX); }
    for (const z of L.ZONES) if (on(z.x1 + 1) && L.STAFF_ZONES.has(z.id)) { // staff-only areas get a red hatch
      g.save(); g.beginPath(); g.rect(X(z.x1), Z(z.z1), (z.x2 - z.x1) * PX, (z.z2 - z.z1) * PX); g.clip();
      g.strokeStyle = 'rgba(160,30,40,0.22)'; g.lineWidth = 2;
      for (let d = -c.height; d < c.width; d += 9) { g.beginPath(); g.moveTo(d, 0); g.lineTo(d + c.height, c.height); g.stroke(); }
      g.restore();
    }
    if (f === 0) { g.fillStyle = '#2f7f96'; g.fillRect(X(L.POOL.x1), Z(L.POOL.z1), (L.POOL.x2 - L.POOL.x1) * PX, (L.POOL.z2 - L.POOL.z1) * PX); }
    // the staircase (once there's a floor to climb to): treads, and an arrow up the flight from here
    // (or, on the top floor, down the one below)
    if (L.stairsTop() && f <= L.stairsTop()) {
      const s = L.STAIRS, x1 = X(s.x1 + o), x2 = X(s.x2 + o), z1 = Z(s.z1), z2 = Z(s.z2), zm = (z1 + z2) / 2;
      g.fillStyle = '#4a3226';
      g.fillRect(x1, z1, x2 - x1, z2 - z1);
      g.strokeStyle = 'rgba(216,197,154,0.55)'; g.lineWidth = 1;
      for (let i = 2; i < s.steps; i += 2) { const x = x2 - ((x2 - x1) * i) / s.steps; g.beginPath(); g.moveTo(x, z1); g.lineTo(x, z2); g.stroke(); }
      const up = f < L.stairsTop(), tip = up ? x1 + 3 : x2 - 3, tail = up ? x2 - 3 : x1 + 3, head = up ? 5 : -5;
      g.strokeStyle = '#f3e6c4'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(tail, zm); g.lineTo(tip, zm); g.moveTo(tip + head, zm - 4); g.lineTo(tip, zm); g.lineTo(tip + head, zm + 4); g.stroke();
      if (labels) { g.fillStyle = '#f3e6c4'; g.font = 'bold 12px sans-serif'; g.fillText(!f ? 'STAIRS UP' : up ? 'STAIRS' : 'STAIRS DOWN', (x1 + x2) / 2, z2 + 9); }
    }
    g.fillStyle = '#c9c2b0';
    for (const w of L.WALLS) if (on((w.x1 + w.x2) / 2)) g.fillRect(X(w.x1), Z(w.z1), Math.max(1, (w.x2 - w.x1) * PX), Math.max(1, (w.z2 - w.z1) * PX));
    if (labels) {
      g.fillStyle = 'rgba(255,255,255,0.78)';
      g.font = 'bold 15px sans-serif';
      const seen = new Set();
      for (const z of L.ZONES) {
        if (!on(z.x1 + 1) || seen.has(z.name) || z.id === 'elev') continue;
        seen.add(z.name);
        const label = z.id === 'office' ? 'SECURITY 📺' : z.name.replace(/^(Second|Third) Floor /, '').toUpperCase();
        g.fillText(label, X((z.x1 + z.x2) / 2), Z((z.z1 + z.z2) / 2) + (z.id === 'pool' ? PX * 5 : 0));
      }
      if (f === 0) {
        g.fillText('PARKING LOT', X(0), Z(28));
        g.fillText('DUMPSTER', X(-33), Z(-1.2));
        g.fillText('FRONT DESK', X(6), Z(-9.2));
        g.fillText('SUPPLIES', X(-6.5), Z(-9.6));
        g.fillText('HEDGE MAZE', X(-53), Z(-10.5));
        g.fillText('BREAKER ⚡', X(0), Z(-32));
      } else if (f !== L.BASEMENT_F) g.fillText('ROOF', X(o), Z(-1));
      if (f === 1) g.fillText('PRESIDENTIAL', X(25 + o), Z(-20));
      if (f !== L.BASEMENT_F) g.fillText('ELEVATOR', X(o), Z(-27.5));
      else g.fillText('IRON DOOR', X(o + 8.5), Z(-22.6));
    }
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.font = `bold ${labels ? 12 : 16}px sans-serif`;
    for (const r of L.ROOMS) if (!r.pres && on(r.cx)) g.fillText(r.id, X(r.cx), Z((r.z1 + r.z2) / 2));
    return c;
  }

  drawMap(canvas, snap, ctx, big) {
    const g = canvas.getContext('2d');
    const f = L.floorOf(ctx.pos.x), o = f * L.FLOOR_DX, on = x => L.floorOf(x) === f;
    let X, Z, s;
    if (big) {
      g.drawImage(this.mapBase(f, true), 0, 0);
      s = PX;
      X = x => (x - o - MAP.x1) * PX; Z = z => (z - MAP.z1) * PX;
    } else {
      const wx = ctx.pos.x - o - MINI_M / 2, wz = ctx.pos.z - MINI_M / 2;
      g.fillStyle = '#161c22';
      g.fillRect(0, 0, MINI, MINI);
      g.drawImage(this.mapBase(f, false), (wx - MAP.x1) * PX, (wz - MAP.z1) * PX, MINI_M * PX, MINI_M * PX, 0, 0, MINI, MINI);
      s = MINI / MINI_M;
      X = x => (x - o - wx) * s; Z = z => (z - wz) * s;
    }
    const colors = { vacant: 'rgba(63,174,90,0.35)', occupied: 'rgba(58,111,216,0.28)', dirty: 'rgba(164,98,42,0.55)' };
    snap.rm.forEach((st, i) => {
      const r = L.ROOMS[i];
      if (!on(r.cx) || (r.wing && !(snap.ht?.f || L.FLAGS)[r.wing])) return;
      g.fillStyle = colors[st[0]];
      g.fillRect(X(r.x1) + 1, Z(r.z1) + 1, (r.x2 - r.x1) * s - 2, (r.z2 - r.z1) * s - 2);
      const t = TIER_CODE[snap.ht?.t?.[i]];
      if (t && t !== 'basic') { g.strokeStyle = t === 'pres' ? '#ffd166' : '#a9c1ff'; g.lineWidth = 2; g.strokeRect(X(r.x1) + 2, Z(r.z1) + 2, (r.x2 - r.x1) * s - 4, (r.z2 - r.z1) * s - 4); }
      if (st[1]) { g.fillStyle = '#ff2a2a'; g.beginPath(); g.arc(X(r.door.x), Z(r.door.z), big ? 5 : 3.5, 0, 7); g.fill(); } // DO NOT DISTURB
    });
    g.fillStyle = 'rgba(220,220,220,0.8)';
    for (const gu of snap.g) if (on(gu.x)) g.fillRect(X(gu.x) - 1.5, Z(gu.z) - 1.5, 3, 3);
    g.fillStyle = '#5fd3e6';
    for (const h of snap.hp || []) if (!h.h && on(h.x)) g.fillRect(X(h.x) - 2, Z(h.z) - 2, 4, 4);
    if (f === 0) for (const c of snap.c) { g.fillStyle = '#9aa3ad'; g.fillRect(X(c.x) - s, Z(c.z) - s, 2 * s, 2 * s); }
    g.font = `${big ? 20 : 13}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const tracked = this.trackedTask(snap);
    const elsewhere = {};
    if (snap.ph === 'shift') for (const t of snap.tk) {
      if (t.secret) continue;
      if (!on(t.x)) { const tf = L.floorOf(t.x); elsewhere[tf] = (elsewhere[tf] || 0) + 1; continue; }
      g.globalAlpha = t.bot ? 0.45 : 1;
      g.fillText(t.ic, X(t.x), Z(t.z));
      if (t === tracked) { g.strokeStyle = '#ffd166'; g.lineWidth = 2; g.beginPath(); g.arc(X(t.x), Z(t.z), big ? 15 : 10, 0, 7); g.stroke(); }
    }
    g.globalAlpha = 1;
    const now = performance.now();
    for (const p of this.pings) {
      if (!on(p.x)) continue;
      const r = (big ? 10 : 7) + Math.sin(now / 150) * 2;
      g.strokeStyle = PLAYER_COLORS[p.c] || '#fff';
      g.lineWidth = 2;
      g.beginPath(); g.arc(X(p.x), Z(p.z), r, 0, 7); g.stroke();
    }
    for (const p of snap.pl) {
      if (p.i === ctx.me) continue;
      const st = ctx.peers.get(p.i);
      if (!st || !on(st.x)) continue;
      g.fillStyle = PLAYER_COLORS[p.c];
      g.beginPath(); g.arc(X(st.x), Z(st.z), big ? 6 : 4, 0, 7); g.fill();
      g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
    }
    g.save();
    g.translate(X(ctx.pos.x), Z(ctx.pos.z));
    g.rotate(-ctx.yaw);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#000';
    g.beginPath();
    const a = big ? 10 : 7;
    g.moveTo(0, -a); g.lineTo(a * 0.7, a * 0.8); g.lineTo(0, a * 0.4); g.lineTo(-a * 0.7, a * 0.8); g.closePath();
    g.fill(); g.stroke();
    g.restore();
    // which floor this is, and jobs waiting on the others
    g.font = `bold ${big ? 18 : 11}px sans-serif`;
    g.textAlign = 'left';
    g.fillStyle = 'rgba(0,0,0,0.55)';
    const label = `${L.floorName(f)}${Object.entries(elsewhere).map(([tf, n]) => ` · ${L.floorShort(+tf)}: ${n}`).join('')}`;
    const tw = g.measureText(label).width;
    g.fillRect(big ? 8 : MINI / 2 - tw / 2 - 5, big ? 8 : 14, tw + 10, big ? 26 : 16);
    g.fillStyle = '#f3e6c4';
    g.fillText(label, big ? 13 : MINI / 2 - tw / 2, big ? 21 : 22);
  }

  // ---------- the story and the night ----------
  // A telephone line, read out at the bottom of the screen for everyone.
  call(who, tx, by, eerie) {
    const el = $('call');
    el.className = eerie ? 'eerie on' : 'on';
    el.innerHTML = `<div class="call-who">📞 ${esc(who)}${by ? ` <small>· ${esc(by)} picked up</small>` : ''}</div><div class="call-tx">“${esc(tx)}”</div>`;
    clearTimeout(this.callTimer);
    this.callTimer = setTimeout(() => el.classList.remove('on'), Math.min(15000, 4500 + tx.length * 55));
  }

  // Taken: out for the rest of the shift, watching through somebody else's eyes.
  taken(why) { this.outWhy = why; }
  setOut(out, watching) {
    const key = out ? `${this.outWhy}|${watching || ''}` : '';
    if (key === this.outKey) return;
    this.outKey = key;
    const el = $('taken');
    el.classList.toggle('on', !!out);
    const why = { mimic: 'The suitcase had teeth.', static: 'The static swallowed you.', caught: 'It caught you.' }[this.outWhy] || 'You were taken.';
    if (out) el.innerHTML = `<div>💀 ${why}</div><small>You're out for the rest of the shift.${watching ? ` Watching ${esc(watching)} · click to watch someone else` : ' There is nobody left to watch.'}</small>`;
  }

  // Mr. Harrow's letter on the break room corkboard, for the shift about to start.
  showLetter(round) {
    const lt = round >= 1 && round <= LETTERS.length ? LETTERS[round - 1] : OVERTIME_LETTER;
    this.openOverlay('letter');
    $('screen').innerHTML = `<div class="card letter"><div class="letter-head">THE LAST RESORT · EST. 1926 · FROM THE DESK OF S. HARROW</div>
      <h1>${esc(lt.title)}</h1>${lt.body.map(p => `<p>${esc(p)}</p>`).join('')}<div class="sign">— S. Harrow, Proprietor</div>
      <div class="btns"><button class="go" data-act="close">Pin it back up</button></div></div>`;
    $('screen').querySelector('[data-act=close]').onclick = () => { this.closeOverlay(); this.h.resume?.(); };
  }

  // The last page of the 1926 register, on the desk in the basement.
  showLedger() {
    this.openOverlay('letter');
    $('screen').innerHTML = `<div class="card letter ledger"><div class="letter-head">HOTEL REGISTER · 1926</div>
      ${LEDGER.map(p => `<p>${esc(p)}</p>`).join('')}
      <div class="btns"><button class="go" data-act="close">Close the book</button></div></div>`;
    $('screen').querySelector('[data-act=close]').onclick = () => { this.closeOverlay(); this.h.resume?.(); };
  }

  // The security monitors: four camera feeds (drawn by main underneath), labels and the flash buttons.
  showCCTV(cams, page, pages, live) {
    const el = $('cctv');
    el.classList.remove('hidden');
    el.innerHTML = `<div class="cctv-grid">${cams.map((c, i) => `<div class="cam ${c ? '' : 'none'} ${live ? '' : 'dead'}"><span class="cam-n">CAM ${page * 4 + i + 1}</span><span class="cam-name">${c ? esc(c.name) : '—'}</span><span class="cam-rec">● REC</span>${c ? `<span class="cam-key"><b>${i + 1}</b> flash</span>` : ''}${live ? '' : '<span class="cam-off">NO SIGNAL</span>'}<div class="cam-flash"></div></div>`).join('')}</div>
      <div class="cctv-foot">SECURITY OFFICE · cameras ${page + 1}/${pages} · <b>A</b>/<b>D</b> switch · <b>1</b>–<b>4</b> flash a camera · <b>E</b> stand up</div>`;
  }
  hideCCTV() { $('cctv').classList.add('hidden'); }
  cctvFlash(i, hit) {
    const f = $('cctv').querySelectorAll('.cam-flash')[i];
    if (!f) return;
    f.classList.toggle('hit', !!hit);
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
  }

  // Between shifts: who still has to clock out in the break room before the next shift can start.
  breakStatus(snap, ctx) {
    const b = snap.brk;
    const el = $('objective');
    if (!b || this.overlay) { el.classList.remove('on'); return; }
    const visited = new Set(b.v), mine = visited.has(ctx.me);
    const crew = snap.pl.map(p => `<span class="${visited.has(p.i) ? 'ok' : ''}">${visited.has(p.i) ? '✓' : '○'} ${esc(p.n)}</span>`).join(' ');
    const what = mine ? `Head back out into the hotel to start <b>Shift ${b.r}</b>` : 'Clock out in the <b>Break Room</b> (east end of the hallway)';
    const key = what + crew;
    el.classList.add('on');
    if (key !== this.objKey) { this.objKey = key; el.innerHTML = `<div>☕ ${what}</div><div class="crew">${crew}</div>`; }
  }

  // ---------- overlays ----------
  onPhase(ph, snap) {
    const prev = this.phase;
    this.phase = ph;
    this.closeDesk();
    if (ph === 'lobby' || ph === 'break') this.closeOverlay();
    else if (ph === 'results') this.openOverlay('results');
    else if (ph === 'gameover') this.openOverlay('gameover');
    else if (ph === 'victory') this.openOverlay('victory');
    else if (ph === 'shift') this.closeOverlay();
    if (ph === 'results' && snap.res) this.h.sound?.(snap.res.passed ? 'good' : 'bad');
    return prev;
  }

  openOverlay(kind) {
    this.overlay = kind;
    this.officeKey = '';
    const el = $('screen');
    el.classList.remove('hidden');
    el.innerHTML = '';
    this.h.onOverlay?.(true);
    if (kind === 'pause') this.renderPause();
  }

  closeOverlay() {
    this.overlay = null;
    $('screen').classList.add('hidden');
    this.h.onOverlay?.(false);
  }

  openTerminal() {
    if (this.phase === 'lobby' || this.phase === 'break') this.openOverlay('office');
  }

  refreshOffice(snap, ctx) {
    const key = JSON.stringify([snap.mo, snap.up, snap.ht, snap.st, snap.np, snap.pl.map(p => p.n + p.c), snap.ph, this.officeTab, this.upCat, (snap.hp || []).length, ctx.isHost]);
    if (key === this.officeKey) return;
    this.officeKey = key;
    const scroll = $('screen').querySelector('.tab-body')?.scrollTop || 0;
    const next = snap.rd < ROUNDS.length ? ROUNDS[snap.rd] : null;
    const D = difficulty(snap.st || {}, Math.max(1, snap.np || 1));
    const target = next ? clamp(next.threshold + D.target, 1.5, 4.8) : null;
    const tabs = [['up', '🛠️ Upgrades'], ['hotel', '🏨 Hotel'], ['diff', '⚙️ Difficulty'], ['crew', '👥 Crew']];
    const body = { up: () => this.officeUpgrades(snap), hotel: () => this.officeHotel(snap), diff: () => this.officeDiff(snap, ctx), crew: () => this.officeCrew(snap, ctx) }[this.officeTab]();
    $('screen').innerHTML = `
      <div class="card office">
        <div class="office-head">
          <div><h1>Order Terminal</h1><div class="sub">${snap.ph === 'lobby' ? 'Mr. Harrow\'s budget for the season. The previous staff... moved on.' : 'Shift survived. Mr. Harrow has topped up the budget. He reads every receipt.'}</div></div>
          <div class="cash"><small>BUDGET</small>$${snap.mo}</div>
        </div>
        <div class="next">${next ? `Next: <b>Shift ${snap.rd + 1} — ${esc(next.title)}</b> · ${esc(next.clientele)} · target <b>★ ${target.toFixed(2)}</b>` : 'Next: <b>Overtime</b> — everyone, all at once.'} <span class="diff-tag">${esc(PRESETS[snap.st?.preset]?.name || 'Custom')} · ${snap.np || 1} staff</span></div>
        <div class="tabs">${tabs.map(([id, label]) => `<button class="${this.officeTab === id ? 'on' : ''}" data-tab="${id}">${label}</button>`).join('')}</div>
        <div class="tab-body">${body}</div>
        <div class="btns">
          <button class="go" data-act="close">Done</button>
          <div class="wait">Shift ${snap.brk?.r || snap.rd + 1} starts once everyone has clocked out here and walked back out.</div>
        </div>
      </div>`;
    const root = $('screen');
    root.querySelector('.tab-body').scrollTop = scroll;
    root.querySelectorAll('[data-tab]').forEach(el => el.onclick = () => { this.officeTab = el.dataset.tab; this.h.sound?.('click'); });
    root.querySelectorAll('[data-cat]').forEach(el => el.onclick = () => { this.upCat = el.dataset.cat; this.h.sound?.('click'); });
    root.querySelectorAll('[data-up]').forEach(el => el.onclick = () => this.h.act({ a: 'buy', u: el.dataset.up }));
    root.querySelectorAll('[data-suite]').forEach(el => el.onclick = () => this.h.act({ a: 'buy', u: 'suites', room: el.dataset.suite }));
    root.querySelectorAll('[data-go]').forEach(el => el.onclick = () => { this.officeTab = el.dataset.go; });
    root.querySelectorAll('[data-preset]').forEach(el => el.onclick = () => this.h.act({ a: 'settings', s: { preset: el.dataset.preset, shiftLen: snap.st?.shiftLen } }));
    root.querySelectorAll('[data-opt]').forEach(el => el.onclick = () => {
      const opt = DIFF_OPTIONS[el.dataset.opt];
      this.h.act({ a: 'settings', s: { ...snap.st, [el.dataset.opt]: opt.choices[Number(el.dataset.val)][1] } });
    });
    root.querySelector('[data-act=close]').onclick = () => this.closeOverlay();
    const go = root.querySelector('[data-act=start]');
    if (go) go.onclick = () => this.h.act({ a: 'cmd', cmd: 'start' });
  }

  // Build once; Hotel upgrades go up five levels (each named after the perk it brings); Hired Help is
  // hired, then trained twice.
  officeUpgrades(snap) {
    const chip = (id, label) => `<button class="chip ${this.upCat === id ? 'on' : ''}" data-cat="${id}">${label}</button>`;
    const pips = (lv, n) => `<span class="pips">${Array.from({ length: n }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</span>`;
    const cards = UPGRADES.filter(u => this.upCat === 'all' || u.cat === this.upCat).map(u => {
      const lv = snap.up[u.id] || 0;
      if (u.hotelTab) {
        const suites = (snap.ht?.t || []).filter(t => t === 's').length;
        return `<div class="up" data-go="hotel"><div class="up-ic">${u.icon}</div><div class="up-body"><div class="up-name">${esc(u.name)} <small>${suites} built</small></div><div class="up-desc">${esc(u.desc)}</div></div><div class="up-buy">Hotel tab →</div></div>`;
      }
      const cost = u.cost[lv];
      const maxed = cost === undefined;
      const locked = u.req && !snap.up[u.req];
      const afford = !maxed && !locked && snap.mo >= cost;
      let name = esc(u.name), body, buy;
      if (u.cat === 'hotel') {
        name += ` ${pips(lv, u.cost.length)}`;
        const steps = u.levels.map(([n, d], i) => `<li class="${i < lv ? 'got' : i === lv ? 'ahead' : ''}"><b>${esc(n)}</b>${i === lv ? ` — ${esc(d)}` : ''}</li>`).join('');
        body = `<div class="up-desc">Every level: ${esc(u.each)}</div><ol class="up-levels">${steps}</ol>`;
        buy = maxed ? 'MAXED' : `Level ${lv + 1}<br>$${cost}`;
      } else if (u.helper) {
        name += ` ${pips(lv, u.cost.length)}<span class="badge">HIRES HELP</span>`;
        body = `<div class="up-desc">${esc(u.desc)}</div><div class="up-next">${maxed ? 'Fully trained.' : `${lv ? 'Training' : 'Hire'}: ${esc(u.levels[lv])}`}</div>`;
        buy = maxed ? 'MAXED' : `${lv ? 'Train' : 'Hire'}<br>$${cost}`;
      } else {
        body = `<div class="up-desc">${esc(u.desc)}</div>`;
        buy = maxed ? 'BUILT' : locked ? `🔒 ${esc(UPGRADE_BY_ID[u.req].name)}` : `$${cost}`;
      }
      return `<div class="up ${u.cat} ${maxed ? 'maxed' : locked ? 'locked' : afford ? '' : 'poor'}" ${afford ? `data-up="${u.id}"` : ''}>
        <div class="up-ic">${u.icon}</div>
        <div class="up-body"><div class="up-name">${name}</div>${body}</div>
        <div class="up-buy">${buy}</div></div>`;
    }).join('');
    return `<div class="chips">${chip('all', 'All')}${UPGRADE_CATS.map(c => chip(c.id, `${c.icon} ${esc(c.name)}`)).join('')}</div><div class="ups">${cards}</div>`;
  }

  // A floor plan of the hotel, storey by storey: renovate rooms into suites and build upward.
  officeHotel(snap) {
    const tiers = snap.ht?.t || [];
    const flags = snap.ht?.f || {};
    const idx = id => L.ROOMS.findIndex(r => r.id === id);
    const tile = r => {
      const i = idx(r.id);
      const open = !r.wing || flags[r.wing];
      const t = TIER_CODE[tiers[i]] || 'basic';
      const renovate = open && !r.pres && t === 'basic';
      const afford = snap.mo >= SUITE_COST;
      const sub = !open ? '' : renovate ? (afford ? `→ Suite $${SUITE_COST}` : `Suite $${SUITE_COST}`) : TIERS[t].short;
      return `<div class="rm ${t} ${open ? '' : 'closed'} ${renovate && afford ? 'can' : ''}" ${renovate && afford ? `data-suite="${r.id}"` : ''}><div class="rm-id">${r.pres ? '👑' : r.id}</div><div class="rm-t">${sub}</div></div>`;
    };
    const rowsFor = rooms => {
      const n = rooms.filter(r => r.side === 'N').sort((a, b) => a.cx - b.cx), s = rooms.filter(r => r.side === 'S').sort((a, b) => a.cx - b.cx);
      return `<div class="rm-row">${n.map(tile).join('')}</div><div class="hall-strip"></div><div class="rm-row">${s.map(tile).join('')}</div>`;
    };
    const lock = (id, name) => {
      const u = UPGRADE_BY_ID[id];
      if (flags[id]) return '';
      const locked = u.req && !snap.up[u.req];
      const afford = snap.mo >= u.cost[0];
      return `<div class="wing-lock"><div>${esc(name)}</div>${locked ? `<small>Build the ${esc(UPGRADE_BY_ID[u.req].name)} first</small>` : `<button ${afford ? `data-up="${id}"` : 'disabled'}>${afford ? 'Build' : 'Need'} · $${u.cost[0]}</button>`}</div>`;
    };
    const pres = L.ROOMS.find(r => r.pres);
    const storey = F => {
      const built = F.f === 0 || flags[F.flag];
      const rooms = L.ROOMS.filter(r => !r.pres && L.floorOf(r.cx) === F.f);
      const end = F.f === 1 ? `<div class="st-end">${tile(pres)}${built ? lock('pres', 'Presidential Suite') : ''}</div>`
        : F.f === 2 ? '<div class="st-end"><div class="rm lounge"><div class="rm-id">🔥</div><div class="rm-t">The Lounge</div></div></div>'
          : '<div class="st-end"><div class="rm staffend"><div class="rm-id">🧺</div><div class="rm-t">Staff & storage</div></div></div>';
      return `<div class="storey ${built ? '' : 'closed'}"><div class="st-name">${esc(F.name)}</div><div class="st-rooms">${rowsFor(rooms)}</div>${end}${F.f ? lock(F.flag, F.name) : ''}</div>`;
    };
    const open = L.ROOMS.filter(r => !r.wing || flags[r.wing]).length;
    const suites = tiers.filter(t => t === 's').length;
    return `
      <div class="hotel-sum"><span><b>${open}</b> rooms open</span><span><b>${suites}</b> suites</span><span>Presidential suite: <b>${flags.pres ? 'open' : 'not built'}</b></span><span class="dim">Build upward: every new storey adds 12 rooms, reached by the elevator and the stairs at the west end of the hall.</span></div>
      <div class="plan floors">${[...L.FLOORS].reverse().map(storey).join('')}</div>
      <div class="legend"><span class="lg basic"></span>Standard ×1 <span class="lg suite"></span>Suite ×${TIERS.suite.price} <span class="lg pres"></span>Presidential ×${TIERS.pres.price} · Click a standard room to renovate it. Fancy guests expect fancy rooms.</div>`;
  }

  officeDiff(snap, ctx) {
    const st = snap.st || {};
    const editable = ctx.isHost && ['lobby', 'break', 'gameover', 'victory'].includes(snap.ph);
    const np = Math.max(1, snap.np || 1);
    const D = difficulty(st, np);
    const presets = Object.entries(PRESETS).map(([id, p]) => `<button class="preset ${st.preset === id ? 'on' : ''}" ${editable ? `data-preset="${id}"` : 'disabled'}><b>${esc(p.name)}</b><small>${esc(p.desc)}</small></button>`).join('');
    const rows = Object.entries(DIFF_OPTIONS).map(([k, opt]) => {
      const segs = opt.choices.map(([label, val], i) => `<button class="${st[k] === val ? 'on' : ''}" ${editable ? `data-opt="${k}" data-val="${i}"` : 'disabled'}>${esc(label)}</button>`).join('');
      const hint = opt.hints?.[st[k]];
      return `<div class="opt"><div class="opt-l">${esc(opt.label)}${hint ? `<small>${esc(hint)}</small>` : ''}</div><div class="seg">${segs}</div></div>`;
    }).join('');
    const pct = v => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;
    return `
      <div class="presets">${presets}${st.preset === 'custom' ? '<span class="custom-tag">Custom</span>' : ''}</div>
      <div class="opts">${rows}</div>
      <div class="crew-box"><b>👥 ${esc(crewSummary(st, np))}</b>
        <div class="eff">Next shift with your crew: guests ${pct(D.count)} · patience ${pct(D.patience)} · messes ${pct(D.chores)} · horror ${pct(D.horror)} · rating target ${D.target >= 0 ? '+' : ''}${D.target.toFixed(2)}★ · kitchen ${esc(D.kitchen)}</div>
        ${editable ? '' : `<div class="dim">${ctx.isHost ? 'Settings lock while a shift is running.' : 'Only the host can change the difficulty.'}</div>`}
      </div>`;
  }

  officeCrew(snap, ctx) {
    const team = snap.pl.map(p => `<span class="tm" style="border-color:${PLAYER_COLORS[p.c]}">${esc(p.n)}${p.i === ctx.hostId ? ' ★ host' : ''}</span>`).join('');
    const counts = {};
    for (const h of snap.hp || []) counts[h.k] = (counts[h.k] || 0) + 1;
    const helpers = Object.entries(counts).map(([k, n]) => `<div class="helper"><span class="hk">${UPGRADE_BY_ID[k]?.icon || '🤖'}</span><b>${esc(HELPERS[k]?.name || k)}${n > 1 ? ` ×${n}` : ''} <small>level ${snap.up[k] || 1}/3</small></b><span>${esc(UPGRADE_BY_ID[k]?.desc || '')}</span></div>`).join('');
    return `
      <div class="team">Staff on shift: ${team}${ctx.code ? ` <span class="code">Room code: <b>${esc(ctx.code)}</b></span>` : ''}</div>
      <div class="crew-box">More staff means a busier hotel: ${esc(crewSummary(snap.st || {}, Math.max(1, snap.np || 1)))}. Change how much this matters under Difficulty → Crew scaling.</div>
      <h3>Hired help</h3>
      ${helpers ? `<div class="helpers">${helpers}</div>` : '<div class="dim">Nobody yet. Upgrades marked HIRES HELP put a robot or a person on the payroll; you\'ll see them working around the hotel.</div>'}`;
  }

  refreshWaiting(snap, ctx) {
    const r = snap.res;
    const key = JSON.stringify([this.overlay, r?.round, r?.avg, ctx.isHost, snap.mo]);
    if (key === this.officeKey || !r) return;
    this.officeKey = key;
    const surveys = r.surveys.map(s => `<div class="rs ${s.stars >= 4 ? 'good' : s.stars <= 2 ? 'bad' : ''}"><span class="rs-st">${starHtml(s.stars)}</span><span class="rs-tx">“${esc(s.text)}”</span><span class="rs-nm">${esc(s.name)}${s.tier && s.tier !== 'basic' ? ` · ${TIERS[s.tier].icon}` : ''}${s.w > 1 ? ' · ×2' : ''}</span></div>`).join('');
    const st = r.stats || {};
    const chips = [['🛎️', 'guests', st.guests], ['🚫', 'turned away', st.caught], ['😱', 'fled', st.fled], ['⚰️', 'deaths', st.deaths], ['🤖', 'helper jobs', st.helperJobs], ['🚷', 'escorts', st.escorts]]
      .filter(([, , v]) => v).map(([ic, label, v]) => `<span class="chip stat">${ic} ${v} ${label}</span>`).join('');
    let head, btns;
    if (this.overlay === 'results') {
      head = `<h1>${r.passed ? 'Shift survived' : 'Shift failed'}</h1><div class="sub">Shift ${r.round}: ${esc(r.title)}</div>
        <div class="bigstars">${starHtml(0, true)}<span id="res-num">0.00</span></div>
        <div class="verdict ${r.passed ? 'pass' : 'fail'}">${r.passed ? 'PASSED' : 'BELOW TARGET'} <small>needed ★ ${r.threshold.toFixed(2)}</small></div>
        <div class="money-row">Room revenue & tips: <b>${r.revenue}</b>${r.passed ? ` · Mr. Harrow's bonus: <b>${r.bonus}</b>` : ''}</div>
        <div class="chips center">${chips}</div>`;
      btns = ctx.isHost ? '<button class="go" data-cmd="continue">Continue</button>' : '<div class="wait">Waiting for the host…</div>';
    } else if (this.overlay === 'gameover') {
      head = r.doom ? `<h1>Checkout is forever</h1><div class="sub">Dawn came and the iron door was still open. The Last Resort has a new tenant, and it has room for all of you.</div><div class="chips center">${chips}</div>`
        : r.wiped ? `<h1>Nobody clocked out</h1><div class="sub">Every one of you was taken before dawn. Mr. Harrow will be hiring again.</div><div class="chips center">${chips}</div>`
          : `<h1>Let go</h1><div class="sub">The rating fell to ★ ${r.avg.toFixed(2)} (needed ★ ${r.threshold.toFixed(2)}). Mr. Harrow has found new staff. Something has to keep the rooms full.</div><div class="chips center">${chips}</div>`;
      btns = (ctx.isHost ? '<button class="go" data-cmd="retry">Retry the shift</button><button class="ghost" data-cmd="newgame">New game</button>' : '<div class="wait">Waiting for the host…</div>') + '<button class="ghost" data-act="leave">Main menu</button>';
    } else {
      head = `<h1>You survived The Last Resort</h1>${EPILOGUE.map(t => `<div class="sub">${esc(t)}</div>`).join('')}<div class="sub">— S. Harrow</div><div class="bigstars">${starHtml(r.avg)}<span>${r.avg.toFixed(2)}</span></div>`;
      btns = (ctx.isHost ? '<button class="go" data-cmd="endless">Keep going: Overtime</button><button class="ghost" data-cmd="newgame">New game</button>' : '<div class="wait">Waiting for the host…</div>') + '<button class="ghost" data-act="leave">Main menu</button>';
    }
    $('screen').innerHTML = `<div class="card results">${head}<div class="surveys">${surveys || '<div class="rs">No reviews.</div>'}</div><div class="btns">${btns}</div></div>`;
    $('screen').querySelectorAll('[data-cmd]').forEach(el => el.onclick = () => this.h.act({ a: 'cmd', cmd: el.dataset.cmd }));
    const lv = $('screen').querySelector('[data-act=leave]');
    if (lv) lv.onclick = () => this.h.leave();
    if (this.overlay === 'results') { // count the stars up
      const fill = $('screen').querySelector('.bigstars .starfill'), num = $('res-num');
      const t0 = performance.now();
      const tick = now => {
        const k = Math.min(1, (now - t0) / 1400);
        const v = r.avg * (1 - (1 - k) ** 3);
        if (fill) fill.style.width = `${(v / 5) * 100}%`;
        if (num) num.textContent = v.toFixed(2);
        if (k < 1 && this.overlay === 'results') requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  renderPause() {
    const s = this.h.settings();
    $('screen').innerHTML = `<div class="card pause"><h1>Paused</h1><div class="sub">${s.online ? 'The hotel keeps running while you are away!' : 'Time is frozen. The guests are not amused.'}</div>
      <label>Mouse sensitivity <input type="range" id="set-sens" min="0.2" max="3" step="0.05" value="${s.sens}"></label>
      <label>Field of view <input type="range" id="set-fov" min="60" max="100" step="1" value="${s.fov}"><span id="fov-v">${s.fov}°</span></label>
      <label>Volume <input type="range" id="set-vol" min="0" max="1" step="0.05" value="${s.vol}"></label>
      <label>Graphics <select id="set-q"><option value="0.75">Fast</option><option value="1">Balanced</option><option value="1.5">Sharp</option></select></label>
      <label class="check"><input type="checkbox" id="set-inv" ${s.invert ? 'checked' : ''}> Invert mouse Y</label>
      <label class="check"><input type="checkbox" id="set-grain" ${s.grain !== false ? 'checked' : ''}> Film grain</label>
      <label class="check"><input type="checkbox" id="set-calm" ${s.calm ? 'checked' : ''}> Reduce flashing lights</label>
      <div class="controls">${CONTROLS}</div>
      <div class="btns"><button class="go" id="btn-resume">Resume</button><button class="ghost" id="btn-leave">Leave game</button></div></div>`;
    $('set-q').value = String(s.quality);
    $('set-sens').oninput = e => this.h.setting('sens', +e.target.value);
    $('set-fov').oninput = e => { this.h.setting('fov', +e.target.value); $('fov-v').textContent = `${e.target.value}°`; };
    $('set-vol').oninput = e => this.h.setting('vol', +e.target.value);
    $('set-q').onchange = e => this.h.setting('quality', +e.target.value);
    $('set-inv').onchange = e => this.h.setting('invert', e.target.checked);
    $('set-grain').onchange = e => this.h.setting('grain', e.target.checked);
    $('set-calm').onchange = e => this.h.setting('calm', e.target.checked);
    $('btn-resume').onclick = () => { this.closeOverlay(); this.h.resume(); };
    $('btn-leave').onclick = () => this.h.leave();
  }
}

export const CONTROLS = `<div><b>WASD</b> move · <b>Shift</b> sprint · <b>Space</b> jump</div>
<div><b>E</b> / <b>Left click</b> interact (hold for chores) · <b>Q</b> drop · <b>Right click</b> throw</div>
<div><b>F</b> flashlight · <b>G</b> ping a spot · <b>R</b> next waypoint · <b>M</b> map · <b>T</b> chat · <b>Esc</b> pause</div>
<div>At the desk: <b>1</b> Standard · <b>2</b> Suite · <b>3</b> Presidential · <b>X</b> turn away (check-out: <b>1</b>)</div>`;

function phaseLabel(H) {
  if (H < 21) return 'Check-in rush';
  if (H < 23) return 'Evening';
  if (H < 29.5) return 'The dead of night';
  if (H < 30) return 'Dawn';
  if (H < 33.5) return 'Breakfast';
  return 'Checkout';
}

function occupancy(snap) {
  const flags = snap.ht?.f || {};
  let open = 0, occ = 0, dirty = 0, ready = 0;
  snap.rm.forEach((st, i) => {
    const r = L.ROOMS[i];
    if (r.wing && !flags[r.wing]) return;
    open++;
    if (st[0] === 'occupied') occ++; else if (st[0] === 'dirty') dirty++; else ready++;
  });
  return `<span title="occupied">🛏️ ${occ}/${open}</span><span class="${ready ? '' : 'bad'}" title="ready">✅ ${ready}</span>${dirty ? `<span class="warn" title="dirty">🧹 ${dirty}</span>` : ''}${snap.q ? `<span title="waiting">🛎️ ${snap.q}</span>` : ''}`;
}

export function starHtml(v, anim = false) {
  return `<span class="starbar"><span class="starfill" style="width:${anim ? 0 : (v / 5) * 100}%"></span></span>`;
}

// Tileable film-grain noise as a data URL.
function noiseURL() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

// Cartoon portrait for the check-in card, from the same look data as the 3D model.
export function drawPortrait(canvas, kind, seed, wrong) {
  const L = makeLook(kind, seed, !!wrong);
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  g.fillStyle = '#e8dfc8';
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(0,0,0,0.06)';
  for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 2);
  g.fillStyle = L.robe || L.coat || L.shirt;
  g.fillRect(W * 0.12, H * 0.7, W * 0.76, H * 0.32);
  if (L.tie) { g.fillStyle = L.tie; g.fillRect(W * 0.47, H * 0.7, W * 0.06, H * 0.3); }
  const cx = W / 2, cy = H * 0.42;
  const hw = L.bigHead ? W * 0.3 : W * 0.24, hh = L.bigHead ? H * 0.3 : H * 0.24;
  g.globalAlpha = L.alpha;
  g.fillStyle = L.skin;
  if (L.bigHead) { g.beginPath(); g.ellipse(cx, cy, hw, hh, 0, 0, 7); g.fill(); }
  else g.fillRect(cx - hw, cy - hh, hw * 2, hh * 2);
  g.fillStyle = L.hair;
  if (L.hairStyle === 1 || L.hairStyle === 3) g.fillRect(cx - hw - 2, cy - hh - 6, hw * 2 + 4, 14);
  if (L.hairStyle === 2) { g.fillRect(cx - hw - 4, cy - hh - 6, hw * 2 + 8, 14); g.fillRect(cx - hw - 6, cy - hh, 8, hh * 1.6); g.fillRect(cx + hw - 2, cy - hh, 8, hh * 1.6); }
  if (L.hairStyle === 3) g.fillRect(cx - 10, cy - hh - 18, 20, 14);
  if (L.hairStyle === 4) g.fillRect(cx - 6, cy - hh - 14, 12, 18);
  const eye = L.glow || L.eyes;
  g.fillStyle = eye;
  if (L.bigHead) { for (const s of [-1, 1]) { g.save(); g.translate(cx + s * hw * 0.4, cy); g.rotate(s * 0.45); g.beginPath(); g.ellipse(0, 0, 8, 13, 0, 0, 7); g.fillStyle = '#050505'; g.fill(); g.restore(); } }
  else for (const s of [-1, 1]) g.fillRect(cx + s * hw * 0.45 - 4, cy - 4, wrong ? 10 : 8, wrong ? 10 : 8);
  if (L.glasses) { g.fillStyle = L.glasses === 2 ? '#050505' : 'rgba(30,30,30,0.9)'; g.fillRect(cx - hw * 0.8, cy - 6, hw * 1.6, L.glasses === 2 ? 10 : 3); }
  g.fillStyle = '#4a1f1f';
  if (L.mouth === 'wide') { g.fillStyle = '#1a0505'; g.fillRect(cx - hw * 0.75, cy + hh * 0.45, hw * 1.5, 7); g.fillStyle = '#eee'; g.fillRect(cx - hw * 0.65, cy + hh * 0.45, hw * 1.3, 3); }
  else if (!L.bigHead) g.fillRect(cx - 9, cy + hh * 0.5, 18, 3);
  if (L.antenna) { g.strokeStyle = L.skin; g.lineWidth = 3; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 12, cy - hh); g.lineTo(cx + s * 20, cy - hh - 22); g.stroke(); g.fillStyle = '#c6ff4f'; g.beginPath(); g.arc(cx + s * 20, cy - hh - 24, 4, 0, 7); g.fill(); } }
  if (L.phone) { g.fillStyle = '#bde0fe'; g.fillRect(W * 0.72, H * 0.6, 14, 24); g.strokeStyle = '#222'; g.lineWidth = 2; g.strokeRect(W * 0.72, H * 0.6, 14, 24); }
  g.fillStyle = L.hatColor;
  if (L.hat === 'cap' || L.hat === 'bellhop' || L.hat === 'beanie') g.fillRect(cx - hw, cy - hh - 12, hw * 2, 14);
  if (L.hat === 'beanie') { g.beginPath(); g.arc(cx, cy - hh - 16, 7, 0, 7); g.fill(); }
  if (L.scarf) { g.fillStyle = L.scarf; g.fillRect(W * 0.22, H * 0.68, W * 0.56, 10); g.fillRect(W * 0.58, H * 0.7, 10, 24); g.fillStyle = L.hatColor; }
  if (L.hat === 'fedora' || L.hat === 'sunhat') { g.fillRect(cx - hw * 1.4, cy - hh - 4, hw * 2.8, 6); g.fillRect(cx - hw * 0.8, cy - hh - 22, hw * 1.6, 20); }
  if (L.hat === 'hood') { g.fillRect(cx - hw - 8, cy - hh - 10, 10, hh * 2.4); g.fillRect(cx + hw - 2, cy - hh - 10, 10, hh * 2.4); g.fillRect(cx - hw - 8, cy - hh - 12, hw * 2 + 16, 14); }
  if (L.hat === 'mitre') g.fillRect(cx - hw * 0.7, cy - hh - 36, hw * 1.4, 36);
  if (L.hat === 'party') { g.beginPath(); g.moveTo(cx - 12, cy - hh); g.lineTo(cx + 12, cy - hh); g.lineTo(cx + 2, cy - hh - 30); g.fill(); }
  g.globalAlpha = 1;
  g.strokeStyle = '#3a2a1a';
  g.lineWidth = 4;
  g.strokeRect(2, 2, W - 4, H - 4);
}
