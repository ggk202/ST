// Orbital view: a second "space layer" scene. A high-quality procedural Earth (continents, ice, clouds, city lights, ocean glint,
// atmospheric scattering) with three orbital shells (low / medium / high). Satellites, shipyards and warships orbit it; the player
// selects them, retargets their orbit, and picks ground strike targets on a ground-track map.
import * as THREE from 'three';
import { UNITS, PLAYER_COLORS } from './sim/defs.js';
import { ORB_LAYERS, orbGround, LAYER_SHIFT } from './sim/space.js';
import { makeModel } from './models.js';
import { sfx } from './fx.js';

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
export const R_EARTH = 100, R_LAYER = [118, 142, 172];
const INC = [[0.0, 0.0], [0.62, 1.0], [1.05, 2.3], [0.3, 4.1]];   // inclination, node angle per orbit plane index
const KIND_SCALE = { recon: 3.2, survey: 3.4, strike: 3.0, hk: 3.2, yard: 1.1, ship: 1.0 };
const SHIP_SCALE = { orbfighter: 2.6, orbcruiser: 1.5, orbbattleship: 1.0 };

// ---- procedural planet shaders -------------------------------------------------------------------------------------------
const NOISE = `
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = 0.0, w = 0.5; for (int i = 0; i < OCT; i++) { a += w * vn(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); w *= 0.5; } return a; }
`;
const EARTH_VS = `varying vec3 vObj; varying vec3 vW; varying vec3 vNW;
void main(){ vObj = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vNW = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const EARTH_FS = `#define OCT 6
precision highp float;
varying vec3 vObj; varying vec3 vW; varying vec3 vNW; uniform vec3 uSun; uniform float uTime;
${NOISE}
float cloudD(vec3 n, float t){ vec3 q = n * 3.1 + vec3(t * 0.02, 0.0, t * 0.012); float c = fbm(q + fbm(q * 0.7) * 0.8); return smoothstep(0.50, 0.74, c); }
void main(){
  vec3 n = normalize(vObj); vec3 N = normalize(vNW), L = normalize(uSun), V = normalize(cameraPosition - vW);
  float h = fbm(n * 2.1 + vec3(3.1, 1.7, 5.3)), h2 = fbm(n * 9.0);
  float elev = h + (h2 - 0.5) * 0.10;
  float land = smoothstep(0.505, 0.525, elev), lat = abs(n.y);
  vec3 ocean = mix(vec3(0.005, 0.035, 0.12), vec3(0.03, 0.30, 0.44), smoothstep(0.40, 0.52, elev));
  float moist = fbm(n * 3.4 + 7.0);
  float belt = smoothstep(0.30, 0.0, abs(lat - 0.34));
  vec3 lc = mix(vec3(0.20, 0.34, 0.12), vec3(0.05, 0.19, 0.07), smoothstep(0.42, 0.68, moist));
  lc = mix(lc, vec3(0.66, 0.52, 0.32), belt * smoothstep(0.68, 0.38, moist));
  lc = mix(lc, vec3(0.40, 0.42, 0.36), smoothstep(0.64, 0.82, lat));
  lc = mix(lc, vec3(0.38, 0.33, 0.29), smoothstep(0.56, 0.72, elev) * 0.8);
  lc *= 0.72 + 0.55 * h2;
  vec3 col = mix(ocean, lc, land);
  float ice = smoothstep(0.80, 0.90, lat + (h2 - 0.5) * 0.14);
  col = mix(col, vec3(0.93, 0.96, 1.0), ice);
  float ndl = dot(N, L), day = smoothstep(-0.10, 0.20, ndl);
  float cs = cloudD(n + L * 0.012, uTime);       // cloud shadow, offset toward the sun
  float shade = max(ndl, 0.0) * (1.0 - 0.38 * cs);
  vec3 lit = col * (shade * 1.25 + 0.012);
  vec3 H = normalize(L + V);
  float glint = pow(max(dot(N, H), 0.0), 420.0) * (1.0 - land) * (1.0 - ice) * day * (1.0 - cs);
  lit += vec3(1.0, 0.92, 0.78) * glint * 1.1 + vec3(0.8, 0.9, 1.0) * pow(max(dot(N, H), 0.0), 40.0) * (1.0 - land) * day * 0.08;
  float city = smoothstep(0.70, 0.86, vn(n * 70.0) * 0.6 + vn(n * 200.0) * 0.4) * smoothstep(0.52, 0.58, moist + 0.1) * land * (1.0 - ice) * (1.0 - smoothstep(0.55, 0.75, lat));
  lit += vec3(1.0, 0.72, 0.34) * city * (1.0 - day) * (1.0 - cs * 0.8) * 0.9;
  float tw = smoothstep(-0.14, 0.0, ndl) * (1.0 - smoothstep(0.0, 0.28, ndl));
  lit += vec3(0.95, 0.38, 0.12) * tw * 0.20 * (0.4 + 0.6 * land);
  float fr = pow(1.0 - max(dot(N, V), 0.0), 3.2);
  vec3 atm = mix(vec3(0.22, 0.5, 1.0), vec3(1.0, 0.5, 0.25), tw);
  lit += atm * fr * (0.10 + 1.15 * day);
  gl_FragColor = vec4(lit, 1.0);
}`;
const CLOUD_FS = `#define OCT 6
precision highp float;
varying vec3 vObj; varying vec3 vW; varying vec3 vNW; uniform vec3 uSun; uniform float uTime;
${NOISE}
void main(){
  vec3 n = normalize(vObj); vec3 N = normalize(vNW), L = normalize(uSun), V = normalize(cameraPosition - vW);
  vec3 q = n * 3.1 + vec3(uTime * 0.02, 0.0, uTime * 0.012);
  float c = fbm(q + fbm(q * 0.7) * 0.8);
  float d = smoothstep(0.50, 0.74, c);
  float ndl = dot(N, L), day = smoothstep(-0.12, 0.25, ndl);
  float thick = smoothstep(0.62, 0.9, c);
  vec3 col = mix(vec3(0.97, 0.98, 1.0), vec3(0.62, 0.68, 0.78), thick * 0.7) * (max(ndl, 0.0) * 1.15 + 0.02);
  float tw = smoothstep(-0.14, 0.0, ndl) * (1.0 - smoothstep(0.0, 0.28, ndl));
  col += vec3(1.0, 0.45, 0.2) * tw * 0.35 * d;
  float fr = pow(1.0 - max(dot(N, V), 0.0), 2.5);
  gl_FragColor = vec4(col + vec3(0.3, 0.5, 0.9) * fr * 0.15 * day, d * (0.06 + 0.94 * smoothstep(-0.2, 0.15, ndl)) * (0.85 + 0.15 * thick));
}`;
const ATM_VS = `varying vec3 vNV; varying vec3 vNW; varying vec3 vW; void main(){ vNV = normalize(normalMatrix * normal); vNW = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const ATM_FS = `precision highp float; varying vec3 vNV; varying vec3 vNW; varying vec3 vW; uniform vec3 uSun;
void main(){
  float a = clamp(0.82 + dot(vNV, vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
  float glow = pow(a, 3.4);
  float ndl = dot(normalize(vNW), normalize(uSun)), day = smoothstep(-0.35, 0.4, ndl);
  float tw = smoothstep(-0.25, 0.05, ndl) * (1.0 - smoothstep(0.05, 0.4, ndl));
  vec3 col = mix(vec3(0.20, 0.45, 1.0), vec3(0.45, 0.78, 1.0), glow);
  col = mix(col, vec3(1.0, 0.45, 0.2), tw * 0.8);
  gl_FragColor = vec4(col * glow * (0.12 + 1.4 * day), glow * (0.1 + 0.9 * day));
}`;
const MOON_FS = `#define OCT 5
precision highp float; varying vec3 vObj; varying vec3 vW; varying vec3 vNW; uniform vec3 uSun;
${NOISE}
void main(){ vec3 n = normalize(vObj); float c = fbm(n * 4.0), d = fbm(n * 16.0); vec3 col = mix(vec3(0.30, 0.30, 0.31), vec3(0.62, 0.61, 0.58), c) * (0.8 + 0.4 * d) * (1.0 - 0.5 * smoothstep(0.55, 0.7, fbm(n * 6.0 + 4.0)));
  float ndl = max(dot(normalize(vNW), normalize(uSun)), 0.0); gl_FragColor = vec4(col * (ndl * 1.3 + 0.015), 1.0); }`;

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,244,214,0.9)'); gr.addColorStop(0.4, 'rgba(255,200,120,0.25)'); gr.addColorStop(1, 'rgba(255,170,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); return t;
}
// orbital plane basis for plane index i
function basis(i) {
  const [inc, node] = INC[i & 3], ci = Math.cos(inc), si = Math.sin(inc), cn = Math.cos(node), sn = Math.sin(node);
  const u = new THREE.Vector3(1, 0, 0), v = new THREE.Vector3(0, ci, si);   // rotate about X by inc
  const rotY = (p) => new THREE.Vector3(p.x * cn + p.z * sn, p.y, -p.x * sn + p.z * cn);
  return { u: rotY(u), v: rotY(v) };
}
const BAS = [0, 1, 2, 3].map(basis);
export function orbPos(o, out) {
  const b = BAS[o.inc & 3], a = o.ph * TAU, r = R_LAYER[o.layer] + (o.tl >= 0 && o.lt > 0 ? (R_LAYER[o.tl] - R_LAYER[o.layer]) * (1 - o.lt / LAYER_SHIFT) : 0);
  return out.copy(b.u).multiplyScalar(Math.cos(a) * r).addScaledVector(b.v, Math.sin(a) * r);
}
// the "theatre" patch on the globe where the game map sits (centred, facing +Z)
const PATCH = { lat0: 0.42, lon0: 0.0, span: 0.62 };
export function theatre(x, z, size, out, alt = 0) {
  const lat = PATCH.lat0 + (0.5 - z / size) * PATCH.span, lon = PATCH.lon0 + (x / size - 0.5) * PATCH.span * 1.25, r = R_EARTH + alt;
  return out.set(Math.cos(lat) * Math.sin(lon) * r, Math.sin(lat) * r, Math.cos(lat) * Math.cos(lon) * r);
}

export class OrbitalView {
  constructor(game) {
    this.g = game; this.sim = game.sim; this.on = false; this.built = false; this.sel = new Set(); this.cam = { yaw: 0.0, pitch: 0.38, dist: 330 }; this.mode = null;
    this.meshes = new Map(); this.beams = []; this.flashes = []; this.rods = []; this.t = 0; this.acc = 9; this.panelSig = '';
    this.el = $('orbPanel'); this.mapEl = $('orbMap'); this.banner = $('orbBanner');
    if (this.el) this.bindUi();
  }
  get avail() { return !!this.sim.space; }
  // ---------------------------------------------------------------- build the scene
  build() {
    if (this.built) return; this.built = true;
    const sc = this.scene = new THREE.Scene(); sc.background = new THREE.Color(0x01030a);
    this.camera = new THREE.PerspectiveCamera(40, 1, 1, 4000);
    const sun = this.sunDir = new THREE.Vector3(0.7, 0.35, 0.8).normalize();
    this.U = { uSun: { value: sun }, uTime: { value: 0 } };
    const earthGeo = new THREE.SphereGeometry(R_EARTH, 160, 112);
    this.earth = new THREE.Mesh(earthGeo, new THREE.ShaderMaterial({ vertexShader: EARTH_VS, fragmentShader: EARTH_FS, uniforms: this.U })); sc.add(this.earth);
    this.cloud = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH * 1.012, 128, 96), new THREE.ShaderMaterial({ vertexShader: EARTH_VS, fragmentShader: CLOUD_FS, uniforms: this.U, transparent: true, depthWrite: false })); sc.add(this.cloud);
    this.atm = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH * 1.085, 96, 72), new THREE.ShaderMaterial({ vertexShader: ATM_VS, fragmentShader: ATM_FS, uniforms: this.U, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sc.add(this.atm);
    // stars + a faint galactic band
    const N = 3600, pos = new Float32Array(N * 3), col = new Float32Array(N * 3); let s = 12345; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < N; i++) {
      let x, y, z; if (i < 1000) { const a = rnd() * TAU, b = (rnd() + rnd() + rnd() - 1.5) * 0.18; x = Math.cos(a); z = Math.sin(a); y = b; const t = 0.5; const yy = y * 1; const rx = x, ry = yy * 0.9 + z * 0.43, rz = z * 0.9 - yy * 0.43; x = rx; y = ry; z = rz; }
      else { const u = rnd() * 2 - 1, a = rnd() * TAU, r = Math.sqrt(1 - u * u); x = r * Math.cos(a); y = u; z = r * Math.sin(a); }
      const l = Math.sqrt(x * x + y * y + z * z); pos.set([x / l * 1800, y / l * 1800, z / l * 1800], i * 3);
      const b = 0.35 + Math.pow(rnd(), 3) * 0.65, tint = rnd(); col.set([b * (0.8 + tint * 0.2), b * (0.85 + (1 - tint) * 0.1), b], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false })); sc.add(this.stars);
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xfff2d8 }));
    this.sunSprite.scale.set(420, 420, 1); sc.add(this.sunSprite);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(14, 48, 36), new THREE.ShaderMaterial({ vertexShader: EARTH_VS, fragmentShader: MOON_FS, uniforms: this.U })); this.moon.position.set(-380, 120, -520); sc.add(this.moon);
    sc.add(new THREE.AmbientLight(0x1a2438, 0.9)); const dl = this.dl = new THREE.DirectionalLight(0xfff2dd, 2.6); sc.add(dl);
    // shells (faint reference rings) and the theatre outline
    this.rings = new THREE.Group(); sc.add(this.rings);
    for (let l = 0; l < 3; l++) { const g = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 129 }, (_, i) => new THREE.Vector3(Math.cos(i / 128 * TAU) * R_LAYER[l], 0, Math.sin(i / 128 * TAU) * R_LAYER[l]))); const m = new THREE.Line(g, new THREE.LineBasicMaterial({ color: [0x5fa8ff, 0x7be0c0, 0xe0b868][l], transparent: true, opacity: 0.18 })); m.rotation.x = 0.0; this.rings.add(m); }
    const pts = []; const size = this.sim.map.size, v = new THREE.Vector3();
    const edge = (f) => { for (let i = 0; i < 40; i++) { const k = i / 40, q = f(k); pts.push(theatre(q[0] * size, q[1] * size, size, v.clone(), 0.5)); } };
    edge((k) => [k, 0]); edge((k) => [1, k]); edge((k) => [1 - k, 1]); edge((k) => [0, 1 - k]);
    pts.push(pts[0].clone()); this.patch = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x57d6ff, transparent: true, opacity: 0.8 })); sc.add(this.patch);
    // pools: beams, ground-point markers
    for (let i = 0; i < 12; i++) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]), new THREE.LineBasicMaterial({ color: 0xff6a5a, transparent: true, blending: THREE.AdditiveBlending })); l.visible = false; sc.add(l); this.beams.push({ l, t: 0 }); }
    this.msGeo = new THREE.SphereGeometry(1.2, 10, 8); this.msMat = new THREE.MeshBasicMaterial({ color: 0xffd27a }); this.mslMeshes = [];
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.12, 48), new THREE.MeshBasicMaterial({ color: 0x7fe3ff, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthTest: false })); this.selRing.renderOrder = 10; this.selRing.visible = false; sc.add(this.selRing);
    this.pathLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 129 }, (_, i) => new THREE.Vector3(Math.cos(i / 128 * TAU), 0, Math.sin(i / 128 * TAU)))), new THREE.LineBasicMaterial({ color: 0x7fe3ff, transparent: true, opacity: 0.55 })); this.pathLine.visible = false; sc.add(this.pathLine);
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2(); this._v = new THREE.Vector3(); this._w = new THREE.Vector3();
    this.resize();
  }
  resize() { if (!this.built) return; const r = this.g.renderer; this.camera.aspect = r.W / r.H; this.camera.updateProjectionMatrix(); }
  // ---------------------------------------------------------------- ui
  bindUi() {
    const c = this.g.canvas;
    let drag = null, moved = 0;
    c.addEventListener('pointerdown', (e) => { if (!this.on) return; e.stopPropagation(); c.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, b: e.button }; moved = 0; });
    c.addEventListener('pointermove', (e) => { if (!this.on || !drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy); this.cam.yaw -= dx * 0.005; this.cam.pitch = Math.max(-1.3, Math.min(1.3, this.cam.pitch + dy * 0.005)); });
    c.addEventListener('pointerup', (e) => { if (!this.on) return; const d = drag; drag = null; try { c.releasePointerCapture(e.pointerId); } catch (x) { /* */ } if (d && moved < 6) this.click(e, d.b === 2 || e.button === 2); });
    c.addEventListener('wheel', (e) => { if (!this.on) return; e.preventDefault(); this.cam.dist = Math.max(205, Math.min(700, this.cam.dist * (1 + e.deltaY * 0.001))); }, { passive: false });
    c.addEventListener('contextmenu', (e) => { if (this.on) e.preventDefault(); });
    let pd = 0; c.addEventListener('touchmove', (e) => { if (!this.on || e.touches.length !== 2) return; const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (pd) this.cam.dist = Math.max(205, Math.min(700, this.cam.dist * pd / d)); pd = d; }, { passive: true });
    c.addEventListener('touchend', () => { pd = 0; });
    $('orbClose').addEventListener('click', () => this.toggle(false));
    this.mapEl.addEventListener('pointerdown', (e) => { if (!this.on) return; const rc = this.mapEl.getBoundingClientRect(), s = this.sim.map.size; this.mapClick((e.clientX - rc.left) / rc.width * s, (e.clientY - rc.top) / rc.height * s); });
  }
  toggle(v) {
    if (!this.avail) { this.g.toast('The space layer is disabled in this game', 'warn'); return; }
    this.on = v === undefined ? !this.on : v; if (this.on) this.build();
    $('orbitUi').classList.toggle('hidden', !this.on); $('btnOrbit') && $('btnOrbit').classList.toggle('on', this.on);
    $('hud').classList.toggle('orbiting', this.on); this.panelSig = ''; if (this.on) { this.resize(); this.g.setPaused && 0; sfx('ui', 0.6); }
    this.mode = null; if (this.g.overlay) this.g.octx.clearRect(0, 0, this.g.overlay.width, this.g.overlay.height);
    if (this.on) this.g.controls.cancelMode();
  }
  own(o) { return o.owner === this.g.local; }
  mine() { return this.sim.orb.filter((o) => this.own(o) && !o.dead); }
  selObjs() { return this.sim.orb.filter((o) => this.sel.has(o.id) && !o.dead && this.own(o)); }
  setSel(ids) { this.sel = new Set(ids); this.panelSig = ''; }
  cmd(c) { this.g.cmd(c); }
  mapClick(x, z) {
    const sel = this.selObjs(); if (!sel.length) return;
    const strikers = sel.filter((o) => UNITS[o.def].orbital.g);
    if (!strikers.length) { this.g.toast('Select a strike satellite or warship first', 'warn'); return; }
    this.cmd({ t: 'orbstrike', ids: strikers.map((o) => o.id), x, z }); this.g.toast('Strike target set. Fires when the ground track passes in reach.', 'info'); sfx('ui', 0.7);
  }
  pick(e) {
    const rc = this.g.canvas.getBoundingClientRect(); this.ndc.set((e.clientX - rc.left) / rc.width * 2 - 1, -((e.clientY - rc.top) / rc.height * 2 - 1)); this.ray.setFromCamera(this.ndc, this.camera);
    let best = null, bd = 1e9;
    for (const o of this.sim.orb) { const m = this.meshes.get(o.id); if (!m || o.dead) continue; const p = m.root.position, r = this.pickR(o); const dist = this.ray.ray.distanceSqToPoint(p); if (dist < r * r) { const dd = p.distanceToSquared(this.ray.ray.origin); if (dd < bd) { bd = dd; best = o; } } }
    return best;
  }
  pickR(o) { return Math.max(7, (KIND_SCALE[UNITS[o.def].orbital.kind] || 2) * 3 * (SHIP_SCALE[o.def.replace(/\d$/, '')] || 1)); }
  click(e, right) {
    if (right) {
      const sel = this.selObjs().filter((o) => UNITS[o.def].orbital.thr); if (!sel.length) return;
      // retarget orbit phase: intersect the ray with the shell of the first selected object
      const o = sel[0], R = R_LAYER[o.tl >= 0 ? o.tl : o.layer], rc = this.g.canvas.getBoundingClientRect();
      this.ndc.set((e.clientX - rc.left) / rc.width * 2 - 1, -((e.clientY - rc.top) / rc.height * 2 - 1)); this.ray.setFromCamera(this.ndc, this.camera);
      const sph = new THREE.Sphere(new THREE.Vector3(), R), hit = new THREE.Vector3(); if (!this.ray.ray.intersectSphere(sph, hit)) return;
      const b = BAS[o.inc & 3]; let ph = Math.atan2(hit.dot(b.v), hit.dot(b.u)) / TAU; ph -= Math.floor(ph);
      this.cmd({ t: 'orbmove', ids: sel.map((q) => q.id), ph }); sfx('ui', 0.6); return;
    }
    const hit = this.pick(e);
    if (hit && this.own(hit)) { if (e.shiftKey) { const s = new Set(this.sel); s.has(hit.id) ? s.delete(hit.id) : s.add(hit.id); this.setSel([...s]); } else this.setSel([hit.id]); sfx('ui', 0.4); }
    else if (!hit) this.setSel([]);
  }
  // ---------------------------------------------------------------- events from the sim
  handleEvents(evs) {
    if (!this.built) return; const size = this.sim.map.size;
    for (const e of evs) {
      if (e.e === 'obeam') { const a = this.meshes.get(e.a), b = this.meshes.get(e.b); if (a && b) this.fireBeam(a.root.position, b.root.position, 0xff6a5a); }
      else if (e.e === 'rod') { const m = this.meshes.get(e.id); if (m) this.rods.push({ from: m.root.position.clone(), to: theatre(e.x, e.z, size, new THREE.Vector3()), t: 0 }); }
      else if (e.e === 'orbhit') this.flashes.push({ p: theatre(e.x, e.z, size, new THREE.Vector3(), 0.5), t: 0, big: e.big, r: Math.max(2, e.r * 0.06) });
      else if (e.e === 'odie') { const m = this.meshes.get(e.id); if (m) this.flashes.push({ p: m.root.position.clone(), t: 0, big: true, r: 7 }); }
    }
  }
  fireBeam(a, b, col) { for (const bm of this.beams) if (!bm.l.visible) { bm.l.visible = true; bm.t = 0; const p = bm.l.geometry.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true; bm.l.material.color.setHex(col); return; } }
  // ---------------------------------------------------------------- per-frame
  sync() {
    const sim = this.sim, live = new Set(), v = this._v;
    for (const o of sim.orb) {
      if (o.dead) continue; live.add(o.id);
      let m = this.meshes.get(o.id);
      if (!m) {
        const d = UNITS[o.def], od = d.orbital, mm = makeModel(o.def, sim.players[o.owner].color);
        const sc = od.kind === 'ship' || od.kind === 'yard' ? (SHIP_SCALE[o.def.replace(/\d$/, '')] || 1.2) : KIND_SCALE[od.kind] || 3;
        mm.root.scale.setScalar(sc * (1 + 0.06 * (d.tier - 1))); const wrap = new THREE.Group(); mm.root.rotation.y = 0; wrap.add(mm.root);
        m = { root: wrap, model: mm }; this.scene.add(wrap); this.meshes.set(o.id, m);
      }
      orbPos(o, m.root.position);
      const b = BAS[o.inc & 3], a = o.ph * TAU, tang = v.copy(b.u).multiplyScalar(-Math.sin(a)).addScaledVector(b.v, Math.cos(a)).normalize(), rad = m.root.position.clone().normalize();
      const right = new THREE.Vector3().crossVectors(rad, tang).normalize();
      const mat = new THREE.Matrix4().makeBasis(right, rad, tang); m.root.quaternion.setFromRotationMatrix(mat);
      if (m.model.rotor) m.model.rotor.rotation.y += 0.01;
    }
    for (const [id, m] of this.meshes) if (!live.has(id)) { this.scene.remove(m.root); this.meshes.delete(id); }
  }
  render(dt) {
    if (!this.built) return; this.t += dt;
    const r = this.g.renderer.renderer, sim = this.sim, night = sim.wx ? sim.wx.night || 0 : 0;
    const sa = 0.55 + night * 2.3; this.sunDir.set(Math.sin(sa) * 0.9, 0.32, Math.cos(sa) * 0.9).normalize(); this.U.uSun.value.copy(this.sunDir); this.U.uTime.value = this.t + sim.tick * 0.05;
    this.dl.position.copy(this.sunDir).multiplyScalar(500); this.sunSprite.position.copy(this.sunDir).multiplyScalar(1400); this.sunSprite.visible = this.sunDir.dot(this._w.copy(this.camera.position).normalize()) < 0.3;
    this.moon.rotation.y += dt * 0.01;
    const c = this.cam; c.yaw += dt * 0.012;   // slow drift
    const cp = Math.cos(c.pitch); this.camera.position.set(Math.sin(c.yaw) * cp * c.dist, Math.sin(c.pitch) * c.dist, Math.cos(c.yaw) * cp * c.dist); this.camera.lookAt(0, 0, 0);
    this.sync();
    // selection ring + orbit path
    const so = this.selObjs()[0]; this.selRing.visible = !!so; this.pathLine.visible = !!so;
    if (so) {
      const m = this.meshes.get(so.id); if (m) { this.selRing.position.copy(m.root.position); this.selRing.scale.setScalar(this.pickR(so) * 1.1); this.selRing.quaternion.copy(this.camera.quaternion); }
      const b = BAS[so.inc & 3], R = R_LAYER[so.layer], mt = new THREE.Matrix4().makeBasis(b.u.clone().multiplyScalar(R), new THREE.Vector3().crossVectors(b.u, b.v).multiplyScalar(R), b.v.clone().multiplyScalar(R)); this.pathLine.matrix.copy(mt); this.pathLine.matrixAutoUpdate = false; this.pathLine.matrixWorldNeedsUpdate = true;
      this.pathLine.material.color.setHex(this.own(so) ? 0x7fe3ff : 0xff8a7a);
    }
    // beams, rods, missiles, flashes
    for (const b of this.beams) if (b.l.visible) { b.t += dt; b.l.material.opacity = Math.max(0, 1 - b.t / 0.35); if (b.t > 0.35) b.l.visible = false; }
    for (let i = this.rods.length - 1; i >= 0; i--) { const q = this.rods[i]; q.t += dt; if (q.t > 0.8) { this.rods.splice(i, 1); continue; } const p0 = q.from.clone().lerp(q.to, Math.max(0, q.t / 0.8 - 0.2)), p1 = q.from.clone().lerp(q.to, Math.min(1, q.t / 0.8)); this.fireBeam(p0, p1, 0xffe6a0); }
    const ml = sim.msl; while (this.mslMeshes.length < ml.length) { const m = new THREE.Mesh(this.msGeo, this.msMat); this.scene.add(m); this.mslMeshes.push(m); }
    this.mslMeshes.forEach((m, i) => { const q = ml[i]; m.visible = !!q; if (!q) return; const k = q.t / q.dur, a = theatre(q.sx, q.sz, sim.map.size, this._v), b = theatre(q.x, q.z, sim.map.size, this._w); const alt = Math.sin(Math.PI * k) * 60 + 1; m.position.copy(a).lerp(b, k).normalize().multiplyScalar(R_EARTH + 0.5 + alt); m.scale.setScalar(1 + (q.owner === this.g.local ? 0.3 : 0.6)); m.material = this.msMat; });
    for (let i = this.flashes.length - 1; i >= 0; i--) { const f = this.flashes[i]; f.t += dt; if (f.t > 1.2) { this.flashes.splice(i, 1); continue; } if (!f.m) { f.m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sunSprite.material.map, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, color: 0xffb060 })); this.scene.add(f.m); f.m.position.copy(f.p); } const k = f.t / 1.2; f.m.scale.setScalar((f.r + k * f.r * (f.big ? 7 : 4)) + 2); f.m.material.opacity = 1 - k; if (f.t > 1.15) { this.scene.remove(f.m); f.m.material.dispose(); } }
    this.patch.material.opacity = 0.55 + Math.sin(this.t * 2) * 0.2;
    r.render(this.scene, this.camera);
  }
  // 2D overlay: labels, hp bars, ground-footprint markers
  draw(o, W, H) {
    if (!this.built) return; o.clearRect(0, 0, W, H); o.font = '11px system-ui,sans-serif'; o.textAlign = 'center';
    const v = new THREE.Vector3(), cam = this.camera;
    for (const ob of this.sim.orb) {
      if (ob.dead) continue; const m = this.meshes.get(ob.id); if (!m) continue;
      v.copy(m.root.position).project(cam); if (v.z > 1) continue; const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      // hidden behind the planet?
      const toCam = this._w.copy(cam.position).sub(m.root.position), rd = toCam.length(); const dot = m.root.position.clone().normalize().dot(toCam.normalize()); const hidden = m.root.position.length() * Math.sqrt(1 - dot * dot) < R_EARTH * 0.995 && dot < 0.2;
      const mine = this.own(ob), d = UNITS[ob.def]; o.globalAlpha = hidden ? 0.25 : 1;
      o.fillStyle = mine ? '#bfe9ff' : '#ff9a8a'; o.fillText(d.name + (ob.tl >= 0 ? ' ▲' : ''), x, y - 20 - this.pickR(ob) * 0.4);
      o.fillStyle = 'rgba(0,0,0,.6)'; o.fillRect(x - 18, y - 16 - this.pickR(ob) * 0.4, 36, 4); o.fillStyle = ob.hp / ob.maxhp > 0.5 ? '#5bd18a' : ob.hp / ob.maxhp > 0.25 ? '#e8c04a' : '#e8483a'; o.fillRect(x - 18, y - 16 - this.pickR(ob) * 0.4, 36 * Math.max(0, ob.hp / ob.maxhp), 4);
      o.globalAlpha = 1;
    }
    // ground-footprint markers on the theatre patch
    for (const ob of this.sim.orb) {
      if (ob.dead || !this.own(ob)) continue; const od = UNITS[ob.def].orbital; if (!od.vision && !od.g) continue;
      const gp = orbGround(ob, this.sim.map.size); theatre(gp[0], gp[1], this.sim.map.size, v, 0.8); const n = v.clone().normalize(); if (n.dot(this._w.copy(cam.position).normalize()) < 0.05) continue; v.project(cam);
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H; o.strokeStyle = this.sel.has(ob.id) ? '#7fe3ff' : 'rgba(127,227,255,.55)'; o.lineWidth = 1.5; o.beginPath(); o.arc(x, y, 9, 0, TAU); o.stroke(); o.beginPath(); o.moveTo(x - 4, y); o.lineTo(x + 4, y); o.moveTo(x, y - 4); o.lineTo(x, y + 4); o.stroke();
    }
  }
  // ---------------------------------------------------------------- DOM panel + ground-track map
  update(dt) {
    if (!this.on) return; this.acc += dt; if (this.acc < 0.25) return; this.acc = 0;
    this.drawMap(); this.renderPanel();
  }
  drawMap() {
    const cv = this.mapEl, g = cv.getContext('2d'), S = cv.width, size = this.sim.map.size, k = S / size;
    g.fillStyle = '#0b1722'; g.fillRect(0, 0, S, S);
    g.drawImage(this.g.hud.el.mm, 0, 0, S, S);
    g.fillStyle = 'rgba(2,6,12,.35)'; g.fillRect(0, 0, S, S);
    // ground tracks of the selected objects, and footprints of all own ones
    for (const ob of this.mine()) {
      const od = UNITS[ob.def].orbital, selc = this.sel.has(ob.id);
      if (selc) { g.strokeStyle = 'rgba(127,227,255,.55)'; g.lineWidth = 1; g.beginPath(); const c = { ph: 0, inc: ob.inc }; for (let i = 0; i <= 240; i++) { c.ph = ob.ph + i / 240; const p = orbGround(c, size); i ? g.lineTo(p[0] * k, p[1] * k) : g.moveTo(p[0] * k, p[1] * k); } g.stroke(); }
      const p = orbGround(ob, size);
      if (od.vision) { g.fillStyle = 'rgba(127,227,255,.14)'; g.strokeStyle = 'rgba(127,227,255,.7)'; g.beginPath(); g.arc(p[0] * k, p[1] * k, od.vision * (1 + 0.1 * (UNITS[ob.def].tier - 1)) * k, 0, TAU); g.fill(); g.stroke(); }
      if (od.g) { g.strokeStyle = 'rgba(255,170,90,.8)'; g.setLineDash([3, 3]); g.beginPath(); g.arc(p[0] * k, p[1] * k, od.g.reach * k, 0, TAU); g.stroke(); g.setLineDash([]); if (ob.gt) { g.strokeStyle = '#ff6a5a'; g.lineWidth = 2; g.beginPath(); g.arc(ob.gt.x * k, ob.gt.z * k, 6, 0, TAU); g.moveTo(ob.gt.x * k - 9, ob.gt.z * k); g.lineTo(ob.gt.x * k + 9, ob.gt.z * k); g.moveTo(ob.gt.x * k, ob.gt.z * k - 9); g.lineTo(ob.gt.x * k, ob.gt.z * k + 9); g.stroke(); } }
      g.fillStyle = selc ? '#fff' : '#7fe3ff'; g.beginPath(); g.arc(p[0] * k, p[1] * k, 3, 0, TAU); g.fill();
    }
    const h = this.sim.hq(this.g.local); if (h) { g.fillStyle = '#' + PLAYER_COLORS[this.g.local].toString(16).padStart(6, '0'); g.fillRect(h.x * k - 3, h.z * k - 3, 6, 6); }
    for (const m of this.sim.msl) { const f = m.t / m.dur; g.fillStyle = '#ffd27a'; g.beginPath(); g.arc((m.sx + (m.x - m.sx) * f) * k, (m.sz + (m.z - m.sz) * f) * k, 3, 0, TAU); g.fill(); g.strokeStyle = 'rgba(255,200,120,.4)'; g.beginPath(); g.moveTo(m.sx * k, m.sz * k); g.lineTo(m.x * k, m.z * k); g.stroke(); }
  }
  renderPanel() {
    const sim = this.sim, L = this.g.local, mine = this.mine(), sel = this.selObjs(), p = sim.players[L];
    const yards = mine.filter((o) => UNITS[o.def].orbital.kind === 'yard');
    const sig = mine.map((o) => o.id + ':' + o.layer + ':' + Math.round(o.hp / 20) + ':' + (o.gt ? 1 : 0) + ':' + o.gam + ':' + (o.q ? o.q.length + Math.floor((o.q[0] ? o.q[0].left : 0) / 40) : 0) + ':' + (o.tl >= 0 ? 1 : 0)).join('|') + '#' + [...this.sel].join(',') + '#' + sim.msl.length + '#' + Math.floor(p.credits / 50);
    if (sig === this.panelSig) return; this.panelSig = sig;
    let h = '<h3>Orbital assets <small>' + mine.length + '</small></h3>';
    if (!mine.length) h += '<p class="sub">No assets in orbit. Build a <b>Satellite Launch Pad</b> (Production tab) and queue satellites in the <b>Strategic</b> tab.</p>';
    for (const o of mine) {
      const d = UNITS[o.def], od = d.orbital, on = this.sel.has(o.id);
      let st = ORB_LAYERS[o.layer] + (o.tl >= 0 ? ' → ' + ORB_LAYERS[o.tl] : '') + (o.tp >= 0 ? ' · maneuvering' : '');
      if (od.g) st += ' · ' + (o.gt ? '⌖ target set' : 'no target') + (od.kind === 'strike' ? ' · rods ' + o.gam + '/' + od.g.ammo : '');
      h += '<div class="orow' + (on ? ' on' : '') + '" data-id="' + o.id + '"><b>' + d.name + '</b><span class="hpb"><i style="width:' + Math.round(o.hp / o.maxhp * 100) + '%"></i></span><small>' + st + '</small></div>';
    }
    const s1 = sel[0];
    if (s1) {
      const od = UNITS[s1.def].orbital;
      h += '<div class="osec"><b>' + UNITS[s1.def].name + '</b>';
      if (od.thr) { h += '<div class="orow2">Orbit: ' + [0, 1, 2].map((l) => '<button class="mini' + (s1.layer === l && s1.tl < 0 ? ' on' : '') + '" data-layer="' + l + '">' + ['Low', 'Mid', 'High'][l] + '</button>').join('') + '</div><p class="sub">Right-click on the globe to set where on its orbit it should move to.</p>'; }
      if (od.g) h += '<p class="sub">Click the ground-track map to choose a bombardment target. It fires when its track passes within ' + od.g.reach + ' m.</p><button class="mini" data-act="cleartgt">Clear target</button>';
      if (od.kind === 'yard') {
        h += '<div class="orow2">Build:</div>';
        for (const k of ['orbfighter', 'orbcruiser', 'orbbattleship']) { const sd = UNITS[k], lock = p.tech < sd.techLv; h += '<button class="mini' + (lock ? ' locked' : '') + '" data-yard="' + s1.id + '" data-type="' + k + '" title="' + sd.desc + '">' + sd.baseName + ' ⛏' + sd.cost + ' ⚡' + sd.energy + (lock ? ' 🔒' : '') + '</button>'; }
        if (s1.q && s1.q.length) { h += '<div class="orow2">Queue: ' + s1.q.map((q, i) => '<span class="qc" data-yq="' + s1.id + '" data-i="' + i + '" title="cancel">' + UNITS[q.type].baseName + (i === 0 ? ' ' + Math.round((1 - q.left / UNITS[q.type].timeTicks) * 100) + '%' : '') + '</span>').join(' ') + '</div>'; }
      }
      h += '</div>';
    }
    if (sim.msl.length) h += '<div class="osec">⚠ ' + sim.msl.length + ' ballistic missile' + (sim.msl.length > 1 ? 's' : '') + ' in flight</div>';
    const enemies = sim.orb.filter((o) => !this.own(o) && !o.dead && o.team !== this.g.team);
    if (enemies.length) h += '<div class="osec"><small>Hostile contacts: ' + enemies.map((o) => UNITS[o.def].baseName + ' (' + ORB_LAYERS[o.layer].split(' ')[0] + ')').join(', ') + '</small></div>';
    this.el.innerHTML = h;
    for (const n of this.el.querySelectorAll('.orow')) n.addEventListener('click', (e) => { const id = +n.dataset.id; if (e.shiftKey) { const s = new Set(this.sel); s.has(id) ? s.delete(id) : s.add(id); this.setSel([...s]); } else this.setSel([id]); this.renderPanel(); });
    for (const n of this.el.querySelectorAll('[data-layer]')) n.addEventListener('click', () => { this.cmd({ t: 'orbmove', ids: sel.map((o) => o.id), layer: +n.dataset.layer }); sfx('ui', 0.6); });
    for (const n of this.el.querySelectorAll('[data-yard]')) n.addEventListener('click', (e) => { this.cmd({ t: 'orbtrain', yard: +n.dataset.yard, type: n.dataset.type, n: e.shiftKey ? 5 : 1 }); sfx('ui', 0.6); });
    for (const n of this.el.querySelectorAll('[data-yq]')) n.addEventListener('click', () => this.cmd({ t: 'orbdeq', yard: +n.dataset.yq, idx: +n.dataset.i }));
    for (const n of this.el.querySelectorAll('[data-act="cleartgt"]')) n.addEventListener('click', () => this.cmd({ t: 'orbstrike', ids: sel.map((o) => o.id), x: -1e9, z: -1e9 }));
  }
}
