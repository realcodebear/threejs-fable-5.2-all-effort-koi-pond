// Static garden: sky, terrain, stones, lily pads, plants, maple, bamboo, fence, fireflies.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  mulberry32, noise3, fbm3, smoothstep, pondSD, pondRadius, shorePoint, terrainH, POND,
  GLSL_NOISE, addDetail, addSway, FLOAT_SPOTS,
} from './common.js';

export const SUN_DIR = new THREE.Vector3(0.22, -0.04, -1).normalize();   // just below the horizon
export const MOON_DIR = new THREE.Vector3(-0.42, 0.52, -0.74).normalize();

// ------------------------------------------------------------------ sky
export function createSky(uTime) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uSun: { value: SUN_DIR }, uMoon: { value: MOON_DIR } },
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime; uniform vec3 uSun, uMoon; varying vec3 vDir;
      ${GLSL_NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        float az = clamp(dot(normalize(d.xz + 1e-5), normalize(uSun.xz))*0.5 + 0.5, 0.0, 1.0);
        vec3 zen = vec3(0.010, 0.016, 0.060);
        vec3 mid = mix(vec3(0.050, 0.050, 0.16), vec3(0.26, 0.10, 0.27), az*az);
        vec3 hor = mix(vec3(0.11, 0.10, 0.24), vec3(1.35, 0.50, 0.15), pow(az, 2.2));
        vec3 col = mix(hor, mid, pow(smoothstep(0.0, 0.24, h), 0.65));
        col = mix(col, zen, smoothstep(0.14, 0.8, h));
        float sd = max(dot(d, uSun), 0.0);
        col += vec3(1.4, 0.55, 0.14)*pow(sd, 14.0)*0.7 + vec3(0.9, 0.25, 0.25)*pow(sd, 3.0)*0.14;
        // streaky clouds lit from below
        vec2 cp = d.xz / (h + 0.14);
        float c = fbm3(vec3(cp.x*0.55 + uTime*0.004, cp.y*1.5, uTime*0.006));
        c = smoothstep(0.42, 0.72, c) * smoothstep(0.015, 0.09, d.y) * (1.0 - smoothstep(0.35, 0.75, h));
        vec3 ccol = mix(vec3(0.07, 0.06, 0.14), vec3(1.5, 0.52, 0.30), pow(az, 1.6)*(1.0 - smoothstep(0.0, 0.45, h)));
        col = mix(col, ccol, c*0.75);
        // stars
        vec3 sp = d*170.0; vec3 ip = floor(sp); vec3 fp = fract(sp) - 0.5;
        float rnd = hash31(ip);
        float star = step(0.9935, rnd) * smoothstep(0.32, 0.0, length(fp));
        star *= 0.55 + 0.45*sin(uTime*(1.5 + rnd*40.0) + rnd*900.0);
        col += vec3(0.9, 0.95, 1.2) * star * 2.2 * smoothstep(0.08, 0.45, h) * (1.0 - c) * (1.0 - 0.8*pow(az, 3.0)*(1.0-h));
        // crescent moon
        float md = dot(d, uMoon);
        if (md > 0.9) {
          vec3 mu = normalize(cross(uMoon, vec3(0.,1.,0.))); vec3 mv = cross(mu, uMoon);
          vec2 q = vec2(dot(d, mu), dot(d, mv)) / 0.034;
          float disc = smoothstep(1.0, 0.9, length(q));
          float cut = smoothstep(1.0, 0.9, length(q - vec2(-0.42, 0.30)) * 1.08);
          col += vec3(2.6, 2.4, 2.0) * disc * (1.0 - cut) * (1.0 - c*0.7);
          col += vec3(0.5, 0.5, 0.7) * pow(md, 900.0) * 0.35;
        }
        if (d.y < 0.0) col = mix(col, vec3(0.03, 0.025, 0.05), smoothstep(0.0, -0.08, d.y));
        gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

// ------------------------------------------------------------------ terrain
export function createTerrain() {
  const g = new THREE.PlaneGeometry(46, 46, 280, 280).rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), d = pondSD(x, z);
    p.setY(i, terrainH(x, z));
    const n = fbm3(x * 0.5, 1.0, z * 0.5, 3), n2 = noise3(x * 2.1, 7, z * 2.1);
    let r, gg, b;
    if (d < 0) { // pond bed: silt and pebbles, darker with depth
      const k = smoothstep(0, -2.5, d);
      r = 0.20 - 0.10 * k + 0.05 * n2; gg = 0.19 - 0.08 * k + 0.05 * n2; b = 0.13 - 0.06 * k + 0.03 * n2;
    } else {
      const moss = smoothstep(0.5, 1.6, d + (n - 0.5) * 1.2);
      const gr = [0.20 + 0.06 * n2, 0.18 + 0.05 * n2, 0.15 + 0.04 * n2];        // gravel band
      const ms = [0.055 + 0.05 * n, 0.115 + 0.07 * n, 0.03 + 0.02 * n2];        // moss
      const dirt = smoothstep(0.62, 0.75, fbm3(x * 0.22 + 40, 2, z * 0.22, 3));
      ms[0] = ms[0] * (1 - dirt) + 0.10 * dirt; ms[1] = ms[1] * (1 - dirt) + 0.085 * dirt; ms[2] = ms[2] * (1 - dirt) + 0.05 * dirt;
      r = gr[0] + (ms[0] - gr[0]) * moss; gg = gr[1] + (ms[1] - gr[1]) * moss; b = gr[2] + (ms[2] - gr[2]) * moss;
    }
    col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mat = addDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    { scale: 2.2, strength: 0.55, bump: 0.6, wet: 0.6 });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;

  const outer = new THREE.Mesh(new THREE.RingGeometry(22, 320, 48, 1).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.03, 0.05, 0.03), roughness: 1 }));
  outer.position.y = 0.18;
  return { mesh, outer };
}

// ------------------------------------------------------------------ stones
function makeStoneGeo(seed) {
  let g = new THREE.IcosahedronGeometry(1, 6);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const rng = mulberry32(seed);
  const planes = [];
  for (let i = 0; i < 6; i++) {
    const n = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
    planes.push([n, 0.55 + rng() * 0.3]);
  }
  const p = g.attributes.position, v = new THREE.Vector3(), o = seed * 13.7;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const r = 1 + 0.5 * (fbm3(v.x * 1.3 + o, v.y * 1.3, v.z * 1.3, 3) - 0.5);
    v.multiplyScalar(r);
    for (const [n, c] of planes) { const dd = v.dot(n) - c; if (dd > 0) v.addScaledVector(n, -dd * 0.85); }
    v.multiplyScalar(1 + 0.07 * (noise3(v.x * 4 + o, v.y * 4, v.z * 4) - 0.5));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const nrm = g.attributes.normal, col = new Float32Array(p.count * 3);
  const tone = 0.8 + rng() * 0.45, warm = rng() * 0.03;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm3(v.x * 2.2 + o, v.y * 2.2, v.z * 2.2, 3);
    let r = (0.17 + warm) * tone * (0.6 + 0.8 * n), gg = 0.165 * tone * (0.6 + 0.8 * n), b = (0.16 - warm) * tone * (0.6 + 0.8 * n);
    const moss = smoothstep(0.35, 0.8, nrm.getY(i)) * smoothstep(0.42, 0.62, fbm3(v.x * 1.6 + o + 30, v.y * 1.6, v.z * 1.6, 3));
    r += (0.06 - r) * moss; gg += (0.13 - gg) * moss; b += (0.035 - b) * moss;
    col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function createStones() {
  const rng = mulberry32(2024);
  const group = new THREE.Group();
  const geos = [1, 2, 3, 4, 5, 6, 7].map(makeStoneGeo);
  const mat = addDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 }), { scale: 5, strength: 0.4, bump: 0.8, wet: 1 });
  const add = (x, z, s, sy = 0.62, sink = 0.3) => {
    const m = new THREE.Mesh(geos[Math.floor(rng() * geos.length)], mat);
    const h = s * sy;
    m.scale.set(s * (0.85 + rng() * 0.4), h, s * (0.85 + rng() * 0.4));
    m.position.set(x, Math.max(terrainH(x, z), -0.25) + h * (1 - sink * 2) * 0.5, z);
    m.rotation.set((rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.3);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  };
  // main ring on the shoreline
  const N = 54;
  for (let i = 0; i < N; i++) {
    const th = (i + (rng() - 0.5) * 0.5) / N * Math.PI * 2;
    const big = rng() < 0.13;
    const s = big ? 0.8 + rng() * 0.35 : 0.3 + rng() * 0.3;
    const [x, z] = shorePoint(th, 0.1 + rng() * 0.3 + (big ? 0.25 : 0));
    add(x, z, s, big ? 0.7 + rng() * 0.25 : 0.55 + rng() * 0.2);
  }
  // smaller stones & pebbles behind and between
  for (let i = 0; i < 80; i++) {
    const th = rng() * Math.PI * 2;
    const [x, z] = shorePoint(th, -0.15 + rng() * 1.3);
    add(x, z, 0.09 + rng() * 0.17, 0.6, 0.25);
  }
  // stepping stones leading away from the front shore
  let [sx, sz] = shorePoint(1.25, 1.1);
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(geos[i % geos.length], mat);
    const s = 0.42 + rng() * 0.1;
    m.scale.set(s, 0.09, s * (0.8 + rng() * 0.3));
    m.position.set(sx, terrainH(sx, sz) + 0.02, sz);
    m.rotation.y = rng() * 6.28; m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    sx += 0.45 + (rng() - 0.5) * 0.5; sz += 1.0 + rng() * 0.15;
  }
  return group;
}

// ------------------------------------------------------------------ lily pads + flowers
function padGeometry() {
  const R = 5, S = 30, pos = [], uv = [], idx = [], col = [];
  const notch = 0.2;
  for (let i = 0; i <= R; i++) for (let j = 0; j <= S; j++) {
    const r = i / R, a = notch + (j / S) * (Math.PI * 2 - 2 * notch);
    const rr = r * (1 + 0.035 * Math.sin(a * 9) * r);
    pos.push(Math.cos(a) * rr, 0.035 * r * r * r + 0.012 * Math.sin(a * 6) * r * r, Math.sin(a) * rr);
    uv.push(j / S, r);
    const k = r * r;
    col.push(0.05 - 0.025 * k, 0.2 - 0.09 * k, 0.045 - 0.015 * k);
  }
  for (let i = 0; i < R; i++) for (let j = 0; j < S; j++) {
    const a = i * (S + 1) + j, b = a + S + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function petalGeometry(len, wid, cup, cBase, cTip) {
  const U = 6, pos = [], col = [], idx = [];
  for (let i = 0; i <= U; i++) {
    const u = i / U, w = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7) * 0.97 + 0.03), 0.8) * wid * 0.5;
    for (let j = -1; j <= 1; j++) {
      pos.push(j * w, cup * u * u * len + (j === 0 ? -0.07 * wid : 0), u * len);
      const t = Math.pow(u, 1.5);
      col.push(cBase[0] + (cTip[0] - cBase[0]) * t, cBase[1] + (cTip[1] - cBase[1]) * t, cBase[2] + (cTip[2] - cBase[2]) * t);
    }
  }
  for (let i = 0; i < U; i++) for (let j = 0; j < 2; j++) { const a = i * 3 + j, b = a + 3; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function flowerGeometry(cBase, cTip) {
  const parts = [], m = new THREE.Matrix4(), rx = new THREE.Matrix4(), ry = new THREE.Matrix4();
  const rings = [[10, 1.0, 0.36, 0.30, 0.25], [9, 0.86, 0.33, 0.8, 0.35], [7, 0.66, 0.28, 1.15, 0.3], [5, 0.45, 0.22, 1.4, 0.2]];
  rings.forEach(([n, len, wid, tilt, cup], ri) => {
    for (let k = 0; k < n; k++) {
      const pg = petalGeometry(len, wid, cup, cBase, cTip);
      rx.makeRotationX(-tilt); ry.makeRotationY((k + ri * 0.5) / n * Math.PI * 2);
      m.multiplyMatrices(ry, rx);
      pg.applyMatrix4(m);
      parts.push(pg);
    }
  });
  const c = new THREE.SphereGeometry(0.16, 10, 6).scale(1, 0.7, 1).translate(0, 0.1, 0);
  c.deleteAttribute('uv'); c.deleteAttribute('normal');
  const cc = new Float32Array(c.attributes.position.count * 3);
  for (let i = 0; i < cc.length; i += 3) { cc[i] = 1.0; cc[i + 1] = 0.62; cc[i + 2] = 0.06; }
  c.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  parts.push(c);
  const g = mergeGeometries(parts.map((q) => (q.index ? q.toNonIndexed() : q)));
  g.computeVertexNormals();
  return g;
}

export function createLilies() {
  const rng = mulberry32(99);
  const group = new THREE.Group();
  const pads = [];
  const clusters = [[2.45, 1.7, 7], [0.75, 1.5, 6], [-0.6, 1.6, 5], [-1.7, 1.4, 6], [3.6, 1.6, 6], [-2.75, 1.5, 5], [1.55, 1.3, 4]];
  for (const [th, inset, n] of clusters) {
    const [cx, cz] = shorePoint(th, -inset);
    let tries = 0, placed = 0;
    while (placed < n && tries++ < 200) {
      const a = rng() * 6.28, r = Math.sqrt(rng()) * 1.5, s = 0.3 + rng() * 0.34;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (pondSD(x, z) > -0.5 - s * 0.6) continue;
      // keep the lantern drift zones clear
      if (FLOAT_SPOTS.some((f) => Math.abs(x - f[0]) < f[2] + 0.55 + s && Math.abs(z - f[1]) < f[3] + 0.35 + s)) continue;
      if (pads.some((q) => Math.hypot(q.x - x, q.z - z) < (q.s + s) * 0.97)) continue;
      pads.push({ x, z, s, rot: rng() * 6.28 }); placed++;
    }
  }
  const padMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, side: THREE.DoubleSide });
  padMat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec2 vPadUv;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vPadUv = uv;');
    sh.fragmentShader = 'varying vec2 vPadUv;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float vein = smoothstep(0.90, 1.0, abs(sin(vPadUv.x * 3.14159 * 11.0))) * smoothstep(0.08, 0.35, vPadUv.y);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.9 + vec3(0.01, 0.03, 0.0), vein * 0.5);
      diffuseColor.rgb *= 1.0 - 0.6 * smoothstep(0.93, 1.0, vPadUv.y);`);
  };
  const im = new THREE.InstancedMesh(padGeometry(), padMat, pads.length);
  const d = new THREE.Object3D(), c = new THREE.Color();
  pads.forEach((q, i) => {
    d.position.set(q.x, 0.012 + (i % 5) * 0.0012, q.z); d.rotation.set(0, q.rot, 0); d.scale.set(q.s, q.s, q.s); d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
    const t = rng(); c.setRGB(0.85 + 0.4 * t, 0.9 + 0.25 * rng(), 0.8 + 0.5 * rng()); im.setColorAt(i, c);
  });
  im.instanceColor.needsUpdate = true;
  im.receiveShadow = true;
  group.add(im);

  const fGeos = [
    flowerGeometry([1.0, 0.86, 0.9], [1.0, 0.36, 0.6]),
    flowerGeometry([1.0, 0.98, 0.9], [0.98, 0.92, 0.95]),
  ];
  const fMats = [
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, emissive: new THREE.Color().setRGB(0.10, 0.03, 0.06) }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, emissive: new THREE.Color().setRGB(0.07, 0.07, 0.08) }),
  ];
  const flowers = [];
  pads.forEach((q, i) => {
    if (i % 3 !== 1 || q.s < 0.36) return;
    const k = flowers.length % 3 === 2 ? 1 : 0;
    const f = new THREE.Mesh(fGeos[k], fMats[k]);
    const a = q.rot + 2.5, s = 0.2 + rng() * 0.08;
    f.position.set(q.x + Math.cos(a) * q.s * 0.35, 0.03, q.z + Math.sin(a) * q.s * 0.35);
    f.scale.setScalar(s); f.rotation.y = rng() * 6.28;
    group.add(f); flowers.push(f);
  });
  return { group, pads };
}

// ------------------------------------------------------------------ grass, reeds
function bladeGeometry(width, bend, c0, c1) {
  const S = 5, pos = [], col = [], idx = [];
  for (let i = 0; i <= S; i++) {
    const y = i / S, w = width * 0.5 * (1 - Math.pow(y, 1.6));
    pos.push(-w, y, bend * y * y, w, y, bend * y * y);
    for (let k = 0; k < 2; k++) col.push(c0[0] + (c1[0] - c0[0]) * y, c0[1] + (c1[1] - c0[1]) * y, c0[2] + (c1[2] - c0[2]) * y);
  }
  for (let i = 0; i < S; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function createGrass(uTime, avoid) {
  const rng = mulberry32(555);
  const group = new THREE.Group();
  const d = new THREE.Object3D(), c = new THREE.Color();
  const blocked = (x, z) => avoid.some((a) => Math.hypot(a[0] - x, a[1] - z) < a[2]);

  // short grass tufts
  const tufts = [];
  for (let i = 0; i < 950; i++) {
    const th = rng() * 6.28, off = 0.55 + Math.pow(rng(), 1.6) * 7.5;
    const [x, z] = shorePoint(th, off);
    if (blocked(x, z)) continue;
    tufts.push([x, z, 0.16 + rng() * 0.22, 9]);
  }
  // reed clumps at the water's edge
  const reeds = [];
  for (const th of [0.35, 1.9, 2.2, 3.35, -0.15, -1.3, -1.55, 4.25, 2.9]) {
    const n = 26 + Math.floor(rng() * 20);
    const [cx, cz] = shorePoint(th, 0.15);
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.28, r = Math.sqrt(rng()) * 0.75;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (pondSD(x, z) < -0.55) continue;
      reeds.push([x, z, 0.7 + rng() * 0.95]);
    }
  }
  const gGeo = bladeGeometry(0.035, 0.35, [0.03, 0.07, 0.02], [0.16, 0.27, 0.07]);
  const gMat = addSway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), uTime, 0.12);
  const total = tufts.reduce((s, t) => s + t[3], 0);
  const gim = new THREE.InstancedMesh(gGeo, gMat, total);
  let k = 0;
  for (const [x, z, h, n] of tufts) {
    const y = terrainH(x, z) - 0.02;
    for (let j = 0; j < n; j++) {
      d.position.set(x + (rng() - 0.5) * 0.22, y, z + (rng() - 0.5) * 0.22);
      d.rotation.set((rng() - 0.5) * 0.7, rng() * 6.28, (rng() - 0.5) * 0.7);
      const s = h * (0.6 + rng() * 0.7); d.scale.set(s * 1.6, s, s * 1.6); d.updateMatrix();
      gim.setMatrixAt(k, d.matrix);
      c.setRGB(0.75 + rng() * 0.5, 0.8 + rng() * 0.4, 0.7 + rng() * 0.4); gim.setColorAt(k, c); k++;
    }
  }
  gim.instanceColor.needsUpdate = true;
  group.add(gim);

  const rGeo = bladeGeometry(0.045, 0.22, [0.035, 0.075, 0.025], [0.2, 0.27, 0.08]);
  const rMat = addSway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }), uTime, 0.07);
  const rim = new THREE.InstancedMesh(rGeo, rMat, reeds.length);
  reeds.forEach(([x, z, h], i) => {
    d.position.set(x, Math.max(terrainH(x, z), -0.3) - 0.03, z);
    d.rotation.set((rng() - 0.5) * 0.35, rng() * 6.28, (rng() - 0.5) * 0.35);
    d.scale.set(1.3, h, 1.3); d.updateMatrix(); rim.setMatrixAt(i, d.matrix);
    c.setRGB(0.8 + rng() * 0.4, 0.85 + rng() * 0.3, 0.7 + rng() * 0.4); rim.setColorAt(i, c);
  });
  rim.instanceColor.needsUpdate = true; rim.castShadow = true;
  group.add(rim);
  return group;
}

// ------------------------------------------------------------------ shrubs
export function createShrubs() {
  const rng = mulberry32(31);
  const group = new THREE.Group();
  let g = new THREE.IcosahedronGeometry(1, 5); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4);
  const p = g.attributes.position, v = new THREE.Vector3(), col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = fbm3(v.x * 2.4, v.y * 2.4, v.z * 2.4, 3);
    v.multiplyScalar(1 + 0.3 * (n - 0.5));
    p.setXYZ(i, v.x, Math.max(v.y, -0.2), v.z);
    const m = noise3(v.x * 9, v.y * 9, v.z * 9);
    col[i * 3] = 0.03 + 0.04 * m; col[i * 3 + 1] = 0.085 + 0.08 * m; col[i * 3 + 2] = 0.025 + 0.02 * m;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mat = addDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), { scale: 9, strength: 0.7, bump: 1.6, wet: 0 });
  const spots = [[0.95, 2.1, 0.8], [0.65, 2.9, 0.6], [2.55, 2.3, 0.9], [2.8, 3.2, 0.65], [3.75, 2.2, 0.75], [-1.05, 2.0, 0.7],
    [-0.15, 2.6, 0.85], [-2.9, 3.4, 0.9], [4.5, 2.8, 0.7], [1.75, 3.6, 0.8], [-1.75, 4.6, 1.0], [3.2, 4.2, 1.0], [0.2, 4.4, 0.9]];
  for (const [th, off, s] of spots) {
    const [x, z] = shorePoint(th, off);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, terrainH(x, z) + s * 0.3, z);
    m.scale.set(s * (1.2 + rng() * 0.4), s * (0.7 + rng() * 0.2), s * (1.2 + rng() * 0.4));
    m.rotation.y = rng() * 6.28; m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  return { group, spots: spots.map(([th, off, s]) => [...shorePoint(th, off), s * 1.5]) };
}

// ------------------------------------------------------------------ maple
function leafGeometry() {
  const lobes = [1.0, 0.86, 0.66, 0.4, 0.66, 0.86], pos = [0, 0, 0], idx = [];
  const n = lobes.length * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, r = i % 2 === 0 ? lobes[i / 2] : 0.3;
    pos.push(Math.sin(a) * r, 0.12 * r * r, Math.cos(a) * r);
  }
  for (let i = 0; i < n; i++) idx.push(0, 1 + i, 1 + ((i + 1) % n));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function createMaple(uTime, x0, z0, lean) {
  const rng = mulberry32(4242);
  const group = new THREE.Group();
  const tubes = [], leaves = [];
  const rv = () => new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
  function branch(p, dir, len, rad, depth) {
    const pts = [p.clone()], d = dir.clone(), q = p.clone(), segs = 4;
    for (let i = 0; i < segs; i++) {
      d.addScaledVector(rv(), 0.2); if (depth > 0) d.y += 0.04; d.normalize();
      q.addScaledVector(d, len / segs); pts.push(q.clone());
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tg = new THREE.TubeGeometry(curve, depth < 2 ? 8 : 5, rad, depth < 2 ? 8 : 5, false);
    // taper toward the tip
    const tp = tg.attributes.position, tsegs = depth < 2 ? 8 : 5, rsegs = (depth < 2 ? 8 : 5) + 1, c = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i <= tsegs; i++) {
      curve.getPointAt(i / tsegs, c); const k = 1 - 0.38 * (i / tsegs);
      for (let j = 0; j < rsegs; j++) { const id = i * rsegs + j; v.fromBufferAttribute(tp, id).sub(c).multiplyScalar(k).add(c); tp.setXYZ(id, v.x, v.y, v.z); }
    }
    tg.deleteAttribute('uv');
    tubes.push(tg);
    if (depth >= 2) {
      const n = depth === 2 ? 26 : 60;
      for (let i = 0; i < n; i++) {
        const t = depth === 2 ? 0.4 + rng() * 0.6 : rng();
        const lp = curve.getPointAt(t), o = rv().multiplyScalar(0.62); o.y *= 0.32; o.y += 0.06;
        leaves.push(lp.add(o));
      }
    }
    if (depth < 4) {
      const n = depth === 0 ? 3 : (rng() < 0.45 ? 3 : 2);
      for (let k = 0; k < n; k++) {
        const nd = d.clone(); nd.y *= 0.45;
        const side = rv(); side.y *= 0.35;
        nd.addScaledVector(side.normalize(), 0.75 + rng() * 0.3);
        if (depth === 0) nd.add(lean.clone().multiplyScalar(0.25 + 0.5 * k / n));
        nd.y += 0.12; nd.normalize();
        branch(q, nd, len * (0.66 + rng() * 0.14), rad * 0.62, depth + 1);
      }
    }
  }
  branch(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(lean.x * 0.25, 1, lean.z * 0.25).normalize(), 2.0, 0.19, 0);
  const wood = new THREE.Mesh(mergeGeometries(tubes), addDetail(new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.09, 0.065, 0.05), roughness: 0.95 }), { scale: 7, strength: 0.6, bump: 1.0, wet: 0 }));
  wood.castShadow = true;
  group.add(wood);

  const lMat = new THREE.MeshStandardMaterial({ roughness: 0.65, side: THREE.DoubleSide, emissive: new THREE.Color().setRGB(0.05, 0.004, 0.0) });
  lMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 lp = instanceMatrix[3].xyz;
      float fl = sin(uTime*1.7 + lp.x*3.1 + lp.z*4.3) + 0.6*sin(uTime*3.1 + lp.y*5.0);
      transformed.y += fl * 0.22 * length(transformed.xz);
      transformed.x += sin(uTime*0.9 + lp.z*0.8) * 0.25;`);
  };
  const im = new THREE.InstancedMesh(leafGeometry(), lMat, leaves.length);
  const d = new THREE.Object3D(), c = new THREE.Color();
  leaves.forEach((p, i) => {
    d.position.copy(p);
    d.rotation.set((rng() - 0.5) * 1.3, rng() * 6.28, (rng() - 0.5) * 1.3);
    const s = 0.085 + rng() * 0.07; d.scale.set(s, s, s); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
    const t = rng();
    if (t < 0.72) c.setRGB(0.62 + rng() * 0.3, 0.035 + rng() * 0.07, 0.015);
    else if (t < 0.93) c.setRGB(0.85, 0.2 + rng() * 0.15, 0.02);
    else c.setRGB(0.9, 0.5, 0.05);
    im.setColorAt(i, c);
  });
  im.instanceColor.needsUpdate = true; im.castShadow = true; im.frustumCulled = false;
  group.add(im);
  group.position.set(x0, terrainH(x0, z0), z0);

  // fallen leaves floating on the pond and lying on the bank
  const fl = new THREE.InstancedMesh(leafGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide }), 70);
  for (let i = 0; i < 70; i++) {
    let x, z, tries = 0;
    do { const a = rng() * 6.28, r = Math.sqrt(rng()) * 5.2; x = x0 + lean.x * 2.2 + Math.cos(a) * r; z = z0 + lean.z * 2.2 + Math.sin(a) * r; }
    while (tries++ < 20 && Math.abs(pondSD(x, z)) < 0.5);
    const inPond = pondSD(x, z) < 0;
    d.position.set(x, inPond ? 0.008 : terrainH(x, z) + 0.02, z);
    d.rotation.set(inPond ? 0 : (rng() - 0.5) * 0.4, rng() * 6.28, 0);
    const s = 0.08 + rng() * 0.05; d.scale.set(s, s * 0.5, s); d.updateMatrix(); fl.setMatrixAt(i, d.matrix);
    c.setRGB(0.6 + rng() * 0.3, 0.05 + rng() * 0.2, 0.02); fl.setColorAt(i, c);
  }
  fl.instanceColor.needsUpdate = true;
  return { group, fallen: fl };
}

// ------------------------------------------------------------------ bamboo
export function createBamboo(uTime, cx, cz) {
  const rng = mulberry32(808);
  const group = new THREE.Group();
  const N = 19;
  const cyl = new THREE.CylinderGeometry(0.72, 1, 1, 8, 1).translate(0, 0.5, 0);
  const sMat = new THREE.MeshStandardMaterial({ roughness: 0.5 });
  sMat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying float vBy;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vBy = position.y;');
    sh.fragmentShader = 'varying float vBy;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float nd = abs(fract(vBy * 15.0) - 0.5);
      diffuseColor.rgb *= 1.0 - 0.55 * smoothstep(0.455, 0.49, nd);
      diffuseColor.rgb *= 0.8 + 0.3 * smoothstep(0.5, 0.0, nd);`);
  };
  const stalks = new THREE.InstancedMesh(cyl, sMat, N);
  const lGeo = bladeGeometry(0.16, -0.25, [0.05, 0.11, 0.025], [0.13, 0.24, 0.06]);
  const lMat = addSway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }), uTime, 0.1);
  const PER = 85;
  const leaves = new THREE.InstancedMesh(lGeo, lMat, N * PER);
  const d = new THREE.Object3D(), c = new THREE.Color(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  let li = 0;
  for (let i = 0; i < N; i++) {
    const a = rng() * 6.28, r = 0.25 + Math.sqrt(rng()) * 1.25;
    const x = cx + Math.cos(a) * r * 1.5, z = cz + Math.sin(a) * r * 0.85;
    const h = 5.2 + rng() * 3.0, rad = 0.05 + rng() * 0.03;
    const lean = new THREE.Vector3((rng() - 0.5) * 0.22, 1, (rng() - 0.5) * 0.22).normalize();
    q.setFromUnitVectors(up, lean);
    const base = new THREE.Vector3(x, terrainH(x, z) - 0.1, z);
    d.position.copy(base); d.quaternion.copy(q); d.scale.set(rad, h, rad); d.updateMatrix();
    stalks.setMatrixAt(i, d.matrix);
    c.setRGB(0.16 + rng() * 0.1, 0.27 + rng() * 0.1, 0.08 + rng() * 0.03); stalks.setColorAt(i, c);
    for (let k = 0; k < PER; k++) {
      const t = 0.42 + Math.pow(rng(), 0.7) * 0.58, la = rng() * 6.28, lr = 0.1 + rng() * (0.9 - 0.4 * t);
      d.position.copy(base).addScaledVector(lean, h * t);
      d.position.x += Math.cos(la) * lr; d.position.z += Math.sin(la) * lr; d.position.y += (rng() - 0.5) * 0.3;
      d.rotation.set(1.3 + rng() * 0.9, la + Math.PI / 2 + (rng() - 0.5), 0, 'YXZ');
      const s = 0.38 + rng() * 0.3; d.scale.set(s, s, s); d.updateMatrix();
      leaves.setMatrixAt(li, d.matrix);
      c.setRGB(0.75 + rng() * 0.5, 0.8 + rng() * 0.4, 0.7 + rng() * 0.5); leaves.setColorAt(li, c); li++;
    }
  }
  stalks.instanceColor.needsUpdate = true; leaves.instanceColor.needsUpdate = true;
  stalks.castShadow = true; leaves.castShadow = true;
  stalks.frustumCulled = false; leaves.frustumCulled = false;
  group.add(stalks, leaves);
  return group;
}

// ------------------------------------------------------------------ fence + backdrop trees
export function createBackdrop() {
  const rng = mulberry32(1717);
  const group = new THREE.Group();
  const R = 16.2;
  const fMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.13, 0.10, 0.065), roughness: 0.85, side: THREE.DoubleSide });
  fMat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec2 vFUv;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vFUv = uv;');
    sh.fragmentShader = 'varying vec2 vFUv;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float fs = vFUv.x * 520.0; float fi = floor(fs); float ff = abs(fract(fs) - 0.5);
      float fr = fract(sin(fi * 91.7) * 4375.5);
      diffuseColor.rgb *= (0.65 + 0.6 * fr) * smoothstep(0.5, 0.36, ff);
      float tie = smoothstep(0.02, 0.0, abs(vFUv.y - 0.78)) + smoothstep(0.02, 0.0, abs(vFUv.y - 0.3));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.025, 0.02), tie * 0.8);`);
  };
  const fence = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 2.6, 128, 1, true), fMat);
  fence.position.y = 0.75; fence.receiveShadow = true;
  group.add(fence);
  const rail = new THREE.Mesh(new THREE.TorusGeometry(R, 0.07, 6, 128).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.07, 0.05, 0.035), roughness: 0.8 }));
  rail.position.y = 2.08;
  group.add(rail);

  // dark tree silhouettes beyond the fence
  let blob = new THREE.IcosahedronGeometry(1, 4); blob.deleteAttribute('uv'); blob.deleteAttribute('normal'); blob = mergeVertices(blob, 1e-4);
  const p = blob.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    v.multiplyScalar(1 + 0.4 * (fbm3(v.x * 2 + 3, v.y * 2, v.z * 2, 3) - 0.5) + 0.16 * (noise3(v.x * 6, v.y * 6, v.z * 6) - 0.5));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  blob.computeVertexNormals();
  const dark = new THREE.MeshBasicMaterial();   // pure silhouettes, only fog gives them depth
  const NB = 340, blobs = new THREE.InstancedMesh(blob, dark, NB);
  const d = new THREE.Object3D(), c = new THREE.Color();
  for (let i = 0; i < NB; i++) {
    const a = rng() * 6.28, r = 19 + rng() * 12, s = 1.2 + rng() * 1.3, h = 0.8 + Math.pow(rng(), 1.6) * 3.0 + (r - 19) * 0.16;
    d.position.set(Math.cos(a) * r, h, Math.sin(a) * r);
    d.rotation.set(rng(), rng() * 6.28, rng()); d.scale.set(s, s * (0.8 + rng() * 0.5), s); d.updateMatrix();
    blobs.setMatrixAt(i, d.matrix);
    const k = 0.6 + rng() * 0.8; c.setRGB(0.016 * k, 0.03 * k, 0.02 * k); blobs.setColorAt(i, c);
  }
  blobs.instanceColor.needsUpdate = true; blobs.frustumCulled = false;
  group.add(blobs);
  // conifers: a lathe profile with drooping tiers
  const prof = [new THREE.Vector2(0.001, 1)];
  for (let i = 1; i <= 7; i++) {
    const y = 1 - i / 7.6, r = 0.12 + 0.88 * (i / 7);
    prof.push(new THREE.Vector2(r, y - 0.035), new THREE.Vector2(r * 0.55, y - 0.015));
  }
  prof.push(new THREE.Vector2(0.08, 0.0));
  const cone = new THREE.LatheGeometry(prof, 9);
  const NC = 46, cones = new THREE.InstancedMesh(cone, dark, NC);
  for (let i = 0; i < NC; i++) {
    const a = rng() * 6.28, r = 21 + rng() * 12, h = 4.5 + rng() * 4.5;
    d.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    d.rotation.set((rng() - 0.5) * 0.06, rng() * 6.28, (rng() - 0.5) * 0.06); d.scale.set(1.5 + rng() * 1.2, h, 1.5 + rng() * 1.2); d.updateMatrix();
    cones.setMatrixAt(i, d.matrix);
    const k = 0.6 + rng() * 0.6; c.setRGB(0.012 * k, 0.026 * k, 0.02 * k); cones.setColorAt(i, c);
  }
  cones.instanceColor.needsUpdate = true; cones.frustumCulled = false;
  group.add(cones);
  return group;
}

// ------------------------------------------------------------------ fireflies
export function createFireflies(uTime) {
  const rng = mulberry32(606);
  const N = 90, pos = new Float32Array(N * 3), seed = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const th = rng() * 6.28, off = rng() < 0.3 ? -rng() * 2.5 : 0.3 + rng() * 5.5;
    const [x, z] = shorePoint(th, off);
    pos[i * 3] = x; pos[i * 3 + 1] = 0.45 + rng() * 1.9; pos[i * 3 + 2] = z;
    seed[i * 4] = rng(); seed[i * 4 + 1] = rng(); seed[i * 4 + 2] = rng(); seed[i * 4 + 3] = rng();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const uniforms = { uTime, uScale: { value: 1000 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec4 aSeed; uniform float uTime, uScale; varying float vB;
      void main(){
        vec3 p = position;
        p.x += sin(uTime*(0.15+0.25*aSeed.x) + aSeed.y*6.28)*1.1 + sin(uTime*0.9*aSeed.z + aSeed.w*6.28)*0.15;
        p.y += sin(uTime*(0.2+0.3*aSeed.z) + aSeed.w*6.28)*0.4;
        p.z += cos(uTime*(0.13+0.22*aSeed.y) + aSeed.x*6.28)*1.1 + cos(uTime*0.8*aSeed.w + aSeed.z*6.28)*0.15;
        vB = smoothstep(0.1, 0.9, sin(uTime*(0.7+aSeed.z*0.9) + aSeed.w*30.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uScale * 0.085 * (0.6 + 0.4*vB) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vB;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(0.75, 1.0, 0.25) * (a*a*a*5.0 + a*0.35) * vB, 1.0);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return { points: pts, uniforms };
}

export { POND, pondRadius };
