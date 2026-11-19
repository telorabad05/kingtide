// Vice Harbor — the handover program for gta6-01 (Node 22, standard library only).
// The game itself is the static site in game/ (Solmarina: an open-world crime game
// that runs offline in a desktop browser). This program copies game/ and
// screenshots/ into the output directory and writes dossier.json there with the
// vendored make.fun library, exactly as the scorer expects.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Fail loudly here rather than at the gate: one oversized screenshot would
// sink the whole handover, and this is the last cheap place to catch it.
for (const name of readdirSync(join(out, 'screenshots'))) {
  const bytes = statSync(join(out, 'screenshots', name)).size;
  if (bytes > 262144) throw new Error(`screenshot ${name} is ${bytes} bytes — over the 262144-byte cap`);
  if (bytes < 4096) throw new Error(`screenshot ${name} is only ${bytes} bytes — a truncated capture, not a frame of the game`);
}

// The handover is only real if the game itself made the trip: the entry page
// and its module entry must be sitting in the output, and the screenshot set
// must be the four judged scenes — no more, no fewer (v3.1 hardening).
if (!existsSync(join(out, 'game', 'index.html'))) throw new Error('game/index.html missing from the output — the copy did not complete');
if (!existsSync(join(out, 'game', 'src', 'main.js'))) throw new Error('game/src/main.js missing from the output — the copy did not complete');
const shotNames = existsSync(join(out, 'screenshots')) ? readdirSync(join(out, 'screenshots')) : [];
if (shotNames.length !== 4) throw new Error(`expected exactly 4 screenshots in the handover, found ${shotNames.length}`);

// The scorer's own caps (reference/gate.json): at most 4 screenshots of 256 KiB
// each, at most 993 files / 48 MiB under game/, paths at most 1000 bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// A one-line receipt on stdout, so a handover run is auditable at a glance.
console.log(`Vice Harbor v3.1 handed over: game/ + ${shotNames.length} screenshot(s) + dossier.json -> ${out}`);
