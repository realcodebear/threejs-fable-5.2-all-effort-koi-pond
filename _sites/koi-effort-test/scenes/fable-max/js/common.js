// Shared helpers: seeded random numbers, the pond outline, terrain height, GLSL noise and
// a small utility for patching three.js standard materials with procedural shading.
import * as THREE from 'three';

// ---------------------------------------------------------------------------------------
// Deterministic random numbers (the scene looks the same on every load)
// ---------------------------------------------------------------------------------------
export function makeRng(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.sign = () => (r() < 0.5 ? -1 : 1);
  r.gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  };
  return r;
}

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------------------
// Value noise on the CPU (terrain shape, placement jitter)
// ---------------------------------------------------------------------------------------
function ihash(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = ihash(xi, yi), b = ihash(xi + 1, yi), c = ihash(xi, yi + 1), d = ihash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm2(x, y, oct = 4) {
  let s = 0, a = 0.5;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x, y);
    x = x * 2.03 + 17.13; y = y * 2.03 - 9.71; a *= 0.5;
  }
  return s;
}
function ihash3(x, y, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440662683)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(ihash3(xi, yi, zi), ihash3(xi + 1, yi, zi), u), l(ihash3(xi, yi + 1, zi), ihash3(xi + 1, yi + 1, zi), u), v),
    l(l(ihash3(xi, yi, zi + 1), ihash3(xi + 1, yi, zi + 1), u), l(ihash3(xi, yi + 1, zi + 1), ihash3(xi + 1, yi + 1, zi + 1), u), v),
    w);
}
export function fbm3(x, y, z, oct = 4) {
  let s = 0, a = 0.5;
  for (let i = 0; i < oct; i++) {
    s += a * noise3(x, y, z);
    x = x * 2.03 + 17.13; y = y * 2.03 - 9.71; z = z * 2.03 + 4.37; a *= 0.5;
  }
  return s;
}

// ---------------------------------------------------------------------------------------
// The pond: an organic gourd-like outline, water surface at y = 0
// ---------------------------------------------------------------------------------------
export const POND = {
  maxDepth: 1.0,
  G: 8.0,            // the signed-distance grid covers [-G, G]^2
  N: 256,
  cx: -0.1, cz: -0.4,   // a point from which the whole outline is visible (for walking around it)
  // gourd shape: a large lobe near the starting camera and a smaller one behind it
  lobes: [{ x: 0.30, z: 1.45, r: 2.90 }, { x: -0.55, z: -2.45, r: 2.05 }],
};

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
// Signed distance to the shoreline in metres, positive inside the pond.
function pondSDFAnalytic(x, z) {
  const A = POND.lobes[0], B = POND.lobes[1];
  const dA = Math.hypot(x - A.x, z - A.z) - A.r;
  const dB = Math.hypot(x - B.x, z - B.z) - B.r;
  let d = smin(dA, dB, 1.7);
  // organic wobble of the outline
  d += 0.13 * Math.sin(1.3 * x + 0.5 * z + 1.0) + 0.09 * Math.sin(-0.8 * x + 1.7 * z + 2.2) + 0.05 * Math.sin(2.6 * x - 2.1 * z + 0.4);
  return -d;
}
// Point on the shoreline in direction t (radians) seen from the pond centre.
export function pondBoundary(t, out = new THREE.Vector2()) {
  const dx = Math.cos(t), dz = Math.sin(t);
  let lo = 0.3, hi = 8.0;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) * 0.5;
    if (pondSDFAnalytic(POND.cx + dx * mid, POND.cz + dz * mid) > 0) lo = mid; else hi = mid;
  }
  const r = (lo + hi) * 0.5;
  return out.set(POND.cx + dx * r, POND.cz + dz * r);
}

const sdfData = new Float32Array(POND.N * POND.N);
(function buildSdf() {
  const { N, G } = POND;
  for (let j = 0; j < N; j++) {
    const z = -G + (2 * G * (j + 0.5)) / N;
    for (let i = 0; i < N; i++) {
      const x = -G + (2 * G * (i + 0.5)) / N;
      sdfData[j * N + i] = clamp(pondSDFAnalytic(x, z), -6, 6);
    }
  }
})();

// Signed distance to the shoreline (metres, + inside the water), bilinear from the grid.
export function sdf(x, z) {
  const { N, G } = POND;
  let fx = ((x + G) / (2 * G)) * N - 0.5;
  let fz = ((z + G) / (2 * G)) * N - 0.5;
  if (fx < 0 || fz < 0 || fx > N - 1 || fz > N - 1) {
    // outside the grid: fall back to the analytic estimate
    return clamp(pondSDFAnalytic(x, z), -60, 6);
  }
  const i = Math.min(N - 2, Math.floor(fx)), j = Math.min(N - 2, Math.floor(fz));
  const u = fx - i, v = fz - j;
  const a = sdfData[j * N + i], b = sdfData[j * N + i + 1];
  const c = sdfData[(j + 1) * N + i], d = sdfData[(j + 1) * N + i + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function sdfGrad(x, z, out = new THREE.Vector2()) {
  const e = 0.08;
  out.set(sdf(x + e, z) - sdf(x - e, z), sdf(x, z + e) - sdf(x, z - e));
  const l = out.length();
  if (l > 1e-6) out.multiplyScalar(1 / l);
  return out;
}

export const sdfTexture = new THREE.DataTexture(sdfData, POND.N, POND.N, THREE.RedFormat, THREE.FloatType);
sdfTexture.minFilter = THREE.LinearFilter;
sdfTexture.magFilter = THREE.LinearFilter;
sdfTexture.wrapS = sdfTexture.wrapT = THREE.ClampToEdgeWrapping;
sdfTexture.needsUpdate = true;

// Terrain height: pond bed inside, mossy banks and gentle mounds outside.
export function groundHeight(x, z) {
  const d = sdf(x, z);
  if (d >= 0) {
    const depth = 0.20 * smoothstep(0.0, 0.28, d) + 0.80 * smoothstep(0.1, 2.2, d);
    let h = -depth * POND.maxDepth * (1.0 + 0.10 * (noise2(x * 0.9 + 3.1, z * 0.9 - 1.7) - 0.5));
    h += (noise2(x * 3.1, z * 3.1) - 0.5) * 0.04 * smoothstep(0.3, 1.0, d);
    return h;
  }
  const o = -d;
  const r = Math.hypot(x, z);
  const bank = 0.16 * smoothstep(0.0, 0.5, o);
  const m = fbm2(x * 0.21 + 11.3, z * 0.21 + 4.2, 3) - 0.36;
  // gentle mounds in the garden, smoothing out towards the fence
  const mounds = Math.max(m, 0) * 1.1 * smoothstep(0.4, 4.5, o) * (1.0 - smoothstep(9.0, 13.5, r));
  const rim = smoothstep(11.0, 30.0, r) * 3.2;
  return bank + mounds + rim;
}

// ---------------------------------------------------------------------------------------
// Shared uniforms
// ---------------------------------------------------------------------------------------
export const uTime = { value: 0 };
export const uSdf = { value: sdfTexture };
export const uSdfScale = { value: 1 / (2 * POND.G) };

// ---------------------------------------------------------------------------------------
// GLSL noise library (hash functions without sin(): identical results on every GPU)
// ---------------------------------------------------------------------------------------
export const GLSL_NOISE = /* glsl */`
#ifndef POND_NOISE
#define POND_NOISE
float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 hash33(vec3 p3) { p3 = fract(p3 * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), u.x), mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x), mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x), u.y),
    u.z);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.13, -9.71); a *= 0.5; }
  return s;
}
float fbm3(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise3(p); p = p * 2.03 + vec3(17.13, -9.71, 4.37); a *= 0.5; }
  return s;
}
float fbm3lo(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 2; i++) { s += a * vnoise3(p); p = p * 2.03 + vec3(17.13, -9.71, 4.37); a *= 0.5; }
  return s;
}
// Cellular noise: x = distance to nearest point, y = second nearest, z = id of the nearest cell
vec3 voronoi(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = hash22(i + g);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = hash12(i + g + 7.31); }
    else if (d < d2) { d2 = d; }
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
#endif
`;

// Fragment-only helpers (screen-space derivatives).
export const GLSL_BUMP = /* glsl */`
// Bump mapping from a procedural height value using screen-space derivatives.
vec3 bumpNormal(vec3 n, vec3 viewPos, float h, float scale) {
  vec3 dpdx = dFdx(viewPos), dpdy = dFdy(viewPos);
  float dhdx = dFdx(h), dhdy = dFdy(h);
  vec3 r1 = cross(dpdy, n), r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * n - scale * grad);
}
`;

// ---------------------------------------------------------------------------------------
// Patch a MeshStandardMaterial / MeshPhysicalMaterial with procedural code.
//   opts.uniforms        extra uniforms (shared by reference)
//   opts.vertexPars      declarations for the vertex shader
//   opts.vertexNormal    code after <beginnormal_vertex>  (may modify objectNormal)
//   opts.vertex          code after <begin_vertex>        (may modify transformed)
//   opts.fragmentPars    declarations for the fragment shader
//   opts.color           code after <color_fragment>      (may modify diffuseColor)
//   opts.roughness       code after <roughnessmap_fragment> (may modify roughnessFactor)
//   opts.normal          code after <normal_fragment_maps>  (may modify normal)
//   opts.emissive        code after <emissivemap_fragment>  (may modify totalEmissiveRadiance)
//   opts.final           code before <opaque_fragment>     (may modify outgoingLight)
// Varyings always available: vWPos (world position), vWNormal (world normal), vOPos (object position)
// ---------------------------------------------------------------------------------------
let patchCounter = 0;
export function patchStandard(material, opts) {
  // materials that share opts.key share one compiled program (each keeps its own uniforms)
  const key = opts.key || ('pond-' + (opts.name || 'mat') + '-' + (patchCounter++));
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, opts.uniforms || {});
    shader.uniforms.uTime = uTime;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        varying vec3 vWPos;
        varying vec3 vWNormal;
        varying vec3 vOPos;
        ${GLSL_NOISE}
        ${opts.vertexPars || ''}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        ${opts.vertexNormal || ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vOPos = position;
        ${opts.vertex || ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 wp = vec4(transformed, 1.0);
          vec3 wn = objectNormal;
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
            mat3 im = mat3(instanceMatrix);
            wn /= vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
            wn = im * wn;
          #endif
          wp = modelMatrix * wp;
          vWPos = wp.xyz;
          vWNormal = normalize(mat3(modelMatrix) * wn);
        }
        ${opts.vertexEnd || ''}`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        varying vec3 vWPos;
        varying vec3 vWNormal;
        varying vec3 vOPos;
        ${GLSL_NOISE}
        ${GLSL_BUMP}
        ${opts.fragmentPars || ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${opts.color || ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        ${opts.roughness || ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        ${opts.normal || ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${opts.emissive || ''}`)
      .replace('#include <opaque_fragment>', `${opts.final || ''}
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => key;
  return material;
}

