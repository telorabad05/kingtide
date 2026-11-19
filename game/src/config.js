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
  wantedDecayPerSec: 0.045,  // stars melt away while no cop sees you
  bustFillPerSec: 0.34,
  bustDrainPerSec: 0.5,
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
