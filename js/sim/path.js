// Grid A* with line-of-sight smoothing. Deterministic (stable tie-breaking by index).
import { CELL } from './defs.js';

export class Pathfinder {
  constructor(map) {
    this.map = map;
    const N = map.n * map.n;
    this.g = new Float32Array(N);
    this.parent = new Int32Array(N);
    this.stamp = new Uint32Array(N);
    this.closed = new Uint32Array(N);
    this.cur = 0;
    this.heap = new Int32Array(N + 8);
    this.f = new Float32Array(N);
    this.hn = 0;
  }
  blocked(c) { return this.map.pass[c] === 0 || this.map.occ[c] !== 0; }

  push(c) {
    const heap = this.heap, f = this.f;
    let i = this.hn++;
    heap[i] = c;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (f[heap[p]] < f[c] || (f[heap[p]] === f[c] && heap[p] < c)) break;
      heap[i] = heap[p]; i = p;
    }
    heap[i] = c;
  }
  pop() {
    const heap = this.heap, f = this.f;
    const top = heap[0], last = heap[--this.hn];
    let i = 0;
    const n = this.hn;
    while (true) {
      let l = i * 2 + 1;
      if (l >= n) break;
      const r = l + 1;
      if (r < n && (f[heap[r]] < f[heap[l]] || (f[heap[r]] === f[heap[l]] && heap[r] < heap[l]))) l = r;
      if (f[heap[l]] > f[last] || (f[heap[l]] === f[last] && heap[l] > last)) break;
      heap[i] = heap[l]; i = l;
    }
    heap[i] = last;
    return top;
  }

  // true if straight line between world points crosses only free cells
  los(ax, az, bx, bz) {
    const map = this.map, n = map.n;
    const dx = bx - ax, dz = bz - az;
    const len = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.ceil(len / (CELL * 0.5));
    for (let s = 0; s <= steps; s++) {
      const t = steps ? s / steps : 0;
      const x = ax + dx * t, z = az + dz * t;
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      if (cx < 0 || cz < 0 || cx >= n || cz >= n) return false;
      if (this.blocked(cz * n + cx)) return false;
    }
    return true;
  }

  // returns flat array [x0,z0,x1,z1,...] of waypoints ending at (or near) the target
  find(sx, sz, tx, tz, maxNodes = 9000) {
    const map = this.map, n = map.n;
    let scx = Math.floor(sx / CELL), scz = Math.floor(sz / CELL);
    let tcx = Math.floor(tx / CELL), tcz = Math.floor(tz / CELL);
    scx = Math.max(0, Math.min(n - 1, scx)); scz = Math.max(0, Math.min(n - 1, scz));
    tcx = Math.max(0, Math.min(n - 1, tcx)); tcz = Math.max(0, Math.min(n - 1, tcz));
    const start = scz * n + scx;
    const goal = tcz * n + tcx;
    if (start === goal) return [tx, tz];
    const stamp = ++this.cur;
    const g = this.g, parent = this.parent, st = this.stamp, closed = this.closed, f = this.f;
    this.hn = 0;
    const hfn = (cx, cz) => {
      const dx = Math.abs(cx - tcx), dz = Math.abs(cz - tcz);
      return (dx + dz) + (1.41421356 - 2) * Math.min(dx, dz);
    };
    g[start] = 0; st[start] = stamp; parent[start] = -1;
    f[start] = hfn(scx, scz);
    this.push(start);
    let best = start, bestH = hfn(scx, scz), expanded = 0, found = false;
    const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1];
    while (this.hn > 0 && expanded < maxNodes) {
      const c = this.pop();
      if (closed[c] === stamp) continue;
      closed[c] = stamp;
      expanded++;
      if (c === goal) { found = true; best = c; break; }
      const cx = c % n, cz = (c - cx) / n;
      const hh = hfn(cx, cz);
      if (hh < bestH) { bestH = hh; best = c; }
      for (let k = 0; k < 8; k++) {
        const x2 = cx + DX[k], z2 = cz + DZ[k];
        if (x2 < 0 || z2 < 0 || x2 >= n || z2 >= n) continue;
        const c2 = z2 * n + x2;
        if (closed[c2] === stamp) continue;
        if (this.blocked(c2) && c2 !== goal) continue;
        if (k >= 4) { if (this.blocked(cz * n + x2) || this.blocked(z2 * n + cx)) continue; }
        const cost = g[c] + (k < 4 ? 1 : 1.41421356) + (map.near[c2] ? 0.6 : 0);
        if (st[c2] !== stamp || cost < g[c2]) {
          st[c2] = stamp; g[c2] = cost; parent[c2] = c;
          f[c2] = cost + hfn(x2, z2);
          this.push(c2);
        }
      }
    }
    // reconstruct
    const cells = [];
    for (let c = best; c !== -1; c = parent[c]) cells.push(c);
    cells.reverse();
    // string pulling
    const pts = [];
    let ax = sx, az = sz, i = 0;
    const cxw = (c) => ((c % n) + 0.5) * CELL, czw = (c) => (Math.floor(c / n) + 0.5) * CELL;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.los(ax, az, cxw(cells[j]), czw(cells[j]))) j--;
      if (j === i) j = Math.min(i + 1, cells.length - 1);
      const px = cxw(cells[j]), pz = czw(cells[j]);
      pts.push(px, pz); ax = px; az = pz;
      if (j >= cells.length - 1) break;
      i = j;
    }
    if (found) { if (pts.length) { pts[pts.length - 2] = tx; pts[pts.length - 1] = tz; } else pts.push(tx, tz); }
    return pts;
  }
}
