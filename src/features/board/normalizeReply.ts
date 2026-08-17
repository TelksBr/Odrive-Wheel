import type { ConfigField, FieldType } from '../config/fieldCatalog';
import { isOdriveErrorReply } from '../serial/odriveErrors';

export type NormalizeField = Pick<ConfigField, 'type'> | { type: FieldType };

export function boolTokensEqual(a: string, b: string): boolean {
  return normalizeBoolToken(a) === normalizeBoolToken(b);
}

export function normalizeBoolToken(raw: string): 'true' | 'false' | string {
  const token = raw.trim().toLowerCase().split(/\s+/)[0] ?? '';
  if (token === 'true' || token === '1') return 'true';
  if (token === 'false' || token === '0') return 'false';
  return token;
}

export function normalizeValue(field: NormalizeField, value: string): string {
  if (field.type === 'bool') {
    return boolTokensEqual(value, 'true') ? '1' : '0';
  }
  return value;
}

/**
 * Strip OpenFFBoard `[cls|value]` wrappers and Python True/False.
 * Numeric 0/1 become true/false only when the field is a bool — enums/ints keep 0/1.
 */
export function normalizeReply(reply: string, field?: NormalizeField): string {
  const trimmed = reply.trim();
  if (!trimmed) {
    return '';
  }
  if (isOdriveErrorReply(trimmed)) {
    throw new Error(trimmed);
  }

  let value = trimmed;
  const openFfBoardMatch = trimmed.match(/^\[[^|]*\|(.*)\]$/);
  if (openFfBoardMatch) {
    value = openFfBoardMatch[1]?.trim() ?? '';
  }

  if (value === 'True') {
    return 'true';
  }
  if (value === 'False') {
    return 'false';
  }

  const firstToken = value.split(/\s+/)[0] || value;
  if (field?.type === 'bool') {
    const lower = firstToken.toLowerCase();
    if (lower === '1' || lower === 'true') {
      return 'true';
    }
    if (lower === '0' || lower === 'false') {
      return 'false';
    }
  }

  return firstToken;
}

export function assertReadback(field: ConfigField, intended: string, readback: string): void {
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
