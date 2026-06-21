import { useEffect, useRef, useState } from 'react';

/** Returns a throttled copy of a fast-changing value to cut React re-renders. */
export function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [throttled, setThrottled] = useState(value);
  const latestRef = useRef(value);
  latestRef.current = value;

  useEffect(() => {
    setThrottled(latestRef.current);
    const id = window.setInterval(() => {
      setThrottled(latestRef.current);
    }, Math.max(intervalMs, 50));
    return () => window.clearInterval(id);
  }, [intervalMs]);

  useEffect(() => {
    latestRef.current = value;
  }, [value]);

  return throttled;
}
