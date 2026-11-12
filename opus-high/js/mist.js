// Thin layers of drifting mist hovering just above the water.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLSL_NOISE, globals } from './util.js';

export function createMist() {
  const layers = [];
  const heights = [0.1, 0.32];
  heights.forEach((h, i) => {
    const g = new THREE.PlaneGeometry(13, 13, 1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(0, h, 0);
    const n = g.attributes.position.count;
    g.setAttribute('aLayer', new THREE.Float32BufferAttribute(new Array(n).fill(i), 1));
    layers.push(g);
  });
  const geo = mergeGeometries(layers);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: globals.uTime },
    vertexShader: /* glsl */`
      attribute float aLayer;
      varying vec3 vW; varying float vL;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz; vL = aLayer;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      varying vec3 vW; varying float vL;
      ${GLSL_NOISE}
      void main(){
        vec2 p = vW.xz * (0.35 + vL * 0.1) + vec2(uTime * 0.02 * (1.0 + vL), uTime * 0.012);
        float r = length(vW.xz);
        float fade = 1.0 - smoothstep(3.5, 6.2, r);
        if (fade <= 0.0) discard;
        vec3 q = vec3(p, uTime * 0.015 + vL * 3.0);
        float n = snoise(q) * 0.65 + snoise(q * 2.1 + 4.0) * 0.35;
        float a = smoothstep(-0.1, 0.7, n) * fade;
        a *= 0.1 * (1.0 - vL * 0.3);
        gl_FragColor = vec4(vec3(0.42, 0.44, 0.6) * 0.55, a);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 5;
  mesh.name = 'mist';
  return { mesh, update() {} };
}
