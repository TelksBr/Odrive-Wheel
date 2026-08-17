import { describe, expect, test } from 'bun:test';
import { isControlPortReply, unwrapControlReply } from './serialPortProbe';

describe('isControlPortReply', () => {
  test('accepts firmware version and hardware strings', () => {
    expect(isControlPortReply('1.0.0-rc12')).toBe(true);
    expect(isControlPortReply('ODrive-Wheel')).toBe(true);
    expect(isControlPortReply('OpenFFBoard')).toBe(true);
  });

  test('accepts OpenFFBoard bracket replies from sys.swver?', () => {
    expect(isControlPortReply('[sys.swver?|1.17.0]')).toBe(true);
    expect(isControlPortReply('[sys.hwtype?|ODrive-Wheel]')).toBe(true);
    expect(unwrapControlReply('[sys.swver?|1.17.0]')).toBe('1.17.0');
  });

  test('rejects empty, errors, and binary garbage', () => {
    expect(isControlPortReply('')).toBe(false);
    expect(isControlPortReply('error')).toBe(false);
    expect(isControlPortReply('[sys.swver?|error]')).toBe(false);
    expect(isControlPortReply('invalid property')).toBe(false);
    expect(isControlPortReply('\u0000\u0001')).toBe(false);
  });
});
