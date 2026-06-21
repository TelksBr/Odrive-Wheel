import { normalizeReply } from '../board/BoardProtocol';

export interface ParsedProbeResult {
  firmware: string | null;
  hardware: string | null;
  vbusV: number | null;
  raw: Record<string, string>;
}

export function parseProbeReply(raw: string): string {
  return normalizeReply(raw);
}

export function parseProbeResults(raw: Record<string, string>): ParsedProbeResult {
  const firmware = raw['sys.swver?'] ? parseProbeReply(raw['sys.swver?']) : null;
  const hardware = raw['sys.hwtype?'] ? parseProbeReply(raw['sys.hwtype?']) : null;
  const vbusRaw = raw['r vbus_voltage'] ? parseProbeReply(raw['r vbus_voltage']) : null;
  const vbusParsed = vbusRaw !== null ? parseFloat(vbusRaw) : NaN;
  const vbusV = Number.isFinite(vbusParsed) ? vbusParsed : null;

  return { firmware, hardware, vbusV, raw };
}

/** True when reading suggests wrong sys.vbusdiv for typical bench supplies. */
export function probeVbusNeedsCalibration(vbusV: number | null): boolean {
  if (vbusV === null) {
    return false;
  }
  return vbusV > 32 || vbusV < 6;
}
