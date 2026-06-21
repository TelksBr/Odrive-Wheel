import { translate, type Locale } from '../../i18n/messages';

type BitMap = Record<number, string>;

export const ERR_BITS_ODRIVE: BitMap = {
  0x00000001: 'CONTROL_ITERATION_MISSED',
  0x00000002: 'DC_BUS_UNDER_VOLTAGE',
  0x00000004: 'DC_BUS_OVER_VOLTAGE',
  0x00000008: 'DC_BUS_OVER_REGEN_CURRENT',
  0x00000010: 'DC_BUS_OVER_CURRENT',
  0x00000020: 'BRAKE_DEADTIME_VIOLATION',
  0x00000040: 'BRAKE_DUTY_CYCLE_NAN',
  0x00000080: 'INVALID_BRAKE_RESISTANCE',
};

export const ERR_BITS_AXIS: BitMap = {
  0x00000001: 'INVALID_STATE',
  0x00000040: 'MOTOR_FAILED',
  0x00000080: 'SENSORLESS_ESTIMATOR_FAILED',
  0x00000100: 'ENCODER_FAILED',
  0x00000200: 'CONTROLLER_FAILED',
  0x00000800: 'WATCHDOG_TIMER_EXPIRED',
  0x00001000: 'MIN_ENDSTOP_PRESSED',
  0x00002000: 'MAX_ENDSTOP_PRESSED',
  0x00004000: 'ESTOP_REQUESTED',
  0x00020000: 'HOMING_WITHOUT_ENDSTOP',
  0x00040000: 'OVER_TEMP',
  0x00080000: 'UNKNOWN_POSITION',
};

export const ERR_BITS_MOTOR: BitMap = {
  0x00000001: 'PHASE_RESISTANCE_OUT_OF_RANGE',
  0x00000002: 'PHASE_INDUCTANCE_OUT_OF_RANGE',
  0x00000008: 'DRV_FAULT',
  0x00000010: 'CONTROL_DEADLINE_MISSED',
  0x00000080: 'MODULATION_MAGNITUDE',
  0x00000400: 'CURRENT_SENSE_SATURATION',
  0x00001000: 'CURRENT_LIMIT_VIOLATION',
  0x00010000: 'MODULATION_IS_NAN',
  0x00020000: 'MOTOR_THERMISTOR_OVER_TEMP',
  0x00040000: 'FET_THERMISTOR_OVER_TEMP',
  0x00080000: 'TIMER_UPDATE_MISSED',
  0x00100000: 'CURRENT_MEASUREMENT_UNAVAILABLE',
  0x00200000: 'CONTROLLER_FAILED',
  0x00400000: 'I_BUS_OUT_OF_RANGE',
  0x00800000: 'BRAKE_RESISTOR_DISARMED',
  0x01000000: 'SYSTEM_LEVEL',
  0x02000000: 'BAD_TIMING',
  0x04000000: 'UNKNOWN_PHASE_ESTIMATE',
  0x08000000: 'UNKNOWN_PHASE_VEL',
  0x10000000: 'UNKNOWN_TORQUE',
  0x20000000: 'UNKNOWN_CURRENT_COMMAND',
  0x40000000: 'UNKNOWN_CURRENT_MEASUREMENT',
  0x80000000: 'UNKNOWN_VBUS_VOLTAGE',
};

export const ERR_BITS_ENCODER: BitMap = {
  0x00000001: 'UNSTABLE_GAIN',
  0x00000002: 'CPR_POLEPAIRS_MISMATCH',
  0x00000004: 'NO_RESPONSE',
  0x00000008: 'UNSUPPORTED_ENCODER_MODE',
  0x00000010: 'ILLEGAL_HALL_STATE',
  0x00000020: 'INDEX_NOT_FOUND_YET',
  0x00000040: 'ABS_SPI_TIMEOUT',
  0x00000080: 'ABS_SPI_COM_FAIL',
  0x00000100: 'ABS_SPI_NOT_READY',
  0x00000200: 'HALL_NOT_CALIBRATED_YET',
};

export const ERR_BITS_CTRL: BitMap = {
  0x00000001: 'OVERSPEED',
  0x00000002: 'INVALID_INPUT_MODE',
  0x00000004: 'UNSTABLE_GAIN',
  0x00000008: 'INVALID_MIRROR_AXIS',
  0x00000010: 'INVALID_LOAD_ENCODER',
  0x00000020: 'INVALID_ESTIMATE',
  0x00000040: 'INVALID_CIRCULAR_RANGE',
  0x00000080: 'SPINOUT_DETECTED',
};

export interface DecodedError {
  raw: string;
  hex: string;
  value: number;
  bits: string[];
  ok: boolean;
}

/** Parse a raw ODrive error reply and decode it against a bitmask map. */
export function decodeErr(raw: string, map: BitMap): DecodedError {
  const trimmed = raw.trim();
  const token = trimmed.split(/\s+/)[0] ?? '';
  // ODrive replies can be decimal or hex (0x…)
  const value = token.startsWith('0x') || token.startsWith('0X')
    ? parseInt(token, 16)
    : parseInt(token, 10);

  if (isNaN(value)) {
    return { raw: trimmed, hex: '?', value: 0, bits: [`(unparseable: ${trimmed})`], ok: false };
  }

  if (value === 0) {
    return { raw: trimmed, hex: '0x00000000', value: 0, bits: [], ok: true };
  }

  const bits: string[] = [];
  let remaining = value;
  for (const [maskStr, name] of Object.entries(map)) {
    const mask = Number(maskStr);
    if (value & mask) {
      bits.push(name);
      remaining &= ~mask;
    }
  }
  if (remaining !== 0) {
    bits.push(`(+unknown 0x${remaining.toString(16).toUpperCase()})`);
  }

  return {
    raw: trimmed,
    hex: `0x${(value >>> 0).toString(16).padStart(8, '0').toUpperCase()}`,
    value,
    bits,
    ok: false,
  };
}

export interface ErrorEntry {
  id: string;
  command: string;
  map: BitMap;
}

const ERROR_REGISTER_LABEL_KEYS: Record<string, string> = {
  odrv: 'liveErrorRegOdrv',
  axis: 'liveErrorRegAxis',
  motor: 'liveErrorRegMotor',
  enc: 'liveErrorRegEnc',
  ctrl: 'liveErrorRegCtrl',
};

export function errorRegisterLabel(locale: Locale, id: string): string {
  const key = ERROR_REGISTER_LABEL_KEYS[id];
  return key ? translate(locale, key) : id;
}

export const ERROR_REGISTERS: ErrorEntry[] = [
  { id: 'odrv', command: 'r error', map: ERR_BITS_ODRIVE },
  { id: 'axis', command: 'r axis0.error', map: ERR_BITS_AXIS },
  { id: 'motor', command: 'r axis0.motor.error', map: ERR_BITS_MOTOR },
  { id: 'enc', command: 'r axis0.encoder.error', map: ERR_BITS_ENCODER },
  { id: 'ctrl', command: 'r axis0.controller.error', map: ERR_BITS_CTRL },
];
