// Japanese maple, grass tufts, reeds, clipped shrubs and leaves adrift on the water.
import * as THREE from 'three';
import { mulberry32, edgePoint, groundH, pondD, lerp, patchStandard, tubeInto, tubeGeometry, OCC_EXT, FLOAT_ZONES, NOISE_GLSL } from './common.js';
import { makeRockGeometry } from './stones.js';

// ---------------------------------------------------------------- leaves
function leafGeometry() {
  // palmate leaf: 7 lobes around the petiole, tip towards +z
  const tips = [[-2.35, 0.42], [-1.6, 0.70], [-0.82, 0.92], [0, 1.0], [0.82, 0.92], [1.6, 0.70], [2.35, 0.42]];
  const pts = [];
  pts.push([Math.sin(-2.9) * 0.16, Math.cos(-2.9) * 0.16]);
  for (let i = 0; i < tips.length; i++) {
    const [a, r] = tips[i];
    pts.push([Math.sin(a) * r, Math.cos(a) * r]);
    if (i < tips.length - 1) {
      const a2 = (a + tips[i + 1][0]) / 2, r2 = Math.min(r, tips[i + 1][1]) * 0.36;
      pts.push([Math.sin(a2) * r2, Math.cos(a2) * r2]);
    }
  }
  pts.push([Math.sin(2.9) * 0.16, Math.cos(2.9) * 0.16]);
  const pos = [0, 0.03, 0], idx = [];
  for (const [x, z] of pts) { const rr = x * x + z * z; pos.push(x, -0.10 * rr + 0.06 * Math.abs(x), z); }
  for (let i = 1; i < pts.length; i++) idx.push(0, i + 1, i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A rosette of pointed leaves: used in bulk to give distant trees a leafy outline.
function sprayGeometry() {
  const rng = mulberry32(77);
  const pos = [], idx = [];
  const n = 13;
  for (let k = 0; k < n; k++) {
    // small leaves scattered over a disc, each pointing roughly outwards
    const a = (k / n) * Math.PI * 2 * 2.4 + (rng() - 0.5) * 0.6;
    const r0 = k < 4 ? 0.0 : lerp(0.25, 0.66, rng());
    const len = lerp(0.36, 0.56, rng()), w = len * 0.32;
    const dx = Math.sin(a), dz = Math.cos(a);
    const ox = dx * r0, oz = dz * r0, oy = (rng() - 0.5) * 0.22;
    const lift = (rng() - 0.35) * 0.3;
    const b = pos.length / 3;
    pos.push(ox, oy, oz);
    pos.push(ox + dx * len * 0.5 - dz * w, oy + lift * 0.5 + 0.04, oz + dz * len * 0.5 + dx * w);
    pos.push(ox + dx * len, oy + lift, oz + dz * len);
    pos.push(ox + dx * len * 0.5 + dz * w, oy + lift * 0.5 + 0.04, oz + dz * len * 0.5 - dx * w);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function leafMaterial(ctx, flutter, rough = 0.5, env = 1.0) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: rough, metalness: 0.0, side: THREE.DoubleSide, envMapIntensity: env });
  patchStandard(mat, {
    key: 'leaf',
    uniforms: { uTime: ctx.uTime, uFlutter: { value: flutter } },
    vertPars: /* glsl */`uniform float uTime; uniform float uFlutter;`,
    vertMain: /* glsl */`
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
        float ph = dot(ip, vec3(1.7, 2.3, 1.1));
        float gust = 0.55 + 0.45 * sin(uTime * 0.37 + ip.x * 0.35 + ip.z * 0.28);
        float wv = sin(uTime * 1.9 + ph) * 0.6 + sin(uTime * 3.1 + ph * 1.7) * 0.4;
        float rr = dot(position.xz, position.xz);
        transformed.y += wv * gust * 0.22 * rr * uFlutter;
        transformed.x += sin(uTime * 1.3 + ph * 0.7) * gust * 0.10 * uFlutter;
      #endif
    `,
    fragPars: /* glsl */`vec3 leafCol;`,
    fragColor: /* glsl */`
    {
      // leaves right in front of the lens dissolve instead of blocking the view
      float vd = length(vViewPosition);
      if (vd < 1.8 && vd < 0.7 + 1.1 * hash12(gl_FragCoord.xy)) discard;
      float r = length(vLPos.xz);
      float vein = pow(abs(cos(atan(vLPos.x, vLPos.z) * 3.83)), 22.0) * smoothstep(0.1, 0.5, r);
      vec3 col = diffuseColor.rgb * (0.82 + 0.3 * r) * (1.0 + 0.25 * vein);
      diffuseColor.rgb = col; leafCol = col;
    }`,
    fragEmissive: /* glsl */`totalEmissiveRadiance += leafCol * 0.028;`, // stand-in for light bleeding through thin leaves
  });
  return mat;
}

const LEAF_PALETTE = [[0.50, 0.025, 0.018], [0.70, 0.055, 0.02], [0.82, 0.13, 0.025], [0.90, 0.27, 0.04], [0.36, 0.02, 0.03]];

export function createMaple(ctx) {
  const rng = mulberry32(8128);
  const { scene } = ctx;
  const tubes = { pos: [], nrm: [], idx: [] };
  const anchors = [];
  const rndPerp = (d) => {
    const v = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.5, rng() - 0.5);
    return v.cross(d).normalize();
  };
  function branch(p0, dir, len, r0, level) {
    const n = [10, 7, 5, 4][level];
    const pts = [p0.clone()], radii = [r0];
    const p = p0.clone(), d = dir.clone().normalize();
    const kids = [];
    for (let i = 1; i <= n; i++) {
      const wob = level === 0 ? 0.17 : 0.30;
      d.x += (rng() - 0.5) * wob; d.z += (rng() - 0.5) * wob; d.y += (rng() - 0.5) * wob * 0.6;
      if (level >= 1) d.y += (0.12 - d.y) * 0.24;      // layered, horizontal habit
      d.normalize();
      p.addScaledVector(d, len / n);
      pts.push(p.clone());
      const rr = r0 * (1 - 0.6 * (i / n));
      radii.push(rr);
      if (level < 3 && i / n >= (level === 0 ? 0.5 : 0.28) && i < n && rng() < [0.8, 0.62, 0.66][level]) kids.push({ p: p.clone(), d: d.clone(), r: rr });
      if (level >= 2) anchors.push({ p: p.clone(), level });
    }
    if (level === 0) { radii[0] *= 1.7; radii[1] *= 1.22; }
    tubeInto(tubes, pts, radii, [10, 7, 5, 4][level]);
    for (const k of kids) {
      const cd = k.d.clone().applyAxisAngle(rndPerp(k.d), lerp(0.65, 1.15, rng()) * (rng() < 0.5 ? 1 : -1));
      if (level === 0) cd.y = Math.abs(cd.y) * 0.5 + 0.22;
      branch(k.p, cd.normalize(), len * lerp(0.5, 0.72, rng()), k.r * 0.74, level + 1);
    }
    if (level < 3) {
      const ax = rndPerp(d);
      for (let s = 0; s < 2; s++) {
        const cd = d.clone().applyAxisAngle(ax, lerp(0.3, 0.65, rng()) * (s ? 1 : -1));
        if (level === 0) cd.y = Math.abs(cd.y) * 0.6 + 0.2;
        branch(p.clone(), cd.normalize(), len * lerp(0.5, 0.7, rng()), radii[n] * 0.92, level + 1);
      }
    }
  }
  const base = edgePoint(-2.55, 1.55);
  const root = new THREE.Vector3(base.x, groundH(base.x, base.z) - 0.15, base.z);
  const lean = new THREE.Vector3(-base.x, 0, -base.z).normalize().multiplyScalar(0.36).add(new THREE.Vector3(0, 1, 0));
  branch(root, lean, 2.75, 0.15, 0);
  ctx.stonesPlaced.push({ x: base.x, z: base.z, r: 0.45 });

  const bark = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  patchStandard(bark, {
    key: 'bark',
    fragPars: /* glsl */`float bkB;`,
    fragColor: /* glsl */`
    {
      float n = fbm3(vWPos * vec3(9.0, 2.5, 9.0)); float n2 = vnoise3(vWPos * 40.0);
      vec3 col = mix(vec3(0.020, 0.016, 0.014), vec3(0.075, 0.062, 0.052), n) * (0.8 + 0.4 * n2);
      col = mix(col, vec3(0.04, 0.07, 0.025), smoothstep(0.55, 0.8, vnoise3(vWPos * 3.0)) * 0.5);
      diffuseColor.rgb = col; bkB = n * 0.012 + n2 * 0.003;
    }`,
    fragNormal: /* glsl */`normal = bumpNormal(-vViewPosition, normal, bkB);`,
  });
  const wood = new THREE.Mesh(tubeGeometry(tubes), bark);
  wood.castShadow = true; wood.receiveShadow = true; wood.frustumCulled = false;

  // leaves in flat sprays around the outer branches
  const perAnchor = 12;
  const count = anchors.length * perAnchor;
  const leaves = new THREE.InstancedMesh(leafGeometry(), leafMaterial(ctx, 1.0), count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  let k = 0;
  let top = 0;
  for (const a of anchors) top = Math.max(top, a.p.y);
  for (const a of anchors) {
    for (let i = 0; i < perAnchor; i++) {
      const ang = rng() * 6.283, rad = Math.sqrt(rng()) * 0.36;
      p.set(a.p.x + Math.cos(ang) * rad, a.p.y + (rng() - 0.5) * 0.16 - 0.02, a.p.z + Math.sin(ang) * rad);
      e.set((rng() - 0.5) * 0.9, rng() * 6.283, (rng() - 0.5) * 0.9);
      q.setFromEuler(e);
      const s = lerp(0.050, 0.082, rng());
      sc.set(s, s, s);
      m4.compose(p, q, sc); leaves.setMatrixAt(k, m4);
      const pal = LEAF_PALETTE[Math.floor(Math.pow(rng(), 1.3) * LEAF_PALETTE.length)];
      const b = lerp(0.55, 1.15, rng()) * lerp(0.7, 1.0, (a.p.y - 1.5) / (top - 1.5));
      c.setRGB(pal[0] * b, pal[1] * b, pal[2] * b);
      leaves.setColorAt(k, c);
      k++;
    }
  }
  leaves.castShadow = true; leaves.receiveShadow = true; leaves.frustumCulled = false;
  const group = new THREE.Group(); group.add(wood, leaves);
  scene.add(group);
  ctx.tag(group, { refr: false });
  ctx.occ.canopy.push(leaves);
  ctx.occ.solid.push(wood);

  // a scattering of fallen leaves riding on the water and lying on the moss
  const NFLOAT = 46;
  const floatLeaves = new THREE.InstancedMesh(leafGeometry(), leafMaterial(ctx, 0.12), NFLOAT);
  const landLeaves = new THREE.InstancedMesh(leafGeometry(), leafMaterial(ctx, 0.0), 160);
  let made = 0, guard = 0;
  while (made < NFLOAT && guard++ < 4000) {
    const nearTree = rng() < 0.6;
    const x = nearTree ? base.x * 0.55 + (rng() - 0.5) * 3.4 : (rng() - 0.5) * 7, z = nearTree ? base.z * 0.5 + (rng() - 0.5) * 2.8 : (rng() - 0.5) * 5;
    if (pondD(x, z) < 0.22) continue;
    if (ctx.pads.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.07)) continue;
    if (ctx.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.1)) continue;
    if (FLOAT_ZONES.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.3)) continue;
    const s = lerp(0.05, 0.075, rng());
    e.set((rng() - 0.5) * 0.08, rng() * 6.283, (rng() - 0.5) * 0.08); q.setFromEuler(e);
    p.set(x, 0.006, z); sc.set(s, s * 0.5, s);
    m4.compose(p, q, sc); floatLeaves.setMatrixAt(made, m4);
    const pal = LEAF_PALETTE[Math.floor(rng() * 4)], b = lerp(0.8, 1.3, rng());
    c.setRGB(pal[0] * b, pal[1] * b, pal[2] * b); floatLeaves.setColorAt(made, c);
    made++;
  }
  floatLeaves.count = made;
  made = 0; guard = 0;
  while (made < 160 && guard++ < 4000) {
    const x = base.x + (rng() - 0.5) * 7.5, z = base.z + (rng() - 0.5) * 7.5;
    if (pondD(x, z) > -0.25) continue;
    if (ctx.stonesPlaced.some((o) => Math.hypot(o.x - x, o.z - z) < o.r)) continue;
    const s = lerp(0.05, 0.075, rng());
    e.set((rng() - 0.5) * 0.3, rng() * 6.283, (rng() - 0.5) * 0.3); q.setFromEuler(e);
    p.set(x, groundH(x, z) + 0.012, z); sc.set(s, s, s);
    m4.compose(p, q, sc); landLeaves.setMatrixAt(made, m4);
    const pal = LEAF_PALETTE[Math.floor(rng() * 4)], b = lerp(0.6, 1.1, rng());
    c.setRGB(pal[0] * b, pal[1] * b, pal[2] * b); landLeaves.setColorAt(made, c);
    made++;
  }
  landLeaves.count = made;
  floatLeaves.frustumCulled = false; landLeaves.frustumCulled = false; landLeaves.receiveShadow = true;
  scene.add(floatLeaves, landLeaves);
  ctx.tag(floatLeaves, { refr: false, refl: false });
  ctx.tag(landLeaves, { refr: false, refl: false });

  // now and then a leaf lets go, flutters down and settles on the water with a small ripple
  const NFALL = 16;
  const falling = new THREE.InstancedMesh(leafGeometry(), leafMaterial(ctx, 0.0), NFALL);
  falling.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  falling.frustumCulled = false;
  const toPond = new THREE.Vector3(-base.x, 0, -base.z).normalize();
  const st = [];
  const spawn = (s, delay) => {
    const a = anchors[Math.floor(rng() * anchors.length)];
    s.x = a.p.x + (rng() - 0.5) * 0.4; s.y = a.p.y - 0.12; s.z = a.p.z + (rng() - 0.5) * 0.4;
    s.mode = 0; s.wait = delay; s.t = 0; s.ph = rng() * 6.283; s.yaw = rng() * 6.283; s.spin = (rng() - 0.5) * 2.4;
    s.size = lerp(0.05, 0.075, rng());
    s.dx = toPond.x * 0.2 + (rng() - 0.5) * 0.2; s.dz = toPond.z * 0.2 + (rng() - 0.5) * 0.2;
    s.rx = 0; s.rz = 0; s.life = 0;
  };
  for (let i = 0; i < NFALL; i++) {
    const s = {}; spawn(s, rng() * 26); st.push(s);
    const pal = LEAF_PALETTE[Math.floor(rng() * 4)], b = lerp(0.9, 1.35, rng());
    c.setRGB(pal[0] * b, pal[1] * b, pal[2] * b); falling.setColorAt(i, c);
  }
  ctx.updaters.push((dt) => {
    for (let i = 0; i < NFALL; i++) {
      const s = st[i];
      let k = 1;
      if (s.mode === 0) {
        s.wait -= dt; k = 0;
        if (s.wait <= 0) s.mode = 1;
      } else if (s.mode === 1) {
        s.t += dt;
        const sw = Math.sin(s.t * 2.3 + s.ph), sw2 = Math.cos(s.t * 1.7 + s.ph * 1.3);
        s.x += (s.dx + sw * 0.34) * dt; s.z += (s.dz + sw2 * 0.28) * dt;
        s.y -= (0.36 + 0.26 * (1 - Math.abs(sw))) * dt;        // stalls at the end of each swing
        s.rx = sw * 0.95; s.rz = sw2 * 0.8; s.yaw += s.spin * dt;
        k = Math.min(1, s.t * 3);
        const wet = pondD(s.x, s.z) > 0.06;
        const floor = wet ? 0.007 : groundH(s.x, s.z) + 0.014;
        if (s.y <= floor) {
          s.y = floor; s.rx = (rng() - 0.5) * 0.1; s.rz = (rng() - 0.5) * 0.1;
          if (wet) { s.mode = 2; s.life = 24 + rng() * 26; ctx.water.ripple(s.x, s.z, 0.045, 0.24, 4.5, 0.45); }
          else { s.mode = 3; s.life = 10 + rng() * 12; }
        }
      } else {
        s.life -= dt;
        if (s.mode === 2) { s.x += Math.cos(s.ph) * 0.010 * dt; s.z += Math.sin(s.ph) * 0.010 * dt; s.yaw += 0.04 * dt; }
        k = Math.max(0, Math.min(1, s.life / 2.5));
        if (s.life <= 0) spawn(s, 1 + rng() * 18);
      }
      e.set(s.rx, s.yaw, s.rz, 'YXZ'); q.setFromEuler(e);
      const sz = s.size * k;
      sc.set(sz, sz, sz); p.set(s.x, s.y, s.z);
      m4.compose(p, q, sc); falling.setMatrixAt(i, m4);
    }
    falling.instanceMatrix.needsUpdate = true;
  });
  scene.add(falling);
  ctx.tag(falling, { refr: false });
  return group;
}

// ---------------------------------------------------------------- grass + reeds
function bladeGeometry() {
  const L = 5;
  const pos = [], idx = [];
  for (let i = 0; i <= L; i++) {
    const t = i / L;
    const hw = 0.5 * Math.pow(1 - t, 0.75) * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(t * 1.6 + 0.25, 1)));
    const z = 0.34 * t * t, y = t * (1 - 0.10 * t * t);
    pos.push(-hw, y, z, hw, y, z);
  }
  for (let i = 0; i < L; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function createGrass(ctx) {
  const rng = mulberry32(2718);
  const blades = [];
  const blocked = (x, z, pad = 0.85) => ctx.stonesPlaced.some((o) => Math.hypot(o.x - x, o.z - z) < o.r * pad);
  const tuft = (x, z, n, hMin, hMax, spread, col, wMul = 1, lean = 0.55) => {
    const gy = groundH(x, z);
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.283, d = Math.sqrt(rng()) * spread;
      const h = lerp(hMin, hMax, rng());
      blades.push({
        x: x + Math.cos(a) * d, y: gy - 0.01, z: z + Math.sin(a) * d, h, w: lerp(0.011, 0.02, rng()) * wMul * (0.6 + h),
        yaw: rng() * 6.283, lean: (rng() - 0.3) * lean,
        c: [col[0] * lerp(0.7, 1.3, rng()), col[1] * lerp(0.75, 1.25, rng()), col[2] * lerp(0.7, 1.3, rng())],
      });
    }
  };
  // fringe around the stones
  for (let i = 0; i < 820; i++) {
    const th = rng() * Math.PI * 2;
    const o = 0.22 + Math.pow(rng(), 1.6) * 2.6;
    const e = edgePoint(th, o);
    if (blocked(e.x, e.z)) continue;
    const tall = Math.max(0, 1 - o / 1.6);
    tuft(e.x, e.z, 9 + Math.floor(rng() * 9), 0.07 + 0.08 * tall, 0.15 + 0.22 * tall * rng() + 0.06, 0.07 + 0.05 * rng(), [0.050, 0.115, 0.022]);
  }
  // sparse tufts across the moss
  for (let i = 0; i < 520; i++) {
    const a = rng() * Math.PI * 2, r = lerp(3.5, 15, Math.pow(rng(), 0.8));
    const x = Math.cos(a) * r * 1.15, z = Math.sin(a) * r;
    if (pondD(x, z) > -0.4 || blocked(x, z)) continue;
    tuft(x, z, 6 + Math.floor(rng() * 6), 0.05, 0.14 + 0.08 * rng(), 0.09, [0.040, 0.095, 0.020]);
  }
  // reeds standing in the shallows
  for (const th of [0.12, 3.42, -1.18, 1.88, -2.95]) {
    const n = 5 + Math.floor(rng() * 4);
    for (let j = 0; j < n; j++) {
      const e = edgePoint(th + (rng() - 0.5) * 0.32, -lerp(0.02, 0.38, rng()));
      tuft(e.x, e.z, 7 + Math.floor(rng() * 5), 0.55, 1.15, 0.07, [0.030, 0.082, 0.030], 0.75, 0.22);
    }
  }

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide });
  patchStandard(mat, {
    key: 'grass',
    uniforms: { uTime: ctx.uTime, uOcc: ctx.uOcc },
    vertPars: /* glsl */`uniform float uTime;`,
    vertMain: /* glsl */`
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
        float t0 = position.y * position.y;
        float g1 = sin(uTime * 1.05 + ip.x * 0.55 + ip.z * 0.4) + 0.5 * sin(uTime * 2.2 + ip.x * 1.7 - ip.z * 1.1);
        vec3 windW = vec3(0.8, 0.0, 0.6) * g1 * 0.045 + vec3(-0.6, 0.0, 0.8) * sin(uTime * 1.6 + ip.z * 2.3 + ip.x) * 0.02;
        mat3 gim = mat3(instanceMatrix);
        float hgt = length(gim[1]);
        vec3 sc2 = vec3(dot(gim[0], gim[0]), dot(gim[1], gim[1]), dot(gim[2], gim[2]));
        transformed += ((windW * gim) / sc2) * t0 * (0.35 + 1.6 * hgt);
      #endif
    `,
    fragPars: /* glsl */`uniform sampler2D uOcc; vec3 grassCol;`,
    fragColor: /* glsl */`
    {
      float t = vLPos.y;
      vec3 col = diffuseColor.rgb * mix(0.30, 1.25, t);
      col = mix(col, col * vec3(1.5, 1.25, 0.6), smoothstep(0.75, 1.0, t) * 0.4);
      vec3 occ = texture2D(uOcc, vec2(vWPos.x, -vWPos.z) / ${OCC_EXT.toFixed(1)} + 0.5).rgb;
      col *= (1.0 - 0.45 * occ.b) * (1.0 - 0.5 * occ.r * (1.0 - t));
      diffuseColor.rgb = col; grassCol = col;
    }`,
    // soft, upward-biased shading so both sides of a blade light alike
    fragNormal: /* glsl */`normal = normalize((viewMatrix * vec4(normalize(vWNrm * (gl_FrontFacing ? 1.0 : -1.0) * 0.35 + vec3(0.0, 1.0, 0.0)), 0.0)).xyz);`,
    fragEmissive: /* glsl */`totalEmissiveRadiance += grassCol * 0.02;`,
  });
  const mesh = new THREE.InstancedMesh(bladeGeometry(), mat, blades.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  blades.forEach((b, i) => {
    e.set(b.lean, b.yaw, 0, 'YXZ'); q.setFromEuler(e);
    sc.set(b.w, b.h, b.h); p.set(b.x, b.y, b.z);
    m4.compose(p, q, sc); mesh.setMatrixAt(i, m4);
    c.setRGB(b.c[0], b.c[1], b.c[2]); mesh.setColorAt(i, c);
  });
  mesh.frustumCulled = false; mesh.receiveShadow = true;
  ctx.scene.add(mesh);
  ctx.tag(mesh, { refr: false, refl: false });
  return mesh;
}

// ---------------------------------------------------------------- foliage masses
function foliageMaterial(key, dark, light, freq, bump) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  patchStandard(mat, {
    key,
    fragPars: /* glsl */`float shB;`,
    fragColor: /* glsl */`
    {
      vec3 wn = normalize(vWNrm);
      float vd = length(vViewPosition);
      float detail = 1.0 - smoothstep(7.0, 22.0, vd);          // fine leaf texture only up close
      float n0 = fbm3(vWPos * ${(freq * 0.05).toFixed(3)});
      float n1 = vnoise3(vWPos * ${freq.toFixed(1)}), n2 = vnoise3(vWPos * ${(freq * 2.9).toFixed(1)});
      float leafy = mix(0.5, smoothstep(0.25, 0.75, n1 * 0.6 + n2 * 0.4), detail);
      vec3 col = mix(vec3(${dark}), vec3(${light}), leafy) * (0.55 + 0.9 * n0);
      col *= mix(0.22, 1.0, smoothstep(-0.6, 0.8, wn.y));    // undersides fall into shade
      diffuseColor.rgb *= col; shB = (n1 * 0.6 + n2 * 0.4) * ${bump.toFixed(3)} * detail;
    }`,
    fragNormal: /* glsl */`if (shB > 0.0) normal = bumpNormal(-vViewPosition, normal, shB);`,
  });
  return mat;
}

// Distant foliage is far from every lantern, so it gets a small hand-written shader
// (sky/ground ambient + the after-glow, fog and mist) instead of the full PBR light loop.
function farFoliageMaterial(ctx, flutter) {
  const fog = ctx.scene.fog;
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: ctx.uTime, uFlutter: { value: flutter },
      uSky: { value: new THREE.Color(0.20, 0.19, 0.36) }, uGnd: { value: new THREE.Color(0.035, 0.03, 0.04) },
      uKey: { value: new THREE.Color(1.15, 0.50, 0.34) }, uKeyDir: ctx.koiKeyDir,
      uFogCol: { value: fog.color }, uFogDen: { value: fog.density },
    },
    vertexShader: /* glsl */`
      uniform float uTime, uFlutter;
      varying vec3 vN; varying vec3 vW; varying vec3 vC;
      void main(){
        vec3 p = position;
        vec3 ip = instanceMatrix[3].xyz;
        float ph = dot(ip, vec3(1.7, 2.3, 1.1));
        float gust = 0.55 + 0.45 * sin(uTime * 0.37 + ip.x * 0.35 + ip.z * 0.28);
        p.y += (sin(uTime * 1.9 + ph) * 0.6 + sin(uTime * 3.1 + ph * 1.7) * 0.4) * gust * 0.2 * dot(position.xz, position.xz) * uFlutter;
        vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
        mat3 im = mat3(instanceMatrix);
        vN = normalize(im * (normal / vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]))));
        vW = wp.xyz;
        vC = instanceColor;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSky, uGnd, uKey, uKeyDir, uFogCol; uniform float uFogDen, uTime;
      varying vec3 vN; varying vec3 vW; varying vec3 vC;
      ${NOISE_GLSL}
      void main(){
        vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
        float hemi = N.y * 0.5 + 0.5;
        vec3 irr = mix(uGnd, uSky, hemi) + uKey * pow(max(dot(N, uKeyDir) * 0.6 + 0.4, 0.0), 2.0);
        vec3 col = vC * irr;
        vec3 mv = vW - cameraPosition; float md = length(mv);
        float f = 1.0 - exp(-uFogDen * uFogDen * md * md);
        col = mix(col, uFogCol, f);
        // same low mist as the patched materials
        float mh = exp(-max(vW.y, 0.0) * 0.8);
        float mn = vnoise(vW.xz * 0.15 + vec2(uTime * 0.045, uTime * 0.028)) * 0.6 + vnoise(vW.xz * 0.43 - vec2(uTime * 0.035, 0.0)) * 0.4;
        float ma = (1.0 - exp(-max(md - 8.0, 0.0) * 0.05)) * mh * (0.25 + mn) * 0.44;
        float west = pow(max(dot(normalize(mv.xz + vec2(1e-4)), normalize(vec2(-0.22, -1.0))), 0.0), 2.0);
        col = mix(col, mix(vec3(0.10, 0.105, 0.19), vec3(0.33, 0.185, 0.21), west), clamp(ma, 0.0, 0.8));
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}

// Ring of garden trees: broadleaf crowns and tall cedars, silhouetted against the after-glow.
export function createTrees(ctx) {
  const rng = mulberry32(60221);
  const blob = makeRockGeometry(404, 4, 0.86, 1.0, { planes: 14, sharp: 3.0, amp: 0.42 });
  // cedar: stacked skirts with a ragged outline
  const prof = [new THREE.Vector2(0.0, 0.14)];
  const tiers = 10;
  for (let i = 0; i < tiers; i++) {
    const t0 = i / tiers, t1 = (i + 1) / tiers;
    const r0 = 0.5 * Math.pow(1 - t0, 0.8) + 0.012, r1 = 0.5 * Math.pow(1 - t1, 0.8) + 0.012;
    prof.push(new THREE.Vector2(r0, 0.14 + 0.86 * t0 - (i ? 0.02 : 0)));
    prof.push(new THREE.Vector2(r1 * 0.72 + 0.008, 0.14 + 0.86 * t1));
  }
  prof.push(new THREE.Vector2(0.0, 1.03));
  const cedar = new THREE.LatheGeometry(prof, 13);
  {
    const p = cedar.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + 0.16 * Math.sin(a * 3 + y * 9) + 0.10 * Math.sin(a * 7 - y * 23);
      p.setXYZ(i, x * k, y + 0.02 * Math.sin(a * 5 + y * 30), z * k);
    }
    cedar.computeVertexNormals();
  }
  const trunkGeo = new THREE.CylinderGeometry(0.55, 1.0, 1, 7);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = patchStandard(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.022, 0.018, 0.016), roughness: 0.95 }), { key: 'trunk' });

  const crowns = [], cedars = [], trunks = [], clumps = [];
  // one foliage mass = a dark core plus leafy sprays that break up its outline
  // (sprays are scattered through the outer half of the volume and turned every which way,
  // so the crown keeps a ragged, leafy edge from any direction)
  const mass = (cx, cy, cz, rx, ry, n, topOnly, big = 1) => {
    crowns.push({ x: cx, y: cy, z: cz, s: rx * 0.58, sy: ry / rx, rot: rng() * 6.28 });
    for (let i = 0; i < n; i++) {
      let dx, dy, dz, l;
      do {
        dx = rng() * 2 - 1; dy = rng() * 2 - 1; dz = rng() * 2 - 1; l = Math.hypot(dx, dy, dz);
      } while (l > 1 || l < 0.1 || (dy / l < (topOnly ? 0.0 : -0.55) && rng() < 0.85));
      dx /= l; dy /= l; dz /= l;
      const k = 0.52 + 0.56 * Math.sqrt(rng());
      clumps.push({
        x: cx + dx * rx * k, y: cy + dy * ry * k, z: cz + dz * rx * k,
        nx: dx * 0.5 + (rng() - 0.5) * 2, ny: dy * 0.5 + (rng() - 0.5) * 2 + 0.2, nz: dz * 0.5 + (rng() - 0.5) * 2,
        s: lerp(0.5, 0.9, rng()) * Math.min(1.6, 0.5 + rx * 0.3) * big, shade: (0.30 + 0.70 * (dy * 0.5 + 0.5)) * (0.45 + 0.55 * k),
      });
    }
  };
  const tmpD = new THREE.Vector3();
  const broadleaf = (x, z, th, cr, far) => {
    const gy = groundH(x, z);
    const lx = (rng() - 0.5) * 0.25, lz = (rng() - 0.5) * 0.25;
    trunks.push({ x, y: gy - 0.3, z, h: th + cr * 0.5, r: 0.14 + cr * 0.05, lx, lz });
    const cx = x + lx * th, cz = z + lz * th, cy = gy + th + cr * 0.6;
    const dens = far ? 8 : 15, big = far ? 1.45 : 1;
    mass(cx, cy, cz, cr, cr * lerp(0.68, 0.85, rng()), Math.min(130, Math.round(dens * cr * cr + 12)), false, big);
    const lobes = 2 + Math.floor(rng() * 2.4);
    const a0 = rng() * 6.28;
    for (let i = 0; i < lobes; i++) {
      const aa = a0 + (i / lobes) * 6.28 + (rng() - 0.5) * 0.9, d = cr * lerp(0.7, 1.15, rng()), r2 = cr * lerp(0.5, 0.75, rng());
      const lx2 = cx + Math.cos(aa) * d, ly2 = cy + (rng() - 0.6) * cr * 0.8, lz2 = cz + Math.sin(aa) * d;
      mass(lx2, ly2, lz2, r2, r2 * 0.78, Math.min(100, Math.round(dens * r2 * r2 + 10)), false, big);
      // a limb reaching out to the lobe
      tmpD.set(lx2 - cx, ly2 - (gy + th * 0.8), lz2 - cz);
      const len = tmpD.length();
      trunks.push({ x: cx, y: gy + th * 0.8, z: cz, h: len, r: 0.06 + cr * 0.02, dir: [tmpD.x / len, tmpD.y / len, tmpD.z / len] });
    }
  };
  // glow gap: keep a window towards the after-glow a little more open
  const glowAz = Math.atan2(-1.0, -0.22);
  const open = (a) => Math.max(0, 1 - Math.abs(Math.atan2(Math.sin(a - glowAz), Math.cos(a - glowAz))) / 0.5);
  // inner band: garden trees just beyond the fence
  for (let a = rng() * 0.2; a < Math.PI * 2 - 0.05; a += lerp(0.12, 0.2, rng())) {
    const r = lerp(14.5, 21, Math.pow(rng(), 1.2));
    const x = Math.cos(a) * r * 1.08, z = Math.sin(a) * r;
    if (rng() < 0.4 * open(a)) continue;
    broadleaf(x, z, lerp(2.4, 4.2, rng()), lerp(1.7, 2.6, rng()), false);
  }
  // hedge band behind the fence: closes the view under the crowns
  for (let a = 0; a < Math.PI * 2; a += lerp(0.06, 0.10, rng())) {
    const r = lerp(12.6, 15.5, rng());
    const x = Math.cos(a) * r * 1.1, z = Math.sin(a) * r, s = lerp(1.2, 2.4, rng()) * (1 - 0.35 * open(a));
    mass(x, groundH(x, z) + s * 0.4, z, s, s * 0.82, Math.round(26 * s + 10), true);
  }
  // deeper undergrowth so the ground between the far trunks is not left bare
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2, r = lerp(18, 38, rng());
    if (rng() < 0.6 * open(a)) continue;
    const x = Math.cos(a) * r * 1.06, z = Math.sin(a) * r, s = lerp(1.6, 3.2, rng());
    mass(x, groundH(x, z) + s * 0.4, z, s, s * 0.8, Math.round(11 * s + 8), true, 1.5);
  }
  // outer band: taller wood, with cedars rising through it
  for (let a = rng() * 0.2; a < Math.PI * 2 - 0.05; a += lerp(0.11, 0.18, rng())) {
    const r = lerp(23, 36, rng());
    const x = Math.cos(a) * r * 1.05, z = Math.sin(a) * r;
    if (rng() < 0.5 * open(a)) continue;
    if (rng() < 0.3) {
      const h = lerp(11, 17, rng()), w = h * lerp(0.26, 0.34, rng());
      cedars.push({ x, y: groundH(x, z), z, h, w, rot: rng() * 6.28 });
      trunks.push({ x, y: groundH(x, z) - 0.3, z, h: h * 0.3, r: 0.20 + h * 0.012, lx: 0, lz: 0 });
    } else {
      broadleaf(x, z, lerp(4.0, 6.5, rng()), lerp(2.6, 3.7, rng()), true);
    }
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const group = new THREE.Group();
  const crownMesh = new THREE.InstancedMesh(blob, farFoliageMaterial(ctx, 0.0), crowns.length);
  crowns.forEach((o, i) => {
    e.set((rng() - 0.5) * 0.4, o.rot, (rng() - 0.5) * 0.4); q.setFromEuler(e);
    sc.set(o.s, o.s * o.sy, o.s); p.set(o.x, o.y, o.z);
    m4.compose(p, q, sc); crownMesh.setMatrixAt(i, m4);
    const b = lerp(0.5, 0.8, rng()); c.setRGB(0.014 * b, 0.030 * b, 0.016 * b); crownMesh.setColorAt(i, c);
  });
  // leafy sprays
  const sprayMesh = new THREE.InstancedMesh(sprayGeometry(), farFoliageMaterial(ctx, 0.3), clumps.length);
  const up = new THREE.Vector3(0, 1, 0), nv = new THREE.Vector3(), q2 = new THREE.Quaternion();
  clumps.forEach((o, i) => {
    q.setFromUnitVectors(up, nv.set(o.nx, o.ny, o.nz).normalize());
    q.multiply(q2.setFromAxisAngle(up, rng() * 6.283));
    sc.set(o.s, o.s, o.s); p.set(o.x, o.y, o.z);
    m4.compose(p, q, sc); sprayMesh.setMatrixAt(i, m4);
    const b = o.shade * lerp(0.7, 1.3, rng()), warm = rng();
    c.setRGB(lerp(0.016, 0.040, warm * warm) * b, lerp(0.050, 0.060, warm) * b, lerp(0.022, 0.012, warm) * b);
    sprayMesh.setColorAt(i, c);
  });
  sprayMesh.frustumCulled = false;
  ctx.scene.add(sprayMesh);
  ctx.tag(sprayMesh, { refr: false, refl: false });   // the dark cores are enough for the mirror image
  const cedarMesh = new THREE.InstancedMesh(cedar, foliageMaterial('cedar', '0.007, 0.018, 0.012', '0.022, 0.048, 0.022', 30.0, 0.0), cedars.length);
  cedars.forEach((o, i) => {
    e.set(0, o.rot, 0); q.setFromEuler(e);
    sc.set(o.w, o.h, o.w); p.set(o.x, o.y, o.z);
    m4.compose(p, q, sc); cedarMesh.setMatrixAt(i, m4);
    const b = lerp(0.75, 1.2, rng()); c.setRGB(b, b, b); cedarMesh.setColorAt(i, c);
  });
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, trunks.length);
  trunks.forEach((o, i) => {
    if (o.dir) q.setFromUnitVectors(up, nv.set(o.dir[0], o.dir[1], o.dir[2]));
    else { e.set(o.lz, rng() * 6.28, -o.lx); q.setFromEuler(e); ctx.stonesPlaced.push({ x: o.x, z: o.z, r: 0.6 }); }
    sc.set(o.r, o.h, o.r); p.set(o.x, o.y, o.z);
    m4.compose(p, q, sc); trunkMesh.setMatrixAt(i, m4);
  });
  for (const m of [crownMesh, cedarMesh, trunkMesh]) { m.frustumCulled = false; group.add(m); }
  ctx.scene.add(group);
  ctx.tag(group, { refr: false });
  return group;
}

// Low bamboo fence curving behind the pond.
export function createFence(ctx) {
  const rng = mulberry32(4711);
  const pole = new THREE.CylinderGeometry(1, 1, 1, 6);
  pole.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 });
  patchStandard(mat, {
    key: 'bamboo',
    fragColor: /* glsl */`
    {
      // nodes every ~25 cm along the cane
      float node = smoothstep(0.42, 0.5, abs(fract(vLPos.y * 4.0 + vColor.b * 7.0) - 0.5));
      vec3 col = diffuseColor.rgb * (0.85 + 0.25 * vnoise3(vWPos * 30.0)) * mix(1.0, 0.55, node);
      diffuseColor.rgb = col;
    }`,
  });
  const items = [];
  const pt = (t) => { const a = lerp(-2.75, -0.42, t); return [Math.cos(a) * 11.4 * 1.1, Math.sin(a) * 10.2]; };
  const N = 150;
  for (let i = 0; i <= N; i++) {
    const [x, z] = pt(i / N);
    const post = i % 10 === 0;
    const h = post ? 1.32 : 1.08 + (rng() - 0.5) * 0.03;
    items.push({ x, y: groundH(x, z) - 0.08, z, r: post ? 0.045 : 0.017, h, rx: 0, rz: 0, ry: 0, tone: post ? 0.55 : 1 });
    if (post) ctx.stonesPlaced.push({ x, z, r: 0.15 });
  }
  // rails follow the ground between posts
  for (let i = 0; i < N; i++) {
    const [x0, z0] = pt(i / N), [x1, z1] = pt((i + 1) / N);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g0 = groundH(x0, z0), g1 = groundH(x1, z1);
    for (const hh of [0.28, 0.62, 0.96]) {
      items.push({ x: x0, y: g0 - 0.08 + hh, z: z0, r: 0.014, h: len * 1.04, dir: [x1 - x0, g1 - g0, z1 - z0], tone: 0.9 });
    }
  }
  const mesh = new THREE.InstancedMesh(pole, mat, items.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
  items.forEach((o, i) => {
    if (o.dir) q.setFromUnitVectors(up, d.set(o.dir[0], o.dir[1], o.dir[2]).normalize()); else q.identity();
    sc.set(o.r, o.h, o.r); p.set(o.x, o.y, o.z);
    m4.compose(p, q, sc); mesh.setMatrixAt(i, m4);
    const b = lerp(0.8, 1.15, rng()) * o.tone;
    c.setRGB(0.20 * b, 0.155 * b, 0.07 * b); mesh.setColorAt(i, c);
  });
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  ctx.scene.add(mesh);
  ctx.tag(mesh, { refr: false });
  return mesh;
}

// ---------------------------------------------------------------- clipped shrubs
export function createShrubs(ctx) {
  const rng = mulberry32(1618);
  const geo = makeRockGeometry(303, 8, 0.70, 1.0, { planes: 16, sharp: 3.0, amp: 0.26 });
  const mat = foliageMaterial('shrub', '0.010, 0.030, 0.010', '0.060, 0.125, 0.030', 34.0, 0.022);
  const spots = [];
  const fixed = [[-7.6, -5.6, 1.35], [-2.6, -7.4, 1.15], [1.3, -7.9, 1.5], [5.4, -6.6, 1.2], [8.1, -3.0, 1.35], [8.7, 2.2, 1.1], [-8.6, 1.0, 1.25],
    [-7.3, 5.2, 1.0], [6.9, 6.2, 1.05], [-0.9, -6.9, 0.8], [3.4, -7.3, 0.9], [-5.6, -6.9, 0.95], [-9.2, -2.4, 1.0], [7.2, -5.2, 0.85]];
  for (const f of fixed) spots.push(f);
  for (let i = 0; i < 16; i++) {
    const a = rng() * Math.PI * 2, r = lerp(12.5, 22, rng());
    spots.push([Math.cos(a) * r, Math.sin(a) * r, lerp(1.0, 2.0, rng())]);
  }
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  spots.forEach(([x, z, s], i) => {
    e.set(0, rng() * 6.283, 0); q.setFromEuler(e);
    const ys = lerp(0.8, 1.15, rng());
    sc.set(s, s * ys, s); p.set(x, groundH(x, z) + s * 0.28, z);
    m4.compose(p, q, sc); mesh.setMatrixAt(i, m4);
    const b = lerp(0.75, 1.2, rng());
    c.setRGB(b * lerp(0.85, 1.2, rng()), b, b * lerp(0.8, 1.1, rng())); mesh.setColorAt(i, c);
    ctx.stonesPlaced.push({ x, z, r: s * 0.95 });
  });
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  ctx.scene.add(mesh);
  ctx.tag(mesh, { refr: false });
  ctx.occ.solid.push(mesh);
  return mesh;
}
