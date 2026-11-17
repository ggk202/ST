// Logistics and the long game: ammunition supply, aircraft fuel, supply depots / trucks / air-dropped pallets, aerial tankers, ESM for anti-radiation missiles,
// escorts, veterancy, wreck salvage, capturable control points (with a hold-the-majority victory), weather and a day/night cycle.
// Plain arithmetic only (no trig) so that lockstep peers stay bit-identical.
import { DT, UNITS, BUILDINGS, DEFS } from './defs.js';
import { clamp } from './util.js';

export const WX = ['Clear', 'Overcast', 'Fog', 'Rain', 'Storm'];
const WX_GROUND = [1, 1, 0.55, 0.85, 0.7], WX_AIR = [1, 0.85, 0.9, 0.75, 0.55], DAY_TICKS = 24000, VP_NEED = 9600;   // 8 minutes holding the majority of the points
const VET_XP = [14, 45, 100];
const POINTS = { small: 3, medium: 5, large: 7, xl: 9 };
const CAP_R = 14;

export const LogiOps = {
  logiInit() {
    this.crates = []; this.wrecks = []; this.points = []; this.nextCid = 0;
    this.esm = [0, 1, 2, 3].map(() => new Set());
    this.wx = { kind: 0, left: 2400, dl: 1, night: 0 };
    this.hold = [0, 0, 0, 0];
    const S = this.map.size, cnt = POINTS[this.cfg.size] || 5;
    if (this.cfg.points === false || this.players.length < 2) return;
    for (let k = 0, tries = 0; k < cnt && tries < 800; tries++) {
      const x = S * 0.12 + this.rng.next() * S * 0.76, z = S * 0.12 + this.rng.next() * S * 0.76;
      if (!this.map.walkable(x, z) || this.map.hAt(x, z) < 1.8) continue;
      let ok = true;
      for (const p of this.players) { const dx = p.spawn.x - x, dz = p.spawn.z - z; if (dx * dx + dz * dz < S * S * 0.045) ok = false; }
      for (const q of this.points) { const dx = q.x - x, dz = q.z - z; if (dx * dx + dz * dz < S * S * 0.03) ok = false; }
      if (!ok) continue;
      this.points.push({ id: k, x, z, team: -1, owner: -1, ct: -1, p: 0, stock: 500, cap: 1500 }); k++;
    }
  },
  // ---------- per-tick driver ----------
  logiTick() {
    const t = this.tick;
    this.weatherTick();
    if (t % 5 === 0) this.pointsTick();
    if (t % 4 === 2) this.supplyTick();
    if (t % 10 === 3) this.wreckTick();
    for (let i = this.crates.length - 1; i >= 0; i--) { const c = this.crates[i]; if (c.fall > 0) c.fall--; if (--c.ttl <= 0 || c.stock < 1) this.crates.splice(i, 1); }
  },
  // ---------- weather & daylight ----------
  weatherTick() {
    const w = this.wx, ph = (this.tick % DAY_TICKS) / DAY_TICKS, tri = ph < 0.5 ? 1 - 4 * ph : 4 * ph - 3;
    w.night = clamp(-tri * 1.3, 0, 1); w.dl = 1 - w.night;
    if (--w.left <= 0) {
      const r = this.rng.next();
      w.kind = r < 0.42 ? 0 : r < 0.58 ? 1 : r < 0.73 ? 2 : r < 0.9 ? 3 : 4;
      w.left = 1400 + Math.floor(this.rng.next() * 1600);
      this.ev({ e: 'weather', kind: w.kind });
    }
  },
  // vision multiplier of an entity under the current weather and light
  visionMul(e, d) {
    const w = this.wx; if (!w || d.spy) return 1;
    let m = e.air ? WX_AIR[w.kind] : WX_GROUND[w.kind];
    if (w.night > 0 && !e.air) m *= 1 - 0.38 * w.night * (d.tier >= 3 ? 0 : d.tier === 2 ? 0.5 : 1);   // thermal sights at Mk II / III
    return m;
  },
  // ---------- control points ----------
  pointsTick() {
    const P = this.points; if (!P.length) return;
    for (const q of P) {
      let team = -2, who = -1;
      for (const e of this.ents) {
        if (e.dead || e.kind !== 'unit' || e.air) continue;
        const dx = e.x - q.x, dz = e.z - q.z; if (dx * dx + dz * dz > CAP_R * CAP_R) continue;
        if (team === -2) { team = e.team; who = e.owner; } else if (team !== e.team) { team = -3; break; }
      }
      if (team === -3 || team === -2) continue;
      if (team === q.team) { q.p = 0; q.ct = -1; continue; }
      if (q.ct !== team) { q.ct = team; q.p = 0; }
      q.p += 100 / 48;
      if (q.p >= 100) { q.team = team; q.owner = who; q.p = 0; q.ct = -1; this.ev({ e: 'capture', id: q.id, team, owner: who, x: q.x, z: q.z }); }
    }
    // hold the majority of the points for long enough and you win
    const cnt = [0, 0, 0, 0]; for (const q of P) if (q.team >= 0) cnt[q.team]++;
    for (let tm = 0; tm < 4; tm++) { if (cnt[tm] * 2 > P.length) this.hold[tm] += 5 * 1; else this.hold[tm] = Math.max(0, this.hold[tm] - 5); }
    if (!this.over) for (let tm = 0; tm < 4; tm++) if (this.hold[tm] >= VP_NEED) { this.over = true; this.winner = tm; this.ev({ e: 'over', winner: tm, vp: true }); }
  },
  // ---------- supply network ----------
  // Sources: the HQ (unlimited), supply depots, control points (slow regen), trucks and air-dropped pallets. Ground units in range rearm automatically;
  // trucks and depots exchange stock toward equal fill; tankers feed aircraft in flight.
  supplyTick() {
    const dt = 4 * DT, S = [], t = this.tick;
    for (const e of this.ents) {
      if (e.dead || e.boarded) continue;
      if (e.kind === 'building') {
        if (e.progress < 1 || e.stun > 0) continue;
        if (e.def === 'hq') S.push({ x: e.x, z: e.z, r2: 34 * 34, rate: 50, team: e.team, inf: true, hq: true });
        else if (e.def === 'supplydepot') { const D = BUILDINGS.supplydepot.depot; e.stock = Math.min(D.cap, (e.stock === undefined ? D.cap * 0.4 : e.stock) + D.regen * dt); S.push({ x: e.x, z: e.z, r2: D.radius * D.radius, rate: D.rate, team: e.team, h: e, cap: D.cap, fixed: true }); }
      } else if (e.stock !== undefined && DEFS[e.def].supply && e.stun <= 0) {
        const sp = DEFS[e.def].supply; S.push({ x: e.x, z: e.z, r2: sp.radius * sp.radius, rate: sp.rate, team: e.team, h: e, cap: sp.cap, truck: true, id: e.id });
      }
    }
    for (const q of this.points) if (q.team >= 0) { q.stock = Math.min(q.cap, q.stock + 6 * dt); S.push({ x: q.x, z: q.z, r2: 22 * 22, rate: 36, team: q.team, h: q, cap: q.cap, fixed: true }); }
    for (const c of this.crates) if (c.fall <= 0) S.push({ x: c.x, z: c.z, r2: 11 * 11, rate: 46, team: -1, h: c, cap: 700, crate: true });
    if (!S.length) return;
    for (const e of this.ents) {
      if (e.dead || e.kind !== 'unit' || e.boarded) continue;
      const d = DEFS[e.def];
      if (d.sup && e.sup < d.sup - 0.4) {
        let need = d.sup - e.sup;
        for (let i = 0; i < S.length && need > 0.4; i++) {
          const s = S[i]; if (s.truck && s.id === e.id) continue; if (s.team !== -1 && s.team !== e.team) continue;
          const dx = e.x - s.x, dz = e.z - s.z; if (dx * dx + dz * dz > s.r2) continue;
          const avail = s.inf ? 1e9 : s.h.stock; if (avail <= 0) continue;
          const g = Math.min(need, s.rate * dt, avail); e.sup += g; need -= g; if (!s.inf) s.h.stock -= g; e.rsT = t;
        }
      }
      if (d.supply && e.stock !== undefined) {   // trucks load from stocked bases and unload into emptier ones
        const f = e.stock / d.supply.cap;
        for (let i = 0; i < S.length; i++) {
          const s = S[i]; if (s.team !== e.team || s.truck || s.crate) continue;
          const dx = e.x - s.x, dz = e.z - s.z; if (dx * dx + dz * dz > 15 * 15) continue;
          const fs = s.inf ? 1 : s.h.stock / s.cap;
          if (fs > f + 0.04) { const g = Math.min(60 * dt, d.supply.cap - e.stock, s.inf ? 1e9 : s.h.stock); e.stock += g; if (!s.inf) s.h.stock -= g; }
          else if (f > fs + 0.04 && !s.hq) { const g = Math.min(60 * dt, s.cap - s.h.stock, e.stock); e.stock -= g; s.h.stock += g; }
          break;
        }
        if (e.stock < d.supply.cap * 0.995 && e.sup === undefined) { /* trucks are unarmed: nothing else to do */ }
      }
      if (d.fuel && !d.fw && e.ap === 'fly' && e.fuel < d.fuel - 0.5) {   // helicopters and VTOLs hovering over a base refuel there
        for (let i = 0; i < S.length; i++) {
          const s = S[i]; if (s.team !== e.team || s.truck || s.crate) continue;
          const dx = e.x - s.x, dz = e.z - s.z; if (dx * dx + dz * dz > s.r2 * 0.4 || (!s.inf && s.h.stock < 5)) continue;
          const g = Math.min(18 * dt, d.fuel - e.fuel); e.fuel += g; if (!s.inf) s.h.stock -= g / 3; break;
        }
      }
      if (d.tank && e.fstock > 1 && e.ap !== 'wait' && !(e.ap && ['equip', 'select', 'stand', 'taxi', 'hold'].includes(e.ap))) {   // tanker boom: feed friendly aircraft in range
        const R2 = d.tank.range * d.tank.range;
        for (const a of this.ents) {
          if (a === e || a.dead || a.kind !== 'unit' || !a.air || a.fuel === undefined || a.team !== e.team || a.ap !== 'fly') continue;
          const ad = DEFS[a.def]; if (ad.tank || a.fuel >= ad.fuel - 0.5) continue;
          const dx = a.x - e.x, dz = a.z - e.z; if (dx * dx + dz * dz > R2) continue;
          const g = Math.min(d.tank.rate * dt, ad.fuel - a.fuel, e.fstock); a.fuel += g; e.fstock -= g; a.rfT = t;
          if (e.fstock < 1) break;
        }
      }
    }
  },
  // ---------- fuel ----------
  // returns true when the aircraft handled its own movement this tick (refuelling / heading home / crashed)
  fuelLogic(u, d) {
    u.fuel -= DT * (u.spd > d.speed * 0.9 ? 1.3 : 1);
    if (u.fuel <= 0) { u.fuel = 0; this.ev({ e: 'flameout', x: u.x, z: u.z, owner: u.owner }); this.kill(u, false); return true; }
    const cap = d.fuel;
    if (u.rf) {
      const tk = this.byId.get(u.rf);
      if (!tk || tk.dead || !(tk.fstock > 15) || u.fuel > cap * 0.93) u.rf = 0;
      else { if (d.fw) this.fwMove(u, d, tk.x - tk.dirx * 22, tk.z - tk.dirz * 22, d.speed, 1); else this.rotMove(u, d, tk.x, tk.z, 6); return true; }
    }
    if (d.decoy || !u.ap) return false;
    const hb = this.afOf(u) || this.afFindField(u, null);
    const dist = hb ? Math.sqrt((hb.x - u.x) * (hb.x - u.x) + (hb.z - u.z) * (hb.z - u.z)) : 0, reserve = hb ? dist / (d.speed * 0.8) * 1.25 + 14 : cap * 0.2;
    if (u.fuel < reserve * 1.6 && !d.tank && ((this.tick + u.id) % 20) === 0) {
      let best = null, bd = 1e18;
      for (const e of this.ents) {
        if (e.dead || e.team !== u.team || !(e.fstock > 150) || e.ap !== 'fly') continue;
        const dx = e.x - u.x, dz = e.z - u.z, dd = Math.sqrt(dx * dx + dz * dz); if (dd < bd) { bd = dd; best = e; }
      }
      if (best && bd / (d.speed * 0.85) < u.fuel * 0.6 && u.fuel > 12) { u.rf = best.id; return false; }
    }
    if (u.fuel < reserve && hb && !u.rf) { if (this.startRtb(u, true)) { this.ev({ e: 'bingofuel', id: u.id, owner: u.owner }); this.sortie(u, d); return true; } }
    else if (u.fuel < cap * 0.12 && !u.fwarn) { u.fwarn = 1; this.ev({ e: 'lowfuel', id: u.id, owner: u.owner, x: u.x, z: u.z }); }
    return false;
  },
  // ---------- ground units: supplies ----------
  autoResupply(u, d) {
    const own = (e) => e.team === u.team && !e.dead;
    let best = null, bd = 360 * 360;
    const cand = (x, z, h, r) => { const dx = x - u.x, dz = z - u.z, dd = dx * dx + dz * dz; if (dd < bd && (h === null || h > 60)) { bd = dd; best = { x, z, r }; } };
    for (const e of this.ents) {
      if (!own(e) || e.boarded || e.id === u.id) continue;
      if (e.kind === 'building' && e.progress >= 1 && (e.def === 'hq' || e.def === 'supplydepot')) cand(e.x, e.z, e.def === 'hq' ? null : e.stock, e.radius + 6);
      else if (e.kind === 'unit' && DEFS[e.def].supply && !d.supply) cand(e.x, e.z, e.stock, 6);
    }
    for (const q of this.points) if (q.team === u.team) cand(q.x, q.z, q.stock, 8);
    if (!best) return;
    const dx = u.x - best.x, dz = u.z - best.z, l = Math.sqrt(dx * dx + dz * dz) || 1;
    this.cmdMove([u], best.x + dx / l * Math.min(best.r, l), best.z + dz / l * Math.min(best.r, l), 'move');
    u.order.rs = 1;
  },
  // standing supply run: top up from a stocked base, then deliver to the emptiest depot (or toward units that ran dry)
  truckAuto(u, d) {
    const sp = d.supply, f = u.stock / sp.cap;
    let best = null, bs = 1e18;
    const mine = (e) => e.team === u.team && !e.dead && e.progress >= 1;
    if (f < 0.3) {
      for (const e of this.ents) {
        if (e.kind !== 'building' || !mine(e)) continue;
        if (e.def === 'hq' || (e.def === 'supplydepot' && e.stock > 900)) { const dx = e.x - u.x, dz = e.z - u.z, dd = dx * dx + dz * dz - (e.def === 'hq' ? 0 : -1500); if (dd < bs) { bs = dd; best = e; } }
      }
    } else {
      for (const e of this.ents) {
        if (e.dead || e.team !== u.team) continue;
        let need = 0, x = e.x, z = e.z;
        if (e.kind === 'building' && e.def === 'supplydepot' && e.progress >= 1) need = 1 - e.stock / BUILDINGS.supplydepot.depot.cap;
        else if (e.kind === 'unit' && DEFS[e.def].sup && !e.air) need = (e.sup < DEFS[e.def].sup * 0.35) ? 0.9 : 0;
        if (need < 0.35) continue;
        const dx = x - u.x, dz = z - u.z, dd = dx * dx + dz * dz - need * 40000; if (dd < bs) { bs = dd; best = e; }
      }
      for (const q of this.points) if (q.team === u.team && q.stock < q.cap * 0.4) { const dx = q.x - u.x, dz = q.z - u.z, dd = dx * dx + dz * dz - 20000; if (dd < bs) { bs = dd; best = q; } }
    }
    if (best) { this.cmdMove([u], best.x, best.z, 'move'); u.order.rs = 1; }
  },
  // ---------- pallets ----------
  dropCrate(x, z) { this.crates.push({ id: ++this.nextCid, x, z, stock: 700, fall: 70, ttl: 12000 }); if (this.crates.length > 60) this.crates.shift(); },
  fwSupplyDrop(u, d, o) {
    if (!(u.pal > 0)) { this.finishOrder(u); return; }
    if (u.sdc > 0) u.sdc--;
    this.fwMove(u, d, o.x, o.z, d.speed, 1);
    const dx = o.x - u.x, dz = o.z - u.z;
    if (dx * dx + dz * dz < 26 * 26 && !(u.sdc > 0)) { this.dropCrate(u.x, u.z); u.pal--; u.sdc = 12; this.ev({ e: 'crate', x: u.x, z: u.z, y: this.map.hAt(u.x, u.z) + d.alt }); }
  },
  // ---------- ESM: emitters that an anti-radiation shooter can home on ----------
  emits(e) {
    if (e.dead || e.emcon || e.stun > 0) return false;
    const d = e.ed || DEFS[e.def]; if (!(d.radar || d.ew)) return false;
    if (e.kind === 'building' && e.progress < 1) return false;
    if (e.ap && ['wait', 'equip', 'select', 'stand'].includes(e.ap)) return false;
    return this.players[e.owner].ewOn;
  },
  updateEsm() {
    for (const s of this.esm) s.clear();
    let any = false;
    for (const u of this.ents) {
      if (u.dead || u.kind !== 'unit') continue; const d = u.ed || DEFS[u.def];
      let r = 0; for (const w of d.weapons) if (w.arm) r = Math.max(r, w.range * 1.3);
      if (!r) continue; any = true;
      for (const e of this.ents) {
        if (e.dead || e.team === u.team || this.esm[u.team].has(e.id)) continue;
        const dx = e.x - u.x, dz = e.z - u.z; if (dx * dx + dz * dz > r * r) continue;
        if (this.emits(e)) this.esm[u.team].add(e.id);
      }
    }
    return any;
  },
  // ---------- veterancy ----------
  gainXp(src, amt, killed) {
    if (!src || src.dead || src.kind !== 'unit') return;
    src.xp = (src.xp || 0) + Math.min(amt, 350) / 40 + (killed ? 6 : 0);
    const v = src.vet || 0;
    if (v < 3 && src.xp >= VET_XP[v]) {
      src.vet = v + 1; const add = Math.round(src.maxhp * 0.1 / (1 + 0.1 * v)); src.maxhp += add; src.hp += add;
      this.ev({ e: 'promote', id: src.id, owner: src.owner, vet: src.vet, x: src.x, z: src.z });
    }
  },
  // ---------- wrecks & salvage ----------
  addWreck(e) {
    const d = DEFS[e.def]; if (e.air || d.drone || d.cost < 150 || e.armor === 'inf') return;
    this.wrecks.push({ id: ++this.nextCid, x: e.x, z: e.z, def: e.def, val: Math.round(d.cost * 0.35), ttl: 4800, rad: e.radius, yaw: e.dirx });
    if (this.wrecks.length > 50) this.wrecks.shift();
  },
  wreckTick() {
    const W = this.wrecks; for (let i = W.length - 1; i >= 0; i--) if ((W[i].ttl -= 10) <= 0) W.splice(i, 1);
    if (!W.length) return;
    for (const u of this.ents) {
      if (u.dead || u.kind !== 'unit' || !DEFS[u.def].builder || u.air) continue;
      let best = -1, bd = 45 * 45;
      for (let i = 0; i < W.length; i++) { const dx = W[i].x - u.x, dz = W[i].z - u.z, dd = dx * dx + dz * dz; if (dd < bd) { bd = dd; best = i; } }
      if (best < 0) continue;
      const w = W[best];
      if (bd < 6 * 6) { const p = this.players[u.owner]; p.credits = Math.min(p.capM || 99999, p.credits + w.val); this.ev({ e: 'salvage', x: w.x, z: w.z, val: w.val, owner: u.owner }); W.splice(best, 1); if (u.order.sv) this.finishOrder(u); }
      else if (u.order.t === 'idle') { this.cmdMove([u], w.x, w.z, 'move'); u.order.sv = 1; }
    }
  },
};
