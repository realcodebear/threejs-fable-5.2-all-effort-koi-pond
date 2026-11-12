// Vegetation: lily pads + flowers, grass/iris, pruned shrubs, bamboo, a Japanese maple, distant trees.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLSL_NOISE, globals, patchMaterial, mulberry32, fbm3, vnoise3, smoothstep } from './util.js';
import { pondSDF, terrainHeight, edgePoint } from './pond.js';

// Wind sway applied after instancing (world-space), shared by grass/leaves.
const SWAY_PROJECT = (amp, freq) => `
  vec4 mvPosition = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
    {
      vec3 ip = instanceMatrix[3].xyz;
      float w = sin(uTime * ${freq} + ip.x * 0.6 + ip.z * 0.45) * 0.6 + sin(uTime * ${freq} * 2.3 + ip.x * 1.7 - ip.z * 1.3) * 0.3;
      float hgt = max(mvPosition.y - ip.y, 0.0);
      mvPosition.x += w * ${amp} * hgt * hgt + w * ${amp} * 0.15;
      mvPosition.z += w * ${amp} * 0.6 * hgt * hgt;
    }
  #endif
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;`;

// ---------------- Lily pads ----------------
function lilyPadGeometry() {
  const pos = [], idx = [];
  const segs = 48, rings = 5, notch = 0.34;
  pos.push(0, 0.004, 0);
  for (let r = 1; r <= rings; r++) {
    const rr = r / rings;
    for (let s = 0; s <= segs; s++) {
      const a = notch / 2 + (s / segs) * (Math.PI * 2 - notch);
      const wav = 1 + 0.025 * Math.sin(a * 9.0) * rr;
      const y = 0.022 * Math.pow(rr, 6) + 0.004 * (1 - rr);
      pos.push(Math.cos(a) * rr * wav, y, Math.sin(a) * rr * wav);
    }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 2 + s, 1 + s);
  for (let r = 1; r < rings; r++) {
    const b0 = 1 + (r - 1) * (segs + 1), b1 = 1 + r * (segs + 1);
    for (let s = 0; s < segs; s++) idx.push(b0 + s, b0 + s + 1, b1 + s, b0 + s + 1, b1 + s + 1, b1 + s);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function flowerGeometry(tipColor, baseColor, rnd) {
  const parts = [];
  const petal = (len, wid, azim, elev, curl) => {
    const nx = 6, ny = 4;
    const pos = [], col = [], idx = [];
    const tc = new THREE.Color(tipColor), bc = new THREE.Color(baseColor), c = new THREE.Color();
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
      const s = i / nx, t = j / ny * 2 - 1;
      const w = wid * Math.sin(Math.PI * Math.pow(s, 0.75)) * (s < 0.98 ? 1 : 0.3);
      const x = s * len;
      const z = t * w;
      const y = curl * s * s + Math.abs(t) * w * 0.35;
      // rotate by elevation then azimuth
      const ce = Math.cos(elev), se = Math.sin(elev);
      const x1 = x * ce - y * se, y1 = x * se + y * ce;
      const ca = Math.cos(azim), sa = Math.sin(azim);
      pos.push(x1 * ca - z * sa, y1, x1 * sa + z * ca);
      c.copy(bc).lerp(tc, Math.pow(s, 1.3));
      col.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const a = i * (ny + 1) + j, b = a + 1, cc = a + ny + 1, d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  };
  const layers = [
    { n: 9, len: 0.15, wid: 0.04, elev: 0.18, curl: 0.03 },
    { n: 9, len: 0.135, wid: 0.038, elev: 0.55, curl: 0.03 },
    { n: 8, len: 0.11, wid: 0.034, elev: 0.95, curl: 0.02 },
    { n: 6, len: 0.08, wid: 0.028, elev: 1.25, curl: 0.01 },
  ];
  layers.forEach((L, li) => {
    for (let k = 0; k < L.n; k++) {
      const az = (k / L.n) * Math.PI * 2 + li * 0.35 + (rnd() - 0.5) * 0.15;
      parts.push(petal(L.len * (0.92 + rnd() * 0.16), L.wid, az, L.elev + (rnd() - 0.5) * 0.12, L.curl));
    }
  });
  // golden stamens
  const st = new THREE.CylinderGeometry(0.03, 0.022, 0.035, 14, 1);
  st.translate(0, 0.03, 0);
  const stc = [];
  for (let i = 0; i < st.attributes.position.count; i++) stc.push(1.0, 0.62, 0.08);
  st.setAttribute('color', new THREE.Float32BufferAttribute(stc, 3));
  st.deleteAttribute('uv');
  parts.forEach((p) => p.deleteAttribute && p.attributes.uv && p.deleteAttribute('uv'));
  parts.push(st.index ? st : st);
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => { p.deleteAttribute('normal'); return p; }));
  merged.computeVertexNormals();
  return merged;
}

export function createLilies() {
  const rnd = mulberry32(99);
  const group = new THREE.Group();
  group.name = 'lilies';
  // clusters
  const clusters = [
    { a: 2.6, off: -1.3, n: 7 },
    { a: 4.4, off: -1.1, n: 6 },
    { a: 0.25, off: -1.4, n: 5 },
    { a: 5.6, off: -1.6, n: 3 },
    { a: 1.4, off: -1.0, n: 3 },
  ];
  const pads = [];
  clusters.forEach((cl) => {
    const c = edgePoint(cl.a, cl.off);
    let tries = 0, placed = 0;
    while (placed < cl.n && tries < 200) {
      tries++;
      const r = 0.2 + rnd() * 0.24;
      const x = c.x + (rnd() - 0.5) * 2.0, z = c.y + (rnd() - 0.5) * 2.0;
      if (pondSDF(x, z) > -0.35 - r) continue;
      if (pads.some((p) => Math.hypot(p.x - x, p.z - z) < (p.r + r) * 0.95)) continue;
      pads.push({ x, z, r, rot: rnd() * 6.28, ph: rnd() * 6.28, tint: rnd() });
      placed++;
    }
  });

  const padGeo = lilyPadGeometry();
  const padMat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0, side: THREE.DoubleSide });
  patchMaterial(padMat, 'lilypad', {
    vertexHead: 'varying vec2 vPad;',
    vertex: { begin_vertex: '#include <begin_vertex>\nvPad = position.xz;' },
    fragmentHead: 'varying vec2 vPad;\n' + GLSL_NOISE,
    fragment: {
      color_fragment: `#include <color_fragment>
        {
          float r = length(vPad);
          float a = atan(vPad.y, vPad.x);
          float vein = 1.0 - smoothstep(0.0, 0.12, abs(fract(a * 22.0 / 6.2831853) - 0.5) * 2.0 * (0.2 + r));
          vec3 base = diffuseColor.rgb;
          base *= 0.85 + 0.25 * snoise(vec3(vPad * 5.0, 1.0)) + 0.1 * snoise(vec3(vPad * 17.0, 2.0));
          base = mix(base, base * 1.45 + vec3(0.02, 0.03, 0.0), vein * smoothstep(0.06, 0.25, r) * 0.6);
          base = mix(base, vec3(0.2, 0.04, 0.03), smoothstep(0.9, 0.99, r) * 0.8);
          base *= mix(1.25, 1.0, smoothstep(0.0, 0.1, r));
          diffuseColor.rgb = base;
        }`,
    },
  });
  const padMesh = new THREE.InstancedMesh(padGeo, padMat, pads.length);
  const col = new THREE.Color();
  pads.forEach((p, i) => {
    col.setRGB(0.06, 0.17, 0.035).lerp(new THREE.Color(0.13, 0.19, 0.03), p.tint * 0.8);
    padMesh.setColorAt(i, col);
  });
  padMesh.frustumCulled = false;
  group.add(padMesh);

  // flowers on some pads
  const flowerGeoPink = flowerGeometry(0xff4f8f, 0xfff0f3, rnd);
  const flowerGeoWhite = flowerGeometry(0xfff6ef, 0xffffdd, rnd);
  const flowerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
  patchMaterial(flowerMat, 'flower', {
    fragment: {
      emissivemap_fragment: `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * 0.09;`,
    },
  });
  const flowers = [];
  const flowerIdx = [0, 3, 7, 9, 13, 16, 19].filter((i) => i < pads.length);
  flowerIdx.forEach((pi, k) => {
    const p = pads[pi];
    const m = new THREE.Mesh(k % 3 === 2 ? flowerGeoWhite : flowerGeoPink, flowerMat);
    const s = 0.9 + rnd() * 0.5;
    m.scale.setScalar(s);
    const ang = rnd() * 6.28;
    const dx = Math.cos(ang) * p.r * 0.35, dz = Math.sin(ang) * p.r * 0.35;
    flowers.push({ mesh: m, pad: p, dx, dz });
    group.add(m);
  });

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const update = (t) => {
    pads.forEach((p, i) => {
      const bob = Math.sin(t * 0.9 + p.ph) * 0.006;
      e.set(Math.sin(t * 0.7 + p.ph) * 0.02, p.rot + Math.sin(t * 0.05 + p.ph) * 0.15, Math.cos(t * 0.8 + p.ph) * 0.02);
      q.setFromEuler(e);
      v.set(p.x + Math.sin(t * 0.07 + p.ph) * 0.05, 0.006 + bob, p.z + Math.cos(t * 0.06 + p.ph) * 0.05);
      p.cx = v.x; p.cz = v.z; p.cy = v.y;
      s.set(p.r, p.r, p.r);
      m4.compose(v, q, s);
      padMesh.setMatrixAt(i, m4);
    });
    padMesh.instanceMatrix.needsUpdate = true;
    flowers.forEach((f) => {
      f.mesh.position.set(f.pad.cx + f.dx, f.pad.cy + 0.012, f.pad.cz + f.dz);
      f.mesh.rotation.set(Math.sin(t * 0.7 + f.pad.ph) * 0.03, f.pad.ph, 0);
    });
  };
  update(0);
  return { group, padMesh, flowerMeshes: flowers.map((f) => f.mesh), update, pads };
}

// ---------------- Grass and iris ----------------
function bladeGeometry() {
  const pos = [], nrm = [], idx = [];
  const segs = 4;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const w = 0.5 * (1 - t) * (1 - t * 0.2);
    const bend = 0.25 * t * t;
    pos.push(-w, t, bend, w, t, bend);
    nrm.push(0, 0.6, -0.8, 0, 0.6, -0.8);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

export function createGrass(blockers) {
  const rnd = mulberry32(5150);
  const items = [];
  const blocked = (x, z) => blockers.some((b) => (x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r * 0.6);
  // grass clumps
  for (let c = 0; c < 520; c++) {
    const a = rnd() * Math.PI * 2;
    const off = 0.25 + Math.pow(rnd(), 1.6) * 7.5;
    const cp = edgePoint(a, off);
    const n = 14 + Math.floor(rnd() * 26);
    const clumpH = 0.18 + rnd() * 0.25;
    for (let k = 0; k < n; k++) {
      const rr = Math.sqrt(rnd()) * 0.28;
      const aa = rnd() * 6.28;
      const x = cp.x + Math.cos(aa) * rr, z = cp.y + Math.sin(aa) * rr;
      if (pondSDF(x, z) < 0.12 || blocked(x, z)) continue;
      items.push({ x, z, h: clumpH * (0.5 + rnd() * 0.8) * (1 - rr * 1.5), w: 0.03 + rnd() * 0.02, rot: rnd() * 6.28, lean: (rnd() - 0.5) * 0.5, kind: 0 });
    }
  }
  // iris / reed clusters at the water's edge
  const irisAngles = [0.9, 1.9, 3.3, 5.0, 5.9, 4.0];
  const irisFlowers = [];
  irisAngles.forEach((a0) => {
    for (let k = 0; k < 40; k++) {
      const a = a0 + (rnd() - 0.5) * 0.18;
      const p = edgePoint(a, 0.15 + rnd() * 0.5);
      if (blocked(p.x, p.y)) continue;
      const h = 0.6 + rnd() * 0.55;
      items.push({ x: p.x, z: p.y, h, w: 0.035 + rnd() * 0.02, rot: rnd() * 6.28, lean: (rnd() - 0.5) * 0.35, kind: 1 });
      if (rnd() < 0.12) irisFlowers.push({ x: p.x, z: p.y, h: h * 0.95 });
    }
  });

  const geo = bladeGeometry();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, side: THREE.DoubleSide });
  patchMaterial(mat, 'grass', {
    uniforms: { uTime: globals.uTime },
    vertexHead: 'uniform float uTime; varying float vH;',
    vertex: {
      begin_vertex: '#include <begin_vertex>\nvH = position.y;',
      project_vertex: SWAY_PROJECT('0.06', '1.2'),
    },
    fragmentHead: 'varying float vH;',
    fragment: {
      color_fragment: '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.25, 1.15, vH);',
      normal_fragment_begin: '#include <normal_fragment_begin>\nnormal = normalize(vNormal);',
    },
  });
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  items.forEach((it, i) => {
    p.set(it.x, terrainHeight(it.x, it.z) - 0.02, it.z);
    e.set(it.lean, it.rot, it.lean * 0.5);
    q.setFromEuler(e);
    s.set(it.w, it.h, it.w * 2);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    if (it.kind === 1) col.setRGB(0.05 + rnd() * 0.03, 0.14 + rnd() * 0.05, 0.035);
    else if (rnd() < 0.12) col.setRGB(0.2, 0.17, 0.06);
    else col.setRGB(0.06 + rnd() * 0.05, 0.13 + rnd() * 0.08, 0.025 + rnd() * 0.02);
    mesh.setColorAt(i, col);
  });
  mesh.frustumCulled = false;

  // iris flowers: three drooping violet falls + three standards
  const ip = [];
  const fl = new THREE.Group();
  const irisMat = new THREE.MeshStandardMaterial({ color: 0x5a2cc8, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x2a0a60, emissiveIntensity: 0.4 });
  const petalG = new THREE.SphereGeometry(1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  petalG.scale(0.025, 0.012, 0.055);
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const g1 = petalG.clone(); g1.rotateX(-0.9); g1.translate(0, 0, 0.04); g1.rotateY(k * 2.094); parts.push(g1);
    const g2 = petalG.clone(); g2.rotateX(1.2); g2.translate(0, 0.03, 0.015); g2.rotateY(k * 2.094 + 1.047); parts.push(g2);
  }
  const irisGeo = mergeGeometries(parts);
  irisFlowers.forEach((f) => {
    const mm = new THREE.Mesh(irisGeo, irisMat);
    mm.position.set(f.x, terrainHeight(f.x, f.z) + f.h, f.z);
    mm.rotation.y = rnd() * 6.28;
    mm.scale.setScalar(1.2);
    fl.add(mm);
  });
  const group = new THREE.Group();
  group.add(mesh, fl);
  group.name = 'grass';
  return group;
}

// ---------------- Pruned shrubs (karikomi) ----------------
export function createShrubs() {
  const rnd = mulberry32(31337);
  const spots = [
    [3.05, 1.6, 1.0], [3.3, 2.2, 0.75], [1.2, 1.9, 0.9], [4.6, 2.4, 1.1], [5.25, 1.8, 0.8],
    [2.1, 3.0, 1.2], [0.2, 2.4, 0.7], [3.9, 3.1, 0.95], [5.9, 2.9, 0.85],
  ];
  const parts = [];
  spots.forEach(([a, off, sz], k) => {
    let g = new THREE.IcosahedronGeometry(1, 12);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    const flowering = k % 3 === 1;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = fbm3(v.x * 1.5 + k * 3, v.y * 1.5, v.z * 1.5, 3);
      const leaf = vnoise3(v.x * 22 + k, v.y * 22, v.z * 22);
      const r = 1 + 0.12 * n + 0.035 * leaf;
      v.multiplyScalar(r);
      if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.2;
      pos.setXYZ(i, v.x, v.y, v.z);
      const shade = 0.6 + 0.4 * (0.5 + 0.5 * leaf);
      colors[i * 3] = 0.035 * shade; colors[i * 3 + 1] = 0.085 * shade; colors[i * 3 + 2] = 0.025 * shade;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('aFlower', new THREE.Float32BufferAttribute(new Array(pos.count).fill(flowering ? 1 : 0), 1));
    const p = edgePoint(a, off);
    const h = sz * (0.55 + rnd() * 0.15);
    g.scale(sz, h, sz * (0.85 + rnd() * 0.3));
    g.rotateY(rnd() * 6.28);
    g.translate(p.x, terrainHeight(p.x, p.y) + h * 0.18, p.y);
    parts.push(g);
  });
  const geo = mergeGeometries(parts);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  patchMaterial(mat, 'shrub', {
    vertexHead: 'attribute float aFlower; varying float vFlower; varying vec3 vWPos2; varying vec3 vObjN;',
    vertex: {
      begin_vertex: '#include <begin_vertex>\nvFlower = aFlower; vWPos2 = (modelMatrix * vec4(position, 1.0)).xyz; vObjN = normal;',
    },
    fragmentHead: 'varying float vFlower; varying vec3 vWPos2; varying vec3 vObjN;\n' + GLSL_NOISE,
    fragment: {
      color_fragment: `#include <color_fragment>
        {
          float lf = snoise(vWPos2 * 26.0) * 0.6 + snoise(vWPos2 * 61.0) * 0.4;
          diffuseColor.rgb *= 0.55 + 0.75 * smoothstep(-0.6, 0.8, lf);
          float bl = smoothstep(0.42, 0.62, snoise(vWPos2 * 34.0 + 5.0)) * smoothstep(-0.2, 0.4, vObjN.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.08, 0.22) * (0.8 + 0.3 * lf), bl * vFlower);
        }`,
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'shrubs';
  return mesh;
}

// ---------------- Bamboo grove + distant trees ----------------
export function createBackdrop() {
  const rnd = mulberry32(8080);
  const group = new THREE.Group();
  group.name = 'backdrop';
  // stalks
  const stalks = [];
  for (let i = 0; i < 190; i++) {
    const a = rnd() * Math.PI * 2;
    // denser behind the maple / lantern side
    const dens = Math.max(0.1, 0.45 + 0.6 * Math.cos(a - 2.4));
    if (rnd() > dens) continue;
    const r = 13.5 + rnd() * 5.5;
    stalks.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, h: 7 + rnd() * 5, rad: 0.05 + rnd() * 0.05, lx: (rnd() - 0.5) * 0.12, lz: (rnd() - 0.5) * 0.12 });
  }
  const stalkGeo = new THREE.CylinderGeometry(1, 1, 1, 7, 1, true);
  stalkGeo.translate(0, 0.5, 0);
  const stalkMat = new THREE.MeshStandardMaterial({ color: 0x8ea04a, roughness: 0.5 });
  patchMaterial(stalkMat, 'bamboo', {
    vertexHead: 'varying float vWY;',
    vertex: { project_vertex: '#include <project_vertex>\n vWY = (modelMatrix * instanceMatrix * vec4(transformed,1.0)).y;' },
    fragmentHead: 'varying float vWY;',
    fragment: {
      color_fragment: `#include <color_fragment>
        float nd = abs(fract(vWY * 1.6) - 0.5);
        diffuseColor.rgb *= mix(0.45, 1.0, smoothstep(0.0, 0.05, nd)) * mix(0.7, 1.0, smoothstep(0.0, 4.0, vWY));`,
    },
  });
  const stalkMesh = new THREE.InstancedMesh(stalkGeo, stalkMat, stalks.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  stalks.forEach((st, i) => {
    p.set(st.x, terrainHeight(st.x, st.z) - 0.1, st.z);
    e.set(st.lx, 0, st.lz); q.setFromEuler(e);
    s.set(st.rad, st.h, st.rad);
    m.compose(p, q, s);
    stalkMesh.setMatrixAt(i, m);
    const g = 0.6 + rnd() * 0.5;
    stalkMesh.setColorAt(i, col.setRGB(g, g, g * 0.9));
  });
  group.add(stalkMesh);

  // bamboo leaves
  const leafShape = new THREE.BufferGeometry();
  leafShape.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.06, 0, 0.18, 0, 0, 0.5, -0.06, 0, 0.18], 3));
  leafShape.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  leafShape.setIndex([0, 1, 2, 0, 2, 3]);
  const leaves = [];
  stalks.forEach((st) => {
    const n = 40;
    const top = terrainHeight(st.x, st.z) + st.h;
    for (let k = 0; k < n; k++) {
      const y = top - Math.pow(rnd(), 1.3) * st.h * 0.55;
      const a = rnd() * 6.28, rr = 0.15 + rnd() * 1.0;
      leaves.push({ x: st.x + Math.cos(a) * rr + st.lx * (y), y, z: st.z + Math.sin(a) * rr + st.lz * y, ry: rnd() * 6.28, rx: 0.4 + rnd() * 0.6, s: 0.8 + rnd() * 0.6 });
    }
  });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f6a1e, roughness: 0.7, side: THREE.DoubleSide });
  patchMaterial(leafMat, 'bambooleaf', {
    uniforms: { uTime: globals.uTime },
    vertexHead: 'uniform float uTime;',
    vertex: { project_vertex: SWAY_PROJECT('0.25', '0.8') },
  });
  const leafMesh = new THREE.InstancedMesh(leafShape, leafMat, leaves.length);
  leaves.forEach((l, i) => {
    p.set(l.x, l.y, l.z);
    e.set(l.rx, l.ry, 0, 'YXZ'); q.setFromEuler(e);
    s.setScalar(l.s);
    m.compose(p, q, s);
    leafMesh.setMatrixAt(i, m);
    const g = 0.6 + rnd() * 0.6;
    leafMesh.setColorAt(i, col.setRGB(g, g, g * 0.8));
  });
  leafMesh.frustumCulled = false;
  group.add(leafMesh);

  // distant cedar silhouettes: slim, tiered
  const tiers = [];
  for (let k = 0; k < 4; k++) {
    const c = new THREE.ConeGeometry(0.55 - k * 0.09, 0.42, 9, 1);
    c.translate(0, 0.28 + k * 0.2, 0);
    tiers.push(c);
  }
  const trunk = new THREE.CylinderGeometry(0.03, 0.05, 0.3, 5);
  trunk.translate(0, 0.15, 0);
  tiers.push(trunk);
  const coneGeo = mergeGeometries(tiers.map((g) => { g.deleteAttribute('uv'); return g.toNonIndexed(); }));
  const trees = [];
  for (let i = 0; i < 190; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 30 + rnd() * 30;
    trees.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, h: 4.5 + rnd() * 6, w: 1.3 + rnd() * 1.2 });
  }
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x0a130b, roughness: 1 });
  const treeMesh = new THREE.InstancedMesh(coneGeo, treeMat, trees.length);
  trees.forEach((t, i) => {
    p.set(t.x, terrainHeight(t.x, t.z) - 0.3, t.z);
    q.setFromEuler(e.set(0, rnd() * 6.28, 0));
    s.set(t.w * t.h * 0.14, t.h, t.w * t.h * 0.14);
    m.compose(p, q, s);
    treeMesh.setMatrixAt(i, m);
  });
  group.add(treeMesh);

  // far ground beyond the detailed terrain
  const far = new THREE.Mesh(new THREE.RingGeometry(33, 300, 64, 1), new THREE.MeshStandardMaterial({ color: 0x0b120a, roughness: 1 }));
  far.rotation.x = -Math.PI / 2;
  far.position.y = 1.55;
  group.add(far);
  return group;
}

// ---------------- Japanese maple ----------------
function taperedTube(points, r0, r1, radial = 7) {
  const curve = new THREE.CatmullRomCurve3(points);
  const segs = Math.max(4, points.length * 3);
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const c = curve.getPointAt(t);
    const r = r0 + (r1 - r0) * t;
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const cx = Math.cos(a), sy = Math.sin(a);
      pos.push(c.x + r * (cx * N.x + sy * B.x), c.y + r * (cx * N.y + sy * B.y), c.z + r * (cx * N.z + sy * B.z));
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, curve };
}

function mapleLeafGeometry() {
  // palmate 7-lobed leaf in the XZ plane, stem toward -Z
  const outline = [];
  const lobes = 7;
  for (let i = 0; i < lobes; i++) {
    const a = -Math.PI * 0.72 + (i / (lobes - 1)) * Math.PI * 1.44; // angle from +Z
    const len = 1 - Math.abs(i - 3) * 0.12;
    const tip = [Math.sin(a) * len, Math.cos(a) * len];
    const aN = a + (Math.PI * 1.44) / (lobes - 1) / 2;
    if (i > 0) {
      const aP = a - (Math.PI * 1.44) / (lobes - 1) / 2;
      outline.push([Math.sin(aP) * 0.38, Math.cos(aP) * 0.38]);
    }
    outline.push([Math.sin(a - 0.1) * len * 0.7, Math.cos(a - 0.1) * len * 0.7]);
    outline.push(tip);
    outline.push([Math.sin(a + 0.1) * len * 0.7, Math.cos(a + 0.1) * len * 0.7]);
    void aN;
  }
  const pos = [0, 0, 0], idx = [];
  outline.forEach(([x, z]) => pos.push(x, 0.08 * (x * x + z * z), z));
  for (let i = 1; i < outline.length; i++) idx.push(0, i + 1, i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function createMaple() {
  const rnd = mulberry32(1111);
  const baseA = 5.45;
  const b = edgePoint(baseA, 1.0);
  const base = new THREE.Vector3(b.x, terrainHeight(b.x, b.y) - 0.05, b.y);
  const branchGeos = [];
  const leafSpots = [];
  const anchors = [];
  const toCenter = new THREE.Vector3(-base.x, 0, -base.z).normalize();

  const grow = (start, dir, len, rad, depth) => {
    const pts = [start.clone()];
    const p = start.clone(), d = dir.clone();
    const steps = 4;
    for (let k = 0; k < steps; k++) {
      d.x += (rnd() - 0.5) * 0.35; d.z += (rnd() - 0.5) * 0.35; d.y += (rnd() - 0.5) * 0.2 + (depth >= 2 ? -0.04 : 0.05);
      d.normalize();
      p.addScaledVector(d, len / steps);
      pts.push(p.clone());
    }
    const tube = taperedTube(pts, rad, rad * 0.62, depth < 2 ? 8 : 5);
    branchGeos.push(tube.geo);
    if (depth >= 2) anchors.push(tube.curve.getPointAt(0.75));
    if (depth >= 4) {
      leafSpots.push({ p: p.clone(), d: d.clone(), r: 0.55 });
      leafSpots.push({ p: tube.curve.getPointAt(0.5), d: d.clone(), r: 0.35 });
      return;
    }
    if (depth >= 3) leafSpots.push({ p: tube.curve.getPointAt(0.6), d: d.clone(), r: 0.4 });
    const n = depth === 0 ? 3 : 2 + (rnd() < 0.45 ? 1 : 0);
    for (let c = 0; c < n; c++) {
      const t = depth === 0 ? 0.7 + c * 0.12 : 0.45 + rnd() * 0.55;
      const sp = tube.curve.getPointAt(Math.min(t, 1));
      const nd = d.clone();
      const ang = (c / n) * Math.PI * 2 + rnd() * 1.2;
      const spread = 0.55 + rnd() * 0.35;
      const perp = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
      nd.addScaledVector(perp, spread * 1.3);
      nd.y *= depth >= 1 ? 0.55 : 0.9;
      nd.addScaledVector(toCenter, 0.4);
      nd.normalize();
      grow(sp, nd, len * (0.72 + rnd() * 0.12), rad * 0.62 * (1 - (t - 0.5) * 0.3), depth + 1);
    }
  };
  const trunkDir = new THREE.Vector3().copy(toCenter).multiplyScalar(0.6).add(new THREE.Vector3(0, 1, 0)).normalize();
  grow(base, trunkDir, 1.7, 0.16, 0);
  // root flare
  const flare = new THREE.CylinderGeometry(0.17, 0.3, 0.3, 9, 1, true);
  flare.translate(base.x, base.y + 0.12, base.z);
  flare.deleteAttribute('uv');
  branchGeos.push(flare.index ? flare.toNonIndexed() : flare);
  const bg = mergeGeometries(branchGeos.map((g) => { if (g.attributes.uv) g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; }));
  bg.computeVertexNormals();
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x2a221d, roughness: 0.85 });
  const branches = new THREE.Mesh(bg, barkMat);

  // leaves
  const leafGeo = mapleLeafGeometry();
  const leaves = [];
  leafSpots.forEach((ls) => {
    const n = Math.floor(ls.r * 230);
    for (let k = 0; k < n; k++) {
      const u = rnd() * 6.28, v = Math.acos(2 * rnd() - 1), rr = Math.cbrt(rnd()) * ls.r;
      const off = new THREE.Vector3(Math.sin(v) * Math.cos(u) * rr * 1.25, Math.cos(v) * rr * 0.5 + 0.08, Math.sin(v) * Math.sin(u) * rr * 1.25);
      leaves.push({ p: ls.p.clone().add(off), s: 0.065 + rnd() * 0.045, ry: rnd() * 6.28, rx: (rnd() - 0.5) * 0.9, rz: (rnd() - 0.5) * 0.9, c: rnd() });
    }
  });
  const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.62, side: THREE.DoubleSide });
  patchMaterial(leafMat, 'maple', {
    uniforms: { uTime: globals.uTime },
    vertexHead: 'uniform float uTime;',
    vertex: { project_vertex: SWAY_PROJECT('0.0', '0.9').replace('float hgt = max(mvPosition.y - ip.y, 0.0);', 'float hgt = 1.0;').replace('w * 0.0 * hgt * hgt + w * 0.0 * 0.15', 'w * 0.012') },
    fragment: {
      emissivemap_fragment: `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * 0.12;`,
    },
  });
  const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, leaves.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), col = new THREE.Color();
  const palette = [new THREE.Color(0.62, 0.03, 0.02), new THREE.Color(0.8, 0.1, 0.02), new THREE.Color(0.4, 0.015, 0.02), new THREE.Color(0.9, 0.3, 0.03), new THREE.Color(0.7, 0.05, 0.04)];
  leaves.forEach((l, i) => {
    e.set(l.rx, l.ry, l.rz); q.setFromEuler(e);
    s.setScalar(l.s);
    m.compose(l.p, q, s);
    leafMesh.setMatrixAt(i, m);
    const c = palette[Math.floor(l.c * palette.length) % palette.length];
    leafMesh.setColorAt(i, col.copy(c).multiplyScalar(0.8 + rnd() * 0.4));
  });
  leafMesh.frustumCulled = false;
  const group = new THREE.Group();
  group.add(branches, leafMesh);
  group.name = 'maple';
  return { group, leafGeo, leafMat, palette, leafPositions: leaves.map((l) => l.p), anchors };
}

// ---------------- Falling / floating maple leaves ----------------
export class FallingLeaves {
  constructor(maple, ripples, count = 18) {
    this.ripples = ripples;
    this.sources = maple.leafPositions;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.5, side: THREE.DoubleSide });
    patchMaterial(mat, 'fallleaf', {
      fragment: { emissivemap_fragment: '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.1;' },
    });
    this.mesh = new THREE.InstancedMesh(maple.leafGeo, mat, count);
    this.mesh.frustumCulled = false;
    this.rnd = mulberry32(606);
    this.leaves = [];
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const l = { state: 'wait', timer: 1 + i * 2.2 + this.rnd() * 3, p: new THREE.Vector3(), vel: new THREE.Vector3(), spin: 0, ph: 0, s: 0.09, rot: new THREE.Euler() };
      this.leaves.push(l);
      this.mesh.setColorAt(i, col.copy(maple.palette[i % maple.palette.length]).multiplyScalar(0.9));
    }
    // a few already floating at start
    for (let i = 0; i < 6; i++) {
      const l = this.leaves[i];
      let x, z;
      do { x = (this.rnd() - 0.5) * 8; z = (this.rnd() - 0.5) * 8; } while (pondSDF(x, z) > -0.4);
      l.state = 'float'; l.p.set(x, 0.008, z); l.timer = 20 + this.rnd() * 40; l.ph = this.rnd() * 6.28; l.spin = this.rnd() * 6.28;
    }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3();
  }

  update(dt, t, flow) {
    const rnd = this.rnd;
    this.leaves.forEach((l, i) => {
      if (l.state === 'wait') {
        l.timer -= dt;
        if (l.timer <= 0) {
          const src = this.sources[Math.floor(rnd() * this.sources.length)];
          l.p.copy(src);
          l.state = 'fall'; l.ph = rnd() * 6.28; l.spin = rnd() * 6.28;
          l.vel.set((rnd() - 0.5) * 0.2, -0.28 - rnd() * 0.12, (rnd() - 0.5) * 0.2);
        }
      } else if (l.state === 'fall') {
        l.ph += dt * 2.6;
        l.p.x += (l.vel.x + Math.sin(l.ph) * 0.35) * dt;
        l.p.z += (l.vel.z + Math.cos(l.ph * 0.8) * 0.3) * dt;
        l.p.y += (l.vel.y + Math.sin(l.ph * 2.0) * 0.08) * dt;
        l.spin += dt * 1.5;
        l.rot.set(Math.sin(l.ph) * 0.9, l.spin, Math.cos(l.ph) * 0.7);
        const sd = pondSDF(l.p.x, l.p.z);
        const ground = sd < -0.05 ? 0.008 : terrainHeight(l.p.x, l.p.z) + 0.01;
        if (l.p.y <= ground) {
          l.p.y = ground;
          if (sd < -0.05) {
            l.state = 'float'; l.timer = 25 + rnd() * 35;
            this.ripples.add(l.p.x, l.p.z, t, 0.005);
          } else { l.state = 'ground'; l.timer = 15; }
        }
      } else if (l.state === 'float') {
        l.timer -= dt;
        const f = flow(l.p.x, l.p.z, t);
        l.p.x += f.x * dt * 0.8; l.p.z += f.y * dt * 0.8;
        l.spin += dt * 0.05;
        l.rot.set(0, l.spin, 0);
        l.p.y = 0.008 + Math.sin(t * 1.1 + l.ph) * 0.003;
        if (pondSDF(l.p.x, l.p.z) > -0.25 || l.timer <= 0) { l.state = 'sink'; l.timer = 3; }
      } else if (l.state === 'sink') {
        l.timer -= dt; l.p.y -= dt * 0.02;
        if (l.timer <= 0) { l.state = 'wait'; l.timer = 2 + rnd() * 10; l.p.set(0, -50, 0); }
      } else if (l.state === 'ground') {
        l.timer -= dt;
        if (l.timer <= 0) { l.state = 'wait'; l.timer = 2 + rnd() * 6; l.p.set(0, -50, 0); }
      }
      const visible = l.state !== 'wait';
      this._q.setFromEuler(l.rot);
      this._s.setScalar(visible ? 0.09 : 0);
      this._m.compose(l.p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
