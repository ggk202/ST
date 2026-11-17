// Detailed structure models (local space, footprint centred). Spinning parts live in the `rotor` group, aimed parts in `turret`.
import { C, T, PI, H } from './model-core.js';
const { OD, OD2, OD3, DARK, DARK2, GREY, METAL, STEEL, BLACK, CONC, WHITE, ORANGE, GLASS, RED, LAMP, CYAN, YEL, PANEL } = C;
const WALL = 0x7a8089, WALL2 = 0x636a72;

// row of windows along a wall; axis 'x' (wall faces +/-z) or 'z' (wall faces +/-x)
function windows(b, cx, y, cz, len, n, axis = 'x', face = 1, h = 0.8, lit = 0.25) {
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5, w = len / n * 0.62, on = ((i * 7 + Math.round(cx + cz)) % 4) < 1;
    const col = on ? 0xffe9a0 : GLASS;
    if (axis === 'x') { b.box(w, h, 0.12, cx + t * len, y, cz, DARK2); b.box(w * 0.86, h * 0.82, 0.14, cx + t * len, y, cz + face * 0.02, col); b.box(w, 0.08, 0.2, cx + t * len, y - h * 0.5 - 0.04, cz + face * 0.06, CONC); }
    else { b.box(0.12, h, w, cx, y, cz + t * len, DARK2); b.box(0.14, h * 0.82, w * 0.86, cx + face * 0.02, y, cz + t * len, col); b.box(0.2, 0.08, w, cx + face * 0.06, y - h * 0.5 - 0.04, cz + t * len, CONC); }
  }
}
function slab(b, w, d, h = 0.5) { b.box(w, h, d, 0, h / 2, 0, CONC); b.box(w + 0.1, 0.1, d + 0.1, 0, h, 0, 0x6e7277); H.boltLine(b, -w / 2 + 0.3, h + 0.07, -d / 2 + 0.3, w / 2 - 0.3, h + 0.07, -d / 2 + 0.3, 6, 0.12); H.boltLine(b, -w / 2 + 0.3, h + 0.07, d / 2 - 0.3, w / 2 - 0.3, h + 0.07, d / 2 - 0.3, 6, 0.12); }
function mast(b, x, y, z, h, arms = 3) {
  b.cyl6(0.14, h, x, y + h / 2, z, METAL); for (let i = 0; i < arms; i++) { const yy = y + h * (0.45 + i * 0.2), w = 1.4 - i * 0.35; b.box(w, 0.08, 0.08, x, yy, z, GREY); b.box(0.08, 0.08, w * 0.7, x, yy + 0.2, z, GREY); }
  b.sph6(0.18, x, y + h + 0.1, z, RED); b.box(0.1, 0.1, 0.1, x, y + h * 0.5, z + 0.2, LAMP);
}
function acUnit(b, x, y, z, w = 1.4, d = 1.0) { b.box(w, 0.7, d, x, y + 0.35, z, 0x9aa0a6); b.cyl(d * 0.4, 0.06, x, y + 0.73, z, DARK2); for (let i = 0; i < 4; i++) b.box(0.03, 0.04, d * 0.8, x - w * 0.35 + i * w * 0.23, y + 0.77, z, METAL); H.boltLine(b, x - w / 2, y + 0.1, z + d / 2 + 0.01, x + w / 2, y + 0.1, z + d / 2 + 0.01, 3, 0.07); }
function tank(b, x, y, z, r, h, col = 0xaab0b5) { b.cyl(r, h, x, y + h / 2, z, col); b.cyl(r * 1.02, 0.14, x, y + h * 0.25, z, DARK2); b.cyl(r * 1.02, 0.14, x, y + h * 0.75, z, DARK2); b.sph(r, x, y + h, z, col, 0.3); b.box(0.12, h, 0.14, x + r, y + h / 2, z, METAL); H.boltRing(b, x, y + h * 0.5, z, r * 1.01, 8, 0.1); }
function door(b, x, y, z, w, h, axis = 'z', face = 1, col = DARK) {
  if (axis === 'z') { b.box(w + 0.3, h + 0.2, 0.2, x, y, z, METAL); b.box(w, h, 0.26, x, y, z + face * 0.02, col); for (let i = 1; i < 5; i++) b.box(w, 0.05, 0.3, x, y - h / 2 + i * h / 5, z + face * 0.03, DARK2); b.box(w * 0.8, 0.12, 0.34, x, y + h / 2 - 0.1, z + face * 0.04, YEL); }
  else { b.box(0.2, h + 0.2, w + 0.3, x, y, z, METAL); b.box(0.26, h, w, x + face * 0.02, y, z, col); for (let i = 1; i < 5; i++) b.box(0.3, 0.05, w, x + face * 0.03, y - h / 2 + i * h / 5, z, DARK2); }
}
function lampPost(b, x, z, h = 3) { b.cyl6(0.07, h, x, h / 2, z, METAL); b.box(0.5, 0.12, 0.3, x, h, z, DARK2); b.box(0.4, 0.05, 0.22, x, h - 0.08, z, LAMP); }
function stairs(b, x, y0, z, n, axis = 'z') { for (let i = 0; i < n; i++) b.box(axis === 'z' ? 1.2 : 0.4, 0.12, axis === 'z' ? 0.4 : 1.2, x + (axis === 'x' ? i * 0.4 : 0), y0 + i * 0.28, z + (axis === 'z' ? i * 0.4 : 0), METAL); }
function pipeRun(b, x0, y0, z0, x1, y1, z1, r = 0.12, col = STEEL) { b.pipe(x0, y0, z0, x1, y1, z1, r, col); b.sph6(r * 1.4, x0, y0, z0, DARK2); b.sph6(r * 1.4, x1, y1, z1, DARK2); }
function parapet(b, w, d, y, col) { b.box(w, 0.35, 0.25, 0, y, d / 2, col); b.box(w, 0.35, 0.25, 0, y, -d / 2, col); b.box(0.25, 0.35, d, w / 2, y, 0, col); b.box(0.25, 0.35, d, -w / 2, y, 0, col); }
function flag(b, x, y, z, h) { b.cyl6(0.07, h, x, y + h / 2, z, STEEL); b.box(0.04, 0.9, 1.4, x, y + h - 0.5, z - 0.75, T); b.sph6(0.1, x, y + h + 0.05, z, C.GOLD); }
function sandbags(b, x, z, n, r = 0, y = 0) { for (let i = 0; i < n; i++) { const a = r + i / n * PI; b.box(0.7, 0.36, 0.4, x + Math.cos(a) * 1.0, y + 0.2, z + Math.sin(a) * 1.0, 0x8a7f5a, [0, -a, 0]); b.box(0.7, 0.34, 0.4, x + Math.cos(a) * 1.0, y + 0.55, z + Math.sin(a) * 1.0, 0x7e7452, [0, -a + 0.3, 0]); } }

function hq(b) {
  slab(b, 16, 16, 0.8); H.hazard(b, 0, 0.82, 7.2, 10, 0.5, 8);
  b.box(10, 5.6, 9, 0, 3.6, 0, WALL2); b.box(10.3, 0.7, 9.3, 0, 6.5, 0, T); parapet(b, 10.3, 9.3, 7.0, OD2);
  for (const y of [2.8, 5.0]) { windows(b, 0, y, 4.52, 8.6, 6, 'x', 1, 0.9); windows(b, 0, y, -4.52, 8.6, 6, 'x', -1, 0.9); windows(b, 5.02, y, 0, 7.4, 5, 'z', 1, 0.9); windows(b, -5.02, y, 0, 7.4, 5, 'z', -1, 0.9); }
  door(b, 0, 2.0, 4.55, 2.4, 2.6); b.box(3.6, 0.2, 1.6, 0, 3.6, 5.2, OD2); b.box(0.2, 2.8, 0.2, -1.7, 2.1, 5.8, METAL); b.box(0.2, 2.8, 0.2, 1.7, 2.1, 5.8, METAL); stairs(b, 0.0, 0.8, 6.6, 3, 'z');   // entrance canopy
  b.box(5, 3.2, 5, 0, 8.8, 0, GREY); b.box(5.3, 0.5, 5.3, 0, 10.5, 0, T); parapet(b, 5.3, 5.3, 10.9, OD2); for (const s of [-1, 1]) windows(b, 0, 9.0, s * 2.52, 4.2, 4, 'x', s, 1.2); for (const s of [-1, 1]) windows(b, s * 2.52, 9.0, 0, 4.2, 4, 'z', s, 1.2);
  mast(b, 4.5, 6.8, 4.0, 6.5); mast(b, -4.5, 6.8, -3.8, 5); b.cyl(0.9, 0.3, -2.0, 7.0, 2.0, WHITE); b.cone(0.9, 0.5, -2.0, 7.4, 2.0, STEEL); b.cyl6(0.1, 0.6, -2.0, 7.1, 2.0, METAL);   // SATCOM dish
  acUnit(b, 3.0, 6.9, -2.5); acUnit(b, -3.0, 6.9, -2.5); acUnit(b, 3.0, 6.9, 0.4, 1.2, 0.9); H.vent(b, 0, 7.0, -3.0, 2.4, 1.5, 5);
  for (const [x, z] of [[-6.2, 6.2], [6.2, -6.2], [6.2, 6.2], [-6.2, -6.2]]) { b.box(3, 2.4, 3, x, 2.0, z, OD); b.box(3.1, 0.3, 3.1, x, 3.3, z, T); door(b, x, 1.6, z + (z > 0 ? 1.52 : -1.52), 1.0, 1.7, 'z', z > 0 ? 1 : -1); windows(b, x + (x > 0 ? -0.2 : 0.2), 2.6, z + (z > 0 ? 1.52 : -1.52), 1.8, 2, 'x', z > 0 ? 1 : -1, 0.5); acUnit(b, x, 3.4, z, 0.9, 0.8); }
  flag(b, -7.2, 0.8, 7.2, 7); for (const x of [-6, 6]) lampPost(b, x, 7.6, 3.2); sandbags(b, 4.5, 6.8, 5, 0.2, 0.8); sandbags(b, -4.5, 6.8, 5, 0.2, 0.8);
  b.box(2.2, 0.4, 0.8, -5.0, 0.95, -6.8, ORANGE); b.cyl(0.45, 1.2, 6.8, 1.4, 0.0, 0x4a5a3a);                                    // pallets, drum
  b.g('rotor'); b.rotorPivot = [0, 11.7, 0];
  b.cyl6(0.15, 0.7, 0, 11.4, 0, METAL); b.cyl(2.0, 0.16, 0, 11.9, 0, GREY, [0.5, 0, 0]); b.cyl(1.7, 0.05, 0, 11.98, 0, 0x2c4a63, [0.5, 0, 0]); b.box(1.2, 0.1, 0.1, 0, 12.2, 0.4, ORANGE); b.box(0.3, 0.5, 0.3, 0.4, 11.55, 0, DARK2);
}

function derrick(b) {
  slab(b, 8, 8, 0.5); H.hazard(b, 0, 0.53, 3.4, 5, 0.4, 6);
  b.box(2.6, 2.2, 3.2, 0, 1.6, -1.8, WALL2); b.box(2.7, 0.2, 3.3, 0, 2.8, -1.8, T); door(b, 0, 1.3, -0.17, 0.9, 1.6); windows(b, 1.32, 1.9, -1.8, 2.2, 2, 'z', 1, 0.5); acUnit(b, 0, 2.9, -2.4, 1.2, 0.8); H.vent(b, 0, 2.95, -1.0, 1.4, 0.8, 4);
  tank(b, 2.6, 0.5, 2.0, 1.1, 2.6); tank(b, 2.6, 0.5, -0.2, 0.9, 2.0, 0xa0a6aa); b.cyl(0.35, 4.2, -2.6, 2.6, 2.4, DARK); b.cyl(0.5, 0.3, -2.6, 4.8, 2.4, METAL); b.cyl(0.2, 0.9, -2.6, 5.2, 2.4, 0x2a2420); b.sph6(0.36, -2.6, 4.7, 2.4, ORANGE);   // flare stack
  pipeRun(b, 1.2, 0.9, 1.5, 0, 0.9, 0.2, 0.14); pipeRun(b, 0, 0.9, 0.2, -2.6, 0.9, 2.4, 0.14, YEL); pipeRun(b, 0, 1.3, 0.2, 0, 1.3, 1.1, 0.1); b.box(0.5, 0.5, 0.5, -1.0, 1.1, 1.3, RED); b.cyl6(0.2, 0.1, -1.0, 1.4, 1.3, METAL);   // manifold + valve
  b.box(1.0, 1.4, 0.9, 0, 1.2, 1.4, DARK); b.box(0.5, 3.8, 0.5, 0, 2.4, 1.0, METAL); b.box(0.9, 0.15, 0.9, 0, 0.7, 1.0, DARK2); b.box(0.2, 3.8, 0.2, 0, 2.3, 0.45, STEEL, [0.3, 0, 0]); b.box(0.2, 3.8, 0.2, 0, 2.3, 1.55, STEEL, [-0.3, 0, 0]);   // samson post + brace
  b.box(1.2, 0.8, 0.8, 0, 4.3, 1.0, METAL); b.cyl6(0.3, 0.5, 0, 4.2, 1.0, DARK2, [0, 0, PI / 2]);
  b.g('rotor'); b.rotorPivot = [0, 4.0, 1.0];                                                         // walking beam
  b.box(0.5, 0.6, 6.4, 0, 4.0, 1.0, OD); b.box(0.9, 1.1, 0.9, 0, 4.0, -2.2, DARK); b.box(0.95, 0.15, 0.95, 0, 4.6, -2.2, T); b.box(0.5, 0.6, 1.0, 0, 4.0, 4.0, 0x7a7f86); b.box(0.2, 0.2, 1.0, 0, 4.2, 4.5, DARK2);
  b.cyl6(0.08, 2.6, 0, 2.6, 4.1, STEEL); b.box(0.3, 0.3, 0.3, 0, 1.3, 4.1, DARK2); H.boltLine(b, -0.2, 4.35, -2.0, 0.2, 4.35, 4.0, 6, 0.08); b.box(0.3, 0.2, 2.0, 0, 4.45, 0.0, ORANGE);
}

function barracks(b) {
  slab(b, 12, 12, 0.5); H.hazard(b, 0, 0.53, 5.4, 6, 0.4, 6);
  b.box(9.4, 3.2, 6.4, 0, 2.1, -1.0, OD); b.box(9.8, 0.5, 6.8, 0, 3.95, -1.0, T); parapet(b, 9.8, 6.8, 4.35, OD2);
  b.box(9.4, 0.3, 3.2, 0, 3.5, 3.6, METAL); for (const x of [-4.5, -1.5, 1.5, 4.5]) b.box(0.25, 3.1, 0.25, x, 1.8, 5.0, STEEL); b.box(9.4, 0.2, 0.2, 0, 3.4, 5.1, DARK2);   // covered drill porch
  for (const y of [2.4]) windows(b, 0, y, 2.22, 8.0, 5, 'x', 1, 0.9);
  windows(b, 4.72, 2.4, -1.0, 5.0, 4, 'z', 1, 0.9); windows(b, -4.72, 2.4, -1.0, 5.0, 4, 'z', -1, 0.9); door(b, 0, 1.7, 2.25, 2.2, 2.4); door(b, 3.2, 1.5, 2.25, 1.2, 2.0, 'z', 1, OD2);
  b.box(2.2, 2.2, 2.0, 0, 1.6, 3.8, 0x3a3d40, [0, 0, 0]); b.box(2.0, 1.9, 0.1, 0, 1.6, 4.82, 0x2c3034);                                                                // gear locker bay
  for (let i = 0; i < 5; i++) b.box(0.9, 0.3, 0.35, -3.6 + i * 1.8, 0.55, 3.2, OD3);                                                                                          // footlockers
  acUnit(b, -3.0, 4.5, -2.0); acUnit(b, 3.0, 4.5, -2.0, 1.2, 0.9); H.vent(b, 0, 4.5, -3.0, 2.0, 1.2, 5); b.cyl(0.4, 1.8, -4.3, 5.4, -3.8, METAL); b.cyl(0.46, 0.15, -4.3, 6.3, -3.8, DARK2); b.cyl(0.4, 1.2, -3.2, 5.2, -3.8, METAL);
  flag(b, 5.2, 0.5, -5.0, 6); mast(b, -4.5, 4.4, 1.0, 3.2, 2); lampPost(b, -5.5, 5.0, 3.2); lampPost(b, 5.5, 5.0, 3.2); sandbags(b, -3.8, 5.6, 5, 0.1, 0.5); sandbags(b, 3.8, 5.6, 5, 0.1, 0.5);
  b.box(1.2, 1.0, 0.8, 5.2, 0.9, 3.0, DARK); H.boltLine(b, 4.7, 1.4, 3.42, 5.7, 1.4, 3.42, 3, 0.08); b.box(0.7, 0.9, 0.04, -5.2, 2.0, 2.26, T);
}

function factory(b) {
  slab(b, 16, 16, 0.5); H.hazard(b, 0, 0.53, 7.2, 8, 0.5, 8);
  b.box(13, 5.6, 11, 0, 3.3, -1.5, WALL2); b.box(13.4, 0.7, 11.4, 0, 6.5, -1.5, T); b.box(13, 0.4, 11, 0, 7.0, -1.5, OD2); for (let i = 0; i < 6; i++) b.box(2.0, 0.5, 11.2, -5.4 + i * 2.15, 7.35, -1.5, OD2, [0, 0, 0]);   // saw-tooth roof
  for (let i = 0; i < 6; i++) b.box(2.0, 0.4, 0.1, -5.4 + i * 2.15, 7.45, 4.2, GLASS);
  b.box(7.0, 4.6, 0.4, 0, 2.8, 4.1, METAL); b.box(6.4, 4.2, 0.46, 0, 2.7, 4.12, DARK); for (let i = 1; i < 8; i++) b.box(6.4, 0.07, 0.5, 0, 0.6 + i * 0.5, 4.14, DARK2); H.hazard(b, 0, 5.0, 4.4, 6.8, 0.15, 10); b.box(0.2, 4.6, 0.5, -3.6, 2.8, 4.2, YEL); b.box(0.2, 4.6, 0.5, 3.6, 2.8, 4.2, YEL);   // roller door
  windows(b, -4.6, 4.4, 4.32, 3.2, 3, 'x', 1, 0.9); windows(b, 4.6, 4.4, 4.32, 3.2, 3, 'x', 1, 0.9); windows(b, 6.52, 4.4, -1.5, 8.0, 5, 'z', 1, 0.9); windows(b, -6.52, 4.4, -1.5, 8.0, 5, 'z', -1, 0.9);
  tank(b, -5.0, 7.3, -5.0, 0.9, 2.2); b.cyl(0.8, 5.0, -5.0, 9.0, -5.0, METAL); b.cyl(0.85, 0.25, -5.0, 11.4, -5.0, DARK2); b.cyl(0.8, 3.5, -3.0, 8.3, -5.0, METAL); b.cyl(0.85, 0.25, -3.0, 10.0, -5.0, DARK2); b.cyl(0.5, 1.2, -1.2, 7.7, -5.0, METAL);
  pipeRun(b, -5.0, 9.0, -4.2, -5.0, 9.0, 0.5, 0.15); pipeRun(b, -3.0, 7.5, -4.2, -3.0, 7.5, 0.5, 0.12, YEL);
  b.box(4, 2.5, 3, 4.5, 1.8, 6.3, OD); b.box(4.1, 0.25, 3.1, 4.5, 3.1, 6.3, T); door(b, 4.5, 1.5, 7.82, 1.4, 2.2); windows(b, 6.52, 2.1, 6.3, 2.2, 2, 'z', 1, 0.7); b.box(3.4, 0.5, 2.4, 4.5, 3.5, 6.3, METAL);
  b.box(0.4, 6.0, 0.4, 6.8, 3.6, -1.5, METAL, [0, 0, 0]); b.box(2.0, 0.4, 0.4, 6.8, 6.4, -1.5, METAL); b.box(0.2, 0.6, 0.2, 7.6, 5.9, -1.5, ORANGE); b.box(0.2, 1.0, 0.2, 7.6, 5.0, -1.5, STEEL);   // gantry crane
  acUnit(b, 3.0, 7.0, 0.0, 1.8, 1.2); acUnit(b, 0.0, 7.0, -4.0, 1.8, 1.2); mast(b, 5.5, 7.0, -3.5, 3.5, 2); lampPost(b, -7.0, 7.4, 3.2); lampPost(b, 7.0, 7.4, 3.2);
  for (let i = 0; i < 3; i++) b.box(1.4, 0.9, 1.4, -6.0 + i * 1.5, 0.95, 6.2, OD3); b.box(1.4, 0.6, 1.4, -5.3, 1.7, 6.2, 0x6b6a52);                                // crates
}

function airfield(b) {
  b.box(20, 0.3, 20, 0, 0.15, 0, 0x3a3d42); b.box(20.2, 0.08, 20.2, 0, 0.32, 0, 0x2f3236);
  for (let i = -3; i <= 3; i++) b.box(0.5, 0.05, 2.2, i * 2.4, 0.36, 2, WHITE); b.box(16, 0.04, 0.3, 0, 0.36, -1.0, YEL); for (let i = -4; i <= 4; i++) b.box(0.4, 0.07, 0.4, i * 2.0, 0.38, 9.4, i & 1 ? LAMP : 0x3aff6a);
  b.box(2.4, 0.05, 2.4, 4.0, 0.36, -1.0, YEL); b.box(1.8, 0.06, 0.3, 4.0, 0.38, -1.0, WHITE); b.box(0.3, 0.06, 1.8, 4.0, 0.38, -1.0, WHITE);   // helipad H
  b.box(8, 3.6, 6, -5, 2.1, -6, OD2); b.box(8.3, 0.5, 6.3, -5, 4.0, -6, T); b.box(8, 0.4, 6, -5, 4.45, -6, METAL); door(b, -5, 1.8, -2.96, 5.4, 3.0); windows(b, -9.02, 2.6, -6, 4.2, 3, 'z', -1, 0.9); windows(b, -0.98, 2.6, -6, 4.2, 3, 'z', 1, 0.9);
  for (let i = 0; i < 4; i++) b.box(0.9, 0.04, 1.2, -7.5 + i * 1.65, 4.7, -6, GLASS); acUnit(b, -7.0, 4.65, -7.5); acUnit(b, -3.0, 4.65, -4.5, 1.2, 0.9); b.cyl(0.8, 1.6, -8.5, 1.2, -9.4, 0xaab0b5); b.cyl(0.8, 1.6, -7.0, 1.2, -9.4, 0xaab0b5);
  b.box(2.4, 6, 2.4, 7, 3.3, -6, GREY); H.boltLine(b, 5.9, 0.9, -4.78, 5.9, 5.8, -4.78, 6, 0.1); H.boltLine(b, 8.1, 0.9, -4.78, 8.1, 5.8, -4.78, 6, 0.1); windows(b, 7, 3.2, -4.78, 1.8, 1, 'x', 1, 0.7);
  b.box(3.4, 1.6, 3.4, 7, 6.8, -6, GLASS); for (let i = 0; i < 4; i++) b.box(0.15, 1.7, 0.15, 5.4 + (i % 2) * 3.2, 6.8, -7.6 + Math.floor(i / 2) * 3.2, DARK2); b.box(3.8, 0.35, 3.8, 7, 7.75, -6, T); parapet(b, 3.8, 3.8, 8.1, METAL);
  mast(b, 6.0, 8.1, -7.2, 3.0, 2); b.cyl6(0.1, 1.2, 8.0, 8.5, -4.9, METAL); b.sph6(0.2, 8.0, 9.2, -4.9, WHITE); b.box(0.6, 0.4, 0.6, 7.0, 7.9, -6.0, DARK2);
  b.g('rotor'); b.rotorPivot = [7, 8.9, -6];
  b.cyl6(0.1, 0.5, 7, 8.6, -6, METAL); b.box(2.6, 0.14, 0.3, 7, 8.9, -6, ORANGE); b.box(0.4, 0.2, 0.5, 8.2, 8.9, -6, DARK2); b.box(0.7, 0.35, 0.1, 5.8, 8.9, -6, 0xcfd6dc);
}

function techlab(b) {
  slab(b, 12, 12, 0.5); b.box(8, 3, 8, 0, 2.0, 0, GREY); b.box(8.4, 0.5, 8.4, 0, 3.75, 0, T); parapet(b, 8.4, 8.4, 4.15, METAL);
  windows(b, 0, 2.2, 4.02, 6.6, 4, 'x', 1, 1.0); windows(b, 0, 2.2, -4.02, 6.6, 4, 'x', -1, 1.0); windows(b, 4.02, 2.2, 0, 6.6, 4, 'z', 1, 1.0); windows(b, -4.02, 2.2, 0, 6.6, 4, 'z', -1, 1.0); door(b, 0, 1.6, 4.06, 1.6, 2.2); stairs(b, 0.0, 0.5, 5.0, 2, 'z');
  b.sph(3.2, 0, 4.1, 0, WHITE, 0.8); b.cyl(3.0, 0.3, 0, 4.1, 0, METAL); for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; b.box(0.18, 2.0, 0.08, Math.cos(a) * 2.6, 5.0, Math.sin(a) * 2.6, 0xaab0b5, [0.5, -a, 0.0]); }   // radome ribs
  b.sph6(0.5, 0, 6.6, 0, 0xcfd6dc); b.cyl6(0.2, 0.8, 0, 6.8, 0, METAL); b.box(0.12, 0.8, 0.12, 0, 7.4, 0, RED);
  mast(b, 4.5, 3.9, 4.5, 4.0); acUnit(b, -3.0, 4.0, -3.0); acUnit(b, 3.0, 4.0, -3.0, 1.2, 0.9); tank(b, -5.2, 0.5, 4.4, 0.7, 1.6, 0xb8c0c8); tank(b, -5.2, 0.5, 2.8, 0.7, 1.6, 0xb8c0c8); lampPost(b, 5.5, 5.5, 3);
  b.box(1.2, 1.0, 1.2, 5.0, 0.55, -4.5, DARK); H.vent(b, 5.0, 1.07, -4.5, 0.9, 0.9, 3);
  b.g('rotor'); b.rotorPivot = [-4.2, 5.0, -4.2];
  b.cyl6(0.1, 0.7, -4.2, 4.6, -4.2, METAL); b.cyl(1.4, 0.15, -4.2, 5.1, -4.2, METAL, [0.7, 0, 0]); b.cyl(1.2, 0.05, -4.2, 5.17, -4.2, 0xcfd6dc, [0.7, 0, 0]); b.box(0.12, 0.7, 0.12, -4.2, 5.5, -4.0, STEEL, [0.7, 0, 0]); b.sph6(0.14, -4.2, 5.9, -3.8, ORANGE);
}

function powerplant(b) {
  slab(b, 8, 8, 0.4); H.hazard(b, 0, 0.43, 3.3, 4.5, 0.35, 6);
  b.box(5.2, 2.6, 4.0, 0, 1.7, 1.0, WALL2); b.box(5.4, 0.4, 4.2, 0, 3.2, 1.0, T); parapet(b, 5.4, 4.2, 3.55, OD2); windows(b, 0, 2.3, 3.02, 4.0, 3, 'x', 1, 0.6); door(b, -1.6, 1.4, 3.03, 1.0, 1.8); door(b, 1.6, 1.4, 3.03, 1.0, 1.8, 'z', 1, OD2);
  b.cyl(1.2, 5.0, -2.0, 3.0, -2.2, CONC); b.cyl(1.0, 0.4, -2.0, 5.6, -2.2, DARK); b.cyl(1.25, 0.18, -2.0, 1.4, -2.2, DARK2); b.cyl(1.25, 0.18, -2.0, 3.6, -2.2, DARK2); b.box(0.2, 0.5, 0.4, -2.0, 2.2, -1.0, YEL); stairs(b, -3.4, 0.6, -2.2, 3, 'x');
  b.box(1.8, 1.0, 1.8, 2.4, 2.6, -2.4, METAL); b.cyl(0.5, 1.8, 2.4, 3.8, -2.4, 0x5ec8ff); b.cyl(0.58, 0.14, 2.4, 3.2, -2.4, DARK2); b.cyl(0.58, 0.14, 2.4, 4.4, -2.4, DARK2); b.cyl6(0.05, 1.5, 2.4, 5.2, -2.4, STEEL);
  for (let i = 0; i < 4; i++) b.box(0.9, 0.5, 0.5, 2.2, 1.4, 0.2 + i * 0.0 + (i - 1.5) * 0.0 - 1.4 + i * 0.7, 0x4a5a6e);                       // transformer / battery racks
  b.box(1.2, 1.4, 1.2, 3.1, 1.1, 1.8, 0x4a5568); H.vent(b, 3.1, 1.82, 1.8, 0.9, 0.9, 3); pipeRun(b, -2.0, 4.6, -1.3, 0.0, 3.5, 1.0, 0.14); pipeRun(b, 1.2, 2.6, -2.4, 2.0, 2.6, -2.4, 0.12);
  for (const z of [-0.2, 0.6]) b.cyl6(0.04, 1.2, -3.2, 1.5, z, DARK); b.box(0.7, 0.9, 0.4, -3.2, 1.0, -3.5, DARK); H.boltLine(b, -3.5, 1.4, -3.3, -2.9, 1.4, -3.3, 3, 0.07);
  b.g('rotor').at(-2.0, 6.0, -2.2);
  b.cyl6(0.1, 0.8, -2.0, 5.8, -2.2, METAL); b.box(0.2, 1.6, 0.2, -2.0, 6.2, -2.2, 0x5ec8ff); b.box(1.2, 0.06, 0.06, -2.0, 6.7, -2.2, ORANGE); b.sph6(0.16, -2.0, 7.1, -2.2, RED);
}

function dronebay(b) {
  slab(b, 16, 16, 0.5); H.hazard(b, 0, 0.53, 7.2, 6, 0.4, 8);
  b.box(12, 4.4, 9, 0, 2.7, -2.0, 0x69737d); b.box(12.4, 0.6, 9.4, 0, 5.3, -2.0, T); parapet(b, 12.4, 9.4, 5.75, OD2);
  b.box(8, 3.8, 0.4, 0, 2.5, 2.7, DARK); for (let i = 1; i < 8; i++) b.box(8, 0.05, 0.5, 0, 0.5 + i * 0.47, 2.72, DARK2); b.box(0.3, 3.8, 0.5, -4.1, 2.5, 2.7, YEL); b.box(0.3, 3.8, 0.5, 4.1, 2.5, 2.7, YEL);   // launch hangar door
  b.box(5, 0.6, 3.5, 0, 4.2, 4.5, METAL); for (const x of [-2.2, 2.2]) b.box(0.25, 4.0, 0.25, x, 2.2, 6.0, STEEL); b.box(5, 0.15, 0.15, 0, 4.0, 6.1, DARK2); for (let i = 0; i < 6; i++) b.box(0.4, 0.07, 0.07, -2 + i * 0.8, 3.95, 6.1, i & 1 ? 0xff9a30 : LAMP);
  windows(b, 6.22, 3.0, -2.0, 6.5, 4, 'z', 1, 0.9); windows(b, -6.22, 3.0, -2.0, 6.5, 4, 'z', -1, 0.9); windows(b, 0, 4.0, -6.52, 10, 6, 'x', -1, 0.9);
  for (const [x, z] of [[-4.5, -4.5], [4.5, 4.5]]) { b.cyl(1.8, 0.4, x, 5.9, z, WHITE); b.cyl(1.9, 0.1, x, 5.7, z, METAL); b.sph(1.4, x, 6.1, z, 0xcfd6dc, 0.45); b.cyl6(0.15, 0.6, x, 5.6, z, METAL); H.boltRing(b, x, 6.15, z, 1.7, 8, 0.1); }
  b.box(3, 0.1, 3, 5.5, 0.57, 5.8, WHITE); b.box(2.2, 0.1, 2.2, 5.5, 0.62, 5.8, ORANGE); b.box(1.6, 0.12, 0.2, 5.5, 0.66, 5.8, WHITE); b.box(0.2, 0.12, 1.6, 5.5, 0.66, 5.8, WHITE);             // landing pad
  for (let i = 0; i < 4; i++) b.box(0.3, 0.1, 0.3, 4.2 + (i % 2) * 2.6, 0.62, 4.5 + Math.floor(i / 2) * 2.6, i & 1 ? LAMP : 0x3aff6a);
  for (let i = 0; i < 3; i++) { b.box(0.9, 0.5, 1.4, -5.8 + i * 1.1, 0.8, 5.2, 0x4a5a6e); b.box(0.9, 0.05, 1.0, -5.8 + i * 1.1, 1.07, 5.2, CYAN); }          // charging racks
  acUnit(b, -3, 5.6, -5.0, 1.8, 1.2); acUnit(b, 3.5, 5.6, -5.0, 1.8, 1.2); mast(b, 0, 5.6, -2.0, 4.2, 3); b.cyl6(0.08, 1.0, -6.0, 5.9, -6.0, METAL); b.box(0.6, 0.6, 0.15, -6.0, 6.8, -6.0, GLASS);
  b.g('rotor').at(-4.5, 7.0, -4.5);
  b.cyl6(0.12, 0.8, -4.5, 6.9, -4.5, METAL); b.box(0.2, 1.4, 0.2, -4.5, 7.2, -4.5, METAL); b.box(2.4, 0.14, 0.3, -4.5, 7.9, -4.5, ORANGE); b.box(0.3, 0.14, 1.4, -4.5, 7.9, -4.5, CYAN); b.sph6(0.16, -4.5, 8.1, -4.5, RED);
}

function advtech(b) {
  slab(b, 12, 12, 0.5); b.box(8, 4.2, 8, 0, 2.6, 0, 0x4a5568); b.box(8.4, 0.5, 8.4, 0, 5.1, 0, T); parapet(b, 8.4, 8.4, 5.5, METAL);
  for (const y of [2.0, 3.6]) { windows(b, 0, y, 4.02, 6.6, 5, 'x', 1, 0.9); windows(b, 0, y, -4.02, 6.6, 5, 'x', -1, 0.9); windows(b, 4.02, y, 0, 6.6, 5, 'z', 1, 0.9); windows(b, -4.02, y, 0, 6.6, 5, 'z', -1, 0.9); }
  door(b, 0, 1.6, 4.06, 1.6, 2.2); stairs(b, 0.0, 0.5, 5.0, 2, 'z');
  b.cyl(2.2, 3.2, 0, 7.0, 0, GREY); b.cyl(2.3, 0.2, 0, 5.6, 0, DARK2); b.cyl(2.3, 0.2, 0, 8.2, 0, DARK2); b.sph(3.0, 0, 9.0, 0, WHITE, 0.7); for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; b.box(0.14, 2.0, 0.08, Math.cos(a) * 2.7, 9.0, Math.sin(a) * 2.7, 0xaab0b5, [0.0, -a, 0.0]); b.box(0.2, 0.2, 0.1, Math.cos(a) * 2.2, 7.0, Math.sin(a) * 2.2 + 0.0, CYAN); }
  b.cyl6(0.2, 1.0, 0, 11.3, 0, METAL); b.box(0.3, 6, 0.3, 4.5, 5.5, 4.5, METAL); b.box(0.3, 6, 0.3, -4.5, 5.5, -4.5, METAL); b.sph6(0.2, 4.5, 8.6, 4.5, RED); b.sph6(0.2, -4.5, 8.6, -4.5, RED);
  for (const [x, z] of [[4.5, -4.5], [-4.5, 4.5]]) { b.cyl(1.0, 0.3, x, 5.7, z, WHITE); b.cone(1.0, 0.5, x, 6.1, z, STEEL); b.cyl6(0.08, 0.5, x, 5.5, z, METAL); }
  tank(b, 5.2, 0.5, 5.0, 0.7, 1.6, 0xb8c0c8); acUnit(b, -3.0, 5.4, 3.0); acUnit(b, 3.0, 5.4, -3.0, 1.2, 0.9); pipeRun(b, 5.2, 1.5, 4.3, 3.9, 2.0, 3.2, 0.12, CYAN); lampPost(b, -5.5, 5.5, 3.2); lampPost(b, 5.5, -5.5, 3.2);
  b.g('rotor').at(0, 12.0, 0);
  b.cyl6(0.1, 0.8, 0, 11.7, 0, METAL); b.cyl(1.7, 0.15, 0, 12.1, 0, 0x5ec8ff, [0.6, 0, 0]); b.cyl(1.4, 0.05, 0, 12.18, 0, 0xcfefff, [0.6, 0, 0]); b.box(0.2, 1.4, 0.2, 0, 11.5, 0, METAL); b.sph6(0.16, 0, 12.8, 0.4, ORANGE);
}

function ewtower(b) {
  slab(b, 6, 6, 0.4); b.box(2.6, 1.6, 2.6, 0, 1.2, 0, OD2); b.box(2.7, 0.15, 2.7, 0, 2.05, 0, T); door(b, 0, 1.0, 1.32, 0.8, 1.4); windows(b, 1.32, 1.5, 0, 1.6, 1, 'z', 1, 0.4); acUnit(b, 0, 2.1, 0.0, 1.0, 0.8); b.cyl(0.5, 1.2, 2.2, 1.0, 1.8, 0x4a5a3a); b.box(1.0, 0.9, 0.7, -2.2, 0.9, 1.8, DARK); H.vent(b, -2.2, 1.37, 1.8, 0.8, 0.5, 3);
  for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) b.pipe(x, 2.1, z, x * 0.45, 11.0, z * 0.45, 0.07, METAL);                // lattice legs
  for (let i = 0; i < 9; i++) { const y = 2.6 + i * 1.0, k = 1 - (y - 2.1) / 9.5 * 0.55; for (const s of [-1, 1]) { b.box(1.0 * k, 0.06, 0.06, 0, y, s * 0.5 * k, METAL); b.box(0.06, 0.06, 1.0 * k, s * 0.5 * k, y, 0, METAL); } }
  for (const y of [4, 6.5, 9]) { const w = 3.0 - (y - 4) * 0.18; b.box(0.2, 0.2, w, 0, y, 0, GREY); b.box(0.2, 0.2, w * 0.6, w * 0.3, y + 0.3, 0, GREY); for (const s of [-1, 1]) b.box(0.1, 0.5, 0.3, 0, y + 0.15, s * w * 0.5, CYAN); b.box(0.4, 0.4, 0.4, 0.5, y, 0, DARK2); }
  for (const s of [-1, 1]) { b.box(0.5, 1.2, 0.1, s * 0.6, 7.6, 0.0, 0x2c4a63); b.box(0.5, 1.2, 0.1, 0.0, 5.2, s * 0.6, 0x2c4a63, [0, PI / 2, 0]); }       // phased panels
  b.box(1.6, 0.9, 1.6, 0, 10.9, 0, DARK2); b.box(1.7, 0.2, 1.7, 0, 11.4, 0, T); H.vent(b, 0, 11.52, 0, 1.2, 1.2, 4); b.cyl6(0.06, 1.2, 0, 12.4, 0, METAL); b.sph6(0.14, 0, 13.1, 0, RED); b.box(0.2, 0.2, 0.2, 0.9, 11.0, 0, LAMP);
  b.g('rotor').at(0, 11.9, 0);
  b.cyl6(0.1, 0.5, 0, 11.75, 0, METAL); b.cyl(1.3, 0.16, 0, 12.0, 0, WHITE, [0.5, 0.0, 0]); b.cyl(1.1, 0.05, 0, 12.08, 0, 0x2c4a63, [0.5, 0, 0]); b.box(0.12, 0.8, 0.12, 0, 11.8, 0, METAL); b.sph6(0.12, 0, 12.4, 0.5, ORANGE);
}

function turret(b) {
  b.cyl(2.0, 0.6, 0, 0.3, 0, CONC); b.cyl(1.7, 1.0, 0, 1.0, 0, 0x7a7f86); b.cyl(1.2, 1.4, 0, 1.6, 0, OD2); b.box(3.0, 0.3, 3.0, 0, 0.15, 0, CONC); H.boltRing(b, 0, 0.7, 0, 1.85, 12, 0.14); H.hazard(b, 0, 0.32, 1.3, 2.4, 0.4, 5);
  b.box(0.6, 0.9, 0.1, -1.6, 0.6, 0.0, DARK); b.box(1.0, 0.5, 0.7, 1.7, 0.55, -0.6, 0x8a7f5a); sandbags(b, 0, 0, 7, -0.5, 0.0); b.box(0.9, 0.7, 0.6, 1.0, 0.5, 1.6, DARK); H.boltLine(b, 0.6, 0.9, 1.92, 1.4, 0.9, 1.92, 3, 0.07);
  b.g('turret'); b.pivot = [0, 2.5, 0];
  b.cyl(1.3, 0.2, 0, 2.3, 0, DARK2); b.box(1.9, 1.0, 2.1, 0, 2.6, -0.05, OD); b.trap(1.9, 0.35, 2.1, 0.8, 0.85, 0, 3.25, -0.05, OD2); b.box(2.0, 0.2, 2.2, 0, 2.15, -0.05, T);
  b.box(1.0, 0.8, 0.5, 0, 2.6, 1.2, OD3); b.barrel(0.22, 3.4, 0, 2.6, 1.4, METAL); b.cyl(0.3, 0.5, 0, 2.6, 3.9, DARK, [PI / 2, 0, 0]); b.cyl(0.26, 0.3, 0, 2.6, 4.7, BLACK, [PI / 2, 0, 0]); b.cyl(0.3, 1.4, 0, 2.6, 2.4, OD3, [PI / 2, 0, 0]);
  b.barrel(0.09, 2.2, 0.7, 2.8, 1.0, BLACK); b.box(0.3, 0.3, 0.5, 0.7, 2.8, 1.0, METAL); H.sight(b, -0.55, 3.45, 0.6, 1.0); H.hatch(b, 0.45, 3.45, -0.6, 0.3); H.rcws(b, -0.4, 3.5, -0.7, 0.8);
  H.smoke(b, -1.0, 2.9, 0.2, -1, 3); H.smoke(b, 1.0, 2.9, 0.2, 1, 3); H.antenna(b, 0.8, 3.1, -1.0, 1.4); H.apsPanel(b, 1.0, 3.0, 0.5, 0.9, 0.8); H.apsPanel(b, -1.0, 3.0, 0.5, -0.9, 0.8); b.box(1.9, 0.6, 0.6, 0, 2.6, -1.4, OD2); H.boltLine(b, -0.8, 2.95, -1.4, 0.8, 2.95, -1.4, 4, 0.07);
}

function sam(b) {
  slab(b, 8, 8, 0.4); b.cyl(1.7, 1.4, 0, 1.1, 0, OD2); b.cyl(2.0, 0.3, 0, 0.55, 0, 0x7a7f86); H.boltRing(b, 0, 1.0, 0, 1.75, 12, 0.14); b.box(1.6, 1.4, 1.6, 3.0, 1.1, -2.6, OD); b.box(1.7, 0.2, 1.7, 3.0, 1.9, -2.6, T); door(b, 3.0, 0.9, -1.78, 0.8, 1.2); acUnit(b, 3.0, 2.0, -2.6, 0.9, 0.8);
  b.box(1.4, 1.8, 1.0, -3.0, 1.3, -2.4, 0x3a3d40); b.cyl(0.4, 1.6, -3.0, 1.5, 2.4, 0x3a3d40); sandbags(b, 0, 0, 7, 3.3, 0.0); lampPost(b, -3.2, 3.0, 3.0); b.box(0.8, 0.5, 0.5, 2.8, 0.6, 3.0, OD3); b.box(0.8, 0.5, 0.5, 2.8, 0.6, 3.6, OD3); b.box(0.8, 0.5, 0.5, 2.8, 1.1, 3.3, 0x6b6a52);
  b.g('turret'); b.pivot = [0, 2.2, 0];
  b.cyl(1.4, 0.2, 0, 2.0, 0, DARK2); b.box(2.6, 0.7, 3.0, 0, 2.3, 0, OD); b.box(2.7, 0.15, 3.1, 0, 2.72, 0, T); b.box(2.6, 0.7, 0.2, 0, 2.3, -1.6, METAL); H.vent(b, 0, 2.7, -1.0, 1.4, 0.9, 4);
  b.box(0.9, 1.0, 0.5, 0, 3.0, -1.6, DARK2); b.box(0.8, 0.9, 0.1, 0, 3.0, -1.88, 0x2c4a63); for (let i = 0; i < 4; i++) b.box(0.7, 0.03, 0.1, 0, 2.7 + i * 0.2, -1.95, 0x4a7090);       // tracking radar
  for (const x of [-0.65, 0.65]) for (const y of [2.9, 3.6]) { b.barrel(0.3, 3.4, x, y, -0.8, WHITE, 0.75); b.barrel(0.34, 0.2, x, y, -0.7, DARK2, 0.75); b.cone(0.3, 0.6, x, y + Math.sin(0.75) * 3.4 + 0.2, -0.8 + Math.cos(0.75) * 3.4 + 0.2, ORANGE, [PI / 2 - 0.75, 0, 0]); b.barrel(0.1, 0.1, x, y, -0.78, T, 0.75); }
  b.box(0.2, 1.8, 0.2, -1.5, 3.0, 0.5, METAL); H.antenna(b, 1.3, 2.9, 1.0, 1.2); b.sph6(0.2, -1.2, 3.1, 1.2, DARK2); b.sph6(0.1, -1.2, 3.15, 1.35, GLASS); H.panel(b, 0.8, 2.75, 0.8, 0.6, 0.6); b.box(0.2, 0.3, 0.3, 1.1, 2.9, -1.5, ORANGE);
}

function radar(b) {   // ground air-search radar: operations shelter, pedestal and a big rotating dish
  slab(b, 6, 6, 0.4); b.box(2.4, 1.5, 2.2, 1.5, 1.15, -1.6, OD2); b.box(2.5, 0.15, 2.3, 1.5, 1.95, -1.6, T); door(b, 1.5, 1.0, -0.47, 0.8, 1.3); acUnit(b, 1.5, 2.0, -1.6, 0.9, 0.8); b.cyl(0.4, 1.0, -2.2, 0.9, 1.9, 0x4a5a3a);
  b.cyl(0.9, 3.4, -0.3, 2.1, 0.8, METAL); b.cyl(1.1, 0.3, -0.3, 0.55, 0.8, DARK2); b.cyl6(0.5, 1.2, -0.3, 4.4, 0.8, DARK2); for (const a of [0, 1, 2, 3]) b.box(0.12, 2.2, 0.12, -0.3 + Math.cos(a * 1.571) * 0.8, 1.8, 0.8 + Math.sin(a * 1.571) * 0.8, METAL, [Math.sin(a * 1.571) * 0.3, 0, -Math.cos(a * 1.571) * 0.3]);
  b.g('rotor').at(-0.3, 5.2, 0.8);
  b.box(6.8, 3.0, 0.3, -0.3, 6.4, 0.8, 0xe8ecef); b.box(7.0, 0.22, 0.4, -0.3, 7.95, 0.8, 0xd0d6dc); b.box(7.0, 0.22, 0.4, -0.3, 4.85, 0.8, 0xd0d6dc); b.box(0.22, 3.2, 0.4, 3.2, 6.4, 0.8, 0xd0d6dc); b.box(0.22, 3.2, 0.4, -3.8, 6.4, 0.8, 0xd0d6dc);
  for (let i = 0; i < 5; i++) b.box(6.4, 0.08, 0.12, -0.3, 5.2 + i * 0.6, 1.0, 0xaab2ba); b.box(0.5, 0.5, 0.9, -0.3, 6.4, -0.2, DARK2); b.sph6(0.16, -0.3, 8.2, 0.8, RED); b.box(0.9, 0.12, 0.12, -0.3, 6.4, -0.6, METAL);
}
export const BUILDINGS = { hq, derrick, barracks, factory, airfield, techlab, powerplant, dronebay, advtech, ewtower, turret, sam, radar };
