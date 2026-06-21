import { translate, type Locale } from '../../i18n/messages';
import type { TelemetrySeries } from './types';

const SERIES_LABEL_KEYS: Record<string, string> = {
  vbus: 'metricVbus',
  ibus: 'seriesIbus',
  iq: 'metricIqMotor',
  ibrake: 'observeStatIBrake',
  positionDeg: 'observeStatPosition',
  torqueNm: 'observeStatTorque',
};

export const busSeries: TelemetrySeries[] = [
  { key: 'vbus', label: 'VBUS', unit: 'V', color: '#60a5fa', axis: 'left', visible: true },
  { key: 'ibus', label: 'IBUS', unit: 'A', color: '#f59e0b', axis: 'right', visible: true },
  { key: 'iq', label: 'Iq', unit: 'A', color: '#22c55e', axis: 'right', visible: true },
  { key: 'ibrake', label: 'I brake', unit: 'A', color: '#ef4444', axis: 'right', visible: true },
];

export const wheelSeries: TelemetrySeries[] = [
  { key: 'positionDeg', label: 'Position', unit: 'deg', color: '#a78bfa', axis: 'left', visible: true },
  { key: 'torqueNm', label: 'Torque', unit: 'Nm', color: '#ef4444', axis: 'right', visible: true },
];

export const motionSeries: TelemetrySeries[] = [
  { key: 'positionDeg', label: 'Position', unit: 'deg', color: '#a78bfa', axis: 'left', visible: true },
  { key: 'torqueNm', label: 'Torque', unit: 'Nm', color: '#ef4444', axis: 'right', visible: true },
];

export function localizedSeries(locale: Locale, series: TelemetrySeries[]): TelemetrySeries[] {
  return series.map((item) => ({
    ...item,
    label: translate(locale, SERIES_LABEL_KEYS[item.key] ?? `series.${item.key}`),
  }));
}

/** All series keys used across charts — for stats computation */
export const allSeriesKeys: (keyof import('./types').TelemetrySample)[] = [
  'vbus', 'ibus', 'iq', 'ibrake', 'torqueNm', 'positionDeg', 'velocityDegS',
];
