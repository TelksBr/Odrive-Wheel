import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { assessCalibrationIntegrity } from './calibrationIntegrity';

export function CalibrationIntegrityBanner() {
  const { state } = useAppState();
  const locale = state.locale;
  const report = assessCalibrationIntegrity(state.fieldValues, state.dirtyPaths, state.nvmPendingPaths);

  if (report.blockers.length === 0 && report.warnings.length === 0) {
    return null;
  }

  return (
    <div className={`cal-integrity-banner${report.blockers.length > 0 ? ' error' : ' warn'}`}>
      {report.blockers.length > 0 ? (
        <div>
          <strong>{translate(locale, 'calIntegrityBlockersTitle')}</strong>
          <ul>
            {report.blockers.map((key) => (
              <li key={key}>{translate(locale, `calIntegrity_${key}`)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {report.warnings.length > 0 ? (
        <div>
          <strong>{translate(locale, 'calIntegrityWarningsTitle')}</strong>
          <ul>
            {report.warnings.map((key) => (
              <li key={key}>{translate(locale, `calIntegrity_${key}`)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
