import type { TabId } from './types';
import { flatFields, type ConfigField } from '../features/config/fieldCatalog';

const workspaceGroups: Partial<Record<TabId, string[]>> = {
  dashboard: ['system', 'live', 'psu', 'axis', 'inputs'],
  setup: ['psu', 'axis', 'motor', 'encoder', 'controller', 'ffb-wheel'],
  motor: ['psu', 'axis', 'motor', 'encoder', 'controller'],
  tune: ['ffb-wheel', 'ffb-effects', 'ffb-filters', 'system'],
  'ffb-test': ['system', 'live', 'ffb-wheel'],
  inputs: ['inputs'],
  observe: ['system', 'live'],
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

export function refreshFieldsForTab(tab: TabId, dirtyPaths: string[]): ConfigField[] {
  return fieldsForTab(tab, dirtyPaths)
    .filter((field) => field.readonly || highSignalPaths.has(field.path))
    .slice(0, 16);
}

export function initialFieldsForTab(tab: TabId, dirtyPaths: string[]): ConfigField[] {
  return fieldsForTab(tab, dirtyPaths);
}

const TAB_PRIORITY: TabId[] = [
  'tune',
  'motor',
  'setup',
  'inputs',
  'observe',
  'dashboard',
  'ffb-test',
  'maintain',
  'commands',
  'console',
  'about',
];

export function tabsForGroup(groupId: string): TabId[] {
  const tabs: TabId[] = [];
  for (const [tabId, groups] of Object.entries(workspaceGroups) as Array<[TabId, string[] | undefined]>) {
    if (groups?.includes(groupId)) {
      tabs.push(tabId);
    }
  }
  return tabs;
}

export function preferredTabForField(field: ConfigField): TabId {
  const groupId = field.groupId ?? 'system';
  if (field.readonly && groupId === 'live') {
    return 'observe';
  }
  const candidates = tabsForGroup(groupId);
  for (const tab of TAB_PRIORITY) {
    if (candidates.includes(tab)) {
      return tab;
    }
  }
  return field.protocol === 'openffboard' ? 'tune' : 'motor';
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
