import type { Locale } from '../../i18n/messages';
import { translate } from '../../i18n/messages';
import type { ConfigField } from './fieldCatalog';

export interface FieldHelp {
  defaultValue: string;
  exampleValue: string;
  range: string;
  unit?: string;
  readCommand: string;
  writeCommand?: string;
  options?: string;
  guidance: string;
}

export function getFieldHelp(field: ConfigField, locale: Locale): FieldHelp {
  const unit = field.unit ?? inferUnit(field);
  return {
    defaultValue: field.defaultValue ?? inferDefault(field, locale),
    exampleValue: field.exampleValue ?? inferExample(field),
    range: formatRange(field),
    unit,
    readCommand: field.protocol === 'openffboard' ? `${field.path}?` : `r ${field.path}`,
    writeCommand: field.readonly ? undefined : field.protocol === 'openffboard' ? `${field.path}=<value>` : `w ${field.path} <value>`,
    options: field.options?.map((option) => `${option.value}: ${option.label}`).join(' · '),
    guidance: field.help ?? inferGuidance(field, locale),
  };
}

function inferDefault(field: ConfigField, locale: Locale): string {
  if (field.readonly) {
    return translate(locale, 'fieldLiveValue');
  }

  const exact = exactDefaults[field.path];
  if (exact !== undefined) {
    return exact;
  }

  if (field.path.startsWith('gpio.') && field.path.endsWith('.mode')) {
    return '0';
  }
  if (field.path.startsWith('gpio.') && field.path.endsWith('.idx')) {
    return field.path.split('.')[1] ? String(Number(field.path.split('.')[1]) - 1) : '0';
  }
  if (field.path.startsWith('gpio.') && field.path.endsWith('.invert')) {
    return 'false';
  }
  if (field.path.startsWith('gpio.') && field.path.endsWith('.amin')) {
    return '0';
  }
  if (field.path.startsWith('gpio.') && field.path.endsWith('.amax')) {
    return '4095';
  }
  if (field.type === 'bool') {
    return 'false';
  }
  if (field.options?.[0]) {
    return field.options[0].value;
  }

  return translate(locale, 'fieldFirmwareDefault');
}

function inferExample(field: ConfigField): string {
  const exact = exactExamples[field.path];
  if (exact !== undefined) {
    return exact;
  }

  if (field.path.startsWith('gpio.') && field.path.endsWith('.mode')) {
    return '2';
  }
  if (field.path.startsWith('gpio.') && field.path.endsWith('.idx')) {
    return field.path.split('.')[1] ? String(Number(field.path.split('.')[1]) - 1) : '0';
  }
  if (field.path.startsWith('gpio.') && field.path.endsWith('.amin')) {
    return '250';
  }
  if (field.path.startsWith('gpio.') && field.path.endsWith('.amax')) {
    return '3850';
  }
  if (field.type === 'bool') {
    return 'true';
  }
  if (field.options?.[0]) {
    return field.options[0].value;
  }
  if (field.min !== undefined && field.max !== undefined && Number.isFinite(field.min) && Number.isFinite(field.max)) {
    const mid = field.min + (field.max - field.min) / 2;
    return field.type === 'int' ? String(Math.round(mid)) : trimNumber(mid);
  }
  if (field.min !== undefined) {
    return String(field.min);
  }
  if (field.max !== undefined) {
    return String(field.max);
  }
  return field.type === 'readonly' ? '-' : '<value>';
}

function inferUnit(field: ConfigField): string | undefined {
  const path = field.path.toLowerCase();
  const label = field.label.toLowerCase();
  const text = `${path} ${label}`;

  if (text.includes('voltage') || text.includes('vbus')) return 'V';
  if (text.includes('current') || text.includes('ibus')) return 'A';
  if (text.includes('torque')) return 'Nm';
  if (text.includes('frequency') || text.includes('freq') || text.includes('bandwidth')) return 'Hz';
  if (text.includes('angle') || text.includes('range') || text.includes('position')) return text.includes('curpos') ? 'deg' : 'deg';
  if (text.includes('speed') || text.includes('velocity') || text.includes('vel')) return 'deg/s';
  if (text.includes('time') || text.includes('timeout')) return 's';
  if (text.includes('resistance')) return 'ohm';
  if (text.includes('adc') || path.endsWith('.cur') || path.endsWith('.amin') || path.endsWith('.amax')) return 'counts';
  if (text.includes('cpr')) return 'counts/rev';
  return undefined;
}

function inferGuidance(field: ConfigField, locale: Locale): string {
  if (field.caution) {
    return field.caution;
  }
  if (field.readonly) {
    return translate(locale, 'fieldReadonlyGuidance');
  }
  if (field.protocol === 'openffboard') {
    return translate(locale, 'fieldOpenFfbGuidance');
  }
  if (field.protocol === 'odrive') {
    return translate(locale, 'fieldOdriveGuidance');
  }
  return translate(locale, 'fieldWritableGuidance');
}

function formatRange(field: ConfigField): string {
  if (field.options?.length) {
    return field.options.map((option) => option.value).join(' / ');
  }
  if (field.min !== undefined || field.max !== undefined) {
    return `${field.min ?? '-inf'} .. ${field.max ?? '+inf'}`;
  }
  if (field.type === 'bool') {
    return 'true / false';
  }
  if (field.readonly) {
    return 'read-only';
  }
  return 'firmware-defined';
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

const exactDefaults: Record<string, string> = {
  'config.dc_bus_overvoltage_trip_level': '56',
  'config.dc_bus_undervoltage_trip_level': '8',
  'config.brake_resistance': '2',
  'config.enable_brake_resistor': 'false',
  'config.dc_bus_overvoltage_ramp_start': '48',
  'config.dc_bus_overvoltage_ramp_end': '52',
  'config.dc_max_positive_current': '20',
  'config.dc_max_negative_current': '-5',
  'axis0.requested_state': '1',
  'axis0.config.startup_closed_loop_control': 'false',
  'axis0.motor.config.motor_type': '0',
  'axis0.motor.config.calibration_current': '10',
  'axis0.motor.config.resistance_calib_max_voltage': '4',
  'axis0.motor.config.current_control_bandwidth': '100',
  'axis0.motor.config.current_control_deadband': '0',
  'axis0.motor.config.pre_calibrated': 'false',
  'axis0.encoder.config.mode': '0',
  'axis0.encoder.config.use_index': 'false',
  'axis0.encoder.config.pre_calibrated': 'false',
  'axis0.controller.config.control_mode': '1',
  'axis0.controller.config.input_mode': '1',
  'axis0.controller.config.enable_vel_limit': 'false',
  'axis0.controller.config.enable_overspeed_error': 'false',
  'axis0.controller.config.enable_torque_mode_vel_limit': 'false',
  'axis.range': '900',
  'axis.maxtorque': '10',
  'axis.fxratio': '1',
  'axis.invert': 'false',
  'axis.idlespring': '0',
  'axis.axisdamper': '0',
  'axis.axisinertia': '0',
  'axis.axisfriction': '0',
  'axis.esgain': '0',
  'axis.esdamp': '0',
  'axis.maxtorquerate': '0',
  'axis.expo': '0',
  'axis.exposcale': '1',
  'sys.vbusdiv': '10',
};

const exactExamples: Record<string, string> = {
  'config.brake_resistance': '2.0',
  'config.dc_max_positive_current': '15',
  'config.dc_max_negative_current': '-3',
  'axis0.requested_state': '8',
  'axis0.motor.config.pole_pairs': '7',
  'axis0.motor.config.torque_constant': '0.05',
  'axis0.encoder.config.cpr': '8192',
  'axis0.controller.config.vel_limit': '10000',
  'axis.range': '900',
  'axis.maxtorque': '12',
  'axis.fxratio': '0.75',
  'axis.idlespring': '15',
  'axis.axisdamper': '8',
  'axis.esgain': '40',
  'axis.maxtorquerate': '4',
  'sys.vbusdiv': '10',
};
