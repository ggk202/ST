// three.js renderer: terrain, entity views, effects, camera and screen-space picking.
import { Craters } from './decals.js';
import { buildProjModels, projKind } from './projectile-gfx.js';
import * as THREE from 'three';
import { CELL, DEFS, PLAYER_COLORS, UNITS } from './sim/defs.js';
import { GROUND_PHASES } from './sim/airops.js';
const PIP_GEO = new THREE.OctahedronGeometry(0.5), PIP_MAT = new THREE.MeshBasicMaterial({ color: 0xffd24a });
const CANOPY_GEO = new THREE.SphereGeometry(3.4, 12, 6, 0, Math.PI * 2, 0, 1.25), CANOPY_MAT = new THREE.MeshStandardMaterial({ color: 0xd8d2b0, roughness: 0.9, side: THREE.DoubleSide });
import { AirfieldGfx } from './airfield-gfx.js';
import { updateStores, CrewPool } from './aircraft-gfx.js';
import { makeModel, modelMaterial } from './models.js';
import { Fx, sfx } from './fx.js';
import { makeDetailTexture, makeCloudTexture, makeUniforms, patchTerrain, patchWater, makeUnitMaterial, Sky, Clouds, Scatter, animateUnit } from './gfx.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const hash = (x, y) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export class Renderer {
  constructor(canvas, sim, local, opts = {}) {
    this.canvas = canvas; this.sim = sim; this.local = local; this.opts = opts;
    this.team = sim.players[local].team;
    const r = this.renderer = Renderer.gl || (Renderer.gl = new THREE.WebGLRenderer({ canvas, antialias: !opts.touch, powerPreference: 'high-performance' }));
    modelMaterial.needsUpdate = true;
    this.gfx = opts.gfx === 'classic' ? 0 : opts.gfx === 'low' ? 1 : 2;     // 0 classic, 1 medium (tablet), 2 high
    this.pixelCap = opts.touch ? 1.5 : 2;                                   // iPad: cap the backing store (2x retina is very expensive)
    this.resScale = 1; this.perfLvl = 0; this.ft = 1 / 60; this.perfCool = 3; this._lastT = 0;
    this.lodBase = opts.touch ? 0.65 : 1; this.lodMul = this.lodBase; this.lodForce = opts.lod === 'max' ? 0 : -1;
    this.frustum = new THREE.Frustum(); this._pv = new THREE.Matrix4(); this._sph = new THREE.Sphere();
    this.applyPixelRatio();
    r.shadowMap.enabled = !!opts.shadows; r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = this.gfx ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping; r.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    const sky = new THREE.Color(0x9bb6cc);
    this.scene.background = sky; this.scene.fog = new THREE.Fog(sky, 300, 1100);
    if (this.gfx) this.initGfx();
    this.camera = new THREE.PerspectiveCamera(48, 1, 2, 3500);
    this.cam = { x: 0, z: 0, yaw: 0.0, pitch: 0.92, dist: 110, vx: 0, vz: 0 };
    this.shake = 0;
    this.views = new Map(); this.projViews = new Map();
    this.crews = new CrewPool(this.scene, sim);
    this.frame = 0; this.time = 0;
    this.ghost = null; this.selection = new Set();
    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x4d4a3a, this.gfx ? 0.75 : 0.95));
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d0, this.gfx ? 2.2 : 1.5);
    sun.castShadow = !!opts.shadows; sun.shadow.mapSize.set(opts.touch ? 1024 : 2048, opts.touch ? 1024 : 2048);
    sun.shadow.bias = -0.0006; sun.shadow.camera.near = 10; sun.shadow.camera.far = 600;
    this.scene.add(sun); this.scene.add(sun.target);
    this.buildTerrain();
    this.buildOil();
    if (this.gfx) this.initWorldGfx();
    this.fx = new Fx(this.scene, !!opts.touch);
    this.craters = new Craters(this.scene, this.sim.map, opts.touch ? 120 : 260);
    // explosion lighting: a few real point lights, driven by the strongest active flashes
    this.fxLights = []; if (this.gfx) for (let i = 0; i < (opts.touch ? 2 : 4); i++) { const L = new THREE.PointLight(0xff9b4a, 0, 70, 2); L.position.set(0, -50, 0); this.scene.add(L); this.fxLights.push(L); }
    this.buildSelection();
    this.buildProjectiles();
    this.buildGhost();
    const s = sim.players[local].spawn; this.cam.x = s.x; this.cam.z = s.z;
    this.fogTimer = 0; this.updateFog(true);
    this.resize();
    this._ray = new THREE.Raycaster(); this._v = new THREE.Vector3(); this._ndc = new THREE.Vector2();
  }

  // ---------------- graphics layer ----------------
  initGfx() {
    const R = Renderer;
    if (!R.detail) { R.detail = makeDetailTexture(512); R.cloud = makeCloudTexture(256); }
    const n = this.sim.map.n;
    this.fogData = new Uint8Array(n * n).fill(10);
    this.fogTex = new THREE.DataTexture(this.fogData, n, n, THREE.RedFormat, THREE.UnsignedByteType);
    this.fogTex.minFilter = this.fogTex.magFilter = THREE.LinearFilter; this.fogTex.wrapS = this.fogTex.wrapT = THREE.ClampToEdgeWrapping; this.fogTex.needsUpdate = true;
    this.U = makeUniforms(this.sim.map.size, this.fogTex, R.detail, R.cloud);
    this.U.uSunDir.value.set(70, 130, 45).normalize();
    this.skyObj = new Sky(this.U);
    this.scene.background = null; this.scene.add(this.skyObj.mesh);
    this.scene.fog = new THREE.Fog(new THREE.Color().setRGB(0.50, 0.66, 0.84), 260, 1250);
    this.skyObj.buildEnvironment(this.renderer, this.scene);
    modelMaterial.envMapIntensity = 0.55; modelMaterial.flatShading = false; modelMaterial.roughness = 0.62; modelMaterial.metalness = 0.28; modelMaterial.needsUpdate = true;
  }
  initWorldGfx() {
    const map = this.sim.map, w = map.vw, bc = this.baseCol;
    this.scatter = new Scatter(this.scene, this.sim, this.U, (x, z, out) => { const i = clamp(Math.round(x / CELL), 0, w - 1), j = clamp(Math.round(z / CELL), 0, w - 1), k = (j * w + i) * 3; out.setRGB(bc[k], bc[k + 1], bc[k + 2]); }, this.gfx === 2 ? 'high' : 'low');
    this.clouds = new Clouds(this.scene, this.U, map.size, this.gfx === 2 ? 70 : 42);
  }

  // ---------------- terrain ----------------
  buildTerrain() {
    const map = this.sim.map, n = map.n, w = map.vw;
    const pos = new Float32Array(w * w * 3), col = new Float32Array(w * w * 3), idx = [];
    this.baseCol = new Float32Array(w * w * 3);
    const C = (hex) => new THREE.Color(hex);
    const sand = C(0xc4b685), grass = C(0x5b7d3b), grass2 = C(0x748a45), dirt = C(0x7d7a55), rock = C(0x77746d), rock2 = C(0x8b8a86), snow = C(0xbfc5cc), seabed = C(0x34596a), wet = C(0x8f8a63);
    const tmp = new THREE.Color();
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, h = map.h[k];
      pos[k * 3] = i * CELL; pos[k * 3 + 1] = h; pos[k * 3 + 2] = j * CELL;
      const hx = map.h[j * w + Math.min(w - 1, i + 1)] - map.h[j * w + Math.max(0, i - 1)];
      const hz = map.h[Math.min(w - 1, j + 1) * w + i] - map.h[Math.max(0, j - 1) * w + i];
      const slope = Math.sqrt(hx * hx + hz * hz) / (2 * CELL);
      const nz = hash(i, j) - 0.5;
      if (h < 0) tmp.copy(seabed).lerp(sand, clamp((h + 3) / 3, 0, 1));
      else if (h < 0.9) tmp.copy(wet).lerp(sand, clamp(h / 0.9, 0, 1));
      else if (h < 1.8) tmp.copy(sand).lerp(grass, clamp((h - 0.9) / 0.9, 0, 1));
      else if (h < 8) tmp.copy(grass).lerp(grass2, clamp((h - 2) / 6 + nz * 0.8, 0, 1));
      else if (h < 14) tmp.copy(grass2).lerp(dirt, clamp((h - 8) / 6, 0, 1));
      else if (h < 24) tmp.copy(dirt).lerp(rock, clamp((h - 14) / 10, 0, 1));
      else tmp.copy(rock2).lerp(snow, clamp((h - 28) / 8, 0, 1));
      if (slope > 0.45 && h >= 0) tmp.lerp(rock, clamp((slope - 0.45) / 0.5, 0, 0.85));
      const v = 1 + nz * 0.14;
      this.baseCol[k * 3] = tmp.r * v; this.baseCol[k * 3 + 1] = tmp.g * v; this.baseCol[k * 3 + 2] = tmp.b * v;
      col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
      if ((i + j) & 1) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.colAttr = new THREE.BufferAttribute(col, 3); this.colAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('color', this.colAttr);
    g.setIndex(idx); g.computeVertexNormals();
    const tmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    if (this.gfx) { tmat.envMapIntensity = 0.35; patchTerrain(tmat, this.U); }
    this.terrain = new THREE.Mesh(g, tmat);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
    // water: full-resolution grid; vertex color = fog-of-war shade, `depth` = water depth for shading and shoreline foam
    {
      const ws = w, wp = new Float32Array(ws * ws * 3), wc = new Float32Array(ws * ws * 3), wd = new Float32Array(ws * ws), wi = [];
      for (let j = 0; j < ws; j++) for (let i = 0; i < ws; i++) { const k = j * ws + i; wp[k * 3] = i * CELL; wp[k * 3 + 1] = 0; wp[k * 3 + 2] = j * CELL; wd[k] = Math.max(0, -map.h[k]); }
      for (let j = 0; j < ws - 1; j++) for (let i = 0; i < ws - 1; i++) {
        const a = j * ws + i, hs = map.h[a] + map.h[a + 1] + map.h[a + ws] + map.h[a + ws + 1];
        if (hs > 12) continue;   // skip tiles that are well above the waterline
        wi.push(a, a + ws, a + 1, a + 1, a + ws, a + ws + 1);
      }
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
      this.waterCol = new THREE.BufferAttribute(wc, 3); this.waterCol.setUsage(THREE.DynamicDrawUsage);
      wg.setAttribute('color', this.waterCol); wg.setAttribute('depth', new THREE.BufferAttribute(wd, 1)); wg.setIndex(wi); wg.computeVertexNormals();
      this.waterGeo = wg; this.ws = ws;
      let wm;
      if (this.gfx) { wm = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 1, roughness: 0.1, metalness: 0.05, envMapIntensity: 1.1, depthWrite: false }); patchWater(wm, this.U); }
      else wm = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.8, roughness: 0.25, metalness: 0.25 });
      this.water = new THREE.Mesh(wg, wm); this.water.renderOrder = 1;
      this.scene.add(this.water);
    }
    // outer ocean / ground so the void is never visible
    if (this.gfx && this.sim.map.type === 'island') {
      const sg = new THREE.PlaneGeometry(7000, 7000, 1, 1); sg.rotateX(-Math.PI / 2);
      const cnt = sg.getAttribute('position').count; sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cnt * 3).fill(0.45), 3)); sg.setAttribute('depth', new THREE.BufferAttribute(new Float32Array(cnt).fill(9), 1));
      this.skirtMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 0.1, metalness: 0.05, envMapIntensity: 1.1 }); patchWater(this.skirtMat, this.U);
      const sk = new THREE.Mesh(sg, this.skirtMat); sk.position.set(map.size / 2, -0.35, map.size / 2); this.scene.add(sk);
    } else {
      const sk = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshBasicMaterial({ color: this.sim.map.type === 'island' ? 0x1b4f70 : 0x3a3f36 }));
      sk.rotation.x = -Math.PI / 2; sk.position.set(map.size / 2, -0.4, map.size / 2); this.scene.add(sk);
    }
    this.fogShade = new Float32Array(w * w);
  }
  buildOil() {
    // Oil fields are always visible: a dark pad plus a tall beacon that ignores fog, so they can be spotted from anywhere on the map.
    this.oilMeshes = [];
    const geo = new THREE.CylinderGeometry(4.2, 4.6, 0.3, 18), mat = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.4, metalness: 0.4 });
    const beam = new THREE.CylinderGeometry(0.35, 1.3, 46, 8, 1, true); beam.translate(0, 23, 0);
    const bmat = new THREE.MeshBasicMaterial({ color: 0xf0b429, transparent: true, opacity: 0.42, fog: false, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.RingGeometry(5.0, 6.2, 28); ring.rotateX(-Math.PI / 2);
    const rmat = new THREE.MeshBasicMaterial({ color: 0xf0b429, transparent: true, opacity: 0.75, fog: false, depthWrite: false, side: THREE.DoubleSide });
    for (const o of this.sim.map.oil) {
      const g = new THREE.Group(), y = this.sim.map.hAt(o.x, o.z);
      const m = new THREE.Mesh(geo, mat); m.position.y = 0.15; m.receiveShadow = true; g.add(m);
      const b = new THREE.Mesh(beam, bmat); b.renderOrder = 2; g.add(b);
      const r = new THREE.Mesh(ring, rmat); r.position.y = 0.45; r.renderOrder = 2; g.add(r);
      g.position.set(o.x, y, o.z); g.userData = { beam: b, ring: r };
      this.scene.add(g); this.oilMeshes.push(g);
    }
  }
  updateFog(force) {
    const sim = this.sim, n = sim.map.n, w = n + 1;
    const vis = sim.vis[this.team], ex = sim.expl[this.team];
    const cs = new Float32Array(n * n);
    for (let c = 0; c < n * n; c++) cs[c] = vis[c] ? 1 : ex[c] ? 0.68 : 0.24;
    const col = this.colAttr.array, base = this.baseCol;
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
      let s = 0, k = 0;
      for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 0; di++) {
        const x = i + di, z = j + dj; if (x < 0 || z < 0 || x >= n || z >= n) continue; s += cs[z * n + x]; k++;
      }
      const sh = k ? s / k : 0.24, q = (j * w + i) * 3;
      col[q] = base[q] * sh; col[q + 1] = base[q + 1] * sh; col[q + 2] = base[q + 2] * sh;
      this.fogShade[j * w + i] = sh;
    }
    this.colAttr.needsUpdate = true;
    const wc = this.waterCol.array, nn = w * w;
    for (let q = 0; q < nn; q++) { const sh = this.gfx ? this.fogShade[q] : 1; if (this.gfx) { wc[q * 3] = sh; wc[q * 3 + 1] = sh; wc[q * 3 + 2] = sh; } else { wc[q * 3] = 0.16 * this.fogShade[q]; wc[q * 3 + 1] = 0.44 * this.fogShade[q]; wc[q * 3 + 2] = 0.62 * this.fogShade[q]; } }
    this.waterCol.needsUpdate = true;
    if (this.fogData) { const fd = this.fogData; for (let c = 0; c < n * n; c++) fd[c] = cs[c] * 255; this.fogTex.needsUpdate = true; }
    this.oilMeshes.forEach((m, idx) => { const o = this.sim.map.oil[idx]; m.visible = true; m.userData.beam.visible = !o.building; });
  }

  // ---------------- helpers ----------------
  buildSelection() {
    const g = new THREE.RingGeometry(0.88, 1.0, 28); g.rotateX(-Math.PI / 2);
    this.selMat = new THREE.MeshBasicMaterial({ color: 0x8dff5c, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide });
    this.selMesh = new THREE.InstancedMesh(g, this.selMat, 600); this.selMesh.frustumCulled = false; this.selMesh.renderOrder = 4; this.selMesh.count = 0;
    this.selMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.selMesh);
    // enemy highlight (target ring) and rally flag
    this.tgtMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
    this.tgtMesh.visible = false; this.tgtMesh.renderOrder = 4; this.scene.add(this.tgtMesh);
    this.pingMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
    this.pingMesh.visible = false; this.pingMesh.renderOrder = 4; this.scene.add(this.pingMesh); this.pingT = 0; this.pingCol = 0xffffff;
  }
  ping(x, z, color = 0xffffff) { this.pingMesh.position.set(x, this.sim.map.hAt(x, z) + 0.4, z); this.pingMesh.material.color.setHex(color); this.pingT = 0.6; this.pingMesh.visible = true; }
  buildProjectiles() { this.proj = buildProjModels(); }
  buildGhost() {
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x40ff60, transparent: true, opacity: 0.4, depthWrite: false });
    this.ghostMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.ghostMat);
    this.ghostMesh.visible = false; this.ghostMesh.renderOrder = 3; this.scene.add(this.ghostMesh);
    const rg = new THREE.RingGeometry(61.5, 62, 64); rg.rotateX(-Math.PI / 2);
    this.radiusMesh = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0x9fe870, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    this.radiusMesh.visible = false; this.radiusMesh.renderOrder = 3; this.scene.add(this.radiusMesh);
  }
  setGhost(info) {
    // info: {x,z,size,ok} or null
    const m = this.ghostMesh;
    if (!info) { m.visible = false; this.radiusMesh.visible = false; if (this.planMeshes) for (const pm of this.planMeshes) pm.visible = false; return; }
    const s = info.size * CELL, y = this.sim.map.hAt(info.x, info.z);
    m.visible = true; m.scale.set(s, 4, s); m.position.set(info.x, y + 2, info.z);
    this.ghostMat.color.setHex(info.ok ? 0x40ff60 : 0xff4040);
    this.radiusMesh.visible = true; this.radiusMesh.position.set(info.x, y + 0.5, info.z);
    // airfield: preview the runway + apron that will be reserved (extension space is shown dimmer)
    const rects = info.plan ? info.plan.rects : [];
    if (!this.planMeshes) this.planMeshes = [];
    while (this.planMeshes.length < rects.length) { const pm = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x40ff60, transparent: true, opacity: 0.22, depthWrite: false })); this.scene.add(pm); this.planMeshes.push(pm); }
    this.planMeshes.forEach((pm, k) => {
      const r = rects[k]; pm.visible = !!r; if (!r) return;
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2; pm.scale.set(r.x1 - r.x0, 0.3, r.z1 - r.z0); pm.position.set(cx, Math.max(0, this.sim.map.hAt(cx, cz)) + 0.3, cz); pm.material.opacity = k < 2 ? 0.3 : 0.14;
    });
  }

  applyPixelRatio() { this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelCap) * this.resScale); }
  // adaptive quality: lower the render resolution, then the model LOD distances, when frames run long; recover slowly
  perfTick() {
    if (!this.opts.adaptive) return;
    const now = performance.now(), real = this._lastT ? (now - this._lastT) / 1000 : 0.016; this._lastT = now;
    if (real > 0.25) return;                                                // tab switch / stall: ignore
    this.ft += (real - this.ft) * 0.06; this.perfCool -= real;
    if (this.perfCool > 0) return;
    const L = this.perfLvl, STEP = [1, 0.85, 0.72, 0.62, 0.62, 0.62], LODM = [1, 1, 1, 1, 0.75, 0.55];
    if (this.ft > 1 / 40 && L < 5) this.perfLvl++; else if (this.ft < 1 / 57 && L > 0) this.perfLvl--; else return;
    this.perfCool = this.perfLvl > L ? 1.2 : 5;
    this.resScale = STEP[this.perfLvl]; this.lodMul = this.lodBase * LODM[this.perfLvl];
    this.applyPixelRatio(); this.resize();
  }
  resize() {
    const c = this.canvas, w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.W = w; this.H = h;
  }

  // ---------------- camera ----------------
  clampCam() {
    const s = this.sim.map.size, c = this.cam;
    c.x = clamp(c.x, 0, s); c.z = clamp(c.z, 0, s);
    c.dist = clamp(c.dist, 14, 560); c.pitch = clamp(c.pitch, this.gfx ? 0.16 : 0.45, 1.3);
  }
  pan(right, forward) {
    const c = this.cam, s = Math.sin(c.yaw), co = Math.cos(c.yaw);
    c.x += right * co + forward * -s; c.z += right * -s + forward * -co;
    this.clampCam();
  }
  centerOn(x, z) { this.cam.x = x; this.cam.z = z; this.clampCam(); }
  updateCamera(dt) {
    this.clampCam();
    const c = this.cam, cam = this.camera, map = this.sim.map;
    const fy = Math.max(0, map.hAt(c.x, c.z));
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    let sx = 0, sy = 0, sz = 0;
    if (this.shake > 0.01) { sx = (Math.random() - 0.5) * this.shake; sy = (Math.random() - 0.5) * this.shake; sz = (Math.random() - 0.5) * this.shake; this.shake *= Math.pow(0.0005, dt); }
    cam.position.set(c.x + Math.sin(c.yaw) * cp * c.dist + sx, fy + sp * c.dist + sy, c.z + Math.cos(c.yaw) * cp * c.dist + sz);
    cam.lookAt(c.x, fy, c.z);
    cam.updateMatrixWorld();
    // sun follows the view
    const S = Math.min(220, 60 + c.dist * 0.7);
    this.sun.target.position.set(c.x, fy, c.z);
    this.sun.position.set(c.x + 70, fy + 130, c.z + 45);
    const sc = this.sun.shadow.camera;
    if (Math.abs(sc.right - S) > 1) { sc.left = -S; sc.right = S; sc.top = S; sc.bottom = -S; sc.updateProjectionMatrix(); }
  }
  // screen (css px) -> ground point
  groundAt(sx, sy) {
    this._ndc.set((sx / this.W) * 2 - 1, -(sy / this.H) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this.camera);
    const o = this._ray.ray.origin, d = this._ray.ray.direction, map = this.sim.map;
    let t = 0, prevT = 0, step = 2;
    for (let i = 0; i < 900; i++) {
      t += step;
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (x < -50 || z < -50 || x > map.size + 50 || z > map.size + 50) { if (d.y >= 0) return null; step = 8; if (t > 4000) return null; continue; }
      const h = Math.max(0, map.hAt(x, z));
      if (y <= h) {
        let a = prevT, b = t;
        for (let k = 0; k < 10; k++) { const m = (a + b) / 2; const hy = Math.max(0, map.hAt(o.x + d.x * m, o.z + d.z * m)); if (o.y + d.y * m <= hy) b = m; else a = m; }
        const tt = (a + b) / 2;
        return { x: clamp(o.x + d.x * tt, 0, map.size), z: clamp(o.z + d.z * tt, 0, map.size) };
      }
      prevT = t; step = Math.min(6, 1.5 + t * 0.006);
    }
    return null;
  }
  project(x, y, z, out = {}) {
    this._v.set(x, y, z).project(this.camera);
    out.x = (this._v.x * 0.5 + 0.5) * this.W; out.y = (-this._v.y * 0.5 + 0.5) * this.H; out.behind = this._v.z > 1; out.z = this._v.z;
    return out;
  }
  pxRadius(worldR, x, y, z) {
    const d = this.camera.position.distanceTo(this._v.set(x, y, z));
    return worldR / (d * Math.tan(this.camera.fov * Math.PI / 360)) * (this.H / 2);
  }
  visibleToLocal(e) {
    if (e.team === this.team || e.def === 'derrick') return true;
    const c = this.sim.map.cellOf(e.x, e.z);
    return (c >= 0 && this.sim.vis[this.team][c] === 1) || (e.air && this.sim.contact[this.team].has(e.id));
  }
  // pick the entity under a screen point; minPx widens hit area for touch
  pickEntity(sx, sy, minPx = 10, filter) {
    let best = null, bd = 1e9; const p = {};
    for (const v of this.views.values()) {
      const e = v.ent; if (!v.visible || e.dead) continue;
      if (filter && !filter(e)) continue;
      const d = DEFS[e.def], yy = v.obj.position.y + (e.kind === 'building' ? 2 : 1.2);
      this.project(v.obj.position.x, yy, v.obj.position.z, p);
      if (p.behind) continue;
      const wr = e.kind === 'building' ? e.size * CELL * 0.5 : Math.max(e.radius, 1.4);
      const r = Math.max(minPx, this.pxRadius(wr, v.obj.position.x, yy, v.obj.position.z));
      const dx = p.x - sx, dy = p.y - sy, dd = Math.sqrt(dx * dx + dy * dy);
      if (dd <= r) {
        const score = dd / r + (e.kind === 'building' ? 0.4 : 0) + (e.air ? -0.3 : 0);
        if (score < bd) { bd = score; best = e; }
      }
    }
    return best;
  }
  entitiesInRect(x0, y0, x1, y1, filter) {
    const res = [], p = {};
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
    for (const v of this.views.values()) {
      const e = v.ent; if (!v.visible || e.dead) continue;
      if (filter && !filter(e)) continue;
      this.project(v.obj.position.x, v.obj.position.y + 1, v.obj.position.z, p);
      if (p.behind) continue;
      if (p.x >= ax && p.x <= bx && p.y >= ay && p.y <= by) res.push(e);
    }
    return res;
  }

  // ---------------- per-frame ----------------
  createView(e) {
    const m = makeModel(e.def, this.sim.players[e.owner].color), d0 = DEFS[e.def];
    this.scene.add(m.root);
    const v = { ent: e, obj: m.root, turret: m.turret, rotor: m.rotor, rotor2: m.rotor2, parts: m.parts, hull: m.hull, rp: m.rp, chains: m.chains, setLod: m.setLod, lod: 0, acc: 0, inView: true, yaw: Math.atan2(e.dirx, e.dirz), tyaw: 0, frame: 0, visible: true, built: false, flash: 0, mat: null, an: null, ring: null, maxY: 1 };
    m.root.rotation.order = 'YXZ';
    if (this.gfx) {
      const mat = makeUnitMaterial(this.U, modelMaterial); v.mat = mat;
      m.root.traverse((o) => { if (o.isMesh) o.material = mat; });
      mat.userData.u.uGround.value = (d0.air || e.kind === 'building') ? 0 : 1;
      if (e.kind === 'building') { m.hull.geometry.computeBoundingBox(); v.maxY = m.hull.geometry.boundingBox.max.y + 3; }
      const d = DEFS[e.def];
      if (d.ew) {
        const g = new THREE.RingGeometry(0.985, 1, 72); g.rotateX(-Math.PI / 2);
        v.ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x5ec8ff, transparent: true, opacity: 0.4, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
        v.ring.renderOrder = 3; v.ring.scale.set(d.ew.radius, 1, d.ew.radius); v.ring.frustumCulled = false; this.scene.add(v.ring);
        v.ring2 = v.ring.clone(); v.ring2.material = v.ring.material.clone(); this.scene.add(v.ring2);
      }
    }
    if (d0.air && d0.loadouts) { m.hull.geometry.computeBoundingBox(); v.gOff = Math.max(0, -m.hull.geometry.boundingBox.min.y) + 0.2; }
    if (e.def === 'airfield') v.afg = new AirfieldGfx(this.scene, this.sim, e, this.sim.players[e.owner].color, this.scatter);
    this.views.set(e.id, v);
    return v;
  }
  // continuous effects: vehicle dust, jet afterburners and contrails, rotor wash
  entityFx(e, d, v, x, y, z, dt) {
    const cp = this.camera.position, cx = x - cp.x, cz = z - cp.z; if (cx * cx + cz * cz > 300 * 300) return;
    v.fxT = (v.fxT || 0) - dt; v.fxC = (v.fxC || 0) - dt;
    const fx = this.fx, map = this.sim.map, gy = map.hAt(x, z), dx = e.dirx, dz = e.dirz;
    if (d.air) {
      const base = d.base, spd = e.spd !== undefined ? e.spd : (e.moving ? d.speed : 0), ph = e.ap;
      if (ph && GROUND_PHASES.has(ph)) return;
      const jet = base === 'fighter' || base === 'wingman' || base === 'carrier' || base === 'empcarrier';
      if (jet && v.fxT <= 0) {
        v.fxT = 0.03; const k = (ph === 'takeoff' || spd > d.speed * 0.82) ? 1 : 0.45, r = d.radius;
        const vy = e.h !== undefined ? (e.h - e.ph) * d.alt / 0.05 : 0;
        fx.afterburn(x - dx * r * 1.9, y, z - dz * r * 1.9, dx, dz, vy, spd, k, r * (base === 'carrier' || base === 'empcarrier' ? 0.7 : 0.9), base === 'fighter' ? r * 0.28 : 0);
      }
      if ((jet || base === 'bomber' || base === 'strategic' || base === 'airlifter' || base === 'ewplane' || base === 'uav') && v.fxC <= 0 && y - gy > d.alt * 0.8 && spd > d.speed * 0.65) { v.fxC = 0.085; fx.contrail(x - dx * d.radius * 2.2, y, z - dz * d.radius * 2.2, d.radius * 0.6); }
      if ((base === 'heli' || base === 'vtol' || base === 'fpv') && y - gy < 9 && v.fxC <= 0 && (e.h === undefined || e.h > 0.02)) { v.fxC = 0.06; const sand = gy < 1.6; fx.rotorWash(x, gy, z, d.radius * (base === 'fpv' ? 1.2 : 2.2), sand ? 0.78 : 0.5, sand ? 0.7 : 0.44, sand ? 0.52 : 0.32); }
      return;
    }
    if (e.armor === 'inf' || !e.moving) return;
    const sp = Math.sqrt(e.vx * e.vx + e.vz * e.vz); if (sp < 1.2) return;
    if (v.fxT <= 0) {
      v.fxT = Math.max(0.05, 0.14 - sp * 0.01); const sand = gy < 1.6, rock = gy > 14, r = d.radius;
      fx.dust(x, gy, z, dx, dz, r * 0.9, sand ? 0.8 : rock ? 0.62 : 0.5, sand ? 0.72 : rock ? 0.6 : 0.43, sand ? 0.54 : rock ? 0.56 : 0.3, Math.min(0.42, 0.14 + sp * 0.03));
    }
    if (v.fxC <= 0 && (e.armor === 'medium' || e.armor === 'heavy')) { v.fxC = 0.22; fx.smoke.emit(x - dx * d.radius , gy + d.radius * 0.9, z - dz * d.radius, -dx * 1.2, 1.2, -dz * 1.2, 1.1, 0.45, 0.14, 0.14, 0.15, 0.32, 1.4, 0.8); }
  }
  // little gold pips on top of upgraded derricks / power plants
  tierMarks(v, e) {
    v.tierN = e.tier; if (v.tierG) { v.obj.remove(v.tierG); }
    const g = new THREE.Group(), h = (v.maxY || 8) + 1.4;
    for (let i = 0; i < e.tier - 1; i++) { const m = new THREE.Mesh(PIP_GEO, PIP_MAT); m.position.set((i - (e.tier - 2) / 2) * 1.1, h, 0); g.add(m); }
    v.obj.add(g); v.tierG = g;
  }
  removeView(id, v) {
    this.scene.remove(v.obj); if (v.mat) v.mat.dispose(); if (v.afg) v.afg.dispose();
    if (v.ring) { this.scene.remove(v.ring); this.scene.remove(v.ring2); v.ring.geometry.dispose(); v.ring.material.dispose(); v.ring2.material.dispose(); }
    this.views.delete(id);
  }
  syncEntities(alpha, dt) {
    const sim = this.sim, map = sim.map, f = ++this.frame;
    this.crews.begin();
    for (const e of sim.ents) {
      if (e.dead) continue;
      let v = this.views.get(e.id); if (!v) v = this.createView(e);
      v.frame = f; v.ent = e;
      const vis = this.visibleToLocal(e);
      v.visible = vis; v.obj.visible = vis; if (v.afg) v.afg.group.visible = vis;
      if (v.ring) { v.ring.visible = v.ring2.visible = vis && (e.kind === 'unit' || e.progress >= 1) && e.stun <= 0 && this.sim.players[e.owner].ewOn && !(e.ap && GROUND_PHASES.has(e.ap)); }
      if (!vis) continue;
      const d = DEFS[e.def];
      const x = e.px + (e.x - e.px) * alpha, z = e.pz + (e.z - e.pz) * alpha;
      let y = map.hAt(x, z);
      const o = v.obj;
      if (d.air) {
        const hh = e.h === undefined ? 1 : e.ph + (e.h - e.ph) * alpha, g0 = Math.max(0, y);
        y = g0 + (v.gOff || 0) * (1 - hh) + (d.alt + Math.sin(this.time * 1.6 + e.id) * 0.5) * hh;
      }
      if (e.chute > 0) {   // paradropped: descend under a canopy
        y += Math.min(70, e.chute * 0.45);
        if (!v.canopy) { const m = new THREE.Mesh(CANOPY_GEO, CANOPY_MAT); m.position.y = 4.2; m.castShadow = false; o.add(m); v.canopy = m; }
        v.canopy.visible = true;
      } else if (v.canopy && v.canopy.visible) v.canopy.visible = false;
      o.position.set(x, y, z);
      // view-frustum + distance driven level of detail
      this._sph.center.set(x, y + 1, z); this._sph.radius = e.kind === 'building' ? e.size * CELL * 0.9 + 8 : (d.air ? e.radius * 4.5 + 6 : Math.max(5, e.radius * 2.6));   // wingspan is much wider than the hull radius
      const inView = v.inView = this.frustum.intersectsSphere(this._sph);
      if (inView) {
        const cp = this.camera.position, dx = x - cp.x, dy = y - cp.y, dz = z - cp.z, dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const near = (e.kind === 'building' ? 260 : 120) * this.lodMul, far = near * 2, cur = v.lod;
        let lod = dist > far ? 2 : dist > near ? 1 : 0;
        if (lod > cur) { if (dist < (cur === 0 ? near : far) * 1.08) lod = cur; } else if (lod < cur) { if (dist > (cur === 2 ? far : near) * 0.92) lod = cur; }
        if (this.lodForce === 0) lod = 0;
        if (lod !== cur || !v.lodInit) { v.lodInit = true; v.lod = lod; v.setLod(lod, this.opts.shadows); }
      }
      if (v.afg) v.afg.update(e, true);
      if (inView && e.kind === 'unit') this.entityFx(e, d, v, x, y, z, dt);
      const want = Math.atan2(e.dirx, e.dirz);
      if (e.kind === 'unit') {
        v.yaw += angDiff(want, v.yaw) * Math.min(1, dt * 14); o.rotation.y = v.yaw;
        if (!d.air && e.armor !== 'inf') {
          const r = e.radius * 1.2, fx = x + Math.sin(v.yaw) * r, fz = z + Math.cos(v.yaw) * r, bx = x - Math.sin(v.yaw) * r, bz = z - Math.cos(v.yaw) * r;
          o.rotation.x = -Math.atan2(map.hAt(fx, fz) - map.hAt(bx, bz), r * 2);
        } else if (d.air) { o.rotation.x = e.moving ? 0.12 : 0; }
        // turret aiming
        if (v.turret) {
          let aim = 0;
          const tg = e.target ? sim.byId.get(e.target) : null;
          if (tg && !tg.dead) aim = angDiff(Math.atan2(tg.x - e.x, tg.z - e.z), v.yaw);
          else if (e.order && e.order.t === 'attackground') aim = angDiff(Math.atan2(e.order.x - e.x, e.order.z - e.z), v.yaw);
          v.tyaw += angDiff(aim, v.tyaw) * Math.min(1, dt * 7); v.turret.rotation.y = v.tyaw;
        }
        if (d.loadouts && inView) {
          updateStores(v, e, this.sim.players[e.owner].color);
          if (e.ap === 'equip' || e.ap === 'rearm') this.crews.tend(v, e, this.time, map);
        }
        if (this.gfx) {
          if (inView) {
            v.acc += dt;   // aircraft attitude must be set every frame, or the skipped-frame pose makes them flicker
            if (v.lod < 2 || d.air || ((f + e.id) % 3) === 0) { animateUnit(v, e, d, v.acc, this.time, Math.sqrt(e.vx * e.vx + e.vz * e.vz), e.flash > 0, v.lod, this._ground); v.acc = 0; }
            else if (v.an && v.an.sp) { o.rotation.x = (e.armor === 'inf' ? 0 : o.rotation.x) + v.an.sp.p; o.rotation.z = v.an.sp.r; }   // keep the cached body pose on skipped frames
          }
          const u = v.mat.userData.u; u.uDmg.value = clamp((0.7 - e.hp / e.maxhp) / 0.7, 0, 1); u.uStun.value = e.stun > 0 ? 1 : 0;
        } else if (d.base === 'heli' || d.base === 'uav') { if (v.rotor) { if (d.base === 'heli') v.rotor.rotation.y += dt * 40; else v.rotor.rotation.z += dt * 50; } if (v.rotor2) v.rotor2.rotation.x += dt * 40; }
      } else {
        o.rotation.y = 0;
        if ((e.tier || 1) !== (v.tierN || 1)) this.tierMarks(v, e);
        if (this.gfx) {
          const u = v.mat.userData.u; u.uBuildH.value = e.progress < 1 ? e.progress * v.maxY : 1e5; u.uDmg.value = clamp((0.6 - e.hp / e.maxhp) / 0.6, 0, 1); u.uStun.value = e.stun > 0 ? 1 : 0;
        } else if (e.progress < 1) o.scale.set(1, 0.12 + 0.88 * e.progress, 1); else if (o.scale.y !== 1) o.scale.set(1, 1, 1);
        if (v.turret) {
          let aim = 0;
          const tg = e.target ? sim.byId.get(e.target) : null;
          if (tg && !tg.dead) aim = Math.atan2(tg.x - e.x, tg.z - e.z);
          v.tyaw += angDiff(aim, v.tyaw) * Math.min(1, dt * 6); v.turret.rotation.y = v.tyaw;
        }
        if (e.progress >= 1 && v.rotor) {
          if (e.stun > 0) { /* frozen by EMP */ }
          else if (d.base === 'derrick') v.rotor.rotation.x = Math.sin(this.time * 1.6 + e.id) * 0.16;
          else v.rotor.rotation.y += dt * (d.base === 'airfield' ? 2.5 : d.base === 'ewtower' ? 5 : d.base === 'radar' ? 1.6 : d.base === 'powerplant' ? 6 : 1.3);
        }
      }
    }
    this.crews.end();
    for (const [id, v] of this.views) if (v.frame !== f) this.removeView(id, v);
    for (const v of this.views.values()) if (v.ring && v.ring.visible) {
      const e = v.ent, gy = Math.max(0, map.hAt(v.obj.position.x, v.obj.position.z)) + 0.6, R = (e.ed || DEFS[e.def]).ew.radius, friend = e.team === this.team;
      const ph = (this.time * 0.35 + e.id * 0.17) % 1;
      v.ring.position.set(v.obj.position.x, gy, v.obj.position.z); v.ring.scale.set(R, 1, R); v.ring.material.color.setHex(friend ? 0x5ec8ff : 0xff5ec8); v.ring.material.opacity = friend ? 0.22 : 0.4;
      v.ring2.position.copy(v.ring.position); v.ring2.scale.set(R * ph, 1, R * ph); v.ring2.material.color.copy(v.ring.material.color); v.ring2.material.opacity = (1 - ph) * 0.35;
    }
    // projectiles
    const pf = f;
    for (const p of sim.projs) {
      let m = this.projViews.get(p.id);
      if (!m) {
        const kind = projKind(p);
        m = this.proj.models[kind].clone(); m.userData.kind = kind; m.userData.flames = []; m.traverse((o) => { if (o.name === 'flame') m.userData.flames.push(o); });
        const sc = this.proj.scale[kind] * (p.big ? 2.2 : 1); m.scale.set(sc, sc, sc);
        m.userData.px = p.x; m.userData.py = p.y; m.userData.pz = p.z; m.userData.seed = p.id * 0.37;
        this.scene.add(m); this.projViews.set(p.id, m);
      }
      m.userData.frame = pf;
      m.position.set(p.x, p.y, p.z);
      const dx = p.x - m.userData.px, dy = p.y - m.userData.py, dz = p.z - m.userData.pz;
      if (dx * dx + dy * dy + dz * dz > 1e-5) { m.lookAt(p.x + dx, p.y + dy, p.z + dz); }
      m.userData.px = p.x; m.userData.py = p.y; m.userData.pz = p.z;
      const c = map.cellOf(p.x, p.z), kind = m.userData.kind;
      m.visible = p.team === this.team || (c >= 0 && sim.vis[this.team][c] === 1);
      if (m.visible) {
        for (const fl of m.userData.flames) { const s = 0.8 + 0.4 * Math.sin(this.time * 60 + m.userData.seed + fl.id); fl.scale.set(s, s, 0.8 + 0.5 * Math.random()); }
        if (kind === 'atgm' || kind === 'aam' || kind === 'rocket') this.fx.trail(p.x - dx * 8, p.y - dy * 8, p.z - dz * 8, false);
        else if (kind === 'cruise' || p.big) this.fx.trail(p.x, p.y, p.z, true);
        else if (kind === 'shell' && (this.frame & 1)) this.fx.smoke.emit(p.x, p.y, p.z, 0, 0, 0, 0.7, 0.35, 0.8, 0.8, 0.8, 0.18, 0.5, 0);
      }
    }
    for (const [id, m] of this.projViews) if (m.userData.frame !== pf) { this.scene.remove(m); this.projViews.delete(id); }
  }
  updateSelection() {
    let k = 0; const m = new THREE.Matrix4(), s = new THREE.Vector3(), q = new THREE.Quaternion(), p = new THREE.Vector3();
    for (const id of this.selection) {
      const v = this.views.get(id); if (!v || !v.visible) continue;
      const e = v.ent, r = e.kind === 'building' ? e.size * CELL * 0.62 : Math.max(1.5, e.radius * 1.35);
      const y = Math.max(0, this.sim.map.hAt(v.obj.position.x, v.obj.position.z)) + 0.35;
      p.set(v.obj.position.x, y, v.obj.position.z); s.set(r, 1, r); m.compose(p, q, s);
      this.selMesh.setMatrixAt(k++, m); if (k >= 600) break;
    }
    this.selMesh.count = k; this.selMesh.instanceMatrix.needsUpdate = true;
  }
  setTargetHighlight(e) {
    if (!e || e.dead) { this.tgtMesh.visible = false; return; }
    const v = this.views.get(e.id); if (!v || !v.visible) { this.tgtMesh.visible = false; return; }
    const r = e.kind === 'building' ? e.size * CELL * 0.62 : Math.max(1.6, e.radius * 1.4);
    this.tgtMesh.visible = true; this.tgtMesh.scale.set(r, 1, r);
    this.tgtMesh.position.set(v.obj.position.x, Math.max(0, this.sim.map.hAt(v.obj.position.x, v.obj.position.z)) + 0.4, v.obj.position.z);
  }

  processEvents(evs) {
    const sim = this.sim; if (!evs || !evs.length) return;
    const cam = this.cam, fx = this.fx;
    const visAt = (x, z) => { const c = sim.map.cellOf(x, z); return c >= 0 && sim.vis[this.team][c] === 1; };
    const vol = (x, z) => { const d = Math.sqrt((x - cam.x) * (x - cam.x) + (z - cam.z) * (z - cam.z)); return clamp(1.2 - d / 260, 0, 1); };
    for (const e of evs) {
      switch (e.e) {
        case 'shot': if (e.w === 'hpm') { if (visAt(e.x, e.z) || visAt(e.tx, e.tz)) fx.zap(e.x, e.y, e.z, e.tx, e.ty, e.tz); } else if (visAt(e.x, e.z) || visAt(e.tx, e.tz)) { fx.tracer(e.x, e.y, e.z, e.tx, e.ty, e.tz); fx.muzzle(e.x, e.y, e.z, 0.5); fx.spark(e.tx, e.ty, e.tz); sfx('rifle', vol(e.x, e.z) * 0.6); } break;
        case 'launch': if (visAt(e.x, e.z)) { fx.muzzle(e.x, e.y, e.z, e.big ? 4 : e.w === 'missile' ? 1.2 : 1.8); sfx(e.w === 'missile' ? 'missile' : 'cannon', vol(e.x, e.z) * (e.big ? 1.5 : 0.8)); } break;
        case 'laser': if (visAt(e.x, e.z)) { fx.laser(e.x, e.y, e.z, e.tx, e.ty, e.tz, e.ok); sfx('boom', vol(e.x, e.z) * 0.3); } break;
        case 'intercept': if (visAt(e.x, e.z)) fx.tracer(e.sx, this.sim.map.hAt(e.sx, e.sz) + 3, e.sz, e.x, e.y, e.z); break;
        case 'aps': if (visAt(e.x, e.z)) { fx.aps(e.x, e.y, e.z, e.ok); sfx('boom', vol(e.x, e.z) * 0.5); } break;
        case 'decoy': if (visAt(e.x, e.z)) { fx.spark(e.x, e.y, e.z); fx.spark(e.x, e.y, e.z); } break;
        case 'boom': if (visAt(e.x, e.z)) { if (e.emp) fx.emp(e.x, e.y, e.z, e.r); else fx.boom(e.x, e.y, e.z, e.r, e.big, e.air); if (!e.air && e.y < this.sim.map.hAt(e.x, e.z) + 4) this.craters.add(e.x, e.z, Math.min(13, 1.1 + e.r * 1.05), Math.random() * 6.283); sfx(e.big ? 'big' : 'boom', vol(e.x, e.z) * (e.big ? 1.6 : 0.7)); if (e.big) this.shake = Math.max(this.shake, 2.5 * vol(e.x, e.z)); } break;
        case 'dead': if (!e.silent && visAt(e.x, e.z) || (!e.silent && e.owner === this.local)) {
          const bld = e.kind === 'building', r = bld ? 6 : e.air ? 3 : 3.2;
          fx.boom(e.x, e.y + (bld ? 2 : 1), e.z, r, bld, e.air);
          if (!e.air && (bld || e.armor !== 'inf')) this.craters.add(e.x, e.z, bld ? 9 : 3.2, Math.random() * 6.283);
          if (bld) { for (let i = 0; i < 4; i++) fx.boom(e.x + (Math.random() - 0.5) * 10, e.y + 2 + Math.random() * 3, e.z + (Math.random() - 0.5) * 10, 4, false, false); this.shake = Math.max(this.shake, 3 * vol(e.x, e.z)); fx.burn(e.x, e.y, e.z, 7); }
          else if (!(e.def === 'rifleman' || e.def === 'at' || e.def === 'manpads' || e.def === 'engineer')) fx.burn(e.x, e.y, e.z, e.air ? 2.5 : 4);
          sfx('boom', vol(e.x, e.z));
        } break;
        default: break;
      }
    }
  }

  render(dt, alpha) {
    this.time += dt;
    this.updateCamera(dt);
    if (this.gfx) { this.U.uTime.value = this.time; this.skyObj.mesh.position.copy(this.camera.position); if (this.scatter) this.scatter.update(this.cam); }
    this.perfTick();
    this.camera.updateMatrixWorld(); this._pv.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert()); this.frustum.setFromProjectionMatrix(this._pv);
    if (!this._ground) { const map = this.sim.map; this._ground = (x, z) => map.hAt(x, z); }
    this.syncEntities(alpha, dt);
    this.updateSelection();
    if (this.pingT > 0) { this.pingT -= dt; const t = Math.max(0, this.pingT / 0.6), s = 1 + (1 - t) * 4; this.pingMesh.scale.set(s, 1, s); this.pingMesh.material.opacity = t; if (this.pingT <= 0) this.pingMesh.visible = false; }
    this.fogTimer += dt; if (this.fogTimer > 0.25) { this.fogTimer = 0; this.updateFog(); }
    const scale = this.renderer.domElement.height * 0.5 * this.camera.projectionMatrix.elements[5];
    this.fx.update(dt, scale);
    if (this.fxLights.length) {
      const fl = this.fx.flashes.slice().sort((a, b) => b.i * b.t / b.d - a.i * a.t / a.d);
      for (let i = 0; i < this.fxLights.length; i++) { const L = this.fxLights[i], f = fl[i]; if (f) { const q = f.t / f.d; L.position.set(f.x, f.y, f.z); L.intensity = f.i * q * q; } else L.intensity = 0; }
    }
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.terrain.geometry.dispose(); this.water.geometry.dispose();
    if (this.scatter) this.scatter.dispose();
    for (const v of this.views.values()) if (v.mat) v.mat.dispose();
    if (this.scene.environment) { this.scene.environment.dispose(); }
    this.scene.clear();
  }
}
