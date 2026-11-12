import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { uTime, mulberry32, setLayers, pondSD, clamp, smoothstep } from './common.js';
import { createSky, SUN_DIR, FOG_COLOR } from './sky.js';
import { RippleSim, Water } from './water.js';
import { KoiSchool } from './koi.js';
import { createTerrain, createRocks, createGrass, createBamboo, createMaple, createShrubs, createFence } from './garden.js';
import { createLilies } from './lily.js';
import { createLanterns } from './lanterns.js';
import { createFireflies, createFallingLeaves } from './extras.js';

// ------------------------------------------------------------------ renderer
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.013);

const FOV = 50;
const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.2, 300);

// ------------------------------------------------------------------ sky + image based light
const sky = createSky();
setLayers(sky, { reflect: true });
scene.add(sky);
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(createSky());
  scene.environment = pmrem.fromScene(envScene, 0, 0.1, 100).texture;
  scene.environmentIntensity = 0.85;
  pmrem.dispose();
}

const glow = new THREE.DirectionalLight(new THREE.Color(1.0, 0.50, 0.28), 0.9);
glow.position.set(SUN_DIR.x, 0.30, SUN_DIR.z).multiplyScalar(40);
const fill = new THREE.DirectionalLight(new THREE.Color(0.36, 0.44, 0.85), 0.32);
fill.position.set(0.5, 1.0, 0.8).multiplyScalar(40);
scene.add(glow, fill);

// ------------------------------------------------------------------ world
const rng = mulberry32(12345);
const sim = new RippleSim(renderer, 640, 9.4);
const water = new Water(renderer, sim);
scene.add(water.mesh);

scene.add(createTerrain());
const lanterns = createLanterns(scene, sim);
const rocks = createRocks(mulberry32(101));
scene.add(rocks.group);
const maple = createMaple(mulberry32(7), -2.72, 0.95);
scene.add(maple.group);
const solid = rocks.footprints.concat([lanterns.stonePos, ...lanterns.posts, { x: maple.base.x, z: maple.base.z, r: 0.5 }]);
scene.add(createGrass(mulberry32(202), solid));
scene.add(createBamboo(mulberry32(303)));
scene.add(createFence());
scene.add(createShrubs(mulberry32(404), solid.map((s) => ({ x: s.x, z: s.z, r: s.r + 0.5 }))));
const lilies = createLilies(mulberry32(505), lanterns.keepOut);
scene.add(lilies.group);
const koi = new KoiSchool(scene, sim, 14);
const fireflies = createFireflies(rng, 80);
scene.add(fireflies.points);
const leaves = createFallingLeaves(maple, sim, 30);
scene.add(leaves.mesh);

scene.traverse((o) => { if (o.isLight) o.layers.enableAll(); });

// ------------------------------------------------------------------ post
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.42, 0.72, 0.92);
composer.addPass(bloom);
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uExposure: { value: 1.0 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uExposure; varying vec2 vUv;
    vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 color){
      const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      color = inM * (color / 0.6); color = RRTAndODTFit(color); color = outM * color;
      return clamp(color, 0.0, 1.0);
    }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec2 q = (vUv - 0.5) * vec2(1.0, 0.82);
      c *= mix(0.42, 1.0, 1.0 - smoothstep(0.22, 0.80, length(q)));
      c = aces(c * uExposure);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 1.10);
      c = mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      c += (n - 0.5) / 255.0;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
composer.addPass(finalPass);

// ------------------------------------------------------------------ camera rig
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 3.0;
controls.maxDistance = 12;
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = 1.50;
controls.rotateSpeed = 0.5;
controls.zoomSpeed = 0.6;
controls.target.set(-0.1, 0.9, -0.3);

const AZ0 = 0.20, AZ_RANGE = 1.25, AZ_SPEED = 0.021;
const PHI_MID = 1.225, PHI_AMP = 0.07, R_MID = 6.35, R_AMP = 0.35, R_SIDE = 1.5;
const phiAt = (t) => PHI_MID + PHI_AMP * Math.sin(t * Math.PI * 2 / 83 + 0.3);
// the pond is longer than it is deep: back off a little when looking along it
const radAt = (t, rel = 0) => R_MID + R_AMP * Math.sin(t * Math.PI * 2 / 127 + 2.2) + R_SIDE * Math.sin(rel) * Math.sin(rel);
const sph = new THREE.Spherical(radAt(0), phiAt(0), AZ0);
const offs = new THREE.Vector3();
camera.position.setFromSpherical(sph).add(controls.target);
camera.lookAt(controls.target);
let dragging = false, idleFor = 100, azDir = 1, azVel = AZ_SPEED;
// Development aid: a fixed close-up view, e.g. { r: 3.5, phi: 0.9, az: 0.2, target: [0, 0, 0] }. Must be null when shipped.
const DEBUG_VIEW = null;
const DEBUG_WARP = 0; // seconds of simulation to run before the first frame (0 when shipped)
if (DEBUG_VIEW) {
  const az = DEBUG_VIEW.az ?? AZ0;
  if (DEBUG_VIEW.target) controls.target.fromArray(DEBUG_VIEW.target);
  camera.position.setFromSpherical(new THREE.Spherical(DEBUG_VIEW.r ?? radAt(0, az - AZ0), DEBUG_VIEW.phi ?? phiAt(0), az)).add(controls.target);
  dragging = true;
}
controls.addEventListener('start', () => { dragging = true; });
controls.addEventListener('end', () => { dragging = false; idleFor = 0; });
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

function autoCamera(dt, t) {
  if (dragging) return;
  idleFor += dt;
  const ramp = smoothstep(1.0, 5.0, idleFor);
  if (ramp <= 0) return;
  offs.copy(camera.position).sub(controls.target);
  sph.setFromVector3(offs);
  const rel = angDiff(sph.theta, AZ0);
  if (rel > AZ_RANGE) azDir = -1; else if (rel < -AZ_RANGE) azDir = 1;
  azVel += (azDir * AZ_SPEED - azVel) * (1 - Math.exp(-dt / 3));
  sph.theta += azVel * dt * ramp;
  sph.phi += (phiAt(t) - sph.phi) * (1 - Math.exp(-dt * 0.07)) * ramp;
  sph.radius += (radAt(t, rel) - sph.radius) * (1 - Math.exp(-dt * 0.08)) * ramp;
  sph.makeSafe();
  camera.position.setFromSpherical(sph).add(controls.target);
}

// ------------------------------------------------------------------ sizing
let quality = 1;
const MAX_PIXELS = 2304 * 1296;
function resize() {
  const w = Math.max(window.innerWidth, 2), h = Math.max(window.innerHeight, 2);
  let pr = Math.min(window.devicePixelRatio || 1, 2);
  pr = Math.min(pr, Math.sqrt(MAX_PIXELS / (w * h))) * quality;
  const bw = Math.max(2, Math.round(w * pr)), bh = Math.max(2, Math.round(h * pr));
  renderer.setSize(bw, bh, false);
  composer.setPixelRatio(1);
  composer.setSize(bw, bh);
  water.setSize(bw, bh);
  camera.aspect = w / h;
  // keep the whole pond in view on narrow windows
  camera.fov = camera.aspect < 1.5 ? clamp(FOV * 1.5 / camera.aspect, FOV, 75) : FOV;
  camera.updateProjectionMatrix();
  fireflies.setScale(bh / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ loop
let last = performance.now(), time = 0, dropT = 1.5;
let fpsAcc = 0, fpsN = 0, warm = 0, maxQuality = 1, lastUp = -1e9, goodFor = 0;
const dropRng = mulberry32(777);

function stepWorld(dt) {
  time += dt;
  uTime.value = time;

  koi.update(dt, time);
  lanterns.update(time, dt);
  leaves.update(time, dt);

  // tiny random touches on the surface (insects, drips)
  dropT -= dt;
  if (dropT <= 0) {
    dropT = 0.7 + dropRng() * 2.6;
    const x = (dropRng() * 2 - 1) * 3.8, z = (dropRng() * 2 - 1) * 2.6;
    if (pondSD(x, z) < -0.2) sim.addDrop(x, z, 0.04 + dropRng() * 0.03, 0.025 + dropRng() * 0.05);
  }
  sim.update(dt);
}
for (let i = 0; i < DEBUG_WARP * 60; i++) stepWorld(1 / 60);

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000;
  last = now;
  const dt = clamp(rawDt, 0.001, 0.1);
  if (!(DEBUG_VIEW && DEBUG_VIEW.freeze)) stepWorld(dt);

  autoCamera(dt, time);
  controls.update();

  water.render(scene, camera);
  composer.render(dt);

  // step the resolution down if the machine cannot hold a smooth frame rate
  // (and carefully back up again if it later turns out there is room)
  warm += rawDt;
  if (warm > 4 && rawDt < 0.2 && document.visibilityState === 'visible') {
    fpsAcc += rawDt; fpsN++;
    if (fpsAcc > 2.5) {
      const fps = fpsN / fpsAcc;
      fpsAcc = 0; fpsN = 0;
      if (fps < 40 && quality > 0.55) {
        if (time - lastUp < 30) maxQuality = quality * 0.85;
        quality *= 0.85; goodFor = 0; warm = 2; resize();
      } else if (fps > 57) {
        goodFor += 2.5;
        if (goodFor > 12 && quality < maxQuality - 0.01) { quality = Math.min(maxQuality, quality / 0.85); lastUp = time; goodFor = 0; warm = 2; resize(); }
      } else goodFor = 0;
    }
  }
}
requestAnimationFrame(frame);
