import type { Dispatch } from 'react';
import type { AppAction } from '../../app/types';
import { unifiedSave, type SaveProgress } from '../board/unifiedSave';

/** Persist selected ODrive paths to NVM (ss + reboot) — no global integrity gate. */
export async function persistWorkflowPaths(
  paths: string[],
  fieldValues: Record<string, string>,
  dispatch: Dispatch<AppAction>,
  onProgress?: (step: SaveProgress) => void,
): Promise<{ ok: boolean; reconnected: boolean }> {
  if (paths.length === 0) {
    return { ok: false, reconnected: false };
  }

  const result = await unifiedSave({
    dirtyPaths: [],
    nvmPendingPaths: paths,
    fieldValues,
    onProgress,
  });

  if (result.reconnected && result.values) {
    for (const [path, value] of Object.entries(result.values)) {
      dispatch({ type: 'set-field', path, value, dirty: false });
    }
    dispatch({ type: 'clear-dirty' });
    dispatch({ type: 'set-nvm-pending', pending: false });
    dispatch({ type: 'mark-refreshed' });
  }

  return { ok: result.reconnected, reconnected: result.reconnected };
}
