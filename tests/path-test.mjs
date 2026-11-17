// No direct route between bases: straight line is blocked, ground route exists but is much longer than straight.
import { generateMap } from '../js/sim/map.js';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
function bfs(map, s, t) {
  const n = map.n, d = new Int32Array(n * n).fill(-1), q = [s]; d[s] = 0;
  for (let h = 0; h < q.length; h++) { const c = q[h], x = c % n, z = (c - x) / n;
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) { const x2 = x + dx, z2 = z + dz; if (x2 < 0 || z2 < 0 || x2 >= n || z2 >= n) continue; const k = z2 * n + x2; if (map.pass[k] && d[k] < 0) { d[k] = d[c] + 1; q.push(k); } } }
  return d[t];
}
for (const type of ['island', 'highlands', 'desert', 'arctic', 'jungle', 'volcanic']) for (const size of ['small', 'medium']) for (const seed of [1, 2, 3, 7]) for (const players of [2, 4]) {
  const map = generateMap({ size, type, seed, players }), n = map.n, tag = `${type}/${size}/${seed}/p${players}`;
  const sp = map.spawns.map((p) => Math.floor(p.cj) * n + Math.floor(p.ci));
  for (let a = 0; a < sp.length; a++) for (let b = a + 1; b < sp.length; b++) {
    const A = map.spawns[a], B = map.spawns[b], L = Math.hypot(A.ci - B.ci, A.cj - B.cj);
    let blocked = false;
    for (let t = 0.05; t < 0.95; t += 0.01) { const i = Math.floor(A.ci + (B.ci - A.ci) * t), j = Math.floor(A.cj + (B.cj - A.cj) * t); if (!map.pass[j * n + i]) blocked = true; }
    ok(blocked, tag + ' straight line open ' + a + b);
    const d = bfs(map, sp[a], sp[b]);
    ok(d >= 0, tag + ' unreachable ' + a + b);
    if (d >= 0 && players === 2) ok(d > L * 1.2, tag + ` route too direct ${d} vs ${L.toFixed(0)}`);
  }
  const seen = map.reachable(Math.floor(map.spawns[0].ci), Math.floor(map.spawns[0].cj));
  ok(map.oil.every((o) => seen[Math.min(n-1,o.cj)*n+Math.min(n-1,o.ci)]), tag + ' oil unreachable');
}
console.log(fail ? fail + ' FAILED' : 'path tests passed'); process.exit(fail ? 1 : 0);
