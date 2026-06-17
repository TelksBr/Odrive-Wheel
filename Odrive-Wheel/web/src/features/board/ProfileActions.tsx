import { useRef } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { flatFields } from '../config/fieldCatalog';
import {
  createProfile,
  eraseBoardConfiguration,
  parseProfile,
  readField,
  rebootBoard,
  saveBoardConfiguration,
  writeField,
} from './BoardProtocol';

export function ProfileActions() {
  const { state, dispatch } = useAppState();
  const fileRef = useRef<HTMLInputElement>(null);

  async function readAll() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      for (const field of flatFields) {
        const value = await readField(field);
        dispatch({ type: 'set-field', path: field.path, value, dirty: false });
      }
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function writeDirty() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      for (const path of state.dirtyPaths) {
        const field = flatFields.find((item) => item.path === path);
        if (!field || field.readonly) {
          continue;
        }
        await writeField(field, state.fieldValues[path] ?? '');
      }
      await saveBoardConfiguration();
      dispatch({ type: 'clear-dirty' });
      dispatch({ type: 'append-log', direction: 'info', message: 'Profile saved' });
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function erase() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      await eraseBoardConfiguration();
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function reboot() {
    await rebootBoard().catch((error: unknown) =>
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) }),
    );
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(createProfile(state.fieldValues), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `odrive-wheel-profile-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(file: File) {
    try {
      const text = await file.text();
      const profile = parseProfile(text);
      dispatch({ type: 'hydrate-fields', values: profile.values, dirty: true });
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <div className="toolbar">
      <button type="button" disabled={!state.connected || state.busy} onClick={() => void readAll()}>
        {translate(state.locale, 'readAll')}
      </button>
      <button type="button" disabled={!state.connected || state.busy} onClick={() => void writeDirty()}>
        {translate(state.locale, 'save')} ({state.dirtyPaths.length})
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
