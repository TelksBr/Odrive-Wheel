import { useState, type ReactNode } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { persistFfbEeprom } from '../board/fieldApply';
import { Card } from '../../shared/ui';
import type { CalibrationAxisAction, SetupErrorField } from './calibrationActions';
import { readEncoderCalResults, readMotorCalResults, runAxisState } from './calibrationRunner';
import { CalErrorPanel } from './CalErrorPanel';
import { applyBootPersist, type BootPersistEntry } from './calibrationBootPresets';

interface CalibrationSectionProps {
  titleKey: string;
  descriptionKey: string;
  prereqKey?: string;
  action?: CalibrationAxisAction;
  errorFields?: SetupErrorField[];
  bootPersist?: BootPersistEntry[];
  eepromSave?: boolean;
  showMotorResults?: boolean;
  showEncoderResults?: boolean;
  children?: ReactNode;
}

export function CalibrationSection({
  titleKey,
  descriptionKey,
  prereqKey,
  action,
  errorFields,
  bootPersist,
  eepromSave = false,
  showMotorResults = false,
  showEncoderResults = false,
  children,
}: CalibrationSectionProps) {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const [running, setRunning] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [errorRefreshKey, setErrorRefreshKey] = useState(0);
  const [motorResults, setMotorResults] = useState<{ resistance: string | null; inductance: string | null } | null>(
    null,
  );
  const [encoderResults, setEncoderResults] = useState<{
    phaseOffset: string | null;
    phaseOffsetFloat: string | null;
    isReady: string | null;
  } | null>(null);

  async function handleRun() {
    if (!action) {
      return;
    }
    setRunning(true);
    dispatch({ type: 'set-busy', busy: true });
    try {
      const result = await runAxisState(action.state, action.timeoutMs, action.clearFirst !== false);
      const msg = result.ok
        ? translate(locale, 'setupToastStateDone')
        : `${translate(locale, 'setupToastStateFail')} (${result.reason ?? 'unknown'})`;
      dispatch({ type: 'append-log', direction: result.ok ? 'info' : 'error', message: msg });
      setShowErrors(true);
      setErrorRefreshKey((key) => key + 1);
      if (result.ok) {
        dispatch({ type: 'set-nvm-pending', pending: true });
        dispatch({
          type: 'append-log',
          direction: 'info',
          message: translate(locale, 'calNvmPendingAfterCal'),
        });
        dispatch({
          type: 'append-log',
          direction: 'info',
          message: translate(locale, 'calAfterCalBootHint'),
        });
      }
      if (showMotorResults && result.ok) {
        setMotorResults(await readMotorCalResults());
      }
      if (showEncoderResults && result.ok) {
        const enc = await readEncoderCalResults();
        setEncoderResults(enc);
        if (enc.phaseOffset) {
          dispatch({ type: 'set-field', path: 'axis0.encoder.config.phase_offset', value: enc.phaseOffset, dirty: false });
        }
        if (enc.phaseOffsetFloat) {
          dispatch({
            type: 'set-field',
            path: 'axis0.encoder.config.phase_offset_float',
            value: enc.phaseOffsetFloat,
            dirty: false,
          });
        }
        if (enc.isReady) {
          dispatch({ type: 'set-field', path: 'axis0.encoder.is_ready', value: enc.isReady, dirty: false });
        }
      }
    } catch (error) {
      dispatch({
        type: 'append-log',
        direction: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRunning(false);
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function handleBootPersist() {
    if (!bootPersist?.length) {
      return;
    }
    dispatch({ type: 'set-busy', busy: true });
    try {
      const { ok, fail } = await applyBootPersist(bootPersist, dispatch);
      dispatch({
        type: 'append-log',
        direction: fail === 0 ? 'info' : 'error',
        message: translate(locale, 'calBootApplied', { ok: String(ok), fail: String(fail) }),
      });
      if (fail === 0) {
        dispatch({ type: 'set-nvm-pending', pending: true });
      }
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function handleEepromSave() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const ok = await persistFfbEeprom();
      dispatch({
        type: 'append-log',
        direction: ok ? 'info' : 'error',
        message: translate(locale, ok ? 'applyLogFfbEepromOk' : 'applyLogFfbEepromFail'),
      });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  return (
    <Card title={translate(locale, titleKey)} description={translate(locale, descriptionKey)}>
      {prereqKey ? (
        <p className="cal-section-prereq">{translate(locale, prereqKey)}</p>
      ) : null}

      {children}

      {action ? (
        <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8, marginTop: children ? 10 : 0 }}>
          <button
            type="button"
            className={action.tone === 'ok' ? 'ok' : action.tone === 'danger' ? 'danger' : action.tone === 'warn' ? 'warn' : ''}
            disabled={!state.connected || state.busy || running}
            onClick={() => void handleRun()}
          >
            {running ? translate(locale, 'setupToastStateRunning') : translate(locale, action.labelKey)}
          </button>
          <code className="cal-section-cmd">{translate(locale, action.subKey)}</code>
        </div>
      ) : null}

      {showMotorResults && motorResults ? (
        <div className="setup-step7-result" style={{ marginTop: 10 }}>
          <div className="header">{translate(locale, 'setupStep7ResultTitle')}</div>
          <div className="row">
            <span className="lbl">phase_resistance</span>
            <span className="val">{motorResults.resistance ?? '—'}</span>
          </div>
          <div className="row">
            <span className="lbl">phase_inductance</span>
            <span className="val">{motorResults.inductance ?? '—'}</span>
          </div>
        </div>
      ) : null}

      {showEncoderResults && encoderResults ? (
        <div className="setup-step7-result" style={{ marginTop: 10 }}>
          <div className="header">{translate(locale, 'calEncoderResultTitle')}</div>
          <div className="row">
            <span className="lbl">phase_offset</span>
            <span className="val">{encoderResults.phaseOffset ?? '—'}</span>
          </div>
          <div className="row">
            <span className="lbl">phase_offset_float</span>
            <span className="val">{encoderResults.phaseOffsetFloat ?? '—'}</span>
          </div>
          <div className="row">
            <span className="lbl">is_ready</span>
            <span className="val">{encoderResults.isReady ?? '—'}</span>
          </div>
          <p className="cal-boot-hint" style={{ marginTop: 8 }}>
            {translate(locale, 'calEncoderResultHint')}
          </p>
        </div>
      ) : null}

      {errorFields ? (
        <CalErrorPanel fields={errorFields} visible={showErrors} refreshKey={errorRefreshKey} />
      ) : null}

      {bootPersist && bootPersist.length > 0 ? (
        <div className="cal-boot-block">
          <div className="cal-boot-block-title">{translate(locale, 'calBootTitle')}</div>
          <ul className="cal-boot-list">
            {bootPersist.map((entry) => {
              const current = state.fieldValues[entry.path];
              const target = typeof entry.value === 'boolean' ? (entry.value ? 'true' : 'false') : String(entry.value);
              const synced = current === target || current === (entry.value ? '1' : '0');
              return (
                <li key={entry.path} className={synced ? 'synced' : ''}>
                  <span>{translate(locale, entry.labelKey)}</span>
                  <code>{entry.path}</code>
                  <span className="cal-boot-val">{target}</span>
                </li>
              );
            })}
          </ul>
          <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button type="button" disabled={!state.connected || state.busy} onClick={() => void handleBootPersist()}>
              {translate(locale, 'calBootApply')}
            </button>
            <span className="cal-boot-hint">{translate(locale, 'calBootRamHint')}</span>
          </div>
        </div>
      ) : null}

      {eepromSave ? (
        <div className="toolbar" style={{ marginTop: 10 }}>
          <button type="button" disabled={!state.connected || state.busy} onClick={() => void handleEepromSave()}>
            {translate(locale, 'calSaveEeprom')}
          </button>
          <span className="cal-boot-hint">{translate(locale, 'calEepromHint')}</span>
        </div>
      ) : null}
    </Card>
  );
}
