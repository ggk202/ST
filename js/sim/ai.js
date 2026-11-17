// Computer opponents. They run inside the simulation (same on every client) and issue normal commands.
import { UNITS, BUILDINGS, TICK_RATE, CELL } from './defs.js';

const DIFF = {
  easy:   { interval: 30, base: 3400, step: 900, grace: 240, reserve: 0.5 },
  normal: { interval: 20, base: 2400, step: 800, grace: 150, reserve: 1.0 },
  hard:   { interval: 12, base: 1800, step: 650, grace: 100, reserve: 1.0 },
};
const PLAN = [['barracks', 1], ['factory', 1], ['techlab', 1], ['turret', 1], ['airfield', 1], ['sam', 1], ['turret', 2], ['factory', 2], ['sam', 2], ['barracks', 2], ['turret', 4], ['airfield', 2]];
const WEIGHTS = { rifleman: 3, at: 2, manpads: 0.8, scout: 0.7, ifv: 2.5, mbt: 3.5, aa: 0.8, sph: 1.2, heavy: 2.5, mlrs: 1.4, tel: 0.25, uav: 0.15, heli: 2, vtol: 1.4, engineer: 0 };
const hyp = (a, b) => Math.sqrt(a * a + b * b);
const DIRS = [[1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7], [0, -1], [0.7, -0.7]];

export class AIController {
  constructor(id, diff) {
    this.id = id; this.diff = diff || 'normal'; this.cfg = DIFF[this.diff] || DIFF.normal;
    this.attacking = false; this.wave = 0; this.target = null; this.launched = 0; this.claims = {};
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
    const wantDerricks = Math.min(sim.map.oil.length, 2 + Math.floor(secs / 90));
    let nextCost = 0;
    if (derricks < wantDerricks) {
      const free = sim.map.oil.filter((o) => !o.building).map((o) => ({ o, d: hyp(o.x - hq.x, o.z - hq.z) })).sort((a, b) => a.d - b.d || a.o.id - b.o.id);
      let placed = false;
      for (const f of free) {
        if (f.d > 62) break;
        if (p.credits >= BUILDINGS.derrick.cost && sim.canPlace(id, 'derrick', f.o.x, f.o.z, f.o.id).ok) { sim.exec({ t: 'build', p: id, type: 'derrick', x: f.o.x, z: f.o.z, node: f.o.id }); placed = true; break; }
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
          if (bd <= 22 && p.credits >= BUILDINGS.derrick.cost && sim.canPlace(id, 'derrick', best.x, best.z, best.id).ok) sim.exec({ t: 'build', p: id, type: 'derrick', x: best.x, z: best.z, node: best.id });
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
      if (type === 'airfield' && secs < 150) continue;
      if (n >= 2 && secs < 300) continue;
      if ((type === 'turret' || type === 'sam') && secs < 150) continue;
      nextCost = d.cost;
      if (p.credits >= d.cost) {
        const spot = this.findSpot(sim, id, type, blds, type === 'turret' || type === 'sam' ? rally : null);
        if (spot) { sim.exec({ t: 'build', p: id, type, x: spot.x, z: spot.z }); nextCost = 0; }
      }
      break;
    }

    // ---- production
    const reserve = nextCost * cfg.reserve;
    const enemyAir = enemies.filter((e) => e.kind === 'unit' && e.air && sim.canSee(p.team, e)).length;
    const enemyArmor = enemies.filter((e) => e.kind === 'unit' && (e.armor === 'heavy' || e.armor === 'medium')).length;
    const types = Object.keys(UNITS).filter((t) => WEIGHTS[t] > 0 && sim.canTrain(id, t));
    const engQueued = this.queued(blds, 'engineer');
    if (engineers.length + engQueued < (derricks < wantDerricks ? 1 : 0) && p.credits > 500) sim.train(id, 'engineer');
    for (let tries = 0; tries < 5 && types.length; tries++) {
      let total = 0; const ws = types.map((t) => { let w = WEIGHTS[t]; if (enemyAir > 2 && (t === 'aa' || t === 'manpads')) w *= 3.5; if (enemyAir === 0 && (t === 'aa' || t === 'manpads')) w *= 0.3; if (enemyArmor > 4 && (t === 'at' || t === 'heli')) w *= 1.8; if (t === 'uav' && units.some((u) => u.def === 'uav')) w = 0; total += w; return w; });
      let r = sim.rng.next() * total, pick = types[0];
      for (let i = 0; i < types.length; i++) { r -= ws[i]; if (r <= 0) { pick = types[i]; break; } }
      const d = UNITS[pick];
      const prod = sim.producerFor(id, d);
      if (!prod || prod.queue.length >= 2) continue;
      if (p.credits < d.cost + reserve) break;
      sim.train(id, pick);
    }

    // ---- army
    const army = units.filter((u) => UNITS[u.def].weapons.length > 0);
    const value = army.reduce((s, u) => s + UNITS[u.def].cost, 0);
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
        sim.exec({ t: 'attackmove', p: id, ids: army.map((u) => u.id), x: tgt.x, z: tgt.z });
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
      if (u.def !== 'tel' || (u.order.t !== 'idle')) continue;
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
    for (let tries = 0; tries < 40; tries++) {
      const base = blds[sim.rng.int(blds.length)];
      let dir = DIRS[sim.rng.int(8)];
      if (toward && tries < 20) { const dx = toward.x - base.x, dz = toward.z - base.z, l = Math.sqrt(dx * dx + dz * dz) || 1; dir = [dx / l + (sim.rng.next() - 0.5) * 0.8, dz / l + (sim.rng.next() - 0.5) * 0.8]; }
      const dl = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1]) || 1;
      const dist = base.radius + d.size * CELL * 0.5 + 6 + sim.rng.next() * 14;
      const x = base.x + dir[0] / dl * dist, z = base.z + dir[1] / dl * dist;
      if (sim.canPlace(id, type, x, z).ok) return { x, z };
    }
    return null;
  }
}
