// Procedural low-poly models. Forward direction is +Z. Geometry is merged per part-group
// (hull / turret / rotor) so each unit costs only a few draw calls.
import * as THREE from 'three';
import { PLAYER_COLORS, CELL, DEFS } from './sim/defs.js';

const OD = 0x59633f, OD2 = 0x4a5334, DARK = 0x2b3128, GREY = 0x6b7280, METAL = 0x3d444d, BLACK = 0x1a1c1f, TAN = 0x8a7f62, CONC = 0x8d9096, WHITE = 0xd9dde2, ORANGE = 0xe0832b, GLASS = 0x2a4256;
const T = 'team';
const PI = Math.PI;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cone: new THREE.ConeGeometry(1, 1, 10),
  sph: new THREE.SphereGeometry(1, 10, 8),
};
const NI = {}; for (const k in G) NI[k] = G[k].toNonIndexed();

class Builder {
  constructor(teamColor) {
    this.team = teamColor; this.groups = { hull: [] };
    this.cur = 'hull'; this.rp = {};
  }
  g(name) { this.cur = name; if (!this.groups[name]) this.groups[name] = []; if (!this.rp[name]) this.rp[name] = [0, 0, 0]; return this; }
  set pivot(v) { this.rp.turret = v; }
  get pivot() { return this.rp.turret || [0, 0, 0]; }
  set rotorPivot(v) { this.rp[this.cur] = v; }
  get rotorPivot() { return this.rp[this.cur] || [0, 0, 0]; }
  // pivot for the current group (limbs etc.)
  at(x, y, z) { this.rp[this.cur] = [x, y, z]; return this; }
  add(kind, sx, sy, sz, x, y, z, color, rot, spin) {
    const base = NI[kind];
    let px = x, py = y, pz = z;
    if (this.cur !== 'hull') { const rp = this.rp[this.cur] || [0, 0, 0]; px -= rp[0]; py -= rp[1]; pz -= rp[2]; }
    _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
    _q.setFromEuler(_e); _v.set(px, py, pz); _s.set(sx, sy, sz);
    _m.compose(_v, _q, _s);
    const g = base.clone(); g.applyMatrix4(_m);
    const pos = g.getAttribute('position').array, nor = g.getAttribute('normal').array;
    _c.set(color === T ? this.team : color);
    const cols = new Float32Array(pos.length), aw = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) {
      cols[i] = _c.r; cols[i + 1] = _c.g; cols[i + 2] = _c.b;
      if (spin) { aw[i] = spin[0]; aw[i + 1] = spin[1]; aw[i + 2] = 1; }   // wheel axle (y,z) + flag; spun in the vertex shader
    }
    this.groups[this.cur].push({ pos, nor, cols, aw });
    return this;
  }
  // helpers
  box(w, h, d, x, y, z, color, rot) { return this.add('box', w, h, d, x, y, z, color, rot); }
  cyl(r, h, x, y, z, color, rot, r2) { return this.add('cyl', r, h, r, x, y, z, color, rot); }
  cyl6(r, h, x, y, z, color, rot) { return this.add('cyl6', r, h, r, x, y, z, color, rot); }
  cone(r, h, x, y, z, color, rot) { return this.add('cone', r, h, r, x, y, z, color, rot); }
  sph(r, x, y, z, color, sy = 1) { return this.add('sph', r, r * sy, r, x, y, z, color); }
  // barrel along +Z starting at z0
  barrel(r, len, x, y, z0, color, pitch = 0) {
    // cylinder default axis Y -> rotate to Z; pitch raises muzzle
    const cy = Math.cos(pitch), sy = Math.sin(pitch);
    return this.add('cyl', r, len, r, x, y + sy * len * 0.5, z0 + cy * len * 0.5, color, [PI / 2 - pitch, 0, 0]);
  }
  wheel(r, w, x, y, z, color = BLACK) {
    this.add('cyl', r, w, r, x, y, z, color, [0, 0, PI / 2], [y, z]);
    return this.add('box', w * 1.05, r * 0.35, r * 1.5, x, y, z, 0x555a60, [0, 0, 0], [y, z]);   // hub bar so rotation is visible
  }
  finish() {
    const out = {};
    for (const name in this.groups) {
      const parts = this.groups[name]; if (!parts.length) continue;
      let n = 0; for (const p of parts) n += p.pos.length;
      const pos = new Float32Array(n), nor = new Float32Array(n), col = new Float32Array(n), aw = new Float32Array(n);
      let o = 0; for (const p of parts) { pos.set(p.pos, o); nor.set(p.nor, o); col.set(p.cols, o); aw.set(p.aw, o); o += p.pos.length; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('aw', new THREE.BufferAttribute(aw, 3));
      geo.computeBoundingSphere();
      out[name] = geo;
    }
    out.rp = this.rp;
    return out;
  }
}

function tracks(b, w, h, len, x, z = 0) {
  b.box(w, h, len, x, h / 2 + 0.15, z, BLACK);
  b.box(w * 0.9, 0.15, len + 0.4, x, h + 0.2, z, DARK);
}

const MODELS = {
  rifleman(b) {
    b.g('legL').at(-0.2, 0.8, 0); b.box(0.35, 0.8, 0.2, -0.2, 0.4, 0, DARK);
    b.g('legR').at(0.2, 0.8, 0); b.box(0.35, 0.8, 0.2, 0.2, 0.4, 0, DARK);
    b.g('hull');
    b.box(0.9, 0.9, 0.5, 0, 1.15, 0, OD); b.box(0.95, 0.4, 0.55, 0, 1.35, 0, T);
    b.sph(0.32, 0, 1.9, 0.02, 0xc9a27e); b.sph(0.37, 0, 2.0, 0, OD2, 0.8);
    b.box(0.12, 0.14, 1.3, 0.3, 1.3, 0.6, BLACK);
  },
  at(b) { MODELS.rifleman(b); b.cyl(0.14, 1.9, -0.5, 1.9, 0.2, DARK, [PI / 2, 0, 0]); b.box(0.2, 0.3, 0.2, -0.5, 1.9, 0.9, GREY); },
  manpads(b) { MODELS.rifleman(b); b.cyl(0.13, 1.7, -0.5, 1.95, 0.1, WHITE, [PI / 2, 0, 0]); b.cone(0.13, 0.4, -0.5, 1.95, 1.15, ORANGE, [PI / 2, 0, 0]); },
  engineer(b) {
    b.g('legL').at(-0.2, 0.8, 0); b.box(0.35, 0.8, 0.2, -0.2, 0.4, 0, DARK);
    b.g('legR').at(0.2, 0.8, 0); b.box(0.35, 0.8, 0.2, 0.2, 0.4, 0, DARK);
    b.g('hull');
    b.box(0.9, 0.9, 0.5, 0, 1.15, 0, ORANGE); b.box(0.95, 0.2, 0.55, 0, 1.25, 0, T);
    b.sph(0.32, 0, 1.9, 0.02, 0xc9a27e); b.sph(0.38, 0, 2.0, 0, 0xf2d230, 0.7);
    b.box(0.15, 1.0, 0.15, 0.6, 1.1, 0.3, METAL); b.box(0.45, 0.2, 0.15, 0.6, 1.7, 0.3, METAL);
  },
  scout(b) {
    b.box(2.2, 0.6, 4.2, 0, 0.95, 0, OD); b.box(2.0, 0.3, 1.2, 0, 1.35, 0.9, T);
    for (const x of [-1.2, 1.2]) for (const z of [-1.4, 1.4]) b.wheel(0.62, 0.45, x, 0.62, z);
    b.box(0.12, 0.9, 0.12, -0.9, 1.7, -0.4, DARK); b.box(0.12, 0.9, 0.12, 0.9, 1.7, -0.4, DARK);
    b.box(1.9, 0.1, 0.12, 0, 2.15, -0.4, DARK);
    b.g('turret'); b.pivot = [0, 1.6, -0.6];
    b.box(0.5, 0.4, 0.6, 0, 1.6, -0.6, METAL); b.barrel(0.07, 1.4, 0, 1.65, -0.4, BLACK);
  },
  ifv(b) {
    tracks(b, 0.9, 0.95, 5.6, -1.45); tracks(b, 0.9, 0.95, 5.6, 1.45);
    b.box(2.6, 0.9, 5.4, 0, 1.15, 0, OD); b.box(2.4, 0.5, 1.6, 0, 1.55, 1.8, OD2); b.box(2.65, 0.15, 5.0, 0, 1.0, 0, T);
    b.g('turret'); b.pivot = [0, 1.9, -0.4];
    b.box(1.6, 0.7, 1.9, 0, 1.95, -0.4, OD2); b.barrel(0.1, 2.2, 0.25, 2.0, 0.4, BLACK); b.box(0.5, 0.45, 0.9, -0.95, 2.1, -0.4, METAL);
    b.cyl(0.12, 0.8, -0.95, 2.1, 0.2, GREY, [PI / 2, 0, 0]);
  },
  mbt(b) {
    tracks(b, 1.0, 1.05, 6.4, -1.55); tracks(b, 1.0, 1.05, 6.4, 1.55);
    b.box(2.9, 0.85, 6.2, 0, 1.1, 0, OD); b.box(2.6, 0.5, 1.8, 0, 1.45, 2.2, OD2); b.box(2.95, 0.12, 5.6, 0, 1.0, 0, T);
    b.g('turret'); b.pivot = [0, 1.9, -0.3];
    b.box(2.2, 0.8, 2.8, 0, 1.95, -0.3, OD2); b.box(1.6, 0.4, 1.4, 0, 2.5, -0.5, OD);
    b.barrel(0.17, 4.4, 0, 2.0, 1.0, METAL); b.cyl(0.24, 0.8, 0, 2.0, 1.2, DARK, [PI / 2, 0, 0]);
    b.box(0.5, 0.3, 0.5, -0.6, 2.9, -0.7, T);
  },
  heavy(b) {
    tracks(b, 1.3, 1.2, 7.0, -1.95); tracks(b, 1.3, 1.2, 7.0, 1.95);
    b.box(3.9, 1.0, 6.8, 0, 1.3, 0, OD2); b.box(3.4, 0.6, 2.0, 0, 1.7, 2.5, OD); b.box(3.95, 0.14, 6.0, 0, 1.15, 0, T);
    b.box(0.2, 0.9, 6.2, -2.6, 1.3, 0, DARK); b.box(0.2, 0.9, 6.2, 2.6, 1.3, 0, DARK);
    b.g('turret'); b.pivot = [0, 2.1, -0.3];
    b.box(3.0, 1.0, 3.6, 0, 2.25, -0.3, OD); b.box(2.2, 0.5, 2.0, 0, 2.95, -0.5, OD2);
    b.barrel(0.24, 5.2, 0, 2.3, 1.3, METAL); b.cyl(0.34, 1.0, 0, 2.3, 1.5, DARK, [PI / 2, 0, 0]);
    b.box(0.7, 0.4, 0.7, -0.8, 3.35, -0.8, T);
  },
  aa(b) {
    tracks(b, 0.8, 0.9, 5.0, -1.4); tracks(b, 0.8, 0.9, 5.0, 1.4);
    b.box(2.5, 0.8, 4.8, 0, 1.05, 0, OD); b.box(2.55, 0.12, 4.4, 0, 0.95, 0, T);
    b.g('turret'); b.pivot = [0, 1.8, -0.2];
    b.box(1.9, 0.9, 1.9, 0, 1.9, -0.2, OD2);
    b.barrel(0.08, 2.6, -0.55, 2.4, 0.4, BLACK, 0.9); b.barrel(0.08, 2.6, 0.55, 2.4, 0.4, BLACK, 0.9);
    b.box(0.2, 1.0, 0.2, 0, 2.8, -0.9, GREY); b.cyl(0.7, 0.08, 0, 3.4, -0.9, GREY, [0.4, 0, 0]);
  },
  sph(b) {
    tracks(b, 0.9, 0.95, 5.8, -1.5); tracks(b, 0.9, 0.95, 5.8, 1.5);
    b.box(2.8, 0.8, 5.6, 0, 1.1, 0, OD); b.box(2.85, 0.12, 5.2, 0, 1.0, 0, T);
    b.g('turret'); b.pivot = [0, 1.8, -0.8];
    b.box(2.6, 1.3, 2.8, 0, 2.2, -0.9, OD2);
    b.barrel(0.22, 5.8, 0, 2.5, 0.2, METAL, 0.55); b.cyl(0.35, 0.9, 0, 2.5, 0.4, DARK, [PI / 2 - 0.55, 0, 0]);
  },
  mlrs(b) {
    for (const z of [-1.8, 0, 1.8]) for (const x of [-1.3, 1.3]) b.wheel(0.75, 0.55, x, 0.75, z);
    b.box(2.3, 0.7, 5.6, 0, 1.15, 0, OD); b.box(2.0, 1.2, 1.5, 0, 1.9, 2.0, OD2); b.box(2.35, 0.12, 5.2, 0, 1.0, 0, T);
    b.g('turret'); b.pivot = [0, 1.7, -1.0];
    b.box(2.0, 0.4, 3.0, 0, 1.7, -1.0, METAL);
    for (let i = 0; i < 6; i++) { const x = ((i % 3) - 1) * 0.62, y = 2.1 + Math.floor(i / 3) * 0.62; b.barrel(0.26, 3.4, x, y, -1.8, WHITE, 0.6); }
  },
  tel(b) {
    for (const z of [-3.0, -1.0, 1.0, 3.0]) for (const x of [-1.45, 1.45]) b.wheel(0.8, 0.6, x, 0.8, z);
    b.box(2.6, 0.7, 8.4, 0, 1.3, 0, OD); b.box(2.2, 1.3, 1.7, 0, 2.1, 3.2, OD2); b.box(2.65, 0.12, 8.0, 0, 1.1, 0, T);
    b.g('turret'); b.pivot = [0, 1.8, -1.2];
    b.box(1.6, 0.3, 6.0, 0, 1.8, -1.0, METAL);
    b.barrel(0.62, 6.8, 0, 2.7, -3.6, WHITE, 0.95); b.cone(0.62, 1.8, 0, 8.7, 0.7, T, [PI / 2 - 0.95, 0, 0]);
  },
  uav(b) {
    b.box(0.7, 0.6, 3.0, 0, 0, 0, WHITE); b.sph(0.4, 0, 0, 1.5, GREY, 0.8);
    b.box(6.0, 0.08, 0.9, 0, 0.05, 0.2, GREY); b.box(0.1, 0.8, 0.7, 0, 0.4, -1.3, T); b.box(1.8, 0.06, 0.5, 0, 0.1, -1.4, GREY);
    b.g('rotor'); b.rotorPivot = [0, 0, -1.6]; b.box(1.4, 0.06, 0.12, 0, 0, -1.6, BLACK); b.box(0.12, 1.4, 0.06, 0, 0, -1.6, BLACK);
  },
  heli(b) {
    b.sph(1.2, 0, 0, 0.2, OD, 0.85); b.box(1.4, 0.15, 2.2, 0, -0.1, 0.5, T);
    b.sph(0.8, 0, 0.0, 1.5, GLASS, 0.8);
    b.box(0.5, 0.5, 3.6, 0, 0.35, -2.4, OD); b.box(0.12, 1.1, 0.7, 0, 0.85, -4.0, OD2);
    b.box(3.0, 0.15, 0.7, 0, -0.1, 0.2, OD2);
    for (const x of [-1.6, 1.6]) { b.cyl(0.25, 1.2, x, -0.25, 0.4, METAL, [PI / 2, 0, 0]); b.cone(0.25, 0.4, x, -0.25, 1.2, BLACK, [PI / 2, 0, 0]); }
    b.box(0.12, 0.12, 2.6, -0.9, -1.1, 0.2, BLACK); b.box(0.12, 0.12, 2.6, 0.9, -1.1, 0.2, BLACK);
    b.box(0.1, 0.9, 0.1, -0.9, -0.65, 0.9, BLACK); b.box(0.1, 0.9, 0.1, 0.9, -0.65, 0.9, BLACK);
    b.box(0.1, 0.3, 0.1, 0, 1.15, 0.2, METAL);
    b.g('rotor'); b.rotorPivot = [0, 1.3, 0.2]; b.box(8.0, 0.06, 0.35, 0, 1.3, 0.2, BLACK); b.box(0.35, 0.06, 8.0, 0, 1.3, 0.2, BLACK);
    b.g('rotor2'); b.rotorPivot = [0.3, 0.85, -4.0]; b.box(0.06, 1.6, 0.2, 0.3, 0.85, -4.0, BLACK); b.box(0.06, 0.2, 1.6, 0.3, 0.85, -4.0, BLACK);
  },
  vtol(b) {
    b.box(1.2, 0.9, 6.0, 0, 0, 0, GREY); b.cone(0.62, 2.2, 0, 0, 4.0, GREY, [PI / 2, 0, 0]);
    b.box(0.7, 0.5, 1.4, 0, 0.55, 1.5, GLASS);
    b.box(7.0, 0.12, 1.8, 0, -0.1, -0.6, METAL); b.box(2.4, 0.1, 1.0, 0, 0.0, -2.8, METAL);
    b.box(0.1, 1.3, 1.1, -0.6, 0.8, -2.6, T); b.box(0.1, 1.3, 1.1, 0.6, 0.8, -2.6, T);
    for (const x of [-1.2, 1.2]) { b.cyl(0.4, 1.4, x, 0.15, -0.6, BLACK); b.cyl(0.32, 0.2, x, -0.58, -0.6, DARK); }
    for (const x of [-2.8, 2.8]) b.cyl(0.18, 1.4, x, -0.4, -0.2, WHITE, [PI / 2, 0, 0]);
  },

  // ---------------- drones & electronic warfare ----------------
  robot(b) {
    b.g('legL').at(-0.3, 1.0, 0); b.box(0.3, 0.9, 0.3, -0.3, 0.5, 0, METAL); b.box(0.4, 0.15, 0.6, -0.3, 0.08, 0.1, BLACK);
    b.g('legR').at(0.3, 1.0, 0); b.box(0.3, 0.9, 0.3, 0.3, 0.5, 0, METAL); b.box(0.4, 0.15, 0.6, 0.3, 0.08, 0.1, BLACK);
    b.g('hull');
    b.box(1.0, 1.0, 0.6, 0, 1.55, 0, 0xb5bcc4); b.box(1.05, 0.3, 0.65, 0, 1.75, 0, T);
    b.box(0.5, 0.45, 0.45, 0, 2.3, 0.05, METAL); b.box(0.42, 0.12, 0.1, 0, 2.32, 0.3, 0xff3a2e);
    b.box(0.2, 0.2, 0.2, -0.65, 1.8, 0, DARK); b.box(0.2, 0.2, 0.2, 0.65, 1.8, 0, DARK);
    b.box(0.14, 0.16, 1.3, 0.6, 1.5, 0.6, BLACK);
  },
  ewdog(b) {
    const hip = (n, x, z) => { b.g(n).at(x, 0.85, z); b.box(0.22, 0.55, 0.22, x, 0.6, z, METAL); b.box(0.2, 0.55, 0.2, x, 0.28, z + 0.1, DARK); };
    hip('legFL', -0.38, 0.8); hip('legFR', 0.38, 0.8); hip('legBL', -0.38, -0.8); hip('legBR', 0.38, -0.8);
    b.g('hull');
    b.box(0.9, 0.55, 2.2, 0, 1.1, 0, 0xb5bcc4); b.box(0.95, 0.15, 1.6, 0, 1.42, -0.1, T);
    b.box(0.5, 0.45, 0.6, 0, 1.3, 1.35, METAL); b.box(0.3, 0.2, 0.4, 0, 1.2, 1.8, DARK); b.box(0.25, 0.1, 0.1, 0, 1.45, 1.6, 0xff3a2e);
    b.box(0.12, 0.12, 0.6, 0, 1.2, -1.4, DARK);
    b.g('turret').at(0, 1.5, -0.3);                      // HPM emitter dish
    b.cyl(0.14, 0.7, 0, 1.75, -0.3, METAL); b.cyl(0.55, 0.12, 0, 2.15, -0.1, WHITE, [0.5, 0, 0]); b.cone(0.1, 0.35, 0, 2.2, 0.05, ORANGE, [0.5 + PI / 2, 0, 0]);
    b.g('rotor').at(0.0, 2.2, -0.6); b.box(0.04, 0.9, 0.04, 0, 2.7, -0.6, METAL); b.box(0.5, 0.06, 0.06, 0, 3.1, -0.6, ORANGE);   // spinning jammer whip
  },
  sapper(b) {
    for (const x of [-0.55, 0.55]) for (const z of [-0.5, 0.5]) b.wheel(0.3, 0.25, x, 0.3, z);
    b.box(1.0, 0.4, 1.7, 0, 0.55, 0, OD2); b.box(0.8, 0.45, 0.9, 0, 0.9, -0.1, ORANGE); b.box(0.82, 0.12, 0.92, 0, 1.15, -0.1, T);
    b.box(0.12, 0.35, 0.12, 0, 1.3, -0.1, 0xff3a2e);
  },
  repair(b) {
    b.g('legL').at(-0.4, 0.8, 0.2); b.box(0.25, 0.8, 0.5, -0.5, 0.4, 0.3, METAL); b.g('legR').at(0.4, 0.8, 0.2); b.box(0.25, 0.8, 0.5, 0.5, 0.4, 0.3, METAL);
    b.g('hull');
    b.box(1.3, 0.7, 1.8, 0, 1.15, 0, WHITE); b.box(1.35, 0.18, 1.85, 0, 1.2, 0, T);
    b.box(0.5, 0.15, 0.2, 0, 1.55, 0, 0xe8483a); b.box(0.15, 0.5, 0.2, 0, 1.55, 0, 0xe8483a);
    b.g('turret').at(0, 1.6, -0.2); b.box(0.2, 0.9, 0.2, 0, 2.0, -0.2, METAL); b.box(0.3, 0.3, 0.8, 0, 2.5, 0.2, DARK); b.cyl(0.12, 0.5, 0, 2.5, 0.8, ORANGE, [PI / 2, 0, 0]);
  },
  walker(b) {
    b.g('legL').at(-0.9, 2.2, 0); b.box(0.55, 1.2, 0.6, -0.9, 1.5, 0.1, METAL); b.box(0.5, 1.1, 0.5, -0.9, 0.55, -0.2, DARK); b.box(0.9, 0.3, 1.5, -0.9, 0.18, 0.1, BLACK);
    b.g('legR').at(0.9, 2.2, 0); b.box(0.55, 1.2, 0.6, 0.9, 1.5, 0.1, METAL); b.box(0.5, 1.1, 0.5, 0.9, 0.55, -0.2, DARK); b.box(0.9, 0.3, 1.5, 0.9, 0.18, 0.1, BLACK);
    b.g('hull');
    b.box(2.2, 0.8, 2.0, 0, 2.5, 0, OD2); b.box(2.3, 0.2, 2.1, 0, 2.95, 0, T);
    b.box(1.6, 0.9, 1.5, 0, 3.4, 0.1, OD); b.box(1.2, 0.35, 0.2, 0, 3.5, 0.95, 0xff3a2e);
    b.box(0.8, 0.7, 0.9, 0, 4.0, -0.2, METAL);
    b.g('turret').at(0, 3.2, 0.2);
    b.box(0.5, 0.5, 0.9, -1.35, 3.2, 0.2, METAL); b.barrel(0.14, 2.4, -1.35, 3.2, 0.6, BLACK);
    b.box(0.9, 0.7, 0.9, 1.35, 3.4, 0.1, OD2); for (const k of [0, 1, 2, 3]) b.barrel(0.12, 1.4, 1.1 + (k % 2) * 0.5, 3.2 + Math.floor(k / 2) * 0.4, 0.6, WHITE, 0.2);
  },
  fpv(b) {
    b.box(0.5, 0.18, 0.5, 0, 0, 0, DARK); b.box(0.2, 0.2, 0.34, 0, 0.06, 0.28, ORANGE); b.box(0.22, 0.08, 0.1, 0, 0.1, -0.2, 0xff3a2e);
    b.box(0.1, 0.05, 1.4, -0.0, -0.02, 0, 0x30343a, [0, 0.785, 0]); b.box(0.1, 0.05, 1.4, 0, -0.02, 0, 0x30343a, [0, -0.785, 0]);
    b.g('rotor').at(0, 0.18, 0);
    for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) b.box(0.55, 0.02, 0.07, x, 0.18, z, 0x9aa0a8);
  },
  wingman(b) {
    b.box(0.8, 0.6, 5.2, 0, 0, 0, GREY); b.cone(0.42, 1.8, 0, 0, 3.4, GREY, [PI / 2, 0, 0]); b.box(0.5, 0.3, 1.2, 0, 0.35, 1.2, GLASS);
    b.box(6.2, 0.08, 2.4, 0, -0.1, -0.3, METAL, [0, 0, 0]); b.box(2.4, 0.08, 0.9, 0, 0, -2.4, METAL);
    b.box(0.08, 0.9, 0.8, -0.5, 0.5, -2.3, T); b.box(0.08, 0.9, 0.8, 0.5, 0.5, -2.3, T);
    b.cyl(0.26, 0.7, 0, 0.0, -2.7, DARK, [PI / 2, 0, 0]);
    for (const x of [-1.8, 1.8]) b.cyl(0.14, 1.2, x, -0.25, 0.2, WHITE, [PI / 2, 0, 0]);
  },
  carrier(b) {
    b.box(0.9, 0.7, 4.4, 0, 0, 0, 0x4d535c); b.cone(0.45, 1.4, 0, 0, 2.9, 0x4d535c, [PI / 2, 0, 0]);
    b.box(0.95, 0.5, 1.6, 0, -0.2, 0, ORANGE); b.box(0.98, 0.1, 1.64, 0, 0.1, 0, T);
    b.box(5.0, 0.08, 1.2, 0, 0, -0.9, METAL); b.box(1.8, 0.08, 0.7, 0, 0.05, -1.9, METAL);
    b.box(0.08, 0.8, 0.6, 0, 0.55, -1.9, T);
    b.g('rotor').at(0, 0.1, -2.3); b.cyl(0.55, 0.05, 0, 0.1, -2.3, 0x9aa0a8, [PI / 2, 0, 0]);
  },
  empcarrier(b) {
    b.box(0.9, 0.7, 4.4, 0, 0, 0, 0x3a4a5e); b.cone(0.45, 1.4, 0, 0, 2.9, 0x3a4a5e, [PI / 2, 0, 0]);
    b.sph(0.75, 0, 0.05, 0.3, 0x5ec8ff, 0.8); b.box(0.98, 0.1, 1.64, 0, 0.4, 0, T);
    b.box(5.0, 0.08, 1.2, 0, 0, -0.9, METAL); b.box(1.8, 0.08, 0.7, 0, 0.05, -1.9, METAL);
    b.box(0.08, 0.8, 0.6, 0, 0.55, -1.9, T);
    b.g('rotor').at(0, 0.1, -2.3); b.cyl(0.55, 0.05, 0, 0.1, -2.3, 0x9aa0a8, [PI / 2, 0, 0]);
  },
  ewtruck(b) {
    for (const z of [-1.9, 0, 1.9]) for (const x of [-1.25, 1.25]) b.wheel(0.7, 0.5, x, 0.7, z);
    b.box(2.4, 0.7, 6.0, 0, 1.2, 0, OD); b.box(2.0, 1.2, 1.7, 0, 1.9, 2.1, OD2); b.box(2.45, 0.12, 5.6, 0, 1.05, 0, T);
    b.box(2.3, 1.6, 3.2, 0, 2.2, -1.2, 0xb5bcc4); b.box(0.15, 1.0, 0.15, 1.0, 3.4, -2.2, METAL); b.box(0.15, 1.0, 0.15, -1.0, 3.4, -2.2, METAL);
    b.g('rotor').at(0, 3.2, -0.6);
    b.box(0.2, 0.7, 0.2, 0, 3.55, -0.6, METAL); b.box(2.6, 0.16, 0.9, 0, 4.0, -0.6, WHITE); b.box(2.5, 0.08, 0.12, 0, 4.15, -0.6, ORANGE);
  },
  ewplane(b) {
    b.box(1.2, 1.0, 6.4, 0, 0, 0, WHITE); b.cone(0.6, 2.0, 0, 0, 4.1, WHITE, [PI / 2, 0, 0]);
    b.box(0.8, 0.5, 1.4, 0, 0.6, 1.8, GLASS);
    b.box(8.0, 0.14, 2.0, 0, -0.15, -0.3, GREY); b.box(2.8, 0.1, 1.0, 0, 0, -2.9, GREY);
    b.box(0.1, 1.4, 1.1, 0, 0.9, -2.8, T);
    b.cyl(0.6, 0.18, 0, 0.95, -0.4, METAL);
    for (const x of [-3.4, 3.4]) b.cyl(0.3, 1.8, x, -0.4, -0.2, 0xb5bcc4, [PI / 2, 0, 0]);
    b.g('rotor').at(0, 1.1, -0.4); b.box(2.6, 0.08, 0.3, 0, 1.1, -0.4, ORANGE); b.box(0.3, 0.08, 2.6, 0, 1.1, -0.4, ORANGE);
  },

  // ---------------- buildings (local space, footprint centered) ----------------
  hq(b) {
    b.box(15, 0.8, 15, 0, 0.4, 0, CONC);
    b.box(10, 5.5, 9, 0, 3.5, 0, OD2); b.box(10.3, 0.7, 9.3, 0, 6.3, 0, T);
    b.box(5, 3, 5, 0, 8.6, 0, GREY); b.box(5.2, 0.5, 5.2, 0, 10.2, 0, T);
    b.box(4, 1.4, 0.2, 0, 3.0, 4.6, GLASS);
    b.box(0.3, 5, 0.3, 4.5, 12.4, 4.5, METAL);
    b.box(3, 2.4, 3, -5.5, 2.0, 5.5, OD); b.box(3, 2.4, 3, 5.5, 2.0, -5.5, OD);
    b.g('rotor'); b.rotorPivot = [0, 11.2, 0]; b.cyl(1.9, 0.2, 0, 11.2, 0, GREY, [0.5, 0, 0]); b.box(0.3, 1.8, 0.3, 0, 10.6, 0, METAL);
  },
  derrick(b) {
    b.box(7.4, 0.5, 7.4, 0, 0.25, 0, CONC);
    b.box(2.5, 2.2, 3.2, 0, 1.6, -1.6, T); b.cyl(1.4, 2.6, 2.4, 1.8, 2.0, METAL); b.cyl(0.35, 4, -2.4, 2.5, 2.2, DARK);
    b.box(0.5, 3.5, 0.5, 0, 2.2, 1.0, METAL);
    b.g('rotor'); b.rotorPivot = [0, 4.0, 1.0];
    b.box(0.5, 0.6, 6.2, 0, 4.0, 1.0, OD); b.box(0.9, 1.1, 0.9, 0, 4.0, -2.0, DARK);
  },
  barracks(b) {
    b.box(11.4, 0.5, 11.4, 0, 0.25, 0, CONC);
    b.box(9.4, 3.2, 6.4, 0, 2.0, -0.8, OD); b.box(9.8, 0.5, 6.8, 0, 3.8, -0.8, T);
    b.box(9.4, 0.4, 3.0, 0, 3.4, 3.5, METAL); b.box(0.3, 3.2, 0.3, -4.5, 1.8, 4.8, METAL); b.box(0.3, 3.2, 0.3, 4.5, 1.8, 4.8, METAL);
    b.box(2.2, 2.2, 0.2, 0, 1.6, 2.5, DARK); b.box(0.15, 4.5, 0.15, 5.0, 3.0, -4.5, METAL); b.box(1.4, 0.9, 0.05, 5.7, 4.9, -4.5, T);
  },
  factory(b) {
    b.box(15.4, 0.5, 15.4, 0, 0.25, 0, CONC);
    b.box(13, 5.5, 11, 0, 3.2, -1.5, OD2); b.box(13.4, 0.7, 11.4, 0, 6.2, -1.5, T);
    b.box(6.5, 4.2, 0.3, 0, 2.7, 4.1, DARK);
    b.cyl(0.8, 5, -5, 8.5, -5, METAL); b.cyl(0.8, 3.5, -3, 7.8, -5, METAL);
    b.box(4, 2.5, 3, 4.5, 1.8, 6, OD);
  },
  airfield(b) {
    b.box(19.4, 0.3, 19.4, 0, 0.15, 0, 0x3a3d42);
    for (let i = -3; i <= 3; i++) b.box(0.5, 0.05, 2.2, i * 2.4, 0.33, 2, WHITE);
    b.box(8, 3.4, 6, -5, 2.0, -6, OD2); b.box(8.3, 0.5, 6.3, -5, 3.8, -6, T);
    b.box(2.2, 6, 2.2, 7, 3.3, -6, GREY); b.box(3.2, 1.4, 3.2, 7, 6.8, -6, GLASS); b.box(3.5, 0.3, 3.5, 7, 7.6, -6, T);
    b.g('rotor'); b.rotorPivot = [7, 8.5, -6]; b.box(2.2, 0.15, 0.15, 7, 8.5, -6, ORANGE);
  },
  techlab(b) {
    b.box(11.4, 0.5, 11.4, 0, 0.25, 0, CONC);
    b.box(8, 3, 8, 0, 2.0, 0, GREY); b.box(8.4, 0.5, 8.4, 0, 3.7, 0, T);
    b.sph(3.2, 0, 4.2, 0, WHITE, 0.8);
    b.box(0.3, 4, 0.3, 4.5, 3, 4.5, METAL);
    b.g('rotor'); b.rotorPivot = [-4.2, 4.8, -4.2]; b.cyl(1.4, 0.15, -4.2, 4.8, -4.2, METAL, [0.7, 0, 0]);
  },

  powerplant(b) {
    b.box(7.4, 0.4, 7.4, 0, 0.2, 0, CONC);
    b.box(5.2, 2.6, 4.0, 0, 1.7, 1.0, OD2); b.box(5.4, 0.4, 4.2, 0, 3.2, 1.0, T);
    b.cyl(1.2, 5.0, -2.0, 3.0, -2.2, CONC); b.cyl(1.0, 0.4, -2.0, 5.6, -2.2, DARK);
    b.box(1.6, 0.9, 1.6, 2.4, 2.6, -2.4, METAL); b.cyl(0.5, 1.6, 2.4, 3.6, -2.4, 0x5ec8ff);
    b.g('rotor').at(-2.0, 5.2, -2.2); b.box(0.2, 1.6, 0.2, -2.0, 5.2, -2.2, 0x5ec8ff);
  },
  dronebay(b) {
    b.box(15.4, 0.5, 15.4, 0, 0.25, 0, CONC);
    b.box(12, 4.4, 9, 0, 2.7, -2.0, 0x69737d); b.box(12.4, 0.6, 9.4, 0, 5.2, -2.0, T);
    b.box(8, 3.6, 0.3, 0, 2.4, 2.6, DARK); b.box(5, 0.6, 3.5, 0, 4.0, 4.4, METAL);
    b.cyl(1.8, 0.4, -4.5, 5.7, -4.5, WHITE); b.cyl(1.8, 0.4, 4.5, 5.7, 4.5, WHITE);
    for (const x of [-4.5, 4.5]) b.box(0.3, 1.0, 0.3, x, 5.5, -4.5 * Math.sign(x) * -1, METAL);
    b.box(3, 0.1, 3, 5.5, 0.55, 5.8, WHITE); b.box(2.2, 0.1, 2.2, 5.5, 0.6, 5.8, ORANGE);
    b.g('rotor').at(-4.5, 6.6, -4.5); b.box(0.2, 1.4, 0.2, -4.5, 6.6, -4.5, METAL); b.box(2.4, 0.14, 0.3, -4.5, 7.4, -4.5, ORANGE);
  },
  advtech(b) {
    b.box(11.4, 0.5, 11.4, 0, 0.25, 0, CONC);
    b.box(8, 4.2, 8, 0, 2.6, 0, 0x4a5568); b.box(8.4, 0.5, 8.4, 0, 4.9, 0, T);
    b.cyl(2.2, 3.2, 0, 6.8, 0, GREY); b.sph(3.0, 0, 8.8, 0, WHITE, 0.7);
    b.box(0.3, 6, 0.3, 4.5, 5, 4.5, METAL); b.box(0.3, 6, 0.3, -4.5, 5, -4.5, METAL);
    b.g('rotor').at(0, 11.0, 0); b.cyl(1.7, 0.15, 0, 11.0, 0, 0x5ec8ff, [0.6, 0, 0]); b.box(0.2, 1.4, 0.2, 0, 10.4, 0, METAL);
  },
  ewtower(b) {
    b.box(5.4, 0.4, 5.4, 0, 0.2, 0, CONC); b.box(2.4, 1.4, 2.4, 0, 1.1, 0, OD2);
    b.box(0.5, 9, 0.5, 0, 6, 0, METAL); for (const y of [4, 6.5, 9]) b.box(0.2, 0.2, 3.0 - (y - 4) * 0.18, 0, y, 0, GREY);
    b.box(1.6, 0.8, 1.6, 0, 10.8, 0, T);
    b.g('rotor').at(0, 11.5, 0); b.cyl(1.3, 0.16, 0, 11.5, 0, WHITE, [0.5, 0.0, 0]); b.box(0.12, 0.8, 0.12, 0, 11.2, 0, METAL);
  },

  turret(b) {
    b.cyl(1.7, 1.0, 0, 0.5, 0, CONC); b.cyl(1.2, 1.4, 0, 1.6, 0, OD2); b.box(2.6, 0.3, 2.6, 0, 0.15, 0, CONC);
    b.g('turret'); b.pivot = [0, 2.5, 0];
    b.box(1.8, 1.0, 2.0, 0, 2.5, 0, OD); b.box(1.9, 0.2, 2.1, 0, 3.05, 0, T);
    b.barrel(0.22, 3.4, 0, 2.5, 0.8, METAL); b.barrel(0.09, 2.2, 0.7, 2.7, 0.8, BLACK);
  },
  sam(b) {
    b.box(7, 0.4, 7, 0, 0.2, 0, CONC); b.cyl(1.6, 1.4, 0, 1.0, 0, OD2);
    b.g('turret'); b.pivot = [0, 2.0, 0];
    b.box(2.4, 0.6, 3.0, 0, 2.0, 0, OD); b.box(2.5, 0.15, 3.1, 0, 2.35, 0, T);
    for (const x of [-0.65, 0.65]) for (const y of [2.6, 3.3]) { b.barrel(0.28, 3.4, x, y, -0.8, WHITE, 0.75); b.cone(0.28, 0.6, x, y + 2.15, 1.55, ORANGE, [PI / 2 - 0.75, 0, 0]); }
  },
};

const cache = new Map();
const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.12, flatShading: true });

function geoms(def, team) {
  const key = def + ':' + team;
  let g = cache.get(key);
  if (!g) {
    const b = new Builder(PLAYER_COLORS[team % PLAYER_COLORS.length]);
    const base = DEFS[def] ? DEFS[def].base : def;
    (MODELS[base] || MODELS.rifleman)(b);
    g = b.finish(); cache.set(key, g);
  }
  return g;
}

// returns { root, turret, rotor, rotor2, parts }; parts maps group name -> mesh (limbs, axles ...)
export function makeModel(def, team) {
  const g = geoms(def, team), d = DEFS[def];
  const root = new THREE.Group();
  const out = { root, turret: null, rotor: null, rotor2: null, parts: {}, hull: null, base: d ? d.base : def };
  const hull = new THREE.Mesh(g.hull, material); hull.castShadow = true; hull.receiveShadow = false; root.add(hull); out.hull = hull;
  for (const name in g) {
    if (name === 'hull' || name === 'rp') continue;
    const m = new THREE.Mesh(g[name], material); m.castShadow = true;
    const rp = g.rp[name] || [0, 0, 0]; m.position.set(rp[0], rp[1], rp[2]); root.add(m); out.parts[name] = m;
  }
  out.turret = out.parts.turret || null; out.rotor = out.parts.rotor || null; out.rotor2 = out.parts.rotor2 || null;
  if (d && d.kind === 'unit' && d.tier > 1) root.scale.setScalar(1 + 0.07 * (d.tier - 1));
  return out;
}
export { material as modelMaterial };
