// Air transport: ground units board a parked transport (capacity in "slots"), which airlifts them to another friendly
// airfield or airdrops the light, parachute-capable ones at a point. Deterministic: arithmetic only.
import { UNITS, AF } from './defs.js';

export const CHUTE_TICKS = 150;

export const CargoOps = {
  cargoCap(t) { return t.cargo && t.ed && t.ed.lo && t.ed.lo.cap ? t.ed.lo.cap : 0; },
  cargoUsed(t) { let n = 0; if (t.cargo) for (const c of t.cargo) n += UNITS[c.def].slots; return n; },
  // returns '' when the unit may board, otherwise the reason it can't
  boardCheck(t, u) {
    const cap = this.cargoCap(t), lo = t.ed && t.ed.lo; if (!cap) return 'Transport is not ready';
    if (lo.only === 'para' && !UNITS[u.def].para) return 'This configuration carries only infantry, drones and light vehicles';
    if (this.cargoUsed(t) + UNITS[u.def].slots > cap) return 'Transport is full';
    return '';
  },
  board(u, t) {
    const why = this.boardCheck(t, u);
    if (why) { this.ev({ e: 'cargomsg', owner: u.owner, msg: why }); return false; }
    t.cargo.push(u); u.boarded = true; u.cargoIn = t.id; u.target = 0; u.path = null; u.order = { t: 'idle' }; u.moving = false;
    this.ev({ e: 'board', id: u.id, owner: u.owner, x: u.x, z: u.z });
    return true;
  },
  cmdBoard(units, tid) {
    const t = this.byId.get(tid);
    if (!t || t.dead || !t.cargo) return;
    for (const u of units) if (u.kind === 'unit' && !u.air && u.owner === t.owner && !u.boarded) { u.order = { t: 'board', tid }; u.path = null; u.target = 0; u.pending = false; }
  },
  // ground unit walks to the transport and climbs aboard once it is parked and equipped
  boardTick(u, d) {
    const t = this.byId.get(u.order.tid);
    if (!t || t.dead || !t.cargo) { this.finishOrder(u); return false; }
    const dx = t.x - u.x, dz = t.z - u.z, near = t.radius + 5;
    if (dx * dx + dz * dz <= near * near) {
      u.path = null;
      if (t.ap === 'stand') { if (!this.board(u, t)) this.finishOrder(u); }
      return false;
    }
    return !this.goTo(u, d, t.x, t.z, near - 1);
  },
  // put cargo back on the ground. At an airfield stand the units file out onto the taxi lane.
  unloadCargo(t, b) {
    if (!t.cargo || !t.cargo.length) return 0;
    const n = t.cargo.length, map = this.map, lim = map.size - 4;
    for (let k = 0; k < n; k++) {
      const c = t.cargo[k], col = k % 10, row = (k / 10) | 0;
      let x, z;
      if (b && b.afd && t.stand >= 0) {
        const si = t.stand, us = AF.standU0 + AF.standDU * (si >> 1), lane = this.afLane(si), sg = (si & 1) ? 1 : -1;
        const p = this.afPt(b, us + (col - 4.5) * 2.4, lane + sg * 0 + (row & 1 ? -1 : 1) * (1 + (row >> 1)) * 2.4); x = p.x; z = p.z;
      } else { x = t.x + (col - 4.5) * 2.4; z = t.z + (row + 1) * 2.4; }
      c.x = Math.min(lim, Math.max(4, x)); c.z = Math.min(lim, Math.max(4, z)); c.px = c.x; c.pz = c.z;
      c.boarded = false; c.cargoIn = 0; c.order = { t: 'idle' }; c.path = null; c.stuck = 0; c.pending = false; c.moving = false; c.stun = 0;
      this.ents.push(c); this.byId.set(c.id, c);
    }
    t.cargo = []; this.ev({ e: 'unload', id: t.id, owner: t.owner, n });
    return n;
  },
  // paradrop every parachute-capable unit around (x, z); heavier cargo stays aboard
  dropCargo(t, x, z) {
    if (!t.cargo || !t.cargo.length) return 0;
    const keep = [], lim = this.map.size - 4; let k = 0;
    for (const c of t.cargo) {
      if (!UNITS[c.def].para) { keep.push(c); continue; }
      const col = k % 6, row = (k / 6) | 0, sx = Math.min(lim, Math.max(4, x - t.dirx * 8 * row + (col - 2.5) * 2.6)), sz = Math.min(lim, Math.max(4, z - t.dirz * 8 * row + (row & 1 ? 1.3 : 0)));
      k++;
      c.x = sx + t.dirz * (col - 2.5) * 0.0; c.z = sz; c.px = c.x; c.pz = c.z;
      c.boarded = false; c.cargoIn = 0; c.order = { t: 'idle' }; c.path = null; c.stuck = 0; c.pending = false; c.moving = false;
      c.chute = CHUTE_TICKS + (k % 5) * 6;
      this.ents.push(c); this.byId.set(c.id, c);
    }
    t.cargo = keep; if (k) this.ev({ e: 'airdrop', id: t.id, owner: t.owner, x, z, n: k });
    return k;
  },
  // cargo dies with the aircraft
  loseCargo(t) {
    if (!t.cargo) return;
    for (const c of t.cargo) { c.dead = true; c.boarded = false; this.players[c.owner].units--; this.players[c.owner].stats.lost++; }
    t.cargo = [];
  },
  validLiftField(t, b) { return !!(b && !b.dead && b.owner === t.owner && b.afd && b.progress >= 1 && this.afRunLevel(b) >= UNITS[t.def].rwy); },
  cmdLift(ts, bid) {
    const b = this.byId.get(bid);
    for (const t of ts) {
      if (t.kind !== 'unit' || !t.cargo || !t.rdy || (t.ap !== 'stand' && t.ap !== 'fly')) continue;
      if (!this.validLiftField(t, b)) { this.ev({ e: 'cargomsg', owner: t.owner, msg: 'Destination needs a completed airfield with a long enough runway' }); continue; }
      if (b.id === t.af && t.ap === 'stand') continue;
      t.order = { t: 'lift', bid }; t.path = null; t.unl = 1; t.target = 0;
    }
  },
  cmdDrop(ts, x, z) {
    const lim = this.map.size - 6;
    for (const t of ts) {
      if (t.kind !== 'unit' || !t.cargo || !t.rdy || (t.ap !== 'stand' && t.ap !== 'fly')) continue;
      t.order = { t: 'drop', x: Math.min(lim, Math.max(6, x)), z: Math.min(lim, Math.max(6, z)) }; t.path = null; t.unl = 0; t.target = 0;
    }
  },
  cmdUnload(ts) { for (const t of ts) if (t.kind === 'unit' && t.cargo && t.cargo.length && (t.ap === 'stand' || t.ap === 'rearm')) this.unloadCargo(t, this.afOf(t)); },
  // flight orders (called from fwUnit)
  fwLift(u, d, o) {
    const b = this.byId.get(o.bid);
    if (!this.validLiftField(u, b)) { this.finishOrder(u); return; }
    if (this.fwNav(u, d, b.x, b.z, 110)) { u.af = b.id; u.stand = -1; u.ap = 'rtb'; u.fin = 0; u.ga = 0; u.lcx = undefined; u.t = 0; this.finishOrder(u); u.ap = 'rtb'; }
  },
  fwDrop(u, d, o) {
    if (this.fwNav(u, d, o.x, o.z, 45)) { this.dropCargo(u, o.x, o.z); this.finishOrder(u); this.startRtb(u, false); }
  },
};
