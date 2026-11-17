// Logistics models: supply truck, aerial tanker, radar decoy, supply depot (plus pallet, wreck and control-point props used by the renderer).
import { C, T, PI } from './model-core.js';
import { AIR } from './model-air.js';
import { DRONES } from './model-drones.js';
const { OD, OD2, OD3, DARK, DARK2, GREY, METAL, STEEL, BLACK, CONC, WHITE, ORANGE, GLASS, YEL, CYAN } = C;
const CRATE = 0x8a6a3c, CRATE2 = 0x6e5430, FUEL = 0xc9ced4;

function supplytruck(b) {
  for (const s of [-1, 1]) for (const z of [-2.0, 0.1, 2.2]) { b.cyl(0.75, 0.55, s * 1.25, 0.75, z, BLACK, [0, 0, PI / 2]); b.cyl(0.4, 0.58, s * 1.25, 0.75, z, METAL, [0, 0, PI / 2]); }
  b.box(2.4, 0.55, 6.6, 0, 1.25, 0, OD2);                                                       // chassis
  b.box(2.3, 1.6, 1.9, 0, 2.1, 2.2, OD); b.box(2.0, 0.7, 0.06, 0, 2.5, 3.18, GLASS); b.box(2.35, 0.1, 0.5, 0, 1.4, 3.35, DARK2);   // cab
  b.box(0.5, 0.35, 0.1, 0, 1.2, 3.45, DARK); b.box(2.25, 1.9, 4.0, 0, 2.5, -1.1, OD3);           // cargo box
  b.box(2.3, 0.1, 4.1, 0, 3.5, -1.1, DARK2); b.box(2.31, 0.12, 4.1, 0, 2.5, -1.1, T);            // roof + team stripe
  for (const s of [-1, 1]) { b.box(0.06, 1.2, 3.2, s * 1.16, 2.5, -1.1, DARK2); b.box(0.5, 0.28, 0.5, s * 1.1, 3.0, 3.35, YEL); }
  b.box(1.9, 0.06, 0.6, 0, 3.58, -2.4, CRATE); b.box(1.4, 0.5, 0.9, 0, 3.8, -1.2, CRATE); b.box(1.4, 0.5, 0.9, 0.2, 4.28, -1.1, CRATE2);   // loose crates on the roof
  b.box(0.5, 0.5, 0.5, -0.5, 3.8, -2.8, FUEL); b.cyl(0.32, 0.6, 0.6, 3.85, -2.7, STEEL);
  b.box(0.7, 0.04, 0.7, 0, 2.5, -3.14, ORANGE); b.box(0.5, 0.15, 0.06, 0, 2.6, -3.16, WHITE);   // door marking
  for (const s of [-1, 1]) b.cyl6(0.04, 1.4, s * 1.2, 3.1, 2.9, BLACK);
}
function tanker(b) {
  AIR.airlifter(b); b.g('hull');
  for (const s of [-1, 1]) {   // wing refuelling pods + drogues
    const x = s * 14.5; b.cyl(0.55, 4.4, x, 1.5, 0.5, DARK2, [PI / 2, 0, 0]); b.cyl(0.3, 0.9, x, 1.5, -2.0, METAL, [PI / 2, 0, 0]); b.cyl(0.62, 0.12, x, 1.5, -2.6, YEL, [PI / 2, 0, 0]); b.box(0.9, 0.12, 1.4, x, 2.0, 0.5, OD3);
    b.sph6(0.18, x, 1.5, 3.0, ORANGE); b.box(0.12, 0.12, 0.12, s * 14.5, 1.5, -2.8, CYAN);
  }
  b.box(0.9, 0.8, 7.0, 0, -1.8, -9.5, DARK2); b.cyl(0.22, 9.0, 0, -2.4, -13.0, METAL, [PI / 2 - 0.12, 0, 0]); b.box(2.4, 0.08, 1.0, 0, -3.3, -17.0, YEL); b.box(0.12, 0.7, 1.0, 0.0, -3.0, -16.4, ORANGE);   // flying boom
  b.box(0.8, 0.12, 2.6, 0, 3.5, 4.0, 0xe4e8ec); b.box(0.9, 0.05, 1.6, 0, 3.6, 3.8, T);          // fuselage band
}
function decoy(b) {
  b.sc = 0.75; DRONES.wingman(b); b.g('hull');
  for (const s of [-1, 1]) { b.sph(0.55, s * 2.3, 0.15, -0.6, 0xd7dbe0, 0.9, 0.9); b.cyl6(0.04, 0.6, s * 2.3, -0.3, -0.6, METAL); }
  b.sph(0.6, 0, 0.75, 0.2, 0xd7dbe0, 0.9, 0.9); b.box(1.0, 0.06, 0.1, 0, 0.75, 0.2, ORANGE);       // Luneburg lens reflectors
}
function supplydepot(b) {   // 2x2 cells (8 m): fenced yard with a fuel bladder, ammo stacks, a shed and a mast
  b.box(8.0, 0.25, 8.0, 0, 0.12, 0, CONC);
  b.box(3.2, 2.2, 2.6, -2.2, 1.4, -2.4, OD2); b.box(3.3, 0.18, 2.7, -2.2, 2.6, -2.4, DARK2); b.box(1.1, 1.5, 0.06, -2.2, 1.0, -0.99, DARK); b.box(3.3, 0.1, 2.7, -2.2, 2.0, -2.4, T);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { b.box(1.2, 0.8, 1.0, 1.4 + i * 1.3, 0.65, 1.0 + j * 1.2, ((i + j) & 1) ? 0x8a6a3c : 0x6e5430); b.box(1.2, 0.05, 1.0, 1.4 + i * 1.3, 1.08, 1.0 + j * 1.2, YEL); }
  for (let i = 0; i < 2; i++) b.box(1.2, 0.8, 1.0, 2.0 + i * 1.3, 1.45, 1.6, 0x8a6a3c);
  b.cyl(1.0, 2.2, 2.2, 1.3, -2.4, FUEL, [0, 0, PI / 2]); b.cyl(1.04, 0.12, 1.2, 1.3, -2.4, DARK2, [0, 0, PI / 2]); b.cyl(1.04, 0.12, 3.2, 1.3, -2.4, DARK2, [0, 0, PI / 2]); b.cyl6(0.1, 0.6, 2.2, 2.6, -2.4, METAL);
  b.cyl6(0.08, 5.0, -3.6, 2.5, 3.0, METAL); b.box(1.4, 0.9, 0.05, -2.95, 4.6, 3.0, T); b.box(0.25, 0.25, 0.25, -3.6, 5.1, 3.0, 0xfff1a0);
  for (const s of [-1, 1]) { b.box(8.0, 0.8, 0.1, 0, 0.7, s * 3.95, METAL); b.box(0.1, 0.8, 8.0, s * 3.95, 0.7, 0, METAL); }
  for (const x of [-3.9, 3.9]) for (const z of [-3.9, 3.9]) b.cyl6(0.1, 1.1, x, 0.8, z, DARK2);
  b.box(1.4, 0.04, 1.4, 0, 0.28, 0.5, YEL); b.box(1.3, 0.05, 0.12, 0, 0.3, 0.5, WHITE); b.box(0.12, 0.05, 1.3, 0, 0.3, 0.5, WHITE);   // supply marking
}
export const LOGI = { supplytruck, tanker, decoy, supplydepot };
export function palletModel(b) { b.box(1.4, 0.2, 1.4, 0, 0.1, 0, DARK2); b.box(1.2, 0.9, 1.2, 0, 0.65, 0, CRATE); b.box(1.25, 0.1, 1.25, 0, 0.9, 0, OD); b.box(0.5, 0.5, 0.05, 0, 0.7, 0.62, YEL); }
