import type { Dispatch } from 'react';
import type { AppAction } from '../app/types';
import type { ToastKind } from '../app/types';
import { translate, type Locale } from '../i18n/messages';

const EPHEMERAL_MS = 3500;

export function toast(
  dispatch: Dispatch<AppAction>,
  message: string,
  kind: ToastKind = 'info',
): void {
  dispatch({ type: 'push-toast', toast: { kind, message, sticky: false } });
}

export function toastKey(
  dispatch: Dispatch<AppAction>,
  locale: Locale,
  key: string,
  kind: ToastKind = 'info',
  params?: Record<string, string | number>,
): void {
  toast(dispatch, translate(locale, key, params), kind);
}

export function toastSticky(
  dispatch: Dispatch<AppAction>,
  id: string,
  message: string,
  opts?: { sub?: string; progress?: number; kind?: ToastKind },
): void {
  dispatch({
    type: 'push-toast',
    toast: {
      id,
      kind: opts?.kind ?? 'info',
      message,
      sub: opts?.sub,
      progress: opts?.progress,
      sticky: true,
    },
  });
}

export function toastStickyKey(
  dispatch: Dispatch<AppAction>,
  locale: Locale,
  id: string,
  key: string,
  opts?: { sub?: string; progress?: number; kind?: ToastKind; params?: Record<string, string | number> },
): void {
  toastSticky(dispatch, id, translate(locale, key, opts?.params), {
    sub: opts?.sub,
    progress: opts?.progress,
    kind: opts?.kind,
  });
}

export function toastStickyClose(dispatch: Dispatch<AppAction>, id: string): void {
  dispatch({ type: 'dismiss-toast', id });
}

/** Schedule auto-dismiss for ephemeral toasts (call from ToastHost). */
export function toastAutoDismissMs(sticky?: boolean): number | null {
  return sticky ? null : EPHEMERAL_MS;
}
