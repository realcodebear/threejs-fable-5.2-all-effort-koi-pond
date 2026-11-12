// Koi: procedural body + fins, spine-driven swimming, steering behaviour, patterned shader.
import * as THREE from 'three';
import { NOISE_GLSL, OCC_EXT, NL, NF, mulberry32, pondD, groundH, clamp, lerp, smoothstep } from './common.js';

const NJ = 22;             // spine joints
const SPINE_LEN = 1.06;    // normalised length covered by the spine (snout -> tail-fin tip)
const BODY_END = 0.78;     // where the body stops and the tail fin begins

// ---------------------------------------------------------------- shape
const U = (s) => clamp(s / BODY_END, 0, 1);
function halfW(s) { const u = U(s); return 0.092 * Math.sqrt(u) * (Math.pow(1 - u, 1.2) + 0.10) / 0.41; }
function halfH(s) { const u = U(s); return 0.112 * Math.pow(u, 0.55) * ((1 - u) + 0.2) / 0.483; }
function cenY(s) { const u = U(s); return 0.014 * Math.sin(Math.PI * Math.min(u * 1.15, 1)); }
function bodyPoint(s, phi, out) {
  const w = halfW(s), h = halfH(s), sn = Math.sin(phi), cs = Math.cos(phi);
  return out.set(-s, cenY(s) + h * (sn >= 0 ? sn : sn * 0.86), w * cs * (1 - 0.12 * Math.max(sn, 0)));
}

function buildKoiGeometry() {
  const pos = [], nrm = [], uv = [], fin = [], root = [];
  const bodyIdx = [], finIdx = [];
  const push = (p, n, u, v, f, r) => {
    pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); uv.push(u, v);
    fin.push(f[0], f[1], f[2]); root.push(r.x, r.y, r.z);
    return pos.length / 3 - 1;
  };
  const Z = new THREE.Vector3();
  const p = new THREE.Vector3(), pa = new THREE.Vector3(), pb = new THREE.Vector3(), n = new THREE.Vector3();

  // body: lofted rings, denser at the head
  const K = 28, M = 16;
  for (let k = 0; k <= K; k++) {
    const s = BODY_END * Math.pow(k / K, 1.55);
    for (let j = 0; j <= M; j++) {
      const phi = (j / M) * Math.PI * 2;
      bodyPoint(s, phi, p);
      const es = 0.004, ep = 0.02;
      bodyPoint(Math.max(s, 0.0015) + es, phi, pa); bodyPoint(Math.max(s, 0.0015), phi, n); pa.sub(n);
      bodyPoint(Math.max(s, 0.0015), phi + ep, pb); pb.sub(n);
      n.crossVectors(pb, pa).normalize();
      const radial = new THREE.Vector3(0, Math.sin(phi), Math.cos(phi));
      if (n.dot(radial) < 0) n.negate();
      if (k === 0) n.set(1, 0, 0);
      push(p, n, s, j / M, [0, 0, 0], Z);
    }
  }
  for (let k = 0; k < K; k++) for (let j = 0; j < M; j++) {
    const a = k * (M + 1) + j, b = a + 1, c = a + M + 1, d = c + 1;
    bodyIdx.push(a, b, c, b, d, c);
  }
  // eyes
  for (const side of [-1, 1]) {
    const s = 0.058, er = 0.0125;
    const c = new THREE.Vector3(-s, cenY(s) + halfH(s) * 0.34, side * halfW(s) * 0.90);
    const base = pos.length / 3;
    const A = 8, B = 6;
    for (let i = 0; i <= B; i++) for (let j = 0; j <= A; j++) {
      const t = (i / B) * Math.PI, f = (j / A) * Math.PI * 2;
      n.set(Math.sin(t) * Math.cos(f), Math.cos(t), Math.sin(t) * Math.sin(f));
      p.copy(c).addScaledVector(n, er);
      push(p, n, s, 0, [6, 0, side], Z);
    }
    for (let i = 0; i < B; i++) for (let j = 0; j < A; j++) {
      const a = base + i * (A + 1) + j, b = a + 1, c2 = a + A + 1, d = c2 + 1;
      bodyIdx.push(a, b, c2, b, d, c2);
    }
  }

  const grid = (nu, nv, fn, type, side, rootP) => {
    const base = pos.length / 3;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const r = fn(i / nu, j / nv); // {p, n, w}
      push(r.p, r.n, i / nu, j / nv, [type, r.w, side], rootP);
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = base + i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1;
      finIdx.push(a, c, b, b, c, d);
    }
  };

  // tail fin: forked fan in the vertical plane
  grid(10, 6, (a, t) => {
    const al = a * 2 - 1;
    const ang = al * 0.66;
    const R = 0.27 * (0.56 + 0.44 * Math.pow(Math.abs(al), 1.25));
    return {
      p: new THREE.Vector3(-(BODY_END - 0.03 + t * R * Math.cos(ang)), cenY(BODY_END) + al * 0.036 * (1 - t) + t * R * Math.sin(ang) * 1.2, 0),
      n: new THREE.Vector3(0, 0, 1), w: t,
    };
  }, 4, 0, Z);

  // dorsal fin
  grid(9, 3, (u, v) => {
    const s = lerp(0.30, 0.62, u);
    const hgt = 0.066 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.42)), 0.9) * (1 - 0.3 * u) + 0.004;
    return {
      p: new THREE.Vector3(-(s + v * 0.04), cenY(s) + halfH(s) - 0.008 + v * hgt, 0),
      n: new THREE.Vector3(0, 0, 1), w: v,
    };
  }, 3, 0, Z);

  // paired fins (pectoral = 1, pelvic = 2)
  const paired = (type, s, yk, zk, D, len, b0, b1) => {
    for (const side of [-1, 1]) {
      const R = new THREE.Vector3(-s, cenY(s) - halfH(s) * yk, side * halfW(s) * zk);
      const e1 = new THREE.Vector3(D[0], D[1], side * D[2]).normalize();
      const e2 = new THREE.Vector3(-1, 0, 0);
      e2.addScaledVector(e1, -e2.dot(e1)).normalize();
      const nn = new THREE.Vector3().crossVectors(e1, e2).normalize();
      if (nn.y < 0) nn.negate();
      grid(7, 4, (a, t) => {
        const beta = lerp(b0, b1, a);
        const mid = (b0 + b1) * 0.5 + 0.1, hw = (b1 - b0) * 0.5;
        const L = len * (1 - 0.42 * Math.pow((beta - mid) / hw, 2));
        const dir = new THREE.Vector3().addScaledVector(e1, Math.cos(beta)).addScaledVector(e2, Math.sin(beta));
        return { p: R.clone().addScaledVector(dir, t * L), n: nn, w: t };
      }, type, side, R);
    }
  };
  paired(1, 0.185, 0.50, 0.80, [-0.50, -0.30, 0.82], 0.185, -0.45, 1.0);
  paired(2, 0.47, 0.82, 0.50, [-0.72, -0.36, 0.60], 0.10, -0.35, 0.9);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aFin', new THREE.Float32BufferAttribute(fin, 3));
  geo.setAttribute('aRoot', new THREE.Float32BufferAttribute(root, 3));
  geo.setIndex([...bodyIdx, ...finIdx]);
  geo.addGroup(0, bodyIdx.length, 0);
  geo.addGroup(bodyIdx.length, finIdx.length, 1);
  return geo;
}

// ---------------------------------------------------------------- shaders
const koiVert = /* glsl */`
uniform vec4 uSpine[${NJ}];
uniform float uSize, uRoll, uFinPhase, uTailPhase;
attribute vec3 aFin; attribute vec3 aRoot;
varying vec3 vRest; varying vec3 vRestN; varying vec3 vN; varying vec3 vW; varying vec2 vUv; varying vec3 vFin;
vec3 rotX(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x, p.y*c - p.z*s, p.y*s + p.z*c); }
vec3 rotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x*c + p.z*s, p.y, -p.x*s + p.z*c); }
void main(){
  vec3 p = position; vec3 n = normal;
  vRest = position; vRestN = normal; vUv = uv; vFin = aFin;
  float type = aFin.x;
  if (type > 0.5 && type < 2.5) {
    // paired fins scull slowly
    float ph = uFinPhase + (type > 1.5 ? 1.9 : 0.0) + aFin.z * 0.35;
    float flap = (0.26 * sin(ph) + 0.06) * aFin.z;
    float sweep = (0.22 * sin(ph * 0.5 + 0.8) + 0.05) * aFin.z;
    vec3 q = p - aRoot;
    q = rotY(rotX(q, flap * aFin.y * 1.4), sweep);
    p = aRoot + q; n = rotY(rotX(n, flap), sweep);
  }
  float s = clamp(-p.x, 0.0, ${SPINE_LEN.toFixed(3)}) / ${SPINE_LEN.toFixed(3)} * ${(NJ - 1).toFixed(1)};
  float fi = min(floor(s), ${(NJ - 2).toFixed(1)});
  float f = s - fi; int i = int(fi);
  vec4 J = mix(uSpine[i], uSpine[i + 1], f);
  float c = cos(J.w), sn = sin(J.w);
  float cr = cos(uRoll), sr = sin(uRoll);
  vec2 yz = vec2(p.y * cr - p.z * sr, p.y * sr + p.z * cr);
  if (type > 3.5 && type < 4.5) {
    // soft trailing edge of the tail fin lags behind
    yz.y += aFin.y * aFin.y * 0.035 * sin(uTailPhase - 6.3 - abs(p.y) * 16.0);
  }
  if (type > 2.5 && type < 3.5) yz.y += aFin.y * 0.012 * sin(uTailPhase - 2.0 + p.x * 9.0);
  vec3 right = vec3(-sn, 0.0, c);
  vec3 world = J.xyz + (vec3(0.0, yz.x, 0.0) + right * yz.y) * uSize;
  vec3 n2 = vec3(n.x, n.y * cr - n.z * sr, n.y * sr + n.z * cr);
  vN = vec3(c * n2.x - sn * n2.z, n2.y, sn * n2.x + c * n2.z);
  vW = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const koiLighting = /* glsl */`
uniform vec3 uLPos[${NL}]; uniform vec3 uLCol[${NL}];
uniform vec3 uSkyCol, uGndCol, uKeyCol, uKeyDir;
uniform sampler2D uOcc;
vec3 koiLight(vec3 albedo, vec3 N, vec3 wp, float wrap, float spec){
  vec3 occ = texture2D(uOcc, vec2(wp.x, -wp.z) / ${OCC_EXT.toFixed(1)} + 0.5).rgb;
  float shade = (1.0 - 0.55 * occ.g) * (1.0 - 0.45 * occ.b);
  float depth = max(-wp.y, 0.0);
  vec3 att = exp(-depth * vec3(0.55, 0.32, 0.38));    // light lost on the way down
  float hemi = N.y * 0.5 + 0.5;
  vec3 irr = mix(uGndCol, uSkyCol, hemi * hemi) * shade;
  irr += uKeyCol * max((dot(N, uKeyDir) + wrap) / (1.0 + wrap), 0.0) * shade * 0.8;
  vec3 sp = vec3(0.0);
  vec3 V = normalize(cameraPosition - wp);
  for (int i = 0; i < ${NL}; i++) {
    vec3 L = uLPos[i] - wp; float d2 = dot(L, L); L *= inversesqrt(d2);
    vec3 lc = uLCol[i] / (d2 + 0.35);
    irr += lc * max((dot(N, L) + wrap) / (1.0 + wrap), 0.0);
    sp += lc * pow(max(dot(N, normalize(L + V)), 0.0), 40.0);
  }
  return (albedo * irr + sp * spec) * att;
}
`;

const koiBodyFrag = /* glsl */`
uniform vec3 uBase, uCol1, uCol2, uBelly;
uniform vec4 uPat;      // thr1, thr2, freq, seed
uniform vec3 uStyle;    // tancho, metallic, netting
varying vec3 vRest; varying vec3 vRestN; varying vec3 vN; varying vec3 vW; varying vec2 vUv; varying vec3 vFin;
${NOISE_GLSL}
${koiLighting}
void main(){
  vec3 N = normalize(vN);
  if (vFin.x > 5.5) {
    // eye: dark glassy bead
    vec3 e = koiLight(vec3(0.012), N, vW, 0.2, 2.5);
    gl_FragColor = vec4(e, 1.0); return;
  }
  vec3 rn = normalize(vRestN);
  float s = vUv.x;
  vec3 q = vRest * vec3(uPat.z, uPat.z * 1.5, uPat.z * 1.5) + uPat.w;
  float n1 = fbm3(q);
  float n2 = fbm3(q * 1.9 + 31.7);
  float back = smoothstep(-0.45, 0.2, rn.y + (n2 - 0.5) * 0.5);
  float m1 = smoothstep(uPat.x - 0.025, uPat.x + 0.025, n1) * back;
  float m2 = smoothstep(uPat.y - 0.02, uPat.y + 0.02, n2) * smoothstep(-0.2, 0.35, rn.y);
  vec3 col = uBase;
  // netted (asagi-style) back
  float net = uStyle.z * smoothstep(0.0, 0.5, rn.y);
  col = mix(col, uCol1, m1);
  col = mix(col, uCol2, m2);
  // tancho: a single crimson disc on the crown
  float crown = (1.0 - smoothstep(0.045, 0.058, length(vec2((vRest.x + 0.115) * 0.8, vRest.z)))) * step(0.0, rn.y);
  col = mix(col, vec3(0.78, 0.05, 0.03), crown * uStyle.x);
  // scales: offset rows of overlapping discs
  vec2 sc = vec2(s * 52.0, vUv.y * 30.0);
  sc.x += 0.5 * mod(floor(sc.y), 2.0);
  vec2 fc = fract(sc) - 0.5;
  float scl = smoothstep(0.25, 0.55, length(fc * vec2(1.0, 0.9)));
  float bodyMask = smoothstep(0.17, 0.23, s) * smoothstep(0.80, 0.70, s);
  col *= 1.0 - (0.16 + 0.5 * net) * scl * bodyMask;
  col = mix(col, uBelly, smoothstep(0.05, -0.75, rn.y) * 0.9);
  // gill cover and mouth hints
  col *= 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.012, abs(s - 0.165 - 0.02 * rn.y * rn.y))) * smoothstep(0.3, -0.5, rn.y + 0.2);
  float metal = uStyle.y;
  vec3 lit = koiLight(col, N, vW, 0.35, 0.25 + 0.9 * metal + 0.25 * (1.0 - scl));
  lit += col * metal * 0.05 * (1.0 - scl);
  gl_FragColor = vec4(lit, 1.0);
}
`;

const koiFinFrag = /* glsl */`
uniform vec3 uFinCol; uniform vec3 uBase;
varying vec3 vRest; varying vec3 vN; varying vec3 vW; varying vec2 vUv; varying vec3 vFin;
${NOISE_GLSL}
${koiLighting}
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  N = normalize(N + vec3(0.0, 0.6, 0.0));
  float w = vFin.y;
  float type = vFin.x;
  float rays = (type > 3.5) ? sin(vUv.x * 62.0) : (type > 2.5 ? sin(vUv.x * 80.0) : sin(vUv.x * 44.0));
  rays = 0.78 + 0.22 * rays;
  vec3 col = mix(uFinCol, vec3(0.92, 0.90, 0.84), smoothstep(0.1, 1.0, w) * 0.55) * rays;
  float alpha = mix(0.95, 0.30, smoothstep(0.0, 1.0, w)) * (0.8 + 0.2 * rays);
  vec3 lit = koiLight(col, N, vW, 0.8, 0.1);
  gl_FragColor = vec4(lit, alpha);
}
`;

// ---------------------------------------------------------------- varieties (linear colours)
const WHITE = [0.86, 0.83, 0.76], RED = [0.74, 0.07, 0.025], ORANGE = [0.92, 0.27, 0.03], SUMI = [0.018, 0.018, 0.024];
const GOLD = [0.92, 0.55, 0.07], PLAT = [0.80, 0.82, 0.84], BLUE = [0.20, 0.30, 0.44], CREAM = [0.88, 0.80, 0.62];
const VARIETIES = [
  { base: WHITE, c1: RED, c2: RED, thr1: 0.50, thr2: 9, freq: 3.4, belly: WHITE, fin: WHITE },                         // kohaku
  { base: WHITE, c1: RED, c2: SUMI, thr1: 0.52, thr2: 0.66, freq: 3.1, belly: WHITE, fin: WHITE },                      // sanke
  { base: GOLD, c1: GOLD, c2: GOLD, thr1: 9, thr2: 9, freq: 3, belly: [0.95, 0.72, 0.30], fin: [0.95, 0.66, 0.2], metal: 1 }, // yamabuki ogon
  { base: SUMI, c1: RED, c2: WHITE, thr1: 0.47, thr2: 0.60, freq: 3.0, belly: [0.3, 0.3, 0.3], fin: [0.25, 0.25, 0.27] }, // showa
  { base: WHITE, c1: ORANGE, c2: ORANGE, thr1: 0.46, thr2: 9, freq: 2.6, belly: WHITE, fin: WHITE },                    // orange kohaku
  { base: WHITE, c1: WHITE, c2: WHITE, thr1: 9, thr2: 9, freq: 3, belly: WHITE, fin: WHITE, tancho: 1 },                // tancho
  { base: SUMI, c1: ORANGE, c2: ORANGE, thr1: 0.48, thr2: 9, freq: 2.8, belly: [0.5, 0.2, 0.05], fin: [0.3, 0.2, 0.15] }, // hi utsuri
  { base: PLAT, c1: PLAT, c2: PLAT, thr1: 9, thr2: 9, freq: 3, belly: [0.9, 0.9, 0.9], fin: [0.9, 0.9, 0.92], metal: 1 },   // platinum
  { base: BLUE, c1: BLUE, c2: BLUE, thr1: 9, thr2: 9, freq: 3, belly: [0.85, 0.30, 0.06], fin: [0.80, 0.35, 0.12], net: 1 }, // asagi
  { base: CREAM, c1: CREAM, c2: SUMI, thr1: 9, thr2: 0.60, freq: 3.6, belly: WHITE, fin: WHITE },                       // bekko
  { base: WHITE, c1: RED, c2: RED, thr1: 0.56, thr2: 9, freq: 4.2, belly: WHITE, fin: WHITE },                          // kohaku (sparser)
  { base: ORANGE, c1: WHITE, c2: WHITE, thr1: 0.60, thr2: 9, freq: 3.0, belly: [0.95, 0.6, 0.3], fin: [0.95, 0.55, 0.25] }, // orenji
];

const wrapPi = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };

class Koi {
  constructor(i, ctx, geo, rng) {
    this.i = i; this.ctx = ctx;
    const v = VARIETIES[i % VARIETIES.length];
    this.size = lerp(0.58, 0.98, rng());
    if (i === 0) this.size = 1.0;
    this.half = 0.115 * this.size;
    this.seed = rng() * 100;
    this.cruise = lerp(0.20, 0.34, rng()) * (0.6 + 0.5 * this.size);
    this.speed = this.cruise;
    this.turn = 0; this.avoidSign = 0; this.roll = 0;
    this.phase = rng() * 6.28; this.finPhase = rng() * 6.28;
    this.burst = 0; this.riseT = 0; this.kissed = true; this.pitch = 0; this.amp = 0.3;
    // start somewhere with enough water
    do {
      this.x = (rng() * 2 - 1) * 3.8; this.z = (rng() * 2 - 1) * 2.8;
    } while (this.free(this.x, this.z) < 0.25);
    this.y = -(0.2 + this.half + rng() * 0.2);
    this.heading = rng() * Math.PI * 2;
    // heading history sampled every HS metres travelled -> the body follows the path of the head
    this.HS = 0.0125; this.HN = 112;
    this.hist = new Float32Array(this.HN).fill(this.heading);
    this.hHead = 0; this.distAcc = 0;

    this.spine = Array.from({ length: NJ }, () => new THREE.Vector4());
    this.theta = new Float32Array(NJ);
    this.wave = new Float32Array(NJ);
    const shared = {
      uSpine: { value: this.spine }, uSize: { value: this.size }, uRoll: { value: 0 }, uFinPhase: { value: 0 }, uTailPhase: { value: 0 },
      uLPos: { value: ctx.lights.pos }, uLCol: { value: ctx.lights.col },
      uSkyCol: ctx.koiSky, uGndCol: ctx.koiGnd, uKeyCol: ctx.koiKey, uKeyDir: ctx.koiKeyDir, uOcc: ctx.uOcc,
    };
    this.u = shared;
    const C = (a) => ({ value: new THREE.Color(a[0], a[1], a[2]) });
    const body = new THREE.ShaderMaterial({
      uniforms: {
        ...shared, uBase: C(v.base), uCol1: C(v.c1), uCol2: C(v.c2), uBelly: C(v.belly),
        uPat: { value: new THREE.Vector4(v.thr1, v.thr2, v.freq, this.seed) },
        uStyle: { value: new THREE.Vector3(v.tancho || 0, v.metal || 0, v.net || 0) },
      },
      vertexShader: koiVert, fragmentShader: koiBodyFrag,
    });
    const fins = new THREE.ShaderMaterial({
      uniforms: { ...shared, uFinCol: C(v.fin), uBase: C(v.base) },
      vertexShader: koiVert, fragmentShader: koiFinFrag,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, [body, fins]);
    this.mesh.frustumCulled = false;
  }

  // > 0 where there is room for this fish (water deep enough, clear of island stones)
  free(x, z) {
    const yTop = -(0.05 + (this.half || 0.1));
    let f = (yTop - (this.half || 0.1) - 0.07) - groundH(x, z);
    for (const o of this.ctx.obstacles) f = Math.min(f, (Math.hypot(x - o.x, z - o.z) - o.r - 0.12) * 1.2);
    return f;
  }

  headingAt(s) {
    if (s <= this.distAcc) return lerp(this.heading, this.hist[this.hHead], this.distAcc > 1e-6 ? s / this.distAcc : 0);
    const k = (s - this.distAcc) / this.HS;
    const k0 = Math.min(Math.floor(k), this.HN - 2), f = Math.min(k - k0, 1);
    const a = this.hist[(this.hHead - k0 + this.HN * 4) % this.HN], b = this.hist[(this.hHead - k0 - 1 + this.HN * 4) % this.HN];
    return lerp(a, b, f);
  }

  update(dt, t, all) {
    const ctx = this.ctx;
    const dx = Math.cos(this.heading), dz = Math.sin(this.heading);
    const sd = this.seed;
    // ---- steering
    let want = 0.26 * Math.sin(t * 0.29 + sd) + 0.20 * Math.sin(t * 0.13 + sd * 2.1) + 0.10 * Math.sin(t * 0.67 + sd * 3.3);
    let urgency = 0;
    const la = 0.30 + this.size * 0.75 + this.speed * 0.9;
    const f0 = this.free(this.x + dx * la, this.z + dz * la);
    const aL = this.heading + 0.8, aR = this.heading - 0.8;
    const fL = this.free(this.x + Math.cos(aL) * la * 0.8, this.z + Math.sin(aL) * la * 0.8);
    const fR = this.free(this.x + Math.cos(aR) * la * 0.8, this.z + Math.sin(aR) * la * 0.8);
    const here = this.free(this.x, this.z);
    if (here < 0.0) {
      // strayed into the shallows: head back towards open water
      const d = wrapPi(Math.atan2(-this.z, -this.x) - this.heading);
      want = clamp(d * 2.5, -2.4, 2.4); urgency = 0.5;
    } else if (f0 < 0.30 || fL < 0.06 || fR < 0.06) {
      if (this.avoidSign === 0) this.avoidSign = fL > fR ? 1 : -1;
      urgency = clamp(1 - Math.min(f0, 0.3) / 0.3, 0, 1);
      want = this.avoidSign * (0.5 + 2.1 * urgency);
      if (fL < 0.06 && fR > 0.06) { want = -1.3; this.avoidSign = -1; }
      else if (fR < 0.06 && fL > 0.06) { want = 1.3; this.avoidSign = 1; }
    } else {
      this.avoidSign = 0;
      // very loosely fall in behind a neighbour ahead
      for (const o of all) {
        if (o === this) continue;
        const ox = o.x - this.x, oz = o.z - this.z, d2 = ox * ox + oz * oz;
        if (d2 < 2.2 && d2 > 0.3 && ox * dx + oz * dz > 0) {
          want += wrapPi(o.heading - this.heading) * 0.05;
        }
      }
    }
    // keep a little personal space, slipping over / under each other
    let yBias = 0;
    const mx = this.x - dx * this.size * 0.35, mz = this.z - dz * this.size * 0.35;
    for (const o of all) {
      if (o === this) continue;
      const ox = (o.x - Math.cos(o.heading) * o.size * 0.35) - mx, oz = (o.z - Math.sin(o.heading) * o.size * 0.35) - mz;
      const d = Math.hypot(ox, oz), lim = 0.42 * (this.size + o.size);
      if (d < lim) {
        const k = 1 - d / lim;
        const side = dx * oz - dz * ox; // >0: other is to the +heading side
        if (Math.abs(this.y - o.y) < 0.2) want += (side > 0 ? -1 : 1) * k * 1.7;
        yBias += (this.y >= o.y ? 1 : -1) * k * 0.14;
      }
    }
    // a body can only bend so far: keep the turning circle wider than ~half a body length
    const turnMax = Math.max(this.speed, 0.1) / (0.5 * this.size) * (here < 0 ? 2.5 : 1 + urgency);
    want = clamp(want, -turnMax, turnMax);
    this.turn += (want - this.turn) * (1 - Math.exp(-dt * 2.6));
    this.heading += this.turn * dt;

    // ---- speed: cruise, glide, the occasional dart
    this.burst = Math.max(0, this.burst - dt);
    let target = this.cruise * (0.78 + 0.34 * Math.sin(t * 0.21 + sd * 1.7)) * (1 - 0.35 * urgency);
    if (this.burst > 0) target = this.cruise * 2.6;
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * (this.burst > 0 ? 3.0 : 0.7)));
    const nx = Math.cos(this.heading), nz = Math.sin(this.heading);
    const px = this.x + nx * this.speed * dt, pz = this.z + nz * this.speed * dt;
    if (here < 0.0 && this.free(px, pz) < here) {
      this.speed *= Math.exp(-dt * 6);   // nosing into the bank: stall and pivot instead of climbing out
    } else { this.x = px; this.z = pz; }

    // ---- depth
    const yTop = -(0.05 + this.half);
    let yd = -(0.15 + this.half + 0.30 * (0.5 + 0.5 * Math.sin(t * 0.11 + sd * 4.0))) + yBias;
    if (this.riseT > 0) { this.riseT -= dt; yd = yTop + 0.012; }
    const floor = groundH(this.x, this.z);
    yd = Math.min(Math.max(yd, floor + this.half + 0.10), yTop + (this.riseT > 0 ? 0.012 : 0));
    const py = this.y;
    this.y += (yd - this.y) * (1 - Math.exp(-dt * (this.riseT > 0 ? 1.6 : 0.8)));
    this.pitch += (clamp((this.y - py) / Math.max(this.speed * dt, 1e-4), -0.3, 0.3) - this.pitch) * (1 - Math.exp(-dt * 3));
    if (this.riseT > 0 && !this.kissed && this.y > yTop - 0.012) {
      this.kissed = true;
      ctx.water.ripple(this.x + nx * 0.02, this.z + nz * 0.02, 0.055 + 0.03 * this.size, 0.55);
      this.riseT = Math.min(this.riseT, 0.5);
    }
    // gentle wake when cruising just under the surface
    const near = clamp(1 - (-(this.y + this.half)) / 0.16, 0, 1);
    if (near > 0.02) {
      const b = this.size * 0.3;
      ctx.water.impulse(this.x - nx * b, this.z - nz * b, 0.09 * this.size + 0.03, near * near * this.speed * 0.008);
    }

    // ---- heading history
    this.distAcc += this.speed * dt;
    while (this.distAcc >= this.HS) {
      this.distAcc -= this.HS;
      this.hHead = (this.hHead + 1) % this.HN;
      this.hist[this.hHead] = this.heading;
    }

    // ---- swimming wave
    const bl = this.speed / this.size; // body lengths per second
    const effort = clamp(bl / 0.5, 0, 2.2);
    this.phase += dt * Math.PI * 2 * (0.32 + 1.25 * bl);
    this.finPhase += dt * (1.6 + 1.5 * Math.abs(this.turn) + 1.2 * clamp(1 - effort, 0, 1));
    const ampT = 0.22 + 0.24 * effort + 0.12 * Math.min(Math.abs(this.turn), 1.5);
    this.amp += (ampT - this.amp) * (1 - Math.exp(-dt * 2.0));
    const ds = (SPINE_LEN / (NJ - 1)) * this.size;
    for (let j = 0; j < NJ; j++) {
      const sN = (j / (NJ - 1)) * SPINE_LEN;
      let env = 0.06 + 0.94 * Math.pow(Math.min(sN, 1), 1.7);
      env *= 1 + 0.55 * smoothstep(0.74, 1.05, sN);
      this.wave[j] = this.amp * env * Math.sin(this.phase - sN * 6.1);
      this.theta[j] = this.headingAt(sN * this.size) + this.wave[j];
    }
    // recoil: pivot the wave about ~25% of the body so the head yaws a little
    let lat = 0, pivot = 0;
    const jp = Math.round(0.24 / SPINE_LEN * (NJ - 1));
    for (let j = 1; j <= jp; j++) lat -= Math.sin(0.5 * (this.wave[j - 1] + this.wave[j])) * ds;
    pivot = lat;
    const rx = -Math.sin(this.heading), rz = Math.cos(this.heading);
    let x = this.x - rx * pivot, z = this.z - rz * pivot;
    this.spine[0].set(x, this.y, z, this.theta[0]);
    for (let j = 1; j < NJ; j++) {
      const a = 0.5 * (this.theta[j - 1] + this.theta[j]);
      x -= Math.cos(a) * ds; z -= Math.sin(a) * ds;
      this.spine[j].set(x, this.y - this.pitch * j * ds, z, this.theta[j]);
    }
    this.roll += (clamp(-this.turn * 0.22, -0.3, 0.3) - this.roll) * (1 - Math.exp(-dt * 3));
    this.u.uRoll.value = this.roll;
    this.u.uFinPhase.value = this.finPhase;
    this.u.uTailPhase.value = this.phase;

    // ---- soft shadow on the pond bed
    const hAbove = Math.max(this.y - floor, 0.05);
    const k = Math.round((NJ - 1) * 0.72);
    const sx = 0.10 * hAbove, sz = 0.28 * hAbove; // nudged away from the glow in the west
    ctx.fishSeg.value[this.i].set(this.spine[1].x + sx, this.spine[1].z + sz, this.spine[k].x + sx, this.spine[k].z + sz);
    ctx.fishPar.value[this.i].set(0.085 * this.size, 0.06 + hAbove * 0.42, clamp(1.05 - hAbove * 0.95, 0.25, 1.0));
  }
}

export function createKoi(ctx) {
  const rng = mulberry32(977);
  const geo = buildKoiGeometry();
  const group = new THREE.Group();
  const fish = [];
  for (let i = 0; i < NF; i++) {
    const k = new Koi(i, ctx, geo, rng);
    fish.push(k); group.add(k.mesh);
  }
  ctx.scene.add(group);
  ctx.tag(group, { refl: false, main: false });   // only ever seen through the water
  let nextKiss = 3.5, nextDart = 8, nextDimple = 1;
  ctx.updaters.push((dt, t) => {
    nextKiss -= dt; nextDart -= dt; nextDimple -= dt;
    if (nextDimple <= 0) {
      // midges and pond-skaters dimple the surface here and there
      nextDimple = 0.9 + rng() * 2.2;
      const x = (rng() * 2 - 1) * 4.0, z = (rng() * 2 - 1) * 3.0;
      if (pondD(x, z) > 0.35) ctx.water.ripple(x, z, 0.035, 0.2 + rng() * 0.15, 5.0, 0.4);
    }
    if (nextKiss <= 0) {
      nextKiss = 3.5 + rng() * 5.5;
      const f = fish[Math.floor(rng() * fish.length)];
      if (f.riseT <= 0) { f.riseT = 4.0; f.kissed = false; }
    }
    if (nextDart <= 0) {
      nextDart = 9 + rng() * 14;
      fish[Math.floor(rng() * fish.length)].burst = 0.7 + rng() * 0.5;
    }
    for (const f of fish) f.update(dt, t, fish);
  });
  return { fish, group };
}
