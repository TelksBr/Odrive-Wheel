import { useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { serialService } from '../serial/SerialService';
import { Card } from '../../shared/ui';

export function ConsolePage() {
  const { state, dispatch } = useAppState();
  const [command, setCommand] = useState('');

  async function send() {
    try {
      await serialService.sendCommand(command, true);
      setCommand('');
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <Card title={translate(state.locale, 'console')} description={translate(state.locale, 'consoleDescription')}>
      <div className="console-input">
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void send();
            }
          }}
          placeholder={translate(state.locale, 'commandPlaceholder')}
        />
        <button type="button" disabled={!state.connected || !command.trim()} onClick={() => void send()}>
          {translate(state.locale, 'send')}
        </button>
        <button type="button" onClick={() => dispatch({ type: 'clear-log' })}>
          {translate(state.locale, 'consoleClear')}
        </button>
      </div>
      <div className="console-log">
        {state.logs.map((entry) => (
          <div key={entry.id} className={`log-line log-${entry.direction}`}>
            <span>{entry.timestamp}</span>
            <strong>{entry.direction.toUpperCase()}</strong>
            <code>{entry.message}</code>
          </div>
        ))}
      </div>
    </Card>
  );
}
