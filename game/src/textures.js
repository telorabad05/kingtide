// Every texture in Vice Harbor is painted on a canvas at boot: art-deco facades with
// lit windows, asphalt with lane dashes, palm fronds, sand and sea. No image files.
import * as THREE from 'three';
import { makeRng, pick, randRange } from './random.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A pastel facade: rows of windows, some shaded, a cornice and a shopfront band. */
export function facadeTextures(rng, toneHex) {
  const w = 128, h = 256, c = canvas(w, h), g = c.getContext('2d');
  const tone = `#${toneHex.toString(16).padStart(6, '0')}`;
  g.fillStyle = tone; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, 0, w, 10);            // cornice shadow
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 10, w, 4);
  const cols = 4, rows = 9, lit = [];
  for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
    const x = 10 + col * 30, y = 24 + r * 22;
    const isLit = rng() < 0.34;
    lit.push({ x, y, isLit });
    g.fillStyle = isLit ? '#ffd76a' : 'rgba(38,52,66,0.85)';
    g.fillRect(x, y, 18, 13);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x, y, 18, 3);
    if (rng() < 0.4) { g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x - 2, y + 14, 22, 3); } // balcony lip
  }
  g.fillStyle = 'rgba(30,30,36,0.9)'; g.fillRect(0, h - 30, w, 30);      // shopfront
  const neon = pick(rng, ['#ff5e78', '#22c1a3', '#ffb020', '#4aa8ff', '#c86bff']);
  g.fillStyle = neon;
  g.fillRect(0, h - 34, w, 5);                                            // neon strip
  // a striped canvas awning over the shopfront, alternating the neon colour
  // with sun-bleached cream — the deco storefronts all wear one (v3.1)
  for (let x = 0; x < w; x += 16) {
    g.fillStyle = (x / 16) % 2 ? 'rgba(242,234,216,0.95)' : neon;
    g.globalAlpha = 0.9; g.fillRect(x, h - 30, 16, 7); g.globalAlpha = 1;
  }
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, h - 23, w, 2);          // the awning's shadow line
  for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(160,220,255,0.75)'; g.fillRect(8 + i * 42, h - 26, 32, 18); }
  const e = canvas(w, h), eg = e.getContext('2d');
  eg.fillStyle = '#000'; eg.fillRect(0, 0, w, h);
  for (const win of lit) if (win.isLit) { eg.fillStyle = '#ffbe4a'; eg.fillRect(win.x, win.y, 18, 13); }
  eg.fillStyle = '#ff5e78'; eg.fillRect(0, h - 34, w, 3);
  return { map: tex(c), emissive: tex(e) };
}

/** Asphalt strip with a dashed centre line, drawn along its length. */
export function roadTexture() {
  const c = canvas(64, 128), g = c.getContext('2d');
  g.fillStyle = '#33373d'; g.fillRect(0, 0, 64, 128);
  const rng = makeRng(77);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${rng() * 0.05})`; g.fillRect(rng() * 64, rng() * 128, 2, 2); }
  // years of Solmarina sun and patching: dark tar seams and one iron manhole
  // per tile, so a long boulevard reads as a real street and not a ribbon (v3.1)
  g.strokeStyle = 'rgba(12,13,16,0.5)'; g.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    let x = rng() * 64, y = rng() * 40;
    g.moveTo(x, y);
    for (let s = 0; s < 3; s++) { x += randRange(rng, -14, 14); y += randRange(rng, 12, 26); g.lineTo(x, Math.min(y, 126)); }
    g.stroke();
  }
  g.fillStyle = 'rgba(16,17,20,0.85)';
  g.beginPath(); g.arc(48, 100, 6, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(190,195,200,0.4)'; g.lineWidth = 1.4;
  g.beginPath(); g.arc(48, 100, 6, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(48, 100, 2.6, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#e8e4da'; g.fillRect(2, 0, 2, 128); g.fillRect(60, 0, 2, 128);   // edge lines
  g.fillStyle = '#f7c948'; g.fillRect(30, 8, 4, 44); g.fillRect(30, 76, 4, 44);   // dashes
  return tex(c);
}

/** Warm pavement slabs for sidewalks and the promenade. */
export function pavementTexture() {
  const c = canvas(64, 64), g = c.getContext('2d');
  g.fillStyle = '#b8ab98'; g.fillRect(0, 0, 64, 64);
  const rng = makeRng(31);
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(90,70,40,${rng() * 0.08})`; g.fillRect(rng() * 64, rng() * 64, 2, 2); }
  g.strokeStyle = 'rgba(80,66,48,0.55)'; g.strokeRect(0.5, 0.5, 63, 63);
  return tex(c);
}

export function sandTexture() {
  const c = canvas(64, 64), g = c.getContext('2d');
  g.fillStyle = '#e8cf9f'; g.fillRect(0, 0, 64, 64);
  const rng = makeRng(97);
  for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(160,120,60,${rng() * 0.12})`; g.fillRect(rng() * 64, rng() * 64, 2, 1); }
  return tex(c);
}

/** Soft light blobs on water; the offset scrolls so the sea seems to move. */
export function oceanTexture() {
  const c = canvas(128, 128), g = c.getContext('2d');
  g.fillStyle = '#14707e'; g.fillRect(0, 0, 128, 128);
  const rng = makeRng(53);
  for (let i = 0; i < 46; i++) {
    g.fillStyle = `rgba(190,240,235,${0.05 + rng() * 0.1})`;
    g.beginPath(); g.ellipse(rng() * 128, rng() * 128, 8 + rng() * 22, 2 + rng() * 3, 0, 0, Math.PI * 2); g.fill();
  }
  return tex(c, 10, 10);
}

/** One palm frond: a rib with solid filled leaflets, so alphaTest keeps a full leaf shape. */
export function palmLeafTexture() {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = '#1f7a44'; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.moveTo(128, 252); g.quadraticCurveTo(120, 130, 128, 10); g.stroke();
  for (let i = 0; i < 20; i++) {
    const y = 236 - i * 11, len = 26 + i * 5.2, droop = 16 + i * 2.4, wdt = 5.5 - i * 0.12;
    for (const side of [-1, 1]) {
      g.fillStyle = i % 2 ? '#2f9e5f' : '#35b06a';
      g.beginPath();
      g.moveTo(128, y);
      g.quadraticCurveTo(128 + side * len * 0.55, y - wdt * 1.6, 128 + side * len, y + droop);
      g.quadraticCurveTo(128 + side * len * 0.5, y + wdt * 0.9, 128, y + wdt);
      g.closePath(); g.fill();
    }
  }
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** A glowing shop sign with the shop's name, as a sprite texture. */
export function signTexture(rng, text) {
  const c = canvas(256, 64), g = c.getContext('2d');
  g.fillStyle = 'rgba(16,14,26,0.92)'; g.fillRect(0, 0, 256, 64);
  const color = pick(rng, ['#ff5e78', '#22e6c8', '#ffb020', '#4aa8ff', '#ff8b3d', '#c86bff']);
  g.strokeStyle = color; g.lineWidth = 3; g.strokeRect(3, 3, 250, 58);
  g.fillStyle = color; g.font = 'bold 30px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 12;
  g.fillText(text, 128, 34);
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** A soft smoke puff for the wreck effect: overlapping radial blobs with a
 *  ragged alpha edge, drawn once and reused by every sprite in the plume. */
export function smokeTexture() {
  const c = canvas(128, 128), g = c.getContext('2d');
  const rng = makeRng(4242);
  g.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 26; i++) {
    const x = 64 + randRange(rng, -26, 26), y = 64 + randRange(rng, -26, 26);
    const r = randRange(rng, 14, 34);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.16)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Weathered wooden planks for the marina pier deck, running along its length. */
export function pierWoodTexture() {
  const c = canvas(128, 128), g = c.getContext('2d');
  const rng = makeRng(1234);
  g.fillStyle = '#8a6844'; g.fillRect(0, 0, 128, 128);
  for (let p = 0; p < 4; p++) {
    const y = p * 32;
    g.fillStyle = `rgba(${60 + rng() * 30},${40 + rng() * 22},18,${0.12 + rng() * 0.15})`;
    g.fillRect(0, y, 128, 32);
    g.fillStyle = 'rgba(30,18,8,0.85)'; g.fillRect(0, y, 128, 2.5);
    for (let i = 0; i < 26; i++) { // grain streaks
      g.fillStyle = `rgba(52,34,14,${0.1 + rng() * 0.16})`;
      g.fillRect(rng() * 128, y + 4 + rng() * 24, 8 + rng() * 30, 1.4);
    }
    g.fillStyle = 'rgba(20,14,8,0.9)';
    g.beginPath(); g.arc(8, y + 16, 2.2, 0, Math.PI * 2); g.arc(120, y + 16, 2.2, 0, Math.PI * 2); g.fill(); // bolt heads
  }
  return tex(c, 2, 6);
}

/** A big roadside billboard: sunset gradient, a palm silhouette and a bold slogan. */
export function billboardTexture(rng, headline, sub) {
  const c = canvas(512, 256), g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2b1055'); grad.addColorStop(0.55, '#b23a6d'); grad.addColorStop(1, '#ff9a3d');
  g.fillStyle = grad; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#ffd76a'; g.beginPath(); g.arc(430, 66, 34, 0, Math.PI * 2); g.fill();   // the sun
  g.fillStyle = '#160b26';                                                              // palm silhouette
  g.fillRect(52, 130, 9, 96);
  for (let i = 0; i < 6; i++) {
    const a = -0.4 - i * 0.42;
    g.beginPath(); g.ellipse(56 + Math.cos(a) * 42, 128 + Math.sin(a) * 26, 46, 9, a, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = 'rgba(10,6,20,0.88)'; g.fillRect(0, 196, 512, 60);                       // sea-line band
  g.fillStyle = '#ffffff'; g.font = 'bold 44px Georgia, serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 8;
  g.fillText(headline, 26, 92);
  g.font = 'bold 27px Verdana, sans-serif'; g.fillStyle = '#ffd76a';
  g.fillText(sub, 26, 148);
  g.font = '16px Verdana, sans-serif'; g.fillStyle = '#e8ecf1';
  g.fillText('★ SOLMARINA ★', 26, 226);
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Striped canvas for the fish-market stall awnings on the quay. */
export function awningTexture(colorHex) {
  const c = canvas(64, 64), g = c.getContext('2d');
  const color = `#${colorHex.toString(16).padStart(6, '0')}`;
  g.fillStyle = '#f2ead8'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = color; for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 8, 64);
  g.fillStyle = 'rgba(90,60,20,0.12)'; for (let y = 8; y < 64; y += 16) g.fillRect(0, y, 64, 2);
  return tex(c, 3, 1);
}

/** The Dome's outer wall: concrete panels, a teal band and turnstile shadows. */
export function stadiumTexture() {
  const c = canvas(256, 128), g = c.getContext('2d');
  const rng = makeRng(2026);
  g.fillStyle = '#cfc8ba'; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(90,80,60,${rng() * 0.07})`; g.fillRect(rng() * 256, rng() * 128, 2, 2); }
  g.fillStyle = '#14707e'; g.fillRect(0, 26, 256, 20);                                    // teal band
  g.fillStyle = '#ffd76a'; g.fillRect(0, 46, 256, 4);
  g.fillStyle = 'rgba(255,255,255,0.92)'; g.font = 'bold 21px Verdana, sans-serif'; g.textAlign = 'center';
  g.fillText('S O L M A R I N A   D O M E', 128, 42);
  g.strokeStyle = 'rgba(80,70,55,0.5)'; g.lineWidth = 2;
  for (let x = 0; x <= 256; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }  // panel seams
  for (let x = 16; x < 256; x += 32) { g.fillStyle = 'rgba(24,28,36,0.85)'; g.fillRect(x - 7, 96, 14, 32); } // gates
  return tex(c, 6, 1);
}
