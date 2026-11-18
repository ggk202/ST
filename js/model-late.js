// Late-game structures, strategic missile and orbital craft models (see model-core for the Builder API).
import { C, T, PI, H } from './model-core.js';
const { OD, OD2, OD3, DARK, DARK2, GREY, METAL, STEEL, BLACK, CONC, WHITE, ORANGE, GLASS, RED, LAMP, CYAN, YEL, PANEL, GOLD } = C;
const SOLAR = 0x1b2f55, SOLAR2 = 0x28437a, FOIL = 0xc9a24a, HULL = 0xc7ccd2, HULL2 = 0x9aa3ad, GLOW = 0x7fd8ff, PLASMA = 0xb9ecff;

function slab(b, w, d, h = 0.5) { b.box(w, h, d, 0, h / 2, 0, CONC); b.box(w + 0.1, 0.1, d + 0.1, 0, h, 0, 0x6e7277); }
function ring(b, y, r, n, h, col) { for (let i = 0; i < n; i++) { const a = i / n * PI * 2; b.box(r * 0.5, h, 0.32, Math.cos(a) * r, y, Math.sin(a) * r, col, [0, -a + PI / 2, 0]); } }
const lampRed = (b, x, y, z) => b.sph6(0.14, x, y, z, RED);

function solar(b) {   // photovoltaic tracker field
  slab(b, 12, 12, 0.3);
  for (const x of [-3.6, 0, 3.6]) for (const z of [-3.4, 0.2, 3.8]) {
    b.cyl6(0.12, 1.2, x, 0.9, z, METAL); b.box(0.5, 0.4, 0.5, x, 0.5, z, DARK2);
    b.box(2.9, 0.12, 2.5, x, 1.7, z, SOLAR, [-0.45, 0, 0]);
    for (let i = 1; i < 4; i++) b.box(0.05, 0.14, 2.5, x - 1.45 + i * 0.725, 1.71, z, 0x6b8fd0, [-0.45, 0, 0]);
    b.box(2.9, 0.14, 0.05, x, 1.72, z, 0x6b8fd0, [-0.45, 0, 0]);
  }
  b.box(2.2, 1.5, 1.6, 4.6, 1.0, -4.6, OD2); b.box(2.3, 0.15, 1.7, 4.6, 1.8, -4.6, T); H.vent(b, 4.6, 1.9, -4.6, 1.2, 0.8, 3);
}
function fusion(b) {   // tokamak torus in a containment hall
  slab(b, 16, 16, 0.6); b.box(12, 4.2, 12, 0, 2.7, 0, 0x6e747c); b.box(12.4, 0.5, 12.4, 0, 5.0, 0, T); H.hazard(b, 0, 0.62, 7, 10, 0.4, 7);
  b.cyl(4.2, 1.6, 0, 5.8, 0, 0x9aa1a9); b.cyl(3.2, 0.2, 0, 6.65, 0, DARK2);
  b.rel('rotor', 0, 7.4, 0);
  for (let i = 0; i < 18; i++) { const a = i / 18 * PI * 2; b.sph6(0.95, Math.cos(a) * 2.7, 0, Math.sin(a) * 2.7, i % 2 ? STEEL : 0xaeb6bd); }
  for (let i = 0; i < 36; i++) { const a = i / 36 * PI * 2; b.box(0.5, 0.5, 0.5, Math.cos(a) * 2.7, 0.55, Math.sin(a) * 2.7, GLOW); }
  b.g('hull');
  for (const [x, z] of [[-6.4, -6.4], [6.4, -6.4], [6.4, 6.4], [-6.4, 6.4]]) { b.cyl(1.2, 5.6, x, 3.4, z, 0x8d949b); b.cyl(1.3, 0.3, x, 6.3, z, DARK2); b.cyl(0.4, 2.0, x, 7.4, z, GLOW); }
  b.box(2.8, 2.0, 0.4, 0, 1.6, 6.1, DARK); b.box(2.4, 1.6, 0.5, 0, 1.6, 6.15, 0x2b3946); for (const x of [-4.2, 4.2]) b.pipe(x, 4.5, -6.0, x, 6.2, 5.8, 0.3, STEEL);
  H.hazard(b, 0, 0.62, -7.2, 8, 0.5, 6); b.sph6(0.25, 0, 7.6, 0, LAMP);
}
function synth(b) {   // matter synthesiser: cooled dome with converter ring
  slab(b, 12, 12, 0.4); b.cyl(4.3, 0.6, 0, 0.7, 0, 0x7a8089); b.sph(3.7, 0, 0.9, 0, 0xc9ced4, 0.85, 1); b.cyl(1.2, 4.0, 0, 2.9, 0, DARK2);
  for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; b.cyl6(0.45, 3.2, Math.cos(a) * 4.9, 1.9, Math.sin(a) * 4.9, 0x8f969d); b.cyl6(0.5, 0.3, Math.cos(a) * 4.9, 3.5, Math.sin(a) * 4.9, GLOW); }
  b.rel('rotor', 0, 5.2, 0); b.cyl(2.6, 0.18, 0, 0, 0, 0x2c3e55); for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; b.box(0.4, 0.4, 1.2, Math.cos(a) * 2.0, 0.3, Math.sin(a) * 2.0, GLOW, [0, -a, 0]); }
  b.g('hull'); b.box(2.4, 1.6, 1.6, -4.5, 1.2, 4.2, OD2); b.box(2.5, 0.14, 1.7, -4.5, 2.05, 4.2, T); H.vent(b, -4.5, 2.2, 4.2, 1.4, 0.9, 4);
  for (const x of [-4.8, 4.8]) b.pipe(x, 0.6, 3.6, x * 0.5, 0.6, 0.6, 0.28, STEEL);
}
function reserve(b) {   // hardened vault complex
  slab(b, 12, 12, 0.6); b.box(9, 3.2, 8, 0, 2.2, 0, 0x7d838a); b.box(9.4, 0.5, 8.4, 0, 4.1, 0, T);
  for (const x of [-2.6, 0, 2.6]) { b.box(2.0, 2.4, 0.3, x, 1.8, 4.15, DARK2); b.box(1.7, 2.1, 0.32, x, 1.8, 4.18, 0x4b525b); b.cyl(0.35, 0.2, x, 1.8, 4.3, GOLD, [PI / 2, 0, 0]); }
  b.cyl(2.2, 3.0, -3.4, 1.5, -4.8, 0xa7adb4); b.sph(2.2, -3.4, 3.0, -4.8, 0xa7adb4, 0.6, 1); b.cyl(1.6, 2.2, 3.4, 1.1, -4.8, 0x6d8f6a); b.sph(1.6, 3.4, 2.2, -4.8, 0x6d8f6a, 0.6, 1);
  H.hazard(b, 0, 0.62, 5.2, 8, 0.5, 6); ring(b, 4.6, 4.4, 12, 0.3, DARK2); H.antenna(b, 4.0, 4.4, 3.4, 2.2); lampRed(b, 0, 4.8, 0);
}
function wall(b) {
  b.box(3.9, 1.5, 3.9, 0, 0.75, 0, 0x838990); b.box(4.0, 0.35, 4.0, 0, 1.6, 0, 0x6d737a); b.box(3.9, 0.2, 3.9, 0, 0.1, 0, CONC);
  for (const z of [-1.4, 1.4]) for (let i = 0; i < 3; i++) b.box(0.15, 0.22, 3.4, i - 1 > 0 ? 1.9 : -1.9, 0.5 + i * 0.4, 0, DARK2);
  H.boltLine(b, -1.6, 1.8, 1.7, 1.6, 1.8, 1.7, 5, 0.12); b.box(1.2, 0.3, 0.25, 0, 1.1, 2.0, T);
}
function bunker(b) {
  slab(b, 8, 8, 0.4); b.trap(6.4, 2.2, 6.4, 0.7, 0.7, 0, 1.5, 0, 0x7a8087); b.box(5.4, 0.6, 5.4, 0, 3.0, 0, 0x6a7077); b.box(5.7, 0.2, 5.7, 0, 2.85, 0, T);
  for (const s of [-1, 1]) { b.box(2.2, 0.5, 0.3, s * 1.2, 1.9, 3.15, BLACK); b.box(0.3, 0.5, 2.2, s * 3.15, 1.9, 1.2 * s, BLACK); }
  b.box(1.6, 1.3, 0.4, 0, 1.2, -3.2, DARK); b.box(1.2, 1.1, 0.5, 0, 1.2, -3.25, DARK2);
  b.rel('turret', 0, 3.3, 0.6); b.cyl(1.2, 0.4, 0, 0.2, 0, DARK2); b.box(1.7, 0.9, 1.9, 0, 0.9, 0, OD); b.trap(1.7, 0.3, 1.9, 0.8, 0.85, 0, 1.5, 0, OD2);
  b.barrel(0.2, 3.0, 0, 0.9, 0.9, METAL); b.cyl(0.28, 0.4, 0, 0.9, 3.6, DARK, [PI / 2, 0, 0]); b.barrel(0.07, 2.0, 0.6, 1.1, 0.8, BLACK); b.barrel(0.07, 2.0, -0.6, 1.1, 0.8, BLACK);
  H.sight(b, -0.5, 1.7, 0.2, 0.9); H.rcws(b, 0.5, 1.75, -0.6, 0.8);
}
function lasertower(b) {
  slab(b, 8, 8, 0.4); b.cyl(1.9, 1.2, 0, 1.0, 0, 0x7d838a); b.cyl(1.4, 2.2, 0, 2.7, 0, 0xaab1b8); b.cyl(1.6, 0.3, 0, 3.9, 0, DARK2); H.boltRing(b, 0, 1.2, 0, 1.95, 12, 0.14);
  for (const x of [-2.4, 2.4]) { b.box(1.2, 2.0, 1.2, x, 1.4, -1.8, OD2); b.cyl6(0.35, 0.4, x, 2.6, -1.8, GLOW); }
  b.rel('turret', 0, 4.2, 0); b.cyl(1.2, 0.5, 0, 0.25, 0, DARK2); b.box(1.8, 1.1, 2.4, 0, 1.0, 0, 0xcfd4da); b.trap(1.8, 0.4, 2.4, 0.8, 0.85, 0, 1.75, 0, WHITE);
  b.barrel(0.3, 3.4, 0, 1.0, 1.0, STEEL); b.cyl(0.45, 0.5, 0, 1.0, 4.2, DARK2, [PI / 2, 0, 0]); b.cyl(0.25, 0.2, 0, 1.0, 4.5, PLASMA, [PI / 2, 0, 0]);
  for (const x of [-0.9, 0.9]) b.box(0.25, 0.25, 2.0, x, 1.3, 0.4, GLOW); H.antenna(b, 0.6, 1.6, -1.0, 1.0);
}
function railgun(b) {
  slab(b, 8, 8, 0.4); b.cyl(2.4, 1.0, 0, 0.9, 0, 0x7a8089); b.box(4.2, 2.0, 3.4, 0, 2.0, -0.4, 0x4a5568); H.boltRing(b, 0, 1.2, 0, 2.45, 14, 0.14);
  b.box(1.4, 1.4, 1.4, 3.0, 1.2, -2.6, OD2); b.box(1.5, 0.15, 1.5, 3.0, 2.0, -2.6, T); acUnit4(b, 3.0, 2.1, -2.6);
  b.rel('turret', 0, 3.0, 0); b.cyl(1.6, 0.4, 0, 0.2, 0, DARK2); b.box(2.6, 1.3, 3.2, 0, 0.95, -0.4, 0xaab2ba); b.trap(2.6, 0.4, 3.2, 0.8, 0.85, 0, 1.8, -0.4, WHITE);
  for (const x of [-0.45, 0.45]) { b.box(0.35, 0.35, 6.4, x, 1.1, 3.4, 0x2a2e33); b.box(0.4, 0.4, 0.5, x, 1.1, 6.7, GLOW); }
  for (let i = 0; i < 4; i++) b.box(1.6, 0.14, 0.14, 0, 1.1, 1.0 + i * 1.3, STEEL);
  b.box(2.2, 0.8, 1.2, 0, 1.2, -2.4, DARK2); for (const x of [-1.2, 1.2]) b.cyl6(0.3, 1.0, x, 1.4, -2.2, GLOW);
}
function acUnit4(b, x, y, z) { b.box(1.0, 0.5, 0.8, x, y + 0.25, z, 0x9aa0a6); b.cyl(0.32, 0.06, x, y + 0.53, z, DARK2); }
function heavyart(b) {   // twin 305 mm siege guns in an armoured casemate
  slab(b, 16, 16, 0.6); b.cyl(5.4, 1.4, 0, 1.3, 0, 0x707780); b.cyl(4.8, 0.4, 0, 2.2, 0, DARK2); H.boltRing(b, 0, 1.4, 0, 5.4, 22, 0.16); H.hazard(b, 0, 0.62, 6.8, 10, 0.5, 8);
  b.box(3.6, 2.4, 3.2, -6.0, 1.8, -5.4, OD2); b.box(3.7, 0.2, 3.3, -6.0, 3.0, -5.4, T); b.box(3.6, 2.0, 3.2, 6.0, 1.6, -5.6, OD2); b.box(3.7, 0.2, 3.3, 6.0, 2.7, -5.6, T);
  for (const x of [-6, 6]) for (let i = 0; i < 3; i++) b.cyl(0.55, 1.2, x - 1 + i, 0.8, 5.8, 0x4a5a3a);
  b.rel('turret', 0, 2.6, 0); b.cyl(3.4, 0.5, 0, 0.25, 0, DARK2); b.box(5.2, 2.4, 6.0, 0, 1.7, -0.6, OD); b.trap(5.2, 0.9, 6.0, 0.7, 0.7, 0, 3.3, -0.6, OD2); b.box(5.0, 0.3, 1.2, 0, 2.2, 2.7, DARK);
  for (const x of [-1.2, 1.2]) { b.barrel(0.52, 11.0, x, 2.1, 2.6, METAL); b.cyl(0.78, 1.8, x, 2.1, 3.0, OD2, [PI / 2, 0, 0]); b.cyl(0.66, 0.9, x, 2.1, 13.8, DARK, [PI / 2, 0, 0]); b.cyl(0.6, 0.7, x, 2.1, 14.4, BLACK, [PI / 2, 0, 0]); }
  b.box(1.4, 1.0, 1.8, 0, 3.7, -2.0, DARK2); H.antenna(b, 1.8, 3.4, -2.8, 1.8); H.hatch(b, -1.4, 3.8, -1.4, 0.4);
}
function abm(b) {   // anti-ballistic battery: phased array radar and four tall interceptor canisters
  slab(b, 12, 12, 0.5); b.box(4.0, 3.0, 3.4, -3.2, 2.0, -3.2, 0x6f777e); b.box(4.1, 0.2, 3.5, -3.2, 3.6, -3.2, T); H.vent(b, -3.2, 3.7, -3.2, 2.4, 1.2, 4); door(b, -3.2, 1.3, -1.5);
  b.rel('rotor', 3.0, 4.6, -3.0); b.cyl(1.4, 0.9, 0, -0.4, 0, DARK2); b.box(3.4, 3.4, 0.5, 0, 1.7, 0, 0x2b3947); b.box(3.0, 3.0, 0.2, 0, 1.7, 0.32, 0x14202b);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) b.box(0.3, 0.3, 0.1, -1.25 + i * 0.5, 0.5 + j * 0.5, 0.45, 0x35506b);
  b.g('hull'); b.cyl(1.0, 3.0, 3.0, 2.0, -3.0, 0x7d838a); b.cyl(1.6, 0.4, 3.0, 0.6, -3.0, DARK2);
  b.rel('turret', 0, 1.2, 3.2);
  b.box(6.0, 0.6, 3.0, 0, 0.1, 0, DARK2); for (const x of [-2.1, -0.7, 0.7, 2.1]) { b.cyl(0.48, 5.4, x, 3.0, 0.4, 0xdadde0, [-0.9, 0, 0]); b.cone(0.48, 1.0, x, 5.6, 2.0, RED, [-0.9, 0, 0]); b.cyl(0.52, 0.2, x, 1.2, -1.2, DARK2, [-0.9, 0, 0]); }
}
function door(b, x, y, z, w = 1.0) { b.box(w + 0.3, 1.8, 0.2, x, y, z, METAL); b.box(w, 1.6, 0.26, x, y, z, DARK); }
function silo(b) {   // hardened missile silo: sliding blast door over the launch tube
  slab(b, 12, 12, 0.5); b.cyl(5.4, 0.9, 0, 0.7, 0, 0x6a7077); b.cyl(4.7, 0.2, 0, 1.25, 0, DARK2); H.boltRing(b, 0, 1.2, 0, 5.4, 20, 0.16); H.hazard(b, 0, 0.52, 5.6, 8, 0.5, 6);
  b.rel('rotor', -1.7, 1.35, 0); b.box(3.4, 0.45, 8.6, 1.7, 0, 0, 0x4c5259); b.box(3.4, 0.1, 8.6, 1.7, 0.3, 0, DARK2); for (let i = 0; i < 5; i++) b.box(3.2, 0.06, 0.14, 1.7, 0.31, -3.2 + i * 1.6, YEL);
  b.g('hull'); b.cyl(2.8, 0.14, 1.7, 1.28, 0, BLACK); b.box(3.0, 2.2, 2.6, -4.2, 1.6, -4.0, OD2); b.box(3.1, 0.2, 2.7, -4.2, 2.8, -4.0, T); door(b, -4.2, 1.4, -2.6); H.antenna(b, -5.2, 3.0, -4.8, 2.0); lampRed(b, 4.6, 1.5, -4.6);
}
function launchpad(b) {   // heavy-lift pad: tower, flame trench and a rocket on the pad
  slab(b, 20, 20, 0.6); b.box(7, 0.2, 7, 0, 0.7, 0, DARK2); b.box(9.6, 0.4, 9.6, 0, 0.65, 0, 0x585e66); H.hazard(b, 0, 0.9, 9.0, 16, 0.6, 12);
  b.box(2.8, 1.2, 10.4, 0, 0.7, 0, 0x2b2f33);
  for (const x of [-3.2, 3.2]) { b.box(1.4, 1.1, 3.0, x, 0.9, 0, 0x6c727a); }
  // gantry tower
  const tx = -6.0; for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [1.2, 1.2], [-1.2, 1.2]]) b.box(0.4, 20, 0.4, tx + dx, 10.5, dz, 0xb94a2a);
  for (let i = 0; i < 9; i++) { const y = 1.5 + i * 2.2; b.box(2.8, 0.18, 0.18, tx, y, -1.2, 0xb94a2a); b.box(2.8, 0.18, 0.18, tx, y, 1.2, 0xb94a2a); b.box(0.18, 0.18, 2.8, tx - 1.2, y, 0, 0xb94a2a); b.box(0.18, 0.18, 2.8, tx + 1.2, y, 0, 0xb94a2a); b.box(0.12, 0.12, 3.3, tx, y + 1.1, 0, 0xb94a2a, [0, 0, 0.8]); }
  for (const y of [9, 14, 18]) b.box(4.8, 0.3, 1.4, tx + 3.0, y, 0, 0xcfd3d8);
  b.sph6(0.3, tx, 21.2, 0, RED); b.cyl6(0.1, 3.0, tx, 22.4, 0, METAL);
  // rocket
  b.cyl(1.5, 14, 1.2, 8.4, 0, 0xe9edf1); b.cone(1.5, 4.0, 1.2, 17.4, 0, 0xe9edf1); b.cyl(1.56, 1.0, 1.2, 12.0, 0, 0x1a1c1f); b.cyl(1.56, 0.5, 1.2, 10.6, 0, 0xdc4a2a);
  b.box(0.2, 5.0, 0.1, 1.2 + 1.6, 6.0, 0, 0x1a1c1f); b.box(0.2, 5.0, 0.1, 1.2 - 1.6, 6.0, 0, 0x1a1c1f); b.box(0.1, 5.0, 0.2, 1.2, 6.0, 1.6, 0x1a1c1f); b.box(0.1, 5.0, 0.2, 1.2, 6.0, -1.6, 0x1a1c1f);
  for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2 + PI / 4; b.cone(0.7, 1.4, 1.2 + Math.cos(a) * 1.7, 2.0, Math.sin(a) * 1.7, STEEL, [PI, 0, 0]); b.cyl(0.6, 4.0, 1.2 + Math.cos(a) * 1.7, 2.5, Math.sin(a) * 1.7, 0xe9edf1); }
  b.box(1.6, 0.14, 0.9, 5.0, 4.0, 0, T); b.box(5.0, 0.2, 0.3, 3.2, 14.0, 0, 0x8a9096);
  b.box(3.4, 2.6, 3.0, 7.0, 1.9, 6.5, OD2); b.box(3.5, 0.2, 3.1, 7.0, 3.3, 6.5, T); b.cyl(1.0, 3.0, 7.0, 1.7, -6.5, 0xaab1b8); b.sph(1.0, 7.0, 3.2, -6.5, 0xaab1b8, 0.6, 1);
}
// strategic missile on its transporter (viewer / spare model)
function icbm(b) {
  b.box(3.0, 0.5, 11, 0, 0.9, 0, 0x4a5a3a); for (const z of [-4, -1.5, 1.5, 4]) { b.cyl(0.9, 0.8, -1.7, 0.7, z, C.RUB, [0, 0, PI / 2]); b.cyl(0.9, 0.8, 1.7, 0.7, z, C.RUB, [0, 0, PI / 2]); }
  b.cyl(0.85, 9.0, 0, 2.2, 0, 0xdadde0, [PI / 2, 0, 0]); b.cone(0.85, 2.2, 0, 2.2, 5.6, 0x2b3128, [PI / 2, 0, 0]); b.cyl(0.9, 0.6, 0, 2.2, 3.4, RED, [PI / 2, 0, 0]);
  for (const a of [0, PI / 2, PI, PI * 1.5]) b.box(0.08, 1.2, 1.4, Math.sin(a) * 0.9, 2.2 + Math.cos(a) * 0.9, -4.0, 0x6b7280, [0, 0, -a]);
}
// ---------------- orbital craft ----------------
export const LATE = { solar, fusion, synth, reserve, wall, bunker, lasertower, railgun, heavyart, abm, silo, launchpad, icbm };
