import type { AppState } from '../../app/types';
import { detectEncoderProfile } from './calibrationTargets';
import { parseBoolField } from './calibrationBootPresets';

export interface CalibrationIntegrityReport {
  blockers: string[];
  warnings: string[];
  encoderReady: boolean;
  motorCalibrated: boolean;
  encoderPreCal: boolean;
  motorPreCal: boolean;
  startupClosedLoop: boolean;
}

function isReady(raw: string | undefined): boolean {
  return parseBoolField(raw);
}

const ENCODER_CONFIG_DIRTY_PATHS = new Set([
  'axis0.encoder.config.mode',
  'axis0.encoder.config.cpr',
  'axis0.encoder.config.abs_spi_cs_gpio_pin',
  'axis0.encoder.config.use_index',
]);

export function assessCalibrationIntegrity(
  fieldValues: Record<string, string>,
  dirtyPaths?: string[],
  nvmPendingPaths?: string[],
): CalibrationIntegrityReport {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const pending = new Set([...(dirtyPaths ?? []), ...(nvmPendingPaths ?? [])]);
  const isPending = (path: string) => pending.has(path);

  const encoderReady = isReady(fieldValues['axis0.encoder.is_ready']);
  const motorCalibrated = isReady(fieldValues['axis0.motor.is_calibrated']);
  const encoderPreCal = parseBoolField(fieldValues['axis0.encoder.config.pre_calibrated']);
  const motorPreCal = parseBoolField(fieldValues['axis0.motor.config.pre_calibrated']);
  const startupClosedLoop = parseBoolField(fieldValues['axis0.config.startup_closed_loop_control']);
  const startupMotorCal = parseBoolField(fieldValues['axis0.config.startup_motor_calibration']);
  const startupEncCal = parseBoolField(fieldValues['axis0.config.startup_encoder_offset_calibration']);
  const profile = detectEncoderProfile(fieldValues['axis0.encoder.config.mode']);

  const encoderConfigDirty =
    dirtyPaths?.some((path) => ENCODER_CONFIG_DIRTY_PATHS.has(path)) ?? false;

  if (encoderConfigDirty && !encoderReady) {
    blockers.push('encoderDirtyNeedsCal');
  }
  if (encoderPreCal && !encoderReady && isPending('axis0.encoder.config.pre_calibrated')) {
    blockers.push('encoderPreCalWithoutReady');
  }
  if (motorPreCal && !motorCalibrated && isPending('axis0.motor.config.pre_calibrated')) {
    blockers.push('motorPreCalWithoutCal');
  }
  if (
    startupClosedLoop &&
    isPending('axis0.config.startup_closed_loop_control')
  ) {
    const motorOk = motorCalibrated || startupMotorCal;
    const encOk = encoderReady || startupEncCal;
    if (!motorOk || !encOk) {
      warnings.push('closedLoopWithoutCal');
    }
  }
  if (profile === 'as5047' && encoderReady && !encoderPreCal) {
    warnings.push('as5047ReadyNeedsPreCal');
  }
  if (startupMotorCal && motorPreCal) {
    warnings.push('startupMotorCalRedundant');
  }
  if (startupEncCal && encoderPreCal) {
    warnings.push('startupEncCalRedundant');
  }

  return {
    blockers,
    warnings,
    encoderReady,
    motorCalibrated,
    encoderPreCal,
    motorPreCal,
    startupClosedLoop,
  };
}

export function shouldBlockSave(report: CalibrationIntegrityReport): boolean {
  return report.blockers.length > 0;
}

export function parseAxisError(raw: string | undefined): number {
  const token = (raw ?? '').trim().split(/\s+/)[0];
  const value = Number(token);
  return Number.isFinite(value) ? value : 0;
}

export function integrityMessageKeys(report: CalibrationIntegrityReport): {
  blockers: string[];
  warnings: string[];
} {
  return { blockers: report.blockers, warnings: report.warnings };
}

export function canSafelyPersistBootPreset(state: Pick<AppState, 'fieldValues'>): {
  ok: boolean;
  reasonKey?: string;
} {
  const report = assessCalibrationIntegrity(state.fieldValues);
  if (!report.motorCalibrated) {
    return { ok: false, reasonKey: 'calIntegrityNeedMotorCal' };
  }
  if (!report.encoderReady) {
    return { ok: false, reasonKey: 'calIntegrityNeedEncoderCal' };
  }
  return { ok: true };
}
