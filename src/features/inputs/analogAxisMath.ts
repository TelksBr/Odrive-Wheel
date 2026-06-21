export function parseReplyNumber(raw: string): number | null {
  const match = raw.match(/\|(-?\d+(?:\.\d+)?)\]/) ?? raw.match(/(-?\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function toLinearPercent(value: number, min: number, max: number): number | null {
  if (max <= min) {
    return null;
  }
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

export function toCenteredPercent(value: number, maxAbs: number): number | null {
  if (maxAbs <= 0) {
    return null;
  }
  return Math.max(-100, Math.min(100, (value / maxAbs) * 100));
}

/** Button GPIO: treat high ADC / digital 1 as pressed. */
export function isButtonPressed(raw: number | null, min = 0, max = 4095): boolean {
  if (raw === null) {
    return false;
  }
  if (raw === 0 || raw === 1) {
    return raw === 1;
  }
  const span = Math.max(1, max - min);
  return (raw - min) / span >= 0.55;
}
