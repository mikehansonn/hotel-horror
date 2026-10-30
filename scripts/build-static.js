// Builds the solo-only static site for hosts like Netlify that can't run server.js:
// copies Three.js next to the page and marks the build as solo-only (no co-op server).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'vendor', 'three');
fs.rmSync(out, { recursive: true, force: true });
for (const dir of ['build', 'examples/jsm']) {
  fs.cpSync(path.join(root, 'node_modules', 'three', dir), path.join(out, dir), { recursive: true });
}
fs.writeFileSync(path.join(root, 'public', 'mode.js'), 'window.SOLO_ONLY = true;\n');
console.log('Static build ready in public/ (solo only).');
