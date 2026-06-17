import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { readField } from '../board/BoardProtocol';
import { flatFields } from '../config/fieldCatalog';
import { serialService } from '../serial/SerialService';
import { computeStats } from './types';
import { allSeriesKeys } from './series';
import type { BrakePowerState, TelemetrySample, TelemetryStats } from './types';

const MAX_WINDOW_MS = 5 * 60_000;

const fieldByPath = new Map(flatFields.map((field) => [field.path, field]));

function odriveField(path: string) {
  const field = fieldByPath.get(path);
  if (!field) {
    throw new Error(`Telemetry field not found: ${path}`);
  }
  return field;
}

export interface TelemetryHandle {
  /** All samples in the rolling buffer (up to MAX_WINDOW_MS). */
  samples: TelemetrySample[];
  /** Samples trimmed to the current display window — frozen when paused. */
  displaySamples: TelemetrySample[];
  brakePower: BrakePowerState;
  stats: TelemetryStats;
  lastError: string | null;
  /** Effective samples-per-second over the last 5 s. */
  hz: number;
  paused: boolean;
  setPaused: (paused: boolean) => void;
  pollOnce: () => Promise<void>;
  clear: () => void;
  exportCsv: () => void;
}

export function useTelemetry({
  connected,
  enabled,
  intervalMs,
  windowMs = 60_000,
}: {
  connected: boolean;
  enabled: boolean;
  intervalMs: number;
  windowMs?: number;
}): TelemetryHandle {
  const [samples, setSamples] = useState<TelemetrySample[]>([]);
  const [brakePower, setBrakePower] = useState<BrakePowerState>({ resistance: null, watts: null, sampleCount: 0 });
  const [lastError, setLastError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [frozenSamples, setFrozenSamples] = useState<TelemetrySample[]>([]);

  const inFlight = useRef(false);
  const brakeSamplesRef = useRef<Array<{ t: number; i2: number }>>([]);
  const resistanceRef = useRef<number | null>(null);
  const pausedRef = useRef(false);

  // Keep pausedRef in sync so the interval closure can read it
  useEffect(() => {
    pausedRef.current = paused;
    if (paused) {
      // Snapshot current samples as frozen display
      setFrozenSamples(samples.filter((s) => s.t >= (samples.at(-1)?.t ?? 0) - windowMs));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  const readBrakeResistance = useCallback(async () => {
    const raw = await readField(odriveField('config.brake_resistance'));
    const resistance = Number(raw);
    if (Number.isFinite(resistance) && resistance > 0.05 && resistance < 500) {
      resistanceRef.current = resistance;
      setBrakePower((prev) => ({ ...prev, resistance }));
    }
  }, []);

  const pollOnce = useCallback(async () => {
    if (!connected || inFlight.current) {
      return;
    }
    inFlight.current = true;
    try {
      if (resistanceRef.current === null) {
        await readBrakeResistance().catch(() => undefined);
      }

      const [vbus, ibus, iq, ibrake, torqueRaw, posRaw, velRaw] = await Promise.all([
        readField(odriveField('vbus_voltage')).catch(() => undefined),
        readField(odriveField('ibus')).catch(() => undefined),
        readField(odriveField('axis0.motor.current_control.Iq_measured')).catch(() => undefined),
        readField(odriveField('brake_resistor_current')).catch(() => undefined),
        serialService.sendCommand('T', true, 2000).catch(() => undefined),
        readField(odriveField('axis.curpos')).catch(() => undefined),
        readField(odriveField('axis.curspd')).catch(() => undefined),
      ]);

      const now = performance.now();
      const sample: TelemetrySample = {
        t: now,
        vbus: parseNumber(vbus),
        ibus: parseNumber(ibus),
        iq: parseNumber(iq),
        ibrake: parseNumber(ibrake),
        torqueNm: parseTorque(torqueRaw),
        positionDeg: parseNumber(posRaw),
        velocityDegS: parseNumber(velRaw),
      };

      setSamples((prev) => [
        ...prev.filter((s) => s.t >= now - MAX_WINDOW_MS),
        sample,
      ]);
      updateBrakePower(sample, brakeSamplesRef.current, resistanceRef.current, setBrakePower);
      setLastError(null);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.current = false;
    }
  }, [connected, readBrakeResistance]);

  useEffect(() => {
    if (!connected || !enabled) {
      return undefined;
    }
    void pollOnce();
    const id = window.setInterval(() => void pollOnce(), Math.max(intervalMs, 100));
    return () => window.clearInterval(id);
  }, [connected, enabled, intervalMs, pollOnce]);

  // Trim samples to current windowMs for display when not paused
  const displaySamples = useMemo(() => {
    if (paused) {
      return frozenSamples;
    }
    const cutoff = (samples.at(-1)?.t ?? 0) - windowMs;
    return samples.filter((s) => s.t >= cutoff);
  }, [paused, frozenSamples, samples, windowMs]);

  // Samples-per-second over the last 5 s
  const hz = useMemo(() => {
    const last5s = samples.filter((s) => s.t >= (samples.at(-1)?.t ?? 0) - 5000);
    return last5s.length > 1 ? (last5s.length - 1) / 5 : 0;
  }, [samples]);

  // Aggregate stats over the display window
  const stats = useMemo(() => computeStats(displaySamples, allSeriesKeys), [displaySamples]);

  const clear = useCallback(() => {
    brakeSamplesRef.current = [];
    resistanceRef.current = null;
    setSamples([]);
    setFrozenSamples([]);
    setBrakePower({ resistance: null, watts: null, sampleCount: 0 });
    setLastError(null);
  }, []);

  const exportCsv = useCallback(() => {
    if (samples.length === 0) {
      return;
    }
    const headers = ['timestamp_ms', 'vbus_V', 'ibus_A', 'iq_A', 'ibrake_A', 'torque_Nm', 'position_deg', 'velocity_degS'];
    const rows = samples.map((s) => [
      s.t.toFixed(0),
      s.vbus?.toFixed(3) ?? '',
      s.ibus?.toFixed(3) ?? '',
      s.iq?.toFixed(3) ?? '',
      s.ibrake?.toFixed(3) ?? '',
      s.torqueNm?.toFixed(4) ?? '',
      s.positionDeg?.toFixed(2) ?? '',
      s.velocityDegS?.toFixed(2) ?? '',
    ]);
    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `telemetry_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [samples]);

  return useMemo(
    () => ({
      samples,
      displaySamples,
      brakePower,
      stats,
      lastError,
      hz,
      paused,
      setPaused,
      pollOnce,
      clear,
      exportCsv,
    }),
    [brakePower, clear, displaySamples, exportCsv, hz, lastError, paused, pollOnce, samples, stats],
  );
}

function parseNumber(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(String(raw).trim().split(/\s+/)[0]);
  return Number.isFinite(value) ? value : undefined;
}

function parseTorque(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }
  const match = raw.match(/nm=(-?\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : undefined;
}

function updateBrakePower(
  sample: TelemetrySample,
  brakeSamples: Array<{ t: number; i2: number }>,
  resistance: number | null,
  setBrakePower: Dispatch<SetStateAction<BrakePowerState>>,
) {
  if (!resistance || typeof sample.ibrake !== 'number' || !Number.isFinite(sample.ibrake)) {
    return;
  }
  const maxPhysicalCurrent = Math.max(15, ((sample.vbus ?? 30) / resistance) * 1.5);
  if (Math.abs(sample.ibrake) > maxPhysicalCurrent) {
    return;
  }

  brakeSamples.push({ t: sample.t, i2: sample.ibrake * sample.ibrake });
  const cutoff = sample.t - MAX_WINDOW_MS;
  while (brakeSamples.length > 0 && brakeSamples[0].t < cutoff) {
    brakeSamples.shift();
  }
  const meanI2 = brakeSamples.reduce((sum, item) => sum + item.i2, 0) / brakeSamples.length;
  setBrakePower({
    resistance,
    watts: resistance * meanI2,
    sampleCount: brakeSamples.length,
  });
}
