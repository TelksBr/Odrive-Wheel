import { useAppState } from '../../app/AppState';
import { localizeCommand } from '../../i18n/commandMeta';
import { translate } from '../../i18n/messages';
import {
  boardCommands,
  commandsByCategory,
  type BoardCommand,
  type CommandCategory,
} from '../../domain/commands/commandRegistry';
import { formatSerialRxLine } from '../serial/serialLogFormat';
import { serialService } from '../serial/SerialService';
import { toastKey } from '../../shared/toastActions';
import { rebootAndDisconnect, rebootToDfuAndDisconnect } from './boardLifecycle';
import { clearOdriveRamPending } from './persistPending';

interface QuickActionsProps {
  categories?: CommandCategory[];
  /** When set, only these command ids are shown (order preserved). */
  ids?: string[];
  variant?: 'grid' | 'bar';
}

function disconnectsSerial(command: string): boolean {
  return command === 'sr' || command === 'sd' || command === 'se';
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
    if (!state.connected) {
      toastKey(dispatch, state.locale, 'connectFirst', 'error');
      return;
    }
    const localized = localizeCommand(state.locale, action);
    if (action.danger && !window.confirm(translate(state.locale, 'maintainConfirmCommand', { label: localized.label }))) {
      return;
    }

    dispatch({ type: 'set-busy', busy: true });
    try {
      if (action.id === 'reboot') {
        await rebootAndDisconnect();
        clearOdriveRamPending(dispatch);
        dispatch({
          type: 'append-log',
          direction: 'info',
          message: `${action.command} → OK`,
        });
        toastKey(dispatch, state.locale, 'rebootSent', 'info');
        return;
      }
      if (action.id === 'reboot-dfu') {
        await rebootToDfuAndDisconnect();
        clearOdriveRamPending(dispatch);
        dispatch({
          type: 'append-log',
          direction: 'info',
          message: `${action.command} → OK`,
        });
        toastKey(dispatch, state.locale, 'dfuRebootSent', 'info');
        return;
      }

      const expectReply = action.expectReply ?? true;
      const reply = await serialService.sendCommand(
        action.command,
        expectReply,
        action.timeoutMs ?? 2500,
      );
      if (expectReply && reply.trim()) {
        dispatch({
          type: 'append-log',
          direction: 'rx',
          message: formatSerialRxLine(reply, action.command),
        });
      } else {
        dispatch({
          type: 'append-log',
          direction: 'info',
          message: `${action.command} → OK`,
        });
      }

      if (disconnectsSerial(action.command)) {
        clearOdriveRamPending(dispatch);
        await serialService.disconnect().catch(() => undefined);
      }
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
