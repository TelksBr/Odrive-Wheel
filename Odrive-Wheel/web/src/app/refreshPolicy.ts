import type { TabId } from './types';
import { flatFields, type ConfigField } from '../features/config/fieldCatalog';

const workspaceGroups: Partial<Record<TabId, string[]>> = {
  dashboard: ['system', 'psu', 'axis'],
  setup: ['psu', 'axis', 'motor', 'encoder', 'controller', 'ffb-wheel'],
  motor: ['psu', 'axis', 'motor', 'encoder', 'controller'],
  tune: ['ffb-wheel', 'ffb-effects', 'ffb-filters', 'system'],
  'ffb-test': ['system', 'ffb-wheel'],
  inputs: ['inputs'],
  observe: ['system'],
  maintain: ['system'],
};

const highSignalPaths = new Set([
  'vbus_voltage',
  'axis0.current_state',
  'axis0.motor.is_calibrated',
  'axis0.encoder.is_ready',
  'axis0.controller.input_torque',
  'sys.swver',
  'sys.hwtype',
  'sys.heap',
  'sys.vbusdiv',
  'axis.curpos',
  'axis.curspd',
  'axis.curtorque',
  'odrv.vbus',
  'odrv.maxtorque',
  'gpio.1.cur',
  'gpio.2.cur',
  'gpio.3.cur',
  'gpio.4.cur',
]);

export function refreshFieldsForTab(tab: TabId, dirtyPaths: string[]): ConfigField[] {
  return fieldsForTab(tab, dirtyPaths)
    .filter((field) => field.readonly || highSignalPaths.has(field.path))
    .slice(0, 16);
}

export function initialFieldsForTab(tab: TabId, dirtyPaths: string[]): ConfigField[] {
  return fieldsForTab(tab, dirtyPaths);
}

function fieldsForTab(tab: TabId, dirtyPaths: string[]): ConfigField[] {
  const dirty = new Set(dirtyPaths);
  const groups = workspaceGroups[tab];
  if (!groups) {
    return [];
  }

  return flatFields
    .filter((field) => groups.includes(field.groupId))
    .filter((field) => !dirty.has(field.path));
}
