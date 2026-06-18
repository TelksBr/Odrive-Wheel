import { useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card } from '../../shared/ui';
import { applyAs5047Preset, zeroWheel } from './calibrationPresets';
import { NtcCalculatorModal } from './NtcCalculatorModal';

export function EncoderToolsPanel() {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const [ntcOpen, setNtcOpen] = useState(false);

  return (
    <>
      <Card title={translate(locale, 'encoderToolsTitle')} description={translate(locale, 'encoderToolsDescription')}>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted)' }}>
          {translate(locale, 'encoderIncrementalWarn')}
        </p>
        <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600 }}>{translate(locale, 'encoderAs5047WorkflowTitle')}</p>
        <ol className="cal-nvm-steps" style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted)' }}>
          <li>{translate(locale, 'encoderAs5047Step1')}</li>
          <li>{translate(locale, 'encoderAs5047Step2')}</li>
          <li>{translate(locale, 'encoderAs5047Step3')}</li>
        </ol>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted)' }}>
          {translate(locale, 'encoderZeroPersistHint')}
        </p>
        <div className="toolbar">
          <button
            type="button"
            disabled={!state.connected || state.busy}
            onClick={() => {
              void (async () => {
                dispatch({ type: 'set-busy', busy: true });
                try {
                  const ok = await zeroWheel(dispatch);
                  dispatch({
                    type: 'append-log',
                    direction: ok ? 'info' : 'error',
                    message: translate(
                      locale,
                      ok ? 'dashboardWheelCenteredSaved' : 'dashboardWheelCenteredEepromFail',
                    ),
                  });
                } finally {
                  dispatch({ type: 'set-busy', busy: false });
                }
              })();
            }}
          >
            {translate(locale, 'encoderZeroWheel')}
          </button>
          <button
            type="button"
            disabled={state.busy}
            onClick={() => {
              if (window.confirm(translate(locale, 'encoderAs5047Confirm'))) {
                applyAs5047Preset(dispatch);
                dispatch({
                  type: 'append-log',
                  direction: 'info',
                  message: translate(locale, 'calAs5047PresetStaged'),
                });
              }
            }}
          >
            {translate(locale, 'encoderAs5047Preset')}
          </button>
          <button type="button" disabled={state.busy} onClick={() => setNtcOpen(true)}>
            {translate(locale, 'ntcOpenCalc')}
          </button>
        </div>
      </Card>
      {ntcOpen ? <NtcCalculatorModal onClose={() => setNtcOpen(false)} /> : null}
    </>
  );
}
