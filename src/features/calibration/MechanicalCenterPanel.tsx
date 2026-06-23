import { useEffect, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { parseBoolField } from './calibrationBootPresets';
import {
  captureMechanicalCenter,
  disarmForCenterCapture,
  readEncoderPositionDeg,
  readIndexOffsetDeg,
} from './captureMechanicalCenter';

export function MechanicalCenterPanel() {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const [posDeg, setPosDeg] = useState<number | null>(null);
  const [idxDeg, setIdxDeg] = useState<number | null>(null);
  const [statusKey, setStatusKey] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const useIndex = parseBoolField(state.fieldValues['axis0.encoder.config.use_index']);

  useEffect(() => {
    if (!state.connected || state.busy || !useIndex) {
      return undefined;
    }

    let cancelled = false;
    let timer = 0;

    async function tick() {
      if (cancelled) {
        return;
      }
      const [pos, idx] = await Promise.all([readEncoderPositionDeg(), readIndexOffsetDeg()]);
      if (!cancelled) {
        setPosDeg(pos);
        setIdxDeg(idx);
      }
      if (!cancelled) {
        timer = window.setTimeout(tick, 500);
      }
    }

    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [state.connected, state.busy, useIndex]);

  if (!useIndex) {
    return (
      <p className="cal-workflow-prereq">{translate(locale, 'encCapNeedIndex')}</p>
    );
  }

  async function handleDisarm() {
    setRunning(true);
    dispatch({ type: 'set-busy', busy: true });
    try {
      await disarmForCenterCapture(dispatch);
      setStatusKey('encCapStatusIdle');
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

  async function handleCapture() {
    if (!window.confirm(translate(locale, 'encCapConfirm'))) {
      return;
    }
    setRunning(true);
    setStatusKey('encCapStatusCapturing');
    dispatch({ type: 'set-busy', busy: true });
    try {
      const result = await captureMechanicalCenter(dispatch);
      setIdxDeg(result.indexOffset * 360);
      setPosDeg(0);
      setStatusKey(result.ok ? 'encCapStatusDone' : 'encCapStatusFail');
      dispatch({
        type: 'append-log',
        direction: result.ok ? 'info' : 'error',
        message: translate(locale, result.ok ? 'encCapStatusDone' : 'encCapStatusFail'),
      });
    } catch (error) {
      const key = error instanceof Error ? error.message : 'encCapStatusFail';
      setStatusKey(key.startsWith('encCap') ? key : 'encCapStatusFail');
      dispatch({
        type: 'append-log',
        direction: 'error',
        message: key.startsWith('encCap') ? translate(locale, key) : key,
      });
    } finally {
      setRunning(false);
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  return (
    <div className="cal-mechanical-center">
      <p className="cal-workflow-prereq">{translate(locale, 'encCapHint')}</p>
      <div className="cal-mechanical-center-readouts">
        <span>{translate(locale, 'encCapLiveLabel')}: {posDeg !== null ? `${posDeg.toFixed(2)}°` : '—'}</span>
        <span>{translate(locale, 'encCapIdxLabel')}: {idxDeg !== null ? `${idxDeg.toFixed(2)}°` : '—'}</span>
      </div>
      <div className="cal-workflow-actions">
        <button type="button" disabled={!state.connected || state.busy || running} onClick={() => void handleDisarm()}>
          {translate(locale, 'encCapBtnDisarm')}
        </button>
        <button
          type="button"
          className="ok"
          disabled={!state.connected || state.busy || running}
          onClick={() => void handleCapture()}
        >
          {running ? translate(locale, 'encCapStatusCapturing') : translate(locale, 'encCapBtnCapture')}
        </button>
      </div>
      {statusKey ? (
        <p className={`cal-workflow-prereq${statusKey === 'encCapStatusDone' ? ' ok' : statusKey === 'encCapStatusIdle' ? ' ok' : ''}`}>
          {translate(locale, statusKey)}
        </p>
      ) : null}
      <p className="cal-workflow-prereq muted">{translate(locale, 'encoderZeroPersistHint')}</p>
    </div>
  );
}
