import { useAppState } from '../../app/AppState';
import { localizeCommand } from '../../i18n/commandMeta';
import {
  boardCommands,
  commandsByCategory,
  type BoardCommand,
  type CommandCategory,
} from '../../domain/commands/commandRegistry';
import { serialService } from '../serial/SerialService';

interface QuickActionsProps {
  categories?: CommandCategory[];
  /** When set, only these command ids are shown (order preserved). */
  ids?: string[];
  variant?: 'grid' | 'bar';
}

export function QuickActions({
  categories = ['safety', 'calibration', 'ffb'],
  ids,
  variant = 'grid',
}: QuickActionsProps) {
  const { state, dispatch } = useAppState();
  const actions = ids
    ? ids
        .map((id) => boardCommands.find((cmd) => cmd.id === id))
        .filter((cmd): cmd is BoardCommand => cmd !== undefined)
    : categories.flatMap((category) => commandsByCategory(category));

  async function run(action: BoardCommand) {
    dispatch({ type: 'set-busy', busy: true });
    try {
      await serialService.sendCommand(action.command, action.expectReply ?? true, action.timeoutMs ?? 2500);
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  if (variant === 'bar') {
    return (
      <div className="quick-actions-bar">
        {actions.map((action) => {
          const localized = localizeCommand(state.locale, action);
          return (
          <button
            type="button"
            key={action.id}
            disabled={!state.connected || state.busy}
            className={action.danger ? 'danger quick-action-btn' : 'quick-action-btn'}
            title={localized.description}
            onClick={() => void run(action)}
          >
            {localized.label}
          </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="quick-actions-grid">
      {actions.map((action) => {
        const localized = localizeCommand(state.locale, action);
        return (
        <button
          type="button"
          key={action.id}
          disabled={!state.connected || state.busy}
          className={action.danger ? 'danger quick-action' : 'quick-action'}
          onClick={() => void run(action)}
        >
          <strong>{localized.label}</strong>
          <span>{localized.description}</span>
          <code>{action.command}</code>
        </button>
        );
      })}
    </div>
  );
}
