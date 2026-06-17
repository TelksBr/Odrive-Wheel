import { translate, type Locale } from '../../i18n/messages';
import type { PerfTestResults } from './perfTestTypes';

interface PerfTestResultsTableProps {
  locale: Locale;
  results: PerfTestResults;
}

export function PerfTestResultsTable({ locale, results }: PerfTestResultsTableProps) {
  const breakawayText = results.breakawayPct !== null && results.breakawayTorqueNm !== null
    ? `${results.breakawayPct}% (${results.breakawayTorqueNm.toFixed(3)} N·m)`
    : '—';

  return (
    <table className="perf-results-table">
      <tbody>
        <tr>
          <td>{translate(locale, 'perfResultPeakRpm')}</td>
          <td>
            <span className="perf-pkval">{results.peakRPM.toFixed(0)}</span>
            {' '}
            <span className="perf-muted-inline">
              ({results.peakDPS.toFixed(0)} {translate(locale, 'perfResultPeakRpmDps')})
            </span>
          </td>
        </tr>
        <tr>
          <td>{translate(locale, 'perfResultPeakAccel')}</td>
          <td><span className="perf-pkval">{results.peakAccel.toFixed(0)}</span> RPM/s</td>
        </tr>
        <tr>
          <td>{translate(locale, 'perfResultTPeakAccel')}</td>
          <td>{results.tPeakAccel.toFixed(0)} ms</td>
        </tr>
        <tr>
          <td>{translate(locale, 'perfResultTPeak')}</td>
          <td>{results.tPeakRPM.toFixed(0)} ms</td>
        </tr>
        <tr>
          <td>{translate(locale, 'perfResultT80')}</td>
          <td>{Number.isFinite(results.t80) ? `${results.t80.toFixed(0)} ms` : '—'}</td>
        </tr>
        <tr>
          <td>{translate(locale, 'perfResultRangeUsed')}</td>
          <td>
            {results.rangeUsed.toFixed(0)}° / {results.rangeCfg.toFixed(0)}° {translate(locale, 'perfResultRangeCfg')}
          </td>
        </tr>
        <tr>
          <td>{translate(locale, 'perfResultSamples')}</td>
          <td>{results.samples.length}</td>
        </tr>
        <tr>
          <td>{translate(locale, 'perfResultAvgDt')}</td>
          <td>{results.avgDt.toFixed(1)} ms</td>
        </tr>
        <tr>
          <td colSpan={2} className="perf-results-section">{translate(locale, 'perfResultSectionDerived')}</td>
        </tr>
        <tr>
          <td>{translate(locale, 'perfResultTorqueApplied')}</td>
          <td>{results.launchTorqueNm.toFixed(2)} N·m</td>
        </tr>
        <tr>
          <td>{translate(locale, 'perfResultInertia')}</td>
          <td>
            {results.inertiaKgM2 !== null ? (
              <>
                <span className="perf-pkval">{results.inertiaKgM2.toFixed(5)} kg·m²</span>
                {' '}
                <span className="perf-muted-inline">
                  (ODrive: {results.inertiaODrive?.toFixed(4)} N·m/(turn/s²))
                </span>
              </>
            ) : '—'}
          </td>
        </tr>
        <tr>
          <td>{translate(locale, 'perfResultBreakaway')}</td>
          <td><span className="perf-pkval">{breakawayText}</span></td>
        </tr>
        <tr>
          <td>{translate(locale, 'perfResultIqMax')}</td>
          <td>{results.iqMax.toFixed(2)} A</td>
        </tr>
        <tr>
          <td>{translate(locale, 'perfResultIqSat')}</td>
          <td>{results.iqSatMs.toFixed(0)} ms</td>
        </tr>
      </tbody>
    </table>
  );
}
