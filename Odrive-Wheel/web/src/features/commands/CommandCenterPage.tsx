import { useMemo, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { boardCommands } from '../../domain/commands/commandRegistry';
import { serialService } from '../serial/SerialService';
import { Card } from '../../shared/ui';

const categoryLabels = {
  safety: 'Safety',
  calibration: 'Calibration',
  ffb: 'FFB',
  system: 'System',
  diagnostics: 'Diagnostics',
};

export function CommandCenterPage() {
  const { state, dispatch } = useAppState();
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();

  const commands = useMemo(
    () =>
      boardCommands.filter(
        (command) =>
          !normalizedQuery ||
          command.label.toLowerCase().includes(normalizedQuery) ||
          command.command.toLowerCase().includes(normalizedQuery) ||
          command.description.toLowerCase().includes(normalizedQuery) ||
          categoryLabels[command.category].toLowerCase().includes(normalizedQuery),
      ),
    [normalizedQuery],
  );

  async function run(command: (typeof boardCommands)[number]) {
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
    <Card title="Command Center" description="Firmware commands as a searchable, reusable operation layer.">
      <div className="config-filterbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search commands, categories or raw strings" />
        <span>{commands.length} commands</span>
      </div>
      <div className="command-grid">
        {commands.map((command) => (
          <button
            type="button"
            key={command.id}
            className={command.danger ? 'danger command-card' : 'command-card'}
            disabled={!state.connected || state.busy}
            onClick={() => void run(command)}
          >
            <span>{categoryLabels[command.category]}</span>
            <strong>{command.label}</strong>
            <p>{command.description}</p>
            <code>{command.command}</code>
          </button>
        ))}
      </div>
    </Card>
  );
}
