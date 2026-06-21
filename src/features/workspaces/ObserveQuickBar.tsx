import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { axisStateLabel } from '../../i18n/fieldMeta';
import { Pill } from '../../shared/ui';
import { QuickActions } from '../board/QuickActions';

const OBSERVE_QUICK_IDS = ['clear-errors', 'idle', 'closed-loop'] as const;

export function ObserveQuickBar() {
  const { state } = useAppState();
  const locale = state.locale;

  const axisState = state.fieldValues['axis0.current_state'];
  const motorCal = state.fieldValues['axis0.motor.is_calibrated'];
  const encoderReady = state.fieldValues['axis0.encoder.is_ready'];

  const motorTone = motorCal === 'true' || motorCal === '1' ? 'ok' : motorCal ? 'warn' : 'neutral';
  const encTone = encoderReady === 'true' || encoderReady === '1' ? 'ok' : encoderReady ? 'warn' : 'neutral';

  return (
    <div className="observe-quick-bar">
      <div className="observe-quick-bar-actions">
        <span className="observe-quick-bar-label">{translate(locale, 'observeQuickActions')}</span>
        <QuickActions variant="bar" ids={[...OBSERVE_QUICK_IDS]} />
      </div>
      <div className="observe-quick-bar-status">
        <Pill tone={state.connected ? 'ok' : 'neutral'}>
          {translate(locale, state.connected ? 'connected' : 'disconnected')}
        </Pill>
        <Pill tone="neutral">
          {translate(locale, 'observeStatusAxis')}:{' '}
          {axisState ? axisStateLabel(locale, axisState) : '—'}
        </Pill>
        <Pill tone={motorTone}>
          {translate(locale, 'observeStatusMotor')}: {formatBool(locale, motorCal)}
        </Pill>
        <Pill tone={encTone}>
          {translate(locale, 'observeStatusEncoder')}: {formatBool(locale, encoderReady)}
        </Pill>
      </div>
    </div>
  );
}

function formatBool(locale: import('../../i18n/messages').Locale, raw: string | undefined): string {
  if (!raw) return '—';
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1') return translate(locale, 'boolTrue');
  if (v === 'false' || v === '0') return translate(locale, 'boolFalse');
  return raw;
}
