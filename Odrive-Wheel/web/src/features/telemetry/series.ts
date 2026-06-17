import type { TelemetrySeries } from './types';

export const busSeries: TelemetrySeries[] = [
  { key: 'vbus',   label: 'VBUS',    unit: 'V',  color: '#60a5fa', axis: 'left',  visible: true },
  { key: 'ibus',   label: 'IBUS',    unit: 'A',  color: '#f59e0b', axis: 'right', visible: true },
  { key: 'iq',     label: 'Iq',      unit: 'A',  color: '#22c55e', axis: 'right', visible: true },
  { key: 'ibrake', label: 'I brake', unit: 'A',  color: '#ef4444', axis: 'right', visible: true },
];

export const wheelSeries: TelemetrySeries[] = [
  { key: 'torqueNm',    label: 'Torque',   unit: 'Nm',    color: '#ef4444', axis: 'left',  visible: true },
  { key: 'positionDeg', label: 'Position', unit: 'deg',   color: '#a78bfa', axis: 'right', visible: true },
];

export const motionSeries: TelemetrySeries[] = [
  { key: 'torqueNm',    label: 'Torque',   unit: 'Nm',  color: '#ef4444', axis: 'left',  visible: true },
  { key: 'positionDeg', label: 'Position', unit: 'deg', color: '#a78bfa', axis: 'right', visible: true },
];

/** All series keys used across charts — for stats computation */
export const allSeriesKeys: (keyof import('./types').TelemetrySample)[] = [
  'vbus', 'ibus', 'iq', 'ibrake', 'torqueNm', 'positionDeg', 'velocityDegS',
];
