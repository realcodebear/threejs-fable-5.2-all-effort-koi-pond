// Paper lanterns: floating ones drifting on the pond, round ones hanging on a line
// across the back of the pond, and one stone lantern on the bank.
import * as THREE from 'three';
import { mulberry32, shorePoint, terrainH, FLOAT_SPOTS } from './common.js';

const paperVert = /* glsl */`
varying vec3 vP, vN, vV;
void main(){
  vP = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalMatrix * normal; vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const paperFrag = /* glsl */`
precision highp float;
uniform vec3 uColor; uniform float uFlicker, uFall, uCandleY, uRibs, uRibFreq, uGain;
varying vec3 vP, vN, vV;
void main(){
  float d = length(vP - vec3(0.0, uCandleY, 0.0));
  float g = 1.0 / (1.0 + d*d*uFall);
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float rib = 1.0 - uRibs * 0.3 * smoothstep(0.75, 1.0, abs(sin(vP.y * uRibFreq)));
  vec3 c = uColor * (0.35 + 2.4*g*g) * (0.55 + 0.45*facing) * rib;
  c += vec3(1.0, 0.75, 0.35) * g*g*g * 1.6;
  gl_FragColor = vec4(c * uFlicker * uGain, 1.0);
}`;

function paperMaterial(color, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color().setRGB(...color) }, uFlicker: { value: 1 },
      uFall: { value: opts.fall ?? 10 }, uCandleY: { value: opts.candleY ?? 0 },
      uRibs: { value: opts.ribs ?? 0 }, uRibFreq: { value: opts.ribFreq ?? 60 }, uGain: { value: opts.gain ?? 1 },
    },
    vertexShader: paperVert, fragmentShader: paperFrag, side: THREE.DoubleSide,
  });
}

export function createLanterns(scene, above) {
  const rng = mulberry32(1234);
  const wood = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.07, 0.04, 0.025), roughness: 0.7 });
  const darkWood = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.02, 0.015, 0.012), roughness: 0.6 });
  const items = [];   // { mat, light, base, seed }
  const floats = [];

  const makeLight = (color, intensity, dist) => {
    const l = new THREE.PointLight(new THREE.Color().setRGB(...color), intensity, dist, 1.8);
    scene.add(l);       // lights live at the scene root so they are never toggled with a group
    return l;
  };

  // ---------------- floating lanterns
  const box = new THREE.BoxGeometry(0.4, 0.46, 0.4, 1, 1, 1);
  const baseG = new THREE.BoxGeometry(0.6, 0.05, 0.6);
  const postG = new THREE.BoxGeometry(0.028, 0.5, 0.028);
  const rimG = new THREE.BoxGeometry(0.46, 0.028, 0.028);
  FLOAT_SPOTS.forEach(([cx, cz, ax, az], i) => {
    const g = new THREE.Group();
    const mat = paperMaterial(i === 2 ? [1.0, 0.42, 0.2] : [1.0, 0.55, 0.22], { fall: 9, candleY: -0.12 });
    const paper = new THREE.Mesh(box, mat); paper.position.y = 0.3; g.add(paper);
    const b = new THREE.Mesh(baseG, wood); b.position.y = 0.035; g.add(b);
    for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = new THREE.Mesh(postG, wood); p.position.set(px * 0.207, 0.31, pz * 0.207); g.add(p);
    }
    for (let k = 0; k < 4; k++) {
      const r = new THREE.Mesh(rimG, wood);
      r.position.set(k % 2 ? (k === 1 ? 0.207 : -0.207) : 0, 0.545, k % 2 ? 0 : (k === 0 ? 0.207 : -0.207));
      if (k % 2) r.rotation.y = Math.PI / 2;
      g.add(r);
    }
    above.add(g);
    const light = makeLight([1.0, 0.55, 0.25], 3.2, 9);
    const f = { g, cx, cz, ax, az, w1: 0.05 + rng() * 0.04, w2: 0.04 + rng() * 0.04, p1: rng() * 6.28, p2: rng() * 6.28, spin: (rng() - 0.5) * 0.08, dropT: rng() * 3 };
    floats.push(f);
    items.push({ mat, light, base: 3.2, seed: rng() * 100, float: f });
  });

  // ---------------- hanging lanterns on a line between two bamboo poles
  const [ax, az] = shorePoint(-2.72, 0.75), [bx, bz] = shorePoint(-0.42, 0.75);
  const A = new THREE.Vector3(ax, terrainH(ax, az) + 3.5, az), B = new THREE.Vector3(bx, terrainH(bx, bz) + 3.5, bz);
  const poleG = new THREE.CylinderGeometry(0.045, 0.06, 3.9, 8).translate(0, 1.75, 0);
  const poleM = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.2, 0.17, 0.08), roughness: 0.55 });
  for (const P of [A, B]) {
    const pole = new THREE.Mesh(poleG, poleM); pole.position.set(P.x, P.y - 3.5, P.z); pole.castShadow = true; above.add(pole);
  }
  const ropePt = (u) => new THREE.Vector3().lerpVectors(A, B, u).add(new THREE.Vector3(0, -1.15 * 4 * u * (1 - u), 0));
  const pts = []; for (let i = 0; i <= 30; i++) pts.push(ropePt(i / 30));
  above.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.012, 5), darkWood));

  const sph = new THREE.SphereGeometry(0.27, 24, 16).scale(1, 1.12, 1);
  const cap = new THREE.CylinderGeometry(0.11, 0.13, 0.05, 12);
  const str = new THREE.CylinderGeometry(0.006, 0.006, 1, 4).translate(0, -0.5, 0);
  const tas = new THREE.CylinderGeometry(0.012, 0.03, 0.2, 6);
  const hanging = [];
  const cols = [[1.0, 0.5, 0.2], [1.0, 0.3, 0.16], [1.0, 0.58, 0.26], [1.0, 0.3, 0.16], [1.0, 0.5, 0.2]];
  [0.17, 0.335, 0.5, 0.665, 0.83].forEach((u, i) => {
    const pivot = new THREE.Group(); pivot.position.copy(ropePt(u));
    const drop = 0.22 + (i % 2) * 0.16;
    const s = new THREE.Mesh(str, darkWood); s.scale.y = drop; pivot.add(s);
    const mat = paperMaterial(cols[i], { fall: 7, candleY: -0.08, ribs: 1, ribFreq: 58, gain: 0.9 });
    const body = new THREE.Mesh(sph, mat); body.position.y = -drop - 0.3; pivot.add(body);
    const c1 = new THREE.Mesh(cap, darkWood); c1.position.y = -drop - 0.02; pivot.add(c1);
    const c2 = new THREE.Mesh(cap, darkWood); c2.position.y = -drop - 0.59; c2.rotation.x = Math.PI; pivot.add(c2);
    const t = new THREE.Mesh(tas, new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.35, 0.03, 0.02), roughness: 0.8 }));
    t.position.y = -drop - 0.72; pivot.add(t);
    above.add(pivot);
    const light = makeLight(cols[i], 5.5, 12);
    light.position.copy(pivot.position); light.position.y -= drop + 0.3;
    hanging.push({ pivot, ph: rng() * 6.28 });
    items.push({ mat, light, base: 5.5, seed: rng() * 100 });
  });

  // ---------------- stone lantern (toro)
  {
    const [x, z] = shorePoint(0.72, 1.25);
    const g = new THREE.Group(); g.position.set(x, terrainH(x, z) - 0.03, z);
    const stone = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.2, 0.2, 0.19), roughness: 0.9 });
    const part = (geo, y, m = stone) => { const mesh = new THREE.Mesh(geo, m); mesh.position.y = y; mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh; };
    part(new THREE.CylinderGeometry(0.4, 0.48, 0.16, 6), 0.08);
    part(new THREE.CylinderGeometry(0.13, 0.17, 0.8, 8), 0.56);
    part(new THREE.CylinderGeometry(0.4, 0.26, 0.13, 6), 1.02);
    const mat = paperMaterial([1.0, 0.6, 0.28], { fall: 14, candleY: 0, gain: 0.8 });
    const fire = part(new THREE.CylinderGeometry(0.2, 0.2, 0.34, 6), 1.25, mat); fire.castShadow = false;
    for (let k = 0; k < 6; k++) {
      const a = (k + 0.5) / 6 * Math.PI * 2;
      const p = part(new THREE.BoxGeometry(0.07, 0.34, 0.07), 1.25); p.position.x = Math.sin(a) * 0.22; p.position.z = Math.cos(a) * 0.22; p.rotation.y = a;
    }
    part(new THREE.ConeGeometry(0.62, 0.3, 6), 1.57);
    part(new THREE.CylinderGeometry(0.62, 0.6, 0.05, 6), 1.42);
    part(new THREE.SphereGeometry(0.085, 10, 8), 1.76);
    g.rotation.y = 0.4;
    above.add(g);
    const light = makeLight([1.0, 0.6, 0.3], 2.4, 7);
    light.position.set(x, g.position.y + 1.25, z);
    items.push({ mat, light, base: 2.4, seed: rng() * 100 });
  }

  function update(dt, t, addDrop) {
    for (const f of floats) {
      const x = f.cx + f.ax * Math.sin(t * f.w1 + f.p1) + 0.2 * Math.sin(t * 0.021 + f.p2);
      const z = f.cz + f.az * Math.cos(t * f.w2 + f.p2);
      f.g.position.set(x, -0.012 + 0.008 * Math.sin(t * 1.1 + f.p1), z);
      f.g.rotation.set(0.018 * Math.sin(t * 0.9 + f.p2), f.p1 + t * f.spin, 0.018 * Math.sin(t * 0.7 + f.p1));
      f.dropT -= dt;
      if (f.dropT < 0) { f.dropT = 1.6 + rng() * 2.5; addDrop(x, z, 0.3, 0.006); }
    }
    for (const h of hanging) {
      h.pivot.rotation.z = 0.045 * Math.sin(t * 0.8 + h.ph) + 0.02 * Math.sin(t * 1.9 + h.ph * 2);
      h.pivot.rotation.x = 0.035 * Math.sin(t * 0.65 + h.ph * 1.7);
    }
    for (const it of items) {
      const s = it.seed;
      const fl = 0.9 + 0.06 * Math.sin(t * 7.3 + s) + 0.04 * Math.sin(t * 13.1 + s * 2) + 0.04 * Math.sin(t * 2.3 + s * 3);
      it.mat.uniforms.uFlicker.value = fl;
      it.light.intensity = it.base * fl;
      if (it.float) it.light.position.set(it.float.g.position.x, 0.4, it.float.g.position.z);
    }
  }
  return { update };
}
