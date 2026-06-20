import { useCallback, useEffect, useRef, useState } from 'react';
import { readField } from '../board/BoardProtocol';
import { flatFields } from '../config/fieldCatalog';
import { parseReplyNumber } from '../inputs/analogAxisMath';
import {
  mergeFieldConfig,
  readInputConfigCache,
  type GpioConfigCache,
  type GpioInputMode,
} from '../inputs/inputConfigCache';
import { parseTorqueReply } from '../inputs/parseTorque';
import { serialService } from '../serial/SerialService';
import {
  buildGpioQueue,
  emptyDashboardMetrics,
  METRIC_ROTATION,
  parsePosition,
  pollDashboardMetric,
  type DashboardMetricsRaw,
} from './dashboardPollCore';

const POSITION_UI_MS = 100;
const CONFIG_POLL_MS = 2000;
const GPIO_LIST = [1, 2, 3, 4] as const;

/** One serial command per tick — position-heavy, analog GPIO prioritized. */
const SLOT_ORDER = ['pos', 'gpio', 'pos', 'torque', 'pos', 'gpio', 'metric'] as const;
type Slot = (typeof SLOT_ORDER)[number];

export interface GpioInputState {
  gpio: number;
  mode: GpioInputMode;
  idx: number | null;
  raw: number | null;
  min: number;
  max: number;
}

export interface DashboardLivePollState {
  positionDeg: number | null;
  positionDegRef: React.MutableRefObject<number | null>;
  torqueNm: number | null;
  maxTorqueNm: number | null;
  gpioInputs: GpioInputState[];
  metrics: DashboardMetricsRaw;
  polling: boolean;
}

function fieldFor(path: string) {
  const field = flatFields.find((item) => item.path === path);
  if (!field) {
    throw new Error(`Missing field: ${path}`);
  }
  return field;
}

function gpioInputsFromConfig(
  config: GpioConfigCache,
  raw: Record<number, number | null>,
): GpioInputState[] {
  return GPIO_LIST.map((gpio) => ({
    gpio,
    mode: config.gpios[gpio].mode,
    idx: config.gpios[gpio].idx,
    raw: raw[gpio],
    min: config.gpios[gpio].min,
    max: config.gpios[gpio].max,
  })).filter((item) => item.mode !== '0');
}

/**
 * Single serial scheduler for all dashboard live data (position, torque, GPIO, metrics).
 */
export function useDashboardLivePoll(
  connected: boolean,
  fieldValues: Record<string, string>,
  paused = false,
): DashboardLivePollState {
  const [positionDeg, setPositionDeg] = useState<number | null>(null);
  const [torqueNm, setTorqueNm] = useState<number | null>(null);
  const [gpioInputs, setGpioInputs] = useState<GpioInputState[]>([]);
  const [maxTorqueNm, setMaxTorqueNm] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetricsRaw>(emptyDashboardMetrics());
  const [polling, setPolling] = useState(false);

  const positionDegRef = useRef<number | null>(null);
  const configRef = useRef<GpioConfigCache | null>(null);
  const gpioRawRef = useRef<Record<number, number | null>>({ 1: null, 2: null, 3: null, 4: null });
  const activeRef = useRef(false);
  const rafRef = useRef(0);
  const slotRef = useRef(0);
  const gpioQueueRef = useRef<number[]>([]);
  const gpioQueueIndexRef = useRef(0);
  const metricIndexRef = useRef(0);
  const lastPositionUiRef = useRef(0);

  const refreshConfig = useCallback(async () => {
    const base = configRef.current ?? mergeFieldConfig(
      {
        maxTorqueNm: null,
        gpios: {
          1: { mode: '0', idx: null, min: 0, max: 4095 },
          2: { mode: '0', idx: null, min: 0, max: 4095 },
          3: { mode: '0', idx: null, min: 0, max: 4095 },
          4: { mode: '0', idx: null, min: 0, max: 4095 },
        },
      },
      fieldValues,
    );
    const config = mergeFieldConfig(await readInputConfigCache(base), fieldValues);
    configRef.current = config;
    gpioQueueRef.current = buildGpioQueue(config.gpios, GPIO_LIST);
    gpioQueueIndexRef.current = 0;
    setMaxTorqueNm(config.maxTorqueNm);
    setGpioInputs(gpioInputsFromConfig(config, gpioRawRef.current));
    return config;
  }, [fieldValues]);

  const runSlot = useCallback(async (slot: Slot) => {
    if (slot === 'pos') {
      try {
        const raw = await serialService.sendCommand('axis.curpos?', true, 500, false);
        const value = parsePosition(raw);
        if (value !== null) {
          positionDegRef.current = value;
          const now = performance.now();
          if (now - lastPositionUiRef.current >= POSITION_UI_MS) {
            lastPositionUiRef.current = now;
            setPositionDeg(value);
          }
        }
      } catch {
        // keep previous sample
      }
      return;
    }

    if (slot === 'torque') {
      try {
        const raw = await serialService.sendCommand('T', true, 500, false);
        const scale = configRef.current?.maxTorqueNm ?? undefined;
        const value = parseTorqueReply(raw, scale);
        if (value !== null) {
          setTorqueNm(value);
        }
      } catch {
        // keep previous sample
      }
      return;
    }

    if (slot === 'metric') {
      const key = METRIC_ROTATION[metricIndexRef.current % METRIC_ROTATION.length];
      metricIndexRef.current += 1;
      try {
        const patch = await pollDashboardMetric(key);
        setMetrics((prev) => ({ ...prev, ...patch }));
      } catch {
        // keep previous metrics
      }
      return;
    }

    const config = configRef.current;
    if (!config) {
      return;
    }

    const queue = gpioQueueRef.current;
    if (queue.length === 0) {
      return;
    }

    const gpio = queue[gpioQueueIndexRef.current % queue.length];
    gpioQueueIndexRef.current += 1;

    try {
      const rawStr = await readField(fieldFor(`gpio.${gpio}.cur`));
      gpioRawRef.current[gpio] = parseReplyNumber(rawStr);
      setGpioInputs(gpioInputsFromConfig(config, gpioRawRef.current));
    } catch {
      // keep previous raw sample
    }
  }, []);

  const runLoop = useCallback(async () => {
    if (!activeRef.current) {
      return;
    }

    const slot = SLOT_ORDER[slotRef.current % SLOT_ORDER.length];
    slotRef.current += 1;
    await runSlot(slot);

    if (activeRef.current) {
      rafRef.current = requestAnimationFrame(() => void runLoop());
    }
  }, [runSlot]);

  useEffect(() => {
    if (configRef.current) {
      const merged = mergeFieldConfig(configRef.current, fieldValues);
      configRef.current = merged;
      gpioQueueRef.current = buildGpioQueue(merged.gpios, GPIO_LIST);
      setMaxTorqueNm(merged.maxTorqueNm);
      setGpioInputs(gpioInputsFromConfig(merged, gpioRawRef.current));
    }
  }, [fieldValues]);

  useEffect(() => {
    if (!connected || paused) {
      activeRef.current = false;
      setPolling(false);
      setPositionDeg(null);
      setTorqueNm(null);
      setGpioInputs([]);
      setMaxTorqueNm(null);
      setMetrics(emptyDashboardMetrics());
      positionDegRef.current = null;
      configRef.current = null;
      gpioRawRef.current = { 1: null, 2: null, 3: null, 4: null };
      slotRef.current = 0;
      gpioQueueRef.current = [];
      gpioQueueIndexRef.current = 0;
      metricIndexRef.current = 0;
      return;
    }

    setPolling(true);
    void refreshConfig();

    activeRef.current = true;
    rafRef.current = requestAnimationFrame(() => void runLoop());

    const configId = window.setInterval(() => void refreshConfig(), CONFIG_POLL_MS);

    return () => {
      activeRef.current = false;
      cancelAnimationFrame(rafRef.current);
      window.clearInterval(configId);
      setPolling(false);
    };
  }, [connected, paused, refreshConfig, runLoop]);

  return {
    positionDeg,
    positionDegRef,
    torqueNm,
    maxTorqueNm,
    gpioInputs,
    metrics,
    polling,
  };
}
