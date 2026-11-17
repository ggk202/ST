// Tier equipment: Mk II and Mk III units get extra, visibly more advanced hardware on top of the base model.
//   Mk II  : add-on armor, flare / chaff dispensers, thermal sights, gold markings
//   Mk III : composite appliqué, EW antennas, directed-energy turret (aircraft), glowing cyan sensors and markings
// The kit is generated from per-class anchor tables, so every model of a class (tanks, aircraft, infantry, drones) gets one.
import { C, PI } from './model-core.js';
const { OD2, OD3, DARK, DARK2, METAL, STEEL, BLACK, GLASS, WHITE, GOLD, CYAN } = C;
const ACC2 = 0xe0a020, ACC3 = 0x40e8ff, PLATE = 0x353b3f, PLATE3 = 0x24282c, GREYW = 0xcfd5db;

// ---------------- ground vehicles ----------------
// hw: half hull width, z0 / z1: rear / front, deck: hull deck height, ty: turret roof, tz: turret centre, tw / tl: turret half width / length
const VEH = {
  mbt: { hw: 1.75, z0: -3.0, z1: 2.4, deck: 2.0, ty: 3.0, tz: -0.25, tw: 1.35, tl: 1.5, tur: 1 },
  heavy: { hw: 1.75, z0: -3.0, z1: 2.4, deck: 2.0, ty: 3.0, tz: -0.25, tw: 1.35, tl: 1.5, tur: 1 },
  ifv: { hw: 1.5, z0: -2.7, z1: 2.2, deck: 2.0, ty: 2.9, tz: -0.3, tw: 1.0, tl: 1.0, tur: 1 },
  aa: { hw: 1.5, z0: -2.5, z1: 2.2, deck: 1.9, ty: 2.95, tz: -0.3, tw: 1.2, tl: 1.1, tur: 1 },
  sph: { hw: 1.6, z0: -2.8, z1: 2.6, deck: 2.0, ty: 3.45, tz: -0.5, tw: 1.5, tl: 1.6, tur: 1 },
  scout: { hw: 1.0, z0: -1.8, z1: 1.6, deck: 1.5, ty: 2.2, tz: -0.7, tw: 0.5, tl: 0.4, tur: 1, light: 1 },
  mlrs: { hw: 1.15, z0: -2.8, z1: 1.4, deck: 1.9, ty: 2.4, tz: -1.0, tw: 1.1, tl: 1.6, tur: 1, truck: 1 },
  tel: { hw: 1.3, z0: -4.0, z1: 1.5, deck: 2.0, ty: 2.2, tz: -2.4, tw: 1.0, tl: 3.0, tur: 1, truck: 1 },
  ewtruck: { hw: 1.2, z0: -2.7, z1: 1.0, deck: 3.3, ty: 3.3, tz: -1.1, tw: 1.1, tl: 1.7, tur: 0, truck: 1 },
};
function chevron(b, x, y, z, col, w = 1.0, rot = 0.55) { b.box(w, 0.05, 0.14, x - w * 0.42, y, z, col, [0, rot, 0]); b.box(w, 0.05, 0.14, x + w * 0.42, y, z, col, [0, -rot, 0]); }
function vehicle(b, A, tier) {
  const t3 = tier >= 3, acc = t3 ? ACC3 : ACC2, hy = A.deck;
  b.g('hull');
  // add-on armor modules along the hull sides (Mk II: slabs, Mk III: angled composite wedges)
  const n = A.truck ? 3 : 5, span = (A.z1 - 0.8) - (A.z0 + 0.8);
  for (let i = 0; i < n; i++) {
    const z = A.z0 + 0.8 + span * (i + 0.5) / n, len = span / n * 0.82;
    for (const s of [-1, 1]) {
      b.box(0.26, A.truck ? 0.55 : 0.6, len, s * (A.hw + 0.15), hy - (A.truck ? 0.7 : 0.35), z, t3 ? PLATE3 : PLATE, [0, 0, s * (t3 ? 0.22 : 0)]);
      b.box(0.28, 0.07, len * 0.9, s * (A.hw + 0.17), hy - (A.truck ? 0.38 : 0.04), z, acc);
    }
  }
  chevron(b, 0, hy + 0.06, A.z0 + 0.9, acc, 1.1);
  if (t3) { chevron(b, 0, hy + 0.06, A.z0 + 1.35, acc, 1.1); for (const s of [-1, 1]) b.box(0.05, 0.08, span * 0.8, s * (A.hw - 0.05), hy + 0.0, (A.z0 + A.z1) / 2, ACC3); }   // glowing hull edge lights
  if (!A.truck && !A.light) { b.box(A.hw * 1.5, 0.12, 0.5, 0, hy - 0.1, A.z1 - 0.3, t3 ? PLATE3 : PLATE, [0.5, 0, 0]); }   // applique on the glacis
  // turret kit
  b.g(A.tur ? 'turret' : 'hull');
  const ty = A.ty, tz = A.tz;
  for (const s of [-1, 1]) {      // flare / smoke launchers: banks of tubes angled up and out
    for (let i = 0; i < 3; i++) b.cyl(0.09, 0.4, s * (A.tw + 0.18), ty - 0.45, tz + A.tl * 0.1 + i * 0.26, DARK2, [0, 0, -s * 0.7]);
    b.box(0.2, 0.22, 0.9, s * (A.tw + 0.1), ty - 0.62, tz + A.tl * 0.1 + 0.26, PLATE);
  }
  b.box(0.34, 0.22, 0.34, -A.tw * 0.45, ty + 0.15, tz - A.tl * 0.45, DARK2); b.box(0.2, 0.12, 0.05, -A.tw * 0.45, ty + 0.15, tz - A.tl * 0.45 + 0.19, GLASS); b.box(0.36, 0.04, 0.36, -A.tw * 0.45, ty + 0.28, tz - A.tl * 0.45, acc);   // thermal commander's sight
  if (!A.truck || A.tur) b.box(A.tw * 1.3, 0.06, 0.12, 0, ty + 0.04, tz + A.tl * 0.55, acc);   // turret marking stripe
  if (t3) {
    // EW suite: dome + blade antennas + phased-array panels on the turret bustle
    const bz = tz - A.tl * 0.8, bx = A.tw * 0.55;
    b.cyl(0.18, 0.5, bx, ty + 0.3, bz, METAL); b.sph(0.34, bx, ty + 0.62, bz, GREYW, 0.8, 0.8); b.box(0.5, 0.05, 0.05, bx, ty + 0.62, bz, ACC3);
    for (const q of [[-0.5, 0.3], [0.2, 0.55], [-0.1, -0.5]]) b.cyl6(0.025, 1.0 + q[1] * 0.4, -bx + q[0], ty + 0.5, bz + q[1], BLACK);
    b.sph6(0.07, -bx - 0.5, ty + 1.05, bz + 0.3, ACC3);
    for (const s of [-1, 1]) b.box(0.08, 0.55, 0.7, s * (A.tw + 0.05), ty - 0.2, tz - A.tl * 0.55, 0x1d3a4a, [0, 0, 0]);   // array panels
    for (const s of [-1, 1]) { b.box(0.06, 0.45, 0.5, s * (A.tw + 0.1), ty - 0.2, tz - A.tl * 0.55, ACC3); }
    // composite wedges on the turret cheeks
    for (const s of [-1, 1]) b.box(0.45, 0.55, A.tl * 0.9, s * (A.tw - 0.05), ty - 0.35, tz + A.tl * 0.55, PLATE3, [0, -s * 0.38, 0]);
    b.box(A.tw * 1.2, 0.1, A.tl * 0.7, 0, ty + 0.05, tz + A.tl * 0.1, PLATE3);
  }
}

// ---------------- infantry ----------------
function infantry(b, tier) {
  const t3 = tier >= 3, acc = t3 ? ACC3 : ACC2;
  b.g('hull');
  b.box(0.72, 0.5, 0.1, 0, 1.45, 0.4, t3 ? PLATE3 : PLATE); b.box(0.5, 0.06, 0.04, 0, 1.62, 0.46, acc);            // ceramic plate + stripe
  for (const s of [-1, 1]) { b.box(0.34, 0.24, 0.5, s * 0.56, 1.86, 0, t3 ? PLATE3 : OD3); b.box(0.34, 0.04, 0.5, s * 0.56, 1.99, 0, acc); }   // pauldrons
  b.box(0.36, 0.14, 0.16, 0, 2.32, 0.28, DARK2); b.box(0.28, 0.06, 0.04, 0, 2.32, 0.37, t3 ? ACC3 : GLASS); b.box(0.08, 0.1, 0.1, 0, 2.28, 0.18, METAL);   // night-vision monocle
  b.box(0.3, 0.04, 0.5, 0, 2.5, -0.02, acc);                                                                          // helmet band
  if (t3) {
    b.box(0.5, 0.1, 0.06, 0, 2.1, 0.32, ACC3);                                                                        // glowing visor
    b.box(0.56, 0.5, 0.4, 0, 1.5, -0.72, PLATE3); b.box(0.5, 0.05, 0.04, 0, 1.7, -0.93, ACC3); b.box(0.5, 0.05, 0.04, 0, 1.4, -0.93, ACC3);   // comms / power module
    b.cyl6(0.03, 1.0, -0.2, 2.2, -0.72, BLACK); b.sph6(0.06, -0.2, 2.72, -0.72, ACC3);
    b.box(0.12, 0.12, 0.04, -0.2, 1.45, 0.46, ACC3); b.box(0.12, 0.12, 0.04, 0.2, 1.45, 0.46, ACC3);                  // chest emitters
  }
}

// ---------------- aircraft ----------------
// sy: spine height, sz: spine centre, zr: tail z, wx: half span, wy / wz: wing height / z, bl: belly, nz: nose z, fx / fy: fin x / height
const AIRK = {
  uav: { sy: 0.4, sz: 0.2, zr: -1.9, wx: 3.6, wy: 0.08, wz: 0.1, bl: -0.3, nz: 1.5, fx: 0.0, fy: 0, smooth: 1 },
  fighter: { sy: 0.5, sz: -0.5, zr: -4.2, wx: 5.0, wy: -0.1, wz: -0.9, bl: -0.7, nz: 3.5, fx: 0.0, fy: 0, smooth: 1 },
  vtol: { sy: 0.55, sz: -0.2, zr: -3.6, wx: 4.4, wy: -0.1, wz: -0.5, bl: -0.7, nz: 3.2, fx: 0.0, fy: 0, smooth: 1 },
  heli: { sy: 0.95, sz: -1.5, zr: -4.5, wx: 1.6, wy: -0.2, wz: 0.2, bl: -0.7, nz: 2.6, fx: 0.0, fy: 0, smooth: 1 },
  ewplane: { sy: 1.0, sz: 0.4, zr: -3.2, wx: 4.5, wy: -0.2, wz: -0.6, bl: -0.7, nz: 3.0, fx: 0.0, fy: 0, smooth: 1 },
  bomber: { sy: 1.6, sz: 0.5, zr: -9.0, wx: 12.0, wy: 0.4, wz: -0.6, bl: -1.9, nz: 8.0, fx: 0.0, fy: 0, smooth: 1 },
  strategic: { sy: 2.0, sz: 2.0, zr: -14.5, wx: 23.0, wy: 0.3, wz: -1.5, bl: -2.2, nz: 12, fx: 0.0, fy: 0, smooth: 1 },
  airlifter: { sy: 3.1, sz: 5.0, zr: -19.0, wx: 26.0, wy: 2.7, wz: -1.0, bl: -3.0, nz: 14, fx: 0.0, fy: 11 },
  tanker: { sy: 3.1, sz: 5.0, zr: -19.0, wx: 26.0, wy: 2.7, wz: -1.0, bl: -3.0, nz: 14, fx: 0.0, fy: 11 },
  awacs: { sy: 2.2, sz: 5.0, zr: -14.5, wx: 17.0, wy: 0.9, wz: -0.8, bl: -2.3, nz: 11, fx: 1.0, fy: 5 },
  spydrone: { sy: 1.4, sz: 3.0, zr: -8.0, wx: 26.0, wy: 0.0, wz: -1.2, bl: -1.0, nz: 9, fx: 0.0, fy: 0, smooth: 1 },
};
function aircraft(b, A, tier) {
  const t3 = tier >= 3, acc = t3 ? ACC3 : ACC2, k = Math.pow(Math.max(0.6, Math.min(3.2, A.wx / 5)), 0.7);
  b.g('hull');
  // flare / chaff dispensers under the tail boom, accent chevrons on the spine, fin stripes, chin sensor
  for (const s of [-1, 1]) { b.box(0.3 * k, 0.2 * k, 1.1 * k, s * 0.55 * k, A.bl + 0.2 * k, A.zr * 0.55, PLATE); for (let i = 0; i < 3; i++) b.cyl6(0.045 * k, 0.22 * k, s * 0.55 * k, A.bl + 0.06 * k, A.zr * 0.55 + (i - 1) * 0.3 * k, BLACK, [0, 0, 0]); }
  chevron(b, 0, A.sy + 0.03, A.sz - 1.6 * k, acc, 1.2 * k, 0.5);
  if (A.fy) for (const s of A.fx ? [-1, 1] : [0]) b.box(0.07, 0.45 * k, 1.0 * k, s * (A.fx + 0.06), A.fy * 0.72, A.zr + 0.8 * k + (A.fx ? 0.4 : 0), acc);
  b.sph(0.32 * k, 0, A.bl + 0.12 * k, A.nz * 0.55, DARK2, 0.8, 1.0); b.sph6(0.14 * k, 0, A.bl + 0.1 * k, A.nz * 0.55 + 0.25 * k, t3 ? ACC3 : GLASS);
  if (!A.smooth) for (const s of [-1, 1]) b.box(0.5 * k, 0.05, 0.3 * k, s * A.wx * 0.97, A.wy + 0.12, A.wz - A.wx * 0.12, acc);   // wingtip markers
  b.box(0.5 * k, 0.06, 1.4 * k, 0, A.sy + 0.04, A.sz + 1.2 * k, PLATE);                                           // dorsal blade-antenna panel
  if (t3) {
    // directed-energy defense turrets (dorsal + ventral): ball turret with a cyan emitter lens
    for (const [y, dir] of [[A.sy + 0.12, 1], [A.bl - 0.05, -1]]) {
      const z = dir > 0 ? A.sz + 0.2 : A.sz * 0.4;
      b.cyl(0.42 * k, 0.28 * k, 0, y, z, DARK2); b.sph(0.4 * k, 0, y + dir * 0.28 * k, z, PLATE3, 0.8, 0.9); b.cyl(0.09 * k, 0.55 * k, 0, y + dir * 0.4 * k, z + 0.32 * k, METAL, [PI / 2, 0, 0]); b.sph6(0.13 * k, 0, y + dir * 0.4 * k, z + 0.66 * k, ACC3);
    }
    if (!A.smooth) for (const s of [-1, 1]) {
      b.box(A.wx * 0.5, 0.04, 0.12 * k, s * A.wx * 0.38, A.wy + 0.16, A.wz + 0.3 * k, ACC3);                      // conformal EW antenna arrays
      b.box(A.wx * 0.22, 0.05, 0.4 * k, s * A.wx * 0.2, A.wy + 0.14, A.wz - 0.7 * k, PLATE3);
    }
    chevron(b, 0, A.sy + 0.03, A.sz - 2.2 * k, ACC3, 1.2 * k, 0.5);
    b.sph6(0.08 * k, 0, A.sy + 0.2, A.zr * 0.5, ACC3); b.cyl6(0.03 * k, 0.9 * k, 0, A.sy + 0.5 * k, A.zr * 0.5, BLACK);
  }
}

// ---------------- other drones: derived from the model's bounding box ----------------
function bbox(b) {
  let x1 = -1e9, y1 = -1e9, z1 = -1e9, z0 = 1e9, y0 = 1e9;
  for (const n in b.groups) { const rp = n === 'hull' ? [0, 0, 0] : (b.rp[n] || [0, 0, 0]); for (const p of b.groups[n]) { const a = p.pos; for (let i = 0; i < a.length; i += 3) { const x = a[i] + rp[0], y = a[i + 1] + rp[1], z = a[i + 2] + rp[2]; if (Math.abs(x) > x1) x1 = Math.abs(x); if (y > y1) y1 = y; if (y < y0) y0 = y; if (z > z1) z1 = z; if (z < z0) z0 = z; } } }
  const s = b.sc || 1; return { w: x1 / s, top: y1 / s, bot: y0 / s, f: z1 / s, r: z0 / s };
}
function drone(b, base, tier) {
  const t3 = tier >= 3, acc = t3 ? ACC3 : ACC2, bb = bbox(b), cz = (bb.f + bb.r) / 2, L = bb.f - bb.r, w = Math.min(bb.w, L * 0.6);
  b.g('hull');
  const air = base === 'wingman' || base === 'decoy' || base === 'carrier' || base === 'empcarrier' || base === 'fpv';
  const hy = bb.bot + (bb.top - bb.bot) * (air ? 0.62 : 0.7);
  b.box(w * 0.9, 0.06, L * 0.18, 0, hy + 0.04, cz - L * 0.15, acc); b.box(w * 0.6, 0.05, L * 0.1, 0, hy + 0.04, cz - L * 0.05, acc);                    // marking chevrons
  for (const s of [-1, 1]) b.box(0.1, (bb.top - bb.bot) * 0.28, L * 0.34, s * w * 0.95, bb.bot + (bb.top - bb.bot) * 0.5, cz, t3 ? PLATE3 : PLATE);        // side armor plates
  b.cyl6(0.04, 0.5 + 0.1 * L, w * 0.5, hy + 0.3, cz - L * 0.25, BLACK);
  if (t3) {
    b.box(w * 0.5, 0.07, 0.07, 0, bb.bot + (bb.top - bb.bot) * 0.5, bb.f * 0.98, ACC3);                                                              // glowing sensor bar
    b.sph(Math.min(0.5, w * 0.35), 0, hy + 0.15, cz - L * 0.05, GREYW, 0.8, 0.8); b.box(w * 0.4, 0.04, 0.04, 0, hy + 0.2, cz - L * 0.05, ACC3);       // shield / sensor dome
    for (const s of [-1, 1]) b.cyl6(0.03, 0.7, s * w * 0.55, hy + 0.35, cz - L * 0.3, BLACK);
  }
}

const AIRSET = new Set(Object.keys(AIRK)), INF = new Set(['rifleman', 'at', 'manpads', 'engineer']), GRDRONE = new Set(['robot', 'ewdog', 'sapper', 'repair', 'walker']), AIRDRONE = new Set(['wingman', 'decoy', 'carrier', 'empcarrier']);
export function tierKit(b, base, tier) {
  if (tier < 2) return;
  if (VEH[base]) vehicle(b, VEH[base], tier);
  else if (AIRSET.has(base)) aircraft(b, AIRK[base], tier);
  else if (INF.has(base)) infantry(b, tier);
  else if (GRDRONE.has(base) || AIRDRONE.has(base)) drone(b, base, tier);
}
