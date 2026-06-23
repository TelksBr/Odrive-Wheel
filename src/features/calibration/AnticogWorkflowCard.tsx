import { useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card } from '../../shared/ui';
import { anticogBootPersist, applyBootPersist, isPresetSynced, parseBoolField } from './calibrationBootPresets';
import { persistWorkflowPaths } from './calibrationPersist';
import { AnticoggingPanel } from './AnticoggingPanel';

export function AnticogWorkflowCard({ index }: { index: number }) {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const [persisting, setPersisting] = useState(false);
  const fv = state.fieldValues;
  const complete = parseBoolField(fv['axis0.controller.config.anticogging.pre_calibrated']);
  const presetSynced = isPresetSynced(anticogBootPersist, fv);
  const persistPaths = anticogBootPersist.map((entry) => entry.path);

  async function handlePreset() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const { ok, fail } = await applyBootPersist(anticogBootPersist, dispatch);
      dispatch({
        type: 'append-log',
        direction: fail === 0 ? 'info' : 'error',
        message: translate(locale, 'calFlowPresetApplied', { ok: String(ok), fail: String(fail) }),
      });
      if (fail === 0) {
        for (const path of persistPaths) {
          dispatch({ type: 'mark-nvm-pending-path', path });
        }
      }
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function handlePersist() {
    setPersisting(true);
    dispatch({ type: 'set-busy', busy: true });
    try {
      const fieldValues = { ...state.fieldValues };
      for (const entry of anticogBootPersist) {
        fieldValues[entry.path] = typeof entry.value === 'boolean' ? (entry.value ? 'true' : 'false') : String(entry.value);
      }
      const { ok, reconnected } = await persistWorkflowPaths(persistPaths, fieldValues, dispatch);
      dispatch({
        type: 'append-log',
        direction: ok ? 'info' : 'error',
        message: translate(locale, reconnected ? 'calFlowPersistOk' : 'calFlowPersistFail'),
      });
    } catch (error) {
      dispatch({
        type: 'append-log',
        direction: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPersisting(false);
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  return (
    <Card title={`${index}. ${translate(locale, 'anticogTitle')}`} description={translate(locale, 'calFlowAnticogDesc')}>
      <div className="cal-workflow-head">
        <span className={`cal-workflow-badge${complete ? ' ok' : ''}`}>
          {complete ? translate(locale, 'calFlowStatusDone') : translate(locale, 'calFlowStatusPending')}
        </span>
      </div>
      <p className="cal-workflow-prereq">{translate(locale, 'calFlowAnticogPrereq')}</p>

      <AnticoggingPanel embedded />

      <div className="cal-workflow-actions" style={{ marginTop: 12 }}>
        <button type="button" disabled={!state.connected || state.busy} onClick={() => void handlePreset()}>
          {translate(locale, 'calFlowBtnPresetAnticog')}
        </button>
        <button
          type="button"
          className="ok"
          disabled={!state.connected || state.busy || persisting || !presetSynced}
          onClick={() => void handlePersist()}
        >
          {persisting ? translate(locale, 'calFlowBtnPersisting') : translate(locale, 'calFlowBtnPersist')}
        </button>
      </div>

      <ul className="cal-workflow-preset-list">
        {anticogBootPersist.map((entry) => (
          <li key={entry.path}>
            <code>{entry.path}</code>
            <span>= {typeof entry.value === 'boolean' ? (entry.value ? 'true' : 'false') : entry.value}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
