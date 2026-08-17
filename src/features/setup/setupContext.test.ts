import { describe, expect, test } from 'bun:test';
import { getRecommendationsForStep, suggestedVbusdiv, type SetupContext } from './setupContext';

function ctx(partial: Partial<SetupContext>): SetupContext {
  return {
    probeVbusV: null,
    liveVbusV: null,
    multimeterVbusV: null,
    nominalVbusV: 24,
    vbusdiv: '19',
    firmware: null,
    hardware: null,
    encoderProfile: 'as5047',
    motorCalibrated: false,
    encoderReady: false,
    phaseResistance: null,
    phaseInductance: null,
    motorKt: null,
    motorCurrentLim: null,
    fieldValues: {},
    ...partial,
  };
}

describe('suggestedVbusdiv', () => {
  test('returns null when live already matches the multimeter', () => {
    expect(suggestedVbusdiv({ liveV: 24.05, expectedV: 24, currentDiv: 19 })).toBeNull();
  });

  test('scales the divider toward the measured voltage', () => {
    expect(suggestedVbusdiv({ liveV: 12, expectedV: 24, currentDiv: 19 })).toBe(38);
    expect(suggestedVbusdiv({ liveV: 48, expectedV: 24, currentDiv: 19 })).toBe(10);
  });

  test('clamps to 1–50', () => {
    expect(suggestedVbusdiv({ liveV: 1, expectedV: 48, currentDiv: 19 })).toBe(50);
  });
});

describe('recommendVbusCal', () => {
  test('suggests sys.vbusdiv when live and multimeter disagree', () => {
    const rec = getRecommendationsForStep(
      'vbusCal',
      ctx({ liveVbusV: 12, multimeterVbusV: 24, vbusdiv: '19', nominalVbusV: 24 }),
    );
    expect(rec?.values['sys.vbusdiv']).toBe('38');
    expect(rec?.items).toHaveLength(1);
  });

  test('does not offer a no-op apply when VBUS already matches', () => {
    const rec = getRecommendationsForStep(
      'vbusCal',
      ctx({ liveVbusV: 24, multimeterVbusV: 24, vbusdiv: '19', nominalVbusV: 24 }),
    );
    expect(rec?.values).toEqual({});
    expect(rec?.summaryKey).toBe('setupRecVbusNextPower');
  });
});
