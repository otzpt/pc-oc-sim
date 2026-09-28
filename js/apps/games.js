// Games run as the real web versions in an iframe. The FPS overlay is simulated:
// it shows what this PC would get, from the clocks, memory latency and
// throttling the simulation reports, not the browser's real frame rate.
import { memPerf } from '../model.js';
import { drawChart } from '../ui/chart.js';

// Per-game baselines at stock settings (5700X + GTX 1660 Ti, 1080p). SIM estimates.
//   cpu: frames/s when CPU-bound at 4.6 GHz and 72 ns memory latency
//   gpu: frames/s when GPU-bound at 1890 MHz and 288 GB/s
//   latSens: how much memory latency matters (Minecraft-style engines are very sensitive)
const PROFILES = {
  doom: { cpu: 1450, gpu: 4200, latSens: 0.6, cap35: true, note: 'Chocolate Doom port (Cloudflare doom-wasm, GPL-2.0), shareware episode.' },
  minecraft: { cpu: 380, gpu: 820, latSens: 1.4, note: 'Minecraft Classic, the official free browser version by Mojang.' },
  hexgl: { cpu: 520, gpu: 190, latSens: 0.3, note: 'HexGL by Thibaut Despoulain (MIT), a WebGL racing game.' },
};

function fpsFor(p, snap, cfg, capped) {
  const lat = memPerf(cfg.mem).latency;
  const cpuF = snap.cpu.fAvgActive || snap.cpu.fMax;
  const cpuFps = p.cpu * (cpuF / 4.6) * (1 - (lat - 72) * 0.006 * p.latSens) * (cfg.cpu.smt ? 1 : 0.94);
  const gpuFps = p.gpu * (0.72 * snap.gpu.f / 1890 + 0.28 * snap.gpu.bw / 288);
  let fps = Math.min(cpuFps, gpuFps);
  const bound = cpuFps < gpuFps ? 'CPU' : 'GPU';
  if (capped) fps = Math.min(fps, 35);
  return { fps, bound, lat, gpuFps };
}

// Open game windows; the game load stays on until the last one closes.
let open = 0;

function makeGame(id, title, icon, color, url, w, h) {
  return {
    id, title, icon, color, w, h,
    mount(body, { sim, notify }) {
      const p = PROFILES[id];
      body.style.background = '#000';
      body.innerHTML = `
        <div class="game-wrap">
          <iframe title="${title}" src="${url}" allow="autoplay; fullscreen; gamepad" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
          <div class="osd" aria-live="off"></div>
          <canvas class="osd-graph" width="180" height="40" aria-hidden="true"></canvas>
          <div class="game-tdr" hidden>Display driver stopped responding and has recovered.</div>
        </div>
        <div class="game-bar">
          <label><input type="checkbox" class="g-osd" checked> FPS overlay</label>
          ${p.cap35 ? '<label title="The original Doom engine runs its game logic and rendering at 35 tics per second"><input type="checkbox" class="g-cap"> Vanilla 35 Hz cap</label>' : ''}
          <span class="g-note">${p.note}</span>
        </div>`;
      const osd = body.querySelector('.osd');
      const graph = body.querySelector('.osd-graph');
      const tdrBox = body.querySelector('.game-tdr');
      const frames = [];
      open++;
      sim.setLoad({ cpu: 'game', gpu: true, mem: false, core: undefined });

      const off = sim.on(ev => {
        if (ev.type === 'tdr') {
          tdrBox.hidden = false;
          setTimeout(() => { tdrBox.hidden = true; }, 2500);
        }
        if (ev.type !== 'tick') return;
        const s = ev.snap;
        const capped = body.querySelector('.g-cap')?.checked;
        const r = fpsFor(p, s, sim.cfg, capped);
        // Frame-to-frame jitter; worse when the CPU is throttling or near its limits.
        const jitter = 1 + (Math.random() - 0.5) * (s.throttle ? 0.22 : 0.06);
        const fps = Math.max(1, r.fps * jitter);
        frames.push(1000 / fps);
        if (frames.length > 120) frames.shift();
        const sorted = [...frames].sort((a, b) => b - a);
        const low1 = 1000 / (sorted[Math.max(0, Math.floor(sorted.length * 0.01))] ?? 16);
        const show = body.querySelector('.g-osd').checked;
        osd.hidden = !show; graph.hidden = !show;
        if (!show) return;
        osd.innerHTML = `
          <div><b class="o-g">GPU</b> ${Math.min(99, Math.round(100 * fps / r.gpuFps))}%  ${s.gpu.f} MHz  ${s.temps.gpu.toFixed(0)}°C  ${s.gpu.power.toFixed(0)} W</div>
          <div><b class="o-c">CPU</b> ${(s.cpu.fAvgActive * 1000).toFixed(0)} MHz  ${s.temps.tctl.toFixed(0)}°C  ${s.cpu.pkg.toFixed(0)} W</div>
          <div><b class="o-m">RAM</b> DDR4-${sim.cfg.mem.mt}  ${r.lat.toFixed(1)} ns</div>
          <div class="o-fps">${fps.toFixed(0)} <small>FPS</small>  ${(1000 / fps).toFixed(1)} <small>ms</small></div>
          <div><small>1% low ${low1.toFixed(0)}  ${capped ? 'engine cap' : `${r.bound}-bound`}${s.throttle ? `  ${s.throttle} throttling` : ''}</small></div>`;
        drawChart(graph, [{ data: frames, color: '#9cff57' }], { min: 0, max: Math.max(20, ...frames) * 1.2, grid: 1 });
      });
      notify(title, 'Game load started: CPU and GPU are now working like in a real game.');
      return () => { off(); if (--open === 0) sim.setLoad({ cpu: 'light', gpu: false }); };
    },
  };
}

export const doom = makeGame('doom', 'DOOM', 'ti-skull', '#d23b2a', 'https://silentspacemarine.com/', 820, 560);
export const minecraft = makeGame('minecraft', 'Minecraft Classic', 'ti-cube', '#5fae3b', 'https://classic.minecraft.net/', 900, 600);
export const hexgl = makeGame('hexgl', 'HexGL', 'ti-steering-wheel', '#3ab4ff', 'https://hexgl.bkcore.com/play/', 900, 600);
