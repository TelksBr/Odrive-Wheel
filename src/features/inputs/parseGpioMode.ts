import { parseReplyNumber } from './analogAxisMath';

export type GpioInputMode = '0' | '1' | '2' | '3';

export function parseMode(raw: string): GpioInputMode {
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
