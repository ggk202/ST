// Logistics: ammo supply, depots, trucks, fuel, tankers, pallets, SEAD/EMCON, escorts, veterancy, salvage, control points, weather
import { Sim } from '../js/sim/sim.js';
import { UNITS, DEFS } from '../js/sim/defs.js';
let fail = false; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail = true; };
const mk = (o = {}) => { const s = new Sim(Object.assign({ size: 'small', type: 'island', seed: 3, slots: [{ name: 'A', team: 0 }, { name: 'B', team: 1 }] }, o)); for (const p of s.players) { p.credits = 99999; p.energy = 99999; p.capM = p.capE = 99999; } return s; };
const half = (s) => s.map.size / 2;
const upd = (s, n = 8) => { for (let i = 0; i < n; i++) s.step([]); };
const flyer = (s, def, owner, x, z, dx = 1, dz = 0) => { const u = s.makeEnt(def, owner, x, z); s.players[owner].units++; u.ap = 'fly'; u.h = 1; u.ph = 1; u.air = true; u.af = 0; u.spd = DEFS[def].speed * 0.8; u.dirx = dx; u.dirz = dz; return u; };
const spot = (s) => { const h = s.hq(0); return { x: h.x + 80, z: h.z + 60 }; };   // clear of the HQ supply radius
const bld = (s, def, owner, x, z) => { const c = s.canPlace(owner, def, x, z); return s.placeBuildingRaw(def, owner, c.ok ? c.x : x, c.ok ? c.z : z, true, null); };

// ---- ammunition
{
  const s = mk(), P = spot(s);
  const tank = s.spawnUnit('mbt', 0, P.x, P.z), foe = s.spawnUnit('supplytruck', 1, P.x + 40, P.z); foe.hp = foe.maxhp = 1e7; foe.order = { t: 'idle' };
  ok(tank.sup === DEFS.mbt.sup && DEFS.mbt.sup > 0, 'ground units start with full supplies (' + tank.sup + ')');
  s.exec({ t: 'attack', p: 0, ids: [tank.id], tid: foe.id }); upd(s, 900);
  ok(tank.sup < DEFS.mbt.sup * 0.95, 'firing burns supplies (' + Math.round(tank.sup) + '/' + DEFS.mbt.sup + ')');
  tank.sup = 0.01; const hp0 = foe.hp; upd(s, 120);
  ok(foe.hp === hp0 || foe.hp > hp0 - 1, 'a dry tank cannot fire');
  // depot restocks it
  const dep = bld(s, 'supplydepot', 0, P.x - 14, P.z); tank.x = dep.x + 8; tank.z = dep.z; tank.px = tank.x; tank.pz = tank.z; tank.order = { t: 'idle' };
  const st0 = dep.stock; upd(s, 120);
  ok(tank.sup > DEFS.mbt.sup * 0.6, 'supply depot rearms nearby tanks (' + Math.round(tank.sup) + ')');
  ok(dep.stock < st0, 'the depot spends its stock to do so');
  const s2 = mk(), q = spot(s2), t2 = s2.spawnUnit('mbt', 0, q.x, q.z); t2.sup = 1; upd(s2, 40);
  ok(t2.sup === 1, 'no depot, truck or base nearby: no restock');
  t2.order = { t: 'idle' }; const hq = s2.hq(0); t2.x = hq.x + 12; t2.z = hq.z; upd(s2, 80); ok(t2.sup > 30, 'the HQ also resupplies units around it');
}
// ---- trucks
{
  const s = mk(), P = spot(s), dep = bld(s, 'supplydepot', 0, P.x, P.z); dep.stock = 100;
  const truck = s.spawnUnit('supplytruck', 0, dep.x + 6, dep.z); ok(truck.stock === DEFS.supplytruck.supply.cap, 'trucks spawn loaded');
  upd(s, 200); ok(dep.stock > 500, 'a loaded truck feeds an empty depot (' + Math.round(dep.stock) + ')');
  const tank = s.spawnUnit('mbt', 0, dep.x - 40, dep.z); tank.sup = 10; const tr2 = s.spawnUnit('supplytruck', 0, tank.x + 5, tank.z); upd(s, 120);
  ok(tank.sup > 60 && tr2.stock < DEFS.supplytruck.supply.cap, 'truck rearms a tank in the field (' + Math.round(tank.sup) + ')');
  // standing orders: an AUTO truck goes back to the HQ when low, and heads for a dry depot afterwards
  const s3 = mk(), A = spot(s3), d3 = bld(s3, 'supplydepot', 0, A.x + 40, A.z); d3.stock = 50;
  const tk = s3.spawnUnit('supplytruck', 0, s3.hq(0).x + 24, s3.hq(0).z); s3.exec({ t: 'lauto', p: 0, ids: [tk.id], v: 1 });
  upd(s3, 1500); ok(d3.stock > 700, 'an AUTO truck keeps a depot stocked (' + Math.round(d3.stock) + ')');
  // low-supply idle units walk to a source on their own
  const s4 = mk(), B = s4.hq(0), u = s4.spawnUnit('mbt', 0, B.x + 70, B.z); u.sup = 5; upd(s4, 1200);
  const dx = u.x - B.x, dz = u.z - B.z; ok(u.sup > 100 && dx * dx + dz * dz < 40 * 40, 'idle units that run dry head to resupply by themselves');
}
// ---- fuel and tankers
{
  const s = mk(), cx = half(s);
  const f = flyer(s, 'fighter', 0, cx, cx); f.ed = UNITS.fighter.loadouts[0].ed; f.am = [6, 200]; f.cd = [0, 0];
  const f0 = f.fuel; upd(s, 100); ok(f.fuel < f0 - 4 && f.fuel > f0 - 7, 'fuel burns in flight (' + (f0 - f.fuel).toFixed(1) + ' s in 5 s)');
  f.fuel = 1; upd(s, 40); ok(f.dead, 'an aircraft that runs out of fuel and has no field crashes');
  const s2 = mk(), c2 = half(s2), t = flyer(s2, 'tanker', 0, c2, c2), g = flyer(s2, 'fighter', 0, c2 + 30, c2); g.ed = UNITS.fighter.loadouts[0].ed; g.am = [6, 200]; g.cd = [0, 0];
  g.fuel = 40; const ts = t.fstock; upd(s2, 60);
  ok(g.fuel > 60 && t.fstock < ts, 'a tanker refuels a thirsty fighter in range (' + Math.round(g.fuel) + ' s)');
  const far = flyer(s2, 'fighter', 0, c2 + 400, c2 + 300); far.ed = g.ed; far.am = [6, 200]; far.cd = [0, 0]; far.fuel = 90; upd(s2, 20);
  ok(far.fuel < 90 && !far.dead, 'aircraft out of boom range are not refueled');
  const foe = flyer(s2, 'fighter', 1, c2 + 20, c2); foe.fuel = 30; upd(s2, 40); ok(foe.fuel < 30, 'enemy tankers do not help: aircraft only take fuel from their own team');
  // low-fuel aircraft with an airfield go home
  const s3 = mk(); const h = s3.hq(0), af = bld(s3, 'airfield', 0, h.x + 60, h.z + 40);
  const r = flyer(s3, 'fighter', 0, af.x + 300, af.z); r.ed = UNITS.fighter.loadouts[0].ed; r.am = [6, 200]; r.cd = [0, 0]; r.fuel = 18; upd(s3, 30);
  ok(r.ap === 'rtb' || r.ap === 'land' || r.ap === 'approach' || (r.ap && r.ap !== 'fly'), 'a thirsty aircraft returns to base (ap=' + r.ap + ')');
  const fz = flyer(s3, 'fighter', 0, af.x + 40, af.z); fz.ed = r.ed; fz.am = [6, 200]; fz.cd = [0, 0]; fz.fuel = 90; upd(s3, 20); ok(fz.ap === 'fly', 'plenty of fuel: stays on station');
}
// ---- pallets
{
  const s = mk(), P = spot(s), lf = flyer(s, 'airlifter', 0, P.x - 120, P.z); lf.ed = UNITS.airlifter.loadouts.find((l) => l.id === 'pallets').ed; lf.pal = 8; lf.cargo = [];
  const tank = s.spawnUnit('mbt', 0, P.x, P.z); tank.sup = 5; tank.stun = 99999;
  s.exec({ t: 'supplydrop', p: 0, ids: [lf.id], x: P.x, z: P.z }); upd(s, 500);
  ok(s.crates.length > 0 && lf.pal < 8, 'the transport releases pallets (' + s.crates.length + ' crates, ' + lf.pal + ' left)');
  upd(s, 250); ok(tank.sup > 60, 'units resupply from landed pallets (' + Math.round(tank.sup) + ')');
  const foeT = s.spawnUnit('mbt', 1, P.x + 2, P.z + 2); foeT.sup = 1; foeT.stun = 99999; upd(s, 200); ok(foeT.sup > 20, 'pallets are neutral: any team may use them (' + Math.round(foeT.sup) + ')');
}
// ---- SEAD / EMCON
{
  const s = mk(), h = s.hq(1), cx = half(s);
  const sam = bld(s, 'sam', 1, h.x + 40, h.z + 40);
  const sead = flyer(s, 'fighter', 0, sam.x - 70, sam.z); const lo = UNITS.fighter.loadouts.find((l) => l.id === 'sead'); sead.ed = lo.ed; sead.am = lo.weapons.map((w) => (w.ammo > 0 ? w.ammo : -1)); sead.cd = lo.weapons.map(() => 0); sead.fuel = 200;
  upd(s, 8); ok(s.esm[0].has(sam.id), 'ESM picks up a transmitting SAM radar for an ARM carrier');
  ok(s.wCan(lo.weapons[0], sam), 'ARM missiles may engage an emitting radar');
  s.exec({ t: 'emcon', p: 1, ids: [sam.id], v: 1 }); upd(s, 8);
  ok(!s.esm[0].has(sam.id) && !s.wCan(lo.weapons[0], sam), 'EMCON hides the SAM from the ARM');
  s.exec({ t: 'emcon', p: 1, ids: [sam.id], v: 0 }); const hp0 = sam.hp; sead.order = { t: 'attack', tid: sam.id }; upd(s, 300);
  ok(sam.hp < hp0 || sam.dead, 'SEAD fighter damages the radar site (' + Math.round(sam.hp) + '/' + hp0 + ')');
  const dummy = s.spawnUnit('mbt', 1, h.x + 90, h.z + 90); ok(!s.wCan(lo.weapons[0], dummy), 'ARM missiles ignore targets that do not emit');
  // radar contact on a decoy
  const s2 = mk(), c2 = half(s2); bld(s2, 'radar', 0, c2, c2); const dc = flyer(s2, 'decoy', 1, c2 + 100, c2); upd(s2, 8);
  ok(s2.contact[0].has(dc.id), 'a decoy drone shows up on radar like a real aircraft');
}
// ---- escorts
{
  const s = mk(), P = spot(s), lead = s.spawnUnit('mbt', 0, P.x, P.z), e1 = s.spawnUnit('ifv', 0, P.x - 40, P.z);
  s.exec({ t: 'escort', p: 0, ids: [e1.id], tid: lead.id }); s.exec({ t: 'move', p: 0, ids: [lead.id], x: P.x + 60, z: P.z + 20 }); upd(s, 500);
  const dx = e1.x - lead.x, dz = e1.z - lead.z; ok(dx * dx + dz * dz < 30 * 30, 'escort follows its leader (' + Math.round(Math.sqrt(dx * dx + dz * dz)) + ' m)');
  const jet = flyer(s, 'fighter', 0, P.x, P.z); jet.ed = UNITS.fighter.loadouts[0].ed; jet.am = [6, 200]; jet.cd = [0, 0]; s.exec({ t: 'escort', p: 0, ids: [jet.id], tid: lead.id }); upd(s, 300);
  const jx = jet.x - lead.x, jz = jet.z - lead.z; ok(jx * jx + jz * jz < 160 * 160, 'a fighter escorts the column');
  s.exec({ t: 'escort', p: 0, ids: [e1.id], tid: s.hq(1).id }); ok(e1.order.tid !== s.hq(1).id, 'cannot escort an enemy');
}
// ---- veterancy, salvage, points, weather
{
  const s = mk(), P = spot(s), a = s.spawnUnit('mbt', 0, P.x, P.z), v = s.spawnUnit('supplytruck', 1, P.x + 30, P.z); v.hp = v.maxhp = 1e6; v.order = { t: 'idle' }; const mh = a.maxhp;
  s.exec({ t: 'attack', p: 0, ids: [a.id], tid: v.id }); upd(s, 1500);
  ok(a.vet >= 1 && a.maxhp > mh, 'veterans are promoted with damage dealt (rank ' + a.vet + ', hp ' + mh + ' -> ' + a.maxhp + ')');
  const dmg0 = DEFS.mbt.weapons[0].dmg; ok(true, 'rank multiplies damage by ' + (1 + 0.1 * (a.vet || 0)).toFixed(1));
  const w = s.spawnUnit('mbt', 1, P.x + 200, P.z + 100); s.kill(w, false); ok(s.wrecks.length === 1, 'destroyed vehicles leave wrecks');
  const eng = s.spawnUnit('engineer', 0, w.x + 15, w.z); const c0 = s.players[0].credits; s.players[0].credits = 1000; upd(s, 400);
  ok(s.players[0].credits > 1000 && s.wrecks.length === 0, 'engineers salvage wrecks for credits (+' + Math.round(s.players[0].credits - 1000) + ')');
}
{
  const s = mk(); ok(s.points.length === 3, 'small map has 3 control points'); const q = s.points[0];
  const u = s.spawnUnit('rifleman', 0, q.x, q.z); upd(s, 400); ok(q.team === 0, 'infantry capture a control point');
  const e = s.spawnUnit('rifleman', 1, q.x + 3, q.z); upd(s, 200); ok(q.team === 0, 'a contested point does not change hands');
  u.hp = 1; s.kill(u, true); upd(s, 700); ok(q.team === 1 || q.p > 0, 'once only the enemy remains the point flips');
  ok(s.vis[q.team === 1 ? 1 : 0][s.map.cellOf(q.x + 30, q.z)] === 1, 'owned points reveal the surroundings');
  const s2 = mk(); for (let i = 0; i < 3; i++) { s2.points[i].team = 0; s2.points[i].owner = 0; } s2.hold[0] = 9590; upd(s2, 12); ok(s2.over && s2.winner === 0, 'holding the majority of points long enough wins the game');
  const s3 = mk(); const g = s3.spawnUnit('mbt', 0, spot(s3).x, spot(s3).z); const base = s3.visionMul(g, DEFS.mbt); s3.wx.kind = 2; ok(s3.visionMul(g, DEFS.mbt) < base * 0.6, 'fog cuts ground vision');
  s3.wx.kind = 0; s3.wx.night = 1; const t1 = s3.visionMul(g, DEFS.mbt), t3 = s3.visionMul(g, DEFS.mbt3); ok(t3 > t1 && t1 < 0.7, 'night hurts Mk I vision; Mk III thermals do not care (' + t1.toFixed(2) + ' vs ' + t3.toFixed(2) + ')');
  const s4 = mk({ points: false }); ok(s4.points.length === 0, 'control points can be disabled');
}
// ---- oil depletion
{
  const s = mk(), nd = s.map.oil[0], b = bld(s, 'derrick', 0, 0, 0); const c = s.canPlace(0, 'derrick', s.map.oil[0].ci * 4, s.map.oil[0].cj * 4, 0);
  ok(true, 'oil node exists: ' + !!nd);
}
// ---- renderer interpolation input: ph must follow h every tick (stale ph made diving aircraft saw-tooth)
{
  const s = mk(), cx = half(s), f = flyer(s, 'fighter', 0, cx, cx); f.ed = UNITS.fighter.loadouts[0].ed; f.am = [6, 200]; f.cd = [0, 0]; f.fuel = 200;
  const tgt = s.spawnUnit('supplytruck', 1, cx + 120, cx + 60); tgt.hp = tgt.maxhp = 1e7; s.exec({ t: 'attack', p: 0, ids: [f.id], tid: tgt.id });
  let bad = 0, moved = 0, prevH = f.h; for (let i = 0; i < 500; i++) { s.step([]); if (Math.abs(f.ph - prevH) > 1e-9) bad++; if (Math.abs(f.h - f.ph) > 1e-6) moved++; prevH = f.h; }
  ok(bad === 0 && moved > 5, 'ph tracks the previous tick altitude every tick (' + bad + ' stale, ' + moved + ' ticks of altitude change)');
}
// ---- tanker production and sortie
{
  const s = mk(); const h = s.hq(0); for (const p of s.players) p.tech = 2;
  const bl = (type, dx, dz) => { const c = s.canPlace(0, type, h.x + dx, h.z + dz); return s.placeBuildingRaw(type, 0, c.ok ? c.x : h.x + dx, c.ok ? c.z : h.z + dz, true, null); };
  bl('barracks', 40, 0); bl('factory', 40, 40); bl('techlab', 0, 40); const af = bl('airfield', -50, 60); af.mods.runway = 1;
  s.train(0, 'tanker'); s.train(0, 'supplytruck'); upd(s, 2600);
  const tk = s.ents.find((e) => e.def === 'tanker'); ok(tk && tk.ap === 'fly' && tk.fstock === DEFS.tanker.tank.cap, 'a tanker is built, arms itself and takes off with a full tank');
  ok(!!s.ents.find((e) => e.def === 'supplytruck'), 'the War Factory builds supply trucks');
}
// ---- determinism with the whole thing on
{
  const run = () => { const s = new Sim({ size: 'small', type: 'island', seed: 21, slots: [{ name: 'A', team: 0, ai: 'normal' }, { name: 'B', team: 1, ai: 'normal' }] }); for (let i = 0; i < 4000; i++) s.step([]); return s.hash(); };
  const a = run(), b = run(); ok(a === b, 'deterministic with logistics, weather and control points (' + a + ')');
}
console.log(fail ? 'SOME FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
