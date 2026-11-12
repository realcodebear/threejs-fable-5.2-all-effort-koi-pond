// Stones around the pond edge: a handful of procedurally sculpted rock shapes, instanced many
// times with different sizes and orientations. Moss on top, a dark wet band at the waterline.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng, noise3, fbm3, pondBoundary, sdf, sdfGrad, groundHeight, patchStandard } from './common.js';
import { uNoise3 } from './noisetex.js';

function makeRockGeometry(rng, detail) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const pos = g.attributes.position;
  const seed = rng.range(0, 100);
  // random cutting planes give the faceted, fractured look of real rock
  const planes = [];
  const nPlanes = rng.int(5, 8);
  for (let i = 0; i < nPlanes; i++) {
    const n = new THREE.Vector3(rng.gauss(), rng.gauss() * 0.8, rng.gauss()).normalize();
    planes.push({ n, o: rng.range(0.62, 0.9) });
  }
  planes.push({ n: new THREE.Vector3(rng.range(-0.15, 0.15), 1, rng.range(-0.15, 0.15)).normalize(), o: rng.range(0.6, 0.85) });
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const dir = v.clone();
    let r = 1.0 + 0.55 * (fbm3(dir.x * 1.1 + seed, dir.y * 1.1 + seed * 0.7, dir.z * 1.1 - seed, 3) - 0.47);
    v.multiplyScalar(r);
    for (const p of planes) {
      const d = v.dot(p.n) - p.o;
      if (d > 0) v.addScaledVector(p.n, -d * 0.86);
    }
    const s = 1.0 + 0.10 * (noise3(dir.x * 4.3 + seed, dir.y * 4.3, dir.z * 4.3 + seed) - 0.5)
                  + 0.035 * (noise3(dir.x * 11.0, dir.y * 11.0 + seed, dir.z * 11.0) - 0.5);
    v.multiplyScalar(s);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export function createStoneMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.0 });
  mat.envMapIntensity = 1.0;
  patchStandard(mat, {
    name: 'stone',
    uniforms: { tNoise3: uNoise3 },
    vertexPars: /* glsl */`
      attribute float aBase;
      varying float vBase;
    `,
    vertex: /* glsl */`
      vBase = aBase;
    `,
    fragmentPars: /* glsl */`
      precision highp sampler3D;
      uniform sampler3D tNoise3;
      varying float vBase;
      float gRough; float gBump;
    `,
    color: /* glsl */`
      {
        vec3 tint = diffuseColor.rgb;
        vec3 p = vWPos;
        // all the rock detail comes from a tileable 3D noise texture sampled at several scales
        vec4 na = texture(tNoise3, p * 0.37);                 // broad colour variation
        vec4 nb = texture(tNoise3, p * 1.9 + 0.31);           // medium
        vec4 nc = texture(tNoise3, p * 7.3 + 0.67);           // speckle / grain
        float n = na.r * 0.6 + nb.r * 0.4;
        float speck = nc.a * 0.6 + nc.b * 0.4;
        float strata = texture(tNoise3, vec3(p.x * 0.3, p.y * 3.1 + na.g * 0.8, p.z * 0.3)).b;
        vec3 rock = mix(vec3(0.050, 0.054, 0.062), vec3(0.185, 0.180, 0.172), smoothstep(0.25, 0.8, n));
        rock = mix(rock, vec3(0.125, 0.105, 0.092), smoothstep(0.45, 0.75, na.g) * 0.55);
        rock *= 0.80 + 0.28 * strata;
        rock *= 0.74 + 0.52 * speck;
        rock *= tint;
        float lich = smoothstep(0.66, 0.76, nb.g) * smoothstep(0.10, 0.30, p.y);
        rock = mix(rock, vec3(0.30, 0.32, 0.25), lich * 0.30);

        float up = normalize(vWNormal).y;
        float mossMask = smoothstep(0.36, 0.80, up + (nb.b - 0.5) * 1.3 + (na.b - 0.5) * 0.5) * smoothstep(0.05, 0.24, p.y);
        mossMask *= smoothstep(0.30, 0.56, na.g);
        vec3 moss = mix(vec3(0.030, 0.085, 0.020), vec3(0.105, 0.165, 0.035), nc.g) * (0.70 + 0.60 * nc.a);
        vec3 col = mix(rock, moss, mossMask);

        float wet = smoothstep(0.085, 0.012, p.y + (nb.a - 0.5) * 0.06);
        col *= mix(1.0, 0.40, wet);
        float uw = smoothstep(0.0, -0.10, p.y);
        col = mix(col, col * vec3(0.55, 0.85, 0.55), uw * 0.7);
        // contact shading: darker where a stone meets the ground
        col *= mix(0.42, 1.0, smoothstep(vBase - 0.03, vBase + 0.24, p.y));

        gRough = mix(mix(0.80, 0.96, mossMask), 0.20, wet * (1.0 - uw));
        gBump = mix(n * 0.7 + speck * 0.30 + strata * 0.3, nc.a * 0.5, mossMask);
        diffuseColor.rgb = col;
      }
    `,
    roughness: /* glsl */`
      roughnessFactor = gRough;
    `,
    normal: /* glsl */`
      normal = bumpNormal(normal, -vViewPosition, gBump, 0.022);
    `,
  });
  return mat;
}

// Returns { group, stones:[{x,z,r,top}] }
export function createStones() {
  const rng = makeRng(4242);
  const group = new THREE.Group();
  group.name = 'stones';
  const material = createStoneMaterial();

  const variants = [];
  for (let i = 0; i < 5; i++) variants.push({ geo: makeRockGeometry(rng, 7), list: [] });   // large / medium
  for (let i = 0; i < 4; i++) variants.push({ geo: makeRockGeometry(rng, 3), list: [] });   // small
  const stones = [];
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const b = new THREE.Vector2(), g = new THREE.Vector2();

  function addStone(x, z, size, opts = {}) {
    const big = size > 0.16;
    const v = big ? variants[rng.int(0, 4)] : variants[rng.int(5, 8)];
    const sx = size * rng.range(0.85, 1.35), sz = size * rng.range(0.85, 1.35);
    const sy = size * (opts.flat ? rng.range(0.30, 0.42) : rng.range(0.55, 0.92)) * (opts.tall || 1);
    const base = opts.y !== undefined ? opts.y : groundHeight(x, z);
    const y = base + sy * (opts.sink !== undefined ? opts.sink : rng.range(0.18, 0.42));
    dummy.position.set(x, y, z);
    dummy.rotation.set(rng.range(-0.18, 0.18), rng.range(0, Math.PI * 2), rng.range(-0.18, 0.18));
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    const shade = rng.range(0.78, 1.18);
    col.setRGB(shade * rng.range(0.94, 1.06), shade * rng.range(0.96, 1.04), shade * rng.range(0.94, 1.08));
    v.list.push({ m: dummy.matrix.clone(), c: col.clone(), base });
    const s = { x, z, r: Math.max(sx, sz) * 0.95, top: y + sy * 0.8 };
    stones.push(s);
    return s;
  }

  // --- ring of stones straddling the waterline ---
  let t = 0.15;
  const feature = [0.55, 1.75, 2.9, 4.05, 5.2, 6.0];      // angles of the large accent stones
  let fi = 0;
  while (t < Math.PI * 2 + 0.1) {
    let size;
    if (fi < feature.length && t >= feature[fi]) { size = rng.range(0.30, 0.44); fi++; }
    else size = rng() < 0.3 ? rng.range(0.19, 0.27) : rng.range(0.10, 0.18);
    pondBoundary(t, b);
    sdfGrad(b.x, b.y, g);                                   // points into the pond
    const out = size * rng.range(0.15, 0.55);
    addStone(b.x - g.x * out, b.y - g.y * out, size);
    // advance along the outline by roughly one stone width
    const e = 0.01;
    const b2 = pondBoundary(t + e, new THREE.Vector2());
    const speed = b2.distanceTo(b) / e;
    t += (size * rng.range(1.35, 1.9)) / speed;
  }
  // --- second, looser row on the bank and small fillers ---
  for (let i = 0; i < 70; i++) {
    const a = rng.range(0, Math.PI * 2);
    pondBoundary(a, b);
    sdfGrad(b.x, b.y, g);
    const out = rng.range(0.25, 0.95);
    const size = rng() < 0.2 ? rng.range(0.13, 0.21) : rng.range(0.05, 0.11);
    addStone(b.x - g.x * out, b.y - g.y * out, size, { sink: rng.range(0.05, 0.3) });
  }
  // --- submerged stones near the shore ---
  for (let i = 0; i < 46; i++) {
    const a = rng.range(0, Math.PI * 2);
    pondBoundary(a, b);
    sdfGrad(b.x, b.y, g);
    const inn = rng.range(0.12, 0.7);
    const size = rng.range(0.05, 0.15);
    addStone(b.x + g.x * inn, b.y + g.y * inn, size, { sink: rng.range(0.1, 0.4), noOcc: true });
  }
  // --- scattered rocks further out on the moss ---
  for (let i = 0; i < 36; i++) {
    const a = rng.range(0, Math.PI * 2), rad = rng.range(5.0, 11.5);
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    if (sdf(x, z) > -1.2) continue;
    addStone(x, z, rng() < 0.25 ? rng.range(0.18, 0.34) : rng.range(0.07, 0.15), { sink: rng.range(0.0, 0.25) });
  }

  for (const v of variants) {
    if (!v.list.length) continue;
    const mesh = new THREE.InstancedMesh(v.geo, material, v.list.length);
    const base = new Float32Array(v.list.length);
    v.list.forEach((s, i) => { mesh.setMatrixAt(i, s.m); mesh.setColorAt(i, s.c); base[i] = s.base; });
    v.geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 1));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return { group, stones, material, addStone };
}
