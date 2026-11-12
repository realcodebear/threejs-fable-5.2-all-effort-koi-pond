// HDR pipeline: the scene is rendered into a multisampled float target, a wide soft bloom is
// built with a down/up-sampling pyramid, then everything is tone mapped and graded.
import * as THREE from 'three';

const fsGeometry = new THREE.BufferGeometry();
fsGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
fsGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
const fsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fsMesh = new THREE.Mesh(fsGeometry, null);
fsMesh.frustumCulled = false;

export const FS_VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Draw a full-screen triangle with the given material into the given target.
export function drawFullscreen(renderer, material, target) {
  fsMesh.material = material;
  renderer.setRenderTarget(target);
  renderer.render(fsMesh, fsCamera);
}

function fsMaterial(fragmentShader, uniforms, extra = {}) {
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: FS_VERTEX, fragmentShader,
    depthTest: false, depthWrite: false, toneMapped: false, ...extra,
  });
}

const LEVELS = 5;          // bloom pyramid: 1/4, 1/8, ... 1/64 of the frame

export class Post {
  constructor(renderer, width, height) {
    this.renderer = renderer;
    this.sceneTarget = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType, samples: 4, depthBuffer: true, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    this.sceneTarget.texture.name = 'scene';
    this.levels = [];
    for (let i = 0; i < LEVELS; i++) {
      const rt = new THREE.WebGLRenderTarget(4, 4, {
        type: THREE.HalfFloatType, depthBuffer: false,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      });
      this.levels.push(rt);
    }

    this.prefilterMat = fsMaterial(/* glsl */`
      precision highp float;
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; uniform float uKnee;
      varying vec2 vUv;
      vec3 soft(vec3 c) {
        c = min(c, vec3(40.0));
        float br = max(c.r, max(c.g, c.b));
        float s = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
        s = s * s / (4.0 * uKnee + 1e-4);
        return c * max(s, br - uThreshold) / max(br, 1e-4);
      }
      float karis(vec3 c) { return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))); }
      void main() {
        // 4 bilinear taps with a luma weight: tames flickering single-pixel highlights
        vec3 a = soft(texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb);
        vec3 b = soft(texture2D(tSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb);
        vec3 c = soft(texture2D(tSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb);
        vec3 d = soft(texture2D(tSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb);
        float wa = karis(a), wb = karis(b), wc = karis(c), wd = karis(d);
        gl_FragColor = vec4((a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd), 1.0);
      }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0.9 }, uKnee: { value: 0.6 } });

    this.downMat = fsMaterial(/* glsl */`
      precision highp float;
      uniform sampler2D tSrc; uniform vec2 uTexel;
      varying vec2 vUv;
      void main() {
        // 13-tap filter (Jimenez, "Next generation post processing in Call of Duty")
        vec3 a = texture2D(tSrc, vUv + uTexel * vec2(-2.0, -2.0)).rgb;
        vec3 b = texture2D(tSrc, vUv + uTexel * vec2( 0.0, -2.0)).rgb;
        vec3 c = texture2D(tSrc, vUv + uTexel * vec2( 2.0, -2.0)).rgb;
        vec3 d = texture2D(tSrc, vUv + uTexel * vec2(-2.0,  0.0)).rgb;
        vec3 e = texture2D(tSrc, vUv).rgb;
        vec3 f = texture2D(tSrc, vUv + uTexel * vec2( 2.0,  0.0)).rgb;
        vec3 g = texture2D(tSrc, vUv + uTexel * vec2(-2.0,  2.0)).rgb;
        vec3 h = texture2D(tSrc, vUv + uTexel * vec2( 0.0,  2.0)).rgb;
        vec3 i = texture2D(tSrc, vUv + uTexel * vec2( 2.0,  2.0)).rgb;
        vec3 j = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
        vec3 k = texture2D(tSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
        vec3 l = texture2D(tSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
        vec3 m = texture2D(tSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
        vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
        gl_FragColor = vec4(col, 1.0);
      }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });

    this.upMat = fsMaterial(/* glsl */`
      precision highp float;
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uWeight;
      varying vec2 vUv;
      void main() {
        vec3 col = texture2D(tSrc, vUv).rgb * 4.0;
        col += (texture2D(tSrc, vUv + uTexel * vec2(-1.0, 0.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 0.0)).rgb
              + texture2D(tSrc, vUv + uTexel * vec2(0.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.0, 1.0)).rgb) * 2.0;
        col += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
             + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
        gl_FragColor = vec4(col * (uWeight / 16.0), 1.0);
      }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 } },
      { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, transparent: true });

    this.finalMat = fsMaterial(/* glsl */`
      precision highp float;
      uniform sampler2D tScene; uniform sampler2D tBloom;
      uniform float uBloom; uniform float uExposure; uniform float uTime; uniform float uFade;
      uniform vec2 uResolution;
      varying vec2 vUv;

      vec3 RRTAndODTFit(vec3 v) {
        vec3 a = v * (v + 0.0245786) - 0.000090537;
        vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
        return a / b;
      }
      vec3 aces(vec3 color) {
        const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
        const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
        color = inM * color;
        color = RRTAndODTFit(color);
        color = outM * color;
        return clamp(color, 0.0, 1.0);
      }
      float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

      void main() {
        vec3 hdr = texture2D(tScene, vUv).rgb;
        vec3 bloom = texture2D(tBloom, vUv).rgb;
        vec3 col = hdr + bloom * uBloom;
        col *= uExposure;

        // vignette (in linear light, before the tone curve)
        vec2 q = vUv - 0.5;
        q.x *= mix(1.0, uResolution.x / uResolution.y, 0.35);
        float vig = smoothstep(0.38, 1.02, length(q));
        col *= 1.0 - 0.36 * vig;

        col = aces(col / 0.6);

        // gentle grade: cool shadows, warm highlights, a touch more saturation
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(l), col, 1.08);
        col += vec3(-0.004, 0.000, 0.010) * (1.0 - smoothstep(0.0, 0.35, l));
        col *= mix(vec3(1.0), vec3(1.03, 1.0, 0.965), smoothstep(0.45, 1.0, l));
        col = clamp(col, 0.0, 1.0);

        // linear -> sRGB
        col = mix(col * 12.92, 1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, col));

        // triangular dither against banding in the dark gradients
        float n = hash(gl_FragCoord.xy + fract(uTime) * 61.0) + hash(gl_FragCoord.xy * 1.37 + 17.0 + fract(uTime * 1.3) * 113.0) - 1.0;
        col += n * (1.25 / 255.0);
        gl_FragColor = vec4(col * uFade, 1.0);
      }`, {
      tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.22 }, uExposure: { value: 1.12 },
      uTime: { value: 0 }, uFade: { value: 1 }, uResolution: { value: new THREE.Vector2(1, 1) },
    });

    this.setSize(width, height);
  }

  setSize(width, height) {
    width = Math.max(8, Math.floor(width));
    height = Math.max(8, Math.floor(height));
    this.width = width; this.height = height;
    this.sceneTarget.setSize(width, height);
    let w = width / 2, h = height / 2;
    for (let i = 0; i < LEVELS; i++) {
      w = Math.max(2, Math.round(w / 2));
      h = Math.max(2, Math.round(h / 2));
      this.levels[i].setSize(w, h);
    }
    this.finalMat.uniforms.uResolution.value.set(width, height);
  }

  // Bloom + tone mapping; the result goes to the canvas.
  render(time, fade, skipBloom = false) {
    const r = this.renderer;
    const L = this.levels;
    const prevAutoClear = r.autoClear;
    r.autoClear = false;

    if (!skipBloom) {
      // prefilter (scene -> level 0, a quarter of the size: four bilinear taps cover each 4x4 block)
      this.prefilterMat.uniforms.tSrc.value = this.sceneTarget.texture;
      this.prefilterMat.uniforms.uTexel.value.set(1 / this.width, 1 / this.height);
      drawFullscreen(r, this.prefilterMat, L[0]);

      // downsample chain
      for (let i = 1; i < LEVELS; i++) {
        this.downMat.uniforms.tSrc.value = L[i - 1].texture;
        this.downMat.uniforms.uTexel.value.set(1 / L[i - 1].width, 1 / L[i - 1].height);
        drawFullscreen(r, this.downMat, L[i]);
      }
      // upsample chain: each level is added onto the next finer one
      for (let i = LEVELS - 1; i > 0; i--) {
        this.upMat.uniforms.tSrc.value = L[i].texture;
        this.upMat.uniforms.uTexel.value.set(1 / L[i].width, 1 / L[i].height);
        this.upMat.uniforms.uWeight.value = 1.0;
        drawFullscreen(r, this.upMat, L[i - 1]);
      }
    }

    const u = this.finalMat.uniforms;
    u.tScene.value = this.sceneTarget.texture;
    u.tBloom.value = L[0].texture;
    u.uTime.value = time;
    u.uFade.value = fade;
    drawFullscreen(r, this.finalMat, null);
    r.autoClear = prevAutoClear;
  }
}
