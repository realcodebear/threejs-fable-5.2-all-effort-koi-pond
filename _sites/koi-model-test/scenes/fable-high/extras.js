// Fireflies and drifting maple leaves.
import * as THREE from 'three';
import { pondSD, pondPoint, terrainHeight, setLayers, uTime, mulberry32 } from './common.js';
import { mapleLeafGeometry, leafMaterial, LEAF_COLORS } from './garden.js';

export function createFireflies(rng, count = 70) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const p = pondPoint(rng() * Math.PI * 2, -1.2 + rng() * 5.5);
    pos[i * 3] = p.x; pos[i * 3 + 1] = 0.35 + rng() * 1.5; pos[i * 3 + 2] = p.z;
    seed[i * 4] = rng() * 6.28; seed[i * 4 + 1] = rng() * 6.28; seed[i * 4 + 2] = 0.5 + rng(); seed[i * 4 + 3] = rng();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uScale: { value: 1 } },
    vertexShader: /* glsl */`
      uniform float uTime, uScale; attribute vec4 aSeed; varying float vB;
      void main(){
        float t = uTime * aSeed.z;
        vec3 p = position;
        p.x += sin(t * 0.23 + aSeed.x) * 0.9 + sin(t * 0.61 + aSeed.y) * 0.3;
        p.z += cos(t * 0.19 + aSeed.y) * 0.9 + sin(t * 0.53 + aSeed.x * 2.0) * 0.3;
        p.y += sin(t * 0.37 + aSeed.x * 3.0) * 0.28 + sin(t * 0.9 + aSeed.y) * 0.08;
        p.y = max(p.y, 0.12);
        float pulse = sin(uTime * (0.7 + aSeed.w * 0.9) + aSeed.x * 5.0);
        vB = smoothstep(-0.25, 0.9, pulse);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(uScale * (0.03 + 0.018 * vB) / max(-mv.z, 0.3), 2.0, 13.0);
      }`,
    fragmentShader: /* glsl */`
      varying float vB;
      void main(){
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(q, q);
        float a = exp(-r2 * 7.0) * 1.0 + exp(-r2 * 1.8) * 0.16;
        a *= 1.0 - smoothstep(0.6, 1.0, r2);
        gl_FragColor = vec4(vec3(1.25, 1.5, 0.35) * a * vB * 4.0, 1.0);
      }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  setLayers(pts, { reflect: true });
  return { points: pts, setScale: (pxPerUnit) => { mat.uniforms.uScale.value = pxPerUnit; } };
}

// Leaves that fall from the maple, land on the water (with a ripple), float a while and fade.
export function createFallingLeaves(maple, sim, count = 44) {
  const rng = mulberry32(99);
  const mesh = new THREE.InstancedMesh(mapleLeafGeometry(), leafMaterial(0.0), count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  setLayers(mesh, { reflect: true });
  const col = new THREE.Color();
  const leaves = [];
  const c = maple.canopy;
  const spawn = (L, initial) => {
    L.s = 0.05 + rng() * 0.03;
    L.rx = rng() * 6.28; L.ry = rng() * 6.28; L.rz = rng() * 6.28;
    L.ph = rng() * 6.28;
    L.fade = 1;
    if (initial && rng() < 0.5) {
      // already floating somewhere on the pond
      for (let k = 0; k < 30; k++) {
        const p = pondPoint(rng() * 6.28, -0.2 - rng() * 2.2);
        L.x = p.x; L.z = p.z;
        if (pondSD(L.x, L.z) < -0.15) break;
      }
      L.y = 0.008; L.mode = 1; L.life = 20 + rng() * 70; L.rx = 0; L.rz = 0;
    } else {
      L.x = c.min.x + rng() * (c.max.x - c.min.x) + 0.6;
      L.z = c.min.z + rng() * (c.max.z - c.min.z) + 0.5;
      L.y = initial ? 0.3 + rng() * 3 : c.min.y + rng() * 1.2;
      L.mode = 0; L.wait = initial ? 0 : rng() * 14;
      L.vy = 0.28 + rng() * 0.2;
    }
  };
  for (let i = 0; i < count; i++) {
    const L = {}; spawn(L, true); leaves.push(L);
    const cc = LEAF_COLORS[Math.floor(rng() * LEAF_COLORS.length)];
    const g = 0.7 + rng() * 0.4;
    mesh.setColorAt(i, col.setRGB(cc[0] * g, cc[1] * g, cc[2] * g));
  }
  const d = new THREE.Object3D();
  function update(t, dt) {
    for (let i = 0; i < count; i++) {
      const L = leaves[i];
      if (L.mode === 0) {
        if (L.wait > 0) { L.wait -= dt; d.scale.setScalar(0.0001); d.position.set(L.x, L.y, L.z); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix); continue; }
        // flutter down, drifting towards the pond
        const sw = Math.sin(t * 1.7 + L.ph);
        L.x += (0.22 + 0.35 * sw) * dt;
        L.z += (0.14 + 0.3 * Math.cos(t * 1.3 + L.ph * 1.7)) * dt;
        L.y -= L.vy * (0.75 + 0.35 * Math.cos(t * 3.4 + L.ph * 2.0)) * dt;
        L.rx += dt * (1.6 + sw); L.rz += dt * 1.1; L.ry += dt * 0.7;
        const inPond = pondSD(L.x, L.z) < -0.05;
        const floor = inPond ? 0.008 : terrainHeight(L.x, L.z) + 0.02;
        if (L.y <= floor) {
          L.y = floor;
          if (inPond) { L.mode = 1; L.life = 50 + rng() * 60; sim.addDrop(L.x, L.z, 0.05, 0.045); }
          else { L.mode = 2; L.life = 12 + rng() * 20; }
        }
      } else {
        L.life -= dt;
        if (L.mode === 1) {
          // float: slow drift, settle flat
          L.x += (0.012 * Math.sin(t * 0.07 + L.ph) + 0.006) * dt;
          L.z += 0.012 * Math.cos(t * 0.06 + L.ph * 1.3) * dt;
          L.ry += dt * 0.05 * Math.sin(L.ph);
          if (pondSD(L.x, L.z) > -0.12) L.life = Math.min(L.life, 2);
          L.y = 0.008 + 0.002 * Math.sin(t * 1.2 + L.ph);
        }
        L.rx += (0 - Math.sin(L.rx)) * Math.min(1, dt * 4) * 0.5; L.rx *= 1 - Math.min(1, dt * 3);
        L.rz *= 1 - Math.min(1, dt * 3);
        if (L.life < 2) L.fade = Math.max(L.life / 2, 0);
        if (L.life <= 0) { spawn(L, false); }
      }
      d.position.set(L.x, L.y, L.z);
      d.rotation.set(L.rx, L.ry, L.rz);
      d.scale.setScalar(L.s * L.fade + 0.0001);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { mesh, update };
}
