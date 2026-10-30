// Turns snapshots into moving meshes: guests, cars, items, messes, monsters, the UFO and teammates.
import * as THREE from 'three';
import * as L from './layout.js';
import { buildCharacter, buildStaff, animateCharacter, buildItem, buildMess, buildCar, buildPorter, buildShade, buildRaccoon, animateRaccoon, buildUfo, disposeModel, buildHelper, animateHelper } from './models.js';
import { makeLook } from './looks.js';
import { emojiTexture, bubbleTexture, nameTexture, labelTexture } from './textures.js';
import { PLAYER_COLORS, ITEMS, HELPERS } from './content.js';
import { angleLerp } from './util.js';

const NPC_DOOR = 2.1; // squared distance at which a guest, robot or monster opens a door

function makeSprite(texture, w, h, depthTest = true) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest, transparent: true }));
  s.scale.set(w, h, 1);
  s.renderOrder = depthTest ? 0 : 10;
  return s;
}

function disposeTree(obj) {
  obj.traverse(o => { if (o.isSprite) o.material.dispose(); });
}

export class View {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.guests = new Map();
    this.cars = new Map();
    this.items = new Map();
    this.messes = new Map();
    this.monsters = new Map();
    this.peers = new Map();
    this.helpers = new Map();
    this.ufo = null;
    this.time = 0;
    this.spots = [];
    for (let i = 0; i < 4; i++) {
      const s = new THREE.SpotLight('#fff1d0', 0, 24, 0.42, 0.5, 1.3);
      scene.add(s, s.target);
      this.spots.push(s);
    }
    // The Night Guard's flashlight only joins the scene once a guard is hired.
    this.guardSpot = new THREE.SpotLight('#e8f0ff', 0, 20, 0.38, 0.5, 1.3);
    this.guardSpotOn = false;
    this.viewModel = new THREE.Group();
    camera.add(this.viewModel);
    this.vmItem = null;
    this.vmKey = '';
    this.roomIcons = L.ROOMS.map(r => {
      const s = makeSprite(emojiTexture('🛎️'), 0.55, 0.55);
      const w = r.pres ? L.toWorld(r.door.x - 0.45, r.door.z) : L.toWorld(r.door.x, r.wallZ - r.s * 0.4);
      s.position.set(w.x, w.y + 2.65, w.z);
      s.userData.y = w.y + 2.65;
      s.visible = false;
      scene.add(s);
      return { s, key: '' };
    });
    this.twins = [];
  }

  // Positions (in layout space, like the doors) of everyone who can open doors this frame, each with
  // how close (squared) they must come. Teammates swing doors open from further away than NPCs, who
  // walk slower: a guest or robot waiting in the hallway shouldn't hold a door open.
  doorOpeners(me) {
    const out = [];
    for (const o of this.guests.values()) { o.sim.r2 = NPC_DOOR; out.push(o.sim); }
    for (const o of this.peers.values()) if (o.mesh.visible) out.push(o.sim);
    for (const o of this.monsters.values()) { o.sim.r2 = NPC_DOOR; out.push(o.sim); }
    for (const o of this.helpers.values()) if (o.mesh.visible && !o.small) { o.sim.r2 = NPC_DOOR; out.push(o.sim); }
    if (me) out.push(me);
    return out;
  }

  // Two pale little girls at the end of a hallway. They stand there, and then they don't.
  addTwins(x, z) {
    const w = L.toWorld(x, z);
    const group = new THREE.Group();
    for (const s of [-1, 1]) {
      const look = { ...makeLook('kid', 26), skin: '#efe6e0', shirt: '#9fc4e8', dress: true, hair: '#4a3020', hairStyle: 2, hat: null, scale: 0.68, shorts: false, eyes: '#101010', mouth: null, scarf: null };
      const m = buildCharacter('kid', 26, { look });
      m.position.set(s * 0.32, 0, 0);
      group.add(m);
    }
    group.position.set(w.x, w.y, w.z);
    this.scene.add(group);
    this.twins.push({ group, t: 0, life: 6 });
  }

  updateTwins(dt, ctx) {
    for (let i = this.twins.length - 1; i >= 0; i--) {
      const o = this.twins[i];
      o.t += dt;
      const cam = this.camera.getWorldPosition(this.tmpV || (this.tmpV = new THREE.Vector3()));
      o.group.rotation.y = Math.atan2(cam.x - o.group.position.x, cam.z - o.group.position.z);
      // they vanish early if you get close
      const near = (cam.x - o.group.position.x) ** 2 + (cam.z - o.group.position.z) ** 2 < 16;
      if (o.t > o.life || near) { this.scene.remove(o.group); disposeModel(o.group); this.twins.splice(i, 1); }
    }
  }

  update(snap, dt, ctx) {
    this.time += dt;
    if (!snap) return;
    this.syncGuests(snap.g, dt);
    this.syncPeers(snap.pl, ctx, dt);
    this.syncHelpers(snap.hp || [], dt, ctx, snap.it);
    this.syncCars(snap.c, dt, ctx.localCar);
    this.syncItems(snap.it, ctx.me, dt);
    this.syncMesses(snap.m, dt);
    this.syncMonsters(snap.mn, dt);
    this.syncUfo(snap.ufo, dt);
    snap.rm.forEach((st, i) => {
      const ic = this.roomIcons[i];
      const key = snap.ph === 'shift' ? st[4] : '';
      if (key !== ic.key) {
        ic.key = key;
        ic.s.visible = !!key;
        if (key) ic.s.material.map = emojiTexture(key);
      }
      if (ic.s.visible) ic.s.position.y = ic.s.userData.y + Math.sin(this.time * 3 + i) * 0.06;
    });
    this.updateTwins(dt, ctx);
    const me = snap.pl.find(p => p.i === ctx.me);
    this.updateViewModel(me && me.dn <= 0 && !ctx.driving ? me : null, dt, ctx);
  }

  // ---------- guests ----------
  syncGuests(list, dt) {
    const seen = new Set();
    const k = Math.min(1, dt * 10);
    for (const g of list) {
      seen.add(g.i);
      let o = this.guests.get(g.i);
      if (!o) {
        const mesh = buildCharacter(g.k, g.s, { wrong: !!g.w });
        mesh.rotation.order = 'YXZ';
        mesh.rotation.y = g.r;
        this.scene.add(mesh);
        o = { mesh, sim: { x: g.x, y: g.y, z: g.z }, icon: null, iconKey: '', bubble: null, bubbleKey: '', phase: Math.random() * 10, ghost: g.k === 'ghost' };
        this.guests.set(g.i, o);
      }
      const m = o.mesh;
      const s = o.sim;
      if (Math.abs(s.x - g.x) > 4 || Math.abs(s.z - g.z) > 4) { s.x = g.x; s.y = g.y; s.z = g.z; }
      else { s.x += (g.x - s.x) * k; s.z += (g.z - s.z) * k; s.y += (g.y - s.y) * k; }
      const w = L.toWorld(s.x, s.z, s.y);
      m.position.set(w.x, w.y, w.z);
      if (o.ghost) m.position.y = w.y + 0.15 + Math.sin(this.time * 2 + o.phase) * 0.08;
      if (g.p === 'lie') { m.rotation.x = -Math.PI / 2; m.rotation.y = g.r; }
      else { m.rotation.x = 0; m.rotation.y = angleLerp(m.rotation.y, g.r, k); }
      animateCharacter(m, g.a, g.p, this.time + o.phase);
      const top = g.p === 'lie' ? 0.9 : g.p === 'sit' ? 1.65 : g.p === 'swim' ? 1.9 : 2.25;
      const h = top * m.scale.y;
      if (g.ic !== o.iconKey) {
        o.iconKey = g.ic;
        if (o.icon) { this.scene.remove(o.icon); o.icon.material.dispose(); o.icon = null; }
        if (g.ic) { o.icon = makeSprite(emojiTexture(g.ic), 0.5, 0.5); this.scene.add(o.icon); }
      }
      if (o.icon) o.icon.position.set(m.position.x, m.position.y + h + 0.1 + Math.sin(this.time * 4 + o.phase) * 0.04, m.position.z);
      if (g.sy !== o.bubbleKey) {
        o.bubbleKey = g.sy;
        if (o.bubble) { this.scene.remove(o.bubble); o.bubble.material.dispose(); o.bubble = null; }
        if (g.sy) { const b = bubbleTexture(g.sy); o.bubble = makeSprite(b.texture, 0.42 * b.aspect, 0.42); this.scene.add(o.bubble); }
      }
      if (o.bubble) o.bubble.position.set(m.position.x, m.position.y + h + (o.icon ? 0.62 : 0.3), m.position.z);
    }
    for (const [id, o] of this.guests) if (!seen.has(id)) {
      this.scene.remove(o.mesh);
      disposeModel(o.mesh);
      if (o.icon) this.scene.remove(o.icon);
      if (o.bubble) this.scene.remove(o.bubble);
      this.guests.delete(id);
    }
  }

  // ---------- teammates ----------
  syncPeers(players, ctx, dt) {
    const seen = new Set();
    let spot = 0;
    const k = Math.min(1, dt * 12);
    for (const p of players) {
      if (p.i === ctx.me) continue;
      const st = ctx.peers.get(p.i);
      if (!st) continue;
      seen.add(p.i);
      let o = this.peers.get(p.i);
      if (!o || o.color !== p.c) {
        if (o) this.removePeer(p.i);
        const mesh = buildStaff(PLAYER_COLORS[p.c], p.i * 31 + 7);
        mesh.rotation.order = 'YXZ';
        this.scene.add(mesh);
        const nt = nameTexture(p.n, PLAYER_COLORS[p.c]);
        const tag = makeSprite(nt.texture, 0.32 * nt.aspect, 0.32, false);
        this.scene.add(tag);
        o = { mesh, tag, color: p.c, name: p.n, sim: { x: st.x, y: st.y, z: st.z }, speed: 0 };
        this.peers.set(p.i, o);
      }
      const m = o.mesh;
      const sp = o.sim, prevX = sp.x, prevZ = sp.z;
      if (Math.abs(prevX - st.x) > 6 || Math.abs(prevZ - st.z) > 6) { sp.x = st.x; sp.y = st.y; sp.z = st.z; }
      else { sp.x += (st.x - prevX) * k; sp.z += (st.z - prevZ) * k; sp.y += (st.y - sp.y) * k; }
      const pw = L.toWorld(sp.x, sp.z, sp.y);
      m.position.set(pw.x, pw.y, pw.z);
      const v = Math.min(12, Math.hypot(sp.x - prevX, sp.z - prevZ) / Math.max(dt, 1e-3));
      o.speed += (v - o.speed) * Math.min(1, dt * 8);
      const driving = !!p.car;
      m.visible = !driving;
      o.tag.visible = !driving;
      if (p.dn > 0) { m.rotation.x = -Math.PI / 2; m.position.y = pw.y + 0.2; }
      else { m.rotation.x = 0; m.rotation.y = angleLerp(m.rotation.y, st.yaw + Math.PI, k); }
      m.userData.carrying = !!p.h;
      animateCharacter(m, o.speed > 5.5 ? 'run' : o.speed > 0.4 ? 'walk' : 'idle', null, this.time);
      o.tag.position.set(m.position.x, m.position.y + 2.45, m.position.z);
      o.tag.material.opacity = p.dn > 0 ? 0.4 : 1;
      if (st.fl && !driving && p.dn <= 0 && spot < this.spots.length) {
        const s = this.spots[spot++];
        s.intensity = ctx.flashPower || 40;
        s.position.set(m.position.x, m.position.y + 1.6, m.position.z);
        const cp = Math.cos(st.pitch);
        s.target.position.set(s.position.x - Math.sin(st.yaw) * cp * 5, s.position.y + Math.sin(st.pitch) * 5, s.position.z - Math.cos(st.yaw) * cp * 5);
      }
    }
    for (; spot < this.spots.length; spot++) this.spots[spot].intensity = 0;
    for (const id of [...this.peers.keys()]) if (!seen.has(id)) this.removePeer(id);
  }

  removePeer(id) {
    const o = this.peers.get(id);
    if (!o) return;
    this.scene.remove(o.mesh, o.tag);
    disposeModel(o.mesh);
    disposeTree(o.tag);
    this.peers.delete(id);
  }

  // ---------- helpers (bought staff & robots) ----------
  // Each shows a name tag and, when you're close, what it's busy with.
  syncHelpers(list, dt, ctx, items) {
    const seen = new Set();
    const k = Math.min(1, dt * 10);
    const me = ctx.myPos;
    const holds = new Set();
    for (const it of items) if (it.h < 0) holds.add(-it.h);
    const hasGuard = list.some(h => h.k === 'guard');
    if (hasGuard !== this.guardSpotOn) {
      this.guardSpotOn = hasGuard;
      if (hasGuard) this.scene.add(this.guardSpot, this.guardSpot.target);
      else this.scene.remove(this.guardSpot, this.guardSpot.target);
    }
    let guardLit = false;
    for (const h of list) {
      seen.add(h.i);
      let o = this.helpers.get(h.i);
      if (!o) {
        const mesh = buildHelper(h.k);
        mesh.rotation.order = 'YXZ';
        mesh.rotation.y = h.r;
        this.scene.add(mesh);
        const small = h.k === 'roomba' || h.k === 'skimmer';
        const lt = labelTexture(HELPERS[h.k]?.name || h.k, { color: '#f3e6c4', bg: 'rgba(20,12,10,0.7)', font: '600 34px "Trebuchet MS", sans-serif', h: 52 });
        const tag = makeSprite(lt.texture, 0.24 * lt.aspect, 0.24);
        this.scene.add(tag);
        o = { mesh, tag, small, sim: { x: h.x, z: h.z }, job: null, jobKey: '', bubble: null, bubbleKey: '', phase: Math.random() * 10, height: small ? 0.55 : h.k === 'bellhop' || h.k === 'chef' ? 1.75 : h.k === 'busboy' || h.k === 'towelbot' ? 1.45 : 2.2 };
        this.helpers.set(h.i, o);
      }
      const m = o.mesh;
      const y = h.y || 0;
      const hs = o.sim;
      if (Math.abs(hs.x - h.x) > 4 || Math.abs(hs.z - h.z) > 4) { hs.x = h.x; hs.z = h.z; hs.y = y; }
      else { hs.x += (h.x - hs.x) * k; hs.z += (h.z - hs.z) * k; hs.y += (y - (hs.y ?? y)) * k; }
      const hw = L.toWorld(hs.x, hs.z, hs.y);
      m.position.set(hw.x, hw.y, hw.z);
      m.rotation.y = angleLerp(m.rotation.y, h.r, k);
      m.visible = !h.h;
      m.userData.carrying = !!h.d || holds.has(h.i);
      animateHelper(m, h.a, this.time + o.phase);
      const top = m.position.y + o.height;
      const near = me && (me.x - hs.x) ** 2 + (me.z - hs.z) ** 2 < 100;
      o.tag.visible = m.visible && !!near;
      o.tag.position.set(m.position.x, top + 0.15, m.position.z);
      // what it's doing (only up close, so the halls aren't full of text)
      const say = h.s || (near && h.j ? `${h.j}…` : '');
      if (say !== o.bubbleKey) {
        o.bubbleKey = say;
        if (o.bubble) { this.scene.remove(o.bubble); o.bubble.material.dispose(); o.bubble = null; }
        if (say) { const b = bubbleTexture(say); o.bubble = makeSprite(b.texture, 0.34 * b.aspect, 0.34); this.scene.add(o.bubble); }
      }
      if (o.bubble) { o.bubble.visible = m.visible; o.bubble.position.set(m.position.x, top + 0.5, m.position.z); }
      if (h.d && !o.dishes) { o.dishes = buildItem('dishes'); this.scene.add(o.dishes); }
      if (o.dishes) {
        o.dishes.visible = !!h.d && m.visible;
        if (o.dishes.visible) { m.userData.hand.updateWorldMatrix(true, false); m.userData.hand.getWorldPosition(o.dishes.position); o.dishes.rotation.y = m.rotation.y; }
      }
      if (h.f && m.visible && !guardLit) {
        guardLit = true;
        const s = this.guardSpot;
        s.intensity = 45;
        s.position.set(m.position.x, m.position.y + 1.5, m.position.z);
        s.target.position.set(m.position.x + Math.sin(m.rotation.y) * 6, m.position.y + 0.4, m.position.z + Math.cos(m.rotation.y) * 6);
      }
    }
    if (!guardLit) this.guardSpot.intensity = 0;
    for (const [id, o] of this.helpers) if (!seen.has(id)) {
      this.scene.remove(o.mesh, o.tag);
      if (o.bubble) this.scene.remove(o.bubble);
      if (o.dishes) this.scene.remove(o.dishes);
      disposeModel(o.mesh);
      disposeTree(o.tag);
      this.helpers.delete(id);
    }
  }

  // ---------- cars ----------
  syncCars(list, dt, localCar) {
    const seen = new Set();
    const k = Math.min(1, dt * 10);
    for (const c of list) {
      seen.add(c.i);
      let o = this.cars.get(c.i);
      if (!o) {
        const mesh = buildCar(c.m, c.cl);
        mesh.position.set(c.x, 0, c.z);
        mesh.rotation.y = c.r;
        this.scene.add(mesh);
        o = { mesh, data: c };
        this.cars.set(c.i, o);
      }
      o.data = c;
      const m = o.mesh;
      if (localCar && localCar.id === c.i) { m.position.x = localCar.x; m.position.z = localCar.z; m.rotation.y = localCar.ry; }
      else if (Math.abs(m.position.x - c.x) > 8 || Math.abs(m.position.z - c.z) > 8) { m.position.set(c.x, 0, c.z); m.rotation.y = c.r; }
      else {
        m.position.x += (c.x - m.position.x) * k;
        m.position.z += (c.z - m.position.z) * k;
        m.rotation.y = angleLerp(m.rotation.y, c.r, k);
      }
      m.position.y = c.lf * 11;
      m.rotation.z = c.lf > 0 ? Math.sin(this.time * 3) * 0.15 * c.lf : 0;
    }
    for (const [id, o] of this.cars) if (!seen.has(id)) { this.scene.remove(o.mesh); this.cars.delete(id); }
  }

  // ---------- items ----------
  syncItems(list, me, dt) {
    const seen = new Set();
    const k = Math.min(1, dt * 12);
    for (const it of list) {
      if (it.h === me) continue;
      seen.add(it.i);
      let o = this.items.get(it.i);
      const key = it.c ? `${it.t}:${it.c.join(',')}` : it.t;
      if (o && o.key !== key) { this.scene.remove(o.mesh); this.items.delete(it.i); o = null; }
      if (!o) {
        const mesh = buildItem(it.t, { color: it.cl, c: it.c });
        const iw = L.toWorld(it.x, it.z, it.y);
        mesh.position.set(iw.x, iw.y, iw.z);
        this.scene.add(mesh);
        o = { mesh, t: it.t, key, data: it };
        this.items.set(it.i, o);
      }
      o.data = it;
      const m = o.mesh;
      const tool = ITEMS[it.t]?.tool;
      if (it.h) {
        // carried by a teammate (positive id) or by a helper (negative id)
        const who = it.h > 0 ? this.peers.get(it.h) : this.helpers.get(-it.h);
        if (who && who.mesh.visible && who.mesh.userData.hand) {
          m.visible = true;
          who.mesh.userData.hand.updateWorldMatrix(true, false);
          who.mesh.userData.hand.getWorldPosition(m.position);
          m.rotation.set(tool ? -0.9 : 0, who.mesh.rotation.y, 0, 'YXZ');
          if (it.t === 'luggage' || it.t === 'body') m.position.y = Math.max(0.05, m.position.y - 0.7);
        } else m.visible = false;
        continue;
      }
      m.visible = true;
      const tw = L.toWorld(it.x, it.z, it.y);
      if ((m.position.x - tw.x) ** 2 + (m.position.z - tw.z) ** 2 + (m.position.y - tw.y) ** 2 > 9) m.position.set(tw.x, tw.y, tw.z);
      m.position.x += (tw.x - m.position.x) * k;
      m.position.z += (tw.z - m.position.z) * k;
      m.position.y += (tw.y - m.position.y) * k;
      if (tool) {
        if (it.hm) m.rotation.set(-0.12, 0, 0, 'YXZ');
        else { m.rotation.set(Math.PI / 2, it.r, 0, 'YXZ'); m.position.y = tw.y + 0.06; }
      } else m.rotation.set(0, it.r, 0, 'YXZ');
    }
    for (const [id, o] of this.items) if (!seen.has(id)) { this.scene.remove(o.mesh); this.items.delete(id); }
  }

  updateViewModel(me, dt, ctx) {
    const key = me && me.h ? `${me.h}${me.hc ? ':' + me.hc.join(',') : ''}` : '';
    if (key !== this.vmKey) {
      this.vmKey = key;
      if (this.vmItem) {
        this.viewModel.remove(this.vmItem);
        this.vmItem.traverse(o => { if (o.isMesh) o.material.dispose(); });
      }
      this.vmItem = null;
      if (key) {
        const color = ctx.heldColor;
        const it = buildItem(me.h, { color, c: me.hc });
        it.traverse(o => {
          if (!o.isMesh) return;
          o.material = o.material.clone();
          o.material.depthTest = false;
          o.material.depthWrite = false;
          o.renderOrder = 20;
        });
        const P = {
          mop: [0.34, -0.42, -0.62, -1.15, 0.2], net: [0.34, -0.46, -0.62, -1.25, 0.2], plunger: [0.32, -0.36, -0.55, -1.0, 0.2],
          luggage: [0.36, -0.95, -0.62, 0, 0.3], body: [0.0, -0.75, -1.05, 0, 1.4], towels: [0.26, -0.36, -0.58, 0.1, 0.2],
          tray: [0.12, -0.36, -0.56, 0.35, 0.1], extinguisher: [0.3, -0.66, -0.62, 0.1, 0.35], dishes: [0.1, -0.52, -0.6, 0.25, 0.1],
        }[me.h] || [0.26, -0.3, -0.52, 0.25, 0.2];
        it.position.set(P[0], P[1], P[2]);
        it.rotation.set(P[3], P[4], 0);
        it.userData.base = P;
        this.viewModel.add(it);
        this.vmItem = it;
      }
    }
    if (this.vmItem) {
      const b = this.vmItem.userData.base;
      const bob = ctx.moving ? Math.sin(this.time * 9) * 0.02 : 0;
      const scrub = ctx.using ? Math.sin(this.time * 18) * 0.06 : 0;
      this.vmItem.position.set(b[0] + scrub, b[1] + bob + Math.abs(scrub) * 0.5, b[2] - Math.abs(scrub));
    }
  }

  // ---------- messes ----------
  syncMesses(list) {
    const seen = new Set();
    for (const m of list) {
      seen.add(m.i);
      let o = this.messes.get(m.i);
      if (!o) {
        const mesh = buildMess(m.t, m.i);
        const mw = L.toWorld(m.x, m.z, m.y);
        mesh.position.set(mw.x, mw.y, mw.z);
        this.scene.add(mesh);
        o = { mesh };
        this.messes.set(m.i, o);
        if (m.t === 'clog') { o.icon = makeSprite(emojiTexture('💩'), 0.4, 0.4); o.icon.position.set(mw.x, mw.y + 1.03, mw.z); this.scene.add(o.icon); }
      }
      if (m.t === 'debris') o.mesh.position.y = m.y + Math.sin(this.time * 1.5 + m.i) * 0.02;
      const c = o.mesh.userData.circle;
      if (c) c.material.opacity = 0.25 + (m.ch || 0) * 0.75 * (0.75 + Math.sin(this.time * (4 + (m.ch || 0) * 10)) * 0.25);
    }
    for (const [id, o] of this.messes) if (!seen.has(id)) {
      this.scene.remove(o.mesh);
      if (o.icon) this.scene.remove(o.icon);
      this.messes.delete(id);
    }
  }

  // ---------- monsters & UFO ----------
  syncMonsters(list, dt) {
    const seen = new Set();
    const k = Math.min(1, dt * 10);
    for (const m of list) {
      seen.add(m.i);
      let o = this.monsters.get(m.i);
      if (!o) {
        const mesh = m.k === 'porter' ? buildPorter() : m.k === 'raccoon' ? buildRaccoon() : buildShade();
        const ow = L.toWorld(m.x, m.z, m.y || 0);
        mesh.position.set(ow.x, ow.y, ow.z);
        this.scene.add(mesh);
        o = { mesh, k: m.k, sim: { x: m.x, z: m.z } };
        this.monsters.set(m.i, o);
      }
      const mesh = o.mesh;
      o.sim.x = m.x; o.sim.z = m.z;
      const mw = L.toWorld(m.x, m.z, m.y || 0);
      if ((mesh.position.x - mw.x) ** 2 + (mesh.position.z - mw.z) ** 2 > 16) mesh.position.set(mw.x, mw.y, mw.z);
      mesh.position.x += (mw.x - mesh.position.x) * k;
      mesh.position.z += (mw.z - mesh.position.z) * k;
      mesh.position.y += (mw.y - mesh.position.y) * k;
      mesh.rotation.y = angleLerp(mesh.rotation.y, m.r, k);
      if (o.k === 'raccoon') { animateRaccoon(mesh, m.a, this.time); continue; }
      if (mesh.userData.float) mesh.position.y = mw.y + 0.25 + Math.sin(this.time * 2.5) * 0.12;
      animateCharacter(mesh, m.a === 'stun' ? 'stun' : 'walk', null, this.time * (o.k === 'porter' ? 0.55 : 1));
      if (o.k === 'porter' && m.a !== 'stun') mesh.userData.rig.head.rotation.z = Math.sin(this.time * 1.3) * 0.25;
    }
    for (const [id, o] of this.monsters) if (!seen.has(id)) { this.scene.remove(o.mesh); disposeModel(o.mesh); this.monsters.delete(id); }
  }

  syncUfo(u, dt) {
    if (!u) { if (this.ufo) { this.scene.remove(this.ufo); this.ufo = null; } return; }
    if (!this.ufo) { this.ufo = buildUfo(); this.scene.add(this.ufo); this.ufo.position.set(u.x, u.y, u.z); }
    const k = Math.min(1, dt * 6);
    this.ufo.position.x += (u.x - this.ufo.position.x) * k;
    this.ufo.position.y += (u.y - this.ufo.position.y) * k;
    this.ufo.position.z += (u.z - this.ufo.position.z) * k;
    this.ufo.rotation.y += dt * 1.5;
    this.ufo.userData.beam.visible = !!u.b;
    this.ufo.userData.beam.scale.y = 1;
    this.ufo.userData.beam.position.y = -this.ufo.position.y / 2;
    this.ufo.userData.beam.scale.set(1, this.ufo.position.y / 14, 1);
  }
}
