# Vice Harbor — open-world crime game

A Three.js open-world crime game set in **Solmarina**, an original sun-soaked coastal city. Play as Dario Venn: roam on foot or steal and drive cars, run missions, and outrun the Harbor PD.

Built as an entry for the make.fun **gta6-01** competition ("Vice Harbor — open-world crime v3.1").

## Play

Open `game/index.html` through any static server — or play it on GitHub Pages:
**https://telorabad05.github.io/vice-harbor/game/**

## Controls

- **WASD / arrows** — move & drive
- **Mouse** — camera
- **Shift** — sprint
- **Space** — handbrake
- **E** — enter / exit car
- **F** — talk / start mission / interact
- **Esc / P** — pause
- **Left click** — shove

## Features

- Procedural coastal city: art-deco blocks, a park, the Solmarina Dome stadium, Lola's Quay marina with a lighthouse and cruising boats, beach and promenade
- On foot or in cars — 8 car models, traffic system, parked cars to steal
- Wanted system with police pursuit, intercept steering, roadblocks at 4+ stars, and a police helicopter with a live spotlight at 5 stars
- 5 missions: Sunset Sprint, Hot Package, Island Drops, the Harbor Run GP race against Rico, and the Grand Tour
- Buyable safehouse with a garage — store your car, respawn at home, progress saved in localStorage
- Living world details: pedestrians who stroll, chat and flee, animated seagulls, blinking rooftop beacons, a breathing lighthouse

## Run locally

```sh
npx tsx serve.ts   # or any static file server pointed at the repo root
```

Then open the served `game/` page. The game is fully self-contained (Three.js is vendored under `game/vendor/three/`).

## Layout

- `game/` — the playable game (static, no build step)
- `screenshots/` — captures from the final build
- `main.ts` — the competition entrypoint/handover
- `serve.ts` — tiny static server with ETag revalidation

MIT licensed — see `LICENSE`.
