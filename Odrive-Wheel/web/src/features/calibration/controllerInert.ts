/** Controller fields ignored by firmware when control_mode = TORQUE (1). */
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

export const CONTROLLER_PARTIAL_IN_TORQUE = ['axis0.controller.config.vel_gain'] as const;

export function isTorqueControlMode(value: string | undefined): boolean {
  const v = (value ?? '').trim();
  return v === '1' || v.toLowerCase() === 'true';
}

export function isFieldInertInTorque(path: string, controlMode: string | undefined): boolean {
  if (!isTorqueControlMode(controlMode)) {
    return false;
  }
  return (
    CONTROLLER_INERT_IN_TORQUE.includes(path as (typeof CONTROLLER_INERT_IN_TORQUE)[number]) ||
    CONTROLLER_PARTIAL_IN_TORQUE.includes(path as (typeof CONTROLLER_PARTIAL_IN_TORQUE)[number])
  );
}

export function isFieldPartialInTorque(path: string, controlMode: string | undefined): boolean {
  return (
    isTorqueControlMode(controlMode) &&
    CONTROLLER_PARTIAL_IN_TORQUE.includes(path as (typeof CONTROLLER_PARTIAL_IN_TORQUE)[number])
  );
}
