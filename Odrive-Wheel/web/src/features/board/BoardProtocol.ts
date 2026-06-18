import { serialService } from '../serial/SerialService';
import type { ConfigField } from '../config/fieldCatalog';

export interface BoardProfile {
  version: 1;
  exportedAt: string;
  values: Record<string, string>;
}

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
  return normalizeReply(reply);
}

/** Same as readField but for use inside serialService.runAtomic(). */
export async function readFieldNow(field: ConfigField, log = false): Promise<string> {
  const reply = await serialService.commandNow(readCommandFor(field), true, 2000, log);
  return normalizeReply(reply);
}

export async function writeField(field: ConfigField, value: string): Promise<string> {
  const command = writeCommandFor(field, value);
  // ODrive ASCII writes are silent on success — only errors get a reply (HTML writeProp).
  const expectReply = field.protocol !== 'odrive';
  return serialService.sendCommand(command, expectReply);
}

/** Same as writeField but for use inside serialService.runAtomic(). */
export async function writeFieldNow(field: ConfigField, value: string): Promise<string> {
  const command = writeCommandFor(field, value);
  const expectReply = field.protocol !== 'odrive';
  return serialService.commandNow(command, expectReply);
}

/** Write then read back the applied value (matches HTML writeOne). */
export async function applyField(field: ConfigField, value: string, log = false): Promise<string> {
  await writeField(field, value);
  return readField(field, log);
}

/** Same as applyField but for use inside serialService.runAtomic(). */
export async function applyFieldNow(field: ConfigField, value: string, log = false): Promise<string> {
  await writeFieldNow(field, value);
  return readFieldNow(field, log);
}

export async function executeOpenFFBoard(command: string): Promise<string> {
  return serialService.sendCommand(command.endsWith('!') ? command : `${command}!`, true);
}

export async function saveBoardConfiguration(): Promise<void> {
  await serialService.sendCommand('w axis0.requested_state 1', false);
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

export function createProfile(values: Record<string, string>): BoardProfile {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    values,
  };
}

export function parseProfile(raw: string): BoardProfile {
  const parsed = JSON.parse(raw) as Partial<BoardProfile>;
  if (parsed.version !== 1 || !parsed.values || typeof parsed.values !== 'object') {
    throw new Error('Invalid Odrive-Wheel profile');
  }
  return parsed as BoardProfile;
}

export function normalizeReply(reply: string): string {
  const trimmed = reply.trim();
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

  const firstToken = trimmed.split(/\s+/)[0];
  return firstToken || trimmed;
}

function normalizeValue(field: ConfigField, value: string): string {
  if (field.type === 'bool') {
    return value === 'true' || value === '1' ? '1' : '0';
  }
  return value;
}
