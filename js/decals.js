// Persistent ground scars: bomb / shell craters and burnt-out wrecks. One merged mesh, each decal is a small grid draped over the terrain.
import * as THREE from 'three';

const G = 8, VPD = (G + 1) * (G + 1);

function craterTexture() {
  const S = 160, cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d'), h = S / 2;
  let g = c.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0, 'rgba(8,6,5,0.95)'); g.addColorStop(0.35, 'rgba(22,17,13,0.9)'); g.addColorStop(0.62, 'rgba(48,38,29,0.75)'); g.addColorStop(0.82, 'rgba(70,56,42,0.38)'); g.addColorStop(1, 'rgba(70,56,42,0)');
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  // churned-earth rim: bright lip on the upper-left, shadow on the lower-right (reads as relief)
  c.lineWidth = S * 0.055;
  c.strokeStyle = 'rgba(150,124,92,0.55)'; c.beginPath(); c.arc(h, h, h * 0.64, Math.PI * 0.85, Math.PI * 1.75); c.stroke();
  c.strokeStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.arc(h, h, h * 0.5, -Math.PI * 0.15, Math.PI * 0.75); c.stroke();
  // scorch streaks and flung dirt
  let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 26; i++) {
    const a = rnd() * 6.283, r0 = h * (0.25 + rnd() * 0.3), r1 = h * (0.6 + rnd() * 0.38);
    c.strokeStyle = 'rgba(14,11,9,' + (0.25 + rnd() * 0.3) + ')'; c.lineWidth = 1 + rnd() * 2.2;
    c.beginPath(); c.moveTo(h + Math.cos(a) * r0, h + Math.sin(a) * r0); c.lineTo(h + Math.cos(a) * r1, h + Math.sin(a) * r1); c.stroke();
  }
  for (let i = 0; i < 60; i++) { const a = rnd() * 6.283, r = h * (0.55 + rnd() * 0.4); c.fillStyle = 'rgba(' + (60 + rnd() * 50) + ',' + (48 + rnd() * 36) + ',' + (34 + rnd() * 26) + ',' + (0.3 + rnd() * 0.4) + ')'; c.beginPath(); c.arc(h + Math.cos(a) * r, h + Math.sin(a) * r, 0.8 + rnd() * 2.4, 0, 6.283); c.fill(); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

export class Craters {
  constructor(scene, map, max = 240) {
    this.map = map; this.max = max; this.n = 0;
    this.pos = new Float32Array(max * VPD * 3); const uv = new Float32Array(max * VPD * 2), nor = new Float32Array(max * VPD * 3), idx = [];
    for (let d = 0; d < max; d++) {
      const o = d * VPD;
      for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) { const k = o + j * (G + 1) + i; uv[k * 2] = i / G; uv[k * 2 + 1] = j / G; nor[k * 3 + 1] = 1; }
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const a = o + j * (G + 1) + i, b = a + 1, c = a + G + 1, e = c + 1; idx.push(a, c, b, b, c, e); }
    }
    const g = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3); this.attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attr); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setIndex(idx);
    const mat = new THREE.MeshLambertMaterial({ map: craterTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 1; this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }
  add(x, z, r, rot) {
    const map = this.map; if (map.hAt(x, z) < 0.25) return;
    const d = this.n++ % this.max, o = d * VPD, c = Math.cos(rot), s = Math.sin(rot);
    for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
      const lx = (i / G - 0.5) * 2 * r, lz = (j / G - 0.5) * 2 * r, px = x + lx * c - lz * s, pz = z + lx * s + lz * c, k = (o + j * (G + 1) + i) * 3;
      this.pos[k] = px; this.pos[k + 1] = Math.max(0.02, map.hAt(px, pz)) + 0.05; this.pos[k + 2] = pz;
    }
    this.attr.needsUpdate = true;
  }
}
