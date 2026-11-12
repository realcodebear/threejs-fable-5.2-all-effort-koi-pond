// Water: a GPU ripple simulation (wave equation on a height field), a planar reflection pass,
// a refraction pass with depth (so the water can be tinted by its thickness), and the surface
// shader that combines them with Fresnel.
import * as THREE from 'three';
import { uTime, uSdf, uSdfScale, GLSL_NOISE, makeRng } from './common.js';
import { drawFullscreen, FS_VERTEX } from './post.js';
import { lightUniforms, LANTERN_COUNT } from './lighting.js';

const SIM_W = 768, SIM_H = 1024;            // texels
const RECT = { x: -4.0, z: -5.5, w: 8.0, h: 8.0 * 1024 / 768 };   // world rectangle covered by the simulation
const SIM_HZ = 60;
const WAVE_SPEED = 0.36;                    // metres / second
const MAX_SRC = 64;

// Tileable normal detail for the faint breeze ripples (gradient in RG, height in B).
function makeDetailTexture() {
  const N = 256;
  const rng = makeRng(991);
  const h = new Float32Array(N * N);
  const octaves = [[4, 1.0], [8, 0.55], [16, 0.30], [32, 0.16], [64, 0.08]];
  for (const [freq, amp] of octaves) {
    const g = new Float32Array(freq * freq);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    for (let y = 0; y < N; y++) {
      const fy = (y / N) * freq, y0 = Math.floor(fy), ty = fy - y0;
      const sy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
      for (let x = 0; x < N; x++) {
        const fx = (x / N) * freq, x0 = Math.floor(fx), tx = fx - x0;
        const sx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
        const a = g[(y0 % freq) * freq + (x0 % freq)], b = g[(y0 % freq) * freq + ((x0 + 1) % freq)];
        const c = g[((y0 + 1) % freq) * freq + (x0 % freq)], d = g[((y0 + 1) % freq) * freq + ((x0 + 1) % freq)];
        h[y * N + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
  }
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const xm = (x + N - 1) % N, xp = (x + 1) % N, ym = (y + N - 1) % N, yp = (y + 1) % N;
    const gx = (h[y * N + xp] - h[y * N + xm]) * 0.5 * N / 16;
    const gy = (h[yp * N + x] - h[ym * N + x]) * 0.5 * N / 16;
    const o = (y * N + x) * 4;
    data[o] = Math.max(0, Math.min(255, Math.round((gx * 0.5 + 0.5) * 255)));
    data[o + 1] = Math.max(0, Math.min(255, Math.round((gy * 0.5 + 0.5) * 255)));
    data[o + 2] = Math.max(0, Math.min(255, Math.round((h[y * N + x] / 2.1) * 255)));
    data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export class Water {
  constructor(renderer) {
    this.renderer = renderer;
    // ---------------- ripple simulation ----------------
    // two half-float channels: R = height now, G = height one step ago
    const simOpts = {
      type: THREE.HalfFloatType, format: THREE.RGFormat, depthBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    };
    this.simA = new THREE.WebGLRenderTarget(SIM_W, SIM_H, simOpts);
    this.simB = new THREE.WebGLRenderTarget(SIM_W, SIM_H, simOpts);
    this.simAccum = 0;
    this.simTime = 0;
    this.drops = [];
    this.wakes = [];
    this.padMask = { value: null };

    const texel = RECT.w / SIM_W;
    const c = (WAVE_SPEED / SIM_HZ) / texel;
    this.simMat = new THREE.ShaderMaterial({
      uniforms: {
        tPrev: { value: null },
        uTexel: { value: new THREE.Vector2(1 / SIM_W, 1 / SIM_H) },
        uRect: { value: new THREE.Vector4(RECT.x, RECT.z, RECT.w, RECT.h) },
        uSdf, uSdfScale,
        tPads: this.padMask,
        uC2: { value: c * c },
        uDamp: { value: 0.9945 },
      },
      vertexShader: FS_VERTEX,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tPrev; uniform sampler2D uSdf; uniform sampler2D tPads;
        uniform vec2 uTexel; uniform vec4 uRect; uniform float uSdfScale;
        uniform float uC2; uniform float uDamp;
        varying vec2 vUv;
        void main() {
          vec4 s = texture2D(tPrev, vUv);
          float h = s.r, hp = s.g;
          float hl = texture2D(tPrev, vUv - vec2(uTexel.x, 0.0)).r;
          float hr = texture2D(tPrev, vUv + vec2(uTexel.x, 0.0)).r;
          float hd = texture2D(tPrev, vUv - vec2(0.0, uTexel.y)).r;
          float hu = texture2D(tPrev, vUv + vec2(0.0, uTexel.y)).r;
          vec2 wpos = uRect.xy + vUv * uRect.zw;
          float d = texture2D(uSdf, wpos * uSdfScale + 0.5).r;
          float pad = texture2D(tPads, vUv).r;
          float hn = h + (h - hp) * uDamp + uC2 * (hl + hr + hd + hu - 4.0 * h);
          // waves die out softly at the shore and under lily pads
          hn *= mix(0.86, 1.0, smoothstep(-0.06, 0.10, d));
          hn *= 1.0 - 0.07 * pad;
          hn -= 0.0012 * h;
          gl_FragColor = vec4(hn, h, 0.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });

    // Disturbances are splatted as small additive quads (one instance per source).
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    this.srcData = new Float32Array(MAX_SRC * 4);
    this.srcAttr = new THREE.InstancedBufferAttribute(this.srcData, 4);
    this.srcAttr.setUsage(THREE.DynamicDrawUsage);
    quad.setAttribute('aSrc', this.srcAttr);
    quad.instanceCount = 0;
    this.splatMesh = new THREE.Mesh(quad, new THREE.ShaderMaterial({
      uniforms: { uRect: { value: new THREE.Vector4(RECT.x, RECT.z, RECT.w, RECT.h) } },
      vertexShader: /* glsl */`
        attribute vec4 aSrc;          // x, z, radius, amplitude
        uniform vec4 uRect;
        varying vec2 vQ; varying float vA;
        void main() {
          vQ = position.xy * 3.0;
          vA = aSrc.w;
          vec2 w = aSrc.xy + position.xy * aSrc.z * 3.0;
          gl_Position = vec4((w - uRect.xy) / uRect.zw * 2.0 - 1.0, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec2 vQ; varying float vA;
        void main() { gl_FragColor = vec4(vA * exp(-dot(vQ, vQ)), 0.0, 0.0, 0.0); }`,
      depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
    }));
    this.splatMesh.frustumCulled = false;
    this.splatCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // ---------------- reflection / refraction targets ----------------
    // (mip-mapped: the water samples a slightly blurred level, like a surface with fine ripples;
    //  that blur also makes multisampling unnecessary here)
    this.reflTarget = new THREE.WebGLRenderTarget(8, 8, {
      type: THREE.HalfFloatType, samples: 0, depthBuffer: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true,
    });
    this.refrTarget = new THREE.WebGLRenderTarget(8, 8, {
      type: THREE.HalfFloatType, samples: 0, depthBuffer: true,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    this.refrTarget.depthTexture = new THREE.DepthTexture(8, 8);
    this.refrTarget.depthTexture.minFilter = THREE.NearestFilter;
    this.refrTarget.depthTexture.magFilter = THREE.NearestFilter;

    this.virtualCamera = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();
    this.viewProj = new THREE.Matrix4();
    // Clipping plane for objects that cross the water surface (stones). Its value changes per
    // pass but it is always present, so the materials never switch shader programs.
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1000);
    renderer.localClippingEnabled = true;

    // ---------------- surface ----------------
    this.detailTex = makeDetailTexture();
    const uniforms = {
      uTime,
      tReflection: { value: this.reflTarget.texture },
      tRefraction: { value: this.refrTarget.texture },
      tRefractionDepth: { value: this.refrTarget.depthTexture },
      tRipple: { value: this.simA.texture },
      tDetail: { value: this.detailTex },
      tPads: this.padMask,
      uSdf, uSdfScale,
      uTextureMatrix: { value: this.textureMatrix },
      uViewProj: { value: this.viewProj },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.1 }, uFar: { value: 500 },
      uRect: { value: new THREE.Vector4(RECT.x, RECT.z, 1 / RECT.w, 1 / RECT.h) },
      uRippleTexel: { value: new THREE.Vector2(1 / SIM_W, 1 / SIM_H) },
      uRippleCell: { value: texel },
      uAbsorb: { value: new THREE.Vector3(0.95, 0.42, 0.52) },
      uScatter: { value: new THREE.Color(0.0035, 0.011, 0.0105) },
      uLanternPos: lightUniforms.uLanternPos,
      uLanternCol: lightUniforms.uLanternCol,
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonCol: { value: new THREE.Color(1.0, 0.93, 0.8) },
    };
    this.uniforms = uniforms;
    const material = new THREE.ShaderMaterial({
      name: 'Water',
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */`
        varying vec3 vWorld;
        varying float vViewZ;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mv = viewMatrix * wp;
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform float uTime;
        uniform sampler2D tReflection, tRefraction, tRefractionDepth, tRipple, tDetail, tPads, uSdf;
        uniform mat4 uTextureMatrix, uViewProj;
        uniform vec2 uResolution, uRippleTexel;
        uniform float uNear, uFar, uSdfScale, uRippleCell;
        uniform vec4 uRect;
        uniform vec3 uAbsorb, uScatter;
        uniform vec3 uLanternPos[${LANTERN_COUNT}];
        uniform vec3 uLanternCol[${LANTERN_COUNT}];
        uniform vec3 uMoonDir, uMoonCol;
        varying vec3 vWorld;
        varying float vViewZ;
        ${GLSL_NOISE}

        float viewZ(float depth) {
          return (uNear * uFar) / (uFar - depth * (uFar - uNear));
        }
        float pondSdf(vec2 p) { return texture2D(uSdf, p * uSdfScale + 0.5).r; }

        void main() {
          float sd = pondSdf(vWorld.xz);
          if (sd < -0.9) discard;

          vec2 suv = gl_FragCoord.xy / uResolution;
          vec3 toCam = cameraPosition - vWorld;
          float dist = length(toCam);
          vec3 V = toCam / dist;

          // ---- surface slope: simulated ripples + breeze detail ----
          vec2 ruv = (vWorld.xz - uRect.xy) * uRect.zw;
          float hL = texture2D(tRipple, ruv - vec2(uRippleTexel.x, 0.0)).r;
          float hR = texture2D(tRipple, ruv + vec2(uRippleTexel.x, 0.0)).r;
          float hD = texture2D(tRipple, ruv - vec2(0.0, uRippleTexel.y)).r;
          float hU = texture2D(tRipple, ruv + vec2(0.0, uRippleTexel.y)).r;
          vec2 grad = vec2(hR - hL, hU - hD) / (2.0 * uRippleCell);

          float t = uTime;
          float fade = 1.0 / (1.0 + dist * 0.045);
          vec2 p = vWorld.xz;
          // slow gusts: patches of ruffled water drift across an otherwise glassy pond
          vec2 d0 = texture2D(tDetail, p * 0.045 + vec2(t * 0.006, -t * 0.004)).zw;
          float gust = smoothstep(0.38, 0.62, d0.x);
          vec2 d1 = texture2D(tDetail, p * 0.19 + vec2(t * 0.011, t * 0.007)).xy - 0.5;
          vec2 d2 = texture2D(tDetail, p * 0.47 + vec2(-t * 0.016, t * 0.012) + 0.37).xy - 0.5;
          vec2 d3 = texture2D(tDetail, p * 1.31 + vec2(t * 0.023, -t * 0.019) + 0.71).xy - 0.5;
          grad += (d1 * 0.16 + d2 * 0.11) * fade * (0.45 + 0.55 * gust);
          grad += d3 * 0.10 * fade * fade * gust;
          grad *= min(1.0, 0.42 / (length(grad) + 1e-5));          // keep the steepest ripples from looking like liquid metal

          vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));

          // ---- refraction: what is under the surface ----
          float zWater = vViewZ;
          float ray = dist / zWater;
          float z0 = viewZ(texture2D(tRefractionDepth, suv).x);
          float thick0 = max(z0 - zWater, 0.0) * ray;
          vec3 T0 = refract(-V, vec3(0.0, 1.0, 0.0), 0.752);
          // (the slope is limited for refraction: a fish right under a steep ripple should wobble, not smear)
          vec2 gr = grad * min(1.0, 0.16 / (length(grad) + 1e-5));
          vec3 T1 = refract(-V, normalize(vec3(-gr.x, 1.0, -gr.y)), 0.752);
          vec3 Q = vWorld - V * thick0 + (T1 - T0) * min(thick0, 1.2) * 1.6;
          vec4 qc = uViewProj * vec4(Q, 1.0);
          vec2 quv = clamp(qc.xy / qc.w * 0.5 + 0.5, vec2(0.002), vec2(0.998));
          float z1 = viewZ(texture2D(tRefractionDepth, quv).x);
          if (z1 < zWater + 0.01) { quv = suv; z1 = z0; }
          vec3 under = texture2D(tRefraction, quv).rgb;
          float thick = max(z1 - zWater, 0.0) * ray;
          vec3 trans = exp(-thick * uAbsorb);
          float turbid = 1.0 - exp(-thick * 0.55);
          vec3 refr = under * trans + uScatter * turbid;

          // ---- reflection: mirrored scene, shifted by the ripples ----
          vec3 R = reflect(-V, N);
          R.y = max(R.y, 0.015);
          R = normalize(R);
          // how far away is the thing we reflect? march the shoreline distance field along the ray
          float tr = 0.0;
          vec2 rh = normalize(R.xz + vec2(1e-5));
          for (int i = 0; i < 4; i++) tr += max(pondSdf(vWorld.xz + rh * tr), 0.04);
          float D = (tr + 0.8) / max(length(R.xz), 0.2);
          vec4 rc = uTextureMatrix * vec4(vWorld + R * D, 1.0);
          vec2 rUv = clamp(rc.xy / rc.w, vec2(0.002), vec2(0.998));
          vec3 refl = textureLod(tReflection, rUv, 0.9 + 0.8 * gust).rgb;

          // ---- Fresnel ----
          float ndv = max(dot(N, V), 0.0);
          float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
          F = clamp(F * 1.25 + 0.012, 0.0, 1.0);

          // ---- sparkle from the lanterns and the moon on ripple crests ----
          vec3 spec = vec3(0.0);
          for (int i = 0; i < ${LANTERN_COUNT}; i++) {
            vec3 L = uLanternPos[i] - vWorld;
            float d2 = dot(L, L);
            L *= inversesqrt(d2);
            float a = min(0.10 * inversesqrt(d2), 0.05) + 0.008;   // apparent size of the lantern
            float sp = exp((dot(R, L) - 1.0) / (a * a));
            spec += uLanternCol[i] * sp * smoothstep(0.3, 2.0, d2);
          }
          spec *= 0.22;
          float ms = exp((dot(R, uMoonDir) - 1.0) / 0.00012);
          spec += uMoonCol * ms * 0.8;

          vec3 col = mix(refr, refl, F) + spec * F * 1.6;
          // soft shade around lily pads
          col *= 1.0 - 0.42 * texture2D(tPads, ruv).r;

          // soft edge where the water meets stones and the bank
          float edge = smoothstep(0.0, 0.035, thick0);
          gl_FragColor = vec4(col, edge);
        }`,
    });
    const geo = new THREE.PlaneGeometry(RECT.w, RECT.h, 1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(RECT.x + RECT.w / 2, 0, RECT.z + RECT.h / 2);
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.renderOrder = 10;
    this.mesh.name = 'water';
    this.mesh.frustumCulled = false;

    this._clearSim();
  }

  _clearSim() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const cc = new THREE.Color();
    r.getClearColor(cc);
    const ca = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    r.setRenderTarget(this.simA); r.clear();
    r.setRenderTarget(this.simB); r.clear();
    r.setRenderTarget(prev);
    r.setClearColor(cc, ca);
  }

  setPadMask(texture) { this.padMask.value = texture; }

  setSize(width, height) {
    this.uniforms.uResolution.value.set(width, height);
    const rw = Math.max(8, Math.round(width * 0.5)), rh = Math.max(8, Math.round(height * 0.5));
    this.reflTarget.setSize(rw, rh);
    this.refrTarget.setSize(width, height);
  }

  // A drop / touch on the surface: a short oscillation that sends out a few concentric rings.
  addDrop(x, z, radius = 0.05, amp = 0.004, freq = 2.6, dur = 0.85) {
    if (this.drops.length > 24) this.drops.shift();
    this.drops.push({ x, z, radius, amp, freq, dur, t0: this.simTime });
  }
  // A moving body just under the surface: pushes water up in front, down behind (zero mean).
  addWake(x, z, dx, dz, len, amp, radius = 0.07) {
    this.wakes.push({ x, z, dx, dz, len, amp, radius });
  }

  // Advance the ripple simulation by dt seconds (fixed internal time step).
  update(dt) {
    const r = this.renderer;
    this.simAccum += Math.min(dt, 0.1);
    const step = 1 / SIM_HZ;
    let steps = Math.floor(this.simAccum / step + 1e-6);
    this.simAccum -= steps * step;
    steps = Math.min(steps, 4);
    const prevTarget = r.getRenderTarget();
    const prevAuto = r.autoClear;
    const S = this.srcData;
    for (let s = 0; s < steps; s++) {
      this.simTime += step;
      let n = 0;
      for (let i = this.drops.length - 1; i >= 0; i--) {
        const d = this.drops[i];
        const age = this.simTime - d.t0;
        if (age > d.dur) { this.drops.splice(i, 1); continue; }
        if (n >= MAX_SRC) continue;
        const env = Math.sin(Math.PI * age / d.dur);
        S[n * 4] = d.x; S[n * 4 + 1] = d.z; S[n * 4 + 2] = d.radius;
        S[n * 4 + 3] = d.amp * env * Math.cos(2 * Math.PI * d.freq * age);
        n++;
      }
      for (let i = 0; i < this.wakes.length && n < MAX_SRC - 1; i++) {
        const w = this.wakes[i];
        S[n * 4] = w.x + w.dx * w.len; S[n * 4 + 1] = w.z + w.dz * w.len; S[n * 4 + 2] = w.radius; S[n * 4 + 3] = w.amp; n++;
        S[n * 4] = w.x - w.dx * w.len; S[n * 4 + 1] = w.z - w.dz * w.len; S[n * 4 + 2] = w.radius; S[n * 4 + 3] = -w.amp; n++;
      }
      // wave equation step
      this.simMat.uniforms.tPrev.value = this.simA.texture;
      r.autoClear = true;
      drawFullscreen(r, this.simMat, this.simB);
      // add the disturbances
      if (n > 0) {
        this.srcAttr.needsUpdate = true;
        this.splatMesh.geometry.instanceCount = n;
        r.autoClear = false;
        r.setRenderTarget(this.simB);
        r.render(this.splatMesh, this.splatCam);
      }
      const tmp = this.simA; this.simA = this.simB; this.simB = tmp;
    }
    this.wakes.length = 0;
    this.uniforms.tRipple.value = this.simA.texture;
    r.autoClear = prevAuto;
    r.setRenderTarget(prevTarget);
  }

  _setClip(nx, ny, nz, c) {
    this.clipPlane.normal.set(nx, ny, nz);
    this.clipPlane.constant = c;
    lightUniforms.uClip.value.set(nx, ny, nz, c);
  }

  // Mirror the camera in the water plane and render the scene from there.
  renderReflection(scene, camera) {
    const r = this.renderer;
    const v = this.virtualCamera;
    const e = camera.matrixWorld.elements;
    // mirrored position, target and up vector (plane y = 0)
    const px = e[12], py = e[13], pz = e[14];
    const fx = -e[8], fy = -e[9], fz = -e[10];
    v.position.set(px, -py, pz);
    v.up.set(e[4], -e[5], e[6]);
    v.lookAt(px + fx, -(py + fy), pz + fz);
    v.near = camera.near; v.far = camera.far;
    v.updateMatrixWorld();
    v.projectionMatrix.copy(camera.projectionMatrix);
    v.projectionMatrixInverse.copy(camera.projectionMatrixInverse);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(v.projectionMatrix);
    this.textureMatrix.multiply(v.matrixWorldInverse);

    this._setClip(0, 1, 0, 0.03);                   // keep everything above y = -0.03
    r.setRenderTarget(this.reflTarget);
    r.render(scene, v);
  }

  renderRefraction(scene, camera) {
    const r = this.renderer;
    this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.uniforms.uNear.value = camera.near;
    this.uniforms.uFar.value = camera.far;
    this._setClip(0, -1, 0, 0.06);                  // keep everything below y = 0.06
    r.setRenderTarget(this.refrTarget);
    r.render(scene, camera);
  }

  // No clipping for the main pass.
  endPasses() {
    this._setClip(0, 1, 0, 1000);
  }
}

export const WATER_RECT = RECT;
