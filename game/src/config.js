// Vice Harbor — world constants: the street grid of Solmarina, the palette of a
// sun-soaked coastal city, and the names the HUD shows. Everything procedural.

export const CITY = {
  // Vertical avenues run along Z at these x positions; horizontal boulevards along X at these z.
  avenuesX: [-200, -120, -40, 40, 120, 200],
  boulevardsZ: [-160, -80, 0, 80, 160],
  roadHalf: 8,          // half the road width (16 m roads, one lane each way)
  laneOffset: 4,        // lane centre distance from the road centre line
  blockInset: 3,        // sidewalk width around each block
  extentX: 232,         // city ground half-size in x
  extentZ: 196,         // city ground half-size in z (land side)
  beachZ: 196,          // where the sand starts
  oceanZ: 236,          // where the water starts
  worldZ: 420,          // far edge of the water plane
  // Lola's Quay: the marina pier on the east shore — a drivable wooden deck over
  // the water with moored boats and the harbour lighthouse at its end.
  pier: { minX: 174, maxX: 210, minZ: 228, maxZ: 306, deckTop: 0.26 },
  // The Solmarina Dome stadium block (avenues 120..200, boulevards -160..-80).
  stadium: { cx: 160, cz: -120, r: 27 },
};

export const PALETTE = {
  sky: 0x2b6cb8,
  horizon: 0xffb45e,
  sun: 0xffd9a0,
  fog: 0xf7b267,
  asphalt: 0x33373d,
  sidewalk: 0xb8ab98,
  sand: 0xe8cf9f,
  ocean: 0x14707e,
  oceanDeep: 0x0d5566,
  grass: 0x77a24f,
  buildingTones: [0xf6e3c5, 0xf9c6c0, 0xa8d8d0, 0xf7d774, 0xe88ca0, 0xbcd6f7, 0xf2f0eb, 0xffb37a, 0xcde7b0, 0xe6b8f0],
  carPaints: [0xd64541, 0x2e86de, 0xf5f6fa, 0x222f3e, 0xff9f43, 0x1abc9c, 0xeccc68, 0xa55eea, 0xff6b81, 0x7bed9f, 0x70a1ff, 0x5352ed, 0xffeaa7, 0x636e72, 0xc86bff, 0xf72585, 0xffd166],
  shirtTones: [0xffeaa7, 0x81ecec, 0xff7675, 0x74b9ff, 0x55efc4, 0xfdcb6e, 0xe17055, 0xdfe6e9, 0x00b894, 0x6c5ce7, 0xff5e78, 0x22c1a3, 0xff9ff3, 0x48dbfb],
  pantsTones: [0x2d3436, 0x636e72, 0x0984e3, 0xdfe6e9, 0x6c5ce7, 0x82573a, 0x1e6e5c, 0xb03a2e],
  hatTones: [0xff5e78, 0x22c1a3, 0xffb020, 0x4aa8ff, 0xf2f0eb, 0x222f3e, 0xff8b3d],
  skinTones: [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac],
  boatPaints: [0xf2f0eb, 0xd64541, 0x2e86de, 0xffb020, 0x22c1a3, 0xff6b81],
};

/** Live tuning for the v3 pass: denser streets, roadblocks, the race rival, air support.
 *  The v3.1 polish pass adds the last few dials: how often a stroller stops to
 *  chat, the health lines where an engine starts smoking and then limps, and
 *  how near a cruising boat must be before its horn carries to the street. */
export const TUNING = {
  trafficCount: 24,        // cars circulating at once (v1: 15, v3: 22)
  pedCount: 48,            // pedestrians strolling at once (v1: 34, v3: 46)
  roadblockStars: 4,       // wanted level at which Harbor PD parks a roadblock ahead
  roadblockMax: 2,         // interceptors parked per roadblock
  heliStars: 5,            // wanted level at which the PD helicopter joins with its spotlight
  rivalSpeedFactor: 0.82,  // the race rival's pace against its car's top speed (v3.1: Rico trained)
  fleeCarSpeed: 7,         // a car moving faster than this startles pedestrians early
  boatCruiseSpeed: 2.4,    // knots-ish pace of the two marina boats that actually cruise
  pedChatChance: 0.4,      // when a stroller's chat timer runs out, the odds they stop for a chat
  sickEngineHealth: 25,    // at or below this health the wreck plume starts smoking
  limpEngineHealth: 20,    // at or below this health the engine only makes half power
  boatHornRange: 85,       // metres: a cruising boat's horn is audible inside this
};

/** Dario's safehouse: a fenced lot on the parking block (avenues 40..120,
 *  boulevards 80..160). Buy it once and busted/wasted respawns land here, and
 *  any car you step out of inside the garage radius is stored, not abandoned. */
export const SAFEHOUSE = {
  x: 64, z: 90,              // the for-sale marker on the lot's south edge
  price: 2500,
  garageX: 64, garageZ: 96,  // where stored cars sleep and reappear
  storeRadius: 10,           // step out within this of the garage point to store the car
};

export const CAR_MODELS = [
  { name: 'Solana GT', kind: 'coupe', speed: 46, accel: 16, grip: 3.4 },
  { name: 'Bayside Sedan', kind: 'sedan', speed: 38, accel: 12, grip: 3.0 },
  { name: 'Marina Wagon', kind: 'wagon', speed: 34, accel: 11, grip: 2.8 },
  { name: 'Palm Cruiser', kind: 'convertible', speed: 42, accel: 14, grip: 3.2 },
  { name: 'Dune Runner', kind: 'pickup', speed: 36, accel: 12, grip: 2.7 },
  { name: 'Velocity RS', kind: 'sports', speed: 54, accel: 20, grip: 3.9 },
  { name: 'Cargo Mule', kind: 'van', speed: 32, accel: 10, grip: 2.6 },
  { name: 'Coral Roadster', kind: 'roadster', speed: 44, accel: 15, grip: 3.3 },
];

/** Spawn weights for traffic/parked variety: exotics stay rare, vans rarer. */
export const CAR_WEIGHTS = [4, 5, 4, 3, 3, 1.5, 2, 2];

export const POLICE_MODEL = { name: 'Harbor Interceptor', kind: 'police', speed: 48, accel: 17, grip: 3.6 };

export const STORY = {
  hero: 'Dario Venn',
  city: 'Solmarina',
  intro: 'Solmarina, 2026. Wheelman Dario Venn is back in the sun-bleached streets he swore off, ' +
    'one favour deep with marina boss Madame Lola. Run her checkpoints, move her packages, ' +
    'race her rivals off the boulevards, and try not to let Harbor PD end the reunion early.',
};
