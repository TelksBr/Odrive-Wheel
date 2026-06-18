import { useMemo, useState, type ReactNode } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card } from '../../shared/ui';
import { serialService } from '../serial/SerialService';
import { unifiedSave } from '../board/unifiedSave';
import { HidConnectionToolbar } from '../hid/HidConnectionToolbar';
import { useHidConnection } from '../hid/useHidConnection';
import {
  eraseAndReconnect,
  markPrecalibrated,
  writePaths,
} from '../calibration/calibrationPresets';
import { readMotorCalResults, runAxisState } from '../calibration/calibrationRunner';
import { CalErrorPanel } from '../calibration/CalErrorPanel';
import { encoderCalErrorFields, motorCalErrorFields } from '../calibration/calibrationActions';
import {
  initialFormValues,
  SetupParamForm,
  specsToWrites,
  type SetupFormSpec,
} from '../calibration/SetupParamForm';

const POWER_SPECS: SetupFormSpec[] = [
  { path: 'config.brake_resistance', type: 'number', defaultValue: 2 },
  { path: 'config.enable_brake_resistor', type: 'bool', defaultValue: true },
  { path: 'config.dc_bus_undervoltage_trip_level', type: 'number', defaultValue: 8 },
  { path: 'config.dc_bus_overvoltage_trip_level', type: 'number', defaultValue: 28 },
  { path: 'config.dc_max_positive_current', type: 'number', defaultValue: 25 },
  { path: 'config.dc_max_negative_current', type: 'number', defaultValue: -15 },
  { path: 'config.max_regen_current', type: 'number', defaultValue: 0 },
];

const MOTOR_SPECS: SetupFormSpec[] = [
  { path: 'axis0.motor.config.motor_type', type: 'number', defaultValue: 0 },
  { path: 'axis0.motor.config.pole_pairs', type: 'number', defaultValue: 4 },
  { path: 'axis0.motor.config.torque_constant', type: 'number', defaultValue: 0.87 },
  { path: 'axis0.motor.config.current_lim', type: 'number', defaultValue: 20 },
  { path: 'axis0.motor.config.calibration_current', type: 'number', defaultValue: 5 },
  { path: 'axis0.motor.config.resistance_calib_max_voltage', type: 'number', defaultValue: 12 },
  { path: 'axis0.motor.config.requested_current_range', type: 'number', defaultValue: 25 },
  { path: 'axis0.motor.config.current_control_bandwidth', type: 'number', defaultValue: 200 },
];

const ENC_SPECS: SetupFormSpec[] = [
  { path: 'axis0.encoder.config.mode', type: 'number', defaultValue: 0 },
  { path: 'axis0.encoder.config.cpr', type: 'number', defaultValue: 8192 },
  { path: 'axis0.encoder.config.direction', type: 'number', defaultValue: 1 },
  { path: 'axis0.encoder.config.bandwidth', type: 'number', defaultValue: 200 },
  { path: 'axis0.encoder.config.use_index', type: 'bool', defaultValue: false },
  { path: 'axis0.encoder.config.abs_spi_cs_gpio_pin', type: 'number', defaultValue: 7 },
  { path: 'axis0.encoder.config.pre_calibrated', type: 'bool', defaultValue: false },
];

const FFB_SPECS: SetupFormSpec[] = [
  { path: 'axis.range', type: 'number', defaultValue: 900 },
  { path: 'axis.maxtorque', type: 'number', defaultValue: 3 },
  { path: 'axis.fxratio', type: 'number', defaultValue: 1 },
];

function SetupStepCard({
  num,
  titleKey,
  descKey,
  children,
  actions,
}: {
  num: number;
  titleKey: string;
  descKey: string;
  children?: ReactNode;
  actions: React.ReactNode;
}) {
  const { state } = useAppState();
  const locale = state.locale;
  return (
    <article className="setup-step-card">
      <h3>
        <span className="num">{num}</span>
        {translate(locale, titleKey)}
      </h3>
      <p>{translate(locale, descKey)}</p>
      {children}
      <div className="toolbar">{actions}</div>
    </article>
  );
}

export function QuickStartPage() {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const hid = useHidConnection(locale);

  const [powerValues, setPowerValues] = useState(() => initialFormValues(POWER_SPECS));
  const [motorValues, setMotorValues] = useState(() => initialFormValues(MOTOR_SPECS));
  const [encValues, setEncValues] = useState(() => initialFormValues(ENC_SPECS));
  const [ffbValues, setFfbValues] = useState(() => initialFormValues(FFB_SPECS));
  const [motorCalDone, setMotorCalDone] = useState(false);
  const [encCalDone, setEncCalDone] = useState(false);
  const [motorErrorRefreshKey, setMotorErrorRefreshKey] = useState(0);
  const [encErrorRefreshKey, setEncErrorRefreshKey] = useState(0);
  const [motorResults, setMotorResults] = useState<{ resistance: string | null; inductance: string | null } | null>(
    null,
  );
  const [probeResults, setProbeResults] = useState<Record<string, string>>({});

  const checklist = useMemo(
    () => [
      'setupReq1',
      'setupReq2',
      'setupReq3',
      'setupReq4',
      'setupReq5',
      'setupReq6',
    ],
    [],
  );

  function goTab(tab: typeof state.activeTab) {
    dispatch({ type: 'set-tab', tab });
  }

  async function applySpecs(specs: SetupFormSpec[], values: Record<string, string>) {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const result = await writePaths(specsToWrites(specs, values), dispatch);
      dispatch({
        type: 'append-log',
        direction: result.fail === 0 ? 'info' : 'error',
        message: translate(locale, 'setupToastWritten', { ok: result.ok, fail: result.fail }),
      });
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

  async function triggerSave() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const result = await unifiedSave({ dirtyPaths: state.dirtyPaths, fieldValues: state.fieldValues });
      if (result.reconnected && result.values) {
        dispatch({ type: 'hydrate-fields', values: result.values, dirty: false });
        dispatch({ type: 'append-log', direction: 'info', message: translate(locale, 'toastSaveComplete') });
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

  return (
    <div className="page-stack setup-wizard">
      <Card title={translate(locale, 'quickStart')} description={translate(locale, 'setupHint')}>
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

      <SetupStepCard
        num={1}
        titleKey="setupStep1Title"
        descKey="setupStep1Desc"
        actions={
          <button type="button" onClick={() => goTab('maintain')}>
            {translate(locale, 'setupStep1Action')}
          </button>
        }
      />

      <SetupStepCard
        num={2}
        titleKey="setupStep2Title"
        descKey="setupStep2Desc"
        actions={
          <button type="button" disabled={!state.connected || state.busy} onClick={() => void probeBoard()}>
            {translate(locale, 'setupStep2Action')}
          </button>
        }
      >
        {Object.keys(probeResults).length > 0 ? (
          <div className="debug-grid">
            {Object.entries(probeResults).map(([cmd, val]) => (
              <div className="debug-cell" key={cmd}>
                <code>{cmd}</code>
                <pre>{val}</pre>
              </div>
            ))}
          </div>
        ) : null}
      </SetupStepCard>

      <SetupStepCard
        num={3}
        titleKey="setupStep3Title"
        descKey="setupStep3Desc"
        actions={
          <button type="button" className="danger" disabled={!state.connected || state.busy} onClick={() => void eraseConfig()}>
            {translate(locale, 'setupStep3Action')}
          </button>
        }
      />

      <SetupStepCard
        num={4}
        titleKey="setupStep4Title"
        descKey="setupStep4Desc"
        actions={
          <>
            <button type="button" className="ok" disabled={!state.connected || state.busy} onClick={() => void applySpecs(POWER_SPECS, powerValues)}>
              {translate(locale, 'setupStep4Apply')}
            </button>
            <button type="button" onClick={() => goTab('motor')}>
              {translate(locale, 'setupStep4Open')}
            </button>
          </>
        }
      >
        <SetupParamForm
          specs={POWER_SPECS}
          values={powerValues}
          onChange={(path, value) => setPowerValues((c) => ({ ...c, [path]: value }))}
        />
      </SetupStepCard>

      <SetupStepCard
        num={5}
        titleKey="setupStep5Title"
        descKey="setupStep5Desc"
        actions={
          <>
            <button type="button" className="ok" disabled={!state.connected || state.busy} onClick={() => void applySpecs(MOTOR_SPECS, motorValues)}>
              {translate(locale, 'setupStep5Apply')}
            </button>
            <button type="button" onClick={() => goTab('motor')}>
              {translate(locale, 'setupStep5Open')}
            </button>
          </>
        }
      >
        <SetupParamForm
          specs={MOTOR_SPECS}
          values={motorValues}
          onChange={(path, value) => setMotorValues((c) => ({ ...c, [path]: value }))}
        />
      </SetupStepCard>

      <SetupStepCard
        num={6}
        titleKey="setupStep6Title"
        descKey="setupStep6Desc"
        actions={
          <>
            <button type="button" className="ok" disabled={!state.connected || state.busy} onClick={() => void applySpecs(ENC_SPECS, encValues)}>
              {translate(locale, 'setupStep6Apply')}
            </button>
            <button type="button" onClick={() => goTab('calibration')}>
              {translate(locale, 'setupStep6Open')}
            </button>
          </>
        }
      >
        <SetupParamForm
          specs={ENC_SPECS}
          values={encValues}
          onChange={(path, value) => setEncValues((c) => ({ ...c, [path]: value }))}
        />
      </SetupStepCard>

      <SetupStepCard
        num={7}
        titleKey="setupStep7Title"
        descKey="setupStep7Desc"
        actions={
          <>
            <button type="button" className="warn" disabled={!state.connected || state.busy} onClick={() => void runMotorCal()}>
              {translate(locale, 'setupStep7Action')}
            </button>
            <button type="button" onClick={() => goTab('calibration')}>
              {translate(locale, 'setupStep7Open')}
            </button>
          </>
        }
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

      <SetupStepCard
        num={8}
        titleKey="setupStep8Title"
        descKey="setupStep8Desc"
        actions={
          <>
            <button type="button" className="warn" disabled={!state.connected || state.busy} onClick={() => void runEncoderCal()}>
              {translate(locale, 'setupStep8Action')}
            </button>
            <button type="button" onClick={() => goTab('calibration')}>
              {translate(locale, 'setupStep8Open')}
            </button>
          </>
        }
      >
        <CalErrorPanel fields={encoderCalErrorFields} visible={encCalDone} refreshKey={encErrorRefreshKey} />
      </SetupStepCard>

      <SetupStepCard
        num={9}
        titleKey="setupStep9Title"
        descKey="setupStep9Desc"
        actions={
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
            <button type="button" disabled={!state.connected || state.busy} onClick={() => void triggerSave()}>
              {translate(locale, 'setupStep9Save')}
            </button>
            <button type="button" onClick={() => goTab('calibration')}>
              {translate(locale, 'setupStep9Open')}
            </button>
          </>
        }
      />

      <SetupStepCard
        num={10}
        titleKey="setupStep10Title"
        descKey="setupStep10Desc"
        actions={
          <>
            <button type="button" className="ok" disabled={!state.connected || state.busy} onClick={() => void applySpecs(FFB_SPECS, ffbValues)}>
              {translate(locale, 'setupStep10Apply')}
            </button>
            <button type="button" onClick={() => goTab('tune')}>
              {translate(locale, 'setupStep10Open')}
            </button>
          </>
        }
      >
        <SetupParamForm
          specs={FFB_SPECS}
          values={ffbValues}
          onChange={(path, value) => setFfbValues((c) => ({ ...c, [path]: value }))}
        />
      </SetupStepCard>

      <SetupStepCard
        num={11}
        titleKey="setupStep11Title"
        descKey="setupStep11Desc"
        actions={
          <button type="button" onClick={() => goTab('ffb-test')}>
            {translate(locale, 'setupStep11Action')}
          </button>
        }
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

      <SetupStepCard
        num={12}
        titleKey="setupStep12Title"
        descKey="setupStep12Desc"
        actions={
          <>
            <button type="button" onClick={() => goTab('inputs')}>
              {translate(locale, 'setupStep12OpenInputs')}
            </button>
            <button type="button" onClick={() => goTab('observe')}>
              {translate(locale, 'setupStep12OpenObserve')}
            </button>
            <button type="button" onClick={() => goTab('observe')}>
              {translate(locale, 'setupStep12OpenDebug')}
            </button>
          </>
        }
      />
    </div>
  );
}
