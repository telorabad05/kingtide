// Harbor PD: pursuit cars with intercept steering, roadblocks at three
// stars, officers who get out and chase on foot, and the helicopter — now
// with a full lifecycle: it joins sustained four-star chases, can be shot
// down, burns as a wreck, and banks away when the trail goes cold.
// Wanted level itself lives in the game state; this system owns everything
// that chases you.
import * as THREE from 'three';
import { CITY, TUNING, modelById } from './config.js';
import { clamp, randRange, angleDelta, turnToward, dist2d } from './random.js';
import { Vehicle } from './cars.js';
import { makePerson, animatePerson } from './people.js';
import { collideCircle } from './city.js';
import { puffTexture } from './textures.js';

const COP_PAINT = 0xf2f3f5;
const UNIFORM = { shirt: 0x1d3a5f, pants: 0x141c26, hair: 0x10131a };

function surfaceY(x, z) {
  const P = CITY.pier;
  if (x >= P.minX && x <= P.maxX && z >= P.minZ && z <= P.maxZ) return 0.55;
  return 0.22;
}

/** A Harbor PD officer: the ped figure in uniform navy + a peaked cap. */
function makeOfficerMesh(rng) {
  const g = makePerson(rng, { ...UNIFORM, skin: [0xf2c89b, 0xd9a066, 0xa06a35][Math.floor(rng() * 3)] });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x16283f, roughness: 0.7 });
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.09, 0.36), capMat);
  cap.position.set(0, 1.79, 0); g.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.18), capMat);
  brim.position.set(0, 1.75, 0.24); g.add(brim);
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.02), new THREE.MeshStandardMaterial({ color: 0xffc93c, emissive: 0xcc9a1e, emissiveIntensity: 0.7 }));
  badge.position.set(0.14, 1.24, 0.14); g.add(badge);
  return g;
}

export class PoliceSystem {
  constructor(scene, graph, rng) {
    this.scene = scene;
    this.graph = graph;
    this.rng = rng;
    this.cops = [];
    this.blocks = [];          // active roadblocks
    this.blockVehicles = [];   // the parked cars forming them (part of the world vehicle list)
    this.extraColliders = [];  // barrier colliders, rebuilt as blocks come and go
    this.blockCooldown = 0;
    this.heli = null;
    this.time = 0;
    // PLUS state
    this.officers = [];        // every officer currently out of a car (or posted at a block)
    this.officerThreatDist = Infinity;
    this.heliState = null;     // null | 'orbit' | 'leave' | 'crash' | 'wreck'
    this.heliHp = 0;
    this.heliSpawns = 0;
    this.heliCooldown = 0;
    this.chase4T = 0;
    this.searchT = 0;
    this.wreckT = 0;
    this.crashVel = null;
  }
  desiredCops(wanted) {
    const w = Math.floor(wanted);
    return w <= 0 ? 0 : Math.min(1 + w, 6);
  }
  // ------------------------------------------------------------- officers
  newOfficer(car, block, homeX, homeZ) {
    const mesh = makeOfficerMesh(this.rng);
    mesh.visible = false;
    this.scene.add(mesh);
    return {
      mesh, car: car || null, block: block || null,
      x: homeX || 0, z: homeZ || 0, heading: 0, phase: this.rng() * 6,
      homeX: homeX || 0, homeZ: homeZ || 0,
      state: block ? 'post' : 'in', health: 100, downT: 0, fallA: 0,
      sweepX: 0, sweepZ: 0, sweepT: 0,
    };
  }
  releaseOfficer(o, x, z) {
    o.x = x; o.z = z;
    o.state = 'foot';
    o.mesh.visible = true;
    if (!this.officers.includes(o)) this.officers.push(o);
  }
  retireOfficer(o) {
    o.state = 'in';
    o.mesh.visible = false;
    const i = this.officers.indexOf(o);
    if (i >= 0) this.officers.splice(i, 1);
  }
  destroyOfficer(o) {
    this.scene.remove(o.mesh);
    const i = this.officers.indexOf(o);
    if (i >= 0) this.officers.splice(i, 1);
    if (o.car?.crew) { const j = o.car.crew.indexOf(o); if (j >= 0) o.car.crew.splice(j, 1); }
  }
  /** Weapons / shoves / cars call this. Non-gory: down, then back up angry. */
  damageOfficer(o, dmg) {
    if (o.state === 'down') return;
    o.health -= dmg;
    if (o.health <= 0) { o.state = 'down'; o.downT = randRange(this.rng, 7, 10); o.fallA = 0; }
  }
  shoveOfficers(x, z, heading) {
    for (const o of this.officers) {
      if (o.state === 'down') continue;
      const d = dist2d(x, z, o.x, o.z);
      if (d < 2.9 && Math.abs(angleDelta(heading, Math.atan2(o.x - x, o.z - z))) < 0.95) {
        o.state = 'down'; o.downT = 1.6; o.fallA = 0.4; o.health = Math.max(o.health, 55);
        return true;
      }
    }
    return false;
  }
  nearestOfficerDist(player) {
    let best = Infinity;
    for (const o of this.officers) {
      if (o.state !== 'foot') continue;
      best = Math.min(best, dist2d(o.x, o.z, player.x, player.z));
    }
    return best;
  }
  spawnCop(player, allVehicles) {
    // find a graph node 50–90 m from the player: close enough to matter, far enough to arrive
    const g = this.graph;
    let best = null, bestScore = -Infinity;
    for (let tries = 0; tries < 14; tries++) {
      const n = g.nodes[Math.floor(this.rng() * g.nodes.length)];
      const d = dist2d(n.x, n.z, player.x, player.z);
      if (d < 48 || d > 95) continue;
      let clear = true;
      for (const v of allVehicles) if (dist2d(v.x, v.z, n.x, n.z) < 7) { clear = false; break; }
      if (!clear) continue;
      const score = -Math.abs(d - 68);
      if (score > bestScore) { bestScore = score; best = n; }
    }
    if (!best) return null;
    const veh = new Vehicle(this.scene, modelById('coupe'), COP_PAINT, { police: true });
    veh.driver = 'police';
    veh.place(best.x, best.z, Math.atan2(player.x - best.x, player.z - best.z), CITY.pier);
    // light bar: two small emissive boxes that flash in update()
    const barGeo = new THREE.BoxGeometry(0.42, 0.16, 0.3);
    veh.userData = {
      lightL: new THREE.Mesh(barGeo, new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 3 })),
      lightR: new THREE.Mesh(barGeo, new THREE.MeshStandardMaterial({ color: 0x000033, emissive: 0x2266ff, emissiveIntensity: 0.2 })),
      stuck: 0, reverse: 0,
    };
    veh.userData.lightL.position.set(-0.24, 1.62, -0.2);
    veh.userData.lightR.position.set(0.24, 1.62, -0.2);
    veh.mesh.add(veh.userData.lightL, veh.userData.lightR);
    // PLUS: every patrol car carries two officers
    veh.crew = [this.newOfficer(veh, null), this.newOfficer(veh, null)];
    this.cops.push(veh);
    return veh;
  }
  update(dt, ctx) {
    this.time += dt;
    const { player, wanted } = ctx;
    this.heliCooldown = Math.max(0, this.heliCooldown - dt);
    this.chase4T = wanted >= 4 ? this.chase4T + dt : 0;
    this.searchT = ctx.wantedState === 'search' ? this.searchT + dt : 0;
    // --- pursuit fleet size follows the wanted level
    const want = this.desiredCops(wanted);
    while (this.cops.length < want) { if (!this.spawnCop(player, ctx.vehicles)) break; }
    if (wanted <= 0) {
      // give up: cars peel away and despawn once distant
      for (let i = this.cops.length - 1; i >= 0; i--) {
        const cop = this.cops[i];
        if (dist2d(cop.x, cop.z, player.x, player.z) > 85) {
          for (const o of [...(cop.crew || [])]) this.destroyOfficer(o);
          cop.dispose(this.scene); this.cops.splice(i, 1);
        }
      }
    } else if (this.cops.length > want) {
      const extra = this.cops.pop();
      for (const o of [...(extra.crew || [])]) this.destroyOfficer(o);
      extra.dispose(this.scene);
    }
    // --- drive each cop at the player's predicted position (intercept steering)
    for (const cop of this.cops) {
      const u = cop.userData;
      const crewOut = (cop.crew || []).some((o) => o.state === 'foot' || o.state === 'down' || o.state === 'return');
      if (crewOut) {
        // driverless: the car waits with its crew (or lies wrecked)
        cop.step(dt, { throttle: 0, steer: 0, handbrake: true }, ctx.world);
      } else if (ctx.search) {
        // SEARCH: converge on the zone and sweep it, don't beeline the player
        if (!u.sweep || this.time > (u.sweepT || 0)) {
          const a = this.rng() * Math.PI * 2, r = this.rng() * ctx.search.radius * 0.8;
          u.sweep = { x: ctx.search.x + Math.sin(a) * r, z: ctx.search.z + Math.cos(a) * r };
          u.sweepT = this.time + 7;
        }
        const d = dist2d(cop.x, cop.z, u.sweep.x, u.sweep.z);
        const wantHeading = Math.atan2(u.sweep.x - cop.x, u.sweep.z - cop.z);
        const steer = clamp(angleDelta(cop.heading, wantHeading) * 1.9, -1, 1);
        const throttle = d < 5 ? 0.05 : Math.abs(angleDelta(cop.heading, wantHeading)) > 0.9 ? 0.4 : 0.62;
        cop.step(dt, { throttle, steer, handbrake: false }, ctx.world);
      } else {
        const d = dist2d(cop.x, cop.z, player.x, player.z);
        const lead = clamp(d / 34, 0, 0.95);
        const tx = player.x + player.vx * lead, tz = player.z + player.vz * lead;
        const wantHeading = Math.atan2(tx - cop.x, tz - cop.z);
        const steer = clamp(angleDelta(cop.heading, wantHeading) * 1.9, -1, 1);
        let throttle = 1;
        if (Math.abs(angleDelta(cop.heading, wantHeading)) > 0.9) throttle = 0.45;
        if (d < 5 && player.speed < 3) throttle = 0.1;             // sit on a stopped suspect
        if (u.reverse > 0) { u.reverse -= dt; throttle = -1; }
        else if (Math.abs(cop.speed) < 0.6 && wanted > 0 && d > 12) {
          u.stuck += dt;
          if (u.stuck > 2.4) { u.reverse = 0.85; u.stuck = 0; }    // wedged: back out and retry
        } else u.stuck = 0;
        cop.step(dt, { throttle, steer, handbrake: false }, ctx.world);
      }
      // light bar strobes
      const phase = Math.sin(this.time * 11 + cop.x) > 0;
      u.lightL.material.emissiveIntensity = phase ? 3.2 : 0.15;
      u.lightR.material.emissiveIntensity = phase ? 0.15 : 3.2;
      // --- crew deployment: out when stopped near an on-foot suspect, or wrecked
      if (wanted > 0 && cop.crew) {
        const dP = dist2d(cop.x, cop.z, player.x, player.z);
        const shouldExit = cop.dead || (!player.inCar && Math.abs(cop.speed) < 1.5 && dP < 27);
        if (shouldExit) {
          cop.crew.forEach((o, i) => {
            if (o.state === 'in') {
              const side = i === 0 ? -1 : 1;
              this.releaseOfficer(o, cop.x - Math.cos(cop.heading) * side * 1.6, cop.z + Math.sin(cop.heading) * side * 1.6);
            }
          });
        }
      }
    }
    this.updateOfficers(dt, ctx);
    this.updateRoadblocks(dt, ctx);
    this.updateHeli(dt, ctx);
  }
  // ------------------------------------------------- officers on foot
  updateOfficers(dt, ctx) {
    const { player, wanted } = ctx;
    this.officerThreatDist = Infinity;
    for (const o of [...this.officers]) {
      if (o.state === 'down') {
        o.fallA = Math.min(1, o.fallA + dt * 4);
        o.mesh.rotation.x = -Math.PI / 2 * o.fallA * 0.96;
        o.downT -= dt;
        o.mesh.position.set(o.x, surfaceY(o.x, o.z), o.z);
        if (o.downT <= 0) {
          o.health = Math.max(o.health, 50);
          o.mesh.rotation.x = 0;
          o.state = (player.inCar || dist2d(o.x, o.z, player.x, player.z) > 46) && o.car && !o.car.dead ? 'return' : 'foot';
          if (!o.car && o.block) o.state = 'foot';
          if (!o.car && !o.block) o.state = 'foot';
        }
        continue;
      }
      if (o.state === 'post') {
        // roadblock guard: hold the post until the suspect is close + slow/on foot
        o.mesh.position.set(o.homeX, surfaceY(o.homeX, o.homeZ), o.homeZ);
        o.mesh.rotation.y = o.heading;
        o.phase += dt * 1.4;
        animatePerson(o.mesh, o.phase, false);
        const d = dist2d(o.x, o.z, player.x, player.z);
        if (wanted > 0 && d < 30 && (!player.inCar || Math.abs(player.speed) < 3)) { o.state = 'foot'; o.x = o.homeX; o.z = o.homeZ; }
        continue;
      }
      if (o.state === 'topost') {
        const d = dist2d(o.x, o.z, o.homeX, o.homeZ);
        if (d < 1.2) { o.state = 'post'; continue; }
        this.moveOfficer(o, dt, o.homeX, o.homeZ, 3.4, ctx);
        continue;
      }
      if (o.state === 'return') {
        const car = o.car;
        if (!car || car.dead) { o.state = 'foot'; continue; }
        const dx = car.x - Math.cos(car.heading) * 1.6, dz = car.z + Math.sin(car.heading) * 1.6;
        if (dist2d(o.x, o.z, dx, dz) < 2.3) { this.retireOfficer(o); continue; }
        this.moveOfficer(o, dt, dx, dz, 5.8, ctx);
        continue;
      }
      // state 'foot': the pursuit
      const dP = dist2d(o.x, o.z, player.x, player.z);
      if (o.state === 'foot') this.officerThreatDist = Math.min(this.officerThreatDist, dP);
      // knocked down by a moving vehicle (checked against the whole fleet)
      let knocked = false;
      for (const v of ctx.vehicles) {
        if (Math.abs(v.speed) > 5 && dist2d(v.x, v.z, o.x, o.z) < 2) {
          o.health -= 30;
          o.state = 'down'; o.downT = randRange(this.rng, 5, 8); o.fallA = 0;
          if (v.driver === 'player' && ctx.crime) ctx.crime(1);
          knocked = true;
          break;
        }
      }
      if (knocked) continue;
      if (o.block) {
        // roadblock officer: give up the chase when the suspect is long gone
        if (dP > 55) { o.state = 'topost'; continue; }
        this.moveOfficer(o, dt, player.x, player.z, 5.7, ctx);
        continue;
      }
      if (!o.car) { this.moveOfficer(o, dt, player.x, player.z, 5.7, ctx); continue; }
      if (o.car.dead) {
        // stranded crew: chase while the suspect is near, then hold the wreck
        if (dP < 70) this.moveOfficer(o, dt, player.x, player.z, 5.7, ctx);
        continue;
      }
      if (player.inCar && dP > 44) { o.state = 'return'; continue; }
      if (ctx.search) {
        // sweep the search zone on foot
        if (!o.sweepT || this.time > o.sweepT || dist2d(o.x, o.z, o.sweepX, o.sweepZ) < 2) {
          const a = this.rng() * Math.PI * 2, r = this.rng() * ctx.search.radius * 0.85;
          o.sweepX = ctx.search.x + Math.sin(a) * r; o.sweepZ = ctx.search.z + Math.cos(a) * r;
          o.sweepT = this.time + 8;
        }
        this.moveOfficer(o, dt, o.sweepX, o.sweepZ, 2.4, ctx);
        continue;
      }
      this.moveOfficer(o, dt, player.x, player.z, 5.7, ctx);
    }
  }
  moveOfficer(o, dt, tx, tz, speed, ctx) {
    o.heading = turnToward(o.heading, Math.atan2(tx - o.x, tz - o.z), dt * 7);
    let nx = o.x + Math.sin(o.heading) * speed * dt;
    let nz = o.z + Math.cos(o.heading) * speed * dt;
    [nx, nz] = collideCircle(ctx.world.colliders, nx, nz, 0.5);
    o.x = nx; o.z = nz;
    o.phase += dt * (speed > 4 ? 11.5 : 8);
    animatePerson(o.mesh, o.phase, true);
    o.mesh.position.set(o.x, surfaceY(o.x, o.z), o.z);
    o.mesh.rotation.y = o.heading;
  }
  // --- roadblocks at three stars and up ------------------------------------
  updateRoadblocks(dt, ctx) {
    const { player, wanted } = ctx;
    this.blockCooldown -= dt;
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      const d = dist2d(b.x, b.z, player.x, player.z);
      // "passed" = the player has travelled 26 m BEYOND the block along
      // their direction of motion (project the separation onto velocity).
      const along = ((player.x - b.x) * player.vx + (player.z - b.z) * player.vz) / (player.speed || 1);
      const passed = along > 26 && d > 20;
      if (this.time > b.until || d > 120 || passed || wanted < 3) {
        for (const v of b.vehicles) { v.dispose(this.scene); const ix = this.blockVehicles.indexOf(v); if (ix >= 0) this.blockVehicles.splice(ix, 1); }
        for (const o of b.officers) this.destroyOfficer(o);
        for (const m of b.meshes) this.scene.remove(m);
        this.blocks.splice(i, 1);
        this.rebuildBlockColliders();
        this.blockCooldown = Math.max(this.blockCooldown, 9);
      }
    }
    if (wanted >= 3 && this.blockCooldown <= 0 && this.blocks.length === 0 && player.speed > 6) {
      this.spawnRoadblock(ctx);
    }
  }
  rebuildBlockColliders() {
    this.extraColliders = [];
    for (const b of this.blocks) for (const c of b.colliders) this.extraColliders.push(c);
  }
  spawnRoadblock(ctx) {
    const { player } = ctx;
    const ahead = 46;
    const px = player.x + (player.vx / (player.speed || 1)) * ahead;
    const pz = player.z + (player.vz / (player.speed || 1)) * ahead;
    // never on top of the player, never inside a building
    if (dist2d(px, pz, player.x, player.z) < 30) { this.blockCooldown = 4; return; }
    for (const c of ctx.world.colliders) {
      if (px > c.minX - 3 && px < c.maxX + 3 && pz > c.minZ - 3 && pz < c.maxZ + 3) { this.blockCooldown = 4; return; }
    }
    const eastWest = Math.abs(player.vx) > Math.abs(player.vz);
    const cars = [], meshes = [], colliders = [], officers = [];
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xfd7e35, roughness: 0.8 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8 });
    const barrier = (x, z, alongX) => {
      const grp = new THREE.Group();
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 2.4 : 0.5, 0.85, alongX ? 0.5 : 2.4), stripeMat);
      b1.position.y = 0.55; b1.castShadow = true; grp.add(b1);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 2.4 : 0.52, 0.2, alongX ? 0.52 : 2.4), whiteMat);
      b2.position.y = 0.62; grp.add(b2);
      grp.position.set(x, 0.1, z);
      this.scene.add(grp); meshes.push(grp);
      colliders.push({ minX: x - (alongX ? 1.2 : 0.3), maxX: x + (alongX ? 1.2 : 0.3), minZ: z - (alongX ? 0.3 : 1.2), maxZ: z + (alongX ? 0.3 : 1.2) });
    };
    const guardAt = (x, z, heading) => {
      const o = this.newOfficer(null, null, x, z);
      o.block = true; o.state = 'post'; o.heading = heading;
      o.mesh.visible = true;
      o.mesh.position.set(x, surfaceY(x, z), z);
      this.officers.push(o);
      officers.push(o);
      return o;
    };
    if (eastWest) {
      const zc = CITY.boulevardsZ.reduce((a, b) => Math.abs(b - player.z) < Math.abs(a - player.z) ? b : a);
      for (const [off, head] of [[-3.2, Math.PI / 2 + 0.45], [3.2, Math.PI / 2 - 0.45]]) {
        const v = new Vehicle(this.scene, modelById('coupe'), COP_PAINT, { police: true });
        v.driver = 'police'; v.roadblock = true;
        v.place(px + off * 0.4, zc + off, head, CITY.pier);
        cars.push(v); this.blockVehicles.push(v);
      }
      barrier(px - 3, zc - 0.2, true); barrier(px + 3.5, zc + 0.6, true);
      guardAt(px - 4.6, zc - 2.6, Math.PI); guardAt(px + 5, zc + 3, Math.PI);
      this.blocks.push({ vehicles: cars, meshes, colliders, officers, x: px, z: zc, until: this.time + 45 });
    } else {
      const xc = CITY.avenuesX.reduce((a, b) => Math.abs(b - player.x) < Math.abs(a - player.x) ? b : a);
      for (const [off, head] of [[-3.2, 0.45], [3.2, -0.45]]) {
        const v = new Vehicle(this.scene, modelById('coupe'), COP_PAINT, { police: true });
        v.driver = 'police'; v.roadblock = true;
        v.place(xc + off, pz + off * 0.4, head, CITY.pier);
        cars.push(v); this.blockVehicles.push(v);
      }
      barrier(xc - 0.2, pz - 3, false); barrier(xc + 0.6, pz + 3.5, false);
      guardAt(xc - 2.6, pz - 4.6, Math.PI / 2); guardAt(xc + 3, pz + 5, Math.PI / 2);
      this.blocks.push({ vehicles: cars, meshes, colliders, officers, x: xc, z: pz, until: this.time + 45 });
    }
    this.rebuildBlockColliders();
    this.blockCooldown = 16;
  }
  // --- the helicopter: full lifecycle ---------------------------------------
  buildHeli() {
    const g = new THREE.Group();
    const navy = new THREE.MeshStandardMaterial({ color: 0x1d3a5f, roughness: 0.4, metalness: 0.4 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f3f5, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 9), navy);
    body.scale.set(1.05, 0.85, 1.9); body.castShadow = true; g.add(body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 7), white);
    belly.scale.set(0.95, 0.6, 1.5); belly.position.y = -0.45; g.add(belly);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 4.6), navy);
    tail.position.set(0, 0.25, -4.2); g.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.7), navy);
    fin.position.set(0, 0.7, -6.4); g.add(fin);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.06, 0.55), new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.6 }));
    rotor.position.y = 1.45; g.add(rotor);
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5, 0.3), rotor.material);
    tailRotor.position.set(0.25, 0.7, -6.4); g.add(tailRotor);
    for (const s of [-1, 1]) {
      const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 5), white);
      skid.rotation.x = Math.PI / 2; skid.position.set(s * 0.95, -1.05, 0); g.add(skid);
    }
    const strobeMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 0.4 });
    const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), strobeMat);
    strobe.position.set(0, 1.3, -6.4); g.add(strobe);
    this.scene.add(g);
    const light = new THREE.SpotLight(0xfff3cf, 260, 110, 0.34, 0.55, 1.2);
    this.scene.add(light); this.scene.add(light.target);
    const coneGeo = new THREE.ConeGeometry(1, 1, 20, 1, true);
    coneGeo.translate(0, -0.5, 0);   // apex at the origin, opening downward
    const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
      color: 0xffeeb8, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false,
    }));
    this.scene.add(cone);
    return { group: g, rotor, tailRotor, strobeMat, light, cone, state: 'enter', angle: 0, bodyMats: [navy, white] };
  }
  /** Weapons call this. Returns true when the hit kills. */
  damageHeli(dmg) {
    if (this.heliState !== 'orbit' && this.heliState !== 'leave') return false;
    this.heliHp -= dmg;
    if (this.heliHp <= 0) {
      this.heliState = 'crash';
      this.heliCooldown = TUNING.heliRespawnCooldown;
      const h = this.heli;
      this.crashVel = { x: Math.sin(h.group.rotation.y) * 9, z: Math.cos(h.group.rotation.y) * 9, spin: 0 };
      h.light.intensity = 0; h.cone.visible = false;
      return true;
    }
    return false;
  }
  heliTarget() {
    if (!this.heli || (this.heliState !== 'orbit' && this.heliState !== 'leave')) return null;
    const p = this.heli.group.position;
    return { x: p.x, y: p.y, z: p.z };
  }
  updateHeli(dt, ctx) {
    const { player, wanted } = ctx;
    // --- spawn: five stars at once, or a sustained four-star chase
    if (!this.heli && this.heliCooldown <= 0 && (wanted >= 5 || (wanted >= 4 && this.chase4T >= TUNING.heliChase4Time))) {
      this.heli = this.buildHeli();
      this.heliState = 'orbit';
      this.heliHp = TUNING.heliHp;
      this.heliSpawns++;
      this.heli.group.position.set(player.x + 110, 44, player.z + 110);
    }
    if (!this.heli) return;
    const h = this.heli;
    const pos = h.group.position;
    // --- shot down: spiral, impact, burning wreck
    if (this.heliState === 'crash') {
      this.crashVel.spin += dt * 2.2;
      pos.x += this.crashVel.x * dt; pos.z += this.crashVel.z * dt;
      pos.y -= (3 + this.crashVel.spin * 6) * dt;
      h.group.rotation.y += this.crashVel.spin * dt * 2.4;
      h.group.rotation.z = Math.min(1.15, h.group.rotation.z + dt * 1.6);
      h.rotor.rotation.y += dt * 6;
      if (Math.random() < 0.5) this.heliSmokePuff(pos);
      if (pos.y <= 1.1) {
        pos.y = 1.1;
        this.heliState = 'wreck';
        this.wreckT = 40;
        for (const m of h.bodyMats) { m.color.set(0x1a1a1c); m.roughness = 0.95; }
        const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color: 0xff7a26, transparent: true, opacity: 0.9, depthWrite: false }));
        flame.scale.set(3.4, 2.6, 1); flame.position.y = 1;
        h.group.add(flame);
        h.flame = flame;
        if (ctx.onHeliDown) ctx.onHeliDown(pos);
      }
      return;
    }
    if (this.heliState === 'wreck') {
      this.wreckT -= dt;
      if (h.flame) { const f = 0.85 + Math.sin(this.time * 23) * 0.25; h.flame.scale.set(3.4 * f, 2.6 * f, 1); }
      if (Math.random() < 0.3) this.heliSmokePuff(pos);
      h.light.intensity = 0;
      if (this.wreckT <= 0) {
        this.scene.remove(h.group, h.light, h.light.target, h.cone);
        this.heli = null; this.heliState = null;
      }
      return;
    }
    // --- leave when the heat drops or the trail has been cold a while
    if (this.heliState === 'orbit' && (wanted < 4 || (ctx.wantedState === 'search' && this.searchT > 6))) h.state = 'leave', this.heliState = 'leave';
    if (this.heliState === 'leave' && wanted >= 5) this.heliState = 'orbit';
    if (this.heliState === 'leave') {
      pos.x += (pos.x - player.x) * dt * 0.4 + dt * 18;
      pos.z += (pos.z - player.z) * dt * 0.4;
      pos.y += dt * 9;
      h.rotor.rotation.y += dt * 29;
      h.light.intensity = 0; h.cone.visible = false;
      if (Math.hypot(pos.x - player.x, pos.z - player.z) > 190) {
        this.scene.remove(h.group, h.light, h.light.target, h.cone);
        this.heli = null; this.heliState = null;
      }
      return;
    }
    // --- orbit the suspect (damaged birds trail smoke)
    if (this.heliHp < TUNING.heliHp * 0.45 && Math.random() < 0.35) this.heliSmokePuff(pos);
    h.angle += dt * 0.24;
    const ax = player.x + Math.sin(h.angle) * 15;
    const az = player.z + Math.cos(h.angle) * 15;
    const ay = 27 + Math.sin(this.time * 0.8) * 1.4;
    const k = 1 - Math.exp(-1.7 * dt);
    pos.x += (ax - pos.x) * k; pos.y += (ay - pos.y) * k; pos.z += (az - pos.z) * k;
    h.group.rotation.y = Math.atan2(player.x - pos.x, player.z - pos.z);
    h.rotor.rotation.y += dt * 29;
    h.tailRotor.rotation.x += dt * 31;
    h.strobeMat.emissiveIntensity = Math.sin(this.time * 6) > 0.6 ? 3.4 : 0.25;   // tail strobe blink
    // spotlight + visible cone pinned on the player; the beam burns hotter over a fast car
    h.light.position.copy(pos);
    h.light.target.position.set(player.x, 0, player.z);
    const d = Math.max(1, Math.hypot(player.x - pos.x, player.z - pos.z, pos.y));
    const dir = new THREE.Vector3(player.x - pos.x, -pos.y, player.z - pos.z).normalize();
    h.cone.position.copy(pos);
    h.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    const heat = clamp(Math.abs(player.speed) / 36, 0, 1);
    h.cone.scale.set(4.5 + heat * 3.5, d, 4.5 + heat * 3.5);
    h.cone.material.opacity = 0.1 + Math.sin(this.time * 37) * 0.018 + heat * 0.05;   // subtle flicker
    h.light.intensity = 240 + heat * 160;
  }
  heliSmokePuff(pos) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color: 0x2c2f33, transparent: true, opacity: 0.5, depthWrite: false }));
    s.position.copy(pos);
    s.scale.set(2.6, 2.2, 1);
    this.scene.add(s);
    setTimeout(() => this.scene.remove(s), 900);
  }
  heliPos() { return this.heli ? this.heli.group.position : null; }
  nearestCop(player) {
    let best = null, bestD = Infinity;
    for (const cop of this.cops) {
      const d = dist2d(cop.x, cop.z, player.x, player.z);
      if (d < bestD) { bestD = d; best = cop; }
    }
    return { cop: best, dist: bestD };
  }
}
