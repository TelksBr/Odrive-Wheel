import type { TabId } from './types';
import { flatFields, type ConfigField } from '../features/config/fieldCatalog';

const workspaceGroups: Partial<Record<TabId, string[]>> = {
  dashboard: ['system', 'live', 'psu', 'axis', 'inputs'],
  setup: ['psu', 'axis', 'motor', 'encoder', 'controller', 'ffb-wheel'],
  calibration: ['psu', 'axis', 'motor', 'encoder', 'controller', 'live'],
  motor: ['psu', 'axis', 'motor', 'encoder', 'controller', 'fet-thermistor', 'motor-thermistor'],
  tune: ['ffb-wheel', 'ffb-effects', 'ffb-filters', 'system'],
  'ffb-test': ['system', 'live', 'ffb-wheel'],
  inputs: ['inputs'],
  observe: ['system', 'live'],
  maintain: ['system'],
};

const highSignalPaths = new Set([
  'vbus_voltage',
  'axis0.current_state',
  'axis0.error',
  'axis0.motor.error',
  'axis0.encoder.error',
  'axis0.motor.is_calibrated',
  'axis0.encoder.is_ready',
  'axis0.encoder.config.mode',
  'axis0.encoder.config.cpr',
  'axis0.encoder.config.direction',
  'axis0.encoder.config.use_index',
  'axis0.encoder.config.use_index_offset',
  'axis0.encoder.config.index_offset',
  'axis0.encoder.config.abs_spi_cs_gpio_pin',
  'axis0.encoder.config.pre_calibrated',
  'axis0.encoder.config.phase_offset',
  'axis0.encoder.config.phase_offset_float',
  'axis0.motor.config.pre_calibrated',
  'axis0.motor.config.phase_resistance',
  'axis0.motor.config.phase_inductance',
  'axis0.config.startup_motor_calibration',
  'axis0.config.startup_encoder_offset_calibration',
  'axis0.config.startup_encoder_index_search',
  'axis0.config.startup_closed_loop_control',
  'axis0.controller.config.enable_vel_limit',
  'axis0.controller.config.enable_overspeed_error',
  'axis0.controller.config.enable_torque_mode_vel_limit',
  'axis0.controller.input_torque',
  'sys.swver',
  'sys.hwtype',
  'sys.heap',
  'sys.vbusdiv',
  'axis.curpos',
  'axis.curspd',
  'axis.curtorque',
  'axis.maxtorque',
  'axis.range',
  'odrv.vbus',
  'odrv.maxtorque',
  'gpio.1.mode',
  'gpio.1.amin',
  'gpio.1.amax',
  'gpio.2.mode',
  'gpio.2.amin',
  'gpio.2.amax',
  'gpio.3.mode',
  'gpio.3.amin',
  'gpio.3.amax',
  'gpio.4.mode',
  'gpio.4.amin',
  'gpio.4.amax',
  'gpio.1.cur',
  'gpio.2.cur',
  'gpio.3.cur',
  'gpio.4.cur',
]);

/** Paths re-read after save/reboot — avoids scanning the full catalog. */
export const HIGH_SIGNAL_PATHS: readonly string[] = [...highSignalPaths];

export function refreshFieldsForTab(tab: TabId, skipPaths: string[]): ConfigField[] {
  const fields = fieldsForTab(tab, skipPaths).filter(
    (field) => field.readonly || highSignalPaths.has(field.path),
  );
  const limit = tab === 'calibration' ? 32 : 16;
  return fields.slice(0, limit);
}

export function initialFieldsForTab(tab: TabId, skipPaths: string[]): ConfigField[] {
  return fieldsForTab(tab, skipPaths);
}

export function tabsForGroup(groupId: string): TabId[] {
  const tabs: TabId[] = [];
  for (const [tabId, groups] of Object.entries(workspaceGroups) as Array<[TabId, string[] | undefined]>) {
    if (groups?.includes(groupId)) {
      tabs.push(tabId);
    }
  }
  return tabs;
}

/** Tabs where config fields are edited — excludes calibration (actions only) and setup (wizard). */
const FIELD_EDIT_TAB_PRIORITY: TabId[] = [
  'tune',
  'motor',
  'inputs',
  'observe',
  'dashboard',
  'ffb-test',
  'maintain',
  'commands',
  'console',
  'about',
];

export function preferredTabForField(field: ConfigField): TabId {
  const groupId = field.groupId ?? 'system';
  if (field.readonly && groupId === 'live') {
    return 'observe';
  }
  const candidates = tabsForGroup(groupId);
  for (const tab of FIELD_EDIT_TAB_PRIORITY) {
    if (candidates.includes(tab)) {
      return tab;
    }
  }
  return field.protocol === 'openffboard' ? 'tune' : 'motor';
}

function fieldsForTab(tab: TabId, skipPaths: string[]): ConfigField[] {
  const skip = new Set(skipPaths);
  const groups = workspaceGroups[tab];
  if (!groups) {
    return [];
  }

  return flatFields
    .filter((field) => groups.includes(field.groupId))
    .filter((field) => !skip.has(field.path));
}
