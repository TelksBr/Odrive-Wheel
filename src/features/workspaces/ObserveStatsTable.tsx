import { translate, type Locale } from '../../i18n/messages';
import type { SeriesStats, TelemetrySample, TelemetryStats } from '../telemetry/types';

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
  { key: 'positionDeg', labelKey: 'observeStatPosition', unit: '°', color: '#a78bfa' },
  { key: 'velocityDegS', labelKey: 'observeStatVelocity', unit: '°/s', color: '#fb923c' },
];

const VALUE_COLUMNS = ['current', 'min', 'max', 'avg', 'peak'] as const;

const COLUMN_LABEL_KEYS: Record<(typeof VALUE_COLUMNS)[number], string> = {
  current: 'observeStatsCurrent',
  min: 'observeStatsMin',
  max: 'observeStatsMax',
  avg: 'observeStatsAvg',
  peak: 'observeStatsPeak',
};

export function ObserveStatsTable({ stats, locale }: { stats: TelemetryStats; locale: Locale }) {
  return (
    <div className="observe-stats-block">
      <div className="observe-section-head observe-stats-head">
        <div>
          <h4 className="observe-stats-title">{translate(locale, 'observeStatsTitle')}</h4>
          <p className="observe-section-desc">{translate(locale, 'observeStatsDescription')}</p>
        </div>
      </div>

      <div className="observe-stats-table-wrap">
        <div className="observe-stats-table" role="table">
          <div className="observe-stats-row observe-stats-row-head" role="row">
            <div className="observe-stats-cell observe-stats-cell-label" role="columnheader" />
            {VALUE_COLUMNS.map((column) => (
              <div key={column} className="observe-stats-cell observe-stats-cell-head" role="columnheader">
                {translate(locale, COLUMN_LABEL_KEYS[column])}
              </div>
            ))}
          </div>

          {STAT_ROWS.map((row) => {
            const s = stats[row.key] as SeriesStats | undefined;
            return (
              <div key={row.key} className="observe-stats-row" role="row">
                <div className="observe-stats-cell observe-stats-cell-label" role="rowheader">
                  <span className="observe-stats-dot" style={{ color: row.color }} aria-hidden>
                    ●
                  </span>
                  {translate(locale, row.labelKey)}
                </div>
                <StatValue locale={locale} value={s?.current} unit={row.unit} />
                <StatValue locale={locale} value={s?.min} unit={row.unit} dim />
                <StatValue locale={locale} value={s?.max} unit={row.unit} />
                <StatValue locale={locale} value={s?.avg} unit={row.unit} dim />
                <StatValue locale={locale} value={s?.peak} unit={row.unit} accent />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatValue({
  locale,
  value,
  unit,
  dim = false,
  accent = false,
}: {
  locale: Locale;
  value: number | null | undefined;
  unit: string;
  dim?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={`observe-stats-cell observe-stats-cell-value${dim ? ' dim' : ''}${accent ? ' accent' : ''}`}
      role="cell"
    >
      {fmt(value, unit, locale)}
    </div>
  );
}

function fmt(v: number | null | undefined, unit: string, locale: Locale): string {
  if (v === null || v === undefined) return translate(locale, 'observeStatEmpty');
  const n = v.toFixed(2);
  return unit === '°' || unit === '°/s' ? `${n}${unit}` : `${n} ${unit}`;
}
