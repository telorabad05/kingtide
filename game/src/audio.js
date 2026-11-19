// Audio: everything is synthesized with WebAudio — no samples. A sawtooth
// engine, a two-tone siren whose pitch bends with doppler as a cop closes
// in, helicopter rotor wash from looped noise, horns, crashes and UI blips.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineNodes = null;
    this.sirenNodes = null;
    this.heliNodes = null;
    this.noiseBuf = null;
  }
  /** Create the context on the first user gesture; safe to call repeatedly. */
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0.45;
    this.master.connect(ctx.destination);
    // shared white-noise buffer
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    // engine: saw → lowpass → gain(0)
    const eOsc = ctx.createOscillator(); eOsc.type = 'sawtooth'; eOsc.frequency.value = 55;
    const eFil = ctx.createBiquadFilter(); eFil.type = 'lowpass'; eFil.frequency.value = 420;
    const eGain = ctx.createGain(); eGain.gain.value = 0;
    eOsc.connect(eFil).connect(eGain).connect(this.master); eOsc.start();
    this.engineNodes = { eOsc, eFil, eGain };
    // siren: square two-tone via LFO on frequency → gain(0)
    const sOsc = ctx.createOscillator(); sOsc.type = 'square'; sOsc.frequency.value = 770;
    const sLfo = ctx.createOscillator(); sLfo.type = 'sine'; sLfo.frequency.value = 0.65;
    const sLfoGain = ctx.createGain(); sLfoGain.gain.value = 115;
    sLfo.connect(sLfoGain).connect(sOsc.frequency); sLfo.start();
    const sFil = ctx.createBiquadFilter(); sFil.type = 'bandpass'; sFil.frequency.value = 800; sFil.Q.value = 1.4;
    const sGain = ctx.createGain(); sGain.gain.value = 0;
    sOsc.connect(sFil).connect(sGain).connect(this.master); sOsc.start();
    this.sirenNodes = { sOsc, sGain };
    // helicopter: looped noise → bandpass → gain(0), amplitude chopped in update()
    const hSrc = ctx.createBufferSource(); hSrc.buffer = this.noiseBuf; hSrc.loop = true;
    const hFil = ctx.createBiquadFilter(); hFil.type = 'bandpass'; hFil.frequency.value = 320; hFil.Q.value = 0.8;
    const hGain = ctx.createGain(); hGain.gain.value = 0;
    hSrc.connect(hFil).connect(hGain).connect(this.master); hSrc.start();
    this.heliNodes = { hGain };
  }
  /** rpm01: 0..1 of the rev range; driving: whether the player is at the wheel. */
  setEngine(driving, rpm01) {
    if (!this.ctx || !this.engineNodes) return;
    const t = this.ctx.currentTime;
    const { eOsc, eFil, eGain } = this.engineNodes;
    const target = driving ? 0.055 + rpm01 * 0.03 : 0;
    eGain.gain.setTargetAtTime(target, t, 0.09);
    eOsc.frequency.setTargetAtTime(52 + rpm01 * 130, t, 0.06);
    eFil.frequency.setTargetAtTime(380 + rpm01 * 950, t, 0.08);
  }
  /** dist to nearest cop; closing: approach speed m/s (positive = closing in). */
  setSiren(dist, closing) {
    if (!this.ctx || !this.sirenNodes) return;
    const t = this.ctx.currentTime;
    const { sOsc, sGain } = this.sirenNodes;
    const g = dist < 78 ? Math.max(0, 0.34 - dist * 0.0042) : 0;
    sGain.gain.setTargetAtTime(g, t, 0.12);
    const bend = 1 + Math.max(-0.16, Math.min(0.16, closing * 0.011));   // doppler
    sOsc.frequency.setTargetAtTime(770 * bend, t, 0.05);
  }
  /** Helicopter rotor wash: gain by distance, chopped at ~11 Hz. */
  setHeli(dist) {
    if (!this.ctx || !this.heliNodes) return;
    const base = dist === null || dist > 120 ? 0 : Math.max(0, 0.3 - dist * 0.0022);
    const chop = 0.72 + 0.28 * Math.sin(performance.now() * 0.069);
    this.heliNodes.hGain.gain.setTargetAtTime(base * chop, this.ctx.currentTime, 0.03);
  }
  blip(freq = 840) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.75, t + 0.08);
    g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.1);
  }
  cash() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [990, 1318].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.22);
      o.connect(g).connect(this.master); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.25);
    });
  }
  horn(long = false) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.03);
    g.gain.setValueAtTime(0.14, t + (long ? 0.5 : 0.16));
    g.gain.exponentialRampToValueAtTime(0.001, t + (long ? 0.62 : 0.24));
    g.connect(this.master);
    for (const f of [370, 466]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      o.connect(g); o.start(t); o.stop(t + (long ? 0.65 : 0.27));
    }
  }
  /** The quay's two-tone boat horn: low, slow, mournful. */
  boatHorn() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.25);
    g.gain.setValueAtTime(0.11, t + 1.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.7);
    g.connect(this.master);
    for (const f of [147, 196]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      o.connect(g); o.start(t); o.stop(t + 1.75);
    }
  }
  crash(strength = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.4;
    const fil = ctx.createBiquadFilter(); fil.type = 'lowpass'; fil.frequency.value = 900;
    const g = ctx.createGain();
    const peak = Math.min(0.5, 0.12 + strength * 0.05);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    src.connect(fil).connect(g).connect(this.master);
    src.start(t); src.stop(t + 0.3);
    const thump = ctx.createOscillator(), tg = ctx.createGain();
    thump.type = 'sine'; thump.frequency.setValueAtTime(82, t);
    thump.frequency.exponentialRampToValueAtTime(38, t + 0.2);
    tg.gain.setValueAtTime(peak * 0.8, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    thump.connect(tg).connect(this.master); thump.start(t); thump.stop(t + 0.24);
  }
  sting(kind) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const notes = kind === 'busted' ? [392, 330, 262] : [220, 208, 196];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      const at = t + i * 0.16;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.16, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
      o.connect(g).connect(this.master); o.start(at); o.stop(at + 0.32);
    });
  }
}
