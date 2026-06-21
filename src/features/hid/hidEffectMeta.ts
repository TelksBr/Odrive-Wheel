import type { EffectKey } from './HidFfbService';

export interface HidReportStep {
  id: string;
  labelKey: string;
}

export interface HidEffectMeta {
  key: EffectKey;
  block: number;
  pidType: number;
  reportChain: HidReportStep[];
}

/** USB HID PID effect slots used by Odrive-Wheel firmware. */
export const HID_EFFECT_META: Record<EffectKey, HidEffectMeta> = {
  cf: {
    key: 'cf',
    block: 1,
    pidType: 1,
    reportChain: [
      { id: '0x01', labelKey: 'ffbReportSetEffect' },
      { id: '0x05', labelKey: 'ffbReportSetConstant' },
      { id: '0x0A', labelKey: 'ffbReportEffectOp' },
    ],
  },
  sp: {
    key: 'sp',
    block: 2,
    pidType: 8,
    reportChain: [
      { id: '0x01', labelKey: 'ffbReportSetEffect' },
      { id: '0x03', labelKey: 'ffbReportSetCondition' },
      { id: '0x0A', labelKey: 'ffbReportEffectOp' },
    ],
  },
  da: {
    key: 'da',
    block: 3,
    pidType: 9,
    reportChain: [
      { id: '0x01', labelKey: 'ffbReportSetEffect' },
      { id: '0x03', labelKey: 'ffbReportSetCondition' },
      { id: '0x0A', labelKey: 'ffbReportEffectOp' },
    ],
  },
  fr: {
    key: 'fr',
    block: 4,
    pidType: 11,
    reportChain: [
      { id: '0x01', labelKey: 'ffbReportSetEffect' },
      { id: '0x03', labelKey: 'ffbReportSetCondition' },
      { id: '0x0A', labelKey: 'ffbReportEffectOp' },
    ],
  },
  si: {
    key: 'si',
    block: 6,
    pidType: 4,
    reportChain: [
      { id: '0x01', labelKey: 'ffbReportSetEffect' },
      { id: '0x04', labelKey: 'ffbReportSetPeriodic' },
      { id: '0x0A', labelKey: 'ffbReportEffectOp' },
    ],
  },
  ra: {
    key: 'ra',
    block: 7,
    pidType: 1,
    reportChain: [
      { id: '0x01', labelKey: 'ffbReportSetEffect' },
      { id: '0x05', labelKey: 'ffbReportSetConstant' },
      { id: '0x0A', labelKey: 'ffbReportEffectOp' },
    ],
  },
};

export function reportChainLabel(meta: HidEffectMeta): string {
  return meta.reportChain.map((step) => step.id).join(' + ');
}
