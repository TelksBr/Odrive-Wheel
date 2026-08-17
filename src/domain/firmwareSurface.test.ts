import { describe, expect, test } from 'bun:test';
import {
  catalogPathToFirmwareKey,
  FIRMWARE_GPIO_INSTANCES,
  parseCmdTableSource,
} from './firmwareSurface';

describe('firmwareSurface', () => {
  test('maps catalog paths to class.cmd', () => {
    expect(catalogPathToFirmwareKey('axis.maxtorque')).toBe('axis.maxtorque');
    expect(catalogPathToFirmwareKey('gpio.6.mode')).toBe('gpio.mode');
    expect(catalogPathToFirmwareKey('fx.filterCfQ')).toBe('fx.filterCfQ');
    expect(catalogPathToFirmwareKey('sys.vbusdiv')).toBe('sys.vbusdiv');
  });

  test('exposes GPIO 1–4 and 6', () => {
    expect([...FIRMWARE_GPIO_INSTANCES]).toEqual([1, 2, 3, 4, 6]);
  });

  test('parses cmd_table rows', () => {
    const parsed = parseCmdTableSource(`
      { "axis",  "maxtorque",     h_axis_maxtorque },
      { "gpio",  "mode",         h_gpio_mode },
    `);
    expect(parsed).toEqual([
      { cls: 'axis', cmd: 'maxtorque' },
      { cls: 'gpio', cmd: 'mode' },
    ]);
  });
});
