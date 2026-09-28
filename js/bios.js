// Click BIOS 5 style setup utility. Edits a draft copy of CMOS; Save writes it.
import { MENUS, allItems, defaults, MEMORY_TRY_IT } from './schema.js';
import { state, save } from './state.js';
import { resolve, memPerf } from './model.js';
import { sim } from './sim.js';
import { CPU, BOARD, RAM, GPU, SSD, COOLER } from './hardware.js';
import { esc } from './ui/esc.js';
import { fanCurveEditor } from './ui/fancurve.js';

const ITEMS = allItems();
const byId = Object.fromEntries(ITEMS.map(i => [i.id, i]));

export function openBios(root, host) {
  const draft = structuredClone(state.cmos);
  const favs = state.profiles.__favs ?? [];
  let mode = 'advanced';            // advanced | ez
  let tab = 'OC';                   // top-level menu id
  let stack = [];                   // submenu path: [{label, items}]
  let sel = 0;
  let popup = null;                 // { kind, ... }
  let helpOpen = false;
  let toast = '';
  let toastTimer = 0;
  let hwFan = 'CPU_FAN1';

  sim.boot(resolve(state.cmos));    // BIOS runs on the settings saved at boot
  sim.setLoad({ cpu: 'light', gpu: false, mem: false });

  const v = id => draft[id];
  const expert = () => draft.ocExplore === 'Expert';
  const visible = items => items.filter(it => (!it.expert || expert()) && (!it.show || it.show(v)));

  const ctx = {
    adjCpu: () => {
      const c = resolve(draft).cpu;
      return c.ratioGHz ? `${(c.ratioGHz * 1000).toFixed(0)}MHz` : c.mode === 'nocpb' ? '3400MHz' : 'Auto (Precision Boost, up to 4600MHz)';
    },
    adjDram: () => {
      const m = resolve(draft).mem;
      return `${m.mt}MHz (MCLK ${m.mclk} / FCLK ${m.fclk} / UCLK ${m.uclkDiv === 1 ? m.mclk : m.mclk / 2})`;
    },
    cpuSpecs: () => [
      `CPU Name: ${CPU.name} 8-Core Processor`, `Codename: ${CPU.codename}`, `CPUID: ${CPU.cpuid}   Stepping: ${CPU.stepping}`,
      `Cores/Threads: ${CPU.cores}/${CPU.threads}`, `Base/Boost: ${CPU.baseGHz} / ${CPU.boostGHz} GHz`,
      `L1: ${CPU.l1KB} KB   L2: ${CPU.l2MB} MB   L3: ${CPU.l3MB} MB`, `TDP: ${CPU.tdpW} W   PPT ${CPU.pptW} W  TDC ${CPU.tdcA} A  EDC ${CPU.edcA} A`,
      `Process: ${CPU.process}`, `Instructions: MMX, SSE, SSE2, SSE3, SSSE3, SSE4.1, SSE4.2, SSE4A, x86-64, AMD-V, AES, AVX, AVX2, FMA3, SHA`,
    ].join('\n'),
    memoryZ: () => {
      const m = resolve(draft).mem;
      const p = memPerf(m);
      return [
        `DIMMA2 / DIMMB2: ${RAM.name} 8 GB, single rank, ${RAM.dieDensity} dies`, `Part: ${RAM.part}   IC: ${RAM.ic}`,
        `SPD JEDEC: DDR4-2133 15-15-15-36 1.20 V`, `XMP Profile 1: DDR4-3200 16-18-18-38 1.35 V`,
        `Current: DDR4-${m.mt}  ${m.t.cl}-${m.t.rcdrd}-${m.t.rp}-${m.t.ras}  tRC ${m.t.rc}  tRFC ${m.t.rfc}  ${m.cmd}  GDM ${m.gdm ? 'On' : 'Off'}`,
        `Secondary: tRRDS ${m.t.rrds} tRRDL ${m.t.rrdl} tFAW ${m.t.faw} tWTRS ${m.t.wtrs} tWTRL ${m.t.wtrl} tWR ${m.t.wr} tRTP ${m.t.rtp} tCWL ${m.t.cwl}`,
        `Fabric: FCLK ${m.fclk} MHz, UCLK ${m.uclkDiv === 1 ? 'MEMCLK' : 'MEMCLK/2'}  ${m.sync ? '(1:1:1 coupled)' : '(decoupled, +latency)'}`,
        `Estimated latency ${p.latency.toFixed(1)} ns, read ${p.read.toFixed(1)} GB/s, write ${p.write.toFixed(1)} GB/s`,
      ].join('\n');
    },
    sysInfo: () => `${CPU.name}, BIOS ${BOARD.bios}, 16384 MB`,
    date: () => new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' }),
    time: () => new Date().toLocaleTimeString('en-GB'),
    profileName: i => state.profiles[i]?.name ?? '(empty)',
  };

  // ---------- value helpers ----------
  function fmt(it, val = draft[it.id]) {
    if (it.type === 'text') return val ? 'Installed' : 'Not Installed';
    if (val === 'Auto' || it.type === 'enum') return `[${val}]`;
    if (it.unit === 'V') return `[${Number(val).toFixed(3)}]`;
    if (it.unit === 'x' && it.id === 'ratio') return `[${Number(val).toFixed(2)}]`;
    if (it.step < 1) return `[${Number(val).toFixed(3)}]`;
    return `[${val}]`;
  }
  function autoValue(it) {
    const r = resolve(draft);
    const t = r.mem.t;
    const map = {
      tCL: t.cl, tRCDRD: t.rcdrd, tRCDWR: t.rcdwr, tRP: t.rp, tRAS: t.ras, tRC: t.rc, tRRDS: t.rrds, tRRDL: t.rrdl,
      tFAW: t.faw, tWTRS: t.wtrs, tWTRL: t.wtrl, tWR: t.wr, tRTP: t.rtp, tCWL: t.cwl, tRFC: t.rfc, tRFC2: Math.round(t.rfc * 0.74), tRFC4: Math.round(t.rfc * 0.46),
      ratio: 40, vcore: 1.2, vsoc: r.mem.vsoc, vdram: r.mem.vdram, vddp: r.mem.vddp, vddgCcd: r.mem.vddgCcd, vddgIod: r.mem.vddgIod,
      vchipset: 1.05, vpp: 2.5, vrefA: 0.5, vrefB: 0.5,
    };
    return map[it.id] ?? it.min;
  }
  function step(it, dir) {
    if (it.type === 'enum') {
      const i = it.opts.indexOf(draft[it.id]);
      draft[it.id] = it.opts[(i + dir + it.opts.length) % it.opts.length];
    } else if (it.type === 'num') {
      let cur = draft[it.id] === 'Auto' ? autoValue(it) : Number(draft[it.id]) + dir * it.step;
      cur = Math.min(it.max, Math.max(it.min, cur));
      draft[it.id] = Math.round(cur / it.step) * it.step;
      draft[it.id] = Number(draft[it.id].toFixed(5));
    }
  }
  function liveReading(it) {
    const s = sim.snap;
    if (!s) return '';
    const r = { vcore: s.vcore, vsoc: s.mem.vsoc, vdram: s.mem.vdram, vddp: s.mem.vddp, vddgCcd: s.mem.vddgCcd, vddgIod: s.mem.vddgIod, vcoreMode: s.vcore }[it.id];
    return r ? `${r.toFixed(3)}V` : '';
  }
  function changes() {
    const out = [];
    for (const it of ITEMS) {
      if (JSON.stringify(draft[it.id]) !== JSON.stringify(state.cmos[it.id])) out.push(`${it.label}: ${fmt(it, state.cmos[it.id])} -> ${fmt(it, draft[it.id])}`);
    }
    if (JSON.stringify(draft.fans) !== JSON.stringify(state.cmos.fans)) out.push('Fan control: changed');
    return out;
  }
  function flash(msg) { toast = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast = ''; render(); }, 2600); render(); }

  // ---------- navigation ----------
  const currentItems = () => visible(stack.length ? stack[stack.length - 1].items : MENUS.find(m => m.id === tab).items);
  const selectable = it => it.type !== 'header';
  function move(dir) {
    const items = currentItems();
    if (!items.length) return;
    let i = sel;
    do { i = (i + dir + items.length) % items.length; } while (!selectable(items[i]) && i !== sel);
    sel = i;
  }
  function firstSelectable() {
    const items = currentItems();
    sel = Math.max(0, items.findIndex(selectable));
  }
  function openTab(id) { tab = id; stack = []; sel = 0; firstSelectable(); popup = null; }
  function activate(it) {
    if (!it) return;
    if (it.type === 'sub') { stack.push({ label: it.label, items: it.items, id: it.id }); sel = 0; firstSelectable(); return; }
    if (it.type === 'enum') { popup = { kind: 'enum', it, idx: Math.max(0, it.opts.indexOf(draft[it.id])) }; return; }
    if (it.type === 'num') { popup = { kind: 'num', it, text: draft[it.id] === 'Auto' ? '' : String(draft[it.id]) }; return; }
    if (it.type === 'text') { popup = { kind: 'text', it, text: '' }; return; }
    if (it.type === 'action') return runAction(it.action);
  }
  function back() {
    if (popup) { popup = null; return; }
    if (stack.length) { stack.pop(); sel = 0; firstSelectable(); return; }
    popup = { kind: 'confirm', title: 'Exit Setup', text: changes().length ? 'Save changes and reboot?' : 'Exit and boot the OS?', yes: () => (changes().length ? saveReboot() : host.exitToOs()), no: () => { popup = null; } };
  }

  // ---------- actions ----------
  function saveReboot() {
    state.cmos = structuredClone(draft);
    save('cmos');
    sim.stop();
    host.reboot();
  }
  function runAction(a) {
    const [name, arg] = a.split(':');
    const n = Number(arg);
    switch (name) {
      case 'saveReboot': return confirmSave();
      case 'save': state.cmos = structuredClone(draft); save('cmos'); return flash('Changes saved. They take effect after the next reboot.');
      case 'discard': Object.assign(draft, structuredClone(state.cmos)); return flash('Changes discarded.');
      case 'discardExit': sim.stop(); return host.exitToOs();
      case 'defaults': return loadDefaults();
      case 'secureErase': return flash('Secure Erase+ is disabled in this simulation.');
      case 'noUsb': return flash('No FAT32 USB flash drive detected.');
      case 'romProfile': return flash('No OC profile stored in the BIOS ROM.');
      case 'nameProfile': popup = { kind: 'text', it: { label: `Name for Overclocking Profile ${n}`, id: null, profile: n }, text: state.profiles[n]?.name ?? '' }; return;
      case 'saveProfile': state.profiles[n] = { name: state.profiles[n]?.name ?? `Profile ${n}`, cmos: structuredClone(draft) }; save('profiles'); return flash(`Overclocking Profile ${n} saved.`);
      case 'loadProfile':
        if (!state.profiles[n]) return flash(`Overclocking Profile ${n} is empty.`);
        Object.assign(draft, structuredClone(state.profiles[n].cmos)); return flash(`Overclocking Profile ${n} loaded. Press F10 to apply.`);
      case 'clearProfile': delete state.profiles[n]; save('profiles'); return flash(`Overclocking Profile ${n} cleared.`);
      default: return undefined;
    }
  }
  function confirmSave() {
    const list = changes();
    popup = { kind: 'confirm', title: 'Save & Exit Setup', text: list.length ? 'Save configuration and reset?' : 'No changes. Reset anyway?', list, yes: saveReboot, no: () => { popup = null; } };
  }
  function loadDefaults() {
    popup = { kind: 'confirm', title: 'Load Optimized Defaults', text: 'Load optimized defaults?', yes: () => { const d = defaults(); Object.assign(draft, d); popup = null; flash('Optimized defaults loaded.'); }, no: () => { popup = null; } };
  }

  // ---------- render ----------
  const el = document.createElement('div');
  el.className = 'bios';
  root.appendChild(el);

  function header() {
    const s = sim.snap;
    const r = resolve(state.cmos);
    const cpuMHz = s ? Math.round(s.cpu.fMax * 1000) : 0;
    return `
    <header class="b-top">
      <div class="b-brand">CLICK BIOS 5</div>
      <div class="b-modes">
        <button data-act="ez" class="${mode === 'ez' ? 'on' : ''}">EZ Mode (F7)</button>
        <button data-act="adv" class="${mode === 'advanced' ? 'on' : ''}">Advanced (F7)</button>
      </div>
      <div class="b-tools">
        <button data-act="f12" title="Screenshot">F12</button>
        <button data-act="search" title="Search"><i class="ti ti-search"></i></button>
        <span>English</span>
        <span class="b-clock">${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}  ${new Date().toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
      </div>
    </header>
    <section class="b-info">
      <div class="b-gauge"><span>CPU Speed</span><b>${(cpuMHz / 1000).toFixed(2)} GHz</b></div>
      <div class="b-gauge"><span>DDR Speed</span><b>${r.mem.mt} MHz</b></div>
      <div class="b-temps">
        <div>CPU Core Temp: <b>${s ? s.temps.tctl.toFixed(0) : '--'}°C</b></div>
        <div>Motherboard Temp: <b>${s ? s.temps.case.toFixed(0) : '--'}°C</b></div>
      </div>
      <div class="b-sys">
        <div>MB: ${BOARD.name} (${BOARD.model})</div>
        <div>CPU: AMD Ryzen 7 5700X 8-Core Processor</div>
        <div>Memory Size: 16384MB</div>
        <div>VCore: ${s ? s.vcore.toFixed(3) : '-'}V &nbsp; DDR Voltage: ${r.mem.vdram.toFixed(3)}V</div>
        <div>BIOS Ver: E7A38AMS.${BOARD.bios.slice(-2)}0 &nbsp; AGESA ${BOARD.agesa}</div>
      </div>
    </section>
    <div class="b-bootbar"><span>Boot Priority</span><i class="ti ti-device-sd-card"></i><i class="ti ti-usb"></i><i class="ti ti-network"></i></div>`;
  }

  function rowHtml(it, i) {
    if (it.type === 'header') return `<div class="b-hdr">${esc(it.label)}</div>`;
    const cls = `b-row${i === sel ? ' sel' : ''}${it.type === 'info' ? ' ro' : ''}`;
    const star = it.expert ? '*' : '';
    let val = '';
    if (it.type === 'sub') val = '<span class="b-arrow">&gt;</span>';
    else if (it.type === 'info') val = `<span class="b-info-val">${esc(it.get(ctx))}</span>`;
    else if (it.type === 'action') val = '';
    else {
      const risk = it.danger && Number(draft[it.id]) >= it.danger ? ' danger' : it.warn && Number(draft[it.id]) >= it.warn ? ' warn' : '';
      val = `<span class="b-live">${liveReading(it)}</span><span class="b-val${risk}">${esc(fmt(it))}</span>`;
    }
    const changed = it.id && JSON.stringify(draft[it.id]) !== JSON.stringify(state.cmos[it.id]) ? ' changed' : '';
    return `<div class="${cls}${changed}" data-i="${i}"><span class="b-lbl">${star}${esc(it.label)}</span>${val}</div>`;
  }

  function menuPanel() {
    const items = currentItems();
    const path = [MENUS.find(m => m.id === tab).label, ...stack.map(s => s.label)].join('\\');
    const cur = items[sel];
    const help = cur?.help ?? (cur?.type === 'sub' ? 'Press Enter to enter the sub-menu.' : '');
    return `
      <div class="b-center">
        <div class="b-path"><span>${esc(path)}</span><span class="b-hotkey">HOT KEY | <i class="ti ti-arrow-back-up"></i></span></div>
        <div class="b-list" id="bList">${items.map(rowHtml).join('') || '<div class="b-empty">No items</div>'}</div>
      </div>
      <aside class="b-help">
        <div class="b-help-tabs"><span class="on">HELP</span><span>INFO</span></div>
        <div class="b-help-body">${esc(help)}</div>
        ${cur?.type === 'num' ? `<div class="b-help-range">Min: ${cur.min}${cur.unit}  Max: ${cur.max}${cur.unit}\nStep: ${cur.step}${cur.unit}${cur.auto ? '\nAuto allowed' : ''}</div>` : ''}
        ${resolve(draft).warn.map(w => `<div class="b-help-warn">${esc(w)}</div>`).join('')}
        <div class="b-keys">↑↓→←: Move<br>Enter: Select<br>+/-: Value<br>ESC: Exit<br>F1: General Help</div>
      </aside>`;
  }

  function sidePanel(side) {
    const btn = (id, label, icon) => `<button class="b-side-btn${tab === id ? ' on' : ''}" data-tab="${id}"><i class="ti ${icon}"></i><span>${label}</span></button>`;
    return side === 'left'
      ? `<nav class="b-side">${btn('SETTINGS', 'SETTINGS', 'ti-settings')}${btn('OC', 'OC', 'ti-gauge')}</nav>`
      : `<nav class="b-side">${btn('MFLASH', 'M-FLASH', 'ti-usb')}${btn('PROFILE', 'OC PROFILE', 'ti-files')}${btn('HWMON', 'HARDWARE MONITOR', 'ti-temperature')}${btn('BOARD', 'BOARD EXPLORER', 'ti-cpu')}</nav>`;
  }

  function hwmonPanel() {
    const s = sim.snap;
    const f = draft.fans[hwFan];
    const rpm = { CPU_FAN1: s?.cpuRpm ?? 0, SYS_FAN1: s?.sysRpm ?? 0, SYS_FAN2: 0 };
    return `
    <div class="b-hw">
      <div class="b-hw-fans">${Object.keys(draft.fans).map(k => `<button data-fan="${k}" class="${k === hwFan ? 'on' : ''}">${k}<small>${k === 'SYS_FAN2' ? 'N/A' : rpm[k] + ' RPM'}</small></button>`).join('')}</div>
      <div class="b-hw-main">
        <div class="b-hw-curve" id="fanCurve"></div>
        <div class="b-hw-ctrl">
          <label><input type="checkbox" data-fanopt="smart" ${f.smart ? 'checked' : ''}> Smart Fan Mode</label>
          <div class="b-seg">${['PWM', 'DC'].map(m => `<button data-fanmode="${m}" class="${f.mode === m ? 'on' : ''}">${m}</button>`).join('')}</div>
          <label>Step up time <select data-fanopt="stepUp">${[0.1, 0.2, 0.3, 0.4, 0.5, 1].map(x => `<option ${f.stepUp === x ? 'selected' : ''}>${x}</option>`).join('')}</select> sec</label>
          <label>Step down time <select data-fanopt="stepDown">${[0.1, 0.2, 0.3, 0.4, 0.5, 1].map(x => `<option ${f.stepDown === x ? 'selected' : ''}>${x}</option>`).join('')}</select> sec</label>
          <div class="b-hw-btns"><button data-hwbtn="full">All Full Speed(F)</button><button data-hwbtn="default">All Set Default(D)</button><button data-hwbtn="cancel">All Set Cancel(C)</button></div>
          ${hwFan === 'SYS_FAN1' ? '<p class="b-note">SYS_FAN1 drives the Aerocool ARGB hub (5 case fans). Target temperature source: CPU.</p>' : ''}
          ${hwFan === 'CPU_FAN1' ? `<p class="b-note">${COOLER.name}: ${COOLER.fan}.</p>` : ''}
        </div>
      </div>
      <div class="b-hw-volts">
        ${[['CPU', s?.temps.tctl, '°C'], ['System', s?.temps.case, '°C'], ['MOS (VRM)', s?.temps.vrm, '°C']].map(([k, x, u]) => `<div><span>${k}</span><b>${x?.toFixed(0) ?? '--'}${u}</b></div>`).join('')}
        ${[['CPU Core', s?.vcore], ['CPU NB/SOC', s?.mem.vsoc], ['CPU VDDP', s?.mem.vddp], ['DRAM', s?.mem.vdram], ['12V', 12.096], ['5V', 5.04], ['3.3V', 3.328]].map(([k, x]) => `<div><span>${k}</span><b>${x?.toFixed(3) ?? '--'}V</b></div>`).join('')}
      </div>
    </div>`;
  }

  function boardPanel() {
    const parts = [
      ['CPU', 'cpu', `${CPU.name}\n${CPU.cores}C/${CPU.threads}T  ${CPU.baseGHz}-${CPU.boostGHz} GHz  ${CPU.tdpW} W`],
      ['DIMMA1', 'dimm a1', 'Empty'], ['DIMMA2', 'dimm a2', `${RAM.name} 8 GB DDR4-3200 CL16`],
      ['DIMMB1', 'dimm b1', 'Empty'], ['DIMMB2', 'dimm b2', `${RAM.name} 8 GB DDR4-3200 CL16`],
      ['PCI_E1', 'pcie1', `${GPU.name}\nPCIe 3.0 x16`], ['PCI_E2', 'pcie2', 'Empty (PCIe 2.0 x1)'], ['PCI_E3', 'pcie3', 'Empty (PCIe 2.0 x1)'],
      ['M2_1', 'm2', `${SSD.name}\nPCIe 3.0 x4 link (drive is PCIe 4.0)`],
      ['SATA1-4', 'sata', 'No devices'], ['CPU_FAN1', 'cfan', COOLER.name], ['SYS_FAN1', 'sfan1', 'Aerocool ARGB hub, 5 fans'], ['SYS_FAN2', 'sfan2', 'Not connected'],
      ['ATX_PWR1', 'atx', 'CoolBox DeepPower BR-650'], ['CPU_PWR1', 'eps', '8-pin ATX 12V'], ['JBAT1', 'jbat', 'Clear CMOS jumper'], ['VRM', 'vrm', BOARD.vrm],
    ];
    return `<div class="b-board">${parts.map(([n, cls, info]) => `<div class="bb ${cls}" data-info="${esc(info)}"><span>${n}</span></div>`).join('')}<div class="bb-info" id="bbInfo">Hover a component to see what is installed.</div></div>`;
  }

  function ezPanel() {
    const r = resolve(draft);
    const on = draft.axmp === 'Profile 1';
    const fb = [['LAN Option ROM', 'lanRom'], ['HD Audio Controller', 'hda'], ['AHCI /RAID', 'sataMode'], ['ErP Ready', 'erp'], ['Windows 10 WHQL Support', 'whql'], ['Security Device Support (fTPM)', 'tpmSupport']];
    return `<div class="b-ez">
      <div class="b-ez-top">
        <button class="b-ez-xmp${on ? ' on' : ''}" data-act="xmp"><i class="ti ti-cpu-2"></i> A-XMP ${on ? 'Profile 1' : 'Off'}</button>
        <div class="b-ez-line">DRAM ${r.mem.mt} MT/s ${r.mem.t.cl}-${r.mem.t.rcdrd}-${r.mem.t.rp}-${r.mem.t.ras} ${r.mem.vdram.toFixed(3)} V</div>
      </div>
      <div class="b-ez-grid">${fb.map(([label, id]) => `<button class="b-ez-fn${['Enabled', 'RAID Mode'].includes(draft[id]) ? ' on' : ''}" data-ezfn="${id}">${label}<small>${esc(draft[id])}</small></button>`).join('')}</div>
      <p class="b-note">Press F7 for Advanced mode: OC, AMD Overclocking, timings and voltages live there.</p>
    </div>`;
  }

  function flashPanel() {
    return `<div class="b-flash"><h3>M-FLASH</h3><p>M-FLASH updates the BIOS from a FAT32 USB flash drive. Current BIOS: ${BOARD.bios} (${BOARD.agesa}).</p><button data-act="mflash">Enter flash mode</button></div>`;
  }

  function popupHtml() {
    if (!popup) return '';
    if (popup.kind === 'enum') {
      return `<div class="b-pop"><div class="b-pop-title">${esc(popup.it.label)}</div><div class="b-pop-list">${popup.it.opts.map((o, i) => `<div class="b-opt${i === popup.idx ? ' sel' : ''}" data-opt="${i}">${esc(o)}</div>`).join('')}</div></div>`;
    }
    if (popup.kind === 'num' || popup.kind === 'text') {
      const it = popup.it;
      return `<div class="b-pop"><div class="b-pop-title">${esc(it.label)}</div>
        ${popup.kind === 'num' ? `<div class="b-pop-sub">Min: ${it.min}  Max: ${it.max}  Step: ${it.step}${it.auto ? '  (empty = Auto)' : ''}</div>` : ''}
        <input class="b-pop-in" id="popIn" ${popup.kind === 'text' && it.id ? 'type="password"' : ''} value="${esc(popup.text)}" autocomplete="off">
        <div class="b-pop-btns"><button data-pop="ok">OK</button>${it.auto ? '<button data-pop="auto">Auto</button>' : ''}<button data-pop="cancel">Cancel</button></div></div>`;
    }
    if (popup.kind === 'confirm') {
      return `<div class="b-pop"><div class="b-pop-title">${esc(popup.title)}</div><p>${esc(popup.text)}</p>
        ${popup.list?.length ? `<div class="b-pop-changes">${popup.list.map(esc).join('<br>')}</div>` : ''}
        <div class="b-pop-btns"><button data-pop="yes">Yes</button><button data-pop="no">No</button></div></div>`;
    }
    if (popup.kind === 'search') {
      const q = popup.text.toLowerCase();
      const hits = q.length < 2 ? [] : ITEMS.filter(i => i.label.toLowerCase().includes(q)).slice(0, 14);
      return `<div class="b-pop wide"><div class="b-pop-title">Search</div><input class="b-pop-in" id="popIn" value="${esc(popup.text)}" placeholder="Item name" autocomplete="off">
        <div class="b-pop-list">${hits.map(h => `<div class="b-opt" data-go="${h.id}">${esc(h.label)}<small>${esc(h.path.join(' \\ '))}</small></div>`).join('') || '<div class="b-empty">Type at least 2 letters</div>'}</div></div>`;
    }
    if (popup.kind === 'info') {
      return `<div class="b-pop wide"><div class="b-pop-title">${esc(popup.title)}</div><pre class="b-pre">${esc(popup.text)}</pre><div class="b-pop-btns"><button data-pop="cancel">Close</button></div></div>`;
    }
    if (popup.kind === 'favs') {
      return `<div class="b-pop wide"><div class="b-pop-title">Favorites</div><div class="b-pop-list">${favs.map(id => byId[id]).filter(Boolean).map(h => `<div class="b-opt" data-go="${h.id}">${esc(h.label)} <small>${esc(fmt(h))}</small></div>`).join('') || '<div class="b-empty">Press F2 on an item to add it.</div>'}</div><div class="b-pop-btns"><button data-pop="cancel">Close</button></div></div>`;
    }
    return '';
  }

  function render() {
    let body;
    if (mode === 'ez') body = ezPanel();
    else if (tab === 'HWMON') body = hwmonPanel();
    else if (tab === 'BOARD') body = boardPanel();
    else if (tab === 'MFLASH') body = flashPanel();
    else body = menuPanel();
    el.innerHTML = `<div class="b-head">${header()}</div>
      <div class="b-main ${mode}">${mode === 'ez' ? '' : sidePanel('left')}<div class="b-body">${body}</div>${mode === 'ez' ? '' : sidePanel('right')}</div>
      ${helpOpen ? `<div class="b-pop wide"><div class="b-pop-title">General Help</div><pre class="b-pre">↑↓→← Move    Enter Select    +/- Change value    ESC Back
F1 General Help        F2 Add/Remove favorite   F3 Favorites menu
F4 CPU Specifications  F5 Memory-Z              F6 Load optimized defaults
F7 EZ / Advanced mode  F8 Load OC profile       F9 Save OC profile
F10 Save & reset       F12 Screenshot           Ctrl+F Search</pre><div class="b-pop-btns"><button data-pop="closehelp">Close</button></div></div>` : ''}
      ${popupHtml()}
      ${toast ? `<div class="b-toast">${esc(toast)}</div>` : ''}`;
    if (tab === 'HWMON' && mode === 'advanced') {
      fanCurveEditor(el.querySelector('#fanCurve'), draft.fans[hwFan], () => render(), sim.snap?.temps.tctl);
    }
    const list = el.querySelector('#bList');
    const selRow = list?.querySelector('.b-row.sel');
    selRow?.scrollIntoView({ block: 'nearest' });
    const inp = el.querySelector('#popIn');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }

  function commitPopup(value) {
    const it = popup.it;
    if (popup.kind === 'num') {
      if (value === 'Auto' || (value === '' && it.auto)) draft[it.id] = 'Auto';
      else {
        const x = Number(value);
        if (!Number.isFinite(x)) { flash('Not a number.'); return; }
        const clamped = Math.min(it.max, Math.max(it.min, x));
        draft[it.id] = Number((Math.round(clamped / it.step) * it.step).toFixed(5));
        if (clamped !== x) flash(`Value limited to ${it.min} .. ${it.max}.`);
      }
    } else if (popup.kind === 'text') {
      if (it.profile) { state.profiles[it.profile] = { ...(state.profiles[it.profile] ?? { cmos: structuredClone(draft) }), name: value.slice(0, 20) }; save('profiles'); }
      else draft[it.id] = value;
    }
    popup = null;
  }

  function goTo(id) {
    // Find the menu path of an item and open it there.
    const findPath = (items, path) => {
      for (const it of items) {
        if (it.id === id) return path;
        if (it.type === 'sub') { const p = findPath(it.items, [...path, it]); if (p) return p; }
      }
      return null;
    };
    for (const m of MENUS) {
      const p = findPath(m.items, []);
      if (p) {
        mode = 'advanced'; tab = m.id; stack = p.map(s => ({ label: s.label, items: s.items, id: s.id }));
        if (byId[id].expert) draft.ocExplore = 'Expert';
        const idx = currentItems().findIndex(i => i.id === id);
        sel = Math.max(0, idx);
        popup = null;
        return;
      }
    }
  }

  // ---------- events ----------
  el.addEventListener('click', e => {
    const t = e.target.closest('[data-tab],[data-act],[data-i],[data-opt],[data-pop],[data-go],[data-fan],[data-fanmode],[data-hwbtn],[data-ezfn]');
    if (!t) return;
    const d = t.dataset;
    if (d.tab) { mode = 'advanced'; openTab(d.tab); }
    else if (d.act === 'ez') mode = 'ez';
    else if (d.act === 'adv') mode = 'advanced';
    else if (d.act === 'f12') flash('No FAT32 USB flash drive detected. Screenshot not saved.');
    else if (d.act === 'search') popup = { kind: 'search', text: '' };
    else if (d.act === 'xmp') draft.axmp = draft.axmp === 'Profile 1' ? 'Disabled' : 'Profile 1';
    else if (d.act === 'mflash') popup = { kind: 'confirm', title: 'M-FLASH', text: 'Reboot and enter flash mode?', yes: () => { popup = { kind: 'info', title: 'M-FLASH', text: 'Flash mode\n\nNo USB storage device found.\nInsert a FAT32 USB drive with the BIOS file and try again.' }; }, no: () => { popup = null; } };
    else if (d.i !== undefined) { const i = Number(d.i); if (i === sel) activate(currentItems()[i]); else sel = i; }
    else if (d.opt !== undefined) { draft[popup.it.id] = popup.it.opts[Number(d.opt)]; popup = null; }
    else if (d.go) goTo(d.go);
    else if (d.pop === 'ok') commitPopup(el.querySelector('#popIn').value);
    else if (d.pop === 'auto') commitPopup('Auto');
    else if (d.pop === 'cancel' || d.pop === 'no') { if (popup?.no) popup.no(); else popup = null; }
    else if (d.pop === 'yes') popup.yes();
    else if (d.pop === 'closehelp') helpOpen = false;
    else if (d.fan) hwFan = d.fan;
    else if (d.fanmode) draft.fans[hwFan].mode = d.fanmode;
    else if (d.hwbtn === 'full') Object.values(draft.fans).forEach(f => { f.smart = false; });
    else if (d.hwbtn === 'default') draft.fans = defaults().fans;
    else if (d.hwbtn === 'cancel') draft.fans = structuredClone(state.cmos.fans);
    else if (d.ezfn) { const it = byId[d.ezfn]; step(it, 1); }
    render();
  });
  el.addEventListener('change', e => {
    const o = e.target.dataset.fanopt;
    if (!o) return;
    draft.fans[hwFan][o] = o === 'smart' ? e.target.checked : Number(e.target.value);
    render();
  });
  el.addEventListener('input', e => {
    if (e.target.id === 'popIn' && popup?.kind === 'search') {
      popup.text = e.target.value;
      const pos = e.target.selectionStart;
      render();
      el.querySelector('#popIn')?.setSelectionRange(pos, pos);
    }
  });
  el.addEventListener('mouseover', e => {
    const b = e.target.closest('[data-info]');
    const box = el.querySelector('#bbInfo');
    if (b && box) box.textContent = `${b.querySelector('span').textContent}: ${b.dataset.info}`;
  });

  host.setKeyHandler(e => {
    const k = e.key;
    if (popup && (popup.kind === 'num' || popup.kind === 'text' || popup.kind === 'search')) {
      if (k === 'Enter' && popup.kind !== 'search') { commitPopup(el.querySelector('#popIn').value); render(); }
      if (k === 'Escape') { popup = null; render(); }
      return;
    }
    if (popup?.kind === 'enum') {
      if (k === 'ArrowDown') popup.idx = Math.min(popup.it.opts.length - 1, popup.idx + 1);
      else if (k === 'ArrowUp') popup.idx = Math.max(0, popup.idx - 1);
      else if (k === 'Enter') { draft[popup.it.id] = popup.it.opts[popup.idx]; popup = null; }
      else if (k === 'Escape') popup = null;
      return render();
    }
    if (popup?.kind === 'confirm') {
      if (k === 'Enter' || k.toLowerCase() === 'y') popup.yes();
      else if (k === 'Escape' || k.toLowerCase() === 'n') popup.no();
      return render();
    }
    if (popup) { if (k === 'Escape' || k === 'Enter') popup = null; return render(); }
    if (helpOpen) { helpOpen = false; return render(); }
    if (e.ctrlKey && k.toLowerCase() === 'f') { e.preventDefault(); popup = { kind: 'search', text: '' }; return render(); }
    const items = currentItems();
    const cur = items[sel];
    switch (k) {
      case 'ArrowDown': move(1); break;
      case 'ArrowUp': move(-1); break;
      case 'PageDown': for (let i = 0; i < 8; i++) move(1); break;
      case 'PageUp': for (let i = 0; i < 8; i++) move(-1); break;
      case 'Enter': activate(cur); break;
      case 'Escape': back(); break;
      case '+': case '=': if (cur && ['enum', 'num'].includes(cur.type)) step(cur, 1); break;
      case '-': if (cur && ['enum', 'num'].includes(cur.type)) step(cur, -1); break;
      case 'ArrowRight': { const order = MENUS.map(m => m.id); openTab(order[(order.indexOf(tab) + 1) % order.length]); break; }
      case 'ArrowLeft': { const order = MENUS.map(m => m.id); openTab(order[(order.indexOf(tab) - 1 + order.length) % order.length]); break; }
      case 'F1': helpOpen = true; break;
      case 'F2':
        if (cur?.id) {
          const i = favs.indexOf(cur.id);
          if (i >= 0) favs.splice(i, 1); else favs.push(cur.id);
          state.profiles.__favs = favs; save('profiles');
          flash(i >= 0 ? 'Removed from Favorites.' : 'Added to Favorites.');
        }
        break;
      case 'F3': popup = { kind: 'favs' }; break;
      case 'F4': popup = { kind: 'info', title: 'CPU Specifications', text: ctx.cpuSpecs() }; break;
      case 'F5': popup = { kind: 'info', title: 'MEMORY-Z', text: ctx.memoryZ() }; break;
      case 'F6': loadDefaults(); break;
      case 'F7': mode = mode === 'ez' ? 'advanced' : 'ez'; break;
      case 'F8': openTab('PROFILE'); break;
      case 'F9': openTab('PROFILE'); flash('Pick a profile slot and choose Save.'); break;
      case 'F10': confirmSave(); break;
      case 'F12': flash('No FAT32 USB flash drive detected. Screenshot not saved.'); break;
      default: return;
    }
    render();
  });

  firstSelectable();
  render();
  // Refresh only the live header; re-rendering the body would reset open controls.
  const live = setInterval(() => { const h = el.querySelector('.b-head'); if (h) h.innerHTML = header(); }, 1000);
  return () => { clearInterval(live); clearTimeout(toastTimer); sim.stop(); };
}

export { MEMORY_TRY_IT };
