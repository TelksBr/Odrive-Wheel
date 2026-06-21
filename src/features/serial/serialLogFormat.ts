/** Formats raw serial RX lines for the console log (display only — parsing uses raw values). */
export function formatSerialRxLine(line: string, command?: string): string {
  const trimmed = line.trim();
  if (!trimmed) {
    return trimmed;
  }

  const bracket = trimmed.match(/^\[([^|\]]+)\|([^\]]*)\]$/);
  if (bracket) {
    const cmd = bracket[1];
    const value = bracket[2].trim();
    return formatOpenFFBoardValue(cmd, value);
  }

  if (/^lt=/.test(trimmed)) {
    const nm = trimmed.match(/nm=(-?\d+(?:\.\d+)?)/)?.[1];
    if (nm !== undefined) {
      return `${nm} Nm`;
    }
  }

  if (command?.startsWith('r ') && /^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

function formatOpenFFBoardValue(command: string, value: string): string {
  if (command.startsWith('odrv.vbus')) {
    const mv = Number(value);
    if (Number.isFinite(mv) && mv > 100) {
      return `${(mv / 1000).toFixed(3)} V`;
    }
  }

  if (command.startsWith('axis.curpos') || command.startsWith('axis.curspd')) {
    const num = Number(value);
    if (Number.isFinite(num)) {
      const unit = command.startsWith('axis.curspd') ? ' deg/s' : '°';
      return `${num.toFixed(2)}${unit}`;
    }
  }

  if (command.startsWith('axis.curtorque')) {
    const num = Number(value);
    if (Number.isFinite(num)) {
      return `${num} (raw)`;
    }
  }

  return value;
}
