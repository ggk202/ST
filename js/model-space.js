// Hard sci-fi space hardware: tower ships (crew module behind a shadow shield, long truss spine, insulated propellant tanks,
// reactor + engine aft, big glowing radiator panels) and satellites. Bow is +Z, engine -Z.
//   Mk I   = gold multi-layer insulation, rigid radiator panels
//   Mk II  = radar-absorbent faceted black hull, hotter radiators
//   Mk III = RAM hull with glowing seams and liquid-droplet radiators (emitter booms, droplet curtains, collector troughs), magnetic nozzle
import { C, T, PI, H } from './model-core.js';
const { DARK2, STEEL, METAL, BLACK, WHITE, GLASS, ORANGE, RED, CYAN } = C;
const MLI = [0xd7b45a, 0xa4812f], RAM = [0x2d3139, 0x15181c], TRUSS = 0x8a929b, PLASMA = 0xb9ecff, SOLAR = 0x1b2f55, SOLAR2 = 0x28437a;
const HOT = [0xffe08a, 0xffa23a, 0xe8611f, 0xb53d17, 0x7c2a14];
const skin = (tier) => (tier === 1 ? MLI : RAM), pp = (tier) => (tier === 1 ? 2.2 : 1.6);
const ringBoxes = (b, z, R, n, w, h, d, col) => { for (let i = 0; i < n; i++) { const a = i / n * PI * 2; b.box(w, h, d, Math.cos(a) * R, Math.sin(a) * R, z, col, [0, 0, a + PI / 2]); } };

function truss(b, z0, z1, w, col = TRUSS) {
  const lo = Math.min(z0, z1), hi = Math.max(z0, z1), L = hi - lo;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) b.box(0.13, 0.13, L, sx * w / 2, sy * w / 2, lo + L / 2, col);
  const n = Math.max(1, Math.round(L / 1.6));
  for (let i = 0; i <= n; i++) { const z = lo + L * i / n; b.box(w, 0.1, 0.1, 0, w / 2, z, col); b.box(w, 0.1, 0.1, 0, -w / 2, z, col); b.box(0.1, w, 0.1, w / 2, 0, z, col); b.box(0.1, w, 0.1, -w / 2, 0, z, col); }
}
// insulated propellant tank with domed ends and retaining bands
function tank(b, z, len, r, tier) {
  b.fuse([{ z: z + len / 2, w: r * 0.55, t: r * 0.55 }, { z: z + len / 2 - r * 0.45, w: r, t: r, p: pp(tier) }, { z: z - len / 2 + r * 0.45, w: r, t: r, p: pp(tier) }, { z: z - len / 2, w: r * 0.55, t: r * 0.55 }], skin(tier), tier === 1 ? 16 : 10);
  for (const f of [-0.28, 0.28]) b.cyl(r * 1.03, 0.14, 0, 0, z + f * len, tier === 3 ? 0x2f6f88 : STEEL, [PI / 2, 0, 0]);
  if (tier === 3) b.box(0.06, 0.06, len * 0.8, r * 0.98, 0, z, PLASMA);
}
function shield(b, z, R, tier) {
  b.cyl(R, 0.22, 0, 0, z, tier === 1 ? 0xaab0b8 : 0x20242a, [PI / 2, 0, 0]); b.cyl(R * 0.72, 0.3, 0, 0, z - 0.08, tier === 1 ? 0x7d858e : 0x30353c, [PI / 2, 0, 0]);
  b.cyl(R * 1.01, 0.1, 0, 0, z + 0.12, T, [PI / 2, 0, 0]);
}
function crewModule(b, z, r, len, tier) {
  b.fuse([{ z: z + len / 2, w: r * 0.25, t: r * 0.25 }, { z: z + len / 2 - 0.5, w: r * 0.8, t: r * 0.8, p: pp(tier) }, { z, w: r, t: r, p: pp(tier) }, { z: z - len / 2, w: r * 0.95, t: r * 0.95, p: pp(tier) }], skin(tier), tier === 1 ? 16 : 10);
  b.box(r * 1.1, 0.1, 0.35, 0, r * 0.97, z + len * 0.15, tier === 3 ? PLASMA : CYAN); b.box(r * 0.5, 0.1, 0.3, 0, -r * 0.97, z + len * 0.1, DARK2);
  b.cyl(r * 1.03, 0.3, 0, 0, z - len * 0.2, T, [PI / 2, 0, 0]);
  b.cyl6(0.05, r * 1.3, 0, 0, z + len / 2 + r * 0.6, 0x2a2d31, [PI / 2, 0, 0]); b.sph6(0.14, 0, 0, z + len / 2 + r * 1.25, CYAN);
  H.antenna(b, r * 0.55, r * 0.8, z - len * 0.3, r * 0.9);
}
function rcs(b, x, y, z, k = 1) {
  b.box(0.3 * k, 0.3 * k, 0.5 * k, x, y, z, DARK2);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.cone(0.08 * k, 0.22 * k, x + dx * 0.22 * k, y + dy * 0.22 * k, z, STEEL, [dy ? dy * PI / 2 : 0, 0, dx ? -dx * PI / 2 : 0]);
}
function engine(b, z, r, tier) {
  b.cyl(r * 0.95, r * 2.2, 0, 0, z, 0x3a3f46, [PI / 2, 0, 0]);
  for (let i = 0; i < 4; i++) b.cyl(r * 1.18, 0.1, 0, 0, z + r - i * r * 0.55, STEEL, [PI / 2, 0, 0]);
  b.cyl(r * 0.5, 0.5, 0, 0, z + r * 1.3, DARK2, [PI / 2, 0, 0]);
  const zb = z - r * 2.1; b.cone(r * 1.55, r * 2.0, 0, 0, zb, tier === 1 ? 0x59606a : 0x24282e, [PI / 2, 0, 0]);
  b.cyl(r * 1.58, 0.14, 0, 0, zb - r, STEEL, [PI / 2, 0, 0]);
  b.cyl(r * 1.2, 0.08, 0, 0, zb - r * 0.92, tier === 3 ? PLASMA : tier === 2 ? 0xffc260 : 0xff8a3a, [PI / 2, 0, 0]);
  if (tier === 3) for (let i = 0; i < 3; i++) ringBoxes(b, zb - r * 0.1 - i * r * 0.55, r * (1.7 + i * 0.18), 12, r * 0.8, 0.16, 0.2, 0x4fc8ff);
}
// rigid radiator: panel segments shaded from white-hot at the root to dull red at the tip
function radPanel(b, s, x0, x1, y, z, len, tier) {
  const n = 5, seg = (x1 - x0) / n, fr = tier === 1 ? STEEL : RAM[0];
  for (let i = 0; i < n; i++) b.box(seg * 0.97, 0.07, len, s * (x0 + seg * (i + 0.5)), y, z, HOT[tier === 1 ? i : Math.max(0, i - 1)]);
  for (let i = 0; i <= 2; i++) b.box(x1 - x0, 0.11, 0.12, s * (x0 + x1) / 2, y + 0.03, z - len / 2 + i * len / 2, fr);
  b.box(0.12, 0.12, len + 0.2, s * x1, y, z, fr); b.box(x1 + 0.2, 0.16, 0.16, s * x1 / 2, y, z, TRUSS);
}
// liquid droplet radiator: emitter boom + droplet curtain + collector trough
function ldr(b, s, x0, reach, y, z, len) {
  const xc = s * (x0 + reach) / 2;
  b.box(reach - x0 + 0.3, 0.16, 0.16, xc, y, z + len / 2, TRUSS); b.box(reach - x0 + 0.3, 0.16, 0.16, xc, y, z - len / 2, TRUSS);
  b.cyl(0.36, 0.9, s * reach, y, z + len / 2, 0x2b3036, [PI / 2, 0, 0]); b.sph6(0.18, s * reach, y, z + len / 2 - 0.5, 0xffe08a);
  b.box(0.7, 2.2, 0.8, s * reach, y, z - len / 2, 0x2b3036); b.box(0.5, 1.9, 0.2, s * reach, y, z - len / 2 + 0.5, 0x6b3a22);
  const rows = 5, cols = 9, h = len - 1.6;
  for (let r = -2; r <= 2; r++) {
    b.box(0.04, 0.04, h, s * reach, y + r * 0.42, z - 0.1, HOT[2]);
    for (let i = 0; i < cols; i++) b.box(0.13, 0.13, 0.24, s * reach, y + r * 0.42, z + len / 2 - 0.9 - i * h / (cols - 1), HOT[Math.min(4, Math.floor(i / 2))]);
  }
}
function pd(b, x, y, z, k, side) {   // point-defence laser turret
  b.cyl6(0.35 * k, 0.3 * k, x, y, z, DARK2); b.barrel(0.08 * k, 0.9 * k, x, y + 0.2 * k, z + 0.1 * k, METAL); b.sph6(0.12 * k, x, y + 0.2 * k, z + 1.0 * k, CYAN);
}
function coilgun(b, y, zRear, zMuzzle, r, tier) {
  const L = zMuzzle - zRear, zc = (zRear + zMuzzle) / 2;
  b.cyl(r, L, 0, y, zc, 0x474d56, [PI / 2, 0, 0]);
  for (let i = 0; i < Math.round(L / 1.7); i++) b.cyl(r * 1.9, 0.26, 0, y, zRear + 0.7 + i * 1.7, tier === 3 ? 0x2f6f88 : STEEL, [PI / 2, 0, 0]);
  b.cyl(r * 1.4, 0.5, 0, y, zMuzzle, DARK2, [PI / 2, 0, 0]); b.cyl(r * 0.6, 0.05, 0, y, zMuzzle + 0.28, tier === 3 ? PLASMA : 0xff8a3a, [PI / 2, 0, 0]);
  b.box(r * 2.4, r * 2.4, 2.2, 0, y, zRear - 0.4, 0x3a3f46);
  for (const z of [zRear + 1, zc, zMuzzle - 2]) b.box(0.15, y, 0.15, 0, y / 2, z, TRUSS);
}

const SHIPS = {
  orbfighter: { bow: 6.5, mr: 0.95, ml: 2.6, tanks: 1, tr: 0.85, tl: 3.0, tw: 1.1, rad: 1, reach: 4.8, rl: 3.0, er: 0.65, gun: 0.17, gl: 7.5, pd: 0, vls: 0, pods: 1 },
  orbcruiser: { bow: 13, mr: 1.5, ml: 4.0, tanks: 2, tr: 1.3, tl: 5.0, tw: 1.9, rad: 2, reach: 8.8, rl: 5.0, er: 1.1, gun: 0.3, gl: 15, pd: 4, vls: 0, pods: 0 },
  orbbattleship: { bow: 20, mr: 2.1, ml: 6.0, tanks: 3, tr: 1.9, tl: 6.0, tw: 2.7, rad: 3, reach: 13, rl: 7.0, er: 1.7, gun: 0.55, gl: 27, pd: 8, vls: 2, pods: 0 },
};
function towerShip(b, tier, o) {
  b.tint = null;
  const zM = o.bow - o.ml / 2, zS = o.bow - o.ml - 0.5, k = o.mr / 1.5;
  crewModule(b, zM, o.mr, o.ml, tier); shield(b, zS, o.mr * 1.25 + 0.3, tier);
  let cur = zS - 0.6;
  const tz = [];
  for (let i = 0; i < o.tanks; i++) { truss(b, cur, cur - 1.8, o.tw); tank(b, cur - 1.8 - o.tl / 2, o.tl, o.tr, tier); tz.push(cur - 1.8 - o.tl / 2); cur -= 1.8 + o.tl; }
  truss(b, cur, cur - 1.8, o.tw); const zE = cur - 1.8 - o.er * 1.1;
  engine(b, zE, o.er, tier);
  // radiators staggered along the tanks
  for (let i = 0; i < o.rad; i++) {
    const z = zS - 2.2 - i * (o.rl + 0.5) - o.rl / 2 + 0.4;
    for (const s of [-1, 1]) { if (tier === 3) ldr(b, s, o.tr + 0.3, o.reach * 0.92, 0, z, o.rl); else radPanel(b, s, o.tr + 0.3, o.reach, 0, z, o.rl, tier); }
  }
  // weapon
  const yg = o.mr + o.gun + 0.25;
  coilgun(b, yg, o.bow + 1.2 - o.gl, o.bow + 1.2, o.gun, tier);
  for (let i = 0; i < o.pd; i++) { const side = i & 1 ? 1 : -1, z = zS - 1.2 - (i >> 1) * ((zS - zE - 4) / Math.max(1, o.pd / 2)); pd(b, side * o.tr * 0.75, o.tr * 0.78, z, k, side); }
  for (let i = 0; i < o.vls; i++) { const s = i ? 1 : -1; b.box(1.2 * k, 1.0 * k, 3.6 * k, s * (o.mr + 0.9 * k), 0, zM - 0.5, tier === 1 ? 0x5c636c : 0x1d2025); for (let j = 0; j < 4; j++) b.box(0.9 * k, 0.06, 0.55 * k, s * (o.mr + 0.9 * k), 0.53 * k, zM - 1.8 * k + j * 0.9 * k, DARK2); }
  for (let i = 0; i < o.pods; i++) for (const s of [-1, 1]) { b.box(0.5, 0.5, 1.8, s * (o.mr + 0.55), -0.3, zM - 0.5, DARK2); b.cone(0.22, 0.6, s * (o.mr + 0.55), -0.3, zM + 0.7, 0x6b6250, [PI / 2, 0, 0]); }
  rcs(b, o.mr + 0.1, 0, zM - o.ml * 0.3, k); rcs(b, -o.mr - 0.1, 0, zM - o.ml * 0.3, k); rcs(b, 0, o.tr + 0.1, zE + o.er * 2.2, k); rcs(b, 0, -o.tr - 0.1, zE + o.er * 2.2, k);
  if (tier >= 2) for (let i = 0; i < o.tanks; i++) for (const s of [-1, 1]) b.wedge(0.5, 0.3, o.tl * 0.8, s * o.tr * 0.97, o.tr * 0.2, tz[i], RAM[1], [0, 0, 0]);   // RAM sawtooth edge strakes
}
const orbfighter = (b, t = 1) => towerShip(b, t, SHIPS.orbfighter);
const orbcruiser = (b, t = 1) => towerShip(b, t, SHIPS.orbcruiser);
const orbbattleship = (b, t = 1) => towerShip(b, t, SHIPS.orbbattleship);

// ---------------------------------------------------------------- satellites
function wings(b, s, x0, n, w, d, y = 0, z = 0) {
  b.box(0.3, 0.3, 0.3, s * x0, y, z, STEEL); b.box(0.7 * n * w, 0.1, 0.16, s * (x0 + 0.35 * n * w), y, z - d / 2 - 0.1, STEEL);
  for (let i = 0; i < n; i++) { const px = s * (x0 + 0.5 + i * (w + 0.08) + w / 2); b.box(w, 0.1, d, px, y, z, i & 1 ? SOLAR2 : SOLAR); for (let k = 1; k < 4; k++) b.box(0.03, 0.12, d, px - w / 2 + k * w / 4, y + 0.01, z, 0x6b8fd0); b.box(w, 0.12, 0.03, px, y + 0.01, z, 0x6b8fd0); }
}
function satbus(b, tier, w = 2.2, h = 2.2, l = 3.0) {
  b.tint = null; const [top, bot] = skin(tier);
  b.fuse([{ z: l / 2, w: w * 0.45, t: h * 0.45, p: pp(tier) }, { z: l / 2 - 0.2, w: w / 2, t: h / 2, p: 3 }, { z: -l / 2 + 0.2, w: w / 2, t: h / 2, p: 3 }, { z: -l / 2, w: w * 0.45, t: h * 0.45, p: pp(tier) }], [top, bot], 12);
  b.cyl(w * 0.52, 0.22, 0, 0, 0, T, [PI / 2, 0, 0]);
}
function satrecon(b, t = 1) {
  satbus(b, t); wings(b, 1, 1.1, 3, 2.2, 1.8); wings(b, -1, 1.1, 3, 2.2, 1.8);
  b.cyl(0.85, 4.6, 0, 0, 3.6, 0x1c2026, [PI / 2, 0, 0]); b.cyl(1.0, 1.6, 0, 0, 5.8, 0x0f1114, [PI / 2, 0, 0]); b.cyl(0.78, 0.06, 0, 0, 6.65, 0x14283a, [PI / 2, 0, 0]);   // telescope + light hood + mirror
  for (let i = 0; i < 3; i++) b.cyl(0.88, 0.1, 0, 0, 2.2 + i * 1.3, STEEL, [PI / 2, 0, 0]);
  radPanel(b, 1, 1.2, 3.8, 1.25, -1.6, 1.8, t); radPanel(b, -1, 1.2, 3.8, 1.25, -1.6, 1.8, t);   // heat-rejection panels
  b.cyl6(0.04, 1.6, 0, 1.9, -1.3, STEEL, [0, 0, 0]); b.cyl(0.6, 0.12, 0, 2.7, -1.3, WHITE, [0.4, 0, 0]);
  b.box(0.3, 0.3, 0.4, 0.6, 1.2, 0.9, DARK2); b.box(0.3, 0.3, 0.4, -0.6, 1.2, 0.9, DARK2); rcs(b, 0, -1.2, -1.2, 0.9);
}
function satsurvey(b, t = 1) {
  satbus(b, t, 2.4, 2.4, 3.4); wings(b, 1, 1.2, 4, 2.6, 2.2); wings(b, -1, 1.2, 4, 2.6, 2.2);
  b.cyl6(0.1, 2.2, 0, 2.0, -0.6, METAL); b.cyl(2.6, 0.12, 0, 3.4, -0.2, 0xdfe3e8, [0.6, 0, 0]); b.cone(2.6, 0.8, 0, 3.1, -0.45, 0xbfc5cc, [0.6 + PI, 0, 0]);   // big mesh dish
  b.cyl6(0.05, 2.4, 0, 3.0, 0.5, METAL, [0.6, 0, 0]); b.sph6(0.22, 0, 4.1, 1.2, CYAN);
  for (let i = 0; i < 6; i++) b.cone(0.3, 0.8, -1.0 + (i % 3) * 1.0, -1.5 + (i >> 1) * 0.0 - 0.1, 2.0 + (i > 2 ? 0.0 : 0.0), 0xc9ced4, [PI / 2, 0, 0]);
  radPanel(b, 1, 1.3, 4.4, -1.35, 0.4, 2.2, t); radPanel(b, -1, 1.3, 4.4, -1.35, 0.4, 2.2, t);
  rcs(b, 0, 1.4, -1.5, 1);
}
function satstrike(b, t = 1) {
  satbus(b, t, 2.4, 2.4, 3.6);
  // rod magazine: bundle of tungsten rods slung under the bus
  for (const x of [-0.8, 0, 0.8]) for (const y of [-2.0, -3.0]) { b.cyl(0.2, 5.4, x, y, 0.2, 0x9a8f75, [PI / 2, 0, 0]); b.cone(0.2, 0.7, x, y, 3.3, 0x6b6250, [PI / 2, 0, 0]); }
  b.box(2.6, 0.2, 5.6, 0, -1.4, 0.2, 0x3a3f46); b.box(2.6, 0.2, 5.6, 0, -3.6, 0.2, 0x3a3f46); for (const z of [-2, 0.2, 2.4]) b.box(0.15, 2.4, 0.15, 1.3, -2.5, z, TRUSS), b.box(0.15, 2.4, 0.15, -1.3, -2.5, z, TRUSS);
  // reactor boom with radiators; small solar array for the bus
  b.cyl(0.6, 2.4, 0, 0, -3.8, 0x3a3f46, [PI / 2, 0, 0]); b.cyl(0.4, 3.0, 0, 0, -6.2, TRUSS, [PI / 2, 0, 0]);
  radPanel(b, 1, 0.9, 4.6, 0, -5.8, 2.6, t); radPanel(b, -1, 0.9, 4.6, 0, -5.8, 2.6, t);
  wings(b, 1, 1.2, 2, 2.0, 2.0, 1.0, 0.4); wings(b, -1, 1.2, 2, 2.0, 2.0, 1.0, 0.4);
  b.cyl(0.4, 0.7, 0, 1.6, 1.0, 0x1c2026, [0, 0, 0]); b.sph6(0.22, 0, 2.1, 1.0, 0xff5a3a); rcs(b, 1.3, 1.2, -1.2, 1);
}
function satkill(b, t = 1) {   // kinetic hunter-killer: seeker head, hydrazine tanks, ring of divert thrusters, capture spikes
  b.tint = null; const [top, bot] = skin(t);
  b.fuse([{ z: 3.4, w: 0.3, t: 0.3 }, { z: 2.6, w: 0.9, t: 0.9, p: pp(t) }, { z: -1.0, w: 1.1, t: 1.1, p: pp(t) }, { z: -2.8, w: 0.7, t: 0.7 }], [top, bot], 12);
  b.sph6(0.32, 0, 0, 3.5, 0xff5a3a); b.cyl(0.45, 0.3, 0, 0, 3.0, BLACK, [PI / 2, 0, 0]);
  for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { b.sph6(0.5, x * 1.3, y * 1.3, 0.2, 0xd8dde3); b.cyl6(0.14, 1.0, x * 1.15, y * 1.15, 1.6, DARK2, [PI / 2, 0, 0]); b.cone(0.18, 0.4, x * 1.15, y * 1.15, -0.7, STEEL, [-PI / 2, 0, 0]); b.box(Math.abs(x) ? 1.3 : 0.1, Math.abs(y) ? 1.3 : 0.1, 0.1, x * 1.2, y * 1.2, 1.0, TRUSS); }
  for (const s of [-1, 1]) { wings(b, s, 1.0, 2, 1.4, 1.0, 0, -1.6); }
  b.cyl(0.4, 0.7, 0, 0, -3.1, 0x3a3f46, [PI / 2, 0, 0]); b.cyl(0.32, 0.06, 0, 0, -3.5, PLASMA, [PI / 2, 0, 0]);
  b.cyl(1.12, 0.2, 0, 0, -0.2, T, [PI / 2, 0, 0]);
}

// ---------------------------------------------------------------- orbital shipyard: spine truss, spinning habitat wheel, radiator wings, ship cradle
function orbyard(b, t = 1) {
  b.tint = null; const [top, bot] = skin(t);
  truss(b, -10, 11, 2.6);
  b.fuse([{ z: 11.6, w: 0.5, t: 0.5 }, { z: 10.6, w: 1.5, t: 1.5, p: pp(t) }, { z: 7.6, w: 1.7, t: 1.7, p: pp(t) }, { z: 7.0, w: 1.0, t: 1.0 }], [top, bot], 14);
  b.cyl(1.72, 0.3, 0, 0, 8.4, T, [PI / 2, 0, 0]); b.sph6(0.2, 0, 0, 12.3, CYAN);
  // habitat wheel
  const zw = 3.0; ringBoxes(b, zw, 6.2, 18, 2.2, 1.2, 2.2, t === 1 ? 0xc7ccd2 : 0x2a2e35); ringBoxes(b, zw, 6.9, 18, 2.2, 0.18, 1.6, CYAN);
  for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2 + 0.4; b.box(0.35, 6.0, 0.35, Math.cos(a) * 3.1, Math.sin(a) * 3.1, zw, TRUSS, [0, 0, a - PI / 2]); }
  b.cyl(1.0, 1.4, 0, 0, zw, 0x59606a, [PI / 2, 0, 0]);
  // radiator wings aft of the wheel
  for (const s of [-1, 1]) {
    for (const z of [-3.0, -7.4]) { if (t === 3) ldr(b, s, 2.0, 13, 0, z, 3.6); else radPanel(b, s, 2.0, 14, 0, z, 3.6, t); }
    wings(b, s, 2.0, 4, 3.0, 4.4, 0, -1.0 + 5.0);
  }
  // build cradle: open frame with a half-built hull inside
  b.box(0.3, 0.3, 9, 3.4, 0, -4.5, TRUSS); b.box(0.3, 0.3, 9, -3.4, 0, -4.5, TRUSS);
  tank(b, -5.2, 4.6, 1.1, t);
  b.cyl(1.1, 1.0, 0, 0, -9.8, 0x3a3f46, [PI / 2, 0, 0]); b.cone(1.5, 1.8, 0, 0, -11.0, 0x24282e, [PI / 2, 0, 0]); b.cyl(1.2, 0.08, 0, 0, -11.9, 0xff8a3a, [PI / 2, 0, 0]);
  b.box(3, 0.6, 3.5, 0, 2.2, -2.0, T); rcs(b, 1.6, 0, 9.0, 1); rcs(b, -1.6, 0, 9.0, 1);
}
export const SPACE = { orbfighter, orbcruiser, orbbattleship, satrecon, satsurvey, satstrike, satkill, orbyard };
