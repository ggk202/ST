// Airfield test: modular airfield, loadouts, ground-ops cycle (stand -> taxi -> runway -> loadout -> crews -> takeoff -> RTB -> land -> rearm).
import { Sim } from '../js/sim/sim.js';
import { UNITS, AF } from '../js/sim/defs.js';
let fail = false; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail = true; };
const mk = (seed = 3) => { const s = new Sim({ size: 'small', type: 'island', seed, slots: [{ name: 'A', team: 0 }, { name: 'B', team: 1 }] }); s.recordEvents = false; return s; };
const run = (s, n, cmds = []) => { s.step(cmds); for (let i = 1; i < n; i++) s.step([]); };
const until = (s, f, max) => { for (let i = 0; i < max; i++) { if (f()) return i; s.step([]); } return -1; };
const rich = (s) => { for (const p of s.players) { p.credits = 99999; p.energy = 99999; p.capM = p.capE = 99999; } };
// instantly place the prerequisite chain + an airfield near the HQ of player 0
const setup = (s) => {
  const hq = s.hq(0); let af = null;
  for (const t of ['barracks', 'factory', 'techlab', 'airfield']) {
    let placed = null, bestScore = -1, bc = null;
    for (let r = 26; r < 80; r += 4) for (let a = 0; a < 24; a++) {
      const x = hq.x + Math.cos(a / 24 * 6.283) * r, z = hq.z + Math.sin(a / 24 * 6.283) * r;
      const c = s.canPlace(0, t, x, z); if (!c.ok) continue;
      const sc = t === 'airfield' ? c.plan.max.runway * 10 + c.plan.max.apron : 1;   // want a site that can grow
      if (sc > bestScore) { bestScore = sc; bc = c; }
    }
    if (bc) placed = s.placeBuildingRaw(t, 0, bc.x, bc.z, true, null);
    if (!placed) return null; if (t === 'airfield') af = placed;
  }
  return af;
};
const seed0 = 5; let af, s;
for (const seed of [3, 5, 8, 11, 14]) { s = mk(seed); rich(s); af = setup(s); if (af) break; }
ok(!!af && !!af.afd, 'airfield placed with runway layout (axis ' + (af && af.afd && af.afd.ax) + ')');
ok(af.mods.runway === 0 && s.afStandCount(af) === 2 && s.afRunLen(af) === AF.rwLen[1], 'base airfield: short runway, 2 stands');
// runway reservation cells exist
let rsvCells = 0; for (const v of s.rsv) if (v === af.id) rsvCells++; ok(rsvCells > 40, 'runway/apron cells reserved (' + rsvCells + ')');

run(s, 2);
console.log('  max modules', JSON.stringify(af.maxMod));
// --- gating: Heavy Bomber needs the Long Runway
ok(!s.canTrain(0, 'bomber') && s.trainBlock(0, 'bomber').includes('Long Runway'), 'bomber blocked without runway extension: ' + s.trainBlock(0, 'bomber'));
ok(s.canTrain(0, 'fighter') && s.canTrain(0, 'heli'), 'fighter and heli can be trained');
// --- upgrades
run(s, 1, [{ t: 'upgrade', p: 0, ids: [af.id], key: 'runway' }]);
ok(!!af.up, 'runway upgrade started');
const ut = until(s, () => af.mods.runway === 1, 800); ok(ut >= 0 && s.afRunLen(af) === AF.rwLen[2], 'runway upgrade completes (' + ut + ' ticks), length ' + s.afRunLen(af));
ok(s.canTrain(0, 'bomber'), 'bomber unlocked after runway extension');
run(s, 1, [{ t: 'upgrade', p: 0, ids: [af.id], key: 'apron' }]); until(s, () => af.mods.apron === 1, 800);
ok(s.afStandCount(af) === 4, 'apron upgrade gives 4 stands');

// --- full sortie cycle for a fighter
run(s, 1, [{ t: 'train', p: 0, type: 'fighter' }]);
const seen = [];
let u = null;
until(s, () => { u = s.ents.find((e) => e.def === 'fighter' && !e.dead); return !!u; }, 1500);
ok(!!u && u.ap === 'wait' && !u.air && u.h === 0, 'fighter constructed on a stand, on the ground');
const track = () => { if (seen[seen.length - 1] !== u.ap) seen.push(u.ap); };
// a landing aircraft blocks take-off: fake one
af.land = 9999; run(s, 40); ok(u.ap === 'wait', 'aircraft holds while someone is landing'); af.land = 0;
until(s, () => { track(); return u.ap === 'select'; }, 600);
ok(u.ap === 'select' && af.rwy === u.id, 'taxied onto the runway and waiting for a loadout (runway reserved)');
const x0 = u.x, z0 = u.z; run(s, 20); ok(u.x === x0 && u.z === z0, 'holds position while waiting for player');
const loIdx = UNITS.fighter.loadouts.findIndex((l) => l.id === 'multi');
const cr0 = s.players[0].credits;
run(s, 1, [{ t: 'loadout', p: 0, ids: [u.id], lo: loIdx }]);
ok(u.ap === 'equip' && s.players[0].credits < cr0, 'loadout chosen: crews start arming and cost is paid (' + (cr0 - s.players[0].credits) + ')');
until(s, () => { track(); return u.ap === 'takeoff'; }, 600);
ok(u.ap === 'takeoff' && u.rdy && u.ed && u.ed.weapons.length === 2 && u.am[0] === 2 && u.am[1] === 4, 'armed with Multirole (ammo ' + u.am + ')');
until(s, () => { track(); return u.ap === 'fly'; }, 600);
ok(u.ap === 'fly' && u.air && u.h > 0.5 && af.rwy === 0, 'airborne, runway released');
console.log('  phases: ' + seen.join(' -> '));
ok(['wait', 'taxiOut', 'select', 'equip', 'takeoff'].every((p) => seen.includes(p)), 'all ground phases visited in order');

// --- ammo -> bingo -> RTB -> land -> taxi -> rearm
u.am = u.am.map(() => 0);
const rt = until(s, () => { track(); return u.ap === 'rtb'; }, 100);
ok(rt >= 0, 'out of ammo: returns to base automatically');
const st = until(s, () => { track(); if (process.env.DBG && s.tick % 60 === 0 && u.ap === 'rtb') { const g = af.afd, rx = u.x - af.x, rz = u.z - af.z; console.log('rtb', u.fin, u.ga, ((rx*g.dx+rz*g.dz)-(AF.rw0+s.afRunLen(af)-6)).toFixed(0), (rx*g.px+rz*g.pz).toFixed(0), 'rwy', af.rwy, 'land', af.land, u.h.toFixed(2), u.spd.toFixed(1)); } return u.ap === 'stand'; }, 7000);
ok(st >= 0 && u.am[0] === 2 && u.am[1] === 4 && !u.air, 'landed, taxied in, re-armed on a stand (' + st + ' ticks)');
console.log('  phases: ' + seen.join(' -> '));
ok(seen.includes('land') && seen.includes('taxiIn') && seen.includes('rearm'), 'landing cycle phases visited');

// --- VTOL / heli skip the runway
run(s, 1, [{ t: 'train', p: 0, type: 'heli' }]);
let h = null; until(s, () => { h = s.ents.find((e) => e.def === 'heli' && !e.dead); return !!h; }, 1500);
until(s, () => h.ap === 'select', 200); ok(h.ap === 'select' && af.rwy === 0, 'helicopter arms on its stand without using the runway');
run(s, 1, [{ t: 'loadout', p: 0, ids: [h.id], lo: 1 }]); until(s, () => h.ap === 'fly', 800); ok(h.ap === 'fly' && h.air, 'helicopter lifts off vertically');

// --- bomber: heavy loadouts need depot + heavy runway
const bl = UNITS.bomber.loadouts; ok(!s.afAllowed(af, bl[2]) && s.afAllowed(af, bl[0]), 'heavy bomb loadouts locked, carpet bombing allowed');

// --- timeout falls back, AI picks automatically, auto-arm works

// --- locked / unaffordable loadouts are rejected
{ const s2 = mk(seed0); rich(s2); const f2 = setup(s2); s2.step([]);
  const u2 = s2.spawnAircraft(f2, 'bomber', 0); f2.mods.runway = 1; until(s2, () => u2.ap === 'select', 800);
  ok(!s2.afSelect(u2, 2) && u2.ap === 'select', 'locked loadout (needs depot III / heavy runway) is rejected');
  s2.players[0].credits = 10; ok(!s2.afSelect(u2, 1) && u2.ap === 'select', 'unaffordable loadout is rejected');
  s2.players[0].credits = 99999;
  // timeout fallback to the free standard loadout
  const t0 = until(s2, () => u2.ap === 'equip', 1400); ok(t0 >= 1150 && t0 <= 1250 && u2.lo === 0, 'no choice within ' + AF.selectTimeout + ' s -> standard loadout (' + t0 + ' ticks)');
  // auto-arm remembers the last loadout
  const u3 = s2.spawnAircraft(f2, 'fighter', 1); f2.auto = true; f2.last.fighter = 1; until(s2, () => u3.ap === 'equip' || u3.ap === 'takeoff', 3000); ok(u3.lo === 1, 'auto-arm uses the remembered loadout (' + u3.lo + ')'); }
// --- AI picks by itself, no player prompt
{ const s2 = mk(seed0); rich(s2); s2.players[0].ai = 'normal'; const f2 = setup(s2); s2.step([]); const u2 = s2.spawnAircraft(f2, 'fighter', 0); until(s2, () => u2.ap === 'equip', 800); ok(u2.ap === 'equip' || u2.ap === 'takeoff', 'AI aircraft arms without waiting'); }
// --- parked aircraft block new production; selling the airfield removes them and frees the runway reservation
{ const s2 = mk(seed0); rich(s2); const f2 = setup(s2); s2.step([]);
  const a = s2.spawnAircraft(f2, 'uav', 0), b2 = s2.spawnAircraft(f2, 'uav', 1); a.ap = b2.ap = 'stand'; a.rdy = b2.rdy = true;
  run(s2, 1, [{ t: 'train', p: 0, type: 'uav' }]); run(s2, 600); ok(f2.queue.length === 1 && f2.queue[0].left <= 0, 'production waits while every stand is occupied');
  run(s2, 1, [{ t: 'sell', p: 0, ids: [f2.id] }]); run(s2, 2);
  ok(a.dead && b2.dead, 'selling the airfield removes the parked aircraft'); let n = 0; for (const v of s2.rsv) if (v === f2.id) n++; ok(n === 0, 'runway reservation released'); }
// --- manual RTB and order resume
{ const s2 = mk(seed0); rich(s2); const f2 = setup(s2); s2.step([]); const u2 = s2.spawnAircraft(f2, 'fighter', 0); f2.auto = true; until(s2, () => u2.ap === 'fly', 3000);
  run(s2, 1, [{ t: 'rtb', p: 0, ids: [u2.id] }]); ok(u2.ap === 'rtb', 'return-to-base command'); until(s2, () => u2.ap === 'stand', 3000); ok(u2.ap === 'stand', 'RTB aircraft lands and parks');
  run(s2, 1, [{ t: 'move', p: 0, ids: [u2.id], x: f2.x + 80, z: f2.z + 80 }]); until(s2, () => u2.ap === 'fly', 3000); ok(u2.ap === 'fly', 'an order given to a parked aircraft launches it'); }
// --- determinism: two sims with the same inputs agree
const det = () => { const a = mk(3); rich(a); const f = setup(a); if (!f) return 0; run(a, 1, [{ t: 'upgrade', p: 0, ids: [f.id], key: 'runway' }, { t: 'train', p: 0, type: 'fighter' }]); run(a, 1200); return a.hash(); };
const h1 = det(), h2 = det(); ok(h1 === h2, 'air ops deterministic ' + h1 + ' ' + h2);
// --- selling the airfield kills parked aircraft and frees the reservation
console.log(fail ? 'FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
