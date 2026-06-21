import { serialService } from '../serial/SerialService';
import { hidFfbService } from '../hid/HidFfbService';
import {
  PT_BLOCK,
  PT_BREAKAWAY_DEG_THRESHOLD,
  PT_BREAKAWAY_MAX_PCT,
  PT_BREAKAWAY_STEP_MS,
  PT_BREAKAWAY_STEP_PCT,
  PT_CENTER_TOLERANCE_DEG,
  PT_DEFAULT_CURRENT_LIM_A,
  PT_DEFAULT_FXRATIO,
  PT_DEFAULT_MAXTORQUE_NM,
  PT_DEFAULT_RANGE_DEG,
  PT_EXTREME_TOLERANCE_DEG,
  PT_IQ_POLL_MS,
  PT_IQ_SAT_FRACTION,
  PT_LAUNCH_TIMEOUT_MS,
  PT_PHASE_TIMEOUT_MS,
  PT_REACH_FRACTION,
  PT_STABILIZE_MS,
  PT_STABLE_SAMPLES,
  PT_TYPE,
} from './perfTestConstants';
import { createPerfTestHid } from './perfTestHid';
import { computePerfTestResults } from './perfTestMath';
import type { IqSample, PerfHwParams, PerfSample, PerfTestResults, PerfTestRunnerCallbacks } from './perfTestTypes';

async function readOpenFFBoard(path: string): Promise<string | null> {
  try {
    const raw = await serialService.sendCommand(`${path}?`, true, 2000, false);
    const match = raw.match(/\|([^\]]+)\]$/);
    return (match ? match[1] : raw).trim();
  } catch {
    return null;
  }
}

async function readOdrive(path: string): Promise<string | null> {
  try {
    const raw = await serialService.sendCommand(`r ${path}`, true, 2000, false);
    return raw.trim().split(/\s+/)[0] ?? raw.trim();
  } catch {
    return null;
  }
}

async function readHwParams(serialConnected: boolean, callbacks: PerfTestRunnerCallbacks): Promise<PerfHwParams | { error: string }> {
  let range = PT_DEFAULT_RANGE_DEG;
  let maxtorqueNm = PT_DEFAULT_MAXTORQUE_NM;
  let fxratio = PT_DEFAULT_FXRATIO;
  let currentLimA = PT_DEFAULT_CURRENT_LIM_A;

  if (serialConnected) {
    const rangeStr = await readOpenFFBoard('axis.range');
    const rangeRead = parseFloat(rangeStr ?? '');
    if (Number.isFinite(rangeRead) && rangeRead > 0) {
      range = rangeRead;
      callbacks.onLog(`perftest: range read via serial = ${range}°`, 'rx');
    } else {
      callbacks.onLog(`perftest: failed to read axis.range, using default ${range}°`, 'error');
    }

    if (range < 90) {
      return { error: 'range_too_small' };
    }

    const axisErr = await readOdrive('axis0.error');
    if (parseInt(axisErr ?? '0', 16) !== 0) {
      return { error: `axis_error:${axisErr}` };
    }

    const mtStr = await readOpenFFBoard('axis.maxtorque');
    const mtVal = parseFloat(mtStr ?? '');
    if (Number.isFinite(mtVal) && mtVal > 0) {
      maxtorqueNm = mtVal;
    }

    const frStr = await readOpenFFBoard('axis.fxratio');
    const frVal = parseFloat(frStr ?? '');
    if (Number.isFinite(frVal) && frVal > 0) {
      fxratio = frVal;
    }

    const clStr = await readOdrive('axis0.motor.config.current_lim');
    const clVal = parseFloat(clStr ?? '');
    if (Number.isFinite(clVal) && clVal > 0) {
      currentLimA = clVal;
    }

    callbacks.onLog(
      `perftest: hw params — maxtorque=${maxtorqueNm.toFixed(2)} Nm, fxratio=${fxratio.toFixed(2)}, current_lim=${currentLimA.toFixed(1)} A`,
      'rx',
    );
  } else {
    callbacks.onLog('perftest: serial not connected — using defaults for range/maxtorque/fxratio/current_lim', 'tx');
  }

  return {
    range,
    maxtorqueNm,
    fxratio,
    currentLimA,
    launchTorqueNm: maxtorqueNm * fxratio,
    halfRange: range / 2,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function deviceEventTarget(device: HIDDevice): EventTarget {
  return device as unknown as EventTarget;
}

export async function runPerfTest(
  callbacks: PerfTestRunnerCallbacks,
  serialConnected: boolean,
): Promise<PerfTestResults | null> {
  const device = hidFfbService.openedDevice;
  if (!device?.opened) {
    callbacks.onPhase('error', 'no_hid');
    return null;
  }

  const hw = await readHwParams(serialConnected, callbacks);
  if ('error' in hw) {
    callbacks.onPhase('error', hw.error);
    return null;
  }

  const hid = createPerfTestHid();
  const { range, halfRange, launchTorqueNm, currentLimA } = hw;
  const aborted = callbacks.isAborted;

  const waitForPosition = (checkFn: (pos: number) => boolean, timeoutMs: number) =>
    new Promise<{ ok: boolean; finalPos: number | null; reason: string }>((resolve) => {
      let lastPos: number | null = null;
      let done = false;
      const finish = (reason: string) => {
        if (done) {
          return;
        }
        done = true;
        clearTimeout(toId);
        clearInterval(abId);
        deviceEventTarget(device).removeEventListener('inputreport', listener);
        resolve({ ok: reason === 'matched', finalPos: lastPos, reason });
      };
      const listener = (event: Event) => {
        const report = event as unknown as { reportId: number; data: DataView };
        if (report.reportId !== 0x01) {
          return;
        }
        const x = report.data.getInt16(8, true);
        const pos = (x / 32767) * halfRange;
        lastPos = pos;
        if (checkFn(pos)) {
          finish('matched');
        }
      };
      const toId = window.setTimeout(() => finish('timeout'), timeoutMs);
      const abId = window.setInterval(() => {
        if (aborted()) {
          finish('aborted');
        }
      }, 50);
      deviceEventTarget(device).addEventListener('inputreport', listener);
    });

  // Phase 1: Centering
  callbacks.onPhase('centering');
  callbacks.onLog(`perftest: Phase 1/6 — Spring 30% + Damper 25%, waiting |pos| < ${PT_CENTER_TOLERANCE_DEG}°`, 'tx');
  await hid.sendOutput(0x03, hid.buildCondition(PT_BLOCK.sp, hid.pctToCoef(30)));
  await hid.startEffect('sp');
  await hid.sendOutput(0x03, hid.buildCondition(PT_BLOCK.da, hid.pctToCoef(25)));
  await hid.startEffect('da');

  let centerCount = 0;
  const r1 = await waitForPosition((pos) => {
    if (Math.abs(pos) < PT_CENTER_TOLERANCE_DEG) {
      centerCount++;
      return centerCount >= PT_STABLE_SAMPLES;
    }
    centerCount = 0;
    return false;
  }, PT_PHASE_TIMEOUT_MS);

  if (r1.reason === 'aborted') {
    await hid.stopAllHid();
    callbacks.onPhase('aborted');
    return null;
  }
  if (r1.reason === 'timeout') {
    callbacks.onPhase('error', `phase1_timeout:${PT_PHASE_TIMEOUT_MS / 1000}`);
    await hid.stopAllHid();
    return null;
  }
  callbacks.onLog(`perftest: Phase 1 done — pos=${r1.finalPos?.toFixed(1)}°`, 'rx');

  // Phase 2: Friction breakaway
  callbacks.onPhase('friction');
  callbacks.onLog(
    `perftest: Phase 2/6 — friction breakaway (step ${PT_BREAKAWAY_STEP_PCT}% every ${PT_BREAKAWAY_STEP_MS}ms until >${PT_BREAKAWAY_DEG_THRESHOLD}°)`,
    'tx',
  );
  await hid.stopEffect('sp');
  await hid.sendOutput(0x01, [PT_BLOCK.cf, PT_TYPE.cf, 0xff, 0xff, 0, 0, 0, 0, 0, 0, 255, 0]);
  await hid.sendOutput(0x05, hid.buildConstantForce(PT_BLOCK.cf, 0));
  await hid.sendOutput(0x0a, [PT_BLOCK.cf, 1, 0]);

  let breakStartPos: number | null = null;
  let breakDetected = false;
  let breakCurPos: number | null = null;
  const breakListener = (event: Event) => {
    const report = event as unknown as { reportId: number; data: DataView };
    if (report.reportId !== 0x01) {
      return;
    }
    const x = report.data.getInt16(8, true);
    const pos = (x / 32767) * halfRange;
    breakCurPos = pos;
    if (breakStartPos === null) {
      breakStartPos = pos;
    }
    if (Math.abs(pos - breakStartPos) > PT_BREAKAWAY_DEG_THRESHOLD) {
      breakDetected = true;
    }
  };
  deviceEventTarget(device).addEventListener('inputreport', breakListener);

  let breakawayPct: number | null = null;
  for (let pct = PT_BREAKAWAY_STEP_PCT; pct <= PT_BREAKAWAY_MAX_PCT; pct += PT_BREAKAWAY_STEP_PCT) {
    if (aborted()) {
      break;
    }
    await hid.sendOutput(0x05, hid.buildConstantForce(PT_BLOCK.cf, hid.pctToMag(pct)));
    await sleep(PT_BREAKAWAY_STEP_MS);
    if (breakDetected) {
      breakawayPct = pct;
      break;
    }
  }
  deviceEventTarget(device).removeEventListener('inputreport', breakListener);
  await hid.stopEffect('cf');

  if (aborted()) {
    await hid.stopAllHid();
    callbacks.onPhase('aborted');
    return null;
  }

  const breakawayTorqueNm = breakawayPct !== null ? (breakawayPct / 100) * launchTorqueNm : null;
  if (breakawayPct !== null) {
    callbacks.onLog(
      `perftest: Phase 2 done — breakaway at CF=${breakawayPct}% (T≈${breakawayTorqueNm?.toFixed(3)} Nm) moved ${((breakCurPos ?? 0) - (breakStartPos ?? 0)).toFixed(1)}°`,
      'rx',
    );
  } else {
    callbacks.onLog(`perftest: Phase 2 — breakaway not detected up to ${PT_BREAKAWAY_MAX_PCT}%`, 'error');
  }

  // Phase 3: Push to limit
  callbacks.onPhase('push');
  callbacks.onLog(
    `perftest: Phase 3/6 — Spring OFF, CF +20%, until |pos| > ${(halfRange - PT_EXTREME_TOLERANCE_DEG).toFixed(0)}°`,
    'tx',
  );
  await hid.sendOutput(0x01, [PT_BLOCK.cf, PT_TYPE.cf, 0xff, 0xff, 0, 0, 0, 0, 0, 0, 255, 0]);
  await hid.sendOutput(0x05, hid.buildConstantForce(PT_BLOCK.cf, hid.pctToMag(20)));
  await hid.sendOutput(0x0a, [PT_BLOCK.cf, 1, 0]);

  let extremeCount = 0;
  const r2 = await waitForPosition((pos) => {
    if (Math.abs(pos) > halfRange - PT_EXTREME_TOLERANCE_DEG) {
      extremeCount++;
      return extremeCount >= PT_STABLE_SAMPLES;
    }
    extremeCount = 0;
    return false;
  }, PT_PHASE_TIMEOUT_MS);

  if (r2.reason === 'aborted') {
    await hid.stopAllHid();
    callbacks.onPhase('aborted');
    return null;
  }
  if (r2.reason === 'timeout') {
    callbacks.onPhase('error', `phase3_timeout:${PT_PHASE_TIMEOUT_MS / 1000}`);
    await hid.stopAllHid();
    return null;
  }

  const endStopPos = r2.finalPos ?? 0;
  callbacks.onLog(`perftest: Phase 3 done — pos=${endStopPos.toFixed(1)}° (target=±${halfRange.toFixed(0)}°)`, 'rx');

  // Phase 4: Stabilize
  callbacks.onPhase('pause');
  callbacks.onLog(`perftest: Phase 4/6 — stabilizing ${PT_STABILIZE_MS / 1000}s at end stop (CF 5%)`, 'tx');
  await hid.sendOutput(0x05, hid.buildConstantForce(PT_BLOCK.cf, hid.pctToMag(5)));
  await sleep(PT_STABILIZE_MS);
  if (aborted()) {
    await hid.stopAllHid();
    callbacks.onPhase('aborted');
    return null;
  }

  // Phase 5: Launch + Iq sampling
  callbacks.onPhase('launch');
  const launchDir = -1;
  const samples: PerfSample[] = [];
  let hidStartPos: number | null = null;
  let resolvedReason = 'timeout';

  callbacks.onLog(
    `perftest: Phase 5/6 — launch CF ${launchDir}×100% (T≈${launchTorqueNm.toFixed(2)} Nm) until 80% × ${range.toFixed(0)}°`,
    'tx',
  );

  await hid.sendOutput(0x0a, [PT_BLOCK.cf, 3, 0]);
  await hid.stopEffect('da');
  await hid.sendOutput(0x05, hid.buildConstantForce(PT_BLOCK.cf, 0));
  await sleep(50);
  await hid.sendOutput(0x01, [PT_BLOCK.cf, PT_TYPE.cf, 0xff, 0xff, 0, 0, 0, 0, 0, 0, 255, 0]);
  await hid.sendOutput(0x05, hid.buildConstantForce(PT_BLOCK.cf, launchDir * 32767));

  let resolveAcq: (() => void) | null = null;
  const launchPromise = new Promise<void>((resolve) => {
    resolveAcq = resolve;
  });
  const t0 = performance.now();
  let firstReportLogged = false;

  const onReport = (event: Event) => {
    const report = event as unknown as { reportId: number; data: DataView };
    if (report.reportId !== 0x01) {
      return;
    }
    const x = report.data.getInt16(8, true);
    const posDeg = (x / 32767) * halfRange;
    const t = performance.now() - t0;
    samples.push({ t, pos: posDeg });
    if (hidStartPos === null) {
      hidStartPos = posDeg;
    }
    if (!firstReportLogged) {
      callbacks.onLog(`perftest: launch first HID — pos=${posDeg.toFixed(1)}° @ t=${t.toFixed(1)}ms`, 'rx');
      firstReportLogged = true;
    }
    if (Math.abs(posDeg - hidStartPos) >= PT_REACH_FRACTION * range) {
      resolvedReason = 'reached';
      resolveAcq?.();
    }
  };
  deviceEventTarget(device).addEventListener('inputreport', onReport);

  const iqSamples: IqSample[] = [];
  let iqInFlight = false;
  let iqMax = 0;
  let iqSatMs = 0;
  let iqLastT: number | null = null;

  const iqPoll = async () => {
    if (iqInFlight || !serialConnected) {
      return;
    }
    iqInFlight = true;
    try {
      const r = await readOdrive('axis0.motor.current_control.Iq_measured');
      if (r !== null) {
        const iq = Math.abs(parseFloat(r));
        if (!Number.isFinite(iq)) {
          return;
        }
        const tNow = performance.now() - t0;
        iqSamples.push({ t: tNow, iq });
        if (iq > iqMax) {
          iqMax = iq;
        }
        if (iqLastT !== null && currentLimA > 0 && iq >= currentLimA * PT_IQ_SAT_FRACTION) {
          iqSatMs += tNow - iqLastT;
        }
        iqLastT = tNow;
      }
    } finally {
      iqInFlight = false;
    }
  };

  const iqPollId = serialConnected ? window.setInterval(() => void iqPoll(), PT_IQ_POLL_MS) : null;
  const timeoutId = window.setTimeout(() => {
    resolvedReason = 'timeout';
    resolveAcq?.();
  }, PT_LAUNCH_TIMEOUT_MS);
  const abortCheckId = window.setInterval(() => {
    if (aborted()) {
      resolvedReason = 'aborted';
      resolveAcq?.();
    }
  }, 50);

  await hid.sendOutput(0x0a, [PT_BLOCK.cf, 1, 0]);
  await launchPromise;
  clearTimeout(timeoutId);
  clearInterval(abortCheckId);
  if (iqPollId !== null) {
    clearInterval(iqPollId);
  }
  deviceEventTarget(device).removeEventListener('inputreport', onReport);

  callbacks.onLog(
    `perftest: Phase 5 ended — reason=${resolvedReason} samples=${samples.length} iq=${iqSamples.length} iqMax=${iqMax.toFixed(2)}A iqSat=${iqSatMs.toFixed(0)}ms`,
    'rx',
  );

  if (aborted()) {
    await hid.stopAllHid();
    callbacks.onPhase('aborted');
    return null;
  }

  await hid.stopEffect('cf');
  await hid.sendOutput(0x03, hid.buildCondition(PT_BLOCK.da, hid.pctToCoef(25)));
  await hid.startEffect('da');

  // Phase 6: Return to center
  callbacks.onPhase('return');
  callbacks.onLog(`perftest: Phase 6/6 — Spring 30% + Damper 25%, waiting |pos| < ${PT_CENTER_TOLERANCE_DEG}°`, 'tx');
  await hid.sendOutput(0x03, hid.buildCondition(PT_BLOCK.sp, hid.pctToCoef(30)));
  await hid.startEffect('sp');

  let returnCount = 0;
  const r6 = await waitForPosition((pos) => {
    if (Math.abs(pos) < PT_CENTER_TOLERANCE_DEG) {
      returnCount++;
      return returnCount >= PT_STABLE_SAMPLES;
    }
    returnCount = 0;
    return false;
  }, PT_PHASE_TIMEOUT_MS);

  if (r6.reason === 'aborted') {
    await hid.stopAllHid();
    callbacks.onPhase('aborted');
    return null;
  }
  if (r6.reason === 'timeout') {
    callbacks.onLog(`perftest: Phase 6 timeout (last pos=${r6.finalPos?.toFixed(1) ?? '?'}°) — continuing to results`, 'error');
  } else {
    callbacks.onLog(`perftest: Phase 6 done — pos=${r6.finalPos?.toFixed(1)}°`, 'rx');
  }

  await hid.stopAllHid();

  const refStartPos = hidStartPos ?? endStopPos;
  const results = computePerfTestResults(samples, range, refStartPos, {
    launchTorqueNm,
    currentLimA,
    iqSamples,
    iqMax,
    iqSatMs,
    breakawayPct,
    breakawayTorqueNm,
    halfRange,
  });

  if (!results) {
    callbacks.onPhase('error', `few_samples:${samples.length}`);
    return null;
  }

  callbacks.onLog(
    `perftest: results — peakRPM=${results.peakRPM.toFixed(0)} @ ${results.tPeakRPM.toFixed(0)}ms · peakAccel=${results.peakAccel.toFixed(0)} RPM/s @ ${results.tPeakAccel.toFixed(0)}ms`,
    'rx',
  );
  callbacks.onPhase('done');
  return results;
}
