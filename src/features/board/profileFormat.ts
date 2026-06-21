/** Paths skipped on export/import — matches legacy odrive-wheel.html READONLY_EXPORT_PATHS. */
export const PROFILE_SKIP_PATHS = new Set([
  'undefined',
  'axis0.controller.config.anticogging.index',
  'axis0.controller.config.anticogging.calib_anticogging',
]);

/** Live/runtime reads — not part of cloneable NVM/FFB config (legacy export omits these). */
export const PROFILE_RUNTIME_EXPORT_PATHS = new Set([
  'axis0.current_state',
  'axis0.requested_state',
  'axis0.motor.is_calibrated',
  'axis0.motor.current_control.Iq_measured',
  'axis0.encoder.is_ready',
  'axis0.controller.input_torque',
  'gpio.1.cur',
  'gpio.2.cur',
  'gpio.3.cur',
  'gpio.4.cur',
  'gpio.1.filt',
  'gpio.2.filt',
  'gpio.3.filt',
  'gpio.4.filt',
]);

const INVALID_VALUE = /^(NOT_FOUND|invalid property|not implemented|error|ERR_)/i;

export function isInvalidProfileValue(value: string | undefined): boolean {
  if (value === undefined || value === '') {
    return true;
  }
  return INVALID_VALUE.test(value.trim());
}

export function isRuntimeExportPath(path: string): boolean {
  if (PROFILE_RUNTIME_EXPORT_PATHS.has(path)) {
    return true;
  }
  return /\.(cur|filt)$/.test(path) && path.startsWith('gpio.');
}

const PROFILE_PATH_PREFIX = /^(config\.|axis0\.|axis\.|fx\.|gpio\.|main\.|sys\.)/;

export function isKnownProfilePath(path: string): boolean {
  return PROFILE_PATH_PREFIX.test(path) && !PROFILE_SKIP_PATHS.has(path);
}

export function profileExportFilename(): string {
  return `odrive_config_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
}

export function serializeProfileFlat(values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, value] of Object.entries(values)) {
    if (PROFILE_SKIP_PATHS.has(path) || !isKnownProfilePath(path) || isRuntimeExportPath(path)) {
      continue;
    }
    if (isInvalidProfileValue(value)) {
      continue;
    }
    out[path] = value;
  }
  return out;
}

function scalarToString(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return String(value);
}

export function parseProfileValues(raw: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid profile JSON');
  }

  const record = parsed as Record<string, unknown>;

  if (record.version === 1 && record.values && typeof record.values === 'object' && !Array.isArray(record.values)) {
    return normalizeProfileValues(record.values as Record<string, unknown>);
  }

  const { version, exportedAt, values, ...rest } = record;
  if (values && typeof values === 'object' && !Array.isArray(values)) {
    return normalizeProfileValues(values as Record<string, unknown>);
  }

  const flat: Record<string, unknown> = { ...rest };
  if (version !== undefined) {
    delete flat.version;
  }
  if (exportedAt !== undefined) {
    delete flat.exportedAt;
  }
  return normalizeProfileValues(flat);
}

function normalizeProfileValues(values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, raw] of Object.entries(values)) {
    if (PROFILE_SKIP_PATHS.has(path)) {
      continue;
    }
    if (raw === undefined || raw === null) {
      continue;
    }
    const value = scalarToString(raw);
    if (isInvalidProfileValue(value)) {
      continue;
    }
    out[path] = value;
  }
  return out;
}
