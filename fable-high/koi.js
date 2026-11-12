// Koi: procedural body + fins, spine-bending vertex shader, procedural colour patterns, steering behaviour.
import * as THREE from 'three';
import { GLSL_NOISE, L_UNDER, clamp, lerp, mulberry32, pondSD, terrainHeight } from './common.js';

const BODY = 0.78;   // fraction of total length taken by the body (rest is tail fin)

// profile tables (t: nose -> tail root), all as fractions of total length
const PT = [0, 0.03, 0.08, 0.16, 0.28, 0.42, 0.56, 0.70, 0.84, 0.94, 1.0];
const PW = [0.014, 0.047, 0.073, 0.096, 0.110, 0.107, 0.092, 0.070, 0.046, 0.028, 0.018];
const PTOP = [0.010, 0.035, 0.058, 0.085, 0.105, 0.108, 0.095, 0.075, 0.052, 0.038, 0.034];
const PBOT = [0.010, 0.030, 0.050, 0.070, 0.085, 0.088, 0.078, 0.060, 0.044, 0.036, 0.034];

function prof(vs, t) {
  const ts = PT;
  let i = 0;
  while (i < ts.length - 2 && t > ts[i + 1]) i++;
  const t0 = ts[i], t1 = ts[i + 1], h = t1 - t0;
  const u = clamp((t - t0) / h, 0, 1);
  const m0 = i > 0 ? (vs[i + 1] - vs[i - 1]) / (ts[i + 1] - ts[i - 1]) : (vs[1] - vs[0]) / (ts[1] - ts[0]);
  const m1 = i < ts.length - 2 ? (vs[i + 2] - vs[i]) / (ts[i + 2] - ts[i]) : (vs[i + 1] - vs[i]) / h;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * vs[i] + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * vs[i + 1] + (u3 - u2) * h * m1;
}

function buildKoiGeometry() {
  const P = [], N = [], PART = [], ROOT = [], I = [];
  const addPart = (pos, idx, part, root) => {
    // compute normals from winding
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const n = g.getAttribute('normal').array;
    const base = P.length / 3;
    for (let i = 0; i < pos.length; i++) { P.push(pos[i]); N.push(n[i]); }
    for (let i = 0; i < part.length; i++) PART.push(part[i]);
    for (let i = 0; i < pos.length / 3; i++) ROOT.push(root[0], root[1], root[2]);
    for (let i = 0; i < idx.length; i++) I.push(idx[i] + base);
    g.dispose();
  };

  // ---- body
  {
    const NS = 28, NR = 14;
    const pos = [], idx = [], part = [];
    for (let i = 0; i < NS; i++) {
      const t = Math.pow(i / (NS - 1), 1.25);
      const w = prof(PW, t), top = prof(PTOP, t), bot = prof(PBOT, t);
      const x = 0.5 - BODY * t;
      for (let j = 0; j < NR; j++) {
        const a = (j / NR) * Math.PI * 2;
        const sn = Math.sin(a), cs = Math.cos(a);
        // slightly boxy cross-section
        const k = 1.0 / Math.pow(Math.pow(Math.abs(cs), 2.4) + Math.pow(Math.abs(sn), 2.4), 1 / 2.4);
        pos.push(x, (sn >= 0 ? top : bot) * sn * k + 0.004, w * cs * k);
        part.push(0, t * BODY, j / NR, 0);
      }
    }
    for (let i = 0; i < NS - 1; i++) {
      for (let j = 0; j < NR; j++) {
        const a = i * NR + j, b = i * NR + (j + 1) % NR, c = a + NR, d = b + NR;
        idx.push(a, b, c, b, d, c);
      }
    }
    // caps
    const nose = pos.length / 3; pos.push(0.5 + 0.006, 0.004, 0); part.push(0, 0, 0, 0);
    for (let j = 0; j < NR; j++) idx.push(nose, (j + 1) % NR, j);
    const tail = pos.length / 3; pos.push(0.5 - BODY - 0.004, 0.004, 0); part.push(0, BODY, 0, 0);
    const o = (NS - 1) * NR;
    for (let j = 0; j < NR; j++) idx.push(tail, o + j, o + (j + 1) % NR);
    addPart(pos, idx, part, [0, 0, 0]);
  }

  const grid = (nu, nv, fn, partFn, root) => {
    const pos = [], idx = [], part = [];
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const u = i / nu, v = j / nv;
      const p = fn(u, v); pos.push(p[0], p[1], p[2]);
      const q = partFn(u, v); part.push(q[0], q[1], q[2], q[3]);
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    addPart(pos, idx, part, root);
  };

  // ---- tail fin (vertical fan, softly forked)
  grid(7, 10, (u, v) => {
    const vv = v * 2 - 1;
    const xr = 0.5 - BODY + 0.02;
    const tipX = -0.5 + 0.075 * (1 - Math.pow(Math.abs(vv), 1.4));
    const hh = lerp(0.028, 0.165, Math.pow(u, 0.9)) * (1 - 0.12 * u * (1 - Math.abs(vv)));
    return [lerp(xr, tipX, u), vv * hh + 0.004, 0];
  }, (u, v) => [1, u, v, 0], [0, 0, 0]);

  // ---- dorsal fin
  grid(9, 2, (u, v) => {
    const t = lerp(0.30, 0.66, u);
    const base = prof(PTOP, t) * 0.9;
    const hgt = 0.062 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.55)), 0.8) * (1 - 0.3 * u);
    return [0.5 - BODY * t - v * 0.02, base + hgt * v, 0];
  }, (u, v) => [1, v, u * 2.0, 0], [0, 0, 0]);

  // ---- paired fins
  const fan = (t, y, zf, R, a0, a1, drop, weight) => {
    for (const side of [1, -1]) {
      const root = [0.5 - BODY * t, y, side * prof(PW, t) * zf];
      grid(3, 6, (u, v) => {
        const a = lerp(a0, a1, v);
        const rr = R * (0.72 + 0.28 * Math.sin(v * Math.PI)) * u;
        return [root[0] - Math.cos(a) * rr, root[1] - drop * rr, root[2] + side * Math.sin(a) * rr];
      }, (u, v) => [1, u, v * 1.3, weight * u], root);
    }
  };
  fan(0.215, -0.036, 0.86, 0.165, 0.30, 1.42, 0.30, 1.0);   // pectoral
  fan(0.55, -0.060, 0.60, 0.085, 0.25, 1.15, 0.55, 0.35);   // pelvic

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(PART, 4));
  g.setAttribute('aRoot', new THREE.Float32BufferAttribute(ROOT, 3));
  g.setIndex(I);
  return g;
}

function koiMaterial() {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', /* glsl */`#include <common>
        attribute vec4 aPart; attribute vec3 aRoot;
        attribute vec4 aAnim; attribute vec4 aLook; attribute vec3 aC1; attribute vec3 aC2; attribute vec3 aC3;
        varying vec3 vObj; varying vec4 vPart; varying vec4 vLook; varying vec3 vC1; varying vec3 vC2; varying vec3 vC3;
        void koiDeform(inout vec3 p, inout vec3 n){
          // fin flapping
          if (aPart.w > 0.0) {
            float side = sign(aRoot.z);
            float ang = side * (0.30 * sin(aAnim.x * 0.5 + 0.7) + 0.06) * aPart.w;
            float c = cos(ang), sn = sin(ang);
            vec3 d = p - aRoot;
            d.yz = vec2(d.y * c - d.z * sn, d.y * sn + d.z * c);
            n.yz = vec2(n.y * c - n.z * sn, n.y * sn + n.z * c);
            p = aRoot + d;
          }
          // travelling wave along the spine + turning curvature
          float s = 0.5 - p.x;
          float ph = aAnim.x, amp = aAnim.y;
          float env = 0.010 + 0.045 * s + 0.175 * s * s;
          float denv = 0.045 + 0.35 * s;
          float w = 5.6;
          float sw = sin(ph - w * s), cw = cos(ph - w * s);
          float off = amp * env * sw;
          float dOff = amp * (denv * sw - env * w * cw);
          float sc = max(s - 0.14, 0.0);
          float kk = mix(aAnim.z, aAnim.w, smoothstep(0.15, 0.95, s));
          off += 0.5 * kk * sc * sc;
          dOff += kk * sc;
          float inv = inversesqrt(1.0 + dOff * dOff);
          vec3 Fw = vec3(1.0, 0.0, -dOff) * inv;
          vec3 Lt = vec3(dOff, 0.0, 1.0) * inv;
          float lz = p.z;
          p = vec3(0.5 - s, p.y, off) + Lt * lz;
          n = n.x * Fw + vec3(0.0, n.y, 0.0) + n.z * Lt;
        }`)
      .replace('#include <beginnormal_vertex>', /* glsl */`
        vec3 kP = position; vec3 kN = normal;
        koiDeform(kP, kN);
        vec3 objectNormal = kN;`)
      .replace('#include <begin_vertex>', /* glsl */`
        vec3 transformed = kP;
        vObj = position; vPart = aPart; vLook = aLook; vC1 = aC1; vC2 = aC2; vC3 = aC3;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
        varying vec3 vObj; varying vec4 vPart; varying vec4 vLook; varying vec3 vC1; varying vec3 vC2; varying vec3 vC3;
        ${GLSL_NOISE}`)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        {
          vec3 q = vObj;
          float seed = vLook.x;
          float typ = floor(vLook.w / 10.0);
          float freq = vLook.w - typ * 10.0;
          vec3 qp = vec3(q.x * 2.1, q.y * 2.6, q.z * 3.0) * freq + seed * 19.7;
          float n1 = fbm3(qp);
          float n2 = fbm3(qp * 1.9 + 31.3);
          float e = 0.022;
          float m1 = smoothstep(vLook.y - e, vLook.y + e, n1);
          float m2 = smoothstep(vLook.z - e, vLook.z + e, n2);
          if (typ > 0.5 && typ < 1.5) {          // tancho: single spot on the head
            m1 = (1.0 - smoothstep(0.058, 0.070, length(vec2((q.x - 0.365) * 0.8, q.z)))) * step(0.0, q.y);
          }
          vec3 kc = mix(vC1, vC2, m1);
          kc = mix(kc, vC3, m2);
          float belly = 1.0 - smoothstep(-0.065, 0.015, q.y);
          vec3 bellyCol = typ > 1.5 ? vC2 : mix(vC1, vec3(0.92, 0.88, 0.80), 0.6);
          kc = mix(kc, bellyCol, belly * 0.85);
          // scale reticulation on the back
          float ang = atan(q.y, q.z);
          float s1 = sin(q.x * 130.0 + ang * 9.0), s2 = sin(q.x * 130.0 - ang * 9.0);
          float net = smoothstep(0.80, 1.0, max(s1, s2)) * (1.0 - smoothstep(0.25, 0.36, q.x)) * smoothstep(-0.02, 0.04, q.y);
          kc *= 1.0 - net * (typ > 1.5 ? 0.45 : 0.14);
          if (vPart.x > 0.5) {                   // fins: pale, with rays
            float rays = 0.72 + 0.28 * sin(vPart.z * 64.0);
            vec3 fc = mix(vC1, vec3(0.95, 0.90, 0.84), 0.45);
            fc = mix(mix(vC1, kc, 0.5), fc, smoothstep(0.0, 0.5, vPart.y));
            kc = fc * rays * mix(0.8, 1.15, vPart.y);
          } else {
            // eyes
            vec3 ev = vec3(q.x - 0.440, q.y - 0.020, abs(q.z) - 0.050);
            float eye = 1.0 - smoothstep(0.011, 0.016, length(ev));
            kc = mix(kc, vec3(0.01), eye);
          }
          diffuseColor.rgb = kc;
        }`)
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += diffuseColor.rgb * 0.085;');
  };
  mat.customProgramCacheKey = () => 'koi';
  return mat;
}

// name, c1 (base), c2 (patch), c3 (second patch), th1, th2, freq, type(0 patches, 1 tancho, 2 asagi)
const WHITE = [0.95, 0.92, 0.86], RED = [0.84, 0.06, 0.015], ORANGE = [0.98, 0.27, 0.02], BLACK = [0.025, 0.025, 0.03],
  GOLD = [1.0, 0.52, 0.06], YELLOW = [1.0, 0.70, 0.10], BLUE = [0.16, 0.27, 0.46];
const VARIETIES = [
  { c1: WHITE, c2: RED, c3: RED, th1: 0.50, th2: 2.0, freq: 1.7, type: 0 },      // kohaku
  { c1: WHITE, c2: ORANGE, c3: BLACK, th1: 0.50, th2: 0.66, freq: 1.9, type: 0 }, // sanke
  { c1: GOLD, c2: [1.0, 0.72, 0.2], c3: GOLD, th1: 0.55, th2: 2.0, freq: 1.5, type: 0 }, // ogon
  { c1: WHITE, c2: RED, c3: RED, th1: 0.46, th2: 2.0, freq: 1.4, type: 0 },      // kohaku (bolder)
  { c1: BLACK, c2: RED, c3: WHITE, th1: 0.50, th2: 0.60, freq: 1.8, type: 0 },    // showa
  { c1: WHITE, c2: RED, c3: RED, th1: 2.0, th2: 2.0, freq: 1.0, type: 1 },       // tancho
  { c1: ORANGE, c2: [0.9, 0.2, 0.03], c3: ORANGE, th1: 0.55, th2: 2.0, freq: 1.5, type: 0 }, // benigoi
  { c1: YELLOW, c2: BLACK, c3: BLACK, th1: 0.56, th2: 2.0, freq: 2.0, type: 0 },  // ki utsuri
  { c1: WHITE, c2: ORANGE, c3: ORANGE, th1: 0.52, th2: 2.0, freq: 2.2, type: 0 }, // orange kohaku
  { c1: BLUE, c2: [0.92, 0.34, 0.06], c3: BLUE, th1: 2.0, th2: 2.0, freq: 1.0, type: 2 },   // asagi
  { c1: [0.95, 0.93, 0.88], c2: WHITE, c3: WHITE, th1: 2.0, th2: 2.0, freq: 1.0, type: 0 }, // platinum
  { c1: WHITE, c2: RED, c3: BLACK, th1: 0.53, th2: 0.64, freq: 1.6, type: 0 },    // sanke
  { c1: BLACK, c2: ORANGE, c3: ORANGE, th1: 0.48, th2: 2.0, freq: 1.6, type: 0 }, // hi utsuri
  { c1: WHITE, c2: RED, c3: RED, th1: 0.54, th2: 2.0, freq: 2.1, type: 0 },      // kohaku
];

const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

export class KoiSchool {
  constructor(scene, sim, count = 14) {
    this.sim = sim;
    this.count = count;
    const rng = this.rng = mulberry32(2024);
    const geo = buildKoiGeometry();
    const mk = (n, sz) => new THREE.InstancedBufferAttribute(new Float32Array(count * sz), sz);
    this.aAnim = mk('aAnim', 4); this.aAnim.setUsage(THREE.DynamicDrawUsage);
    const aLook = mk('aLook', 4), aC1 = mk('aC1', 3), aC2 = mk('aC2', 3), aC3 = mk('aC3', 3);
    geo.setAttribute('aAnim', this.aAnim); geo.setAttribute('aLook', aLook);
    geo.setAttribute('aC1', aC1); geo.setAttribute('aC2', aC2); geo.setAttribute('aC3', aC3);

    this.mesh = new THREE.InstancedMesh(geo, koiMaterial(), count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(L_UNDER);
    scene.add(this.mesh);

    // soft blob shadows on the pond bed
    const sg = new THREE.PlaneGeometry(1, 1); sg.rotateX(-Math.PI / 2);
    this.aFade = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    this.aFade.setUsage(THREE.DynamicDrawUsage);
    sg.setAttribute('aFade', this.aFade);
    this.shadow = new THREE.InstancedMesh(sg, new THREE.ShaderMaterial({
      vertexShader: /* glsl */`attribute float aFade; varying vec2 vUv; varying float vF;
        void main(){ vUv = uv; vF = aFade; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`varying vec2 vUv; varying float vF;
        void main(){ vec2 p = vUv * 2.0 - 1.0; float a = exp(-dot(p, p) * 3.2) - 0.04; gl_FragColor = vec4(0.0, 0.0, 0.0, max(a, 0.0) * vF); }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }), count);
    this.shadow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shadow.frustumCulled = false;
    this.shadow.layers.set(L_UNDER);
    this.shadow.renderOrder = 2;
    scene.add(this.shadow);

    this.fish = [];
    for (let i = 0; i < count; i++) {
      const v = VARIETIES[i % VARIETIES.length];
      let x = 0, z = 0;
      for (let k = 0; k < 200; k++) {
        x = (rng() * 2 - 1) * 4.2; z = (rng() * 2 - 1) * 3.3;
        if (pondSD(x, z) > -0.85) continue;
        if (this.fish.every((o) => Math.hypot(o.x - x, o.z - z) > 0.75)) break;
      }
      const L = i < 2 ? 0.90 + rng() * 0.08 : (i < 7 ? 0.68 + rng() * 0.16 : 0.48 + rng() * 0.18);
      this.fish.push({
        id: i, x, z, y: -0.3, h: rng() * Math.PI * 2, v: 0.2, w: 0, wand: 0, k1: 0, k2: 0,
        phase: rng() * 6.28, amp: 0.5, L, girth: 0.92 + rng() * 0.2,
        vT: 0.25, modeT: rng() * 4, depthPhase: rng() * 6.28, depthRate: 0.07 + rng() * 0.08,
        avoid: 0, rise: 0, pitch: 0, roll: 0, kissed: false,
      });
      aLook.setXYZW(i, rng() * 10, v.th1 + (rng() - 0.5) * 0.04, v.th2, v.type * 10 + v.freq * (0.9 + rng() * 0.25));
      aC1.setXYZ(i, ...v.c1); aC2.setXYZ(i, ...v.c2); aC3.setXYZ(i, ...v.c3);
    }
    this.riseTimer = 4;
    this.dummy = new THREE.Object3D();
    this.dummy.rotation.order = 'YZX';
    this.update(0.016, 0);
  }

  update(dt, time) {
    const rng = this.rng, fish = this.fish, sim = this.sim;
    dt = clamp(dt, 1e-3, 0.05);

    // now and then a fish comes up to kiss the surface
    this.riseTimer -= dt;
    if (this.riseTimer <= 0) {
      this.riseTimer = 5 + rng() * 8;
      const f = fish[Math.floor(rng() * fish.length)];
      if (f.rise <= 0 && pondSD(f.x, f.z) < -0.9) { f.rise = 3.4; f.kissed = false; }
    }

    for (const f of fish) {
      const hx = Math.cos(f.h), hz = Math.sin(f.h);

      // wander (Ornstein-Uhlenbeck on turn rate)
      f.wand += -f.wand * 0.45 * dt + (rng() - 0.5) * 2 * Math.sqrt(dt) * 0.85;
      let steer = f.wand;

      // stay inside the pond: three whisker probes
      const margin = 0.30 + 0.42 * f.L;
      const look = 0.35 + f.L * 0.9 + f.v * 1.7;
      const sdC = pondSD(f.x + hx * look, f.z + hz * look) + margin;
      const sdL = pondSD(f.x + Math.cos(f.h - 0.75) * look * 0.85, f.z + Math.sin(f.h - 0.75) * look * 0.85) + margin;
      const sdR = pondSD(f.x + Math.cos(f.h + 0.75) * look * 0.85, f.z + Math.sin(f.h + 0.75) * look * 0.85) + margin;
      const worst = Math.max(sdC, sdL, sdR);
      let urgency = 0;
      if (worst > 0) {
        urgency = clamp(worst / 0.55, 0, 1);
        if (f.avoid === 0) f.avoid = sdL < sdR ? -1 : 1;
        steer += f.avoid * (0.8 + 2.4 * urgency);
      } else f.avoid = 0;

      // keep some room from the others, drift loosely the same way
      let slow = 0;
      for (const o of fish) {
        if (o === f) continue;
        const dx = o.x - f.x, dz = o.z - f.z;
        const d2 = dx * dx + dz * dz;
        const rr = 0.30 + 0.55 * (f.L + o.L);
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) + 1e-4;
          const ahead = (dx * hx + dz * hz) / d;
          const side = hx * dz - hz * dx;
          const wgt = (1 - d / rr) * (0.45 + 0.55 * Math.max(ahead, 0));
          steer -= (side >= 0 ? 1 : -1) * wgt * 2.1;
          if (ahead > 0.4) slow += wgt;
        } else if (d2 < 3.2) {
          steer += angDiff(o.h, f.h) * 0.05;
        }
      }

      const wMax = 1.5 / Math.sqrt(f.L / 0.55);
      steer = clamp(steer, -wMax, wMax);
      f.w += (steer - f.w) * (1 - Math.exp(-dt * 2.6));
      f.h += f.w * dt;

      // speed: glide / cruise / short burst
      f.modeT -= dt;
      if (f.modeT <= 0) {
        const r = rng();
        if (r < 0.30) { f.vT = 0.08 + rng() * 0.06; f.modeT = 2 + rng() * 4; }
        else if (r < 0.93) { f.vT = 0.17 + rng() * 0.15; f.modeT = 3 + rng() * 6; }
        else { f.vT = 0.42 + rng() * 0.2; f.modeT = 0.8 + rng() * 1.0; }
        f.vT *= Math.sqrt(f.L / 0.6);
      }
      const vt = f.vT * (1 - 0.5 * urgency) * (1 - 0.45 * Math.min(slow, 1));
      const vPrev = f.v;
      f.v += (vt - f.v) * (1 - Math.exp(-dt * (vt > f.v ? 1.5 : 0.55)));
      const accel = (f.v - vPrev) / dt;
      f.x += Math.cos(f.h) * f.v * dt;
      f.z += Math.sin(f.h) * f.v * dt;

      // safety net: never leave the water
      const sdHere = pondSD(f.x, f.z);
      if (sdHere > -margin * 0.6) {
        const e = 0.05;
        const gx = (pondSD(f.x + e, f.z) - pondSD(f.x - e, f.z)), gz = (pondSD(f.x, f.z + e) - pondSD(f.x, f.z - e));
        const gl = Math.hypot(gx, gz) + 1e-6;
        const push = (sdHere + margin * 0.6) * Math.min(1, dt * 3);
        f.x -= gx / gl * push; f.z -= gz / gl * push;
      }

      // tail beat follows speed; bend follows turn rate (the tail lags the head)
      const freq = 0.5 + 1.9 * f.v / f.L;
      f.phase += dt * Math.PI * 2 * freq;
      const ampT = 0.28 + 0.85 * clamp(f.v / 0.42, 0, 1) + 1.2 * clamp(accel, 0, 0.5);
      f.amp += (ampT - f.amp) * (1 - Math.exp(-dt * 3));
      const kT = clamp(f.w * f.L / Math.max(f.v, 0.16), -1.25, 1.25);
      f.k1 += (kT - f.k1) * (1 - Math.exp(-dt * 6));
      f.k2 += (f.k1 - f.k2) * (1 - Math.exp(-dt * 2.2));

      // depth
      const bed = terrainHeight(f.x, f.z);
      const yMax = -0.065 - 0.115 * f.L * f.girth;
      const yMin = Math.min(bed + 0.10 + 0.12 * f.L, yMax);
      f.depthPhase += dt * f.depthRate;
      let yT = lerp(yMin, yMax, 0.66 + 0.32 * Math.sin(f.depthPhase));
      if (f.rise > 0) {
        f.rise -= dt;
        if (f.rise > 1.0) yT = yMax + 0.045;
        if (!f.kissed && f.rise < 1.6) {
          f.kissed = true;
          sim.addDrop(f.x + hx * 0.42 * f.L, f.z + hz * 0.42 * f.L, 0.07, 0.10);
        }
      }
      const yPrev = f.y;
      f.y += (clamp(yT, yMin, yMax + 0.05) - f.y) * (1 - Math.exp(-dt * (f.rise > 0 ? 1.6 : 0.6)));
      const pitchT = clamp((f.y - yPrev) / dt / Math.max(f.v, 0.1), -0.35, 0.35);
      f.pitch += (pitchT - f.pitch) * (1 - Math.exp(-dt * 2));
      f.roll += (-f.w * 0.16 - f.roll) * (1 - Math.exp(-dt * 2));

      // gentle surface wake when swimming shallow
      const shallow = clamp((f.y + 0.115 * f.L + 0.30) / 0.22, 0, 1);
      if (shallow > 0.05 && f.v > 0.1) {
        const st = 0.0022 * shallow * (f.v / 0.3) * (f.L / 0.6) * (dt * 60);
        sim.addDrop(f.x + hx * 0.3 * f.L, f.z + hz * 0.3 * f.L, 0.07 + 0.07 * f.L, st);
        const tl = Math.sin(f.phase - 5.6) * 0.16 * f.amp * f.L;
        if (shallow > 0.5) sim.addDrop(f.x - hx * 0.45 * f.L - hz * tl, f.z - hz * 0.45 * f.L + hx * tl, 0.06, -st * 0.8);
      }

      const d = this.dummy;
      d.position.set(f.x, f.y, f.z);
      d.rotation.set(f.roll, -f.h, f.pitch);
      d.scale.set(f.L, f.L * f.girth, f.L * f.girth);
      d.updateMatrix();
      this.mesh.setMatrixAt(f.id, d.matrix);
      this.aAnim.setXYZW(f.id, f.phase, f.amp, f.k1, f.k2);

      const hgt = f.y - bed;
      d.position.set(f.x, bed + 0.02, f.z);
      d.rotation.set(0, -f.h, 0);
      d.scale.set(f.L * (1.0 + hgt * 0.5), 1, f.L * (0.42 + hgt * 0.5));
      d.updateMatrix();
      this.shadow.setMatrixAt(f.id, d.matrix);
      this.aFade.setX(f.id, 0.62 / (1 + hgt * 2.2));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.shadow.instanceMatrix.needsUpdate = true;
    this.aAnim.needsUpdate = true;
    this.aFade.needsUpdate = true;
  }
}
