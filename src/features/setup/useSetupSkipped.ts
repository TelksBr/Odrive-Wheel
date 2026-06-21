import { useCallback, useEffect, useState } from 'react';
import type { SetupStepId } from './setupSteps';

const STORAGE_KEY = 'wheelforge-setup-skipped';

function readSkipped(): Set<SetupStepId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw) as SetupStepId[];
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

function writeSkipped(ids: Set<SetupStepId>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export function useSetupSkipped() {
  const [skipped, setSkipped] = useState<Set<SetupStepId>>(readSkipped);

  useEffect(() => {
    writeSkipped(skipped);
  }, [skipped]);

  const skipStep = useCallback((id: SetupStepId) => {
    setSkipped((prev) => new Set([...prev, id]));
  }, []);

  const unskipStep = useCallback((id: SetupStepId) => {
    setSkipped((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const isSkipped = useCallback((id: SetupStepId) => skipped.has(id), [skipped]);

  const resetSkipped = useCallback(() => {
    setSkipped(new Set());
  }, []);

  return { skipped, skipStep, unskipStep, isSkipped, resetSkipped };
}
