import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate, type Locale } from '../../i18n/messages';
import { axisStateLabel } from '../../i18n/fieldMeta';
import { serialService } from '../serial/SerialService';
import { Card, Pill, SectionHeader } from '../../shared/ui';
import { decodeErr, ERROR_REGISTERS, type DecodedError } from './errorDecoder';
import { CalibrationActionGrid } from '../calibration/CalibrationActionGrid';

/* ── Value normalization ─────────────────────────────────────────────────── */
// OpenFFBoard replies to its own commands with "[command|value]".
// ODrive replies with plain decimals. This extracts the actual value either way.
function parseValue(locale: Locale, raw: string | undefined): string {
  if (!raw) return translate(locale, 'liveEmptyValue');
  // "[axis.curpos?|-401.40]" → "-401.40"
  const bracketed = raw.match(/\|([^\]]+)\]$/);
  if (bracketed) return bracketed[1].trim();
  return raw.trim();
}

function formatValue(locale: Locale, raw: string | undefined, cmd: string): string {
  const v = parseValue(locale, raw);
  if (cmd === 'r axis0.current_state') {
    const label = axisStateLabel(locale, v);
    return label !== v ? `${v}  (${label})` : v;
  }
  if (cmd === 'r axis0.motor.is_calibrated' || cmd === 'r axis0.encoder.is_ready') {
    return v === '1' ? translate(locale, 'liveValueTrue') : v === '0' ? translate(locale, 'liveValueFalse') : v;
  }
  return v;
}

function valueTone(raw: string | undefined, cmd: string): 'ok' | 'error' | undefined {
  const v = raw?.match(/\|([^\]]+)\]$/)?.[1]?.trim() ?? raw?.trim();
  if (cmd === 'r axis0.motor.is_calibrated' || cmd === 'r axis0.encoder.is_ready') {
    return v === '1' ? 'ok' : v === '0' ? 'error' : undefined;
  }
  if (cmd === 'r axis0.current_state') {
    return v === '8' ? 'ok' : v === '1' ? undefined : undefined;
  }
  return undefined;
}

/* ── Live monitor fields ─────────────────────────────────────────────────── */
const LIVE_FIELDS: { labelKey: string; cmd: string }[] = [
  { labelKey: 'liveFieldAxisState',         cmd: 'r axis0.current_state' },
  { labelKey: 'liveFieldMotorCalibrated',   cmd: 'r axis0.motor.is_calibrated' },
  { labelKey: 'liveFieldEncoderReady',      cmd: 'r axis0.encoder.is_ready' },
  { labelKey: 'liveFieldEncoderPos',        cmd: 'r axis0.encoder.pos_estimate' },
  { labelKey: 'liveFieldIqMeasured',        cmd: 'r axis0.motor.current_control.Iq_measured' },
  { labelKey: 'liveFieldTorqueSetpoint',    cmd: 'r axis0.controller.input_torque' },
  { labelKey: 'liveFieldWheelPosition',     cmd: 'axis.curpos?' },
  { labelKey: 'liveFieldVelocity',          cmd: 'axis.curspd?' },
  { labelKey: 'liveFieldFfbTorque',         cmd: 'axis.curtorque?' },
  { labelKey: 'liveFieldVbus',              cmd: 'r vbus_voltage' },
  { labelKey: 'liveFieldFirmware',          cmd: 'sys.swver?' },
  { labelKey: 'liveFieldFreeHeap',          cmd: 'sys.heap?' },
];

const DIAG_CMDS = ['d', 'D', 'C', 'T', 'E', 'I'];

/* ── Actions: full calibration grid in CalibrationActionGrid ─────────────── */

type ErrorMap = Record<string, DecodedError>;
type LiveMap  = Record<string, string>;
type DiagMap  = Record<string, string>;

export function LiveDebugPage() {
  const { state, dispatch } = useAppState();
  const locale = state.locale;

  const [errors, setErrors]     = useState<ErrorMap>({});
  const [live, setLive]         = useState<LiveMap>({});
  const [diag, setDiag]         = useState<DiagMap>({});
  const [lastPoll, setLastPoll] = useState<Date | null>(null);

  const inFlight = useRef(false);

  const pollErrors = useCallback(async (log = false) => {
    const next: ErrorMap = {};
    for (const entry of ERROR_REGISTERS) {
      try {
        const raw = await serialService.sendCommand(entry.command, true, 2500, log);
        next[entry.id] = decodeErr(raw, entry.map);
      } catch {
        next[entry.id] = { raw: '?', hex: '?', value: 0, bits: [translate(locale, 'liveTimeoutBit')], ok: false };
      }
    }
    setErrors(next);
  }, [locale]);

  const pollLive = useCallback(async (log = false) => {
    const next: LiveMap = {};
    for (const field of LIVE_FIELDS) {
      try { next[field.cmd] = await serialService.sendCommand(field.cmd, true, 2000, log); }
      catch { next[field.cmd] = '?'; }
    }
    setLive(next);
  }, []);

  const pollDiag = useCallback(async (log = false) => {
    const next: DiagMap = {};
    for (const cmd of DIAG_CMDS) {
      try { next[cmd] = await serialService.sendCommand(cmd, true, 2000, log); }
      catch { next[cmd] = '-'; }
    }
    setDiag(next);
  }, []);

  const pollAll = useCallback(async (log = false) => {
    if (!state.connected || inFlight.current) return;
    inFlight.current = true;
    try {
      await pollErrors(log);
      await pollLive(log);
      await pollDiag(log);
      setLastPoll(new Date());
    } finally {
      inFlight.current = false;
    }
  }, [state.connected, pollErrors, pollLive, pollDiag]);

  useEffect(() => {
    if (!state.connected || !state.autoRefresh || state.busy) return undefined;
    void pollAll();
    const interval = Math.max(state.refreshIntervalMs, 3000);
    const id = window.setInterval(() => void pollAll(), interval);
    return () => window.clearInterval(id);
  }, [state.autoRefresh, state.busy, state.connected, state.refreshIntervalMs, pollAll]);

  async function manualPoll() {
    dispatch({ type: 'set-busy', busy: true });
    try { await pollAll(true); }
    finally { dispatch({ type: 'set-busy', busy: false }); }
  }

  const hasAnyError  = Object.values(errors).some((e) => !e.ok);
  const errorCount   = Object.values(errors).filter((e) => !e.ok).length;
  const errorPill    = hasAnyError
    ? translate(locale, 'liveErrorCount', { n: errorCount })
    : Object.keys(errors).length > 0 ? translate(locale, 'liveNoErrors') : translate(locale, 'liveEmptyValue');
  const errorTone: 'ok' | 'error' | 'neutral' = hasAnyError ? 'error'
    : Object.keys(errors).length > 0 ? 'ok' : 'neutral';

  return (
    <div className="page-stack">
      {/* ── Section header ────────────────────────────────────────────── */}
      <SectionHeader
        eyebrow={translate(locale, 'tabDashboard')}
        title={translate(locale, 'liveDebugTitle')}
        description={translate(locale, 'liveDebugDescription')}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {lastPoll && (
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                {lastPoll.toLocaleTimeString()}
              </span>
            )}
            <Pill tone={errorTone}>{errorPill}</Pill>
            <button
              type="button"
              disabled={!state.connected || state.busy}
              onClick={() => void manualPoll()}
            >
              {translate(locale, 'liveDebugRefreshAll')}
            </button>
          </div>
        }
      />

      <CalibrationActionGrid showResults />

      {/* ── Error registers ───────────────────────────────────────────── */}
      <Card title={translate(locale, 'liveDebugErrorsTitle')} description={translate(locale, 'liveDebugErrorsDescription')}>
        <div style={{ display: 'grid', gap: 5 }}>
          {ERROR_REGISTERS.map((entry) => (
            <ErrorRow key={entry.id} locale={locale} label={entry.label} command={entry.command} decoded={errors[entry.id]} />
          ))}
          {Object.keys(errors).length === 0 && (
            <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0, padding: '8px 0' }}>
              {translate(locale, 'liveDebugErrorsEmpty')}
            </p>
          )}
        </div>
      </Card>

      {/* ── Live monitor ──────────────────────────────────────────────── */}
      <Card title={translate(locale, 'liveDebugMonitorTitle')} description={translate(locale, 'liveDebugMonitorDescription')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 5 }}>
          {LIVE_FIELDS.map((field) => {
            const tone = valueTone(live[field.cmd], field.cmd);
            const color = tone === 'ok' ? 'var(--ok)' : tone === 'error' ? 'var(--error)' : 'var(--text)';
            return (
              <div
                key={field.cmd}
                style={{
                  padding: '8px 10px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  display: 'grid',
                  gap: 4,
                }}
              >
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>{translate(locale, field.labelKey)}</span>
                <code style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color }}>
                  {formatValue(locale, live[field.cmd], field.cmd)}
                </code>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Raw diagnostic ────────────────────────────────────────────── */}
      <Card title={translate(locale, 'liveDebugDiagTitle')} description={translate(locale, 'liveDebugDiagDescription')}>
        <div className="debug-grid">
          {DIAG_CMDS.map((cmd) => (
            <div key={cmd} className="debug-cell">
              <code>{cmd}</code>
              <pre style={{ margin: 0, fontSize: 11, overflowX: 'auto' }}>{diag[cmd] ?? translate(locale, 'liveEmptyValue')}</pre>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ── ErrorRow ────────────────────────────────────────────────────────────── */
function ErrorRow({ locale, label, command, decoded }: {
  locale: Locale;
  label: string; command: string; decoded: DecodedError | undefined;
}) {
  const tone = decoded === undefined ? 'neutral' : decoded.ok ? 'ok' : 'error';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 80px auto',
        gap: '0 10px',
        alignItems: 'center',
        padding: '8px 10px',
        border: `1px solid ${decoded && !decoded.ok ? 'color-mix(in srgb, var(--error) 35%, transparent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        background: decoded && !decoded.ok
          ? 'color-mix(in srgb, var(--error) 6%, var(--surface-2))'
          : 'var(--surface-2)',
      }}
    >
      <div>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
        <code style={{ fontSize: 10, color: 'var(--muted-2)' }}>{command}</code>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
        <Pill tone={tone}>
          {decoded === undefined
            ? translate(locale, 'liveEmptyValue')
            : decoded.ok
            ? translate(locale, 'liveErrorOk')
            : translate(locale, 'liveErrorActive')}
        </Pill>
        {decoded && (
          <code style={{ fontSize: 10, fontFamily: 'var(--mono)', color: decoded.ok ? 'var(--muted)' : 'var(--error)' }}>
            {decoded.hex}
          </code>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'flex-end' }}>
        {decoded === undefined ? (
          <span style={{ color: 'var(--muted-2)', fontSize: 11 }}>{translate(locale, 'liveEmptyValue')}</span>
        ) : decoded.ok ? (
          <span style={{ color: 'var(--ok)', fontSize: 11 }}>{translate(locale, 'liveNoErrors')}</span>
        ) : (
          decoded.bits.map((bit) => (
            <span
              key={bit}
              style={{
                padding: '2px 6px', borderRadius: 999, fontSize: 10,
                color: 'var(--error)',
                border: '1px solid color-mix(in srgb, var(--error) 35%, transparent)',
                background: 'color-mix(in srgb, var(--error) 8%, var(--surface))',
                fontFamily: 'var(--mono)', fontWeight: 600,
              }}
            >
              {bit}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
