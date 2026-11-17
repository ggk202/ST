// Flight model. Fixed-wing aircraft (d.fw) cannot hover: they keep a minimum airspeed, turn at a limited rate (turn radius = speed / turn rate),
// loiter in circles when idle, make passes over their targets and have to come around again. Rotary-wing aircraft (helicopters, VTOLs, FPV drones)
// accelerate and brake smoothly and can hover. Everything is plain arithmetic (no trig) so that lockstep peers stay bit-identical.
import { DT } from './defs.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const CS = new Map();
// rotation by a fixed angle per tick expressed without trig: tangent half-angle (Cayley) form, exact unit rotation
function rotCS(rate) {
  let r = CS.get(rate);
  if (!r) { const t = rate * DT / 2, q = 1 + t * t; r = { c: (1 - t * t) / q, s: 2 * t / q }; CS.set(rate, r); }
  return r;
}
export const FL = {
  vminK: 0.5,        // stall speed as a share of top speed
  loiterK: 0.75,      // loiter speed share
  climb: 0.30,        // climb gradient (vertical units per unit travelled)
  sink: 0.36,         // descent gradient
  glide: 0.2,         // approach glide slope
  roll: 0.85,         // maximum bank angle shown (rad)
};

export const FlightOps = {
  fwInit(u, d) { if (u.dirx * u.dirx + u.dirz * u.dirz < 0.01) { u.dirx = 1; u.dirz = 0; } if (u.spd === undefined) u.spd = d.speed * 0.8; if (u.roll === undefined) { u.roll = 0; u.pit = 0; } },
  turnR(d) { return d.speed / d.turn; },
  // steer a fixed-wing aircraft toward (tx,tz) for one tick. k scales the turn authority (terminal guidance of one-way drones).
  fwMove(u, d, tx, tz, vt, hT, k) {
    this.fwInit(u, d);
    const map = this.map, m = 24;
    tx = clamp(tx, 16, map.size - 16); tz = clamp(tz, 16, map.size - 16);
    if (u.x < m || u.z < m || u.x > map.size - m || u.z > map.size - m) { tx = map.size / 2; tz = map.size / 2; }
    let dx = tx - u.x, dz = tz - u.z; const l = Math.sqrt(dx * dx + dz * dz) || 1; dx /= l; dz /= l;
    const cs = rotCS(d.turn * (k || 1)), dot = u.dirx * dx + u.dirz * dz, crs = u.dirx * dz - u.dirz * dx;
    let frac, sg = crs >= 0 ? 1 : -1;
    if (dot >= cs.c) { frac = crs < 0 ? -crs / cs.s : crs / cs.s; u.dirx = dx; u.dirz = dz; }
    else { const nx = u.dirx * cs.c - u.dirz * cs.s * sg, nz = u.dirx * cs.s * sg + u.dirz * cs.c; u.dirx = nx; u.dirz = nz; frac = 1; }
    const n = Math.sqrt(u.dirx * u.dirx + u.dirz * u.dirz) || 1; u.dirx /= n; u.dirz /= n;
    u.roll += (-sg * Math.min(1, frac) * FL.roll - u.roll) * 0.12;
    // speed: hard turns bleed energy, never below stall
    const vmin = d.speed * FL.vminK;
    const tv = clamp(vt * (1 - 0.18 * Math.min(1, frac)), vmin, d.speed);
    u.spd += clamp(tv - u.spd, -d.accel * 1.5 * DT, d.accel * DT);
    u.x += u.dirx * u.spd * DT; u.z += u.dirz * u.spd * DT;
    u.x = clamp(u.x, 2, map.size - 2); u.z = clamp(u.z, 2, map.size - 2);
    // altitude: limited climb and descent gradients
    const alt = d.alt, up = FL.climb * u.spd * DT / alt, dn = FL.sink * u.spd * DT / alt, dh = clamp(hT - u.h, -dn, up);
    u.h += dh;
    u.pit += (clamp(dh * alt / DT / Math.max(u.spd, 6), -0.5, 0.5) - u.pit) * 0.15;
    u.moving = true;
  },
  // circle around a fixed point (idle fixed-wing aircraft cannot stop)
  fwLoiter(u, d, cx, cz, sd) {
    this.fwInit(u, d);
    const vl = d.speed * FL.loiterK, R = Math.max(vl / d.turn * 1.2, 20);
    if (cx === undefined) {
      if (u.lcx === undefined) { sd = sd || 1; u.lsd = sd; u.lcx = u.x - u.dirz * R * sd; u.lcz = u.z + u.dirx * R * sd; }
      cx = u.lcx; cz = u.lcz; sd = u.lsd;
    }
    let rx = u.x - cx, rz = u.z - cz; const rl = Math.sqrt(rx * rx + rz * rz) || 1; rx /= rl; rz /= rl;
    // tangent in the direction of travel, plus a pull back onto the circle
    const tx = -rz * sd, tz = rx * sd, ah = R * 0.9;
    this.fwMove(u, d, cx + rx * R + tx * ah, cz + rz * R + tz * ah, vl, 1);
  },
  // approach or attack pass: fly at the target, overshoot, extend away, then come around again
  fwAttack(u, d, tx, tz, ground, strike) {
    const dx = tx - u.x, dz = tz - u.z, dd = Math.sqrt(dx * dx + dz * dz) || 1, R = d.speed / d.turn, ca = (u.dirx * dx + u.dirz * dz) / dd;
    if (u.ext) { if (dd > 2.3 * R + 8 || (ca > 0.92 && dd > R)) u.ext = 0; }
    else if (!strike && ca < -0.05 && dd < 2.3 * R) u.ext = 1;
    if (u.ext) { this.fwMove(u, d, u.x + u.dirx * 120, u.z + u.dirz * 120, d.speed, 1); return; }
    this.fwMove(u, d, tx, tz, d.speed, ground && dd < 4 * R ? 0.55 : 1, strike && dd < 3.5 * R ? 2.6 : 1);
  },
  fwNav(u, d, tx, tz, tol) {
    const dx = tx - u.x, dz = tz - u.z, dd = Math.sqrt(dx * dx + dz * dz);
    if (dd <= Math.max(tol, 8)) return true;
    this.fwMove(u, d, tx, tz, d.speed, 1);
    return false;
  },
  // helicopters, VTOLs, quadcopters: smooth acceleration, braking onto the target, forward tilt
  rotMove(u, d, tx, tz, tol) {
    if (u.spd === undefined) { u.spd = 0; u.roll = 0; u.pit = 0; }
    const dx = tx - u.x, dz = tz - u.z, l = Math.sqrt(dx * dx + dz * dz) || 1, acc = d.accel;
    const brake = Math.sqrt(2 * acc * 0.7 * Math.max(0, l - tol * 0.5));
    const vt = Math.min(d.speed, brake);
    u.spd += clamp(vt - u.spd, -acc * 1.6 * DT, acc * DT);
    u.dirx += (dx / l - u.dirx) * 0.2; u.dirz += (dz / l - u.dirz) * 0.2;
    const m = Math.sqrt(u.dirx * u.dirx + u.dirz * u.dirz) || 1; u.dirx /= m; u.dirz /= m;
    const st = Math.min(u.spd * DT, l);
    u.x = clamp(u.x + u.dirx * st, 2, this.map.size - 2); u.z = clamp(u.z + u.dirz * st, 2, this.map.size - 2);
    u.moving = true;
    return l;
  },
  rotRest(u, d) { if (u.spd) u.spd = Math.max(0, u.spd - d.accel * 1.6 * DT); },
  // orders of an airborne fixed-wing aircraft (called instead of the ground-style movement switch)
  fwUnit(u, d, o, tg) {
    this.fwInit(u, d);
    if (u.h === undefined) { u.h = 1; u.ph = 1; }
    if (u.ap === undefined) u.ph = u.h;
    if (o.t !== 'idle') u.lcx = undefined;
    const strike = !!d.strike;
    switch (o.t) {
      case 'move': if (this.fwNav(u, d, o.x, o.z, 2.2)) this.finishOrder(u); break;
      case 'attackmove':
        if (tg) this.fwAttack(u, d, tg.x, tg.z, !tg.air, strike);
        else if (this.fwNav(u, d, o.x, o.z, 2.5)) this.finishOrder(u);
        break;
      case 'attack': this.fwAttack(u, d, tg.x, tg.z, !tg.air, strike); break;
      case 'attackground': {
        let rmax = 0;
        for (const w of d.weapons) if (w.ground && w.kind !== 'hit') rmax = Math.max(rmax, w.range);
        if (rmax === 0) { this.cmdMove([u], o.x, o.z, 'move'); break; }
        this.fwAttack(u, d, o.x, o.z, true, strike);
        break;
      }
      default: this.fwLoiter(u, d); break;
    }
  },
  // ---------- runway approach / landing for fixed-wing aircraft (called from the sortie state machine) ----------
  // frame: s = distance beyond the touchdown point along the extended centreline, l = lateral offset
  afFrame(b, u, sg, tu) {
    const g = b.afd, rx = u.x - b.x, rz = u.z - b.z;
    return { s: sg * (rx * g.dx + rz * g.dz - tu), l: rx * g.px + rz * g.pz };
  },
};
