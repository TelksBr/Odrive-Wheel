import type { TelemetrySample } from './types';

/** HID input report 0x01 — payload after report ID (30 bytes, little-endian int16 fields). */
export const HID_INPUT_REPORT_ID = 0x01;
export const HID_INPUT_PAYLOAD_MIN_BYTES = 30;

export interface HidInputFrame {
  positionRaw: number;
  velocityTurnsS: number;
  iq: number;
  torqueNm: number;
  vbus: number;
  ibus: number;
  ibrake: number;
  rx: number;
  ry: number;
  rz: number;
  slider: number;
}

function clampI16Scaled(value: number, scale: number): number {
  return value / scale;
}

/** Parse rc12 1 kHz telemetry fields from a WebHID input report. */
export function parseHidInputFrame(data: DataView): HidInputFrame | null {
  if (data.byteLength < HID_INPUT_PAYLOAD_MIN_BYTES) {
    return null;
  }

  return {
    positionRaw: data.getInt16(8, true),
    velocityTurnsS: clampI16Scaled(data.getInt16(10, true), 1000),
    iq: clampI16Scaled(data.getInt16(12, true), 1000),
    rx: data.getInt16(14, true),
    ry: data.getInt16(16, true),
    rz: data.getInt16(18, true),
    torqueNm: clampI16Scaled(data.getInt16(20, true), 1000),
    slider: data.getInt16(22, true),
    vbus: clampI16Scaled(data.getInt16(24, true), 100),
    ibus: clampI16Scaled(data.getInt16(26, true), 100),
    ibrake: clampI16Scaled(data.getInt16(28, true), 100),
  };
}

export function hidFrameToTelemetrySample(frame: HidInputFrame, halfRangeDeg: number): TelemetrySample {
  return {
    t: performance.now(),
    vbus: frame.vbus,
    ibus: frame.ibus,
    iq: frame.iq,
    ibrake: frame.ibrake,
    torqueNm: frame.torqueNm,
    positionDeg: halfRangeDeg > 0 ? (frame.positionRaw / 32767) * halfRangeDeg : undefined,
  };
}

export function hidReportToTelemetrySample(
  event: { reportId: number; data: DataView },
  halfRangeDeg: number,
): TelemetrySample | null {
  if (event.reportId !== HID_INPUT_REPORT_ID) {
    return null;
  }
  const frame = parseHidInputFrame(event.data);
  if (!frame) {
    return null;
  }
  return hidFrameToTelemetrySample(frame, halfRangeDeg);
}
