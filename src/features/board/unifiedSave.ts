import { HIGH_SIGNAL_PATHS } from '../../app/refreshPolicy';
import { flatFields, type ConfigField } from '../config/fieldCatalog';
import { normalizeReply, readCommandFor, readField, writeFieldNow } from './BoardProtocol';
import { persistFfbEeprom } from './fieldApply';
import { serialService } from '../serial/SerialService';

export type SaveProgress =
  | 'writing_changes'
  | 'disarming'
  | 'persisting_ffb'
  | 'persisting_odrive'
  | 'rebooting'
  | 'reconnecting'
  | 'reading_back';

export type SaveOutcome = 'full';

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

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

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
    const field = flatFields.find((item) => item.path === path);
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
    const field = flatFields.find((item) => item.path === path);
    if (!field) continue;
    try {
      const raw = await serialService.sendCommand(
        readCommandFor(field),
        true,
        POST_SAVE_READ_TIMEOUT_MS,
        false,
      );
      values[path] = normalizeReply(raw);
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
 * Unified save sequence (matches odrive-wheel.html, with safer ordering):
 * 1. Disarm motor (IDLE) — before encoder/motor config writes
 * 2. Write dirty fields to device RAM (skipped when none pending)
 * 3. Persist FFB EEPROM (sys.save!) — warn on failure, continue
 * 4. ODrive NVM (ss + reboot) — always
 * 5. Auto-reconnect + read back high-signal fields
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
  let ffbSaved = false;

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

    onProgress?.('persisting_ffb');
    ffbSaved = await persistFfbEeprom({ now: true });

    onProgress?.('persisting_odrive');
    await serialService.commandNow('ss', false);
    // Let the UART flush ss before closing the port — otherwise the board never reboots.
    await sleep(500);

    onProgress?.('rebooting');
    await serialService.disconnect().catch(() => undefined);
  });

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
