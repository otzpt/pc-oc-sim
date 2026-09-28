// Live simulation: integrates temperatures, fans and throttling over time and
// rolls for errors from the stability margins in model.js.
import { cpuPoint, gpuPoint, memMargin, fclkMargin, wallPower, clamp, lerpTable, WORKLOADS } from './model.js';
import { COOLER } from './hardware.js';
import { state, save } from './state.js';

const HISTORY = 600;
const listeners = new Set();
const emit = ev => listeners.forEach(fn => fn(ev));

const BSOD = {
  cpu: [['CLOCK_WATCHDOG_TIMEOUT', '0x00000101'], ['WHEA_UNCORRECTABLE_ERROR', '0x00000124'], ['SYSTEM_SERVICE_EXCEPTION', '0x0000003B']],
  mem: [['MEMORY_MANAGEMENT', '0x0000001A'], ['IRQL_NOT_LESS_OR_EQUAL', '0x0000000A'], ['PAGE_FAULT_IN_NONPAGED_AREA', '0x00000050'], ['KMODE_EXCEPTION_NOT_HANDLED', '0x0000001E']],
  gpu: [['VIDEO_TDR_FAILURE', '0x00000116']],
  fclk: [['WHEA_UNCORRECTABLE_ERROR', '0x00000124']],
};
const pick = a => a[Math.floor(Math.random() * a.length)];

function fanDuty(curve, temp) {
  if (!curve.smart) return 1;
  return clamp(lerpTable(curve.points.map(([t, d]) => [t, d / 100]), temp), 0.2, 1);
}

export const sim = {
  cfg: null,
  running: false,
  speed: 1,
  t: 0,
  load: { cpu: 'idle', gpu: false, mem: false },
  temps: {},
  caps: { thermal: 9, vrm: 9, prochot: 9 },
  fans: { cpu: 0.3, sys: 0.4, gpu: 0.3 },
  snap: null,
  hist: {},
  stats: {},
  errors: { whea19: 0, whea18: 0, cpuErr: 0, memErr: 0, gpuArt: 0 },

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  boot(cfg) {
    this.cfg = cfg;
    const amb = state.settings.ambient;
    this.temps = { case: amb + 3, sink: amb + 8, tctl: amb + 12, vrm: amb + 8, gpu: amb + 6, dram: amb + 6 };
    this.caps = { thermal: 9, vrm: 9, prochot: 9 };
    this.load = { cpu: 'light', gpu: false, mem: false };
    this.speed = 1;
    this.t = 0;
    this.errors = { whea19: 0, whea18: 0, cpuErr: 0, memErr: 0, gpuArt: 0 };
    this.hist = {};
    this.resetStats();
    this.start();
  },

  setLoad(patch) { Object.assign(this.load, patch); },
  setSpeed(x) { this.speed = x; },
  resetStats() { this.stats = {}; },

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const loop = now => {
      if (!this.running) return;
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      this.tick(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },
  stop() { this.running = false; },

  tick(dtReal) {
    let remaining = dtReal * this.speed;
    // Sub-step so high time-acceleration stays numerically stable.
    while (remaining > 0 && this.running) {
      const dt = Math.min(0.5, remaining);
      remaining -= dt;
      this.step(dt);
    }
    this.frame = (this.frame ?? 0) + 1;
    if (this.frame % 6 === 0 && this.snap) emit({ type: 'tick', snap: this.snap });
  },

  step(dt) {
    const cfg = this.cfg;
    const sil = state.silicon;
    const T = this.temps;
    const amb = state.settings.ambient;
    this.t += dt;

    const kind = this.load.mem && this.load.cpu === 'idle' ? 'memtest' : this.load.cpu;
    const cpu = cpuPoint(cfg, sil, kind, {
      tctl: T.tctl, thermalCapGHz: this.caps.thermal, vrmCapGHz: this.caps.vrm, prochotGHz: this.caps.prochot, core: this.load.core,
    });
    const gpu = gpuPoint(state.gpuTune, sil, this.load.gpu, { gpuT: T.gpu });

    // Fans
    const fans = state.cmos.fans;
    const target = { cpu: fanDuty(fans.CPU_FAN1, T.tctl), sys: fanDuty(fans.SYS_FAN1, T.tctl) };
    const tune = state.gpuTune;
    const gpuTarget = tune.fan === 'auto' ? clamp(0.3 + (T.gpu - 50) / 35 * 0.7, 0.3, 1) : tune.fanPct / 100;
    const slew = (cur, tgt, rate) => cur + clamp(tgt - cur, -rate * dt, rate * dt);
    this.fans.cpu = slew(this.fans.cpu, target.cpu, 0.25 / Math.max(0.05, fans.CPU_FAN1.stepUp));
    this.fans.sys = slew(this.fans.sys, target.sys, 0.25 / Math.max(0.05, fans.SYS_FAN1.stepUp));
    this.fans.gpu = slew(this.fans.gpu, gpuTarget, 0.3);

    // Thermals: first-order lags toward steady-state targets.
    const approach = (cur, tgt, tau) => cur + (tgt - cur) * (1 - Math.exp(-dt / tau));
    const dc = cpu.pkg + gpu.power + 22 + 5 * 1.4;   // board+chipset ~15 W, SSD, RAM, 5 case fans
    T.case = approach(T.case, amb + (cpu.pkg + gpu.power * 0.7 + 30) * 0.022 * (1.35 - 0.35 * this.fans.sys), 90);
    const rSink = 0.30 + 0.16 * (1 - this.fans.cpu);
    T.sink = approach(T.sink, T.case + cpu.pkg * rSink, 35);
    const hot = Math.max(...cpu.cores.map(c => c.p));
    const tctlTarget = T.sink + cpu.pCores * 0.12 + hot * 1.1;
    T.tctl = approach(T.tctl, tctlTarget, 0.8) + (Math.random() - 0.5) * 0.4;
    const I = cpu.current;
    const vrmLoss = 1.2 + 0.0009 * I * I + 0.018 * I + (cfg.cpu.llc < 0.2 ? 0.8 : 0);
    T.vrm = approach(T.vrm, T.case + vrmLoss * 4.5, 60);
    T.gpu = approach(T.gpu, T.case + gpu.power * (0.30 + 0.25 * (1 - this.fans.gpu)), 20);
    T.dram = approach(T.dram, T.case + 4 + (cfg.mem.vdram - 1.2) * 25 + (this.load.mem ? 6 : 0), 120);

    // Precision Boost thermal controller.
    const limit = cfg.cpu.thermLimit;
    if (cfg.cpu.mode !== 'manual') {
      if (T.tctl > limit) this.caps.thermal = Math.max(2.2, Math.min(this.caps.thermal, cpu.fMax) - 0.1 * dt * 4);
      else if (T.tctl < limit - 1.5) this.caps.thermal = Math.min(9, this.caps.thermal + 0.05 * dt * 4);
    } else {
      // Manual OC ignores Tjmax until PROCHOT at 95 °C, then clock-stretches hard.
      if (T.tctl > 95) this.caps.prochot = 3.0;
      else if (T.tctl < 88) this.caps.prochot = 9;
    }
    // Board VRM protection.
    if (T.vrm > cfg.cpu.vrmLimit) this.caps.vrm = Math.max(1.6, Math.min(this.caps.vrm, cpu.fMax) - 0.2 * dt);
    else if (T.vrm < cfg.cpu.vrmLimit - 5) this.caps.vrm = Math.min(9, this.caps.vrm + 0.1 * dt);

    // Hard protections.
    if (T.tctl > 115) return this.fail({ type: 'poweroff', reason: 'CPU THERMTRIP at 115 °C: the CPU cut power to protect itself.' });
    if (T.vrm > 130) return this.fail({ type: 'poweroff', reason: 'VRM over-temperature: the board cut power.' });
    if (dc > 650 * 1.1) return this.fail({ type: 'poweroff', reason: 'PSU over-power protection (OPP) tripped.' });

    // Stability rolls. λ in events per simulated second.
    const roll = lam => Math.random() < 1 - Math.exp(-lam * dt);
    const cpuLam = (1 / 60) * Math.exp(-cpu.worst / 0.006);
    const mm = memMargin(cfg.mem, sil, T.dram);
    const memLam = (1 / 90) * Math.exp(-mm.margin / 0.08) * (this.load.mem ? 1 : 0.15);
    const fm = fclkMargin(cfg.mem, sil);
    const fclkLam = fm < 40 ? 0.4 * Math.exp(-fm / 15) : 0;
    const gpuLam = this.load.gpu ? (1 / 60) * Math.exp(-gpu.coreMargin / 12) : 0;
    const artLam = this.load.gpu && gpu.memMargin < -150 ? 0.5 : 0;

    if (roll(cpuLam)) {
      const stress = !['idle', 'light'].includes(kind);
      const r = Math.random();
      if (cpu.worst < -0.03 || (!stress && r < 0.4) || (stress && r > 0.9)) return this.crash('cpu', `Core ${cpu.worstCore}`);
      if ((!stress && r >= 0.4) || (stress && r > 0.7)) {
        this.errors.whea18++;
        this.logWhea(18, `Cache Hierarchy Error, Processor APIC ID ${cpu.worstCore * 2}`);
        return this.fail({ type: 'reboot', reason: 'WHEA-Logger Event 18: uncorrectable cache hierarchy error, the machine reset.' });
      }
      this.errors.cpuErr++;
      emit({ type: 'cpuError', core: cpu.worstCore, detail: `Rounding error on core ${cpu.worstCore}: expected 0.2500, got 0.5000` });
    }
    if (roll(memLam)) {
      if (this.load.mem && Math.random() < 0.85) {
        this.errors.memErr++;
        emit({ type: 'memError', why: mm.why });
      } else return this.crash('mem', mm.why);
    }
    if (fclkLam && roll(fclkLam)) {
      this.errors.whea19++;
      this.logWhea(19, 'Corrected hardware error, Data Fabric, PCIe/IF link');
      emit({ type: 'whea19' });
      if (fm < -30 && Math.random() < 0.05) return this.crash('fclk', 'Infinity Fabric');
    }
    if (roll(gpuLam)) {
      if (gpu.coreMargin < -40) return this.crash('gpu', 'GPU core');
      emit({ type: 'tdr', detail: 'Display driver nvlddmkm stopped responding and has successfully recovered.' });
    }
    if (artLam && roll(artLam)) { this.errors.gpuArt++; emit({ type: 'artifact' }); }

    // Snapshot for UI
    const pw = wallPower(dc);
    const lim = cfg.cpu.limits;
    const snap = {
      t: this.t, cpu, gpu, temps: { ...T }, fans: { ...this.fans },
      cpuRpm: Math.round(this.fans.cpu * COOLER.fanMaxRpm * (0.98 + Math.random() * 0.02)),
      sysRpm: Math.round(this.fans.sys * 1400 + Math.random() * 10),
      gpuRpm: Math.round(this.fans.gpu * 3300),
      vcore: cpu.vEff + (Math.random() - 0.5) * 0.004,
      vid: cfg.cpu.mode === 'manual' ? cpu.vSet : Math.max(...cpu.cores.map(c => c.v)),
      ppt: cpu.pkg / lim.ppt * 100, tdc: cpu.current / lim.tdc * 100, edc: Math.min(100, cpu.current * 1.12 / lim.edc * 100),
      dc, wall: pw.wall, eff: pw.eff,
      throttle: this.caps.vrm < 9 ? 'VRM' : this.caps.prochot < 9 ? 'PROCHOT' : this.caps.thermal < 9 && cfg.cpu.mode !== 'manual' ? 'Thermal' : '',
      mem: cfg.mem, errors: { ...this.errors },
      load: kind,
    };
    this.snap = snap;
    this.record(snap, dt);
  },

  record(s, dt) {
    const add = (k, v) => {
      (this.hist[k] ??= []).push(v);
      if (this.hist[k].length > HISTORY) this.hist[k].shift();
      const st = (this.stats[k] ??= { min: v, max: v, sum: 0, n: 0 });
      st.min = Math.min(st.min, v); st.max = Math.max(st.max, v); st.sum += v * dt; st.n += dt;
    };
    if ((this._acc = (this._acc ?? 0) + dt) < 0.25 && this.hist.tctl) return;
    this._acc = 0;
    add('tctl', s.temps.tctl);
    add('pkg', s.cpu.pkg);
    add('fcpu', s.cpu.fAvgActive * 1000);
    add('vcore', s.vcore);
    add('vrm', s.temps.vrm);
    add('gpuT', s.temps.gpu);
    add('gpuF', s.gpu.f);
    add('gpuP', s.gpu.power);
    add('wall', s.wall);
  },

  logWhea(id, text) {
    state.whea.push({ id, text, at: new Date().toISOString() });
    if (state.whea.length > 200) state.whea.shift();
    save('whea');
  },

  crash(kind, where) {
    const [name, code] = pick(BSOD[kind]);
    return this.fail({ type: 'bsod', name, code, where });
  },

  fail(ev) {
    this.stop();
    emit(ev);
  },
};

export { WORKLOADS };
