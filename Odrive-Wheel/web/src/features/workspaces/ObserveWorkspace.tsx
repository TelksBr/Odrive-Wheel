import { useState } from 'react';
import { useAppState } from '../../app/AppState';
import { usePageVisible } from '../../shared/usePageVisible';
import { translate } from '../../i18n/messages';
import { Card, SectionHeader } from '../../shared/ui';
import { LiveDebugPage } from '../live/LiveDebugPage';
import { TimeSeriesChart } from '../telemetry/TimeSeriesChart';
import { TelemetryControlPanel } from '../telemetry/TelemetryControlPanel';
import { TelemetryOverlay } from '../telemetry/TelemetryOverlay';
import { busSeries, motionSeries } from '../telemetry/series';
import { useTelemetry } from '../telemetry/useTelemetry';
import type { SeriesStats, TelemetrySample } from '../telemetry/types';

export function ObserveWorkspace() {
  const { state } = useAppState();
  const locale = state.locale;
  const pageVisible = usePageVisible();
  const [enabled, setEnabled] = useState(true);
  const [intervalMs, setIntervalMs] = useState(500);
  const [windowMs, setWindowMs] = useState(60_000);
  const [liveDebugPolling, setLiveDebugPolling] = useState(false);

  const maxTorqueNm = Number(state.fieldValues['axis.maxtorque'] ?? '');
  const telemetry = useTelemetry({
    connected: state.connected,
    enabled: enabled && pageVisible,
    intervalMs,
    windowMs,
    maxTorqueNm: Number.isFinite(maxTorqueNm) && maxTorqueNm > 0 ? maxTorqueNm : undefined,
    holdPolling: state.busy || liveDebugPolling,
  });

  return (
    <div className="page-stack">
      <SectionHeader
        eyebrow={translate(locale, 'observeEyebrow')}
        title={translate(locale, 'observeTitle')}
        description={translate(locale, 'observeDescription')}
      />

      <Card title={translate(locale, 'observeControlsTitle')} description={translate(locale, 'observeControlsDescription')}>
        <TelemetryControlPanel
          locale={locale}
          connected={state.connected}
          enabled={enabled}
          onEnabledChange={setEnabled}
          intervalMs={intervalMs}
          onIntervalChange={setIntervalMs}
          windowMs={windowMs}
          onWindowChange={setWindowMs}
          telemetry={telemetry}
        />

        <TelemetryOverlay
          connected={state.connected}
          samples={telemetry.displaySamples}
          brakePower={telemetry.brakePower}
          windowMs={windowMs}
        />
      </Card>

      <StatsGrid stats={telemetry.stats} locale={locale} />

      <div className="chart-grid">
        <TimeSeriesChart
          title={translate(locale, 'observeChartDcBus')}
          samples={telemetry.displaySamples}
          series={busSeries}
          windowMs={windowMs}
        />
        <TimeSeriesChart
          title={translate(locale, 'observeChartWheel')}
          samples={telemetry.displaySamples}
          series={motionSeries}
          windowMs={windowMs}
        />
      </div>

      <LiveDebugPage onAutoPollChange={setLiveDebugPolling} />
    </div>
  );
}

interface StatRowItem {
  key: keyof TelemetrySample;
  labelKey: string;
  unit: string;
  color: string;
}

const STAT_ROWS: StatRowItem[] = [
  { key: 'vbus', labelKey: 'metricVbus', unit: 'V', color: '#60a5fa' },
  { key: 'ibus', labelKey: 'metricIbus', unit: 'A', color: '#f59e0b' },
  { key: 'iq', labelKey: 'metricIqMotor', unit: 'A', color: '#22c55e' },
  { key: 'ibrake', labelKey: 'observeStatIBrake', unit: 'A', color: '#ef4444' },
  { key: 'torqueNm', labelKey: 'observeStatTorque', unit: 'Nm', color: '#ef4444' },
  { key: 'positionDeg', labelKey: 'observeStatPosition', unit: 'deg', color: '#a78bfa' },
  { key: 'velocityDegS', labelKey: 'observeStatVelocity', unit: 'deg/s', color: '#fb923c' },
];

function StatsGrid({ stats, locale }: { stats: import('../telemetry/types').TelemetryStats; locale: import('../../i18n/messages').Locale }) {
  const headers = ['', 'observeStatsCurrent', 'observeStatsMin', 'observeStatsMax', 'observeStatsAvg', 'observeStatsPeak'] as const;
  return (
    <Card title={translate(locale, 'observeStatsTitle')} description={translate(locale, 'observeStatsDescription')}>
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
        {headers.map((h) => (
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
            {h ? translate(locale, h) : ''}
          </div>
        ))}

        {STAT_ROWS.map((row) => {
          const s = stats[row.key] as SeriesStats | undefined;
          return (
            <>
              <StatCell key={`${row.key}-label`} bg="var(--surface-2)" isLabel>
                <span style={{ color: row.color, marginRight: 5 }}>●</span>
                {translate(locale, row.labelKey)}
              </StatCell>
              <StatCell key={`${row.key}-cur`}>{fmt(s?.current, row.unit, locale)}</StatCell>
              <StatCell key={`${row.key}-min`} dim>{fmt(s?.min, row.unit, locale)}</StatCell>
              <StatCell key={`${row.key}-max`}>{fmt(s?.max, row.unit, locale)}</StatCell>
              <StatCell key={`${row.key}-avg`} dim>{fmt(s?.avg, row.unit, locale)}</StatCell>
              <StatCell key={`${row.key}-peak`} accent>{fmt(s?.peak, row.unit, locale)}</StatCell>
            </>
          );
        })}
      </div>
    </Card>
  );
}

function StatCell({ children, bg, dim, accent, isLabel }: {
  children: React.ReactNode; bg?: string; dim?: boolean; accent?: boolean; isLabel?: boolean;
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

function fmt(v: number | null | undefined, unit: string, locale: import('../../i18n/messages').Locale): string {
  if (v === null || v === undefined) return translate(locale, 'observeStatEmpty');
  return `${v.toFixed(2)} ${unit}`;
}
