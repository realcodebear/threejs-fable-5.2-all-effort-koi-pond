// Tileable noise textures generated once at start-up. Sampling these is far cheaper than
// hashing procedural noise in every fragment.
import * as THREE from 'three';
import { makeRng } from './common.js';

const quintic = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// Periodic value noise on an N^2 grid with lattice frequency F.
function layer2(N, F, rng, out, amp) {
  const g = new Float32Array(F * F);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  for (let y = 0; y < N; y++) {
    const fy = (y / N) * F, y0 = Math.floor(fy), sy = quintic(fy - y0), y1 = (y0 + 1) % F;
    for (let x = 0; x < N; x++) {
      const fx = (x / N) * F, x0 = Math.floor(fx), sx = quintic(fx - x0), x1 = (x0 + 1) % F;
      const a = g[y0 * F + x0], b = g[y0 * F + x1], c = g[y1 * F + x0], d = g[y1 * F + x1];
      out[y * N + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
    }
  }
}
function layer3(N, F, rng, out, amp) {
  const g = new Float32Array(F * F * F);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  const idx = new Int32Array(N * 2), w = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const f = (i / N) * F, i0 = Math.floor(f);
    idx[i * 2] = i0; idx[i * 2 + 1] = (i0 + 1) % F; w[i] = quintic(f - i0);
  }
  for (let z = 0; z < N; z++) {
    const z0 = idx[z * 2] * F * F, z1 = idx[z * 2 + 1] * F * F, sz = w[z];
    for (let y = 0; y < N; y++) {
      const y0 = idx[y * 2] * F, y1 = idx[y * 2 + 1] * F, sy = w[y];
      for (let x = 0; x < N; x++) {
        const x0 = idx[x * 2], x1 = idx[x * 2 + 1], sx = w[x];
        const a = g[z0 + y0 + x0] + (g[z0 + y0 + x1] - g[z0 + y0 + x0]) * sx;
        const b = g[z0 + y1 + x0] + (g[z0 + y1 + x1] - g[z0 + y1 + x0]) * sx;
        const c = g[z1 + y0 + x0] + (g[z1 + y0 + x1] - g[z1 + y0 + x0]) * sx;
        const d = g[z1 + y1 + x0] + (g[z1 + y1 + x1] - g[z1 + y1 + x0]) * sx;
        const ab = a + (b - a) * sy, cd = c + (d - c) * sy;
        out[(z * N + y) * N + x] += amp * (ab + (cd - ab) * sz);
      }
    }
  }
}
function normalize(a) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < a.length; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
  const s = 1 / Math.max(hi - lo, 1e-6);
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) * s;
  return a;
}

// 2D: R = fbm (base 4), G = fbm (base 6, other seed), B = single smooth octave (16), A = fine grain (64)
function make2D() {
  const N = 256, rng = makeRng(1234);
  const ch = [0, 1, 2, 3].map(() => new Float32Array(N * N));
  [[4, 1], [8, 0.5], [16, 0.25], [32, 0.125], [64, 0.06]].forEach(([f, a]) => layer2(N, f, rng, ch[0], a));
  [[6, 1], [12, 0.5], [24, 0.25], [48, 0.125]].forEach(([f, a]) => layer2(N, f, rng, ch[1], a));
  layer2(N, 16, rng, ch[2], 1); layer2(N, 32, rng, ch[2], 0.35);
  layer2(N, 64, rng, ch[3], 1); layer2(N, 128, rng, ch[3], 0.6);
  ch.forEach(normalize);
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) for (let c = 0; c < 4; c++) data[i * 4 + c] = Math.round(ch[c][i] * 255);
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// 3D: R = fbm (base 3), G = fbm (base 5, other seed), B = smooth octave (10), A = fine grain (20)
function make3D() {
  const N = 32, rng = makeRng(4321);
  const ch = [0, 1, 2, 3].map(() => new Float32Array(N * N * N));
  [[2, 1], [4, 0.5], [8, 0.25], [16, 0.12]].forEach(([f, a]) => layer3(N, f, rng, ch[0], a));
  [[4, 1], [8, 0.5], [16, 0.25]].forEach(([f, a]) => layer3(N, f, rng, ch[1], a));
  layer3(N, 8, rng, ch[2], 1);
  layer3(N, 16, rng, ch[3], 1);
  ch.forEach(normalize);
  const data = new Uint8Array(N * N * N * 4);
  for (let i = 0; i < N * N * N; i++) for (let c = 0; c < 4; c++) data[i * 4 + c] = Math.round(ch[c][i] * 255);
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;      // mip-maps: fine grain fades out with distance instead of shimmering
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

export const noise2D = make2D();
export const noise3D = make3D();
export const uNoise2 = { value: noise2D };
export const uNoise3 = { value: noise3D };
