import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate, type Locale } from '../../i18n/messages';
import { serialService } from '../serial/SerialService';
import { Card, Pill } from '../../shared/ui';
import { decodeErr, ERROR_REGISTERS, type DecodedError } from './errorDecoder';
import {
  DEVICE_INFO_FIELDS,
  DIAG_CMDS,
  LIVE_MONITOR_FIELDS,
  LIVE_MONITOR_GROUP_ORDER,
  type LiveMonitorGroup,
} from './liveMonitorCatalog';
import { usePageVisible } from '../../shared/usePageVisible';
import { deviceInfoTone, formatLiveValue, liveValueTone, parseLiveRaw } from './liveMonitorFormat';

type ErrorMap = Record<string, DecodedError>;
type LiveMap = Record<string, string>;
type DiagMap = Record<string, string>;
type DeviceMap = Record<string, string>;

const GROUP_TITLE_KEYS: Record<LiveMonitorGroup, string> = {
  power: 'liveGroupPower',
  axis: 'liveGroupAxis',
  motor: 'liveGroupMotor',
  encoder: 'liveGroupEncoder',
  controller: 'liveGroupController',
  ffb: 'liveGroupFfb',
  system: 'liveGroupSystem',
};

async function readOdriveProp(path: string): Promise<string> {
  return serialService.sendCommand(`r ${path}`, true, 2500, false);
}

const DIAG_MAX_CHARS = 2048;
const AUTO_POLL_MIN_MS = 1000;
const DEVICE_INFO_EVERY = 6;

function truncateDiag(raw: string): string {
  if (raw.length <= DIAG_MAX_CHARS) return raw;
  return `${raw.slice(0, DIAG_MAX_CHARS)}…`;
}

interface LiveDebugPageProps {
  onAutoPollChange?: (active: boolean) => void;
}

export function LiveDebugPage({ onAutoPollChange }: LiveDebugPageProps = {}) {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const pageVisible = usePageVisible();

  const [errors, setErrors] = useState<ErrorMap>({});
  const [live, setLive] = useState<LiveMap>({});
  const [device, setDevice] = useState<DeviceMap>({});
  const [diag, setDiag] = useState<DiagMap>({});
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const [autoPoll, setAutoPoll] = useState(false);
  const [pollIntervalMs, setPollIntervalMs] = useState(1000);

  const inFlight = useRef(false);
  const autoPollCountRef = useRef(0);

  const pollErrors = useCallback(async () => {
    const next: ErrorMap = {};
    for (const entry of ERROR_REGISTERS) {
      try {
        const raw = await serialService.sendCommand(entry.command, true, 2500, false);
        next[entry.id] = decodeErr(raw, entry.map);
      } catch {
        next[entry.id] = { raw: '?', hex: '?', value: 0, bits: [translate(locale, 'liveTimeoutBit')], ok: false };
      }
    }
    setErrors(next);
  }, [locale]);

  const pollDeviceInfo = useCallback(async () => {
    const next: DeviceMap = {};
    try {
      const [fwMaj, fwMin, fwRev] = await Promise.all([
        readOdriveProp('fw_version_major'),
        readOdriveProp('fw_version_minor'),
        readOdriveProp('fw_version_revision'),
      ]);
      next.fw = [fwMaj, fwMin, fwRev].map((v) => parseLiveRaw(v) || '?').join('.');
    } catch {
      next.fw = '?';
    }

    try {
      const [hwMaj, hwMin, hwVar] = await Promise.all([
        readOdriveProp('hw_version_major'),
        readOdriveProp('hw_version_minor'),
        readOdriveProp('hw_version_variant'),
      ]);
      next.hw = `${parseLiveRaw(hwMaj) || '?'}.${parseLiveRaw(hwMin) || '?'}-${parseLiveRaw(hwVar) || '?'}V`;
    } catch {
      next.hw = '?';
    }

    try {
      next.sn = parseLiveRaw(await readOdriveProp('serial_number')) || '—';
    } catch {
      next.sn = '?';
    }

    try {
      next.ucl = parseLiveRaw(await readOdriveProp('user_config_loaded')) || '—';
    } catch {
      next.ucl = '?';
    }

    setDevice(next);
  }, []);

  const pollLive = useCallback(async () => {
    const next: LiveMap = {};
    for (const field of LIVE_MONITOR_FIELDS) {
      try {
        next[field.id] = await serialService.sendCommand(field.cmd, true, 2000, false);
      } catch {
        next[field.id] = '?';
      }
    }
    setLive(next);
  }, []);

  const pollDiag = useCallback(async () => {
    const next: DiagMap = {};
    for (const cmd of DIAG_CMDS) {
      try {
        const raw = await serialService.sendCommand(cmd, true, 2000, false);
        next[cmd] = truncateDiag(raw);
      } catch {
        next[cmd] = '-';
      }
    }
    setDiag(next);
  }, []);

  const pollFast = useCallback(async () => {
    await pollErrors();
    await pollLive();
  }, [pollErrors, pollLive]);

  const pollAll = useCallback(
    async (options?: { includeDiag?: boolean; includeDevice?: boolean }) => {
      if (!state.connected || inFlight.current || state.busy) return;
      inFlight.current = true;
      try {
        if (options?.includeDevice) {
          await pollDeviceInfo();
        }
        await pollFast();
        if (options?.includeDiag) {
          await pollDiag();
        }
        setLastPoll(new Date());
      } finally {
        inFlight.current = false;
      }
    },
    [pollDeviceInfo, pollDiag, pollFast, state.busy, state.connected],
  );

  useEffect(() => {
    onAutoPollChange?.(autoPoll && pageVisible);
  }, [autoPoll, onAutoPollChange, pageVisible]);

  useEffect(() => {
    if (!state.connected || !autoPoll || !pageVisible || state.busy) return undefined;
    autoPollCountRef.current = 0;
    void pollAll({ includeDevice: true });
    const id = window.setInterval(() => {
      autoPollCountRef.current += 1;
      const includeDevice = autoPollCountRef.current % DEVICE_INFO_EVERY === 0;
      void pollAll({ includeDevice });
    }, Math.max(pollIntervalMs, AUTO_POLL_MIN_MS));
    return () => window.clearInterval(id);
  }, [autoPoll, pageVisible, pollAll, pollIntervalMs, state.busy, state.connected]);

  useEffect(() => {
    if (!state.connected) {
      setErrors({});
      setLive({});
      setDevice({});
      setDiag({});
      setLastPoll(null);
    }
  }, [state.connected]);

  async function manualPoll() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      await pollAll({ includeDiag: true, includeDevice: true });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  const hasAnyError = Object.values(errors).some((e) => !e.ok);
  const errorCount = Object.values(errors).filter((e) => !e.ok).length;
  const errorPill = hasAnyError
    ? translate(locale, 'liveErrorCount', { n: errorCount })
    : Object.keys(errors).length > 0
      ? translate(locale, 'liveNoErrors')
      : translate(locale, 'liveEmptyValue');
  const errorTone: 'ok' | 'error' | 'neutral' = hasAnyError ? 'error' : Object.keys(errors).length > 0 ? 'ok' : 'neutral';

  return (
    <>
      <Card title={translate(locale, 'liveDebugDeviceTitle')} description={translate(locale, 'liveDebugDeviceDescription')}>
        <div className="live-card-toolbar">
          <button type="button" disabled={!state.connected || state.busy} onClick={() => void pollDeviceInfo()}>
            {translate(locale, 'liveDebugReadDevice')}
          </button>
        </div>
        <div className="live-monitor-grid">
          {DEVICE_INFO_FIELDS.map((entry) => {
            const value = device[entry.id] ?? translate(locale, 'liveEmptyValue');
            const tone = device[entry.id] ? deviceInfoTone(entry.id, device[entry.id]) : undefined;
            return (
              <LiveKv
                key={entry.id}
                label={translate(locale, entry.labelKey)}
                value={value}
                tone={tone}
              />
            );
          })}
        </div>
      </Card>

      <Card title={translate(locale, 'liveDebugErrorsTitle')} description={translate(locale, 'liveDebugErrorsDescription')}>
        <div className="live-card-toolbar">
          <Pill tone={errorTone}>{errorPill}</Pill>
        </div>
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

      <Card title={translate(locale, 'liveDebugMonitorTitle')} description={translate(locale, 'liveDebugMonitorDescription')}>
        <div className="live-poll-controls live-card-toolbar">
            <span className={`live-poll-dot${autoPoll && state.connected ? ' on' : ''}`} aria-hidden />
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={autoPoll}
                disabled={!state.connected}
                onChange={(event) => setAutoPoll(event.target.checked)}
              />
              {translate(locale, 'liveDebugAutoPoll')}
            </label>
            <input
              type="number"
              className="live-poll-interval"
              min={AUTO_POLL_MIN_MS}
              max={5000}
              step={100}
              value={pollIntervalMs}
              disabled={!state.connected}
              onChange={(event) => setPollIntervalMs(Math.max(AUTO_POLL_MIN_MS, Number(event.target.value) || AUTO_POLL_MIN_MS))}
            />
            <span className="live-poll-ms">ms</span>
            <button type="button" disabled={!state.connected || state.busy} onClick={() => void manualPoll()}>
              {translate(locale, 'liveDebugPollNow')}
            </button>
            {lastPoll ? (
              <span className="live-poll-time">{lastPoll.toLocaleTimeString()}</span>
            ) : null}
        </div>
        {LIVE_MONITOR_GROUP_ORDER.map((group) => {
          const fields = LIVE_MONITOR_FIELDS.filter((field) => field.group === group);
          if (fields.length === 0) return null;
          return (
            <div key={group} className="live-monitor-group">
              <div className="live-monitor-group-title">{translate(locale, GROUP_TITLE_KEYS[group])}</div>
              <div className="live-monitor-grid">
                {fields.map((field) => {
                  const raw = live[field.id];
                  const tone = liveValueTone(raw, field.format);
                  return (
                    <LiveKv
                      key={field.id}
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
      </Card>

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

      <Card title={translate(locale, 'liveDebugCalLinkTitle')} description={translate(locale, 'liveDebugCalLinkDesc')}>
        <button type="button" onClick={() => dispatch({ type: 'set-tab', tab: 'calibration' })}>
          {translate(locale, 'liveDebugOpenCalibration')}
        </button>
      </Card>
    </>
  );
}

function LiveKv({
  label,
  sub,
  value,
  tone,
}: {
  label: string;
  sub?: string;
  value: string;
  tone?: 'ok' | 'warn' | 'error';
}) {
  const color =
    tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'error' ? 'var(--error)' : 'var(--text)';
  return (
    <div className="live-kv-card">
      <span className="live-kv-label">{label}</span>
      {sub ? <code className="live-kv-cmd">{sub}</code> : null}
      <code className="live-kv-value" style={{ color }}>
        {value}
      </code>
    </div>
  );
}

function ErrorRow({
  locale,
  label,
  command,
  decoded,
}: {
  locale: Locale;
  label: string;
  command: string;
  decoded: DecodedError | undefined;
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
        {decoded ? (
          <code style={{ fontSize: 10, fontFamily: 'var(--mono)', color: decoded.ok ? 'var(--muted)' : 'var(--error)' }}>
            {decoded.hex}
          </code>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'flex-end' }}>
        {decoded === undefined ? (
          <span style={{ color: 'var(--muted-2)', fontSize: 11 }}>{translate(locale, 'liveEmptyValue')}</span>
        ) : decoded.ok ? (
          <span style={{ color: 'var(--ok)', fontSize: 11 }}>{translate(locale, 'liveNoErrors')}</span>
        ) : (
          decoded.bits.map((bit) => (
            <span key={bit} className="live-error-bit">
              {bit}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
