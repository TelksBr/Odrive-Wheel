import { useEffect, useRef, useState } from 'react';
import { toCenteredPercent, toLinearPercent } from './analogAxisMath';
import {
  CenteredAnalogDisplayFilter,
  LinearAnalogDisplayFilter,
  type CenteredAnalogDisplay,
  type LinearAnalogDisplay,
} from './analogDisplayFilter';

export function useLinearAnalogDisplay(
  value: number | null,
  min: number,
  max: number,
  smooth: boolean,
): LinearAnalogDisplay {
  const filterRef = useRef(new LinearAnalogDisplayFilter());
  const [display, setDisplay] = useState<LinearAnalogDisplay>({
    barPercent: null,
    labelPercent: null,
    smoothedRaw: null,
  });

  useEffect(() => {
    if (!smooth) {
      if (value === null || !Number.isFinite(value)) {
        setDisplay({ barPercent: null, labelPercent: null, smoothedRaw: null });
        return;
      }
      const percent = toLinearPercent(value, min, max);
      const label = percent === null ? null : Math.round(percent);
      setDisplay({ barPercent: percent, labelPercent: label, smoothedRaw: value });
      filterRef.current.reset();
      return;
    }

    setDisplay(filterRef.current.push(value, min, max));
  }, [value, min, max, smooth]);

  return display;
}

export function useCenteredAnalogDisplay(
  value: number | null,
  maxAbs: number,
  smooth: boolean,
): CenteredAnalogDisplay & { displayRaw: number | null } {
  const filterRef = useRef(new CenteredAnalogDisplayFilter());
  const [display, setDisplay] = useState<CenteredAnalogDisplay & { displayRaw: number | null }>({
    barPercent: null,
    smoothedRaw: null,
    displayRaw: null,
  });

  useEffect(() => {
    if (!smooth) {
      if (value === null || !Number.isFinite(value)) {
        setDisplay({ barPercent: null, smoothedRaw: null, displayRaw: null });
        return;
      }
      const percent = toCenteredPercent(value, maxAbs);
      setDisplay({ barPercent: percent, smoothedRaw: value, displayRaw: value });
      filterRef.current.reset();
      return;
    }

    const next = filterRef.current.push(value, maxAbs);
    setDisplay({ ...next, displayRaw: next.smoothedRaw });
  }, [value, maxAbs, smooth]);

  return display;
}
