# WheelForge Telemetry Hub

Standalone **Go** binary (`dist/wheelforge-hub.exe`) that reads OpenFFBoard telemetry over CDC serial, serves a LAN overlay (HTML embedded in the exe), and streams JSON over **WebSocket** (AC CSP mod) and **UDP**.

## Architecture

```
OpenFFBoard CDC (COM6) → wheelforge-hub (Go) → WebSocket / UDP / REST
                              ├─ http://PC:8765/overlay/     (LAN overlay + charts)
                              ├─ ws://127.0.0.1:8765/live   (AC mod)
                              ├─ GET /api/stats             (min/max/avg)
                              └─ UDP 127.0.0.1:45890        (optional)
```

Sources of truth:

| Asset | Path |
|-------|------|
| Overlay UI | `tools/overlay-lan/` → embedded at build |
| Go hub | `tools/wheelforge-hub/` |
| AC mod | `mods/assetto-corsa/WheelForgeTelemetry/` |

## Quick start (Windows)

1. Install [Go](https://go.dev/dl/) (build once) or use `dist/wheelforge-hub.exe`.
2. Build: `powershell -ExecutionPolicy Bypass -File scripts/Build-TelemetryHub.ps1`
3. Run: `powershell -ExecutionPolicy Bypass -File scripts/Start-TelemetryHub.ps1 -GameMode`
4. Open `http://localhost:8765/overlay/`
5. Copy AC mod to `<AC>/apps/lua/WheelForgeTelemetry/`

## API

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Hub status, last Vbus/Ibus |
| `GET /api/snapshot?windowMs=60000` | Sample ring buffer |
| `GET /api/stats?windowMs=60000` | Per-field min, max, avg, last |
| `WS /live` | Live JSON packets + initial snapshot |

Packet format (`v: 1`):

```json
{ "v": 1, "t": 1710000000000, "vbus": 35.3, "ibus": 0.12, "iq": 0.5, "torqueNm": 1.2, "source": "serial", "hz": 2.0 }
```

## CLI flags

- `--port 8765`
- `--udp-port 45890`
- `--chart-hz 30`
- `--serial COM6`
- `--serial-only` / `--game-mode`

## Game mode (Assetto Corsa)

```powershell
.\scripts\Start-TelemetryHub.ps1 -GameMode -SerialPort COM6
```

- **AC** → HID FFB
- **Hub** → CDC serial COM6 (parallel, not fallback)
- Close WheelForge browser serial tab if COM6 access denied

## Overlay & AC mod features

Both show:

- Live values (Vbus, Ibus, Iq, Torque, Position, Velocity)
- **Min / max / average** over configurable window (30s–5m web, 10–300s AC)
- **Charts** — canvas (web) / sparklines (AC settings)

AC mod settings (gear icon): hub port, window, metrics toggles, overlay size.

## Build pipeline

```powershell
npm run hub:build-overlay   # overlay-lan → Go embed tree
npm run hub:build           # compile dist/wheelforge-hub.exe
npm run hub                 # start hub (GameMode)
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| COM6 access denied | Disconnect serial in WheelForge browser |
| AC mod OFFLINE | Hub running? Mod v2 uses WebSocket not UDP |
| Overlay empty | Hub serial-only with correct COM |
| LAN blocked | `Start-TelemetryHub.ps1 -AllowFirewall` |
