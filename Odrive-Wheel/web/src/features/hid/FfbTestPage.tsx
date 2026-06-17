import { useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card, Pill, SectionHeader } from '../../shared/ui';
import { hidFfbService } from './HidFfbService';

type TestPresetId = 'spring' | 'constant-left' | 'constant-right' | 'pulse';
type LabStatus = 'idle' | 'running' | 'stopped' | 'disconnected';

export function FfbTestPage() {
  const { state, dispatch } = useAppState();
  const [deviceName, setDeviceName] = useState('');
  const [magnitude, setMagnitude] = useState(48);
  const [durationMs, setDurationMs] = useState(900);
  const [selectedPreset, setSelectedPreset] = useState<TestPresetId>('spring');
  const [status, setStatus] = useState<LabStatus>('disconnected');

  const presets = [
    {
      id: 'spring',
      title: translate(state.locale, 'ffbPresetSpring'),
      description: translate(state.locale, 'ffbPresetSpringDescription'),
      direction: 'center',
      duration: 1500,
    },
    {
      id: 'constant-left',
      title: translate(state.locale, 'ffbPresetConstantLeft'),
      description: translate(state.locale, 'ffbPresetConstantLeftDescription'),
      direction: '-',
      duration: 1000,
    },
    {
      id: 'constant-right',
      title: translate(state.locale, 'ffbPresetConstantRight'),
      description: translate(state.locale, 'ffbPresetConstantRightDescription'),
      direction: '+',
      duration: 1000,
    },
    {
      id: 'pulse',
      title: translate(state.locale, 'ffbPresetPulse'),
      description: translate(state.locale, 'ffbPresetPulseDescription'),
      direction: '+',
      duration: 250,
    },
  ] satisfies Array<{ id: TestPresetId; title: string; description: string; direction: string; duration: number }>;

  const activePreset = presets.find((preset) => preset.id === selectedPreset) ?? presets[0];
  const connected = Boolean(deviceName);

  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function connect() {
    const name = await hidFfbService.connect();
    setDeviceName(name);
    setStatus('idle');
  }

  async function disconnect() {
    await hidFfbService.disconnect();
    setDeviceName('');
    setStatus('disconnected');
  }

  async function stop() {
    await hidFfbService.stopAll();
    setStatus('stopped');
  }

  async function playPreset() {
    setStatus('running');
    const duration = selectedPreset === 'pulse' ? Math.min(durationMs, 450) : durationMs;
    if (selectedPreset === 'spring') {
      await hidFfbService.playSpring(magnitude * 2, duration);
    } else if (selectedPreset === 'constant-left') {
      await hidFfbService.playConstantForce(-magnitude, duration);
    } else if (selectedPreset === 'constant-right') {
      await hidFfbService.playConstantForce(magnitude, duration);
    } else {
      await hidFfbService.playPulse(magnitude, duration);
    }
    window.setTimeout(() => setStatus((current) => (current === 'running' ? 'idle' : current)), duration + 80);
  }

  return (
    <div className="ffb-lab-page">
      <SectionHeader
        eyebrow={translate(state.locale, 'ffbLabEyebrow')}
        title={translate(state.locale, 'ffbLabTitle')}
        description={translate(state.locale, 'ffbLabDescription')}
      />

      <div className="ffb-device-card">
        <span>{translate(state.locale, 'ffbHidDevice')}</span>
        <strong>{deviceName || translate(state.locale, 'ffbNoDevice')}</strong>
        <Pill tone={connected ? 'ok' : 'neutral'}>{translate(state.locale, statusKey(status))}</Pill>
      </div>

      {!state.hidSupported ? <p className="warning">{translate(state.locale, 'noHid')}</p> : null}

      <section className="ffb-lab-grid">
        <Card title={translate(state.locale, 'ffbLivePlan')} description={translate(state.locale, 'ffbSerialNote')}>
          <div className="ffb-preset-grid">
            {presets.map((preset) => (
              <button
                type="button"
                key={preset.id}
                className={`ffb-preset-card ${selectedPreset === preset.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedPreset(preset.id);
                  setDurationMs(preset.duration);
                }}
              >
                <strong>{preset.title}</strong>
                <span>{preset.description}</span>
                <code>{preset.direction} · {preset.duration}{translate(state.locale, 'ffbDurationMs')}</code>
              </button>
            ))}
          </div>
        </Card>

        <Card title={activePreset.title} description={activePreset.description}>
          <div className="ffb-control-stack">
            <label>
              <span>{translate(state.locale, 'ffbMagnitude')}</span>
              <input type="range" min="0" max="127" value={magnitude} onChange={(event) => setMagnitude(Number(event.target.value))} />
              <strong>{magnitude}/127</strong>
            </label>
            <label>
              <span>{translate(state.locale, 'ffbDuration')}</span>
              <input type="range" min="100" max="3000" step="50" value={durationMs} onChange={(event) => setDurationMs(Number(event.target.value))} />
              <strong>{durationMs}{translate(state.locale, 'ffbDurationMs')}</strong>
            </label>
          </div>
          <div className="ffb-lab-actions">
            <button type="button" disabled={!state.hidSupported || connected} onClick={() => void run(connect)}>
              {translate(state.locale, 'ffbConnectHid')}
            </button>
            <button type="button" disabled={!connected || status === 'running'} onClick={() => void run(playPreset)}>
              {translate(state.locale, 'ffbRunPreset')}
            </button>
            <button type="button" className="danger" disabled={!connected} onClick={() => void run(stop)}>
              {translate(state.locale, 'ffbStopNow')}
            </button>
            <button type="button" disabled={!connected} onClick={() => void run(disconnect)}>
              {translate(state.locale, 'ffbDisconnectHid')}
            </button>
          </div>
        </Card>

        <Card title={translate(state.locale, 'ffbSafetyTitle')}>
          <ol className="number-list compact">
            <li>{translate(state.locale, 'ffbSafety1')}</li>
            <li>{translate(state.locale, 'ffbSafety2')}</li>
            <li>{translate(state.locale, 'ffbSafety3')}</li>
          </ol>
        </Card>
      </section>
    </div>
  );
}

function statusKey(status: LabStatus) {
  if (status === 'running') {
    return 'ffbStatusRunning';
  }
  if (status === 'stopped') {
    return 'ffbStatusStopped';
  }
  if (status === 'disconnected') {
    return 'ffbStatusDisconnected';
  }
  return 'ffbStatusIdle';
}
