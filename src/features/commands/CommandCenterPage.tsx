import { useMemo, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { localizeCommand } from '../../i18n/commandMeta';
import { translate } from '../../i18n/messages';
import { boardCommands, type BoardCommand } from '../../domain/commands/commandRegistry';
import { serialService } from '../serial/SerialService';
import { assessCalibrationIntegrity, shouldBlockSave } from '../calibration/calibrationIntegrity';
import { Card } from '../../shared/ui';

const categoryKeys = {
  safety: 'commandCategorySafety',
  calibration: 'commandCategoryCalibration',
  ffb: 'commandCategoryFfb',
  system: 'commandCategorySystem',
  diagnostics: 'commandCategoryDiagnostics',
} as const;

function isIntegritySensitive(command: BoardCommand): boolean {
  const cmd = command.command.trim();
  return (
    cmd === 'ss' ||
    cmd === 'se' ||
    cmd === 'sys.eeformat!' ||
    /requested_state\s+8\b/.test(cmd)
  );
}

export function CommandCenterPage() {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const integrityBlocked = shouldBlockSave(
    assessCalibrationIntegrity(state.fieldValues, state.dirtyPaths, state.nvmPendingPaths),
  );

  const commands = useMemo(
    () =>
      boardCommands.filter((command) => {
        if (!normalizedQuery) return true;
        const localized = localizeCommand(locale, command);
        const category = translate(locale, categoryKeys[command.category]);
        const haystack = `${localized.label} ${localized.description} ${command.command} ${category}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      }),
    [locale, normalizedQuery],
  );

  async function run(command: BoardCommand) {
    if (isIntegritySensitive(command) && integrityBlocked) {
      const ok = window.confirm(translate(locale, 'commandIntegrityConfirm', { command: command.command }));
      if (!ok) {
        return;
      }
    }
    dispatch({ type: 'set-busy', busy: true });
    try {
      await serialService.sendCommand(command.command, command.expectReply ?? true, command.timeoutMs ?? 2500);
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  return (
    <Card title={translate(locale, 'commandCenterTitle')} description={translate(locale, 'commandCenterDescription')}>
      <div className="config-filterbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={translate(locale, 'commandCenterSearchPlaceholder')}
        />
        <span>{translate(locale, 'commandCenterCount', { n: commands.length })}</span>
      </div>
      <div className="command-grid">
        {commands.map((command) => {
          const localized = localizeCommand(locale, command);
          return (
          <button
            type="button"
            key={command.id}
            className={command.danger ? 'danger command-card' : 'command-card'}
            disabled={!state.connected || state.busy}
            onClick={() => void run(command)}
          >
            <span>{translate(locale, categoryKeys[command.category])}</span>
            <strong>{localized.label}</strong>
            <p>{localized.description}</p>
            <code>{command.command}</code>
          </button>
          );
        })}
      </div>
    </Card>
  );
}
