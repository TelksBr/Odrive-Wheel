import type { CalibrationAxisAction, SetupErrorField } from './calibrationActions';
import { encoderCalErrorFields, motorCalErrorFields } from './calibrationActions';

export interface CalibrationWorkflow {
  id: string;
  titleKey: string;
  descKey: string;
  prereqKey?: string;
  action: CalibrationAxisAction;
  errorFields: SetupErrorField[];
  showMotorResults?: boolean;
  showEncoderResults?: boolean;
  /** Operational state — no NVM preset (closed loop, dir find). */
  operationalOnly?: boolean;
}

export const motorCalWorkflow: CalibrationWorkflow = {
  id: 'motor',
  titleKey: 'calFlowMotorTitle',
  descKey: 'calFlowMotorDesc',
  prereqKey: 'calFlowMotorPrereq',
  action: {
    id: 'motor-cal',
    labelKey: 'calActionMotorCal',
    subKey: 'calActionMotorCalSub',
    state: 4,
    timeoutMs: 30000,
    tone: 'warn',
  },
  errorFields: motorCalErrorFields,
  showMotorResults: true,
};

export const encoderCalWorkflow: CalibrationWorkflow = {
  id: 'encoder',
  titleKey: 'calFlowEncoderTitle',
  descKey: 'calFlowEncoderDesc',
  prereqKey: 'calFlowEncoderPrereq',
  action: {
    id: 'encoder-cal',
    labelKey: 'calActionEncoderCal',
    subKey: 'calActionEncoderCalSub',
    state: 7,
    timeoutMs: 60000,
    tone: 'warn',
  },
  errorFields: encoderCalErrorFields,
  showEncoderResults: true,
};

export const indexSearchWorkflow: CalibrationWorkflow = {
  id: 'index',
  titleKey: 'calFlowIndexTitle',
  descKey: 'calFlowIndexDesc',
  prereqKey: 'calFlowIndexPrereq',
  action: {
    id: 'index-search',
    labelKey: 'calActionIndexSearch',
    subKey: 'calActionIndexSearchSub',
    state: 6,
    timeoutMs: 60000,
    tone: 'warn',
  },
  errorFields: encoderCalErrorFields,
  operationalOnly: true,
};

export const encoderDirWorkflow: CalibrationWorkflow = {
  id: 'encoder-dir',
  titleKey: 'calFlowDirTitle',
  descKey: 'calFlowDirDesc',
  action: {
    id: 'encoder-dir',
    labelKey: 'calActionEncoderDir',
    subKey: 'calActionEncoderDirSub',
    state: 10,
    timeoutMs: 30000,
    tone: 'warn',
  },
  errorFields: encoderCalErrorFields,
  operationalOnly: true,
};

export const closedLoopWorkflow: CalibrationWorkflow = {
  id: 'closed-loop',
  titleKey: 'calFlowClosedLoopTitle',
  descKey: 'calFlowClosedLoopDesc',
  prereqKey: 'calFlowClosedLoopPrereq',
  action: {
    id: 'closed-loop',
    labelKey: 'calActionClosedLoop',
    subKey: 'calActionClosedLoopSub',
    state: 8,
    timeoutMs: 10000,
    tone: 'ok',
    clearFirst: false,
    successState: 8,
  },
  errorFields: motorCalErrorFields,
  operationalOnly: true,
};

export const calibrationRunWorkflows: CalibrationWorkflow[] = [
  motorCalWorkflow,
  encoderCalWorkflow,
];

export const optionalCalibrationWorkflows: CalibrationWorkflow[] = [
  indexSearchWorkflow,
  encoderDirWorkflow,
];
