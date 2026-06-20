import { useEffect } from 'react';
import { useAppState } from '../app/AppState';
import type { ToastItem, ToastKind } from '../app/types';
import { toastAutoDismissMs } from './toastActions';

const ICONS: Record<ToastKind, string> = {
  ok: '✓',
  error: '✕',
  warn: '⚠',
  info: 'ℹ',
};

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const ms = toastAutoDismissMs(item.sticky);
    if (ms === null) {
      return undefined;
    }
    const id = window.setTimeout(() => onDismiss(item.id), ms);
    return () => window.clearTimeout(id);
  }, [item.id, item.sticky, onDismiss]);

  const icon = item.sticky && item.kind === 'info' ? '⏳' : ICONS[item.kind];
  const showBar = item.sticky && typeof item.progress === 'number';
  const pct = showBar ? Math.max(0, Math.min(100, item.progress ?? 0)) : 0;

  return (
    <div className={`toast toast--${item.kind}${item.sticky ? ' toast--sticky' : ''}`} role="status">
      <div className="toast-row1">
        <span className="toast-icon" aria-hidden>
          {icon}
        </span>
        <div className="toast-body">
          <div className="toast-message">{item.message}</div>
          {item.sub ? <div className="toast-sub">{item.sub}</div> : null}
        </div>
        {item.sticky ? (
          <button type="button" className="toast-dismiss" onClick={() => onDismiss(item.id)} aria-label="×">
            ×
          </button>
        ) : null}
      </div>
      {showBar ? (
        <div className="toast-bar" aria-hidden>
          <div className="toast-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

export function ToastHost() {
  const { state, dispatch } = useAppState();

  return (
    <div className="toast-host" aria-live="polite" aria-relevant="additions">
      {state.toasts.map((item) => (
        <ToastCard
          key={item.id}
          item={item}
          onDismiss={(id) => dispatch({ type: 'dismiss-toast', id })}
        />
      ))}
    </div>
  );
}
