// The HUD: cash, health, wanted stars, objective banner, prompts, toasts, the
// speedometer — and the minimap, a top-down canvas plot of Solmarina with the
// player, traffic, police and the mission target on it. The target marker wears
// its mission's icon (chequered flag for the race, a crate for a delivery, a
// diamond for the drops, a ring for checkpoints), unclaimed mission starts glow
// gold, four-plus stars flash hot, and low health breathes a red vignette.
// v3.1 readability: the cash readout pops whenever the number actually moves,
// a fresh wanted star lands with a flash, and the marina's cruising boats are
// plotted on the water so the quay reads as a working harbour.
import { CITY } from './config.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.cashEl = $('cash'); this.healthEl = $('health'); this.starsEl = $('stars');
    this.objectiveEl = $('objective'); this.promptEl = $('prompt'); this.toastEl = $('toast');
    this.speedoEl = $('speedo'); this.speedEl = $('speed'); this.vehicleEl = $('vehicleName');
    this.damageEl = $('damage'); this.lowHealthEl = $('lowHealth');
    this.mapCtx = $('minimap').getContext('2d');
    this.toastTimer = 0;
    this.lastStars = -1;
    this.lastCash = null;
  }
  setCash(n) {
    const v = Math.round(n);
    this.cashEl.textContent = '$' + v.toLocaleString('en-US');
    if (this.lastCash !== null && v !== this.lastCash) {
      // money moved: pop the readout (CSS animation in index.html) so a fare,
      // a fine or a mission purse registers without reading the digits
      this.cashEl.classList.remove('bump');
      void this.cashEl.offsetWidth;   // restart the animation even mid-pop
      this.cashEl.classList.add('bump');
    }
    this.lastCash = v;
  }
  setHealth(frac) {
    const f = Math.max(0, Math.min(1, frac));
    this.healthEl.style.width = `${f * 100}%`;
    if (this.lowHealthEl) this.lowHealthEl.classList.toggle('on', f < 0.3 && f > 0);
  }
  setStars(n, cooling) {
    this.starsEl.classList.toggle('hot', n >= 4);   // four-plus stars pulse red-hot every frame check
    if (n === this.lastStars && cooling === this.lastCooling) return;
    if (this.lastStars >= 0 && n > this.lastStars) {
      // a fresh star lands with a flash (v3.1): trouble should feel like it arrives
      this.starsEl.classList.remove('flash');
      void this.starsEl.offsetWidth;
      this.starsEl.classList.add('flash');
    }
    this.lastStars = n; this.lastCooling = cooling;
    let html = '';
    for (let i = 0; i < 5; i++) html += i < n ? '★' : '<span class="off">★</span>';
    this.starsEl.innerHTML = html;
    this.starsEl.classList.toggle('cooling', !!cooling);
  }
  showObjective(title, sub) {
    this.objectiveEl.style.display = 'block';
    this.objectiveEl.innerHTML = `${title}<small>${sub}</small>`;
  }
  hideObjective() { this.objectiveEl.style.display = 'none'; }
  prompt(html) {
    if (html) { this.promptEl.style.display = 'block'; this.promptEl.innerHTML = html; }
    else this.promptEl.style.display = 'none';
  }
  toast(text, ms = 2200) {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toastEl.style.opacity = '0'; }, ms);
  }
  setSpeed(kmh, vehicleName) {
    if (kmh === null) { this.speedoEl.style.display = 'none'; return; }
    this.speedoEl.style.display = 'block';
    this.speedEl.textContent = String(Math.round(kmh));
    this.vehicleEl.textContent = vehicleName || '';
  }
  flashDamage(strength = 1) {
    this.damageEl.style.opacity = String(Math.min(1, strength));
    setTimeout(() => { this.damageEl.style.opacity = '0'; }, 130);
  }
  /** A mission marker wearing its kind: ring, crate, chequered flag or diamond. */
  drawMissionIcon(g, x, z, kind, pulse) {
    g.save(); g.translate(x, z);
    if (kind === 'race') {
      const s = 3.4;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        g.fillStyle = (i + j) % 2 ? '#10131c' : '#ffffff';
        g.fillRect(-s + i * s, -s + j * s, s, s);
      }
      g.strokeStyle = '#ffc93e'; g.lineWidth = 1.6; g.strokeRect(-s - 1.5, -s - 1.5, s * 2 + 3, s * 2 + 3);
    } else if (kind === 'delivery') {
      g.fillStyle = '#ffb020'; g.fillRect(-4.4, -4.4, 8.8, 8.8);
      g.strokeStyle = '#10131c'; g.lineWidth = 1.6; g.strokeRect(-4.4, -4.4, 8.8, 8.8);
      g.beginPath(); g.moveTo(-4.4, 0); g.lineTo(4.4, 0); g.moveTo(0, -4.4); g.lineTo(0, 4.4); g.stroke();
    } else if (kind === 'drops') {
      g.fillStyle = '#2ee6a8';
      g.beginPath(); g.moveTo(0, -6); g.lineTo(4.6, 0); g.lineTo(0, 6); g.lineTo(-4.6, 0); g.closePath(); g.fill();
      g.strokeStyle = '#10131c'; g.lineWidth = 1.2; g.stroke();
    } else {
      g.fillStyle = '#ffc93e';
      g.beginPath(); g.arc(0, 0, pulse + 2.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#10131c';
      g.beginPath(); g.arc(0, 0, 2.2, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
  /** state: {px, pz, heading, traffic:[], cops:[], target:{x,z,kind}|null, starts:[{x,z,kind}], rival:{x,z}|null, safehouse:{x,z,owned}|null, boats:[{x,z}]} */
  drawMinimap(state) {
    const g = this.mapCtx, S = 218;
    const mx = (x) => ((x + 268) / 536) * S;
    const mz = (z) => ((z + 228) / 476) * S;
    g.fillStyle = '#274b63'; g.fillRect(0, 0, S, S);                        // sea all around
    g.fillStyle = '#3f7d5a'; g.fillRect(mx(-268), mz(-228), S, mz(238) - mz(-228)); // land mass base (park tone)
    g.fillStyle = '#8d8272'; g.fillRect(mx(-CITY.extentX - 26), mz(-CITY.extentZ - 20), mx(CITY.extentX + 26) - mx(-CITY.extentX - 26), mz(CITY.beachZ) - mz(-CITY.extentZ - 20));
    g.fillStyle = '#57a773'; g.fillRect(mx(-40), mz(-80), mx(40) - mx(-40), mz(0) - mz(-80));  // the park
    g.fillStyle = '#e8cf9f'; g.fillRect(0, mz(CITY.beachZ), S, mz(CITY.oceanZ) - mz(CITY.beachZ)); // beach
    g.fillStyle = '#14707e'; g.fillRect(0, mz(CITY.oceanZ), S, S - mz(CITY.oceanZ));           // ocean
    // the Dome: a grey ring with a green pitch, and Lola's Quay reaching into the sea
    const st = CITY.stadium;
    g.fillStyle = '#b9b2a2';
    g.beginPath(); g.arc(mx(st.cx), mz(st.cz), (st.r / 536) * S + 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#57a773';
    g.beginPath(); g.arc(mx(st.cx), mz(st.cz), (st.r / 536) * S, 0, Math.PI * 2); g.fill();
    const P = CITY.pier;
    g.fillStyle = '#a87f52'; g.fillRect(mx(P.minX), mz(P.minZ), mx(P.maxX) - mx(P.minX), S - mz(P.minZ));
    g.strokeStyle = '#d8d3c8'; g.lineWidth = 2;
    for (const zc of CITY.boulevardsZ) { g.beginPath(); g.moveTo(mx(-CITY.extentX - 26), mz(zc)); g.lineTo(mx(CITY.extentX + 26), mz(zc)); g.stroke(); }
    for (const xc of CITY.avenuesX) { g.beginPath(); g.moveTo(mx(xc), mz(-CITY.extentZ - 20)); g.lineTo(mx(xc), mz(CITY.beachZ)); g.stroke(); }
    // unclaimed mission starts glow gold so a free-roaming player can find work
    for (const s of state.starts || []) {
      g.fillStyle = '#ffc93e';
      g.save(); g.translate(mx(s.x), mz(s.z)); g.rotate(Math.PI / 4);
      g.fillRect(-2.6, -2.6, 5.2, 5.2); g.restore();
    }
    if (state.safehouse) {   // Dario's lot: gold while it is for sale, teal once it is home
      const hx = mx(state.safehouse.x), hz = mz(state.safehouse.z);
      g.fillStyle = state.safehouse.owned ? '#2ee6a8' : '#ffd23e';
      g.fillRect(hx - 3, hz - 0.5, 6, 4.5);
      g.beginPath(); g.moveTo(hx - 4.2, hz - 0.5); g.lineTo(hx, hz - 4.6); g.lineTo(hx + 4.2, hz - 0.5); g.closePath(); g.fill();
    }
    if (state.target) {
      const pulse = 4 + Math.sin(performance.now() / 240) * 1.6;
      this.drawMissionIcon(g, mx(state.target.x), mz(state.target.z), state.target.kind, pulse);
    }
    g.fillStyle = '#e8ecf1';
    for (const c of state.traffic) { g.fillRect(mx(c.x) - 1.4, mz(c.z) - 1.4, 2.8, 2.8); }
    // the cruising boats, plotted as pale hulls on the water (v3.1)
    g.fillStyle = '#f2f0eb';
    for (const b of state.boats || []) { g.fillRect(mx(b.x) - 1.8, mz(b.z) - 1.1, 3.6, 2.2); }
    for (const c of state.cops) {
      g.fillStyle = (performance.now() % 500 < 250) ? '#ff4040' : '#4aa8ff';
      g.beginPath(); g.arc(mx(c.x), mz(c.z), 3, 0, Math.PI * 2); g.fill();
    }
    if (state.rival) {   // Rico's Velocity RS, magenta so the race reads at a glance
      g.fillStyle = '#ff4ae0';
      g.beginPath(); g.arc(mx(state.rival.x), mz(state.rival.z), 3.4, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#10131c'; g.lineWidth = 1; g.stroke();
    }
    // player arrow
    const px = mx(state.px), pz = mz(state.pz);
    g.save(); g.translate(px, pz); g.rotate(Math.atan2(Math.sin(state.heading), -Math.cos(state.heading)));
    g.fillStyle = '#ffffff'; g.strokeStyle = '#10131c'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4.4, 5); g.lineTo(0, 2.4); g.lineTo(-4.4, 5); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.fillStyle = '#ffd9a0'; g.font = 'bold 10px Verdana'; g.textAlign = 'right';
    g.fillText('N', S - 6, 13);
  }
}
