import type { Dispatch } from 'react';
import type { AppAction, AppState } from '../../app/types';
import type { ConfigField } from '../config/fieldCatalog';

/** Unique fields awaiting toolbar Save (unapplied edits + ODrive RAM not yet in NVM). */
export function countSavePending(state: Pick<AppState, 'dirtyPaths' | 'nvmPendingPaths'>): number {
  return new Set([...state.dirtyPaths, ...state.nvmPendingPaths]).size;
}

export function markOdriveRamPending(dispatch: Dispatch<AppAction>, field: ConfigField): void {
  if (field.protocol === 'odrive' && !field.readonly) {
    dispatch({ type: 'mark-nvm-pending-path', path: field.path });
  }
}

export function markOdriveRamPendingFields(
  dispatch: Dispatch<AppAction>,
  fields: ConfigField[],
): void {
  for (const field of fields) {
    markOdriveRamPending(dispatch, field);
  }
}

/** ODrive RAM is wiped on reboot/erase — RAM-only applies are no longer pending NVM save. */
export function clearOdriveRamPending(dispatch: Dispatch<AppAction>): void {
  dispatch({ type: 'set-nvm-pending', pending: false });
}
