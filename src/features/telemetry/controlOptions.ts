export const TELEMETRY_WINDOW_OPTIONS = [
  { labelKey: 'observeWindow10s', ms: 10_000 },
  { labelKey: 'observeWindow30s', ms: 30_000 },
  { labelKey: 'observeWindow1m', ms: 60_000 },
  { labelKey: 'observeWindow2m', ms: 120_000 },
  { labelKey: 'observeWindow5m', ms: 300_000 },
] as const;

/** Chart / overlay refresh rate (display pipeline). */
export const CHART_HZ_OPTIONS = [10, 20, 30, 60] as const;
export type ChartHz = (typeof CHART_HZ_OPTIONS)[number];

/** Serial chart acquisition when HID telemetry is off. */
export const SERIAL_CHART_HZ_OPTIONS = [5, 10, 20] as const;
export type SerialChartHz = (typeof SERIAL_CHART_HZ_OPTIONS)[number];

/** Legacy ms chips — FFB test page and similar. */
export const TELEMETRY_INTERVAL_OPTIONS = [
  { labelKey: 'observeInterval100ms', ms: 100 },
  { labelKey: 'observeInterval200ms', ms: 200 },
  { labelKey: 'observeInterval500ms', ms: 500 },
  { labelKey: 'observeInterval1s', ms: 1000 },
] as const;

export const FASTEST_CHART_HZ = 60;

/** Full live-monitor + errors cycle (decoupled from chart poll). */
export const MONITOR_POLL_INTERVAL_MS = 3_000;

/** Longest chart window — ring buffer retains at least this much history. */
export const MAX_TELEMETRY_WINDOW_MS = TELEMETRY_WINDOW_OPTIONS[TELEMETRY_WINDOW_OPTIONS.length - 1].ms;

/** Enough slots for 5 min at 60 Hz chart rate. */
export const MAX_TELEMETRY_SAMPLES = Math.ceil(MAX_TELEMETRY_WINDOW_MS / (1000 / FASTEST_CHART_HZ));

export function chartHzToSyncMs(hz: ChartHz): number {
  return Math.round(1000 / hz);
}

export function serialHzToIntervalMs(hz: SerialChartHz): number {
  return Math.round(1000 / hz);
}

/** Min spacing between HID samples stored in the chart buffer. */
export function hidSampleIntervalMs(chartHz: ChartHz): number {
  return 1000 / Math.min(chartHz, FASTEST_CHART_HZ);
}
