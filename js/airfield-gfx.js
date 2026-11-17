// Airfield ground graphics: terrain-draped runway, taxiways and apron (grows with the airfield's modules) plus the hangar and
// munitions-depot structures. Everything is derived from the sim entity (b.afd frame, b.mods, b.up) so it matches ground ops.
import * as THREE from 'three';
import { AF, AF_MODULES } from './sim/defs.js';
import { makeModel } from './models.js';

const ASPH = 0x33363a, ASPH2 = 0x3b3f44, CONC = 0x6d7278, CONC2 = 0x63686e, WHITE = 0xe6e8ea, YEL = 0xe0b020, GRN = 0x3aff6a, BLU = 0x4aa8ff;
const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
const hex = (c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

class Paint {
  constructor(sim, b) { this.sim = sim; this.b = b; this.pos = []; this.col = []; this.idx = []; }
  // a rectangle in the airfield's (u,v) frame, draped over the terrain
  quad(u0, u1, v0, v1, color, lift, step = 2.6, jitter = 0) {
    if (u1 <= u0 || v1 <= v0) return;
    const nu = Math.max(1, Math.ceil((u1 - u0) / step)), nv = Math.max(1, Math.ceil((v1 - v0) / step)), base = this.pos.length / 3, c = hex(color), map = this.sim.map;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = u0 + (u1 - u0) * i / nu, v = v0 + (v1 - v0) * j / nv, p = this.sim.afPt(this.b, u, v);
      this.pos.push(p.x, Math.max(0.05, map.hAt(p.x, p.z)) + lift, p.z);
      const k = jitter ? 1 + (((i * 7 + j * 13) % 5) - 2) * jitter : 1; this.col.push(c[0] * k, c[1] * k, c[2] * k);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = base + j * (nu + 1) + i, b = a + 1, d = a + nu + 1, e = d + 1; this.idx.push(a, d, b, b, d, e); }
  }
  rectLine(u0, u1, v0, v1, w, color, lift) { this.quad(u0, u1, v0, v0 + w, color, lift, 4); this.quad(u0, u1, v1 - w, v1, color, lift, 4); this.quad(u0, u0 + w, v0, v1, color, lift, 4); this.quad(u1 - w, u1, v0, v1, color, lift, 4); }
  mesh() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3)); g.setIndex(this.idx); const nr = new Float32Array(this.pos.length); for (let i = 1; i < nr.length; i += 3) nr[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nr, 3));
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.frustumCulled = false; m.renderOrder = 1; return m;
  }
}

export class AirfieldGfx {
  constructor(scene, sim, b, team, scatter) { this.scatter = scatter; this.scene = scene; this.sim = sim; this.team = team; this.group = new THREE.Group(); this.sig = ''; scene.add(this.group); this.update(b, true); }
  dispose() { this.clear(); this.scene.remove(this.group); }
  clear() { for (const c of [...this.group.children]) { this.group.remove(c); if (c.geometry) c.geometry.dispose(); } }
  update(b, vis) {
    this.group.visible = vis;
    if (!b.afd) return;
    // runway extension grows while it is being built
    let rwLen = AF.rwLen[1 + b.mods.runway];
    if (b.up && b.up.key === 'runway') { const prog = 1 - b.up.left / b.up.total; rwLen = rwLen + (AF.rwLen[2 + b.mods.runway] - rwLen) * Math.floor(prog * 8) / 8; }
    const sig = [b.mods.runway, b.mods.apron, b.mods.depot, rwLen, b.up ? b.up.key : '', b.progress >= 1 ? 1 : 0].join(',');
    if (sig === this.sig) return; this.sig = sig;
    if (this.scatter && !this.cleared && b.afd) {
      this.cleared = true; const R = sim_rects(this.sim, b);
      this.scatter.clearRects(R);
    }
    this.clear(); this.build(b, rwLen);
  }
  build(b, rwLen) {
    const sim = this.sim, g = b.afd, r0 = AF.rw0, hw = AF.rwHalf, P = new Paint(sim, b), apr = b.mods.apron, pairs = 1 + apr + 1;   // apron pairs: 2 stands each (base + upgrades)
    const uEnd = r0 + rwLen, aprU1 = 10 + 18 + 12 * apr;
    // --- runway
    P.quad(r0 - 2, uEnd, -hw, hw, ASPH, 0.2, 2.6, 0.03);
    P.quad(r0 - 6, r0 - 2, -3, 3, ASPH2, 0.2);                                                    // runway-to-apron connector
    for (let u = r0 + 8; u < uEnd - 8; u += 6) P.quad(u, u + 3, -0.25, 0.25, WHITE, 0.24, 4);          // dashed centre line
    P.rectLine(r0 - 2, uEnd, -hw, hw, 0.35, WHITE, 0.24);
    for (let i = 0; i < 8; i++) { P.quad(r0 + 0.8, r0 + 5.2, -hw + 0.9 + i * 1.4, -hw + 1.55 + i * 1.4, WHITE, 0.24, 4); P.quad(uEnd - 5.2, uEnd - 0.8, -hw + 0.9 + i * 1.4, -hw + 1.55 + i * 1.4, WHITE, 0.24, 4); }   // thresholds
    for (let u = r0 + 10; u < uEnd - 10; u += 7) { P.quad(u, u + 3, -3.6, -2.6, WHITE, 0.24, 4); P.quad(u, u + 3, 2.6, 3.6, WHITE, 0.24, 4); }   // touchdown marks
    for (let u = r0 + 3; u < uEnd; u += 6) { P.quad(u, u + 0.6, -hw - 0.5, -hw, BLU, 0.3, 4); P.quad(u, u + 0.6, hw, hw + 0.5, BLU, 0.3, 4); }   // edge lights
    P.quad(r0 + AF.hold - 0.3, r0 + AF.hold + 0.3, -hw, hw, YEL, 0.25, 4);                           // hold / arming line
    for (const e of [uEnd - 0.6]) for (const s of [-1, 1]) P.quad(e, e + 0.7, s * 1.6 - 0.3, s * 1.6 + 0.3, GRN, 0.3, 4);
    // --- apron + lanes
    P.quad(10, aprU1, AF.apV0, AF.apV1, CONC, 0.2, 3, 0.04);
    P.quad(AF.conn - 2.4, AF.conn + 2.4, -hw, AF.lane + 2.4, CONC2, 0.22, 3);                         // connector taxiway
    for (const lane of [AF.apV0 - 0.5, AF.lane]) P.quad(AF.conn, aprU1 - 4, lane - 0.14, lane + 0.14, YEL, 0.26, 4);
    P.quad(AF.conn - 0.14, AF.conn + 0.14, 0, AF.lane, YEL, 0.26, 4);
    P.quad(AF.conn, AF.rw0 + AF.hold, -0.14, 0.14, YEL, 0.26, 4);
    const n = sim.afStandCount(b);
    for (let i = 0; i < 6; i++) {
      const us = AF.standU0 + AF.standDU * (i >> 1), vs = AF.rowV[i & 1], built = i < n;
      if (!built) { P.rectLine(us - 5.4, us + 5.4, vs - 5.4, vs + 5.4, 0.18, 0x55595e, 0.22); continue; }       // planned bays shown as faint outlines
      P.rectLine(us - 5.4, us + 5.4, vs - 5.4, vs + 5.4, 0.22, WHITE, 0.26); P.quad(us - 0.2, us + 0.2, vs - 3, vs + 3, WHITE, 0.26, 4);
    }
    this.group.add(P.mesh());
    // --- structures
    const place = (def, u, v, face, sc = 1) => {   // face: +1 -> front toward +v, -1 -> toward -v
      const m = makeModel(def, this.team), p = sim.afPt(b, u, v), y = Math.max(0.05, sim.map.hAt(p.x, p.z));
      m.root.position.set(p.x, y, p.z); m.root.scale.setScalar(sc); m.root.rotation.y = Math.atan2(face * g.px, face * g.pz); this.group.add(m.root);
      m.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    };
    for (let p = 0; p < pairs; p++) place('afhangar', AF.standU0 + AF.standDU * p, 33.2, -1);
    place('afdepot', 13.4, 25.5, -1, 0.62);                       // level I: ammunition yard
    if (b.mods.depot >= 1) place('afbunker', 13.4, 30.2, -1, 0.5);  // level II: earth-covered magazine
    if (b.mods.depot >= 2) place('afbunker', 13.4, 34.4, -1, 0.5);  // level III: heavy ordnance magazine
  }
}

// every reserved rectangle of this airfield (world coordinates)
function sim_rects(sim, b) {
  const R = sim.afLevelRects(b.x, b.z, b.afd.ax, b.afd.sd), out = R.base.slice();
  for (const k of ['runway', 'apron']) for (let i = 0; i < b.maxMod[k]; i++) out.push(...R[k][i]);
  return out;
}
