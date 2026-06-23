import type { MutableRefObject } from 'react';
import { MAX_TELEMETRY_WINDOW_MS } from './controlOptions';
import type { BrakePowerState, TelemetrySample } from './types';

export function updateBrakePowerRef(
  sample: TelemetrySample,
  brakeSamples: Array<{ t: number; i2: number }>,
  resistance: number | null,
  brakePowerRef: MutableRefObject<BrakePowerState>,
  dirtyRef: MutableRefObject<boolean>,
): void {
  if (!resistance || typeof sample.ibrake !== 'number' || !Number.isFinite(sample.ibrake)) {
    return;
  }
  const maxPhysicalCurrent = Math.max(15, ((sample.vbus ?? 30) / resistance) * 1.5);
  if (Math.abs(sample.ibrake) > maxPhysicalCurrent) {
    return;
  }

  brakeSamples.push({ t: sample.t, i2: sample.ibrake * sample.ibrake });
  const cutoff = sample.t - MAX_TELEMETRY_WINDOW_MS;
  while (brakeSamples.length > 0 && brakeSamples[0].t < cutoff) {
    brakeSamples.shift();
  }
  const meanI2 = brakeSamples.reduce((sum, item) => sum + item.i2, 0) / brakeSamples.length;
  brakePowerRef.current = {
    resistance,
    watts: resistance * meanI2,
    sampleCount: brakeSamples.length,
  };
  dirtyRef.current = true;
}
