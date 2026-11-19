// Sound from oscillators and noise only: a two-stroke engine note that follows
// the throttle, a two-tone siren that swells as Harbor PD closes in (and muffles
// with distance, like a real siren heard streets away — v3.1 bends its pitch
// with the approach speed, a poor synth's doppler), traffic horns, a foghorn
// for the marina boats, and one-shot blips for cash, checkpoints, crashes and
// trouble. Starts on the first click, as browsers require.

export class AudioSys {
  constructor() {
    this.ctx = null; this.started = false;
  }
  start() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(ctx.destination);
      // engine: saw + sub sine through a lowpass
      this.engineOsc = ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
      this.engineSub = ctx.createOscillator(); this.engineSub.type = 'sine'; this.engineSub.frequency.value = 28;
      this.engineFilter = ctx.createBiquadFilter(); this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 300;
      this.engineGain = ctx.createGain(); this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter); this.engineSub.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start(); this.engineSub.start();
      // siren: triangle wave swept between two tones, through a lowpass whose
      // cutoff collapses with distance — near is piercing, far is a dull wail
      this.sirenOsc = ctx.createOscillator(); this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 800;
      this.sirenFilter = ctx.createBiquadFilter(); this.sirenFilter.type = 'lowpass'; this.sirenFilter.frequency.value = 2400;
      this.sirenGain = ctx.createGain(); this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenFilter); this.sirenFilter.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      // the helicopter (v3): looped noise through a bandpass — the rotor's
      // thump is the update() chopping its gain at blade rate
      this.rotorSrc = ctx.createBufferSource(); this.rotorSrc.buffer = this.noiseBuf; this.rotorSrc.loop = true;
      this.rotorFilter = ctx.createBiquadFilter(); this.rotorFilter.type = 'bandpass'; this.rotorFilter.frequency.value = 240; this.rotorFilter.Q.value = 0.8;
      this.rotorGain = ctx.createGain(); this.rotorGain.gain.value = 0;
      this.rotorSrc.connect(this.rotorFilter); this.rotorFilter.connect(this.rotorGain); this.rotorGain.connect(this.master);
      this.rotorSrc.start();
      this.started = true;
      this.t = 0;
      this.lastCopDist = Infinity;   // for the siren's doppler bend
    } catch { /* no audio: the game plays on silently */ }
  }
  update(dt, { inCar, speedRatio, throttle, copDist, wanted, heliDist = Infinity }) {
    if (!this.started) return;
    this.t += dt;
    const eg = inCar ? 0.05 + Math.abs(speedRatio) * 0.075 + Math.abs(throttle) * 0.02 : 0;
    this.engineGain.gain.setTargetAtTime(eg, this.ctx.currentTime, 0.08);
    const f = 52 + Math.abs(speedRatio) * 130 + Math.abs(throttle) * 18;
    this.engineOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.06);
    this.engineSub.frequency.setTargetAtTime(f / 2, this.ctx.currentTime, 0.06);
    this.engineFilter.frequency.setTargetAtTime(240 + Math.abs(speedRatio) * 700, this.ctx.currentTime, 0.1);
    let sg = 0;
    if (wanted > 0 && copDist < 90) sg = 0.028 * (1 - copDist / 90) + 0.006;
    this.sirenGain.gain.setTargetAtTime(sg, this.ctx.currentTime, 0.15);
    if (sg > 0) {
      // doppler (v3.1): a closing siren rides sharp, a receding one falls
      // flat — the bend follows how fast the gap is changing, clamped sane
      const closing = Number.isFinite(this.lastCopDist) ? this.lastCopDist - copDist : 0;
      const doppler = Math.max(0.93, Math.min(1.07, 1 + closing * 0.012));
      this.sirenOsc.frequency.setTargetAtTime((Math.sin(this.t * 4.4) > 0 ? 950 : 720) * doppler, this.ctx.currentTime, 0.03);
      const closeness = Math.max(0, 1 - Math.min(copDist, 90) / 90);
      this.sirenFilter.frequency.setTargetAtTime(500 + closeness * 2100, this.ctx.currentTime, 0.2);
    }
    if (Number.isFinite(copDist)) this.lastCopDist = copDist;
    // rotor wash: audible once the air unit is up and within earshot, chopped
    // at ~11 Hz so it thumps instead of hissing
    let rg = 0;
    if (heliDist < 130) rg = (0.05 * (1 - heliDist / 130) + 0.008) * (0.72 + 0.28 * Math.sin(this.t * 69));
    this.rotorGain.gain.setTargetAtTime(Math.max(0, rg), this.ctx.currentTime, 0.03);
  }
  blip(kind, strength = 1) {
    if (!this.started) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const tone = (freq, dur, type = 'sine', vol = 0.12, when = 0) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t + when); g.gain.exponentialRampToValueAtTime(0.001, t + when + dur);
      o.connect(g); g.connect(this.master); o.start(t + when); o.stop(t + when + dur + 0.02);
    };
    if (kind === 'cash') { tone(880, 0.12, 'square', 0.07); tone(1318, 0.22, 'square', 0.07, 0.09); }
    else if (kind === 'garage') { tone(392, 0.13, 'square', 0.07); tone(523, 0.2, 'square', 0.07, 0.1); }   // keys, a shutter, home
    else if (kind === 'checkpoint') { tone(1046, 0.14, 'sine', 0.12); tone(1568, 0.2, 'sine', 0.1, 0.08); }
    else if (kind === 'alarm') { tone(1244, 0.1, 'square', 0.06); tone(1244, 0.1, 'square', 0.06, 0.16); tone(1244, 0.1, 'square', 0.06, 0.32); }
    else if (kind === 'sting') { tone(392, 0.3, 'sawtooth', 0.1); tone(311, 0.42, 'sawtooth', 0.1, 0.16); }
    else if (kind === 'horn') {
      // a proper two-tone car horn: twin reeds a third apart, hard attack, strength is loudness
      const vol = 0.085 * Math.max(0.1, Math.min(1, strength));
      tone(392, 0.34, 'sawtooth', vol); tone(494, 0.34, 'sawtooth', vol * 0.9);
      tone(196, 0.3, 'square', vol * 0.4);
    }
    else if (kind === 'boathorn') {
      // a marina foghorn (v3.1): one long low blast, fundamental plus fifth,
      // soft-edged — strength is how close the boat is, so distance fades it
      const vol = 0.11 * Math.max(0.1, Math.min(1, strength));
      tone(98, 1.15, 'triangle', vol); tone(147, 1.05, 'triangle', vol * 0.55);
      tone(196, 0.9, 'sine', vol * 0.3);
    }
    else if (kind === 'crash') {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const g = ctx.createGain(); const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 420;
      g.gain.setValueAtTime(0.3 * strength, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      src.connect(flt); flt.connect(g); g.connect(this.master); src.start(t); src.stop(t + 0.32);
      if (strength > 0.75) tone(72, 0.22, 'sine', 0.22 * strength);   // a heavy hit gets a body thump under the crunch
    }
  }
}
