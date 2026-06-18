import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import type { AppAction, AppState, TabId } from './types';
import type { Locale } from '../i18n/messages';

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const savedLocale = localStorage.getItem('odrive-wheel-locale') as Locale | null;
const savedAutoReconnect = localStorage.getItem('odrive-wheel-auto-reconnect');
const tabIds: TabId[] = ['dashboard', 'setup', 'calibration', 'motor', 'tune', 'ffb-test', 'perf-test', 'inputs', 'observe', 'maintain', 'commands', 'console', 'about'];

function initialTab(): TabId {
  const tab = new URLSearchParams(window.location.search).get('tab');
  return tabIds.includes(tab as TabId) ? (tab as TabId) : 'dashboard';
}

const initialState: AppState = {
  activeTab: initialTab(),
  locale: savedLocale === 'en' || savedLocale === 'pt' ? savedLocale : 'pt',
  connected: false,
  serialSupported: 'serial' in navigator,
  hidSupported: 'hid' in navigator,
  usbSupported: 'usb' in navigator,
  busy: false,
  autoReconnect: savedAutoReconnect !== 'false',
  reconnecting: false,
  dirtyPaths: [],
  nvmPending: false,
  fieldValues: {},
  logs: [],
};

const AppContext = createContext<AppContextValue | null>(null);

function reduceDirty(paths: string[], path: string, dirty: boolean): string[] {
  if (!dirty) {
    return paths.filter((item) => item !== path);
  }
  return paths.includes(path) ? paths : [...paths, path];
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'set-tab':
      window.history.replaceState(null, '', action.tab === 'dashboard' ? window.location.pathname : `${window.location.pathname}?tab=${action.tab}`);
      return { ...state, activeTab: action.tab };
    case 'set-locale':
      localStorage.setItem('odrive-wheel-locale', action.locale);
      return { ...state, locale: action.locale };
    case 'set-connected':
      return { ...state, connected: action.connected };
    case 'set-busy':
      return { ...state, busy: action.busy };
    case 'set-auto-reconnect':
      localStorage.setItem('odrive-wheel-auto-reconnect', String(action.autoReconnect));
      return { ...state, autoReconnect: action.autoReconnect };
    case 'set-reconnecting':
      return { ...state, reconnecting: action.reconnecting };
    case 'mark-refreshed':
      return { ...state, lastRefreshAt: new Date().toLocaleTimeString() };
    case 'set-field':
      return {
        ...state,
        fieldValues: { ...state.fieldValues, [action.path]: action.value },
        dirtyPaths: reduceDirty(state.dirtyPaths, action.path, action.dirty ?? true),
      };
    case 'hydrate-fields':
      return {
        ...state,
        fieldValues: { ...state.fieldValues, ...action.values },
        dirtyPaths: action.dirty ? [...new Set([...state.dirtyPaths, ...Object.keys(action.values)])] : state.dirtyPaths,
      };
    case 'clear-dirty':
      return { ...state, dirtyPaths: [], nvmPending: false };
    case 'set-nvm-pending':
      return { ...state, nvmPending: action.pending };
    case 'append-log':
      return {
        ...state,
        logs: [
          ...state.logs.slice(-199),
          {
            id: Date.now() + Math.floor(Math.random() * 1000),
            direction: action.direction,
            message: action.message,
            timestamp: new Date().toLocaleTimeString(),
          },
        ],
      };
    case 'clear-log':
      return { ...state, logs: [] };
    case 'focus-field':
      return { ...state, focusFieldPath: action.path };
    case 'clear-focus-field':
      return { ...state, focusFieldPath: undefined };
    default:
      return state;
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error('useAppState must be used inside AppStateProvider');
  }
  return value;
}

/** Safe locale read — works inside PiP / secondary React roots. */
export function useAppLocale(override?: Locale): Locale {
  if (override) {
    return override;
  }
  const value = useContext(AppContext);
  if (value) {
    return value.state.locale;
  }
  const saved = localStorage.getItem('odrive-wheel-locale');
  return saved === 'en' || saved === 'pt' ? saved : 'pt';
}
