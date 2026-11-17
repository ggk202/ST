// Space layer: orbital objects (satellites, orbital shipyards, space warships) and strategic ballistic missiles.
// Everything here is deterministic (+ - * / sqrt floor only). An orbital object lives on a ring (layer 0 = low, 1 = mid, 2 = high)
// and is described by a phase `ph` in [0,1). Its ground track on the map is a closed triangle-wave curve of the phase, so a
// satellite sweeps the whole map once per orbit with no trigonometry.
import { DT, UNITS, BUILDINGS, DEFS, dmgMult } from './defs.js';
import { clamp } from './util.js';

export const ORB_W = [1 / 2600, 1 / 4200, 1 / 6400];        // phase advance per tick for layers 0..2 (periods ~130 s, 210 s, 320 s)
export const ORB_LAYERS = ['Low orbit', 'Medium orbit', 'High orbit'];
export const LAYER_SHIFT = 360;                               // ticks needed to change orbit
const TRACKS = [[1, 0.0, 3, 0.0], [1, 0.5, 2, 0.25], [2, 0.25, 3, 0.5], [1, 0.0, 4, 0.5]];
export const tri = (x) => { x -= Math.floor(x); return x < 0.5 ? x * 4 - 1 : 3 - x * 4; };   // -1..1
// ground position under an orbital object on a map of the given size
export function orbGround(o, size) {
  const k = TRACKS[o.inc & 3], h = size / 2;
  return [h + h * 0.9 * tri(o.ph * k[0] + k[1]), h + h * 0.9 * tri(o.ph * k[2] + k[3])];
}
export const phDiff = (a, b) => { let d = a - b; d -= Math.floor(d + 0.5); return d; };   // signed circular phase difference in [-0.5, 0.5)

export const SpaceOps = {
  spaceInit() { this.orb = []; this.msl = []; this.rods = []; this.nextOid = 1; },
  // a finished satellite / ship leaves the pad (or yard) and enters orbit
  launchOrbital(owner, type, from) {
    const d = UNITS[type], od = d.orbital; if (!od) return null;
    const p = this.players[owner];
    const o = { id: this.nextOid++, owner, team: p.team, def: type, layer: od.layer, ph: this.rng.next(), inc: this.rng.int(4), hp: d.hp, maxhp: d.hp, cd: 0, gcd: 0, gam: od.g ? (od.g.ammo || 99) : 0,
      q: [], tp: -1, tl: -1, lt: 0, gt: null, flash: 0, dead: false, vis: od.kind === 'yard' ? 0 : 1 };
    if (from && from.ph !== undefined) { o.ph = from.ph + 0.002; o.layer = from.layer; }
    this.orb.push(o);
    this.ev({ e: 'launch', owner, def: type, id: o.id });
    return o;
  },
  oOwn(ids, p) { const out = []; for (const id of ids || []) for (const o of this.orb) if (o.id === id && o.owner === p && !o.dead) out.push(o); return out; },
  // ---- commands ----
  orbMove(owner, ids, layer, ph) {
    for (const o of this.oOwn(ids, owner)) {
      const od = UNITS[o.def].orbital; if (!od.thr) continue;
      if (layer !== undefined && layer !== null && layer !== o.layer && layer >= 0 && layer <= 2) { o.tl = layer; o.lt = LAYER_SHIFT; }
      if (ph !== undefined && ph !== null) o.tp = ph - Math.floor(ph);
    }
  },
  orbStrike(owner, ids, x, z) {
    for (const o of this.oOwn(ids, owner)) { const od = UNITS[o.def].orbital; if (od.g) o.gt = { x, z }; }
  },
  orbTrain(owner, yardId, type) {
    const o = this.orb.find((q) => q.id === yardId && q.owner === owner && !q.dead); const d = UNITS[type];
    if (!o || !d || d.from !== 'orbyard' || UNITS[o.def].orbital.kind !== 'yard' || this.players[owner].tech < d.techLv || o.q.length >= 8) return false;
    o.q.push({ type, left: d.timeTicks, sm: 0, se: 0 }); return true;
  },
  orbDequeue(owner, yardId, idx) {
    const o = this.orb.find((q) => q.id === yardId && q.owner === owner && !q.dead); if (!o || !o.q[idx]) return;
    const it = o.q.splice(idx, 1)[0], p = this.players[owner]; p.credits += it.sm; p.energy += it.se;
  },
  // fire a stored strategic missile from a silo
  fireMissile(owner, bid, x, z) {
    const b = this.byId.get(bid), p = this.players[owner];
    if (!b || b.dead || b.owner !== owner || b.def !== 'silo' || b.progress < 1 || !(b.mis && b.mis.length) || b.stun > 0) return false;
    x = clamp(x, 4, this.map.size - 4); z = clamp(z, 4, this.map.size - 4);
    const type = b.mis.shift(), md = UNITS[type].missile;
    const dx = x - b.x, dz = z - b.z, dist = Math.sqrt(dx * dx + dz * dz);
    const flight = Math.round((md.flight + dist / 90) / DT);
    const tm = UNITS[type].tm;
    this.msl.push({ id: this.nextOid++, owner, team: p.team, sx: b.x, sz: b.z, x, z, t: 0, dur: flight, dmg: Math.round(md.dmg * tm / 1), splash: md.splash * (1 + 0.1 * (UNITS[type].tier - 1)), tier: UNITS[type].tier, dead: false });
    this.ev({ e: 'icbm', owner, sx: b.x, sz: b.z, x, z, dur: flight, id: this.nextOid - 1 });
    return true;
  },
  orbBlast(owner, x, z, dmg, splash, src) {
    const r2 = splash * splash;
    for (const e of this.ents) {
      if (e.dead || e.boarded) continue;
      const ed = DEFS[e.def], dx = e.x - x, dz = e.z - z, d2 = dx * dx + dz * dz, rr = (ed.radius || 1) + splash;
      if (d2 > rr * rr) continue;
      const fall = e.kind === 'building' ? 1 : Math.max(0.25, 1 - Math.sqrt(d2) / (splash + 0.001));
      if (e.air && e.h > 0.3) continue;
      this.damage(e, dmg * fall * dmgMult('blast', ed.armor, false), src || null);
    }
    this.ev({ e: 'orbhit', x, z, r: splash, big: dmg > 1200 });
  },
  // ---- per-tick ----
  spaceTick() {
    if (!this.orb) return;
    const size = this.map.size;
    // missiles in flight
    const ml = this.msl;
    for (let i = ml.length - 1; i >= 0; i--) {
      const m = ml[i]; m.t++;
      if (m.t === Math.floor(m.dur * 0.55)) this.abmIntercept(m);
      if (m.dead) { ml.splice(i, 1); continue; }
      if (m.t >= m.dur) { this.orbBlast(m.owner, m.x, m.z, m.dmg, m.splash, null); ml.splice(i, 1); }
    }
    // orbital objects
    for (const o of this.orb) {
      if (o.dead) continue;
      const od = UNITS[o.def].orbital, w = ORB_W[o.layer];
      let dp = w;
      if (o.tp >= 0 && od.thr) { const df = phDiff(o.tp, o.ph); const s = clamp(df, -od.thr, od.thr); dp += s; if (Math.abs(df) < 0.0008) o.tp = -1; }
      o.ph += dp; o.ph -= Math.floor(o.ph);
      if (o.lt > 0) { o.lt--; if (o.lt === 0) { o.layer = o.tl; o.tl = -1; } }
      if (o.cd > 0) o.cd--; if (o.gcd > 0) o.gcd--; if (o.flash > 0) o.flash--;
      const p = this.players[o.owner];
      // orbital weapons: nearest hostile object within reach (layers one apart count as in range)
      if (od.o && o.cd <= 0) {
        const tm = UNITS[o.def].tm, rng = od.o.rng; let best = null, bd = rng;
        for (const q of this.orb) {
          if (q.dead || q.team === o.team || Math.abs(q.layer - o.layer) > 1) continue;
          const d = Math.abs(phDiff(q.ph, o.ph)) + Math.abs(q.layer - o.layer) * 0.01;
          if (d < bd) { bd = d; best = q; }
        }
        if (best) {
          o.cd = od.o.cd; this.orbDamage(best, od.o.dmg * tm, o);
          this.ev({ e: 'obeam', a: o.id, b: best.id });
        }
      }
      // ground bombardment
      if (od.g && o.gt && o.gcd <= 0 && o.gam > 0 && o.tl < 0) {
        const g = orbGround(o, size), dx = g[0] - o.gt.x, dz = g[1] - o.gt.z, tm = UNITS[o.def].tm, rr = od.g.reach * (o.layer === 0 ? 1.1 : o.layer === 2 ? 0.8 : 1);
        if (dx * dx + dz * dz <= rr * rr) {
          o.gcd = od.g.cd; o.gam--; o.flash = 14;
          this.ev({ e: 'rod', id: o.id, owner: o.owner, x: o.gt.x, z: o.gt.z, sx: g[0], sz: g[1] });
          this.rods.push({ x: o.gt.x, z: o.gt.z, t: 30, dmg: od.g.dmg * tm, splash: od.g.splash, owner: o.owner });
          if (od.kind === 'strike') o.gt = null;
        }
      }
      // strike-satellite reload
      if (od.kind === 'strike' && o.gam <= 0) { o.rr = (o.rr || 0) + 1; if (o.rr >= 2400) { o.rr = 0; o.gam = od.g.ammo; } }
      // shipyard production
      if (od.kind === 'yard' && o.q.length) {
        const it = o.q[0], ud = UNITS[it.type];
        if (it.left > 0) { const adv = Math.min(it.left, p.eff), fr = adv / ud.timeTicks; it.left -= adv; it.sm += ud.cost * fr; it.se += ud.energy * fr; p.spentM += ud.cost * fr; p.spentE += ud.energy * fr; }
        if (it.left <= 0) { o.q.shift(); this.launchOrbital(o.owner, it.type, o); }
      }
    }
    // tungsten rods fall after a delay
    const rs = this.rods;
    for (let i = rs.length - 1; i >= 0; i--) { const r = rs[i]; if (--r.t <= 0) { this.orbBlast(r.owner, r.x, r.z, r.dmg, r.splash, null); rs.splice(i, 1); } }
    this.orb = this.orb.filter((o) => !o.dead);
  },
  orbDamage(o, amt, src) {
    if (o.dead) return;
    o.hp -= amt; o.flash = 8;
    const op = this.players[o.owner];
    if (this.tick - op.lastAlert > 80 && o.hp > 0) { op.lastAlert = this.tick; this.ev({ e: 'oalert', owner: o.owner, id: o.id }); }
    if (o.hp <= 0) {
      o.dead = true; this.ev({ e: 'odie', id: o.id, owner: o.owner, def: o.def, layer: o.layer, ph: o.ph });
      if (src) this.players[src.owner].stats.killed++;
      if (UNITS[o.def].orbital.kind === 'yard') for (const q of o.q) { const p = this.players[o.owner]; p.credits += q.sm; p.energy += q.se; }
    }
  },
  // anti-ballistic batteries shoot at the incoming warhead near the end of its trajectory
  abmIntercept(m) {
    for (const b of this.ents) {
      if (b.dead || b.kind !== 'building' || b.def !== 'abm' || b.progress < 1 || b.team === m.team || b.stun > 0 || b.abmcd > 0) continue;
      const dx = b.x - m.x, dz = b.z - m.z, ab = BUILDINGS.abm.abm;
      if (dx * dx + dz * dz > ab.range * ab.range) continue;
      b.abmcd = ab.cd;
      const ok = this.rng.next() < ab.pk;
      this.ev({ e: 'abm', x: b.x, z: b.z, tx: m.x, tz: m.z, ok });
      if (ok) { m.dead = true; return true; }
    }
    return false;
  },
  // satellites reveal the ground below their track
  spaceVision(mark) {
    if (!this.orb) return;
    const size = this.map.size;
    for (const o of this.orb) {
      if (o.dead) continue;
      const od = UNITS[o.def].orbital; if (!od.vision) continue;
      const g = orbGround(o, size), tier = UNITS[o.def].tier;
      mark(o.team, g[0], g[1], od.vision * (1 + 0.1 * (tier - 1)));
    }
  },
  // Launch / orbit completion for finished pad queue items is handled by the production loop (see sim.updateBuilding)
  spaceItemDone(b, it) {
    const ud = UNITS[it.type];
    if (ud.missile) { b.mis = b.mis || []; b.mis.push(it.type); this.ev({ e: 'trained', id: b.id, owner: b.owner, def: it.type, x: b.x, z: b.z }); return true; }
    if (ud.orbital) { if (!this.space) return true; this.launchOrbital(b.owner, it.type, null); return true; }
    return false;
  },
};
