// Koi pond at dusk — scene assembly, camera and the frame loop.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { uTime, groundHeight, clamp, sdf, makeRng } from './common.js';
import { createSky, createEnvironment, MOON_DIR, HAZE_COLOR } from './sky.js';
import { Post } from './post.js';
import { Water } from './water.js';
import { createTerrain } from './terrain.js';
import { createStones } from './stones.js';
import { KoiSchool } from './koi.js';
import { Lanterns } from './lanterns.js';
import { Lilies } from './lilies.js';
import { createFlora } from './flora.js';
import { Maple, MAPLE_BASE } from './tree.js';
import { createFireflies, uPointScale } from './particles.js';
import { lightUniforms, computeAmbientCube, bakeGroundLight, SKY_GAIN, KEY_DIR, KEY_COLOR, KEY_INTENSITY } from './lighting.js';
import { DEBUG } from './debug.js';

if (DEBUG.warnings) console.warn = (...a) => console.error('WARN:', ...a);

// Make sure script failures always show up in the console.
window.addEventListener('error', (e) => console.error('Uncaught:', e.message, (e.filename || '') + ':' + (e.lineno || 0)));
window.addEventListener('unhandledrejection', (e) => console.error('Unhandled rejection:', e.reason));

// ---------------------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: false, alpha: false, depth: false, stencil: false,
  powerPreference: 'high-performance',
});
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x000000, 1);

// Internal resolution: native up to a pixel budget, so that high-dpi screens stay smooth.
const MAX_PIXELS = 2304 * 1296;
let qualityScale = 1.0;                 // lowered automatically if the frame rate is too low
function renderPixelRatio() {
  const w = window.innerWidth, h = window.innerHeight;
  let pr = Math.min(window.devicePixelRatio || 1, 2);
  if (w * h * pr * pr > MAX_PIXELS) pr = Math.sqrt(MAX_PIXELS / (w * h));
  return pr * qualityScale;
}

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(HAZE_COLOR, lightUniforms.uFogDensity.value);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
const TARGET = new THREE.Vector3(0.0, 0.5, -1.0);
camera.position.set(1.2, 2.2, 7.8);
camera.lookAt(TARGET);

// ---------------------------------------------------------------------------------------
// Pass visibility: which objects appear in the reflection / refraction / main renders,
// and which ones cast shadows in the one-time ground light bake
// ---------------------------------------------------------------------------------------
const passObjects = [];
function register(obj, { main = true, refl = true, refr = false, shadow = false } = {}) {
  passObjects.push({ obj, main, refl, refr, shadow });
  scene.add(obj);
  return obj;
}
function setPass(name) {
  for (const p of passObjects) p.obj.visible = p[name];
}

// ---------------------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------------------
scene.environment = createEnvironment(renderer);
scene.environmentIntensity = SKY_GAIN;
computeAmbientCube(renderer);

// the afterglow: a soft warm light from where the sun went down
const keyLight = new THREE.DirectionalLight(KEY_COLOR, KEY_INTENSITY);
keyLight.position.copy(KEY_DIR).multiplyScalar(40);
scene.add(keyLight, keyLight.target);

// ---------------------------------------------------------------------------------------
// Scene content
// ---------------------------------------------------------------------------------------
const sky = createSky();
register(sky.mesh, { refl: true });

const terrain = createTerrain();
register(terrain.land, { main: true, refl: true, refr: false, shadow: true });
register(terrain.shore, { main: true, refl: true, refr: true, shadow: true });
register(terrain.bed, { main: false, refl: false, refr: true, shadow: true });

const stones = createStones();
register(stones.group, { refl: true, refr: true, shadow: true });

const water = new Water(renderer);
water.uniforms.uMoonDir.value.copy(MOON_DIR);
stones.material.clippingPlanes = [water.clipPlane];
register(water.mesh, { refl: false, refr: false });

const koi = new KoiSchool(water);
register(koi.group, { main: !!DEBUG.koiInspect, refl: false, refr: true });

const lanterns = new Lanterns({ stoneMaterial: stones.material, water });
register(lanterns.group, { refl: true, refr: false, shadow: true });
register(lanterns.floatGroup, { refl: true, refr: true, shadow: false });
scene.add(lanterns.lightGroup);

const lilies = new Lilies(water, lanterns.items.filter((it) => it.type === 'float').map((it) => ({ x: it.x, z: it.z, r: 0.68 })));
register(lilies.group, { refl: false });
register(lilies.flowerGroup, { refl: true });

const flora = createFlora({
  stones: stones.stones,
  keepOut: [
    { x: Lanterns.STONE_POS.x, z: Lanterns.STONE_POS.z, r: 0.7 },
    { x: -3.55, z: 1.75, r: 0.3 },
    { x: MAPLE_BASE.x, z: MAPLE_BASE.z, r: 0.5 },
  ],
});
register(flora.group, { refl: true, shadow: true });
lilies.addIris(flora.irisFlowers);

const maple = new Maple({ hook: Lanterns.BRANCH_HOOK, water });
register(maple.group, { refl: true, shadow: true });
register(maple.fallGroup, { refl: true });

const fireflies = createFireflies();
register(fireflies, { refl: true });

// ---------------------------------------------------------------------------------------
// One-time bake of sky light and soft shadows onto the ground
// ---------------------------------------------------------------------------------------
bakeGroundLight({ renderer, scene, receivers: [terrain.land, terrain.shore, terrain.bed], setPass });
setPass('main');

// ---------------------------------------------------------------------------------------
// Post-processing and sizing
// ---------------------------------------------------------------------------------------
const post = new Post(renderer, 16, 16);

function resize() {
  const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  const pr = renderPixelRatio();
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  const bw = renderer.domElement.width, bh = renderer.domElement.height;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  post.setSize(bw, bh);
  water.setSize(bw, bh);
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------------------
// Camera: slow automatic orbit; drag to orbit, scroll to zoom, then the drift resumes
// ---------------------------------------------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 0.7;
controls.minDistance = 2.6;
controls.maxDistance = 11;
controls.minPolarAngle = 0.22;
controls.maxPolarAngle = 1.50;
if (DEBUG.orbit) {
  const o = new THREE.Vector3().copy(camera.position).sub(TARGET);
  o.applyAxisAngle(new THREE.Vector3(0, 1, 0), DEBUG.orbit);
  camera.position.copy(TARGET).add(o);
}
controls.update();

const auto = { weight: 1, idle: 10, interacting: false, lastPhi: 0, lastScale: 1, t: 0 };
controls.addEventListener('start', () => {
  // take over exactly where the camera is: the automatic offsets become part of the view
  auto.interacting = true;
  auto.weight = 0; auto.lastPhi = 0; auto.lastScale = 1;
});
controls.addEventListener('end', () => { auto.interacting = false; auto.idle = 0; });
renderer.domElement.addEventListener('wheel', () => { auto.idle = 0; }, { passive: true });

// The mouse pointer disappears when it rests, so that nothing sits on top of the picture.
let cursorTimer = 0;
function wakeCursor() {
  canvas.classList.remove('idle');
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => canvas.classList.add('idle'), 2500);
}
canvas.addEventListener('pointermove', wakeCursor);
canvas.addEventListener('pointerdown', wakeCursor);
wakeCursor();

const sph = new THREE.Spherical();
const off = new THREE.Vector3();
function updateCamera(dt) {
  if (DEBUG.cam) {
    camera.position.set(DEBUG.cam[0], DEBUG.cam[1], DEBUG.cam[2]);
    camera.lookAt(DEBUG.cam[3], DEBUG.cam[4], DEBUG.cam[5]);
    return;
  }
  auto.idle += dt;
  const want = (!auto.interacting && auto.idle > 1.2 && !DEBUG.noAuto) ? 1 : 0;
  // ease the automatic motion in and out
  auto.weight += (want - auto.weight) * (1 - Math.exp(-dt * (want ? 0.9 : 6.0)));
  auto.t += dt * auto.weight;

  off.copy(camera.position).sub(controls.target);
  sph.setFromVector3(off);
  // remove last frame's breathing offset to get back the base orbit
  sph.phi -= auto.lastPhi;
  sph.radius /= auto.lastScale;
  sph.theta += dt * auto.weight * (Math.PI * 2 / 210);
  // gentle breathing, and a slightly higher, closer path beside the pond than along its length
  const side = Math.sin(sph.theta) * Math.sin(sph.theta);
  // (the view starts a touch high, sinks towards the water over the first half minute, rises again...)
  auto.lastPhi = auto.weight * (0.050 * Math.sin((auto.t - 6) * (Math.PI * 2 / 70)) + 0.012 * Math.sin(auto.t * (Math.PI * 2 / 23) + 1.3) - 0.10 * side);
  auto.lastScale = 1 + auto.weight * (0.05 * Math.sin(auto.t * (Math.PI * 2 / 71) + 0.6) - 0.09 * side);
  sph.phi = clamp(sph.phi + auto.lastPhi, controls.minPolarAngle, controls.maxPolarAngle);
  sph.radius = clamp(sph.radius * auto.lastScale, controls.minDistance, controls.maxDistance);
  off.setFromSpherical(sph);
  camera.position.copy(controls.target).add(off);
  controls.update();
  // never dip below the ground
  const gy = Math.max(groundHeight(camera.position.x, camera.position.z), 0) + 0.35;
  if (camera.position.y < gy) camera.position.y = gy;
}

// ---------------------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------------------
const clock = new THREE.Clock();
let time = 0;
let fade = 0;

const dropRng = makeRng(99);
let dropTimer = 2;
function simulate(dt) {
  time += dt;
  uTime.value = time;
  koi.update(dt, time);
  lanterns.update(dt, time);
  maple.update(dt, time);
  // now and then something small touches the surface: an insect, a drop from a leaf
  dropTimer -= dt;
  if (dropTimer <= 0) {
    dropTimer = dropRng.range(0.6, 2.2);
    const x = dropRng.range(-2.8, 3.3), z = dropRng.range(-4.6, 4.3);
    if (sdf(x, z) > 0.3) water.addDrop(x, z, 0.028, dropRng.range(0.0007, 0.0015), 3.2, 0.55);
  }
  if (DEBUG.koiInspect) {
    const spots = [[-0.7, 0.62, 0.35, 1.2], [0.25, 0.62, -0.45, 1.9], [0.55, 0.62, 0.55, 0.3], [-0.2, 0.62, 1.0, -0.6]];
    const pick = DEBUG.koiPick || [0, 2, 4, 1];
    spots.forEach((s, i) => {
      const f = koi.fish[pick[i]];
      f.mesh.position.set(s[0], s[1], s[2]);
      f.mesh.rotation.set(0, s[3], 0);
      f.mesh.renderOrder = 20;
    });
  }
  if (!DEBUG.skipSim) water.update(dt);
}

function renderFrame() {
  camera.updateMatrixWorld();
  const pxPerUnit = 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  setPass('refl');
  uPointScale.value = water.reflTarget.height * pxPerUnit;
  if (!DEBUG.skipRefl) water.renderReflection(scene, camera);
  setPass('refr');
  if (!DEBUG.skipRefr) water.renderRefraction(scene, camera);
  water.endPasses();
  setPass('main');
  uPointScale.value = post.height * pxPerUnit;
  renderer.setRenderTarget(post.sceneTarget);
  if (!DEBUG.skipMain) renderer.render(scene, camera);
  post.render(time, fade, DEBUG.skipBloom);
}

// Frame-rate watchdog: if the page cannot hold a smooth rate, lower the internal resolution.
// If lowering it does not help (the browser itself is limiting the frame rate, e.g. an energy
// saver mode), the change is undone and the watchdog retires.
const perf = { t0: 0, frames: 0, slow: 0, settled: 0, skip: 0, trial: null, done: false };
function watchPerformance(now) {
  if (perf.t0 === 0 || now - perf.t0 > 4000) { perf.t0 = now; perf.frames = 0; return; }   // (also restarts after a pause)
  perf.frames++;
  const span = now - perf.t0;
  if (span < 1500) return;
  const fps = perf.frames * 1000 / span;
  perf.t0 = now; perf.frames = 0;
  perf.settled++;
  if (DEBUG.log) console.error('fps', fps.toFixed(1), 'scale', qualityScale.toFixed(2), renderer.domElement.width + 'x' + renderer.domElement.height);
  if (perf.settled < 3 || perf.done || DEBUG.noAdapt) return;        // ignore start-up hitches
  if (perf.skip > 0) { perf.skip--; return; }                         // let a change settle first
  if (perf.trial) {
    if (fps < perf.trial.fps * 1.08) {
      qualityScale = perf.trial.scale;
      perf.done = true;
      resize();
      return;
    }
    perf.trial = null;
  }
  if (fps < 44) perf.slow++; else perf.slow = 0;
  if (perf.slow >= 2 && qualityScale > 0.56) {
    perf.trial = { fps, scale: qualityScale };
    qualityScale = Math.max(0.55, qualityScale * (fps < 30 ? 0.75 : 0.87));
    perf.slow = 0;
    perf.skip = 1;
    resize();
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (document.hidden) return;
  fade = Math.min(1, fade + dt / 1.4);
  const c0 = performance.now();
  updateCamera(dt);
  simulate(dt);
  const c1 = performance.now();
  for (let i = 0; i < (DEBUG.stress || 1); i++) renderFrame();
  if (DEBUG.log) {
    cpu.sim += c1 - c0; cpu.render += performance.now() - c1; cpu.n++;
    if (cpu.n === 120) {
      const info = renderer.info;
      console.error('cpu ms: sim ' + (cpu.sim / cpu.n).toFixed(2) + ', render ' + (cpu.render / cpu.n / (DEBUG.stress || 1)).toFixed(2) + ' per frame; programs ' + info.programs.length + ', geometries ' + info.memory.geometries + ', textures ' + info.memory.textures);
      cpu.sim = cpu.render = cpu.n = 0;
    }
  }
  watchPerformance(now);
}
const cpu = { sim: 0, render: 0, n: 0 };

// Run the simulation for a few seconds before the first frame, so that the pond is already
// alive (ripples spreading, koi on their way) when the picture fades in.
{
  const n = Math.round((6 + (DEBUG.timeSkip || 0)) * 30);
  for (let i = 0; i < n; i++) simulate(1 / 30);
  clock.getDelta();
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------------------------------
// Development test: simulate a drag and a wheel zoom, and log how the camera responds
// ---------------------------------------------------------------------------------------
if (DEBUG.testInput) {
  canvas.setPointerCapture = () => {};
  canvas.releasePointerCapture = () => {};
  const state = () => {
    const o = new THREE.Vector3().copy(camera.position).sub(controls.target);
    const s = new THREE.Spherical().setFromVector3(o);
    return 'theta ' + s.theta.toFixed(3) + ' phi ' + s.phi.toFixed(3) + ' r ' + s.radius.toFixed(2) + ' auto ' + auto.weight.toFixed(2);
  };
  const ev = (type, x, y, extra = {}) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, ...extra }));
  const log = (label) => console.error('[input test] ' + label + ': ' + state());
  setTimeout(() => { log('before drag'); ev('pointerdown', 800, 500); }, 2000);
  for (let i = 1; i <= 10; i++) setTimeout(() => ev('pointermove', 800 + i * 20, 500 - i * 4), 2000 + i * 50);
  setTimeout(() => { ev('pointerup', 1000, 460, { buttons: 0 }); log('drag released'); }, 2600);
  setTimeout(() => log('0.6 s after release'), 3200);
  setTimeout(() => { canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, clientX: 900, clientY: 500, bubbles: true, cancelable: true })); }, 3400);
  setTimeout(() => log('after wheel zoom'), 4200);
  for (let i = 0; i < 8; i++) setTimeout(() => log('t=' + (5 + i * 0.75).toFixed(2)), 5000 + i * 750);
}

// ---------------------------------------------------------------------------------------
// Development benchmark: measure the frame rate with parts of the frame switched off
// ---------------------------------------------------------------------------------------
if (DEBUG.bench) {
  const named = (n) => passObjects.find((p) => p.obj.name === n || p.obj === n);
  const hide = (...names) => {
    const saved = names.map((n) => { const p = named(n); const s = { ...p }; p.main = p.refl = p.refr = false; return [p, s]; });
    return () => saved.forEach(([p, s]) => Object.assign(p, s));
  };
  const flag = (k) => { DEBUG[k] = true; return () => { DEBUG[k] = false; }; };
  const configs = [
    ['baseline', () => () => {}],
    ['no sim', () => flag('skipSim')],
    ['no refl', () => flag('skipRefl')],
    ['no refr', () => flag('skipRefr')],
    ['no bloom', () => flag('skipBloom')],
    ['no terrain', () => hide('terrain-land', 'terrain-shore', 'terrain-bed')],
    ['no stones', () => hide('stones')],
    ['no water', () => hide('water')],
    ['no sky', () => hide('sky')],
    ['no koi', () => hide('koi')],
    ['no lanterns', () => hide('lanterns', 'floating-lanterns')],
    ['no lilies', () => hide(lilies.group, lilies.flowerGroup)],
    ['no main', () => flag('skipMain')],
    ['no msaa', () => { post.sceneTarget.samples = 0; post.sceneTarget.dispose(); return () => { post.sceneTarget.samples = 4; post.sceneTarget.dispose(); }; }],
    ...(DEBUG.benchExtra || []).map(([label, names]) => [label, () => hide(...names)]),
  ].filter((c) => !DEBUG.benchOnly || DEBUG.benchOnly.includes(c[0]));
  let ci = -1, undo = null, t0 = 0, n = 0, tFirst = 0;
  const out = [];
  const tick = (now) => {
    if (ci < 0 || now - t0 > 2300) {
      if (ci >= 0) { out.push(configs[ci][0] + ': ' + ((n - 1) * 1000 / (now - tFirst)).toFixed(1)); undo(); }
      ci++;
      if (ci >= configs.length) { console.error('BENCH (stress ' + DEBUG.stress + ') fps -> ' + out.join(' | ')); return; }
      undo = configs[ci][1]();
      t0 = now; n = 0;
    }
    if (now - t0 > 500) { if (n === 0) tFirst = now; n++; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
