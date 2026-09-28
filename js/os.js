// VOID 7 desktop: window manager, taskbar, start menu, notifications.
// Window chrome comes from 7.css (scoped under .win7).
import { APPS } from './apps/index.js';
import { sim } from './sim.js';
import { state } from './state.js';
import { orb } from './ui/orb.js';
import { esc } from './ui/esc.js';

export function openDesktop(root, host) {
  const scale = () => Number(document.getElementById('screen').dataset.scale || 1);
  root.innerHTML = `
    <div class="desk">
      <div class="desk-icons">${APPS.filter(a => a.desktop !== false).map(a => `<button class="desk-icon" data-open="${a.id}"><i class="ti ${a.icon}" style="color:${a.color}"></i><span>${esc(a.title)}</span></button>`).join('')}</div>
      <div class="desk-windows"></div>
      <div class="balloons"></div>
      <div class="startmenu glass" hidden>
        <div class="sm-left">
          ${APPS.map(a => `<button class="sm-item" data-open="${a.id}"><i class="ti ${a.icon}" style="color:${a.color}"></i><span>${esc(a.title)}</span></button>`).join('')}
          <input class="sm-search" placeholder="Search programs and files" aria-label="Search programs">
        </div>
        <div class="sm-right">
          <div class="sm-user"><i class="ti ti-user-circle"></i></div>
          <button data-open="sysinfo">Computer</button>
          <button data-open="sensors">Sensors</button>
          <button data-open="events">Event Viewer</button>
          <button data-open="simsettings">Control Panel</button>
          <div class="sm-power">
            <button class="sm-shut" data-power="shutdown">Shut down</button>
            <button class="sm-restart" data-power="restart" title="Restart"><i class="ti ti-refresh"></i></button>
          </div>
        </div>
      </div>
      <footer class="taskbar">
        <button class="start" aria-label="Start">${orb(34)}</button>
        <div class="tasks"></div>
        <div class="tray">
          <i class="ti ti-network" title="Network: Realtek RTL8111H, connected"></i>
          <i class="ti ti-volume" title="Speakers: Realtek ALC892"></i>
          <span class="tray-temp" title="CPU temperature"></span>
          <span class="clock"></span>
        </div>
      </footer>
    </div>`;

  const layer = root.querySelector('.desk-windows');
  const tasks = root.querySelector('.tasks');
  const start = root.querySelector('.startmenu');
  const balloons = root.querySelector('.balloons');
  const wins = new Map(); // id -> { el, task, cleanup, minimized }
  let z = 10;

  function notify(title, text, kind = 'info') {
    const b = document.createElement('div');
    b.className = `balloon-msg ${kind}`;
    b.innerHTML = `<b>${esc(title)}</b><span>${esc(text)}</span>`;
    balloons.appendChild(b);
    setTimeout(() => b.remove(), 6000);
  }

  function focus(id) {
    wins.forEach((w, k) => { w.el.classList.toggle('active', k === id); w.task.classList.toggle('on', k === id && !w.minimized); });
    const w = wins.get(id);
    if (w) w.el.style.zIndex = ++z;
  }

  function openApp(id, arg) {
    start.hidden = true;
    const app = APPS.find(a => a.id === id);
    if (!app) return;
    if (wins.has(id)) {
      const w = wins.get(id);
      w.minimized = false; w.el.hidden = false; focus(id);
      w.api?.receive?.(arg);
      return;
    }
    const el = document.createElement('div');
    el.className = 'window glass active app-win';
    const n = wins.size;
    Object.assign(el.style, { width: `${app.w}px`, height: `${app.h}px`, left: `${120 + n * 28}px`, top: `${20 + n * 24}px`, zIndex: ++z });
    el.innerHTML = `
      <div class="title-bar">
        <div class="title-bar-text"><i class="ti ${app.icon}"></i> ${esc(app.title)}</div>
        <div class="title-bar-controls">
          <button aria-label="Minimize"></button><button aria-label="Maximize"></button><button aria-label="Close"></button>
        </div>
      </div>
      <div class="window-body app-body"></div>`;
    layer.appendChild(el);
    const task = document.createElement('button');
    task.className = 'task on';
    task.innerHTML = `<i class="ti ${app.icon}" style="color:${app.color}"></i><span>${esc(app.title)}</span>`;
    tasks.appendChild(task);
    const body = el.querySelector('.app-body');
    const rec = { el, task, minimized: false, cleanup: null, api: null };
    wins.set(id, rec);
    const res = app.mount(body, { sim, state, notify, openApp, arg, setTitle: t => { el.querySelector('.title-bar-text').lastChild.textContent = ` ${t}`; } });
    rec.cleanup = typeof res === 'function' ? res : res?.cleanup;
    rec.api = typeof res === 'object' ? res : null;
    focus(id);

    const close = () => { rec.cleanup?.(); el.remove(); task.remove(); wins.delete(id); };
    el.querySelector('[aria-label=Close]').onclick = close;
    el.querySelector('[aria-label=Minimize]').onclick = () => { rec.minimized = true; el.hidden = true; task.classList.remove('on'); };
    el.querySelector('[aria-label=Maximize]').onclick = e => {
      const max = el.classList.toggle('maxed');
      e.currentTarget.setAttribute('aria-label', max ? 'Restore' : 'Maximize');
    };
    el.addEventListener('pointerdown', () => focus(id));
    task.onclick = () => {
      if (rec.minimized || !el.classList.contains('active')) { rec.minimized = false; el.hidden = false; focus(id); }
      else { rec.minimized = true; el.hidden = true; task.classList.remove('on'); }
    };

    // Drag by title bar; pointer deltas are divided by the monitor scale.
    const bar = el.querySelector('.title-bar');
    bar.addEventListener('pointerdown', e => {
      if (e.target.closest('button') || el.classList.contains('maxed')) return;
      const s = scale();
      const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop;
      bar.setPointerCapture(e.pointerId);
      const move = ev => {
        el.style.left = `${Math.max(-app.w + 80, Math.min(1200, ox + (ev.clientX - sx) / s))}px`;
        el.style.top = `${Math.max(0, Math.min(640, oy + (ev.clientY - sy) / s))}px`;
      };
      const up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
    });
    bar.addEventListener('dblclick', () => el.querySelector('.title-bar-controls button:nth-child(2)').click());
  }

  root.addEventListener('click', e => {
    const o = e.target.closest('[data-open]');
    if (o && !o.classList.contains('desk-icon')) openApp(o.dataset.open);
    const p = e.target.closest('[data-power]');
    if (p) { closeAll(); p.dataset.power === 'shutdown' ? shutdownSeq() : host.restart(); }
    if (e.target.closest('.start')) start.hidden = !start.hidden;
    else if (!e.target.closest('.startmenu')) start.hidden = true;
  });
  root.addEventListener('dblclick', e => {
    const o = e.target.closest('.desk-icon');
    if (o) openApp(o.dataset.open);
  });
  root.querySelector('.sm-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    root.querySelectorAll('.sm-left .sm-item').forEach(b => { b.hidden = q && !b.textContent.toLowerCase().includes(q); });
  });

  function closeAll() { wins.forEach(w => { w.cleanup?.(); }); wins.clear(); }
  function shutdownSeq() {
    root.querySelector('.desk').innerHTML = `<div class="shutting"><div class="spinner"></div><span>Shutting down...</span></div>`;
    setTimeout(host.shutdown, 1800);
  }

  // ACPI power button press from the case: short press = shut down.
  const acpi = () => { closeAll(); shutdownSeq(); };
  const scr = document.getElementById('screen');
  scr.addEventListener('acpi-power', acpi);

  // Taskbar clock + tray temp
  const clock = root.querySelector('.clock');
  const trayT = root.querySelector('.tray-temp');
  const tickClock = () => { const d = new Date(); clock.innerHTML = `${d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}<br>${d.toLocaleDateString('pt-PT')}`; };
  tickClock();
  const clockId = setInterval(tickClock, 10000);
  const off = sim.on(ev => {
    if (ev.type === 'tick') trayT.textContent = `${ev.snap.temps.tctl.toFixed(0)}°C`;
    if (ev.type === 'tdr') notify('Display driver recovered', ev.detail, 'warn');
    if (ev.type === 'whea19') notify('WHEA-Logger event 19', 'A corrected hardware error has occurred (Data Fabric). FCLK may be too high.', 'warn');
    if (ev.type === 'artifact') notify('GPU', 'Visual artifacts detected. Memory clock too high.', 'warn');
  });

  if (state.whea.length && state.whea[state.whea.length - 1].id === 18) {
    setTimeout(() => notify('VOID 7 recovered from an unexpected shutdown', 'Check Event Viewer for WHEA-Logger events.', 'warn'), 1500);
  }

  return () => { closeAll(); clearInterval(clockId); off(); scr.removeEventListener('acpi-power', acpi); };
}
