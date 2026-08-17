import { GPIO_CHANNELS, gpioIsAnalog } from '../../domain/gpioPinout';
import { readField } from '../board/BoardProtocol';
import { getFieldByPath } from '../config/fieldCatalog';
import { parseReplyNumber } from './analogAxisMath';
import { parseMode, type GpioInputMode } from './parseGpioMode';

export type { GpioInputMode };
export { parseMode };

export interface GpioChannelConfig {
  mode: GpioInputMode;
  idx: number | null;
  min: number;
  max: number;
}

export interface GpioConfigCache {
  maxTorqueNm: number | null;
  gpios: Record<number, GpioChannelConfig>;
}

const GPIO_LIST = GPIO_CHANNELS;

const EMPTY_GPIO: GpioChannelConfig = { mode: '0', idx: null, min: 0, max: 4095 };

export function emptyGpioChannelConfig(): GpioChannelConfig {
  return { ...EMPTY_GPIO };
}

export function emptyGpioConfigCache(): GpioConfigCache {
  return {
    maxTorqueNm: null,
    gpios: Object.fromEntries(GPIO_LIST.map((gpio) => [gpio, emptyGpioChannelConfig()])),
  };
}

export function emptyGpioRaw(): Record<number, number | null> {
  return Object.fromEntries(GPIO_LIST.map((gpio) => [gpio, null]));
}

function gpioEntry(cache: GpioConfigCache, gpio: number): GpioChannelConfig {
  return cache.gpios[gpio] ?? emptyGpioChannelConfig();
}

function fieldFor(path: string) {
  const field = getFieldByPath(path);
  if (!field) {
    throw new Error(`Missing field: ${path}`);
  }
  return field;
}

/** Read axis.maxtorque + GPIO modes/calibration directly from the board (not app cache). */
export async function readInputConfigCache(
  previous: GpioConfigCache = emptyGpioConfigCache(),
): Promise<GpioConfigCache> {
  const next: GpioConfigCache = {
    maxTorqueNm: previous.maxTorqueNm,
    gpios: { ...emptyGpioConfigCache().gpios, ...previous.gpios },
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
    const current = gpioEntry(next, gpio);
    try {
      const modeRaw = await readField(fieldFor(`gpio.${gpio}.mode`));
      next.gpios[gpio] = {
        ...current,
        mode: parseMode(modeRaw),
      };
    } catch {
      next.gpios[gpio] = current;
    }

    try {
      const idxRaw = await readField(fieldFor(`gpio.${gpio}.idx`));
      const idx = parseReplyNumber(idxRaw);
      if (idx !== null && idx >= 0) {
        next.gpios[gpio] = { ...gpioEntry(next, gpio), idx: Math.round(idx) };
      }
    } catch {
      // keep previous idx
    }

    if (gpioIsAnalog(gpio)) {
      try {
        const minRaw = await readField(fieldFor(`gpio.${gpio}.amin`));
        const min = parseReplyNumber(minRaw);
        if (min !== null) {
          next.gpios[gpio] = { ...gpioEntry(next, gpio), min };
        }
      } catch {
        // keep previous min
      }

      try {
        const maxRaw = await readField(fieldFor(`gpio.${gpio}.amax`));
        const max = parseReplyNumber(maxRaw);
        if (max !== null) {
          next.gpios[gpio] = { ...gpioEntry(next, gpio), max };
        }
      } catch {
        // keep previous max
      }
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

  const gpios: Record<number, GpioChannelConfig> = { ...emptyGpioConfigCache().gpios, ...cache.gpios };
  for (const gpio of GPIO_LIST) {
    const previous = gpioEntry({ maxTorqueNm, gpios }, gpio);
    const modeRaw = fieldValues[`gpio.${gpio}.mode`];
    const idxRaw = fieldValues[`gpio.${gpio}.idx`];
    const minRaw = gpioIsAnalog(gpio) ? Number(fieldValues[`gpio.${gpio}.amin`] ?? '') : Number.NaN;
    const maxRaw = gpioIsAnalog(gpio) ? Number(fieldValues[`gpio.${gpio}.amax`] ?? '') : Number.NaN;
    const idxParsed = idxRaw === '' ? null : Number(idxRaw);
    gpios[gpio] = {
      mode: modeRaw ? parseMode(modeRaw) : previous.mode,
      idx:
        idxParsed !== null && Number.isFinite(idxParsed) && idxParsed >= 0
          ? Math.round(idxParsed)
          : previous.idx,
      min: Number.isFinite(minRaw) ? minRaw : previous.min,
      max: Number.isFinite(maxRaw) ? maxRaw : previous.max,
    };
  }

  return { maxTorqueNm, gpios };
}
