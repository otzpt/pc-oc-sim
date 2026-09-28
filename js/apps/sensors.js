// Sensors, HWiNFO-style: current / minimum / maximum / average for every reading.
export default {
  id: 'sensors', title: 'Sensors', icon: 'ti-activity-heartbeat', color: '#f0883e', w: 620, h: 600,
  mount(body, { sim }) {
    body.innerHTML = `<div class="app-row" style="padding:6px"><button class="sn-reset">Reset min/max</button><span class="sn-note" style="color:#555">Values update 10x per second.</span></div>
      <div style="flex:1;overflow:auto"><table class="kv sn-t"></table></div>`;
    const t = body.querySelector('.sn-t');
    const mm = {};
    body.querySelector('.sn-reset').onclick = () => { for (const k in mm) delete mm[k]; };
    const off = sim.on(ev => {
      if (ev.type !== 'tick') return;
      const s = ev.snap, c = s.cpu, g = s.gpu, m = s.mem;
      const rows = [];
      const sect = name => rows.push(`<tr class="sect"><td colspan="5">${name}</td></tr>`);
      const row = (k, v, unit, dec = 0) => {
        const r = (mm[k] ??= { min: v, max: v, sum: 0, n: 0 });
        r.min = Math.min(r.min, v); r.max = Math.max(r.max, v); r.sum += v; r.n++;
        const f = x => `${x.toFixed(dec)} ${unit}`;
        rows.push(`<tr><td>${k}</td><td class="num">${f(v)}</td><td class="num">${f(r.min)}</td><td class="num">${f(r.max)}</td><td class="num">${f(r.sum / r.n)}</td></tr>`);
      };
      sect('CPU [#0]: AMD Ryzen 7 5700X');
      c.cores.forEach((core, i) => row(`Core ${i} Clock`, core.f * 1000, 'MHz'));
      c.cores.forEach((core, i) => row(`Core ${i} Effective Clock`, core.eff * 1000, 'MHz'));
      c.cores.forEach((core, i) => row(`Core ${i} VID`, core.v, 'V', 3));
      c.cores.forEach((core, i) => row(`Core ${i} Power`, core.p, 'W', 2));
      sect('CPU [#0]: AMD Ryzen 7 5700X: Enhanced');
      row('CPU (Tctl/Tdie)', s.temps.tctl, '°C', 1);
      row('CPU Core Voltage (SVI2 TFN)', s.vcore, 'V', 3);
      row('SoC Voltage (SVI2 TFN)', m.vsoc, 'V', 3);
      row('CPU Core Current (SVI2 TFN)', c.current, 'A', 1);
      row('CPU Package Power', c.pkg, 'W', 1);
      row('Core+SoC Power', c.pCores + c.socP, 'W', 1);
      row('CPU PPT', s.ppt, '%', 1);
      row('CPU TDC', s.tdc, '%', 1);
      row('CPU EDC', s.edc, '%', 1);
      row('Infinity Fabric Clock (FCLK)', m.fclk, 'MHz');
      row('Memory Controller Clock (UCLK)', m.uclkDiv === 1 ? m.mclk : m.mclk / 2, 'MHz');
      row('Memory Clock (MCLK)', m.mclk, 'MHz');
      sect('MSI MS-7A38 (Nuvoton NCT6795D)');
      row('System', s.temps.case, '°C', 1);
      row('MOS (VRM)', s.temps.vrm, '°C', 1);
      row('CPU_FAN1', s.cpuRpm, 'RPM');
      row('SYS_FAN1 (case fans)', s.sysRpm, 'RPM');
      row('DRAM', m.vdram, 'V', 3);
      row('+12V', 12.096 - s.dc * 0.00012, 'V', 3);
      sect('DDR4 SPD: T-Force Vulcan Z');
      row('DIMM temperature (estimated)', s.temps.dram, '°C', 1);
      sect('GPU [#0]: NVIDIA GeForce GTX 1660 Ti');
      row('GPU Temperature', s.temps.gpu, '°C', 1);
      row('GPU Hot Spot (estimated)', s.temps.gpu + 9, '°C', 1);
      row('GPU Core Voltage', g.v, 'V', 3);
      row('GPU Power', g.power, 'W', 1);
      row('GPU Clock', g.f, 'MHz');
      row('GPU Memory Clock', g.memMT / 2, 'MHz');
      row('GPU Fan', s.gpuRpm, 'RPM');
      sect('PSU: CoolBox DeepPower BR-650 (estimated)');
      row('DC load', s.dc, 'W', 0);
      row('Wall power', s.wall, 'W', 0);
      row('Efficiency', s.eff * 100, '%', 1);
      sect('Windows Hardware Errors (WHEA)');
      row('Total errors', s.errors.whea18 + s.errors.whea19, '');
      t.innerHTML = `<tr><th>Sensor</th><th>Current</th><th>Minimum</th><th>Maximum</th><th>Average</th></tr>${rows.join('')}`;
    });
    return off;
  },
};
