// Airfield operations (part of the deterministic sim). Aircraft built at an Airfield go through a visible ground cycle:
//   built on an apron stand -> wait for a free runway (nobody landing) -> taxi onto the runway -> player picks a loadout
//   -> ground crews arm the aircraft -> take off.  Returning aircraft land, taxi in, are re-armed, and wait on a stand.
// Helicopters / VTOLs (rwy 0) skip the runway: they are armed on their stand and lift off vertically.
// Mixed into Sim.prototype (see sim.js).
import { DT, CELL, AF, AF_MODULES, AF_KEYS, UNITS, DEFS, TICK_RATE } from './defs.js';
import { clamp } from './util.js';

const AXES = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
export const GROUND_PHASES = new Set(['wait', 'taxiOut', 'select', 'equip', 'stand', 'taxiIn', 'rearm']);

export const AirOps = {
  // ---------- layout ----------
  afRect(x, z, ax, sd, u0, u1, v0, v1) {
    const a = AXES[ax], px = -a[1] * sd, pz = a[0] * sd;
    const c = (u, v) => [x + a[0] * u + px * v, z + a[1] * u + pz * v];
    const p = c(u0, v0), q = c(u1, v1);
    return { x0: Math.min(p[0], q[0]), x1: Math.max(p[0], q[0]), z0: Math.min(p[1], q[1]), z1: Math.max(p[1], q[1]) };
  },
  afLevelRects(x, z, ax, sd) {
    const R = (u0, u1, v0, v1) => this.afRect(x, z, ax, sd, u0, u1, v0, v1), r0 = AF.rw0, L = AF.rwLen, hw = AF.rwHalf;
    return {
      base: [R(r0 - 2, r0 + L[1], -hw, hw), R(10, 28, AF.apV0, AF.apV1)],
      runway: [[R(r0 + L[1], r0 + L[2], -hw, hw)], [R(r0 + L[2], r0 + L[3], -hw, hw)]],
      apron: [[R(28, 40, AF.apV0, AF.apV1)], [R(40, 52, AF.apV0, AF.apV1)]],
    };
  },
  // paved strips only need dry, not-too-steep ground (the pavement is draped over the terrain)
  afCellOk(i, j) {
    const m = this.map, w = m.vw, h = m.h, a = h[j * w + i], b = h[j * w + i + 1], c = h[(j + 1) * w + i], d = h[(j + 1) * w + i + 1];
    return Math.min(a, b, c, d) > 0.45 && Math.max(a, b, c, d) < 26 && Math.max(a, b, c, d) - Math.min(a, b, c, d) < 6;
  },
  afRectFree(r, selfId) {
    const n = this.map.n, map = this.map;
    const cx0 = Math.floor(r.x0 / CELL), cx1 = Math.floor((r.x1 - 0.001) / CELL), cz0 = Math.floor(r.z0 / CELL), cz1 = Math.floor((r.z1 - 0.001) / CELL);
    if (cx0 < 2 || cz0 < 2 || cx1 > n - 3 || cz1 > n - 3) return false;
    for (let j = cz0; j <= cz1; j++) for (let i = cx0; i <= cx1; i++) {
      const c = j * n + i;
      if (map.occ[c] || !this.afCellOk(i, j)) return false;
      if (this.rsv[c] && this.rsv[c] !== selfId) return false;
    }
    for (const o of map.oil) if (o.ci >= cx0 - 1 && o.ci <= cx1 + 1 && o.cj >= cz0 - 1 && o.cj <= cz1 + 1) return false;
    return true;
  },
  // Choose the runway orientation (toward the map centre when possible) and how far it can be extended.
  afPlan(x, z, selfId) {
    const half = this.map.size / 2;
    let dx = half - x, dz = half - z; const l = Math.sqrt(dx * dx + dz * dz) || 1; dx /= l; dz /= l;
    const best = [];
    for (let ax = 0; ax < 4; ax++) for (const sd of [1, -1]) {
      const R = this.afLevelRects(x, z, ax, sd);
      if (!R.base.every((r) => this.afRectFree(r, selfId))) continue;
      const max = { runway: 0, apron: 0, depot: AF.maxLevel - 1 }, rects = R.base.slice();
      for (const k of ['runway', 'apron']) for (let i = 0; i < 2; i++) { if (!R[k][i].every((r) => this.afRectFree(r, selfId))) break; max[k] = i + 1; for (const r of R[k][i]) rects.push(r); }
      // prefer layouts that can be extended the furthest, then ones whose runway points toward the map centre
      best.push({ ax, sd, max, rects, s: (max.runway + max.apron) * 2 + AXES[ax][0] * dx + AXES[ax][1] * dz + (sd > 0 ? 0.01 : 0) });
    }
    best.sort((a, b) => b.s - a.s || a.ax - b.ax);
    if (best.length) return best[0];
    return null;
  },
  afReserve(b, plan) {
    const n = this.map.n;
    for (const r of plan.rects) {
      const cx0 = Math.floor(r.x0 / CELL), cx1 = Math.floor((r.x1 - 0.001) / CELL), cz0 = Math.floor(r.z0 / CELL), cz1 = Math.floor((r.z1 - 0.001) / CELL);
      for (let j = cz0; j <= cz1; j++) for (let i = cx0; i <= cx1; i++) this.rsv[j * n + i] = b.id;
    }
  },
  afRelease(b) { const rsv = this.rsv; for (let i = 0; i < rsv.length; i++) if (rsv[i] === b.id) rsv[i] = 0; },
  afInit(b, plan) {
    const a = AXES[plan.ax];
    b.afd = { ax: plan.ax, sd: plan.sd, dx: a[0], dz: a[1], px: -a[1] * plan.sd, pz: a[0] * plan.sd };
    b.mods = { runway: 0, apron: 0, depot: 0 }; b.maxMod = plan.max; b.up = null; b.rwy = 0; b.land = 0; b.stands = [0, 0, 0, 0, 0, 0]; b.auto = false; b.last = {};
    this.afReserve(b, plan);
  },
  afPt(b, u, v) { const g = b.afd; return { x: b.x + g.dx * u + g.px * v, z: b.z + g.dz * u + g.pz * v }; },
  afRunLevel(b) { return 1 + b.mods.runway; },
  afDepotLevel(b) { return 1 + b.mods.depot; },
  afRunLen(b) { return AF.rwLen[this.afRunLevel(b)]; },
  afStandCount(b) { return AF.stands[1 + b.mods.apron]; },
  afStandPt(b, i) { return this.afPt(b, AF.standU0 + AF.standDU * (i >> 1), AF.rowV[i & 1]); },
  afLane(i) { return (i & 1) ? AF.lane : AF.apV0 - 0.5; },
  afOf(u) { const b = u.af ? this.byId.get(u.af) : null; return b && !b.dead && b.afd ? b : null; },
  afFreeStand(b) {
    const n = this.afStandCount(b);
    for (let i = 0; i < n; i++) { if (b.stands[i]) { const o = this.byId.get(b.stands[i]); if (!o || o.dead) b.stands[i] = 0; } if (!b.stands[i]) return i; }
    return -1;
  },
  afTaxiOut(b, si) {
    const us = AF.standU0 + AF.standDU * (si >> 1), lane = this.afLane(si);
    return [this.afPt(b, us, lane), this.afPt(b, AF.conn, lane), this.afPt(b, AF.conn, 0), this.afPt(b, AF.rw0 + AF.hold, 0)];
  },
  afTaxiIn(b, si) {
    const us = AF.standU0 + AF.standDU * (si >> 1), lane = this.afLane(si), s = this.afStandPt(b, si);
    return [this.afPt(b, AF.conn, 0), this.afPt(b, AF.conn, lane), this.afPt(b, us, lane), s];
  },
  afFace(b, u, du, dv) { const g = b.afd; u.dirx = g.dx * du + g.px * dv; u.dirz = g.dz * du + g.pz * dv; },

  // ---------- spawning ----------
  spawnAircraft(b, type, si) {
    const p = this.stand(b, si), u = this.makeEnt(type, b.owner, p.x, p.z);
    this.players[b.owner].units++;
    u.af = b.id; u.stand = si; b.stands[si] = u.id; u.ap = 'wait'; u.h = 0; u.ph = 0; u.air = false; u.rdy = false; u.lo = -1; u.t = 0; u.wp = null; u.wi = 0; u.rally = b.rally ? { x: b.rally.x, z: b.rally.z } : null;
    u.resume = null; u.eqN = 0; u.eqT = 0; u.atRw = false; u.ed = null; u.am = null;
    this.afFace(b, u, 0, -1);
    return u;
  },
  stand(b, si) { return this.afStandPt(b, si); },

  // ---------- loadouts ----------
  afAllowed(b, lo) { return lo.dp <= this.afDepotLevel(b) && lo.rw <= this.afRunLevel(b); },
  afSelect(u, idx) {
    const b = this.afOf(u); if (!b || (u.ap !== 'select' && u.ap !== 'stand')) return false;
    const d = UNITS[u.def], lo = d.loadouts && d.loadouts[idx]; if (!lo || !this.afAllowed(b, lo)) return false;
    const p = this.players[u.owner];
    if (lo.cost > 0 && (p.credits < lo.cost || p.energy < lo.energy)) { this.ev({ e: 'afdeny', owner: u.owner, id: u.id }); return false; }
    p.credits -= lo.cost; p.energy -= lo.energy;
    u.atRw = u.ap === 'select'; u.lo = idx; u.eqT = 0; u.eqN = Math.max(10, Math.round(lo.prepTicks / (1 + 0.3 * b.mods.depot))); u.ap = 'equip';
    b.last[d.base] = idx;
    return true;
  },
  afApply(u) {
    const lo = UNITS[u.def].loadouts[u.lo], r = u.maxhp > 0 ? u.hp / u.maxhp : 1;
    u.ed = lo.ed; u.cd = lo.weapons.map(() => 0); u.am = lo.weapons.map((w) => (w.ammo > 0 ? w.ammo : -1));
    u.maxhp = lo.ed.hp; u.hp = Math.max(1, r * u.maxhp); u.rdy = true;
  },
  afAiPick(b, u) {
    const d = UNITS[u.def], ok = d.loadouts.filter((l) => this.afAllowed(b, l) && (l.cost === 0 || this.players[u.owner].credits > l.cost * 3));
    return ok.length ? ok[this.rng.int(ok.length)].idx : 0;
  },
  afBingo(u) {
    if (!u.am || !u.ed || !u.ed.weapons.length) return false;
    for (let k = 0; k < u.am.length; k++) if (u.am[k] !== 0) return false;
    return true;
  },
  afFindField(u, lo) {
    let best = null, bd = 1e18;
    for (const b of this.ents) {
      if (b.dead || b.owner !== u.owner || b.def !== 'airfield' || b.progress < 1 || !b.afd) continue;
      if (this.afRunLevel(b) < Math.max(UNITS[u.def].rwy, lo ? lo.rw : 0)) continue;
      const dd = (b.x - u.x) * (b.x - u.x) + (b.z - u.z) * (b.z - u.z); if (dd < bd) { bd = dd; best = b; }
    }
    return best;
  },
  startRtb(u, auto) {
    const lo = u.lo >= 0 ? UNITS[u.def].loadouts[u.lo] : null, b = this.afOf(u) || this.afFindField(u, lo);
    if (!b || u.ap !== 'fly') return false;
    u.af = b.id; u.resume = auto && u.order.t !== 'idle' ? u.order : null; u.ap = 'rtb'; u.stand = -1; u.target = 0;
    this.finishOrder(u); u.ap = 'rtb';
    return true;
  },
  afLost(u) {   // airfield destroyed while the aircraft was on the way home
    const b = this.afFindField(u, null);
    if (b) { u.af = b.id; u.stand = -1; return; }
    u.ap = 'fly'; u.h = 1; u.air = true; u.af = 0;
  },
  // detach an aircraft from its airfield bookkeeping (death / airfield loss)
  afForget(u) {
    const b = u.af ? this.byId.get(u.af) : null;
    if (b && b.afd) { if (b.rwy === u.id) b.rwy = 0; if (b.land === u.id) b.land = 0; for (let i = 0; i < b.stands.length; i++) if (b.stands[i] === u.id) b.stands[i] = 0; }
  },

  // ---------- upgrades ----------
  afCanUpgrade(b, key) {
    const m = AF_MODULES[key]; if (!b.afd || b.progress < 1 || b.up || !m) return 'Unavailable';
    const lv = b.mods[key]; if (lv >= m.levels.length) return 'Fully upgraded';
    if (lv >= b.maxMod[key]) return 'No room: terrain or buildings block the extension';
    return '';
  },
  afStartUpgrade(b, key) {
    if (this.afCanUpgrade(b, key)) return false;
    const lv = AF_MODULES[key].levels[b.mods[key]];
    b.up = { key, left: Math.round(lv.time * TICK_RATE), total: Math.round(lv.time * TICK_RATE), sm: 0, se: 0 };
    return true;
  },
  afCancelUpgrade(b) { if (!b.up) return; const p = this.players[b.owner]; p.credits += b.up.sm; p.energy += b.up.se; b.up = null; },
  afUpgradeTick(b, p) {
    const up = b.up; if (!up) return;
    const lv = AF_MODULES[up.key].levels[b.mods[up.key]], adv = Math.min(up.left, p.eff), fr = adv / up.total;
    up.left -= adv; up.sm += lv.cost * fr; up.se += lv.energy * fr; p.spentM += lv.cost * fr; p.spentE += lv.energy * fr;
    if (up.left <= 0) { b.mods[up.key]++; b.up = null; this.ev({ e: 'afmod', id: b.id, owner: b.owner, key: up.key, lv: b.mods[up.key] }); }
  },

  // ---------- per-tick sortie state machine ----------
  afFollow(u, speed) {
    const w = u.wp[u.wi]; if (!w) return true;
    const dx = w.x - u.x, dz = w.z - u.z, l = Math.sqrt(dx * dx + dz * dz);
    if (l < 0.8) { u.wi++; return u.wi >= u.wp.length; }
    u.dirx += (dx / l - u.dirx) * 0.22; u.dirz += (dz / l - u.dirz) * 0.22;
    const m = Math.sqrt(u.dirx * u.dirx + u.dirz * u.dirz) || 1; u.dirx /= m; u.dirz /= m;
    const st = Math.min(speed * DT, l); u.x += dx / l * st; u.z += dz / l * st; u.moving = true;
    return false;
  },
  flyTo(u, d, tx, tz) {
    const dx = tx - u.x, dz = tz - u.z, l = Math.sqrt(dx * dx + dz * dz);
    if (l > 0.01) {
      u.dirx += (dx / l - u.dirx) * 0.2; u.dirz += (dz / l - u.dirz) * 0.2;
      const m = Math.sqrt(u.dirx * u.dirx + u.dirz * u.dirz) || 1; u.dirx /= m; u.dirz /= m;
      const st = Math.min(d.speed * DT, l); u.x += dx / l * st; u.z += dz / l * st; u.moving = true;
    }
    return l;
  },
  sortie(u, d) {
    u.ph = u.h; u.moving = false;
    const D = UNITS[u.def], lo = u.lo >= 0 ? D.loadouts[u.lo] : D.loadouts[0], vert = D.rwy === 0;
    let b = this.afOf(u);
    if (!b) { this.afLost(u); b = this.afOf(u); if (!b) { u.vx = u.vz = 0; return; } }
    const g = b.afd, L = this.afRunLen(b);
    switch (u.ap) {
      case 'wait': {
        if (vert) { if (u.rdy) { u.ap = 'takeoff'; u.t = 0; } else { u.ap = 'select'; u.t = 0; } break; }
        if (b.rwy === 0 && b.land === 0) {
          b.rwy = u.id; if (u.stand >= 0) { b.stands[u.stand] = 0; }
          u.wp = this.afTaxiOut(b, u.stand); u.wi = 0; u.ap = 'taxiOut'; u.stand = -1;
        }
        break;
      }
      case 'taxiOut': if (this.afFollow(u, AF.taxi)) { this.afFace(b, u, 1, 0); if (u.rdy) { u.ap = 'takeoff'; u.t = 0; } else { u.ap = 'select'; u.t = 0; } } break;
      case 'select': {
        u.t++;
        let idx = -1; const p = this.players[u.owner];
        if (p.ai) idx = this.afAiPick(b, u);
        else if (b.auto) idx = b.last[D.base] !== undefined ? b.last[D.base] : 0;
        else if (u.t > AF.selectTimeout * TICK_RATE) idx = b.last[D.base] !== undefined ? b.last[D.base] : 0;
        if (idx >= 0 && !this.afSelect(u, idx)) { if (!this.afSelect(u, 0)) { u.ap = 'select'; } }
        break;
      }
      case 'equip': {
        u.eqT++;
        if (u.eqT >= u.eqN) {
          this.afApply(u);
          if (u.atRw) { u.ap = 'takeoff'; u.t = 0; } else u.ap = 'stand';
        }
        break;
      }
      case 'takeoff': {
        u.t++;
        if (vert) {
          u.h = smooth(clamp(u.t / 70, 0, 1));
          if (u.t >= 70) this.afAirborne(u, b);
        } else {
          const T = 70 + 22 * D.rwy, p = clamp(u.t / T, 0, 1), u0 = AF.rw0 + AF.hold, u1 = AF.rw0 + L - 2;
          const pos = this.afPt(b, lerp(u0, u1, p * p), 0); u.x = pos.x; u.z = pos.z; this.afFace(b, u, 1, 0); u.moving = true;
          u.h = p < 0.62 ? 0 : smooth((p - 0.62) / 0.38);
          if (p > 0.72 && b.rwy === u.id) b.rwy = 0;
          if (u.t >= T) this.afAirborne(u, b);
        }
        break;
      }
      case 'rtb': {
        let tx, tz, si = u.stand;
        if (vert) {
          if (si < 0) { si = this.afFreeStand(b); if (si >= 0) { u.stand = si; b.stands[si] = u.id; } }
          if (si >= 0) { const s = this.afStandPt(b, si); tx = s.x; tz = s.z; } else { const s = this.afPt(b, 0, -30); tx = s.x; tz = s.z; }
        } else { const a = this.afPt(b, AF.rw0 + L + 55, 0); tx = a.x; tz = a.z; }
        u.h = 1; u.air = true;
        const l = this.flyTo(u, d, tx, tz);
        if (vert) { if (si >= 0 && l < 1.5) { u.ap = 'land'; u.t = 0; } }
        else if (l < 4 && b.rwy === 0 && b.land === 0) {
          const f = this.afFreeStand(b);
          if (f >= 0) { u.stand = f; b.stands[f] = u.id; b.land = u.id; u.ap = 'land'; u.t = 0; u.lsx = u.x; u.lsz = u.z; }
        }
        break;
      }
      case 'land': {
        u.t++;
        if (vert) {
          u.h = 1 - smooth(clamp(u.t / 60, 0, 1)); const s = this.afStandPt(b, u.stand); u.x = lerp(u.x, s.x, 0.2); u.z = lerp(u.z, s.z, 0.2);
          if (u.t >= 60) { u.ap = 'rearm'; u.eqT = 0; u.eqN = Math.max(10, Math.round(lo.prepTicks * 0.7 / (1 + 0.3 * b.mods.depot))); u.h = 0; }
        } else {
          const LT = 150, p = clamp(u.t / LT, 0, 1), ut = AF.rw0 + L - 6, ur = AF.rw0 + 12;
          this.afFace(b, u, -1, 0);
          if (p < 0.55) { const q = p / 0.55, t = this.afPt(b, ut, 0); u.x = lerp(u.lsx, t.x, q); u.z = lerp(u.lsz, t.z, q); u.h = 1 - q * q * (3 - 2 * q); }
          else { const q = (p - 0.55) / 0.45, e = 1 - (1 - q) * (1 - q), pos = this.afPt(b, lerp(ut, ur, e), 0); u.x = pos.x; u.z = pos.z; u.h = 0; u.moving = true; }
          if (u.t >= LT) { u.wp = this.afTaxiIn(b, u.stand); u.wi = 0; u.ap = 'taxiIn'; }
        }
        break;
      }
      case 'taxiIn': {
        const done = this.afFollow(u, AF.taxi);
        if (u.wi >= 1 && b.land === u.id) b.land = 0;
        if (done) { u.ap = 'rearm'; u.eqT = 0; u.eqN = Math.max(10, Math.round(lo.prepTicks * 0.7 / (1 + 0.3 * b.mods.depot))); this.afFace(b, u, 0, -1); }
        break;
      }
      case 'rearm': {
        u.eqT++; u.hp = Math.min(u.maxhp, u.hp + u.maxhp * 0.003);
        if (u.eqT >= u.eqN) {
          if (u.lo < 0) { u.lo = 0; this.afApply(u); } else { u.am = lo.weapons.map((w) => (w.ammo > 0 ? w.ammo : -1)); u.cd = lo.weapons.map(() => 0); }
          u.rdy = true; u.ap = 'stand';
          if (u.resume && u.order.t === 'idle') { u.order = u.resume; }
          u.resume = null;
        }
        break;
      }
      case 'stand': {
        u.hp = Math.min(u.maxhp, u.hp + u.maxhp * 0.001);
        if (u.order.t !== 'idle') { u.ap = 'wait'; }
        break;
      }
      default: break;
    }
    u.air = u.h > 0.3;
    u.vx = (u.x - u.px) / DT; u.vz = (u.z - u.pz) / DT;
  },
  afAirborne(u, b) {
    u.ap = 'fly'; u.h = 1; u.ph = 1; u.air = true; if (b.rwy === u.id) b.rwy = 0;
    if (u.stand >= 0) { if (b.stands[u.stand] === u.id) b.stands[u.stand] = 0; u.stand = -1; }
    if (u.order.t === 'idle') {
      const r = u.rally || this.afPt(b, AF.rw0 + this.afRunLen(b) + 40, 0);
      u.order = { t: 'move', x: r.x, z: r.z }; u.path = null;
    }
  },
};
export { AF_KEYS };
