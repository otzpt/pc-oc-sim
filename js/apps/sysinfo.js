// System Info, CPU-Z-style tabs.
import { CPU, BOARD, RAM, GPU, SSD } from '../hardware.js';
import { memPerf } from '../model.js';

export default {
  id: 'sysinfo', title: 'System Info', icon: 'ti-cpu', color: '#6e7bff', w: 560, h: 520,
  mount(body, { sim }) {
    const tabs = ['CPU', 'Caches', 'Mainboard', 'Memory', 'SPD', 'Graphics', 'Storage'];
    body.innerHTML = `<section class="tabs app-pad" style="padding:8px"><menu role="tablist">${tabs.map((t, i) => `<button role="tab" aria-selected="${i === 0}" data-t="${t}">${t}</button>`).join('')}</menu><article role="tabpanel" class="si-p" style="flex:1;overflow:auto"></article></section>`;
    const panel = body.querySelector('.si-p');
    let cur = 'CPU';
    const kv = rows => `<table class="kv">${rows.map(([k, v]) => `<tr><th style="width:38%">${k}</th><td>${v}</td></tr>`).join('')}</table>`;
    const render = () => {
      const s = sim.snap, m = sim.cfg.mem;
      const p = memPerf(m);
      const pages = {
        CPU: [['Name', CPU.name], ['Code Name', CPU.codename], ['Package', 'Socket AM4 (1331)'], ['Technology', CPU.process], ['Core Voltage', `${s?.vcore.toFixed(3) ?? '-'} V`],
          ['Specification', 'AMD Ryzen 7 5700X 8-Core Processor'], ['Family / Model / Stepping', `19h / 21h / 0 (${CPU.stepping})`],
          ['Instructions', 'MMX(+), SSE, SSE2, SSE3, SSSE3, SSE4.1, SSE4.2, SSE4A, x86-64, AMD-V, AES, AVX, AVX2, FMA3, SHA'],
          ['Core Speed', `${s ? (s.cpu.fMax * 1000).toFixed(2) : '-'} MHz`], ['Multiplier', `x ${s ? (s.cpu.fMax * 10).toFixed(2) : '-'}`], ['Bus Speed', '100.00 MHz'],
          ['Cores / Threads', `${sim.cfg.cpu.cores} / ${sim.cfg.cpu.smt ? sim.cfg.cpu.cores * 2 : sim.cfg.cpu.cores}`]],
        Caches: [['L1 Data', '8 x 32 KBytes, 8-way'], ['L1 Inst.', '8 x 32 KBytes, 8-way'], ['Level 2', '8 x 512 KBytes, 8-way'], ['Level 3', '32 MBytes, 16-way (one CCX)']],
        Mainboard: [['Manufacturer', 'Micro-Star International Co., Ltd.'], ['Model', `${BOARD.name} (${BOARD.model})`], ['Chipset', 'AMD Ryzen SOC / AMD B450'], ['LPCIO', BOARD.superIO],
          ['BIOS', `American Megatrends Inc. ${BOARD.bios}`], ['AGESA', BOARD.agesa], ['Graphic Interface', 'PCI-Express 3.0, x16']],
        Memory: [['Type', 'DDR4'], ['Size', '16 GBytes'], ['Channel #', '2 x 64-bit'], ['Uncore Frequency (FCLK)', `${m.fclk} MHz`], ['DRAM Frequency', `${m.mclk.toFixed(1)} MHz`],
          ['FSB:DRAM', `1:${(m.mclk / 100 * 3).toFixed(0)}/3`], ['CAS# Latency (CL)', m.t.cl], ['RAS# to CAS# Delay (tRCD)', m.t.rcdrd], ['RAS# Precharge (tRP)', m.t.rp], ['Cycle Time (tRAS)', m.t.ras],
          ['Bank Cycle Time (tRC)', m.t.rc], ['Command Rate (CR)', m.cmd], ['Estimated latency', `${p.latency.toFixed(1)} ns`]],
        SPD: [['Slot', 'DIMM #2 (A2) and #4 (B2)'], ['Module', `${RAM.name}, 8 GB, DDR4-3200 (1600 MHz)`], ['Part Number', RAM.part], ['Ranks', 'Single'],
          ['JEDEC #9', 'DDR4-2133  15-15-15-36  1.20 V'], ['XMP-3200', 'DDR4-3200  16-18-18-38  1.35 V'], ['DRAM IC', RAM.ic]],
        Graphics: [['Name', 'NVIDIA GeForce GTX 1660 Ti'], ['Board', GPU.name], ['GPU', `${GPU.chip} (${GPU.arch})`], ['CUDA cores', GPU.cuda], ['Base / Boost', `${GPU.baseMHz} / ${GPU.boostMHz} MHz`],
          ['Memory', `${GPU.memGB} GB ${GPU.memType}, ${GPU.memBus}-bit, ${GPU.memMTs} MT/s`], ['Bandwidth', `${GPU.bandwidthGBs} GB/s stock`], ['TDP', `${GPU.tdpW} W`], ['Outputs', GPU.outputs]],
        Storage: [['Drive', SSD.name], ['Part', SSD.part], ['Controller', SSD.controller], ['NAND', SSD.nand], ['Interface (drive)', SSD.iface], ['Link (this board)', 'PCIe 3.0 x4 (M2_1)'], ['Rated', `${SSD.seqRead} / ${SSD.seqWrite} MB/s, ${SSD.tbw} TBW`]],
      };
      panel.innerHTML = kv(pages[cur]);
    };
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-t]');
      if (!b) return;
      cur = b.dataset.t;
      body.querySelectorAll('[role=tab]').forEach(x => x.setAttribute('aria-selected', x === b));
      render();
    });
    render();
    const id = setInterval(render, 1000);
    return () => clearInterval(id);
  },
};
