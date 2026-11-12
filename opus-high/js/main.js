import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { globals } from './util.js';
import { createSky, SUN_DIR, MOON_DIR } from './sky.js';
import { createTerrain, createPebbles } from './pond.js';
import { createRocks } from './rocks.js';
import { createWater, Ripples, WaterRenderer, MAX_WLIGHTS } from './water.js';
import { KoiSchool } from './koi.js';
import { createLilies, createGrass, createShrubs, createBackdrop, createMaple, FallingLeaves } from './plants.js';
import { Lanterns, createFireflies } from './lanterns.js';
import { createMist } from './mist.js';
import { DEBUG } from './debug.js';

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// Render at most ~1080p worth of pixels (plenty for full-screen video); adaptively lower if slow.
const PIXEL_BUDGET = 1920 * 1080 * 1.05;
function budgetRatio() {
  const css = Math.max(1, window.innerWidth * window.innerHeight);
  return Math.max(0.5, Math.min(window.devicePixelRatio || 1, Math.sqrt(PIXEL_BUDGET / css)));
}
let qualityScale = 1.0;
let pixelRatio = budgetRatio();
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const FOG_COLOR = new THREE.Color(0.045, 0.045, 0.085);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.022);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(-6.9, 3.9, 6.9);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0.4, 0.55, -0.4);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;
controls.minDistance = 3.5;
controls.maxDistance = 13;
controls.maxPolarAngle = 1.36;
controls.minPolarAngle = 0.25;
controls.enablePan = false;
controls.zoomSpeed = 0.6;
controls.rotateSpeed = 0.5;
controls.update();

// ---------- environment & lights ----------
const sky = createSky();
scene.add(sky);
{
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = createSky(true);
  envSky.scale.setScalar(0.1);
  envScene.add(envSky);
  const rt = pm.fromScene(envScene, 0.02, 0.1, 100);
  if (!DEBUG.noEnv) scene.environment = rt.texture;
  scene.environmentIntensity = 0.55;
  pm.dispose();
}
const moon = new THREE.DirectionalLight(new THREE.Color(0.55, 0.62, 0.95), 0.35);
moon.position.copy(MOON_DIR).multiplyScalar(20);
scene.add(moon);
const afterglow = new THREE.DirectionalLight(new THREE.Color(1.0, 0.45, 0.25), 0.45);
afterglow.position.copy(SUN_DIR).setY(0.15).multiplyScalar(20);
scene.add(afterglow);

// ---------- scene content ----------
const ripples = new Ripples();
const terrain = createTerrain();
scene.add(terrain);
const rocks = createRocks();
scene.add(rocks.group);
const pebbles = createPebbles(rocks.geos, rocks.material);
scene.add(pebbles);

const water = createWater(ripples);
scene.add(water.mesh);
const waterRT = new WaterRenderer(water.uniforms);

const koi = new KoiSchool(ripples);
scene.add(koi.group);

const lilies = createLilies();
scene.add(lilies.group);
const grass = createGrass(rocks.blockers);
scene.add(grass);
const shrubs = createShrubs();
scene.add(shrubs);
const backdrop = createBackdrop();
scene.add(backdrop);
const maple = createMaple();
scene.add(maple.group);
const falling = new FallingLeaves(maple, ripples);
scene.add(falling.mesh);

const lanterns = new Lanterns(scene, maple);
scene.add(lanterns.group);
scene.add(lanterns.floatGroup);
const fireflies = createFireflies();
scene.add(fireflies.points);
const mist = createMist();
scene.add(mist.mesh);

// pass visibility
const onlyMain = [water.mesh, lilies.padMesh];
const onlyRefr = [koi.group, pebbles];
const notRefr = [sky, grass, shrubs, backdrop, maple.group, lanterns.group, lanterns.floatGroup, fireflies.points, mist.mesh, falling.mesh, ...lilies.flowerMeshes];
function setPass(pass) {
  for (const o of onlyMain) o.visible = pass === 'main';
  for (const o of onlyRefr) o.visible = pass === 'refr';
  for (const o of notRefr) o.visible = pass !== 'refr';
  // floating leaves sit on the surface: keep them out of the mirror
  if (pass === 'refl') falling.mesh.visible = false;
}

// ---------- post-processing ----------
const size = new THREE.Vector2();
renderer.getDrawingBufferSize(size);
const composerRT = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, composerRT);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.42, 0.5, 0.95);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: globals.uTime, uRes: { value: new THREE.Vector2(size.x, size.y) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes;
    varying vec2 vUv;
    float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec2 q = vUv - 0.5;
      q.x *= uRes.x / uRes.y;
      float vig = smoothstep(1.15, 0.35, length(q));
      c *= mix(0.55, 1.0, vig);
      // gentle split tone: cool shadows, warm highlights
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c * vec3(0.94, 0.98, 1.06), c * vec3(1.04, 1.0, 0.95), smoothstep(0.1, 0.6, l));
      c += (h(gl_FragCoord.xy + fract(uTime * 13.7) * 100.0) - 0.5) / 255.0 * 1.5;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
composer.addPass(finalPass);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  pixelRatio = budgetRatio() * qualityScale;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  composer.setPixelRatio(pixelRatio);
  composer.setSize(w, h);
  renderer.getDrawingBufferSize(size);
  waterRT.setSize(size.x, size.y);
  finalPass.uniforms.uRes.value.set(size.x, size.y);
}
window.addEventListener('resize', resize);
resize();

// ---------- frame loop ----------
const clock = new THREE.Clock();
let t = 0;
let frames = 0, fpsTime = 0, adaptChecks = 0, lowWindows = 0;
const waterLightPos = water.uniforms.uLPos.value, waterLightCol = water.uniforms.uLCol.value;
water.uniforms.uMoonDir.value.copy(MOON_DIR);

function update(dt) {
  t += dt;
  globals.uTime.value = t;
  koi.update(dt, t);
  lilies.update(t);
  lanterns.update(dt, t);
  falling.update(dt, t, Lanterns.flow);
  mist.update(t);
  // ambient: occasional drip ripples (insects / droplets)
  if (Math.random() < dt * 0.25) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 3.5;
    ripples.add(Math.cos(a) * r, Math.sin(a) * r, t, 0.003 + Math.random() * 0.003);
  }
  for (let i = 0; i < MAX_WLIGHTS; i++) {
    const wl = lanterns.waterLights[i];
    if (wl) { waterLightPos[i].copy(wl.pos); waterLightCol[i].copy(wl.col); }
    else waterLightCol[i].set(0, 0, 0);
  }
}

function render() {
  camera.updateMatrixWorld();
  // 1. reflection
  setPass('refl');
  waterRT.updateMirror(camera);
  fireflies.uniforms.uScale.value = 7 * (waterRT.reflRT.height / 1080);
  renderer.setRenderTarget(waterRT.reflRT);
  renderer.clear();
  renderer.render(scene, waterRT.mirrorCam);
  // 2. refraction (underwater view + depth)
  setPass('refr');
  renderer.setRenderTarget(waterRT.refrRT);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  // 3. main
  setPass('main');
  fireflies.uniforms.uScale.value = 7 * (size.y / 1080);
  composer.render();
}

let errorsLogged = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  try {
    controls.update(dt);
    update(dt);
    render();
    for (let i = 1; i < (DEBUG.stress || 1); i++) render();
  } catch (e) {
    if (errorsLogged++ < 3) console.error(e);
  }
  // adaptive resolution: drop pixel ratio if we can't hold ~45 fps
  frames++; fpsTime += dt;
  if (fpsTime > 2.0) {
    const fps = frames / fpsTime;
    frames = 0; fpsTime = 0; adaptChecks++;
    lowWindows = fps < 40 ? lowWindows + 1 : 0;
    if (!DEBUG.noAdapt && adaptChecks > 1 && lowWindows >= 2 && qualityScale > 0.7) {
      qualityScale = Math.max(0.7, qualityScale - 0.1);
      lowWindows = 0;
      resize();
    }
  }
}
water.uniforms.uMode.value = DEBUG.waterMode;
if (DEBUG.noBloom) bloom.enabled = false;
if (DEBUG.cam) {
  camera.position.set(DEBUG.cam[0], DEBUG.cam[1], DEBUG.cam[2]);
  controls.target.set(DEBUG.cam[3], DEBUG.cam[4], DEBUG.cam[5]);
  controls.autoRotate = false;
  controls.update();
}
// warm up a few simulation steps so things aren't static on the first frame
for (let i = 0; i < 30 + (DEBUG.skip || 0) * 60; i++) update(1 / 60);
loop();
