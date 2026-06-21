import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card } from '../../shared/ui';
import { detectEncoderProfile } from './calibrationTargets';
import { parseBoolField } from './calibrationBootPresets';

function isTrue(raw: string | undefined): boolean {
  const token = (raw ?? '').trim().toLowerCase().split(/\s+/)[0];
  return token === 'true' || token === '1';
}

export function CalibrationWizardCard() {
  const { state } = useAppState();
  const locale = state.locale;
  const fv = state.fieldValues;

  const step1Done = detectEncoderProfile(fv['axis0.encoder.config.mode']) !== 'unknown';
  const step2Done = isTrue(fv['axis0.motor.is_calibrated']);
  const step3Done = isTrue(fv['axis0.encoder.is_ready']);
  const step4Done =
    parseBoolField(fv['axis0.motor.config.pre_calibrated']) &&
    parseBoolField(fv['axis0.encoder.config.pre_calibrated']) &&
    !parseBoolField(fv['axis0.config.startup_motor_calibration']) &&
    !parseBoolField(fv['axis0.config.startup_encoder_offset_calibration']);
  const step5Done = !state.nvmPending && state.dirtyPaths.length === 0 && step4Done;

  const steps = [
    { key: 'calWizardStep1', done: step1Done },
    { key: 'calWizardStep2', done: step2Done },
    { key: 'calWizardStep3', done: step3Done },
    { key: 'calWizardStep4', done: step4Done },
    { key: 'calWizardStep5', done: step5Done },
  ];

  const done = steps.filter((s) => s.done).length;

  return (
    <Card title={translate(locale, 'calWizardTitle')} description={translate(locale, 'calWizardDesc')}>
      <ol className="cal-wizard-steps">
        {steps.map((step, index) => (
          <li key={step.key} className={step.done ? 'done' : ''}>
            <span className="cal-wizard-num">{index + 1}</span>
            <span>{translate(locale, step.key)}</span>
            {step.done ? <span className="cal-wizard-check">✓</span> : null}
          </li>
        ))}
      </ol>
      <p className="cal-wizard-progress">
        {translate(locale, 'calWizardProgress', { done: String(done), total: String(steps.length) })}
      </p>
      <p className="cal-boot-hint">{translate(locale, 'calWizardSaveExplain')}</p>
    </Card>
  );
}
