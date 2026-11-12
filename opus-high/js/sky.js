// Dusk sky dome: gradient, afterglow, clouds, stars and moon.
import * as THREE from 'three';
import { GLSL_NOISE, globals } from './util.js';

export const SUN_DIR = new THREE.Vector3(0.74, -0.05, -0.68).normalize();
export const MOON_DIR = new THREE.Vector3(-0.62, 0.62, 0.2).normalize();

export function createSky(envOnly = false) {
  const geo = new THREE.SphereGeometry(450, 64, 32);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: globals.uTime,
      uSunDir: { value: SUN_DIR },
      uMoonDir: { value: MOON_DIR },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uSunDir; uniform vec3 uMoonDir;
      varying vec3 vDir;
      ${GLSL_NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        float h = max(y, 0.0);
        vec3 sunH = normalize(vec3(uSunDir.x, 0.0, uSunDir.z));
        float sunF = 0.5 + 0.5 * dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), sunH);
        vec3 zenith = vec3(0.010, 0.016, 0.055);
        vec3 midSky = vec3(0.035, 0.05, 0.15);
        vec3 horizonAway = vec3(0.13, 0.10, 0.24);
        vec3 horizonSun = vec3(0.85, 0.26, 0.09);
        vec3 horizon = mix(horizonAway, horizonSun, pow(sunF, 4.0));
        vec3 col = mix(horizon, midSky, smoothstep(0.0, 0.32, h));
        col = mix(col, zenith, smoothstep(0.25, 0.95, h));
        // magenta band above the glow
        col += vec3(0.35, 0.08, 0.22) * exp(-abs(h - 0.12) * 14.0) * pow(sunF, 2.0) * 0.6;
        // sun glow
        float sd = max(dot(d, uSunDir), 0.0);
        col += vec3(1.0, 0.38, 0.1) * pow(sd, 10.0) * 0.8;
        col += vec3(1.0, 0.55, 0.25) * pow(sd, 60.0) * 0.8;

        #ifndef ENV_ONLY
        // clouds: thin streaks on a plane
        if (y > 0.0) {
          vec2 cp = d.xz / (y + 0.08);
          vec3 q = vec3(cp.x * 0.45, cp.y * 1.4, uTime * 0.004);
          q.xy += vec2(uTime * 0.006, 0.0);
          float c = fbm3(q * 0.9) + 0.5 * fbm3(q * 2.7 + 3.0);
          float cov = smoothstep(0.1, 0.65, c) * smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.35, 0.8, y));
          vec3 lit = mix(vec3(0.10, 0.08, 0.17), vec3(1.3, 0.48, 0.32), pow(sunF, 3.0));
          lit = mix(lit, vec3(0.9, 0.4, 0.55) * 0.6, pow(sunF, 1.5) * (1.0 - pow(sunF, 3.0)) * 0.7);
          lit *= 0.7 + 0.5 * smoothstep(0.2, 0.9, c);
          col = mix(col, lit, cov * 0.85);
        }

        // stars
        float starMask = smoothstep(0.12, 0.6, h) * (1.0 - pow(sunF, 2.0) * 0.8);
        vec3 sp = d * 160.0;
        vec3 cell = floor(sp);
        float rnd = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        if (rnd > 0.985) {
          vec3 center = cell + 0.5 + (vec3(fract(rnd * 17.0), fract(rnd * 31.0), fract(rnd * 47.0)) - 0.5) * 0.6;
          float sdist = length(sp - center);
          float tw = 0.6 + 0.4 * sin(uTime * (1.5 + rnd * 3.0) + rnd * 100.0);
          col += vec3(0.85, 0.9, 1.0) * smoothstep(0.22, 0.0, sdist) * starMask * tw * (rnd - 0.985) * 120.0;
        }

        // moon
        float md = dot(d, uMoonDir);
        float disk = smoothstep(0.99984, 0.99989, md);
        vec3 mn = d - uMoonDir * md;
        float mott = snoise(mn * 1500.0) * 0.5 + snoise(mn * 3600.0) * 0.25;
        col = mix(col, vec3(1.5, 1.45, 1.3) * (0.85 + 0.15 * mott), disk);
        col += vec3(0.5, 0.55, 0.7) * pow(max(md, 0.0), 2500.0) * 0.4;
        col += vec3(0.25, 0.28, 0.4) * pow(max(md, 0.0), 60.0) * 0.12;
        #endif

        // below horizon (rarely visible)
        if (y < 0.0) col = mix(horizon * 0.5, vec3(0.015, 0.02, 0.03), smoothstep(0.0, 0.12, -y));
        col = clamp(col, 0.0, 30.0);
        if (!(col.r == col.r && col.g == col.g && col.b == col.b)) col = vec3(0.0);
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  if (envOnly) mat.defines = { ENV_ONLY: '' };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  // drawn after all other opaque objects at depth = 1, so only uncovered pixels pay for it
  mesh.renderOrder = 1000;
  mesh.name = 'sky';
  return mesh;
}
