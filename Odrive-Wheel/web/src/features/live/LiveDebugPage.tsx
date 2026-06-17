import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { serialService } from '../serial/SerialService';
import { Card, Pill } from '../../shared/ui';
import { decodeErr, ERROR_REGISTERS, type DecodedError } from './errorDecoder';

/* ── Live monitor fields ───────────────────────────────────────────────── */
const LIVE_FIELDS: { label: string; cmd: string; mono?: boolean }[] = [
  { label: 'Axis state',         cmd: 'r axis0.current_state',               mono: true },
  { label: 'Motor calibrated',   cmd: 'r axis0.motor.is_calibrated',         mono: true },
  { label: 'Encoder ready',      cmd: 'r axis0.encoder.is_ready',            mono: true },
  { label: 'Encoder pos',        cmd: 'r axis0.encoder.pos_estimate',        mono: true },
  { label: 'Iq measured (A)',    cmd: 'r axis0.motor.current_control.Iq_measured', mono: true },
  { label: 'Torque setpoint',    cmd: 'r axis0.controller.input_torque',     mono: true },
  { label: 'Wheel pos (deg)',    cmd: 'axis.curpos?',                         mono: true },
  { label: 'Wheel speed (°/s)',  cmd: 'axis.curspd?',                         mono: true },
  { label: 'FFB torque',         cmd: 'axis.curtorque?',                      mono: true },
  { label: 'VBUS (V)',           cmd: 'r vbus_voltage',                       mono: true },
  { label: 'Firmware',           cmd: 'sys.swver?',                           mono: true },
  { label: 'Free heap',          cmd: 'sys.heap?',                            mono: true },
];

/* ── Board action buttons ──────────────────────────────────────────────── */
const ACTIONS: { label: string; sub: string; cmd: string; tone?: 'warn' | 'danger' | 'ok' }[] = [
  { label: 'IDLE',            sub: 'w axis0.requested_state 1', cmd: 'w axis0.requested_state 1', tone: 'warn' },
  { label: 'MOTOR CAL',       sub: 'w axis0.requested_state 4', cmd: 'w axis0.requested_state 4', tone: 'warn' },
  { label: 'ENCODER CAL',     sub: 'w axis0.requested_state 7', cmd: 'w axis0.requested_state 7', tone: 'warn' },
  { label: 'CLOSED LOOP',     sub: 'w axis0.requested_state 8', cmd: 'w axis0.requested_state 8', tone: 'ok' },
  { label: 'Clear errors',    sub: 'sc',                         cmd: 'sc' },
];

/* ── Raw diagnostic commands (FFB counters) ────────────────────────────── */
const DIAG_CMDS = ['d', 'D', 'C', 'T'];

type ErrorMap = Record<string, DecodedError>;
type LiveMap  = Record<string, string>;
type DiagMap  = Record<string, string>;

export function LiveDebugPage() {
  const { state, dispatch } = useAppState();

  const [errors, setErrors]   = useState<ErrorMap>({});
  const [live, setLive]       = useState<LiveMap>({});
  const [diag, setDiag]       = useState<DiagMap>({});
  const [lastPoll, setLastPoll] = useState<Date | null>(null);

  const inFlight = useRef(false);

  const pollErrors = useCallback(async () => {
    const next: ErrorMap = {};
    for (const entry of ERROR_REGISTERS) {
      try {
        const raw = await serialService.sendCommand(entry.command, true, 2500);
        next[entry.id] = decodeErr(raw, entry.map);
      } catch {
        next[entry.id] = { raw: '?', hex: '?', value: 0, bits: ['(timeout)'], ok: false };
      }
    }
    setErrors(next);
  }, []);

  const pollLive = useCallback(async () => {
    const next: LiveMap = {};
    for (const field of LIVE_FIELDS) {
      try {
        next[field.cmd] = await serialService.sendCommand(field.cmd, true, 2000);
      } catch {
        next[field.cmd] = '-';
      }
    }
    setLive(next);
  }, []);

  const pollDiag = useCallback(async () => {
    const next: DiagMap = {};
    for (const cmd of DIAG_CMDS) {
      try {
        next[cmd] = await serialService.sendCommand(cmd, true, 2000);
      } catch {
        next[cmd] = '-';
      }
    }
    setDiag(next);
  }, []);

  const pollAll = useCallback(async () => {
    if (!state.connected || inFlight.current) {
      return;
    }
    inFlight.current = true;
    try {
      await pollErrors();
      await pollLive();
      await pollDiag();
      setLastPoll(new Date());
    } finally {
      inFlight.current = false;
    }
  }, [state.connected, pollErrors, pollLive, pollDiag]);

  useEffect(() => {
    if (!state.connected || !state.autoRefresh || state.busy) {
      return undefined;
    }
    void pollAll();
    const interval = Math.max(state.refreshIntervalMs, 3000);
    const id = window.setInterval(() => void pollAll(), interval);
    return () => window.clearInterval(id);
  }, [state.autoRefresh, state.busy, state.connected, state.refreshIntervalMs, pollAll]);

  async function manualPoll() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      await pollAll();
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function runAction(cmd: string) {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const reply = await serialService.sendCommand(cmd, true, 4000);
      dispatch({ type: 'append-log', direction: 'info', message: `${cmd} → ${reply}` });
      // Re-poll errors after state change
      await new Promise<void>((res) => setTimeout(res, 600));
      await pollErrors();
      await pollLive();
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  const hasAnyError = Object.values(errors).some((e) => !e.ok);
  const errorCount  = Object.values(errors).filter((e) => !e.ok).length;

  return (
    <div className="page-stack">
      {/* ── Header / controls ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={!state.connected || state.busy}
          onClick={() => void manualPoll()}
        >
          ↻ Atualizar diagnóstico
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          {state.autoRefresh
            ? `Auto a cada ${Math.max(state.refreshIntervalMs, 3000) / 1000}s`
            : 'Auto refresh desativado'}
        </span>
        {lastPoll && (
          <span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>
            Última leitura: {lastPoll.toLocaleTimeString()}
          </span>
        )}
        <Pill tone={hasAnyError ? 'error' : errorCount === 0 && Object.keys(errors).length > 0 ? 'ok' : 'neutral'}>
          {hasAnyError
            ? `${errorCount} registro${errorCount > 1 ? 's' : ''} com erro`
            : Object.keys(errors).length > 0
            ? 'Sem erros ativos'
            : 'Aguardando leitura'}
        </Pill>
      </div>

      {/* ── Actions ───────────────────────────────────────────────────── */}
      <Card title="Ações — state machine / NVM" description="Controles diretos de estado do ODrive. Use com cuidado.">
        <div className="quick-actions-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          {ACTIONS.map((action) => (
            <button
              key={action.cmd}
              type="button"
              disabled={!state.connected || state.busy}
              className={action.tone === 'danger' ? 'danger' : action.tone === 'ok' ? 'ok' : ''}
              style={{ display: 'grid', gap: 3, textAlign: 'left', minHeight: 60, padding: '8px 10px' }}
              onClick={() => void runAction(action.cmd)}
            >
              <strong style={{ fontSize: 13 }}>{action.label}</strong>
              <code style={{ fontSize: 10, color: 'var(--muted-2)' }}>{action.sub}</code>
            </button>
          ))}
        </div>
      </Card>

      {/* ── Error registers ───────────────────────────────────────────── */}
      <Card
        title="Registros de erro (decodificados)"
        description="Bitmasks do ODrive lidos e decodificados por nome de flag."
      >
        <div
          style={{
            display: 'grid',
            gap: 6,
          }}
        >
          {ERROR_REGISTERS.map((entry) => {
            const decoded = errors[entry.id];
            return (
              <ErrorRow
                key={entry.id}
                label={entry.label}
                command={entry.command}
                decoded={decoded}
              />
            );
          })}
          {Object.keys(errors).length === 0 && (
            <p className="muted" style={{ fontSize: 12, margin: 0, padding: '8px 0' }}>
              Clique em "Atualizar diagnóstico" para ler os registros de erro.
            </p>
          )}
        </div>
      </Card>

      {/* ── Live monitor ──────────────────────────────────────────────── */}
      <Card title="Monitor ao vivo" description="Valores chave lidos sob demanda ou com auto-refresh.">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 6,
          }}
        >
          {LIVE_FIELDS.map((field) => {
            const value = live[field.cmd];
            const isOk  = value === 'True'  || value === '1' || value === 'true';
            const isErr = value === 'False' || value === '0' || value === 'false';
            return (
              <div
                key={field.cmd}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '4px 8px',
                  padding: '8px 10px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                }}
              >
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>{field.label}</span>
                <code
                  style={{
                    fontSize: 12,
                    textAlign: 'right',
                    color: isOk ? 'var(--ok)' : isErr ? 'var(--error)' : 'var(--text)',
                    fontFamily: 'var(--mono)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {value ?? '-'}
                </code>
                <code
                  style={{
                    gridColumn: '1 / -1',
                    fontSize: 10,
                    color: 'var(--muted-2)',
                    fontFamily: 'var(--mono)',
                  }}
                >
                  {field.cmd}
                </code>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Raw diagnostic commands ───────────────────────────────────── */}
      <Card title="Diagnóstico FFB / raw" description="Contadores e dumps do OpenFFBoard: d, D, C, T.">
        <div className="debug-grid">
          {DIAG_CMDS.map((cmd) => (
            <div key={cmd} className="debug-cell">
              <code>{cmd}</code>
              <pre style={{ margin: 0, fontSize: 11, overflowX: 'auto' }}>
                {diag[cmd] ?? '-'}
              </pre>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ── ErrorRow sub-component ─────────────────────────────────────────────── */
function ErrorRow({
  label,
  command,
  decoded,
}: {
  label: string;
  command: string;
  decoded: DecodedError | undefined;
}) {
  const tone = decoded === undefined ? 'neutral' : decoded.ok ? 'ok' : 'error';
  const valueColor = decoded === undefined
    ? 'var(--muted-2)'
    : decoded.ok
    ? 'var(--ok)'
    : 'var(--error)';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'max-content 110px 1fr',
        gap: '0 10px',
        alignItems: 'start',
        padding: '9px 10px',
        border: `1px solid ${decoded && !decoded.ok ? 'color-mix(in srgb, var(--error) 35%, transparent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        background: decoded && !decoded.ok
          ? 'color-mix(in srgb, var(--error) 6%, var(--surface-2))'
          : 'var(--surface-2)',
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{label}</div>
        <code style={{ fontSize: 10, color: 'var(--muted-2)' }}>{command}</code>
      </div>

      <div style={{ display: 'grid', gap: 2 }}>
        <Pill tone={tone}>
          {decoded === undefined ? '-' : decoded.ok ? 'OK' : 'ERROR'}
        </Pill>
        {decoded && (
          <code style={{ fontSize: 10, fontFamily: 'var(--mono)', color: valueColor }}>
            {decoded.hex}
          </code>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {decoded === undefined ? (
          <span style={{ color: 'var(--muted-2)', fontSize: 11 }}>—</span>
        ) : decoded.ok ? (
          <span style={{ color: 'var(--ok)', fontSize: 11 }}>Sem erros</span>
        ) : (
          decoded.bits.map((bit) => (
            <span
              key={bit}
              style={{
                padding: '2px 6px',
                border: '1px solid color-mix(in srgb, var(--error) 35%, transparent)',
                borderRadius: 999,
                fontSize: 11,
                color: 'var(--error)',
                background: 'color-mix(in srgb, var(--error) 8%, var(--surface))',
                fontFamily: 'var(--mono)',
                fontWeight: 600,
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
