// Space layer + late-game buildings: launch pad, satellites (vision), strike rods, orbital combat, shipyard, silos/ICBMs, ABM, energy/metal buildings
import { Sim } from '../js/sim/sim.js';
import { UNITS, DEFS, BUILDINGS } from '../js/sim/defs.js';
import { orbGround, phDiff } from '../js/sim/space.js';
import { snapshot, restore } from '../js/sim/save.js';
let fail = false; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail = true; };
const mk = (o = {}) => { const s = new Sim(Object.assign({ size: 'small', type: 'island', seed: 3, space: true, slots: [{ name: 'A', team: 0 }, { name: 'B', team: 1 }] }, o)); for (const p of s.players) { p.credits = 1e6; p.energy = 1e6; p.capM = 1e7; p.capE = 1e7; p.tech = 2; } return s; };
const upd = (s, n = 8) => { for (let i = 0; i < n; i++) s.step([]); };
const bld = (s, def, owner, x, z) => { const c = s.canPlace(owner, def, x, z); return s.placeBuildingRaw(def, owner, c.ok ? c.x : x, c.ok ? c.z : z, true, null); };
const hq0 = (s) => s.hq(0);

{
  const s = mk(); const h = hq0(s);
  ok(Object.keys(BUILDINGS).length >= 25, 'late-game building roster present (' + Object.keys(BUILDINGS).length + ')');
  for (const k of ['solar', 'fusion', 'synth', 'reserve', 'wall', 'bunker', 'lasertower', 'railgun', 'heavyart', 'abm', 'silo', 'launchpad']) ok(!!BUILDINGS[k], 'building ' + k + ' defined');
  // placement requires tech buildings
  let c = s.canPlace(0, 'fusion', h.x + 30, h.z + 30); ok(!c.ok && /Requires/.test(c.reason), 'fusion reactor needs the Advanced Tech Lab: ' + c.reason);
  bld(s, 'techlab', 0, h.x + 40, h.z); bld(s, 'advtech', 0, h.x + 40, h.z + 20);
  s.players[0].tech = 2;
  const f = bld(s, 'fusion', 0, h.x - 30, h.z + 30); const e0 = s.players[0].incE; upd(s, 4);
  ok(s.players[0].incE > e0 + 250 || s.players[0].incE > 280, 'fusion reactor raises energy income (' + Math.round(s.players[0].incE) + ')');
  const sy = bld(s, 'synth', 0, h.x - 50, h.z - 20); upd(s, 4); ok(sy && !sy.dead && s.players[0].incM >= 40, 'metal synthesizer needs no oil field and yields metal (' + Math.round(s.players[0].incM) + ')');
  const off = s.canPlace(0, 'launchpad', h.x - 90, h.z - 40); ok(off.ok || /room|Blocked|terrain|far/i.test(off.reason), 'launch pad placeable with space on: ' + (off.ok ? 'ok' : off.reason));
  const s2 = mk({ space: false }); bld(s2, 'techlab', 0, hq0(s2).x + 40, hq0(s2).z); bld(s2, 'advtech', 0, hq0(s2).x + 40, hq0(s2).z + 20);
  const c2 = s2.canPlace(0, 'launchpad', hq0(s2).x - 90, hq0(s2).z); ok(!c2.ok && /space/i.test(c2.reason), 'launch pad is refused without the space layer');
}
// ---- launch pad, satellites, vision
{
  const s = mk(); const h = hq0(s); bld(s, 'techlab', 0, h.x + 40, h.z); bld(s, 'advtech', 0, h.x + 40, h.z + 20);
  const pad = bld(s, 'launchpad', 0, h.x - 90, h.z - 10); ok(pad && pad.def === 'launchpad', 'launch pad built');
  ok(s.train(0, 'satrecon'), 'recon satellite queued at the pad');
  upd(s, 700); ok(s.orb.length >= 1, 'satellite reaches orbit after production (' + s.orb.length + ')');
  const o = s.orb[0]; const g0 = orbGround(o, s.map.size); const ph0 = o.ph; upd(s, 200);
  ok(Math.abs(phDiff(o.ph, ph0)) > 0.05, 'orbital object advances along its orbit'); const g1 = orbGround(o, s.map.size);
  ok(Math.abs(g0[0] - g1[0]) + Math.abs(g0[1] - g1[1]) > 20, 'ground track sweeps across the map');
  const n = s.map.n, v = s.vis[0], gi = Math.floor(g1[0] / 4), gj = Math.floor(g1[1] / 4);
  ok(v[Math.min(n - 1, gj) * n + Math.min(n - 1, gi)] === 1, 'satellite reveals the ground under its track');
  // save/load round trip
  const txt = snapshot(s); const r = restore(txt); for (let i = 0; i < 300; i++) { s.step([]); r.step([]); }
  ok(s.hash() === r.hash() && r.orb.length === s.orb.length, 'save / load keeps the space layer bit-identical');
}
// ---- strike satellite and orbital combat
{
  const s = mk(); const foe = s.spawnUnit('heavy', 1, s.map.size / 2, s.map.size / 2); foe.hp = foe.maxhp = 100000;
  const st = s.launchOrbital(0, 'satstrike3'); st.gt = null; const hp0 = foe.hp;
  s.exec({ t: 'orbstrike', p: 0, ids: [st.id], x: foe.x, z: foe.z });
  let fired = false; for (let i = 0; i < 9000 && !fired; i++) { s.step([]); if (st.gam < 3) fired = true; }
  ok(fired, 'strike satellite fires when its track passes in reach'); upd(s, 60); ok(foe.hp < hp0, 'tungsten rod damages the target (' + Math.round(hp0 - foe.hp) + ')');
  const a = s.launchOrbital(0, 'satkill'), b = s.launchOrbital(1, 'satrecon'); a.layer = 0; b.layer = 0; a.ph = 0.2; b.ph = 0.21;
  upd(s, 400); ok(b.dead || s.orb.indexOf(b) < 0, 'hunter-killer satellite destroys an enemy satellite in its orbit');
  const y = s.launchOrbital(0, 'orbyard2'); ok(s.orbTrain(0, y.id, 'orbfighter'), 'orbital shipyard accepts ship orders'); const n0 = s.orb.length; upd(s, 900); ok(s.orb.length > n0, 'shipyard builds and launches a warship');
}
// ---- silo + missiles + ABM
{
  const s = mk(); const h = hq0(s); bld(s, 'techlab', 0, h.x + 40, h.z); bld(s, 'advtech', 0, h.x + 40, h.z + 20);
  const silo = bld(s, 'silo', 0, h.x - 40, h.z + 40); ok(s.train(0, 'icbm'), 'missile queued at the silo'); upd(s, 900); ok(silo.mis && silo.mis.length === 1, 'silo stocks a finished missile');
  const foe = s.spawnUnit('heavy', 1, s.map.size * 0.6, s.map.size * 0.5); foe.hp = foe.maxhp = 3000; const bl = foe.hp;
  s.exec({ t: 'fire', p: 0, bid: silo.id, x: foe.x, z: foe.z }); ok(s.msl.length === 1 && silo.mis.length === 0, 'missile launched from the silo'); upd(s, 700);
  ok(s.msl.length === 0 && foe.hp < bl, 'warhead lands and damages the target');
  // ABM
  const s3 = mk(); const h3 = hq0(s3); bld(s3, 'techlab', 0, h3.x + 40, h3.z); bld(s3, 'advtech', 0, h3.x + 40, h3.z + 20);
  const sl = bld(s3, 'silo', 0, h3.x - 40, h3.z + 40); sl.mis = ['icbm']; const t3 = s3.hq(1);
  const abm = bld(s3, 'abm', 1, t3.x + 30, t3.z + 30); let hits = 0, tries = 0;
  for (let k = 0; k < 6; k++) { sl.mis = ['icbm']; abm.abmcd = 0; const hp = t3.hp; s3.exec({ t: 'fire', p: 0, bid: sl.id, x: t3.x, z: t3.z }); upd(s3, 700); tries++; if (t3.hp >= hp) hits++; }
  ok(hits >= 1, 'ABM battery intercepts incoming warheads (' + hits + '/' + tries + ')');
}
console.log(fail ? 'SPACE TESTS FAILED' : 'ALL SPACE TESTS PASSED'); process.exit(fail ? 1 : 0);
