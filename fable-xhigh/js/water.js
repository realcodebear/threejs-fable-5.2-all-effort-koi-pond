// Water: ripple simulation, planar reflection, refraction with depth absorption.
import * as THREE from 'three';
import { NOISE_GLSL, POND_GLSL, POND, RIPPLE_EXT, NL, pondR } from './common.js';

const SIM = 768;
const NDROP = 24;

const fsVert = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const simFrag = /* glsl */`
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform vec4 uDrops[${NDROP}];
varying vec2 vUv;
${POND_GLSL}
void main(){
  vec4 c = texture2D(uPrev, vUv);
  float l = texture2D(uPrev, vUv - vec2(uTexel.x, 0.0)).r;
  float r = texture2D(uPrev, vUv + vec2(uTexel.x, 0.0)).r;
  float d = texture2D(uPrev, vUv - vec2(0.0, uTexel.y)).r;
  float u = texture2D(uPrev, vUv + vec2(0.0, uTexel.y)).r;
  float ld = texture2D(uPrev, vUv + vec2(-uTexel.x, -uTexel.y)).r;
  float rd = texture2D(uPrev, vUv + vec2( uTexel.x, -uTexel.y)).r;
  float lu = texture2D(uPrev, vUv + vec2(-uTexel.x,  uTexel.y)).r;
  float ru = texture2D(uPrev, vUv + vec2( uTexel.x,  uTexel.y)).r;
  // isotropic 9-point Laplacian keeps rings round
  float lap = (4.0 * (l + r + u + d) + (ld + rd + lu + ru) - 20.0 * c.r) / 6.0;
  float vel = (c.r - c.g) * 0.9965;
  float h = c.r + vel + lap * 0.24;
  h *= 0.9992;
  for (int i = 0; i < ${NDROP}; i++) {
    vec4 dr = uDrops[i];
    if (dr.z > 0.0) {
      float dd = distance(vUv, dr.xy) / dr.z;
      dd *= dd;
      h += dr.w * (1.0 - dd) * exp(-dd);
    }
  }
  vec2 wp = (vUv - 0.5) * ${RIPPLE_EXT.toFixed(2)};
  h *= smoothstep(-0.30, -0.02, pondD(wp)); // shores absorb
  gl_FragColor = vec4(h, c.r, (r - l) * 0.5, (u - d) * 0.5);
}
`;

// Tileable gentle swell: periodic fbm -> gradient (rg) + height (b)
const waveFrag = /* glsl */`
varying vec2 vUv;
${NOISE_GLSL}
float pn(vec2 p, float per){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);
  float a = hash12(mod(i, per)), b = hash12(mod(i + vec2(1,0), per));
  float c = hash12(mod(i + vec2(0,1), per)), d = hash12(mod(i + vec2(1,1), per));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float H(vec2 uv){
  float s = 0.0, a = 0.5, per = 4.0;
  for (int i = 0; i < 5; i++) { s += a * pn(uv * per + vec2(13.0, 7.0) * float(i), per); per *= 2.0; a *= 0.52; }
  return s;
}
void main(){
  float e = 1.0 / 512.0;
  float h = H(vUv);
  vec2 g = vec2(H(vUv + vec2(e, 0.0)) - H(vUv - vec2(e, 0.0)), H(vUv + vec2(0.0, e)) - H(vUv - vec2(0.0, e))) / (2.0 * e);
  gl_FragColor = vec4(g, h, 1.0);
}
`;

const waterVert = /* glsl */`
varying vec3 vWorld; varying float vViewZ;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vViewZ = mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const waterFrag = /* glsl */`
uniform sampler2D uRefl, uRefr, uRefrDepth, uRipple, uWaves;
uniform mat4 uTexMat;
uniform vec2 uRes;
uniform float uNear, uFar, uTime, uRippleAmp, uWaveAmp, uRefrStr, uReflDist;
uniform vec3 uAbsorb, uScatter;
uniform vec3 uLPos[${NL}]; uniform float uLGlint[${NL}];
uniform float uGlint;
varying vec3 vWorld; varying float vViewZ;

float viewZ(float d){ return (uNear * uFar) / ((uFar - uNear) * d - uFar); }

void main(){
  vec2 suv = gl_FragCoord.xy / uRes;
  vec3 toEye = cameraPosition - vWorld;
  float dist = length(toEye);
  vec3 V = toEye / dist;

  // ---- surface slope: slow swell + interactive ripples
  vec2 p = vWorld.xz;
  vec2 g = vec2(0.0);
  g += texture2D(uWaves, p * 0.075 + uTime * vec2(0.0045, 0.0028)).rg * 0.075;
  mat2 R1 = mat2(0.8, 0.6, -0.6, 0.8);
  g += (texture2D(uWaves, (R1 * p) * 0.19 + uTime * vec2(-0.008, 0.0055)).rg * R1) * 0.19 * 0.55;
  mat2 R2 = mat2(0.28, -0.96, 0.96, 0.28);
  g += (texture2D(uWaves, (R2 * p) * 0.47 + uTime * vec2(0.012, 0.009)).rg * R2) * 0.47 * 0.22;
  g *= uWaveAmp;
  vec4 rip = texture2D(uRipple, p / ${RIPPLE_EXT.toFixed(2)} + 0.5);
  g += rip.ba * uRippleAmp;
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));

  // ---- reflection: project a point along the perturbed reflected ray into the mirror camera
  vec3 R = reflect(-V, N);
  R.y = max(R.y, 0.03);
  R = normalize(R);
  vec4 rc = uTexMat * vec4(vWorld + R * uReflDist, 1.0);
  vec2 ruv = clamp(rc.xy / rc.w, vec2(0.002), vec2(0.998));
  vec3 refl = texture2D(uRefl, ruv, 1.1).rgb;   // slightly soft: water never mirrors perfectly

  // ---- refraction with depth test against the scene behind
  float z0 = viewZ(texture2D(uRefrDepth, suv).x);
  float thick0 = max(vViewZ - z0, 0.0);
  vec3 nv = mat3(viewMatrix) * vec3(N.x, 0.0, N.z);
  vec2 off = nv.xy * uRefrStr * clamp(thick0 * 1.4, 0.0, 1.0) / max(-vViewZ, 1.0);
  off.x *= uRes.y / uRes.x;
  vec2 duv = suv + off;
  float z1 = viewZ(texture2D(uRefrDepth, duv).x);
  if (z1 > vViewZ - 0.002) { duv = suv; z1 = z0; }
  vec3 refr = texture2D(uRefr, duv).rgb;
  float thick = max(vViewZ - z1, 0.0) * dist / max(-vViewZ, 1e-3);
  float sinE = max(V.y, 0.04);
  float vert = thick * sinE;
  float cosT = sqrt(1.0 - (1.0 - sinE * sinE) / 1.777);
  float path = vert / cosT;                       // length of the refracted path
  vec3 trans = exp(-path * uAbsorb);
  vec3 body = refr * trans + uScatter * (1.0 - trans);

  float NdV = max(dot(N, V), 0.0);
  float F = 0.03 + 0.97 * pow(1.0 - NdV, 3.9);
  float edge = smoothstep(0.0, 0.035, vert);
  vec3 col = mix(body, refl, F * edge);

  // lantern light glancing off the ripples: the shimmering path towards the viewer
  vec3 glint = vec3(0.0);
  for (int i = 0; i < ${NL}; i++) {
    vec3 Lv = uLPos[i] - vWorld;
    float d2 = dot(Lv, Lv);
    Lv *= inversesqrt(d2);
    float s = max(dot(N, normalize(Lv + V)), 0.0);
    s = pow(s, 700.0) + 0.013 * pow(s, 150.0);
    glint += vec3(1.0, 0.50, 0.17) * (uLGlint[i] * s / (1.0 + 0.10 * d2));
  }
  col += glint * uGlint * edge;
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createWater(ctx) {
  const { renderer, scene } = ctx;

  // ---- fullscreen blit helper
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fsMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  fsMesh.frustumCulled = false;
  const fsScene = new THREE.Scene(); fsScene.add(fsMesh);
  const blit = (mat, target) => { fsMesh.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); };
  ctx.blit = blit;

  // ---- ripple simulation (ping-pong)
  const simOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping };
  let simA = new THREE.WebGLRenderTarget(SIM, SIM, simOpts);
  let simB = new THREE.WebGLRenderTarget(SIM, SIM, simOpts);
  const drops = Array.from({ length: NDROP }, () => new THREE.Vector4(0, 0, 0, 0));
  const simMat = new THREE.ShaderMaterial({
    uniforms: { uPrev: { value: null }, uTexel: { value: new THREE.Vector2(1 / SIM, 1 / SIM) }, uDrops: { value: drops } },
    vertexShader: fsVert, fragmentShader: simFrag, depthTest: false, depthWrite: false,
  });
  const impulses = [];   // one-step disturbances
  const sources = [];    // short oscillating sources -> a few concentric rings

  // ---- static swell texture
  const waveRT = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, generateMipmaps: true, depthBuffer: false });
  waveRT.texture.anisotropy = 8;
  blit(new THREE.ShaderMaterial({ vertexShader: fsVert, fragmentShader: waveFrag, depthTest: false, depthWrite: false }), waveRT);

  // ---- reflection / refraction targets
  const reflRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true });
  const refrRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  refrRT.depthTexture = new THREE.DepthTexture(4, 4, THREE.UnsignedIntType);
  refrRT.depthTexture.minFilter = THREE.NearestFilter;
  refrRT.depthTexture.magFilter = THREE.NearestFilter;

  const uniforms = {
    uRefl: { value: reflRT.texture }, uRefr: { value: refrRT.texture }, uRefrDepth: { value: refrRT.depthTexture },
    uRipple: { value: simA.texture }, uWaves: { value: waveRT.texture },
    uTexMat: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.2 }, uFar: { value: 1500 }, uTime: ctx.uTime,
    uRippleAmp: { value: 1.7 }, uWaveAmp: { value: 0.05 }, uRefrStr: { value: 1.3 }, uReflDist: { value: 7.0 },
    uAbsorb: { value: new THREE.Vector3(0.74, 0.40, 0.47) },
    uScatter: { value: new THREE.Vector3(0.012, 0.027, 0.031) },
    uLPos: { value: ctx.lights.pos }, uLGlint: { value: ctx.lights.glint }, uGlint: { value: 1.0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: waterVert, fragmentShader: waterFrag });

  // pond-shaped fan, slightly larger than the outline so it tucks under the bank
  const N = 160;
  const pos = [0, 0, 0], idx = [];
  for (let j = 0; j < N; j++) {
    const th = (j / N) * Math.PI * 2;
    const r = pondR(th) + 0.16;
    pos.push(Math.cos(th) * r * POND.SX, 0, Math.sin(th) * r);
    idx.push(0, 1 + (j + 1) % N, 1 + j);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -5;   // drawn before the ground so the pond bed beneath is rejected by the depth test
  scene.add(mesh);
  ctx.tag(mesh, { refr: false, refl: false });

  // ---- mirror camera (after three's Reflector)
  const mirrorCam = new THREE.PerspectiveCamera();
  const normal = new THREE.Vector3(0, 1, 0), planePos = new THREE.Vector3(0, 0, 0);
  const camPos = new THREE.Vector3(), rotM = new THREE.Matrix4(), look = new THREE.Vector3(), view = new THREE.Vector3(), target = new THREE.Vector3();
  const plane = new THREE.Plane(), clipPlane = new THREE.Vector4(), q = new THREE.Vector4();
  function updateMirror(camera) {
    camPos.setFromMatrixPosition(camera.matrixWorld);
    rotM.extractRotation(camera.matrixWorld);
    view.subVectors(planePos, camPos).reflect(normal).negate().add(planePos);
    look.set(0, 0, -1).applyMatrix4(rotM).add(camPos);
    target.subVectors(planePos, look).reflect(normal).negate().add(planePos);
    mirrorCam.position.copy(view);
    mirrorCam.up.set(0, 1, 0).applyMatrix4(rotM).reflect(normal);
    mirrorCam.lookAt(target);
    mirrorCam.near = camera.near; mirrorCam.far = camera.far;
    mirrorCam.updateMatrixWorld();
    mirrorCam.projectionMatrix.copy(camera.projectionMatrix);
    mirrorCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    uniforms.uTexMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(mirrorCam.projectionMatrix).multiply(mirrorCam.matrixWorldInverse);
    // oblique near plane = water surface, so nothing below the water leaks into the mirror image
    plane.setFromNormalAndCoplanarPoint(normal, planePos).applyMatrix4(mirrorCam.matrixWorldInverse);
    clipPlane.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = mirrorCam.projectionMatrix.elements;
    q.x = (Math.sign(clipPlane.x) + pm[8]) / pm[0];
    q.y = (Math.sign(clipPlane.y) + pm[9]) / pm[5];
    q.z = -1.0;
    q.w = (1.0 + pm[10]) / pm[14];
    clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));
    pm[2] = clipPlane.x; pm[6] = clipPlane.y; pm[10] = clipPlane.z + 1.0 - 0.003; pm[14] = clipPlane.w;
  }

  // screen rectangle of the pond for a given world->clip (or world->uv) matrix
  const vp = new THREE.Matrix4(), cv = new THREE.Vector4();
  const BX = POND.R0 * 1.2 * POND.SX + 0.35, BZ = POND.R0 * 1.2 + 0.35;
  const cornersXZ = [[-BX, -BZ], [BX, -BZ], [BX, BZ], [-BX, BZ]];
  // Restrict a pass to the pond's rectangle: the target's viewport is set to the rectangle and
  // the projection is narrowed to the matching sub-frustum, so pixels land exactly where a
  // full-frame render would put them (m maps world -> clip space, or world -> uv).
  const subM = new THREE.Matrix4();
  function applyRect(rt, m, isClip, proj) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, ok = true;
    for (const [x, z] of cornersXZ) {
      cv.set(x, 0, z, 1).applyMatrix4(m);
      if (cv.w < 0.05) { ok = false; break; }
      let u = cv.x / cv.w, v = cv.y / cv.w;
      if (isClip) { u = u * 0.5 + 0.5; v = v * 0.5 + 0.5; }
      x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v);
    }
    const W = rt.width, H = rt.height;
    const pad = 0.07;
    let px0 = 0, py0 = 0, px1 = W, py1 = H;
    if (ok) {
      px0 = Math.max(0, Math.floor((x0 - pad) * W)); py0 = Math.max(0, Math.floor((y0 - pad) * H));
      px1 = Math.min(W, Math.ceil((x1 + pad) * W)); py1 = Math.min(H, Math.ceil((y1 + pad) * H));
      if (px1 - px0 < 2 || py1 - py0 < 2) { px0 = 0; py0 = 0; px1 = W; py1 = H; }
    }
    rt.viewport.set(px0, py0, px1 - px0, py1 - py0);
    const sx = (px1 - px0) / W, sy = (py1 - py0) / H;
    const cx = (px0 + px1) / W - 1, cy = (py0 + py1) / H - 1;
    subM.set(1 / sx, 0, 0, -cx / sx, 0, 1 / sy, 0, -cy / sy, 0, 0, 1, 0, 0, 0, 0, 1);
    proj.premultiply(subM);
  }
  const refrCam = new THREE.PerspectiveCamera();
  refrCam.matrixAutoUpdate = false; refrCam.matrixWorldAutoUpdate = false;

  let acc = 0;
  const api = {
    mesh, uniforms, reflRT, refrRT, mirrorCam,
    setSize(w, h) {
      refrRT.setSize(w, h);
      const rs = 0.6;
      reflRT.setSize(Math.max(2, Math.round(w * rs)), Math.max(2, Math.round(h * rs)));
      uniforms.uRes.value.set(w, h);
    },
    // single soft push on the surface (world x/z, radius in metres)
    impulse(x, z, radius, strength) { if (impulses.length < 14) impulses.push([x, z, radius, strength]); },
    // a drop / fish kiss: a brief oscillation that sheds a few rings
    ripple(x, z, radius = 0.07, strength = 0.5, freq = 3.2, life = 0.75) {
      if (sources.length < 10) sources.push({ x, z, radius, strength, freq, life, age: 0 });
    },
    step(dt) {
      acc = Math.min(acc + dt, 0.05);
      const h = 1 / 60;
      let first = true;
      while (acc >= h) {
        acc -= h;
        let n = 0;
        if (first) {
          for (const im of impulses) {
            if (n >= NDROP) break;
            drops[n++].set(im[0] / RIPPLE_EXT + 0.5, im[1] / RIPPLE_EXT + 0.5, im[2] / RIPPLE_EXT, im[3]);
          }
          impulses.length = 0;
        }
        for (let i = sources.length - 1; i >= 0; i--) {
          const s = sources[i];
          s.age += h;
          if (s.age > s.life) { sources.splice(i, 1); continue; }
          if (n >= NDROP) continue;
          const env = Math.sin(Math.PI * Math.min(s.age / s.life, 1));
          const a = s.strength * Math.sin(s.age * s.freq * Math.PI * 2) * env * 0.16;
          drops[n++].set(s.x / RIPPLE_EXT + 0.5, s.z / RIPPLE_EXT + 0.5, s.radius / RIPPLE_EXT, a);
        }
        for (; n < NDROP; n++) drops[n].set(0, 0, 0, 0);
        simMat.uniforms.uPrev.value = simA.texture;
        blit(simMat, simB);
        const t = simA; simA = simB; simB = t;
        first = false;
      }
      uniforms.uRipple.value = simA.texture;
      renderer.setRenderTarget(null);
    },
    renderPasses(camera) {
      uniforms.uNear.value = camera.near; uniforms.uFar.value = camera.far;
      // Both helper passes are only ever sampled where the pond is on screen,
      // so restrict them to the pond's screen rectangle (plus a margin for ripple distortion).
      vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      refrCam.matrixWorld.copy(camera.matrixWorld);
      refrCam.matrixWorldInverse.copy(camera.matrixWorldInverse);
      refrCam.projectionMatrix.copy(camera.projectionMatrix);
      applyRect(refrRT, vp, true, refrCam.projectionMatrix);
      refrCam.projectionMatrixInverse.copy(refrCam.projectionMatrix).invert();
      // refraction: what lies under / behind the surface
      ctx.setPass('refr');
      renderer.setRenderTarget(refrRT);
      renderer.setClearColor(0x020405, 1);
      renderer.clear();
      renderer.render(scene, refrCam);
      // reflection
      updateMirror(camera);
      applyRect(reflRT, uniforms.uTexMat.value, false, mirrorCam.projectionMatrix);
      ctx.setPass('refl');
      ctx.uReflBoost.value = 2.3;       // mirrored lanterns glow a little stronger than physics would give
      renderer.setRenderTarget(reflRT);
      renderer.clear();
      renderer.render(scene, mirrorCam);
      renderer.setRenderTarget(null);
      ctx.uReflBoost.value = 1.0;
      ctx.setPass('main');
    },
  };
  ctx.water = api;
  return api;
}
