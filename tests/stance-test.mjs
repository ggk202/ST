// Unit autonomy: stances (hold / defend / aggressive) with a leash around the post; units return after the fight
import { Sim } from '../js/sim/sim.js';
import { UNITS } from '../js/sim/defs.js';
let fail = false; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail = true; };
const mk = () => { const s = new Sim({ size: 'small', type: 'island', seed: 3, slots: [{ name: 'A', team: 0 }, { name: 'B', team: 1 }] }); for (const p of s.players) { p.credits = 99999; p.energy = 99999; } return s; };
const run = (s, n) => { for (let i = 0; i < n; i++) s.step([]); };
const spotFor = (s) => { for (let r = 0; r < 300; r += 12) for (let a = 0; a < 12; a++) { const px = s.map.size / 2 + Math.cos(a * 0.52) * r, pz = s.map.size / 2 + Math.sin(a * 0.52) * r; let okk = true; for (let k = -20; k <= 160 && okk; k += 8) if (!s.map.walkable(px + k, pz) || !s.map.walkable(px, pz + k * 0.5)) okk = false; if (okk) return [px, pz]; } return [s.map.size / 2, s.map.size / 2]; };
const P = spotFor(mk());
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const spot = (s, x, z) => { const u = s.spawnUnit('uav', 0, x, z); return u; };   // a spotter so the enemy is visible beyond the tank's own sight
{
  const s = mk(), x = P[0], z = P[1], d = UNITS.mbt, rng = d.maxRange;
  const mine = s.spawnUnit('mbt', 0, x, z); const foe = s.spawnUnit('mbt', 1, x + rng + 30, z); foe.hp = foe.maxhp = 100000; foe.st = 0; spot(s, x + rng + 30, z);   // foe stands still
  ok(mine.st === 1 && Math.hypot(mine.hx - x, mine.hz - z) < 0.1, 'units start in the Defend stance with their post where they stand');
  run(s, 60);
  ok(mine.order.t === 'attack' && mine.order.auto || dist(mine, { x, z }) > 3, 'idle unit walks up to a visible enemy just outside its weapon range');
  foe.dead = true; s.kill(foe); run(s, 400);
  ok(dist(mine, { x, z }) < 6 && mine.order.t === 'idle', 'after the fight it returns to its post (' + dist(mine, { x, z }).toFixed(1) + ' from post)');
  // hold: never moves
  const s2 = mk(), m2 = s2.spawnUnit('mbt', 0, x, z), f2 = s2.spawnUnit('mbt', 1, x + rng + 30, z); f2.hp = f2.maxhp = 100000; f2.st = 0; spot(s2, x + rng + 30, z);
  s2.step([{ t: 'stance', p: 0, ids: [m2.id], v: 0 }]); run(s2, 200);
  ok(dist(m2, { x, z }) < 1, 'Hold stance does not leave the post');
  // leash: a far enemy is ignored by Defend but reached by Aggressive
  const far = (st) => { const q = mk(), m = q.spawnUnit('mbt', 0, x, z), f = q.spawnUnit('mbt', 1, x + 100, z); f.hp = f.maxhp = 100000; f.st = 0; spot(q, x + 100, z); q.step([{ t: 'stance', p: 0, ids: [m.id], v: st }]); let mx = 0; for (let i = 0; i < 300; i++) { q.step([]); mx = Math.max(mx, dist(m, { x, z })); } return mx; };
  const dDef = far(1), dAgg = far(2);
  ok(dDef < 5, 'Defend leash ignores an enemy far outside its reach (moved ' + dDef.toFixed(1) + ')');
  ok(dAgg > 20, 'Aggressive stance goes out to meet it (moved ' + dAgg.toFixed(1) + ')');
  // a player order replaces the post
  const s3 = mk(), m3 = s3.spawnUnit('mbt', 0, x, z); s3.step([{ t: 'move', p: 0, ids: [m3.id], x: x + 60, z }]); run(s3, 600);
  ok(Math.hypot(m3.hx - (x + 60), m3.hz - z) < 8, 'after a move order the new position becomes the post');
}
console.log(fail ? 'SOME TESTS FAILED' : 'ALL STANCE TESTS PASSED'); process.exit(fail ? 1 : 0);
