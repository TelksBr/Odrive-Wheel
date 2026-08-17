import { describe, expect, test } from 'bun:test';
import {
  APP_BASE_ADDRESS,
  chunkOverlapsProtected,
  inProtected,
  sectorsForImage,
  TRANSFER_SIZE,
} from './dfuFlashPlan';

describe('dfuFlashPlan', () => {
  test('protects FFB EEPROM sectors S1 and S2', () => {
    expect(inProtected(0x08004000)).toBe(true);
    expect(inProtected(0x08008000)).toBe(true);
    expect(inProtected(0x0800bfff)).toBe(true);
    expect(inProtected(0x08000000)).toBe(false);
    expect(inProtected(0x0800c000)).toBe(false);
  });

  test('skips chunks that intersect protected ranges, not only fully contained ones', () => {
    const straddleStart = 0x0800c000 - 512;
    expect(chunkOverlapsProtected(straddleStart, straddleStart + TRANSFER_SIZE)).toBe(true);
    expect(chunkOverlapsProtected(0x08004000, 0x08004800)).toBe(true);
    expect(chunkOverlapsProtected(APP_BASE_ADDRESS, APP_BASE_ADDRESS + TRANSFER_SIZE)).toBe(false);
    expect(chunkOverlapsProtected(0x0800c000, 0x0800c000 + TRANSFER_SIZE)).toBe(false);
  });

  test('selects sectors overlapping the image', () => {
    const sectors = sectorsForImage(48 * 1024);
    expect(sectors.map((s) => s.start)).toEqual([
      0x08000000,
      0x08004000,
      0x08008000,
    ]);
  });
});
