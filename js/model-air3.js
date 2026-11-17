// Heavy transports redesigned with lofted bodies: strategic airlifter (also the tanker's base) and the AWACS radar plane.
// Dimensions match the old boxy models so tier kits, hard points and selection circles still line up.
import { C, T, PI, H } from './model-core.js';
const { DARK2, GREY, METAL, BLACK, WHITE, GLASS, ORANGE, RED, CYAN } = C;
const SKIN = [[0x8d97a1, 0x68717b], [0x474e56, 0x30363d], [0xe9eef3, 0xa9b4c1]], GLOW = 0x55e6ff, GLASS2 = 0x14283a;
const skin = (tier) => SKIN[Math.min(3, Math.max(1, tier)) - 1];
const nav = (s) => (s < 0 ? 0xff3a2e : 0x3aff6a);
function flares(b, x, y, z, n, k = 1) {
  b.box(0.26 * k, 0.16 * k, (n * 0.16 + 0.1) * k, x, y, z, DARK2);
  for (let i = 0; i < n; i++) b.cyl6(0.055 * k, 0.05 * k, x, y - 0.09 * k, z + (i - (n - 1) / 2) * 0.16 * k, i & 1 ? ORANGE : RED);
}
// turbofan on a pylon: nacelle with intake lip, fan face, hot nozzle ring
function turbofan(b, x, y, z, r, len, col, glow) {
  b.fuse([{ z: z + len / 2, w: r * 0.92, t: r * 0.92, x, y, p: 2.2 }, { z: z + len * 0.35, w: r * 1.05, t: r * 1.05, x, y }, { z: z - len * 0.2, w: r * 0.98, t: r * 0.98, x, y }, { z: z - len / 2, w: r * 0.72, t: r * 0.72, x, y }], col, 14);
  b.cyl(r * 0.8, 0.12, x, y, z + len / 2 + 0.02, BLACK, [PI / 2, 0, 0]); b.cyl(r * 0.28, 0.2, x, y, z + len / 2 + 0.06, 0x6c737b, [PI / 2, 0, 0]);
  b.cyl(r * 0.66, 0.12, x, y, z - len / 2 - 0.02, glow ? 0x7ce8ff : 0x2a1c16, [PI / 2, 0, 0]);
  b.box(r * 0.3, y > 0.2 ? 1.3 : 0.9, len * 0.5, x, y + r * 1.0, z + 0.2, GREY);
}

function airlifter(b, tier = 1) {
  const [top, bot] = skin(tier), t3 = tier === 3;
  // fuselage: bulbous nose, constant barrel, upswept tail with the rear ramp
  b.fuse([{ z: 19.4, w: 0.05, t: 0.05, bt: 0.05, y: -0.1 }, { z: 18.2, w: 0.9, t: 0.9, bt: 0.8, y: -0.1 }, { z: 15.5, w: 2.3, t: 2.4, bt: 2.1, y: 0 }, { z: 11.5, w: 3.0, t: 3.0, bt: 2.9, y: 0 }, { z: 0, w: 3.05, t: 3.05, bt: 3.0, y: 0 }, { z: -9, w: 3.05, t: 3.0, bt: 3.0, y: 0 }, { z: -14, w: 2.6, t: 2.9, bt: 2.4, y: 0.3 }, { z: -19, w: 1.2, t: 2.0, bt: 0.8, y: 1.2 }, { z: -19.6, w: 0.9, t: 1.4, bt: 0.5, y: 1.4 }], [top, bot], 20);
  b.fuse([{ z: 15.2, w: 0.1, t: 0.05, y: 1.6 }, { z: 14.0, w: 1.6, t: 1.1, bt: 0.1, y: 1.75, p: 2.4 }, { z: 12.0, w: 1.9, t: 1.2, bt: 0.1, y: 1.85 }, { z: 10.2, w: 0.2, t: 0.05, y: 1.9 }], t3 ? 0x0d2a3a : GLASS2, 12);   // flight-deck glazing
  b.box(2.0, 0.08, 6.0, 0, -2.8, -14.5, DARK2); H.boltLine(b, -1.5, -2.9, -18, -1.5, -2.9, -11, 7, 0.08); H.boltLine(b, 1.5, -2.9, -18, 1.5, -2.9, -11, 7, 0.08);   // ramp seams
  for (let i = 0; i < 9; i++) b.box(6.12, 0.1, 0.1, 0, 0.3, 9 - i * 2.4, 0x7d858d);                                                                             // panel rings
  b.box(0.1, 0.1, 22, 3.05, 0.9, -1, 0x7d858d); b.box(0.1, 0.1, 22, -3.05, 0.9, -1, 0x7d858d);                                                                  // belt line
  b.box(2.8, 0.7, 11.0, 0, 3.2, -1.0, top);  H.vent(b, 0, 3.6, -3.0, 1.4, 1.6, 5); H.antenna(b, 0, 3.6, 5.0, 0.8); H.antenna(b, 0, 3.6, -8.0, 0.6);   // spine fairing
  b.sph6(0.35, 0, -2.9, 17.0, 0x1d2630);
  for (const s of [-1, 1]) {
    // high swept wing with drooping tip
    b.wing([{ x: s * 3.0, z: 4.6, c: 10.5, y: 2.7, t: 0.55 }, { x: s * 12.0, z: -0.5, c: 7.2, y: 2.6, t: 0.4 }, { x: s * 26.2, z: -5.4, c: 3.4, y: 2.75, t: 0.14 }], [top, bot]);
    b.wing([{ x: s * 3.0, z: -15.5, c: 5.2, y: 11.3, t: 0.2 }, { x: s * 9.0, z: -18.0, c: 2.8, y: 11.3, t: 0.1 }], [top, bot]);   // T-tail stabiliser
    for (const ex of [9.0, 17.5]) { const z = ex > 12 ? -1.2 : 1.2; turbofan(b, s * ex, 1.0, z + 0.8, 1.15, 5.0, [top, bot], t3); }
    // main gear sponsons with a bogie row
    b.fuse([{ z: 3.6, w: 0.9, t: 1.0, bt: 1.0, x: s * 3.9, y: -2.4, p: 2.4 }, { z: -0.5, w: 1.05, t: 1.1, bt: 1.1, x: s * 3.9, y: -2.4 }, { z: -6.2, w: 0.7, t: 0.7, bt: 0.7, x: s * 3.9, y: -2.4 }], [top, bot], 12);
    b.box(0.35, 1.1, 0.35, s * 3.9, -3.5, -2.4, METAL); for (const z of [-5.2, -3.2, 0.8, 2.8]) b.wheel(0.8, 0.6, s * 3.9, -4.0, z);
    b.box(0.25, 0.3, 0.6, s * 26.2, 2.8, -5.0, nav(s)); H.boltLine(b, s * 4, 3.05, 1, s * 22, 2.95, -4, 9, 0.07);
    // flare banks (Mk I = visible), under the wing roots and on the tail cone
    flares(b, s * 5.2, 2.15, -1.5, 8, 1.5); flares(b, s * 1.6, -1.2, -11.5, 6, 1.4); flares(b, s * 4.2, 2.15, 1.2, 5, 1.2);
  }
  b.fuse([{ z: -13.6, w: 0.12, t: 2.0, bt: 0.1, y: 3.4 }, { z: -17.0, w: 0.2, t: 9.4, bt: 0.1, y: 3.4 }, { z: -20.0, w: 0.12, t: 8.2, bt: 0.1, y: 3.4 }], [top, bot], 6);
  b.box(0.52, 1.6, 3.0, 0, 11.0, -19.0, T); b.box(0.16, 0.5, 0.5, 0, 12.0, -19.4, 0xd0d6dc);                                                              // fin cap
  if (t3) { b.box(0.08, 0.06, 28, 3.08, 0.2, -1, GLOW); b.box(0.08, 0.06, 28, -3.08, 0.2, -1, GLOW); }
  b.box(0.3, 1.6, 0.3, 0, -3.0, 12.0, METAL); b.wheel(0.6, 0.45, -0.4, -3.9, 12.0); b.wheel(0.6, 0.45, 0.4, -3.9, 12.0);
  b.box(0.8, 0.12, 2.6, 0, 3.55, 4.0, 0xe4e8ec); b.box(0.9, 0.05, 1.6, 0, 3.6, 4.0, T);
}

function awacs(b, tier = 1) {
  const [, bot] = skin(tier), top = tier === 1 ? 0xd9dee3 : skin(tier)[0], t3 = tier === 3;
  b.fuse([{ z: 14.7, w: 0.05, t: 0.05, bt: 0.05, y: -0.1 }, { z: 13.6, w: 0.8, t: 0.8, bt: 0.7, y: -0.1 }, { z: 11, w: 1.8, t: 1.9, bt: 1.7 }, { z: 7, w: 2.2, t: 2.2, bt: 2.1 }, { z: -4, w: 2.2, t: 2.2, bt: 2.1 }, { z: -10, w: 1.8, t: 1.9, bt: 1.6, y: 0.2 }, { z: -15, w: 0.8, t: 1.4, bt: 0.5, y: 0.8 }, { z: -15.4, w: 0.5, t: 1.0, bt: 0.3, y: 0.9 }], [top, bot], 18);
  b.fuse([{ z: 11.6, w: 0.1, t: 0.05, y: 1.0 }, { z: 10.4, w: 1.2, t: 0.9, bt: 0.1, y: 1.1, p: 2.4 }, { z: 8.6, w: 1.4, t: 0.95, bt: 0.1, y: 1.3 }, { z: 7.2, w: 0.2, t: 0.05, y: 1.4 }], t3 ? 0x0d2a3a : GLASS2, 12);
  for (let i = 0; i < 7; i++) b.box(4.42, 0.08, 0.1, 0, 0.5, 8.0 - i * 3.0, 0xaab2ba);
  for (const s of [-1, 1]) {
    b.wing([{ x: s * 2.0, z: 3.4, c: 7.8, y: 0.3, t: 0.5 }, { x: s * 9.0, z: -0.8, c: 5.0, y: 0.5, t: 0.34 }, { x: s * 17.5, z: -3.6, c: 2.6, y: 0.8, t: 0.1 }], [top, bot]);
    b.wing([{ x: s * 1.4, z: -10.5, c: 4.0, y: 0.9, t: 0.14 }, { x: s * 6.4, z: -13.2, c: 2.0, y: 1.0, t: 0.08 }], [top, bot]);
    b.wing([{ x: 0, z: -9.4, c: 4.4, y: 0, t: 0.14 }, { x: 0.5, z: -13.4, c: 2.0, y: 0, t: 0.08 }], [top, bot], (x, y, z) => [s * (1.0 + y), 1.0 + x * 5.2, z]);   // twin canted fins
    for (const ex of [5.4, 10.6]) { const z = ex > 8 ? -0.2 : 1.0; turbofan(b, s * ex, -0.35, z, 0.95, 3.8, [top, bot], t3); }
    b.fuse([{ z: 0.6, w: 0.7, t: 0.7, bt: 0.7, x: s * 2.7, y: -2.0 }, { z: -2, w: 0.8, t: 0.8, bt: 0.8, x: s * 2.7, y: -2.0 }, { z: -5.2, w: 0.5, t: 0.5, bt: 0.5, x: s * 2.7, y: -2.0 }], [top, bot], 12);
    b.wheel(0.6, 0.42, s * 2.7, -2.8, -0.5); b.wheel(0.6, 0.42, s * 2.7, -2.8, -2.0);
    b.box(0.22, 0.28, 0.5, s * 17.8, 0.9, -3.4, nav(s)); flares(b, s * 3.4, -0.2, -2.4, 6, 1.3);
    b.box(0.3, 2.9, 0.7, s * 0.9, 3.2, -2.5, GREY, [0, 0, s * 0.12]);   // radome pylons
  }
  b.box(0.2, 1.4, 0.2, 0, -2.0, 8.0, METAL); b.wheel(0.42, 0.3, 0, -2.8, 8.0);
  b.g('rotor').at(0, 5.0, -2.5);
  b.cyl(3.7, 0.9, 0, 5.0, -2.5, 0xe8ecef); b.cyl(3.5, 0.3, 0, 5.55, -2.5, 0xd0d6dc); b.cyl(3.5, 0.3, 0, 4.45, -2.5, 0xd0d6dc);
  b.box(7.2, 0.3, 0.12, 0, 5.0, -2.5, t3 ? GLOW : ORANGE); b.box(0.2, 0.3, 0.9, 3.4, 5.0, -2.5, T);
}
export const AIR3 = { airlifter, awacs };
