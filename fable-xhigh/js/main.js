// Koi pond at dusk — scene assembly, camera, render loop.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { NL, NF, OCC_EXT, SHARED, clamp } from './common.js';
import { makeSkyMesh, createBackdrop, GLOW_DIR } from './sky.js';
import { createTerrain } from './terrain.js';
import { createStones, makeStoneMaterial } from './stones.js';
import { createWater } from './water.js';
import { createKoi } from './koi.js';
import { createLilies } from './lilies.js';
import { createLanterns } from './lanterns.js';
import { createMaple, createGrass, createShrubs, createTrees, createFence } from './flora.js';
import { createFireflies, FinalShader } from './fx.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;   // rendered and blurred once; one cheap lookup per pixel
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(new THREE.Color(0.135, 0.095, 0.16), 0.0105);
const camera = new THREE.PerspectiveCamera(42, 1, 0.2, 1500);

// ---------------------------------------------------------------- shared context
const tagged = [];
const ctx = {
  renderer, scene, camera,
  uTime: SHARED.time,
  uOcc: { value: null },
  uPointScale: { value: 1000 },
  uReflBoost: { value: 1 },
  lights: {
    pos: Array.from({ length: NL }, () => new THREE.Vector3(0, -50, 0)),
    col: Array.from({ length: NL }, () => new THREE.Color(0, 0, 0)),
    glint: new Array(NL).fill(0),
  },
  lightCount: 0,
  fishSeg: { value: Array.from({ length: NF }, () => new THREE.Vector4(99, 99, 99, 99)) },
  fishPar: { value: Array.from({ length: NF }, () => new THREE.Vector3(0.01, 0.01, 0)) },
  koiSky: { value: new THREE.Color(0.20, 0.23, 0.42) },
  koiGnd: { value: new THREE.Color(0.035, 0.05, 0.055) },
  koiKey: { value: new THREE.Color(0.36, 0.17, 0.12) },
  koiKeyDir: { value: GLOW_DIR.clone() },
  occ: { solid: [], pads: [], canopy: [] },
  updaters: [],
  obstacles: [],
  stonesPlaced: [],
  // which of the three passes (refraction, reflection, main) an object is drawn in
  tag(obj, vis) { obj.userData.pass = { refr: true, refl: true, main: true, ...vis }; tagged.push(obj); },
  setPass(name) { for (const o of tagged) o.visible = o.userData.pass[name]; },
};

// ---------------------------------------------------------------- light
{
  // image-based ambient light from the procedural sky itself
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(makeSkyMesh(ctx.uTime, true));
  scene.environment = pmrem.fromScene(envScene, 0, 0.1, 1000).texture;
  scene.environmentIntensity = 1.45;
  pmrem.dispose();
}
const key = new THREE.DirectionalLight(new THREE.Color(1.0, 0.50, 0.36), 1.5);
key.position.copy(GLOW_DIR).multiplyScalar(45);
key.castShadow = true;
key.shadow.mapSize.set(1536, 1536);
Object.assign(key.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 5, far: 95 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.03;
key.shadow.radius = 5;
key.shadow.blurSamples = 14;
scene.add(key, key.target);

// ---------------------------------------------------------------- world
ctx.stoneMat = makeStoneMaterial(ctx);
const sky = makeSkyMesh(ctx.uTime, false);
scene.add(sky);
ctx.tag(sky, { refr: false });
createBackdrop(ctx);
createTerrain(ctx);
createStones(ctx);
createWater(ctx);
createLanterns(ctx);
createLilies(ctx);
createKoi(ctx);
createShrubs(ctx);
createTrees(ctx);
createFence(ctx);
createMaple(ctx);
createGrass(ctx);
createFireflies(ctx);

// ---------------------------------------------------------------- top-down occlusion map
// R: stones / trunks, G: lily pads, B: maple canopy. Blurred once and reused as soft
// contact shadows and sky occlusion by the ground, stones, plants and fish.
function buildOcclusion() {
  const S = 1024;
  const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  const a = new THREE.WebGLRenderTarget(S, S, opts), b = new THREE.WebGLRenderTarget(S, S, opts);
  const cam = new THREE.OrthographicCamera(-OCC_EXT / 2, OCC_EXT / 2, OCC_EXT / 2, -OCC_EXT / 2, 0.1, 100);
  cam.position.set(0, 50, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
  ctx.setPass('main');
  const saved = [];
  scene.traverse((o) => { if (o.isMesh || o.isPoints) saved.push([o, o.visible]); });
  const fog = scene.fog; scene.fog = null;
  const autoClear = renderer.autoClear;
  renderer.setRenderTarget(a); renderer.setClearColor(0x000000, 1); renderer.clear();
  renderer.autoClear = false;
  const passes = [[ctx.occ.solid, new THREE.Color(1, 0, 0)], [ctx.occ.pads, new THREE.Color(0, 1, 0)], [ctx.occ.canopy, new THREE.Color(0, 0, 0.45)]];
  for (const [list, color] of passes) {
    for (const [o] of saved) o.visible = false;
    for (const root of list) root.traverse((o) => { if (o.isMesh) o.visible = true; });
    scene.overrideMaterial = new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false });
    renderer.render(scene, cam);
  }
  scene.overrideMaterial = null;
  renderer.autoClear = autoClear;
  scene.fog = fog;
  for (const [o, v] of saved) o.visible = v;
  const blur = new THREE.ShaderMaterial({
    uniforms: { tMap: { value: null }, uDir: { value: new THREE.Vector2() } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tMap; uniform vec2 uDir; varying vec2 vUv;
      void main(){
        vec3 acc = vec3(0.0); float ws = 0.0;
        for (int i = -8; i <= 8; i++) {
          float fi = float(i); float w = exp(-fi * fi / 22.0); vec2 o = uDir * fi;
          acc.r += texture2D(tMap, vUv + o * 1.1).r * w;
          acc.g += texture2D(tMap, vUv + o * 0.8).g * w;
          acc.b += texture2D(tMap, vUv + o * 4.0).b * w;
          ws += w;
        }
        gl_FragColor = vec4(acc / ws, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  for (let i = 0; i < 2; i++) {
    blur.uniforms.tMap.value = a.texture; blur.uniforms.uDir.value.set(1 / S, 0); ctx.blit(blur, b);
    blur.uniforms.tMap.value = b.texture; blur.uniforms.uDir.value.set(0, 1 / S); ctx.blit(blur, a);
  }
  renderer.setRenderTarget(null);
  ctx.uOcc.value = a.texture;
  b.dispose();
}
buildOcclusion();

// ---------------------------------------------------------------- post-processing
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
composer.setPixelRatio(1);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.42, 0.72, 0.9);
composer.addPass(bloom);
const finalPass = new ShaderPass(FinalShader);
finalPass.uniforms.uExposure.value = 1.25;
composer.addPass(finalPass);

// ---------------------------------------------------------------- camera
const controls = new OrbitControls(camera, canvas);
controls.target.set(0.0, 1.0, -0.25);
camera.position.set(2.0, 3.6, 7.65);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.rotateSpeed = 0.5;
controls.zoomSpeed = 0.7;
controls.minDistance = 3.6;
controls.maxDistance = 9.6;   // stays inside the bamboo fence
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = 1.42;
controls.update();

let dragging = false, resume = 1, autoT = 0;
canvas.addEventListener('pointerdown', () => { dragging = true; canvas.style.cursor = 'grabbing'; });
const release = () => { if (dragging) { dragging = false; resume = 0; canvas.style.cursor = 'grab'; } };
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
window.addEventListener('blur', release);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// The camera sweeps slowly back and forth around the pond (a wide pendulum arc that keeps
// clear of the maple's canopy), breathing in and out and rising and falling a little.
// Everything is applied as small increments, so it simply carries on from wherever the
// viewer leaves the camera.
const sph = new THREE.Spherical(), offs = new THREE.Vector3();
const swing = (t) => 1.83 * Math.sin(t * 0.0132 - 0.35);
const bobPhi = (t) => 0.072 * Math.sin(t * 0.115 + 0.4);
const bobRad = (t) => 0.075 * Math.sin(t * 0.083 + 2.2);
function driftCamera(dt) {
  if (!dragging) {
    resume = Math.min(1, resume + dt / 3.0);
    const k = resume * resume * (3 - 2 * resume);
    const t0 = autoT; autoT += dt * k;
    offs.copy(camera.position).sub(controls.target);
    sph.setFromVector3(offs);
    sph.theta += swing(autoT) - swing(t0);
    sph.phi = clamp(sph.phi + bobPhi(autoT) - bobPhi(t0), controls.minPolarAngle, controls.maxPolarAngle);
    sph.radius = clamp(sph.radius * (1 + bobRad(autoT) - bobRad(t0)), controls.minDistance, controls.maxDistance);
    offs.setFromSpherical(sph);
    camera.position.copy(controls.target).add(offs);
  }
  controls.update();
}

// ---------------------------------------------------------------- sizing
let quality = 1;
function resize() {
  const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  let pr = Math.min(window.devicePixelRatio || 1, 2);
  pr = Math.min(pr, Math.sqrt(2.6e6 / (w * h))) * quality;
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  const W = canvas.width, H = canvas.height;
  composer.setSize(W, H);
  ctx.water.setSize(W, H);
  camera.aspect = w / h;
  // keep the pond framed on narrow windows
  const base = 42 * Math.PI / 180;
  camera.fov = (2 * Math.atan(Math.tan(base / 2) * Math.max(1, 1.55 / camera.aspect))) * 180 / Math.PI;
  camera.updateProjectionMatrix();
  ctx.uPointScale.value = H / (2 * Math.tan(camera.fov * Math.PI / 360));
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- loop
// let the fish and ripples settle in before the first frame is shown
let time = 0;
for (let i = 0; i < 420; i++) {
  time += 1 / 60; ctx.uTime.value = time;
  for (const u of ctx.updaters) u(1 / 60, time);
  ctx.water.step(1 / 60);
}
renderer.shadowMap.needsUpdate = true;

let last = performance.now(), frames = 0, slowAcc = 0, slowN = 0, started = last, shown = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000; last = now;
  const dt = Math.min(Math.max(raw, 0), 0.05);
  time += dt; ctx.uTime.value = time;
  for (const u of ctx.updaters) u(dt, time);
  ctx.water.step(dt);
  driftCamera(dt);
  camera.updateMatrixWorld();
  ctx.water.renderPasses(camera);
  finalPass.uniforms.uTime.value = time;
  // ease in from black once the first frames (and their shader compiles) are out of the way
  if (frames > 2) shown = Math.min(1, shown + dt / 1.4);
  finalPass.uniforms.uFade.value = shown * shown * (3 - 2 * shown);
  composer.render();
  if (frames++ === 2) renderer.shadowMap.needsUpdate = true;

  // gentle quality governor: if the machine cannot hold ~40 fps, render fewer pixels
  if (now - started > 4000 && raw < 0.25) {
    slowAcc += raw; slowN++;
    if (slowN >= 120) {
      if (slowAcc / slowN > 1 / 40 && quality > 0.62) { quality *= 0.85; resize(); }
      slowAcc = 0; slowN = 0;
    }
  }
}
// Compile every material up front (in parallel where the browser allows it) so the first
// visible frame is not held up by shader compilation one program at a time.
const begin = () => { last = started = performance.now(); requestAnimationFrame(frame); };
ctx.setPass('main');
renderer.setRenderTarget(ctx.water.refrRT);
const ready = renderer.compileAsync(scene, camera);
renderer.setRenderTarget(null);
ready.then(begin, begin);
