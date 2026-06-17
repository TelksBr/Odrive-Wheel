import { useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { rebootToDfu } from '../board/BoardProtocol';
import { dfuService } from './DfuService';
import { Card, Pill } from '../../shared/ui';

export function DfuPage() {
  const { state, dispatch } = useAppState();
  const [bootloader, setBootloader] = useState('');
  const [firmware, setFirmware] = useState<ArrayBuffer | null>(null);
  const [firmwareName, setFirmwareName] = useState('');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState(translate(state.locale, 'dfuIdle'));

  function report(nextMessage: string, nextProgress = progress) {
    setMessage(nextMessage);
    setProgress(Math.round(nextProgress));
    dispatch({ type: 'append-log', direction: 'info', message: nextMessage });
  }

  async function run(action: () => Promise<void>) {
    dispatch({ type: 'set-busy', busy: true });
    try {
      await action();
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  return (
    <Card title={translate(state.locale, 'dfu')} description={translate(state.locale, 'dfuDescription')}>
      {!state.usbSupported ? <p className="warning">{translate(state.locale, 'noUsb')}</p> : null}
      <div className="status-row">
        <Pill tone={bootloader ? 'ok' : 'neutral'}>{bootloader || translate(state.locale, 'dfuBootloaderNotSelected')}</Pill>
        <Pill tone={firmware ? 'ok' : 'neutral'}>{firmwareName || translate(state.locale, 'dfuNoFirmwareSelected')}</Pill>
      </div>
      <div className="toolbar">
        <button type="button" disabled={!state.connected || state.busy} onClick={() => void run(() => rebootToDfu())}>
          {translate(state.locale, 'dfuRebootToDfu')}
        </button>
        <button
          type="button"
          disabled={!state.usbSupported || state.busy}
          onClick={() =>
            void run(async () => {
              setBootloader(await dfuService.requestBootloader());
            })
          }
        >
          {translate(state.locale, 'findBootloader')}
        </button>
        <label className="button-like">
          {translate(state.locale, 'chooseFirmware')}
          <input
            type="file"
            accept=".bin,application/octet-stream"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              setFirmwareName(file.name);
              void file.arrayBuffer().then(setFirmware);
            }}
          />
        </label>
        <button
          type="button"
          className="ok"
          disabled={!firmware || state.busy}
          onClick={() =>
            void run(async () => {
              if (firmware) {
                await dfuService.flash(firmware, report);
              }
            })
          }
        >
          {translate(state.locale, 'flashFirmware')}
        </button>
      </div>
      <div className="progress">
        <div style={{ width: `${progress}%` }} />
      </div>
      <p className="muted">{message}</p>
    </Card>
  );
}
