// GPU Tuner for the GTX 1660 Ti, Afterburner-style. Offsets apply on Apply.
// Turing boosts along a V/F curve; the offset shifts the whole curve. GDDR6 has
// error detection and retry, so an unstable memory clock first loses
// performance, then shows artifacts, then crashes the driver.
import { save } from '../state.js';
import { GPU } from '../hardware.js';
import { drawChart } from '../ui/chart.js';

const SLIDERS = [
  ['voltage', 'Core Voltage (%)', 0, 100, 1, 'Unlocks the last V/F points up to 1.093 V. Adds heat for a few MHz.'],
  ['power', 'Power Limit (%)', 50, GPU.powerLimitMaxPct, 1, `100% = ${GPU.tdpW} W. Max ${GPU.powerLimitMaxPct}% is assumed for this card (ASUS does not publish it).`],
  ['temp', 'Temp. Limit (°C)', 60, 88, 1, 'The card drops boost bins above this temperature.'],
  ['core', 'Core Clock (MHz)', -400, 300, 5, 'Offset added to every point of the V/F curve.'],
  ['mem', 'Memory Clock (MHz)', -500, 1500, 25, 'Afterburner units: +1000 takes GDDR6 from 12 Gbps to 14 Gbps.'],
];

export default {
  id: 'gputuner', title: 'GPU Tuner', icon: 'ti-device-desktop-bolt', color: '#e5484d', w: 720, h: 560,
  mount(body, { sim, state, notify }) {
    const draft = { ...state.gpuTune };
    body.innerHTML = `
      <div class="app-pad" style="background:#1b1d22;color:#e6e6e6">
        <div class="app-row" style="justify-content:space-between"><b>${GPU.name}</b><span class="mono gt-drv">NVIDIA driver (simulated)</span></div>
        <div class="gt-mon mono" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px"></div>
        <div class="gt-sliders" style="display:grid;gap:10px"></div>
        <div class="app-row">
          <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" class="gt-fanauto" ${draft.fan === 'auto' ? 'checked' : ''}> Fan auto</label>
          <input type="range" class="gt-fan" min="30" max="100" value="${draft.fanPct}" ${draft.fan === 'auto' ? 'disabled' : ''} style="flex:1">
          <span class="gt-fanv mono">${draft.fanPct}%</span>
        </div>
        <div class="app-row"><button class="gt-apply default">Apply</button><button class="gt-reset">Reset</button><span class="gt-msg"></span></div>
        <canvas class="chart gt-chart"></canvas>
      </div>`;
    const $ = s => body.querySelector(s);
    $('.gt-sliders').innerHTML = SLIDERS.map(([k, label, min, max, step, tip]) => `
      <div title="${tip}" style="display:grid;grid-template-columns:150px 1fr 70px;gap:10px;align-items:center">
        <label for="gt-${k}">${label}</label>
        <input type="range" id="gt-${k}" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${draft[k]}">
        <span class="mono" data-v="${k}">${draft[k] > 0 && (k === 'core' || k === 'mem') ? '+' : ''}${draft[k]}</span>
      </div>`).join('');
    body.addEventListener('input', e => {
      const k = e.target.dataset.k;
      if (k) { draft[k] = Number(e.target.value); $(`[data-v=${k}]`).textContent = `${draft[k] > 0 && (k === 'core' || k === 'mem') ? '+' : ''}${draft[k]}`; }
      if (e.target.classList.contains('gt-fan')) { draft.fanPct = Number(e.target.value); $('.gt-fanv').textContent = `${draft.fanPct}%`; }
    });
    $('.gt-fanauto').onchange = e => { draft.fan = e.target.checked ? 'auto' : 'manual'; $('.gt-fan').disabled = e.target.checked; };
    $('.gt-apply').onclick = () => { Object.assign(state.gpuTune, draft); save('gpuTune'); $('.gt-msg').textContent = 'Applied.'; notify('GPU Tuner', 'Settings applied.'); };
    $('.gt-reset').onclick = () => {
      Object.assign(draft, { core: 0, mem: 0, power: 100, temp: 83, fan: 'auto', fanPct: 50, voltage: 0 });
      Object.assign(state.gpuTune, draft); save('gpuTune');
      body.querySelectorAll('[data-k]').forEach(i => { i.value = draft[i.dataset.k]; $(`[data-v=${i.dataset.k}]`).textContent = draft[i.dataset.k]; });
      $('.gt-msg').textContent = 'Reset to defaults.';
    };
    const off = sim.on(ev => {
      if (ev.type !== 'tick') return;
      const s = ev.snap, g = s.gpu;
      const cell = (k, v) => `<div style="background:#111;padding:6px 8px;border:1px solid #333"><div style="color:#8b949e;font-size:10px">${k}</div><div style="font-size:15px">${v}</div></div>`;
      $('.gt-mon').innerHTML = [
        cell('GPU clock', `${g.f} MHz`), cell('Memory clock', `${(g.memMT / 2).toFixed(0)} MHz`), cell('GPU voltage', `${g.v.toFixed(3)} V`), cell('Temperature', `${s.temps.gpu.toFixed(0)} °C`),
        cell('Power', `${g.power.toFixed(0)} W (${(g.power / GPU.tdpW * 100).toFixed(0)}%)`), cell('Fan', `${(s.fans.gpu * 100).toFixed(0)}% / ${s.gpuRpm} RPM`), cell('Limit', g.limiter), cell('Mem bandwidth', `${g.bw.toFixed(1)} GB/s`),
      ].join('');
      drawChart($('.gt-chart'), [{ data: sim.hist.gpuF ?? [], color: '#e5484d' }], { min: 0, max: 2200 });
    });
    return off;
  },
};
