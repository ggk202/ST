// Procedural terrain: island and mountain-ringed highland maps. Fully deterministic.
import { CELL } from './defs.js';
import { RNG, clamp, lerp, smoothstep, fbm, dist } from './util.js';

export const MAP_SIZES = { small: 192, medium: 288, large: 400, xl: 560, xxl: 800 };
export const MAP_TYPES = ['island', 'highlands', 'desert', 'arctic', 'jungle', 'volcanic'];
// map type -> [heightmap shape, biome]
const TYPE_SHAPE = { island: ['island', 'temperate'], highlands: ['highlands', 'temperate'], desert: ['highlands', 'desert'], arctic: ['island', 'arctic'], jungle: ['island', 'jungle'], volcanic: ['island', 'volcanic'] };
export const SEA_LEVEL = 0;

export class GameMap {
  constructor(n) {
    this.n = n; this.size = n * CELL; this.vw = n + 1;
    this.h = new Float32Array(this.vw * this.vw);
    this.pass = new Uint8Array(n * n);   // terrain walkable
    this.bld = new Uint8Array(n * n);    // terrain buildable
    this.occ = new Int32Array(n * n);    // building id occupying cell
    this.near = new Uint8Array(n * n);   // walkable cell next to an obstacle (path cost)
    this.oil = [];
    this.spawns = [];
  }
  hAt(x, z) {
    const n = this.n;
    let fx = x / CELL, fz = z / CELL;
    fx = fx < 0 ? 0 : fx > n - 0.001 ? n - 0.001 : fx;
    fz = fz < 0 ? 0 : fz > n - 0.001 ? n - 0.001 : fz;
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, w = this.vw, h = this.h;
    const a = h[j * w + i], b = h[j * w + i + 1], c = h[(j + 1) * w + i], d = h[(j + 1) * w + i + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }
  cellOf(x, z) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    if (cx < 0 || cz < 0 || cx >= this.n || cz >= this.n) return -1;
    return cz * this.n + cx;
  }
  walkable(x, z) { const c = this.cellOf(x, z); return c >= 0 && this.pass[c] === 1 && this.occ[c] === 0; }
  computeCells() {
    const n = this.n, w = this.vw, h = this.h;
    for (let cz = 0; cz < n; cz++) for (let cx = 0; cx < n; cx++) {
      const a = h[cz * w + cx], b = h[cz * w + cx + 1], c = h[(cz + 1) * w + cx], d = h[(cz + 1) * w + cx + 1];
      const mn = Math.min(a, b, c, d), mx = Math.max(a, b, c, d), avg = (a + b + c + d) * 0.25, rng = mx - mn;
      const i = cz * n + cx;
      const border = cx < 2 || cz < 2 || cx >= n - 2 || cz >= n - 2;
      this.pass[i] = (!border && mn > 0.3 && avg < 30 && rng < 3.0) ? 1 : 0;
      this.bld[i] = (!border && mn > 0.9 && avg < 16 && rng < 1.5) ? 1 : 0;
    }
    for (let cz = 0; cz < n; cz++) for (let cx = 0; cx < n; cx++) {
      const i = cz * n + cx; this.near[i] = 0;
      if (!this.pass[i]) continue;
      for (let dz = -1; dz <= 1 && !this.near[i]; dz++) for (let dx = -1; dx <= 1; dx++) {
        const x2 = cx + dx, z2 = cz + dz;
        if (x2 < 0 || z2 < 0 || x2 >= n || z2 >= n || !this.pass[z2 * n + x2]) { this.near[i] = 1; break; }
      }
    }
  }
  reachable(sx, sz) {
    const n = this.n, seen = new Uint8Array(n * n), q = new Int32Array(n * n);
    let qh = 0, qt = 0;
    const s = sz * n + sx;
    if (!this.pass[s]) return seen;
    seen[s] = 1; q[qt++] = s;
    while (qh < qt) {
      const c = q[qh++], cx = c % n, cz = (c - cx) / n;
      if (cx > 0 && this.pass[c - 1] && !seen[c - 1]) { seen[c - 1] = 1; q[qt++] = c - 1; }
      if (cx < n - 1 && this.pass[c + 1] && !seen[c + 1]) { seen[c + 1] = 1; q[qt++] = c + 1; }
      if (cz > 0 && this.pass[c - n] && !seen[c - n]) { seen[c - n] = 1; q[qt++] = c - n; }
      if (cz < n - 1 && this.pass[c + n] && !seen[c + n]) { seen[c + n] = 1; q[qt++] = c + n; }
    }
    return seen;
  }
}

function flatten(map, cxw, czw, radius, target, inner) {
  const n = map.n, w = map.vw, R = Math.ceil(radius) + 1;
  const ci = Math.round(cxw), cj = Math.round(czw);
  for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
    if (i < 0 || j < 0 || i > n || j > n) continue;
    const d = dist(i, j, cxw, czw);
    const wt = 1 - smoothstep(inner, radius, d);
    if (wt <= 0) continue;
    map.h[j * w + i] = lerp(map.h[j * w + i], target, wt);
  }
}

function carve(map, ax, az, bx, bz, rng, bend = 0.35) {
  const len = dist(ax, az, bx, bz);
  const mx = (ax + bx) / 2 + (-(bz - az) / (len || 1)) * (rng.next() - 0.5) * len * bend;
  const mz = (az + bz) / 2 + ((bx - ax) / (len || 1)) * (rng.next() - 0.5) * len * bend;
  const seg = (x0, z0, x1, z1) => {
    const l = dist(x0, z0, x1, z1), steps = Math.max(1, Math.ceil(l));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const ci = Math.round(x), cj = Math.round(z), R = 5;
      for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
        if (i < 2 || j < 2 || i > map.n - 2 || j > map.n - 2) continue;
        const d = dist(i, j, x, z);
        const wt = 1 - smoothstep(2.0, 5, d);
        if (wt <= 0) continue;
        const k = j * map.vw + i, cur = map.h[k];
        const target = 3.2 + (fbm(i * 0.3, j * 0.3, 77, 2) - 0.5) * 0.8;
        map.h[k] = lerp(cur, target, wt);
      }
    }
  };
  seg(ax, az, mx, mz); seg(mx, mz, bx, bz);
}

const SPAWN_DIRS = {
  1: [[-0.7, -0.7]], 2: [[-0.7, -0.7], [0.7, 0.7]],
  3: [[-0.7, -0.6], [0.7, -0.6], [0, 0.78]],
  4: [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]],
};

export function generateMap({ size = 'medium', type = 'island', seed = 1, players = 2 }) {
  const n = typeof size === 'number' ? size : (MAP_SIZES[size] || 288);
  const map = new GameMap(n);
  const rng = new RNG(seed * 2654435761);
  const s = seed | 0, w = map.vw, half = n / 2;
  if (type === 'random') type = MAP_TYPES[Math.floor(rng.next() * MAP_TYPES.length)];
  const [shape, biome] = TYPE_SHAPE[type] || TYPE_SHAPE.island;
  type = shape; map.type = shape; map.biome = biome; map.volc = [];
  const f1 = 0.035 * 96 / n * 1.6, f2 = 0.09 * 96 / n * 1.6, f3 = 0.05 * 96 / n * 1.6;
  const hillAmp = 3.0;   // gentle rolling ground: big open plains rather than constant hills

  const spawnPts = SPAWN_DIRS[Math.max(1, Math.min(4, players))].map((d) => [half + d[0] * half * 0.62, half + d[1] * half * 0.62]);
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    let dmin = 1e9; for (const sp of spawnPts) dmin = Math.min(dmin, dist(i, j, sp[0], sp[1]));
    const open = smoothstep(30, 70, dmin);   // keep generous open ground around every base
    const u = (i / n - 0.5) * 2, v = (j / n - 0.5) * 2;
    const r = Math.sqrt(u * u + v * v) * 0.6 + Math.max(Math.abs(u), Math.abs(v)) * 0.4;
    const n1 = fbm(i * f1, j * f1, s, 4), n2 = fbm(i * f2, j * f2, s + 7, 3);
    const rid = 1 - Math.abs(2 * fbm(i * f3, j * f3, s + 13, 3) - 1);
    let h;
    if (type === 'island') {
      const e = 1.2 - r * 1.15 + (n1 - 0.5) * 0.5;
      if (e < 0.12) h = Math.max(-9, (e - 0.12) * 30);
      else {
        h = 1.0 + (e - 0.12) * 9 + (n2 - 0.5) * hillAmp * (0.35 + 0.65 * open);
        const mp = smoothstep(0.74, 0.93, rid) * smoothstep(0.3, 0.7, e) * open;
        h += mp * 26 * (0.55 + n1);
      }
    } else {
      const m = smoothstep(0.66, 0.93, r + (n1 - 0.5) * 0.3);
      h = 3 + (n2 - 0.5) * hillAmp * 1.2 * (0.35 + 0.65 * open) + m * 42 * (0.25 + 0.75 * open);
      const low = smoothstep(0.4, 0.3, n1);
      if (r < 0.6) h -= low * 4.2;
      const mp = smoothstep(0.8, 0.94, rid) * smoothstep(0.25, 0.6, r) * (1 - m) * open;
      h += mp * 13;
    }
    map.h[j * w + i] = h;
  }

  if (biome === 'desert') {
    // wind-carved mesas: high ground is terraced into flat-topped steps with cliff faces, plus low dunes on the plains
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const k = j * w + i, h = map.h[k];
      if (h > 12) { const st = 7, f = h / st, fl = Math.floor(f), fr = f - fl; map.h[k] = (fl + smoothstep(0.55, 0.9, fr)) * st; }
      else if (h > 0.5) map.h[k] += (fbm(i * 0.11, j * 0.05, s + 31, 2) - 0.5) * 1.6;
    }
  } else if (biome === 'volcanic') {
    // cinder cones with a crater lake of lava, kept clear of the bases
    for (let v = 0, tries = 0; v < Math.max(2, Math.round(n / 110)) && tries < 200; tries++) {
      const cx = 24 + rng.next() * (n - 48), cz = 24 + rng.next() * (n - 48), R = 15 + rng.next() * 10;
      if (spawnPts.some((sp) => dist(sp[0], sp[1], cx, cz) < R + 46) || map.volc.some((o) => dist(o.ci, o.cj, cx, cz) < 60)) continue;
      for (let j = Math.floor(cz - R * 1.6); j <= cz + R * 1.6; j++) for (let i = Math.floor(cx - R * 1.6); i <= cx + R * 1.6; i++) {
        if (i < 0 || j < 0 || i > n || j > n) continue;
        const d = dist(i, j, cx, cz) / R; if (d > 1.6) continue;
        const cone = d < 1 ? (1 - d) * 34 : 0, rim = Math.max(0, 1 - Math.abs(d - 0.3) * 6) * 7, bowl = d < 0.3 ? (0.3 - d) * 60 : 0;
        const k = j * w + i, val = 2 + cone + rim - bowl; map.h[k] = d < 0.3 ? val : Math.max(map.h[k], val);
      }
      map.volc.push({ ci: cx, cj: cz, r: R }); v++;
    }
  }
  const dirs = SPAWN_DIRS[Math.max(1, Math.min(4, players))];
  for (const d of dirs) {
    const x = half + d[0] * half * 0.62, z = half + d[1] * half * 0.62;
    map.spawns.push({ x: x * CELL, z: z * CELL, ci: x, cj: z });
    flatten(map, x, z, 17, 4, 10);
  }
  // oil nodes
  const nodes = [];
  const addNode = (ci, cj) => { ci = Math.round(ci); cj = Math.round(cj); nodes.push({ ci, cj }); flatten(map, ci, cj, 5, 3.6, 3); };
  for (const sp of map.spawns) {
    for (let k = 0; k < 2; k++) {
      for (let tries = 0; tries < 40; tries++) {
        let vx = rng.next() * 2 - 1, vz = rng.next() * 2 - 1, l = Math.sqrt(vx * vx + vz * vz);
        if (l < 0.1) { vx = 1; vz = 0; l = 1; }
        const d = 17 + rng.next() * 6;
        const ci = sp.ci + (vx / l) * d, cj = sp.cj + (vz / l) * d;
        if (ci < 8 || cj < 8 || ci > n - 8 || cj > n - 8) continue;
        const hh = map.hAt(ci * CELL, cj * CELL);
        if (tries < 30 && (hh < 1.5 || hh > 9)) continue;
        if (nodes.some((o) => dist(o.ci, o.cj, ci, cj) < 12)) continue;
        addNode(ci, cj); break;
      }
    }
  }
  const midCount = Math.round(n * n / 4000);   // ~9 / 20 / 40 neutral fields
  for (let k = 0, tries = 0; k < midCount && tries < 4000; tries++) {
    const ci = 12 + rng.next() * (n - 24), cj = 12 + rng.next() * (n - 24);
    const hh = map.hAt(ci * CELL, cj * CELL);
    if (hh < 1.5 || hh > 9) continue;
    if (map.spawns.some((sp) => dist(sp.ci, sp.cj, ci, cj) < 30)) continue;
    if (nodes.some((o) => dist(o.ci, o.cj, ci, cj) < 22)) continue;
    addNode(ci, cj); k++;
  }
  // no direct route between bases: serpentine ridge walls across every spawn-to-spawn line, each with a gap far off-centre
  // (alternating sides), then a winding road is carved through the gaps so every base stays reachable
  const routes = [];
  for (let a = 0; a < map.spawns.length; a++) for (let b = a + 1; b < map.spawns.length; b++) {
    const A = map.spawns[a], B = map.spawns[b], L = dist(A.ci, A.cj, B.ci, B.cj);
    const dx = (B.ci - A.ci) / L, dz = (B.cj - A.cj) / L, px = -dz, pz = dx;
    const side = rng.next() < 0.5 ? 1 : -1, wp = [[A.ci, A.cj]];
    (L < 150 ? [0.4, 0.5, 0.6] : [0.3, 0.5, 0.7]).forEach((t, k) => {
      const cx = A.ci + dx * L * t, cz = A.cj + dz * L * t, g = side * (k % 2 ? -1 : 1) * L * (0.2 + 0.08 * rng.next());
      const gx = cx + px * g, gz = cz + pz * g;
      const wob = rng.next() * 100;
      for (let o = -n; o <= n; o += 0.5) {
        const wx = cx + px * o + dx * (fbm(o * 0.05, wob, s + 21, 2) - 0.5) * 14, wz = cz + pz * o + dz * (fbm(o * 0.05, wob, s + 21, 2) - 0.5) * 14;
        const ci = Math.round(wx), cj = Math.round(wz);
        if (ci < 1 || cj < 1 || ci > n - 1 || cj > n - 1) continue;
        if (Math.abs(o - g) < 6) continue;
        if (map.spawns.some((sp) => dist(sp.ci, sp.cj, wx, wz) < 28)) continue;
        if (nodes.some((nd) => dist(nd.ci, nd.cj, wx, wz) < 9)) continue;
        for (let j = cj - 5; j <= cj + 5; j++) for (let i = ci - 5; i <= ci + 5; i++) {
          if (i < 0 || j < 0 || i > n || j > n) continue;
          const wt = 1 - smoothstep(1.5, 5, dist(i, j, wx, wz));
          if (wt > 0) { const kk = j * w + i; map.h[kk] = Math.max(map.h[kk], 46 * wt * (0.9 + 0.2 * fbm(i * 0.2, j * 0.2, s + 5, 2))); }
        }
      }
      wp.push([gx, gz]);
    });
    wp.push([B.ci, B.cj]); routes.push(wp);
  }
  for (const wp of routes) for (let i = 0; i + 1 < wp.length; i++) carve(map, wp[i][0], wp[i][1], wp[i + 1][0], wp[i + 1][1], rng, i > 0 && i + 2 < wp.length ? 0 : 0.35);
  map.computeCells();
  // other pairs' roads can cross a wall on the straight line: plug any straight line that is still open with a ridge blob
  for (let pass = 0; pass < 2; pass++) {
    let plugged = false;
    for (let a = 0; a < map.spawns.length; a++) for (let b = a + 1; b < map.spawns.length; b++) {
      const A = map.spawns[a], B = map.spawns[b], L = dist(A.ci, A.cj, B.ci, B.cj);
      let open = true; for (let t = 0.05; t < 0.95; t += 0.01) { const i = Math.floor(A.ci + (B.ci - A.ci) * t), j = Math.floor(A.cj + (B.cj - A.cj) * t); if (!map.pass[j * n + i]) { open = false; break; } }
      if (!open) continue;
      const wx = A.ci + (B.ci - A.ci) * 0.5, wz = A.cj + (B.cj - A.cj) * 0.5, px = -(B.cj - A.cj) / L, pz = (B.ci - A.ci) / L;
      for (let o = -5; o <= 5; o += 0.5) for (let j = Math.round(wz + pz * o) - 4; j <= Math.round(wz + pz * o) + 4; j++) for (let i = Math.round(wx + px * o) - 4; i <= Math.round(wx + px * o) + 4; i++) {
        if (i < 0 || j < 0 || i > n || j > n) continue;
        const wt = 1 - smoothstep(1.2, 4, dist(i, j, wx + px * o, wz + pz * o)); if (wt > 0) { const kk = j * w + i; map.h[kk] = Math.max(map.h[kk], 46 * wt); }
      }
      plugged = true;
    }
    if (!plugged) break; map.computeCells();
  }
  // fallback: if walls/carving still left a base cut off, carve a direct link to the nearest connected base
  for (let a = 1; a < map.spawns.length; a++) {
    const sd = map.reachable(Math.floor(map.spawns[0].ci), Math.floor(map.spawns[0].cj));
    const sp = map.spawns[a];
    if (!sd[Math.floor(sp.cj) * n + Math.floor(sp.ci)]) { carve(map, map.spawns[0].ci, map.spawns[0].cj, sp.ci, sp.cj, rng, 0.35); map.computeCells(); }
  }
  let seen = map.reachable(Math.floor(map.spawns[0].ci), Math.floor(map.spawns[0].cj));
  for (const nd of nodes) {
    if (seen[Math.min(n - 1, nd.cj) * n + Math.min(n - 1, nd.ci)]) continue;
    let best = map.spawns[0], bd = 1e9;
    for (const sp of map.spawns) { const d = dist(sp.ci, sp.cj, nd.ci, nd.cj); if (d < bd) { bd = d; best = sp; } }
    carve(map, nd.ci, nd.cj, best.ci, best.cj, rng);
    map.computeCells();
    seen = map.reachable(Math.floor(map.spawns[0].ci), Math.floor(map.spawns[0].cj));
  }
  map.oil = nodes.map((nd, i) => ({ id: i, x: nd.ci * CELL, z: nd.cj * CELL, ci: nd.ci, cj: nd.cj, building: 0 }));
  return map;
}
