import { readField } from '../board/BoardProtocol';
import { flatFields } from '../config/fieldCatalog';
import { parseReplyNumber } from './analogAxisMath';

export type GpioInputMode = '0' | '1' | '2' | '3';

export interface GpioConfigCache {
  maxTorqueNm: number | null;
  gpios: Record<number, { mode: GpioInputMode; min: number; max: number }>;
}

const GPIO_LIST = [1, 2, 3, 4] as const;

const EMPTY_CACHE: GpioConfigCache = {
  maxTorqueNm: null,
  gpios: {
    1: { mode: '0', min: 0, max: 4095 },
    2: { mode: '0', min: 0, max: 4095 },
    3: { mode: '0', min: 0, max: 4095 },
    4: { mode: '0', min: 0, max: 4095 },
  },
};

function fieldFor(path: string) {
  const field = flatFields.find((item) => item.path === path);
  if (!field) {
    throw new Error(`Missing field: ${path}`);
  }
  return field;
}

function parseMode(raw: string): GpioInputMode {
  const numeric = parseReplyNumber(raw);
  if (numeric !== null && numeric >= 0 && numeric <= 3) {
    return String(Math.round(numeric)) as GpioInputMode;
  }
  const token = raw.trim().split(/\s+/)[0];
  if (token === '0' || token === '1' || token === '2' || token === '3') {
    return token;
  }
  return '0';
}

/** Read axis.maxtorque + GPIO modes/calibration directly from the board (not app cache). */
export async function readInputConfigCache(
  previous: GpioConfigCache = EMPTY_CACHE,
): Promise<GpioConfigCache> {
  const next: GpioConfigCache = {
    maxTorqueNm: previous.maxTorqueNm,
    gpios: { ...previous.gpios },
  };

  try {
    const raw = await readField(fieldFor('axis.maxtorque'));
    const value = parseReplyNumber(raw);
    if (value !== null && value > 0) {
      next.maxTorqueNm = value;
    }
  } catch {
    // keep previous max torque
  }

  for (const gpio of GPIO_LIST) {
    try {
      const modeRaw = await readField(fieldFor(`gpio.${gpio}.mode`));
      next.gpios[gpio] = {
        ...next.gpios[gpio],
        mode: parseMode(modeRaw),
      };
    } catch {
      // keep previous mode
    }

    try {
      const minRaw = await readField(fieldFor(`gpio.${gpio}.amin`));
      const min = parseReplyNumber(minRaw);
      if (min !== null) {
        next.gpios[gpio] = { ...next.gpios[gpio], min };
      }
    } catch {
      // keep previous min
    }

    try {
      const maxRaw = await readField(fieldFor(`gpio.${gpio}.amax`));
      const max = parseReplyNumber(maxRaw);
      if (max !== null) {
        next.gpios[gpio] = { ...next.gpios[gpio], max };
      }
    } catch {
      // keep previous max
    }
  }

  return next;
}

export function mergeFieldConfig(
  cache: GpioConfigCache,
  fieldValues: Record<string, string>,
): GpioConfigCache {
  const maxFromFields = Number(fieldValues['axis.maxtorque'] ?? '');
  const maxTorqueNm =
    Number.isFinite(maxFromFields) && maxFromFields > 0
      ? maxFromFields
      : cache.maxTorqueNm;

  const gpios = { ...cache.gpios };
  for (const gpio of GPIO_LIST) {
    const modeRaw = fieldValues[`gpio.${gpio}.mode`];
    const minRaw = Number(fieldValues[`gpio.${gpio}.amin`] ?? '');
    const maxRaw = Number(fieldValues[`gpio.${gpio}.amax`] ?? '');
    gpios[gpio] = {
      mode: modeRaw ? parseMode(modeRaw) : gpios[gpio].mode,
      min: Number.isFinite(minRaw) ? minRaw : gpios[gpio].min,
      max: Number.isFinite(maxRaw) ? maxRaw : gpios[gpio].max,
    };
  }

  return { maxTorqueNm, gpios };
}
