// Paper lanterns (hanging chochin, floating toro) and a stone snow-viewing lantern.
import * as THREE from 'three';
import { mulberry32, edgePoint, groundH, FLOAT_ZONES } from './common.js';
import { makeStoneMaterial } from './stones.js';

const paperVert = /* glsl */`
varying vec3 vN; varying vec3 vView; varying vec3 vL; varying vec2 vUv; varying vec3 vObjN;
void main(){
  vL = position; vUv = uv; vObjN = normal;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalMatrix * normal; vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;
// uKind: 0 = ribbed round lantern, 1 = box lantern (uv per face), 2 = hexagonal window
const paperFrag = /* glsl */`
uniform vec3 uColor; uniform float uGlow; uniform float uH; uniform float uKind; uniform float uBoost;
varying vec3 vN; varying vec3 vView; varying vec3 vL; varying vec2 vUv; varying vec3 vObjN;
void main(){
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  float ndv = abs(dot(n, normalize(vView)));
  vec3 c;
  if (uKind < 0.5) {
    float h = vL.y / uH + 0.5;
    float core = exp(-pow((h - 0.40) / 0.30, 2.0));
    float rib = abs(fract(h * 15.0) - 0.5) * 2.0;
    float ribs = mix(0.70, 1.0, smoothstep(0.0, 0.4, rib));
    c = uColor * (0.30 + 1.25 * core) * ribs * mix(0.50, 1.10, pow(ndv, 0.7));
    c += vec3(1.0, 0.72, 0.36) * core * pow(ndv, 3.0) * 0.7;
  } else if (uKind < 1.5) {
    if (vObjN.y > 0.5) { c = uColor * 0.55; }
    else if (vObjN.y < -0.5) { c = uColor * 0.1; }
    else {
      vec2 q = vUv - vec2(0.5, 0.24);
      float core = exp(-dot(q * vec2(2.0, 2.3), q * vec2(2.0, 2.3)));
      float frame = smoothstep(0.0, 0.05, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
      c = uColor * (0.34 + 1.35 * core) * mix(0.35, 1.0, frame);
      c += vec3(1.0, 0.75, 0.4) * core * core * 0.55;
    }
  } else {
    float a = vUv.x * 6.0;
    float bar = smoothstep(0.0, 0.06, abs(fract(a) - 0.5)) * smoothstep(0.0, 0.05, abs(fract(a * 2.0 + 0.5) - 0.5) + 0.02);
    float hb = smoothstep(0.0, 0.05, abs(fract(vUv.y * 3.0) - 0.5));
    float core = exp(-pow((vUv.y - 0.4) / 0.42, 2.0));
    c = uColor * (0.35 + 1.1 * core) * mix(0.25, 1.0, bar * hb) * mix(0.6, 1.05, ndv);
  }
  gl_FragColor = vec4(c * uGlow * uBoost, 1.0);
}
`;

let boostUniform = { value: 1 };
function paperMaterial(color, kind, H = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color }, uGlow: { value: 1 }, uH: { value: H }, uKind: { value: kind }, uBoost: boostUniform },
    vertexShader: paperVert, fragmentShader: paperFrag, side: THREE.DoubleSide,
  });
}

const flat = (g) => { const n = g.toNonIndexed(); n.computeVertexNormals(); return n; };

export function createLanterns(ctx) {
  const rng = mulberry32(555);
  const { scene } = ctx;
  boostUniform = ctx.uReflBoost;
  const group = new THREE.Group();
  scene.add(group);
  ctx.tag(group, { refr: false });

  const wood = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.030, 0.020, 0.014), roughness: 0.78 });
  const lacquer = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.012, 0.010, 0.010), roughness: 0.35 });
  const cordMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.02, 0.015, 0.012), roughness: 0.9 });
  const tasselMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.35, 0.03, 0.02), roughness: 0.8 });
  const lit = []; // {mat, light, idx, base, seed, pos(world Vector3), obj}

  const tmp = new THREE.Vector3();
  function register(obj, mat, color, intensity, dist, seed, glint) {
    const light = new THREE.PointLight(color, intensity, dist, 2.0);
    obj.add(light);
    const idx = ctx.lightCount++;
    lit.push({ mat, light, idx, base: intensity, seed, obj: light, color, glint });
    return light;
  }

  // ---- hanging chochin
  const LH = 0.46, LR = 0.18;
  const prof = [];
  for (let i = 0; i <= 18; i++) { const t = i / 18; prof.push(new THREE.Vector2(LR * Math.sqrt(1 - Math.pow(2 * t - 1, 2) * 0.74), (t - 0.5) * LH)); }
  const bodyGeo = new THREE.LatheGeometry(prof, 32);
  const capGeo = new THREE.CylinderGeometry(0.097, 0.097, 0.04, 20);
  const cordGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 5);
  const tasselGeo = new THREE.CylinderGeometry(0.008, 0.022, 0.13, 8);
  function hangingLantern(x, y, z, cordLen, tint, seed) {
    const pivot = new THREE.Group(); pivot.position.set(x, y + cordLen + LH / 2 + 0.03, z);
    const mat = paperMaterial(new THREE.Color(1.0, 0.40, 0.11).multiplyScalar(1.5 * tint), 0, LH);
    const body = new THREE.Mesh(bodyGeo, mat); body.position.y = -(cordLen + LH / 2 + 0.03);
    const top = new THREE.Mesh(capGeo, lacquer); top.position.y = body.position.y + LH / 2 + 0.012;
    const bot = new THREE.Mesh(capGeo, lacquer); bot.position.y = body.position.y - LH / 2 - 0.012;
    const cord = new THREE.Mesh(cordGeo, cordMat); cord.scale.y = cordLen + 0.02; cord.position.y = -(cordLen + 0.02) / 2;
    const tas = new THREE.Mesh(tasselGeo, tasselMat); tas.position.y = bot.position.y - 0.09;
    pivot.add(body, top, bot, cord, tas);
    const holder = new THREE.Object3D(); holder.position.copy(body.position); pivot.add(holder);
    register(holder, mat, new THREE.Color(1.0, 0.60, 0.28), 9.0, 13, seed, 2.1);
    group.add(pivot);
    ctx.updaters.push((dt, t) => {
      pivot.rotation.z = 0.035 * Math.sin(t * 0.83 + seed) + 0.015 * Math.sin(t * 1.9 + seed * 2.0);
      pivot.rotation.x = 0.028 * Math.sin(t * 0.67 + seed * 1.3);
    });
    return pivot;
  }

  // ---- wooden post with a bracket arm reaching over the bank
  function post(th, lean = 0) {
    const base = edgePoint(th, 0.78);
    const g = new THREE.Group();
    const gy = groundH(base.x, base.z);
    g.position.set(base.x, gy - 0.05, base.z);
    g.rotation.y = Math.atan2(-base.nx, -base.nz); // local +z points at the pond
    const Hp = 2.42;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.058, Hp, 8), wood); p.position.y = Hp / 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.065, 1.02), wood); arm.position.set(0, Hp - 0.22, 0.38);
    const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), wood); arm2.position.set(0, Hp - 0.42, 0.14); arm2.rotation.x = -0.75;
    const cap = new THREE.Mesh(flat(new THREE.ConeGeometry(0.12, 0.1, 4)), wood); cap.position.y = Hp + 0.05; cap.rotation.y = Math.PI / 4;
    g.add(p, arm, arm2, cap);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.add(g);
    ctx.occ.solid.push(p);
    // lantern hangs from the arm tip
    const tip = new THREE.Vector3(0, Hp - 0.25, 0.84).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    hangingLantern(tip.x, tip.y - 0.28 - LH / 2 - 0.03, tip.z, 0.28, 1.0, th * 7.1);
    ctx.stonesPlaced.push({ x: base.x, z: base.z, r: 0.2 });
  }
  post(-1.05);
  post(2.82);
  post(-0.10);

  // ---- lantern in the maple (cord disappears into the canopy)
  {
    const e = edgePoint(-2.42, -0.35);
    hangingLantern(e.x, 1.72, e.z, 1.7, 1.0, 3.3);
    ctx.treeLantern = new THREE.Vector3(e.x, 1.72 + LH / 2, e.z);
  }

  // ---- yukimi-doro (snow-viewing stone lantern)
  {
    const e = edgePoint(-1.78, 0.72);
    const g = new THREE.Group();
    g.position.set(e.x, groundH(e.x, e.z) - 0.03, e.z);
    g.rotation.y = 0.4;
    g.scale.setScalar(1.12);
    const sm = makeStoneMaterial(ctx, 0.45);
    const parts = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.50, 0.12), sm);
      leg.position.set(Math.cos(a) * 0.25, 0.22, Math.sin(a) * 0.25);
      leg.rotation.y = -a + Math.PI / 2;
      leg.rotateX(-0.36);
      parts.push(leg);
    }
    const plat = new THREE.Mesh(flat(new THREE.CylinderGeometry(0.37, 0.31, 0.09, 6)), sm); plat.position.y = 0.49;
    const ringB = new THREE.Mesh(flat(new THREE.CylinderGeometry(0.225, 0.24, 0.04, 6)), sm); ringB.position.y = 0.555;
    const ringT = new THREE.Mesh(flat(new THREE.CylinderGeometry(0.24, 0.225, 0.04, 6)), sm); ringT.position.y = 0.855;
    parts.push(plat, ringB, ringT);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const pp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.27, 0.04), sm);
      pp.position.set(Math.cos(a) * 0.205, 0.705, Math.sin(a) * 0.205); pp.rotation.y = -a;
      parts.push(pp);
    }
    const roofProf = [[0.0, 0.31], [0.05, 0.30], [0.12, 0.24], [0.26, 0.15], [0.46, 0.075], [0.64, 0.04], [0.665, 0.02], [0.64, 0.0], [0.0, 0.0]].map((p) => new THREE.Vector2(p[0], p[1]));
    const roof = new THREE.Mesh(flat(new THREE.LatheGeometry(roofProf, 6)), sm); roof.position.y = 0.875;
    const fin = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), sm); fin.position.y = 1.22; fin.scale.y = 1.25;
    parts.push(roof, fin);
    const winMat = paperMaterial(new THREE.Color(1.0, 0.46, 0.14).multiplyScalar(1.5), 2);
    const win = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.27, 6, 1, true), winMat); win.position.y = 0.705;
    for (const m of parts) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    g.add(win);
    const holder = new THREE.Object3D(); holder.position.y = 0.72; g.add(holder);
    register(holder, winMat, new THREE.Color(1.0, 0.58, 0.26), 5.0, 9, 9.1, 1.6);
    group.add(g);
    ctx.occ.solid.push(plat, roof);
    ctx.stonesPlaced.push({ x: e.x, z: e.z, r: 0.75 });
    ctx.stoneLantern = g.position.clone();
  }

  // ---- floating toro
  FLOAT_ZONES.forEach((zn, i) => {
    const g = new THREE.Group();
    const mat = paperMaterial(new THREE.Color(1.0, 0.44, 0.13).multiplyScalar(1.3), 1);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.03, 0.30), wood); base.position.y = 0.012;
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.205, 0.25, 0.205), mat); paper.position.y = 0.03 + 0.125;
    g.add(base, paper);
    for (let k = 0; k < 4; k++) {
      const sx = k & 1 ? 1 : -1, sz = k & 2 ? 1 : -1;
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.265, 0.014), wood); st.position.set(sx * 0.105, 0.03 + 0.13, sz * 0.105);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(k < 2 ? 0.224 : 0.014, 0.014, k < 2 ? 0.014 : 0.224), wood);
      rim.position.set(k < 2 ? 0 : sx * 0.105, 0.03 + 0.257, k < 2 ? (k ? 0.105 : -0.105) : 0);
      g.add(st, rim);
    }
    const holder = new THREE.Object3D(); holder.position.y = 0.24; g.add(holder);
    register(holder, mat, new THREE.Color(1.0, 0.60, 0.28), 0.6, 6.0, 20 + i * 5.7, 0.9);
    group.add(g);
    const ph = rng() * 6.28, ph2 = rng() * 6.28;
    let nextRing = 1 + rng() * 3;
    ctx.updaters.push((dt, t) => {
      const x = zn.x + Math.sin(t * 0.041 * (1 + i * 0.13) + ph) * zn.r * 0.9;
      const z = zn.z + Math.sin(t * 0.033 * (1 + i * 0.17) + ph2) * zn.r * 0.75;
      g.position.set(x, 0.004 + 0.004 * Math.sin(t * 1.3 + ph), z);
      g.rotation.set(0.018 * Math.sin(t * 1.1 + ph), ph + t * 0.02 * (i % 2 ? 1 : -1), 0.018 * Math.sin(t * 0.9 + ph2));
      nextRing -= dt;
      if (nextRing <= 0) { nextRing = 2.2 + rng() * 2.5; ctx.water.ripple(x, z, 0.19, 0.16, 1.5, 0.9); }
    });
  });

  // ---- flicker + publish light data for the hand-written shaders
  ctx.updaters.push((dt, t) => {
    for (const L of lit) {
      const s = L.seed;
      const f = 1.0 + 0.055 * Math.sin(t * 6.3 + s) + 0.04 * Math.sin(t * 11.7 + s * 2.3) + 0.05 * Math.sin(t * 2.1 + s * 0.7) + 0.03 * Math.sin(t * 17.9 + s * 4.1);
      L.mat.uniforms.uGlow.value = f;
      L.light.intensity = L.base * f;
      L.obj.getWorldPosition(ctx.lights.pos[L.idx]);
      ctx.lights.col[L.idx].copy(L.color).multiplyScalar(L.base * f / Math.PI);
      ctx.lights.glint[L.idx] = L.glint * f;
    }
  });
  return group;
}
