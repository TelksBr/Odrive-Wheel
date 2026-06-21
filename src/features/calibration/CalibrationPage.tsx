import { useState } from 'react';

import { useAppState } from '../../app/AppState';

import { translate } from '../../i18n/messages';

import { axisStateLabel } from '../../i18n/fieldMeta';

import { Card, SectionHeader } from '../../shared/ui';

import { calibrationAxisActions, encoderCalErrorFields, motorCalErrorFields } from './calibrationActions';

import { anticogBootPersist, applyBootPersist } from './calibrationBootPresets';

import { clearErrors, runAxisState } from './calibrationRunner';

import { AnticoggingPanel } from './AnticoggingPanel';

import { BootFlagsPanel } from './BootFlagsPanel';

import { CalibrationSection } from './CalibrationSection';

import { CalibrationWizardCard } from './CalibrationWizardCard';

import { CalibrationIntegrityBanner } from './CalibrationIntegrityBanner';

import { EncoderToolsPanel } from './EncoderToolsPanel';

import { CalibrationTargetsPanel } from './CalibrationTargetsPanel';

import { useBoardSave } from '../board/useBoardSave';



function findAction(id: string) {

  return calibrationAxisActions.find((action) => action.id === id);

}



export function CalibrationPage() {

  const { state, dispatch } = useAppState();

  const locale = state.locale;

  const { saveAll, saveBadge, saveBlocked } = useBoardSave();

  const [advancedOpen, setAdvancedOpen] = useState(false);



  const axisState = state.fieldValues['axis0.current_state'] ?? '—';

  const motorCal = state.fieldValues['axis0.motor.is_calibrated'];

  const encoderReady = state.fieldValues['axis0.encoder.is_ready'];



  async function handleIdle() {

    dispatch({ type: 'set-busy', busy: true });

    try {

      const result = await runAxisState(1, 5000, false);

      dispatch({

        type: 'append-log',

        direction: result.ok ? 'info' : 'error',

        message: result.ok ? translate(locale, 'setupToastStateDone') : translate(locale, 'setupToastStateFail'),

      });

    } finally {

      dispatch({ type: 'set-busy', busy: false });

    }

  }



  async function handleClearErrors() {

    dispatch({ type: 'set-busy', busy: true });

    try {

      await clearErrors();

      dispatch({ type: 'append-log', direction: 'info', message: 'sc' });

    } finally {

      dispatch({ type: 'set-busy', busy: false });

    }

  }



  async function handleAnticogBoot() {

    dispatch({ type: 'set-busy', busy: true });

    try {

      const { ok, fail } = await applyBootPersist(anticogBootPersist, dispatch);

      dispatch({

        type: 'append-log',

        direction: fail === 0 ? 'info' : 'error',

        message: translate(locale, 'calBootApplied', { ok: String(ok), fail: String(fail) }),

      });

      if (fail === 0) {

        dispatch({ type: 'set-nvm-pending', pending: true });

      }

    } finally {

      dispatch({ type: 'set-busy', busy: false });

    }

  }



  async function runAdvanced(actionId: string) {

    const action = findAction(actionId);

    if (!action) {

      return;

    }

    dispatch({ type: 'set-busy', busy: true });

    try {

      const result = await runAxisState(action.state, action.timeoutMs, action.clearFirst !== false);

      const msg = result.ok

        ? translate(locale, 'setupToastStateDone')

        : `${translate(locale, 'setupToastStateFail')} (${result.reason ?? 'unknown'})`;

      dispatch({ type: 'append-log', direction: result.ok ? 'info' : 'error', message: msg });

    } finally {

      dispatch({ type: 'set-busy', busy: false });

    }

  }



  return (

    <div className="page-stack">

      <SectionHeader

        title={translate(locale, 'tabCalibration')}

        description={translate(locale, 'tabCalibrationDescription')}

      />



      {state.nvmPending || state.dirtyPaths.length > 0 ? (

        <div className="cal-nvm-banner">

          <p>

            {state.dirtyPaths.length > 0

              ? translate(locale, 'calNvmPendingDirty', { n: String(state.dirtyPaths.length) })

              : translate(locale, 'calNvmPendingBanner')}

          </p>

          <button type="button" className="ok" disabled={!state.connected || state.busy || saveBlocked} onClick={() => void saveAll()}>

            {translate(locale, 'calNvmSaveNow')}{saveBadge}

          </button>

        </div>

      ) : null}



      <CalibrationWizardCard />

      <CalibrationIntegrityBanner />



      <Card title={translate(locale, 'calStatusTitle')} description={translate(locale, 'calStatusDescription')}>

        <div className="cal-status-grid">

          <div className="cal-status-item">

            <span className="lbl">{translate(locale, 'calStatusAxisState')}</span>

            <span className="val">

              {axisState}{' '}

              <span className="muted">({axisStateLabel(locale, axisState)})</span>

            </span>

          </div>

          <div className="cal-status-item">

            <span className="lbl">{translate(locale, 'calStatusMotorCal')}</span>

            <span className={`val ${motorCal === '1' || motorCal === 'true' ? 'ok' : 'warn'}`}>

              {motorCal === '1' || motorCal === 'true' ? translate(locale, 'liveValueTrue') : translate(locale, 'liveValueFalse')}

            </span>

          </div>

          <div className="cal-status-item">

            <span className="lbl">{translate(locale, 'calStatusEncoderReady')}</span>

            <span className={`val ${encoderReady === '1' || encoderReady === 'true' ? 'ok' : 'warn'}`}>

              {encoderReady === '1' || encoderReady === 'true' ? translate(locale, 'liveValueTrue') : translate(locale, 'liveValueFalse')}

            </span>

          </div>

        </div>

        <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8, marginTop: 10 }}>

          <button type="button" className="warn" disabled={!state.connected || state.busy} onClick={() => void handleClearErrors()}>

            {translate(locale, 'setupErrClear')}

          </button>

          <button type="button" disabled={!state.connected || state.busy} onClick={() => void handleIdle()}>

            {translate(locale, 'calActionIdle')}

          </button>

        </div>

      </Card>



      <CalibrationTargetsPanel />



      <EncoderToolsPanel />



      <CalibrationSection

        titleKey="calSectionMotorTitle"

        descriptionKey="calSectionMotorDesc"

        prereqKey="calSectionMotorPrereq"

        action={findAction('motor-cal')}

        errorFields={motorCalErrorFields}

        showMotorResults

      />



      <CalibrationSection

        titleKey="calSectionEncoderTitle"

        descriptionKey="calSectionEncoderDesc"

        prereqKey="calSectionEncoderPrereq"

        action={findAction('encoder-cal')}

        errorFields={encoderCalErrorFields}

        showEncoderResults

      />



      <CalibrationSection

        titleKey="calSectionIndexTitle"

        descriptionKey="calSectionIndexDesc"

        prereqKey="calSectionIndexPrereq"

        action={findAction('index-search')}

      />



      <CalibrationSection

        titleKey="calSectionDirTitle"

        descriptionKey="calSectionDirDesc"

        action={findAction('encoder-dir')}

      />



      <CalibrationSection

        titleKey="calSectionClosedLoopTitle"

        descriptionKey="calSectionClosedLoopDesc"

        prereqKey="calSectionClosedLoopPrereq"

        action={findAction('closed-loop')}

      />



      <BootFlagsPanel />



      <Card title={translate(locale, 'anticogTitle')} description={translate(locale, 'anticogDescription')}>

        <AnticoggingPanel embedded />

        <div className="cal-boot-block" style={{ marginTop: 12 }}>

          <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>

            <button type="button" disabled={!state.connected || state.busy} onClick={() => void handleAnticogBoot()}>

              {translate(locale, 'calBootApply')}

            </button>

            <span className="cal-boot-hint">{translate(locale, 'calAnticogBootHint')}</span>

          </div>

        </div>

      </Card>



      <Card title={translate(locale, 'calAdvancedTitle')} description={translate(locale, 'calAdvancedDesc')}>

        <button type="button" className="ghost" onClick={() => setAdvancedOpen((open) => !open)}>

          {advancedOpen ? translate(locale, 'calAdvancedHide') : translate(locale, 'calAdvancedShow')}

        </button>

        {advancedOpen ? (

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 6, marginTop: 10 }}>

            {(['full-cal', 'lockin', 'homing'] as const).map((id) => {

              const action = findAction(id);

              if (!action) {

                return null;

              }

              return (

                <button

                  key={id}

                  type="button"

                  disabled={!state.connected || state.busy}

                  className={action.tone === 'danger' ? 'danger' : action.tone === 'warn' ? 'warn' : ''}

                  style={{ display: 'grid', gap: 3, textAlign: 'left', minHeight: 56, padding: '8px 10px' }}

                  onClick={() => void runAdvanced(id)}

                >

                  <strong style={{ fontSize: 13 }}>{translate(locale, action.labelKey)}</strong>

                  <code style={{ fontSize: 10, color: 'var(--muted-2)' }}>{translate(locale, action.subKey)}</code>

                </button>

              );

            })}

          </div>

        ) : null}

      </Card>

    </div>

  );

}


