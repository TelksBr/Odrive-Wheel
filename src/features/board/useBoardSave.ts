import { useCallback, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { unifiedSave, type SaveProgress } from './unifiedSave';
import { assessCalibrationIntegrity, parseAxisError, shouldBlockSave } from '../calibration/calibrationIntegrity';
import { toast, toastSticky, toastStickyClose } from '../../shared/toastActions';
import { countSavePending } from './persistPending';

const SAVE_STICKY_ID = 'save-progress';

const saveProgressKey: Record<SaveProgress, string> = {
  writing_changes: 'saveWritingChanges',
  disarming: 'saveDisarming',
  persisting_ffb: 'savePersistingFfb',
  persisting_odrive: 'savePersistingOdrive',
  rebooting: 'saveRebooting',
  reconnecting: 'saveReconnecting',
  reading_back: 'saveReadingBack',
};

const saveProgressOrder: SaveProgress[] = [
  'writing_changes',
  'disarming',
  'persisting_ffb',
  'persisting_odrive',
  'rebooting',
  'reconnecting',
  'reading_back',
];

function saveStepProgress(step: SaveProgress): number {
  const index = saveProgressOrder.indexOf(step);
  if (index < 0) {
    return 0;
  }
  return Math.round(((index + 1) / saveProgressOrder.length) * 100);
}

export function useBoardSave() {
  const { state, dispatch } = useAppState();
  const [saveProgress, setSaveProgress] = useState<SaveProgress | null>(null);

  const saveAll = useCallback(async () => {
    if (!state.connected) {
      const msg = translate(state.locale, 'saveSerialRequired');
      dispatch({ type: 'append-log', direction: 'error', message: msg });
      toast(dispatch, msg, 'error');
      return;
    }
    if (state.busy) {
      return;
    }
    const integrity = assessCalibrationIntegrity(state.fieldValues, state.dirtyPaths, state.nvmPendingPaths);
    if (shouldBlockSave(integrity)) {
      for (const key of integrity.blockers) {
        const msg = translate(state.locale, `calIntegrity_${key}`);
        dispatch({
          type: 'append-log',
          direction: 'error',
          message: msg,
        });
        toast(dispatch, msg, 'error');
      }
      return;
    }
    dispatch({ type: 'set-busy', busy: true });
    try {
      const result = await unifiedSave({
        dirtyPaths: state.dirtyPaths,
        nvmPendingPaths: state.nvmPendingPaths,
        fieldValues: state.fieldValues,
        onProgress: (step) => {
          setSaveProgress(step);
          toastSticky(dispatch, SAVE_STICKY_ID, translate(state.locale, saveProgressKey[step]), {
            progress: saveStepProgress(step),
            kind: 'info',
          });
        },
      });
      toastStickyClose(dispatch, SAVE_STICKY_ID);
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
          const msg = translate(state.locale, 'toastSaveComplete');
          dispatch({
            type: 'append-log',
            direction: 'info',
            message: msg,
          });
          toast(dispatch, msg, 'ok');
        }
        if (!result.ffbSaved) {
          const msg = translate(state.locale, 'saveFfbWarn');
          dispatch({
            type: 'append-log',
            direction: 'error',
            message: msg,
          });
          toast(dispatch, msg, 'warn');
        }
      } else if (!result.reconnected) {
        const msg = translate(state.locale, 'saveReconnectFailed');
        dispatch({ type: 'append-log', direction: 'error', message: msg });
        toast(dispatch, msg, 'error');
      }
    } catch (error) {
      toastStickyClose(dispatch, SAVE_STICKY_ID);
      const message = error instanceof Error ? error.message : String(error);
      dispatch({
        type: 'append-log',
        direction: 'error',
        message,
      });
      toast(dispatch, message, 'error');
    } finally {
      setSaveProgress(null);
      dispatch({ type: 'set-busy', busy: false });
    }
  }, [dispatch, state.busy, state.connected, state.dirtyPaths, state.fieldValues, state.locale, state.nvmPendingPaths]);

  function saveButtonLabel(): string {
    if (!saveProgress) {
      return translate(state.locale, 'save');
    }
    return `⏳ ${translate(state.locale, saveProgressKey[saveProgress])}`;
  }

  const pendingCount = countSavePending(state);
  const saveBadge = pendingCount > 0 ? ` (${pendingCount})` : '';

  const integrity = assessCalibrationIntegrity(state.fieldValues, state.dirtyPaths, state.nvmPendingPaths);

  return { saveAll, saveProgress, saveButtonLabel, saveBadge, saveBlocked: shouldBlockSave(integrity) };
}
