// Smooth, generation-aware aircraft: lofted fuselages and aerofoil wings instead of boxes.
//   Mk I   = 4th generation  (conventional round body, twin fins, external pylons, visible flare / chaff dispensers)
//   Mk II  = 5th generation  (faceted low-observable body, canted tails, internal bays with door seams, flush decoy ports)
//   Mk III = futuristic      (blended flying wing, no tails, glowing energy seams, slot exhausts, sensor blister)
import { C, T, PI, H } from './model-core.js';
const { DARK, DARK2, GREY, METAL, STEEL, BLACK, WHITE, GLASS, LAMP, CYAN, RUB, ORANGE, RED } = C;
const SKIN = [[0x8d97a1, 0x68717b], [0x474e56, 0x30363d], [0xe9eef3, 0xa9b4c1]];   // top / belly per generation
const skin = (tier) => SKIN[Math.min(3, Math.max(1, tier)) - 1];
const GLOW = 0x55e6ff, GLASS2 = 0x14283a;

// flare / chaff dispenser: housing with a row of orange-capped cartridges (tubes face down / out)
function flareRack(b, x, y, z, n, k = 1, dirY = -1, col = DARK2) {
  b.box(0.26 * k, 0.16 * k, (n * 0.16 + 0.1) * k, x, y, z, col);
  for (let i = 0; i < n; i++) b.cyl6(0.055 * k, 0.05 * k, x, y + dirY * 0.09 * k, z + (i - (n - 1) / 2) * 0.16 * k, i & 1 ? ORANGE : RED);
}
// engine nozzle: thick barrel ring + hot inner
function nozzle(b, x, y, z, r, len, glow) {
  b.cyl(r, len, x, y, z, 0x3a3f46, [PI / 2, 0, 0]); b.cyl(r * 1.06, len * 0.3, x, y, z - len * 0.5, 0x5a4a40, [PI / 2, 0, 0]);
  b.cyl(r * 0.78, 0.1, x, y, z - len * 0.5 - 0.03, glow ? 0x7ce8ff : 0x1a1210, [PI / 2, 0, 0]);
}
function wheelLeg(b, x, y, z, h, r) { b.box(0.08, h, 0.1, x, y - h / 2, z, METAL); b.wheel(r, r * 0.6, x, y - h - r * 0.4, z); }

function fighter(b, tier = 1) {
  const [top, bot] = skin(tier);
  if (tier === 1) {
    // ---- 4th generation: round-section body, twin canted fins, side intakes, twin nozzles
    b.fuse([{ z: 5.9, w: 0.02, t: 0.02, bt: 0.02 }, { z: 5.2, w: 0.2, t: 0.2, y: 0.0 }, { z: 4.2, w: 0.42, t: 0.4, bt: 0.34 }, { z: 3.0, w: 0.58, t: 0.5, bt: 0.42 }, { z: 1.4, w: 0.82, t: 0.56, bt: 0.58, p: 2.6 }, { z: -0.6, w: 1.05, t: 0.56, bt: 0.62, p: 2.9 }, { z: -2.6, w: 1.0, t: 0.5, bt: 0.55, p: 2.8 }, { z: -4.0, w: 0.82, t: 0.4, bt: 0.42, p: 2.6 }, { z: -4.4, w: 0.7, t: 0.34, bt: 0.36 }], [top, bot], 16);
    b.fuse([{ z: 3.4, w: 0.04, t: 0.04, y: 0.52 }, { z: 3.0, w: 0.26, t: 0.2, bt: 0.05, y: 0.52 }, { z: 1.9, w: 0.4, t: 0.46, bt: 0.05, y: 0.52 }, { z: 0.6, w: 0.42, t: 0.38, bt: 0.05, y: 0.55 }, { z: -0.6, w: 0.26, t: 0.2, bt: 0.05, y: 0.55 }, { z: -1.1, w: 0.04, t: 0.04, y: 0.55 }], GLASS2, 12);   // bubble canopy
    b.box(0.5, 0.05, 0.05, 0, 0.55, 3.0, DARK2);
    for (const s of [-1, 1]) {
      b.fuse([{ z: 2.4, w: 0.5, t: 0.46, bt: 0.46, x: s * 0.75, y: -0.1, p: 3.4 }, { z: 1.0, w: 0.55, t: 0.5, bt: 0.5, x: s * 0.75, y: -0.1, p: 3.2 }, { z: -1.0, w: 0.6, t: 0.55, bt: 0.55, x: s * 0.8, y: -0.1, p: 3 }], [top, bot], 10);   // intake trunks
      b.box(0.82, 0.8, 0.08, s * 0.78, -0.1, 2.42, BLACK); b.box(0.9, 0.04, 0.3, s * 0.78, 0.34, 2.5, DARK2);                  // intake mouth + ramp lip
      b.fuse([{ z: -1.4, w: 0.5, t: 0.5, x: s * 0.5, y: 0.0 }, { z: -3.2, w: 0.5, t: 0.5, x: s * 0.5, y: 0.0 }, { z: -4.5, w: 0.46, t: 0.46, x: s * 0.5, y: 0.0 }], [top, bot], 12);
      nozzle(b, s * 0.5, 0, -4.4, 0.46, 0.8, false);
      // wing, stabilator, twin canted fin
      b.wing([{ x: s * 0.9, z: 0.9, c: 3.8, y: -0.12, t: 0.1 }, { x: s * 2.6, z: -0.4, c: 2.6, y: -0.14, t: 0.075 }, { x: s * 5.0, z: -1.8, c: 1.15, y: -0.14, t: 0.035 }], [top, bot]);
      b.wing([{ x: s * 0.9, z: -3.0, c: 1.9, y: -0.05, t: 0.06 }, { x: s * 3.0, z: -4.1, c: 1.0, y: -0.08, t: 0.03 }], [top, bot]);
      b.wing([{ x: 0, z: -2.2, c: 2.3, y: 0, t: 0.06 }, { x: 0.5, z: -3.6, c: 1.1, y: 0, t: 0.035 }], [top, bot], (x, y, z) => [s * (0.9 + y + x * 0.4), 0.45 + x * 3.0, z]);
      b.box(0.08, 0.5, 1.0, s * 1.25, 1.98, -3.75, T, [0, 0, s * -0.3]);                                                           // fin cap in team colour
      b.box(0.5, 0.05, 0.3, s * 5.05, -0.1, -1.7, s < 0 ? 0xff3a2e : 0x3aff6a);                                                        // nav light
      b.box(0.1, 0.08, 1.8, s * 5.05, -0.2, -1.2, DARK2);                                                                              // AAM rail
      b.box(0.9, 0.05, 0.9, s * 2.4, -0.06, -0.3, 0xb3bac2);                                                                          // wing panel
      // 4th-gen defensive aids: big visible flare / chaff dispenser rows on the fuselage flanks and under the tail
      flareRack(b, s * 1.0, -0.62, -2.6, 6, 1.1); flareRack(b, s * 1.55, -0.62, -3.3, 4, 1.1);
      flareRack(b, s * 0.35, 0.58, -3.1, 4, 1, 1); b.box(0.16, 0.2, 0.3, s * 0.6, 0.56, 0.2, DARK2);                                   // dorsal rack + MAWS
      wheelLeg(b, s * 0.95, -0.55, -0.6, 0.55, 0.3);
    }
    b.cyl6(0.03, 0.7, 0, 0.0, 5.7, 0x2a2d31, [PI / 2, 0, 0]); b.sph6(0.16, 0, -0.62, 2.8, 0x1d2630); b.box(0.5, 0.06, 1.0, 0, 0.58, -0.2, 0xb3bac2);   // pitot, IRST, spine panel
    wheelLeg(b, 0, -0.5, 3.0, 0.5, 0.22); H.antenna(b, 0, 0.55, -1.2, 0.35);
    b.box(0.2, 0.14, 0.7, 0, -0.63, -1.2, METAL);
  } else if (tier === 2) {
    // ---- 5th generation: faceted chined body, diamond intakes, canted tails, internal bays
    b.fuse([{ z: 6.0, w: 0.02, t: 0.02, bt: 0.02, p: 1.6 }, { z: 5.0, w: 0.35, t: 0.2, bt: 0.2, p: 1.5 }, { z: 3.6, w: 0.8, t: 0.34, bt: 0.34, p: 1.45 }, { z: 1.6, w: 1.1, t: 0.5, bt: 0.5, p: 1.5 }, { z: -0.6, w: 1.3, t: 0.5, bt: 0.52, p: 1.7 }, { z: -2.8, w: 1.15, t: 0.46, bt: 0.48, p: 1.9 }, { z: -4.4, w: 0.9, t: 0.36, bt: 0.38, p: 2.4 }, { z: -4.7, w: 0.8, t: 0.3, bt: 0.32, p: 2.4 }], [top, bot], 12);
    b.fuse([{ z: 3.8, w: 0.04, t: 0.04, y: 0.34 }, { z: 3.4, w: 0.34, t: 0.2, bt: 0.05, y: 0.34, p: 1.7 }, { z: 2.0, w: 0.46, t: 0.42, bt: 0.05, y: 0.4, p: 1.8 }, { z: 0.3, w: 0.4, t: 0.3, bt: 0.05, y: 0.46, p: 1.8 }, { z: -0.9, w: 0.1, t: 0.08, y: 0.46 }], 0x1b2c3b, 10);   // faceted canopy
    // large blended strake-wings and all-moving tailplanes
    b.wingPair([{ x: 0.7, z: 3.8, c: 8.4, y: -0.08, t: 0.1 }, { x: 1.9, z: 0.5, c: 4.9, y: -0.1, t: 0.08 }, { x: 4.7, z: -2.1, c: 1.7, y: -0.1, t: 0.035 }], [top, bot]);
    b.wingPair([{ x: 1.0, z: -3.0, c: 2.0, y: -0.05, t: 0.06 }, { x: 3.0, z: -4.5, c: 1.2, y: -0.08, t: 0.03 }], [top, bot]);
    for (const s of [-1, 1]) {
      b.wing([{ x: 0, z: -2.3, c: 2.5, y: 0, t: 0.06 }, { x: 0.5, z: -4.0, c: 1.2, y: 0, t: 0.035 }], [top, bot], (x, y, z) => [s * (1.25 + y + x * 0.9), 0.4 + x * 3.0, z]);   // heavily canted tails
      b.box(0.06, 0.4, 0.8, s * (1.25 + 1.5 * 0.9 * 0.5 + 0.1), 1.92, -3.9, T, [0, 0, s * -0.55]);
      // diamond intakes under the cheeks + flat sawtooth nozzles
      b.box(0.8, 0.6, 0.1, s * 0.95, -0.05, 2.2, BLACK, [0, 0, 0]); b.box(0.9, 0.05, 0.25, s * 0.95, 0.27, 2.3, DARK2);
      b.wing([{ x: s * 0.2, z: -4.5, c: 0.5, y: 0, t: 0.28 }, { x: s * 1.2, z: -4.7, c: 0.4, y: 0, t: 0.28 }], 0x2a2d31);
      nozzle(b, s * 0.55, 0.0, -4.7, 0.42, 0.5, false);
      // internal bay door seams + flush decoy ports (cartridges visible as orange dots)
      b.box(0.04, 0.03, 3.0, s * 0.42, -0.53, 0.7, 0x14171b); b.box(0.04, 0.03, 1.4, s * 1.0, -0.5, -1.2, 0x14171b);
      for (let i = 0; i < 6; i++) b.box(0.1, 0.03, 0.1, s * (1.05 + (i % 2) * 0.12), -0.5, -2.4 - i * 0.16, i % 2 ? ORANGE : RED);
      for (let i = 0; i < 4; i++) b.box(0.1, 0.03, 0.1, s * 0.25, 0.48, -2.6 - i * 0.2, ORANGE);
      b.box(0.3, 0.04, 0.5, s * 4.95, -0.07, -2.0, s < 0 ? 0xff3a2e : 0x3aff6a);
      wheelLeg(b, s * 1.0, -0.5, -0.8, 0.5, 0.28);
    }
    b.box(1.0, 0.03, 0.04, 0, -0.52, 1.3, 0x14171b); b.box(0.04, 0.03, 2.4, 0, -0.52, 1.1, 0x14171b); b.sph6(0.2, 0, -0.52, 4.2, 0x1d2630);
    b.cyl6(0.025, 0.5, 0, 0.0, 6.1, 0x2a2d31, [PI / 2, 0, 0]);
    wheelLeg(b, 0, -0.5, 3.0, 0.5, 0.22);
  } else {
    // ---- futuristic: tailless blended flying wing, glowing seams, slot exhaust
    b.fuse([{ z: 6.2, w: 0.02, t: 0.02, bt: 0.02 }, { z: 5.2, w: 0.42, t: 0.2, bt: 0.18, p: 2.4 }, { z: 3.4, w: 1.0, t: 0.38, bt: 0.3, p: 2.6 }, { z: 0.5, w: 1.7, t: 0.46, bt: 0.34, p: 2.8 }, { z: -2.5, w: 2.0, t: 0.38, bt: 0.28, p: 3 }, { z: -4.2, w: 1.5, t: 0.2, bt: 0.16, p: 3 }, { z: -4.5, w: 1.2, t: 0.1, bt: 0.1 }], [top, bot], 18);
    b.wingPair([{ x: 1.0, z: 3.4, c: 8.2, y: 0, t: 0.24 }, { x: 3.0, z: -0.2, c: 5.0, y: 0, t: 0.16 }, { x: 5.4, z: -3.0, c: 1.9, y: 0, t: 0.05 }], [top, bot]);
    b.fuse([{ z: 4.2, w: 0.04, t: 0.04, y: 0.2 }, { z: 3.6, w: 0.34, t: 0.3, bt: 0.0, y: 0.26, p: 2.2 }, { z: 1.8, w: 0.46, t: 0.44, bt: 0.0, y: 0.36, p: 2.1 }, { z: -0.4, w: 0.3, t: 0.2, bt: 0.0, y: 0.4 }, { z: -1.2, w: 0.04, t: 0.04, y: 0.4 }], 0x0d2a3a, 12);   // sensor blister
    for (const s of [-1, 1]) {
      // glowing leading-edge strips and wing seams
      b.wing([{ x: s * 1.0, z: 3.4, c: 0.5, y: 0.0, t: 0.25 }, { x: s * 3.0, z: -0.2, c: 0.35, y: 0, t: 0.17 }, { x: s * 5.4, z: -3.0, c: 0.25, y: 0, t: 0.055 }], GLOW);
      b.wing([{ x: s * 1.0, z: -2.4, c: 0.22, y: 0.0, t: 0.25 }, { x: s * 3.0, z: -3.0, c: 0.2, y: 0, t: 0.17 }, { x: s * 5.0, z: -4.3, c: 0.15, y: 0, t: 0.05 }], 0x2f6f88);
      b.box(0.9, 0.05, 0.05, s * 2.2, 0.27, 0.9, GLOW, [0, s * 0.5, 0]); b.box(0.7, 0.05, 0.05, s * 3.4, 0.2, -0.9, GLOW, [0, s * 0.45, 0]);
      // dorsal S-duct intake lips and ventral emitter pods
      b.box(0.8, 0.07, 0.06, s * 0.65, 0.42, 2.6, GLOW, [0, s * -0.6, 0]); b.sph(0.22, s * 1.0, -0.3, 1.4, 0x0e2230, 0.7, 1.5); b.sph6(0.07, s * 1.0, -0.38, 1.9, GLOW);
      // vectoring slot exhausts with plasma glow, and small ventral stabilising fins
      b.box(1.3, 0.1, 0.5, s * 1.0, 0.0, -4.35, 0x1b1f24); b.box(1.15, 0.06, 0.1, s * 1.0, 0.0, -4.62, GLOW);
      b.wing([{ x: 0, z: -2.5, c: 1.6, y: 0, t: 0.04 }, { x: 0.5, z: -3.6, c: 0.8, y: 0, t: 0.025 }], [top, bot], (x, y, z) => [s * (2.1 + y + x * 0.5), -0.1 - x * 1.4, z]);
      b.box(0.05, 0.3, 0.3, s * 2.4, -0.5, -3.2, T);
      b.box(0.35, 0.04, 0.3, s * 5.3, 0.04, -3.1, s < 0 ? 0xff3a2e : 0x3aff6a);
      // flush decoy ports
      for (let i = 0; i < 5; i++) b.box(0.08, 0.03, 0.08, s * (1.6 + i * 0.16), -0.3, -3.0 - i * 0.05, 0x7ce8ff);
      wheelLeg(b, s * 1.4, -0.3, -0.2, 0.6, 0.26);
    }
    b.box(0.3, 0.05, 0.9, 0, 0.5, 0.4, T); b.box(0.5, 0.05, 0.05, 0, 0.45, 5.0, GLOW); wheelLeg(b, 0, -0.3, 3.2, 0.7, 0.2);
  }
}

function uav(b, tier = 1) {
  const [top, bot] = skin(tier);
  b.fuse([{ z: 2.8, w: 0.02, t: 0.02, bt: 0.02 }, { z: 2.1, w: 0.36, t: 0.34, bt: 0.28 }, { z: 0.8, w: 0.5, t: 0.46, bt: 0.34 }, { z: -0.9, w: 0.4, t: 0.38, bt: 0.28 }, { z: -2.4, w: 0.14, t: 0.14, bt: 0.12 }, { z: -2.6, w: 0.08, t: 0.08, bt: 0.08 }], tier === 1 ? [0xe3e7eb, 0xaeb6be] : [top, bot], 14);
  b.sph(0.36, 0, 0.5, 1.2, tier === 1 ? 0x4a5058 : 0x1b2c3b, 0.7, 1.3); b.sph(0.27, 0, -0.38, 1.7, DARK2); b.sph6(0.14, 0, -0.5, 1.9, GLASS);
  const span = tier === 1 ? 3.6 : tier === 2 ? 3.0 : 3.8;
  for (const s of [-1, 1]) {
    b.wing([{ x: s * 0.4, z: 0.6, c: 1.0, y: 0.08, t: 0.06 }, { x: s * span, z: tier === 3 ? -0.6 : 0.3, c: tier === 1 ? 0.55 : 0.7, y: 0.1, t: 0.025 }], tier === 1 ? [0xe3e7eb, 0xaeb6be] : [top, bot]);
    if (tier === 1) { b.wing([{ x: 0, z: -1.9, c: 0.8, y: 0, t: 0.04 }, { x: 0.4, z: -2.3, c: 0.5, y: 0, t: 0.025 }], 0xe3e7eb, (x, y, z) => [s * (0.15 + x * 0.9), 0.1 + x * 1.5, z]); b.box(0.05, 0.3, 0.3, s * 0.5, 0.45, -2.2, T); }
    else b.wing([{ x: s * 0.3, z: -1.7, c: 0.9, y: 0.1, t: 0.04 }, { x: s * 1.4, z: -2.5, c: 0.6, y: 0.1, t: 0.03 }], [top, bot]);
    b.box(0.2, 0.2, 0.2, s * span * 0.97, 0.1, 0.0, s < 0 ? 0xff3a2e : 0x3aff6a);
    if (tier === 1) flareRack(b, s * 0.35, -0.3, -0.8, 3, 0.8);
    else for (let i = 0; i < 3; i++) b.box(0.07, 0.03, 0.07, s * 0.35, -0.3, -0.5 - i * 0.18, ORANGE);
    if (tier === 3) b.wing([{ x: s * 0.4, z: 0.6, c: 0.22, y: 0.08, t: 0.065 }, { x: s * span, z: -0.6, c: 0.16, y: 0.1, t: 0.027 }], GLOW);
  }
  b.cyl(0.18, 0.5, 0, 0, -2.5, METAL, [PI / 2, 0, 0]); H.antenna(b, 0, 0.35, 0.2, 0.4); b.cyl6(0.025, 0.5, 0, 0, 2.7, BLACK, [PI / 2, 0, 0]);
  for (const x of [-0.7, 0.7]) wheelLeg(b, x, -0.3, -0.3, 0.3, 0.16); wheelLeg(b, 0, -0.3, 1.2, 0.3, 0.13);
  b.g('rotor').at(0, 0, -2.75); b.box(1.6, 0.06, 0.12, 0, 0, -2.75, BLACK); b.box(0.12, 1.6, 0.06, 0, 0, -2.75, BLACK); b.cyl6(0.12, 0.26, 0, 0, -2.75, METAL, [PI / 2, 0, 0]);
}

// ---------------------------------------------------------------- bombers (bomber f=1, strategic f>1)
function bigJet(b, tier, f, pods) {
  const [top, bot] = skin(tier), L = (z) => z * f, W = (x) => x * f;
  const wy = tier === 1 ? 0.3 : 0.1;
  if (tier === 1) {
    b.fuse([{ z: L(10.6), w: 0.03, t: 0.03, bt: 0.03 }, { z: L(9.4), w: 0.5 * f, t: 0.5 * f, bt: 0.46 * f }, { z: L(6.8), w: 1.05 * f, t: 1.0 * f, bt: 0.9 * f }, { z: L(3), w: 1.5 * f, t: 1.3 * f, bt: 1.2 * f }, { z: L(-2), w: 1.55 * f, t: 1.3 * f, bt: 1.25 * f }, { z: L(-6), w: 1.2 * f, t: 1.1 * f, bt: 1.0 * f }, { z: L(-9.2), w: 0.5 * f, t: 0.8 * f, bt: 0.4 * f }, { z: L(-9.6), w: 0.3 * f, t: 0.5 * f, bt: 0.25 * f }], [top, bot], 18);
    b.fuse([{ z: L(8.2), w: 0.1, t: 0.05, y: 1.0 * f }, { z: L(7.2), w: 0.7 * f, t: 0.6 * f, bt: 0.05, y: 0.95 * f, p: 2.4 }, { z: L(5.2), w: 0.82 * f, t: 0.5 * f, bt: 0.05, y: 1.0 * f }, { z: L(4.4), w: 0.3, t: 0.1, y: 1.0 * f }], GLASS2, 12);   // glazed cockpit
    for (const s of [-1, 1]) {
      b.wing([{ x: s * W(1.4), z: L(2.4), c: L(8.6), y: wy * f, t: 0.28 * f }, { x: s * W(6.0), z: L(-1.8), c: L(5.2), y: wy * f, t: 0.2 * f }, { x: s * W(12.6), z: L(-4.6), c: L(2.4), y: wy * f, t: 0.08 * f }], [top, bot]);
      b.wing([{ x: s * W(1.2), z: L(-7.6), c: L(2.8), y: wy * f + 0.1, t: 0.1 * f }, { x: s * W(4.8), z: L(-9.2), c: L(1.7), y: wy * f + 0.1, t: 0.05 * f }], [top, bot]);
      for (const ex of pods) {
        const x = s * W(ex), z0 = L(ex > 7 ? -1.2 : 1.0);
        b.fuse([{ z: z0 + L(1.9), w: 0.62 * f, t: 0.62 * f, x, y: -0.5 * f, p: 2.2 }, { z: z0 + L(1.4), w: 0.72 * f, t: 0.72 * f, x, y: -0.5 * f }, { z: z0 - L(0.8), w: 0.78 * f, t: 0.78 * f, x, y: -0.5 * f }, { z: z0 - L(2.2), w: 0.55 * f, t: 0.55 * f, x, y: -0.5 * f }], [top, bot], 14);
        b.cyl(0.5 * f, 0.1, x, -0.5 * f, z0 + L(1.9), BLACK, [PI / 2, 0, 0]); nozzle(b, x, -0.5 * f, z0 - L(2.2), 0.5 * f, 0.5 * f, false);
        b.box(0.2 * f, 0.9 * f, L(1.6), x, -0.05 * f, z0, GREY);                                                                        // pylon
      }
      b.box(0.16 * f, 4.0 * f, L(2.6), s * 0.7 * f, 3.4 * f, L(-8.2), GREY, [0, 0, s * 0.1]);
      flareRack(b, s * W(2.4), -0.5 * f, L(-1.0), 7, 1.5 * f / 1.4); flareRack(b, s * W(3.6), -0.5 * f, L(-1.8), 5, 1.4);        // large visible dispenser banks
      flareRack(b, s * 1.4 * f, 0.4 * f, L(-8.0), 5, 1.4, 1);
      b.box(0.5 * f, 0.9 * f, L(5), s * 2.8 * f, -1.3 * f, L(-0.8), GREY); wheelLeg(b, s * 2.8 * f, -1.5 * f, L(-0.4), 0.8 * f, 0.5 * f);
      b.box(0.2, 0.2, 0.5, s * W(12.5), wy * f, L(-4.2), s < 0 ? 0xff3a2e : 0x3aff6a);
    }
    b.wing([{ x: 0, z: L(-4.8), c: L(4.4), y: 0, t: 0.18 * f }, { x: 0.6, z: L(-8.0), c: L(2.2), y: 0, t: 0.1 * f }], [top, bot], (x, y, z) => [y * 0.5, 1.2 * f + x * 5.2 * f, z]);
    b.box(0.2, 1.4 * f, L(1.5), 0, 5.5 * f, L(-8.6), T);
    wheelLeg(b, 0, -1.1 * f, L(6.4), 0.8 * f, 0.4 * f);
    b.cyl6(0.04, 1.0, 0, 0, L(10.7), BLACK, [PI / 2, 0, 0]); b.sph6(0.25 * f, 0, -1.2 * f, L(7), 0x1d2630); H.antenna(b, 0, 1.3 * f, L(2), 0.7);
  } else {
    // flying wing: tier 2 = shallow sawtooth planform, tier 3 = deep chevron with glowing seams and dorsal emitter spine
    const t3 = tier === 3, sw = t3 ? 1.35 : 1.0;
    b.fuse([{ z: L(8.4), w: 0.03, t: 0.03, bt: 0.03 }, { z: L(7.2), w: 0.7 * f, t: 0.35 * f, bt: 0.3 * f, p: t3 ? 2.4 : 1.6 }, { z: L(4), w: 1.9 * f, t: 0.75 * f, bt: 0.55 * f, p: t3 ? 2.6 : 1.7 }, { z: L(0), w: 2.6 * f, t: 0.85 * f, bt: 0.6 * f, p: 2.8 }, { z: L(-4), w: 2.4 * f, t: 0.6 * f, bt: 0.45 * f, p: 3 }, { z: L(-7), w: 1.6 * f, t: 0.3 * f, bt: 0.2 * f, p: 3 }, { z: L(-7.6), w: 1.2 * f, t: 0.15 * f, bt: 0.1 * f }], [top, bot], 18);
    b.fuse([{ z: L(6.6), w: 0.04, t: 0.04, y: 0.45 * f }, { z: L(5.6), w: 0.5 * f, t: 0.4 * f, bt: 0.05, y: 0.6 * f }, { z: L(4), w: 0.6 * f, t: 0.45 * f, bt: 0.05, y: 0.7 * f }, { z: L(2.6), w: 0.12, t: 0.06, y: 0.7 * f }], t3 ? 0x0d2a3a : GLASS2, 10);
    for (const s of [-1, 1]) {
      const sec = [{ x: s * W(2.0), z: L(5.0), c: L(11.4), y: 0.1 * f, t: 0.5 * f }, { x: s * W(7.0), z: L(0.5 - (sw - 1) * 4), c: L(6.6), y: 0.1 * f, t: 0.3 * f }, { x: s * W(12.6), z: L(-3.8 - (sw - 1) * 5), c: L(2.8), y: 0.1 * f, t: 0.08 * f }];
      b.wing(sec, [top, bot]);
      if (t3) b.wing(sec.map((q) => ({ x: q.x, z: q.z, c: L(0.45), y: q.y, t: q.t * 1.02 })), GLOW);
      else for (let i = 0; i < 5; i++) b.box(0.12, 0.03, 0.12, s * (W(3 + i * 1.4)), 0.34 * f, L(-4.2 - i * 0.7), 0x14171b);
      for (let i = 0; i < 4; i++) b.box(0.1 * f, 0.03, 0.1 * f, s * W(1.0 + i * 0.5), -0.4 * f, L(-5.2 - i * 0.15), i & 1 ? ORANGE : (t3 ? GLOW : RED));    // flush decoy ports
      b.box(0.04, 0.03, L(5), s * W(1.2), -0.62 * f, L(1.5), 0x14171b); b.box(0.04, 0.03, L(3), s * W(2.2), -0.55 * f, L(0.5), 0x14171b);          // weapon-bay door seams
      b.box(W(2.0), 0.05, 0.12, s * W(2.2), 0.3 * f, L(2.2), t3 ? GLOW : 0x14171b, [0, s * 0.55, 0]);
      b.box(0.3 * f, 0.05, 0.9 * f, s * W(0.9), 0.82 * f, L(-1.2), 0x14171b);                                                             // buried-engine intake slot
      wheelLeg(b, s * 2.3 * f, -0.4 * f, L(-0.8), 0.9 * f, 0.5 * f);
      b.box(0.2, 0.05, 0.3, s * W(12.3), 0.1 * f, L(-3.9), s < 0 ? 0xff3a2e : 0x3aff6a);
      if (t3) b.box(W(2.4), 0.07, 0.07, s * W(5), 0.29 * f, L(-0.6), GLOW, [0, s * 0.62, 0]);
    }
    b.box(W(3.6), 0.12, 0.5 * f, 0, 0.02, L(-7.5), t3 ? GLOW : 0x1b1f24); b.box(0.5 * f, 0.1, 1.2 * f, 0, 0.8 * f, L(-3.2), t3 ? 0x2f6f88 : 0x14171b); b.box(0.4 * f, 0.1, 1.5, 0, 0.9 * f, L(-1.8), T);
    wheelLeg(b, 0, -0.5 * f, L(5.6), 0.9 * f, 0.4 * f);
    b.cyl6(0.04, 1.0, 0, 0, L(8.5), BLACK, [PI / 2, 0, 0]);
  }
}
const bomber = (b, tier = 1) => bigJet(b, tier, 1, [3.9, 7.2]);
const strategic = (b, tier = 1) => bigJet(b, tier, 1.5, tier === 1 ? [3.0, 5.5, 8.0, 10.5] : [3.0, 5.5]);

// ---------------------------------------------------------------- attack helicopter
function heli(b, tier = 1) {
  const [top, bot] = skin(tier === 1 ? 1 : tier), olive = tier === 1 ? [0x5d6945, 0x434c33] : [top, bot], fac = tier === 2 ? 1.5 : 2.2;
  b.fuse([{ z: 3.0, w: 0.2, t: 0.2, bt: 0.2, y: -0.1, p: fac }, { z: 2.2, w: 0.55, t: 0.5, bt: 0.45, y: 0.0, p: fac }, { z: 0.8, w: 0.85, t: 0.78, bt: 0.55, y: 0.1, p: fac }, { z: -0.8, w: 0.9, t: 0.8, bt: 0.55, y: 0.25, p: fac }, { z: -2.2, w: 0.7, t: 0.62, bt: 0.45, y: 0.4, p: fac }, { z: -3.4, w: 0.32, t: 0.36, bt: 0.28, y: 0.5 }, { z: -5.0, w: 0.17, t: 0.22, bt: 0.18, y: 0.62 }], olive, 14);
  b.fuse([{ z: 2.5, w: 0.05, t: 0.05, y: 0.35 }, { z: 2.1, w: 0.36, t: 0.3, bt: 0.05, y: 0.45, p: fac }, { z: 1.2, w: 0.44, t: 0.36, bt: 0.05, y: 0.62, p: fac }, { z: 0.6, w: 0.34, t: 0.2, bt: 0.05, y: 0.8 }], GLASS2, 10);
  b.fuse([{ z: 0.2, w: 0.05, t: 0.05, y: 0.88 }, { z: -0.1, w: 0.4, t: 0.3, bt: 0.05, y: 0.88, p: fac }, { z: -1.2, w: 0.45, t: 0.32, bt: 0.05, y: 1.05, p: fac }, { z: -1.6, w: 0.05, t: 0.05, y: 1.05 }], GLASS2, 10);
  b.fuse([{ z: -1.2, w: 0.7, t: 0.45, bt: 0.0, x: 0, y: 0.95, p: fac }, { z: -2.8, w: 0.55, t: 0.35, bt: 0.0, y: 1.0 }, { z: -3.5, w: 0.2, t: 0.15, bt: 0.0, y: 1.0 }], olive, 10);   // engine cowl
  for (const s of [-1, 1]) {
    b.wing([{ x: s * 0.8, z: 0.8, c: 1.5, y: -0.05, t: 0.07 }, { x: s * 2.9, z: 0.5, c: 1.0, y: -0.05, t: 0.04 }], olive);
    b.box(0.08, 0.24, 0.9, s * 2.9, -0.05, 0.1, T);
    if (tier === 1) { flareRack(b, s * 0.55, 0.1, -3.0, 5, 1.1, -1); flareRack(b, s * 0.25, 1.15, -2.4, 4, 1, 1); b.box(0.2, 0.4, 0.3, s * 1.0, 0.6, 1.0, DARK2); }
    else { for (let i = 0; i < 4; i++) b.box(0.08, 0.03, 0.08, s * 0.5, 0.18, -2.8 - i * 0.2, ORANGE); b.box(0.04, 0.03, 1.4, s * 0.45, -0.52, 0.3, 0x14171b); }
    b.wing([{ x: 0, z: -4.3, c: 0.9, y: 0, t: 0.04 }, { x: 0.5, z: -4.7, c: 0.5, y: 0, t: 0.03 }], olive, (x, y, z) => [s * (0.15 + x * 1.3), 0.6 + x * 0.1, z]);
    wheelLeg(b, s * 0.7, -0.35, 0.9, 0.35, 0.2);
  }
  b.wing([{ x: 0, z: -4.2, c: 1.2, y: 0, t: 0.05 }, { x: 0.5, z: -5.0, c: 0.8, y: 0, t: 0.04 }], olive, (x, y, z) => [y, 0.7 + x * 2.3, z]);
  b.box(0.06, 0.4, 0.6, 0, 2.8, -4.8, T);
  if (tier === 3) { b.box(0.05, 0.05, 4, 0.55, 0.72, -1.2, GLOW); b.box(0.05, 0.05, 4, -0.55, 0.72, -1.2, GLOW); b.sph(0.16, 0, 0.2, 2.9, GLOW, 0.8, 0.8); }
  b.sph(0.22, 0, -0.45, 2.4, 0x1d2630, 0.8); b.cyl6(0.1, 0.9, 0, 1.45, -0.2, METAL); b.sph(0.24, 0, 1.95, -0.2, DARK2, 0.9); b.sph6(0.1, 0, 1.95, 0.0, GLASS); H.antenna(b, 0, 1.3, -2.4, 0.7);
  b.g('turret'); b.pivot = [0, -0.45, 1.9];
  b.sph(0.3, 0, -0.5, 1.9, DARK2, 0.8); b.box(0.28, 0.28, 0.6, 0, -0.55, 2.0, METAL); b.barrel(0.07, 1.3, 0, -0.55, 2.3, BLACK, -0.05); b.cyl(0.1, 0.3, 0, -0.58, 3.5, METAL, [PI / 2, 0, 0]);
  b.g('rotor').at(0, 1.35, 0.1);
  b.cyl(0.3, 0.4, 0, 1.25, 0.1, METAL); b.cyl(0.16, 0.25, 0, 1.55, 0.1, DARK2);
  for (let i = 0; i < 4; i++) { const a = i * PI / 2; b.box(4.3, 0.06, 0.4, Math.sin(a) * 2.3, 1.5, 0.1 + Math.cos(a) * 2.3, i & 1 ? BLACK : 0x2a2d31, [0, a + PI / 2, 0]); if (tier === 3) b.box(0.4, 0.07, 0.42, Math.sin(a) * 4.3, 1.5, 0.1 + Math.cos(a) * 4.3, GLOW, [0, a + PI / 2, 0]); else b.box(0.5, 0.07, 0.42, Math.sin(a) * 4.3, 1.5, 0.1 + Math.cos(a) * 4.3, tier === 2 ? ORANGE : 0xd0d6dc, [0, a + PI / 2, 0]); }
  b.g('rotor2').at(0.3, 0.95, -5.0);
  if (tier === 1) for (let i = 0; i < 2; i++) b.box(0.05, 1.7, 0.18, 0.3, 0.95, -5.0, BLACK, [i * PI / 2, 0, 0]);
  else { for (let i = 0; i < 4; i++) b.box(0.05, 0.85, 0.14, 0.3, 0.95, -5.0, tier === 3 ? 0x1b2c3b : BLACK, [i * PI / 4, 0, 0]); b.cyl(0.95, 0.06, 0.3, 0.95, -5.0, tier === 3 ? GLOW : DARK2, [0, 0, PI / 2]); }
  b.cyl6(0.12, 0.14, 0.3, 0.95, -5.0, METAL, [0, 0, PI / 2]);
}

// ---------------------------------------------------------------- tilt-jet VTOL
function vtol(b, tier = 1) {
  const [top, bot] = skin(tier);
  const fac = tier === 1 ? 2.4 : tier === 2 ? 1.5 : 2.6;
  b.fuse([{ z: 5.4, w: 0.03, t: 0.03, bt: 0.03 }, { z: 4.4, w: 0.4, t: 0.35, bt: 0.3, p: fac }, { z: 2.6, w: 0.85, t: 0.6, bt: 0.5, p: fac }, { z: 0.0, w: 1.1, t: 0.64, bt: 0.55, p: fac }, { z: -2.4, w: 0.95, t: 0.55, bt: 0.5, p: fac }, { z: -4.0, w: 0.6, t: 0.4, bt: 0.4, p: fac }], [top, bot], 16);
  b.fuse([{ z: 3.8, w: 0.04, t: 0.04, y: 0.45 }, { z: 3.4, w: 0.36, t: 0.2, bt: 0.05, y: 0.5, p: fac }, { z: 2.2, w: 0.48, t: 0.4, bt: 0.05, y: 0.55, p: fac }, { z: 0.8, w: 0.3, t: 0.2, bt: 0.05, y: 0.6 }, { z: 0.4, w: 0.04, t: 0.04, y: 0.6 }], tier === 3 ? 0x0d2a3a : GLASS2, 10);
  for (const s of [-1, 1]) {
    b.wing([{ x: s * 0.9, z: 1.2, c: 3.6, y: 0.0, t: 0.14 }, { x: s * 2.8, z: -0.2, c: 2.5, y: -0.05, t: 0.1 }, { x: s * 4.8, z: -1.5, c: 1.3, y: -0.08, t: 0.04 }], [top, bot]);
    // tilt-fans: big ducted lift fans with visible blades; Mk III glow
    b.cyl(0.72, 0.16, s * 1.35, 0.5, 0.6, tier === 3 ? 0x24313c : DARK2); b.cyl(0.62, 0.08, s * 1.35, 0.56, 0.6, tier === 3 ? GLOW : 0x23282e);
    for (let i = 0; i < 3; i++) b.box(1.1, 0.05, 0.1, s * 1.35, 0.62, 0.6, BLACK, [0, i * PI / 3, 0]);
    b.fuse([{ z: 2.0, w: 0.5, t: 0.5, x: s * 0.9, y: -0.1, p: 3 }, { z: 0.4, w: 0.55, t: 0.55, x: s * 0.9, y: -0.1, p: 3 }, { z: -1.8, w: 0.5, t: 0.5, x: s * 0.8, y: -0.05, p: 3 }], [top, bot], 10);
    b.box(0.7, 0.6, 0.08, s * 0.9, -0.1, 2.02, BLACK);
    nozzle(b, s * 0.7, 0.05, -3.9, 0.45, 0.6, tier === 3);
    const cant = tier === 1 ? 0.35 : tier === 2 ? 0.55 : 0.0;
    if (tier < 3) b.wing([{ x: 0, z: -2.0, c: 2.2, y: 0, t: 0.06 }, { x: 0.5, z: -3.5, c: 1.1, y: 0, t: 0.035 }], [top, bot], (x, y, z) => [s * (0.85 + y + x * cant * 2), 0.4 + x * 3.0, z]);
    else b.wing([{ x: s * 1.2, z: -2.4, c: 1.6, y: 0.1, t: 0.05 }, { x: s * 3.0, z: -3.8, c: 0.8, y: 0.1, t: 0.03 }], [top, bot]);
    b.box(0.06, 0.4, 0.8, s * (0.85 + (tier < 3 ? 0.9 * cant * 2 * 0.5 : 0)), tier < 3 ? 1.85 : 0.2, -3.4, T);
    if (tier === 1) { flareRack(b, s * 1.1, -0.58, -2.4, 6, 1.1); flareRack(b, s * 1.6, -0.3, -1.4, 4, 1.1); }
    else { for (let i = 0; i < 5; i++) b.box(0.09, 0.03, 0.09, s * 1.0, -0.52, -2.2 - i * 0.17, i & 1 ? ORANGE : (tier === 3 ? GLOW : RED)); b.box(0.04, 0.03, 2.2, s * 0.5, -0.55, 0.2, 0x14171b); }
    if (tier === 3) b.wing([{ x: s * 0.9, z: 1.2, c: 0.3, y: 0, t: 0.145 }, { x: s * 2.8, z: -0.2, c: 0.25, y: -0.05, t: 0.105 }, { x: s * 4.8, z: -1.5, c: 0.2, y: -0.08, t: 0.042 }], GLOW);
    b.box(0.3, 0.05, 0.4, s * 4.8, -0.06, -1.6, s < 0 ? 0xff3a2e : 0x3aff6a);
    wheelLeg(b, s * 1.0, -0.55, -0.8, 0.5, 0.26);
  }
  b.sph(0.2, 0, -0.65, 2.9, 0x1d2630, 0.8); wheelLeg(b, 0, -0.5, 2.6, 0.55, 0.2); H.antenna(b, 0, 0.6, -1.2, 0.4);
}

// ---------------------------------------------------------------- electronic warfare plane (rotating rotodome)
function ewplane(b, tier = 1) {
  const [top, bot] = tier === 1 ? [[0xe4e8ec, 0xb4bcc4]][0] : skin(tier);
  const fac = tier === 2 ? 1.6 : 2.2;
  b.fuse([{ z: 6.0, w: 0.03, t: 0.03, bt: 0.03 }, { z: 5.2, w: 0.45, t: 0.42, bt: 0.4, p: fac }, { z: 3.2, w: 0.95, t: 0.8, bt: 0.75, p: fac }, { z: 0.0, w: 1.15, t: 1.0, bt: 0.9, p: fac }, { z: -2.4, w: 1.0, t: 0.85, bt: 0.8, p: fac }, { z: -4.2, w: 0.35, t: 0.5, bt: 0.35 }, { z: -4.6, w: 0.18, t: 0.3, bt: 0.2 }], [top, bot], 16);
  b.fuse([{ z: 3.9, w: 0.05, t: 0.05, y: 0.55 }, { z: 3.5, w: 0.5, t: 0.34, bt: 0.05, y: 0.6, p: fac }, { z: 2.4, w: 0.65, t: 0.42, bt: 0.05, y: 0.7, p: fac }, { z: 1.4, w: 0.1, t: 0.05, y: 0.7 }], GLASS2, 10);
  for (const s of [-1, 1]) {
    b.wing([{ x: s * 1.0, z: 1.0, c: 3.4, y: -0.2, t: 0.16 }, { x: s * 3.2, z: -0.3, c: 2.3, y: -0.2, t: 0.1 }, { x: s * 5.2, z: -1.6, c: 1.2, y: -0.2, t: 0.05 }], [top, bot]);
    b.wing([{ x: s * 0.6, z: -3.1, c: 1.6, y: 0.2, t: 0.06 }, { x: s * 2.6, z: -4.1, c: 0.9, y: 0.2, t: 0.04 }], [top, bot]);
    if (tier === 3) b.wing([{ x: s * 1.0, z: 1.0, c: 0.3, y: -0.2, t: 0.165 }, { x: s * 3.2, z: -0.3, c: 0.25, y: -0.2, t: 0.105 }, { x: s * 5.2, z: -1.6, c: 0.2, y: -0.2, t: 0.052 }], GLOW);
    b.fuse([{ z: 1.2, w: 0.46, t: 0.46, x: s * 2.2, y: -0.65, p: 2.2 }, { z: 0.5, w: 0.5, t: 0.5, x: s * 2.2, y: -0.65 }, { z: -1.4, w: 0.46, t: 0.46, x: s * 2.2, y: -0.65 }], [top, bot], 12);
    nozzle(b, s * 2.2, -0.65, -1.5, 0.4, 0.4, tier === 3);
    b.fuse([{ z: 0.4, w: 0.14, t: 0.14, x: s * 5.1, y: -0.1, p: 2.2 }, { z: -0.6, w: 0.25, t: 0.25, x: s * 5.1, y: -0.1 }, { z: -2.8, w: 0.18, t: 0.18, x: s * 5.1, y: -0.1 }], tier === 1 ? 0xcfd5db : [top, bot], 10);   // wingtip jammer pods
    b.box(0.12, 0.12, 0.2, s * 5.1, 0.12, -1.8, s < 0 ? 0xff3a2e : 0x3aff6a);
    b.wing([{ x: 0, z: -2.8, c: 1.8, y: 0, t: 0.05 }, { x: 0.5, z: -4.1, c: 0.9, y: 0, t: 0.03 }], [top, bot], (x, y, z) => [s * (0.7 + x * 0.5), 0.5 + x * 3, z]);
    b.box(0.06, 0.4, 0.7, s * 1.0, 2.0, -3.9, T);
    if (tier === 1) { flareRack(b, s * 0.9, -0.88, -2.0, 6, 1.1); flareRack(b, s * 1.2, -0.7, 1.4, 4, 1.1); }
    else for (let i = 0; i < 5; i++) b.box(0.09, 0.03, 0.09, s * 0.9, -0.86, -1.8 - i * 0.17, i & 1 ? ORANGE : (tier === 3 ? GLOW : RED));
    b.box(0.5, 0.04, 2.2, s * 0.9, -0.8, 0.8, tier === 3 ? 0x2f6f88 : 0x4a5058);                                                                      // belly blade antennas
    wheelLeg(b, s * 1.0, -0.8, -0.4, 0.55, 0.32);
  }
  b.fuse([{ z: 2.4, w: 0.45, t: 0.4, y: 0.9, p: 2.2 }, { z: 0.0, w: 0.55, t: 0.55, y: 0.95 }, { z: -2.4, w: 0.45, t: 0.38, y: 0.9 }], [top, bot], 10);    // dorsal comms fairing
  b.cyl(0.14, 0.7, 0, 1.45, -0.6, METAL); H.blade(b, 0, 0.95, 2.6, 0.4, 0.3); H.antenna(b, 0, -0.9, 2.2, 0.5); b.sph6(0.3, 0, -0.5, 5.4, 0x30363c);
  if (tier === 3) { b.box(0.3, 0.05, 3.4, 0, 1.0, 0.6, GLOW); b.sph6(0.1, 0, 0.1, 5.9, GLOW); }
  wheelLeg(b, 0, -0.8, 3.4, 0.55, 0.26);
  b.g('rotor').at(0, 1.55, -0.6);
  b.cyl(1.7, 0.22, 0, 1.6, -0.6, tier === 1 ? 0xe4e8ec : (tier === 2 ? 0x353b42 : 0xdfe8f0)); b.cyl(1.55, 0.06, 0, 1.76, -0.6, tier === 3 ? GLOW : 0x9aa4ae); b.box(3.2, 0.1, 0.4, 0, 1.45, -0.6, METAL);
  b.box(0.12, 0.3, 3.0, 0, 1.78, -0.6, tier === 1 ? ORANGE : (tier === 3 ? GLOW : DARK2)); b.cyl6(0.35, 0.14, 0, 1.55, -0.6, METAL);
}

// ---------------------------------------------------------------- stealth spy drone: huge flying wing
function spydrone(b, tier = 1) {
  const [top, bot] = tier === 1 ? [[0x565e67, 0x3d444c]][0] : skin(tier);
  b.fuse([{ z: 9.4, w: 0.03, t: 0.03, bt: 0.03 }, { z: 7.5, w: 0.9, t: 0.5, bt: 0.4, p: 2.2 }, { z: 4, w: 1.6, t: 0.9, bt: 0.55, p: 2.4 }, { z: 0, w: 2.0, t: 1.0, bt: 0.6, p: 2.6 }, { z: -4, w: 1.7, t: 0.8, bt: 0.45, p: 2.6 }, { z: -8.2, w: 0.8, t: 0.2, bt: 0.15 }, { z: -8.6, w: 0.5, t: 0.1, bt: 0.1 }], [top, bot], 18);
  b.sph(1.0, 0, 1.7, -1.0, WHITE, 0.8, 1.2); b.sph(0.9, 0, 0.8, 6.0, 0x2a2f34, 0.6, 1.8); b.fuse([{ z: -2, w: 0.7, t: 0.5, bt: 0, y: 1.2 }, { z: -4.5, w: 0.9, t: 0.5, bt: 0, y: 1.1 }, { z: -6.5, w: 0.3, t: 0.2, bt: 0, y: 1.0 }], 0x2c3238, 10);
  for (const s of [-1, 1]) {
    const sec = [{ x: s * 1.6, z: 1.8, c: 7.8, y: 0.0, t: 0.38 }, { x: s * 9, z: -1.0, c: 5.6, y: 0.0, t: 0.22 }, { x: s * 17, z: -3.6, c: 4.2, y: 0.02, t: 0.12 }, { x: s * 26, z: -4.8, c: 2.6, y: 0.04, t: 0.05 }];
    b.wing(sec, [top, bot]);
    if (tier === 3) b.wing(sec.map((q) => ({ x: q.x, z: q.z, c: 0.35, y: q.y, t: q.t * 1.02 })), GLOW);
    b.box(0.2, 0.15, 0.5, s * 26.4, 0.05, -4.8, s < 0 ? 0xff3a2e : 0x3aff6a);
    if (tier === 1) { b.wing([{ x: 0, z: -4.2, c: 2.6, y: 0, t: 0.06 }, { x: 0.5, z: -6.2, c: 1.4, y: 0, t: 0.04 }], [top, bot], (x, y, z) => [s * (2.4 + x * 1.2), 1.0 + x * 3.2, z]); flareRack(b, s * 3.0, -0.5, -3.0, 6, 1.4); }
    else for (let i = 0; i < 6; i++) b.box(0.12, 0.03, 0.12, s * 3.0, -0.5, -3.0 - i * 0.2, i & 1 ? ORANGE : (tier === 3 ? GLOW : RED));
    wheelLeg(b, s * 1.6, -0.6, 2.0, 0.8, 0.45);
  }
  wheelLeg(b, 0, -0.6, 7.0, 0.8, 0.36);
}

export const AIR2 = { fighter, uav, bomber, strategic, heli, vtol, ewplane, spydrone };
export { flareRack, nozzle, wheelLeg, skin, GLOW, GLASS2 };
