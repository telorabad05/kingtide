// People: simple articulated low-poly figures (swinging legs/arms, bobbing
// walk) and the pedestrian system — citizens stroll the sidewalk loops,
// stop in pairs for a chat, and scatter from threats.
import * as THREE from 'three';
import { clamp, randRange, pick, chance, angleDelta, turnToward, dist2d } from './random.js';

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const SKIN = [0xf2c89b, 0xd9a066, 0xa06a35, 0x6e4423, 0xffe0bd];
const SHIRTS = [0xd64541, 0x2e86de, 0xf7b731, 0x20bf6b, 0xff6b81, 0x8854d0, 0xfd9644, 0x7bed9f, 0xeccc68, 0x4aa8ff];
const PANTS = [0x2f3a4a, 0x5a4632, 0x71563a, 0x39424e, 0x7a4a56, 0x2e4a3a];
const HAIR = [0x1c1710, 0x3a2a16, 0x6e4a22, 0xb8b0a4, 0x8a2f23];

function box(parent, mat, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(boxGeo, mat);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m); return m;
}

/** A person ~1.75 m tall. Returns a group with userData limbs for animation. */
export function makePerson(rng, fixed = null) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: fixed?.skin ?? pick(rng, SKIN), roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: fixed?.shirt ?? pick(rng, SHIRTS), roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: fixed?.pants ?? pick(rng, PANTS), roughness: 0.9 });
  const hair = new THREE.MeshStandardMaterial({ color: fixed?.hair ?? pick(rng, HAIR), roughness: 0.95 });
  const legL = box(g, pants, 0.16, 0.78, 0.18, -0.11, 0.39, 0);
  const legR = box(g, pants, 0.16, 0.78, 0.18, 0.11, 0.39, 0);
  box(g, shirt, 0.52, 0.62, 0.26, 0, 1.09, 0);                    // torso
  const armL = box(g, shirt, 0.12, 0.58, 0.14, -0.33, 1.08, 0);
  const armR = box(g, shirt, 0.12, 0.58, 0.14, 0.33, 1.08, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skin);
  head.position.set(0, 1.58, 0); head.castShadow = true; g.add(head);
  box(g, hair, 0.34, 0.1, 0.34, 0, 1.7, 0);                       // hair cap
  g.userData = { legL, legR, armL, armR, head };
  return g;
}

/** Swing the limbs for a walk cycle; phase advances with distance travelled. */
export function animatePerson(mesh, phase, moving) {
  const u = mesh.userData;
  const swing = moving ? Math.sin(phase) * 0.55 : 0;
  u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
  u.legL.position.z = Math.sin(phase) * 0.14; u.legR.position.z = -Math.sin(phase) * 0.14;
  u.armL.rotation.x = -swing * 0.7; u.armR.rotation.x = swing * 0.7;
  u.armL.position.z = -Math.sin(phase) * 0.1; u.armR.position.z = Math.sin(phase) * 0.1;
  mesh.position.y = moving ? Math.abs(Math.sin(phase)) * 0.05 : 0;
}

/** Point on a sidewalk loop at arclength s. Loops: {type:'rect',cx,cz,hw,hd} or {type:'line',x1,z1,x2,z2}. */
export function loopPoint(loop, s) {
  if (loop.type === 'line') {
    const len = Math.hypot(loop.x2 - loop.x1, loop.z2 - loop.z1);
    const cycle = len * 2;
    let t = ((s % cycle) + cycle) % cycle;
    const back = t > len; if (back) t = cycle - t;
    const k = len === 0 ? 0 : t / len;
    const x = loop.x1 + (loop.x2 - loop.x1) * k, z = loop.z1 + (loop.z2 - loop.z1) * k;
    const heading = Math.atan2((loop.x2 - loop.x1) * (back ? -1 : 1), (loop.z2 - loop.z1) * (back ? -1 : 1));
    return { x, z, heading };
  }
  const w = loop.hw * 2, d = loop.hd * 2, per = 2 * (w + d);
  let t = ((s % per) + per) % per;
  if (t < w) return { x: loop.cx - loop.hw + t, z: loop.cz - loop.hd, heading: Math.PI / 2 };
  t -= w;
  if (t < d) return { x: loop.cx + loop.hw, z: loop.cz - loop.hd + t, heading: 0 };
  t -= d;
  if (t < w) return { x: loop.cx + loop.hw - t, z: loop.cz + loop.hd, heading: -Math.PI / 2 };
  t -= w;
  return { x: loop.cx - loop.hw, z: loop.cz + loop.hd - t, heading: Math.PI };
}

export class PedestrianSystem {
  constructor(scene, loops, rng, count) {
    this.scene = scene;
    this.loops = loops;
    this.rng = rng;
    this.peds = [];
    this.time = 0;
    for (let i = 0; i < count; i++) {
      const loop = loops[i % loops.length];
      const mesh = makePerson(rng);
      scene.add(mesh);
      const per = loop.type === 'line' ? Math.hypot(loop.x2 - loop.x1, loop.z2 - loop.z1) * 2 : 4 * (loop.hw + loop.hd);
      const ped = {
        mesh, loop, s: rng() * per, speed: randRange(rng, 1.1, 1.7),
        x: 0, z: 0, heading: 0, phase: rng() * 6,
        state: 'stroll', timer: 0, partner: null, chatCooldown: randRange(rng, 4, 20),
        fleeX: 0, fleeZ: 0, fleeUntil: -1,
      };
      const p = loopPoint(loop, ped.s);
      ped.x = p.x; ped.z = p.z; ped.heading = p.heading;
      ped.baseY = (loop.type === 'line' && loop.x1 === 190) ? 0.55 : 0.22;   // quay deck vs pavement
      mesh.position.set(p.x, ped.baseY, p.z);
      this.peds.push(ped);
    }
  }
  /** Register a threat at (x, z) moving (vx, vz): nearby peds scatter. */
  threaten(x, z, vx = 0, vz = 0, radius = 13) {
    for (const ped of this.peds) {
      if (dist2d(ped.x, ped.z, x, z) < radius) {
        ped.state = 'flee';
        ped.fleeX = x; ped.fleeZ = z; ped.fleeVX = vx; ped.fleeVZ = vz;
        ped.fleeUntil = this.time + 3.2;
        if (ped.partner) { ped.partner.state = 'stroll'; ped.partner.partner = null; ped.partner = null; }
      }
    }
  }
  update(dt) {
    this.time += dt;
    const rng = this.rng;
    for (const ped of this.peds) {
      if (ped.chatCooldown > 0) ped.chatCooldown -= dt;
      if (ped.state === 'flee') {
        // run away from the threat, biased against its line of travel
        let ax = ped.x - ped.fleeX, az = ped.z - ped.fleeZ;
        const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
        const tx = ax * 3.4 - ped.fleeVX * 0.04, tz = az * 3.4 - ped.fleeVZ * 0.04;
        ped.heading = turnToward(ped.heading, Math.atan2(tx, tz), dt * 7);
        ped.x += Math.sin(ped.heading) * 3.4 * dt;
        ped.z += Math.cos(ped.heading) * 3.4 * dt;
        ped.phase += dt * 11;
        animatePerson(ped.mesh, ped.phase, true);
        if (this.time > ped.fleeUntil) ped.state = 'return';
      } else if (ped.state === 'return') {
        const p = loopPoint(ped.loop, ped.s);
        const d = dist2d(ped.x, ped.z, p.x, p.z);
        if (d < 0.7) { ped.state = 'stroll'; }
        else {
          ped.heading = turnToward(ped.heading, Math.atan2(p.x - ped.x, p.z - ped.z), dt * 6);
          ped.x += Math.sin(ped.heading) * 1.8 * dt;
          ped.z += Math.cos(ped.heading) * 1.8 * dt;
          ped.phase += dt * 7; animatePerson(ped.mesh, ped.phase, true);
        }
      } else if (ped.state === 'chat') {
        ped.timer -= dt;
        // planted feet, idle sway, a listening head-tilt toward the partner
        ped.mesh.rotation.z = Math.sin(this.time * 1.7 + ped.phase) * 0.03;
        if (ped.partner) {
          ped.heading = turnToward(ped.heading, Math.atan2(ped.partner.x - ped.x, ped.partner.z - ped.z), dt * 5);
          ped.mesh.userData.head.rotation.z = Math.sin(this.time * 0.9 + ped.phase) * 0.14;
        }
        animatePerson(ped.mesh, ped.phase, false);
        if (ped.timer <= 0) { ped.state = 'stroll'; ped.mesh.rotation.z = 0; ped.mesh.userData.head.rotation.z = 0; if (ped.partner) { ped.partner.state = 'stroll'; ped.partner.partner = null; ped.partner = null; } }
      } else {   // stroll
        ped.s += ped.speed * dt;
        const p = loopPoint(ped.loop, ped.s);
        ped.x = p.x; ped.z = p.z;
        ped.heading = turnToward(ped.heading, p.heading, dt * 8);
        ped.phase += dt * 6.4;
        animatePerson(ped.mesh, ped.phase, true);
        // bump into a neighbour? maybe stop for a chat
        if (ped.chatCooldown <= 0) {
          for (const other of this.peds) {
            if (other === ped || other.state !== 'stroll' || other.chatCooldown > 0) continue;
            if (dist2d(ped.x, ped.z, other.x, other.z) < 2.1) {
              if (chance(rng, 0.5)) {
                ped.state = 'chat'; other.state = 'chat';
                ped.timer = other.timer = randRange(rng, 3.5, 7);
                ped.partner = other; other.partner = ped;
                ped.chatCooldown = other.chatCooldown = randRange(rng, 14, 30);
              } else ped.chatCooldown = 6;
              break;
            }
          }
        }
      }
      ped.mesh.position.x = ped.x; ped.mesh.position.z = ped.z;
      ped.mesh.position.y = ped.baseY + ped.mesh.position.y;   // walk bob rides on the surface height
      ped.mesh.rotation.y = ped.heading;
    }
  }
}
