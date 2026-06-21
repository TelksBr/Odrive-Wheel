import { useEffect, useRef } from 'react';
import { parsePosition } from '../dashboard/dashboardPollCore';
import { serialService } from '../serial/SerialService';

const POLL_MS = 50;

/** Live wheel angle (degrees) for UI chrome — shared ref, updated by the app-level poller. */
export function useWheelPositionPoll(connected: boolean, active: boolean) {
  const positionDegRef = useRef<number | null>(null);

  useEffect(() => {
    if (!connected || !active) {
      positionDegRef.current = null;
      return undefined;
    }

    let cancelled = false;
    let timer = 0;

    async function tick() {
      if (cancelled) {
        return;
      }
      try {
        const raw = await serialService.sendCommand('axis.curpos?', true, 500, false);
        const value = parsePosition(raw);
        if (value !== null) {
          positionDegRef.current = value;
        }
      } catch {
        // keep previous sample
      }
      if (!cancelled) {
        timer = window.setTimeout(tick, POLL_MS);
      }
    }

    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [connected, active]);

  return positionDegRef;
}
