import { useRef } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import {
  applyField,
  parseProfile,
  readField,
  serializeProfileFlat,
} from './BoardProtocol';
import { eraseAndReconnect } from '../calibration/calibrationPresets';
import { useBoardSave } from './useBoardSave';
import {
  matchProfileImport,
  profileFields,
  profileValuesFromState,
  readProfileFieldValues,
  shouldApplyOnImport,
} from './profileUtils';
import { clearOdriveRamPending, countSavePending, markOdriveRamPending } from './persistPending';
import { profileExportFilename } from './profileFormat';
import { rebootAndDisconnect, tryReconnectAfterReboot } from './boardLifecycle';
import { toast, toastKey, toastStickyClose, toastStickyKey } from '../../shared/toastActions';

const READ_STICKY_ID = 'read-all';
const IMPORT_STICKY_ID = 'import-apply';
const EXPORT_STICKY_ID = 'export-read';

export function ProfileActions() {
  const { state, dispatch } = useAppState();
  const { saveAll, saveBadge, saveBlocked } = useBoardSave();
  const fileRef = useRef<HTMLInputElement>(null);

  async function readAll() {
    if (!state.connected) {
      toastKey(dispatch, state.locale, 'connectFirst', 'error');
      return;
    }
    dispatch({ type: 'set-busy', busy: true });
    const total = profileFields.length;
    let ok = true;
    try {
      toastStickyKey(dispatch, state.locale, READ_STICKY_ID, 'readProgress', {
        progress: 0,
        params: { cur: 0, total },
      });
      for (let i = 0; i < profileFields.length; i++) {
        const field = profileFields[i];
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
      toast(dispatch, translate(state.locale, ok ? 'readAllDone' : 'readAllPartial'), ok ? 'ok' : 'warn');
    } catch (error) {
      toastStickyClose(dispatch, READ_STICKY_ID);
      const message = error instanceof Error ? error.message : String(error);
      dispatch({ type: 'append-log', direction: 'error', message });
      toast(dispatch, message, 'error');
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function erase() {
    if (!state.connected) {
      toastKey(dispatch, state.locale, 'connectFirst', 'error');
      return;
    }
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
        dispatch({ type: 'set-nvm-pending', pending: false });
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
    if (!state.connected) {
      toastKey(dispatch, state.locale, 'connectFirst', 'error');
      return;
    }
    dispatch({ type: 'set-busy', busy: true });
    try {
      await rebootAndDisconnect();
      clearOdriveRamPending(dispatch);
      toastKey(dispatch, state.locale, 'rebootSent', 'info');
      const reconnected = await tryReconnectAfterReboot();
      if (reconnected) {
        toastKey(dispatch, state.locale, 'rebootReconnected', 'ok');
      } else {
        toastKey(dispatch, state.locale, 'rebootManualReconnect', 'warn');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch({ type: 'append-log', direction: 'error', message });
      toast(dispatch, message, 'error');
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function exportJson() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      let sourceValues = state.fieldValues;

      if (state.connected) {
        toastStickyKey(dispatch, state.locale, EXPORT_STICKY_ID, 'exportReading', {
          progress: 0,
          params: { cur: 0, total: profileFields.length },
        });
        sourceValues = await readProfileFieldValues((cur, total, field) => {
          toastStickyKey(dispatch, state.locale, EXPORT_STICKY_ID, 'exportReading', {
            sub: field.path,
            progress: Math.round((cur / total) * 100),
            params: { cur, total },
          });
        });
        for (const [path, value] of Object.entries(sourceValues)) {
          dispatch({ type: 'set-field', path, value, dirty: false });
        }
        dispatch({ type: 'mark-refreshed' });
        toastStickyClose(dispatch, EXPORT_STICKY_ID);
      } else {
        const cached = profileValuesFromState(sourceValues);
        if (Object.keys(cached).length < 8) {
          toastKey(dispatch, state.locale, 'exportNeedsConnect', 'warn');
          return;
        }
      }

      const payload = serializeProfileFlat(profileValuesFromState(sourceValues));
      if (Object.keys(payload).length === 0) {
        toastKey(dispatch, state.locale, 'exportEmpty', 'warn');
        return;
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = profileExportFilename();
      anchor.click();
      URL.revokeObjectURL(url);
      toastKey(dispatch, state.locale, 'toastExportOk', 'ok', { n: Object.keys(payload).length });
    } catch (error) {
      toastStickyClose(dispatch, EXPORT_STICKY_ID);
      const message = error instanceof Error ? error.message : String(error);
      dispatch({ type: 'append-log', direction: 'error', message });
      toast(dispatch, message, 'error');
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
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

    const { matched, skipped, unknown } = matchProfileImport(profile.values);
    const n = matched.length;

    if (skipped.length > 0) {
      dispatch({
        type: 'append-log',
        direction: 'info',
        message: translate(state.locale, 'importSkippedReadonly', { n: skipped.length }),
      });
    }
    if (unknown.length > 0) {
      dispatch({
        type: 'append-log',
        direction: 'info',
        message: translate(state.locale, 'importUnknownPaths', { n: unknown.length, sample: unknown.slice(0, 3).join(', ') }),
      });
    }

    if (n === 0) {
      toastKey(dispatch, state.locale, 'importNoMatch', 'warn');
      return;
    }

    const values: Record<string, string> = {};
    for (const { field, value } of matched) {
      values[field.path] = value;
    }
    dispatch({ type: 'hydrate-fields', values, dirty: true });
    dispatch({ type: 'set-nvm-pending', pending: true });

    const apply = window.confirm(translate(state.locale, 'importConfirmApply', { n }));
    if (!apply) {
      toastKey(dispatch, state.locale, 'importLoadedOnly', 'ok', { n });
      return;
    }

    if (!state.connected) {
      toastKey(dispatch, state.locale, 'connectFirst', 'error');
      return;
    }

    const applyTargets = matched.filter(({ field }) => shouldApplyOnImport(field));
    dispatch({ type: 'set-busy', busy: true });
    const total = applyTargets.length;
    let ok = 0;
    let fail = 0;
    try {
      toastStickyKey(dispatch, state.locale, IMPORT_STICKY_ID, 'importProgress', {
        progress: 0,
        params: { cur: 0, total },
      });
      for (let i = 0; i < applyTargets.length; i++) {
        const { field, value } = applyTargets[i];
        try {
          const applied = await applyField(field, value);
          dispatch({ type: 'set-field', path: field.path, value: applied, dirty: true });
          markOdriveRamPending(dispatch, field);
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

  const pendingCount = countSavePending(state);

  return (
    <div className="maintain-profile">
      <p className="maintain-hint">{translate(state.locale, 'maintainSaveHint')}</p>
      {pendingCount > 0 && (
        <div className="maintain-status-row">
          <span className="pill pill-warn">{translate(state.locale, 'maintainDirtyBadge', { n: pendingCount })}</span>
        </div>
      )}
      <div className="toolbar maintain-toolbar">
        <button type="button" disabled={!state.connected || state.busy} onClick={() => void readAll()}>
          {translate(state.locale, 'readAll')}
        </button>
        <button
          type="button"
          className="ok"
          disabled={!state.connected || state.busy || saveBlocked}
          title={translate(state.locale, 'saveTitle')}
          onClick={() => void saveAll()}
        >
          {translate(state.locale, 'save')}
          {saveBadge}
        </button>
        <button type="button" className="danger" disabled={!state.connected || state.busy} onClick={() => void erase()}>
          {translate(state.locale, 'erase')}
        </button>
        <button type="button" disabled={!state.connected || state.busy} onClick={() => void reboot()}>
          {translate(state.locale, 'reboot')}
        </button>
        <button type="button" disabled={state.busy} onClick={() => void exportJson()}>
          {translate(state.locale, 'export')}
        </button>
        <button type="button" disabled={state.busy} onClick={() => fileRef.current?.click()}>
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
    </div>
  );
}
