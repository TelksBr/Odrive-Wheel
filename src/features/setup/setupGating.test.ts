import { describe, expect, test } from 'bun:test';
import { isSetupBootSaveDone, isSetupCalStepDone, setupNextBlockedReason } from './setupGating';

describe('isSetupCalStepDone', () => {
  test('uses board flag when the wizard has not run cal this session', () => {
    expect(isSetupCalStepDone({ sessionOk: false, sessionAttempted: false, boardFlag: true })).toBe(true);
    expect(isSetupCalStepDone({ sessionOk: false, sessionAttempted: false, boardFlag: false })).toBe(false);
  });

  test('ignores a stale board flag after a failed session attempt', () => {
    expect(isSetupCalStepDone({ sessionOk: false, sessionAttempted: true, boardFlag: true })).toBe(false);
    expect(isSetupCalStepDone({ sessionOk: true, sessionAttempted: true, boardFlag: false })).toBe(true);
  });
});

describe('isSetupBootSaveDone', () => {
  test('requires synced preset, no pending save, and applied flag', () => {
    expect(isSetupBootSaveDone({ presetSynced: true, pendingSave: 0, applied: true })).toBe(true);
    expect(isSetupBootSaveDone({ presetSynced: true, pendingSave: 2, applied: true })).toBe(false);
    expect(isSetupBootSaveDone({ presetSynced: false, pendingSave: 0, applied: true })).toBe(false);
    expect(isSetupBootSaveDone({ presetSynced: true, pendingSave: 0, applied: false })).toBe(false);
  });
});

describe('setupNextBlockedReason', () => {
  const ready = {
    pendingSave: 0,
    saveNvm1Applied: true,
    motorCalDone: true,
    encoderCalDone: true,
    bootSaveDone: true,
  };

  test('does not gate optional or non-checkpoint steps', () => {
    expect(setupNextBlockedReason('power', ready)).toBeNull();
    expect(setupNextBlockedReason('ffb', ready)).toBeNull();
    expect(setupNextBlockedReason('encoder', ready)).toBeNull();
  });

  test('blocks saveNvm1 while pending or unsaved', () => {
    expect(setupNextBlockedReason('saveNvm1', { ...ready, pendingSave: 3 })).toBe('setupNextNeedSaveNvm1');
    expect(setupNextBlockedReason('saveNvm1', { ...ready, saveNvm1Applied: false })).toBe('setupNextNeedSaveNvm1');
    expect(setupNextBlockedReason('saveNvm1', ready)).toBeNull();
  });

  test('blocks cal steps until they succeed', () => {
    expect(setupNextBlockedReason('motorCal', { ...ready, motorCalDone: false })).toBe('setupNextNeedMotorCal');
    expect(setupNextBlockedReason('encoderCal', { ...ready, encoderCalDone: false })).toBe(
      'setupNextNeedEncoderCal',
    );
    expect(setupNextBlockedReason('bootSave', { ...ready, bootSaveDone: false })).toBe('setupNextNeedBootSave');
  });
});
