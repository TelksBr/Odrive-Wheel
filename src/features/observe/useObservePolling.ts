import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readField } from '../board/BoardProtocol';
import { flatFields } from '../config/fieldCatalog';
import { useAppLocale } from '../../app/AppState';
import {
  DEVICE_INFO_EVERY,
  pollDiagCommands,
  runObservePollCycle,
  telemetrySampleFromLive,
  type DeviceMap,
  type DiagMap,
  type ErrorMap,
  type LiveMap,
} from './observePollCore';
import { pushTelemetrySample, snapshotTelemetry } from '../telemetry/telemetryBuffer';
import {
  HID_TELEMETRY_MIN_INTERVAL_MS,
  MAX_TELEMETRY_SAMPLES,
  MAX_TELEMETRY_WINDOW_MS,
  TELEMETRY_UI_SYNC_MS,
} from '../telemetry/controlOptions';
import { updateBrakePowerRef } from '../telemetry/telemetryBrakePower';
import { useHidTelemetryListener } from '../telemetry/useHidTelemetryListener';
import { hidFfbService } from '../hid/HidFfbService';
import { computeStats } from '../telemetry/types';
import { allSeriesKeys } from '../telemetry/series';
import type { BrakePowerState, TelemetrySample } from '../telemetry/types';
import type { TelemetryHandle } from '../telemetry/useTelemetry';

const MIN_INTERVAL_MS = 500;

const fieldByPath = new Map(flatFields.map((field) => [field.path, field]));

function brakeField() {
  const field = fieldByPath.get('config.brake_resistance');
  if (!field) throw new Error('config.brake_resistance missing from catalog');
  return field;
}

export interface ObserveSession {
  live: LiveMap;
  errors: ErrorMap;
  device: DeviceMap;
  diag: DiagMap;
  lastPoll: Date | null;
}

export interface ObservePollingHandle extends TelemetryHandle {
  session: ObserveSession;
  pollDiag: () => Promise<void>;
}

export function useObservePolling({
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
}): ObservePollingHandle {
  const locale = useAppLocale();

  const [samples, setSamples] = useState<TelemetrySample[]>([]);
  const [brakePower, setBrakePower] = useState<BrakePowerState>({ resistance: null, watts: null, sampleCount: 0 });
  const [lastError, setLastError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [frozenSamples, setFrozenSamples] = useState<TelemetrySample[]>([]);

  const [live, setLive] = useState<LiveMap>({});
  const [errors, setErrors] = useState<ErrorMap>({});
  const [device, setDevice] = useState<DeviceMap>({});
  const [diag, setDiag] = useState<DiagMap>({});
  const [lastPoll, setLastPoll] = useState<Date | null>(null);

  const inFlight = useRef(false);
  const cycleRef = useRef(0);
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
    const raw = await readField(brakeField());
    const resistance = Number(raw);
    if (Number.isFinite(resistance) && resistance > 0.05 && resistance < 500) {
      resistanceRef.current = resistance;
      setBrakePower((prev) => ({ ...prev, resistance }));
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
    if (!connected || inFlight.current || holdPolling) return;
    inFlight.current = true;
    try {
      if (resistanceRef.current === null) {
        await readBrakeResistance().catch(() => undefined);
      }

      cycleRef.current += 1;
      const includeDevice = cycleRef.current === 1 || cycleRef.current % DEVICE_INFO_EVERY === 0;
      const result = await runObservePollCycle(locale, { includeDevice });

      setLive(result.live);
      setErrors(result.errors);
      if (result.device) {
        setDevice(result.device);
      }
      setLastPoll(new Date());

      if (!(hidFfbService.connected && hidRange > 0)) {
        applySample(telemetrySampleFromLive(result.live, result.torqueRaw, maxTorqueNm), true);
      }
      setLastError(null);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.current = false;
    }
  }, [applySample, connected, hidRange, holdPolling, locale, maxTorqueNm, readBrakeResistance]);

  const pollDiag = useCallback(async () => {
    if (!connected || holdPolling) return;
    const next = await pollDiagCommands();
    setDiag(next);
  }, [connected, holdPolling]);

  useEffect(() => {
    if (!connected || !enabled) {
      cycleRef.current = 0;
      samplesRef.current = [];
      syncVersionRef.current = 0;
      setSamples([]);
      setLive({});
      setErrors({});
      setDevice({});
      setDiag({});
      setLastPoll(null);
      return undefined;
    }

    void pollOnce();
    const pollId = window.setInterval(() => void pollOnce(), Math.max(intervalMs, MIN_INTERVAL_MS));
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
    if (paused) return frozenSamples;
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
    cycleRef.current = 0;
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
    if (exportSamples.length === 0) return;
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

  const session = useMemo(
    () => ({ live, errors, device, diag, lastPoll }),
    [device, diag, errors, lastPoll, live],
  );

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
      session,
      pollDiag,
    }),
    [
      brakePower,
      clear,
      displaySamples,
      exportCsv,
      hidTelemetryActive,
      hz,
      lastError,
      paused,
      pollDiag,
      pollOnce,
      samples,
      session,
      stats,
    ],
  );
}
