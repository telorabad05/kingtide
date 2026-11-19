// KINGTIDE — ONE continuous 17-chapter story. Chapters 1–10: Dario Venn's
// rise from broke newcomer to king wheelman of Solmarina. A transition —
// "Meanwhile, across the bay…" — and chapters 11–17 follow Val & Rafa, the
// crime duo, ending in the Harbor Bank heist. One wallet the whole way:
// 250 → … → 17350 (end of ch.10) → … → 30750 (end of ch.17).
import * as THREE from 'three';
import { REWARDS, DUO_REWARDS, TUNING, CITY, modelById } from './config.js';
import { clamp, angleDelta, dist2d, makeRng } from './random.js';
import { Vehicle } from './cars.js';
import { makePerson, animatePerson } from './people.js';

export const MISSION_DEFS = [
  {
    id: 'sprint', name: 'Sunset Sprint', reward: REWARDS.sprint,
    giver: 'Lola Marchetti, Lola\'s Quay',
    intro: 'Lola sizes up the new arrival: "Fresh off the boat, huh? Show me you can run my waterfront."',
    start: { x: 24, z: 171 },
    stages: [
      { x: 140, z: 176, r: 9, label: 'Sprint east along the promenade' },
      { x: 190, z: 208, r: 9, label: 'Touch the quay gates' },
      { x: -40, z: 176, r: 9, label: 'Bring it home: the west steps' },
    ],
  },
  {
    id: 'package', name: 'Hot Package', reward: REWARDS.package,
    giver: 'Uncle Sal, fixer',
    intro: 'Uncle Sal has heard about the runner: "One package, no questions. Don\'t let Harbor PD ask any either."',
    start: { x: -80, z: 66 },
    stages: [
      { x: -216, z: 152, r: 11, label: 'Pick up the package at the west docks', pickup: true },
      { x: 196, z: -88, r: 11, label: 'Deliver to the Dome east gate', deliver: true },
    ],
  },
  {
    id: 'drops', name: 'Island Drops', reward: REWARDS.drops,
    giver: 'Uncle Sal, fixer',
    intro: 'Sal again: "Three drops around my bay before the clock eats them. The boat leaves when it leaves."',
    start: { x: 190, z: 208 },
    timer: 165, stageBonus: 30, timerLabel: 'drop',
    stages: [
      { x: 190, z: 306, r: 9, label: 'Drop 1: the lighthouse' },
      { x: -120, z: -8, r: 11, label: 'Drop 2: west midtown' },
      { x: 40, z: -152, r: 11, label: 'Drop 3: the north boulevards' },
    ],
  },
  {
    id: 'grandprix', name: 'Harbor Run GP', reward: REWARDS.grandprix,
    giver: 'Rico Delgado, street king',
    intro: 'Rico, king of the grid, laughs at the newcomer: "Cute. Race me for the rep, wheelman."',
    start: { x: -206, z: 166 },
    race: true,
    gates: [
      { x: -40, z: 160 }, { x: 120, z: 160 }, { x: 200, z: 160 }, { x: 200, z: 80 },
      { x: 200, z: 0 }, { x: 200, z: -80 }, { x: 120, z: -80 }, { x: -40, z: -80 },
      { x: -200, z: -80 }, { x: -200, z: 0 }, { x: -200, z: 80 }, { x: -200, z: 160 },
    ],
  },
  {
    id: 'tour', name: 'Grand Tour', reward: REWARDS.tour,
    giver: 'Uncle Sal, fixer',
    intro: 'Sal\'s proving run: "Every corner of my city, one tank of daylight. Then we talk business."',
    start: { x: -206, z: 176 },
    stages: [
      { x: 190, z: 300, r: 10, label: 'Leg 1: the end of Lola\'s Quay' },
      { x: 0, z: 4, r: 12, label: 'Leg 2: midtown crossing' },
      { x: 164, z: -44, r: 12, label: 'Leg 3: the east blocks' },
      { x: 40, z: 166, r: 12, label: 'Final leg: Ocean Drive' },
    ],
  },
  {
    id: 'heat', name: 'Harbor Heat', reward: REWARDS.heat,
    giver: 'Uncle Sal, fixer',
    intro: 'The quay pickup goes sideways — sirens. "Ditch the heat and get home, kid. Don\'t lead them to my door."',
    start: { x: 150, z: 176 },
    stages: [
      { x: 190, z: 250, r: 9, label: 'Make the pickup on Lola\'s Quay', pickup: true, heatMin: 3 },
      { x: CITY.safehouse.homeX, z: CITY.safehouse.homeZ, r: 10, label: 'Reach the Palm Row drop — with a cold trail', escape: true },
    ],
  },
  {
    id: 'dome', name: 'Dome Night', reward: REWARDS.dome,
    giver: 'Uncle Sal, fixer',
    intro: 'Sal, over a Dome match ticket: "There\'s a Velocity RS in the Dome lot with my name on it. Bring it west. Unscratched."',
    start: { x: 104, z: -96 },
    spawnCar: { modelId: 'velocity', paint: 0xd8dde3, x: 131, z: -100, heading: 0 },
    stages: [
      { x: 131, z: -100, r: 12, label: 'Steal the silver Velocity RS by the Dome', steal: true, heatMin: 2 },
      { x: -212, z: 84, r: 11, label: 'Deliver the RS to the west-side garage — keep it alive', needsStolenCar: true },
    ],
  },
  {
    id: 'cashrun', name: 'Sirens\' Harvest', reward: REWARDS.cashrun,
    giver: 'Uncle Sal, fixer',
    intro: 'Sal\'s cash van got hit and the money is scattered: "Five bags, the whole city listening. Bring them to my Palm Row garage — quiet hands, loud engine."',
    start: { x: -24, z: 52 },
    timer: 230, timerLabel: 'bag',
    stages: [
      { x: -40, z: -44, r: 10, label: 'Bag 1: the park corner', heat: 1 },
      { x: 44, z: 4, r: 10, label: 'Bag 2: midtown crossing', heat: 1 },
      { x: -116, z: 84, r: 10, label: 'Bag 3: the west blocks', heat: 1 },
      { x: 124, z: -36, r: 10, label: 'Bag 4: the east blocks', heat: 1 },
      { x: 190, z: 306, r: 9, label: 'Bag 5: the end of Lola\'s Quay', heat: 1, heatMin: 5 },
      { x: CITY.safehouse.garageX, z: CITY.safehouse.garageZ, r: CITY.safehouse.garageR, label: 'Deliver to the Palm Row garage, then break line of sight', losdrop: true },
    ],
  },
  {
    id: 'revenge', name: 'Rico\'s Revenge', reward: REWARDS.revenge,
    giver: 'Rico Delgado, street king',
    intro: 'Rico, pink slip on the dash: "Your crown or mine, wheelman. Long way round — and I\'m not playing nice."',
    start: { x: -206, z: 176 },
    race: true, rivalFactor: 0.92, rivalCorner: 0.85, ambushAtGate: 5,
    gates: [
      { x: -40, z: 160 }, { x: 120, z: 160 }, { x: 186, z: 190 }, { x: 190, z: 306 },
      { x: 200, z: 80 }, { x: 200, z: -40 }, { x: 120, z: -80 }, { x: 40, z: -40 },
      { x: 120, z: 84 }, { x: 190, z: 250 },
    ],
  },
  {
    id: 'king', name: 'King of Solmarina', reward: REWARDS.king,
    giver: 'Uncle Sal, fixer',
    intro: 'Sal\'s last job, and he\'s almost kind about it: "One pickup at the Dome lot, three drops, home by dark. Trust me."',
    start: { x: 104, z: -60 },
    legTimer: 60, pinWanted: true,
    stages: [
      { x: 131, z: -100, r: 11, label: 'The pickup: Sal\'s car at the Dome lot', sting: true },
      { x: 0, z: 4, r: 11, label: 'Drop 1: midtown crossing' },
      { x: 164, z: -44, r: 11, label: 'Drop 2: the east blocks' },
      { x: -120, z: -8, r: 11, label: 'Drop 3: west midtown' },
      { x: 190, z: 306, r: 9, label: 'The lighthouse — Lola is waiting', storyBanner: { title: 'Lola takes the package', sub: '"Boat\'s waiting, king. Get home — I\'ll make sure Sal doesn\'t."' } },
      { x: CITY.safehouse.homeX, z: CITY.safehouse.homeZ, r: 10, label: 'Final leg: home to Palm Row — still at five stars' },
    ],
    finalBanner: { title: '👑 King of Solmarina', sub: 'Sal\'s empire falls off-screen — Dario and Lola run the harbor now.' },
  },
];
MISSION_DEFS.forEach((d, i) => { d.chapter = i + 1; });

// ============================================================================
// KINGTIDE: DUO — Story Part 2. Valeria "Val" Cruz, getaway driver just out
// after taking the fall for her old crew, and Rafael "Rafa" Duarte, the
// partner who waited. Seven chapters, alternating leads, one mid-mission
// switch. All people, places and plot are original to Solmarina.
// Duo cash chain: 150 → 750 → 1650 → 3450 → 5850 → 7350 → 8550 → 13550.
// ============================================================================
export const DUO_DEFS = [
  {
    id: 'freshair', name: 'Fresh Air', reward: DUO_REWARDS.freshair, lead: 'rafa',
    giver: 'Rafael "Rafa" Duarte',
    intro: 'Five years Val took the fall for the old crew. Today the gate opens — and Rafa is waiting, engine running.',
    start: { x: -228, z: 166 },
    guestNpc: { x: -234, z: 158, outfit: { female: true, shirt: 0xc22e4a, pants: 0x23272e, hair: 0x14100c, skin: 0xd9a066 } },
    stages: [
      { x: -234, z: 158, r: 7, label: 'Pick up Val at the gate', hook: 'valPickup', heatMin: 2 },
      { x: CITY.safehouse.homeX, z: CITY.safehouse.homeZ, r: 10, label: 'Shake the tail and reach the Palm Row safehouse', escape: true },
    ],
  },
  {
    id: 'firstscore', name: 'First Score', reward: DUO_REWARDS.firstscore, lead: 'val',
    giver: 'Valeria "Val" Cruz',
    intro: 'Val, one hour out: "Prison taught me patience, not poverty. The marina cash boxes. Tonight. My way."',
    start: { x: 190, z: 208 },
    stages: [
      { x: 185, z: 246, r: 8, label: 'Bag 1: the fish stalls', heat: 1 },
      { x: 197, z: 266, r: 8, label: 'Bag 2: the moored boats', heat: 1 },
      { x: 190, z: 300, r: 8, label: 'Bag 3: the pier head', heat: 1 },
      { x: CITY.safehouse.homeX, z: CITY.safehouse.homeZ, r: 10, label: 'Escape to the safehouse — cold trail', escape: true },
    ],
  },
  {
    id: 'keys', name: 'Keys to the Bay', reward: DUO_REWARDS.keys, lead: 'rafa',
    giver: 'Rafael "Rafa" Duarte',
    intro: 'Rafa has a buyer across the bay with cash and no questions: "One azure Velocity RS, the Azure GT. It sleeps by the Dome."',
    start: { x: 104, z: -96 },
    timer: 170, timerLabel: 'buyer',
    spawnCar: { modelId: 'velocity', paint: 0x2e86de, x: 131, z: -100, heading: 0 },
    stages: [
      { x: 131, z: -100, r: 12, label: 'Steal the azure Velocity RS — the Azure GT', steal: true, heatMin: 2 },
      { x: 380, z: 56, r: 12, label: 'Deliver the Azure GT to the buyer in Harbor Industrial', needsStolenCar: true },
    ],
  },
  {
    id: 'hotcargo', name: 'Hot Cargo', reward: DUO_REWARDS.hotcargo, lead: 'val',
    giver: 'Valeria "Val" Cruz',
    intro: 'A freight-yard cash truck, a sleepy route, one case. Val: "Stop it, pop it, vanish. I will be the wind."',
    start: { x: 322, z: 120 },
    spawnCar: { modelId: 'mule', paint: 0x707880, x: 336, z: 148, heading: Math.PI / 2 },
    stages: [
      { x: 336, z: 148, r: 11, label: 'Find the cash truck in the freight yard' },
      { x: 336, z: 148, r: 5, label: 'Grab the case from the truck — on foot', onFoot: true, heatMin: 4 },
      { x: 415, z: 112, r: 11, label: 'Drop the case at the east warehouse — out of sight', losdrop: true },
    ],
  },
  {
    id: 'fence', name: 'The Fence', reward: DUO_REWARDS.fence, lead: 'rafa',
    giver: 'Rafael "Rafa" Duarte',
    intro: 'A fence named Otto buys hot paper between the container stacks. Rafa trusts him. Rafa trusts everybody once.',
    start: { x: 404, z: 66 },
    stages: [
      { x: 415, z: 84, r: 6, label: 'Meet Otto the fence between the stacks', hook: 'fenceAmbush' },
      { type: 'fight', x: 415, z: 84, r: 30, label: 'Survive the ambush' },
      { x: CITY.safehouse.homeX, z: CITY.safehouse.homeZ, r: 10, label: 'Val drives: escape to the safehouse', escape: true },
    ],
  },
  {
    id: 'betrayal', name: 'Betrayal', reward: DUO_REWARDS.betrayal, lead: 'val',
    giver: 'Valeria "Val" Cruz',
    intro: 'Otto sold the route, the fence, everything. Sirens on every street — Val: "The lighthouse. We go dark where the harbor ends."',
    start: { x: 64, z: 103 },
    stingAtStart: true,
    stages: [
      { x: 190, z: 306, r: 9, label: 'Run for the lighthouse point', hook: 'unpin' },
      { type: 'coldpoint', x: 190, z: 306, r: 55, label: 'Stay near the lighthouse until the trail is cold' },
    ],
  },
  {
    id: 'kingdom', name: 'Kingdom of Two', reward: DUO_REWARDS.kingdom, lead: 'rafa',
    giver: 'Val & Rafa',
    intro: 'Festival night. The Harbor Bank counts the whole season\'s take — and the duo plans to retire on it. First: the talk, at home.',
    start: { x: 60, z: 110 },
    daylight: 0.85,
    partnerNpc: { x: 67.5, z: 99, outfit: { female: true, shirt: 0xc22e4a, pants: 0x23272e, hair: 0x14100c, skin: 0xd9a066 } },
    dialogue: [
      { who: 'Val', text: 'Okay. One last job, Rafa. The Harbor Bank on Ocean Drive — festival night, the whole season\'s cash in one vault.' },
      { who: 'Rafa', text: 'And the crew is… us. Two people, one bank.' },
      { who: 'Val', text: 'Two people, one rule: nobody gets hurt. The lobby staff comply, we smile, we leave. Hostages are a shield, not a target.' },
      { who: 'Rafa', text: 'The drill needs about a minute on that vault door. A loud minute.' },
      { who: 'Val', text: 'The alarm trips the second the drill bites. Stars will stack up outside — that\'s fine. They wait, we work.' },
      { who: 'Rafa', text: 'Three bags. Then out the front, five stars, straight to the marina.' },
      { who: 'Val', text: 'Lola\'s boat idles at the quay. Reach it with a cold trail and we\'re ghosts — rich ghosts.' },
      { who: 'Rafa', text: 'And if it goes wrong?' },
      { who: 'Val', text: 'It won\'t. You drive, I drill, nobody bleeds. Deal?' },
      { who: 'Rafa', text: 'Deal. Let\'s retire, partner.' },
    ],
    stages: [
      { type: 'talk', x: CITY.safehouse.homeX, z: CITY.safehouse.homeZ, r: 7, label: 'Bicara dengan partner di apartemen' },
      { type: 'heist', x: 100, z: 150, r: 7, label: 'The Harbor Bank heist' },
      { x: 190, z: 250, r: 10, label: 'Escape to Lola\'s Quay — cold trail to finish', escape: true },
    ],
    finalBanner: { title: '👑 Kingdom of Two', sub: 'Dario tips his glass from the next table: "Harbor\'s big enough for two crowns." Val & Rafa run the bay now — together.' },
  },
];
DUO_DEFS.forEach((d, i) => { d.chapter = i + 1; });

/** THE single campaign: Dario's ten chapters, then the duo's seven
 *  renumbered 11–17. Chapter numbers are reassigned across the merge. */
export const STORY_DEFS = [...MISSION_DEFS, ...DUO_DEFS];
STORY_DEFS.forEach((d, i) => { d.chapter = i + 1; });

/** The Harbor Bank's street door (Oceanfront Downtown, on Ocean Drive). */
export const BANK_DOOR = { x: 100, z: 150 };
const VAL_OUTFIT = { female: true, shirt: 0xc22e4a, pants: 0x23272e, hair: 0x14100c, skin: 0xd9a066 };
const RAFA_OUTFIT = { shirt: 0x1f7a6d, pants: 0x3a3230, hair: 0x1c1710, skin: 0xa06a35 };

let npcSeed = 4242;
/** A throwaway seeded rng for one-off NPC figures (guests, thugs). */
function makePersonRng() { return makeRng(npcSeed += 7919); }

function makeBeacon(color) {  const grp = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3, 30), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.35; grp.add(ring);
  const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.15, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 16, 14, 1, true), beamMat);
  beam.position.y = 8; grp.add(beam);
  grp.userData = { ring, ringMat, beamMat };
  return grp;
}

export class MissionRunner {
  /** game: the facade from main.js (playerState, addCash, setWantedMin, banner, vehicles...). */
  constructor(scene, game, defs = STORY_DEFS) {
    this.scene = scene;
    this.game = game;
    this.defs = defs;
    this.active = null;        // { def, stage, timer, rico, stolenCar... }
    this.time = 0;
    this.bankInterior = null;  // chapter 17's bank shell, built on demand
    this.bankColliders = [];
    this.bankVaultCollider = null;
    this.bankVaultDoorMesh = null;
    this.buildBankFront();
    this.startMarkers = new Map();
    for (const def of defs) {
      const b = makeBeacon(0xffc93c);
      b.position.set(def.start.x, 0, def.start.z);
      scene.add(b);
      this.startMarkers.set(def.id, b);
    }
    this.targetBeacon = makeBeacon(0x2fe8c8);
    this.targetBeacon.visible = false;
    scene.add(this.targetBeacon);
  }
  /** The Harbor Bank storefront on Ocean Drive — a permanent landmark
   *  (dark stone + gold trim) whose door is chapter 17's way in. */
  buildBankFront() {
    const grp = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x27313d, roughness: 0.6, metalness: 0.3 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd8a022, roughness: 0.35, metalness: 0.7, emissive: 0x6b4a08, emissiveIntensity: 0.4 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(11, 5.4, 0.5), dark);
    panel.position.set(BANK_DOOR.x, 2.7, 146.5); grp.add(panel);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(8.6, 1.1, 0.3), gold);
    sign.position.set(BANK_DOOR.x, 4.6, 146.9); grp.add(sign);
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.4, 0.3), gold);
    door.position.set(BANK_DOOR.x, 1.7, 146.9); grp.add(door);
    for (const dx of [-4.6, 4.6]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.4, 0.5), gold);
      post.position.set(BANK_DOOR.x + dx, 2.7, 146.9); grp.add(post);
    }
    this.scene.add(grp);
  }
  defById(id) { return this.defs.find((d) => d.id === id); }
  isDone(id) { return this.game.isMissionDone(id); }
  /** The next chapter in the story: the first one not yet completed. */
  nextChapter() { return this.defs.find((d) => !this.isDone(d.id)) || null; }
  isUnlocked(def) { return this.nextChapter() === def; }
  chapterTag(def) { return `Chapter ${def.chapter} — ${def.name}`; }
  /** The chapter whose start beacon the player stands at, if it is unlocked. */
  nearStart() {
    if (this.active) return null;
    const next = this.nextChapter();
    if (!next) return null;
    const p = this.game.playerState();
    return dist2d(p.x, p.z, next.start.x, next.start.z) < 5.5 ? next : null;
  }
  target() {
    if (!this.active) return null;
    const a = this.active;
    if (a.def.race) { const g = a.def.gates[a.gate]; return g ? { x: g.x, z: g.z } : null; }
    const s = a.def.stages[a.stage];
    if (s?.type === 'heist' && a.heist) {
      const H = a.heist;
      if (H.step === 'goto' || H.step === 'enter') return { x: BANK_DOOR.x, z: BANK_DOOR.z };
      if (H.step === 'control' || H.step === 'drill') return { x: 60, z: 1004 };
      if (H.step === 'bags') { const b = H.bags.find((bb) => !bb.taken); return b ? { x: b.x, z: b.z } : { x: 60, z: 1012 }; }
      if (H.step === 'exit') return { x: 60, z: 991.5 };
    }
    return s ? { x: s.x, z: s.z } : null;
  }
  start(def) {
    const g = this.game;
    if (this.isDone(def.id)) return false;
    if (!this.isUnlocked(def)) {
      const next = this.nextChapter();
      g.banner('Chapter locked', `Finish ${this.chapterTag(next)} first — the story runs in order.`);
      return false;
    }
    if (this.active) return false;
    if (def.lead) g.setLead?.(def.lead);
    g.onChapterStart?.(def);
    if (def.daylight !== undefined) g.setDaylight?.(def.daylight);
    if (def.race) {
      const p = g.playerState();
      if (!p.inCar) { g.banner(this.chapterTag(def), 'You need a car to race. Bring one to the beacon.'); return false; }
      // Rico lines up beside the player in his magenta RS
      const rico = new Vehicle(this.scene, modelById('velocity'), 0xff2fb3, {});
      rico.driver = 'rival';
      rico.place(def.start.x + 4, def.start.z - 4, Math.PI / 2, g.pierRect());
      g.addVehicle(rico);
      this.active = { def, gate: 0, rico, ricoGate: 0, countdown: 2.2 };
      g.banner(this.chapterTag(def), def.intro);
    } else {
      this.active = { def, stage: 0, timer: def.timer || 0, legT: def.legTimer || 0, losTimer: 0 };
      if (def.spawnCar) {
        const sc = def.spawnCar;
        const v = new Vehicle(this.scene, modelById(sc.modelId), sc.paint, {});
        v.driver = 'parked';
        v.place(sc.x, sc.z, sc.heading, g.pierRect());
        g.addVehicle(v);
        this.active.stolenCar = v;
      }
      // PLUS (DUO): a waiting guest NPC + a sting that's already sprung
      if (def.guestNpc) {
        const mesh = makePerson(makePersonRng(), def.guestNpc.outfit);
        mesh.position.set(def.guestNpc.x, def.guestNpc.x === 190 ? 0.55 : 0.22, def.guestNpc.z);
        mesh.rotation.y = Math.PI / 2;
        this.scene.add(mesh);
        this.active.guest = { mesh, x: def.guestNpc.x, z: def.guestNpc.z };
      }
      // heist prologue: the partner waits in the apartment for the talk
      if (def.partnerNpc) {
        const mesh = makePerson(makePersonRng(), def.partnerNpc.outfit);
        mesh.position.set(def.partnerNpc.x, 0.22, def.partnerNpc.z);
        mesh.rotation.y = -Math.PI / 2;
        this.scene.add(mesh);
        this.active.partner = { mesh, x: def.partnerNpc.x, z: def.partnerNpc.z };
      }
      if (def.dialogue) { this.active.dialogue = false; this.active.dialogueIdx = 0; this.active.talkDone = false; }
      // the heist: build the bank interior now so walking in is instant
      if (def.stages.some((s) => s.type === 'heist')) {
        this.buildBankInterior();
        this.active.heist = { step: 'goto', fear: 0, controlT: 0, drillT: 0, drillTotal: 50, bagsGot: 0, hostages: [], bags: [], partner: null, drillMesh: null, hostageHurt: false, warnCd: 0, stage3: false, stage4: false };
      }
      if (def.stingAtStart) { this.active.stingFired = true; g.setPinnedWanted(5); }
      if (def.id === 'freshair') g.banner('Meanwhile, across the bay…', def.intro);
      else g.banner(this.chapterTag(def), def.intro);
    }
    this.refreshMarkers();
    return true;
  }
  /** PLUS (DUO): the fence-ambush muscle. Thugs run the player down and
   *  swing; they go down like anyone else when shot (non-gory). */
  spawnThugs(x, z, n) {
    const a = this.active;
    if (!a) return;
    a.thugs = a.thugs || [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + 0.6;
      const tx = x + Math.sin(ang) * 7, tz = z + Math.cos(ang) * 7;
      const mesh = makePerson(makePersonRng(), { shirt: 0x2b2b30, pants: 0x1c1c20, hair: 0x0c0c0c, skin: 0xa06a35 });
      mesh.position.set(tx, 0.22, tz);
      this.scene.add(mesh);
      a.thugs.push({ mesh, x: tx, z: tz, heading: 0, phase: i * 2, health: 70, state: 'chase', downT: 0, fallA: 0 });
    }
  }
  hurtThug(t, dmg) {
    if (t.state === 'down') return;
    t.health -= dmg;
    if (t.health <= 0) { t.state = 'down'; t.downT = 9999; t.fallA = 0; }
  }
  thugsAlive() { return (this.active?.thugs || []).filter((t) => t.state !== 'down').length; }
  /** Everything the weapons system may hit: ambush thugs + heist hostages. */
  combatants() {
    const a = this.active;
    if (!a) return [];
    const list = [...(a.thugs || [])];
    if (a.heist) for (const hst of a.heist.hostages) if (!hst.down) list.push(hst);
    return list;
  }
  hurtCombatant(obj, dmg) {
    if (obj.isHostage) { this.hurtHostage(obj); return; }
    this.hurtThug(obj, dmg);
  }
  /** Non-graphic rule: a hurt hostage never blocks the chapter — the job
   *  still pays in full, but the duo's clean-hands REP bonus is forfeited. */
  hurtHostage(hst) {
    const a = this.active;
    if (!a?.heist || hst.down) return;
    hst.down = true;
    a.heist.hostageHurt = true;
    this.game.banner('A hostage is hurt!', 'The job still pays — but the clean-hands REP bonus is gone. That was the ONE rule.');
  }
  // ---------------------------------------------------------- dialogue (ch.17 prologue)
  dialogueActive() { return !!this.active?.dialogue; }
  startDialogue() {
    const a = this.active;
    if (!a?.def.dialogue || a.dialogue || a.talkDone) return false;
    a.dialogue = true; a.dialogueIdx = 0;
    const line = a.def.dialogue[0];
    this.game.banner(line.who, line.text);
    return true;
  }
  advanceDialogue() {
    const a = this.active;
    if (!a?.dialogue) return false;
    a.dialogueIdx++;
    if (a.dialogueIdx >= a.def.dialogue.length) {
      a.dialogue = false; a.talkDone = true;
      this.game.banner('The plan is set', 'Wheels up — the Harbor Bank, festival night. Nobody gets hurt.');
      return true;
    }
    const line = a.def.dialogue[a.dialogueIdx];
    this.game.banner(line.who, line.text);
    return true;
  }
  skipDialogue() {
    const a = this.active;
    if (a && a.def.stages[a.stage]?.type === 'talk' && !a.talkDone) { a.dialogue = false; a.talkDone = true; return true; }
    return false;
  }
  // ---------------------------------------------------------- the bank heist (ch.17)
  playerInsideBank() {
    const p = this.game.playerState();
    return p.x > 43 && p.x < 77 && p.z > 988 && p.z < 1020;
  }
  inLobby() {
    const p = this.game.playerState();
    return p.x > 45 && p.x < 75 && p.z > 989 && p.z < 1007;
  }
  /** While the player is inside the bank, main.js freezes the search flow
   *  and stages the police response at the street door. */
  holdWantedFlow() { return !!this.active?.heist && this.playerInsideBank(); }
  /** Gunfire/explosions inside the bank spike the hostages' fear meter. */
  onNoise(kind) {
    const a = this.active;
    if (!a?.heist || !this.playerInsideBank()) return;
    const H = a.heist;
    if (kind === 'explosion') { H.fear = 100; this.game.banner('PANIC!', 'The blast terrified the lobby — get back in there and calm it down!'); }
    else if (kind === 'shotFired') { H.fear = Math.min(100, H.fear + 60); this.game.banner('Gunfire inside!', 'The hostages are panicking — the drill stalls while fear is maxed.'); }
  }
  /** The six Hugo steps, for the phone's Misi checklist + the HUD line. */
  heistSteps() {
    const a = this.active;
    if (!a || a.def.id !== 'kingdom') return null;
    const labels = ['Drive to the bank', 'Enter the building', 'Take control of the lobby — hostages subdued', 'Crack the vault (partner on the drill)', 'Grab the money — 3 bags', 'Escape to the marina, cold trail'];
    let cur;
    if (a.stage === 0) cur = -1;
    else if (a.stage >= 2) cur = 5;
    else { const s = a.heist?.step; cur = s === 'goto' ? 0 : s === 'enter' ? 1 : s === 'control' ? 2 : s === 'drill' ? 3 : s === 'bags' ? 4 : 5; }
    return labels.map((label, i) => ({ label, state: cur < 0 ? 'todo' : i < cur ? 'done' : i === cur ? 'active' : 'todo' }));
  }
  /** Context prompt for main.js (F interactions owned by the runner). */
  promptText() {
    const a = this.active;
    if (!a) return null;
    const p = this.game.playerState();
    const stage = a.def.stages[a.stage];
    if (stage?.type === 'talk') {
      if (a.dialogue) return 'F — lanjut bicara';
      if (!a.talkDone && dist2d(p.x, p.z, stage.x, stage.z) < stage.r + 1) return 'F — bicara dengan partner';
    }
    if (a.heist) {
      if (a.heist.step === 'enter' && dist2d(p.x, p.z, BANK_DOOR.x, BANK_DOOR.z) < 3.4) return 'F — masuk bank';
      if (a.heist.step === 'exit' && this.playerInsideBank() && dist2d(p.x, p.z, 60, 991.5) < 3) return 'F — keluar & kabur!';
    }
    return null;
  }
  heistInteract() {
    const a = this.active;
    if (!a?.heist) return false;
    const p = this.game.playerState();
    if (a.heist.step === 'enter' && dist2d(p.x, p.z, BANK_DOOR.x, BANK_DOOR.z) < 3.4) return this.enterBank();
    if (a.heist.step === 'exit' && this.playerInsideBank() && dist2d(p.x, p.z, 60, 991.5) < 3) return this.exitBank();
    return false;
  }
  buildBankInterior() {
    if (this.bankInterior) return;
    const g = this.game;
    const grp = new THREE.Group();
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xcfc8b8, roughness: 0.35, metalness: 0.1 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5f, roughness: 0.85 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a2f22, roughness: 0.6 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd8a022, roughness: 0.35, metalness: 0.7 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ae, roughness: 0.3, metalness: 0.85 });
    const add = (mat, w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); grp.add(m); return m; };
    add(floorMat, 32, 0.2, 32, 60, 0.05, 1003);                                   // floor slab
    const wall = (w, h, d, x, y, z) => {
      const m = add(wallMat, w, h, d, x, y, z);
      const c = { minX: x - w / 2 - 0.15, maxX: x + w / 2 + 0.15, minZ: z - d / 2 - 0.15, maxZ: z + d / 2 + 0.15 };
      g.addDynCollider?.(c); this.bankColliders.push(c);
      return m;
    };
    wall(13, 3.4, 0.6, 51.5, 1.7, 990); wall(13, 3.4, 0.6, 68.5, 1.7, 990);        // south wall (door gap x 58–62)
    wall(0.6, 3.4, 32, 44, 1.7, 1003); wall(0.6, 3.4, 32, 76, 1.7, 1003);         // west / east walls
    wall(32, 3.4, 0.6, 60, 1.7, 1019);                                            // north wall
    wall(12, 3.4, 0.6, 51, 1.7, 1006); wall(12, 3.4, 0.6, 69, 1.7, 1006);         // vault divider (gap = the door)
    wall(7, 3.4, 12, 48.5, 1.7, 1012); wall(7, 3.4, 12, 71.5, 1.7, 1012);         // sealed blocks flanking the vault room
    this.bankVaultDoorMesh = add(steelMat, 6, 3.2, 0.5, 60, 1.6, 1006);          // the vault door
    const wheelM = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.09, 8, 18), goldMat);
    wheelM.position.set(60, 1.6, 1005.6); grp.add(wheelM);
    this.bankVaultCollider = { minX: 56.8, maxX: 63.2, minZ: 1005.6, maxZ: 1006.4 };
    g.addDynCollider?.(this.bankVaultCollider); this.bankColliders.push(this.bankVaultCollider);
    const counter = add(darkMat, 14, 1.1, 1.2, 57, 0.65, 998);                    // the tellers' counter
    const cc = { minX: 49.8, maxX: 64.2, minZ: 997.2, maxZ: 998.8 };
    g.addDynCollider?.(cc); this.bankColliders.push(cc);
    add(darkMat, 2.2, 0.75, 1.1, 52, 0.5, 1002); add(darkMat, 2.2, 0.75, 1.1, 68, 0.5, 994);   // desks
    add(goldMat, 30, 0.25, 0.25, 60, 3.3, 990.2);                                 // gold trim lines
    add(goldMat, 30, 0.25, 0.25, 60, 3.3, 1005.8);
    this.scene.add(grp);
    this.bankInterior = grp;
  }
  spawnHeistCrew() {
    const a = this.active, H = a.heist;
    H.hostages = [];
    const spots = [[52, 996], [57, 1000], [63, 995], [68, 1000], [54, 1002], [66, 997]];
    const shirts = [0x4a6b8a, 0xb8b0a0, 0x7a4a5a, 0x5a7a4a, 0x8a6a3a, 0x5a5a8a];
    spots.forEach(([x, z], i) => {
      const mesh = makePerson(makePersonRng(), { female: i % 2 === 0, shirt: shirts[i] });
      mesh.position.set(x, 0.22, z);
      mesh.rotation.y = Math.PI;   // facing the entrance, hands up
      this.scene.add(mesh);
      H.hostages.push({ mesh, x, z, state: 'hostage', down: false, isHostage: true, female: i % 2 === 0, phase: i * 1.7, fallA: 0 });
    });
    const partnerLead = a.def.lead === 'rafa' ? 'val' : 'rafa';
    const pm = makePerson(makePersonRng(), partnerLead === 'val' ? VAL_OUTFIT : RAFA_OUTFIT);
    pm.position.set(60, 0.22, 1003.6); pm.rotation.y = 0;
    this.scene.add(pm);
    H.partner = { mesh: pm, x: 60, z: 1003.6 };
    const drill = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.5), new THREE.MeshStandardMaterial({ color: 0xd8a022, roughness: 0.5 }));
    drill.position.set(60, 1.05, 1004.6); this.scene.add(drill);
    H.drillMesh = drill;
    H.bags = [];
    for (const [x, z] of [[56, 1012], [60, 1013.5], [64, 1012]]) {
      const bm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.45), new THREE.MeshStandardMaterial({ color: 0x2e7d46, emissive: 0x1d5c31, emissiveIntensity: 0.5, roughness: 0.7 }));
      bm.position.set(x, 0.45, z); this.scene.add(bm);
      H.bags.push({ mesh: bm, x, z, taken: false });
    }
  }
  clearHeistCrew() {
    const H = this.active?.heist;
    if (!H) return;
    for (const hst of H.hostages || []) this.scene.remove(hst.mesh);
    if (H.partner) this.scene.remove(H.partner.mesh);
    if (H.drillMesh) this.scene.remove(H.drillMesh);
    for (const b of H.bags || []) this.scene.remove(b.mesh);
    H.hostages = []; H.bags = []; H.partner = null; H.drillMesh = null;
  }
  enterBank() {
    const a = this.active;
    if (!a?.heist || a.heist.step !== 'enter') return false;
    this.spawnHeistCrew();
    a.heist.step = 'control'; a.heist.controlT = 0;
    this.game.movePlayer?.(60, 993.5, 0);
    this.game.banner('You\'re in', 'Hands up, nobody moves — keep the lobby calm and controlled.');
    return true;
  }
  exitBank() {
    const a = this.active;
    if (!a?.heist || a.heist.step !== 'exit') return false;
    a.heist.step = 'gone';
    this.clearHeistCrew();
    this.game.movePlayer?.(BANK_DOOR.x, BANK_DOOR.z - 3.5, 0);
    this.game.setWantedMin(5);
    this.game.banner('GO! GO! GO!', 'Five stars — the marina, cold trail, NOW.');
    return true;
  }
  openVault() {
    if (this.bankVaultDoorMesh) this.bankVaultDoorMesh.position.y = -1.4;   // the great door sinks open
    if (this.bankVaultCollider) {
      this.game.removeDynCollider?.(this.bankVaultCollider);
      const i = this.bankColliders.indexOf(this.bankVaultCollider);
      if (i >= 0) this.bankColliders.splice(i, 1);
      this.bankVaultCollider = null;
    }
  }
  teardownHeist() {
    if (this.active?.heist) this.clearHeistCrew();
    if (this.bankInterior) {
      for (const c of this.bankColliders || []) this.game.removeDynCollider?.(c);
      this.bankColliders = [];
      this.bankVaultCollider = null;
      this.scene.remove(this.bankInterior);
      this.bankInterior = null;
      this.bankVaultDoorMesh = null;
    }
    if (this.active) this.active.heist = null;
  }
  removeGuest() {
    if (this.active?.guest) { this.scene.remove(this.active.guest.mesh); this.active.guest = null; }
  }
  cleanupActive() {
    const g = this.game;
    const a = this.active;
    if (!a) return;
    g.setPinnedWanted(null);   // the finale's pin never outlives its chapter
    if (a.rico) g.removeVehicle(a.rico);
    if (a.guest) { this.scene.remove(a.guest.mesh); a.guest = null; }
    if (a.partner) { this.scene.remove(a.partner.mesh); a.partner = null; }
    this.teardownHeist();
    if (a.thugs) { for (const t of a.thugs) this.scene.remove(t.mesh); a.thugs = []; }
    g.missionCleanup?.();
    // the Dome RS goes back to the world only if Dario never took it
    if (a.stolenCar && a.stolenCar !== g.playerCar()) g.removeVehicle(a.stolenCar);
  }
  fail(reason) {
    const g = this.game;
    this.cleanupActive();
    this.active = null;
    g.banner('Chapter failed', reason);
    this.refreshMarkers();
  }
  complete() {
    const g = this.game;
    const def = this.active.def;
    // heist rule: a hurt hostage costs the chapter's REP bonus, never the pay
    const noRep = def.id === 'kingdom' && !!this.active.heist?.hostageHurt;
    this.cleanupActive();
    this.active = null;
    if (noRep && g.markMissionDoneNoRep) g.markMissionDoneNoRep(def.id);
    else g.markMissionDone(def.id);
    g.addCash(def.reward);
    if (def.finalBanner) {
      g.banner(def.finalBanner.title, `${def.finalBanner.sub} (+$${def.reward.toLocaleString()})`);
    } else {
      const next = this.nextChapter();
      g.banner(`${this.chapterTag(def)} — complete!`,
        `+$${def.reward.toLocaleString()} · new balance $${g.cash().toLocaleString()}${next ? ` · Next: ${this.chapterTag(next)}` : ''}`);
    }
    this.refreshMarkers();
  }
}

Object.assign(MissionRunner.prototype, {
  update(dt) {
    this.time += dt;
    for (const m of this.startMarkers.values()) {
      if (!m.visible) continue;
      const s = 1 + Math.sin(this.time * 2.6) * 0.07;
      m.userData.ring.scale.set(s, s, 1);
    }
    const a = this.active;
    if (!a) { this.targetBeacon.visible = false; return; }
    const g = this.game;
    const p = g.playerState();
    const def = a.def;
    // the fence ambush: the moment the fight stage opens, Val takes the wheel
    if (def.id === 'fence' && a.stage === 2 && !a.switched) { a.switched = true; g.onFenceSwitch?.(); }
    if (a.partner) animatePerson(a.partner.mesh, this.time * 1.2, false);   // prologue partner idles in the room
    // the Dome RS must survive its own chapter
    if (a.stolenCar && a.stolenCar.dead) {
      this.fail('The Velocity RS is wrecked. Sal wanted it unscratched — the deal is off.');
      return;
    }
    // PLUS (DUO): ambush muscle — thugs close in and swing at the player
    if (a.thugs) {
      const world = g.world();
      for (const t of a.thugs) {
        if (t.state === 'down') {
          t.fallA = Math.min(1, t.fallA + dt * 4);
          t.mesh.rotation.x = -Math.PI / 2 * t.fallA * 0.96;
          t.mesh.position.set(t.x, 0.22, t.z);
          continue;
        }
        const d = dist2d(t.x, t.z, p.x, p.z);
        t.heading += Math.max(-dt * 7, Math.min(dt * 7, ((Math.atan2(p.x - t.x, p.z - t.z) - t.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
        if (d > 1.5) {
          t.x += Math.sin(t.heading) * 4.3 * dt;
          t.z += Math.cos(t.heading) * 4.3 * dt;
          t.phase += dt * 11;
          animatePerson(t.mesh, t.phase, true);
        } else {
          animatePerson(t.mesh, t.phase, false);
          if (!p.inCar) g.hurtPlayer(7 * dt);   // fists, up close
        }
        t.mesh.position.set(t.x, 0.22, t.z);
        t.mesh.rotation.y = t.heading;
      }
    }
    // the finale: once the sting has sprung, the heat is pinned at five stars
    if (def.pinWanted && a.stingFired && g.wantedLevel() < 5) g.setWantedMin(5);
    // per-leg pressure in the finale
    if (def.legTimer) {
      a.legT -= dt;
      if (a.legT <= 0) { this.fail('Too slow — with the net this tight, the run dies. Retry the chapter.'); return; }
    }
    const t = this.target();
    if (t) {
      this.targetBeacon.visible = true;
      this.targetBeacon.position.set(t.x, 0, t.z);
      const s = 1 + Math.sin(this.time * 4.2) * 0.1;   // the live target throbs faster
      this.targetBeacon.userData.ring.scale.set(s, s, 1);
    }
    if (def.race) { this.updateRace(dt, a, p); return; }
    const stage = def.stages[a.stage];
    if (!stage) return;
    const tag = this.chapterTag(def);
    // timed chapters tick down
    if (def.timer) {
      a.timer -= dt;
      const left = Math.max(0, Math.ceil(a.timer));
      g.objective(`${tag} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left · ${def.timerLabel || 'drop'} ${a.stage + 1}/${def.stages.length}${a.timer < 20 ? ' — HURRY' : ''}`);
      if (a.timer <= 0) { this.fail(def.id === 'cashrun' ? 'The trail went cold and the money scattered. Sal will want a faster run.' : 'Out of time. The drops will wait for another run.'); return; }
    }
    const arrive = () => {
      if (stage.hook) g.stageHook?.(stage.hook, this);
      if (stage.pickup) g.banner('Package on board', 'Now get moving — and watch for Harbor PD.');
      if (stage.sting) {
        a.stingFired = true;
        g.setPinnedWanted(5);
        g.banner('IT\'S A STING!', 'Sal sold you out — five stars, roadblocks, the helicopter. RUN.');
      }
      if (stage.storyBanner) g.banner(stage.storyBanner.title, stage.storyBanner.sub);
      if (stage.deliver) g.setWantedMin(2);
      if (stage.heatMin) g.setWantedMin(stage.heatMin);
      if (stage.heat) { g.addHeat(stage.heat); g.banner('Bag grabbed', 'The heat just went up a star. Keep moving!'); }
      if (def.stageBonus) { a.timer += def.stageBonus; g.banner('Drop made', `+${def.stageBonus} seconds on the clock.`); }
      if (def.legTimer) a.legT = def.legTimer;
      a.stage++;
      if (a.stage >= def.stages.length) this.complete();
    };
    if (stage.type === 'fight') {
      const alive = this.thugsAlive();
      g.objective(`${tag} · ${stage.label} — ${alive} still standing`);
      if (alive === 0 && (a.thugs?.length || 0) > 0) arrive();
      return;
    }
    if (stage.type === 'talk') {
      // heist prologue: stand with your partner, talk it through with F
      if (a.talkDone) { arrive(); return; }
      const near = dist2d(p.x, p.z, stage.x, stage.z) < stage.r;
      g.objective(a.dialogue
        ? `${tag} · Percakapan dengan partner — tekan F untuk lanjut (${(a.dialogueIdx || 0) + 1}/${def.dialogue.length})`
        : `${tag} · ${stage.label}${near ? ' — tekan F untuk bicara' : ''}`);
      return;
    }
    if (stage.type === 'heist') {
      const H = a.heist;
      if (!H) return;
      const inside = this.playerInsideBank();
      const lobby = this.inLobby();
      // bailed out mid-job (wasted / busted / wandered off)? reset to the door
      if ((H.step === 'control' || H.step === 'drill' || H.step === 'bags' || H.step === 'exit') && !inside && dist2d(p.x, p.z, BANK_DOOR.x, BANK_DOOR.z) > 25) {
        this.clearHeistCrew();
        H.step = 'enter'; H.fear = 0; H.drillT = 0; H.bagsGot = 0; H.stage3 = H.stage4 = false;
        if (this.bankVaultDoorMesh) this.bankVaultDoorMesh.position.y = 1.6;
        if (!this.bankVaultCollider) {
          this.bankVaultCollider = { minX: 56.8, maxX: 63.2, minZ: 1005.6, maxZ: 1006.4 };
          g.addDynCollider?.(this.bankVaultCollider); this.bankColliders.push(this.bankVaultCollider);
        }
        g.banner('Back to the bank', 'You slipped away mid-job — walk back in and finish it.');
      }
      // hostages: crouched, hands up, trembling — posed every frame
      for (const hst of H.hostages) {
        const u = hst.mesh.userData;
        if (hst.down) {
          hst.fallA = Math.min(1, (hst.fallA || 0) + dt * 4);
          hst.mesh.rotation.x = -Math.PI / 2 * hst.fallA * 0.96;
          hst.mesh.position.set(hst.x, 0.22, hst.z);
          continue;
        }
        hst.mesh.position.set(hst.x, -0.12 + Math.sin(this.time * 7 + hst.phase) * 0.008, hst.z);
        u.armL.position.y = 1.52; u.armR.position.y = 1.52;
        u.armL.rotation.z = 0.55; u.armR.rotation.z = -0.55;
        u.legL.rotation.x = 0.9; u.legR.rotation.x = 0.9;
      }
      // the partner works the vault while the drill step runs
      if (H.partner) {
        H.partner.mesh.position.set(H.partner.x, 0.22, H.partner.z);
        H.partner.mesh.rotation.y = 0;
        if (H.step === 'drill') {
          const u = H.partner.mesh.userData;
          u.armR.rotation.x = -1.2 + Math.sin(this.time * 31) * 0.08;   // drill judder
          u.armL.rotation.x = -1.1;
          if (Math.random() < dt * 6) g.fxSpark?.(60 + (Math.random() - 0.5) * 0.8, 1.1, 1005.3);
        }
      }
      const steps = this.heistSteps();
      const checklist = steps.map((s) => `${s.state === 'done' ? '✓' : s.state === 'active' ? '▶' : '·'} ${s.label}`).join('  ');
      if (H.step === 'goto') {
        g.objective(`${tag} · HEIST — ${checklist}`);
        if (dist2d(p.x, p.z, BANK_DOOR.x, BANK_DOOR.z) < stage.r) { H.step = 'enter'; g.banner('The Harbor Bank', 'Festival cash, one vault, two legends. Walk in calm — F at the door.'); }
      } else if (H.step === 'enter') {
        g.objective(`${tag} · HEIST — ${checklist} · (F di pintu untuk masuk)`);
      } else if (H.step === 'control') {
        if (lobby) H.controlT += dt;
        g.objective(`${tag} · HEIST — ${checklist} · kendalikan lobi… ${Math.min(100, Math.round(H.controlT / 2.5 * 100))}%`);
        if (H.controlT >= 2.5) {
          H.step = 'drill';
          g.setWantedMin(2);
          g.banner('The drill bites!', 'Alarm\'s tripped — Harbor PD is rolling. Keep the lobby calm while your partner works.');
          g.onBeat?.('drill');
        }
      } else if (H.step === 'drill') {
        if (lobby) H.fear = Math.max(0, H.fear - 10 * dt);
        else H.fear = Math.min(100, H.fear + 4.5 * dt);
        if (H.fear < 100) {
          H.drillT += dt;
          const f = H.drillT / H.drillTotal;
          if (f >= 0.5 && !H.stage3) { H.stage3 = true; g.setWantedMin(3); g.banner('Halfway through the door', 'More units outside — three stars. Hold the lobby.'); }
          if (f >= 0.85 && !H.stage4) { H.stage4 = true; g.setWantedMin(4); g.banner('Nearly there…', 'Four stars. The vault is groaning — seconds now.'); }
          if (f >= 1) {
            H.step = 'bags';
            this.openVault();
            g.banner('VAULT OPEN!', 'Grab the three cash bags — then out the front and GONE.');
            g.onBeat?.('vault');
          }
        }
        H.warnCd -= dt;
        if (H.fear >= 100 && H.warnCd <= 0) { H.warnCd = 6; g.banner('The lobby is panicking!', 'Fear is maxed — the drill stalls. Get back into the lobby and calm them down!'); }
        g.objective(`${tag} · HEIST — ${checklist} · 🔩 bor ${Math.floor(Math.min(1, H.drillT / H.drillTotal) * 100)}% · 😨 takut ${Math.round(H.fear)}%`);
      } else if (H.step === 'bags') {
        for (const b of H.bags) {
          if (b.taken) continue;
          b.mesh.rotation.y += dt * 2;
          if (dist2d(p.x, p.z, b.x, b.z) < 1.7) {
            b.taken = true; b.mesh.visible = false; H.bagsGot++;
            g.banner(`Bag ${H.bagsGot}/3 secured`, H.bagsGot >= 3 ? 'That\'s everything — out the front door!' : 'Keep them coming.');
          }
        }
        g.objective(`${tag} · HEIST — ${checklist} · 💰 tas ${H.bagsGot}/3`);
        if (H.bagsGot >= 3) H.step = 'exit';
      } else if (H.step === 'exit') {
        g.objective(`${tag} · HEIST — ${checklist} · keluar lewat pintu depan (F)`);
      } else if (H.step === 'gone') {
        arrive();
      }
      return;
    }
    if (stage.type === 'coldpoint') {
      const at = dist2d(p.x, p.z, stage.x, stage.z) < stage.r;
      const cold = g.wantedLevel() <= 0.05;
      g.objective(at
        ? (cold ? `${tag} · The trail is cold…` : `${tag} · Go dark near the lighthouse — break sight, let the search die (${'★'.repeat(Math.ceil(g.wantedLevel()))})`)
        : `${tag} · ${stage.label}`);
      if (at && cold) arrive();
      return;
    }
    if (stage.steal) {
      if (!def.timer) g.objective(`${tag} · ${stage.label}`);
      if (g.playerCar() && g.playerCar() === a.stolenCar) {
        g.banner('That\'s the one!', 'Harbor PD caught the theft on camera — two stars. Get it west, keep it whole.');
        arrive();
      }
      return;
    }
    if (stage.escape) {
      const at = dist2d(p.x, p.z, stage.x, stage.z) < stage.r;
      const hot = g.wantedLevel() > 0.05;
      if (!def.timer) g.objective(hot
        ? `${tag} · Lose the heat first! (${'★'.repeat(Math.ceil(g.wantedLevel()))}) — break line of sight and let it cool`
        : `${tag} · ${stage.label}`);
      if (at && !hot) arrive();
      return;
    }
    if (stage.losdrop) {
      // the drop completes only after 3 s inside the garage with no ground
      // unit close enough to see it (the helicopter does not count)
      const at = dist2d(p.x, p.z, stage.x, stage.z) < stage.r;
      const clear = g.nearestCopDist() > 45;
      a.losTimer = at && clear ? (a.losTimer || 0) + dt : 0;
      const left = Math.max(0, Math.ceil(a.timer));
      const clock = def.timer ? ` · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left` : '';
      g.objective(at
        ? (clear
          ? `${tag} · Hold in the garage, out of sight… ${Math.max(0, 3 - a.losTimer).toFixed(1)}s${clock}`
          : `${tag} · Cops can still see you — break line of sight inside the garage!${clock}`)
        : `${tag} · ${stage.label}${clock}`);
      if (a.losTimer >= 3) arrive();
      return;
    }
    if (!def.timer) {
      if (stage.needsStolenCar && g.playerCar() !== a.stolenCar) {
        g.objective(`${tag} · Deliver the silver RS itself — no substitutes`);
      } else {
        g.objective(`${tag} · ${stage.label}${def.legTimer ? ` · ${Math.max(0, Math.ceil(a.legT))}s for this leg` : ''}`);
      }
    }
    if (dist2d(p.x, p.z, stage.x, stage.z) < stage.r) {
      if (stage.needsStolenCar && g.playerCar() !== a.stolenCar) return;   // wrong car: no delivery
      if (stage.onFoot && p.inCar) { g.objective(`${tag} · ${stage.label} — on foot!`); return; }
      arrive();
    }
  },
  updateRace(dt, a, p) {
    const g = this.game;
    const def = a.def;
    const rico = a.rico;
    if (a.countdown > 0) {
      a.countdown -= dt;
      rico.step(dt, { throttle: 0, steer: 0, handbrake: true }, g.world());
    } else {
      // Rico drives the same gates, at a capped fraction of his car's legs
      const gate = def.gates[a.ricoGate];
      if (gate) {
        const want = Math.atan2(gate.x - rico.x, gate.z - rico.z);
        const steer = clamp(angleDelta(rico.heading, want) * 1.8, -1, 1);
        const throttle = Math.abs(angleDelta(rico.heading, want)) > 0.6 ? 0.35 : 1;
        rico.step(dt, { throttle, steer, handbrake: false }, g.world());
        const turning = Math.abs(angleDelta(rico.heading, want)) > 0.35;
        const top = rico.model.topSpeed * (def.rivalFactor || TUNING.rivalSpeedFactor) * (turning ? (def.rivalCorner ?? 0.7) : 1);
        if (rico.speed > top) rico.speed = top;
        if (dist2d(rico.x, rico.z, gate.x, gate.z) < 13) {
          a.ricoGate++;
          if (a.ricoGate >= def.gates.length) { this.fail(def.id === 'revenge' ? 'Rico keeps his crown — this time. Rematch him at the beacon.' : 'Rico takes the Harbor Run GP. Rematch him at the start beacon.'); return; }
        }
      }
      // Rico plays dirty in the rematch: alongside you, he shoves
      a.shoveCd = Math.max(0, (a.shoveCd || 0) - dt);
      const pc = g.playerCar();
      if (pc && a.shoveCd <= 0 && dist2d(rico.x, rico.z, p.x, p.z) < 4.2) {
        const away = Math.atan2(pc.x - rico.x, pc.z - rico.z);
        pc.place(pc.x + Math.sin(away) * 1.1, pc.z + Math.cos(away) * 1.1, pc.heading + (Math.sin(this.time * 13) > 0 ? 0.06 : -0.06), g.pierRect());
        pc.speed *= 0.9;
        a.shoveCd = 2.5;
        if (!a.shoved) { a.shoved = true; g.banner('Rico\'s playing dirty!', 'He\'s shoving you off the line — hold it together!'); }
      }
    }
    const gate = def.gates[a.gate];
    g.objective(`${this.chapterTag(def)} · gate ${Math.min(a.gate + 1, def.gates.length)}/${def.gates.length} · Rico on ${Math.min(a.ricoGate + 1, def.gates.length)}`);
    if (gate && dist2d(p.x, p.z, gate.x, gate.z) < 13) {
      a.gate++;
      if (a.gate >= def.gates.length) { this.complete(); return; }
      if (def.ambushAtGate && !a.ambushed && a.gate >= def.ambushAtGate) {
        a.ambushed = true;
        g.setWantedMin(3);
        g.banner('AMBUSH!', 'Harbor PD was tipped off — the race finishes hot!');
      } else {
        g.banner(this.chapterTag(def), `Gate ${a.gate}/${def.gates.length}${a.gate > a.ricoGate ? ' — you lead!' : ''}`);
      }
    }
  },
  refreshMarkers() {
    const next = this.nextChapter();
    for (const def of this.defs) {
      const m = this.startMarkers.get(def.id);
      m.visible = this.enabled !== false && def === next && !this.active;   // only the unlocked chapter of the active campaign shows
    }
    this.targetBeacon.visible = !!this.active;
  },
});
