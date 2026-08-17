import { describe, expect, test } from 'bun:test';
import { mergeFieldConfig } from './inputConfigCache';

describe('mergeFieldConfig', () => {
  test('keeps GPIO 1–4 modes when the cache predates GPIO 6', () => {
    const merged = mergeFieldConfig(
      {
        maxTorqueNm: 5,
        gpios: {
          1: { mode: '2', idx: 0, min: 10, max: 4000 },
          2: { mode: '2', idx: 1, min: 0, max: 4095 },
          3: { mode: '2', idx: 2, min: 0, max: 4095 },
          4: { mode: '1', idx: 0, min: 0, max: 4095 },
        },
      },
      {},
    );

    expect(merged.gpios[1]?.mode).toBe('2');
    expect(merged.gpios[2]?.mode).toBe('2');
    expect(merged.gpios[3]?.mode).toBe('2');
    expect(merged.gpios[4]?.mode).toBe('1');
    expect(merged.gpios[6]?.mode).toBe('0');
  });

  test('overlays store values onto missing GPIO instances', () => {
    const merged = mergeFieldConfig(
      { maxTorqueNm: null, gpios: {} },
      {
        'gpio.1.mode': '2',
        'gpio.2.mode': '2',
        'gpio.3.mode': '2',
        'gpio.4.mode': '1',
      },
    );

    expect(merged.gpios[1]?.mode).toBe('2');
    expect(merged.gpios[4]?.mode).toBe('1');
    expect(merged.gpios[6]?.mode).toBe('0');
  });
});
