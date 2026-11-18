// 3D weather effects driven by the simulation's weather (sim.wx.kind: 0 clear, 1 overcast, 2 fog, 3 rain, 4 storm) and the biome:
// rain streaks, snow / blizzard, ash fall, dust and sandstorms, ground mist, wet ground and settling snow, lightning with thunder, wind-driven particles.
import * as THREE from 'three';
import { sfx } from './fx.js';

const rand = (s) => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);

// what a weather kind looks like in each biome: precipitation amounts, overcast, ground wetness, wind (m/s) and lightning
const PRE = { rain: 'rain', flake: 'flake', dust: 'dust', mist: 'mist' };
function target(kind, biome) {
  const T = { over: 0, wet: 0, snow: 0, rain: 0, flake: 0, dust: 0, mist: 0, wind: 2, flash: 0, ash: 0, haze: 0 };
  const b = biome;
  switch (kind) {
    case 1: T.over = 0.62; T.wind = 4; if (b === 'desert') { T.dust = 0.18; T.haze = 0.5; T.over = 0.35; } else if (b === 'arctic') { T.flake = 0.2; T.over = 0.75; } else if (b === 'volcanic') { T.flake = 0.3; T.ash = 1; T.over = 0.85; } break;
    case 2: T.over = 0.35; T.mist = 0.9; T.wind = 1; if (b === 'volcanic') { T.flake = 0.15; T.ash = 1; } break;
    case 3:
      T.over = 0.85; T.wind = 6;
      if (b === 'arctic') { T.flake = 0.75; T.snow = 0.6; T.mist = 0.25; }
      else if (b === 'desert') { T.dust = 0.65; T.haze = 0.8; T.over = 0.6; T.wind = 16; }
      else if (b === 'volcanic') { T.flake = 0.8; T.ash = 1; T.over = 0.95; T.wind = 8; }
      else { T.rain = b === 'jungle' ? 0.9 : 0.65; T.wet = 1; T.mist = 0.2; }
      break;
    case 4:
      T.over = 1; T.wind = 14; T.flash = 1;
      if (b === 'arctic') { T.flake = 1; T.snow = 0.9; T.wind = 26; T.flash = 0.0; T.mist = 0.4; }
      else if (b === 'desert') { T.dust = 1; T.haze = 1; T.wind = 34; T.flash = 0.0; }
      else if (b === 'volcanic') { T.flake = 1; T.ash = 1; T.flash = 1; T.wind = 18; }
      else { T.rain = 1; T.wet = 1; T.wind = 20; T.mist = 0.3; }
      break;
    default: if (b === 'desert') { T.haze = 0.18; T.dust = 0.04; } else if (b === 'volcanic') { T.flake = 0.12; T.ash = 1; }
  }
  return T;
}
// fog / sky tint colour per particle type (blended into the scene fog while it is active)
const TINT = { rain: [0.52, 0.57, 0.64], snow: [0.86, 0.9, 0.96], dust: [0.78, 0.62, 0.40], ash: [0.30, 0.26, 0.25], mist: [0.74, 0.78, 0.82] };

const VS_LINE = `
attribute vec4 aR; attribute float aE;
uniform vec3 uC; uniform float uT, uBox, uH, uAmt, uLen; uniform vec3 uVel;
varying float vA;
void main() {
  vec3 r = aR.xyz; float on = step(aR.w, uAmt);
  float fy = fract(r.y + uVel.y * uT / uH);
  vec3 p;
  p.x = uC.x + (fract(r.x + uVel.x * uT / uBox - uC.x / uBox) - 0.5) * uBox;
  p.z = uC.z + (fract(r.z + uVel.z * uT / uBox - uC.z / uBox) - 0.5) * uBox;
  p.y = uC.y + fy * uH;
  p -= normalize(uVel) * uLen * aE;
  float rr = length(p.xz - uC.xz);
  vA = on * (1.0 - smoothstep(uBox * 0.32, uBox * 0.5, rr)) * smoothstep(0.0, 0.06, fy) * smoothstep(1.0, 0.85, fy) * (1.0 - 0.75 * aE);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  if (on < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const FS_LINE = `precision mediump float; uniform vec3 uCol; uniform float uAlpha; varying float vA; void main() { gl_FragColor = vec4(uCol, vA * uAlpha); }`;
const VS_PT = `
attribute vec4 aR;
uniform vec3 uC; uniform float uT, uBox, uH, uAmt, uSize, uScale, uSway; uniform vec3 uVel;
varying float vA; varying float vS;
void main() {
  vec3 r = aR.xyz; float on = step(aR.w, uAmt);
  float fy = fract(r.y + uVel.y * uT / uH);
  vec3 p;
  p.x = uC.x + (fract(r.x + uVel.x * uT / uBox - uC.x / uBox) - 0.5) * uBox + sin(uT * 1.3 + r.y * 40.0) * uSway;
  p.z = uC.z + (fract(r.z + uVel.z * uT / uBox - uC.z / uBox) - 0.5) * uBox + cos(uT * 1.1 + r.x * 40.0) * uSway;
  p.y = uC.y + fy * uH;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float rr = length(p.xz - uC.xz);
  vA = on * (1.0 - smoothstep(uBox * 0.32, uBox * 0.5, rr)) * smoothstep(0.0, 0.06, fy) * smoothstep(1.0, 0.85, fy);
  vS = 0.6 + 0.8 * fract(r.x * 7.0 + r.z * 3.0);
  gl_PointSize = max(1.6, uSize * vS * uScale / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
  if (on < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const FS_PT = `precision mediump float; uniform vec3 uCol; uniform float uAlpha; uniform float uSoft; varying float vA; varying float vS;
void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, uSoft, d); gl_FragColor = vec4(uCol, a * vA * uAlpha); if (gl_FragColor.a < 0.004) discard; }`;

class Layer {
  constructor(scene, kind, n, o) {
    this.kind = kind; this.n = n; this.o = o; this.amt = 0;
    const r = rand(o.seed), lines = kind === 'line', verts = lines ? n * 2 : n;
    const aR = new Float32Array(verts * 4), aE = new Float32Array(verts);
    for (let i = 0; i < n; i++) {
      const x = r(), y = r(), z = r(), w = r();
      for (let k = 0; k < (lines ? 2 : 1); k++) { const v = lines ? i * 2 + k : i; aR.set([x, y, z, w], v * 4); aE[v] = k; }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3)); g.setAttribute('aR', new THREE.BufferAttribute(aR, 4));
    if (lines) g.setAttribute('aE', new THREE.BufferAttribute(aE, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    this.u = { uC: { value: new THREE.Vector3() }, uT: { value: 0 }, uBox: { value: 120 }, uH: { value: o.h || 70 }, uAmt: { value: 0 }, uLen: { value: o.len || 1.5 }, uVel: { value: new THREE.Vector3(0, -10, 0) }, uCol: { value: new THREE.Color(o.col) }, uAlpha: { value: o.alpha }, uSize: { value: o.size || 0.2 }, uScale: { value: 800 }, uSway: { value: o.sway || 0 }, uSoft: { value: o.soft || 0.3 } };
    const m = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: lines ? VS_LINE : VS_PT, fragmentShader: lines ? FS_LINE : FS_PT, transparent: true, depthWrite: false, fog: false, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.obj = lines ? new THREE.LineSegments(g, m) : new THREE.Points(g, m);
    this.obj.frustumCulled = false; this.obj.renderOrder = 8; this.obj.visible = false; scene.add(this.obj);
  }
}

export class Weather {
  constructor(r, level) {
    this.r = r; this.level = level; this.sim = r.sim; this.biome = ((r.biomeName || '') + '').toLowerCase();
    this.k = { over: 0, wet: 0, snow: 0, rain: 0, flake: 0, dust: 0, mist: 0, wind: 2, flash: 0, ash: 0, haze: 0 };
    this.bolts = []; this.timer = 4; this.fl = 0; this.thunder = []; this.t = 0; this.rainK = 0;
    if (!level) return;
    const hi = level >= 2 && !r.touch, N = (a, b) => (hi ? a : b);
    const sc = r.scene;
    this.rain = new Layer(sc, 'line', N(3400, 1400), { seed: 11, col: 0xbcd0e8, alpha: 0.42, len: 1.8 });
    this.dust = new Layer(sc, 'line', N(1900, 800), { seed: 23, col: 0xcaa874, alpha: 0.36, len: 5 });
    this.flake = new Layer(sc, 'pt', N(3000, 1300), { seed: 37, col: 0xffffff, alpha: 0.95, size: 0.2, sway: 1.2, soft: 0.25 });
    this.mist = new Layer(sc, 'pt', N(90, 50), { seed: 51, col: 0xc9d2da, alpha: 0.16, size: 34, h: 16, soft: 0.0 });
    this.layers = [this.rain, this.dust, this.flake, this.mist];
    this.boltMat = new THREE.LineBasicMaterial({ color: 0xd8e6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.boltGroup = new THREE.Group(); sc.add(this.boltGroup);
  }
  get on() { return this.level > 0; }
  // jagged bolt with a few branches
  strike(x, z, top) {
    const rn = rand((Math.random() * 1e9) | 0), pts = [], h = this.sim.map.hAt ? Math.max(0, this.sim.map.hAt(x, z)) : 0;
    const walk = (x0, y0, z0, steps, dx, dz, depth) => {
      let x1 = x0, y1 = y0, z1 = z0;
      for (let i = 0; i < steps; i++) {
        const nx = x1 + (rn() - 0.5) * 16 + dx, nz = z1 + (rn() - 0.5) * 16 + dz, ny = y1 - (top - h) / 14 * (0.6 + rn() * 0.8);
        pts.push(x1, y1, z1, nx, Math.max(h, ny), nz); x1 = nx; y1 = Math.max(h, ny); z1 = nz; if (y1 <= h) break;
        if (depth < 2 && rn() < 0.16) walk(x1, y1, z1, 3 + (rn() * 4 | 0), (rn() - 0.5) * 14, (rn() - 0.5) * 14, depth + 1);
      }
    };
    walk(x, top, z, 16, 0, 0, 0);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    const l = new THREE.LineSegments(g, this.boltMat.clone()); l.frustumCulled = false; l.renderOrder = 9; this.boltGroup.add(l);
    this.bolts.push({ l, t: 0 });
  }
  update(dt, kind) {
    this.t += dt; const r = this.r, k = this.k;
    const forced = this.sim.cfg && this.sim.cfg.debug && this.sim.wx && this.sim.wx.kind === kind;   // debug weather lives in sim.wx too
    const T = target(kind, this.biome), a = Math.min(1, dt * 0.35);
    for (const key in T) k[key] += (T[key] - k[key]) * (key === 'flash' ? Math.min(1, dt * 2) : a);
    const U = r.U; if (U) { U.uOver.value = k.over; U.uWet.value = k.wet * 0.95 + (this.rainK = this.rainK + (k.rain - this.rainK) * Math.min(1, dt * 0.02)) * 0.05; U.uSnow.value = Math.min(0.85, U.uSnow.value + (T.snow > 0.01 ? k.snow : -0.35) * dt * (T.snow > 0.01 ? 0.012 : 0.01)); if (U.uSnow.value < 0) U.uSnow.value = 0; }
    // keep the sky horizon in step with the heaviest particle tint
    if (r.skyObj && r.wxBase) {
      const hor = r.skyObj.mat.uniforms.uHor.value; let tr = 0, tg = 0, tb = 0, w = 0;
      const add = (c, v) => { if (v > 0.001) { tr += c[0] * v; tg += c[1] * v; tb += c[2] * v; w += v; } };
      add(TINT.rain, k.rain * 0.8); add(TINT.snow, k.flake * (1 - k.ash) * 0.8); add(TINT.ash, k.flake * k.ash * 0.9); add(TINT.dust, Math.max(k.dust, k.haze * 0.5) * 0.9); add(TINT.mist, k.mist * 0.7);
      const m = Math.min(0.85, w), base = r.wxBase.hor; if (w > 0) { tr /= w; tg /= w; tb /= w; }
      hor.set(base[0] + ((w > 0 ? tr : base[0]) - base[0]) * m, base[1] + ((w > 0 ? tg : base[1]) - base[1]) * m, base[2] + ((w > 0 ? tb : base[2]) - base[2]) * m);
      this.tint = w > 0 ? [tr, tg, tb, m] : null;
    }
    if (!this.on) return;
    // particle layers around the camera's focus point
    const cam = r.cam, h = this.sim.map.hAt ? Math.max(0, this.sim.map.hAt(cam.x, cam.z)) : 0, box = Math.max(110, Math.min(420, cam.dist * 1.25));
    const wd = r.U ? r.U.uWind.value : { x: 1, y: 0.4 }, wl = Math.hypot(wd.x, wd.y) || 1, wx = wd.x / wl, wz = wd.y / wl, ws = k.wind;
    const pxH = r.renderer.domElement.height, scale = pxH * 0.5 / Math.tan(r.camera.fov * Math.PI / 360);
    const setL = (L, amt, vel, extra) => {
      L.amt = amt; const vis = amt > 0.012; L.obj.visible = vis; if (!vis) return;
      const u = L.u; u.uC.value.set(cam.x, h, cam.z); u.uT.value = this.t; u.uBox.value = box; u.uAmt.value = Math.min(1, amt); u.uVel.value.copy(vel); u.uScale.value = scale; if (extra) extra(u);
    };
    const light = this.level < 2 ? 0.7 : 1;
    setL(this.rain, k.rain * light, new THREE.Vector3(wx * ws * 0.5, -58, wz * ws * 0.5), (u) => { u.uLen.value = 1.4 + box * 0.012; u.uAlpha.value = 0.38; u.uH.value = 60 + box * 0.25; });
    setL(this.dust, k.dust * light, new THREE.Vector3(wx * ws * 1.5, -1.2, wz * ws * 1.5), (u) => { u.uLen.value = 3 + ws * 0.22; u.uAlpha.value = 0.3 + 0.2 * k.dust; u.uH.value = 24 + box * 0.1; });
    const ashy = k.ash > 0.5;
    setL(this.flake, k.flake * light, new THREE.Vector3(wx * ws * 0.7, ashy ? -3.2 : -5.5 - ws * 0.05, wz * ws * 0.7), (u) => { u.uCol.value.setHex(ashy ? 0x4c4846 : 0xffffff); u.uSize.value = ashy ? 0.22 : 0.19; u.uAlpha.value = ashy ? 0.8 : 0.95; u.uH.value = 40 + box * 0.2; u.uSway.value = ashy ? 1.0 : 1.2 + ws * 0.04; });
    setL(this.mist, k.mist, new THREE.Vector3(wx * 1.2, 0, wz * 1.2), (u) => { u.uSize.value = 30 + box * 0.12; u.uCol.value.setHex(0xc9d2da); u.uC.value.y = h + 3; u.uAlpha.value = 0.13; });
    if (k.haze > 0.02) { /* hazy sand-coloured air: handled through the sky/fog tint above */ }
    // lightning + thunder
    this.fl = Math.max(0, this.fl - dt * 4.5);
    if (k.flash > 0.5 && this.level >= 2) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 2.5 + Math.random() * 6;
        const ang = Math.random() * Math.PI * 2, dist = 30 + Math.random() * 190, x = cam.x + Math.cos(ang) * dist, z = cam.z + Math.sin(ang) * dist;
        this.strike(x, z, 150 + Math.random() * 40); this.fl = 1; this.thunder.push({ t: dist / 340 + 0.15, v: Math.max(0.2, 1 - dist / 260) });
      }
    }
    for (let i = this.thunder.length - 1; i >= 0; i--) { const q = this.thunder[i]; q.t -= dt; if (q.t <= 0) { sfx(q.v > 0.6 ? 'big' : 'boom', 0.35 * q.v); this.thunder.splice(i, 1); } }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]; b.t += dt; const f = b.t < 0.08 ? 1 : b.t < 0.14 ? 0.15 : b.t < 0.2 ? 0.9 : Math.max(0, 1 - (b.t - 0.2) / 0.25);
      b.l.material.opacity = f; if (b.t > 0.45) { this.boltGroup.remove(b.l); b.l.geometry.dispose(); b.l.material.dispose(); this.bolts.splice(i, 1); }
    }
    if (this.fl > 0) { const f = this.fl * (0.55 + 0.45 * Math.sin(this.t * 90)); if (r.hemi) r.hemi.intensity += f * 2.2; if (r.sun) r.sun.intensity += f * 1.2; }
  }
  dispose() { if (!this.layers) return; for (const L of this.layers) { L.obj.geometry.dispose(); L.obj.material.dispose(); r_remove(this.r.scene, L.obj); } }
}
function r_remove(scene, o) { scene.remove(o); }
