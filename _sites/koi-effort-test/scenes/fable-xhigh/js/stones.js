// Procedural boulders: chiselled, noise-eroded shapes, instanced around the pond.
import * as THREE from 'three';
import { OCC_EXT, mulberry32, fbm3, noise3, edgePoint, groundH, pondD, lerp, patchStandard } from './common.js';

// Soft intersection of random half-spaces gives flat faces with rounded edges.
function makeRockGeometry(seed, detail, sy, sz, opts = {}) {
  const rng = mulberry32(seed);
  const planes = [];
  const np = opts.planes ?? (9 + Math.floor(rng() * 6));
  for (let i = 0; i < np; i++) {
    const v = new THREE.Vector3(rng() * 2 - 1, (rng() * 2 - 1) * 0.9, rng() * 2 - 1).normalize();
    planes.push({ n: v, d: lerp(0.72, 1.0, rng()) });
  }
  const P = opts.sharp ?? 9;
  const amp = opts.amp ?? 0.16;
  const so = seed * 13.37;
  const radius = (d) => {
    let s = 0;
    for (const p of planes) { const k = d.dot(p.n) / p.d; if (k > 0) s += Math.pow(k, P); }
    let r = Math.pow(s + 1e-9, -1 / P);
    r = Math.min(r, 1.25);
    r *= 1 + amp * (fbm3(d.x * 1.6 + so, d.y * 1.6, d.z * 1.6, 3) - 0.5) + 0.05 * (noise3(d.x * 5 + so, d.y * 5, d.z * 5) - 0.5);
    return r;
  };
  const point = (d, out) => { const r = radius(d); return out.set(d.x * r, d.y * r * sy, d.z * r * sz); };

  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  const d = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), d1 = new THREE.Vector3(), d2 = new THREE.Vector3();
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), n = new THREE.Vector3();
  const eps = 0.02;
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    t1.set(-d.z, 0, d.x); if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0); t1.normalize();
    t2.crossVectors(d, t1).normalize();
    point(d, p0);
    point(d1.copy(d).addScaledVector(t1, eps).normalize(), p1);
    point(d2.copy(d).addScaledVector(t2, eps).normalize(), p2);
    n.crossVectors(p1.sub(p0), p2.sub(p0)).normalize();
    if (n.dot(d) < 0) n.negate();
    pos.setXYZ(i, p0.x, p0.y, p0.z);
    nrm.setXYZ(i, n.x, n.y, n.z);
  }
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

export function makeStoneMaterial(ctx, moss = 1.0) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.0 });
  patchStandard(mat, {
    key: 'stone',
    uniforms: { uOcc: ctx.uOcc, uMossAmt: { value: moss } },
    fragPars: /* glsl */`
      uniform sampler2D uOcc; uniform float uMossAmt;
      float sWet; float sMoss; float sUnder; float sBump;
    `,
    fragColor: /* glsl */`
    {
      vec3 wp = vWPos; vec3 wn = normalize(vWNrm);
      float n1 = fbm3(wp * 3.2);
      float n2 = vnoise3(wp * 13.0);
      float n3 = vnoise3(wp * 60.0);
      vec3 rock = mix(vec3(0.050, 0.053, 0.060), vec3(0.215, 0.21, 0.20), n1 * n1 * 1.25);
      rock *= 0.70 + 0.45 * n2;
      rock = mix(rock, rock * vec3(1.25, 1.0, 0.78), smoothstep(0.45, 0.8, vnoise3(wp * 1.9 + 5.0)) * 0.6);
      rock *= 0.78 + 0.45 * n3;
      float lich = smoothstep(0.68, 0.80, vnoise3(wp * 8.0 + 3.3)) * smoothstep(0.0, 0.5, wn.y);
      rock = mix(rock, vec3(0.29, 0.30, 0.25), lich * 0.5);
      // moss only settles on some stones, and only on their flatter tops
      float mossAmt = smoothstep(0.38, 0.62, vnoise3(wp * 0.85 + 2.0)) * uMossAmt;
      float mossM = smoothstep(0.55, 0.88, wn.y + (n1 - 0.5) * 1.1 + (n2 - 0.5) * 0.4) * smoothstep(0.04, 0.16, wp.y) * mossAmt;
      vec3 mossC = mix(vec3(0.028, 0.06, 0.012), vec3(0.085, 0.14, 0.028), n2) * (0.65 + 0.7 * n3);
      vec3 col = mix(rock, mossC, mossM);
      float wet = smoothstep(0.10, 0.0, wp.y);
      col *= mix(1.0, 0.42, wet);
      float under = smoothstep(0.0, -0.05, wp.y);
      col = mix(col, col * vec3(0.55, 0.85, 0.55), under * 0.7);
      col *= mix(1.0, 0.6, smoothstep(0.0, -0.9, wp.y));
      vec3 occ = texture2D(uOcc, vec2(wp.x, -wp.z) / ${OCC_EXT.toFixed(1)} + 0.5).rgb;
      col *= 1.0 - 0.35 * occ.b;
      // crevice darkening where stones meet the ground
      col *= mix(0.55, 1.0, smoothstep(-0.02, 0.22, wp.y) + under);
      diffuseColor.rgb *= col;
      sWet = wet * (1.0 - under); sMoss = mossM; sUnder = under;
      sBump = n1 * 0.035 + n2 * 0.010 + n3 * 0.0025;
    }`,
    fragRough: /* glsl */`roughnessFactor = mix(mix(0.80, 0.97, sMoss), 0.22, sWet);`,
    fragNormal: /* glsl */`normal = bumpNormal(-vViewPosition, normal, sBump * mix(1.0, 0.35, sMoss));`,
  });
  return mat;
}

export function createStones(ctx) {
  const rng = mulberry32(4242);
  const mat = ctx.stoneMat;
  const variants = [
    makeRockGeometry(11, 9, 0.62, 0.86),
    makeRockGeometry(23, 9, 0.55, 0.95),
    makeRockGeometry(37, 9, 0.72, 0.80),
    makeRockGeometry(41, 9, 0.50, 0.90),
    makeRockGeometry(59, 9, 0.66, 1.00),
    makeRockGeometry(67, 7, 0.24, 0.92, { planes: 6, amp: 0.10 }), // flat stepping stone
    // the same five shapes again at low detail, for pebbles
    makeRockGeometry(11, 4, 0.62, 0.86),
    makeRockGeometry(23, 4, 0.55, 0.95),
    makeRockGeometry(37, 4, 0.72, 0.80),
    makeRockGeometry(41, 4, 0.50, 0.90),
    makeRockGeometry(59, 4, 0.66, 1.00),
  ];
  const lists = variants.map(() => []);
  const placed = ctx.stonesPlaced;
  const add = (v, x, y, z, s, yScale = 1, rot = rng() * Math.PI * 2, tilt = 0.12, tint = null) => {
    if (v < 5 && s < 0.21) v += 6;
    lists[v].push({ x, y, z, s, yScale, rot, tx: (rng() - 0.5) * 2 * tilt, tz: (rng() - 0.5) * 2 * tilt, tint: tint ?? (0.78 + rng() * 0.4), warm: rng() });
    placed.push({ x, z, r: s * 0.95 });
  };

  // ring of edging stones straddling the waterline
  let th = 0.15;
  while (th < Math.PI * 2 + 0.1) {
    const big = rng() < 0.13;
    const s = big ? lerp(0.36, 0.50, rng()) : lerp(0.14, 0.30, Math.pow(rng(), 1.2));
    const e = edgePoint(th, s * lerp(0.05, 0.45, rng()));
    add(Math.floor(rng() * 5), e.x, -0.10 * s - 0.03, e.z, s, 1.3);
    th += (s * lerp(1.2, 1.55, rng())) / e.ds;
  }
  // second, looser row of small stones and pebbles
  th = 0;
  while (th < Math.PI * 2) {
    const s = lerp(0.05, 0.19, Math.pow(rng(), 1.6));
    const e = edgePoint(th, lerp(0.30, 1.1, rng()));
    if (rng() < 0.6) add(Math.floor(rng() * 5), e.x, groundH(e.x, e.z) - 0.12 * s, e.z, s, 1.0);
    th += lerp(0.2, 0.6, rng()) / e.ds;
  }
  // feature boulders (angle on the outline, distance outside it, size, variant)
  const hero = [[-1.22, 0.85, 0.78, 2], [-0.78, 0.62, 0.46, 0], [2.18, 0.75, 0.66, 4], [0.14, 0.80, 0.60, 1], [-2.02, 0.80, 0.42, 3], [3.02, 0.85, 0.50, 2], [1.25, 0.75, 0.52, 0]];
  for (const [a, off, s, v] of hero) {
    const e = edgePoint(a, off);
    add(v, e.x, groundH(e.x, e.z) - 0.05 * s, e.z, s, 1.2, rng() * 6.28, 0.08);
  }
  // island stones rising out of the water
  const isl = [[2.42, -0.92, 0.46, 2], [2.95, -0.45, 0.28, 0], [2.02, -0.42, 0.19, 3]];
  for (const [x, z, s, v] of isl) {
    add(v, x, -0.52, z, s, 0.70 / (s * 0.62), rng() * 6.28, 0.05);
    ctx.obstacles.push({ x, z, r: s * 1.0 });
  }
  // stepping stones wandering in from the front
  const steps = [[1.45, 3.62, 0.30], [1.80, 4.32, 0.33], [1.52, 5.02, 0.30], [1.95, 5.72, 0.34], [1.68, 6.45, 0.31], [2.10, 7.15, 0.33], [1.82, 7.9, 0.31], [2.2, 8.65, 0.33], [1.95, 9.4, 0.31]];
  for (const [x, z, s] of steps) add(5, x, groundH(x, z) + 0.03, z, s, 1.0, rng() * 6.28, 0.0, 0.95);
  // scattered garden stones further out
  for (let i = 0; i < 30; i++) {
    const a = rng() * Math.PI * 2, r = lerp(5.5, 14, rng());
    const x = Math.cos(a) * r * 1.15, z = Math.sin(a) * r;
    if (pondD(x, z) > -1.6) continue;
    const s = lerp(0.12, 0.5, Math.pow(rng(), 2));
    add(Math.floor(rng() * 5), x, groundH(x, z) - 0.1 * s, z, s, 1.0);
  }

  const group = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const c = new THREE.Color();
  variants.forEach((geo, v) => {
    const L = lists[v];
    if (!L.length) return;
    const im = new THREE.InstancedMesh(geo, mat, L.length);
    L.forEach((o, i) => {
      e.set(o.tx, o.rot, o.tz, 'YXZ'); q.setFromEuler(e);
      sc.set(o.s, o.s * o.yScale, o.s); p.set(o.x, o.y, o.z);
      m4.compose(p, q, sc); im.setMatrixAt(i, m4);
      c.setRGB(o.tint * lerp(0.94, 1.08, o.warm), o.tint, o.tint * lerp(1.08, 0.92, o.warm));
      im.setColorAt(i, c);
    });
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor.needsUpdate = true;
    im.castShadow = true; im.receiveShadow = true;
    im.frustumCulled = false;
    group.add(im);
  });
  ctx.scene.add(group);
  ctx.occ.solid.push(group);
  return group;
}

export { makeRockGeometry };
