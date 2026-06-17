export interface PerfSample {
  t: number;
  pos: number;
  dps?: number;
  rpm?: number;
  accel?: number;
}

export interface IqSample {
  t: number;
  iq: number;
}

export interface PerfHwParams {
  range: number;
  maxtorqueNm: number;
  fxratio: number;
  currentLimA: number;
  launchTorqueNm: number;
  halfRange: number;
}

export interface PerfTestResults {
  samples: PerfSample[];
  peakRPM: number;
  peakDPS: number;
  peakAccel: number;
  peakRPMIdx: number;
  peakAccelIdx: number;
  tPeakRPM: number;
  tPeakAccel: number;
  t80: number;
  rangeUsed: number;
  rangeCfg: number;
  avgDt: number;
  launchTorqueNm: number;
  currentLimA: number;
  iqSamples: IqSample[];
  iqMax: number;
  iqSatMs: number;
  breakawayPct: number | null;
  breakawayTorqueNm: number | null;
  inertiaKgM2: number | null;
  inertiaODrive: number | null;
  halfRange: number;
}

export type PerfPhase =
  | 'idle'
  | 'centering'
  | 'friction'
  | 'push'
  | 'pause'
  | 'launch'
  | 'return'
  | 'done'
  | 'aborted'
  | 'error';

export interface PerfTestRunnerCallbacks {
  onPhase: (phase: PerfPhase, extra?: string) => void;
  onLog: (message: string, direction: 'tx' | 'rx' | 'error') => void;
  isAborted: () => boolean;
}
