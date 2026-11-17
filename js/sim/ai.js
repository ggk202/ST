// Computer opponents. They run inside the simulation (same on every client) and issue normal commands.
import { UNITS, BUILDINGS, TICK_RATE, CELL, BASE_UNITS, BASE_ORDER, unitId, AF_MODULES } from './defs.js';

const DIFF = {
  easy:   { interval: 30, base: 3400, step: 900, grace: 240, reserve: 0.5 },
  normal: { interval: 20, base: 2400, step: 800, grace: 150, reserve: 1.0 },
  hard:   { interval: 12, base: 1800, step: 650, grace: 100, reserve: 1.0 },
};
const PLAN = [['barracks', 1], ['powerplant', 8], ['factory', 1], ['techlab', 1], ['turret', 1], ['supplydepot', 1], ['dronebay', 1], ['airfield', 1], ['sam', 1], ['radar', 1], ['ewtower', 1], ['advtech', 1], ['turret', 2], ['factory', 2], ['sam', 2], ['barracks', 2], ['dronebay', 2], ['turret', 4], ['airfield', 2], ['bunker', 2], ['solar', 2], ['reserve', 1], ['fusion', 1], ['lasertower', 1], ['railgun', 2], ['synth', 2], ['abm', 1], ['heavyart', 1], ['silo', 1], ['launchpad', 1], ['railgun', 3], ['bunker', 4], ['lasertower', 2], ['heavyart', 2], ['silo', 2]];
const WEIGHTS = { rifleman: 2, at: 1.6, manpads: 0.8, scout: 0.5, ifv: 2.5, mbt: 3.5, aa: 0.8, sph: 1.2, heavy: 2.5, mlrs: 1.4, tel: 0.25, uav: 0.15, heli: 2, vtol: 1.4, fighter: 1.3, bomber: 0.9, strategic: 0.6, awacs: 0.3, spydrone: 0.15, engineer: 0,
  ewtruck: 0.35, supplytruck: 0.45, tanker: 0.3, ewplane: 0.3, robot: 2.5, ewdog: 0.9, sapper: 0.8, repair: 0.5, walker: 2, fpv: 1.2, wingman: 1.3, carrier: 0.9, empcarrier: 0.3 };
const hyp = (a, b) => Math.sqrt(a * a + b * b);
const DIRS = [[1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7], [0, -1], [0.7, -0.7]];

export class AIController {
  constructor(id, diff) {
    this.id = id; this.diff = diff || 'normal'; this.cfg = DIFF[this.diff] || DIFF.normal;
    this.attacking = false; this.wave = 0; this.target = null; this.launched = 0; this.claims = {};
  }

  // best known enemy structure to bomb: the most expensive one on explored ground
  strikeTarget(sim, p, enemies) {
    let best = null, bv = -1; const ex = sim.expl[p.team];
    for (const e of enemies) {
      if (e.kind !== 'building' || e.dead) continue; const c = sim.map.cellOf(e.x, e.z); if (c < 0 || !ex[c]) continue;
      const v = BUILDINGS[e.def].cost + (e.def === 'hq' ? 800 : 0); if (v > bv || (v === bv && best && e.id < best.id)) { bv = v; best = e; }
    }
    return best;
  }
  think(sim, p) {
    const cfg = this.cfg;
    if ((sim.tick + this.id * 3) % cfg.interval !== 0) return;
    const id = this.id;
    const mine = [], enemies = [];
    for (const e of sim.ents) { if (e.dead) continue; if (e.owner === id) mine.push(e); else if (e.team !== p.team) enemies.push(e); }
    const blds = mine.filter((e) => e.kind === 'building');
    const units = mine.filter((e) => e.kind === 'unit');
    const hq = blds.find((b) => b.def === 'hq') || blds.find((b) => BUILDINGS[b.def].produces);
    if (!hq) return;
    const secs = sim.tick / TICK_RATE;
    const cnt = (t) => { let c = 0; for (const b of blds) if (b.def === t) c++; return c; };

    // ---- rally points
    const half = sim.map.size / 2;
    let rx = half - hq.x, rz = half - hq.z; const rl = Math.sqrt(rx * rx + rz * rz) || 1;
    const rally = { x: hq.x + rx / rl * 42, z: hq.z + rz / rl * 42 };
    for (const b of blds) if (!b.rally && b.def !== 'derrick' && !BUILDINGS[b.def].oil) sim.exec({ t: 'rally', p: id, ids: [b.id], x: rally.x, z: rally.z });

    // ---- derricks & engineers
    const engineers = units.filter((u) => u.def === 'engineer');
    const derricks = cnt('derrick');
    const wantDerricks = Math.min(sim.map.oil.length, 3 + Math.floor(secs / 70));
    let nextCost = 0;
    if (derricks < wantDerricks) {
      const free = sim.map.oil.filter((o) => !o.building).map((o) => ({ o, d: hyp(o.x - hq.x, o.z - hq.z) })).sort((a, b) => a.d - b.d || a.o.id - b.o.id);
      let placed = false;
      for (const f of free) {
        if (f.d > 62) break;
        if (p.credits >= 60 && sim.canPlace(id, 'derrick', f.o.x, f.o.z, f.o.id).ok) { sim.exec({ t: 'build', p: id, type: 'derrick', x: f.o.x, z: f.o.z, node: f.o.id }); placed = true; break; }
      }
      if (!placed) {
        if (engineers.length === 0 && !this.queued(blds, 'engineer') && p.credits > 400) sim.train(id, 'engineer');
        for (const eng of engineers) {
          if (eng.order.t !== 'idle') continue;
          let best = null, bd = 1e9;
          for (const f of free) {
            if (this.claims[f.o.id] && this.claims[f.o.id] !== eng.id && sim.byId.get(this.claims[f.o.id]) && !sim.byId.get(this.claims[f.o.id]).dead) continue;
            // avoid nodes much closer to an enemy than to us
            let danger = false;
            for (const q of sim.players) if (q.team !== p.team && q.alive && hyp(q.spawn.x - f.o.x, q.spawn.z - f.o.z) < hyp(hq.x - f.o.x, hq.z - f.o.z) * 0.8) danger = true;
            if (danger) continue;
            const d = hyp(f.o.x - eng.x, f.o.z - eng.z);
            if (d < bd) { bd = d; best = f.o; }
          }
          if (!best) continue;
          this.claims[best.id] = eng.id;
          if (bd <= 22 && p.credits >= 60 && sim.canPlace(id, 'derrick', best.x, best.z, best.id).ok) sim.exec({ t: 'build', p: id, type: 'derrick', x: best.x, z: best.z, node: best.id });
          else sim.exec({ t: 'move', p: id, ids: [eng.id], x: best.x, z: best.z - 6 });
        }
      }
    }

    // ---- build plan
    for (const [type, n] of PLAN) {
      if (cnt(type) >= n) continue;
      const d = BUILDINGS[type];
      if (!d.requires.every((r) => blds.some((b) => b.def === r && b.progress >= 1))) continue;
      if (type === 'techlab' && secs < 60 && this.diff !== 'hard') continue;
      if ((type === 'dronebay' || type === 'ewtower') && secs < 140) continue;
      if (type === 'advtech' && secs < 330) continue;
      if (type === 'powerplant' && (cnt('powerplant') >= 5 || p.energy > 1200 || p.pE - p.pU > 14 + p.demE * 0.7 || (cnt('powerplant') >= 1 && secs < 90 && p.energy > 300))) continue;
      if (type === 'airfield' && secs < 150) continue;
      if (d.space && !sim.space) continue;
      const LATE_T = { bunker: 420, solar: 480, reserve: 540, fusion: 600, lasertower: 660, railgun: 700, synth: 760, abm: 840, heavyart: 900, silo: 980, launchpad: 1100 };
      if (LATE_T[type] && (secs < LATE_T[type] || (this.diff === 'easy' && secs < LATE_T[type] + 400))) continue;
      if (n >= 2 && secs < 300) continue;
      if ((type === 'turret' || type === 'sam') && secs < 150) continue;
      if (type === 'fusion' && p.pE - p.pU > 150) continue;
      nextCost = d.cost;
      if (p.credits >= d.cost * 0.35 && (p.eff > 0.5 || type === 'powerplant')) {
        const spot = this.findSpot(sim, id, type, blds, ['turret', 'sam', 'bunker', 'lasertower', 'railgun', 'abm'].includes(type) ? rally : null);
        if (spot) { sim.exec({ t: 'build', p: id, type, x: spot.x, z: spot.z }); nextCost = 0; }
      }
      break;
    }

    // ---- strategic: ballistic missiles and satellites
    if (secs > 700 && this.diff !== 'easy') {
      const silo = blds.find((b) => b.def === 'silo' && b.progress >= 1);
      if (silo) {
        const stored = silo.mis ? silo.mis.length : 0;
        if (stored + silo.queue.length < 2 && p.tech >= 1) { if (p.credits > 950) sim.exec({ t: 'train', p: id, type: 'icbm', n: 1 }); else nextCost = Math.max(nextCost, 1000); }
        if (stored > 0 && sim.tick >= (this.fireAt || 0)) { const tg = this.strikeTarget(sim, p, enemies); if (tg) { sim.exec({ t: 'fire', p: id, bid: silo.id, x: tg.x, z: tg.z }); this.fireAt = sim.tick + 900; } }
      }
      const pad = blds.find((b) => b.def === 'launchpad' && b.progress >= 1);
      if (pad && sim.space) {
        const orb = sim.orb.filter((o) => o.owner === id), has = (k) => orb.some((o) => o.def === k) || pad.queue.some((q) => q.type === k);
        if (!has('satrecon')) { if (p.credits > 600) sim.exec({ t: 'train', p: id, type: 'satrecon', n: 1 }); else nextCost = Math.max(nextCost, 650); }
        else if (!has('satstrike') && p.tech >= 1) { if (p.credits > 1500) sim.exec({ t: 'train', p: id, type: 'satstrike', n: 1 }); else nextCost = Math.max(nextCost, 1500); }
        for (const o of orb) if (o.def === 'satstrike' && !o.gt) { const tg = this.strikeTarget(sim, p, enemies); if (tg) sim.exec({ t: 'orbstrike', p: id, ids: [o.id], x: tg.x, z: tg.z }); }
      }
    }

    // ---- airfield modules: longer runway for bombers, bigger depot for heavy loads, more stands
    for (const af of blds) {
      if (af.def !== 'airfield' || af.progress < 1 || af.up || !af.afd || secs < 200) continue;
      for (const key of ['depot', 'runway', 'apron', 'depot', 'runway', 'apron']) {
        if (sim.afCanUpgrade(af, key)) continue;
        const lv = AF_MODULES[key].levels[af.mods[key]];
        if (key === 'apron' && af.mods.apron >= 1 && secs < 420) continue;
        if (p.credits >= lv.cost * 1.5 && p.energy >= lv.energy) sim.exec({ t: 'upgrade', p: id, ids: [af.id], key });
        break;
      }
      break;
    }

    // ---- tiered derricks / power plants
    if (secs > 240 && p.credits > 900) for (const b of blds) if ((b.def === 'derrick' || b.def === 'powerplant') && !sim.bldUpBlock(b)) { sim.exec({ t: 'bupg', p: id, ids: [b.id] }); break; }

    // ---- production
    const reserve = nextCost * cfg.reserve;
    const enemyAir = enemies.filter((e) => e.kind === 'unit' && e.air && sim.canSee(p.team, e)).length;
    const enemyDrones = enemies.filter((e) => e.kind === 'unit' && UNITS[e.def].drone && sim.canSee(p.team, e)).length;
    const enemyArmor = enemies.filter((e) => e.kind === 'unit' && (e.armor === 'heavy' || e.armor === 'medium')).length;
    // choose the highest unlocked tier of each unit type
    const types = [];
    for (const b of BASE_ORDER) { if (!(WEIGHTS[b] > 0)) continue; for (let t = 3; t >= 1; t--) { const uid = unitId(b, t); if (sim.canTrain(id, uid)) { types.push(uid); break; } } }
    // logistics: a few supply trucks, a tanker once there is an air arm
    const nTrucks = units.filter((u) => UNITS[u.def].supply).length + this.queued(blds, 'supplytruck') + this.queued(blds, 'supplytruck2') + this.queued(blds, 'supplytruck3');
    const nAir = units.filter((u) => u.air && (u.ed || UNITS[u.def]).weapons.length).length, nTank = units.filter((u) => UNITS[u.def].tank).length;
    for (let k = types.length - 1; k >= 0; k--) { const b = UNITS[types[k]].base; if ((b === 'supplytruck' && nTrucks >= 2 + Math.floor(secs / 400)) || (b === 'tanker' && (nTank >= 1 || nAir < 5))) types.splice(k, 1); }
    for (const u of units) { if (UNITS[u.def].supply && !u.auto) sim.exec({ t: 'lauto', p: id, ids: [u.id], v: 1 }); if (UNITS[u.def].tank && u.ap === 'fly' && u.order.t === 'idle' && !u.moved) { u.moved = 1; sim.exec({ t: 'move', p: id, ids: [u.id], x: rally.x, z: rally.z }); } }
    // capture control points with small infantry teams
    if (sim.points.length && (sim.tick % 100) === 0) {
      this.pclaims = this.pclaims || {};
      for (const q of sim.points) {
        if (q.team === p.team) continue;
        const cl = (this.pclaims[q.id] || []).filter((i) => { const e = sim.byId.get(i); return e && !e.dead; });
        if (cl.length >= 2 && hyp(sim.byId.get(cl[0]).x - q.x, sim.byId.get(cl[0]).z - q.z) < 200) { this.pclaims[q.id] = cl; continue; }
        let pool = units.filter((u) => !u.air && !UNITS[u.def].builder && (u.ed || UNITS[u.def]).weapons.length && (u.order.t === 'idle') && !cl.includes(u.id) && !Object.values(this.pclaims).some((a) => a.includes(u.id)));
        pool.sort((a, b) => hyp(a.x - q.x, a.z - q.z) - hyp(b.x - q.x, b.z - q.z));
        const pick = pool.slice(0, 3 - cl.length);
        if (pick.length && hyp(pick[0].x - q.x, pick[0].z - q.z) < sim.map.size * 0.6) { sim.exec({ t: 'move', p: id, ids: pick.map((u) => u.id), x: q.x, z: q.z }); this.pclaims[q.id] = cl.concat(pick.map((u) => u.id)); }
      }
    }
    const lowPower = p.pE - p.pU < 6;
    const engQueued = this.queued(blds, 'engineer');
    if (engineers.length + engQueued < (derricks < wantDerricks ? 1 : 0) && p.credits > 500) sim.train(id, 'engineer');
    for (let tries = 0; tries < 5 && types.length; tries++) {
      if (p.eff < 0.6 && tries > 0) break;
      let total = 0; const ws = types.map((tid) => { const t = UNITS[tid].base; let w = WEIGHTS[t]; if (lowPower && UNITS[tid].upkeep) w = 0; if (t === 'ewdog' && units.filter((u) => UNITS[u.def].base === 'ewdog').length >= 4) w = 0; if ((t === 'ewtruck' || t === 'ewplane') && units.some((u) => UNITS[u.def].base === t)) w = 0; if (t === 'repair' && units.filter((u) => UNITS[u.def].base === 'repair').length >= 3) w = 0; if (enemyDrones > 3 && (t === 'ewdog' || t === 'ewtruck')) w *= 3; if (enemyAir > 2 && (t === 'aa' || t === 'manpads')) w *= 3.5; if (enemyAir === 0 && (t === 'aa' || t === 'manpads')) w *= 0.3; if (enemyArmor > 4 && (t === 'at' || t === 'heli')) w *= 1.8; if (t === 'uav' && units.some((u) => u.def === 'uav')) w = 0; total += w; return w; });
      if (total <= 0) break;
      let r = sim.rng.next() * total, pick = types[0];
      for (let i = 0; i < types.length; i++) { r -= ws[i]; if (r <= 0) { pick = types[i]; break; } }
      const d = UNITS[pick];
      const prod = sim.producerFor(id, d);
      if (!prod || prod.queue.length >= 2) continue;
      if (p.credits < d.cost * 0.3 + reserve * 0.5) break;
      sim.train(id, pick);
    }

    // ---- army
    const army = units.filter((u) => (u.ed || UNITS[u.def]).weapons.length > 0 && !UNITS[u.def].strike && !(u.ap === 'rtb' || u.ap === 'land'));
    const strikers = units.filter((u) => UNITS[u.def].strike && u.order.t === 'idle');
    const support = units.filter((u) => UNITS[u.def].weapons.length === 0 && !UNITS[u.def].builder && !UNITS[u.def].air && (UNITS[u.def].heal || UNITS[u.def].ew || UNITS[u.def].escort));
    const value = army.reduce((s, u) => s + UNITS[u.def].cost, 0);
    // deep strike drones fly one-way at known enemy structures
    for (const u of strikers) { const b = this.nearestKnownBuilding(sim, p, enemies, u.x, u.z); if (b) sim.exec({ t: 'attackground', p: id, ids: [u.id], x: b.x, z: b.z }); }
    // defense
    let threat = null;
    for (const e of enemies) {
      if (e.kind !== 'unit' || !sim.canSee(p.team, e)) continue;
      for (const b of blds) { if (hyp(b.x - e.x, b.z - e.z) < 60) { threat = e; break; } }
      if (threat) break;
    }
    if (threat) {
      const defenders = army.filter((u) => u.order.t === 'idle' || (u.order.t === 'move') || !this.attacking);
      if (defenders.length) sim.exec({ t: 'attackmove', p: id, ids: defenders.map((u) => u.id), x: threat.x, z: threat.z });
      return;
    }
    const tgt = this.pickTarget(sim, p, hq, enemies);
    if (!tgt) return;
    if (!this.attacking) {
      const need = cfg.base + this.wave * cfg.step;
      if (secs > cfg.grace && value >= Math.min(need, 11000)) {
        this.attacking = true; this.launched = value; this.target = tgt;
        sim.exec({ t: 'attackmove', p: id, ids: army.concat(support).map((u) => u.id), x: tgt.x, z: tgt.z });
      }
    } else {
      const idle = army.filter((u) => u.order.t === 'idle');
      if (value < this.launched * 0.3 || army.length < 3) {
        this.attacking = false; this.wave++;
        if (army.length) sim.exec({ t: 'move', p: id, ids: army.map((u) => u.id), x: rally.x, z: rally.z });
      } else if (idle.length >= Math.max(3, army.length * 0.5)) {
        this.target = tgt;
        sim.exec({ t: 'attackmove', p: id, ids: army.map((u) => u.id), x: tgt.x, z: tgt.z });
      } else if (idle.length >= 3) {
        sim.exec({ t: 'attackmove', p: id, ids: idle.map((u) => u.id), x: this.target.x, z: this.target.z });
      }
    }
    // ballistic missiles: bombard known enemy structures
    for (const u of units) {
      if (UNITS[u.def].base !== 'tel' || (u.order.t !== 'idle')) continue;
      const b = this.nearestKnownBuilding(sim, p, enemies, u.x, u.z);
      if (b) sim.exec({ t: 'attackground', p: id, ids: [u.id], x: b.x, z: b.z });
    }
  }

  queued(blds, type) { let c = 0; for (const b of blds) for (const q of b.queue) if (q.type === type) c++; return c; }

  nearestKnownBuilding(sim, p, enemies, x, z) {
    let best = null, bd = 1e12;
    const ex = sim.expl[p.team];
    for (const e of enemies) {
      if (e.kind !== 'building') continue;
      const c = sim.map.cellOf(e.x, e.z);
      if (c < 0 || !ex[c]) continue;
      const d = (e.x - x) * (e.x - x) + (e.z - z) * (e.z - z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  pickTarget(sim, p, hq, enemies) {
    const b = this.nearestKnownBuilding(sim, p, enemies, hq.x, hq.z);
    if (b) return { x: b.x, z: b.z };
    let best = null, bd = 1e12;
    for (const q of sim.players) {
      if (!q.alive || q.team === p.team) continue;
      const d = (q.spawn.x - hq.x) * (q.spawn.x - hq.x) + (q.spawn.z - hq.z) * (q.spawn.z - hq.z);
      if (d < bd) { bd = d; best = { x: q.spawn.x, z: q.spawn.z }; }
    }
    return best;
  }
  findSpot(sim, id, type, blds, toward) {
    const d = BUILDINGS[type];
    for (let tries = 0; tries < (type === 'airfield' ? 160 : 40); tries++) {
      const base = blds[sim.rng.int(blds.length)];
      let dir = DIRS[sim.rng.int(8)];
      if (toward && tries < 20) { const dx = toward.x - base.x, dz = toward.z - base.z, l = Math.sqrt(dx * dx + dz * dz) || 1; dir = [dx / l + (sim.rng.next() - 0.5) * 0.8, dz / l + (sim.rng.next() - 0.5) * 0.8]; }
      const dl = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1]) || 1;
      const dist = base.radius + d.size * CELL * 0.5 + 6 + sim.rng.next() * (type === 'airfield' ? 40 : 14);
      const x = base.x + dir[0] / dl * dist, z = base.z + dir[1] / dl * dist;
      if (sim.canPlace(id, type, x, z).ok) return { x, z };
    }
    return null;
  }
}
