import type { PerfSample, PerfTestResults } from './perfTestTypes';

function smoothMA(arr: number[], win: number): number[] {
  const n = arr.length;
  const out = new Array<number>(n);
  const half = Math.floor(win / 2);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
      sum += arr[j];
      count++;
    }
    out[i] = count > 0 ? sum / count : 0;
  }
  return out;
}

function smoothMedian(arr: number[], win: number): number[] {
  const n = arr.length;
  const out = new Array<number>(n);
  const half = Math.floor(win / 2);
  for (let i = 0; i < n; i++) {
    const buf: number[] = [];
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
      buf.push(arr[j]);
    }
    buf.sort((a, b) => a - b);
    out[i] = buf[Math.floor(buf.length / 2)];
  }
  return out;
}

export interface ComputeResultsExtra {
  launchTorqueNm: number;
  currentLimA: number;
  iqSamples: { t: number; iq: number }[];
  iqMax: number;
  iqSatMs: number;
  breakawayPct: number | null;
  breakawayTorqueNm: number | null;
  halfRange: number;
}

export function computePerfTestResults(
  samples: PerfSample[],
  rangeCfg: number,
  refStartPos: number,
  extra: ComputeResultsExtra,
): PerfTestResults | null {
  if (samples.length < 3) {
    return null;
  }

  const N = samples.length;
  const ts = samples.map((s) => s.t);
  const pos = samples.map((s) => s.pos);

  const posMed = smoothMedian(pos, 5);
  const posSm = smoothMA(posMed, 11);

  const SPAN = 4;
  const dps = new Array<number>(N).fill(0);
  for (let i = 0; i < N; i++) {
    const i0 = Math.max(0, i - SPAN);
    const i1 = Math.min(N - 1, i + SPAN);
    const dt = (ts[i1] - ts[i0]) / 1000;
    if (dt > 0.001) {
      dps[i] = (posSm[i1] - posSm[i0]) / dt;
    } else {
      dps[i] = i > 0 ? dps[i - 1] : 0;
    }
  }

  for (let i = 0; i < N; i++) {
    samples[i].dps = dps[i];
    samples[i].rpm = dps[i] / 6;
  }

  const accelRaw = new Array<number>(N).fill(0);
  for (let i = 0; i < N; i++) {
    const i0 = Math.max(0, i - SPAN);
    const i1 = Math.min(N - 1, i + SPAN);
    const dt = (ts[i1] - ts[i0]) / 1000;
    if (dt > 0.001) {
      accelRaw[i] = (dps[i1] - dps[i0]) / dt / 6;
    } else {
      accelRaw[i] = i > 0 ? accelRaw[i - 1] : 0;
    }
  }

  const accel = smoothMedian(accelRaw, 7);
  for (let i = 0; i < N; i++) {
    samples[i].accel = accel[i];
  }

  let peakRPMVal = 0;
  let peakRPMIdx = 0;
  let peakAccelVal = 0;
  let peakAccelIdx = 0;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i].rpm ?? 0) > Math.abs(peakRPMVal)) {
      peakRPMVal = samples[i].rpm ?? 0;
      peakRPMIdx = i;
    }
    const v = samples[i].rpm ?? 0;
    const a = samples[i].accel ?? 0;
    const isAccelerating = Math.abs(v) > 5 && v * a > 0;
    if (isAccelerating && Math.abs(a) > Math.abs(peakAccelVal)) {
      peakAccelVal = a;
      peakAccelIdx = i;
    }
  }

  const peakRPM = Math.abs(peakRPMVal);
  const peakDPS = peakRPM * 6;
  const peakAccel = Math.abs(peakAccelVal);
  const tPeakRPM = samples[peakRPMIdx].t;
  const tPeakAccel = samples[peakAccelIdx].t;

  const reachThresh = 0.80 * rangeCfg;
  let t80 = NaN;
  for (const s of samples) {
    if (Math.abs(s.pos - refStartPos) >= reachThresh) {
      t80 = s.t;
      break;
    }
  }

  const rangeUsed = Math.abs(samples[samples.length - 1].pos - refStartPos);
  const avgDt = samples.length > 1
    ? (samples[samples.length - 1].t - samples[0].t) / (samples.length - 1)
    : 0;

  let inertiaKgM2: number | null = null;
  let inertiaODrive: number | null = null;
  if (extra.launchTorqueNm && peakAccel > 0) {
    const alphaRadS2 = peakAccel * (2 * Math.PI / 60);
    inertiaKgM2 = extra.launchTorqueNm / alphaRadS2;
    inertiaODrive = inertiaKgM2 * 2 * Math.PI;
  }

  return {
    samples,
    peakRPM,
    peakDPS,
    peakAccel,
    peakRPMIdx,
    peakAccelIdx,
    tPeakRPM,
    tPeakAccel,
    t80,
    rangeUsed,
    rangeCfg,
    avgDt,
    launchTorqueNm: extra.launchTorqueNm,
    currentLimA: extra.currentLimA,
    iqSamples: extra.iqSamples,
    iqMax: extra.iqMax,
    iqSatMs: extra.iqSatMs,
    breakawayPct: extra.breakawayPct,
    breakawayTorqueNm: extra.breakawayTorqueNm,
    inertiaKgM2,
    inertiaODrive,
    halfRange: extra.halfRange,
  };
}
