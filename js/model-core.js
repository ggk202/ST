// Model building toolkit: Builder (merged, vertex-coloured geometry in named part groups) plus a library of
// detail helpers (bolts, hatches, antennae, smoke launchers, remote weapon stations, APS radar, track sets ...).
// Forward is +Z, up is +Y. Group names: hull (default), turret (pivot), rotor/rotor2/prop*/propz* (spin),
// legL/legR/legFL... (walk cycle). Wheels carry a spin flag, track belts a scroll flag (handled in gfx.js shaders).
import * as THREE from 'three';

export const PI = Math.PI;
export const T = 'team';
export const C = {
  OD: 0x59633f, OD2: 0x4a5334, OD3: 0x6b7552, DARK: 0x2b3128, DARK2: 0x1d2024, GREY: 0x6b7280, METAL: 0x3d444d, STEEL: 0x8b9199, BLACK: 0x1a1c1f,
  TAN: 0x8a7f62, CONC: 0x8d9096, WHITE: 0xd9dde2, ORANGE: 0xe0832b, GLASS: 0x1c3850, RED: 0xd8362a, LAMP: 0xfff2b0, SKIN: 0xc9a27e, RUB: 0x14161a,
  GOLD: 0xc9a24a, CYAN: 0x5ec8ff, YEL: 0xf2d230, PANEL: 0xaab2bb, BOLT: 0x24272b,
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _t = new THREE.Color();

function wedgeGeo() {
  // triangular prism: vertical back face at z=-0.5, slope falling to the front edge (z=+0.5, y=-0.5). x spans +-0.5
  const g = new THREE.BufferGeometry();
  const a = [-0.5, -0.5, -0.5], b = [-0.5, 0.5, -0.5], c = [-0.5, -0.5, 0.5];
  const a2 = [0.5, -0.5, -0.5], b2 = [0.5, 0.5, -0.5], c2 = [0.5, -0.5, 0.5];
  const tri = (p, q, r) => [...p, ...q, ...r];
  const v = [
    ...tri(a, c, b), ...tri(a2, b2, c2),                    // side triangles
    ...tri(a, a2, c2), ...tri(a, c2, c),                    // bottom
    ...tri(a, b, b2), ...tri(a, b2, a2),                    // back
    ...tri(b, c, c2), ...tri(b, c2, b2),                    // slope
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
  return g;
}
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cyl4: new THREE.CylinderGeometry(1, 1, 1, 4),
  cone: new THREE.ConeGeometry(1, 1, 10),
  cone6: new THREE.ConeGeometry(1, 1, 6),
  sph: new THREE.SphereGeometry(1, 10, 8),
  sph6: new THREE.SphereGeometry(1, 7, 5),
};
const NI = {}; for (const k in G) NI[k] = G[k].toNonIndexed();
NI.wedge = wedgeGeo();

export class Builder {
  // lod: 0 full detail, 1 drops small parts (bolts, lamps ...), 2 also simplifies primitives and drops fine detail.
  // lodScale scales the size thresholds (small models use a smaller value, big structures a larger one).
  constructor(teamColor, lod = 0, lodScale = 1) {
    this.ox = this.oy = this.oz = 0;
    this.team = teamColor; this.groups = { hull: [] };
    this.cur = 'hull'; this.rp = {}; this.sc = 1; this.chains = {}; this.tint = null;
    this.lod = lod; this.thr = lod === 0 ? 0 : (lod === 1 ? 0.2 : 0.5) * lodScale;
  }
  // records a two-bone leg chain (hip, knee, ankle as [y, z]) used by the procedural IK animator
  chain(name, hip, knee, ankle) { const k = this.sc; this.chains[name] = { hip: [hip[0] * k, hip[1] * k], knee: [knee[0] * k, knee[1] * k], ankle: [ankle[0] * k, ankle[1] * k] }; return this; }
  // start a part group whose pivot is (x,y,z) and whose following primitives are given RELATIVE to that pivot
  rel(name, x, y, z) { this.g(name); this.at(x, y, z); this.ox = x; this.oy = y; this.oz = z; return this; }
  g(name) { this.ox = this.oy = this.oz = 0; this.cur = name; if (!this.groups[name]) this.groups[name] = []; if (!this.rp[name]) this.rp[name] = [0, 0, 0]; return this; }
  set pivot(v) { this.rp.turret = v.map((q) => q * this.sc); }
  get pivot() { return this.rp.turret || [0, 0, 0]; }
  set rotorPivot(v) { this.rp[this.cur] = v.map((q) => q * this.sc); }
  at(x, y, z) { this.rp[this.cur] = [x * this.sc, y * this.sc, z * this.sc]; return this; }
  add(kind, sx, sy, sz, x, y, z, color, rot, spin) {
    const k = this.sc;
    if (this.thr) {
      const sx2 = typeof kind === 'string' && kind !== 'box' && kind !== 'wedge' && !kind.startsWith('trap') ? 2 : 1;
      let a = sx * sx2 * k, c = sy * k, d = sz * sx2 * k, t;
      if (a > c) { t = a; a = c; c = t; } if (c > d) { t = c; c = d; d = t; } if (a > c) { t = a; a = c; c = t; }   // a<=c<=d
      if (c < this.thr && d < this.thr * 4) return this;
      if (this.lod >= 2 && typeof kind === 'string') kind = kind === 'cyl' ? 'cyl6' : kind === 'sph' ? 'sph6' : kind === 'cone' ? 'cone6' : kind;
    }
    const base = typeof kind === 'string' ? NI[kind] : kind;
    let px = (x + this.ox) * k, py = (y + this.oy) * k, pz = (z + this.oz) * k;
    if (this.cur !== 'hull') { const rp = this.rp[this.cur] || [0, 0, 0]; px -= rp[0]; py -= rp[1]; pz -= rp[2]; }
    _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
    _q.setFromEuler(_e); _v.set(px, py, pz); _s.set(sx * k, sy * k, sz * k);
    _m.compose(_v, _q, _s);
    const g = base.clone(); g.applyMatrix4(_m);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const pos = g.getAttribute('position').array, nor = g.getAttribute('normal').array;
    _c.set(color === T ? this.team : color);
    if (this.tint && color !== T) { const l = 0.2126 * _c.r + 0.7152 * _c.g + 0.0722 * _c.b, k = this.tint; _c.lerp(_t.setRGB(l * k[0], l * k[1], l * k[2]), k[3]); }
    const cols = new Float32Array(pos.length), aw = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) {
      cols[i] = _c.r; cols[i + 1] = _c.g; cols[i + 2] = _c.b;
      if (spin) { aw[i] = spin[0] * k; aw[i + 1] = spin[1] * k; aw[i + 2] = spin[2] || 1; }
    }
    this.groups[this.cur].push({ pos, nor, cols, aw });
    return this;
  }

  // raw geometry with per-vertex colour (indexed positions + smooth normals); pushes into the current group
  raw(pos, idx, colFn, flip) {
    const k = this.sc, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    let cx = 0, cy = 0, cz = 0; const n = pos.length / 3; for (let i = 0; i < pos.length; i += 3) { cx += pos[i]; cy += pos[i + 1]; cz += pos[i + 2]; } cx /= n; cy /= n; cz /= n;
    // orientation check: normals should point away from the centroid on average
    const nn = g.getAttribute('normal').array; let dot = 0; for (let i = 0; i < pos.length; i += 3) dot += nn[i] * (pos[i] - cx) + nn[i + 1] * (pos[i + 1] - cy) + nn[i + 2] * (pos[i + 2] - cz);
    if (dot < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
    const ni = g.toNonIndexed(), P = ni.getAttribute('position').array, N = ni.getAttribute('normal').array;
    const cols = new Float32Array(P.length), aw = new Float32Array(P.length);
    const rp = this.cur !== 'hull' ? (this.rp[this.cur] || [0, 0, 0]) : [0, 0, 0];
    for (let i = 0; i < P.length; i += 3) {
      colFn(P[i], P[i + 1], P[i + 2], _c);
      if (this.tint && !this._noTint) { const l = 0.2126 * _c.r + 0.7152 * _c.g + 0.0722 * _c.b, k = this.tint; _c.lerp(_t.setRGB(l * k[0], l * k[1], l * k[2]), k[3]); }
      cols[i] = _c.r; cols[i + 1] = _c.g; cols[i + 2] = _c.b;
      P[i] = P[i] * k - rp[0]; P[i + 1] = P[i + 1] * k - rp[1]; P[i + 2] = P[i + 2] * k - rp[2];
    }
    this.groups[this.cur].push({ pos: P, nor: N, cols, aw });
    return this;
  }
  // loft closed rings (arrays of [x,y,z], equal point count) into a smooth solid with flat end caps.
  // color: hex / T, or [top, bottom] hex for vertical shading across the part
  loft(rings, color, capEnds = true) {
    const m = rings[0].length, pos = [], idx = [];
    for (const r of rings) for (const p of r) pos.push(p[0], p[1], p[2]);
    for (let i = 0; i + 1 < rings.length; i++) for (let j = 0; j < m; j++) {
      const a = i * m + j, b2 = i * m + (j + 1) % m, c = (i + 1) * m + j, d = (i + 1) * m + (j + 1) % m;
      idx.push(a, b2, c, b2, d, c);
    }
    if (capEnds) for (const ri of [0, rings.length - 1]) {
      const r = rings[ri], base = pos.length / 3; let cx = 0, cy = 0, cz = 0; for (const p of r) { cx += p[0]; cy += p[1]; cz += p[2]; } cx /= m; cy /= m; cz /= m;
      for (const p of r) pos.push(p[0], p[1], p[2]); pos.push(cx, cy, cz);
      for (let j = 0; j < m; j++) idx.push(base + j, base + (j + 1) % m, base + m);
    }
    let y0 = 1e9, y1 = -1e9; for (let i = 1; i < pos.length; i += 3) { if (pos[i] < y0) y0 = pos[i]; if (pos[i] > y1) y1 = pos[i]; }
    this._noTint = color === T;
    const top = new THREE.Color(Array.isArray(color) ? color[0] : (color === T ? this.team : color)), bot = new THREE.Color(Array.isArray(color) ? color[1] : (color === T ? this.team : color));
    return this.raw(pos, idx, (x, y, z, out) => { const t = y1 > y0 ? (y - y0) / (y1 - y0) : 0.5; out.copy(bot).lerp(top, Math.min(1, Math.max(0, t * 1.15 - 0.05))); }, false);
  }
  // smooth fuselage / nacelle / canopy along Z from stations {z, w (half width), t (top), bt (bottom), y, x, p (superellipse exponent: 2 round, 3+ boxy, <2 faceted)}
  fuse(st, color, seg = 14) {
    if (this.lod === 1) seg = Math.max(8, seg - 4); else if (this.lod >= 2) seg = Math.max(6, seg - 8);
    const rings = st.map((q) => {
      const p = 2 / (q.p || 2.2), r = [];
      for (let j = 0; j < seg; j++) {
        const a = j / seg * PI * 2, c = Math.cos(a), s = Math.sin(a);
        r.push([(q.x || 0) + q.w * Math.sign(c) * Math.pow(Math.abs(c), p), (q.y || 0) + (s >= 0 ? q.t : (q.bt ?? q.t)) * Math.sign(s) * Math.pow(Math.abs(s), p), q.z]);
      }
      return r;
    });
    return this.loft(rings, color);
  }
  // swept tapered aerofoil panel. sections [{x (span pos), z (leading edge), c (chord), y, t (half thickness)}]; map(x,y,z) turns local to model space
  // (default identity, pass a mapper for fins / mirrored wings)
  wing(sec, color, map) {
    const f = map || ((x, y, z) => [x, y, z]);
    const rings = sec.map((q) => [[q.x, q.y, q.z], [q.x, q.y + q.t, q.z - q.c * 0.22], [q.x, q.y + q.t * 0.7, q.z - q.c * 0.65], [q.x, q.y + q.t * 0.1, q.z - q.c], [q.x, q.y - q.t * 0.6, q.z - q.c * 0.65], [q.x, q.y - q.t, q.z - q.c * 0.22]].map((p) => f(p[0], p[1], p[2])));
    return this.loft(rings, color);
  }
  wingPair(sec, color) { this.wing(sec, color); return this.wing(sec, color, (x, y, z) => [-x, y, z]); }
  box(w, h, d, x, y, z, color, rot) { return this.add('box', w, h, d, x, y, z, color, rot); }
  cyl(r, h, x, y, z, color, rot) { return this.add('cyl', r, h, r, x, y, z, color, rot); }
  cyl6(r, h, x, y, z, color, rot) { return this.add('cyl6', r, h, r, x, y, z, color, rot); }
  cyl4(r, h, x, y, z, color, rot) { return this.add('cyl4', r, h, r, x, y, z, color, rot); }
  cone(r, h, x, y, z, color, rot) { return this.add('cone', r, h, r, x, y, z, color, rot); }
  cone6(r, h, x, y, z, color, rot) { return this.add('cone6', r, h, r, x, y, z, color, rot); }
  sph(r, x, y, z, color, sy = 1, sz = 1) { return this.add('sph', r, r * sy, r * sz, x, y, z, color); }
  sph6(r, x, y, z, color, sy = 1) { return this.add('sph6', r, r * sy, r, x, y, z, color); }
  // triangular prism: back face tall, front edge low. w=x, h=y, d=z
  wedge(w, h, d, x, y, z, color, rot) { return this.add('wedge', w, h, d, x, y, z, color, rot); }
  // box with a tapered top: top face is scaled by (tx, tz)
  trap(w, h, d, tx, tz, x, y, z, color, rot) {
    const key = 'trap' + tx + ',' + tz; if (!NI[key]) { const g = new THREE.BoxGeometry(1, 1, 1); const p = g.getAttribute('position'); for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * tx); p.setZ(i, p.getZ(i) * tz); } g.computeVertexNormals(); NI[key] = g.toNonIndexed(); NI[key].computeVertexNormals(); }
    return this.add(key, w, h, d, x, y, z, color, rot);
  }
  // barrel along +Z starting at z0, pitched up by `pitch`
  barrel(r, len, x, y, z0, color, pitch = 0) {
    const cy = Math.cos(pitch), sy = Math.sin(pitch);
    return this.add('cyl', r, len, r, x, y + sy * len * 0.5, z0 + cy * len * 0.5, color, [PI / 2 - pitch, 0, 0]);
  }
  // tube/strut between two points
  pipe(x0, y0, z0, x1, y1, z1, r, color, kind = 'cyl6') {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3;
    _q.setFromUnitVectors(_v.set(0, 1, 0), _s.set(dx / l, dy / l, dz / l)); _e.setFromQuaternion(_q, 'XYZ');
    return this.add(kind, r, l, r, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, color, [_e.x, _e.y, _e.z]);
  }
  wheel(r, w, x, y, z, color = C.RUB, hub = 0x555a60) {
    this.add('cyl', r, w, r, x, y, z, color, [0, 0, PI / 2], [y, z]);
    this.add('cyl6', r * 0.55, w * 1.04, r * 0.55, x, y, z, hub, [0, 0, PI / 2], [y, z]);
    return this.add('box', w * 1.08, r * 0.3, r * 1.3, x, y, z, 0x2f3338, [0, 0, 0], [y, z]);   // spoke bar so rotation is visible
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
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      out[name] = geo;
    }
    out.rp = this.rp; out.chains = this.chains;
    return out;
  }
}

// ------------------------------------------------------------------ detail helpers
const { OD2, DARK, DARK2, METAL, STEEL, BLACK, GLASS, LAMP, BOLT, GREY, RED, WHITE, RUB } = C;
const lerp = (a, b, t) => a + (b - a) * t;
export const H = {
  bolt(b, x, y, z, s = 0.07, c = BOLT) { b.box(s, s, s, x, y, z, c); },
  boltLine(b, x0, y0, z0, x1, y1, z1, n, s = 0.07, c = BOLT) { for (let i = 0; i < n; i++) { const t = n > 1 ? i / (n - 1) : 0.5; b.box(s, s, s, lerp(x0, x1, t), lerp(y0, y1, t), lerp(z0, z1, t), c); } },
  boltRing(b, cx, y, cz, r, n, s = 0.06, c = BOLT) { for (let i = 0; i < n; i++) { const a = i / n * PI * 2; b.box(s, s, s, cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, c); } },
  // round crew hatch with handle, hinge and bolts
  hatch(b, x, y, z, r, col = OD2) {
    b.cyl(r * 1.08, 0.08, x, y, z, DARK2); b.cyl(r, 0.1, x, y + 0.08, z, col); b.cyl(r * 0.8, 0.05, x, y + 0.15, z, METAL);
    b.box(r * 0.7, 0.06, 0.08, x, y + 0.2, z, STEEL); b.box(0.14, 0.1, 0.12, x, y + 0.1, z - r * 1.02, DARK2);
    H.boltRing(b, x, y + 0.14, z, r * 0.9, 6, 0.05);
  },
  // square access hatch / panel with bolts
  panel(b, x, y, z, w, d, col = OD2) { b.box(w, 0.06, d, x, y, z, col); b.box(w * 0.82, 0.04, d * 0.82, x, y + 0.04, z, METAL); H.boltLine(b, x - w * 0.46, y + 0.04, z - d * 0.46, x + w * 0.46, y + 0.04, z - d * 0.46, 3, 0.05); H.boltLine(b, x - w * 0.46, y + 0.04, z + d * 0.46, x + w * 0.46, y + 0.04, z + d * 0.46, 3, 0.05); },
  antenna(b, x, y, z, h, c = BLACK, r = 0.022) { b.cyl6(r * 3, 0.2, x, y + 0.1, z, METAL); b.cyl6(r * 1.6, 0.1, x, y + 0.24, z, DARK2); b.cyl6(r, h, x, y + h / 2 + 0.2, z, c); b.sph6(r * 1.6, x, y + h + 0.2, z, c); },
  // spring-base whip with a flag
  whip(b, x, y, z, h, flag = null) { H.antenna(b, x, y, z, h); if (flag) b.box(0.02, 0.28, 0.4, x, y + h - 0.1, z - 0.2, flag); },
  // blade / patch antenna
  blade(b, x, y, z, w = 0.4, h = 0.3, c = GREY) { b.box(0.04, h, w, x, y + h / 2, z, c, [0, 0, 0]); b.box(0.12, 0.05, w * 0.8, x, y + 0.03, z, DARK2); },
  // grenade launcher bank (smoke), tubes angled up and forward; side = -1 left / +1 right
  smoke(b, x, y, z, side = 1, n = 4, yaw = 0) {
    b.box(0.2, 0.3, n * 0.15 + 0.1, x, y, z, DARK, [0, yaw, 0]);
    for (let i = 0; i < n; i++) { const zz = z + (i - (n - 1) / 2) * 0.15; b.barrel(0.065, 0.42, x + side * 0.12, y + 0.05, zz - 0.05, METAL, 0.55); b.cyl(0.07, 0.03, x + side * 0.12, y + 0.07, zz + 0.12, BLACK); }
  },
  // remote controlled weapon station
  rcws(b, x, y, z, s = 1, yaw = 0) {
    b.cyl(0.3 * s, 0.14 * s, x, y + 0.07 * s, z, DARK2); b.cyl(0.24 * s, 0.1 * s, x, y + 0.18 * s, z, METAL);
    b.box(0.34 * s, 0.26 * s, 0.5 * s, x, y + 0.36 * s, z, OD2, [0, yaw, 0]);
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    b.barrel(0.04 * s, 0.75 * s, x + cy * 0.12 * s, y + 0.38 * s, z - sy * 0.12 * s + 0.2 * s, BLACK, 0); b.cyl(0.06 * s, 0.24 * s, x + cy * 0.12 * s, y + 0.38 * s, z + 0.48 * s, METAL, [PI / 2, 0, 0]);
    b.box(0.2 * s, 0.2 * s, 0.22 * s, x - cy * 0.3 * s, y + 0.34 * s, z - 0.02 * s, DARK);               // ammo box
    b.box(0.16 * s, 0.16 * s, 0.22 * s, x + cy * 0.04 * s, y + 0.6 * s, z + 0.08 * s, DARK2); b.box(0.1 * s, 0.1 * s, 0.03 * s, x + cy * 0.04 * s, y + 0.6 * s, z + 0.2 * s, GLASS);   // sight
    b.cyl6(0.03 * s, 0.3 * s, x - 0.1 * s, y + 0.62 * s, z - 0.12 * s, BLACK);
  },
  // flat-panel active protection radar (yaw faces outward)
  apsPanel(b, x, y, z, yaw, s = 1) {
    b.box(0.74 * s, 0.56 * s, 0.07, x, y, z, DARK2, [0, yaw, 0]);
    const nx = Math.sin(yaw) * 0.045, nz = Math.cos(yaw) * 0.045;
    b.box(0.6 * s, 0.42 * s, 0.03, x + nx, y, z + nz, GLASS, [0, yaw, 0]);
    for (let i = 0; i < 3; i++) b.box(0.5 * s, 0.025, 0.02, x + nx * 1.5, y + (i - 1) * 0.12 * s, z + nz * 1.5, 0x34556f, [0, yaw, 0]);
    b.box(0.08, 0.08, 0.1, x - Math.cos(yaw) * 0.32 * s, y + 0.34 * s, z + Math.sin(yaw) * 0.32 * s, METAL, [0, yaw, 0]);
  },
  // optics head: housing + lens
  sight(b, x, y, z, s = 1, yaw = 0) {
    b.box(0.36 * s, 0.26 * s, 0.34 * s, x, y, z, DARK2, [0, yaw, 0]); b.cyl6(0.08 * s, 0.06, x + Math.sin(yaw) * 0.19 * s, y + 0.03, z + Math.cos(yaw) * 0.19 * s, GLASS, [PI / 2, 0, yaw]);
    b.cyl6(0.06 * s, 0.05, x + Math.sin(yaw) * 0.19 * s, y - 0.07 * s, z + Math.cos(yaw) * 0.19 * s, 0x4a6a2a, [PI / 2, 0, yaw]);
  },
  lamp(b, x, y, z, c = LAMP, s = 0.16) { b.box(s * 1.2, s, s * 0.6, x, y, z, DARK2); b.box(s, s * 0.8, 0.04, x, y, z + s * 0.32, c); },
  // louvred grille
  vent(b, x, y, z, w, d, n = 6, c = DARK2) { b.box(w, 0.05, d, x, y, z, c); for (let i = 0; i < n; i++) b.box(w * 0.92, 0.07, d / (n * 2.2), x, y + 0.04, z - d / 2 + (i + 0.5) * d / n, METAL); },
  // explosive reactive armour tile grid on a horizontal plane
  era(b, x, y, z, w, d, nx, nz, yaw = 0, col = OD2) {
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const lx = (i - (nx - 1) / 2) * (w / nx), lz = (j - (nz - 1) / 2) * (d / nz), c = Math.cos(yaw), s = Math.sin(yaw);
      b.box(w / nx * 0.88, 0.09, d / nz * 0.88, x + lx * c + lz * s, y, z - lx * s + lz * c, col, [0, yaw, 0]); b.box(w / nx * 0.3, 0.1, d / nz * 0.3, x + lx * c + lz * s, y + 0.02, z - lx * s + lz * c, BOLT, [0, yaw, 0]);
    }
  },
  // vertical ERA wall (facing +z when yaw=0) of nx*ny bricks
  eraWall(b, x, y, z, w, h, nx, ny, yaw = 0, col = OD2) {
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const lx = (i - (nx - 1) / 2) * (w / nx), ly = (j - (ny - 1) / 2) * (h / ny), c = Math.cos(yaw), s = Math.sin(yaw);
      b.box(w / nx * 0.9, h / ny * 0.9, 0.1, x + lx * c, y + ly, z - lx * s, col, [0, yaw, 0]); b.box(0.05, 0.05, 0.12, x + lx * c, y + ly, z - lx * s, BOLT, [0, yaw, 0]);
    }
  },
  exhaust(b, x, y, z, r = 0.18, len = 0.5, rot = [PI / 2, 0, 0]) { b.cyl(r, len, x, y, z, 0x2a2420, rot); b.cyl(r * 0.7, len * 1.05, x, y, z, BLACK, rot); },
  hazard(b, x, y, z, w, d, n = 5) { for (let i = 0; i < n; i++) b.box(w / n * 0.5, 0.03, d, x - w / 2 + (i + 0.5) * w / n, y, z, i & 1 ? 0xe8c020 : BLACK); },
  // complete track unit: belt (scrolling), road wheels, sprocket, idler, return rollers, fender with bolts, mud flaps
  tracks(b, x, len, h = 0.95, w = 1.0, nw = 6, wr = 0.42) {
    const cy = wr + 0.1, topY = cy * 2 + 0.07;
    const belt = (sx, sy, sz, px, py, pz, rot) => b.add('box', sx, sy, sz, px, py, pz, BLACK, rot || [0, 0, 0], [0, 0, 2]);
    belt(w, 0.14, len - wr * 1.2, x, 0.09, 0); belt(w, 0.14, len - wr * 1.2, x, topY, 0);
    belt(w, 0.14, wr * 1.9, x, cy + wr * 0.4, len / 2 - wr * 0.2, [0.9, 0, 0]); belt(w, 0.14, wr * 1.9, x, cy + wr * 0.4, -len / 2 + wr * 0.2, [-0.9, 0, 0]);
    belt(w, 0.14, wr * 1.2, x, cy, len / 2 + wr * 0.1, [0, 0, 0]); belt(w, 0.14, wr * 1.2, x, cy, -len / 2 - wr * 0.1, [0, 0, 0]);
    const span = len - wr * 3.2;
    for (let i = 0; i < nw; i++) { const z = -span / 2 + i * span / (nw - 1); b.wheel(wr, w * 0.82, x, cy, z, 0x30353a, 0x6b7078); for (let k = 0; k < 5; k++) { const a = k / 5 * PI * 2; b.add('box', 0.05, 0.05, 0.05, x + Math.sign(x || 1) * (w * 0.42 + 0.03), cy + Math.sin(a) * wr * 0.4, z + Math.cos(a) * wr * 0.4, BOLT, [0, 0, 0], [cy, z]); } }
    b.wheel(wr * 1.15, w * 0.8, x, cy + 0.12, len / 2 - wr * 0.6, 0x2b3035, 0x7a8088);              // drive sprocket
    b.wheel(wr * 0.95, w * 0.8, x, cy, -len / 2 + wr * 0.55, 0x2b3035, 0x7a8088);                    // idler
    for (let i = 0; i < 3; i++) b.wheel(0.16, w * 0.7, x, topY + 0.2, -span / 2 + (i + 0.5) * span / 3 + 0.4, 0x30353a, 0x6b7078);   // return rollers
    b.box(w * 1.12, 0.1, len + 0.25, x, topY + 0.4, 0, OD2);                                         // fender
    b.box(w * 1.12, 0.1, 0.6, x, topY + 0.3, len / 2 + 0.2, OD2, [0.4, 0, 0]);
    H.boltLine(b, x - w * 0.5, topY + 0.47, -len / 2 + 0.3, x - w * 0.5, topY + 0.47, len / 2 - 0.3, 7, 0.06); H.boltLine(b, x + w * 0.5, topY + 0.47, -len / 2 + 0.3, x + w * 0.5, topY + 0.47, len / 2 - 0.3, 7, 0.06);
    b.box(w * 0.9, 0.5, 0.06, x, 0.4, -len / 2 - 0.35, RUB);                                         // mud flap
  },
  // side skirt: n plates with bolts and a hinge strip
  skirt(b, x, y, z, len, h, n = 5, col = OD2) {
    const pl = len / n; const sx = Math.sign(x || 1);
    for (let i = 0; i < n; i++) {
      const zz = z - len / 2 + (i + 0.5) * pl; b.box(0.1, h, pl * 0.94, x, y, zz, col); b.box(0.04, h * 0.7, pl * 0.7, x + sx * 0.06, y, zz, METAL);
      H.bolt(b, x + sx * 0.07, y + h * 0.4, zz - pl * 0.38); H.bolt(b, x + sx * 0.07, y + h * 0.4, zz + pl * 0.38); H.bolt(b, x + sx * 0.07, y - h * 0.4, zz - pl * 0.38); H.bolt(b, x + sx * 0.07, y - h * 0.4, zz + pl * 0.38);
    }
    b.box(0.14, 0.08, len, x, y + h / 2 + 0.04, z, DARK2);
  },
  // tow cable coil / spare roller
  cable(b, x, y, z, w, c = 0x2a2c2e) { b.cyl(0.07, w, x, y, z, c, [0, 0, PI / 2]); b.cyl(0.07, w, x, y + 0.14, z, c, [0, 0, PI / 2]); b.box(0.06, 0.28, 0.1, x - w / 2, y + 0.07, z, METAL); b.box(0.06, 0.28, 0.1, x + w / 2, y + 0.07, z, METAL); },
  // rack of tubes (rocket pod / missile launcher); nx*ny tubes pointing +z, open front visible
  pod(b, x, y, z, nx, ny, r, len, pitch = 0, capCol = DARK2) {
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const px = x + (i - (nx - 1) / 2) * r * 2.15, py = y + (j - (ny - 1) / 2) * r * 2.15;
      b.barrel(r, len, px, py, z, METAL, pitch); b.barrel(r * 0.72, 0.04, px, py + Math.sin(pitch) * (len + 0.02), z + (len + 0.02) * Math.cos(pitch), capCol, pitch);
      b.barrel(r * 1.12, 0.12, px, py, z + 0.05 * Math.cos(pitch), DARK, pitch);
    }
  },
};
