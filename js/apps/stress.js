// Stress Lab: stability tester in the style of OCCT / Prime95 / TM5 / CoreCycler.
// Runs the simulation under a chosen load, with time acceleration, and logs errors.
import { drawChart } from '../ui/chart.js';
import { esc } from '../ui/esc.js';

const TESTS = [
  { id: 'sfft', group: 'CPU', name: 'Small FFT AVX2', cpu: 'sfft', note: 'Prime95-style. Max heat and current. Catches Vcore/LLC too low for all-core OC.' },
  { id: 'linpack', group: 'CPU', name: 'Linpack AVX2', cpu: 'linpack', note: 'Heaviest load. Tests VRM and cooler limits as much as the CPU.' },
  { id: 'ycruncher', group: 'CPU', name: 'y-cruncher VST', cpu: 'ycruncher', note: 'Fast load changes. Good at finding Curve Optimizer and LLC transients.' },
  { id: 'cb', group: 'CPU', name: 'Render loop (Cinebench-class)', cpu: 'cb', note: 'Realistic all-core load. Passing this alone proves little.' },
  { id: 'cycler', group: 'CPU', name: 'Core Cycler (1 thread per core)', cpu: 'single', cycle: true, note: 'Moves one thread across cores. The right test for per-core Curve Optimizer values.' },
  { id: 'tm5', group: 'Memory', name: 'Memory test (TM5 anta777 extreme)', cpu: 'memtest', mem: true, note: 'Catches memory timing, voltage and termination errors. Also exercises the IMC.' },
  { id: 'gpu', group: 'GPU', name: '3D Adaptive', cpu: 'light', gpu: true, note: 'Loads the GTX 1660 Ti. Core OC shows as driver resets, memory OC as artifacts.' },
  { id: 'power', group: 'Power', name: 'CPU Linpack + GPU 3D', cpu: 'linpack', gpu: true, note: 'Worst-case system power and case heat.' },
];
const DURATIONS = [[600, '10 min'], [1800, '30 min'], [3600, '1 h'], [10800, '3 h'], [43200, '12 h'], [Infinity, 'Unlimited']];
const SPEEDS = [1, 10, 60, 300, 1200];

const hms = s => { s = Math.floor(s); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

export default {
  id: 'stress', title: 'Stress Lab', icon: 'ti-flame', color: '#ff7a1a', w: 940, h: 600,
  mount(body, { sim, state }) {
    body.innerHTML = `
      <div class="app-pad" style="flex-direction:row;gap:12px">
        <div style="width:300px;display:flex;flex-direction:column;gap:8px">
          <fieldset><legend>Test</legend>
            ${TESTS.map((t, i) => `<div class="field-row"><input type="radio" name="st-test" id="st-${t.id}" value="${t.id}" ${i === 0 ? 'checked' : ''}><label for="st-${t.id}"><b>${t.group}</b>: ${t.name}</label></div>`).join('')}
          </fieldset>
          <p class="st-note" style="margin:0;color:#444"></p>
          <div class="field-row"><label for="st-dur">Duration</label><select id="st-dur">${DURATIONS.map(([s, l], i) => `<option value="${s}" ${i === 2 ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field-row"><label for="st-speed">Time speed</label><select id="st-speed">${SPEEDS.map(x => `<option value="${x}" ${x === 60 ? 'selected' : ''}>${x}x</option>`).join('')}</select></div>
          <div class="field-row"><input type="checkbox" id="st-stop" checked><label for="st-stop">Stop on first error</label></div>
          <div class="app-row"><button class="st-go default">Start</button><button class="st-halt" disabled>Stop</button></div>
          <div class="st-result notice" hidden></div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px;min-width:0">
          <table class="kv st-live"></table>
          <canvas class="chart st-c1" aria-label="Temperature chart"></canvas>
          <canvas class="chart st-c2" aria-label="Clock chart"></canvas>
          <div class="st-log mono" style="flex:1;min-height:60px;overflow:auto;background:#fff;border:1px solid #bbb;padding:6px;font-size:11px"></div>
        </div>
      </div>`;
    const $ = s => body.querySelector(s);
    const log = (msg, cls = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = `[${hms(run ? sim.t - run.t0 : 0)}] ${esc(msg)}`; $('.st-log').prepend(d); };
    let run = null;
    const test = () => TESTS.find(t => t.id === body.querySelector('input[name=st-test]:checked').value);
    const note = () => { $('.st-note').textContent = test().note; };
    body.addEventListener('change', e => { if (e.target.name === 'st-test') note(); if (e.target.id === 'st-speed' && run) sim.setSpeed(Number(e.target.value)); });
    note();

    function start() {
      const t = test();
      run = { t, t0: sim.t, dur: Number($('#st-dur').value), errors: 0, first: null, core: 0, coreT: sim.t, maxT: 0, maxVrm: 0, throttled: false };
      sim.resetStats();
      sim.setLoad({ cpu: t.cpu, gpu: !!t.gpu, mem: !!t.mem, core: t.cycle ? 0 : undefined });
      sim.setSpeed(Number($('#st-speed').value));
      $('.st-go').disabled = true; $('.st-halt').disabled = false;
      $('.st-result').hidden = true;
      $('.st-log').innerHTML = '';
      log(`Started ${t.group}: ${t.name}`);
    }
    function stop(reason) {
      if (!run) return;
      const r = run;
      sim.setLoad({ cpu: 'light', gpu: false, mem: false, core: undefined });
      sim.setSpeed(1);
      $('.st-go').disabled = false; $('.st-halt').disabled = true;
      const el = $('.st-result');
      el.hidden = false;
      const pass = r.errors === 0 && reason === 'done';
      el.className = `st-result notice ${pass ? 'good' : r.errors ? 'bad' : ''}`;
      el.innerHTML = pass
        ? `<b>PASS</b> after ${hms(r.elapsed)}. No errors. Max Tctl ${r.maxT.toFixed(1)}°C, max VRM ${r.maxVrm.toFixed(1)}°C.${r.throttled ? ' Throttling was seen during the run.' : ''}<br>A pass means no error in this run, not a guarantee.`
        : r.errors ? `<b>FAIL</b>: ${r.errors} error(s). First at ${hms(r.first)}.` : `Stopped by user after ${hms(r.elapsed ?? 0)}.`;
      log(pass ? 'Test passed' : r.errors ? 'Test failed' : 'Stopped', pass ? 'good' : r.errors ? 'bad' : '');
      run = null;
    }
    $('.st-go').onclick = start;
    $('.st-halt').onclick = () => stop('user');

    const off = sim.on(ev => {
      if (ev.type === 'tick') {
        const s = ev.snap;
        if (run) {
          run.elapsed = sim.t - run.t0;
          run.maxT = Math.max(run.maxT, s.temps.tctl);
          run.maxVrm = Math.max(run.maxVrm, s.temps.vrm);
          if (s.throttle && !run.throttled) { run.throttled = true; log(`${s.throttle} throttling started`, 'warnc'); }
          if (run.t.cycle && sim.t - run.coreT > 360) {   // 6 simulated minutes per core, like CoreCycler defaults
            run.core = (run.core + 1) % 8; run.coreT = sim.t;
            sim.setLoad({ core: run.core });
            log(`Core Cycler: moving to core ${run.core}`);
          }
          if (run.elapsed >= run.dur) stop('done');
        }
        const active = s.cpu.cores.filter(c => c.active);
        const rows = [
          ['Elapsed', run ? hms(run.elapsed) : '-'], ['Errors', run ? run.errors : '-'],
          ['CPU clock (avg active)', `${(s.cpu.fAvgActive * 1000).toFixed(0)} MHz`], ['Vcore (SVI2 TFN)', `${s.vcore.toFixed(3)} V`],
          ['CPU Package Power', `${s.cpu.pkg.toFixed(1)} W`], ['Core current', `${s.cpu.current.toFixed(1)} A`],
          ['Tctl/Tdie', `${s.temps.tctl.toFixed(1)} °C`], ['VRM (MOS)', `${s.temps.vrm.toFixed(1)} °C`],
          ['GPU', `${s.gpu.f} MHz  ${s.gpu.power.toFixed(0)} W  ${s.temps.gpu.toFixed(0)} °C`], ['Wall power', `${s.wall.toFixed(0)} W`],
          ['Active cores', active.length ? active.map(c => s.cpu.cores.indexOf(c)).join(', ') : 'none'], ['Throttling', s.throttle || 'No'],
        ];
        $('.st-live').innerHTML = `<tr>${rows.slice(0, 6).map(r => `<th>${r[0]}</th>`).join('')}</tr><tr>${rows.slice(0, 6).map(r => `<td class="num">${r[1]}</td>`).join('')}</tr><tr>${rows.slice(6).map(r => `<th>${r[0]}</th>`).join('')}</tr><tr>${rows.slice(6).map(r => `<td class="num">${r[1]}</td>`).join('')}</tr>`;
        drawChart($('.st-c1'), [{ data: sim.hist.tctl ?? [], color: '#ff6b4a' }, { data: sim.hist.vrm ?? [], color: '#f5c542' }, { data: sim.hist.gpuT ?? [], color: '#4ac1ff' }], { min: 20, max: 110, unit: '°' });
        drawChart($('.st-c2'), [{ data: sim.hist.fcpu ?? [], color: '#7ee787' }, { data: sim.hist.gpuF ?? [], color: '#b392f0' }], { min: 0, max: 5000, unit: '' });
      }
      if (!run) return;
      const fail = msg => {
        run.errors++;
        run.first ??= sim.t - run.t0;
        log(msg, 'bad');
        if ($('#st-stop').checked) stop('error');
      };
      if (ev.type === 'cpuError') fail(`CPU error: ${ev.detail}`);
      if (ev.type === 'memError') fail(`Memory error detected (most likely cause: ${ev.why})`);
      if (ev.type === 'tdr') fail('GPU: display driver reset during test');
      if (ev.type === 'artifact') fail('GPU: artifacts detected in frame check');
      if (ev.type === 'whea19') log('WHEA 19 corrected error (fabric). Not a test error, but FCLK is on the edge.', 'warnc');
    });
    return () => { off(); if (run) { sim.setLoad({ cpu: 'light', gpu: false, mem: false, core: undefined }); sim.setSpeed(1); } };
  },
};
