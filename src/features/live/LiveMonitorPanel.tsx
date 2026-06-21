import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import type { ObserveSession } from '../observe/useObservePolling';
import { Pill } from '../../shared/ui';
import { ERROR_REGISTERS, errorRegisterLabel, type DecodedError } from './errorDecoder';
import {
  DEVICE_INFO_FIELDS,
  DIAG_CMDS,
  LIVE_MONITOR_FIELDS,
  LIVE_MONITOR_GROUP_ORDER,
  type LiveMonitorGroup,
} from './liveMonitorCatalog';
import { deviceInfoTone, formatLiveValue, liveValueTone } from './liveMonitorFormat';
import type { Locale } from '../../i18n/messages';

const GROUP_TITLE_KEYS: Record<LiveMonitorGroup, string> = {
  power: 'liveGroupPower',
  axis: 'liveGroupAxis',
  motor: 'liveGroupMotor',
  encoder: 'liveGroupEncoder',
  controller: 'liveGroupController',
  ffb: 'liveGroupFfb',
  system: 'liveGroupSystem',
};

interface LiveMonitorPanelProps {
  session: ObserveSession;
  onPollDiag?: () => void;
  polling?: boolean;
}

export function LiveMonitorPanel({ session, onPollDiag, polling = false }: LiveMonitorPanelProps) {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const { live, errors, device, diag, lastPoll } = session;

  const hasAnyError = Object.values(errors).some((e) => !e.ok);
  const errorCount = Object.values(errors).filter((e) => !e.ok).length;
  const errorPill = hasAnyError
    ? translate(locale, 'liveErrorCount', { n: errorCount })
    : Object.keys(errors).length > 0
      ? translate(locale, 'liveNoErrors')
      : translate(locale, 'liveEmptyValue');
  const errorTone: 'ok' | 'error' | 'neutral' = hasAnyError ? 'error' : Object.keys(errors).length > 0 ? 'ok' : 'neutral';

  return (
    <section className="observe-section observe-monitor">
      <div className="observe-section-head">
        <div>
          <h3 className="observe-section-title">{translate(locale, 'observeSectionMonitor')}</h3>
          <p className="observe-section-desc">{translate(locale, 'observeMonitorSyncHint')}</p>
        </div>
        <div className="observe-monitor-meta">
          {polling ? <Pill tone="ok">{translate(locale, 'observeStatusStreaming')}</Pill> : null}
          {lastPoll ? (
            <span className="live-poll-time">
              {translate(locale, 'observeKpiLastSync')}: {lastPoll.toLocaleTimeString()}
            </span>
          ) : null}
        </div>
      </div>

      <div className="observe-monitor-device">
        {DEVICE_INFO_FIELDS.map((entry) => {
          const value = device[entry.id] ?? translate(locale, 'liveEmptyValue');
          const tone = device[entry.id] ? deviceInfoTone(entry.id, device[entry.id]) : undefined;
          return (
            <LiveKv
              key={entry.id}
              compact
              label={translate(locale, entry.labelKey)}
              value={value}
              tone={tone}
            />
          );
        })}
      </div>

      <section className="observe-errors-block">
        <div className="observe-errors-head">
          <span className="observe-errors-title">{translate(locale, 'liveDebugErrorsTitle')}</span>
          <Pill tone={errorTone}>{errorPill}</Pill>
        </div>
        <div className="observe-errors-list">
          {ERROR_REGISTERS.map((entry) => (
            <ErrorRow
              key={entry.id}
              locale={locale}
              label={errorRegisterLabel(locale, entry.id)}
              decoded={errors[entry.id]}
              compact
            />
          ))}
        </div>
      </section>

      <div className="observe-monitor-groups">
        {LIVE_MONITOR_GROUP_ORDER.map((group) => {
          const fields = LIVE_MONITOR_FIELDS.filter((field) => field.group === group);
          if (fields.length === 0) return null;
          return (
            <div key={group} className="live-monitor-group">
              <div className="live-monitor-group-title">{translate(locale, GROUP_TITLE_KEYS[group])}</div>
              <div className="live-monitor-grid observe-monitor-grid">
                {fields.map((field) => {
                  const raw = live[field.id];
                  const tone = liveValueTone(raw, field.format);
                  return (
                    <LiveKv
                      key={field.id}
                      compact
                      label={translate(locale, field.labelKey)}
                      sub={field.cmd}
                      value={formatLiveValue(locale, raw, field.format, field.cmd)}
                      tone={tone}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <details className="observe-monitor-details">
        <summary className="observe-monitor-summary">
          <span>{translate(locale, 'liveDebugDiagTitle')}</span>
          {onPollDiag ? (
            <button
              type="button"
              className="observe-diag-refresh"
              disabled={!state.connected || state.busy}
              onClick={(event) => {
                event.preventDefault();
                void onPollDiag();
              }}
            >
              {translate(locale, 'observeRefreshDiag')}
            </button>
          ) : null}
        </summary>
        <p className="observe-section-desc" style={{ margin: '0 10px 8px' }}>
          {translate(locale, 'liveDebugDiagDescription')}
        </p>
        <div className="debug-grid observe-diag-grid">
          {DIAG_CMDS.map((cmd) => (
            <div key={cmd} className="debug-cell">
              <code>{cmd}</code>
              <pre>{diag[cmd] ?? translate(locale, 'liveEmptyValue')}</pre>
            </div>
          ))}
        </div>
      </details>

      <p className="observe-monitor-footer">
        <button type="button" className="link-button" onClick={() => dispatch({ type: 'set-tab', tab: 'calibration' })}>
          {translate(locale, 'liveDebugOpenCalibration')}
        </button>
      </p>
    </section>
  );
}

function LiveKv({
  label,
  sub,
  value,
  tone,
  compact = false,
}: {
  label: string;
  sub?: string;
  value: string;
  tone?: 'ok' | 'warn' | 'error';
  compact?: boolean;
}) {
  const color =
    tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'error' ? 'var(--error)' : 'var(--text)';
  return (
    <div className={compact ? 'live-kv-card live-kv-card-compact' : 'live-kv-card'}>
      <span className="live-kv-label">{label}</span>
      {sub && !compact ? <code className="live-kv-cmd">{sub}</code> : null}
      <code className="live-kv-value" style={{ color }} title={sub}>
        {value}
      </code>
    </div>
  );
}

function ErrorRow({
  locale,
  label,
  decoded,
  compact = false,
}: {
  locale: Locale;
  label: string;
  decoded: DecodedError | undefined;
  compact?: boolean;
}) {
  const tone = decoded === undefined ? 'neutral' : decoded.ok ? 'ok' : 'error';
  if (!compact) return null;
  return (
    <div className={`observe-error-row${decoded && !decoded.ok ? ' has-error' : ''}`}>
      <span className="observe-error-label">{label}</span>
      <Pill tone={tone}>
        {decoded === undefined
          ? translate(locale, 'liveEmptyValue')
          : decoded.ok
            ? translate(locale, 'liveErrorOk')
            : decoded.hex}
      </Pill>
      {decoded && !decoded.ok ? (
        <span className="observe-error-bits">
          {decoded.bits.map((bit) => (
            <span key={bit} className="live-error-bit">
              {bit}
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
}
