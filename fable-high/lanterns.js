// Paper lanterns: floating on the water, hanging on a rope across the far corner, plus a stone lantern.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pondPoint, terrainHeight, setLayers } from './common.js';
import { rockMaterial } from './garden.js';

function paperMaterial(color, halfH, ribs = 0) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color[0], color[1], color[2]) },
      uGain: { value: 1 }, uH: { value: halfH }, uRibs: { value: ribs },
    },
    vertexShader: /* glsl */`
      varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){
        vP = position; vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uGain, uH, uRibs;
      varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){
        float h = clamp(vP.y / uH * 0.5 + 0.5, 0.0, 1.0);
        float core = exp(-pow((h - 0.40) * 2.3, 2.0));
        float nv = abs(dot(normalize(vN), normalize(vV)));
        float limb = mix(0.50, 1.0, pow(nv, 0.9));
        float rib = 1.0 - uRibs * 0.30 * smoothstep(0.55, 1.0, sin(vP.y * 165.0));
        float fibre = 0.94 + 0.06 * sin(vP.x * 240.0 + sin(vP.y * 90.0) * 2.0) * sin(vP.z * 210.0 + vP.y * 50.0);
        vec3 c = uColor * (0.50 + 1.25 * core) * limb * rib * fibre;
        c += vec3(1.0, 0.72, 0.36) * core * core * 0.75 * limb;
        gl_FragColor = vec4(c * uGain, 1.0);
      }`,
    side: THREE.DoubleSide, fog: false,
  });
}

const woodMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.075, 0.045, 0.028), roughness: 0.75 });
const blackMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.02, 0.018, 0.016), roughness: 0.55 });

const WARM = new THREE.Color(1.0, 0.56, 0.24);

function floatingLantern() {
  const g = new THREE.Group();
  const S = 0.27, H = 0.30;
  const parts = [];
  const box = (w, h, dd, x, y, z) => { const b = new THREE.BoxGeometry(w, h, dd); b.translate(x, y, z); parts.push(b); };
  box(0.37, 0.03, 0.37, 0, 0.012, 0);
  const o = S / 2;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) box(0.016, H + 0.02, 0.016, sx * o, 0.027 + H / 2, sz * o);
  for (const y of [0.035, 0.027 + H]) {
    box(S + 0.016, 0.014, 0.014, 0, y, o); box(S + 0.016, 0.014, 0.014, 0, y, -o);
    box(0.014, 0.014, S + 0.016, o, y, 0); box(0.014, 0.014, S + 0.016, -o, y, 0);
  }
  g.add(new THREE.Mesh(mergeGeometries(parts), woodMat));
  let pg = new THREE.CylinderGeometry(S * Math.SQRT1_2, S * Math.SQRT1_2, H, 4, 1, true);
  pg.rotateY(Math.PI / 4);
  pg = pg.toNonIndexed(); pg.computeVertexNormals();
  const mat = paperMaterial([1.75, 0.82, 0.27], H / 2);
  const paper = new THREE.Mesh(pg, mat);
  paper.position.y = 0.027 + H / 2;
  g.add(paper);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3.6, 1.4) }));
  flame.position.y = 0.11; flame.scale.y = 1.6;
  g.add(flame);
  const light = new THREE.PointLight(WARM, 0.9, 7, 2);
  light.position.y = 0.42;
  g.add(light);
  return { group: g, mat, light, base: 0.9 };
}

function hangingLantern(color) {
  const g = new THREE.Group();
  const R = 0.16, SY = 1.22, drop = 0.16;
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, drop, 4), blackMat);
  string.position.y = -drop / 2; g.add(string);
  const capG = new THREE.CylinderGeometry(0.05, 0.058, 0.03, 14);
  const top = new THREE.Mesh(capG, blackMat); top.position.y = -drop - 0.012; g.add(top);
  const cy = -drop - 0.03 - R * SY + 0.02;
  const mat = paperMaterial(color, R * SY, 1);
  const body = new THREE.Mesh(new THREE.SphereGeometry(R, 28, 20), mat);
  body.scale.y = SY; body.position.y = cy; g.add(body);
  const bot = new THREE.Mesh(capG, blackMat); bot.rotation.x = Math.PI; bot.position.y = cy - R * SY + 0.012; g.add(bot);
  const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.014, 0.16, 5),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(0.5, 0.05, 0.03), roughness: 0.8 }));
  tassel.position.y = cy - R * SY - 0.085; g.add(tassel);
  bot.userData.noReflect = tassel.userData.noReflect = true;   // seen from below they would punch a dark hole in the glow
  return { group: g, mat, cy };
}

function stoneLantern() {
  const g = new THREE.Group();
  const parts = [];
  const add = (geo, y, ry = 0) => { geo.rotateY(ry); geo.translate(0, y, 0); parts.push(geo.toNonIndexed()); };
  add(new THREE.CylinderGeometry(0.27, 0.32, 0.13, 6), 0.065);
  add(new THREE.CylinderGeometry(0.105, 0.125, 0.52, 10), 0.39);
  add(new THREE.CylinderGeometry(0.25, 0.15, 0.10, 6), 0.70);
  // fire box: four corner posts + top/bottom slabs, leaving windows
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const b = new THREE.BoxGeometry(0.07, 0.26, 0.07); b.translate(sx * 0.125, 0.88, sz * 0.125); parts.push(b.toNonIndexed());
  }
  add(new THREE.BoxGeometry(0.34, 0.035, 0.34), 0.765);
  add(new THREE.BoxGeometry(0.34, 0.035, 0.34), 1.0);
  // roof with a gentle flare
  const prof = [[0.0, 1.30], [0.07, 1.27], [0.16, 1.19], [0.30, 1.10], [0.46, 1.035], [0.47, 1.005], [0.0, 1.005]].map(([r, y]) => new THREE.Vector2(r, y));
  parts.push(new THREE.LatheGeometry(prof, 6).toNonIndexed());
  const fin = new THREE.SphereGeometry(0.065, 10, 8); fin.scale(1, 1.35, 1); fin.translate(0, 1.36, 0); parts.push(fin.toNonIndexed());
  parts.forEach((p) => { p.deleteAttribute('uv'); p.computeVertexNormals(); });
  const stoneMat = rockMaterial(0.55);
  stoneMat.side = THREE.DoubleSide;
  const stone = new THREE.Mesh(mergeGeometries(parts), stoneMat);
  g.add(stone);
  const mat = paperMaterial([2.4, 1.2, 0.42], 0.11);
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.22, 0.21), mat);
  paper.position.y = 0.885;
  g.add(paper);
  const light = new THREE.PointLight(WARM, 2.4, 9, 2);
  light.position.y = 0.9;
  g.add(light);
  return { group: g, mat, light, base: 2.4 };
}

export function createLanterns(scene, sim) {
  const root = new THREE.Group();
  const flick = [];   // { mat, light, base, ph }

  // ---- floating lanterns
  const floaters = [];
  const anchors = [[-1.75, 0.25], [0.35, -0.65], [1.45, 1.15]];
  anchors.forEach(([x, z], i) => {
    const L = floatingLantern();
    L.group.position.set(x, 0, z);
    L.group.rotation.y = i * 1.1 + 0.3;
    root.add(L.group);
    floaters.push({ ...L, ax: x, az: z, ph: i * 2.1, x, z, r: 0.42, dropT: i });
    flick.push({ mat: L.mat, light: L.light, base: L.base, ph: i * 7.3 });
  });

  // ---- rope of hanging lanterns across the far corner of the pond
  const pA = pondPoint(-2.08, 0.62), pB = pondPoint(-0.70, 0.62);
  const hA = 2.35, hB = 2.25;
  pA.y = terrainHeight(pA.x, pA.z); pB.y = terrainHeight(pB.x, pB.z);
  const postG = [];
  for (const [p, h] of [[pA, hA], [pB, hB]]) {
    const c = new THREE.CylinderGeometry(0.04, 0.055, h + 0.3, 8); c.translate(p.x, p.y + h / 2 - 0.15, p.z); postG.push(c);
    const k = new THREE.CylinderGeometry(0.06, 0.06, 0.03, 8); k.translate(p.x, p.y + h + 0.01, p.z); postG.push(k);
  }
  const top = (p, h) => new THREE.Vector3(p.x, p.y + h - 0.08, p.z);
  const a = top(pA, hA), b = top(pB, hB);
  const mid = a.clone().lerp(b, 0.5); mid.y -= 0.8;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  const rope = new THREE.TubeGeometry(curve, 40, 0.009, 5);
  postG.push(rope);
  postG.forEach((g) => { g.deleteAttribute('uv'); });
  root.add(new THREE.Mesh(mergeGeometries(postG.map((g) => g.index ? g.toNonIndexed() : g)), woodMat));

  const hangers = [];
  const cols = [[1.7, 0.80, 0.27], [1.8, 0.62, 0.19], [1.7, 0.86, 0.30], [1.8, 0.60, 0.18], [1.7, 0.80, 0.27]];
  const ts = [0.17, 0.335, 0.5, 0.665, 0.83];
  const lightAt = [];
  ts.forEach((t, i) => {
    const p = curve.getPoint(t);
    const L = hangingLantern(cols[i]);
    L.group.position.copy(p);
    root.add(L.group);
    hangers.push({ ...L, ph: i * 1.9 });
    flick.push({ mat: L.mat, light: null, base: 1, ph: 20 + i * 5.1 });
    lightAt.push(new THREE.Vector3(p.x, p.y + L.cy, p.z));
  });
  // three lights shared by the five lanterns
  for (const [i0, i1] of [[0, 1], [2, 2], [3, 4]]) {
    const l = new THREE.PointLight(WARM, 2.6, 9, 2);
    l.position.copy(lightAt[i0]).lerp(lightAt[i1], 0.5);
    root.add(l);
    flick.push({ mat: null, light: l, base: 2.6, ph: 40 + i0 * 3.3 });
  }

  // ---- stone lantern on the left bank
  const sl = stoneLantern();
  const sp = pondPoint(-2.42, 0.8);
  sl.group.position.set(sp.x, terrainHeight(sp.x, sp.z) - 0.03, sp.z);
  sl.group.rotation.y = 0.35;
  root.add(sl.group);
  flick.push({ mat: sl.mat, light: sl.light, base: sl.base, ph: 60 });

  setLayers(root, { reflect: true });
  root.traverse((o) => { if (o.isLight) o.layers.enableAll(); if (o.userData.noReflect) o.layers.set(0); });
  scene.add(root);

  const stonePos = { x: sp.x, z: sp.z, r: 0.5 };
  const posts = [{ x: pA.x, z: pA.z, r: 0.25 }, { x: pB.x, z: pB.z, r: 0.25 }];

  function update(t, dt) {
    for (const f of flick) {
      const n = 0.5 * Math.sin(t * 7.3 + f.ph) + 0.3 * Math.sin(t * 12.7 + f.ph * 1.7) + 0.2 * Math.sin(t * 23.1 + f.ph * 2.3);
      const k = 1 + 0.07 * n + 0.04 * Math.sin(t * 1.3 + f.ph);
      if (f.mat) f.mat.uniforms.uGain.value = k;
      if (f.light) f.light.intensity = f.base * k;
    }
    for (const f of floaters) {
      f.x = f.ax + 0.22 * Math.sin(t * 0.045 + f.ph) + 0.08 * Math.sin(t * 0.11 + f.ph * 2.0);
      f.z = f.az + 0.20 * Math.cos(t * 0.038 + f.ph * 1.3);
      f.group.position.set(f.x, 0.004 * Math.sin(t * 1.1 + f.ph), f.z);
      f.group.rotation.set(0.012 * Math.sin(t * 0.9 + f.ph), f.ph + t * 0.02, 0.012 * Math.sin(t * 0.7 + f.ph * 2.0));
      f.dropT -= dt;
      if (f.dropT <= 0) { f.dropT = 2.2 + Math.random() * 1.5; sim.addDrop(f.x, f.z, 0.22, 0.012); }
    }
    for (const h of hangers) {
      h.group.rotation.z = 0.055 * Math.sin(t * 1.05 + h.ph) + 0.02 * Math.sin(t * 2.3 + h.ph * 2.0);
      h.group.rotation.x = 0.04 * Math.sin(t * 0.83 + h.ph * 1.4);
    }
  }
  return { root, update, floaters, keepOut: floaters.map((f) => ({ x: f.ax, z: f.az, r: 0.62 })), stonePos, posts };
}
