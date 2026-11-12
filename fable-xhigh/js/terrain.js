// Ground: one polar-grid mesh that forms both the mossy bank and the pond bowl.
import * as THREE from 'three';
import { POND, POND_GLSL, OCC_EXT, NF, pondR, groundH, patchStandard } from './common.js';

export function createTerrain(ctx) {
  const NS = 220;            // sectors
  const NIN = 34, NOUT = 64; // rings inside / outside the outline
  const ringS = [];
  for (let i = 0; i <= NIN; i++) ringS.push(Math.pow(i / NIN, 0.8));
  for (let i = 1; i <= NOUT; i++) ringS.push(1 + (Math.exp((i / NOUT) * 5.4) - 1) * 0.5);
  const NR = ringS.length;

  const pos = new Float32Array(NR * NS * 3);
  for (let i = 0; i < NR; i++) {
    for (let j = 0; j < NS; j++) {
      const th = (j / NS) * Math.PI * 2;
      const s = ringS[i];
      // far rings relax towards a circle so the mesh stays well shaped
      const r = pondR(th) * s;
      const x = Math.cos(th) * r * POND.SX, z = Math.sin(th) * r;
      const k = (i * NS + j) * 3;
      pos[k] = x; pos[k + 1] = groundH(x, z); pos[k + 2] = z;
    }
  }
  const idx = [];
  for (let i = 0; i < NR - 1; i++) {
    for (let j = 0; j < NS; j++) {
      const a = i * NS + j, b = i * NS + (j + 1) % NS, c = a + NS, d = b + NS;
      if (i === 0) { idx.push(a, d, c); continue; } // centre ring collapses to a point
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // make sure faces point up
  const nrm = geo.attributes.normal;
  if (nrm.getY(NS * 40) < 0) {
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, metalness: 0.0 });
  patchStandard(mat, {
    key: 'terrain',
    uniforms: { uOcc: ctx.uOcc, uFishSeg: ctx.fishSeg, uFishPar: ctx.fishPar },
    fragPars: /* glsl */`
      uniform sampler2D uOcc;
      uniform vec4 uFishSeg[${NF}];
      uniform vec3 uFishPar[${NF}];
      ${POND_GLSL}
      float tBump; float tUnder;
    `,
    fragColor: /* glsl */`
    {
      vec3 wp = vWPos;
      float n1 = fbm(wp.xz * 0.55 + 3.0);
      float n3 = vnoise(wp.xz * 26.0);
      float n4 = vnoise(wp.xz * 95.0);
      float under = smoothstep(0.03, -0.02, wp.y);
      tUnder = under;
      vec3 above = vec3(0.0), bed = vec3(0.0);
      float peb = 0.0;
      if (under < 0.999) {
        // moss carpet with yellow-green drifts and a few bare-soil patches
        float pd = pondD(wp.xz);
        float n2 = fbm(wp.xz * 3.3 + 11.0);
        vec3 moss = mix(vec3(0.020, 0.050, 0.012), vec3(0.060, 0.115, 0.022), n2);
        moss = mix(moss, vec3(0.115, 0.14, 0.035), smoothstep(0.50, 0.80, n1) * 0.55);
        moss *= 0.62 + 0.45 * n3 + 0.30 * n4;
        vec3 soil = vec3(0.070, 0.054, 0.040) * (0.55 + 0.5 * n3 + 0.45 * n4);
        float soilMask = smoothstep(0.50, 0.0, -pd) * 0.8;
        soilMask = max(soilMask, smoothstep(0.34, 0.22, n1) * 0.55);
        above = mix(moss, soil, soilMask);
      }
      if (under > 0.001) {
        // pond bed: gravel and cobbles on dark silt, algae in the deep
        vec3 v1 = voronoi(wp.xz * 15.0 + n3 * 0.25);
        vec3 v2 = voronoi(wp.xz * 5.2 + 3.7);
        float p1 = smoothstep(0.02, 0.24, v1.y - v1.x);
        float p2 = smoothstep(0.04, 0.30, v2.y - v2.x) * step(0.60, v2.z);
        vec3 c1 = mix(vec3(0.095, 0.09, 0.08), vec3(0.33, 0.30, 0.25), v1.z * v1.z);
        c1 = mix(c1, vec3(0.25, 0.14, 0.09), step(0.86, v1.z) * 0.6);
        vec3 c2 = mix(vec3(0.12, 0.12, 0.125), vec3(0.30, 0.29, 0.27), fract(v2.z * 7.3));
        vec3 silt = vec3(0.080, 0.072, 0.054) * (0.75 + 0.5 * n3);
        bed = mix(silt, c1 * (0.72 + 0.4 * p1), smoothstep(0.0, 0.55, p1) * 0.85);
        bed = mix(bed, c2 * (0.65 + 0.45 * p2) * (0.85 + 0.3 * n4), smoothstep(0.0, 0.35, p2));
        peb = max(p1 * 0.45, p2);
        float alg = clamp(smoothstep(-0.15, -0.9, wp.y) * 0.5 + (n1 - 0.42) * 0.9, 0.0, 0.8);
        bed = mix(bed, vec3(0.040, 0.080, 0.036), alg);
        bed *= mix(1.0, 0.55, smoothstep(0.0, -1.0, wp.y));
      }
      vec3 col = mix(above, bed, under);
      col *= mix(0.5, 1.0, clamp(smoothstep(0.0, 0.10, wp.y) + under, 0.0, 1.0)); // damp rim
      // baked-style occlusion: R solids, G lily pads, B tree canopy
      vec3 occ = texture2D(uOcc, vec2(wp.x, -wp.z) / ${OCC_EXT.toFixed(1)} + 0.5).rgb;
      col *= (1.0 - 0.78 * occ.r) * (1.0 - 0.45 * occ.b);
      if (under > 0.01) {
        col *= 1.0 - 0.55 * occ.g * under;
        float sh = 0.0;
        for (int i = 0; i < ${NF}; i++) {
          vec4 sg = uFishSeg[i]; vec3 pr = uFishPar[i];
          vec2 pa = wp.xz - sg.xy, ba = sg.zw - sg.xy;
          float hh = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
          float dd = length(pa - ba * hh);
          sh = max(sh, (1.0 - smoothstep(pr.x * 0.3, pr.x + pr.y, dd)) * pr.z);
        }
        col *= 1.0 - 0.6 * sh * under;
      }
      tBump = mix((n3 * 0.5 + n4 * 0.3) * 0.006, peb * 0.022, under);
      diffuseColor.rgb = col;
    }`,
    fragRough: /* glsl */`roughnessFactor = mix(0.96, 0.8, tUnder);`,
    fragNormal: /* glsl */`normal = bumpNormal(-vViewPosition, normal, tBump);`,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  ctx.scene.add(mesh);
  return mesh;
}
