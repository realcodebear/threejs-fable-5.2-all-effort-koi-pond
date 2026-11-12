// A red Japanese maple leaning over the pond: hand-placed main limbs, generated side
// branches and twigs, thousands of instanced leaves, and a few leaves that keep falling.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng, groundHeight, sdf, uTime } from './common.js';
import { uNoise3 } from './noisetex.js';
import { lightUniforms, GLSL_LIGHT } from './lighting.js';
import { tubeAlong } from './flora.js';

export const MAPLE_BASE = new THREE.Vector3(2.25, 0, -3.30);

function resample(ctrl, n) {
  const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
  return curve.getPoints(n);
}

// Seven-lobed maple leaf, lying in the xz plane with the stem at the origin pointing to -z.
function leafGeometry() {
  const pos = [], nor = [], aR = [], idx = [];
  const lobes = [[0, 1.0], [0.68, 0.90], [-0.68, 0.90], [1.38, 0.68], [-1.38, 0.68], [2.12, 0.40], [-2.12, 0.40]];
  const center = 0;
  pos.push(0, 0, 0.12); nor.push(0, 1, 0); aR.push(0);
  for (const [ang, len] of lobes) {
    const dx = Math.sin(ang), dz = Math.cos(ang);
    const px = Math.cos(ang), pz = -Math.sin(ang);            // across the lobe
    const w = 0.125 * len + 0.03;
    const droop = (r) => -0.10 * r * r;
    const i0 = pos.length / 3;
    const mid = 0.40 * len;
    pos.push(dx * mid + px * w, droop(mid), dz * mid + pz * w + 0.12);
    pos.push(dx * len, droop(len), dz * len + 0.12);
    pos.push(dx * mid - px * w, droop(mid), dz * mid - pz * w + 0.12);
    for (let k = 0; k < 3; k++) nor.push(0, 1, 0);
    aR.push(0.45, 1.0, 0.45);
    idx.push(center, i0, i0 + 1, center, i0 + 1, i0 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aR', new THREE.Float32BufferAttribute(aR, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function leafMaterial() {
  return new THREE.ShaderMaterial({
    name: 'MapleLeaf',
    uniforms: { ...lightUniforms, uTime },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute float aR;
      uniform float uTime;
      varying vec3 vWPos; varying vec3 vN; varying vec3 vCol; varying float vR; varying float vDepth;
      void main() {
        vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 p = position;
        // leaves up in the canopy tremble in the breeze; fallen ones lie still
        float live = smoothstep(0.35, 1.3, c.y);
        float ph = c.x * 4.1 + c.z * 3.3 + c.y * 2.7;
        float fl = sin(uTime * 2.6 + ph) * 0.5 + sin(uTime * 4.3 + ph * 1.7) * 0.3;
        p.y += fl * 0.22 * aR * live;
        vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
        float sway = sin(uTime * 0.8 + c.x * 0.6 + c.z * 0.4) * 0.6 + sin(uTime * 1.7 + c.z * 1.1) * 0.3;
        wp.x += sway * 0.022 * live;
        wp.z += sway * 0.012 * live;
        vWPos = wp.xyz; vR = aR;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vCol = instanceColor;
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec3 vWPos; varying vec3 vN; varying vec3 vCol; varying float vR; varying float vDepth;
      ${GLSL_LIGHT}
      void main() {
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 albedo = vCol * (0.72 + 0.34 * vR);
        vec3 light = skyAmbient(n) * 0.85 + keyLight(n, 0.5) + lanternLight(vWPos, n, 0.5);
        // light shining through the thin leaf from behind makes it glow
        vec3 through = uKeyCol * max(dot(-n, uKeyDir), 0.0) * 0.9 + lanternLight(vWPos, -n, 0.2) * 0.9;
        vec3 col = albedo * light + albedo * vec3(1.35, 0.75, 0.6) * through;
        gl_FragColor = vec4(applyFog(col, vDepth), 1.0);
      }`,
  });
}

function barkMaterial() {
  return new THREE.ShaderMaterial({
    name: 'Bark',
    uniforms: { ...lightUniforms, tNoise3: uNoise3 },
    vertexShader: /* glsl */`
      varying vec3 vWPos; varying vec3 vN; varying float vDepth;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      precision highp sampler3D;
      uniform sampler3D tNoise3;
      varying vec3 vWPos; varying vec3 vN; varying float vDepth;
      ${GLSL_LIGHT}
      void main() {
        vec3 n = normalize(vN);
        vec4 na = texture(tNoise3, vWPos * vec3(7.0, 1.6, 7.0));
        vec4 nb = texture(tNoise3, vWPos * 1.3 + 0.5);
        // dark, furrowed bark
        float furrow = smoothstep(0.35, 0.65, na.r * 0.6 + na.b * 0.4);
        vec3 albedo = mix(vec3(0.018, 0.014, 0.012), vec3(0.070, 0.054, 0.044), furrow);
        // grey-green lichen and a little moss on the upper sides
        float lich = smoothstep(0.55, 0.75, nb.g) * smoothstep(-0.2, 0.6, n.y);
        albedo = mix(albedo, vec3(0.075, 0.105, 0.055), lich * 0.6);
        n = normalize(n + (na.rgb - 0.5) * 0.5);
        float ao = mix(0.45, 1.0, smoothstep(0.0, 0.5, vWPos.y));
        vec3 light = skyAmbient(n) * ao * 0.8 + keyLight(n, 0.15) * ao + lanternLight(vWPos, n, 0.15);
        gl_FragColor = vec4(applyFog(albedo * light, vDepth), 1.0);
      }`,
  });
}

export class Maple {
  constructor({ hook, water }) {
    this.water = water;
    const rng = makeRng(8086);
    this.rng = rng;
    this.group = new THREE.Group();
    this.group.name = 'maple';
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const B = MAPLE_BASE;
    const gy = groundHeight(B.x, B.z);

    const tubes = [];
    const twigTips = [];        // {p: Vector3, dir: Vector3}
    const addTube = (pts, r0, r1, radial, flare = 0) => {
      const radii = pts.map((_, i) => {
        const t = i / (pts.length - 1);
        return r0 + (r1 - r0) * Math.pow(t, 0.85) + flare * Math.pow(1 - t, 6);
      });
      tubes.push(tubeAlong(pts, radii, radial));
    };

    // --- trunk ---
    const F = V(1.93, 1.62, -3.05);                                   // main fork
    const trunk = resample([V(B.x, gy - 0.2, B.z), V(2.20, 0.50, -3.27), V(2.02, 1.10, -3.17), F], 10);
    addTube(trunk, 0.105, 0.072, 9, 0.06);

    // --- main limbs ---
    const limbs = [
      { pts: [F, V(1.55, 1.90, -2.84), V(hook.x, hook.y + 0.03, hook.z), V(0.45, 2.06, -2.25), V(-0.15, 2.04, -1.90), V(-0.62, 1.94, -1.60)], r: 0.058 },
      { pts: [F, V(2.25, 2.25, -3.00), V(2.75, 2.85, -3.15), V(3.35, 3.25, -3.45), V(3.90, 3.42, -3.90)], r: 0.055 },
      { pts: [F, V(1.85, 2.30, -3.50), V(1.70, 2.95, -4.05), V(1.35, 3.45, -4.60), V(0.90, 3.68, -5.10)], r: 0.052 },
      { pts: [F, V(1.70, 2.35, -2.75), V(1.30, 3.00, -2.40), V(0.85, 3.50, -2.10), V(0.30, 3.78, -1.90)], r: 0.050 },
      { pts: [F, V(2.20, 2.40, -2.70), V(2.50, 3.00, -2.20), V(2.78, 3.38, -1.60)], r: 0.046 },
    ];
    const up = V(0, 1, 0);
    const branch = (start, dir, len, r, depth) => {
      // an arching side branch: rises a little, then levels out and droops at the tip
      const n = depth === 0 ? 5 : 4;
      const pts = [start.clone()];
      const d = dir.clone().normalize();
      const p = start.clone();
      const bend = V(rng.range(-0.25, 0.25), 0, rng.range(-0.25, 0.25));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        d.addScaledVector(bend, 0.25).addScaledVector(up, -0.22 * t).normalize();
        p.addScaledVector(d, len / n);
        pts.push(p.clone());
      }
      addTube(pts, r, r * 0.3, depth === 0 ? 5 : 4);
      if (depth === 0) {
        for (const t of [0.45, 0.72, 1.0]) {
          const at = pts[Math.round(t * n)];
          const count = t === 1.0 ? 2 : 2;
          for (let k = 0; k < count; k++) {
            const a = rng.range(0, Math.PI * 2);
            const nd = V(Math.cos(a), rng.range(-0.1, 0.35), Math.sin(a)).lerp(d, 0.45).normalize();
            branch(at, nd, len * rng.range(0.38, 0.6), r * 0.42, 1);
          }
        }
      } else {
        twigTips.push({ pts });
      }
    };
    for (const L of limbs) {
      const pts = resample(L.pts, 14);
      addTube(pts, L.r, L.r * 0.22, 7);
      const nSide = L.pts.length >= 6 ? 8 : 6;
      for (let s = 0; s < nSide; s++) {
        const t = 0.28 + 0.72 * (s / (nSide - 1));
        const i = Math.min(pts.length - 2, Math.round(t * (pts.length - 1)));
        const along = pts[i + 1].clone().sub(pts[i]).normalize();
        const side = new THREE.Vector3().crossVectors(along, up).normalize().multiplyScalar(s % 2 ? 1 : -1);
        const dir = side.multiplyScalar(rng.range(0.7, 1.0)).addScaledVector(along, rng.range(0.25, 0.7)).addScaledVector(up, rng.range(0.05, 0.4));
        branch(pts[i], dir, rng.range(0.75, 1.25) * (1.15 - 0.45 * t), L.r * (1 - 0.6 * t) * 0.55 + 0.006, 0);
      }
      twigTips.push({ pts: pts.slice(-4) });
    }
    const bark = new THREE.Mesh(mergeGeometries(tubes), barkMaterial());
    bark.frustumCulled = false;
    this.group.add(bark);

    // --- leaves ---
    const leaves = [];
    const palette = [[0.52, 0.035, 0.030], [0.66, 0.060, 0.028], [0.78, 0.130, 0.030], [0.36, 0.020, 0.035], [0.60, 0.045, 0.040], [0.84, 0.300, 0.045]];
    const pickColor = () => {
      const k = rng();
      const c = k < 0.3 ? palette[0] : k < 0.55 ? palette[1] : k < 0.72 ? palette[2] : k < 0.86 ? palette[3] : k < 0.96 ? palette[4] : palette[5];
      const v = rng.range(0.75, 1.2);
      return [c[0] * v, c[1] * v, c[2] * v];
    };
    for (const tw of twigTips) {
      const n = rng.int(19, 27);
      for (let i = 0; i < n; i++) {
        const k = rng.range(0.25, 1.0) * (tw.pts.length - 1);
        const i0 = Math.min(tw.pts.length - 2, Math.floor(k));
        const p = tw.pts[i0].clone().lerp(tw.pts[i0 + 1], k - i0);
        // leaves gather in flat layers around the twigs
        const a = rng.range(0, Math.PI * 2), rad = Math.sqrt(rng()) * 0.30;
        p.x += Math.cos(a) * rad; p.z += Math.sin(a) * rad; p.y += rng.range(-0.07, 0.09);
        leaves.push({ p, s: rng.range(0.048, 0.072), rx: rng.range(-0.55, 0.55), ry: rng.range(0, Math.PI * 2), rz: rng.range(-0.55, 0.55), c: pickColor() });
      }
    }
    this.canopy = leaves.map((l) => l.p);
    // fallen leaves on the moss, the stones and the water under the tree
    for (let i = 0; i < 110; i++) {
      const a = rng.range(0, Math.PI * 2), rad = Math.sqrt(rng()) * 3.3;
      const x = 1.6 + Math.cos(a) * rad, z = -3.1 + Math.sin(a) * rad * 0.85;
      const onWater = sdf(x, z) > 0.12;
      if (onWater && rng() < 0.72) continue;
      const y = onWater ? 0.012 : groundHeight(x, z) + 0.012;
      leaves.push({ p: V(x, y, z), s: rng.range(0.045, 0.065), rx: onWater ? 0 : rng.range(-0.25, 0.25), ry: rng.range(0, 6.28), rz: onWater ? 0 : rng.range(-0.25, 0.25), c: pickColor(), fallen: true });
    }

    const geo = leafGeometry();
    this.leafMat = leafMaterial();
    const mesh = new THREE.InstancedMesh(geo, this.leafMat, leaves.length);
    const dummy = new THREE.Object3D(), col = new THREE.Color();
    leaves.forEach((l, i) => {
      dummy.position.copy(l.p);
      dummy.rotation.set(l.rx, l.ry, l.rz);
      dummy.scale.setScalar(l.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, col.setRGB(l.c[0], l.c[1], l.c[2]));
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);

    // --- leaves that keep falling ---
    const NF = 9;
    this.fallMesh = new THREE.InstancedMesh(geo, this.leafMat, NF);
    this.fallMesh.frustumCulled = false;
    this.fallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.falling = [];
    for (let i = 0; i < NF; i++) {
      const c = pickColor();
      this.fallMesh.setColorAt(i, col.setRGB(c[0], c[1], c[2]));
      this.falling.push({ state: 'wait', t: rng.range(0.5, 22), p: V(0, -5, 0), s: rng.range(0.05, 0.068), spin: 0, ph: rng.range(0, 6.28), yaw: 0, scale: 0 });
    }
    this.fallMesh.instanceColor.needsUpdate = true;
    this.fallGroup = new THREE.Group();
    this.fallGroup.name = 'falling-leaves';
    this.fallGroup.add(this.fallMesh);
    this._dummy = dummy;
    this.update(0, 0);
  }

  update(dt, time) {
    const rng = this.rng, d = this._dummy;
    for (let i = 0; i < this.falling.length; i++) {
      const f = this.falling[i];
      f.t -= dt;
      if (f.state === 'wait') {
        f.scale = 0;
        if (f.t <= 0) {
          const src = this.canopy[rng.int(0, this.canopy.length - 1)];
          f.p.copy(src); f.p.y -= 0.05;
          f.state = 'fall'; f.spin = rng.range(-2.5, 2.5); f.ph = rng.range(0, 6.28); f.scale = 1; f.age = 0;
          f.drift = rng.range(-0.06, 0.10); f.driftZ = rng.range(-0.02, 0.10);
        }
      } else if (f.state === 'fall') {
        f.age += dt;
        // flutter down: swing from side to side, falling faster in the middle of each swing
        const sw = Math.sin(f.age * 2.6 + f.ph);
        f.p.y -= dt * (0.30 + 0.16 * (1 - sw * sw));
        f.p.x += dt * (f.drift + 0.30 * Math.cos(f.age * 2.6 + f.ph));
        f.p.z += dt * (f.driftZ + 0.14 * Math.sin(f.age * 1.9 + f.ph * 1.7));
        f.yaw += f.spin * dt;
        d.rotation.set(0.9 * sw, f.yaw, 0.6 * Math.sin(f.age * 3.4 + f.ph));
        const water = sdf(f.p.x, f.p.z) > 0.03;
        const floor = water ? 0.012 : groundHeight(f.p.x, f.p.z) + 0.014;
        if (f.p.y <= floor) {
          f.p.y = floor;
          if (water) {
            f.state = 'float'; f.t = rng.range(22, 45);
            this.water.addDrop(f.p.x, f.p.z, 0.035, 0.0016, 3.2, 0.7);
          } else { f.state = 'rest'; f.t = rng.range(20, 40); }
          f.tilt = water ? 0 : rng.range(-0.2, 0.2);
        }
      } else if (f.state === 'float' || f.state === 'rest') {
        if (f.state === 'float') {
          f.p.x += dt * 0.012 * Math.sin(time * 0.21 + f.ph);
          f.p.z += dt * 0.012 * Math.cos(time * 0.17 + f.ph);
          f.yaw += dt * 0.08;
        }
        d.rotation.set(f.tilt, f.yaw, f.tilt * 0.7);
        if (f.t < 2.5) f.scale = Math.max(0, f.t / 2.5);              // fade away, then start again
        if (f.t <= 0) { f.state = 'wait'; f.t = rng.range(2, 16); }
      }
      d.position.copy(f.p);
      d.scale.setScalar(f.s * f.scale);
      if (f.state === 'wait') d.position.y = -5;
      d.updateMatrix();
      this.fallMesh.setMatrixAt(i, d.matrix);
    }
    this.fallMesh.instanceMatrix.needsUpdate = true;
  }
}
