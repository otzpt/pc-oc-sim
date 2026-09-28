// Physics and stability model. Pure functions: settings + silicon + load in,
// operating point out. Calibrated so stock and XMP numbers land near published
// reviews of this hardware; everything past that is a model, not a measurement.
import { CPU, GPU, RAM, PBO_MOBO_LIMITS, PSU } from './hardware.js';
import { MEMORY_TRY_IT } from './schema.js';

// ---------- helpers ----------
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerpTable = (t, x) => {
  if (x <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (x <= t[i][0]) {
      const [x0, y0] = t[i - 1], [x1, y1] = t[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return t[t.length - 1][1];
};
const isAuto = v => v === 'Auto' || v === undefined;
const num = (v, fallback) => (isAuto(v) ? fallback : Number(v));
const even = x => (x % 2 ? x + 1 : x);

// Voltage an average 5700X core needs at 60 °C for a Cinebench-class load.
// Calibrated to: stock all-core ~4.0 GHz at ~1.17 V, manual 4.5 GHz needing ~1.30 V
// set voltage with Auto LLC (TechPowerUp got 4.5 GHz all-core on a retail chip).
const VF = [[3.0, 0.90], [3.6, 0.98], [4.0, 1.06], [4.2, 1.11], [4.4, 1.18], [4.5, 1.225],
  [4.6, 1.28], [4.7, 1.35], [4.8, 1.44], [4.9, 1.56], [5.0, 1.70]];
export const vfNeed = f => lerpTable(VF, f);

// Extra voltage a workload needs on top of the table (transients, AVX current steps).
export const WORKLOADS = {
  idle:     { wl: 0.02, extra: 0.030, label: 'Idle' },
  light:    { wl: 0.12, extra: 0.028, label: 'Desktop' },
  single:   { wl: 1.00, extra: 0.026, label: 'Single thread' },
  cb:       { wl: 1.00, extra: 0.010, label: 'Cinebench-class render' },
  game:     { wl: 0.45, extra: 0.020, label: 'Game' },
  sfft:     { wl: 1.28, extra: 0.018, label: 'Small FFT AVX2' },
  linpack:  { wl: 1.38, extra: 0.022, label: 'Linpack AVX2' },
  ycruncher:{ wl: 1.22, extra: 0.026, label: 'y-cruncher VST' },
  memtest:  { wl: 0.55, extra: 0.012, label: 'Memory test' },
};

const CDYN = 1.165;          // W / (V^2 * GHz), fitted to 76 W PPT at ~4.0 GHz all-core
const CO_STEP = 0.003;       // V per Curve Optimizer count
const LLC_MOHM = { Auto: 0.70, 'Mode 1': 0.0, 'Mode 2': 0.10, 'Mode 3': 0.20, 'Mode 4': 0.30,
  'Mode 5': 0.45, 'Mode 6': 0.60, 'Mode 7': 0.80, 'Mode 8': 1.00 };

// ---------- settings -> effective configuration ----------
export function resolve(c) {
  const warn = [];
  // Memory profile: JEDEC, XMP or a Memory Try It preset.
  let base = { ...RAM.jedec };
  if (c.axmp === 'Profile 1') base = { ...RAM.xmp };
  const tryIt = MEMORY_TRY_IT.find(p => p[0] === c.tryIt);
  if (tryIt) base = { mt: tryIt[1], cl: tryIt[2][0], rcd: tryIt[2][1], rp: tryIt[2][2], ras: tryIt[2][3], v: tryIt[3] };
  const mt = isAuto(c.dramFreq) ? base.mt : Number(String(c.dramFreq).replace('DDR4-', ''));
  const tck = 2000 / mt;                       // ns per memory clock
  const scale = ns => Math.ceil(ns / tck - 0.01);
  const fromBase = key => (mt === base.mt ? base[key] : scale(base[key] * (2000 / base.mt)));
  const gdm = c.GDM === 'Disabled' ? false : true;
  const t = {
    cl: num(c.tCL, fromBase('cl')),
    rcdrd: num(c.tRCDRD, fromBase('rcd')),
    rcdwr: num(c.tRCDWR, fromBase('rcd')),
    rp: num(c.tRP, fromBase('rp')),
    ras: num(c.tRAS, fromBase('ras')),
    rrds: num(c.tRRDS, scale(3.7)),
    rrdl: num(c.tRRDL, scale(5.3)),
    faw: num(c.tFAW, scale(21)),
    wtrs: num(c.tWTRS, scale(2.5)),
    wtrl: num(c.tWTRL, scale(7.5)),
    wr: num(c.tWR, scale(15)),
    rtp: num(c.tRTP, scale(7.5)),
    rfc: num(c.tRFC, scale(350)),
  };
  t.cwl = num(c.tCWL, t.cl - (t.cl > 16 ? 2 : 0));
  t.rc = num(c.tRC, t.ras + t.rp);
  if (gdm) { t.cl = even(t.cl); t.cwl = even(t.cwl); t.wr = even(t.wr); }
  const cmd = c.CmdRate === '2T' ? '2T' : '1T';

  // Fabric
  const mclk = Math.round(mt / 2);            // 2133 -> 1067, matching the FCLK list
  // Auto keeps 1:1 unless FCLK is also Auto and the DRAM runs above 3600.
  const uclkDiv = c.uclk === 'UCLK=MEMCLK/2' || (c.uclk === 'Auto' && isAuto(c.fclk) && mt > 3600) ? 2 : 1;
  const fclk = isAuto(c.fclk) ? Math.min(mclk, 1800) : parseInt(c.fclk, 10);
  const sync = uclkDiv === 1 && fclk === mclk;

  // Voltages
  const vdram = num(c.vdram, base.v);
  const vsoc = num(c.vsoc, mt > 3200 || c.axmp === 'Profile 1' ? 1.1 : 1.0);
  const vddgIod = num(c.vddgIod, fclk > 1800 ? 1.0 : 0.95);
  const vddgCcd = num(c.vddgCcd, 0.95);
  const vddp = num(c.vddp, 0.9);
  if (vddgIod > vsoc - 0.04 || vddgCcd > vsoc - 0.04) warn.push('VDDG must stay at least 40 mV below SoC voltage; the SMU clips it.');

  // CPU
  const manualRatio = !isAuto(c.ratio);
  const cores = { Auto: 8, 'SIX (3 + 3)': 6, 'FOUR (2 + 2)': 4, 'TWO (1 + 1)': 2 }[c.downcore] ?? 8;
  const pbo = c.PBO === 'Enabled' || c.PBO === 'Advanced';
  let limits = { ppt: CPU.pptW, tdc: CPU.tdcA, edc: CPU.edcA };
  if (c.PBO === 'Enabled' || (c.PBO === 'Advanced' && (c.pboLimits === 'Motherboard' || c.pboLimits === 'Auto'))) limits = { ...PBO_MOBO_LIMITS };
  if (c.PBO === 'Advanced' && c.pboLimits === 'Manual') limits = { ppt: +c.ppt, tdc: +c.tdc, edc: +c.edc };
  const adv = c.PBO === 'Advanced';
  const scalar = adv && c.pboScalarCtrl === 'Manual' ? parseInt(c.pboScalar, 10) : 1;
  const override = adv && c.boostOverrideCtrl === 'Enabled (Positive)' ? Number(c.boostOverride) / 1000 : 0;
  const thermLimit = adv && c.thermCtrl === 'Manual' ? Number(c.thermLimit) : CPU.tjmax;
  const co = Array.from({ length: 8 }, (_, i) => {
    if (!adv || c.coMode === 'Disable') return 0;
    if (c.coMode === 'All Cores') return (c.coSignAll === 'Negative' ? -1 : 1) * Number(c.coMagAll);
    return (c[`coSign${i}`] === 'Negative' ? -1 : 1) * Number(c[`coMag${i}`]);
  });
  const vMode = c.vcoreMode;
  const vcoreSet = vMode === 'Override Mode' ? Number(c.vcore) : null;
  const vOffset = vMode === 'Offset Mode' ? Number(c.vcoreOffset) : 0;
  const llc = LLC_MOHM[c.llc] ?? 0.7;
  if (manualRatio && vMode === 'Auto') warn.push('Manual ratio with Auto Vcore: the board requests the P0 VID (about 1.375 V) all-core.');
  if (manualRatio && pbo) warn.push('A fixed CPU ratio disables Precision Boost, so PBO and Curve Optimizer settings have no effect.');
  const ovp = c.ovp === 'Auto' ? 1.55 : parseFloat(c.ovp);
  const vrmLimit = { Auto: 105, '95°C': 95, '105°C': 105, '115°C': 115, Disabled: 150 }[c.vrmOtp] ?? 105;

  return {
    cpu: {
      mode: manualRatio ? 'manual' : c.cpb === 'Disabled' ? 'nocpb' : pbo ? 'pbo' : 'stock',
      ratioGHz: manualRatio ? Number(c.ratio) / 10 : null,
      cores, smt: c.smt !== 'Disabled', cstates: c.cstate !== 'Disabled',
      limits, scalar, override, thermLimit, co,
      vMode, vcoreSet, vOffset, llc, ovp, vrmLimit,
      spread: c.spread === 'Enabled',
    },
    mem: { mt, mclk, fclk, uclkDiv, sync, t, cmd, gdm, powerDown: c.PowerDown === 'Enabled', vdram, vsoc, vddgIod, vddgCcd, vddp,
      procOdt: c.ProcODT, profile: c.axmp === 'Profile 1' ? 'XMP' : tryIt ? tryIt[0] : 'JEDEC', tsme: c.tsme === 'Enabled' },
    warn,
  };
}

// ---------- memory ----------
// Returns the worst margin (ns-like units, >0 is fine) and the limiting reason.
export function memMargin(m, sil, tDram = 40) {
  const tck = 2000 / m.mt;
  const q = sil.dramQuality;
  const dv = m.vdram - 1.35;
  const checks = [];
  const add = (why, value) => checks.push([why, value]);
  add('tCL', m.t.cl * tck - (9.0 + q - 3.5 * dv + 0.015 * (tDram - 40)));
  add('tRCDRD', m.t.rcdrd * tck - (10.4 + q - 2.0 * dv + 0.01 * (tDram - 40)));
  add('tRCDWR', (m.t.rcdwr * tck - (8.8 + q - 2.0 * dv)) );
  add('tRP', m.t.rp * tck - (10.2 + q - 2.0 * dv));
  add('tRAS', (m.t.ras * tck - 20) / 4 + (m.t.ras >= m.t.rcdrd + m.t.cl ? 0 : -0.8));
  add('tRC', m.t.rc >= m.t.ras + m.t.rp ? 1 : -0.6);
  add('tRFC', (m.t.rfc * tck - (262 + 20 * q + 1.6 * (tDram - 40))) / 30);
  add('tRRDS', m.t.rrds * tck - 2.5);
  add('tRRDL', m.t.rrdl * tck - 4.2);
  add('tFAW', (m.t.faw * tck - 13) / 3);
  add('tWR', (m.t.wr * tck - 9) / 2);
  add('tRTP', m.t.rtp * tck - 5);
  add('tWTRS', m.t.wtrs * tck - 1.8);
  add('tWTRL', m.t.wtrl * tck - 5.2);
  // DIMM and controller speed ceilings.
  add('DIMM speed', (4000 + dv * 1600 - m.mt) / 400);
  const imcCeil = m.uclkDiv === 1 ? sil.imcMaxMT : 4800;
  add('IMC (UCLK)', (imcCeil - m.mt) / 400 + (m.vsoc - (1.0 + Math.max(0, m.mt - 3200) / 4000)) * 3);
  // Signal integrity: termination, command rate.
  const odt = m.procOdt === 'Auto' ? (m.mt > 3200 ? 40 : 43.6) : parseFloat(m.procOdt);
  const odtPen = Math.abs(odt - (m.mt > 3600 ? 38 : 42)) / 60;
  const cmdPen = m.cmd === '1T' && !m.gdm && m.mt > 3400 ? 0.2 : 0;
  add('Signal integrity', 0.7 - 0.00035 * Math.max(0, m.mt - 3200) - odtPen - cmdPen + dv * 0.3);
  if (m.vdram > 1.6) add('DRAM overvoltage', -0.2);
  checks.sort((a, b) => a[1] - b[1]);
  return { margin: checks[0][1], why: checks[0][0], all: checks };
}

export function fclkMargin(m, sil) {
  const socBonus = (m.vsoc - 1.1) * 300 + (m.vddgIod - 1.0) * 400;
  return sil.fclkMax + clamp(socBonus, -80, 40) - m.fclk; // MHz, >0 is fine
}

export function memPerf(m) {
  const tck = 2000 / m.mt;
  const lat = 34 + 21000 / m.fclk + 0.9 * m.t.cl * tck + 0.9 * m.t.rcdrd * tck + 0.004 * m.t.rfc * tck
    + 0.2 * (m.t.rrds + m.t.rrdl) * tck + (m.sync ? 0 : m.uclkDiv === 2 ? 11 : 6)
    + (m.cmd === '2T' ? 1.5 : m.gdm ? 0.6 : 0) + (m.powerDown ? 1 : 0) + (m.tsme ? 5 : 0);
  const read = Math.min(m.mt * 16 * 0.93, m.fclk * 32 * 0.98) / 1000;
  const write = m.fclk * 16 * 0.97 / 1000;
  const copy = Math.min(read, write * 2) * 0.9;
  return { latency: lat, read, write, copy };
}

// ---------- CPU operating point ----------
function leak(v, t) { return 0.5 * Math.exp((v - 1.0) * 4) * (1 + 0.012 * (t - 50)); }

// V the fused (factory) curve gives a core at f, before CO/scalar.
// Factory guardband: larger at lower clocks, shrinks above the stock 4.6 GHz ceiling.
const guardband = f => (f <= CPU.boostGHz ? 0.115 + 0.025 * (CPU.boostGHz - f) : 0.115 - 0.15 * (f - CPU.boostGHz));
function fusedV(f, sil, i) {
  return vfNeed(f) + sil.chipOffset + sil.cores[i] + guardband(f);
}

// One solve of the CPU for a load. thermalCap/vrmCap come from the live sim.
export function cpuPoint(cfg, sil, loadKind, env) {
  const c = cfg.cpu;
  const W = WORKLOADS[loadKind] ?? WORKLOADS.idle;
  const T = env.tctl ?? 50;
  const n = c.cores;
  const allLoaded = !['idle', 'light', 'single'].includes(loadKind);
  const loaded = loadKind === 'single' ? 1 : allLoaded ? n : 0;
  const smtWl = c.smt ? 1 : 0.86;
  const socP = 6 + 9 * cfg.mem.vsoc ** 2 * (cfg.mem.fclk / 1600);
  const idleCoreW = c.cstates ? 0.15 : 0.9;
  const lightW = loadKind === 'light' ? W.wl : 0;

  const evalAt = (fAll, fOne, vFor) => {
    const cores = [];
    let pc = 0;
    for (let i = 0; i < n; i++) {
      const one = env.core ?? 0;                 // which core a single-thread load runs on
      const active = loaded === 1 ? i === one : i < loaded;
      const f = loaded === 1 ? (i === one ? fOne : Math.min(fOne, 3.6)) : fAll;
      const v = vFor(f, i, active);
      const wl = active ? W.wl * smtWl : lightW;
      const p = (active || lightW ? CDYN * v * v * f * wl : 0) + (active ? leak(v, T) : idleCoreW + leak(v, T) * 0.25);
      pc += p;
      // eff = HWiNFO-style effective clock (time-averaged, drops when the core sleeps)
      const eff = active ? f : lightW ? f * Math.min(1, lightW * 2.5) : c.cstates ? 0.02 : f * 0.08;
      cores.push({ f, eff, fReq: f, v, p, active });
    }
    return { cores, pCores: pc, pkg: pc + socP };
  };

  let res;
  if (c.mode === 'manual') {
    const f = Math.min(c.ratioGHz, env.vrmCapGHz ?? 9, env.prochotGHz ?? 9);
    const vSet = c.vcoreSet ?? (1.375 + c.vOffset);
    // Loadline droop: iterate because current depends on voltage.
    let v = vSet;
    for (let k = 0; k < 4; k++) {
      const r = evalAt(f, f, () => v);
      const I = r.pCores / v;
      v = vSet - I * c.llc / 1000 + (c.llc === 0 ? 0.012 : 0);
    }
    res = evalAt(f, f, () => v);
    res.vSet = vSet;
    res.vEff = v;
  } else {
    // Precision Boost: walk down from the ceiling until every limit holds.
    const top = c.mode === 'nocpb' ? CPU.baseGHz : CPU.boostGHz + c.override;
    const cap = Math.min(top, env.thermalCapGHz ?? 9, env.vrmCapGHz ?? 9, env.prochotGHz ?? 9);
    const scalarV = 0.004 * (c.scalar - 1);
    const vFor = (f, i) => {
      let v = fusedV(f, sil, i) + c.co[i] * CO_STEP + scalarV + c.vOffset;
      return Math.min(v, CPU.maxVid);
    };
    let fOne = cap;
    // single-core ceiling also limited by max VID
    const oc = env.core ?? 0;
    while (fOne > 3.0 && fusedV(fOne, sil, oc) + c.co[oc] * CO_STEP > CPU.maxVid + 0.01) fOne -= 0.025;
    let fAll = Math.min(cap, fOne);
    const lim = c.limits;
    for (let guard = 0; guard < 120; guard++) {
      res = evalAt(fAll, fOne, vFor);
      const vAvg = res.cores.reduce((s, x) => s + x.v, 0) / n;
      const I = res.pCores / vAvg;
      if (res.pkg <= lim.ppt && I <= lim.tdc && I * 1.12 <= lim.edc) break;
      if (loaded === 1) fOne -= 0.025; else fAll -= 0.025;
    }
    res.vSet = null;
    res.vEff = Math.max(...res.cores.map(x => (x.active ? x.v : 0)), res.cores[0].v);
  }

  // Stability margins per core (V). Positive is stable.
  const tempTerm = 0.0006 * Math.max(0, T - 60);
  const margins = res.cores.map((core, i) => {
    if (!core.active && loadKind !== 'idle' && loadKind !== 'light') return 1;
    const extra = core.active ? W.extra : WORKLOADS[loadKind === 'light' ? 'light' : 'idle'].extra;
    const f = core.active ? core.fReq : Math.max(core.fReq, c.mode === 'manual' ? c.ratioGHz : CPU.boostGHz - 0.1);
    if (c.mode === 'manual') {
      const need = vfNeed(f) + sil.chipOffset + sil.cores[i] + extra + tempTerm;
      return res.vEff - need;
    }
    // Boost mode: fused curve has guardband; CO eats it; fuse error per core.
    const gb = guardband(f);
    const llcAdj = (0.7 - c.llc) * 0.012;
    return gb - extra - tempTerm + c.co[i] * CO_STEP + 0.004 * (c.scalar - 1) - sil.cores[i] * 0.6 + c.vOffset + llcAdj;
  });

  const vAvg = res.cores.reduce((s, x) => s + x.v, 0) / n;
  const current = res.pCores / (res.vEff || vAvg);
  return {
    ...res,
    loaded, socP, current, margins,
    worst: Math.min(...margins),
    worstCore: margins.indexOf(Math.min(...margins)),
    fMax: Math.max(...res.cores.map(x => x.f)),
    fAvgActive: loaded ? res.cores.filter(x => x.active).reduce((s, x) => s + x.f, 0) / loaded : res.cores[0].f,
  };
}

// ---------- GPU operating point ----------
export function gpuPoint(tune, sil, loaded, env) {
  const vMax = tune.voltage > 0 ? GPU.maxVoltageUnlocked : GPU.maxVoltage;
  const pl = GPU.tdpW * tune.power / 100;
  const fOfV = v => 1350 + 1400 * (v - 0.65) + tune.core;
  const T = env.gpuT ?? 40;
  const bins = [45, 52, 58, 64, 70, 76].filter(b => T > b).length;
  const tLimitBins = T > tune.temp ? Math.ceil((T - tune.temp) * 2) : 0;
  const memMT = 2 * (6001 + tune.mem);
  const memW = 18 + 6 * (memMT - 12002) / 2000;
  const powerAt = (v, f) => 12 + memW * 0.5 + 0.042 * v * v * f * (loaded ? 1 : 0.02);
  let v = loaded ? vMax : 0.65;
  let f = fOfV(v) - 15 * (bins + tLimitBins);
  if (!loaded) f = 300;
  let limiter = loaded ? 'Voltage' : 'Idle';
  if (loaded) {
    while (powerAt(v, f) > pl && v > 0.7) { v -= 0.00625; f = fOfV(v) - 15 * (bins + tLimitBins); limiter = 'Power'; }
    if (tLimitBins) limiter = 'Thermal';
  }
  const coreMargin = (sil.gpuCoreMax - 1935) - tune.core - 0.5 * Math.max(0, T - 60) + (tune.voltage > 0 ? 12 : 0);
  const memMargin = sil.gpuMemMax - tune.mem;
  const edc = memMargin < 0 ? 1 - Math.min(0.35, -memMargin / 700) : 1;
  const bw = 24 * memMT / 1000 * edc;
  return {
    f: Math.round(f), v, power: loaded ? powerAt(v, f) : 11 + memW * 0.3, limiter, memMT, bw,
    coreMargin, memMargin, powerLimit: pl,
  };
}

// ---------- scores ----------
export function scores(cfg, cpuAll, cpuOne, mp, gp) {
  const memF = 1 - (mp.latency - 72) * 0.0008;
  const smt = cfg.cpu.smt ? 1 : 0.8;
  const cbMulti = cpuAll.cores.filter(x => x.active).reduce((s, x) => s + x.f, 0) * 419 * smt * memF;
  const cbSingle = cpuOne.fMax * 326 * (1 - (mp.latency - 72) * 0.001);
  const tsCpu = cpuAll.fAvgActive * 2550 * (1 - (mp.latency - 72) * 0.004) * (cfg.cpu.smt ? 1 : 0.72) * (cfg.cpu.cores / 8);
  const tsGpu = 6300 * (0.7 * gp.f / 1890 + 0.3 * gp.bw / 288);
  const ts = 1 / (0.85 / tsGpu + 0.15 / tsCpu);
  return { cbMulti, cbSingle, tsCpu, tsGpu, ts };
}

// ---------- PSU ----------
export function wallPower(dc) {
  const e = lerpTable(PSU.eff, dc / PSU.watts);
  return { wall: dc / e, eff: e };
}

// ---------- POST ----------
// Decides what happens when the machine is powered on with these settings.
export function postCheck(cfg, sil) {
  const bootEnv = { tctl: 38, thermalCapGHz: 9 };
  const cpu = cpuPoint(cfg, sil, 'light', bootEnv);
  if (cfg.cpu.mode === 'manual' && cfg.cpu.vcoreSet && cfg.cpu.vcoreSet > cfg.cpu.ovp) {
    return { ok: false, stage: 'CPU', fatal: true, reason: `CPU Over Voltage Protection tripped (${cfg.cpu.vcoreSet.toFixed(3)} V > ${cfg.cpu.ovp.toFixed(3)} V)` };
  }
  if (cpu.worst < -0.035) return { ok: false, stage: 'CPU', reason: `Core ${cpu.worstCore} cannot run ${cpu.cores[cpu.worstCore].fReq.toFixed(2)} GHz at ${cpu.vEff.toFixed(3)} V` };
  const mm = memMargin(cfg.mem, sil, 32);
  if (mm.margin < -0.35) return { ok: false, stage: 'DRAM', reason: `Memory training failed (${mm.why})` };
  const fm = fclkMargin(cfg.mem, sil);
  if (fm < -66) return { ok: false, stage: 'DRAM', reason: `Infinity Fabric does not train at FCLK ${cfg.mem.fclk} MHz` };
  return { ok: true, cpuMargin: cpu.worst, cpuCore: cpu.worstCore, memMargin: mm.margin, memWhy: mm.why, fclkMargin: fm, bootRisk: cpu.worst < 0 || mm.margin < 0 };
}

export { clamp, lerpTable };
