import type { EncoderProfile } from '../calibration/calibrationTargets';
import { detectEncoderProfile } from '../calibration/calibrationTargets';
import type { SetupStepId } from './setupSteps';
import { parseProbeResults } from './setupProbeParse';

export interface SetupContext {
  probeVbusV: number | null;
  liveVbusV: number | null;
  multimeterVbusV: number | null;
  nominalVbusV: number | null;
  vbusdiv: string | null;
  firmware: string | null;
  hardware: string | null;
  encoderProfile: EncoderProfile;
  motorCalibrated: boolean;
  encoderReady: boolean;
  phaseResistance: number | null;
  phaseInductance: number | null;
  motorKt: number | null;
  motorCurrentLim: number | null;
  fieldValues: Record<string, string>;
}

export interface SetupRecommendation {
  path: string;
  value: string;
  reasonKey: string;
  reasonParams?: Record<string, string>;
}

export interface StepRecommendations {
  step: SetupStepId;
  items: SetupRecommendation[];
  values: Record<string, string>;
  summaryKey: string;
  summaryParams?: Record<string, string>;
  confidence: 'high' | 'medium' | 'low';
  blockedReasonKey?: string;
}

function parseNum(raw: string | undefined): number | null {
  if (!raw?.trim()) {
    return null;
  }
  const value = parseFloat(raw.trim().split(/\s+/)[0]);
  return Number.isFinite(value) ? value : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function parseBool(raw: string | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === 'true' || v === '1';
}

export function buildSetupContext(input: {
  probeResults: Record<string, string>;
  liveVbusV: number | null;
  multimeterVbusV: number | null;
  fieldValues: Record<string, string>;
  motorResults: { resistance: string | null; inductance: string | null } | null;
  motorCalDone: boolean;
  encCalDone: boolean;
}): SetupContext {
  const probe = parseProbeResults(input.probeResults);
  const fv = input.fieldValues;
  const fieldVbus = parseNum(fv['vbus_voltage']);
  const multimeterVbusV =
    input.multimeterVbusV !== null && input.multimeterVbusV > 0 ? input.multimeterVbusV : null;
  const liveVbusV = input.liveVbusV ?? fieldVbus;
  const probeVbusV = probe.vbusV;

  let nominalVbusV: number | null = null;
  if (multimeterVbusV !== null) {
    nominalVbusV = multimeterVbusV;
  } else if (liveVbusV !== null && liveVbusV > 6 && liveVbusV < 55) {
    nominalVbusV = liveVbusV;
  } else if (probeVbusV !== null && probeVbusV > 6 && probeVbusV < 55) {
    nominalVbusV = probeVbusV;
  }

  const mode = fv['axis0.encoder.config.mode'];
  let encoderProfile = detectEncoderProfile(mode);
  const hardware = probe.hardware ?? fv['sys.hwtype'] ?? null;
  if (encoderProfile === 'unknown' && hardware?.toLowerCase().includes('odrive-wheel')) {
    encoderProfile = 'as5047';
  }

  return {
    probeVbusV,
    liveVbusV,
    multimeterVbusV,
    nominalVbusV,
    vbusdiv: fv['sys.vbusdiv']?.trim() || null,
    firmware: probe.firmware ?? fv['sys.swver'] ?? null,
    hardware,
    encoderProfile,
    motorCalibrated: parseBool(fv['axis0.motor.is_calibrated']) || input.motorCalDone,
    encoderReady: parseBool(fv['axis0.encoder.is_ready']) || input.encCalDone,
    phaseResistance: parseNum(input.motorResults?.resistance ?? fv['axis0.motor.config.phase_resistance']),
    phaseInductance: parseNum(input.motorResults?.inductance ?? fv['axis0.motor.config.phase_inductance']),
    motorKt: parseNum(fv['axis0.motor.config.torque_constant']),
    motorCurrentLim: parseNum(fv['axis0.motor.config.current_lim']),
    fieldValues: fv,
  };
}

function recommendPower(ctx: SetupContext): StepRecommendations | null {
  const v = ctx.nominalVbusV;
  if (v === null) {
    return {
      step: 'power',
      items: [],
      values: {},
      summaryKey: 'setupRecPowerNeedVbus',
      confidence: 'low',
      blockedReasonKey: 'setupRecPowerNeedVbus',
    };
  }

  const uv = round1(Math.max(5, v - 5));
  const ov = round1(v + 5);
  const rampStart = round1(v + 0.5);
  const rampEnd = round1(Math.min(v + 3, ov - 0.5));

  const values: Record<string, string> = {
    'config.dc_bus_undervoltage_trip_level': String(uv),
    'config.dc_bus_overvoltage_trip_level': String(ov),
    'config.dc_bus_overvoltage_ramp_start': String(rampStart),
    'config.dc_bus_overvoltage_ramp_end': String(rampEnd),
    'config.brake_resistance': '2',
    'config.enable_brake_resistor': 'true',
  };

  const items: SetupRecommendation[] = [
    {
      path: 'config.dc_bus_undervoltage_trip_level',
      value: values['config.dc_bus_undervoltage_trip_level'],
      reasonKey: 'setupRecReasonUv',
      reasonParams: { v: String(round1(v)), uv: String(uv) },
    },
    {
      path: 'config.dc_bus_overvoltage_trip_level',
      value: values['config.dc_bus_overvoltage_trip_level'],
      reasonKey: 'setupRecReasonOv',
      reasonParams: { v: String(round1(v)), ov: String(ov) },
    },
    {
      path: 'config.dc_bus_overvoltage_ramp_start',
      value: values['config.dc_bus_overvoltage_ramp_start'],
      reasonKey: 'setupRecReasonRamp',
      reasonParams: { start: String(rampStart), end: String(rampEnd) },
    },
  ];

  return {
    step: 'power',
    items,
    values,
    summaryKey: 'setupRecPowerSummary',
    summaryParams: { v: round1(v).toFixed(1), uv: String(uv), ov: String(ov) },
    confidence: ctx.multimeterVbusV !== null || ctx.liveVbusV !== null ? 'high' : 'medium',
  };
}

function recommendMotor(ctx: SetupContext): StepRecommendations | null {
  const v = ctx.nominalVbusV;
  const calMaxV = v !== null ? round1(Math.max(8, Math.min(v - 1, v * 0.85))) : 12;
  const values: Record<string, string> = {
    'axis0.motor.config.resistance_calib_max_voltage': String(calMaxV),
  };

  if (v !== null) {
    values['axis0.motor.config.calibration_current'] = v <= 16 ? '3' : '5';
  }

  const items: SetupRecommendation[] = [
    {
      path: 'axis0.motor.config.resistance_calib_max_voltage',
      value: values['axis0.motor.config.resistance_calib_max_voltage'],
      reasonKey: v !== null ? 'setupRecReasonCalMaxV' : 'setupRecReasonCalMaxVDefault',
      reasonParams: v !== null ? { v: round1(v).toFixed(1), max: String(calMaxV) } : { max: String(calMaxV) },
    },
  ];

  if (v !== null) {
    items.push({
      path: 'axis0.motor.config.calibration_current',
      value: values['axis0.motor.config.calibration_current'],
      reasonKey: 'setupRecReasonCalCurrent',
      reasonParams: { v: round1(v).toFixed(1), amps: values['axis0.motor.config.calibration_current'] },
    });
  }

  return {
    step: 'motor',
    items,
    values,
    summaryKey: v !== null ? 'setupRecMotorSummary' : 'setupRecMotorSummaryPartial',
    summaryParams: v !== null ? { v: round1(v).toFixed(1), calMax: String(calMaxV) } : { calMax: String(calMaxV) },
    confidence: v !== null ? 'high' : 'medium',
  };
}

function recommendEncoder(ctx: SetupContext): StepRecommendations | null {
  if (ctx.encoderProfile === 'as5047') {
    const values: Record<string, string> = {
      'axis0.encoder.config.mode': '257',
      'axis0.encoder.config.cpr': '16384',
      'axis0.encoder.config.abs_spi_cs_gpio_pin': '7',
      'axis0.encoder.config.use_index': 'false',
      'axis0.encoder.config.bandwidth': '200',
    };
    return {
      step: 'encoder',
      items: [
        { path: 'axis0.encoder.config.mode', value: '257', reasonKey: 'setupRecReasonAs5047' },
        { path: 'axis0.encoder.config.cpr', value: '16384', reasonKey: 'setupRecReasonAs5047Cpr' },
      ],
      values,
      summaryKey: 'setupRecEncoderAs5047',
      confidence: ctx.hardware?.toLowerCase().includes('odrive-wheel') ? 'high' : 'medium',
    };
  }

  if (ctx.encoderProfile === 'incremental') {
    const cpr = ctx.fieldValues['axis0.encoder.config.cpr']?.trim() || '8192';
    const values: Record<string, string> = {
      'axis0.encoder.config.mode': '0',
      'axis0.encoder.config.cpr': cpr,
      'axis0.encoder.config.use_index': 'false',
      'axis0.encoder.config.bandwidth': '200',
    };
    return {
      step: 'encoder',
      items: [{ path: 'axis0.encoder.config.mode', value: '0', reasonKey: 'setupRecReasonIncremental' }],
      values,
      summaryKey: 'setupRecEncoderIncremental',
      summaryParams: { cpr },
      confidence: 'medium',
    };
  }

  return {
    step: 'encoder',
    items: [],
    values: {
      'axis0.encoder.config.mode': '257',
      'axis0.encoder.config.cpr': '16384',
      'axis0.encoder.config.abs_spi_cs_gpio_pin': '7',
      'axis0.encoder.config.use_index': 'false',
    },
    summaryKey: 'setupRecEncoderGuessMks',
    confidence: 'low',
  };
}

function recommendFfb(ctx: SetupContext): StepRecommendations | null {
  const kt = ctx.motorKt ?? parseNum(ctx.fieldValues['axis0.motor.config.torque_constant']) ?? 0.55;
  const currentLim = ctx.motorCurrentLim ?? parseNum(ctx.fieldValues['axis0.motor.config.current_lim']) ?? 20;
  const estimatedPeakNm = round1(Math.min(11, Math.max(2, kt * currentLim * 0.65)));
  const values: Record<string, string> = {
    'axis.range': '900',
    'axis.maxtorque': String(estimatedPeakNm),
    'axis.fxratio': '1',
  };

  return {
    step: 'ffb',
    items: [
      {
        path: 'axis.maxtorque',
        value: values['axis.maxtorque'],
        reasonKey: 'setupRecReasonMaxTorque',
        reasonParams: { kt: String(kt), lim: String(currentLim), nm: String(estimatedPeakNm) },
      },
    ],
    values,
    summaryKey: 'setupRecFfbSummary',
    summaryParams: { nm: String(estimatedPeakNm), range: '900' },
    confidence: ctx.motorKt !== null && ctx.motorCurrentLim !== null ? 'high' : 'medium',
  };
}

function recommendVbusCal(ctx: SetupContext): StepRecommendations | null {
  if (ctx.nominalVbusV === null) {
    return null;
  }
  return {
    step: 'vbusCal',
    items: [],
    values: {},
    summaryKey: 'setupRecVbusNextPower',
    summaryParams: { v: ctx.nominalVbusV.toFixed(1) },
    confidence: 'high',
  };
}

export function getRecommendationsForStep(step: SetupStepId, ctx: SetupContext): StepRecommendations | null {
  switch (step) {
    case 'vbusCal':
      return recommendVbusCal(ctx);
    case 'power':
      return recommendPower(ctx);
    case 'motor':
      return recommendMotor(ctx);
    case 'encoder':
      return recommendEncoder(ctx);
    case 'ffb':
      return recommendFfb(ctx);
    default:
      return null;
  }
}

export function mergeRecommendedIntoForm(
  current: Record<string, string>,
  recommended: Record<string, string>,
): Record<string, string> {
  return { ...current, ...recommended };
}

export function formMatchesRecommendations(
  current: Record<string, string>,
  recommended: Record<string, string>,
  paths: string[],
): boolean {
  for (const path of paths) {
    if (recommended[path] === undefined) {
      continue;
    }
    const a = (current[path] ?? '').trim();
    const b = recommended[path].trim();
    if (a !== b && parseFloat(a) !== parseFloat(b)) {
      return false;
    }
  }
  return true;
}
