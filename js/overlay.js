// Sensor overlay (toggle with O): every radar and jammer you know of, radar contacts, and where aircraft radars are searching.
import { DEFS } from './sim/defs.js';

const TAU = Math.PI * 2;
const COL = { radar: '94,230,255', radarEn: '255,150,70', jam: '230,90,255', jamEn: '255,80,120', contact: '255,206,74', ident: '255,90,90', warn: '255,170,40' };

export class SensorOverlay {
  constructor(game) { this.g = game; this.on = false; this._p = {}; this._q = {}; }
  toggle() {
    this.on = !this.on; const b = document.getElementById('btnSensor'); if (b) b.classList.toggle('on', this.on);
    this.g.hud.toast(this.on ? 'Sensor overlay ON: radars, jammers and contacts (O to hide)' : 'Sensor overlay OFF', 'info');
  }
  // ground-projected circle / sector outline
  ring(ctx, x, z, r, a0 = 0, a1 = TAU, close = false) {
    const R = this.g.renderer, map = R.sim.map, p = this._p; let pen = false; const n = Math.max(24, Math.min(72, Math.round(r / 3)));
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
      R.project(px, Math.max(0, map.hAt(Math.min(map.size, Math.max(0, px)), Math.min(map.size, Math.max(0, pz)))) + 0.6, pz, p);
      if (p.behind) { pen = false; continue; }
      if (!pen) { ctx.moveTo(p.x, p.y); pen = true; } else ctx.lineTo(p.x, p.y);
    }
    if (close) ctx.closePath();
  }
  at(x, z, y = 0.6) { const R = this.g.renderer, h = Math.max(0, R.sim.map.hAt(x, z)); return R.project(x, h + y, z, this._q); }
  draw(ctx, W, H, time) {
    const g = this.g, R = g.renderer, sim = g.sim, team = sim.players[g.local].team, map = sim.map;
    ctx.save(); ctx.globalCompositeOperation = 'destination-over';
    ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    const label = (txt, x, y, col) => { ctx.fillStyle = 'rgba(0,0,0,.55)'; const w = ctx.measureText(txt).width + 8; ctx.fillRect(x - w / 2, y - 9, w, 14); ctx.fillStyle = 'rgb(' + col + ')'; ctx.fillText(txt, x, y + 2); };
    // ---- top layer first (destination-over): legend, contact markers, labels
    const leg = [['Radar', COL.radar], ['Jammer', COL.jam], ['Radar contact', COL.contact], ['Enemy emitter', COL.radarEn]];
    ctx.textAlign = 'left'; let lx = W / 2 - 190, ly = 66;
    for (const [t, c] of leg) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(lx - 4, ly - 11, ctx.measureText(t).width + 26, 16); ctx.fillStyle = 'rgb(' + c + ')'; ctx.fillRect(lx, ly - 6, 8, 8); ctx.fillStyle = '#dfe9f2'; ctx.fillText(t, lx + 13, ly + 2); lx += ctx.measureText(t).width + 34; }
    ctx.textAlign = 'center';
    // contacts held by radar
    for (const id of sim.contact[team]) {
      const e = sim.byId.get(id); if (!e || e.dead) continue;
      const vis = sim.seen(team, e), p = this.at(e.x, e.z, DEFS[e.def].alt || 20); if (p.behind) continue;
      const col = vis ? COL.ident : COL.contact, s = 7;
      ctx.strokeStyle = 'rgb(' + col + ')'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x + s, p.y); ctx.lineTo(p.x, p.y + s); ctx.lineTo(p.x - s, p.y); ctx.closePath(); ctx.stroke();
      const vx = e.vx || 0, vz = e.vz || 0, q = R.project(e.x + vx * 4, Math.max(0, map.hAt(e.x, e.z)) + (DEFS[e.def].alt || 20), e.z + vz * 4, this._p);
      if (!q.behind) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
      const big = (DEFS[e.def].rcs || 1) > 1.4 ? 'LARGE' : (DEFS[e.def].rcs || 1) < 0.5 ? 'SMALL' : 'MED';
      label(vis ? DEFS[e.def].name : 'BOGEY · ' + big + ' · ' + Math.round(Math.sqrt(vx * vx + vz * vz) * 3.6) + ' km/h', p.x, p.y - s - 6, col);
    }
    // ground-surveillance tracks and coverage
    for (const g of sim.gradars) {
      const e = sim.byId.get(g.id); if (!e || (g.team !== team && !sim.seen(team, e))) continue; const own = g.team === team, col = own ? COL.radar : COL.radarEn, jammed = g.r < g.r0 - 0.5;
      ctx.lineWidth = 1.6; ctx.setLineDash([10, 6]); ctx.strokeStyle = 'rgba(' + col + ',.8)'; this.ring(ctx, e.x, e.z, g.r); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(' + col + ',.035)'; this.ring(ctx, e.x, e.z, g.r, 0, TAU, true); ctx.fill();
      const lp = this.at(e.x + Math.sin(0.6) * g.r, e.z + Math.cos(0.6) * g.r); if (!lp.behind) label('GROUND SURVEILLANCE ' + Math.round(g.r) + (jammed ? ' (jammed)' : ''), lp.x, lp.y, jammed ? COL.warn : col);
    }
    for (const id of sim.gcontact[team]) {
      const e = sim.byId.get(id); if (!e || e.dead || sim.seen(team, e)) continue; const p = this.at(e.x, e.z, 1.2); if (p.behind) continue;
      ctx.strokeStyle = 'rgb(' + COL.contact + ')'; ctx.lineWidth = 1.4; ctx.strokeRect(p.x - 4, p.y - 4, 8, 8);
    }
    // our own aircraft that are being jammed
    for (const v of R.views.values()) {
      const e = v.ent; if (e.dead || e.team !== team || !(e.jam > 0) || !(e.air || DEFS[e.def].drone)) continue;
      const p = this.at(e.x, e.z, (DEFS[e.def].alt || 2) + 3); if (p.behind) continue;
      label('JAMMED ' + '▮'.repeat(Math.min(4, Math.ceil(e.jam))), p.x, p.y - 4, COL.warn);
    }
    // ---- emitters
    ctx.textAlign = 'center';
    for (const j of sim.jammers) {
      const e = sim.byId.get(j.id); if (!e) continue; const own = j.team === team; if (!own && !sim.seen(team, e)) continue;
      const col = own ? COL.jam : COL.jamEn, r = j.r;
      ctx.setLineDash([5, 4]); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(' + col + ',.85)'; this.ring(ctx, e.x, e.z, r); ctx.stroke();
      ctx.fillStyle = 'rgba(' + col + ',.07)'; this.ring(ctx, e.x, e.z, r, 0, TAU, true); ctx.fill(); ctx.setLineDash([]);
      const p = this.at(e.x, e.z + r, 0.6); if (!p.behind) label('ECM ' + Math.round(r) + (DEFS[e.def].spy ? '' : '') + ' · P' + j.power, p.x, p.y, col);
    }
    for (const s of sim.radars) {
      const e = sim.byId.get(s.id); if (!e) continue; const own = s.team === team; if (!own && !sim.seen(team, e)) continue;
      const col = own ? COL.radar : COL.radarEn, jammed = s.r < s.r0 - 0.5;
      ctx.lineWidth = 1.6;
      let a0 = 0, a1 = TAU, hd = 0;
      if (s.arc > -1) { hd = Math.atan2(s.dx, s.dz); const half = Math.acos(Math.min(1, s.arc)); a0 = hd - half; a1 = hd + half; }
      // nominal range (dashed) when jammed, effective range solid
      if (jammed) { ctx.setLineDash([3, 5]); ctx.strokeStyle = 'rgba(' + COL.warn + ',.8)'; this.ring(ctx, e.x, e.z, s.r0, a0, a1, s.arc > -1); ctx.stroke(); ctx.setLineDash([]); }
      ctx.strokeStyle = 'rgba(' + col + ',.9)'; this.ring(ctx, e.x, e.z, s.r, a0, a1, s.arc > -1); ctx.stroke();
      if (s.arc > -1) { ctx.fillStyle = 'rgba(' + col + ',.10)'; const o = this.at(e.x, e.z); ctx.beginPath(); ctx.moveTo(o.x, o.y); const R2 = s.r; for (let i = 0; i <= 12; i++) { const a = a0 + (a1 - a0) * i / 12, q = this.at(e.x + Math.sin(a) * R2, e.z + Math.cos(a) * R2); ctx.lineTo(q.x, q.y); } ctx.closePath(); ctx.fill(); }
      else { ctx.fillStyle = 'rgba(' + col + ',.05)'; this.ring(ctx, e.x, e.z, s.r, 0, TAU, true); ctx.fill(); }
      // rotating / scanning beam
      const ang = s.arc > -1 ? hd + Math.sin(time * 2.4 + s.id) * (a1 - a0) / 2 : (time * 1.6 + s.id) % TAU, o = this.at(e.x, e.z), q = this.at(e.x + Math.sin(ang) * s.r, e.z + Math.cos(ang) * s.r);
      if (!o.behind && !q.behind) { ctx.strokeStyle = 'rgba(' + col + ',.75)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
      const lp = this.at(e.x + Math.sin(hd + (s.arc > -1 ? 0 : 0.6)) * s.r, e.z + Math.cos(hd + (s.arc > -1 ? 0 : 0.6)) * s.r);
      if (!lp.behind) label((e.kind === 'building' ? 'RADAR ' : s.air ? 'AIR RADAR ' : 'RADAR ') + Math.round(s.r) + (jammed ? ' (jammed)' : ''), lp.x, lp.y, jammed ? COL.warn : col);
    }
    // ---- dim the world behind everything
    ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = 'rgba(3,12,22,.34)'; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}
