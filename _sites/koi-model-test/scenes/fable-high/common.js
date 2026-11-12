// Shared helpers: pond shape, noise, layers, GLSL snippets.
import * as THREE from 'three';

// Render layers. The main camera sees layer 0. The mirror camera sees layer 1.
// The underwater (refraction) pass sees layer 2.
export const L_MAIN = 0, L_REFLECT = 1, L_UNDER = 2, L_NONE = 5;

export const uTime = { value: 0 };

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- pond shape
export const POND_R0 = 2.65, POND_SX = 1.28;

export function pondEdge(th) {
  return POND_R0 * (1 + 0.13 * Math.cos(2 * th + 0.5) + 0.10 * Math.cos(3 * th + 1.9) + 0.04 * Math.cos(5 * th + 4.2));
}
// Approximate signed distance to the shoreline (negative = in the water).
export function pondSD(x, z) {
  const px = x / POND_SX;
  return Math.hypot(px, z) - pondEdge(Math.atan2(z, px));
}
// Point at shoreline angle th, pushed out by sd metres (negative = inwards).
export function pondPoint(th, sd, out = new THREE.Vector3()) {
  const r = pondEdge(th) + sd;
  return out.set(POND_SX * r * Math.cos(th), 0, r * Math.sin(th));
}

export const GLSL_POND = /* glsl */`
float pondSD(vec2 p){
  p.x /= ${POND_SX.toFixed(4)};
  float th = atan(p.y, p.x);
  float e = ${POND_R0.toFixed(4)} * (1.0 + 0.13*cos(2.0*th+0.5) + 0.10*cos(3.0*th+1.9) + 0.04*cos(5.0*th+4.2));
  return length(p) - e;
}
`;

// ---------------------------------------------------------------- JS noise
function h2(ix, iz) {
  let n = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = h2(ix, iz), b = h2(ix + 1, iz), c = h2(ix, iz + 1), d = h2(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
export function fbm2(x, z, oct = 4) {
  let a = 0.5, s = 0;
  for (let i = 0; i < oct; i++) { s += a * noise2(x, z); x = x * 2.03 + 17.1; z = z * 2.03 + 9.7; a *= 0.5; }
  return s;
}
function h3(ix, iy, iz) {
  let n = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 1440662683)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h3(ix, iy, iz), h3(ix + 1, iy, iz), fx), l(h3(ix, iy + 1, iz), h3(ix + 1, iy + 1, iz), fx), fy),
    l(l(h3(ix, iy, iz + 1), h3(ix + 1, iy, iz + 1), fx), l(h3(ix, iy + 1, iz + 1), h3(ix + 1, iy + 1, iz + 1), fx), fy),
    fz);
}
export function fbm3(x, y, z, oct = 3) {
  let a = 0.5, s = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x, y, z); x = x * 2.03 + 17.1; y = y * 2.03 + 5.3; z = z * 2.03 + 9.7; a *= 0.5; }
  return s;
}

// ---------------------------------------------------------------- terrain height
export function terrainHeight(x, z) {
  const sd = pondSD(x, z);
  if (sd < 0) {
    const d = -sd;
    const shelf = smoothstep(0, 0.3, d);
    const deep = smoothstep(0.1, 1.9, d);
    return -(0.16 * shelf + 0.82 * Math.pow(deep, 0.8)) + (noise2(x * 1.7 + 40, z * 1.7) - 0.5) * 0.09 * shelf;
  }
  const bank = 0.2 * (1 - Math.exp(-sd * 2.5));
  const und = (fbm2(x * 0.12 + 7, z * 0.12 + 3) - 0.45) * 1.8 * smoothstep(1.5, 10, sd);
  const small = (noise2(x * 0.9, z * 0.9) - 0.5) * 0.1 * smoothstep(0.2, 1.5, sd);
  return Math.max(bank + und + small, 0.04 * smoothstep(0, 0.1, sd));
}

// ---------------------------------------------------------------- GLSL noise
export const GLSL_NOISE = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y);
}
float vnoise3(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(
    mix(mix(hash13(i), hash13(i+vec3(1,0,0)), f.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
    mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y),
    f.z);
}
float fbm2(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<4;i++){ s += a*vnoise(p); p = p*2.03 + vec2(17.1, 9.7); a *= 0.5; } return s; }
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for(int i=0;i<3;i++){ s += a*vnoise3(p); p = p*2.03 + vec3(17.1, 5.3, 9.7); a *= 0.5; } return s; }
`;

// ---------------------------------------------------------------- material helpers
// Adds world position / world normal varyings and the noise library to a built-in material shader.
export function injectWorld(sh) {
  sh.uniforms.uTime = uTime;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', 'varying vec3 vWPos;\nvarying vec3 vWNrm;\nuniform float uTime;\n#include <common>')
    .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
      #ifdef USE_INSTANCING
        vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        vWNrm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
      #else
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNrm = normalize(mat3(modelMatrix) * objectNormal);
      #endif`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', 'varying vec3 vWPos;\nvarying vec3 vWNrm;\nuniform float uTime;\n' + GLSL_NOISE + GLSL_POND + '\n#include <common>');
}

// layer helper
export function setLayers(obj, { main = true, reflect = false, under = false } = {}) {
  obj.traverse((o) => {
    o.layers.set(main ? L_MAIN : L_NONE);
    if (reflect) o.layers.enable(L_REFLECT);
    if (under) o.layers.enable(L_UNDER);
    if (!main) o.layers.disable(L_NONE);
  });
}

// Tapered tube along a list of points. Returns arrays to be merged.
export function tubeGeometry(pts, radii, radial = 6) {
  const pos = [], nrm = [], idx = [];
  const t = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3(), tmp = new THREE.Vector3();
  let prevN = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(i - 1, 0)], c = pts[Math.min(i + 1, pts.length - 1)];
    t.subVectors(c, a).normalize();
    if (!prevN) {
      n.set(1, 0, 0); if (Math.abs(t.x) > 0.9) n.set(0, 0, 1);
    } else n.copy(prevN);
    n.addScaledVector(t, -n.dot(t)).normalize();
    b.crossVectors(t, n);
    prevN = n.clone();
    for (let j = 0; j < radial; j++) {
      const a2 = (j / radial) * Math.PI * 2;
      tmp.copy(n).multiplyScalar(Math.cos(a2)).addScaledVector(b, Math.sin(a2));
      nrm.push(tmp.x, tmp.y, tmp.z);
      pos.push(pts[i].x + tmp.x * radii[i], pts[i].y + tmp.y * radii[i], pts[i].z + tmp.z * radii[i]);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b2 = i * radial + (j + 1) % radial, c = a + radial, d = b2 + radial;
      idx.push(a, b2, c, b2, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}
