import type { ReactNode } from 'react';
import type { Locale } from '../../i18n/messages';
import { translate } from '../../i18n/messages';
import { Pill } from '../../shared/ui';
import {
  CHART_HZ_OPTIONS,
  SERIAL_CHART_HZ_OPTIONS,
  TELEMETRY_INTERVAL_OPTIONS,
  TELEMETRY_WINDOW_OPTIONS,
  type ChartHz,
  type SerialChartHz,
} from './controlOptions';
import type { TelemetryHandle } from './useTelemetry';

interface TelemetryControlPanelProps {
  locale: Locale;
  connected: boolean;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  windowMs: number;
  onWindowChange: (ms: number) => void;
  telemetry: TelemetryHandle;
  /** Observe mode: chart refresh in Hz. */
  chartHz?: ChartHz;
  onChartHzChange?: (hz: ChartHz) => void;
  serialChartHz?: SerialChartHz;
  onSerialChartHzChange?: (hz: SerialChartHz) => void;
  /** Legacy FFB test: serial poll interval in ms. */
  intervalMs?: number;
  onIntervalChange?: (ms: number) => void;
  extraKpis?: ReactNode;
}

export function TelemetryControlPanel({
  locale,
  connected,
  enabled,
  onEnabledChange,
  intervalMs,
  onIntervalChange,
  windowMs,
  onWindowChange,
  telemetry,
  chartHz,
  onChartHzChange,
  serialChartHz,
  onSerialChartHzChange,
  extraKpis,
}: TelemetryControlPanelProps) {
  const observeMode = onChartHzChange !== undefined && chartHz !== undefined;
  const statusTone = telemetry.lastError ? 'error' : enabled && connected ? 'ok' : 'neutral';
  const statusLabel = telemetry.lastError
    ?? (enabled && connected
      ? translate(locale, 'observeStatusStreaming')
      : translate(locale, 'observeStatusIdle'));

  return (
    <>
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <label className="toggle-label">
          <input type="checkbox" checked={enabled} onChange={(e) => onEnabledChange(e.target.checked)} />
          {translate(locale, 'observePolling')}
        </label>

        {observeMode ? (
          <>
            <span className="eyebrow" style={{ alignSelf: 'center' }}>{translate(locale, 'observeChartHz')}</span>
            <div className="chip-row" style={{ marginTop: 0 }}>
              {CHART_HZ_OPTIONS.map((hz) => (
                <button
                  key={hz}
                  type="button"
                  className={chartHz === hz ? 'active' : ''}
                  onClick={() => onChartHzChange(hz)}
                >
                  {translate(locale, 'observeHzOption', { n: hz })}
                </button>
              ))}
            </div>

            {!telemetry.hidTelemetryActive && serialChartHz !== undefined && onSerialChartHzChange ? (
              <>
                <span className="eyebrow" style={{ alignSelf: 'center' }}>{translate(locale, 'observeSerialHz')}</span>
                <div className="chip-row" style={{ marginTop: 0 }}>
                  {SERIAL_CHART_HZ_OPTIONS.map((hz) => (
                    <button
                      key={hz}
                      type="button"
                      className={serialChartHz === hz ? 'active' : ''}
                      onClick={() => onSerialChartHzChange(hz)}
                    >
                      {translate(locale, 'observeHzOption', { n: hz })}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </>
        ) : intervalMs !== undefined && onIntervalChange ? (
          <>
            <span className="eyebrow" style={{ alignSelf: 'center' }}>{translate(locale, 'observeInterval')}</span>
            <div className="chip-row" style={{ marginTop: 0 }}>
              {TELEMETRY_INTERVAL_OPTIONS.map((opt) => (
                <button
                  key={opt.ms}
                  type="button"
                  className={intervalMs === opt.ms ? 'active' : ''}
                  onClick={() => onIntervalChange(opt.ms)}
                >
                  {translate(locale, opt.labelKey)}
                </button>
              ))}
            </div>
          </>
        ) : null}

        <span className="eyebrow" style={{ alignSelf: 'center' }}>{translate(locale, 'observeWindow')}</span>
        <div className="chip-row" style={{ marginTop: 0 }}>
          {TELEMETRY_WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt.ms}
              type="button"
              className={windowMs === opt.ms ? 'active' : ''}
              onClick={() => onWindowChange(opt.ms)}
            >
              {translate(locale, opt.labelKey)}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={telemetry.paused ? 'ok' : ''}
            onClick={() => telemetry.setPaused(!telemetry.paused)}
            title={translate(locale, telemetry.paused ? 'observeResumeTitle' : 'observePauseTitle')}
          >
            {translate(locale, telemetry.paused ? 'observeResume' : 'observePause')}
          </button>
          <button type="button" disabled={!connected} onClick={() => void telemetry.pollOnce()}>
            {translate(locale, 'observeSample')}
          </button>
          <button
            type="button"
            disabled={telemetry.samples.length === 0}
            onClick={telemetry.exportCsv}
            title={translate(locale, 'observeExportCsvTitle')}
          >
            {translate(locale, 'observeExportCsv')}
          </button>
          <button type="button" onClick={telemetry.clear}>
            {translate(locale, 'observeClear')}
          </button>
        </div>

        <Pill tone={statusTone}>{statusLabel}</Pill>
        {telemetry.hidTelemetryActive ? (
          <span title={translate(locale, 'observeHidSourceHint')}>
            <Pill tone="ok">
              {translate(locale, 'observeHidSourceBadge', { n: chartHz ?? 20 })}
            </Pill>
          </span>
        ) : observeMode && serialChartHz !== undefined ? (
          <span title={translate(locale, 'observeSerialSourceHint')}>
            <Pill tone="neutral">
              {translate(locale, 'observeSerialSourceBadge', { n: serialChartHz })}
            </Pill>
          </span>
        ) : null}
        {telemetry.hidTelemetryActive && (
          <Pill tone="ok">{translate(locale, 'observeHidTelemetryBadge')}</Pill>
        )}
      </div>

      <div className="telemetry-kpis" style={{ marginTop: 12 }}>
        <div>
          <span>{translate(locale, 'observeKpiSamples')}</span>
          <strong>{telemetry.samples.length}</strong>
        </div>
        <div>
          <span>{translate(locale, 'observeKpiEffectiveRate')}</span>
          <strong style={{ fontFamily: 'var(--mono)' }}>{telemetry.hz.toFixed(1)} Hz</strong>
        </div>
        <div>
          <span>{translate(locale, 'observeKpiBrakeR')}</span>
          <strong>
            {telemetry.brakePower.resistance === null
              ? translate(locale, 'observeStatEmpty')
              : `${telemetry.brakePower.resistance.toFixed(2)} Ω`}
          </strong>
        </div>
        <div>
          <span>{translate(locale, 'observeKpiPBrake')}</span>
          <strong>
            {telemetry.brakePower.watts === null
              ? translate(locale, 'observeStatEmpty')
              : `${telemetry.brakePower.watts.toFixed(2)} W`}
          </strong>
        </div>
        {telemetry.paused && (
          <div style={{ gridColumn: '1 / -1' }}>
            <span>{translate(locale, 'observeKpiMode')}</span>
            <strong style={{ color: 'var(--warn)' }}>{translate(locale, 'observePausedMode')}</strong>
          </div>
        )}
        {extraKpis}
      </div>
    </>
  );
}
