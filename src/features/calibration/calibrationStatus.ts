import { parseBoolField } from './calibrationBootPresets';

/** Prefer fieldValues after a successful cal; stale live poll must not hide true. */
export function mergeCalFlag(fieldValues: Record<string, string>, path: string, liveValue?: boolean): boolean {
  return parseBoolField(fieldValues[path]) || liveValue === true;
}
