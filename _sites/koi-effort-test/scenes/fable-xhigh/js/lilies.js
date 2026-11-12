// Lily pads (instanced, with notch and veins) and water-lily blossoms.
import * as THREE from 'three';
import { mulberry32, pondD, lerp, patchStandard, OCC_EXT, FLOAT_ZONES } from './common.js';

function padGeometry() {
  const rings = [0, 0.3, 0.6, 0.85, 0.96, 1.0];
  const SEG = 36, notch = 0.34;
  const pos = [], idx = [];
  for (let i = 0; i < rings.length; i++) {
    for (let j = 0; j <= SEG; j++) {
      const a = notch * 0.5 + (j / SEG) * (Math.PI * 2 - notch);
      let r = rings[i];
      const edge = Math.pow(r, 3);
      // scalloped, slightly up-turned rim; the notch edges curl in
      r *= 1 + 0.035 * Math.sin(a * 7.0) * edge + 0.02 * Math.sin(a * 13.0 + 1.0) * edge;
      const y = 0.035 * edge + 0.012 * Math.sin(a * 5.0 + 0.5) * edge + 0.01 * r * r;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  }
  const W = SEG + 1;
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < SEG; j++) {
    const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function petalGeometry() {
  const NU = 4, NV = 7;
  const pos = [], idx = [];
  for (let j = 0; j <= NV; j++) {
    const v = j / NV;
    const w = 0.29 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.72)), 0.85);
    for (let i = 0; i <= NU; i++) {
      const u = (i / NU) * 2 - 1;
      const x = u * w;
      const y = 0.75 * u * u * w + 0.30 * v * v - 0.10 * v * v * v * v;
      pos.push(x, y, v);
    }
  }
  const W = NU + 1;
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function createLilies(ctx) {
  const rng = mulberry32(31337);
  const { scene } = ctx;

  // ---- place pads in loose rafts near the margins, leaving the middle open for the fish
  const clusters = [
    [-2.75, 0.95, 0.95, 17], [-2.0, -1.95, 0.80, 12], [1.65, 1.55, 0.85, 14],
    [3.05, -1.55, 0.75, 10], [0.45, -2.5, 0.6, 8], [-0.8, 1.9, 0.5, 6], [3.55, 0.6, 0.5, 6],
  ];
  const pads = [];
  const ok = (x, z, r) => {
    if (pondD(x, z) < r * 0.75 + 0.22) return false;
    for (const o of ctx.obstacles) if (Math.hypot(x - o.x, z - o.z) < o.r + r * 0.8) return false;
    for (const o of FLOAT_ZONES) if (Math.hypot(x - o.x, z - o.z) < o.r + r + 0.28) return false;
    for (const p of pads) if (Math.hypot(x - p.x, z - p.z) < (p.r + r) * 0.93) return false;
    return true;
  };
  for (const [cx, cz, cr, n] of clusters) {
    let made = 0, tries = 0;
    while (made < n && tries++ < 400) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * cr;
      const r = lerp(0.095, 0.26, Math.pow(rng(), 1.5));
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (!ok(x, z, r)) continue;
      pads.push({ x, z, r, rot: rng() * Math.PI * 2 }); made++;
    }
  }
  ctx.pads = pads;

  const padMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide, envMapIntensity: 0.4 });
  patchStandard(padMat, {
    key: 'lilypad',
    uniforms: { uTime: ctx.uTime, uOcc: ctx.uOcc },
    vertPars: /* glsl */`uniform float uTime;`,
    vertMain: /* glsl */`
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
        float ph = ip.x * 2.1 + ip.z * 1.7;
        float rr = dot(position.xz, position.xz);
        transformed.y += (sin(uTime * 0.9 + ph + position.x * 2.0) * 0.012 + sin(uTime * 0.6 + ph * 1.3 + position.z * 2.5) * 0.010) * rr;
      #endif
    `,
    fragPars: /* glsl */`uniform sampler2D uOcc; float padSpec;`,
    fragColor: /* glsl */`
    {
      vec2 q = vLPos.xz; float r = length(q); float a = atan(q.y, q.x);
      float seed = vColor.b * 40.0;
      float veins = pow(abs(cos(a * 9.0)), 26.0) * smoothstep(0.04, 0.3, r) * (1.0 - 0.5 * r);
      veins = max(veins, pow(abs(cos(a * 9.0 + 1.5708)), 60.0) * smoothstep(0.45, 0.9, r) * 0.6);
      float n = fbm(q * 3.0 + seed);
      float nf = vnoise(q * 22.0 + seed);
      vec3 deep = vec3(0.018, 0.068, 0.020), mid = vec3(0.045, 0.135, 0.030), lightG = vec3(0.095, 0.19, 0.045);
      vec3 col = mix(deep, mid, smoothstep(0.2, 0.75, n + 0.25 * (1.0 - r)));
      col = mix(col, lightG, veins * 0.5 + smoothstep(0.22, 0.0, r) * 0.3);
      col *= 0.82 + 0.3 * nf;
      // sun-worn rim and the odd blemish
      float rim = smoothstep(0.86, 1.0, r + (n - 0.5) * 0.18);
      col = mix(col, mix(vec3(0.20, 0.17, 0.035), vec3(0.18, 0.06, 0.03), vColor.r), rim * (0.25 + 0.6 * vColor.g));
      float spot = smoothstep(0.72, 0.80, vnoise(q * 6.0 + seed * 3.0)) * vColor.g;
      col = mix(col, vec3(0.13, 0.09, 0.03), spot * 0.6);
      vec3 occ = texture2D(uOcc, vec2(vWPos.x, -vWPos.z) / ${OCC_EXT.toFixed(1)} + 0.5).rgb;
      col *= 1.0 - 0.40 * occ.b;
      diffuseColor.rgb = col * (0.8 + 0.4 * vColor.r);
      padSpec = veins;
    }`,
    fragRough: /* glsl */`roughnessFactor = 0.74 + 0.2 * padSpec;`,
  });

  const padMesh = new THREE.InstancedMesh(padGeometry(), padMat, pads.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const c = new THREE.Color();
  pads.forEach((o, i) => {
    e.set((rng() - 0.5) * 0.03, o.rot, (rng() - 0.5) * 0.03);
    q.setFromEuler(e);
    sc.set(o.r, o.r, o.r); p.set(o.x, 0.004, o.z);
    m4.compose(p, q, sc); padMesh.setMatrixAt(i, m4);
    c.setRGB(rng(), Math.pow(rng(), 2.0), rng());
    padMesh.setColorAt(i, c);
  });
  padMesh.receiveShadow = true;
  padMesh.frustumCulled = false;
  scene.add(padMesh);
  ctx.tag(padMesh, { refr: false, refl: false });
  ctx.occ.pads.push(padMesh);

  // ---- blossoms
  const flowerSpots = [];
  const order = pads.map((_, i) => i).sort(() => rng() - 0.5);
  for (const i of order) {
    if (flowerSpots.length >= 11) break;
    const o = pads[i];
    if (o.r < 0.15) continue;
    const a = rng() * Math.PI * 2;
    const x = o.x + Math.cos(a) * o.r * 0.95, z = o.z + Math.sin(a) * o.r * 0.95;
    if (pondD(x, z) < 0.35) continue;
    if (flowerSpots.some((f) => Math.hypot(f.x - x, f.z - z) < 0.75)) continue;
    flowerSpots.push({ x, z, s: lerp(0.105, 0.15, rng()), bud: flowerSpots.length % 4 === 3, kind: rng() });
  }

  const petalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide });
  patchStandard(petalMat, {
    key: 'petal',
    fragPars: /* glsl */`vec3 petalCol;`,
    fragColor: /* glsl */`
    {
      float v = vLPos.z;
      vec3 base = mix(vec3(0.95, 0.90, 0.62), vec3(1.0), smoothstep(0.0, 0.3, v));
      vec3 tip = vColor.rgb;
      vec3 col = mix(base, tip, smoothstep(0.12, 0.85, v) * 0.9);
      col *= 0.9 + 0.1 * cos(vLPos.x * 60.0);
      diffuseColor.rgb = col;
      petalCol = col;
    }`,
    fragEmissive: /* glsl */`totalEmissiveRadiance += petalCol * 0.07;`, // faint translucency so blooms read at dusk
  });
  const rings = [
    [9, 0.26, 1.0, 0.0], [8, 0.62, 0.90, 0.5], [7, 0.98, 0.74, 0.25], [5, 1.28, 0.52, 0.6],
  ];
  const budRings = [[6, 1.12, 0.95, 0.0], [5, 1.32, 0.9, 0.5], [4, 1.45, 0.8, 0.2]];
  let count = 0;
  for (const f of flowerSpots) for (const r of (f.bud ? budRings : rings)) count += r[0];
  const petals = new THREE.InstancedMesh(petalGeometry(), petalMat, count);
  const cores = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(1.0, 0.62, 0.06), roughness: 0.6, emissive: new THREE.Color(0.9, 0.45, 0.03), emissiveIntensity: 0.25 }), flowerSpots.length);
  let k = 0;
  const qy = new THREE.Quaternion(), qx = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
  flowerSpots.forEach((f, fi) => {
    const pink = f.kind < 0.5;
    const lift = f.bud ? 0.07 : 0.022;
    const rot0 = rng() * 6.28;
    for (const [n, pitch, len, offs] of (f.bud ? budRings : rings)) {
      for (let i = 0; i < n; i++) {
        const az = rot0 + ((i + offs) / n) * Math.PI * 2 + (rng() - 0.5) * 0.12;
        qy.setFromAxisAngle(Y, az); qx.setFromAxisAngle(X, -(pitch + (rng() - 0.5) * 0.10));
        q.copy(qy).multiply(qx);
        const L = f.s * len * (f.bud ? 0.8 : 1);
        sc.set(L * (f.bud ? 0.8 : 1.0), L, L); p.set(f.x, lift, f.z);
        m4.compose(p, q, sc); petals.setMatrixAt(k, m4);
        if (pink) c.setRGB(lerp(0.95, 0.85, rng()), lerp(0.22, 0.38, rng()), lerp(0.42, 0.55, rng()));
        else c.setRGB(1.0, lerp(0.86, 0.95, rng()), lerp(0.88, 0.96, rng()));
        petals.setColorAt(k, c);
        k++;
      }
    }
    sc.set(f.s * 0.24, f.s * (f.bud ? 0.05 : 0.17), f.s * 0.24); p.set(f.x, lift + f.s * 0.06, f.z); q.identity();
    m4.compose(p, q, sc); cores.setMatrixAt(fi, m4);
  });
  petals.castShadow = false; petals.frustumCulled = false; cores.frustumCulled = false;
  const flowers = new THREE.Group(); flowers.add(petals, cores);
  scene.add(flowers);
  ctx.tag(flowers, { refr: false });
  ctx.flowerSpots = flowerSpots;
  return { padMesh, flowers };
}
