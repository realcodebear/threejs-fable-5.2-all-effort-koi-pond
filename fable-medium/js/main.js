import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mulberry32, pondSD, shorePoint, FLOAT_SPOTS } from './common.js';
import { createWater } from './water.js';
import { createKoi } from './fish.js';
import { createLanterns } from './lanterns.js';
import {
  createSky, createTerrain, createStones, createLilies, createGrass, createShrubs,
  createMaple, createBamboo, createBackdrop, createFireflies, SUN_DIR, MOON_DIR,
} from './scenery.js';

const NEAR = 0.5, FAR = 900;
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.localClippingEnabled = false;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FOG = new THREE.Color().setRGB(0.085, 0.06, 0.13);
scene.fog = new THREE.FogExp2(FOG, 0.016);

const camera = new THREE.PerspectiveCamera(46, 1, NEAR, FAR);
camera.position.set(2.3, 4.0, 11.3);
const reflCam = new THREE.PerspectiveCamera(46, 1, NEAR, FAR);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0.4, 1.5, -0.2);
controls.enableDamping = true; controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.minDistance = 5.5; controls.maxDistance = 15;
controls.minPolarAngle = 0.45; controls.maxPolarAngle = 1.45;
controls.rotateSpeed = 0.5; controls.zoomSpeed = 0.6;
let interacting = false, lastInteract = -100;controls.addEventListener('start', () => { interacting = true; });
controls.addEventListener('end', () => { interacting = false; lastInteract = performance.now() / 1000; });
renderer.domElement.addEventListener('wheel', () => { lastInteract = performance.now() / 1000; }, { passive: true });

// ---------------------------------------------------------------- lights
const hemi = new THREE.HemisphereLight(new THREE.Color().setRGB(0.36, 0.34, 0.62), new THREE.Color().setRGB(0.10, 0.07, 0.07), 1.25);
scene.add(hemi);
const glow = new THREE.DirectionalLight(new THREE.Color().setRGB(1.0, 0.5, 0.3), 1.5);
glow.position.set(SUN_DIR.x * 30, 13, SUN_DIR.z * 30);
glow.castShadow = true;
glow.shadow.mapSize.set(2048, 2048);
Object.assign(glow.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 80 });
glow.shadow.bias = -0.0006; glow.shadow.normalBias = 0.04; glow.shadow.radius = 4;
scene.add(glow, glow.target);
const moon = new THREE.DirectionalLight(new THREE.Color().setRGB(0.45, 0.55, 1.0), 0.45);
moon.position.copy(MOON_DIR).multiplyScalar(30);
scene.add(moon);

// ---------------------------------------------------------------- scene content
const uTime = { value: 0 };
const above = new THREE.Group();     // everything that is never seen through the water
const shared = new THREE.Group();    // terrain + stones (seen above and below the surface)
const under = new THREE.Group();     // fish
scene.add(above, shared, under);

above.add(createSky(uTime));
const terrain = createTerrain();
shared.add(terrain.mesh, createStones());
above.add(terrain.outer);

const lilies = createLilies();
above.add(lilies.group);
const shrubs = createShrubs();
above.add(shrubs.group);

const [mx, mz] = shorePoint(-2.05, 1.5);
const maple = createMaple(uTime, mx, mz, new THREE.Vector3(-mx, 0, -mz).normalize());
above.add(maple.group, maple.fallen);
const [bx, bz] = shorePoint(-0.95, 2.0);
above.add(createBamboo(uTime, bx, bz));
above.add(createGrass(uTime, [...shrubs.spots, [mx, mz, 0.6], [bx, bz, 1.2]]));
above.add(createBackdrop());
const fireflies = createFireflies(uTime);
above.add(fireflies.points);

const lanterns = createLanterns(scene, above);
const koi = createKoi(13);
under.add(koi.group);

const water = createWater(renderer);
water.uniforms.uNear.value = NEAR; water.uniforms.uFar.value = FAR;
scene.add(water.mesh);

// ---------------------------------------------------------------- render targets + post
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1000);
renderer.clippingPlanes = [clipPlane];

const reflRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 2 });
const refrRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
refrRT.depthTexture = new THREE.DepthTexture(4, 4);
water.uniforms.tRefl.value = reflRT.texture;
water.uniforms.tRefr.value = refrRT.texture;
water.uniforms.tDepth.value = refrRT.depthTexture;

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.62, 0.75, 0.9);
composer.addPass(bloom);
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = vUv - 0.5;
      float v = smoothstep(0.92, 0.28, length(q * vec2(1.0, 0.82)));
      c.rgb *= mix(0.42, 1.0, v);
      gl_FragColor = c;
    }`,
}));
composer.addPass(new OutputPass());

const bufSize = new THREE.Vector2();
let quality = 1;   // lowered automatically if the frame rate is poor
function resize() {
  const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  // cap the internal resolution at roughly 2560x1440 worth of pixels
  const pr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt((2560 * 1440) / (w * h))) * quality;
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h);
  composer.setPixelRatio(pr);
  composer.setSize(w, h);
  renderer.getDrawingBufferSize(bufSize);
  reflRT.setSize(Math.ceil(bufSize.x * 0.5), Math.ceil(bufSize.y * 0.5));
  refrRT.setSize(bufSize.x, bufSize.y);
  water.uniforms.uRes.value.copy(bufSize);
  camera.aspect = reflCam.aspect = w / h;
  // keep the pond framed on narrow windows
  camera.fov = reflCam.fov = w / h < 1.4 ? 46 * Math.min(1.6, 1.4 / (w / h)) : 46;
  camera.updateProjectionMatrix(); reflCam.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- frame loop
const rng = mulberry32(5);
const clock = new THREE.Clock();
const fwd = new THREE.Vector3(), tgt = new THREE.Vector3(), off = new THREE.Vector3(), sph = new THREE.Spherical();
const vp = new THREE.Matrix4();
let dropT = 1.0, time = 0;
const AZ_MIN = -1.15, AZ_MAX = 1.15;
let sweepDir = -1, sweepVel = 0;

function randomDrop() {
  for (let k = 0; k < 20; k++) {
    const x = (rng() * 2 - 1) * 7, z = (rng() * 2 - 1) * 5;
    if (pondSD(x, z) < -0.5) { water.addDrop(x, z, 0.09 + rng() * 0.05, -(0.05 + rng() * 0.06)); return; }
  }
}

// pre-warm the ripple field so the first frame is already alive
for (let i = 0; i < 6; i++) randomDrop();
for (let i = 0; i < 90; i++) { if (i % 12 === 0) randomDrop(); water.step(1 / 60); }

let fpsT = 0, fpsN = 0, slow = 0;
function renderFrame() {
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  time += dt; uTime.value = time;

  // safety net: if we stay under ~40 fps, render at a lower internal resolution
  if (time > 3 && rawDt < 0.5) {
    fpsT += rawDt; fpsN++;
    if (fpsT > 1.5) {
      slow = fpsN / fpsT < 40 ? slow + 1 : 0;
      fpsT = 0; fpsN = 0;
      if (slow >= 2 && quality > 0.55) { quality *= 0.85; slow = 0; resize(); }
    }
  }

  koi.update(dt, time, water.addDrop);
  lanterns.update(dt, time, water.addDrop);
  dropT -= dt;
  if (dropT < 0) { dropT = 0.7 + rng() * 2.2; randomDrop(); }
  water.step(dt);
  water.uniforms.uTime.value = time;

  // slow breathing of camera height / distance when the viewer is not steering
  const now = performance.now() / 1000;
  if (!interacting && now - lastInteract > 2.5) {
    off.copy(camera.position).sub(controls.target); sph.setFromVector3(off);
    const phiT = 1.345 + 0.06 * Math.sin(time * 0.045), rT = 12.0 + 0.7 * Math.sin(time * 0.031 + 1.0);
    const k = Math.min(1, dt * 0.12);
    sph.phi += (phiT - sph.phi) * k; sph.radius += (rT - sph.radius) * k;
    // slow sweep back and forth across the front of the pond (the tree and bamboo stay behind it)
    if (sph.theta > AZ_MAX) sweepDir = -1; else if (sph.theta < AZ_MIN) sweepDir = 1;
    const edge = Math.min(sph.theta - AZ_MIN, AZ_MAX - sph.theta);
    const ease = edge < 0 ? 3.0 : 0.12 + 0.88 * Math.min(1, edge / 0.3);
    sweepVel += (sweepDir * 0.036 * ease - sweepVel) * Math.min(1, dt * 0.8);
    sph.theta += sweepVel * dt;
    off.setFromSpherical(sph); camera.position.copy(controls.target).add(off);
  }
  controls.update();
  camera.updateMatrixWorld();

  // --- pass 1: what is under the surface (terrain, stones, fish) + depth
  above.visible = false; under.visible = true; water.mesh.visible = false;
  clipPlane.constant = 1000;
  renderer.setRenderTarget(refrRT);
  renderer.setClearColor(0x020807, 1);
  renderer.render(scene, camera);

  // --- pass 2: mirrored view for reflections
  above.visible = true; under.visible = false;
  camera.getWorldDirection(fwd);
  reflCam.position.set(camera.position.x, -camera.position.y, camera.position.z);
  tgt.set(camera.position.x + fwd.x, -camera.position.y - fwd.y, camera.position.z + fwd.z);
  reflCam.up.set(0, 1, 0); reflCam.lookAt(tgt); reflCam.updateMatrixWorld();
  clipPlane.constant = 0.03;
  fireflies.uniforms.uScale.value = bufSize.y * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * 0.5;
  renderer.setRenderTarget(reflRT);
  renderer.setClearColor(FOG, 1);
  renderer.render(scene, reflCam);
  clipPlane.constant = 1000;

  // --- pass 3: final view
  fireflies.uniforms.uScale.value *= 2;
  water.mesh.visible = true;
  vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  water.uniforms.uVP.value.copy(vp);
  renderer.setRenderTarget(null);
  composer.render(dt);
}

// one full render with everything visible so the (static) shadow map is built once
renderer.shadowMap.needsUpdate = true;
under.visible = false;
renderer.setRenderTarget(refrRT); renderer.render(scene, camera); renderer.setRenderTarget(null);
renderer.setAnimationLoop(renderFrame);
