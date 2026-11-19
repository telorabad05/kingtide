// Harbor PD: pursuit cars with intercept steering, roadblocks at four stars,
// and the five-star helicopter with a live spotlight. Wanted level itself
// lives in the game state; this system owns everything that chases you.
import * as THREE from 'three';
import { CITY, TUNING, modelById } from './config.js';
import { clamp, randRange, angleDelta, dist2d } from './random.js';
import { Vehicle } from './cars.js';

const COP_PAINT = 0xf2f3f5;

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
  }
  desiredCops(wanted) {
    const w = Math.floor(wanted);
    return w <= 0 ? 0 : Math.min(1 + w, 6);
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
    this.cops.push(veh);
    return veh;
  }
  update(dt, ctx) {
    this.time += dt;
    const { player, wanted } = ctx;
    // --- pursuit fleet size follows the wanted level
    const want = this.desiredCops(wanted);
    while (this.cops.length < want) { if (!this.spawnCop(player, ctx.vehicles)) break; }
    if (wanted <= 0) {
      // give up: cars peel away and despawn once distant
      for (let i = this.cops.length - 1; i >= 0; i--) {
        const cop = this.cops[i];
        if (dist2d(cop.x, cop.z, player.x, player.z) > 85) { cop.dispose(this.scene); this.cops.splice(i, 1); }
      }
    } else if (this.cops.length > want) {
      const extra = this.cops.pop();
      extra.dispose(this.scene);
    }
    // --- drive each cop at the player's predicted position (intercept steering)
    for (const cop of this.cops) {
      const u = cop.userData;
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
      // light bar strobes
      const phase = Math.sin(this.time * 11 + cop.x) > 0;
      u.lightL.material.emissiveIntensity = phase ? 3.2 : 0.15;
      u.lightR.material.emissiveIntensity = phase ? 0.15 : 3.2;
    }
    this.updateRoadblocks(dt, ctx);
    this.updateHeli(dt, ctx);
  }
  // --- roadblocks at four stars and up -------------------------------------
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
        for (const m of b.meshes) this.scene.remove(m);
        this.blocks.splice(i, 1);
        this.rebuildBlockColliders();
        this.blockCooldown = Math.max(this.blockCooldown, 9);
      }
    }
    if (wanted >= 4 && this.blockCooldown <= 0 && this.blocks.length === 0 && player.speed > 6) {
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
    const eastWest = Math.abs(player.vx) > Math.abs(player.vz);
    const cars = [], meshes = [], colliders = [];
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
    if (eastWest) {
      const zc = CITY.boulevardsZ.reduce((a, b) => Math.abs(b - player.z) < Math.abs(a - player.z) ? b : a);
      for (const [off, head] of [[-3.2, Math.PI / 2 + 0.45], [3.2, Math.PI / 2 - 0.45]]) {
        const v = new Vehicle(this.scene, modelById('coupe'), COP_PAINT, { police: true });
        v.driver = 'police'; v.roadblock = true;
        v.place(px + off * 0.4, zc + off, head, CITY.pier);
        cars.push(v); this.blockVehicles.push(v);
      }
      barrier(px - 3, zc - 0.2, true); barrier(px + 3.5, zc + 0.6, true);
      this.blocks.push({ vehicles: cars, meshes, colliders, x: px, z: zc, until: this.time + 45 });
    } else {
      const xc = CITY.avenuesX.reduce((a, b) => Math.abs(b - player.x) < Math.abs(a - player.x) ? b : a);
      for (const [off, head] of [[-3.2, 0.45], [3.2, -0.45]]) {
        const v = new Vehicle(this.scene, modelById('coupe'), COP_PAINT, { police: true });
        v.driver = 'police'; v.roadblock = true;
        v.place(xc + off, pz + off * 0.4, head, CITY.pier);
        cars.push(v); this.blockVehicles.push(v);
      }
      barrier(xc - 0.2, pz - 3, false); barrier(xc + 0.6, pz + 3.5, false);
      this.blocks.push({ vehicles: cars, meshes, colliders, x: xc, z: pz, until: this.time + 45 });
    }
    this.rebuildBlockColliders();
    this.blockCooldown = 16;
  }
  // --- the five-star helicopter ---------------------------------------------
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
    return { group: g, rotor, tailRotor, strobeMat, light, cone, state: 'enter', angle: 0 };
  }
  updateHeli(dt, ctx) {
    const { player, wanted } = ctx;
    if (wanted >= 5 && !this.heli) {
      this.heli = this.buildHeli();
      this.heli.group.position.set(player.x + 110, 44, player.z + 110);
    }
    if (!this.heli) return;
    const h = this.heli;
    if (wanted < 5) h.state = 'leave';
    const pos = h.group.position;
    if (h.state === 'leave') {
      pos.x += (pos.x - player.x) * dt * 0.4 + dt * 18;
      pos.z += (pos.z - player.z) * dt * 0.4;
      pos.y += dt * 9;
      if (Math.hypot(pos.x - player.x, pos.z - player.z) > 190) {
        this.scene.remove(h.group, h.light, h.light.target, h.cone);
        this.heli = null;
      }
      return;
    }
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
