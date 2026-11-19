// Harbor PD: interceptor cars that spawn off-screen, hunt the player in proportion
// to the wanted level, flash their light bars, and close in for the bust. At four
// stars and up they stop chasing fair: two interceptors park across the road ahead
// as a roadblock, and the hunters steer for where the player is *going*, not where
// they are — a true intercept course with flanking offsets so the pack surrounds
// instead of queuing up nose-to-tail. At five stars the air unit joins: a
// helicopter that hovers over the chase with its spotlight pinned on the player.
import * as THREE from 'three';
import { POLICE_MODEL, TUNING, CITY } from './config.js';
import { makeRng, randRange, clamp, damp } from './random.js';
import { makeVehicle, stepVehicle, syncVehicleMesh } from './cars.js';
import { collideCircle } from './city.js';

export class PoliceSystem {
  constructor(scene, colliders) {
    this.scene = scene; this.colliders = colliders;
    this.rng = makeRng(41);
    this.cops = [];
    this.spawnCooldown = 0;
    this.roadblockCooldown = 0;
    this.bustMeter = 0;
    this.flash = 0;
    this.heliT = 0;
    // --- the air unit (v3): a PD helicopter that joins at TUNING.heliStars,
    // hovers over the chase and pins its spotlight cone on the player
    const heli = new THREE.Group();
    const livery = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.4, metalness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.5, metalness: 0.4 });
    const bodyM = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.6, 4.8), livery); heli.add(bodyM);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.1, 1.2), dark); nose.position.set(0, -0.15, 2.8); heli.add(nose);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 3.6), livery); tail.position.set(0, 0.25, -3.9); heli.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.7), dark); fin.position.set(0, 0.6, -5.6); heli.add(fin);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.34, 4.84), dark); stripe.position.y = -0.3; heli.add(stripe);
    this.heliRotor = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.06, 0.55), dark);
    this.heliRotor.position.y = 1.05; heli.add(this.heliRotor);
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5, 0.28), dark);
    tailRotor.position.set(0.36, 0.6, -5.6); heli.add(tailRotor); this.heliTailRotor = tailRotor;
    for (const sx of [-0.95, 0.95]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.6), dark);
      skid.position.set(sx, -1.15, 0.2); heli.add(skid);
    }
    // the spotlight: a real SpotLight for the ground pool plus a translucent
    // cone so the beam itself reads from the chase camera
    this.heliTarget = new THREE.Object3D(); scene.add(this.heliTarget);
    this.heliLight = new THREE.SpotLight(0xfff3c0, 1.8, 95, 0.34, 0.55, 0);
    this.heliLight.target = this.heliTarget;
    this.heliLight.position.set(0, -0.9, 0.6); heli.add(this.heliLight);
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 7.6, 25, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
    );
    cone.position.y = -13.4; heli.add(cone);
    this.heliConeMat = cone.material;
    // the anti-collision beacon on the tail fin (v3.1): a red strobe the
    // update() blinks, so the air unit reads as aircraft even at a distance
    this.heliBeaconMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2a2a, emissiveIntensity: 0.2 });
    const beaconBall = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), this.heliBeaconMat);
    beaconBall.position.set(0, 1.25, -5.6); heli.add(beaconBall);
    heli.position.set(0, 25, -280);
    heli.visible = false;
    heli.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    cone.castShadow = false;   // the beam itself must not shadow the street it lights
    scene.add(heli);
    this.heli = heli;
  }
  desiredCops(wanted) { return wanted <= 0 ? 0 : Math.min(1 + wanted, 6); }
  hunters() { return this.cops.filter((c) => !c.roadblock); }
  spawnCop(px, pz) {
    // appear on a road 75–110 m away, never in plain sight of the player
    const ang = this.rng() * Math.PI * 2, dist = randRange(this.rng, 75, 110);
    let x = px + Math.sin(ang) * dist, z = pz + Math.cos(ang) * dist;
    x = clamp(x, -236, 236); z = clamp(z, -204, 188);
    // snap to the nearest road centre line so they arrive driving, not through a block
    const axes = [CITY.avenuesX, CITY.boulevardsZ];
    if (Math.abs(Math.sin(ang)) > 0.5) { const nz = axes[1].reduce((a, b) => Math.abs(b - z) < Math.abs(a - z) ? b : a); z = nz; }
    else { const nx = axes[0].reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a); x = nx; }
    const v = makeVehicle(POLICE_MODEL, 0xf2f4f6, x, z, Math.atan2(px - x, pz - z));
    v.driver = 'police'; v.cruise = POLICE_MODEL.speed;
    this.scene.add(v.group);
    this.cops.push(v);
    return v;
  }
  /** Park TUNING.roadblockMax interceptors across the road the player is heading down. */
  spawnRoadblock(ctx) {
    const pvx = ctx.vx || 0, pvz = ctx.vz || 0;
    const pSpeed = Math.hypot(pvx, pvz);
    const hx = pSpeed > 2 ? pvx / pSpeed : Math.sin(ctx.heading || 0);
    const hz = pSpeed > 2 ? pvz / pSpeed : Math.cos(ctx.heading || 0);
    const alongX = Math.abs(hx) >= Math.abs(hz);
    const gap = 52;   // far enough ahead to arrive, close enough to matter
    for (let i = 0; i < TUNING.roadblockMax; i++) {
      const off = (i - (TUNING.roadblockMax - 1) / 2) * 4.6;   // side by side across the lanes
      let x, z;
      if (alongX) {
        z = CITY.boulevardsZ.reduce((a, b) => Math.abs(b - ctx.pz) < Math.abs(a - ctx.pz) ? b : a);
        x = clamp(ctx.px + hx * gap, -232, 232);
        z += off;
      } else {
        x = CITY.avenuesX.reduce((a, b) => Math.abs(b - ctx.px) < Math.abs(a - ctx.px) ? b : a);
        z = clamp(ctx.pz + hz * gap, -196, 188);
        x += off;
      }
      const v = makeVehicle(POLICE_MODEL, 0xf2f4f6, x, z, Math.atan2(-hx, -hz) + (i % 2 ? 0.35 : -0.35));
      v.driver = 'police'; v.roadblock = true; v.blockAge = 0;
      this.scene.add(v.group);
      this.cops.push(v);
    }
    this.roadblockCooldown = 16;
  }
  update(dt, ctx) {
    // ctx: { px, pz, vx, vz, heading, playerSpeed, wanted, onBusted }
    this.flash += dt * 9;
    const want = this.desiredCops(ctx.wanted);
    this.spawnCooldown -= dt;
    this.roadblockCooldown -= dt;
    if (this.hunters().length < want && this.spawnCooldown <= 0) {
      this.spawnCop(ctx.px, ctx.pz);
      this.spawnCooldown = 1.6;
    }
    // the roadblock: only while the heat is truly on, and only one at a time
    const hasBlock = this.cops.some((c) => c.roadblock);
    if (ctx.wanted >= TUNING.roadblockStars && !hasBlock && this.roadblockCooldown <= 0 && (ctx.vx || ctx.vz)) {
      this.spawnRoadblock(ctx);
    }
    let nearest = Infinity, closeAndSlow = false;
    const keep = [];
    const hunters = this.hunters();
    for (const cop of this.cops) {
      const dx = ctx.px - cop.x, dz = ctx.pz - cop.z;
      const dist = Math.hypot(dx, dz);
      nearest = Math.min(nearest, dist);
      if (cop.roadblock) {
        cop.blockAge += dt;
        // a roadblock gives up when the heat dies, the player is long past, or it has sat too long
        if (ctx.wanted < TUNING.roadblockStars || dist > 95 || cop.blockAge > 30) { this.scene.remove(cop.group); continue; }
        keep.push(cop);
        cop.speed = 0;
        if (cop.lightBar) {
          const on = Math.sin(this.flash + cop.x) > 0;
          cop.lightBar.redMat.emissiveIntensity = on ? 3.4 : 0.15;
          cop.lightBar.blueMat.emissiveIntensity = on ? 0.15 : 3.4;
        }
        syncVehicleMesh(cop, dt);
        if (dist < 7.5 && ctx.playerSpeed < 2.4) closeAndSlow = true;
        continue;
      }
      if (ctx.wanted <= 0 && dist > 130) { this.scene.remove(cop.group); continue; }
      keep.push(cop);
      // INTERCEPT: aim at where the player will be when the cop gets there, not
      // where they are now — with a per-cop flanking offset so the pack spreads
      // around the target instead of forming a conga line behind it.
      const idx = hunters.indexOf(cop);
      const leadTime = clamp(dist / Math.max(14, POLICE_MODEL.speed * 0.8), 0, 1.5);
      let tx = ctx.px + (ctx.vx || 0) * leadTime;
      let tz = ctx.pz + (ctx.vz || 0) * leadTime;
      if (dist > 22) {
        const flank = (idx % 3 - 1) * 6.5;                     // left wing, centre, right wing
        const pvx = ctx.vx || 0, pvz = ctx.vz || 0, ps = Math.hypot(pvx, pvz);
        if (ps > 1) { tx += (-pvz / ps) * flank; tz += (pvx / ps) * flank; }
      }
      const wantHeading = Math.atan2(tx - cop.x, tz - cop.z);
      let dh = wantHeading - cop.heading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
      const steer = clamp(dh * 1.9, -1, 1);
      const aggressive = ctx.wanted >= 3 ? 1 : 0.82;
      let throttle = dist > 4 ? aggressive : 0.15;
      // anti-clump: ease off when a colleague is right on the nose
      for (const o of hunters) {
        if (o === cop) continue;
        const ox = o.x - cop.x, oz = o.z - cop.z;
        const ahead = ox * Math.sin(cop.heading) + oz * Math.cos(cop.heading);
        const side = Math.abs(ox * Math.cos(cop.heading) - oz * Math.sin(cop.heading));
        if (ahead > 0 && ahead < 5.5 && side < 2.4) { throttle = Math.min(throttle, 0.1); break; }
      }
      cop.braking = dist < 3.2 && ctx.playerSpeed < 3;
      stepVehicle(cop, { throttle: cop.speed < POLICE_MODEL.speed * (0.72 + ctx.wanted * 0.05) ? throttle : 0, steer, brake: cop.braking }, dt);
      const [cx, cz] = collideCircle(this.colliders, cop.x, cop.z, 1.3);
      if (cx !== cop.x || cz !== cop.z) cop.speed *= 0.55;
      cop.x = clamp(cx, -250, 250); cop.z = clamp(cz, -210, 232);
      // light bar strobes
      if (cop.lightBar) {
        const on = Math.sin(this.flash + (cop.x % 3)) > 0;
        cop.lightBar.redMat.emissiveIntensity = on ? 3.2 : 0.15;
        cop.lightBar.blueMat.emissiveIntensity = on ? 0.15 : 3.2;
      }
      syncVehicleMesh(cop, dt);
      if (dist < 7.5 && ctx.playerSpeed < 2.4) closeAndSlow = true;
    }
    this.cops = keep;
    // air support: at heliStars the helicopter banks in, hovers a slow circle
    // over the player and keeps the spotlight pinned on them
    this.heliT += dt;
    const airUp = ctx.wanted >= TUNING.heliStars;
    this.heli.visible = airUp;
    if (airUp) {
      const p = this.heli.position;
      const hovX = ctx.px + Math.sin(this.heliT * 0.32) * 13;
      const hovZ = ctx.pz + Math.cos(this.heliT * 0.32) * 13;
      p.x = damp(p.x, hovX, 1.4, dt); p.z = damp(p.z, hovZ, 1.4, dt); p.y = damp(p.y, 25, 1.4, dt);
      this.heli.rotation.y = Math.atan2(ctx.px - p.x, ctx.pz - p.z);
      this.heli.rotation.z = clamp((hovX - p.x) * 0.004, -0.14, 0.14);   // a hint of bank as it corrects
      this.heliRotor.rotation.y += dt * 26;
      this.heliTailRotor.rotation.x += dt * 34;
      this.heliTarget.position.set(ctx.px, 0, ctx.pz);
      // v3.1 air-unit polish: the tail strobe blinks, the beam breathes like a
      // real lamp in humid air, and it burns hotter over a moving car — the
      // crew leans on the light when the chase is fast
      this.heliBeaconMat.emissiveIntensity = Math.sin(this.heliT * 6.2) > 0.55 ? 3.2 : 0.15;
      this.heliConeMat.opacity = 0.1 + Math.sin(this.heliT * 13.7) * 0.018;
      this.heliLight.intensity = ctx.playerSpeed > 8 ? 2.3 : 1.8;
    }
    if (closeAndSlow && ctx.wanted > 0) {
      this.bustMeter += dt;
      if (this.bustMeter >= 2.5) { this.bustMeter = 0; ctx.onBusted(); }
    } else this.bustMeter = Math.max(0, this.bustMeter - dt * 1.4);
    return { nearest, bustProgress: clamp(this.bustMeter / 2.5, 0, 1) };
  }
  clear() {
    for (const cop of this.cops) this.scene.remove(cop.group);
    this.cops = []; this.bustMeter = 0;
    this.heli.visible = false;   // the run is over: air support stands down too
  }
}
