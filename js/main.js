// App shell: menus, lobby, match start/stop.
import { Game } from './game.js';
import { ModelViewer } from './viewer.js';
import { Net, Lockstep } from './net.js';
import { PLAYER_COLORS, PLAYER_COLOR_NAMES } from './sim/defs.js';
import { MAP_SIZES } from './sim/map.js';

const $ = (id) => document.getElementById(id);
const touch = (navigator.maxTouchPoints || 0) > 1 || 'ontouchstart' in window || (window.matchMedia && matchMedia('(pointer:coarse)').matches);
document.body.classList.toggle('touch', !!touch);

const SETTINGS_KEY = 'spearhead.settings.v1';
function loadSettings() {
  const d = Object.assign({ shadows: !touch, edge: !touch, volume: 0.5, gfx: touch ? 'low' : 'high', lod: 'auto', adaptive: !!touch, preset: 'auto', fps: touch ? 45 : 0, showFps: false, aa: !touch, orbQ: touch ? 'low' : 'high' }, touch ? { res: 0.85, shadowQ: 1024, view: 0.85, density: 0.5, clouds: 0.6, fxq: 'low' } : { res: 1, shadowQ: 2048, view: 1, density: 1, clouds: 1, fxq: 'high' });
  try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); return Object.assign(d, s); } catch (e) { return d; }
}
function seedFromString(s) { let h = 7; for (const ch of String(s)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0; return (h >>> 0) % 1000000 + 1; }
const randSeed = () => Math.random().toString(36).slice(2, 7).toUpperCase();
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

class App {
  constructor() {
    this.settings = loadSettings();
    this.game = null; this.net = null; this.pauseOpen = false; this.returnTo = null;
    this.lobby = null; this.setupMode = 'sp'; this.myLobbySlot = 0;
    this.bindMenu();
    this.showScreen('main');
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.game && this.game.ls.role === 'local' && !this.pauseOpen && !this.game.ended) this.game.openPause(); });
    $('loading').remove();
  }
  saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) { /* ignore */ } }

  // ---------------- screens ----------------
  showScreen(name) {
    if (name !== 'viewer' && this.viewer) this.viewer.close();
    for (const el of document.querySelectorAll('#menu .card')) el.classList.add('hidden');
    $('screen-' + name).classList.remove('hidden');
    $('menu').classList.remove('hidden');
    this.screen = name;
  }
  hideMenu() { $('menu').classList.add('hidden'); }
  seg(id, opts, cur, fn) {
    const box = $(id); box.innerHTML = '';
    for (const o of opts) {
      const b = document.createElement('button'); b.textContent = o.label; if (o.v === cur) b.classList.add('on');
      b.addEventListener('click', () => { for (const c of box.children) c.classList.remove('on'); b.classList.add('on'); fn(o.v); });
      box.appendChild(b);
    }
  }
  bindMenu() {
    const on = (id, fn) => $(id).addEventListener('click', fn);
    on('mSkirmish', () => this.openSetup('sp'));
    on('mHost', () => this.hostGame());
    on('mJoin', () => { $('joinErr').textContent = ''; $('joinName').value = localStorage.getItem('spearhead.name') || ''; this.showScreen('join'); });
    on('mViewer', () => { if (!this.viewer) this.viewer = new ModelViewer(); this.showScreen('viewer'); this.viewer.open(); });
    on('vwBack', () => this.showScreen('main'));
    on('mHelp', () => { this.returnTo = 'main'; this.showScreen('help'); });
    on('mSettings', () => { this.returnTo = 'main'; this.openSettings(); });
    on('btnSetupBack', () => this.leaveSetup());
    on('btnJoinBack', () => this.showScreen('main'));
    on('btnJoinGo', () => this.joinGame());
    on('btnHelpBack', () => this.backFromInfo());
    on('btnSettingsBack', () => this.backFromInfo());
    on('btnStart', () => this.startFromSetup());
    on('btnReseed', () => { $('seedInput').value = randSeed(); this.lobby.map.seed = $('seedInput').value; this.pushLobby(); });
    $('seedInput').addEventListener('input', (e) => { this.lobby.map.seed = e.target.value.toUpperCase() || '1'; this.pushLobby(); });
    on('btnFull', () => { const el = document.documentElement; const f = el.requestFullscreen || el.webkitRequestFullscreen; if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else if (f) f.call(el); });
    $('volume').addEventListener('input', (e) => { this.settings.volume = e.target.value / 100; this.saveSettings(); });
    // pause menu
    on('pResume', () => this.closePause());
    on('pSave', () => { if (this.game) this.game.saveGame(); });
    on('mLoad', () => $('loadFile').click());
    $('loadFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(r.result); this.startGame(d.cfg, 0, new Lockstep(null, 'local', 0), r.result); } catch (err) { console.error(err); alert('Could not load that save: ' + err.message); } }; r.readAsText(f); });
    on('pSettings', () => { this.returnTo = 'pause'; $('pause').classList.add('hidden'); $('menu').style.zIndex = 12; this.openSettings(); });
    on('pHelp', () => { this.returnTo = 'pause'; $('pause').classList.add('hidden'); $('menu').style.zIndex = 12; this.showScreen('help'); });
    on('pResign', () => { if (confirm('Resign this match?')) { this.game.cmd({ t: 'resign' }); this.closePause(); } });
    on('pQuit', () => { if (confirm('Quit to the main menu?')) this.quitToMenu(); });
    $('joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.joinGame(); });
  }
  backFromInfo() {
    if (this.returnTo === 'pause') { $('menu').classList.add('hidden'); $('menu').style.zIndex = ''; $('pause').classList.remove('hidden'); this.returnTo = null; }
    else this.showScreen('main');
  }
  applyPreset(k) {
    const s = this.settings, P = {
      low: { gfx: 'low', shadows: false, res: 0.65, shadowQ: 1024, view: 0.7, density: 0.3, clouds: 0, fxq: 'low', fps: 30, adaptive: true, orbQ: 'low' },
      medium: { gfx: 'low', shadows: true, res: 0.85, shadowQ: 1024, view: 0.85, density: 0.6, clouds: 0.6, fxq: 'low', fps: 45, adaptive: true, orbQ: 'low' },
      high: { gfx: 'high', shadows: true, res: 1, shadowQ: 2048, view: 1, density: 1, clouds: 1, fxq: 'high', fps: 0, adaptive: false, orbQ: 'high' },
      ultra: { gfx: 'high', shadows: true, res: 1.25, shadowQ: 4096, view: 1.4, density: 1.6, clouds: 1.4, fxq: 'high', fps: 0, adaptive: false, lod: 'max', orbQ: 'high' },
    };
    if (k === 'auto') Object.assign(s, touch ? P.medium : P.high, { lod: 'auto' }); else Object.assign(s, P[k]);
    s.preset = k; this.saveSettings(); this.openSettings();
  }
  openSettings() {
    const s = this.settings;
    this.seg('segPreset', [{ v: 'auto', label: 'Auto' }, { v: 'low', label: 'Low' }, { v: 'medium', label: 'Medium' }, { v: 'high', label: 'High' }, { v: 'ultra', label: 'Ultra' }], s.preset || 'auto', (v) => this.applyPreset(v));
    const mk = (id, opts, key, post) => this.seg(id, opts, s[key], (v) => { s[key] = v; s.preset = 'custom'; this.saveSettings(); const n = $('presetNote'); if (n) n.textContent = 'Custom settings'; if (post) post(v); });
    mk('segRes', [{ v: 0.5, label: '50%' }, { v: 0.65, label: '65%' }, { v: 0.85, label: '85%' }, { v: 1, label: '100%' }, { v: 1.25, label: '125%' }], 'res', (v) => { if (this.game) { this.game.renderer.pixelCap = (touch ? 1.5 : 2) * v; this.game.renderer.applyPixelRatio(); this.game.renderer.resize(); } });
    mk('segShadowQ', [{ v: 1024, label: 'Low' }, { v: 2048, label: 'Medium' }, { v: 4096, label: 'High' }], 'shadowQ', (v) => { if (this.game) { const sh = this.game.renderer.sun.shadow; sh.mapSize.set(v, v); if (sh.map) { sh.map.dispose(); sh.map = null; } } });
    mk('segView', [{ v: 0.7, label: 'Short' }, { v: 0.85, label: 'Medium' }, { v: 1, label: 'Normal' }, { v: 1.4, label: 'Long' }], 'view', (v) => { if (this.game && this.game.renderer.scene.fog) { const f = this.game.renderer.scene.fog; f.near = 260 * v; f.far = 1250 * v; } });
    mk('segDensity', [{ v: 0.15, label: 'Sparse' }, { v: 0.3, label: 'Low' }, { v: 0.6, label: 'Medium' }, { v: 1, label: 'High' }, { v: 1.6, label: 'Dense' }], 'density');
    mk('segClouds', [{ v: 0, label: 'Off' }, { v: 0.6, label: 'Few' }, { v: 1, label: 'Normal' }, { v: 1.4, label: 'Many' }], 'clouds');
    mk('segFxq', [{ v: 'low', label: 'Reduced' }, { v: 'high', label: 'Full' }], 'fxq');
    mk('segFps', [{ v: 30, label: '30' }, { v: 45, label: '45' }, { v: 60, label: '60' }, { v: 0, label: 'Unlimited' }], 'fps');
    mk('segAA', [{ v: true, label: 'On' }, { v: false, label: 'Off' }], 'aa');
    mk('segOrb', [{ v: 'low', label: 'Standard' }, { v: 'high', label: 'High' }], 'orbQ');
    mk('segFpsBox', [{ v: false, label: 'Off' }, { v: true, label: 'On' }], 'showFps', (v) => { if (!v) { const e = document.getElementById('fpsBox'); if (e) e.remove(); } });
    this.seg('segShadows', [{ v: true, label: 'On' }, { v: false, label: 'Off' }], s.shadows, (v) => { s.shadows = v; this.saveSettings(); if (this.game) { this.game.renderer.renderer.shadowMap.enabled = v; this.game.renderer.sun.castShadow = v; } });
    this.seg('segGfx', [{ v: 'high', label: 'High' }, { v: 'low', label: 'Medium' }, { v: 'classic', label: 'Classic' }], s.gfx, (v) => { s.gfx = v; this.saveSettings(); const n = $('gfxNote'); if (n) n.textContent = this.game ? 'Applies to the next game.' : ''; });
    this.seg('segLod', [{ v: 'auto', label: 'Auto' }, { v: 'max', label: 'Max detail' }], s.lod || 'auto', (v) => { s.lod = v; this.saveSettings(); });
    this.seg('segAdapt', [{ v: 'on', label: 'On' }, { v: 'off', label: 'Off' }], s.adaptive ? 'on' : 'off', (v) => { s.adaptive = v === 'on'; this.saveSettings(); });
    this.seg('segEdge', [{ v: true, label: 'On' }, { v: false, label: 'Off' }], s.edge, (v) => { s.edge = v; this.saveSettings(); });
    $('volume').value = Math.round(s.volume * 100);
    this.showScreen('settings');
  }

  // ---------------- setup / lobby ----------------
  defaultLobby(mode) {
    const slots = [{ kind: 'human', name: localStorage.getItem('spearhead.name') || 'You', team: 0 }];
    if (mode === 'sp') slots.push({ kind: 'ai', diff: 'normal', team: 1 }, { kind: 'closed', team: 2 }, { kind: 'closed', team: 3 });
    else slots.push({ kind: 'open', team: 1 }, { kind: 'closed', team: 2 }, { kind: 'closed', team: 3 });
    return { map: { type: 'island', size: 'medium', seed: randSeed(), space: false }, slots };
  }
  openSetup(mode) {
    this.setupMode = mode; this.lobby = this.defaultLobby(mode); this.myLobbySlot = 0;
    this.renderSetup(); this.showScreen('setup');
  }
  renderSetup() {
    const L = this.lobby, ro = this.setupMode === 'client';
    $('setupTitle').textContent = this.setupMode === 'sp' ? 'Skirmish Setup' : this.setupMode === 'host' ? 'Multiplayer Lobby (Host)' : 'Multiplayer Lobby';
    $('lobbyCode').classList.toggle('hidden', this.setupMode !== 'host');
    if (this.net && this.net.code) $('codeText').textContent = this.net.code;
    const lock = (id) => { for (const b of $(id).children) b.disabled = ro; };
    this.seg('segType', [{ v: 'island', label: 'Island' }, { v: 'highlands', label: 'Mountain valley' }, { v: 'desert', label: 'Desert mesas' }, { v: 'arctic', label: 'Arctic' }, { v: 'jungle', label: 'Jungle' }, { v: 'volcanic', label: 'Volcanic' }, { v: 'random', label: 'Random' }], L.map.type, (v) => { L.map.type = v; this.pushLobby(); }); lock('segType');
    this.seg('segSize', [{ v: 'small', label: 'Small' }, { v: 'medium', label: 'Medium' }, { v: 'large', label: 'Large' }, { v: 'xl', label: 'Huge' }, { v: 'xxl', label: 'Colossal' }], L.map.size, (v) => { L.map.size = v; this.pushLobby(); }); lock('segSize');
    this.seg('segSpace', [{ v: false, label: 'Off' }, { v: true, label: 'On' }], !!L.map.space, (v) => { L.map.space = v; this.pushLobby(); }); lock('segSpace');
    $('seedInput').value = L.map.seed; $('seedInput').disabled = ro; $('btnReseed').disabled = ro;
    $('btnStart').classList.toggle('hidden', ro);
    const box = $('slots'); box.innerHTML = '';
    L.slots.forEach((s, i) => {
      const row = document.createElement('div'); row.className = 'slot';
      const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = hex(PLAYER_COLORS[i]); row.appendChild(dot);
      const nm = document.createElement('span'); nm.className = 'nm';
      const label = s.kind === 'human' ? (s.name || 'Player') + (i === this.myLobbySlot ? ' (you)' : '') : s.kind === 'ai' ? 'Computer' : s.kind === 'open' ? 'Open – waiting for player…' : 'Closed';
      nm.textContent = PLAYER_COLOR_NAMES[i] + ': ' + label; row.appendChild(nm);
      const editable = !ro && i !== 0 && !(s.kind === 'human');
      if (i !== 0 && !ro && s.kind !== 'human') {
        const sel = document.createElement('select');
        const opts = this.setupMode === 'sp' ? [['closed', 'Closed'], ['ai:easy', 'AI – Easy'], ['ai:normal', 'AI – Normal'], ['ai:hard', 'AI – Hard']] : [['open', 'Open (player)'], ['ai:easy', 'AI – Easy'], ['ai:normal', 'AI – Normal'], ['ai:hard', 'AI – Hard'], ['closed', 'Closed']];
        for (const [v, t] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }
        sel.value = s.kind === 'ai' ? 'ai:' + s.diff : s.kind;
        sel.addEventListener('change', () => { const v = sel.value; if (v.startsWith('ai:')) { s.kind = 'ai'; s.diff = v.slice(3); } else s.kind = v; this.pushLobby(); this.renderSetup(); });
        row.appendChild(sel);
      } else if (i !== 0 && !ro && s.kind === 'human') {
        const k = document.createElement('button'); k.className = 'btn'; k.textContent = 'Kick'; k.addEventListener('click', () => this.kick(i)); row.appendChild(k);
      }
      if (s.kind === 'human' || s.kind === 'ai') {
        const t = document.createElement('select'); t.title = 'Team';
        for (let k = 0; k < 4; k++) { const o = document.createElement('option'); o.value = k; o.textContent = 'Team ' + (k + 1); t.appendChild(o); }
        t.value = s.team; t.disabled = ro; t.addEventListener('change', () => { s.team = +t.value; this.pushLobby(); });
        row.appendChild(t);
      }
      box.appendChild(row);
    });
    $('setupErr').textContent = '';
  }
  pushLobby() {
    if (this.setupMode !== 'host' || !this.net) return;
    this.net.conns.forEach((conn, slot) => this.net.sendConn(conn, { k: 'lobby', lobby: this.publicLobby(), you: slot }));
  }
  publicLobby() { return { map: this.lobby.map, slots: this.lobby.slots.map((s) => ({ kind: s.kind, name: s.name, diff: s.diff, team: s.team })) }; }
  leaveSetup() {
    if (this.net) { this.net.close(); this.net = null; }
    this.showScreen('main');
  }
  kick(i) {
    const conn = this.net.conns.get(i);
    if (conn) { this.net.sendConn(conn, { k: 'kicked' }); setTimeout(() => { try { conn.close(); } catch (e) { /* ignore */ } }, 200); }
    this.net.conns.delete(i); this.lobby.slots[i] = { kind: 'open', team: this.lobby.slots[i].team }; this.pushLobby(); this.renderSetup();
  }

  // ---------------- multiplayer ----------------
  async hostGame() {
    $('mHost').disabled = true; $('mHost').textContent = 'Connecting…';
    const net = new Net();
    try { await net.host(); } catch (e) { alert(e.message); $('mHost').disabled = false; $('mHost').textContent = 'Multiplayer – Host Game'; return; }
    $('mHost').disabled = false; $('mHost').textContent = 'Multiplayer – Host Game';
    this.net = net; this.openSetup('host');
    net.on('incoming', (conn) => {
      const i = this.lobby.slots.findIndex((s, k) => k > 0 && s.kind === 'open');
      if (i < 0 || this.game) { try { conn.send({ k: 'full' }); } catch (e) { /* ignore */ } setTimeout(() => conn.close(), 300); return; }
      net.conns.set(i, conn); conn.slot = i;
      this.lobby.slots[i] = { kind: 'human', name: 'Player', team: this.lobby.slots[i].team };
      this.renderSetup(); this.pushLobby();
    });
    net.on('data', (conn, m) => {
      if (!m) return;
      if (m.k === 'hello') { const s = this.lobby.slots[conn.slot]; if (s && s.kind === 'human') { s.name = String(m.name || 'Player').slice(0, 14); this.renderSetup(); this.pushLobby(); } }
      else if (m.k === 'cmd' && this.game && this.game.ls.role === 'host') { const sim = this.hostSimSlot.get(conn); if (sim != null) this.game.ls.receiveRemote(sim, m.c); }
      else if (m.k === 'hash' && this.game && this.game.ls.role === 'host') this.game.ls.hostGotHash(m.n, m.h);
    });
    net.on('left', (conn) => {
      if (this.game && this.game.ls.role === 'host') {
        const sim = this.hostSimSlot.get(conn); this.hostSimSlot.delete(conn);
        if (sim != null) { this.game.ls.injectHost({ t: 'takeover', p: sim, diff: 'normal' }); this.game.toast(this.game.sim.players[sim].name + ' left – AI takes over', 'warn'); }
        return;
      }
      if (conn.slot != null && this.net && this.net.conns.get(conn.slot) === conn) { this.net.conns.delete(conn.slot); this.lobby.slots[conn.slot] = { kind: 'open', team: this.lobby.slots[conn.slot].team }; this.renderSetup(); this.pushLobby(); }
    });
  }
  async joinGame() {
    const code = $('joinCode').value.trim().toUpperCase(); const name = ($('joinName').value.trim() || 'Player').slice(0, 14);
    if (code.length < 4) { $('joinErr').textContent = 'Enter the room code from the host.'; return; }
    try { localStorage.setItem('spearhead.name', name); } catch (e) { /* ignore */ }
    $('joinErr').textContent = 'Connecting…'; $('btnJoinGo').disabled = true;
    const net = new Net();
    try { await net.join(code); } catch (e) { $('joinErr').textContent = e.message; $('btnJoinGo').disabled = false; return; }
    $('btnJoinGo').disabled = false; $('joinErr').textContent = '';
    this.net = net; this.setupMode = 'client'; this.lobby = { map: { type: 'island', size: 'medium', seed: '', space: false }, slots: [] };
    net.sendHost({ k: 'hello', name });
    this.ls = null; this.pendingTurns = [];
    net.on('data', (conn, m) => {
      if (!m) return;
      if (m.k === 'lobby') { this.lobby = m.lobby; this.myLobbySlot = m.you; this.renderSetup(); if (this.screen !== 'setup') this.showScreen('setup'); }
      else if (m.k === 'full') { alert('That game is full or already started.'); this.leaveSetup(); }
      else if (m.k === 'kicked') { alert('You were removed from the lobby.'); this.leaveSetup(); }
      else if (m.k === 'start') {
        this.ls = new Lockstep(net, 'client', m.you);
        this.startGame(m.cfg, m.you, this.ls);
        for (const t of this.pendingTurns) this.ls.pushTurn(t); this.pendingTurns = [];
      } else if (m.k === 'turn') { const t = { n: m.n, c: m.c }; if (this.ls) this.ls.pushTurn(t); else this.pendingTurns.push(t); }
      else if (m.k === 'desync' && this.ls && this.ls.onDesync) this.ls.onDesync(m.n);
    });
    net.on('hostLeft', () => {
      if (this.game && !this.game.ended) { this.game.ended = true; alert('The host disconnected. Returning to the menu.'); this.quitToMenu(); }
      else if (!this.game) { alert('The host closed the lobby.'); this.leaveSetup(); }
    });
    // show lobby
    this.lobby.slots = []; this.renderSetup(); this.showScreen('setup');
    $('setupTitle').textContent = 'Waiting for host…';
  }

  // ---------------- start / stop ----------------
  seedNum(seed) { return /^\d+$/.test(String(seed)) ? parseInt(seed, 10) % 1000000 + 1 : seedFromString(seed); }
  buildCfg() {
    const L = this.lobby, slots = [], map = {};
    L.slots.forEach((s, i) => { if (s.kind === 'human' || s.kind === 'ai') { map[i] = slots.length; slots.push({ name: s.kind === 'ai' ? 'AI ' + PLAYER_COLOR_NAMES[i] : (s.name || 'Player'), ai: s.kind === 'ai' ? s.diff : null, team: s.team }); } });
    return { cfg: { seed: this.seedNum(L.map.seed), size: L.map.size, type: L.map.type, space: !!L.map.space, slots }, map };
  }
  startFromSetup() {
    const { cfg, map } = this.buildCfg();
    if (cfg.slots.length < 2) { $('setupErr').textContent = 'Add at least one opponent.'; return; }
    if (new Set(cfg.slots.map((s) => s.team)).size < 2) { $('setupErr').textContent = 'All players are on the same team – put at least two teams in play.'; return; }
    try { localStorage.setItem('spearhead.name', this.lobby.slots[0].name); } catch (e) { /* ignore */ }
    if (this.setupMode === 'sp') { this.startGame(cfg, 0, new Lockstep(null, 'local', 0)); return; }
    // host
    const ls = new Lockstep(this.net, 'host', map[0]);
    this.hostSimSlot = new Map();
    this.net.conns.forEach((conn, slot) => { if (map[slot] != null) { this.hostSimSlot.set(conn, map[slot]); this.net.sendConn(conn, { k: 'start', cfg, you: map[slot] }); } });
    this.startGame(cfg, map[0], ls);
  }
  startGame(cfg, local, ls, snap) {
    this.hideMenu(); $('pause').classList.add('hidden'); $('endscreen').classList.add('hidden');
    $('pSave').style.display = ls.role === 'local' ? '' : 'none';
    $('pauseNote').textContent = ls.role === 'local' ? '' : 'Multiplayer: the game continues while this menu is open.';
    try { this.game = new Game(this, cfg, local, ls, this.settings, !!touch, snap); }
    catch (e) { console.error(e); alert('Failed to start the game: ' + e.message); this.showScreen('main'); return; }
    this.game.start();
  }
  quitToMenu() {
    if (this.game) { this.game.stop(); this.game = null; }
    if (this.net) { this.net.close(); this.net = null; }
    this.pauseOpen = false; $('pause').classList.add('hidden'); $('endscreen').classList.add('hidden');
    this.showScreen('main');
  }
  openPause() { if (!this.game) return; this.pauseOpen = true; this.game.setPaused(true); $('pause').classList.remove('hidden'); }
  closePause() { this.pauseOpen = false; if (this.game) this.game.setPaused(false); $('pause').classList.add('hidden'); }
  gameOver(game) {
    const sim = game.sim, me = sim.players[game.local];
    const won = sim.over && sim.winner === me.team && me.alive;
    const title = won ? 'VICTORY' : (!me.alive ? 'DEFEAT' : 'GAME OVER');
    let rows = '';
    for (const p of sim.players) rows += '<tr><td><span style="color:' + hex(PLAYER_COLORS[p.color]) + '">●</span> ' + p.name + '</td><td>' + (p.alive ? 'Alive' : 'Eliminated') + '</td><td>' + p.stats.killed + '</td><td>' + p.stats.built + '</td></tr>';
    $('endCard').innerHTML = '<h1 class="end-title ' + (won ? 'win' : 'lose') + '">' + title + '</h1><div class="sub">Match length ' + Math.floor(sim.tick / 1200) + ':' + String(Math.floor(sim.tick / 20) % 60).padStart(2, '0') + '</div>'
      + '<table class="stats"><tr><th>Player</th><th>Status</th><th>Kills</th><th>Structures</th></tr>' + rows + '</table>'
      + '<div class="row">' + (!sim.over ? '<button class="btn" id="eWatch">Keep watching</button>' : '') + '<button class="btn primary" id="eMenu">Main menu</button></div>';
    $('endscreen').classList.remove('hidden');
    const w = $('eWatch'); if (w) w.addEventListener('click', () => $('endscreen').classList.add('hidden'));
    $('eMenu').addEventListener('click', () => this.quitToMenu());
  }
}

window.__app = new App();
window.__loaded = true;
