// Vice Harbor — entrypoint handover for gta6-01 (Node 22+, standard library only).
//
// The game is this directory's game/ folder: a self-contained Three.js open
// world (index.html + ES modules + a vendored three.module.min.js — no build
// step, no network requests). This program validates the entry, copies game/
// and screenshots/ beside the output directory, and writes dossier.json —
// the summary the judge reads — with the vendored make.fun library.
//
//   node main.ts                                  → hands in to /output
//   MAKEFUN_OUTPUT_DIR=out node main.ts           → hands in to ./out
// Play it locally first with `node serve.ts`, then http://localhost:8080.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps (from the kit's gate): refuse early, with a clear
// message, anything the scorer itself would refuse.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function fail(message) {
  console.error(`handover refused: ${message}`);
  process.exit(1);
}

function walk(dir, base, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, acc);
    else if (entry.isFile()) acc.push({ full, rel: full.slice(base.length + 1), size: statSync(full).size });
  }
  return acc;
}

// --- validate the game copy -------------------------------------------------
const gameDir = join(here, 'game');
if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
const gameFiles = walk(gameDir, gameDir, []);
if (gameFiles.length > CAPS.game_max_files) fail(`game/ holds ${gameFiles.length} files (cap ${CAPS.game_max_files})`);
const gameBytes = gameFiles.reduce((sum, f) => sum + f.size, 0);
if (gameBytes > CAPS.game_max_bytes) fail(`game/ is ${gameBytes} bytes (cap ${CAPS.game_max_bytes})`);
for (const f of gameFiles) {
  if (Buffer.byteLength(f.rel) > CAPS.game_path_max_bytes) fail(`path too long: ${f.rel}`);
}
if (!gameFiles.some((f) => f.rel === join('vendor', 'three', 'three.module.min.js'))) {
  fail('the vendored three.js module is missing from game/vendor/three/');
}

// --- validate the screenshots: exactly four, each a sane JPEG ---------------
const shotsDir = join(here, 'screenshots');
if (!existsSync(shotsDir)) fail('screenshots/ is missing');
const shots = readdirSync(shotsDir).filter((n) => /\.jpe?g$/i.test(n)).sort();
if (shots.length !== 4) fail(`screenshots/ must hold exactly 4 JPEGs, found ${shots.length}`);
for (const name of shots) {
  const size = statSync(join(shotsDir, name)).size;
  if (size < 4096) fail(`${name} is only ${size} bytes — not a real capture`);
  if (size > CAPS.screenshots.max_bytes) fail(`${name} is ${size} bytes (cap ${CAPS.screenshots.max_bytes})`);
}

// --- hand over ----------------------------------------------------------------
mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });
writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));

console.log(
  `Vice Harbor handed in: ${gameFiles.length} game files (${(gameBytes / 1048576).toFixed(2)} MiB), ` +
  `${shots.length} screenshots (${shots.join(', ')}) → ${out}/dossier.json`,
);
