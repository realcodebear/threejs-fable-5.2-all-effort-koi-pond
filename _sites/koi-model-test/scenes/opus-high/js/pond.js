// Pond shape (signed distance), terrain height, terrain mesh, pond-bottom pebbles.
import * as THREE from 'three';
import { fbm3, vnoise3, smoothstep, mulberry32, patchMaterial, GLSL_NOISE } from './util.js';

export const POND_R = 4.7;

export function pondRadius(a) {
  return POND_R * (1 + 0.13 * Math.sin(2 * a + 0.6) + 0.07 * Math.sin(3 * a + 2.1) + 0.035 * Math.sin(5 * a + 0.3));
}

// Approximate signed distance to the pond edge (negative inside).
export function pondSDF(x, z) {
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  return (r - pondRadius(a)) * 0.9;
}

// Point on the pond edge at angle a, pushed outward by `off`.
export function edgePoint(a, off = 0) {
  const r = pondRadius(a) + off;
  return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
}

export function terrainHeight(x, z) {
  const d = pondSDF(x, z);
  if (d < 0) {
    const t = smoothstep(0, 1.8, -d);
    return -0.05 - 1.08 * t + 0.06 * vnoise3(x * 0.9, 0.5, z * 0.9) * t;
  }
  let h = -0.05 + 0.3 * smoothstep(0, 0.5, d);
  h += 0.35 * smoothstep(0.4, 3.0, d) * (0.5 + 0.5 * fbm3(x * 0.22, 1.3, z * 0.22, 3));
  const r = Math.hypot(x, z);
  h += smoothstep(9, 18, r) * 1.4;
  return h;
}

export function createTerrain() {
  const size = 70, seg = 280;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = terrainHeight(x, z);
    pos.setY(i, y);
    const d = pondSDF(x, z);
    const n1 = fbm3(x * 0.6, 2.0, z * 0.6, 3);
    const n2 = fbm3(x * 2.1, 5.0, z * 2.1, 2);
    if (d < 0.02) {
      // pond bottom: silt with algae
      const silt = new THREE.Color(0.16, 0.13, 0.08);
      const algae = new THREE.Color(0.07, 0.11, 0.045);
      c.copy(silt).lerp(algae, smoothstep(-0.3, 0.4, n1));
      c.multiplyScalar(0.8 + 0.35 * n2);
    } else {
      const moss = new THREE.Color(0.05, 0.10, 0.03);
      const moss2 = new THREE.Color(0.10, 0.15, 0.04);
      const soil = new THREE.Color(0.09, 0.065, 0.04);
      c.copy(moss).lerp(moss2, smoothstep(-0.2, 0.5, n2));
      c.lerp(soil, smoothstep(0.1, 0.45, n1) * 0.8);
      // wet dark band near the water
      const wet = 1 - smoothstep(0.0, 0.5, d);
      c.lerp(new THREE.Color(0.05, 0.04, 0.03), wet * 0.9);
    }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  patchMaterial(mat, 'terrain', {
    vertexHead: 'varying vec3 vWPos;',
    vertex: {
      worldpos_vertex: '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;',
    },
    fragmentHead: 'varying vec3 vWPos;\n' + GLSL_NOISE,
    fragment: {
      color_fragment: `#include <color_fragment>
        {
          float n = snoise(vWPos * 7.0);
          diffuseColor.rgb *= 0.82 + 0.25 * n;
          if (vWPos.y < -0.02) {
            // tiny pebble speckle under water
            float pb = smoothstep(0.55, 0.75, snoise(vWPos * 13.0 + 4.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.19, 0.15), pb * 0.6);
          } else {
            diffuseColor.rgb *= 0.88 + 0.24 * snoise(vWPos * 21.0);
          }
        }`,
      roughnessmap_fragment: `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.45, 1.0 - smoothstep(-0.02, 0.12, vWPos.y));`,
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  return mesh;
}

// Small instanced stones scattered on the pond floor (visible through the water).
export function createPebbles(stoneGeos, stoneMat) {
  const rnd = mulberry32(77);
  const group = new THREE.Group();
  const count = 260;
  const geo = stoneGeos[0];
  const mesh = new THREE.InstancedMesh(geo, stoneMat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  let n = 0;
  while (n < count) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 6;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const d = pondSDF(x, z);
    if (d > -0.1) continue;
    // concentrate near the edges
    if (d < -1.6 && rnd() < 0.6) continue;
    const sc = 0.05 + Math.pow(rnd(), 2) * 0.14;
    p.set(x, terrainHeight(x, z) + sc * 0.1, z);
    q.setFromEuler(new THREE.Euler(0, rnd() * 6.28, 0));
    s.set(sc, sc * 0.6, sc * (0.7 + rnd() * 0.5));
    m.compose(p, q, s);
    mesh.setMatrixAt(n, m);
    const g = 0.55 + rnd() * 0.5;
    col.setRGB(g, g * (0.92 + rnd() * 0.1), g * 0.85);
    mesh.setColorAt(n, col);
    n++;
  }
  group.add(mesh);
  return group;
}
