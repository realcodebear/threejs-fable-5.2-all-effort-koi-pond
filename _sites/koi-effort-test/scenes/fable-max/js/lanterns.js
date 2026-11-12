// Lanterns: three paper lanterns floating on the pond, two round paper lanterns hanging over
// the water, and a stone "snow-viewing" lantern on the bank. Each carries a flickering light.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng, groundHeight, uTime, GLSL_NOISE } from './common.js';
import { lightUniforms } from './lighting.js';

const WARM = new THREE.Color(1.0, 0.56, 0.22);

// Glowing washi paper. uv.x runs around / across the panel, uv.y from bottom (0) to top (1).
function paperMaterial(opts = {}) {
  const uniforms = {
    uTime,
    uIntensity: { value: 1 },
    uTint: { value: new THREE.Color(opts.tint || 0xffffff) },
    uFlameY: { value: opts.flameY !== undefined ? opts.flameY : 0.35 },
    uRibs: { value: opts.ribs || 0 },
    uPanel: { value: opts.panel ? 1 : 0 },
    uPower: { value: opts.power || 1 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'Paper',
    uniforms,
    side: THREE.DoubleSide,
    fog: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vW;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vV = cameraPosition - wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime, uIntensity, uFlameY, uRibs, uPanel, uPower;
      uniform vec3 uTint;
      varying vec2 vUv;
      varying vec3 vN, vV, vW;
      ${GLSL_NOISE}
      void main() {
        vec2 uv = vUv;
        // light from the flame falls off across the paper
        float dy = uv.y - uFlameY;
        float dx = uPanel > 0.5 ? (uv.x - 0.5) : 0.0;
        float core = exp(-(dy * dy * 4.2 + dx * dx * 5.0));
        float b = 0.30 + 0.70 * core;
        // the shell looks a little brighter where we look straight through it
        float facing = abs(dot(normalize(vN), normalize(vV)));
        b *= mix(0.72, 1.0, facing);
        // paper fibres and slight unevenness
        float fib = vnoise(vec2(uv.x * 9.0, uv.y * 90.0) + vW.xz * 3.0) * 0.6 + vnoise(uv * vec2(60.0, 14.0)) * 0.4;
        b *= 0.90 + 0.16 * fib;
        // bamboo hoops of a round lantern / frame shadow of a box lantern
        if (uRibs > 0.5) {
          float r = abs(fract(uv.y * uRibs) - 0.5);
          b *= 1.0 - 0.38 * smoothstep(0.42, 0.5, r);
          b *= 0.94 + 0.06 * smoothstep(0.0, 0.3, r);
        }
        if (uPanel > 0.5) {
          float e = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
          b *= 0.62 + 0.38 * smoothstep(0.0, 0.07, e);
        }
        vec3 deep = vec3(1.0, 0.30, 0.060);
        vec3 hot = vec3(1.0, 0.64, 0.30);
        vec3 col = mix(deep, hot, smoothstep(0.30, 1.0, b)) * uTint;
        gl_FragColor = vec4(col * b * b * uIntensity * uPower * 1.7, 1.0);
      }`,
  });
  return material;
}

function flameMaterial() {
  return new THREE.ShaderMaterial({
    name: 'Flame',
    uniforms: { uIntensity: { value: 1 } },
    fog: false,
    vertexShader: /* glsl */`
      varying float vY;
      void main() { vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uIntensity; varying float vY;
      void main() {
        vec3 c = mix(vec3(1.0, 0.55, 0.15), vec3(1.0, 0.92, 0.70), smoothstep(-0.02, 0.01, vY));
        gl_FragColor = vec4(c * 9.0 * uIntensity, 1.0);
      }`,
  });
}

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

// ---------------------------------------------------------------------------------------
// Floating lantern (toro nagashi)
// ---------------------------------------------------------------------------------------
function buildFloating(woodMat, size) {
  const g = new THREE.Group();
  const S = 0.30 * size, H = 0.34 * size;
  const wood = [];
  wood.push(box(S * 1.22, 0.034, S * 1.22, 0, 0.004, 0));                          // raft
  const pt = 0.016 * size, hp = S / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) wood.push(box(pt, H, pt, sx * hp, 0.02 + H / 2, sz * hp));
  for (const y of [0.03, 0.02 + H]) {
    wood.push(box(S + pt, pt, pt, 0, y, hp), box(S + pt, pt, pt, 0, y, -hp), box(pt, pt, S + pt, hp, y, 0), box(pt, pt, S + pt, -hp, y, 0));
  }
  wood.push(new THREE.CylinderGeometry(0.017, 0.019, 0.07, 10).translate(0, 0.055, 0));     // candle
  const woodMesh = new THREE.Mesh(mergeGeometries(wood), woodMat);
  woodMesh.castShadow = false;
  g.add(woodMesh);

  const paper = paperMaterial({ panel: true, flameY: 0.30 });
  const panels = [];
  const ph = H - 0.02, pw = S - pt * 0.5;
  for (let i = 0; i < 4; i++) {
    const p = new THREE.PlaneGeometry(pw, ph);
    p.translate(0, 0.03 + ph / 2, hp - 0.004);
    p.rotateY(i * Math.PI / 2);
    panels.push(p);
  }
  const paperMesh = new THREE.Mesh(mergeGeometries(panels), paper);
  g.add(paperMesh);

  const flame = flameMaterial();
  const fg = new THREE.SphereGeometry(0.016, 10, 8);
  fg.scale(1, 2.3, 1);
  fg.translate(0, 0.125, 0);
  g.add(new THREE.Mesh(fg, flame));
  return { group: g, paper, flame, lightY: 0.17 * size + 0.02 };
}

// ---------------------------------------------------------------------------------------
// Round hanging paper lantern (chochin)
// ---------------------------------------------------------------------------------------
function buildChochin(blackMat, tint) {
  const g = new THREE.Group();
  const R = 0.155, H = 0.38, RIBS = 13;
  const pts = [];
  const N = 52;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = (t - 0.5) * H;
    const k = (t - 0.5) * 2;
    let r = R * Math.pow(Math.max(1 - Math.pow(Math.abs(k), 2.4) * 0.72, 0), 0.5);
    r += 0.0028 * Math.abs(Math.sin(Math.PI * t * RIBS));            // paper bulges between the hoops
    pts.push(new THREE.Vector2(r, y));
  }
  const body = new THREE.LatheGeometry(pts, 40);
  const paper = paperMaterial({ ribs: RIBS, flameY: 0.42, tint });
  g.add(new THREE.Mesh(body, paper));

  const rimR = pts[0].x * 1.02;
  const caps = [
    new THREE.CylinderGeometry(rimR, rimR, 0.034, 20).translate(0, H / 2 + 0.012, 0),
    new THREE.CylinderGeometry(rimR, rimR, 0.034, 20).translate(0, -H / 2 - 0.012, 0),
    new THREE.CylinderGeometry(0.004, 0.004, 0.26, 6).translate(0, H / 2 + 0.15, 0),       // cord
    new THREE.TorusGeometry(rimR * 0.9, 0.004, 6, 16, Math.PI).rotateY(Math.PI / 2).translate(0, H / 2 + 0.03, 0),
    new THREE.CylinderGeometry(0.003, 0.003, 0.07, 5).translate(0, -H / 2 - 0.06, 0),
    new THREE.ConeGeometry(0.016, 0.11, 8).translate(0, -H / 2 - 0.14, 0),                 // tassel
  ];
  const capMesh = new THREE.Mesh(mergeGeometries(caps), blackMat);
  g.add(capMesh);
  return { group: g, paper, H };
}

// ---------------------------------------------------------------------------------------
// Stone lantern (yukimi-doro): legs, platform, light box with paper windows, wide roof
// ---------------------------------------------------------------------------------------
function buildStoneLantern(stoneMat) {
  const g = new THREE.Group();
  const parts = [];
  // legs
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const dx = Math.cos(a), dz = Math.sin(a);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(dx * 0.13, 0.46, dz * 0.13),
      new THREE.Vector3(dx * 0.21, 0.36, dz * 0.21),
      new THREE.Vector3(dx * 0.24, 0.20, dz * 0.24),
      new THREE.Vector3(dx * 0.31, 0.02, dz * 0.31),
      new THREE.Vector3(dx * 0.36, -0.10, dz * 0.36),
    ]);
    parts.push(new THREE.TubeGeometry(curve, 10, 0.05, 7, false));
  }
  parts.push(new THREE.CylinderGeometry(0.27, 0.24, 0.07, 6).translate(0, 0.485, 0));     // platform
  parts.push(new THREE.CylinderGeometry(0.19, 0.21, 0.03, 6).translate(0, 0.535, 0));
  // light box: six posts with a slab on top (the windows sit between the posts)
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;                                   // corners of the hexagon
    parts.push(box(0.036, 0.20, 0.036, 0, 0.65, 0.158).rotateY(a));
  }
  parts.push(new THREE.CylinderGeometry(0.20, 0.19, 0.03, 6).translate(0, 0.765, 0));
  // roof: a wide shallow hat, slightly upturned at the rim
  const roof = [];
  // (profile runs underside -> rim -> top so that the faces point outwards)
  const RP = [[0.0, 0.78], [0.30, 0.785], [0.47, 0.795], [0.505, 0.815], [0.49, 0.83], [0.42, 0.825], [0.32, 0.845], [0.20, 0.885], [0.10, 0.94], [0.05, 0.975], [0.0, 0.985]];
  for (const p of RP) roof.push(new THREE.Vector2(p[0], p[1]));
  parts.push(new THREE.LatheGeometry(roof, 6));
  // finial
  const fin = [];
  const FP = [[0.0, 0.97], [0.045, 0.975], [0.036, 0.99], [0.05, 1.015], [0.045, 1.045], [0.022, 1.075], [0.0, 1.10]];
  for (const p of FP) fin.push(new THREE.Vector2(p[0], p[1]));
  parts.push(new THREE.LatheGeometry(fin, 12));
  const clean = parts.map((p) => { const q = p.toNonIndexed(); q.deleteAttribute('uv'); return q; });
  const merged = mergeGeometries(clean);
  merged.computeVertexNormals();
  const stone = new THREE.Mesh(merged, stoneMat);
  stone.castShadow = true;
  stone.receiveShadow = true;
  g.add(stone);

  // paper windows
  const paper = paperMaterial({ panel: true, flameY: 0.45, power: 1.15 });
  const wins = [];
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + Math.PI / 6;
    const p = new THREE.PlaneGeometry(0.145, 0.19);
    p.translate(0, 0.65, 0.128);
    p.rotateY(a);
    wins.push(p);
  }
  g.add(new THREE.Mesh(mergeGeometries(wins), paper));
  return { group: g, paper, lightY: 0.65 };
}

// A wooden post with an arm to hang a lantern from.
function buildPost(woodMat, height, reach) {
  const parts = [];
  parts.push(new THREE.CylinderGeometry(0.035, 0.045, height + 0.3, 8).translate(0, height / 2 - 0.15, 0));
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, height - 0.12, 0),
    new THREE.Vector3(reach * 0.25, height + 0.03, 0),
    new THREE.Vector3(reach * 0.65, height + 0.06, 0),
    new THREE.Vector3(reach, height - 0.02, 0),
  ]);
  parts.push(new THREE.TubeGeometry(curve, 12, 0.02, 7, false));
  parts.push(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8).translate(0, height + 0.0, 0));
  const clean = parts.map((p) => { const q = p.toNonIndexed(); q.deleteAttribute('uv'); return q; });
  const m = new THREE.Mesh(mergeGeometries(clean), woodMat);
  m.castShadow = true;
  return m;
}

export class Lanterns {
  constructor({ stoneMaterial, water }) {
    this.water = water;
    this.group = new THREE.Group();          // fixed lanterns (they also cast baked shadows)
    this.group.name = 'lanterns';
    this.floatGroup = new THREE.Group();     // drifting lanterns
    this.floatGroup.name = 'floating-lanterns';
    this.items = [];
    const rng = makeRng(31337);
    this.rng = rng;

    const woodMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.060, 0.034, 0.020), roughness: 0.75 });
    const blackMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.012, 0.011, 0.012), roughness: 0.35 });

    // the lights live in their own group that is never hidden (hiding lights per pass would
    // make three.js switch shader programs every frame)
    this.lightGroup = new THREE.Group();
    const addLight = (item, intensity) => {
      const light = new THREE.PointLight(WARM, intensity, 0, 2);
      light.castShadow = false;
      this.lightGroup.add(light);
      item.light = light;
      item.base = intensity;
      item.seed = rng.range(0, 100);
      item.pos = new THREE.Vector3();
      this.items.push(item);
    };

    // --- floating lanterns ---
    const floats = [
      { x: -1.05, z: 0.55, size: 1.0, ax: 0.38, az: 0.30, period: 83 },
      { x: 1.30, z: 2.10, size: 0.86, ax: 0.30, az: 0.42, period: 97 },
      { x: -0.30, z: -2.55, size: 0.92, ax: 0.34, az: 0.26, period: 71 },
    ];
    for (const f of floats) {
      const b = buildFloating(woodMat, f.size);
      this.floatGroup.add(b.group);
      const item = { type: 'float', ...f, ...b, phase: rng.range(0, 6.28), spin: rng.range(-0.05, 0.05), dropT: rng.range(1, 5) };
      addLight(item, 1.15 * f.size);
    }

    // --- hanging lanterns ---
    // 1) on a wooden post at the near-left bank
    {
      const px = -3.55, pz = 1.75, h = 1.95, reach = 0.75;
      const dir = Math.atan2(-(1.45 - pz), 0.30 - px);            // arm points towards the pond
      const post = buildPost(woodMat, h, reach);
      const gy = groundHeight(px, pz);
      post.position.set(px, gy, pz);
      post.rotation.y = dir;
      this.group.add(post);
      const c = buildChochin(blackMat, 0xffffff);
      const pivot = new THREE.Group();
      pivot.position.set(px + Math.cos(dir) * reach, gy + h - 0.02, pz - Math.sin(dir) * reach);
      c.group.position.y = -0.28 - c.H / 2;
      pivot.add(c.group);
      this.group.add(pivot);
      const item = { type: 'hang', pivot, drop: 0.28 + c.H / 2, paper: c.paper, phase: rng.range(0, 6.28) };
      addLight(item, 6.5);
    }
    // 2) hanging from the maple branch over the far lobe (the tree module reads this position)
    {
      const c = buildChochin(blackMat, 0xfff0e0);
      const pivot = new THREE.Group();
      pivot.position.copy(Lanterns.BRANCH_HOOK);
      c.group.position.y = -0.28 - c.H / 2;
      pivot.add(c.group);
      this.group.add(pivot);
      const item = { type: 'hang', pivot, drop: 0.28 + c.H / 2, paper: c.paper, phase: rng.range(0, 6.28) };
      addLight(item, 6.5);
    }

    // --- stone lantern on the far bank ---
    {
      const sx = Lanterns.STONE_POS.x, sz = Lanterns.STONE_POS.z;
      const s = buildStoneLantern(stoneMaterial);
      const gy = groundHeight(sx, sz);
      s.group.position.set(sx, gy + 0.06, sz);
      s.group.rotation.y = 0.4;
      s.group.scale.set(1.24, 1.0, 1.24);                     // broad and low, as these lanterns are
      this.group.add(s.group);
      const item = { type: 'stone', paper: s.paper, group: s.group, lightY: s.lightY + 0.06 + gy };
      addLight(item, 3.2);
      item.pos.set(sx, item.lightY, sz);
      item.light.position.copy(item.pos);
    }
    this.update(0, 0);
  }

  update(dt, time) {
    const U = lightUniforms;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      // candle flicker: slow breathing plus a little fast jitter
      const s = it.seed;
      let fl = 1.0 + 0.055 * Math.sin(time * 2.1 + s) + 0.045 * Math.sin(time * 5.3 + s * 1.7) + 0.035 * Math.sin(time * 11.7 + s * 2.3) + 0.02 * Math.sin(time * 23.0 + s * 0.6);
      if (it.type === 'stone') fl = 1.0 + (fl - 1.0) * 0.7;

      if (it.type === 'float') {
        const w = (Math.PI * 2) / it.period;
        const x = it.x + it.ax * Math.sin(time * w + it.phase) + 0.08 * Math.sin(time * w * 2.7 + it.phase * 2.0);
        const z = it.z + it.az * Math.cos(time * w * 0.83 + it.phase * 1.3) + 0.06 * Math.sin(time * w * 3.1);
        const bob = 0.004 * Math.sin(time * 1.7 + s) + 0.003 * Math.sin(time * 2.9 + s * 2.0);
        it.group.position.set(x, 0.012 + bob, z);
        it.group.rotation.set(0.016 * Math.sin(time * 1.3 + s), it.phase + time * it.spin, 0.016 * Math.sin(time * 1.1 + s * 3.0));
        it.pos.set(x, it.lightY, z);
        it.flame.uniforms.uIntensity.value = fl;
        // the bobbing raft sends out faint rings
        it.dropT -= dt;
        if (it.dropT <= 0 && dt > 0) {
          it.dropT = this.rng.range(2.5, 6.0);
          this.water.addDrop(x, z, 0.15 * it.size, 0.00035, 1.6, 1.3);
        }
      } else if (it.type === 'hang') {
        const a = 0.035 * Math.sin(time * 0.9 + it.phase) + 0.02 * Math.sin(time * 1.63 + it.phase * 2.0);
        const b = 0.03 * Math.sin(time * 0.77 + it.phase * 1.4);
        it.pivot.rotation.set(a, time * 0.02, b);
        it.pos.set(it.pivot.position.x + Math.sin(b) * it.drop, it.pivot.position.y - it.drop, it.pivot.position.z - Math.sin(a) * it.drop);
      }
      it.light.position.copy(it.pos);
      it.light.intensity = it.base * fl;
      it.paper.uniforms.uIntensity.value = fl;
      if (i < U.uLanternPos.value.length) {
        U.uLanternPos.value[i].copy(it.pos);
        U.uLanternCol.value[i].copy(WARM).multiplyScalar(it.base * fl);
      }
    }
  }
}
// Shared anchor points (the maple tree grows a branch to the hook; plants keep clear of the stone lantern).
Lanterns.BRANCH_HOOK = new THREE.Vector3(1.05, 1.92, -2.55);
Lanterns.STONE_POS = new THREE.Vector3(-2.15, 0, -4.95);
