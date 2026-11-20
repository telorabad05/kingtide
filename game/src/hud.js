// HUD: all DOM overlay — cash with a pop on change, wanted stars that flash
// when a new one lands, mission banners + objective line, contextual prompts,
// the bust meter, speed/health readouts, BUSTED/WASTED splashes — and the
// canvas minimap (static city pre-rendered once, actors drawn per frame).
import { CITY } from './config.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.cashEl = $('cash');
    this.repEl = $('rep');
    this.leadEl = $('leadName');
    this.crewEl = $('crewBar');
    this._crewKey = '';
    this.starsEl = $('stars');
    this.bannerEl = $('banner');
    this.bannerTitle = $('bannerTitle');
    this.bannerSub = $('bannerSub');
    this.objectiveEl = $('objective');
    this.promptEl = $('prompt');
    this.bustWrap = $('bustWrap');
    this.bustFill = $('bustFill');
    this.driveEl = $('driveInfo');
    this.speedEl = $('speedVal');
    this.carNameEl = $('carName');
    this.carHealthFill = $('carHealthFill');
    this.nitroFill = $('nitroFill');
    this.healthWrap = $('healthWrap');
    this.healthFill = $('healthFill');
    this.armourWrap = $('armourWrap');
    this.armourFill = $('armourFill');
    this.weaponEl = $('weaponInfo');
    this.toastEl = $('toast');
    this.searchWrap = $('searchWrap');
    this.searchFill = $('searchFill');
    this.zoneEl = $('zoneLabel');
    this.bigEl = $('bigText');
    this.map = $('minimap').getContext('2d');
    this.lastCash = null;
    this.lastStars = 0;
    this.bannerTimer = 0;
    this.toastTimer = 0;
    this.staticMap = this.prerenderMap();
    // --- weapon wheel: six radial slots built once, shown on Q
    this.wheelEl = $('wheel');
    this.wheelCenter = $('wheelCenter');
    this.wheelSlots = [];
    const slotsBox = $('wheelSlots');
    for (let i = 0; i < 6; i++) {
      const d = document.createElement('div');
      d.className = 'wslot';
      slotsBox.appendChild(d);
      this.wheelSlots.push(d);
    }
  }
  // world → minimap coords: x [-520, 520], z [-260, 560] onto 190×190 (all three zones fit)
  mx(x) { return (x + 520) / 1040 * 190; }
  mz(z) { return (z + 260) / 820 * 190; }
  prerenderMap() { return this.renderMapBase(190, 190, false); }
  /** The ONE map drawing, shared by the minimap and the full map (M):
   *  same layout data, same projection — only the scale and detail differ. */
  renderMapBase(w, h, detailed) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const X = (x) => (x + 520) / 1040 * w, Z = (z) => (z + 260) / 820 * h;
    const K = w / 190;   // stroke/dot scale vs the minimap
    g.fillStyle = '#14607e'; g.fillRect(0, 0, w, h);                       // sea
    g.fillStyle = '#8f8672'; g.fillRect(X(-270), Z(-230), X(270) - X(-270), Z(190) - Z(-230)); // mainland
    g.fillStyle = '#e8d29a'; g.fillRect(X(-270), Z(186), X(270) - X(-270), Z(254) - Z(186));   // beach
    g.fillStyle = '#3d4148';                                                    // roads
    for (const x of CITY.avenuesX) g.fillRect(X(x) - K, Z(-230), 2 * K, Z(190) - Z(-230));
    for (const z of CITY.boulevardsZ) g.fillRect(X(-270), Z(z) - K, X(270) - X(-270), 2 * K);
    g.fillStyle = '#58a447';                                                    // park
    g.fillRect(X(-32), Z(-72), X(32) - X(-32), Z(-8) - Z(-72));
    g.fillStyle = '#9b958a';                                                    // stadium
    g.beginPath(); g.arc(X(CITY.stadium.cx), Z(CITY.stadium.cz), 4 * K, 0, 7); g.fill();
    g.fillStyle = '#8a6844';                                                    // pier
    const P = CITY.pier;
    g.fillRect(X(P.minX), Z(P.minZ), X(P.maxX) - X(P.minX), Z(P.maxZ) - Z(P.minZ));
    // PLUS: Zone B — the industrial slab + its road cross
    g.fillStyle = '#7d7a72'; g.fillRect(X(288), Z(-84), X(486) - X(288), Z(204) - Z(-84));
    g.fillStyle = '#3d4148';
    for (const z of [160, 40, -60]) g.fillRect(X(288), Z(z) - K, X(486) - X(288), 2 * K);
    for (const x of [312, 392, 462]) g.fillRect(X(x) - K, Z(-84), 2 * K, Z(204) - Z(-84));
    g.fillRect(X(246), Z(160) - K, X(292) - X(246), 2 * K);   // east bridge
    g.fillRect(X(246), Z(40) - K, X(292) - X(246), 2 * K);
    // PLUS: Zone C — Hillcrest Island: green disc, sand rim, ring road
    g.fillStyle = '#e8d29a';
    g.beginPath(); g.arc(X(-380), Z(340), (112 / 1040) * w, 0, 7); g.fill();
    g.fillStyle = '#58a447';
    g.beginPath(); g.arc(X(-380), Z(340), (94 / 1040) * w, 0, 7); g.fill();
    g.strokeStyle = '#3d4148'; g.lineWidth = 2 * K;
    g.beginPath(); g.arc(X(-380), Z(340), (70 / 1040) * w, 0, 7); g.stroke();
    g.fillStyle = '#3d4148';
    g.fillRect(X(-300), Z(252), X(-246) - X(-300), 3 * K);   // causeway
    if (detailed) {
      g.textAlign = 'center';
      g.fillStyle = 'rgba(234,246,255,.92)';
      g.font = `bold ${Math.round(15 * K)}px Georgia, serif`;
      g.fillText('OCEANFRONT DOWNTOWN', X(-40), Z(-196));
      g.fillText('HARBOR INDUSTRIAL', X(387), Z(-70));
      g.fillText('HILLCREST ISLAND', X(-380), Z(452));
      g.font = `${Math.round(11 * K)}px Georgia, serif`;
      g.fillStyle = 'rgba(234,246,255,.75)';
      g.fillText("LOLA'S QUAY", X(196), Z(330));
      g.fillText('SOLMARINA', X(0), Z(-252));
    }
    return c;
  }
  /** The full map (M key): base map + place icons + objective + player arrow.
   *  Returns the projected pixel positions so tests can verify them. */
  drawBigMap(canvas, view) {
    const w = canvas.width, h = canvas.height;
    if (!this.bigBase || this.bigBase.width !== w || this.bigBase.height !== h) this.bigBase = this.renderMapBase(w, h, true);
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.drawImage(this.bigBase, 0, 0);
    const X = (x) => (x + 520) / 1040 * w, Z = (z) => (z + 260) / 820 * h;
    const out = { player: null, target: null, places: {} };
    g.textAlign = 'center';
    for (const p of view.places || []) {
      const px = X(p.x), py = Z(p.z);
      g.font = '19px serif';
      g.fillText(p.icon, px, py + 6);
      g.font = '11px sans-serif'; g.fillStyle = '#eaf6ff';
      g.fillText(p.label, px, py + 20);
      out.places[p.label] = { px, py };
    }
    if (view.target) {
      const px = X(view.target.x), py = Z(view.target.z);
      const pulse = 9 + Math.sin(performance.now() * 0.008) * 2.5;
      g.strokeStyle = '#2fe8c8'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(px, py, pulse + 5, 0, 7); g.stroke();
      g.fillStyle = '#2fe8c8';
      g.beginPath(); g.arc(px, py, 4.5, 0, 7); g.fill();
      g.font = 'bold 11px sans-serif'; g.fillStyle = '#2fe8c8';
      g.fillText('OBJEKTIF', px, py - pulse - 9);
      out.target = { px, py };
    }
    if (view.zones) {
      g.font = 'bold 13px sans-serif'; g.fillStyle = '#ffd97a';
      for (const z of view.zones) g.fillText(z.text, X(z.x), Z(z.z));
    }
    out.standing = view.standing || null;
    // player arrow — same rotation convention as the minimap
    const px = X(view.player.x), py = Z(view.player.z);
    g.save();
    g.translate(px, py);
    g.rotate(Math.PI - view.player.heading);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#10222f'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -10); g.lineTo(6.5, 8); g.lineTo(0, 4); g.lineTo(-6.5, 8); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.font = 'bold 11px sans-serif'; g.fillStyle = '#ffffff';
    g.fillText('KAMU', px, py + 24);
    out.player = { px, py };
    return out;
  }
  drawMinimap(s) {
    const g = this.map;
    g.clearRect(0, 0, 190, 190);
    g.drawImage(this.staticMap, 0, 0);
    const dot = (x, z, color, r = 2.4) => { g.fillStyle = color; g.beginPath(); g.arc(this.mx(x), this.mz(z), r, 0, 7); g.fill(); };
    // PLUS: the police search zone — a pulsing amber circle on the last known position
    if (s.search) {
      const pulse = 0.55 + Math.sin(performance.now() * 0.006) * 0.25;
      g.strokeStyle = `rgba(255,180,60,${pulse})`; g.lineWidth = 1.6;
      g.beginPath(); g.arc(this.mx(s.search.x), this.mz(s.search.z), (s.search.radius / 1040) * 190, 0, 7); g.stroke();
      g.fillStyle = `rgba(255,180,60,${pulse * 0.16})`;
      g.beginPath(); g.arc(this.mx(s.search.x), this.mz(s.search.z), (s.search.radius / 1040) * 190, 0, 7); g.fill();
    }
    for (const b of s.boats) dot(b.x, b.z, '#ffffff', 1.6);
    // safehouse: a little house glyph, gold until bought, teal after
    const S = CITY.safehouse;
    g.fillStyle = s.houseOwned ? '#2fe8c8' : '#ffc93c';
    g.fillRect(this.mx(S.garageX) - 3, this.mz(S.garageZ) - 2, 6, 5);
    g.beginPath();
    g.moveTo(this.mx(S.garageX) - 4, this.mz(S.garageZ) - 2);
    g.lineTo(this.mx(S.garageX), this.mz(S.garageZ) - 6);
    g.lineTo(this.mx(S.garageX) + 4, this.mz(S.garageZ) - 2);
    g.fill();
    for (const cop of s.cops) dot(cop.x, cop.z, Math.sin(performance.now() * 0.012) > 0 ? '#3f8cff' : '#ff4040', 2.2);
    if (s.rival) dot(s.rival.x, s.rival.z, '#ff2fb3', 2.6);
    if (s.target) {
      const pulse = 3.4 + Math.sin(performance.now() * 0.008) * 1.1;
      g.strokeStyle = '#2fe8c8'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(this.mx(s.target.x), this.mz(s.target.z), pulse + 2.4, 0, 7); g.stroke();
      dot(s.target.x, s.target.z, '#2fe8c8', 2.2);
    }
    // player arrow
    g.save();
    g.translate(this.mx(s.player.x), this.mz(s.player.z));
    g.rotate(Math.PI - s.player.heading);   // map: x right, z down; heading 0 faces south (down)
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -5); g.lineTo(3.4, 4); g.lineTo(0, 2); g.lineTo(-3.4, 4); g.closePath(); g.fill();
    g.restore();
  }
  setCash(n) {
    if (this.lastCash === n) return;
    this.cashEl.textContent = '$' + n.toLocaleString();
    if (this.lastCash !== null) {   // pop on change
      this.cashEl.classList.remove('bump');
      void this.cashEl.offsetWidth;
      this.cashEl.classList.add('bump');
    }
    this.lastCash = n;
  }
  setWanted(w) {
    const stars = Math.ceil(w - 1e-6);
    if (stars === this.lastStars) return;
    const spans = this.starsEl.children;
    for (let i = 0; i < spans.length; i++) {
      spans[i].classList.toggle('on', i < stars);
      if (i === stars - 1 && stars > this.lastStars) {
        spans[i].classList.remove('flash'); void spans[i].offsetWidth; spans[i].classList.add('flash');
      }
    }
    this.lastStars = stars;
  }
  banner(title, sub = '', ms = 3600) {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    this.bannerEl.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.bannerEl.classList.remove('show'), ms);
  }
  objective(text) {
    if (text) { this.objectiveEl.textContent = text; this.objectiveEl.classList.add('show'); }
    else this.objectiveEl.classList.remove('show');
  }
  prompt(text) {
    if (text) { this.promptEl.textContent = text; this.promptEl.classList.add('show'); }
    else this.promptEl.classList.remove('show');
  }
  setBust(v) {
    if (v === null || v <= 0.01) { this.bustWrap.classList.remove('show'); return; }
    this.bustWrap.classList.add('show');
    this.bustFill.style.width = (v * 100).toFixed(1) + '%';
  }
  setDrive(speedKmh, health01, modelName = null, nitro01 = null) {
    if (speedKmh === null) { this.driveEl.classList.remove('show'); return; }
    this.driveEl.classList.add('show');
    this.speedEl.textContent = String(Math.round(Math.abs(speedKmh)));
    if (modelName !== null) this.carNameEl.textContent = modelName;
    this.carHealthFill.style.width = (health01 * 100).toFixed(0) + '%';
    this.carHealthFill.style.background = health01 > 0.4 ? '#39d353' : health01 > 0.15 ? '#f7b731' : '#e84118';
    if (nitro01 !== null) {
      this.nitroFill.style.width = (nitro01 * 100).toFixed(0) + '%';
      this.nitroFill.style.background = nitro01 > 0.25 ? '#53b7ff' : '#e84118';
    }
  }
  setHealth(v01) {
    if (v01 === null || v01 > 0.999) { this.healthWrap.classList.remove('show'); return; }
    this.healthWrap.classList.add('show');
    this.healthFill.style.width = (v01 * 100).toFixed(0) + '%';
  }
  // ------------------------------------------------------------ PLUS bits
  setRep(rep, rankTitle) {
    this.repEl.textContent = `REP ${rep.toLocaleString()} · ${rankTitle}`;
  }
  setLead(name) {
    if (!name) { this.leadEl.style.display = 'none'; return; }
    this.leadEl.style.display = '';
    this.leadEl.textContent = name;
  }
  setCrew(lines) {
    const key = lines.join('|');
    if (key === this._crewKey) return;
    this._crewKey = key;
    this.crewEl.textContent = lines.join('\n');
  }
  setArmour(v01) {
    if (v01 === null || v01 <= 0.001) { this.armourWrap.classList.remove('show'); return; }
    this.armourWrap.classList.add('show');
    this.armourFill.style.width = (v01 * 100).toFixed(0) + '%';
  }
  setWeapon(text) {
    if (!text) { this.weaponEl.classList.remove('show'); return; }
    this.weaponEl.textContent = text;
    this.weaponEl.classList.add('show');
  }
  toast(text, ms = 2600) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }
  /** frac: 0..1 of the search timer left, or null when not searching. */
  setSearch(frac) {
    if (frac === null) { this.searchWrap.classList.remove('show'); this.starsEl.classList.remove('searching'); return; }
    this.searchWrap.classList.add('show');
    this.starsEl.classList.add('searching');
    this.searchFill.style.width = (frac * 100).toFixed(1) + '%';
  }
  setZone(name) { this.zoneEl.textContent = name; }
  // --- weapon wheel ------------------------------------------------------------
  // slots: [{ label, sub, owned, ammo, current }] in wheel order (top, clockwise).
  showWheel(slots, sel) {
    this.wheelEl.classList.add('open');
    this.paintWheel(slots, sel);
  }
  paintWheel(slots, sel) {
    slots.forEach((s, i) => {
      const el = this.wheelSlots[i];
      const ang = (-90 + i * 60) * Math.PI / 180;
      const R = 118;
      el.style.transform = `translate(${Math.cos(ang) * R}px, ${Math.sin(ang) * R}px) translate(-50%, -50%)`;
      el.classList.toggle('sel', i === sel);
      el.classList.toggle('locked', !s.owned);
      el.classList.toggle('current', !!s.current);
      el.innerHTML = `<div class="wname">${s.label}</div><div class="wammo">${s.owned ? (s.ammo || '') : 'TERKUNCI'}</div>`;
    });
    const s = slots[sel];
    this.wheelCenter.innerHTML = s.owned
      ? `<div class="wc-name">${s.label}</div><div class="wc-sub">${s.sub}</div><div class="wc-ammo">${s.ammo || ''}</div>`
      : `<div class="wc-name">${s.label}</div><div class="wc-sub">${s.sub}</div><div class="wc-ammo locked">TERKUNCI — cari atau beli di Marco</div>`;
  }
  hideWheel() { this.wheelEl.classList.remove('open'); }
  bigText(text, color) {
    this.bigEl.textContent = text;
    this.bigEl.style.color = color;
    this.bigEl.classList.remove('show'); void this.bigEl.offsetWidth;
    this.bigEl.classList.add('show');
  }
}
