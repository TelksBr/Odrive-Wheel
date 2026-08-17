import { HIGH_SIGNAL_PATHS } from '../../app/refreshPolicy';
import { flatFields, getFieldByPath, type ConfigField } from '../config/fieldCatalog';
import { normalizeReply, readCommandFor, readField, writeFieldNow } from './BoardProtocol';
import { persistFfbEeprom } from './fieldApply';
import { serialService } from '../serial/SerialService';
import { sleep } from '../../shared/sleep';

export type SaveProgress =
  | 'writing_changes'
  | 'disarming'
  | 'persisting_ffb'
  | 'persisting_odrive'
  | 'rebooting'
  | 'reconnecting'
  | 'reading_back';

export type SaveOutcome = 'full' | 'ffb_only';

export class SaveSequenceError extends Error {
  code: 'ffb_failed' | 'write_failed';

  constructor(message: string, code: 'ffb_failed' | 'write_failed') {
    super(message);
    this.name = 'SaveSequenceError';
    this.code = code;
  }
}

export interface UnifiedSaveResult {
  outcome: SaveOutcome;
  reconnected: boolean;
  ffbSaved: boolean;
  values?: Record<string, string>;
}

const POST_SAVE_READ_TIMEOUT_MS = 1200;

async function tryReconnect(maxAttempts = 12, delayMs = 1000): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (await serialService.reconnectKnownPort()) {
        return true;
      }
    } catch {
      // Port may still be booting — retry
    }
    await sleep(delayMs);
  }
  return false;
}

function editableDirtyFields(paths: string[]): ConfigField[] {
  const fields: ConfigField[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    if (seen.has(path)) continue;
    seen.add(path);
    const field = getFieldByPath(path);
    if (field && !field.readonly) {
      fields.push(field);
    }
  }
  return fields;
}

function pathsForPostSaveRead(extraPaths: string[]): string[] {
  return [...new Set([...HIGH_SIGNAL_PATHS, ...extraPaths])];
}

/** Fast read after reconnect — high-signal + fields that were just written. */
export async function readFieldsAfterSave(extraPaths: string[] = []): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const path of pathsForPostSaveRead(extraPaths)) {
    const field = getFieldByPath(path);
    if (!field) continue;
    try {
      const raw = await serialService.sendCommand(
        readCommandFor(field),
        true,
        POST_SAVE_READ_TIMEOUT_MS,
        false,
      );
      values[path] = normalizeReply(raw, field);
    } catch {
      // Skip unreadable fields — do not block save completion
    }
  }
  return values;
}

/** Read all catalog fields — manual refresh / erase only (slow). */
export async function readAllFields(): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const field of flatFields) {
    values[field.path] = await readField(field);
  }
  return values;
}

/**
 * Unified save:
 * 1. Disarm motor (IDLE) when writing anything
 * 2. Write dirty fields to device RAM
 * 3. Persist FFB EEPROM (sys.save!) when OpenFFBoard fields changed — abort on failure
 * 4. ODrive NVM (ss + reboot) only when ODrive paths are pending
 * 5. Auto-reconnect + read back after NVM reboot; stay connected for FFB-only
 */
export async function unifiedSave({
  dirtyPaths,
  nvmPendingPaths,
  fieldValues,
  onProgress,
}: {
  dirtyPaths: string[];
  nvmPendingPaths: string[];
  fieldValues: Record<string, string>;
  onProgress?: (step: SaveProgress) => void;
}): Promise<UnifiedSaveResult> {
  const pathsToWrite = [...new Set([...dirtyPaths, ...nvmPendingPaths])];
  const pending = editableDirtyFields(pathsToWrite);
  const hasOdriveWrites =
    pending.some((field) => field.protocol === 'odrive') || nvmPendingPaths.length > 0;
  const hasFfbWrites = pending.some((field) => field.protocol === 'openffboard');

  if (pending.length === 0 && !hasOdriveWrites) {
    return { outcome: 'ffb_only', reconnected: true, ffbSaved: true, values: {} };
  }

  let ffbSaved = !hasFfbWrites;

  await serialService.runAtomic(async () => {
    onProgress?.('disarming');
    await serialService.writeOdriveNow('w axis0.requested_state 1', false);
    await sleep(300);

    if (pending.length > 0) {
      onProgress?.('writing_changes');
      for (const field of pending) {
        try {
          await writeFieldNow(field, fieldValues[field.path] ?? '');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new SaveSequenceError(`${field.path}: ${message}`, 'write_failed');
        }
      }
    }

    if (hasFfbWrites) {
      onProgress?.('persisting_ffb');
      ffbSaved = await persistFfbEeprom({ now: true });
      if (!ffbSaved) {
        throw new SaveSequenceError('sys.save! (FFB EEPROM) failed', 'ffb_failed');
      }
    }

    if (!hasOdriveWrites) {
      return;
    }

    onProgress?.('persisting_odrive');
    await serialService.commandNow('ss', false);
    await sleep(500);

    onProgress?.('rebooting');
    await serialService.disconnect().catch(() => undefined);
  });

  if (!hasOdriveWrites) {
    onProgress?.('reading_back');
    const values = await readFieldsAfterSave(pathsToWrite);
    return { outcome: 'ffb_only', reconnected: true, ffbSaved, values };
  }

  await sleep(5000);

  onProgress?.('reconnecting');
  const reconnected = await tryReconnect();
  if (!reconnected) {
    return { outcome: 'full', reconnected: false, ffbSaved, values: undefined };
  }

  await sleep(500);
  onProgress?.('reading_back');
  const values = await readFieldsAfterSave(pathsToWrite);
  return { outcome: 'full', reconnected: true, ffbSaved, values };
}
