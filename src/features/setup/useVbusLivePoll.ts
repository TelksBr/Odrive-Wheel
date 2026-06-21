import { useEffect, useState } from 'react';
import { serialService } from '../serial/SerialService';

const POLL_MS = 250;

function parseVbus(raw: string): number | null {
  const trimmed = raw.trim();
  const value = parseFloat(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function useVbusLivePoll(active: boolean) {
  const [vbusV, setVbusV] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!active) {
      setVbusV(null);
      setPolling(false);
      return undefined;
    }

    let cancelled = false;
    let timer = 0;
    setPolling(true);

    async function tick() {
      if (cancelled) {
        return;
      }
      try {
        const raw = await serialService.sendCommand('r vbus_voltage', true, 800, false);
        const value = parseVbus(raw);
        if (!cancelled && value !== null) {
          setVbusV(value);
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
      setPolling(false);
    };
  }, [active]);

  return { vbusV, polling };
}
