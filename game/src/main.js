// Vice Harbor — main entry: builds Solmarina, wires every system together and
// runs the game. Title screen and story, free-roam on foot and by car, traffic,
// pedestrians, Harbor PD and the wanted level, Madame Lola's missions, busted
// and wasted, and a save in localStorage. The v3 pass adds the PD helicopter
// at five stars, engines that die for good when wrecked (smoke, flames, no
// restart), and a buyable safehouse whose lot doubles as Dario's garage. The
// v3.1 polish pass breathes life into the margins: gulls over the beach,
// strollers who stop for a chat, cruising boats that sound their horn near
// the quay, and a safehouse marker that glows like it means it.
import * as THREE from 'three';
import { CITY, PALETTE, STORY, TUNING, CAR_MODELS, CAR_WEIGHTS, SAFEHOUSE } from './config.js';
import { clamp, angleLerp, makeRng, weightedPick } from './random.js';
import { buildCity, buildLaneGraph, collideCircle } from './city.js';
import { TrafficSystem, makeVehicle, stepVehicle, syncVehicleMesh, makeWreckFx } from './cars.js';
import { Player, PedestrianSystem } from './people.js';
import { PoliceSystem } from './police.js';
import { MissionSystem, MISSION_DEFS } from './missions.js';
import { Hud } from './hud.js';
import { AudioSys } from './audio.js';
import { signTexture } from './textures.js';
import { initShots } from './shots.js';

const SAVE_KEY = 'viceharbor.save.v1';
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf2a65e, 190, 780);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2400);
camera.position.set(24, 4, 196);

const hemi = new THREE.HemisphereLight(0xffe3b3, 0x54607a, 0.95); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffc37a, 1.9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -95; sun.shadow.camera.right = 95;
sun.shadow.camera.top = 95; sun.shadow.camera.bottom = -95;
sun.shadow.camera.far = 700; sun.shadow.bias = -0.0006;
scene.add(sun); scene.add(sun.target);

const city = buildCity(scene);
const graph = buildLaneGraph();
const traffic = new TrafficSystem(scene, graph, city.colliders, 5, TUNING.trafficCount);
const peds = new PedestrianSystem(scene, city.sidewalkLoops, city.colliders, 9, TUNING.pedCount);
const player = new Player(scene);
const police = new PoliceSystem(scene, city.colliders);
const missions = new MissionSystem(scene);
const hud = new Hud();
const audio = new AudioSys();

// parked cars the player can steal — the full v2 model range, weighted like traffic
const parkedCars = [];
{
  const rng = makeRng(7);
  let i = 0;
  for (const spot of city.parkedSpots) {
    if (i++ % 5 === 4) continue;                     // leave some spots empty
    const model = weightedPick(rng, CAR_MODELS, CAR_WEIGHTS);
    const v = makeVehicle(model, PALETTE.carPaints[i % PALETTE.carPaints.length], spot.x, spot.z, spot.heading);
    v.driver = 'parked';
    scene.add(v.group);
    parkedCars.push(v);
  }
}

const wreckFx = makeWreckFx();
scene.add(wreckFx.group);

// Dario's safehouse: a glowing lot marker and a sign on the parking block —
// gold while it is for sale, teal once it is home (see refreshSafehouseMark)
const safehouseMats = {
  ring: new THREE.MeshBasicMaterial({ color: 0xffc93e, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  glow: new THREE.MeshBasicMaterial({ color: 0xffc93e, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
};
const safehouseMark = new THREE.Group();   // kept at module scope: frame() breathes its glow (v3.1)
{
  const mark = safehouseMark;
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.1, 3.1, 28), safehouseMats.ring);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; mark.add(ring);
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 11, 20, 1, true), safehouseMats.glow);
  glow.position.y = 5.5; mark.add(glow);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 2),
    new THREE.MeshBasicMaterial({ map: signTexture(makeRng(99), 'SAFEHOUSE') }),
  );
  sign.position.set(0, 3.6, -6); mark.add(sign);   // faces the boulevard the lot fronts
  mark.position.set(SAFEHOUSE.x, 0, SAFEHOUSE.z);
  scene.add(mark);
}
function refreshSafehouseMark() {
  const c = G.safehouse ? 0x2ee6a8 : 0xffc93e;
  safehouseMats.ring.color.setHex(c);
  safehouseMats.glow.color.setHex(c);
}

const G = {
  mode: 'title',            // title | play | pause | over
  cash: 250, wanted: 0, unspotted: 0, crimeCooldown: 0,
  car: null,                // the vehicle the player is driving, if any
  safehouse: false,         // the lot is bought: respawns land there
  storedCar: null,          // the vehicle sleeping in the safehouse garage, if any
  health: 100, damageCooldown: 0, time: 0, saveTimer: 0, brightness: 100,
  boatHornT: 6,             // seconds until a cruising boat may sound its horn (v3.1)
  camYaw: Math.PI, camPitch: 0.32, camDist: 8,
  panics: [],               // {x, z, ttl} — places pedestrians flee from
};
player.health = 100;

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.cash, completed: [...missions.completed], health: 100,
      safehouse: G.safehouse,
      storedCar: G.storedCar ? { model: CAR_MODELS.indexOf(G.storedCar.model), paint: G.storedCar.paintHex } : null,
    }));
  } catch { /* private mode: play unsaved */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    G.cash = s.cash ?? 250;
    for (const id of s.completed || []) missions.completed.add(id);
    G.safehouse = !!s.safehouse;
    if (s.storedCar) {
      // rebuild the garaged car from its model and paint; its group stays out
      // of the scene until F calls it out of the garage
      const v = makeVehicle(CAR_MODELS[s.storedCar.model] || CAR_MODELS[1], s.storedCar.paint ?? 0xd64541, SAFEHOUSE.garageX, SAFEHOUSE.garageZ, 0);
      v.driver = 'stored';
      G.storedCar = v;
    }
    return true;
  } catch { return false; }
}
const hasSave = loadGame();
refreshSafehouseMark();
document.getElementById('storyText').textContent = STORY.intro;
document.getElementById('continueBtn').style.display = hasSave ? '' : 'none';

// ---------------------------------------------------------------- input
const keys = new Set();
let shoveQueued = false, dragLook = null;
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'KeyE' && !e.repeat) onActionKey('E');
  if (e.code === 'KeyF' && !e.repeat) onActionKey('F');
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) togglePause();
  if (e.code === 'KeyH' && !e.repeat && G.mode === 'play' && G.car) audio.blip('horn', 1);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('mousedown', (e) => {
  dragLook = { x: e.clientX, y: e.clientY };
  if (G.mode === 'play' && !G.car) shoveQueued = true;
  if (G.mode === 'play') canvas.requestPointerLock?.();
});
window.addEventListener('mouseup', () => { dragLook = null; });
window.addEventListener('mousemove', (e) => {
  if (G.mode !== 'play') return;
  if (document.pointerLockElement === canvas) {
    G.camYaw -= e.movementX * 0.0026;
    G.camPitch = clamp(G.camPitch + e.movementY * 0.0022, 0.06, 1.15);
  } else if (dragLook) {
    G.camYaw -= (e.clientX - dragLook.x) * 0.005;
    G.camPitch = clamp(G.camPitch + (e.clientY - dragLook.y) * 0.004, 0.06, 1.15);
    dragLook = { x: e.clientX, y: e.clientY };
  }
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function startGame(fresh) {
  if (fresh) {
    G.cash = 250; missions.completed.clear();
    G.safehouse = false; G.storedCar = null; refreshSafehouseMark();
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }
  G.health = 100; player.health = 100;
  document.getElementById('titleScreen').style.display = 'none';
  document.getElementById('endScreen').style.display = 'none';
  G.mode = 'play';
  audio.start();
  hud.toast(fresh ? `Welcome back to ${STORY.city}, ${STORY.hero}` : 'Back on the street', 2600);
}
document.getElementById('newGameBtn').addEventListener('click', () => startGame(true));
document.getElementById('continueBtn').addEventListener('click', () => startGame(false));
document.getElementById('respawnBtn').addEventListener('click', () => respawn());
// click anywhere on the title screen (not on a button) and you are in: the live
// city behind the menu is the invitation
document.getElementById('titleScreen').addEventListener('click', (e) => {
  if (e.target.closest('button')) return;
  startGame(!hasSave);
});

// ---------------------------------------------------------------- pause & daylight
function togglePause() {
  if (G.mode === 'play') {
    G.mode = 'pause';
    document.getElementById('pauseScreen').style.display = 'flex';
    document.exitPointerLock?.();
  } else if (G.mode === 'pause') resumeGame();
}
function resumeGame() {
  if (G.mode !== 'pause') return;
  document.getElementById('pauseScreen').style.display = 'none';
  G.mode = 'play';
}
document.getElementById('resumeBtn').addEventListener('click', resumeGame);
document.getElementById('respawnBtn2').addEventListener('click', () => {
  document.getElementById('pauseScreen').style.display = 'none';
  respawn();
});
/** The daylight slider: one value drives exposure, sky light and sun together. */
function applyBrightness(v) {
  G.brightness = v;
  const f = v / 100;
  renderer.toneMappingExposure = 1.12 * (0.35 + f * 0.65);
  hemi.intensity = 0.95 * (0.4 + f * 0.6);
  sun.intensity = 1.9 * (0.35 + f * 0.65);
}
document.getElementById('brightSlider').addEventListener('input', (e) => applyBrightness(Number(e.target.value)));

// ---------------------------------------------------------------- crimes & consequences
function addCrime(stars, why) {
  if (G.mode !== 'play') return;
  const before = G.wanted;
  G.wanted = clamp(Math.max(G.wanted, stars), 0, 5);
  G.unspotted = 0;
  if (G.wanted > before) hud.toast(`★ ${why}`, 1500);
}
function endRun(kind) {
  G.mode = 'over';
  police.clear();
  const fine = kind === 'busted' ? Math.min(G.cash, 300) : Math.min(G.cash, 250);
  G.cash -= fine;
  document.getElementById('endTitle').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  document.getElementById('endTitle').style.color = kind === 'busted' ? '#4aa8ff' : '#ff5e57';
  document.getElementById('endText').textContent = kind === 'busted'
    ? `Harbor PD finally boxed ${STORY.hero} in. Bail and fines cost $${fine}.`
    : `${STORY.hero} woke up outside St. Marina Hospital. The bill came to $${fine}.`;
  document.getElementById('endScreen').style.display = 'flex';
  audio.blip('sting');
  document.exitPointerLock?.();
  saveGame();
}
function respawn() {
  if (G.car) exitCar(true);
  G.wanted = 0; G.unspotted = 0; G.health = 100; player.health = 100;
  if (G.safehouse) { player.x = SAFEHOUSE.x; player.z = SAFEHOUSE.z + 2; player.heading = Math.PI; }
  else { player.x = -48; player.z = -2; player.heading = Math.PI / 2; }
  player.syncMesh();
  document.getElementById('endScreen').style.display = 'none';
  G.mode = 'play';
  hud.toast('Back on the street', 1800);
}

// ---------------------------------------------------------------- cars: enter, exit, steal
function nearestVehicle(maxDist) {
  let best = null, bestD = maxDist;
  for (const v of [...parkedCars, ...traffic.cars]) {
    const d = Math.hypot(v.x - player.x, v.z - player.z);
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}
function enterCar(v) {
  const wasTraffic = v.driver === 'traffic';
  if (wasTraffic) { traffic.removeCar(v); addCrime(1, 'Carjacking!'); }
  else if (Math.random() < 0.55) { addCrime(1, 'Car alarm — the police heard that'); audio.blip('alarm'); }
  const pi = parkedCars.indexOf(v); if (pi >= 0) parkedCars.splice(pi, 1);
  v.driver = 'player';
  G.car = v;
  player.group.visible = false;
  hud.toast(v.model.name, 1200);
}
function exitCar(silent = false) {
  const v = G.car; if (!v) return;
  v.driver = 'parked'; v.speed = 0;
  parkedCars.push(v);
  G.car = null;
  // stepping out inside your own garage radius stores the car instead of
  // abandoning it on the lot: it sleeps out of the world until F calls it back
  if (G.safehouse && !G.storedCar && Math.hypot(v.x - SAFEHOUSE.garageX, v.z - SAFEHOUSE.garageZ) < SAFEHOUSE.storeRadius) {
    parkedCars.splice(parkedCars.indexOf(v), 1);
    scene.remove(v.group);
    v.driver = 'stored';
    G.storedCar = v;
    if (!silent) { hud.toast('Garaged — she\'ll be here when you need her', 2000); audio.blip('garage'); saveGame(); }
  }
  player.x = v.x + Math.cos(v.heading) * 1.9;
  player.z = v.z - Math.sin(v.heading) * 1.9;
  const [cx, cz] = collideCircle(city.colliders, player.x, player.z, 0.45);
  player.x = cx; player.z = cz; player.heading = v.heading; player.syncMesh();
  player.group.visible = true;
  if (!silent) hud.setSpeed(null);
}
/** F at the lot marker: buy the safehouse, or call the garaged car back out. */
function safehouseInteract() {
  if (Math.hypot(player.x - SAFEHOUSE.x, player.z - SAFEHOUSE.z) > 5.5) return false;
  if (!G.safehouse) {
    if (G.cash >= SAFEHOUSE.price) {
      G.cash -= SAFEHOUSE.price;
      G.safehouse = true; refreshSafehouseMark();
      hud.toast('Safehouse bought — you respawn here now, and the lot is your garage', 3400);
      audio.blip('cash'); saveGame();
    } else {
      hud.toast(`The safehouse costs $${SAFEHOUSE.price.toLocaleString('en-US')} — Lola's work pays better`, 2400);
    }
    return true;
  }
  if (G.storedCar) {
    const v = G.storedCar; G.storedCar = null;
    v.x = SAFEHOUSE.garageX; v.z = SAFEHOUSE.garageZ; v.heading = 0; v.speed = 0; v.driver = 'player';
    scene.add(v.group); syncVehicleMesh(v, 0);
    G.car = v;
    player.group.visible = false;
    player.x = v.x; player.z = v.z; player.heading = 0;
    hud.toast(v.model.name, 1200); audio.blip('garage');
    return true;
  }
  hud.toast('Garage is empty — step out of a car on the lot to store it', 2200);
  return true;
}
function onActionKey(which) {
  if (G.mode !== 'play') return;
  if (which === 'E') {
    if (G.car) { if (Math.abs(G.car.speed) < 1.5) exitCar(); }
    else { const v = nearestVehicle(3.6); if (v) enterCar(v); }
  }
  if (which === 'F' && !G.car) {
    if (!safehouseInteract() && missions.tryStart(player.x, player.z)) audio.blip('checkpoint');
  }
  if (which === 'F' && G.car) {
    if (missions.tryStart(G.car.x, G.car.z)) audio.blip('checkpoint');
  }
}

// ---------------------------------------------------------------- the race rival
// Rico drives the harbour loop through the road intersections between gates, so
// he races the streets instead of beelining through the blocks.
const RACE_DEF = MISSION_DEFS.find((d) => d.id === 'race');
const RACE_ROUTE = [
  { x: -120, z: 160, gate: 0 }, { x: 116, z: 160, gate: 1 }, { x: 196, z: 160 },
  { x: 196, z: 84, gate: 2 }, { x: 196, z: -76, gate: 3 }, { x: 196, z: -156 },
  { x: 116, z: -156, gate: 4 }, { x: -44, z: -156, gate: 5 }, { x: -196, z: -156 },
  { x: -196, z: -84, gate: 6 }, { x: -196, z: 168, gate: 7 },
];
let rival = null;   // { v, wp, gates }
function spawnRival() {
  removeRival();
  missions.rivalStage = 0;   // removeRival reset it to -1; the race HUD counts from gate 1
  const model = CAR_MODELS.find((m) => m.kind === 'sports');
  const v = makeVehicle(model, 0xc86bff, RACE_DEF.start.x + 7, RACE_DEF.start.z - 4, Math.PI / 2);
  v.driver = 'rival';
  scene.add(v.group);
  rival = { v, wp: 0, gates: 0 };
}
function removeRival() {
  if (rival) { scene.remove(rival.v.group); rival = null; }
  missions.rivalStage = -1;
}
function updateRival(dt) {
  if (!rival) return;
  const v = rival.v;
  const target = RACE_ROUTE[rival.wp];
  if (!target) return;
  const dx = target.x - v.x, dz = target.z - v.z, dist = Math.hypot(dx, dz);
  if (dist < 9) {
    if (target.gate !== undefined) { rival.gates += 1; missions.rivalStage = rival.gates; }
    rival.wp += 1;
    if (rival.wp >= RACE_ROUTE.length) {
      if (missions.active && missions.active.def.id === 'race') missions.forceFail('outraced');
      removeRival();
    }
    return;
  }
  const la = clamp(6 + v.speed * 0.7, 6, 16);
  const lx = v.x + (dx / dist) * la, lz = v.z + (dz / dist) * la;
  const want = Math.atan2(lx - v.x, lz - v.z);
  let dh = want - v.heading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
  const steer = clamp(dh * 1.6, -1, 1);
  const top = v.model.speed * TUNING.rivalSpeedFactor;
  stepVehicle(v, { throttle: v.speed < top ? 0.85 : 0, steer, brake: false }, dt);
  if (v.speed > top) v.speed = top;
  const [cx, cz] = collideCircle(city.colliders, v.x, v.z, 1.3);
  if (cx !== v.x || cz !== v.z) v.speed *= 0.6;
  v.x = clamp(cx, -252, 252); v.z = clamp(cz, -212, 304);
  syncVehicleMesh(v, dt);
}

// mission events
missions.onEvent = (type, data) => {
  if (type === 'start') {
    hud.toast(`${data.def.name} — ${data.def.blurb}`, 3200);
    if (data.def.id === 'race') spawnRival();
  }
  if (type === 'stage') { hud.toast('Checkpoint! Keep going', 1400); audio.blip('checkpoint'); }
  if (type === 'bonus') { hud.toast(`Drop made — +${data.seconds}s on the clock`, 1600); audio.blip('checkpoint'); }
  if (type === 'heat') { addCrime(data.stars, 'The package is hot!'); }
  if (type === 'complete') {
    G.cash += data.reward;
    hud.toast(`Mission complete — +$${data.reward}`, 3000);
    audio.blip('cash');
    removeRival();
    saveGame();
  }
  if (type === 'fail') {
    removeRival();
    hud.toast(data.reason === 'outraced'
      ? 'Rico took the purse — the rematch still stands'
      : `${data.def.name} failed — the offer still stands`, 2600);
  }
};

// ---------------------------------------------------------------- per-frame systems
function playerFootInput() {
  let ix = 0, iz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iz += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  // rotate the input by the camera yaw so W always walks away from the camera:
  // camera forward on the ground is (sin yaw, cos yaw), its right is (-cos yaw, sin yaw)
  const s = Math.sin(G.camYaw), c = Math.cos(G.camYaw);
  return { x: -iz * s - ix * c, z: -iz * c + ix * s, sprint: keys.has('ShiftLeft') || keys.has('ShiftRight') };
}
function carInput() {
  let throttle = 0, steer = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) throttle += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) throttle -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) steer += 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) steer -= 1;
  return { throttle, steer, brake: keys.has('Space') && G.car.speed > 1, handbrake: keys.has('Space') };
}

function vehicleBumps(dt) {
  // the player's car (or body) against every other vehicle: push apart, dent, and answer for it
  const me = G.car ? { x: G.car.x, z: G.car.z, r: 1.8, v: G.car } : { x: player.x, z: player.z, r: 0.55, v: null };
  const others = [...traffic.cars, ...parkedCars, ...police.cops, ...(rival ? [rival.v] : [])];
  for (const o of others) {
    const dx = me.x - o.x, dz = me.z - o.z;
    const d = Math.hypot(dx, dz), min = me.r + o.r;
    if (d > min || d === 0) continue;
    const nx = dx / d, nz = dz / d, overlap = min - d;
    const mySpeed = me.v ? me.v.speed : player.speedNow;
    if (me.v) {
      me.v.x += nx * overlap * 0.7; me.v.z += nz * overlap * 0.7;
      const impact = Math.abs(mySpeed) + Math.abs(o.speed);
      if (impact > 5 && G.crimeCooldown <= 0) {
        audio.blip('crash', clamp(impact / 16, 0.3, 1));
        hud.flashDamage(0.4);
        G.panics.push({ x: o.x, z: o.z, ttl: 3 });
        me.v.health -= (impact - 4) * 2.4;
        G.health -= Math.max(0, (impact - 7)) * 0.9;
        if (o.driver === 'police') addCrime(2, 'You rammed Harbor PD!');
        else if (o.driver === 'traffic') addCrime(1, 'Hit and run!');
        G.crimeCooldown = 3;
      }
      me.v.speed *= 0.45; o.speed *= 0.6;
    } else {
      // on foot: a moving car that reaches the player knocks them down a peg
      if (Math.abs(o.speed) > 4.5 && G.damageCooldown <= 0) {
        G.health -= 13; G.damageCooldown = 1.2;
        player.x += nx * 2.4; player.z += nz * 2.4; player.syncMesh();
        hud.flashDamage(0.8); audio.blip('crash', 0.7);
        if (o.driver === 'traffic') addCrime(0, '');
      }
    }
  }
  // traffic, police and Rico also bump each other gently (keeps the chase honest)
  const movers = [...traffic.cars, ...police.cops, ...(rival ? [rival.v] : [])];
  for (let i = 0; i < movers.length; i++) for (let j = i + 1; j < movers.length; j++) {
    const a = movers[i], b = movers[j];
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d > 0.01 && d < a.r + b.r) {
      const push = (a.r + b.r - d) / 2, nx = dx / d, nz = dz / d;
      a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
      a.speed *= 0.8; b.speed *= 0.8;
    }
  }
}

function shove() {
  // a shove: the nearest pedestrian within reach goes down; witnesses do not love it
  let best = null, bestD = 1.9;
  for (const ped of peds.peds) {
    const d = Math.hypot(ped.x - player.x, ped.z - player.z);
    if (d < bestD) { bestD = d; best = ped; }
  }
  if (best) {
    peds.knockDown(best, player.x, player.z);
    G.panics.push({ x: best.x, z: best.z, ttl: 2.5 });
    if (G.crimeCooldown <= 0) { addCrime(1, 'Assault in broad daylight'); G.crimeCooldown = 4; }
    audio.blip('crash', 0.4);
  }
}

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.time += dt;
  city.update(dt);
  if (G.mode === 'title') {
    // the city lives behind the menu: traffic rolls, people stroll
    traffic.update(dt, { x: player.x, z: player.z, car: null });
    peds.update(dt, []);
  }
  if (G.mode === 'play') {
    G.crimeCooldown = Math.max(0, G.crimeCooldown - dt);
    G.damageCooldown = Math.max(0, G.damageCooldown - dt);
    G.panics = G.panics.filter((p) => (p.ttl -= dt) > 0);

    if (G.car) {
      const input = carInput();
      const v = G.car;
      if (v.health <= 0 && !v.dead) {   // the hit that kills the engine: it never restarts (v3)
        v.health = 0; v.dead = true;
        hud.toast('Engine dead — she\'s scrap now. Find another ride', 2600);
        audio.blip('crash', 0.9);
      }
      const healthFactor = v.dead ? 0 : v.health <= TUNING.limpEngineHealth ? 0.55 : 1;
      stepVehicle(v, { ...input, throttle: input.throttle * healthFactor }, dt);
      const [cx, cz] = collideCircle(city.colliders, v.x, v.z, 1.35);
      if (cx !== v.x || cz !== v.z) {
        if (Math.abs(v.speed) > 7 && G.crimeCooldown <= 0) { audio.blip('crash', 0.6); G.health -= 3; G.crimeCooldown = 2; }
        v.speed *= 0.5;
      }
      v.x = clamp(cx, -252, 252);
      // the quay is drivable: within its span the car may roll to the pier head,
      // everywhere else the waterline stops at the sand
      const onPier = cx > CITY.pier.minX - 6 && cx < CITY.pier.maxX + 6;
      v.z = clamp(cz, -212, onPier ? 302 : 234);
      syncVehicleMesh(v, dt);
      player.x = v.x; player.z = v.z; player.heading = v.heading;
      G.camYaw = angleLerp(G.camYaw, v.heading, Math.min(1, dt * 2.2));
      hud.setSpeed(Math.abs(v.speed) * 3.6, v.model.name);
      // running someone down is the city's least forgivable crime
      for (const ped of peds.peds) {
        if (ped.state !== 'down' && Math.hypot(ped.x - v.x, ped.z - v.z) < 1.9 && Math.abs(v.speed) > 3) {
          peds.knockDown(ped, v.x, v.z);
          addCrime(2, 'You ran someone down!');
          G.panics.push({ x: ped.x, z: ped.z, ttl: 4 });
          audio.blip('crash', 0.8); hud.flashDamage(0.5);
        }
      }
    } else {
      player.update(dt, playerFootInput(), city.colliders);
      // the sea is not a sidewalk: away from the quay, the waterline pushes you back to the sand
      if (player.z > 235 && !(player.x > CITY.pier.minX - 2 && player.x < CITY.pier.maxX + 2)) {
        player.z = 235; player.syncMesh();
      }
      if (shoveQueued) { shove(); }
      hud.setSpeed(null);
    }
    shoveQueued = false;

    // the wreck plume follows the player's car: a wisp while the engine is
    // sick, the full smoke-and-flame show once it is dead
    const wreckLevel = G.car ? (G.car.dead ? 1 : G.car.health <= TUNING.sickEngineHealth ? 0.45 : 0) : 0;
    if (wreckLevel > 0) {
      wreckFx.group.position.set(
        G.car.x + Math.sin(G.car.heading) * 1.5, 0.85,
        G.car.z + Math.cos(G.car.heading) * 1.5,
      );
    }
    wreckFx.update(dt, wreckLevel);

    // the safehouse marker breathes (v3.1): glow and ring swell together,
    // gold while the lot is for sale, teal once it is home
    const shPulse = 0.5 + 0.5 * Math.sin(G.time * 2.2);
    safehouseMats.glow.opacity = 0.12 + shPulse * 0.09;
    const shScale = 1 + shPulse * 0.07;
    safehouseMark.children[0].scale.set(shScale, 1, shScale);

    // a cruising boat sounds its horn now and then (v3.1): near the quay the
    // harbour talks back, faded by distance like the traffic horns above
    G.boatHornT -= dt;
    if (G.boatHornT <= 0) {
      G.boatHornT = 11 + Math.random() * 14;
      for (const b of city.boatPositions()) {
        const d = Math.hypot(b.x - player.x, b.z - player.z);
        if (d < TUNING.boatHornRange) { audio.blip('boathorn', clamp(1 - d / (TUNING.boatHornRange + 18), 0.2, 0.85)); break; }
      }
    }

    const focus = { x: player.x, z: player.z, car: G.car };
    traffic.update(dt, focus);
    // horns the traffic leaned on this frame, faded by distance
    for (const c of traffic.cars) {
      if (c.honkPulse) {
        c.honkPulse = false;
        const d = Math.hypot(c.x - player.x, c.z - player.z);
        if (d < 46) audio.blip('horn', clamp(1 - d / 52, 0.15, 0.8));
      }
    }
    const speedNow = G.car ? Math.abs(G.car.speed) : player.speedNow;
    const policeInfo = police.update(dt, {
      px: player.x, pz: player.z, vx: G.car ? Math.sin(G.car.heading) * G.car.speed : 0,
      vz: G.car ? Math.cos(G.car.heading) * G.car.speed : 0, heading: player.heading,
      playerSpeed: speedNow, wanted: G.wanted,
      onBusted: () => endRun('busted'),
    });
    // wanted decay: stay out of sight, stay out of trouble
    if (G.wanted > 0) {
      if (policeInfo.nearest > 58) {
        G.unspotted += dt;
        if (G.unspotted > 10) { G.wanted -= 1; G.unspotted = 0; if (G.wanted === 0) hud.toast('You lost Harbor PD', 2000); }
      } else G.unspotted = 0;
    }
    const threats = [...G.panics.map((p) => ({ x: p.x, z: p.z, r: 9, vx: 0, vz: 0, speed: 0 }))];
    if (G.car && Math.abs(G.car.speed) > 7) {
      threats.push({ x: G.car.x, z: G.car.z, r: 10, vx: Math.sin(G.car.heading) * G.car.speed, vz: Math.cos(G.car.heading) * G.car.speed, speed: Math.abs(G.car.speed) });
    }
    // fast traffic startles people too — anyone near the action gets a dodge reflex
    for (const c of traffic.cars) {
      if (Math.abs(c.speed) > TUNING.fleeCarSpeed && Math.hypot(c.x - player.x, c.z - player.z) < 60) {
        threats.push({ x: c.x, z: c.z, r: 6, vx: Math.sin(c.heading) * c.speed, vz: Math.cos(c.heading) * c.speed, speed: Math.abs(c.speed) });
      }
    }
    peds.update(dt, threats);
    missions.update(dt, player.x, player.z);
    if (rival) updateRival(dt);
    vehicleBumps(dt);

    if (G.health <= 0) endRun('wasted');

    // prompts
    let prompt = null;
    if (policeInfo.bustProgress > 0.05) prompt = 'Harbor PD is closing in — <b>keep moving!</b>';
    else if (G.car && G.car.dead) prompt = Math.abs(G.car.speed) < 1.5
      ? 'The engine is <b>dead</b> — <b>E</b> step out and find another ride'
      : 'Engine dead — rolling to a stop…';
    else if (G.car && Math.abs(G.car.speed) < 1.5) prompt = '<b>E</b> — step out';
    else if (!G.car) {
      const v = nearestVehicle(3.6);
      if (v) prompt = `<b>E</b> — take the ${v.model.name}`;
      else if (Math.hypot(player.x - SAFEHOUSE.x, player.z - SAFEHOUSE.z) < 5.5) {
        prompt = !G.safehouse
          ? `<b>F</b> — buy the safehouse ($${SAFEHOUSE.price.toLocaleString('en-US')})`
          : G.storedCar ? '<b>F</b> — take your car out of the garage' : 'Your safehouse — step out of a car on the lot to garage it';
      }
      else if (!missions.active) {
        for (const def of MISSION_DEFS) {
          if (Math.hypot(player.x - def.start.x, player.z - def.start.z) < 5 && !missions.completed.has(def.id)) { prompt = `<b>F</b> — start ${def.name}`; break; }
        }
      }
    }
    hud.prompt(prompt);

    // objective line
    const obj = missions.objective();
    if (obj) {
      const t = missions.target();
      const dist = t ? Math.round(Math.hypot(t.x - player.x, t.z - player.z)) : 0;
      hud.showObjective(obj.title, `${obj.sub} • ${dist} m away`);
    } else hud.hideObjective();

    hud.setCash(G.cash);
    hud.setHealth(G.health / 100);
    hud.setStars(G.wanted, G.wanted > 0 && G.unspotted > 1.5);
    hud.drawMinimap({
      px: player.x, pz: player.z, heading: player.heading,
      traffic: traffic.cars, cops: police.cops, target: missions.target(),
      starts: missions.openStarts(), rival: rival ? rival.v : null,
      safehouse: { x: SAFEHOUSE.x, z: SAFEHOUSE.z, owned: G.safehouse },
      boats: city.boatPositions(),
    });
    const nearestCop = police.cops.reduce((m, c) => Math.min(m, Math.hypot(c.x - player.x, c.z - player.z)), Infinity);
    audio.update(dt, {
      inCar: !!G.car, speedRatio: G.car ? G.car.speed / G.car.model.speed : 0,
      throttle: G.car ? (keys.has('KeyW') ? 1 : 0) : 0, copDist: nearestCop, wanted: G.wanted,
      heliDist: police.heli.visible ? Math.hypot(police.heli.position.x - player.x, police.heli.position.z - player.z) : Infinity,
    });
    G.saveTimer += dt;
    if (G.saveTimer > 10) { G.saveTimer = 0; saveGame(); }
  }

  // camera
  const focusY = G.car ? 1.1 : 1.5;
  const dist = G.car ? 10.5 : (G.camDist || 7.6);
  const cx = player.x - Math.sin(G.camYaw) * Math.cos(G.camPitch) * dist;
  const cz = player.z - Math.cos(G.camYaw) * Math.cos(G.camPitch) * dist;
  const cy = focusY + Math.sin(G.camPitch) * dist + (G.car ? 1.6 : 0.8);
  camera.position.lerp(new THREE.Vector3(cx, Math.max(cy, 1.2), cz), G.mode === 'title' ? 0.02 : 0.35);
  camera.lookAt(player.x, focusY + 0.6, player.z);
  // sun shadow box follows the action
  sun.position.set(player.x - 190, 210, player.z + 150);
  sun.target.position.set(player.x, 0, player.z);
  renderer.render(scene, camera);
}
frame();

// exposed for the screenshot scenes and for debugging in the console
window.__game = { G, player, traffic, police, missions, parkedCars, hud, camera, scene, renderer, addCrime, enterCar, exitCar, peds, city, get rival() { return rival; } };
initShots(window.__game);
