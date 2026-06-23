import { useMemo } from 'react';
import { useAppState } from '../../app/AppState';
import { readField } from '../board/BoardProtocol';
import { applyConfigFields, applyOpenffboardRam } from '../board/fieldApply';
import type { ConfigField } from '../config/fieldCatalog';
import {
  channelValue,
  createGpioChannel,
  GPIO_CHANNELS,
  writableChannelFields,
  type GpioChannel,
} from '../inputs/gpioChannel';
import { InputChannelPanel } from '../inputs/InputChannelPanel';
import { useGpioAnalogProcessor } from '../inputs/useGpioAnalogProcessor';
import { useInputsLivePoller } from '../inputs/useInputsLivePoller';
import { translate } from '../../i18n/messages';
import { SectionHeader } from '../../shared/ui';
import { toast } from '../../shared/toastActions';

export function InputsWorkspace() {
  const { state, dispatch } = useAppState();
  const channels = useMemo(() => GPIO_CHANNELS.map(createGpioChannel), []);
  const { liveValues, polling } = useInputsLivePoller(channels, state.connected, state.busy);
  const processor = useGpioAnalogProcessor();

  const analogProcessorProps = {
    filterOn: processor.filterOn,
    cutoffRaw: processor.cutoffRaw,
    cutoffValid: processor.cutoffValid,
    cutoffNum: processor.cutoffNum,
    processorDisabled: processor.disabled,
    onToggleFilter: processor.toggleFilter,
    onCutoffChange: processor.setCutoffDraft,
    onCutoffCommit: processor.flushCutoff,
    onCutoffPreset: (hz: number) => void processor.commitCutoff(String(hz)),
  };

  const mergedValues = useMemo(
    () => ({ ...state.fieldValues, ...liveValues }),
    [state.fieldValues, liveValues],
  );

  const analogCount = channels.filter((ch) => channelValue(ch, 'mode', mergedValues) === '2').length;
  const liveCount = channels.filter((ch) => channelValue(ch, 'cur', mergedValues) !== '').length;
  const dirtyCount = channels.filter((ch) =>
    Object.values(ch.fields).some((field) => state.dirtyPaths.includes(field.path)),
  ).length;

  const disabled = !state.connected || state.busy;

  async function readChannel(channel: GpioChannel) {
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
      await processor.reload();
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function applyChannel(channel: GpioChannel) {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const entries = writableChannelFields(channel).map((field) => ({
        field,
        value: state.fieldValues[field.path] ?? '',
      }));
      const result = await applyConfigFields(entries);
      for (const [path, applied] of Object.entries(result.applied)) {
        dispatch({ type: 'set-field', path, value: applied, dirty: false });
      }
      const suffix = result.persistedFfb
        ? translate(state.locale, 'applyLogFfbEepromOk')
        : result.hasFfbFields
          ? translate(state.locale, 'applyLogFfbEepromFail')
          : translate(state.locale, 'applyLogOdriveRam');
      dispatch({
        type: 'append-log',
        direction: 'rx',
        message: `${translate(state.locale, 'logGpioApplied', { n: channel.gpio })} — ${suffix}`,
      });
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  function setValue(field: ConfigField, value: string) {
    dispatch({ type: 'set-field', path: field.path, value });
  }

  function capture(channel: GpioChannel, target: 'amin' | 'amax') {
    const current = channelValue(channel, 'cur', mergedValues);
    if (!current) {
      return;
    }
    setValue(channel.fields[target], current);
  }

  async function resetMinMax(channel: GpioChannel) {
    if (
      !window.confirm(translate(state.locale, 'inputsResetMinMaxConfirm', { n: channel.gpio }))
    ) {
      return;
    }
    dispatch({ type: 'set-busy', busy: true });
    try {
      const applied = await applyOpenffboardRam([
        { field: channel.fields.amin, value: '4095' },
        { field: channel.fields.amax, value: '0' },
      ]);
      for (const [path, value] of Object.entries(applied)) {
        dispatch({ type: 'set-field', path, value, dirty: false });
        dispatch({ type: 'mark-nvm-pending-path', path });
      }
      toast(dispatch, translate(state.locale, 'inputsResetMinMaxDone', { n: channel.gpio }), 'ok');
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
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
                {translate(state.locale, 'inputsLiveBadge')}
              </span>
            )}
            <button type="button" disabled={disabled} onClick={() => void readAllInputs()}>
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
        {channels.map((channel) => {
          const isAnalog = channelValue(channel, 'mode', mergedValues) === '2';
          return (
          <InputChannelPanel
            key={channel.gpio}
            channel={channel}
            disabled={disabled}
            values={mergedValues}
            dirtyPaths={state.dirtyPaths}
            locale={state.locale}
            analogProcessor={isAnalog ? analogProcessorProps : undefined}
            onRead={() => void readChannel(channel)}
            onApply={() => void applyChannel(channel)}
            onCaptureMin={() => capture(channel, 'amin')}
            onCaptureMax={() => capture(channel, 'amax')}
            onResetMinMax={() => void resetMinMax(channel)}
            onChange={setValue}
          />
          );
        })}
      </div>
    </div>
  );
}

function InputKpi({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'ok' | 'warn' }) {
  return (
    <div className={`input-kpi ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
