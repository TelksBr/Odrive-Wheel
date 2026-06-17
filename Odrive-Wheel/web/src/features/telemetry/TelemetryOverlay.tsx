import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TimeSeriesChart } from './TimeSeriesChart';
import { busSeries, motionSeries } from './series';
import { computeStats } from './types';
import { allSeriesKeys } from './series';
import type { BrakePowerState, TelemetrySample } from './types';

interface TelemetryOverlayProps {
  connected: boolean;
  samples: TelemetrySample[];
  brakePower: BrakePowerState;
  windowMs?: number;
}

const WINDOW_OPTIONS = [
  { label: '10 s', ms: 10_000 },
  { label: '30 s', ms: 30_000 },
  { label: '1 min', ms: 60_000 },
  { label: '2 min', ms: 120_000 },
];

export function TelemetryOverlay({ connected, samples, brakePower, windowMs: externalWindowMs = 60_000 }: TelemetryOverlayProps) {
  const [pipOpen, setPipOpen] = useState(false);
  const [overlayWindowMs, setOverlayWindowMs] = useState(externalWindowMs);
  const pipRef = useRef<Window | null>(null);
  const rootRef = useRef<Root | null>(null);

  async function openOverlay() {
    if (!window.documentPictureInPicture) {
      throw new Error('Document Picture-in-Picture is not available in this browser');
    }
    if (pipRef.current && !pipRef.current.closed) {
      pipRef.current.focus();
      return;
    }

    const pip = await window.documentPictureInPicture.requestWindow({ width: 660, height: 620 });
    pip.document.title = 'Odrive-Wheel Telemetry';
    const style = pip.document.createElement('style');
    style.textContent = overlayCss;
    pip.document.head.appendChild(style);
    const mount = pip.document.createElement('div');
    mount.id = 'overlay-root';
    pip.document.body.appendChild(mount);

    pipRef.current = pip;
    rootRef.current = createRoot(mount);
    setPipOpen(true);
    pip.addEventListener('pagehide', () => {
      rootRef.current?.unmount();
      rootRef.current = null;
      pipRef.current = null;
      setPipOpen(false);
    });
  }

  // Push updated data into the PiP window every render
  useEffect(() => {
    rootRef.current?.render(
      <OverlayWindow
        connected={connected}
        samples={samples}
        brakePower={brakePower}
        windowMs={overlayWindowMs}
      />,
    );
  }, [brakePower, connected, samples, overlayWindowMs]);

  const pipAvailable = Boolean(window.documentPictureInPicture);

  return (
    <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
      <button
        type="button"
        disabled={!connected || !pipAvailable}
        onClick={() => void openOverlay()}
      >
        {pipOpen ? '⎙ Focar overlay iRacing' : '⎙ Abrir overlay iRacing'}
      </button>

      {pipOpen && (
        <>
          <span className="eyebrow" style={{ alignSelf: 'center' }}>Janela overlay</span>
          {WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt.ms}
              type="button"
              className={`compact-button${overlayWindowMs === opt.ms ? ' active' : ''}`}
              onClick={() => setOverlayWindowMs(opt.ms)}
            >
              {opt.label}
            </button>
          ))}
        </>
      )}

      <span className="muted" style={{ fontSize: 12 }}>
        {pipAvailable
          ? 'Document PiP — histórico de telemetria compartilhado em tempo real.'
          : 'Document PiP indisponível. Use Chrome/Edge 116+.'}
      </span>
    </div>
  );
}

function OverlayWindow({ connected, samples, brakePower, windowMs }: Required<TelemetryOverlayProps>) {
  const stats = computeStats(samples, allSeriesKeys);
  const hz = (() => {
    const last5s = samples.filter((s) => s.t >= (samples.at(-1)?.t ?? 0) - 5000);
    return last5s.length > 1 ? ((last5s.length - 1) / 5).toFixed(1) : '0.0';
  })();

  const windowLabel = windowMs >= 60_000 ? `${windowMs / 60_000} min` : `${windowMs / 1000} s`;
  const brakePowerLabel = brakePower.watts !== null
    ? `${brakePower.watts.toFixed(1)} W`
    : brakePower.resistance !== null
    ? 'idle'
    : 'set R';

  return (
    <main className="pip-shell">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header>
        <strong>Odrive-Wheel</strong>
        <span className={connected ? 'ok' : 'err'}>{connected ? '● online' : '○ offline'}</span>
        <span className="sep" />
        <span>{hz} Hz</span>
        <span>P brake: {brakePowerLabel}</span>
        <span>janela: {windowLabel}</span>
        <span style={{ marginLeft: 'auto', color: '#888896' }}>{samples.length} pts</span>
      </header>

      {/* ── Stats row ───────────────────────────────────────────────── */}
      <div className="stats-row">
        <StatPill label="VBUS" value={stats.vbus?.current} unit="V" color="#60a5fa" />
        <StatPill label="IBUS" value={stats.ibus?.current} unit="A" color="#f59e0b" />
        <StatPill label="Iq" value={stats.iq?.current} unit="A" color="#22c55e" />
        <StatPill label="Iq pk" value={stats.iq?.peak} unit="A" color="#22c55e" muted />
        <StatPill label="Tq" value={stats.torqueNm?.current} unit="Nm" color="#ef4444" />
        <StatPill label="Tq pk" value={stats.torqueNm?.peak} unit="Nm" color="#ef4444" muted />
        <StatPill label="Vel" value={stats.velocityDegS?.current} unit="°/s" color="#fb923c" />
      </div>

      {/* ── Charts ──────────────────────────────────────────────────── */}
      <TimeSeriesChart
        title="DC bus"
        samples={samples}
        series={busSeries}
        windowMs={windowMs}
        height={190}
        compact
      />
      <TimeSeriesChart
        title="Volante — torque e posição"
        samples={samples}
        series={motionSeries}
        windowMs={windowMs}
        height={190}
        compact
      />
    </main>
  );
}

function StatPill({
  label,
  value,
  unit,
  color,
  muted = false,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
  color: string;
  muted?: boolean;
}) {
  const display = value !== null && value !== undefined ? `${value.toFixed(1)} ${unit}` : '-';
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
  body {
    margin: 0;
    background: #0c0c0e;
    color: #ededf0;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    overflow: hidden;
  }
  .pip-shell {
    height: 100vh;
    display: grid;
    grid-template-rows: auto auto 1fr 1fr;
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
    grid-template-rows: auto 1fr;
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
  }
  canvas {
    width: 100%;
    min-height: 0;
    height: 100% !important;
    display: block;
    background: #0c0c0e;
    border-radius: 5px;
  }
`;
