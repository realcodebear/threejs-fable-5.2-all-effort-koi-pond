// Water: GPU ripple simulation (height field) + surface shader that blends a planar
// reflection with a depth-tinted, distorted view of what is under the surface.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { POND, GLSL_POND, GLSL_NOISE } from './common.js';

const SIM = 512;
const MAX_DROPS = 16;

const fsVert = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const simFrag = /* glsl */`
precision highp float;
uniform sampler2D tPrev;
uniform vec2 uCenter; uniform float uSize;
uniform vec4 uDrops[${MAX_DROPS}];
varying vec2 vUv;
${GLSL_POND}
void main(){
  float e = 1.0/${SIM}.0;
  vec4 c = texture2D(tPrev, vUv);
  float h = c.r, v = c.g;
  float avg = 0.25*(texture2D(tPrev, vUv+vec2(e,0.)).r + texture2D(tPrev, vUv-vec2(e,0.)).r
                  + texture2D(tPrev, vUv+vec2(0.,e)).r + texture2D(tPrev, vUv-vec2(0.,e)).r);
  v += (avg - h) * 1.85;
  v *= 0.9935;
  h += v;
  h *= 0.9985;
  vec2 w = (vUv - 0.5) * uSize + uCenter;
  for(int i=0;i<${MAX_DROPS};i++){
    vec4 d = uDrops[i];
    vec2 q = w - d.xy;
    h += d.w * exp(-dot(q,q)/(d.z*d.z));
  }
  float m = smoothstep(0.45, 0.15, pondSD(w));
  gl_FragColor = vec4(h*m, v*m, 0.0, 1.0);
}`;

const waterVert = /* glsl */`
varying vec3 vWorld; varying float vViewZ;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const waterFrag = /* glsl */`
precision highp float;
uniform sampler2D tRefl, tRefr, tDepth, tSim;
uniform vec2 uRes, uSimCenter;
uniform float uSimSize, uTime, uNear, uFar;
uniform mat4 uVP;
uniform vec3 uDeep, uAbsorb, uScatter;
varying vec3 vWorld; varying float vViewZ;
${GLSL_NOISE}
float linZ(float d){ float ndc = d*2.0-1.0; return 2.0*uNear*uFar/((uFar+uNear) - ndc*(uFar-uNear)); }
float detail(vec2 p){
  return vnoise(vec3(p*1.3 + vec2(uTime*0.10, uTime*0.06), uTime*0.12))
       + 0.5*vnoise(vec3(p*3.1 - vec2(uTime*0.08, -uTime*0.13), uTime*0.2 + 5.0));
}
void main(){
  vec2 suv = gl_FragCoord.xy / uRes;
  vec2 sim = (vWorld.xz - uSimCenter)/uSimSize + 0.5;
  float e = 1.0/${SIM}.0;
  float hl = texture2D(tSim, sim - vec2(e,0.)).r, hr = texture2D(tSim, sim + vec2(e,0.)).r;
  float hd = texture2D(tSim, sim - vec2(0.,e)).r, hu = texture2D(tSim, sim + vec2(0.,e)).r;
  vec2 grad = vec2(hr-hl, hu-hd) / (2.0*e*uSimSize);

  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float de = 0.06; float d0 = detail(vWorld.xz);
  vec2 dg = vec2(detail(vWorld.xz + vec2(de,0.)) - d0, detail(vWorld.xz + vec2(0.,de)) - d0) / de;
  grad += dg * 0.011 / (1.0 + dist*0.05);
  grad = clamp(grad, -0.6, 0.6);
  vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));

  // --- under the surface
  float z0 = linZ(texture2D(tDepth, suv).x);
  float th0 = max(z0 - vViewZ, 0.0);
  vec2 ruv = suv + grad * 0.55 * min(th0*1.5, 1.0) / max(vViewZ*0.35, 1.0);
  float z1 = linZ(texture2D(tDepth, ruv).x);
  if (z1 < vViewZ + 0.01) { ruv = suv; z1 = z0; }
  float th = max(z1 - vViewZ, 0.0) * dist / vViewZ;
  vec3 refr = texture2D(tRefr, ruv).rgb;
  vec3 tr = exp(-th * uAbsorb);
  vec3 under = refr * tr + uDeep * (1.0 - tr);

  // --- reflection (ray-marched one step onto the mirrored view)
  vec3 R = reflect(-V, N); R.y = abs(R.y) + 0.02; R = normalize(R);
  vec3 Q = vWorld + R * 5.0; Q.y = -Q.y;
  vec4 c = uVP * vec4(Q, 1.0);
  vec2 quv = c.xy / max(c.w, 1e-3) * 0.5 + 0.5; quv.y = 1.0 - quv.y;
  quv = clamp(quv, vec2(0.002), vec2(0.998));
  vec3 refl = texture2D(tRefl, quv).rgb;

  float ndv = max(dot(N, V), 0.0);
  float fres = 0.035 + 0.965 * pow(1.0 - ndv, 4.2);
  vec3 col = mix(under, refl, clamp(fres * 1.25, 0.0, 1.0));
  // faint sheen on ripple crests
  col += uScatter * max(grad.x*V.x + grad.y*V.z, 0.0) * 0.6;

  float edge = smoothstep(0.0, 0.05, th0);
  col = mix(texture2D(tRefr, suv).rgb, col, edge);
  gl_FragColor = vec4(clamp(col, 0.0, 60.0), 1.0);
}`;

export function createWater(renderer) {
  const rtOpts = {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: false, stencilBuffer: false,
  };
  let simA = new THREE.WebGLRenderTarget(SIM, SIM, rtOpts);
  let simB = new THREE.WebGLRenderTarget(SIM, SIM, rtOpts);
  const drops = Array.from({ length: MAX_DROPS }, () => new THREE.Vector4(0, 0, 1, 0));
  const simMat = new THREE.ShaderMaterial({
    uniforms: {
      tPrev: { value: null },
      uCenter: { value: new THREE.Vector2(...POND.simCenter) },
      uSize: { value: POND.simSize },
      uDrops: { value: drops },
    },
    vertexShader: fsVert, fragmentShader: simFrag, depthTest: false, depthWrite: false,
  });
  const fsq = new FullScreenQuad(simMat);

  const uniforms = {
    tRefl: { value: null }, tRefr: { value: null }, tDepth: { value: null }, tSim: { value: simA.texture },
    uRes: { value: new THREE.Vector2(1, 1) },
    uSimCenter: { value: new THREE.Vector2(...POND.simCenter) }, uSimSize: { value: POND.simSize },
    uTime: { value: 0 }, uNear: { value: 0.5 }, uFar: { value: 900 },
    uVP: { value: new THREE.Matrix4() },
    uDeep: { value: new THREE.Color().setRGB(0.012, 0.035, 0.04) },
    uAbsorb: { value: new THREE.Vector3(0.75, 0.42, 0.5) },
    uScatter: { value: new THREE.Color().setRGB(0.5, 0.35, 0.45) },
  };
  const geo = new THREE.PlaneGeometry(17, 13).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms, vertexShader: waterVert, fragmentShader: waterFrag }));
  mesh.position.set(0.6, 0, 0.25);
  mesh.frustumCulled = false;

  let acc = 0;
  const pending = [];
  function addDrop(x, z, radius, strength) { if (pending.length < 64) pending.push([x, z, radius, strength]); }

  function step(dt) {
    acc = Math.min(acc + dt, 3 / 60);
    const prevRT = renderer.getRenderTarget();
    while (acc >= 1 / 60) {
      acc -= 1 / 60;
      for (let i = 0; i < MAX_DROPS; i++) {
        const d = pending.shift();
        if (d) drops[i].set(d[0], d[1], d[2], d[3]); else drops[i].set(0, 0, 1, 0);
      }
      simMat.uniforms.tPrev.value = simA.texture;
      renderer.setRenderTarget(simB);
      fsq.render(renderer);
      const t = simA; simA = simB; simB = t;
    }
    pending.length = Math.min(pending.length, MAX_DROPS);
    renderer.setRenderTarget(prevRT);
    uniforms.tSim.value = simA.texture;
  }

  return { mesh, uniforms, addDrop, step };
}
