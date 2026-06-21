import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { fieldByPath } from '../calibration/calibrationPresets';
import { localizeField } from '../../i18n/fieldMeta';
import type { StepRecommendations } from './setupContext';

interface SetupRecommendationsPanelProps {
  recommendations: StepRecommendations | null;
  onApply: () => void;
  applyDisabled?: boolean;
  applied?: boolean;
}

export function SetupRecommendationsPanel({
  recommendations,
  onApply,
  applyDisabled = false,
  applied = false,
}: SetupRecommendationsPanelProps) {
  const { state } = useAppState();
  const locale = state.locale;

  if (!recommendations) {
    return null;
  }

  if (recommendations.blockedReasonKey) {
    return (
      <div className="setup-rec-panel setup-rec-panel-blocked">
        <p>{translate(locale, recommendations.blockedReasonKey)}</p>
      </div>
    );
  }

  return (
    <div className={`setup-rec-panel confidence-${recommendations.confidence}${applied ? ' applied' : ''}`}>
      <div className="setup-rec-header">
        <strong>{translate(locale, 'setupRecTitle')}</strong>
        <span className={`setup-rec-confidence setup-rec-confidence-${recommendations.confidence}`}>
          {translate(locale, `setupRecConfidence_${recommendations.confidence}`)}
        </span>
      </div>
      <p className="setup-rec-summary">
        {translate(locale, recommendations.summaryKey, recommendations.summaryParams)}
      </p>
      {recommendations.items.length > 0 ? (
        <ul className="setup-rec-list">
          {recommendations.items.map((item) => {
            const field = fieldByPath(item.path);
            const label = field ? localizeField(field, locale).label : item.path;
            return (
              <li key={item.path}>
                <span className="setup-rec-field">{label}</span>
                <code className="setup-rec-value">{item.value}</code>
                <span className="setup-rec-reason">
                  {translate(locale, item.reasonKey, item.reasonParams)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {Object.keys(recommendations.values).length > 0 ? (
        <div className="toolbar setup-rec-actions">
          <button type="button" className="ok" disabled={applyDisabled || applied} onClick={onApply}>
            {applied ? translate(locale, 'setupRecApplied') : translate(locale, 'setupRecApply')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
