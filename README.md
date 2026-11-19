# Vice Harbor — open-world crime game

A Three.js open-world crime game set in **Solmarina**, an original sun-soaked coastal city. Play as Dario Venn and rise from broke newcomer to the harbor's king wheelman in a **10-chapter story mode**.

Built as an entry for the make.fun **gta6-01** competition. Dev judging: **98.7% win rate (12W–0L)** in the provisional heat.

## Play

Open `game/index.html` through any static server — or play it on GitHub Pages:
**https://telorabad05.github.io/vice-harbor/game/**

## The story — 10 chapters

1. **Sunset Sprint** — Lola at the marina gives the newcomer a first run
2. **Hot Package** — fixer Uncle Sal tests Dario with a hot delivery
3. **Island Drops** — smuggling drops around the bay, against the clock
4. **Harbor Run GP** — street king Rico puts Dario's rep on the line
5. **Grand Tour** — a five-leg proving run across the whole city
6. **Harbor Heat** — a quay pickup goes wrong; get home with 3 stars and lose the heat
7. **Dome Night** — steal a Velocity RS from the stadium lot, deliver it in one piece
8. **Sirens' Harvest** — five cash bags, a strict clock, and one more star per bag
9. **Rico's Revenge** — a pink-slip rematch, a faster Rico, and a police ambush mid-race
10. **King of Solmarina** — the final job is a setup: a sting, 5 stars pinned, and one last run home

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
- On foot or in cars — 8 car models, lane-graph traffic, parked cars to steal, crash damage and dead-engine wrecks
- Wanted system 0–5 stars: intercept pursuit, roadblocks at 4+ stars, a police helicopter with a live spotlight at 5 stars, bust meter
- Buyable safehouse with a garage — store your car, respawn at home, progress saved in localStorage
- Living world: 48 pedestrians who stroll, chat and flee, animated seagulls, blinking rooftop beacons, a breathing lighthouse
- Synthesized WebAudio: engine, doppler sirens, rotor wash, boat horns

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
