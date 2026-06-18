import { useEffect, useMemo, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card } from '../../shared/ui';
import {
  applyBootPersist,
  applyBootPreset,
  BOOT_FLAG_DEFS,
  parseBoolField,
  type BootFlagDef,
  type BootPresetId,
} from './calibrationBootPresets';
import { useBoardSave } from '../board/useBoardSave';

const groupTitleKey: Record<BootFlagDef['group'], string> = {
  precal: 'calBootGroupPrecal',
  startup: 'calBootGroupStartup',
  limits: 'calBootGroupLimits',
  index: 'calBootGroupIndex',
};

const groupOrder: BootFlagDef['group'][] = ['precal', 'startup', 'index', 'limits'];

function desiredFromState(path: string, fieldValues: Record<string, string>): boolean {
  return parseBoolField(fieldValues[path]);
}

export function BootFlagsPanel() {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const { saveAll, saveBadge, saveBlocked } = useBoardSave();
  const [draft, setDraft] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const def of BOOT_FLAG_DEFS) {
      next[def.path] = desiredFromState(def.path, state.fieldValues);
    }
    setDraft(next);
  }, [state.fieldValues]);

  const grouped = useMemo(() => {
    const map = new Map<BootFlagDef['group'], BootFlagDef[]>();
    for (const def of BOOT_FLAG_DEFS) {
      const list = map.get(def.group) ?? [];
      list.push(def);
      map.set(def.group, list);
    }
    return map;
  }, []);

  async function applyPreset(preset: BootPresetId) {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const { ok, fail } = await applyBootPreset(preset, dispatch, state.fieldValues);
      dispatch({
        type: 'append-log',
        direction: fail === 0 ? 'info' : 'error',
        message: translate(
          locale,
          preset === 'persistReady' ? 'calBootPresetPersistOk' : 'calBootPresetAutoCalOk',
          { ok: String(ok), fail: String(fail) },
        ),
      });
      if (fail === 0) {
        dispatch({ type: 'set-nvm-pending', pending: true });
      }
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function applyDraft() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const entries = BOOT_FLAG_DEFS.map((def) => ({
        path: def.path,
        labelKey: def.labelKey,
        value: draft[def.path] ?? false,
      }));
      const { ok, fail } = await applyBootPersist(entries, dispatch);
      dispatch({
        type: 'append-log',
        direction: fail === 0 ? 'info' : 'error',
        message: translate(locale, 'calBootApplied', { ok: String(ok), fail: String(fail) }),
      });
      if (fail === 0) {
        dispatch({ type: 'set-nvm-pending', pending: true });
      }
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  return (
    <Card title={translate(locale, 'calBootPanelTitle')} description={translate(locale, 'calBootPanelDesc')}>
      <p className="cal-boot-panel-note">{translate(locale, 'calBootPanelNote')}</p>

      <div className="cal-boot-presets">
        <button
          type="button"
          className="ok"
          disabled={!state.connected || state.busy}
          onClick={() => void applyPreset('persistReady')}
        >
          {translate(locale, 'calBootPresetPersist')}
        </button>
        <button
          type="button"
          className="warn"
          disabled={!state.connected || state.busy}
          onClick={() => void applyPreset('autoCalEveryBoot')}
        >
          {translate(locale, 'calBootPresetAutoCal')}
        </button>
      </div>

      <div className="cal-boot-flags-table">
        {groupOrder.map((group) => {
          const defs = grouped.get(group);
          if (!defs?.length) {
            return null;
          }
          return (
            <div key={group} className="cal-boot-flags-group">
              <div className="cal-boot-flags-group-title">{translate(locale, groupTitleKey[group])}</div>
              {defs.map((def) => {
                const live = desiredFromState(def.path, state.fieldValues);
                const checked = draft[def.path] ?? live;
                const synced = checked === live;
                return (
                  <label key={def.path} className={`cal-boot-flag-row${synced ? '' : ' dirty'}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!state.connected || state.busy}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, [def.path]: event.target.checked }))
                      }
                    />
                    <span className="cal-boot-flag-label">{translate(locale, def.labelKey)}</span>
                    <code className="cal-boot-flag-path">{def.path}</code>
                    <span className="cal-boot-flag-live" title={translate(locale, 'calBootFlagLive')}>
                      {live ? 'true' : 'false'}
                    </span>
                  </label>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        <button type="button" disabled={!state.connected || state.busy} onClick={() => void applyDraft()}>
          {translate(locale, 'calBootApplyCustom')}
        </button>
        <button type="button" className="ok" disabled={!state.connected || state.busy || saveBlocked} onClick={() => void saveAll()}>
          {translate(locale, 'calNvmSaveNow')}{saveBadge}
        </button>
        <span className="cal-boot-hint">{translate(locale, 'calBootSaveHint')}</span>
      </div>
    </Card>
  );
}
