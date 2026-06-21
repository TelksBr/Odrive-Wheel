import type { Dispatch } from 'react';
import type { AppAction } from '../../app/types';
import { writePaths } from './calibrationPresets';
import { assessCalibrationIntegrity } from './calibrationIntegrity';

export interface BootPersistEntry {
  path: string;
  labelKey: string;
  value: string | boolean;
}

export type BootPresetId = 'persistReady' | 'autoCalEveryBoot';

export interface BootFlagDef {
  path: string;
  labelKey: string;
  group: 'precal' | 'startup' | 'limits' | 'index';
  persistReady: boolean;
  autoCalEveryBoot: boolean;
}

/** All boot-related flags — user-controllable, not hardcoded per cal action. */
export const BOOT_FLAG_DEFS: BootFlagDef[] = [
  {
    path: 'axis0.motor.config.pre_calibrated',
    labelKey: 'calBootMotorPreCal',
    group: 'precal',
    persistReady: true,
    autoCalEveryBoot: true,
  },
  {
    path: 'axis0.encoder.config.pre_calibrated',
    labelKey: 'calBootEncoderPreCal',
    group: 'precal',
    persistReady: true,
    autoCalEveryBoot: true,
  },
  {
    path: 'axis0.config.startup_motor_calibration',
    labelKey: 'calBootStartupMotorCal',
    group: 'startup',
    persistReady: false,
    autoCalEveryBoot: true,
  },
  {
    path: 'axis0.config.startup_encoder_offset_calibration',
    labelKey: 'calBootStartupEncoderOffset',
    group: 'startup',
    persistReady: false,
    autoCalEveryBoot: true,
  },
  {
    path: 'axis0.config.startup_encoder_index_search',
    labelKey: 'calBootStartupIndexSearch',
    group: 'startup',
    persistReady: false,
    autoCalEveryBoot: false,
  },
  {
    path: 'axis0.config.startup_closed_loop_control',
    labelKey: 'calBootStartupClosedLoop',
    group: 'startup',
    persistReady: false,
    autoCalEveryBoot: true,
  },
  {
    path: 'axis0.encoder.config.use_index',
    labelKey: 'calBootUseIndex',
    group: 'index',
    persistReady: false,
    autoCalEveryBoot: false,
  },
  {
    path: 'axis0.controller.config.enable_vel_limit',
    labelKey: 'calBootDisableVelLimit',
    group: 'limits',
    persistReady: false,
    autoCalEveryBoot: false,
  },
  {
    path: 'axis0.controller.config.enable_overspeed_error',
    labelKey: 'calBootDisableOverspeed',
    group: 'limits',
    persistReady: false,
    autoCalEveryBoot: false,
  },
  {
    path: 'axis0.controller.config.enable_torque_mode_vel_limit',
    labelKey: 'calBootDisableTorqueVelLimit',
    group: 'limits',
    persistReady: false,
    autoCalEveryBoot: false,
  },
];

export function bootPresetEntries(preset: BootPresetId): BootPersistEntry[] {
  return BOOT_FLAG_DEFS.map((def) => ({
    path: def.path,
    labelKey: def.labelKey,
    value: preset === 'persistReady' ? def.persistReady : def.autoCalEveryBoot,
  }));
}

/** Recommended after cal + Save: use stored R/L and phase_offset, no re-cal on boot. */
export const persistReadyBoot: BootPersistEntry[] = bootPresetEntries('persistReady');

/** Advanced: re-run calibrations on every boot (legacy HTML step 9). */
export const autoCalEveryBoot: BootPersistEntry[] = bootPresetEntries('autoCalEveryBoot');

/** @deprecated use persistReadyBoot */
export const fullBootPersist: BootPersistEntry[] = persistReadyBoot;

export const motorMarkPreCalibrated: BootPersistEntry[] = [
  { path: 'axis0.motor.config.pre_calibrated', labelKey: 'calBootMotorPreCal', value: true },
];

export const encoderMarkPreCalibrated: BootPersistEntry[] = [
  { path: 'axis0.encoder.config.pre_calibrated', labelKey: 'calBootEncoderPreCal', value: true },
];

export const anticogBootPersist: BootPersistEntry[] = [
  { path: 'axis0.controller.config.anticogging.pre_calibrated', labelKey: 'calBootAnticogPreCal', value: true },
  { path: 'axis0.controller.config.anticogging.anticogging_enabled', labelKey: 'calBootAnticogEnabled', value: true },
];

export async function applyBootPersist(
  entries: BootPersistEntry[],
  dispatch: Dispatch<AppAction>,
): Promise<{ ok: number; fail: number }> {
  return writePaths(
    entries.map((entry) => ({ path: entry.path, value: entry.value })),
    dispatch,
  );
}

export async function applyBootPreset(
  preset: BootPresetId,
  dispatch: Dispatch<AppAction>,
  fieldValues?: Record<string, string>,
): Promise<{ ok: number; fail: number; skipped?: string[] }> {
  let entries = bootPresetEntries(preset);

  if (preset === 'persistReady' && fieldValues) {
    const integrity = assessCalibrationIntegrity(fieldValues);
    const skipped: string[] = [];
    entries = entries.map((entry) => {
      if (entry.path === 'axis0.encoder.config.pre_calibrated' && !integrity.encoderReady) {
        skipped.push('encoderPreCal');
        return { ...entry, value: false };
      }
      if (entry.path === 'axis0.motor.config.pre_calibrated' && !integrity.motorCalibrated) {
        skipped.push('motorPreCal');
        return { ...entry, value: false };
      }
      if (entry.path === 'axis0.config.startup_closed_loop_control' && !integrity.encoderReady) {
        skipped.push('closedLoop');
        return { ...entry, value: false };
      }
      return entry;
    });
    if (skipped.length > 0) {
      dispatch({
        type: 'append-log',
        direction: 'error',
        message: `Boot preset guarded: skipped ${skipped.join(', ')} — calibrate first`,
      });
    }
    const result = await applyBootPersist(entries, dispatch);
    return { ...result, skipped };
  }

  return applyBootPersist(entries, dispatch);
}

export function parseBoolField(raw: string | undefined): boolean {
  const token = (raw ?? '').trim().toLowerCase().split(/\s+/)[0];
  return token === 'true' || token === '1';
}
