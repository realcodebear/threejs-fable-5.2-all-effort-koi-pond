// Ground: pond bed with pebbles and silt, wet shoreline, moss and earth on the banks.
// Lighting comes from the baked ground-light map (sky + afterglow with soft shadows) plus
// the lanterns, so the shader stays cheap even though it covers most of the screen.
import * as THREE from 'three';
import { groundHeight, uSdf, uSdfScale, GLSL_NOISE } from './common.js';
import { uNoise2 } from './noisetex.js';
import { lightUniforms, GLSL_LIGHT } from './lighting.js';

function terrainMaterial(kind) {
  return new THREE.ShaderMaterial({
    name: 'Terrain-' + kind,
    defines: { [kind]: 1 },
    uniforms: { ...lightUniforms, uSdf, uSdfScale, tNoise2: uNoise2 },
    vertexShader: /* glsl */`
      varying vec3 vWPos;
      varying vec3 vN;
      varying float vDepth;
      void main() {
        vWPos = position;
        vN = normal;
        vec4 mv = viewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D tNoise2, uSdf;
      uniform float uSdfScale;
      varying vec3 vWPos;
      varying vec3 vN;
      varying float vDepth;
      ${GLSL_NOISE}
      ${GLSL_LIGHT}
      void main() {
        #ifdef SHORE
          clipPass(vWPos);
        #endif
        vec2 p = vWPos.xz;
        float y = vWPos.y;
        vec4 na = texture2D(tNoise2, p * 0.047);
        vec4 nb = texture2D(tNoise2, p * 0.33 + 0.37);
        vec4 nc = texture2D(tNoise2, p * 2.9 + 0.11);
        float n1 = na.r, n2 = nb.g, n3 = nc.b, n4 = nc.a;

        // moss: velvety, mottled between deep and yellowish green
        vec3 moss = mix(vec3(0.026, 0.078, 0.020), vec3(0.074, 0.140, 0.027), smoothstep(0.25, 0.75, n1));
        moss = mix(moss, vec3(0.110, 0.155, 0.040), smoothstep(0.55, 0.85, n2) * 0.45);
        moss *= 0.74 + 0.52 * n3;
        moss *= 0.86 + 0.28 * n4;
        // bare earth where the moss thins out
        vec3 earth = mix(vec3(0.045, 0.036, 0.028), vec3(0.080, 0.062, 0.045), n2) * (0.75 + 0.5 * n3);
        float bare = smoothstep(0.60, 0.74, na.g * 0.8 + nb.r * 0.3);
        vec3 col = mix(moss, earth, bare * 0.7);
        float bump = n3 * 0.6 + n4 * 0.4;

        #ifndef LAND
        {
          float shore = smoothstep(0.10, -0.02, y + (n2 - 0.5) * 0.07);          // 1 below the waterline
          vec3 vo = voronoi(p * 25.0 + n1 * 2.0);                 // small pebbles
          vec3 vo2 = voronoi(p * 9.0 + 5.0);                      // a few larger cobbles
          float e1 = smoothstep(0.02, 0.24, vo.y - vo.x);
          float e2 = smoothstep(0.02, 0.20, vo2.y - vo2.x);
          vec3 c1 = mix(vec3(0.055, 0.052, 0.048), vec3(0.200, 0.180, 0.155), vo.z * vo.z);
          c1 = mix(c1, vec3(0.125, 0.082, 0.058), step(0.82, vo.z) * 0.6);
          vec3 c2 = mix(vec3(0.065, 0.066, 0.068), vec3(0.220, 0.210, 0.195), vo2.z);
          float big = step(0.66, vo2.z) * e2;
          vec3 pebbles = mix(c1 * (0.45 + 0.55 * e1), c2 * (0.6 + 0.4 * e2), big * 0.9) * (0.85 + 0.3 * n4);
          vec3 silt = mix(vec3(0.026, 0.030, 0.021), vec3(0.050, 0.054, 0.036), n1) * (0.8 + 0.4 * n2);
          float deep = smoothstep(-0.14, -0.60, y + (n1 - 0.5) * 0.3);
          float siltAmt = clamp(deep * 0.95 + smoothstep(0.45, 0.75, n2) * 0.35 * shore, 0.0, 1.0);
          vec3 bed = mix(pebbles, silt, siltAmt);
          // the deep part of the bowl sinks into green-black gloom
          bed = mix(bed, bed * vec3(0.55, 0.80, 0.55), deep * 0.6);
          bed *= mix(1.0, 0.50, smoothstep(-0.35, -0.95, y));
          col = mix(col, bed, shore);
          // damp band just above the water
          float damp = smoothstep(0.16, 0.0, y) * (1.0 - shore);
          col *= 1.0 - 0.45 * damp;
        }
        #endif

        vec3 n = normalize(vN);
        // let the lantern light catch the small bumps of moss and pebbles
        vec3 nl = normalize(n + vec3(nc.r - 0.5, 0.0, nc.g - 0.5) * 0.55 + vec3(nb.r - 0.5, 0.0, nb.b - 0.5) * 0.25);
        vec3 light = groundLight(p) * (0.82 + 0.36 * bump) + lanternLight(vWPos, nl, 0.08);
        gl_FragColor = vec4(applyFog(col * light, vDepth), 1.0);
      }`,
  });
}

// Returns { land, shore, bed }: three meshes sharing one vertex buffer.
//   bed   - always under water: only drawn in the refraction pass
//   shore - the band around the waterline: drawn everywhere
//   land  - never under water: main view and reflections
export function createTerrain() {
  const N = 240;
  const A = 10.5, B = 54.0, P = 7;
  const map = (u) => Math.sign(u) * (A * Math.abs(u) + B * Math.pow(Math.abs(u), P));
  const pos = new Float32Array((N + 1) * (N + 1) * 3);
  let k = 0;
  for (let j = 0; j <= N; j++) {
    const z = map((j / N) * 2 - 1);
    for (let i = 0; i <= N; i++) {
      const x = map((i / N) * 2 - 1);
      pos[k++] = x; pos[k++] = groundHeight(x, z); pos[k++] = z;
    }
  }
  const all = [], land = [], shore = [], bed = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    const ya = pos[a * 3 + 1], yb = pos[b * 3 + 1], yc = pos[c * 3 + 1], yd = pos[d * 3 + 1];
    const lo = Math.min(ya, yb, yc, yd), hi = Math.max(ya, yb, yc, yd);
    const list = hi < -0.07 ? bed : lo > 0.11 ? land : shore;
    list.push(a, c, b, b, c, d);
    all.push(a, c, b, b, c, d);
  }
  const full = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3);
  full.setAttribute('position', posAttr);
  full.setIndex(all);
  full.computeVertexNormals();
  const norAttr = full.attributes.normal;

  const make = (indices, kind, name) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', posAttr);
    g.setAttribute('normal', norAttr);
    g.setIndex(indices);
    const m = new THREE.Mesh(g, terrainMaterial(kind));
    m.name = name;
    m.frustumCulled = false;
    return m;
  };
  return {
    land: make(land, 'LAND', 'terrain-land'),
    shore: make(shore, 'SHORE', 'terrain-shore'),
    bed: make(bed, 'BED', 'terrain-bed'),
  };
}
