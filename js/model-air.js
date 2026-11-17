// Detailed aircraft models (centred on the origin; the renderer lifts them to their altitude).
import { C, T, PI, H } from './model-core.js';
const { OD, OD2, OD3, DARK, DARK2, GREY, METAL, STEEL, BLACK, WHITE, ORANGE, GLASS, RED, LAMP, CYAN, RUB } = C;
const PNL = 0xaab2bb;

function uav(b) {
  b.sph(0.5, 0, 0.05, 1.55, WHITE, 0.9, 1.5); b.box(0.74, 0.62, 2.6, 0, 0, 0, WHITE); b.wedge(0.7, 0.6, 1.4, 0, 0.0, -1.9, WHITE, [0, PI, 0]);
  b.sph(0.34, 0, 0.5, 1.1, 0x4a5058, 0.7, 1.2); b.box(0.5, 0.06, 0.6, 0, 0.25, 0.9, PNL);                                          // sat-comm blister, access panel
  b.sph(0.26, 0, -0.42, 1.4, DARK2); b.sph6(0.14, 0, -0.5, 1.58, GLASS); b.sph6(0.07, 0.1, -0.35, 1.7, 0x4a6a2a);                      // EO/IR ball
  b.box(7.2, 0.08, 0.95, 0, 0.08, 0.1, GREY); b.box(7.2, 0.04, 0.05, 0, 0.1, 0.62, DARK2); b.box(7.0, 0.04, 0.05, 0, 0.1, -0.35, METAL);
  for (const s of [-1, 1]) { b.box(0.08, 0.8, 0.5, s * 3.6, 0.45, 0.2, T, [0, 0, s * 0.18]); b.box(0.3, 0.18, 0.9, s * 2.0, -0.12, 0.1, DARK2); b.box(0.2, 0.2, 0.2, s * 3.5, 0.1, 0.5, s < 0 ? 0xff3a2e : 0x3aff6a); H.panel(b, s * 1.2, 0.14, 0.15, 0.7, 0.5, PNL); }
  for (const s of [-1, 1]) { b.box(1.2, 0.07, 0.5, s * 0.55, 0.34, -1.9, GREY, [0, 0, s * 0.62]); b.box(0.06, 0.7, 0.4, s * 0.4, 0.25, -1.9, GREY, [0, 0, s * 0.62]); }   // V-tail
  b.box(0.5, 0.3, 0.7, 0, 0.0, -1.4, DARK2); b.cyl(0.22, 0.5, 0, 0.0, -2.2, METAL, [PI / 2, 0, 0]); H.antenna(b, 0, 0.3, 0.2, 0.5); H.blade(b, 0.0, -0.3, 1.0, 0.4, 0.2); b.cyl6(0.025, 0.5, 0, 0.0, 1.9, METAL, [PI / 2, 0, 0]);
  b.g('rotor').at(0, 0, -2.45); b.box(1.6, 0.06, 0.12, 0, 0, -2.45, BLACK); b.box(0.12, 1.6, 0.06, 0, 0, -2.45, BLACK); b.cyl6(0.14, 0.3, 0, 0, -2.45, METAL, [PI / 2, 0, 0]);
}

function heli(b) {
  // fuselage
  b.sph(1.25, 0, 0, 0.1, OD, 0.85, 1.35); b.box(1.7, 0.2, 2.4, 0, -0.45, 0.3, OD2); b.box(1.3, 0.7, 2.0, 0, 0.55, -0.4, OD2); H.panel(b, 0, 0.9, -0.4, 0.8, 0.8); H.vent(b, 0.0, 0.9, -1.2, 0.8, 0.5, 4);
  b.box(0.9, 0.9, 0.9, 0, 0.0, 1.7, OD2); b.sph(0.5, 0, 0.1, 2.0, OD, 0.9); b.box(0.8, 0.32, 0.9, 0, 0.45, 1.5, GLASS); b.box(0.9, 0.4, 0.8, 0, 0.55, 0.6, GLASS);                    // tandem cockpit
  b.sph(0.3, 0, 0.62, 0.6, 0x2d4056, 0.7, 1.1); b.sph(0.26, 0, 0.55, 1.5, 0x2d4056, 0.7, 1.1); b.box(0.04, 0.2, 1.6, 0, 0.7, 1.0, DARK2);                                                         // pilot helmets
  b.box(1.0, 0.1, 1.6, 0, 0.7, 2.0, DARK2, [-0.2, 0, 0]); b.box(0.1, 0.3, 0.3, -0.45, 0.55, 2.1, METAL); b.box(0.1, 0.3, 0.3, 0.45, 0.55, 2.1, METAL);                                          // canopy frames
  b.box(0.7, 0.7, 2.6, 0, 0.95, -1.5, OD); b.cyl(0.3, 1.1, 0.0, 0.95, -2.2, DARK2, [PI / 2, 0, 0]); for (const s of [-1, 1]) { b.cyl(0.32, 0.9, s * 0.7, 0.8, -1.7, OD2, [PI / 2, 0, 0]); b.cyl(0.2, 0.3, s * 0.7, 0.8, -2.3, BLACK, [PI / 2, 0, 0]); b.cyl(0.35, 0.06, s * 0.7, 0.8, -1.2, DARK2, [PI / 2, 0, 0]); }   // engine + intakes + IR suppressors
  b.box(0.5, 0.5, 3.8, 0, 0.35, -3.2, OD); b.wedge(0.3, 1.5, 1.2, 0, 0.9, -5.0, OD2, [0, PI, 0]); b.box(2.2, 0.1, 0.8, 0, 0.3, -4.6, OD2); b.box(0.06, 0.6, 0.6, 0, 1.6, -5.0, T);   // tail boom, fin, stabiliser
  b.box(0.1, 0.5, 0.2, 0, -0.3, -4.7, METAL); b.sph6(0.2, 0, -0.65, -4.7, RUB);                                                                                                               // tail wheel
  for (const s of [-1, 1]) {
    b.box(0.9, 0.12, 1.2, s * 1.5, -0.05, 0.1, OD2); b.box(1.1, 0.08, 0.8, s * 2.2, -0.05, 0.1, OD3);                                  // stub wings
    H.pod(b, s * 1.9, -0.3, 0.2, 2, 2, 0.12, 1.5); b.box(0.5, 0.25, 0.6, s * 1.9, 0.0, 0.2, DARK2);                                    // ATGM / rocket pod
    b.cyl(0.22, 1.8, s * 2.7, -0.15, 0.3, OD3, [PI / 2, 0, 0]); b.cone(0.22, 0.5, s * 2.7, -0.15, 1.45, WHITE, [PI / 2, 0, 0]); b.box(0.05, 0.4, 0.5, s * 2.7, -0.15, -0.5, T);   // AAM
    b.box(0.2, 0.4, 0.3, s * 1.0, 0.35, 1.0, DARK2); b.sph6(0.1, s * 1.0, 0.6, 1.1, 0x3a4a2a);                                          // warning receivers
    b.box(0.4, 0.2, 0.7, s * 1.0, -0.25, -0.5, DARK2); H.vent(b, s * 1.0, -0.14, -0.5, 0.3, 0.5, 3);                                    // chaff/flare dispensers
  }
  b.cyl6(0.1, 0.9, 0, 1.2, -0.4, METAL); b.sph(0.26, 0, 1.75, -0.4, DARK2, 0.9); b.sph6(0.12, 0, 1.75, -0.2, GLASS);                      // mast-mounted sight
  H.antenna(b, 0.0, 1.3, -1.1, 0.8); H.blade(b, 0.4, 1.28, -1.9, 0.5, 0.3); b.box(0.2, 0.1, 0.2, 0, -0.5, 0.2, LAMP);
  b.g('turret'); b.pivot = [0, -0.45, 1.9];                                                                                              // chin cannon
  b.sph(0.3, 0, -0.5, 1.9, DARK2, 0.8); b.box(0.28, 0.28, 0.6, 0, -0.55, 2.0, METAL); b.barrel(0.07, 1.3, 0, -0.55, 2.3, BLACK, -0.05); b.cyl(0.1, 0.3, 0, -0.58, 3.5, METAL, [PI / 2, 0, 0]); b.sph6(0.12, 0.2, -0.45, 2.3, GLASS);
  b.g('rotor').at(0, 1.35, 0.1);
  b.cyl(0.35, 0.35, 0, 1.3, 0.1, METAL); b.cyl(0.18, 0.25, 0, 1.6, 0.1, DARK2);
  for (let i = 0; i < 4; i++) { const a = i * PI / 2; b.box(4.3, 0.06, 0.4, Math.sin(a) * 2.3, 1.5, 0.1 + Math.cos(a) * 2.3, i & 1 ? BLACK : 0x2a2d31, [0, a + PI / 2 + 0, 0]); b.box(0.5, 0.07, 0.42, Math.sin(a) * 4.4, 1.5, 0.1 + Math.cos(a) * 4.4, ORANGE, [0, a + PI / 2, 0]); }
  b.g('rotor2').at(0.3, 0.95, -5.0);
  for (let i = 0; i < 2; i++) { b.box(0.05, 1.7, 0.18, 0.3, 0.95, -5.0, BLACK, [i * PI / 2, 0, 0]); } b.cyl6(0.12, 0.14, 0.3, 0.95, -5.0, METAL, [0, 0, PI / 2]);
}

function vtol(b) {
  b.box(1.2, 0.9, 5.6, 0, 0, -0.2, GREY); b.cone(0.62, 2.8, 0, 0.0, 3.8, GREY, [PI / 2, 0, 0]); b.wedge(1.3, 0.5, 2.4, 0, 0.5, 0.2, 0x7a838c); b.box(1.4, 0.2, 5.0, 0, -0.45, -0.2, 0x4a5058);
  b.sph(0.55, 0, 0.55, 1.5, GLASS, 0.6, 1.8); b.box(0.9, 0.05, 1.8, 0, 0.62, 1.5, DARK2); b.sph6(0.2, 0, 0.3, 3.7, GLASS);
  b.box(0.7, 0.3, 0.7, 0, -0.55, 2.2, DARK2); b.sph6(0.22, 0, -0.7, 2.3, 0x1d2630);                                                       // chin sensor
  for (const s of [-1, 1]) {
    b.box(1.4, 0.8, 2.2, s * 0.95, -0.05, 0.5, OD2); b.box(1.0, 0.7, 0.1, s * 1.1, -0.05, 1.65, BLACK);                                  // side intakes
    b.box(3.4, 0.12, 2.0, s * 2.7, -0.1, -0.5, METAL, [0, s * 0.25, 0]); b.box(2.0, 0.1, 1.0, s * 3.9, -0.1, -1.0, GREY, [0, s * 0.25, 0]);
    b.box(0.1, 1.7, 1.5, s * 0.75, 0.9, -2.7, T, [0, 0, s * 0.35]); b.box(1.6, 0.08, 0.9, s * 1.2, 0.0, -3.0, METAL);                      // canted twin tails + stabilators
    b.cyl(0.5, 1.8, s * 0.7, 0.05, -2.7, 0x30353a, [PI / 2, 0, 0]); b.cone(0.5, 0.8, s * 0.7, 0.05, -3.7, 0x6a4a3a, [-PI / 2, 0, 0]);       // vectoring nozzles
    b.cyl(0.7, 0.12, s * 1.1, 0.5, 0.5, DARK2); b.cyl(0.6, 0.06, s * 1.1, 0.55, 0.5, 0x23282e); H.boltRing(b, s * 1.1, 0.58, 0.5, 0.52, 8, 0.05);   // lift-fan doors
    b.cyl(0.14, 2.2, s * 2.2, -0.35, 0.0, OD3, [PI / 2, 0, 0]); b.cone(0.14, 0.5, s * 2.2, -0.35, 1.35, WHITE, [PI / 2, 0, 0]);             // bomb / missile hardpoints
    b.box(0.5, 0.45, 0.8, s * 3.0, -0.35, -0.3, OD3); b.cone(0.22, 0.6, s * 3.0, -0.35, 0.4, DARK2, [PI / 2, 0, 0]); b.cyl(0.18, 1.3, s * 4.1, -0.08, -0.7, WHITE, [PI / 2, 0, 0]); b.cone(0.18, 0.4, s * 4.1, -0.08, 0.15, DARK2, [PI / 2, 0, 0]);
    b.box(0.12, 0.1, 0.2, s * 4.8, -0.08, -1.2, s < 0 ? 0xff3a2e : 0x3aff6a);
    H.vent(b, s * 0.9, 0.45, -1.0, 0.6, 0.8, 4);
  }
  H.panel(b, 0, 0.47, -1.0, 0.8, 0.8, PNL); H.antenna(b, 0, 0.45, -2.0, 0.4); b.box(0.5, 0.12, 0.8, 0, -0.5, -0.5, 0x23282e); b.box(0.06, 0.3, 0.3, 0, 0.5, 2.5, METAL);
  b.box(0.12, 0.3, 0.4, 0, -0.65, 0.6, METAL); b.sph6(0.14, 0, -0.85, 0.6, RUB);
}

function ewplane(b) {
  b.box(1.4, 1.1, 6.6, 0, 0, 0, WHITE); b.cone(0.7, 2.4, 0, 0, 4.4, WHITE, [PI / 2, 0, 0]); b.sph(0.4, 0, 0, 5.6, 0x3a3f46, 0.8, 1.5);                  // nose radome
  b.box(0.9, 0.5, 1.5, 0, 0.62, 2.0, GLASS); b.wedge(0.9, 0.3, 0.7, 0, 0.6, 2.9, GLASS); for (let i = 0; i < 4; i++) b.box(0.04, 0.5, 0.06, -0.3 + i * 0.2, 0.62, 2.8, WHITE);
  b.box(1.5, 0.4, 3.4, 0, 0.7, -0.8, 0xb5bcc4); H.boltLine(b, -0.6, 0.92, -2.3, 0.6, 0.92, -2.3, 4); b.box(0.6, 0.5, 2.4, 0, -0.65, -0.6, DARK2);                // dorsal / belly fairings
  for (const s of [-1, 1]) {
    b.box(4.4, 0.14, 2.2, s * 3.1, -0.15, -0.4, GREY, [0, s * 0.35, 0]); b.box(2.0, 0.12, 1.2, s * 5.6, -0.1, -1.5, GREY, [0, s * 0.35, 0]);
    b.box(0.7, 0.8, 2.6, s * 4.8, 0.0, -1.0, 0xb5bcc4); b.cone(0.38, 0.9, s * 4.8, 0.0, 0.7, WHITE, [PI / 2, 0, 0]); b.box(0.1, 0.15, 0.2, s * 5.0, 0.4, -2.2, s < 0 ? 0xff3a2e : 0x3aff6a);   // wingtip ESM pods
    b.cyl(0.45, 2.2, s * 2.2, -0.65, -0.2, 0x3a4048, [PI / 2, 0, 0]); b.cyl(0.36, 0.2, s * 2.2, -0.65, 0.95, BLACK, [PI / 2, 0, 0]); b.cyl(0.3, 0.3, s * 2.2, -0.65, -1.4, DARK, [PI / 2, 0, 0]); b.box(0.4, 0.35, 0.6, s * 2.2, -0.35, -0.3, GREY);   // engines + pylons
    b.box(0.12, 1.8, 1.4, s * 0.8, 1.0, -2.9, T, [0, 0, s * 0.18]); b.box(2.6, 0.1, 1.0, s * 1.6, 0.0, -3.0, GREY);
    b.box(0.4, 0.4, 1.4, s * 0.9, -0.5, 0.7, 0x4a5058); H.vent(b, s * 0.9, -0.28, 0.7, 0.3, 1.0, 3);                                                    // belly blade pods
  }
  for (const x of [-0.7, 0.7]) b.box(0.05, 0.5, 0.5, x, 1.1, -3.0, 0x4a7090);
  H.blade(b, 0, 0.9, 2.6, 0.4, 0.3); H.antenna(b, 0, -0.55, 2.2, 0.5); b.cyl(0.2, 0.9, 0, 1.7, -2.0, GREY);
  for (let i = 0; i < 5; i++) b.box(0.4, 0.28, 0.06, 0, 0.0, -3.2 - i * 0.1, i & 1 ? DARK2 : METAL);
  b.g('rotor').at(0, 1.55, -0.6);
  b.box(2.6, 0.12, 0.45, 0, 1.6, -0.6, 0xd0d6dc); b.box(2.6, 0.04, 0.46, 0, 1.68, -0.6, ORANGE); b.box(0.45, 0.12, 2.6, 0, 1.6, -0.6, 0xd0d6dc); b.cyl6(0.4, 0.14, 0, 1.6, -0.6, METAL); b.box(0.5, 0.08, 0.3, 1.1, 1.72, -0.6, T);
}

export const AIR = { uav, heli, vtol, ewplane };
