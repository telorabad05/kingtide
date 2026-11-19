// KINGTIDE — main orchestration.
// Owns the renderer, the player (on foot and at the wheel), wanted/search
// bookkeeping, crimes, the safehouse + garage, saving, the camera, the
// in-game phone, and the per-frame wiring between city / traffic / peds /
// police / missions / weapons / HUD / audio. ONE campaign: Dario's ten
// chapters flow straight into the DUO story of Val & Rafa (chapters 11–17).
// Exposes window.__game as a debug + test hook.
import * as THREE from 'three';
import { CITY, TUNING, PALETTE, ZONES, ZONE_NAMES, zoneAt, repRank, modelById } from './config.js';
import { makeRng, clamp, dist2d, angleDelta, turnToward, pick, randRange } from './random.js';
import { buildCity, buildLaneGraph, collideCircle, isOnRoad } from './city.js';
import { Vehicle, TrafficSystem } from './cars.js';
import { PedestrianSystem, makePerson, animatePerson } from './people.js';
import { PoliceSystem } from './police.js';
import { MissionRunner, MISSION_DEFS } from './missions.js';
import { WeaponSystem, WEAPON_DEFS, WEAPON_ORDER, BAT_DEF, defById as weaponDef } from './weapons.js';
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
const peds = new PedestrianSystem(scene, city.sidewalkLoops, rng, TUNING.pedCount, city.beachTowels);
const police = new PoliceSystem(scene, graph, rng);
const audio = new AudioEngine();
const hud = new HUD();
const extraVehicles = new Set();   // Rico's car, the stored garage car, mission cars

// ---------------------------------------------------------------- leads
// Dario wears his original look; Val & Rafa have fixed outfits so the duo
// chapters read at a glance. setLead swaps the player figure in place.
const LEADS = {
  dario: { label: 'DARIO VENN', outfit: null },
  val: { label: 'VAL CRUZ', outfit: { female: true, shirt: 0xc22e4a, pants: 0x23272e, hair: 0x14100c, skin: 0xd9a066 } },
  rafa: { label: 'RAFA DUARTE', outfit: { shirt: 0x1f7a6d, pants: 0x3a3230, hair: 0x1c1710, skin: 0xa06a35 } },
};
let playerMesh = makePerson(makeRng(7));
scene.add(playerMesh);
let currentLead = 'dario';
function setLead(id) {
  if (!LEADS[id] || id === currentLead) { hud.setLead(LEADS[currentLead].label); return; }
  currentLead = id;
  const pos = playerMesh.position.clone(), rot = playerMesh.rotation.y;
  scene.remove(playerMesh);
  playerMesh = LEADS[id].outfit ? makePerson(makeRng(31), LEADS[id].outfit) : makePerson(makeRng(7));
  playerMesh.position.copy(pos); playerMesh.rotation.y = rot;
  scene.add(playerMesh);
  hud.setLead(LEADS[id].label);
}

// ---------------------------------------------------------------- player + state
const player = {
  x: CITY.spawn.x, z: CITY.spawn.z, heading: CITY.spawn.heading,
  vx: 0, vz: 0, speed: 0, health: 100, car: null, phase: 0,
  vy: 0, yOff: 0, grounded: true, landBob: 0,   // jump state (Space on foot)
};
function freshSave() {
  return {
    cash: TUNING.startCash, done: [], house: false, stored: null,
    armour: 0, rep: 0, weapons: null, flags: {}, messages: [],
  };
}
let S = freshSave();
let wanted = 0;              // float; the HUD shows ceil()
let pinnedWanted = null;     // the finale's sting pins the heat: no decay while set
let lastNearestCopD = 999;   // refreshed every frame; the missions' LOS checks read it
let lastSeenX = CITY.spawn.x, lastSeenZ = CITY.spawn.z;
let bust = 0;
let storedCar = null;
let mode = 'menu';           // menu | play | pause | shop | phone | map
let started = false;
let elapsed = 0;
let currentObjective = '';   // last objective line (the phone's Misi app reads it)
let unseenT = 0, hitTimer = 0, shoveCooldown = 0, hitRunCooldown = 0, hornTimer = 14, lastHurtT = -99;
let trafficTopUpT = 2;
let camYaw = player.heading + Math.PI, camPitch = 0.36, mouseQuiet = 0, shake = 0;
const camTarget = new THREE.Vector3(player.x, 1.6, player.z);
// PLUS state
let wantedState = 'clear';   // clear | chase | search
let search = null;           // { x, z, radius, timer, total }
let episodePeak = 0;
let shotHeatCd = 0, pedHitCd = 0, copHitCd = 0, meleeCd = 0;
let nitroMeter = 100, radioStation = 0, firing = false;
let currentZone = 'downtown';
let fenceCar = null;

// ONE wallet, ONE progress list (round 2 merged the two campaigns)
const curCash = () => S.cash;
function setCurCash(n) { S.cash = n; hud.setCash(n); }
const curDone = () => S.done;
function spawnPoint() {
  return S.house ? { x: CITY.safehouse.homeX, z: CITY.safehouse.homeZ } : { x: CITY.spawn.x, z: CITY.spawn.z };
}

function baseYAt(x, z) {
  const P = CITY.pier;
  return (x >= P.minX && x <= P.maxX && z >= P.minZ && z <= P.maxZ) ? 0.55 : 0.22;
}
function allVehicles() {
  const list = [...traffic.vehicles, ...parkedCars, ...police.cops, ...police.blockVehicles, ...extraVehicles];
  if (player.car && !list.includes(player.car)) list.push(player.car);
  return list;
}
const dynamicColliders = [];   // mission-owned walls (the bank interior) join the world while active
function currentWorld() {
  return { colliders: city.colliders.concat(police.extraColliders, dynamicColliders), vehicles: allVehicles(), pier: CITY.pier };
}
traffic.fill(TUNING.trafficCount, allVehicles());

// ---------------------------------------------------------------- REP
function addRep(n, silent = false) {
  if (n <= 0) return;
  const before = repRank(S.rep);
  S.rep += n;
  hud.setRep(S.rep, repRank(S.rep));
  const after = repRank(S.rep);
  if (after !== before) hud.banner(`⭐ ${after}`, `REP ${S.rep.toLocaleString()} — pangkat baru di jalanan Solmarina.`);
  else if (!silent) hud.toast(`+${n} REP`);
  save();
}

// ---------------------------------------------------------------- damage to the player (armour-aware)
function hurtPlayer(n) {
  if (n <= 0 || mode !== 'play') return false;
  let absorbed = 0;
  if (S.armour > 0) absorbed = Math.min(S.armour, n * TUNING.armourAbsorb);
  S.armour -= absorbed;
  player.health -= (n - absorbed);
  lastHurtT = elapsed;
  if (player.health <= 0) { wasted(); return true; }
  return false;
}

// ---------------------------------------------------------------- weapons
/** The melee witness rule (Hugo's tuning, round 2): flooring a civilian
 *  with the bat is a crime ONLY when seen. An officer or patrol car within
 *  20 m → instant star. A civilian witness within 14 m → reported after
 *  ~3 s ("warga melapor…"). Nobody around → no star, ever. A shove that
 *  knocks nobody down is never a crime; walking into people is never one. */
let pendingReport = null;
function meleeWitnessCheck() {
  let copD = police.officerThreatDist;
  for (const c of police.cops) copD = Math.min(copD, dist2d(c.x, c.z, player.x, player.z));
  if (copD < 20) { commitCrime(1); hud.toast('👮 Tertangkap basah! +1★'); return; }
  for (const ped of peds.peds) {
    if (ped.state !== 'down' && dist2d(ped.x, ped.z, player.x, player.z) < 14) {
      if (!pendingReport) { pendingReport = { t: elapsed + 3 }; hud.toast('👀 Warga melihat itu…'); }
      return;
    }
  }
}
function weaponCrime(n, kind) {
  if (kind === 'meleeHit') { meleeWitnessCheck(); return; }
  if (kind === 'shotFired' || kind === 'explosion') {
    missions.onNoise?.(kind);   // inside the bank, noise panics the hostages
    const hearR = kind === 'explosion' ? 85 : 58;
    // measure the hearing distance NOW, not from last frame's cache: a unit
    // that just rolled up must hear the very first shot, not the second one
    let hearD = police.officerThreatDist;
    for (const c of police.cops) hearD = Math.min(hearD, dist2d(c.x, c.z, player.x, player.z));
    const heard = hearD < hearR || police.heliState === 'orbit';
    if (heard && shotHeatCd <= 0) {
      commitCrime(1);
      shotHeatCd = TUNING.shotHeatCooldown;
      hud.toast('🔊 Tembakan terdengar polisi! +1★');
    }
  } else if (kind === 'pedHit') {
    if (pedHitCd <= 0) { commitCrime(1); pedHitCd = 3; }
  } else if (kind === 'copHit') {
    if (copHitCd <= 0) { commitCrime(2); copHitCd = 3; }
  }
}
const weapons = new WeaponSystem(scene, {
  audio,
  fxScale: () => (settings.quality === 'rendah' ? 0.4 : 1),
  banner: (t, s) => G.banner(t, s),
  crime: (n, kind) => weaponCrime(n, kind),
  hurtPlayer: (n) => hurtPlayer(n),
  shake: (n) => { shake = Math.min(0.7, shake + n); },
  onPickup: (id, fresh, temp) => {
    if (!temp && fresh && !S.flags.firstPickup) { S.flags.firstPickup = true; addRep(TUNING.repFirstPickup, true); }
    save();
  },
  provider: () => {
    const ht = police.heliTarget();
    let aimPitch = 0;
    if (ht) {
      const d = Math.hypot(ht.x - player.x, ht.z - player.z);
      if (d < 75) aimPitch = Math.atan2(ht.y - 1.45, Math.max(d, 1));   // aim assist onto the bird
    }
    return {
      x: player.x, z: player.z, onFoot: !player.car,
      aimHeading: camYaw + Math.PI, aimPitch,
      vehicles: allVehicles(), peds: peds.peds, officers: police.officers,
      thugs: missions.combatants(),
      heli: ht, colliders: currentWorld().colliders,
      hurtPed: (ped, dmg, fx, fz) => { peds.hurt(ped, dmg, fx, fz); peds.threaten(ped.x, ped.z, 0, 0, 9); },
      knockPed: (ped) => { peds.knockDown(ped); peds.threaten(ped.x, ped.z, 0, 0, 6); },
      hurtOfficer: (o, dmg) => police.damageOfficer(o, dmg),
      hurtThug: (t, dmg) => missions.hurtCombatant(t, dmg),
      damageHeli: (dmg) => { if (police.damageHeli(dmg)) { hud.toast('🚁 HELIKOPTER JATUH!'); addRep(50, true); } },
    };
  },
});

// ---------------------------------------------------------------- Marco, the dealer
const marcoMesh = makePerson(makeRng(99), { shirt: 0x14161a, pants: 0x2b2b30, hair: 0x3a2a16, skin: 0xd9a066 });
marcoMesh.position.set(ZONES.dealer.x, 0.24, ZONES.dealer.z);
scene.add(marcoMesh);
const marcoMarker = (() => {
  const grp = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 2, 26), new THREE.MeshBasicMaterial({ color: 0x2fe8c8, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.32; grp.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 13, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x2fe8c8, transparent: true, opacity: 0.13, depthWrite: false }));
  beam.position.y = 6.5; grp.add(beam);
  grp.position.set(ZONES.dealer.x, 0.24, ZONES.dealer.z);
  scene.add(grp);
  return grp;
})();
const nearMarco = () => !player.car && dist2d(player.x, player.z, ZONES.dealer.x, ZONES.dealer.z) < 4.6;

// ---------------------------------------------------------------- saving
function save() {
  if (shotName) return;   // screenshot sessions never persist
  S.weapons = weapons.serialize();
  S.messages = phone.messages;
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
function normalizeSave(data) {
  const base = freshSave();
  const out = {
    ...base, ...data,
    done: Array.isArray(data.done) ? [...data.done] : [],
    armour: data.armour || 0, rep: data.rep || 0, flags: data.flags || {},
    messages: Array.isArray(data.messages) ? data.messages.slice(-40) : [],
  };
  delete out.campaign; delete out.duoDone; delete out.duoCash;
  // Round-2 migration (documented choice): weapons / REP / house / armour
  // always carry over. An old save's separate DUO progress folds into the
  // single campaign ONLY when Dario's ten chapters are all complete — the
  // duo arc is chapters 11–17 now, so unfinished-Dario duo progress would
  // be locked anyway; in that case it is dropped, everything else is kept.
  const part1 = MISSION_DEFS.map((d) => d.id);
  if (part1.every((id) => out.done.includes(id)) && Array.isArray(data.duoDone) && data.duoDone.length) {
    for (const id of data.duoDone) if (!out.done.includes(id)) out.done.push(id);
    if (typeof data.duoCash === 'number') out.cash = data.duoCash;
  }
  return out;
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
  player.vy = 0; player.yOff = 0; player.grounded = true; player.landBob = 0;
  camYaw = heading + Math.PI;
  camTarget.set(x, 1.6, z);
}
function respawnPoint() {
  return S.house ? { x: CITY.safehouse.homeX, z: CITY.safehouse.homeZ } : { x: CITY.hospital.x, z: CITY.hospital.z };
}

// ---------------------------------------------------------------- game facade (missions + debug)
const G = {
  playerState: () => ({ x: player.x, z: player.z, inCar: !!player.car, speed: Math.abs(player.speed) }),
  cash: () => curCash(),
  addCash(n) { setCurCash(curCash() + n); audio.cash(); save(); },
  banner: (t, s) => { hud.banner(t, s); document.getElementById('status').textContent = t + (s ? ' — ' + s : ''); },
  objective: (t) => { currentObjective = t; hud.objective(t); },
  setWantedMin(n) { if (wanted < n) { wanted = n; lastSeenX = player.x; lastSeenZ = player.z; } },
  addHeat(n) { wanted = clamp(wanted + n, 0, 5); unseenT = 0; },
  wantedLevel: () => wanted,
  setPinnedWanted(v) { pinnedWanted = v; if (v !== null && wanted < v) wanted = v; },
  nearestCopDist: () => lastNearestCopD,
  playerCar: () => player.car,
  pierRect: () => CITY.pier,
  world: () => currentWorld(),
  addVehicle(v) { extraVehicles.add(v); },
  removeVehicle(v) { extraVehicles.delete(v); v.dispose(scene); },
  setLead: (id) => setLead(id),
  setDaylight: (v) => city.setDaylight(v),
  hurtPlayer: (n) => hurtPlayer(n),
  missionCleanup: () => {
    weapons.clearTempPickups();
    if (fenceCar && fenceCar !== player.car) { extraVehicles.delete(fenceCar); fenceCar.dispose(scene); }
    if (fenceCar !== player.car) fenceCar = null;
  },
  stageHook: (hook, runner) => stageHook(hook, runner),
  // round 2: phone story beats + the fence switch + bank plumbing
  onChapterStart: (def) => pushChapterMessage(def),
  onBeat: (beat) => {
    const partner = currentLead === 'rafa' ? 'Val' : 'Rafa';
    if (beat === 'drill') pushMessage(partner, 'Bor sudah makan pintu brankas. Tahan lobinya — jangan biarkan mereka panik.');
    if (beat === 'vault') pushMessage(partner, 'Brankas TERBUKA! Ambil tiga tasnya — aku menyusul keluar.');
  },
  onFenceSwitch: () => {
    setLead('val');
    if (player.car) exitCarInternal();
    if (fenceCar) placePlayer(fenceCar.x + 2.4, fenceCar.z, fenceCar.heading);
    G.banner('VAL — your turn', 'Rafa: "Keys are in. Drive, Val — DRIVE!"');
  },
  movePlayer: (x, z, heading) => { if (player.car) exitCarInternal(); placePlayer(x, z, heading); },
  addDynCollider: (c) => { dynamicColliders.push(c); },
  removeDynCollider: (c) => { const i = dynamicColliders.indexOf(c); if (i >= 0) dynamicColliders.splice(i, 1); },
  fxSpark: (x, y, z) => weapons.sparks(x, y, z, 0xffc46b, 3, 0.4),
};
function markDone(id) {
  if (!S.done.includes(id)) { S.done.push(id); addRep(TUNING.repPerChapter, true); save(); }
}
function markDoneNoRep(id) {
  if (!S.done.includes(id)) { S.done.push(id); save(); }
}
const missions = new MissionRunner(scene, {
  ...G,
  isMissionDone: (id) => S.done.includes(id),
  markMissionDone: markDone,
  markMissionDoneNoRep: markDoneNoRep,
});
function activeMissions() { return missions; }
function refreshAllMarkers() { missions.refreshMarkers(); }

/** Story beats that live outside the stage machinery (DUO hooks). */
function stageHook(hook, runner) {
  if (hook === 'valPickup') {
    runner.removeGuest();
    G.banner('Val', '"You waited." — "Always. Now drive — the tail is Sal\'s parting gift."');
  } else if (hook === 'fenceAmbush') {
    runner.spawnThugs(415, 84, 3);
    weapons.spawnTempPickup('pistol', 410.5, 79.5);
    const car = new Vehicle(scene, modelById('sedan'), 0x20bf6b, {});
    car.driver = 'parked';
    car.place(404, 62, Math.PI, CITY.pier);
    extraVehicles.add(car);
    fenceCar = car;
    G.banner('AMBUSH!', 'Otto sold you out — his cousins want the money back. Fight, then run!');
    audio.sting('wasted');
  } else if (hook === 'unpin') {
    G.setPinnedWanted(null);
    G.banner('Out of the net', 'The pin is off — now go dark by the lighthouse.');
  }
}

// ---------------------------------------------------------------- crimes + consequences
function commitCrime(stars) {
  wanted = clamp(wanted + stars, 0, 5);
  unseenT = 0;
  lastSeenX = player.x; lastSeenZ = player.z;   // the crime scene is the last known position
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
  if (car === fenceCar) fenceCar = null;
  player.car = car;
  car.driver = 'player';
  playerMesh.visible = false;
  audio.blip(520);
}
function busted() {
  const fine = Math.min(curCash(), TUNING.bustedFineBase + 50 * Math.floor(wanted));
  setCurCash(curCash() - fine);
  if (player.car) exitCarInternal();
  wanted = 0; bust = 0; episodePeak = 0; search = null; wantedState = 'clear';
  const rp = respawnPoint();
  placePlayer(rp.x, rp.z, 0);
  hud.bigText('BUSTED', '#ff5e5e');
  audio.sting('busted');
  G.banner(`Busted! Fine $${fine}`, 'Harbor PD thanks you for your donation.');
  save();
}
function wasted() {
  const fee = Math.min(curCash(), TUNING.wastedFee);
  setCurCash(curCash() - fee);
  if (player.car) exitCarInternal();
  player.health = 100;
  wanted *= 0.5; bust = 0; episodePeak = 0;
  const rp = respawnPoint();
  placePlayer(rp.x, rp.z, 0);
  hud.bigText('WASTED', '#e84118');
  audio.sting('wasted');
  G.banner(`Hospital bill $${fee}`, 'Try to keep the next body in one piece.');
  save();
}
function clearWorldForStart() {
  if (player.car) { player.car.driver = 'parked'; player.car = null; playerMesh.visible = true; }
  if (storedCar) { extraVehicles.delete(storedCar); storedCar.dispose(scene); storedCar = null; }
  if (missions.active?.rico) G.removeVehicle(missions.active.rico);
  if (missions.active) missions.cleanupActive();
  missions.active = null;
  firing = false;
  if (wheelOpen) closeWheel();
  if (phone.open) closePhone();
}
function startGame(fresh) {
  clearWorldForStart();
  if (fresh) {
    S = freshSave();
    weapons.reset();
    phone.messages = []; phone.unread = 0;
  } else {
    const data = loadSave();
    if (data) S = normalizeSave(data);
    else { S = freshSave(); weapons.reset(); }
    phone.messages = Array.isArray(S.messages) ? S.messages : [];
    phone.unread = 0;
  }
  weapons.restore(S.weapons);
  wanted = 0; pinnedWanted = null; bust = 0; episodePeak = 0; search = null; wantedState = 'clear'; pendingReport = null;
  player.health = 100; nitroMeter = 100; radioStation = 0;
  applyHouseVisual();
  spawnStoredCar();
  refreshAllMarkers();
  setLead('dario');
  currentLead = 'dario';
  hud.setLead(LEADS.dario.label);
  const sp = spawnPoint();
  placePlayer(sp.x, sp.z, CITY.spawn.heading);
  hud.setCash(S.cash);
  hud.setRep(S.rep, repRank(S.rep));
  started = true;
  mode = 'play';
  document.getElementById('startScreen').style.display = 'none';
  document.getElementById('hud').classList.add('on');
  if (!shotName) lockPointer();
  G.banner('KINGTIDE', 'Dario Venn washes up in Solmarina with $250 and a record. One city, one story — 17 chapters.');
  save();
}
function newGame() { startGame(true); }
function continueGame() { startGame(false); }

// ---------------------------------------------------------------- Marco's shop
const shopEl = document.getElementById('shopMenu');
const shopItemsEl = document.getElementById('shopItems');
const shopMsgEl = document.getElementById('shopMsg');
function shopMsg(t) { shopMsgEl.textContent = t || ''; }
function renderShop() {
  document.getElementById('shopCash').textContent = `Uang kamu: $${curCash().toLocaleString()}`;
  shopItemsEl.innerHTML = '';
  const row = (html, buttons) => {
    const d = document.createElement('div');
    d.className = 'shopRow';
    d.innerHTML = html;
    for (const b of buttons) d.appendChild(b);
    shopItemsEl.appendChild(d);
  };
  const btn = (label, cls, fn, disabled = false) => {
    const b = document.createElement('button');
    b.className = 'buy' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.disabled = disabled;
    b.addEventListener('click', fn);
    return b;
  };
  for (const def of WEAPON_DEFS) {
    const st = weapons.state[def.id];
    const desc = st.owned
      ? `Dimiliki · mag ${st.mag} / cadangan ${st.reserve}`
      : `${def.cls} · damage ${def.dmg}${def.pellets > 1 ? '×' + def.pellets : ''} · mag ${def.mag}`;
    const buttons = [];
    if (!st.owned) buttons.push(btn(`Beli · $${def.price.toLocaleString()}`, '', () => buyWeapon(def.id)));
    else buttons.push(btn(`Ammo +${def.ammoPack} · $${def.ammoPrice}`, 'ammo', () => buyAmmo(def.id)));
    row(`<div><div class="nm">${def.name}</div><div class="ds">${desc}</div></div>`, buttons);
  }
  row(`<div><div class="nm">Armour</div><div class="ds">Rompi anti-peluru · sekarang ${Math.round(S.armour)}/100 — menyerap 60% damage tabrakan &amp; ledakan</div></div>`,
    [btn('Beli · $400', '', () => buyArmour(), S.armour >= 100)]);
}
function buyWeapon(id) {
  const def = weaponDef(id);
  if (curCash() < def.price) { shopMsg(`Uang tidak cukup — kurang $${(def.price - curCash()).toLocaleString()}.`); audio.blip(220); return; }
  setCurCash(curCash() - def.price);
  const first = weapons.grant(id, true);
  weapons.equip(id);
  if (first && !S.flags.firstWeapon) { S.flags.firstWeapon = true; addRep(TUNING.repFirstWeapon, true); pushMessage('Marco', 'Senjata bagus untuk tangan yang benar. Ammo selalu ada di tempatku.'); }
  shopMsg(`${def.name} jadi milikmu. Tekan Q untuk memilihnya.`);
  audio.cash();
  save(); renderShop();
}
function buyAmmo(id) {
  const def = weaponDef(id);
  if (curCash() < def.ammoPrice) { shopMsg('Uang tidak cukup untuk ammo.'); audio.blip(220); return; }
  setCurCash(curCash() - def.ammoPrice);
  weapons.addAmmo(id);
  shopMsg(`+${def.ammoPack} peluru ${def.name}.`);
  audio.blip(740);
  save(); renderShop();
}
function buyArmour() {
  if (curCash() < 400) { shopMsg('Uang tidak cukup untuk armour.'); audio.blip(220); return; }
  setCurCash(curCash() - 400);
  S.armour = 100;
  shopMsg('Armour penuh. Tabrakan dan ledakan terasa lebih ringan.');
  audio.cash();
  save(); renderShop();
}
function openShop() {
  mode = 'shop';
  suppressLockPauseUntil = performance.now() + 2000;   // our own unlock must not read as an Esc-pause when its event lands late
  shopMsg('');
  renderShop();
  shopEl.classList.add('open');
  if (document.pointerLockElement) document.exitPointerLock();
  audio.blip(520);
}
function closeShop() {
  shopEl.classList.remove('open');
  mode = 'play';
  if (!shotName) lockPointer();
}
document.getElementById('shopCloseBtn').addEventListener('click', closeShop);

// ---------------------------------------------------------------- the phone (T)
// A GTA-style smartphone: Misi (live objective + the heist checklist),
// Pesan (story texts), Kontak (the cast), Statistik (cash / REP / progress).
const phone = { open: false, app: null, messages: [], unread: 0 };
const phoneEl = document.getElementById('phone');
const phoneAppsEl = document.getElementById('phoneApps');
const phoneScreenEl = document.getElementById('phoneScreen');
const phoneContentEl = document.getElementById('phoneContent');
const phoneTitleEl = document.getElementById('phoneAppTitle');
const phoneClockEl = document.getElementById('phoneClock');
function phoneClockText() {
  const mins = 480 + Math.floor(elapsed * 0.1);   // 08:00 + 1 min per 10 s played
  return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
function updatePhoneBadge() {
  const b = document.getElementById('pesanBadge');
  if (b) { b.textContent = phone.unread > 0 ? String(phone.unread) : ''; b.style.display = phone.unread > 0 ? '' : 'none'; }
}
function pushMessage(from, text) {
  phone.messages.push({ from, text, t: Math.floor(elapsed) });
  if (phone.messages.length > 40) phone.messages.splice(0, phone.messages.length - 40);
  S.messages = phone.messages;
  if (!phone.open) { phone.unread++; hud.toast(`📱 Pesan baru dari ${from}`); }
  updatePhoneBadge();
  save();
}
const CHAPTER_MESSAGES = {
  sprint: ['Lola', 'Pendatang baru? Tunjukkan kakimu di promenade-ku. — L'],
  package: ['Sal', 'Satu paket. Tanpa pertanyaan. Jangan bikin PD bertanya juga.'],
  drops: ['Sal', 'Tiga drop, satu jam. Kapal tidak menunggu siapa pun.'],
  grandprix: ['Rico', 'Balapan untuk reputasi, wheelman. Jangan bikin aku bosan.'],
  tour: ['Sal', 'Kelilingi kotaku dalam satu tangki siang. Lalu kita bicara bisnis.'],
  heat: ['Sal', 'Pengambilan berantakan. Hilangkan panasnya, jangan bawa ke pintuku.'],
  dome: ['Sal', 'Ada Velocity RS di parkiran Dome atas namaku. Bawa ke barat. Utuh.'],
  cashrun: ['Sal', 'Uangku berserakan di lima titik. Tangan diam, mesin kencang.'],
  revenge: ['Rico', 'Mahkotamu atau mahkotaku. Jalan jauh — dan aku main kotor.'],
  king: ['Sal', 'Satu pekerjaan terakhir, nak. Percayalah padaku kali ini.'],
  freshair: ['Rafa', 'Val bebas hari ini. Lima tahun dia menunggu — aku juga.'],
  firstscore: ['Val', 'Penjara mengajarku sabar, bukan miskin. Kotak kas marina. Malam ini.'],
  keys: ['Rafa', 'Pembeli di seberang teluk bayar tunai. Satu Azure GT, tidur di Dome.'],
  hotcargo: ['Val', 'Truk kas, rute sepi, satu koper. Hentikan, ambil, lenyap.'],
  fence: ['Rafa', 'Otto membeli kertas panas di antara kontainer. Aku percaya dia. Sekali ini.'],
  betrayal: ['Val', 'Otto menjual rute kita. Sirene di semua jalan — ke mercusuar.'],
  kingdom: ['Val', 'Bank Pelabuhan, malam festival. Satu aturan: tidak ada yang terluka.'],
};
function pushChapterMessage(def) {
  const m = CHAPTER_MESSAGES[def.id];
  if (m) pushMessage(m[0], m[1]);
}
function misiData() {
  const lines = [];
  let title;
  const next = missions.nextChapter();
  if (missions.active) {
    title = missions.chapterTag(missions.active.def);
    const steps = missions.heistSteps();
    if (steps) for (const s of steps) lines.push(`${s.state === 'done' ? '✓' : s.state === 'active' ? '▶' : '·'} ${s.label}`);
    else lines.push(`▶ ${currentObjective || missions.active.def.intro}`);
  } else if (next) {
    title = `Selanjutnya: ${missions.chapterTag(next)}`;
    lines.push(`· Pergi ke penanda kuning untuk memulai — ${next.giver}`);
  } else {
    title = 'Semua 17 bab selesai 👑';
    lines.push('· Solmarina milikmu. Jelajahi kota sesukamu.');
  }
  return { title, lines };
}
function kontakData() {
  return [
    ['Dario Venn', S.done.includes('king') ? '👑 King of Solmarina' : currentLead === 'dario' ? 'Kamu — sedang dimainkan' : 'Di Palm Row'],
    ['Val Cruz', currentLead === 'val' ? 'Kamu — sedang dimainkan' : S.done.includes('freshair') ? 'Partner — siap untuk pekerjaan terakhir' : 'Masih di Coastal Correctional'],
    ['Rafa Duarte', currentLead === 'rafa' ? 'Kamu — sedang dimainkan' : 'Partner Val — selalu menunggu'],
    ['Lola Marchetti', 'Lola\'s Quay — perahu selalu siap'],
    ['Uncle Sal', S.done.includes('king') ? 'Kekaisarannya runtuh — menghilang' : 'Fixer pelabuhan — pemberi kerja'],
    ['Rico Delgado', S.done.includes('revenge') ? 'Sudah kalah dua kali' : 'Raja jalanan — rival balap'],
    ['Marco', 'Gang Harbor Industrial — senjata & armour'],
  ].map(([n, s]) => `${n} — ${s}`);
}
function statistikData() {
  const owned = WEAPON_ORDER.filter((id) => weapons.state[id].owned).length;
  return [
    `💵 Uang: $${S.cash.toLocaleString()}`,
    `⭐ REP: ${S.rep.toLocaleString()} — ${repRank(S.rep)}`,
    `📖 Bab selesai: ${S.done.length}/17`,
    `🔫 Senjata dimiliki: ${owned + 1}/6 (termasuk Bat)`,
    `🛡️ Armour: ${Math.round(S.armour)}/100`,
    `🏠 Safehouse Palm Row: ${S.house ? 'dimiliki' : 'belum dibeli ($2,500)'}`,
  ];
}
function openPhone() {
  if (mode !== 'play') return;
  phone.open = true; phone.app = null;
  mode = 'phone';
  suppressLockPauseUntil = performance.now() + 2000;   // same lock-pause guard as the shop
  phoneEl.classList.add('open');
  phoneClockEl.textContent = phoneClockText();
  showPhoneHome();
  if (document.pointerLockElement) document.exitPointerLock();
  audio.blip(880);
}
function closePhone() {
  phone.open = false; phone.app = null;
  phoneEl.classList.remove('open');
  mode = 'play';
  if (!shotName) lockPointer();
}
function showPhoneHome() {
  phone.app = null;
  phoneAppsEl.style.display = '';
  phoneScreenEl.style.display = 'none';
  updatePhoneBadge();
}
function phoneLine(text, cls = 'phLine') {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  phoneContentEl.appendChild(d);
}
function showPhoneApp(app) {
  phone.app = app;
  phoneAppsEl.style.display = 'none';
  phoneScreenEl.style.display = '';
  phoneClockEl.textContent = phoneClockText();
  phoneContentEl.innerHTML = '';
  if (app === 'misi') {
    phoneTitleEl.textContent = '📋 Misi';
    const d = misiData();
    phoneLine(d.title, 'phH');
    for (const ln of d.lines) phoneLine(ln);
  } else if (app === 'pesan') {
    phoneTitleEl.textContent = '💬 Pesan';
    phone.unread = 0; updatePhoneBadge();
    if (!phone.messages.length) phoneLine('Belum ada pesan.');
    for (const m of [...phone.messages].reverse()) {
      const wrap = document.createElement('div');
      wrap.className = 'phMsg';
      const f = document.createElement('div'); f.className = 'phFrom'; f.textContent = m.from;
      const t = document.createElement('div'); t.className = 'phText'; t.textContent = m.text;
      wrap.appendChild(f); wrap.appendChild(t); phoneContentEl.appendChild(wrap);
    }
  } else if (app === 'kontak') {
    phoneTitleEl.textContent = '👥 Kontak';
    for (const ln of kontakData()) phoneLine(ln);
  } else if (app === 'statistik') {
    phoneTitleEl.textContent = '📊 Statistik';
    for (const ln of statistikData()) phoneLine(ln);
  }
}
function phoneView() {
  if (!phone.open) return { open: false, app: null, lines: [] };
  if (!phone.app) return { open: true, app: null, lines: [] };
  if (phone.app === 'misi') { const d = misiData(); return { open: true, app: 'misi', title: d.title, lines: d.lines }; }
  if (phone.app === 'pesan') return { open: true, app: 'pesan', lines: phone.messages.map((m) => `${m.from}: ${m.text}`) };
  if (phone.app === 'kontak') return { open: true, app: 'kontak', lines: kontakData() };
  return { open: true, app: 'statistik', lines: statistikData() };
}
for (const b of phoneAppsEl.querySelectorAll('[data-app]')) b.addEventListener('click', () => showPhoneApp(b.dataset.app));
document.getElementById('phoneBack').addEventListener('click', showPhoneHome);
document.getElementById('phoneClose').addEventListener('click', closePhone);

// ---------------------------------------------------------------- the weapon wheel
// ------------------------------------------------------------- INPUT: weapon wheel + keys
const WHEEL_SLOTS = ['bat', 'pistol', 'smg', 'shotgun', 'rifle', 'rpg'];
let wheelOpen = false, wheelSel = 0;
const wheelCursor = { x: 0, y: 0 };
function wheelSlotsData() {
  return WHEEL_SLOTS.map((id) => id === 'bat'
    ? { label: 'BAT', sub: 'MELEE', owned: true, ammo: '', current: weapons.current === 'bat' }
    : {
      label: weaponDef(id).name.toUpperCase(), sub: weaponDef(id).cls,
      owned: weapons.state[id].owned,
      ammo: `${weapons.state[id].mag}  ${weapons.state[id].reserve}`,
      current: weapons.current === id,
    });
}
function openWheel() {
  if (player.car || wheelOpen || mode !== 'play') return;
  wheelOpen = true;
  wheelCursor.x = 0; wheelCursor.y = 0;
  wheelSel = Math.max(0, WHEEL_SLOTS.indexOf(weapons.current));
  hud.showWheel(wheelSlotsData(), wheelSel);
}
function wheelMove(dx, dy) {
  if (!wheelOpen) return;
  wheelCursor.x += dx; wheelCursor.y += dy;
  if (Math.hypot(wheelCursor.x, wheelCursor.y) < 34) return;
  const ang = Math.atan2(wheelCursor.y, wheelCursor.x) * 180 / Math.PI;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < 6; i++) {
    const d = Math.abs(((ang - (-90 + i * 60) + 540) % 360) - 180);   // true angular distance to the slot's spoke
    if (d < bestD) { bestD = d; best = i; }
  }
  if (best !== wheelSel) { wheelSel = best; hud.paintWheel(wheelSlotsData(), wheelSel); }
}
function closeWheel() {
  if (!wheelOpen) return;
  wheelOpen = false;
  hud.hideWheel();
  const id = WHEEL_SLOTS[wheelSel];
  if (id === 'bat') { weapons.equip('bat'); audio.blip(660); }
  else if (weapons.state[id].owned) { weapons.equip(id); audio.blip(660); }
}

// ------------------------------------------------------------- SETTINGS (Pengaturan)
const SETTINGS_KEY = 'kingtide.settings.v1';
const settings = (() => {
  const dflt = { quality: 'sedang', master: 0.9, music: 0.8, sfx: 1, mute: false, sens: 1 };
  try { return { ...dflt, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return dflt; }
})();
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ } }
const settingsEls = {
  menu: document.getElementById('settingsMenu'),
  master: document.getElementById('setMaster'), music: document.getElementById('setMusic'),
  sfx: document.getElementById('setSfx'), mute: document.getElementById('setMute'),
  sens: document.getElementById('setSens'),
};
function updateSettingsUI() {
  if (!settingsEls.master) return;
  settingsEls.master.value = Math.round(settings.master * 100);
  settingsEls.music.value = Math.round(settings.music * 100);
  settingsEls.sfx.value = Math.round(settings.sfx * 100);
  settingsEls.mute.checked = !!settings.mute;
  settingsEls.sens.value = Math.round(settings.sens * 100);
  document.querySelectorAll('#qualitySeg button').forEach((b) => b.classList.toggle('active', b.dataset.q === settings.quality));
}
/** Apply live: pixel-ratio cap + shadows + shadow size (graphics), the
 *  audio buses (sound), mouse sensitivity (read directly by the handler). */
function applySettings() {
  const q = settings.quality;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q === 'rendah' ? 1 : q === 'sedang' ? 1.5 : 2));
  const wantShadow = q !== 'rendah';
  if (renderer.shadowMap.enabled !== wantShadow) {
    renderer.shadowMap.enabled = wantShadow;
    scene.traverse((o) => {
      const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of ms) m.needsUpdate = true;
    });
  }
  if (wantShadow && city.sun) {
    const size = q === 'sedang' ? 1024 : 2048;
    if (city.sun.shadow.mapSize.x !== size) {
      city.sun.shadow.mapSize.set(size, size);
      if (city.sun.shadow.map) { city.sun.shadow.map.dispose(); city.sun.shadow.map = null; }
    }
  }
  audio.setVolumes(settings);
  updateSettingsUI();
}
let settingsFrom = 'title';
function openSettings(from) {
  settingsFrom = from;
  settingsEls.menu.classList.add('open');
  updateSettingsUI();
}
function closeSettings() { settingsEls.menu.classList.remove('open'); }
document.getElementById('settingsBtn').addEventListener('click', () => openSettings('title'));
document.getElementById('settingsBtn2').addEventListener('click', () => openSettings('pause'));
document.getElementById('settingsBack').addEventListener('click', closeSettings);
document.querySelectorAll('#qualitySeg button').forEach((b) => b.addEventListener('click', () => { settings.quality = b.dataset.q; applySettings(); saveSettings(); }));
settingsEls.master.addEventListener('input', () => { settings.master = settingsEls.master.value / 100; applySettings(); saveSettings(); });
settingsEls.music.addEventListener('input', () => { settings.music = settingsEls.music.value / 100; applySettings(); saveSettings(); });
settingsEls.sfx.addEventListener('input', () => { settings.sfx = settingsEls.sfx.value / 100; applySettings(); saveSettings(); });
settingsEls.mute.addEventListener('change', () => { settings.mute = settingsEls.mute.checked; applySettings(); saveSettings(); });
settingsEls.sens.addEventListener('input', () => { settings.sens = settingsEls.sens.value / 100; applySettings(); saveSettings(); });
applySettings();

// ------------------------------------------------------------- FULL MAP (M)
let mapOpen = false, lastMapView = null;
const MAP_PLACES = [
  { x: ZONES.dealer.x, z: ZONES.dealer.z, icon: '🛠️', label: 'Marco' },
  { x: 100, z: 150, icon: '🏦', label: 'Bank' },
  { x: 190, z: 250, icon: '⚓', label: 'Marina' },
  { x: -234, z: 158, icon: '🔒', label: 'Penjara' },
  { x: 190, z: 306, icon: '🗼', label: 'Mercusuar' },
  { x: CITY.safehouse.homeX, z: CITY.safehouse.homeZ, icon: '🏠', label: 'Safehouse' },
  { x: 160, z: -120, icon: '🏟️', label: 'Dome' },
];
function refreshMap() {
  lastMapView = hud.drawBigMap(document.getElementById('bigMap'), {
    player: { x: player.x, z: player.z, heading: player.heading },
    target: missions.target(),
    places: MAP_PLACES,
  });
}
function openMap() {
  if (mode !== 'play') return;
  mode = 'map'; mapOpen = true;
  document.getElementById('mapScreen').classList.add('open');
  suppressLockPauseUntil = performance.now() + 2000;
  if (document.pointerLockElement) document.exitPointerLock();
  refreshMap();
  audio.blip(760);
}
function closeMap() {
  mapOpen = false;
  document.getElementById('mapScreen').classList.remove('open');
  mode = 'play';
  if (!shotName) lockPointer();
}

// ---------------------------------------------------------------- input
const keys = {};
let mouseDown = false;
function handleKey(code, down) {
  keys[code] = down;
  if (down && mode === 'phone') {
    if (code === 'Escape' || code === 'KeyT') closePhone();
    return;
  }
  if (down && mode === 'map') {
    if (code === 'Escape' || code === 'KeyM') closeMap();
    return;
  }
  if (down && mode === 'shop') {
    if (code === 'Escape' || code === 'KeyF') closeShop();
    return;
  }
  if (down && code === 'KeyP' && mode !== 'menu') { togglePause(); return; }
  if (!down) {
    if (code === 'KeyQ') closeWheel();
    return;
  }
  if (mode !== 'play') return;
  if (code === 'KeyT') { openPhone(); return; }
  if (code === 'KeyM') { openMap(); return; }
  if (code === 'KeyE') toggleCar();
  if (code === 'KeyF') interact();
  if (code === 'KeyH' && player.car) audio.horn();
  if (code === 'KeyR') {
    if (player.car) {
      radioStation = (radioStation + 1) % 4;
      hud.toast(radioStation ? `📻 ${AudioEngine.STATIONS[radioStation].name}` : '📻 Radio mati');
    } else weapons.startReload();
  }
  if (code === 'Tab' && !player.car) { weapons.cycle(1); }
  if (code === 'KeyQ' && !player.car) openWheel();
  const digit = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(code);
  if (digit >= 0 && !player.car) { const id = WHEEL_SLOTS[digit]; if (id === 'bat' || weapons.state[id].owned) weapons.equip(id); }
}
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  handleKey(e.code, true);
});
addEventListener('keyup', (e) => handleKey(e.code, false));
addEventListener('wheel', (e) => {
  if (mode === 'play' && !player.car && !wheelOpen) weapons.cycle(e.deltaY > 0 ? 1 : -1);
});
addEventListener('mousedown', (e) => {
  if (mode !== 'play' || e.button !== 0) return;
  // the click that engages pointer lock must never attack: only clicks made
  // while the lock has been held for a beat count as attacks
  if (document.pointerLockElement === canvas && performance.now() - lockedAt > 200) {
    if (weapons.current && !player.car) firing = true;
    else shove();
  } else mouseDown = true;
});
addEventListener('mouseup', () => { mouseDown = false; firing = false; });
addEventListener('mousemove', (e) => {
  if (mode !== 'play') return;
  if (wheelOpen) { wheelMove(e.movementX || 0, e.movementY || 0); return; }
  if (document.pointerLockElement === canvas || mouseDown) {
    camYaw -= e.movementX * 0.0028 * settings.sens;
    camPitch = clamp(camPitch + e.movementY * 0.0028 * settings.sens, 0.05, 1.2);
    mouseQuiet = 0;
  }
});
function lockPointer() {
  try {
    const p = canvas.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch { /* pointer lock is a nicety, never an error */ }
}
canvas.addEventListener('click', () => {
  if (mode === 'play' && !shotName && document.pointerLockElement !== canvas) {
    lockPointer();
  }
});
let suppressLockPauseUntil = 0;
let lockedAt = 0;   // when the pointer lock engaged (attack-click guard)
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) lockedAt = performance.now();
  if (!document.pointerLockElement && mode === 'play' && started && !shotName && performance.now() > suppressLockPauseUntil) togglePause(true);
});
function togglePause(force) {
  const open = force === true ? true : mode !== 'pause';
  mode = open ? 'pause' : 'play';
  document.getElementById('pauseMenu').classList.toggle('open', open);
  if (!open) lockPointer();
}
document.getElementById('resumeBtn').addEventListener('click', () => togglePause(false));
document.getElementById('restartBtn').addEventListener('click', () => { newGame(); togglePause(false); });
document.getElementById('daySlider').addEventListener('input', (e) => city.setDaylight(e.target.value / 100));
document.getElementById('newGameBtn').addEventListener('click', () => { audio.ensure(); startGame(!loadSave()); });
document.getElementById('continueBtn').addEventListener('click', () => { audio.ensure(); startGame(false); });
if (loadSave()) document.getElementById('continueBtn').style.display = '';

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
  const runner = activeMissions();
  // runner-owned F interactions first: the heist talk, then the bank doors
  if (runner.dialogueActive()) { runner.advanceDialogue(); audio.blip(700); return; }
  const aStage = runner.active?.def.stages[runner.active.stage];
  if (runner.active && aStage?.type === 'talk' && !runner.active.talkDone
    && dist2d(player.x, player.z, aStage.x, aStage.z) < aStage.r + 1) { runner.startDialogue(); return; }
  if (runner.heistInteract()) return;
  const def = runner.nearStart();
  if (def) { if (runner.start(def)) audio.blip(740); return; }
  const SH = CITY.safehouse;
  if (!S.house && dist2d(player.x, player.z, SH.buyX, SH.buyZ) < 5.5) {
    if (curCash() >= TUNING.housePrice) {
      setCurCash(curCash() - TUNING.housePrice);
      S.house = true; applyHouseVisual(); spawnStoredCar();
      audio.cash();
      G.banner('Safehouse purchased', 'The villa on Palm Row is yours. Store cars in the garage.');
      pushMessage('Lola', 'Vila Palm Row, ya? Tetangga baru. Mampir ke quay-ku kapan-kapan.');
      save();
    } else {
      G.banner('Safehouse — $2,500', `You need $${(TUNING.housePrice - curCash()).toLocaleString()} more. Run some jobs.`);
      audio.blip(220);
    }
    return;
  }
  if (nearMarco()) { openShop(); return; }
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
  if (best) {
    // a shove that knocks nobody down is never a crime (Hugo's rule)
    peds.threaten(best.x, best.z, player.vx, player.vz, 2.2);
    shoveCooldown = 1.2;
    audio.blip(170);
    return;
  }
  if (police.shoveOfficers(player.x, player.z, player.heading)) {
    commitCrime(1);
    shoveCooldown = 1.2;
    audio.blip(170);
  }
}
function updatePrompt() {
  if (player.car) {
    hud.prompt(player.car.dead ? 'Engine dead — E: step out' : null);
    return;
  }
  const def = activeMissions().nearStart();
  if (def) { hud.prompt(`F — start Chapter ${def.chapter}: ${def.name} (+$${def.reward.toLocaleString()})`); return; }
  const rp = activeMissions().promptText();
  if (rp) { hud.prompt(rp); return; }
  const SH = CITY.safehouse;
  if (!S.house && dist2d(player.x, player.z, SH.buyX, SH.buyZ) < 5.5) {
    hud.prompt(curCash() >= TUNING.housePrice ? 'F — buy the safehouse ($2,500)' : `Safehouse: $2,500 — you need $${(TUNING.housePrice - curCash()).toLocaleString()} more`);
    return;
  }
  if (nearMarco()) { hud.prompt('F — Marco · Senjata'); return; }
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
  if (weapons.current && firing) player.heading = turnToward(player.heading, camYaw + Math.PI, dt * 16);   // face the aim while shooting
  player.speed = Math.hypot(player.vx, player.vz);
  // jump: Space on foot (in a car Space stays the handbrake) — vertical
  // velocity + gravity, a soft landing dip, and it never touches the
  // bust/wasted/mission logic, which all reads ground-plane state
  if (keys.Space && player.grounded) { player.vy = 8.4; player.grounded = false; audio.blip(300); }
  if (!player.grounded) {
    player.vy -= 22 * dt;
    player.yOff += player.vy * dt;
    if (player.yOff <= 0) {
      player.yOff = 0; player.vy = 0; player.grounded = true; player.landBob = 0.14;
      audio.blip(140);
    }
  }
  player.landBob = Math.max(0, (player.landBob || 0) - dt);
  const bobY = player.landBob > 0 ? -0.09 * (player.landBob / 0.14) : 0;
  playerMesh.position.set(player.x, baseYAt(player.x, player.z) + player.yOff + bobY, player.z);
  playerMesh.rotation.y = player.heading;
}
function updateCar(dt) {
  const car = player.car;
  const ctrl = {
    throttle: (keys.KeyW || keys.ArrowUp ? 1 : 0) + (keys.KeyS || keys.ArrowDown ? -1 : 0),
    steer: (keys.KeyA || keys.ArrowLeft ? 1 : 0) + (keys.KeyD || keys.ArrowRight ? -1 : 0),
    handbrake: !!keys.Space,
  };
  // nitro: SHIFT while driving; needs a minimum charge to engage, then burns
  const wantNitro = ctrl.throttle > 0 && (keys.ShiftLeft || keys.ShiftRight) && nitroMeter > 0;
  ctrl.nitro = wantNitro && (car.nitroOn || nitroMeter > TUNING.nitroMinEngage);
  if (ctrl.nitro) nitroMeter = Math.max(0, nitroMeter - TUNING.nitroDrainPerSec * dt);
  else nitroMeter = Math.min(100, nitroMeter + TUNING.nitroRegenPerSec * dt);
  car.step(dt, ctrl, currentWorld());
  audio.setNitro(!!car.nitroOn);
  for (const ev of car.events.splice(0)) {
    if (ev.type === 'crash') {
      audio.crash(clamp(ev.speed / 26, 0.25, 1));
      shake = Math.min(0.6, ev.speed * 0.02);
      if (ev.speed > 17) hurtPlayer((ev.speed - 15) * 0.9);   // the driver feels big hits (armour absorbs)
    }
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
  shotHeatCd -= dt; pedHitCd -= dt; copHitCd -= dt; meleeCd -= dt;
  // a civilian witness's report lands ~3 s after a witnessed bat knockdown
  if (pendingReport && elapsed >= pendingReport.t) {
    pendingReport = null;
    commitCrime(1);
    hud.toast('📱 Warga melapor ke Harbor PD… +1★');
  }
  const world = currentWorld();
  traffic.update(dt, world);
  // fleet maintenance: traffic cars despawn at the graph exits, so top the
  // fleet back up every couple of seconds — without this the streets
  // slowly empty out over a long session (found by the round-2 playtest:
  // 24 cars at boot, 6 left after ~25 minutes)
  trafficTopUpT -= dt;
  if (trafficTopUpT <= 0) { trafficTopUpT = 2; traffic.fill(TUNING.trafficCount, world.vehicles); }
  peds.update(dt);
  if (player.car) updateCar(dt); else updateFoot(dt);
  // inside the bank, the police stage at the street door — they respond to
  // the building, not to the player's off-map interior position
  const holdFlow = missions.holdWantedFlow();
  const proxy = holdFlow
    ? { x: 100, z: 150, vx: 0, vz: 0, speed: 0, inCar: false, carDead: false }
    : { x: player.x, z: player.z, vx: player.vx, vz: player.vz, speed: Math.abs(player.speed), inCar: !!player.car, carDead: !!player.car?.dead };
  police.update(dt, {
    player: proxy, wanted, wantedState,
    search: wantedState === 'search' ? search : null,
    vehicles: world.vehicles, world,
    crime: (n) => commitCrime(n),
    onHeliDown: () => { audio.explosion(); shake = Math.min(0.7, shake + 0.35); },
  });
  weapons.update(dt, firing && !player.car);
  activeMissions().update(dt);
  city.update(dt);
  // Marco idles in his alley; his marker breathes
  marcoMesh.rotation.y = Math.sin(elapsed * 0.8) * 0.35;
  marcoMarker.scale.setScalar(1 + Math.sin(elapsed * 3) * 0.07);
  // --- wanted flow: CHASE → SEARCH → CLEAR (GTA-style suspect search)
  let nearestCopD = Infinity;
  for (const cop of police.cops) nearestCopD = Math.min(nearestCopD, dist2d(cop.x, cop.z, player.x, player.z));
  lastNearestCopD = nearestCopD;
  // NB: the helicopter alone never holds "seen" — ground line-of-sight drives
  // the search, or a 5★ escape (DUO ch.6) could never go dark under the bird.
  const seen = nearestCopD < 62 || police.officerThreatDist < 40;
  if (seen) { unseenT = 0; lastSeenX = player.x; lastSeenZ = player.z; } else unseenT += dt;
  if (holdFlow && wanted > 0) {
    // inside the bank the police KNOW where you are: no search, no drain —
    // the response waits at the door for the exit
    wantedState = 'chase'; search = null; unseenT = 0;
    lastSeenX = 100; lastSeenZ = 150;
    episodePeak = Math.max(episodePeak, wanted);
  } else if (pinnedWanted !== null) {
    wantedState = wanted > 0 ? 'chase' : 'clear';
    search = null;
  } else if (wanted > 0) {
    episodePeak = Math.max(episodePeak, wanted);
    if (seen) {
      wantedState = 'chase'; search = null;
    } else {
      if (wantedState !== 'search') wantedState = 'chase';
      if (wantedState === 'chase' && unseenT > 3) {
        const stars = Math.ceil(wanted);
        const total = TUNING.searchBaseTime + TUNING.searchPerStar * stars;
        search = { x: lastSeenX, z: lastSeenZ, radius: TUNING.searchRadiusBase + TUNING.searchRadiusPerStar * stars, timer: total, total };
        wantedState = 'search';
      }
      if (wantedState === 'search' && search) {
        const dC = dist2d(player.x, player.z, search.x, search.z);
        const still = player.car ? Math.abs(player.car.speed) < 0.5 : Math.abs(player.speed) < 0.5;
        const rate = dC > search.radius ? 1.35 : (still ? 1.55 : 0.8);   // hidden drains faster; leaving unseen also drains
        search.timer -= dt * rate;
        if (search.timer <= 0) {
          wanted = 0; wantedState = 'clear'; search = null;
          if (episodePeak >= 1) { addRep(Math.ceil(episodePeak) * TUNING.repPerEscapeStar, true); hud.toast('✅ Lolos — jejak dingin.'); }
          episodePeak = 0;
        }
      }
    }
  } else { wantedState = 'clear'; search = null; episodePeak = 0; }
  // --- bust meter: a cop car alongside, or an officer on foot right on you
  if (wanted > 0 && (nearestCopD < 9.5 || police.officerThreatDist < 3.4) && Math.abs(player.speed) < 2.2) bust += TUNING.bustFillPerSec * dt;
  else bust = Math.max(0, bust - TUNING.bustDrainPerSec * dt);
  if (bust >= 1) { busted(); return; }
  // --- on-foot injuries from moving vehicles (armour absorbs part)
  if (!player.car && hitTimer <= 0) {
    for (const v of world.vehicles) {
      if (Math.abs(v.speed) > 5 && dist2d(v.x, v.z, player.x, player.z) < 2.4) {
        hitTimer = 1.1;
        const away = Math.atan2(player.x - v.x, player.z - v.z);
        let nx = player.x + Math.sin(away) * 3, nz = player.z + Math.cos(away) * 3;
        [nx, nz] = collideCircle(world.colliders, nx, nz, 0.55);
        player.x = nx; player.z = nz;
        audio.crash(0.7);
        if (hurtPlayer(20 + Math.abs(v.speed) * 0.4)) return;   // wasted() already ran
        break;
      }
    }
  }
  if (player.health < 100 && elapsed - lastHurtT > 6) player.health = Math.min(100, player.health + 7 * dt);
  // --- zone tracking (toast + HUD label on entry)
  const z = zoneAt(player.x, player.z);
  if (z !== currentZone) {
    currentZone = z;
    hud.setZone(ZONE_NAMES[z]);
    hud.toast(`📍 ${ZONE_NAMES[z]}`);
  }
  // --- audio beds
  audio.setEngine(!!player.car, player.car ? Math.abs(player.car.speed) / player.car.model.topSpeed : 0);
  audio.setRadio(player.car ? radioStation : 0);
  const closing = nearestCopD === Infinity ? 0 : clamp((updateWorld._prevCopD - nearestCopD) / Math.max(dt, 0.001), -30, 30);
  updateWorld._prevCopD = nearestCopD;
  audio.setSiren(nearestCopD === Infinity ? 999 : nearestCopD, closing);
  const hp = police.heliPos();
  audio.setHeli(hp ? Math.hypot(hp.x - player.x, hp.z - player.z, hp.y) : null);
  if (hornTimer <= 0 && dist2d(player.x, player.z, 190, 257) < TUNING.boatHornRange) { audio.boatHorn(); hornTimer = randRange(rng, 20, 36); }
  // --- HUD
  hud.setWanted(wanted);
  hud.setBust(bust > 0.02 ? bust : null);
  hud.setSearch(wantedState === 'search' && search ? search.timer / search.total : null);
  hud.setArmour(S.armour > 0 ? S.armour / 100 : null);
  if (player.car) {
    hud.setDrive(player.car.speed * 3.6, player.car.health / 100, player.car.model.name, nitroMeter / 100);
    hud.setHealth(null);
    hud.setWeapon(null);
  } else {
    hud.setDrive(null);
    hud.setHealth(player.health < 99.5 ? player.health / 100 : null);
    if (weapons.current === 'bat') hud.setWeapon('Bat · MELEE');
    else if (weapons.current) {
      const def = weaponDef(weapons.current), st = weapons.state[weapons.current];
      hud.setWeapon(`${def.name} · ${st.mag} / ${st.reserve}${weapons.reloading > 0 ? ' · RELOADING' : ''}`);
    } else hud.setWeapon(null);
  }
  const runner = activeMissions();
  hud.drawMinimap({
    player: { x: player.x, z: player.z, heading: player.heading },
    target: runner.target(),
    rival: runner.active?.rico ? { x: runner.active.rico.x, z: runner.active.rico.z } : null,
    cops: police.cops, boats: city.cruisers.map((c) => ({ x: c.g.position.x, z: c.g.position.z })),
    houseOwned: S.house,
    search: wantedState === 'search' && search ? { x: search.x, z: search.z, radius: search.radius } : null,
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
  // nitro FOV kick
  const targetFov = car && car.nitroOn ? 68 : 62;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 7);
    camera.updateProjectionMatrix();
  }
}
function damp(a, b, lambda, dt) { return a + (b - a) * (1 - Math.exp(-lambda * dt)); }

// ---------------------------------------------------------------- shot staging API + debug hook
let shotCam = null;   // staged camera for screenshot mode: { pos, target }
const shotApi = {
  scene, camera, renderer, player, hud, police, traffic, peds,
  get missions() { return activeMissions(); },
  allVehicles, enterCar, exitCar: exitCarInternal,
  setWanted(n) { wanted = n; if (n > 0) { lastSeenX = player.x; lastSeenZ = player.z; } },
  getWanted: () => wanted,
  teleport(x, z, heading = 0) { if (player.car) exitCarInternal(); placePlayer(x, z, heading); },
  setCamera(x, y, z, tx, ty, tz) {
    shotCam = { pos: new THREE.Vector3(x, y, z), target: new THREE.Vector3(tx, ty, tz) };
    camera.position.copy(shotCam.pos); camera.lookAt(shotCam.target);
  },
  banner: (t, s) => G.banner(t, s),
  setDaylight: (v) => city.setDaylight(v),
  startMission(id) { const r = activeMissions(); const def = r.defById(id); placePlayer(def.start.x, def.start.z, player.heading); return r.start(def); },
  setDone: (ids) => { S.done = [...ids]; refreshAllMarkers(); },
  cash: () => curCash(),
  openShop, setLead,
  grantWeapon: (id) => weapons.grant(id),
  equipWeapon: (id) => weapons.equip(id),
};
window.__game = {
  get state() {
    const runner = activeMissions();
    return {
      cash: S.cash, wanted, bust, health: player.health, done: [...S.done],
      lead: currentLead, leadModel: playerMesh.userData.female ? 'female' : 'male',
      armour: S.armour, rep: S.rep, wantedState, zone: currentZone,
      search: search ? { ...search } : null,
      house: S.house, stored: S.stored, inCar: !!player.car, mode,
      player: { x: player.x, z: player.z, heading: player.heading, speed: player.speed, y: player.yOff },
      car: player.car ? { model: player.car.model.id, health: player.car.health, dead: player.car.dead, speed: player.car.speed } : null,
      mission: runner.active ? { id: runner.active.def.id, stage: runner.active.stage ?? null, gate: runner.active.gate ?? null, ricoGate: runner.active.ricoGate ?? null, timer: runner.active.timer ?? null } : null,
      cops: police.cops.length, heli: !!police.heliState, heliState: police.heliState, heliHp: police.heliHp,
      blocks: police.blocks.length, officersOut: police.officers.filter((o) => o.state === 'foot').length,
      peds: peds.peds.length, traffic: traffic.vehicles.length,
    };
  },
  player, police, traffic, peds, hud, scene, camera,
  get missions() { return activeMissions(); },
  start: (fresh) => startGame(fresh),
  newGame, save, loadSave,
  teleport: shotApi.teleport, enterCar, exitCar: exitCarInternal, interact, toggleCar,
  setWanted: shotApi.setWanted, addCash: (n) => G.addCash(n),
  setCash(n) { setCurCash(n); },
  startMission: shotApi.startMission,
  vehicles: allVehicles, world: currentWorld,
  setDaylight: shotApi.setDaylight,
  stage: (name) => stageShot(name, shotApi),
  setCamera: shotApi.setCamera,
  keys,
  // PLUS test hooks
  plus: {
    weapons: () => ({ current: weapons.current, state: JSON.parse(JSON.stringify(weapons.state)), pickupsTaken: weapons.pickups.filter((p) => p.taken).map((p) => p.id), tempPickups: weapons.tempPickups.length, reloading: weapons.reloading }),
    equip: (id) => weapons.equip(id),
    grant: (id) => weapons.grant(id, true),
    openShop, closeShop, shopOpen: () => mode === 'shop',
    armour: () => S.armour, setArmour: (n) => { S.armour = n; },
    rep: () => S.rep, addRep: (n) => addRep(n, true),
    nitro: () => nitroMeter, radio: () => radioStation,
    wheel: () => ({ open: wheelOpen, sel: wheelSel, timeScale: wheelOpen ? 0.25 : 1 }),
    setKey: (code, down) => handleKey(code, down),
    wheelMove: (dx, dy) => wheelMove(dx, dy),
    setFiring: (b) => { firing = b; },
    reload: () => weapons.startReload(),
    hurtPlayer: (n) => hurtPlayer(n),
    aimAt: (x, z) => { camYaw = Math.atan2(x - player.x, z - player.z) + Math.PI; },   // camYaw sits behind the facing: aimHeading = camYaw + π must equal atan2(dx, dz)
    fireRocketAt: (to) => weapons.fireRocketAt({ x: player.x, z: player.z }, to),
    damageHeli: (n) => police.damageHeli(n),
    heliPos: () => police.heliPos(),
    clearOfficers: () => { for (const o of [...police.officers]) police.destroyOfficer(o); },
    heli: () => ({ state: police.heliState, hp: police.heliHp, spawns: police.heliSpawns, cooldown: police.heliCooldown }),
    officers: () => police.officers.map((o) => ({ state: o.state, x: o.x, z: o.z })),
    thugs: () => missions.thugsAlive(),
    zone: () => currentZone,
    searchState: () => ({ wantedState, search: search ? { ...search } : null }),
    lead: () => currentLead, campaign: () => 'single',
    leadModel: () => (playerMesh.userData.female ? 'female' : 'male'),
    pedGenders: () => ({ female: peds.peds.filter((p) => p.female).length, total: peds.peds.length }),
    heist: () => (missions.active?.heist ? {
      step: missions.active.heist.step, fear: missions.active.heist.fear,
      drill: missions.active.heist.drillTotal ? missions.active.heist.drillT / missions.active.heist.drillTotal : 0,
      bags: missions.active.heist.bagsGot, inside: missions.playerInsideBank(),
      hostageHurt: missions.active.heist.hostageHurt,
      hostages: missions.active.heist.hostages.length,
      bagsPos: missions.active.heist.bags.map((b) => ({ x: b.x, z: b.z, taken: b.taken })),
    } : null),
    heistSteps: () => missions.heistSteps(),
    dialogue: () => (missions.active ? { active: !!missions.active.dialogue, idx: missions.active.dialogueIdx || 0, total: missions.active.def.dialogue?.length || 0, talkDone: !!missions.active.talkDone } : null),
    skipDialogue: () => missions.skipDialogue(),
    enterBank: () => missions.enterBank(),
    exitBank: () => missions.exitBank(),
    phone: () => ({ open: phone.open, app: phone.app, unread: phone.unread, messages: phone.messages.map((m) => ({ from: m.from, text: m.text })) }),
    openPhone: () => openPhone(), closePhone: () => closePhone(),
    openPhoneApp: (app) => showPhoneApp(app), phoneView: () => phoneView(),
    setDone: (ids) => { S.done = [...ids]; refreshAllMarkers(); save(); },
    settings: () => ({ ...settings }),
    setSettings: (patch) => { Object.assign(settings, patch); applySettings(); saveSettings(); },
    audioInfo: () => ({ ready: !!audio.ctx, master: audio.master ? audio.master.gain.value : null, music: audio.music ? audio.music.gain.value : null, sfx: audio.sfx ? audio.sfx.gain.value : null }),
    mapState: () => ({ open: mapOpen, view: lastMapView }),
    openMap: () => openMap(), closeMap: () => closeMap(),
    cityProps: () => city.props,
    isOnRoad: (x, z, m = 0.9) => isOnRoad(x, z, m),
    rendererInfo: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, pixelRatio: renderer.getPixelRatio(), shadowOn: renderer.shadowMap.enabled }),
    time: () => elapsed,
    setLead: (id) => setLead(id),
    buyWeapon: (id) => buyWeapon(id), buyAmmo: (id) => buyAmmo(id), buyArmour: () => buyArmour(),
    shopMsg: () => shopMsgEl.textContent,
    toast: () => hud.toastEl?.textContent || '',
  },
};

// ---------------------------------------------------------------- boot + loop
if (shotName) {
  startGame(true);
  setTimeout(() => stageShot(shotName, shotApi), 600);
}
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const rawDt = Math.min(clock.getDelta(), 0.05);
  const dt = rawDt * (wheelOpen ? 0.25 : 1);   // GTA-style slow-mo while the wheel is open
  if (mode === 'play') updateWorld(dt);
  else if (mode === 'menu') city.update(dt);
  updateCamera(rawDt);
  renderer.render(scene, camera);
}
frame();
