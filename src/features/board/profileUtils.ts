import type { ConfigField } from '../config/fieldCatalog';
import { flatFields } from '../config/fieldCatalog';
import { profileSupplementFields } from './profileSupplement';
import { isKnownProfilePath, isInvalidProfileValue, isRuntimeExportPath, PROFILE_SKIP_PATHS } from './profileFormat';
import { readField } from './BoardProtocol';

export interface ProfileImportMatch {
  field: ConfigField;
  value: string;
}

function isLiveField(field: ConfigField): boolean {
  return field.groupId === 'live';
}

function isRuntimeStatusField(field: ConfigField): boolean {
  return isLiveField(field) || field.type === 'command';
}

function catalogFieldToProfileField(field: ConfigField): ConfigField | null {
  if (isLiveField(field) || PROFILE_SKIP_PATHS.has(field.path)) {
    return null;
  }
  return field;
}

const profileFieldList: ConfigField[] = [
  ...flatFields
    .map(catalogFieldToProfileField)
    .filter((field): field is ConfigField => field !== null),
  ...profileSupplementFields.filter((field) => !PROFILE_SKIP_PATHS.has(field.path)),
];

export const profileFieldByPath = new Map(profileFieldList.map((field) => [field.path, field]));
export const profileFields = profileFieldList;

export function resolveProfileField(path: string): ConfigField | null {
  if (PROFILE_SKIP_PATHS.has(path) || !isKnownProfilePath(path)) {
    return null;
  }
  const known = profileFieldByPath.get(path);
  if (known) {
    return known;
  }
  return inferProfileField(path);
}

function inferProfileField(path: string): ConfigField | null {
  const protocol = path.startsWith('config.') || path.startsWith('axis0.') ? 'odrive' : 'openffboard';
  return {
    path,
    label: path,
    type: 'float',
    protocol,
    description: '',
  };
}

export function normalizeProfileImportValue(field: ConfigField, raw: string): string {
  if (field.type === 'bool') {
    if (raw === 'True' || raw === 'true' || raw === '1') {
      return '1';
    }
    if (raw === 'False' || raw === 'false' || raw === '0') {
      return '0';
    }
  }
  return raw;
}

/** Runtime identity — useful on screen but not part of cloneable config (legacy HTML omits these). */
export const PROFILE_EXPORT_EXCLUDE_PATHS = new Set([
  ...PROFILE_SKIP_PATHS,
  'sys.swver',
  'sys.hwtype',
  'sys.heap',
]);

function shouldExportPath(path: string): boolean {
  return !PROFILE_EXPORT_EXCLUDE_PATHS.has(path) && !isRuntimeExportPath(path);
}

function shouldExportValue(value: string | undefined): boolean {
  return !isInvalidProfileValue(value);
}

export function profileValuesFromState(values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of profileFields) {
    if (!shouldExportPath(field.path)) {
      continue;
    }
    const value = values[field.path];
    if (shouldExportValue(value)) {
      out[field.path] = value;
    }
  }
  for (const [path, value] of Object.entries(values)) {
    if (out[path] !== undefined || !shouldExportValue(value)) {
      continue;
    }
    if (!shouldExportPath(path)) {
      continue;
    }
    if (resolveProfileField(path)) {
      out[path] = value;
    }
  }
  return out;
}

export async function readProfileFieldValues(
  onProgress?: (current: number, total: number, field: ConfigField) => void,
): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  const total = profileFields.length;
  for (let i = 0; i < profileFields.length; i++) {
    const field = profileFields[i];
    onProgress?.(i + 1, total, field);
    try {
      const value = await readField(field);
      if (!isInvalidProfileValue(value)) {
        values[field.path] = value;
      }
    } catch {
      // partial read — continue
    }
  }
  return values;
}

export function matchProfileImport(values: Record<string, string>): {
  matched: ProfileImportMatch[];
  skipped: string[];
  unknown: string[];
} {
  const matched: ProfileImportMatch[] = [];
  const skipped: string[] = [];
  const unknown: string[] = [];

  for (const [path, raw] of Object.entries(values)) {
    if (PROFILE_SKIP_PATHS.has(path) || isInvalidProfileValue(raw)) {
      skipped.push(path);
      continue;
    }
    const field = resolveProfileField(path);
    if (!field) {
      unknown.push(path);
      continue;
    }
    if (isRuntimeStatusField(field)) {
      skipped.push(path);
      continue;
    }
    matched.push({ field, value: normalizeProfileImportValue(field, raw) });
  }

  return { matched, skipped, unknown };
}

export function shouldApplyOnImport(field: ConfigField): boolean {
  return !PROFILE_SKIP_PATHS.has(field.path) && !isRuntimeStatusField(field);
}
