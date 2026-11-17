// Headless test: AI-vs-AI matches, determinism and performance.
import { Sim } from '../js/sim/sim.js';

function run(cfg, seconds) {
  const sim = new Sim(cfg);
  sim.recordEvents = false;
  const t0 = performance.now();
  let maxTick = 0;
  const ticks = seconds * 20;
  for (let i = 0; i < ticks && !sim.over; i++) {
    const a = performance.now();
    sim.step([]);
    maxTick = Math.max(maxTick, performance.now() - a);
  }
  const ms = performance.now() - t0;
  return { sim, ms, maxTick };
}

const mk = (size, type, seed, n, diff = 'normal') => ({ size, type, seed, slots: Array.from({ length: n }, (_, i) => ({ name: 'AI' + i, ai: diff, team: i })) });

let failed = false;
for (const [size, type, seed, n] of [['small', 'island', 1, 2], ['medium', 'highlands', 7, 4], ['large', 'island', 42, 3]]) {
  const cfg = mk(size, type, seed, n);
  const r = run(cfg, 600);
  const s = r.sim;
  const counts = s.players.map((p) => `${p.name}:${p.alive ? 'alive' : 'dead'} u=${p.units} cr=${Math.floor(p.credits)} kills=${p.stats.killed}`).join(' | ');
  console.log(`${size}/${type}/seed${seed}/${n}p  t=${(s.tick / 20) | 0}s ents=${s.ents.length} over=${s.over} winner=${s.winner}  wall=${r.ms.toFixed(0)}ms avg=${(r.ms / s.tick).toFixed(2)}ms/tick max=${r.maxTick.toFixed(1)}ms`);
  console.log('   ' + counts);
  // reachability check: every spawn must reach every other spawn and all oil nodes
  const m = s.map;
  // clear occupancy influence: check on terrain only
  const seen = m.reachable(Math.floor(m.spawns[0].ci), Math.floor(m.spawns[0].cj));
  for (const sp of m.spawns) if (!seen[Math.floor(sp.cj) * m.n + Math.floor(sp.ci)]) { console.log('   FAIL: spawn unreachable'); failed = true; }
  for (const o of m.oil) if (!seen[Math.min(m.n - 1, o.cj) * m.n + Math.min(m.n - 1, o.ci)]) { console.log('   FAIL: oil unreachable', o.id); failed = true; }
  console.log(`   oil nodes=${m.oil.length}`);
}

// determinism
const cfg = mk('small', 'island', 5, 2);
const a = run(cfg, 240).sim, b = run(cfg, 240).sim;
console.log('determinism:', a.hash() === b.hash() ? 'OK' : 'MISMATCH', a.hash(), b.hash());
if (a.hash() !== b.hash()) failed = true;

// human commands
const sim = new Sim({ size: 'small', type: 'island', seed: 3, slots: [{ name: 'H', team: 0 }, { name: 'A', ai: 'easy', team: 1 }] });
sim.recordEvents = false;
const p0 = sim.players[0];
const hq = sim.hq(0);
const eng = sim.ents.find((e) => e.owner === 0 && e.def === 'engineer');
sim.step([{ t: 'build', p: 0, type: 'barracks', x: hq.x + 24, z: hq.z }]);
console.log('barracks placed:', sim.ents.some((e) => e.def === 'barracks' && e.owner === 0));
for (let i = 0; i < 20 * 25; i++) sim.step([]);
sim.step([{ t: 'train', p: 0, type: 'rifleman', n: 3 }]);
for (let i = 0; i < 20 * 25; i++) sim.step([]);
console.log('riflemen:', sim.ents.filter((e) => e.owner === 0 && e.def === 'rifleman').length, 'credits', Math.floor(p0.credits));
const ids = sim.ents.filter((e) => e.owner === 0 && e.def === 'rifleman').map((e) => e.id);
const before = sim.byId.get(ids[0]);
const bx = before.x, bz = before.z;
sim.step([{ t: 'move', p: 0, ids, x: hq.x + 60, z: hq.z + 40 }]);
for (let i = 0; i < 20 * 20; i++) sim.step([]);
console.log('moved:', Math.hypot(sim.byId.get(ids[0]).x - bx, sim.byId.get(ids[0]).z - bz).toFixed(1), 'units');
process.exit(failed ? 1 : 0);
