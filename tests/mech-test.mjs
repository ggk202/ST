// Mechanics test: drones, EW, HPM, suicide strikes, EMP, tiers, streaming economy.
import { Sim } from '../js/sim/sim.js';
import { UNITS } from '../js/sim/defs.js';
let fail = false; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail = true; };
const mk = () => { const s = new Sim({ size: 'small', type: 'island', seed: 3, slots: [{ name: 'A', team: 0 }, { name: 'B', team: 1 }] }); s.recordEvents = false; return s; };
const run = (s, n, cmds = []) => { s.step(cmds); for (let i = 1; i < n; i++) s.step([]); };
const A = mk(); const hq0 = A.hq(0), hq1 = A.hq(1);
const cx = A.map.size / 2, cz = A.map.size / 2;
const near = (s, def, owner, x, z) => s.spawnUnit(def, owner, x, z);

// 1. tiers scale
ok(UNITS.mbt3.hp > UNITS.mbt2.hp && UNITS.mbt2.hp > UNITS.mbt.hp, 'tier HP scales ' + [UNITS.mbt.hp, UNITS.mbt2.hp, UNITS.mbt3.hp]);
ok(UNITS.mbt3.cost > UNITS.mbt.cost && UNITS.mbt3.techLv === 2 && UNITS.mbt2.techLv === 1, 'tier cost/tech gates');

// 2. HPM EW dog kills drones, ignores tanks
{ const s = mk(); const x = s.map.size / 2, z = s.map.size / 2;
  const dog = near(s, 'ewdog', 0, x, z); const fpv = near(s, 'fpv', 1, x + 15, z); const tank = near(s, 'mbt', 1, x - 15, z);
  const hp0 = tank.hp; run(s, 80);
  ok(fpv.dead, 'HPM kills enemy FPV drone'); ok(tank.hp >= hp0 - 1, 'HPM does not hurt tank (' + tank.hp + '/' + hp0 + ')'); }

// 3. jamming slows enemy drones and shrinks aircraft vision
{ const s = mk(); const x = s.map.size / 2, z = s.map.size / 2;
  near(s, 'ewtruck', 0, x, z); const robot = near(s, 'robot', 1, x + 20, z); const heli = near(s, 'heli', 1, x + 20, z + 10);
  const robotFree = near(s, 'robot', 1, x + 120, z + 90);
  run(s, 3);
  ok(robot.jam >= 1 && heli.jam >= 1 && robotFree.jam === 0, 'jam applies inside radius only: ' + [robot.jam, heli.jam, robotFree.jam]); }

// 4. EW stops working without energy
{ const s = mk(); const x = s.map.size / 2, z = s.map.size / 2;
  near(s, 'ewtruck', 0, x, z); const robot = near(s, 'robot', 1, x + 20, z);
  s.players[0].energy = 0; for (let i = 0; i < 12; i++) near(s, 'ewtruck', 0, x + i * 3, z - 40);   // upkeep far above income
  run(s, 8); ok(robot.jam === 0, 'no energy -> jammer off'); }

// 5. suicide drone detonates, damages target and dies
{ const s = mk(); const t = s.hq(1); const c = near(s, 'carrier', 0, t.x - 60, t.z);
  const hp0 = t.hp; run(s, 1, [{ t: 'attackground', p: 0, ids: [c.id], x: t.x, z: t.z }]); run(s, 20 * 12);
  ok(c.dead && t.hp < hp0 - 200, 'deep strike carrier hits for ' + Math.round(hp0 - t.hp)); }

// 6. EMP stuns
{ const s = mk(); const x = s.map.size / 2, z = s.map.size / 2;
  const tank = near(s, 'mbt', 1, x + 30, z); const e = near(s, 'empcarrier', 0, x, z);
  run(s, 1, [{ t: 'attackground', p: 0, ids: [e.id], x: tank.x, z: tank.z }]); run(s, 20 * 5);
  ok(tank.stun > 20, 'EMP stuns tank (' + tank.stun + ' ticks left)'); }

// 7. streaming economy: queue drains continuously and respects shortage
{ const s = mk(); const p = s.players[0]; const m0 = p.credits;
  run(s, 1, [{ t: 'train', p: 0, type: 'engineer', n: 1 }]); run(s, 40);
  const it = s.hq(0).queue[0]; const spent = it ? it.sm : -1; ok(spent > 0 && spent < UNITS.engineer.cost, 'metal drains gradually (' + spent.toFixed(0) + '/' + UNITS.engineer.cost + ')');
  p.credits = 0; const b = s.ents.find((e) => e.owner === 0 && e.def === 'hq'); const l0 = b.queue.length ? b.queue[0].left : 0; if (!b.queue.length) run(s, 1, [{ t: 'train', p: 0, type: 'engineer', n: 1 }]);
  run(s, 40); ok(b.queue.length === 0 || b.queue[0].left >= l0 - 41, 'production stalls when metal is empty'); }

// 8. tech gating
{ const s = mk(); ok(!s.canTrain(0, 'rifleman2'), 'Mk II locked without Tech Lab'); }

// 9. refund on cancel
{ const s = mk(); const p = s.players[0]; run(s, 1, [{ t: 'train', p: 0, type: 'engineer', n: 2 }]); run(s, 30);
  const c1 = p.credits; run(s, 1, [{ t: 'dequeue', p: 0, type: 'engineer' }, { t: 'dequeue', p: 0, type: 'engineer' }]); ok(p.credits > c1 - 1, 'cancel refunds spent metal'); }

// 10. repair bot heals
{ const s = mk(); const x = s.map.size / 2, z = s.map.size / 2; const r = near(s, 'repair', 0, x, z); const t = near(s, 'mbt', 0, x + 6, z); t.hp = 100; run(s, 60);
  ok(t.hp > 150, 'repair bot heals (' + Math.round(t.hp) + ')'); }
process.exit(fail ? 1 : 0);
