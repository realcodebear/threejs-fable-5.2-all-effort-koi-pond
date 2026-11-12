// Koi: procedural geometry, vertex-shader swimming animation, procedural colour
// patterns, and a small steering simulation that keeps them inside the pond.
import * as THREE from 'three';
import { mulberry32, pondSD, terrainH, smoothstep, GLSL_NOISE } from './common.js';

const BODY = 0.78; // fraction of total length that is body (rest is tail fin)
const bodyProfile = (s) => Math.pow(Math.sin(Math.PI * Math.pow(s * 0.93, 0.62)), 0.7);
const halfW = (s) => 0.083 * bodyProfile(s);
const halfH = (s) => 0.098 * (bodyProfile(s) + 0.2 * smoothstep(0.6, 1.0, s));

function buildKoiGeometry() {
  const pos = [], idx = [], fin = [], finD = [];
  const push = (x, y, z, f = 0, d = 0) => { pos.push(x, y, z); fin.push(f); finD.push(d); return pos.length / 3 - 1; };

  // body: rings along the spine, seam along the belly
  const NS = 28, NR = 14;
  for (let i = 0; i <= NS; i++) {
    const s = i / NS, x = 0.5 - s * BODY, w = halfW(s), h = halfH(s);
    for (let j = 0; j <= NR; j++) {
      const a = Math.PI + (j / NR) * Math.PI * 2;
      const cy = Math.cos(a);
      push(x, cy * h * (cy < 0 ? 0.82 : 1.0), Math.sin(a) * w);
    }
  }
  for (let i = 0; i < NS; i++) for (let j = 0; j < NR; j++) {
    const a = i * (NR + 1) + j, b = a + NR + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }

  // tail fin: vertical forked fan
  {
    const U = 6, V = 8, x0 = 0.5 - BODY + 0.02, base = pos.length / 3;
    for (let i = 0; i <= U; i++) for (let j = 0; j <= V; j++) {
      const u = i / U, v = (j / V) * 2 - 1;
      const x = x0 - u * 0.235 * (0.6 + 0.4 * Math.pow(Math.abs(v), 1.4));
      const y = v * (0.026 + 0.125 * Math.pow(u, 0.8));
      push(x, y, 0, 1, u);
    }
    for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) {
      const a = base + i * (V + 1) + j, b = a + V + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // dorsal fin
  {
    const U = 9, base = pos.length / 3;
    for (let i = 0; i <= U; i++) {
      const u = i / U, s = 0.3 + u * 0.34, x = 0.5 - s * BODY, yb = halfH(s) * 0.92;
      push(x, yb, 0, 2, 0);
      push(x - 0.02 * u, yb + 0.05 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05 + 0.02)), 0.5) * (1 - 0.35 * u), 0, 2, 1);
    }
    for (let i = 0; i < U; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  // paired fins (pectoral, pelvic): fans sweeping back and outward
  const fan = (s, len, yRoot, zScale, a0, a1) => {
    for (const side of [-1, 1]) {
      const x0 = 0.5 - s * BODY, root = push(x0, yRoot, side * halfW(s) * zScale, 3, 0);
      const K = 7, first = pos.length / 3;
      for (let k = 0; k <= K; k++) {
        const t = k / K, ang = a0 + t * (a1 - a0), l = len * (0.7 + 0.3 * Math.sin(Math.PI * t));
        push(x0 - Math.cos(ang) * l, yRoot - 0.022 - 0.02 * t, side * (halfW(s) * zScale + Math.sin(ang) * l), 3, 1);
      }
      for (let k = 0; k < K; k++) idx.push(root, first + k, first + k + 1);
    }
  };
  fan(0.2, 0.17, -0.03, 0.8, 0.3, 1.35);
  fan(0.52, 0.09, -0.055, 0.6, 0.25, 1.1);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFin', new THREE.Float32BufferAttribute(fin, 1));
  g.setAttribute('aFinD', new THREE.Float32BufferAttribute(finD, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const koiVert = /* glsl */`
attribute float aFin, aFinD;
uniform float uPhase, uTurn, uAmp;
varying vec3 vObj, vN, vWorld; varying float vFin, vFinD;
void main(){
  vec3 p = position;
  vObj = p; vFin = aFin; vFinD = aFinD;
  float t = clamp(0.5 - p.x, 0.0, 1.0);
  float env = 0.10 + 1.7*t*t;
  float ph = uPhase - t*5.5;
  float dz = uAmp*env*sin(ph) - uTurn*t*t*0.42;
  float dzdt = uAmp*(3.4*t*sin(ph) - 5.5*env*cos(ph)) - uTurn*0.84*t;
  if (aFin > 2.5) { p.y += aFinD*0.035*sin(uPhase*0.6 + sign(p.z)*0.8); p.z *= 1.0 + aFinD*0.12*sin(uPhase*0.6); }
  if (aFin > 0.5 && aFin < 1.5) { dz += uAmp*aFinD*0.5*sin(ph - 0.9); }
  p.z += dz;
  float sl = -dzdt;
  vec3 n = normal;
  n = normalize(vec3(n.x - sl*n.z, n.y, n.z + sl*n.x));
  vN = normalize(mat3(modelMatrix) * n);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const koiFrag = /* glsl */`
precision highp float;
uniform vec3 uBase, uC1, uC2, uLight;
uniform float uT1, uT2, uSeed, uFreq, uTancho, uMetal;
varying vec3 vObj, vN, vWorld; varying float vFin, vFinD;
${GLSL_NOISE}
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 o = vObj;
  float top = smoothstep(-0.045, 0.01, o.y);
  float n1 = fbm3(vec3(o.x*uFreq, o.y*uFreq*0.6, o.z*uFreq*1.1) + uSeed);
  float n2 = fbm3(vec3(o.x*uFreq*1.6, o.y*uFreq, o.z*uFreq*1.8) + uSeed*1.7 + 9.0);
  vec3 col = uBase;
  float m1 = smoothstep(uT1-0.025, uT1+0.025, n1) * top;
  if (uTancho > 0.5) m1 = smoothstep(0.062, 0.05, length(vec3(o.x-0.33, (o.y-0.07)*0.5, o.z)));
  col = mix(col, uC1, m1);
  col = mix(col, uC2, smoothstep(uT2-0.02, uT2+0.02, n2) * top);
  // pale belly
  col = mix(col, mix(uBase, vec3(0.9,0.86,0.8), 0.6), smoothstep(-0.02, -0.075, o.y)*0.7);
  // scales shimmer
  float sc = sin(o.x*150.0)*sin(o.z*150.0 + o.y*90.0);
  col *= 1.0 + 0.07*sc*step(vFin, 0.5);
  // eyes
  float eye = length(vec3(o.x-0.405, o.y-0.022, abs(o.z)-0.048));
  col = mix(col, vec3(0.01), smoothstep(0.017, 0.011, eye));
  // fins: paler, slightly translucent-looking with rays
  if (vFin > 0.5) {
    vec3 finCol = mix(col, vec3(0.95,0.9,0.84), 0.45);
    float rays = 0.8 + 0.2*sin((vFin > 2.5 ? atan(o.z, o.x) : o.y) * 260.0);
    col = mix(col, finCol*rays, 0.5 + 0.5*vFinD);
  }
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(vec3(0.15, 1.0, -0.25));
  float wrap = dot(N, L)*0.5 + 0.5;
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), 28.0);
  vec3 lit = col * uLight * (0.32 + 0.9*wrap*wrap);
  lit += uLight * spec * (0.12 + 0.5*uMetal) * mix(vec3(1.0), col, uMetal);
  gl_FragColor = vec4(lit, 1.0);
}`;

const WHITE = [0.9, 0.88, 0.83], RED = [0.85, 0.11, 0.03], ORANGE = [0.95, 0.33, 0.04], BLACK = [0.035, 0.035, 0.045];
const VARIETIES = [
  { base: WHITE, c1: RED, t1: 0.47 },                                   // kohaku
  { base: WHITE, c1: ORANGE, t1: 0.5 },                                 // kohaku (orange)
  { base: WHITE, c1: RED, t1: 0.5, c2: BLACK, t2: 0.6 },                // sanke
  { base: BLACK, c1: RED, t1: 0.5, c2: WHITE, t2: 0.56 },               // showa
  { base: [0.95, 0.55, 0.08], metal: 1 },                               // ogon (gold)
  { base: [0.95, 0.78, 0.25], metal: 1 },                               // yamabuki (yellow)
  { base: ORANGE, c1: WHITE, t1: 0.55 },                                // orange & white
  { base: WHITE, c1: RED, tancho: 1 },                                  // tancho
  { base: WHITE, c1: BLACK, t1: 0.5 },                                  // shiro utsuri
  { base: [0.9, 0.9, 0.92], metal: 1 },                                 // platinum
  { base: WHITE, c1: RED, t1: 0.44 },
  { base: [0.95, 0.4, 0.06], c1: BLACK, t1: 0.57 },                     // hi utsuri
  { base: WHITE, c1: ORANGE, t1: 0.46, c2: BLACK, t2: 0.63 },
];

const wrapPi = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export function createKoi(count = 13) {
  const rng = mulberry32(7741);
  const group = new THREE.Group();
  const geo = buildKoiGeometry();
  const fish = [];

  const randomHome = () => {
    for (let k = 0; k < 40; k++) {
      const x = (rng() * 2 - 1) * 6.5 + 0.5, z = (rng() * 2 - 1) * 4.6;
      if (pondSD(x, z) < -1.7) return [x, z];
    }
    return [0.5, 0];
  };

  for (let i = 0; i < count; i++) {
    const v = VARIETIES[i % VARIETIES.length];
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uPhase: { value: 0 }, uTurn: { value: 0 }, uAmp: { value: 0.05 },
        uBase: { value: new THREE.Color().setRGB(...v.base) },
        uC1: { value: new THREE.Color().setRGB(...(v.c1 || v.base)) },
        uC2: { value: new THREE.Color().setRGB(...(v.c2 || v.base)) },
        uT1: { value: v.c1 ? (v.t1 ?? 0.5) : 5 }, uT2: { value: v.c2 ? v.t2 : 5 },
        uSeed: { value: rng() * 100 }, uFreq: { value: 5.5 + rng() * 3.5 },
        uTancho: { value: v.tancho || 0 }, uMetal: { value: v.metal || 0 },
        uLight: { value: new THREE.Color().setRGB(1.0, 0.92, 0.95) },
      },
      vertexShader: koiVert, fragmentShader: koiFrag, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.rotation.order = 'YXZ';
    const size = 0.95 + rng() * 0.6;
    mesh.scale.setScalar(size);
    group.add(mesh);
    const [x, z] = randomHome();
    const [hx, hz] = randomHome();
    fish.push({
      mesh, u: mat.uniforms, size, x, z, y: -0.3, h: rng() * Math.PI * 2, turn: 0,
      speed: 0.4, targetSpeed: 0.3 + rng() * 0.4, wander: 0, wanderT: rng() * 3,
      hx, hz, homeT: 6 + rng() * 14, phase: rng() * 10,
      f1: 0.25 + rng() * 0.3, p1: rng() * 6.28, f2: 0.12 + rng() * 0.15, p2: rng() * 6.28,
      kissT: 8 + rng() * 40, kiss: 0, wakeT: 0,
    });
  }

  function update(dt, t, addDrop) {
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      f.wanderT -= dt;
      if (f.wanderT < 0) {
        f.wander = (rng() - 0.5) * 1.3;
        f.wanderT = 1.5 + rng() * 4.5;
        f.targetSpeed = rng() < 0.1 ? 1.1 + rng() * 0.5 : 0.22 + rng() * 0.5;
      }
      f.homeT -= dt;
      if (f.homeT < 0) { [f.hx, f.hz] = randomHome(); f.homeT = 8 + rng() * 16; }

      const fx = Math.cos(f.h), fz = -Math.sin(f.h);
      let steer = f.wander * 0.5 + Math.sin(t * f.f1 + f.p1) * 0.3;

      // drift gently toward the current "home" point
      const want = Math.atan2(-(f.hz - f.z), f.hx - f.x);
      const diff = wrapPi(want - f.h);
      const homeDist = Math.hypot(f.hx - f.x, f.hz - f.z);
      steer += diff * 0.18 * Math.min(1, homeDist / 3);
      if (homeDist < 1.0) f.homeT = Math.min(f.homeT, 1.0);

      // avoid the shore
      const la = 0.9 * f.size + f.speed * 1.1;
      const d = pondSD(f.x + fx * la, f.z + fz * la);
      const margin = 1.15;
      if (d > -margin) {
        const k = Math.min(1, (d + margin) / margin);
        // turn toward whichever side has deeper water
        const dl = pondSD(f.x + Math.cos(f.h + 0.9) * la, f.z - Math.sin(f.h + 0.9) * la);
        const dr = pondSD(f.x + Math.cos(f.h - 0.9) * la, f.z - Math.sin(f.h - 0.9) * la);
        const side = Math.abs(dl - dr) > 0.05 ? (dl < dr ? 1 : -1) : Math.sign(diff) || 1;
        steer = steer * (1 - k) + side * (0.9 + 1.8 * k) * k + diff * 0.3 * k;
      }
      // keep some distance from other fish
      for (let j = 0; j < fish.length; j++) {
        if (j === i) continue;
        const o = fish[j], dx = o.x - f.x, dz = o.z - f.z, dd = Math.hypot(dx, dz), rr = 0.55 * (f.size + o.size);
        if (dd < rr && dd > 1e-4) {
          const rel = wrapPi(Math.atan2(-dz, dx) - f.h);
          if (Math.abs(rel) < 2.0) steer -= Math.sign(rel || 1) * 0.9 * (1 - dd / rr);
        }
      }
      steer = Math.max(-2.2, Math.min(2.2, steer));
      f.turn += (steer - f.turn) * Math.min(1, dt * 2.2);
      f.h += f.turn * dt;
      f.speed += (f.targetSpeed * (1 - 0.25 * Math.min(1, Math.abs(f.turn))) - f.speed) * Math.min(1, dt * 0.9);
      const sp = f.speed * (0.8 + 0.2 * f.size);
      f.x += fx * sp * dt; f.z += fz * sp * dt;
      // hard safety: never leave the water
      const dn = pondSD(f.x, f.z);
      if (dn > -0.55) { f.x += (f.hx - f.x) * dt * 0.5; f.z += (f.hz - f.z) * dt * 0.5; }

      // depth
      f.kissT -= dt;
      if (f.kissT < 0) { f.kiss = 2.4; f.kissT = 18 + rng() * 45; }
      let ty = -0.2 - 0.2 * (0.5 + 0.5 * Math.sin(t * f.f2 + f.p2));
      if (f.kiss > 0) {
        const before = f.kiss; f.kiss -= dt; ty = -0.085;
        if (before > 1.0 && f.kiss <= 1.0) addDrop(f.x + fx * 0.4 * f.size, f.z + fz * 0.4 * f.size, 0.11, -0.09);
      }
      const bed = terrainH(f.x, f.z) + 0.16 * f.size;
      ty = Math.min(-0.08 * f.size, Math.max(ty, bed));
      f.y += (ty - f.y) * Math.min(1, dt * 1.2);

      // wake on the surface
      f.wakeT -= dt;
      if (f.wakeT < 0) {
        f.wakeT = 0.05;
        const shallow = smoothstep(-0.5, -0.1, f.y);
        const w = (0.003 + 0.007 * f.speed + 0.006 * Math.abs(f.turn)) * shallow * f.size;
        if (w > 0.0004) addDrop(f.x + fx * 0.25 * f.size, f.z + fz * 0.25 * f.size, 0.13 * f.size, w);
      }

      f.phase += dt * (2.2 + f.speed * 7.5);
      f.u.uPhase.value = f.phase;
      f.u.uTurn.value = f.turn * 0.55;
      f.u.uAmp.value = 0.028 + 0.055 * Math.min(1.4, f.speed);
      f.mesh.position.set(f.x, f.y, f.z);
      f.mesh.rotation.y = f.h;
      f.mesh.rotation.x = -f.turn * 0.12;
    }
  }
  return { group, update };
}
