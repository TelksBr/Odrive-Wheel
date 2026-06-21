import type { TelemetrySample } from './types';

/** In-place ring buffer — avoids spread/filter allocations on every poll. */
export function pushTelemetrySample(
  buffer: TelemetrySample[],
  sample: TelemetrySample,
  maxAgeMs: number,
  maxLen: number,
): void {
  const cutoff = sample.t - maxAgeMs;
  while (buffer.length > 0 && buffer[0].t < cutoff) {
    buffer.shift();
  }
  buffer.push(sample);
  while (buffer.length > maxLen) {
    buffer.shift();
  }
}

export function snapshotTelemetry(buffer: TelemetrySample[]): TelemetrySample[] {
  return buffer.slice();
}
