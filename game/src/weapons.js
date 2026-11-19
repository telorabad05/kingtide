// Weapons — KINGTIDE's gun system. Five original firearms, found or bought,
// never handed over: a pistol, the Wasp SMG, a pump shotgun, an assault
// rifle and an RPG. Hitscan for the bullet guns (tracers, muzzle flash,
// impact sparks), a real travelling projectile for the RPG with an area
// explosion. All consequences flow back through the hooks main.js supplies:
// peds drop and scatter, cars take real damage, Harbor PD notices gunfire.
import * as THREE from 'three';
import { clamp, dist2d } from './random.js';
import { puffTexture } from './textures.js';

export const WEAPON_DEFS = [
  { id: 'pistol', name: 'Pistol', cls: 'SIDEARM', price: 450, dmg: 34, interval: 0.32, mag: 12, startReserve: 48, spread: 0.014, pellets: 1, auto: false, reloadTime: 1.1, range: 130, ammoPrice: 60, ammoPack: 24 },
  { id: 'smg', name: 'Wasp SMG', cls: 'SMG', price: 1500, dmg: 16, interval: 0.075, mag: 30, startReserve: 120, spread: 0.034, pellets: 1, auto: true, reloadTime: 1.5, range: 110, ammoPrice: 120, ammoPack: 60 },
  { id: 'shotgun', name: 'Shotgun', cls: 'SHOTGUN', price: 2000, dmg: 13, interval: 0.9, mag: 6, startReserve: 30, spread: 0.062, pellets: 8, auto: false, reloadTime: 2.1, range: 55, ammoPrice: 90, ammoPack: 12 },
  { id: 'rifle', name: 'Assault Rifle', cls: 'RIFLE', price: 3200, dmg: 30, interval: 0.115, mag: 30, startReserve: 120, spread: 0.018, pellets: 1, auto: true, reloadTime: 1.7, range: 150, ammoPrice: 150, ammoPack: 60 },
  { id: 'rpg', name: 'RPG', cls: 'HEAVY', price: 6500, dmg: 130, interval: 1.5, mag: 1, startReserve: 5, spread: 0.004, pellets: 1, auto: false, reloadTime: 2.2, range: 220, ammoPrice: 400, ammoPack: 2, projectile: true, blast: 7.5, projSpeed: 46 },
];
export const WEAPON_ORDER = WEAPON_DEFS.map((w) => w.id);
export const defById = (id) => WEAPON_DEFS.find((w) => w.id === id);

// The three hidden world pickups — secrets, no minimap icon.
export const PICKUP_SPOTS = [
  { id: 'shotgun', x: 196, z: 296 },   // the pier boards, near the end
  { id: 'smg', x: 160, z: -154 },      // behind the Dome, by the service wall
  { id: 'rpg', x: 184, z: 309 },       // at the lighthouse foot
];

const flashMat = () => new THREE.SpriteMaterial({ map: puffTexture(), color: 0xffc46b, transparent: true, opacity: 0.95, depthWrite: false });
const fireMat = () => new THREE.SpriteMaterial({ map: puffTexture(), color: 0xff7a26, transparent: true, opacity: 0.95, depthWrite: false });

export class WeaponSystem {
  /** hooks: { audio, banner(t,s), crime(n, kind), hurtPlayer(n), shake(n),
   *           provider() -> { player:{x,z}, aimHeading, aimPitch, onFoot,
   *           vehicles, peds, officers, thugs, heli, colliders,
   *           hurtPed, hurtOfficer, hurtThug, damageHeli } } */
  constructor(scene, hooks) {
    this.scene = scene;
    this.h = hooks;
    this.state = {};
    for (const d of WEAPON_DEFS) this.state[d.id] = { owned: false, mag: 0, reserve: 0 };
    this.current = null;          // weapon id or null (unarmed)
    this.fireT = 0;               // cooldown to next shot
    this.reloading = 0;           // seconds left on the reload
    this.triggerHeld = false;
    this.projectiles = [];
    this.fx = [];                 // { mesh, t, life, grow }
    this.time = 0;
    // --- pickup meshes
    this.pickups = [];
    for (const spot of PICKUP_SPOTS) this.pickups.push(this.makePickup(spot, false));
    this.tempPickups = [];
    // a shared tracer pool: thin additive boxes stretched muzzle → impact
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracerGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
  }
  makePickup(spot, temp) {
    const grp = new THREE.Group();
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), new THREE.MeshStandardMaterial({ color: 0x2fe8c8, emissive: 0x2fe8c8, emissiveIntensity: 1.6, roughness: 0.3 }));
    core.position.y = 1.05; grp.add(core);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.05, 24), new THREE.MeshBasicMaterial({ color: 0x2fe8c8, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; grp.add(ring);
    grp.position.set(spot.x, spot.y || 0.22, spot.z);
    this.scene.add(grp);
    return { id: spot.id, x: spot.x, z: spot.z, mesh: grp, core, taken: false, temp: !!temp };
  }
  /** A one-off pickup placed by a mission (not persisted). */
  spawnTempPickup(id, x, z) {
    const p = this.makePickup({ id, x, z }, true);
    this.tempPickups.push(p);
    return p;
  }
  clearTempPickups() {
    for (const p of this.tempPickups) this.scene.remove(p.mesh);
    this.tempPickups = [];
  }
  // ------------------------------------------------------------ inventory
  grant(id, quiet = false) {
    const d = defById(id), s = this.state[id];
    const wasOwned = s.owned;
    s.owned = true;
    if (!wasOwned) { s.mag = d.mag; s.reserve = d.startReserve; }
    else s.reserve += d.startReserve;
    if (!quiet) this.h.banner(`${d.name.toUpperCase()} ditemukan!`, wasOwned ? `+${d.startReserve} peluru cadangan.` : 'Tekan Q atau 1–5 untuk memakainya.');
    return !wasOwned;
  }
  addAmmo(id) {
    const d = defById(id), s = this.state[id];
    if (!s.owned) return false;
    s.reserve += d.ammoPack;
    return true;
  }
  equip(id) {
    if (id !== null && !this.state[id]?.owned) return false;
    this.current = id;
    this.reloading = 0;
    return true;
  }
  cycle(dir) {
    const owned = WEAPON_ORDER.filter((id) => this.state[id].owned);
    if (!owned.length) return;
    if (!this.current) { this.equip(dir > 0 ? owned[0] : owned[owned.length - 1]); return; }
    const i = owned.indexOf(this.current);
    this.equip(owned[(i + dir + owned.length) % owned.length]);
  }
  cur() { return this.current ? defById(this.current) : null; }
  curState() { return this.current ? this.state[this.current] : null; }
  startReload() {
    const d = this.cur(), s = this.curState();
    if (!d || !s || this.reloading > 0 || s.mag >= d.mag || s.reserve <= 0) return false;
    this.reloading = d.reloadTime;
    this.h.audio.reloadSound(d.reloadTime > 1.8);
    return true;
  }
  finishReload() {
    const d = this.cur(), s = this.curState();
    if (!d || !s) return;
    const take = Math.min(d.mag - s.mag, s.reserve);
    s.mag += take; s.reserve -= take;
  }
  serialize() {
    return {
      state: JSON.parse(JSON.stringify(this.state)),
      current: this.current,
      pickupsTaken: this.pickups.filter((p) => p.taken).map((p) => p.id),
    };
  }
  reset() {
    for (const d of WEAPON_DEFS) this.state[d.id] = { owned: false, mag: 0, reserve: 0 };
    this.current = null;
    this.reloading = 0;
    for (const p of this.pickups) { p.taken = false; p.mesh.visible = true; }
    this.clearTempPickups();
  }
  restore(data) {
    if (!data) return;
    for (const id of WEAPON_ORDER) if (data.state?.[id]) this.state[id] = { owned: !!data.state[id].owned, mag: data.state[id].mag | 0, reserve: data.state[id].reserve | 0 };
    this.current = data.current && this.state[data.current]?.owned ? data.current : null;
    for (const p of this.pickups) if ((data.pickupsTaken || []).includes(p.id)) { p.taken = true; p.mesh.visible = false; }
  }
  // ------------------------------------------------------------ effects
  spawnFx(mesh, life, grow = 0) {
    this.scene.add(mesh);
    this.fx.push({ mesh, t: 0, life, grow });
  }
  tracer(x1, y1, z1, x2, y2, z2) {
    const m = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
    m.scale.z = Math.max(len, 0.1);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    m.lookAt(x2, y2, z2);
    this.spawnFx(m, 0.05);
  }
  sparks(x, y, z, color = 0xffd98a, n = 5, size = 0.5) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = x + (Math.random() - 0.5) * 0.4; pos[i * 3 + 1] = y + Math.random() * 0.4; pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.4; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: puffTexture(), color, transparent: true, opacity: 0.9, depthWrite: false }));
    this.spawnFx(pts, 0.28);
  }
  muzzle(x, y, z) {
    const s = new THREE.Sprite(flashMat());
    s.position.set(x, y, z); s.scale.set(0.65, 0.65, 1);
    this.spawnFx(s, 0.055);
  }
  // ------------------------------------------------------------ firing
  /** Cast one hitscan pellet; returns the impact point. */
  castBullet(P, heading, pitch, def) {
    const spread = () => (Math.random() - 0.5) * 2 * def.spread;
    const h = heading + spread();
    const p = pitch + spread() * 0.6;
    const dx = Math.sin(h) * Math.cos(p), dy = Math.sin(p), dz = Math.cos(h) * Math.cos(p);
    const ox = P.x, oy = 1.45, oz = P.z;
    let bestT = def.range, hit = null;
    const consider = (t, kind, obj) => { if (t > 0.2 && t < bestT) { bestT = t; hit = { kind, obj }; } };
    // buildings: 2D ray vs AABBs (only while aiming near-level)
    if (Math.abs(p) < 0.4) {
      for (const c of P.colliders) {
        let tmin = 0, tmax = Infinity;
        for (const [o, d, mn, mx] of [[ox, dx, c.minX, c.maxX], [oz, dz, c.minZ, c.maxZ]]) {
          if (Math.abs(d) < 1e-8) { if (o < mn || o > mx) { tmin = Infinity; break; } }
          else {
            let t1 = (mn - o) / d, t2 = (mx - o) / d;
            if (t1 > t2) [t1, t2] = [t2, t1];
            tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
            if (tmin > tmax) { tmin = Infinity; break; }
          }
        }
        if (tmin !== Infinity && tmin > 0.2 && oy + dy * tmin < 14) consider(tmin, 'wall', null);
      }
    }
    // people-shaped targets: peds, officers, thugs — 2D ray-circle
    const person = (list, kind) => {
      for (const o of list) {
        if (o.state === 'down' || o.down) continue;
        const rx = o.x - ox, rz = o.z - oz;
        const t = rx * dx + rz * dz;
        if (t < 0.2 || t > bestT) continue;
        const px = ox + dx * t - o.x, pz = oz + dz * t - o.z;
        if (px * px + pz * pz < 0.3) consider(t, kind, o);   // ~0.55 m radius
      }
    };
    person(P.peds, 'ped'); person(P.officers, 'officer'); person(P.thugs, 'thug');
    // cars: ray vs the car's ground circle (radius ~ half length)
    for (const v of P.vehicles) {
      const rx = v.x - ox, rz = v.z - oz;
      const t = rx * dx + rz * dz;
      if (t < 0.2 || t > bestT) continue;
      const px = ox + dx * t - v.x, pz = oz + dz * t - v.z;
      const rr = v.model.len * 0.52;
      if (px * px + pz * pz < rr * rr) consider(t, 'car', v);
    }
    // helicopter: a true 3D sphere test
    if (P.heli) {
      const hx = P.heli.x - ox, hy = P.heli.y - oy, hz = P.heli.z - oz;
      const t = hx * dx + hy * dy + hz * dz;
      if (t > 0.2 && t < bestT) {
        const px = ox + dx * t - P.heli.x, py = oy + dy * t - P.heli.y, pz = oz + dz * t - P.heli.z;
        if (px * px + py * py + pz * pz < 11.5) consider(t, 'heli', null);   // r ≈ 3.4
      }
    }
    const ix = ox + dx * bestT, iy = Math.max(0.25, oy + dy * bestT), iz = oz + dz * bestT;
    return { hit, x: ix, y: iy, z: iz, t: bestT };
  }
  applyHit(P, res, def) {
    if (!res.hit) { this.sparks(res.x, res.y, res.z, 0xcfd8dc, 2, 0.3); return; }
    const { kind, obj } = res.hit;
    if (kind === 'ped') { P.hurtPed(obj, def.dmg, P.x, P.z); this.h.crime(1, 'pedHit'); this.sparks(res.x, 1.2, res.z, 0xffb3a0, 4, 0.4); }
    else if (kind === 'officer') { P.hurtOfficer(obj, def.dmg, P.x, P.z); this.h.crime(2, 'copHit'); this.sparks(res.x, 1.2, res.z, 0xffb3a0, 4, 0.4); }
    else if (kind === 'thug') { P.hurtThug(obj, def.dmg, P.x, P.z); this.sparks(res.x, 1.2, res.z, 0xffb3a0, 4, 0.4); }
    else if (kind === 'car') { obj.damage(def.dmg * 0.55); this.sparks(res.x, res.y, res.z, 0xffd98a, 6, 0.5); }
    else if (kind === 'heli') { P.damageHeli(def.dmg); this.sparks(res.x, res.y, res.z, 0xffe9a8, 6, 0.55); }
    else this.sparks(res.x, res.y, res.z, 0xd8d4c4, 4, 0.4);
  }
  fireOnce(P, def, st) {
    const mx = P.x + Math.sin(P.aimHeading) * 0.55, mz = P.z + Math.cos(P.aimHeading) * 0.55;
    this.muzzle(mx, 1.42, mz);
    this.h.audio.shot(def.id);
    this.h.crime(0, 'shotFired');   // main decides the hearing/heat rules
    if (def.projectile) { this.launchRocket(P, def); return; }
    for (let i = 0; i < def.pellets; i++) {
      const res = this.castBullet(P, P.aimHeading, P.aimPitch, def);
      this.tracer(mx, 1.42, mz, res.x, res.y, res.z);
      this.applyHit(P, res, def);
    }
    this.h.shake(def.id === 'shotgun' ? 0.16 : def.id === 'rifle' ? 0.05 : 0.03);
  }
  launchRocket(P, def) {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x5a6650, roughness: 0.5 }));
    body.rotation.x = Math.PI / 2; mesh.add(body);
    const glow = new THREE.Sprite(fireMat()); glow.scale.set(0.7, 0.7, 1); glow.position.z = -0.45; mesh.add(glow);
    const h = P.aimHeading, p = P.aimPitch;
    const dir = { x: Math.sin(h) * Math.cos(p), y: Math.sin(p), z: Math.cos(h) * Math.cos(p) };
    mesh.position.set(P.x + dir.x * 0.8, 1.45, P.z + dir.z * 0.8);
    mesh.lookAt(mesh.position.x + dir.x, mesh.position.y + dir.y, mesh.position.z + dir.z);
    this.scene.add(mesh);
    this.projectiles.push({ mesh, vx: dir.x * def.projSpeed, vy: dir.y * def.projSpeed, vz: dir.z * def.projSpeed, t: 0 });
    this.sparks(P.x, 1.3, P.z, 0xcfd8dc, 7, 0.7);   // launch smoke
  }
  /** Test/staging helper: loose a rocket at a fixed point (same code path). */
  fireRocketAt(from, to) {
    const def = defById('rpg');
    const dx = to.x - from.x, dy = to.y - 1.45, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x5a6650, roughness: 0.5 }));
    body.rotation.x = Math.PI / 2; mesh.add(body);
    const glow = new THREE.Sprite(fireMat()); glow.scale.set(0.7, 0.7, 1); glow.position.z = -0.45; mesh.add(glow);
    mesh.position.set(from.x, 1.45, from.z);
    mesh.lookAt(to.x, to.y, to.z);
    this.scene.add(mesh);
    this.projectiles.push({ mesh, vx: dx / len * def.projSpeed, vy: dy / len * def.projSpeed, vz: dz / len * def.projSpeed, t: 0 });
  }
  explode(P, x, y, z, def) {
    // visuals: fireball + smoke + a hard light flash
    const ball = new THREE.Sprite(fireMat());
    ball.position.set(x, Math.max(y, 0.8), z); ball.scale.set(2, 2, 1);
    this.spawnFx(ball, 0.32, def.blast * 2.4);
    const smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color: 0x3c4148, transparent: true, opacity: 0.55, depthWrite: false }));
    smoke.position.set(x, Math.max(y, 1) + 1, z); smoke.scale.set(3, 3, 1);
    this.spawnFx(smoke, 1.1, def.blast * 1.1);
    const light = new THREE.PointLight(0xffa050, 900, 42, 1.8);
    light.position.set(x, Math.max(y, 1.2), z);
    this.spawnFx(light, 0.22);
    this.h.audio.explosion();
    this.h.shake(0.55);
    this.h.crime(0, 'explosion');
    // damage falloff: brutal at the centre, fading to the rim
    const R = def.blast;
    const fall = (d) => clamp(1 - d / R, 0, 1);
    for (const v of P.vehicles) {
      const d = dist2d(x, z, v.x, v.z);
      if (d < R + 2) { v.damage(25 + def.dmg * fall(d)); if (d < R * 0.55 && !v.dead && v.health < 30) v.damage(60); }
    }
    for (const ped of P.peds) { const d = dist2d(x, z, ped.x, ped.z); if (d < R) P.hurtPed(ped, 30 + def.dmg * fall(d), x, z); }
    for (const o of P.officers) { const d = dist2d(x, z, o.x, o.z); if (d < R) { P.hurtOfficer(o, 30 + def.dmg * fall(d), x, z); this.h.crime(2, 'copHit'); } }
    for (const t of P.thugs) { const d = dist2d(x, z, t.x, t.z); if (d < R) P.hurtThug(t, 30 + def.dmg * fall(d), x, z); }
    if (P.heli) {
      const d = Math.hypot(P.heli.x - x, P.heli.y - y, P.heli.z - z);
      if (d < R + 3.5) P.damageHeli(40 + def.dmg * 0.75 * fall(Math.max(0, d - 2)));
    }
    const pd = dist2d(x, z, P.x, P.z);
    if (pd < R) this.h.hurtPlayer((8 + def.dmg * 0.55) * fall(pd));
  }
  // ------------------------------------------------------------ per-frame
  update(dt, firing) {
    this.time += dt;
    const P = this.h.provider();
    // fx lifetimes
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      if (f.grow) { const s = 1 + f.grow * f.t; f.mesh.scale.set(s, s, 1); }
      if (f.mesh.isPointLight) f.mesh.intensity = Math.max(0, 900 * (1 - f.t / f.life));
      if (f.t >= f.life) { this.scene.remove(f.mesh); this.fx.splice(i, 1); }
    }
    // pickups: spin, bob, collect
    const allPickups = [...this.pickups, ...this.tempPickups];
    for (const p of allPickups) {
      if (p.taken) continue;
      p.core.rotation.y += dt * 2.4;
      p.core.position.y = 1.05 + Math.sin(this.time * 2.2 + p.x) * 0.14;
      if (P.onFoot && dist2d(P.x, P.z, p.x, p.z) < 1.9) {
        p.taken = true; p.mesh.visible = false;
        const fresh = this.grant(p.id);
        this.h.onPickup?.(p.id, fresh, p.temp);
      }
    }
    if (!P.onFoot) { this.updateProjectiles(dt, P); return; }
    if (!this.cur()) { this.updateProjectiles(dt, P); return; }   // unarmed: rockets already in flight must keep flying (an early return here froze them mid-air)
    // reload bookkeeping
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.finishReload();
    }
    this.fireT -= dt;
    const def = this.cur(), st = this.curState();
    if (!def || !st) return;
    const wantFire = def.auto ? firing : (firing && !this.triggerHeld);
    if (firing && st.mag <= 0 && this.fireT <= 0 && this.reloading <= 0) {
      this.h.audio.dryFire();
      this.fireT = 0.3;
      this.startReload();
    } else if (wantFire && this.fireT <= 0 && this.reloading <= 0 && st.mag > 0) {
      st.mag--;
      this.fireT = def.interval;
      this.fireOnce(P, def, st);
      if (st.mag === 0) this.startReload();
    }
    this.triggerHeld = firing;
    this.updateProjectiles(dt, P);
  }
  updateProjectiles(dt, P) {
    // rockets in flight
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const r = this.projectiles[i];
      r.t += dt;
      r.vy -= 2.2 * dt;   // a whisper of drop
      r.mesh.position.x += r.vx * dt;
      r.mesh.position.y += r.vy * dt;
      r.mesh.position.z += r.vz * dt;
      const pos = r.mesh.position;
      let boom = r.t > 4.5 || pos.y <= 0.25;
      if (!boom && P.heli && Math.hypot(P.heli.x - pos.x, P.heli.y - pos.y, P.heli.z - pos.z) < 4.4) boom = true;
      if (!boom) for (const v of P.vehicles) if (dist2d(pos.x, pos.z, v.x, v.z) < v.model.len * 0.52 + 0.5 && pos.y < 2.6) { boom = true; break; }
      if (!boom) for (const c of P.colliders) if (pos.x > c.minX - 0.3 && pos.x < c.maxX + 0.3 && pos.z > c.minZ - 0.3 && pos.z < c.maxZ + 0.3 && pos.y < 13) { boom = true; break; }
      if (!boom) for (const o of [...P.peds, ...P.officers, ...P.thugs]) if (pos.y < 3 && o.state !== 'down' && dist2d(pos.x, pos.z, o.x, o.z) < 1.1) { boom = true; break; }   // y-gated: a rocket at altitude must not detonate on people below
      if (boom) {
        this.scene.remove(r.mesh);
        this.projectiles.splice(i, 1);
        this.explode(P, pos.x, pos.y, pos.z, defById('rpg'));
      }
    }
  }
}
