// Ground Surveillance Radar: huge map-relative range, holds enemy ground units (not air/buildings), shared team-wide, jamming, EMCON, artillery fires on tracks
import { Sim } from '../js/sim/sim.js';
import { DEFS, BUILDINGS } from '../js/sim/defs.js';
let fail = false; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail = true; };
const mk = (size = 'small') => { const s = new Sim({ size, type: 'island', seed: 3, slots: [{ name: 'A', team: 0 }, { name: 'B', team: 1 }] }); for (const p of s.players) { p.credits = 99999; p.energy = 99999; p.tech = 3; } return s; };
const bld = (s, def, owner, x, z) => { const c = s.canPlace(owner, def, x, z); return s.placeBuildingRaw(def, owner, c.ok ? c.x : x, c.ok ? c.z : z, true, null); };
const upd = (s, n = 8) => { for (let i = 0; i < n; i++) s.step([]); };
{
  const s = mk(), S = s.map.size, cx = S / 2, cz = S / 2, R = BUILDINGS.gsr.gradar.frac * S;
  ok(!!BUILDINGS.gsr && R > 140, 'gsr defined, range ' + Math.round(R) + ' = 40% of map width ' + S);
  const g = bld(s, 'gsr', 0, cx, cz);
  const near = s.spawnUnit('mbt', 1, g.x + R * 0.8, g.z), far = s.spawnUnit('mbt', 1, g.x + R * 1.3, g.z), inf = s.spawnUnit('rifleman', 1, g.x, g.z + R * 0.6), own = s.spawnUnit('mbt', 0, g.x + 10, g.z);
  const fb = bld(s, 'turret', 1, g.x - R * 0.5, g.z);
  upd(s, 8);
  ok(s.gcontact[0].has(near.id) && s.gcontact[0].has(inf.id), 'enemy tank and infantry inside the range are held');
  ok(!s.gcontact[0].has(far.id), 'enemy outside the range is not held');
  ok(!s.gcontact[0].has(own.id) && !s.gcontact[0].has(fb.id), 'own units and enemy buildings are not tracked');
  ok(s.canSee(0, near) && !s.canSee(0, far), 'tracked units count as visible to the team; others do not');
  ok(s.gcontact[1].size === 0, 'the other team holds nothing');
  // jamming shortens range; EMCON blinds
  const ew = bld(s, 'ewtower', 1, g.x + 30, g.z); upd(s, 8); ok(s.gradars[0].r < s.gradars[0].r0 && s.gradars[0].r0 === Math.round(s.gradars[0].r0) || s.gradars[0].r < s.gradars[0].r0, 'enemy jamming shortens the range (' + Math.round(s.gradars[0].r) + ' of ' + Math.round(s.gradars[0].r0) + ')'); ew.dead = true; s.kill && s.kill(ew); upd(s, 8);
  s.step([{ t: 'emcon', p: 0, ids: [g.id], v: 1 }]); upd(s, 4); ok(s.gcontact[0].size === 0 && s.gradars.length === 0, 'EMCON silences the radar');
  s.step([{ t: 'emcon', p: 0, ids: [g.id], v: 0 }]); upd(s, 4); ok(s.gcontact[0].has(near.id), 'radar returns when emitters are switched on');
}
{
  // heavy artillery engages a radar-only contact; direct-fire units do not
  const s = mk('medium'), S = s.map.size, cx = S / 2, cz = S / 2;
  const g = bld(s, 'gsr', 0, cx, cz), art = bld(s, 'heavyart', 0, cx - 20, cz + 30);
  const tgt = s.spawnUnit('mbt', 1, art.x + 200, art.z); tgt.hp = tgt.maxhp = 100000; const mine = s.spawnUnit('mbt', 0, art.x - 150, art.z + 50);
  for (let i = 0; i < 200; i++) s.step([]);
  ok(s.gcontact[0].has(tgt.id) && !s.seen(0, tgt), 'target is a radar track only (not in vision)');
  ok(tgt.hp < tgt.maxhp, 'heavy artillery shelled the radar track (' + Math.round(tgt.maxhp - tgt.hp) + ' damage)');
}
console.log(fail ? 'SOME TESTS FAILED' : 'ALL GSR TESTS PASSED'); process.exit(fail ? 1 : 0);
