// BIOS menu tree, modelled on MSI Click BIOS 5 for B450 MAX boards.
// Menu names, defaults and help text follow the MSI B450 user manual; the
// Zen 3 items (FCLK, UCLK DIV1, AMD Overclocking, Curve Optimizer) follow
// what AGESA ComboAm4v2PI 1.2.0.x exposes on MSI boards.
//
// Item types:
//   header  section title, no value
//   enum    one of `opts`
//   num     number in [min,max] by `step`; `auto: true` also allows 'Auto'
//   sub     opens `items`
//   info    read-only, `get(ctx)` returns text
//   action  runs `action` id in the BIOS controller
//   text    free text (profile names, passwords)
// `expert: true` hides the item unless OC Explore Mode is Expert (shown with *).
// `show(v)` hides the item unless it returns true; `v(id)` reads a value.

const onOff = ['Enabled', 'Disabled'];
const autoOnOff = ['Auto', 'Enabled', 'Disabled'];

const DRAM_FREQS = [1333, 1600, 1866, 2133, 2400, 2666, 2800, 2933, 3000, 3066, 3200,
  3266, 3333, 3400, 3466, 3533, 3600, 3666, 3733, 3800, 3866, 3933, 4000, 4066, 4133,
  4200, 4266, 4333, 4400, 4466, 4533, 4600, 4666, 4733, 4800];
const FCLKS = [667, 800, 933, 1067, 1200, 1333, 1367, 1400, 1433, 1467, 1500, 1533,
  1567, 1600, 1633, 1667, 1700, 1733, 1767, 1800, 1833, 1867, 1900, 1933, 1967, 2000,
  2033, 2067, 2100];
const PROC_ODT = ['Auto', '480 ohm', '240 ohm', '160 ohm', '120 ohm', '96 ohm', '80 ohm',
  '68.6 ohm', '60 ohm', '53.3 ohm', '48 ohm', '43.6 ohm', '40 ohm', '36.9 ohm',
  '34.3 ohm', '32 ohm', '30 ohm', '28.2 ohm'];
const RZQ = n => ['Auto', ...Array.from({ length: n }, (_, i) => `RZQ/${i + 1}`)];
const DRV = ['Auto', '120.0 Ohm', '60.0 Ohm', '40.0 Ohm', '30.0 Ohm', '24.0 Ohm', '20.0 Ohm'];

export const MEMORY_TRY_IT = [
  // name, MT/s, cl-rcd-rp-ras, voltage
  ['DDR4-2933 CL16', 2933, [16, 17, 17, 36], 1.35],
  ['DDR4-3200 CL16', 3200, [16, 18, 18, 36], 1.35],
  ['DDR4-3200 CL14', 3200, [14, 15, 15, 32], 1.40],
  ['DDR4-3333 CL16', 3333, [16, 18, 18, 36], 1.38],
  ['DDR4-3466 CL16', 3466, [16, 18, 18, 38], 1.40],
  ['DDR4-3600 CL18', 3600, [18, 20, 20, 40], 1.40],
  ['DDR4-3600 CL16', 3600, [16, 19, 19, 38], 1.42],
  ['DDR4-3733 CL18', 3733, [18, 21, 21, 42], 1.45],
  ['DDR4-3866 CL18', 3866, [18, 22, 22, 42], 1.45],
];

// num helper: Auto-able number
const n = (id, label, min, max, step, unit, help, extra = {}) =>
  ({ id, label, type: 'num', min, max, step, unit, auto: true, def: 'Auto', help, ...extra });
const e = (id, label, opts, def, help, extra = {}) =>
  ({ id, label, type: 'enum', opts, def, help, ...extra });

const timing = (id, label, max, help, extra = {}) =>
  n(id, label, 1, max, 1, 'clk', help, extra);

const DRAM_TIMINGS = [
  { type: 'header', label: 'Primary Timings' },
  timing('tCL', 'tCL', 33, 'CAS latency. Clocks between a read command and the first data word. Lower is faster; each step needs the DRAM to switch faster.'),
  timing('tRCDWR', 'tRCDWR', 31, 'RAS to CAS delay for writes.'),
  timing('tRCDRD', 'tRCDRD', 31, 'RAS to CAS delay for reads. One of the most IC-limited timings.'),
  timing('tRP', 'tRP', 31, 'Row precharge time.'),
  timing('tRAS', 'tRAS', 58, 'Minimum time a row stays open. Usually tRCD + tCL or higher.'),
  timing('tRC', 'tRC', 135, 'Row cycle time. Must be at least tRAS + tRP.', { expert: true }),
  { type: 'header', label: 'Secondary Timings' },
  timing('tRRDS', 'tRRDS', 31, 'Activate to activate, different bank group.'),
  timing('tRRDL', 'tRRDL', 31, 'Activate to activate, same bank group.'),
  timing('tFAW', 'tFAW', 63, 'Four activate window. Usually 4x tRRDS.'),
  timing('tWTRS', 'tWTRS', 15, 'Write to read, different bank group.', { expert: true }),
  timing('tWTRL', 'tWTRL', 31, 'Write to read, same bank group.', { expert: true }),
  timing('tWR', 'tWR', 81, 'Write recovery time.', { expert: true }),
  timing('tRTP', 'tRTP', 15, 'Read to precharge.', { expert: true }),
  timing('tCWL', 'tCWL', 22, 'CAS write latency. Zen 3 wants it even when Gear Down Mode is enabled.', { expert: true }),
  { type: 'header', label: 'Refresh' },
  timing('tRFC', 'tRFC', 1023, 'Refresh cycle time. Very temperature sensitive. Too low shows as errors after the DIMMs warm up.'),
  timing('tRFC2', 'tRFC2', 1023, 'Only used in 2x refresh mode. Leave on Auto.', { expert: true }),
  timing('tRFC4', 'tRFC4', 1023, 'Only used in 4x refresh mode. Leave on Auto.', { expert: true }),
  { type: 'header', label: 'Turnaround Timings', expert: true },
  timing('tRDRDSCL', 'tRDRDSCL', 15, 'Read to read, same chip, different bank group (scaled).', { expert: true }),
  timing('tWRWRSCL', 'tWRWRSCL', 63, 'Write to write, same chip (scaled).', { expert: true }),
  timing('tRDWR', 'tRDWR', 31, 'Read to write turnaround.', { expert: true }),
  timing('tWRRD', 'tWRRD', 15, 'Write to read turnaround.', { expert: true }),
  timing('tRDRDSC', 'tRDRDSC', 15, 'Read to read, same chip.', { expert: true }),
  timing('tRDRDSD', 'tRDRDSD', 15, 'Read to read, same DIMM.', { expert: true }),
  timing('tRDRDDD', 'tRDRDDD', 15, 'Read to read, different DIMM.', { expert: true }),
  timing('tWRWRSC', 'tWRWRSC', 15, 'Write to write, same chip.', { expert: true }),
  timing('tWRWRSD', 'tWRWRSD', 15, 'Write to write, same DIMM.', { expert: true }),
  timing('tWRWRDD', 'tWRWRDD', 15, 'Write to write, different DIMM.', { expert: true }),
  timing('tCKE', 'tCKE', 31, 'Clock enable minimum pulse width.', { expert: true }),
  { type: 'header', label: 'Controller' },
  e('CmdRate', 'Command Rate', ['Auto', '1T', '2T'], 'Auto', 'Command rate. 1T is faster. With Gear Down Mode enabled the controller runs an effective 1.5T.'),
  e('GDM', 'Gear Down Mode', autoOnOff, 'Auto', 'Latches commands on every other clock. Makes 1T stable at high speed but rounds tCL, tCWL and tWR up to even values.'),
  e('PowerDown', 'Power Down Enable', autoOnOff, 'Auto', 'Lets the DIMMs enter power down when idle. Disabling it lowers latency by about 1 ns.'),
  e('ProcODT', 'ProcODT', PROC_ODT, 'Auto', 'On-die termination at the CPU memory controller. 36.9 to 43.6 ohm is typical for 2 single-rank DIMMs above 3600 MT/s.', { expert: true }),
  e('RttNom', 'RttNom', ['Auto', 'Rtt_Nom Disable', ...RZQ(7).slice(1)], 'Auto', 'Nominal termination on the DIMM.', { expert: true }),
  e('RttWr', 'RttWr', ['Auto', 'Dynamic ODT Off', 'RZQ/1', 'RZQ/2', 'RZQ/3', 'Hi-Z'], 'Auto', 'Termination during writes.', { expert: true }),
  e('RttPark', 'RttPark', ['Auto', 'Rtt_Park Disable', ...RZQ(7).slice(1)], 'Auto', 'Termination when the DIMM is parked.', { expert: true }),
  { type: 'header', label: 'CAD Bus', expert: true },
  n('AddrCmdSetup', 'AddrCmdSetup', 0, 63, 1, '', 'Address/command setup time.', { expert: true }),
  n('CsOdtSetup', 'CsOdtSetup', 0, 63, 1, '', 'Chip select / ODT setup time.', { expert: true }),
  n('CkeSetup', 'CkeSetup', 0, 63, 1, '', 'Clock enable setup time.', { expert: true }),
  e('ClkDrvStren', 'ClkDrvStren', DRV, 'Auto', 'Clock drive strength.', { expert: true }),
  e('AddrCmdDrvStren', 'AddrCmdDrvStren', DRV, 'Auto', 'Address/command drive strength.', { expert: true }),
  e('CsOdtDrvStren', 'CsOdtCmdDrvStren', DRV, 'Auto', 'Chip select / ODT drive strength.', { expert: true }),
  e('CkeDrvStren', 'CkeDrvStren', DRV, 'Auto', 'Clock enable drive strength.', { expert: true }),
];

const coreCO = [];
for (let c = 0; c < 8; c++) {
  coreCO.push(
    e(`coSign${c}`, `Core ${c} Curve Optimizer Sign`, ['Positive', 'Negative'], 'Negative',
      `Direction of the voltage curve shift for core ${c}.`,
      { show: v => v('coMode') === 'Per Core' }),
    n(`coMag${c}`, `Core ${c} Curve Optimizer Magnitude`, 0, 30, 1, '',
      `Size of the curve shift for core ${c}. About 3 to 5 mV per step.`,
      { auto: false, def: 0, show: v => v('coMode') === 'Per Core' }),
  );
}

const pboAdv = v => v('PBO') === 'Advanced';

const AMD_OC = [
  { type: 'header', label: 'AMD Overclocking' },
  { type: 'info', label: 'Warning', get: () => 'AMD processors are shipped with limits. Overclocking outside these limits voids the AMD product warranty and may damage the processor.' },
  e('PBO', 'Precision Boost Overdrive', ['Auto', 'Disabled', 'Enabled', 'Advanced'], 'Auto',
    'Enabled raises PPT, TDC and EDC to the motherboard limits. Advanced exposes every PBO control below.'),
  e('pboLimits', 'PBO Limits', ['Auto', 'Disable', 'Motherboard', 'Manual'], 'Auto',
    'Disable keeps the AMD stock limits. Motherboard uses what the board designer allows. Manual lets you type them.', { show: pboAdv }),
  n('ppt', 'PPT Limit [W]', 45, 300, 1, 'W', 'Package Power Tracking: total socket power the CPU may draw.', { auto: false, def: 76, show: v => pboAdv(v) && v('pboLimits') === 'Manual' }),
  n('tdc', 'TDC Limit [A]', 30, 200, 1, 'A', 'Thermal Design Current: sustained current the VRM supplies before boost backs off.', { auto: false, def: 60, show: v => pboAdv(v) && v('pboLimits') === 'Manual' }),
  n('edc', 'EDC Limit [A]', 45, 250, 1, 'A', 'Electrical Design Current: peak current in short bursts. Too low can hurt single-core boost.', { auto: false, def: 90, show: v => pboAdv(v) && v('pboLimits') === 'Manual' }),
  e('pboScalarCtrl', 'Precision Boost Overdrive Scalar Ctrl', ['Auto', 'Manual'], 'Auto', 'Manual lets you set the scalar.', { show: pboAdv }),
  e('pboScalar', 'Precision Boost Overdrive Scalar', ['1X', '2X', '3X', '4X', '5X', '6X', '7X', '8X', '9X', '10X'], '1X',
    'How long and how hard the CPU may stay above its default voltage/frequency curve. Higher adds voltage for little clock.', { show: v => pboAdv(v) && v('pboScalarCtrl') === 'Manual' }),
  e('boostOverrideCtrl', 'CPU Boost Clock Override', ['Disabled', 'Enabled (Positive)'], 'Disabled',
    'Lets the boost algorithm request up to 200 MHz above the stock 4.6 GHz ceiling.', { show: pboAdv }),
  n('boostOverride', 'Max CPU Boost Clock Override(+)', 0, 200, 25, 'MHz', 'Extra MHz on top of the stock maximum boost.', { auto: false, def: 0, show: v => pboAdv(v) && v('boostOverrideCtrl') === 'Enabled (Positive)' }),
  e('thermCtrl', 'Platform Thermal Throttle Ctrl', ['Auto', 'Manual'], 'Auto', 'Manual lets you lower the temperature where boost backs off.', { show: pboAdv }),
  n('thermLimit', 'Platform Thermal Throttle Limit', 60, 90, 1, '°C', 'Tctl target. The CPU drops boost to stay under it.', { auto: false, def: 90, show: v => pboAdv(v) && v('thermCtrl') === 'Manual' }),
  { type: 'header', label: 'Curve Optimizer', show: pboAdv },
  e('coMode', 'Curve Optimizer', ['Disable', 'All Cores', 'Per Core'], 'Disable',
    'Shifts the voltage/frequency curve. Negative gives more clock at the same voltage. Instability shows at idle and light single-thread loads first, not in all-core stress tests.', { show: pboAdv }),
  e('coSignAll', 'All Core Curve Optimizer Sign', ['Positive', 'Negative'], 'Negative', 'Direction of the shift for all cores.', { show: v => pboAdv(v) && v('coMode') === 'All Cores' }),
  n('coMagAll', 'All Core Curve Optimizer Magnitude', 0, 30, 1, '', 'Size of the shift for all cores.', { auto: false, def: 0, show: v => pboAdv(v) && v('coMode') === 'All Cores' }),
  ...coreCO.map(i => ({ ...i, show: v => pboAdv(v) && v('coMode') === 'Per Core' })),
];

const CPU_FEATURES = [
  e('cstate', 'Global C-state Control', autoOnOff, 'Auto', 'Enables/disables IO based C-state generation and DF C-states. Disabling raises idle power and idle temperature.'),
  e('smt', 'Simultaneous Multi-Threading', ['Auto', 'Disabled'], 'Auto', 'Two threads per core. Disabling leaves 8 threads.'),
  e('opcache', 'Opcache Control', autoOnOff, 'Auto', 'Opcache stores recent decoded instructions.'),
  e('iommu', 'IOMMU', autoOnOff, 'Auto', 'I/O Memory Management Unit for virtualization.'),
  e('spread', 'Spread Spectrum', ['Auto', 'Enabled', 'Disabled'], 'Auto', 'Modulates the clock to reduce EMI. Disable it when overclocking.'),
  e('relaxedEdc', 'Relaxed EDC throttling', autoOnOff, 'Auto', 'Reduces the amount of time the processor will throttle the cores.'),
  e('svm', 'SVM Mode', onOff, 'Disabled', 'AMD-V virtualization.'),
  e('psp', 'BIOS PSP Support', onOff, 'Enabled', 'Manages C2P/P2C mailbox, Secure S3 and fTPM.'),
  e('psIdle', 'Power Supply Idle Control', ['Auto', 'Low Current Idle', 'Typical Current Idle'], 'Auto', 'Typical Current Idle prevents idle freezes with PSUs that dislike very low load.'),
  e('vddSocOpt', 'CPU VDD_SoC Current Optimization', ['Auto', 'Custom Setting'], 'Auto', 'Sets the currents of CPU VDD and SoC.'),
  e('cppc', 'CPPC', autoOnOff, 'Auto', 'Collaborative Processor Performance Control. Lets the OS request performance states.'),
  e('cppcPref', 'CPPC Preferred Cores', autoOnOff, 'Auto', 'Tells the scheduler which cores boost highest, so single-thread work lands there.'),
  e('coreWatchdog', 'Core Watchdog', autoOnOff, 'Auto', 'Resets the system if a core stops responding.'),
  { type: 'sub', id: 'amdoc', label: 'AMD Overclocking', items: AMD_OC },
];

const DIGITALL = [
  e('llc', 'CPU Loadline Calibration Control', ['Auto', 'Mode 1', 'Mode 2', 'Mode 3', 'Mode 4', 'Mode 5', 'Mode 6', 'Mode 7', 'Mode 8'], 'Auto',
    'The CPU voltage will decrease proportionally according to CPU loading. Mode 1 is the flattest (least droop, may overshoot), Mode 8 droops the most. Higher calibration heats the CPU and VRM.'),
  e('llcNb', 'CPU NB Loadline Calibration Control', ['Auto', 'Mode 1', 'Mode 2', 'Mode 3', 'Mode 4'], 'Auto', 'Load-line calibration for the SoC rail.'),
  e('ovp', 'CPU Over Voltage Protection', ['Auto', '1.500V', '1.550V', '1.600V', '1.650V', '1.700V'], 'Auto', 'Voltage where the VRM shuts off. Higher gives less protection.'),
  e('uvp', 'CPU Under Voltage Protection', ['Auto', 'Enabled', 'Disabled'], 'Auto', 'Shuts off when voltage collapses under load.'),
  e('ocp', 'CPU Over Current Protection', ['Auto', 'Enhanced'], 'Auto', 'Enhanced raises the current limit before the VRM trips.'),
  e('ocpExp', 'VR 12VIN OCP Expander', ['Auto', 'Enabled'], 'Auto', 'Expands VR over-current protection on the 12 V input. Less protection.'),
  e('vrmOtp', 'CPU VRM Over Temperature Protection', ['Auto', '95°C', '105°C', '115°C', 'Disabled'], 'Auto', 'MOSFET temperature where the board throttles the CPU. Auto is 105°C on this board (simulated).'),
];

const voltMode = (id, label, help) => ({ id, label, type: 'enum', opts: ['Auto', 'Override Mode', 'Offset Mode'], def: 'Auto', help });

const CPU_VOLTS = [
  voltMode('vcoreMode', 'CPU Core Voltage Mode', 'Auto keeps the CPU\'s own voltage/frequency curve (needed for PBO and Curve Optimizer). Override sets a fixed voltage. Offset adds to the stock curve.'),
  n('vcore', 'CPU Core Voltage', 0.8, 1.55, 0.00625, 'V', 'Fixed Vcore when in Override Mode. Above 1.40 V all-core is a degradation risk on Zen 3.', { auto: false, def: 1.2, show: v => v('vcoreMode') === 'Override Mode', danger: 1.4, warn: 1.35 }),
  n('vcoreOffset', 'CPU Core Voltage Offset', -0.3, 0.3, 0.00625, 'V', 'Signed offset applied on top of the stock curve.', { auto: false, def: 0, show: v => v('vcoreMode') === 'Offset Mode' }),
  n('vsoc', 'CPU NB/SoC Voltage', 0.9, 1.3, 0.00625, 'V', 'Powers the IO die: memory controller and Infinity Fabric. 1.1 to 1.15 V covers FCLK 1800 to 1900 on most chips. Above 1.2 V is unsafe.', { danger: 1.2, warn: 1.15 }),
  n('vddp', 'CLDO VDDP voltage', 0.7, 1.1, 0.005, 'V', 'DDR4 PHY voltage. Default 0.9 V.', { expert: true }),
  n('vddgCcd', 'CLDO VDDG CCD voltage', 0.7, 1.1, 0.005, 'V', 'Infinity Fabric voltage on the CCD side. Must stay below SoC voltage minus 0.04 V.', { expert: true }),
  n('vddgIod', 'CLDO VDDG IOD voltage', 0.7, 1.1, 0.005, 'V', 'Infinity Fabric voltage on the IO die side. Raising it can help FCLK above 1800.', { expert: true }),
  n('vchipset', 'CHIPSET Core Voltage', 1.0, 1.2, 0.005, 'V', 'B450 chipset core voltage.', { expert: true }),
];

const DRAM_VOLTS = [
  n('vdram', 'DRAM Voltage', 1.1, 1.8, 0.005, 'V', 'Voltage of the DIMMs. XMP sets 1.35 V. Daily use above 1.50 V is not advised for these modules.', { danger: 1.5, warn: 1.45 }),
  n('vpp', 'DRAM VPP Voltage', 2.5, 2.8, 0.01, 'V', 'Word line boost voltage. 2.5 V default.', { expert: true }),
  n('vrefA', 'DRAM CH_A VREF Voltage', 0.45, 0.55, 0.001, 'x', 'Reference voltage ratio for channel A.', { expert: true }),
  n('vrefB', 'DRAM CH_B VREF Voltage', 0.45, 0.55, 0.001, 'x', 'Reference voltage ratio for channel B.', { expert: true }),
];

const OC = [
  e('ocExplore', 'OC Explore Mode', ['Normal', 'Expert'], 'Normal', 'Normal shows the regular OC settings. Expert shows advanced settings, marked with *.'),
  { type: 'header', label: 'CPU  Setting' },
  e('ratioMode', 'CPU Ratio Apply Mode', ['All Core', 'Per CCX'], 'All Core', 'All Core applies one ratio to every core. The 5700X has one CCX, so Per CCX behaves the same.', { expert: true }),
  { id: 'ratio', label: 'CPU Ratio', type: 'num', min: 16, max: 50, step: 0.25, unit: 'x', auto: true, def: 'Auto',
    help: 'Sets a fixed all-core multiplier (x 100 MHz). Anything other than Auto disables Precision Boost, PBO and Curve Optimizer.' },
  { type: 'info', label: 'Adjusted CPU Frequency', get: c => c.adjCpu() },
  e('cpb', 'Core Performance Boost', ['Auto', 'Disabled'], 'Auto', 'Disabled caps the CPU at its 3.4 GHz base clock.'),
  e('downcore', 'Downcore Control', ['Auto', 'SIX (3 + 3)', 'FOUR (2 + 2)', 'TWO (1 + 1)'], 'Auto', 'Sets the number of processor cores to be used.'),
  { type: 'header', label: 'DRAM Setting' },
  e('axmp', 'A-XMP', ['Disabled', 'Profile 1'], 'Disabled', 'Please enable A-XMP or select a profile of memory module for overclocking the memory. Profile 1: DDR4-3200 16-18-18-38 1.35 V.'),
  e('dramFreq', 'DRAM Frequency', ['Auto', ...DRAM_FREQS.map(f => `DDR4-${f}`)], 'Auto', 'Sets the DRAM frequency. Please note the overclocking behavior is not guaranteed.'),
  { type: 'info', label: 'Adjusted DRAM Frequency', get: c => c.adjDram() },
  e('fclk', 'FCLK Frequency', ['Auto', ...FCLKS.map(f => `${f}MHz`)], 'Auto', 'Infinity Fabric clock. Keep it equal to half the DRAM rate (MCLK) for 1:1 mode. Most Zen 3 chips top out between 1800 and 1933 MHz; above that WHEA 19 errors appear.'),
  e('uclk', 'UCLK DIV1 MODE', ['Auto', 'UCLK=MEMCLK', 'UCLK=MEMCLK/2'], 'Auto', 'Memory controller clock. MEMCLK/2 allows very high DRAM speeds but adds about 10 ns latency.'),
  e('tryIt', 'Memory Try It !', ['Disabled', ...MEMORY_TRY_IT.map(p => p[0])], 'Disabled', 'It can improve memory compatibility or performance by choosing optimized memory preset.'),
  e('memFastBoot', 'Memory Fast Boot', autoOnOff, 'Auto', 'Skips full memory training when nothing changed. Disable while tuning memory.', { expert: true }),
  n('memRetry', 'Memory Retry Count', 1, 10, 1, '', 'When memory training fails this many times, the board goes back to the last working setting.', { auto: false, def: 5, expert: true }),
  { type: 'sub', id: 'advDram', label: 'Advanced DRAM Configuration', items: DRAM_TIMINGS },
  { type: 'header', label: 'Voltage Setting' },
  { type: 'sub', id: 'digitall', label: 'DigitALL Power', items: DIGITALL },
  { type: 'sub', id: 'cpuVolts', label: 'CPU Voltages control', items: CPU_VOLTS },
  { type: 'sub', id: 'dramVolts', label: 'DRAM Voltages control', items: DRAM_VOLTS },
  { type: 'header', label: 'Other  Setting' },
  e('memChanged', 'Memory Changed Detect', onOff, 'Enabled', 'Issues a warning during boot when the memory has been replaced.', { expert: true }),
  { type: 'sub', id: 'cpuSpecs', label: 'CPU Specifications', items: [{ type: 'info', label: '', get: c => c.cpuSpecs() }] },
  { type: 'sub', id: 'memz', label: 'MEMORY-Z', items: [{ type: 'info', label: '', get: c => c.memoryZ() }] },
  { type: 'sub', id: 'cpuFeatures', label: 'Advanced CPU Configuration', items: CPU_FEATURES },
];

const SETTINGS = [
  { type: 'sub', id: 'sysStatus', label: 'System Status', items: [
    { type: 'info', label: 'System Date', get: c => c.date() },
    { type: 'info', label: 'System Time', get: c => c.time() },
    { type: 'info', label: 'SATA Port1..4', get: () => 'None' },
    { type: 'info', label: 'M2_1', get: () => 'KIOXIA-EXCERIA PLUS G3 SSD (1000.2GB)' },
    { type: 'info', label: 'System Information', get: c => c.sysInfo() },
    { type: 'info', label: 'DMI Information', get: () => 'Micro-Star International Co., Ltd. MS-7A38 1.0' },
  ] },
  { type: 'sub', id: 'advanced', label: 'Advanced', items: [
    { type: 'sub', id: 'pci', label: 'PCI Subsystem Settings', items: [
      e('above4g', 'Above 4G memory/Crypto Currency mining', onOff, 'Disabled', 'Enables 64-bit capable devices to be decoded above 4G.'),
      e('rebar', 'Re-Size BAR Support', ['Auto', 'Disabled'], 'Disabled', 'Needs Above 4G, UEFI boot and a GPU that supports it. The GTX 1660 Ti does not, so this has no effect here.', { show: v => v('above4g') === 'Enabled' }),
      e('pcieGen', 'PCI_E1 Gen Switch', ['Auto', 'Gen1', 'Gen2', 'Gen3'], 'Auto', 'Link speed of the x16 slot.'),
      e('m2Gen', 'M2_1 Gen Switch', ['Auto', 'Gen1', 'Gen2', 'Gen3'], 'Auto', 'Link speed of the M.2 slot. The slot tops out at Gen3 x4.'),
    ] },
    { type: 'sub', id: 'acpi', label: 'ACPI Settings', items: [
      e('powerLed', 'Power LED', ['Blinking', 'Dual Color'], 'Blinking', 'Sets shining behaviors of the onboard Power LED.'),
    ] },
    { type: 'sub', id: 'periph', label: 'Integrated Peripherals', items: [
      e('lan', 'Onboard LAN Controller', onOff, 'Enabled', 'Enables or disables the onboard LAN controller.'),
      e('lanRom', 'LAN Option ROM', onOff, 'Disabled', 'Legacy network boot ROM.', { show: v => v('lan') === 'Enabled' }),
      e('netStack', 'Network Stack', onOff, 'Disabled', 'UEFI network stack.', { show: v => v('lan') === 'Enabled' }),
      e('ipv4', 'Ipv4 PXE Support', onOff, 'Enabled', '', { show: v => v('netStack') === 'Enabled' }),
      e('ipv6', 'Ipv6 PXE Support', onOff, 'Enabled', '', { show: v => v('netStack') === 'Enabled' }),
      e('sataMode', 'SATA Mode', ['AHCI Mode', 'RAID Mode'], 'AHCI Mode', 'Operation mode of the onboard SATA controller.'),
      e('hotplug', 'SATAx Hot Plug', onOff, 'Disabled', 'Hot plug support for the SATA ports.'),
      e('hda', 'HD Audio Controller', onOff, 'Enabled', 'Onboard High Definition Audio controller (ALC892).'),
    ] },
    { type: 'sub', id: 'igfx', label: 'Integrated Graphics Configuration', items: [
      { type: 'info', label: 'Integrated Graphics', get: () => 'Not available: Ryzen 7 5700X has no integrated graphics' },
    ] },
    { type: 'sub', id: 'usb', label: 'USB Configuration', items: [
      e('xhci', 'XHCI Hand-off', onOff, 'Enabled', ''),
      e('legacyUsb', 'Legacy USB Support', ['Auto', 'Enabled', 'Disabled'], 'Enabled', ''),
    ] },
    { type: 'sub', id: 'superio', label: 'Super IO Configuration', items: [
      e('com0', 'Serial(COM) Port 0', onOff, 'Enabled', 'JCOM1 header.'),
      e('lpt', 'Parallel(LPT) Port', onOff, 'Enabled', 'JLPT1 header.'),
      e('lptMode', 'Device Mode', ['STD Printer Mode', 'SPP Mode', 'EPP-1.9 and SPP Mode'], 'STD Printer Mode', '', { show: v => v('lpt') === 'Enabled' }),
    ] },
    { type: 'sub', id: 'power', label: 'Power Management Setup', items: [
      e('erp', 'ErP Ready', onOff, 'Disabled', 'Optimizes power consumption according to ErP. Disables S4/S5 wake by USB and PCIe.'),
      e('acLoss', 'Restore after AC Power Loss', ['Power Off', 'Power On', 'Last State'], 'Power Off', ''),
      e('powerFault', 'System Power Fault Protection', onOff, 'Disabled', 'Protects the system from abnormal voltage input.'),
    ] },
    { type: 'sub', id: 'winos', label: 'Windows OS Configuration', items: [
      e('whql', 'Windows 10 WHQL Support', onOff, 'Disabled', 'Switches the system to UEFI mode to meet Windows requirements.'),
      e('msiFast', 'MSI Fast Boot', onOff, 'Disabled', 'Skips most POST checks. The DEL key no longer works when enabled.', { show: v => v('whql') === 'Enabled' }),
      e('secureBoot', 'Secure Boot', onOff, 'Disabled', '', { show: v => v('whql') === 'Enabled' }),
    ] },
    { type: 'sub', id: 'wake', label: 'Wake Up Event Setup', items: [
      e('wakeBy', 'Wake Up Event By', ['BIOS', 'OS'], 'BIOS', ''),
      e('rtcWake', 'Resume By RTC Alarm', onOff, 'Disabled', ''),
      e('pcieWake', 'Resume By PCI-E Device', onOff, 'Disabled', ''),
      e('usbWake', 'Resume by USB Device', onOff, 'Disabled', ''),
      e('ps2m', 'Resume From S3/S4/S5 by PS/2 Mouse', onOff, 'Disabled', ''),
      e('ps2k', 'Resume From S3/S4/S5 by PS/2 Keyboard', ['Disabled', 'Any Key', 'Hot Key'], 'Disabled', ''),
    ] },
    { type: 'action', label: 'Secure Erase+', action: 'secureErase', help: 'Wipes all data from an SSD.' },
    { type: 'info', label: 'Realtek PCIe GBE Family Controller', get: () => 'Driver 2.056, MAC 00:D8:61:xx:xx:xx (simulated)' },
    { type: 'sub', id: 'cbs', label: 'AMD CBS', items: [
      { type: 'sub', id: 'cbsZen', label: 'Zen Common Options', items: [
        e('cbsCpb', 'Core Performance Boost', ['Auto', 'Disabled'], 'Auto', 'Same as OC > Core Performance Boost.'),
        e('cbsL1Stream', 'L1 Stream HW Prefetcher', ['Auto', 'Disable', 'Enable'], 'Auto', ''),
        e('cbsL2Stream', 'L2 Stream HW Prefetcher', ['Auto', 'Disable', 'Enable'], 'Auto', ''),
        e('cbsPstate', 'Custom Pstates', ['Auto', 'Disabled'], 'Auto', 'Leave on Auto on Zen 3.'),
      ] },
      { type: 'sub', id: 'cbsDf', label: 'DF Common Options', items: [
        e('interleave', 'Memory interleaving', ['Auto', 'None', 'Channel'], 'Auto', ''),
        e('interleaveSize', 'Memory interleaving size', ['Auto', '256 Bytes', '512 Bytes', '1 KB', '2 KB'], 'Auto', ''),
        e('dfCstates', 'DF Cstates', ['Auto', 'Enabled', 'Disabled'], 'Auto', 'Fabric power saving. Disabling can steady FCLK above 1800 at the cost of idle power.'),
      ] },
      { type: 'sub', id: 'cbsUmc', label: 'UMC Common Options', items: [
        e('memClear', 'Memory Clear', ['Auto', 'Enabled', 'Disabled'], 'Auto', ''),
        e('tsme', 'TSME', ['Auto', 'Enabled', 'Disabled'], 'Auto', 'Transparent memory encryption. Adds a few ns of latency when enabled.'),
      ] },
      { type: 'sub', id: 'cbsNbio', label: 'NBIO Common Options', items: [
        e('iommuCbs', 'IOMMU', ['Auto', 'Enabled', 'Disabled'], 'Auto', ''),
        e('cbsCppc', 'CPPC', ['Auto', 'Enabled', 'Disabled'], 'Auto', ''),
        e('determinism', 'Determinism Control', ['Auto', 'Manual'], 'Auto', ''),
      ] },
    ] },
  ] },
  { type: 'sub', id: 'boot', label: 'Boot', items: [
    e('fullLogo', 'Full Screen Logo Display', onOff, 'Enabled', 'Shows the logo in full screen during POST. Disabled shows POST messages.'),
    e('numlock', 'Bootup NumLock State', ['On', 'Off'], 'On', ''),
    e('infoBlock', 'Info Block effect', ['Unlock', 'Lock'], 'Unlock', ''),
    e('postBeep', 'POST Beep', onOff, 'Disabled', ''),
    e('autoClr', 'AUTO CLR_CMOS', onOff, 'Disabled', 'Resets CMOS automatically when the system cannot boot and reboots repeatedly.'),
    e('bootMode', 'Boot Mode Select', ['UEFI', 'LEGACY+UEFI'], 'LEGACY+UEFI', ''),
    e('boot1', 'Boot Option #1', ['Windows Boot Manager (KIOXIA-EXCERIA PLUS G3 SSD)', 'UEFI USB Hard Disk', 'UEFI Network', 'Disabled'], 'Windows Boot Manager (KIOXIA-EXCERIA PLUS G3 SSD)', ''),
    e('boot2', 'Boot Option #2', ['UEFI USB Hard Disk', 'UEFI Network', 'Disabled'], 'UEFI USB Hard Disk', ''),
  ] },
  { type: 'sub', id: 'security', label: 'Security', items: [
    { id: 'adminPw', label: 'Administrator Password', type: 'text', def: '', help: 'Full rights to change BIOS items.' },
    { id: 'userPw', label: 'User Password', type: 'text', def: '', help: 'Limited rights. Available once an administrator password is set.', show: v => v('adminPw') !== '' },
    e('pwCheck', 'Password Check', ['Setup', 'Boot'], 'Setup', ''),
    e('pwClear', 'Password Clear', onOff, 'Enabled', 'Clear CMOS also clears the password.'),
    { type: 'sub', id: 'tpm', label: 'Trusted Computing', items: [
      e('tpmSupport', 'Security Device Support', onOff, 'Disabled', ''),
      e('ftpm', 'AMD fTPM switch', ['AMD CPU fTPM', 'AMD CPU fTPM Disabled'], 'AMD CPU fTPM', '', { show: v => v('tpmSupport') === 'Enabled' }),
      e('tpmSelect', 'Device Select', ['Auto', 'TPM 1.2', 'TPM 2.0'], 'Auto', '', { show: v => v('tpmSupport') === 'Enabled' }),
    ] },
    { type: 'sub', id: 'chassis', label: 'Chassis Intrusion Configuration', items: [
      e('intrusion', 'Chassis Intrusion', ['Disabled', 'Enabled', 'Reset'], 'Disabled', ''),
    ] },
  ] },
  { type: 'sub', id: 'saveExit', label: 'Save & Exit', items: [
    { type: 'action', label: 'Discard Changes and Exit', action: 'discardExit' },
    { type: 'action', label: 'Save Changes and Reboot', action: 'saveReboot' },
    { type: 'action', label: 'Save Changes', action: 'save' },
    { type: 'action', label: 'Discard Changes', action: 'discard' },
    { type: 'action', label: 'Restore Defaults', action: 'defaults' },
    { type: 'header', label: 'Boot Override' },
    { type: 'action', label: 'Windows Boot Manager (KIOXIA-EXCERIA PLUS G3 SSD)', action: 'saveReboot' },
  ] },
];

const PROFILES = [];
for (let i = 1; i <= 6; i++) {
  PROFILES.push({ type: 'sub', id: `prof${i}`, label: `Overclocking Profile ${i}`, profile: i, items: [
    { type: 'info', label: 'Profile', get: c => c.profileName(i) },
    { type: 'action', label: `Set Name for Overclocking Profile ${i}`, action: `nameProfile:${i}` },
    { type: 'action', label: `Save Overclocking Profile ${i}`, action: `saveProfile:${i}` },
    { type: 'action', label: `Load Overclocking Profile ${i}`, action: `loadProfile:${i}` },
    { type: 'action', label: `Clear Overclocking Profile ${i}`, action: `clearProfile:${i}` },
  ] });
}
PROFILES.push(
  { type: 'action', label: 'OC Profile Load from ROM', action: 'romProfile' },
  { type: 'action', label: 'OC Profile Save to USB', action: 'noUsb' },
  { type: 'action', label: 'OC Profile Load from USB', action: 'noUsb' },
);

export const MENUS = [
  { id: 'SETTINGS', label: 'SETTINGS', items: SETTINGS },
  { id: 'OC', label: 'OC', items: OC },
  { id: 'MFLASH', label: 'M-FLASH', items: [] },
  { id: 'PROFILE', label: 'OC PROFILE', items: PROFILES },
  { id: 'HWMON', label: 'HARDWARE MONITOR', items: [] },
  { id: 'BOARD', label: 'BOARD EXPLORER', items: [] },
];

// Flat list of every item that stores a value, for defaults and search.
export function allItems(items = MENUS.flatMap(m => m.items), path = []) {
  const out = [];
  for (const it of items) {
    if (it.type === 'sub') out.push(...allItems(it.items, [...path, it.label]));
    else if (it.id) out.push({ ...it, path });
  }
  return out;
}

export function defaults() {
  const d = {};
  for (const it of allItems()) d[it.id] = it.def;
  // Fan curves live in HARDWARE MONITOR, not in the item tree.
  d.fans = {
    CPU_FAN1: { mode: 'PWM', smart: true, points: [[40, 30], [55, 45], [70, 70], [85, 100]], stepUp: 0.1, stepDown: 0.1 },
    SYS_FAN1: { mode: 'DC', smart: true, points: [[40, 40], [55, 55], [70, 75], [85, 100]], stepUp: 0.1, stepDown: 0.1 },
    SYS_FAN2: { mode: 'DC', smart: true, points: [[40, 40], [55, 55], [70, 75], [85, 100]], stepUp: 0.1, stepDown: 0.1 },
  };
  return d;
}

export const DRAM_FREQ_LIST = DRAM_FREQS;
export const FCLK_LIST = FCLKS;
