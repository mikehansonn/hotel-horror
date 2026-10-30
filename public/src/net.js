// Thin networking layer. Solo play runs fully local; co-op relays JSON through server.js.
// The host runs the simulation; clients send actions/poses and render host snapshots.
export class Net {
  constructor() {
    this.ws = null;
    this.id = 1;
    this.hostId = 1;
    this.isHost = true;
    this.online = false;
    this.code = null;
    this.names = new Map();
    this.handlers = {};
    this.waiters = [];
  }

  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); }
  emit(ev, ...args) { for (const f of this.handlers[ev] || []) f(...args); }

  connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      let ws;
      try { ws = new WebSocket(`${proto}://${location.host}`); } catch (e) { reject(e); return; }
      const timer = setTimeout(() => { ws.close(); reject(new Error('The hotel server did not answer.')); }, 6000);
      ws.onopen = () => { clearTimeout(timer); this.attach(ws); resolve(ws); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('Could not reach the hotel server. Is "npm start" running?')); };
    });
  }

  attach(ws) {
    this.ws = ws;
    ws.onmessage = e => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      for (const w of this.waiters.splice(0)) { if (w.types.includes(m.t)) w.resolve(m); else this.waiters.push(w); }
      switch (m.t) {
        case 'msg': this.emit('msg', m.from, m.d); break;
        case 'peer-join': this.names.set(m.id, m.name); this.emit('join', m.id, m.name); break;
        case 'peer-leave': this.emit('leave', m.id, this.names.get(m.id)); this.names.delete(m.id); break;
        case 'host-left': this.emit('hostleft'); break;
      }
    };
    ws.onclose = () => { if (this.online) this.emit('close'); this.online = false; };
  }

  wait(types) { return new Promise(resolve => this.waiters.push({ types, resolve })); }

  async host(name) {
    await this.connect();
    this.send({ t: 'create', name });
    const m = await this.wait(['created']);
    Object.assign(this, { id: m.id, hostId: m.id, isHost: true, online: true, code: m.code });
    this.names.set(m.id, name);
    return m;
  }

  async join(code, name) {
    await this.connect();
    this.send({ t: 'join', code, name });
    const m = await this.wait(['joined', 'error']);
    if (m.t === 'error') { this.ws.close(); throw new Error(m.msg); }
    Object.assign(this, { id: m.id, hostId: m.host, isHost: false, online: true, code: m.code });
    this.names.set(m.id, name);
    for (const p of m.peers) this.names.set(p.id, p.name);
    return m;
  }

  startSolo(name) {
    Object.assign(this, { id: 1, hostId: 1, isHost: true, online: false, code: null });
    this.names.set(1, name);
  }

  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  toHost(d) { if (this.isHost) this.emit('msg', this.id, d); else this.send({ t: 'host', d }); }
  broadcast(d) { if (this.online) this.send({ t: 'all', d }); }
  sendTo(id, d) { if (this.online) this.send({ t: 'to', id, d }); }
  close() { this.online = false; if (this.ws) this.ws.close(); this.ws = null; }
}
