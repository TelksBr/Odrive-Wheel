import { useEffect, useRef, useState } from 'react';
import { AppStateProvider, useAppState } from './app/AppState';
import { tabs } from './app/tabs';
import { translate } from './i18n/messages';
import { serialService, type SerialEvent } from './features/serial/SerialService';
import { formatSerialRxLine } from './features/serial/serialLogFormat';
import { readField } from './features/board/BoardProtocol';
import { useBoardSave } from './features/board/useBoardSave';
import { initialFieldsForTab, refreshFieldsForTab } from './app/refreshPolicy';
import { toast, toastKey } from './shared/toastActions';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { CalibrationPage } from './features/calibration/CalibrationPage';
import { ConfigPage } from './features/config/ConfigPage';
import { ConsolePage } from './features/console/ConsolePage';
import { QuickStartPage } from './features/setup/QuickStartPage';
import { TuneWorkspace } from './features/workspaces/TuneWorkspace';
import { MaintainWorkspace } from './features/workspaces/MaintainWorkspace';
import { ObserveWorkspace } from './features/workspaces/ObserveWorkspace';
import { InputsWorkspace } from './features/workspaces/InputsWorkspace';
import { CommandCenterPage } from './features/commands/CommandCenterPage';
import { PwaStatus } from './features/pwa/PwaStatus';
import { FfbTestPage } from './features/hid/FfbTestPage';
import { PerformanceTestPage } from './features/perfTest/PerformanceTestPage';
import { AboutPage } from './features/about/AboutPage';
import { Pill } from './shared/ui';
import { AppIcon } from './shared/ui/AppIcon';
import { LiveAppLogo } from './shared/ui/LiveAppLogo';
import { useWheelPositionPoll } from './features/wheel/useWheelPositionPoll';
import { SidebarSearch } from './features/navigation/SidebarSearch';
import { FieldFocusEffect } from './features/navigation/FieldFocusEffect';
import { ToastHost } from './shared/ToastHost';

function AppShell() {
  const { state, dispatch } = useAppState();
  const [navQuery, setNavQuery] = useState('');
  const [serialConnecting, setSerialConnecting] = useState(false);
  const reconnectInFlightRef = useRef(false);
  const reconnectCooldownUntilRef = useRef(0);
  const manualDisconnectRequestedRef = useRef(false);
  const autoReconnectBlockedRef = useRef(false);
  const { saveAll, saveButtonLabel, saveBadge } = useBoardSave();
  const skipReadPaths = [...new Set([...state.dirtyPaths, ...state.nvmPendingPaths])];
  const skipReadKey = skipReadPaths.join('\0');
  const wheelPollActive = state.connected && !state.busy && state.activeTab !== 'calibration';
  const wheelPositionDegRef = useWheelPositionPoll(state.connected, wheelPollActive);

  useEffect(() => {
    function onSerialEvent(event: SerialEvent) {
      if (event.type === 'connected') {
        autoReconnectBlockedRef.current = false;
        dispatch({ type: 'set-connected', connected: true });
        dispatch({ type: 'append-log', direction: 'info', message: translate(state.locale, 'serialConnectedLog') });
      } else if (event.type === 'disconnected') {
        if (manualDisconnectRequestedRef.current) {
          autoReconnectBlockedRef.current = true;
          manualDisconnectRequestedRef.current = false;
        }
        dispatch({ type: 'set-connected', connected: false });
        dispatch({ type: 'append-log', direction: 'info', message: translate(state.locale, 'serialDisconnectedLog') });
      } else if (event.type === 'rx') {
        dispatch({
          type: 'append-log',
          direction: 'rx',
          message: formatSerialRxLine(event.line, event.command),
        });
      } else if (event.type === 'tx') {
        dispatch({ type: 'append-log', direction: 'tx', message: event.line });
      } else if (event.type === 'info') {
        dispatch({ type: 'append-log', direction: 'info', message: event.message });
      } else {
        dispatch({ type: 'append-log', direction: 'error', message: event.message });
      }
    }

    return serialService.subscribe(onSerialEvent);
  }, [dispatch, state.locale]);

  useEffect(() => {
    let cancelled = false;
    async function reconnect() {
      if (!state.serialSupported || !state.autoReconnect || state.connected || state.busy || autoReconnectBlockedRef.current) {
        return;
      }
      if (reconnectInFlightRef.current) {
        return;
      }
      if (Date.now() < reconnectCooldownUntilRef.current) {
        return;
      }
      reconnectInFlightRef.current = true;
      dispatch({ type: 'set-reconnecting', reconnecting: true });
      try {
        const ok = await serialService.reconnectKnownPort();
        if (!ok && !cancelled) {
          dispatch({ type: 'append-log', direction: 'info', message: translate(state.locale, 'noKnownPortLog') });
          reconnectCooldownUntilRef.current = Date.now() + 5000;
        } else if (ok) {
          reconnectCooldownUntilRef.current = 0;
        }
      } catch (error) {
        if (!cancelled) {
          dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
        }
        reconnectCooldownUntilRef.current = Date.now() + 5000;
      } finally {
        reconnectInFlightRef.current = false;
        if (!cancelled) {
          dispatch({ type: 'set-reconnecting', reconnecting: false });
        }
      }
    }
    void reconnect();
    return () => {
      cancelled = true;
    };
  }, [dispatch, state.autoReconnect, state.busy, state.connected, state.locale, state.serialSupported]);

  useEffect(() => {
    if (!state.connected || state.busy) {
      return undefined;
    }

    let cancelled = false;
    async function readInitialPageFields() {
      const fields =
        state.activeTab === 'calibration'
          ? refreshFieldsForTab(state.activeTab, skipReadPaths)
          : initialFieldsForTab(state.activeTab, skipReadPaths);
      if (fields.length === 0) {
        return;
      }
      try {
        for (const field of fields) {
          if (cancelled) {
            return;
          }
          const value = await readField(field);
          dispatch({ type: 'set-field', path: field.path, value, dirty: false });
        }
        dispatch({ type: 'mark-refreshed' });
      } catch (error) {
        if (!cancelled) {
          dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      }
    }

    void readInitialPageFields();
    return () => {
      cancelled = true;
    };
  }, [skipReadKey, dispatch, state.activeTab, state.busy, state.connected]);

  async function toggleConnection() {
    if (serialConnecting) {
      return;
    }
    setSerialConnecting(true);
    try {
      if (state.connected) {
        manualDisconnectRequestedRef.current = true;
        await serialService.disconnect();
      } else {
        autoReconnectBlockedRef.current = false;
        toastKey(dispatch, state.locale, 'serialConnecting', 'info');
        await serialService.connect();
        toastKey(dispatch, state.locale, 'serialConnectedLog', 'ok');
      }
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      let msg = raw;
      if (raw === 'serialWrongPort') {
        msg = translate(state.locale, 'serialWrongPort');
      } else if (raw === 'serialConnectCancelled') {
        msg = translate(state.locale, 'serialConnectCancelled');
      } else if (raw === 'Web Serial is not available') {
        msg = translate(state.locale, 'serialUnsupported');
      }
      dispatch({ type: 'append-log', direction: 'error', message: msg });
      toast(dispatch, msg, 'error');
    } finally {
      setSerialConnecting(false);
    }
  }

  async function manualRefreshAll() {
    if (!state.connected || state.busy) return;
    dispatch({ type: 'set-busy', busy: true });
    try {
      // Force-read all fields for the current tab (ignore dirty paths)
      const fields = initialFieldsForTab(state.activeTab, []);
      for (const field of fields) {
        const value = await readField(field);
        dispatch({ type: 'set-field', path: field.path, value, dirty: false });
      }
      dispatch({ type: 'mark-refreshed' });
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  function renderActiveTab() {
    switch (state.activeTab) {
      case 'dashboard':
        return <DashboardPage />;
      case 'setup':
        return <QuickStartPage />;
      case 'calibration':
        return <CalibrationPage />;
      case 'motor':
        return (
          <ConfigPage
            filter="odrive"
            includeGroups={['psu', 'axis', 'motor', 'encoder', 'controller', 'fet-thermistor', 'motor-thermistor']}
            allowOpenffboardPaths={['sys.vbusdiv']}
          />
        );
      case 'tune':
        return <TuneWorkspace />;
      case 'ffb-test':
        return <FfbTestPage />;
      case 'perf-test':
        return <PerformanceTestPage />;
      case 'inputs':
        return <InputsWorkspace />;
      case 'observe':
        return <ObserveWorkspace />;
      case 'maintain':
        return <MaintainWorkspace />;
      case 'commands':
        return <CommandCenterPage />;
      case 'console':
        return <ConsolePage />;
      case 'about':
        return <AboutPage />;
      default:
        return <DashboardPage />;
    }
  }

  const activeTab = tabs.find((tab) => tab.id === state.activeTab);
  const activeGroupKey = `group${(activeTab?.group ?? 'operate')[0].toUpperCase()}${(activeTab?.group ?? 'operate').slice(1)}`;

  return (
    <div className="app-shell">
      <FieldFocusEffect />
      <ToastHost />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-lockup">
            <LiveAppLogo size={32} connected={state.connected} positionDegRef={wheelPositionDegRef} />
            <div>
              <strong>{translate(state.locale, 'appTitle')}</strong>
              <span>{translate(state.locale, 'appSubtitle')}</span>
            </div>
          </div>
        </div>
        <SidebarSearch query={navQuery} onQueryChange={setNavQuery} />
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-context">
            <div>
              <span className="eyebrow">{translate(state.locale, activeGroupKey)}</span>
              <h1>{activeTab ? translate(state.locale, activeTab.labelKey) : translate(state.locale, 'appTitle')}</h1>
            </div>
            <div className="topbar-pills">
              <Pill tone={state.connected ? 'ok' : 'neutral'}>
                {translate(state.locale, state.connected ? 'connected' : 'disconnected')}
              </Pill>
              {state.busy && <Pill tone="warn">{translate(state.locale, 'busy')}</Pill>}
              {state.reconnecting && <Pill tone="warn">{translate(state.locale, 'reconnecting')}</Pill>}
              {state.lastRefreshAt && (
                <Pill tone="neutral">{translate(state.locale, 'refreshed')} {state.lastRefreshAt}</Pill>
              )}
            </div>
          </div>

          <div className="topbar-actions">
            {/* Manual read-all for current page */}
            <button
              type="button"
              className="topbar-refresh-btn"
              disabled={!state.connected || state.busy}
              onClick={() => void manualRefreshAll()}
              title={translate(state.locale, 'refreshPageTitle')}
            >
              <AppIcon id="icon-refresh" size={14} />
              {translate(state.locale, 'refreshPage')}
            </button>

            <button
              type="button"
              className="topbar-save-btn ok"
              disabled={!state.connected || state.busy}
              onClick={() => void saveAll()}
              title={translate(state.locale, 'saveTitle')}
            >
              <AppIcon id="icon-save" size={14} />
              {saveButtonLabel()}{saveBadge}
            </button>

            <div className="topbar-divider" aria-hidden="true" />

            {/* Auto-reconnect */}
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={state.autoReconnect}
                onChange={(event) => dispatch({ type: 'set-auto-reconnect', autoReconnect: event.target.checked })}
              />
              {translate(state.locale, 'autoReconnect')}
            </label>

            <div className="topbar-divider" aria-hidden="true" />

            {/* Language */}
            <select
              className="topbar-select"
              aria-label={translate(state.locale, 'language')}
              value={state.locale}
              onChange={(event) => dispatch({ type: 'set-locale', locale: event.target.value === 'en' ? 'en' : 'pt' })}
            >
              <option value="pt">{translate(state.locale, 'localePt')}</option>
              <option value="en">{translate(state.locale, 'localeEn')}</option>
            </select>

            <PwaStatus locale={state.locale} />

            {/* Connect / Disconnect */}
            <button
              type="button"
              disabled={!state.serialSupported || serialConnecting}
              className={state.connected ? 'danger' : ''}
              title={state.connected ? undefined : translate(state.locale, 'connectSerialTitle')}
              onClick={() => void toggleConnection()}
            >
              {serialConnecting
                ? translate(state.locale, 'serialConnecting')
                : translate(state.locale, state.connected ? 'disconnect' : 'connect')}
            </button>
          </div>
        </header>
        <section className="content">{renderActiveTab()}</section>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <AppShell />
    </AppStateProvider>
  );
}
