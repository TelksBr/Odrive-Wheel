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
  reason?: 'not_connected' | 'timeout' | 'errors';
}

export async function readAxisErrors(): Promise<AxisErrorSnapshot> {
  const [axisRaw, motorRaw, encRaw] = await Promise.all([
    serialService.sendCommand('r axis0.error', true, 2500, false),
    serialService.sendCommand('r axis0.motor.error', true, 2500, false),
    serialService.sendCommand('r axis0.encoder.error', true, 2500, false),
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

/** Poll until axis returns to IDLE (state 1) or timeout. */
export async function waitForAxisIdle(timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const raw = await serialService.sendCommand('r axis0.current_state', true, 2500, false);
    if (parseIntField(raw) === 1) {
      return true;
    }
    await sleep(500);
  }
  return false;
}

export async function runAxisState(
  stateNum: number,
  timeoutMs: number,
  clearFirst = true,
): Promise<CalibrationRunResult> {
  if (!serialService.isConnected) {
    return { ok: false, reason: 'not_connected', axisErr: 0, motorErr: 0, encErr: 0 };
  }

  if (clearFirst) {
    await clearErrors();
  }

  await serialService.sendCommand(`w axis0.requested_state ${stateNum}`, false, 2000, true);
  await sleep(500);

  const idle = await waitForAxisIdle(timeoutMs);
  const errors = await readAxisErrors();
  const ok = idle && errors.axisErr === 0 && errors.motorErr === 0 && errors.encErr === 0;

  return {
    ok,
    reason: ok ? undefined : idle ? 'errors' : 'timeout',
    ...errors,
  };
}

export async function readMotorCalResults(): Promise<{ resistance: string | null; inductance: string | null }> {
  try {
    const [rRaw, lRaw] = await Promise.all([
      serialService.sendCommand('r axis0.motor.config.phase_resistance', true, 2500, false),
      serialService.sendCommand('r axis0.motor.config.phase_inductance', true, 2500, false),
    ]);
    const r = parseFloat(rRaw.trim().split(/\s+/)[0]);
    const l = parseFloat(lRaw.trim().split(/\s+/)[0]);
    return {
      resistance: Number.isFinite(r) ? `${r.toFixed(4)} Ω` : null,
      inductance: Number.isFinite(l) ? `${(l * 1e6).toFixed(2)} µH` : null,
    };
  } catch {
    return { resistance: null, inductance: null };
  }
}
