// Procedural rocks around the pond edge + a shared stone material.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm3, mulberry32, patchMaterial, GLSL_NOISE } from './util.js';
import { edgePoint, terrainHeight, pondSDF } from './pond.js';

export function createStoneMaterial(color = 0x8a877f, moss = 1.0) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0 });
  patchMaterial(mat, 'stone', {
    uniforms: { uMoss: { value: moss } },
    vertexHead: 'varying vec3 vWPos; varying vec3 vWN;',
    vertex: {
      worldpos_vertex: `#include <worldpos_vertex>
        {
          vec4 wp = vec4(transformed, 1.0);
          vec3 wn = objectNormal;
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
            wn = mat3(instanceMatrix) * wn;
          #endif
          vWPos = (modelMatrix * wp).xyz;
          vWN = normalize(mat3(modelMatrix) * wn);
        }`,
    },
    fragmentHead: 'uniform float uMoss; varying vec3 vWPos; varying vec3 vWN;\n' + GLSL_NOISE,
    fragment: {
      color_fragment: `#include <color_fragment>
        {
          vec3 p = vWPos;
          float n1 = snoise(p * 2.3);
          float n2 = snoise(p * 9.0);
          vec3 stone = diffuseColor.rgb * (0.8 + 0.22 * n1 + 0.14 * n2);
          // warm / cool mineral variation
          stone *= mix(vec3(1.06, 1.0, 0.92), vec3(0.92, 0.98, 1.06), 0.5 + 0.5 * n1);
          // lichen speckles
          float li = smoothstep(0.62, 0.7, snoise(p * 6.0 + 13.0));
          stone = mix(stone, vec3(0.42, 0.45, 0.36), li * 0.3);
          // moss on top surfaces
          float up = vWN.y + 0.3 * n1 + 0.12 * n2;
          float moss = smoothstep(0.45, 0.8, up) * uMoss * smoothstep(0.02, 0.12, p.y);
          vec3 mossCol = mix(vec3(0.05, 0.11, 0.02), vec3(0.13, 0.2, 0.04), 0.5 + 0.5 * n2);
          stone = mix(stone, mossCol, moss);
          // wet near and under the waterline
          float wet = 1.0 - smoothstep(0.0, 0.1, p.y);
          stone *= mix(1.0, 0.5, wet);
          float under = 1.0 - smoothstep(-0.1, 0.0, p.y);
          stone = mix(stone, stone * vec3(0.55, 0.75, 0.5), under);
          diffuseColor.rgb = stone;
        }`,
      roughnessmap_fragment: `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.3, 1.0 - smoothstep(0.0, 0.1, vWPos.y));`,
    },
  });
  return mat;
}

export function makeRockGeometry(seed, detail = 7, angular = 0.6) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const rnd = mulberry32(seed * 977 + 13);
  const planes = [];
  for (let i = 0; i < 5; i++) {
    const n = new THREE.Vector3(rnd() - 0.5, (rnd() - 0.3) * 0.8, rnd() - 0.5).normalize();
    planes.push({ n, d: 0.72 + rnd() * 0.2 });
  }
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let r = 1 + 0.22 * fbm3(v.x * 1.4 + seed, v.y * 1.4, v.z * 1.4 - seed, 4);
    r += 0.03 * fbm3(v.x * 6 + seed, v.y * 6, v.z * 6, 2);
    v.multiplyScalar(r);
    for (const pl of planes) {
      const dd = v.dot(pl.n);
      if (dd > pl.d) v.addScaledVector(pl.n, -(dd - pl.d) * angular);
    }
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.3;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function createRocks() {
  const rnd = mulberry32(4242);
  const geos = [];
  for (let i = 0; i < 6; i++) geos.push(makeRockGeometry(i + 1, 7, 0.4 + 0.15 * i));
  const mat = createStoneMaterial(0x8b8981, 1.0);
  const placements = geos.map(() => []);

  const place = (x, z, sx, sy, sz, rotY, sink, gi) => {
    const y = terrainHeight(x, z) + sy * (0.35 - sink);
    placements[gi].push({ x, y, z, sx, sy, sz, rotY, tint: 0.8 + rnd() * 0.35 });
  };

  // Ring of edge stones
  let a = 0;
  while (a < Math.PI * 2 - 0.05) {
    let s = 0.22 + rnd() * 0.3;
    if (rnd() < 0.1) s = 0.6 + rnd() * 0.3; // accent stones
    const e = edgePoint(a, s * (0.15 + rnd() * 0.5) - 0.05);
    const gi = Math.floor(rnd() * geos.length);
    place(e.x, e.y, s * (1.1 + rnd() * 0.4), s * (0.55 + rnd() * 0.35), s * (0.9 + rnd() * 0.3), rnd() * 6.28, 0.25 + rnd() * 0.2, gi);
    // a second smaller stone tucked behind sometimes
    if (rnd() < 0.45) {
      const s2 = s * (0.4 + rnd() * 0.3);
      const e2 = edgePoint(a + (rnd() - 0.5) * 0.08, s + s2 * 0.6);
      place(e2.x, e2.y, s2 * 1.2, s2 * 0.7, s2, rnd() * 6.28, 0.2, Math.floor(rnd() * geos.length));
    }
    a += (s * 1.15 + 0.05) / 4.8 + rnd() * 0.06;
  }
  // A couple of stones rising out of the water
  [[2.35, -1.9, 0.5], [-1.0, 3.3, 0.38]].forEach(([x, z, s], i) => {
    place(x, z, s * 1.3, s * 1.1, s, i * 2.1, 0.05, i);
  });
  // Scattered bank stones
  for (let i = 0; i < 22; i++) {
    const ang = rnd() * Math.PI * 2;
    const e = edgePoint(ang, 1.2 + rnd() * 5.0);
    const s = 0.15 + rnd() * 0.35;
    place(e.x, e.y, s * 1.2, s * 0.6, s, rnd() * 6.28, 0.3, Math.floor(rnd() * geos.length));
  }

  const group = new THREE.Group();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  geos.forEach((g, gi) => {
    const list = placements[gi];
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(g, mat, list.length);
    list.forEach((r, i) => {
      p.set(r.x, r.y, r.z);
      q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.15, r.rotY, (rnd() - 0.5) * 0.15));
      sc.set(r.sx, r.sy, r.sz);
      m.compose(p, q, sc);
      mesh.setMatrixAt(i, m);
      col.setRGB(r.tint, r.tint * 0.98, r.tint * 0.95);
      mesh.setColorAt(i, col);
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  });
  // collision list (for grass placement avoidance)
  const blockers = placements.flat().map((r) => ({ x: r.x, z: r.z, r: Math.max(r.sx, r.sz) * 0.9 }));
  return { group, geos, material: mat, blockers };
}
