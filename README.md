# WheelForge

**WheelForge** is a Progressive Web App for configuring and operating **Odrive-Wheel-compatible** FFB wheel bases over **Web Serial** and **WebHID**. A modern, structured alternative to the legacy single-file HTML configurator — setup wizard, motor/FFB tuning, GPIO inputs, live telemetry, profiles, DFU flash, and an FFB test lab.

<p align="center">
  <img src="docs/screenshots/01-Header.png" alt="Dashboard overview" width="720">
</p>

> **Not the firmware.** WheelForge is this web app only. Board firmware remains at [eagabriel/Odrive-Wheel](https://github.com/eagabriel/Odrive-Wheel).

## Requirements

| API | Used for | Browser |
|-----|----------|---------|
| **Web Serial** | Config, calibration, telemetry, console | Chrome, Edge, Opera (Chromium) |
| **WebHID** | FFB effect test lab, 1 kHz HID telemetry (rc12+) | Same |
| **WebUSB DFU** | Firmware flash from Maintenance tab | Same |

Firefox and Safari are **not** supported (no Web Serial).

## Quick start

```bash
bun install
bun run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`), connect the board via **Connect**, and follow **Setup** or use the workspace tabs.

### Production build

```bash
bun run build    # output in dist/
bun run preview  # local preview of dist/
```

## Project layout

```
├── src/
│   ├── app/              App shell, brand, routing, global state
│   ├── features/         Workspaces (dashboard, tune, observe, hid, dfu, …)
│   ├── domain/           Command registry, shared domain types
│   ├── i18n/             PT / EN strings
│   └── shared/           UI primitives
├── public/               Static assets, 3D wheel model
├── docs/
│   ├── firmware-api.md   Serial/HID protocol reference (for contributors)
│   └── screenshots/
├── index.html
├── vite.config.ts
└── package.json
```

## Features

- **Dashboard** — connection status, live metrics, 3D wheel viewer
- **Setup / Calibration** — guided bring-up, motor & encoder cal, AS5047 tools
- **Motor & ODrive** — full ODrive property editor
- **Tune FFB** — wheel feel, effects, filters, torque advisor
- **Inputs** — GPIO channels with live ADC bars, analog processor (rc12)
- **Observe** — time-series charts, live monitor, CSV export; HID 1 kHz when connected
- **FFB Lab** — WebHID PID effect testing
- **Maintain** — save (ODrive NVM + FFB EEPROM), profiles, DFU, reboot
- **Command center** — searchable firmware commands
- **Console** — raw serial access

## Compatible hardware

WheelForge talks to boards running **[Odrive-Wheel](https://github.com/eagabriel/Odrive-Wheel)** firmware (v1.0.0-rc12+ recommended): MKS XDrive Mini, ODESC V4.2, and similar ODrive v3.6 clones with FFB HID.

Protocol reference for contributors: [`docs/firmware-api.md`](docs/firmware-api.md).

## Deploy (GitHub Pages)

Push to `main` triggers `.github/workflows/pages.yml` (Bun install → Vite build → Pages).

## Development

| Script | Description |
|--------|-------------|
| `bun run dev` | Vite dev server + PWA dev SW |
| `bun run build` | Typecheck + production bundle |
| `bun run typecheck` | `tsc --noEmit` only |
| `bun run preview` | Serve `dist/` locally |

Field definitions: `src/features/config/fieldCatalog.ts`.

## License

See [LICENSE](LICENSE).
