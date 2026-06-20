import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readField } from '../board/BoardProtocol';
import type { GpioChannel } from './gpioChannel';

/**
 * Polls only the `cur` field for every channel as fast as the serial port allows
 * (~60 Hz target). Values are kept in local state to avoid flooding the global store.
 */
export function useInputsLivePoller(
  channels: GpioChannel[],
  connected: boolean,
  paused = false,
): { curValues: Record<string, string>; polling: boolean } {
  const [curValues, setCurValues] = useState<Record<string, string>>({});
  const [polling, setPolling] = useState(false);
  const activeRef = useRef(false);
  const rafRef = useRef<number>(0);

  const curFields = useMemo(() => channels.map((ch) => ch.fields.cur), [channels]);

  const runLoop = useCallback(async () => {
    if (!activeRef.current) {
      return;
    }

    const updates: Record<string, string> = {};
    for (const field of curFields) {
      if (!activeRef.current) {
        break;
      }
      try {
        const value = await readField(field);
        updates[field.path] = value;
      } catch {
        // skip timeout/disconnect; loop stops when port closes
      }
    }

    if (activeRef.current && Object.keys(updates).length > 0) {
      setCurValues((prev) => ({ ...prev, ...updates }));
    }

    if (activeRef.current) {
      rafRef.current = requestAnimationFrame(() => void runLoop());
    }
  }, [curFields]);

  useEffect(() => {
    if (!connected || paused) {
      activeRef.current = false;
      setPolling(false);
      cancelAnimationFrame(rafRef.current);
      return;
    }

    activeRef.current = true;
    setPolling(true);
    rafRef.current = requestAnimationFrame(() => void runLoop());

    return () => {
      activeRef.current = false;
      setPolling(false);
      cancelAnimationFrame(rafRef.current);
    };
  }, [connected, paused, runLoop]);

  return { curValues, polling };
}
