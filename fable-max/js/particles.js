// Fireflies drifting over the banks and the water, each pulsing slowly.
import * as THREE from 'three';
import { makeRng, sdf, groundHeight, uTime } from './common.js';

export const uPointScale = { value: 1000 };     // pixels per metre at distance 1 for the pass being drawn

export function createFireflies(count = 80) {
  const rng = makeRng(60606);
  const pos = new Float32Array(count * 3), seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    let x = 0, z = 0;
    for (let k = 0; k < 50; k++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(1.5, 8.2);
      x = Math.cos(a) * r; z = -0.4 + Math.sin(a) * r;
      const d = sdf(x, z);
      if (d < 1.2) break;                         // mostly over the banks and the edge of the water
    }
    const overWater = sdf(x, z) > 0;
    const y = (overWater ? 0 : groundHeight(x, z)) + rng.range(0.25, overWater ? 0.9 : 1.9);
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    seed[i * 4] = rng.range(0, 6.28); seed[i * 4 + 1] = rng.range(0.25, 0.6); seed[i * 4 + 2] = rng.range(0.25, 0.8); seed[i * 4 + 3] = rng.range(0, 6.28);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    name: 'Fireflies',
    uniforms: { uTime, uPointScale },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */`
      attribute vec4 aSeed;
      uniform float uTime, uPointScale;
      varying float vGlow;
      void main() {
        float t = uTime * aSeed.y;
        vec3 p = position;
        // a lazy looping wander
        p.x += sin(t + aSeed.x) * aSeed.z + sin(t * 2.3 + aSeed.w) * 0.12;
        p.y += sin(t * 0.8 + aSeed.w) * aSeed.z * 0.35 + sin(t * 3.1 + aSeed.x) * 0.05;
        p.z += cos(t * 0.9 + aSeed.x * 1.3) * aSeed.z + cos(t * 2.1 + aSeed.w) * 0.12;
        p.y = max(p.y, 0.12);
        // slow glow and fade, each insect in its own rhythm
        float b = sin(uTime * (0.55 + aSeed.y * 0.5) + aSeed.w * 3.0);
        vGlow = smoothstep(-0.15, 0.85, b);
        vGlow *= vGlow;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = max(-mv.z, 0.1);
        vGlow *= smoothstep(0.7, 1.8, d);                    // never a huge blob right in front of the lens
        gl_PointSize = clamp(0.065 * uPointScale / d * (0.6 + 0.4 * vGlow), 1.5, 0.03 * uPointScale);
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      varying float vGlow;
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(q, q);
        if (r2 > 1.0) discard;
        float core = exp(-r2 * 9.0);
        float halo = exp(-r2 * 2.5) * 0.25;
        vec3 col = mix(vec3(0.55, 1.0, 0.18), vec3(0.95, 1.0, 0.55), core);
        gl_FragColor = vec4(col * (core * 5.0 + halo) * vGlow, 1.0);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 20;
  points.name = 'fireflies';
  return points;
}
