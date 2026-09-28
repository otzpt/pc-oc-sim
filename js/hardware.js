// Spec sheet of the simulated PC. Values marked SIM are modelling assumptions,
// everything else comes from the manufacturer or a review (source in comment).

export const CPU = {
  name: 'AMD Ryzen 7 5700X',
  codename: 'Vermeer (Zen 3)',
  cores: 8,
  threads: 16,
  baseGHz: 3.4,          // AMD spec
  boostGHz: 4.6,         // AMD spec
  l1KB: 512, l2MB: 4, l3MB: 32,
  tdpW: 65,
  // Stock socket limits for a 65 W AM4 part (AMD default PPT/TDC/EDC).
  pptW: 76, tdcA: 60, edcA: 90,
  tjmax: 90,
  process: 'TSMC 7 nm (CCD) + 12 nm (IOD)',
  socket: 'AM4',
  ccds: 1,
  ccxPerCcd: 1,
  maxVid: 1.5,
  stepping: 'B2',
  cpuid: 'A20F12',
};

// SIM: motherboard "Motherboard" PBO limits. MSI does not publish these for
// this board; values chosen to be above what the VRM can hold for long.
export const PBO_MOBO_LIMITS = { ppt: 142, tdc: 95, edc: 140 };

export const BOARD = {
  name: 'MSI B450M PRO-VDH MAX',
  model: 'MS-7A38',
  chipset: 'AMD B450',
  formFactor: 'm-ATX, 24.4 x 24.4 cm',
  bios: '7A38vBG',            // MSI BIOS release that ships AGESA ComboAm4v2PI 1.2.0.x
  agesa: 'ComboAm4v2PI 1.2.0.7',
  biosChip: '128 Mb flash, UEFI AMI BIOS',
  superIO: 'Nuvoton NCT6795D',
  audio: 'Realtek ALC892',
  lan: 'Realtek RTL8111H',
  vrm: '4 phase Vcore (heatsink) + 2 phase SoC (no heatsink)',
  slots: [
    { id: 'PCI_E1', desc: 'PCIe 3.0 x16 (CPU)' },
    { id: 'PCI_E2', desc: 'PCIe 2.0 x1 (B450)' },
    { id: 'PCI_E3', desc: 'PCIe 2.0 x1 (B450)' },
    { id: 'M2_1', desc: 'M.2 Key M, PCIe 3.0 x4 (CPU) / SATA' },
  ],
  sata: 4,
  fans: ['CPU_FAN1', 'SYS_FAN1', 'SYS_FAN2'],
  dimms: ['DIMMA1', 'DIMMA2', 'DIMMB1', 'DIMMB2'],
};

export const RAM = {
  name: 'TEAMGROUP T-Force Vulcan Z DDR4',
  part: 'TLZGD416G3200HC16CDC01',
  kit: '2 x 8 GB', ranks: 1, dieDensity: '8 Gb',
  slots: ['DIMMA2', 'DIMMB2'],
  jedec: { mt: 2133, cl: 15, rcd: 15, rp: 15, ras: 36, v: 1.2 },
  xmp: { mt: 3200, cl: 16, rcd: 18, rp: 18, ras: 38, v: 1.35 },
  ic: 'Not disclosed by TEAMGROUP',
};

export const GPU = {
  name: 'ASUS Phoenix GeForce GTX 1660 Ti OC 6GB',
  part: 'PH-GTX1660TI-O6G',
  chip: 'TU116-400', arch: 'Turing', cuda: 1536,
  baseMHz: 1500, boostMHz: 1785,   // gaming mode (ASUS spec); OC mode 1815
  memGB: 6, memType: 'GDDR6', memBus: 192, memMTs: 12002,
  bandwidthGBs: 288,
  tdpW: 120,
  // SIM: ASUS does not list the power limit slider range for this card.
  powerLimitMaxPct: 110,
  maxVoltage: 1.068, maxVoltageUnlocked: 1.093,
  outputs: 'DVI-D, 2x HDMI 2.0b, DisplayPort 1.4',
  power: '1x 8-pin', fans: 1,
};

export const COOLER = {
  name: 'Thermalright Assassin Spirit 120 EVO',
  heatpipes: 4, heightMM: 156, fan: 'TL-S12-S 120 mm, 2000 RPM ±10%',
  fanMaxRpm: 2000, airflowCFM: 68.9, ratedW: 200,
};

export const SSD = {
  name: 'KIOXIA EXCERIA PLUS G3 1TB',
  part: 'LSD10Z001TG8',
  controller: 'Phison PS5021-E21T (DRAM-less, HMB)',
  nand: 'KIOXIA BiCS TLC',
  iface: 'PCIe 4.0 x4, NVMe 1.4',
  seqRead: 5000, seqWrite: 3900, tbw: 600,
  // M2_1 on this board is PCIe 3.0 x4, so the link trains at Gen3.
  linkGen: 3, linkWidth: 4,
};

export const PSU = {
  name: 'CoolBox DeepPower BR-650',
  watts: 650, rating: '80 PLUS Bronze',
  rails: 'Dual +12V', fan: '140 mm',
  // 80 PLUS Bronze (115 V internal) minimums at 20/50/100 % load.
  eff: [[0, 0.70], [0.1, 0.78], [0.2, 0.83], [0.5, 0.86], [1.0, 0.82]],
};

export const CASE = {
  name: 'Aerocool B508A Flow ARGB',
  fans: '5x 120 mm ARGB (2 front, 2 top, 1 rear)',
  maxCoolerMM: 158, maxGpuMM: 340,
};

export const OS_NAME = 'VOID 7';
