import type { Dispatch } from 'react';
import type { AppAction } from '../../app/types';
import { unifiedSave, type SaveProgress } from '../board/unifiedSave';
import { readField, readFieldNow } from '../board/BoardProtocol';
import { parseAxisError } from './calibrationIntegrity';
import { applyBootPersistNow, getPostCalibrationPreset, isPresetSynced, parseBoolField, type BootPersistEntry } from './calibrationBootPresets';
import { fieldByPath } from './calibrationPresets';
import { serialService } from '../serial/SerialService';

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** ODrive NVM must contain these after a successful cal + finalize (readonly — ss saves from RAM). */
export const CALIBRATION_NVM_SNAPSHOT_PATHS = [
  'axis0.motor.config.phase_resistance',
  'axis0.motor.config.phase_inductance',
  'axis0.encoder.config.phase_offset',
  'axis0.encoder.config.phase_offset_float',
] as const;

export interface CalibrationLiveStatus {
  motorCalibrated: boolean;
  encoderReady: boolean;
  motorPreCalibrated: boolean;
  encoderPreCalibrated: boolean;
}

export interface CalibrationSnapshot {
  phaseResistance: string;
  phaseInductance: string;
  phaseOffset: string;
  phaseOffsetFloat: string;
}

function entryToFieldValue(entry: BootPersistEntry): string {
  if (typeof entry.value === 'boolean') {
    return entry.value ? 'true' : 'false';
  }
  return String(entry.value);
}

function parseFloatField(raw: string): number {
  const value = Number(raw.trim().split(/\s+/)[0]);
  return Number.isFinite(value) ? value : NaN;
}

/** Fresh reads from the board — never trust stale UI state for finalize. */
export async function readCalibrationLiveStatus(useNow = false): Promise<CalibrationLiveStatus> {
  const read = (field: NonNullable<ReturnType<typeof fieldByPath>>) =>
    useNow ? readFieldNow(field) : readField(field);
  const motorCal = await read(fieldByPath('axis0.motor.is_calibrated')!);
  const encReady = await read(fieldByPath('axis0.encoder.is_ready')!);
  const motorPre = await read(fieldByPath('axis0.motor.config.pre_calibrated')!);
  const encPre = await read(fieldByPath('axis0.encoder.config.pre_calibrated')!);
  return {
    motorCalibrated: parseBoolField(motorCal),
    encoderReady: parseBoolField(encReady),
    motorPreCalibrated: parseBoolField(motorPre),
    encoderPreCalibrated: parseBoolField(encPre),
  };
}

export async function readCalibrationSnapshot(useNow = false): Promise<CalibrationSnapshot> {
  const read = (field: NonNullable<ReturnType<typeof fieldByPath>>) =>
    useNow ? readFieldNow(field) : readField(field);
  const phaseResistance = await read(fieldByPath('axis0.motor.config.phase_resistance')!);
  const phaseInductance = await read(fieldByPath('axis0.motor.config.phase_inductance')!);
  const phaseOffset = await read(fieldByPath('axis0.encoder.config.phase_offset')!);
  const phaseOffsetFloat = await read(fieldByPath('axis0.encoder.config.phase_offset_float')!);
  return { phaseResistance, phaseInductance, phaseOffset, phaseOffsetFloat };
}

export function isCalibrationSnapshotValid(snapshot: CalibrationSnapshot, status: CalibrationLiveStatus): boolean {
  const r = parseFloatField(snapshot.phaseResistance);
  const l = parseFloatField(snapshot.phaseInductance);
  return status.motorCalibrated && status.encoderReady && r > 0 && l > 0;
}

export function canArmClosedLoop(status: CalibrationLiveStatus): boolean {
  return status.motorCalibrated && status.encoderReady;
}

export function isPostCalibrationPersisted(
  status: CalibrationLiveStatus,
  fieldValues: Record<string, string>,
): boolean {
  if (!status.motorCalibrated || !status.encoderReady || !status.motorPreCalibrated) {
    return false;
  }
  return isPresetSynced(getPostCalibrationPreset(fieldValues), fieldValues);
}

function syncFieldValues(
  dispatch: Dispatch<AppAction>,
  preset: BootPersistEntry[],
  snapshot: CalibrationSnapshot,
  status: CalibrationLiveStatus,
): void {
  for (const entry of preset) {
    const value = entryToFieldValue(entry);
    dispatch({ type: 'set-field', path: entry.path, value, dirty: false });
  }
  dispatch({ type: 'set-field', path: 'axis0.motor.config.phase_resistance', value: snapshot.phaseResistance, dirty: false });
  dispatch({ type: 'set-field', path: 'axis0.motor.config.phase_inductance', value: snapshot.phaseInductance, dirty: false });
  dispatch({ type: 'set-field', path: 'axis0.encoder.config.phase_offset', value: snapshot.phaseOffset, dirty: false });
  dispatch({ type: 'set-field', path: 'axis0.encoder.config.phase_offset_float', value: snapshot.phaseOffsetFloat, dirty: false });
  dispatch({ type: 'set-field', path: 'axis0.motor.is_calibrated', value: status.motorCalibrated ? 'true' : 'false', dirty: false });
  dispatch({ type: 'set-field', path: 'axis0.encoder.is_ready', value: status.encoderReady ? 'true' : 'false', dirty: false });
}

function snapshotToFieldValues(snapshot: CalibrationSnapshot): Record<string, string> {
  return {
    'axis0.motor.config.phase_resistance': snapshot.phaseResistance,
    'axis0.motor.config.phase_inductance': snapshot.phaseInductance,
    'axis0.encoder.config.phase_offset': snapshot.phaseOffset,
    'axis0.encoder.config.phase_offset_float': snapshot.phaseOffsetFloat,
  };
}

/**
 * odrive-wheel.html setup step 9: preset in RAM → ss (full NVM) → reboot.
 * Cal values (R/L, phase_offset) live in RAM from steps 1–2; ss persists all RAM.
 */
export async function applyPostCalibrationPresetAndSave(
  dispatch: Dispatch<AppAction>,
  fieldValues: Record<string, string>,
  onProgress?: (step: SaveProgress) => void,
): Promise<{ ok: boolean; reconnected: boolean; status?: CalibrationLiveStatus }> {
  let snapshot!: CalibrationSnapshot;
  let status!: CalibrationLiveStatus;
  let preset!: BootPersistEntry[];

  await serialService.runAtomic(async () => {
    await serialService.writeOdriveNow('w axis0.requested_state 1', false);
    await sleep(400);

    status = await readCalibrationLiveStatus(true);
    if (!status.motorCalibrated) {
      throw new Error('calFinalizeNeedMotor');
    }
    if (!status.encoderReady) {
      throw new Error('calFinalizeNeedEncoder');
    }

    snapshot = await readCalibrationSnapshot(true);
    if (!isCalibrationSnapshotValid(snapshot, status)) {
      throw new Error('calFinalizeCalDataMissing');
    }

    const mode = await readFieldNow(fieldByPath('axis0.encoder.config.mode')!);
    const useIndex = await readFieldNow(fieldByPath('axis0.encoder.config.use_index')!);
    preset = getPostCalibrationPreset({
      ...fieldValues,
      'axis0.encoder.config.mode': mode,
      'axis0.encoder.config.use_index': useIndex,
    });

    const presetResult = await applyBootPersistNow(preset, dispatch);
    if (presetResult.fail > 0 || presetResult.ok === 0) {
      throw new Error(`calFinalizePresetFailed|${presetResult.errors.join('; ')}`);
    }
  });

  syncFieldValues(dispatch, preset, snapshot, status);
  const result = await unifiedSave({
    dirtyPaths: [],
    nvmPendingPaths: [],
    fieldValues: {
      ...snapshotToFieldValues(snapshot),
      ...Object.fromEntries(preset.map((e) => [e.path, entryToFieldValue(e)])),
    },
    onProgress,
  });

  if (!result.reconnected || !result.values) {
    throw new Error('calFinalizeNoReboot');
  }

  const motorErr = parseAxisError(result.values['axis0.motor.error']);
  const encErr = parseAxisError(result.values['axis0.encoder.error']);
  const axisErr = parseAxisError(result.values['axis0.error']);
  if (motorErr || encErr || axisErr) {
    throw new Error('calFinalizePostRebootErrors');
  }

  if (!isPresetSynced(getPostCalibrationPreset(result.values), result.values)) {
    throw new Error('calFinalizePresetNotPersisted');
  }

  const after = await readCalibrationLiveStatus();

  for (const [path, value] of Object.entries(result.values)) {
    dispatch({ type: 'set-field', path, value, dirty: false });
  }
  dispatch({ type: 'clear-dirty' });
  dispatch({ type: 'set-nvm-pending', pending: false });
  dispatch({ type: 'mark-refreshed' });

  return { ok: true, reconnected: true, status: after };
}
