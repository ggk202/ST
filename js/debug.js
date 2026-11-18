// Solo debug sandbox (skirmish setup -> "Debug sandbox: On"): spawn any unit or building for any team, force weather and time of day, grant resources.
// Everything goes through the sim's `dbg` command, which the sim ignores unless cfg.debug is set (never true in multiplayer).
import { UNITS, BUILDINGS, BASE_ORDER, BUILD_CATS } from './sim/defs.js';

const WX = [['Clear', 0], ['Overcast', 1], ['Fog', 2], ['Rain', 3], ['Storm', 4]];
export class DebugPanel {
  constructor(g) {
    this.g = g; this.team = g.local; this.def = 'rifleman'; this.n = 1;
    const el = this.el = document.getElementById('dbgPanel'); el.classList.remove('hidden');
    const unitOpts = BASE_ORDER.map((k) => `<optgroup label="${(UNITS[k] || {}).name || k}">` + [k, k + '2', k + '3'].filter((id) => UNITS[id]).map((id) => `<option value="${id}">${UNITS[id].name || id}${id.endsWith('2') ? ' II' : id.endsWith('3') ? ' III' : ''}</option>`).join('') + '</optgroup>').join('');
    const bld = BUILD_CATS.flatMap((c) => c[2]).filter((id) => BUILDINGS[id]).map((id) => `<option value="${id}">${BUILDINGS[id].name || id}</option>`).join('');
    const teams = g.sim.players.map((p, i) => `<option value="${i}">${i === g.local ? 'You' : p.name}</option>`).join('');
    el.innerHTML = `<div class="dh">DEBUG <button id="dbgX" title="Collapse">–</button></div><div id="dbgBody">
      <label>Team <select id="dbgTeam">${teams}</select></label>
      <label>Spawn <select id="dbgDef"><optgroup label="Units">${unitOpts}</optgroup><optgroup label="Buildings">${bld}</optgroup></select></label>
      <label>Count <input id="dbgN" type="number" min="1" max="60" value="1"></label>
      <div class="r"><button id="dbgGo">Click to spawn</button><button id="dbgKill">Click to delete</button></div>
      <div class="r">${WX.map(([n, k]) => `<button data-wx="${k}">${n}</button>`).join('')}</div>
      <div class="r"><button data-nt="-1">Day/night auto</button><button data-nt="0">Day</button><button data-nt="1">Night</button></div>
      <div class="r"><button id="dbgMoney">+20k resources</button></div></div>`;
    const $ = (s) => el.querySelector(s);
    $('#dbgTeam').value = this.team; $('#dbgDef').value = this.def;
    $('#dbgTeam').onchange = (e) => { this.team = +e.target.value; };
    $('#dbgDef').onchange = (e) => { this.def = e.target.value; };
    $('#dbgN').onchange = (e) => { this.n = Math.max(1, Math.min(60, +e.target.value | 0 || 1)); e.target.value = this.n; };
    $('#dbgGo').onclick = () => g.controls.setMode({ t: 'dbgspawn' });
    $('#dbgKill').onclick = () => g.controls.setMode({ t: 'dbgkill' });
    $('#dbgX').onclick = () => { $('#dbgBody').classList.toggle('hidden'); };
    $('#dbgMoney').onclick = () => g.cmd({ t: 'dbg', op: 'money', o: this.team });
    el.querySelectorAll('[data-wx]').forEach((b) => { b.onclick = () => g.cmd({ t: 'dbg', op: 'wx', v: +b.dataset.wx }); });
    el.querySelectorAll('[data-nt]').forEach((b) => { b.onclick = () => g.cmd({ t: 'dbg', op: 'night', v: +b.dataset.nt }); });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
  place(x, z) { this.g.cmd({ t: 'dbg', op: 'spawn', def: this.def, o: this.team, n: this.n, x, z }); }
  dispose() { this.el.classList.add('hidden'); this.el.innerHTML = ''; }
}
