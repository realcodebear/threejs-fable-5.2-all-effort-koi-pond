import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- helpers
let _seed = 20261111;
function rand() {
  _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rr = (a, b) => a + (b - a) * rand();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
function hash3(x, y, z) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const c = (a, b, d) => hash3(ix + a, iy + b, iz + d);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), fx), lerp(c(0, 1, 0), c(1, 1, 0), fx), fy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), fx), lerp(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
}
function fbm(x, y, z, o = 4) {
  let s = 0, a = 0.5;
  for (let i = 0; i < o; i++) { s += a * noise3(x, y, z); x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; }
  return s;
}
// pond outline (polar). The same formula is used in the water shader.
function pondR(th) {
  return 5.5 + 0.7 * Math.sin(2 * th + 1.0) + 0.4 * Math.sin(3 * th + 2.3) + 0.25 * Math.sin(5 * th + 0.7);
}
const shorePoint = (th, off = 0) => { const r = pondR(th) + off; return new THREE.Vector3(Math.cos(th) * r, 0, Math.sin(th) * r); };
function groundH(x, z) {
  const r = Math.hypot(x, z), d = r - pondR(Math.atan2(z, x));
  if (d < 0) return -1.25 * (1 - Math.exp(d * 1.3));
  return 0.3 * (1 - Math.exp(-d * 2.5)) + smooth(1.5, 8, d) * fbm(x * 0.15, 0, z * 0.15) * 0.9 + smooth(16, 55, d) * 1.2;
}

const GLSL_NOISE = /* glsl */`
float hash31(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm3(vec3 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
`;

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FOG = new THREE.Color(0.11, 0.075, 0.16);
scene.fog = new THREE.FogExp2(FOG, 0.02);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(3.4, 4.0, 11.8);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.9, -0.4);
controls.enableDamping = true; controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.minDistance = 5; controls.maxDistance = 22;
controls.minPolarAngle = 0.35; controls.maxPolarAngle = 1.44;
controls.autoRotate = true; controls.autoRotateSpeed = 0.42;
controls.update();
// the automatic camera sweeps slowly back and forth around the starting view
const HOME_AZ = controls.getAzimuthalAngle() - 0.25, SWEEP = 0.8, CAM_SPEED = 0.42;
let camDir = 1;
function updateCamera(dt) {
  let d = controls.getAzimuthalAngle() - HOME_AZ;
  while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  if (d > SWEEP) camDir = 1; else if (d < -SWEEP) camDir = -1;   // positive speed lowers the azimuth
  controls.autoRotateSpeed += (camDir * CAM_SPEED - controls.autoRotateSpeed) * Math.min(1, dt * 0.6);
  controls.update(dt);
}

const uTime = { value: 0 };

// ---------------------------------------------------------------- sky
const SUN_DIR = new THREE.Vector3(-0.35, -0.06, -1).normalize();
{
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime, uSun: { value: SUN_DIR } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: GLSL_NOISE + /* glsl */`
      varying vec3 vDir; uniform float uTime; uniform vec3 uSun;
      void main(){
        vec3 d = normalize(vDir); float h = d.y; float hh = max(h, 0.0);
        float sunAmt = pow(max(dot(normalize(d.xz), normalize(uSun.xz)), 0.0), 2.2);
        float side = 0.5 + 0.5*dot(normalize(d.xz), normalize(uSun.xz));
        vec3 zen = vec3(0.012, 0.02, 0.075);
        vec3 mid = mix(vec3(0.07,0.07,0.24), vec3(0.20,0.10,0.34), side);
        vec3 hor = mix(vec3(0.20,0.13,0.32), vec3(1.7,0.60,0.20), sunAmt);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.30, hh));
        c = mix(c, zen, smoothstep(0.18, 0.85, hh));
        c += vec3(1.0,0.22,0.32)*sunAmt*exp(-pow((hh-0.17)/0.11, 2.0))*0.40;
        // stars
        vec3 sp = d*110.0; vec3 id = floor(sp); float r = hash31(id);
        float star = step(0.985, r)*smoothstep(0.30, 0.0, length(fract(sp)-0.5));
        star *= 0.6 + 0.4*sin(uTime*(1.0+r*3.0) + r*100.0);
        // clouds: long streaks lit from below by the afterglow
        float cl = fbm3(vec3(d.x*2.2, h*13.0, d.z*2.2) + vec3(uTime*0.004, 0.0, 3.0));
        float cm = smoothstep(0.50, 0.72, cl)*smoothstep(0.03, 0.12, hh)*smoothstep(0.65, 0.25, hh);
        vec3 cc = mix(vec3(0.10,0.07,0.18), vec3(1.5,0.48,0.30), sunAmt*smoothstep(0.40, 0.05, hh));
        c += vec3(1.3,1.25,1.1)*star*smoothstep(0.08, 0.45, h)*(1.0-cm)*1.3;
        c = mix(c, cc, cm*0.8);
        // crescent moon
        vec3 mD = normalize(vec3(0.30, 0.27, -1.0));
        float md = distance(d, mD);
        float disc = smoothstep(0.030, 0.027, md);
        float cut = smoothstep(0.031, 0.026, distance(d, normalize(mD + vec3(0.013, 0.009, 0.0))));
        c += vec3(3.0,2.7,2.1)*disc*(1.0-cut)*(1.0-cm*0.7);
        c += vec3(0.5,0.45,0.6)*exp(-md*16.0)*0.22;
        // distant hills
        float az = atan(d.z, d.x);
        float hill = 0.05 + 0.03*sin(az*3.0+1.0) + 0.016*sin(az*7.0+2.0) + 0.008*sin(az*17.0+0.5) + 0.004*sin(az*41.0);
        vec3 hc = mix(vec3(0.035,0.03,0.07), hor*0.22, 0.45);
        c = mix(c, hc, smoothstep(hill+0.004, hill, h));
        float hill2 = hill*0.55 + 0.012*sin(az*11.0+4.0);
        c = mix(c, vec3(0.022,0.02,0.045), smoothstep(hill2+0.004, hill2, h));
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);
}

// ---------------------------------------------------------------- lights
scene.add(new THREE.HemisphereLight(0x6a6ab8, 0x2a1c1a, 1.25));
const sunLight = new THREE.DirectionalLight(0xff8850, 1.1);
sunLight.position.copy(SUN_DIR).multiplyScalar(-1).setY(0.28);
scene.add(sunLight);
const moonLight = new THREE.DirectionalLight(0x8090ff, 0.35);
moonLight.position.set(0.5, 1, 0.6);
scene.add(moonLight);

// wind sway injected into standard materials (instanced foliage)
function addWind(mat, amp, freq = 1.5) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = uTime;
    s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
        float wph = uTime*${freq.toFixed(2)} + ip.x*0.7 + ip.z*0.9;
        float wk = ${amp.toFixed(3)} * max(position.y, 0.0);
        transformed.x += sin(wph)*wk + sin(wph*2.3+ip.x)*wk*0.4;
        transformed.z += cos(wph*0.8)*wk*0.6;
      #endif`);
  };
}

// ---------------------------------------------------------------- ground
{
  const RINGS = 130, SEG = 220, pos = [], col = [], idx = [];
  const c = new THREE.Color();
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS, r = 70 * t * t;
    for (let j = 0; j < SEG; j++) {
      const th = j / SEG * Math.PI * 2, x = Math.cos(th) * r, z = Math.sin(th) * r;
      const d = r - pondR(th);
      pos.push(x, groundH(x, z), z);
      const n = fbm(x * 0.6, 3, z * 0.6), n2 = fbm(x * 2.5, 9, z * 2.5);
      if (d < 0.12) {
        const k = Math.exp(d * 0.9);
        c.setRGB(lerp(0.012, 0.11, k), lerp(0.03, 0.10, k), lerp(0.035, 0.07, k)).multiplyScalar(0.6 + 0.8 * n2);
      } else {
        c.setRGB(lerp(0.035, 0.085, n), lerp(0.085, 0.13, n), lerp(0.03, 0.04, n));
        const soil = smooth(0.9, 0.15, d) * 0.85 + smooth(0.55, 0.7, n2) * 0.25;
        c.lerp(new THREE.Color(0.075, 0.06, 0.045), clamp(soil, 0, 1));
        c.multiplyScalar(0.75 + 0.5 * n2);
      }
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEG; j++) {
    const a = i * SEG + j, b = i * SEG + (j + 1) % SEG, cc = a + SEG, d = b + SEG;
    idx.push(a, cc, b, b, cc, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  // make sure normals face up
  if (g.attributes.normal.getY(SEG * 100) < 0) { g.index.array.reverse(); g.computeVertexNormals(); }
  scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })));
}

// ---------------------------------------------------------------- stones
const ISLAND = { x: -1.9, z: 0.9, r: 0.95 };
{
  const variants = [];
  for (let v = 0; v < 5; v++) {
    let g = new THREE.IcosahedronGeometry(1, 4);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-4);
    const p = g.attributes.position, s = v * 13.7;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 0.62 + 0.6 * fbm(x * 0.9 + s, y * 0.9, z * 0.9, 3) + 0.06 * noise3(x * 5 + s, y * 5, z * 5);
      x *= k; y *= k * 0.68; z *= k;
      if (y < -0.35) y = -0.35 + (y + 0.35) * 0.3;
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    const n = g.attributes.normal, col = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const tone = 0.75 + 0.5 * fbm(x * 3 + s, y * 3, z * 3, 3);
      const moss = smooth(0.55, 0.85, n.getY(i) * 0.7 + fbm(x * 2 + s, y * 2 + 5, z * 2, 3) * 0.75);
      col.push(lerp(tone, 0.42, moss), lerp(tone, 0.78, moss), lerp(tone, 0.30, moss));
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    variants.push(g);
  }
  const list = [];
  let th = 0;
  while (th < Math.PI * 2 - 0.04) {
    const s = rr(0.26, 0.62) * (rand() < 0.12 ? 1.5 : 1);
    const p = shorePoint(th, rr(-0.12, 0.3));
    list.push({ x: p.x, z: p.z, y: -0.03, s, sy: rr(0.8, 1.2) });
    th += s * rr(1.25, 1.7) / pondR(th);
  }
  for (let i = 0; i < 70; i++) {
    const p = shorePoint(rr(0, 6.283), rr(-0.7, 1.6)), s = rr(0.08, 0.22);
    list.push({ x: p.x, z: p.z, y: groundH(p.x, p.z) + s * 0.1, s, sy: 1 });
  }
  for (const a of [0.55, 2.55, 4.15, 5.6]) { // boulders
    const p = shorePoint(a, 0.75);
    list.push({ x: p.x, z: p.z, y: 0.1, s: rr(1.0, 1.35), sy: 1.15 });
  }
  // island rocks in the pond
  list.push({ x: ISLAND.x, z: ISLAND.z, y: -0.1, s: 0.85, sy: 1.1 });
  list.push({ x: ISLAND.x + 0.75, z: ISLAND.z + 0.35, y: -0.1, s: 0.42, sy: 1 });
  list.push({ x: ISLAND.x - 0.3, z: ISLAND.z - 0.7, y: -0.08, s: 0.33, sy: 0.9 });
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  const groups = variants.map(() => []);
  list.forEach((s, i) => groups[i % 5].push(s));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  groups.forEach((gr, v) => {
    const im = new THREE.InstancedMesh(variants[v], mat, gr.length);
    gr.forEach((s, i) => {
      e.set(rr(-0.2, 0.2), rr(0, 6.283), rr(-0.2, 0.2)); q.setFromEuler(e);
      m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(s.s, s.s * s.sy, s.s));
      im.setMatrixAt(i, m);
      const g = rr(0.2, 0.36);
      im.setColorAt(i, c.setRGB(g * rr(0.95, 1.08), g, g * rr(0.95, 1.1)));
    });
    scene.add(im);
  });
}

// ---------------------------------------------------------------- water
const RIPPLES = 10;
const water = (() => {
  const shader = {
    uniforms: {
      color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
      uTime, uRipples: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0)) },
    },
    vertexShader: /* glsl */`
      uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
      void main(){ vUv = textureMatrix*vec4(position,1.0); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz;
        gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: GLSL_NOISE + /* glsl */`
      uniform sampler2D tDiffuse; uniform float uTime; uniform vec4 uRipples[${RIPPLES}];
      varying vec4 vUv; varying vec3 vW;
      float pondR(float th){ return 5.5 + 0.7*sin(2.0*th+1.0) + 0.4*sin(3.0*th+2.3) + 0.25*sin(5.0*th+0.7); }
      void main(){
        vec2 p = vW.xz; float t = uTime;
        vec2 g = vec2(0.0);
        float warp = vnoise(vec3(p*0.35, t*0.05))*6.283;
        for(int i=0;i<6;i++){
          float fi = float(i); float a = fi*2.39996 + 0.5;
          vec2 d = vec2(cos(a), sin(a));
          float k = 1.5 + fi*1.25, w = 0.55 + fi*0.33, amp = 0.013/(1.0+fi*0.45);
          g += d*k*amp*cos(dot(d,p)*k + t*w + warp*(1.0+fi*0.35));
        }
        g += (vec2(vnoise(vec3(p*5.0, t*0.35)), vnoise(vec3(p*5.0+17.0, t*0.35))) - 0.5)*0.07;
        for(int i=0;i<${RIPPLES};i++){
          vec4 r = uRipples[i]; float age = t - r.z;
          if(age > 0.0 && age < 9.0){
            vec2 v = p - r.xy; float d = length(v) + 1e-4;
            float x = d - age*0.75;
            float env = exp(-x*x*2.2)*exp(-age*0.45)*r.w*min(age*3.0,1.0)/(1.0+d*0.25);
            g += (v/d)*cos(x*8.5)*0.42*env;
          }
        }
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 toCam = cameraPosition - vW; float dist = length(toCam); vec3 V = toCam/dist;
        float cosT = max(dot(N, V), 0.0);
        float F = 0.07 + 0.93*pow(1.0 - cosT, 3.2);
        vec2 uv = vUv.xy/vUv.w + g*vec2(0.25, 0.55)*clamp(9.0/dist, 0.35, 1.4);
        vec3 refl = texture2D(tDiffuse, uv).rgb;
        float r0 = length(p); float sd = pondR(atan(p.y, p.x)) - r0;   // distance inside the shore
        float absorb = 0.06 + 0.26*smoothstep(0.0, 2.5, sd);
        vec3 deep = vec3(0.012, 0.045, 0.06);
        vec3 col = refl*F + deep*absorb*(1.0-F);
        float a = F + (1.0-F)*absorb;
        float edge = smoothstep(-0.05, 0.18, sd);
        gl_FragColor = vec4(col*edge, a*edge);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  };
  const w = new Reflector(new THREE.CircleGeometry(7.6, 64), {
    textureWidth: Math.round(window.innerWidth * 0.75), textureHeight: Math.round(window.innerHeight * 0.75),
    clipBias: 0.003, shader, multisample: 0,
  });
  w.material.transparent = true; w.material.depthWrite = false; w.material.premultipliedAlpha = true;
  w.rotation.x = -Math.PI / 2;
  w.renderOrder = 5;
  scene.add(w);
  return w;
})();
let rippleI = 0;
function addRipple(x, z, amp) {
  water.material.uniforms.uRipples.value[rippleI].set(x, z, uTime.value, amp);
  rippleI = (rippleI + 1) % RIPPLES;
}

// ---------------------------------------------------------------- koi
function makeKoiGeometry() {
  const pos = [], part = [], fin = [], idx = [];
  const prof = (u) => Math.pow(Math.max(Math.sin(Math.PI * Math.pow(clamp(u, 0, 1), 0.55)), 0), 0.75);
  const NU = 26, NV = 14;
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, x = 0.5 - u * 0.85, pr = prof(u);
    const w = 0.105 * pr + 0.012 * u, hh = 0.118 * pr + 0.022 * u;
    for (let j = 0; j < NV; j++) {
      const a = j / NV * Math.PI * 2;
      // slightly flatter belly, rounder back
      const sy = Math.sin(a);
      pos.push(x, sy * hh * (sy < 0 ? 0.85 : 1.0) + 0.01, Math.cos(a) * w); part.push(0); fin.push(0);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * NV + j, b = i * NV + (j + 1) % NV, c = a + NV, d = b + NV;
    idx.push(a, b, c, b, d, c);
  }
  function grid(fn, nu, nv, partVal) {
    const base = pos.length / 3;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const a = i / nu, b = j / nv * 2 - 1, p = fn(a, b);
      pos.push(p[0], p[1], p[2]); part.push(partVal); fin.push(a);
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = base + i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  // tail fin: a tilted V so it reads from above
  for (const s of [1, -1]) grid((a, b) => {
    const bb = (b * 0.5 + 0.5) * s, L = 0.40 * (0.62 + 0.38 * Math.pow(Math.abs(bb), 1.4));
    return [-0.345 - a * L, 0.01 + bb * (0.02 + 0.19 * a), bb * 0.11 * a];
  }, 6, 4, 2);
  // pectoral + pelvic fins
  const sideFin = (rx, ry, rz, len, wid, back) => {
    for (const s of [1, -1]) grid((a, b) => {
      const ox = -back, oz = Math.sqrt(1 - back * back);
      const cw = wid * Math.pow(Math.sin(Math.PI * Math.min(a * 0.8 + 0.2, 1)), 0.7);
      return [rx + ox * a * len + oz * b * cw, ry - 0.03 * a, s * (rz + oz * a * len - ox * b * cw)];
    }, 5, 4, 1);
  };
  sideFin(0.22, -0.035, 0.075, 0.25, 0.075, 0.6);
  sideFin(-0.07, -0.06, 0.06, 0.13, 0.04, 0.75);
  // dorsal fin
  grid((a, b) => {
    const t = b * 0.5 + 0.5, x = 0.14 - 0.36 * t;
    const top = 0.118 * prof((0.5 - x) / 0.85) + 0.012;
    return [x - a * 0.05, top - 0.012 + a * 0.065 * Math.pow(Math.sin(Math.PI * clamp(t * 0.9 + 0.1, 0, 1)), 0.6), 0];
  }, 2, 8, 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setAttribute('aFin', new THREE.Float32BufferAttribute(fin, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const koiMatBase = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  uniforms: {
    uPhase: { value: 0 }, uTurn: { value: 0 }, uAmp: { value: 1 }, uSeed: { value: 0 },
    uBase: { value: new THREE.Color() }, uPatch: { value: new THREE.Color() }, uSpot: { value: new THREE.Color() },
    uParams: { value: new THREE.Vector4() }, // patch threshold, spot threshold, head-only flag, unused
  },
  vertexShader: /* glsl */`
    attribute float aPart; attribute float aFin;
    uniform float uPhase, uTurn, uAmp;
    varying vec3 vP; varying vec3 vN; varying vec3 vW; varying float vPart; varying float vFin;
    void main(){
      vec3 p = position; vP = p; vPart = aPart; vFin = aFin;
      float t = 0.5 - p.x;
      float amp = uAmp*(0.012 + 0.095*t*t);
      float ph = uPhase - t*4.6;
      float off = amp*sin(ph) + 0.5*uTurn*t*t;
      float slope = -(uAmp*0.19*t*sin(ph) - 4.6*amp*cos(ph) + uTurn*t);
      p.z += off;
      if (aPart > 0.5 && aPart < 1.5) p.y += sin(uPhase*0.5 + sign(position.z)*0.8)*aFin*0.045;
      if (aPart > 1.5 && aPart < 2.5) p.z += sin(ph - aFin*1.6)*aFin*0.05*uAmp;
      float c = inversesqrt(1.0 + slope*slope), s = slope*c;
      vec3 n = normal; n = vec3(c*n.x - s*n.z, n.y, s*n.x + c*n.z);
      vN = normalize(mat3(modelMatrix)*n);
      vec4 w = modelMatrix*vec4(p,1.0); vW = w.xyz;
      gl_Position = projectionMatrix*viewMatrix*w;
    }`,
  fragmentShader: GLSL_NOISE + /* glsl */`
    uniform vec3 uBase, uPatch, uSpot; uniform vec4 uParams; uniform float uSeed;
    varying vec3 vP; varying vec3 vN; varying vec3 vW; varying float vPart; varying float vFin;
    void main(){
      vec3 q = vec3(vP.x*3.2, vP.y*1.2, vP.z*4.5) + uSeed*17.3;
      float n1 = fbm3(q), n2 = fbm3(q*1.9 + 31.7);
      float pat = smoothstep(uParams.x-0.05, uParams.x-0.02, n1);
      if (uParams.z > 0.5) pat = smoothstep(0.075, 0.062, length(vec2(vP.x-0.30, vP.z*1.25)));
      float spot = smoothstep(uParams.y-0.04, uParams.y-0.015, n2);
      float topSide = smoothstep(-0.07, 0.0, vP.y);
      vec3 col = uBase;
      col = mix(col, uPatch, pat*topSide);
      col = mix(col, uSpot, spot*topSide);
      if (vPart > 0.5) {         // fins: paler, slightly translucent-looking, ribbed
        col = mix(col, vec3(0.95,0.9,0.85), 0.35);
        col *= 0.92 + 0.08*sin(vP.y*110.0 + vP.z*110.0);
      } else {
        // eyes
        float e = length(vec2(vP.x-0.405, vP.y-0.035));
        col = mix(col, vec3(0.02), smoothstep(0.02, 0.013, e)*step(0.04, abs(vP.z)));
        // faint scale shimmer
        col *= 0.93 + 0.07*sin(vP.x*120.0)*sin(vP.z*130.0+vP.x*60.0);
      }
      vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
      if (vPart > 0.5) N = vec3(0.0,1.0,0.0);
      float up = N.y*0.5+0.5;
      vec3 light = vec3(0.62,0.62,0.80)*(0.30 + 0.85*up*up) + vec3(0.9,0.5,0.25)*0.25*up;
      col *= light;
      col *= 1.45;
      float depth = clamp(-vW.y*0.8, 0.0, 0.6);
      col = mix(col, vec3(0.015,0.055,0.07), depth);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
});
const KOI_TYPES = [
  // base, patch, spot, patchTh, spotTh, head
  [[0.95, 0.92, 0.86], [0.92, 0.20, 0.04], [0, 0, 0], 0.47, 9, 0],          // kohaku
  [[0.95, 0.92, 0.86], [0.90, 0.16, 0.04], [0.03, 0.03, 0.04], 0.50, 0.62, 0], // sanke
  [[0.05, 0.05, 0.06], [0.90, 0.20, 0.04], [0.95, 0.92, 0.86], 0.48, 0.56, 0], // showa
  [[1.00, 0.62, 0.10], [1.0, 0.80, 0.30], [0, 0, 0], 0.55, 9, 0],           // ogon (gold)
  [[0.95, 0.92, 0.88], [0.95, 0.12, 0.04], [0, 0, 0], 9, 9, 1],             // tancho
  [[0.96, 0.36, 0.05], [0.96, 0.93, 0.86], [0, 0, 0], 0.56, 9, 0],          // orange & white
  [[0.95, 0.92, 0.86], [0.04, 0.04, 0.05], [0, 0, 0], 0.50, 9, 0],          // shiro utsuri
  [[0.98, 0.80, 0.35], [0.95, 0.40, 0.06], [0, 0, 0], 0.50, 9, 0],          // yellow & orange
];
const koi = [];
{
  const geo = makeKoiGeometry();
  const N = 11;
  for (let i = 0; i < N; i++) {
    const T = KOI_TYPES[i % KOI_TYPES.length];
    const mat = koiMatBase.clone();
    mat.uniforms.uBase.value.setRGB(...T[0]); mat.uniforms.uPatch.value.setRGB(...T[1]); mat.uniforms.uSpot.value.setRGB(...T[2]);
    mat.uniforms.uParams.value.set(T[3], T[4], T[5], 0); mat.uniforms.uSeed.value = rr(0, 10);
    const mesh = new THREE.Mesh(geo, mat);
    const size = rr(0.85, 1.35) * (i === 3 ? 1.15 : 1);
    mesh.scale.setScalar(size);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const a = rr(0, 6.283), r = rr(0.5, 3.2);
    koi.push({
      mesh, mat, size, x: Math.cos(a) * r, z: Math.sin(a) * r, h: rr(0, 6.283), turn: 0,
      v0: rr(0.42, 0.75), p1: rr(0, 99), p2: rr(0, 99), p3: rr(0, 99), phase: rr(0, 6), y: -0.35,
    });
  }
}
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const floaters = []; // floating lanterns (filled later) are obstacles too
function updateKoi(t, dt) {
  for (const f of koi) {
    let target = Math.sin(t * 0.21 + f.p1) * 0.32 + Math.sin(t * 0.53 + f.p2) * 0.22;
    const r = Math.hypot(f.x, f.z), th = Math.atan2(f.z, f.x), d = pondR(th) - r;
    if (d < 2.4) {
      const diff = wrapA(Math.atan2(-f.z, -f.x) - f.h);
      target += Math.sign(diff || 1) * Math.min(Math.abs(diff), 1.2) * smooth(2.4, 1.0, d) * 2.4;
    }
    const avoid = (ox, oz, rad, k) => {
      const dx = f.x - ox, dz = f.z - oz, dist = Math.hypot(dx, dz);
      if (dist < rad && dist > 1e-3) {
        const diff = wrapA(Math.atan2(dz, dx) - f.h);
        target += clamp(diff, -1, 1) * (1 - dist / rad) * k;
      }
    };
    avoid(ISLAND.x, ISLAND.z, ISLAND.r + 1.1, 3.5);
    for (const o of koi) if (o !== f) avoid(o.x, o.z, 0.9, 1.2);
    f.turn += (target - f.turn) * Math.min(1, dt * 1.6);
    f.turn = clamp(f.turn, -0.6, 0.6);
    const v = f.v0 * (0.75 + 0.35 * Math.sin(t * 0.17 + f.p3)) * (1 + Math.abs(f.turn) * 0.3);
    f.h += f.turn * dt;
    f.x += Math.cos(f.h) * v * dt; f.z += Math.sin(f.h) * v * dt;
    if (d < 0.8) { f.x *= 1 - dt * 0.3; f.z *= 1 - dt * 0.3; }
    f.phase += dt * (1.6 + v * 6.5);
    f.y = -0.3 - 0.13 * f.size + 0.14 * Math.sin(t * 0.23 + f.p2);
    f.mesh.position.set(f.x, f.y, f.z);
    f.mesh.rotation.y = -f.h;
    f.mat.uniforms.uPhase.value = f.phase;
    f.mat.uniforms.uTurn.value = clamp(f.turn / v, -1.1, 1.1) * f.size * 0.85;
    f.mat.uniforms.uAmp.value = 0.65 + v * 0.7;
  }
}

// ---------------------------------------------------------------- lily pads & flowers
{
  const pos = [], col = [], idx = [];
  const SEGS = 44, gap = 0.16;
  pos.push(0, 0, 0); col.push(0.30, 0.50, 0.16);
  for (let ring = 1; ring <= 2; ring++) for (let j = 0; j <= SEGS; j++) {
    const a = gap + j / SEGS * (Math.PI * 2 - 2 * gap), rad = ring * 0.5 * (1 + (ring === 2 ? 0.035 * Math.sin(a * 9) : 0));
    pos.push(Math.cos(a) * rad, ring === 2 ? 0.012 : 0, Math.sin(a) * rad);
    const vein = 0.82 + 0.18 * Math.cos(a * 14);
    if (ring === 1) col.push(0.16 * vein, 0.36 * vein, 0.10 * vein); else col.push(0.10 * vein + 0.03, 0.26 * vein, 0.07 * vein);
  }
  for (let j = 0; j < SEGS; j++) {
    const a = 1 + j, b = a + 1, c = a + SEGS + 1, d = c + 1;
    idx.push(0, b, a, a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const na = g.attributes.normal; for (let i = 0; i < na.count; i++) na.setXYZ(i, 0, 1, 0);

  const pads = [];
  const centers = [[2.6, 1.6], [-2.9, -1.4], [0.6, -2.7], [-1.2, 2.5], [3.3, -1.5], [-3.4, 1.9], [0.3, 0.6]];
  for (const [cx, cz] of centers) {
    const n = Math.floor(rr(4, 9));
    for (let k = 0, tries = 0; k < n && tries < 200; tries++) {
      const a = rr(0, 6.283), rad = Math.sqrt(rand()) * 1.25, s = rr(0.24, 0.52);
      const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
      if (pondR(Math.atan2(z, x)) - Math.hypot(x, z) < 0.55 + s) continue;
      if (Math.hypot(x - ISLAND.x, z - ISLAND.z) < 0.9 + s) continue;
      if (pads.some(p => Math.hypot(p.x - x, p.z - z) < (p.s + s) * 0.98)) continue;
      pads.push({ x, z, s, rot: rr(0, 6.283) }); k++;
    }
  }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide });
  const im = new THREE.InstancedMesh(g, mat, pads.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), Y = new THREE.Vector3(0, 1, 0);
  pads.forEach((p, i) => {
    q.setFromAxisAngle(Y, p.rot);
    m.compose(new THREE.Vector3(p.x, 0.012 + i * 0.0004, p.z), q, new THREE.Vector3(p.s, 1, p.s));
    im.setMatrixAt(i, m);
    const k = rr(0.8, 1.25); im.setColorAt(i, c.setRGB(k * rr(0.85, 1.2), k, k * rr(0.8, 1.1)));
  });
  im.renderOrder = 6;
  scene.add(im);

  // flowers: three rings of curved petals
  const pp = [], pc = [], pi = [];
  const NL = 7;
  for (let i = 0; i <= NL; i++) {
    const v = i / NL, w = 0.20 * Math.pow(Math.sin(Math.PI * Math.min(v * 0.92 + 0.06, 1)), 0.75);
    for (let j = -1; j <= 1; j++) {
      pp.push(j * w, 0.28 * v * v + 0.07 * Math.abs(j) * (1 - v * 0.5), v);
      const k = Math.pow(v, 1.3);
      pc.push(1.0, lerp(0.97, 0.52, k), lerp(0.88, 0.72, k));
    }
  }
  for (let i = 0; i < NL; i++) for (let j = 0; j < 2; j++) {
    const a = i * 3 + j, b = a + 1, c2 = a + 3, d = c2 + 1;
    pi.push(a, c2, b, b, c2, d);
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
  pg.setAttribute('color', new THREE.Float32BufferAttribute(pc, 3));
  pg.setIndex(pi); pg.computeVertexNormals();
  const flowers = [];
  const big = pads.filter(p => p.s > 0.3).sort(() => rand() - 0.5).slice(0, 9);
  for (const p of big) flowers.push({ x: p.x + Math.cos(p.rot) * p.s * 0.25, z: p.z + Math.sin(p.rot) * p.s * 0.25, s: rr(0.75, 1.15), white: rand() < 0.35 });
  const RINGSF = [[9, 0.30, 1.0], [8, 0.75, 0.86], [6, 1.15, 0.66], [4, 1.42, 0.45]];
  const perFlower = RINGSF.reduce((a, r) => a + r[0], 0);
  const pm = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.6, side: THREE.DoubleSide,
    emissive: new THREE.Color(0.22, 0.08, 0.13),
  });
  const pim = new THREE.InstancedMesh(pg, pm, flowers.length * perFlower);
  const cg = new THREE.SphereGeometry(0.07, 10, 8); cg.scale(1, 0.7, 1);
  const cim = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ color: 0xffc020, emissive: 0xff9000, emissiveIntensity: 0.9, roughness: 0.7 }), flowers.length);
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  let k = 0;
  flowers.forEach((f, fi) => {
    const rot0 = rr(0, 6.283);
    RINGSF.forEach(([n, tilt, sc], ri) => {
      for (let j = 0; j < n; j++) {
        e.set(-tilt + rr(-0.06, 0.06), rot0 + ri * 0.4 + j / n * Math.PI * 2, 0); q.setFromEuler(e);
        const s = f.s * sc * 0.30;
        m.compose(new THREE.Vector3(f.x, 0.05 + ri * 0.012, f.z), q, new THREE.Vector3(s, s, s));
        pim.setMatrixAt(k, m);
        pim.setColorAt(k, f.white ? c.setRGB(1, 1.25, 1.2) : c.setRGB(1, rr(0.8, 1), rr(0.85, 1)));
        k++;
      }
    });
    m.compose(new THREE.Vector3(f.x, 0.09, f.z), q.identity(), new THREE.Vector3(f.s, f.s, f.s));
    cim.setMatrixAt(fi, m);
  });
  scene.add(pim, cim);
}

// ---------------------------------------------------------------- lanterns
function paperMaterial(tint, y0, hgt, ribs) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uTint: { value: new THREE.Color(...tint) }, uG: { value: new THREE.Vector3(y0, hgt, ribs) }, uPh: { value: rr(0, 50) }, uGain: { value: 1 } },
    vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){ vP = position; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = -normalize(mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: GLSL_NOISE + `
      uniform float uTime, uPh, uGain; uniform vec3 uTint, uG; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){
        float g = exp(-pow((vP.y-uG.x)/uG.y, 2.0));
        float ndv = abs(dot(normalize(vN), normalize(vV)));
        float fl = 0.88 + 0.12*vnoise(vec3(uTime*3.0+uPh, uPh, 0.0)) + 0.05*sin(uTime*11.0+uPh);
        float rib = 1.0 - uG.z*smoothstep(0.75, 1.0, abs(sin(vP.y*uG.z*70.0)));
        vec3 c = uTint*(0.55 + 1.9*g*(0.45+0.55*ndv))*fl*rib*uGain;
        c += vec3(1.0,0.75,0.4)*pow(g*ndv, 4.0)*0.9*fl*uGain;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}
const darkWood = new THREE.MeshStandardMaterial({ color: 0x1a110b, roughness: 0.85 });
const flickerLights = [];
function addLight(parent, color, intensity, dist, y) {
  const l = new THREE.PointLight(color, intensity, dist, 1.8);
  l.position.y = y; parent.add(l);
  flickerLights.push({ l, base: intensity, ph: rr(0, 50) });
}
// floating lanterns
{
  const spots = [[1.3, 2.2], [-0.6, -1.3], [2.6, -0.9], [-3.0, 0.2 - 2.2]];
  const tints = [[1.0, 0.50, 0.16], [1.0, 0.42, 0.14], [1.0, 0.58, 0.22], [1.0, 0.36, 0.16]];
  spots.forEach(([x, z], i) => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.035, 0.46), darkWood); base.position.y = 0.02; g.add(base);
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.36, 0.33), paperMaterial(tints[i], -0.1, 0.2, 0)); paper.position.y = 0.22; g.add(paper);
    const posts = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = new THREE.BoxGeometry(0.022, 0.39, 0.022); p.translate(sx * 0.17, 0.225, sz * 0.17); posts.push(p); }
    for (const sx of [-1, 1]) { const p = new THREE.BoxGeometry(0.022, 0.022, 0.36); p.translate(sx * 0.17, 0.41, 0); posts.push(p);
      const p2 = new THREE.BoxGeometry(0.36, 0.022, 0.022); p2.translate(0, 0.41, sx * 0.17); posts.push(p2); }
    g.add(new THREE.Mesh(mergeGeometries(posts), darkWood));
    addLight(g, 0xff9a4a, i < 3 ? 2.6 : 0, 7, 0.35);
    g.rotation.y = rr(0, 6.283);
    scene.add(g);
    floaters.push({ g, x, z, ph: rr(0, 6.283), sp: rr(0.035, 0.06), rad: rr(0.25, 0.5), spin: rr(-0.04, 0.04) });
  });
  // the fourth lantern has no real light (keeps light count low); remove the dead entry
  for (let i = flickerLights.length - 1; i >= 0; i--) if (flickerLights[i].base === 0) { flickerLights[i].l.removeFromParent(); flickerLights.splice(i, 1); }
}
// string of round paper lanterns between two bamboo poles
{
  const A = shorePoint(-2.3, 0.55), B = shorePoint(-0.82, 0.55);
  const H = 3.25;
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3218, roughness: 0.7 });
  for (const P of [A, B]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, H + 0.5, 8), poleMat);
    pole.position.set(P.x, (H + 0.5) / 2 - 0.35, P.z); scene.add(pole);
  }
  const ropeAt = (t) => new THREE.Vector3(lerp(A.x, B.x, t), H - 0.95 * 4 * t * (1 - t), lerp(A.z, B.z, t));
  const pts = []; for (let i = 0; i <= 30; i++) pts.push(ropeAt(i / 30));
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.012, 5), darkWood));
  const sph = new THREE.SphereGeometry(0.25, 28, 18); sph.scale(1, 1.12, 1);
  const cap = new THREE.CylinderGeometry(0.1, 0.1, 0.045, 12);
  const tints = [[1.0, 0.30, 0.10], [1.0, 0.55, 0.22], [1.0, 0.24, 0.10], [1.0, 0.55, 0.22], [1.0, 0.30, 0.10]];
  const N = 5;
  for (let i = 0; i < N; i++) {
    const p = ropeAt((i + 1) / (N + 1));
    const g = new THREE.Group(); g.position.copy(p);
    const sw = new THREE.Group(); g.add(sw);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 4), darkWood); str.position.y = -0.1; sw.add(str);
    const body = new THREE.Mesh(sph, paperMaterial(tints[i], -0.03, 0.22, 1)); body.position.y = -0.46; sw.add(body);
    for (const y of [-0.19, -0.73]) { const c = new THREE.Mesh(cap, darkWood); c.position.y = y; sw.add(c); }
    const tas = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0x701008, roughness: 0.9 })); tas.position.y = -0.85; sw.add(tas);
    if (i % 2 === 0) { const h = new THREE.Group(); h.position.y = -0.46; sw.add(h); addLight(h, 0xff8038, 7, 11, 0); }
    scene.add(g);
    floaters.push({ swing: sw, ph: rr(0, 6.283) });
  }
}
// stone lantern (toro)
{
  const stone = new THREE.MeshStandardMaterial({ color: 0x4a4a50, roughness: 0.95, flatShading: true });
  const P = shorePoint(0.05, 0.95);
  const g = new THREE.Group(); g.position.set(P.x, groundH(P.x, P.z) - 0.03, P.z); g.rotation.y = 0.5;
  const parts = [];
  const add = (geo, y, ry = 0) => { geo = geo.toNonIndexed(); geo.rotateY(ry); geo.translate(0, y, 0); parts.push(geo); };
  add(new THREE.CylinderGeometry(0.34, 0.40, 0.16, 6), 0.08);
  add(new THREE.CylinderGeometry(0.12, 0.15, 0.85, 8), 0.58);
  add(new THREE.CylinderGeometry(0.33, 0.18, 0.13, 6), 1.06);
  add(new THREE.CylinderGeometry(0.30, 0.33, 0.05, 6), 1.15);
  for (let i = 0; i < 4; i++) { const b = new THREE.BoxGeometry(0.055, 0.34, 0.055).toNonIndexed(); b.translate(0.16, 1.34, 0.16); b.rotateY(i * Math.PI / 2); parts.push(b); }
  add(new THREE.CylinderGeometry(0.10, 0.62, 0.30, 6), 1.66);
  add(new THREE.CylinderGeometry(0.26, 0.60, 0.06, 6), 1.50);
  add(new THREE.SphereGeometry(0.085, 8, 6), 1.87);
  parts.forEach(p => { p.deleteAttribute('uv'); });
  g.add(new THREE.Mesh(mergeGeometries(parts), stone));
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.32, 0.30), paperMaterial([1.0, 0.55, 0.2], 0, 0.18, 0)); paper.position.y = 1.34; g.add(paper);
  addLight(g, 0xffa050, 5, 9, 1.34);
  scene.add(g);
}

// ---------------------------------------------------------------- maple tree
{
  const base = shorePoint(3.55, 1.5);
  const branches = [], tips = [];
  const up = new THREE.Vector3(0, 1, 0);
  function branch(start, dir, len, rad, depth) {
    const end = start.clone().addScaledVector(dir, len);
    const g = new THREE.CylinderGeometry(rad * 0.68, rad, len * 1.03, depth > 2 ? 7 : 5, 1, true);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
    g.translate(start.x, start.y, start.z);
    branches.push(g);
    if (depth <= 2) tips.push(end.clone(), start.clone().lerp(end, 0.5));
    if (depth === 0) return;
    const n = depth >= 4 ? 3 : (rand() < 0.6 ? 2 : 3);
    for (let i = 0; i < n; i++) {
      const d = dir.clone().add(new THREE.Vector3(rr(-1, 1), rr(-0.35, 0.5), rr(-1, 1)).multiplyScalar(0.75));
      d.y = d.y * 0.7 + 0.08; d.normalize();
      branch(end, d, len * rr(0.66, 0.82), rad * 0.66, depth - 1);
    }
  }
  const toPond = new THREE.Vector3(-base.x, 0, -base.z).normalize();
  branch(new THREE.Vector3(base.x, groundH(base.x, base.z) - 0.2, base.z), new THREE.Vector3(toPond.x * 0.38, 1, toPond.z * 0.38).normalize(), 2.0, 0.24, 5);
  const trunk = new THREE.Mesh(mergeGeometries(branches), new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 0.95 }));
  scene.add(trunk);

  // maple leaf: little 5-lobed star
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2 + Math.PI / 2, r = i % 2 === 0 ? (i === 0 ? 1.15 : (i === 4 || i === 6 ? 0.7 : 1.0)) : 0.42;
    if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const lg = new THREE.ShapeGeometry(sh); lg.rotateX(-Math.PI / 2); lg.scale(0.085, 0.085, 0.085);
  const LPT = 26, floating = 70;
  const lm = new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide, emissive: new THREE.Color(0.10, 0.012, 0.0) });
  addWind(lm, 0.0);
  lm.onBeforeCompile = (s) => {
    s.uniforms.uTime = uTime;
    s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vec3 ip = instanceMatrix[3].xyz;
      float fl = step(0.3, ip.y);
      transformed.y += fl*sin(uTime*1.7 + ip.x*3.0 + ip.z*2.0)*0.25*length(position.xz)*6.0*0.085;
      transformed.x += fl*sin(uTime*0.9 + ip.z*1.3)*0.02;`);
  };
  const im = new THREE.InstancedMesh(lg, lm, tips.length * LPT + floating);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  const pal = [[0.62, 0.05, 0.02], [0.85, 0.12, 0.02], [0.95, 0.30, 0.03], [0.75, 0.08, 0.04], [1.0, 0.45, 0.06]];
  let k = 0;
  const setLeaf = (x, y, z, flat, s) => {
    if (flat) e.set(rr(-0.05, 0.05), rr(0, 6.283), rr(-0.05, 0.05)); else e.set(rr(-0.9, 0.9), rr(0, 6.283), rr(-0.9, 0.9));
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s)); im.setMatrixAt(k, m);
    const p = pal[Math.floor(rand() * pal.length)], b = rr(0.7, 1.15);
    im.setColorAt(k, c.setRGB(p[0] * b, p[1] * b, p[2] * b)); k++;
  };
  let canopy = new THREE.Vector3();
  for (const t of tips) {
    canopy.add(t);
    for (let i = 0; i < LPT; i++) {
      const a = rr(0, 6.283), r = Math.cbrt(rand()) * 0.62;
      setLeaf(t.x + Math.cos(a) * r, t.y + rr(-0.22, 0.28), t.z + Math.sin(a) * r, false, rr(0.9, 1.7));
    }
  }
  canopy.multiplyScalar(1 / tips.length);
  for (let i = 0; i < floating; i++) {
    // fallen leaves: on the water and the bank under the canopy, a few drifting further out
    const far = rand() < 0.3;
    const a = rr(0, 6.283), r = Math.sqrt(rand()) * (far ? 5 : 2.6);
    let x = (far ? 0 : canopy.x) + Math.cos(a) * r, z = (far ? 0 : canopy.z) + Math.sin(a) * r;
    const h = groundH(x, z);
    setLeaf(x, h < 0 ? 0.008 : h + 0.02, z, true, rr(0.9, 1.4));
  }
  im.frustumCulled = false; im.renderOrder = 6;
  scene.add(im);
}

// ---------------------------------------------------------------- grass
{
  const g = new THREE.BufferGeometry();
  const w = 0.022;
  g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, -w * 0.7, 0.5, 0.06, w * 0.7, 0.5, 0.06, 0, 1, 0.22], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute([0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 1.25, 1.25, 1.25], 3));
  g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  addWind(mat, 0.10, 1.3);
  const COUNT = 16000;
  const im = new THREE.InstancedMesh(g, mat, COUNT);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), Y = new THREE.Vector3(0, 1, 0);
  let k = 0, guard = 0;
  while (k < COUNT && guard++ < COUNT * 20) {
    const th = rr(0, 6.283), d = 0.25 + Math.pow(rand(), 1.7) * 11;
    const r = pondR(th) + d, x = Math.cos(th) * r, z = Math.sin(th) * r;
    const dens = fbm(x * 0.5 + 40, 0, z * 0.5, 3);
    if (rand() > smooth(0.3, 0.6, dens) + 0.12) continue;
    const reed = d < 1.0 && fbm(x * 0.8, 7, z * 0.8, 2) > 0.5;
    const hgt = reed ? rr(0.5, 1.0) : rr(0.14, 0.42) * (0.6 + dens);
    q.setFromAxisAngle(Y, rr(0, 6.283));
    m.compose(new THREE.Vector3(x, groundH(x, z) - 0.02, z), q, new THREE.Vector3(reed ? 1.4 : 1.6, hgt, hgt * 1.2));
    im.setMatrixAt(k, m);
    const b = rr(0.6, 1.2);
    im.setColorAt(k, c.setRGB(lerp(0.10, 0.22, rand()) * b, lerp(0.22, 0.32, rand()) * b, 0.07 * b));
    k++;
  }
  im.count = k; im.frustumCulled = false;
  scene.add(im);
}

// ---------------------------------------------------------------- bamboo & bushes
{
  const sg = new THREE.CylinderGeometry(0.04, 0.055, 1, 6, 1, true); sg.translate(0, 0.5, 0);
  const sm = new THREE.MeshStandardMaterial({ color: 0x4a6a25, roughness: 0.6 });
  const lgm = new THREE.BufferGeometry();
  lgm.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.045, 0, 0.22, -0.045, 0, 0.22, 0, -0.06, 0.6], 3));
  lgm.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  lgm.setIndex([0, 1, 2, 2, 1, 3]);
  const lm = new THREE.MeshStandardMaterial({ color: 0x35501c, roughness: 0.7, side: THREE.DoubleSide });
  addWind(lm, 0.0);
  lm.onBeforeCompile = (s) => {
    s.uniforms.uTime = uTime;
    s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vec3 ip = instanceMatrix[3].xyz;
      transformed.y += sin(uTime*1.4 + ip.x*2.0 + ip.y*1.5 + ip.z)*0.07*position.z;`);
  };
  const stalks = [], leaves = [];
  const clusters = [[-1.57, 3.2, 16], [-2.75, 3.6, 10], [3.5, 6.0, 12], [-0.3, 5.2, 11], [-0.45, 4.6, 9], [4.6, 3.8, 10]];
  for (const [th, off, n] of clusters) {
    const c0 = shorePoint(th, off);
    for (let i = 0; i < n; i++) {
      const x = c0.x + rr(-1.3, 1.3), z = c0.z + rr(-1.3, 1.3), h = rr(4.5, 8.0);
      const lean = new THREE.Euler(rr(-0.07, 0.07), rr(0, 6.283), rr(-0.07, 0.07));
      stalks.push({ x, z, h, lean });
      const q = new THREE.Quaternion().setFromEuler(lean);
      for (let j = 0; j < 30; j++) {
        const t = rr(0.35, 1.0);
        const p = new THREE.Vector3(0, h * t, 0).applyQuaternion(q);
        leaves.push({ x: x + p.x + rr(-0.25, 0.25), y: groundH(x, z) + p.y, z: z + p.z + rr(-0.25, 0.25), s: rr(0.8, 1.6) });
      }
    }
  }
  const sim = new THREE.InstancedMesh(sg, sm, stalks.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), e = new THREE.Euler();
  stalks.forEach((s, i) => {
    q.setFromEuler(s.lean);
    m.compose(new THREE.Vector3(s.x, groundH(s.x, s.z) - 0.1, s.z), q, new THREE.Vector3(1, s.h, 1)); sim.setMatrixAt(i, m);
    const b = rr(0.6, 1.1); sim.setColorAt(i, c.setRGB(b, b, b * 0.9));
  });
  const lim = new THREE.InstancedMesh(lgm, lm, leaves.length);
  leaves.forEach((l, i) => {
    e.set(rr(0.2, 0.9), rr(0, 6.283), 0, 'YXZ'); q.setFromEuler(e);
    m.compose(new THREE.Vector3(l.x, l.y, l.z), q, new THREE.Vector3(l.s, l.s, l.s)); lim.setMatrixAt(i, m);
    const b = rr(0.6, 1.25); lim.setColorAt(i, c.setRGB(b, b, b * 0.8));
  });
  sim.frustumCulled = lim.frustumCulled = false;
  scene.add(sim, lim);

  // dark rounded shrubs closing the horizon
  let bg = new THREE.IcosahedronGeometry(1, 3); bg.deleteAttribute('normal'); bg.deleteAttribute('uv'); bg = mergeVertices(bg, 1e-4);
  const bp = bg.attributes.position, bc = [];
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i), kk = 0.75 + 0.5 * fbm(x * 1.6, y * 1.6, z * 1.6, 3);
    bp.setXYZ(i, x * kk, Math.max(y * kk * 0.8, -0.3), z * kk);
    const t = 0.5 + 0.9 * noise3(x * 7, y * 7, z * 7) * (0.5 + 0.5 * y); bc.push(t, t, t);
  }
  bg.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
  bg.computeVertexNormals();
  const NB = 70;
  const bim = new THREE.InstancedMesh(bg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), NB);
  for (let i = 0; i < NB; i++) {
    const th = i / NB * 6.283 + rr(-0.1, 0.1), near = i % 3 === 0;
    const off = near ? rr(2.2, 4) : rr(5.5, 15), s = near ? rr(0.45, 0.9) : rr(1.2, 2.4);
    const p = shorePoint(th, off);
    q.setFromEuler(e.set(0, rr(0, 6.283), 0));
    m.compose(new THREE.Vector3(p.x, groundH(p.x, p.z) + s * 0.15, p.z), q, new THREE.Vector3(s * rr(1, 1.5), s * rr(0.7, near ? 0.9 : 1.15), s * rr(1, 1.5)));
    bim.setMatrixAt(i, m);
    bim.setColorAt(i, c.setRGB(rr(0.03, 0.06), rr(0.07, 0.12), rr(0.03, 0.05)));
  }
  bim.frustumCulled = false;
  scene.add(bim);
}

// ---------------------------------------------------------------- fireflies
{
  const N = 90, pos = [], ph = [];
  for (let i = 0; i < N; i++) {
    const th = rr(0, 6.283), r = rr(1, 10);
    pos.push(Math.cos(th) * r, rr(0.35, 2.6), Math.sin(th) * r); ph.push(rand());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPh', new THREE.Float32BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime, uScale: { value: 1 } },
    vertexShader: `attribute float aPh; uniform float uTime, uScale; varying float vI;
      void main(){ float t = uTime; vec3 p = position;
        p += vec3(sin(t*0.31+aPh*40.0)*1.1 + sin(t*0.9+aPh*7.0)*0.25, sin(t*0.47+aPh*60.0)*0.35, cos(t*0.27+aPh*25.0)*1.1 + cos(t*1.1+aPh*13.0)*0.25);
        p.y = max(p.y, 0.15);
        vI = smoothstep(0.1, 0.9, sin(t*(1.2+aPh) + aPh*90.0)*0.5+0.5);
        vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
        gl_PointSize = uScale*(0.10 + 0.05*aPh)/-mv.z; }`,
    fragmentShader: `varying float vI; void main(){ float d = length(gl_PointCoord-0.5)*2.0;
        float a = exp(-d*d*7.0)*vI + smoothstep(0.25,0.0,d)*vI; if (d > 1.0) discard;
        gl_FragColor = vec4(vec3(0.75,1.0,0.25)*a*2.2, 1.0); }`
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 8;
  scene.add(pts);
  pts.onBeforeRender = (r) => { mat.uniforms.uScale.value = r.getDrawingBufferSize(new THREE.Vector2()).y * 1.3; };
}

// ---------------------------------------------------------------- post
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.62, 0.75, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setPixelRatio(pixelRatio); renderer.setSize(w, h);
  composer.setPixelRatio(pixelRatio); composer.setSize(w, h);
  water.getRenderTarget().setSize(Math.round(w * 0.75 * pixelRatio / 1.5) || 1, Math.round(h * 0.75 * pixelRatio / 1.5) || 1);
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let nextRipple = 1.5, slowT = 0, frames = 0, perfChecked = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = (uTime.value += dt);

  updateKoi(t, dt);
  for (const f of floaters) {
    if (f.swing) { f.swing.rotation.z = Math.sin(t * 0.9 + f.ph) * 0.05; f.swing.rotation.x = Math.sin(t * 0.7 + f.ph * 2) * 0.04; continue; }
    const a = f.ph + t * f.sp;
    f.g.position.set(f.x + Math.cos(a) * f.rad, Math.sin(t * 1.1 + f.ph) * 0.012 - 0.005, f.z + Math.sin(a * 1.3) * f.rad);
    f.g.rotation.y += f.spin * dt;
    f.g.rotation.x = Math.sin(t * 0.8 + f.ph) * 0.02; f.g.rotation.z = Math.cos(t * 0.65 + f.ph) * 0.02;
  }
  for (const f of flickerLights) f.l.intensity = f.base * (0.9 + 0.1 * Math.sin(t * 7 + f.ph) * Math.sin(t * 2.3 + f.ph * 2));

  if (t > nextRipple) {
    nextRipple = t + rr(0.9, 2.6);
    if (rand() < 0.6) {
      const f = koi[Math.floor(rand() * koi.length)];
      addRipple(f.x + Math.cos(f.h) * 0.4 * f.size, f.z + Math.sin(f.h) * 0.4 * f.size, rr(0.7, 1.1));
    } else {
      const a = rr(0, 6.283), r = Math.sqrt(rand()) * 3.8;
      addRipple(Math.cos(a) * r, Math.sin(a) * r, rr(0.35, 0.7));
    }
  }

  updateCamera(dt);
  composer.render(dt);

  // adaptive resolution: if the machine struggles, drop the pixel ratio once or twice
  frames++; slowT += dt;
  if (slowT > 3) {
    const fps = frames / slowT; frames = 0; slowT = 0;
    if (fps < 40 && pixelRatio > 0.8 && perfChecked++ < 2 && t > 4) { pixelRatio = Math.max(0.75, pixelRatio * 0.75); resize(); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
