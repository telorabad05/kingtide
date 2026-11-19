// Audio: everything is synthesized with WebAudio — no samples. A sawtooth
// engine, a two-tone siren whose pitch bends with doppler as a cop closes
// in, helicopter rotor wash from looped noise, horns, crashes and UI blips.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.music = null;
    this.vol = { master: 0.9, music: 0.8, sfx: 1, mute: false };   // settings defaults (Pengaturan)
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
    this.master.connect(ctx.destination);
    // settings routing: SFX bus + music (radio) bus → master → destination
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.connect(this.master);
    this.applyVolumes();
    // shared white-noise buffer
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    // engine: saw → lowpass → gain(0)
    const eOsc = ctx.createOscillator(); eOsc.type = 'sawtooth'; eOsc.frequency.value = 55;
    const eFil = ctx.createBiquadFilter(); eFil.type = 'lowpass'; eFil.frequency.value = 420;
    const eGain = ctx.createGain(); eGain.gain.value = 0;
    eOsc.connect(eFil).connect(eGain).connect(this.sfx); eOsc.start();
    this.engineNodes = { eOsc, eFil, eGain };
    // siren: square two-tone via LFO on frequency → gain(0)
    const sOsc = ctx.createOscillator(); sOsc.type = 'square'; sOsc.frequency.value = 770;
    const sLfo = ctx.createOscillator(); sLfo.type = 'sine'; sLfo.frequency.value = 0.65;
    const sLfoGain = ctx.createGain(); sLfoGain.gain.value = 115;
    sLfo.connect(sLfoGain).connect(sOsc.frequency); sLfo.start();
    const sFil = ctx.createBiquadFilter(); sFil.type = 'bandpass'; sFil.frequency.value = 800; sFil.Q.value = 1.4;
    const sGain = ctx.createGain(); sGain.gain.value = 0;
    sOsc.connect(sFil).connect(sGain).connect(this.sfx); sOsc.start();
    this.sirenNodes = { sOsc, sGain };
    // helicopter: looped noise → bandpass → gain(0), amplitude chopped in update()
    const hSrc = ctx.createBufferSource(); hSrc.buffer = this.noiseBuf; hSrc.loop = true;
    const hFil = ctx.createBiquadFilter(); hFil.type = 'bandpass'; hFil.frequency.value = 320; hFil.Q.value = 0.8;
    const hGain = ctx.createGain(); hGain.gain.value = 0;
    hSrc.connect(hFil).connect(hGain).connect(this.sfx); hSrc.start();
    this.heliNodes = { hGain };
    // nitro hiss: looped noise → bandpass → gain(0)
    const nSrc = ctx.createBufferSource(); nSrc.buffer = this.noiseBuf; nSrc.loop = true;
    const nFil = ctx.createBiquadFilter(); nFil.type = 'bandpass'; nFil.frequency.value = 1100; nFil.Q.value = 0.7;
    const nGain = ctx.createGain(); nGain.gain.value = 0;
    nSrc.connect(nFil).connect(nGain).connect(this.sfx); nSrc.start();
    this.nitroNodes = { nGain };
    this.radio = null;   // { station, timer, step, nextTime }
  }
  /** Settings (Pengaturan): store volumes; applied live when the ctx runs. */
  setVolumes(v) {
    this.vol = { master: v.master ?? this.vol.master, music: v.music ?? this.vol.music, sfx: v.sfx ?? this.vol.sfx, mute: !!v.mute };
    this.applyVolumes();
  }
  applyVolumes() {
    if (!this.ctx) return;
    // master 0.9 ≙ the game's long-standing fixed 0.45 bus level
    this.master.gain.value = this.vol.mute ? 0 : this.vol.master * 0.5;
    if (this.music) this.music.gain.value = this.vol.music;
    if (this.sfx) this.sfx.gain.value = this.vol.sfx;
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
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + 0.1);
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
      o.connect(g).connect(this.sfx); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.25);
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
    g.connect(this.sfx);
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
    g.connect(this.sfx);
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
    src.connect(fil).connect(g).connect(this.sfx);
    src.start(t); src.stop(t + 0.3);
    const thump = ctx.createOscillator(), tg = ctx.createGain();
    thump.type = 'sine'; thump.frequency.setValueAtTime(82, t);
    thump.frequency.exponentialRampToValueAtTime(38, t + 0.2);
    tg.gain.setValueAtTime(peak * 0.8, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    thump.connect(tg).connect(this.sfx); thump.start(t); thump.stop(t + 0.24);
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
      o.connect(g).connect(this.sfx); o.start(at); o.stop(at + 0.32);
    });
  }
  // ------------------------------------------------------------ PLUS: guns
  /** One synthesized gunshot; kind picks the body of the crack. */
  shot(kind) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const spec = {
      pistol: { dur: 0.11, lp: 2600, peak: 0.32, thump: 160 },
      smg: { dur: 0.08, lp: 3000, peak: 0.22, thump: 190 },
      shotgun: { dur: 0.24, lp: 1100, peak: 0.5, thump: 95 },
      rifle: { dur: 0.1, lp: 2400, peak: 0.3, thump: 140 },
      rpg: { dur: 0.4, lp: 700, peak: 0.4, thump: 70 },
    }[kind] || { dur: 0.1, lp: 2400, peak: 0.3, thump: 150 };
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.9 + Math.random() * 0.25;
    const fil = ctx.createBiquadFilter(); fil.type = 'lowpass'; fil.frequency.value = spec.lp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(spec.peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + spec.dur);
    src.connect(fil).connect(g).connect(this.sfx);
    src.start(t); src.stop(t + spec.dur + 0.02);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(spec.thump, t);
    o.frequency.exponentialRampToValueAtTime(spec.thump * 0.5, t + spec.dur * 0.7);
    og.gain.setValueAtTime(spec.peak * 0.5, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + spec.dur * 0.8);
    o.connect(og).connect(this.sfx); o.start(t); o.stop(t + spec.dur);
  }
  /** Baseball-bat whoosh: a short band-passed noise sweep, high → low. */
  swing() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = 1.1;
    const fil = ctx.createBiquadFilter(); fil.type = 'bandpass'; fil.Q.value = 1.6;
    fil.frequency.setValueAtTime(950, t);
    fil.frequency.exponentialRampToValueAtTime(280, t + 0.13);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    src.connect(fil).connect(g).connect(this.sfx);
    src.start(t); src.stop(t + 0.17);
  }
  dryFire() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = 1200;
    g.gain.setValueAtTime(0.07, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + 0.05);
  }
  reloadSound(long = false) {
    if (!this.ctx) return;
    [0, long ? 0.34 : 0.22].forEach((off, i) => {
      const ctx = this.ctx, t = ctx.currentTime + off;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = i ? 880 : 620;
      g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.connect(g).connect(this.sfx); o.start(t); o.stop(t + 0.06);
    });
  }
  explosion() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.playbackRate.value = 0.5;
    const fil = ctx.createBiquadFilter(); fil.type = 'lowpass'; fil.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    src.connect(fil).connect(g).connect(this.sfx); src.start(t); src.stop(t + 0.85);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.6);
    og.gain.setValueAtTime(0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    o.connect(og).connect(this.sfx); o.start(t); o.stop(t + 0.7);
  }
  setNitro(on) {
    if (!this.ctx || !this.nitroNodes) return;
    this.nitroNodes.nGain.gain.setTargetAtTime(on ? 0.06 : 0, this.ctx.currentTime, 0.06);
  }
  // ------------------------------------------------------------ PLUS: radio
  // Three synthesized stations. A lookahead step sequencer walks a chord
  // progression per station: bass on the roots, arps/pads/stabs on top.
  static STATIONS = [
    null,
    { name: 'Neon Wave 104', bpm: 102, wave: 'sawtooth', lp: 900, vol: 0.05,
      roots: [55, 43.65, 65.41, 49], arp: [220, 261.63, 329.63, 174.61, 220, 261.63, 196, 246.94, 293.66, 164.81, 196, 246.94] },
    { name: 'Palm FM', bpm: 74, wave: 'triangle', lp: 1600, vol: 0.07,
      roots: [65.41, 55, 43.65, 49], arp: [261.63, 329.63, 392, 493.88, 220, 261.63, 329.63, 174.61, 220, 293.66, 196, 246.94] },
    { name: 'Rock Reef', bpm: 132, wave: 'square', lp: 2200, vol: 0.045,
      roots: [41.2, 41.2, 49, 55], arp: [82.41, 82.41, 98, 110, 82.41, 82.41, 123.47, 98] },
  ];
  /** station: 0 = off, 1..3 = on. Safe to call every frame; no-ops on repeat. */
  setRadio(station) {
    if (!this.ctx) return;
    const cur = this.radio ? this.radio.station : 0;
    if (station === cur) return;
    if (this.radio) { clearInterval(this.radio.timer); this.radio = null; }
    if (!station) return;
    const def = AudioEngine.STATIONS[station];
    const r = this.radio = { station, def, step: 0, nextTime: this.ctx.currentTime + 0.06, timer: null };
    const spb = 60 / def.bpm / 2;   // eighth notes
    const tick = () => {
      if (this.radio !== r) return;
      const ctx = this.ctx;
      while (r.nextTime < ctx.currentTime + 0.35) {
        const s = r.step, t = r.nextTime;
        const bar = Math.floor(s / 8) % 4;
        const root = def.roots[bar];
        const note = (freq, type, vol, dur, lpFreq) => {
          const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
          o.type = type; o.frequency.value = freq;
          f.type = 'lowpass'; f.frequency.value = lpFreq || def.lp;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t + dur);
          o.connect(f).connect(g).connect(this.music); o.start(t); o.stop(t + dur + 0.03);
        };
        if (s % 2 === 0) note(root * 2, 'triangle', def.vol * 1.5, spb * 1.8);         // bass pulse
        if (station === 3) { if (s % 4 === 0) { note(root * 4, def.wave, def.vol, spb * 1.6); note(root * 6, def.wave, def.vol * 0.8, spb * 1.6); } }
        else if (station === 2) { if (s % 8 === 0) for (const m of [4, 5, 6]) note(root * m, def.wave, def.vol * 0.5, spb * 7); }
        else note(def.arp[s % def.arp.length], def.wave, def.vol, spb * 1.4);          // synthwave arp
        if (station === 1 && s % 4 === 2) note(def.arp[(s * 3) % def.arp.length] * 2, 'sine', def.vol * 0.7, spb);
        r.step++; r.nextTime += spb;
      }
    };
    r.timer = setInterval(tick, 120);
    tick();
  }
}
