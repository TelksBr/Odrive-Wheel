# v1.0.0-rc11 — Zero Wheel via GPIO, persistent center offset, zero-centered charts, GitHub DFU fetch

> Iteration focused on operational ergonomics: a physical button can now zero the wheel, the offset survives reboots, all charts respect zero as the visual center, the DFU pulls the latest release directly from GitHub, and the thermistor calculator got more robust.

## ✨ Highlights

- [x] 🎯 **Zero Wheel via GPIO** — any GPIO 1-4/6 can act as a "zero wheel button"; pressing it fires `ffb_axis_zeroenc()` on the edge
- [x] 💾 **Persistent center offset** in flash (2 EE slots of float32) — survives reboots; no need to redo encoder offset cal every power cycle
- [x] 📊 **Charts with zero forced at center** for bidirectional signals (torque, position, Iq, Ibus) across all 5 tool charts — no more drifting axes
- [x] 🌐 **DFU "Fetch latest from GitHub"** — pulls the `.bin` from the latest release without manual download
- [x] 📖 **Explanation banner at the top of the Encoder tab** — clarifies electrical offset cal vs. mechanical center vs. idleSpring
- [x] ⚠️ **Warning for incremental encoder without index Z** — explains the recalibration-each-boot reality and how to mitigate with persistent Zero Wheel
- [x] 🌡️ **NTC calculator: 3 math bugs fixed** — inverted divider, normalization by Vref instead of VDDA, coefficient ordering (numpy.polyfit convention)
- [x] 🐛 **Critical Zero Wheel mode acceptance bug** — both the ASCII handler and the load sanity check silently rejected `mode=3`

---

## 🎯 1. Zero Wheel via GPIO

Use case: sim racers want a physical button (on the wheel or shifter) that zeroes the position instantly — useful when the game loses center after long force loops, or when running an incremental encoder without index Z that needs recentering every session.

### Firmware (`gpio_inputs.h/cpp`)

New mode `GPIO_INPUT_ZEROWHEEL = 3` (joins 0=DISABLED, 1=BUTTON, 2=AXIS).

```c
#define GPIO_INPUT_DISABLED   0
#define GPIO_INPUT_BUTTON     1
#define GPIO_INPUT_AXIS       2
#define GPIO_INPUT_ZEROWHEEL  3   // ← new
```

Pin configuration matches BUTTON mode: digital input with internal pull-up. Edge detection inside `gpio_inputs_update_report()`:

```cpp
// Detects high → low (button pressed to GND)
static bool s_zerowheel_was_high[GPIO_INPUTS_COUNT] = {true, true, true, true, true};
...
case GPIO_INPUT_ZEROWHEEL: {
    bool pin_high = (HAL_GPIO_ReadPin(...) == GPIO_PIN_SET);
    if (cfg.invert) pin_high = !pin_high;
    if (s_zerowheel_was_high[i] && !pin_high) {
        ffb_axis_zeroenc();   // fires virtual encoder zero
    }
    s_zerowheel_was_high[i] = pin_high;
    break;
}
```

Natural debounce comes from the 1 kHz read rate plus the high→low transition hysteresis (prevents repeating the zero while the user holds the button).

### UI (Inputs tab)

New value 4 = "Zero Wheel" in the mode dropdown (UI 3 was already thermistor offboard, so UI 4 went to the new mode to avoid breaking older mappings):

```
Off    (0 → fw 0)
Button (1 → fw 1)
Axis   (2 → fw 2)
Thermistor (3 → fw 0 + motor_thermistor.enabled=True)
Zero Wheel (4 → fw 3)
```

`uiToFw()` and `effectiveMode` in reload() handle the translation in both directions. A green hint card appears under the input when this mode is active, explaining the behavior and reminding users to click **Save** to persist.

### Critical bug (found during validation)

Two sanity checks were silently rejecting `mode=3`:

1. **`cmd_table.cpp:238`** — ASCII handler `h_gpio_mode` validated `val > 2` → the `gpio.6.mode 3` command returned an error, the set never reached `gpio_inputs_set_mode`, and the RAM value stayed DISABLED.
2. **`gpio_inputs.cpp:137`** — boot-time load sanity rejected `m > GPIO_INPUT_AXIS` → even if save had written 3, the boot reset it back to DISABLED.

Both checks were written before the ZEROWHEEL mode existed. Fix: bump the upper limit to `GPIO_INPUT_ZEROWHEEL` in both spots.

---

## 💾 2. Persistent center offset

ODrive performs encoder offset calibration (electrical pole-encoder alignment) — that's not the mechanical center. When the user clicks **"Zero wheel position"** on the Encoder tab, the tool captured the offset in RAM (`zeroOffset_`) but lost it on reboot.

Now it persists to flash. Two new EE slots:

```c
#define ADR_AXIS1_ZEROOFS_LO    0x020B   // 16 LSB of float32
#define ADR_AXIS1_ZEROOFS_HI    0x020C   // 16 MSB of float32
```

Packed via float32↔uint32 union, sanity checks on load (rejects NaN/Inf), preserves 0.0f if the EE is virgin (both slots = 0xFFFF).

Combining this with feature #1 is powerful: even on an incremental encoder without index Z, the user can (1) power on, (2) manually align the wheel to center, (3) press the GPIO Zero Wheel button, (4) click Save. Next boot, just power on with the wheel roughly centered before encoder offset calibration runs — the saved offset takes care of the micro-adjustment.

---

## 📊 3. Zero-centered charts

Previously all tool charts used auto-scale tight to the dataset (`min..max` of the buffer). For bidirectional signals (torque can be ±, position can be ±, Iq can be ±), this made the axis drift — if the signal swept only one way, zero ended up at the edge.

For all 5 charts in the tool (Performance Test, FFB Test, Overview Bus, Overview Wheel, and the main chart), bidirectional signals now use **`±max(|min|, |max|)`** — zero is always at the center:

```js
const absMax = Math.max(Math.abs(yMin), Math.abs(yMax));
yMin = -absMax;
yMax = +absMax;
```

Unidirectional signals (Vbus that's never negative, Ibrake that's always positive) keep traditional auto-scale.

---

## 🌐 4. DFU — Fetch latest from GitHub

Previously you could only pick a local `.bin`. Now a "**📡 Fetch latest from GitHub**" button:

1. Hits `https://api.github.com/repos/dnegris/Odrive-Wheel/releases/latest`
2. Lists the `.bin` assets from the release
3. Downloads directly to an in-memory `Blob`
4. Lets you flash immediately without touching the filesystem

Interesting bug found and fixed along the way: passing `Accept: application/vnd.github+json` triggers a CORS preflight that GitHub doesn't answer — `Failed to fetch`. Removing the custom header lets GitHub serve the request as a simple CORS GET.

---

## 📖 5. Encoder tab — explainer banner + incremental warning

Several users confused **encoder offset calibration** (electrical phase-pole alignment, which ODrive needs to do FOC) with **wheel mechanical center** (where the driver perceives "straight"). Two different things:

- Encoder offset: aligns the motor's electrical field with the encoder signal. No relation to where the wheel is "physically straight."
- Mechanical center: the angular position where the wheel should rest when not turning.

A blue banner at the top of the tab explains both concepts and links them mentally with idleSpring (which pulls the wheel back to the saved mechanical center).

Bonus: detection of incremental-without-Z encoders shows a yellow warning:
> "You're using an incremental encoder without index Z. This means each time you power on, the absolute wheel position is unknown — ODrive will ask for a full turn to recalibrate the electrical offset, but the mechanical center will land anywhere."

Suggested mitigation: use persistent Zero Wheel (feature above) + always power on with the wheel roughly centered.

---

## 🌡️ 6. NTC Calculator — 3 math bugs fixed

A user reported that the rc10 calculator's generated coefficients didn't match the real motor temperature. Investigation surfaced **three bugs**:

### Bug A: inverted voltage divider

Old: `V_pin = Vref × R_pullup / (R_pullup + R_NTC)` — wrong, that would apply if the NTC was on the GND side, but ODrive's official wiring has NTC between the pin and GND, with the pull-up between Vref and the pin.

Fix: `V_pin = Vref × R_NTC / (R_pullup + R_NTC)` (NTC in the numerator).

### Bug B: wrong normalization

The STM32 ADC always references **VDDA = 3.3V**, regardless of the pull-up supply voltage. If the user picks Vref=5V, the pin can reach 5V (forbidden — would fry the STM32 input), but the ADC only sees up to 3.3V. ODrive reads `V_normalized = V_pin / 3.3` (always 3.3, not Vref).

Fix: always normalize by 3.3V regardless of the chosen Vref. Bonus: saturation filter on the fit — points where V_pin > 3.3V are excluded from the least squares (kept in the preview table so the user can see the saturation).

### Bug C: coefficient order

ODrive uses numpy.polyfit convention: `poly_coefficient_0` = HIGHEST order coefficient (x³), `poly_coefficient_3` = constant term. I was writing in the opposite order (the math-intuitive one: c0 = constant).

Fix: reverse the order before writing. `poly_coefficient_0 ← c3`, `poly_coefficient_3 ← c0`.

User feedback during diagnosis: *"you should have verified before going off and implementing"* — completely correct, should have looked at `thermistor.cpp` from ODrive before the first pass.

---

## 🔧 Other adjustments

- **GPIO disabled preserves ODrive's pin config**: previously, `mode=DISABLED` forced the pin to a generic digital input, overwriting ODrive's ANALOG_IN configs. Now it's a no-op (preserves whatever ODrive set up — needed for offboard thermistor to work even with the GPIO disabled in our table).
- **Cleaned up `odrive-wheel-visual.html`** — obsolete legacy file removed.
- **JSON sample config (Hoverboard)** — updated to the new spinout thresholds (50/-50 W).

---

## 🐛 Bug fixes

| # | Bug | Fix |
|---|---|---|
| 1 | Zero Wheel mode didn't persist (ASCII handler rejected `val>2`) | `cmd_table.cpp:238` — limit bumped to `GPIO_INPUT_ZEROWHEEL` |
| 2 | Zero Wheel mode didn't persist (load sanity rejected `m>AXIS`) | `gpio_inputs.cpp:137` — sanity bumped to `<= ZEROWHEEL` |
| 3 | NTC Calculator: wrong voltage divider | NTC moved to numerator |
| 4 | NTC Calculator: normalized by Vref instead of VDDA | Always /3.3V |
| 5 | NTC Calculator: reversed coefficient order | numpy.polyfit convention (c0 = highest order) |
| 6 | DFU GitHub fetch: blocked by CORS preflight | Removed `Accept: application/vnd.github+json` header |
| 7 | FFB Test chart didn't use zero-centered axis | Applied the same pattern as the other 4 charts |

---

## 📁 Files changed

**Firmware:**
- `inc/eeprom_addresses.h` — slots `ADR_AXIS1_ZEROOFS_LO/HI`
- `inc/gpio_inputs.h` — `GPIO_INPUT_ZEROWHEEL = 3` + doc comment
- `src/gpio_inputs.cpp` — ZEROWHEEL mode (apply_pin_mode, update_report edge detect, set_mode, read_raw) + load sanity fix
- `src/cmd_table.cpp` — ASCII handler accepts mode=3
- `src/ffb_task.cpp` — `zeroOffset_` moved to public + load/save across 2 EE slots

**Tool:**
- `tools/odrive-wheel.html` — Zero Wheel mode UI, Encoder banner, incremental-without-Z warning, 3 calculator NTC bug fixes, zero-centered charts (5 sites), DFU GitHub fetch button
- `tools/odrive-wheel-visual.html` — removed (obsolete)
- `tools/odrive_config_*-Hoverboard.json` — sample config refreshed

---

## 🚀 How to update

1. Flash `build/odrive-wheel.bin` from the rc11 release via DFU (USB with BOOT0 pressed, or via the new "Fetch latest from GitHub" button if you're already on rc10).
2. Open `tools/odrive-wheel.html` in the browser.
3. Connect via Web Serial.
4. (Optional) Configure GPIO 6 as Zero Wheel + wire a momentary button between the GPIO and GND.
5. (Optional) Manually center the wheel + press the GPIO button + click Save → mechanical center persisted to flash.

---

## ⚠️ Notes / compat

- **EE layout extended** (not bumped): two new slots were allocated (`0x020B`, `0x020C`) and `NB_OF_VAR` updated. Old EEs remain compatible (virgin slots = 0xFFFF, sanity preserves default 0.0f). No need to bump `EE_LAYOUT_VERSION` — additions only, no renumbering.
- **UI mode 4 (Zero Wheel)** is new. JSON configs saved in rc10 and imported in rc11 are fine because rc10 never emitted that value.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
