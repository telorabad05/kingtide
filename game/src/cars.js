// Cars: a procedural low-poly car factory (coupe, sedan, wagon, convertible,
// pickup, roadster, van, police interceptor), one shared arcade physics step used by the player,
// the traffic and the police, and the traffic system that follows the lane graph.
import * as THREE from 'three';
import { CAR_MODELS, CAR_WEIGHTS, POLICE_MODEL, PALETTE } from './config.js';
import { makeRng, randRange, pick, clamp, angleLerp, weightedPick } from './random.js';
import { collideCircle } from './city.js';
import { smokeTexture } from './textures.js';

const glassMat = new THREE.MeshStandardMaterial({ color: 0x1c2b3a, roughness: 0.15, metalness: 0.6 });
const tyreMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.35, metalness: 0.7 });

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}

/** Build a car mesh for a model. Returns the group plus the parts other systems animate. */
export function createCarMesh(model, paintHex) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: paintHex, roughness: 0.35, metalness: 0.5 });
  const isPolice = model.kind === 'police';
  const L = model.kind === 'pickup' ? 4.9 : model.kind === 'wagon' ? 4.7 : model.kind === 'van' ? 5.0 : model.kind === 'sports' ? 4.5 : model.kind === 'roadster' ? 4.2 : 4.4;   // length (z)
  const W = model.kind === 'sports' ? 2.0 : 1.9, bodyY = model.kind === 'sports' ? 0.52 : model.kind === 'roadster' ? 0.5 : model.kind === 'van' ? 0.78 : 0.62;
  const bodyH = model.kind === 'van' ? 1.05 : 0.55;
  const body = box(W, bodyH, L, paint, 0, bodyY, 0); g.add(body);
  const hood = box(W * 0.92, 0.16, L * 0.24, paint, 0, bodyY + (model.kind === 'van' ? 0.42 : 0.3), L * 0.36); g.add(hood);
  let cabin;
  if (model.kind === 'sports') {
    // low glass canopy, a deep front splitter and a wing on two struts
    cabin = box(W * 0.8, 0.42, L * 0.4, glassMat, 0, bodyY + 0.42, -L * 0.04); g.add(cabin);
    g.add(box(W * 0.84, 0.06, L * 0.36, paint, 0, bodyY + 0.65, -L * 0.04));                 // canopy roof sliver
    g.add(box(W * 1.02, 0.1, 0.3, paint, 0, 0.3, L * 0.48));                                 // splitter
    const strut = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.5, metalness: 0.5 });
    g.add(box(0.09, 0.34, 0.09, strut, -W * 0.3, bodyY + 0.42, -L * 0.44));
    g.add(box(0.09, 0.34, 0.09, strut, W * 0.3, bodyY + 0.42, -L * 0.44));
    g.add(box(W * 0.94, 0.07, 0.42, strut, 0, bodyY + 0.62, -L * 0.44));                      // the wing
    g.add(box(W * 0.5, 0.2, 0.06, glassMat, 0, bodyY + 0.18, -L * 0.3));                      // engine cover vent
  } else if (model.kind === 'van') {
    // a tall slab-sided box: glass cab at the nose, a cargo stripe down the flank
    cabin = box(W * 0.94, 0.5, L * 0.2, glassMat, 0, bodyY + 0.42, L * 0.36); g.add(cabin);
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x14707e, roughness: 0.5, metalness: 0.3 });
    g.add(box(W + 0.03, 0.3, L * 0.62, stripeMat, 0, bodyY + 0.18, -L * 0.14));
    g.add(box(W * 0.7, 0.5, 0.05, glassMat, 0, bodyY + 0.3, -L / 2 - 0.01));                  // rear doors' windows
  } else if (model.kind === 'convertible') {
    const interior = new THREE.MeshStandardMaterial({ color: 0x6e3b2a, roughness: 0.85 });
    cabin = box(W * 0.86, 0.3, L * 0.34, interior, 0, bodyY + 0.4, -L * 0.05); g.add(cabin);
    g.add(box(W * 0.88, 0.34, 0.08, glassMat, 0, bodyY + 0.52, L * 0.12));   // windscreen
    g.add(box(W * 0.8, 0.16, L * 0.2, interior, 0, bodyY + 0.36, -L * 0.36)); // the folded soft top, stacked behind the seats
  } else if (model.kind === 'roadster') {
    // the Coral Roadster (v3.1): no roof at all — a low open cockpit, a chrome
    // roll hoop behind the seats and twin headrest fairings streaming back
    const interior = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.85 });
    cabin = box(W * 0.84, 0.26, L * 0.3, interior, 0, bodyY + 0.36, -L * 0.02); g.add(cabin);
    g.add(box(W * 0.86, 0.3, 0.07, glassMat, 0, bodyY + 0.5, L * 0.13));     // windscreen
    g.add(box(W * 0.7, 0.09, 0.09, chromeMat, 0, bodyY + 0.68, -L * 0.16));  // roll hoop top bar
    g.add(box(0.09, 0.3, 0.09, chromeMat, -W * 0.33, bodyY + 0.52, -L * 0.16));
    g.add(box(0.09, 0.3, 0.09, chromeMat, W * 0.33, bodyY + 0.52, -L * 0.16));
    g.add(box(0.34, 0.2, L * 0.24, paint, -W * 0.22, bodyY + 0.42, -L * 0.3));  // headrest fairings
    g.add(box(0.34, 0.2, L * 0.24, paint, W * 0.22, bodyY + 0.42, -L * 0.3));
  } else if (model.kind === 'pickup') {
    cabin = box(W * 0.9, 0.6, L * 0.3, paint, 0, bodyY + 0.55, L * 0.22); g.add(cabin);
    g.add(box(W * 0.92, 0.3, L * 0.26, glassMat, 0, bodyY + 0.62, L * 0.22)); // glass band
    g.add(box(W * 0.94, 0.3, L * 0.34, paint, 0, bodyY + 0.28, -L * 0.3));   // bed walls hint
  } else {
    const cabLen = model.kind === 'wagon' ? L * 0.52 : L * 0.42;
    cabin = box(W * 0.88, 0.55, cabLen, glassMat, 0, bodyY + 0.52, model.kind === 'wagon' ? -L * 0.08 : 0); g.add(cabin);
    g.add(box(W * 0.9, 0.07, cabLen * 0.94, paint, 0, bodyY + 0.83, model.kind === 'wagon' ? -L * 0.08 : 0)); // roof
    if (model.kind === 'wagon') {   // chrome roof rails: the family hauler carries its boards up top (v3.1)
      g.add(box(0.07, 0.07, cabLen * 0.8, chromeMat, -W * 0.32, bodyY + 0.92, -L * 0.08));
      g.add(box(0.07, 0.07, cabLen * 0.8, chromeMat, W * 0.32, bodyY + 0.92, -L * 0.08));
    }
  }
  if (isPolice) {
    const black = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.4, metalness: 0.4 });
    g.add(box(W + 0.02, 0.3, L * 0.3, black, 0, bodyY + 0.05, L * 0.33));
    g.add(box(W + 0.02, 0.3, L * 0.22, black, 0, bodyY + 0.05, -L * 0.38));
  }
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xff2211, emissiveIntensity: 0.5 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6cc, emissive: 0xffeeb0, emissiveIntensity: 1.4 });
  g.add(box(0.34, 0.12, 0.06, headMat, -W * 0.32, bodyY + 0.08, L / 2 + 0.01));
  g.add(box(0.34, 0.12, 0.06, headMat, W * 0.32, bodyY + 0.08, L / 2 + 0.01));
  g.add(box(0.34, 0.12, 0.06, brakeMat, -W * 0.32, bodyY + 0.08, -L / 2 - 0.01));
  g.add(box(0.34, 0.12, 0.06, brakeMat, W * 0.32, bodyY + 0.08, -L / 2 - 0.01));
  g.add(box(W * 0.96, 0.18, 0.1, chromeMat, 0, 0.32, L / 2));
  g.add(box(W * 0.96, 0.18, 0.1, chromeMat, 0, 0.32, -L / 2));
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.26, 10);
  const wheels = {};
  const wpos = { fl: [-W / 2, L * 0.32], fr: [W / 2, L * 0.32], rl: [-W / 2, -L * 0.32], rr: [W / 2, -L * 0.32] };
  for (const [k, [wx, wz]] of Object.entries(wpos)) {
    const w = new THREE.Mesh(wheelGeo, tyreMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.35, wz); w.castShadow = true;
    const pivot = new THREE.Group(); pivot.position.set(wx, 0.35, wz); w.position.set(0, 0, 0);
    pivot.add(w); g.add(pivot); wheels[k] = pivot;
  }
  let lightBar = null;
  if (isPolice) {
    const barBase = box(1.1, 0.09, 0.34, chromeMat, 0, bodyY + 0.92, 0); g.add(barBase);
    const redMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 0.4 });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x000033, emissive: 0x2266ff, emissiveIntensity: 0.4 });
    g.add(box(0.5, 0.16, 0.3, redMat, -0.28, bodyY + 1.02, 0));
    g.add(box(0.5, 0.16, 0.3, blueMat, 0.28, bodyY + 1.02, 0));
    lightBar = { redMat, blueMat };
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, wheels, brakeMat, lightBar };
}

/** A vehicle record: everything the physics and controllers need, mesh included. */
export function makeVehicle(model, paintHex, x, z, heading) {
  const parts = createCarMesh(model, paintHex);
  parts.group.position.set(x, 0, z);
  parts.group.rotation.y = heading;
  return {
    ...parts, model, paintHex, x, z, heading, speed: 0, steerVis: 0, health: 100,
    r: 1.7, driver: null, cruise: 11, node: -1, from: -1, dead: false, honk: 0,
  };
}

/** Advance one vehicle with arcade physics. input: {throttle -1..1, steer -1..1, brake bool}. */
export function stepVehicle(v, input, dt) {
  const m = v.model;
  if (v.dead) input = { ...input, throttle: 0, brake: true };   // a wrecked engine gives nothing, however hard the key is held
  const accel = input.throttle * m.accel;
  v.speed += accel * dt;
  v.speed -= v.speed * 0.55 * dt;                                   // drag
  if (input.brake) v.speed -= v.speed * 2.6 * dt;
  if (input.throttle === 0) v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 2.2 * dt);
  v.speed = clamp(v.speed, -11, m.speed);
  const steerTarget = input.steer * 0.55 / (1 + Math.abs(v.speed) * 0.045);
  v.steerVis += (steerTarget - v.steerVis) * Math.min(1, dt * 8);
  if (Math.abs(v.speed) > 0.05) {
    // grip is real now: a Velocity RS carves, a Cargo Mule wallows (factor 0.87–1.3)
    v.heading += (v.speed / 2.7) * Math.tan(v.steerVis) * dt * (input.handbrake ? 1.5 : 1) * (m.grip / 3.0);
  }
  v.x += Math.sin(v.heading) * v.speed * dt;
  v.z += Math.cos(v.heading) * v.speed * dt;
  syncVehicleMesh(v, dt);
}

export function syncVehicleMesh(v, dt = 0) {
  v.group.position.set(v.x, 0, v.z);
  v.group.rotation.y = v.heading;
  const spin = v.speed * dt / 0.35;
  for (const k of ['fl', 'fr', 'rl', 'rr']) {
    v.wheels[k].children[0].rotation.x += spin;
    if (k === 'fl' || k === 'fr') v.wheels[k].rotation.y = v.steerVis * 0.9;
  }
  v.brakeMat.emissiveIntensity = v.braking ? 2.2 : 0.5;
}

/** Traffic: a fleet of vehicles following the lane graph, braking for each other. */
export class TrafficSystem {
  constructor(scene, graph, colliders, seed = 5, count = 15) {
    this.scene = scene; this.graph = graph; this.colliders = colliders;
    this.rng = makeRng(seed);
    this.cars = [];
    for (let i = 0; i < count; i++) this.spawn(true);
  }
  spawn(anywhere = false) {
    const g = this.graph, rng = this.rng;
    let startNode = anywhere ? Math.floor(rng() * g.nodes.length) : pick(rng, g.entries);
    for (let tries = 0; tries < 10 && (!g.nodes[startNode] || !g.nodes[startNode].edges.length); tries++) {
      startNode = anywhere ? Math.floor(rng() * g.nodes.length) : pick(rng, g.entries);
    }
    const node = g.nodes[startNode];
    if (!node || !node.edges.length) return null;
    const next = pick(rng, node.edges);
    const model = weightedPick(rng, CAR_MODELS, CAR_WEIGHTS);
    const v = makeVehicle(model, pick(rng, PALETTE.carPaints), node.x, node.z, 0);
    v.driver = 'traffic'; v.from = startNode; v.node = next;
    v.heading = Math.atan2(g.nodes[next].x - node.x, g.nodes[next].z - node.z);
    v.cruise = randRange(rng, 8.5, 12.5);
    this.scene.add(v.group);
    this.cars.push(v);
    return v;
  }
  removeCar(v) {
    this.cars = this.cars.filter((c) => c !== v);
  }
  /** Choose the next node at an intersection: mostly carry straight on. */
  chooseNext(v) {
    const g = this.graph, node = g.nodes[v.node];
    if (this.graph.exits.has(v.node) || !node.edges.length) return -1;
    const back = Math.atan2(g.nodes[v.from].x - node.x, g.nodes[v.from].z - node.z);
    let best = null, bestScore = -Infinity;
    for (const e of node.edges) {
      const t = g.nodes[e];
      const dir = Math.atan2(t.x - node.x, t.z - node.z);
      let d = Math.abs(dir - v.heading) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d;
      let db = Math.abs(dir - back) % (Math.PI * 2); if (db > Math.PI) db = Math.PI * 2 - db;
      const score = -d + this.rng() * 0.7 + (db < 0.6 ? -2.5 : 0);   // never U-turn back where it came from
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  }
  update(dt, focus) {
    const g = this.graph;
    // iterate a snapshot: a car that reaches a city exit is removed and a
    // fresh one spawned mid-pass, and mutating this.cars under the loop used
    // to skip or double-step neighbours (v3 cleanup)
    for (const v of [...this.cars]) {
      if (!this.cars.includes(v)) continue;   // recycled earlier in this same pass
      const target = g.nodes[v.node];
      if (!target) { v.node = pick(this.rng, g.entries); continue; }
      const dx = target.x - v.x, dz = target.z - v.z;
      const distT = Math.hypot(dx, dz);
      if (distT < 7) {
        const next = this.chooseNext(v);
        if (next === -1) { // reached a city exit: recycle to an entry far from the action
          this.scene.remove(v.group);
          this.removeCar(v);
          const nv = this.spawn(false);
          if (nv && focus && Math.hypot(nv.x - focus.x, nv.z - focus.z) < 50) { /* entries are at the edge; fine */ }
          continue;
        }
        v.from = v.node; v.node = next;
        continue;
      }
      // lookahead point on the way to the target node
      const la = clamp(6 + v.speed * 0.7, 6, 16);
      const lx = v.x + (dx / distT) * la, lz = v.z + (dz / distT) * la;
      const want = Math.atan2(lx - v.x, lz - v.z);
      let dh = want - v.heading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
      const steer = clamp(dh * 1.6, -1, 1);
      // brake for a car ahead, or for a sharp turn coming up
      let throttle = 0.55, braking = false;
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      for (const o of this.cars) {
        if (o === v) continue;
        const ox = o.x - v.x, oz = o.z - v.z, ahead = ox * fx + oz * fz, side = Math.abs(ox * fz - oz * fx);
        if (ahead > 0 && ahead < 11 && side < 2.2) {
          throttle = ahead < 6 ? -0.4 : 0.05; braking = ahead < 8;
          // stuck nose-to-tail with nowhere to go: lean on the horn (main.js makes it audible)
          if (ahead < 6 && Math.abs(v.speed) < 1.5 && v.honk <= 0) { v.honkPulse = true; v.honk = randRange(this.rng, 3.5, 8); }
          break;
        }
      }
      v.honk = Math.max(0, v.honk - dt);
      if (focus) {
        // the player, in a car or on foot (player.x/z always tracks the action): brake for them too
        const ox = focus.x - v.x, oz = focus.z - v.z, ahead = ox * fx + oz * fz, side = Math.abs(ox * fz - oz * fx);
        if (ahead > 0 && ahead < 10 && side < 2.4) { throttle = Math.min(throttle, 0); braking = true; }
      }
      if (Math.abs(dh) > 0.5) throttle = Math.min(throttle, 0.3);
      v.braking = braking;
      const before = v.speed;
      stepVehicle(v, { throttle: v.speed < v.cruise ? throttle : 0, steer, brake: braking }, dt);
      if (v.speed > v.cruise) v.speed = v.cruise;
      if (before === v.speed && throttle < 0) v.speed = Math.max(0, v.speed - 4 * dt);
      const [cx, cz] = collideCircle(this.colliders, v.x, v.z, 1.25);
      v.x = cx; v.z = cz;
      syncVehicleMesh(v, dt);
    }
  }
}

/** The wreck effect (v3): a rising plume of smoke sprites and, once the engine
 *  is dead, a flickering flame cone at the hood. One instance serves the
 *  player's car — main.js parks the group at the hood and sets the level:
 *  0 = off, ~0.45 = a sick engine smoking, 1 = dead and burning. */
export function makeWreckFx() {
  const group = new THREE.Group();
  group.visible = false;
  const tex = smokeTexture();
  const puffs = [];
  for (let i = 0; i < 12; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, color: 0x4a4a55, transparent: true, opacity: 0, depthWrite: false });
    const s = new THREE.Sprite(mat);
    s.userData.seed = i / 12;
    group.add(s); puffs.push(s);
  }
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a26, transparent: true, opacity: 0.9 });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.25, 8), flameMat);
  flame.position.y = 0.55; flame.visible = false; group.add(flame);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.95 });
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.8, 8), coreMat);
  core.position.y = 0.4; core.visible = false; group.add(core);
  let t = 0;
  return {
    group,
    update(dt, level) {
      t += dt;
      group.visible = level > 0;
      flame.visible = core.visible = level >= 1;
      if (!group.visible) return;
      for (const s of puffs) {
        const age = (t * 0.45 + s.userData.seed) % 1;          // each puff loops its own rise
        const wob = Math.sin(s.userData.seed * 40 + t * 1.7) * 0.22;
        // the sea breeze leans the plume over as it climbs (v3.1): a wreck by
        // the marina smokes sideways, not straight up like a chimney
        s.position.set(wob + age * age * 1.5, 0.4 + age * 3.1, Math.cos(s.userData.seed * 31 + t * 1.3) * 0.22);
        const sc = 0.7 + age * 2.1;
        s.scale.set(sc, sc, 1);
        s.material.opacity = Math.sin(age * Math.PI) * 0.5 * level;
        // fresh smoke glows ember-orange while the engine burns, cooling to
        // grey as the puff ages; a merely sick engine just smokes dark
        const heat = level >= 1 ? Math.max(0, 1 - age * 2.2) : 0;
        const grey = 0.32 - age * 0.1;
        s.material.color.setRGB(grey + heat * 0.55, grey * (1 - heat * 0.45), grey * (1 - heat * 0.8));
      }
      if (flame.visible) {   // the flame breathes and stutters like a real engine fire
        const f = 0.82 + Math.sin(t * 31) * 0.16 + Math.sin(t * 47 + 1.3) * 0.1;
        flame.scale.set(f, 0.9 + Math.sin(t * 39) * 0.28, f);
        core.scale.set(f, 0.85 + Math.cos(t * 43) * 0.25, f);
      }
    },
  };
}
