import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { parseProbeResults, probeVbusNeedsCalibration } from './setupProbeParse';

interface SetupProbePanelProps {
  results: Record<string, string>;
  onGoVbusCal?: () => void;
}

export function SetupProbePanel({ results, onGoVbusCal }: SetupProbePanelProps) {
  const { state } = useAppState();
  const locale = state.locale;
  const parsed = parseProbeResults(results);
  const vbusWarn = probeVbusNeedsCalibration(parsed.vbusV);

  return (
    <div className="setup-probe-panel">
      <div className="setup-probe-kpis">
        <div className="setup-probe-kpi">
          <span className="setup-probe-kpi-label">{translate(locale, 'setupProbeFirmware')}</span>
          <strong>{parsed.firmware ?? '—'}</strong>
        </div>
        <div className="setup-probe-kpi">
          <span className="setup-probe-kpi-label">{translate(locale, 'setupProbeBoard')}</span>
          <strong>{parsed.hardware ?? '—'}</strong>
        </div>
        <div className={`setup-probe-kpi${vbusWarn ? ' warn' : parsed.vbusV !== null ? ' ok' : ''}`}>
          <span className="setup-probe-kpi-label">{translate(locale, 'setupProbeVbus')}</span>
          <strong className="setup-probe-vbus">
            {parsed.vbusV !== null ? `${parsed.vbusV.toFixed(2)} V` : '—'}
          </strong>
        </div>
      </div>

      {parsed.firmware && parsed.hardware ? (
        <p className="setup-probe-ok">{translate(locale, 'setupProbeOk')}</p>
      ) : null}

      {parsed.vbusV !== null ? (
        <p className={vbusWarn ? 'setup-probe-vbus-warn' : 'setup-probe-vbus-hint'}>
          {translate(locale, vbusWarn ? 'setupProbeVbusWarn' : 'setupProbeVbusHint', {
            v: parsed.vbusV.toFixed(2),
          })}
        </p>
      ) : null}

      {vbusWarn && onGoVbusCal ? (
        <button type="button" className="ok" onClick={onGoVbusCal}>
          {translate(locale, 'setupProbeGoVbusCal')}
        </button>
      ) : null}

      <details className="setup-probe-raw">
        <summary>{translate(locale, 'setupProbeRaw')}</summary>
        <div className="debug-grid">
          {Object.entries(results).map(([cmd, val]) => (
            <div className="debug-cell" key={cmd}>
              <code>{cmd}</code>
              <pre>{val}</pre>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
