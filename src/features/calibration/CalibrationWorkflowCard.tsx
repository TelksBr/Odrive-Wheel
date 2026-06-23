import { useState } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card } from '../../shared/ui';
import { parseBoolField } from './calibrationBootPresets';
import type { CalibrationWorkflow } from './calibrationWorkflows';
import { readEncoderCalResults, readMotorCalResults, runAxisState } from './calibrationRunner';
import { CalErrorPanel } from './CalErrorPanel';

interface CalibrationWorkflowCardProps {
  workflow: CalibrationWorkflow;
  index: number;
  children?: ReactNode;
  /** When false, calibrate button stays disabled (e.g. closed loop before finalize). */
  canRun?: boolean;
  disabledReasonKey?: string;
  onCalComplete?: () => void;
}

function isWorkflowDone(workflow: CalibrationWorkflow, fieldValues: Record<string, string>): boolean {
  if (workflow.id === 'motor') {
    return parseBoolField(fieldValues['axis0.motor.is_calibrated']);
  }
  if (workflow.id === 'encoder') {
    return parseBoolField(fieldValues['axis0.encoder.is_ready']);
  }
  return false;
}

export function CalibrationWorkflowCard({
  workflow,
  index,
  children,
  canRun = true,
  disabledReasonKey,
  onCalComplete,
}: CalibrationWorkflowCardProps) {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const [running, setRunning] = useState(false);
  const [phaseKey, setPhaseKey] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [errorRefreshKey, setErrorRefreshKey] = useState(0);
  const [motorResults, setMotorResults] = useState<{ resistance: string | null; inductance: string | null } | null>(
    null,
  );
  const [encoderResults, setEncoderResults] = useState<{
    phaseOffset: string | null;
    phaseOffsetFloat: string | null;
    isReady: string | null;
  } | null>(null);

  const fv = state.fieldValues;
  const complete = isWorkflowDone(workflow, fv);

  async function handleCalibrate() {
    setRunning(true);
    setPhaseKey('calProgressClearing');
    dispatch({ type: 'set-busy', busy: true });
    dispatch({
      type: 'append-log',
      direction: 'info',
      message: translate(locale, 'calProgressStart', { state: String(workflow.action.state) }),
    });
    try {
      const action = workflow.action;
      const result = await runAxisState(
        action.state,
        action.timeoutMs,
        action.clearFirst !== false,
        (step) => {
          if (step === 'clearing') {
            setPhaseKey('calProgressClearing');
          } else if (step === 'starting' || step === 'running') {
            setPhaseKey('calProgressRunning');
          } else {
            setPhaseKey('calProgressChecking');
          }
        },
        action.successState,
      );
      const msg = result.ok
        ? translate(locale, 'setupToastStateDone')
        : `${translate(locale, 'setupToastStateFail')} (${result.reason ?? 'unknown'}${result.finalState !== undefined ? `, state=${result.finalState}` : ''})`;
      dispatch({ type: 'append-log', direction: result.ok ? 'info' : 'error', message: msg });
      setPhaseKey(result.ok ? (workflow.action.successState === 8 ? 'calProgressClosedLoopOk' : 'calProgressDone') : 'calProgressFail');
      setShowErrors(true);
      setErrorRefreshKey((key) => key + 1);

      if (result.ok) {
        if (workflow.showMotorResults) {
          const motor = await readMotorCalResults();
          setMotorResults(motor);
          dispatch({ type: 'set-field', path: 'axis0.motor.is_calibrated', value: 'true', dirty: false });
          if (motor.rawResistance) {
            dispatch({
              type: 'set-field',
              path: 'axis0.motor.config.phase_resistance',
              value: motor.rawResistance,
              dirty: false,
            });
          }
          if (motor.rawInductance) {
            dispatch({
              type: 'set-field',
              path: 'axis0.motor.config.phase_inductance',
              value: motor.rawInductance,
              dirty: false,
            });
          }
        }
        if (workflow.showEncoderResults) {
          const enc = await readEncoderCalResults();
          setEncoderResults(enc);
          if (enc.phaseOffset) {
            dispatch({ type: 'set-field', path: 'axis0.encoder.config.phase_offset', value: enc.phaseOffset, dirty: false });
          }
          if (enc.phaseOffsetFloat) {
            dispatch({
              type: 'set-field',
              path: 'axis0.encoder.config.phase_offset_float',
              value: enc.phaseOffsetFloat,
              dirty: false,
            });
          }
          if (enc.isReady) {
            dispatch({ type: 'set-field', path: 'axis0.encoder.is_ready', value: enc.isReady, dirty: false });
          }
        }
        onCalComplete?.();
      }
    } catch (error) {
      dispatch({
        type: 'append-log',
        direction: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRunning(false);
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  return (
    <Card
      title={`${index}. ${translate(locale, workflow.titleKey)}`}
      description={translate(locale, workflow.descKey)}
    >
      <div className="cal-workflow-head">
        <span className={`cal-workflow-badge${complete ? ' ok' : ''}`}>
          {complete ? translate(locale, 'calFlowStatusDone') : translate(locale, 'calFlowStatusPending')}
        </span>
      </div>

      {workflow.prereqKey ? (
        <p className="cal-workflow-prereq">{translate(locale, workflow.prereqKey)}</p>
      ) : null}

      {children}

      {!canRun && disabledReasonKey ? (
        <p className="cal-workflow-prereq warn">{translate(locale, disabledReasonKey)}</p>
      ) : null}

      {phaseKey ? (
        <p className={`cal-workflow-prereq${phaseKey === 'calProgressDone' || phaseKey === 'calProgressClosedLoopOk' ? ' ok' : phaseKey === 'calProgressFail' ? ' warn' : ''}`}>
          {translate(locale, phaseKey)}
        </p>
      ) : null}

      <div className="cal-workflow-actions">
        <button
          type="button"
          className={workflow.action.tone === 'ok' ? 'ok' : workflow.action.tone === 'danger' ? 'danger' : 'warn'}
          disabled={!state.connected || state.busy || running || !canRun}
          onClick={() => void handleCalibrate()}
        >
          {running ? translate(locale, 'setupToastStateRunning') : translate(locale, 'calFlowBtnCalibrate')}
        </button>
      </div>

      {workflow.showMotorResults && motorResults ? (
        <div className="cal-workflow-results">
          <strong>{translate(locale, 'setupStep7ResultTitle')}</strong>
          <span>R = {motorResults.resistance ?? '—'}</span>
          <span>L = {motorResults.inductance ?? '—'}</span>
        </div>
      ) : null}

      {workflow.showEncoderResults && encoderResults ? (
        <div className="cal-workflow-results">
          <strong>{translate(locale, 'calEncoderResultTitle')}</strong>
          <span>offset = {encoderResults.phaseOffset ?? '—'}</span>
          <span>ready = {encoderResults.isReady ?? '—'}</span>
        </div>
      ) : null}

      <CalErrorPanel fields={workflow.errorFields} visible={showErrors} refreshKey={errorRefreshKey} />
    </Card>
  );
}
