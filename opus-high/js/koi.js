// Procedural koi: geometry, swimming vertex deformation, procedural colour patterns, steering.
import * as THREE from 'three';
import { GLSL_NOISE, globals, patchMaterial, mulberry32, vnoise3, clamp, angleDiff, lerp } from './util.js';
import { pondSDF, terrainHeight } from './pond.js';

// ---------- geometry (head at +x, nose x=0.5, tail base x=-0.5) ----------
function buildKoiGeometry() {
  const pos = [], part = [], idx = [], nrm = [];
  const NU = 44, NV = 20;
  const prof = (u) => {
    if (u < 0.26) { const t = (0.26 - u) / 0.26; return Math.pow(Math.max(0, 1 - t * t), 0.55); }
    return 1 - 0.8 * Math.pow((u - 0.26) / 0.74, 1.25);
  };
  const W = 0.086, H = 0.104;
  const yc = (u) => 0.01 * prof(u) - 0.004;
  // body rings
  for (let i = 0; i <= NU; i++) {
    const u = Math.pow(i / NU, 1.15);
    const x = 0.5 - u;
    const p = prof(u);
    for (let j = 0; j < NV; j++) {
      const a = (j / NV) * Math.PI * 2;
      let z = W * p * Math.cos(a);
      let y = H * p * Math.sin(a);
      if (y < 0) y *= 0.8;
      y += 0.012 * p * Math.pow(Math.max(Math.sin(a), 0), 10); // dorsal ridge
      pos.push(x, y + yc(u), z);
      part.push(0);
    }
  }
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < NV; j++) {
      const a = i * NV + j, b = i * NV + (j + 1) % NV, c = (i + 1) * NV + j, d = (i + 1) * NV + (j + 1) % NV;
      idx.push(a, b, c, b, d, c);
    }
  }
  // tail cap
  const capC = pos.length / 3;
  pos.push(-0.5, yc(1), 0); part.push(0);
  for (let j = 0; j < NV; j++) idx.push(capC, NU * NV + (j + 1) % NV, NU * NV + j);
  const bodyVertCount = pos.length / 3;

  // helper: add a grid surface
  const addGrid = (nx, ny, fn, partId) => {
    const base = pos.length / 3;
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
      const v = fn(i / nx, j / ny);
      pos.push(v[0], v[1], v[2]); part.push(partId);
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const a = base + i * (ny + 1) + j, b = a + 1, c = a + (ny + 1), d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  };

  // tail fin (forked, vertical plane)
  addGrid(10, 12, (s, tt) => {
    const t = tt * 2 - 1;
    const span = 0.028 + 0.16 * Math.pow(s, 0.85);
    const len = 0.1 + 0.2 * Math.pow(Math.abs(t), 1.4);
    return [-0.48 - s * len, yc(1) + t * span, 0];
  }, 1);
  // dorsal fin
  addGrid(12, 3, (s, tt) => {
    const u = 0.3 + s * 0.38;
    const top = H * prof(u) + yc(u) + 0.008;
    const hgt = 0.075 * Math.pow(1 - s, 0.5) * Math.min(1, s * 8 + 0.15);
    return [0.5 - u - tt * 0.03 * (1 - s), top - 0.006 + tt * hgt, 0];
  }, 3);
  // pectoral + pelvic fins (fans)
  const fan = (bx, by, bz, side, R, partId, droop) => {
    const base = pos.length / 3;
    pos.push(bx, by, bz); part.push(partId);
    const n = 12;
    for (let k = 0; k <= n; k++) {
      const th = 0.15 * Math.PI + (k / n) * 0.42 * Math.PI;
      const r = R * (0.75 + 0.25 * Math.sin((k / n) * Math.PI));
      const back = Math.cos(th) * r, out = Math.sin(th) * r;
      pos.push(bx - back, by - out * droop - back * 0.15, bz + side * out * 0.95); part.push(partId);
    }
    for (let k = 0; k < n; k++) idx.push(base, base + 1 + k, base + 2 + k);
  };
  fan(0.25, -0.055, 0.05, 1, 0.13, 2, 0.45);
  fan(0.25, -0.055, -0.05, -1, 0.13, 2, 0.45);
  fan(-0.02, -0.065, 0.03, 1, 0.065, 4, 0.6);
  fan(-0.02, -0.065, -0.03, -1, 0.065, 4, 0.6);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // fins: flat normals pointing sideways/up are fine; body normals from computeVertexNormals
  const nAttr = geo.attributes.normal;
  for (let i = bodyVertCount; i < nAttr.count; i++) {
    const p = part[i];
    if (p === 1 || p === 3) nAttr.setXYZ(i, 0, 0.3, 1);
  }
  geo.computeBoundingSphere();
  geo.boundingSphere.radius = 1.0;
  return geo;
}

// ---------- varieties ----------
const C = (r, g, b) => new THREE.Vector3(r, g, b);
const WHITE = C(0.92, 0.9, 0.84), RED = C(0.8, 0.07, 0.02), ORANGE = C(0.95, 0.28, 0.03), BLACK = C(0.015, 0.015, 0.018);
const VARIETIES = [
  { name: 'kohaku', base: WHITE, spot: RED, sumi: BLACK, red: 0.05, sumiCov: 9, type: 0 },
  { name: 'kohaku2', base: WHITE, spot: RED, sumi: BLACK, red: -0.15, sumiCov: 9, type: 0 },
  { name: 'sanke', base: WHITE, spot: RED, sumi: BLACK, red: 0.1, sumiCov: 0.42, type: 0 },
  { name: 'showa', base: BLACK, spot: RED, sumi: WHITE, red: 0.0, sumiCov: 0.15, type: 0 },
  { name: 'tancho', base: WHITE, spot: RED, sumi: BLACK, red: 9, sumiCov: 9, type: 2 },
  { name: 'yamabuki', base: C(1.0, 0.62, 0.1), spot: RED, sumi: BLACK, red: 9, sumiCov: 9, type: 0, metal: 0.55 },
  { name: 'orange', base: ORANGE, spot: WHITE, sumi: BLACK, red: 0.25, sumiCov: 9, type: 0 },
  { name: 'platinum', base: C(0.85, 0.86, 0.84), spot: RED, sumi: BLACK, red: 9, sumiCov: 9, type: 0, metal: 0.55 },
  { name: 'asagi', base: C(0.28, 0.38, 0.5), spot: C(0.85, 0.22, 0.04), sumi: BLACK, red: 9, sumiCov: 9, type: 1 },
  { name: 'chagoi', base: C(0.42, 0.22, 0.08), spot: RED, sumi: BLACK, red: 9, sumiCov: 9, type: 0 },
  { name: 'kohaku3', base: WHITE, spot: C(0.85, 0.12, 0.02), sumi: BLACK, red: -0.05, sumiCov: 9, type: 0 },
  { name: 'sanke2', base: WHITE, spot: ORANGE, sumi: BLACK, red: 0.12, sumiCov: 0.38, type: 0 },
];

const VERT_HEAD = /* glsl */`
  attribute float aPart;
  uniform float uPhase; uniform float uAmp; uniform float uBend; uniform float uTime;
  varying vec3 vLocal; varying float vPart;
  float koiLat(float u){
    return uAmp * (0.06 + u * u) * 0.085 * sin(uPhase - u * 5.2) + 0.5 * uBend * u * u;
  }
  float koiSlopeU(float u){
    float s = uPhase - u * 5.2;
    return uAmp * 0.085 * (2.0 * u * sin(s) - 5.2 * (0.06 + u * u) * cos(s)) + uBend * u;
  }
`;

const FRAG_HEAD = /* glsl */`
  uniform vec3 uBase; uniform vec3 uSpot; uniform vec3 uSumi;
  uniform float uSeed; uniform float uRedCov; uniform float uSumiCov; uniform float uType; uniform float uGlow;
  varying vec3 vLocal; varying float vPart;
  ${GLSL_NOISE}
  vec3 koiColor(vec3 p, float part){
    vec3 q = p * vec3(6.5, 8.0, 8.0) + vec3(uSeed, uSeed * 0.7, uSeed * 1.3);
    float n = snoise(q) * 0.7 + snoise(q * 2.2 + 3.1) * 0.3;
    float top = smoothstep(-0.055, 0.02, p.y + 0.015 * sin(p.x * 25.0 + uSeed));
    float body = step(part, 0.5);
    vec3 col = uBase;
    float red = smoothstep(uRedCov, uRedCov + 0.05, n) * top;
    if (uType > 1.5) {
      // tancho: red circle on the head
      vec3 d = (p - vec3(0.34, 0.075, 0.0)) * vec3(1.0, 0.9, 1.15);
      red = 1.0 - smoothstep(0.042, 0.05, length(d));
    } else if (uType > 0.5) {
      // asagi: blue back with net scales, red sides and belly
      float net = abs(sin(p.x * 95.0) * sin(p.z * 60.0 + p.y * 60.0));
      col = mix(col, col * 1.35, smoothstep(0.6, 0.9, net) * smoothstep(-0.02, 0.05, p.y));
      red = smoothstep(0.02, -0.04, p.y + 0.015 * n);
    }
    // keep nose tip pale in patterned fish
    red *= mix(1.0, smoothstep(0.49, 0.43, p.x), step(uType, 0.5));
    col = mix(col, uSpot, red * body);
    float s = snoise(q * 1.6 + 11.3) * 0.6 + snoise(q * 3.6 + 7.0) * 0.4;
    float sumi = smoothstep(uSumiCov, uSumiCov + 0.04, s) * (0.4 + 0.6 * top);
    col = mix(col, uSumi, sumi * body);
    // pale belly
    col = mix(col, mix(col, vec3(0.9, 0.88, 0.8), 0.35), smoothstep(-0.03, -0.07, p.y) * body * step(uType, 1.5));
    // scales: soft reticulation
    float sc = sin(p.x * 210.0 + sin(p.y * 120.0) * 1.5) * sin(p.y * 190.0 + p.z * 190.0);
    col *= 1.0 + 0.07 * sc * body;
    if (part > 0.5) {
      // fins: translucent-looking, ray stripes, tinted by body colour
      float rays = 0.5 + 0.5 * sin((p.y * 3.0 + p.z * 3.0 - p.x * 1.0) * 70.0 + p.x * 40.0);
      vec3 fin = mix(uBase, vec3(0.95, 0.93, 0.9), 0.45);
      if (uType < 0.5 && uSumiCov < 1.0 && uBase.r < 0.1) fin = mix(uBase, vec3(0.6), 0.2);
      col = fin * (0.78 + 0.22 * rays);
    }
    // eyes
    vec2 ed = vec2(p.x - 0.405, p.y - 0.022);
    float eye = 1.0 - smoothstep(0.011, 0.014, length(ed));
    col = mix(col, vec3(0.01), eye * step(0.035, abs(p.z)) * body);
    return col;
  }
`;

function createKoiMaterial(variety, seed, uniforms) {
  const mat = new THREE.MeshStandardMaterial({
    roughness: variety.metal ? 0.32 : 0.42,
    metalness: variety.metal || 0.0,
    side: THREE.DoubleSide,
  });
  patchMaterial(mat, 'koi', {
    uniforms,
    vertexHead: VERT_HEAD,
    fragmentHead: FRAG_HEAD,
    vertex: {
      beginnormal_vertex: `#include <beginnormal_vertex>
        {
          float u = 0.5 - position.x;
          float sl = -koiSlopeU(u);
          objectNormal = normalize(vec3(objectNormal.x - sl * objectNormal.z, objectNormal.y, objectNormal.z));
        }`,
      begin_vertex: `#include <begin_vertex>
        vLocal = position; vPart = aPart;
        {
          float u = 0.5 - position.x;
          transformed.z += koiLat(u);
          if (aPart > 1.5 && aPart < 2.5) {
            float r = abs(position.z) - 0.05;
            transformed.y += sin(uTime * 2.3 + uPhase * 0.15 + sign(position.z)) * r * 0.45;
          }
          if (aPart > 3.5) {
            float r = abs(position.z) - 0.03;
            transformed.y += sin(uTime * 3.0 + sign(position.z) * 1.7) * r * 0.5;
          }
        }`,
    },
    fragment: {
      color_fragment: `#include <color_fragment>
        diffuseColor.rgb = koiColor(vLocal, vPart);`,
      emissivemap_fragment: `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * uGlow;`,
    },
  });
  return mat;
}

// ---------- simulation ----------
export class KoiSchool {
  constructor(ripples) {
    this.ripples = ripples;
    this.group = new THREE.Group();
    this.group.name = 'koi';
    this.fish = [];
    const geo = buildKoiGeometry();
    const rnd = mulberry32(2024);
    const count = VARIETIES.length;
    for (let i = 0; i < count; i++) {
      const v = VARIETIES[i];
      const seed = rnd() * 50;
      const u = {
        uTime: globals.uTime,
        uPhase: { value: rnd() * 10 },
        uAmp: { value: 1 },
        uBend: { value: 0 },
        uBase: { value: v.base },
        uSpot: { value: v.spot },
        uSumi: { value: v.sumi },
        uSeed: { value: seed },
        uRedCov: { value: v.red },
        uSumiCov: { value: v.sumiCov },
        uType: { value: v.type },
        uGlow: { value: 0.1 },
      };
      const mesh = new THREE.Mesh(geo, createKoiMaterial(v, seed, u));
      const size = 0.62 + rnd() * 0.36;
      mesh.scale.setScalar(size);
      mesh.rotation.order = 'YZX';
      // start positions spread in the pond
      let x, z;
      do { x = (rnd() - 0.5) * 7; z = (rnd() - 0.5) * 7; } while (pondSDF(x, z) > -1.4);
      const f = {
        mesh, u, size, seed: rnd() * 100,
        x, z, y: -0.35 - rnd() * 0.3, heading: rnd() * Math.PI * 2,
        omega: 0, speed: 0.3, phase: rnd() * 10,
        depthTarget: -0.4, nextRise: 6 + rnd() * 30, rising: 0, rippled: false, pitch: 0,
      };
      this.fish.push(f);
      this.group.add(mesh);
    }
  }

  update(dt, t) {
    const fish = this.fish;
    for (const f of fish) {
      // wandering turn rate from smooth noise
      let turn = vnoise3(t * 0.13, f.seed, 0.5) * 0.9 + vnoise3(t * 0.41, f.seed, 3.5) * 0.3;
      // avoid the shore: look ahead and steer toward the pond interior
      const look = 1.2 + f.speed * 1.5;
      const hx = Math.cos(f.heading), hz = Math.sin(f.heading);
      const ahead = pondSDF(f.x + hx * look, f.z + hz * look);
      const here = pondSDF(f.x, f.z);
      const danger = Math.max(0, ahead + 1.35) + Math.max(0, here + 1.0) * 1.5;
      if (danger > 0) {
        const toC = Math.atan2(-f.z, -f.x);
        const d = angleDiff(f.heading, toC);
        // sweep along the shore toward the inside
        turn += Math.sign(d || 1) * Math.min(2.2, danger * 2.2);
      }
      // separation + loose alignment
      let sepTurn = 0;
      for (const o of fish) {
        if (o === f) continue;
        const dx = o.x - f.x, dz = o.z - f.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.9 && d2 > 1e-6) {
          const ang = Math.atan2(dz, dx);
          const rel = angleDiff(f.heading, ang);
          if (Math.abs(rel) < 1.6 && Math.abs(o.y - f.y) < 0.25) sepTurn -= Math.sign(rel) * (0.9 - d2) * 2.0;
        } else if (d2 < 4) {
          sepTurn += angleDiff(f.heading, o.heading) * 0.05;
        }
      }
      turn += sepTurn;
      turn = clamp(turn, -1.6, 1.6);
      f.omega += (turn - f.omega) * Math.min(1, dt * 1.8);
      f.heading += f.omega * dt;

      // speed: cruising with occasional bursts
      const burst = Math.max(0, vnoise3(t * 0.09, f.seed + 40, 1.0) - 0.35) * 1.4;
      let targetSpeed = 0.22 + 0.12 * (0.5 + 0.5 * vnoise3(t * 0.2, f.seed, 7.0)) + burst * 0.5;
      if (f.rising > 0) targetSpeed *= 0.6;
      f.speed += (targetSpeed - f.speed) * Math.min(1, dt * 0.8);
      f.x += Math.cos(f.heading) * f.speed * dt;
      f.z += Math.sin(f.heading) * f.speed * dt;
      // hard containment
      const sd = pondSDF(f.x, f.z);
      if (sd > -0.75) {
        const r = Math.hypot(f.x, f.z) || 1;
        const push = (sd + 0.75) * Math.min(1, dt * 3);
        f.x -= (f.x / r) * push; f.z -= (f.z / r) * push;
      }

      // depth: drift, occasionally rise to the surface to "kiss" it
      f.nextRise -= dt;
      if (f.nextRise <= 0 && f.rising <= 0) { f.rising = 5.5; f.rippled = false; }
      let depthT = -0.32 - 0.22 * (0.5 + 0.5 * vnoise3(t * 0.07, f.seed + 9, 2.0));
      if (f.rising > 0) {
        f.rising -= dt;
        depthT = -0.05 * f.size;
        if (f.rising <= 0) f.nextRise = 12 + Math.random() * 30;
      }
      const floor = terrainHeight(f.x, f.z) + 0.14;
      depthT = Math.max(depthT, floor);
      const prevY = f.y;
      f.y += (depthT - f.y) * Math.min(1, dt * (f.rising > 0 ? 0.9 : 0.35));
      const vy = (f.y - prevY) / Math.max(dt, 1e-4);
      f.pitch += (clamp(vy / Math.max(f.speed, 0.1), -0.5, 0.5) - f.pitch) * Math.min(1, dt * 2);
      if (f.rising > 0 && !f.rippled && f.y > -0.09 * f.size - 0.01) {
        f.rippled = true;
        const hx2 = f.x + Math.cos(f.heading) * 0.42 * f.size, hz2 = f.z + Math.sin(f.heading) * 0.42 * f.size;
        this.ripples.add(hx2, hz2, t, 0.012);
        this.ripples.add(hx2, hz2, t + 0.7, 0.007);
      }

      // tail beat
      const freq = 0.9 + f.speed * 3.2 + Math.abs(f.omega) * 0.4;
      f.phase += dt * freq * Math.PI * 2;
      f.u.uPhase.value = f.phase;
      f.u.uAmp.value = 0.6 + f.speed * 1.6 + Math.abs(f.omega) * 0.3;
      const kappa = clamp(f.omega / Math.max(f.speed, 0.12), -2.5, 2.5);
      f.u.uBend.value = lerp(f.u.uBend.value, kappa * 0.55, Math.min(1, dt * 4));

      f.mesh.position.set(f.x, f.y, f.z);
      f.mesh.rotation.y = -f.heading;
      f.mesh.rotation.z = f.pitch;
    }
  }
}
