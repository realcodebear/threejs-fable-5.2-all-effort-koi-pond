// Dusk sky: afterglow in the west, deep indigo overhead, thin lit clouds, first stars,
// a crescent moon and layered mountain silhouettes. Also produces the environment map
// used for image-based lighting.
import * as THREE from 'three';
import { GLSL_NOISE, uTime } from './common.js';

// Direction towards the place where the sun went down (the hero camera looks roughly this way).
export const SUNSET_DIR = new THREE.Vector3(0.10, 0.0, -1.0).normalize();
// A young crescent moon, low in the afterglow just above the far hills.
export const MOON_DIR = new THREE.Vector3(-0.100, 0.120, -1.0).normalize();
// Colour used for distance haze (matches the foot of the hills).
export const HAZE_COLOR = new THREE.Color(0.030, 0.036, 0.075);

export const SKY_GLSL = /* glsl */`
uniform vec3 uSunsetDir;
uniform vec3 uMoonDir;
uniform float uSkyDetail;   // 1 = stars + clouds animation, 0 = smooth version for lighting

vec3 skyBase(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  vec2 dxz = normalize(d.xz + vec2(1e-5));
  float az = dot(dxz, normalize(uSunsetDir.xz));           // +1 = towards the sunset
  float w = smoothstep(-1.0, 1.0, az);
  w = w * w * (3.0 - 2.0 * w);
  float wNear = pow(max(az, 0.0), 3.0);                     // tight around the sunset azimuth

  vec3 zenith = vec3(0.012, 0.025, 0.088);
  vec3 upper  = vec3(0.030, 0.056, 0.180);

  // west: gold -> rose -> lavender -> twilight blue
  vec3 horW = vec3(1.05, 0.46, 0.17);
  vec3 lowW = vec3(0.62, 0.23, 0.24);
  vec3 midW = vec3(0.19, 0.13, 0.31);
  vec3 hiW  = vec3(0.066, 0.096, 0.265);
  vec3 west = mix(horW, lowW, smoothstep(0.0, 0.11, h));
  west = mix(west, midW, smoothstep(0.07, 0.26, h));
  west = mix(west, hiW, smoothstep(0.20, 0.46, h));
  west = mix(west, upper, smoothstep(0.42, 0.80, h));

  // east: earth shadow, the pink "belt of Venus", then blue
  vec3 horE = vec3(0.040, 0.060, 0.140);
  vec3 lowE = vec3(0.125, 0.092, 0.190);
  vec3 midE = vec3(0.055, 0.080, 0.225);
  vec3 east = mix(horE, lowE, smoothstep(0.02, 0.15, h));
  east = mix(east, midE, smoothstep(0.13, 0.34, h));
  east = mix(east, upper, smoothstep(0.30, 0.75, h));

  vec3 col = mix(east, west, w);
  col = mix(col, zenith, smoothstep(0.62, 1.0, h));

  // concentrated glow where the sun went down
  float g = wNear * (1.0 - smoothstep(0.0, 0.22, h));
  col += vec3(0.95, 0.36, 0.08) * g * g * 0.8;
  return col;
}

float moonMask(vec3 d, out float glow, out float earth) {
  float c = dot(d, uMoonDir);
  float ang = acos(clamp(c, -1.0, 1.0));
  const float R = 0.018;                                    // angular radius (radians)
  float disc = 1.0 - smoothstep(R - 0.0012, R + 0.0006, ang);
  // crescent: remove a disc shifted away from the sun
  vec3 toSun = normalize(uSunsetDir - vec3(0.0, 0.35, 0.0) - uMoonDir * dot(uSunsetDir - vec3(0.0, 0.35, 0.0), uMoonDir));
  vec3 d2 = normalize(uMoonDir - toSun * R * 0.62);
  float ang2 = acos(clamp(dot(d, d2), -1.0, 1.0));
  float cut = smoothstep(R * 1.02 - 0.0012, R * 1.02 + 0.0008, ang2);
  glow = exp(-ang * 18.0) * 0.55 + exp(-ang * 70.0) * 0.9;
  earth = disc * (1.0 - cut);
  return disc * cut;
}

vec3 skyColor(vec3 d) {
  d = normalize(d);
  vec3 col = skyBase(d);
  float h = d.y;
  vec2 dxz = normalize(d.xz + vec2(1e-5));
  float az = dot(dxz, normalize(uSunsetDir.xz));
  float w = smoothstep(-1.0, 1.0, az);

  // stars
  if (uSkyDetail > 0.5 && h > 0.0) {
    vec3 p = d * 190.0;
    vec3 ip = floor(p), fp = fract(p);
    vec3 rnd = hash33(ip);
    float present = step(0.86, rnd.x);
    vec3 sp = 0.25 + 0.5 * hash33(ip + 17.0);
    float dist = length(fp - sp);
    float mag = pow(rnd.y, 5.0);
    float tw = 0.75 + 0.25 * sin(uTime * (1.5 + rnd.z * 3.0) + rnd.y * 40.0);
    float star = present * smoothstep(0.26, 0.0, dist) * (0.25 + 2.2 * mag) * tw;
    float vis = smoothstep(0.10, 0.55, h) * (1.0 - 0.85 * w * (1.0 - smoothstep(0.35, 0.9, h)));
    col += vec3(0.80, 0.86, 1.0) * star * vis * 1.25;
  }

  // thin high clouds, lit from below by the afterglow
  if (h > 0.0) {
    vec2 cp = d.xz / (h + 0.22);
    float t = uTime * 0.0035 * uSkyDetail;
    vec2 q = vec2(cp.x * 0.55 + cp.y * 0.18, cp.y * 1.45 - cp.x * 0.10);
    float n = fbm(q * 0.62 + vec2(t, 3.7));
    float n2 = fbm(q * 1.9 + vec2(-t * 1.6, 9.2));
    float cover = smoothstep(0.50, 0.82, n * 0.72 + n2 * 0.36);
    cover *= smoothstep(0.03, 0.20, h) * (1.0 - smoothstep(0.55, 0.92, h));
    float lit = w * (1.0 - smoothstep(0.10, 0.75, h));
    vec3 cloudLit = mix(vec3(0.62, 0.22, 0.25), vec3(1.25, 0.50, 0.26), smoothstep(0.30, 0.0, h));
    vec3 cloudDark = vec3(0.055, 0.052, 0.120);
    vec3 cc = mix(cloudDark, cloudLit, lit * (0.55 + 0.45 * n2));
    col = mix(col, cc, cover * 0.80);
  }

  // moon
  float glow, earth;
  float m = moonMask(d, glow, earth);
  col += vec3(1.0, 0.93, 0.80) * (m * 3.6 + glow * 0.08) + vec3(0.10, 0.13, 0.20) * earth * 0.35;

  // layered mountain silhouettes with haze in the valleys
  float r1 = 0.050 + 0.070 * fbm(dxz * 2.1 + 5.0) + 0.016 * vnoise(dxz * 11.0 + 1.0);
  float r2 = 0.018 + 0.060 * fbm(dxz * 3.3 + 21.0) + 0.012 * vnoise(dxz * 19.0 + 4.0);
  float r3 = -0.005 + 0.050 * fbm(dxz * 5.1 + 43.0) + 0.008 * vnoise(dxz * 31.0 + 9.0);
  vec3 hazeCol = skyBase(vec3(d.x, 0.0, d.z));
  float aa = fwidth(h) * 1.2 + 0.0006;
  vec3 m1 = mix(vec3(0.050, 0.046, 0.120), hazeCol, 0.22);
  m1 = mix(m1, hazeCol, 0.22 * smoothstep(r1, r1 - 0.07, h));
  col = mix(col, m1, smoothstep(r1 + aa, r1 - aa, h));
  vec3 m2 = mix(vec3(0.030, 0.032, 0.080), hazeCol, 0.09);
  m2 = mix(m2, hazeCol, 0.14 * smoothstep(r2, r2 - 0.06, h));
  col = mix(col, m2, smoothstep(r2 + aa, r2 - aa, h));
  vec3 m3 = mix(vec3(0.018, 0.024, 0.050), hazeCol, 0.03);
  col = mix(col, m3, smoothstep(r3 + aa, r3 - aa, h));
  // below the horizon: dark ground haze
  col = mix(col, vec3(0.018, 0.024, 0.050), smoothstep(0.0, -0.03, h));
  return col;
}
`;

export function createSky() {
  const uniforms = {
    uTime,
    uSunsetDir: { value: SUNSET_DIR },
    uMoonDir: { value: MOON_DIR },
    uSkyDetail: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'Sky',
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    depthFunc: THREE.LessEqualDepth,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = modelViewMatrix * vec4(position, 0.0);     // rotation only: the dome follows the camera
        gl_Position = projectionMatrix * vec4(p.xyz, 1.0);
        gl_Position.z = gl_Position.w * 0.999995;           // on the far plane: drawn only where nothing else is
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime;
      varying vec3 vDir;
      ${GLSL_NOISE}
      ${SKY_GLSL}
      void main() {
        gl_FragColor = vec4(skyColor(vDir), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;            // after the other opaque objects, so hidden sky pixels are never shaded
  mesh.name = 'sky';
  return { mesh, uniforms };
}

// Render the sky into a prefiltered environment map for image-based lighting.
export function createEnvironment(renderer) {
  const sky = createSky();
  sky.uniforms.uSkyDetail = { value: 0 };
  sky.mesh.material.uniforms.uSkyDetail = sky.uniforms.uSkyDetail;
  const scene = new THREE.Scene();
  scene.add(sky.mesh);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0, 0.1, 100);
  pmrem.dispose();
  sky.mesh.geometry.dispose();
  sky.mesh.material.dispose();
  return rt.texture;
}
