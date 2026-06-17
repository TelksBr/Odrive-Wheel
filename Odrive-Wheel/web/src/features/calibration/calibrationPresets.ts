import type { Dispatch } from 'react';
import type { AppAction } from '../../app/types';
import { flatFields, type ConfigField } from '../config/fieldCatalog';
import { readField, applyField } from '../board/BoardProtocol';
import { serialService } from '../serial/SerialService';
import { readAllFields } from '../board/unifiedSave';

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export function fieldByPath(path: string): ConfigField | undefined {
  return flatFields.find((field) => field.path === path);
}

export async function writePath(
  path: string,
  value: string | boolean,
  dispatch: Dispatch<AppAction>,
): Promise<boolean> {
  const field = fieldByPath(path);
  if (!field || field.readonly) {
    return false;
  }
  const normalized = typeof value === 'boolean' ? (value ? 'true' : 'false') : value;
  const applied = await applyField(field, normalized);
  dispatch({ type: 'append-log', direction: 'rx', message: `${path} = ${applied}` });
  dispatch({ type: 'set-field', path, value: applied, dirty: false });
  return true;
}

export async function writePaths(
  specs: { path: string; value: string | boolean }[],
  dispatch: Dispatch<AppAction>,
): Promise<{ ok: number; fail: number }> {
  let ok = 0;
  let fail = 0;
  for (const spec of specs) {
    try {
      const success = await writePath(spec.path, spec.value, dispatch);
      if (success) ok += 1;
      else fail += 1;
    } catch {
      fail += 1;
    }
  }
  return { ok, fail };
}

export function markDirtyPaths(
  specs: { path: string; value: string | boolean }[],
  dispatch: Dispatch<AppAction>,
): void {
  for (const spec of specs) {
    const normalized = typeof spec.value === 'boolean' ? (spec.value ? 'true' : 'false') : spec.value;
    dispatch({ type: 'set-field', path: spec.path, value: normalized, dirty: true });
  }
}

export function applyAs5047Preset(dispatch: React.Dispatch<AppAction>): void {
  markDirtyPaths(
    [
      { path: 'axis0.encoder.config.mode', value: '257' },
      { path: 'axis0.encoder.config.cpr', value: '16384' },
      { path: 'axis0.encoder.config.abs_spi_cs_gpio_pin', value: '7' },
      { path: 'axis0.encoder.config.use_index', value: false },
      { path: 'axis0.encoder.config.pre_calibrated', value: false },
    ],
    dispatch,
  );
}

export async function markPrecalibrated(dispatch: React.Dispatch<AppAction>): Promise<{ ok: number; fail: number }> {
  return writePaths(
    [
      { path: 'axis0.motor.config.pre_calibrated', value: true },
      { path: 'axis0.encoder.config.pre_calibrated', value: true },
      { path: 'axis0.config.startup_motor_calibration', value: true },
      { path: 'axis0.config.startup_encoder_offset_calibration', value: true },
      { path: 'axis0.config.startup_closed_loop_control', value: true },
      { path: 'axis0.controller.config.enable_vel_limit', value: false },
      { path: 'axis0.controller.config.enable_overspeed_error', value: false },
      { path: 'axis0.controller.config.enable_torque_mode_vel_limit', value: false },
    ],
    dispatch,
  );
}

async function tryReconnect(maxAttempts = 12, delayMs = 1000): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      if (await serialService.reconnectKnownPort()) {
        return true;
      }
    } catch {
      // retry while board reboots
    }
    await sleep(delayMs);
  }
  return false;
}

export async function eraseAndReconnect(
  onProgress?: (phase: 'erasing' | 'rebooting' | 'reconnecting' | 'reading') => void,
): Promise<{ reconnected: boolean; values?: Record<string, string> }> {
  await serialService.runAtomic(async () => {
    onProgress?.('erasing');
    await serialService.commandNow('se', true, 8000);
    onProgress?.('rebooting');
    await serialService.disconnect().catch(() => undefined);
  });

  await sleep(5000);
  onProgress?.('reconnecting');
  const reconnected = await tryReconnect();
  if (!reconnected) {
    return { reconnected: false };
  }

  await sleep(500);
  onProgress?.('reading');
  const values = await readAllFields();
  return { reconnected: true, values };
}

export async function zeroWheel(dispatch: React.Dispatch<AppAction>): Promise<void> {
  const reply = await serialService.sendCommand('axis.zeroenc!', true, 3000);
  dispatch({ type: 'append-log', direction: 'info', message: `axis.zeroenc! → ${reply}` });
}

export async function readAnticogProgress(): Promise<{ index: number; valid: boolean; axisErr: number }> {
  const [indexRaw, validRaw, axisErrRaw] = await Promise.all([
    readField(fieldByPath('axis0.controller.config.anticogging.index')!),
    serialService.sendCommand('r axis0.controller.anticogging_valid', true, 2500, false),
    serialService.sendCommand('r axis0.error', true, 2500, false),
  ]);
  const index = Number(indexRaw.trim().split(/\s+/)[0]);
  const valid = validRaw.trim().toLowerCase() === 'true' || validRaw.trim() === '1';
  const axisErr = Number(axisErrRaw.trim().split(/\s+/)[0]);
  return {
    index: Number.isFinite(index) ? index : 0,
    valid,
    axisErr: Number.isFinite(axisErr) ? axisErr : 0,
  };
}
