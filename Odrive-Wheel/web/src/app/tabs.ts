import type { TabId } from './types';
import type { AppIconId } from '../shared/ui/AppIcon';

export interface TabDefinition {
  id: TabId;
  labelKey: string;
  descriptionKey: string;
  group: 'operate' | 'tune' | 'maintain';
  iconId: AppIconId;
}

export const tabs: TabDefinition[] = [
  { id: 'dashboard', labelKey: 'tabDashboard', descriptionKey: 'tabDashboardDescription', group: 'operate', iconId: 'tab-dashboard' },
  { id: 'setup', labelKey: 'tabSetup', descriptionKey: 'tabSetupDescription', group: 'operate', iconId: 'tab-setup' },
  { id: 'motor', labelKey: 'tabMotor', descriptionKey: 'tabMotorDescription', group: 'operate', iconId: 'tab-motor' },
  { id: 'tune', labelKey: 'tabTune', descriptionKey: 'tabTuneDescription', group: 'tune', iconId: 'tab-tune' },
  { id: 'ffb-test', labelKey: 'tabFfbTest', descriptionKey: 'tabFfbTestDescription', group: 'tune', iconId: 'tab-ffb-test' },
  { id: 'perf-test', labelKey: 'tabPerfTest', descriptionKey: 'tabPerfTestDescription', group: 'tune', iconId: 'tab-perf-test' },
  { id: 'inputs', labelKey: 'tabInputs', descriptionKey: 'tabInputsDescription', group: 'tune', iconId: 'tab-inputs' },
  { id: 'observe', labelKey: 'tabObserve', descriptionKey: 'tabObserveDescription', group: 'tune', iconId: 'tab-observe' },
  { id: 'maintain', labelKey: 'tabMaintain', descriptionKey: 'tabMaintainDescription', group: 'maintain', iconId: 'tab-maintain' },
  { id: 'commands', labelKey: 'tabCommands', descriptionKey: 'tabCommandsDescription', group: 'maintain', iconId: 'tab-commands' },
  { id: 'console', labelKey: 'tabConsole', descriptionKey: 'tabConsoleDescription', group: 'maintain', iconId: 'tab-console' },
  { id: 'about', labelKey: 'tabAbout', descriptionKey: 'tabAboutDescription', group: 'maintain', iconId: 'tab-about' },
];
