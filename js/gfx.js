// Graphics layer: procedural textures, shader patches (terrain / water / units / foliage), sky dome with
// clouds and cloud shadows, environment lighting, ground scatter (grass, rocks, trees) and animation helpers.
// Everything is generated at load time - no image assets.
import * as THREE from 'three';
import { hasIK, animateLegsIK, animateBody } from './procanim.js';
import { CELL } from './sim/defs.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ noise
function rand32(seed) { let s = seed | 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return ((s >>> 8) & 0xffffff) / 0x1000000; }; }
// tileable value noise on a size x size grid with `freq` lattice cells per tile
function tileNoise(size, freq, seed) {
  const r = rand32(seed * 7919 + freq * 104729), lat = new Float32Array(freq * freq);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = y / size * freq, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), y1 = (y0 + 1) % freq;
    for (let x = 0; x < size; x++) {
      const fx = x / size * freq, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), x1 = (x0 + 1) % freq;
      const a = lat[y0 * freq + x0], b = lat[y0 * freq + x1], c = lat[y1 * freq + x0], d = lat[y1 * freq + x1];
      out[y * size + x] = (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
    }
  }
  return out;
}
function fbm(size, f0, oct, seed, ridged) {
  const out = new Float32Array(size * size); let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const n = tileNoise(size, f0 * (1 << o), seed + o * 31);
    for (let i = 0; i < out.length; i++) out[i] += amp * (ridged ? 1 - Math.abs(n[i] * 2 - 1) : n[i]);
    tot += amp; amp *= 0.5;
  }
  let mn = 1e9, mx = -1e9;
  for (let i = 0; i < out.length; i++) { out[i] /= tot; if (out[i] < mn) mn = out[i]; if (out[i] > mx) mx = out[i]; }
  const sc = 1 / (mx - mn || 1); for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) * sc;
  return out;
}
function dataTex(arr, size, fmt = THREE.RGBAFormat) {
  const t = new THREE.DataTexture(arr, size, size, fmt, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}
export function makeDetailTexture(size = 512) {
  const a = fbm(size, 24, 5, 11), g = fbm(size, 6, 5, 23), b = fbm(size, 5, 5, 37, true), w = fbm(size, 10, 4, 51);
  const px = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) { px[i * 4] = a[i] * 255; px[i * 4 + 1] = g[i] * 255; px[i * 4 + 2] = b[i] * 255; px[i * 4 + 3] = w[i] * 255; }
  return dataTex(px, size);
}
export function makeCloudTexture(size = 256) {
  const a = fbm(size, 3, 6, 71), b = fbm(size, 5, 5, 83);
  const px = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) { px[i * 4] = a[i] * 255; px[i * 4 + 1] = b[i] * 255; px[i * 4 + 2] = 0; px[i * 4 + 3] = 255; }
  return dataTex(px, size);
}

// ------------------------------------------------------------------ shared uniforms & GLSL chunks
export function makeUniforms(mapSize, fogTex, detail, cloud) {
  return {
    uTime: { value: 0 }, uDet: { value: detail }, uCld: { value: cloud }, uFog: { value: fogTex }, uMapSize: { value: mapSize },
    uWind: { value: new THREE.Vector2(0.0009, 0.0004) }, uCloudAmt: { value: 0.42 }, uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.35).normalize() },
  };
}
const FRAG_COMMON = `
uniform sampler2D uDet; uniform sampler2D uCld; uniform sampler2D uFog;
uniform float uTime; uniform float uMapSize; uniform vec2 uWind; uniform float uCloudAmt;
float cloudShade(vec2 xz) {
  float c = texture2D(uCld, xz * 0.0014 + uWind * uTime * 40.0).r * 0.65 + texture2D(uCld, xz * 0.0033 + 0.37 + uWind * uTime * 55.0).g * 0.35;
  return smoothstep(0.52, 0.78, c) * uCloudAmt;
}
float fogShade(vec2 xz) { return texture2D(uFog, xz / uMapSize).r; }
`;
const inject = (src, token, code, after = true) => src.replace(token, after ? token + '\n' + code : code + '\n' + token);

// ---- terrain
export function patchTerrain(mat, U) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = inject(inject(sh.vertexShader, '#include <common>', 'varying vec3 vWP; varying vec3 vWN;'), '#include <begin_vertex>', 'vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = inject(sh.fragmentShader, '#include <common>', 'varying vec3 vWP; varying vec3 vWN;\n' + FRAG_COMMON);
    sh.fragmentShader = inject(sh.fragmentShader, '#include <color_fragment>', `
    {
      vec3 wn = normalize(vWN); float slope = 1.0 - wn.y; vec2 P = vWP.xz;
      vec4 d1 = texture2D(uDet, P * 0.42), d2 = texture2D(uDet, P * 0.071 + 0.37), d3 = texture2D(uDet, P * 0.0105 + 0.71);
      float greenness = clamp((diffuseColor.g - max(diffuseColor.r, diffuseColor.b)) * 7.0, 0.0, 1.0);
      float sandy = clamp((diffuseColor.r - diffuseColor.b) * 3.0, 0.0, 1.0) * (1.0 - greenness);
      float greyish = clamp(1.0 - greenness * 1.6 - sandy * 1.4, 0.0, 1.0);
      vec3 macro = mix(vec3(0.80, 0.90, 0.70), vec3(1.18, 1.10, 0.84), d3.r);
      diffuseColor.rgb *= mix(vec3(1.0), macro, 0.6);
      float grassTex = 0.55 + (d1.r * 0.5 + d1.a * 0.5) * 0.85 + (d2.g - 0.5) * 0.4;
      vec3 tw = pow(abs(wn), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
      float rock = texture2D(uDet, vec2(vWP.z, vWP.y) * 0.09).b * tw.x + texture2D(uDet, P * 0.09).b * tw.y + texture2D(uDet, vec2(vWP.x, vWP.y) * 0.09).b * tw.z;
      float strata = 0.5 + 0.5 * sin(vWP.y * 1.3 + rock * 5.0);
      float rockTex = 0.68 + rock * 0.42 + strata * 0.16;
      float sandTex = 0.82 + d1.r * 0.3 + sin(P.x * 1.7 + P.y * 1.1 + d2.g * 6.0) * 0.035;
      float rockW = max(smoothstep(0.26, 0.48, slope), greyish * 0.85);
      float tex = mix(mix(grassTex, sandTex, sandy), rockTex, rockW);
      diffuseColor.rgb *= tex;
      diffuseColor.rgb *= 1.0 - 0.42 * cloudShade(P);
    }`);
    sh.fragmentShader = inject(sh.fragmentShader, '#include <normal_fragment_maps>', `
    {
      vec2 uvf = vWP.xz * 0.42; float e = 0.006;
      float hc = texture2D(uDet, uvf).r, hx = texture2D(uDet, uvf + vec2(e, 0.0)).r, hz = texture2D(uDet, uvf + vec2(0.0, e)).r;
      float k = (1.0 - smoothstep(40.0, 170.0, length(vViewPosition))) * 2.4;
      normal = normalize(normal + (viewMatrix * vec4((hc - hx) * k, 0.0, (hc - hz) * k, 0.0)).xyz);
    }`);
  };
  mat.customProgramCacheKey = () => 'st-terrain';
  return mat;
}

// ---- water
export function patchWater(mat, U) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = inject(inject(sh.vertexShader, '#include <common>', 'attribute float depth; varying float vDepth; varying vec3 vWP;'), '#include <begin_vertex>', 'vDepth = depth; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = inject(sh.fragmentShader, '#include <common>', 'varying float vDepth; varying vec3 vWP;\n' + FRAG_COMMON);
    sh.fragmentShader = inject(sh.fragmentShader, '#include <color_fragment>', `
    {
      float sh = diffuseColor.r, d = max(vDepth, 0.0); vec2 P = vWP.xz;
      vec2 w1 = P * 0.055 + vec2(uTime * 0.03, uTime * 0.022), w2 = P * 0.22 + vec2(-uTime * 0.05, uTime * 0.06);
      float n1 = texture2D(uDet, w1).g, n2 = texture2D(uDet, w2).a;
      float k = exp(-d * 0.26);
      vec3 wc = mix(vec3(0.015, 0.13, 0.24), vec3(0.09, 0.50, 0.54), k) + vec3(0.03, 0.05, 0.06) * (n1 * 0.6 + n2 * 0.4 - 0.5);
      float fn = texture2D(uDet, P * 0.2 + uTime * 0.02).r;
      float foam = smoothstep(1.1, 0.0, d + (fn - 0.5) * 1.3) * (0.3 + 0.7 * (0.5 + 0.5 * sin(uTime * 1.3 - d * 5.0 + fn * 5.0)));
      foam = clamp(foam, 0.0, 1.0);
      wc = mix(wc, vec3(0.92, 0.96, 0.98), foam * 0.85);
      diffuseColor.rgb = wc * sh * (1.0 - 0.38 * cloudShade(P));
      diffuseColor.a = max(mix(0.32, 0.96, 1.0 - k), foam * 0.95);
    }`);
    sh.fragmentShader = inject(sh.fragmentShader, '#include <normal_fragment_maps>', `
    {
      vec2 P = vWP.xz; vec2 w1 = P * 0.055 + vec2(uTime * 0.03, uTime * 0.022), w2 = P * 0.22 + vec2(-uTime * 0.05, uTime * 0.06);
      float a1 = texture2D(uDet, w1).g, a2 = texture2D(uDet, w2).a;
      vec2 g1 = vec2(texture2D(uDet, w1 + vec2(0.004, 0.0)).g - a1, texture2D(uDet, w1 + vec2(0.0, 0.004)).g - a1);
      vec2 g2 = vec2(texture2D(uDet, w2 + vec2(0.004, 0.0)).a - a2, texture2D(uDet, w2 + vec2(0.0, 0.004)).a - a2);
      vec2 g = (g1 * 0.5 + g2 * 0.5) * 11.0 * (1.0 - smoothstep(120.0, 560.0, length(vViewPosition)));
      normal = normalize(normal + (viewMatrix * vec4(-g.x, 0.0, -g.y, 0.0)).xyz);
    }`);
  };
  mat.customProgramCacheKey = () => 'st-water';
  return mat;
}

// ---- foliage / scatter (instanced). `sway` is how strongly the top of the mesh moves in the wind.
export function makeFoliageMaterial(U, sway, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: opts.double ? THREE.DoubleSide : THREE.FrontSide, flatShading: !!opts.flat });
  mat.userData.sway = { value: sway };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U); sh.uniforms.uSway = mat.userData.sway;
    sh.vertexShader = inject(sh.vertexShader, '#include <common>', 'uniform float uTime; uniform float uSway; varying vec3 vWP;');
    sh.vertexShader = inject(sh.vertexShader, '#include <begin_vertex>', `
    {
      vec3 iw = vec3(0.0);
      #ifdef USE_INSTANCING
      iw = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #endif
      float s = sin(uTime * 1.7 + iw.x * 0.21 + iw.z * 0.17) * 0.55 + sin(uTime * 3.3 + iw.x * 0.7 + iw.z * 0.4) * 0.2;
      float h = max(position.y, 0.0);
      transformed.x += s * uSway * h * h; transformed.z += s * 0.6 * uSway * h * h;
    }`);
    sh.vertexShader = inject(sh.vertexShader, '#include <project_vertex>', `
    {
      vec4 wp4 = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
      wp4 = instanceMatrix * wp4;
      #endif
      vWP = (modelMatrix * wp4).xyz;
    }`, false);
    sh.fragmentShader = inject(sh.fragmentShader, '#include <common>', 'varying vec3 vWP;\n' + FRAG_COMMON);
    sh.fragmentShader = inject(sh.fragmentShader, '#include <color_fragment>', `
    diffuseColor.rgb *= clamp(fogShade(vWP.xz) * 1.02, 0.03, 1.0) * (1.0 - 0.4 * cloudShade(vWP.xz));
    diffuseColor.rgb *= 0.88 + 0.24 * texture2D(uDet, vWP.xz * 0.09).g;`);
  };
  mat.customProgramCacheKey = () => 'st-foliage';
  return mat;
}

// ---- unit & building material. One clone per view so that wheel spin / damage / stun can be per-object uniforms.
export function makeUnitMaterial(U, base) {
  const mat = base.clone();
  mat.userData.u = { uSpin: { value: 0 }, uTrack: { value: 0 }, uDmg: { value: 0 }, uStun: { value: 0 }, uFlash: { value: 0 }, uBuildH: { value: 1e5 }, uGround: { value: 1 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, mat.userData.u);
    sh.vertexShader = inject(sh.vertexShader, '#include <common>', 'attribute vec3 aw; uniform float uSpin; varying vec3 vAw; varying vec3 vOP; varying vec3 vWP;');
    sh.vertexShader = inject(sh.vertexShader, '#include <beginnormal_vertex>', `
    vAw = aw;
    if (aw.z > 0.5 && aw.z < 1.5) { float c = cos(uSpin), s = sin(uSpin); objectNormal.yz = vec2(c * objectNormal.y - s * objectNormal.z, s * objectNormal.y + c * objectNormal.z); }`);
    sh.vertexShader = inject(sh.vertexShader, '#include <begin_vertex>', `
    vOP = transformed;
    if (aw.z > 0.5 && aw.z < 1.5) { float c = cos(uSpin), s = sin(uSpin); vec2 p = transformed.yz - aw.xy; transformed.yz = aw.xy + vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
    vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = inject(sh.fragmentShader, '#include <common>', 'varying vec3 vAw; varying vec3 vOP; varying vec3 vWP; uniform float uTrack, uDmg, uStun, uFlash, uBuildH, uGround;\n' + FRAG_COMMON);
    sh.fragmentShader = inject(sh.fragmentShader, '#include <clipping_planes_fragment>', 'if (vOP.y > uBuildH) discard;', true);
    sh.fragmentShader = inject(sh.fragmentShader, '#include <color_fragment>', `
    float grain = texture2D(uDet, vOP.xz * 0.55 + vOP.y * 0.31).r * 0.6 + texture2D(uDet, vOP.xy * 0.8 + 0.5).a * 0.4;
    diffuseColor.rgb *= 0.78 + 0.4 * grain;
    diffuseColor.rgb *= mix(1.0, clamp(0.62 + vOP.y * 0.16, 0.62, 1.0), uGround);
    if (vAw.z > 1.5) { float tr = step(0.5, fract((vOP.z + uTrack) * 2.4)); diffuseColor.rgb *= 0.55 + 0.45 * tr; }
    diffuseColor.rgb *= 1.0 - uDmg * 0.6 * (0.35 + grain);
    diffuseColor.rgb *= 1.0 - 0.3 * cloudShade(vWP.xz);`);
    sh.fragmentShader = inject(sh.fragmentShader, '#include <roughnessmap_fragment>', 'roughnessFactor = clamp(roughnessFactor * (0.75 + 0.5 * grain) + uDmg * 0.2, 0.2, 1.0);');
    sh.fragmentShader = inject(sh.fragmentShader, '#include <emissivemap_fragment>', `
    totalEmissiveRadiance += vec3(0.25, 0.6, 1.0) * uStun * (0.45 + 0.55 * sin(uTime * 38.0 + vOP.x * 9.0 + vOP.z * 7.0)) * step(0.3, grain);
    totalEmissiveRadiance += vec3(1.0, 0.8, 0.5) * uFlash;
    if (uBuildH < 9999.0) totalEmissiveRadiance += vec3(0.2, 0.7, 1.0) * smoothstep(0.7, 0.0, uBuildH - vOP.y) * 0.9;`);
  };
  mat.customProgramCacheKey = () => 'st-unit';
  return mat;
}

// ------------------------------------------------------------------ sky dome + environment
export class Sky {
  constructor(U) {
    this.U = U;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uSun: U.uSunDir, uTime: U.uTime, uCld: U.uCld, uWind: U.uWind },
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main() { vDir = position; vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }',
      fragmentShader: `
      varying vec3 vDir; uniform vec3 uSun; uniform float uTime; uniform sampler2D uCld; uniform vec2 uWind;
      void main() {
        vec3 d = normalize(vDir); float h = d.y;
        vec3 zen = vec3(0.10, 0.28, 0.66), hor = vec3(0.50, 0.66, 0.84);
        vec3 col = mix(hor, zen, pow(clamp(h, 0.0, 1.0), 0.5));
        col = mix(hor * vec3(0.9, 0.95, 1.0), vec3(0.10, 0.20, 0.30), smoothstep(0.0, -0.5, h));
        float sd = max(dot(d, normalize(uSun)), 0.0);
        col += vec3(1.0, 0.82, 0.55) * (pow(sd, 700.0) * 4.0 + pow(sd, 10.0) * 0.16);
        if (h > 0.0) {
          vec2 p = d.xz / (h + 0.18) * 0.6 + uWind * uTime * 25.0;
          float c = texture2D(uCld, p).r * 0.62 + texture2D(uCld, p * 2.7 + 0.31).g * 0.38;
          float m = smoothstep(0.50, 0.80, c) * smoothstep(0.0, 0.22, h);
          float lit = clamp(0.55 + 0.6 * dot(vec2(d.x, d.z), normalize(uSun.xz + 0.001)) * 0.3 + (1.0 - c) * 0.5, 0.0, 1.0);
          vec3 cc = mix(vec3(0.55, 0.60, 0.70), vec3(1.0, 0.98, 0.95), lit);
          col = mix(col, cc, m * 0.92);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.mat);
    this.mesh.scale.setScalar(2500); this.mesh.frustumCulled = false; this.mesh.renderOrder = -10;
  }
  // image-based lighting from the sky for metallic reflections
  buildEnvironment(renderer, scene) {
    try {
      const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene(); const m = this.mesh.clone(); es.add(m);
      const rt = pm.fromScene(es, 0.04, 1, 6000); scene.environment = rt.texture; pm.dispose(); return true;
    } catch (err) { console.warn('env map failed', err); return false; }
  }
}

// ------------------------------------------------------------------ cloud sprites (soft puffs that drift over the map)
export class Clouds {
  constructor(scene, U, mapSize, count) {
    this.U = U; this.size = mapSize;
    const r = rand32(4242), clusters = Math.floor(count / 7);
    const pos = [], scl = [], seed = [], tone = [];
    for (let c = 0; c < clusters; c++) {
      const cx = r() * (mapSize + 700) - 350, cz = r() * (mapSize + 700) - 350, cy = 120 + r() * 70, big = 0.7 + r() * 0.9;
      for (let k = 0; k < 7; k++) {
        pos.push(cx + (r() - 0.5) * 70 * big, cy + (r() - 0.5) * 8, cz + (r() - 0.5) * 40 * big);
        scl.push((36 + r() * 40) * big); seed.push(r()); tone.push(r());
      }
    }
    const g = new THREE.InstancedBufferGeometry(); const q = new THREE.PlaneGeometry(1, 1);
    g.index = q.index; g.setAttribute('position', q.getAttribute('position')); g.setAttribute('uv', q.getAttribute('uv'));
    g.setAttribute('aPos', new THREE.InstancedBufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('aScale', new THREE.InstancedBufferAttribute(new Float32Array(scl), 1));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seed), 1));
    g.setAttribute('aTone', new THREE.InstancedBufferAttribute(new Float32Array(tone), 1));
    g.instanceCount = scl.length;
    const area = mapSize + 700;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uTime: U.uTime, uCld: U.uCld, uWind: U.uWind, uArea: { value: area }, uOrg: { value: -350 }, uSun: U.uSunDir },
      vertexShader: `
      attribute vec3 aPos; attribute float aScale; attribute float aSeed; attribute float aTone;
      uniform float uTime; uniform vec2 uWind; uniform float uArea; uniform float uOrg;
      varying vec2 vUv; varying float vSeed; varying float vTone; varying float vFade;
      void main() {
        vec3 c = aPos; vec2 w = c.xz - uOrg + uWind * uTime * 420.0; w = mod(w, uArea); c.xz = w + uOrg;
        vec4 mv = viewMatrix * vec4(c, 1.0); float dist = length(mv.xyz);
        mv.xy += position.xy * aScale;
        gl_Position = projectionMatrix * mv; vUv = uv; vSeed = aSeed; vTone = aTone;
        float edge = min(min(w.x, uArea - w.x), min(w.y, uArea - w.y));
        vFade = smoothstep(120.0, 300.0, dist) * smoothstep(0.0, 120.0, edge);
      }`,
      fragmentShader: `
      uniform sampler2D uCld; uniform vec3 uSun; varying vec2 vUv; varying float vSeed; varying float vTone; varying float vFade;
      void main() {
        vec2 p = vUv - 0.5; float d = length(p) * 2.0;
        float n = texture2D(uCld, vUv * 0.6 + vSeed * 7.0).r * 0.6 + texture2D(uCld, vUv * 1.7 + vSeed * 3.0).g * 0.4;
        float a = smoothstep(1.0, 0.25, d + (n - 0.5) * 0.9);
        float top = clamp(vUv.y * 1.25 - 0.1, 0.0, 1.0);
        vec3 col = mix(vec3(0.60, 0.65, 0.74), vec3(1.0, 0.99, 0.96), top * 0.8 + 0.2 + (n - 0.5) * 0.3);
        gl_FragColor = vec4(col, a * 0.82 * vFade);
        if (gl_FragColor.a < 0.01) discard;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 6;
    scene.add(this.mesh);
  }
}

// ------------------------------------------------------------------ ground scatter
function jitterGeo(geo, amt, seed) {
  const r = rand32(seed), p = geo.getAttribute('position'), map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3);
    let o = map.get(k); if (!o) { o = [(r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt]; map.set(k, o); }
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  return geo;
}
// merge parts [{geo, pos, rot, scl, color}] into one non-indexed colored geometry
function mergeParts(parts) {
  const P = [], N = [], C = []; const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), nm = new THREE.Matrix3(), col = new THREE.Color();
  for (const o of parts) {
    const g = (o.geo.index ? o.geo.toNonIndexed() : o.geo.clone());
    e.set(o.rot ? o.rot[0] : 0, o.rot ? o.rot[1] : 0, o.rot ? o.rot[2] : 0); q.setFromEuler(e);
    m.compose(new THREE.Vector3(...(o.pos || [0, 0, 0])), q, new THREE.Vector3(...(o.scl || [1, 1, 1]))); g.applyMatrix4(m); g.computeVertexNormals();
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i));
      col.set(o.color); const t = o.grad ? clamp((p.getY(i) - o.grad[0]) / (o.grad[1] - o.grad[0]), 0, 1) : 0; const k = o.grad ? 0.55 + 0.6 * t : 1;
      C.push(col.r * k, col.g * k, col.b * k);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return out;
}
function grassGeo() {
  const r = rand32(99), P = [], C = [], N = [];
  for (let b = 0; b < 7; b++) {
    const a = r() * 6.283, off = 0.25 * r(), bx = Math.cos(a) * off, bz = Math.sin(a) * off, h = 0.55 + r() * 0.55, w = 0.07 + r() * 0.05, lean = (r() - 0.5) * 0.5, ya = r() * 3.14;
    const cx = Math.cos(ya), sx = Math.sin(ya);
    const tip = [bx + lean * cx, h, bz + lean * sx], l = [bx - w * cx, 0, bz - w * sx], rr = [bx + w * cx, 0, bz + w * sx];
    for (const [v, k] of [[l, 0.75], [rr, 0.75], [tip, 1.25]]) { P.push(...v); C.push(k, k, k); N.push(0, 1, 0); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return g;
}
function pineGeo() {
  const cone = new THREE.ConeGeometry(1, 1, 7), cyl = new THREE.CylinderGeometry(0.22, 0.34, 1, 6);
  const parts = [{ geo: cyl, pos: [0, 0.9, 0], scl: [1, 1.8, 1], color: 0x5b4330 }];
  const greens = [0x2f5a2f, 0x3a6a35, 0x477a3b, 0x56883f];
  for (let i = 0; i < 4; i++) parts.push({ geo: cone, pos: [0, 1.7 + i * 1.25, 0], scl: [2.1 - i * 0.42, 2.3, 2.1 - i * 0.42], color: greens[i], grad: [0, 8] });
  parts.push({ geo: cone, pos: [0, 6.7, 0], scl: [0.5, 1.3, 0.5], color: 0x5d8d44 });
  return mergeParts(parts);
}
function palmGeo() {
  const cyl = new THREE.CylinderGeometry(0.16, 0.26, 1, 5), cone = new THREE.ConeGeometry(0.5, 1, 5);
  const parts = [{ geo: cyl, pos: [0, 1.0, 0], rot: [0, 0, 0.08], scl: [1, 2.1, 1], color: 0x7a634a }, { geo: cyl, pos: [0.22, 3.1, 0], rot: [0, 0, 0.2], scl: [0.8, 2.1, 0.8], color: 0x7a634a }];
  for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283; parts.push({ geo: cone, pos: [0.5 + Math.cos(a) * 0.9, 4.2 - 0.2, Math.sin(a) * 0.9], rot: [Math.sin(a) * 1.15, 0, -Math.cos(a) * 1.15], scl: [0.8, 2.4, 0.15], color: i & 1 ? 0x4f8a3a : 0x5e9a44, grad: [3.2, 4.6] }); }
  return mergeParts(parts);
}
function bushGeo() { return mergeParts([{ geo: jitterGeo(new THREE.IcosahedronGeometry(1, 1), 0.35, 5), pos: [0, 0.55, 0], scl: [1.2, 0.8, 1.2], color: 0x486d33, grad: [0, 1.3] }, { geo: jitterGeo(new THREE.IcosahedronGeometry(0.7, 1), 0.25, 6), pos: [0.6, 0.35, 0.3], scl: [1, 0.8, 1], color: 0x547a38, grad: [0, 1] }]); }
function rockGeo(seed) { return mergeParts([{ geo: jitterGeo(new THREE.IcosahedronGeometry(1, 1), 0.5, seed), pos: [0, 0.35, 0], scl: [1, 0.7, 1], color: 0x8a8883, grad: [-0.5, 1.2] }]); }

export class Scatter {
  constructor(scene, sim, U, baseColAt, quality) {
    const map = sim.map; this.map = map; this.scene = scene; this.chunks = []; this.quality = quality;
    const mats = {
      grass: makeFoliageMaterial(U, 0.55, { double: true }), tree: makeFoliageMaterial(U, 0.018, { flat: true }), rock: makeFoliageMaterial(U, 0, { flat: true }), bush: makeFoliageMaterial(U, 0.2, {}),
    };
    this.geo = { grass: grassGeo(), pine: pineGeo(), palm: palmGeo(), bush: bushGeo(), rock1: rockGeo(1), rock2: rockGeo(2), rock3: rockGeo(3) };
    this.matFor = { grass: mats.grass, pine: mats.tree, palm: mats.tree, bush: mats.bush, rock1: mats.rock, rock2: mats.rock, rock3: mats.rock };
    const CH = 96, nc = Math.ceil(map.size / CH), buckets = new Map();
    const push = (type, x, z, y, sc, yaw, col, tilt) => {
      const key = type + ':' + Math.floor(x / CH) + ':' + Math.floor(z / CH);
      let b = buckets.get(key); if (!b) { b = { type, cx: (Math.floor(x / CH) + 0.5) * CH, cz: (Math.floor(z / CH) + 0.5) * CH, items: [] }; buckets.set(key, b); }
      b.items.push([x, y, z, sc, yaw, col, tilt || 0]);
    };
    const r = rand32((sim.cfg.seed | 0) * 31 + 7), n = map.n;
    const hv = (x, z) => map.hAt(x, z);
    const slopeAt = (x, z) => { const dx = hv(x + 2, z) - hv(x - 2, z), dz = hv(x, z + 2) - hv(x, z - 2); return Math.sqrt(dx * dx + dz * dz) / 4; };
    const nearOil = (x, z, rr) => { for (const o of map.oil) { const dx = o.x - x, dz = o.z - z; if (dx * dx + dz * dz < rr * rr) return true; } return false; };
    const forest = (x, z) => { const a = Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017 - 0.4) + Math.sin(x * 0.047 + z * 0.039) * 0.5 + Math.sin(z * 0.061 - x * 0.03 + 2.0) * 0.3; return a; };
    const free = (x, z) => { const c = map.cellOf(x, z); if (c < 0) return false; if (map.occ[c]) return false; return true; };
    const sp = quality === 'high' ? 1.8 : 3.2, tsp = quality === 'high' ? 8 : 11, rsp = 9;
    const col = new THREE.Color();
    // grass
    for (let z = 3; z < map.size - 3; z += sp) for (let x = 3; x < map.size - 3; x += sp) {
      const px = x + (r() - 0.5) * sp, pz = z + (r() - 0.5) * sp, h = hv(px, pz);
      if (h < 1.7 || h > 13) continue;
      const s = slopeAt(px, pz); if (s > 0.5) continue;
      const dens = clamp(0.35 + 0.65 * sstep(1.7, 3.2, h) * (1 - sstep(8, 13, h)), 0, 1) * (1 - sstep(0.3, 0.5, s));
      if (r() > dens * 0.9) continue; if (!free(px, pz) || nearOil(px, pz, 6)) continue;
      baseColAt(px, pz, col); const k = 0.95 + r() * 0.5;
      push('grass', px, pz, h, 0.7 + r() * 0.9, r() * 6.283, [col.r * k * 1.25, col.g * k * 1.3, col.b * k * 1.05]);
    }
    // trees, bushes, palms
    for (let z = 5; z < map.size - 5; z += tsp) for (let x = 5; x < map.size - 5; x += tsp) {
      const px = x + (r() - 0.5) * tsp * 0.9, pz = z + (r() - 0.5) * tsp * 0.9, h = hv(px, pz); const s = slopeAt(px, pz);
      if (h < 0.9 || s > 0.42 || !free(px, pz) || nearOil(px, pz, 10)) continue;
      const c = map.cellOf(px, pz); if (map.bld && map.bld[c] && h > 1.6 && h < 5.5 && r() < 0.8) continue;
      const f = forest(px, pz);
      if (h < 2.7) { if (h > 1.1 && r() < 0.16) push('palm', px, pz, h - 0.1, 0.9 + r() * 0.5, r() * 6.283, [1, 1, 1], (r() - 0.5) * 0.15); }
      else if (h < 18 && f > 0.55 && r() < 0.85) push('pine', px, pz, h - 0.15, 0.8 + r() * 0.7, r() * 6.283, [0.9 + r() * 0.2, 0.9 + r() * 0.2, 0.9 + r() * 0.2]);
      else if (h < 14 && r() < 0.07) push('bush', px, pz, h, 0.8 + r() * 0.9, r() * 6.283, [0.8 + r() * 0.4, 0.9 + r() * 0.3, 0.8 + r() * 0.3]);
    }
    // rocks: dense on steep ground, sparse elsewhere
    for (let z = 3; z < map.size - 3; z += rsp * 0.6) for (let x = 3; x < map.size - 3; x += rsp * 0.6) {
      const px = x + (r() - 0.5) * rsp, pz = z + (r() - 0.5) * rsp, h = hv(px, pz); if (h < 0.5) continue;
      const s = slopeAt(px, pz); const p = 0.03 + sstep(0.25, 0.6, s) * 0.55 + sstep(12, 24, h) * 0.2;
      if (r() > p * 0.45 || !free(px, pz) || nearOil(px, pz, 7)) continue;
      const g = 0.78 + r() * 0.4; push('rock' + (1 + Math.floor(r() * 3)), px, pz, h - 0.2, (0.5 + r() * r() * 2.3) * (s > 0.4 ? 1.2 : 1), r() * 6.283, [g, g * 0.98, g * 0.94], 0);
    }
    const dummy = new THREE.Object3D();
    for (const b of buckets.values()) {
      const geo = this.geo[b.type], im = new THREE.InstancedMesh(geo, this.matFor[b.type], b.items.length);
      im.castShadow = false; im.receiveShadow = false;
      b.items.forEach((it, i) => {
        dummy.position.set(it[0], it[1], it[2]); dummy.rotation.set(it[6], it[4], it[6] * 0.7); dummy.scale.setScalar(it[3]); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
        col.setRGB(it[5][0], it[5][1], it[5][2]); im.setColorAt(i, col);
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere(); scene.add(im);
      this.chunks.push({ mesh: im, cx: b.cx, cz: b.cz, grass: b.type === 'grass', type: b.type });
    }
    this.count = buckets.size;
  }
  update(cam) {
    const reach = 150 + cam.dist * 0.45, show = cam.dist < 210;
    for (const c of this.chunks) {
      if (c.grass) { const dx = c.cx - cam.x, dz = c.cz - cam.z; c.mesh.visible = show && dx * dx + dz * dz < (reach + 70) * (reach + 70); }
    }
  }
  dispose() { for (const c of this.chunks) { this.scene.remove(c.mesh); c.mesh.dispose(); } this.chunks.length = 0; }
}

// ------------------------------------------------------------------ animation helpers
export const WHEEL_R = { scout: 0.62, mlrs: 0.75, tel: 0.8, ewtruck: 0.7, sapper: 0.3 };
const LEGGED = { rifleman: 0.85, at: 0.85, manpads: 0.85, engineer: 0.85, robot: 0.75, repair: 0.5, walker: 0.55, ewdog: 0.9 };
const TRACKED = new Set(['ifv', 'mbt', 'heavy', 'aa', 'sph']);
const PROPS = { heli: 40, uav: 50 };

// per-view animation state is stored on `v.an`
export function animateUnit(v, e, d, dt, time, speed, firing, lod = 0, ground = null) {
  const an = v.an || (v.an = { phase: 0, spin: 0, track: 0, bank: 0, lastYaw: v.yaw, recoil: 0, leg: 0 });
  const m = v.parts, base = d.base;
  const mov = e.moving ? 1 : 0;
  an.leg += (mov - an.leg) * Math.min(1, dt * 8);
  if (LEGGED[base] !== undefined) {
    if (hasIK(v, base)) animateLegsIK(v, an, base, dt, speed, lod === 0 ? ground : null);      // articulated IK walker
    else {
      const stride = LEGGED[base] * 1.0; an.phase += dt * speed * (base === 'walker' ? 0.9 : base === 'ewdog' ? 1.7 : 1.6);
      const s = Math.sin(an.phase) * stride * an.leg, c = Math.sin(an.phase + Math.PI) * stride * an.leg;
      if (m.legL) m.legL.rotation.x = s; if (m.legR) m.legR.rotation.x = c;
      if (m.legFL) { m.legFL.rotation.x = s; m.legBR.rotation.x = s; m.legFR.rotation.x = c; m.legBL.rotation.x = c; }
      const bob = Math.abs(Math.sin(an.phase)) * (base === 'walker' ? 0.28 : 0.1) * an.leg;
      v.hull.position.y = bob;
      for (const k in m) if (k !== 'legL' && k !== 'legR' && !/^leg[FB]/.test(k)) m[k].position.y = (v.rp[k] ? v.rp[k][1] : 0) + bob;
      v.hull.rotation.z = Math.sin(an.phase) * 0.05 * an.leg;
    }
    if (v.turret && base === 'ewdog' && !e.target) v.turret.rotation.y += Math.sin(time * 0.9 + e.id) * 0.55;   // idle radar-style scan
  }
  if (WHEEL_R[base]) { an.spin += (e.vx * e.dirx + e.vz * e.dirz) * dt / WHEEL_R[base]; if (v.mat) v.mat.userData.u.uSpin.value = -an.spin; }
  if (TRACKED.has(base) && v.mat) { an.track += (e.vx * e.dirx + e.vz * e.dirz) * dt; v.mat.userData.u.uTrack.value = an.track; v.mat.userData.u.uSpin.value = -an.track / 0.42; }   // road wheels turn with the belt
  // recoil of the turret
  if (v.turret) {
    const target = e.flash > 0 && d.weapons.length ? Math.min(1, e.flash / 3) : 0;
    an.recoil += (target - an.recoil) * Math.min(1, dt * (target > an.recoil ? 40 : 10));
    const k = an.recoil * (0.18 + d.radius * 0.12), pv = v.rp.turret || [0, 0, 0];
    v.turret.position.set(pv[0] - Math.sin(v.tyaw) * k, pv[1], pv[2] - Math.cos(v.tyaw) * k);
  }
  if (e.air) {
    // hover bob, bank into turns, pitch with speed
    let dy = v.yaw - an.lastYaw; while (dy > Math.PI) dy -= 6.283; while (dy < -Math.PI) dy += 6.283; an.lastYaw = v.yaw;
    const rate = dy / Math.max(dt, 1e-3); an.bank += (clamp(rate * 0.35, -0.6, 0.6) - an.bank) * Math.min(1, dt * 4);
    v.obj.rotation.z = -an.bank * (base === 'heli' || base === 'uav' || base === 'fpv' ? 0.6 : 1);
    v.obj.rotation.x = e.moving ? (base === 'heli' ? 0.2 : 0.06) : 0;
  }
  // rotors / props / dishes
  const pr = PROPS[base];
  for (const k in m) {
    const mesh = m[k];
    if (/^propz/.test(k)) mesh.rotation.z += dt * 70;
    else if (/^prop/.test(k)) mesh.rotation.y += dt * 90;
    else if (k === 'rotor' && pr) { if (base === 'heli') mesh.rotation.y += dt * 40; else mesh.rotation.z += dt * 50; }
    else if (k === 'rotor2' && base === 'heli') mesh.rotation.x += dt * 40;
    else if (k === 'rotor' && (base === 'ewdog' || base === 'ewtruck' || base === 'ewplane')) mesh.rotation.y += dt * 4;
    else if (k === 'rotor' && base === 'fpv') mesh.rotation.y += dt * 60;
  }
  animateBody(v, e, d, dt, speed, time, firing);
}
