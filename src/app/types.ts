import type { Locale } from '../i18n/messages';

export type TabId =
  | 'dashboard'
  | 'setup'
  | 'calibration'
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

export type ToastKind = 'ok' | 'error' | 'warn' | 'info';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  sub?: string;
  /** 0–100 when set; omit bar when undefined */
  progress?: number;
  sticky?: boolean;
  createdAt: number;
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
  lastRefreshAt?: string;
  dirtyPaths: string[];
  /** ODrive RAM has cal/boot changes not yet committed via toolbar Save (ss). */
  nvmPending: boolean;
  /** ODrive fields already written to RAM since last toolbar Save — need ss on Save. */
  nvmPendingPaths: string[];
  fieldValues: Record<string, string>;
  logs: LogEntry[];
  toasts: ToastItem[];
  focusFieldPath?: string;
}

export type AppAction =
  | { type: 'set-tab'; tab: TabId }
  | { type: 'set-locale'; locale: Locale }
  | { type: 'set-connected'; connected: boolean }
  | { type: 'set-busy'; busy: boolean }
  | { type: 'set-auto-reconnect'; autoReconnect: boolean }
  | { type: 'set-reconnecting'; reconnecting: boolean }
  | { type: 'mark-refreshed' }
  | { type: 'set-field'; path: string; value: string; dirty?: boolean }
  | { type: 'clear-dirty' }
  | { type: 'set-nvm-pending'; pending: boolean }
  | { type: 'mark-nvm-pending-path'; path: string }
  | { type: 'append-log'; direction: LogEntry['direction']; message: string }
  | { type: 'clear-log' }
  | { type: 'push-toast'; toast: { id?: string; kind: ToastKind; message: string; sub?: string; progress?: number; sticky?: boolean } }
  | { type: 'dismiss-toast'; id: string }
  | { type: 'hydrate-fields'; values: Record<string, string>; dirty?: boolean }
  | { type: 'focus-field'; path: string }
  | { type: 'clear-focus-field' };
