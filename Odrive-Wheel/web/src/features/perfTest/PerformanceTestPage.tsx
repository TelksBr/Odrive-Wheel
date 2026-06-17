import { useCallback, useRef, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate, type Locale } from '../../i18n/messages';
import { hidFfbService } from '../hid/HidFfbService';
import { HidConnectionToolbar } from '../hid/HidConnectionToolbar';
import { useHidConnection } from '../hid/useHidConnection';
import { Card, Pill, SectionHeader } from '../../shared/ui';
import { exportPerfTestCsv } from './exportPerfTestCsv';
import { PerfTestChart } from './PerfTestChart';
import { PerfTestResultsTable } from './PerfTestResults';
import { runPerfTest } from './perfTestRunner';
import type { PerfPhase, PerfTestResults } from './perfTestTypes';

function phaseLabelKey(phase: PerfPhase): string {
  switch (phase) {
    case 'centering': return 'perfPhaseCentering';
    case 'friction': return 'perfPhaseFriction';
    case 'push': return 'perfPhasePush';
    case 'pause': return 'perfPhasePause';
    case 'launch': return 'perfPhaseLaunch';
    case 'return': return 'perfPhaseReturn';
    case 'done': return 'perfPhaseDone';
    case 'aborted': return 'perfPhaseAborted';
    case 'error': return 'perfPhaseError';
    default: return 'perfPhaseIdle';
  }
}

function formatPhaseError(locale: Locale, extra?: string): string | undefined {
  if (!extra) {
    return undefined;
  }
  if (extra === 'no_hid') {
    return translate(locale, 'perfErrNoHid');
  }
  if (extra === 'range_too_small') {
    return translate(locale, 'perfErrRangeTooSmall');
  }
  if (extra.startsWith('axis_error:')) {
    return `${translate(locale, 'perfErrAxisError')} (${extra.slice('axis_error:'.length)})`;
  }
  if (extra.startsWith('few_samples:')) {
    return `${translate(locale, 'perfErrFewSamples')} (${extra.slice('few_samples:'.length)})`;
  }
  if (extra.startsWith('phase1_timeout:')) {
    return `${translate(locale, 'perfErrPhase1Timeout')} (${extra.slice('phase1_timeout:'.length)}s)`;
  }
  if (extra.startsWith('phase3_timeout:')) {
    return `${translate(locale, 'perfErrPhase3Timeout')} (${extra.slice('phase3_timeout:'.length)}s)`;
  }
  return extra;
}

export function PerformanceTestPage() {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const hid = useHidConnection(locale);
  const serialReady = state.connected;

  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<PerfPhase>('idle');
  const [phaseExtra, setPhaseExtra] = useState<string | undefined>();
  const [results, setResults] = useState<PerfTestResults | null>(null);
  const abortRef = useRef(false);

  const startBlocked = !state.hidSupported || !hid.connected || !serialReady || running;

  async function handleConnect() {
    try {
      await hid.connect();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      hid.setError(msg);
      dispatch({ type: 'append-log', direction: 'error', message: msg });
    }
  }

  async function handleDisconnect() {
    try {
      await hid.disconnect();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      hid.setError(msg);
      dispatch({ type: 'append-log', direction: 'error', message: msg });
    }
  }

  const handleStart = useCallback(async () => {
    if (running) {
      return;
    }
    abortRef.current = false;
    setRunning(true);
    setResults(null);
    setPhase('centering');
    setPhaseExtra(undefined);

    try {
      const outcome = await runPerfTest(
        {
          onPhase: (nextPhase, extra) => {
            setPhase(nextPhase);
            setPhaseExtra(extra);
          },
          onLog: (message, direction) => {
            dispatch({ type: 'append-log', direction, message });
          },
          isAborted: () => abortRef.current,
        },
        serialReady,
      );
      if (outcome) {
        setResults(outcome);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setPhase('error');
      setPhaseExtra(msg);
      dispatch({ type: 'append-log', direction: 'error', message: msg });
    } finally {
      await hidFfbService.stopAll().catch(() => undefined);
      setRunning(false);
    }
  }, [dispatch, running, serialReady]);

  function handleAbort() {
    abortRef.current = true;
  }

  function handleRepeat() {
    setResults(null);
    setPhase('idle');
    setPhaseExtra(undefined);
  }

  function handleExport() {
    if (results) {
      exportPerfTestCsv(results);
    }
  }

  const phaseClass = phase === 'done'
    ? 'done'
    : phase === 'aborted'
      ? 'aborted'
      : phase === 'error'
        ? 'error'
        : running
          ? 'running'
          : '';

  const phaseText = translate(locale, phaseLabelKey(phase));
  const errorDetail = phase === 'error' ? formatPhaseError(locale, phaseExtra) : undefined;

  return (
    <div className="page-stack">
      <SectionHeader
        eyebrow={translate(locale, 'perfEyebrow')}
        title={translate(locale, 'perfTitle')}
        description={translate(locale, 'perfDescription')}
      />

      <Card title={translate(locale, 'perfHidCardTitle')} description={translate(locale, 'perfHidCardDescription')}>
        <HidConnectionToolbar
          locale={locale}
          hidSupported={state.hidSupported}
          connected={hid.connected}
          deviceName={hid.deviceName}
          error={hid.error}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
        />
        {!serialReady && (
          <p className="ffb-inline-hint" style={{ marginTop: 10, marginBottom: 0 }}>
            {translate(locale, 'perfSerialRequired')}
          </p>
        )}
      </Card>

      <Card title={translate(locale, 'perfSafetyTitle')}>
        <ul className="perf-safety-list">
          <li>{translate(locale, 'perfSafety1')}</li>
          <li>{translate(locale, 'perfSafety2')}</li>
          <li>{translate(locale, 'perfSafety3')}</li>
        </ul>
        <div className="perf-status-row" style={{ marginTop: 12 }}>
          <Pill tone={hid.connected ? 'ok' : 'warn'}>
            {hid.connected ? translate(locale, 'perfHidReady') : translate(locale, 'perfHidRequired')}
          </Pill>
          <Pill tone={serialReady ? 'ok' : 'warn'}>
            {serialReady ? translate(locale, 'perfSerialReady') : translate(locale, 'perfSerialRequired')}
          </Pill>
        </div>
      </Card>

      <Card title={translate(locale, 'perfResultsTitle')} description={translate(locale, 'perfRunDescription')}>
        <div className={`perf-phase-label ${phaseClass}`}>
          {phaseText}
          {errorDetail ? ` — ${errorDetail}` : ''}
        </div>

        <div className="toolbar perf-actions" style={{ flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {!running && (
            <button
              type="button"
              disabled={startBlocked}
              title={startBlocked ? translate(locale, 'perfStartBlockedHint') : undefined}
              onClick={() => void handleStart()}
            >
              {translate(locale, 'perfBtnStart')}
            </button>
          )}
          {running && (
            <button type="button" className="danger" onClick={handleAbort}>
              {translate(locale, 'perfBtnAbort')}
            </button>
          )}
          {!running && (results || phase === 'aborted' || phase === 'error') && (
            <button type="button" onClick={handleRepeat}>
              {translate(locale, 'perfBtnRepeat')}
            </button>
          )}
          {results && (
            <button type="button" onClick={handleExport}>
              {translate(locale, 'perfBtnExport')}
            </button>
          )}
        </div>
      </Card>

      {results && (
        <>
          <Card title={translate(locale, 'perfResultsHeading')}>
            <PerfTestResultsTable locale={locale} results={results} />
          </Card>
          <Card title={translate(locale, 'perfChartTitle')}>
            <PerfTestChart results={results} />
          </Card>
        </>
      )}
    </div>
  );
}
