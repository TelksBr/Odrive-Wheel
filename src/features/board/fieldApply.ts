import type { ConfigField } from '../config/fieldCatalog';
import { applyField, normalizeReply } from './BoardProtocol';
import { serialService } from '../serial/SerialService';

export interface ConfigApplyResult {
  applied: Record<string, string>;
  persistedFfb: boolean;
  hasFfbFields: boolean;
  hasOdriveFields: boolean;
}

/** Persist FFB wheel params to emulated EEPROM — does not reboot. */
export async function persistFfbEeprom(opts?: { now?: boolean }): Promise<boolean> {
  try {
    const send = opts?.now ? serialService.commandNow.bind(serialService) : serialService.sendCommand.bind(serialService);
    const raw = await send('sys.save!', true, 12000);
    const normalized = normalizeReply(raw).trim().toUpperCase();
    return normalized === 'OK' || normalized.endsWith('OK');
  } catch {
    return false;
  }
}

/** Apply one or more config fields with protocol-aware persistence (Config UI / Inputs). */
export async function applyConfigFields(
  entries: { field: ConfigField; value: string }[],
): Promise<ConfigApplyResult> {
  const applied: Record<string, string> = {};
  let hasFfbFields = false;
  let hasOdriveFields = false;

  for (const { field, value } of entries) {
    applied[field.path] = await applyField(field, value);
    if (field.protocol === 'openffboard') {
      hasFfbFields = true;
    } else {
      hasOdriveFields = true;
    }
  }

  const persistedFfb = hasFfbFields ? await persistFfbEeprom() : false;
  return { applied, persistedFfb, hasFfbFields, hasOdriveFields };
}

export async function applyConfigField(field: ConfigField, value: string): Promise<ConfigApplyResult> {
  return applyConfigFields([{ field, value }]);
}

/** Write OpenFFBoard fields to device RAM only — no sys.save! (live tuning, HTML writePropOffb). */
export async function applyOpenffboardRam(
  entries: { field: ConfigField; value: string }[],
): Promise<Record<string, string>> {
  const applied: Record<string, string> = {};
  for (const { field, value } of entries) {
    if (field.protocol !== 'openffboard') {
      throw new Error(`applyOpenffboardRam: ${field.path} is not openffboard`);
    }
    applied[field.path] = await applyField(field, value, false);
  }
  return applied;
}
