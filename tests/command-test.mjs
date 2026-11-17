// Mass-production and command features: queue at a chosen building, repeat, clear, shift-queued waypoints
import { Sim } from '../js/sim/sim.js';
let fail = false; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail = true; };
const s = new Sim({ size: 'small', type: 'island', seed: 3, slots: [{ name: 'A', team: 0 }, { name: 'B', team: 1 }] });
for (const p of s.players) { p.credits = 1e6; p.energy = 1e6; p.capM = 1e7; p.capE = 1e7; p.tech = 2; }
const h = s.hq(0); const bld = (def, x, z) => { const c = s.canPlace(0, def, x, z); return s.placeBuildingRaw(def, 0, c.ok ? c.x : x, c.ok ? c.z : z, true, null); };
const b1 = bld('barracks', h.x + 40, h.z + 5), f1 = bld('factory', h.x + 40, h.z + 40), f2 = bld('factory', h.x - 40, h.z + 40);
s.exec({ t: 'train', p: 0, type: 'mbt', n: 20 }); ok(f1.queue.length + f2.queue.length === 20 && Math.abs(f1.queue.length - f2.queue.length) <= 1, 'bulk train spreads across factories (' + f1.queue.length + '/' + f2.queue.length + ')');
s.exec({ t: 'clearq', p: 0, ids: [f1.id, f2.id] }); ok(f1.queue.length === 0 && f2.queue.length === 0, 'clear queue');
s.exec({ t: 'trainat', p: 0, bid: f2.id, type: 'ifv', n: 5 }); ok(f2.queue.length === 5 && f1.queue.length === 0, 'train at a chosen building');
s.exec({ t: 'clearq', p: 0, ids: [f2.id] }); s.exec({ t: 'trainat', p: 0, bid: f1.id, type: 'scout', n: 1 }); s.exec({ t: 'repeat', p: 0, ids: [f1.id], v: 1 });
const u0 = s.players[0].units; for (let i = 0; i < 600; i++) s.step([]); ok(s.players[0].units >= u0 + 3, 'repeat keeps a factory producing (' + (s.players[0].units - u0) + ' built)');
s.exec({ t: 'repeat', p: 0, ids: [f1.id], v: 0 });
const u = s.spawnUnit('scout', 0, h.x + 20, h.z + 60);
s.exec({ t: 'move', p: 0, ids: [u.id], x: h.x + 80, z: h.z + 60 }); s.exec({ t: 'move', p: 0, ids: [u.id], x: h.x + 80, z: h.z + 120, q: 1 }); s.exec({ t: 'move', p: 0, ids: [u.id], x: h.x + 20, z: h.z + 120, q: 1 });
ok(u.oq && u.oq.length === 2, 'shift-queued waypoints are stored');
for (let i = 0; i < 900 && !(Math.abs(u.x - (h.x + 20)) < 10 && Math.abs(u.z - (h.z + 120)) < 10); i++) s.step([]);
ok(Math.abs(u.x - (h.x + 20)) < 10 && Math.abs(u.z - (h.z + 120)) < 10 && !u.oq, 'unit visits every waypoint in order');
const w = s.spawnUnit('scout', 0, h.x + 20, h.z + 60); s.exec({ t: 'move', p: 0, ids: [w.id], x: h.x + 90, z: h.z + 60 }); s.exec({ t: 'move', p: 0, ids: [w.id], x: h.x + 90, z: h.z + 100, q: 1 }); s.exec({ t: 'stop', p: 0, ids: [w.id] });
ok(!w.oq && w.order.t === 'idle', 'stop clears queued waypoints');
console.log(fail ? 'COMMAND TESTS FAILED' : 'ALL COMMAND TESTS PASSED'); process.exit(fail ? 1 : 0);
