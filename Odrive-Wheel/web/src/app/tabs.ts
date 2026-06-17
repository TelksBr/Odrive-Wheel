import type { TabId } from './types';

export interface TabDefinition {
  id: TabId;
  labelKey: string;
  descriptionKey: string;
  group: 'operate' | 'tune' | 'maintain';
}

export const tabs: TabDefinition[] = [
  { id: 'dashboard', labelKey: 'tabDashboard', descriptionKey: 'tabDashboardDescription', group: 'operate' },
  { id: 'setup', labelKey: 'tabSetup', descriptionKey: 'tabSetupDescription', group: 'operate' },
  { id: 'motor', labelKey: 'tabMotor', descriptionKey: 'tabMotorDescription', group: 'operate' },
  { id: 'tune', labelKey: 'tabTune', descriptionKey: 'tabTuneDescription', group: 'tune' },
  { id: 'ffb-test', labelKey: 'tabFfbTest', descriptionKey: 'tabFfbTestDescription', group: 'tune' },
  { id: 'inputs', labelKey: 'tabInputs', descriptionKey: 'tabInputsDescription', group: 'tune' },
  { id: 'observe', labelKey: 'tabObserve', descriptionKey: 'tabObserveDescription', group: 'tune' },
  { id: 'maintain', labelKey: 'tabMaintain', descriptionKey: 'tabMaintainDescription', group: 'maintain' },
  { id: 'commands', labelKey: 'tabCommands', descriptionKey: 'tabCommandsDescription', group: 'maintain' },
  { id: 'console', labelKey: 'tabConsole', descriptionKey: 'tabConsoleDescription', group: 'maintain' },
];
