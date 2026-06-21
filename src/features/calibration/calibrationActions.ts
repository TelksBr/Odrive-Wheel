export interface CalibrationAxisAction {
  id: string;
  labelKey: string;
  subKey: string;
  state: number;
  timeoutMs: number;
  tone?: 'warn' | 'ok' | 'danger';
  clearFirst?: boolean;
}

export const calibrationAxisActions: CalibrationAxisAction[] = [
  {
    id: 'idle',
    labelKey: 'calActionIdle',
    subKey: 'calActionIdleSub',
    state: 1,
    timeoutMs: 5000,
    tone: 'warn',
    clearFirst: false,
  },
  {
    id: 'motor-cal',
    labelKey: 'calActionMotorCal',
    subKey: 'calActionMotorCalSub',
    state: 4,
    timeoutMs: 30000,
    tone: 'warn',
  },
  {
    id: 'encoder-cal',
    labelKey: 'calActionEncoderCal',
    subKey: 'calActionEncoderCalSub',
    state: 7,
    timeoutMs: 60000,
    tone: 'warn',
  },
  {
    id: 'closed-loop',
    labelKey: 'calActionClosedLoop',
    subKey: 'calActionClosedLoopSub',
    state: 8,
    timeoutMs: 10000,
    tone: 'ok',
    clearFirst: false,
  },
  {
    id: 'index-search',
    labelKey: 'calActionIndexSearch',
    subKey: 'calActionIndexSearchSub',
    state: 6,
    timeoutMs: 60000,
    tone: 'warn',
  },
  {
    id: 'encoder-dir',
    labelKey: 'calActionEncoderDir',
    subKey: 'calActionEncoderDirSub',
    state: 10,
    timeoutMs: 30000,
    tone: 'warn',
  },
  {
    id: 'full-cal',
    labelKey: 'calActionFullCal',
    subKey: 'calActionFullCalSub',
    state: 3,
    timeoutMs: 90000,
    tone: 'danger',
  },
  {
    id: 'lockin',
    labelKey: 'calActionLockin',
    subKey: 'calActionLockinSub',
    state: 9,
    timeoutMs: 30000,
  },
  {
    id: 'homing',
    labelKey: 'calActionHoming',
    subKey: 'calActionHomingSub',
    state: 11,
    timeoutMs: 30000,
    tone: 'warn',
  },
];

export interface SetupErrorField {
  id: string;
  label: string;
  command: string;
  map: 'AXIS' | 'MOTOR' | 'ENCODER';
}

export const motorCalErrorFields: SetupErrorField[] = [
  { id: 'axis', label: 'axis0.error', command: 'r axis0.error', map: 'AXIS' },
  { id: 'motor', label: 'axis0.motor.error', command: 'r axis0.motor.error', map: 'MOTOR' },
];

export const encoderCalErrorFields: SetupErrorField[] = [
  { id: 'axis', label: 'axis0.error', command: 'r axis0.error', map: 'AXIS' },
  { id: 'enc', label: 'axis0.encoder.error', command: 'r axis0.encoder.error', map: 'ENCODER' },
];
