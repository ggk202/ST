// Save / load: a snapshot is the config plus every piece of mutable simulation state. The map itself is regenerated from the seed.
// Restoring builds a fresh Sim (same map) and overwrites its state, so a restored game continues bit-identically.
import { Sim } from './sim.js';
import { UNITS } from './defs.js';

const b64 = (ta) => { const u8 = new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (str, Ctor) => { const s = atob(str), u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return new Ctor(u8.buffer); };
const fixEd = (e) => { if (e.ed === 1) e.ed = (e.lo >= 0 && UNITS[e.def] && UNITS[e.def].loadouts) ? UNITS[e.def].loadouts[e.lo].ed : null; if (e.cargo) for (const c of e.cargo) fixEd(c); };

export const SAVE_VERSION = 1;
export function snapshot(sim) {
  return JSON.stringify({
    v: SAVE_VERSION, cfg: sim.cfg, tick: sim.tick, rng: sim.rng.s, nextId: sim.nextId, nextPid: sim.nextPid, nextCid: sim.nextCid, over: sim.over, winner: sim.winner,
    ents: JSON.stringify(sim.ents, (k, v) => (k === 'ed' ? (v ? 1 : undefined) : v)), projs: sim.projs, pathQ: sim.pathQ, players: sim.players,
    ais: Object.fromEntries(Object.entries(sim.ais).map(([k, a]) => [k, JSON.stringify(a, (kk, v) => (kk === 'target' && v && typeof v === 'object' ? { x: v.x, z: v.z, id: v.id } : v))])),
    occ: b64(sim.map.occ), rsv: b64(sim.rsv), oil: sim.map.oil.map((o) => ({ building: o.building, res: o.res })),
    expl: sim.expl.map(b64), points: sim.points, crates: sim.crates, wrecks: sim.wrecks, wx: sim.wx, hold: sim.hold,
  });
}
export function restore(text) {
  const d = typeof text === 'string' ? JSON.parse(text) : text;
  if (d.v !== SAVE_VERSION) throw new Error('Unsupported save version');
  const sim = new Sim(d.cfg);
  sim.tick = d.tick; sim.rng.s = d.rng; sim.nextId = d.nextId; sim.nextPid = d.nextPid; sim.nextCid = d.nextCid; sim.over = d.over; sim.winner = d.winner;
  sim.ents = JSON.parse(d.ents); sim.byId = new Map(); for (const e of sim.ents) { fixEd(e); sim.byId.set(e.id, e); }
  sim.projs = d.projs; sim.pathQ = d.pathQ;
  d.players.forEach((p, i) => Object.assign(sim.players[i], p));
  for (const k of Object.keys(d.ais)) if (sim.ais[k]) Object.assign(sim.ais[k], JSON.parse(d.ais[k]));
  sim.map.occ.set(unb64(d.occ, sim.map.occ.constructor)); sim.rsv.set(unb64(d.rsv, Int32Array));
  d.oil.forEach((o, i) => { sim.map.oil[i].building = o.building; if (o.res !== undefined) sim.map.oil[i].res = o.res; else delete sim.map.oil[i].res; });
  d.expl.forEach((s, i) => sim.expl[i].set(unb64(s, Uint8Array)));
  sim.points = d.points; sim.crates = d.crates; sim.wrecks = d.wrecks; sim.wx = d.wx; sim.hold = d.hold;
  sim.events = [];
  sim.buildGrid(); sim.buildEW(); sim.updateRadar(); sim.updateEsm(); sim.updateVision();
  return sim;
}
