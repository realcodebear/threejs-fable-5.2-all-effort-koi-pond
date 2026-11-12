// Koi: procedural fish (lofted body + fins), swim animation in the vertex shader,
// procedural colour patterns for several varieties, and a small steering simulation.
import * as THREE from 'three';
import { makeRng, clamp, lerp, noise2, sdf, sdfGrad, groundHeight, patchStandard } from './common.js';

// ---------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------
const Z_NOSE = 0.42, BODY_LEN = 0.80;          // body spans z = 0.42 .. -0.38 (fish length ~ 1 unit)

function catmull(pts, t) {
  // pts: [[s, v], ...] sorted by s; returns interpolated v at t
  let i = 0;
  while (i < pts.length - 2 && t > pts[i + 1][0]) i++;
  const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
  const u = clamp((t - p1[0]) / (p2[0] - p1[0]), 0, 1);
  const m1 = (p2[1] - p0[1]) / Math.max(p2[0] - p0[0], 1e-5) * (p2[0] - p1[0]);
  const m2 = (p3[1] - p1[1]) / Math.max(p3[0] - p1[0], 1e-5) * (p2[0] - p1[0]);
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p1[1] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2[1] + (u3 - u2) * m2;
}
// half width / half height of the body along the spine (0 = nose, 1 = base of the tail fin):
// broad head, widest at the shoulders, then a long taper to the tail
const W_PTS = [[0, 0], [0.012, 0.027], [0.04, 0.048], [0.09, 0.066], [0.16, 0.083], [0.24, 0.094], [0.32, 0.097], [0.44, 0.089], [0.58, 0.072], [0.72, 0.052], [0.85, 0.035], [0.94, 0.025], [1.0, 0.020]];
const H_PTS = [[0, 0], [0.012, 0.021], [0.04, 0.040], [0.09, 0.060], [0.16, 0.083], [0.24, 0.101], [0.34, 0.112], [0.46, 0.111], [0.58, 0.097], [0.72, 0.075], [0.85, 0.054], [0.94, 0.041], [1.0, 0.035]];
const bodyW = (s) => Math.max(0, catmull(W_PTS, s));
const bodyH = (s) => Math.max(0, catmull(H_PTS, s));
const bodyYc = (s) => 0.012 * Math.sin(Math.PI * clamp(s, 0, 1)) - 0.006;    // slight arch of the back

class Builder {
  constructor() { this.pos = []; this.nor = []; this.aS = []; this.aFin = []; this.idx = []; }
  vert(x, y, z, s, fu, fv, id, nx = 0, ny = 0, nz = 0) {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.aS.push(s); this.aFin.push(fu, fv, id);
    return this.pos.length / 3 - 1;
  }
  quad(a, b, c, d) { this.idx.push(a, b, c, b, d, c); }
}

function buildKoiGeometry(finScale) {
  const body = new Builder();
  const fins = new Builder();

  // ---- body: rings lofted along the spine ----
  const NS = 34, NR = 22;
  const rings = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    const s = Math.pow(t, 1.35);                      // more rings around the head
    const w = bodyW(s), h = bodyH(s), yc = bodyYc(s);
    const ring = [];
    for (let j = 0; j <= NR; j++) {
      const a = (j / NR) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      // slightly flattened belly and a broad back
      const hy = ca > 0 ? h : h * 0.94;
      const sq = 1.0 + 0.10 * Math.pow(Math.abs(sa * ca) * 2, 2.0);   // a little boxier than an ellipse
      ring.push(body.vert(w * sa * sq, yc + hy * ca * sq, Z_NOSE - s * BODY_LEN, s, 0, 0, 0));
    }
    rings.push(ring);
  }
  for (let i = 0; i < NS; i++) for (let j = 0; j < NR; j++) {
    body.quad(rings[i][j], rings[i][j + 1], rings[i + 1][j], rings[i + 1][j + 1]);
  }
  // ---- eyes ----
  for (const side of [-1, 1]) {
    const s = 0.10, a = 1.22;
    const cx = side * bodyW(s) * Math.sin(a) * 0.90, cy = bodyYc(s) + bodyH(s) * Math.cos(a) * 0.90, cz = Z_NOSE - s * BODY_LEN;
    const r = 0.0150, base = [];
    const NE = 7;
    for (let i = 0; i <= NE; i++) {
      const row = [];
      const th = (i / NE) * Math.PI;
      for (let j = 0; j <= NE; j++) {
        const ph = (j / NE) * Math.PI * 2;
        const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
        row.push(body.vert(cx + x * r, cy + y * r, cz + z * r, s, 0, 0, 9));
      }
      base.push(row);
    }
    for (let i = 0; i < NE; i++) for (let j = 0; j < NE; j++) body.quad(base[i][j], base[i][j + 1], base[i + 1][j], base[i + 1][j + 1]);
  }

  // ---- fins (thin sheets) ----
  // A fin is a grid over (u, v): u runs from the base to the tip, v across.
  function finSheet(nu, nv, id, fn) {
    const grid = [];
    for (let i = 0; i <= nu; i++) {
      const row = [];
      for (let j = 0; j <= nv; j++) {
        const u = i / nu, v = (j / nv) * 2 - 1;
        const p = fn(u, v);                              // {x, y, z, s}
        row.push(fins.vert(p.x, p.y, p.z, p.s, u, v, id));
      }
      grid.push(row);
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) fins.quad(grid[i][j], grid[i][j + 1], grid[i + 1][j], grid[i + 1][j + 1]);
  }
  const sOfZ = (z) => (Z_NOSE - z) / BODY_LEN;

  // caudal (tail) fin: a forked fan in the vertical plane
  {
    const L = 0.235 * finScale, z0 = Z_NOSE - 0.985 * BODY_LEN, y0 = bodyYc(1.0);
    finSheet(9, 10, 1, (u, v) => {
      const av = Math.abs(v);
      const reach = 0.60 + 0.40 * Math.pow(av, 1.25);          // forked trailing edge
      const z = z0 - u * L * reach;
      const hh = 0.034 + (0.155 * (0.8 + 0.2 * finScale) - 0.034) * Math.pow(u, 0.85);
      const y = y0 + v * hh * (1.0 - 0.10 * u * (1 - av));
      return { x: 0, y, z, s: sOfZ(z) };
    });
  }
  // dorsal fin
  {
    const sA = 0.34, sB = 0.74;
    finSheet(12, 3, 2, (u, v) => {
      const s = lerp(sA, sB, u);
      const k = (v + 1) * 0.5;                                  // 0 at the back, 1 at the fin edge
      const hgt = (0.062 * (0.75 + 0.25 * finScale)) * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.55)), 0.7) * (1.0 - 0.45 * u) + 0.004;
      const lean = 0.035 * k * (0.4 + u);                        // rakes backwards
      const z = Z_NOSE - s * BODY_LEN - lean;
      return { x: 0, y: bodyYc(s) + bodyH(s) * 0.96 + hgt * k, z, s: sOfZ(z) };
    });
  }
  // paired fins: pectoral (id 3/4) and pelvic (id 5/6)
  function pairedFin(sAttach, angle, len, width, sweep, droop, idBase, nu, nv) {
    for (const side of [-1, 1]) {
      const bw = bodyW(sAttach), bh = bodyH(sAttach);
      const bx = side * bw * Math.sin(angle) * 0.92, by = bodyYc(sAttach) + bh * Math.cos(angle) * 0.92, bz = Z_NOSE - sAttach * BODY_LEN;
      // fin axis: outwards, swept back, drooping a little
      const ax = new THREE.Vector3(side * Math.cos(sweep), -droop, -Math.sin(sweep)).normalize();
      // across-fin axis: mostly along the body so that the fan lies flat when seen from above
      const cr = new THREE.Vector3(side * Math.sin(sweep) * 0.9, -0.22, Math.cos(sweep)).normalize();
      finSheet(nu, nv, idBase + (side > 0 ? 1 : 0), (u, v) => {
        const w = width * (0.22 + 0.78 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.62) * 0.92), 0.8));
        const l = len * u * (1.0 - 0.16 * v * v * u);            // rounded tip
        const x = bx + ax.x * l + cr.x * w * v * 0.5;
        const y = by + ax.y * l + cr.y * w * v * 0.5 - 0.02 * u * u;
        const z = bz + ax.z * l + cr.z * w * v * 0.5;
        return { x, y, z, s: sAttach + 0.02 * u };
      });
    }
  }
  pairedFin(0.215, 1.95, 0.165 * finScale, 0.105 * (0.85 + 0.15 * finScale), 0.95, 0.30, 3, 6, 6);
  pairedFin(0.50, 2.35, 0.090 * finScale, 0.060, 1.15, 0.55, 5, 4, 4);
  // anal fin (small, under the tail)
  finSheet(4, 3, 7, (u, v) => {
    const s = lerp(0.70, 0.80, (v + 1) * 0.5) + 0.06 * u;
    return { x: 0, y: bodyYc(s) - bodyH(s) * 0.92 - 0.055 * finScale * u, z: Z_NOSE - s * BODY_LEN, s };
  });

  // ---- assemble one geometry with two groups (0 = body, 1 = fins) ----
  const nb = body.pos.length / 3;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(body.pos.concat(fins.pos));
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(body.aS.concat(fins.aS)), 1));
  geo.setAttribute('aFin', new THREE.BufferAttribute(new Float32Array(body.aFin.concat(fins.aFin)), 3));
  const idx = body.idx.concat(fins.idx.map((i) => i + nb));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.addGroup(0, body.idx.length, 0);
  geo.addGroup(body.idx.length, fins.idx.length, 1);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -0.1), 0.9);
  return geo;
}

// ---------------------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------------------
const KOI_VERTEX_PARS = /* glsl */`
  attribute float aS;
  attribute vec3 aFin;
  uniform float uPhase, uTurn, uAmp, uFlap;
  varying vec3 vFin;
  varying float vS;
`;
// Bends the fish along its spine: travelling wave + turning arc. Also flutters the fins.
const KOI_VERTEX_NORMAL = /* glsl */`
  float kS = aS;
  float kEnv = 0.07 + 0.93 * pow(clamp(kS, 0.0, 1.6), 1.75);
  float kArg = uPhase - kS * 5.6;
  float kWave = uAmp * 0.105 * kEnv * sin(kArg);
  float kdWave = uAmp * 0.105 * (0.93 * 1.75 * pow(clamp(kS, 0.001, 1.6), 0.75) * sin(kArg) - kEnv * 5.6 * cos(kArg));
  float kSb = kS - 0.30;
  float kBend = uTurn * kSb * kSb * 0.32;                           // arc of the turning circle
  float kdBend = uTurn * kSb * 0.64;
  float kX = kWave + kBend;
  float kSlope = -(kdWave + kdBend) / ${BODY_LEN.toFixed(2)};       // dX/dz
  float kCa = inversesqrt(1.0 + kSlope * kSlope);
  float kSa = kSlope * kCa;
  objectNormal = vec3(objectNormal.x * kCa + objectNormal.z * kSa, objectNormal.y, -objectNormal.x * kSa + objectNormal.z * kCa);
`;
const KOI_VERTEX = /* glsl */`
  vFin = aFin;
  vS = aS;
  {
    vec3 p = transformed;
    // fin motion (before the body bend)
    if (aFin.z > 2.5 && aFin.z < 4.5) {
      // pectoral fins: slow sculling
      float side = aFin.z > 3.5 ? 1.0 : -1.0;
      float fl = sin(uFlap + side * 0.6) * 0.5 + 0.5;
      p.y += aFin.x * aFin.x * (0.030 * sin(uFlap * 1.0 + side) - 0.012);
      p.z -= aFin.x * aFin.x * 0.035 * fl;
      p.x -= side * aFin.x * aFin.x * 0.020 * fl;
    } else if (aFin.z > 4.5 && aFin.z < 6.5) {
      p.y += aFin.x * aFin.x * 0.010 * sin(uFlap * 1.3 + aFin.z);
    }
    float x = p.x;
    p.x = kX + x * kCa;
    p.z = p.z - x * kSa;
    if (aFin.z > 0.5 && aFin.z < 1.5) {
      // tail fin: soft, trails behind the body wave
      p.x += uAmp * 0.030 * aFin.x * aFin.x * sin(kArg - 1.1 - aFin.x * 1.2) + 0.012 * aFin.x * sin(kArg * 2.0 + aFin.y * 2.0) * aFin.x;
    } else if (aFin.z > 1.5 && aFin.z < 2.5) {
      p.x += 0.010 * (aFin.y * 0.5 + 0.5) * sin(kArg - 0.8);
    }
    transformed = p;
  }
`;

const KOI_FRAG_PARS = /* glsl */`
  uniform vec3 uColA, uColB, uColC;
  uniform vec4 uPatt;      // x: patch scale, y: patch threshold, z: spot scale, w: spot threshold
  uniform vec4 uStyle;     // x: seed, y: belly lightening, z: sheen, w: variety special (1 = tancho, 2 = asagi)
  uniform float uGlow;
  varying vec3 vFin;
  varying float vS;
  float gKoiRough;
  vec3 koiPattern(vec3 q, out float sheen) {
    float seed = uStyle.x;
    vec3 pq = vec3(q.x * 5.2, q.y * 2.4, q.z * 3.9);
    float nA = fbm3(pq * uPatt.x + seed);
    float nC = fbm3lo(pq * uPatt.z + seed * 1.7 + 31.0);
    // the back carries the pattern; flanks fade to the belly colour
    float h = clamp(q.y / 0.11, -1.0, 1.0);
    float back = smoothstep(-0.55, 0.25, h + (nC - 0.5) * 0.5);
    float edge = 0.018;
    float mA = smoothstep(uPatt.y - edge, uPatt.y + edge, nA) * back;
    float mC = smoothstep(uPatt.w - edge, uPatt.w + edge, nC) * smoothstep(-0.8, 0.0, h);
    vec3 col = uColA;
    if (uStyle.w > 0.5 && uStyle.w < 1.5) {
      // tancho: one round crimson spot on the head
      float d = length(vec2(q.x * 1.15, q.z - 0.262));
      mA = smoothstep(0.050, 0.044, d + (nA - 0.5) * 0.012) * step(0.0, q.y);
      mC = 0.0;
    }
    col = mix(col, uColB, mA);
    col = mix(col, uColC, mC);
    if (uStyle.w > 1.5) {
      // asagi: net of dark scale edges on a blue back, warm flanks
      float sc = sin(vS * 150.0) * sin(atan(q.x, q.y) * 15.0 + step(0.0, sin(vS * 150.0)) * 3.14159);
      col = mix(uColB, uColA * (0.72 + 0.28 * smoothstep(-0.2, 0.5, sc)), smoothstep(-0.25, 0.2, h));
      col = mix(col, uColC, smoothstep(0.1, -0.6, h) * 0.0);
    }
    // pale belly
    col = mix(col, mix(col, vec3(0.90, 0.86, 0.80), uStyle.y), smoothstep(-0.15, -0.85, h));
    // scales: staggered rows of rounded cells, each a little darker towards its base
    float ang = atan(q.x, q.y);
    vec2 suv = vec2(vS * 58.0, ang * 8.6);
    vec2 sa = fract(suv) - 0.5, sb = fract(suv + 0.5) - 0.5;
    float da = dot(sa, sa), db = dot(sb, sb);
    vec2 sc = da < db ? sa : sb;
    float rim = smoothstep(0.30, 0.50, length(sc));
    float tile = sc.x + 0.5;                                    // 0 at the front of a scale, 1 at its free edge
    float fw = fwidth(suv.x) + fwidth(suv.y);
    float scaleVis = smoothstep(0.17, 0.26, vS) * smoothstep(1.02, 0.9, vS) * smoothstep(-0.75, -0.2, h) * (1.0 - smoothstep(0.35, 0.9, fw));
    col *= 1.0 - scaleVis * (0.20 * rim + 0.10 * (1.0 - tile));
    sheen = uStyle.z + 0.25 * scaleVis * (1.0 - rim) * tile;
    // head: smooth skin with a faint warm tint, gill cover line
    float head = smoothstep(0.215, 0.185, vS);
    col = mix(col, col * vec3(1.0, 0.93, 0.86), head * 0.55);
    float gill = smoothstep(0.012, 0.0, abs(vS - 0.205 - 0.035 * (1.0 - abs(h)))) * smoothstep(0.55, -0.1, h) * smoothstep(-0.95, -0.5, h);
    col *= 1.0 - 0.28 * gill;
    // soft darker line along the top of the back
    col *= 1.0 - 0.08 * smoothstep(0.025, 0.0, abs(q.x)) * smoothstep(0.2, 0.9, h);
    return col;
  }
`;

function koiBodyMaterial(u) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.0 });
  mat.envMapIntensity = 0.35;
  patchStandard(mat, {
    key: 'koi-body',
    uniforms: u,
    vertexPars: KOI_VERTEX_PARS,
    vertexNormal: KOI_VERTEX_NORMAL,
    vertex: KOI_VERTEX,
    fragmentPars: KOI_FRAG_PARS,
    color: /* glsl */`
      {
        float sheen;
        vec3 col = koiPattern(vOPos, sheen);
        gKoiRough = mix(0.82, 0.50, clamp(sheen, 0.0, 1.0));
        if (vFin.z > 8.5) { col = vec3(0.012, 0.011, 0.012); gKoiRough = 0.12; }
        diffuseColor.rgb = col;
      }
    `,
    roughness: /* glsl */`
      roughnessFactor = gKoiRough;
    `,
    emissive: /* glsl */`
      // koi stay luminous in the dim water (soft light scattered inside the pond)
      totalEmissiveRadiance += diffuseColor.rgb * uGlow * (0.55 + 0.45 * smoothstep(-0.3, 0.6, normalize(vWNormal).y));
    `,
  });
  return mat;
}

function koiFinMaterial(u) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide,
    transparent: true, depthWrite: false,
  });
  mat.envMapIntensity = 0.4;
  patchStandard(mat, {
    key: 'koi-fin',
    uniforms: u,
    vertexPars: KOI_VERTEX_PARS,
    vertexNormal: KOI_VERTEX_NORMAL,
    vertex: KOI_VERTEX,
    fragmentPars: KOI_FRAG_PARS,
    color: /* glsl */`
      {
        float sheen;
        // colour of the body where the fin is attached bleeds into the fin base
        vec3 baseCol = koiPattern(vec3(vOPos.x * 0.3, 0.06, vOPos.z), sheen);
        vec3 pale = mix(vec3(0.92, 0.88, 0.82), uColA, 0.35);
        float u = vFin.x, v = vFin.y;
        vec3 col = mix(baseCol, pale, smoothstep(0.0, 0.55, u));
        // fin rays
        float rays = 0.5 + 0.5 * sin(v * (vFin.z < 1.5 ? 34.0 : 22.0) * (0.6 + 0.4 * u) + u * 3.0);
        col *= 0.80 + 0.20 * rays;
        float alpha = mix(0.92, 0.42, smoothstep(0.1, 1.0, u)) * (0.80 + 0.20 * rays);
        alpha *= smoothstep(1.0, 0.86, abs(v));               // soft edge
        alpha *= smoothstep(1.0, 0.90, u);
        diffuseColor = vec4(col, alpha);
      }
    `,
    emissive: /* glsl */`
      totalEmissiveRadiance += diffuseColor.rgb * uGlow * 0.9;
    `,
  });
  return mat;
}

// ---------------------------------------------------------------------------------------
// Varieties
// ---------------------------------------------------------------------------------------
const C = (hex) => new THREE.Color(hex);
const WHITE = '#f4efe4', HI = '#f2521a', RED = '#d6301a', GOLD = '#f5b12e', SUMI = '#141317', CREAM = '#f3e3c2', ORANGE = '#f77f1e';
const VARIETIES = {
  //            base    patches  spots    patt [scale, thr, spotScale, spotThr]   style [belly, sheen, special]
  kohaku:   { a: WHITE, b: HI,    c: HI,    patt: [1.00, 0.50, 2.0, 2.0], style: [0.9, 0.15, 0] },
  kohaku2:  { a: WHITE, b: RED,   c: RED,   patt: [0.80, 0.46, 2.0, 2.0], style: [0.9, 0.15, 0] },
  sanke:    { a: WHITE, b: HI,    c: SUMI,  patt: [0.95, 0.52, 2.6, 0.64], style: [0.9, 0.15, 0] },
  showa:    { a: SUMI,  b: RED,   c: WHITE, patt: [0.85, 0.47, 1.3, 0.56], style: [0.2, 0.20, 0] },
  tancho:   { a: WHITE, b: RED,   c: RED,   patt: [1.00, 0.50, 2.0, 2.0], style: [0.9, 0.20, 1] },
  ogon:     { a: GOLD,  b: GOLD,  c: GOLD,  patt: [1.00, 2.00, 2.0, 2.0], style: [0.35, 0.85, 0] },
  yamabuki: { a: '#f7d154', b: '#f7d154', c: '#f7d154', patt: [1.0, 2.0, 2.0, 2.0], style: [0.45, 0.8, 0] },
  platinum: { a: '#eeeae0', b: WHITE, c: WHITE, patt: [1.0, 2.0, 2.0, 2.0], style: [0.5, 0.9, 0] },
  orenji:   { a: ORANGE, b: HI,   c: WHITE, patt: [0.70, 0.60, 1.2, 0.70], style: [0.5, 0.35, 0] },
  utsuri:   { a: SUMI,  b: ORANGE, c: ORANGE, patt: [0.90, 0.49, 2.0, 2.0], style: [0.1, 0.20, 0] },
  bekko:    { a: CREAM, b: CREAM, c: SUMI,  patt: [1.00, 2.00, 2.9, 0.62], style: [0.8, 0.20, 0] },
  asagi:    { a: '#6f8fb0', b: '#e8602a', c: WHITE, patt: [1.0, 2.0, 2.0, 2.0], style: [0.6, 0.25, 2] },
};

// ---------------------------------------------------------------------------------------
// The school
// ---------------------------------------------------------------------------------------
export class KoiSchool {
  constructor(water) {
    this.water = water;
    this.group = new THREE.Group();
    this.group.name = 'koi';
    this.fish = [];
    const rng = makeRng(777);
    this.rng = rng;
    const geoNormal = buildKoiGeometry(1.0);
    const geoLong = buildKoiGeometry(1.55);          // "butterfly" koi with long flowing fins

    const roster = [
      ['kohaku', 0.80, false], ['showa', 0.74, false], ['ogon', 0.66, true], ['sanke', 0.70, false],
      ['kohaku2', 0.62, true], ['tancho', 0.60, false], ['orenji', 0.56, false], ['platinum', 0.58, true],
      ['utsuri', 0.52, false], ['bekko', 0.50, false], ['kohaku', 0.46, false], ['asagi', 0.55, false],
      ['sanke', 0.42, true], ['kohaku2', 0.38, false], ['yamabuki', 0.48, true], ['kohaku', 0.64, false],
    ];
    roster.forEach(([name, len, longFins], i) => {
      const v = VARIETIES[name];
      const u = {
        uPhase: { value: rng.range(0, 6.28) }, uTurn: { value: 0 }, uAmp: { value: 1 }, uFlap: { value: rng.range(0, 6.28) },
        uColA: { value: C(v.a) }, uColB: { value: C(v.b) }, uColC: { value: C(v.c) },
        uPatt: { value: new THREE.Vector4(v.patt[0] * rng.range(0.9, 1.15), v.patt[1] + rng.range(-0.03, 0.03), v.patt[2], v.patt[3]) },
        uStyle: { value: new THREE.Vector4(rng.range(0, 200), v.style[0], v.style[1], v.style[2]) },
        uGlow: { value: 0.21 },
      };
      const mesh = new THREE.Mesh(longFins ? geoLong : geoNormal, [koiBodyMaterial(u), koiFinMaterial(u)]);
      mesh.scale.setScalar(len);
      mesh.rotation.order = 'YXZ';
      mesh.frustumCulled = false;
      this.group.add(mesh);

      // start somewhere in open water
      let x = 0, z = 0;
      for (let k = 0; k < 200; k++) {
        x = rng.range(-3, 3.4); z = rng.range(-4.4, 4.2);
        if (sdf(x, z) > 1.0) break;
      }
      this.fish.push({
        mesh, u, len, x, z,
        y: -rng.range(0.16, 0.42), yBase: -rng.range(0.16, 0.44),
        heading: rng.range(0, Math.PI * 2), omega: 0, turn: 0,
        speed: 0.2, cruise: rng.range(0.16, 0.30) * (0.7 + 0.5 * len), want: 0.2,
        wanderT: rng.range(0, 100), depthT: rng.range(0, 100),
        tx: x, tz: z, roamT: rng.range(0, 6),
        leader: -1, leaderTimer: rng.range(2, 12),
        burst: 0, burstTimer: rng.range(10, 45),
        kissTimer: rng.range(8, 60), kiss: 0,
        amp: 1, side: rng.sign(),
      });
    });
    this._g = new THREE.Vector2();
  }

  update(dt, time) {
    const fish = this.fish, g = this._g, rng = this.rng;
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      const dirx = Math.sin(f.heading), dirz = Math.cos(f.heading);
      let steer = 0;
      // unhurried cruising, now a little faster, now almost gliding
      let want = f.cruise * (0.62 + 0.76 * noise2(time * 0.09 + i * 7.3, i * 3.1));

      // --- wander: smooth, slowly changing turn bias ---
      f.wanderT += dt * 0.22;
      steer += (noise2(f.wanderT, i * 13.7) - 0.5) * 1.5;

      // --- roam: head for a spot somewhere else in the pond, then pick another ---
      f.roamT -= dt;
      if (f.roamT <= 0 || Math.hypot(f.tx - f.x, f.tz - f.z) < 0.7) {
        for (let k = 0; k < 30; k++) {
          f.tx = rng.range(-2.6, 3.2); f.tz = rng.range(-4.4, 4.2);
          if (sdf(f.tx, f.tz) > 0.95) break;
        }
        f.roamT = rng.range(10, 28);
      }
      if (f.leader < 0) {
        const dx = f.tx - f.x, dz = f.tz - f.z;
        const cross = dirz * dx - dirx * dz, dot = dirx * dx + dirz * dz;
        steer += clamp(Math.atan2(cross, dot) * 0.55, -0.7, 0.7);
      }

      // --- follow another fish for a while (loose trains of koi) ---
      f.leaderTimer -= dt;
      if (f.leaderTimer <= 0) {
        f.leaderTimer = rng.range(7, 22);
        f.leader = -1;
        if (rng() < 0.42) {
          const j = rng.int(0, fish.length - 1);
          if (j !== i && fish[j].leader !== i && Math.hypot(fish[j].x - f.x, fish[j].z - f.z) < 3.2) f.leader = j;
        }
      }
      if (f.leader >= 0) {
        const L = fish[f.leader];
        const tx = L.x - Math.sin(L.heading) * (0.55 * L.len + 0.35) + Math.cos(L.heading) * 0.22 * f.side;
        const tz = L.z - Math.cos(L.heading) * (0.55 * L.len + 0.35) - Math.sin(L.heading) * 0.22 * f.side;
        const dx = tx - f.x, dz = tz - f.z, dist = Math.hypot(dx, dz);
        if (dist > 0.05) {
          const cross = dirz * dx - dirx * dz;                     // > 0: target is towards +heading
          const dot = dirx * dx + dirz * dz;
          steer += clamp(Math.atan2(cross, dot) * 1.4, -1.6, 1.6);
          want = clamp(L.speed * (0.75 + dist * 0.6), 0.08, f.cruise * 1.8);
        }
      }

      // --- keep apart from neighbours (sideways and in depth) ---
      let yPush = 0;
      for (let j = 0; j < fish.length; j++) {
        if (j === i) continue;
        const o = fish[j];
        const dx = o.x - f.x, dz = o.z - f.z;
        const d2 = dx * dx + dz * dz;
        const reach = 0.42 * (f.len + o.len) + 0.12;
        if (d2 < reach * reach && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const k = 1 - d / reach;
          const cross = dirz * dx - dirx * dz;
          steer -= Math.sign(cross || 1) * k * 1.3;
          // pass above / below each other
          const dy = f.y - o.y;
          yPush += (dy >= 0 ? 1 : -1) * k * 0.5;
        }
      }

      // --- stay inside the pond: look ahead along the heading ---
      const margin = 0.42 + 0.30 * f.len;
      let urgency = 0;
      for (const la of [0.45 + 0.9 * f.len, 0.2]) {
        const ax = f.x + dirx * la, az = f.z + dirz * la;
        const d = sdf(ax, az) - margin;
        if (d < 0.9) {
          sdfGrad(ax, az, g);
          const cross = dirz * g.x - dirx * g.y;                   // which side is the open water?
          const u = clamp(1 - d / 0.9, 0, 1.6);
          let s = Math.sign(cross);
          if (Math.abs(cross) < 0.25) s = f.side;                  // heading straight at the bank: keep one side
          steer += s * u * u * 3.2;
          urgency = Math.max(urgency, u);
        }
      }
      if (urgency > 0.6) want *= lerp(1.0, 0.6, clamp((urgency - 0.6) * 1.5, 0, 1));

      // --- occasional burst of speed ---
      f.burstTimer -= dt;
      if (f.burstTimer <= 0) { f.burstTimer = rng.range(18, 60); f.burst = rng.range(0.5, 0.9); f.side = rng.sign(); }
      if (f.burst > 0) { f.burst -= dt; want = f.cruise * 3.2; steer += f.side * 0.9; }

      // --- now and then rise and kiss the surface ---
      f.kissTimer -= dt;
      if (f.kissTimer <= 0 && f.kiss === 0 && sdf(f.x, f.z) > 0.9) { f.kiss = 1; }
      let yTarget = f.yBase + (noise2(f.depthT += dt * 0.07, i * 5.1) - 0.5) * 0.22 + yPush * 0.12;
      if (f.kiss === 1) {
        yTarget = -0.045 - 0.085 * f.len;
        want *= 0.55;
        if (f.y > yTarget - 0.02) {
          this.water.addDrop(f.x + dirx * 0.42 * f.len, f.z + dirz * 0.42 * f.len, 0.06 + 0.04 * f.len, 0.0009 + 0.0010 * f.len, 2.3, 0.9);
          f.kiss = 2; f.kissTimer = 0.9;
        }
      } else if (f.kiss === 2) {
        yTarget = -0.045 - 0.085 * f.len;
        if (f.kissTimer <= 0) { f.kiss = 0; f.kissTimer = rng.range(25, 80); }
      }
      const bed = groundHeight(f.x, f.z);
      const yMin = bed + 0.10 + 0.13 * f.len, yMax = -0.035 - 0.085 * f.len;
      yTarget = clamp(yTarget, Math.min(yMin, yMax), yMax);
      const yPrev = f.y;
      f.y += (yTarget - f.y) * (1 - Math.exp(-dt * (f.kiss ? 1.6 : 0.8)));
      f.y = Math.max(f.y, Math.min(yMin, yMax));
      const vy = (f.y - yPrev) / Math.max(dt, 1e-4);

      // --- integrate ---
      const maxTurn = 1.1 + 2.2 * clamp(f.speed / 0.5, 0, 1) + (f.burst > 0 ? 1.5 : 0);
      steer = clamp(steer, -maxTurn, maxTurn);
      f.omega += (steer - f.omega) * (1 - Math.exp(-dt * 2.6));
      f.heading += f.omega * dt;
      const accel = (want - f.speed) * (1 - Math.exp(-dt * (want > f.speed ? 1.6 : 0.5)));
      f.speed += accel;
      f.x += dirx * f.speed * dt;
      f.z += dirz * f.speed * dt;
      // hard safety: never leave the water
      const dHere = sdf(f.x, f.z);
      if (dHere < margin * 0.7) {
        sdfGrad(f.x, f.z, g);
        const push = (margin * 0.7 - dHere);
        f.x += g.x * push * Math.min(1, dt * 4); f.z += g.y * push * Math.min(1, dt * 4);
      }

      // --- animation parameters ---
      const bl = f.speed / f.len;                                 // body lengths per second
      const thrust = clamp((want - f.speed) / Math.max(f.cruise, 0.05), -1, 2);
      const ampTarget = clamp(0.42 + 0.75 * bl + 0.55 * Math.max(thrust, 0), 0.3, 1.9);
      f.amp += (ampTarget - f.amp) * (1 - Math.exp(-dt * 3));
      f.u.uPhase.value += dt * Math.PI * 2 * (0.35 + 1.55 * bl + 0.5 * Math.max(thrust, 0));
      f.u.uAmp.value = f.amp;
      f.u.uFlap.value += dt * (1.6 + 1.5 * (1 - clamp(bl * 2, 0, 1)));
      const curv = clamp(f.omega / Math.max(f.speed, 0.12) * f.len, -1.4, 1.4);
      f.turn += (curv - f.turn) * (1 - Math.exp(-dt * 4));
      f.u.uTurn.value = f.turn;

      const m = f.mesh;
      m.position.set(f.x, f.y, f.z);
      m.rotation.y = f.heading;
      m.rotation.x = clamp(-Math.atan2(vy, Math.max(f.speed, 0.1)) * 0.8, -0.3, 0.3);
      m.rotation.z = clamp(-f.omega * 0.10, -0.2, 0.2);

      // --- fish just under the surface leave gentle wakes ---
      const shallow = clamp(1 - (-f.y - 0.05 - 0.085 * f.len) / 0.16, 0, 1);
      if (shallow > 0.02) {
        const a = 0.00030 * shallow * (0.4 + f.speed * 4.0) * (0.6 + f.len);
        this.water.addWake(f.x + dirx * 0.1 * f.len, f.z + dirz * 0.1 * f.len, dirx, dirz, 0.22 * f.len, a, 0.05 + 0.05 * f.len);
      }
    }
  }
}
