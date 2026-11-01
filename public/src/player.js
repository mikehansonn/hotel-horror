// First-person staff controller: walking, sprinting, jumping, swimming, flashlight and valet driving.
import * as THREE from 'three';
import * as L from './layout.js';
import { clamp } from './util.js';
import { carLength } from './models.js';

const EYE = 1.62;
const RADIUS = 0.35;
const tmpV = new THREE.Vector3();

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(L.SPAWNS[0][0], 0, L.SPAWNS[0][1]);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;
    this.pitch = -0.05;
    this.vy = 0;
    this.onGround = true;
    this.stamina = 1;
    this.keys = {};
    this.locked = false;
    this.sens = 1;
    this.invertY = false;
    this.speedMul = 1;
    this.carryMul = 1;
    this.sprintMul = 1.6;   // Roller Skates raise it
    this.staminaMul = 1;    // Energy Drinks raise it
    this.car = null;
    this.down = 0;
    this.bob = 0;
    this.moving = false;
    this.sprinting = false;
    this.wasInWater = false;
    this.flOn = false;
    this.flash = new THREE.SpotLight('#fff3d6', 0, 26, 0.46, 0.45, 1.2);
    this.flash.position.set(0.18, -0.12, 0);
    this.flash.target.position.set(0.1, -0.2, -6);
    camera.add(this.flash, this.flash.target);
    this.flashPower = 55;

    document.addEventListener('keydown', e => { if (!this.typing()) this.keys[e.code] = true; });
    document.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
    document.addEventListener('mousemove', e => {
      if (!this.locked || this.car) return;
      const s = 0.0022 * this.sens;
      this.yaw -= e.movementX * s;
      this.pitch -= e.movementY * s * (this.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, -1.45, 1.45);
    });
  }

  typing() { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); }

  spawnAt(x, z, yaw = Math.PI) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.yaw = yaw;
    this.pitch = -0.05;
  }

  toggleFlash() { this.flOn = !this.flOn; }

  get floor() { return L.floorOf(this.pos.x); }

  // Step out of the elevator on another floor, facing the hallway.
  rideTo(f) {
    this.pos.x += (f - this.floor) * L.FLOOR_DX;
    this.pos.z = -26.4;
    this.pos.x = Math.round(this.pos.x / L.FLOOR_DX) * L.FLOOR_DX + 0.3;
    this.vel.set(0, 0, 0);
    this.yaw = Math.PI;
    this.pitch = -0.05;
  }

  // Halfway up (or down) a flight of stairs you're on the next floor's half of it.
  changeFloor() {
    const f = this.floor;
    if (this.pos.y > L.FLOOR_H / 2 && f < L.stairsTop()) { this.pos.x += L.FLOOR_DX; this.pos.y -= L.FLOOR_H; }
    else if (this.pos.y < -L.FLOOR_H / 2 && f > 0 && !L.inPool(this.pos.x, this.pos.z)) { this.pos.x -= L.FLOOR_DX; this.pos.y += L.FLOOR_H; }
  }

  pose() {
    return {
      k: 'p', x: +this.pos.x.toFixed(2), y: +this.pos.y.toFixed(2), z: +this.pos.z.toFixed(2),
      yaw: +this.yaw.toFixed(3), pitch: +this.pitch.toFixed(3), fl: this.flOn && !this.car ? 1 : 0,
      car: this.car ? { i: this.car.id, x: +this.car.x.toFixed(2), z: +this.car.z.toFixed(2), r: +this.car.ry.toFixed(3) } : null,
    };
  }

  enterCar(ev) {
    this.car = { id: ev.c, x: ev.x, z: ev.z, ry: ev.r, v: 0, len: carLength(ev.m) };
    this.vel.set(0, 0, 0);
  }

  exitCar() {
    const c = this.car;
    if (!c) return null;
    const out = { c: c.id, x: c.x, z: c.z, r: c.ry };
    const lx = Math.cos(c.ry), lz = -Math.sin(c.ry);
    const p = { x: c.x + lx * 1.7, z: c.z + lz * 1.7 };
    L.resolveCircle(p, RADIUS, 'player');
    this.pos.set(p.x, 0, p.z);
    this.yaw = c.ry + Math.PI;
    this.pitch = -0.1;
    this.car = null;
    return out;
  }

  update(dt, ctx) {
    this.flash.intensity = this.flOn && !this.car && this.down <= 0 ? this.flashPower : 0;
    if (this.car) { this.updateCar(dt, ctx); return; }
    const k = this.keys;
    const input = this.locked && !ctx.block && this.down <= 0;
    const f = input ? (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0) : 0;
    const s = input ? (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0) : 0;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let mx = -sin * f + cos * s, mz = -cos * f - sin * s;
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }
    const inWater = L.inPool(this.pos.x, this.pos.z) && this.pos.y < -0.4;
    const sprint = input && (k.ShiftLeft || k.ShiftRight) && len > 0 && this.stamina > 0.04 && !inWater;
    this.sprinting = sprint;
    this.stamina = clamp(this.stamina + (sprint ? -0.2 / this.staminaMul : 0.14 * this.staminaMul) * dt, 0, 1);
    const speed = 4.3 * this.speedMul * this.carryMul * (sprint ? this.sprintMul : 1) * (inWater ? 0.5 : 1);
    const accel = this.onGround || inWater ? 14 : 3;
    this.vel.x += (mx * speed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (mz * speed - this.vel.z) * Math.min(1, accel * dt);
    const next = { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.z * dt };
    L.resolveCircle(next, RADIUS, 'player');
    this.pos.x = next.x;
    this.pos.z = next.z;

    const ground = L.surfaceY(this.pos.x, this.pos.z, this.pos.y);
    if (input && k.Space && (this.onGround || inWater)) { this.vy = inWater ? 3.2 : 4.6; this.onGround = false; }
    this.vy -= (inWater ? 6 : 13) * dt;
    this.pos.y += this.vy * dt;
    // walk down stairs instead of hopping down them
    if (this.onGround && this.vy <= 0 && this.pos.y > ground && this.pos.y - ground < 0.5) this.pos.y = ground;
    if (this.pos.y <= ground) {
      if (!this.onGround && this.vy < -6) ctx.onLand?.();
      this.pos.y = ground;
      this.vy = 0;
      this.onGround = true;
    } else if (this.pos.y > ground + 0.05) this.onGround = false;
    this.changeFloor();
    const nowWater = L.inPool(this.pos.x, this.pos.z) && this.pos.y < -0.4;
    if (nowWater && !this.wasInWater) ctx.onSplash?.();
    this.wasInWater = nowWater;

    this.moving = len > 0 && (this.onGround || nowWater) && input;
    this.bob += (this.moving ? (sprint ? 13 : 9) : 0) * dt;
    const bobY = this.moving ? Math.sin(this.bob) * 0.04 : 0;
    if (this.moving) {
      const ph = Math.sin(this.bob);
      if (ph < -0.95 && !this.stepLatch) { this.stepLatch = true; ctx.onStep?.(nowWater); }
      else if (ph > 0) this.stepLatch = false;
    }
    const eye = this.down > 0 ? 0.35 : EYE;
    const w = L.toWorld(this.pos.x, this.pos.z, this.pos.y); // upper floors are drawn above the ground floor
    this.camera.position.set(w.x, w.y + eye + bobY, w.z);
    this.camera.rotation.set(this.pitch, this.yaw, this.down > 0 ? 0.7 : 0, 'YXZ');
  }

  updateCar(dt, ctx) {
    const c = this.car;
    const k = this.keys;
    const input = this.locked && !ctx.block;
    const throttle = input ? (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0) : 0;
    const steer = input ? (k.KeyA ? 1 : 0) - (k.KeyD ? 1 : 0) : 0;
    if (throttle > 0) c.v += (c.v < 0 ? 16 : 7.5) * dt;
    else if (throttle < 0) c.v -= (c.v > 0 ? 16 : 6) * dt;
    else c.v -= Math.sign(c.v) * Math.min(Math.abs(c.v), 4 * dt);
    if (input && k.Space) c.v -= Math.sign(c.v) * Math.min(Math.abs(c.v), 20 * dt);
    c.v = clamp(c.v, -6, 16);
    c.ry += steer * 2.0 * dt * clamp(c.v / 4, -1, 1);
    const fx = Math.sin(c.ry), fz = Math.cos(c.ry);
    let nx = c.x + fx * c.v * dt, nz = c.z + fz * c.v * dt;
    const half = c.len / 2 - 0.95;
    let hit = false;
    for (let pass = 0; pass < 2; pass++) for (const off of [-half, 0, half]) {
      const p = { x: nx + fx * off, z: nz + fz * off };
      if (L.resolveCircle(p, 1.0, 'car')) { nx += p.x - (nx + fx * off); nz += p.z - (nz + fz * off); hit = true; }
    }
    if (hit) { if (Math.abs(c.v) > 4) ctx.onBonk?.(); c.v *= 0.35; }
    c.x = nx;
    c.z = nz;
    this.pos.set(c.x, 0, c.z);
    tmpV.set(c.x - fx * 7.5, 3.4, c.z - fz * 7.5);
    this.camera.position.lerp(tmpV, Math.min(1, dt * 5));
    this.camera.lookAt(c.x + fx * 2.5, 1.0, c.z + fz * 2.5);
    this.moving = false;
  }
}
