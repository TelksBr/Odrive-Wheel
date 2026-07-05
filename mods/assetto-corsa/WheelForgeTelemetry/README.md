# WheelForge Telemetry — CSP Lua App

Lua app for **Assetto Corsa + Custom Shaders Patch** (not a generic “Documents” mod).

## Requirements

- Assetto Corsa (original AC, not ACC)
- [Custom Shaders Patch](https://github.com/ac-custom-shaders-patch/acc-extension-config) ≥ 0.1.76
- [Content Manager](https://acstuff.club/app/) recommended
- WheelForge Telemetry Hub on the same PC (`ws://127.0.0.1:8765/live`)

## Install

1. Find your **AC installation folder** (Steam → AC → Manage → Browse local files).  
   Example: `C:\Program Files (x86)\Steam\steamapps\common\assettocorsa\`

2. Copy this entire folder to:
   ```
   <AC install>\apps\lua\WheelForgeTelemetry\
   ```

3. Required files:
   - `manifest.ini`
   - `WheelForgeTelemetry.lua` ← **same name as folder** (case sensitive)
   - `telemetry.lua`, `config.lua`, `history.lua`, `charts.lua`, `ui_util.lua`

4. In **Content Manager** → **Content** → **Miscellaneous** → **Lua apps** → enable **WheelForge Telemetry**.

5. In CSP settings, use the **new Lua apps taskbar** in-game (Settings → CSP → GUI).

## Run

```powershell
.\scripts\Start-TelemetryHub.ps1 -GameMode -SerialPort COM6
```

Enter a session — the overlay is drawn via `[UI_CALLBACKS] IN_GAME` (on track).

## Features (v2)

- Live KPIs: Vbus, Ibus, Iq, Torque (toggle each in Settings)
- **Min / max / avg** over configurable window (10–300 s)
- **Sparkline charts** for Vbus, Ibus, Torque
- Configurable overlay size, hub port, metric visibility
- Settings persist via CSP `ac.storage`

## Settings

Open the app window → gear icon → **Settings**:

| Option | Default |
|--------|---------|
| Hub port | 8765 |
| Stats window | 60 s |
| Sparkline charts | on |
| Min/max/avg table | on |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| App not listed | Path must be `<AC>/apps/lua/WheelForgeTelemetry/` |
| OFFLINE in game | Hub not running; close WheelForge serial tab if COM6 denied |
| No overlay | Enable Lua apps in CSP; drive on track |
| Only “30 Hz”, no Vbus | Old mod bug: wrong `ui.checkbox`/`ui.slider` API — copy **all** v2.0.1 files |
| Settings do nothing | Same fix; settings now use `ui_util.lua` + storage prefix `v2` |
