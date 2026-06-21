import { hidFfbService, pctToCoef, pctToMagnitude } from '../hid/HidFfbService';
import { PT_BLOCK, PT_TYPE } from './perfTestConstants';

type PtEffectKey = keyof typeof PT_BLOCK;

function buildSetEffect(blockIdx: number, type: number, durationMs = 0xffff, gain = 255): number[] {
  return [
    blockIdx, type,
    durationMs & 0xff, (durationMs >> 8) & 0xff,
    0, 0, 0, 0, 0, 0,
    gain, 0,
    0, 0, 0, 0, 0,
  ];
}

function buildConstantForce(blockIdx: number, magS16: number): number[] {
  const m = magS16 & 0xffff;
  return [blockIdx, m & 0xff, (m >> 8) & 0xff];
}

function buildCondition(blockIdx: number, coef: number): number[] {
  const i16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
  return [
    blockIdx, 0x00,
    ...i16(0), ...i16(coef), ...i16(coef),
    ...i16(0x7fff), ...i16(0x7fff), ...i16(0),
  ];
}

function buildOp(blockIdx: number, op: number, loopCount = 1): number[] {
  return [blockIdx, op, loopCount];
}

export function createPerfTestHid() {
  const sendOutput = async (reportId: number, data: number[] | Uint8Array) => {
    await hidFfbService.sendRawReport(reportId, data);
  };

  const startEffect = async (key: PtEffectKey) => {
    await sendOutput(0x01, buildSetEffect(PT_BLOCK[key], PT_TYPE[key]));
    await sendOutput(0x0a, buildOp(PT_BLOCK[key], 1, 0));
  };

  const stopEffect = async (key: PtEffectKey) => {
    await sendOutput(0x0a, buildOp(PT_BLOCK[key], 3, 0));
  };

  const stopAllHid = async () => {
    for (const key of ['cf', 'sp', 'da'] as PtEffectKey[]) {
      await stopEffect(key).catch(() => undefined);
    }
    await sendOutput(0x0c, [0x04]).catch(() => undefined);
  };

  return {
    sendOutput,
    startEffect,
    stopEffect,
    stopAllHid,
    buildConstantForce,
    buildCondition,
    pctToCoef,
    pctToMag: pctToMagnitude,
  };
}

export type PerfTestHid = ReturnType<typeof createPerfTestHid>;
