import { describe, expect, test } from 'bun:test';
import { titlebarInsetsFromRect } from './titlebarInsets';

describe('titlebarInsetsFromRect', () => {
  test('returns empty insets when overlay is hidden', () => {
    expect(
      titlebarInsetsFromRect({ x: 0, y: 0, width: 1200, height: 32 }, { width: 1400, height: 800 }, false),
    ).toEqual({ top: 0, left: 0, right: 0, height: 0 });
  });

  test('reserves the Windows caption strip on the right', () => {
    expect(
      titlebarInsetsFromRect({ x: 0, y: 0, width: 1262, height: 32 }, { width: 1400, height: 900 }, true),
    ).toEqual({ top: 0, left: 0, right: 138, height: 32 });
  });

  test('reserves macOS traffic lights on the left', () => {
    expect(
      titlebarInsetsFromRect({ x: 78, y: 0, width: 1322, height: 28 }, { width: 1400, height: 900 }, true),
    ).toEqual({ top: 0, left: 78, right: 0, height: 28 });
  });
});
