import { serialService } from '../serial/SerialService';

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function parseIntField(raw: string | undefined): number {
  if (!raw) return 0;
  const token = raw.trim().split(/\s+/)[0];
  const value = Number(token);
  return Number.isFinite(value) ? value : 0;
}

export interface AxisErrorSnapshot {
  axisErr: number;
  motorErr: number;
  encErr: number;
}

export interface CalibrationRunResult extends AxisErrorSnapshot {
  ok: boolean;
  reason?: 'not_connected' | 'timeout' | 'errors' | 'write_failed';
  finalState?: number;
}

export type CalibrationProgress = 'clearing' | 'starting' | 'running' | 'checking';

export async function readAxisErrorsNow(): Promise<AxisErrorSnapshot> {
  const axisRaw = await serialService.commandNow('r axis0.error', true, 4000, false);
  const motorRaw = await serialService.commandNow('r axis0.motor.error', true, 4000, false);
  const encRaw = await serialService.commandNow('r axis0.encoder.error', true, 4000, false);
  return {
    axisErr: parseIntField(axisRaw),
    motorErr: parseIntField(motorRaw),
    encErr: parseIntField(encRaw),
  };
}

export async function readAxisErrors(): Promise<AxisErrorSnapshot> {
  const [axisRaw, motorRaw, encRaw] = await Promise.all([
    serialService.sendCommand('r axis0.error', true, 4000, false),
    serialService.sendCommand('r axis0.motor.error', true, 4000, false),
    serialService.sendCommand('r axis0.encoder.error', true, 4000, false),
  ]);
  return {
    axisErr: parseIntField(axisRaw),
    motorErr: parseIntField(motorRaw),
    encErr: parseIntField(encRaw),
  };
}

export async function clearErrors(): Promise<void> {
  await serialService.sendCommand('sc', false, 2000, true);
  await sleep(200);
}

async function clearErrorsNow(): Promise<void> {
  await serialService.commandNow('sc', false, 2000, true);
  await sleep(200);
}

/** Poll until axis reaches target state or timeout. */
export async function waitForAxisState(
  targetState: number,
  timeoutMs: number,
  useNow = false,
): Promise<{ reached: boolean; finalState: number }> {
  const read = useNow
    ? (cmd: string) => serialService.commandNow(cmd, true, 4000, false)
    : (cmd: string) => serialService.sendCommand(cmd, true, 4000, false);
  const start = Date.now();
  let finalState = 0;
  while (Date.now() - start < timeoutMs) {
    const raw = await read('r axis0.current_state');
    finalState = parseIntField(raw);
    if (finalState === targetState) {
      return { reached: true, finalState };
    }
    await sleep(500);
  }
  return { reached: false, finalState };
}

/** Poll until axis returns to IDLE (state 1) or timeout. */
export async function waitForAxisIdle(timeoutMs: number, useNow = false): Promise<{ idle: boolean; finalState: number }> {
  const result = await waitForAxisState(1, timeoutMs, useNow);
  return { idle: result.reached, finalState: result.finalState };
}

export async function runAxisState(
  stateNum: number,
  timeoutMs: number,
  clearFirst = true,
  onProgress?: (step: CalibrationProgress, detail?: string) => void,
  successState?: number,
): Promise<CalibrationRunResult> {
  if (!serialService.isConnected) {
    return { ok: false, reason: 'not_connected', axisErr: 0, motorErr: 0, encErr: 0 };
  }

  return serialService.runAtomic(async () => {
    if (clearFirst) {
      onProgress?.('clearing');
      await clearErrorsNow();
    }

    onProgress?.('starting', String(stateNum));
    try {
      await serialService.writeOdriveNow(`w axis0.requested_state ${stateNum}`, true);
    } catch (error) {
      return {
        ok: false,
        reason: 'write_failed',
        axisErr: 0,
        motorErr: 0,
        encErr: 0,
      };
    }

    await sleep(500);
    onProgress?.('running', String(stateNum));
    const targetState = successState ?? 1;
    const { reached, finalState } = await waitForAxisState(targetState, timeoutMs, true);
    onProgress?.('checking');
    const errors = await readAxisErrorsNow();
    const ok = reached && errors.axisErr === 0 && errors.motorErr === 0 && errors.encErr === 0;

    return {
      ok,
      reason: ok ? undefined : !reached ? 'timeout' : 'errors',
      finalState,
      ...errors,
    };
  });
}

export async function readMotorCalResults(): Promise<{
  resistance: string | null;
  inductance: string | null;
  rawResistance: string | null;
  rawInductance: string | null;
}> {
  try {
    const [rRaw, lRaw] = await Promise.all([
      serialService.sendCommand('r axis0.motor.config.phase_resistance', true, 4000, false),
      serialService.sendCommand('r axis0.motor.config.phase_inductance', true, 4000, false),
    ]);
    const r = parseFloat(rRaw.trim().split(/\s+/)[0]);
    const l = parseFloat(lRaw.trim().split(/\s+/)[0]);
    return {
      resistance: Number.isFinite(r) ? `${r.toFixed(4)} Ω` : null,
      inductance: Number.isFinite(l) ? `${(l * 1e6).toFixed(2)} µH` : null,
      rawResistance: Number.isFinite(r) ? String(r) : null,
      rawInductance: Number.isFinite(l) ? String(l) : null,
    };
  } catch {
    return { resistance: null, inductance: null, rawResistance: null, rawInductance: null };
  }
}

export async function readEncoderCalResults(): Promise<{
  phaseOffset: string | null;
  phaseOffsetFloat: string | null;
  isReady: string | null;
}> {
  try {
    const [offsetRaw, offsetFloatRaw, readyRaw] = await Promise.all([
      serialService.sendCommand('r axis0.encoder.config.phase_offset', true, 4000, false),
      serialService.sendCommand('r axis0.encoder.config.phase_offset_float', true, 4000, false),
      serialService.sendCommand('r axis0.encoder.is_ready', true, 4000, false),
    ]);
    const offset = parseIntField(offsetRaw);
    const offsetFloat = parseFloat(offsetFloatRaw.trim().split(/\s+/)[0]);
    const ready = readyRaw.trim().toLowerCase();
    return {
      phaseOffset: Number.isFinite(offset) ? String(offset) : null,
      phaseOffsetFloat: Number.isFinite(offsetFloat) ? offsetFloat.toFixed(6) : null,
      isReady: ready === 'true' || ready === '1' ? 'true' : ready === 'false' || ready === '0' ? 'false' : null,
    };
  } catch {
    return { phaseOffset: null, phaseOffsetFloat: null, isReady: null };
  }
}
