// Solmarina: a procedural coastal city. A grid of avenues and boulevards, pastel
// art-deco blocks, palm-lined sidewalks, a promenade, a beach and the sea. Also
// exports the lane graph the traffic drives on, the sidewalk loops pedestrians
// walk, parked-car spots and the building colliders everything bumps into.
import * as THREE from 'three';
import { CITY, PALETTE, TUNING } from './config.js';
import { makeRng, randRange, randInt, pick, angleLerp, randSign } from './random.js';
import { facadeTextures, roadTexture, pavementTexture, sandTexture, oceanTexture, palmLeafTexture, signTexture, pierWoodTexture, billboardTexture, awningTexture, stadiumTexture } from './textures.js';

const SHOP_NAMES = ['CAFE SOL', 'HOTEL MARINA', 'PALM RECORDS', 'TACO BRAVO', 'HOTEL AZUL', 'SURF SHOP', 'BAR LOLA', 'DINER 24H', 'CINEMA REX', 'GYM FLEX', 'PAWN & CO', 'CLUB NEON', "LOLA'S DEPOT", 'BAIT & TACKLE', 'HOTEL CORAL'];

function mergeGeoms(parts) {
  // parts: [{geom, matrix}] — concatenate into one BufferGeometry (positions/normals/uvs/index).
  let vCount = 0, iCount = 0;
  for (const p of parts) { vCount += p.geom.attributes.position.count; iCount += p.geom.index.count; }
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
  const idx = new (vCount > 65535 ? Uint32Array : Uint16Array)(iCount);
  let vo = 0, io = 0;
  const v = new THREE.Vector3(), n = new THREE.Matrix3();
  for (const p of parts) {
    const g = p.geom, m = p.matrix; n.getNormalMatrix(m);
    for (let i = 0; i < g.attributes.position.count; i++) {
      v.fromBufferAttribute(g.attributes.position, i).applyMatrix4(m);
      pos.set([v.x, v.y, v.z], (vo + i) * 3);
      v.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(n).normalize();
      nor.set([v.x, v.y, v.z], (vo + i) * 3);
      uv.set([g.attributes.uv.getX(i), g.attributes.uv.getY(i)], (vo + i) * 2);
    }
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo;
    vo += g.attributes.position.count; io += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function frondStarGeometry(leafTex) {
  const parts = [];
  for (let k = 0; k < 7; k++) {
    const plane = new THREE.PlaneGeometry(1.7, 4.3, 1, 3);
    // bend the frond downward along its length
    const p = plane.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, -Math.pow((y + 2.15) / 4.3, 2) * 1.1); }
    plane.computeVertexNormals();
    const m = new THREE.Matrix4()
      .makeRotationY((k / 7) * Math.PI * 2)
      .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2 + 0.5))
      .multiply(new THREE.Matrix4().makeTranslation(0, 1.95, 0));
    parts.push({ geom: plane, matrix: m });
  }
  return mergeGeoms(parts);
}

/** Build the whole city into `scene`. Returns the data the other systems drive on. */
export function buildCity(scene) {
  const rng = makeRng(20261117);
  const colliders = [];
  const group = new THREE.Group(); scene.add(group);

  // --- sky, sea, sand, ground -------------------------------------------------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(PALETTE.sky) }, mid: { value: new THREE.Color(0x7ec8e3) }, bot: { value: new THREE.Color(PALETTE.horizon) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;' +
      'void main(){ float h = normalize(vP).y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.65, h)) : mix(bot, mid, smoothstep(-0.08, 0.12, h));' +
      ' gl_FragColor = vec4(c, 1.0); }',
  }));
  group.add(sky);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500), new THREE.MeshStandardMaterial({ color: 0xa79b85, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, 120); ground.receiveShadow = true; group.add(ground);

  const oceanTex = oceanTexture();
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(1500, 700), new THREE.MeshPhongMaterial({ map: oceanTex, color: 0x9fd8dd, shininess: 90, specular: 0x99ddff }));
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, 0.02, CITY.oceanZ + 330); group.add(ocean);

  const sand = new THREE.Mesh(new THREE.PlaneGeometry(1500, CITY.oceanZ - CITY.beachZ + 6), new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 1 }));
  sand.material.map.repeat.set(40, 2);
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.03, (CITY.beachZ + CITY.oceanZ) / 2); sand.receiveShadow = true; group.add(sand);

  // --- roads ------------------------------------------------------------------
  // The road texture runs along V: every road is a 16-wide plane whose length is
  // its V axis (geometry rotated flat, then turned for the boulevards), repeated
  // once per 16 m so the dashes stay dash-sized.
  const plainAsphalt = new THREE.MeshStandardMaterial({ color: PALETTE.asphalt, roughness: 0.95 });
  function roadStrip(len, alongX, cx, cz) {
    const t = roadTexture(); t.repeat.set(1, len / 16);
    const geo = new THREE.PlaneGeometry(CITY.roadHalf * 2, len);
    geo.rotateX(-Math.PI / 2);
    if (alongX) geo.rotateY(Math.PI / 2);
    const road = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
    road.position.set(cx, 0.06, cz);
    road.receiveShadow = true; group.add(road);
  }
  const roadLen = CITY.extentX * 2 + 120;
  for (const zc of CITY.boulevardsZ) roadStrip(roadLen, true, 0, zc);
  for (const xc of CITY.avenuesX) {
    const len = CITY.beachZ + CITY.extentZ + 60;
    roadStrip(len, false, xc, (CITY.beachZ - CITY.extentZ) / 2 - 10);
    for (const zc of CITY.boulevardsZ) {
      const sq = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadHalf * 2, CITY.roadHalf * 2), plainAsphalt);
      sq.rotation.x = -Math.PI / 2; sq.position.set(xc, 0.07, zc); sq.receiveShadow = true; group.add(sq);
    }
  }

  // --- blocks: sidewalks, buildings, signs ------------------------------------
  const paveTex = pavementTexture();
  const paveMat = new THREE.MeshStandardMaterial({ map: paveTex, roughness: 1 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x6e5a4e, roughness: 1 });
  const facadeSets = PALETTE.buildingTones.map((tone) => {
    const f = facadeTextures(rng, tone);
    const mat = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissive, emissive: 0xffc37a, emissiveIntensity: 0.85, roughness: 0.9 });
    return mat;
  });
  const signMats = SHOP_NAMES.map((name) => new THREE.MeshBasicMaterial({ map: signTexture(rng, name) }));
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const parkBlock = { xi: 2, zi: 1 };      // between avenues -40..40, boulevards -80..0
  const lotBlock = { xi: 3, zi: 3 };       // parking lot block, avenues 40..120, boulevards 80..160
  const stadiumBlock = { xi: 4, zi: 0 };   // the Solmarina Dome, avenues 120..200, boulevards -160..-80
  const sidewalkLoops = [];
  const blinkMats = [];                    // spire beacons the update() pulses
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x9b958a, roughness: 1 });

  for (let xi = 0; xi < CITY.avenuesX.length - 1; xi++) {
    for (let zi = 0; zi < CITY.boulevardsZ.length - 1; zi++) {
      const x0 = CITY.avenuesX[xi] + CITY.roadHalf, x1 = CITY.avenuesX[xi + 1] - CITY.roadHalf;
      const z0 = CITY.boulevardsZ[zi] + CITY.roadHalf, z1 = CITY.boulevardsZ[zi + 1] - CITY.roadHalf;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
      const isPark = xi === parkBlock.xi && zi === parkBlock.zi;
      const isLot = xi === lotBlock.xi && zi === lotBlock.zi;
      const isStadium = xi === stadiumBlock.xi && zi === stadiumBlock.zi;
      const slabMat = isPark ? new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 1 }) : isLot ? plainAsphalt : isStadium ? concreteMat : paveMat;
      const slab = new THREE.Mesh(boxGeo, slabMat);
      slab.scale.set(w, 0.24, d); slab.position.set(cx, 0.12, cz); slab.receiveShadow = true; group.add(slab);
      sidewalkLoops.push({ type: 'rect', cx, cz, hw: w / 2 - 1.6, hd: d / 2 - 1.6 });
      if (isPark || isLot) continue;
      if (isStadium) { buildStadium(cx, cz); continue; }
      // lots: 2x2 or 3x2 buildings per block
      const cols = rng() < 0.5 ? 2 : 3, rows = 2;
      const lotW = w / cols, lotD = d / rows;
      const centreBoost = 1 - Math.min(1, Math.hypot(cx, cz) / 320);
      for (let a = 0; a < cols; a++) for (let b = 0; b < rows; b++) {
        if (rng() < 0.08) continue;   // the odd empty lot
        const bw = lotW - randRange(rng, 5, 9), bd = lotD - randRange(rng, 5, 9);
        const bh = randRange(rng, 11, 24) + centreBoost * randRange(rng, 10, 46);   // a taller downtown core in v2
        const bx = x0 + lotW * (a + 0.5), bz = z0 + lotD * (b + 0.5);
        const mat = pick(rng, facadeSets);
        const mesh = new THREE.Mesh(boxGeo, [mat, mat, roofMat, roofMat, mat, mat]);
        mesh.scale.set(bw, bh, bd); mesh.position.set(bx, 0.24 + bh / 2, bz);
        mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
        colliders.push({ minX: bx - bw / 2, maxX: bx + bw / 2, minZ: bz - bd / 2, maxZ: bz + bd / 2 });
        // rooftop clutter
        if (rng() < 0.6) {
          const ac = new THREE.Mesh(boxGeo, roofMat);
          ac.scale.set(randRange(rng, 2, 4), 1.1, randRange(rng, 2, 4));
          ac.position.set(bx + randRange(rng, -bw / 4, bw / 4), 0.24 + bh + 0.55, bz + randRange(rng, -bd / 4, bd / 4));
          ac.castShadow = true; group.add(ac);
        }
        // the tallest downtown towers wear a spire with a blinking aviation beacon
        if (bh > 40 && rng() < 0.55) {
          const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.5, 6.5, 6), roofMat);
          spire.position.set(bx, 0.24 + bh + 3.2, bz); spire.castShadow = true; group.add(spire);
          const beaconMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2a2a, emissiveIntensity: 2 });
          const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), beaconMat);
          beacon.position.set(bx, 0.24 + bh + 6.6, bz); group.add(beacon);
          blinkMats.push(beaconMat);
        }
        // a neon shop sign on the street-facing side of some ground floors
        if (rng() < 0.42) {
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), pick(rng, signMats));
          const south = bz > cz;
          sign.position.set(bx, 3.4, south ? bz + bd / 2 + 0.06 : bz - bd / 2 - 0.06);
          if (!south) sign.rotation.y = Math.PI;
          group.add(sign);
        }
      }
    }
  }
  sidewalkLoops.push({ type: 'line', x1: -CITY.extentX, z1: 173, x2: CITY.extentX, z2: 173 });   // the Ocean Drive strip
  sidewalkLoops.push({ type: 'line', x1: -CITY.extentX, z1: 186, x2: CITY.extentX, z2: 186 });   // promenade
  sidewalkLoops.push({ type: 'line', x1: -CITY.extentX, z1: 214, x2: CITY.extentX, z2: 214 });   // beach
  sidewalkLoops.push({ type: 'line', x1: 192, z1: 236, x2: 192, z2: 298 });                     // down Lola's Quay and back (v3)

  // promenade boardwalk, plus the paved strip between Ocean Drive and the boardwalk
  const walk = new THREE.Mesh(boxGeo, paveMat);
  walk.scale.set(CITY.extentX * 2 + 60, 0.22, 16); walk.position.set(0, 0.11, 186); walk.receiveShadow = true; group.add(walk);
  const strip = new THREE.Mesh(boxGeo, paveMat);
  strip.scale.set(CITY.extentX * 2 + 60, 0.2, 10); strip.position.set(0, 0.1, 173); strip.receiveShadow = true; group.add(strip);

  // --- palms, lamps, umbrellas (instanced) --------------------------------------
  const leafTex = palmLeafTexture();
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 5.4, 6, 4);
  { const p = trunkGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + Math.pow((y + 2.7) / 5.4, 2) * 0.9); } trunkGeo.computeVertexNormals(); }
  const frondGeo = frondStarGeometry(leafTex);
  const palmSpots = [];
  const palmAt = (x, z) => palmSpots.push({ x, z, rot: rng() * Math.PI * 2, s: randRange(rng, 0.85, 1.3) });
  for (const zc of CITY.boulevardsZ) for (let x = -CITY.extentX + 12; x < CITY.extentX; x += 26) { palmAt(x + randRange(rng, -3, 3), zc - CITY.roadHalf - 1.6); palmAt(x + 13, zc + CITY.roadHalf + 1.6); }
  for (let x = -CITY.extentX + 8; x < CITY.extentX; x += 17) palmAt(x, 176.5);
  for (let x = -CITY.extentX + 20; x < CITY.extentX; x += 34) palmAt(x + randRange(rng, -5, 5), randRange(rng, 202, 226));
  for (let i = 0; i < 16; i++) palmAt(randRange(rng, -34, 34), randRange(rng, -74, -6));   // the park
  const trunkInst = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x8a6844, roughness: 1 }), palmSpots.length);
  const frondInst = new THREE.InstancedMesh(frondGeo, new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 }), palmSpots.length);
  const dummy = new THREE.Object3D();
  palmSpots.forEach((p, i) => {
    dummy.position.set(p.x, 2.7 * p.s + 0.2, p.z); dummy.rotation.set(0, p.rot, 0); dummy.scale.setScalar(p.s); dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);
    dummy.position.y = (2.7 + 2.55) * p.s + 0.2; dummy.updateMatrix();
    frondInst.setMatrixAt(i, dummy.matrix);
    colliders.push({ minX: p.x - 0.4, maxX: p.x + 0.4, minZ: p.z - 0.4, maxZ: p.z + 0.4 });
  });
  trunkInst.castShadow = true; frondInst.castShadow = true;
  group.add(trunkInst, frondInst);

  const lampPos = [];
  for (const zc of CITY.boulevardsZ) for (let x = -CITY.extentX + 20; x < CITY.extentX; x += 40) lampPos.push([x, zc + CITY.roadHalf + 1]);
  for (const xc of CITY.avenuesX) for (let z = -CITY.extentZ + 20; z < 170; z += 40) lampPos.push([xc + CITY.roadHalf + 1, z]);
  const poleInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.12, 5.6, 5), new THREE.MeshStandardMaterial({ color: 0x3c4450, roughness: 0.7, metalness: 0.5 }), lampPos.length);
  const headInst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffca7a, emissiveIntensity: 1.6 }), lampPos.length);
  lampPos.forEach(([x, z], i) => {
    dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
    dummy.position.set(x, 2.8, z); dummy.updateMatrix(); poleInst.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 5.7; dummy.updateMatrix(); headInst.setMatrixAt(i, dummy.matrix);
  });
  group.add(poleInst, headInst);

  const umbGeo = mergeGeoms([
    { geom: new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5), matrix: new THREE.Matrix4().makeTranslation(0, 1.3, 0) },
    { geom: new THREE.ConeGeometry(1.9, 0.8, 8), matrix: new THREE.Matrix4().makeTranslation(0, 2.7, 0) },
  ]);
  const umbInst = new THREE.InstancedMesh(umbGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), 26);
  const umbColors = [0xff5e78, 0x22c1a3, 0xffb020, 0x4aa8ff, 0xff8b3d];
  for (let i = 0; i < 26; i++) {
    dummy.position.set(randRange(rng, -CITY.extentX + 16, CITY.extentX - 16), 0.1, randRange(rng, 204, 228));
    dummy.rotation.set(0, rng() * 3, 0); dummy.scale.setScalar(randRange(rng, 0.9, 1.25)); dummy.updateMatrix();
    umbInst.setMatrixAt(i, dummy.matrix);
    umbInst.setColorAt(i, new THREE.Color(pick(rng, umbColors)));
  }
  umbInst.castShadow = true; group.add(umbInst);

  // --- the Solmarina Dome -------------------------------------------------------
  function buildStadium(cx, cz) {
    const R = CITY.stadium.r;
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R + 2, 11, 28, 1, true),
      new THREE.MeshStandardMaterial({ map: stadiumTexture(), roughness: 0.95, side: THREE.DoubleSide }),
    );
    wall.position.set(cx, 0.24 + 5.5, cz); wall.castShadow = true; wall.receiveShadow = true; group.add(wall);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.6, R + 1.6, 1.1, 28), concreteMat);
    rim.position.set(cx, 0.24 + 11.4, cz); rim.castShadow = true; group.add(rim);
    const pitch = new THREE.Mesh(new THREE.CircleGeometry(R - 3, 28), new THREE.MeshStandardMaterial({ color: 0x4d8a3d, roughness: 1 }));
    pitch.rotation.x = -Math.PI / 2; pitch.position.set(cx, 0.42, cz); group.add(pitch);
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.6, (R - 4) * 2), new THREE.MeshStandardMaterial({ color: 0xe8ecf1, roughness: 1 }));
    stripe.rotation.x = -Math.PI / 2; stripe.position.set(cx, 0.44, cz); group.add(stripe);
    // four floodlight pylons with hot heads
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x3c4450, roughness: 0.6, metalness: 0.6 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffeebb, emissiveIntensity: 2.2 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const px = cx + sx * (R + 3.5), pz = cz + sz * (R + 3.5);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 17, 6), pylonMat);
      pole.position.set(px, 8.5, pz); pole.castShadow = true; group.add(pole);
      const head = new THREE.Mesh(boxGeo, headMat);
      head.scale.set(2.6, 1.4, 0.5); head.position.set(px, 17.2, pz); head.lookAt(cx, 10, cz); group.add(head);
    }
    const nameSign = new THREE.Mesh(new THREE.PlaneGeometry(17, 4.2), new THREE.MeshBasicMaterial({ map: signTexture(rng, 'SOLMARINA DOME') }));
    nameSign.position.set(cx, 8.6, cz + R + 2.15); group.add(nameSign);
    // the ring reads as sixteen AABB colliders (v3): at eight boxes the points
    // midway between neighbours — the 22.5° diagonals — sat outside every box,
    // leaving eight gaps cars and feet slipped through; sixteen overlap shut
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, bx = cx + Math.sin(a) * R, bz = cz + Math.cos(a) * R;
      colliders.push({ minX: bx - 6, maxX: bx + 6, minZ: bz - 6, maxZ: bz + 6 });
    }
  }

  // --- Lola's Quay: the marina pier, its boats and the lighthouse ----------------
  const boats = [];
  const lampLightMat = new THREE.MeshStandardMaterial({ color: 0x443300, emissive: 0xffc37a, emissiveIntensity: 0.6 });
  {
    const P = CITY.pier;
    const deck = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ map: pierWoodTexture(), roughness: 0.95 }));
    deck.scale.set(P.maxX - P.minX, 0.5, P.maxZ - P.minZ);
    deck.position.set((P.minX + P.maxX) / 2, P.deckTop - 0.25, (P.minZ + P.maxZ) / 2);
    deck.receiveShadow = true; deck.castShadow = true; group.add(deck);
    // mooring posts down both edges, and slim rails so nobody drives off the side
    const postMat = new THREE.MeshStandardMaterial({ color: 0x5e4630, roughness: 1 });
    for (let z = P.minZ + 4; z < P.maxZ; z += 9) for (const x of [P.minX + 1, P.maxX - 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.6, 6), postMat);
      post.position.set(x, 0.6, z); post.castShadow = true; group.add(post);
    }
    colliders.push({ minX: P.minX - 4.5, maxX: P.minX + 0.4, minZ: P.minZ, maxZ: P.maxZ });
    colliders.push({ minX: P.maxX - 0.4, maxX: P.maxX + 4.5, minZ: P.minZ, maxZ: P.maxZ });
    // two fish-market stalls at the shore end of the quay
    for (const [sx, awn] of [[P.minX + 5, 0xd64541], [P.maxX - 5, 0x22c1a3]]) {
      const stall = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xe8ddc4, roughness: 0.9 }));
      stall.scale.set(4.4, 2.3, 3); stall.position.set(sx, 1.4, P.minZ + 4); stall.castShadow = true; group.add(stall);
      const roof = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ map: awningTexture(awn), roughness: 0.9 }));
      roof.scale.set(5.2, 0.18, 3.8); roof.position.set(sx, 2.75, P.minZ + 4); roof.castShadow = true; group.add(roof);
      colliders.push({ minX: sx - 2.4, maxX: sx + 2.4, minZ: P.minZ + 2.4, maxZ: P.minZ + 5.6 });
    }
    // the harbour lighthouse at the pier head
    const lhX = (P.minX + P.maxX) / 2, lhZ = P.maxZ - 3;
    const bandRed = new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.8 });
    const bandWhite = new THREE.MeshStandardMaterial({ color: 0xf2f0eb, roughness: 0.8 });
    [[2.3, 1.6, bandWhite, 0.8], [1.9, 1.8, bandRed, 2.5], [1.6, 1.8, bandWhite, 4.3], [1.35, 1.8, bandRed, 6.1]].forEach(([r, h, m, y]) => {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.15, h, 12), m);
      band.position.set(lhX, y, lhZ); band.castShadow = true; group.add(band);
    });
    const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 1.3, 10), new THREE.MeshStandardMaterial({ color: 0x1c2b3a, roughness: 0.3, metalness: 0.5 }));
    lampRoom.position.set(lhX, 7.6, lhZ); group.add(lampRoom);
    const lampBall = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), lampLightMat);
    lampBall.position.set(lhX, 7.6, lhZ); group.add(lampBall);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1, 10), bandRed);
    cap.position.set(lhX, 8.8, lhZ); cap.castShadow = true; group.add(cap);
    colliders.push({ minX: lhX - 2.6, maxX: lhX + 2.6, minZ: lhZ - 2.6, maxZ: lhZ + 2.6 });
    // moored boats bobbing on both sides of the quay — and, since v3, two of
    // them actually cruise the marina lanes on a slow rectangle around the pier
    const sailMat = new THREE.MeshStandardMaterial({ color: 0xf6f2e6, roughness: 0.85, side: THREE.DoubleSide });
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x6e5636, roughness: 0.9 });
    // the cruising lane: a rectangle in open water around the pier, clear of
    // the moored hulls, the lighthouse and the deck colliders on every side
    const MARINA_LOOP = [[148, 240], [148, 316], [236, 316], [236, 240]];
    const hullAt = (x, z, rotY, paintHex, phase, cruise = null) => {
      const b = new THREE.Group();
      const hullMat = new THREE.MeshStandardMaterial({ color: paintHex, roughness: 0.6 });
      const hull = new THREE.Mesh(boxGeo, hullMat); hull.scale.set(2.3, 0.85, 6.4); hull.position.y = 0.25; hull.castShadow = true; b.add(hull);
      const bow = new THREE.Mesh(boxGeo, hullMat); bow.scale.set(1.6, 0.8, 1.8); bow.position.set(0, 0.25, 3.9); bow.rotation.y = Math.PI / 4; b.add(bow);
      const cabinB = new THREE.Mesh(boxGeo, bandWhite); cabinB.scale.set(1.5, 0.6, 1.8); cabinB.position.set(0, 0.95, -0.6); b.add(cabinB);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5.6, 5), mastMat);
      mast.position.set(0, 3.4, 0.9); b.add(mast);
      const sailShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, 4.4), new THREE.Vector2(2.5, 0.4)]);
      const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), sailMat);
      sail.position.set(0.1, 1.1, 0.95); b.add(sail);
      b.position.set(x, 0, z); b.rotation.y = rotY;
      group.add(b);
      boats.push({ g: b, phase, cruise });
    };
    hullAt(148, 240, 0, PALETTE.boatPaints[0], 0.4, { path: MARINA_LOOP, wp: 1, speed: TUNING.boatCruiseSpeed });
    hullAt(P.minX - 7.5, 268, -0.08, PALETTE.boatPaints[1], 1.7);
    hullAt(P.minX - 7, 288, 0.2, PALETTE.boatPaints[3], 3.1);
    hullAt(236, 316, Math.PI, PALETTE.boatPaints[2], 2.3, { path: MARINA_LOOP, wp: 3, speed: TUNING.boatCruiseSpeed * 0.85 });
    hullAt(P.maxX + 7.5, 278, 0.06, PALETTE.boatPaints[4], 4.4);
    hullAt(P.maxX + 7, 296, -0.1, PALETTE.boatPaints[5], 5.6);
  }

  // --- street furniture: benches, hydrants, billboards ----------------------------
  {
    const benchWood = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.95 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x2e3438, roughness: 0.6, metalness: 0.5 });
    const benchAt = (x, z, rotY) => {
      const b = new THREE.Group();
      const seat = new THREE.Mesh(boxGeo, benchWood); seat.scale.set(2.2, 0.12, 0.55); seat.position.y = 0.5; seat.castShadow = true; b.add(seat);
      const back = new THREE.Mesh(boxGeo, benchWood); back.scale.set(2.2, 0.55, 0.1); back.position.set(0, 0.85, -0.26); b.add(back);
      for (const s of [-0.9, 0.9]) { const leg = new THREE.Mesh(boxGeo, ironMat); leg.scale.set(0.12, 0.5, 0.5); leg.position.set(s, 0.25, 0); b.add(leg); }
      b.position.set(x, 0.24, z); b.rotation.y = rotY;
      group.add(b);
      colliders.push({ minX: x - 1.1, maxX: x + 1.1, minZ: z - 0.45, maxZ: z + 0.45 });
    };
    for (let x = -216; x <= 216; x += 36) benchAt(x, 180.5, 0);                       // facing the sea
    for (let x = -28; x <= 28; x += 14) benchAt(x, -40 + (x % 28 === 0 ? 9 : -9), x % 28 === 0 ? Math.PI : 0); // the park
    benchAt(182, 252, Math.PI / 2); benchAt(202, 272, -Math.PI / 2);                  // on the quay
    const hydMat = new THREE.MeshStandardMaterial({ color: 0xd23b2a, roughness: 0.55 });
    const hydGeo = mergeGeoms([
      { geom: new THREE.CylinderGeometry(0.17, 0.2, 0.62, 7), matrix: new THREE.Matrix4().makeTranslation(0, 0.31, 0) },
      { geom: new THREE.SphereGeometry(0.16, 7, 6), matrix: new THREE.Matrix4().makeTranslation(0, 0.68, 0) },
    ]);
    const hydSpots = [];
    for (const zc of CITY.boulevardsZ) for (const xc of CITY.avenuesX) hydSpots.push([xc + CITY.roadHalf + 1.1, zc + CITY.roadHalf + 1.1]);
    const hydInst = new THREE.InstancedMesh(hydGeo, hydMat, hydSpots.length);
    hydSpots.forEach(([x, z], i) => {
      dummy.position.set(x, 0.24, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      hydInst.setMatrixAt(i, dummy.matrix);
    });
    hydInst.castShadow = true; group.add(hydInst);
    // four freestanding billboards selling the Solmarina life
    const ads = [
      { x: -150, z: 170.5, ry: Math.PI, head: 'SOLMARINA COLA', sub: 'TASTE THE SUN' },
      { x: 70, z: 170.5, ry: Math.PI, head: 'HOTEL AZUL', sub: 'SLEEP BY THE SEA' },
      { x: -64, z: -168.5, ry: 0, head: 'VELOCITY RS', sub: 'OWN THE NIGHT' },
      { x: -16, z: 170.5, ry: Math.PI, head: "LOLA'S QUAY", sub: 'BOATS • FISH • SUNSETS' },
    ];
    for (const ad of ads) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 6.4, 7), ironMat);
      pole.position.set(ad.x, 3.2, ad.z); pole.castShadow = true; group.add(pole);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(13, 6.5), new THREE.MeshBasicMaterial({ map: billboardTexture(rng, ad.head, ad.sub), side: THREE.DoubleSide }));
      panel.position.set(ad.x, 8.6, ad.z); panel.rotation.y = ad.ry; group.add(panel);
      const backer = new THREE.Mesh(boxGeo, ironMat);
      backer.scale.set(13.2, 6.7, 0.18); backer.position.set(ad.x, 8.6, ad.z); backer.rotation.y = ad.ry; group.add(backer);
      colliders.push({ minX: ad.x - 0.6, maxX: ad.x + 0.6, minZ: ad.z - 0.6, maxZ: ad.z + 0.6 });
    }
  }

  // --- the gull flock (v3.1): five gulls working slow circles over the beach
  // and the quay, wings beating — the cheapest possible proof that the sky
  // over Solmarina is alive. Each wing is a plane on a pivot at the body, so
  // the flap is just two rotations a frame.
  const gulls = [];
  {
    const gullMat = new THREE.MeshBasicMaterial({ color: 0xf6f8fa, side: THREE.DoubleSide });
    const tipMat = new THREE.MeshBasicMaterial({ color: 0x39424e, side: THREE.DoubleSide });
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.5, 6), gullMat);
      body.rotation.x = Math.PI / 2; g.add(body);
      const wings = [];
      for (const side of [-1, 1]) {
        const pivot = new THREE.Group(); pivot.position.set(side * 0.12, 0.08, 0);
        const wing = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.55), gullMat);
        wing.rotation.x = -Math.PI / 2; wing.position.x = side * 0.85; pivot.add(wing);
        const tip = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.4), tipMat);
        tip.rotation.x = -Math.PI / 2; tip.position.x = side * 1.85; pivot.add(tip);
        g.add(pivot); wings.push(pivot);
      }
      group.add(g);
      gulls.push({
        g, wings,
        cx: randRange(rng, -60, 150), cz: randRange(rng, 205, 285),
        r: randRange(rng, 26, 58), h: randRange(rng, 19, 30),
        speed: randRange(rng, 0.14, 0.24) * randSign(rng), phase: randRange(rng, 0, 6.28),
        flap: randRange(rng, 5.5, 7.5),
      });
    }
  }

  // --- parked car spots ---------------------------------------------------------
  const parkedSpots = [];
  for (let x = -210; x <= 210; x += 13) parkedSpots.push({ x, z: 170.5, heading: Math.PI / 2 });
  for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) parkedSpots.push({ x: 56 + a * 16, z: 96 + b * 22, heading: 0 });
  for (const xc of [-120, 40, 120]) for (const zc of [-120, -40, 40]) parkedSpots.push({ x: xc + CITY.roadHalf - 1.4, z: zc + 18, heading: 0 });
  parkedSpots.push({ x: 183, z: 246, heading: 0 });       // on Lola's Quay, by the stalls
  parkedSpots.push({ x: 201, z: 266, heading: Math.PI });
  parkedSpots.push({ x: 183, z: 284, heading: 0 });

  let cityT = 0;
  return {
    colliders, sidewalkLoops, parkedSpots, pierRect: CITY.pier,
    /** Where the two cruising boats are right now — main.js sounds their horn
     *  when the player is near, and the minimap plots them on the water. */
    boatPositions() {
      return boats.filter((b) => b.cruise).map((b) => ({ x: b.g.position.x, z: b.g.position.z }));
    },
    update(dt) {
      cityT += dt;
      oceanTex.offset.y += dt * 0.008; oceanTex.offset.x += dt * 0.0025;
      for (const gu of gulls) {   // a lazy circle, a banking tilt, a slow flap with glides
        const a = gu.phase + cityT * gu.speed;
        gu.g.position.set(gu.cx + Math.sin(a) * gu.r, gu.h + Math.sin(cityT * 0.7 + gu.phase) * 1.4, gu.cz + Math.cos(a) * gu.r);
        gu.g.rotation.y = Math.atan2(Math.cos(a) * Math.sign(gu.speed), -Math.sin(a) * Math.sign(gu.speed));
        gu.g.rotation.z = 0.3 * Math.sign(gu.speed);
        const glide = Math.sin(cityT * 0.43 + gu.phase * 2) > 0.55 ? 0.25 : 1;   // now and then they just hold their wings and ride the thermal
        const flap = Math.sin(cityT * gu.flap + gu.phase) * 0.65 * glide;
        gu.wings[0].rotation.z = flap; gu.wings[1].rotation.z = -flap;
      }
      for (const b of boats) {   // the marina swell: bob and roll, at anchor or under way
        b.g.position.y = Math.sin(cityT * 0.9 + b.phase) * 0.11;
        b.g.rotation.z = Math.sin(cityT * 0.7 + b.phase * 1.3) * 0.03;
        b.g.rotation.x = Math.cos(cityT * 0.55 + b.phase) * 0.02;
        if (b.cruise) {   // steer for the next corner of the marina lane, turning like a boat, not a car
          const [tx, tz] = b.cruise.path[b.cruise.wp];
          const dx = tx - b.g.position.x, dz = tz - b.g.position.z;
          if (Math.hypot(dx, dz) < 5) b.cruise.wp = (b.cruise.wp + 1) % b.cruise.path.length;
          else {
            b.g.rotation.y = angleLerp(b.g.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 0.6));
            b.g.position.x += Math.sin(b.g.rotation.y) * b.cruise.speed * dt;
            b.g.position.z += Math.cos(b.g.rotation.y) * b.cruise.speed * dt;
          }
        }
      }
      const beaconOn = Math.sin(cityT * 2.4) > 0.2;
      for (const m of blinkMats) m.emissiveIntensity = beaconOn ? 2.6 : 0.15;
      lampLightMat.emissiveIntensity = 1.6 + Math.sin(cityT * 1.7) * 0.7;   // the lighthouse breathes
    },
  };
}

/** The directed lane graph: nodes at every intersection approach, edges straight and turning. */
export function buildLaneGraph() {
  const nodes = [];
  const idByKey = new Map();
  const L = CITY.laneOffset;
  function node(key, x, z) {
    if (idByKey.has(key)) return idByKey.get(key);
    const id = nodes.length; nodes.push({ x, z, edges: [] });
    idByKey.set(key, id); return id;
  }
  const dirs = ['EB', 'WB', 'SB', 'NB'];
  const at = (dir, xc, zc) => dir === 'EB' ? [xc, zc + L] : dir === 'WB' ? [xc, zc - L] : dir === 'SB' ? [xc + L, zc] : [xc - L, zc];
  for (const zc of CITY.boulevardsZ) for (const xc of CITY.avenuesX) for (const dir of dirs) {
    const [x, z] = at(dir, xc, zc); node(`${dir}@${xc},${zc}`, x, z);
  }
  // entry / exit stubs beyond the city edge
  for (const zc of CITY.boulevardsZ) {
    node(`EBin@${zc}`, -CITY.extentX - 60, zc + L); node(`EBout@${zc}`, CITY.extentX + 60, zc + L);
    node(`WBin@${zc}`, CITY.extentX + 60, zc - L); node(`WBout@${zc}`, -CITY.extentX - 60, zc - L);
  }
  for (const xc of CITY.avenuesX) {
    node(`SBin@${xc}`, xc + L, -CITY.extentZ - 60); node(`SBout@${xc}`, xc + L, CITY.beachZ + 44);
    node(`NBin@${xc}`, xc - L, CITY.beachZ + 44); node(`NBout@${xc}`, xc - L, -CITY.extentZ - 60);
  }
  const edge = (a, b) => { if (a !== undefined && b !== undefined && !nodes[a].edges.includes(b)) nodes[a].edges.push(b); };
  const id = (key) => idByKey.get(key);
  const A = CITY.avenuesX, B = CITY.boulevardsZ;
  for (const zc of B) {
    edge(id(`EBin@${zc}`), id(`EB@${A[0]},${zc}`)); edge(id(`WBin@${zc}`), id(`WB@${A[A.length - 1]},${zc}`));
    for (let i = 0; i < A.length; i++) {
      const xc = A[i];
      if (i + 1 < A.length) edge(id(`EB@${xc},${zc}`), id(`EB@${A[i + 1]},${zc}`)); else edge(id(`EB@${xc},${zc}`), id(`EBout@${zc}`));
      if (i - 1 >= 0) edge(id(`WB@${xc},${zc}`), id(`WB@${A[i - 1]},${zc}`)); else edge(id(`WB@${xc},${zc}`), id(`WBout@${zc}`));
      // turns from the horizontal lanes onto the vertical avenue here
      edge(id(`EB@${xc},${zc}`), id(`SB@${xc},${zc}`)); edge(id(`EB@${xc},${zc}`), id(`NB@${xc},${zc}`));
      edge(id(`WB@${xc},${zc}`), id(`NB@${xc},${zc}`)); edge(id(`WB@${xc},${zc}`), id(`SB@${xc},${zc}`));
    }
  }
  for (const xc of A) {
    edge(id(`SBin@${xc}`), id(`SB@${xc},${B[0]}`)); edge(id(`NBin@${xc}`), id(`NB@${xc},${B[B.length - 1]}`));
    for (let j = 0; j < B.length; j++) {
      const zc = B[j];
      if (j + 1 < B.length) edge(id(`SB@${xc},${zc}`), id(`SB@${xc},${B[j + 1]}`)); else edge(id(`SB@${xc},${zc}`), id(`SBout@${xc}`));
      if (j - 1 >= 0) edge(id(`NB@${xc},${zc}`), id(`NB@${xc},${B[j - 1]}`)); else edge(id(`NB@${xc},${zc}`), id(`NBout@${xc}`));
      edge(id(`SB@${xc},${zc}`), id(`WB@${xc},${zc}`)); edge(id(`SB@${xc},${zc}`), id(`EB@${xc},${zc}`));
      edge(id(`NB@${xc},${zc}`), id(`EB@${xc},${zc}`)); edge(id(`NB@${xc},${zc}`), id(`WB@${xc},${zc}`));
    }
  }
  const entries = [], exits = new Set();
  for (const [key, nid] of idByKey) {
    if (key.includes('in@')) entries.push(nid);
    if (key.includes('out@')) exits.add(nid);
  }
  return { nodes, entries, exits };
}

/** Circle-vs-buildings collision: push (x, z) with radius r out of every collider. Returns corrected [x, z]. */
export function collideCircle(colliders, x, z, r) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx, dz = z - nz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) { const d = Math.sqrt(d2); x = nx + (dx / d) * r; z = nz + (dz / d) * r; }
      else { // centre inside the box: push out along the smallest penetration
        const pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - r; else if (m === pr) x = c.maxX + r; else if (m === pt) z = c.minZ - r; else z = c.maxZ + r;
      }
    }
  }
  return [x, z];
}
