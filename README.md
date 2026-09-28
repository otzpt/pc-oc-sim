# PC OC Sim

A browser simulation of one specific desktop PC: press the power button on the
monitor, hold DEL to enter
a Click BIOS 5 style setup, overclock the CPU, memory and fabric, then boot a
Windows 7 style desktop ("VOID 7") and find out with stress tests and
benchmarks whether the overclock is stable.

**Simulation only.** Nothing here reads or changes real hardware. Every clock,
voltage, temperature, score and crash is computed by a model.

PT: Simulador no browser de um PC concreto. Liga, segura DEL para a BIOS, faz
OC, arranca o "VOID 7" e testa a estabilidade. Nada toca no hardware real.

## Run it

It is a static site with ES modules, so it needs an HTTP server (not `file://`):

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

No build step and no npm dependencies.

## Simulated hardware

| Part | Model |
|---|---|
| CPU | AMD Ryzen 7 5700X (8C/16T, 3.4 to 4.6 GHz, 65 W, PPT 76 W) |
| Motherboard | MSI B450M PRO-VDH MAX (MS-7A38), 4+2 phase VRM |
| Memory | TEAMGROUP T-Force Vulcan Z 2x8 GB DDR4-3200 CL16-18-18-38 1.35 V |
| Cooler | Thermalright Assassin Spirit 120 EVO |
| Storage | KIOXIA EXCERIA PLUS G3 1 TB (PCIe 4.0 drive, runs at Gen3 x4 in this board) |
| Graphics | ASUS Phoenix GeForce GTX 1660 Ti OC 6 GB |
| Case | Aerocool B508A Flow ARGB (5 x 120 mm fans) |
| PSU | CoolBox DeepPower BR-650, 80 PLUS Bronze |

## What is modelled

- **BIOS**: SETTINGS, OC, M-FLASH, OC PROFILE, HARDWARE MONITOR and BOARD
  EXPLORER tabs, EZ/Advanced mode, F1 to F12 keys, Ctrl+F search, favorites,
  6 OC profiles, Smart Fan curve editor. OC covers CPU ratio, PBO (limits,
  scalar, boost override, thermal limit), Curve Optimizer (all-core and per
  core), A-XMP, Memory Try It!, DRAM frequency, FCLK, UCLK DIV1, primary,
  secondary and turnaround timings, ProcODT/RTT/CAD bus, LLC modes, OVP/OCP,
  VRM over-temperature protection, Vcore/SoC/VDDP/VDDG/DRAM/VPP voltages.
- **POST**: EZ Debug LEDs, memory training failures, MSI-style "OC Fail
  Protect" after three failed boots, Clear CMOS jumper.
- **Physics**: per-core voltage/frequency curve with a hidden "silicon
  lottery", Precision Boost limited by PPT/TDC/EDC and temperature, loadline
  droop, leakage, first-order thermal model for CPU, VRM, case, DRAM and GPU,
  PSU efficiency, GPU Boost bins and power limit, GDDR6 error retry.
- **Stability**: margins turn into error rates. Errors show as test failures,
  WHEA 18/19 events, BSODs, sudden resets or GPU driver resets. Curve
  Optimizer instability shows mainly at idle and single-thread loads.
- **Desktop apps**: Internet (iframe), YouTube and Spotify (official embeds),
  Notepad, Stress Lab, Benchmarks, GPU Tuner, Sensors, System Info, Event
  Viewer, Control Panel.

Calibration targets (stock settings): about 13,200 points multi-core and 1,500
single-core in Cinebench R23 for the 5700X ([cpu-monkey](https://www.cpu-monkey.com/en/cpu-amd_ryzen_7_5700x)),
about 6,300 Time Spy graphics for a GTX 1660 Ti, and a 4.5 GHz all-core manual
overclock being reachable ([TechPowerUp](https://www.techpowerup.com/review/amd-ryzen-7-5700x/20.html)).
Anything beyond those anchor points is the model's behaviour, not a measurement.

## Not a fork

This is original code written for this project. It is **not** a fork of, and
contains no code from, any other web OS or portfolio project. Two projects were
looked at only as examples of the "PC inside a web page" idea before this was
started: [henryjeff/portfolio-website](https://github.com/henryjeff/portfolio-website)
and [lkspodmol/myos1](https://github.com/lkspodmol/myos1).

## Third-party assets (loaded from CDNs, not bundled)

| Asset | License | Use |
|---|---|---|
| [7.css](https://github.com/khang-nd/7.css) v0.21.1, Copyright (c) 2021 Khang Nguyen Duy | MIT | Windows 7 style window chrome and controls |
| [Tabler Icons](https://github.com/tabler/tabler-icons) webfont v3.48.0, Copyright (c) 2020-2026 Paweł Kuna | MIT | All icons, including the start orb glyph (`layout-grid`) |
| [Noto Sans](https://fonts.google.com/noto/specimen/Noto+Sans) | SIL Open Font License 1.1 | UI font |
| [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono) | SIL Open Font License 1.1 | Monospace font |

The monitor is drawn with plain CSS shapes and all sounds (power click, fan
spin-up, POST beep, startup chime, crash buzz) are synthesized at runtime with
the Web Audio API, so the project ships no image or audio files from anyone else.

YouTube and Spotify content is played through their official embed players and
stays under their terms of service.

## Trademarks and sources

AMD, Ryzen, MSI, Click BIOS, ASUS, NVIDIA, GeForce, TEAMGROUP, T-Force, KIOXIA,
Thermalright, Aerocool, CoolBox and Windows are trademarks of their owners.
This project is not affiliated with or endorsed by any of them. "VOID 7" is a
fictional OS; it does not use Microsoft artwork.

BIOS menu names, defaults and some short help strings follow the MSI B450
motherboard user manual. Hardware specifications come from the manufacturers'
pages and the reviews linked above. Values the manufacturers do not publish
(for example this board's PBO "Motherboard" limits or the GPU's power-limit
range) are marked as simulation assumptions in `js/hardware.js`.

## AI usage

This project was built with AI assistance. The code, the physics model and this
README were written by Claude (Anthropic's Claude Opus 5.5, via Claude Code),
directed by the repository owner, who chose the hardware, the features and the
licensing. Hardware specifications were looked up from the sources above and
the model was calibrated against them by running it. The site was tested in
headless Firefox; review the code before relying on it for anything.

## License

MIT, see [LICENSE](LICENSE). Third-party assets keep their own licenses.
