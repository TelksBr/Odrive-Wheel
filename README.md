# Odrive-Wheel — MKS XDrive Mini / ODESC V4.2 FFB Firmware

Custom firmware for ODrive v0.5.6 running on **MKS XDrive Mini** and
**ODESC V4.2** hardware (STM32F405-based clones of ODrive v3.6), adding
full **HID Force Feedback** support to use the motor as a sim racing wheel.

<p align="center">
  <img src="docs/screenshots/MKSXdriveMini.png" alt="MKS XDrive Mini board" width="500">
</p>

<table align="center">
  <tr>
    <td width="50%">
      <a href="docs/screenshots/01-Header.png">
        <img src="docs/screenshots/01-Header.png" alt="Configuration tool — main overview"></a>
    </td>
    <td width="50%">
      <a href="docs/screenshots/06-GPIOConfig.png">
        <img src="docs/screenshots/06-GPIOConfig.png" alt="Inputs / GPIO config"></a>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <a href="docs/screenshots/07-FFB%20test.png">
        <img src="docs/screenshots/07-FFB%20test.png" alt="FFB Test — built-in WebHID tester"></a>
    </td>
    <td width="50%">
      <a href="docs/screenshots/04-Iracing%20overlay.png">
        <img src="docs/screenshots/04-Iracing%20overlay.png" alt="iRacing overlay (Picture-in-Picture)"></a>
    </td>
  </tr>
</table>

<p align="center">
  <a href="https://github.com/sponsors/eagabriel" target="_blank">
    <img src="https://img.shields.io/badge/Sponsor%20on%20GitHub-30363D?style=for-the-badge&logo=GitHub-Sponsors&logoColor=EA4AAA"
         alt="Sponsor on GitHub" height="80">
  </a>
  &nbsp;&nbsp;
  <a href="https://www.buymeacoffee.com/eduardogabq" target="_blank">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
         alt="Buy me a coffee" height="80">
  </a>
</p>

> 💛 **Open-source, maintained on personal time.** If this firmware saved
> you a few hundred bucks on a commercial wheelbase, please consider
> [becoming a GitHub Sponsor](https://github.com/sponsors/eagabriel) or
> [buying a coffee](https://www.buymeacoffee.com/eduardogabq) — it really
> helps keep the project going.

Based on:
- [ODrive Firmware v0.5.6](https://github.com/odriverobotics/ODrive) (motor control)
- [OpenFFBoard](https://github.com/Ultrawipf/OpenFFBoard) (FFB stack: HidFFB + EffectsCalculator)

## 🚀 Quick start

**Fastest path — in-browser Quick Start wizard:**

Open **<https://eagabriel.github.io/Odrive-Wheel/>** (Chrome/Edge), connect
the board via Web Serial, and follow the **Quick Start** tab — a 12-step
guided wizard that walks you from blank firmware all the way to FFB
responding in-game:

1. Flash firmware (DFU) → 2. Connect → 3. Erase old config → 4. Power
& protections → 5. Motor config → 6. Encoder config → 7. Motor
calibration → 8. Encoder offset → 9. Mark pre-calibrated & Save →
10. FFB config → 11. Test Spring → 12. Done.

Each step shows the suggested values, links to the relevant config tab,
and decodes errors inline. PT/EN i18n.

**Want the long-form reference instead?** Read
**[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)** for:

- Flashing a pre-built `.bin` (with `dfu-util` or directly from the browser)
- Compiling from source in VS Code
- **Minimum safe configuration** to bring the motor up the first time without
  blowing the brake resistor or tripping the PSU

## 📐 How torque control works

For a deep dive into how the FFB pipeline turns a torque demand (in Nm) into
actual motor current — and which parameters affect each stage — see
**[docs/TORQUE_CONTROL.md](docs/TORQUE_CONTROL.md)**. Useful when tuning
`current_control_bandwidth`, `torque_constant`, feed-forward, and understanding
why PID gains (`pos_gain`, `vel_gain`, etc.) are inert in TORQUE mode.

## Repository structure

```
.
├── Odrive-Wheel/               ← Main project (CDC + HID composite + FFB)
│   ├── src/                    ← Local sources (USB, FFB bridge, cmd_table)
│   ├── inc/                    ← Local headers
│   ├── linker/                 ← Custom linker script (S0/S3-9 app, S10-11 EEPROM)
│   ├── tools/                  ← HTML config tool (Web Serial + WebUSB DFU, PT/EN i18n)
│   └── Makefile                ← Build via arm-none-eabi-gcc
├── ODrive-fw-v0.5.6/           ← ODrive firmware (with minimal patches)
├── OpenFFBoard-master/         ← Submodule → upstream Ultrawipf/OpenFFBoard
└── docs/                       ← Getting Started + screenshots
```

## What's been done

### Hardware supported
- MKS XDrive Mini (STM32F405RGT6, BLDC motor, ABZ encoder, brake resistor)

### FFB pipeline
- USB enumerates as **CDC + HID composite** (TinyUSB)
- HID descriptor: 2-axis PID gamepad (DirectInput / Windows FFB compatible)
- Game sends HID OUT reports → `HidFFB` → `EffectsCalculator` (1 kHz tick) → bridge → `axes[0].controller_.input_torque_` → motor
- Supports effects: **Constant Force**, **Spring**, **Damper**, **Friction**, **Inertia**, **Periodic** (Sine/Triangle/Square/etc.), **Ramp**

### Separated persistence
- ODrive NVM: sectors 1+2 (ODrive's native config_manager)
- FFB emulated EEPROM: sectors 10+11 (filters, gains, wheel params)
- No flash collision — firmware updates do not erase FFB settings

### HTML configuration tool

> 🌐 **Use it online — no install required:**
> **<https://eagabriel.github.io/Odrive-Wheel/>**
>
> The tool runs entirely in the browser (Chrome/Edge) and talks to the board over
> **Web Serial** (config) and **WebUSB** (in-browser DFU flashing). The hosted version
> is always in sync with the latest `Odrive-Wheel/tools/odrive-wheel.html` on `main`.
> You can also clone the repo and open the file locally if you prefer.

Tabs:
- **🚀 Quick Start** — 12-step guided setup wizard (firmware flash → motor cal → FFB test) with suggested values, inline error decoding, and tab cross-links
- **PSU/RBrake** / **Axis 0** / **Motor** / **Encoder** / **Controller** — params via ODrive ASCII
  - Controller tab has a **TORQUE-mode warning banner** flagging which PID-related fields (`pos_gain`, `vel_gain`, `vel_integrator_*`, `inertia`, gain scheduling, etc.) become inert when `control_mode = TORQUE` (default for FFB)
  - One-click **Anticogging Calibration** button: sets `control_mode = POSITION`, triggers the cal, polls progress (index 0→3600), then auto-marks `pre_calibrated` and restores `control_mode = TORQUE`
  - **Zero wheel position** action on the Encoder tab + AS5047 preset for SPI absolute encoders
- **Inputs** — GPIO 1-4 mapped as joystick buttons or analog axes (Complementary-filter smoothing, range/invert per input)
- **FFB Wheel** — range, maxtorque, fxratio, axis effects (idlespring, damper, inertia, friction, **electronic end-stop with separate spring `esgain` + damper `esdamp`**, slew, expo)
- **FFB Effects** — master gain + per-effect gains
- **FFB Filters** — biquad lowpass cutoff + Q per effect type
- **FFB Live** — live dashboard (FFB state, HID counters, active effects, bus current peaks, torque/position chart)
- **FFB Test** — built-in WebHID effect tester (Spring/Constant/Damper/etc.) without needing a game
- **Performance Test** — measures real wheel performance under HID FFB drive: **peak RPM**, **maximum angular acceleration** (2nd derivative of HID position with median+MA filter pipeline, calibrated against RFR Wheel), **friction breakaway** torque, **motor + wheel inertia (J)**, motor saturation detection (Iq sampling), end-stop reach time. Position captured at ~1 kHz via HID input reports during a 6-phase controlled launch (centering → friction probe → push-to-limit → stabilize → LAUNCH → return). Results exportable as CSV. Must be run with the physical wheel attached — measures the real combined assembly.
- **Overlay (iRacing)** — always-on-top Document Picture-in-Picture window (compact dark theme) with live charts for DC bus (vbus / ibus / Iq / I-brake) and wheel dynamics (torque + position). Includes **brake resistor average dissipated power** calculated as `P = R · ⟨I²⟩` over a rolling 60 s window. When the power calculation is enabled, the overlay enters an **exclusive high-rate mode** (25 ms poll of brake current only) to avoid CDC dessync; otherwise the regular multi-signal poll runs no faster than 50 ms.
- **Debug / Status** — device info, state machine actions, decoded errors, live monitor, vbus/ibus/Iq/Ibrake chart
- **Console** — serial TX/RX log
- **DFU Flash** — re-flash the firmware from the browser (no `dfu-util` needed)
- **Save/Load Profile** — export/import full board config as JSON for sharing motor presets

Each configurable field has a **tooltip explaining its function** on hover, and the UI supports **PT/EN** with a header toggle.

### In-browser DFU flasher (no external tool)
The firmware exposes the ASCII command `sd` that triggers a software-only jump
into the STM32 ROM bootloader (no BOOT0 jumper required). The HTML tool then
uses **WebUSB** to talk to the bootloader (`0483:DF11`) and runs the full
**DfuSe** programming sequence (erase application sectors → download → manifest)
right from the browser. After flashing, the board reboots into the new firmware
automatically.

The first flash still has to be done with `dfu-util` (Rota A in
[GETTING_STARTED.md](docs/GETTING_STARTED.md)) — but every subsequent update
can be done in the browser.

## Clone

`OpenFFBoard-master/OpenFFBoard-master/` is a **git submodule** pointing to upstream
[`Ultrawipf/OpenFFBoard`](https://github.com/Ultrawipf/OpenFFBoard) (currently locked at **v1.17.0**).
Clone with submodules:

```bash
git clone --recurse-submodules https://github.com/eagabriel/Odrive-Wheel.git
```

If you already cloned without `--recurse-submodules`:
```bash
git submodule update --init --recursive
```

## Build

Prerequisites:
- `arm-none-eabi-gcc` (tested with 12.2)
- `make`
- `python3` with `pyyaml`, `jinja2`, `jsonschema` (for autogen)
- `dfu-util` (only for the first flash; later updates can use the in-browser flasher)

### Option A — GitHub Actions (zero local setup)

Push to `main` or open a PR. The workflow `.github/workflows/build.yml` runs
autogen + `make` on Ubuntu and uploads `odrive-wheel.bin` as a build artifact
(retention 14 days). Also triggers manually via **Actions → Build Firmware →
Run workflow**.

### Option B — Local build, Windows (`build-local.ps1`)

Wraps autogen + MSYS2 + ARM GCC. Requires MSYS2 at `C:\msys64` (override with
`-MsysBash`). The script auto-detects ARM GCC across common install paths.

```powershell
.\build-local.ps1                 # full clean build
.\build-local.ps1 -NoClean        # incremental (skip make clean)
.\build-local.ps1 -SkipSubmoduleInit  # skip git submodule update
```

### Option C — Manual (Linux / WSL / macOS)

```bash
# 1. Generate ODrive autogen headers (once, regenerate if interface YAML changes)
cd ODrive-fw-v0.5.6/ODrive-fw-v0.5.6/Firmware
mkdir -p autogen
python3 ../tools/odrive/version.py --output autogen/version.c
python3 interface_generator_stub.py --definitions odrive-interface.yaml --template fibre-cpp/interfaces_template.j2     --output autogen/interfaces.hpp
python3 interface_generator_stub.py --definitions odrive-interface.yaml --template fibre-cpp/function_stubs_template.j2 --output autogen/function_stubs.hpp
python3 interface_generator_stub.py --definitions odrive-interface.yaml --generate-endpoints ODrive --template fibre-cpp/endpoints_template.j2 --output autogen/endpoints.hpp
python3 interface_generator_stub.py --definitions odrive-interface.yaml --template fibre-cpp/type_info_template.j2 --output autogen/type_info.hpp

# 2. Build
cd ../../../Odrive-Wheel
make -j$(nproc)
```

Artifact: `Odrive-Wheel/build/odrive-wheel.bin`

## Flash

You have three options. Full details in [GETTING_STARTED.md](docs/GETTING_STARTED.md).

### Option 1 — `dfu-util` (CLI, required for the first flash)

Put the board into DFU mode (hold BOOT0 + reset, or power-cycle with BOOT0 held), then:

```bash
make flash-dfu
```

Equivalent to:
```bash
dfu-util -d 0483:df11 -a 0 -s 0x08000000:leave -D build/odrive-wheel.bin
```

### Option 2 — In-browser DFU flasher (after the first flash)

Once the Odrive-Wheel firmware is on the board, you can update it without `dfu-util`:

1. Open `Odrive-Wheel/tools/odrive-wheel.html` in Chrome/Edge.
2. Connect to the board (Web Serial).
3. Open the **DFU Flash** tab in the sidebar.
4. Run the four steps: **Reboot to DFU → Find bootloader → Choose file → Flash firmware**.

On Windows, the STM32 bootloader needs the **WinUSB** driver (one-time setup
via [Zadig](https://zadig.akeo.ie/)). See `GETTING_STARTED.md` for details.

## Screenshots

The HTML configuration tool runs entirely in the browser via Web Serial API
(Chrome/Edge), with no install required. Additional views:

![Header detail](docs/screenshots/02-Header.png)

![Header sidebar](docs/screenshots/03-Header.png)

![Encoder tab — Zero wheel position + AS5047 preset](docs/screenshots/05-Zero%20e%20encoder.png)

## Updating OpenFFBoard upstream

Several FFB stack files (HidFFB, EffectsCalculator) were **forked and modified** locally in
`Odrive-Wheel/src/` and `inc/`. The originals live in the `OpenFFBoard-master/` submodule.

When upstream releases relevant updates, workflow:

```bash
# 1. Pull latest upstream commit into the submodule
git submodule update --remote OpenFFBoard-master/OpenFFBoard-master

# 2. See what changed
cd OpenFFBoard-master/OpenFFBoard-master
git log --oneline HEAD@{1}..HEAD          # new commits
git diff HEAD@{1}..HEAD --stat            # changed files
cd ../..

# 3. Compare our forks against the updated upstream
./Odrive-Wheel/tools/check-openffboard-upstream.sh           # summary
./Odrive-Wheel/tools/check-openffboard-upstream.sh --verbose # with diffs

# 4. For each file marked "DIVERGE" with relevant upstream changes,
#    manually integrate into our fork in Odrive-Wheel/

# 5. Compile + test
cd Odrive-Wheel && make -j4

# 6. Commit
git add OpenFFBoard-master/OpenFFBoard-master Odrive-Wheel/...
git commit -m "Bump OpenFFBoard upstream to <hash> + integrate changes"
```

Forked files have a header at the top indicating:
- Upstream version that was the fork base (commit hash)
- Description of local modifications
- Exact command to diff against upstream

E.g., `Odrive-Wheel/src/HidFFB.cpp` documents the `set_effect` modification for single-axis fallback.

## Licenses

This project combines code from multiple sources with different licenses:

- **ODrive Firmware** — MIT License — `ODrive-fw-v0.5.6/`
- **OpenFFBoard** — GPLv3 — `OpenFFBoard-master/`
- **Our own code** (`Odrive-Wheel/src`, `inc`, `tools`) — GPLv3 (compatible with OpenFFBoard)

Because GPL-licensed code from OpenFFBoard is included, the **combined work** (compiled firmware) is
distributed under **GPLv3**. See `LICENSE` at the repo root and individual licenses in subdirectories.

## 💛 Support the project

A commercial direct-drive wheelbase with similar specs costs **R$3,000 to
R$10,000+**. Odrive-Wheel turns a generic BLDC motor + a $40 board into
something that competes with that — entirely open-source, no licensing,
no subscriptions, no firmware lock-ins.

Every hour invested here came out of nights and weekends. **If this project
saved you real money**, please consider supporting it so I can keep adding
features, fixing bugs, and answering questions:

<p align="center">
  <a href="https://github.com/sponsors/eagabriel" target="_blank">
    <img src="https://img.shields.io/badge/Sponsor%20on%20GitHub-30363D?style=for-the-badge&logo=GitHub-Sponsors&logoColor=EA4AAA"
         alt="Sponsor on GitHub" height="80">
  </a>
  &nbsp;&nbsp;
  <a href="https://www.buymeacoffee.com/eduardogabq" target="_blank">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
         alt="Buy me a coffee" height="80">
  </a>
</p>

**GitHub Sponsors** is the easiest way for recurring support and gives you
visibility on the repo. **Buy Me a Coffee** is great for a one-time thanks.
Both go directly to me, and every contribution — no matter the size —
makes a real difference.

🙏 **Other ways to help, even for free:**
- ⭐ Star the repo
- 🐛 Open issues for bugs you find
- 📣 Share with sim racing friends (Reddit, Discord, forums)
- 📸 Post videos/photos of your build — tag the project

## Status

✅ Motor + encoder calibration working
✅ FFB validated: Spring / Constant / Friction / Periodic responding in ForceTest
✅ Brake resistor + regen stable (no PSU resets)
✅ Separated FFB / ODrive persistence
✅ Full HTML config tool in PT/EN with **12-step Quick Start wizard**
✅ One-click **Anticogging Calibration** via custom `axis.anticogcal!` command
✅ **GPIO 1-4** as joystick buttons or analog axes
✅ **Inputs tab** with GPIO config + live preview
✅ Controller tab **TORQUE-mode warning** flagging inert fields
✅ In-browser DFU flasher (WebUSB + DfuSe), FFB EEPROM preserved across reflash
✅ **iRacing overlay** (Document Picture-in-Picture) + **brake resistor dissipated power** (P = R·⟨I²⟩, exclusive 25 ms mode)
✅ **Performance Test** — peak RPM, peak angular acceleration, friction breakaway, inertia J, motor saturation
✅ **Electronic end-stop** with separate spring (`axis.esgain`) and damper (`axis.esdamp`) — prevents end-of-range bounce
✅ **Current control deadband** (`motor.config.current_control_deadband`) — kills idle vibration from PI chasing ADC/encoder noise
✅ **Robust JSON import** — handles readonly paths, allows re-importing the same file, progress toast for long applies
✅ **Motor NTC thermistor support** with NTC coefficient calculator (Steinhart + LSQ poly fit), 3.3V/5V pull-up options, wiring diagram in UI
✅ **Max torque helper** in FFB Wheel tab — real-time check of `axis.maxtorque` vs `current_lim × torque_constant`
✅ **GPIO 6 as button input** (PB2, digital only)
✅ **Calibrated fields read-only** — prevents accidentally breaking calibration via UI edits
✅ **CI builds** via GitHub Actions — `.bin` artifact on every push
✅ End-to-end validation in **iRacing**

## History

Built iteratively, in phases:

- **Phase 1** — ODrive v0.5.6 stock working + calibration
- **Phase 2a/b** — TinyUSB CDC + HID composite enumerating
- **Phase 2c** — FFB stack ported from OpenFFBoard
- **Phase 2d** — OpenFFBoard CmdParser via CDC (dual parser: ODrive ASCII + OpenFFBoard)
- **Phase 3** — FFB persistence in emulated EEPROM (S10+S11), full HTML tool, dashboards
- **Phase 4** — Project rename to **Odrive-Wheel**, in-browser DFU flasher (WebUSB + DfuSe), Getting Started guide
- **Phase 5** — iRacing overlay (Document Picture-in-Picture, dark/light theme), Encoder tab actions (zero wheel position + AS5047 preset), DFU now preserves FFB EEPROM across re-flash
- **Phase 6** — **Quick Start wizard** (12-step guided setup), **GPIO 1-4 inputs** as buttons/axes, Controller TORQUE-mode warning, **Anticogging calibration** via custom `axis.anticogcal!` command (workaround for ODrive readonly `calib_anticogging`), `vbus_divider` boot fix (no more spurious overvoltage trips), **CI builds** via GitHub Actions, **Save/Load motor profiles** as JSON
- **Phase 7** — **Performance Test tab** (peak RPM, peak angular acceleration via 2nd-derivative of HID-captured position at ~1 kHz, friction breakaway, motor + wheel inertia J, motor saturation detection; filter pipeline calibrated against RFR Wheel), **brake resistor power dissipation** in the overlay (P = R·⟨I²⟩ over rolling 60 s window with exclusive 25 ms poll mode to avoid CDC dessync), **electronic end-stop split into spring + damper** (`axis.esgain` and `axis.esdamp` — fixes end-of-range bounce), sidebar search, embedded logo, console picker, schema label/path decoupling, PSU/RBrake sidebar rename
- **Phase 8** — **Current control deadband** (`motor.config.current_control_deadband`) on the FOC PI error eliminates idle vibration from the loop chasing ADC/encoder quantization noise (default 100 mA, tuned for the MKS XDrive Mini), Quick Start UX fixes (encoder cal description "~1 turn" instead of "~10 turns" + auto-disable of velocity limits on initial setup to prevent ERROR_OVERSPEED), **JSON import robustness** (writeProp absorbs ODrive error replies to fix FIFO dessync, readonly paths skipped on export/import, file input value reset to fix the "second import does nothing" bug), **progress toast** with progress bar for long bulk operations
- **Phase 9** — **Full motor NTC thermistor support** (offboard, with current derating): schema fields in Motor tab + visual wiring diagram banner + coefficient calculator (Steinhart model + LSQ polynomial fit) + 4th "Thermistor" mode in Inputs tab as a shortcut, **Max torque helper** on FFB Wheel tab (real-time `current_lim × torque_constant` validation with green/red status), **GPIO 6 as button input** (PB2 digital-only) with smart UI restriction, **calibrated fields read-only** (`phase_resistance`/`phase_inductance`/`encoder.direction`/`phase_offset`/`phase_offset_float`) prevents accidentally breaking calibration, **Quick Start center wheel warning** before encoder cal, spinout detection thresholds raised (`10W → 50W`) for sim racing tolerance, **gpio_inputs DISABLED preserves ODrive ANALOG_IN config** (fixes thermistor reading garbage from digital input buffer)
