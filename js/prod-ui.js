// Production overview: every production building, its queue, repeat / clear / rally controls and bulk ordering across a whole group.
import { UNITS, BUILDINGS, DEFS, BASE_ORDER, BASE_UNITS, unitId } from './sim/defs.js';
const $ = (id) => document.getElementById(id);
const GROUPS = [['hq', 'Command Center'], ['barracks', 'Barracks'], ['factory', 'War Factories'], ['dronebay', 'Drone Bays'], ['airfield', 'Airfields'], ['silo', 'Missile Silos'], ['launchpad', 'Launch Pads']];
const ab = (k) => (DEFS[k] ? DEFS[k].baseName || DEFS[k].name : k);

export class ProdPanel {
  constructor(game) { this.g = game; this.on = false; this.acc = 9; this.el = $('prodPanel'); this.sig = ''; this.pick = {}; this.qty = {}; this.tier = 1; }
  toggle(v) {
    this.on = v === undefined ? !this.on : v; this.el.classList.toggle('hidden', !this.on); const b = $('btnProd'); if (b) b.classList.toggle('on', this.on);
    this.acc = 9; this.sig = ''; if (this.on) this.render();
  }
  update(dt) { if (!this.on) return; this.acc += dt; if (this.acc < 0.4) return; this.acc = 0; this.render(); }
  producers(kind) { const L = this.g.local; return this.g.sim.ents.filter((e) => !e.dead && e.owner === L && e.kind === 'building' && e.progress >= 1 && BUILDINGS[e.def].produces === kind); }
  typesFor(kind) {
    const sim = this.g.sim, p = sim.players[this.g.local];
    return BASE_ORDER.filter((k) => BASE_UNITS[k].from === kind && !(BUILDINGS.launchpad && kind === 'launchpad' && !sim.space)).map((k) => unitId(k, this.tier)).filter((id) => UNITS[id].techLv <= p.tech);
  }
  render() {
    const g = this.g, sim = g.sim, L = g.local, p = sim.players[L];
    const rows = []; let sig = this.tier + '|';
    for (const [kind, label] of GROUPS) {
      if (kind === 'launchpad' && !sim.space) continue;
      const bs = this.producers(kind); if (!bs.length) continue;
      rows.push([kind, label, bs]);
      sig += kind + ':' + bs.map((b) => b.id + '.' + b.queue.map((q) => q.type + Math.floor((1 - q.left / UNITS[q.type].timeTicks) * 10)).join(',') + (b.rep ? 'r' : '') + (b.mis ? b.mis.length : '')).join(';') + '|';
    }
    sig += Math.floor(p.credits / 100) + (g.sel.length ? '.' + g.sel.length : '');
    if (sig === this.sig) return; this.sig = sig;
    let h = '<h3>Production <span class="px"><span class="seg tsel">' + [1, 2, 3].map((t) => '<button data-tier="' + t + '" class="' + (this.tier === t ? 'on' : '') + '">Mk ' + ['', 'I', 'II', 'III'][t] + '</button>').join('') + '</span><button class="x" id="prodX">×</button></span></h3>';
    if (!rows.length) h += '<p class="st">No production buildings yet.</p>';
    for (const [kind, label, bs] of rows) {
      const types = this.typesFor(kind); const cur = this.pick[kind] && types.includes(this.pick[kind]) ? this.pick[kind] : types[0]; this.pick[kind] = cur; const q = this.qty[kind] || 5;
      h += '<div class="pgrp"><div class="phead"><b>' + label + ' <small>×' + bs.length + '</small></b><button class="mini" data-sel="' + kind + '" title="Select every ' + label + '">Select all</button><button class="mini" data-rally="' + kind + '" title="Choose a rally point for all of them">Rally all</button><button class="mini" data-clr="' + kind + '" title="Cancel every queue (refunds)">Clear all</button></div>';
      if (types.length) h += '<div class="pbulk"><select data-pick="' + kind + '">' + types.map((id) => '<option value="' + id + '"' + (id === cur ? ' selected' : '') + '>' + UNITS[id].name + ' (⛏' + UNITS[id].cost + ')</option>').join('') + '</select>' + [1, 5, 10, 25].map((n) => '<button class="mini' + (q === n ? ' on' : '') + '" data-q="' + kind + ':' + n + '">×' + n + '</button>').join('') + '<button class="mini go" data-add="' + kind + '" title="Queue spread evenly over all ' + label + '">Queue</button></div>';
      for (const b of bs) {
        const act = b.queue[0], pct = act ? Math.round((1 - act.left / UNITS[act.type].timeTicks) * 100) : 0;
        h += '<div class="prow' + (g.sel.includes(b.id) ? ' on' : '') + '" data-b="' + b.id + '"><span class="pn">' + BUILDINGS[b.def].name.replace('War ', '') + '</span>';
        h += '<span class="pq">' + (b.queue.length ? b.queue.slice(0, 9).map((qq, i) => '<span class="qc' + (i === 0 ? ' act' : '') + '" data-dq="' + b.id + ':' + i + '" title="Cancel">' + ab(qq.type) + (i === 0 ? ' ' + pct + '%' : '') + '</span>').join('') + (b.queue.length > 9 ? '<small> +' + (b.queue.length - 9) + '</small>' : '') : '<small class="idle">idle</small>') + (b.mis ? '<small class="ok"> ' + b.mis.length + '/4 missiles stored</small>' : '') + '</span>';
        h += '<button class="mini' + (b.rep ? ' on' : '') + '" data-rep="' + b.id + '" title="Repeat: re-queue every finished item">↻</button><button class="mini" data-cq="' + b.id + '" title="Clear queue">✖</button></div>';
      }
      h += '</div>';
    }
    h += '<p class="st"><small>Tip: queue amounts are spread over the least-busy buildings automatically. Click a queued item to cancel it. ↻ keeps a building producing the same thing forever.</small></p>';
    this.el.innerHTML = h;
    const el = this.el, on = (sel, fn) => { for (const n of el.querySelectorAll(sel)) n.addEventListener('click', (e) => fn(n, e)); };
    on('#prodX', () => this.toggle(false));
    on('[data-tier]', (n) => { this.tier = +n.dataset.tier; this.sig = ''; this.render(); });
    on('[data-sel]', (n) => { const ids = this.producers(n.dataset.sel).map((b) => b.id); g.setSel(ids); });
    on('[data-rally]', (n) => { const bs = this.producers(n.dataset.rally); g.setSel(bs.map((b) => b.id)); g.controls.setMode({ t: 'rally' }); this.toggle(false); });
    on('[data-clr]', (n) => g.cmd({ t: 'clearq', ids: this.producers(n.dataset.clr).map((b) => b.id) }));
    on('[data-cq]', (n) => g.cmd({ t: 'clearq', ids: [+n.dataset.cq] }));
    on('[data-rep]', (n) => { const b = sim.byId.get(+n.dataset.rep); g.cmd({ t: 'repeat', ids: [+n.dataset.rep], v: b && b.rep ? 0 : 1 }); this.sig = ''; setTimeout(() => this.render(), 120); });
    on('[data-dq]', (n) => { const [b, i] = n.dataset.dq.split(':'); g.cmd({ t: 'dequeueat', bid: +b, idx: +i }); });
    on('[data-q]', (n) => { const [k, q] = n.dataset.q.split(':'); this.qty[k] = +q; this.sig = ''; this.render(); });
    on('[data-add]', (n) => { const k = n.dataset.add; const type = this.pick[k]; if (type) g.cmd({ t: 'train', type, n: this.qty[k] || 5 }); });
    on('.prow .pn', (n) => { const id = +n.parentNode.dataset.b, b = sim.byId.get(id); if (b) { g.setSel([id]); g.renderer.centerOn(b.x, b.z); } });
    for (const s of el.querySelectorAll('[data-pick]')) s.addEventListener('change', () => { this.pick[s.dataset.pick] = s.value; });
  }
}
