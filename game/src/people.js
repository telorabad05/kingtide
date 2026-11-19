// People: a low-poly person factory with a swinging walk cycle, the pedestrian
// system that strolls the sidewalk loops (and flees from trouble — or stops
// dead for a chat, v3.1), and the on-foot player controller with its shove.
import * as THREE from 'three';
import { PALETTE, TUNING } from './config.js';
import { makeRng, randRange, pick, clamp, chance } from './random.js';
import { collideCircle } from './city.js';

function part(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}

/** A person ~1.75 m tall. Limbs pivot at the shoulder/hip so the walk cycle can swing them. */
export function createPerson({ shirt, pants, skin, hair, hat = null }) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 1 });
  const torso = part(0.52, 0.62, 0.28, shirtMat, 0, 1.12, 0); g.add(torso);
  const head = part(0.3, 0.32, 0.3, skinMat, 0, 1.62, 0); g.add(head);
  g.add(part(0.32, 0.1, 0.32, hairMat, 0, 1.8, 0));
  if (hat !== null) {   // a sun cap: crown plus a brim shading the face
    const hatMat = new THREE.MeshStandardMaterial({ color: hat, roughness: 0.95 });
    g.add(part(0.34, 0.09, 0.34, hatMat, 0, 1.86, 0));
    g.add(part(0.3, 0.04, 0.22, hatMat, 0, 1.82, 0.26));
  }
  function limb(w, h, mat, x, y) {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0);
    const m = part(w, h, w, mat, 0, -h / 2 + 0.04, 0); pivot.add(m); g.add(pivot);
    return pivot;
  }
  const armL = limb(0.13, 0.58, shirtMat, -0.34, 1.38);
  const armR = limb(0.13, 0.58, shirtMat, 0.34, 1.38);
  const legL = limb(0.16, 0.78, pantsMat, -0.14, 0.82);
  const legR = limb(0.16, 0.78, pantsMat, 0.14, 0.82);
  return { group: g, armL, armR, legL, legR, head };
}

export function animatePerson(p, phase, amount) {
  const s = Math.sin(phase) * 0.55 * amount;
  p.legL.rotation.x = s; p.legR.rotation.x = -s;
  p.armL.rotation.x = -s * 0.8; p.armR.rotation.x = s * 0.8;
}

function randomOutfit(rng) {
  return {
    shirt: pick(rng, PALETTE.shirtTones), pants: pick(rng, PALETTE.pantsTones),
    skin: pick(rng, PALETTE.skinTones), hair: pick(rng, [0x1e1e24, 0x4a3220, 0x8a6844, 0xc9a86a, 0xb03a2e, 0xdfe6e9]),
    hat: rng() < 0.45 ? pick(rng, PALETTE.hatTones) : null,
  };
}

/** Point at distance s along a sidewalk loop (rect perimeter or a ping-pong line).
 *  Lines run along X at fixed z — or, since v3's quay stroll, along Z at fixed x. */
function loopPoint(loop, s) {
  if (loop.type === 'line' && loop.x1 === loop.x2) {
    const len = Math.abs(loop.z2 - loop.z1);
    let t = (s % (len * 2)) / len; if (t > 1) t = 2 - t;
    return { x: loop.x1, z: loop.z1 + (loop.z2 - loop.z1) * t, dir: (s % (len * 2)) < len ? 0 : Math.PI };
  }
  if (loop.type === 'line') {
    const len = Math.abs(loop.x2 - loop.x1);
    let t = (s % (len * 2)) / len; if (t > 1) t = 2 - t;
    return { x: loop.x1 + (loop.x2 - loop.x1) * t, z: loop.z1, dir: (s % (len * 2)) < len ? 0 : Math.PI };
  }
  const w = loop.hw * 2, d = loop.hd * 2, per = 2 * (w + d);
  let u = ((s % per) + per) % per;
  if (u < w) return { x: loop.cx - loop.hw + u, z: loop.cz - loop.hd, dir: Math.PI / 2 };
  u -= w;
  if (u < d) return { x: loop.cx + loop.hw, z: loop.cz - loop.hd + u, dir: 0 };
  u -= d;
  if (u < w) return { x: loop.cx + loop.hw - u, z: loop.cz + loop.hd, dir: -Math.PI / 2 };
  u -= w;
  return { x: loop.cx - loop.hw, z: loop.cz + loop.hd - u, dir: Math.PI };
}

/** Pedestrians: stroll the loops, chat in pairs sometimes, flee danger, get knocked down. */
export class PedestrianSystem {
  constructor(scene, loops, colliders, seed = 9, count = 34) {
    this.scene = scene; this.loops = loops; this.colliders = colliders;
    this.rng = makeRng(seed);
    this.peds = [];
    for (let i = 0; i < count; i++) this.spawn();
  }
  spawn() {
    const rng = this.rng;
    const loop = pick(rng, this.loops);
    const p = createPerson(randomOutfit(rng));
    p.group.scale.setScalar(randRange(rng, 0.93, 1.08));   // not everyone is the same height
    const ped = {
      ...p, loop, s: randRange(rng, 0, 300), speed: randRange(rng, 1.0, 1.9),
      x: 0, z: 0, heading: 0, phase: randRange(rng, 0, 6), state: 'walk', timer: 0, fx: 0, fz: 0,
      chatT: randRange(rng, 6, 26),   // seconds of strolling before they may stop for a chat
    };
    const pt = loopPoint(loop, ped.s); ped.x = pt.x; ped.z = pt.z;
    p.group.position.set(ped.x, 0.24, ped.z);
    this.scene.add(p.group);
    this.peds.push(ped);
    return ped;
  }
  knockDown(ped, fromX, fromZ) {
    if (ped.state === 'down') return;
    ped.state = 'down'; ped.timer = 4.5;
    ped.fx = ped.x - fromX; ped.fz = ped.z - fromZ;
    const d = Math.hypot(ped.fx, ped.fz) || 1; ped.fx /= d; ped.fz /= d;
  }
  update(dt, threats) {
    for (const ped of this.peds) {
      if (ped.state === 'down') {
        ped.timer -= dt;
        ped.group.rotation.x = Math.max(-Math.PI / 2, ped.group.rotation.x - dt * 7);
        ped.group.position.y = 0.24 + Math.sin(Math.min(1, -ped.group.rotation.x / (Math.PI / 2)) * Math.PI) * 0.1;
        ped.x += ped.fx * dt * 2.2; ped.z += ped.fz * dt * 2.2;
        ped.group.position.x = ped.x; ped.group.position.z = ped.z;
        if (ped.timer <= 0) { // get up somewhere quiet and stroll on
          ped.state = 'walk'; ped.group.rotation.x = 0; ped.group.position.y = 0.24;
          const pt = loopPoint(ped.loop, ped.s); ped.x = pt.x; ped.z = pt.z;
        }
        continue;
      }
      let fleeing = false;
      for (const t of threats) {
        const dx = ped.x - t.x, dz = ped.z - t.z;
        const d = Math.hypot(dx, dz);
        let r = t.r;
        // A fast car bearing down startles people early — and they dodge
        // sideways out of its line instead of sprinting straight ahead of it.
        let dodge = 0;
        if (t.speed > 7 && d > 0.01) {
          const closing = (dx * t.vx + dz * t.vz) / (d * t.speed);   // 1 = driving straight at the ped
          if (closing > 0.25) { r += (t.speed - 7) * 0.55 * closing; dodge = closing; }
        }
        if (d < r) {
          fleeing = true;
          let fx = dx / (d || 1), fz = dz / (d || 1);
          if (dodge > 0) {
            const side = Math.sign(t.vx * dz - t.vz * dx) || 1;       // step to the side the car is not veering toward
            fx += (-dz / (d || 1)) * side * 0.85 * dodge;
            fz += (dx / (d || 1)) * side * 0.85 * dodge;
            const m = Math.hypot(fx, fz) || 1; fx /= m; fz /= m;
          }
          ped.fx = fx; ped.fz = fz;
          break;
        }
      }
      if (fleeing) {
        ped.state = 'flee';
        const sp = 4.6;
        ped.x += ped.fx * sp * dt; ped.z += ped.fz * sp * dt;
        ped.heading = Math.atan2(ped.fx, ped.fz);
        ped.phase += dt * 11;
      } else if (ped.state === 'chat') {
        // stopped for a chat (v3.1): feet planted where the stroll paused, a
        // slow idle sway and a listening head-tilt — then the walk resumes
        ped.timer -= dt;
        ped.phase += dt * 1.7;
        ped.head.rotation.z = Math.sin(ped.phase * 0.7) * 0.14;
        if (ped.timer <= 0) { ped.state = 'walk'; ped.chatT = randRange(this.rng, 16, 34); ped.head.rotation.z = 0; }
      } else {
        if (ped.state === 'flee') { // rejoin the loop at the nearest s
          ped.state = 'walk';
          let bestS = ped.s, bestD = Infinity;
          for (let s = 0; s < 400; s += 4) { const pt = loopPoint(ped.loop, s); const d = Math.hypot(pt.x - ped.x, pt.z - ped.z); if (d < bestD) { bestD = d; bestS = s; } }
          ped.s = bestS;
        }
        // every so often a stroller simply stops: a friend, a phone, a shop
        // window — Solmarina sidewalks are for lingering on (v3.1)
        ped.chatT -= dt;
        if (ped.chatT <= 0) {
          if (chance(this.rng, TUNING.pedChatChance)) { ped.state = 'chat'; ped.timer = randRange(this.rng, 3, 7); }
          ped.chatT = randRange(this.rng, 14, 30);
        }
        if (ped.state === 'walk') {
          ped.s += ped.speed * dt;
          const pt = loopPoint(ped.loop, ped.s);
          ped.heading = Math.atan2(pt.x - ped.x, pt.z - ped.z);
          ped.x = pt.x; ped.z = pt.z;
          ped.phase += dt * 6.4 * ped.speed;
        }
      }
      const [cx, cz] = collideCircle(this.colliders, ped.x, ped.z, 0.35);
      ped.x = cx; ped.z = cz;
      ped.group.position.set(ped.x, 0.24, ped.z);
      ped.group.rotation.y = ped.heading;
      animatePerson(ped, ped.phase, ped.state === 'flee' ? 1.25 : ped.state === 'chat' ? 0.18 : 0.8);
    }
  }
}

/** The player on foot: WASD movement relative to the camera, sprint, a shove with reach. */
export class Player {
  constructor(scene) {
    const p = createPerson({ shirt: 0xff5e3a, pants: 0x22303e, skin: 0xc68642, hair: 0x1e1e24 });
    Object.assign(this, p);
    this.x = 24; this.z = 178; this.heading = Math.PI;   // starts on the promenade, facing the sea road
    this.health = 100; this.phase = 0; this.speedNow = 0;
    this.group.position.set(this.x, 0.24, this.z);
    scene.add(this.group);
  }
  update(dt, input, colliders) {
    const moveX = input.x, moveZ = input.z;
    const mag = Math.hypot(moveX, moveZ);
    const speed = input.sprint ? 7.4 : 4.3;
    if (mag > 0.05) {
      const wx = moveX / (mag || 1), wz = moveZ / (mag || 1);
      this.x += wx * speed * dt; this.z += wz * speed * dt;
      this.heading = Math.atan2(wx, wz);
      this.speedNow = speed;
      this.phase += dt * (input.sprint ? 11 : 8);
    } else this.speedNow = 0;
    const [cx, cz] = collideCircle(colliders, this.x, this.z, 0.45);
    this.x = clamp(cx, -252, 252); this.z = clamp(cz, -212, 306);   // 306: the end of Lola's Quay
    this.group.position.set(this.x, 0.24, this.z);
    this.group.rotation.y = this.heading;
    animatePerson(this, this.phase, this.speedNow > 0 ? 1 : 0);
    if (this.speedNow === 0) animatePerson(this, 0, 0);
  }
  syncMesh() { this.group.position.set(this.x, 0.24, this.z); this.group.rotation.y = this.heading; }
}
