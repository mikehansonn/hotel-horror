// Builds the static site for hosts like Netlify that can't run server.js: copies Three.js next to
// the page and writes public/mode.js. Co-op still works if RELAY_URL points at a running server.js
// (e.g. wss://the-last-resort.onrender.com); without it the site is solo only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'vendor', 'three');
fs.rmSync(out, { recursive: true, force: true });
for (const dir of ['build', 'examples/jsm']) {
  fs.cpSync(path.join(root, 'node_modules', 'three', dir), path.join(out, dir), { recursive: true });
}
const relay = (process.env.RELAY_URL || '').trim().replace(/^http/, 'ws').replace(/\/$/, '');
fs.writeFileSync(path.join(root, 'public', 'mode.js'), relay
  ? `window.RELAY_URL = ${JSON.stringify(relay)};\n`
  : 'window.SOLO_ONLY = true;\n');
console.log(relay ? `Static build ready in public/ (co-op through ${relay}).` : 'Static build ready in public/ (solo only: set RELAY_URL for co-op).');
