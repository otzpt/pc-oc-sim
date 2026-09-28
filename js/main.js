// Power state machine: off -> POST -> (BIOS | OS boot) -> desktop, plus the
// failure paths (no POST, OC fail recovery, BSOD, sudden reboot, power off).
import { state, save, clearCmos } from './state.js';
import { resolve, postCheck } from './model.js';
import { defaults, allItems, MENUS } from './schema.js';
import { sim } from './sim.js';
import { openBios } from './bios.js';
import { openDesktop } from './os.js';
import { CPU, BOARD, RAM, GPU, COOLER, SSD, PSU, CASE } from './hardware.js';
import { orb } from './ui/orb.js';
import { sound } from './ui/sound.js';
import { STOP_CODES, likelyCause } from './stopcodes.js';
import { esc } from './ui/esc.js';

const screen = document.getElementById('screen');
const fit = document.getElementById('screenFit');
const readout = document.getElementById('readout');
const stage = document.querySelector('.stage');
const hdd = document.getElementById('hddLed');
const powerBtn = document.getElementById('btnPower');
const powerLed = mode => {
  powerBtn.classList.toggle('on', mode === 'on');
  powerBtn.classList.toggle('standby', mode !== 'on');
  stage.dataset.on = mode === 'on' ? '1' : '0';
};
// Disk activity LED on the case: busy while POSTing and booting, then occasional blips.
let hddTimer = 0;
function diskActivity(ms) {
  clearInterval(hddTimer);
  const end = performance.now() + ms;
  hddTimer = setInterval(() => {
    hdd.classList.toggle('blink', Math.random() < 0.55);
    if (performance.now() > end) { clearInterval(hddTimer); hdd.classList.remove('blink'); }
  }, 90);
}
const leds = Object.fromEntries([...document.querySelectorAll('[data-led]')].map(el => [el.dataset.led, el]));

export const machine = {
  power: 'off',          // off | post | bios | boot | os | fail
  delHeld: false,
  keyHandler: null,
  timers: [],
  cleanup: null,
};

// Scale the 1280x720 framebuffer to the monitor.
function rescale() {
  const s = fit.clientWidth / 1280;
  screen.style.transform = `scale(${s})`;
  screen.dataset.scale = s;
}
new ResizeObserver(rescale).observe(fit);
rescale();
export const screenScale = () => Number(screen.dataset.scale || 1);

function later(fn, ms) { const id = setTimeout(fn, ms); machine.timers.push(id); return id; }
function clearTimers() { machine.timers.forEach(clearTimeout); machine.timers = []; }

export function show(html, cls) {
  machine.cleanup?.();
  machine.cleanup = null;
  machine.keyHandler = null;
  screen.innerHTML = '';
  stage.dataset.screen = (cls ?? '').split(' ')[0] || 'black';
  const el = document.createElement('div');
  el.className = `scr ${cls ?? ''}`;
  if (html) el.innerHTML = html;
  screen.appendChild(el);
  return el;
}

function setLed(stage, mode) {
  Object.values(leds).forEach(l => l.classList.remove('lit', 'fail'));
  if (stage) leds[stage].classList.add(mode === 'fail' ? 'fail' : 'lit');
}

function status(text) { readout.textContent = text; }

// ---------- power ----------
export function powerOn() {
  if (machine.power !== 'off') return;
  powerLed('on');
  sound.fansOn();
  post();
}

export function powerOff(reason) {
  clearTimers();
  sim.stop();
  machine.power = 'off';
  powerLed('standby');
  sound.fansOff();
  setLed(null);
  show('', 'black');
  status(reason ? `Off. ${reason}` : 'Off. Press the power button on the monitor.');
}

export function reboot() {
  clearTimers();
  sim.stop();
  machine.power = 'post';
  show('', 'black');
  later(post, 700);
}

// ---------- POST ----------
function post() {
  clearTimers();
  machine.power = 'post';
  machine.delHeld = false;
  const cfg = resolve(state.cmos);
  const res = postCheck(cfg, state.silicon);
  status('POST...');
  diskActivity(1800);

  // Debug LEDs walk CPU -> DRAM -> VGA -> BOOT, stopping where POST fails.
  const order = ['CPU', 'DRAM', 'VGA', 'BOOT'];
  const stopAt = res.ok ? 4 : order.indexOf(res.stage);
  show('', 'black');
  order.forEach((stage, i) => {
    if (i > stopAt) return;
    later(() => setLed(stage, i === stopAt && !res.ok ? 'fail' : 'lit'), 250 + i * 450);
  });

  if (!res.ok) {
    if (res.fatal) { later(() => powerOff(res.reason), 900); return; }
    state.bootFails += 1; save('bootFails');
    later(() => {
      show('<span>No Signal</span>', 'nosignal');
      status(`No POST: ${res.reason}. Retry ${state.bootFails}/3.`);
    }, 250 + stopAt * 450 + 300);
    // The board power-cycles itself between training attempts.
    later(() => sound.fansOff(), 3000);
    later(() => { sound.fansOn(); state.bootFails >= 3 ? ocFailed(res) : post(); }, 4200);
    return;
  }

  later(() => {
    setLed(null);
    if (state.cmos.postBeep === 'Enabled') sound.beep(1);
    const el = show(`
      <div class="post-logo"><div class="brand">PRO SERIES</div><div class="sub">B450M PRO-VDH MAX</div></div>
      <div class="post-foot"><span>Press DEL key to enter Setup Menu, F11 to enter Boot Menu</span><span>${cfg.mem.mt} MT/s</span></div>`, 'post');
    status(`POST OK. Press or hold DEL to enter BIOS. ${cfg.warn[0] ?? ''}`);
    machine.keyHandler = e => { if (e.key === 'Delete') enterSetup(); if (e.key === 'F11') enterSetup(); };
    if (state.cmos.fullLogo === 'Disabled') {
      el.innerHTML = `<div class="post-text">American Megatrends Inc.\nMS-7A38 BIOS ${BOARD.bios}\n\n${CPU.name}\nSpeed : ${(cfg.cpu.ratioGHz ?? CPU.baseGHz).toFixed(2)} GHz\n\nMemory Frequency ${cfg.mem.mt} MT/s ${cfg.mem.profile}\nTotal Memory 16384 MB\n\nNVMe: KIOXIA-EXCERIA PLUS G3 SSD\n\nPress DEL key to enter Setup Menu, F11 to enter Boot Menu</div>`;
    }
  }, 2100);
  later(() => {
    if (machine.power !== 'post') return;
    if (machine.delHeld) return enterSetup();
    bootOs(cfg, res);
  }, 5400);
}

function enterSetup() {
  if (machine.power !== 'post') return;
  clearTimers();
  machine.power = 'bios';
  state.bootFails = 0; save('bootFails');
  setLed(null);
  status('BIOS setup. Changes apply after Save & Reboot (F10).');
  const el = show('', 'bios-host');
  machine.cleanup = openBios(el, {
    reboot: () => reboot(),
    exitToOs: () => { machine.power = 'post'; bootOs(resolve(state.cmos), postCheck(resolve(state.cmos), state.silicon)); },
    setKeyHandler: fn => { machine.keyHandler = fn; },
  });
}

// MSI "OC Fail Protect": after repeated failed boots it restores OC defaults.
function ocFailed(res) {
  clearTimers();
  machine.power = 'fail';
  const d = defaults();
  const ocIds = new Set(allItems(MENUS.find(m => m.id === 'OC').items).map(i => i.id));
  for (const id of ocIds) state.cmos[id] = d[id];
  state.bootFails = 0;
  save('cmos'); save('bootFails');
  setLed(null);
  show(`<p><b>Warning!!!</b> The previous overclocking had failed,</p>
    <p>and system will restore its defaults setting.</p>
    <p>Press F1 key to enter Setup menu, any other key to continue.</p>
    <p style="color:#888;margin-top:32px">Last failure: ${res.reason}</p>`, 'ocfail');
  status('OC Fail Protect restored the OC menu to defaults.');
  machine.keyHandler = e => {
    if (e.key === 'F1') { machine.power = 'post'; enterSetup(); }
    else post();
  };
}

// ---------- OS boot ----------
function bootOs(cfg, res) {
  clearTimers();
  machine.power = 'boot';
  setLed(null);
  const el = show(`<div class="orbwrap">${orb(120, true)}<div class="label">Starting VOID 7</div></div><div class="copy">Simulated operating system</div>`, 'winboot');
  status('Booting VOID 7...');
  diskActivity(3400);
  // A marginal OC can crash during boot, which loads every core in bursts.
  const risky = res.cpuMargin < 0.005 || res.memMargin < 0.05;
  later(() => {
    if (risky && Math.random() < 0.5) {
      const cpuFault = res.cpuMargin < 0.005;
      bsod(cpuFault
        ? { name: 'CLOCK_WATCHDOG_TIMEOUT', code: '0x00000101', kind: 'cpu', where: `Core ${res.cpuCore}` }
        : { name: 'MEMORY_MANAGEMENT', code: '0x0000001A', kind: 'mem', where: res.memWhy });
      return;
    }
    desktop(cfg);
  }, 3600);
  return el;
}

function desktop(cfg) {
  machine.power = 'os';
  state.bootFails = 0; save('bootFails');
  sound.chime();
  const el = show('', 'win7 desk-host');
  sim.boot(cfg);
  machine.cleanup = openDesktop(el, {
    shutdown: () => { sim.stop(); powerOff(); },
    restart: () => reboot(),
    setKeyHandler: fn => { machine.keyHandler = fn; },
  });
}

// ---------- failures ----------
function bsod(ev) {
  clearTimers();
  sim.stop();
  machine.power = 'fail';
  sound.crash();
  const params = Array.from({ length: 4 }, () => '0x' + Math.floor(Math.random() * 2 ** 32).toString(16).toUpperCase().padStart(8, '0'));
  show(`A problem has been detected and VOID 7 has been shut down to prevent damage
to your computer.

${ev.name}

If this is the first time you've seen this Stop error screen,
restart your computer. If this screen appears again, follow
these steps:

Check to make sure any new hardware or software is properly installed.
If you recently changed BIOS settings (overclocking, memory timings or
voltages), load the defaults and test the changes one at a time.

Technical information:

*** STOP: ${ev.code} (${params.join(', ')})
${ev.where ? `\n*** Source: ${ev.where}` : ''}

Collecting data for crash dump ...
Initializing disk for crash dump ...
Beginning dump of physical memory.
Dumping physical memory to disk:  100
Physical memory dump complete.
Contact your system admin or technical support group for further assistance.`, 'bsod');
  const why = likelyCause(ev.kind, ev.where);
  const note = document.createElement('div');
  note.className = 'bsod-note';
  note.innerHTML = `<b>What this means</b> (simulator note)
${esc(ev.name)} (${esc(ev.code)}): ${esc(STOP_CODES[ev.name] ?? 'Windows stopped to prevent damage.')}
<b>Likely cause here:</b> ${esc(why.cause)}
<b>Try:</b> ${esc(why.fix)}`;
  screen.querySelector('.bsod').appendChild(note);
  status(`BSOD ${ev.name}. Rebooting in 25 s (or press any key).`);
  machine.keyHandler = () => reboot();
  later(reboot, 25000);
}

sim.on(ev => {
  // An unstable OC can also hang the BIOS; that shows as a freeze and reset, not a BSOD.
  if (machine.power === 'bios' && (ev.type === 'bsod' || ev.type === 'reboot')) { status('The BIOS froze and the board reset.'); reboot(); return; }
  if (ev.type === 'bsod') bsod(ev);
  if (ev.type === 'reboot') { status(ev.reason); reboot(); }
  if (ev.type === 'poweroff') powerOff(ev.reason);
  if (ev.type === 'tick') {
    sound.fanLevel(Math.max(ev.snap.fans.cpu, ev.snap.fans.sys, ev.snap.fans.gpu));
    stage.style.setProperty('--fan-spin', `${(1.9 - 1.4 * ev.snap.fans.sys).toFixed(2)}s`);
    if (Math.random() < 0.04) diskActivity(120);
  }
  if (ev.type === 'tick' && machine.power === 'os') {
    const s = ev.snap;
    status(`CPU ${s.cpu.fAvgActive.toFixed(2)} GHz ${s.vcore.toFixed(3)} V ${s.temps.tctl.toFixed(0)}°C ${s.cpu.pkg.toFixed(0)} W | GPU ${s.gpu.f} MHz ${s.temps.gpu.toFixed(0)}°C | Wall ${s.wall.toFixed(0)} W${s.throttle ? ` | ${s.throttle} throttling` : ''}`);
  }
});

// ---------- inputs ----------
const pressPower = () => {
  sound.click();
  if (machine.power === 'off') powerOn();
  else if (machine.power === 'os') screen.dispatchEvent(new CustomEvent('acpi-power'));
  else powerOff('Forced off.');
};
powerBtn.addEventListener('click', pressPower);
document.getElementById('btnCasePower').addEventListener('click', pressPower);
document.getElementById('btnReset').addEventListener('click', () => { sound.click(); if (machine.power !== 'off') reboot(); });
document.getElementById('btnCmos').addEventListener('click', () => {
  if (machine.power !== 'off') { status('Turn the PC off before shorting JBAT1.'); return; }
  clearCmos();
  status('CMOS cleared. BIOS settings are back to defaults.');
});

const delBtn = document.getElementById('btnDel');
const holdDel = on => { machine.delHeld = on; delBtn.classList.toggle('held', on); if (on && machine.power === 'post') enterSetup(); };
delBtn.addEventListener('pointerdown', () => holdDel(true));
delBtn.addEventListener('pointerup', () => holdDel(false));
delBtn.addEventListener('pointerleave', () => holdDel(false));

// BIOS uses F-keys; stop the browser from taking them while the PC is on.
window.addEventListener('keydown', e => {
  if (machine.power === 'off') return;
  if (e.key === 'Delete' && machine.power === 'post') holdDel(true);
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (/^F\d+$/.test(e.key) || (!typing && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' '].includes(e.key) && machine.power === 'bios')) e.preventDefault();
  machine.keyHandler?.(e);
});
window.addEventListener('keyup', e => { if (e.key === 'Delete') holdDel(false); });

// Parts list dialog
const parts = [
  ['CPU', `${CPU.name}. ${CPU.cores}C/${CPU.threads}T, ${CPU.baseGHz} to ${CPU.boostGHz} GHz, ${CPU.l3MB} MB L3, ${CPU.tdpW} W TDP (PPT ${CPU.pptW} W), Tjmax ${CPU.tjmax} °C`],
  ['Motherboard', `${BOARD.name} (${BOARD.model}), ${BOARD.chipset}, ${BOARD.vrm}, ${BOARD.superIO}, BIOS ${BOARD.bios}`],
  ['Memory', `${RAM.name} ${RAM.kit} ${RAM.part}. XMP DDR4-3200 16-18-18-38 1.35 V, single rank, in ${RAM.slots.join(' + ')}`],
  ['Cooler', `${COOLER.name}. ${COOLER.heatpipes} heatpipes, ${COOLER.fan}, ${COOLER.airflowCFM} CFM`],
  ['Storage', `${SSD.name}. ${SSD.iface}, ${SSD.controller}, ${SSD.nand}. Runs at PCIe 3.0 x4 in M2_1`],
  ['Graphics', `${GPU.name}. ${GPU.chip}, ${GPU.cuda} CUDA, ${GPU.baseMHz}/${GPU.boostMHz} MHz, ${GPU.memGB} GB ${GPU.memType} ${GPU.memMTs} MT/s ${GPU.memBus}-bit, ${GPU.tdpW} W`],
  ['Case', `${CASE.name}. ${CASE.fans}`],
  ['PSU', `${PSU.name}. ${PSU.watts} W ${PSU.rating}, ${PSU.rails}`],
];
document.getElementById('partsBody').innerHTML = `<table>${parts.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>`;
document.getElementById('btnSpecs').addEventListener('click', () => document.getElementById('partsDialog').showModal());
const muteBtn = document.getElementById('btnMute');
const muteLabel = () => { muteBtn.querySelector('span').textContent = sound.muted ? 'Sound off' : 'Sound on'; muteBtn.querySelector('.ti').className = `ti ${sound.muted ? 'ti-volume-off' : 'ti-volume'}`; };
muteBtn.addEventListener('click', () => { sound.toggleMute(); muteLabel(); });
muteLabel();

powerOff();
