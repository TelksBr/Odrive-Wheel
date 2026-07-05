import { useCallback, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { chartHzToSyncMs, type ChartHz } from './controlOptions';
import { useThrottledValue } from '../../shared/useThrottledValue';
import { TimeSeriesChart } from './TimeSeriesChart';
import { busSeries, localizedSeries, motionSeries } from './series';
import { computeStats } from './types';
import { allSeriesKeys } from './series';
import type { BrakePowerState, TelemetrySample } from './types';
import type { Locale } from '../../i18n/messages';

interface PipTelemetryHostProps {
  connected: boolean;
  samples: TelemetrySample[];
  brakePower: BrakePowerState;
  windowMs: number;
  chartHz: ChartHz;
  pipOpen: boolean;
  pipWindow: Window | null;
  onPipOpenChange: (open: boolean) => void;
  onPipWindowChange: (win: Window | null) => void;
  registerOpenPip: (fn: () => void) => void;
}

function renderOverlayRoot(
  root: Root,
  props: {
    connected: boolean;
    samples: TelemetrySample[];
    brakePower: BrakePowerState;
    windowMs: number;
    chartHz: ChartHz;
    locale: Locale;
  },
) {
  root.render(<OverlayWindow {...props} />);
}

/** Keeps PiP window alive when Observe tab unmounts. */
export function PipTelemetryHost({
  connected,
  samples,
  brakePower,
  windowMs: externalWindowMs,
  chartHz,
  pipOpen,
  pipWindow,
  onPipOpenChange,
  onPipWindowChange,
  registerOpenPip,
}: PipTelemetryHostProps) {
  const { state } = useAppState();
  const locale = state.locale;
  const syncMs = chartHzToSyncMs(chartHz);
  const throttledSamples = useThrottledValue(samples, syncMs);
  const throttledBrake = useThrottledValue(brakePower, syncMs);
  const pipRef = useRef<Window | null>(pipWindow);
  const rootRef = useRef<Root | null>(null);
  const overlayWindowMsRef = useRef(externalWindowMs);

  useEffect(() => {
    pipRef.current = pipWindow;
  }, [pipWindow]);

  useEffect(() => {
    overlayWindowMsRef.current = externalWindowMs;
  }, [externalWindowMs]);

  const overlayProps = {
    connected,
    samples: throttledSamples,
    brakePower: throttledBrake,
    windowMs: overlayWindowMsRef.current,
    chartHz,
    locale,
  };
  const propsRef = useRef(overlayProps);
  propsRef.current = { ...overlayProps, windowMs: overlayWindowMsRef.current };

  useEffect(() => {
    if (!rootRef.current || !pipOpen) {
      return;
    }
    renderOverlayRoot(rootRef.current, propsRef.current);
  }, [chartHz, connected, pipOpen, throttledBrake, throttledSamples, locale, externalWindowMs]);

  const openOverlay = useCallback(async () => {
    if (!window.documentPictureInPicture) {
      return;
    }
    if (!connected) {
      return;
    }
    if (pipRef.current && !pipRef.current.closed) {
      pipRef.current.focus();
      return;
    }

    try {
      const pip = await window.documentPictureInPicture.requestWindow({ width: 680, height: 640 });
      pip.document.title = translate(locale, 'overlayPipTitle');

      const style = pip.document.createElement('style');
      style.textContent = overlayCss;
      pip.document.head.appendChild(style);

      const mount = pip.document.createElement('div');
      mount.id = 'overlay-root';
      mount.style.height = '100%';
      pip.document.body.appendChild(mount);
      pip.document.body.style.margin = '0';
      pip.document.body.style.height = '100%';
      pip.document.body.style.overflow = 'hidden';

      const root = createRoot(mount);
      pipRef.current = pip;
      rootRef.current = root;
      renderOverlayRoot(root, propsRef.current);
      onPipOpenChange(true);
      onPipWindowChange(pip);

      pip.addEventListener('pagehide', () => {
        rootRef.current?.unmount();
        rootRef.current = null;
        pipRef.current = null;
        onPipOpenChange(false);
        onPipWindowChange(null);
      });
    } catch {
      onPipOpenChange(false);
      onPipWindowChange(null);
    }
  }, [connected, locale, onPipOpenChange, onPipWindowChange]);

  useEffect(() => {
    registerOpenPip(() => {
      void openOverlay();
    });
  }, [openOverlay, registerOpenPip]);

  return null;
}

function OverlayWindow({
  connected,
  samples,
  brakePower,
  windowMs,
  chartHz,
  locale,
}: {
  connected: boolean;
  samples: TelemetrySample[];
  brakePower: BrakePowerState;
  windowMs: number;
  chartHz: ChartHz;
  locale: Locale;
}) {
  const stats = computeStats(samples, allSeriesKeys);
  const hz = (() => {
    const last5s = samples.filter((s) => s.t >= (samples.at(-1)?.t ?? 0) - 5000);
    return last5s.length > 1 ? ((last5s.length - 1) / 5).toFixed(1) : '0.0';
  })();

  const windowLabel = windowMs >= 60_000 ? `${windowMs / 60_000} min` : `${windowMs / 1000} s`;
  const brakePowerLabel = brakePower.watts !== null
    ? `${brakePower.watts.toFixed(1)} W`
    : brakePower.resistance !== null
    ? translate(locale, 'overlayBrakeIdle')
    : translate(locale, 'overlayBrakeSetR');

  return (
    <main className="pip-shell">
      <header>
        <strong>{translate(locale, 'appTitle')}</strong>
        <span className={connected ? 'ok' : 'err'}>{connected ? translate(locale, 'overlayOnline') : translate(locale, 'overlayOffline')}</span>
        <span className="sep" />
        <span>{hz} Hz</span>
        <span>{translate(locale, 'overlayPBrake')} {brakePowerLabel}</span>
        <span>{translate(locale, 'overlayWindow')} {windowLabel}</span>
        <span style={{ marginLeft: 'auto', color: '#888896' }}>{translate(locale, 'overlayPoints', { n: samples.length })}</span>
      </header>

      <div className="stats-row">
        <StatPill locale={locale} label={translate(locale, 'metricVbus')} value={stats.vbus?.current} unit="V" color="#60a5fa" />
        <StatPill locale={locale} label={translate(locale, 'metricIbus')} value={stats.ibus?.current} unit="A" color="#f59e0b" />
        <StatPill locale={locale} label={translate(locale, 'metricIqMotor')} value={stats.iq?.current} unit="A" color="#22c55e" />
        <StatPill locale={locale} label={translate(locale, 'overlayStatIqPeak')} value={stats.iq?.peak} unit="A" color="#22c55e" muted />
        <StatPill locale={locale} label={translate(locale, 'observeStatTorque')} value={stats.torqueNm?.current} unit="Nm" color="#ef4444" />
        <StatPill locale={locale} label={translate(locale, 'overlayStatTorquePeak')} value={stats.torqueNm?.peak} unit="Nm" color="#ef4444" muted />
        <StatPill locale={locale} label={translate(locale, 'overlayStatVelocity')} value={stats.velocityDegS?.current} unit="°/s" color="#fb923c" />
      </div>

      <TimeSeriesChart
        title={translate(locale, 'overlayChartDcBus')}
        samples={samples}
        series={localizedSeries(locale, busSeries)}
        windowMs={windowMs}
        height={190}
        compact
        locale={locale}
        drawHz={chartHz}
      />
      <TimeSeriesChart
        title={translate(locale, 'overlayChartWheel')}
        samples={samples}
        series={localizedSeries(locale, motionSeries)}
        windowMs={windowMs}
        height={190}
        compact
        locale={locale}
        drawHz={chartHz}
      />
    </main>
  );
}

function StatPill({
  locale,
  label,
  value,
  unit,
  color,
  muted = false,
}: {
  locale: Locale;
  label: string;
  value: number | null | undefined;
  unit: string;
  color: string;
  muted?: boolean;
}) {
  const display = value !== null && value !== undefined ? `${value.toFixed(1)} ${unit}` : translate(locale, 'overlayEmptyValue');
  return (
    <div className={`stat-pill${muted ? ' muted' : ''}`}>
      <span style={{ color: muted ? '#55555f' : color }}>{label}</span>
      <strong style={{ color: muted ? '#888896' : color }}>{display}</strong>
    </div>
  );
}

const overlayCss = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body, #overlay-root {
    height: 100%;
  }
  body {
    margin: 0;
    background: #0c0c0e;
    color: #ededf0;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    overflow: hidden;
  }
  .pip-shell {
    height: 100%;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) minmax(0, 1fr);
    gap: 5px;
    padding: 6px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 9px;
    background: #131316;
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 8px;
    font-size: 12px;
    flex-wrap: wrap;
  }
  header strong { color: #60a5fa; font-size: 13px; }
  .ok  { color: #22c55e; }
  .err { color: #ef4444; }
  .sep { width: 1px; height: 14px; background: rgba(255,255,255,0.08); }

  .stats-row {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .stat-pill {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 5px 8px;
    background: #131316;
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 7px;
    min-width: 60px;
  }
  .stat-pill span {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #55555f;
  }
  .stat-pill strong {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: -0.02em;
    font-family: "Cascadia Code", "JetBrains Mono", ui-monospace, monospace;
  }
  .stat-pill.muted strong { font-size: 11px; }

  .chart-card {
    min-height: 0;
    background: #131316;
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 8px;
    padding: 6px;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
  }
  .chart-card header {
    border: 0;
    background: transparent;
    padding: 0 2px 4px;
    flex-wrap: nowrap;
    overflow: hidden;
  }
  .chart-card h3 {
    margin: 0;
    font-size: 12px;
    white-space: nowrap;
    color: #ededf0;
  }
  .chart-stage {
    position: relative;
    min-height: 0;
    height: 100%;
  }
  .chart-legend {
    margin-left: auto;
    display: flex;
    gap: 6px;
    flex-wrap: nowrap;
    font-size: 10px;
    overflow: hidden;
  }
  .chart-legend button {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 1px 3px;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    color: #ededf0;
  }
  .chart-tooltip {
    position: absolute;
    z-index: 2;
    pointer-events: none;
    padding: 6px 8px;
    border-radius: 6px;
    background: rgba(12, 12, 14, 0.94);
    border: 1px solid rgba(255,255,255,0.1);
    font-size: 11px;
    min-width: 140px;
  }
  .chart-tooltip-time {
    color: #888896;
    margin-bottom: 4px;
    font-family: ui-monospace, monospace;
  }
  .chart-tooltip-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .chart-tooltip-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .chart-tooltip-label { color: #a0a0ac; flex: 1; }
  .chart-tooltip-value {
    color: #ededf0;
    font-family: ui-monospace, monospace;
  }
  canvas {
    width: 100% !important;
    min-height: 0;
    height: 100% !important;
    display: block;
    background: #0c0c0e;
    border-radius: 5px;
  }
`;
