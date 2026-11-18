// HUD: top bar, minimap, selection panel, build/production panel, toasts.
import { UNITS, BUILDINGS, BUILD_ORDER, BUILD_CATS, BASE_ORDER, BASE_UNITS, DEFS, UNIT_CAP, PLAYER_COLORS, unitId, ROMAN, AF, AF_MODULES, AF_KEYS, TICK_RATE, BTIER } from './sim/defs.js';
import { sfx } from './fx.js';

const ABBR = { rifleman: 'RIF', at: 'AT', manpads: 'MAN', engineer: 'ENG', scout: 'SCT', ifv: 'IFV', mbt: 'MBT', aa: 'FLK', sph: 'SPH', heavy: 'HVY', mlrs: 'MRL', tel: 'BMS', uav: 'UAV', heli: 'HEL', vtol: 'VTL', ewtruck: 'EWT', ewplane: 'EWA', robot: 'BOT', ewdog: 'EWD', sapper: 'CRW', repair: 'RPR', walker: 'WLK', fpv: 'FPV', fighter: 'FTR', bomber: 'BMB', strategic: 'SBM', airlifter: 'AIR', awacs: 'AWX', spydrone: 'SPY', radar: 'RAD', wingman: 'WNG', carrier: 'DSD', empcarrier: 'EMP', powerplant: 'PWR', dronebay: 'DRN', advtech: 'LB2', ewtower: 'EWS', derrick: 'OIL', barracks: 'BAR', factory: 'FAC', airfield: 'AIR', techlab: 'LAB', turret: 'GUN', sam: 'SAM', hq: 'HQ', supplytruck: 'SUP', tanker: 'TKR', decoy: 'DCY', supplydepot: 'DEP', solar: 'SOL', fusion: 'FUS', synth: 'SYN', reserve: 'RSV', wall: 'WAL', bunker: 'BNK', lasertower: 'LSR', railgun: 'RLG', heavyart: 'ART', abm: 'ABM', silo: 'SIL', launchpad: 'PAD', icbm: 'ICBM', satrecon: 'REC', satsurvey: 'SUR', satstrike: 'KIN', satkill: 'HKS', orbyard: 'YRD', orbfighter: 'OFT', orbcruiser: 'OCR', orbbattleship: 'OBS' };
const TABS = [
  { id: 'str', label: 'Build', key: 'B', cls: 'str' },
  { id: 'inf', label: 'Infantry', key: 'I', cls: 'inf', from: ['barracks', 'hq'] },
  { id: 'veh', label: 'Vehicles', key: 'V', cls: 'veh', from: ['factory'] },
  { id: 'air', label: 'Aircraft', key: 'Y', cls: 'air', from: ['airfield'] },
  { id: 'drn', label: 'Drones', key: 'D', cls: 'drn', from: ['dronebay'] },
  { id: 'stg', label: 'Strategic', key: 'R', cls: 'air', from: ['silo', 'launchpad'] },
];
const $ = (id) => document.getElementById(id);
const abbr = (def) => { const d = DEFS[def]; return (ABBR[d.base] || d.base) + (d.tier > 1 ? ROMAN[d.tier] : ''); };
const PHASE = { wait: 'Waiting for the runway', taxiOut: 'Taxiing to the runway', select: 'Awaiting loadout', equip: 'Ground crew arming', takeoff: 'Taking off', rtb: 'Returning to base', land: 'Landing', taxiIn: 'Taxiing to its stand', rearm: 'Being re-armed', stand: 'Parked and ready', fly: '' };
const wName = (w) => w.kind === 'missile' ? (w.type === 'aa' ? 'AA missile' : w.type === 'ap' ? 'AT missile' : 'Cruise missile') : w.kind === 'shell' ? (w.type === 'blast' ? 'Heavy bomb' : w.reload < 0.5 && w.range >= 20 ? 'Rockets' : 'Bomb') : 'Cannon';
const wLine = (w) => (w.ammo > 0 ? w.ammo + '× ' : '∞ ') + wName(w) + ' · ' + w.dmg + ' dmg · ' + w.range + ' rng';
const modLine = (m) => [m.vision ? '+' + Math.round((m.vision - 1) * 100) + '% vision' : '', m.speed ? (m.speed > 1 ? '+' : '') + Math.round((m.speed - 1) * 100) + '% speed' : '', m.hp ? '+' + Math.round((m.hp - 1) * 100) + '% HP' : '', m.ewm ? (m.ewm > 1 ? '+' : '') + Math.round((m.ewm - 1) * 100) + '% jam radius' : '', m.upk ? '+' + Math.round((m.upk - 1) * 100) + '% upkeep' : ''].filter(Boolean).join(' · ');
const fmtTime = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

export class HUD {
  constructor(game) {
    this.g = game; this.sim = game.sim; this.tab = 'str'; this.cat = 'all'; this.qty = 1; this.tier = 1; this.items = {}; this.lastSig = ''; this.acc = 1; this.mmAcc = 1;
    this.el = { credits: $('credits'), income: $('income'), energy: $('energy'), eincome: $('eincome'), eff: $('eff'), tierSel: $('tierSel'), credBox: $('statM'), enBox: $('statE'), units: $('unitcount'), clock: $('clock'), net: $('netinfo'), toasts: $('toasts'), banner: $('modeBanner'), tip: $('tip'), placeBar: $('placeBar'), selInfo: $('selInfo'), cmdBar: $('cmdBar'), tabs: $('tabs'), queue: $('queue'), items: $('items'), mm: $('minimap') };
    this.mmCtx = this.el.mm.getContext('2d');
    this.loTarget = 0; this.loHide = new Set(); this.toldSel = new Set(); this.loSig = ''; this.afSig = ''; this.lastToast = 0; this.lastAlertToast = -99; this.lastReady = 0; this.pings = [];
    this.loEl = $('loadoutPanel'); this.afEl = $('afPanel');
    this.el.catSel = $('catSel'); this.el.qtySel = $('qtySel'); this.buildTabs(); this.buildTierSel(); this.buildCatSel(); this.buildQtySel(); this.buildItems(); this.bindStatic(); this.buildMinimapTerrain();
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
    this.on('btnSel', () => { const m = $('selMenu'); m.classList.toggle('hidden'); });
    for (const b of document.querySelectorAll('#selMenu button')) b.addEventListener('click', () => { this.c.selectPreset(b.dataset.k); $('selMenu').classList.add('hidden'); });
    this.on('btnIdle', () => { if (!this.c.selectIdleEngineers()) this.g.jumpAlert(); });
    this.on('btnSensor', () => this.g.sensor.toggle());
    this.on('btnLogi', () => this.g.logi.toggle());
    this.on('btnProd', () => this.g.prod.toggle());
    this.on('btnOrbit', () => this.g.orbital.toggle());
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
      else if (e.e === 'afmod' && e.owner === L) { this.toast(AF_MODULES[e.key].levels[e.lv - 1].name + ' complete', 'info'); sfx('ui', 0.8); this.afSig = ''; this.refreshItems(); }
      else if (e.e === 'bupg' && e.owner === L) { this.toast(DEFS[e.def || 'derrick'] ? 'Upgrade complete: Mk ' + BTIER.roman[e.tier] : 'Upgrade complete', 'info'); sfx('ui', 0.7); }
      else if (e.e === 'cargomsg' && e.owner === L) { this.toast(e.msg, 'warn'); sfx('ui', 0.5); }
      else if (e.e === 'airdrop' && e.owner === L) this.toast('Airdrop: ' + e.n + ' unit' + (e.n > 1 ? 's' : '') + ' deployed', 'info');
      else if (e.e === 'unload' && e.owner === L) this.toast('Cargo unloaded (' + e.n + ' units)', 'info');
      else if (e.e === 'lowfuel' && e.owner === L) { this.toast('⛽ Aircraft low on fuel with no airfield or tanker in reach', 'warn'); this.g.lastAlert = { x: e.x, z: e.z }; }
      else if (e.e === 'bingofuel' && e.owner === L) { if (now - (this.lastBingo || 0) > 6) { this.lastBingo = now; this.toast('Aircraft low on fuel: returning to base', 'info'); } }
      else if (e.e === 'flameout' && e.owner === L) { this.toast('Aircraft lost: out of fuel', 'warn'); sfx('ui', 0.6); }
      else if (e.e === 'capture') { const own = e.team === this.g.team; this.toast(own ? 'Control point captured' : 'Control point lost to ' + (sim.players[e.owner] ? sim.players[e.owner].name : 'the enemy'), own ? 'info' : 'warn'); sfx('ui', 0.8); }
      else if (e.e === 'promote' && e.owner === L) { if (now - (this.lastPromo || 0) > 3) { this.lastPromo = now; this.toast(DEFS[sim.byId.get(e.id) ? sim.byId.get(e.id).def : 'mbt'].name + ' promoted to ' + ['', 'Veteran', 'Elite', 'Legend'][e.vet], 'info'); } }
      else if (e.e === 'salvage' && e.owner === L) { if (now - (this.lastSalv || 0) > 3) { this.lastSalv = now; this.toast('Salvaged a wreck: +⛏' + e.val, 'info'); } }
      else if (e.e === 'weather') { this.toast(['Skies clear', 'Overcast: aircraft vision reduced', 'Fog rolling in: vision reduced', 'Rain: vision reduced', 'Storm: ground and air vision badly reduced'][e.kind], e.kind >= 2 ? 'warn' : 'info'); }
      else if (e.e === 'afdeny' && e.owner === L) { this.toast('Not enough resources for that loadout', 'warn'); sfx('ui', 0.5); }
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
    const space = this.sim.space;
    if (this.tab === 'str') {
      let list = BUILD_ORDER.filter((k) => !(BUILDINGS[k].space && !space));
      if (this.cat !== 'all') { const c = BUILD_CATS.find((x) => x[0] === this.cat); if (c) list = list.filter((k) => c[2].includes(k)); }
      return list;
    }
    const t = TABS.find((x) => x.id === this.tab);
    return BASE_ORDER.filter((k) => t.from.includes(BASE_UNITS[k].from) && !(BASE_UNITS[k].from === 'launchpad' && !space)).map((k) => unitId(k, this.tier));
  }
  buildCatSel() {
    const box = this.el.catSel; if (!box) return; box.innerHTML = '';
    for (const [id, label] of [['all', 'All']].concat(BUILD_CATS.map((c) => [c[0], c[1]]))) {
      const b = document.createElement('button'); b.textContent = label; b.dataset.c = id; b.addEventListener('click', () => { this.cat = id; this.buildItems(); sfx('ui', 0.3); }); box.appendChild(b);
    }
  }
  buildQtySel() {
    const box = this.el.qtySel; if (!box) return; box.innerHTML = '';
    for (const n of [1, 5, 10, 25]) {
      const b = document.createElement('button'); b.textContent = '×' + n; b.dataset.q = n; b.title = 'Units queued per click (Shift: ×5 more)'; b.addEventListener('click', () => { this.qty = n; this.buildItems(); sfx('ui', 0.3); }); box.appendChild(b);
    }
  }
  buildItems() {
    const box = this.el.items; box.innerHTML = ''; this.items = {}; this.built = true;
    for (const b of this.el.tabs.children) b.classList.toggle('on', b.dataset.id === this.tab);
    const cls = TABS.find((x) => x.id === this.tab).cls;
    if (this.el.tierSel) { this.el.tierSel.classList.toggle('hidden', this.tab === 'str'); for (const b of this.el.tierSel.children) b.classList.toggle('on', +b.dataset.t === this.tier); }
    if (this.el.qtySel) { this.el.qtySel.classList.toggle('hidden', this.tab === 'str'); for (const b of this.el.qtySel.children) b.classList.toggle('on', +b.dataset.q === this.qty); }
    if (this.el.catSel) { this.el.catSel.classList.toggle('hidden', this.tab !== 'str'); for (const b of this.el.catSel.children) b.classList.toggle('on', b.dataset.c === this.cat); }
    for (const type of this.typesForTab()) {
      const d = DEFS[type];
      const it = document.createElement('div'); it.className = 'item cls-' + cls;
      it.innerHTML = '<span class="ab">' + (d.kind === 'unit' ? abbr(type) : (ABBR[type] || type)) + '</span><span class="nm">' + (d.baseName || d.name) + (d.batch > 1 ? ' ×' + d.batch : '') + '</span><span class="co">' + d.cost + '<em>' + (d.energy ? ' · ' + d.energy : '') + '</em></span><span class="bd hidden"></span>';
      it.addEventListener('click', (e) => this.itemClick(type, e));
      it.addEventListener('contextmenu', (e) => { e.preventDefault(); if (UNITS[type]) for (let i = 0; i < (e.shiftKey ? 5 : 1); i++) this.g.cmd({ t: 'dequeue', type }); });
      const tip = () => this.showItemTip(type);
      it.addEventListener('pointerenter', tip); it.addEventListener('pointerdown', tip);
      it.addEventListener('pointerleave', () => this.hideTip());
      box.appendChild(it); this.items[type] = it;
    }
    this.refreshItems();
  }
  lockReason(type) {
    const L = this.g.local, sim = this.sim, d = DEFS[type];
    if (d.kind === 'building' && d.space && !sim.space) return 'The space layer is disabled in this game';
    if (d.kind === 'building') { for (const r of d.requires) if (!sim.ownerHas(L, r)) return 'Requires ' + BUILDINGS[r].name; return ''; }
    if (!sim.ownerHas(L, d.from)) return 'Requires ' + BUILDINGS[d.from].name;
    const tech = sim.players[L].tech;
    if (tech < d.techLv) return 'Requires ' + (d.techLv >= 2 ? BUILDINGS.advtech.name : BUILDINGS.techlab.name);
    if (d.from === 'airfield') return sim.trainBlock(L, type);
    return '';
  }
  itemClick(type, e) {
    this.g.unlockAudio();
    const why = this.lockReason(type), d = DEFS[type], p = this.sim.players[this.g.local];
    if (why) { this.toast(why, 'warn'); sfx('ui', 0.5); return; }
    if (d.kind === 'building') { this.c.startPlace(type); return; }
    this.g.cmd({ t: 'train', type, n: Math.min(60, this.qty * (e.shiftKey ? 5 : 1)) }); sfx('ui', 0.6);
  }
  showItemTip(type) {
    const d = DEFS[type], why = this.lockReason(type);
    const t = this.el.tip; t.classList.remove('hidden');
    t.innerHTML = '<b>' + d.name + '</b> · ⛏' + d.cost + (d.energy ? ' ⚡' + d.energy : '') + ' · ' + d.time + 's<br>' + d.desc + this.statLine(d) + (why ? '<br><span style="color:#ef5350">' + why + '</span>' : '') + (d.kind === 'unit' ? '<br><small style="color:#8a99a8">Shift+click: ×5 · right-click: cancel · quantity buttons set the batch size</small>' : '');
    clearTimeout(this.tipT); this.tipT = setTimeout(() => this.hideTip(), 4000);
  }
  statLine(d) {
    if (d.kind !== 'unit') return d.upkeep ? '<br><small style="color:#8a99a8">Upkeep ⚡' + d.upkeep + '/s</small>' : (d.incomeE ? '<br><small style="color:#8a99a8">+⚡' + d.incomeE + '/s</small>' : (d.income ? '<br><small style="color:#8a99a8">+⛏' + d.income + '/s</small>' : ''));
    let s = '<br><small style="color:#8a99a8">HP ' + d.hp + ' · speed ' + d.speed;
    const w = d.weapons[0]; if (w) s += ' · dmg ' + w.dmg + ' · range ' + w.range;
    if (d.ew) s += ' · jam r' + d.ew.radius; if (d.upkeep) s += ' · ⚡' + d.upkeep + '/s';
    if (d.drone) s += ' · DRONE';
    if (d.aps) s += ' · APS ' + d.aps.n;
    if (d.sup) s += ' · ammo ' + d.sup; if (d.fuel) s += ' · fuel ' + d.fuel + ' s'; if (d.supply) s += ' · carries ' + d.supply.cap; if (d.tank) s += ' · tanks ' + d.tank.cap;
    s += '</small>'; if (d.kit && d.kit.length) s += '<br><small style="color:#e0b84a">' + d.kit.map((k) => '◆ ' + k).join('<br>') + '</small>'; s = s.replace(/<\/small><br><small style="color:#e0b84a">/, '</small><br><small style="color:#e0b84a">'); s += '<small>';
    if (d.loadouts) s += '<br>' + (d.rwy ? 'Needs runway level ' + d.rwy : 'Vertical take-off') + ' · ' + d.loadouts.length + ' loadouts (pick on the runway)';
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
    const sig = ents.map((e) => e.id + (e.ap || '') + (e.tier > 1 ? 't' + e.tier : '') + (e.tu ? 'u' : '')).join(',') + '|' + this.c?.mode.t;
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
      else if (e.ap && e.ap !== 'fly') { s += ' · ' + PHASE[e.ap]; }
      if (e.kind === 'building' && e.en) s += ' · ' + e.en + ' engineer' + (e.en > 1 ? 's' : '') + ' helping (×' + e.eb.toFixed(1) + ' speed)';
      if (e.cargo) { const lo = e.ed && e.ed.lo; s += ' · cargo ' + this.sim.cargoUsed(e) + '/' + (lo && lo.cap ? lo.cap : 0) + (e.cargo.length ? ' (' + e.cargo.length + ' units)' : ''); }
      if (e.apsN !== undefined && d.aps) s += ' · APS ' + e.apsN + '/' + d.aps.n;
      if (e.sup !== undefined && d.sup) s += ' · ammo ' + Math.round(e.sup / d.sup * 100) + '%';
      if (e.fuel !== undefined && d.fuel) s += ' · fuel ' + Math.round(e.fuel / d.fuel * 100) + '%' + (e.rf ? ' (to tanker)' : '');
      if (e.fstock !== undefined && d.tank) s += ' · tanker ' + Math.round(e.fstock) + '/' + d.tank.cap;
      if (e.stock !== undefined && d.supply) s += ' · supplies ' + Math.round(e.stock) + '/' + d.supply.cap + (e.auto ? ' · AUTO' : '');
      if (e.stock !== undefined && d.depot) s += ' · stock ' + Math.round(e.stock) + '/' + d.depot.cap;
      if (e.pal > 0) s += ' · ' + e.pal + ' pallets';
      if (e.vet) s += ' · ' + ['', 'Veteran', 'Elite', 'Legend'][e.vet] + ' ★'.repeat(e.vet);
      if (e.emcon) s += ' · EMCON';
      if (e.kind === 'building' && d.oil && e.node >= 0) { const nd = this.sim.map.oil[e.node]; if (nd) s += ' · field ' + Math.max(0, Math.round((nd.res === undefined ? 30000 : nd.res) / 300)) + '% left'; }
      if (e.kind !== 'building' && e.lo >= 0 && d.loadouts) { s += ' · ' + d.loadouts[e.lo].name; if (e.am && e.ed) { let t = 0, l = 0; e.ed.weapons.forEach((w, i) => { if (w.ammo > 0) { t += w.ammo; l += Math.max(0, e.am[i]); } }); if (t) s += ' (' + l + '/' + t + ' rounds)'; } }
      if (e.kind === 'building' && BTIER.steps[e.def]) s += ' · Mk ' + BTIER.roman[e.tier || 1] + (e.tu ? ' · upgrading to Mk ' + BTIER.roman[e.tier + 1] + ' ' + Math.round((1 - e.tu.left / e.tu.total) * 100) + '%' : '');
      if (e.kind === 'building' && e.afd) s += ' · runway ' + this.sim.afRunLen(e) + ' m · ' + this.sim.afStandCount(e) + ' stands';
      if (e.kind !== 'building' && (!e.ap || e.ap === 'fly') && e.order) s += ' · ' + ({ idle: 'idle', move: 'moving', attackmove: 'attack-moving', attack: 'attacking', attackground: 'firing at ground', lift: 'airlifting', drop: 'flying to drop zone', board: 'boarding' }[e.order.t] || '');
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
      const stU = units.filter((u) => u.st !== undefined && !u.air && !DEFS[u.def].builder && UNITS[u.def].weapons.length && UNITS[u.def].speed > 0);
      if (stU.length) { const cur = stU[0].st, same = stU.every((u) => u.st === cur), nm = ['Hold', 'Defend', 'Aggressive']; add('Stance: ' + (same ? nm[cur] : 'Mixed'), 'H', null, () => c.cycleStance(), same && cur === 2 ? 'on' : ''); }
      if (units.some((u) => u.ap === 'fly' && UNITS[u.def].loadouts)) add('Return to base', 'H', null, () => { this.g.cmd({ t: 'rtb', ids: units.filter((u) => u.ap === 'fly').map((u) => u.id) }); this.toast('Returning to base to re-arm', 'info'); });
      const par = units.find((u) => u.ap === 'stand' || u.ap === 'select'); if (par) add('Loadout…', 'L', null, () => { this.loTarget = par.id; this.loHide.delete(par.id); this.loSig = ''; });
      if (units.some((u) => u.cargo)) {
        add('Airlift…', 'T', 'lift', () => c.setMode(c.mode.t === 'lift' ? { t: 'normal' } : { t: 'lift' }));
        add('Airdrop…', 'J', 'drop', () => c.setMode(c.mode.t === 'drop' ? { t: 'normal' } : { t: 'drop' }));
        add('Unload', 'U', null, () => c.unload());
      }
      add('Escort…', 'K', 'escort', () => c.setMode(c.mode.t === 'escort' ? { t: 'normal' } : { t: 'escort' }));
      if (units.some((u) => u.pal > 0 && u.ap === 'fly')) add('Supply drop…', '', 'sdrop', () => c.setMode(c.mode.t === 'sdrop' ? { t: 'normal' } : { t: 'sdrop' }));
      const trk = units.filter((u) => DEFS[u.def].supply);
      if (trk.length) { const on = trk.every((u) => u.auto); add(on ? 'Auto supply: ON' : 'Auto supply: OFF', '', null, () => { this.g.cmd({ t: 'lauto', ids: trk.map((u) => u.id), v: on ? 0 : 1 }); setTimeout(() => { this.selSig = null; }, 160); }, on ? 'on' : ''); }
      if (units.some((u) => UNITS[u.def].weapons.some((w) => w.ground && w.kind !== 'hit'))) add('Fire at ground', 'F', 'forcefire', () => c.setMode(c.mode.t === 'forcefire' ? { t: 'normal' } : { t: 'forcefire' }));
    } else if (blds.length) {
      if (blds.some((b) => BUILDINGS[b.def].produces)) add('Set rally point', 'F', 'rally', () => c.setMode(c.mode.t === 'rally' ? { t: 'normal' } : { t: 'rally' }));
      const prd = blds.filter((b) => BUILDINGS[b.def].produces && b.progress >= 1);
      if (prd.length) {
        const rep = prd.every((b) => b.rep); add(rep ? 'Repeat: ON' : 'Repeat: OFF', '', null, () => { this.g.cmd({ t: 'repeat', ids: prd.map((b) => b.id), v: rep ? 0 : 1 }); setTimeout(() => { this.selSig = null; }, 160); }, rep ? 'on' : '');
        if (prd.some((b) => b.queue.length)) add('Clear queue', '', null, () => this.g.cmd({ t: 'clearq', ids: prd.map((b) => b.id) }));
      }
      const sil = blds.filter((b) => b.def === 'silo' && b.progress >= 1);
      if (sil.length) { const n = sil.reduce((a, b) => a + (b.mis ? b.mis.length : 0), 0); add('Launch missile… (' + n + ')', 'F', 'fire', () => { if (!n) { this.toast('No missiles stored: queue some in the Strategic tab', 'warn'); return; } c.setMode(c.mode.t === 'fire' ? { t: 'normal' } : { t: 'fire' }); }); }
      if (blds.some((b) => b.def === 'launchpad') && this.sim.space) add('Open orbital view', 'N', null, () => this.g.orbital.toggle(true));
      const upg = blds.filter((b) => BTIER.steps[b.def] && b.progress >= 1);
      if (upg.some((b) => b.tu)) add('Cancel upgrade', '', null, () => this.g.cmd({ t: 'cancelbupg', ids: upg.filter((b) => b.tu).map((b) => b.id) }));
      const nxt = upg.filter((b) => !this.sim.bldUpBlock(b));
      if (nxt.length) { const b0 = nxt[0], st = BTIER.steps[b0.def][b0.tier - 1]; add('Upgrade to Mk ' + BTIER.roman[b0.tier + 1] + (nxt.length > 1 ? ' ×' + nxt.length : '') + ' (⛏' + st.cost * nxt.length + (st.energy ? ' ⚡' + st.energy * nxt.length : '') + ')', '', null, () => this.g.cmd({ t: 'bupg', ids: nxt.map((b) => b.id) })); }
      if (blds.some((b) => b.def !== 'hq')) add('Sell', '', null, () => { if (confirm('Sell selected structure(s) for a 50% refund?')) c.sell(); }, 'danger');
    }
    const emt = ents.filter((e) => { const d = DEFS[e.def]; return (d.radar || d.ew) && !(e.kind === 'building' && e.progress < 1); });
    if (emt.length) { const off = emt.every((e) => e.emcon); add(off ? 'Emitters: SILENT' : 'Emitters: ON', '', null, () => { this.g.cmd({ t: 'emcon', ids: emt.map((e) => e.id), v: off ? 0 : 1 }); setTimeout(() => { this.selSig = null; }, 160); }, off ? 'danger' : ''); }
    this.modeChanged();
  }
  modeChanged() {
    const m = this.c ? this.c.mode : { t: 'normal' }; this.mode = m.t;
    for (const k in this.cmdBtns || {}) this.cmdBtns[k].classList.toggle('on', m.t === k);
    const txt = { fire: 'Launch: click the target anywhere on the map (hold Shift to empty the silo). Esc cancels', escort: 'Escort: click a friendly unit to follow and protect (Esc cancels)', sdrop: 'Supply drop: pick the point to release the pallets over (Esc cancels)', attackmove: 'Attack-move: pick a destination or target (Esc cancels)', move: 'Move: pick a destination (Esc cancels)', forcefire: 'Fire at ground: pick a point (Esc cancels)', rally: 'Rally point: pick a location (Esc cancels)', lift: 'Airlift: click a friendly airfield to fly the loaded cargo there (Esc cancels)', drop: 'Airdrop: click the drop zone; infantry, drones and light vehicles are paradropped (Esc cancels)', place: '' }[m.t];
    const dtx = m.t === 'dbgspawn' ? 'DEBUG: click the map to spawn. Esc to stop' : m.t === 'dbgkill' ? 'DEBUG: click to delete everything of that team nearby. Esc to stop' : '';
    this.el.banner.textContent = dtx || txt || ''; this.el.banner.classList.toggle('hidden', !(dtx || txt));
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
    for (let i = 0; i < map.oil.length; i++) { const o = map.oil[i]; ctx.fillStyle = '#f0b429'; ctx.fillRect(o.x * k - 3, o.z * k - 3, 6, 6); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(o.x * k - 3, o.z * k - 3, 6, 6); }
    // entities
    for (const e of sim.ents) {
      if (e.dead) continue;
      const own = e.team === team;
      if (!own && e.def !== 'derrick') { const c = map.cellOf(e.x, e.z); if ((c < 0 || !vis[c]) && !(e.kind === 'unit' && !e.air && sim.gcontact[team].has(e.id))) continue; }
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
    this.updateAir();
    this.updateGroups();
  }
  updateGroups() {
    const g = this.g, box = $('grpBar'); if (!box) return; const parts = []; let sig = '';
    for (let n = 1; n <= 9; n++) { const ids = (g.groups[n] || []).filter((id) => { const e = this.sim.byId.get(id); return e && !e.dead; }); if (!ids.length) continue; sig += n + ':' + ids.length + (ids.every((id) => g.sel.includes(id)) ? 's' : '') + ';'; parts.push([n, ids.length, ids.every((id) => g.sel.includes(id))]); }
    if (sig === this.grpSig) return; this.grpSig = sig; box.innerHTML = '';
    for (const [n, k, on] of parts) { const b = document.createElement('button'); b.className = 'grp' + (on ? ' on' : ''); b.innerHTML = '<b>' + n + '</b>' + k; b.title = 'Group ' + n + ' (double-click: jump). Ctrl/Shift+' + n + ' to assign'; let last = 0; b.addEventListener('click', () => { const now = performance.now(); this.c.recallGroup(n, now - last < 400); last = now; }); box.appendChild(b); }
  }

  // ---------- airfield: loadout picker + module panel ----------
  updateAir() {
    const sim = this.sim, L = this.g.local;
    const waiting = []; for (const e of sim.ents) if (!e.dead && e.owner === L && e.ap === 'select') waiting.push(e);
    for (const e of waiting) if (!this.toldSel.has(e.id)) { this.toldSel.add(e.id); this.toast(DEFS[e.def].name + ' is waiting on the runway: click it to choose a loadout', 'info'); sfx('ui', 0.9); }
    let target = null;
    if (this.loTarget) { const t = sim.byId.get(this.loTarget); if (t && !t.dead && (t.ap === 'stand' || t.ap === 'select')) target = t; else this.loTarget = 0; }
    // the picker only opens when the player clicks (selects) an aircraft that is waiting for a loadout
    const sel = this.g.sel ? [...this.g.sel] : [];
    const one = sel.length === 1 ? sim.byId.get(sel[0]) : null, sig = one ? one.id + ':' + one.ap : '';
    if (sig !== this.loSelSig) { this.loSelSig = sig; if (one && !one.dead && one.owner === L && one.ap === 'select') { this.loTarget = one.id; this.loHide.delete(one.id); this.loSig = ''; } }
    this.renderLoadout(target, waiting);
    this.renderAfPanel();
  }
  renderLoadout(t, waiting) {
    const el = this.loEl, sim = this.sim;
    if (!t) { if (!el.classList.contains('hidden')) { el.classList.add('hidden'); this.loSig = ''; } return; }
    const b = sim.afOf(t), D = UNITS[t.def], p = sim.players[t.owner];
    if (!b) return;
    const same = waiting.filter((e) => e.def === t.def && e.id !== t.id).length;
    const sig = [t.id, t.ap, t.lo, b.mods.runway, b.mods.depot, D.loadouts.map((l) => (p.credits >= l.cost && p.energy >= l.energy ? 1 : 0)).join(''), same, b.auto ? 1 : 0, t.cargo ? t.cargo.length : 0].join('|');
    if (el.classList.contains('hidden')) el.classList.remove('hidden');
    const tm = el.querySelector('#loTimer');
    if (tm && t.ap === 'select') tm.textContent = Math.max(0, Math.ceil((AF.selectTimeout * TICK_RATE - t.t) / TICK_RATE)) + ' s';
    if (sig === this.loSig) return; this.loSig = sig;
    const crew = 1 + 0.3 * b.mods.depot;
    let html = '<h3>' + D.name + ' · choose loadout</h3><div class="sub">' + (t.ap === 'select' ? 'On the runway — it blocks take-offs and landings. Default loadout in <b id="loTimer"></b>.' : 'Parked on a stand. Changing the loadout sends the ground crew back to work.') + ' Runway <b>L' + sim.afRunLevel(b) + '</b> · Depot <b>L' + sim.afDepotLevel(b) + '</b> · crews ×' + crew.toFixed(1) + '</div><div class="cards">';
    D.loadouts.forEach((lo) => {
      let why = ''; if (lo.dp > sim.afDepotLevel(b)) why = 'Needs ' + AF_MODULES.depot.levels[lo.dp - 2].name; else if (lo.rw > sim.afRunLevel(b)) why = 'Needs ' + AF_MODULES.runway.levels[lo.rw - 2].name;
      const poor = lo.cost > 0 && (p.credits < lo.cost || p.energy < lo.energy), cur = t.rdy && t.lo === lo.idx;
      html += '<button class="lcard' + (why ? ' locked' : '') + (poor ? ' poor' : '') + (cur ? ' cur' : '') + '" data-lo="' + lo.idx + '"><span class="nm">' + lo.name + (cur ? ' ✓' : '') + '</span><span class="ds">' + lo.desc + '</span><span class="wp">' + (lo.weapons.length ? lo.weapons.map((w) => '<div>' + wLine(w) + '</div>').join('') : '<div>Unarmed</div>') + '</span>' + (modLine(lo.mods) ? '<span class="md">' + modLine(lo.mods) + '</span>' : '') +
        '<span class="cost">' + (lo.cost ? '⛏' + lo.cost + ' <em>⚡' + lo.energy + '</em>' : 'Free') + ' · crew ' + Math.round(lo.prep / crew) + ' s</span>' + (why ? '<span class="why">' + why + '</span>' : '') + '</button>';
    });
    html += '</div><div class="foot">' + (same ? '<label><input type="checkbox" id="loAll" checked> Apply to all ' + same + ' other waiting ' + D.baseName + '</label>' : '') + '<label><input type="checkbox" id="loAuto"' + (b.auto ? ' checked' : '') + '> Auto-arm at this airfield with the last loadout</label><button class="btn" id="loClose">Close</button></div>';
    el.innerHTML = html;
    el.querySelectorAll('.lcard').forEach((c) => c.addEventListener('click', () => {
      this.g.unlockAudio(); const lo = D.loadouts[+c.dataset.lo]; if (c.classList.contains('locked')) { this.toast(c.querySelector('.why').textContent, 'warn'); sfx('ui', 0.5); return; }
      const all = el.querySelector('#loAll'), ids = [t.id];
      if (all && all.checked) for (const e of waiting) if (e.def === t.def && e.id !== t.id) ids.push(e.id);
      this.g.cmd({ t: 'loadout', ids, lo: lo.idx }); this.loTarget = 0; sfx('ui', 0.8); this.loSig = '';
    }));
    const au = el.querySelector('#loAuto'); if (au) au.addEventListener('change', () => this.g.cmd({ t: 'afauto', ids: [b.id], v: au.checked }));
    el.querySelector('#loClose').addEventListener('click', () => { this.loHide.add(t.id); this.loTarget = 0; this.loSig = ''; el.classList.add('hidden'); });
  }
  renderAfPanel() {
    const el = this.afEl, sim = this.sim, L = this.g.local, ents = this.c ? this.c.selEnts() : [];
    const b = ents.length === 1 && ents[0].owner === L && ents[0].def === 'airfield' && ents[0].progress >= 1 && ents[0].afd ? ents[0] : null;
    if (!b) { if (!el.classList.contains('hidden')) { el.classList.add('hidden'); this.afSig = ''; } return; }
    el.classList.remove('hidden');
    const p = sim.players[L];
    const used = b.stands.slice(0, sim.afStandCount(b)).filter((x) => x).length;
    const sig = [b.id, b.mods.runway, b.mods.apron, b.mods.depot, b.up ? b.up.key : '', b.auto ? 1 : 0, used, Math.floor(p.credits / 50)].join('|');
    if (b.up) { const bar = el.querySelector('#upBar'); if (bar) bar.style.width = Math.round((1 - b.up.left / b.up.total) * 100) + '%'; }
    if (sig === this.afSig) return; this.afSig = sig;
    let html = '<h3>Airfield</h3><div class="st">Runway <b>' + sim.afRunLen(b) + ' m</b> (L' + sim.afRunLevel(b) + ') · Stands <b>' + used + '/' + sim.afStandCount(b) + '</b> · Depot <b>L' + sim.afDepotLevel(b) + '</b><br>' + (b.rwy ? 'Runway: in use for take-off' : b.land ? 'Runway: aircraft landing' : 'Runway: clear') + '</div>';
    for (const key of AF_KEYS) {
      const m = AF_MODULES[key], lv = b.mods[key], max = m.levels.length, next = m.levels[lv], why = sim.afCanUpgrade(b, key), building = b.up && b.up.key === key;
      let pips = ''; for (let i = 0; i <= max; i++) pips += i <= lv ? '●' : '○';
      html += '<div class="mod"><div class="hd"><span>' + m.name + '</span><span class="pips">' + pips + '</span></div>';
      if (building) html += '<div class="bar"><i id="upBar" style="width:' + Math.round((1 - b.up.left / b.up.total) * 100) + '%"></i></div><button class="btn danger" data-cancel="1">Cancel <small>(refund spent)</small></button>';
      else if (next) html += '<div class="ds">' + next.desc + '</div><button class="btn" data-up="' + key + '"' + (why ? ' disabled' : '') + '>' + next.name + ' <small>⛏' + next.cost + ' ⚡' + next.energy + ' · ' + next.time + ' s</small></button>' + (why && why !== 'Unavailable' ? '<div class="ds" style="color:#ef5350">' + why + '</div>' : '');
      else html += '<div class="ds">Fully upgraded.</div>';
      html += '</div>';
    }
    html += '<label><input type="checkbox" id="afAuto"' + (b.auto ? ' checked' : '') + '> Auto-arm aircraft with the last loadout</label>';
    el.innerHTML = html;
    el.querySelectorAll('[data-up]').forEach((x) => x.addEventListener('click', () => { this.g.unlockAudio(); this.g.cmd({ t: 'upgrade', ids: [b.id], key: x.dataset.up }); sfx('ui', 0.7); this.afSig = ''; }));
    const cn = el.querySelector('[data-cancel]'); if (cn) cn.addEventListener('click', () => { this.g.cmd({ t: 'cancelup', ids: [b.id] }); this.afSig = ''; });
    el.querySelector('#afAuto').addEventListener('change', (e) => this.g.cmd({ t: 'afauto', ids: [b.id], v: e.target.checked }));
  }
}
