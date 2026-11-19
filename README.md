# KINGTIDE — open-world crime game

A Three.js open-world crime game set in **Solmarina**, an original sun-soaked coastal city split into three districts: **Oceanfront Downtown**, **Harbor Industrial**, and **Hillcrest Island**. Two full story campaigns, a living police force, and an arsenal you have to *earn* — weapons are never given, only **bought from a dealer or found hidden in the city**.

## Play

Open `game/index.html` through any static server — or play it on GitHub Pages:
**https://telorabad05.github.io/kingtide/game/**

## Two stories, one city

- **Cerita Dario** (10 chapters) — Dario Venn rises from broke newcomer to king wheelman: marina errands, a street-racing rival, a harbor heist gone hot, and a betrayal finale under a pinned 5-star wanted level.
- **KINGTIDE: DUO — Val & Rafa** (7 chapters) — Valeria "Val" Cruz walks out of prison after taking the fall for her old crew; Rafael "Rafa" Duarte is waiting at the gate. A crime-duo campaign of scores, ambushes and betrayal, with the lead switching between the two — including mid-mission.

## Features

- **Combat**: 5 weapons (Pistol, Wasp SMG, Shotgun, Assault Rifle, RPG) with mags, reserve ammo, reloads and a GTA-style **weapon wheel (hold Q, slow motion)**. Buy them — plus ammo and armour — from **Marco**, the arms dealer in a Harbor Industrial back alley, or find 3 hidden pickups (pier, Dome, lighthouse).
- **Police that hunt like GTA**: officers get out of their cars and chase you on foot, dynamic roadblocks deploy ahead of your escape route, a helicopter joins sustained chases — and can be shot down, or will leave when the heat dies. Break line of sight and the **SEARCH system** takes over: a search zone pulses on the minimap while units sweep it. Stay hidden and you walk free.
- **A living city**: 3 distinct zones joined by bridges, a signature beach with umbrellas, lifeguard towers and strolling sunbathers, lane-graph traffic, 8 stealable car models, pedestrians who chat, stroll and flee.
- **Driving**: nitro (Shift), synthesized radio with 3 stations, car damage with smoking wrecks, a buyable safehouse with a garage.
- **REP system**: earn reputation for chapters, escapes and feats — climb from Newcomer to Harbor King.
- Full save system in localStorage: story progress, garage, weapons, ammo, armour and REP all persist.

## Controls

- **WASD / arrows** — move & drive · **Mouse** — camera / aim
- **Left click** — fire (when armed) / shove · **R** — reload (on foot) / radio (in a car)
- **Hold Q** — weapon wheel · **1–5 / Tab / scroll** — switch weapon
- **Shift** — sprint (on foot) / nitro (in a car) · **Space** — handbrake
- **E** — enter / exit car · **F** — talk / start mission / Marco's shop · **Esc / P** — pause

## Run locally

```sh
npx tsx serve.ts   # or any static file server pointed at the repo root
```

Then open the served `game/` page. Fully self-contained (Three.js is vendored under `game/vendor/three/`), no network requests.

## Layout

- `game/` — the playable game (static, no build step)
- `screenshots/` — captures from the final build
- `main.ts` — entrypoint/handover from the original competition build (Vice Harbor, make.fun gta6-01)
- `serve.ts` — tiny static server with ETag revalidation

MIT licensed — see `LICENSE`.
