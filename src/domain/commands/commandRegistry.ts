export type CommandCategory = 'safety' | 'calibration' | 'ffb' | 'system' | 'diagnostics';

export interface BoardCommand {
  id: string;
  label: string;
  command: string;
  category: CommandCategory;
  description: string;
  expectReply?: boolean;
  timeoutMs?: number;
  danger?: boolean;
}

export const boardCommands: BoardCommand[] = [
  {
    id: 'clear-errors',
    label: 'Clear errors',
    command: 'sc',
    category: 'safety',
    description: 'Clear ODrive latched errors before setup, calibration, or closed loop.',
  },
  {
    id: 'idle',
    label: 'Idle',
    command: 'w axis0.requested_state 1',
    category: 'safety',
    description: 'Disarm axis0 immediately.',
    danger: true,
  },
  {
    id: 'closed-loop',
    label: 'Closed loop',
    command: 'w axis0.requested_state 8',
    category: 'safety',
    description: 'Arm axis0 in CLOSED_LOOP_CONTROL.',
  },
  {
    id: 'motor-calibration',
    label: 'Motor calibration',
    command: 'w axis0.requested_state 4',
    category: 'calibration',
    description: 'Measure motor phase resistance and inductance.',
    timeoutMs: 30000,
  },
  {
    id: 'encoder-offset-calibration',
    label: 'Encoder offset calibration',
    command: 'w axis0.requested_state 7',
    category: 'calibration',
    description: 'Align encoder phase offset. Center the wheel mechanically first.',
    timeoutMs: 60000,
  },
  {
    id: 'full-calibration',
    label: 'Full calibration sequence',
    command: 'w axis0.requested_state 3',
    category: 'calibration',
    description: 'Motor + encoder calibration in one sequence. Wheel must be disconnected.',
    timeoutMs: 90000,
    danger: true,
  },
  {
    id: 'encoder-index-search',
    label: 'Encoder index search',
    command: 'w axis0.requested_state 6',
    category: 'calibration',
    description: 'Search for encoder Z index pulse.',
    timeoutMs: 60000,
  },
  {
    id: 'encoder-dir-find',
    label: 'Encoder direction find',
    command: 'w axis0.requested_state 10',
    category: 'calibration',
    description: 'Detect encoder count direction automatically.',
    timeoutMs: 30000,
  },
  {
    id: 'lockin-spin',
    label: 'Lockin spin',
    command: 'w axis0.requested_state 9',
    category: 'calibration',
    description: 'Open-loop lockin spin for sensorless or encoder alignment.',
    timeoutMs: 30000,
  },
  {
    id: 'homing',
    label: 'Homing',
    command: 'w axis0.requested_state 11',
    category: 'calibration',
    description: 'Axis homing sequence (requires endstop configuration).',
    timeoutMs: 30000,
  },
  {
    id: 'zero-wheel',
    label: 'Zero wheel',
    command: 'axis.zeroenc!',
    category: 'ffb',
    description: 'Capture current position as the logical FFB center.',
  },
  {
    id: 'anticogging-calibration',
    label: 'Anticogging calibration',
    command: 'axis.anticogcal!',
    category: 'ffb',
    description: 'Trigger the local ODrive anticogging calibration bridge.',
    timeoutMs: 3000,
  },
  {
    id: 'save-ffb',
    label: 'Save FFB EEPROM',
    command: 'sys.save!',
    category: 'system',
    description: 'Persist FFB, axis, filters, GPIO and tool settings.',
    timeoutMs: 5000,
  },
  {
    id: 'save-odrive',
    label: 'Save ODrive NVM',
    command: 'ss',
    category: 'system',
    description: 'Persist ODrive config to sectors 10 and 11.',
    timeoutMs: 8000,
  },
  {
    id: 'reboot',
    label: 'Reboot firmware',
    command: 'sr',
    category: 'system',
    description: 'Soft reset the board into the application firmware.',
    expectReply: false,
  },
  {
    id: 'reboot-dfu',
    label: 'Reboot to DFU',
    command: 'sd',
    category: 'system',
    description: 'Jump to the STM32 ROM bootloader for browser DFU flashing.',
    expectReply: false,
  },
  {
    id: 'ffb-diag',
    label: 'FFB diagnostic summary',
    command: 'd',
    category: 'diagnostics',
    description: 'Read compact FFB counters from the patched ASCII protocol.',
  },
  {
    id: 'ffb-diag-detail',
    label: 'FFB diagnostic detail',
    command: 'D',
    category: 'diagnostics',
    description: 'Read detailed FFB diagnostic state.',
  },
  {
    id: 'torque-diag',
    label: 'Torque diagnostic',
    command: 'T',
    category: 'diagnostics',
    description: 'Read current FFB torque and related counters.',
  },
  {
    id: 'eeprom-dump',
    label: 'FFB EEPROM dump',
    command: 'sys.eedump?',
    category: 'diagnostics',
    description: 'Inspect emulated EEPROM page state and last read/write result.',
  },
  {
    id: 'save-stat',
    label: 'Last save status',
    command: 'sys.savestat?',
    category: 'diagnostics',
    description: 'Read write/error counters from the last sys.save! attempt.',
  },
  {
    id: 'enc-raw',
    label: 'AS5047 SPI counters',
    command: 'sys.encraw!',
    category: 'diagnostics',
    description: 'Snapshot SPI encoder counters and last raw position (AS5047).',
  },
  {
    id: 'magnet-diag',
    label: 'AS5047 magnet status',
    command: 'sys.magnet!',
    category: 'diagnostics',
    description: 'Read DIAAGC register — AGC, field strength flags, magnet health.',
  },
];

export function commandsByCategory(category: CommandCategory): BoardCommand[] {
  return boardCommands.filter((command) => command.category === category);
}
