// Benchmarks. Scores come from the live simulation (clocks actually held
// during the run), so throttling and memory tuning change the result.
import { memPerf } from '../model.js';
import { save } from '../state.js';
import { esc } from '../ui/esc.js';

const RUNS = {
  cbMulti: { name: 'CPU Render, multi thread', secs: 20, load: { cpu: 'cb', gpu: false } },
  cbSingle: { name: 'CPU Render, single thread', secs: 20, load: { cpu: 'single', gpu: false } },
  ts: { name: '3D (Time Spy-class, 1440p DX12)', secs: 30, load: { cpu: 'game', gpu: true } },
  mem: { name: 'Memory read/write/copy/latency', secs: 6, load: { cpu: 'memtest', gpu: false, mem: true } },
  disk: { name: 'Storage (NVMe)', secs: 8, load: { cpu: 'light', gpu: false } },
};

function configTag(state) {
  const c = state.cmos;
  const parts = [];
  parts.push(c.ratio !== 'Auto' ? `${Number(c.ratio).toFixed(2)}x ${c.vcoreMode === 'Override Mode' ? Number(c.vcore).toFixed(3) + 'V' : c.vcoreMode}` : c.PBO === 'Auto' || c.PBO === 'Disabled' ? 'Stock PB' : `PBO ${c.PBO}${c.coMode !== 'Disable' ? ` CO ${c.coMode === 'All Cores' ? (c.coSignAll === 'Negative' ? '-' : '+') + c.coMagAll : 'per-core'}` : ''}`);
  parts.push(`${c.dramFreq === 'Auto' ? (c.axmp === 'Profile 1' ? 'XMP 3200' : 'JEDEC 2133') : c.dramFreq}${c.tCL !== 'Auto' ? ` CL${c.tCL}` : ''}`);
  const g = state.gpuTune;
  if (g.core || g.mem || g.power !== 100) parts.push(`GPU ${g.core >= 0 ? '+' : ''}${g.core}/${g.mem >= 0 ? '+' : ''}${g.mem} PL${g.power}%`);
  return parts.join(' | ');
}

export default {
  id: 'bench', title: 'Benchmarks', icon: 'ti-chart-bar', color: '#3fb950', w: 860, h: 580,
  mount(body, { sim, state }) {
    body.innerHTML = `
      <section class="tabs app-pad" style="padding:8px">
        <menu role="tablist">
          <button role="tab" aria-selected="true" data-tab="run">Run</button>
          <button role="tab" data-tab="hist">Results history</button>
        </menu>
        <article role="tabpanel" class="bn-run" style="display:flex;flex-direction:column;gap:10px;flex:1;min-height:0;overflow:auto">
          <div class="app-row">${Object.entries(RUNS).map(([k, r]) => `<button data-run="${k}">${r.name}</button>`).join('')}</div>
          <div class="bn-stage" style="display:grid;grid-template-columns:repeat(16,1fr);gap:2px;height:120px;background:#111;padding:4px"></div>
          <div role="progressbar" class="bn-prog"><div style="width:0%"></div></div>
          <div class="bn-out mono" style="font-size:12px;white-space:pre-wrap;background:#fff;border:1px solid #bbb;padding:8px;min-height:120px">Pick a benchmark. Scores depend on the clocks the CPU and GPU actually hold during the run.</div>
        </article>
        <article role="tabpanel" class="bn-hist" hidden style="overflow:auto;flex:1"></article>
      </section>`;
    const $ = s => body.querySelector(s);
    const tiles = Array.from({ length: 96 }, () => { const d = document.createElement('div'); d.style.background = '#222'; $('.bn-stage').appendChild(d); return d; });
    let active = null;

    function history() {
      const rows = state.bench.slice().reverse();
      $('.bn-hist').innerHTML = `<table class="kv"><tr><th>When</th><th>Test</th><th>Result</th><th>Config</th></tr>${rows.map(r => `<tr><td>${esc(r.when)}</td><td>${esc(r.test)}</td><td class="num">${esc(r.result)}</td><td>${esc(r.cfg)}</td></tr>`).join('') || '<tr><td colspan="4">No results yet</td></tr>'}</table>
      <div class="app-row" style="margin-top:8px"><button class="bn-clear">Clear history</button></div>`;
    }
    body.addEventListener('click', e => {
      const t = e.target.closest('[data-tab]');
      if (t) {
        body.querySelectorAll('[role=tab]').forEach(b => b.setAttribute('aria-selected', b === t));
        $('.bn-run').hidden = t.dataset.tab !== 'run';
        $('.bn-hist').hidden = t.dataset.tab !== 'hist';
        if (t.dataset.tab === 'hist') history();
      }
      if (e.target.closest('.bn-clear')) { state.bench = []; save('bench'); history(); }
      const r = e.target.closest('[data-run]');
      if (r && !active) start(r.dataset.run);
    });

    function start(key) {
      const spec = RUNS[key];
      active = { key, spec, t0: sim.t, n: 0, sumAll: 0, sumOne: 0, sumGpuF: 0, sumBw: 0, sumCpu: 0 };
      sim.setLoad({ ...spec.load, core: undefined });
      sim.setSpeed(1);
      body.querySelectorAll('[data-run]').forEach(b => { b.disabled = true; });
      tiles.forEach(t => { t.style.background = '#222'; });
      $('.bn-out').textContent = `Running ${spec.name}...`;
    }
    function finish(errorMsg) {
      const a = active;
      active = null;
      sim.setLoad({ cpu: 'light', gpu: false, mem: false });
      body.querySelectorAll('[data-run]').forEach(b => { b.disabled = false; });
      if (errorMsg) { $('.bn-out').textContent = errorMsg; return; }
      const s = sim.snap;
      const cfg = sim.cfg;
      const mp = memPerf(cfg.mem);
      const memF = 1 - (mp.latency - 72) * 0.0008;
      let text = '', result = '';
      if (a.key === 'cbMulti') {
        const score = a.sumAll / a.n * 419 * (cfg.cpu.smt ? 1 : 0.8) * memF;
        result = `${Math.round(score)} pts`;
        text = `CPU (Multi Core): ${Math.round(score)} pts\nAverage all-core clock held: ${(a.sumAll / a.n / cfg.cpu.cores * 1000).toFixed(0)} MHz\nReference: stock Ryzen 7 5700X scores about 13,200 (cpu-monkey).`;
      } else if (a.key === 'cbSingle') {
        const score = a.sumOne / a.n * 326 * (1 - (mp.latency - 72) * 0.001);
        result = `${Math.round(score)} pts`;
        text = `CPU (Single Core): ${Math.round(score)} pts\nAverage single-core clock: ${(a.sumOne / a.n * 1000).toFixed(0)} MHz\nReference: stock Ryzen 7 5700X scores about 1,500 (cpu-monkey).`;
      } else if (a.key === 'ts') {
        const gF = a.sumGpuF / a.n, bw = a.sumBw / a.n;
        const gpuScore = 6300 * (0.7 * gF / 1890 + 0.3 * bw / 288);
        const cpuScore = (a.sumCpu / a.n) * 2550 * (1 - (mp.latency - 72) * 0.004) * (cfg.cpu.smt ? 1 : 0.72) * (cfg.cpu.cores / 8);
        const total = 1 / (0.85 / gpuScore + 0.15 / cpuScore);
        result = `${Math.round(total)} (G ${Math.round(gpuScore)} / C ${Math.round(cpuScore)})`;
        text = `Score: ${Math.round(total)}\nGraphics score: ${Math.round(gpuScore)}   Graphics test 1: ${(gpuScore / 6300 * 41.5).toFixed(2)} FPS   Graphics test 2: ${(gpuScore / 6300 * 35.8).toFixed(2)} FPS\nCPU score: ${Math.round(cpuScore)}\nAverage GPU clock: ${gF.toFixed(0)} MHz   Memory bandwidth: ${bw.toFixed(1)} GB/s\nReference: a stock GTX 1660 Ti scores about 6,300 graphics.`;
      } else if (a.key === 'mem') {
        const j = () => 1 + (Math.random() - 0.5) * 0.01;
        const f = s.cpu.fMax;
        result = `${mp.latency.toFixed(1)} ns, ${(mp.read * 1000).toFixed(0)} MB/s read`;
        text = `Memory   Read ${(mp.read * 1000 * j()).toFixed(0)} MB/s   Write ${(mp.write * 1000 * j()).toFixed(0)} MB/s   Copy ${(mp.copy * 1000 * j()).toFixed(0)} MB/s   Latency ${(mp.latency * j()).toFixed(1)} ns
L3 Cache Latency ${(46 / f).toFixed(1)} ns   L2 ${(12 / f).toFixed(1)} ns   L1 ${(4 / f).toFixed(1)} ns
DDR4-${cfg.mem.mt} ${cfg.mem.t.cl}-${cfg.mem.t.rcdrd}-${cfg.mem.t.rp}-${cfg.mem.t.ras} ${cfg.mem.cmd}  FCLK ${cfg.mem.fclk} MHz  ${cfg.mem.sync ? 'UCLK=MCLK=FCLK' : 'decoupled'}
Write bandwidth is capped at 16 bytes per FCLK cycle on a single-CCD Zen 3 part.`;
      } else if (a.key === 'disk') {
        const gen = { Auto: 3, Gen3: 3, Gen2: 2, Gen1: 1 }[state.cmos.m2Gen] ?? 3;
        const cap = { 1: 900, 2: 1800, 3: 3550 }[gen];
        const j = x => Math.round(x * (1 + (Math.random() - 0.5) * 0.02));
        const rows = [['SEQ1M Q8T1', Math.min(cap, 5000), Math.min(cap * 0.93, 3900)], ['SEQ1M Q1T1', Math.min(cap * 0.7, 2600), Math.min(cap * 0.8, 2900)], ['RND4K Q32T16', Math.min(cap * 0.55, 1900), Math.min(cap * 0.6, 2100)], ['RND4K Q1T1', 68, 190]];
        result = `SEQ ${j(rows[0][1])} / ${j(rows[0][2])} MB/s`;
        text = `KIOXIA EXCERIA PLUS G3 1TB on M2_1 (PCIe Gen${gen} x4)\n${rows.map(([n, r, w]) => `${n.padEnd(14)} Read ${String(j(r)).padStart(5)} MB/s   Write ${String(j(w)).padStart(5)} MB/s`).join('\n')}\nRated 5000/3900 MB/s on PCIe 4.0; this board's M.2 slot is PCIe 3.0 x4, so sequential speed tops out near 3.5 GB/s. Random figures are estimates.`;
      }
      $('.bn-out').textContent = text;
      state.bench.push({ when: new Date().toLocaleString('pt-PT'), test: a.spec.name, result, cfg: configTag(state) });
      if (state.bench.length > 100) state.bench.shift();
      save('bench');
    }

    const off = sim.on(ev => {
      if (!active) return;
      if (ev.type === 'tick') {
        const s = ev.snap;
        active.n++;
        active.sumAll += s.cpu.cores.filter(c => c.active).reduce((x, c) => x + c.f, 0);
        active.sumOne += s.cpu.fMax;
        active.sumGpuF += s.gpu.f;
        active.sumBw += s.gpu.bw;
        active.sumCpu += s.cpu.fAvgActive;
        const p = Math.min(1, (sim.t - active.t0) / active.spec.secs);
        $('.bn-prog div').style.width = `${(p * 100).toFixed(0)}%`;
        const done = Math.floor(p * tiles.length);
        tiles.forEach((t, i) => { t.style.background = i < done ? `hsl(${(i * 37) % 360} 45% 45%)` : i === done ? '#e8e8e8' : '#222'; });
        if (p >= 1) finish();
      }
      if (ev.type === 'cpuError') finish('The benchmark stopped: a calculation returned a wrong result. The CPU is not stable at these settings.');
      if (ev.type === 'tdr') finish('The benchmark stopped: the display driver reset. The GPU overclock is not stable.');
    });
    return () => { off(); if (active) sim.setLoad({ cpu: 'light', gpu: false, mem: false }); };
  },
};
