// Procedural WebAudio: every sound is synthesized, positioned in 3D when it has a location.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.engine = null;
    this.lastPlay = {};
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  listen(camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener, p = camera.getWorldPosition(this._v ||= camera.position.clone());
    const f = camera.getWorldDirection(this._f ||= p.clone());
    if (l.positionX) {
      l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
      l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
  }

  out(pos, vol = 1) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    if (pos) {
      const p = this.ctx.createPanner();
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = 3;
      p.maxDistance = 80;
      p.rolloffFactor = 1.3;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y ?? 1.2; p.positionZ.value = pos.z; }
      else p.setPosition(pos.x, pos.y ?? 1.2, pos.z);
      g.connect(p).connect(this.master);
    } else g.connect(this.master);
    return g;
  }

  tone(dest, { f = 440, f2, type = 'sine', t = 0, dur = 0.3, vol = 0.3, a = 0.005 }) {
    const c = this.ctx, now = c.currentTime + t;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, now);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + a);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(dest);
    o.start(now);
    o.stop(now + dur + 0.05);
    return o;
  }

  hiss(dest, { t = 0, dur = 0.2, vol = 0.3, type = 'lowpass', f = 800, f2, q = 1, a = 0.005 }) {
    const c = this.ctx, now = c.currentTime + t;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(f, now);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, now + dur);
    fl.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + a);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    s.connect(fl).connect(g).connect(dest);
    s.start(now, Math.random());
    s.stop(now + dur + 0.05);
  }

  play(name, pos) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = performance.now();
    if (this.lastPlay[name] && now - this.lastPlay[name] < 40) return;
    this.lastPlay[name] = now;
    const o = this.out(pos);
    switch (name) {
      case 'bell': this.tone(o, { f: 1568, dur: 1.3, vol: 0.35 }); this.tone(o, { f: 2350, dur: 0.9, vol: 0.15 }); break;
      case 'ding': this.tone(o, { f: 1318, dur: 0.6, vol: 0.25 }); this.tone(o, { f: 1975, dur: 0.5, vol: 0.1 }); break;
      case 'kaching': this.hiss(o, { dur: 0.08, vol: 0.2, type: 'bandpass', f: 3500, q: 2 }); this.tone(o, { f: 1318, t: 0.05, dur: 0.25, vol: 0.2 }); this.tone(o, { f: 1760, t: 0.1, dur: 0.35, vol: 0.2 }); break;
      case 'chime': [1047, 1319, 1568].forEach((f, i) => this.tone(o, { f, t: i * 0.07, dur: 0.35, vol: 0.18 })); break;
      case 'good': [784, 988, 1175, 1568].forEach((f, i) => this.tone(o, { f, t: i * 0.08, dur: 0.4, vol: 0.14 })); break;
      case 'bad': this.tone(o, { f: 220, f2: 140, type: 'triangle', dur: 0.6, vol: 0.25 }); this.tone(o, { f: 233, f2: 150, type: 'triangle', dur: 0.6, vol: 0.18 }); break;
      case 'pickup': this.tone(o, { f: 520, f2: 820, type: 'square', dur: 0.08, vol: 0.06 }); break;
      case 'thud': this.hiss(o, { dur: 0.18, vol: 0.4, f: 220 }); this.tone(o, { f: 90, f2: 50, dur: 0.15, vol: 0.3 }); break;
      case 'clean': this.hiss(o, { dur: 0.25, vol: 0.18, type: 'bandpass', f: 2200, f2: 4000, q: 1.5 }); this.tone(o, { f: 1400, f2: 2200, dur: 0.12, vol: 0.06 }); break;
      case 'scrub': this.hiss(o, { dur: 0.13, vol: 0.12, type: 'bandpass', f: 1300 + Math.random() * 500, q: 2 }); break;
      case 'splash': this.hiss(o, { dur: 0.5, vol: 0.3, f: 2500, f2: 300 }); break;
      case 'phone': for (let r = 0; r < 2; r++) for (let i = 0; i < 8; i++) { this.tone(o, { f: 440, t: r * 0.6 + i * 0.05, dur: 0.045, vol: 0.12 }); this.tone(o, { f: 480, t: r * 0.6 + i * 0.05, dur: 0.045, vol: 0.12 }); } break;
      case 'knock': for (let i = 0; i < 3; i++) { this.hiss(o, { t: i * 0.17, dur: 0.09, vol: 0.5, f: 380 }); this.tone(o, { f: 110, f2: 70, t: i * 0.17, dur: 0.1, vol: 0.4 }); } break;
      case 'honk': this.tone(o, { f: 392, type: 'square', dur: 0.4, vol: 0.12 }); this.tone(o, { f: 494, type: 'square', dur: 0.4, vol: 0.1 }); break;
      case 'doorslam': this.hiss(o, { dur: 0.2, vol: 0.45, f: 500 }); this.tone(o, { f: 70, f2: 45, dur: 0.2, vol: 0.3 }); break;
      case 'sizzle': this.hiss(o, { dur: 0.7, vol: 0.12, type: 'highpass', f: 4500 }); break;
      case 'whoosh': this.hiss(o, { dur: 0.3, vol: 0.2, type: 'bandpass', f: 400, f2: 1600, q: 1 }); break;
      case 'bonk': this.tone(o, { f: 300, f2: 90, dur: 0.22, vol: 0.4 }); this.hiss(o, { dur: 0.08, vol: 0.3, f: 1500 }); break;
      case 'step': this.hiss(o, { dur: 0.06, vol: 0.07, f: 450 + Math.random() * 200 }); break;
      case 'stepwet': this.hiss(o, { dur: 0.12, vol: 0.09, f: 1200, f2: 400 }); break;
      case 'curtain': this.hiss(o, { dur: 0.35, vol: 0.12, type: 'bandpass', f: 2600, q: 0.8, a: 0.08 }); break;
      case 'beep': this.tone(o, { f: 1250, type: 'square', dur: 0.06, vol: 0.05 }); this.tone(o, { f: 1250, type: 'square', t: 0.1, dur: 0.06, vol: 0.05 }); break;
      case 'powerdown': this.tone(o, { f: 240, f2: 30, type: 'sawtooth', dur: 1.4, vol: 0.2 }); this.hiss(o, { dur: 0.3, vol: 0.3, type: 'bandpass', f: 2000 }); break;
      case 'powerup': this.tone(o, { f: 40, f2: 240, type: 'sawtooth', dur: 1.0, vol: 0.12 }); this.tone(o, { f: 120, type: 'sine', t: 0.9, dur: 0.6, vol: 0.12 }); break;
      case 'elevator': this.tone(o, { f: 880, dur: 1.6, vol: 0.18 }); this.tone(o, { f: 698, t: 0.35, dur: 1.8, vol: 0.18 }); break;
      case 'whisper':
        for (let i = 0; i < 6; i++) this.hiss(o, { t: i * 0.22, dur: 0.2, vol: 0.06, type: 'bandpass', f: 2500 + Math.random() * 1500, q: 4, a: 0.05 });
        break;
      case 'creak': this.tone(o, { f: 110, f2: 70, type: 'sawtooth', dur: 0.9, vol: 0.06, a: 0.2 }); break;
      case 'static': // television snow, somewhere close: the Static
        for (let i = 0; i < 5; i++) this.hiss(o, { t: Math.random() * 0.6, dur: 0.05 + Math.random() * 0.12, vol: 0.09, type: 'highpass', f: 2500 + Math.random() * 3000 });
        this.hiss(o, { dur: 0.7, vol: 0.05, type: 'bandpass', f: 1800, q: 0.7 });
        break;
      case 'quake': // something enormous turning over, far below
        this.tone(o, { f: 38, f2: 26, type: 'sawtooth', dur: 3.2, vol: 0.22, a: 0.6 });
        this.hiss(o, { dur: 2.8, vol: 0.25, f: 180, f2: 60, a: 0.5 });
        break;
      case 'stalk': // slow, heavy footsteps somewhere nearby
        for (let i = 0; i < 2; i++) { this.hiss(o, { t: i * 0.42, dur: 0.1, vol: 0.16, f: 140 }); this.tone(o, { f: 55, f2: 38, t: i * 0.42, dur: 0.12, vol: 0.12 }); }
        break;
      case 'laugh': for (let i = 0; i < 4; i++) this.tone(o, { f: 260 - i * 15, f2: 180 - i * 10, type: 'triangle', t: i * 0.22, dur: 0.16, vol: 0.12 }); break;
      case 'scream': {
        const osc = this.tone(o, { f: 650, type: 'sawtooth', dur: 1.3, vol: 0.18, a: 0.05 });
        const n = this.ctx.currentTime;
        osc.frequency.setValueAtTime(650, n);
        osc.frequency.linearRampToValueAtTime(1150, n + 0.3);
        osc.frequency.linearRampToValueAtTime(520, n + 1.3);
        this.hiss(o, { dur: 1.2, vol: 0.12, type: 'bandpass', f: 2000, q: 2 });
        break;
      }
      case 'sting':
        [110, 116.5, 164.8, 174.6, 233].forEach(f => this.tone(o, { f, type: 'sawtooth', dur: 3.0, vol: 0.06, a: 0.25 }));
        this.hiss(o, { dur: 1.5, vol: 0.25, f: 300, f2: 3000, a: 0.9 });
        break;
      case 'screech': this.tone(o, { f: 1400, f2: 500, type: 'sawtooth', dur: 0.6, vol: 0.15 }); this.hiss(o, { dur: 0.5, vol: 0.2, type: 'bandpass', f: 3000, q: 3 }); break;
      case 'vanish': this.hiss(o, { dur: 0.9, vol: 0.2, f: 4000, f2: 200, a: 0.4 }); break;
      case 'burn': this.hiss(o, { dur: 1.6, vol: 0.35, f: 900 }); for (let i = 0; i < 8; i++) this.hiss(o, { t: Math.random() * 1.2, dur: 0.03, vol: 0.3, type: 'highpass', f: 3000 }); break;
      case 'ufo': {
        const osc = this.tone(o, { f: 520, dur: 3.5, vol: 0.12, a: 0.3 });
        const lfo = this.ctx.createOscillator();
        const lg = this.ctx.createGain();
        lfo.frequency.value = 7; lg.gain.value = 180;
        lfo.connect(lg).connect(osc.frequency);
        lfo.start(); lfo.stop(this.ctx.currentTime + 3.6);
        break;
      }
      case 'down': this.play('sting'); this.tone(o, { f: 80, f2: 30, dur: 1.2, vol: 0.4 }); break;
      case 'click': this.tone(o, { f: 2000, type: 'square', dur: 0.02, vol: 0.05 }); break;
      case 'heartbeat': this.tone(o, { f: 62, f2: 40, dur: 0.14, vol: 0.5 }); this.tone(o, { f: 55, f2: 36, t: 0.2, dur: 0.16, vol: 0.38 }); break;
      case 'ping': this.tone(o, { f: 1320, dur: 0.18, vol: 0.12 }); this.tone(o, { f: 1760, t: 0.09, dur: 0.22, vol: 0.1 }); break;
      case 'land': this.hiss(o, { dur: 0.12, vol: 0.2, f: 300 }); break;
      case 'money': this.tone(o, { f: 1760, dur: 0.12, vol: 0.05 }); break;
      case 'alarm': for (let i = 0; i < 3; i++) this.tone(o, { f: 3150, type: 'square', t: i * 0.22, dur: 0.12, vol: 0.06 }); break;
      case 'spray': this.hiss(o, { dur: 0.28, vol: 0.22, type: 'highpass', f: 1800, a: 0.02 }); break;
    }
  }

  startAmbience() {
    const c = this.ctx;
    this.hum = c.createGain();
    this.hum.gain.value = 0.015;
    for (const f of [60, 60.7, 120]) { const o = c.createOscillator(); o.frequency.value = f; o.connect(this.hum); o.start(); }
    this.hum.connect(this.master);
    this.drone = c.createGain();
    this.drone.gain.value = 0;
    const o = c.createOscillator();
    o.frequency.value = 41;
    o.type = 'triangle';
    o.connect(this.drone);
    o.start();
    const n = c.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const ng = c.createGain();
    ng.gain.value = 0.6;
    n.connect(lp).connect(ng).connect(this.drone);
    n.start();
    this.drone.connect(this.master);
    // the mountain wind: band-passed noise whose pitch and loudness wander
    const w = c.createBufferSource();
    w.buffer = this.noise;
    w.loop = true;
    this.windBand = c.createBiquadFilter();
    this.windBand.type = 'bandpass';
    this.windBand.frequency.value = 420;
    this.windBand.Q.value = 1.6;
    this.wind = c.createGain();
    this.wind.gain.value = 0;
    w.connect(this.windBand).connect(this.wind).connect(this.master);
    w.start();
  }

  // night: 0..1, horror: 0..1, outside: 0..1 (how exposed to the wind you are)
  update(dt, { night = 0, horror = 0, power = true, driving = null, outside = 0, gust = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.wind.gain.setTargetAtTime((0.015 + outside * 0.07) * (0.6 + Math.abs(gust) * 0.25 + night * 0.4), t, 0.8);
    this.windBand.frequency.setTargetAtTime(300 + Math.abs(gust) * 160 + Math.sin(t * 0.3) * 80, t, 1.2);
    this.hum.gain.setTargetAtTime(power ? 0.012 : 0, t, 0.3);
    this.drone.gain.setTargetAtTime((0.02 + night * 0.05) * (0.4 + horror) * (power ? 1 : 1.6), t, 1.5);
    if (driving && !this.engine) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      const g = this.ctx.createGain();
      g.gain.value = 0.05;
      o.connect(lp).connect(g).connect(this.master);
      o.start();
      this.engine = { o, g };
    } else if (!driving && this.engine) {
      this.engine.g.gain.setTargetAtTime(0, t, 0.1);
      this.engine.o.stop(t + 0.5);
      this.engine = null;
    }
    if (this.engine) this.engine.o.frequency.setTargetAtTime(38 + Math.abs(driving.v) * 7, t, 0.1);
  }
}
