// Plain-language meaning of each stop code the simulator can raise, and what
// in an overclock usually causes it. Shown under the BSOD as a simulator note.
export const STOP_CODES = {
  CLOCK_WATCHDOG_TIMEOUT: 'A CPU core stopped answering the clock interrupt it is sent every few milliseconds, so Windows assumed that core had hung.',
  WHEA_UNCORRECTABLE_ERROR: 'The CPU itself reported a hardware error it could not correct (a Machine Check). Windows cannot trust the result, so it stops.',
  SYSTEM_SERVICE_EXCEPTION: 'Kernel code crashed while handling a request from a program. On an overclocked PC this usually means the CPU or RAM returned wrong data.',
  MEMORY_MANAGEMENT: 'Windows found its own memory bookkeeping (page tables) corrupted. Bits in RAM changed when they should not have.',
  IRQL_NOT_LESS_OR_EQUAL: 'A driver read memory it was not allowed to touch at that moment. Usually the address itself was corrupted in RAM.',
  PAGE_FAULT_IN_NONPAGED_AREA: 'The kernel followed a pointer to memory that should always be present and found nothing there. The pointer was likely corrupted.',
  KMODE_EXCEPTION_NOT_HANDLED: 'Kernel code hit an error nobody caught, for example an illegal instruction produced by corrupted data.',
  VIDEO_TDR_FAILURE: 'The graphics card stopped responding, the driver tried to reset it and the reset also failed.',
};

// kind: 'cpu' | 'mem' | 'fclk' | 'gpu'; where: core, timing or part named by the sim.
export function likelyCause(kind, where) {
  switch (kind) {
    case 'cpu':
      return {
        cause: `${where ?? 'A CPU core'} did not have enough voltage for the clock it was running.`,
        fix: 'If you use Curve Optimizer, make that core less negative (try 5 counts less) and test it with Stress Lab > Core Cycler. With a manual ratio, raise CPU Core Voltage by 0.0125 V or lower the ratio by 0.25. A flatter LLC mode also helps under load.',
      };
    case 'mem':
      return {
        cause: `The memory setting that failed first was ${where ?? 'a DRAM timing'}.`,
        fix: where === 'tRFC' ? 'Raise tRFC (it is very sensitive to DIMM temperature) or add a little DRAM voltage. Then run Stress Lab > Memory test.'
          : where?.startsWith('IMC') ? 'The memory controller cannot hold this speed. Add CPU NB/SoC voltage in small steps (stay at or below 1.15 V) or lower the DRAM frequency.'
          : where === 'Signal integrity' ? 'Try another ProcODT value (36.9 to 43.6 ohm is typical), Gear Down Mode on, or a slightly lower DRAM frequency.'
          : 'Loosen that timing by 1 or 2, or raise DRAM voltage by 0.02 V, then run Stress Lab > Memory test.',
      };
    case 'fclk':
      return {
        cause: 'The Infinity Fabric (FCLK) is above what this CPU can run reliably.',
        fix: 'Lower FCLK by one step and keep the DRAM at twice that clock for 1:1 mode. WHEA 19 warnings in Event Viewer are the early sign of this.',
      };
    case 'gpu':
      return {
        cause: 'The graphics card core clock offset is too high for this GPU.',
        fix: 'Open GPU Tuner and lower Core Clock by 15 to 30 MHz, then run Stress Lab > 3D Adaptive.',
      };
    default:
      return {
        cause: 'The system crashed while Windows was starting, which loads every core in short bursts.',
        fix: 'Undo the last BIOS change or load optimized defaults (F6 in the BIOS), then reapply changes one at a time.',
      };
  }
}
