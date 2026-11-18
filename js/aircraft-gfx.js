// Render-side aircraft ground-ops visuals: weapon stores hanging on the wing hardpoints (they appear as the ground crews
// load them and disappear as ammunition is spent) and the ground crews + ordnance carts themselves.
import * as THREE from 'three';
import { Builder, C, PI, T } from './model-core.js';
import { HARD, HARD_CENTER } from './model-air.js';
import { makeModel, modelMaterial } from './models.js';
import { UNITS, PLAYER_COLORS } from './sim/defs.js';

const { OD3, DARK2, METAL, WHITE, RED, GREY, ORANGE } = C;
const OLIVE = 0x5a6a3a, YEL = 0xe0b020;
// every store points along +Z with its centre at the origin
const STORE = {
  atgm: (b) => { b.cyl(0.12, 1.7, 0, 0, 0, OD3, [PI / 2, 0, 0]); b.cone(0.12, 0.4, 0, 0, 1.05, WHITE, [PI / 2, 0, 0]); for (let i = 0; i < 4; i++) { const a = i * PI / 2; b.box(0.04, 0.3, 0.3, Math.cos(a) * 0.16, Math.sin(a) * 0.16, -0.7, METAL, [0, 0, a]); } b.box(0.1, 0.32, 0.5, 0, 0.3, 0.1, DARK2); },
  aam: (b) => { b.cyl(0.1, 2.3, 0, 0, 0, WHITE, [PI / 2, 0, 0]); b.cone(0.1, 0.45, 0, 0, 1.35, DARK2, [PI / 2, 0, 0]); b.cyl(0.105, 0.12, 0, 0, 0.5, RED, [PI / 2, 0, 0]); for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; b.box(0.04, 0.34, 0.4, Math.cos(a) * 0.17, Math.sin(a) * 0.17, -0.9, METAL, [0, 0, a]); b.box(0.04, 0.3, 0.28, Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0.5, METAL, [0, 0, a]); } b.box(0.1, 0.3, 0.5, 0, 0.3, 0, DARK2); },
  rocket: (b) => { b.cyl(0.3, 1.3, 0, 0, 0, 0x6b7280, [PI / 2, 0, 0]); b.cone(0.28, 0.3, 0, 0, -0.75, DARK2, [-PI / 2, 0, 0]); for (let i = 0; i < 7; i++) { const a = i / 6 * PI * 2, r = i ? 0.16 : 0; b.cyl(0.07, 0.06, Math.cos(a) * r, Math.sin(a) * r, 0.66, 0x14161a, [PI / 2, 0, 0]); } b.box(0.1, 0.3, 0.6, 0, 0.4, 0, DARK2); },
  bomb: (b) => { b.cyl(0.24, 1.3, 0, 0, 0, OLIVE, [PI / 2, 0, 0]); b.cone(0.24, 0.4, 0, 0, 0.85, OLIVE, [PI / 2, 0, 0]); b.cone(0.22, 0.4, 0, 0, -0.85, OLIVE, [-PI / 2, 0, 0]); b.cyl(0.25, 0.1, 0, 0, 0.3, YEL, [PI / 2, 0, 0]); for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; b.box(0.04, 0.36, 0.4, Math.cos(a) * 0.26, Math.sin(a) * 0.26, -0.95, METAL, [0, 0, a]); } b.box(0.1, 0.32, 0.5, 0, 0.32, 0, DARK2); },
  heavy: (b) => { b.cyl(0.42, 2.0, 0, 0, 0, 0x4a5334, [PI / 2, 0, 0]); b.cone(0.42, 0.7, 0, 0, 1.35, 0x4a5334, [PI / 2, 0, 0]); b.cone(0.38, 0.7, 0, 0, -1.35, 0x4a5334, [-PI / 2, 0, 0]); b.cyl(0.43, 0.14, 0, 0, 0.4, YEL, [PI / 2, 0, 0]); b.cyl(0.43, 0.14, 0, 0, -0.3, YEL, [PI / 2, 0, 0]); for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; b.box(0.05, 0.6, 0.6, Math.cos(a) * 0.44, Math.sin(a) * 0.44, -1.5, METAL, [0, 0, a]); } b.box(0.14, 0.4, 0.8, 0, 0.5, 0, DARK2); },
  cruise: (b) => { b.cyl(0.2, 3.0, 0, 0, 0, 0xc9ced4, [PI / 2, 0, 0]); b.cone(0.2, 0.7, 0, 0, 1.8, 0xc9ced4, [PI / 2, 0, 0]); b.box(1.5, 0.05, 0.5, 0, 0, -0.9, METAL); b.box(0.05, 0.5, 0.4, 0, 0.3, -1.4, METAL); b.box(0.5, 0.25, 0.8, 0, 0.22, -0.6, DARK2); b.cyl(0.14, 0.4, 0, 0, -1.7, 0x6a4a3a, [PI / 2, 0, 0]); b.box(0.12, 0.3, 0.6, 0, 0.4, 0.3, DARK2); },
  jam: (b) => { b.cyl(0.3, 1.8, 0, 0, 0, 0x8a9096, [PI / 2, 0, 0]); b.cone(0.3, 0.5, 0, 0, 1.15, WHITE, [PI / 2, 0, 0]); b.cone(0.28, 0.4, 0, 0, -1.1, DARK2, [-PI / 2, 0, 0]); b.cyl(0.31, 0.16, 0, 0, 0.2, ORANGE, [PI / 2, 0, 0]); b.box(0.06, 0.4, 0.5, 0, 0.35, -0.4, GREY); b.box(0.1, 0.3, 0.5, 0, 0.4, 0, DARK2); },
  rod: (b) => { b.cyl(0.2, 4.2, 0, 0, 0, 0x8c8576, [PI / 2, 0, 0]); b.cone(0.2, 0.9, 0, 0, 2.55, 0x6b6250, [PI / 2, 0, 0]); b.cyl(0.3, 0.5, 0, 0, -1.9, 0x2f2a26, [PI / 2, 0, 0]); for (let i = 0; i < 4; i++) { const a = i * PI / 2; b.box(0.05, 0.4, 0.6, Math.cos(a) * 0.28, Math.sin(a) * 0.28, -1.7, METAL, [0, 0, a]); } },
  slug: (b) => { b.cyl(0.13, 1.3, 0, 0, 0, 0x9aa3ad, [PI / 2, 0, 0]); b.cone(0.13, 0.5, 0, 0, 0.9, 0x6b7280, [PI / 2, 0, 0]); for (const z of [-0.4, 0.1]) b.cyl(0.17, 0.1, 0, 0, z, 0x4fc8ff, [PI / 2, 0, 0]); },
  kkv: (b) => { b.cyl(0.32, 1.2, 0, 0, 0, 0xcfd5db, [PI / 2, 0, 0]); b.sph6(0.3, 0, 0, 0.7, 0xff5a3a); b.cyl(0.33, 0.1, 0, 0, 0.2, T, [PI / 2, 0, 0]); for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; b.cone(0.07, 0.25, Math.cos(a) * 0.36, Math.sin(a) * 0.36, -0.2, DARK2, [-PI / 2, 0, 0]); } },
  rv: (b) => { b.cone(0.36, 1.5, 0, 0, 0, 0x2f2a26, [PI / 2, 0, 0]); b.cyl(0.37, 0.12, 0, 0, -0.7, METAL, [PI / 2, 0, 0]); b.cyl(0.2, 0.2, 0, 0, -0.85, DARK2, [PI / 2, 0, 0]); },
  optics: (b) => { b.sph(0.34, 0, 0, 0, 0x2b3035); b.sph6(0.18, 0, -0.1, 0.28, 0x1c3850); b.box(0.5, 0.2, 0.5, 0, 0.3, 0, DARK2); },
};
const STORE_SCALE = { bomber: 1.7, strategic: 2.3, airlifter: 1, awacs: 1, spydrone: 1, fighter: 1.0, heli: 1.0, vtol: 1.0, uav: 0.8, ewplane: 1.1 };
const geoCache = new Map();
export const STORE_NAMES = { aam: 'AAM', atgm: 'ATGM', rocket: 'Rocket pod', bomb: 'Bomb', heavy: 'Heavy bomb', cruise: 'Cruise missile', jam: 'Jammer pod', optics: 'Sensor pod', rod: 'Tungsten rod', slug: 'Rail slug', kkv: 'Kill vehicle', rv: 'Re-entry vehicle' };
export const SPACE_STORE_SCALE = { satstrike: 1, satkill: 1, orbfighter: 0.8, orbcruiser: 1.6, orbbattleship: 2.4, icbm: 2.2 };
export const storeScale = (base) => STORE_SCALE[base] || SPACE_STORE_SCALE[base] || 1;
// a single store as a mesh (shared geometry), pointing along +Z, centred on its origin
export function storeMesh(kind, team) { return new THREE.Mesh(storeGeo(kind, team), modelMaterial); }
function storeGeo(kind, team) {
  const key = kind + team; let g = geoCache.get(key);
  if (!g) { const b = new Builder(PLAYER_COLORS[team % PLAYER_COLORS.length], 0, 1); STORE[kind](b); g = b.finish().hull; geoCache.set(key, g); }
  return g;
}

// pre-build everything an aircraft needs on the ground (weapon stores, crew, carts) so arming never hitches a frame; returns a list of small tasks
export function warmTasks(team) {
  const tasks = Object.keys(STORE).map((k) => () => storeGeo(k, team));
  tasks.push(() => makeModel('crew', 0), () => makeModel('cart', 0));
  return tasks;
}

// ---------- stores on an aircraft ----------
export function updateStores(v, e, team) {
  const D = UNITS[e.def], base = D.base, hp = HARD[base];
  if (!hp) return;
  const key = e.lo + ':' + (e.rdy ? 1 : 0);
  if (v.stKey !== key) {
    if (v.stGroup) { v.obj.remove(v.stGroup); }
    v.stKey = key; v.stGroup = null; v.stMeshes = []; v.stAmmo = null;
    if (e.lo >= 0 && (e.rdy || e.ap === 'equip')) {
      const lo = D.loadouts[e.lo], grp = new THREE.Group(); let k = 0;
      for (const [kind, n] of lo.vis || []) {
        if (kind === 'optics') { const c = HARD_CENTER[base]; if (c) { const m = new THREE.Mesh(storeGeo(kind, team), modelMaterial); m.position.set(c[0], c[1], c[2]); m.castShadow = true; grp.add(m); v.stMeshes.push(m); } continue; }
        for (let i = 0; i < n && k < hp.length; i++, k++) for (const s of [-1, 1]) {
          const m = new THREE.Mesh(storeGeo(kind, team), modelMaterial); m.position.set(s * hp[k][0], hp[k][1], hp[k][2]); m.scale.setScalar(STORE_SCALE[base] || 1); m.castShadow = true; grp.add(m); v.stMeshes.push(m);
        }
      }
      v.stGroup = grp; v.obj.add(grp); v.stTotal = v.stMeshes.length;
    }
  }
  if (!v.stGroup) return;
  let frac = 1;
  if (e.ap === 'equip') frac = e.eqN > 0 ? e.eqT / e.eqN : 1;
  else if (e.am && e.ed) {
    let tot = 0, left = 0; const ws = e.ed.weapons;
    for (let i = 0; i < ws.length; i++) if (ws[i].ammo > 0) { tot += ws[i].ammo; left += Math.max(0, e.am[i]); }
    if (tot > 0) frac = left / tot;
  }
  const n = Math.ceil(v.stTotal * frac - 1e-6);
  if (n !== v.stShown) { v.stShown = n; for (let i = 0; i < v.stMeshes.length; i++) v.stMeshes[i].visible = i < n; }
  v.stGroup.visible = v.lod < 2;
}

// ---------- ground crews ----------
export class CrewPool {
  constructor(scene, sim) { this.scene = scene; this.sim = sim; this.crew = []; this.carts = []; this.ci = 0; this.ki = 0; }
  begin() { this.ci = 0; this.ki = 0; }
  grab(list, def) {
    const i = def === 'crew' ? this.ci++ : this.ki++; let m = list[i];
    if (!m) { m = makeModel(def, 0); m.root.traverse((o) => { if (o.isMesh) o.castShadow = true; }); this.scene.add(m.root); list.push(m); }
    m.root.visible = true; return m.root;
  }
  // crews tend an aircraft that is being armed / re-armed
  tend(v, e, time, map) {
    const base = UNITS[e.def].base, hp = HARD[base]; if (!hp) return;
    const o = v.obj.position, yaw = v.yaw, sy = Math.sin(yaw), cy = Math.cos(yaw);
    const span = Math.max(...hp.map((h) => h[0])), W = (lx, lz) => [o.x + lx * cy + lz * sy, o.z - lx * sy + lz * cy];
    for (let k = 0; k < 4; k++) {
      const side = k & 1 ? 1 : -1, slot = k >> 1, h = hp[Math.min(hp.length - 1, slot * 2 + 1 + ((e.id + k) % 2 ? 0 : -1) + (slot ? 0 : 0))] || hp[0];
      const cartP = W(side * (span + 3.2), h[2] + slot * 1.2), wingP = W(side * h[0], h[2] + 2.6);
      const ph = (Math.sin(time * 1.15 + k * 2.1) + 1) / 2, t = ph * ph * (3 - 2 * ph), moving = t > 0.04 && t < 0.96;
      const x = cartP[0] + (wingP[0] - cartP[0]) * t, z = cartP[1] + (wingP[1] - cartP[1]) * t;
      const c = this.grab(this.crew, 'crew');
      c.position.set(x, Math.max(0, map.hAt(x, z)) + 0.12 + (moving ? Math.abs(Math.sin(time * 9 + k)) * 0.06 : 0), z);
      const dir = Math.cos(time * 1.15 + k * 2.1) > 0 ? 1 : -1;     // walking out toward the wing, then back to the cart
      const fx = (wingP[0] - cartP[0]) * dir, fz = (wingP[1] - cartP[1]) * dir;
      c.rotation.y = moving ? Math.atan2(fx, fz) : Math.atan2(wingP[0] - x, wingP[1] - z) + (k & 1 ? 0.3 : -0.3);
      c.scale.setScalar(1); c.rotation.x = moving ? 0 : (Math.sin(time * 6 + k) * 0.08 + 0.12);   // leans in to work at the pylon
    }
    for (const side of [-1, 1]) {
      const p = W(side * (span + 3.6), hp[0][2] + 0.4), c = this.grab(this.carts, 'cart');
      c.position.set(p[0], Math.max(0, map.hAt(p[0], p[1])) + 0.05, p[1]); c.rotation.y = yaw + PI / 2 * 0; c.scale.setScalar(1);
    }
  }
  end() {
    for (let i = this.ci; i < this.crew.length; i++) this.crew[i].root.visible = false;
    for (let i = this.ki; i < this.carts.length; i++) this.carts[i].root.visible = false;
  }
  dispose() { for (const m of this.crew.concat(this.carts)) this.scene.remove(m.root); this.crew.length = this.carts.length = 0; }
}
