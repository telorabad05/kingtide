// Vehicles: low-poly car meshes built from boxes (eight body styles), an
// arcade physics step with building + car collisions and crash damage, and
// the traffic system that drives the lane graph.
import * as THREE from 'three';
import { CAR_MODELS, CITY, PALETTE, TUNING } from './config.js';
import { clamp, randRange, pick, angleDelta, turnToward } from './random.js';
import { collideCircle } from './city.js';
import { puffTexture } from './textures.js';

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const glassMat = new THREE.MeshStandardMaterial({ color: 0x1d2f42, roughness: 0.25, metalness: 0.55 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.7 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, roughness: 0.3, metalness: 0.8 });
const tyreMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95 });
const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0xffe98a, emissiveIntensity: 1.4 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xcc2222, emissiveIntensity: 0.8 });

function box(parent, mat, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(boxGeo, mat);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m); return m;
}

/** Build a car mesh for a model + paint. opts: { taxi, police }. */
export function buildCarMesh(model, paint, opts = {}) {
  const g = new THREE.Group();
  const paintMat = new THREE.MeshStandardMaterial({ color: paint, roughness: 0.42, metalness: 0.35 });
  const L = model.len, W = model.wid;
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
  const wheelAt = (x, z, front) => {
    const w = new THREE.Mesh(wheelGeo, tyreMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.34, z); w.castShadow = true;
    g.add(w); wheels.push({ mesh: w, front });
  };
  wheelAt(-W / 2, L * 0.31, true); wheelAt(W / 2, L * 0.31, true);
  wheelAt(-W / 2, -L * 0.31, false); wheelAt(W / 2, -L * 0.31, false);

  if (model.kind === 'van') {
    box(g, paintMat, W, 1.55, L * 0.94, 0, 1.18, -L * 0.02);
    box(g, glassMat, W * 0.92, 0.55, 0.1, 0, 1.5, L * 0.44);
    box(g, trimMat, W * 1.02, 0.3, L * 0.2, 0, 0.5, L * 0.42);
  } else if (model.kind === 'buggy') {
    box(g, paintMat, W * 0.9, 0.4, L * 0.8, 0, 0.62, 0);
    box(g, paintMat, W * 0.5, 0.35, L * 0.3, 0, 0.95, -L * 0.18);
    const barMat = trimMat;
    for (const s of [-1, 1]) {   // roll bars
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 5), barMat);
      bar.position.set(s * W * 0.32, 1.15, -L * 0.05); bar.rotation.x = 0.5; g.add(bar);
    }
  } else {
    // shared lower body for the closed cars
    box(g, paintMat, W, 0.62, L, 0, 0.66, 0);
    box(g, paintMat, W * 0.94, 0.3, L * 0.3, 0, 0.95, L * 0.3);   // bonnet slope block
    if (model.kind === 'sports') {
      box(g, glassMat, W * 0.8, 0.42, L * 0.42, 0, 1.12, -L * 0.05);
      box(g, paintMat, W * 0.96, 0.1, L * 0.16, 0, 1.02, -L * 0.44);   // rear wing deck
      box(g, trimMat, W * 0.7, 0.16, 0.08, 0, 1.22, -L * 0.5);          // wing blade
    } else if (model.kind === 'roadster') {
      box(g, paintMat, W * 0.86, 0.34, L * 0.3, 0, 0.98, -L * 0.12);    // cockpit rim
      box(g, trimMat, W * 0.7, 0.22, L * 0.2, 0, 0.9, -L * 0.3);        // folded soft-top
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 6, 12, Math.PI), chromeMat);
      hoop.position.set(0, 1.02, -L * 0.02); g.add(hoop);
      box(g, glassMat, W * 0.84, 0.3, 0.06, 0, 1.05, L * 0.16);         // low windscreen
    } else if (model.kind === 'wagon') {
      box(g, glassMat, W * 0.86, 0.5, L * 0.52, 0, 1.16, -L * 0.1);
      box(g, paintMat, W * 0.9, 0.14, L * 0.56, 0, 1.44, -L * 0.1);
      for (const s of [-1, 1]) box(g, chromeMat, 0.06, 0.05, L * 0.5, s * W * 0.3, 1.53, -L * 0.1); // roof rails
    } else if (model.kind === 'coupe') {
      box(g, glassMat, W * 0.82, 0.44, L * 0.4, 0, 1.13, -L * 0.08);
    } else {   // sedan + taxi cabin
      box(g, glassMat, W * 0.84, 0.48, L * 0.44, 0, 1.15, -L * 0.04);
      box(g, paintMat, W * 0.88, 0.12, L * 0.48, 0, 1.42, -L * 0.04);
    }
  }
  if (opts.taxi || model.kind === 'taxi') {
    box(g, new THREE.MeshStandardMaterial({ color: 0xffcf3f, emissive: 0xcc9a1e, emissiveIntensity: 0.5 }),
      0.7, 0.22, 0.34, 0, 1.6, -L * 0.04);
  }
  if (opts.police) {
    box(g, trimMat, W * 0.7, 0.14, 0.3, 0, 1.52, -L * 0.04);   // light-bar base
  }
  // lights: headlights + tail lights
  box(g, lightMat, 0.32, 0.14, 0.06, -W * 0.3, 0.72, L / 2 + 0.01);
  box(g, lightMat, 0.32, 0.14, 0.06, W * 0.3, 0.72, L / 2 + 0.01);
  box(g, tailMat, 0.32, 0.14, 0.06, -W * 0.3, 0.74, -L / 2 - 0.01);
  box(g, tailMat, 0.32, 0.14, 0.06, W * 0.3, 0.74, -L / 2 - 0.01);
  g.userData.wheels = wheels;
  return g;
}

function surfaceY(x, z, pier) {
  return (x >= pier.minX && x <= pier.maxX && z >= pier.minZ && z <= pier.maxZ) ? 0.55 : 0.1;
}

export class Vehicle {
  constructor(scene, model, paint, opts = {}) {
    this.model = model;
    this.paint = paint;
    this.mesh = buildCarMesh(model, paint, opts);
    this.heading = 0;
    this.speed = 0;
    this.health = 100;
    this.dead = false;
    this.driver = null;          // null | 'player' | 'traffic' | 'police' | 'rival' | 'parked'
    this.events = [];
    this.steerVis = 0;
    this.smoke = null;
    this.flame = null;
    this.wasDead = false;
    scene.add(this.mesh);
  }
  get x() { return this.mesh.position.x; }
  get z() { return this.mesh.position.z; }
  place(x, z, heading, pier) {
    this.heading = heading;
    this.mesh.position.set(x, surfaceY(x, z, pier), z);
    this.mesh.rotation.y = heading;
  }
  damage(n) {
    if (this.dead) return;
    this.health -= n;
    if (this.health <= 0) {
      this.health = 0; this.dead = true;
      this.events.push({ type: 'dead' });
    }
  }
  /** ctrl: {throttle -1..1, steer -1..1, handbrake}. world: {colliders, vehicles, pier}. */
  step(dt, ctrl, world) {
    const m = this.model;
    let top = m.topSpeed, accel = m.accel;
    if (this.health < TUNING.limpEngineHealth && !this.dead) { top *= 0.45; accel *= 0.5; }
    let throttle = this.dead ? 0 : clamp(ctrl.throttle || 0, -1, 1);
    if (this.dead) this.speed -= clamp(this.speed, -14 * dt, 14 * dt);   // roll to a stop
    if (throttle >= 0) this.speed += throttle * accel * dt;
    else if (this.speed > 0.6) this.speed -= 24 * dt;                    // braking
    else this.speed += throttle * accel * 0.6 * dt;                      // reverse
    this.speed -= this.speed * 0.5 * dt;                                 // drag
    if (ctrl.handbrake) this.speed -= this.speed * 2.6 * dt;
    this.speed = clamp(this.speed, -9, top);
    if (Math.abs(this.speed) < 0.04 && throttle === 0) this.speed = 0;

    const steer = clamp(ctrl.steer || 0, -1, 1);
    this.steerVis = steer;
    const turnAuthority = clamp(this.speed / 7, -1, 1) * (ctrl.handbrake ? 1.3 : 1) * (1 - 0.4 * Math.min(1, Math.abs(this.speed) / top));
    this.heading += steer * 2.05 * turnAuthority * dt;

    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let nx = this.x + fx * this.speed * dt;
    let nz = this.z + fz * this.speed * dt;

    // buildings: two circles, nose and tail
    const off = m.len * 0.27, r = m.wid * 0.58;
    const speedBefore = this.speed;
    for (const s of [1, -1]) {
      const px = nx + fx * off * s, pz = nz + fz * off * s;
      const [cx, cz] = collideCircle(world.colliders, px, pz, r);
      nx += cx - px; nz += cz - pz;
    }
    // other vehicles: circle push-out + impact bookkeeping
    for (const other of world.vehicles) {
      if (other === this) continue;
      const dx = nx - other.x, dz = nz - other.z;
      const rr = (m.len + other.model.len) * 0.34;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (rr - d) / d;
        nx += dx * push * 0.6; nz += dz * push * 0.6;
        const closing = Math.abs(speedBefore) + Math.abs(other.speed);
        if (closing > 5) {
          this.damage((closing - 4) * 1.5);
          other.damage((closing - 4) * 1.1);
          this.events.push({ type: 'crash', speed: closing, other });
          this.speed *= 0.45;
        } else this.speed *= 0.8;
      }
    }
    if ((nx !== this.x || nz !== this.z) && Math.abs(speedBefore) > 7) {
      const stopped = Math.hypot(nx - this.x, nz - this.z) < Math.abs(speedBefore) * dt * 0.4;
      if (stopped) { this.damage((Math.abs(speedBefore) - 6) * 1.6); this.events.push({ type: 'crash', speed: Math.abs(speedBefore), other: null }); this.speed *= 0.35; }
    }
    this.mesh.position.set(nx, surfaceY(nx, nz, world.pier), nz);
    this.mesh.rotation.y = this.heading;
    // wheels: spin + front steer
    for (const w of this.mesh.userData.wheels) {
      w.mesh.rotation.x += (this.speed * dt) / 0.34;
      if (w.front) w.mesh.rotation.y = steer * 0.42;
    }
    this.updateFx(dt);
  }
  updateFx(dt) {
    const wantsSmoke = this.health < TUNING.sickEngineHealth;
    if (wantsSmoke && !this.smoke) {
      const N = 16;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      const mat = new THREE.PointsMaterial({ size: 1.7, map: puffTexture(), transparent: true, opacity: 0.42, color: 0x555c66, depthWrite: false });
      this.smoke = new THREE.Points(geo, mat);
      this.smoke.userData.ages = Array.from({ length: N }, (_, i) => i / N);
      this.mesh.add(this.smoke);
      const fmat = new THREE.SpriteMaterial({ map: puffTexture(), color: 0xff7a26, transparent: true, opacity: 0.9, depthWrite: false });
      this.flame = new THREE.Sprite(fmat);
      this.flame.scale.set(1.1, 0.9, 1);
      this.flame.position.set(0, 0.95, this.model.len * 0.42);
      this.mesh.add(this.flame);
    }
    if (this.smoke) {
      const pos = this.smoke.geometry.attributes.position;
      const ages = this.smoke.userData.ages;
      for (let i = 0; i < ages.length; i++) {
        ages[i] += dt * (this.dead ? 0.85 : 0.5);
        if (ages[i] > 1) ages[i] -= 1;
        const a = ages[i];
        pos.setXYZ(i, Math.sin(a * 9 + i) * 0.3, 1 + a * 2.6, this.model.len * 0.42 + a * 0.4);
      }
      pos.needsUpdate = true;
      this.smoke.material.opacity = this.dead ? 0.55 : 0.3;
      if (this.flame) {
        const burn = this.dead || this.health < TUNING.limpEngineHealth;
        this.flame.visible = burn;
        if (burn) { const f = 0.85 + Math.sin(performance.now() * 0.04 + this.x) * 0.3; this.flame.scale.set(1.1 * f, 0.9 * f, 1); }
      }
    }
  }
  dispose(scene) { scene.remove(this.mesh); }
}

// ---------------------------------------------------------------- traffic
const modelBag = [];
for (const m of CAR_MODELS) for (let i = 0; i < m.weight; i++) modelBag.push(m);

export class TrafficSystem {
  constructor(scene, graph, rng) {
    this.scene = scene;
    this.graph = graph;
    this.rng = rng;
    this.vehicles = [];
  }
  spawnOne(allVehicles) {
    const g = this.graph;
    const fromEntry = this.rng() < 0.55;
    let nodeId;
    if (fromEntry) nodeId = g.entries[Math.floor(this.rng() * g.entries.length)];
    else nodeId = Math.floor(this.rng() * g.nodes.length);
    const node = g.nodes[nodeId];
    if (!node.edges.length) return null;
    for (const v of allVehicles) if (Math.hypot(v.x - node.x, v.z - node.z) < 8) return null;
    const targetId = node.edges[Math.floor(this.rng() * node.edges.length)];
    const target = g.nodes[targetId];
    const model = pick(this.rng, modelBag);
    const veh = new Vehicle(this.scene, model, pick(this.rng, PALETTE.carPaints), { taxi: model.kind === 'taxi' });
    veh.driver = 'traffic';
    veh.place(node.x, node.z, Math.atan2(target.x - node.x, target.z - node.z), CITY.pier);
    veh.ai = { target: targetId, from: nodeId, cruise: randRange(this.rng, 8.5, 12.5) };
    this.vehicles.push(veh);
    return veh;
  }
  fill(count, allVehicles) {
    let guard = 0;
    while (this.vehicles.length < count && guard++ < 30) this.spawnOne(allVehicles);
  }
  update(dt, world) {
    const g = this.graph;
    const snapshot = [...this.vehicles];   // snapshot: despawns mutate the list
    for (const veh of snapshot) {
      const target = g.nodes[veh.ai.target];
      const dx = target.x - veh.x, dz = target.z - veh.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.2) {
        if (g.exits.has(veh.ai.target)) { veh.dispose(this.scene); this.vehicles.splice(this.vehicles.indexOf(veh), 1); continue; }
        // choose the onward edge that keeps us heading the same way
        const options = target.edges.filter((e) => e !== veh.ai.from);
        const pool = options.length ? options : target.edges;
        if (!pool.length) { veh.dispose(this.scene); this.vehicles.splice(this.vehicles.indexOf(veh), 1); continue; }
        let best = pool[0], bestScore = -Infinity;
        for (const e of pool) {
          const n = g.nodes[e];
          const score = -Math.abs(angleDelta(veh.heading, Math.atan2(n.x - target.x, n.z - target.z))) + this.rng() * 0.35;
          if (score > bestScore) { bestScore = score; best = e; }
        }
        veh.ai = { target: best, from: veh.ai.target, cruise: veh.ai.cruise };
        continue;
      }
      const want = Math.atan2(dx, dz);
      const steer = clamp(angleDelta(veh.heading, want) * 1.7, -1, 1);
      let throttle = Math.abs(angleDelta(veh.heading, want)) > 0.45 ? 0.3 : 0.8;
      // brake for a vehicle ahead in our lane
      const fx = Math.sin(veh.heading), fz = Math.cos(veh.heading);
      for (const other of world.vehicles) {
        if (other === veh) continue;
        const ox = other.x - veh.x, oz = other.z - veh.z;
        const ahead = ox * fx + oz * fz, side = Math.abs(ox * fz - oz * fx);
        if (ahead > 0 && ahead < 9 && side < 1.7) { throttle = ahead < 5 ? -0.7 : 0.1; break; }
      }
      veh.step(dt, { throttle, steer, handbrake: false }, world);
      veh.speed = Math.min(veh.speed, veh.ai.cruise + 2.5);
    }
  }
}
