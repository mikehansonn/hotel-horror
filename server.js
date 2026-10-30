// The Last Resort — static file server + WebSocket relay for co-op rooms.
// The host's browser runs the game simulation; this server only forwards messages.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three');
const MAX_PLAYERS = 6;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function safeJoin(root, rel) {
  const full = path.normalize(path.join(root, rel));
  return full.startsWith(root) ? full : null;
}

function resolve(urlPath) {
  const p = decodeURIComponent(urlPath.split('?')[0]);
  if (p.startsWith('/vendor/three/')) return safeJoin(THREE_DIR, p.slice('/vendor/three/'.length));
  return safeJoin(PUBLIC, p === '/' ? '/index.html' : p);
}

const server = http.createServer((req, res) => {
  const file = resolve(req.url);
  if (!file) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
});

// ---------- Rooms ----------
const wss = new WebSocketServer({ server });
const rooms = new Map(); // code -> { host: id, peers: Map<id, ws> }
let nextId = 1;

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do c = Array.from({ length: 4 }, () => A[(Math.random() * A.length) | 0]).join('');
  while (rooms.has(c));
  return c;
}

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
}

wss.on('connection', ws => {
  ws.id = nextId++;
  ws.code = null;
  ws.name = 'Staff';

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const room = ws.code ? rooms.get(ws.code) : null;

    switch (m.t) {
      case 'create': {
        if (ws.code) return;
        const code = makeCode();
        ws.code = code;
        ws.name = String(m.name || 'Host').slice(0, 16);
        rooms.set(code, { host: ws.id, peers: new Map([[ws.id, ws]]) });
        send(ws, { t: 'created', code, id: ws.id });
        console.log(`[room ${code}] created by ${ws.name}`);
        break;
      }
      case 'join': {
        if (ws.code) return;
        const code = String(m.code || '').toUpperCase().trim();
        const target = rooms.get(code);
        if (!target) { send(ws, { t: 'error', msg: `No hotel with code ${code}.` }); return; }
        if (target.peers.size >= MAX_PLAYERS) { send(ws, { t: 'error', msg: 'That shift is full.' }); return; }
        ws.code = code;
        ws.name = String(m.name || 'Staff').slice(0, 16);
        const peers = [...target.peers.values()].map(p => ({ id: p.id, name: p.name }));
        target.peers.set(ws.id, ws);
        send(ws, { t: 'joined', code, id: ws.id, host: target.host, peers });
        for (const p of target.peers.values()) if (p !== ws) send(p, { t: 'peer-join', id: ws.id, name: ws.name });
        console.log(`[room ${code}] ${ws.name} joined (${target.peers.size} players)`);
        break;
      }
      case 'host': { // client -> host
        if (!room) return;
        const host = room.peers.get(room.host);
        if (host) send(host, JSON.stringify({ t: 'msg', from: ws.id, d: m.d }));
        break;
      }
      case 'all': { // anyone -> everyone else
        if (!room) return;
        const out = JSON.stringify({ t: 'msg', from: ws.id, d: m.d });
        for (const p of room.peers.values()) if (p !== ws) send(p, out);
        break;
      }
      case 'to': { // host -> one peer
        if (!room) return;
        const p = room.peers.get(m.id);
        if (p) send(p, JSON.stringify({ t: 'msg', from: ws.id, d: m.d }));
        break;
      }
    }
  });

  ws.on('close', () => {
    const room = ws.code ? rooms.get(ws.code) : null;
    if (!room) return;
    room.peers.delete(ws.id);
    if (ws.id === room.host) {
      for (const p of room.peers.values()) { send(p, { t: 'host-left' }); p.code = null; }
      rooms.delete(ws.code);
      console.log(`[room ${ws.code}] closed (host left)`);
    } else {
      for (const p of room.peers.values()) send(p, { t: 'peer-leave', id: ws.id });
      console.log(`[room ${ws.code}] ${ws.name} left`);
    }
  });
});

server.listen(PORT, () => {
  const lan = Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log('\n  THE LAST RESORT is open for business.\n');
  console.log(`  Play here:        http://localhost:${PORT}`);
  for (const ip of lan) console.log(`  Friends on LAN:   http://${ip}:${PORT}`);
  console.log('\n  Press Ctrl+C to close the hotel.\n');
});
