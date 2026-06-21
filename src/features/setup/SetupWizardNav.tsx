import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { SETUP_STEPS, type SetupStepId } from './setupSteps';

interface SetupWizardNavProps {
  activeStep: SetupStepId;
  skipped: Set<SetupStepId>;
  doneSteps: Set<SetupStepId>;
  onSelect: (id: SetupStepId) => void;
}

export function SetupWizardNav({ activeStep, skipped, doneSteps, onSelect }: SetupWizardNavProps) {
  const { state } = useAppState();
  const locale = state.locale;
  const doneCount = SETUP_STEPS.filter((s) => doneSteps.has(s.id) || skipped.has(s.id)).length;
  const pct = Math.round((doneCount / SETUP_STEPS.length) * 100);

  return (
    <div className="setup-wizard-nav">
      <div className="setup-wizard-progress">
        <div className="setup-wizard-progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <p className="setup-wizard-progress-label">
        {translate(locale, 'setupWizardProgress', { done: String(doneCount), total: String(SETUP_STEPS.length) })}
      </p>
      <div className="setup-wizard-step-list" role="tablist" aria-label={translate(locale, 'quickStart')}>
        {SETUP_STEPS.map((step, index) => {
          const isActive = step.id === activeStep;
          const isDone = doneSteps.has(step.id);
          const isSkipped = skipped.has(step.id);
          return (
            <button
              key={step.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`setup-wizard-step-btn${isActive ? ' active' : ''}${isDone ? ' done' : ''}${isSkipped ? ' skipped' : ''}`}
              onClick={() => onSelect(step.id)}
            >
              <span className="setup-wizard-step-num">{isDone ? '✓' : index + 1}</span>
              <span className="setup-wizard-step-label">{translate(locale, step.titleKey)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
