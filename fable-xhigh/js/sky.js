// Dusk sky dome (gradient, lit clouds, stars, crescent moon) and distant silhouette layers.
import * as THREE from 'three';
import { NOISE_GLSL, glslVec3 } from './common.js';

export const SUN_DIR = new THREE.Vector3(-0.22, -0.09, -1.0).normalize();   // just below the western horizon
export const MOON_DIR = new THREE.Vector3(-0.12, 0.345, -1.0).normalize();
export const GLOW_DIR = new THREE.Vector3(-0.38, 0.40, -1.0).normalize();   // direction of the after-glow key light

export const SKY_GLSL = /* glsl */`
const vec3 SUN_DIR = ${glslVec3(SUN_DIR)};
const vec3 MOON_DIR = ${glslVec3(MOON_DIR)};
vec3 skyRamp(float y, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4){
  vec3 c = mix(c0, c1, smoothstep(0.0, 0.10, y));
  c = mix(c, c2, smoothstep(0.07, 0.27, y));
  c = mix(c, c3, smoothstep(0.22, 0.56, y));
  c = mix(c, c4, smoothstep(0.50, 1.0, y));
  return c;
}
vec3 skyGradient(vec3 d){
  float y = max(d.y, 0.0);
  vec2 dh = normalize(d.xz + vec2(1e-5));
  float az = dot(dh, normalize(SUN_DIR.xz)) * 0.5 + 0.5;
  float w = pow(az, 1.5);
  vec3 west = skyRamp(y, vec3(1.35, 0.52, 0.15), vec3(0.95, 0.30, 0.17), vec3(0.38, 0.145, 0.30), vec3(0.105, 0.085, 0.28), vec3(0.014, 0.022, 0.075));
  vec3 east = skyRamp(y, vec3(0.085, 0.08, 0.17), vec3(0.14, 0.10, 0.20), vec3(0.055, 0.065, 0.16), vec3(0.028, 0.038, 0.11), vec3(0.014, 0.022, 0.075));
  vec3 col = mix(east, west, w);
  float sd = max(dot(normalize(vec3(d.x, y * 1.8, d.z)), normalize(vec3(SUN_DIR.x, 0.0, SUN_DIR.z))), 0.0);
  col += vec3(1.3, 0.55, 0.14) * pow(sd, 20.0) * 0.6;
  return col;
}
`;

const skyFrag = /* glsl */`
uniform float uTime;
uniform float uEnv;
varying vec3 vDir;
${NOISE_GLSL}
${SKY_GLSL}

float cloudField(vec3 d, float t){
  vec2 uv = d.xz / (d.y + 0.11);
  uv *= vec2(0.50, 1.35);
  float n = fbm(uv * 0.85 + vec2(t * 0.005, 0.0));
  n += 0.38 * fbm(uv * 2.6 + vec2(-t * 0.004, 3.7));
  return n;
}
vec3 starField(vec3 d, float t){
  vec3 p = d * 210.0; vec3 ip = floor(p); vec3 fp = fract(p) - 0.5;
  float h = hash13(ip);
  float on = step(0.9962, h);
  vec3 jit = vec3(hash13(ip + 1.3), hash13(ip + 2.7), hash13(ip + 4.1)) - 0.5;
  float core = smoothstep(0.24, 0.0, length(fp - jit * 0.5));
  float tw = 0.6 + 0.4 * sin(t * (1.2 + 4.0 * hash13(ip + 5.0)) + h * 400.0);
  vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.86, 0.68), hash13(ip + 9.0));
  return tint * core * on * tw * (0.5 + 2.0 * hash13(ip + 7.0));
}
vec3 moonLight(vec3 d){
  float facing = dot(d, MOON_DIR);
  if (facing < 0.95) return vec3(0.0);
  float r = 0.021;
  vec3 right = normalize(cross(MOON_DIR, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, MOON_DIR);
  vec2 q = vec2(dot(d, right), dot(d, up)) / r;
  float rr = dot(q, q);
  float disc = smoothstep(1.0, 0.90, sqrt(rr));
  vec3 n = vec3(q, sqrt(max(1.0 - rr, 0.0)));
  vec3 L = normalize(vec3(-0.80, -0.62, -0.42));
  float lit = smoothstep(0.0, 0.22, dot(n, L));
  vec3 c = disc * (lit * vec3(15.0, 13.0, 10.5) + vec3(0.05, 0.06, 0.09));
  float ang = acos(clamp(facing, -1.0, 1.0));
  c += vec3(0.55, 0.45, 0.42) * exp(-ang * 26.0) * 0.45;
  return c;
}

void main(){
  vec3 d = normalize(vDir);
  vec3 col = skyGradient(d);
  float y = max(d.y, 0.0);
  vec2 dh = normalize(d.xz + vec2(1e-5));
  float az = dot(dh, normalize(SUN_DIR.xz)) * 0.5 + 0.5;

  if (uEnv < 0.5) {
    col += starField(d, uTime) * smoothstep(0.06, 0.45, y) * (1.0 - 0.85 * pow(az, 2.0) * (1.0 - smoothstep(0.3, 0.9, y)));
    col += moonLight(d);
  }

  // high streaky clouds, lit from below by the after-glow
  float n = cloudField(d, uTime);
  float dens = smoothstep(0.50, 0.92, n);
  float thick = smoothstep(0.62, 1.05, n);
  float lowSun = exp(-y * 2.6);
  vec3 lit = mix(vec3(0.95, 0.30, 0.26), vec3(1.9, 0.72, 0.30), lowSun * lowSun) * pow(az, 1.3) * (0.35 + 0.65 * lowSun);
  vec3 shade = mix(vec3(0.035, 0.04, 0.085), vec3(0.11, 0.07, 0.15), pow(az, 1.5));
  vec3 cc = mix(lit, shade, thick * 0.75) + shade * 0.5;
  float cover = dens * smoothstep(0.015, 0.10, d.y) * (1.0 - 0.55 * smoothstep(0.45, 0.95, y));
  col = mix(col, cc, cover * 0.85);

  if (uEnv > 0.5) {
    // ground bounce for the environment map
    col = mix(vec3(0.016, 0.02, 0.014), col, smoothstep(-0.12, 0.02, d.y));
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

const skyVert = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
  gl_Position = p.xyww;
}
`;

export function makeSkyMesh(uTime, env) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uEnv: { value: env ? 1 : 0 } },
    vertexShader: skyVert, fragmentShader: skyFrag,
    side: THREE.BackSide, depthWrite: false, depthTest: true,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return mesh;
}

// ---------------------------------------------------------------- silhouettes
const layerVert = /* glsl */`
varying vec2 vUv; varying vec3 vW;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const layerFrag = /* glsl */`
uniform vec3 uTint; uniform float uHaze; uniform float uSeed; uniform float uKind; uniform float uCells;
varying vec2 vUv; varying vec3 vW;
${NOISE_GLSL}
${SKY_GLSL}
float ridge(float a){
  vec2 c = vec2(cos(a), sin(a));
  float h = fbm(c * 1.5 + uSeed) * 0.8 + fbm(c * 5.0 + uSeed * 1.7) * 0.2;
  return smoothstep(0.15, 0.85, h);
}
float trees(float u){
  // rounded crowns of varying height plus the odd conifer spike
  float x = u * uCells;
  float h = 0.0;
  for (int k = -1; k <= 1; k++) {
    float i = floor(x) + float(k);
    float id = mod(i, uCells);
    float r1 = hash12(vec2(id, uSeed)), r2 = hash12(vec2(id, uSeed + 3.1)), r3 = hash12(vec2(id, uSeed + 7.7));
    float cx = i + 0.5 + (r1 - 0.5) * 0.7;
    float dx = (x - cx);
    float wdt = 0.55 + r2 * 0.6;
    float hh = 0.35 + r3 * 0.6;
    float crown = hh * sqrt(max(1.0 - (dx * dx) / (wdt * wdt), 0.0));
    if (r2 > 0.78) crown = max(crown, (hh + 0.2) * pow(max(1.0 - abs(dx) / (0.42 + 0.1 * r1), 0.0), 0.8));
    h = max(h, crown);
  }
  h += (vnoise(vec2(x * 9.0, uSeed)) - 0.5) * 0.07;
  return h;
}
void main(){
  float a = vUv.x * 6.2831853;
  float h;
  if (uKind < 0.5) h = 0.22 + 0.78 * ridge(a);
  else h = 0.30 + 0.70 * trees(vUv.x) * (0.6 + 0.4 * ridge(a + 2.0));
  float aa = fwidth(vUv.y) * 1.5 + 0.002;
  float alpha = smoothstep(h + aa, h - aa, vUv.y);
  vec3 dir = normalize(vW - cameraPosition);
  vec3 haze = skyGradient(normalize(vec3(dir.x, 0.02, dir.z)));
  vec3 col = mix(uTint, haze, uHaze * (1.0 - 0.45 * vUv.y / max(h, 0.05)));
  gl_FragColor = vec4(col, alpha);
}
`;

export function createBackdrop(ctx) {
  const group = new THREE.Group();
  const layers = [
    // radius, bottom, height, tint, haze, seed, kind, cells
    [620, -10, 78, new THREE.Color(0.11, 0.075, 0.20), 0.62, 1.3, 0, 1],
    [330, -8, 34, new THREE.Color(0.050, 0.042, 0.105), 0.42, 5.1, 0, 1],
    [150, -5, 13, new THREE.Color(0.014, 0.020, 0.034), 0.16, 9.4, 1, 150],
  ];
  layers.forEach((L, i) => {
    const [r, y0, h, tint, haze, seed, kind, cells] = L;
    const geo = new THREE.CylinderGeometry(r, r, h, 128, 1, true);
    geo.translate(0, y0 + h / 2, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTint: { value: tint }, uHaze: { value: haze }, uSeed: { value: seed }, uKind: { value: kind }, uCells: { value: cells } },
      vertexShader: layerVert, fragmentShader: layerFrag,
      transparent: true, depthWrite: false, side: THREE.BackSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = -90 + i;
    m.frustumCulled = false;
    group.add(m);
  });
  ctx.scene.add(group);
  ctx.tag(group, { refr: false });
  return group;
}
