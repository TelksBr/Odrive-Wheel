import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useAppState } from '../../app/AppState';
import { readField, writeField } from '../board/BoardProtocol';
import { flatFields, type ConfigField } from '../config/fieldCatalog';
import { ConfigPage } from '../config/ConfigPage';
import { translate } from '../../i18n/messages';
import { Card, Pill, SectionHeader } from '../../shared/ui';

const GPIO_CHANNELS = [1, 2, 3, 4] as const;
type GpioChannel = (typeof GPIO_CHANNELS)[number];
type ChannelField = 'mode' | 'idx' | 'invert' | 'amin' | 'amax' | 'cur';

interface InputChannel {
  gpio: GpioChannel;
  fields: Record<ChannelField, ConfigField>;
}

/**
 * Polls only the `cur` field for every channel as fast as the serial port allows
 * (~60 Hz target). Values are kept in local state to avoid flooding the global store.
 */
function useInputsLivePoller(
  channels: InputChannel[],
  connected: boolean,
): { curValues: Record<string, string>; polling: boolean } {
  const [curValues, setCurValues] = useState<Record<string, string>>({});
  const [polling, setPolling] = useState(false);
  const activeRef = useRef(false);
  const rafRef = useRef<number>(0);

  // Stable reference to the cur fields — rebuilt only when channels change
  const curFields = useMemo(() => channels.map((ch) => ch.fields.cur), [channels]);

  const runLoop = useCallback(async () => {
    if (!activeRef.current) {
      return;
    }

    const updates: Record<string, string> = {};
    for (const field of curFields) {
      if (!activeRef.current) {
        break;
      }
      try {
        const value = await readField(field);
        updates[field.path] = value;
      } catch {
        // silently skip on timeout/disconnect; the loop will stop on the next
        // iteration if the port closed
      }
    }

    if (activeRef.current && Object.keys(updates).length > 0) {
      setCurValues((prev) => ({ ...prev, ...updates }));
    }

    if (activeRef.current) {
      // Schedule next iteration via rAF so the browser can breathe between frames
      rafRef.current = requestAnimationFrame(() => void runLoop());
    }
  }, [curFields]);

  useEffect(() => {
    if (!connected) {
      activeRef.current = false;
      setPolling(false);
      cancelAnimationFrame(rafRef.current);
      return;
    }

    activeRef.current = true;
    setPolling(true);
    rafRef.current = requestAnimationFrame(() => void runLoop());

    return () => {
      activeRef.current = false;
      setPolling(false);
      cancelAnimationFrame(rafRef.current);
    };
  }, [connected, runLoop]);

  return { curValues, polling };
}

export function InputsWorkspace() {
  const { state, dispatch } = useAppState();
  const channels = useMemo(() => GPIO_CHANNELS.map(createChannel), []);
  const { curValues, polling } = useInputsLivePoller(channels, state.connected);
  // Merge live cur values over global field values so components always see
  // the latest reading without the global store receiving high-frequency updates.
  const mergedValues = useMemo(
    () => ({ ...state.fieldValues, ...curValues }),
    [state.fieldValues, curValues],
  );

  const analogCount = channels.filter((channel) => valueFor(channel, 'mode', mergedValues) === '2').length;
  const liveCount = channels.filter((channel) => valueFor(channel, 'cur', mergedValues) !== '').length;
  const dirtyCount = channels.filter((channel) => Object.values(channel.fields).some((field) => state.dirtyPaths.includes(field.path))).length;

  async function readChannel(channel: InputChannel) {
    dispatch({ type: 'set-busy', busy: true });
    try {
      for (const field of Object.values(channel.fields)) {
        const value = await readField(field);
        dispatch({ type: 'set-field', path: field.path, value, dirty: false });
      }
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function readAllInputs() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      for (const channel of channels) {
        for (const field of Object.values(channel.fields)) {
          const value = await readField(field);
          dispatch({ type: 'set-field', path: field.path, value, dirty: false });
        }
      }
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function applyChannel(channel: InputChannel) {
    dispatch({ type: 'set-busy', busy: true });
    try {
      for (const field of writableFields(channel)) {
        await writeField(field, state.fieldValues[field.path] ?? '');
        dispatch({ type: 'set-field', path: field.path, value: state.fieldValues[field.path] ?? '', dirty: false });
      }
      dispatch({ type: 'append-log', direction: 'info', message: `GPIO ${channel.gpio} applied` });
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  function setValue(field: ConfigField, value: string) {
    dispatch({ type: 'set-field', path: field.path, value });
  }

  function capture(channel: InputChannel, target: 'amin' | 'amax') {
    const current = valueFor(channel, 'cur', mergedValues);
    if (!current) {
      return;
    }
    setValue(channel.fields[target], current);
  }

  return (
    <div className="inputs-page">
      <SectionHeader
        eyebrow={translate(state.locale, 'inputsHeroEyebrow')}
        title={translate(state.locale, 'inputsHeroTitle')}
        description={translate(state.locale, 'inputsHeroDescription')}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {polling && (
              <span className="pill pill-ok" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                ⬤ live
              </span>
            )}
            <button type="button" disabled={!state.connected || state.busy} onClick={() => void readAllInputs()}>
              {translate(state.locale, 'inputsReadAll')}
            </button>
          </div>
        }
      />

      <div className="inputs-kpis">
        <InputKpi label={translate(state.locale, 'inputsConfiguredAxes')} value={String(analogCount)} />
        <InputKpi label={translate(state.locale, 'inputsLiveSignals')} value={`${liveCount}/4`} tone={liveCount > 0 ? 'ok' : 'neutral'} />
        <InputKpi label={translate(state.locale, 'inputsDirtyChannels')} value={String(dirtyCount)} tone={dirtyCount > 0 ? 'warn' : 'ok'} />
      </div>

      <div className="input-channel-grid">
        {channels.map((channel) => (
          <InputChannelCard
            key={channel.gpio}
            channel={channel}
            disabled={!state.connected || state.busy}
            values={mergedValues}
            dirtyPaths={state.dirtyPaths}
            locale={state.locale}
            onRead={() => void readChannel(channel)}
            onApply={() => void applyChannel(channel)}
            onCaptureMin={() => capture(channel, 'amin')}
            onCaptureMax={() => capture(channel, 'amax')}
            onChange={setValue}
          />
        ))}
      </div>

      <details className="inputs-advanced">
        <summary>
          <strong>{translate(state.locale, 'inputsAdvancedTitle')}</strong>
          <span>{translate(state.locale, 'inputsAdvancedDescription')}</span>
        </summary>
        <ConfigPage filter="ffb" includeGroups={['inputs']} />
      </details>
    </div>
  );
}

function InputChannelCard({
  channel,
  disabled,
  values,
  dirtyPaths,
  locale,
  onRead,
  onApply,
  onCaptureMin,
  onCaptureMax,
  onChange,
}: {
  channel: InputChannel;
  disabled: boolean;
  values: Record<string, string>;
  dirtyPaths: string[];
  locale: 'pt' | 'en';
  onRead: () => void;
  onApply: () => void;
  onCaptureMin: () => void;
  onCaptureMax: () => void;
  onChange: (field: ConfigField, value: string) => void;
}) {
  const mode = valueFor(channel, 'mode', values);
  const raw = numberValue(valueFor(channel, 'cur', values));
  const min = numberValue(valueFor(channel, 'amin', values)) ?? 0;
  const max = numberValue(valueFor(channel, 'amax', values)) ?? 4095;
  const normalized = raw === undefined || max <= min ? undefined : Math.max(0, Math.min(100, ((raw - min) / (max - min)) * 100));
  const dirty = Object.values(channel.fields).some((field) => dirtyPaths.includes(field.path));

  return (
    <Card title={`GPIO ${channel.gpio}`} description={modeLabel(locale, mode)}>
      <div className="input-meter">
        <div className="input-meter-readout">
          <span>{translate(locale, 'inputsRaw')}</span>
          <strong>{raw ?? translate(locale, 'inputsNoValue')}</strong>
          <Pill tone={dirty ? 'warn' : mode === '2' ? 'ok' : 'neutral'}>{dirty ? 'modified' : modeLabel(locale, mode)}</Pill>
        </div>
        <div className="input-meter-track" aria-label={`${translate(locale, 'inputsNormalized')} ${normalized?.toFixed(0) ?? 0}%`}>
          <div style={{ width: `${normalized ?? 0}%` }} />
        </div>
        <div className="input-meter-scale">
          <span>{min}</span>
          <span>{normalized === undefined ? '--' : `${normalized.toFixed(0)}%`}</span>
          <span>{max}</span>
        </div>
      </div>

      <div className="input-control-grid">
        <label>
          <span>{translate(locale, 'inputsMode')}</span>
          <select value={mode} onChange={(event) => onChange(channel.fields.mode, event.target.value)}>
            <option value="">-</option>
            <option value="0">{translate(locale, 'inputModeDisabled')}</option>
            <option value="1">{translate(locale, 'inputModeButton')}</option>
            <option value="2">{translate(locale, 'inputModeAnalog')}</option>
            <option value="3">{translate(locale, 'inputModeZero')}</option>
          </select>
        </label>
        <label>
          <span>{translate(locale, 'inputsIndex')}</span>
          <input type="number" min={0} max={63} value={valueFor(channel, 'idx', values)} onChange={(event) => onChange(channel.fields.idx, event.target.value)} />
        </label>
        <label>
          <span>{translate(locale, 'inputsInvert')}</span>
          <select value={valueFor(channel, 'invert', values)} onChange={(event) => onChange(channel.fields.invert, event.target.value)}>
            <option value="">-</option>
            <option value="false">False</option>
            <option value="true">True</option>
          </select>
        </label>
        <label>
          <span>{translate(locale, 'inputsAnalogMin')}</span>
          <input type="number" min={0} max={4095} value={valueFor(channel, 'amin', values)} onChange={(event) => onChange(channel.fields.amin, event.target.value)} />
        </label>
        <label>
          <span>{translate(locale, 'inputsAnalogMax')}</span>
          <input type="number" min={0} max={4095} value={valueFor(channel, 'amax', values)} onChange={(event) => onChange(channel.fields.amax, event.target.value)} />
        </label>
      </div>

      <div className="input-channel-actions">
        <button type="button" disabled={disabled} onClick={onRead}>
          {translate(locale, 'inputsReadChannel')}
        </button>
        <button type="button" disabled={disabled || raw === undefined} onClick={onCaptureMin}>
          {translate(locale, 'inputsCaptureMin')}
        </button>
        <button type="button" disabled={disabled || raw === undefined} onClick={onCaptureMax}>
          {translate(locale, 'inputsCaptureMax')}
        </button>
        <button type="button" disabled={disabled || !dirty} onClick={onApply}>
          {translate(locale, 'inputsApplyChannel')}
        </button>
      </div>
    </Card>
  );
}

function createChannel(gpio: GpioChannel): InputChannel {
  return {
    gpio,
    fields: {
      mode: findField(gpio, 'mode'),
      idx: findField(gpio, 'idx'),
      invert: findField(gpio, 'invert'),
      amin: findField(gpio, 'amin'),
      amax: findField(gpio, 'amax'),
      cur: findField(gpio, 'cur'),
    },
  };
}

function findField(gpio: GpioChannel, name: ChannelField): ConfigField {
  const field = flatFields.find((item) => item.path === `gpio.${gpio}.${name}`);
  if (!field) {
    throw new Error(`Missing GPIO field gpio.${gpio}.${name}`);
  }
  return field;
}

function writableFields(channel: InputChannel): ConfigField[] {
  return [channel.fields.mode, channel.fields.idx, channel.fields.invert, channel.fields.amin, channel.fields.amax];
}

function valueFor(channel: InputChannel, field: ChannelField, values: Record<string, string>) {
  return values[channel.fields[field].path] ?? '';
}

function numberValue(value: string): number | undefined {
  if (value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function modeLabel(locale: 'pt' | 'en', mode: string) {
  if (mode === '1') {
    return translate(locale, 'inputModeButton');
  }
  if (mode === '2') {
    return translate(locale, 'inputModeAnalog');
  }
  if (mode === '3') {
    return translate(locale, 'inputModeZero');
  }
  return translate(locale, 'inputModeDisabled');
}

function InputKpi({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'ok' | 'warn' }) {
  return (
    <div className={`input-kpi ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
