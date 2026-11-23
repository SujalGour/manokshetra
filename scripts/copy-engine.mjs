// Copies the single-threaded "lite" Stockfish build into public/engine.
// The single-threaded build works without COOP/COEP headers (needed for GitHub Pages).
import { mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const src = 'node_modules/stockfish/src';
const out = 'public/engine';
mkdirSync(out, { recursive: true });
const files = readdirSync(src);
const js = files.find((f) => /^stockfish-.*-lite-single-.*\.js$/.test(f));
const wasm = files.find((f) => /^stockfish-.*-lite-single-.*\.wasm$/.test(f));
if (!js || !wasm) throw new Error('Stockfish lite-single build not found in ' + src);
// The engine loads "<its own name>.wasm", so both files share the base name.
copyFileSync(join(src, js), join(out, 'stockfish.js'));
copyFileSync(join(src, wasm), join(out, 'stockfish.wasm'));
console.log(`engine: ${js} -> ${out}/stockfish.js`);
