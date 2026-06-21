export interface TelemetrySample {
  t: number;
  vbus?: number;
  ibus?: number;
  iq?: number;
  ibrake?: number;
  torqueNm?: number;
  positionDeg?: number;
  velocityDegS?: number;
}

export interface TelemetrySeries {
  key: keyof TelemetrySample;
  label: string;
  unit: string;
  color: string;
  axis: 'left' | 'right';
  visible: boolean;
}

export interface BrakePowerState {
  resistance: number | null;
  watts: number | null;
  sampleCount: number;
}

export interface SeriesStats {
  current: number | null;
  min: number | null;
  max: number | null;
  avg: number | null;
  peak: number | null;
}

export type TelemetryStats = Partial<Record<keyof TelemetrySample, SeriesStats>>;

/** Compute per-series statistics from a sample window. */
export function computeStats(samples: TelemetrySample[], keys: (keyof TelemetrySample)[]): TelemetryStats {
  const result: TelemetryStats = {};
  for (const key of keys) {
    if (key === 't') {
      continue;
    }
    const values = samples
      .map((s) => s[key])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    if (values.length === 0) {
      result[key] = { current: null, min: null, max: null, avg: null, peak: null };
      continue;
    }

    const current = values.at(-1) ?? null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const peak = Math.max(...values.map(Math.abs));
    result[key] = { current, min, max, avg, peak };
  }
  return result;
}
