import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { axisStateLabel } from '../../i18n/fieldMeta';
import { serialService } from '../serial/SerialService';
import { decodeErr, ERR_BITS_AXIS, ERR_BITS_ODRIVE } from '../live/errorDecoder';
import { parseTorqueReply } from '../inputs/parseTorque';

interface Metrics {
  vbus: string | null;
  axisState: string | null;
  iq: string | null;
  torque: string | null;
  errorOk: boolean | null;
}

const POLL_INTERVAL_MS = 1200;

function stateLabel(locale: import('../../i18n/messages').Locale, raw: string | null): string {
  if (!raw) return '—';
  const key = raw.trim();
  const label = axisStateLabel(locale, key);
  return label !== key ? `${key} · ${label}` : key;
}

/** Polls VBUS, axis state, Iq, FFB torque, and error flags at ~1 Hz.
 *  Does NOT set global busy — runs silently in the background. */
export function useDashboardMetrics(connected: boolean): Metrics {
  const { state } = useAppState();
  const [metrics, setMetrics] = useState<Metrics>({
    vbus: null,
    axisState: null,
    iq: null,
    torque: null,
    errorOk: null,
  });
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    if (!connected || inFlight.current || state.busy) return;
    inFlight.current = true;
    try {
      const [vbus, axisState, iq, torqueRaw, odrErr, axErr] = await Promise.allSettled([
        serialService.sendCommand('r vbus_voltage', true, 1000, false),
        serialService.sendCommand('r axis0.current_state', true, 1000, false),
        serialService.sendCommand('r axis0.motor.current_control.Iq_measured', true, 1000, false),
        serialService.sendCommand('T', true, 1000, false),
        serialService.sendCommand('r error', true, 1000, false),
        serialService.sendCommand('r axis0.error', true, 1000, false),
      ]);

      const pick = (r: PromiseSettledResult<string>) =>
        r.status === 'fulfilled' ? r.value.trim() : null;

      const odrErrRaw = pick(odrErr);
      const axErrRaw  = pick(axErr);
      const errorOk =
        odrErrRaw !== null && axErrRaw !== null
          ? decodeErr(odrErrRaw, ERR_BITS_ODRIVE).ok && decodeErr(axErrRaw, ERR_BITS_AXIS).ok
          : null;

      const maxTorque = Number(state.fieldValues['axis.maxtorque'] ?? '');
      const torqueScale = Number.isFinite(maxTorque) && maxTorque > 0 ? maxTorque : undefined;
      const torqueNm = parseTorqueReply(pick(torqueRaw) ?? undefined, torqueScale);
      const torque = torqueNm === null ? null : `${torqueNm.toFixed(2)} Nm`;

      // Parse vbus
      const vbusStr = pick(vbus);
      const vbusNum = vbusStr ? parseFloat(vbusStr) : NaN;

      setMetrics({
        vbus: Number.isFinite(vbusNum) ? `${vbusNum.toFixed(1)} V` : (vbusStr ?? null),
        axisState: pick(axisState),
        iq: (() => {
          const v = pick(iq);
          const n = v ? parseFloat(v) : NaN;
          return Number.isFinite(n) ? `${n.toFixed(2)} A` : (v ?? null);
        })(),
        torque: torque ?? null,
        errorOk,
      });
    } finally {
      inFlight.current = false;
    }
  }, [connected, state.busy, state.fieldValues['axis.maxtorque']]);

  useEffect(() => {
    if (!connected) {
      setMetrics({ vbus: null, axisState: null, iq: null, torque: null, errorOk: null });
      return;
    }
    void poll();
    const id = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [connected, poll]);

  return metrics;
}

/* ── Presentational component ────────────────────────────────────────────── */
export function DashboardLiveMetrics({ connected }: { connected: boolean }) {
  const { state } = useAppState();
  const locale = state.locale;
  const metrics = useDashboardMetrics(connected);

  const rows: { labelKey: string; value: string | null; tone?: 'ok' | 'error' | 'warn' }[] = [
    { labelKey: 'metricVbus', value: metrics.vbus },
    {
      labelKey: 'metricAxisState',
      value: stateLabel(locale, metrics.axisState),
      tone: metrics.axisState === '8' ? 'ok' : metrics.axisState === '1' ? 'warn' : undefined,
    },
    { labelKey: 'metricIqMotor', value: metrics.iq },
    { labelKey: 'metricFfbTorque', value: metrics.torque },
    {
      labelKey: 'metricErrors',
      value: metrics.errorOk === null
        ? null
        : metrics.errorOk
          ? translate(locale, 'metricErrorsOk')
          : translate(locale, 'metricErrorsActive'),
      tone: metrics.errorOk === null ? undefined : metrics.errorOk ? 'ok' : 'error',
    },
  ];

  return (
    <div className="dashboard-metrics">
      {rows.map((row) => (
        <MetricRow key={row.labelKey} label={translate(locale, row.labelKey)} value={row.value} tone={row.tone} emptyLabel={translate(locale, 'metricEmpty')} />
      ))}
    </div>
  );
}

function MetricRow({
  label,
  value,
  tone,
  emptyLabel,
}: {
  label: string;
  value: string | null;
  tone?: 'ok' | 'error' | 'warn';
  emptyLabel: string;
}) {
  const color =
    tone === 'ok' ? 'var(--ok)'
    : tone === 'error' ? 'var(--error)'
    : tone === 'warn' ? 'var(--warn)'
    : 'var(--text)';

  return (
    <div className="dashboard-metric-row">
      <span className="dashboard-metric-label">{label}</span>
      <strong className="dashboard-metric-value" style={{ color }}>
        {value ?? emptyLabel}
      </strong>
    </div>
  );
}
