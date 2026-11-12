// Shared helpers: seeded random, JS noise, pond shape, GLSL chunks.

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ihash(x, y, z) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
const sm = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = sm(x - xi), fy = sm(y - yi), fz = sm(z - zi);
  const a = lerp(lerp(ihash(xi, yi, zi), ihash(xi + 1, yi, zi), fx), lerp(ihash(xi, yi + 1, zi), ihash(xi + 1, yi + 1, zi), fx), fy);
  const b = lerp(lerp(ihash(xi, yi, zi + 1), ihash(xi + 1, yi, zi + 1), fx), lerp(ihash(xi, yi + 1, zi + 1), ihash(xi + 1, yi + 1, zi + 1), fx), fy);
  return lerp(a, b, fz);
}
export function fbm3(x, y, z, oct = 4) {
  let a = 0.5, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x, y, z); n += a; x = x * 2.03 + 17.1; y = y * 2.03 + 3.7; z = z * 2.03 + 9.2; a *= 0.5; }
  return s / n;
}
export function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// ---- pond shape -------------------------------------------------------------
// floating lantern drift zones: [centre x, centre z, amplitude x, amplitude z]
export const FLOAT_SPOTS = [[-1.5, 0.9, 0.9, 0.7], [1.3, -0.8, 0.8, 0.6], [2.9, 1.2, 0.6, 0.6], [-0.4, -1.6, 0.7, 0.5]];
export const POND = { sx: 1.25, depth: 1.15, simCenter: [0.55, 0.2], simSize: 15.0 };

export function pondRadius(th) {
  return 5.0 * (1 + 0.12 * Math.sin(2 * th + 0.5) + 0.07 * Math.sin(3 * th + 2.0) + 0.04 * Math.sin(5 * th + 1.0));
}
// approximate signed distance to the shore (negative inside the pond)
export function pondSD(x, z) {
  const px = x / POND.sx;
  return Math.hypot(px, z) - pondRadius(Math.atan2(z, px));
}
// point on (or offset from) the shore at polar angle th
export function shorePoint(th, off = 0) {
  const r = pondRadius(th) + off;
  return [Math.cos(th) * r * POND.sx, Math.sin(th) * r];
}
export function terrainH(x, z) {
  const d = pondSD(x, z);
  if (d < 0) {
    return -POND.depth * (1 - Math.exp(d * 1.4)) + (noise3(x * 1.3, 0, z * 1.3) - 0.5) * 0.12 * smoothstep(0, -1.5, d);
  }
  const r = Math.hypot(x, z);
  const roll = (fbm3(x * 0.13, 5.0, z * 0.13, 3) - 0.47) * 1.5 * smoothstep(1.5, 9, d) * (1 - smoothstep(14.5, 19.5, r));
  return 0.2 * smoothstep(0, 1.0, d) + roll;
}

export const GLSL_POND = /* glsl */`
float pondSD(vec2 p){
  vec2 q = vec2(p.x/1.25, p.y);
  float th = atan(q.y, q.x);
  float R = 5.0*(1.0 + 0.12*sin(2.0*th+0.5) + 0.07*sin(3.0*th+2.0) + 0.04*sin(5.0*th+1.0));
  return length(q) - R;
}`;

export const GLSL_NOISE = /* glsl */`
float hash31(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float vnoise(vec3 p){
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x), mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x), mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x), f.y), f.z);
}
float fbm3(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+vec3(17.1,3.7,9.2); a*=0.5; } return s; }
`;

// ---- material helpers ---------------------------------------------------------
// Adds procedural colour mottling, a noise bump and a "wet near the waterline" look
// to a MeshStandardMaterial (world-space, so only for static, non-instanced meshes).
export function addDetail(mat, { scale = 6, strength = 0.5, bump = 0.5, wet = 1 } = {}) {
  const u = { uDScale: { value: scale }, uDStr: { value: strength }, uDBump: { value: bump }, uDWet: { value: wet } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vDPos;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vDPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vDPos;\nuniform float uDScale, uDStr, uDBump, uDWet;\n' + GLSL_NOISE + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 dp = vDPos * uDScale;
        float dn0 = vnoise(dp * 5.0);
        float dn = 0.6 * fbm3(dp) + 0.4 * dn0;
        diffuseColor.rgb *= (1.0 - uDStr) + uDStr * 2.0 * dn;
        float dWet = smoothstep(0.10, -0.02, vDPos.y) * uDWet;
        diffuseColor.rgb *= mix(1.0, 0.55, dWet);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.28, dWet);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float be = 0.02;
          vec3 bp = dp * 5.0;
          vec3 bg = vec3(vnoise(bp + vec3(be,0.,0.)) - dn0, vnoise(bp + vec3(0.,be,0.)) - dn0, vnoise(bp + vec3(0.,0.,be)) - dn0) / be;
          normal = normalize(normal - uDBump * 0.12 * (mat3(viewMatrix) * bg));
        }`);
  };
  return mat;
}

// Wind sway for instanced blades (local y = height along the blade, 0..1).
export function addSway(mat, uTime, amp = 0.1) {
  const uAmp = { value: amp };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime; sh.uniforms.uSwayAmp = uAmp;
    sh.vertexShader = 'uniform float uTime, uSwayAmp;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 swP = instanceMatrix[3].xyz;
      #else
        vec3 swP = vec3(0.0);
      #endif
      float sw = sin(uTime*1.1 + swP.x*0.6 + swP.z*0.8) + 0.5*sin(uTime*2.3 + swP.x*1.7 - swP.z*1.3);
      float swh = transformed.y * transformed.y;
      transformed.x += sw * uSwayAmp * swh;
      transformed.z += cos(uTime*0.9 + swP.x*0.9) * uSwayAmp * 0.5 * swh;`);
  };
  return mat;
}
