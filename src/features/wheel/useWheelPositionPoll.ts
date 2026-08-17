import { useEffect, useRef } from 'react';
import { parsePosition } from '../dashboard/dashboardPollCore';
import { serialService } from '../serial/SerialService';
import { publishWheelPosition, sharedWheelPosition } from './sharedWheelPosition';

const POLL_MS = 50;

/**
 * Live wheel angle for UI chrome. When `serialPoll` is false, follows a position
 * already published by dashboard/observe instead of issuing axis.curpos?.
 */
export function useWheelPositionPoll(connected: boolean, active: boolean, serialPoll = true) {
  const positionDegRef = useRef<number | null>(null);

  useEffect(() => {
    if (!connected || !active) {
      positionDegRef.current = null;
      return undefined;
    }

    if (!serialPoll) {
      let raf = 0;
      const follow = () => {
        positionDegRef.current = sharedWheelPosition.deg;
        raf = requestAnimationFrame(follow);
      };
      raf = requestAnimationFrame(follow);
      return () => cancelAnimationFrame(raf);
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
        if (value !== null && !cancelled) {
          positionDegRef.current = value;
          publishWheelPosition(value);
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
  }, [connected, active, serialPoll]);

  return positionDegRef;
}
