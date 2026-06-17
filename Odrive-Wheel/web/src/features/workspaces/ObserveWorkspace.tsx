import { useState } from 'react';
import { useAppState } from '../../app/AppState';
import { Card, Pill, SectionHeader } from '../../shared/ui';
import { LiveDebugPage } from '../live/LiveDebugPage';
import { ConfigPage } from '../config/ConfigPage';
import { TimeSeriesChart } from '../telemetry/TimeSeriesChart';
import { TelemetryOverlay } from '../telemetry/TelemetryOverlay';
import { busSeries, motionSeries } from '../telemetry/series';
import { useTelemetry } from '../telemetry/useTelemetry';
import type { SeriesStats, TelemetrySample } from '../telemetry/types';

const WINDOW_OPTIONS: { label: string; ms: number }[] = [
  { label: '10 s',   ms: 10_000 },
  { label: '30 s',   ms: 30_000 },
  { label: '1 min',  ms: 60_000 },
  { label: '2 min',  ms: 120_000 },
  { label: '5 min',  ms: 300_000 },
];

const INTERVAL_OPTIONS: { label: string; ms: number }[] = [
  { label: '100 ms', ms: 100 },
  { label: '200 ms', ms: 200 },
  { label: '500 ms', ms: 500 },
  { label: '1 s',    ms: 1000 },
];

export function ObserveWorkspace() {
  const { state } = useAppState();
  const [enabled, setEnabled] = useState(true);
  const [intervalMs, setIntervalMs] = useState(250);
  const [windowMs, setWindowMs] = useState(60_000);

  const telemetry = useTelemetry({
    connected: state.connected,
    enabled,
    intervalMs,
    windowMs,
  });

  const statusTone = telemetry.lastError ? 'error' : enabled && state.connected ? 'ok' : 'neutral';
  const statusLabel = telemetry.lastError ?? (enabled && state.connected ? 'streaming' : 'idle');

  return (
    <div className="page-stack">
      <SectionHeader
        eyebrow="Observe"
        title="Telemetria ao vivo"
        description="Histórico configurável, exportação CSV e overlay iRacing em tempo real."
      />

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <Card title="Controles" description="Polling, janela de tempo, pausa e exportação">
        <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Polling
          </label>

          <span className="eyebrow" style={{ alignSelf: 'center' }}>Intervalo</span>
          <div className="chip-row" style={{ marginTop: 0 }}>
            {INTERVAL_OPTIONS.map((opt) => (
              <button
                key={opt.ms}
                type="button"
                className={intervalMs === opt.ms ? 'active' : ''}
                onClick={() => setIntervalMs(opt.ms)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <span className="eyebrow" style={{ alignSelf: 'center' }}>Janela</span>
          <div className="chip-row" style={{ marginTop: 0 }}>
            {WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.ms}
                type="button"
                className={windowMs === opt.ms ? 'active' : ''}
                onClick={() => setWindowMs(opt.ms)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={telemetry.paused ? 'ok' : ''}
              onClick={() => telemetry.setPaused(!telemetry.paused)}
              title={telemetry.paused ? 'Retomar — dados continuam coletando' : 'Pausar visualização'}
            >
              {telemetry.paused ? '▶ Retomar' : '⏸ Pausar'}
            </button>
            <button
              type="button"
              disabled={!state.connected}
              onClick={() => void telemetry.pollOnce()}
            >
              ⟳ Amostrar
            </button>
            <button
              type="button"
              disabled={telemetry.samples.length === 0}
              onClick={telemetry.exportCsv}
              title="Exportar histórico completo como CSV"
            >
              ↓ Exportar CSV
            </button>
            <button type="button" onClick={telemetry.clear}>
              ✕ Limpar
            </button>
          </div>

          <Pill tone={statusTone}>{statusLabel}</Pill>
        </div>

        {/* ── KPIs ─────────────────────────────────────────────────────── */}
        <div className="telemetry-kpis" style={{ marginTop: 12 }}>
          <div>
            <span>Amostras</span>
            <strong>{telemetry.samples.length}</strong>
          </div>
          <div>
            <span>Taxa efetiva</span>
            <strong style={{ fontFamily: 'var(--mono)' }}>{telemetry.hz.toFixed(1)} Hz</strong>
          </div>
          <div>
            <span>Brake R</span>
            <strong>{telemetry.brakePower.resistance === null ? '-' : `${telemetry.brakePower.resistance.toFixed(2)} Ω`}</strong>
          </div>
          <div>
            <span>P brake</span>
            <strong>{telemetry.brakePower.watts === null ? '-' : `${telemetry.brakePower.watts.toFixed(2)} W`}</strong>
          </div>
          {telemetry.paused && (
            <div style={{ gridColumn: '1 / -1' }}>
              <span>Modo</span>
              <strong style={{ color: 'var(--warn)' }}>⏸ Visualização pausada — coleta continua em background</strong>
            </div>
          )}
        </div>

        <TelemetryOverlay
          connected={state.connected}
          samples={telemetry.samples}
          brakePower={telemetry.brakePower}
          windowMs={windowMs}
        />
      </Card>

      {/* ── Stats grid ───────────────────────────────────────────────────── */}
      <StatsGrid stats={telemetry.stats} />

      {/* ── Charts ───────────────────────────────────────────────────────── */}
      <div className="chart-grid">
        <TimeSeriesChart
          title="DC bus — tensão e corrente"
          samples={telemetry.displaySamples}
          series={busSeries}
          windowMs={windowMs}
        />
        <TimeSeriesChart
          title="Volante — torque e posição"
          samples={telemetry.displaySamples}
          series={motionSeries}
          windowMs={windowMs}
        />
      </div>

      <LiveDebugPage />
      <ConfigPage filter="ffb" includeGroups={['system']} />
    </div>
  );
}

/* ── Stats grid component ────────────────────────────────────────────────── */
interface StatRowItem {
  key: keyof TelemetrySample;
  label: string;
  unit: string;
  color: string;
}

const STAT_ROWS: StatRowItem[] = [
  { key: 'vbus',         label: 'VBUS',     unit: 'V',     color: '#60a5fa' },
  { key: 'ibus',         label: 'IBUS',     unit: 'A',     color: '#f59e0b' },
  { key: 'iq',           label: 'Iq',       unit: 'A',     color: '#22c55e' },
  { key: 'ibrake',       label: 'I brake',  unit: 'A',     color: '#ef4444' },
  { key: 'torqueNm',     label: 'Torque',   unit: 'Nm',    color: '#ef4444' },
  { key: 'positionDeg',  label: 'Position', unit: 'deg',   color: '#a78bfa' },
  { key: 'velocityDegS', label: 'Velocity', unit: 'deg/s', color: '#fb923c' },
];

function StatsGrid({ stats }: { stats: import('../telemetry/types').TelemetryStats }) {
  return (
    <Card title="Estatísticas da janela" description="Atual · Mínimo · Máximo · Média · Pico absoluto">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'max-content repeat(5, minmax(60px, 1fr))',
          gap: '1px',
          background: 'var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          fontSize: 12,
          fontFamily: 'var(--mono)',
        }}
      >
        {/* header */}
        {(['', 'Atual', 'Min', 'Max', 'Média', 'Pico'] as const).map((h) => (
          <div
            key={h}
            style={{
              padding: '6px 8px',
              background: 'var(--surface-3)',
              color: 'var(--muted-2)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {h}
          </div>
        ))}

        {STAT_ROWS.map((row) => {
          const s = stats[row.key] as SeriesStats | undefined;
          return (
            <>
              <StatCell key={`${row.key}-label`} bg="var(--surface-2)" isLabel>
                <span style={{ color: row.color, marginRight: 5 }}>●</span>
                {row.label}
              </StatCell>
              <StatCell key={`${row.key}-cur`}>
                {fmt(s?.current, row.unit)}
              </StatCell>
              <StatCell key={`${row.key}-min`} dim>
                {fmt(s?.min, row.unit)}
              </StatCell>
              <StatCell key={`${row.key}-max`}>
                {fmt(s?.max, row.unit)}
              </StatCell>
              <StatCell key={`${row.key}-avg`} dim>
                {fmt(s?.avg, row.unit)}
              </StatCell>
              <StatCell key={`${row.key}-peak`} accent>
                {fmt(s?.peak, row.unit)}
              </StatCell>
            </>
          );
        })}
      </div>
    </Card>
  );
}

function StatCell({
  children,
  bg,
  dim,
  accent,
  isLabel,
}: {
  children: React.ReactNode;
  bg?: string;
  dim?: boolean;
  accent?: boolean;
  isLabel?: boolean;
}) {
  return (
    <div
      style={{
        padding: '6px 8px',
        background: bg ?? 'var(--surface-2)',
        color: accent ? 'var(--warn)' : dim ? 'var(--muted)' : 'var(--text)',
        fontWeight: isLabel ? 600 : 400,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  );
}

function fmt(v: number | null | undefined, unit: string): string {
  if (v === null || v === undefined) {
    return '-';
  }
  return `${v.toFixed(2)} ${unit}`;
}
