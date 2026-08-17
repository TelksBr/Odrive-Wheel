import { describe, expect, test } from 'bun:test';
import { parseTorqueReply } from './parseTorque';
import { parseMode } from './parseGpioMode';

describe('parseTorqueReply', () => {
  test('prefers nm= when it is a real newton-metre reading', () => {
    expect(parseTorqueReply('lt=16383 nm=4.00', 8)).toBeCloseTo(4, 5);
  });

  test('scales HID lt= when nm is missing', () => {
    expect(parseTorqueReply('lt=32767', 8)).toBeCloseTo(8, 5);
  });

  test('scales out-of-range nm as HID units', () => {
    expect(parseTorqueReply('nm=16383.5', 8)).toBeCloseTo((16383.5 / 32767) * 8, 5);
  });

  test('returns null for empty input', () => {
    expect(parseTorqueReply(undefined)).toBeNull();
    expect(parseTorqueReply('')).toBeNull();
  });
});

describe('parseMode', () => {
  test('keeps GPIO modes 0-3', () => {
    expect(parseMode('0')).toBe('0');
    expect(parseMode('1')).toBe('1');
    expect(parseMode('2')).toBe('2');
    expect(parseMode('3')).toBe('3');
    expect(parseMode('[gpio|1]')).toBe('1');
  });

  test('does not treat true as button mode', () => {
    expect(parseMode('true')).toBe('0');
    expect(parseMode('false')).toBe('0');
  });
});
