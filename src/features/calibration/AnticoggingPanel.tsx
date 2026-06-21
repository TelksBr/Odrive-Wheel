import { useEffect, useRef, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card } from '../../shared/ui';
import { serialService } from '../serial/SerialService';
import { executeOpenFFBoard } from '../board/BoardProtocol';
import { readAnticogProgress, writePath } from './calibrationPresets';

export function AnticoggingPanel({ embedded = false }: { embedded?: boolean }) {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ index: 0, valid: false });
  const pollRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
      }
    },
    [],
  );

  async function restoreTorqueMode() {
    await writePath('axis0.controller.config.control_mode', '1', dispatch);
  }

  async function pollProgress() {
    const snap = await readAnticogProgress();
    setProgress({ index: snap.index, valid: snap.valid });
    if (snap.axisErr !== 0) {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
      setRunning(false);
      await restoreTorqueMode();
      dispatch({ type: 'append-log', direction: 'error', message: translate(locale, 'anticogFail') });
      return;
    }
    if (snap.valid && snap.index === 0) {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
      await writePath('axis0.controller.config.anticogging.pre_calibrated', true, dispatch);
      await restoreTorqueMode();
      setRunning(false);
      dispatch({ type: 'append-log', direction: 'info', message: translate(locale, 'anticogDone') });
    }
  }

  async function start() {
    if (!window.confirm(translate(locale, 'anticogConfirm'))) {
      return;
    }
    dispatch({ type: 'set-busy', busy: true });
    try {
      await writePath('axis0.controller.config.control_mode', '3', dispatch);
      await new Promise<void>((r) => setTimeout(r, 200));
      const reply = await executeOpenFFBoard('axis.anticogcal');
      dispatch({ type: 'append-log', direction: 'info', message: `axis.anticogcal! → ${reply}` });
      if (!reply || reply.toUpperCase().includes('FAIL')) {
        await restoreTorqueMode();
        dispatch({ type: 'append-log', direction: 'error', message: translate(locale, 'anticogFail') });
        return;
      }
      setRunning(true);
      dispatch({ type: 'append-log', direction: 'info', message: translate(locale, 'anticogStarted') });
      void pollProgress();
      pollRef.current = window.setInterval(() => void pollProgress(), 1000);
    } catch (error) {
      await restoreTorqueMode();
      dispatch({
        type: 'append-log',
        direction: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function cancel() {
    if (!window.confirm(`${translate(locale, 'anticogCancel')}?`)) {
      return;
    }
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    dispatch({ type: 'set-busy', busy: true });
    try {
      await serialService.sendCommand('w axis0.requested_state 1', false, 2000);
      await new Promise<void>((r) => setTimeout(r, 300));
      await restoreTorqueMode();
      setRunning(false);
      dispatch({ type: 'append-log', direction: 'info', message: translate(locale, 'anticogCancelled') });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  const pct = ((progress.index / 3600) * 100).toFixed(1);

  const body = (
    <>
      <div className="toolbar">
        <button type="button" className="warn" disabled={!state.connected || state.busy || running} onClick={() => void start()}>
          {running ? translate(locale, 'anticogRunning') : translate(locale, 'anticogRun')}
        </button>
        {running ? (
          <button type="button" className="danger" disabled={state.busy} onClick={() => void cancel()}>
            {translate(locale, 'anticogCancel')}
          </button>
        ) : null}
      </div>
      {running ? (
        <div style={{ marginTop: 10, fontSize: 12, fontFamily: 'var(--mono)' }}>
          <div>{translate(locale, 'anticogProgress', { index: progress.index, pct })}</div>
          <div>{translate(locale, 'anticogValid', { valid: progress.valid ? 'True' : 'False' })}</div>
        </div>
      ) : null}
    </>
  );

  if (embedded) {
    return body;
  }

  return (
    <Card title={translate(locale, 'anticogTitle')} description={translate(locale, 'anticogDescription')}>
      {body}
    </Card>
  );
}
