// Vice Harbor — main orchestration.
// Owns the renderer, the player (on foot and at the wheel), wanted/bust
// bookkeeping, crimes, safehouse + garage storage, saving, the camera, and
// the per-frame wiring between city / traffic / peds / police / missions /
// HUD / audio. Exposes window.__game as a debug + test hook.
import * as THREE from 'three';
import { CITY, TUNING, PALETTE, modelById } from './config.js';
import { makeRng, clamp, dist2d, angleDelta, turnToward, pick, randRange } from './random.js';
import { buildCity, buildLaneGraph, collideCircle } from './city.js';
import { Vehicle, TrafficSystem } from './cars.js';
import { PedestrianSystem, makePerson, animatePerson } from './people.js';
import { PoliceSystem } from './police.js';
import { MissionRunner, MISSION_DEFS } from './missions.js';
import { AudioEngine } from './audio.js';
import { HUD } from './hud.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const SAVE_KEY = 'viceHarbor.save.v1';
const rng = makeRng(987123);

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe0ea, 190, 620);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 4000);   // far must clear the 1600 m sky dome
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- world
const city = buildCity(scene);
const graph = buildLaneGraph();
const traffic = new TrafficSystem(scene, graph, rng);
const parkedCars = [];
for (const spot of city.parkedSpots) {
  if (rng() < 0.16) continue;   // leave some spots empty
  const model = pick(rng, ['sedan', 'coupe', 'wagon', 'mule', 'coral', 'buggy', 'taxi'].map(modelById));
  const v = new Vehicle(scene, model, pick(rng, PALETTE.carPaints), { taxi: model.kind === 'taxi' });
  v.driver = 'parked';
  v.place(spot.x, spot.z, spot.heading, CITY.pier);
  parkedCars.push(v);
}
const peds = new PedestrianSystem(scene, city.sidewalkLoops, rng, TUNING.pedCount);
const police = new PoliceSystem(scene, graph, rng);
const audio = new AudioEngine();
const hud = new HUD();
const extraVehicles = new Set();   // Rico's car, the stored garage car

// ---------------------------------------------------------------- player + state
const playerMesh = makePerson(makeRng(7));
scene.add(playerMesh);
const player = {
  x: CITY.spawn.x, z: CITY.spawn.z, heading: CITY.spawn.heading,
  vx: 0, vz: 0, speed: 0, health: 100, car: null, phase: 0,
};
let S = { cash: TUNING.startCash, done: [], house: false, stored: null };
let wanted = 0;              // float; the HUD shows ceil()
let pinnedWanted = null;     // the finale's sting pins the heat: no decay while set
let lastNearestCopD = 999;   // refreshed every frame; the missions' LOS checks read it
let bust = 0;
let storedCar = null;
let mode = 'menu';           // menu | play | pause
let started = false;
let elapsed = 0;
let unseenT = 0, hitTimer = 0, shoveCooldown = 0, hitRunCooldown = 0, hornTimer = 14, lastHurtT = -99;
let camYaw = player.heading + Math.PI, camPitch = 0.36, mouseQuiet = 0, shake = 0;
const camTarget = new THREE.Vector3(player.x, 1.6, player.z);

function baseYAt(x, z) {
  const P = CITY.pier;
  return (x >= P.minX && x <= P.maxX && z >= P.minZ && z <= P.maxZ) ? 0.55 : 0.22;
}
function allVehicles() {
  const list = [...traffic.vehicles, ...parkedCars, ...police.cops, ...police.blockVehicles, ...extraVehicles];
  if (player.car && !list.includes(player.car)) list.push(player.car);
  return list;
}
function currentWorld() {
  return { colliders: city.colliders.concat(police.extraColliders), vehicles: allVehicles(), pier: CITY.pier };
}
traffic.fill(TUNING.trafficCount, allVehicles());

// ---------------------------------------------------------------- saving
function save() {
  if (shotName) return;   // screenshot sessions never persist
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* storage unavailable */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || !Array.isArray(data.done)) return null;
    return data;
  } catch { return null; }
}
function applyHouseVisual() {
  const col = S.house ? 0x2fe8c8 : 0xffc93c;
  city.safehouse.markerMat.color.set(col);
  city.safehouse.beamMat.color.set(col);
}
function spawnStoredCar() {
  if (!S.stored || storedCar) return;
  const v = new Vehicle(scene, modelById(S.stored.modelId), S.stored.paint, {});
  v.driver = 'parked';
  v.place(CITY.safehouse.garageX, CITY.safehouse.garageZ, -Math.PI / 2, CITY.pier);
  storedCar = v;
  extraVehicles.add(v);
}
function placePlayer(x, z, heading) {
  player.x = x; player.z = z; player.heading = heading;
  player.vx = 0; player.vz = 0; player.speed = 0;
  camYaw = heading + Math.PI;
  camTarget.set(x, 1.6, z);
}
function respawnPoint() {
  return S.house ? { x: CITY.safehouse.homeX, z: CITY.safehouse.homeZ } : { x: CITY.hospital.x, z: CITY.hospital.z };
}

// ---------------------------------------------------------------- game facade (missions + debug)
const G = {
  playerState: () => ({ x: player.x, z: player.z, inCar: !!player.car, speed: Math.abs(player.speed) }),
  cash: () => S.cash,
  addCash(n) { S.cash += n; hud.setCash(S.cash); audio.cash(); save(); },
  banner: (t, s) => { hud.banner(t, s); document.getElementById('status').textContent = t + (s ? ' — ' + s : ''); },
  objective: (t) => hud.objective(t),
  setWantedMin(n) { if (wanted < n) wanted = n; },
  addHeat(n) { wanted = clamp(wanted + n, 0, 5); unseenT = 0; },
  wantedLevel: () => wanted,
  setPinnedWanted(v) { pinnedWanted = v; if (v !== null && wanted < v) wanted = v; },
  nearestCopDist: () => lastNearestCopD,
  playerCar: () => player.car,
  isMissionDone: (id) => S.done.includes(id),
  markMissionDone(id) { if (!S.done.includes(id)) { S.done.push(id); save(); } },
  pierRect: () => CITY.pier,
  world: () => currentWorld(),
  addVehicle(v) { extraVehicles.add(v); },
  removeVehicle(v) { extraVehicles.delete(v); v.dispose(scene); },
};
const missions = new MissionRunner(scene, G);

// ---------------------------------------------------------------- crimes + consequences
function commitCrime(stars) {
  wanted = clamp(wanted + stars, 0, 5);
  unseenT = 0;
}
function exitCarInternal() {
  const car = player.car;
  if (!car) return;
  player.car = null;
  car.driver = 'parked';
  const rx = -Math.cos(car.heading), rz = Math.sin(car.heading);   // car's right side
  let nx = car.x + rx * 2.4, nz = car.z + rz * 2.4;
  [nx, nz] = collideCircle(currentWorld().colliders, nx, nz, 0.55);
  placePlayer(nx, nz, car.heading);
  playerMesh.visible = true;
  // stepping out inside your own garage stores the car
  const SH = CITY.safehouse;
  if (S.house && dist2d(car.x, car.z, SH.garageX, SH.garageZ) < SH.garageR) {
    S.stored = { modelId: car.model.id, paint: car.paint };
    storedCar = car; extraVehicles.add(car);
    G.banner('Stored in your garage', `The ${car.model.name} will be here when you need it.`);
    audio.blip(660);
    save();
  }
}
function enterCar(car) {
  if (car.driver === 'traffic') {
    traffic.vehicles.splice(traffic.vehicles.indexOf(car), 1);
    commitCrime(1);   // grand theft auto
    peds.threaten(car.x, car.z, 0, 0, 10);
    G.banner('Stolen!', 'Harbor PD has been notified.');
  }
  if (car === storedCar) { storedCar = null; extraVehicles.delete(car); S.stored = null; save(); }
  player.car = car;
  car.driver = 'player';
  playerMesh.visible = false;
  audio.blip(520);
}
function busted() {
  const fine = Math.min(S.cash, TUNING.bustedFineBase + 50 * Math.floor(wanted));
  S.cash -= fine; hud.setCash(S.cash);
  if (player.car) exitCarInternal();
  wanted = 0; bust = 0;
  const rp = respawnPoint();
  placePlayer(rp.x, rp.z, 0);
  hud.bigText('BUSTED', '#ff5e5e');
  audio.sting('busted');
  G.banner(`Busted! Fine $${fine}`, 'Harbor PD thanks you for your donation.');
  save();
}
function wasted() {
  const fee = Math.min(S.cash, TUNING.wastedFee);
  S.cash -= fee; hud.setCash(S.cash);
  if (player.car) exitCarInternal();
  player.health = 100;
  wanted *= 0.5; bust = 0;
  const rp = respawnPoint();
  placePlayer(rp.x, rp.z, 0);
  hud.bigText('WASTED', '#e84118');
  audio.sting('wasted');
  G.banner(`Hospital bill $${fee}`, 'Try to keep the next body in one piece.');
  save();
}
function newGame() {
  if (player.car) { player.car.driver = 'parked'; player.car = null; playerMesh.visible = true; }
  if (storedCar) { extraVehicles.delete(storedCar); storedCar.dispose(scene); storedCar = null; }
  if (missions.active?.rico) G.removeVehicle(missions.active.rico);
  missions.active = null;
  S = { cash: TUNING.startCash, done: [], house: false, stored: null };
  wanted = 0; pinnedWanted = null; bust = 0; player.health = 100; unseenT = 0;
  applyHouseVisual();
  missions.refreshMarkers();
  placePlayer(CITY.spawn.x, CITY.spawn.z, CITY.spawn.heading);
  hud.setCash(S.cash);
  save();
}
function continueGame() {
  const data = loadSave();
  if (!data) { newGame(); return; }
  S = { cash: data.cash, done: data.done || [], house: !!data.house, stored: data.stored || null };
  wanted = 0; bust = 0; player.health = 100;
  applyHouseVisual();
  spawnStoredCar();
  missions.refreshMarkers();
  const rp = S.house ? { x: CITY.safehouse.homeX, z: CITY.safehouse.homeZ } : CITY.spawn;
  placePlayer(rp.x, rp.z, CITY.spawn.heading);
  hud.setCash(S.cash);
}

// ---------------------------------------------------------------- input
const keys = {};
let mouseDown = false;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyP' && mode !== 'menu') { togglePause(); return; }
  if (mode !== 'play') return;
  if (e.code === 'KeyE') toggleCar();
  if (e.code === 'KeyF') interact();
  if (e.code === 'KeyH' && player.car) audio.horn();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('mousedown', (e) => {
  if (mode !== 'play' || e.button !== 0) return;
  if (document.pointerLockElement === canvas) shove();
  else mouseDown = true;
});
addEventListener('mouseup', () => { mouseDown = false; });
addEventListener('mousemove', (e) => {
  if (mode !== 'play') return;
  if (document.pointerLockElement === canvas || mouseDown) {
    camYaw -= e.movementX * 0.0028;
    camPitch = clamp(camPitch + e.movementY * 0.0028, 0.05, 1.2);
    mouseQuiet = 0;
  }
});
function lockPointer() {
  try {
    const p = lockPointer();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch { /* pointer lock is a nicety, never an error */ }
}
canvas.addEventListener('click', () => {
  if (mode === 'play' && !shotName && document.pointerLockElement !== canvas) {
    lockPointer();
  }
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && mode === 'play' && started && !shotName) togglePause(true);
});
function togglePause(force) {
  const open = force === true ? true : mode !== 'pause';
  mode = open ? 'pause' : 'play';
  document.getElementById('pauseMenu').classList.toggle('open', open);
  if (!open) lockPointer();
}
document.getElementById('resumeBtn').addEventListener('click', () => togglePause(false));
document.getElementById('restartBtn').addEventListener('click', () => { newGame(); togglePause(false); G.banner('Vice Harbor', 'A fresh start for Dario Venn.'); });
document.getElementById('daySlider').addEventListener('input', (e) => city.setDaylight(e.target.value / 100));
document.getElementById('newGameBtn').addEventListener('click', () => { audio.ensure(); startGame(true); });
document.getElementById('continueBtn').addEventListener('click', () => { audio.ensure(); startGame(false); });
if (loadSave()) document.getElementById('continueBtn').style.display = '';
function startGame(fresh) {
  if (fresh) newGame(); else continueGame();
  started = true;
  mode = 'play';
  document.getElementById('startScreen').style.display = 'none';
  document.getElementById('hud').classList.add('on');
  if (!shotName) lockPointer();
  G.banner('Vice Harbor', 'Dario Venn washes up in Solmarina with $250 and a record.');
}

// ---------------------------------------------------------------- interactions
function nearestEnterable() {
  let best = null, bestD = 3.6;
  for (const v of allVehicles()) {
    if (v.driver !== 'traffic' && v.driver !== 'parked') continue;
    const d = dist2d(player.x, player.z, v.x, v.z);
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}
function toggleCar() {
  audio.ensure();
  if (player.car) { exitCarInternal(); audio.blip(420); return; }
  const car = nearestEnterable();
  if (car) enterCar(car);
}
function interact() {
  audio.ensure();
  const def = missions.nearStart();
  if (def) { if (missions.start(def)) audio.blip(740); return; }
  const SH = CITY.safehouse;
  if (!S.house && dist2d(player.x, player.z, SH.buyX, SH.buyZ) < 5.5) {
    if (S.cash >= TUNING.housePrice) {
      S.cash -= TUNING.housePrice; hud.setCash(S.cash);
      S.house = true; applyHouseVisual(); spawnStoredCar();
      audio.cash();
      G.banner('Safehouse purchased', 'The villa on Palm Row is yours. Store cars in the garage.');
      save();
    } else {
      G.banner('Safehouse — $2,500', `You need $${(TUNING.housePrice - S.cash).toLocaleString()} more. Run some jobs.`);
      audio.blip(220);
    }
    return;
  }
  if (S.house && storedCar && !player.car && dist2d(player.x, player.z, SH.homeX, SH.homeZ) < 6) {
    G.banner(`Your ${storedCar.model.name} is in the garage`, 'Walk over and press E to drive it.');
    audio.blip(660);
  }
}
function shove() {
  if (player.car || shoveCooldown > 0) return;
  let best = null, bestD = 2.9;
  for (const ped of peds.peds) {
    const d = dist2d(player.x, player.z, ped.x, ped.z);
    if (d < bestD && Math.abs(angleDelta(player.heading, Math.atan2(ped.x - player.x, ped.z - player.z))) < 0.9) { bestD = d; best = ped; }
  }
  if (!best) return;
  peds.threaten(best.x, best.z, player.vx, player.vz, 2.2);
  commitCrime(1);
  shoveCooldown = 1.2;
  audio.blip(170);
}
function updatePrompt() {
  if (player.car) {
    hud.prompt(player.car.dead ? 'Engine dead — E: step out' : null);
    return;
  }
  const def = missions.nearStart();
  if (def) { hud.prompt(`F — start Chapter ${def.chapter}: ${def.name} (+$${def.reward.toLocaleString()})`); return; }
  const SH = CITY.safehouse;
  if (!S.house && dist2d(player.x, player.z, SH.buyX, SH.buyZ) < 5.5) {
    hud.prompt(S.cash >= TUNING.housePrice ? 'F — buy the safehouse ($2,500)' : `Safehouse: $2,500 — you need $${(TUNING.housePrice - S.cash).toLocaleString()} more`);
    return;
  }
  if (S.house && storedCar && dist2d(player.x, player.z, SH.homeX, SH.homeZ) < 6) {
    hud.prompt(`F — your ${storedCar.model.name} is in the garage`);
    return;
  }
  const car = nearestEnterable();
  hud.prompt(car ? `E — enter ${car.model.name}` : null);
}

// ---------------------------------------------------------------- per-frame updates
function updateFoot(dt) {
  const ch = camYaw + Math.PI;   // heading the camera faces
  const fx = Math.sin(ch), fz = Math.cos(ch);
  const rx = -Math.cos(ch), rz = Math.sin(ch);
  let mx = 0, mz = 0;
  if (keys.KeyW || keys.ArrowUp) { mx += fx; mz += fz; }
  if (keys.KeyS || keys.ArrowDown) { mx -= fx; mz -= fz; }
  if (keys.KeyD || keys.ArrowRight) { mx += rx; mz += rz; }
  if (keys.KeyA || keys.ArrowLeft) { mx -= rx; mz -= rz; }
  const len = Math.hypot(mx, mz);
  const sprint = keys.ShiftLeft || keys.ShiftRight;
  const speed = len > 0 ? (sprint ? 7.6 : 4.4) : 0;
  if (len > 0) {
    mx /= len; mz /= len;
    player.heading = turnToward(player.heading, Math.atan2(mx, mz), dt * 11);
    let nx = player.x + mx * speed * dt;
    let nz = player.z + mz * speed * dt;
    [nx, nz] = collideCircle(currentWorld().colliders, nx, nz, 0.55);
    player.vx = (nx - player.x) / dt; player.vz = (nz - player.z) / dt;
    player.x = nx; player.z = nz;
    player.phase += dt * speed * 1.55;
    animatePerson(playerMesh, player.phase, true);
  } else {
    player.vx = 0; player.vz = 0;
    player.phase += dt * 1.4;
    animatePerson(playerMesh, player.phase, false);
  }
  player.speed = Math.hypot(player.vx, player.vz);
  playerMesh.position.set(player.x, baseYAt(player.x, player.z), player.z);
  playerMesh.rotation.y = player.heading;
}
function updateCar(dt) {
  const car = player.car;
  const ctrl = {
    throttle: (keys.KeyW || keys.ArrowUp ? 1 : 0) + (keys.KeyS || keys.ArrowDown ? -1 : 0),
    steer: (keys.KeyA || keys.ArrowLeft ? 1 : 0) + (keys.KeyD || keys.ArrowRight ? -1 : 0),
    handbrake: !!keys.Space,
  };
  car.step(dt, ctrl, currentWorld());
  for (const ev of car.events.splice(0)) {
    if (ev.type === 'crash') { audio.crash(clamp(ev.speed / 26, 0.25, 1)); shake = Math.min(0.6, ev.speed * 0.02); }
    if (ev.type === 'dead') G.banner('Engine dead', 'This one is done for. Step out with E and find another ride.');
  }
  player.x = car.x; player.z = car.z; player.heading = car.heading;
  player.vx = Math.sin(car.heading) * car.speed;
  player.vz = Math.cos(car.heading) * car.speed;
  player.speed = car.speed;
  if (Math.abs(car.speed) > 8) peds.threaten(car.x, car.z, player.vx, player.vz, 13);
  // hit-and-run: peds in the path of a moving car
  if (Math.abs(car.speed) > 4.5) {
    for (const ped of peds.peds) {
      if (dist2d(car.x, car.z, ped.x, ped.z) < 2.4) {
        peds.threaten(ped.x, ped.z, player.vx, player.vz, 3);
        if (hitRunCooldown <= 0) { commitCrime(1.5); hitRunCooldown = 5; G.banner('Hit and run!', 'Harbor PD is on its way.'); }
      }
    }
  }
}
function updateWorld(dt) {
  elapsed += dt;
  hitTimer -= dt; shoveCooldown -= dt; hitRunCooldown -= dt; hornTimer -= dt; mouseQuiet += dt;
  const world = currentWorld();
  traffic.update(dt, world);
  peds.update(dt);
  if (player.car) updateCar(dt); else updateFoot(dt);
  const proxy = { x: player.x, z: player.z, vx: player.vx, vz: player.vz, speed: Math.abs(player.speed) };
  police.update(dt, { player: proxy, wanted, vehicles: world.vehicles, world });
  missions.update(dt);
  city.update(dt);
  // --- wanted decay while unseen
  let nearestCopD = Infinity;
  for (const cop of police.cops) nearestCopD = Math.min(nearestCopD, dist2d(cop.x, cop.z, player.x, player.z));
  lastNearestCopD = nearestCopD;
  const seen = nearestCopD < 62 || !!police.heli;
  if (seen) unseenT = 0; else unseenT += dt;
  if (wanted > 0 && unseenT > 4 && pinnedWanted === null) wanted = Math.max(0, wanted - TUNING.wantedDecayPerSec * dt);
  // --- bust meter
  if (wanted > 0 && nearestCopD < 9.5 && Math.abs(player.speed) < 2.2) bust += TUNING.bustFillPerSec * dt;
  else bust = Math.max(0, bust - TUNING.bustDrainPerSec * dt);
  if (bust >= 1) { busted(); return; }
  // --- on-foot injuries from moving vehicles
  if (!player.car && hitTimer <= 0) {
    for (const v of world.vehicles) {
      if (Math.abs(v.speed) > 5 && dist2d(v.x, v.z, player.x, player.z) < 2.4) {
        player.health -= 20 + Math.abs(v.speed) * 0.4;
        lastHurtT = elapsed; hitTimer = 1.1;
        const away = Math.atan2(player.x - v.x, player.z - v.z);
        let nx = player.x + Math.sin(away) * 3, nz = player.z + Math.cos(away) * 3;
        [nx, nz] = collideCircle(world.colliders, nx, nz, 0.55);
        player.x = nx; player.z = nz;
        audio.crash(0.7);
        if (player.health <= 0) { wasted(); return; }
        break;
      }
    }
  }
  if (player.health < 100 && elapsed - lastHurtT > 6) player.health = Math.min(100, player.health + 7 * dt);
  // --- audio beds
  audio.setEngine(!!player.car, player.car ? Math.abs(player.car.speed) / player.car.model.topSpeed : 0);
  const closing = nearestCopD === Infinity ? 0 : clamp((updateWorld._prevCopD - nearestCopD) / Math.max(dt, 0.001), -30, 30);
  updateWorld._prevCopD = nearestCopD;
  audio.setSiren(nearestCopD === Infinity ? 999 : nearestCopD, closing);
  const hp = police.heliPos();
  audio.setHeli(hp ? Math.hypot(hp.x - player.x, hp.z - player.z, hp.y) : null);
  if (hornTimer <= 0 && dist2d(player.x, player.z, 190, 257) < TUNING.boatHornRange) { audio.boatHorn(); hornTimer = randRange(rng, 20, 36); }
  // --- HUD
  hud.setWanted(wanted);
  hud.setBust(bust > 0.02 ? bust : null);
  if (player.car) { hud.setDrive(player.car.speed * 3.6, player.car.health / 100); hud.setHealth(null); }
  else { hud.setDrive(null); hud.setHealth(player.health < 99.5 ? player.health / 100 : null); }
  hud.drawMinimap({
    player: { x: player.x, z: player.z, heading: player.heading },
    target: missions.target(),
    rival: missions.active?.rico ? { x: missions.active.rico.x, z: missions.active.rico.z } : null,
    cops: police.cops, boats: city.cruisers.map((c) => ({ x: c.g.position.x, z: c.g.position.z })),
    houseOwned: S.house,
  });
  updatePrompt();
}
updateWorld._prevCopD = 999;
function updateCamera(dt) {
  if (mode === 'menu') {
    const t = performance.now() * 0.00004;
    camera.position.set(Math.sin(t) * 170, 62, 60 + Math.cos(t) * 170);
    camera.lookAt(0, 4, 40);
    return;
  }
  if (shotCam) { camera.position.copy(shotCam.pos); camera.lookAt(shotCam.target); return; }
  const car = player.car;
  const targetPos = new THREE.Vector3(player.x, (car ? 1.4 : 1.6), player.z);
  camTarget.x = damp(camTarget.x, targetPos.x, car ? 7 : 13, dt);
  camTarget.y = damp(camTarget.y, targetPos.y, 8, dt);
  camTarget.z = damp(camTarget.z, targetPos.z, car ? 7 : 13, dt);
  if (car && mouseQuiet > 1.2) {
    camYaw += angleDelta(camYaw, car.heading + Math.PI) * (1 - Math.exp(-2.6 * dt));
  }
  const dist = car ? 10.5 + Math.abs(car.speed) * 0.13 : 7.6;
  const hd = Math.cos(camPitch) * dist;
  const px = camTarget.x + Math.sin(camYaw) * hd;
  const pz = camTarget.z + Math.cos(camYaw) * hd;
  const py = camTarget.y + Math.sin(camPitch) * dist;
  shake = Math.max(0, shake - dt * 1.4);
  camera.position.set(
    px + (Math.random() - 0.5) * shake,
    Math.max(py, baseYAt(px, pz) + 0.65) + (Math.random() - 0.5) * shake * 0.5,
    pz + (Math.random() - 0.5) * shake,
  );
  camera.lookAt(camTarget.x, camTarget.y + 0.4, camTarget.z);
}
function damp(a, b, lambda, dt) { return a + (b - a) * (1 - Math.exp(-lambda * dt)); }

// ---------------------------------------------------------------- shot staging API + debug hook
let shotCam = null;   // staged camera for screenshot mode: { pos, target }
const shotApi = {
  scene, camera, renderer, player, hud, missions, police, traffic, peds,
  allVehicles, enterCar, exitCar: exitCarInternal,
  setWanted(n) { wanted = n; },
  getWanted: () => wanted,
  teleport(x, z, heading = 0) { if (player.car) exitCarInternal(); placePlayer(x, z, heading); },
  setCamera(x, y, z, tx, ty, tz) {
    shotCam = { pos: new THREE.Vector3(x, y, z), target: new THREE.Vector3(tx, ty, tz) };
    camera.position.copy(shotCam.pos); camera.lookAt(shotCam.target);
  },
  banner: (t, s) => G.banner(t, s),
  setDaylight: (v) => city.setDaylight(v),
  startMission(id) { const def = missions.defById(id); placePlayer(def.start.x, def.start.z, player.heading); return missions.start(def); },
  cash: () => S.cash,
};
window.__game = {
  get state() {
    return {
      cash: S.cash, wanted, bust, health: player.health, done: [...S.done], house: S.house,
      stored: S.stored, inCar: !!player.car, mode,
      player: { x: player.x, z: player.z, heading: player.heading, speed: player.speed },
      car: player.car ? { model: player.car.model.id, health: player.car.health, dead: player.car.dead, speed: player.car.speed } : null,
      mission: missions.active ? { id: missions.active.def.id, stage: missions.active.stage ?? null, gate: missions.active.gate ?? null, ricoGate: missions.active.ricoGate ?? null, timer: missions.active.timer ?? null } : null,
      cops: police.cops.length, heli: !!police.heli, blocks: police.blocks.length,
      peds: peds.peds.length, traffic: traffic.vehicles.length,
    };
  },
  player, missions, police, traffic, peds, hud, scene, camera,
  start: (fresh) => startGame(fresh),
  newGame, save, loadSave,
  teleport: shotApi.teleport, enterCar, exitCar: exitCarInternal, interact, toggleCar,
  setWanted: shotApi.setWanted, addCash: (n) => G.addCash(n),
  setCash(n) { S.cash = n; hud.setCash(n); },
  startMission: shotApi.startMission,
  vehicles: allVehicles, world: currentWorld,
  setDaylight: shotApi.setDaylight,
  stage: (name) => stageShot(name, shotApi),
  setCamera: shotApi.setCamera,
  keys,
};

// ---------------------------------------------------------------- boot + loop
if (shotName) {
  startGame(true);
  setTimeout(() => stageShot(shotName, shotApi), 600);
}
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (mode === 'play') updateWorld(dt);
  else if (mode === 'menu') city.update(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}
frame();
