// One running match: simulation + lockstep pacing + renderer + controls + HUD.
import { Sim } from './sim/sim.js';
import { Renderer } from './render.js';
import { Controls } from './input.js';
import { HUD } from './ui.js';
import { LogiPanel } from './logi-ui.js';
import { SensorOverlay } from './overlay.js';
import { TURN_TICKS } from './net.js';
import { DT } from './sim/defs.js';
import { restore, snapshot } from './sim/save.js';
import { initAudio, setVolume } from './fx.js';

import { OrbitalView } from './orbital.js';
import { ProdPanel } from './prod-ui.js';
const $ = (id) => document.getElementById(id);
export class Game {
  constructor(app, cfg, local, ls, settings, touch, snap) {
    this.app = app; this.cfg = cfg; this.local = local; this.ls = ls; this.settings = settings; this.touch = touch;
    this.sim = snap ? restore(snap) : new Sim(cfg);
    this.team = this.sim.players[local].team;
    this.canvas = document.getElementById('view'); this.overlay = document.getElementById('overlay');
    this.octx = this.overlay.getContext('2d');
    this.renderer = new Renderer(this.canvas, this.sim, local, { shadows: settings.shadows, touch, gfx: settings.gfx, lod: settings.lod, adaptive: settings.adaptive !== undefined ? settings.adaptive : !!touch });
    this.sel = []; this.groups = {}; this.paused = false; this.waiting = false; this.desync = false; this.lastAlert = null;
    this.simAcc = 0; this.tickInTurn = 0; this.curTurn = null; this.alpha = 0; this.running = false; this.ended = false; this.leftEarly = false;
    this.controls = new Controls(this);
    this.hud = new HUD(this);
    this.sensor = new SensorOverlay(this);
    this.logi = new LogiPanel(this);
    this.orbital = new OrbitalView(this); this.prod = new ProdPanel(this);
    if (this.sim.space) $('btnOrbit').classList.remove('hidden'); else $('btnOrbit').classList.add('hidden');
    ls.onDesync = () => { this.desync = true; this.toast('Desync detected – game states differ!', 'warn'); };
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize); window.addEventListener('orientationchange', this.onResize);
    this.resize();
    setVolume(settings.volume);
  }
  resize() {
    this.renderer.resize(); if (this.orbital) this.orbital.resize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.overlay.width = Math.floor(this.renderer.W * dpr); this.overlay.height = Math.floor(this.renderer.H * dpr);
    this.dpr = dpr;
  }
  start() {
    this.running = true; this.last = performance.now(); this.hud.show(true);
    this.toast('Build a Barracks, then a War Factory. Train an Engineer to claim far oil fields.', 'info');
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }
  stop() {
    this.running = false; cancelAnimationFrame(this.raf);
    this.controls.unbind(); window.removeEventListener('resize', this.onResize); window.removeEventListener('orientationchange', this.onResize);
    this.hud.show(false); this.octx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    this.renderer.dispose();
  }
  unlockAudio() { initAudio(); setVolume(this.settings.volume); }
  cmd(c) { this.ls.sendLocal(c); }
  toast(t, k) { this.hud.toast(t, k); }
  setSel(ids) {
    this.sel = ids.slice(0, 600);
    this.renderer.selection = new Set(this.sel);
    this.hud.selSig = null; this.hud.renderSel(true);
    // on selecting own production buildings, show the matching tab
    const e = ids.length === 1 ? this.sim.byId.get(ids[0]) : null;
    if (e && e.owner === this.local && e.kind === 'building') {
      const p = { barracks: 'inf', hq: 'inf', factory: 'veh', airfield: 'air', dronebay: 'drn', silo: 'stg', launchpad: 'stg' }[e.def]; if (p) this.hud.setTab(p);
    }
  }
  jumpHome() { const h = this.sim.hq(this.local); if (h) this.renderer.centerOn(h.x, h.z); }
  jumpAlert() { if (this.lastAlert) this.renderer.centerOn(this.lastAlert.x, this.lastAlert.z); else this.jumpHome(); }
  saveGame() {
    try { const blob = new Blob([snapshot(this.sim)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'spearhead-' + Math.floor(this.sim.tick / 1200) + 'min.json'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); this.toast('Game saved to a file', 'info'); }
    catch (e) { console.error(e); this.toast('Could not save: ' + e.message, 'warn'); }
  }
  openPause() {
    if (this.paused && this.app.pauseOpen) { this.app.closePause(); return; }
    this.app.openPause();
  }
  setPaused(v) { this.paused = v && this.ls.role === 'local'; }

  advance(dt) {
    const ls = this.ls, sim = this.sim;
    if (this.paused || sim.over) return;
    ls.update(dt);
    let speed = 1;
    if (ls.role === 'client') speed = 1 + Math.min(3, Math.max(0, ls.queue.length - 2) * 0.5);
    this.simAcc += dt * speed;
    let steps = 0; this.waiting = false;
    while (this.simAcc >= DT && steps < 14 && !sim.over) {
      if (this.tickInTurn === 0) {
        const t = ls.queue.shift();
        if (!t) { this.waiting = ls.role !== 'local'; this.simAcc = Math.min(this.simAcc, DT); break; }
        this.curTurn = t;
      }
      sim.step(this.tickInTurn === 0 ? this.curTurn.c : null);
      this.simAcc -= DT; steps++; this.tickInTurn++;
      if (this.tickInTurn >= TURN_TICKS) { this.tickInTurn = 0; ls.turnDone(this.curTurn.n, sim); }
    }
    this.alpha = Math.min(1, this.simAcc / DT);
  }

  frame(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    this.controls.update(dt);
    this.advance(dt);
    const evs = this.sim.events; this.sim.events = [];
    if (evs.length) { this.renderer.processEvents(evs); this.hud.handleEvents(evs); this.orbital.handleEvents(evs); }
    // drop dead entities from the selection
    if (this.sel.length && (this.sim.tick % 5 === 0)) {
      const alive = this.sel.filter((id) => { const e = this.sim.byId.get(id); return e && !e.dead; });
      if (alive.length !== this.sel.length) this.setSel(alive);
    }
    const o = this.octx; o.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.orbital.on) { this.orbital.render(dt); this.orbital.draw(o, this.renderer.W, this.renderer.H); this.orbital.update(dt); this.renderer.timeOnly && 0; }
    else {
      this.renderer.render(dt, this.paused ? 1 : this.alpha);
      this.controls.draw(o, this.renderer.W, this.renderer.H);
      if (this.sensor.on) this.sensor.draw(o, this.renderer.W, this.renderer.H, this.renderer.time);
    }
    this.hud.update(dt); this.logi.update(dt); this.prod.update(dt);
    if ((this.sim.over || !this.sim.players[this.local].alive) && !this.ended) { this.ended = true; this.app.gameOver(this); }
  }
}
