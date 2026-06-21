export interface NtcPoint {
  v: number;
  t: number;
  saturated?: boolean;
}

export interface NtcFitResult {
  coefs: [number, number, number, number];
  rms: number;
  points: NtcPoint[];
  allPoints: NtcPoint[];
  nSaturated: number;
}

function ntcResistance(beta: number, r25: number, tempC: number): number {
  const tK = tempC + 273.15;
  const t25 = 298.15;
  return r25 * Math.exp(beta * (1 / tK - 1 / t25));
}

export function generateNtcCurve(
  beta: number,
  r25: number,
  rPullup: number,
  vref: number,
  tMin: number,
  tMax: number,
  steps = 60,
): { fitPoints: NtcPoint[]; allPoints: NtcPoint[] } {
  const allPoints: NtcPoint[] = [];
  const fitPoints: NtcPoint[] = [];
  for (let i = 0; i < steps; i += 1) {
    const t = tMin + ((tMax - tMin) * i) / Math.max(steps - 1, 1);
    const rNtc = ntcResistance(beta, r25, t);
    const vAdc = (rNtc / (rNtc + rPullup)) * vref;
    const vNorm = vAdc / 3.3;
    const saturated = vAdc > 3.3;
    const point = { v: vNorm, t, saturated };
    allPoints.push(point);
    if (!saturated) {
      fitPoints.push(point);
    }
  }
  return { fitPoints, allPoints };
}

function polyEval(coefs: number[], x: number): number {
  return coefs.reduce((sum, c, i) => sum + c * x ** i, 0);
}

function polyFit(points: NtcPoint[]): [number, number, number, number] {
  const n = points.length;
  const xs = points.map((p) => p.v);
  const ys = points.map((p) => p.t);

  const s: number[] = new Array(7).fill(0);
  for (let i = 0; i < n; i += 1) {
    const x = xs[i];
    s[0] += 1;
    s[1] += x;
    s[2] += x * x;
    s[3] += x ** 3;
    s[4] += x ** 4;
    s[5] += x ** 5;
    s[6] += x ** 6;
  }

  const m = [
    [s[0], s[1], s[2], s[3]],
    [s[1], s[2], s[3], s[4]],
    [s[2], s[3], s[4], s[5]],
    [s[3], s[4], s[5], s[6]],
  ];
  const b = [
    ys.reduce((a, y) => a + y, 0),
    points.reduce((a, p) => a + p.v * p.t, 0),
    points.reduce((a, p) => a + p.v ** 2 * p.t, 0),
    points.reduce((a, p) => a + p.v ** 3 * p.t, 0),
  ];

  return solve4(m, b) as [number, number, number, number];
}

function solve4(m: number[][], b: number[]): number[] {
  const a = m.map((row, i) => [...row, b[i]]);
  const n = 4;
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) {
        pivot = row;
      }
    }
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const div = a[col][col] || 1e-12;
    for (let j = col; j <= n; j += 1) {
      a[col][j] /= div;
    }
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j += 1) {
        a[row][j] -= factor * a[col][j];
      }
    }
  }
  return a.map((row) => row[n]);
}

function rmsError(coefs: number[], points: NtcPoint[]): number {
  if (points.length === 0) return Infinity;
  const sum = points.reduce((acc, p) => {
    const err = polyEval(coefs, p.v) - p.t;
    return acc + err * err;
  }, 0);
  return Math.sqrt(sum / points.length);
}

export function computeNtcFit(input: {
  beta: number;
  r25: number;
  rPullup: number;
  vref: number;
  tMin: number;
  tMax: number;
}): NtcFitResult | null {
  const { beta, r25, rPullup, vref, tMin, tMax } = input;
  if (![beta, r25, rPullup, vref, tMin, tMax].every(Number.isFinite)) return null;
  if (beta <= 0 || r25 <= 0 || rPullup <= 0 || vref <= 0 || tMax <= tMin) return null;

  const { fitPoints, allPoints } = generateNtcCurve(beta, r25, rPullup, vref, tMin, tMax, 60);
  if (fitPoints.length < 4) return null;

  const coefs = polyFit(fitPoints);
  const rms = rmsError(coefs, fitPoints);
  return { coefs, rms, points: fitPoints, allPoints, nSaturated: allPoints.length - fitPoints.length };
}

/** ODrive stores highest-order coefficient first. */
export function odrivePolyCoefficients(coefs: [number, number, number, number]): [number, number, number, number] {
  return [coefs[3], coefs[2], coefs[1], coefs[0]];
}
