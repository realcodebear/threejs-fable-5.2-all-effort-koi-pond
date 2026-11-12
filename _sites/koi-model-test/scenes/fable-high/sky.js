// Dusk sky dome: gradient, afterglow, thin clouds, stars, crescent moon, distant hills.
import * as THREE from 'three';
import { GLSL_NOISE, uTime } from './common.js';

export const SUN_DIR = new THREE.Vector3(-0.42, -0.045, -1.0).normalize();   // just below the horizon
export const MOON_DIR = new THREE.Vector3(0.50, 0.16, -1.0).normalize();
export const FOG_COLOR = new THREE.Color(0.105, 0.085, 0.165);

const vert = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww;
}`;

const frag = /* glsl */`
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uFog;
varying vec3 vDir;
${GLSL_NOISE}
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  vec2 dh = normalize(d.xz + vec2(1e-5));
  float az = dot(dh, normalize(uSunDir.xz));
  float warm = smoothstep(-0.55, 1.0, az); warm = warm * warm;
  float h = clamp(y, 0.0, 1.0);

  vec3 zen = vec3(0.020, 0.034, 0.105);
  vec3 upper = vec3(0.085, 0.085, 0.25);
  vec3 mid = mix(vec3(0.20, 0.15, 0.33), vec3(0.72, 0.25, 0.33), warm);
  vec3 hor = mix(vec3(0.36, 0.25, 0.40), vec3(2.1, 0.86, 0.26), warm);
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.15 + 0.05*warm, h));
  c = mix(c, upper, smoothstep(0.10, 0.42, h));
  c = mix(c, zen, smoothstep(0.35, 0.95, h));

  float sd = max(dot(d, uSunDir), 0.0);
  c += vec3(1.5, 0.50, 0.14) * pow(sd, 10.0) * 0.55;
  c += vec3(2.0, 1.0, 0.45) * pow(sd, 80.0) * 0.7;

  // stars
  vec3 sp = d * 240.0; vec3 ip = floor(sp); vec3 fp = fract(sp) - 0.5;
  float hs = hash13(ip);
  float star = step(0.9968, hs) * (1.0 - smoothstep(0.05, 0.40, length(fp)));
  float tw = 0.65 + 0.35 * sin(uTime * (1.5 + fract(hs * 91.7) * 3.0) + hs * 640.0);
  c += vec3(0.85, 0.92, 1.2) * star * tw * smoothstep(0.12, 0.55, y) * (1.0 - warm * 0.7) * (0.6 + 2.2 * fract(hs * 517.3));

  // crescent moon
  vec3 mu = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
  vec3 mv = cross(mu, uMoonDir);
  float mfront = step(0.0, dot(d, uMoonDir));
  vec2 mp = vec2(dot(d, mu), dot(d, mv)) / 0.026;
  vec2 sdir = normalize(vec2(dot(uSunDir, mu), dot(uSunDir, mv)));
  float disc = 1.0 - smoothstep(0.93, 1.0, length(mp));
  float shade = 1.0 - smoothstep(0.90, 1.02, length(mp + sdir * 0.52));
  float cres = disc * (1.0 - shade) * mfront;
  c += vec3(0.10, 0.12, 0.2) * disc * mfront;
  c += vec3(3.4, 3.1, 2.5) * cres;
  c += vec3(0.42, 0.42, 0.62) * exp(-length(mp) * 0.55) * 0.22 * mfront;

  // thin streaky clouds
  vec2 cuv = d.xz / (max(y, 0.0) + 0.14);
  float cl = fbm2(cuv * vec2(0.55, 1.9) + vec2(uTime * 0.003, 4.0));
  cl = smoothstep(0.50, 0.80, cl) * smoothstep(0.015, 0.10, y) * (1.0 - smoothstep(0.45, 0.85, y));
  vec3 cloudCol = mix(vec3(0.17, 0.12, 0.25), vec3(1.7, 0.52, 0.30), warm * (1.0 - smoothstep(0.03, 0.42, y)));
  c = mix(c, cloudCol, cl * 0.8);

  // distant hills
  float r1 = 0.030 + 0.085 * fbm2(dh * 2.3 + 10.0);
  float r2 = 0.004 + 0.060 * fbm2(dh * 4.7 + 31.0);
  vec3 hillFar = mix(hor * 0.38, vec3(0.13, 0.11, 0.24), 0.62);
  vec3 hillNear = mix(uFog, vec3(0.045, 0.045, 0.09), 0.55);
  c = mix(c, hillFar, 1.0 - smoothstep(r1 - 0.003, r1 + 0.003, y));
  c = mix(c, hillNear, 1.0 - smoothstep(r2 - 0.003, r2 + 0.003, y));
  c = mix(c, uFog, 1.0 - smoothstep(-0.01, 0.012, y));

  gl_FragColor = vec4(c, 1.0);
}`;

export function createSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime,
      uSunDir: { value: SUN_DIR },
      uMoonDir: { value: MOON_DIR },
      uFog: { value: FOG_COLOR },
    },
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return mesh;
}
