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

export function snapshotTelemetry(buffer: TelemetrySample[], windowMs?: number): TelemetrySample[] {
  if (windowMs === undefined || buffer.length === 0) {
    return buffer.slice();
  }
  const cutoff = (buffer.at(-1)?.t ?? 0) - windowMs;
  let start = 0;
  while (start < buffer.length && buffer[start].t < cutoff) {
    start += 1;
  }
  return start === 0 ? buffer.slice() : buffer.slice(start);
}
