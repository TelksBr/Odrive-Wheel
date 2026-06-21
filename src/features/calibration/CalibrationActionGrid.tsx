import { useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card } from '../../shared/ui';
import { calibrationAxisActions } from './calibrationActions';
import { readMotorCalResults, runAxisState } from './calibrationRunner';

export function CalibrationActionGrid({ showResults = false }: { showResults?: boolean }) {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const [motorResults, setMotorResults] = useState<{ resistance: string | null; inductance: string | null } | null>(
    null,
  );

  async function runAction(action: (typeof calibrationAxisActions)[number]) {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const result = await runAxisState(action.state, action.timeoutMs, action.clearFirst !== false);
      const msg = result.ok
        ? translate(locale, 'setupToastStateDone')
        : `${translate(locale, 'setupToastStateFail')} (${result.reason ?? 'unknown'})`;
      dispatch({ type: 'append-log', direction: result.ok ? 'info' : 'error', message: msg });

      if (showResults && action.id === 'motor-cal' && result.ok) {
        setMotorResults(await readMotorCalResults());
      }
    } catch (error) {
      dispatch({
        type: 'append-log',
        direction: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  return (
    <Card title={translate(locale, 'calActionsTitle')} description={translate(locale, 'calActionsDescription')}>
      {showResults && motorResults && (
        <div className="setup-step7-result" style={{ marginBottom: 10 }}>
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
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 6 }}>
        {calibrationAxisActions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={!state.connected || state.busy}
            className={action.tone === 'ok' ? 'ok' : action.tone === 'danger' ? 'danger' : action.tone === 'warn' ? 'warn' : ''}
            style={{ display: 'grid', gap: 3, textAlign: 'left', minHeight: 56, padding: '8px 10px' }}
            onClick={() => void runAction(action)}
          >
            <strong style={{ fontSize: 13 }}>{translate(locale, action.labelKey)}</strong>
            <code style={{ fontSize: 10, color: 'var(--muted-2)' }}>{translate(locale, action.subKey)}</code>
          </button>
        ))}
      </div>
    </Card>
  );
}
