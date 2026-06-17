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
