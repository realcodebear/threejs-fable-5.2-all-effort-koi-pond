// Water lilies: instanced pads that ride the ripples, and layered-petal flowers and buds.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng, sdf, patchStandard } from './common.js';
import { WATER_RECT } from './water.js';

// GLSL: follow the simulated water surface at the instance origin (height + tilt).
const RIDE_PARS = /* glsl */`
  uniform sampler2D tRipple;
  uniform vec4 uRect;
  uniform float uRippleCell;
`;
const RIDE = /* glsl */`
  #ifdef USE_INSTANCING
  {
    vec3 ctr = instanceMatrix[3].xyz;
    vec3 offW = mat3(instanceMatrix) * transformed;
    vec2 cuv = (ctr.xz - uRect.xy) * uRect.zw;
    vec2 e = vec2(6.0 * uRippleCell) * uRect.zw;
    float h0 = texture2D(tRipple, cuv).r;
    float hx = texture2D(tRipple, cuv + vec2(e.x, 0.0)).r - texture2D(tRipple, cuv - vec2(e.x, 0.0)).r;
    float hz = texture2D(tRipple, cuv + vec2(0.0, e.y)).r - texture2D(tRipple, cuv - vec2(0.0, e.y)).r;
    vec2 g = vec2(hx, hz) / (12.0 * uRippleCell);
    float dy = h0 * 1.5 + dot(g, offW.xz) * 1.5;
    transformed.y += dy / length(instanceMatrix[1].xyz);
  }
  #endif
`;

function padGeometry(rng) {
  const NR = 6, NA = 40;
  const notch = 0.26;
  const pos = [], idx = [];
  const ph1 = rng.range(0, 6.28), ph2 = rng.range(0, 6.28);
  for (let i = 0; i <= NR; i++) {
    const rr = i / NR;
    for (let j = 0; j <= NA; j++) {
      const t = j / NA;
      const a = notch / 2 + t * (Math.PI * 2 - notch);
      // rounded corners where the rim meets the notch
      const edgeDist = Math.min(t, 1 - t) * (Math.PI * 2 - notch);
      const rim = 1.0 - 0.16 * Math.exp(-edgeDist / 0.16) + 0.025 * Math.sin(a * 5.0 + ph1) + 0.015 * Math.sin(a * 11.0 + ph2);
      const r = rr * rim;
      const y = 0.030 * Math.pow(rr, 4.0) + 0.020 * Math.pow(rr, 3.0) * Math.sin(a * 4.0 + ph2) + 0.012 * Math.pow(rr, 6.0) * Math.sin(a * 9.0 + ph1);
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  }
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
    const a = i * (NA + 1) + j, b = a + 1, c = a + NA + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// One petal as a small curved grid, transformed into place. uv.x = along the petal, uv.y = flag (0 petal, 1 stamen, 2 sepal)
function petal(L, W, elev, azim, r0, y0, curl, cup, flag = 0) {
  const NU = 7, NV = 4;
  const pos = [], uv = [], idx = [];
  const ce = Math.cos(elev), se = Math.sin(elev), ca = Math.cos(azim), sa = Math.sin(azim);
  for (let i = 0; i <= NU; i++) {
    const t = i / NU;
    const w = W * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72) * 0.985 + 0.015), 0.85);
    for (let j = 0; j <= NV; j++) {
      const v = (j / NV) * 2 - 1;
      // petal frame: z' along, x' across, y' up
      const x1 = w * v;
      let y1 = cup * w * v * v + curl * L * t * t;
      const z1 = L * t;
      // tilt up by the elevation, push out from the centre, spin around the flower axis
      const y2 = y1 * ce + z1 * se + y0;
      const z2 = -y1 * se + z1 * ce + r0;
      pos.push(x1 * ca + z2 * sa, y2, -x1 * sa + z2 * ca);
      uv.push(t, flag);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * (NV + 1) + j, b = a + 1, c = a + NV + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function flowerGeometry(rng, open) {
  const parts = [];
  const layers = open
    ? [[9, 0.24, 0.118, 0.034, 0.10], [9, 0.60, 0.108, 0.032, 0.06], [8, 0.95, 0.090, 0.027, 0.02], [6, 1.22, 0.068, 0.021, -0.03]]
    : [[5, 1.18, 0.090, 0.034, -0.16], [5, 1.32, 0.082, 0.030, -0.20], [4, 1.43, 0.070, 0.024, -0.2]];
  layers.forEach(([n, elev, L, W, curl], li) => {
    const off = rng.range(0, 6.28);
    for (let i = 0; i < n; i++) {
      const az = off + (i / n) * Math.PI * 2 + rng.range(-0.06, 0.06);
      parts.push(petal(L * rng.range(0.94, 1.06), W, elev + rng.range(-0.05, 0.05), az, 0.010 + 0.002 * li, 0.004 * li, curl, 0.42, 0));
    }
  });
  if (open) {
    // stamens: a tuft of yellow filaments
    for (let i = 0; i < 30; i++) {
      const az = rng.range(0, 6.28), elev = rng.range(1.05, 1.5);
      parts.push(petal(rng.range(0.022, 0.036), 0.0035, elev, az, rng.range(0.002, 0.012), 0.014, 0.0, 0.0, 1));
    }
  } else {
    // sepals hugging the bud
    for (let i = 0; i < 4; i++) parts.push(petal(0.078, 0.036, 1.08, i * Math.PI / 2 + 0.4, 0.012, -0.004, -0.2, 0.5, 2));
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

export class Lilies {
  constructor(water, avoid) {
    const rng = makeRng(90210);
    this.group = new THREE.Group();          // pads: main pass only
    this.flowerGroup = new THREE.Group();    // flowers: also in reflections
    this.pads = [];

    const rideUniforms = {
      tRipple: water.uniforms.tRipple,
      uRect: water.uniforms.uRect,
      uRippleCell: water.uniforms.uRippleCell,
    };

    // ---------------- placement ----------------
    const clusters = [
      { x: 2.05, z: 2.85, r: 0.95, n: 10 }, { x: -1.80, z: 2.70, r: 0.85, n: 8 }, { x: 1.80, z: -0.30, r: 0.70, n: 6 },
      { x: -1.95, z: -1.65, r: 0.75, n: 7 }, { x: 0.60, z: -3.80, r: 0.70, n: 6 }, { x: -0.15, z: 3.75, r: 0.62, n: 5 },
      { x: -1.90, z: 0.75, r: 0.45, n: 3 }, { x: 2.55, z: 1.2, r: 0.5, n: 3 },
    ];
    const pads = this.pads;
    const ok = (x, z, r) => {
      if (sdf(x, z) < r * 0.55 + 0.20) return false;
      for (const a of avoid) if (Math.hypot(x - a.x, z - a.z) < a.r + r) return false;
      for (const p of pads) if (Math.hypot(x - p.x, z - p.z) < (r + p.r) * 0.93) return false;
      return true;
    };
    for (const c of clusters) {
      let placed = 0, tries = 0;
      while (placed < c.n && tries++ < 400) {
        const a = rng.range(0, 6.28), d = Math.sqrt(rng()) * c.r;
        const r = placed === 0 ? rng.range(0.27, 0.34) : rng.range(0.13, 0.30);
        const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
        if (!ok(x, z, r)) continue;
        pads.push({ x, z, r, cluster: c });
        placed++;
      }
    }
    for (let i = 0, tries = 0; i < 9 && tries < 600; tries++) {       // a few strays
      const x = rng.range(-3, 3.4), z = rng.range(-4.5, 4.3), r = rng.range(0.11, 0.2);
      if (sdf(x, z) < 0.5 || sdf(x, z) > 1.4 || !ok(x, z, r)) continue;
      pads.push({ x, z, r });
      i++;
    }

    // ---------------- pads ----------------
    const padMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide });
    padMat.envMapIntensity = 0.28;
    patchStandard(padMat, {
      name: 'lilypad',
      uniforms: rideUniforms,
      vertexPars: RIDE_PARS,
      vertex: RIDE,
      fragmentPars: /* glsl */`
        float gPadRough;
      `,
      color: /* glsl */`
        {
          vec3 tint = diffuseColor.rgb;
          vec2 q = vOPos.xz;
          float r = length(q);
          float ang = atan(q.y, q.x);
          vec3 c = mix(vec3(0.150, 0.330, 0.050), vec3(0.036, 0.185, 0.040), smoothstep(0.0, 0.85, r));
          float blot = fbm(vWPos.xz * 11.0);
          c *= 0.78 + 0.44 * blot;
          // radial veins (their width is kept above a pixel so they never break into dots)
          float n1 = 13.0;
          float d1 = abs(fract(ang * n1 / 6.28318 + 0.5) - 0.5) * (6.28318 / n1) * r;
          float fw = fwidth(r) * 1.5 + 0.004;
          float v1 = (1.0 - smoothstep(fw * 0.6, fw * 0.6 + 0.014, d1)) * smoothstep(1.0, 0.35, r) * (0.004 / fw + 0.35);
          float vein = clamp(max(v1, 1.0 - smoothstep(0.02, 0.07, r)), 0.0, 1.0);
          c = mix(c, vec3(0.19, 0.30, 0.085), vein * 0.5);
          // older leaves: bronze rim and the odd yellowing patch
          c = mix(c, vec3(0.16, 0.085, 0.03), smoothstep(0.90, 1.0, r) * 0.55);
          c = mix(c, vec3(0.20, 0.19, 0.05), smoothstep(0.68, 0.85, blot) * smoothstep(0.5, 0.95, r) * 0.6);
          c *= tint;
          gPadRough = 0.50 + 0.25 * blot - 0.06 * vein;
          diffuseColor.rgb = c;
        }
      `,
      roughness: /* glsl */`
        roughnessFactor = gPadRough;
      `,
    });
    const padGeos = [padGeometry(rng), padGeometry(rng)];
    const lists = [[], []];
    pads.forEach((p, i) => lists[i % 2].push(p));
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    lists.forEach((list, gi) => {
      const mesh = new THREE.InstancedMesh(padGeos[gi], padMat, list.length);
      list.forEach((p, i) => {
        p.rot = rng.range(0, 6.28);
        p.y = 0.006 + rng.range(0, 0.008);
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.rot, 0);
        dummy.scale.set(p.r, p.r * rng.range(0.6, 1.2), p.r);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        const k = rng();
        if (k < 0.10) col.setRGB(1.30, 0.80, 0.55);            // young bronze leaf
        else if (k < 0.26) col.setRGB(1.15, 1.10, 0.70);       // yellow-green
        else col.setRGB(rng.range(0.75, 1.0), rng.range(0.95, 1.2), rng.range(0.75, 1.0));
        mesh.setColorAt(i, col);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    });

    // ---------------- flowers ----------------
    const flowerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.0, side: THREE.DoubleSide });
    flowerMat.envMapIntensity = 1.0;
    patchStandard(flowerMat, {
      name: 'lilyflower',
      uniforms: rideUniforms,
      vertexPars: RIDE_PARS + /* glsl */`
        varying vec2 vPetal;
      `,
      vertex: RIDE + /* glsl */`
        vPetal = uv;
      `,
      fragmentPars: /* glsl */`
        varying vec2 vPetal;
      `,
      color: /* glsl */`
        {
          vec3 tint = diffuseColor.rgb;
          float t = vPetal.x;
          vec3 c = mix(vec3(0.98, 0.92, 0.78), tint, smoothstep(0.0, 0.62, t));
          c = mix(c, tint * vec3(0.92, 0.66, 0.78), smoothstep(0.75, 1.0, t) * 0.55);
          if (vPetal.y > 0.5 && vPetal.y < 1.5) c = mix(vec3(0.95, 0.60, 0.06), vec3(1.0, 0.82, 0.18), t);
          if (vPetal.y > 1.5) c = mix(vec3(0.10, 0.20, 0.05), vec3(0.20, 0.16, 0.07), t);
          diffuseColor.rgb = c;
        }
      `,
      emissive: /* glsl */`
        // thin petals pass light: they never go fully dark
        totalEmissiveRadiance += diffuseColor.rgb * 0.085;
      `,
    });
    this.flowerMat = flowerMat;
    const openGeo = flowerGeometry(rng, true), budGeo = flowerGeometry(rng, false);
    const flowers = [], buds = [];
    const PINK = [[1.0, 0.42, 0.62], [1.0, 0.54, 0.70], [0.98, 0.34, 0.54]], WHITE = [1.0, 0.95, 0.93], PALE = [1.0, 0.76, 0.83];
    const plan = [2, 2, 1, 2, 1, 1, 0, 1];                 // flowers per cluster
    clusters.forEach((c, ci) => {
      const mine = pads.filter((p) => p.cluster === c).sort((a, b) => b.r - a.r);
      for (let k = 0; k < plan[ci] && k < mine.length; k++) {
        const p = mine[k];
        // the flower rises beside its pad, towards the middle of the cluster
        const a = Math.atan2(c.z - p.z, c.x - p.x) + rng.range(-0.8, 0.8);
        const d = p.r * rng.range(0.55, 0.9);
        const tintSel = rng();
        const tint = tintSel < 0.55 ? rng.pick(PINK) : tintSel < 0.85 ? WHITE : PALE;
        flowers.push({ x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d, s: rng.range(0.95, 1.3), y: rng.range(0.035, 0.085), tint });
      }
      if (ci % 2 === 0 && mine.length > 3) {
        const p = mine[mine.length - 1];
        buds.push({ x: p.x + rng.range(-0.1, 0.1), z: p.z + rng.range(-0.1, 0.1), s: rng.range(0.9, 1.15), y: rng.range(0.06, 0.13), tint: rng.pick(PINK) });
      }
    });
    this.flowers = flowers;
    const build = (geo, list) => {
      const mesh = new THREE.InstancedMesh(geo, flowerMat, list.length);
      list.forEach((f, i) => {
        dummy.position.set(f.x, f.y, f.z);
        dummy.rotation.set(rng.range(-0.14, 0.14), rng.range(0, 6.28), rng.range(-0.14, 0.14));
        dummy.scale.setScalar(f.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, col.setRGB(f.tint[0], f.tint[1], f.tint[2]));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      this.flowerGroup.add(mesh);
    };
    build(openGeo, flowers);
    build(budGeo, buds);

    // ---------------- mask: pads calm the ripples and shade the water below ----------------
    const cw = 384, ch = Math.round(384 * WATER_RECT.h / WATER_RECT.w);
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'lighter';
    for (const p of pads) {
      const cx = (p.x - WATER_RECT.x) / WATER_RECT.w * cw, cy = (p.z - WATER_RECT.z) / WATER_RECT.h * ch;
      const r = p.r / WATER_RECT.w * cw;
      const g = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 1.3);
      g.addColorStop(0, '#fff'); g.addColorStop(1, '#000');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false;
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    water.setPadMask(tex);
  }

  // Japanese irises on tall stalks among the leaf clumps at the water's edge.
  // list: [{x, y, z, h}] with y = ground height and h = stalk height
  addIris(list) {
    const rng = makeRng(1717);
    const STALK = 0.62;
    const parts = [petal(STALK, 0.008, -Math.PI / 2, 0, 0, 0, 0, 0, 2)];
    for (let i = 0; i < 3; i++) {
      const az = i * Math.PI * 2 / 3;
      parts.push(petal(0.092, 0.042, -0.10, az, 0.008, 0.0, -0.62, 0.30, 0));               // falls: broad, arching down
      parts.push(petal(0.072, 0.026, 1.12, az + Math.PI / 3, 0.006, 0.004, 0.12, 0.55, 0));  // standards: upright
      parts.push(petal(0.038, 0.012, 0.45, az, 0.004, 0.006, 0.0, 0.4, 1));                  // yellow signal over each fall
    }
    const geo = mergeGeometries(parts);
    geo.computeVertexNormals();
    const mesh = new THREE.InstancedMesh(geo, this.flowerMat, list.length);
    const dummy = new THREE.Object3D(), col = new THREE.Color();
    const tints = [[0.30, 0.17, 0.72], [0.38, 0.22, 0.80], [0.24, 0.14, 0.62], [0.52, 0.40, 0.88], [0.86, 0.84, 0.98]];
    list.forEach((f, i) => {
      const s = f.h / STALK;
      dummy.position.set(f.x, f.y + f.h, f.z);
      dummy.rotation.set(rng.range(-0.08, 0.08), rng.range(0, 6.28), rng.range(-0.08, 0.08));
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const t = tints[rng() < 0.12 ? 4 : rng.int(0, 3)];
      mesh.setColorAt(i, col.setRGB(t[0], t[1], t[2]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    this.flowerGroup.add(mesh);
  }
}
