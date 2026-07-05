import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAppState } from '../../app/AppState';
import { useObservePolling, type ObservePollingHandle } from './useObservePolling';
import { PipTelemetryHost } from '../telemetry/PipTelemetryHost';
import type { ChartHz, SerialChartHz } from '../telemetry/controlOptions';

interface ObserveTelemetryContextValue {
  observe: ObservePollingHandle;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  chartHz: ChartHz;
  setChartHz: (v: ChartHz) => void;
  serialChartHz: SerialChartHz;
  setSerialChartHz: (v: SerialChartHz) => void;
  windowMs: number;
  setWindowMs: (v: number) => void;
  pipOpen: boolean;
  setPipOpen: (v: boolean) => void;
  pipWindow: Window | null;
  setPipWindow: (v: Window | null) => void;
  pollingActive: boolean;
  requestOpenPip: () => void;
  registerOpenPip: (fn: () => void) => void;
}

const ObserveTelemetryContext = createContext<ObserveTelemetryContextValue | null>(null);

export function ObserveTelemetryProvider({ children }: { children: ReactNode }) {
  const { state } = useAppState();
  const [enabled, setEnabled] = useState(true);
  const [chartHz, setChartHz] = useState<ChartHz>(30);
  const [serialChartHz, setSerialChartHz] = useState<SerialChartHz>(10);
  const [windowMs, setWindowMs] = useState(60_000);
  const [pipOpen, setPipOpen] = useState(false);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const openPipRef = useRef<() => void>(() => {});

  const registerOpenPip = useCallback((fn: () => void) => {
    openPipRef.current = fn;
  }, []);

  const requestOpenPip = useCallback(() => {
    openPipRef.current();
  }, []);

  const onObserveTab = state.activeTab === 'observe';
  const pollingActive = state.connected && ((onObserveTab && enabled) || pipOpen);

  const maxTorqueNm = Number(state.fieldValues['axis.maxtorque'] ?? '');
  const rangeDeg = Number(state.fieldValues['axis.range'] ?? '');
  const halfRangeDeg = Number.isFinite(rangeDeg) && rangeDeg > 0 ? rangeDeg / 2 : undefined;

  const observe = useObservePolling({
    connected: state.connected,
    enabled: pollingActive,
    chartHz,
    serialChartHz,
    windowMs,
    maxTorqueNm: Number.isFinite(maxTorqueNm) && maxTorqueNm > 0 ? maxTorqueNm : undefined,
    halfRangeDeg,
    holdPolling: state.busy,
    timerWindow: pipWindow,
  });

  const setPipOpenStable = useCallback((open: boolean) => setPipOpen(open), []);
  const setPipWindowStable = useCallback((win: Window | null) => setPipWindow(win), []);

  const value = useMemo(
    () => ({
      observe,
      enabled,
      setEnabled,
      chartHz,
      setChartHz,
      serialChartHz,
      setSerialChartHz,
      windowMs,
      setWindowMs,
      pipOpen,
      setPipOpen: setPipOpenStable,
      pipWindow,
      setPipWindow: setPipWindowStable,
      pollingActive,
      requestOpenPip,
      registerOpenPip,
    }),
    [
      observe,
      enabled,
      chartHz,
      serialChartHz,
      windowMs,
      pipOpen,
      pipWindow,
      pollingActive,
      setPipOpenStable,
      setPipWindowStable,
      requestOpenPip,
      registerOpenPip,
    ],
  );

  return (
    <ObserveTelemetryContext.Provider value={value}>
      <PipTelemetryHost
        connected={state.connected}
        samples={observe.displaySamples}
        brakePower={observe.brakePower}
        chartHz={chartHz}
        windowMs={windowMs}
        pipOpen={pipOpen}
        pipWindow={pipWindow}
        onPipOpenChange={setPipOpenStable}
        onPipWindowChange={setPipWindowStable}
        registerOpenPip={registerOpenPip}
      />
      {children}
    </ObserveTelemetryContext.Provider>
  );
}

export function useObserveTelemetry(): ObserveTelemetryContextValue {
  const ctx = useContext(ObserveTelemetryContext);
  if (!ctx) {
    throw new Error('useObserveTelemetry must be used within ObserveTelemetryProvider');
  }
  return ctx;
}
