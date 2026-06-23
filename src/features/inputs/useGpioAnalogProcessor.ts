import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { applyOpenffboardRam } from '../board/fieldApply';
import { readField } from '../board/BoardProtocol';
import type { ConfigField } from '../config/fieldCatalog';
import { flatFields } from '../config/fieldCatalog';

export const ANALOG_FILTER_PRESETS_HZ = [20, 30, 40, 60] as const;

const processorFields = {
  filter: field('axis.gpiofilt'),
  cutoff: field('axis.gpiofiltf'),
};

function field(path: string): ConfigField {
  const found = flatFields.find((item) => item.path === path);
  if (!found) {
    throw new Error(`Missing processor field: ${path}`);
  }
  return found;
}

export function parseGpioBool(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === '1';
}

export function useGpioAnalogProcessor() {
  const { state, dispatch } = useAppState();
  const [applying, setApplying] = useState(false);
  const cutoffDraftRef = useRef('');

  const filterOn = parseGpioBool(state.fieldValues['axis.gpiofilt'] ?? '');
  const cutoffRaw = state.fieldValues['axis.gpiofiltf'] ?? '60';
  const cutoffNum = Number(cutoffRaw);
  const cutoffValid = Number.isFinite(cutoffNum) && cutoffNum >= 0.5 && cutoffNum <= 500;
  const disabled = !state.connected || state.busy || applying;

  const applyRam = useCallback(
    async (entries: { field: ConfigField; value: string }[]) => {
      if (!state.connected || applying) {
        return;
      }
      setApplying(true);
      try {
        const applied = await applyOpenffboardRam(entries);
        for (const [path, value] of Object.entries(applied)) {
          dispatch({ type: 'set-field', path, value, dirty: false });
          dispatch({ type: 'mark-nvm-pending-path', path });
        }
      } catch (error) {
        dispatch({
          type: 'append-log',
          direction: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setApplying(false);
      }
    },
    [applying, dispatch, state.connected],
  );

  const reload = useCallback(async () => {
    if (!state.connected) {
      return;
    }
    try {
      for (const f of Object.values(processorFields)) {
        const value = await readField(f);
        dispatch({ type: 'set-field', path: f.path, value, dirty: false });
      }
    } catch {
      // firmware antigo sem rc12 — ignora silenciosamente
    }
  }, [dispatch, state.connected]);

  useEffect(() => {
    if (state.connected) {
      void reload();
    }
  }, [state.connected, reload]);

  const toggleFilter = useCallback(
    async (enabled: boolean) => {
      dispatch({ type: 'set-field', path: 'axis.gpiofilt', value: enabled ? 'true' : 'false' });
      await applyRam([{ field: processorFields.filter, value: enabled ? '1' : '0' }]);
    },
    [applyRam, dispatch],
  );

  const commitCutoff = useCallback(
    async (value: string) => {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0.5 || n > 500) {
        return;
      }
      const formatted = n.toFixed(1);
      dispatch({ type: 'set-field', path: 'axis.gpiofiltf', value: formatted });
      await applyRam([{ field: processorFields.cutoff, value: formatted }]);
    },
    [applyRam, dispatch],
  );

  const setCutoffDraft = useCallback(
    (value: string) => {
      cutoffDraftRef.current = value;
      dispatch({ type: 'set-field', path: 'axis.gpiofiltf', value });
    },
    [dispatch],
  );

  const flushCutoff = useCallback(() => {
    void commitCutoff(cutoffDraftRef.current || cutoffRaw);
  }, [commitCutoff, cutoffRaw]);

  return {
    filterOn,
    cutoffRaw,
    cutoffNum,
    cutoffValid,
    disabled,
    toggleFilter,
    setCutoffDraft,
    flushCutoff,
    commitCutoff,
    reload,
  };
}
