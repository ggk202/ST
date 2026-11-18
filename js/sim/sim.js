// Deterministic RTS simulation. Runs identically on every client (lockstep multiplayer).
import { DT, CELL, DMG, dmgMult, UNITS, BUILDINGS, DEFS, UNIT_CAP, AF_MODULES, BTIER } from './defs.js';
import { AirOps, GROUND_PHASES } from './airops.js';
import { FlightOps } from './flight.js';
import { CargoOps } from './cargo.js';
import { RNG, clamp } from './util.js';
import { generateMap } from './map.js';
import { Pathfinder } from './path.js';
import { AIController } from './ai.js';
import { LogiOps } from './logistics.js';
import { SpaceOps, orbGround } from './space.js';

const START_CREDITS = 2500;
const START_ENERGY = 1200;
const BUILD_RADIUS = 62;
const ENGINEER_RADIUS = 30;
const PATHS_PER_TICK = 6;
const GRID = 16;
const DIRS16 = (() => { const a = 0.9239, b = 0.3827, c = 0.7071; return [[1, 0], [a, b], [c, c], [b, a], [0, 1], [-b, a], [-c, c], [-a, b], [-1, 0], [-a, -b], [-c, -c], [-b, -a], [0, -1], [b, -a], [c, -c], [a, -b]]; })();

const QUEUE_MAX = 30;
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
    this.jammers = [];
    this.radars = [];                                   // active radar emitters (overlay + detection)
    this.gradars = []; this.gcontact = [0, 1, 2, 3].map(() => new Set());   // ground-surveillance radars and the enemy ground units they hold, per team
    this.contact = [0, 1, 2, 3].map(() => new Set());   // per team: enemy aircraft currently held by radar
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
    this.rsv = new Int32Array(n * n);   // cells reserved for airfield runways / aprons (units can still walk there)
    this.vis = [0, 1, 2, 3].map(() => new Uint8Array(n * n));
    this.expl = [0, 1, 2, 3].map(() => new Uint8Array(n * n));
    this.players = slots.map((s, i) => ({
      id: i, name: s.name || ('Player ' + (i + 1)), team: s.team != null ? s.team : i, color: i,
      credits: START_CREDITS, energy: START_ENERGY, capM: 4000, capE: 3000, incM: 4, incE: 12, upkeep: 0, eff: 1, effM: 1, effE: 1, demM: 0, demE: 0,
      pM: 6, pE: 12, pU: 0, spentM: 0, spentE: 0, ewOn: true, tech: 0, tech2: 0,
      ai: s.ai || null, aggr: s.aggr || 'balanced', alive: true, units: 0, income: 6,
      spawn: this.map.spawns[i], stats: { built: 0, killed: 0, lost: 0 }, lastAlert: -999,
    }));
    this.ais = {};
    for (const p of this.players) if (p.ai) this.ais[p.id] = new AIController(p.id, p.ai, p.aggr);
    this.space = !!cfg.space;
    this.spaceInit();
    this.logiInit();
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
      radius: d.radius, air: !!d.air, armor: d.armor, flash: 0, jam: 0, cover: 0, stun: 0,
    };
    if (d.aps) { e.apsN = d.aps.n; e.apsCd = 0; }
    if (d.laser) e.lcd = 0;
    if (d.fuel) e.fuel = d.fuel;
    if (d.tank) e.fstock = d.tank.cap;
    if (d.sup) e.sup = d.sup;
    if (d.supply) { e.stock = d.supply.cap; e.auto = false; }
    if (d.depot) e.stock = d.depot.cap * 0.4;
    if (d.kind === 'unit') { e.order = { t: 'idle' }; e.st = 1; e.hx = x; e.hz = z; e.path = null; e.pi = 0; e.stuck = 0; e.repath = 0; e.pending = false; e.pt = null; e.moving = false; }
    else { e.progress = 1; e.sm = 0; e.se = 0; e.tier = 1; e.tu = null; e.queue = []; e.rally = null; e.size = d.size; e.cx0 = 0; e.cz0 = 0; e.node = -1; }
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
    if (type === 'airfield') { const plan = this.afPlan(sn.x, sn.z, b.id); if (plan) this.afInit(b, plan); }
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
    if (d.space && !this.space) return { ok: false, reason: 'The space layer is disabled in this game' };
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
    if (type === 'airfield') { const plan = this.afPlan(sn.x, sn.z, 0); if (!plan) { res.reason = 'No room for a runway and apron'; return res; } res.plan = plan; }
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
      case 'move': case 'attackmove': {
        const us = this.own(c.ids, c.p);
        if (c.q) {   // shift-queued waypoint: idle units start at once, busy ones append to their route
          const now = [];
          for (const u of us) { if (u.kind !== 'unit') continue; if (u.order.t === 'idle') now.push(u); else if (!u.air || true) { u.oq = u.oq || []; if (u.oq.length < 12) u.oq.push({ t: c.t, x: clamp(c.x, 6, this.map.size - 6), z: clamp(c.z, 6, this.map.size - 6) }); } }
          if (now.length) this.cmdMove(now, c.x, c.z, c.t);
        } else this.cmdMove(us, c.x, c.z, c.t);
        break;
      }
      case 'attackground': this.cmdMove(this.own(c.ids, c.p), c.x, c.z, 'attackground'); break;
      case 'attack': {
        const tg = this.byId.get(c.tid);
        if (!tg || tg.dead || tg.team === p.team || DEFS[tg.def].untouchable) return;
        for (const u of this.own(c.ids, c.p)) {
          if (u.kind !== 'unit') continue;
          const d = u.ed || DEFS[u.def];
          if (!d.weapons.length || (tg.air ? !d.hitsAir : !d.hitsGround)) { this.cmdMove([u], tg.x, tg.z, 'move'); continue; }
          u.order = { t: 'attack', tid: tg.id }; u.path = null; u.pt = null; u.pending = false; u.stuck = 0; u.repath = 0;
        }
        break;
      }
      case 'dbg': {   // solo debug mode only: spawn anything, force weather / time of day, grant resources
        if (!this.cfg.debug) return;
        const o = this.players[c.o | 0] ? (c.o | 0) : c.p;
        if (c.op === 'spawn') {
          const dd = UNITS[c.def], bd = BUILDINGS[c.def];
          if (dd && !(dd.space && !this.space)) {
            const n = Math.max(1, Math.min(60, c.n | 0 || 1)), cols = Math.ceil(Math.sqrt(n)), S = this.map.size;
            for (let i = 0; i < n; i++) {
              const x = Math.max(8, Math.min(S - 8, c.x + ((i % cols) - (cols - 1) / 2) * 6)), z = Math.max(8, Math.min(S - 8, c.z + (((i / cols) | 0) - (cols - 1) / 2) * 6));
              this.spawnUnit(c.def, o, x, z);
            }
          } else if (bd && c.def !== 'hq' && !(bd.space && !this.space)) {
            let node = null; if (bd.oil) { let bt = 1e9; for (const nd of this.map.oil) { if (nd.building) continue; const dx = nd.ci * CELL - c.x, dz = nd.cj * CELL - c.z, dd2 = dx * dx + dz * dz; if (dd2 < bt) { bt = dd2; node = nd; } } if (!node) return; }
            const sn = this.snap(c.def, c.x, c.z, node); this.placeBuildingRaw(c.def, o, sn.x, sn.z, true, node);
          }
        } else if (c.op === 'wx') { this.wx.kind = c.v | 0; this.wx.left = 1e9; }
        else if (c.op === 'night') { this.wx.fn = c.v < 0 ? -1 : c.v; }
        else if (c.op === 'money') { const q = this.players[o]; q.credits += 20000; q.energy += 20000; }
        else if (c.op === 'kill') { for (const e of this.ents) if (!e.dead && e.owner === o && e.def !== 'hq' && Math.hypot(e.x - c.x, e.z - c.z) < (c.r || 40)) this.kill(e, false); }
        break;
      }
      case 'stance': for (const u of this.own(c.ids, c.p)) if (u.kind === 'unit') { u.st = Math.max(0, Math.min(2, c.v | 0)); if (u.order.t === 'idle') { u.hx = u.x; u.hz = u.z; } } break;
      case 'stop': for (const u of this.own(c.ids, c.p)) if (u.kind === 'unit') { u.oq = null; this.finishOrder(u); } break;
      case 'build': {
        const r = this.canPlace(c.p, c.type, c.x, c.z, c.node);
        if (!r.ok) return;
        this.placeBuildingRaw(c.type, c.p, r.x, r.z, false, r.node);
        p.stats.built++;
        break;
      }
      case 'train': { const n = Math.max(1, Math.min(60, c.n | 0 || 1)); for (let i = 0; i < n; i++) if (!this.train(c.p, c.type)) break; break; }
      case 'trainat': { const b = this.byId.get(c.bid), n = Math.max(1, Math.min(40, c.n | 0 || 1)); if (b && !b.dead && b.owner === c.p) for (let i = 0; i < n; i++) if (!this.trainAt(c.p, b, c.type)) break; break; }
      case 'repeat': for (const b of this.own(c.ids, c.p)) if (b.kind === 'building' && BUILDINGS[b.def].produces) b.rep = !!c.v; break;
      case 'dequeueat': { const b = this.byId.get(c.bid); if (b && !b.dead && b.owner === c.p && b.queue && b.queue[c.idx | 0]) { const it = b.queue.splice(c.idx | 0, 1)[0]; p.credits += it.sm; p.energy += it.se; } break; }
      case 'clearq': for (const b of this.own(c.ids, c.p)) if (b.kind === 'building') { for (const q of b.queue) { p.credits += q.sm; p.energy += q.se; } b.queue = []; } break;
      case 'dequeue': this.dequeue(c.p, c.type); break;
      case 'rally': for (const b of this.own(c.ids, c.p)) if (b.kind === 'building') b.rally = { x: clamp(c.x, 4, this.map.size - 4), z: clamp(c.z, 4, this.map.size - 4) }; break;
      case 'sell': for (const b of this.own(c.ids, c.p)) if (b.kind === 'building' && b.def !== 'hq') { if (b.progress >= 1) { p.credits += BUILDINGS[b.def].cost * 0.5; p.energy += BUILDINGS[b.def].energy * 0.5; } else { p.credits += b.sm; p.energy += b.se; } this.kill(b, true, true); } break;
      case 'loadout': for (const u of this.own(c.ids, c.p)) if (u.kind === 'unit' && u.ap) this.afSelect(u, c.lo | 0); break;
      case 'upgrade': for (const b of this.own(c.ids, c.p)) if (b.kind === 'building' && b.afd) { this.afStartUpgrade(b, c.key); break; } break;
      case 'cancelup': for (const b of this.own(c.ids, c.p)) if (b.kind === 'building' && b.afd) this.afCancelUpgrade(b); break;
      case 'afauto': for (const b of this.own(c.ids, c.p)) if (b.kind === 'building' && b.afd) b.auto = !!c.v; break;
      case 'board': this.cmdBoard(this.own(c.ids, c.p), c.tid); break;
      case 'lift': this.cmdLift(this.own(c.ids, c.p), c.bid); break;
      case 'drop': this.cmdDrop(this.own(c.ids, c.p), c.x, c.z); break;
      case 'unload': this.cmdUnload(this.own(c.ids, c.p)); break;
      case 'rtb': for (const u of this.own(c.ids, c.p)) if (u.kind === 'unit' && u.ap === 'fly' && UNITS[u.def].loadouts) this.startRtb(u, false); break;
      case 'bupg': for (const b of this.own(c.ids, c.p)) if (b.kind === 'building') this.bldStartUp(b); break;
      case 'cancelbupg': for (const b of this.own(c.ids, c.p)) if (b.kind === 'building' && b.tu) { p.credits += b.tu.sm; p.energy += b.tu.se; b.tu = null; } break;
      case 'escort': { const ld = this.byId.get(c.tid); if (!ld || ld.dead || ld.team !== p.team) return; for (const u of this.own(c.ids, c.p)) if (u.kind === 'unit' && u.id !== ld.id) { u.order = { t: 'escort', tid: ld.id }; u.path = null; u.pt = null; u.pending = false; u.target = 0; } break; }
      case 'emcon': for (const e of this.own(c.ids, c.p)) { const d = e.ed || DEFS[e.def]; if (d.radar || d.ew || d.gradar) e.emcon = !!c.v; } break;
      case 'lauto': for (const u of this.own(c.ids, c.p)) if (u.kind === 'unit' && DEFS[u.def].supply) u.auto = !!c.v; break;
      case 'supplydrop': for (const u of this.own(c.ids, c.p)) if (u.kind === 'unit' && u.ap === 'fly' && u.pal > 0) { u.order = { t: 'sdrop', x: clamp(c.x, 10, this.map.size - 10), z: clamp(c.z, 10, this.map.size - 10) }; u.lcx = undefined; } break;
      case 'orbmove': if (this.space) this.orbMove(c.p, c.ids, c.layer, c.ph); break;
      case 'orbstrike': if (this.space) this.orbStrike(c.p, c.ids, c.x, c.z); break;
      case 'orbtrain': if (this.space) for (let i = 0; i < Math.max(1, Math.min(5, c.n | 0 || 1)); i++) this.orbTrain(c.p, c.yard, c.type); break;
      case 'orbdeq': this.orbDequeue(c.p, c.yard, c.idx | 0); break;
      case 'fire': this.fireMissile(c.p, c.bid, c.x, c.z); break;
      case 'resign': this.eliminate(p); break;
      case 'takeover': if (!p.ai) { p.ai = c.diff || 'normal'; this.ais[p.id] = new AIController(p.id, p.ai); } break;
      default: break;
    }
  }
  cmdMove(units, x, z, type) {
    units = units.filter((u) => u.kind === 'unit');
    for (const u of units) if (u.oq) u.oq = null;
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
      if (!DEFS[u.def].air && !this.map.walkable(tx, tz) && this.map.walkable(x, z)) { tx = x; tz = z; }
      u.order = { t: type, x: tx, z: tz }; u.path = null; u.pt = null; u.pending = false; u.stuck = 0; u.repath = 0; u.target = 0;
    }
  }
  finishOrder(u) {
    const nx = u.oq && u.oq.length ? u.oq.shift() : null, rest = u.oq;
    this.finishOrderNow(u);
    if (nx) { this.cmdMove([u], nx.x, nx.z, nx.t); u.oq = rest && rest.length ? rest : null; }
  }
  finishOrderNow(u) {
    const o = u.order; u.order = { t: 'idle' }; u.path = null; u.pt = null; u.pending = false; u.target = 0; u.moving = false;
    if (u.kind !== 'unit' || u.st === undefined) return;
    if (o && o.auto && u.st > 0 && !u.air) { const dx = u.hx - u.x, dz = u.hz - u.z; if (dx * dx + dz * dz > 36) { this.cmdMove([u], u.hx, u.hz, 'move'); u.order.rtn = true; } }   // limited autonomy: drop the fight and walk back to the post
    else if (!(o && o.rtn)) { u.hx = u.x; u.hz = u.z; }                                                                                                    // an order the player gave has been carried out: this is the new post
  }
  // stance engagement: idle ground units attack visible enemies within a leash of their post, then return
  autoEngage(u, d) {
    const L = u.st === 2 ? 140 : 60, e = this.acquire(u, d, Math.max(d.maxRange, d.vision) + L * 0.5);
    if (!e) return null;
    const hx = e.x - u.hx, hz = e.z - u.hz; if (hx * hx + hz * hz > (L + d.maxRange * 0.8) * (L + d.maxRange * 0.8)) return null;
    u.order = { t: 'attack', tid: e.id, auto: true, leash: L }; u.target = e.id; u.path = null; return e;
  }

  producerFor(owner, d) {
    let best = null;
    for (const b of this.ents) {
      if (b.owner !== owner || b.dead || b.kind !== 'building' || b.progress < 1) continue;
      if (BUILDINGS[b.def].produces !== d.from) continue;
      if (d.from === 'airfield' && (!b.afd || this.afRunLevel(b) < d.rwy)) continue;
      if (!best || b.queue.length < best.queue.length) best = b;
    }
    return best;
  }
  trainBlock(owner, type) {
    const d = UNITS[type]; if (!d) return 'Unknown';
    if (d.from === 'airfield') {
      let any = false, rw = 0;
      for (const b of this.ents) if (b.owner === owner && !b.dead && b.def === 'airfield' && b.progress >= 1 && b.afd) { any = true; rw = Math.max(rw, this.afRunLevel(b)); }
      if (any && rw < d.rwy) return 'Requires ' + AF_MODULES.runway.levels[d.rwy - 2].name + ' (select the Airfield)';
    }
    return '';
  }
  canTrain(owner, type) {
    const d = UNITS[type]; if (!d) return false;
    if (this.players[owner].tech < d.techLv) return false;
    return !!this.producerFor(owner, d);
  }
  train(owner, type) {
    const d = UNITS[type], p = this.players[owner];
    if (!d || !this.canTrain(owner, type)) return false;
    let queued = 0;
    for (const b of this.ents) if (b.owner === owner && b.kind === 'building' && !b.dead) for (const q of b.queue) if (!UNITS[q.type].missile && !UNITS[q.type].orbital) queued += UNITS[q.type].batch;
    if (p.units + queued + d.batch > UNIT_CAP) return false;
    const b = this.producerFor(owner, d);
    if (b.queue.length >= QUEUE_MAX) return false;
    b.queue.push({ type, left: d.timeTicks, sm: 0, se: 0 });
    return true;
  }
  // queue at one specific production building (mass-production overview)
  trainAt(owner, b, type) {
    const d = UNITS[type], p = this.players[owner];
    if (!d || b.dead || b.kind !== 'building' || b.progress < 1 || BUILDINGS[b.def].produces !== d.from || p.tech < d.techLv) return false;
    if (d.from === 'airfield' && (!b.afd || this.afRunLevel(b) < d.rwy)) return false;
    if (b.queue.length >= QUEUE_MAX) return false;
    b.queue.push({ type, left: d.timeTicks, sm: 0, se: 0 }); return true;
  }
  dequeue(owner, type) {
    const d = UNITS[type]; if (!d) return;
    let best = null, bi = -1;
    for (const b of this.ents) {
      if (b.owner !== owner || b.dead || b.kind !== 'building') continue;
      for (let i = b.queue.length - 1; i >= 0; i--) if (b.queue[i].type === type) { if (!best || b.queue.length > best.queue.length) { best = b; bi = i; } break; }
    }
    if (best) { const it = best.queue.splice(bi, 1)[0]; const p = this.players[owner]; p.credits += it.sm; p.energy += it.se; }
  }

  // ---------- main step ----------
  step(cmds) {
    if (this.over) return;
    if (cmds) for (const c of cmds) this.exec(c);
    for (const id in this.ais) { const p = this.players[id]; if (p.alive) this.ais[id].think(this, p); }
    this.buildGrid();
    this.economyPrepass();
    this.buildEW();
    if (this.tick % 4 === 1) { this.updateRadar(); this.updateEsm(); }
    for (let i = 0; i < PATHS_PER_TICK && this.pathQ.length; i++) {
      const u = this.byId.get(this.pathQ.shift());
      if (!u || u.dead || !u.pending) continue;
      u.pending = false;
      u.path = this.path.find(u.x, u.z, u.pt.x, u.pt.z); u.pi = 0;
    }
    const list = this.ents;
    for (const p of this.players) { p.incM = 0; p.incE = 0; p.upkeep = 0; p.capM = 0; p.capE = 0; p.spentM = 0; p.spentE = 0; }
    for (let i = 0, len = list.length; i < len; i++) {
      const e = list[i];
      if (e.dead) continue;
      if (e.kind === 'building') this.updateBuilding(e); else this.updateUnit(e);
    }
    this.updateProjectiles();
    this.logiTick();
    this.spaceTick();
    this.separate();
    this.economyApply();
    // cleanup
    let w = 0;
    for (let i = 0; i < list.length; i++) { const e = list[i]; if (!e.dead && !e.boarded) list[w++] = e; else this.byId.delete(e.id); }
    list.length = w;
    if (this.tick % 4 === 0) this.updateVision();
    this.checkElimination();
    this.tick++;
  }
  // ---------- streaming economy ----------
  // Every producing building / construction drains metal and energy continuously while it works.
  // If supply can't cover demand, all consumers slow down proportionally (like Planetary Annihilation).
  economyPrepass() {
    const P = this.players;
    for (const p of P) { p.demM = 0; p.demE = 0; p.tl1 = false; p.tl2 = false; }
    for (const b of this.ents) {
      if (b.dead || b.kind !== 'building') continue;
      const p = P[b.owner];
      const eb = b.eb || 1;
      if (b.progress < 1) { const d = BUILDINGS[b.def]; p.demM += d.cost / d.time * eb; p.demE += d.energy / d.time * eb; continue; }
      if (b.def === 'techlab') p.tl1 = true; else if (b.def === 'advtech') p.tl2 = true;
      if (b.queue.length && !b.stun && b.queue[0].left > 0) { const ud = UNITS[b.queue[0].type]; p.demM += ud.cost / ud.time * eb; p.demE += ud.energy / ud.time * eb; }
      if (b.tu) { const st = BTIER.steps[b.def][b.tier - 1]; p.demM += st.cost / st.time * eb; p.demE += st.energy / st.time * eb; }
      if (b.up) { const lv = AF_MODULES[b.up.key].levels[b.mods[b.up.key]]; p.demM += lv.cost / lv.time * eb; p.demE += lv.energy / lv.time * eb; }
    }
    for (const p of P) {
      p.tech = p.tl2 ? 2 : p.tl1 ? 1 : 0;
      const supM = p.credits + p.pM * DT, supE = Math.max(0, p.energy + (p.pE - p.pU) * DT);
      p.effM = p.demM > 0 ? Math.min(1, supM / (p.demM * DT)) : 1;
      p.effE = p.demE > 0 ? Math.min(1, supE / (p.demE * DT)) : 1;
      p.eff = Math.min(p.effM, p.effE);
      p.ewOn = p.energy > 0.5 || (p.pE - p.pU) >= 0;
    }
  }
  economyApply() {
    for (const p of this.players) {
      if (!p.alive) continue;
      const incM = p.incM * (p.ai ? this.aiHandicap(p) : 1);
      p.credits = clamp(p.credits + incM * DT - p.spentM, 0, p.capM);
      p.energy = clamp(p.energy + (p.incE - p.upkeep) * DT - p.spentE, 0, p.capE);
      p.pM = incM; p.pE = p.incE; p.pU = p.upkeep; p.income = incM;
    }
  }
  // ---------- building tiers ----------
  bldUpBlock(b) {
    const st = BTIER.steps[b.def]; if (!st || b.progress < 1) return 'Cannot be upgraded';
    if (b.tu) return 'Upgrade in progress'; if ((b.tier || 1) >= BTIER.max) return 'Fully upgraded';
    return '';
  }
  bldStartUp(b) {
    if (this.bldUpBlock(b)) return false;
    const st = BTIER.steps[b.def][b.tier - 1]; b.tu = { left: Math.round(st.time * 20), total: Math.round(st.time * 20), sm: 0, se: 0 }; return true;
  }
  bldUpTick(b, p) {
    const u = b.tu, st = BTIER.steps[b.def][b.tier - 1], adv = Math.min(u.left, p.eff * (b.eb || 1)), fr = adv / u.total;
    u.left -= adv; u.sm += st.cost * fr; u.se += st.energy * fr; p.spentM += st.cost * fr; p.spentE += st.energy * fr;
    if (u.left <= 0) { b.tier++; b.tu = null; this.ev({ e: 'bupg', id: b.id, owner: b.owner, tier: b.tier, x: b.x, z: b.z }); }
  }
  // ---------- electronic warfare ----------
  buildEW() {
    const J = this.jammers; J.length = 0;
    for (const e of this.ents) {
      if (e.dead) continue;
      const d = e.ed || DEFS[e.def]; if (!d.ew) continue;
      if (e.kind === 'building' && e.progress < 1) continue;
      if (e.ap && GROUND_PHASES.has(e.ap)) continue;
      if (e.stun > 0 || e.emcon || !this.players[e.owner].ewOn) continue;
      J.push({ id: e.id, x: e.x, z: e.z, r: d.ew.radius, r2: d.ew.radius * d.ew.radius, team: e.team, power: d.ew.power || 1, air: !!e.air });
    }
    for (const e of this.ents) {
      if (e.dead) continue;
      let jam = 0, cover = 0;
      for (let i = 0; i < J.length; i++) {
        const j = J[i], dx = e.x - j.x, dz = e.z - j.z;
        const rr = (e.air && DEFS[e.def].spy) ? j.r2 * 4 : j.r2;   // a spy drone at the edge of space is jammed from twice as far away
        if (dx * dx + dz * dz <= rr) { if (j.team !== e.team) { if (j.power > jam) jam = j.power; } else if (j.power > cover) cover = j.power; }
      }
      if (jam && DEFS[e.def].jamRes) jam *= 1 - DEFS[e.def].jamRes;
      e.jam = jam; e.cover = cover;
    }
  }
  // ---------- radar ----------
  // Each emitter has a nominal range, optionally a forward cone, and is degraded by enemy jamming over the emitter itself.
  // A contact is held when the target is inside range * rcs^(1/4) (the radar equation); low flyers are masked from ground radars;
  // jamming that covers the target shrinks the range, but inside the burn-through range (30%) the radar always wins.
  updateRadar() {
    const S = this.radars; S.length = 0;
    for (const c of this.contact) c.clear();
    // ground surveillance radars: range is a fraction of the map width; every enemy ground unit inside is held as a track
    const G = this.gradars; G.length = 0; for (const c of this.gcontact) c.clear();
    for (const e of this.ents) {
      if (e.dead || e.kind !== 'building' || e.progress < 1) continue;
      const d = BUILDINGS[e.def]; if (!d.gradar) continue;
      if (e.stun > 0 || e.emcon || !this.players[e.owner].ewOn) continue;
      const r0 = Math.max(140, d.gradar.frac * this.map.size);
      G.push({ id: e.id, x: e.x, z: e.z, team: e.team, r0, r: r0 * Math.max(0.25, 1 - 0.15 * (e.jam || 0)) });
    }
    if (G.length) for (const t of this.ents) {
      if (t.dead || t.air || t.kind !== 'unit') continue;
      for (let i = 0; i < G.length; i++) { const g = G[i]; if (g.team === t.team) continue; const dx = t.x - g.x, dz = t.z - g.z; if (dx * dx + dz * dz <= g.r * g.r) this.gcontact[g.team].add(t.id); }
    }
    for (const e of this.ents) {
      if (e.dead) continue;
      const d = e.ed || DEFS[e.def]; if (!d.radar) continue;
      if (e.kind === 'building' && e.progress < 1) continue;
      if (e.ap && GROUND_PHASES.has(e.ap)) continue;
      if (e.stun > 0 || e.emcon || !this.players[e.owner].ewOn) continue;
      const jam = e.jam || 0, r = d.radar.range * Math.max(0.25, 1 - 0.15 * jam);
      S.push({ id: e.id, x: e.x, z: e.z, team: e.team, r, r0: d.radar.range, arc: d.radar.arc === undefined ? -1 : d.radar.arc, dx: e.dirx || 0, dz: e.dirz || 0, air: !!e.air, jam, kind: e.kind });
    }
    if (!S.length) return;
    for (const t of this.ents) {
      if (t.dead || !t.air || t.kind !== 'unit') continue;
      const td = DEFS[t.def], q = Math.sqrt(Math.sqrt(td.rcs || 1)), cover = t.cover || 0;
      const hz = 0.65 + 0.35 * Math.min(1, (td.alt || 20) / 28);
      for (let i = 0; i < S.length; i++) {
        const s = S[i]; if (s.team === t.team || this.contact[s.team].has(t.id)) continue;
        const dx = t.x - s.x, dz = t.z - s.z, d2 = dx * dx + dz * dz, eff = s.r * q * (s.air ? 1 : hz);
        const R = Math.max(eff * Math.max(0.2, 1 - 0.2 * cover), eff * 0.3);
        if (d2 > R * R) continue;
        if (s.arc > -1) { const dd = Math.sqrt(d2) || 1; if ((s.dx * dx + s.dz * dz) / dd < s.arc) continue; }
        this.contact[s.team].add(t.id);
      }
    }
  }
  // true if the target is held by radar (not necessarily visible)
  tracked(team, e) { return !!e.air && this.contact[team].has(e.id); }
  wCan(w, tg) { if (tg.air ? !w.air : !w.ground) return false; if (w.arm && !this.emits(tg)) return false; if (w.drone && !DEFS[tg.def].drone) return false; return true; }
  wRange(e, w) { if (e.jam && (w.radar || (e.air && w.kind === 'missile'))) return w.range * (1 - 0.14 * e.jam); return w.range; }
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

  // friendly engineers close to a building speed up its construction, production and upgrades (+50% each, up to 6)
  engScan(b) {
    const gw = this.gw, R = b.size * CELL / 2 + 32, r2 = R * R;
    const gx0 = clamp(Math.floor((b.x - R) / GRID), 0, gw - 1), gx1 = clamp(Math.floor((b.x + R) / GRID), 0, gw - 1);
    const gz0 = clamp(Math.floor((b.z - R) / GRID), 0, gw - 1), gz1 = clamp(Math.floor((b.z + R) / GRID), 0, gw - 1);
    let n = 0;
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      for (let i = this.head[gz * gw + gx]; i !== -1; i = this.next[i]) {
        const e = this.ents[i];
        if (e.dead || e.kind !== 'unit' || e.owner !== b.owner || !DEFS[e.def].builder || e.stun > 0) continue;
        const dx = e.x - b.x, dz = e.z - b.z; if (dx * dx + dz * dz <= r2) n++;
      }
    }
    b.en = n; b.eb = 1 + 0.5 * Math.min(n, 6);
  }
  updateBuilding(b) {
    const d = BUILDINGS[b.def], p = this.players[b.owner];
    b.px = b.x; b.pz = b.z;
    if (b.stun > 0) b.stun--;
    if (b.eb === undefined || ((this.tick + b.id) % 10) === 0) this.engScan(b);
    if (b.progress < 1) {
      const dp = DT / d.time * (d.energy > 0 ? p.eff : p.effM) * b.eb;
      b.progress += dp; b.sm += d.cost * dp; b.se += d.energy * dp; p.spentM += d.cost * dp; p.spentE += d.energy * dp;
      b.hp = Math.min(b.maxhp, b.hp + b.maxhp * 0.9 * dp);
      if (b.progress >= 1) { b.progress = 1; b.hp = Math.min(b.maxhp, b.hp); this.ev({ e: 'built', id: b.id, owner: b.owner, def: b.def, x: b.x, z: b.z }); }
      return;
    }
    const tm = BTIER.mult[(b.tier || 1) - 1];
    let ym = 1;
    if (d.oil && b.node >= 0) { const nd = this.map.oil[b.node]; if (nd.res === undefined) nd.res = 30000; nd.res -= d.income * tm * DT; ym = nd.res > 0 ? 1 : 0.25; }   // fields run dry; a dribble remains
    p.incM += d.income * tm * ym; p.incE += d.incomeE * tm; p.capM += (d.capM || 0) * tm; p.capE += (d.capE || 0) * tm;
    if (b.tu) this.bldUpTick(b, p);
    if (d.upkeep && !b.stun) p.upkeep += d.upkeep;
    if (b.queue.length && !b.stun) {
      const it = b.queue[0], ud = UNITS[it.type];
      if (it.left > 0) {
        const adv = Math.min(it.left, p.eff * b.eb), fr = adv / ud.timeTicks;
        it.left -= adv; it.sm += ud.cost * fr; it.se += ud.energy * fr; p.spentM += ud.cost * fr; p.spentE += ud.energy * fr;
      }
      const si = ud.from === 'airfield' ? (b.afd ? this.afFreeStand(b) : -1) : 0;
      if (it.left <= 0 && ((ud.missile && (b.mis ? b.mis.length : 0) < 4) || ud.orbital || (!ud.missile && p.units + ud.batch <= UNIT_CAP && si >= 0))) {
        b.queue.shift();
        if (b.rep && b.queue.length < 6) b.queue.push({ type: it.type, left: ud.timeTicks, sm: 0, se: 0 });
        if ((ud.missile || ud.orbital) && this.spaceItemDone(b, it)) { if (b.queue.length === 0) b.flash = 0; return this.updateBuildingTail(b, d, p); }
        const made = [];
        if (ud.from === 'airfield') made.push(this.spawnAircraft(b, it.type, si));
        else for (let k = 0; k < ud.batch; k++) {
          const spot = this.spawnSpot(b, ud);
          const u = this.spawnUnit(it.type, b.owner, spot.x + (ud.air ? (k - (ud.batch - 1) / 2) * 3 : 0), spot.z);
          made.push(u);
        }
        this.ev({ e: 'trained', id: made[0].id, owner: b.owner, def: it.type, x: made[0].x, z: made[0].z });
        if (b.rally && !ud.builder && ud.from !== 'airfield') this.cmdMove(made, b.rally.x, b.rally.z, 'move');
      }
    }
    this.updateBuildingTail(b, d, p);
  }
  updateBuildingTail(b, d, p) {
    if (b.up && !b.stun) this.afUpgradeTick(b, p);
    if (b.abmcd > 0) b.abmcd--;
    if (d.weapons.length && !b.stun) this.combat(b, d);
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
    const d = u.ed || UNITS[u.def], map = this.map;
    u.px = u.x; u.pz = u.z;
    if (u.boarded) return;
    if (u.chute > 0) { u.chute--; u.moving = false; u.vx = 0; u.vz = 0; return; }
    if (u.h !== undefined) u.ph = u.h;   // previous-tick altitude fraction: renderer interpolates h between ticks (a stale value made diving aircraft saw-tooth up and down)
    if (u.stun > 0) { u.stun--; u.moving = false; u.vx = 0; u.vz = 0; return; }
    const cdr = (d.drone && u.jam) ? Math.max(0.3, 1 - 0.2 * u.jam) : 1;
    for (let k = 0; k < u.cd.length; k++) if (u.cd[k] > 0) u.cd[k] = Math.max(0, u.cd[k] - cdr);
    if (u.flash > 0) u.flash--;
    if (u.lcd > 0) u.lcd--;
    if (u.apsCd > 0) u.apsCd--; else if (d.aps && u.apsN < d.aps.n && ((this.tick + u.id) % 900) === 0) u.apsN++;
    if (u.ap !== undefined && u.ap !== 'fly') { this.sortie(u, d); return; }
    if (u.fuel !== undefined && (u.ap === 'fly' || (u.ap === undefined && d.decoy)) && this.fuelLogic(u, d)) return;
    if (u.ap === 'fly' && u.am && ((this.tick + u.id) % 10) === 0 && this.afBingo(u)) { if (this.startRtb(u, true)) { this.sortie(u, d); return; } }
    const o = u.order;
    if (o.t === 'idle' && ((this.tick + u.id) % 20) === 0 && !u.air) {
      if (d.sup && u.sup < d.sup * 0.3 && !u.target) this.autoResupply(u, d);
      else if (d.supply && u.auto) this.truckAuto(u, d);
    }
    if (d.upkeep) this.players[u.owner].upkeep += d.upkeep;
    if (d.heal && ((this.tick + u.id) & 3) === 0) this.healAround(u, d);
    if (d.escort && o.t === 'idle' && ((this.tick + u.id) % 10) === 0) this.escort(u, d);
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
      if (o.t === 'idle' && !tg && u.st > 0 && d.speed > 0 && !d.air && !d.builder && ((this.tick + u.id) % 8) === 0) { const e = this.autoEngage(u, d); if (e) tg = e; }
    }
    // fixed-wing aircraft keep flying: loiter, attack passes, banked turns
    if (d.fw && (u.ap === undefined || u.ap === 'fly')) {
      this.fwUnit(u, d, o, tg);
      u.vx = (u.x - u.px) / DT; u.vz = (u.z - u.pz) / DT;
      if (d.weapons.length) this.combat(u, d);
      return;
    }
    // movement
    let moved = false;
    switch (o.t) {
      case 'move': if (this.goTo(u, d, o.x, o.z, 2.2)) this.finishOrder(u); else moved = true; break;
      case 'board': moved = this.boardTick(u, d); break;
      case 'escort': {
        const ld = this.byId.get(o.tid);
        if (!ld || ld.dead) { this.finishOrder(u); break; }
        const lx = ld.x - u.x, lz = ld.z - u.z, ll = Math.sqrt(lx * lx + lz * lz);
        if (tg && this.inRange(u, d, tg)) this.faceTo(u, tg.x, tg.z);
        else if (tg && (tg.x - ld.x) * (tg.x - ld.x) + (tg.z - ld.z) * (tg.z - ld.z) < 70 * 70) { this.chaseTarget(u, d, tg); moved = true; }
        else if (ll > 16) { this.goTo(u, d, ld.x - lx / ll * 8, ld.z - lz / ll * 8, 5); moved = true; }
        break;
      }
      case 'attackmove':
        if (tg) { if (this.inRange(u, d, tg)) { this.faceTo(u, tg.x, tg.z); } else { this.chaseTarget(u, d, tg); moved = true; } }
        else if (this.goTo(u, d, o.x, o.z, 2.5)) this.finishOrder(u); else moved = true;
        break;
      case 'attack':
        if (this.inRange(u, d, tg)) { this.faceTo(u, tg.x, tg.z); u.path = null; }
        else {
          this.chaseTarget(u, d, tg); moved = true;
          if (o.auto) { if (o.leash) { const hx = u.x - u.hx, hz = u.z - u.hz; if (hx * hx + hz * hz > o.leash * o.leash) this.finishOrder(u); } else { const dx = tg.x - u.x, dz = tg.z - u.z, r = d.vision * 1.8; if (dx * dx + dz * dz > r * r) this.finishOrder(u); } }
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
    if (d.air) { if (!moved) this.rotRest(u, d); u.pit = -((u.spd || 0) / d.speed) * (d.base === 'heli' ? 0.24 : 0.18); }
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
    for (let k = 0; k < d.weapons.length; k++) {
      const w = d.weapons[k];
      if (u.am && u.am[k] === 0) continue;
      if (w.sec) continue;
      if (!this.wCan(w, tg)) continue;
      if (dd <= this.wRange(u, w) + tg.radius * 0.5 && dd >= w.min) return true;
    }
    return false;
  }
  chaseTarget(u, d, tg) {
    // move toward the largest-range usable weapon's range
    let r = 0;
    for (let k = 0; k < d.weapons.length; k++) { const w = d.weapons[k]; if (!w.sec && this.wCan(w, tg) && !(u.am && u.am[k] === 0)) r = Math.max(r, this.wRange(u, w)); }
    this.goTo(u, d, tg.x, tg.z, Math.max(2, r * 0.85), true);
  }
  // returns true when arrived
  goTo(u, d, tx, tz, tol, chasing) {
    const map = this.map;
    const dx0 = tx - u.x, dz0 = tz - u.z;
    const dd = Math.sqrt(dx0 * dx0 + dz0 * dz0);
    if (dd <= tol) { u.path = null; return true; }
    if (d.drone && u.jam >= 3 && ((this.tick + u.id) & 3) === 0) return false;
    let wx, wz;
    if (d.air) { this.rotMove(u, d, tx, tz, chasing ? tol : 0.5); return false; }
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
    let step = d.speed * DT * (d.air ? 1 : (0.3 + 0.7 * Math.max(0, align))) * ((d.drone && u.jam) ? Math.max(0.35, 1 - 0.18 * u.jam) : 1);
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
  seen(team, e) { const c = this.map.cellOf(e.x, e.z); return c >= 0 && this.vis[team][c] === 1; }
  canSee(team, e) { return this.seen(team, e) || (e.air && this.contact[team].has(e.id)) || (!e.air && this.gcontact[team].has(e.id)) || this.esm[team].has(e.id); }
  acquire(u, d, radius, filt) {
    const vis = this.vis[u.team], map = this.map;
    let best = null, bs = 1e18;
    const consider = (e) => {
      if (e.dead || e.team === u.team || DEFS[e.def].untouchable) return;
      if (e.air ? !d.hitsAir : !d.hitsGround) return;
      if (filt && !filt(e)) return;
      const dx = e.x - u.x, dz = e.z - u.z, dd = Math.sqrt(dx * dx + dz * dz);
      if (dd > radius + e.radius * 0.5) return;
      const c = map.cellOf(e.x, e.z);
      const sight = c >= 0 && vis[c] === 1;
      const gc = !e.air && this.gcontact[u.team].has(e.id), ctc = (e.air && this.contact[u.team].has(e.id)) || gc;
      if (!sight && !ctc && !this.esm[u.team].has(e.id)) return;   // radar tracks / ESM bearings only support radar/missile weapons
      let usable = false;
      for (let k = 0; k < d.weapons.length; k++) { const w = d.weapons[k]; if ((w.sec && !filt) || (!w.sec && filt)) continue; if (!sight && !(w.radar || w.kind === 'missile' || (gc && w.ind))) continue; if (this.wCan(w, e) && dd >= w.min && !(u.am && u.am[k] === 0)) { usable = true; break; } }
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
    if (!tg && !ground && !d.hasSec) return;
    const sy = this.muzzleY(e, d);
    for (let k = 0; k < d.weapons.length; k++) {
      const w = d.weapons[k];
      if (e.cd[k] > 0 || (e.am && e.am[k] === 0)) continue;
      if (e.sup !== undefined && e.sup < w.sc) continue;   // out of ammunition
      // secondary guns (coaxial / top machine guns) pick their own infantry targets while the main gun works on its target
      const T = w.sec ? this.secTarget(e, d, w) : tg, gnd = ground && !w.sec;
      if (!T && !gnd) continue;
      let ax, az, ay, tid = 0;
      if (gnd) {
        if (!w.ground || w.kind === 'hit') continue;
        ax = o.x; az = o.z; ay = this.map.hAt(ax, az);
      } else {
        if (!this.wCan(w, T)) continue;
        ax = T.x; az = T.z; tid = T.id;
        ay = this.map.hAt(ax, az) + (T.air ? DEFS[T.def].alt : 1.2);
      }
      const dx = ax - e.x, dz = az - e.z, dd = Math.sqrt(dx * dx + dz * dz);
      const rad = gnd ? 0 : T.radius * 0.5;
      if (dd > this.wRange(e, w) + rad || dd < w.min) continue;
      if (!w.sec && d.hasSec && !gnd && T.armor === 'inf' && !T.air && w.type === 'ap' && dd <= d.secRange + 2) continue;   // do not waste main-gun rounds on infantry the machine gun can reach
      if (d.fw && w.kind !== 'boom' && dd > 3) { const cs = (e.dirx * dx + e.dirz * dz) / dd; if (cs < (w.kind === 'hit' ? 0.9 : w.kind === 'missile' ? 0.35 : 0.6)) continue; }
      e.cd[k] = w.reloadTicks;
      if (e.sup !== undefined) e.sup -= w.sc;
      if (e.am && e.am[k] > 0) e.am[k]--;
      e.flash = 3;
      const mx = e.x + (e.dirx || 0) * e.radius * 0.8, mz = e.z + (e.dirz || 0) * e.radius * 0.8;
      if (w.kind === 'boom') { if (T && T.kind === 'unit' && T.apsN > 0 && this.apsDrone(T, e)) { this.kill(e, false); return; } this.detonate(e, w, ay); return; }
      if (w.kind === 'hit') {
        const miss = e.jam && DEFS[e.def].drone && this.rng.next() < 0.14 * e.jam;
        if (!miss) this.damage(T, w.dmg * dmgMult(w.type, T.armor, DEFS[T.def].drone), e);
        this.ev({ e: 'shot', w: w.type, x: mx, y: sy, z: mz, tx: ax, ty: ay, tz: az, hit: !miss, air: !!T.air });
      } else {
        let hx = ax, hz = az;
        if (!gnd && T.kind === 'unit' && w.kind === 'shell') {
          const ft = dd / w.speed; hx += T.vx * ft * 0.7; hz += T.vz * ft * 0.7;
        }
        if (w.spread) { hx += (this.rng.next() - 0.5) * 2 * w.spread * dd; hz += (this.rng.next() - 0.5) * 2 * w.spread * dd; }
        hx = clamp(hx, 1, this.map.size - 1); hz = clamp(hz, 1, this.map.size - 1);
        const ddx = hx - mx, ddz = hz - mz, dist2 = Math.sqrt(ddx * ddx + ddz * ddz);
        const flight = Math.max(2, Math.ceil(dist2 / w.speed / DT));
        const arcH = w.arc >= 5 ? w.arc : dist2 * w.arc * 0.4;
        this.projs.push({
          id: ++this.nextPid, k: w.kind, w: w.type, big: w.splash >= 10, x: mx, y: sy, z: mz, sx: mx, sy, sz: mz,
          tx: hx, ty: (tid && w.kind === 'missile') ? ay : this.map.hAt(hx, hz) + (T && T.air && w.kind === 'shell' ? 0 : 0.5), tz: hz,
          tid, speed: w.speed, dmg: w.dmg, dtype: w.type, splash: w.splash, owner: e.owner, team: e.team, src: e.id,
          arc: arcH, t: 0, dur: flight, life: Math.ceil(10 / DT), aa: !w.ground, name: e.def, fx: w.fx, fa: !!e.air, cz: w.kind === 'missile' && w.ground && w.range >= 100,
        });
        this.ev({ e: 'launch', w: w.kind, big: w.splash >= 10, x: mx, y: sy, z: mz });
      }
    }
  }
  secTarget(e, d, w) {
    let t = e.t2 ? this.byId.get(e.t2) : null;
    if (t) { const dx = t.x - e.x, dz = t.z - e.z; if (t.dead || (t.air ? !w.air : false) || dx * dx + dz * dz > (w.range + 4) * (w.range + 4) || !this.canSee(e.team, t)) { t = null; e.t2 = 0; } }
    if (!t && ((this.tick + e.id) % 5) === 0) {
      t = this.acquire(e, { weapons: [w], hitsGround: !!w.ground, hitsAir: !!w.air }, w.range, (x) => x.armor === 'inf' || (w.air && x.air));
      e.t2 = t ? t.id : 0;
    }
    return t;
  }
  detonate(e, w, ay) {
    const p = { x: e.x, y: ay, z: e.z, tx: e.x, tz: e.z, splash: w.splash, dmg: w.dmg, dtype: w.type, team: e.team, aa: false, src: e.id, big: w.splash >= 10, tid: 0, stun: w.stun };
    this.impact(p);
    this.kill(e, true);
  }
  healAround(u, d) {
    const r2 = d.heal.radius * d.heal.radius, amt = d.heal.rate * DT * 4, gw = this.gw;
    const gx0 = clamp(Math.floor((u.x - d.heal.radius) / GRID), 0, gw - 1), gx1 = clamp(Math.floor((u.x + d.heal.radius) / GRID), 0, gw - 1);
    const gz0 = clamp(Math.floor((u.z - d.heal.radius) / GRID), 0, gw - 1), gz1 = clamp(Math.floor((u.z + d.heal.radius) / GRID), 0, gw - 1);
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      for (let i = this.head[gz * gw + gx]; i !== -1; i = this.next[i]) {
        const e = this.ents[i];
        if (e === u || e.dead || e.team !== u.team || e.kind !== 'unit' || e.hp >= e.maxhp) continue;
        const dx = e.x - u.x, dz = e.z - u.z;
        if (dx * dx + dz * dz <= r2) e.hp = Math.min(e.maxhp, e.hp + amt);
      }
    }
  }
  // escort robots tag along with nearby moving infantry
  escort(u, d) {
    const gw = this.gw, R = 30, gx0 = clamp(Math.floor((u.x - R) / GRID), 0, gw - 1), gx1 = clamp(Math.floor((u.x + R) / GRID), 0, gw - 1);
    const gz0 = clamp(Math.floor((u.z - R) / GRID), 0, gw - 1), gz1 = clamp(Math.floor((u.z + R) / GRID), 0, gw - 1);
    let best = null, bd = R * R;
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      for (let i = this.head[gz * gw + gx]; i !== -1; i = this.next[i]) {
        const e = this.ents[i];
        if (e === u || e.dead || e.team !== u.team || e.kind !== 'unit' || e.armor !== 'inf' || DEFS[e.def].drone || !e.order || e.order.t === 'idle') continue;
        const dx = e.x - u.x, dz = e.z - u.z, dd = dx * dx + dz * dz;
        if (dd < bd) { bd = dd; best = e; }
      }
    }
    if (!best) return;
    const o = best.order; let tx, tz;
    if (o.t === 'attack') { const t = this.byId.get(o.tid); if (!t) return; tx = t.x; tz = t.z; } else { tx = o.x; tz = o.z; }
    const ox = ((u.id % 5) - 2) * 2.4, oz = ((u.id % 3) - 1) * 2.4;
    this.cmdMove([u], tx + ox, tz + oz, 'move');
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
        if (p.fx === 'rocket' && p.tid && p.t > 0.45 && this.apsIntercept(p, this.byId.get(p.tid), 0.8)) done = true;   // unguided rockets / RPGs can be hard-killed
        if (p.t >= 1 && !done) { this.impact(p); done = true; }
      } else {
        let tg = p.tid ? this.byId.get(p.tid) : null;
        if (tg && !tg.dead && tg.cover > 0 && this.rng.next() < 0.05 * tg.cover) { p.tid = 0; tg = null; this.ev({ e: 'decoy', x: p.x, y: p.y, z: p.z }); }
        if (tg && !tg.dead && !p.aa && !p.cz && this.apsIntercept(p, tg, 0.88)) done = true;    // guided anti-tank missiles
        if (!done && p.cz && ((this.tick + p.id) % 4) === 0 && this.samIntercept(p)) done = true;   // SAMs vs cruise missiles
        if (!done && tg && !tg.dead && !p.cz) done = this.selfDefense(p, tg);
        if (!done && tg && !tg.dead) { p.tx = tg.x; p.tz = tg.z; p.ty = this.map.hAt(tg.x, tg.z) + (tg.air ? DEFS[tg.def].alt : 1.2); }
        if (!done) {
          const dx = p.tx - p.x, dy = p.ty - p.y, dz = p.tz - p.z, dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const step = p.speed * DT;
          p.dx = dx; p.dz = dz;
          if (dd <= step + (tg ? tg.radius * 0.7 : 0.5)) { p.x = p.tx; p.y = p.ty; p.z = p.tz; this.impact(p); done = true; }
          else { p.x += dx / dd * step; p.y += dy / dd * step; p.z += dz / dd * step; }
          if (--p.life <= 0 && !done) { this.impact(p); done = true; }
        }
      }
      if (!done) ps[w++] = p;
    }
    ps.length = w;
  }
  // countermeasures carried by higher-tier units: flares / chaff / IRCM (decoy the seeker) and directed-energy lasers (aircraft)
  selfDefense(p, tg) {
    const d = tg.ed || DEFS[tg.def], dx = p.x - tg.x, dz = p.z - tg.z, d2 = dx * dx + dz * dz;
    if (d.laser && tg.lcd <= 0 && d2 <= d.laser.range * d.laser.range) {
      tg.lcd = d.laser.cd; const ok = this.rng.next() < d.laser.pk;
      this.ev({ e: 'laser', x: tg.x, y: this.map.hAt(tg.x, tg.z) + (d.alt || 2), z: tg.z, tx: p.x, ty: p.y, tz: p.z, ok });
      if (ok) return true;
    }
    if (d.ircm && !p.ir && d2 <= 45 * 45) {
      p.ir = 1;
      if (this.rng.next() < d.ircm * Math.max(0.4, 1 - 0.2 * (tg.jam || 0))) { p.tid = 0; this.ev({ e: 'decoy', x: p.x, y: p.y, z: p.z }); }
    }
    return false;
  }
  // active protection: hard-kills incoming guided missiles and unguided rockets (not kinetic tank rounds, bombs, artillery or cruise missiles)
  apsIntercept(p, tg, pk) {
    if (!tg || tg.dead || !(tg.apsN > 0) || tg.apsCd > 0 || p.aa) return false;
    const ar = DEFS[tg.def].aps.range, ax = p.x - tg.x, az = p.z - tg.z;
    if (ax * ax + az * az > ar * ar) return false;
    tg.apsN--; tg.apsCd = 60;
    const hit = this.rng.next() < pk;
    this.ev({ e: 'aps', x: p.x, y: p.y, z: p.z, id: tg.id, ok: hit });
    return hit;
  }
  // a drone about to detonate on a protected vehicle can be shot down by its APS
  apsDrone(tg, drone) {
    if (!tg || tg.dead || !(tg.apsN > 0) || tg.apsCd > 0 || !DEFS[tg.def].aps) return false;
    tg.apsN--; tg.apsCd = 60;
    const hit = this.rng.next() < 0.7;
    this.ev({ e: 'aps', x: drone.x, y: this.map.hAt(drone.x, drone.z) + 1.5, z: drone.z, id: tg.id, ok: hit });
    return hit;
  }
  // SAM sites / AA vehicles try to shoot down cruise missiles that fly into their coverage
  samIntercept(p) {
    for (const e of this.ents) {
      if (e.dead || e.team === p.team || e.stun > 0 || (e.kind === 'building' && e.progress < 1)) continue;
      const d = e.ed || DEFS[e.def]; if (!d.hitsAir) continue;
      for (let k = 0; k < d.weapons.length; k++) {
        const w = d.weapons[k]; if (!w.air || e.cd[k] > 0 || (e.am && e.am[k] === 0)) continue;
        const gun = w.kind !== 'missile', dx = p.x - e.x, dz = p.z - e.z, rr = Math.min(w.range * (gun ? 0.5 : 0.85), d.vision * 1.2);
        if (dx * dx + dz * dz > rr * rr) continue;
        e.cd[k] = Math.max(e.cd[k], w.reloadTicks); if (e.am && e.am[k] > 0) e.am[k]--;
        const pk = (gun ? 0.12 : 0.32) * Math.max(0.2, 1 - 0.25 * (e.jam || 0));
        const hit = this.rng.next() < pk;
        this.ev({ e: 'intercept', sx: e.x, sz: e.z, x: p.x, y: p.y, z: p.z, ok: hit });
        if (hit) { this.ev({ e: 'boom', x: p.x, y: p.y, z: p.z, r: 3.5, big: false, air: true }); return true; }
        return false;
      }
    }
    return false;
  }
  impact(p) {
    const src = this.byId.get(p.src);
    const big = p.big;
    this.ev({ e: 'boom', x: p.x, y: p.y, z: p.z, r: p.splash > 0 ? p.splash : 1.5, big, air: p.aa, emp: !!p.stun });
    if (p.splash > 0) {
      const r = p.splash;
      for (const e of this.ents) {
        if (e.dead || e.team === p.team) continue;
        if (p.aa ? !e.air : (e.air && p.dtype !== 'emp')) continue;
        const dx = e.x - p.tx, dz = e.z - p.tz, dd = Math.sqrt(dx * dx + dz * dz) - e.radius * 0.6;
        if (dd > r) continue;
        const f = dd <= 0 ? 1 : 1 - 0.7 * (dd / r);
        this.damage(e, p.dmg * f * dmgMult(p.dtype, e.armor, DEFS[e.def].drone), src);
        if (p.stun && !e.dead && (e.armor !== 'inf' || DEFS[e.def].drone)) { const st = Math.round(p.stun * f * (e.kind === 'building' ? 0.6 : 1)); if (st > e.stun) e.stun = st; }
      }
    } else {
      const tg = p.tid ? this.byId.get(p.tid) : null;
      if (tg && !tg.dead) {
        const dx = tg.x - p.x, dz = tg.z - p.z;
        if (dx * dx + dz * dz <= (tg.radius + 3) * (tg.radius + 3)) this.damage(tg, p.dmg * dmgMult(p.dtype, tg.armor, DEFS[tg.def].drone), src);
      }
    }
  }
  damage(t, amt, src) {
    if (t.dead || amt <= 0 || (t.kind === 'unit' && DEFS[t.def].untouchable)) return;
    if (src && src.vet) amt *= 1 + 0.1 * src.vet;
    t.hp -= amt;
    if (src && src.kind === 'unit') this.gainXp(src, amt, t.hp <= 0);
    const op = this.players[t.owner];
    if (this.tick - op.lastAlert > 80 && t.hp > 0) { op.lastAlert = this.tick; this.ev({ e: 'alert', owner: t.owner, x: t.x, z: t.z, kind: t.kind }); }
    if (t.hp <= 0) { if (src) this.players[src.owner].stats.killed++; this.kill(t); return; }
    if (t.kind === 'unit' && src && !src.dead && t.order.t === 'idle' && t.st > 0 && (t.ap === undefined || t.ap === 'fly')) {
      const d = t.ed || UNITS[t.def];
      if (d.weapons.length && (src.air ? d.hitsAir : d.hitsGround) && src.team !== t.team) {
        const dx = src.x - t.x, dz = src.z - t.z;
        if (dx * dx + dz * dz < d.vision * d.vision * 3) t.order = { t: 'attack', tid: src.id, auto: true, leash: t.st === 2 ? 140 : 60 };
      }
    }
  }
  kill(e, silent, sold) {
    if (e.dead) return;
    e.dead = true; e.hp = 0;
    const p = this.players[e.owner];
    if (e.kind === 'unit') { if (!silent && !e.boarded) this.addWreck(e); p.units--; if (e.ap !== undefined) this.afForget(e); if (e.cargo && e.cargo.length) this.loseCargo(e); }
    else {
      if (e.afd) {
        this.afRelease(e); this.afCancelUpgrade(e);
        for (const u of this.ents) if (!u.dead && u.kind === 'unit' && u.af === e.id && u.ap && GROUND_PHASES.has(u.ap)) { u.af = 0; this.kill(u, true); }
      }
      const d = BUILDINGS[e.def], n = this.map.n;
      for (let j = 0; j < d.size; j++) for (let i = 0; i < d.size; i++) this.map.occ[(e.cz0 + j) * n + e.cx0 + i] = 0;
      if (e.node >= 0) this.map.oil[e.node].building = 0;
      // refund queued units
      for (const q of e.queue) { p.credits += q.sm; p.energy += q.se; }
    }
    p.stats.lost++;
    this.ev({ e: 'dead', id: e.id, def: e.def, kind: e.kind, armor: e.armor, owner: e.owner, x: e.x, z: e.z, air: e.air, silent: !!silent, y: this.map.hAt(e.x, e.z) + (e.air ? DEFS[e.def].alt : 0) });
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
          if ((a.ap !== undefined && a.ap !== 'fly' && a.ap !== 'rtb') || (b.ap !== undefined && b.ap !== 'fly' && b.ap !== 'rtb')) continue;
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
      const d = e.ed || DEFS[e.def];
      if (e.kind === 'building' && e.progress <= 0) continue;
      const vm = (d.spy ? Math.max(0, 1 - 0.45 * (e.jam || 0)) : (e.jam && (e.air || d.drone)) ? Math.max(0.35, 1 - 0.2 * e.jam) : 1) * (e.kind === 'unit' ? this.visionMul(e, d) : 1);
      if (vm <= 0.05) continue;
      const r = d.vision * vm / CELL, cx = Math.floor(e.x / CELL), cz = Math.floor(e.z / CELL), ri = Math.ceil(r);
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
    if (this.orb && this.orb.length) this.spaceVision((team, x, z, rad) => {
      const r = rad / CELL, cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), ri = Math.ceil(r), v = this.vis[team], ex = this.expl[team];
      for (let zz = Math.max(0, cz - ri); zz <= Math.min(n - 1, cz + ri); zz++) for (let xx = Math.max(0, cx - ri); xx <= Math.min(n - 1, cx + ri); xx++) if ((xx - cx) * (xx - cx) + (zz - cz) * (zz - cz) <= r * r) { v[zz * n + xx] = 1; ex[zz * n + xx] = 1; }
    });
    for (const q of this.points) if (q.team >= 0) {   // owned control points give vision
      const r = 52 / CELL, cx = Math.floor(q.x / CELL), cz = Math.floor(q.z / CELL), ri = Math.ceil(r), v = this.vis[q.team], ex = this.expl[q.team];
      for (let z = Math.max(0, cz - ri); z <= Math.min(n - 1, cz + ri); z++) for (let x = Math.max(0, cx - ri); x <= Math.min(n - 1, cx + ri); x++) if ((x - cx) * (x - cx) + (z - cz) * (z - cz) <= r * r) { v[z * n + x] = 1; ex[z * n + x] = 1; }
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
    for (const p of this.players) { mix(Math.round(p.credits * 10)); mix(Math.round(p.energy * 10)); mix(p.units); }
    for (const e of this.ents) { mix(e.id); mix(Math.round(e.x * 100)); mix(Math.round(e.z * 100)); mix(Math.round(e.hp)); if (e.h !== undefined) mix(Math.round(e.h * 100)); if (e.spd !== undefined) mix(Math.round(e.spd * 100)); if (e.apsN !== undefined) mix(e.apsN); if (e.tier > 1) mix(e.tier); }
    if (this.orb) { for (const o of this.orb) { mix(o.id); mix(Math.round(o.ph * 1e6)); mix(Math.round(o.hp)); mix(o.layer); } for (const m of this.msl) { mix(m.id); mix(m.t); } mix(this.rods.length); }
    mix(this.projs.length); mix(this.wx.kind); mix(this.crates.length); mix(this.wrecks.length);
    for (const q of this.points) { mix(q.team + 2); mix(Math.round(q.stock)); mix(Math.round(q.p)); }
    for (const e of this.ents) { if (e.fuel !== undefined) mix(Math.round(e.fuel * 10)); if (e.sup !== undefined) mix(Math.round(e.sup * 10)); if (e.stock !== undefined) mix(Math.round(e.stock)); if (e.vet) mix(e.vet); }
    return h >>> 0;
  }
}

Object.assign(Sim.prototype, AirOps, FlightOps, CargoOps, LogiOps, SpaceOps);
