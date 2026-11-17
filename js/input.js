// Input: mouse, touch (iPad) and keyboard. Also owns selection / order logic.
import { UNITS, BUILDINGS, DEFS } from './sim/defs.js';
import { sfx } from './fx.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Controls {
  constructor(game) {
    this.g = game; this.canvas = game.canvas; this.r = game.renderer; this.sim = game.sim;
    this.mode = { t: 'normal' };
    this.keys = new Set();
    this.ptrs = new Map();
    this.box = null; this.touchBox = false;
    this.mouse = { x: 0, y: 0, over: false };
    this.lastClick = { t: 0, x: 0, y: 0 };
    this.ghost = null;
    this.gesture = null;
    this.ml = null; this.mr = null;
    this.bind();
  }

  // ---------- helpers ----------
  get local() { return this.g.local; }
  get team() { return this.g.team; }
  selEnts() { const out = []; for (const id of this.g.sel) { const e = this.sim.byId.get(id); if (e && !e.dead) out.push(e); } return out; }
  selUnits() { return this.selEnts().filter((e) => e.kind === 'unit' && e.owner === this.local); }
  selBlds() { return this.selEnts().filter((e) => e.kind === 'building' && e.owner === this.local); }
  cmd(c) { this.g.cmd(c); }
  setMode(m) { this.mode = m || { t: 'normal' }; if (this.mode.t !== 'place') { this.r.setGhost(null); this.ghost = null; } this.g.hud.modeChanged(); }
  cancelMode() { if (this.mode.t !== 'normal') { this.setMode({ t: 'normal' }); return true; } return false; }

  // ---------- placement ----------
  startPlace(type) {
    if (this.mode.t === 'place' && this.mode.type === type) { this.cancelMode(); return; }
    this.setMode({ t: 'place', type });
    const cx = this.r.W / 2, cy = this.r.H * 0.45;
    this.placeAt(this.mouse.over && !this.g.touch ? this.mouse.x : cx, this.mouse.over && !this.g.touch ? this.mouse.y : cy);
  }
  placeAt(sx, sy) {
    if (this.mode.t !== 'place') return;
    const gp = this.r.groundAt(sx, sy); if (!gp) return;
    const type = this.mode.type, d = BUILDINGS[type];
    let node = null, x = gp.x, z = gp.z;
    if (d.oil) {
      let bd = 18 * 18;
      for (const o of this.sim.map.oil) { const dd = (o.x - gp.x) * (o.x - gp.x) + (o.z - gp.z) * (o.z - gp.z); if (!o.building && dd < bd) { bd = dd; node = o; } }
      if (node) { x = node.x; z = node.z; }
    }
    const res = this.sim.canPlace(this.local, type, x, z, node ? node.id : -1);
    const ok = res.ok && (!d.oil || !!node);
    const info = { x: res.x != null ? res.x : x, z: res.z != null ? res.z : z, size: d.size, ok, node: node ? node.id : -1, reason: d.oil && !node ? 'Must be built on an oil field' : res.reason, type, rx: x, rz: z, plan: res.plan || null };
    this.ghost = info; this.r.setGhost(info);
    this.g.hud.placeInfo(info);
  }
  confirmPlace(keep) {
    const gi = this.ghost; if (!gi || this.mode.t !== 'place') return;
    if (!gi.ok) { this.g.toast(gi.reason || 'Cannot build here', 'warn'); sfx('ui', 0.8); return; }
    this.cmd({ t: 'build', type: gi.type, x: gi.rx, z: gi.rz, node: gi.node });
    sfx('ui', 1);
    if (keep) this.placeAt(this.mouse.x, this.mouse.y); else this.setMode({ t: 'normal' });
  }

  // ---------- orders ----------
  ids(list) { return list.map((e) => e.id); }
  hitEntity(sx, sy, minPx) { return this.r.pickEntity(sx, sy, minPx, (e) => !e.dead); }
  orderMove(x, z) { const u = this.selUnits(); if (!u.length) return; this.cmd({ t: 'move', ids: this.ids(u), x, z, q: this.q ? 1 : 0 }); this.r.ping(x, z, this.q ? 0x5cd2ff : 0x8dff5c); sfx('ui', 0.6); }
  orderAttackMove(x, z) { const u = this.selUnits(); if (!u.length) return; this.cmd({ t: 'attackmove', ids: this.ids(u), x, z, q: this.q ? 1 : 0 }); this.r.ping(x, z, this.q ? 0x5cd2ff : 0xffb040); sfx('ui', 0.6); }
  orderForceFire(x, z) { const u = this.selUnits(); if (!u.length) return; this.cmd({ t: 'attackground', ids: this.ids(u), x, z }); this.r.ping(x, z, 0xff5050); sfx('ui', 0.6); }
  orderAttack(e) { const u = this.selUnits(); if (!u.length) return; this.cmd({ t: 'attack', ids: this.ids(u), tid: e.id }); this.r.ping(e.x, e.z, 0xff4040); sfx('ui', 0.6); }
  orderRally(x, z) { const b = this.selBlds(); if (!b.length) return; this.cmd({ t: 'rally', ids: this.ids(b), x, z }); this.r.ping(x, z, 0x6cb8ff); }
  orderBoard(tr) { const u = this.selUnits().filter((e) => !e.air && !e.cargo); if (!u.length) return false; this.cmd({ t: 'board', ids: this.ids(u), tid: tr.id }); this.r.ping(tr.x, tr.z, 0x6cb8ff); sfx('ui', 0.6); return true; }
  orderEscort(tg) { const u = this.selUnits().filter((e) => e.id !== tg.id); if (!u.length || tg.kind !== 'unit') return false; this.cmd({ t: 'escort', ids: this.ids(u), tid: tg.id }); this.r.ping(tg.x, tg.z, 0x6cb8ff); return true; }
  orderFire(x, z) {
    const silos = this.selBlds().filter((b) => b.def === 'silo' && b.mis && b.mis.length); if (!silos.length) { this.g.toast('No loaded silo selected', 'warn'); return; }
    let n = 0; for (const b of silos) { const k = this.q ? b.mis.length : 1; for (let i = 0; i < k; i++) { this.cmd({ t: 'fire', bid: b.id, x: x + (i ? (i * 7) % 11 - 5 : 0), z: z + (i ? (i * 5) % 9 - 4 : 0) }); n++; } }
    this.r.ping(x, z, 0xff5030); sfx('ui', 0.9); this.g.toast(n + ' missile' + (n > 1 ? 's' : '') + ' launched', 'info');
  }
  orderSupplyDrop(x, z) { const u = this.selUnits().filter((e) => e.pal > 0 && e.ap === 'fly'); if (!u.length) { this.g.toast('No aircraft with supply pallets selected', 'warn'); return; } this.cmd({ t: 'supplydrop', ids: this.ids(u), x, z }); this.r.ping(x, z, 0xffd24a); }
  orderLift(af) { const u = this.selUnits().filter((e) => e.cargo); if (!u.length) return false; this.cmd({ t: 'lift', ids: this.ids(u), bid: af.id }); this.r.ping(af.x, af.z, 0x6cb8ff); sfx('ui', 0.6); return true; }
  orderDrop(x, z) { const u = this.selUnits().filter((e) => e.cargo); if (!u.length) return; this.cmd({ t: 'drop', ids: this.ids(u), x, z }); this.r.ping(x, z, 0xffd24a); sfx('ui', 0.6); }
  unload() { const u = this.selUnits().filter((e) => e.cargo); if (u.length) this.cmd({ t: 'unload', ids: this.ids(u) }); }
  stop() { const u = this.selUnits(); if (u.length) this.cmd({ t: 'stop', ids: this.ids(u) }); }
  sell() { const b = this.selBlds().filter((e) => e.def !== 'hq'); if (b.length) this.cmd({ t: 'sell', ids: this.ids(b) }); }

  // right click / touch tap on world with a selection
  contextOrder(sx, sy, touch, q) {
    this.q = !!q;
    const gp = this.r.groundAt(sx, sy);
    const hit = this.hitEntity(sx, sy, touch ? 28 : 10);
    const units = this.selUnits(), blds = this.selBlds();
    if (units.length) {
      if (hit && hit.team !== this.team) { this.orderAttack(hit); return true; }
      if (hit && hit.owner === this.local && hit.cargo && this.orderBoard(hit)) return true;
      if (hit && hit.owner === this.local && hit.afd && units.some((e) => e.cargo) && this.orderLift(hit)) return true;
      if (gp) { this.orderMove(gp.x, gp.z); return true; }
    } else if (blds.length && gp) { this.orderRally(gp.x, gp.z); return true; }
    return false;
  }
  modeAction(sx, sy, shift, touch) {
    this.q = !!shift;
    const gp = this.r.groundAt(sx, sy), m = this.mode.t;
    const hit = this.hitEntity(sx, sy, touch ? 28 : 10);
    if (m === 'attackmove') { if (hit && hit.team !== this.team) this.orderAttack(hit); else if (gp) this.orderAttackMove(gp.x, gp.z); }
    else if (m === 'move') { if (gp) this.orderMove(gp.x, gp.z); }
    else if (m === 'forcefire') { if (gp) this.orderForceFire(gp.x, gp.z); }
    else if (m === 'rally') { if (gp) this.orderRally(gp.x, gp.z); }
    else if (m === 'lift') { if (hit && hit.owner === this.local && hit.afd) this.orderLift(hit); else this.g.toast('Click one of your airfields', 'warn'); }
    else if (m === 'drop') { if (gp) this.orderDrop(gp.x, gp.z); }
    else if (m === 'escort') { if (hit && hit.owner === this.local && hit.kind === 'unit') this.orderEscort(hit); else this.g.toast('Click one of your units to escort', 'warn'); }
    else if (m === 'sdrop') { if (gp) this.orderSupplyDrop(gp.x, gp.z); }
    else if (m === 'fire') { if (gp) this.orderFire(gp.x, gp.z); }
    if (!shift) this.setMode({ t: 'normal' });
  }

  // ---------- selection ----------
  visibleOwn(e) { return e.owner === this.local; }
  selectClick(sx, sy, shift, touch, dbl) {
    const hit = this.hitEntity(sx, sy, touch ? 26 : 8);
    if (hit) {
      if (dbl && hit.owner === this.local && hit.kind === 'unit') {
        const same = this.r.entitiesInRect(0, 0, this.r.W, this.r.H, (e) => e.owner === this.local && e.def === hit.def);
        this.g.setSel(same.map((e) => e.id)); return;
      }
      if (shift && hit.owner === this.local) {
        const s = new Set(this.g.sel); if (s.has(hit.id)) s.delete(hit.id); else s.add(hit.id);
        this.g.setSel([...s]);
      } else this.g.setSel([hit.id]);
      sfx('ui', 0.4);
    } else if (!shift) this.g.setSel([]);
  }
  selectRect(x0, y0, x1, y1, shift) {
    const mine = this.r.entitiesInRect(x0, y0, x1, y1, (e) => e.owner === this.local);
    let pick = mine.filter((e) => e.kind === 'unit');
    if (!pick.length) pick = mine.filter((e) => e.kind === 'building');
    if (!pick.length) { if (!shift) this.g.setSel([]); return; }
    const ids = pick.map((e) => e.id);
    this.g.setSel(shift ? [...new Set([...this.g.sel, ...ids])] : ids);
    sfx('ui', 0.4);
  }
  selectArmy() {
    const u = this.sim.ents.filter((e) => !e.dead && e.owner === this.local && e.kind === 'unit' && UNITS[e.def].weapons.length > 0);
    this.g.setSel(u.map((e) => e.id));
  }
  selectIdleEngineers() {
    const u = this.sim.ents.filter((e) => !e.dead && e.owner === this.local && e.def === 'engineer' && e.order.t === 'idle');
    if (u.length) { this.g.setSel(u.map((e) => e.id)); this.r.centerOn(u[0].x, u[0].z); return true; }
    return false;
  }
  // quick-select presets (SELECT menu)
  selectPreset(kind) {
    const mine = this.sim.ents.filter((e) => !e.dead && e.owner === this.local && e.kind === 'unit' && !e.boarded);
    const armed = (e) => UNITS[e.def].weapons.length > 0 && !UNITS[e.def].strike;
    let list = [];
    if (kind === 'army') list = mine.filter(armed);
    else if (kind === 'ground') list = mine.filter((e) => !e.air && armed(e));
    else if (kind === 'air') list = mine.filter((e) => e.air);
    else if (kind === 'idle') list = mine.filter((e) => armed(e) && e.order.t === 'idle' && (!e.ap || e.ap === 'fly'));
    else if (kind === 'arty') list = mine.filter((e) => ['sph', 'mlrs', 'tel'].includes(UNITS[e.def].base));
    else if (kind === 'eng') list = mine.filter((e) => UNITS[e.def].builder);
    else if (kind === 'aa') list = mine.filter((e) => UNITS[e.def].hitsAir && !UNITS[e.def].hitsGround);
    else if (kind === 'inf') list = mine.filter((e) => UNITS[e.def].armor === 'inf' && !UNITS[e.def].drone);
    else if (kind === 'veh') list = mine.filter((e) => !e.air && UNITS[e.def].armor !== 'inf' && armed(e));
    else if (kind === 'hurt') list = mine.filter((e) => e.hp < e.maxhp * 0.6);
    else if (kind === 'prod') list = this.sim.ents.filter((e) => !e.dead && e.owner === this.local && e.kind === 'building' && BUILDINGS[e.def].produces);
    else if (kind === 'sam') list = this.sim.ents.filter((e) => !e.dead && e.owner === this.local && e.kind === 'building' && DEFS[e.def].weapons.length);
    if (!list.length) { this.g.toast('Nothing to select', 'info'); return; }
    this.g.setSel(list.map((e) => e.id)); sfx('ui', 0.5);
  }
  recallGroup(n, center) {
    const ids = (this.g.groups[n] || []).filter((id) => { const e = this.sim.byId.get(id); return e && !e.dead; });
    this.g.groups[n] = ids;
    if (!ids.length) return;
    this.g.setSel(ids);
    if (center) { const e = this.sim.byId.get(ids[0]); if (e) this.r.centerOn(e.x, e.z); }
  }

  // ---------- event binding ----------
  bind() {
    const c = this.canvas;
    const opt = { passive: false };
    this.h = {
      down: (e) => { if (!this.g.orbital.on) this.onDown(e); }, move: (e) => { if (!this.g.orbital.on) this.onMove(e); }, up: (e) => { if (!this.g.orbital.on) this.onUp(e); }, cancel: (e) => this.onCancel(e),
      wheel: (e) => { if (!this.g.orbital.on) this.onWheel(e); }, ctx: (e) => e.preventDefault(),
      kd: (e) => this.onKey(e, true), ku: (e) => this.onKey(e, false), blur: () => this.keys.clear(),
      leave: () => { this.mouse.over = false; }, enter: () => { this.mouse.over = true; },
      gest: (e) => e.preventDefault(), tm: (e) => { if (e.target === c) e.preventDefault(); },
    };
    c.addEventListener('pointerdown', this.h.down); c.addEventListener('pointermove', this.h.move);
    c.addEventListener('pointerup', this.h.up); c.addEventListener('pointercancel', this.h.cancel);
    c.addEventListener('wheel', this.h.wheel, opt); c.addEventListener('contextmenu', this.h.ctx);
    c.addEventListener('pointerleave', this.h.leave); c.addEventListener('pointerenter', this.h.enter);
    window.addEventListener('keydown', this.h.kd); window.addEventListener('keyup', this.h.ku); window.addEventListener('blur', this.h.blur);
    document.addEventListener('gesturestart', this.h.gest); document.addEventListener('gesturechange', this.h.gest);
    document.addEventListener('touchmove', this.h.tm, opt);
  }
  unbind() {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.h.down); c.removeEventListener('pointermove', this.h.move);
    c.removeEventListener('pointerup', this.h.up); c.removeEventListener('pointercancel', this.h.cancel);
    c.removeEventListener('wheel', this.h.wheel); c.removeEventListener('contextmenu', this.h.ctx);
    c.removeEventListener('pointerleave', this.h.leave); c.removeEventListener('pointerenter', this.h.enter);
    window.removeEventListener('keydown', this.h.kd); window.removeEventListener('keyup', this.h.ku); window.removeEventListener('blur', this.h.blur);
    document.removeEventListener('gesturestart', this.h.gest); document.removeEventListener('gesturechange', this.h.gest);
    document.removeEventListener('touchmove', this.h.tm);
  }
  pos(e) { const rc = this.canvas.getBoundingClientRect(); return { x: e.clientX - rc.left, y: e.clientY - rc.top }; }

  onDown(e) {
    if (this.g.paused) return;
    this.g.unlockAudio();
    const p = this.pos(e);
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (e.pointerType === 'touch') return this.touchDown(e, p);
    this.mouse.x = p.x; this.mouse.y = p.y; this.mouse.over = true;
    if (e.button === 0) this.ml = { x: p.x, y: p.y, moved: false, shift: e.shiftKey || e.metaKey && false, alt: e.altKey, yaw: this.r.cam.yaw, pitch: this.r.cam.pitch };
    else if (e.button === 2 || e.button === 1) this.mr = { x: p.x, y: p.y, moved: false, btn: e.button, yaw: this.r.cam.yaw, pitch: this.r.cam.pitch, lx: p.x, ly: p.y };
  }
  onMove(e) {
    const p = this.pos(e);
    if (e.pointerType === 'touch') return this.touchMove(e, p);
    this.mouse.x = p.x; this.mouse.y = p.y; this.mouse.over = true;
    if (this.mode.t === 'place') this.placeAt(p.x, p.y);
    const cam = this.r.cam;
    if (this.mr) {
      const dx = p.x - this.mr.x, dy = p.y - this.mr.y;
      if (!this.mr.moved && Math.abs(dx) + Math.abs(dy) > 6) this.mr.moved = true;
      if (this.mr.moved) { cam.yaw = this.mr.yaw - dx * 0.006; cam.pitch = clamp(this.mr.pitch + dy * 0.004, 0.45, 1.3); }
    }
    if (this.ml) {
      const dx = p.x - this.ml.x, dy = p.y - this.ml.y;
      if (!this.ml.moved && Math.abs(dx) + Math.abs(dy) > 6) this.ml.moved = true;
      if (this.ml.moved) {
        if (this.ml.alt) { cam.yaw = this.ml.yaw - dx * 0.006; cam.pitch = clamp(this.ml.pitch + dy * 0.004, 0.45, 1.3); }
        else if (this.mode.t === 'normal') this.box = { x0: this.ml.x, y0: this.ml.y, x1: p.x, y1: p.y };
      }
    }
  }
  onUp(e) {
    const p = this.pos(e);
    if (e.pointerType === 'touch') return this.touchUp(e, p);
    try { this.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (e.button === 0 && this.ml) {
      const ml = this.ml; this.ml = null;
      if (this.box) { const b = this.box; this.box = null; this.selectRect(b.x0, b.y0, b.x1, b.y1, e.shiftKey); return; }
      if (ml.moved && ml.alt) return;
      this.click(p.x, p.y, e.shiftKey);
    } else if (this.mr && (e.button === 2 || e.button === 1)) {
      const mr = this.mr; this.mr = null;
      if (!mr.moved && e.button === 2) {
        if (this.mode.t !== 'normal') this.cancelMode();
        else this.contextOrder(p.x, p.y, false, e.shiftKey);
      }
    }
  }
  onCancel(e) { this.ptrs.delete(e.pointerId); this.ml = null; this.mr = null; this.box = null; if (this.ptrs.size === 0) this.gesture = null; }

  click(x, y, shift) {
    const now = performance.now();
    const dbl = now - this.lastClick.t < 350 && Math.abs(x - this.lastClick.x) < 10 && Math.abs(y - this.lastClick.y) < 10;
    this.lastClick = { t: now, x, y };
    if (this.mode.t === 'place') { this.confirmPlace(shift); return; }
    if (this.mode.t !== 'normal') { this.modeAction(x, y, shift, false); return; }
    this.selectClick(x, y, shift, false, dbl);
  }
  onWheel(e) {
    e.preventDefault();
    const cam = this.r.cam;
    if (e.shiftKey) { cam.yaw += e.deltaY * 0.003; return; }
    const k = e.ctrlKey ? 0.012 : 0.0012;
    cam.dist = clamp(cam.dist * Math.exp(e.deltaY * k), 14, 560);
  }

  // ---------- touch gestures ----------
  touchDown(e, p) {
    this.ptrs.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now() });
    if (this.ptrs.size === 1) {
      this.gesture = { kind: 'pending', moved: false, t: performance.now(), lp: null };
      this.gesture.lp = setTimeout(() => { // long-press -> box select
        if (this.gesture && this.gesture.kind === 'pending' && !this.gesture.moved && this.ptrs.size === 1) {
          const q = [...this.ptrs.values()][0];
          this.gesture.kind = 'box'; this.box = { x0: q.sx, y0: q.sy, x1: q.x, y1: q.y };
          if (navigator.vibrate) try { navigator.vibrate(8); } catch (err) { /* ignore */ }
        }
      }, 450);
    } else if (this.ptrs.size === 2) {
      if (this.gesture && this.gesture.lp) clearTimeout(this.gesture.lp);
      this.box = null;
      const [a, b] = [...this.ptrs.values()];
      this.gesture = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, a0: Math.atan2(b.y - a.y, b.x - a.x), dist0: this.r.cam.dist, yaw0: this.r.cam.yaw, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
  }
  touchMove(e, p) {
    const q = this.ptrs.get(e.pointerId); if (!q) return;
    const px = q.x, py = q.y; q.x = p.x; q.y = p.y;
    const gst = this.gesture; if (!gst) return;
    const cam = this.r.cam;
    if (gst.kind === 'pending') {
      if (Math.hypot(p.x - q.sx, p.y - q.sy) > 10) {
        gst.moved = true; if (gst.lp) clearTimeout(gst.lp);
        if (this.touchBox && this.mode.t === 'normal') { gst.kind = 'box'; this.box = { x0: q.sx, y0: q.sy, x1: p.x, y1: p.y }; }
        else { gst.kind = 'pan'; this.panBy(p.x - q.sx, p.y - q.sy); }
      }
    } else if (gst.kind === 'pan') this.panBy(p.x - px, p.y - py);
    else if (gst.kind === 'box') { this.box = { x0: q.sx, y0: q.sy, x1: p.x, y1: p.y }; }
    else if (gst.kind === 'pinch' && this.ptrs.size >= 2) {
      const [a, b] = [...this.ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, ang = Math.atan2(b.y - a.y, b.x - a.x);
      cam.dist = clamp(gst.dist0 * gst.d0 / d, 14, 560);
      let da = ang - gst.a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      cam.yaw = gst.yaw0 + da;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      this.panBy(mx - gst.mx, my - gst.my); gst.mx = mx; gst.my = my;
    }
    if (this.mode.t === 'place' && gst.kind === 'pan') { /* ghost stays where tapped */ }
  }
  panBy(dx, dy) {
    const cam = this.r.cam, s = 2 * cam.dist * Math.tan(this.r.camera.fov * Math.PI / 360) / this.r.H;
    this.r.pan(-dx * s, dy * s / Math.sin(cam.pitch));
  }
  touchUp(e, p) {
    const q = this.ptrs.get(e.pointerId);
    try { this.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const gst = this.gesture;
    this.ptrs.delete(e.pointerId);
    if (!gst) return;
    if (gst.lp) clearTimeout(gst.lp);
    if (gst.kind === 'pending' && !gst.moved && q && performance.now() - gst.t < 500) this.tap(p.x, p.y);
    else if (gst.kind === 'box' && this.box) { const b = this.box; this.box = null; if (Math.abs(b.x1 - b.x0) + Math.abs(b.y1 - b.y0) > 12) this.selectRect(b.x0, b.y0, b.x1, b.y1, false); }
    this.box = null;
    if (this.ptrs.size === 0) this.gesture = null;
    else if (gst.kind === 'pinch') this.gesture = { kind: 'dead' };
  }
  tap(x, y) {
    const now = performance.now();
    const dbl = now - this.lastClick.t < 320 && Math.hypot(x - this.lastClick.x, y - this.lastClick.y) < 30;
    this.lastClick = { t: now, x, y };
    if (this.mode.t === 'place') { this.placeAt(x, y); this.g.hud.showPlaceBar(true); return; }
    if (this.mode.t !== 'normal') { this.modeAction(x, y, false, true); return; }
    const hit = this.hitEntity(x, y, 26);
    if (hit && hit.owner === this.local) { this.selectClick(x, y, false, true, dbl); return; }
    if (hit && hit.team !== this.team) { if (this.selUnits().length) this.orderAttack(hit); else this.g.setSel([hit.id]); return; }
    if (!this.contextOrder(x, y, true)) this.g.setSel([]);
  }

  // ---------- keyboard ----------
  onKey(e, down) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (this.g.paused && !(e.code === 'Escape' && down)) return;
    const code = e.code;
    if (!down) { this.keys.delete(code); return; }
    if (this.g.orbital.on) { if (code === 'Escape' || code === 'KeyN') { e.preventDefault(); this.g.orbital.toggle(false); } return; }
    if (code === 'KeyN' && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); this.g.orbital.toggle(); return; }
    const mod = e.ctrlKey || e.metaKey;
    const hasUnits = this.selUnits().length > 0;
    this.keys.add(code);
    if (e.repeat && !/Arrow|Minus|Equal|KeyQ|KeyE|KeyZ|KeyX|PageUp|PageDown/.test(code)) return;
    const stop = () => { e.preventDefault(); };
    if (code === 'Escape') { stop(); if (this.cancelMode()) return; if (this.g.sel.length) { this.g.setSel([]); return; } this.g.openPause(); return; }
    if (code === 'Space') { stop(); this.g.jumpAlert(); return; }
    if (code === 'Tab') { stop(); this.g.hud.cycleTab(e.shiftKey ? -1 : 1); return; }
    if (code === 'KeyH') { this.g.jumpHome(); return; }
    if (code === 'KeyP' && this.g.ls.role === 'local') { this.g.openPause(); return; }
    if (mod && code === 'KeyA') { stop(); this.selectArmy(); return; }
    const dm = /^Digit([1-9])$/.exec(code);
    if (dm) {
      stop(); const n = +dm[1];
      if (mod || e.shiftKey) { this.g.groups[n] = this.g.sel.filter((id) => { const t = this.sim.byId.get(id); return t && t.owner === this.local; }); this.g.toast('Group ' + n + ' set (' + this.g.groups[n].length + ')', 'info'); }
      else { const now = performance.now(); this.recallGroup(n, now - (this._gt || 0) < 400 && this._gn === n); this._gt = now; this._gn = n; }
      return;
    }
    if (hasUnits && !e.shiftKey && !mod) {
      if (code === 'KeyA') { stop(); this.setMode({ t: 'attackmove' }); return; }
      if (code === 'KeyM') { stop(); this.setMode({ t: 'move' }); return; }
      if (code === 'KeyS') { stop(); this.stop(); return; }
      if (code === 'KeyF') { stop(); this.setMode({ t: 'forcefire' }); return; }
      if (code === 'KeyH') { stop(); const fl = this.selUnits().filter((u) => u.ap === 'fly' && UNITS[u.def].loadouts); if (fl.length) { this.cmd({ t: 'rtb', ids: this.ids(fl) }); this.g.toast('Returning to base to re-arm', 'info'); } return; }
      if (code === 'KeyT' && this.selUnits().some((u) => u.cargo)) { stop(); this.setMode({ t: 'lift' }); return; }
      if (code === 'KeyJ' && this.selUnits().some((u) => u.cargo)) { stop(); this.setMode({ t: 'drop' }); return; }
      if (code === 'KeyU' && this.selUnits().some((u) => u.cargo)) { stop(); this.unload(); return; }
      if (code === 'KeyL') { stop(); const par = this.selUnits().find((u) => u.ap === 'stand' || u.ap === 'select'); if (par) { this.g.hud.loTarget = par.id; this.g.hud.loHide.delete(par.id); this.g.hud.loSig = ''; } return; }
    }
    if (this.selBlds().length && !hasUnits && code === 'KeyF') { stop(); this.setMode({ t: 'rally' }); return; }
    if (!mod && code === 'KeyO') { stop(); this.g.sensor.toggle(); return; }
    if (!mod && code === 'KeyK' && this.selUnits().length) { stop(); this.setMode({ t: 'escort' }); return; }
    if (!mod && code === 'KeyG') { stop(); this.g.logi.toggle(); return; }
    if (!mod && code === 'KeyC') { stop(); this.g.prod.toggle(); return; }
    if (!mod) {
      if (code === 'KeyB') this.g.hud.setTab('str'); else if (code === 'KeyI') this.g.hud.setTab('inf'); else if (code === 'KeyV') this.g.hud.setTab('veh'); else if (code === 'KeyY') this.g.hud.setTab('air'); else if (code === 'KeyR') this.g.hud.setTab('stg'); else if (code === 'KeyD' && !e.ctrlKey && !e.metaKey) this.g.hud.setTab('drn'); else if (code === 'KeyT' && this.g.hud.tab !== 'str') this.g.hud.setTier(this.g.hud.tier % 3 + 1);
    }
    if (code.startsWith('Arrow') || code === 'Space') stop();
  }

  // per-frame: held keys, edge scroll, overlay
  update(dt) {
    const k = this.keys, cam = this.r.cam;
    if (this.g.paused) return;
    const speed = cam.dist * 1.15 * dt * (k.has('ShiftLeft') || k.has('ShiftRight') ? 2 : 1);
    let fx = 0, rx = 0;
    const wasd = !this.selUnits().length || k.has('ShiftLeft') || k.has('ShiftRight');
    if (k.has('ArrowUp') || (wasd && k.has('KeyW'))) fx += 1;
    if (k.has('ArrowDown') || (wasd && k.has('KeyS'))) fx -= 1;
    if (k.has('ArrowRight') || (wasd && k.has('KeyD'))) rx += 1;
    if (k.has('ArrowLeft') || (wasd && k.has('KeyA'))) rx -= 1;
    if (this.g.settings.edge && !this.g.touch && this.mouse.over && !this.ml && !this.mr) {
      const m = this.mouse, W = this.r.W, H = this.r.H, E = 4;
      if (m.x < E) rx -= 1; if (m.x > W - E) rx += 1; if (m.y < E) fx += 1; if (m.y > H - E) fx -= 1;
    }
    if (fx || rx) this.r.pan(rx * speed, fx * speed);
    if (k.has('KeyQ')) cam.yaw += dt * 1.6;
    if (k.has('KeyE')) cam.yaw -= dt * 1.6;
    if (k.has('KeyZ') || k.has('Equal') || k.has('NumpadAdd') || k.has('PageUp')) cam.dist = clamp(cam.dist * Math.exp(-dt * 1.4), 14, 560);
    if (k.has('KeyX') || k.has('Minus') || k.has('NumpadSubtract') || k.has('PageDown')) cam.dist = clamp(cam.dist * Math.exp(dt * 1.4), 14, 560);
  }

  // ---------- overlay (selection box, health bars, order lines) ----------
  draw(ctx, W, H) {
    ctx.clearRect(0, 0, W, H);
    const r = this.r, sim = this.sim, p = {}, sel = new Set(this.g.sel);
    let bars = 0;
    for (const v of r.views.values()) {
      const e = v.ent; if (!v.visible || e.dead) continue;
      const selected = sel.has(e.id);
      const dmg = e.hp < e.maxhp - 0.5;
      const building = e.kind === 'building';
      const constructing = building && e.progress < 1;
      if (!selected && !dmg && !constructing && !(e.stun > 0)) continue;
      if (++bars > 220) break;
      const o = v.obj.position;
      r.project(o.x, o.y + (building ? 4 + e.size * 1.4 : e.air ? 3 : 3.4), o.z, p);
      if (p.behind || p.x < -50 || p.x > W + 50 || p.y < -50 || p.y > H + 50) continue;
      const wr = building ? e.size * 2.2 : Math.max(e.radius * 1.2, 1.4);
      const w = clamp(r.pxRadius(wr, o.x, o.y, o.z) * 1.7, 22, 90), h = building ? 5 : 4;
      const f = clamp(e.hp / e.maxhp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(p.x - w / 2 - 1, p.y - 1, w + 2, h + 2);
      const own = e.team === this.team;
      ctx.fillStyle = f > 0.6 ? (own ? '#7fd34a' : '#e86a5a') : f > 0.3 ? '#e8c04a' : '#e8483a';
      ctx.fillRect(p.x - w / 2, p.y, w * f, h);
      const dd0 = DEFS[e.def];
      if (!building && dd0.tier > 1) { ctx.fillStyle = dd0.tier === 3 ? '#ffd24a' : '#cfd8e3'; for (let k = 0; k < dd0.tier - 1; k++) ctx.fillRect(p.x - w / 2 + k * 7, p.y - 7, 5, 4); }
      if (e.stun > 0) { ctx.fillStyle = '#5ec8ff'; ctx.fillRect(p.x + w / 2 - 12, p.y - 8, 12, 5); }
      else if (e.jam > 0) { ctx.fillStyle = '#ff5ec8'; ctx.fillRect(p.x + w / 2 - 12, p.y - 8, 4 * e.jam, 5); }
      if (constructing) { ctx.fillStyle = '#4aa3ff'; ctx.fillRect(p.x - w / 2, p.y + h + 2, w * clamp(e.progress, 0, 1), 3); }
      else if (building && e.owner === this.local && e.queue.length) { const it = e.queue[0], dd = UNITS[it.type]; ctx.fillStyle = '#f0b429'; ctx.fillRect(p.x - w / 2, p.y + h + 2, w * clamp(1 - it.left / dd.timeTicks, 0, 1), 3); }
    }
    // order lines
    ctx.lineWidth = 1.5;
    for (const id of sel) {
      const e = sim.byId.get(id); if (!e || e.dead || e.kind !== 'unit' || e.owner !== this.local) continue;
      const o = e.order; if (!o || o.t === 'idle') continue;
      let tx, tz, col = 'rgba(143,209,79,.55)';
      if (o.t === 'attack') { const t = sim.byId.get(o.tid); if (!t) continue; tx = t.x; tz = t.z; col = 'rgba(255,80,70,.6)'; }
      else { tx = o.x; tz = o.z; if (o.t === 'attackmove') col = 'rgba(255,176,64,.6)'; else if (o.t === 'attackground') col = 'rgba(255,80,70,.6)'; }
      const a = {}, b = {};
      r.project(e.x, sim.map.hAt(e.x, e.z) + 1, e.z, a); r.project(tx, sim.map.hAt(tx, tz) + 0.5, tz, b);
      if (a.behind || b.behind) continue;
      ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, 6.283); ctx.stroke();
    }
    // rally lines for selected buildings
    for (const id of sel) {
      const e = sim.byId.get(id); if (!e || e.dead || e.kind !== 'building' || e.owner !== this.local || !e.rally) continue;
      const a = {}, b = {};
      r.project(e.x, sim.map.hAt(e.x, e.z) + 2, e.z, a); r.project(e.rally.x, sim.map.hAt(e.rally.x, e.rally.z) + 0.5, e.rally.z, b);
      if (a.behind || b.behind) continue;
      ctx.strokeStyle = 'rgba(100,180,255,.7)'; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, 6.283); ctx.stroke();
    }
    if (this.box) {
      const b = this.box;
      ctx.fillStyle = 'rgba(143,209,79,.12)'; ctx.strokeStyle = 'rgba(143,209,79,.95)'; ctx.lineWidth = 1.5;
      ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    }
  }
}
