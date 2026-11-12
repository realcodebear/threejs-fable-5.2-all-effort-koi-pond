// Lightweight shared lighting for the custom materials (ground, plants, trees):
//  - an "ambient cube" integrated from the sky shader (soft directional sky light),
//  - a one-time bake of sky light + afterglow with soft shadows onto the ground,
//  - cheap diffuse light from the lanterns,
//  - distance haze.
import * as THREE from 'three';
import { GLSL_NOISE, uTime } from './common.js';
import { SKY_GLSL, SUNSET_DIR, MOON_DIR, HAZE_COLOR } from './sky.js';
import { drawFullscreen, FS_VERTEX } from './post.js';

export const LANTERN_COUNT = 6;
export const LIGHT_EXTENT = 40;          // the baked ground light covers [-20, 20]^2 metres
export const SKY_GAIN = 2.3;             // artistic boost of the sky light (kept equal to scene.environmentIntensity)

export const KEY_DIR = new THREE.Vector3(SUNSET_DIR.x, 0.42, SUNSET_DIR.z).normalize();   // towards the afterglow
export const KEY_COLOR = new THREE.Color(1.0, 0.60, 0.42);
export const KEY_INTENSITY = 1.25;

export const lightUniforms = {
  uLanternPos: { value: Array.from({ length: LANTERN_COUNT }, () => new THREE.Vector3(0, -100, 0)) },
  uLanternCol: { value: Array.from({ length: LANTERN_COUNT }, () => new THREE.Color(0, 0, 0)) },
  tLight: { value: null },
  uLightScale: { value: 1 / LIGHT_EXTENT },
  uAmbCube: { value: Array.from({ length: 6 }, () => new THREE.Vector3(0.05, 0.06, 0.12)) },
  uKeyDir: { value: KEY_DIR },
  uKeyCol: { value: new THREE.Vector3(KEY_COLOR.r, KEY_COLOR.g, KEY_COLOR.b).multiplyScalar(KEY_INTENSITY / Math.PI) },
  uFogColor: { value: HAZE_COLOR },
  uFogDensity: { value: 0.016 },
  uClip: { value: new THREE.Vector4(0, 1, 0, 1000) },   // clip plane for the reflection / refraction passes
};

export const GLSL_LIGHT = /* glsl */`
#define LANTERN_COUNT ${LANTERN_COUNT}
uniform vec3 uLanternPos[LANTERN_COUNT];
uniform vec3 uLanternCol[LANTERN_COUNT];
uniform sampler2D tLight;
uniform float uLightScale;
uniform vec3 uAmbCube[6];
uniform vec3 uKeyDir, uKeyCol;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec4 uClip;

// diffuse light from the lanterns; wrap > 0 softens the terminator (for thin leaves and grass)
vec3 lanternLight(vec3 p, vec3 n, float wrap) {
  vec3 s = vec3(0.0);
  for (int i = 0; i < LANTERN_COUNT; i++) {
    vec3 L = uLanternPos[i] - p;
    float d2 = dot(L, L) + 0.015;
    float ndl = (dot(n, L) * inversesqrt(d2) + wrap) / (1.0 + wrap);
    s += uLanternCol[i] * (max(ndl, 0.0) / d2);
  }
  return s * 0.3183;
}
// sky light arriving at a surface with normal n (no occlusion)
vec3 skyAmbient(vec3 n) {
  vec3 n2 = n * n;
  return n2.x * (n.x > 0.0 ? uAmbCube[0] : uAmbCube[1])
       + n2.y * (n.y > 0.0 ? uAmbCube[2] : uAmbCube[3])
       + n2.z * (n.z > 0.0 ? uAmbCube[4] : uAmbCube[5]);
}
// baked sky + afterglow light on the ground at a world position
vec3 groundLight(vec2 xz) { return texture2D(tLight, xz * uLightScale + 0.5).rgb; }
vec3 keyLight(vec3 n, float wrap) { return uKeyCol * max((dot(n, uKeyDir) + wrap) / (1.0 + wrap), 0.0); }
vec3 applyFog(vec3 c, float depth) {
  return mix(c, uFogColor, 1.0 - exp(-uFogDensity * uFogDensity * depth * depth));
}
void clipPass(vec3 p) { if (dot(p, uClip.xyz) + uClip.w < 0.0) discard; }
`;

// ---------------------------------------------------------------------------------------
// Ambient cube: irradiance / pi from the sky for the six axis directions
// ---------------------------------------------------------------------------------------
export function computeAmbientCube(renderer) {
  const rt = new THREE.WebGLRenderTarget(6, 1, { type: THREE.FloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uSunsetDir: { value: SUNSET_DIR }, uMoonDir: { value: MOON_DIR }, uSkyDetail: { value: 0 } },
    vertexShader: FS_VERTEX,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime;
      varying vec2 vUv;
      ${GLSL_NOISE}
      ${SKY_GLSL}
      void main() {
        int k = int(floor(vUv.x * 6.0));
        vec3 axis = k == 0 ? vec3(1, 0, 0) : k == 1 ? vec3(-1, 0, 0) : k == 2 ? vec3(0, 1, 0) : k == 3 ? vec3(0, -1, 0) : k == 4 ? vec3(0, 0, 1) : vec3(0, 0, -1);
        vec3 sum = vec3(0.0);
        const int M = 420;
        for (int j = 0; j < M; j++) {
          float y = 1.0 - 2.0 * (float(j) + 0.5) / float(M);
          float r = sqrt(max(1.0 - y * y, 0.0));
          float ph = float(j) * 2.39996323;
          vec3 w = vec3(cos(ph) * r, y, sin(ph) * r);
          vec3 L = min(skyColor(w), vec3(3.0));
          sum += L * max(dot(axis, w), 0.0);
        }
        gl_FragColor = vec4(sum * (4.0 / float(M)), 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const prev = renderer.getRenderTarget();
  drawFullscreen(renderer, mat, rt);
  const buf = new Float32Array(24);
  renderer.readRenderTargetPixels(rt, 0, 0, 6, 1, buf);
  renderer.setRenderTarget(prev);
  const cube = lightUniforms.uAmbCube.value;
  for (let i = 0; i < 6; i++) cube[i].set(buf[i * 4], buf[i * 4 + 1], buf[i * 4 + 2]).multiplyScalar(SKY_GAIN);
  // from below: a little light bounced off the mossy ground
  cube[3].set(cube[2].x * 0.10, cube[2].y * 0.16, cube[2].z * 0.07);
  rt.dispose();
  mat.dispose();
  return cube;
}

// ---------------------------------------------------------------------------------------
// Ground light bake: sky light from many directions + the afterglow, each with shadows
// cast by everything standing in the garden. Runs once after the scene has been built.
// ---------------------------------------------------------------------------------------
export function bakeGroundLight({ renderer, scene, receivers, setPass, directions = 56, size = 2048, shadowSize = 2048 }) {
  const R = LIGHT_EXTENT * 0.5 * 1.45, D = 70;
  const depthRT = new THREE.WebGLRenderTarget(shadowSize, shadowSize, { depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  depthRT.depthTexture = new THREE.DepthTexture(shadowSize, shadowSize);
  depthRT.depthTexture.minFilter = THREE.NearestFilter;
  depthRT.depthTexture.magFilter = THREE.NearestFilter;
  const lightCam = new THREE.OrthographicCamera(-R, R, R, -R, D - 40, D + 40);
  const depthMat = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });

  // accumulate without mip-maps, then copy once into the final mip-mapped texture
  const accRT = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  });
  const finalRT = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.HalfFloatType, depthBuffer: false,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true,
    wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
  });
  finalRT.texture.anisotropy = 4;

  const makeBakeMat = (key) => new THREE.ShaderMaterial({
    defines: key ? { KEY: 1, K: 3 } : { K: 1 },
    uniforms: {
      uTime, uSunsetDir: { value: SUNSET_DIR }, uMoonDir: { value: MOON_DIR }, uSkyDetail: { value: 0 },
      tDepth: { value: depthRT.depthTexture },
      uLightVP: { value: new THREE.Matrix4() },
      uDir: { value: new THREE.Vector3() },
      uRadiance: { value: new THREE.Vector3() },
      uWeight: { value: 1 },
      uTexel: { value: 1 / shadowSize },
      uTexelWorld: { value: (2 * R) / shadowSize },
      uDepthRange: { value: 80 },
      uHalf: { value: LIGHT_EXTENT * 0.5 },
    },
    side: THREE.DoubleSide, depthTest: false, depthWrite: false, transparent: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    vertexShader: /* glsl */`
      uniform float uHalf;
      varying vec3 vW; varying vec3 vN;
      void main() {
        vW = position; vN = normal;
        gl_Position = vec4(position.x / uHalf, position.z / uHalf, 0.0, 1.0);     // top-down, world xz -> texture
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime;
      uniform sampler2D tDepth; uniform mat4 uLightVP; uniform vec3 uDir, uRadiance; uniform float uWeight, uTexel, uTexelWorld, uDepthRange;
      varying vec3 vW; varying vec3 vN;
      ${GLSL_NOISE}
      ${SKY_GLSL}
      void main() {
        vec3 n = normalize(vN);
        float ndl = dot(n, uDir);
        if (ndl <= 0.0) discard;
        vec4 lc = uLightVP * vec4(vW + n * 0.035, 1.0);
        vec3 s = lc.xyz / lc.w * 0.5 + 0.5;
        float vis = 0.0;
        #ifdef KEY
          float spread = 2.2;
        #else
          float spread = 1.5;
        #endif
        // slope-scaled bias: the flatter the light, the more depth changes across one shadow texel
        float tanT = sqrt(max(1.0 - ndl * ndl, 0.0)) / max(ndl, 0.05);
        float bias = (0.012 + uTexelWorld * spread * (float(K) + 0.75) * min(tanT, 12.0)) / uDepthRange;
        for (int j = -K; j <= K; j++) for (int i = -K; i <= K; i++) {
          float d = texture2D(tDepth, s.xy + vec2(float(i), float(j)) * uTexel * spread).x;
          vis += step(s.z - bias, d);
        }
        vis /= float((2 * K + 1) * (2 * K + 1));
        #ifdef KEY
          vec3 rad = uRadiance;
        #else
          vec3 rad = min(skyColor(uDir), vec3(3.0)) * uWeight;
        #endif
        gl_FragColor = vec4(rad * ndl * vis, 1.0);
      }`,
  });
  const skyMat = makeBakeMat(false), keyMat = makeBakeMat(true);
  const bakeScene = new THREE.Scene();
  const proxies = receivers.map((m) => { const p = new THREE.Mesh(m.geometry, skyMat); p.frustumCulled = false; bakeScene.add(p); return p; });
  const dummyCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const prevTarget = renderer.getRenderTarget();
  const prevAuto = renderer.autoClear;
  const prevClear = new THREE.Color(); renderer.getClearColor(prevClear);
  const prevAlpha = renderer.getClearAlpha();
  const prevFog = scene.fog, prevEnv = scene.environment;
  scene.fog = null;
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(accRT);
  renderer.clear();

  const vp = new THREE.Matrix4();
  const pass = (dir, mat) => {
    lightCam.position.copy(dir).multiplyScalar(D);
    lightCam.up.set(0, 1, 0);
    if (Math.abs(dir.y) > 0.99) lightCam.up.set(0, 0, -1);
    lightCam.lookAt(0, 0, 0);
    lightCam.updateMatrixWorld();
    // depth of everything that casts a shadow, seen from the light
    setPass('shadow');
    scene.overrideMaterial = depthMat;
    renderer.autoClear = true;
    renderer.setRenderTarget(depthRT);
    renderer.render(scene, lightCam);
    scene.overrideMaterial = null;
    // accumulate this direction's light on the ground
    vp.multiplyMatrices(lightCam.projectionMatrix, lightCam.matrixWorldInverse);
    mat.uniforms.uLightVP.value.copy(vp);
    mat.uniforms.uDir.value.copy(dir);
    proxies.forEach((p) => { p.material = mat; });
    renderer.autoClear = false;
    renderer.setRenderTarget(accRT);
    renderer.render(bakeScene, dummyCam);
  };

  const dir = new THREE.Vector3();
  for (let i = 0; i < directions; i++) {
    const y = 0.03 + 0.97 * (1 - (i + 0.5) / directions);
    const r = Math.sqrt(Math.max(1 - y * y, 0));
    const ph = i * 2.39996323 + 0.7;
    dir.set(Math.cos(ph) * r, y, Math.sin(ph) * r).normalize();
    skyMat.uniforms.uWeight.value = (2.0 / directions) * SKY_GAIN;       // (2 pi / N) / pi
    pass(dir, skyMat);
  }
  keyMat.uniforms.uRadiance.value.set(KEY_COLOR.r, KEY_COLOR.g, KEY_COLOR.b).multiplyScalar(KEY_INTENSITY / Math.PI);
  pass(KEY_DIR, keyMat);

  // copy into the mip-mapped texture
  const copyMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: accRT.texture } },
    vertexShader: FS_VERTEX,
    fragmentShader: 'uniform sampler2D tSrc; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }',
    depthTest: false, depthWrite: false,
  });
  renderer.autoClear = true;
  drawFullscreen(renderer, copyMat, finalRT);

  // restore state
  renderer.setRenderTarget(prevTarget);
  renderer.autoClear = prevAuto;
  renderer.setClearColor(prevClear, prevAlpha);
  scene.fog = prevFog; scene.environment = prevEnv;
  depthRT.dispose(); accRT.dispose();
  skyMat.dispose(); keyMat.dispose(); depthMat.dispose(); copyMat.dispose();
  lightUniforms.tLight.value = finalRT.texture;
  return finalRT.texture;
}
