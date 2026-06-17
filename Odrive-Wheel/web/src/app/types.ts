import type { Locale } from '../i18n/messages';

export type TabId =
  | 'dashboard'
  | 'setup'
  | 'motor'
  | 'tune'
  | 'ffb-test'
  | 'perf-test'
  | 'inputs'
  | 'observe'
  | 'maintain'
  | 'commands'
  | 'console'
  | 'about';

export interface LogEntry {
  id: number;
  direction: 'tx' | 'rx' | 'info' | 'error';
  message: string;
  timestamp: string;
}

export interface AppState {
  activeTab: TabId;
  locale: Locale;
  connected: boolean;
  serialSupported: boolean;
  hidSupported: boolean;
  usbSupported: boolean;
  busy: boolean;
  autoReconnect: boolean;
  reconnecting: boolean;
  autoRefresh: boolean;
  refreshIntervalMs: number;
  lastRefreshAt?: string;
  dirtyPaths: string[];
  fieldValues: Record<string, string>;
  logs: LogEntry[];
  focusFieldPath?: string;
}

export type AppAction =
  | { type: 'set-tab'; tab: TabId }
  | { type: 'set-locale'; locale: Locale }
  | { type: 'set-connected'; connected: boolean }
  | { type: 'set-busy'; busy: boolean }
  | { type: 'set-auto-reconnect'; autoReconnect: boolean }
  | { type: 'set-reconnecting'; reconnecting: boolean }
  | { type: 'set-auto-refresh'; autoRefresh: boolean }
  | { type: 'set-refresh-interval'; refreshIntervalMs: number }
  | { type: 'mark-refreshed' }
  | { type: 'set-field'; path: string; value: string; dirty?: boolean }
  | { type: 'clear-dirty' }
  | { type: 'append-log'; direction: LogEntry['direction']; message: string }
  | { type: 'clear-log' }
  | { type: 'hydrate-fields'; values: Record<string, string>; dirty?: boolean }
  | { type: 'focus-field'; path: string }
  | { type: 'clear-focus-field' };
