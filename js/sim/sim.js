// Deterministic RTS simulation. Runs identically on every client (lockstep multiplayer).
import { DT, CELL, DMG, UNITS, BUILDINGS, DEFS, UNIT_CAP } from './defs.js';
import { RNG, clamp } from './util.js';
import { generateMap } from './map.js';
import { Pathfinder } from './path.js';
import { AIController } from './ai.js';

const START_CREDITS = 3000;
const BUILD_RADIUS = 62;
const ENGINEER_RADIUS = 30;
const PATHS_PER_TICK = 6;
const GRID = 16;
const DIRS16 = (() => { const a = 0.9239, b = 0.3827, c = 0.7071; return [[1, 0], [a, b], [c, c], [b, a], [0, 1], [-b, a], [-c, c], [-a, b], [-1, 0], [-a, -b], [-c, -c], [-b, -a], [0, -1], [b, -a], [c, -c], [a, -b]]; })();

export class Sim {
  constructor(cfg) {
    this.cfg = cfg;
    this.tick = 0;
    this.rng = new RNG((cfg.seed | 0) + 12345);
    this.recordEvents = true;
    this.events = [];
    this.nextId = 0;
    this.ents = [];
    this.byId = new Map();
    this.projs = [];
    this.nextPid = 0;
    this.pathQ = [];
    this.over = false;
    this.winner = -1;
    const slots = cfg.slots;
    this.map = generateMap({ size: cfg.size, type: cfg.type, seed: cfg.seed, players: slots.length });
    this.map.type = this.map.type;
    this.path = new Pathfinder(this.map);
    this.gw = Math.ceil(this.map.size / GRID);
    this.head = new Int32Array(this.gw * this.gw);
    this.next = new Int32Array(1024);
    const n = this.map.n;
    this.vis = [0, 1, 2, 3].map(() => new Uint8Array(n * n));
    this.expl = [0, 1, 2, 3].map(() => new Uint8Array(n * n));
    this.players = slots.map((s, i) => ({
      id: i, name: s.name || ('Player ' + (i + 1)), team: s.team != null ? s.team : i, color: i,
      credits: START_CREDITS, ai: s.ai || null, alive: true, units: 0, income: 0,
      spawn: this.map.spawns[i], stats: { built: 0, killed: 0, lost: 0 }, lastAlert: -999,
    }));
    this.ais = {};
    for (const p of this.players) if (p.ai) this.ais[p.id] = new AIController(p.id, p.ai);
    for (const p of this.players) this.setupPlayer(p);
    this.updateVision();
  }

  setupPlayer(p) {
    const sp = p.spawn, half = this.map.size / 2;
    const hq = this.placeBuildingRaw('hq', p.id, sp.x, sp.z, true);
    let dx = half - sp.x, dz = half - sp.z; const l = Math.sqrt(dx * dx + dz * dz) || 1; dx /= l; dz /= l;
    const spots = [[0.0, 24], [-8, 24], [8, 24], [16, 22], [-16, 22]];
    const types = ['engineer', 'rifleman', 'rifleman', 'rifleman', 'rifleman'];
    for (let i = 0; i < types.length; i++) {
      const s = spots[i];
      const e = this.spawnUnit(types[i], p.id, sp.x + dx * s[1] - dz * s[0], sp.z + dz * s[1] + dx * s[0]);
      if (e) { e.dirx = dx; e.dirz = dz; }
    }
    return hq;
  }

  // ---------- entity management ----------
  makeEnt(def, owner, x, z) {
    const d = DEFS[def], p = this.players[owner];
    const e = {
      id: ++this.nextId, def, kind: d.kind, owner, team: p.team, x, z, px: x, pz: z, hp: d.hp, maxhp: d.hp,
      dirx: 0, dirz: 1, dead: false, target: 0, cd: d.weapons.map(() => 0), vx: 0, vz: 0,
      radius: d.radius, air: !!d.air, armor: d.armor, flash: 0,
    };
    if (d.kind === 'unit') { e.order = { t: 'idle' }; e.path = null; e.pi = 0; e.stuck = 0; e.repath = 0; e.pending = false; e.pt = null; e.moving = false; }
    else { e.progress = 1; e.queue = []; e.rally = null; e.size = d.size; e.cx0 = 0; e.cz0 = 0; e.node = -1; }
    this.ents.push(e); this.byId.set(e.id, e);
    return e;
  }
  spawnUnit(def, owner, x, z) {
    const e = this.makeEnt(def, owner, x, z);
    const p = this.players[owner]; p.units++;
    const half = this.map.size / 2;
    let dx = half - x, dz = half - z; const l = Math.sqrt(dx * dx + dz * dz) || 1;
    e.dirx = dx / l; e.dirz = dz / l;
    return e;
  }
  snap(type, x, z, node) {
    const d = BUILDINGS[type], s = d.size;
    let cx0, cz0;
    if (d.oil && node) { cx0 = node.ci - s / 2; cz0 = node.cj - s / 2; }
    else { cx0 = Math.round(x / CELL - s / 2); cz0 = Math.round(z / CELL - s / 2); }
    return { cx0, cz0, x: (cx0 + s / 2) * CELL, z: (cz0 + s / 2) * CELL };
  }
  placeBuildingRaw(type, owner, x, z, instant, node) {
    const d = BUILDINGS[type];
    const sn = this.snap(type, x, z, node);
    const b = this.makeEnt(type, owner, sn.x, sn.z);
    b.cx0 = sn.cx0; b.cz0 = sn.cz0;
    const n = this.map.n;
    for (let j = 0; j < d.size; j++) for (let i = 0; i < d.size; i++) this.map.occ[(sn.cz0 + j) * n + sn.cx0 + i] = b.id;
    if (node) { node.building = b.id; b.node = node.id; }
    if (instant) { b.progress = 1; } else { b.progress = 0; b.hp = Math.max(1, d.hp * 0.1); }
    // push ground units out of the footprint
    const half = d.size * CELL / 2;
    for (const u of this.ents) {
      if (u.kind !== 'unit' || u.air || u.dead) continue;
      const ox = u.x - sn.x, oz = u.z - sn.z;
      if (Math.abs(ox) < half + 0.5 && Math.abs(oz) < half + 0.5) {
        let ax = ox, az = oz; if (ax === 0 && az === 0) { ax = 1; }
        const m = Math.max(Math.abs(ax), Math.abs(az));
        u.x = sn.x + (ax / m) * (half + 1.6); u.z = sn.z + (az / m) * (half + 1.6); u.px = u.x; u.pz = u.z;
        u.path = null;
      }
    }
    return b;
  }
  hq(owner) { for (const e of this.ents) if (e.def === 'hq' && e.owner === owner && !e.dead) return e; return null; }
  ownerHas(owner, type) { for (const e of this.ents) if (e.owner === owner && e.def === type && !e.dead && e.progress >= 1) return true; return false; }
  countOf(owner, type) { let c = 0; for (const e of this.ents) if (e.owner === owner && e.def === type && !e.dead) c++; return c; }

  canPlace(owner, type, x, z, nodeId) {
    const d = BUILDINGS[type];
    if (!d || type === 'hq') return { ok: false, reason: 'invalid' };
    const p = this.players[owner];
    if (!p || !p.alive) return { ok: false, reason: 'eliminated' };
    for (const r of d.requires) if (!this.ownerHas(owner, r)) return { ok: false, reason: 'Requires ' + BUILDINGS[r].name };
    let node = null;
    if (d.oil) {
      node = this.map.oil[nodeId];
      if (!node) return { ok: false, reason: 'Must be built on an oil field' };
      if (node.building) return { ok: false, reason: 'Oil field already in use' };
    }
    const sn = this.snap(type, x, z, node);
    const res = { ok: false, reason: '', x: sn.x, z: sn.z, cx0: sn.cx0, cz0: sn.cz0 };
    const n = this.map.n, map = this.map;
    if (sn.cx0 < 1 || sn.cz0 < 1 || sn.cx0 + d.size > n - 1 || sn.cz0 + d.size > n - 1) { res.reason = 'Out of bounds'; return res; }
    for (let j = 0; j < d.size; j++) for (let i = 0; i < d.size; i++) {
      const c = (sn.cz0 + j) * n + sn.cx0 + i;
      if (map.occ[c]) { res.reason = 'Blocked'; return res; }
      if (d.oil ? !map.pass[c] : !map.bld[c]) { res.reason = 'Unsuitable terrain'; return res; }
    }
    if (!d.oil) for (const o of map.oil) {
      if (o.ci >= sn.cx0 - 1 && o.ci <= sn.cx0 + d.size + 1 && o.cj >= sn.cz0 - 1 && o.cj <= sn.cz0 + d.size + 1) { res.reason = 'Too close to oil field'; return res; }
    }
    let near = false;
    for (const e of this.ents) {
      if (e.owner !== owner || e.dead) continue;
      const dx = e.x - sn.x, dz = e.z - sn.z, d2 = dx * dx + dz * dz;
      if (e.kind === 'building' && e.progress >= 1 && d2 <= BUILD_RADIUS * BUILD_RADIUS) { near = true; break; }
      if (e.kind === 'unit' && DEFS[e.def].builder && d2 <= ENGINEER_RADIUS * ENGINEER_RADIUS) { near = true; break; }
    }
    if (!near) { res.reason = 'Too far from your base or an Engineer'; return res; }
    if (p.credits < d.cost) { res.reason = 'Not enough credits'; return res; }
    res.ok = true; res.node = node;
    return res;
  }

  // ---------- commands ----------
  own(ids, p) {
    const out = [];
    if (!ids) return out;
    for (const id of ids) { const e = this.byId.get(id); if (e && !e.dead && e.owner === p) out.push(e); }
    return out;
  }
  exec(c) {
    const p = this.players[c.p];
    if (!p || !p.alive) return;
    switch (c.t) {
      case 'move': case 'attackmove': this.cmdMove(this.own(c.ids, c.p), c.x, c.z, c.t); break;
      case 'attackground': this.cmdMove(this.own(c.ids, c.p), c.x, c.z, 'attackground'); break;
      case 'attack': {
        const tg = this.byId.get(c.tid);
        if (!tg || tg.dead || tg.team === p.team) return;
        for (const u of this.own(c.ids, c.p)) {
          if (u.kind !== 'unit') continue;
          const d = DEFS[u.def];
          if (!d.weapons.length || (tg.air ? !d.hitsAir : !d.hitsGround)) { this.cmdMove([u], tg.x, tg.z, 'move'); continue; }
          u.order = { t: 'attack', tid: tg.id }; u.path = null; u.pt = null; u.pending = false; u.stuck = 0; u.repath = 0;
        }
        break;
      }
      case 'stop': for (const u of this.own(c.ids, c.p)) if (u.kind === 'unit') this.finishOrder(u); break;
      case 'build': {
        const r = this.canPlace(c.p, c.type, c.x, c.z, c.node);
        if (!r.ok) return;
        const d = BUILDINGS[c.type];
        p.credits -= d.cost;
        this.placeBuildingRaw(c.type, c.p, r.x, r.z, false, r.node);
        p.stats.built++;
        break;
      }
      case 'train': { const n = Math.max(1, Math.min(10, c.n | 0 || 1)); for (let i = 0; i < n; i++) if (!this.train(c.p, c.type)) break; break; }
      case 'dequeue': this.dequeue(c.p, c.type); break;
      case 'rally': for (const b of this.own(c.ids, c.p)) if (b.kind === 'building') b.rally = { x: clamp(c.x, 4, this.map.size - 4), z: clamp(c.z, 4, this.map.size - 4) }; break;
      case 'sell': for (const b of this.own(c.ids, c.p)) if (b.kind === 'building' && b.def !== 'hq') { p.credits += BUILDINGS[b.def].cost * (b.progress >= 1 ? 0.5 : 1); this.kill(b, true); } break;
      case 'resign': this.eliminate(p); break;
      case 'takeover': if (!p.ai) { p.ai = c.diff || 'normal'; this.ais[p.id] = new AIController(p.id, p.ai); } break;
      default: break;
    }
  }
  cmdMove(units, x, z, type) {
    units = units.filter((u) => u.kind === 'unit');
    const k = units.length; if (!k) return;
    x = clamp(x, 6, this.map.size - 6); z = clamp(z, 6, this.map.size - 6);
    const cols = Math.ceil(Math.sqrt(k));
    let sp = 4.0; for (const u of units) sp = Math.max(sp, u.radius * 2 + 1.5);
    const slots = [];
    for (let i = 0; i < k; i++) { const cx = i % cols, cz = Math.floor(i / cols); slots.push([x + (cx - (cols - 1) / 2) * sp, z + (cz - (Math.ceil(k / cols) - 1) / 2) * sp]); }
    const used = new Array(k).fill(false);
    for (const u of units) {
      let bi = 0, bd = 1e18;
      for (let i = 0; i < k; i++) if (!used[i]) { const dx = slots[i][0] - u.x, dz = slots[i][1] - u.z, dd = dx * dx + dz * dz; if (dd < bd) { bd = dd; bi = i; } }
      used[bi] = true;
      let tx = slots[bi][0], tz = slots[bi][1];
      if (k === 1) { tx = x; tz = z; }
      tx = clamp(tx, 6, this.map.size - 6); tz = clamp(tz, 6, this.map.size - 6);
      if (!u.air && !this.map.walkable(tx, tz) && this.map.walkable(x, z)) { tx = x; tz = z; }
      u.order = { t: type, x: tx, z: tz }; u.path = null; u.pt = null; u.pending = false; u.stuck = 0; u.repath = 0; u.target = 0;
    }
  }
  finishOrder(u) { u.order = { t: 'idle' }; u.path = null; u.pt = null; u.pending = false; u.target = 0; u.moving = false; }

  producerFor(owner, d) {
    let best = null;
    for (const b of this.ents) {
      if (b.owner !== owner || b.dead || b.kind !== 'building' || b.progress < 1) continue;
      if (BUILDINGS[b.def].produces !== d.from) continue;
      if (!best || b.queue.length < best.queue.length) best = b;
    }
    return best;
  }
  canTrain(owner, type) {
    const d = UNITS[type]; if (!d) return false;
    for (const t of d.tech) if (!this.ownerHas(owner, t)) return false;
    return !!this.producerFor(owner, d);
  }
  train(owner, type) {
    const d = UNITS[type], p = this.players[owner];
    if (!d || !this.canTrain(owner, type)) return false;
    if (p.credits < d.cost) return false;
    let queued = 0; for (const b of this.ents) if (b.owner === owner && b.kind === 'building' && !b.dead) queued += b.queue.length;
    if (p.units + queued >= UNIT_CAP) return false;
    const b = this.producerFor(owner, d);
    p.credits -= d.cost;
    b.queue.push({ type, left: d.timeTicks });
    return true;
  }
  dequeue(owner, type) {
    const d = UNITS[type]; if (!d) return;
    let best = null, bi = -1;
    for (const b of this.ents) {
      if (b.owner !== owner || b.dead || b.kind !== 'building') continue;
      for (let i = b.queue.length - 1; i >= 0; i--) if (b.queue[i].type === type) { if (!best || b.queue.length > best.queue.length) { best = b; bi = i; } break; }
    }
    if (best) { best.queue.splice(bi, 1); this.players[owner].credits += d.cost; }
  }

  // ---------- main step ----------
  step(cmds) {
    if (this.over) return;
    if (cmds) for (const c of cmds) this.exec(c);
    for (const id in this.ais) { const p = this.players[id]; if (p.alive) this.ais[id].think(this, p); }
    this.buildGrid();
    for (let i = 0; i < PATHS_PER_TICK && this.pathQ.length; i++) {
      const u = this.byId.get(this.pathQ.shift());
      if (!u || u.dead || !u.pending) continue;
      u.pending = false;
      u.path = this.path.find(u.x, u.z, u.pt.x, u.pt.z); u.pi = 0;
    }
    const list = this.ents;
    for (const p of this.players) p.income = 0;
    for (let i = 0, len = list.length; i < len; i++) {
      const e = list[i];
      if (e.dead) continue;
      if (e.kind === 'building') this.updateBuilding(e); else this.updateUnit(e);
    }
    this.updateProjectiles();
    this.separate();
    for (const p of this.players) if (p.alive) p.credits += p.income * (p.ai ? this.aiHandicap(p) : 1) * DT;
    // cleanup
    let w = 0;
    for (let i = 0; i < list.length; i++) { const e = list[i]; if (!e.dead) list[w++] = e; else this.byId.delete(e.id); }
    list.length = w;
    if (this.tick % 4 === 0) this.updateVision();
    this.checkElimination();
    this.tick++;
  }
  aiHandicap(p) { return p.ai === 'easy' ? 0.8 : p.ai === 'hard' ? 1.25 : 1; }

  buildGrid() {
    const gw = this.gw, head = this.head, list = this.ents;
    head.fill(-1);
    if (this.next.length < list.length) this.next = new Int32Array(list.length * 2);
    const next = this.next;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]; if (e.dead) continue;
      const gx = clamp(Math.floor(e.x / GRID), 0, gw - 1), gz = clamp(Math.floor(e.z / GRID), 0, gw - 1);
      const c = gz * gw + gx; next[i] = head[c]; head[c] = i;
    }
  }

  updateBuilding(b) {
    const d = BUILDINGS[b.def], p = this.players[b.owner];
    b.px = b.x; b.pz = b.z;
    if (b.progress < 1) {
      b.progress += DT / d.time;
      b.hp = Math.min(b.maxhp, b.hp + b.maxhp * 0.9 * DT / d.time);
      if (b.progress >= 1) { b.progress = 1; b.hp = Math.min(b.maxhp, b.hp); this.ev({ e: 'built', id: b.id, owner: b.owner, def: b.def, x: b.x, z: b.z }); }
      return;
    }
    p.income += d.income;
    if (b.queue.length) {
      const it = b.queue[0];
      if (it.left > 0) it.left--;
      if (it.left <= 0 && p.units < UNIT_CAP) {
        b.queue.shift();
        const ud = UNITS[it.type];
        const spot = this.spawnSpot(b, ud);
        const u = this.spawnUnit(it.type, b.owner, spot.x, spot.z);
        this.ev({ e: 'trained', id: u.id, owner: b.owner, def: it.type, x: spot.x, z: spot.z });
        const ai = !!p.ai;
        if (b.rally && !ud.builder) this.cmdMove([u], b.rally.x, b.rally.z, ai ? 'move' : 'move');
      }
    }
    if (d.weapons.length) this.combat(b, d);
    if (b.flash > 0) b.flash--;
  }
  spawnSpot(b, ud) {
    const half = b.size * CELL / 2;
    if (ud.air) return { x: b.x, z: b.z };
    const tx = b.rally ? b.rally.x : this.map.size / 2, tz = b.rally ? b.rally.z : this.map.size / 2;
    const dx = tx - b.x, dz = tz - b.z;
    let bi = 0, bd = -2;
    for (let i = 0; i < 16; i++) { const dd = DIRS16[i][0] * dx + DIRS16[i][1] * dz; if (dd > bd) { bd = dd; bi = i; } }
    for (let r = half + 3; r < half + 20; r += 3) {
      for (let k = 0; k < 16; k++) {
        const o = (k & 1) ? -((k + 1) >> 1) : (k >> 1);
        const di = DIRS16[(bi + o + 32) & 15];
        const x = b.x + di[0] * r, z = b.z + di[1] * r;
        if (this.map.walkable(x, z)) return { x, z };
      }
    }
    return { x: b.x, z: b.z + half + 2 };
  }

  // ---------- unit logic ----------
  updateUnit(u) {
    const d = UNITS[u.def], map = this.map;
    u.px = u.x; u.pz = u.z;
    for (let k = 0; k < u.cd.length; k++) if (u.cd[k] > 0) u.cd[k]--;
    if (u.flash > 0) u.flash--;
    const o = u.order;
    let tg = u.target ? this.byId.get(u.target) : null;
    if (tg && (tg.dead || (o.t !== 'attack' && !this.canSee(u.team, tg)))) { tg = null; u.target = 0; }
    if (o.t === 'attack') {
      tg = this.byId.get(o.tid);
      if (!tg || tg.dead) { this.finishOrder(u); return; }
      u.target = tg.id;
    } else if (d.weapons.length && o.t !== 'attackground') {
      const chase = o.t === 'attackmove';
      if (tg) {
        const r = d.maxRange + (chase ? 14 : 4), dx = tg.x - u.x, dz = tg.z - u.z;
        if (dx * dx + dz * dz > r * r) { tg = null; u.target = 0; }
      }
      if (!tg && ((this.tick + u.id) % 4 === 0)) {
        tg = this.acquire(u, d, d.maxRange + (chase ? 12 : 0));
        u.target = tg ? tg.id : 0;
      }
    }
    // movement
    let moved = false;
    switch (o.t) {
      case 'move': if (this.goTo(u, d, o.x, o.z, 2.2)) this.finishOrder(u); else moved = true; break;
      case 'attackmove':
        if (tg) { if (this.inRange(u, d, tg)) { this.faceTo(u, tg.x, tg.z); } else { this.chaseTarget(u, d, tg); moved = true; } }
        else if (this.goTo(u, d, o.x, o.z, 2.5)) this.finishOrder(u); else moved = true;
        break;
      case 'attack':
        if (this.inRange(u, d, tg)) { this.faceTo(u, tg.x, tg.z); u.path = null; }
        else {
          this.chaseTarget(u, d, tg); moved = true;
          if (o.auto) { const dx = tg.x - u.x, dz = tg.z - u.z, r = d.vision * 1.8; if (dx * dx + dz * dz > r * r) this.finishOrder(u); }
        }
        break;
      case 'attackground': {
        const dx = o.x - u.x, dz = o.z - u.z, dd = Math.sqrt(dx * dx + dz * dz);
        let rmax = 0, rmin = 0;
        for (const w of d.weapons) if (w.ground && w.kind !== 'hit') { rmax = Math.max(rmax, w.range); rmin = rmin ? Math.min(rmin, w.min) : w.min; }
        if (rmax === 0) { this.cmdMove([u], o.x, o.z, 'move'); return; }
        if (dd > rmax * 0.97) { this.goTo(u, d, o.x, o.z, rmax * 0.9); moved = true; } else this.faceTo(u, o.x, o.z);
        break;
      }
      default: break;
    }
    u.moving = moved;
    u.vx = (u.x - u.px) / DT; u.vz = (u.z - u.pz) / DT;
    if (d.weapons.length) this.combat(u, d);
  }
  faceTo(u, x, z) {
    const dx = x - u.x, dz = z - u.z, l = Math.sqrt(dx * dx + dz * dz);
    if (l < 0.01) return;
    u.dirx += (dx / l - u.dirx) * 0.15; u.dirz += (dz / l - u.dirz) * 0.15;
    const m = Math.sqrt(u.dirx * u.dirx + u.dirz * u.dirz) || 1; u.dirx /= m; u.dirz /= m;
  }
  inRange(u, d, tg) {
    const dx = tg.x - u.x, dz = tg.z - u.z, dd = Math.sqrt(dx * dx + dz * dz);
    for (const w of d.weapons) {
      if (tg.air ? !w.air : !w.ground) continue;
      if (dd <= w.range + tg.radius * 0.5 && dd >= w.min) return true;
    }
    return false;
  }
  chaseTarget(u, d, tg) {
    // move toward the largest-range usable weapon's range
    let r = 0;
    for (const w of d.weapons) if (tg.air ? w.air : w.ground) r = Math.max(r, w.range);
    this.goTo(u, d, tg.x, tg.z, Math.max(2, r * 0.85), true);
  }
  // returns true when arrived
  goTo(u, d, tx, tz, tol, chasing) {
    const map = this.map;
    const dx0 = tx - u.x, dz0 = tz - u.z;
    const dd = Math.sqrt(dx0 * dx0 + dz0 * dz0);
    if (dd <= tol) { u.path = null; return true; }
    let wx, wz;
    if (d.air) { wx = tx; wz = tz; }
    else {
      if (u.repath > 0) u.repath--;
      if (u.path && u.pt && chasing) { const ex = u.pt.x - tx, ez = u.pt.z - tz; if (ex * ex + ez * ez > 64 && u.repath === 0) { u.path = null; u.repath = 20; } }
      if (!u.path && !u.pending) {
        u.pt = { x: tx, z: tz };
        if (this.path.los(u.x, u.z, tx, tz)) { u.path = [tx, tz]; u.pi = 0; }
        else { u.pending = true; this.pathQ.push(u.id); }
      }
      if (!u.path) return false;
      // advance waypoints
      while (u.pi < u.path.length) {
        const ex = u.path[u.pi] - u.x, ez = u.path[u.pi + 1] - u.z, last = u.pi >= u.path.length - 2;
        if (ex * ex + ez * ez < (last ? 2.0 : 6.0)) { if (last) { u.path = null; return !chasing || dd <= tol + 2; } u.pi += 2; } else break;
      }
      if (!u.path) return false;
      wx = u.path[u.pi]; wz = u.path[u.pi + 1];
    }
    const dx = wx - u.x, dz = wz - u.z, l = Math.sqrt(dx * dx + dz * dz) || 1;
    const ddx = dx / l, ddz = dz / l;
    const turn = d.air ? 0.2 : (d.armor === 'inf' ? 0.5 : 0.18);
    u.dirx += (ddx - u.dirx) * turn; u.dirz += (ddz - u.dirz) * turn;
    const m = Math.sqrt(u.dirx * u.dirx + u.dirz * u.dirz) || 1; u.dirx /= m; u.dirz /= m;
    const align = u.dirx * ddx + u.dirz * ddz;
    let step = d.speed * DT * (d.air ? 1 : (0.3 + 0.7 * Math.max(0, align)));
    if (step > l) step = l;
    const nx = u.x + u.dirx * step, nz = u.z + u.dirz * step;
    if (d.air) { u.x = clamp(nx, 2, map.size - 2); u.z = clamp(nz, 2, map.size - 2); return false; }
    if (map.walkable(nx, nz)) { u.x = nx; u.z = nz; u.stuck = 0; }
    else if (map.walkable(nx, u.z)) { u.x = nx; u.stuck = 0; }
    else if (map.walkable(u.x, nz)) { u.z = nz; u.stuck = 0; }
    else {
      u.stuck++;
      if (u.stuck > 12) {
        u.stuck = 0; u.path = null; u.fails = (u.fails || 0) + 1;
        if (u.fails > 4) { u.fails = 0; this.finishOrder(u); }
      }
    }
    return false;
  }

  // ---------- targeting & weapons ----------
  canSee(team, e) { const c = this.map.cellOf(e.x, e.z); return c >= 0 && this.vis[team][c] === 1; }
  acquire(u, d, radius) {
    const vis = this.vis[u.team], map = this.map;
    let best = null, bs = 1e18;
    const consider = (e) => {
      if (e.dead || e.team === u.team) return;
      if (e.air ? !d.hitsAir : !d.hitsGround) return;
      const dx = e.x - u.x, dz = e.z - u.z, dd = Math.sqrt(dx * dx + dz * dz);
      if (dd > radius + e.radius * 0.5) return;
      const c = map.cellOf(e.x, e.z);
      if (c < 0 || vis[c] !== 1) return;
      let usable = false;
      for (const w of d.weapons) if ((e.air ? w.air : w.ground) && dd >= w.min) { usable = true; break; }
      if (!usable) return;
      const ed = DEFS[e.def];
      const armed = ed.weapons.length > 0;
      const s = dd + (e.kind === 'building' && !armed ? 30 : 0) - (armed ? 12 : 0);
      if (s < bs) { bs = s; best = e; }
    };
    if (radius <= 70) {
      const gw = this.gw, r = radius + 6;
      const gx0 = clamp(Math.floor((u.x - r) / GRID), 0, gw - 1), gx1 = clamp(Math.floor((u.x + r) / GRID), 0, gw - 1);
      const gz0 = clamp(Math.floor((u.z - r) / GRID), 0, gw - 1), gz1 = clamp(Math.floor((u.z + r) / GRID), 0, gw - 1);
      for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
        for (let i = this.head[gz * gw + gx]; i !== -1; i = this.next[i]) consider(this.ents[i]);
      }
    } else for (const e of this.ents) consider(e);
    return best;
  }
  combat(e, d) {
    let tg = e.target ? this.byId.get(e.target) : null;
    if (e.kind === 'building') {
      if (tg && (tg.dead || !this.canSee(e.team, tg))) { tg = null; e.target = 0; }
      if (tg) { const dx = tg.x - e.x, dz = tg.z - e.z; if (dx * dx + dz * dz > (d.maxRange + tg.radius) * (d.maxRange + tg.radius)) { tg = null; e.target = 0; } }
      if (!tg && ((this.tick + e.id) % 5 === 0)) { tg = this.acquire(e, d, d.maxRange); e.target = tg ? tg.id : 0; }
      if (e.progress < 1) return;
    }
    const o = e.order;
    const ground = (e.kind === 'unit' && o.t === 'attackground');
    if (!tg && !ground) return;
    const sy = this.muzzleY(e, d);
    for (let k = 0; k < d.weapons.length; k++) {
      const w = d.weapons[k];
      if (e.cd[k] > 0) continue;
      let ax, az, ay, tid = 0;
      if (ground) {
        if (!w.ground || w.kind === 'hit') continue;
        ax = o.x; az = o.z; ay = this.map.hAt(ax, az);
      } else {
        if (tg.air ? !w.air : !w.ground) continue;
        ax = tg.x; az = tg.z; tid = tg.id;
        ay = this.map.hAt(ax, az) + (tg.air ? DEFS[tg.def].alt : 1.2);
      }
      const dx = ax - e.x, dz = az - e.z, dd = Math.sqrt(dx * dx + dz * dz);
      const rad = ground ? 0 : tg.radius * 0.5;
      if (dd > w.range + rad || dd < w.min) continue;
      e.cd[k] = w.reloadTicks;
      e.flash = 3;
      const mx = e.x + (e.dirx || 0) * e.radius * 0.8, mz = e.z + (e.dirz || 0) * e.radius * 0.8;
      if (w.kind === 'hit') {
        this.damage(tg, w.dmg * DMG[w.type][tg.armor], e);
        this.ev({ e: 'shot', w: w.type, x: mx, y: sy, z: mz, tx: ax, ty: ay, tz: az, hit: true, air: !!tg.air });
      } else {
        let hx = ax, hz = az;
        if (!ground && tg.kind === 'unit' && w.kind === 'shell') {
          const ft = dd / w.speed; hx += tg.vx * ft * 0.7; hz += tg.vz * ft * 0.7;
        }
        if (w.spread) { hx += (this.rng.next() - 0.5) * 2 * w.spread * dd; hz += (this.rng.next() - 0.5) * 2 * w.spread * dd; }
        hx = clamp(hx, 1, this.map.size - 1); hz = clamp(hz, 1, this.map.size - 1);
        const ddx = hx - mx, ddz = hz - mz, dist2 = Math.sqrt(ddx * ddx + ddz * ddz);
        const flight = Math.max(2, Math.ceil(dist2 / w.speed / DT));
        const arcH = w.arc >= 5 ? w.arc : dist2 * w.arc * 0.4;
        this.projs.push({
          id: ++this.nextPid, k: w.kind, w: w.type, big: w.splash >= 10, x: mx, y: sy, z: mz, sx: mx, sy, sz: mz,
          tx: hx, ty: (tid && w.kind === 'missile') ? ay : this.map.hAt(hx, hz) + (tg && tg.air && w.kind === 'shell' ? 0 : 0.5), tz: hz,
          tid, speed: w.speed, dmg: w.dmg, dtype: w.type, splash: w.splash, owner: e.owner, team: e.team, src: e.id,
          arc: arcH, t: 0, dur: flight, life: Math.ceil(10 / DT), aa: !w.ground, name: e.def,
        });
        this.ev({ e: 'launch', w: w.kind, big: w.splash >= 10, x: mx, y: sy, z: mz });
      }
    }
  }
  muzzleY(e, d) { return this.map.hAt(e.x, e.z) + (e.air ? d.alt : (e.kind === 'building' ? 4 : 1.8)); }

  updateProjectiles() {
    const ps = this.projs; let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]; let done = false;
      if (p.k === 'shell') {
        p.t += 1 / p.dur;
        const t = Math.min(1, p.t);
        p.x = p.sx + (p.tx - p.sx) * t; p.z = p.sz + (p.tz - p.sz) * t;
        p.y = p.sy + (p.ty - p.sy) * t + p.arc * 4 * t * (1 - t);
        if (p.t >= 1) { this.impact(p); done = true; }
      } else {
        const tg = p.tid ? this.byId.get(p.tid) : null;
        if (tg && !tg.dead) { p.tx = tg.x; p.tz = tg.z; p.ty = this.map.hAt(tg.x, tg.z) + (tg.air ? DEFS[tg.def].alt : 1.2); }
        const dx = p.tx - p.x, dy = p.ty - p.y, dz = p.tz - p.z, dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const step = p.speed * DT;
        p.dx = dx; p.dz = dz;
        if (dd <= step + (tg ? tg.radius * 0.7 : 0.5)) { p.x = p.tx; p.y = p.ty; p.z = p.tz; this.impact(p); done = true; }
        else { p.x += dx / dd * step; p.y += dy / dd * step; p.z += dz / dd * step; }
        if (--p.life <= 0 && !done) { this.impact(p); done = true; }
      }
      if (!done) ps[w++] = p;
    }
    ps.length = w;
  }
  impact(p) {
    const src = this.byId.get(p.src);
    const big = p.big;
    this.ev({ e: 'boom', x: p.x, y: p.y, z: p.z, r: p.splash > 0 ? p.splash : 1.5, big, air: p.aa });
    if (p.splash > 0) {
      const r = p.splash;
      for (const e of this.ents) {
        if (e.dead || e.team === p.team) continue;
        if (p.aa ? !e.air : (e.air && p.dtype !== 'aa')) continue;
        const dx = e.x - p.tx, dz = e.z - p.tz, dd = Math.sqrt(dx * dx + dz * dz) - e.radius * 0.6;
        if (dd > r) continue;
        const f = dd <= 0 ? 1 : 1 - 0.7 * (dd / r);
        this.damage(e, p.dmg * f * DMG[p.dtype][e.armor], src);
      }
    } else {
      const tg = p.tid ? this.byId.get(p.tid) : null;
      if (tg && !tg.dead) {
        const dx = tg.x - p.x, dz = tg.z - p.z;
        if (dx * dx + dz * dz <= (tg.radius + 3) * (tg.radius + 3)) this.damage(tg, p.dmg * DMG[p.dtype][tg.armor], src);
      }
    }
  }
  damage(t, amt, src) {
    if (t.dead || amt <= 0) return;
    t.hp -= amt;
    const op = this.players[t.owner];
    if (this.tick - op.lastAlert > 80 && t.hp > 0) { op.lastAlert = this.tick; this.ev({ e: 'alert', owner: t.owner, x: t.x, z: t.z, kind: t.kind }); }
    if (t.hp <= 0) { if (src) this.players[src.owner].stats.killed++; this.kill(t); return; }
    if (t.kind === 'unit' && src && !src.dead && t.order.t === 'idle') {
      const d = UNITS[t.def];
      if (d.weapons.length && (src.air ? d.hitsAir : d.hitsGround) && src.team !== t.team) {
        const dx = src.x - t.x, dz = src.z - t.z;
        if (dx * dx + dz * dz < d.vision * d.vision * 3) t.order = { t: 'attack', tid: src.id, auto: true };
      }
    }
  }
  kill(e, silent) {
    if (e.dead) return;
    e.dead = true; e.hp = 0;
    const p = this.players[e.owner];
    if (e.kind === 'unit') p.units--;
    else {
      const d = BUILDINGS[e.def], n = this.map.n;
      for (let j = 0; j < d.size; j++) for (let i = 0; i < d.size; i++) this.map.occ[(e.cz0 + j) * n + e.cx0 + i] = 0;
      if (e.node >= 0) this.map.oil[e.node].building = 0;
      // refund queued units
      for (const q of e.queue) p.credits += UNITS[q.type].cost;
    }
    p.stats.lost++;
    this.ev({ e: 'dead', id: e.id, def: e.def, kind: e.kind, owner: e.owner, x: e.x, z: e.z, air: e.air, silent: !!silent, y: this.map.hAt(e.x, e.z) + (e.air ? DEFS[e.def].alt : 0) });
  }

  // ---------- unit separation ----------
  separate() {
    const list = this.ents, gw = this.gw, map = this.map;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.kind !== 'unit') continue;
      const gx = clamp(Math.floor(a.x / GRID), 0, gw - 1), gz = clamp(Math.floor(a.z / GRID), 0, gw - 1);
      for (let z2 = Math.max(0, gz - 1); z2 <= Math.min(gw - 1, gz + 1); z2++) for (let x2 = Math.max(0, gx - 1); x2 <= Math.min(gw - 1, gx + 1); x2++) {
        for (let j = this.head[z2 * gw + x2]; j !== -1; j = this.next[j]) {
          if (j <= i) continue;
          const b = list[j];
          if (b.dead || b.kind !== 'unit' || a.air !== b.air) continue;
          let dx = b.x - a.x, dz = b.z - a.z;
          const min = a.radius + b.radius;
          let dd = dx * dx + dz * dz;
          if (dd >= min * min) continue;
          if (dd < 0.0001) { dx = (a.id & 1) ? 0.1 : -0.1; dz = (a.id & 2) ? 0.1 : -0.1; dd = dx * dx + dz * dz; }
          const l = Math.sqrt(dd), ov = (min - l);
          let wa = 0.5, wb = 0.5;
          if (a.moving && !b.moving) { wa = 0.15; wb = 0.85; } else if (b.moving && !a.moving) { wa = 0.85; wb = 0.15; }
          const nx = dx / l, nz = dz / l, push = Math.min(ov, 0.6);
          if (a.air || map.walkable(a.x - nx * push * wa, a.z - nz * push * wa)) { a.x -= nx * push * wa; a.z -= nz * push * wa; }
          if (b.air || map.walkable(b.x + nx * push * wb, b.z + nz * push * wb)) { b.x += nx * push * wb; b.z += nz * push * wb; }
        }
      }
    }
  }

  // ---------- vision ----------
  updateVision() {
    const n = this.map.n;
    for (let t = 0; t < 4; t++) this.vis[t].fill(0);
    for (const e of this.ents) {
      if (e.dead) continue;
      const d = DEFS[e.def];
      if (e.kind === 'building' && e.progress <= 0) continue;
      const r = d.vision / CELL, cx = Math.floor(e.x / CELL), cz = Math.floor(e.z / CELL), ri = Math.ceil(r);
      const v = this.vis[e.team], ex = this.expl[e.team];
      const r2 = r * r;
      for (let z = Math.max(0, cz - ri); z <= Math.min(n - 1, cz + ri); z++) {
        const dz = z - cz;
        for (let x = Math.max(0, cx - ri); x <= Math.min(n - 1, cx + ri); x++) {
          const dx = x - cx;
          if (dx * dx + dz * dz <= r2) { v[z * n + x] = 1; ex[z * n + x] = 1; }
        }
      }
    }
  }

  // ---------- elimination ----------
  eliminate(p) {
    if (!p.alive) return;
    p.alive = false;
    for (const e of this.ents) if (e.owner === p.id && !e.dead) this.kill(e);
    this.ev({ e: 'elim', p: p.id });
  }
  checkElimination() {
    const has = new Array(this.players.length).fill(false);
    for (const e of this.ents) if (e.kind === 'building' && !e.dead && (e.def === 'hq' || BUILDINGS[e.def].produces)) has[e.owner] = true;
    for (const p of this.players) if (p.alive && !has[p.id]) this.eliminate(p);
    const teams = new Set();
    for (const p of this.players) if (p.alive) teams.add(p.team);
    if (teams.size <= 1 && this.players.length > 1) { this.over = true; this.winner = teams.size ? [...teams][0] : -1; this.ev({ e: 'over', winner: this.winner }); }
    else if (teams.size === 0) { this.over = true; }
  }

  ev(o) { if (this.recordEvents) { if (this.events.length < 600) this.events.push(o); } }

  hash() {
    let h = 2166136261 >>> 0;
    const mix = (v) => { h = Math.imul(h ^ (v | 0), 16777619) >>> 0; };
    mix(this.tick); mix(this.rng.s);
    for (const p of this.players) { mix(Math.round(p.credits * 10)); mix(p.units); }
    for (const e of this.ents) { mix(e.id); mix(Math.round(e.x * 100)); mix(Math.round(e.z * 100)); mix(Math.round(e.hp)); }
    mix(this.projs.length);
    return h >>> 0;
  }
}
