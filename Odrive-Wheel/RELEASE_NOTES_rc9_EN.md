# v1.0.0-rc9 — Current control deadband, Quick Start UX, JSON import robustness

> Iteration focused on eliminating idle vibration in the motor current control and hardening the tool's import/export flow.

## ✨ Highlights

- [x] 🔇 **`current_control_deadband`** in FOC — dead-band on the PI error eliminates idle vibration (PI was chasing ADC/encoder noise), default 100 mA
- [x] 🚀 **Quick Start UX**: step 8 with correct "~1 turn" description (was "~10 turns") + step 9 now automatically disables velocity limits to prevent ERROR_OVERSPEED on the first setup
- [x] 🛡️ **Robust JSON import**: fix for queue dessync when JSON contains readonly paths, explicit readonly path skip list, fix for the "second import does nothing" bug
- [x] ⏳ **Progress toast** with progress bar during apply of imports with many fields

---

## 🔇 1. Current control deadband — no more idle vibration

### Problem

Even with `Iq_setpoint = 0` (no torque commanded), the motor kept emitting a faint hum and noticeable tactile vibration on the wheel. Analysis showed the current PI was chasing:

- **ADC quantization** on current measurement (~10 mA LSB)
- **Encoder quantization** causing Id↔Iq cross-coupling through imperfect Park transform rotation
- **Switching noise** from the MOSFETs sampled by the ADC

Every PWM cycle (~125 µs), the PI generated micro voltage pulses to "correct" this noise, producing residual AC current in the phases that turns into audible and tactile torque ripple.

### Solution

A dead-band on the PI error (not on the measurement, not on the setpoint — on the **error**):

```c
// foc.cpp, inside the 8 kHz PI loop
float Ierr_d = Id_setpoint - Id_measured;
float Ierr_q = Iq_setpoint - Iq_measured;
if (current_control_deadband_ > 0.0f) {
    if (std::abs(Ierr_d) < current_control_deadband_) Ierr_d = 0.0f;
    if (std::abs(Ierr_q) < current_control_deadband_) Ierr_q = 0.0f;
}
// PI continues using Ierr_d/Ierr_q (zeroed if inside the band)
// integrator also freezes because integral += Ierr × Ki × dt = 0
```

Behaviour:
- **Inside the band** (idle, pure noise) → P = 0, integrator freezes → PI sleeps → motor stops vibrating
- **Outside the band** (real FFB command) → bit-identical to stock — zero impact on dynamic response
- When `|Ierr|` grows above the limit (FFB kicks in), response is instantaneous — no "snap" effect

### API

```
axis0.motor.config.current_control_deadband [A]
```

| Value | Behaviour |
|---|---|
| `0` | Disabled (stock ODrive) |
| `0.02` (20 mA) | Conservative — ~1 mNm static uncertainty |
| **`0.1` (100 mA, rc9 default)** | Tuned for the typical MKS XDrive Mini noise floor |
| `0.2` (200 mA) | Aggressive — small FFB commands start being ignored |

Static torque uncertainty introduced ≈ `deadband × torque_constant`. For `torque_constant = 0.05 Nm/A` and deadband 100 mA → ±5 mNm of uncertainty. Imperceptible on a wheel that operates with 3-5 Nm peaks.

### Configuration

New field in the **Motor tab** of the tool, with PT/EN tooltips explaining the trade-off:

```
axis0.motor.config.current_control_deadband
[0–0.5 A (0.02–0.20 typical)]      Float
```

Persistent in NVM (forward-compatible — old flashes read 0, behaviour identical to stock until the user enables it).

### Files modified

- `ODrive-fw-v0.5.6/.../MotorControl/foc.hpp` — new `current_control_deadband_` field on `FieldOrientedController`
- `ODrive-fw-v0.5.6/.../MotorControl/motor.hpp` — new field + custom setter that propagates to the FOC
- `ODrive-fw-v0.5.6/.../MotorControl/motor.cpp::update_current_controller_gains()` — propagates value
- `ODrive-fw-v0.5.6/.../MotorControl/foc.cpp` — applies the dead-band at lines 135-142
- `ODrive-fw-v0.5.6/.../odrive-interface.yaml` — exposes the ASCII property (regenerates autogen at build time)

---

## 🚀 2. Quick Start UX

### Step 8 — encoder cal description

**Before:** "Motor spins ~10 turns" — confused users because in practice it spins about 1 turn depending on the lockin config.

**After:** "Motor spins ~1 turn (gently)" both in PT and EN.

### Step 9 — automatic disabling of velocity limits

When users finished the setup and spun the wheel manually to test (without the game connected), they frequently hit `ERROR_OVERSPEED` on `axis0.controller.config.vel_limit` (default 5 turn/s = 300 RPM) and the motor would disarm. Confusing for new users who don't yet know the system.

Step 9 now also writes:
```
axis0.controller.config.enable_vel_limit             = False
axis0.controller.config.enable_overspeed_error       = False
axis0.controller.config.enable_torque_mode_vel_limit = False
```

The updated description (PT/EN) explains that these flags are disabled for the first setup and that the user should re-enable them manually in the **Controller** tab once the rig is stable and the maximum velocity is known.

---

## 🛡️ 3. Robust JSON import

### Bug 1 — Queue dessync with readonly paths

**Symptom:** when importing a JSON that contained `axis0.controller.config.anticogging.index` (readonly in firmware), the next field in sequence (e.g. `axis.range`) showed the literal value "not implemented" in green, as if it had been accepted.

**Root cause:** ODrive ASCII responds with "not implemented" for writes on readonly properties. The `writeProp` function sent the write and **returned immediately without waiting for any response**. The late response would arrive while the next field's `readProp` had already pushed a pending in the queue — `pendingReplies.shift()` would resolve the wrong pending with "not implemented".

**Fix:** `writeProp` now pushes a temporary pending with an **80 ms** window. If a response arrives in that interval, it's the ODrive error — logged and discarded. If no response comes, assume success and continue.

```js
async function writeProp(path, value) {
    // ... sends the write
    return new Promise((resolve) => {
        const entry = { resolve: null, timeout: null };
        entry.timeout = setTimeout(() => {
            // no response = success, remove pending from queue
            const idx = pendingReplies.indexOf(entry);
            if (idx >= 0) pendingReplies.splice(idx, 1);
            resolve(null);
        }, 80);
        entry.resolve = (line) => {
            clearTimeout(entry.timeout);
            logLine('write rejected: ' + cmd + ' → ' + line, 'err');
            resolve(line);
        };
        pendingReplies.push(entry);
    });
}
```

### Bug 2 — Readonly paths polluting exports

Exported JSONs were including `anticogging.index` (runtime counter) and `anticogging.calib_anticogging` (trigger, not persistent state). Re-importing generated useless writes and noisy logs.

**Fix:** explicit `READONLY_EXPORT_PATHS` list filtered on both export and import. Conservative — only paths confirmed as readonly in the ODrive YAML **and** present in our schema.

```js
const READONLY_EXPORT_PATHS = new Set([
    'axis0.controller.config.anticogging.index',
    'axis0.controller.config.anticogging.calib_anticogging',
]);
```

### Bug 3 — Second import silently "hangs"

**Symptom:** the first import works perfectly. Trying to import again (same file or different) opens the file picker but nothing happens — no log, no toast, nothing applied.

**Root cause:** the `<input type="file">` `change` event only fires when the **value** changes. Selecting the same file again doesn't change the value → change doesn't fire. Classic HTML quirk.

**Fix:** clear `value = ''` in two places:
1. Before `inp.click()` in `importJSON()` — ensures next selection starts from an empty state
2. Right after consuming the file in the `onchange` handler — ensures the next attempt starts from an empty state

Covers all scenarios (same file twice, different file, cancel picker and retry, future drag-and-drop).

---

## ⏳ 4. Progress toast for long operations

Imports with 100+ fields could take several seconds. Without feedback, users thought it had hung.

New persistent toast system with progress bar:

```
┌─────────────────────────────────────────┐
│ ⏳ Applying configuration (47/120)      │
│    axis0.controller.config.pos_gain     │  ← current path in monospace
│    ███████████████░░░░░░░░░░░░░░░░  39% │  ← blue bar animates smoothly
└─────────────────────────────────────────┘
```

Generic reusable API:

```js
toastSticky(id, msg, sub, pct, kind)   // creates/updates, identified by id
toastStickyClose(id)                    // removes with fade-out
```

Subsequent calls with the same `id` update in-place (no flicker). Bar colour follows `kind` (`ok`/`err`/`warn`). Ready to be used for other long ops in the future (save sequence, batch read, etc).

---

## 📦 Upgrade

- [x] **NVM forward-compatible** — `current_control_deadband` default 0.1 already ships active in the new firmware. No `erase config` needed. Existing fields preserved
- [x] After flashing, **hard-refresh** the HTML tool (Ctrl+Shift+R) to load the new field in the Motor tab schema
- [x] If your board had `enable_vel_limit=true` (old default) and you want the new behaviour, run **Step 9** of the Quick Start again or adjust manually in the Controller tab
- [x] JSONs exported before rc9 might have `anticogging.index` — they are now silently ignored on import

## 🔗 Compare

[`v1.0.0-rc8...v1.0.0-rc9`](../../compare/v1.0.0-rc8...v1.0.0-rc9)

---

🤖 Co-authored with Claude Code
