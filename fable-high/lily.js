// Lily pads, water-lily flowers and their underwater stems.
import * as THREE from 'three';
import { pondSD, pondPoint, terrainHeight, setLayers, uTime, L_UNDER, lerp } from './common.js';

function padGeometry() {
  const RINGS = 6, SEG = 30, notch = 0.30;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= RINGS; i++) {
    const r0 = i / RINGS;
    for (let j = 0; j <= SEG; j++) {
      const a = notch * 0.5 + (j / SEG) * (Math.PI * 2 - notch);
      const r = r0 * (1 + 0.035 * Math.sin(a * 7.0) + 0.02 * Math.sin(a * 13.0 + 1.0));
      const lift = 0.045 * Math.pow(r0, 6) * (0.6 + 0.5 * Math.sin(a * 5.0 + 0.7)) + 0.012 * r0 * r0 * Math.sin(a * 3.0);
      pos.push(Math.cos(a) * r, lift, Math.sin(a) * r);
      uv.push(r0, a / (Math.PI * 2));
    }
  }
  for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEG; j++) {
    const a = i * (SEG + 1) + j, b = a + 1, c = a + SEG + 1, d = c + 1;
    if (i > 0) idx.push(a, b, c);
    idx.push(b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function petalGeometry() {
  const NU = 7, NV = 4;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU;
    const w = 0.30 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.85) * (1 - 0.25 * u);
    for (let j = 0; j <= NV; j++) {
      const v = (j / NV) * 2 - 1;
      pos.push(u, 0.22 * u * u + 0.45 * v * v * w, v * w);
      uv.push(u, j / NV);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * (NV + 1) + j, b = a + 1, c = a + NV + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function createLilies(rng, keepOut = []) {
  const group = new THREE.Group();
  const d = new THREE.Object3D(), col = new THREE.Color(), p = new THREE.Vector3();

  // ---- place pads in clusters
  const clusters = [[2.25, -0.95, 11, 0.85], [0.72, -0.85, 9, 0.75], [-1.15, -0.8, 10, 0.8], [-2.7, -0.95, 9, 0.75], [3.6, -1.0, 6, 0.6], [-0.2, -0.9, 6, 0.55], [1.45, -0.6, 5, 0.5]];
  const pads = [], flowers = [];
  const free = (x, z, r) => pondSD(x, z) < -(r + 0.16)
    && pads.every((o) => Math.hypot(o.x - x, o.z - z) > (o.r + r) * 0.96 + 0.01)
    && flowers.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r + 0.02)
    && keepOut.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r);
  clusters.forEach(([th, sd, n, spread], ci) => {
    const c = pondPoint(th, sd);
    // flowers first so pads arrange themselves around them
    const nf = ci < 4 ? 2 : 1;
    for (let k = 0; k < nf; k++) {
      for (let t = 0; t < 40; t++) {
        const a = rng() * 6.28, rr = rng() * spread * 0.7;
        const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr;
        if (free(x, z, 0.12)) { flowers.push({ x, z, r: 0.10, s: 0.115 + rng() * 0.05, bud: rng() < 0.22, pink: rng() }); break; }
      }
    }
    let placed = 0;
    for (let t = 0; t < 400 && placed < n; t++) {
      const a = rng() * 6.28, rr = Math.sqrt(rng()) * spread * (1 + t / 300);
      const r = 0.13 + rng() * rng() * 0.20;
      const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr;
      if (free(x, z, r)) { pads.push({ x, z, r }); placed++; }
    }
  });
  // a few loners
  for (let t = 0; t < 200 && pads.length < 64; t++) {
    pondPoint(rng() * 6.28, -0.3 - rng() * 0.9, p);
    const r = 0.10 + rng() * 0.10;
    if (free(p.x, p.z, r)) pads.push({ x: p.x, z: p.z, r });
  }

  // ---- pads
  const padMat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.6 });
  padMat.defines = { USE_UV: '' };
  padMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
        { vec3 ip = instanceMatrix[3].xyz;
          float sc = length(instanceMatrix[0].xyz);
          transformed.y += (0.004 * sin(uTime * 0.9 + ip.x * 2.3 + ip.z * 1.7 + position.x * 2.0) + 0.003 * sin(uTime * 1.4 + ip.z * 3.1 + position.z * 2.0)) / sc; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', /* glsl */`
      {
        float r = vUv.x, a = vUv.y * 6.2831853;
        float veins = pow(abs(sin(a * 8.0)), 26.0) * smoothstep(0.06, 0.3, r);
        veins = max(veins, pow(abs(sin(a * 16.0 + 0.4)), 30.0) * smoothstep(0.45, 0.8, r) * 0.6);
        vec3 c = mix(vec3(0.17, 0.33, 0.07), vec3(0.055, 0.16, 0.04), smoothstep(0.0, 1.0, r));
        c = mix(c, c * 1.55 + vec3(0.02, 0.035, 0.0), veins * 0.55);
        c = mix(c, vec3(0.24, 0.20, 0.05), smoothstep(0.86, 1.0, r) * 0.45);
        c *= 1.0 - 0.5 * (1.0 - smoothstep(0.0, 0.12, r));
        diffuseColor.rgb = c;
      }`);
  };
  padMat.customProgramCacheKey = () => 'lilypad';
  const padMesh = new THREE.InstancedMesh(padGeometry(), padMat, pads.length);
  pads.forEach((pd, i) => {
    d.position.set(pd.x, 0.007 + rng() * 0.004, pd.z);
    d.rotation.set(0, rng() * Math.PI * 2, 0);
    d.scale.set(pd.r, pd.r, pd.r);
    d.updateMatrix();
    padMesh.setMatrixAt(i, d.matrix);
    const t = rng();
    if (t < 0.10) col.setRGB(1.1, 0.9, 0.45);          // yellowing
    else if (t < 0.18) col.setRGB(1.0, 0.62, 0.5);     // reddish young leaf
    else col.setRGB(0.8 + rng() * 0.4, 0.85 + rng() * 0.35, 0.8 + rng() * 0.4);
    padMesh.setColorAt(i, col);
  });
  padMesh.frustumCulled = false;
  setLayers(padMesh, {});
  group.add(padMesh);

  // ---- flowers
  const petals = [];
  for (const f of flowers) {
    const layers = f.bud ? [[5, 1.25, 0.8], [4, 1.38, 0.66]] : [[9, 0.30, 1.0], [8, 0.66, 0.9], [7, 1.0, 0.74], [5, 1.3, 0.55]];
    const rot0 = rng() * 6.28;
    const tip = f.pink < 0.45 ? [1.0, 0.44, 0.62] : (f.pink < 0.8 ? [1.0, 0.86, 0.90] : [0.98, 0.62, 0.78]);
    layers.forEach(([n, tilt, len], li) => {
      for (let k = 0; k < n; k++) {
        petals.push({ f, az: rot0 + (k / n) * Math.PI * 2 + li * 0.37, tilt: tilt + (rng() - 0.5) * 0.08, len: f.s * len * (0.95 + rng() * 0.1), tip, li });
      }
    });
  }
  const petalMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
  petalMat.defines = { USE_UV: '' };
  petalMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_fragment>', /* glsl */`
        { float u = vUv.x; diffuseColor.rgb = mix(vec3(1.0, 0.95, 0.80), vec3(1.0), smoothstep(0.0, 0.35, u)); }`)
      .replace('#include <color_fragment>', /* glsl */`
        { float u = vUv.x; diffuseColor.rgb *= mix(vec3(1.0, 0.97, 0.9), vColor, smoothstep(0.05, 0.85, u)); }`)
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += diffuseColor.rgb * 0.16;');
  };
  petalMat.customProgramCacheKey = () => 'petal';
  const petalMesh = new THREE.InstancedMesh(petalGeometry(), petalMat, petals.length);
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  petals.forEach((pt, i) => {
    d.position.set(pt.f.x, 0.022 + pt.li * 0.004, pt.f.z);
    qa.setFromAxisAngle(Y, pt.az); qb.setFromAxisAngle(Z, pt.tilt);
    d.quaternion.copy(qa).multiply(qb);
    d.scale.set(pt.len, pt.len, pt.len);
    d.updateMatrix();
    petalMesh.setMatrixAt(i, d.matrix);
    petalMesh.setColorAt(i, col.setRGB(pt.tip[0], pt.tip[1], pt.tip[2]));
  });
  petalMesh.frustumCulled = false;
  setLayers(petalMesh, { reflect: true });
  group.add(petalMesh);

  // golden centres
  const open = flowers.filter((f) => !f.bud);
  const cMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(1.0, 0.62, 0.08), roughness: 0.6, emissive: new THREE.Color(0.9, 0.5, 0.05), emissiveIntensity: 0.35 }), Math.max(open.length, 1));
  open.forEach((f, i) => {
    d.position.set(f.x, 0.045, f.z); d.quaternion.identity(); d.scale.set(f.s * 0.2, f.s * 0.26, f.s * 0.2); d.updateMatrix();
    cMesh.setMatrixAt(i, d.matrix);
  });
  cMesh.count = open.length;
  cMesh.frustumCulled = false;
  setLayers(cMesh, { reflect: true });
  group.add(cMesh);

  // ---- stems, only visible through the water
  const stemGeo = new THREE.CylinderGeometry(1, 1, 1, 5, 6, true); stemGeo.translate(0, -0.5, 0);
  const stemMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.10, 0.17, 0.05), roughness: 0.8 });
  stemMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
      { float t = -position.y; float sc = length(instanceMatrix[0].xyz);
        transformed.x += sin(t * 3.1) * 0.10 * t / sc + t * t * 0.25 / sc; }`);
  };
  stemMat.customProgramCacheKey = () => 'stem';
  const all = pads.map((q) => ({ x: q.x, z: q.z })).concat(flowers.map((q) => ({ x: q.x, z: q.z })));
  const stemMesh = new THREE.InstancedMesh(stemGeo, stemMat, all.length);
  all.forEach((q, i) => {
    const depth = -terrainHeight(q.x, q.z);
    d.position.set(q.x, 0.0, q.z);
    d.quaternion.setFromAxisAngle(Y, rng() * 6.28);
    d.scale.set(0.008, depth + 0.02, 0.008);
    d.updateMatrix();
    stemMesh.setMatrixAt(i, d.matrix);
  });
  stemMesh.frustumCulled = false;
  stemMesh.layers.set(L_UNDER);
  group.add(stemMesh);

  // soft shadows of the pads on the water body / bed (cheap fake: dark discs just under the surface)
  const shGeo = new THREE.CircleGeometry(1, 20); shGeo.rotateX(-Math.PI / 2);
  const shMesh = new THREE.InstancedMesh(shGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }), pads.length);
  pads.forEach((pd, i) => {
    d.position.set(pd.x, -0.012, pd.z); d.quaternion.identity(); d.scale.set(pd.r * 0.98, 1, pd.r * 0.98); d.updateMatrix();
    shMesh.setMatrixAt(i, d.matrix);
  });
  shMesh.frustumCulled = false;
  shMesh.layers.set(L_UNDER);
  shMesh.renderOrder = 3;
  group.add(shMesh);

  return { group, pads, flowers };
}
