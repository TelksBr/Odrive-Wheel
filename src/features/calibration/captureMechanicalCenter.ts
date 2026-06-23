import type { Dispatch } from 'react';
import type { AppAction } from '../../app/types';
import { persistFfbEeprom } from '../board/fieldApply';
import { serialService } from '../serial/SerialService';
import { persistWorkflowPaths } from './calibrationPersist';
import { writePath } from './calibrationPresets';

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const INDEX_OFFSET_PATH = 'axis0.encoder.config.index_offset';

function parseFloatField(raw: string): number {
  const value = Number(raw.trim().split(/\s+/)[0]);
  return Number.isFinite(value) ? value : NaN;
}

async function readPropNow(path: string): Promise<string> {
  return serialService.commandNow(`r ${path}`, true, 4000, false);
}

/**
 * odrive-wheel.html "Capturar centro mecânico":
 * index_offset_new = index_offset_current − pos_estimate (turns)
 */
export async function captureMechanicalCenter(dispatch: Dispatch<AppAction>): Promise<{ ok: boolean; indexOffset: number }> {
  const { formatted, newOffset } = await serialService.runAtomic(async () => {
    await serialService.writeOdriveNow('w axis0.requested_state 1', false);
    await sleep(300);

    await serialService.commandNow('axis.zeroofs=0', true, 3000, false).catch(() => undefined);
    await sleep(150);

    const posRaw = await readPropNow('axis0.encoder.pos_estimate');
    const pos = parseFloatField(posRaw);
    if (!Number.isFinite(pos)) {
      throw new Error('encCapInvalidPos');
    }

    const offRaw = await readPropNow(INDEX_OFFSET_PATH);
    const currentOffset = parseFloatField(offRaw) || 0;
    const newOffset = currentOffset - pos;
    const formatted = newOffset.toFixed(7);

    await serialService.writeOdriveNow(`w ${INDEX_OFFSET_PATH} ${formatted}`, true);
    return { formatted, newOffset };
  });

  dispatch({ type: 'set-field', path: INDEX_OFFSET_PATH, value: formatted, dirty: false });
  dispatch({ type: 'mark-nvm-pending-path', path: INDEX_OFFSET_PATH });

  await persistFfbEeprom();
  const fieldValues: Record<string, string> = { [INDEX_OFFSET_PATH]: formatted };
  const { ok } = await persistWorkflowPaths([INDEX_OFFSET_PATH], fieldValues, dispatch);

  return { ok, indexOffset: newOffset };
}

export async function disarmForCenterCapture(dispatch: Dispatch<AppAction>): Promise<void> {
  await writePath('axis0.requested_state', '1', dispatch, { markNvmPending: false });
}

export async function readEncoderPositionDeg(): Promise<number | null> {
  try {
    const raw = await serialService.sendCommand('r axis0.encoder.pos_estimate', true, 4000, false);
    const turns = parseFloatField(raw);
    if (!Number.isFinite(turns)) {
      return null;
    }
    return turns * 360;
  } catch {
    return null;
  }
}

export async function readIndexOffsetDeg(): Promise<number | null> {
  try {
    const raw = await serialService.sendCommand(`r ${INDEX_OFFSET_PATH}`, true, 4000, false);
    const turns = parseFloatField(raw);
    if (!Number.isFinite(turns)) {
      return null;
    }
    return turns * 360;
  } catch {
    return null;
  }
}
