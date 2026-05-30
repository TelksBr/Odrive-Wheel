# v1.0.0-rc10 — Motor thermistor, GPIO 6, max torque helper, Quick Start polish

> Iteration focused on motor thermal monitoring, expanded GPIO support, better visibility of the motor's physical limits in the tool, and protection against accidental editing of calibrated fields.

## ✨ Highlights

- [x] 🌡️ **Full motor thermistor (NTC) support** (offboard) — dedicated UI in the Motor tab + coefficient calculator with its own modal + wiring diagram + support for 3.3V or 5V Vref
- [x] ⚡ **Maximum torque helper** in the FFB Wheel tab — shows the motor's real physical limit (`current_lim × Kt`) and warns in red if `axis.maxtorque` is above it
- [x] 🔌 **GPIO 6 as a button** available in the Inputs tab (PB2 on the STM32, digital only)
- [x] 🚀 **Clearer Quick Start**: step 8 with correct description + warning to center the wheel; step 9 disables velocity limits automatically
- [x] 🛡️ **Read-only calibrated fields** with "RO" badge — you can no longer break calibration by editing them manually
- [x] 🎛️ Spinout detection more tolerant for sim racing (50/-50 W)

---

## 🌡️ 1. Motor NTC thermistor — full support

ODrive 0.5.6 had native support for an offboard NTC thermistor, but our UI didn't expose it. This release implements the entire stack:

### Schema (Motor tab)

Two new sections:

**FET thermistor (onboard)** — gate driver temperature sensor, enabled by default:
- `enabled` (bool)
- `temp_limit_lower` / `temp_limit_upper` (°C)

**Motor thermistor (NTC offboard)** — external sensor wired to a GPIO in ANALOG_IN mode:
- `enabled` (bool)
- `gpio_pin` (int — which GPIO to use)
- `temp_limit_lower` / `temp_limit_upper` (°C)
- `poly_coefficient_0..3` (T(V) polynomial coefficients)

Temperature limits apply **progressive current derating**: T < lower → current_lim unchanged. lower < T < upper → current_lim drops linearly. T ≥ upper → error + disarm.

### Coefficient calculator

**🧮 Calculate coefficients…** button next to `poly_coefficient_0` opens a modal:

```
β (beta):         3950
R @ 25°C (Ω):     10000
Pull-up (Ω):      10000
V reference:      3.3   (or 5)
Range Tmin (°C):  10
Range Tmax (°C):  130

→ Generated coefficients (c0..c3, in ODrive's order)
→ Verification table with predicted V_pin for 5 temperatures
→ RMS fit error
```

Internal math:
- Simplified Steinhart model: `R(T) = R₀ · exp(β · (1/T − 1/T₀))`
- Voltage divider: `V_pin = Vref × R_NTC / (R_pullup + R_NTC)`
- Normalization by **3.3V VDDA** (the STM32 ADC always references 3.3V, independent of the pull-up Vref chosen)
- 3rd-order polynomial regression via least squares (normal equations + Gaussian elimination)
- Coefficients written in ODrive's order (`poly_coefficient_0` = highest order, same as numpy.polyfit)

### Visual wiring diagram

Banner with ASCII art showing the circuit + notes about the external pull-up:

```
    3.3V
      │
   ┌──┴──┐
   │ 10k │  ← EXTERNAL pull-up (required)
   └──┬──┘
      │
      ├──► GPIO (ANALOG_IN, on ADC)
      │
   ┌──┴──┐
   │ NTC │
   └──┬──┘
     GND
```

⚠️ **Important:** STM32F405 automatically disables internal pulls in ANALOG_IN mode. Pull-up must be **external**. Documented setups:
- **3.3V + 10kΩ pull-up** (default, 1.44V swing)
- **5V + 47kΩ pull-up** (more swing — 2.5V — for better resolution; pull-up smaller than 47k with 5V burns the ADC at low temperatures)

### "Thermistor" mode in the Inputs tab (shortcut)

To avoid users jumping between Inputs and Motor:
- Each GPIO card (1-4, ADC-capable) gets a 4th option: **Thermistor (NTC)**
- Selecting it → the tool writes `motor_thermistor.gpio_pin = N`, `enabled = True`, `config.gpioN_mode = ANALOG_IN` automatically
- The tab switches to **Motor** and scrolls to the thermistor section so you can tune coefficients
- Automatic detection on Read All: if motor_thermistor is already configured, the corresponding GPIO card shows up as Thermistor

### Firmware bug fixed

`gpio_inputs.cpp`: when a GPIO was in our inputs system's DISABLED mode, it was forcing the pin to `GPIO_MODE_INPUT` (digital), overriding any ANALOG_IN config from the ODrive. This broke the thermistor — the ADC ended up reading through the digital input buffer → polynomial received a corrupt value.

Fix: DISABLED mode now **does not touch the pin** — it preserves what ODrive set via `config.gpioN_mode`. Safe behavior even if nothing else configured it (default analog hi-Z on the STM32).

---

## ⚡ 2. "Maximum torque" helper in the FFB Wheel tab

Right below the `axis.maxtorque` field, a new banner shows:

```
✓ Physical limit: 20.00 A × 0.870 Nm/A = 17.40 Nm
  Effective max: 17.40 Nm
  axis.maxtorque ≤ effective limit — OK              [GREEN]
```

When `torque_lim` is active, it shows both caps:
```
Physical limit: 20.00 A × 0.870 Nm/A = 17.40 Nm · torque_lim: 10.00 Nm
Effective max: 10.00 Nm
```

When user sets `axis.maxtorque` above the physical limit:
```
⚠ Physical limit: 20.00 A × 0.870 Nm/A = 17.40 Nm
  Effective max: 17.40 Nm
  axis.maxtorque (25.0 Nm) > effective limit (17.4 Nm) —
  FFB effects above 17.4 Nm will saturate physically, and
  the game calibrates for torque the motor cannot deliver.
  Reduce axis.maxtorque or increase current_lim.    [RED]
```

Updates in **real time** when the user changes any of the 4 relevant fields (`axis.maxtorque`, `current_lim`, `torque_constant`, `torque_lim`) and on Read All.

Useful because the mismatch between FFB maxtorque and the motor's physical capacity is **the most common config mistake** — peak torque delivered does not change, but effects saturate prematurely, HID resolution is wasted, and the game calibrates wrongly.

---

## 🔌 3. GPIO 6 as a button

The MKS XDrive Mini exposes GPIO 6 (PB2) on the external header. It now appears in the **Inputs** tab cards, with a visual restriction:

- Modes available: `Off`, `Button` (no `Axis` nor `Thermistor` because PB2 has no ADC channel on the STM32F405)
- Pin label: "PB2 (digital only)" to make it clear
- Tab subtitle updated: "GPIOs 1-4 and 6"

Firmware refactored to support discontinuous mapping: ASCII instances 1, 2, 3, 4, **6** → internal indices 0, 1, 2, 3, **4**. Instance 5 returns invalid (PC4 not exposed on the MKS header).

`GPIO_INPUTS_COUNT` bumped from 4 → 5. EEPROM addresses added for GPIO 6 (`ADR_GPIO6_CFG/_AMIN/_AMAX`). Set_mode rejects `AXIS` on pins without ADC.

---

## 🚀 4. Clearer Quick Start

### Step 8 (encoder calibration)

**Before:** "Motor spins ~10 turns"
**After:** "Motor spins ~1 turn (gently)" — correct description + prominent warning to **center the wheel mechanically BEFORE** starting:

> ⚠ BEFORE starting: position the wheel PERFECTLY AT MECHANICAL CENTER (lock-to-lock midpoint). This step spins the motor ~1 turn — if the wheel is off-center, the calibration may hit the physical end-stop and fail; and the resulting encoder "zero" will be offset from the real center.

### Step 9 (mark pre-calibrated + startup flags)

Now also **automatically disables** the 3 velocity limit flags:
- `enable_vel_limit = False`
- `enable_overspeed_error = False`
- `enable_torque_mode_vel_limit = False`

Common complaint: users finished setup, spun the wheel to test and got `ERROR_OVERSPEED` (motor disarmed because the wheel crossed 5 turn/s = 300 RPM, the default). New users didn't know what to do.

Description updated to explain these flags are off for first setup and that the user can re-enable/adjust them in the Controller tab once the rig is stable.

---

## 🛡️ 5. Read-only calibrated fields

Five fields now display with an orange "RO" badge + disabled input + no `✓` write button:

- `axis0.motor.config.phase_resistance` (measured by motor cal)
- `axis0.motor.config.phase_inductance` (measured by motor cal)
- `axis0.encoder.config.direction` (calibrated by motor cal — inverting this here = inverts the FOC, motor oscillates)
- `axis0.encoder.config.phase_offset` (calibrated by encoder offset cal)
- `axis0.encoder.config.phase_offset_float` (same)

Editing these fields was **silently** breaking calibration — Park transform with the wrong angle, current PI with the wrong gains, etc. Users couldn't tell what was happening. Now protected.

To invert the wheel direction from the user/game perspective, use `axis.invert` (FFB Wheel tab) — NOT `encoder.direction`.

JSON export/import still works for these fields (for cloning config between identical boards); only manual editing in the UI is blocked.

---

## 🎛️ 6. Spinout detection more tolerant

`controller.hpp` defaults updated for sim racing:

| Field | ODrive stock | Odrive-Wheel rc10 |
|---|---|---|
| `mechanical_power_bandwidth` | 20 rad/s | **20 rad/s** (kept) |
| `electrical_power_bandwidth` | 20 rad/s | **20 rad/s** (kept) |
| `spinout_electrical_power_threshold` | 10 W | **50 W** |
| `spinout_mechanical_power_threshold` | -10 W | **-50 W** |

Legitimate power peaks in sim racing (counter-torque with MAIRA, electronic end-stop, strong FFB kicks) were triggering false positives with stock thresholds. 5× more tolerant keeps protection against real spinout (loss of FOC calibration) but absorbs normal transients.

⚠️ Defaults only activate on fresh NVM or after `se` (erase config). Boards already configured keep the old values until set manually (or erased).

---

## 📦 Upgrade

- [x] **NVM forward-compatible** — all new fields (motor_thermistor configs, GPIO 6 EE addresses) default to safe values
- [x] No need to erase config
- [x] After flashing, hard-refresh the HTML (Ctrl+Shift+R) to load the new UI
- [x] To use the thermistor: requires external wiring (pull-up + NTC) on a GPIO 1-4 (with ADC); configure via Inputs tab → Thermistor or Motor tab directly

## 🔗 Compare

[`v1.0.0-rc9...v1.0.0-rc10`](../../compare/v1.0.0-rc9...v1.0.0-rc10)

---

🤖 Co-authored with Claude Code
