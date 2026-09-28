// Persistent state: CMOS (BIOS settings), the chip's silicon quality, and OS data.
// Everything lives in localStorage so it survives a page reload, like CMOS
// survives a power cycle. Clear CMOS wipes only the BIOS part.
import { defaults } from './schema.js';

const KEY = 'pcsim.v1';

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(`${KEY}.${key}`);
    return raw ? JSON.parse(raw) : fallback();
  } catch {
    return fallback();
  }
}
function store(key, value) {
  try { localStorage.setItem(`${KEY}.${key}`, JSON.stringify(value)); } catch { /* private mode: state lives in memory only */ }
}

// Deterministic PRNG so one "chip" keeps the same quality forever.
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Silicon lottery. Every number here is hidden from the user; they find it by testing.
export function rollSilicon(seed = (Math.random() * 2 ** 31) | 0) {
  const r = mulberry32(seed);
  const gauss = () => (r() + r() + r() + r() - 2) / 0.577; // ~N(0,1)
  const cores = Array.from({ length: 8 }, () => gauss() * 0.014);
  return {
    seed,
    chipOffset: gauss() * 0.018,          // V, whole-chip quality vs average
    cores,                                // V, per-core offset (negative = better core)
    fclkMax: [1800, 1833, 1867, 1900, 1900, 1933, 1967, 2000][Math.floor(r() ** 1.6 * 8)],
    imcMaxMT: 3800 + Math.floor(r() * 5) * 66,   // memory controller ceiling in 1:1
    dramQuality: gauss() * 0.35,          // ns, IC speed vs average (negative = better)
    gpuCoreMax: 2025 + Math.round(gauss() * 30 / 15) * 15, // MHz stable at 1.068 V
    gpuMemMax: 1000 + Math.round(gauss() * 150 / 25) * 25, // Afterburner offset limit
  };
}

export const state = {
  cmos: load('cmos', defaults),
  silicon: load('silicon', rollSilicon),
  profiles: load('profiles', () => ({})),
  gpuTune: load('gpuTune', () => ({ core: 0, mem: 0, power: 100, temp: 83, fan: 'auto', fanPct: 50, voltage: 0 })),
  notes: load('notes', () => ({ 'readme.txt': 'VOID 7 simulated PC.\r\nNothing here touches your real hardware.\r\n' })),
  bench: load('bench', () => []),
  settings: load('settings', () => ({ ambient: 24, speed: 60 })),
  bootFails: load('bootFails', () => 0),
  lastGood: load('lastGood', () => null),
  whea: load('whea', () => []),
};

// Fill in keys added after the save was made.
for (const [k, v] of Object.entries(defaults())) if (!(k in state.cmos)) state.cmos[k] = v;

export function save(key) { store(key, state[key]); }

export function clearCmos() {
  state.cmos = defaults();
  state.bootFails = 0;
  save('cmos'); save('bootFails');
}

export function rerollSilicon() {
  state.silicon = rollSilicon();
  save('silicon');
}
