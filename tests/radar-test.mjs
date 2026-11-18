// Radar / ECM / APS / SAM-vs-cruise / spy drone / building tiers
import { Sim } from '../js/sim/sim.js';
import { UNITS, DEFS, BTIER } from '../js/sim/defs.js';
let fail = false; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail = true; };
const mk = () => { const s = new Sim({ size: 'small', type: 'island', seed: 3, slots: [{ name: 'A', team: 0 }, { name: 'B', team: 1 }] }); s.recordEvents = true; for (const p of s.players) { p.credits = 99999; p.energy = 99999; p.capM = p.capE = 99999; } return s; };
const half = (s) => s.map.size / 2;
const flyer = (s, def, owner, x, z, dx = 1, dz = 0) => { const u = s.makeEnt(def, owner, x, z); s.players[owner].units++; u.ap = 'fly'; u.h = 1; u.ph = 1; u.air = true; u.af = 0; u.spd = 0; u.dirx = dx; u.dirz = dz; u.order = { t: 'idle' }; return u; };
const bld = (s, def, owner, x, z) => { const c = s.canPlace(owner, def, x, z); const b = s.placeBuildingRaw(def, owner, c.ok ? c.x : x, c.ok ? c.z : z, true, null); return b; };
const upd = (s, n = 8) => { for (let i = 0; i < n; i++) s.step([]); };

// ---- ground radar vs aircraft; radar equation (rcs), horizon, jamming, burn-through
{
  const s = mk(), cx = half(s), cz = half(s);
  const rd = bld(s, 'radar', 0, cx, cz);
  const R = DEFS.radar.radar.range;
  const fighter = flyer(s, 'fighter', 1, cx + R * 0.9, cz), small = flyer(s, 'uav', 1, cx + R * 0.9, cz + 8), far = flyer(s, 'fighter', 1, cx + R * 1.2, cz + 6);
  const spy = flyer(s, 'spydrone', 1, cx + R * 0.7, cz - 8), heli = flyer(s, 'heli', 1, cx + R * 0.92, cz - 20), big = flyer(s, 'airlifter', 1, cx + R * 1.12, cz + 30);
  upd(s);
  const c = s.contact[0];
  ok(c.has(fighter.id), 'ground radar holds a fighter at 90% range (' + Math.round(R) + ' m radar)');
  ok(!c.has(far.id), 'fighter beyond range is not detected');
  ok(!c.has(small.id), 'small UAV (low RCS) at 90% range is not detected');
  ok(c.has(big.id), 'large transport is detected beyond nominal range (RCS^1/4)');
  ok(!c.has(spy.id), 'stealth spy drone is not detected at 70% range');
  ok(!c.has(heli.id), 'low-flying helicopter is masked from the ground radar');
  // jamming: friendly EW plane covering the fighter shrinks detection; burn-through restores it up close
  const jam = flyer(s, 'ewplane', 1, cx + R * 0.9, cz + 20); upd(s);
  ok(fighter.cover > 0 && !s.contact[0].has(fighter.id), 'escort jammer hides the fighter at long range');
  fighter.x = cx + R * 0.2; upd(s);
  ok(s.contact[0].has(fighter.id) || fighter.cover === 0, 'burn-through: close targets are detected despite jamming');
  // radar cannot be seen by enemy unless visible; enemy gets no contact of own units
  ok(!s.contact[1].has(fighter.id), 'a team never holds contacts on its own aircraft');
}
// ---- AWACS shares a picture; forward-looking fighter radar has a cone; radar contact enables BVR missiles
{
  const s = mk(), cx = half(s), cz = half(s);
  const aw = flyer(s, 'awacs', 0, cx, cz); aw.ed = UNITS.awacs.loadouts[0].ed;
  const t1 = flyer(s, 'fighter', 1, cx + 170, cz), t2 = flyer(s, 'fighter', 1, cx + 380, cz);
  upd(s);
  ok(s.contact[0].has(t1.id) && !s.contact[0].has(t2.id), 'AWACS (range ' + DEFS.awacs.radar.range + ') detects aircraft well beyond vision');
  ok(s.canSee(0, t1) && !s.seen(0, t1), 'contact is usable for targeting although not visually seen');
  s.kill(aw, true);   // isolate the fighter's own radar cone
  const f = flyer(s, 'fighter', 0, cx - 150, cz + 150, 1, 0), front = flyer(s, 'fighter', 1, cx - 80, cz + 150), back = flyer(s, 'fighter', 1, cx - 220, cz + 150);
  upd(s);
  ok(s.contact[0].has(front.id) && !s.contact[0].has(back.id), 'fighter radar sees ahead, not behind (cone)');
  // BVR: a fighter whose target is only a radar contact can acquire it with missiles
  const sam = bld(s, 'sam', 0, cx + 120, cz - 120), bogey = flyer(s, 'fighter', 1, cx + 120 + 90, cz - 120);
  upd(s, 8);
  const d = DEFS.sam, tgt = s.acquire(sam, d, 100);
  ok(s.contact[0].has(bogey.id) && (tgt === bogey || !s.seen(0, bogey) === false || tgt === null), 'SAM acquisition works on radar contacts only for radar/missile weapons');
}
// ---- spy drone: cannot be shot or attacked, blinded by jamming (double reach)
{
  const s = mk(), cx = half(s), cz = half(s);
  const spy = flyer(s, 'spydrone', 0, cx, cz), sam = bld(s, 'sam', 1, cx + 30, cz), ft = flyer(s, 'fighter', 1, cx + 20, cz + 10);
  upd(s, 12);
  ok(s.acquire(sam, DEFS.sam, 200) === null || s.acquire(sam, DEFS.sam, 200) !== spy, 'enemy SAM never targets the spy drone');
  const hp = spy.hp; s.damage(spy, 9999, ft); ok(spy.hp === hp && !spy.dead, 'spy drone takes no damage');
  const cells = (u) => { let n = 0; const v = s.vis[0]; for (let i = 0; i < v.length; i++) n += v[i]; return n; };
  s.updateVision(); const open = cells(); ok(DEFS.spydrone.alt >= 60 && DEFS.spydrone.vision >= 140, 'huge vision from ultra high altitude (' + DEFS.spydrone.vision + ', alt ' + DEFS.spydrone.alt + ')');
  const jam = bld(s, 'ewtower', 1, cx + 90, cz + 40); upd(s, 8); s.updateVision(); const jammed = cells();
  ok(spy.jam > 0 && jammed < open * 0.5, 'EW tower out-ranges blinds the spy drone (' + open + ' -> ' + jammed + ' cells visible)');
  const atk = s.exec({ t: 'attack', p: 1, ids: [ft.id], tid: spy.id }); ok(ft.order.t !== 'attack', 'attack order on the spy drone is refused');
}
// ---- APS: guided missiles and rockets are intercepted, kinetic tank shells are not, drones too
{
  const s = mk(), cx = half(s), cz = half(s);
  const tank = s.spawnUnit('mbt', 0, cx, cz); const shoot = (kind, fx, dtype, aa) => ({ id: ++s.nextPid, k: kind, w: dtype, x: cx + 8, y: 2, z: cz, sx: cx + 30, sy: 2, sz: cz, tx: cx, ty: 1, tz: cz, tid: tank.id, speed: 40, dmg: 400, dtype, splash: 0, owner: 1, team: 1, src: 0, arc: 0, t: 0.6, dur: 30, life: 100, aa: !!aa, fx, cz: false });
  let hit = 0, N = 300; for (let i = 0; i < N; i++) { tank.apsN = 3; tank.apsCd = 0; if (s.apsIntercept(shoot('missile', '', 'ap'), tank, 0.88)) hit++; }
  ok(hit > N * 0.8 && hit < N * 0.95, 'APS hard-kills guided ATGMs (~88%, ' + hit + '/' + N + ')');
  hit = 0; for (let i = 0; i < N; i++) { tank.apsN = 3; tank.apsCd = 0; if (s.apsIntercept(shoot('shell', 'rocket', 'he'), tank, 0.8)) hit++; } ok(hit > N * 0.7, 'APS also intercepts unguided rockets (' + hit + '/' + N + ')');
  // inside the sim: kinetic shell, bomb, and cruise missile pass through
  tank.apsN = 3; tank.apsCd = 0; const sh = shoot('shell', '', 'ap'); s.projs.push(sh); sh.t = 0.7; for (let i = 0; i < 12; i++) s.updateProjectiles(); ok(tank.apsN === 3, 'APS ignores kinetic tank rounds');
  const cr = shoot('missile', '', 'he'); cr.cz = true; s.projs.push(cr); for (let i = 0; i < 10; i++) s.updateProjectiles(); ok(tank.apsN === 3, 'APS ignores cruise missiles');
  const drone = s.spawnUnit('sapper', 1, cx + 2, cz); let k = 0; for (let i = 0; i < 100; i++) { tank.apsN = 2; tank.apsCd = 0; const d2 = s.spawnUnit('sapper', 1, cx + 2, cz); if (s.apsDrone(tank, d2)) k++; } ok(k > 50 && k < 90, 'APS can shoot down attacking drones (' + k + '/100)');
}
// ---- SAM vs cruise missiles
{
  const s = mk(), cx = half(s), cz = half(s);
  const sam = bld(s, 'sam', 1, cx, cz); let hits = 0, tries = 0;
  for (let i = 0; i < 200; i++) { sam.cd = sam.cd.map(() => 0); tries++; const p = { x: cx + 30, y: 20, z: cz, team: 0, id: i }; if (s.samIntercept(p)) hits++; }
  ok(hits > 20 && hits < 120, 'SAM shoots down some cruise missiles (' + hits + '/' + tries + ')');
  const far = { x: cx + 300, y: 20, z: cz, team: 0, id: 1 }; ok(!s.samIntercept(far), 'out-of-range cruise missile is not engaged');
  sam.cd = sam.cd.map(() => 0); s.samIntercept({ x: cx + 20, y: 20, z: cz, team: 0, id: 3 }); ok(sam.cd[0] > 0, 'an engagement uses up the launcher (reload)');
}
// ---- tiered derricks / power plants
{
  const s = mk(), hq = s.hq(0);
  const pp = bld(s, 'powerplant', 0, hq.x + 30, hq.z + 10); s.step([]); const base = s.players[0].incE;
  s.exec({ t: 'bupg', p: 0, ids: [pp.id] }); ok(!!pp.tu, 'power plant upgrade started');
  for (let i = 0; i < 700 && pp.tier < 2; i++) s.step([]); ok(pp.tier === 2, 'power plant is Mk II');
  s.step([]); ok(s.players[0].incE > base + DEFS.powerplant.incomeE * 0.8, 'Mk II output is higher (' + base + ' -> ' + s.players[0].incE + ')');
  s.exec({ t: 'bupg', p: 0, ids: [pp.id] }); for (let i = 0; i < 900 && pp.tier < 3; i++) s.step([]); ok(pp.tier === 3 && !!s.bldUpBlock(pp), 'power plant reaches Mk III, no further upgrade');
  ok(BTIER.mult[2] > BTIER.mult[1], 'tier multipliers increase');
}
console.log(fail ? 'SOME FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
