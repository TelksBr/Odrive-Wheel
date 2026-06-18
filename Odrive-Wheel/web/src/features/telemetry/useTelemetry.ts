import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { readField } from '../board/BoardProtocol';
import { flatFields } from '../config/fieldCatalog';
import { serialService } from '../serial/SerialService';
import { computeStats } from './types';
import { allSeriesKeys } from './series';
import { pushTelemetrySample, snapshotTelemetry } from './telemetryBuffer';
import type { BrakePowerState, TelemetrySample, TelemetryStats } from './types';

const MAX_WINDOW_MS = 60_000;
const MAX_SAMPLES = 720;
const UI_SYNC_MS = 500;

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
  maxTorqueNm,
  holdPolling = false,
}: {
  connected: boolean;
  enabled: boolean;
  intervalMs: number;
  windowMs?: number;
  /** axis.maxtorque value — used to convert raw HID torque counts (lt) to Nm. */
  maxTorqueNm?: number;
  /** Pause polling while serial is busy (e.g. unified save). */
  holdPolling?: boolean;
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
  const samplesRef = useRef<TelemetrySample[]>([]);
  const syncVersionRef = useRef(0);

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
    if (!connected || inFlight.current || holdPolling) {
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
        serialService.sendCommand('T', true, 2000, false).catch(() => undefined),
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
        torqueNm: parseTorque(torqueRaw, maxTorqueNm),
        positionDeg: parseNumber(posRaw),
        velocityDegS: parseNumber(velRaw),
      };

      pushTelemetrySample(samplesRef.current, sample, MAX_WINDOW_MS, MAX_SAMPLES);
      syncVersionRef.current += 1;
      updateBrakePower(sample, brakeSamplesRef.current, resistanceRef.current, setBrakePower);
      setLastError(null);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.current = false;
    }
  }, [connected, holdPolling, maxTorqueNm, readBrakeResistance]);

  useEffect(() => {
    if (!connected || !enabled) {
      samplesRef.current = [];
      syncVersionRef.current = 0;
      setSamples([]);
      return undefined;
    }
    void pollOnce();
    const pollId = window.setInterval(() => void pollOnce(), Math.max(intervalMs, 200));
    const syncId = window.setInterval(() => {
      if (!pausedRef.current && syncVersionRef.current > 0) {
        setSamples(snapshotTelemetry(samplesRef.current));
      }
    }, UI_SYNC_MS);
    return () => {
      window.clearInterval(pollId);
      window.clearInterval(syncId);
    };
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
    samplesRef.current = [];
    setSamples([]);
    setFrozenSamples([]);
    setBrakePower({ resistance: null, watts: null, sampleCount: 0 });
    setLastError(null);
  }, []);

  const exportCsv = useCallback(() => {
    const exportSamples = samplesRef.current.length > 0 ? samplesRef.current : samples;
    if (exportSamples.length === 0) {
      return;
    }
    const headers = ['timestamp_ms', 'vbus_V', 'ibus_A', 'iq_A', 'ibrake_A', 'torque_Nm', 'position_deg', 'velocity_degS'];
    const rows = exportSamples.map((s) => [
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

/**
 * Parse torque from the `T` diagnostic command reply: "lt=<int> nm=<float>"
 *
 * Some firmware versions output the raw HID count (0–32767) in the `nm=` field
 * instead of actual Nm, so we prefer the `lt` count + `maxTorqueNm` conversion.
 * Falls back to the `nm=` field when `maxTorqueNm` is not yet loaded.
 */
function parseTorque(raw: string | undefined, maxTorqueNm?: number): number | undefined {
  if (!raw) {
    return undefined;
  }
  // Primary: parse raw HID count (lt) and convert to Nm using the configured scale.
  const ltMatch = raw.match(/lt=(-?\d+(?:\.\d+)?)/);
  if (ltMatch && maxTorqueNm !== undefined && maxTorqueNm > 0) {
    const lt = Number(ltMatch[1]);
    return Number.isFinite(lt) ? (lt / 32767) * maxTorqueNm : undefined;
  }
  // Fallback: read nm= field directly (older firmware that reports correct Nm).
  const nmMatch = raw.match(/nm=(-?\d+(?:\.\d+)?)/);
  return nmMatch ? Number(nmMatch[1]) : undefined;
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
