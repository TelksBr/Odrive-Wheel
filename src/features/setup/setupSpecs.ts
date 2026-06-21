import type { SetupFormSpec } from '../calibration/SetupParamForm';

export const POWER_SPECS: SetupFormSpec[] = [
  { path: 'config.brake_resistance', type: 'number', defaultValue: 2 },
  { path: 'config.enable_brake_resistor', type: 'bool', defaultValue: true },
  { path: 'config.dc_bus_undervoltage_trip_level', type: 'number', defaultValue: 8 },
  { path: 'config.dc_bus_overvoltage_trip_level', type: 'number', defaultValue: 28 },
  { path: 'config.dc_bus_overvoltage_ramp_start', type: 'number', defaultValue: 24.5 },
  { path: 'config.dc_bus_overvoltage_ramp_end', type: 'number', defaultValue: 27 },
  { path: 'config.dc_max_positive_current', type: 'number', defaultValue: 25 },
  { path: 'config.dc_max_negative_current', type: 'number', defaultValue: -15 },
  { path: 'config.max_regen_current', type: 'number', defaultValue: 0 },
];

export const MOTOR_SPECS: SetupFormSpec[] = [
  { path: 'axis0.motor.config.motor_type', type: 'number', defaultValue: 0 },
  { path: 'axis0.motor.config.pole_pairs', type: 'number', defaultValue: 4 },
  { path: 'axis0.motor.config.torque_constant', type: 'number', defaultValue: 0.87 },
  { path: 'axis0.motor.config.current_lim', type: 'number', defaultValue: 20 },
  { path: 'axis0.motor.config.calibration_current', type: 'number', defaultValue: 5 },
  { path: 'axis0.motor.config.resistance_calib_max_voltage', type: 'number', defaultValue: 12 },
  { path: 'axis0.motor.config.requested_current_range', type: 'number', defaultValue: 25 },
  { path: 'axis0.motor.config.current_control_bandwidth', type: 'number', defaultValue: 200 },
];

export const ENC_SPECS: SetupFormSpec[] = [
  { path: 'axis0.encoder.config.mode', type: 'number', defaultValue: 0 },
  { path: 'axis0.encoder.config.cpr', type: 'number', defaultValue: 8192 },
  { path: 'axis0.encoder.config.direction', type: 'number', defaultValue: 1 },
  { path: 'axis0.encoder.config.bandwidth', type: 'number', defaultValue: 200 },
  { path: 'axis0.encoder.config.use_index', type: 'bool', defaultValue: false },
  { path: 'axis0.encoder.config.abs_spi_cs_gpio_pin', type: 'number', defaultValue: 7 },
  { path: 'axis0.encoder.config.pre_calibrated', type: 'bool', defaultValue: false },
];

export const FFB_SPECS: SetupFormSpec[] = [
  { path: 'axis.range', type: 'number', defaultValue: 900 },
  { path: 'axis.maxtorque', type: 'number', defaultValue: 3 },
  { path: 'axis.fxratio', type: 'number', defaultValue: 1 },
];

/** Hydrate form defaults from board cache, falling back to spec defaults. */
export function mergeFormValues(
  specs: SetupFormSpec[],
  fieldValues: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const spec of specs) {
    const cached = fieldValues[spec.path]?.trim();
    if (cached) {
      out[spec.path] = cached;
    } else {
      out[spec.path] =
        typeof spec.defaultValue === 'boolean'
          ? spec.defaultValue
            ? 'true'
            : 'false'
          : String(spec.defaultValue);
    }
  }
  return out;
}
