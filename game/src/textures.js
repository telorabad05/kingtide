// Procedural textures, painted on canvases at boot: Solmarina has no image
// assets at all. Facades get windows and awnings, shopfronts get neon signs,
// the stadium gets its wrap, and the ground gets asphalt / pavement / sand /
// sea. Everything is drawn once and reused as THREE.CanvasTexture.

import * as THREE from 'three';
import { makeRng, randRange, pick } from './random.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

/** A pastel art-deco facade: rows of windows, some lit, a striped awning line. */
export function facadeTextures(rng, tone) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = hex(tone); g.fillRect(0, 0, 256, 256);
  // subtle vertical shading so flat walls still read as deco slabs
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.10)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  const lit = [];
  const cols = 6, rows = 8;
  for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) {
    const wx = 14 + x * 40, wy = 14 + y * 29, on = rng() < 0.34;
    g.fillStyle = on ? '#ffd98a' : '#33475c';
    g.fillRect(wx, wy, 22, 17);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(wx, wy, 22, 3);
    if (on) lit.push([wx, wy]);
  }
  const map = toTexture(c);
  // emissive twin: black except the lit windows, so towers glow at dusk
  const [ec, eg] = canvas(256, 256);
  eg.fillStyle = '#000'; eg.fillRect(0, 0, 256, 256);
  eg.fillStyle = '#ffb85c';
  for (const [wx, wy] of lit) eg.fillRect(wx, wy, 22, 17);
  const emissive = toTexture(ec);
  return { map, emissive };
}

/** Asphalt with a dashed centre line; repeat along the road's length. */
export function roadTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#3d4148'; g.fillRect(0, 0, 128, 128);
  const rng = makeRng(77);
  for (let i = 0; i < 260; i++) {   // aggregate speckle
    g.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.09)';
    g.fillRect(rng() * 128, rng() * 128, 2, 2);
  }
  g.fillStyle = '#e8e4d2';
  g.fillRect(61, 6, 6, 44);         // one dash per tile
  g.fillStyle = 'rgba(232,228,210,0.5)';
  g.fillRect(2, 0, 3, 128); g.fillRect(123, 0, 3, 128);   // edge lines
  return toTexture(c);
}

/** Pale pavement slabs for sidewalks and the promenade. */
export function pavementTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#b7ab98'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(90,80,66,0.55)'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 128); g.stroke();
    g.beginPath(); g.moveTo(0, i * 32); g.lineTo(128, i * 32); g.stroke();
  }
  const rng = makeRng(31);
  for (let i = 0; i < 120; i++) {
    g.fillStyle = 'rgba(0,0,0,0.05)';
    g.fillRect(rng() * 128, rng() * 128, 3, 3);
  }
  return toTexture(c);
}

export function sandTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#e8d29a'; g.fillRect(0, 0, 128, 128);
  const rng = makeRng(97);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(160,128,70,0.12)' : 'rgba(255,250,230,0.14)';
    g.fillRect(rng() * 128, rng() * 128, 2, 2);
  }
  return toTexture(c);
}

/** Sea surface: layered sine stripes; city.update scrolls its offset. */
export function oceanTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#1b7f9e'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 8; x++) {
    const px = x * 32 + ((y % 2) * 16) + Math.sin(y * 1.7) * 4;
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(px, y * 8 + 3, 18, 2);
  }
  return toTexture(c);
}

/** A neon shop sign: dark board, glowing rounded text. */
export function signTexture(rng, text) {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#1c2430'; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 4;
  g.strokeRect(6, 6, 500, 116);
  const neon = pick(rng, ['#ff5e78', '#22d3ee', '#ffd166', '#7bed9f', '#ff9f43', '#eccc68']);
  g.font = 'bold 58px Georgia, serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = neon; g.shadowBlur = 26;
  g.fillStyle = neon;
  g.fillText(text, 256, 66);
  g.shadowBlur = 0;
  return toTexture(c);
}

/** The Dome's wrap: concrete bands with SOLMARINA lettering and floodlight glare spots. */
export function stadiumTexture() {
  const [c, g] = canvas(1024, 128);
  g.fillStyle = '#9b958a'; g.fillRect(0, 0, 1024, 128);
  g.fillStyle = 'rgba(0,0,0,0.16)';
  for (let x = 0; x < 1024; x += 64) g.fillRect(x, 0, 3, 128);
  g.fillStyle = '#26436b';
  g.font = 'bold 54px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('S O L M A R I N A', 256, 64);
  g.fillText('S O L M A R I N A', 768, 64);
  g.fillStyle = 'rgba(255,246,216,0.5)';
  for (const x of [64, 320, 576, 832]) { g.beginPath(); g.arc(x, 20, 13, 0, 7); g.fill(); }
  return toTexture(c);
}

/** Weathered planks for Lola's Quay. */
export function pierWoodTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#8a6844'; g.fillRect(0, 0, 128, 128);
  const rng = makeRng(53);
  for (let y = 0; y < 8; y++) {
    g.fillStyle = `rgba(0,0,0,${0.05 + rng() * 0.08})`;
    g.fillRect(0, y * 16, 128, 15);
    g.fillStyle = 'rgba(40,26,12,0.8)';
    g.fillRect(0, y * 16 + 15, 128, 1);
    for (let i = 0; i < 7; i++) {   // grain streaks
      g.fillStyle = 'rgba(60,40,18,0.25)';
      g.fillRect(rng() * 128, y * 16 + rng() * 12, 14 + rng() * 22, 1);
    }
  }
  return toTexture(c);
}

/** Striped canvas awning in a given colour, for market stalls and cafes. */
export function awningTexture(colorHex) {
  const [c, g] = canvas(128, 64);
  for (let x = 0; x < 8; x++) {
    g.fillStyle = x % 2 ? '#f4efe4' : hex(colorHex);
    g.fillRect(x * 16, 0, 16, 64);
  }
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 52, 128, 12);
  return toTexture(c);
}

/** A billboard face: bold headline over a smaller line, sunset gradient. */
export function billboardTexture(rng, head, sub) {
  const [c, g] = canvas(512, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#ff9a5c'); grad.addColorStop(1, '#c93b6e');
  g.fillStyle = grad; g.fillRect(0, 0, 512, 256);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.font = 'bold 62px Georgia, serif'; g.textAlign = 'center';
  g.fillText(head, 256, 116);
  g.font = 'bold 34px Georgia, serif';
  g.fillStyle = '#ffe9a8';
  g.fillText(sub, 256, 178);
  return toTexture(c);
}

/** Soft round sprite used for smoke puffs and the wreck-fire glow. */
export function puffTexture() {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return toTexture(c);
}

/** A single palm frond leaflet strip with alpha cut-out gaps. */
export function palmLeafTexture() {
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = '#2e7d32';
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(64, 128); g.lineTo(64, 6); g.stroke();
  g.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    const y = 14 + i * 9, len = 44 - Math.abs(i - 5) * 4;
    g.beginPath(); g.moveTo(64, y); g.lineTo(64 - len, y + 12); g.stroke();
    g.beginPath(); g.moveTo(64, y); g.lineTo(64 + len, y + 12); g.stroke();
  }
  const tex = toTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
