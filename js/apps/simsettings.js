// Control Panel: simulation settings that are not BIOS settings.
import { save, rerollSilicon } from '../state.js';

export default {
  id: 'simsettings', title: 'Control Panel', icon: 'ti-adjustments', color: '#58a6ff', w: 520, h: 420, desktop: false,
  mount(body, { state, notify }) {
    const render = () => {
      body.innerHTML = `<div class="app-pad">
        <fieldset><legend>Room</legend>
          <div class="field-row"><label for="cp-amb">Ambient temperature</label><input type="range" id="cp-amb" min="15" max="38" value="${state.settings.ambient}"><span class="mono cp-ambv">${state.settings.ambient} °C</span></div>
          <p style="margin:6px 0 0;color:#555">Every degree of room temperature lands on the CPU, VRM and GPU. Summer can break an OC that passed in winter.</p>
        </fieldset>
        <fieldset><legend>Silicon lottery</legend>
          <p style="margin:0 0 8px;color:#555">Each simulated chip has hidden quality: per-core Curve Optimizer headroom, max FCLK, memory controller and DRAM quality, and GPU core/memory limits. Swapping the chip is like buying another 5700X and 1660 Ti.</p>
          <button class="cp-roll">Install a different CPU, GPU and RAM kit</button>
        </fieldset>
        <fieldset><legend>About</legend>
          <p style="margin:0;color:#555">VOID 7 is a simulation. Models are calibrated against public reviews (Cinebench R23, Time Spy, AIDA64-class figures) but are not measurements of real hardware.</p>
        </fieldset>
      </div>`;
      body.querySelector('#cp-amb').oninput = e => { state.settings.ambient = Number(e.target.value); body.querySelector('.cp-ambv').textContent = `${e.target.value} °C`; save('settings'); };
      body.querySelector('.cp-roll').onclick = () => { rerollSilicon(); notify('Hardware changed', 'New silicon installed. Your BIOS settings may no longer be stable.'); };
    };
    render();
  },
};
