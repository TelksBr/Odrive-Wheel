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

export async function readField(field: ConfigField): Promise<string> {
  const reply = await serialService.sendCommand(readCommandFor(field), true);
  return normalizeReply(reply);
}

export async function writeField(field: ConfigField, value: string): Promise<string> {
  return serialService.sendCommand(writeCommandFor(field, value), true);
}

export async function executeOpenFFBoard(command: string): Promise<string> {
  return serialService.sendCommand(command.endsWith('!') ? command : `${command}!`, true);
}

export async function saveBoardConfiguration(): Promise<void> {
  await serialService.sendCommand('sys.save!', true, 5000);
  await serialService.sendCommand('w axis0.requested_state 1', true, 2000);
  await serialService.sendCommand('ss', true, 8000);
}

export async function eraseBoardConfiguration(): Promise<void> {
  await serialService.sendCommand('es', true, 8000);
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

function normalizeReply(reply: string): string {
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
