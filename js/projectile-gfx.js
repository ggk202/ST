// Detailed in-flight ordnance models: ATGM, air-to-air missile, cruise missile, rocket, artillery shell, tank dart/tracer, aerial bomb.
// Every model points along +z (Object3D.lookAt friendly) and carries an optional additive "flame" child that flickers.
import * as THREE from 'three';

const cy = (r0, r1, len, z0, seg = 10) => { const g = new THREE.CylinderGeometry(r1, r0, len, seg); g.rotateX(Math.PI / 2); g.translate(0, 0, z0); return g; };   // r1 = +z end
const fin = (w, h, d, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, z); return g; };

export function buildProjModels() {
  const M = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.45, metalness: 0.55 }, o));
  const glow = (c, op) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const m = { olive: M(0x4b5232), grey: M(0xaeb4ba), white: M(0xeeeeee, { metalness: 0.2 }), dark: M(0x1c1e21), red: M(0xc2352b), brass: M(0xb88a3a, { metalness: 0.85, roughness: 0.3 }), yellow: M(0xd8ae2c, { metalness: 0.2 }),
    flame: glow(0xff9a3c, 0.9), core: glow(0xfff0c0, 1), streak: glow(0xff7a28, 0.5) };
  const g = (parts) => { const o = new THREE.Group(); for (const [geo, mat, rz, name] of parts) { const mesh = new THREE.Mesh(geo, mat); if (rz) mesh.rotation.z = rz; if (name) mesh.name = name; o.add(mesh); } return o; };
  const fins = (w, h, d, z, mat, n = 4) => { const a = []; for (let i = 0; i < n; i++) a.push([fin(w, h, d, z), mat, i * Math.PI * 2 / n]); return a; };
  const flameGeo = (r, len, z) => { const f = new THREE.ConeGeometry(r, len, 8, 1, true); f.rotateX(-Math.PI / 2); f.translate(0, 0, z - len / 2); return f; };
  const out = {};
  out.atgm = g([[cy(0.12, 0.12, 1.6, 0), m.olive], [cy(0.001, 0.12, 0.45, 1.02), m.dark], [cy(0.125, 0.125, 0.1, 0.3), m.yellow], ...fins(0.025, 0.3, 0.3, -0.62, m.dark), [flameGeo(0.15, 1.5, -0.82), m.flame, 0, 'flame'], [flameGeo(0.07, 0.9, -0.8), m.core, 0, 'flame']]);
  out.aam = g([[cy(0.1, 0.1, 2.4, 0), m.white], [cy(0.001, 0.1, 0.7, 1.55), m.red], [cy(0.102, 0.102, 0.12, 0.7), m.dark], ...fins(0.02, 0.32, 0.45, 0.15, m.grey), ...fins(0.02, 0.3, 0.36, -1.0, m.grey), [flameGeo(0.13, 1.8, -1.2), m.flame, 0, 'flame'], [flameGeo(0.06, 1.0, -1.18), m.core, 0, 'flame']]);
  out.cruise = g([[cy(0.2, 0.2, 3.4, 0), m.grey, 0], [cy(0.001, 0.2, 0.9, 2.15), m.grey], [fin(2.6, 0.05, 0.55, 0.2), m.dark], ...fins(0.04, 0.5, 0.5, -1.5, m.dark, 3), [cy(0.12, 0.17, 0.3, -1.7), m.dark], [flameGeo(0.2, 2.2, -1.85), m.flame, 0, 'flame'], [flameGeo(0.09, 1.2, -1.85), m.core, 0, 'flame']]);
  out.rocket = g([[cy(0.12, 0.12, 1.5, 0), m.grey], [cy(0.001, 0.12, 0.4, 0.95), m.red], ...fins(0.02, 0.22, 0.28, -0.6, m.dark, 3), [flameGeo(0.13, 1.4, -0.78), m.flame, 0, 'flame'], [flameGeo(0.06, 0.8, -0.76), m.core, 0, 'flame']]);
  out.shell = g([[cy(0.2, 0.2, 1.1, 0), m.olive], [cy(0.001, 0.2, 0.7, 0.9), m.olive], [cy(0.206, 0.206, 0.14, -0.3), m.brass]]);
  out.dart = g([[cy(0.06, 0.06, 1.5, 0), m.core], [cy(0.18, 0.18, 2.6, -0.7), m.streak], [cy(0.001, 0.06, 0.25, 0.85), m.core]]);   // tracer: a glowing sabot streak
  out.bomb = g([[(() => { const s = new THREE.SphereGeometry(0.42, 14, 10); s.scale(1, 1, 2.3); return s; })(), m.olive], [cy(0.43, 0.43, 0.12, 0.25), m.yellow], [cy(0.2, 0.38, 0.9, -1.2), m.olive], ...fins(0.03, 0.62, 0.55, -1.4, m.dark), [cy(0.001, 0.07, 0.25, 1.02), m.dark]]);
  return { models: out, scale: { atgm: 1.25, aam: 1.3, cruise: 1.3, rocket: 1.15, shell: 1.0, dart: 1.0, bomb: 1.0 } };
}

// which model a projectile uses
export function projKind(p) {
  if (p.k === 'missile') return p.dtype === 'aa' ? 'aam' : p.dtype === 'ap' ? 'atgm' : 'cruise';
  if (p.fx === 'rocket') return 'rocket';
  if (p.dtype === 'blast') return p.sy > 6 || p.fa ? 'bomb' : 'cruise';
  if (p.dtype === 'ap') return 'dart';
  if (p.fa) return 'bomb';
  return 'shell';
}
