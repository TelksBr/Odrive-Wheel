import { useEffect, useRef, useState } from 'react';
import { hidFfbService } from '../hid/HidFfbService';
import { hidReportToTelemetrySample } from './hidInputReport';
import type { TelemetrySample } from './types';

/**
 * Subscribes to 1 kHz HID input reports (rc12+) when a HID device is open.
 * Returns true while HID telemetry is actively feeding samples.
 */
export function useHidTelemetryListener(
  enabled: boolean,
  halfRangeDeg: number,
  onSample: (sample: TelemetrySample) => void,
): boolean {
  const onSampleRef = useRef(onSample);
  onSampleRef.current = onSample;
  const [hidConnected, setHidConnected] = useState(hidFfbService.connected);

  useEffect(() => hidFfbService.onConnectionChange((connected) => setHidConnected(connected)), []);

  useEffect(() => {
    if (!enabled || !hidFfbService.connected || halfRangeDeg <= 0) {
      return undefined;
    }
    return hidFfbService.onInputReport((event) => {
      const sample = hidReportToTelemetrySample(event, halfRangeDeg);
      if (sample) {
        onSampleRef.current(sample);
      }
    });
  }, [enabled, halfRangeDeg, hidConnected]);

  return enabled && hidFfbService.connected && halfRangeDeg > 0;
}
