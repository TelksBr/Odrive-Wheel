export const TELEMETRY_WINDOW_OPTIONS = [
  { labelKey: 'observeWindow10s', ms: 10_000 },
  { labelKey: 'observeWindow30s', ms: 30_000 },
  { labelKey: 'observeWindow1m', ms: 60_000 },
  { labelKey: 'observeWindow2m', ms: 120_000 },
  { labelKey: 'observeWindow5m', ms: 300_000 },
] as const;

export const TELEMETRY_INTERVAL_OPTIONS = [
  { labelKey: 'observeInterval100ms', ms: 100 },
  { labelKey: 'observeInterval200ms', ms: 200 },
  { labelKey: 'observeInterval500ms', ms: 500 },
  { labelKey: 'observeInterval1s', ms: 1000 },
] as const;

/** Longest chart window — ring buffer retains at least this much history. */
export const MAX_TELEMETRY_WINDOW_MS = TELEMETRY_WINDOW_OPTIONS[TELEMETRY_WINDOW_OPTIONS.length - 1].ms;

const MIN_TELEMETRY_INTERVAL_MS = TELEMETRY_INTERVAL_OPTIONS[0].ms;

/** Enough slots for 5 min at 100 ms poll (fastest serial interval). */
export const MAX_TELEMETRY_SAMPLES = Math.ceil(MAX_TELEMETRY_WINDOW_MS / MIN_TELEMETRY_INTERVAL_MS);

/** HID input reports arrive at ~1 kHz — downsample for charts to avoid OOM. */
export const HID_TELEMETRY_MIN_INTERVAL_MS = 50;

/** React state sync from the in-memory ring buffer. */
export const TELEMETRY_UI_SYNC_MS = 500;
