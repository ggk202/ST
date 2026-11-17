// Logistics panel: weather and time of day, control points, supply depots and tankers, units short of ammunition or fuel, standing-order shortcuts.
import { DEFS, BUILDINGS } from './sim/defs.js';
import { WX } from './sim/logistics.js';

const $ = (id) => document.getElementById(id);
const fmtT = (ticks) => { const s = Math.max(0, Math.round(ticks / 20)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const bar = (f, col) => '<span class="lbar"><i style="width:' + Math.round(Math.max(0, Math.min(1, f)) * 100) + '%;background:' + (col || (f > 0.5 ? '#5bd18a' : f > 0.2 ? '#e8c04a' : '#e8483a')) + '"></i></span>';

export class LogiPanel {
  constructor(game) { this.g = game; this.on = false; this.acc = 9; this.lastLock = -99; this.el = $('logiPanel'); }
  toggle() { this.on = !this.on; this.el.classList.toggle('hidden', !this.on); $('btnLogi').classList.toggle('on', this.on); this.acc = 9; this.sig = ''; if (this.on) this.render(); }
  jump(x, z) { const c = this.g.renderer.cam; c.x = x; c.z = z; }
  update(dt) {
    this.acc += dt; if (this.acc < 0.5) return; this.acc = 0;
    this.lockWarning();
    if (this.on) this.render();
  }
  // enemy radar tracking one of our slow, valuable aircraft (transports, tankers, AWACS)
  lockWarning() {
    const g = this.g, s = g.sim, L = g.local, team = g.team; if (s.tick - this.lastLock < 400) return;
    for (const e of s.ents) {
      if (e.dead || e.owner !== L || !e.air || e.kind !== 'unit') continue;
      const d = DEFS[e.def]; if (!(d.cargo || d.tank || d.base === 'awacs')) continue;
      for (let t = 0; t < 4; t++) if (t !== team && s.contact[t].has(e.id)) { this.lastLock = s.tick; g.hud.toast('⚠ ' + d.name + ' is being tracked by enemy radar', 'warn'); this.g.lastAlert = { x: e.x, z: e.z }; return; }
    }
  }
  render() {
    const g = this.g, s = g.sim, L = g.local, team = g.team, w = s.wx;
    const mine = (e) => !e.dead && e.owner === L, ents = s.ents;
    let low = [], dry = [], thirst = [], trucks = [], auto = 0;
    for (const e of ents) {
      if (!mine(e) || e.kind !== 'unit') continue; const d = DEFS[e.def];
      if (d.sup && e.sup < d.sup * 0.25) low.push(e.id);
      if (e.fuel !== undefined && d.fuel && e.fuel < d.fuel * 0.25 && e.ap === 'fly') thirst.push(e.id);
      if (d.supply) { trucks.push(e); if (e.auto) auto++; }
    }
    let h = '<h3>Logistics <button class="x" id="logiX">×</button></h3>';
    h += '<div class="st">' + WX[w.kind] + ' · ' + (w.night > 0.6 ? 'night' : w.night > 0.15 ? 'dusk / dawn' : 'daylight') + '<br><small>Fog, rain and night cut vision (Mk II/III thermals cope better); storms and low cloud blind aircraft.</small></div>';
    if (s.points.length) {
      const n = s.points.filter((q) => q.team === team).length, hold = s.hold[team];
      h += '<div class="lsec"><b>Control points</b> ' + n + '/' + s.points.length + ' held' + (n * 2 > s.points.length ? ' · <span class="ok">winning in ' + fmtT(9600 - hold) + '</span>' : '') + '</div>';
      s.points.forEach((q, i) => { const st = q.team === team ? '<span class="ok">yours</span>' : q.team >= 0 ? '<span class="bad">enemy</span>' : 'neutral'; h += '<div class="lrow pt" data-x="' + q.x + '" data-z="' + q.z + '">Point ' + (i + 1) + ' · ' + st + (q.ct >= 0 && q.p > 0 ? ' · capturing ' + Math.round(q.p) + '%' : '') + (q.team === team ? ' ' + bar(q.stock / q.cap) : '') + '</div>'; });
    }
    const deps = ents.filter((e) => mine(e) && e.kind === 'building' && e.def === 'supplydepot');
    h += '<div class="lsec"><b>Supply depots</b> ' + (deps.length || 'none') + '</div>';
    for (const e of deps) h += '<div class="lrow pt" data-x="' + e.x + '" data-z="' + e.z + '">' + (e.progress < 1 ? 'building…' : bar(e.stock / BUILDINGS.supplydepot.depot.cap) + ' ' + Math.round(e.stock)) + '</div>';
    h += '<div class="lsec"><b>Trucks</b> ' + trucks.length + (trucks.length ? ' · ' + auto + ' on AUTO <button class="mini" id="logiAuto">' + (auto === trucks.length ? 'all off' : 'all AUTO') + '</button>' : '') + '</div>';
    const tks = ents.filter((e) => mine(e) && e.fstock !== undefined);
    if (tks.length) { h += '<div class="lsec"><b>Tankers</b> ' + tks.length + '</div>'; for (const e of tks) h += '<div class="lrow pt" data-x="' + e.x + '" data-z="' + e.z + '">' + bar(e.fstock / DEFS[e.def].tank.cap) + ' ' + Math.round(e.fstock) + ' fuel</div>'; }
    h += '<div class="lsec">Units low on ammo: <b class="' + (low.length ? 'bad' : '') + '">' + low.length + '</b> ' + (low.length ? '<button class="mini" id="logiLow">select</button>' : '') + '</div>';
    h += '<div class="lsec">Aircraft low on fuel: <b class="' + (thirst.length ? 'bad' : '') + '">' + thirst.length + '</b> ' + (thirst.length ? '<button class="mini" id="logiThirst">select</button>' : '') + '</div>';
    h += '<div class="lsec">Supply pallets on the ground: <b>' + s.crates.length + '</b> · wrecks to salvage: <b>' + s.wrecks.length + '</b></div>';
    const fields = s.map.oil.filter((o) => o.building && s.byId.get(o.building) && s.byId.get(o.building).owner === L);
    if (fields.length) { const res = fields.reduce((a, o) => a + (o.res === undefined ? 30000 : Math.max(0, o.res)), 0) / (fields.length * 30000); h += '<div class="lsec">Oil reserves ' + bar(res) + ' ' + Math.round(res * 100) + '%</div>'; }
    if (h === this.sig) return; this.sig = h; this.el.innerHTML = h;
    const q = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', fn); };
    q('logiX', () => this.toggle());
    q('logiLow', () => g.setSel(low)); q('logiThirst', () => g.setSel(thirst));
    q('logiAuto', () => g.cmd({ t: 'lauto', ids: trucks.map((e) => e.id), v: auto === trucks.length ? 0 : 1 }));
    for (const r of this.el.querySelectorAll('.pt')) r.addEventListener('click', () => this.jump(+r.dataset.x, +r.dataset.z));
  }
}
