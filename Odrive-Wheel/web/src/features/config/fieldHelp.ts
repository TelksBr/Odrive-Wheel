import { guidanceEn, guidancePt } from '../../i18n/bundles/guidance';
import type { Locale } from '../../i18n/messages';
import { translate } from '../../i18n/messages';
import type { ConfigField } from './fieldCatalog';
import { fieldDefaults, fieldExamples, fieldRanges } from './fieldMetaValues';

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

  const exact = fieldDefaults[field.path];
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
  const exact = fieldExamples[field.path];
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
  if (field.caution) return field.caution;
  const guidance = locale === 'pt' ? guidancePt : guidanceEn;
  const exact = guidance[field.path];
  if (exact) return exact;
  // Dynamic patterns for GPIO fields
  if (field.path.startsWith('gpio.') && field.path.endsWith('.mode')) {
    return 'Set Disabled (0) to ignore this pin. Button (1) maps the pin to a HID button. Analog axis (2) uses the ADC for a joystick axis — calibrate with amin/amax. Zero wheel (3) resets the encoder position when pressed.';
  }
  if (field.path.startsWith('gpio.') && field.path.endsWith('.idx')) {
    return 'HID report index assigned to this pin. Button index 0–63. Analog axis index 0–7. Avoid duplicating the same index for two GPIOs with the same mode.';
  }
  if (field.path.startsWith('gpio.') && field.path.endsWith('.invert')) {
    return 'Mirrors the input direction. For buttons: pressed = 0 instead of 1. For analog axes: the mapped range is reversed (max ↔ min). Useful for potentiometers wired in reverse.';
  }
  if (field.path.startsWith('gpio.') && field.path.endsWith('.amin')) {
    return 'Raw ADC count at mechanical minimum. Read gpio.N.cur while pedal/stick is at minimum position and enter that value. Typical range 0–300 for most hall sensors. Correct calibration eliminates axis dead zones.';
  }
  if (field.path.startsWith('gpio.') && field.path.endsWith('.amax')) {
    return 'Raw ADC count at mechanical maximum. Read gpio.N.cur while pedal/stick is at maximum position. Typical range 3800–4095. amax must be greater than amin.';
  }
  if (field.path.startsWith('fx.filter') && field.path.endsWith('Freq')) {
    return 'Low-pass cutoff frequency for this effect type. 0 = filter bypassed (sharpest response, may add high-frequency noise). 50–150 Hz is typical for sim racing — smooth without losing road texture. Lower values add latency.';
  }
  if (field.path.startsWith('fx.filter') && field.path.endsWith('Q')) {
    return 'Biquad Q (quality) factor. Q = 0.5 = over-damped (very smooth). Q = 0.707 = Butterworth (flat, recommended starting point). Q > 1.0 = resonant peak — adds a subtle bump at the cutoff frequency, can feel lively but may oscillate.';
  }
  return 'FFB: Apply persists to EEPROM (sys.save!). ODrive: Apply writes RAM only — toolbar Save persists NVM and reboots.';
}

function formatRange(field: ConfigField): string {
  const catalogRange = fieldRanges[field.path];
  if (catalogRange) {
    return catalogRange;
  }
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
