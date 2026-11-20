// Round 3 systems for KINGTIDE (GitHub PLUS edition): district standing,
// side jobs, Kerang Emas shells, stunt jumps, the harbor export list and
// the bank log. Crew abilities, the garage and the busted/bail flow live in
// main.js (they need deep game internals); this module owns the world props
// and state machines that only need the small hook surface below.
// All names/content are original. No Rockstar IP.
import * as THREE from 'three';
import { CITY, modelById } from './config.js';
import { dist2d, clamp, makeRng } from './random.js';
import { makePerson } from './people.js';

export const SASA_SPOT = { x: 96, z: 212 };          // lookout NPC on the Zone A beach
export const EXPORT_POINT = { x: 462, z: 160 };      // harbor export dock, Zone B

// 20 golden shells at landmarks / beach / rooftops (all on walkable ground).
// Every spot is kept ≥ 6 m from all mission stage/gate coordinates — the
// campaign's exact cash chain must never trip one by accident (a shell sat
// on the 'heat' pickup point in the first round-3 run: +$50, chain broken).
export const SHELL_SPOTS = [
  { x: -180, z: 214 }, { x: -90, z: 222 }, { x: 0, z: 208 }, { x: 60, z: 224 }, { x: 130, z: 210 },
  { x: 184, z: 312 }, { x: 196, z: 290 }, { x: 178, z: 300 },
  { x: 178, z: 238 },
  { x: 392, z: 44 }, { x: 336, z: -48 }, { x: 455, z: 55 },
  { x: -312, z: 336 }, { x: -380, z: 266 }, { x: -448, z: 352 },
  { x: 0, z: -44 }, { x: 100, z: 170 }, { x: -222, z: 150 }, { x: 140, z: -84 }, { x: 352, z: 104 },
];

// 8 stunt ramps, centered on road lanes so normal traffic (offset ±3.1 m)
// and lane-keeping test drives never clip them. dir: 'ew' | 'ns'.
export const STUNT_RAMPS = [
  { x: 40, z: 160, dir: 'ew' }, { x: -120, z: 0, dir: 'ns' }, { x: 160, z: -80, dir: 'ew' },
  { x: 392, z: 40, dir: 'ew' }, { x: 312, z: -60, dir: 'ns' }, { x: -310, z: 340, dir: 'ew' },
  { x: 120, z: -160, dir: 'ew' }, { x: -40, z: 80, dir: 'ns' },
];

// 5 repeatable delivery jobs with original givers, spread across the zones.
export const JOB_TEMPLATES = [
  { giver: 'Dewi Lestari', item: 'kotak ikan segar', from: { x: 185, z: 246 }, fromLabel: 'kios ikan marina', to: { x: -380, z: 300 }, toLabel: 'vila Hillcrest' },
  { giver: 'Bambang Rios', item: 'suku cadang kapal', from: { x: 336, z: 148 }, fromLabel: 'gudang galangan', to: { x: 190, z: 250 }, toLabel: "dermaga Lola's Quay" },
  { giver: 'Sari Wulandari', item: 'map dokumen notaris', from: { x: 100, z: 170 }, fromLabel: 'depan Harbor Bank', to: { x: 448, z: 152 }, toLabel: 'gudang timur Harbor Industrial' },
  { giver: 'Umar Farouk', item: 'koper pakaian', from: { x: -222, z: 160 }, fromLabel: 'gerbang Coastal Correctional', to: { x: 64, z: 103 }, toLabel: 'safehouse Palm Row' },
  { giver: 'Larasati Pramudya', item: 'lukisan galeri', from: { x: -380, z: 392 }, fromLabel: 'galeri Hillcrest', to: { x: 140, z: -84 }, toLabel: 'parkiran Dome' },
];

// Harbor export list: 5 wanted car models (existing KINGTIDE model ids).
export const EXPORT_DEALS = [
  { modelId: 'velocity', price: 1500 },
  { modelId: 'coral', price: 1200 },
  { modelId: 'coupe', price: 1000 },
  { modelId: 'wagon', price: 900 },
  { modelId: 'buggy', price: 800 },
];

export function defaultR3() {
  return {
    crew: { partner: false, marco: false, sasa: false },
    standing: { downtown: 0, industrial: 0, hillcrest: 0 },
    shells: [], stunts: [], exportDone: [], exportBonus: false,
    bankLog: [],
    jobOffer: null, jobActive: null, jobOfferIdx: 0,
    clockOff: 0,
  };
}

export function standingBand(v) {
  if (v <= -60) return 'Musuh';
  if (v <= -30) return 'Waspada';
  if (v < 30) return 'Netral';
  if (v < 60) return 'Ramah';
  return 'Bersahabat';
}

function jobPayout(tpl) {
  const d = dist2d(tpl.from.x, tpl.from.z, tpl.to.x, tpl.to.z);
  return clamp(Math.round(300 + d * 0.9), 300, 900);
}

function makeBeacon(color) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.4, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.9, 2.9, 26, 20, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 13;
  g.add(ring, beam);
  g.visible = false;
  return g;
}

export class Round3System {
  // hooks: { state, player, zoneAt, money, addRep, banner, toast, save,
  //          elapsed, startHop, hopActive, exportDeliver }
  constructor(scene, hooks) {
    this.h = hooks;
    this.time = 0;
    this.nextOfferAt = 0;

    // --- Kerang Emas shells: one InstancedMesh, collected ones scale to 0.
    const geo = new THREE.SphereGeometry(0.42, 10, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffc93c, emissive: 0xcc9a1e, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.6 });
    this.shellMesh = new THREE.InstancedMesh(geo, mat, SHELL_SPOTS.length);
    this.shellMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.shellMesh);
    this._dummy = new THREE.Object3D();
    for (let i = 0; i < SHELL_SPOTS.length; i++) this._shellMatrix(i, true);

    // --- Stunt ramps: shared geometry/material, one box each.
    const rampGeo = new THREE.BoxGeometry(3.6, 1.0, 3.0);
    const rampMat = new THREE.MeshStandardMaterial({ color: 0xfd7e35, roughness: 0.85 });
    for (const r of STUNT_RAMPS) {
      const m = new THREE.Mesh(rampGeo, rampMat);
      m.position.set(r.x, 0.14, r.z);
      if (r.dir === 'ew') m.rotation.z = 0.35; else m.rotation.x = -0.35;
      scene.add(m);
    }

    // --- Sasa, the beach lookout (Zone A). Static NPC + amber marker.
    this.sasa = makePerson(makeRng(4242), { female: true, shirt: 0xff8c42, pants: 0x2f3a4a, hair: 0x6e4a22, skin: 0x8a5a2b });
    this.sasa.position.set(SASA_SPOT.x, 0.24, SASA_SPOT.z);
    this.sasa.rotation.y = 0.25;
    scene.add(this.sasa);
    this.sasaMarker = makeBeacon(0xffb454);
    this.sasaMarker.position.set(SASA_SPOT.x, 0.26, SASA_SPOT.z);
    this.sasaMarker.visible = true;
    scene.add(this.sasaMarker);

    // --- Job + export beacons.
    this.jobBeacon = makeBeacon(0xffb454);
    scene.add(this.jobBeacon);
    this.exportBeacon = makeBeacon(0xb065d8);
    scene.add(this.exportBeacon);
  }

  _baseY(x, z) {
    const p = CITY.pier;
    return (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) ? p.deckTop : 0.22;
  }

  _shellMatrix(i, shown) {
    const s = SHELL_SPOTS[i];
    this._dummy.position.set(s.x, this._baseY(s.x, s.z) + 0.3, s.z);
    this._dummy.rotation.set(0, i * 1.7, 0);
    if (shown) this._dummy.scale.set(1, 0.5, 1.3); else this._dummy.scale.set(0.001, 0.001, 0.001);
    this._dummy.updateMatrix();
    this.shellMesh.setMatrixAt(i, this._dummy.matrix);
    this.shellMesh.instanceMatrix.needsUpdate = true;
  }

  restoreVisuals() {
    const got = this.h.state().shells;
    for (let i = 0; i < SHELL_SPOTS.length; i++) this._shellMatrix(i, !got.includes(i));
  }

  // ---------- standing ----------
  onCrime(zone, gained) {
    const st = this.h.state();
    st.standing[zone] = clamp(Math.round(st.standing[zone] - 2 * gained), -100, 100);
  }
  onChapterDone(zone) {
    const st = this.h.state();
    st.standing[zone] = clamp(st.standing[zone] + 6, -100, 100);
  }
  marcoFactor() {
    const s = this.h.state().standing.industrial;
    return s >= 30 ? 0.85 : s <= -30 ? 1.15 : 1;
  }
  marcoPrice(base) { return Math.round(base * this.marcoFactor()); }
  searchFactor(zone) {
    const s = this.h.state().standing[zone] || 0;
    return s >= 30 ? 1.15 : s <= -30 ? 0.85 : 1;
  }

  // ---------- bank log ----------
  logBank(amt, label) {
    const log = this.h.state().bankLog;
    log.push({ amt, label });
    while (log.length > 10) log.shift();
  }
  bankLines() {
    const log = this.h.state().bankLog;
    if (!log.length) return ['Belum ada transaksi.'];
    return log.slice(-10).reverse().map((e) => `${e.amt >= 0 ? '+' : '-'}$${Math.abs(e.amt).toLocaleString('en-US')} · ${e.label}`);
  }

  // ---------- side jobs ----------
  genOffer(st) {
    const tpl = JOB_TEMPLATES[st.jobOfferIdx % JOB_TEMPLATES.length];
    st.jobOffer = { tpl: st.jobOfferIdx % JOB_TEMPLATES.length, payout: jobPayout(tpl) };
    this.h.save();
  }
  acceptJob() {
    const st = this.h.state();
    if (!st.jobOffer || st.jobActive) return false;
    const tpl = JOB_TEMPLATES[st.jobOffer.tpl];
    st.jobActive = { tpl: st.jobOffer.tpl, phase: 'pickup', payout: st.jobOffer.payout };
    st.jobOffer = null;
    this.h.banner('🧰 Side job diterima', `Ambil ${tpl.item} di ${tpl.fromLabel} — bayaran $${st.jobActive.payout}.`);
    this.h.save();
    return true;
  }
  jobTarget() {
    const a = this.h.state().jobActive;
    if (!a) return null;
    const tpl = JOB_TEMPLATES[a.tpl];
    const pt = a.phase === 'pickup' ? tpl.from : tpl.to;
    return { x: pt.x, z: pt.z };
  }
  exportTarget() {
    const car = this.h.player().car;
    return car && car.exportModel ? { x: EXPORT_POINT.x, z: EXPORT_POINT.z } : null;
  }
  completeJob(st, tpl) {
    const a = st.jobActive;
    this.h.money(a.payout, `Side job: ${tpl.giver}`);
    const zone = this.h.zoneAt(tpl.to.x, tpl.to.z);
    st.standing[zone] = clamp(st.standing[zone] + 4, -100, 100);
    this.h.addRep(5);
    this.h.banner('✅ Side job selesai', `${tpl.item} terkirim — +$${a.payout} · +4 reputasi ${zone} · +5 REP.`);
    st.jobActive = null;
    st.jobOfferIdx++;
    this.nextOfferAt = this.h.elapsed() + 60;
    this.h.save();
  }
  jobsLines() {
    const st = this.h.state();
    const L = [];
    if (st.jobActive) {
      const tpl = JOB_TEMPLATES[st.jobActive.tpl];
      L.push(`🧰 ${tpl.giver} — ${tpl.item}`);
      L.push(`▶ ${st.jobActive.phase === 'pickup' ? 'Ambil di ' + tpl.fromLabel : 'Antar ke ' + tpl.toLabel} · $${st.jobActive.payout}`);
    } else if (st.jobOffer) {
      const tpl = JOB_TEMPLATES[st.jobOffer.tpl];
      L.push(`Tawaran: ${tpl.giver} — antar ${tpl.item}`);
      L.push(`${tpl.fromLabel} → ${tpl.toLabel} · $${st.jobOffer.payout}`);
    } else {
      L.push(`Tawaran baru dalam ${Math.max(0, Math.ceil(this.nextOfferAt - this.h.elapsed()))} dtk…`);
    }
    return L;
  }

  // ---------- export list ----------
  onEnterCar(car) {
    const deal = EXPORT_DEALS.find((d) => d.modelId === car.model.id);
    if (!deal || car.exportModel) return;
    if (this.h.state().exportDone.includes(deal.modelId)) return;
    car.exportModel = deal.modelId;
    this.h.toast(`🚢 Daftar ekspor: ${car.model.name} — antar ke dermaga ekspor Harbor Industrial ($${deal.price})`);
  }
  completeExport(car) {
    const st = this.h.state();
    const deal = EXPORT_DEALS.find((d) => d.modelId === car.exportModel);
    if (!deal) return;
    const name = car.model.name;
    this.h.exportDeliver(car);
    st.exportDone.push(deal.modelId);
    this.h.money(deal.price, `Ekspor mobil: ${name}`);
    this.h.banner('🚢 Mobil diekspor', `${name} dimuat ke kapal — +$${deal.price} · ${st.exportDone.length}/5.`);
    if (st.exportDone.length >= EXPORT_DEALS.length && !st.exportBonus) {
      st.exportBonus = true;
      this.h.money(1000, 'Bonus daftar ekspor tuntas');
      this.h.banner('🏆 Daftar ekspor tuntas!', 'Kelima mobil terkirim — bonus +$1.000.');
    }
    this.h.save();
  }
  exportLines() {
    const st = this.h.state();
    const L = ['🚢 Daftar ekspor dermaga Harbor:'];
    for (const d of EXPORT_DEALS) {
      L.push(`${st.exportDone.includes(d.modelId) ? '✓' : '·'} ${modelById(d.modelId).name} — $${d.price}`);
    }
    if (st.exportBonus) L.push('🏆 Bonus $1.000 sudah dibayar.');
    else L.push('Kirim kelimanya untuk bonus $1.000.');
    return L;
  }

  // ---------- collectibles / stunts ----------
  collectShell(i) {
    const st = this.h.state();
    st.shells.push(i);
    this._shellMatrix(i, false);
    this.h.money(50, 'Kerang Emas');
    this.h.addRep(5, true);
    this.h.toast(`🐚 Kerang Emas ${st.shells.length}/20 · +$50`);
    this.h.save();
  }
  landStunt(idx) {
    const st = this.h.state();
    if (st.stunts.includes(idx)) return false;
    st.stunts.push(idx);
    this.h.money(150, 'Lompatan Gila');
    this.h.addRep(10, true);
    this.h.banner('🌀 LOMPATAN GILA!', `Pendaratan bersih — +$150 · ${st.stunts.length}/8 lompatan.`);
    this.h.save();
    return true;
  }

  statistikLines() {
    const st = this.h.state();
    const s = st.standing;
    const f = (v) => `${v > 0 ? '+' : ''}${v} (${standingBand(v)})`;
    return [
      `📍 Oceanfront Downtown: ${f(s.downtown)}`,
      `📍 Harbor Industrial: ${f(s.industrial)}`,
      `📍 Hillcrest Island: ${f(s.hillcrest)}`,
      `🐚 Kerang Emas: ${st.shells.length}/20`,
      `🌀 Lompatan Gila: ${st.stunts.length}/8`,
      `🚢 Ekspor mobil: ${st.exportDone.length}/5`,
    ];
  }

  update(dt) {
    this.time += dt;
    const st = this.h.state();
    const p = this.h.player();

    // Sasa idle sway + marker pulse.
    this.sasa.rotation.y = 0.25 + Math.sin(this.time * 0.7) * 0.35;
    const pulse = 1 + Math.sin(this.time * 3) * 0.08;
    this.sasaMarker.scale.set(pulse, 1, pulse);

    // Shells.
    for (let i = 0; i < SHELL_SPOTS.length; i++) {
      if (st.shells.includes(i)) continue;
      const s = SHELL_SPOTS[i];
      if (dist2d(p.x, p.z, s.x, s.z) < 2.5) this.collectShell(i);
    }

    // Stunt trigger: fast car crossing an unclaimed ramp starts a hop.
    if (p.inCar && !this.h.hopActive() && Math.abs(p.speed) >= 13) {
      for (let i = 0; i < STUNT_RAMPS.length; i++) {
        if (st.stunts.includes(i)) continue;
        const r = STUNT_RAMPS[i];
        if (dist2d(p.x, p.z, r.x, r.z) < 2.4) { this.h.startHop(i, Math.abs(p.speed)); break; }
      }
    }

    // Side jobs.
    if (!st.jobOffer && !st.jobActive && this.h.elapsed() >= this.nextOfferAt) this.genOffer(st);
    const jt = this.jobTarget();
    this.jobBeacon.visible = !!jt;
    if (jt) {
      this.jobBeacon.position.set(jt.x, this._baseY(jt.x, jt.z) + 0.02, jt.z);
      this.jobBeacon.scale.set(pulse, 1, pulse);
    }
    if (st.jobActive) {
      const tpl = JOB_TEMPLATES[st.jobActive.tpl];
      const pt = st.jobActive.phase === 'pickup' ? tpl.from : tpl.to;
      if (dist2d(p.x, p.z, pt.x, pt.z) < 6) {
        if (st.jobActive.phase === 'pickup') {
          st.jobActive.phase = 'dropoff';
          this.h.banner('📦 Paket diambil', `Antar ${tpl.item} ke ${tpl.toLabel} — $${st.jobActive.payout} menunggumu.`);
          this.h.save();
        } else this.completeJob(st, tpl);
      }
    }

    // Export delivery.
    const car = p.car;
    this.exportBeacon.visible = !!(car && car.exportModel);
    if (this.exportBeacon.visible) {
      this.exportBeacon.position.set(EXPORT_POINT.x, 0.24, EXPORT_POINT.z);
      this.exportBeacon.scale.set(pulse, 1, pulse);
      if (dist2d(car.x, car.z, EXPORT_POINT.x, EXPORT_POINT.z) < 9) this.completeExport(car);
    }
  }
}
