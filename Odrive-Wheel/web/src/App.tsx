import { useEffect, useState } from 'react';
import { AppStateProvider, useAppState } from './app/AppState';
import { tabs } from './app/tabs';
import { translate } from './i18n/messages';
import { serialService, type SerialEvent } from './features/serial/SerialService';
import { readField } from './features/board/BoardProtocol';
import { initialFieldsForTab, refreshFieldsForTab } from './app/refreshPolicy';
import { DashboardPage } from './features/dashboard/DashboardPage';
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
import { Pill } from './shared/ui';

function AppShell() {
  const { state, dispatch } = useAppState();
  const [navQuery, setNavQuery] = useState('');
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
        dispatch({ type: 'append-log', direction: 'rx', message: event.line });
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
      if (!state.serialSupported || !state.autoReconnect || state.connected) {
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
  }, [dispatch, state.autoReconnect, state.connected, state.locale, state.serialSupported]);

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

  function renderActiveTab() {
    switch (state.activeTab) {
      case 'dashboard':
        return <DashboardPage />;
      case 'setup':
        return <QuickStartPage />;
      case 'motor':
        return <ConfigPage filter="odrive" />;
      case 'tune':
        return <TuneWorkspace />;
      case 'ffb-test':
        return <FfbTestPage />;
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
      default:
        return <DashboardPage />;
    }
  }

  const activeTab = tabs.find((tab) => tab.id === state.activeTab);
  const activeGroupKey = `group${(activeTab?.group ?? 'operate')[0].toUpperCase()}${(activeTab?.group ?? 'operate').slice(1)}`;
  const normalizedNavQuery = navQuery.trim().toLowerCase();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-lockup">
            <div className="brand-orb" aria-hidden="true">
              <span />
            </div>
            <div>
              <strong>{translate(state.locale, 'appTitle')}</strong>
              <span>{translate(state.locale, 'appSubtitle')}</span>
            </div>
          </div>
          <div className="nav-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={navQuery}
              onChange={(event) => setNavQuery(event.target.value)}
              placeholder={translate(state.locale, 'navSearch')}
            />
          </div>
        </div>
        <nav>
          {(['operate', 'tune', 'maintain'] as const).map((group) => (
            <div className="nav-group" key={group}>
              <span>{translate(state.locale, `group${group[0].toUpperCase()}${group.slice(1)}`)}</span>
              {tabs
                .filter((tab) => tab.group === group)
                .filter((tab) => {
                  if (!normalizedNavQuery) {
                    return true;
                  }
                  const label = translate(state.locale, tab.labelKey).toLowerCase();
                  const description = translate(state.locale, tab.descriptionKey).toLowerCase();
                  return label.includes(normalizedNavQuery) || description.includes(normalizedNavQuery);
                })
                .map((tab) => (
                  <button
                    type="button"
                    key={tab.id}
                    className={state.activeTab === tab.id ? 'active' : ''}
                    onClick={() => dispatch({ type: 'set-tab', tab: tab.id })}
                  >
                    <strong>{translate(state.locale, tab.labelKey)}</strong>
                    <small>{translate(state.locale, tab.descriptionKey)}</small>
                  </button>
                ))}
            </div>
          ))}
        </nav>
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
              {state.busy ? <Pill tone="warn">{translate(state.locale, 'busy')}</Pill> : null}
              {state.reconnecting ? <Pill tone="warn">{translate(state.locale, 'reconnecting')}</Pill> : null}
              {state.lastRefreshAt ? <Pill>{translate(state.locale, 'refreshed')} {state.lastRefreshAt}</Pill> : null}
            </div>
          </div>
          <div className="topbar-actions">
            <PwaStatus locale={state.locale} />
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={state.autoRefresh}
                onChange={(event) => dispatch({ type: 'set-auto-refresh', autoRefresh: event.target.checked })}
              />
              {translate(state.locale, 'autoRefresh')}
            </label>
            <select
              value={state.refreshIntervalMs}
              onChange={(event) => dispatch({ type: 'set-refresh-interval', refreshIntervalMs: Number(event.target.value) })}
            >
              <option value={1000}>1s</option>
              <option value={2500}>2.5s</option>
              <option value={5000}>5s</option>
            </select>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={state.autoReconnect}
                onChange={(event) => dispatch({ type: 'set-auto-reconnect', autoReconnect: event.target.checked })}
              />
              {translate(state.locale, 'autoReconnect')}
            </label>
            <select aria-label={translate(state.locale, 'language')} value={state.locale} onChange={(event) => dispatch({ type: 'set-locale', locale: event.target.value === 'en' ? 'en' : 'pt' })}>
              <option value="pt">PT</option>
              <option value="en">EN</option>
            </select>
            <button type="button" disabled={!state.serialSupported} onClick={() => void toggleConnection()}>
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
