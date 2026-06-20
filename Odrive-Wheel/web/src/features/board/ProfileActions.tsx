import { useRef } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { flatFields } from '../config/fieldCatalog';
import {
  applyField,
  createProfile,
  parseProfile,
  readField,
  rebootBoard,
} from './BoardProtocol';
import { eraseAndReconnect } from '../calibration/calibrationPresets';
import { unifiedSave } from './unifiedSave';
import { toast, toastKey, toastStickyClose, toastStickyKey } from '../../shared/toastActions';

const READ_STICKY_ID = 'read-all';
const IMPORT_STICKY_ID = 'import-apply';

export function ProfileActions() {
  const { state, dispatch } = useAppState();
  const fileRef = useRef<HTMLInputElement>(null);

  async function readAll() {
    if (!state.connected) {
      toastKey(dispatch, state.locale, 'connectFirst', 'error');
      return;
    }
    dispatch({ type: 'set-busy', busy: true });
    const total = flatFields.length;
    let ok = true;
    try {
      toastStickyKey(dispatch, state.locale, READ_STICKY_ID, 'readProgress', {
        progress: 0,
        params: { cur: 0, total },
      });
      for (let i = 0; i < flatFields.length; i++) {
        const field = flatFields[i];
        try {
          const value = await readField(field);
          dispatch({ type: 'set-field', path: field.path, value, dirty: false });
        } catch (error) {
          ok = false;
          dispatch({
            type: 'append-log',
            direction: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
        const pct = Math.round(((i + 1) / total) * 100);
        toastStickyKey(dispatch, state.locale, READ_STICKY_ID, 'readProgress', {
          sub: field.path,
          progress: pct,
          params: { cur: i + 1, total },
        });
      }
      toastStickyClose(dispatch, READ_STICKY_ID);
      toast(dispatch, translate(state.locale, ok ? 'refreshPage' : 'readAll'), ok ? 'ok' : 'warn');
    } catch (error) {
      toastStickyClose(dispatch, READ_STICKY_ID);
      const message = error instanceof Error ? error.message : String(error);
      dispatch({ type: 'append-log', direction: 'error', message });
      toast(dispatch, message, 'error');
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function writeDirty() {
    if (!state.connected || state.busy) {
      return;
    }
    dispatch({ type: 'set-busy', busy: true });
    try {
      const result = await unifiedSave({
        dirtyPaths: state.dirtyPaths,
        fieldValues: state.fieldValues,
      });
      if (result.reconnected && result.values) {
        for (const [path, value] of Object.entries(result.values)) {
          dispatch({ type: 'set-field', path, value, dirty: false });
        }
        dispatch({ type: 'clear-dirty' });
        dispatch({ type: 'mark-refreshed' });
        const msg = translate(state.locale, 'toastSaveComplete');
        dispatch({ type: 'append-log', direction: 'info', message: msg });
        toast(dispatch, msg, 'ok');
      } else if (!result.reconnected) {
        const msg = translate(state.locale, 'saveReconnectFailed');
        dispatch({ type: 'append-log', direction: 'error', message: msg });
        toast(dispatch, msg, 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch({ type: 'append-log', direction: 'error', message });
      toast(dispatch, message, 'error');
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function erase() {
    if (!window.confirm(translate(state.locale, 'eraseConfirm'))) {
      return;
    }
    dispatch({ type: 'set-busy', busy: true });
    try {
      const result = await eraseAndReconnect();
      if (result.reconnected && result.values) {
        for (const [path, value] of Object.entries(result.values)) {
          dispatch({ type: 'set-field', path, value, dirty: false });
        }
        dispatch({ type: 'clear-dirty' });
        dispatch({ type: 'mark-refreshed' });
        const msg = translate(state.locale, 'setupToastErasedOk');
        dispatch({ type: 'append-log', direction: 'info', message: msg });
        toast(dispatch, msg, 'ok');
      } else {
        const msg = translate(state.locale, 'setupToastErasedNoReconnect');
        dispatch({ type: 'append-log', direction: 'error', message: msg });
        toast(dispatch, msg, 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch({ type: 'append-log', direction: 'error', message });
      toast(dispatch, message, 'error');
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function reboot() {
    try {
      await rebootBoard();
      toast(dispatch, translate(state.locale, 'reboot'), 'info');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch({ type: 'append-log', direction: 'error', message });
      toast(dispatch, message, 'error');
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(createProfile(state.fieldValues), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `odrive-wheel-profile-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toastKey(dispatch, state.locale, 'toastExportOk', 'ok');
  }

  async function importJson(file: File) {
    let profile;
    try {
      const text = await file.text();
      profile = parseProfile(text);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      dispatch({ type: 'append-log', direction: 'error', message: `import: ${msg}` });
      toast(dispatch, translate(state.locale, 'toastInvalidJson', { msg }), 'error');
      return;
    }

    const fieldByPath = new Map(flatFields.map((field) => [field.path, field]));
    const matched = Object.entries(profile.values)
      .map(([path, value]) => {
        const field = fieldByPath.get(path);
        if (!field || field.readonly || value === undefined) {
          return null;
        }
        return { field, value: String(value) };
      })
      .filter((item): item is { field: (typeof flatFields)[number]; value: string } => item !== null);

    const n = matched.length;
    if (n === 0) {
      toastKey(dispatch, state.locale, 'importNoMatch', 'warn');
      return;
    }

    const values: Record<string, string> = {};
    for (const { field, value } of matched) {
      values[field.path] = value;
    }
    dispatch({ type: 'hydrate-fields', values, dirty: true });

    const apply = window.confirm(translate(state.locale, 'importConfirmApply', { n }));
    if (!apply) {
      toastKey(dispatch, state.locale, 'importLoadedOnly', 'ok', { n });
      return;
    }

    if (!state.connected) {
      toastKey(dispatch, state.locale, 'connectFirst', 'error');
      return;
    }

    dispatch({ type: 'set-busy', busy: true });
    const total = matched.length;
    let ok = 0;
    let fail = 0;
    try {
      toastStickyKey(dispatch, state.locale, IMPORT_STICKY_ID, 'importProgress', {
        progress: 0,
        params: { cur: 0, total },
      });
      for (let i = 0; i < matched.length; i++) {
        const { field, value } = matched[i];
        try {
          await applyField(field, value);
          ok++;
        } catch {
          fail++;
        }
        const pct = Math.round(((i + 1) / total) * 100);
        toastStickyKey(dispatch, state.locale, IMPORT_STICKY_ID, 'importProgress', {
          sub: field.path,
          progress: pct,
          params: { cur: i + 1, total },
        });
      }
      toastStickyClose(dispatch, IMPORT_STICKY_ID);
      toastKey(dispatch, state.locale, 'importApplied', fail > 0 ? 'warn' : 'ok', { ok, fail });
    } catch (error) {
      toastStickyClose(dispatch, IMPORT_STICKY_ID);
      const message = error instanceof Error ? error.message : String(error);
      dispatch({ type: 'append-log', direction: 'error', message });
      toast(dispatch, message, 'error');
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  return (
    <div className="toolbar">
      <button type="button" disabled={!state.connected || state.busy} onClick={() => void readAll()}>
        {translate(state.locale, 'readAll')}
      </button>
      <button type="button" disabled={!state.connected || state.busy} onClick={() => void writeDirty()}>
        {translate(state.locale, 'save')}{state.dirtyPaths.length > 0 ? ` (${state.dirtyPaths.length})` : ''}
      </button>
      <button type="button" className="danger" disabled={!state.connected || state.busy} onClick={() => void erase()}>
        {translate(state.locale, 'erase')}
      </button>
      <button type="button" disabled={!state.connected || state.busy} onClick={() => void reboot()}>
        {translate(state.locale, 'reboot')}
      </button>
      <button type="button" onClick={exportJson}>
        {translate(state.locale, 'export')}
      </button>
      <button type="button" onClick={() => fileRef.current?.click()}>
        {translate(state.locale, 'import')}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void importJson(file);
          }
          event.target.value = '';
        }}
      />
    </div>
  );
}
