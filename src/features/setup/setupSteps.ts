export type SetupStepId =
  | 'flash'
  | 'connect'
  | 'erase'
  | 'vbusCal'
  | 'power'
  | 'motor'
  | 'encoder'
  | 'saveNvm1'
  | 'motorCal'
  | 'encoderCal'
  | 'bootSave'
  | 'ffb'
  | 'hidTest'
  | 'finish';

export interface SetupStepDef {
  id: SetupStepId;
  /** User may skip without blocking later steps. */
  optional: boolean;
  titleKey: string;
  descKey: string;
}

/** Ordered setup pipeline — optional steps can be skipped. */
export const SETUP_STEPS: SetupStepDef[] = [
  { id: 'flash', optional: true, titleKey: 'setupStep1Title', descKey: 'setupStep1Desc' },
  { id: 'connect', optional: false, titleKey: 'setupStep2Title', descKey: 'setupStep2Desc' },
  { id: 'erase', optional: true, titleKey: 'setupStep3Title', descKey: 'setupStep3Desc' },
  { id: 'vbusCal', optional: true, titleKey: 'setupStepVbusTitle', descKey: 'setupStepVbusDesc' },
  { id: 'power', optional: true, titleKey: 'setupStep4Title', descKey: 'setupStep4Desc' },
  { id: 'motor', optional: true, titleKey: 'setupStep5Title', descKey: 'setupStep5Desc' },
  { id: 'encoder', optional: false, titleKey: 'setupStep6Title', descKey: 'setupStep6Desc' },
  { id: 'saveNvm1', optional: false, titleKey: 'setupSaveNvm1Title', descKey: 'setupSaveNvm1Desc' },
  { id: 'motorCal', optional: false, titleKey: 'setupStep7Title', descKey: 'setupStep7Desc' },
  { id: 'encoderCal', optional: false, titleKey: 'setupStep8Title', descKey: 'setupStep8Desc' },
  { id: 'bootSave', optional: false, titleKey: 'setupStep9Title', descKey: 'setupStep9DescFixed' },
  { id: 'ffb', optional: true, titleKey: 'setupStep10Title', descKey: 'setupStep10Desc' },
  { id: 'hidTest', optional: true, titleKey: 'setupStep11Title', descKey: 'setupStep11Desc' },
  { id: 'finish', optional: true, titleKey: 'setupStep12Title', descKey: 'setupStep12Desc' },
];

export function setupStepIndex(id: SetupStepId): number {
  return SETUP_STEPS.findIndex((step) => step.id === id);
}
