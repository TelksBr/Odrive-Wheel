/**
 * Field editability from ODrive controller.cpp + odrive-wheel.html hierarchy.
 *
 * TORQUE mode (FFB): PID / position / circular / homing fields are inert.
 * vel_gain is partial only when enable_torque_mode_vel_limit=true (clamp factor).
 * vel_limit / vel_limit_tolerance depend on their enable flags.
 */

export type FieldEditState = 'active' | 'partial' | 'inert';

/** Ignored when control_mode = TORQUE (1) — controller.cpp position/velocity blocks. */
export const CONTROLLER_INERT_IN_TORQUE = [
  'axis0.controller.config.pos_gain',
  'axis0.controller.config.vel_integrator_gain',
  'axis0.controller.config.vel_integrator_limit',
  'axis0.controller.config.inertia',
  'axis0.controller.config.enable_gain_scheduling',
  'axis0.controller.config.gain_scheduling_width',
  'axis0.controller.config.circular_setpoints',
  'axis0.controller.config.circular_setpoint_range',
  'axis0.controller.config.steps_per_circular_range',
  'axis0.controller.config.homing_speed',
  'axis0.controller.config.load_encoder_axis',
  'axis0.controller.config.axis_to_mirror',
  'axis0.controller.config.mirror_ratio',
  'axis0.controller.config.torque_mirror_ratio',
] as const;

/** Used as clamp factor in TORQUE when enable_torque_mode_vel_limit — not as PID gain. */
export const CONTROLLER_PARTIAL_IN_TORQUE = ['axis0.controller.config.vel_gain'] as const;

const VEL_LIMIT_PATH = 'axis0.controller.config.vel_limit';
const VEL_LIMIT_TOLERANCE_PATH = 'axis0.controller.config.vel_limit_tolerance';
const VEL_GAIN_PATH = 'axis0.controller.config.vel_gain';

function parseBool(raw: string | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

function controlModeNum(value: string | undefined): number {
  const v = (value ?? '').trim();
  const n = Number(v);
  return Number.isFinite(n) ? n : -1;
}

export function isTorqueControlMode(value: string | undefined): boolean {
  return controlModeNum(value) === 1;
}

function flag(values: Record<string, string>, path: string): boolean {
  return parseBool(values[path]);
}

function isInertInTorqueList(path: string): boolean {
  return CONTROLLER_INERT_IN_TORQUE.includes(path as (typeof CONTROLLER_INERT_IN_TORQUE)[number]);
}

function velLimitConsumersActive(values: Record<string, string>, torqueMode: boolean): boolean {
  const enableVelLimit = flag(values, 'axis0.controller.config.enable_vel_limit');
  const enableOverspeed = flag(values, 'axis0.controller.config.enable_overspeed_error');
  const enableTorqueVelLimit = flag(values, 'axis0.controller.config.enable_torque_mode_vel_limit');

  if (torqueMode) {
    return enableTorqueVelLimit || enableOverspeed || enableVelLimit;
  }
  return enableVelLimit || enableOverspeed;
}

export function getFieldEditState(path: string, values: Record<string, string>): FieldEditState {
  const controlMode = values['axis0.controller.config.control_mode'];
  const mode = controlModeNum(controlMode);
  const torqueMode = mode === 1;

  if (torqueMode) {
    if (path === VEL_GAIN_PATH) {
      return flag(values, 'axis0.controller.config.enable_torque_mode_vel_limit') ? 'partial' : 'inert';
    }
    if (path === VEL_LIMIT_PATH) {
      return velLimitConsumersActive(values, true) ? 'active' : 'inert';
    }
    if (path === VEL_LIMIT_TOLERANCE_PATH) {
      return flag(values, 'axis0.controller.config.enable_overspeed_error') ? 'active' : 'inert';
    }
    if (isInertInTorqueList(path)) {
      return 'inert';
    }
    return 'active';
  }

  // Non-torque: PID gains follow control_mode threshold (firmware blocks).
  if (path === 'axis0.controller.config.pos_gain') {
    return mode >= 3 ? 'active' : 'inert';
  }
  if (
    path === VEL_GAIN_PATH ||
    path === 'axis0.controller.config.vel_integrator_gain' ||
    path === 'axis0.controller.config.vel_integrator_limit'
  ) {
    return mode >= 2 ? 'active' : 'inert';
  }

  if (path === VEL_LIMIT_PATH) {
    return velLimitConsumersActive(values, false) ? 'active' : 'inert';
  }
  if (path === VEL_LIMIT_TOLERANCE_PATH) {
    return flag(values, 'axis0.controller.config.enable_overspeed_error') ? 'active' : 'inert';
  }

  if (path === 'axis0.controller.config.gain_scheduling_width') {
    return flag(values, 'axis0.controller.config.enable_gain_scheduling') ? 'active' : 'inert';
  }
  if (
    path === 'axis0.controller.config.circular_setpoint_range' ||
    path === 'axis0.controller.config.steps_per_circular_range'
  ) {
    return flag(values, 'axis0.controller.config.circular_setpoints') ? 'active' : 'inert';
  }

  return 'active';
}

export function isFieldInert(path: string, values: Record<string, string>): boolean {
  return getFieldEditState(path, values) === 'inert';
}

export function isFieldPartial(path: string, values: Record<string, string>): boolean {
  return getFieldEditState(path, values) === 'partial';
}
