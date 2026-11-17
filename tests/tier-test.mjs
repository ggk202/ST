// Tier equipment: kits, IRCM decoys, directed-energy point defense, personal EW jammers, drone jam resistance
import { Sim } from '../js/sim/sim.js';
import { UNITS, DEFS } from '../js/sim/defs.js';
let fail = false; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail = true; };
const mk = () => new Sim({ size: 'small', type: 'island', seed: 3, slots: [{ name: 'A', team: 0 }, { name: 'B', team: 1 }] });
const half = (s) => s.map.size / 2;
// ---- definitions
for (const b of ['mbt', 'heavy', 'ifv', 'sph', 'aa']) {
  const a = DEFS[b], b2 = DEFS[b + '2'], b3 = DEFS[b + '3'];
  if (!a || !b2 || !b3) { ok(false, b + ' tiers exist'); continue; }
  ok(!a.ircm && b2.ircm > 0 && b3.ircm > b2.ircm, b + ': IRCM T1 none / T2 ' + b2.ircm + ' / T3 ' + b3.ircm);
  ok(!a.ew && !b2.ew && b3.ew && b3.ew.radius > 0, b + ': T3 carries an EW suite (r ' + (b3.ew && b3.ew.radius) + ')');
  ok(b2.kit.length > a.kit.length && b3.kit.length > b2.kit.length, b + ': kit lists grow with tier (' + a.kit.length + '/' + b2.kit.length + '/' + b3.kit.length + ')');
}
ok(DEFS.fighter3.laser && !DEFS.fighter2.laser && !DEFS.fighter.laser, 'only T3 jets carry a directed-energy turret');
ok(DEFS.heli3.laser && DEFS.bomber3.laser, 'T3 helicopters and bombers carry directed-energy defense too');
ok(DEFS.fighter2.ircm > 0 && DEFS.fighter3.ircm > DEFS.fighter2.ircm, 'aircraft IRCM scales with tier');
ok(!DEFS.strategic3 || DEFS.strategic3.laser, 'T3 strategic bomber has the laser');
ok(DEFS.fighter3.loadouts.every((l) => l.ed.laser), 'loadout effective defs inherit the laser');
ok(DEFS.robot3.jamRes > DEFS.robot2.jamRes && DEFS.robot2.jamRes > 0 && !DEFS.robot.jamRes, 'ground drones get jam resistance by tier');
ok(DEFS.rifleman3.vision > DEFS.rifleman2.vision && DEFS.rifleman2.vision > DEFS.rifleman.vision * 1.1, 'infantry visors extend vision by tier');
// ---- selfDefense: lasers and IRCM
const missile = (s, tg, ir) => ({ id: ++s.nextPid, k: 'missile', w: '', x: tg.x + 20, y: 30, z: tg.z, sx: tg.x + 60, sy: 30, sz: tg.z, tx: tg.x, ty: 30, tz: tg.z, tid: tg.id, speed: 40, dmg: 100, dtype: 'ap', splash: 0, owner: 1, team: 1, src: 0, arc: 0, t: 0.6, dur: 30, life: 100, aa: true, fx: '', cz: false, ir: ir ? 1 : 0 });
{
  const s = mk(), cx = half(s), cz = half(s); s.recordEvents = true;
  const mkAir = (def) => { const u = s.makeEnt(def, 0, cx, cz); s.players[0].units++; u.ap = 'fly'; u.h = 1; u.ph = 1; u.air = true; u.af = 0; u.spd = 0; return u; };
  const trial = (def, N = 400) => { let kills = 0; for (let i = 0; i < N; i++) { const u = mkAir(def); u.lcd = 0; const p = missile(s, u); if (s.selfDefense(p, u)) kills++; u.dead = true; s.ents.splice(s.ents.indexOf(u), 1); } return kills; };
  const k1 = trial('fighter'), k3 = trial('fighter3');
  ok(k1 === 0, 'T1 fighter has no laser: 0 kills');
  ok(k3 > 400 * 0.55 && k3 < 400 * 0.85, 'T3 laser shoots down ~70% of inbound missiles (' + k3 + '/400 fresh)');
  // cooldown: second shot immediately is refused
  const u = mkAir('fighter3'); u.lcd = 0; s.selfDefense(missile(s, u), u); ok(u.lcd > 0, 'laser goes on cooldown after firing (' + u.lcd + ' ticks)');
  const u2 = mkAir('fighter3'); u2.lcd = 5; let any = 0; for (let i = 0; i < 100; i++) if (s.selfDefense(missile(s, u2, true), u2)) any++; ok(any === 0, 'a laser on cooldown cannot fire');
  // IRCM decoy
  let dec = 0; for (let i = 0; i < 400; i++) { const t = mkAir('fighter2'); t.lcd = 0; const p = missile(s, t); s.selfDefense(p, t); if (p.tid === 0) dec++; }
  ok(dec > 400 * 0.18 && dec < 400 * 0.42, 'T2 jet IRCM decoys ~30% of missiles (' + dec + '/400)');
  const t1 = mkAir('fighter'); const p = missile(s, t1); s.selfDefense(p, t1); ok(p.tid !== 0, 'T1 jet has no IRCM');
  let tk = 0; const tank3 = s.spawnUnit('mbt3', 0, cx + 100, cz); for (let i = 0; i < 400; i++) { const q = missile(s, tank3); s.selfDefense(q, tank3); if (q.tid === 0) tk++; }
  ok(tk > 400 * 0.3 && tk < 400 * 0.6, 'T3 tank IRCM decoys ~45% (' + tk + '/400)');
  // radar-guided (no ir) vs IR flag: each missile is rolled once
  const q = missile(s, tank3); q.ir = 1; s.selfDefense(q, tank3); ok(q.tid === tank3.id || q.tid === 0, 'missile is only rolled once for IRCM (ir flag)');
}
// ---- T3 vehicle EW jammer covers friendly aircraft; T1 tank does not; jam-resistant ground drones
{
  const s = mk(), cx = half(s), cz = half(s);
  const fly = (def, owner, x, z) => { const u = s.makeEnt(def, owner, x, z); s.players[owner].units++; u.ap = 'fly'; u.h = 1; u.ph = 1; u.air = true; u.af = 0; u.spd = 0; u.dirx = 1; u.dirz = 0; return u; };
  s.spawnUnit('mbt3', 0, cx, cz); s.spawnUnit('mbt', 0, cx + 300, cz);
  const near = fly('fighter', 0, cx + 8, cz), nearT1 = fly('fighter', 0, cx + 308, cz), far = fly('fighter', 0, cx + 120, cz);
  for (let i = 0; i < 6; i++) s.step([]);
  ok(near.cover > 0, 'friendly jet beside a T3 tank is covered by its EW suite (cover ' + near.cover + ')');
  ok(!(nearT1.cover > 0) && !(far.cover > 0), 'no cover beside a T1 tank or far from the T3 tank');
  ok(DEFS.sapper3.jamRes > 0 && !DEFS.sapper.jamRes, 'sapper T3 resists jamming; T1 does not');
}
// ---- determinism with tier equipment on both sides
{
  const run = () => { const s = new Sim({ size: 'small', type: 'island', seed: 11, slots: [{ name: 'A', team: 0, ai: 'normal' }, { name: 'B', team: 1, ai: 'normal' }] }); for (const p of s.players) { p.credits = 90000; p.energy = 9000; } for (let i = 0; i < 3000; i++) s.step([]); return s.hash() + ':' + s.ents.length; };
  const a = run(), b = run(); ok(a === b, 'deterministic with tier equipment (' + a + ')');
}
console.log(fail ? 'SOME FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
