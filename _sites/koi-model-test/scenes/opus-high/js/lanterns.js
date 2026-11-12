// Paper lanterns (hanging + floating), a stone lantern, and fireflies.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { globals, patchMaterial, mulberry32, vnoise3 } from './util.js';
import { edgePoint, terrainHeight, pondSDF } from './pond.js';
import { createStoneMaterial } from './rocks.js';

const WARM = new THREE.Color(1.0, 0.55, 0.22);

function paperMaterial(color, glow, intensity, flickerU) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, emissive: glow, emissiveIntensity: intensity, side: THREE.DoubleSide });
  patchMaterial(mat, 'chochin', {
    uniforms: { uFlicker: flickerU },
    vertexHead: 'varying vec3 vLP;',
    vertex: { begin_vertex: '#include <begin_vertex>\nvLP = position;' },
    fragmentHead: 'uniform float uFlicker; varying vec3 vLP;',
    fragment: {
      emissivemap_fragment: `#include <emissivemap_fragment>
        {
          float ribs = smoothstep(0.55, 1.0, abs(sin(vLP.y * 3.14159 * 34.0)));
          float mid = 1.0 - smoothstep(0.0, 0.2, abs(vLP.y));
          totalEmissiveRadiance *= (0.55 + 0.75 * mid) * (1.0 - 0.35 * ribs) * uFlicker;
        }`,
    },
  });
  return mat;
}

function chochinGeometry() {
  const pts = [];
  const N = 70;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = -0.21 + t * 0.42;
    let r = 0.165 * Math.sqrt(Math.max(0, 1 - Math.pow(y / 0.235, 2)));
    r = Math.max(r, 0.075);
    r *= 1 - 0.018 * Math.pow(Math.abs(Math.sin(y * Math.PI * 34)), 4);
    pts.push(new THREE.Vector2(r, y));
  }
  return new THREE.LatheGeometry(pts, 28);
}

export class Lanterns {
  constructor(scene, maple) {
    this.group = new THREE.Group();
    this.group.name = 'lanterns';
    this.floatGroup = new THREE.Group();
    this.floatGroup.name = 'floating-lanterns';
    this.lights = []; // {light, base intensity, color, waterStrength, flicker uniform, getPos}
    this.waterLights = [];
    this.hanging = [];
    this.floating = [];
    const rnd = mulberry32(77);
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x1c130d, roughness: 0.8 });
    const lacquer = new THREE.MeshStandardMaterial({ color: 0x080606, roughness: 0.35 });

    // ---- hanging lanterns: from the maple's branches over the water + one bamboo pole ----
    const anchors = [];
    const cands = maple.anchors
      .filter((p) => pondSDF(p.x, p.z) < -0.25 && p.y > 2.0)
      .sort((a, b) => pondSDF(a.x, a.z) - pondSDF(b.x, b.z));
    for (const c of cands) {
      if (anchors.length >= 3) break;
      if (anchors.every((a) => Math.hypot(a.x - c.x, a.z - c.z) > 0.9)) anchors.push(c);
    }
    this.mapleLanternCount = anchors.length;
    // bamboo pole with an arm reaching over the water
    {
      const a = 3.95;
      const base2 = edgePoint(a, 0.55), tip2 = edgePoint(a, -1.0);
      const base = new THREE.Vector3(base2.x, terrainHeight(base2.x, base2.y) - 0.05, base2.y);
      const poleH = 2.75;
      const bambooMat = new THREE.MeshStandardMaterial({ color: 0x5c5a2c, roughness: 0.55 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, poleH, 8), bambooMat);
      pole.position.set(base.x, base.y + poleH / 2, base.z);
      this.group.add(pole);
      const top = new THREE.Vector3(base.x, base.y + poleH - 0.08, base.z);
      const end = new THREE.Vector3(tip2.x, top.y + 0.12, tip2.y);
      const armLen = top.distanceTo(end);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, armLen, 6), bambooMat);
      arm.position.copy(top).add(end).multiplyScalar(0.5);
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(top).normalize());
      this.group.add(arm);
      anchors.push(end.clone().add(new THREE.Vector3(0, -0.02, 0)));
    }

    const lanternGeo = chochinGeometry();
    const capGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.035, 20);
    const stringGeo = new THREE.CylinderGeometry(0.004, 0.004, 1, 4);
    stringGeo.translate(0, -0.5, 0);
    const tassel = new THREE.CylinderGeometry(0.004, 0.025, 0.14, 8);
    const colors = [
      { paper: 0xffe2b8, glow: new THREE.Color(1.0, 0.5, 0.18) },
      { paper: 0xff6a4a, glow: new THREE.Color(1.0, 0.22, 0.08) },
      { paper: 0xffe2b8, glow: new THREE.Color(1.0, 0.5, 0.18) },
      { paper: 0xff6a4a, glow: new THREE.Color(1.0, 0.22, 0.08) },
    ];
    const drop = [1.0, 0.75, 1.2, 0.0];
    anchors.forEach((anchor, i) => {
      const isPole = i === anchors.length - 1;
      const cy = isPole ? anchor.y - 0.75 : Math.min(Math.max(anchor.y - drop[i % 3], 1.35), 2.3);
      const len = Math.max(0.15, anchor.y - cy - 0.25);
      const pivot = new THREE.Group();
      pivot.position.copy(anchor);
      const flick = { value: 1 };
      const lg = new THREE.Group();
      lg.position.y = -len - 0.25;
      const body = new THREE.Mesh(lanternGeo, paperMaterial(colors[i].paper, colors[i].glow, 3.2, flick));
      lg.add(body);
      const c1 = new THREE.Mesh(capGeo, lacquer); c1.position.y = 0.22; lg.add(c1);
      const c2 = new THREE.Mesh(capGeo, lacquer); c2.position.y = -0.22; lg.add(c2);
      const tas = new THREE.Mesh(tassel, new THREE.MeshStandardMaterial({ color: 0x7a1010, roughness: 0.8 }));
      tas.position.y = -0.31; lg.add(tas);
      const str = new THREE.Mesh(stringGeo, lacquer);
      str.scale.y = len;
      pivot.add(str, lg);
      this.group.add(pivot);
      const light = new THREE.PointLight(colors[i].glow, 3.2, 9, 2);
      scene.add(light);
      const h = { pivot, lg, light, flick, ph: rnd() * 6.28, len, color: colors[i].glow.clone(), base: 3.2 };
      this.hanging.push(h);
      this.waterLights.push({ pos: new THREE.Vector3(), col: new THREE.Vector3(), h });
    });

    // ---- stone lantern (simplified kasuga-doro) ----
    const sl = new THREE.Group();
    const stoneMat = createStoneMaterial(0x8f8a80, 0.8);
    const add = (geo, y) => { const m = new THREE.Mesh(geo, stoneMat); m.position.y = y; sl.add(m); return m; };
    add(new THREE.CylinderGeometry(0.3, 0.36, 0.14, 6), 0.07);
    add(new THREE.CylinderGeometry(0.11, 0.13, 0.62, 14), 0.45);
    add(new THREE.CylinderGeometry(0.29, 0.17, 0.14, 6), 0.83);
    // firebox: corner posts + glowing paper core
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const post = add(new THREE.BoxGeometry(0.06, 0.26, 0.06), 1.03);
      post.position.x = Math.cos(a) * 0.17; post.position.z = Math.sin(a) * 0.17;
      post.rotation.y = -a;
    }
    const slFlick = { value: 1 };
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.24, 6), new THREE.MeshStandardMaterial({ color: 0xffe0b0, emissive: new THREE.Color(1.0, 0.55, 0.2), emissiveIntensity: 3.5, roughness: 0.9 }));
    core.position.y = 1.03;
    core.rotation.y = Math.PI / 6;
    sl.add(core);
    add(new THREE.CylinderGeometry(0.21, 0.21, 0.04, 6), 0.9);
    add(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 6), 1.17);
    const roof = add(new THREE.CylinderGeometry(0.07, 0.46, 0.2, 6), 1.29);
    roof.rotation.y = Math.PI / 6;
    add(new THREE.CylinderGeometry(0.06, 0.08, 0.06, 10), 1.42);
    add(new THREE.SphereGeometry(0.075, 14, 10), 1.5);
    const tip = add(new THREE.ConeGeometry(0.04, 0.08, 10), 1.6);
    void tip;
    const slA = 4.75;
    const slP = edgePoint(slA, 0.75);
    sl.position.set(slP.x, terrainHeight(slP.x, slP.y) - 0.04, slP.y);
    sl.rotation.y = 0.3;
    this.group.add(sl);
    const slLight = new THREE.PointLight(new THREE.Color(1.0, 0.55, 0.22), 2.6, 7, 2);
    slLight.position.set(sl.position.x, sl.position.y + 1.03, sl.position.z);
    scene.add(slLight);
    this.stone = { core, light: slLight, ph: rnd() * 6.28 };
    this.waterLights.push({ pos: slLight.position.clone(), col: new THREE.Vector3(), stone: true });

    // ---- floating lanterns (toro nagashi) ----
    const boxGeo = new THREE.BoxGeometry(0.2, 0.22, 0.2);
    boxGeo.translate(0, 0.14, 0);
    const baseGeo = new THREE.BoxGeometry(0.27, 0.035, 0.27);
    baseGeo.translate(0, 0.018, 0);
    const startPts = [[1.2, 0.6], [-1.6, -0.9], [0.2, -2.2]];
    startPts.forEach(([x, z], i) => {
      const flick = { value: 1 };
      const mat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.9, emissive: new THREE.Color(1.0, 0.6, 0.28), emissiveIntensity: 2.6 });
      patchMaterial(mat, 'toro', {
        uniforms: { uFlicker: flick },
        fragmentHead: 'uniform float uFlicker;',
        fragment: {
          emissivemap_fragment: `#include <emissivemap_fragment>
            {
              vec2 e = abs(vUv - 0.5) * 2.0;
              float frame = smoothstep(0.86, 0.92, max(e.x, e.y));
              float grad = mix(1.15, 0.7, vUv.y);
              totalEmissiveRadiance *= (1.0 - frame * 0.9) * grad * uFlicker;
              diffuseColor.rgb *= 1.0 - frame * 0.85;
            }`,
        },
      });
      mat.map = null;
      // vUv needs a uv-using feature: enable via defines
      mat.defines = { USE_UV: '' };
      const g = new THREE.Group();
      const box = new THREE.Mesh(boxGeo, mat);
      const base = new THREE.Mesh(baseGeo, darkWood);
      g.add(box, base);
      this.floatGroup.add(g);
      const light = new THREE.PointLight(new THREE.Color(1.0, 0.58, 0.25), 0.9, 3.5, 2);
      scene.add(light);
      const f = { g, light, flick, x, z, ph: rnd() * 6.28, rot: rnd() * 6.28 };
      this.floating.push(f);
      this.waterLights.push({ pos: new THREE.Vector3(), col: new THREE.Vector3(), f });
    });
  }

  // gentle current that circulates around the pond
  static flow(x, z, t) {
    const r = Math.hypot(x, z) + 1e-3;
    const sd = pondSDF(x, z);
    let vx = -z / r * 0.06, vz = x / r * 0.06;
    vx += vnoise3(x * 0.4, z * 0.4, t * 0.05) * 0.04;
    vz += vnoise3(x * 0.4 + 9, z * 0.4, t * 0.05) * 0.04;
    if (sd > -0.9) { vx -= x / r * (sd + 0.9) * 0.2; vz -= z / r * (sd + 0.9) * 0.2; }
    return new THREE.Vector2(vx, vz);
  }

  update(dt, t) {
    this.hanging.forEach((h) => {
      const sw = Math.sin(t * 0.9 + h.ph) * 0.05 + Math.sin(t * 0.37 + h.ph * 2.0) * 0.04;
      h.pivot.rotation.z = sw;
      h.pivot.rotation.x = Math.cos(t * 0.7 + h.ph) * 0.04;
      const fl = 0.93 + 0.05 * Math.sin(t * 7.3 + h.ph) + 0.04 * vnoise3(t * 3.0, h.ph, 0);
      h.flick.value = fl;
      h.lg.updateWorldMatrix(true, false);
      h.light.position.setFromMatrixPosition(h.lg.matrixWorld);
      h.light.intensity = h.base * fl;
    });
    {
      const s = this.stone;
      const fl = 0.92 + 0.06 * Math.sin(t * 6.1 + s.ph) + 0.05 * vnoise3(t * 2.5, s.ph, 1);
      s.core.material.emissiveIntensity = 3.5 * fl;
      s.light.intensity = 2.6 * fl;
    }
    this.floating.forEach((f, i) => {
      // drift with the current; keep apart from each other
      const v = Lanterns.flow(f.x, f.z, t);
      this.floating.forEach((o) => {
        if (o === f) return;
        const dx = f.x - o.x, dz = f.z - o.z, d2 = dx * dx + dz * dz;
        if (d2 < 1.5) { v.x += dx * (1.5 - d2) * 0.05; v.y += dz * (1.5 - d2) * 0.05; }
      });
      f.x += v.x * dt; f.z += v.y * dt;
      f.rot += dt * 0.03 * (i % 2 ? 1 : -1);
      f.g.position.set(f.x, 0.005 + Math.sin(t * 1.2 + f.ph) * 0.008, f.z);
      f.g.rotation.set(Math.sin(t * 0.9 + f.ph) * 0.035, f.rot, Math.cos(t * 1.1 + f.ph) * 0.035);
      const fl = 0.9 + 0.07 * Math.sin(t * 8.0 + f.ph) + 0.05 * vnoise3(t * 3.5, f.ph, 2);
      f.flick.value = fl;
      f.light.position.set(f.x, 0.2, f.z);
      f.light.intensity = 0.9 * fl;
    });
    // water glint/scatter sources
    this.waterLights.forEach((w) => {
      if (w.h) { w.pos.copy(w.h.light.position); w.col.set(w.h.color.r, w.h.color.g, w.h.color.b).multiplyScalar(1.4 * w.h.flick.value); }
      else if (w.f) { w.pos.copy(w.f.light.position); w.col.set(1.0, 0.58, 0.25).multiplyScalar(0.6 * w.f.flick.value); }
      else if (w.stone) { w.col.set(1.0, 0.55, 0.22).multiplyScalar(0.9); }
    });
  }
}

export function createFireflies(count = 70) {
  const rnd = mulberry32(31);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const p = edgePoint(a, -1.5 + rnd() * 5.0);
    pos[i * 3] = p.x;
    pos[i * 3 + 1] = Math.max(terrainHeight(p.x, p.y), 0) + 0.3 + rnd() * 1.6;
    pos[i * 3 + 2] = p.y;
    seed[i] = rnd() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: globals.uTime, uScale: { value: 1 } },
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uScale;
      attribute float aSeed;
      varying float vBlink;
      void main(){
        vec3 p = position;
        float s = aSeed;
        p += vec3(sin(uTime * 0.21 + s) + 0.5 * sin(uTime * 0.53 + s * 2.1),
                  0.4 * sin(uTime * 0.33 + s * 1.3),
                  cos(uTime * 0.18 + s * 0.7) + 0.5 * sin(uTime * 0.47 + s * 3.1)) * 0.7;
        float cyc = fract(uTime * (0.09 + fract(s * 7.13) * 0.06) + fract(s * 3.7));
        vBlink = smoothstep(0.0, 0.08, cyc) * (1.0 - smoothstep(0.12, 0.35, cyc));
        vBlink = max(vBlink, 0.05);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uScale * (18.0 + 10.0 * vBlink) / -mv.z;
      }`,
    fragmentShader: /* glsl */`
      varying float vBlink;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c) * 2.0;
        float core = exp(-d * d * 18.0);
        float halo = exp(-d * d * 4.0) * 0.25;
        float a = (core + halo) * vBlink;
        gl_FragColor = vec4(vec3(0.75, 1.0, 0.3) * a * 4.0, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.name = 'fireflies';
  return { points: pts, uniforms: mat.uniforms };
}
