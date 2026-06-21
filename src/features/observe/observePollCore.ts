import { translate, type Locale } from '../../i18n/messages';
import { decodeErr, ERROR_REGISTERS, type DecodedError } from '../live/errorDecoder';
import { LIVE_MONITOR_FIELDS } from '../live/liveMonitorCatalog';
import { parseLiveRaw } from '../live/liveMonitorFormat';
import { serialService } from '../serial/SerialService';
import type { TelemetrySample } from '../telemetry/types';

export type LiveMap = Record<string, string>;
export type ErrorMap = Record<string, DecodedError>;
export type DeviceMap = Record<string, string>;
export type DiagMap = Record<string, string>;

const DIAG_MAX_CHARS = 2048;
const DEVICE_INFO_EVERY = 12;

async function readOdriveProp(path: string): Promise<string> {
  return serialService.sendCommand(`r ${path}`, true, 2500, false);
}

function truncateDiag(raw: string): string {
  if (raw.length <= DIAG_MAX_CHARS) return raw;
  return `${raw.slice(0, DIAG_MAX_CHARS)}…`;
}

export function parseMonitorNumber(raw: string | undefined): number | undefined {
  if (!raw || raw === '?') return undefined;
  const token = parseLiveRaw(raw).split(/\s+/)[0];
  const value = Number(token);
  return Number.isFinite(value) ? value : undefined;
}

export function parseTorqueReply(raw: string | undefined, maxTorqueNm?: number): number | undefined {
  if (!raw) return undefined;
  const ltMatch = raw.match(/lt=(-?\d+(?:\.\d+)?)/);
  if (ltMatch && maxTorqueNm !== undefined && maxTorqueNm > 0) {
    const lt = Number(ltMatch[1]);
    return Number.isFinite(lt) ? (lt / 32767) * maxTorqueNm : undefined;
  }
  const nmMatch = raw.match(/nm=(-?\d+(?:\.\d+)?)/);
  return nmMatch ? Number(nmMatch[1]) : undefined;
}

export function telemetrySampleFromLive(
  live: LiveMap,
  torqueRaw: string | undefined,
  maxTorqueNm?: number,
): TelemetrySample {
  const now = performance.now();
  return {
    t: now,
    vbus: parseMonitorNumber(live.vbus_voltage),
    ibus: parseMonitorNumber(live.ibus),
    iq: parseMonitorNumber(live.iq_meas),
    ibrake: parseMonitorNumber(live.ibrake),
    torqueNm: parseTorqueReply(torqueRaw, maxTorqueNm),
    positionDeg: parseMonitorNumber(live.ffb_pos),
    velocityDegS: parseMonitorNumber(live.ffb_spd),
  };
}

export async function pollLiveFields(): Promise<LiveMap> {
  const next: LiveMap = {};
  for (const field of LIVE_MONITOR_FIELDS) {
    try {
      next[field.id] = await serialService.sendCommand(field.cmd, true, 2000, false);
    } catch {
      next[field.id] = '?';
    }
  }
  return next;
}

export async function pollErrorRegisters(locale: Locale): Promise<ErrorMap> {
  const next: ErrorMap = {};
  for (const entry of ERROR_REGISTERS) {
    try {
      const raw = await serialService.sendCommand(entry.command, true, 2500, false);
      next[entry.id] = decodeErr(raw, entry.map);
    } catch {
      next[entry.id] = {
        raw: '?',
        hex: '?',
        value: 0,
        bits: [translate(locale, 'liveTimeoutBit')],
        ok: false,
      };
    }
  }
  return next;
}

export async function pollDeviceInfo(): Promise<DeviceMap> {
  const next: DeviceMap = {};
  try {
    const [fwMaj, fwMin, fwRev] = await Promise.all([
      readOdriveProp('fw_version_major'),
      readOdriveProp('fw_version_minor'),
      readOdriveProp('fw_version_revision'),
    ]);
    next.fw = [fwMaj, fwMin, fwRev].map((v) => parseLiveRaw(v) || '?').join('.');
  } catch {
    next.fw = '?';
  }

  try {
    const [hwMaj, hwMin, hwVar] = await Promise.all([
      readOdriveProp('hw_version_major'),
      readOdriveProp('hw_version_minor'),
      readOdriveProp('hw_version_variant'),
    ]);
    next.hw = `${parseLiveRaw(hwMaj) || '?'}.${parseLiveRaw(hwMin) || '?'}-${parseLiveRaw(hwVar) || '?'}V`;
  } catch {
    next.hw = '?';
  }

  try {
    next.sn = parseLiveRaw(await readOdriveProp('serial_number')) || '—';
  } catch {
    next.sn = '?';
  }

  try {
    next.ucl = parseLiveRaw(await readOdriveProp('user_config_loaded')) || '—';
  } catch {
    next.ucl = '?';
  }

  return next;
}

export async function pollDiagCommands(): Promise<DiagMap> {
  const next: DiagMap = {};
  for (const cmd of ['d', 'D', 'C', 'T', 'E', 'I'] as const) {
    try {
      const raw = await serialService.sendCommand(cmd, true, 2000, false);
      next[cmd] = truncateDiag(raw);
    } catch {
      next[cmd] = '-';
    }
  }
  return next;
}

export async function pollTorqueDiag(): Promise<string | undefined> {
  try {
    return await serialService.sendCommand('T', true, 2000, false);
  } catch {
    return undefined;
  }
}

export interface ObservePollCycleResult {
  live: LiveMap;
  errors: ErrorMap;
  device?: DeviceMap;
  torqueRaw?: string;
}

/** One unified serial cycle: monitor fields + errors + optional device info. */
export async function runObservePollCycle(
  locale: Locale,
  options: { includeDevice: boolean },
): Promise<ObservePollCycleResult> {
  const live = await pollLiveFields();
  const errors = await pollErrorRegisters(locale);
  const torqueRaw = await pollTorqueDiag();
  const device = options.includeDevice ? await pollDeviceInfo() : undefined;
  return { live, errors, torqueRaw, device };
}

export { DEVICE_INFO_EVERY };
