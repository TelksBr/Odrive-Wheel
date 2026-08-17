import type { SetupStepId } from './setupSteps';

export function isSetupCalStepDone(opts: {
  sessionOk: boolean;
  sessionAttempted: boolean;
  boardFlag: boolean;
}): boolean {
  if (opts.sessionAttempted) {
    return opts.sessionOk;
  }
  return opts.boardFlag;
}

export function isSetupBootSaveDone(opts: {
  presetSynced: boolean;
  pendingSave: number;
  applied: boolean;
}): boolean {
  return opts.presetSynced && opts.pendingSave === 0 && opts.applied;
}

export function setupNextBlockedReason(
  step: SetupStepId,
  ctx: {
    pendingSave: number;
    saveNvm1Applied: boolean;
    motorCalDone: boolean;
    encoderCalDone: boolean;
    bootSaveDone: boolean;
  },
): string | null {
  switch (step) {
    case 'saveNvm1':
      if (ctx.pendingSave > 0 || !ctx.saveNvm1Applied) {
        return 'setupNextNeedSaveNvm1';
      }
      return null;
    case 'motorCal':
      if (!ctx.motorCalDone) {
        return 'setupNextNeedMotorCal';
      }
      return null;
    case 'encoderCal':
      if (!ctx.encoderCalDone) {
        return 'setupNextNeedEncoderCal';
      }
      return null;
    case 'bootSave':
      if (!ctx.bootSaveDone) {
        return 'setupNextNeedBootSave';
      }
      return null;
    default:
      return null;
  }
}
