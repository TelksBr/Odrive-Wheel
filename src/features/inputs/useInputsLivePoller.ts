import { useEffect, useRef, useState } from 'react';
import { readField } from '../board/BoardProtocol';
import type { GpioChannel } from './gpioChannel';

/**
 * Polls live `cur` and `filt` for every channel as fast as the serial port allows
 * (~60 Hz target). Values are kept in local state to avoid flooding the global store.
 */
export function useInputsLivePoller(
  channels: GpioChannel[],
  connected: boolean,
  paused = false,
): { liveValues: Record<string, string>; polling: boolean } {
  const [liveValues, setLiveValues] = useState<Record<string, string>>({});
  const [polling, setPolling] = useState(false);
  const generationRef = useRef(0);
  const rafRef = useRef<number>(0);
  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  useEffect(() => {
    if (!connected || paused) {
      generationRef.current += 1;
      setPolling(false);
      cancelAnimationFrame(rafRef.current);
      return undefined;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setPolling(true);

    const runLoop = async () => {
      if (generation !== generationRef.current) {
        return;
      }

      const updates: Record<string, string> = {};
      const liveFields = channelsRef.current.flatMap((ch) =>
        [ch.fields.cur, ch.fields.filt].filter((field): field is NonNullable<typeof field> => Boolean(field)),
      );
      for (const field of liveFields) {
        if (generation !== generationRef.current) {
          break;
        }
        try {
          const value = await readField(field);
          updates[field.path] = value;
        } catch {
          // skip timeout/disconnect; loop stops when generation changes
        }
      }

      if (generation === generationRef.current && Object.keys(updates).length > 0) {
        setLiveValues((prev) => ({ ...prev, ...updates }));
      }

      if (generation === generationRef.current) {
        rafRef.current = requestAnimationFrame(() => void runLoop());
      }
    };

    rafRef.current = requestAnimationFrame(() => void runLoop());

    return () => {
      generationRef.current += 1;
      setPolling(false);
      cancelAnimationFrame(rafRef.current);
    };
  }, [connected, paused]);

  return { liveValues, polling };
}
