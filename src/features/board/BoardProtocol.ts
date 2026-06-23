import { serialService } from '../serial/SerialService';
import type { ConfigField } from '../config/fieldCatalog';
import { parseProfileValues, serializeProfileFlat } from './profileFormat';

export interface BoardProfile {
  version: 1;
  exportedAt: string;
  values: Record<string, string>;
}

const ODRIVE_ERROR_REPLY = /^(not implemented|invalid property|error|err_)/i;

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

export function isOdriveErrorReply(reply: string): boolean {
  return ODRIVE_ERROR_REPLY.test(reply.trim());
}

export function boolTokensEqual(a: string, b: string): boolean {
  return normalizeBoolToken(a) === normalizeBoolToken(b);
}

export function normalizeBoolToken(raw: string): 'true' | 'false' | string {
  const token = raw.trim().toLowerCase().split(/\s+/)[0] ?? '';
  if (token === 'true' || token === '1') return 'true';
  if (token === 'false' || token === '0') return 'false';
  return token;
}

export async function readField(field: ConfigField, log = false): Promise<string> {
  const reply = await serialService.sendCommand(readCommandFor(field), true, 2000, log);
  return normalizeReply(reply);
}

/** Same as readField but for use inside serialService.runAtomic(). */
export async function readFieldNow(field: ConfigField, log = false): Promise<string> {
  const reply = await serialService.commandNow(readCommandFor(field), true, 2000, log);
  return normalizeReply(reply);
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

function assertReadback(field: ConfigField, intended: string, readback: string): void {
  const expected = normalizeValue(field, intended);
  if (field.type === 'bool') {
    if (!boolTokensEqual(readback, expected)) {
      throw new Error(`${field.path}: readback ${readback} ≠ ${expected}`);
    }
    return;
  }
  if (field.type === 'enum' || field.type === 'int') {
    const got = readback.trim().split(/\s+/)[0];
    const want = expected.trim();
    if (got !== want) {
      throw new Error(`${field.path}: readback ${got} ≠ ${want}`);
    }
  }
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

export async function saveBoardConfiguration(): Promise<void> {
  await serialService.writeOdrive('w axis0.requested_state 1', false);
  await serialService.sendCommand('sys.save!', true, 8000);
  await serialService.sendCommand('ss', false);
}

export async function eraseBoardConfiguration(): Promise<void> {
  await serialService.sendCommand('se', true, 8000);
}

export async function rebootBoard(): Promise<void> {
  await serialService.sendCommand('sr', false);
}

export async function rebootToDfu(): Promise<void> {
  await serialService.sendCommand('sd', false);
}

/** @deprecated Use serializeProfileFlat for legacy-compatible export. */
export function createProfile(values: Record<string, string>): BoardProfile {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    values,
  };
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

export function normalizeReply(reply: string): string {
  const trimmed = reply.trim();
  if (!trimmed) {
    return '';
  }
  if (isOdriveErrorReply(trimmed)) {
    throw new Error(trimmed);
  }

  const openFfBoardMatch = trimmed.match(/^\[[^|]*\|(.*)\]$/);
  if (openFfBoardMatch) {
    return openFfBoardMatch[1]?.trim() ?? '';
  }

  if (trimmed === 'True') {
    return 'true';
  }
  if (trimmed === 'False') {
    return 'false';
  }

  const firstToken = trimmed.split(/\s+/)[0]?.toLowerCase() ?? trimmed;
  if (firstToken === '1') {
    return 'true';
  }
  if (firstToken === '0') {
    return 'false';
  }

  return trimmed.split(/\s+/)[0] || trimmed;
}

function normalizeValue(field: ConfigField, value: string): string {
  if (field.type === 'bool') {
    return boolTokensEqual(value, 'true') ? '1' : '0';
  }
  return value;
}
