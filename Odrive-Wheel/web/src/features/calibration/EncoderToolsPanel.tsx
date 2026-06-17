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
        <div className="toolbar">
          <button
            type="button"
            disabled={!state.connected || state.busy}
            onClick={() => void zeroWheel(dispatch)}
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
                  message: translate(locale, 'encoderAs5047Preset'),
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
