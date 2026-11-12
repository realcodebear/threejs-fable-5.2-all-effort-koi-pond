// Water surface: planar reflection + screen-space refraction with depth-based absorption,
// procedural small waves, expanding ripple rings and lantern glints.
import * as THREE from 'three';
import { GLSL_NOISE, globals } from './util.js';

export const MAX_RIPPLES = 20;
export const MAX_WLIGHTS = 8;

export class Ripples {
  constructor() {
    this.data = [];
    for (let i = 0; i < MAX_RIPPLES; i++) this.data.push(new THREE.Vector4(0, 0, -100, 0));
    this.next = 0;
  }
  add(x, z, t, amp) {
    this.data[this.next].set(x, z, t, amp);
    this.next = (this.next + 1) % MAX_RIPPLES;
  }
}

export function createWater(ripples) {
  const geo = new THREE.CircleGeometry(7.5, 96);
  geo.rotateX(-Math.PI / 2);
  const lpos = [], lcol = [];
  for (let i = 0; i < MAX_WLIGHTS; i++) { lpos.push(new THREE.Vector3(0, -100, 0)); lcol.push(new THREE.Vector3()); }
  const uniforms = {
    uTime: globals.uTime,
    tRefl: { value: null },
    tRefr: { value: null },
    tDepth: { value: null },
    uTexMatrix: { value: new THREE.Matrix4() },
    uScreen: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.1 },
    uFar: { value: 1000 },
    uRipples: { value: ripples.data },
    uLPos: { value: lpos },
    uLCol: { value: lcol },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uMode: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      uniform mat4 uTexMatrix;
      varying vec4 vReflCoord;
      varying vec3 vWorld;
      varying float vViewZ;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vReflCoord = uTexMatrix * wp;
        vec4 mv = viewMatrix * wp;
        vViewZ = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      #include <packing>
      uniform float uTime;
      uniform sampler2D tRefl, tRefr, tDepth;
      uniform vec2 uScreen;
      uniform float uNear, uFar;
      uniform vec4 uRipples[${MAX_RIPPLES}];
      uniform vec3 uLPos[${MAX_WLIGHTS}];
      uniform vec3 uLCol[${MAX_WLIGHTS}];
      uniform vec3 uMoonDir;
      uniform int uMode;
      varying vec4 vReflCoord;
      varying vec3 vWorld;
      varying float vViewZ;
      ${GLSL_NOISE}

      vec2 waveGrad(vec2 p, float t){
        vec2 g = vec2(0.0);
        // a handful of gentle directional wavelets
        const vec2 D0 = vec2(0.8, 0.6), D1 = vec2(-0.45, 0.89), D2 = vec2(0.97, -0.24),
                   D3 = vec2(-0.7, -0.71), D4 = vec2(0.2, 0.98), D5 = vec2(-0.93, 0.36);
        float ph;
        // breeze strength varies slowly across the pond so some patches are mirror-calm
        float breeze = 0.35 + 0.65 * smoothstep(-0.3, 0.6, snoise(vec3(p * 0.18, t * 0.04)));
        ph = dot(D0, p) * 5.0 + t * 1.6;  g += 0.0016 * 5.0 * cos(ph) * D0;
        ph = dot(D1, p) * 7.3 + t * 2.1;  g += 0.0011 * 7.3 * cos(ph) * D1;
        ph = dot(D2, p) * 11.0 + t * 2.7; g += 0.0006 * 11.0 * cos(ph) * D2;
        ph = dot(D3, p) * 15.0 + t * 3.3; g += 0.0004 * 15.0 * cos(ph) * D3;
        ph = dot(D4, p) * 23.0 + t * 4.0; g += 0.00022 * 23.0 * cos(ph) * D4;
        ph = dot(D5, p) * 31.0 + t * 4.6; g += 0.00015 * 31.0 * cos(ph) * D5;
        // drifting noise for organic irregularity
        vec3 q = vec3(p * 1.1 + vec2(t * 0.05, t * 0.03), t * 0.18);
        float e = 0.08;
        float n0 = snoise(q);
        g += vec2(snoise(q + vec3(e, 0.0, 0.0)) - n0, snoise(q + vec3(0.0, e, 0.0)) - n0) / e * 0.005;
        vec3 q2 = vec3(p * 3.7 - vec2(t * 0.11, -t * 0.07), t * 0.4);
        float m0 = snoise(q2);
        g += vec2(snoise(q2 + vec3(e, 0.0, 0.0)) - m0, snoise(q2 + vec3(0.0, e, 0.0)) - m0) / e * 0.002;
        return g * breeze;
      }

      vec2 rippleGrad(vec2 p){
        vec2 g = vec2(0.0);
        for (int i = 0; i < ${MAX_RIPPLES}; i++){
          vec4 r = uRipples[i];
          float age = uTime - r.z;
          if (age < 0.0 || age > 9.0 || r.w <= 0.0) continue;
          vec2 d = p - r.xy;
          float dist = length(d) + 1e-4;
          float front = age * 0.42;
          float x = dist - front;
          float env = exp(-x * x * 5.0) * exp(-age * 0.45) * r.w / (0.4 + dist * 1.5);
          env *= smoothstep(0.0, 0.25, age);
          g += 32.0 * cos(x * 32.0) * env * d / dist;
        }
        return g;
      }

      float linZ(float depth){ return -perspectiveDepthToViewZ(depth, uNear, uFar); }

      void main(){
        vec2 p = vWorld.xz;
        vec2 g = waveGrad(p, uTime) + rippleGrad(p);
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 V = normalize(cameraPosition - vWorld);
        float NdV = max(dot(N, V), 0.0);
        float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);

        // refraction
        vec2 suv = gl_FragCoord.xy / uScreen;
        vec2 gd = g / max(1.0, length(g) * 6.0); // limit distortion under strong ripples
        vec2 ruv = suv + gd * 0.16;
        float sceneZ = linZ(texture2D(tDepth, ruv).x);
        if (sceneZ < vViewZ) { ruv = suv; sceneZ = linZ(texture2D(tDepth, suv).x); }
        vec3 refr = texture2D(tRefr, ruv).rgb;
        float thick = max(sceneZ - vViewZ, 0.0);
        vec3 absorb = exp(-thick * vec3(1.25, 0.82, 0.85));
        vec3 scatter = vec3(0.006, 0.020, 0.022);
        // warm light scattered in the water near lanterns
        vec3 glow = vec3(0.0);
        for (int i = 0; i < ${MAX_WLIGHTS}; i++){
          vec3 L = uLPos[i] - vWorld;
          float dl2 = dot(L, L);
          glow += uLCol[i] / (1.0 + dl2 * 2.2);
        }
        scatter += glow * 0.05;
        vec3 under = refr * absorb + scatter * (1.0 - absorb);

        // reflection
        vec2 rc = vReflCoord.xy / vReflCoord.w;
        rc += gd * vec2(0.12, 0.22);
        vec3 refl = texture2D(tRefl, rc).rgb;

        float R = clamp(F * 0.95 + 0.07, 0.0, 1.0);
        vec3 col = mix(under, refl, R);

        // glints from lanterns and moon
        for (int i = 0; i < ${MAX_WLIGHTS}; i++){
          vec3 L = uLPos[i] - vWorld;
          float dl = length(L);
          L /= dl;
          vec3 H = normalize(L + V);
          float s = pow(max(dot(N, H), 0.0), 420.0);
          col += uLCol[i] * s * 3.0 / (0.3 + dl * dl * 0.25);
        }
        vec3 Hm = normalize(uMoonDir + V);
        col += vec3(0.8, 0.85, 1.0) * pow(max(dot(N, Hm), 0.0), 900.0) * 3.0;

        // soften the shoreline
        col = mix(refr, col, smoothstep(0.0, 0.05, thick));
        if (uMode == 1) col = refl;
        if (uMode == 2) col = under;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  return { mesh, uniforms };
}

// Mirror camera + render targets for the planar reflection and the refraction view.
export class WaterRenderer {
  constructor(waterUniforms) {
    this.u = waterUniforms;
    const opts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
    this.reflRT = new THREE.WebGLRenderTarget(16, 16, { ...opts, samples: 2 });
    this.refrRT = new THREE.WebGLRenderTarget(16, 16, { ...opts, samples: 4 });
    this.refrRT.depthTexture = new THREE.DepthTexture(16, 16);
    this.refrRT.depthTexture.type = THREE.UnsignedIntType;
    this.u.tRefl.value = this.reflRT.texture;
    this.u.tRefr.value = this.refrRT.texture;
    this.u.tDepth.value = this.refrRT.depthTexture;
    this.mirrorCam = new THREE.PerspectiveCamera();
    this.reflScale = 0.5;
    this.refrScale = 0.75;
    this._v = {
      normal: new THREE.Vector3(0, 1, 0), mirrorPos: new THREE.Vector3(), camPos: new THREE.Vector3(),
      rot: new THREE.Matrix4(), lookAt: new THREE.Vector3(), target: new THREE.Vector3(), view: new THREE.Vector3(),
      plane: new THREE.Plane(), clip: new THREE.Vector4(), q: new THREE.Vector4(),
    };
  }

  setSize(w, h) {
    this.reflRT.setSize(Math.max(1, Math.floor(w * this.reflScale)), Math.max(1, Math.floor(h * this.reflScale)));
    this.refrRT.setSize(Math.max(1, Math.floor(w * this.refrScale)), Math.max(1, Math.floor(h * this.refrScale)));
    this.u.uScreen.value.set(w, h);
  }

  updateMirror(camera) {
    const v = this._v;
    const cam = this.mirrorCam;
    v.mirrorPos.set(0, 0, 0);
    v.camPos.setFromMatrixPosition(camera.matrixWorld);
    v.view.subVectors(v.mirrorPos, v.camPos).reflect(v.normal).negate().add(v.mirrorPos);
    v.rot.extractRotation(camera.matrixWorld);
    v.lookAt.set(0, 0, -1).applyMatrix4(v.rot).add(v.camPos);
    v.target.subVectors(v.mirrorPos, v.lookAt).reflect(v.normal).negate().add(v.mirrorPos);
    cam.position.copy(v.view);
    cam.up.set(0, 1, 0).applyMatrix4(v.rot).reflect(v.normal);
    cam.lookAt(v.target);
    cam.far = camera.far;
    cam.near = camera.near;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);

    const tm = this.u.uTexMatrix.value;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(cam.projectionMatrix);
    tm.multiply(cam.matrixWorldInverse);

    // oblique near plane = water plane (slightly lowered to avoid seams)
    v.plane.setFromNormalAndCoplanarPoint(v.normal, new THREE.Vector3(0, -0.02, 0));
    v.plane.applyMatrix4(cam.matrixWorldInverse);
    v.clip.set(v.plane.normal.x, v.plane.normal.y, v.plane.normal.z, v.plane.constant);
    const pm = cam.projectionMatrix;
    v.q.x = (Math.sign(v.clip.x) + pm.elements[8]) / pm.elements[0];
    v.q.y = (Math.sign(v.clip.y) + pm.elements[9]) / pm.elements[5];
    v.q.z = -1.0;
    v.q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    v.clip.multiplyScalar(2.0 / v.clip.dot(v.q));
    pm.elements[2] = v.clip.x;
    pm.elements[6] = v.clip.y;
    pm.elements[10] = v.clip.z + 1.0;
    pm.elements[14] = v.clip.w;
    cam.projectionMatrixInverse.copy(pm).invert();
  }
}
