// Airlift / airdrop test: Heavy Transport, boarding, flying cargo between airfields, paradrop; strategic bomber gating; engineer boost.
import { Sim } from '../js/sim/sim.js';
import { UNITS, AF } from '../js/sim/defs.js';
let fail = false; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail = true; };
const mk = (seed) => { const s = new Sim({ size: 'small', type: 'island', seed, slots: [{ name: 'A', team: 0 }, { name: 'B', team: 1 }] }); s.recordEvents = false; return s; };
const run = (s, n, cmds = []) => { s.step(cmds); for (let i = 1; i < n; i++) s.step([]); };
const until = (s, f, max) => { for (let i = 0; i < max; i++) { if (f()) return i; s.step([]); } return -1; };
const rich = (s) => { for (const p of s.players) { p.credits = 99999; p.energy = 99999; p.capM = p.capE = 99999; } };
const place = (s, t, ang0, rmin, grow) => {
  const hq = s.hq(0); let bc = null, bs = -1;
  for (let r = rmin; r < 110; r += 4) for (let a = 0; a < 36; a++) {
    const x = hq.x + Math.cos(a / 36 * 6.283 + ang0) * r, z = hq.z + Math.sin(a / 36 * 6.283 + ang0) * r;
    const c = s.canPlace(0, t, x, z); if (!c.ok) continue;
    const sc = grow ? c.plan.max.runway * 10 + c.plan.max.apron : 1; if (sc > bs) { bs = sc; bc = c; }
  }
  return bc ? s.placeBuildingRaw(t, 0, bc.x, bc.z, true, null) : null;
};
let s, af1, af2;
for (const seed of [3, 5, 8, 11, 14, 17]) {
  s = mk(seed); rich(s);
  for (const t of ['barracks', 'factory', 'techlab']) place(s, t, 0, 26, false);
  af1 = place(s, 'airfield', 0, 26, true); af2 = place(s, 'airfield', 3.1, 26, true);
  if (af1 && af2 && af1.maxMod.runway >= 1 && af2.maxMod.runway >= 1) break;
}
ok(!!af1 && !!af2 && af1.id !== af2.id, 'two airfields placed');
for (const af of [af1, af2]) { run(s, 1, [{ t: 'upgrade', p: 0, ids: [af.id], key: 'runway' }]); until(s, () => af.mods.runway >= 1, 1500); }
ok(af1.mods.runway >= 1 && af2.mods.runway >= 1, 'both runways extended to ' + s.afRunLen(af1));
ok(s.canTrain(0, 'airlifter') && !s.canTrain(0, 'strategic'), 'transport available; strategic bomber needs the Heavy Runway');
ok(s.trainBlock(0, 'strategic').includes('Heavy Runway'), 'strategic bomber gate: ' + s.trainBlock(0, 'strategic'));
const sb = UNITS.strategic.loadouts.find((l) => l.id === 'mega'), hb = UNITS.bomber.loadouts.find((l) => l.id === 'buster');
ok(sb.weapons[0].dmg > hb.weapons[0].dmg * 2 && sb.weapons[0].splash > hb.weapons[0].splash, 'strategic mega bomb is the largest caliber (' + sb.weapons[0].dmg + ' vs ' + hb.weapons[0].dmg + ')');
ok(af1.afd && s.afStandCount(af1) >= 2 && AF.rwLen[1] >= 50 && AF.standHalf >= 13, 'larger airfield dimensions');

// build the transport
run(s, 1, [{ t: 'train', p: 0, type: 'airlifter' }]);
let tr = null; until(s, () => { tr = s.ents.find((e) => e.def === 'airlifter' && !e.dead); return !!tr; }, 2500);
ok(!!tr && tr.cargo && tr.ap === 'wait', 'transport built');
const home = s.byId.get(tr.af);
until(s, () => tr.ap === 'select', 400); ok(tr.ap === 'select', 'transport waits at its stand for a configuration (not on the runway)');
run(s, 1, [{ t: 'loadout', p: 0, ids: [tr.id], lo: 1 }]);
const lo = tr.lo; ok(lo === 1 || tr.ap === 'equip', 'troop carrier chosen (idx ' + tr.lo + ')');
until(s, () => tr.ap === 'stand', 800); ok(tr.ap === 'stand' && tr.rdy && s.cargoCap(tr) === 80, 'transport parked and equipped, capacity ' + s.cargoCap(tr));

// load infantry, a buggy and a tank (tank refused by the troop carrier)
const mkU = (def, n) => { const out = []; for (let i = 0; i < n; i++) out.push(s.spawnUnit(def, 0, tr.x + 6 + i * 1.5, tr.z + 10)); return out; };
const inf = mkU('rifleman', 6), scout = mkU('scout', 1), tank = mkU('mbt', 1);
const pre = s.players[0].units;
run(s, 1, [{ t: 'board', p: 0, ids: [...inf, ...scout, ...tank].map((e) => e.id), tid: tr.id }]);
until(s, () => tr.cargo.length >= 7, 1500);
ok(tr.cargo.length === 7 && s.cargoUsed(tr) === 6 + 2, 'infantry and buggy boarded (' + s.cargoUsed(tr) + ' slots)');
ok(!tr.cargo.includes(tank[0]), 'tank refused by the troop carrier');
ok(inf.every((e) => !s.byId.has(e.id)) && s.players[0].units === pre, 'boarded units leave the world but still count');

// airlift to the second airfield
run(s, 1, [{ t: 'lift', p: 0, ids: [tr.id], bid: af2.id }]);
ok(tr.order.t === 'lift', 'lift order accepted');
const t0 = s.tick;
until(s, () => tr.af === af2.id && tr.ap !== 'fly', 6000); if (process.env.DBG) for (let i = 0; i < 40; i++) { run(s, 60); const g = af2.afd, sg = tr.lsg || 1, L = s.afRunLen(af2), tu = sg > 0 ? AF.rw0 + L - 6 : AF.rw0 + 6, fr = s.afFrame(af2, tr, sg, tu); console.log('   ', tr.ap, 'fin', tr.fin, 'ga', tr.ga, 'h', tr.h.toFixed(2), 'spd', tr.spd.toFixed(1), 's', fr.s.toFixed(0), 'l', fr.l.toFixed(0), 'A', tr.lA, 'rwyBusy', af2.rwy, af2.land); }
const done = until(s, () => tr.cargo.length === 0, 6000); if (done < 0) console.log('  DBG', tr.ap, tr.fin, tr.t, tr.h, tr.spd, tr.x|0, tr.z|0, 'dest', af2.x|0, af2.z|0, 'rwy', af2.rwy, af2.land, af2.stands.join(','), 'S18', s.byId.get(18) && s.byId.get(18).def, 'trid', tr.id, 'home', home.id, af1.id, 'unl', tr.unl, tr.order.t, tr.lsg, tr.lA);
ok(done >= 0, 'cargo unloaded at the destination airfield after ' + (s.tick - t0) + ' ticks');
ok(inf.every((e) => s.byId.get(e.id) === e && !e.dead && !e.boarded), 'units are back in the world');
const near = inf.every((e) => (e.x - af2.x) ** 2 + (e.z - af2.z) ** 2 < 130 * 130); ok(near, 'units are at the destination airfield');
ok(tr.af === af2.id, 'transport re-homed at the destination airfield');

// airdrop: load again at af2 stand, fly out and paradrop
until(s, () => tr.ap === 'stand', 1500);
run(s, 1, [{ t: 'board', p: 0, ids: [...inf, ...scout].map((e) => e.id), tid: tr.id }]);
until(s, () => tr.cargo.length >= 7, 1500); ok(tr.cargo.length === 7, 're-boarded for the airdrop');
const dx = s.map.size * 0.5, dz = s.map.size * 0.5;
run(s, 1, [{ t: 'drop', p: 0, ids: [tr.id], x: dx, z: dz }]);
const dr = until(s, () => tr.cargo.length === 0, 6000); ok(dr >= 0, 'paradrop executed');
ok(inf.every((e) => e.chute > 0 || e.chute === 0) && inf.some((e) => e.chute > 0), 'dropped units descend under parachutes');
run(s, 220); ok(inf.every((e) => !e.chute && s.byId.has(e.id)), 'units landed and are controllable');
ok(inf.every((e) => (e.x - dx) ** 2 + (e.z - dz) ** 2 < 70 * 70), 'drop zone accuracy');
const rb = until(s, () => tr.ap === 'land' || tr.ap === 'rearm' || tr.ap === 'taxiIn', 6000); ok(rb >= 0, 'transport returns to an airfield after the drop');

// cargo is lost with the aircraft
const s2 = mk(3); rich(s2);
const t2 = s2.makeEnt('airlifter', 0, 60, 60); s2.players[0].units++; t2.cargo = []; const r2 = s2.spawnUnit('rifleman', 0, 60, 62); t2.ed = UNITS.airlifter.loadouts[0].ed; t2.ap = 'stand'; s2.board(r2, t2);
const n0 = s2.players[0].units; s2.kill(t2); ok(s2.players[0].units === n0 - 2 && r2.dead, 'cargo dies with the transport');

// engineer boost: nearby engineers speed up a constructing building
const e1 = mk(4), e2 = mk(4); rich(e1); rich(e2);
const bp = (sim, n) => { const hq = sim.hq(0); const c = sim.canPlace(0, 'powerplant', hq.x + 22, hq.z + 4); let b = null; if (c.ok) { b = sim.placeBuildingRaw('powerplant', 0, c.x, c.z, false, null); for (let i = 0; i < n; i++) sim.spawnUnit('engineer', 0, c.x + 4 + i, c.z + 4); } return b; };
const b1 = bp(e1, 0), b2 = bp(e2, 5);
if (b1 && b2) { run(e1, 120); run(e2, 120); ok(b2.progress > b1.progress * 1.5, 'engineers speed up construction (' + b1.progress.toFixed(2) + ' -> ' + b2.progress.toFixed(2) + ', boost x' + (b2.eb || 1).toFixed(1) + ')'); } else ok(false, 'engineer test placement');
console.log(fail ? 'SOME FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
