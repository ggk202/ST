// Chunked terrain / water surface: the big height grid is split into 32x32-cell chunks that share one set of vertex buffers.
// Each chunk has three index buffers (full, half and quarter resolution), picked by distance, and is frustum-culled on its own.
// This keeps the Colossal (800 x 800) map affordable: only visible chunks are drawn and distant ones use a quarter of the triangles.
import * as THREE from 'three';

export class ChunkedSurface {
  // base: BufferGeometry holding the shared attributes; n cells per side (w = n + 1 vertices); skip(i, j, s) may drop empty blocks (water)
  constructor(scene, base, n, w, material, opts = {}) {
    const CS = 32, pos = base.attributes.position.array, big = w * w > 65535;
    this.group = new THREE.Group(); this.chunks = []; this.base = base; this.material = material; scene.add(this.group); this.scene = scene;
    for (let cj = 0; cj * CS < n; cj++) for (let ci = 0; ci * CS < n; ci++) {
      const i0 = ci * CS, j0 = cj * CS, i1 = Math.min(n, i0 + CS), j1 = Math.min(n, j0 + CS);
      const lods = [1, 2, 4].map((s) => {
        const idx = [];
        for (let j = j0; j < j1; j += s) for (let i = i0; i < i1; i += s) {
          if (opts.skip && opts.skip(i, j, s)) continue;
          const a = j * w + i, b = a + s, c = a + s * w, d = c + s;
          if (((i + j) / s) & 1) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
        }
        return idx;
      });
      if (!lods[0].length) continue;
      let y0 = 1e9, y1 = -1e9;
      for (let j = j0; j <= j1; j += 2) for (let i = i0; i <= i1; i += 2) { const y = pos[(j * w + i) * 3 + 1]; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const cx = (pos[(j0 * w + i0) * 3] + pos[(j1 * w + i1) * 3]) / 2, cz = (pos[(j0 * w + i0) * 3 + 2] + pos[(j1 * w + i1) * 3 + 2]) / 2, half = (pos[(j0 * w + i1) * 3] - pos[(j0 * w + i0) * 3]) / 2;
      const sph = new THREE.Sphere(new THREE.Vector3(cx, (y0 + y1) / 2, cz), Math.sqrt(half * half * 2 + ((y1 - y0) / 2 + 2) * ((y1 - y0) / 2 + 2)) + 1);
      const geos = lods.map((idx) => {
        const g = new THREE.BufferGeometry(); for (const k in base.attributes) g.setAttribute(k, base.attributes[k]);
        g.setIndex(new THREE.BufferAttribute(big ? new Uint32Array(idx) : new Uint16Array(idx), 1)); g.boundingSphere = sph; return g;
      });
      const mesh = new THREE.Mesh(geos[0], material); mesh.receiveShadow = !!opts.receive; if (opts.renderOrder) mesh.renderOrder = opts.renderOrder;
      this.group.add(mesh); this.chunks.push({ mesh, geos, x: cx, y: sph.center.y, z: cz, lvl: 0 });
    }
  }
  // pick each chunk's detail level from its distance to the eye (bias < 1 pulls the thresholds closer = cheaper)
  update(eye, bias = 1) {
    const t1 = 230 * bias, t2 = 520 * bias;
    for (const c of this.chunks) {
      const dx = eye.x - c.x, dy = eye.y - c.y, dz = eye.z - c.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      let l = d > t2 ? 2 : d > t1 ? 1 : 0;
      if (l !== c.lvl) { if (l > c.lvl && d < (c.lvl === 0 ? t1 : t2) * 1.06) l = c.lvl; else if (l < c.lvl && d > (c.lvl === 2 ? t2 : t1) * 0.94) l = c.lvl; }
      if (l !== c.lvl) { c.lvl = l; c.mesh.geometry = c.geos[l]; }
    }
  }
  dispose() { for (const c of this.chunks) for (const g of c.geos) g.dispose(); this.base.dispose(); this.scene.remove(this.group); }
}
