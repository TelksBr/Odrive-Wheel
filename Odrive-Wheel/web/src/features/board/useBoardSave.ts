import { useCallback, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { unifiedSave, type SaveProgress } from './unifiedSave';
import {
  assessCalibrationIntegrity,
  parseAxisError,
  shouldBlockSave,
} from '../calibration/calibrationIntegrity';

const saveProgressKey: Record<SaveProgress, string> = {
  writing_changes: 'saveWritingChanges',
  disarming: 'saveDisarming',
  persisting_ffb: 'savePersistingFfb',
  persisting_odrive: 'savePersistingOdrive',
  rebooting: 'saveRebooting',
  reconnecting: 'saveReconnecting',
  reading_back: 'saveReadingBack',
};

export function useBoardSave() {
  const { state, dispatch } = useAppState();
  const [saveProgress, setSaveProgress] = useState<SaveProgress | null>(null);

  const saveAll = useCallback(async () => {
    if (!state.connected) {
      dispatch({ type: 'append-log', direction: 'error', message: translate(state.locale, 'saveSerialRequired') });
      return;
    }
    if (state.busy) {
      return;
    }
    const integrity = assessCalibrationIntegrity(state.fieldValues, state.dirtyPaths);
    if (shouldBlockSave(integrity)) {
      for (const key of integrity.blockers) {
        dispatch({
          type: 'append-log',
          direction: 'error',
          message: translate(state.locale, `calIntegrity_${key}`),
        });
      }
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
        dispatch({ type: 'set-nvm-pending', pending: false });
        dispatch({ type: 'mark-refreshed' });
        const motorErr = parseAxisError(result.values['axis0.motor.error']);
        const encErr = parseAxisError(result.values['axis0.encoder.error']);
        const axisErr = parseAxisError(result.values['axis0.error']);
        if (motorErr || encErr || axisErr) {
          dispatch({
            type: 'append-log',
            direction: 'error',
            message: translate(state.locale, 'calIntegrityPostSaveErrors', {
              motor: String(motorErr),
              encoder: String(encErr),
              axis: String(axisErr),
            }),
          });
        } else {
          dispatch({
            type: 'append-log',
            direction: 'info',
            message: translate(state.locale, 'toastSaveComplete'),
          });
        }
        if (!result.ffbSaved) {
          dispatch({
            type: 'append-log',
            direction: 'error',
            message: translate(state.locale, 'saveFfbWarn'),
          });
        }
      } else if (!result.reconnected) {
        dispatch({ type: 'append-log', direction: 'error', message: translate(state.locale, 'saveReconnectFailed') });
      }
    } catch (error) {
      dispatch({
        type: 'append-log',
        direction: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaveProgress(null);
      dispatch({ type: 'set-busy', busy: false });
    }
  }, [dispatch, state.busy, state.connected, state.dirtyPaths, state.fieldValues, state.locale]);

  function saveButtonLabel(): string {
    if (!saveProgress) {
      return translate(state.locale, 'save');
    }
    return `⏳ ${translate(state.locale, saveProgressKey[saveProgress])}`;
  }

  const saveBadge =
    state.dirtyPaths.length > 0 || state.nvmPending
      ? ` (${state.dirtyPaths.length > 0 ? state.dirtyPaths.length : '!'})`
      : '';

  const integrity = assessCalibrationIntegrity(state.fieldValues, state.dirtyPaths);
  const saveBlocked = shouldBlockSave(integrity);

  return { saveAll, saveProgress, saveButtonLabel, saveBadge, saveBlocked };
}
