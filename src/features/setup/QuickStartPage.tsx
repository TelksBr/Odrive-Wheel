import { useMemo, useState, type ReactNode } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card } from '../../shared/ui';
import { serialService } from '../serial/SerialService';
import { useBoardSave } from '../board/useBoardSave';
import { countSavePending } from '../board/persistPending';
import { HidConnectionToolbar } from '../hid/HidConnectionToolbar';
import { useHidConnection } from '../hid/useHidConnection';
import {
  applyAs5047Preset,
  eraseAndReconnect,
  markPrecalibrated,
  writePaths,
} from '../calibration/calibrationPresets';
import { readMotorCalResults, runAxisState } from '../calibration/calibrationRunner';
import { CalErrorPanel } from '../calibration/CalErrorPanel';
import { encoderCalErrorFields, motorCalErrorFields } from '../calibration/calibrationActions';
import { SetupParamForm, specsToWrites } from '../calibration/SetupParamForm';
import { SetupStepCard } from './SetupStepCard';
import { SetupWizardNav } from './SetupWizardNav';
import { VbusCalPanel } from './VbusCalPanel';
import {
  ENC_SPECS,
  FFB_SPECS,
  mergeFormValues,
  MOTOR_SPECS,
  POWER_SPECS,
} from './setupSpecs';
import { SETUP_STEPS, setupStepIndex, type SetupStepId } from './setupSteps';
import { SetupProbePanel } from './SetupProbePanel';
import { parseProbeResults } from './setupProbeParse';
import { useSetupSkipped } from './useSetupSkipped';
import { SetupRecommendationsPanel } from './SetupRecommendationsPanel';
import {
  buildSetupContext,
  formMatchesRecommendations,
  getRecommendationsForStep,
  mergeRecommendedIntoForm,
  type StepRecommendations,
} from './setupContext';

function parseBool(raw: string | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === 'true' || v === '1';
}

export function QuickStartPage() {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const hid = useHidConnection(locale);
  const { saveAll, saveBadge } = useBoardSave();
  const { skipStep, unskipStep, isSkipped } = useSetupSkipped();

  const [activeStep, setActiveStep] = useState<SetupStepId>('connect');
  const [powerValues, setPowerValues] = useState(() => mergeFormValues(POWER_SPECS, state.fieldValues));
  const [motorValues, setMotorValues] = useState(() => mergeFormValues(MOTOR_SPECS, state.fieldValues));
  const [encValues, setEncValues] = useState(() => mergeFormValues(ENC_SPECS, state.fieldValues));
  const [ffbValues, setFfbValues] = useState(() => mergeFormValues(FFB_SPECS, state.fieldValues));
  const [motorCalDone, setMotorCalDone] = useState(false);
  const [encCalDone, setEncCalDone] = useState(false);
  const [motorErrorRefreshKey, setMotorErrorRefreshKey] = useState(0);
  const [encErrorRefreshKey, setEncErrorRefreshKey] = useState(0);
  const [motorResults, setMotorResults] = useState<{ resistance: string | null; inductance: string | null } | null>(
    null,
  );
  const [probeResults, setProbeResults] = useState<Record<string, string>>({});
  const [appliedFlags, setAppliedFlags] = useState<Partial<Record<SetupStepId, boolean>>>({});
  const [liveVbusV, setLiveVbusV] = useState<number | null>(null);
  const [multimeterVbusV, setMultimeterVbusV] = useState<number | null>(null);

  const fv = state.fieldValues;
  const pendingSave = countSavePending(state);

  const mergedFieldValues = useMemo(
    () => ({
      ...fv,
      ...powerValues,
      ...motorValues,
      ...encValues,
      ...ffbValues,
      ...(liveVbusV !== null ? { vbus_voltage: String(liveVbusV) } : {}),
    }),
    [encValues, ffbValues, fv, liveVbusV, motorValues, powerValues],
  );

  const setupCtx = useMemo(
    () =>
      buildSetupContext({
        probeResults,
        liveVbusV,
        multimeterVbusV,
        fieldValues: mergedFieldValues,
        motorResults,
        motorCalDone,
        encCalDone,
      }),
    [encCalDone, liveVbusV, mergedFieldValues, motorCalDone, motorResults, multimeterVbusV, probeResults],
  );

  const stepRecommendations = useMemo(
    () => getRecommendationsForStep(activeStep, setupCtx),
    [activeStep, setupCtx],
  );

  const doneSteps = useMemo(() => {
    const done = new Set<SetupStepId>();
    if (Object.keys(probeResults).length > 0 || parseBool(fv['sys.swver'])) {
      done.add('connect');
    }
    if (appliedFlags.power) {
      done.add('power');
    }
    if (appliedFlags.motor) {
      done.add('motor');
    }
    if (appliedFlags.encoder) {
      done.add('encoder');
    }
    if (parseBool(fv['axis0.motor.is_calibrated']) || motorCalDone) {
      done.add('motorCal');
    }
    if (parseBool(fv['axis0.encoder.is_ready']) || encCalDone) {
      done.add('encoderCal');
    }
    if (
      parseBool(fv['axis0.motor.config.pre_calibrated']) &&
      parseBool(fv['axis0.encoder.config.pre_calibrated']) &&
      !parseBool(fv['axis0.config.startup_motor_calibration']) &&
      pendingSave === 0 &&
      appliedFlags.bootSave
    ) {
      done.add('bootSave');
      done.add('saveNvm1');
    } else if (pendingSave === 0 && appliedFlags.saveNvm1) {
      done.add('saveNvm1');
    }
    if (appliedFlags.ffb) {
      done.add('ffb');
    }
    if (hid.connected) {
      done.add('hidTest');
    }
    return done;
  }, [appliedFlags, encCalDone, fv, hid.connected, motorCalDone, pendingSave, probeResults]);

  const checklist = useMemo(
    () => ['setupReq1', 'setupReq2', 'setupReq3', 'setupReq4', 'setupReq5', 'setupReq6'],
    [],
  );

  function applyRecommendationsToForm(
    rec: StepRecommendations,
    setValues: (updater: (current: Record<string, string>) => Record<string, string>) => void,
  ) {
    setValues((current) => mergeRecommendedIntoForm(current, rec.values));
    dispatch({
      type: 'append-log',
      direction: 'info',
      message: translate(locale, 'setupRecApplied'),
    });
  }

  function renderRecommendations(
    rec: StepRecommendations | null,
    values: Record<string, string>,
    onApply: () => void,
  ) {
    if (!rec) {
      return null;
    }
    const synced =
      Object.keys(rec.values).length > 0 &&
      formMatchesRecommendations(values, rec.values, Object.keys(rec.values));
    return (
      <SetupRecommendationsPanel
        recommendations={rec}
        onApply={onApply}
        applied={synced}
      />
    );
  }

  function goTab(tab: typeof state.activeTab) {
    dispatch({ type: 'set-tab', tab });
  }

  function goNext(from: SetupStepId) {
    const idx = setupStepIndex(from);
    if (idx < 0 || idx >= SETUP_STEPS.length - 1) {
      return;
    }
    setActiveStep(SETUP_STEPS[idx + 1].id);
  }

  async function applySpecs(stepId: SetupStepId, specs: typeof POWER_SPECS, values: Record<string, string>) {
    dispatch({ type: 'set-busy', busy: true });
    try {
      let writes = specsToWrites(specs, values);
      if (stepId === 'encoder') {
        writes = [
          ...writes.filter((w) => w.path !== 'axis0.encoder.config.pre_calibrated'),
          { path: 'axis0.encoder.config.pre_calibrated', value: false },
        ];
      }
      const result = await writePaths(writes, dispatch);
      dispatch({
        type: 'append-log',
        direction: result.fail === 0 ? 'info' : 'error',
        message: translate(locale, 'setupToastWritten', { ok: result.ok, fail: result.fail }),
      });
      if (result.fail === 0) {
        setAppliedFlags((prev) => ({ ...prev, [stepId]: true }));
      }
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function probeBoard() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const checks = ['sys.swver?', 'sys.hwtype?', 'r vbus_voltage'];
      const next: Record<string, string> = {};
      for (const cmd of checks) {
        next[cmd] = await serialService.sendCommand(cmd, true, 2500);
      }
      setProbeResults(next);
      const parsed = parseProbeResults(next);
      if (parsed.firmware) {
        dispatch({ type: 'set-field', path: 'sys.swver', value: parsed.firmware, dirty: false });
      }
      if (parsed.hardware) {
        dispatch({ type: 'set-field', path: 'sys.hwtype', value: parsed.hardware, dirty: false });
      }
      if (parsed.vbusV !== null) {
        dispatch({ type: 'set-field', path: 'vbus_voltage', value: String(parsed.vbusV), dirty: false });
      }
    } catch (error) {
      dispatch({
        type: 'append-log',
        direction: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function eraseConfig() {
    if (!window.confirm(translate(locale, 'setupStep3Confirm'))) {
      return;
    }
    dispatch({ type: 'set-busy', busy: true });
    try {
      const result = await eraseAndReconnect();
      if (result.reconnected && result.values) {
        dispatch({ type: 'hydrate-fields', values: result.values, dirty: false });
        dispatch({ type: 'append-log', direction: 'info', message: translate(locale, 'setupToastErasedOk') });
      } else {
        dispatch({ type: 'append-log', direction: 'error', message: translate(locale, 'setupToastErasedNoReconnect') });
      }
    } catch (error) {
      dispatch({
        type: 'append-log',
        direction: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function runMotorCal() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      dispatch({ type: 'append-log', direction: 'info', message: translate(locale, 'setupToastStateRunning') });
      const result = await runAxisState(4, 30000);
      if (result.ok) {
        setMotorResults(await readMotorCalResults());
        dispatch({ type: 'append-log', direction: 'info', message: translate(locale, 'setupToastStateDone') });
        dispatch({ type: 'set-nvm-pending', pending: true });
      } else {
        dispatch({ type: 'append-log', direction: 'error', message: translate(locale, 'setupToastStateFail') });
      }
      setMotorCalDone(true);
      setMotorErrorRefreshKey((key) => key + 1);
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function runEncoderCal() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      dispatch({ type: 'append-log', direction: 'info', message: translate(locale, 'setupToastStateRunning') });
      const result = await runAxisState(7, 60000);
      dispatch({
        type: 'append-log',
        direction: result.ok ? 'info' : 'error',
        message: translate(locale, result.ok ? 'setupToastStateDone' : 'setupToastStateFail'),
      });
      if (result.ok) {
        dispatch({ type: 'set-nvm-pending', pending: true });
      }
      setEncCalDone(true);
      setEncErrorRefreshKey((key) => key + 1);
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  function renderStepActions(id: SetupStepId, actions: ReactNode) {
    const def = SETUP_STEPS.find((s) => s.id === id);
    const skipped = isSkipped(id);
    const isLast = id === 'finish';
    return (
      <>
        {actions}
        {!isLast ? (
          <button type="button" className="ghost" onClick={() => goNext(id)}>
            {translate(locale, 'setupStepNext')}
          </button>
        ) : null}
        {!isLast && def?.optional && !skipped ? (
          <button type="button" className="ghost setup-skip-btn" onClick={() => skipStep(id)}>
            {translate(locale, 'setupStepSkip')}
          </button>
        ) : null}
      </>
    );
  }

  function stepProps(id: SetupStepId) {
    const def = SETUP_STEPS.find((s) => s.id === id)!;
    const skipped = isSkipped(id);
    const isLast = id === 'finish';
    return {
      num: setupStepIndex(id) + 1,
      titleKey: def.titleKey,
      descKey: def.descKey,
      optional: def.optional,
      skipped,
      done: doneSteps.has(id),
      collapsed: skipped,
      onSkip: !isLast && def.optional ? () => skipStep(id) : undefined,
      onUnskip: skipped ? () => unskipStep(id) : undefined,
    };
  }

  return (
    <div className="page-stack setup-wizard">
      <Card title={translate(locale, 'quickStart')} description={translate(locale, 'setupHintRefactored')}>
        <div className="setup-intro">
          <h2>{translate(locale, 'setupIntroTitle')}</h2>
          <p>{translate(locale, 'setupIntroDesc')}</p>
          <div className="setup-checklist">
            <h4>{translate(locale, 'setupReqTitle')}</h4>
            <ul>
              {checklist.map((key) => (
                <li key={key} className={key === 'setupReq6' ? 'warn' : ''}>
                  {translate(locale, key)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <SetupWizardNav
        activeStep={activeStep}
        skipped={new Set(SETUP_STEPS.filter((s) => isSkipped(s.id)).map((s) => s.id))}
        doneSteps={doneSteps}
        onSelect={setActiveStep}
      />

      {activeStep === 'flash' && (
        <SetupStepCard
          {...stepProps('flash')}
          actions={renderStepActions(
            'flash',
            <button type="button" onClick={() => goTab('maintain')}>
              {translate(locale, 'setupStep1Action')}
            </button>,
          )}
        />
      )}

      {activeStep === 'connect' && (
        <SetupStepCard
          {...stepProps('connect')}
          actions={renderStepActions(
            'connect',
            <button type="button" disabled={!state.connected || state.busy} onClick={() => void probeBoard()}>
              {translate(locale, 'setupStep2Action')}
            </button>,
          )}
        >
          {Object.keys(probeResults).length > 0 ? (
            <SetupProbePanel
              results={probeResults}
              onGoVbusCal={() => setActiveStep('vbusCal')}
            />
          ) : null}
        </SetupStepCard>
      )}

      {activeStep === 'erase' && (
        <SetupStepCard
          {...stepProps('erase')}
          actions={renderStepActions(
            'erase',
            <button type="button" className="danger" disabled={!state.connected || state.busy} onClick={() => void eraseConfig()}>
              {translate(locale, 'setupStep3Action')}
            </button>,
          )}
        />
      )}

      {activeStep === 'vbusCal' && (
        <SetupStepCard
          {...stepProps('vbusCal')}
          actions={renderStepActions(
            'vbusCal',
            <button type="button" onClick={() => goTab('motor')}>
              {translate(locale, 'setupStep4Open')}
            </button>,
          )}
        >
          <VbusCalPanel
            active={activeStep === 'vbusCal'}
            onVbusReading={setLiveVbusV}
            onMultimeterV={setMultimeterVbusV}
          />
          {renderRecommendations(stepRecommendations, {}, () => {})}
        </SetupStepCard>
      )}

      {activeStep === 'power' && (
        <SetupStepCard
          {...stepProps('power')}
          actions={renderStepActions(
            'power',
            <>
              <button type="button" className="ok" disabled={!state.connected || state.busy} onClick={() => void applySpecs('power', POWER_SPECS, powerValues)}>
                {translate(locale, 'setupStep4Apply')}
              </button>
              <button type="button" onClick={() => goTab('motor')}>
                {translate(locale, 'setupStep4Open')}
              </button>
            </>,
          )}
        >
          {renderRecommendations(stepRecommendations, powerValues, () => {
            if (stepRecommendations) {
              applyRecommendationsToForm(stepRecommendations, setPowerValues);
            }
          })}
          <SetupParamForm specs={POWER_SPECS} values={powerValues} onChange={(path, value) => setPowerValues((c) => ({ ...c, [path]: value }))} />
        </SetupStepCard>
      )}

      {activeStep === 'motor' && (
        <SetupStepCard
          {...stepProps('motor')}
          actions={renderStepActions(
            'motor',
            <>
              <button type="button" className="ok" disabled={!state.connected || state.busy} onClick={() => void applySpecs('motor', MOTOR_SPECS, motorValues)}>
                {translate(locale, 'setupStep5Apply')}
              </button>
              <button type="button" onClick={() => goTab('motor')}>
                {translate(locale, 'setupStep5Open')}
              </button>
            </>,
          )}
        >
          {renderRecommendations(stepRecommendations, motorValues, () => {
            if (stepRecommendations) {
              applyRecommendationsToForm(stepRecommendations, setMotorValues);
            }
          })}
          <SetupParamForm specs={MOTOR_SPECS} values={motorValues} onChange={(path, value) => setMotorValues((c) => ({ ...c, [path]: value }))} />
        </SetupStepCard>
      )}

      {activeStep === 'encoder' && (
        <SetupStepCard
          {...stepProps('encoder')}
          actions={renderStepActions(
            'encoder',
            <>
              <button type="button" className="ok" disabled={!state.connected || state.busy} onClick={() => void applySpecs('encoder', ENC_SPECS, encValues)}>
                {translate(locale, 'setupStep6Apply')}
              </button>
              <button
                type="button"
                disabled={!state.connected || state.busy}
                onClick={() => {
                  applyAs5047Preset(dispatch);
                  dispatch({ type: 'append-log', direction: 'info', message: translate(locale, 'setupAs5047Staged') });
                }}
              >
                {translate(locale, 'setupAs5047Preset')}
              </button>
              <button type="button" onClick={() => goTab('calibration')}>
                {translate(locale, 'setupStep6Open')}
              </button>
            </>,
          )}
        >
          {renderRecommendations(stepRecommendations, encValues, () => {
            if (stepRecommendations) {
              applyRecommendationsToForm(stepRecommendations, setEncValues);
            }
          })}
          <p className="setup-checkpoint-hint">{translate(locale, 'setupEncoderPreCalHint')}</p>
          <SetupParamForm specs={ENC_SPECS} values={encValues} onChange={(path, value) => setEncValues((c) => ({ ...c, [path]: value }))} />
        </SetupStepCard>
      )}

      {activeStep === 'saveNvm1' && (
        <SetupStepCard
          {...stepProps('saveNvm1')}
          actions={renderStepActions(
            'saveNvm1',
            <button
              type="button"
              className="ok"
              disabled={!state.connected || state.busy}
              onClick={() => {
                void saveAll().then(() => setAppliedFlags((p) => ({ ...p, saveNvm1: true })));
              }}
            >
              {translate(locale, 'save')}
              {saveBadge}
            </button>,
          )}
        >
          {pendingSave > 0 ? (
            <p className="setup-checkpoint-hint">{translate(locale, 'setupSaveNvm1Pending', { n: String(pendingSave) })}</p>
          ) : null}
        </SetupStepCard>
      )}

      {activeStep === 'motorCal' && (
        <SetupStepCard
          {...stepProps('motorCal')}
          actions={renderStepActions(
            'motorCal',
            <>
              <button type="button" className="warn" disabled={!state.connected || state.busy} onClick={() => void runMotorCal()}>
                {translate(locale, 'setupStep7Action')}
              </button>
              <button type="button" onClick={() => goTab('calibration')}>
                {translate(locale, 'setupStep7Open')}
              </button>
            </>,
          )}
        >
          {motorResults ? (
            <div className="setup-step7-result">
              <div className="header">{translate(locale, 'setupStep7ResultTitle')}</div>
              <div className="row">
                <span className="lbl">phase_resistance</span>
                <span className="val">{motorResults.resistance ?? '—'}</span>
              </div>
              <div className="row">
                <span className="lbl">phase_inductance</span>
                <span className="val">{motorResults.inductance ?? '—'}</span>
              </div>
            </div>
          ) : null}
          <CalErrorPanel fields={motorCalErrorFields} visible={motorCalDone} refreshKey={motorErrorRefreshKey} />
        </SetupStepCard>
      )}

      {activeStep === 'encoderCal' && (
        <SetupStepCard
          {...stepProps('encoderCal')}
          actions={renderStepActions(
            'encoderCal',
            <>
              <button type="button" className="warn" disabled={!state.connected || state.busy} onClick={() => void runEncoderCal()}>
                {translate(locale, 'setupStep8Action')}
              </button>
              <button type="button" onClick={() => goTab('calibration')}>
                {translate(locale, 'setupStep8Open')}
              </button>
            </>,
          )}
        >
          <CalErrorPanel fields={encoderCalErrorFields} visible={encCalDone} refreshKey={encErrorRefreshKey} />
        </SetupStepCard>
      )}

      {activeStep === 'bootSave' && (
        <SetupStepCard
          {...stepProps('bootSave')}
          actions={renderStepActions(
            'bootSave',
            <>
              <button
                type="button"
                className="ok"
                disabled={!state.connected || state.busy}
                onClick={() =>
                  void markPrecalibrated(dispatch, state.fieldValues).then((r) => {
                    dispatch({
                      type: 'append-log',
                      direction: r.fail === 0 ? 'info' : 'error',
                      message: translate(locale, 'setupToastWritten', { ok: r.ok, fail: r.fail }),
                    });
                    if (r.fail === 0) {
                      dispatch({ type: 'set-nvm-pending', pending: true });
                    }
                  })
                }
              >
                {translate(locale, 'setupStep9Apply')}
              </button>
              <button
                type="button"
                disabled={!state.connected || state.busy}
                onClick={() => {
                  void saveAll().then(() => setAppliedFlags((p) => ({ ...p, bootSave: true })));
                }}
              >
                {translate(locale, 'setupStep9Save')}
                {saveBadge}
              </button>
            </>,
          )}
        />
      )}

      {activeStep === 'ffb' && (
        <SetupStepCard
          {...stepProps('ffb')}
          actions={renderStepActions(
            'ffb',
            <>
              <button type="button" className="ok" disabled={!state.connected || state.busy} onClick={() => void applySpecs('ffb', FFB_SPECS, ffbValues)}>
                {translate(locale, 'setupStep10Apply')}
              </button>
              <button type="button" onClick={() => goTab('tune')}>
                {translate(locale, 'setupStep10Open')}
              </button>
            </>,
          )}
        >
          {renderRecommendations(stepRecommendations, ffbValues, () => {
            if (stepRecommendations) {
              applyRecommendationsToForm(stepRecommendations, setFfbValues);
            }
          })}
          <SetupParamForm specs={FFB_SPECS} values={ffbValues} onChange={(path, value) => setFfbValues((c) => ({ ...c, [path]: value }))} />
        </SetupStepCard>
      )}

      {activeStep === 'hidTest' && (
        <SetupStepCard
          {...stepProps('hidTest')}
          actions={renderStepActions(
            'hidTest',
            <button type="button" onClick={() => goTab('ffb-test')}>
              {translate(locale, 'setupStep11Action')}
            </button>,
          )}
        >
          <HidConnectionToolbar
            locale={locale}
            hidSupported={state.hidSupported}
            connected={hid.connected}
            deviceName={hid.deviceName}
            error={hid.error}
            onConnect={() => void hid.connect()}
            onDisconnect={() => void hid.disconnect()}
          />
        </SetupStepCard>
      )}

      {activeStep === 'finish' && (
        <SetupStepCard
          {...stepProps('finish')}
          actions={renderStepActions(
            'finish',
            <>
              <button type="button" onClick={() => goTab('inputs')}>
                {translate(locale, 'setupStep12OpenInputs')}
              </button>
              <button type="button" onClick={() => goTab('observe')}>
                {translate(locale, 'setupStep12OpenObserve')}
              </button>
            </>,
          )}
        />
      )}
    </div>
  );
}
