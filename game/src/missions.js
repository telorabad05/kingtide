// The Story of Vice Harbor: ten chapters, unlocked in order, that take
// Dario Venn from broke newcomer to the harbor's king wheelman. Each chapter
// opens with a story banner (who gives the job, and the beat), runs on the
// shared stage machinery — go-to stages, timed stages, a steal, escapes that
// demand a cold trail, and two races against Rico — and pays into the chain:
// 250 → 1050 → 2250 → 3750 → 5250 → 6350 → 7250 → 8550 → 10750 → 13350 → 17350.
import * as THREE from 'three';
import { REWARDS, TUNING, CITY, modelById } from './config.js';
import { clamp, angleDelta, dist2d } from './random.js';
import { Vehicle } from './cars.js';

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

function makeBeacon(color) {
  const grp = new THREE.Group();
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
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.active = null;        // { def, stage, timer, rico, stolenCar... }
    this.time = 0;
    this.startMarkers = new Map();
    for (const def of MISSION_DEFS) {
      const b = makeBeacon(0xffc93c);
      b.position.set(def.start.x, 0, def.start.z);
      scene.add(b);
      this.startMarkers.set(def.id, b);
    }
    this.targetBeacon = makeBeacon(0x2fe8c8);
    this.targetBeacon.visible = false;
    scene.add(this.targetBeacon);
  }
  defById(id) { return MISSION_DEFS.find((d) => d.id === id); }
  isDone(id) { return this.game.isMissionDone(id); }
  /** The next chapter in the story: the first one not yet completed. */
  nextChapter() { return MISSION_DEFS.find((d) => !this.isDone(d.id)) || null; }
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
      g.banner(this.chapterTag(def), def.intro);
    }
    this.refreshMarkers();
    return true;
  }
  cleanupActive() {
    const g = this.game;
    const a = this.active;
    if (!a) return;
    g.setPinnedWanted(null);   // the finale's pin never outlives its chapter
    if (a.rico) g.removeVehicle(a.rico);
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
    this.cleanupActive();
    this.active = null;
    g.markMissionDone(def.id);
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
    // the Dome RS must survive its own chapter
    if (a.stolenCar && a.stolenCar.dead) {
      this.fail('The Velocity RS is wrecked. Sal wanted it unscratched — the deal is off.');
      return;
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
    for (const def of MISSION_DEFS) {
      const m = this.startMarkers.get(def.id);
      m.visible = def === next && !this.active;   // only the unlocked chapter shows a beacon
    }
    this.targetBeacon.visible = !!this.active;
  },
});
