// Renderer add-ons for the long game: supply pallets under parachutes, vehicle wrecks, control-point flags and the weather / night tint.
import * as THREE from 'three';
import { PLAYER_COLORS } from './sim/defs.js';

const BOX = new THREE.BoxGeometry(1, 1, 1), CONE = new THREE.ConeGeometry(1, 1, 10, 1, true), CYL = new THREE.CylinderGeometry(1, 1, 1, 8), RING = new THREE.RingGeometry(0.92, 1, 40);
const M = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85, flatShading: true }, o || {}));
const MAT = { crate: M(0x8a6a3c), band: M(0xe8c04a), chute: M(0xe9ecef, { side: THREE.DoubleSide }), wreck: M(0x24272a), wreck2: M(0x3a2c24), pole: M(0xc9ced4), neutral: new THREE.MeshBasicMaterial({ color: 0xbfc7cf }) };

export class LogiGfx {
  constructor(r) {
    this.r = r; this.sim = r.sim; this.cr = new Map(); this.wr = new Map(); this.pt = new Map();
    this.root = new THREE.Group(); r.scene.add(this.root);
    this.tint = document.getElementById('wxTint'); this.k = { f: 1, g: 0, n: 0 };
    this.sunBase = r.sun ? r.sun.intensity : 1; this.hemiBase = r.hemi ? r.hemi.intensity : 0.8;
    if (r.scene.fog) { this.fog0 = [r.scene.fog.near, r.scene.fog.far, r.scene.fog.color.clone()]; }
  }
  vis(x, z) { const s = this.sim, c = s.map.cellOf(x, z); return c >= 0 && s.vis[this.r.team][c] === 1; }
  expl(x, z) { const s = this.sim, c = s.map.cellOf(x, z); return c >= 0 && s.expl[this.r.team][c] === 1; }
  update(dt) {
    const s = this.sim, map = s.map, g = this.root;
    // pallets
    for (const c of s.crates) {
      let m = this.cr.get(c.id);
      if (!m) { m = new THREE.Group(); const b = new THREE.Mesh(BOX, MAT.crate); b.scale.set(1.5, 1.1, 1.5); b.position.y = 0.55; const t = new THREE.Mesh(BOX, MAT.band); t.scale.set(1.6, 0.14, 1.6); t.position.y = 0.95; const ch = new THREE.Mesh(CONE, MAT.chute); ch.scale.set(3.4, 2.4, 3.4); ch.position.y = 4.4; ch.rotation.x = Math.PI; m.add(b, t, ch); m.userData.ch = ch; g.add(m); this.cr.set(c.id, m); }
      const gy = map.hAt(c.x, c.z), fall = Math.max(0, c.fall);
      m.position.set(c.x, gy + fall * 0.55, c.z); m.userData.ch.visible = fall > 0; m.visible = this.vis(c.x, c.z); m.rotation.y = c.id;
    }
    for (const [id, m] of this.cr) if (!s.crates.some((c) => c.id === id)) { g.remove(m); this.cr.delete(id); }
    // wrecks
    for (const w of s.wrecks) {
      let m = this.wr.get(w.id);
      if (!m) { m = new THREE.Group(); const r = Math.max(1.2, w.rad); const h = new THREE.Mesh(BOX, MAT.wreck); h.scale.set(r * 1.5, r * 0.55, r * 2.3); h.position.y = r * 0.25; const t = new THREE.Mesh(BOX, MAT.wreck2); t.scale.set(r * 0.9, r * 0.35, r * 1.0); t.position.set(r * 0.25, r * 0.65, -r * 0.2); t.rotation.set(0.15, 0.4, 0.2); m.add(h, t); m.rotation.y = w.id * 1.7; g.add(m); this.wr.set(w.id, m); }
      m.position.set(w.x, map.hAt(w.x, w.z), w.z); m.visible = this.vis(w.x, w.z);
    }
    for (const [id, m] of this.wr) if (!s.wrecks.some((w) => w.id === id)) { g.remove(m); this.wr.delete(id); }
    // control points
    for (const q of s.points) {
      let m = this.pt.get(q.id);
      if (!m) {
        m = new THREE.Group(); const pole = new THREE.Mesh(CYL, MAT.pole); pole.scale.set(0.18, 9, 0.18); pole.position.y = 4.5; const flag = new THREE.Mesh(BOX, MAT.neutral.clone()); flag.scale.set(3.2, 1.8, 0.1); flag.position.set(1.7, 8.0, 0);
        const ring = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.scale.set(14, 14, 1); ring.position.y = 0.25;
        const prog = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false })); prog.rotation.x = -Math.PI / 2; prog.scale.set(11, 11, 1); prog.position.y = 0.3;
        const base = new THREE.Mesh(CYL, M(0x555b61)); base.scale.set(1.6, 0.4, 1.6); base.position.y = 0.2;
        m.add(pole, flag, ring, prog, base); m.userData = { flag, ring, prog }; m.position.set(q.x, map.hAt(q.x, q.z), q.z); g.add(m); this.pt.set(q.id, m);
      }
      const u = m.userData, col = q.team >= 0 ? PLAYER_COLORS[q.owner % PLAYER_COLORS.length] : 0xbfc7cf;
      u.flag.material.color.setHex(col); u.ring.material.color.setHex(col); u.flag.position.x = 1.7 + Math.sin(this.r.time * 2 + q.id) * 0.15;
      u.prog.material.opacity = q.p > 0 ? 0.6 : 0; if (q.p > 0) { u.prog.material.color.setHex(PLAYER_COLORS[(q.ct >= 0 ? this.sim.players.findIndex((p) => p.team === q.ct) : 0) % PLAYER_COLORS.length] || 0xffd24a); const k = 5 + q.p / 100 * 9; u.prog.scale.set(k, k, 1); }
      m.visible = this.expl(q.x, q.z);
    }
    this.weather(dt);
  }
  // sky tint, fog and light levels follow the weather and the day/night cycle
  weather(dt) {
    const w = this.sim.wx, r = this.r, k = this.k; if (!w) return;
    const tf = [1, 0.85, 0.38, 0.62, 0.45][w.kind], tg = [0, 0.2, 0.6, 0.5, 0.8][w.kind], a = Math.min(1, dt * 0.6);
    k.f += (tf - k.f) * a; k.g += (tg - k.g) * a; k.n += (w.night - k.n) * a;
    if (r.scene.fog && this.fog0) {
      const f = r.scene.fog; f.near = this.fog0[0] * k.f; f.far = this.fog0[1] * (0.35 + 0.65 * k.f);
      f.color.copy(this.fog0[2]).lerp(new THREE.Color(0.55, 0.58, 0.62), k.g).multiplyScalar(1 - 0.78 * k.n);
    }
    if (r.sun) r.sun.intensity = this.sunBase * (1 - 0.82 * k.n) * (1 - 0.4 * k.g);
    if (r.hemi) r.hemi.intensity = this.hemiBase * (1 - 0.6 * k.n) * (1 - 0.15 * k.g);
    const el = this.tint; if (!el) return;
    const alpha = Math.min(0.5, 0.42 * k.n + 0.18 * k.g), bg = k.n > 0.15 ? 'rgba(10,18,52,' + alpha.toFixed(3) + ')' : 'rgba(150,160,172,' + alpha.toFixed(3) + ')';
    el.style.backgroundColor = bg; el.classList.toggle('rain', w.kind === 3 || w.kind === 4); el.classList.toggle('storm', w.kind === 4);
  }
}
