// HUD: top bar, minimap, selection panel, build/production panel, toasts.
import { UNITS, BUILDINGS, BUILD_ORDER, BASE_ORDER, BASE_UNITS, DEFS, UNIT_CAP, PLAYER_COLORS, unitId, ROMAN } from './sim/defs.js';
import { sfx } from './fx.js';

const ABBR = { rifleman: 'RIF', at: 'AT', manpads: 'MAN', engineer: 'ENG', scout: 'SCT', ifv: 'IFV', mbt: 'MBT', aa: 'FLK', sph: 'SPH', heavy: 'HVY', mlrs: 'MRL', tel: 'BMS', uav: 'UAV', heli: 'HEL', vtol: 'VTL', ewtruck: 'EWT', ewplane: 'EWA', robot: 'BOT', ewdog: 'EWD', sapper: 'CRW', repair: 'RPR', walker: 'WLK', fpv: 'FPV', wingman: 'WNG', carrier: 'DSD', empcarrier: 'EMP', powerplant: 'PWR', dronebay: 'DRN', advtech: 'LB2', ewtower: 'EWS', derrick: 'OIL', barracks: 'BAR', factory: 'FAC', airfield: 'AIR', techlab: 'LAB', turret: 'GUN', sam: 'SAM', hq: 'HQ' };
const TABS = [
  { id: 'str', label: 'Build', key: 'B', cls: 'str' },
  { id: 'inf', label: 'Infantry', key: 'I', cls: 'inf', from: ['barracks', 'hq'] },
  { id: 'veh', label: 'Vehicles', key: 'V', cls: 'veh', from: ['factory'] },
  { id: 'air', label: 'Aircraft', key: 'Y', cls: 'air', from: ['airfield'] },
  { id: 'drn', label: 'Drones', key: 'D', cls: 'drn', from: ['dronebay'] },
];
const $ = (id) => document.getElementById(id);
const abbr = (def) => { const d = DEFS[def]; return (ABBR[d.base] || d.base) + (d.tier > 1 ? ROMAN[d.tier] : ''); };
const fmtTime = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

export class HUD {
  constructor(game) {
    this.g = game; this.sim = game.sim; this.tab = 'str'; this.tier = 1; this.items = {}; this.lastSig = ''; this.acc = 1; this.mmAcc = 1;
    this.el = { credits: $('credits'), income: $('income'), energy: $('energy'), eincome: $('eincome'), eff: $('eff'), tierSel: $('tierSel'), credBox: $('statM'), enBox: $('statE'), units: $('unitcount'), clock: $('clock'), net: $('netinfo'), toasts: $('toasts'), banner: $('modeBanner'), tip: $('tip'), placeBar: $('placeBar'), selInfo: $('selInfo'), cmdBar: $('cmdBar'), tabs: $('tabs'), queue: $('queue'), items: $('items'), mm: $('minimap') };
    this.mmCtx = this.el.mm.getContext('2d');
    this.lastToast = 0; this.lastAlertToast = -99; this.lastReady = 0; this.pings = [];
    this.buildTabs(); this.buildTierSel(); this.buildItems(); this.bindStatic(); this.buildMinimapTerrain();
    this.fogCanvas = document.createElement('canvas'); this.fogCanvas.width = this.fogCanvas.height = this.sim.map.n;
    this.fogCtx = this.fogCanvas.getContext('2d'); this.fogImg = this.fogCtx.createImageData(this.sim.map.n, this.sim.map.n);
    this.renderSel(true);
  }
  get c() { return this.g.controls; }
  show(v) { $('hud').classList.toggle('hidden', !v); }

  bindStatic() {
    this.on('btnMenu', () => this.g.openPause());
    this.on('btnBox', () => { const c = this.c; c.touchBox = !c.touchBox; $('btnBox').classList.toggle('on', c.touchBox); this.toast(c.touchBox ? 'Box select ON: drag to select' : 'Box select OFF: drag pans', 'info'); });
    this.on('btnArmy', () => this.c.selectArmy());
    this.on('btnIdle', () => { if (!this.c.selectIdleEngineers()) this.g.jumpAlert(); });
    this.on('btnHome', () => this.g.jumpHome());
    this.on('btnDesel', () => { this.c.cancelMode(); this.g.setSel([]); });
    this.on('btnPlaceOk', () => this.c.confirmPlace(false));
    this.on('btnPlaceNo', () => this.c.cancelMode());
    const mm = this.el.mm;
    mm.addEventListener('contextmenu', (e) => e.preventDefault());
    mm.addEventListener('pointerdown', (e) => { this.g.unlockAudio(); mm.setPointerCapture(e.pointerId); this.mmDown = true; this.mmPointer(e, true); });
    mm.addEventListener('pointermove', (e) => { if (this.mmDown && e.button !== 2) this.mmPointer(e, false); });
    mm.addEventListener('pointerup', (e) => { this.mmDown = false; try { mm.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
  }
  on(id, fn) { const b = $(id); if (b) b.addEventListener('click', fn); }
  mmPointer(e, first) {
    const rc = this.el.mm.getBoundingClientRect(), size = this.sim.map.size;
    const x = (e.clientX - rc.left) / rc.width * size, z = (e.clientY - rc.top) / rc.height * size;
    const c = this.c;
    if (first && (e.button === 2 || (c.mode.t !== 'normal' && c.mode.t !== 'place'))) {
      if (c.mode.t === 'attackmove') { c.orderAttackMove(x, z); c.setMode({ t: 'normal' }); }
      else if (c.mode.t === 'forcefire') { c.orderForceFire(x, z); c.setMode({ t: 'normal' }); }
      else if (c.mode.t === 'rally') { c.orderRally(x, z); c.setMode({ t: 'normal' }); }
      else if (c.selUnits().length) { c.orderMove(x, z); if (c.mode.t === 'move') c.setMode({ t: 'normal' }); }
      else c.orderRally(x, z);
      this.mmDown = false; return;
    }
    this.g.renderer.centerOn(x, z);
  }

  // ---------- toasts ----------
  toast(text, kind = '') {
    const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = text;
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 4) this.el.toasts.removeChild(this.el.toasts.firstChild);
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 4600);
  }
  handleEvents(evs) {
    const L = this.g.local, now = performance.now() / 1000, sim = this.sim;
    for (const e of evs) {
      if (e.e === 'alert' && e.owner === L) {
        this.g.lastAlert = { x: e.x, z: e.z };
        this.pings.push({ x: e.x, z: e.z, t: 4 });
        if (now - this.lastAlertToast > 8) { this.lastAlertToast = now; this.toast(e.kind === 'building' ? '⚠ Base under attack!' : '⚠ Units under attack!', 'warn'); sfx('ui', 1.2); }
      } else if (e.e === 'built' && e.owner === L) { this.toast(DEFS[e.def].name + ' complete', 'info'); sfx('ui', 0.8); this.refreshItems(); }
      else if (e.e === 'trained' && e.owner === L) { if (now - this.lastReady > 1.2) { this.lastReady = now; this.toast(DEFS[e.def].name + ' ready', 'info'); } }
      else if (e.e === 'elim') { const p = sim.players[e.p]; this.toast(p.name + ' has been eliminated', e.p === L ? 'warn' : ''); }
    }
  }

  // ---------- tabs & items ----------
  buildTabs() {
    this.el.tabs.innerHTML = '';
    for (const t of TABS) {
      const b = document.createElement('button'); b.textContent = t.label; b.dataset.id = t.id; b.title = 'Hotkey: ' + t.key;
      b.addEventListener('click', () => this.setTab(t.id));
      this.el.tabs.appendChild(b);
    }
  }
  setTab(id) { if (this.tab === id && this.built) return; this.tab = id; this.buildItems(); sfx('ui', 0.3); }
  cycleTab(d) { const i = TABS.findIndex((t) => t.id === this.tab); this.setTab(TABS[(i + d + TABS.length) % TABS.length].id); }
  buildTierSel() {
    const box = this.el.tierSel; if (!box) return; box.innerHTML = '';
    for (let t = 1; t <= 3; t++) {
      const b = document.createElement('button'); b.textContent = 'Mk ' + ROMAN[t]; b.dataset.t = t; b.title = 'Unit tier (T cycles). Mk II needs a Tech Lab, Mk III an Advanced Tech Lab.';
      b.addEventListener('click', () => this.setTier(t)); box.appendChild(b);
    }
  }
  setTier(t) { this.tier = t; this.buildItems(); sfx('ui', 0.3); }
  typesForTab() {
    if (this.tab === 'str') return BUILD_ORDER;
    const t = TABS.find((x) => x.id === this.tab);
    return BASE_ORDER.filter((k) => t.from.includes(BASE_UNITS[k].from)).map((k) => unitId(k, this.tier));
  }
  buildItems() {
    const box = this.el.items; box.innerHTML = ''; this.items = {}; this.built = true;
    for (const b of this.el.tabs.children) b.classList.toggle('on', b.dataset.id === this.tab);
    const cls = TABS.find((x) => x.id === this.tab).cls;
    if (this.el.tierSel) { this.el.tierSel.classList.toggle('hidden', this.tab === 'str'); for (const b of this.el.tierSel.children) b.classList.toggle('on', +b.dataset.t === this.tier); }
    for (const type of this.typesForTab()) {
      const d = DEFS[type];
      const it = document.createElement('div'); it.className = 'item cls-' + cls;
      it.innerHTML = '<span class="ab">' + (d.kind === 'unit' ? abbr(type) : (ABBR[type] || type)) + '</span><span class="nm">' + (d.baseName || d.name) + (d.batch > 1 ? ' ×' + d.batch : '') + '</span><span class="co">' + d.cost + '<em>' + (d.energy ? ' · ' + d.energy : '') + '</em></span><span class="bd hidden"></span>';
      it.addEventListener('click', (e) => this.itemClick(type, e));
      it.addEventListener('contextmenu', (e) => { e.preventDefault(); if (UNITS[type]) this.g.cmd({ t: 'dequeue', type }); });
      const tip = () => this.showItemTip(type);
      it.addEventListener('pointerenter', tip); it.addEventListener('pointerdown', tip);
      it.addEventListener('pointerleave', () => this.hideTip());
      box.appendChild(it); this.items[type] = it;
    }
    this.refreshItems();
  }
  lockReason(type) {
    const L = this.g.local, sim = this.sim, d = DEFS[type];
    if (d.kind === 'building') { for (const r of d.requires) if (!sim.ownerHas(L, r)) return 'Requires ' + BUILDINGS[r].name; return ''; }
    if (!sim.ownerHas(L, d.from)) return 'Requires ' + BUILDINGS[d.from].name;
    const tech = sim.players[L].tech;
    if (tech < d.techLv) return 'Requires ' + (d.techLv >= 2 ? BUILDINGS.advtech.name : BUILDINGS.techlab.name);
    return '';
  }
  itemClick(type, e) {
    this.g.unlockAudio();
    const why = this.lockReason(type), d = DEFS[type], p = this.sim.players[this.g.local];
    if (why) { this.toast(why, 'warn'); sfx('ui', 0.5); return; }
    if (d.kind === 'building') { this.c.startPlace(type); return; }
    this.g.cmd({ t: 'train', type, n: e.shiftKey ? 5 : 1 }); sfx('ui', 0.6);
  }
  showItemTip(type) {
    const d = DEFS[type], why = this.lockReason(type);
    const t = this.el.tip; t.classList.remove('hidden');
    t.innerHTML = '<b>' + d.name + '</b> · ⛏' + d.cost + (d.energy ? ' ⚡' + d.energy : '') + ' · ' + d.time + 's<br>' + d.desc + this.statLine(d) + (why ? '<br><span style="color:#ef5350">' + why + '</span>' : '') + (d.kind === 'unit' ? '<br><small style="color:#8a99a8">Shift+click: ×5 · right-click: cancel</small>' : '');
    clearTimeout(this.tipT); this.tipT = setTimeout(() => this.hideTip(), 4000);
  }
  statLine(d) {
    if (d.kind !== 'unit') return d.upkeep ? '<br><small style="color:#8a99a8">Upkeep ⚡' + d.upkeep + '/s</small>' : (d.incomeE ? '<br><small style="color:#8a99a8">+⚡' + d.incomeE + '/s</small>' : (d.income ? '<br><small style="color:#8a99a8">+⛏' + d.income + '/s</small>' : ''));
    let s = '<br><small style="color:#8a99a8">HP ' + d.hp + ' · speed ' + d.speed;
    const w = d.weapons[0]; if (w) s += ' · dmg ' + w.dmg + ' · range ' + w.range;
    if (d.ew) s += ' · jam r' + d.ew.radius; if (d.upkeep) s += ' · ⚡' + d.upkeep + '/s';
    if (d.drone) s += ' · DRONE';
    return s + '</small>';
  }
  hideTip() { if (this.mode !== 'place') this.el.tip.classList.add('hidden'); }
  refreshItems() {
    const L = this.g.local, sim = this.sim, p = sim.players[L];
    const queued = {};
    for (const b of sim.ents) if (!b.dead && b.owner === L && b.kind === 'building') for (const q of b.queue) queued[q.type] = (queued[q.type] || 0) + 1;
    if (this.el.tierSel) for (const b of this.el.tierSel.children) b.classList.toggle('locked', p.tech < (+b.dataset.t - 1));
    for (const type in this.items) {
      const it = this.items[type], d = DEFS[type];
      it.classList.toggle('locked', !!this.lockReason(type));
      it.classList.toggle('poor', p.credits < d.cost * 0.1 || p.energy < d.energy * 0.05);
      const bd = it.querySelector('.bd'), q = queued[type] || 0;
      bd.textContent = q; bd.classList.toggle('hidden', !q);
    }
    // tab lock state
    for (const b of this.el.tabs.children) {
      const t = TABS.find((x) => x.id === b.dataset.id);
      let locked = false;
      if (t.from) locked = !t.from.some((f) => sim.ownerHas(L, f));
      b.classList.toggle('locked', locked);
    }
    // production queue strip
    const q = this.el.queue; const chips = [];
    for (const b of sim.ents) {
      if (b.dead || b.owner !== L || b.kind !== 'building' || !b.queue.length) continue;
      const it = b.queue[0], d = UNITS[it.type];
      chips.push({ type: it.type, pct: 1 - it.left / d.timeTicks, more: b.queue.length - 1, stall: p.eff < 0.5 });
    }
    chips.sort((a, b) => b.pct - a.pct);
    const sig = chips.slice(0, 7).map((c) => c.type + Math.floor(c.pct * 20) + c.more).join('|');
    if (sig !== this.qSig) {
      this.qSig = sig; q.innerHTML = '';
      for (const c of chips.slice(0, 7)) {
        const s = document.createElement('span'); s.className = 'qchip'; s.title = 'Tap to cancel one';
        s.innerHTML = abbr(c.type) + (c.more ? ' +' + c.more : '') + '<i style="width:' + Math.round(c.pct * 100) + '%"></i>';
        s.addEventListener('click', () => this.g.cmd({ t: 'dequeue', type: c.type }));
        q.appendChild(s);
      }
    }
  }

  // ---------- selection panel ----------
  groupByDef(ents) { const m = new Map(); for (const e of ents) m.set(e.def, (m.get(e.def) || 0) + 1); return m; }
  renderSel(force) {
    const ents = this.c ? this.c.selEnts() : [];
    const sig = ents.map((e) => e.id).join(',') + '|' + this.c?.mode.t;
    if (!force && sig === this.selSig) { this.updateSelDynamic(ents); return; }
    this.selSig = sig;
    const box = this.el.selInfo; box.innerHTML = '';
    if (!ents.length) {
      box.innerHTML = '<h3>No selection</h3><p>' + (this.g.touch ? 'Tap a unit or building to select it. Drag to pan, pinch to zoom. Long-press then drag (or BOX) to box-select.' : 'Click a unit or drag a box to select. Right-click to move or attack. Arrow keys pan, Q/E rotate.') + '</p>';
      this.buildCmdBar([]); this.hpFill = null; return;
    }
    const own = ents[0].owner === this.g.local;
    if (ents.length === 1) {
      const e = ents[0], d = DEFS[e.def];
      box.innerHTML = '<h3>' + d.name + (own ? '' : ' <small style="color:#ef5350">(' + this.sim.players[e.owner].name + ')</small>') + '</h3><div class="bar"><i id="hpFill"></i></div><p id="selLine"></p><p>' + d.desc + '</p>';
    } else {
      const g = this.groupByDef(ents);
      box.innerHTML = '<h3>' + ents.length + ' selected</h3><div class="bar"><i id="hpFill"></i></div><div class="chips" id="selChips"></div>';
      const chips = box.querySelector('#selChips');
      for (const [def, n] of g) {
        const c = document.createElement('button'); c.className = 'chip'; c.textContent = (DEFS[def].kind === 'unit' ? abbr(def) : (ABBR[def] || def)) + ' ×' + n; c.title = 'Select only ' + DEFS[def].name;
        c.addEventListener('click', () => this.g.setSel(ents.filter((e) => e.def === def).map((e) => e.id)));
        chips.appendChild(c);
      }
    }
    this.hpFill = box.querySelector('#hpFill'); this.selLine = box.querySelector('#selLine');
    this.buildCmdBar(own ? ents : []);
    this.updateSelDynamic(ents);
  }
  updateSelDynamic(ents) {
    if (!ents.length) return;
    let hp = 0, mx = 0; for (const e of ents) { hp += e.hp; mx += e.maxhp; }
    if (this.hpFill) { this.hpFill.style.width = Math.round(hp / mx * 100) + '%'; this.hpFill.style.background = hp / mx > 0.6 ? '' : hp / mx > 0.3 ? '#e8c04a' : '#e8483a'; }
    if (this.selLine && ents.length === 1) {
      const e = ents[0], d = DEFS[e.def];
      let s = Math.ceil(e.hp) + ' / ' + e.maxhp + ' HP';
      if (e.kind === 'building') { if (e.progress < 1) s += ' · constructing ' + Math.floor(e.progress * 100) + '%'; else if (e.queue.length) s += ' · training ' + UNITS[e.queue[0].type].name; }
      else if (e.order) s += ' · ' + ({ idle: 'idle', move: 'moving', attackmove: 'attack-moving', attack: 'attacking', attackground: 'firing at ground' }[e.order.t] || '');
      this.selLine.textContent = s;
    }
  }
  buildCmdBar(ents) {
    const bar = this.el.cmdBar; bar.innerHTML = ''; this.cmdBtns = {};
    const units = ents.filter((e) => e.kind === 'unit'), blds = ents.filter((e) => e.kind === 'building');
    const add = (label, key, mode, fn, cls = '') => {
      const b = document.createElement('button'); b.className = 'btn ' + cls; b.innerHTML = label + (key ? '<kbd>' + key + '</kbd>' : '');
      b.addEventListener('click', () => { this.g.unlockAudio(); fn(); }); bar.appendChild(b); if (mode) this.cmdBtns[mode] = b; return b;
    };
    const c = this.c;
    if (units.length) {
      add('Move', 'M', 'move', () => c.setMode(c.mode.t === 'move' ? { t: 'normal' } : { t: 'move' }));
      if (units.some((u) => UNITS[u.def].weapons.length)) add('Attack-Move', 'A', 'attackmove', () => c.setMode(c.mode.t === 'attackmove' ? { t: 'normal' } : { t: 'attackmove' }));
      add('Stop', 'S', null, () => c.stop());
      if (units.some((u) => UNITS[u.def].weapons.some((w) => w.ground && w.kind !== 'hit'))) add('Fire at ground', 'F', 'forcefire', () => c.setMode(c.mode.t === 'forcefire' ? { t: 'normal' } : { t: 'forcefire' }));
    } else if (blds.length) {
      if (blds.some((b) => BUILDINGS[b.def].produces)) add('Set rally point', 'F', 'rally', () => c.setMode(c.mode.t === 'rally' ? { t: 'normal' } : { t: 'rally' }));
      if (blds.some((b) => b.def !== 'hq')) add('Sell', '', null, () => { if (confirm('Sell selected structure(s) for a 50% refund?')) c.sell(); }, 'danger');
    }
    this.modeChanged();
  }
  modeChanged() {
    const m = this.c ? this.c.mode : { t: 'normal' }; this.mode = m.t;
    for (const k in this.cmdBtns || {}) this.cmdBtns[k].classList.toggle('on', m.t === k);
    const txt = { attackmove: 'Attack-move: pick a destination or target (Esc cancels)', move: 'Move: pick a destination (Esc cancels)', forcefire: 'Fire at ground: pick a point (Esc cancels)', rally: 'Rally point: pick a location (Esc cancels)', place: '' }[m.t];
    this.el.banner.textContent = txt || ''; this.el.banner.classList.toggle('hidden', !txt);
    const placing = m.t === 'place';
    this.el.placeBar.classList.toggle('hidden', !(placing && this.g.touch));
    if (!placing) this.hideTipSoon();
    this.selSig = null;
  }
  hideTipSoon() { this.el.tip.classList.add('hidden'); }
  placeInfo(info) {
    const t = this.el.tip; t.classList.remove('hidden');
    const d = BUILDINGS[info.type];
    t.innerHTML = '<b>' + d.name + '</b> · ⛏' + d.cost + (d.energy ? ' ⚡' + d.energy : '') + this.statLine(d) + '<br>' + (info.ok ? (this.g.touch ? 'Tap to move, ✔ to build.' : 'Click to build (Shift: keep placing, right-click cancels).') : '<span style="color:#ef5350">' + (info.reason || 'Cannot build here') + '</span>');
  }
  showPlaceBar(v) { this.el.placeBar.classList.toggle('hidden', !(v && this.g.touch)); }

  // ---------- minimap ----------
  buildMinimapTerrain() {
    const map = this.sim.map, n = map.n, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(n, n), w = map.vw;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const h = (map.h[j * w + i] + map.h[j * w + i + 1] + map.h[(j + 1) * w + i] + map.h[(j + 1) * w + i + 1]) / 4;
      let r, g, b;
      if (h < 0) { const t = Math.min(1, -h / 8); r = 30 - t * 14; g = 90 - t * 30; b = 140 - t * 40; }
      else if (h < 1.5) { r = 190; g = 175; b = 125; }
      else if (h < 9) { r = 90 + h * 2; g = 125 - h * 1.2; b = 62; }
      else if (h < 20) { r = 125 + (h - 9) * 3; g = 120 + (h - 9) * 1.5; b = 85 + (h - 9) * 2; }
      else { r = 150 + Math.min(70, (h - 20) * 4); g = r; b = r; }
      const k = (j * n + i) * 4; img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0); this.terrainCanvas = cv;
  }
  drawMinimap(dt) {
    const ctx = this.mmCtx, W = this.el.mm.width, sim = this.sim, map = sim.map, n = map.n, team = this.g.team, k = W / map.size;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrainCanvas, 0, 0, W, W);
    // fog
    const vis = sim.vis[team], ex = sim.expl[team], d = this.fogImg.data;
    for (let c = 0; c < n * n; c++) { const o = c * 4; d[o] = 0; d[o + 1] = 0; d[o + 2] = 0; d[o + 3] = vis[c] ? 0 : ex[c] ? 110 : 235; }
    this.fogCtx.putImageData(this.fogImg, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(this.fogCanvas, 0, 0, W, W);
    // oil
    for (let i = 0; i < map.oil.length; i++) { const o = map.oil[i], c = map.cellOf(o.x, o.z); if (!ex[c]) continue; ctx.fillStyle = o.building ? '#222' : '#f0b429'; ctx.fillRect(o.x * k - 3, o.z * k - 3, 6, 6); }
    // entities
    for (const e of sim.ents) {
      if (e.dead) continue;
      const own = e.team === team;
      if (!own) { const c = map.cellOf(e.x, e.z); if (c < 0 || !vis[c]) continue; }
      const col = '#' + PLAYER_COLORS[sim.players[e.owner].color].toString(16).padStart(6, '0');
      ctx.fillStyle = col;
      if (e.kind === 'building') { const s = Math.max(5, e.size * 2.6); ctx.fillRect(e.x * k - s / 2, e.z * k - s / 2, s, s); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(e.x * k - s / 2, e.z * k - s / 2, s, s); }
      else { const s = e.air ? 4.5 : 3.5; ctx.fillRect(e.x * k - s / 2, e.z * k - s / 2, s, s); }
    }
    // alert pings
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i]; p.t -= dt; if (p.t <= 0) { this.pings.splice(i, 1); continue; }
      ctx.strokeStyle = 'rgba(255,70,60,' + Math.min(1, p.t) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x * k, p.z * k, 6 + (4 - p.t) * 8, 0, 6.283); ctx.stroke();
    }
    // camera quad
    const r = this.g.renderer, pts = [r.groundAt(0, 0), r.groundAt(r.W, 0), r.groundAt(r.W, r.H), r.groundAt(0, r.H)];
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.beginPath();
    if (pts.every(Boolean)) { pts.forEach((p, i) => { if (i) ctx.lineTo(p.x * k, p.z * k); else ctx.moveTo(p.x * k, p.z * k); }); ctx.closePath(); }
    else { const s = r.cam.dist * 0.9 * k; ctx.rect(r.cam.x * k - s, r.cam.z * k - s * 0.6, s * 2, s * 1.2); }
    ctx.stroke();
  }

  // ---------- per-frame ----------
  update(dt) {
    const sim = this.sim, p = sim.players[this.g.local];
    this.acc += dt; this.mmAcc += dt;
    if (this.mmAcc > 0.1) { this.drawMinimap(this.mmAcc); this.mmAcc = 0; }
    if (this.acc < 0.2) return;
    this.acc = 0;
    const dm = p.pM - p.demM * p.eff, de = p.pE - p.pU - p.demE * p.eff;
    this.el.credits.textContent = Math.floor(p.credits);
    this.el.income.textContent = '+' + p.pM.toFixed(0) + ' / −' + (p.demM * p.eff).toFixed(0);
    this.el.energy.textContent = Math.floor(p.energy);
    this.el.eincome.textContent = '+' + p.pE.toFixed(0) + ' / −' + (p.pU + p.demE * p.eff).toFixed(0);
    this.el.credBox.classList.toggle('low', p.credits < 20 && p.demM > p.pM); this.el.enBox.classList.toggle('low', p.energy < 20 && p.demE + p.pU > p.pE);
    this.el.eff.textContent = p.eff < 0.97 ? 'Build speed ' + Math.round(p.eff * 100) + '%' : ''; this.el.eff.style.color = p.eff < 0.5 ? '#ef5350' : '#e8c04a';
    this.el.credBox.querySelector('i').style.width = Math.round(p.credits / Math.max(1, p.capM) * 100) + '%'; this.el.enBox.querySelector('i').style.width = Math.round(p.energy / Math.max(1, p.capE) * 100) + '%';
    this.el.units.textContent = p.units + '/' + UNIT_CAP;
    this.el.clock.textContent = fmtTime(sim.tick / 20);
    const g = this.g;
    this.el.net.textContent = g.desync ? '⚠ DESYNC' : g.waiting ? '⏳ waiting for host…' : g.ls.role === 'local' ? '' : (g.ls.role === 'host' ? 'Host' : 'Client') + ' · lag ' + Math.max(0, g.ls.queue.length) ;
    this.el.net.style.color = g.desync ? '#ef5350' : '';
    this.refreshItems();
    this.renderSel(false);
  }
}
