import { useAppState } from '../../app/AppState';
import { commandsByCategory, type BoardCommand, type CommandCategory } from '../../domain/commands/commandRegistry';
import { serialService } from '../serial/SerialService';

export function QuickActions({ categories = ['safety', 'calibration', 'ffb'] }: { categories?: CommandCategory[] }) {
  const { state, dispatch } = useAppState();
  const actions = categories.flatMap((category) => commandsByCategory(category));

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

  return (
    <div className="quick-actions-grid">
      {actions.map((action) => (
        <button
          type="button"
          key={action.command}
          disabled={!state.connected || state.busy}
          className={action.danger ? 'danger quick-action' : 'quick-action'}
          onClick={() => void run(action)}
        >
          <strong>{action.label}</strong>
          <span>{action.description}</span>
          <code>{action.command}</code>
        </button>
      ))}
    </div>
  );
}
