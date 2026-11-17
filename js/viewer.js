// Unit / structure model viewer (main menu): orbit, zoom, tier, team colour, level of detail, stats and equipment list.
import * as THREE from 'three';
import { makeModel, modelMaterial } from './models.js';
import { DEFS, BASE_UNITS, BASE_ORDER, BUILDINGS, PLAYER_COLORS, PLAYER_COLOR_NAMES, ROMAN, unitId, BUILD_ORDER } from './sim/defs.js';

const $ = (id) => document.getElementById(id);
const GROUPS = [['Infantry', 'barracks'], ['Vehicles', 'factory'], ['Aircraft', 'airfield'], ['Drones', 'dronebay']];

export class ModelViewer {
  constructor() { this.base = 'mbt'; this.tier = 1; this.team = 0; this.lod = 0; this.auto = true; this.running = false; this.inited = false; }
  init() {
    if (this.inited) return; this.inited = true;
    const sel = $('vwDef'); sel.innerHTML = '';
    for (const [label, from] of GROUPS) {
      const og = document.createElement('optgroup'); og.label = label;
      for (const k of BASE_ORDER) if (BASE_UNITS[k].from === from) { const o = document.createElement('option'); o.value = k; o.textContent = BASE_UNITS[k].name; og.appendChild(o); }
      sel.appendChild(og);
    }
    const og = document.createElement('optgroup'); og.label = 'Structures';
    for (const k of Object.keys(BUILDINGS)) { const o = document.createElement('option'); o.value = k; o.textContent = BUILDINGS[k].name; og.appendChild(o); }
    sel.appendChild(og); sel.value = this.base;
    sel.addEventListener('change', () => { this.base = sel.value; this.rebuild(true); });
    const seg = (id, items, get, set) => {
      const el = $(id); el.innerHTML = '';
      items.forEach((it) => { const b = document.createElement('button'); b.textContent = it.label; b.dataset.v = it.v; b.addEventListener('click', () => { set(it.v); for (const c of el.children) c.classList.toggle('on', String(c.dataset.v) === String(get())); this.rebuild(false); }); if (String(it.v) === String(get())) b.classList.add('on'); el.appendChild(b); });
    };
    seg('vwTier', [1, 2, 3].map((t) => ({ v: t, label: 'Mk ' + ROMAN[t] })), () => this.tier, (v) => { this.tier = +v; });
    seg('vwTeam', PLAYER_COLORS.map((c, i) => ({ v: i, label: PLAYER_COLOR_NAMES[i] })), () => this.team, (v) => { this.team = +v; });
    seg('vwLod', [{ v: 0, label: 'High' }, { v: 1, label: 'Mid' }, { v: 2, label: 'Far' }], () => this.lod, (v) => { this.lod = +v; });
    $('vwAuto').addEventListener('change', (e) => { this.auto = e.target.checked; });
    $('vwPrev').addEventListener('click', () => this.step(-1)); $('vwNext').addEventListener('click', () => this.step(1));
    const cv = $('vwCanvas');
    let drag = null, pinch = 0;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY }; this.auto = false; $('vwAuto').checked = false; });
    cv.addEventListener('pointermove', (e) => { if (!drag) return; this.yaw -= (e.clientX - drag.x) * 0.008; this.pitch = Math.max(-0.1, Math.min(1.45, this.pitch + (e.clientY - drag.y) * 0.006)); drag = { x: e.clientX, y: e.clientY }; });
    cv.addEventListener('pointerup', () => { drag = null; }); cv.addEventListener('pointercancel', () => { drag = null; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.dist = Math.max(this.rad * 0.7, Math.min(this.rad * 8, this.dist * Math.exp(e.deltaY * 0.001))); }, { passive: false });
    cv.addEventListener('touchmove', (e) => { if (e.touches.length === 2) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (pinch) this.dist = Math.max(this.rad * 0.7, Math.min(this.rad * 8, this.dist * pinch / d)); pinch = d; e.preventDefault(); } }, { passive: false });
    cv.addEventListener('touchend', () => { pinch = 0; });
  }
  step(d) { const sel = $('vwDef'), n = sel.options.length; sel.selectedIndex = (sel.selectedIndex + d + n) % n; this.base = sel.value; this.rebuild(true); }
  open() {
    this.init(); const cv = $('vwCanvas');
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); this.renderer.setClearColor(0x16202b);
      this.scene = new THREE.Scene(); this.scene.fog = new THREE.Fog(0x16202b, 120, 600);
      this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x4d4a3a, 1.0));
      const sun = new THREE.DirectionalLight(0xfff0d0, 2.0); sun.position.set(-30, 60, 40); this.scene.add(sun);
      const fill = new THREE.DirectionalLight(0x9db8ff, 0.6); fill.position.set(40, 20, -50); this.scene.add(fill);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(400, 48), new THREE.MeshStandardMaterial({ color: 0x2b3a2a, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; this.scene.add(floor);
      this.grid = new THREE.GridHelper(120, 30, 0x4a5d4a, 0x364736); this.grid.position.y = 0.01; this.scene.add(this.grid);
      this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 1500); this.yaw = 0.6; this.pitch = 0.45; this.dist = 30; this.rad = 6;
    }
    modelMaterial.flatShading = false; modelMaterial.envMapIntensity = 0.5; modelMaterial.needsUpdate = true;   // smooth lofted bodies need smooth normals
    this.running = true; this.rebuild(true); this.t = performance.now();
    const loop = (now) => { if (!this.running) return; this.raf = requestAnimationFrame(loop); this.draw(Math.min(0.1, (now - this.t) / 1000)); this.t = now; };
    this.raf = requestAnimationFrame(loop);
  }
  close() { this.running = false; if (this.raf) cancelAnimationFrame(this.raf); if (this.obj) { this.scene.remove(this.obj.root); this.obj = null; } if (this.renderer) { this.renderer.dispose(); this.renderer = null; } }
  rebuild(frame) {
    const isB = !!BUILDINGS[this.base];
    $('vwTier').style.opacity = isB ? 0.3 : 1; $('vwTier').style.pointerEvents = isB ? 'none' : '';
    const def = isB ? this.base : unitId(this.base, this.tier), d = DEFS[def];
    if (this.obj) { this.scene.remove(this.obj.root); }
    this.obj = makeModel(def, this.team); this.obj.setLod(this.lod, false); this.scene.add(this.obj.root);
    const bb = new THREE.Box3().setFromObject(this.obj.root), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    this.obj.root.position.y = -bb.min.y * 0 + (d.air ? Math.max(0.5, -bb.min.y + 0.2) : 0);
    this.ctr = new THREE.Vector3(c.x, (bb.max.y - bb.min.y) * 0.45 + (d.air ? this.obj.root.position.y : 0), c.z);
    const r = Math.max(sz.x, sz.y, sz.z) * 0.9 + 2; if (frame || !this.rad) { this.rad = r; this.dist = r * 2.05; } else { this.dist *= r / this.rad; this.rad = r; }
    this.grid.scale.setScalar(Math.max(0.3, r / 12)); this.info(d);
  }
  info(d) {
    const rows = [];
    rows.push('<h3>' + d.name + '</h3><div class="vwd">' + (d.desc || '') + '</div>');
    const s = [];
    s.push('HP ' + d.hp); if (d.speed) s.push('speed ' + d.speed); if (d.armor) s.push(d.armor + ' armor'); if (d.cost) s.push('⛏' + d.cost + (d.energy ? ' ⚡' + d.energy : ''));
    if (d.vision) s.push('vision ' + d.vision); if (d.air) s.push('alt ' + d.alt + ' m'); if (d.radar) s.push('radar ' + d.radar.range + ' m'); if (d.ew) s.push('jam r' + d.ew.radius);
    if (d.sup) s.push('ammo ' + d.sup); if (d.fuel) s.push('fuel ' + d.fuel + ' s'); if (d.supply) s.push('carries ' + d.supply.cap); if (d.tank) s.push('tanks ' + d.tank.cap); if (d.aps) s.push('APS ' + d.aps.n);
    rows.push('<div class="vwst">' + s.join(' · ') + '</div>');
    if (d.weapons && d.weapons.length) rows.push('<div class="vwst"><b>Weapons</b><br>' + d.weapons.map((w) => w.type.toUpperCase() + ' ' + w.kind + ' · dmg ' + w.dmg + ' · range ' + w.range).join('<br>') + '</div>');
    if (d.kit && d.kit.length) rows.push('<div class="vwst vwkit"><b>Equipment</b><br>' + d.kit.map((k) => '◆ ' + k).join('<br>') + '</div>');
    if (d.loadouts && d.loadouts.length > 1) rows.push('<div class="vwst"><b>Loadouts</b><br>' + d.loadouts.map((l) => l.name).join(', ') + '</div>');
    $('vwInfo').innerHTML = rows.join('');
  }
  draw(dt) {
    const r = this.renderer, cv = $('vwCanvas'); if (!r) return;
    const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { r.setPixelRatio(dpr); r.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    if (this.auto) this.yaw += dt * 0.5;
    const o = this.obj; if (o) {
      const t = performance.now() / 1000; if (o.rotor) o.rotor.rotation.y += dt * 24; if (o.rotor2) o.rotor2.rotation.y -= dt * 24;
      if (o.turret) o.turret.rotation.y = Math.sin(t * 0.6) * 0.7;
    }
    const cp = Math.cos(this.pitch), c = this.ctr;
    this.camera.position.set(c.x + Math.sin(this.yaw) * cp * this.dist, c.y + Math.sin(this.pitch) * this.dist, c.z + Math.cos(this.yaw) * cp * this.dist);
    this.camera.lookAt(c); r.render(this.scene, this.camera);
  }
}
