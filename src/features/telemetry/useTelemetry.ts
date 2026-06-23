import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readField } from '../board/BoardProtocol';
import { flatFields } from '../config/fieldCatalog';
import { serialService } from '../serial/SerialService';
import { computeStats } from './types';
import { allSeriesKeys } from './series';
import { pushTelemetrySample, snapshotTelemetry } from './telemetryBuffer';
import {
  HID_TELEMETRY_MIN_INTERVAL_MS,
  MAX_TELEMETRY_SAMPLES,
  MAX_TELEMETRY_WINDOW_MS,
  TELEMETRY_UI_SYNC_MS,
} from './controlOptions';
import { updateBrakePowerRef } from './telemetryBrakePower';
import { useHidTelemetryListener } from './useHidTelemetryListener';
import { hidFfbService } from '../hid/HidFfbService';
import type { BrakePowerState, TelemetrySample, TelemetryStats } from './types';

const fieldByPath = new Map(flatFields.map((field) => [field.path, field]));

function odriveField(path: string) {
  const field = fieldByPath.get(path);
  if (!field) {
    throw new Error(`Telemetry field not found: ${path}`);
  }
  return field;
}

export interface TelemetryHandle {
  samples: TelemetrySample[];
  displaySamples: TelemetrySample[];
  brakePower: BrakePowerState;
  stats: TelemetryStats;
  lastError: string | null;
  hz: number;
  hidTelemetryActive: boolean;
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
  halfRangeDeg,
  holdPolling = false,
}: {
  connected: boolean;
  enabled: boolean;
  intervalMs: number;
  windowMs?: number;
  maxTorqueNm?: number;
  halfRangeDeg?: number;
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
  const lastAcceptedSampleRef = useRef(0);
  const brakePowerRef = useRef<BrakePowerState>({ resistance: null, watts: null, sampleCount: 0 });
  const brakePowerDirtyRef = useRef(false);
  const hidActiveRef = useRef(false);
  const windowMsRef = useRef(windowMs);

  useEffect(() => {
    windowMsRef.current = windowMs;
  }, [windowMs]);

  useEffect(() => {
    pausedRef.current = paused;
    if (paused) {
      setFrozenSamples(samples.filter((s) => s.t >= (samples.at(-1)?.t ?? 0) - windowMs));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  const readBrakeResistance = useCallback(async () => {
    const raw = await readField(odriveField('config.brake_resistance'));
    const resistance = Number(raw);
    if (Number.isFinite(resistance) && resistance > 0.05 && resistance < 500) {
      resistanceRef.current = resistance;
      brakePowerRef.current = { ...brakePowerRef.current, resistance };
      brakePowerDirtyRef.current = true;
    }
  }, []);

  const applySample = useCallback((sample: TelemetrySample, force = false) => {
    if (
      !force &&
      hidActiveRef.current &&
      sample.t - lastAcceptedSampleRef.current < HID_TELEMETRY_MIN_INTERVAL_MS
    ) {
      updateBrakePowerRef(sample, brakeSamplesRef.current, resistanceRef.current, brakePowerRef, brakePowerDirtyRef);
      return;
    }
    lastAcceptedSampleRef.current = sample.t;
    pushTelemetrySample(samplesRef.current, sample, MAX_TELEMETRY_WINDOW_MS, MAX_TELEMETRY_SAMPLES);
    syncVersionRef.current += 1;
    updateBrakePowerRef(sample, brakeSamplesRef.current, resistanceRef.current, brakePowerRef, brakePowerDirtyRef);
  }, []);

  const hidRange = halfRangeDeg && halfRangeDeg > 0 ? halfRangeDeg : 0;
  const hidTelemetryActive = useHidTelemetryListener(
    connected && enabled && !holdPolling,
    hidRange,
    (sample) => applySample(sample, false),
  );

  useEffect(() => {
    hidActiveRef.current = hidTelemetryActive;
  }, [hidTelemetryActive]);

  const pollOnce = useCallback(async () => {
    if (!connected || inFlight.current || holdPolling) {
      return;
    }
    inFlight.current = true;
    try {
      if (resistanceRef.current === null) {
        await readBrakeResistance().catch(() => undefined);
      }

      if (hidFfbService.connected && hidRange > 0) {
        setLastError(null);
        return;
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

      const sample: TelemetrySample = {
        t: performance.now(),
        vbus: parseNumber(vbus),
        ibus: parseNumber(ibus),
        iq: parseNumber(iq),
        ibrake: parseNumber(ibrake),
        torqueNm: parseTorque(torqueRaw, maxTorqueNm),
        positionDeg: parseNumber(posRaw),
        velocityDegS: parseNumber(velRaw),
      };

      applySample(sample, true);
      setLastError(null);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.current = false;
    }
  }, [applySample, connected, hidRange, holdPolling, maxTorqueNm, readBrakeResistance]);

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
        setSamples(snapshotTelemetry(samplesRef.current, windowMsRef.current));
        if (brakePowerDirtyRef.current) {
          brakePowerDirtyRef.current = false;
          setBrakePower({ ...brakePowerRef.current });
        }
      }
    }, TELEMETRY_UI_SYNC_MS);
    return () => {
      window.clearInterval(pollId);
      window.clearInterval(syncId);
    };
  }, [connected, enabled, intervalMs, pollOnce]);

  const displaySamples = useMemo(() => {
    if (paused) {
      return frozenSamples;
    }
    const cutoff = (samples.at(-1)?.t ?? 0) - windowMs;
    return samples.filter((s) => s.t >= cutoff);
  }, [paused, frozenSamples, samples, windowMs]);

  const hz = useMemo(() => {
    const last5s = samples.filter((s) => s.t >= (samples.at(-1)?.t ?? 0) - 5000);
    return last5s.length > 1 ? (last5s.length - 1) / 5 : 0;
  }, [samples]);

  const stats = useMemo(() => computeStats(displaySamples, allSeriesKeys), [displaySamples]);

  const clear = useCallback(() => {
    brakeSamplesRef.current = [];
    resistanceRef.current = null;
    samplesRef.current = [];
    lastAcceptedSampleRef.current = 0;
    brakePowerRef.current = { resistance: null, watts: null, sampleCount: 0 };
    brakePowerDirtyRef.current = false;
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
      hidTelemetryActive,
      paused,
      setPaused,
      pollOnce,
      clear,
      exportCsv,
    }),
    [brakePower, clear, displaySamples, exportCsv, hidTelemetryActive, hz, lastError, paused, pollOnce, samples, stats],
  );
}

function parseNumber(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(String(raw).trim().split(/\s+/)[0]);
  return Number.isFinite(value) ? value : undefined;
}

function parseTorque(raw: string | undefined, maxTorqueNm?: number): number | undefined {
  if (!raw) {
    return undefined;
  }
  const ltMatch = raw.match(/lt=(-?\d+(?:\.\d+)?)/);
  if (ltMatch && maxTorqueNm !== undefined && maxTorqueNm > 0) {
    const lt = Number(ltMatch[1]);
    return Number.isFinite(lt) ? (lt / 32767) * maxTorqueNm : undefined;
  }
  const nmMatch = raw.match(/nm=(-?\d+(?:\.\d+)?)/);
  return nmMatch ? Number(nmMatch[1]) : undefined;
}
