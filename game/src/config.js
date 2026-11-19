// Vice Harbor — central configuration.
// Every number that shapes Solmarina lives here: the street grid, the tuning
// dials for traffic / police / economy, the paint palette and the car
// catalogue. Modules read from this file instead of scattering literals.

// ---------------------------------------------------------------- palette
export const PALETTE = {
  sky: 0x2e7fc2,
  horizon: 0xcfe8ef,
  asphalt: 0x3d4148,
  grass: 0x58a447,
  sand: 0xe8d29a,
  sea: 0x1b7f9e,
  buildingTones: [0xf6e3c5, 0xf3c6a5, 0xeeb4c8, 0xbfe3dd, 0xf9efb8, 0xd9c7ec, 0xffd9a0, 0xc4e0f2],
  carPaints: [0xd64541, 0x2e86de, 0xf7b731, 0x20bf6b, 0x8854d0, 0xfd9644, 0xd1d8e0, 0x4b6584, 0xeccc68, 0xff6b81, 0x7bed9f, 0x5352ed],
  boatPaints: [0xffffff, 0xd64541, 0x2e86de, 0xf7b731, 0x20bf6b, 0xff8fab],
};

// ---------------------------------------------------------------- the city
// Avenues run north-south (constant x), boulevards east-west (constant z).
// The southernmost boulevard (z = 160) is Ocean Drive: promenade, beach and
// the sea lie beyond it. Lola's Quay is a pier reaching south into the water.
export const CITY = {
  avenuesX: [-200, -120, -40, 40, 120, 200],
  boulevardsZ: [-160, -80, 0, 80, 160],
  roadHalf: 8,           // every road is 16 m wide
  laneOffset: 3.1,       // right-hand traffic lane offset from the centreline
  extentX: 248,          // world clamp for actors
  northZ: -208,
  oceanDriveZ: 160,
  promenadeZ: 178,       // centreline of the promenade walk
  beachZ: 190,           // sand starts here
  oceanZ: 236,           // water plane starts here
  pier: { minX: 178, maxX: 202, minZ: 196, maxZ: 318, deckTop: 0.55 },
  stadium: { cx: 160, cz: -120, r: 27 },
  safehouse: {
    blockCx: 80, blockCz: 120,
    buyX: 64, buyZ: 96,          // purchase marker spot
    homeX: 64, homeZ: 103,       // where Dario respawns / stands at home
    garageX: 88, garageZ: 116, garageR: 11,   // park a car here to store it
  },
  spawn: { x: 8, z: 174, heading: Math.PI },  // on the promenade, facing the sea road
  hospital: { x: -196, z: 148 },              // wasted respawn (west end of Ocean Drive)
};

// ---------------------------------------------------------------- tuning
export const TUNING = {
  trafficCount: 24,
  pedCount: 48,
  startCash: 250,
  housePrice: 2500,
  bustedFineBase: 100,       // + 50 per wanted star
  wastedFee: 100,
  rivalSpeedFactor: 0.82,    // Rico's car runs at this fraction of its top speed
  pedChatChance: 0.35,       // chance a meeting pair stops to talk
  sickEngineHealth: 35,      // below this the engine smokes
  limpEngineHealth: 12,      // below this the car limps; at 0 it is dead
  boatHornRange: 90,         // player within this of the quay hears the horn
  wantedDecayPerSec: 0.045,  // (legacy) stars melt away while no cop sees you
  bustFillPerSec: 0.34,
  bustDrainPerSec: 0.5,
  // --- PLUS systems ---------------------------------------------------------
  armourAbsorb: 0.6,         // armour soaks this share of crash/explosion damage
  nitroDrainPerSec: 30,      // nitro meter burn while boosted
  nitroRegenPerSec: 7,       // nitro meter refill while cruising
  nitroMinEngage: 12,        // meter needed before nitro will kick in
  heliHp: 120,               // helicopter hit points
  heliRespawnCooldown: 75,   // seconds with no replacement heli after a kill
  heliChase4Time: 12,        // sustained seconds at 4 stars before the heli joins
  searchBaseTime: 12,        // search-zone timer: base seconds…
  searchPerStar: 7,          // …plus this many per wanted star
  searchRadiusBase: 45,      // search circle radius: base metres…
  searchRadiusPerStar: 14,   // …plus this many per wanted star
  shotHeatCooldown: 6,       // seconds between "+1 star for gunfire heard" awards
  repPerChapter: 50,         // REP for finishing any chapter
  repPerEscapeStar: 10,      // REP per star of peak heat when you shake a tail clean
  repFirstWeapon: 25,        // REP the first time Dario buys a gun
  repFirstPickup: 10,        // REP the first time a hidden weapon is found
};

// ---------------------------------------------------------------- cars
// kind drives the body builder in cars.js: sedan / coupe / sports / van /
// roadster (open top) / taxi / buggy (open frame) / wagon.
export const CAR_MODELS = [
  { id: 'sedan',    name: 'Sol Sedan',     kind: 'sedan',   len: 4.4, wid: 1.9, topSpeed: 27, accel: 11, weight: 3 },
  { id: 'coupe',    name: 'Palm Coupe',    kind: 'coupe',   len: 4.3, wid: 1.85, topSpeed: 30, accel: 13, weight: 3 },
  { id: 'velocity', name: 'Velocity RS',   kind: 'sports',  len: 4.5, wid: 1.95, topSpeed: 36, accel: 17, weight: 2 },
  { id: 'mule',     name: 'Cargo Mule',    kind: 'van',     len: 5.2, wid: 2.1, topSpeed: 23, accel: 9,  weight: 2 },
  { id: 'coral',    name: 'Coral Roadster', kind: 'roadster', len: 4.1, wid: 1.85, topSpeed: 32, accel: 15, weight: 2 },
  { id: 'taxi',     name: 'Harbor Taxi',   kind: 'taxi',    len: 4.4, wid: 1.9, topSpeed: 27, accel: 11, weight: 2 },
  { id: 'buggy',    name: 'Beach Buggy',   kind: 'buggy',   len: 3.6, wid: 1.8, topSpeed: 29, accel: 14, weight: 1 },
  { id: 'wagon',    name: 'Family Wagon',  kind: 'wagon',   len: 4.7, wid: 1.95, topSpeed: 25, accel: 10, weight: 2 },
];

export function modelById(id) {
  return CAR_MODELS.find((m) => m.id === id) || CAR_MODELS[0];
}

// Mission rewards, in story order — the cash chain a perfect run produces:
// 250 → 1050 → 2250 → 3750 → 5250 → 6350 → 7250 → 8550 → 10750 → 13350 → 17350.
export const REWARDS = {
  sprint: 800,
  package: 1200,
  drops: 1500,
  grandprix: 1500,
  tour: 1100,
  heat: 900,
  dome: 1300,
  cashrun: 2200,
  revenge: 2600,
  king: 4000,
};

// ---------------------------------------------------------------- PLUS: zones
// Solmarina grows east and south-west. Zone B (Harbor Industrial) sits across
// a channel east of downtown; Zone C (Hillcrest Island) is a villa island in
// the bay, reached by a causeway from the west end of the beach.
export const ZONES = {
  industrial: { minX: 288, maxX: 486, minZ: -84, maxZ: 204 },   // district slab
  channelX: 262,          // east of this line (and not on the island) = Zone B side
  island: { cx: -380, cz: 340, r: 112 },
  bridge: { minX: -302, maxX: -240, minZ: 230, maxZ: 292 },     // the causeway corridor
  dealer: { x: 358, z: 96, heading: Math.PI },                  // Marco's alley, Zone B
  prison: { x: -238, z: 156 },                                  // coastal correctional gate
};
export function zoneAt(x, z) {
  const dx = x - ZONES.island.cx, dz = z - ZONES.island.cz;
  if (dx * dx + dz * dz < ZONES.island.r * ZONES.island.r) return 'hillcrest';
  const B = ZONES.bridge;
  if (x >= B.minX && x <= B.maxX && z >= B.minZ && z <= B.maxZ) return 'hillcrest';
  if (x > ZONES.channelX) return 'industrial';
  return 'downtown';
}
export const ZONE_NAMES = {
  downtown: 'Oceanfront Downtown',
  industrial: 'Harbor Industrial',
  hillcrest: 'Hillcrest Island',
};

// ---------------------------------------------------------------- PLUS: REP
export const REP_RANKS = [
  { min: 0, title: 'Newcomer' },
  { min: 100, title: 'Runner' },
  { min: 300, title: 'Wheelman' },
  { min: 700, title: 'Fixer' },
  { min: 1500, title: 'Harbor King' },
];
export function repRank(rep) {
  let r = REP_RANKS[0];
  for (const k of REP_RANKS) if (rep >= k.min) r = k;
  return r.title;
}

// ------------------------------------------------------- PLUS: DUO (Part 2)
// "KINGTIDE: DUO" — Val & Rafa's own campaign: separate progress + cash in
// the save; weapons, armour and REP are shared with Dario's story.
// Duo cash chain: 150 → 750 → 1650 → 3450 → 5850 → 7350 → 8550 → 13550.
export const DUO_START_CASH = 150;
export const DUO_REWARDS = {
  freshair: 600,
  firstscore: 900,
  keys: 1800,
  hotcargo: 2400,
  fence: 1500,
  betrayal: 1200,
  kingdom: 5000,
};
