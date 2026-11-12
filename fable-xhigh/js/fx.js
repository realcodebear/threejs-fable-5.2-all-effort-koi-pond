// Fireflies and the final tone-mapping / grading pass.
import * as THREE from 'three';
import { mulberry32, pondD, lerp, NOISE_GLSL } from './common.js';

export function createFireflies(ctx) {
  const rng = mulberry32(99);
  const N = 90;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    let x, z;
    do {
      const a = rng() * Math.PI * 2, r = lerp(1.0, 10.5, Math.pow(rng(), 0.8));
      x = Math.cos(a) * r * 1.15; z = Math.sin(a) * r;
    } while (pondD(x, z) > 0.6 && rng() < 0.75);
    pos[i * 3] = x; pos[i * 3 + 1] = lerp(0.35, 2.3, Math.pow(rng(), 1.4)); pos[i * 3 + 2] = z;
    seed[i * 4] = rng(); seed[i * 4 + 1] = rng(); seed[i * 4 + 2] = rng(); seed[i * 4 + 3] = rng();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: ctx.uTime, uScale: ctx.uPointScale },
    vertexShader: /* glsl */`
      attribute vec4 aSeed; uniform float uTime, uScale; varying float vBlink;
      void main(){
        vec3 p = position; float t = uTime;
        p.x += sin(t * 0.21 * (0.6 + aSeed.x) + aSeed.y * 6.28) * 0.9 + sin(t * 0.67 + aSeed.z * 6.28) * 0.22;
        p.y += sin(t * 0.33 * (0.6 + aSeed.y) + aSeed.z * 6.28) * 0.35 + sin(t * 0.9 + aSeed.x * 6.28) * 0.08;
        p.z += cos(t * 0.19 * (0.6 + aSeed.z) + aSeed.x * 6.28) * 0.9 + sin(t * 0.59 + aSeed.w * 6.28) * 0.22;
        p.y = max(p.y, 0.14);
        float b = sin(t * (0.8 + aSeed.w * 1.3) + aSeed.x * 40.0);
        vBlink = smoothstep(0.1, 0.95, b);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(uScale * (0.10 + 0.05 * aSeed.y) / max(-mv.z, 0.2), 2.0);
      }`,
    fragmentShader: /* glsl */`
      varying float vBlink;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float core = exp(-d * d * 60.0), halo = exp(-d * 5.0) * 0.16 * (1.0 - smoothstep(0.8, 1.0, d));
        gl_FragColor = vec4(vec3(0.62, 1.0, 0.22) * (core * 7.0 + halo * 1.6) * vBlink, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  ctx.scene.add(pts);
  ctx.tag(pts, { refr: false });
  return pts;
}

// Final pass: vignette, ACES filmic tone curve, sRGB encode, a breath of grain.
export const FinalShader = {
  uniforms: { tDiffuse: { value: null }, uExposure: { value: 1.0 }, uTime: { value: 0 }, uFade: { value: 0 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uExposure, uTime, uFade; varying vec2 vUv;
    ${NOISE_GLSL}
    vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 color){
      const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      color = inM * (color * uExposure / 0.6);
      color = RRTAndODTFit(color);
      return clamp(outM * color, 0.0, 1.0);
    }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec2 q = (vUv - 0.5) * vec2(1.0, 0.82);
      c *= mix(1.0, 0.42, smoothstep(0.30, 0.86, length(q)));
      c = aces(max(c, 0.0) * uFade);
      // cool the shadows a touch, keep the highlights warm
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(c * vec3(0.94, 0.99, 1.08), c * vec3(1.03, 1.0, 0.96), smoothstep(0.05, 0.6, l));
      c = mix(vec3(l), c, 1.06);
      c = mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      float n = hash12(gl_FragCoord.xy + fract(uTime * 7.13) * 311.0) - 0.5;
      c += n * (2.2 / 255.0);
      gl_FragColor = vec4(c, 1.0);
    }`,
};
