// Garden: terrain, shore stones, grass, bamboo, maple tree, shrubs.
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  POND_SX, pondEdge, pondSD, pondPoint, terrainHeight, injectWorld, setLayers, tubeGeometry,
  fbm3, noise3, mulberry32, lerp, clamp, smoothstep, uTime,
} from './common.js';

const PROJECT_SWAY = (code) => /* glsl */`
  vec4 mvPosition = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
  #endif
  ${code}
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;`;

// ------------------------------------------------------------------ terrain
export function createTerrain() {
  const NT = 220;
  const inner = [0, 0.14, 0.28, 0.42, 0.55, 0.66, 0.76, 0.84, 0.90, 0.95, 0.985];
  const outer = [0, 0.05, 0.12, 0.22, 0.35, 0.55, 0.8, 1.2, 1.7, 2.4, 3.2, 4.2, 5.5, 7, 9, 12, 16, 22, 30, 42, 60, 90, 150];
  const NR = inner.length + outer.length;
  const pos = new Float32Array(NR * NT * 3);
  const idx = [];
  for (let r = 0; r < NR; r++) {
    for (let j = 0; j < NT; j++) {
      const th = (j / NT) * Math.PI * 2;
      const e = pondEdge(th);
      const rad = r < inner.length ? e * inner[r] : e + outer[r - inner.length];
      const x = POND_SX * rad * Math.cos(th), z = rad * Math.sin(th);
      const o = (r * NT + j) * 3;
      pos[o] = x; pos[o + 1] = terrainHeight(x, z); pos[o + 2] = z;
    }
  }
  for (let r = 0; r < NR - 1; r++) {
    for (let j = 0; j < NT; j++) {
      const a = r * NT + j, b = r * NT + (j + 1) % NT, c = a + NT, d = b + NT;
      if (r > 0) idx.push(a, b, c);
      idx.push(b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    injectWorld(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_fragment>', /* glsl */`
        float kWet = 0.0;
        {
          vec2 p = vWPos.xz;
          float sd = pondSD(p);
          float n1 = fbm2(p * 0.8);
          float n2 = fbm2(p * 3.7 + 20.0);
          float n3 = vnoise(p * 31.0);
          vec3 moss = mix(vec3(0.030, 0.075, 0.020), vec3(0.085, 0.150, 0.035), n1);
          moss = mix(moss, vec3(0.12, 0.14, 0.045), smoothstep(0.52, 0.8, n2) * 0.5);
          moss *= 0.7 + 0.6 * n3;
          float peb = vnoise(p * 19.0), peb2 = vnoise(p * 43.0 + 9.0);
          vec3 gravel = mix(vec3(0.10, 0.095, 0.09), vec3(0.33, 0.30, 0.26), peb) * (0.65 + 0.7 * peb2);
          vec3 mud = mix(vec3(0.045, 0.052, 0.034), vec3(0.14, 0.13, 0.085), n2) * (0.55 + 0.9 * peb);
          float shore = smoothstep(0.10, 0.80, sd + (n2 - 0.5) * 0.6);
          vec3 col = mix(gravel, moss, shore);
          col = mix(col, mix(gravel * 0.65, mud, smoothstep(0.0, 0.6, -sd)), step(sd, 0.0));
          kWet = (1.0 - smoothstep(0.0, 0.10, vWPos.y)) * step(sd, 0.6);
          col *= mix(1.0, 0.55, kWet * step(0.0, sd));
          diffuseColor.rgb = col;
        }`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(roughness, 0.45, kWet);');
  };
  mat.customProgramCacheKey = () => 'terrain';
  const mesh = new THREE.Mesh(geo, mat);
  setLayers(mesh, { reflect: true, under: true });
  return mesh;
}

// ------------------------------------------------------------------ rocks
function makeRockGeometry(seed, detail) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  const rng = mulberry32(seed);
  const planes = [];
  for (let k = 0; k < 8; k++) {
    const n = new THREE.Vector3(rng() * 2 - 1, (rng() * 2 - 1) * 0.8, rng() * 2 - 1).normalize();
    planes.push({ n, d: 0.60 + rng() * 0.32 });
  }
  const p = g.getAttribute('position'), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let r = 1;
    for (const pl of planes) { const dn = v.dot(pl.n); if (dn > 0.05) r = Math.min(r, pl.d / dn); }
    r *= 0.80 + 0.40 * fbm3(v.x * 1.5 + seed, v.y * 1.5, v.z * 1.5);
    r += 0.05 * (noise3(v.x * 5 + seed, v.y * 5, v.z * 5) - 0.5);
    p.setXYZ(i, v.x * r, v.y * r, v.z * r);
  }
  g.computeVertexNormals();
  return g;
}

export function rockMaterial(moss = 1) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.84, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    injectWorld(sh);
    sh.uniforms.uMoss = { value: moss };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uMoss;')
      .replace('#include <map_fragment>', /* glsl */`
        float kWet = 0.0;
        {
          vec3 p = vWPos;
          float n1 = fbm3(p * 2.1);
          float n2 = fbm3(p * 8.5 + 5.0);
          vec3 c = mix(vec3(0.115, 0.112, 0.112), vec3(0.34, 0.325, 0.30), n1);
          c = mix(c, vec3(0.26, 0.21, 0.16), smoothstep(0.50, 0.75, n2) * 0.4);
          c *= 0.62 + 0.75 * n2;
          float li = smoothstep(0.64, 0.72, fbm3(p * 4.6 + 11.0));
          c = mix(c, vec3(0.40, 0.42, 0.35), li * 0.3);
          float mossM = smoothstep(0.35, 0.80, vWNrm.y + (n1 - 0.5) * 1.1) * smoothstep(0.03, 0.16, p.y);
          c = mix(c, mix(vec3(0.035, 0.085, 0.02), vec3(0.10, 0.17, 0.035), n2), mossM * 0.85 * uMoss);
          kWet = 1.0 - smoothstep(0.0, 0.09, p.y + (n2 - 0.5) * 0.06);
          c *= mix(1.0, 0.42, kWet);
          diffuseColor.rgb = c;
        }`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(roughness, 0.22, kWet);');
  };
  mat.customProgramCacheKey = () => 'rock';
  return mat;
}

export function createRocks(rng) {
  const geos = [makeRockGeometry(3, 5), makeRockGeometry(17, 5), makeRockGeometry(29, 4), makeRockGeometry(41, 4), makeRockGeometry(57, 4)];
  // flat-topped slab for stepping stones
  const FLAT = geos.length;
  {
    const g = makeRockGeometry(77, 5);
    const gp = g.getAttribute('position');
    for (let i = 0; i < gp.count; i++) gp.setY(i, clamp(gp.getY(i), -0.3, 0.3) + 0.03 * noise3(gp.getX(i) * 3, 0, gp.getZ(i) * 3));
    g.computeVertexNormals();
    geos.push(g);
  }
  const lists = geos.map(() => []);
  const d = new THREE.Object3D(), p = new THREE.Vector3();
  const footprints = [];   // big stones (for placing other things)
  let n = 0;
  const add = (x, y, z, sx, sy, sz, variant) => {
    d.position.set(x, y, z);
    const tilt = variant === FLAT ? 0.06 : 0.5;
    d.rotation.set((rng() - 0.5) * tilt, rng() * Math.PI * 2, (rng() - 0.5) * tilt);
    d.scale.set(sx, sy, sz);
    d.updateMatrix();
    const g = variant !== undefined ? variant : (n++ % FLAT);
    lists[g].push({ m: d.matrix.clone(), tint: 0.82 + rng() * 0.36 });
  };
  // main ring of shore stones
  let th = 0;
  while (th < Math.PI * 2 - 0.03) {
    const big = rng() < 0.18;
    const s = big ? 0.22 + rng() * 0.11 : 0.085 + rng() * 0.10;   // s = radius
    pondPoint(th + (rng() - 0.5) * 0.02, -0.03 + rng() * 0.14 + (big ? 0.06 : 0), p);
    add(p.x, -0.02 + s * 0.14 + rng() * 0.02, p.z, s * (0.9 + rng() * 0.5), s * (0.55 + rng() * 0.3), s * (0.9 + rng() * 0.4));
    if (big) footprints.push({ x: p.x, z: p.z, r: s });
    th += (s * 1.75 + 0.02) / (pondEdge(th) * 1.1);
  }
  // second, looser row + scattered small stones on the bank
  for (let i = 0; i < 170; i++) {
    const s = 0.035 + rng() * rng() * 0.13;
    pondPoint(rng() * Math.PI * 2, 0.16 + rng() * rng() * 1.1, p);
    add(p.x, terrainHeight(p.x, p.z) + s * 0.12, p.z, s * (0.9 + rng() * 0.5), s * (0.5 + rng() * 0.3), s * (0.9 + rng() * 0.4));
  }
  // feature boulders
  for (const [a, sd, s] of [[2.85, 0.55, 0.46], [3.25, 0.85, 0.30], [-0.72, 0.6, 0.40], [-0.2, 0.7, 0.27], [0.95, 0.6, 0.34], [-1.6, 0.7, 0.32], [1.95, 0.75, 0.26], [0.35, 0.7, 0.36], [-2.95, 0.7, 0.3]]) {
    pondPoint(a, sd, p);
    add(p.x, terrainHeight(p.x, p.z) + s * 0.18, p.z, s * 1.15, s * 0.8, s);
    footprints.push({ x: p.x, z: p.z, r: s * 1.1 });
  }
  // pebbles and stones on the pond bed
  for (let i = 0; i < 150; i++) {
    const s = 0.03 + rng() * rng() * 0.12;
    pondPoint(rng() * Math.PI * 2, -0.1 - rng() * 2.4, p);
    if (pondSD(p.x, p.z) > -0.1) continue;
    add(p.x, terrainHeight(p.x, p.z) + s * 0.15, p.z, s * (1 + rng() * 0.5), s * (0.5 + rng() * 0.3), s * (1 + rng() * 0.4));
  }
  // stepping stones leading to the water
  {
    const s0 = pondPoint(1.42, 0.55);
    let ang = 1.35;
    for (let k = 0; k < 8; k++) {
      const s = 0.25 + rng() * 0.07;
      add(s0.x, terrainHeight(s0.x, s0.z) + 0.005, s0.z, s * (1.15 + rng() * 0.25), 0.2, s * (0.95 + rng() * 0.2), FLAT);
      footprints.push({ x: s0.x, z: s0.z, r: s * 1.45 });
      ang += (rng() - 0.35) * 0.32;
      s0.x += Math.cos(ang) * 0.66; s0.z += Math.sin(ang) * 0.66;
    }
  }
  // a few rocks standing in the shallows
  for (const [a, sd, s] of [[0.25, -0.35, 0.20], [2.5, -0.4, 0.17], [-1.55, -0.3, 0.16], [-2.9, -0.4, 0.21]]) {
    pondPoint(a, sd, p);
    add(p.x, -0.03, p.z, s * 1.2, s * 0.75, s);
  }

  const group = new THREE.Group();
  const mat = rockMaterial(1);
  const col = new THREE.Color();
  geos.forEach((g, gi) => {
    const mesh = new THREE.InstancedMesh(g, mat, lists[gi].length);
    lists[gi].forEach((it, i) => {
      mesh.setMatrixAt(i, it.m);
      mesh.setColorAt(i, col.setRGB(it.tint, it.tint * (0.97 + rng() * 0.06), it.tint * (0.94 + rng() * 0.1)));
    });
    mesh.frustumCulled = false;
    group.add(mesh);
  });
  setLayers(group, { reflect: true, under: true });
  return { group, footprints };
}

// ------------------------------------------------------------------ grass
export function createGrass(rng, footprints = []) {
  // one tuft = three curved blades
  const pos = [], col = [], nrm = [], idx = [];
  const SEG = 4;
  for (let b = 0; b < 3; b++) {
    const ang = (b / 3) * Math.PI * 2 + 0.4, lean = 0.22 + b * 0.14, hgt = 1 - b * 0.18, wid = 0.085;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const base = pos.length / 3;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      const w = wid * (1 - Math.pow(t, 1.6)) * 0.5;
      const out = lean * t * t + 0.05 * b;
      for (const s of [-1, 1]) {
        const lx = out, lz = s * w;
        pos.push(lx * ca - lz * sa, t * hgt, lx * sa + lz * ca);
        nrm.push(ca * 0.35, 0.94, sa * 0.35);
        const c = 0.22 + 0.78 * t;
        col.push(c, c, c);
      }
    }
    for (let i = 0; i < SEG; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);

  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <project_vertex>', PROJECT_SWAY(/* glsl */`
        float gh = position.y * position.y * length(instanceMatrix[1].xyz);
        vec2 gp = instanceMatrix[3].xz;
        mvPosition.xz += vec2(sin(uTime * 1.3 + gp.x * 0.9 + gp.y * 0.6) + 0.5 * sin(uTime * 2.7 + gp.x * 2.1),
                              cos(uTime * 1.1 + gp.x * 0.5 - gp.y * 0.8)) * 0.085 * gh;`));
  };
  mat.customProgramCacheKey = () => 'grass';

  const mats = [], cols = [];
  const d = new THREE.Object3D(), p = new THREE.Vector3(), c = new THREE.Color();
  const blocked = (x, z, pad) => footprints.some((f) => Math.hypot(f.x - x, f.z - z) < f.r * 0.8 + pad);
  const put = (x, z, h, tint) => {
    d.position.set(x, terrainHeight(x, z) - 0.01, z);
    d.rotation.set(0, rng() * Math.PI * 2, 0);
    d.scale.set(h * (0.8 + rng() * 0.5), h, h * (0.8 + rng() * 0.5));
    d.updateMatrix();
    mats.push(d.matrix.clone());
    cols.push(c.clone().multiplyScalar(tint));
  };
  // lawn / moss tufts, denser near the pond
  let tries = 0;
  while (mats.length < 42000 && tries++ < 300000) {
    const sd = 0.3 + Math.pow(rng(), 1.7) * 12;
    pondPoint(rng() * Math.PI * 2, sd, p);
    if (blocked(p.x, p.z, 0)) continue;
    const patch = fbm3(p.x * 0.35, 0, p.z * 0.35);
    if (rng() > 0.25 + patch * 1.3) continue;
    c.setRGB(0.16 + rng() * 0.10, 0.30 + rng() * 0.14, 0.06 + rng() * 0.04);
    if (rng() < 0.12) c.setRGB(0.30, 0.34, 0.09);
    put(p.x, p.z, 0.05 + rng() * 0.07 + patch * 0.09, 1);
  }
  // taller iris / reed clumps at the water's edge
  for (const [a, n] of [[2.25, 46], [0.55, 36], [-1.0, 40], [-2.45, 44], [1.4, 26], [3.5, 30], [-0.1, 26]]) {
    for (let i = 0; i < n; i++) {
      pondPoint(a + (rng() - 0.5) * 0.3, 0.12 + (rng() - 0.5) * 0.5, p);
      c.setRGB(0.20 + rng() * 0.08, 0.36 + rng() * 0.12, 0.10);
      put(p.x, p.z, 0.28 + rng() * 0.34, 1);
    }
  }
  const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, cols[i]); });
  mesh.frustumCulled = false;
  setLayers(mesh, { reflect: true });
  return mesh;
}

// ------------------------------------------------------------------ bamboo
const BAMBOO_SWAY = /* glsl */`
vec2 bSway(float hh, float ph){
  return vec2(sin(uTime * 0.55 + ph) + 0.4 * sin(uTime * 1.3 + ph * 2.1), cos(uTime * 0.43 + ph * 1.7)) * 0.22 * hh * hh;
}`;

export function createBamboo(rng) {
  const clumps = [[-2.72, 13.2, 13], [-1.22, 13.6, 12], [-0.52, 13.0, 10], [0.30, 14.5, 11], [1.02, 15.5, 12], [1.75, 16.5, 10],
    [2.35, 15.0, 12], [3.0, 13.6, 10], [-1.82, 21, 9], [-2.28, 18, 8], [-0.9, 19, 9], [0.0, 20, 8], [2.7, 20, 8], [1.4, 21, 8]];
  const culms = [];
  for (const [az, rad, n] of clumps) {
    const cx = Math.cos(az) * rad, cz = Math.sin(az) * rad;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 1.9;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      culms.push({
        x, z, y: terrainHeight(x, z) - 0.1, H: 6.5 + rng() * 4.5, r: 0.04 + rng() * 0.03,
        rot: rng() * Math.PI * 2, bend: 0.5 + rng() * 1.5, ph: rng() * 6.28,
      });
    }
  }
  const group = new THREE.Group();
  const d = new THREE.Object3D(), col = new THREE.Color();

  // culms
  const cg = new THREE.CylinderGeometry(0.72, 1, 1, 6, 12, true); cg.translate(0, 0.5, 0);
  const aBam = new THREE.InstancedBufferAttribute(new Float32Array(culms.length * 2), 2);
  cg.setAttribute('aBam', aBam);
  const cm = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 });
  cm.onBeforeCompile = (sh) => {
    injectWorld(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aBam;\n' + BAMBOO_SWAY)
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
        transformed.x += aBam.x * pow(position.y, 2.2) / length(instanceMatrix[0].xyz);`)
      .replace('#include <project_vertex>', PROJECT_SWAY('mvPosition.xz += bSway(position.y, aBam.y);'));
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', /* glsl */`
      {
        float f = fract(vWPos.y / 0.46 + vWPos.x * 0.7);
        float node = 1.0 - smoothstep(0.0, 0.035, abs(f - 0.5));
        float band = 1.0 - smoothstep(0.0, 0.12, abs(f - 0.56));
        vec3 c = mix(vec3(0.20, 0.31, 0.08), vec3(0.34, 0.40, 0.13), vnoise(vWPos.xz * 3.0));
        c = mix(c, c * 1.5 + 0.03, band * 0.5);
        c = mix(c, vec3(0.05, 0.06, 0.03), node);
        diffuseColor.rgb = c;
      }`);
  };
  cm.customProgramCacheKey = () => 'culm';
  const culmMesh = new THREE.InstancedMesh(cg, cm, culms.length);
  culms.forEach((c, i) => {
    d.position.set(c.x, c.y, c.z); d.rotation.set(0, c.rot, 0); d.scale.set(c.r, c.H, c.r); d.updateMatrix();
    culmMesh.setMatrixAt(i, d.matrix);
    culmMesh.setColorAt(i, col.setRGB(0.8 + rng() * 0.4, 0.8 + rng() * 0.4, 0.8 + rng() * 0.3));
    aBam.setXY(i, c.bend, c.ph);
  });
  culmMesh.frustumCulled = false;
  group.add(culmMesh);

  // leaf sprays
  const lp = [];
  const leaf = (len, wid, yaw, droop, ox) => {
    const pts = [[0, 0, 0], [len * 0.38, 0, -wid], [len * 0.38, 0, wid], [len, 0, 0]];
    const tri = [0, 2, 1, 1, 2, 3];
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cd = Math.cos(droop), sd = Math.sin(droop);
    for (const t of tri) {
      let [x, y, z] = pts[t];
      y += -0.12 * x * x / len;         // slight arch
      const x1 = x * cd, y1 = -x * sd + y;   // droop
      lp.push(ox + x1 * cy - z * sy, y1, x1 * sy + z * cy);
    }
  };
  leaf(0.50, 0.040, 0.0, 0.45, 0.02); leaf(0.44, 0.038, 0.75, 0.6, 0); leaf(0.44, 0.038, -0.75, 0.55, 0);
  leaf(0.36, 0.034, 1.5, 0.8, -0.02); leaf(0.36, 0.034, -1.5, 0.75, -0.02); leaf(0.4, 0.035, 2.6, 0.5, 0);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  lg.computeVertexNormals();
  const PER = 46;
  const nL = culms.length * PER;
  const aBamL = new THREE.InstancedBufferAttribute(new Float32Array(nL * 2), 2);
  lg.setAttribute('aBam', aBamL);
  const lm = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, side: THREE.DoubleSide });
  lm.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute vec2 aBam;\n' + BAMBOO_SWAY)
      .replace('#include <project_vertex>', PROJECT_SWAY(/* glsl */`
        mvPosition.xz += bSway(aBam.x, aBam.y);
        mvPosition.xyz += vec3(sin(uTime * 1.7 + mvPosition.x * 1.3 + mvPosition.y), sin(uTime * 2.1 + mvPosition.z * 1.7), cos(uTime * 1.5 + mvPosition.y * 1.1)) * 0.035 * length(position);`));
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += diffuseColor.rgb * 0.03;');
  };
  lm.customProgramCacheKey = () => 'bambooleaf';
  const leafMesh = new THREE.InstancedMesh(lg, lm, nL);
  let li = 0;
  for (const c of culms) {
    for (let k = 0; k < PER; k++) {
      const hh = 0.32 + 0.68 * Math.pow(rng(), 0.7);
      const bx = c.bend * Math.pow(hh, 2.2);
      const a = rng() * Math.PI * 2, rr = 0.1 + rng() * 0.55 * (0.4 + hh);
      d.position.set(c.x + bx * Math.cos(c.rot) + Math.cos(a) * rr, c.y + hh * c.H + (rng() - 0.5) * 0.4, c.z - bx * Math.sin(c.rot) + Math.sin(a) * rr);
      d.rotation.set((rng() - 0.5) * 0.7, -a + (rng() - 0.5), (rng() - 0.5) * 0.7);
      const s = 0.9 + rng() * 0.9;
      d.scale.set(s, s, s); d.updateMatrix();
      leafMesh.setMatrixAt(li, d.matrix);
      const g = 0.75 + rng() * 0.5;
      leafMesh.setColorAt(li, col.setRGB(0.15 * g, 0.26 * g, 0.055 * g));
      aBamL.setXY(li, hh, c.ph);
      li++;
    }
  }
  leafMesh.frustumCulled = false;
  group.add(leafMesh);
  setLayers(group, { reflect: true });
  return group;
}

// ------------------------------------------------------------------ maple tree
export function mapleLeafGeometry() {
  // seven-lobed leaf lying in the XZ plane, stem towards -x
  const lobes = [[0, 1.0], [0.87, 0.86], [-0.87, 0.86], [1.75, 0.62], [-1.75, 0.62], [2.5, 0.36], [-2.5, 0.36]];
  lobes.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (let i = 0; i < lobes.length; i++) {
    const [a, r] = lobes[i];
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
    if (i < lobes.length - 1) {
      const am = (a + lobes[i + 1][0]) / 2;
      out.push([Math.cos(am) * 0.34, Math.sin(am) * 0.34]);
    }
  }
  out.push([-0.16, 0]);   // stem notch
  const pos = [];
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = out[(i + 1) % out.length];
    pos.push(0, 0, 0, b[0], 0.06 * (b[0] * b[0] + b[1] * b[1]), b[1], a[0], 0.06 * (a[0] * a[0] + a[1] * a[1]), a[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function leafMaterial(flutter = 0.02) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <project_vertex>', PROJECT_SWAY(/* glsl */`
        vec3 lp0 = instanceMatrix[3].xyz;
        float lph = lp0.x * 1.7 + lp0.z * 1.3 + lp0.y * 2.1;
        mvPosition.xyz += vec3(sin(uTime * 0.9 + lph), 0.5 * sin(uTime * 1.6 + lph * 1.3), cos(uTime * 0.7 + lph * 0.8)) * ${flutter.toFixed(3)}
                        + vec3(sin(uTime * 3.1 + lph * 3.0), cos(uTime * 3.7 + lph * 2.0), 0.0) * ${(flutter * 0.4).toFixed(4)} * length(position);`));
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += diffuseColor.rgb * 0.09;');
  };
  m.customProgramCacheKey = () => 'mapleleaf' + flutter;
  return m;
}

export const LEAF_COLORS = [[0.50, 0.03, 0.025], [0.70, 0.07, 0.03], [0.80, 0.14, 0.03], [0.88, 0.28, 0.04], [0.92, 0.45, 0.07], [0.60, 0.04, 0.05]];

export function createMaple(rng, th = -0.42, sdOut = 1.0) {
  const base = pondPoint(th, sdOut);
  base.y = terrainHeight(base.x, base.z) - 0.1;
  const toPond = new THREE.Vector3(-base.x, 0, -base.z).normalize();
  const tubes = [], tips = [];
  const MAXD = 4;
  const up = new THREE.Vector3(0, 1, 0);
  const grow = (p0, dir, len, rad, depth) => {
    const n = 5, pts = [], radii = [];
    const p = p0.clone(), dd = dir.clone();
    for (let i = 0; i <= n; i++) {
      pts.push(p.clone()); radii.push(rad * (1 - 0.38 * i / n));
      dd.x += (rng() - 0.5) * 0.34; dd.z += (rng() - 0.5) * 0.34;
      dd.y += (rng() - 0.5) * 0.22 + (depth >= 2 ? -dd.y * 0.28 + 0.035 : 0.06);
      if (depth > 0 && p.y < base.y + 1.9) dd.y += 0.22;      // keep the canopy off the ground
      if (depth === 0) dd.addScaledVector(toPond, 0.06);
      dd.normalize();
      p.addScaledVector(dd, len / n);
    }
    tubes.push(tubeGeometry(pts, radii, depth < 2 ? 8 : 5));
    if (depth >= MAXD) { tips.push(p.clone()); return; }
    if (depth >= MAXD - 1) tips.push(pts[3].clone());
    const nc = depth === 0 ? 3 : (rng() < 0.4 ? 3 : 2);
    const side = new THREE.Vector3().crossVectors(dd, up).normalize();
    for (let c = 0; c < nc; c++) {
      const roll = (c / nc) * Math.PI * 2 + rng() * 1.2;
      const spread = 0.45 + rng() * 0.45;
      const axis = side.clone().applyAxisAngle(dd, roll);
      const cd = dd.clone().applyAxisAngle(axis, spread);
      if (depth === 0) cd.addScaledVector(toPond, 0.35).normalize();
      grow(pts[n - (c === 0 ? 0 : (rng() < 0.5 ? 1 : 0))], cd, len * (0.66 + rng() * 0.14), rad * 0.6, depth + 1);
    }
  };
  grow(base, new THREE.Vector3(toPond.x * 0.38, 1, toPond.z * 0.38).normalize(), 1.55, 0.14, 0);

  const wood = new THREE.Mesh(mergeGeometries(tubes), (() => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    m.onBeforeCompile = (sh) => {
      injectWorld(sh);
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', /* glsl */`
        { float n = fbm3(vWPos * vec3(9.0, 1.6, 9.0)); diffuseColor.rgb = mix(vec3(0.045, 0.035, 0.03), vec3(0.16, 0.12, 0.09), n); }`);
    };
    m.customProgramCacheKey = () => 'bark';
    return m;
  })());

  // leaves in flat, layered clouds around the branch tips
  const PER = 135;
  const leaves = new THREE.InstancedMesh(mapleLeafGeometry(), leafMaterial(0.02), tips.length * PER);
  const d = new THREE.Object3D(), col = new THREE.Color();
  let i = 0;
  const canopy = new THREE.Box3();
  for (const t of tips) {
    const rx = 0.5 + rng() * 0.3, ry = 0.14 + rng() * 0.1;
    const ci = Math.floor(rng() * 3);
    for (let k = 0; k < PER; k++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()), v = (rng() + rng() + rng()) / 1.5 - 1;
      d.position.set(t.x + Math.cos(a) * r * rx, t.y + 0.05 + v * ry - r * r * 0.12, t.z + Math.sin(a) * r * rx);
      d.rotation.set((rng() - 0.5) * 1.1, rng() * Math.PI * 2, (rng() - 0.5) * 1.1);
      const s = 0.062 + rng() * 0.05;
      d.scale.set(s, s, s); d.updateMatrix();
      leaves.setMatrixAt(i, d.matrix);
      const c = LEAF_COLORS[Math.min(LEAF_COLORS.length - 1, Math.floor(rng() * 3.2) + ci)];
      const g = 0.75 + rng() * 0.5;
      leaves.setColorAt(i, col.setRGB(c[0] * g, c[1] * g, c[2] * g));
      canopy.expandByPoint(d.position);
      i++;
    }
  }
  leaves.frustumCulled = false;
  const group = new THREE.Group();
  group.add(wood, leaves);
  setLayers(group, { reflect: true });
  return { group, tips, canopy, base };
}

// ------------------------------------------------------------------ low bamboo fence behind the far bank
export function createFence() {
  const items = [];
  const d = new THREE.Object3D(), Y = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3();
  const stick = (a, b, r) => {
    v.subVectors(b, a);
    const len = v.length();
    d.position.copy(a).addScaledVector(v, 0.5);
    d.quaternion.setFromUnitVectors(Y, v.normalize());
    d.scale.set(r, len, r);
    d.updateMatrix();
    items.push(d.matrix.clone());
  };
  const pts = [];
  const N = 30;
  for (let i = 0; i <= N; i++) {
    const a = -3.02 + (i / N) * 2.9;
    const x = Math.cos(a) * 9.4, z = Math.sin(a) * 7.3 - 0.4;
    pts.push(new THREE.Vector3(x, terrainHeight(x, z), z));
  }
  const up = (p, h) => new THREE.Vector3(p.x, p.y + h, p.z);
  for (let i = 0; i <= N; i++) {
    stick(up(pts[i], -0.1), up(pts[i], 1.12), 0.034);
    if (i === N) break;
    for (const h of [0.34, 0.66, 0.98]) stick(up(pts[i], h), up(pts[i + 1], h), 0.017);
    for (let k = 1; k < 4; k++) {
      const m = pts[i].clone().lerp(pts[i + 1], k / 4);
      stick(up(m, 0.0), up(m, 1.06 - (k % 2) * 0.05), 0.014);
    }
  }
  const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.30, 0.215, 0.105), roughness: 0.7 });
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.frustumCulled = false;
  setLayers(mesh, { reflect: true });
  return mesh;
}

// ------------------------------------------------------------------ rounded shrubs
export function createShrubs(rng, avoid = []) {
  let g = new THREE.IcosahedronGeometry(1, 4);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  const p = g.getAttribute('position'), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const r = 0.86 + 0.3 * fbm3(v.x * 2.2 + 3, v.y * 2.2, v.z * 2.2) + 0.05 * noise3(v.x * 9, v.y * 9, v.z * 9);
    p.setXYZ(i, v.x * r, v.y * r, v.z * r);
  }
  g.computeVertexNormals();
  const places = [];
  let tries = 0;
  while (places.length < 20 && tries++ < 2000) {
    const q = pondPoint(rng() * Math.PI * 2, 1.7 + rng() * 7.5);
    const s = 0.32 + rng() * 0.42;
    const rad = Math.hypot(q.x, q.z);
    if (q.z > -2.5 && rad > 5.6 && rad < 10.5) continue;      // keep the camera's path clear
    if (q.z > 1.2 && Math.abs(q.x) < 4.5) continue;           // and the front bank open
    if (places.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < (o.s + s) * 1.3)) continue;
    if (avoid.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < o.r + s)) continue;
    places.push({ x: q.x, z: q.z, s });
  }
  const aBloom = new THREE.InstancedBufferAttribute(new Float32Array(places.length), 1);
  g.setAttribute('aBloom', aBloom);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    injectWorld(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aBloom; varying float vBloom;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBloom = aBloom;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBloom;')
      .replace('#include <map_fragment>', /* glsl */`
        float kFl = 0.0;
        {
          float n = vnoise3(vWPos * 26.0), n2 = vnoise3(vWPos * 60.0 + 7.0);
          vec3 c = mix(vec3(0.022, 0.060, 0.018), vec3(0.085, 0.165, 0.04), n * n2 * 1.8);
          c *= 0.55 + 0.6 * smoothstep(-0.2, 0.8, vWNrm.y);
          kFl = smoothstep(0.66, 0.74, vnoise3(vWPos * 46.0 + 40.0)) * smoothstep(0.35, 0.6, vnoise3(vWPos * 5.0)) * vBloom * smoothstep(-0.3, 0.3, vWNrm.y);
          c = mix(c, mix(vec3(0.85, 0.16, 0.36), vec3(0.95, 0.5, 0.62), n2), kFl);
          diffuseColor.rgb = c;
        }`)
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += diffuseColor.rgb * 0.10 * kFl;');
  };
  mat.customProgramCacheKey = () => 'shrub';
  const mesh = new THREE.InstancedMesh(g, mat, places.length);
  const d = new THREE.Object3D();
  places.forEach((pl, i) => {
    d.position.set(pl.x, terrainHeight(pl.x, pl.z) + pl.s * 0.22, pl.z);
    d.rotation.set(0, rng() * 6.28, 0);
    d.scale.set(pl.s * (1 + rng() * 0.4), pl.s * (0.62 + rng() * 0.2), pl.s * (1 + rng() * 0.4));
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
    aBloom.setX(i, rng() < 0.4 ? 1 : 0);
  });
  mesh.frustumCulled = false;
  setLayers(mesh, { reflect: true });
  return mesh;
}
