# v1.0.0-rc8 — Performance Test, brake resistor power, dual end-stop

> Iteration focused on real wheel performance measurement and on improving electronic end-stop control.

## ✨ Highlights

- [x] 📊 **Performance Test tab** — measures peak RPM, maximum angular acceleration, friction breakaway, inertia (J), and motor saturation using HID input reports at ~1 kHz during a controlled launch
- [x] 🔥 **Brake resistor power calculation** in the overlay — computes average dissipated power (`P = R · ⟨I²⟩`) over a 60 s rolling window, with an exclusive 25 ms poll mode to avoid CDC dessync
- [x] 🛑 **Electronic end-stop split into spring + damper** — new independent parameters `axis.esgain` and `axis.esdamp` eliminate bouncing without locking the wheel
- [x] 🎛️ `Controller` defaults bumped for anticogging robustness with heavy motors (inert in TORQUE mode)
- [x] 🎨 Tool polish: embedded logo in the header, search box moved to the sidebar, fonts ~20% smaller, console redesigned, schema label/path decoupled

---

## 📊 1. Performance Test

A new tab dedicated to measuring real performance of the motor + wheel assembly under HID FFB drive. Runs a 6-phase sequence:

1. **Centering** — drives the wheel back to 0° via PID position
2. **Friction probe** — increasing torque ramp until motion starts → captures `friction breakaway`
3. **Push to limit** — constant negative force pushing into the end-stop
4. **Stabilize** — holds at the end-stop to obtain a final position reference
5. **LAUNCH** — full force in the opposite direction, captures position at ~1 kHz via HID input reports and Iq via Web Serial ASCII
6. **Return to center** — disables FFB and returns under PID control

### Reported results

- [x] **Peak RPM** (absolute) and timestamp
- [x] **Peak angular acceleration** — 2nd derivative of position with a median + MA pipeline calibrated against RFR Wheel
- [x] **Friction breakaway** in N·m (estimated from `maxtorque × fxratio × duty` at the breakaway instant)
- [x] **Inertia (J)** in kg·m² and in ODrive units (Nm/(turn/s²)) — `J = T / α`
- [x] **Motor saturation flag** — detects whether `Iq ≥ 95% × current_lim` at any point during the launch
- [x] **End-stop reach time** (time to 80% of range)
- [x] **CSV export** with position, velocity, and acceleration per sample

### Acceleration filtering

Double-differentiating HID position amplifies timestamp jitter and encoder quantization noise. Current pipeline:

```
position:     Median-5 → MA-11                 (kills quantization + smooths jitter)
velocity:     central diff ±4ms                (no additional smoothing)
acceleration: central diff ±4ms → Median-7     (kills 1-3 sample spikes, preserves real pulses)
```

Equivalent latency is ~10 ms, close to the 7.9 ms reported by RFR Wheel. The acceleration peak is detected only where `v × a > 0` (velocity magnitude growing), filtering out the violent deceleration against the end-stop.

### Caveat

⚠️ **Must be run with the physical wheel mounted.** The result reflects the inertia + friction of the real assembly, not the bare motor.

📝 File: `Odrive-Wheel/tools/odrive-wheel.html` (functions `ptRunSequence`, `_ptComputeResults`, `_ptDrawChart`)

---

## 🔥 2. Brake resistor average power

The overlay now computes and displays the **average power dissipated in the brake resistor** over a 60 s rolling window. Useful for sizing the resistor and PSU for long sessions.

### Calculation

```
P_avg = R_brake × ⟨I_brake²⟩      (mean-square over 60 s)
```

R_brake is read from the ODrive's `config.brake_resistance`. Each `brake_resistor_current` sample is squared before entering the rolling buffer, then the mean is multiplied by R.

### Exclusive mode

The single-tagged read of `brake_resistor_current` was colliding with the overlay's general poll (vbus / ibus / Iq) — occasionally a 24 V reading would be interpreted as 24 A, blowing P up to >10 kW.

Fix: when the power calculation is active, the overlay enters **exclusive mode**:

- [x] Halts the standard multi-signal poll
- [x] Reads ONLY `brake_resistor_current` every **25 ms** (high rate is safe because it's a single request/reply)
- [x] When disabled, restores the regular poll (minimum 50 ms)

📝 Functions: `_ovlUpdateBrakePower`, `_ovlStartBrakePowerFastPoll`, `_ovlStopBrakePowerFastPoll`

---

## 🛑 3. Electronic end-stop: independent spring + damper

### Problem

In rc7 the electronic end-stop was a spring only (`axis.esgain`). A very firm spring caused bounce; a soft spring let the wheel cross through the end-stop slowly. There was no way to dose the response.

### Solution

The end-stop now sums two independent components in the overshoot region (`|pos| > range/2`):

```c
F_spring = -overshoot_deg × esgain × 25.0     // spring (OpenFFBoard compat)
F_damper = -speed          × esdamp ×  1.0    // damper proportional to velocity
F_total  = clamp(F_spring + F_damper, ±32767)
```

| Parameter | Function | Default |
|---|---|---|
| `axis.esgain` | Spring force in the overshoot region | 0 (off) |
| `axis.esdamp` | Damping, INDEPENDENT of the spring | 15 (light) |

Typical combinations:
- **Firm spring + light damper** → "hard" end-stop with tactile feedback
- **Soft spring + strong damper** → "soft" end-stop that absorbs impact
- **Damper 100+** → saturates above ~330°/s — for extreme simulation only

### Backwards-compatible storage

`ADR_AXIS1_ENC_RATIO` (16 bits) packs:
- low byte = `esgain`
- high byte = `esdamp`

Old firmware wrote only the low byte (high byte = 0). On read, if the high byte is 0 the firmware assumes the legacy format and preserves the init default of `esdamp = 15`. Existing NVM remains compatible.

📝 Files: `Odrive-Wheel/src/ffb_task.cpp`, `Odrive-Wheel/src/cmd_table.cpp`

---

## 🎛️ 4. Controller defaults bumped

`Controller::Config_t` (in `ODrive-fw-v0.5.6/.../MotorControl/controller.hpp`):

| Field | ODrive stock | Odrive-Wheel rc8 |
|---|---|---|
| `pos_gain` | 20.0 | **100.0** |
| `vel_gain` | 1/6 ≈ 0.1667 | **0.566** |
| `vel_integrator_gain` | 2/6 ≈ 0.333 | **1.33** |

> ⚠️ **Inert in TORQUE mode.** Only affect **anticogging calibration** (which temporarily forces POSITION_CONTROL). Needed to make the cal converge with heavy motors such as the MKS XDrive Mini.

---

## 🎨 5. Tool polish

- [x] **Embedded logo** (base64 data URI) in the header and as PWA icon — no external file dependency
- [x] **Search box moved from header to sidebar** — sits right below the logo, always visible
- [x] **Fonts ~20% smaller** across the whole tool — more content fits in the viewport
- [x] **Console redesigned** — console picker, auto-scroll with pause-on-hover, filter dropdown
- [x] **PSU/RBrake** — renamed the "ODrive" sidebar tab to better reflect that it shows power stage parameters
- [x] **Overlay forced dark + compact** — theme and size options removed (fixed 480 × 400)
- [x] **SCHEMA label/path decoupled** — fields accept an optional second `displayName` argument, allowing the visible label to be edited in HTML without breaking the underlying ODrive ASCII path

---

## 📦 Upgrade

- [x] NVM from rc7 is **forward-compatible** — no need to erase config
- [x] `esdamp` will be initialized to 15 (light default) on first boot
- [x] After flashing, hard-refresh the HTML (Ctrl+Shift+R) to load the Performance Test + brake power UI
- [x] Performance Test requires the **physical wheel mounted** — without it the inertia reading reflects only the bare rotor

## 🔗 Compare

[`v1.0.0-rc7...v1.0.0-rc8`](../../compare/v1.0.0-rc7...v1.0.0-rc8)

---

🤖 Co-authored with Claude Code
