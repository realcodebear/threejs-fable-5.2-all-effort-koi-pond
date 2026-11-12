// Water: GPU ripple simulation + planar reflection + refraction with depth absorption.
import * as THREE from 'three';
import { GLSL_POND, mulberry32, uTime, L_MAIN, L_REFLECT, L_UNDER } from './common.js';

// ------------------------------------------------------------------ tileable wavelet gradient texture
function makeWaveTexture(size = 256) {
  const rng = mulberry32(11);
  const waves = [];
  for (let i = 0; i < 44; i++) {
    let kx = Math.round((rng() * 2 - 1) * 13), ky = Math.round((rng() * 2 - 1) * 13);
    if (!kx && !ky) kx = 1;
    const k = Math.hypot(kx, ky);
    waves.push({ kx, ky, a: Math.pow(k, -1.25) * (0.4 + rng()), ph: rng() * Math.PI * 2 });
  }
  const gx = new Float32Array(size * size), gy = new Float32Array(size * size);
  let sum2 = 0;
  const TAU = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let ax = 0, ay = 0;
      for (const w of waves) {
        const c = Math.cos(TAU * (w.kx * u + w.ky * v) + w.ph) * w.a;
        ax += c * w.kx; ay += c * w.ky;
      }
      gx[y * size + x] = ax; gy[y * size + x] = ay;
      sum2 += ax * ax + ay * ay;
    }
  }
  const rms = Math.sqrt(sum2 / (2 * size * size));
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = Math.max(0, Math.min(255, 127.5 + (gx[i] / rms) * 42));
    data[i * 4 + 1] = Math.max(0, Math.min(255, 127.5 + (gy[i] / rms) * 42));
    data[i * 4 + 2] = 128; data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------------ ripple simulation
const MAX_DROPS = 24;

export class RippleSim {
  constructor(renderer, size = 640, world = 9.4) {
    this.renderer = renderer;
    this.size = size; this.world = world;
    const opts = {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: false, stencilBuffer: false,
    };
    this.a = new THREE.WebGLRenderTarget(size, size, opts);
    this.b = new THREE.WebGLRenderTarget(size, size, opts);
    this.queue = [];
    this.acc = 0;
    const drops = [];
    for (let i = 0; i < MAX_DROPS; i++) drops.push(new THREE.Vector4(0, 0, 1, 0));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tPrev: { value: null },
        uTexel: { value: 1 / size },
        uWorld: { value: world },
        uDrops: { value: drops },
      },
      vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tPrev; uniform float uTexel; uniform float uWorld;
        uniform vec4 uDrops[${MAX_DROPS}];
        varying vec2 vUv;
        ${GLSL_POND}
        void main(){
          vec4 s = texture2D(tPrev, vUv);
          float hl = texture2D(tPrev, vUv - vec2(uTexel, 0.0)).r;
          float hr = texture2D(tPrev, vUv + vec2(uTexel, 0.0)).r;
          float hd = texture2D(tPrev, vUv - vec2(0.0, uTexel)).r;
          float hu = texture2D(tPrev, vUv + vec2(0.0, uTexel)).r;
          float lap = hl + hr + hd + hu - 4.0 * s.r;
          float vel = (s.g + lap * 0.23) * 0.9965;
          float h = (s.r + vel) * 0.9992;
          vec2 wp = (vUv - 0.5) * uWorld;
          for (int i = 0; i < ${MAX_DROPS}; i++) {
            vec4 d = uDrops[i];
            if (d.w != 0.0) {
              vec2 q = (wp - d.xy) / d.z;
              float r2 = dot(q, q);
              h += d.w * (1.0 - 1.6 * r2) * exp(-2.0 * r2);
            }
          }
          float m = 1.0 - smoothstep(-0.10, 0.06, pondSD(wp));
          gl_FragColor = vec4(h * m, vel * m, 0.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }
  // world x,z ; radius in metres ; strength in "height" units
  addDrop(x, z, radius, strength) {
    if (this.queue.length < 96 * 4) this.queue.push(x, z, radius, strength);
  }
  update(dt) {
    this.acc += dt;
    let steps = Math.min(Math.floor(this.acc * 60), 3);
    if (steps < 1) return;
    this.acc -= steps / 60;
    if (this.acc > 0.1) this.acc = 0;
    const r = this.renderer;
    const prevRT = r.getRenderTarget();
    const drops = this.mat.uniforms.uDrops.value;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < MAX_DROPS; i++) {
        if (this.queue.length >= 4) {
          const st = this.queue.pop(), rad = this.queue.pop(), z = this.queue.pop(), x = this.queue.pop();
          drops[i].set(x, z, rad, st);
        } else drops[i].set(0, 0, 1, 0);
      }
      this.mat.uniforms.tPrev.value = this.a.texture;
      r.setRenderTarget(this.b);
      r.render(this.scene, this.cam);
      const t = this.a; this.a = this.b; this.b = t;
    }
    r.setRenderTarget(prevRT);
  }
  get texture() { return this.a.texture; }
}

// ------------------------------------------------------------------ water surface
const waterVert = /* glsl */`
varying vec3 vWorld;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const waterFrag = /* glsl */`
uniform sampler2D tReflect, tRefract, tRefrDepth, tSim, tNoise;
uniform mat4 uReflMatrix;
uniform mat4 uInvViewProj;
uniform vec3 uCamFwd;
uniform vec2 uRes;
uniform float uTime, uNear, uFar;
uniform float uSimWorld, uSimTexel, uSimGrad, uDetail, uReflDist, uRefrDistort, uF0, uFPow, uReflGain;
uniform vec3 uSigma, uScatter;
varying vec3 vWorld;

float depthToViewZ(float d){ return (uNear * uFar) / (uFar - (uFar - uNear) * d); }
vec3 rayDir(vec2 uv){
  vec4 p = uInvViewProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  return normalize(p.xyz / p.w - cameraPosition);
}

void main(){
  vec2 suv = gl_FragCoord.xy / uRes;
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;

  // ---- surface slope: simulated ripples + ambient wavelets
  vec2 simUV = vWorld.xz / uSimWorld + 0.5;
  float hL = texture2D(tSim, simUV - vec2(uSimTexel, 0.0)).r;
  float hR = texture2D(tSim, simUV + vec2(uSimTexel, 0.0)).r;
  float hD = texture2D(tSim, simUV - vec2(0.0, uSimTexel)).r;
  float hU = texture2D(tSim, simUV + vec2(0.0, uSimTexel)).r;
  vec2 gS = vec2(hR - hL, hU - hD) * uSimGrad;

  vec2 p = vWorld.xz;
  float t = uTime;
  vec2 d1 = texture2D(tNoise, p * 0.19 + t * vec2(0.007, 0.004)).xy - 0.5;
  vec2 d2 = texture2D(tNoise, p * 0.43 + t * vec2(-0.012, 0.008) + 0.37).xy - 0.5;
  vec2 d3 = texture2D(tNoise, p * 1.07 + t * vec2(0.010, -0.017) + 0.71).xy - 0.5;
  vec2 d4 = texture2D(tNoise, p * 2.6 + t * vec2(-0.021, -0.013) + 0.13).xy - 0.5;
  float breeze = 0.58 + 0.42 * sin(p.x * 0.42 + t * 0.13 + sin(p.y * 0.5 - t * 0.09) * 1.7);
  vec2 gD = (d1 * 0.8 + d2 * 0.8 + d3 * 0.7 + d4 * 0.45) * uDetail * breeze;
  vec2 g = gS + gD;
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));

  float ndv = max(dot(N, V), 0.0);
  float F = uF0 + (1.0 - uF0) * pow(1.0 - ndv, uFPow);

  // ---- reflection: follow the reflected ray a fixed distance and project it into the mirror camera.
  // A sharp tap plus a softer one bent by a different mix of the wavelets stands in for unresolved ripples.
  vec3 R = reflect(-V, N);
  R.y = max(abs(R.y), 0.03);
  R = normalize(R);
  vec4 rc = uReflMatrix * vec4(vWorld + R * uReflDist, 1.0);
  vec2 ruv = clamp(rc.xy / rc.w, 0.002, 0.998);
  vec2 g2 = gS + (d2 * 0.9 - d1 * 0.7 - d3 * 0.8 + d4 * 0.6) * uDetail * breeze * 1.3;
  vec3 R2 = reflect(-V, normalize(vec3(-g2.x, 1.0, -g2.y)));
  R2.y = max(abs(R2.y), 0.03);
  vec4 rc2 = uReflMatrix * vec4(vWorld + normalize(R2) * uReflDist, 1.0);
  vec2 ruv2 = clamp(rc2.xy / rc2.w, 0.002, 0.998);
  vec3 refl = (texture2D(tReflect, ruv, 0.6).rgb * 0.55 + texture2D(tReflect, ruv2, 2.2).rgb * 0.45) * uReflGain;

  // ---- refraction with depth based absorption
  float cosF = max(dot(-V, uCamFwd), 1e-3);
  float scene0 = depthToViewZ(texture2D(tRefrDepth, suv).x) / cosF;
  float thick0 = max(scene0 - dist, 0.0);
  vec2 off = (viewMatrix * vec4(N.x, 0.0, N.z, 0.0)).xy;
  off *= uRefrDistort * min(thick0 * 2.5, 1.0) / max(dist * 0.16, 0.5);
  off.x *= uRes.y / uRes.x;
  vec2 uvD = suv + off;
  vec3 dirD = rayDir(uvD);
  float tPlane = cameraPosition.y / max(-dirD.y, 1e-4);
  float sceneD = depthToViewZ(texture2D(tRefrDepth, uvD).x) / max(dot(dirD, uCamFwd), 1e-3);
  float thick = sceneD - tPlane;
  float below = max(-(cameraPosition.y + dirD.y * sceneD), 0.0);
  if (thick < 0.0) { uvD = suv; thick = thick0; below = max(-(cameraPosition.y - V.y * scene0), 0.0); }
  vec3 refr = texture2D(tRefract, uvD).rgb;
  // light is absorbed on the way down as well as on the way back to the eye
  vec3 T = exp(-uSigma * (thick + below * 1.2));
  vec3 under = refr * T + uScatter * (1.0 - T);

  F *= smoothstep(0.0, 0.06, thick0);
  vec3 col = mix(under, refl, F);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Water {
  constructor(renderer, sim) {
    this.renderer = renderer;
    this.sim = sim;
    this.vcam = new THREE.PerspectiveCamera();
    this.vcam.layers.set(L_REFLECT);
    this.reflRT = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, samples: 4,
      generateMipmaps: true,
    });
    this.refrRT = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    this.refrRT.depthTexture = new THREE.DepthTexture(4, 4);
    this.refrRT.depthTexture.minFilter = THREE.NearestFilter;
    this.refrRT.depthTexture.magFilter = THREE.NearestFilter;

    this.uniforms = {
      tReflect: { value: this.reflRT.texture },
      tRefract: { value: this.refrRT.texture },
      tRefrDepth: { value: this.refrRT.depthTexture },
      tSim: { value: null },
      tNoise: { value: makeWaveTexture() },
      uReflMatrix: { value: new THREE.Matrix4() },
      uInvViewProj: { value: new THREE.Matrix4() },
      uCamFwd: { value: new THREE.Vector3() },
      uRes: { value: new THREE.Vector2(4, 4) },
      uTime,
      uNear: { value: 0.2 }, uFar: { value: 300 },
      uSimWorld: { value: sim.world },
      uSimTexel: { value: 1 / sim.size },
      uSimGrad: { value: 0.5 / (sim.world / sim.size) },
      uDetail: { value: 0.10 },
      uReflDist: { value: 4.0 },
      uRefrDistort: { value: 0.05 },
      uF0: { value: 0.14 },
      uFPow: { value: 3.0 },
      uReflGain: { value: 1.0 },
      uSigma: { value: new THREE.Vector3(0.40, 0.33, 0.38) },
      uScatter: { value: new THREE.Vector3(0.014, 0.034, 0.030) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: waterVert, fragmentShader: waterFrag, fog: false,
    });
    const geo = new THREE.PlaneGeometry(10.4, 8.2, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.layers.set(L_MAIN);
    this.mesh.frustumCulled = false;

    // scratch
    this._n = new THREE.Vector3(0, 1, 0);
    this._o = new THREE.Vector3(0, 0, 0);
    this._camPos = new THREE.Vector3();
    this._rot = new THREE.Matrix4();
    this._look = new THREE.Vector3();
    this._view = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._plane = new THREE.Plane();
    this._clip = new THREE.Vector4();
    this._q = new THREE.Vector4();
  }

  setSize(w, h) {
    this.refrRT.setSize(w, h);
    this.reflRT.setSize(Math.max(2, Math.round(w * 0.6)), Math.max(2, Math.round(h * 0.6)));
    this.uniforms.uRes.value.set(w, h);
  }

  render(scene, camera) {
    const r = this.renderer;
    const u = this.uniforms;
    u.tSim.value = this.sim.texture;
    camera.updateMatrixWorld();
    u.uNear.value = camera.near; u.uFar.value = camera.far;
    u.uInvViewProj.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
    camera.getWorldDirection(u.uCamFwd.value);

    const prevRT = r.getRenderTarget();

    // ---- refraction pass: everything that lives under water
    camera.layers.set(L_UNDER);
    r.setRenderTarget(this.refrRT);
    r.clear();
    r.render(scene, camera);
    camera.layers.set(L_MAIN);

    // ---- reflection pass (mirror camera about y = 0), after three's Reflector
    const n = this._n, o = this._o, vcam = this.vcam;
    this._camPos.setFromMatrixPosition(camera.matrixWorld);
    this._view.subVectors(o, this._camPos);
    this._view.reflect(n).negate().add(o);
    this._rot.extractRotation(camera.matrixWorld);
    this._look.set(0, 0, -1).applyMatrix4(this._rot).add(this._camPos);
    this._target.subVectors(o, this._look).reflect(n).negate().add(o);
    vcam.position.copy(this._view);
    vcam.up.set(0, 1, 0).applyMatrix4(this._rot).reflect(n);
    vcam.lookAt(this._target);
    vcam.near = camera.near; vcam.far = camera.far;
    vcam.updateMatrixWorld();
    vcam.projectionMatrix.copy(camera.projectionMatrix);

    u.uReflMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    u.uReflMatrix.value.multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse);

    // oblique near plane so nothing below the water is mirrored
    this._plane.setFromNormalAndCoplanarPoint(n, o).applyMatrix4(vcam.matrixWorldInverse);
    const cp = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const pm = vcam.projectionMatrix, q = this._q;
    q.x = (Math.sign(cp.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(cp.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0;
    q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    cp.multiplyScalar(2.0 / cp.dot(q));
    pm.elements[2] = cp.x; pm.elements[6] = cp.y; pm.elements[10] = cp.z + 1.0; pm.elements[14] = cp.w;

    r.setRenderTarget(this.reflRT);
    r.clear();
    r.render(scene, vcam);

    r.setRenderTarget(prevRT);
  }
}
