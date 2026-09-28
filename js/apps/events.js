// Event Viewer: WHEA-Logger history. Survives reboots, like the real System log.
import { esc } from '../ui/esc.js';
import { save } from '../state.js';

export default {
  id: 'events', title: 'Event Viewer', icon: 'ti-list-search', color: '#9aa7b5', w: 640, h: 420, desktop: false,
  mount(body, { state }) {
    const render = () => {
      const rows = state.whea.slice().reverse();
      body.innerHTML = `<div class="app-row" style="padding:6px"><b>System log: WHEA-Logger</b><button class="ev-clear" style="margin-left:auto">Clear log</button></div>
        <div style="flex:1;overflow:auto"><table class="kv"><tr><th>Level</th><th>Date and Time</th><th>Event ID</th><th>Description</th></tr>
        ${rows.map(r => `<tr><td class="${r.id === 18 ? 'bad' : 'warnc'}">${r.id === 18 ? 'Error' : 'Warning'}</td><td>${esc(new Date(r.at).toLocaleString('pt-PT'))}</td><td class="num">${r.id}</td><td>${esc(r.text)}</td></tr>`).join('') || '<tr><td colspan="4">No WHEA events. The system has not logged any hardware errors.</td></tr>'}
        </table></div>
        <p style="margin:6px;color:#555">Event 19 = corrected error (usually FCLK/Infinity Fabric). Event 18 = uncorrectable error that reset the machine (usually Vcore or Curve Optimizer).</p>`;
      body.querySelector('.ev-clear').onclick = () => { state.whea.length = 0; save('whea'); render(); };
    };
    render();
  },
};
