// Save / load round trip: a restored game must continue bit-identically to the original.
import { Sim } from '../js/sim/sim.js';
import { snapshot, restore } from '../js/sim/save.js';
let fail = false; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail = true; };
const cfg = { size: 'medium', type: 'highlands', seed: 8, slots: [{ name: 'A', team: 0, ai: 'normal' }, { name: 'B', team: 1, ai: 'hard' }] };
const a = new Sim(cfg);
for (let i = 0; i < 14000; i++) a.step([]);
const txt = snapshot(a);
ok(txt.length > 1000, 'snapshot made (' + Math.round(txt.length / 1024) + ' KB, ' + a.ents.length + ' entities)');
const b = restore(txt);
ok(b.hash() === a.hash(), 'restored state hashes identically at tick ' + a.tick);
let diff = -1;
for (let i = 0; i < 2500; i++) { a.step([]); b.step([]); if (diff < 0 && a.hash() !== b.hash()) diff = a.tick; }
ok(diff < 0, 'original and restored copy stay in lockstep for 2500 more ticks' + (diff >= 0 ? ' (diverged at ' + diff + ')' : ''));
ok(a.ents.length === b.ents.length && a.players.every((p, i) => Math.round(p.credits) === Math.round(b.players[i].credits)), 'economies match');
const c = restore(snapshot(b)); ok(c.hash() === b.hash(), 'a restored game can be saved again');
console.log(fail ? 'SOME FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
