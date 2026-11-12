// Shared constants, noise helpers (CPU + GLSL) and the pond shape used by every module.
import * as THREE from 'three';

export const POND = { R0: 3.1, SX: 1.22, DEPTH: 0.95 };
export const OCC_EXT = 26.0;     // metres covered by the top-down occlusion map
export const RIPPLE_EXT = 10.2;  // metres covered by the ripple simulation
export const NL = 8;             // lantern lights passed to hand-written shaders
export const NF = 12;            // koi count
// drift zones of the floating lanterns (kept clear of lily pads)
export const FLOAT_ZONES = [{ x: -1.0, z: -0.75, r: 0.42 }, { x: 1.05, z: -0.35, r: 0.42 }, { x: -0.1, z: 0.75, r: 0.38 }];

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

// ---------------------------------------------------------------- CPU noise
function ih(x, y, z) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1103515245);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let fx = x - xi, fy = y - yi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const a = lerp(lerp(ih(xi, yi, zi), ih(xi + 1, yi, zi), fx), lerp(ih(xi, yi + 1, zi), ih(xi + 1, yi + 1, zi), fx), fy);
  const b = lerp(lerp(ih(xi, yi, zi + 1), ih(xi + 1, yi, zi + 1), fx), lerp(ih(xi, yi + 1, zi + 1), ih(xi + 1, yi + 1, zi + 1), fx), fy);
  return lerp(a, b, fz);
}
export function fbm3(x, y, z, oct = 4) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise3(x, y, z); n += a;
    x = x * 2.03 + 17.1; y = y * 2.03 + 5.3; z = z * 2.03 + 9.7; a *= 0.5;
  }
  return s / n;
}
export const fbm2 = (x, y, oct = 4) => fbm3(x, y, 0.37, oct);

// ---------------------------------------------------------------- pond shape
// The pond outline is a polar curve, stretched along x. pondD() > 0 means "inside".
export function pondR(th) {
  return POND.R0 * (1 + 0.10 * Math.cos(2 * th + 0.6) + 0.06 * Math.cos(3 * th - 1.0) + 0.03 * Math.cos(5 * th + 2.0));
}
export function pondD(x, z) {
  const px = x / POND.SX;
  return pondR(Math.atan2(z, px)) - Math.hypot(px, z);
}
// Point on the outline at polar angle th, pushed outward along the true normal by `off` metres.
export function edgePoint(th, off = 0) {
  const p = (t) => { const r = pondR(t); return [Math.cos(t) * r * POND.SX, Math.sin(t) * r]; };
  const a = p(th), b = p(th + 0.002), c = p(th - 0.002);
  let tx = b[0] - c[0], tz = b[1] - c[1];
  const l = Math.hypot(tx, tz); tx /= l; tz /= l;
  const nx = tz, nz = -tx; // outward for counter-clockwise parametrisation
  return { x: a[0] + nx * off, z: a[1] + nz * off, nx, nz, tx, tz, ds: l / 0.004 };
}

// Terrain height: bowl inside the pond, mossy bank and soft undulation outside.
export function groundH(x, z) {
  const d = pondD(x, z);
  if (d >= 0) {
    const t = 1 - Math.exp(-d * 1.9);
    return -POND.DEPTH * t + (fbm2(x * 1.3 + 5, z * 1.3, 3) - 0.5) * 0.12 * t;
  }
  const o = -d;
  let h = 0.13 * (1 - Math.exp(-o * 5.0));
  h += (fbm2(x * 0.12 + 3.1, z * 0.12 + 9.7, 3) - 0.42) * 1.1 * smoothstep(1.2, 9.0, o);
  h += smoothstep(11, 34, o) * 3.4 + smoothstep(34, 110, o) * 4.0;   // the garden sits in a gentle hollow
  return h;
}

// ---------------------------------------------------------------- GLSL chunks
export const POND_GLSL = /* glsl */`
float pondR(float th){
  return ${POND.R0.toFixed(4)} * (1.0 + 0.10*cos(2.0*th+0.6) + 0.06*cos(3.0*th-1.0) + 0.03*cos(5.0*th+2.0));
}
float pondD(vec2 p){
  p.x /= ${POND.SX.toFixed(4)};
  return pondR(atan(p.y, p.x + 1e-6)) - length(p);
}
`;

export const NOISE_GLSL = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y);
}
float vnoise3(vec3 p){
  vec3 i = floor(p), f = fract(p); vec3 u = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash13(i), hash13(i+vec3(1,0,0)), u.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), u.x), u.y),
             mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), u.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), u.x), u.y), u.z);
}
float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<4;i++){ s += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; } return s / 0.9375; }
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for(int i=0;i<3;i++){ s += a*vnoise3(p); p = p*2.02 + 11.3; a *= 0.5; } return s / 0.875; }
vec3 voronoi(vec2 p){
  vec2 n = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0, id = 0.0;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec2 g = vec2(float(i), float(j)); vec2 o = hash22(n+g); vec2 r = g + o - f; float d = dot(r,r);
    if(d < d1){ d2 = d1; d1 = d; id = hash12(n+g+7.7); } else if(d < d2){ d2 = d; }
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
// Screen-space-derivative bump mapping from a procedural height (metres).
vec3 bumpNormal(vec3 surfPos, vec3 surfNorm, float h){
  vec3 dpdx = dFdx(surfPos), dpdy = dFdy(surfPos);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpdy, surfNorm), r2 = cross(surfNorm, dpdx);
  float det = dot(dpdx, r1);
  vec3 g = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * surfNorm - g);
}
`;

// Evening mist: a low, drifting veil added on top of three's fog for every patched material.
// It is evaluated on surfaces (no extra geometry), thickening with distance and thinning with height.
export const SHARED = { time: { value: 0 } };
const MIST_GLSL = /* glsl */`
{
  vec3 mv_ = vWPos - cameraPosition; float md_ = length(mv_);
  float mh_ = exp(-max(vWPos.y, 0.0) * 0.8) * smoothstep(-0.02, 0.06, vWPos.y);
  float mn_ = vnoise(vWPos.xz * 0.15 + vec2(uMistT * 0.045, uMistT * 0.028)) * 0.6 + vnoise(vWPos.xz * 0.43 - vec2(uMistT * 0.035, 0.0)) * 0.4;
  float ma_ = (1.0 - exp(-max(md_ - 8.0, 0.0) * 0.05)) * mh_ * (0.25 + 1.0 * mn_) * 0.44;
  float west_ = pow(max(dot(normalize(mv_.xz + vec2(1e-4)), normalize(vec2(-0.22, -1.0))), 0.0), 2.0);
  vec3 mc_ = mix(vec3(0.10, 0.105, 0.19), vec3(0.33, 0.185, 0.21), west_);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, mc_, clamp(ma_, 0.0, 0.8));
}
`;

// ---------------------------------------------------------------- material patching
// Adds world-space varyings + custom snippets to a MeshStandardMaterial while
// keeping three's lighting, shadows, fog and image-based lighting.
export function patchStandard(mat, o) {
  const { uniforms = {}, vertPars = '', vertMain = '', fragPars = '', fragColor = '', fragRough = '', fragNormal = '', fragEmissive = '', key } = o;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uMistT = SHARED.time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWNrm; varying vec3 vLPos;
${vertPars}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vLPos = position;
${vertMain}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 wp_ = vec4(transformed, 1.0);
  vec3 wn_ = objectNormal;
  #ifdef USE_INSTANCING
    wp_ = instanceMatrix * wp_;
    mat3 im_ = mat3(instanceMatrix);
    wn_ /= vec3(dot(im_[0], im_[0]), dot(im_[1], im_[1]), dot(im_[2], im_[2]));
    wn_ = im_ * wn_;
  #endif
  wp_ = modelMatrix * wp_;
  vWPos = wp_.xyz;
  vWNrm = normalize(mat3(modelMatrix) * wn_);
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWNrm; varying vec3 vLPos;
uniform float uMistT;
${NOISE_GLSL}
${fragPars}`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
${MIST_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
${fragColor}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
${fragRough}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
${fragNormal}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
${fragEmissive}`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

export const glslVec3 = (v) => `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;

// Tapered tube along a polyline (trunks, branches, stems, cords).
export function tubeInto(out, pts, radii, radial = 6) {
  const { pos, nrm, idx } = out;
  const base = pos.length / 3;
  const t = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3(), tmp = new THREE.Vector3();
  // initial frame
  t.subVectors(pts[1], pts[0]).normalize();
  n.set(1, 0, 0); if (Math.abs(t.x) > 0.9) n.set(0, 0, 1);
  n.sub(tmp.copy(t).multiplyScalar(n.dot(t))).normalize();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(i - 1, 0)], c = pts[Math.min(i + 1, pts.length - 1)];
    t.subVectors(c, a).normalize();
    n.sub(tmp.copy(t).multiplyScalar(n.dot(t))).normalize(); // parallel transport
    b.crossVectors(t, n);
    for (let j = 0; j < radial; j++) {
      const ang = (j / radial) * Math.PI * 2;
      const cx = Math.cos(ang), sx = Math.sin(ang);
      const nx = n.x * cx + b.x * sx, ny = n.y * cx + b.y * sx, nz = n.z * cx + b.z * sx;
      pos.push(pts[i].x + nx * radii[i], pts[i].y + ny * radii[i], pts[i].z + nz * radii[i]);
      nrm.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = base + i * radial + j, b2 = base + i * radial + (j + 1) % radial;
      const c = a + radial, d = b2 + radial;
      idx.push(a, b2, c, b2, d, c);
    }
  }
}
export function tubeGeometry(out) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(out.nrm, 3));
  g.setIndex(out.idx);
  return g;
}
