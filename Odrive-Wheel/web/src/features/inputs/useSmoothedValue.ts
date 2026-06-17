import { useEffect, useRef, useState } from 'react';

/** Exponential smoothing for analog bar display (avoids visual spikes). */
export function useSmoothedValue(value: number | null, alpha = 0.22): number | null {
  const ref = useRef<number | null>(null);
  const [smoothed, setSmoothed] = useState<number | null>(null);

  useEffect(() => {
    if (value === null || !Number.isFinite(value)) {
      ref.current = null;
      setSmoothed(null);
      return;
    }
    const prev = ref.current ?? value;
    const next = prev + (value - prev) * alpha;
    ref.current = next;
    setSmoothed(next);
  }, [alpha, value]);

  return smoothed;
}
