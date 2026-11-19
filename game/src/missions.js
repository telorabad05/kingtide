// Missions for Madame Lola: "Sunset Sprint", a checkpoint run the length of the
// city; "Hot Package", a pickup at Lola's Depot delivered to the marina with the
// police invited; "Harbor Run GP", a street race against Lola's rival wheelman
// over the same checkpoints the player runs; "Island Drops", a timed
// multi-drop delivery where every drop buys seconds back; and (v3) the "Grand
// Tour", a five-leg sightseeing run that strings the whole map together —
// dockside, the end of Lola's Quay, midtown, the east blocks and home to Ocean
// Drive. Gold beacons mark the starts; the target beacon, the HUD objective
// line and the minimap marker all track the active stage. A stage may carry
// `heat` (stars on arrival) and `timeBonus` (seconds handed back on arrival).
import * as THREE from 'three';
import { clamp } from './random.js';

function beacon(color, r = 2.4) {
  const g = new THREE.Group();
  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, 16, 18, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
  );
  cyl.position.y = 8; g.add(cyl);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(r * 0.7, r, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.32; g.add(ring);
  return g;
}

export const MISSION_DEFS = [
  {
    id: 'sprint', kind: 'checkpoints', name: 'Sunset Sprint', reward: 800, timeLimit: 170,
    blurb: 'Hit every checkpoint before the clock runs out.',
    start: { x: -150, z: 176, label: 'the promenade booth' },
    stages: [
      { x: -120, z: 160, label: 'Checkpoint 1' }, { x: -40, z: 84, label: 'Checkpoint 2' },
      { x: 44, z: 4, label: 'Checkpoint 3' }, { x: 124, z: -76, label: 'Checkpoint 4' },
      { x: 196, z: -156, label: 'Checkpoint 5' }, { x: 116, z: -156, label: 'Final checkpoint' },
    ],
  },
  {
    id: 'package', kind: 'delivery', name: 'Hot Package', reward: 1200, timeLimit: 300,
    blurb: 'Pick up at Lola\'s Depot. Deliver to the marina. Do not get caught holding it.',
    start: { x: 60, z: 176, label: 'the marina steps' },
    stages: [
      { x: 160, z: -84, label: 'Pick up the package at Lola\'s Depot', heat: 0 },
      { x: 60, z: 182, label: 'Deliver to the marina', heat: 2 },
    ],
  },
  {
    id: 'race', kind: 'race', name: 'Harbor Run GP', reward: 1500, timeLimit: 300,
    blurb: 'Beat Rico, Lola\'s rival wheelman, around the harbour loop. Winner takes the purse.',
    start: { x: -196, z: 176, label: 'the west promenade start line' },
    stages: [
      { x: -120, z: 160, label: 'Gate 1 — Ocean Drive' }, { x: 116, z: 160, label: 'Gate 2 — the east shore' },
      { x: 196, z: 84, label: 'Gate 3 — marina bend' }, { x: 196, z: -76, label: 'Gate 4 — dockside' },
      { x: 116, z: -156, label: 'Gate 5 — north row' }, { x: -44, z: -156, label: 'Gate 6 — the old town' },
      { x: -196, z: -84, label: 'Gate 7 — west climb' }, { x: -196, z: 168, label: 'The finish — west promenade' },
    ],
  },
  {
    id: 'drops', kind: 'drops', name: 'Island Drops', reward: 1500, timeLimit: 130,
    blurb: 'One crate, three drops: the Dome, the downtown tower, the end of Lola\'s Quay. Every drop buys time.',
    start: { x: 160, z: -84, label: 'Lola\'s Depot loading bay' },
    stages: [
      { x: 160, z: -84, label: 'Load the crate at Lola\'s Depot', heat: 0 },
      { x: 160, z: -156, label: 'Drop 1 — the Dome north gate', heat: 1, timeBonus: 30 },
      { x: 4, z: -4, label: 'Drop 2 — the downtown tower', heat: 1, timeBonus: 30 },
      { x: 192, z: 290, label: 'Drop 3 — the end of Lola\'s Quay', heat: 2, timeBonus: 0 },
    ],
  },
  {
    id: 'grandtour', kind: 'checkpoints', name: 'Grand Tour', reward: 1100, timeLimit: 280,
    blurb: 'Lola\'s investors want the full tour: dockside, the quay end, midtown, the east blocks — then home.',
    start: { x: 120, z: 176, label: 'the east promenade booth' },
    stages: [
      { x: 196, z: -84, label: 'Leg 1 — dockside' },
      { x: 192, z: 292, label: 'Leg 2 — the end of Lola\'s Quay' },
      { x: 4, z: -44, label: 'Leg 3 — midtown' },
      { x: 124, z: 84, label: 'Leg 4 — the east blocks' },
      { x: 116, z: 164, label: 'Final leg — Ocean Drive' },
    ],
  },
];

export class MissionSystem {
  constructor(scene) {
    this.scene = scene;
    this.active = null;         // { def, stage, timeLeft }
    this.completed = new Set();
    this.onEvent = () => {};
    this.rivalStage = -1;       // race only: main.js reports the rival's progress here
    this.startBeacons = new Map();
    for (const def of MISSION_DEFS) {
      const b = beacon(0xffc93e, 2.6);
      b.position.set(def.start.x, 0, def.start.z);
      scene.add(b);
      this.startBeacons.set(def.id, b);
    }
    this.targetBeacon = beacon(0x2ee6a8, 3);
    this.targetBeacon.visible = false;
    scene.add(this.targetBeacon);
    this.t = 0;
  }
  /** If the player stands at a start beacon, begin that mission. Returns true when started. */
  tryStart(px, pz) {
    if (this.active) return false;
    for (const def of MISSION_DEFS) {
      if (this.completed.has(def.id)) continue;
      if (Math.hypot(px - def.start.x, pz - def.start.z) < 5) {
        this.active = { def, stage: 0, timeLeft: def.timeLimit };
        this.rivalStage = def.kind === 'race' ? 0 : -1;
        this.targetBeacon.visible = true;
        this.moveTargetBeacon();
        this.onEvent('start', { def });
        return true;
      }
    }
    return false;
  }
  /** End the active mission as failed from outside (the rival took the race). */
  forceFail(reason) {
    if (!this.active) return;
    const def = this.active.def;
    this.active = null; this.targetBeacon.visible = false;
    this.onEvent('fail', { def, reason });
  }
  moveTargetBeacon() {
    const s = this.active.def.stages[this.active.stage];
    this.targetBeacon.position.set(s.x, 0, s.z);
  }
  target() {
    if (!this.active) return null;
    const s = this.active.def.stages[this.active.stage];
    return { x: s.x, z: s.z, label: s.label, kind: this.active.def.kind };
  }
  /** Start points of missions still on offer, for the minimap. */
  openStarts() {
    if (this.active) return [];
    return MISSION_DEFS.filter((d) => !this.completed.has(d.id)).map((d) => ({ x: d.start.x, z: d.start.z, kind: d.kind }));
  }
  objective() {
    if (!this.active) return null;
    const { def, stage, timeLeft } = this.active;
    const s = def.stages[stage];
    const clock = `${Math.max(0, Math.ceil(timeLeft))}s left`;
    let sub;
    if (def.kind === 'race') {
      sub = `You: gate ${stage + 1} of ${def.stages.length} • Rico: gate ${Math.min(this.rivalStage + 1, def.stages.length)} of ${def.stages.length} • ${clock}`;
    } else if (def.kind === 'drops') {
      sub = stage === 0 ? `${clock} • $${def.reward} for all three drops` : `Drop ${stage} of ${def.stages.length - 1} • ${clock} • each drop adds time`;
    } else if (def.stages.length > 1) {
      sub = `Stage ${stage + 1} of ${def.stages.length} • ${clock} • $${def.reward} on completion`;
    } else {
      sub = `${clock} • $${def.reward} on delivery`;
    }
    return { title: `${def.name} — ${s.label}`, sub };
  }
  update(dt, px, pz) {
    this.t += dt;
    for (const [id, b] of this.startBeacons) {
      b.visible = !this.active && !this.completed.has(id);
      b.rotation.y += dt * 0.8;
      b.position.y = Math.sin(this.t * 2 + b.position.x) * 0.15;
      // the beacons breathe (v3.1): light column and ground ring swell and
      // fade together, so an unclaimed job glows like it is calling you over
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.6 + b.position.x * 0.7);
      b.children[0].material.opacity = 0.22 + pulse * 0.18;
      b.children[1].material.opacity = 0.55 + pulse * 0.4;
      const bs = 1 + pulse * 0.06; b.scale.set(bs, 1, bs);
    }
    if (!this.active) return;
    this.targetBeacon.rotation.y -= dt * 1.2;
    const tpulse = 1 + (0.5 + 0.5 * Math.sin(this.t * 3.4)) * 0.09;   // the live target throbs faster — hurry
    this.targetBeacon.scale.set(tpulse, 1, tpulse);
    this.active.timeLeft -= dt;
    if (this.active.timeLeft <= 0) {
      const def = this.active.def;
      this.active = null; this.targetBeacon.visible = false;
      this.onEvent('fail', { def });
      return;
    }
    const s = this.active.def.stages[this.active.stage];
    if (Math.hypot(px - s.x, pz - s.z) < 7) {
      const def = this.active.def;
      if (s.heat) this.onEvent('heat', { stars: s.heat, def });
      if (s.timeBonus) {
        this.active.timeLeft += s.timeBonus;
        this.onEvent('bonus', { def, seconds: s.timeBonus });
      }
      this.active.stage += 1;
      if (this.active.stage >= def.stages.length) {
        this.active = null; this.targetBeacon.visible = false;
        this.completed.add(def.id);
        this.onEvent('complete', { def, reward: def.reward });
      } else {
        this.moveTargetBeacon();
        this.onEvent('stage', { def, stage: this.active.stage, left: def.stages.length - this.active.stage });
      }
    }
  }
}
