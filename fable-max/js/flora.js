// Garden plants and backdrop: grass tufts and iris leaves along the banks, rounded azalea
// mounds, a bamboo grove, a bamboo fence and dark cloud-pruned pines beyond it.
// Everything is instanced and uses the lightweight shared lighting.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng, sdf, sdfGrad, groundHeight, pondBoundary, uTime, noise3, fbm3, fbm2, GLSL_NOISE, clamp } from './common.js';
import { uNoise2, uNoise3 } from './noisetex.js';
import { lightUniforms, GLSL_LIGHT } from './lighting.js';

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

// ---------------------------------------------------------------------------------------
// Grass-like tufts
// ---------------------------------------------------------------------------------------
function tuftGeometry(rng, { blades, height, width, spread, lean, segs = 4, droop = 0.5 }) {
  const pos = [], nor = [], aT = [], idx = [];
  for (let b = 0; b < blades; b++) {
    const az = rng.range(0, Math.PI * 2);
    const ox = Math.cos(az), oz = Math.sin(az);                 // outward direction
    const sx = -oz, sz = ox;                                    // across the blade
    const h = height * rng.range(0.55, 1.0), w = width * rng.range(0.7, 1.1);
    const ln = lean * rng.range(0.35, 1.0);
    const r0 = rng.range(0, spread);
    let px = ox * r0, py = 0, pz = oz * r0;
    const base = pos.length / 3;
    const ph = rng();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const ang = ln * Math.pow(t, 1.15) + droop * ln * t * t * t;   // bend away from the vertical
      const tx = Math.sin(ang) * ox, ty = Math.cos(ang), tz = Math.sin(ang) * oz;   // blade direction
      if (i > 0) { px += tx * h / segs; py += ty * h / segs; pz += tz * h / segs; }
      const hw = w * 0.5 * (1.0 - Math.pow(t, 1.7)) + 0.0008;
      // normal: perpendicular to the blade direction and to the across vector
      const nn = new THREE.Vector3(ty * sz, sx * tz - sz * tx, -sx * ty).normalize();
      for (const side of [-1, 1]) {
        pos.push(px + sx * hw * side, py, pz + sz * hw * side);
        nor.push(nn.x, nn.y, nn.z);
        aT.push(t, ph);
      }
    }
    for (let i = 0; i < segs; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 2));
  g.setIndex(idx);
  return g;
}

function grassMaterial() {
  return new THREE.ShaderMaterial({
    name: 'Grass',
    uniforms: { ...lightUniforms, uTime },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec2 aT;
      uniform float uTime;
      varying vec3 vWPos; varying vec3 vN; varying vec3 vCol; varying vec3 vRoot; varying float vT; varying float vDepth;
      void main() {
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float t = aT.x;
        // breeze: the tips sway, the base stays put
        float w = sin(uTime * 1.25 + root.x * 0.9 + root.z * 0.6 + aT.y * 2.0) * 0.6 + sin(uTime * 2.7 + root.x * 2.3 - root.z * 1.4 + aT.y * 6.0) * 0.3;
        float amp = 0.035 * t * t * length(instanceMatrix[1].xyz);
        wp.x += w * amp;
        wp.z += w * amp * 0.45;
        vWPos = wp.xyz; vRoot = root; vT = t;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #else
          vCol = vec3(1.0);
        #endif
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec3 vWPos; varying vec3 vN; varying vec3 vCol; varying vec3 vRoot; varying float vT; varying float vDepth;
      ${GLSL_LIGHT}
      void main() {
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        n = normalize(n + vec3(0.0, 0.9, 0.0));                       // soften: blades read as a mass
        vec3 albedo = mix(vec3(0.018, 0.045, 0.014), vec3(0.095, 0.190, 0.045), vT) * vCol;
        vec3 light = groundLight(vRoot.xz) * mix(0.45, 1.25, vT);
        light += lanternLight(vWPos, n, 0.7) * mix(0.5, 1.0, vT);
        gl_FragColor = vec4(applyFog(albedo * light, vDepth), 1.0);
      }`,
  });
}

// ---------------------------------------------------------------------------------------
// Azalea mounds (rounded, clipped shrubs), some in bloom
// ---------------------------------------------------------------------------------------
function shrubGeometry(rng) {
  let g = new THREE.IcosahedronGeometry(1, 5);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const p = g.attributes.position, v = new THREE.Vector3();
  const seed = rng.range(0, 50);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm3(v.x * 1.6 + seed, v.y * 1.6, v.z * 1.6 + seed, 3);
    const bumps = noise3(v.x * 5.5 + seed, v.y * 5.5, v.z * 5.5);
    v.multiplyScalar(1.0 + (n - 0.5) * 0.42 + (bumps - 0.5) * 0.10);
    v.y = v.y * 0.72 + 0.28;                                   // flattened, sitting on the ground
    if (v.y < 0.0) v.y *= 0.3;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function shrubMaterial() {
  return new THREE.ShaderMaterial({
    name: 'Shrub',
    uniforms: { ...lightUniforms, tNoise3: uNoise3 },
    vertexShader: /* glsl */`
      attribute float aBloom;
      varying vec3 vWPos; varying vec3 vN; varying vec3 vCol; varying vec3 vRoot; varying float vH; varying float vDepth; varying float vBloom;
      void main() {
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vRoot = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vWPos = wp.xyz; vH = position.y; vBloom = aBloom;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #else
          vCol = vec3(1.0);
        #endif
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      precision highp sampler3D;
      uniform sampler3D tNoise3;
      varying vec3 vWPos; varying vec3 vN; varying vec3 vCol; varying vec3 vRoot; varying float vH; varying float vDepth; varying float vBloom;
      ${GLSL_NOISE}
      ${GLSL_LIGHT}
      void main() {
        vec4 na = texture(tNoise3, vWPos * 2.1);
        vec4 nb = texture(tNoise3, vWPos * 9.5 + 0.4);
        vec3 n = normalize(normalize(vN) + (nb.rgb - 0.5) * 0.9);     // leafy break-up of the shading
        // small leaves: mottled greens, darker gaps between them
        vec3 albedo = mix(vec3(0.030, 0.078, 0.026), vec3(0.105, 0.210, 0.058), nb.a) * (0.65 + 0.7 * na.r) * vCol;
        float gaps = smoothstep(0.30, 0.55, nb.b);
        albedo *= 0.55 + 0.45 * gaps;
        // blossoms: small round flowers scattered in drifts over the top of the mound
        vec3 bp = vWPos * 21.0;
        vec3 cell = floor(bp);
        vec3 rnd = hash33(cell);
        float bd = length(fract(bp) - (0.3 + 0.4 * rnd)) / (0.55 + 0.6 * rnd.z);
        float drift = smoothstep(0.36, 0.60, na.g * 0.6 + na.b * 0.4) * smoothstep(0.12, 0.5, vH);
        float fl = smoothstep(0.34, 0.22, bd) * step(1.0 - vBloom * 0.85, rnd.x + drift * 0.45) * drift * step(0.01, vBloom);
        albedo = mix(albedo, mix(vec3(0.62, 0.10, 0.24), vec3(0.90, 0.38, 0.50), rnd.y), fl);
        float ao = mix(0.40, 1.0, smoothstep(0.0, 0.75, vH));
        vec3 light = skyAmbient(n) * ao + keyLight(n, 0.5) * ao + lanternLight(vWPos, n, 0.45);
        light *= mix(0.6, 1.0, clamp(groundLight(vRoot.xz).g * 14.0, 0.0, 1.0));   // sits in the baked shade of trees
        gl_FragColor = vec4(applyFog(albedo * light * (1.0 + 0.25 * fl), vDepth), 1.0);
      }`,
  });
}

// ---------------------------------------------------------------------------------------
// Bamboo
// ---------------------------------------------------------------------------------------
const BAMBOO_SWAY = /* glsl */`
  // whole-culm sway, shared by the stems and their leaves (h = height above the ground)
  vec3 bambooSway(vec2 root, float h, float t) {
    float k = h * h * 0.0042;
    float a = sin(t * 0.63 + root.x * 0.35 + root.y * 0.21) + 0.45 * sin(t * 1.37 + root.x * 0.9);
    float b = sin(t * 0.51 + root.y * 0.4 + 1.7) + 0.4 * sin(t * 1.61 + root.y * 1.1);
    return vec3(a * k, 0.0, b * k * 0.7);
  }
`;

function bambooCulmMaterial() {
  return new THREE.ShaderMaterial({
    name: 'BambooCulm',
    uniforms: { ...lightUniforms, uTime },
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec3 vWPos; varying vec3 vN; varying float vH; varying float vDepth; varying vec3 vCol;
      ${BAMBOO_SWAY}
      void main() {
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float h = wp.y - root.y;
        wp.xyz += bambooSway(root.xz, h, uTime);
        vWPos = wp.xyz; vH = h;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #else
          vCol = vec3(1.0);
        #endif
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec3 vWPos; varying vec3 vN; varying float vH; varying float vDepth; varying vec3 vCol;
      ${GLSL_LIGHT}
      void main() {
        vec3 n = normalize(vN);
        // nodes every ~35 cm: a pale ring with a dark line under it
        float seg = fract(vH / 0.36 + vCol.r * 3.0);
        float ring = smoothstep(0.035, 0.0, abs(seg - 0.5) ) ;
        float line = smoothstep(0.02, 0.0, abs(seg - 0.46));
        vec3 albedo = mix(vec3(0.060, 0.120, 0.035), vec3(0.110, 0.170, 0.050), vCol.g) * (0.8 + 0.3 * seg);
        albedo = mix(albedo, vec3(0.20, 0.23, 0.14), ring * 0.7);
        albedo *= 1.0 - 0.6 * line;
        float ao = mix(0.35, 1.0, smoothstep(0.0, 1.6, vH));
        vec3 light = skyAmbient(n) * ao + keyLight(n, 0.2) + lanternLight(vWPos, n, 0.2);
        // a glossy stem catches a streak of sky
        float spec = pow(max(dot(reflect(-normalize(cameraPosition - vWPos), n), uKeyDir), 0.0), 18.0);
        gl_FragColor = vec4(applyFog(albedo * light + uKeyCol * spec * 0.25, vDepth), 1.0);
      }`,
  });
}

function bambooLeafGeometry(rng) {
  // a spray of narrow leaves hanging from a short twig
  const pos = [], nor = [], idx = [];
  const leaves = 9;
  for (let i = 0; i < leaves; i++) {
    const az = rng.range(0, Math.PI * 2);
    const droop = rng.range(0.15, 0.75);
    const len = rng.range(0.20, 0.34), w = rng.range(0.022, 0.034);
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(droop), -Math.sin(droop), Math.sin(az) * Math.cos(droop));
    const side = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
    const nrm = new THREE.Vector3().crossVectors(side, dir).normalize();
    const o = new THREE.Vector3(rng.range(-0.12, 0.12), rng.range(-0.08, 0.08), rng.range(-0.12, 0.12));
    const base = pos.length / 3;
    const pts = [[0, 0], [0.35, 1], [1, 0]];                       // lance shape: base, widest, tip
    const P = (t, s) => new THREE.Vector3().copy(o).addScaledVector(dir, len * t).addScaledVector(side, w * s).addScaledVector(nrm, -0.05 * len * t * t);
    const v = [P(0, 0), P(0.35, 0.5), P(0.35, -0.5), P(1, 0)];
    for (const q of v) { pos.push(q.x, q.y, q.z); nor.push(nrm.x, nrm.y, nrm.z); }
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

function bambooLeafMaterial() {
  return new THREE.ShaderMaterial({
    name: 'BambooLeaf',
    uniforms: { ...lightUniforms, uTime },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec3 aCulm;        // culm root x, z and ground height
      uniform float uTime;
      varying vec3 vWPos; varying vec3 vN; varying float vDepth; varying vec3 vCol;
      ${BAMBOO_SWAY}
      void main() {
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        wp.xyz += bambooSway(aCulm.xy, c.y - aCulm.z, uTime);
        // leaf flutter
        float f = sin(uTime * 2.3 + c.x * 3.1 + c.y * 2.0 + position.x * 9.0) * 0.012 + sin(uTime * 3.7 + c.z * 2.7 + position.z * 11.0) * 0.008;
        wp.y += f; wp.x += f * 0.6;
        vWPos = wp.xyz;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #else
          vCol = vec3(1.0);
        #endif
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec3 vWPos; varying vec3 vN; varying float vDepth; varying vec3 vCol;
      ${GLSL_LIGHT}
      void main() {
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 albedo = vec3(0.045, 0.105, 0.030) * vCol;
        vec3 light = skyAmbient(n) * 0.9 + keyLight(n, 0.6) + lanternLight(vWPos, n, 0.6);
        // thin leaves let the afterglow through
        light += uKeyCol * max(dot(-n, uKeyDir), 0.0) * 0.5;
        gl_FragColor = vec4(applyFog(albedo * light, vDepth), 1.0);
      }`,
  });
}

// ---------------------------------------------------------------------------------------
// Bamboo fence: panels of upright canes with horizontal rails
// ---------------------------------------------------------------------------------------
function fenceMaterial() {
  return new THREE.ShaderMaterial({
    name: 'Fence',
    uniforms: { ...lightUniforms, tNoise2: uNoise2 },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec3 vWPos; varying vec3 vN; varying vec2 vUv; varying float vDepth;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz; vUv = uv;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D tNoise2;
      varying vec3 vWPos; varying vec3 vN; varying vec2 vUv; varying float vDepth;
      ${GLSL_LIGHT}
      void main() {
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        // uv.x in metres along the fence, uv.y in metres above the ground
        float cx = vUv.x / 0.045;
        float id = floor(cx), f = fract(cx);
        float rnd = texture2D(tNoise2, vec2(id * 0.0371, 0.37)).a;
        float fw = fwidth(cx);
        float round_ = sqrt(max(1.0 - (f * 2.0 - 1.0) * (f * 2.0 - 1.0), 0.0));
        float shade = mix(0.80, 0.40 + 0.60 * round_, 1.0 - smoothstep(0.25, 0.9, fw));   // cane roundness (fades far away)
        vec3 cane = mix(vec3(0.100, 0.078, 0.040), vec3(0.200, 0.160, 0.080), rnd);
        // nodes at a different height on each cane
        float node = smoothstep(0.012, 0.0, abs(fract(vUv.y / 0.31 + rnd * 7.0) - 0.5) * 0.31) * (1.0 - smoothstep(0.3, 0.8, fw));
        cane *= 1.0 - 0.45 * node;
        // three horizontal rails (split bamboo) tied on with dark cord
        float ry = min(min(abs(vUv.y - 0.34), abs(vUv.y - 1.04)), abs(vUv.y - 1.62));
        float rail = smoothstep(0.036, 0.026, ry);
        float railShade = 0.55 + 0.45 * sqrt(max(1.0 - (ry / 0.036) * (ry / 0.036), 0.0));
        vec3 albedo = mix(cane * shade, vec3(0.185, 0.150, 0.078) * railShade, rail);
        float knot = smoothstep(0.045, 0.030, ry) * smoothstep(0.022, 0.012, abs(fract(vUv.x / 0.45) - 0.5) * 0.45);
        albedo = mix(albedo, vec3(0.014, 0.012, 0.010), knot * 0.9);
        // a dark cap rail along the top
        albedo = mix(albedo, vec3(0.045, 0.036, 0.024), smoothstep(1.76, 1.78, vUv.y));
        // weathering
        albedo *= 0.7 + 0.5 * texture2D(tNoise2, vUv * vec2(0.35, 0.9)).r;
        albedo *= mix(0.55, 1.0, smoothstep(0.0, 0.5, vUv.y));          // damp, shaded foot
        vec3 light = skyAmbient(n) * 0.85 + keyLight(n, 0.1) + lanternLight(vWPos, n, 0.1);
        gl_FragColor = vec4(applyFog(albedo * light, vDepth), 1.0);
      }`,
  });
}

// ---------------------------------------------------------------------------------------
// Pines behind the fence: sinuous trunks carrying flattened "cloud" pads of needles
// ---------------------------------------------------------------------------------------
// One "cloud" of pine needles: a few lumpy blobs merged into a low dome.
function padGeometry(rng) {
  const blobs = [];
  const n = 4;
  for (let b = 0; b < n; b++) {
    let g = new THREE.IcosahedronGeometry(1, 2);
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    g = mergeVertices(g, 1e-4);
    const p = g.attributes.position, v = new THREE.Vector3();
    const seed = rng.range(0, 50);
    const a = (b / n) * Math.PI * 2 + rng.range(-0.5, 0.5);
    const off = b === 0 ? 0 : rng.range(0.45, 0.75);
    const s = b === 0 ? 0.78 : rng.range(0.42, 0.62);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const nz = fbm3(v.x * 1.9 + seed, v.y * 1.9, v.z * 1.9 - seed, 3);
      v.multiplyScalar(s * (1.0 + (nz - 0.5) * 0.8));
      v.y *= v.y > 0 ? 0.62 : 0.30;                            // domed top, flatter underside
      v.x += Math.cos(a) * off; v.z += Math.sin(a) * off; v.y += rng.range(-0.02, 0.02) + (b === 0 ? 0.1 : 0);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    blobs.push(g);
  }
  return mergeGeometries(blobs);
}

function pineMaterial(trunk) {
  return new THREE.ShaderMaterial({
    name: trunk ? 'PineTrunk' : 'PinePad',
    defines: trunk ? { TRUNK: 1 } : {},
    uniforms: { ...lightUniforms, tNoise3: uNoise3, uTime },
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec3 vWPos; varying vec3 vN; varying float vDepth; varying float vH;
      void main() {
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        #ifndef TRUNK
          vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          wp.x += sin(uTime * 0.7 + c.x * 0.3 + c.y) * 0.03;
          wp.z += sin(uTime * 0.9 + c.z * 0.3 + c.y * 1.3) * 0.02;
        #endif
        vWPos = wp.xyz; vH = position.y;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      precision highp sampler3D;
      uniform sampler3D tNoise3;
      varying vec3 vWPos; varying vec3 vN; varying float vDepth; varying float vH;
      ${GLSL_LIGHT}
      void main() {
        vec3 n = normalize(vN);
        #ifdef TRUNK
          vec4 nb = texture(tNoise3, vWPos * vec3(2.0, 0.6, 2.0));
          vec3 albedo = mix(vec3(0.040, 0.030, 0.024), vec3(0.090, 0.066, 0.050), nb.r);
          vec3 light = skyAmbient(n) * 0.8 + keyLight(n, 0.1) + lanternLight(vWPos, n, 0.1);
        #else
          vec4 nb = texture(tNoise3, vWPos * 1.7);
          n = normalize(n + (nb.rgb - 0.5) * 0.8);
          vec3 albedo = mix(vec3(0.012, 0.034, 0.018), vec3(0.036, 0.078, 0.032), nb.a) * (0.6 + 0.8 * nb.g);
          float top = smoothstep(-0.25, 0.4, vH);
          vec3 light = skyAmbient(n) * mix(0.35, 1.0, top) + keyLight(n, 0.5) * mix(0.3, 1.0, top) + lanternLight(vWPos, n, 0.4);
        #endif
        gl_FragColor = vec4(applyFog(albedo * light, vDepth), 1.0);
      }`,
  });
}

// A tapered tube along a list of points (parallel-transport frames).
export function tubeAlong(points, radii, radial = 6, vScale = 1) {
  const pos = [], nor = [], uv = [], idx = [];
  const n = points.length;
  const tangent = new THREE.Vector3(), normal = new THREE.Vector3(), binormal = new THREE.Vector3(), prevT = new THREE.Vector3();
  let dist = 0;
  for (let i = 0; i < n; i++) {
    if (i === 0) tangent.subVectors(points[1], points[0]);
    else if (i === n - 1) tangent.subVectors(points[n - 1], points[n - 2]);
    else tangent.subVectors(points[i + 1], points[i - 1]);
    tangent.normalize();
    if (i === 0) {
      normal.set(1, 0, 0);
      if (Math.abs(tangent.x) > 0.9) normal.set(0, 0, 1);
      normal.addScaledVector(tangent, -normal.dot(tangent)).normalize();
    } else {
      // rotate the previous frame onto the new tangent
      const axis = new THREE.Vector3().crossVectors(prevT, tangent);
      const s = axis.length();
      if (s > 1e-6) {
        axis.multiplyScalar(1 / s);
        normal.applyAxisAngle(axis, Math.asin(clamp(s, -1, 1)));
      }
      normal.addScaledVector(tangent, -normal.dot(tangent)).normalize();
      dist += points[i].distanceTo(points[i - 1]);
    }
    binormal.crossVectors(tangent, normal);
    prevT.copy(tangent);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const cx = Math.cos(a), sy = Math.sin(a);
      const nx = normal.x * cx + binormal.x * sy, ny = normal.y * cx + binormal.y * sy, nz = normal.z * cx + binormal.z * sy;
      pos.push(points[i].x + nx * radii[i], points[i].y + ny * radii[i], points[i].z + nz * radii[i]);
      nor.push(nx, ny, nz);
      uv.push(j / radial, dist * vScale);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + 1, c = a + radial + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------------------------------
// Build everything. `keepOut` lists circles {x, z, r} where nothing should grow.
// ---------------------------------------------------------------------------------------
export function createFlora({ stones, keepOut = [] }) {
  const rng = makeRng(555);
  const group = new THREE.Group();
  group.name = 'flora';
  const free = (x, z, r) => {
    for (const k of keepOut) if (Math.hypot(x - k.x, z - k.z) < k.r + r) return false;
    return true;
  };
  const insideStone = (x, z, pad = 0) => {
    for (const s of stones) if (Math.hypot(x - s.x, z - s.z) < s.r * 0.75 + pad) return true;
    return false;
  };

  // ---------------- grass, sedge and iris leaves ----------------
  const tuftTypes = [
    { geo: tuftGeometry(rng, { blades: 18, height: 0.20, width: 0.013, spread: 0.07, lean: 1.15 }), list: [] },    // low, arching
    { geo: tuftGeometry(rng, { blades: 15, height: 0.40, width: 0.015, spread: 0.06, lean: 0.85 }), list: [] },    // medium
    { geo: tuftGeometry(rng, { blades: 10, height: 0.78, width: 0.017, spread: 0.05, lean: 0.38, droop: 1.2 }), list: [] },   // tall, thin
    { geo: tuftGeometry(rng, { blades: 10, height: 0.72, width: 0.040, spread: 0.08, lean: 0.30, droop: 0.9, segs: 5 }), list: [] },   // iris leaves
  ];
  const addTuft = (type, x, z, scale, tint) => {
    tuftTypes[type].list.push({ x, z, y: groundHeight(x, z) - 0.01, s: scale, rot: rng.range(0, 6.28), tint });
  };
  const greens = () => [rng.range(0.7, 1.1), rng.range(0.8, 1.15), rng.range(0.6, 1.0)];
  const b = new THREE.Vector2(), g = new THREE.Vector2();
  // along the banks, tucked between the stones
  for (let i = 0; i < 520; i++) {
    const a = rng.range(0, Math.PI * 2);
    pondBoundary(a, b);
    sdfGrad(b.x, b.y, g);
    const out = 0.12 + Math.pow(rng(), 1.6) * 1.9;
    const x = b.x - g.x * out + rng.range(-0.15, 0.15), z = b.y - g.y * out + rng.range(-0.15, 0.15);
    if (sdf(x, z) > -0.06 || insideStone(x, z) || !free(x, z, 0.1)) continue;
    const k = rng();
    const type = k < 0.5 ? 0 : k < 0.86 ? 1 : 2;
    addTuft(type, x, z, rng.range(0.75, 1.3), greens());
  }
  // loose drifts on the moss further out
  for (let i = 0; i < 240; i++) {
    const a = rng.range(0, Math.PI * 2), rad = rng.range(4.5, 12.5);
    const x = Math.cos(a) * rad + rng.range(-0.5, 0.5), z = Math.sin(a) * rad + rng.range(-0.5, 0.5);
    if (sdf(x, z) > -0.8 || insideStone(x, z) || !free(x, z, 0.1)) continue;
    if (fbm2(x * 0.35 + 3.0, z * 0.35, 2) < 0.5) continue;                  // in patches
    addTuft(rng() < 0.6 ? 0 : 1, x, z, rng.range(0.8, 1.4), greens());
  }
  // iris clumps at the water's edge
  const irisSpots = [[-2.75, 3.55], [3.42, 0.85], [-2.95, -3.35], [2.75, 4.05], [-3.0, -0.55], [2.55, -1.85]];
  const irisFlowers = [];
  for (const [ix, iz] of irisSpots) {
    const count = rng.int(4, 6);
    for (let i = 0; i < count; i++) {
      const x = ix + rng.range(-0.28, 0.28), z = iz + rng.range(-0.28, 0.28);
      if (sdf(x, z) > 0.05 || insideStone(x, z, -0.05)) continue;
      const s = rng.range(0.85, 1.25);
      addTuft(3, x, z, s, [rng.range(0.75, 0.95), rng.range(0.95, 1.15), rng.range(0.8, 1.0)]);
      if (rng() < 0.75) irisFlowers.push({ x: x + rng.range(-0.05, 0.05), z: z + rng.range(-0.05, 0.05), y: groundHeight(x, z), h: 0.62 * s * rng.range(0.9, 1.15) });
    }
  }
  const grassMat = grassMaterial();
  for (const t of tuftTypes) {
    if (!t.list.length) continue;
    const mesh = new THREE.InstancedMesh(t.geo, grassMat, t.list.length);
    t.list.forEach((it, i) => {
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(0, it.rot, 0);
      dummy.scale.setScalar(it.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, tmpColor.setRGB(it.tint[0], it.tint[1], it.tint[2]));
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  // ---------------- azalea mounds ----------------
  // x, z, radius, bloom. The ring between 7.6 m and 10.4 m from the view centre is kept free:
  // that is where the camera travels.
  const shrubSpots = [
    [-4.25, -3.4, 0.95, 0.9], [0.95, -6.25, 1.15, 0.0], [4.35, -5.3, 1.0, 0.7], [-4.45, 0.75, 0.75, 0.0], [4.75, 0.35, 1.05, 0.8],
    [4.5, 2.75, 0.72, 0.0], [-3.75, 4.75, 0.85, 0.6], [-5.6, -1.6, 1.2, 0.0], [-0.9, -6.9, 0.8, 0.85],
    [6.2, -2.4, 1.25, 0.0], [-5.4, 2.6, 0.95, 0.75], [-2.9, 5.9, 0.8, 0.8], [5.3, 3.5, 0.7, 0.7], [-5.6, -4.2, 0.95, 0.0],
    [2.7, -7.1, 0.9, 0.6], [-3.1, -6.6, 0.9, 0.0],
    // larger masses further out, in front of the fence
    [-11.1, -8.2, 1.5, 0.0], [10.9, -8.8, 1.6, 0.5], [12.9, 2.0, 1.5, 0.0], [-13.2, 1.3, 1.6, 0.6], [7.6, 10.6, 1.5, 0.0], [-7.4, 10.4, 1.5, 0.0],
    [0.8, -13.5, 1.2, 0.7], [5.2, -12.9, 1.3, 0.0], [11.8, -11.4, 1.6, 0.0], [-12.0, 6.5, 1.4, 0.0], [12.2, 7.4, 1.5, 0.6], [-2.5, 12.2, 1.5, 0.0],
  ];
  const shrubGeos = [shrubGeometry(rng), shrubGeometry(rng)];
  const shrubMat = shrubMaterial();
  const shrubs = [];
  shrubGeos.forEach((geo, gi) => {
    const mine = shrubSpots.filter((_, i) => i % 2 === gi).filter(([x, z, r]) => free(x, z, r * 0.8));
    const mesh = new THREE.InstancedMesh(geo, shrubMat, mine.length);
    const bloom = new Float32Array(mine.length);
    mine.forEach(([x, z, r, bl], i) => {
      dummy.position.set(x, groundHeight(x, z) - 0.05, z);
      dummy.rotation.set(0, rng.range(0, 6.28), 0);
      // mounds near the pond stay low so that the water is never hidden behind them
      const near = Math.hypot(x, z + 1.0) < 9.0;
      const hgt = near ? Math.min(r * rng.range(0.66, 0.8), 0.56) : r * rng.range(0.8, 1.0);
      dummy.scale.set(r * rng.range(0.95, 1.2), hgt, r * rng.range(0.95, 1.2));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, tmpColor.setRGB(rng.range(0.8, 1.1), rng.range(0.85, 1.1), rng.range(0.8, 1.0)));
      bloom[i] = bl;
      shrubs.push({ x, z, r });
    });
    geo.setAttribute('aBloom', new THREE.InstancedBufferAttribute(bloom, 1));
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  });

  // ---------------- bamboo grove (far left) and a smaller stand (right) ----------------
  const culms = [];
  const stands = [
    { x: -6.3, z: -13.4, rx: 3.9, rz: 1.5, n: 34 },
    { x: -12.6, z: -8.6, rx: 1.4, rz: 3.2, n: 16 },
    { x: 12.9, z: -5.5, rx: 1.3, rz: 3.0, n: 14 },
    { x: 9.5, z: 12.4, rx: 2.8, rz: 1.3, n: 14 },
    { x: -10.5, z: 10.6, rx: 2.4, rz: 1.6, n: 12 },
  ];
  for (const s of stands) {
    for (let i = 0; i < s.n; i++) {
      const a = rng.range(0, 6.28), d = Math.sqrt(rng());
      const x = s.x + Math.cos(a) * d * s.rx, z = s.z + Math.sin(a) * d * s.rz;
      culms.push({ x, z, y: groundHeight(x, z), h: rng.range(5.5, 8.6), r: rng.range(0.028, 0.048), lx: rng.range(-0.05, 0.05), lz: rng.range(-0.05, 0.05) });
    }
  }
  {
    const cg = new THREE.CylinderGeometry(0.72, 1, 1, 7, 8, true);
    cg.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(cg, bambooCulmMaterial(), culms.length);
    culms.forEach((c, i) => {
      dummy.position.set(c.x, c.y - 0.1, c.z);
      dummy.rotation.set(c.lz, 0, c.lx);
      dummy.scale.set(c.r, c.h, c.r);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, tmpColor.setRGB(rng(), rng(), rng()));
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);

    const leafGeos = [bambooLeafGeometry(rng), bambooLeafGeometry(rng)];
    const leafMat = bambooLeafMaterial();
    const sprays = [[], []];
    culms.forEach((c) => {
      const count = Math.round(c.h * 3.4);
      for (let k = 0; k < count; k++) {
        const hf = 0.34 + 0.66 * Math.pow(rng(), 0.8);            // leaves on the upper two thirds
        const reach = rng.range(0.15, 0.85) * (0.5 + 0.8 * (1 - Math.abs(hf - 0.72) * 1.6));
        const a = rng.range(0, 6.28);
        const y = c.y + c.h * hf;
        // follow the lean of the culm
        const x = c.x - Math.sin(c.lx) * c.h * hf + Math.cos(a) * reach, z = c.z + Math.sin(c.lz) * c.h * hf + Math.sin(a) * reach;
        sprays[k % 2].push({ x, y: y - reach * 0.25, z, s: rng.range(0.9, 1.6), rot: a, culm: c });
      }
    });
    leafGeos.forEach((geo, gi) => {
      const list = sprays[gi];
      const mesh2 = new THREE.InstancedMesh(geo, leafMat, list.length);
      const culmAttr = new Float32Array(list.length * 3);
      list.forEach((s, i) => {
        dummy.position.set(s.x, s.y, s.z);
        dummy.rotation.set(rng.range(-0.3, 0.3), s.rot, rng.range(-0.3, 0.3));
        dummy.scale.setScalar(s.s);
        dummy.updateMatrix();
        mesh2.setMatrixAt(i, dummy.matrix);
        const k = rng.range(0.7, 1.25);
        mesh2.setColorAt(i, tmpColor.setRGB(k * rng.range(0.85, 1.1), k, k * rng.range(0.7, 1.0)));
        culmAttr[i * 3] = s.culm.x; culmAttr[i * 3 + 1] = s.culm.z; culmAttr[i * 3 + 2] = s.culm.y;
      });
      geo.setAttribute('aCulm', new THREE.InstancedBufferAttribute(culmAttr, 3));
      mesh2.instanceMatrix.needsUpdate = true; mesh2.instanceColor.needsUpdate = true;
      mesh2.frustumCulled = false;
      group.add(mesh2);
    });
  }

  // ---------------- fence ----------------
  {
    const corners = [[-15.2, -14.6], [15.0, -15.0], [15.6, 15.4], [-15.4, 15.0]];
    const H = 1.82;
    const pos = [], nor = [], uv = [], idx = [];
    const posts = [];
    let along = 0;
    for (let c = 0; c < 4; c++) {
      const [x0, z0] = corners[c], [x1, z1] = corners[(c + 1) % 4];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const steps = Math.ceil(len / 1.5);
      const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        const y = groundHeight(x, z) - 0.08;
        const base = pos.length / 3;
        pos.push(x, y, z, x, y + H, z);
        nor.push(nx, 0, nz, nx, 0, nz);
        uv.push(along + len * t, 0, along + len * t, H);
        if (i < steps) idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
        if (i % 2 === 0) posts.push([x, y, z]);
      }
      along += len;
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    fg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    fg.setIndex(idx);
    const fence = new THREE.Mesh(fg, fenceMaterial());
    fence.frustumCulled = false;
    group.add(fence);
    // posts
    const pg = new THREE.CylinderGeometry(0.055, 0.06, H + 0.22, 7);
    pg.translate(0, (H + 0.22) / 2, 0);
    const pm = new THREE.InstancedMesh(pg, pineMaterial(true), posts.length);
    posts.forEach((p, i) => { dummy.position.set(p[0], p[1], p[2]); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); pm.setMatrixAt(i, dummy.matrix); });
    pm.instanceMatrix.needsUpdate = true;
    pm.frustumCulled = false;
    group.add(pm);
  }

  // ---------------- pines beyond the fence ----------------
  {
    const pads = [], trunkGeos = [];
    const spots = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rng.range(-0.08, 0.08);
      // keep the view towards the afterglow (-z) open: only low trees there
      const towardsSunset = Math.max(0, -Math.sin(a) - 0.72) / 0.28;
      const rad = rng.range(18.5, 25.5);
      const hgt = rng.range(5.0, 9.5) * (1.0 - 0.55 * towardsSunset);
      spots.push({ x: Math.cos(a) * rad, z: Math.sin(a) * rad, h: hgt });
    }
    for (const s of spots) {
      const y0 = groundHeight(s.x, s.z) - 0.3;
      const lean = rng.range(-0.25, 0.25), lean2 = rng.range(-0.25, 0.25);
      const pts = [], radii = [];
      const N = 7;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        pts.push(new THREE.Vector3(s.x + Math.sin(t * 3.0 + lean * 9.0) * 0.45 * t + lean * s.h * t * 0.5, y0 + s.h * 0.86 * t, s.z + Math.cos(t * 2.3 + lean2 * 7.0) * 0.4 * t + lean2 * s.h * t * 0.5));
        radii.push(0.24 * (1 - 0.72 * t) * (s.h / 8));
      }
      trunkGeos.push(tubeAlong(pts, radii, 6));
      // cloud pads: big ones low and wide, small ones at the crown
      const layers = rng.int(5, 8);
      for (let k = 0; k < layers; k++) {
        const t = 0.42 + 0.58 * (k / (layers - 1));
        const at = pts[Math.min(N, Math.round(t * N))];
        const reach = (1.0 - t) * s.h * 0.34 + 0.25;
        const a = rng.range(0, 6.28);
        const size = (1.25 - 0.6 * t) * s.h * 0.24 * rng.range(0.8, 1.2);
        pads.push({ x: at.x + Math.cos(a) * reach, y: at.y + rng.range(-0.2, 0.3), z: at.z + Math.sin(a) * reach, s: size });
        if (rng() < 0.4) pads.push({ x: at.x - Math.cos(a) * reach * 0.8, y: at.y + rng.range(-0.3, 0.3), z: at.z - Math.sin(a) * reach * 0.8, s: size * 0.8 });
      }
      pads.push({ x: pts[N].x, y: pts[N].y + 0.1, z: pts[N].z, s: s.h * 0.15 });
    }
    const tm = new THREE.InstancedMesh(mergeGeometries(trunkGeos), pineMaterial(true), 1);
    tm.setMatrixAt(0, new THREE.Matrix4());
    tm.frustumCulled = false;
    group.add(tm);
    const pgs = [padGeometry(rng), padGeometry(rng)];
    pgs.forEach((geo, gi) => {
      const list = pads.filter((_, i) => i % 2 === gi);
      const mesh = new THREE.InstancedMesh(geo, pineMaterial(false), list.length);
      list.forEach((p, i) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(rng.range(-0.15, 0.15), rng.range(0, 6.28), rng.range(-0.15, 0.15));
        dummy.scale.set(p.s * rng.range(0.9, 1.3), p.s, p.s * rng.range(0.9, 1.3));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    });
  }

  return { group, irisFlowers, shrubs };
}
