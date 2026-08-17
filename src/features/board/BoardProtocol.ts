import { serialService } from '../serial/SerialService';
import type { ConfigField } from '../config/fieldCatalog';
import { parseProfileValues, serializeProfileFlat } from './profileFormat';
import {
  assertReadback,
  normalizeReply,
  normalizeValue,
} from './normalizeReply';

export interface BoardProfile {
  version: 1;
  exportedAt: string;
  values: Record<string, string>;
}

export { isOdriveErrorReply } from '../serial/odriveErrors';
export { assertReadback, boolTokensEqual, normalizeBoolToken, normalizeReply } from './normalizeReply';

export function readCommandFor(field: ConfigField): string {
  if (field.protocol === 'openffboard') {
    return `${field.path}?`;
  }
  return `r ${field.path}`;
}

export function writeCommandFor(field: ConfigField, value: string): string {
  if (field.protocol === 'openffboard') {
    return `${field.path}=${normalizeValue(field, value)}`;
  }
  return `w ${field.path} ${normalizeValue(field, value)}`;
}

export async function readField(field: ConfigField, log = false): Promise<string> {
  const reply = await serialService.sendCommand(readCommandFor(field), true, 2000, log);
  return normalizeReply(reply, field);
}

/** Same as readField but for use inside serialService.runAtomic(). */
export async function readFieldNow(field: ConfigField, log = false): Promise<string> {
  const reply = await serialService.commandNow(readCommandFor(field), true, 2000, log);
  return normalizeReply(reply, field);
}

async function writeOdriveField(field: ConfigField, value: string, log: boolean, now: boolean): Promise<void> {
  const command = writeCommandFor(field, value);
  const rejectLine = now
    ? await serialService.writeOdriveNow(command, log)
    : await serialService.writeOdrive(command, log);
  if (rejectLine) {
    throw new Error(rejectLine.trim());
  }
}

export async function writeField(field: ConfigField, value: string, log = true): Promise<string> {
  if (field.protocol === 'odrive') {
    await writeOdriveField(field, value, log, false);
    return '';
  }
  return serialService.sendCommand(writeCommandFor(field, value), true, 2000, log);
}

/** Same as writeField but for use inside serialService.runAtomic(). */
export async function writeFieldNow(field: ConfigField, value: string, log = true): Promise<string> {
  if (field.protocol === 'odrive') {
    await writeOdriveField(field, value, log, true);
    return '';
  }
  return serialService.commandNow(writeCommandFor(field, value), true, 2000, log);
}

/** Write then read back the applied value (matches HTML writeOne). */
export async function applyField(field: ConfigField, value: string, log = false): Promise<string> {
  await writeField(field, value, log);
  const readback = await readField(field, log);
  assertReadback(field, value, readback);
  return readback;
}

/** Same as applyField but for use inside serialService.runAtomic(). */
export async function applyFieldNow(field: ConfigField, value: string, log = false): Promise<string> {
  await writeFieldNow(field, value, log);
  const readback = await readFieldNow(field, log);
  assertReadback(field, value, readback);
  return readback;
}

export async function executeOpenFFBoard(command: string): Promise<string> {
  return serialService.sendCommand(command.endsWith('!') ? command : `${command}!`, true);
}

export async function rebootBoard(): Promise<void> {
  await serialService.sendCommand('sr', false);
}

export async function rebootToDfu(): Promise<void> {
  await serialService.sendCommand('sd', false);
}

/** Accepts flat legacy JSON or WheelForge wrapped profiles. */
export function parseProfile(raw: string): BoardProfile {
  const values = parseProfileValues(raw);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    values,
  };
}

export { serializeProfileFlat };
