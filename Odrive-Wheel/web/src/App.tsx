import { useEffect, useState } from 'react';
import { AppStateProvider, useAppState } from './app/AppState';
import { tabs } from './app/tabs';
import { translate } from './i18n/messages';
import { serialService, type SerialEvent } from './features/serial/SerialService';
import { formatSerialRxLine } from './features/serial/serialLogFormat';
import { readField } from './features/board/BoardProtocol';
import { unifiedSave, type SaveProgress } from './features/board/unifiedSave';
import { initialFieldsForTab, refreshFieldsForTab } from './app/refreshPolicy';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ConfigPage } from './features/config/ConfigPage';
import { MotorCalibrationExtras } from './features/calibration/MotorCalibrationExtras';
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
import { AppLogo, AppIcon } from './shared/ui/AppIcon';
import { SidebarSearch } from './features/navigation/SidebarSearch';
import { FieldFocusEffect } from './features/navigation/FieldFocusEffect';

const saveProgressKey: Record<SaveProgress, string> = {
  writing_changes: 'saveWritingChanges',
  disarming: 'saveDisarming',
  persisting_ffb: 'savePersistingFfb',
  persisting_odrive: 'savePersistingOdrive',
  rebooting: 'saveRebooting',
  reconnecting: 'saveReconnecting',
  reading_back: 'saveReadingBack',
};

function AppShell() {
  const { state, dispatch } = useAppState();
  const [navQuery, setNavQuery] = useState('');
  const [saveProgress, setSaveProgress] = useState<SaveProgress | null>(null);
  const dirtyKey = state.dirtyPaths.join('\0');

  useEffect(() => {
    function onSerialEvent(event: SerialEvent) {
      if (event.type === 'connected') {
        dispatch({ type: 'set-connected', connected: true });
        dispatch({ type: 'append-log', direction: 'info', message: translate(state.locale, 'serialConnectedLog') });
      } else if (event.type === 'disconnected') {
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
      } else {
        dispatch({ type: 'append-log', direction: 'error', message: event.message });
      }
    }

    return serialService.subscribe(onSerialEvent);
  }, [dispatch, state.locale]);

  useEffect(() => {
    let cancelled = false;
    async function reconnect() {
      if (!state.serialSupported || !state.autoReconnect || state.connected || state.busy) {
        return;
      }
      dispatch({ type: 'set-reconnecting', reconnecting: true });
      try {
        const ok = await serialService.reconnectKnownPort();
        if (!ok && !cancelled) {
          dispatch({ type: 'append-log', direction: 'info', message: translate(state.locale, 'noKnownPortLog') });
        }
      } catch (error) {
        if (!cancelled) {
          dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      } finally {
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
    if (!state.connected || !state.autoRefresh || state.busy) {
      return undefined;
    }

    let cancelled = false;
    async function refreshVisibleFields() {
      const fields = refreshFieldsForTab(state.activeTab, state.dirtyPaths);
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

    void refreshVisibleFields();
    const id = window.setInterval(() => void refreshVisibleFields(), state.refreshIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [dirtyKey, dispatch, state.activeTab, state.autoRefresh, state.busy, state.connected, state.refreshIntervalMs]);

  useEffect(() => {
    if (!state.connected || state.busy) {
      return undefined;
    }

    let cancelled = false;
    async function readInitialPageFields() {
      const fields = initialFieldsForTab(state.activeTab, state.dirtyPaths);
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
  }, [dirtyKey, dispatch, state.activeTab, state.busy, state.connected]);

  async function toggleConnection() {
    try {
      if (state.connected) {
        await serialService.disconnect();
      } else {
        await serialService.connect();
      }
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
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

  async function saveAll() {
    if (!state.connected) {
      dispatch({ type: 'append-log', direction: 'error', message: translate(state.locale, 'saveSerialRequired') });
      return;
    }
    if (state.busy) {
      return;
    }
    dispatch({ type: 'set-busy', busy: true });
    try {
      const result = await unifiedSave({
        dirtyPaths: state.dirtyPaths,
        fieldValues: state.fieldValues,
        onProgress: setSaveProgress,
      });
      if (result.reconnected && result.values) {
        for (const [path, value] of Object.entries(result.values)) {
          dispatch({ type: 'set-field', path, value, dirty: false });
        }
        dispatch({ type: 'clear-dirty' });
        dispatch({ type: 'mark-refreshed' });
        dispatch({
          type: 'append-log',
          direction: 'info',
          message: translate(state.locale, 'toastSaveComplete'),
        });
      } else if (!result.reconnected) {
        dispatch({ type: 'append-log', direction: 'error', message: translate(state.locale, 'saveReconnectFailed') });
      }
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaveProgress(null);
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  function saveButtonLabel(): string {
    if (!saveProgress) {
      return translate(state.locale, 'save');
    }
    return `⏳ ${translate(state.locale, saveProgressKey[saveProgress])}`;
  }

  function renderActiveTab() {
    switch (state.activeTab) {
      case 'dashboard':
        return <DashboardPage />;
      case 'setup':
        return <QuickStartPage />;
      case 'motor':
        return (
          <div className="page-stack">
            <MotorCalibrationExtras />
            <ConfigPage filter="odrive" />
          </div>
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
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-lockup">
            <AppLogo size={32} className="brand-logo" />
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
              {saveButtonLabel()}{state.dirtyPaths.length > 0 ? ` (${state.dirtyPaths.length})` : ''}
            </button>

            <div className="topbar-divider" aria-hidden="true" />

            {/* Auto-refresh group */}
            <div className="topbar-group">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={state.autoRefresh}
                  onChange={(event) => dispatch({ type: 'set-auto-refresh', autoRefresh: event.target.checked })}
                />
                {translate(state.locale, 'autoRefresh')}
              </label>
              <select
                className="topbar-select"
                value={state.refreshIntervalMs}
                disabled={!state.autoRefresh}
                onChange={(event) => dispatch({ type: 'set-refresh-interval', refreshIntervalMs: Number(event.target.value) })}
              >
                <option value={1000}>{translate(state.locale, 'refreshInterval1s')}</option>
                <option value={2500}>{translate(state.locale, 'refreshInterval2_5s')}</option>
                <option value={5000}>{translate(state.locale, 'refreshInterval5s')}</option>
              </select>
            </div>

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
              disabled={!state.serialSupported}
              className={state.connected ? 'danger' : ''}
              onClick={() => void toggleConnection()}
            >
              {translate(state.locale, state.connected ? 'disconnect' : 'connect')}
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
