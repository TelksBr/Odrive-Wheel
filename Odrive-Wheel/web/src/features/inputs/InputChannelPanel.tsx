import { useMemo } from 'react';
import type { ConfigField } from '../config/fieldCatalog';
import { getFieldHelp } from '../config/fieldHelp';
import { translate, type Locale } from '../../i18n/messages';
import { localizeField, localizeOptionLabel } from '../../i18n/fieldMeta';
import { Card, Pill } from '../../shared/ui';
import { isButtonPressed } from './analogAxisMath';
import {
  channelModeLabel,
  channelValue,
  parseChannelNumber,
  type GpioChannel,
} from './gpioChannel';
import {
  ButtonInputControl,
  LinearAnalogAxis,
  ZeroWheelInputControl,
} from './InputControls';

interface InputChannelPanelProps {
  channel: GpioChannel;
  values: Record<string, string>;
  dirtyPaths: string[];
  locale: Locale;
  disabled: boolean;
  onChange: (field: ConfigField, value: string) => void;
  onRead: () => void;
  onApply: () => void;
  onCaptureMin: () => void;
  onCaptureMax: () => void;
}

export function InputChannelPanel({
  channel,
  values,
  dirtyPaths,
  locale,
  disabled,
  onChange,
  onRead,
  onApply,
  onCaptureMin,
  onCaptureMax,
}: InputChannelPanelProps) {
  const fields = useMemo(
    () => ({
      mode: localizeField(channel.fields.mode, locale),
      idx: localizeField(channel.fields.idx, locale),
      invert: localizeField(channel.fields.invert, locale),
      amin: localizeField(channel.fields.amin, locale),
      amax: localizeField(channel.fields.amax, locale),
      cur: localizeField(channel.fields.cur, locale),
    }),
    [channel, locale],
  );

  const mode = channelValue(channel, 'mode', values);
  const raw = parseChannelNumber(channelValue(channel, 'cur', values));
  const min = parseChannelNumber(channelValue(channel, 'amin', values)) ?? 0;
  const max = parseChannelNumber(channelValue(channel, 'amax', values)) ?? 4095;
  const dirty = Object.values(channel.fields).some((field) => dirtyPaths.includes(field.path));
  const emptyLabel = translate(locale, 'metricEmpty');
  const isAnalog = mode === '2';

  return (
    <Card
      title={translate(locale, 'inputsGpioTitle', { n: channel.gpio })}
      description={channelModeLabel(locale, mode)}
    >
      <div className="input-channel-panel">
        <InputLiveDisplay
          mode={mode}
          raw={raw ?? null}
          min={min}
          max={max}
          locale={locale}
          emptyLabel={emptyLabel}
        />

        <section className="input-channel-config">
          <div className="input-channel-config-head">
            <h4 className="input-channel-config-title">{translate(locale, 'inputsConfigSection')}</h4>
            {dirty ? <Pill tone="warn">{translate(locale, 'inputsModified')}</Pill> : null}
          </div>

          <div className="input-channel-config-grid">
            <GpioConfigField
              locale={locale}
              field={fields.mode}
              value={channelValue(channel, 'mode', values)}
              dirty={dirtyPaths.includes(fields.mode.path)}
              disabled={disabled}
              onChange={(value) => onChange(channel.fields.mode, value)}
            />
            <GpioConfigField
              locale={locale}
              field={fields.idx}
              value={channelValue(channel, 'idx', values)}
              dirty={dirtyPaths.includes(fields.idx.path)}
              disabled={disabled || mode === '0'}
              onChange={(value) => onChange(channel.fields.idx, value)}
            />
            <GpioConfigField
              locale={locale}
              field={fields.invert}
              value={channelValue(channel, 'invert', values)}
              dirty={dirtyPaths.includes(fields.invert.path)}
              disabled={disabled || mode === '0'}
              onChange={(value) => onChange(channel.fields.invert, value)}
            />
            <GpioConfigField
              locale={locale}
              field={fields.amin}
              value={channelValue(channel, 'amin', values)}
              dirty={dirtyPaths.includes(fields.amin.path)}
              disabled={disabled || !isAnalog}
              inactive={!isAnalog}
              onChange={(value) => onChange(channel.fields.amin, value)}
            />
            <GpioConfigField
              locale={locale}
              field={fields.amax}
              value={channelValue(channel, 'amax', values)}
              dirty={dirtyPaths.includes(fields.amax.path)}
              disabled={disabled || !isAnalog}
              inactive={!isAnalog}
              onChange={(value) => onChange(channel.fields.amax, value)}
            />
          </div>

          <details className="input-channel-help">
            <summary>{translate(locale, 'inputsChannelHelp')}</summary>
            <div className="input-channel-help-body">
              {[fields.mode, fields.idx, fields.invert, fields.amin, fields.amax, fields.cur].map((field) => {
                const help = getFieldHelp(field, locale);
                return (
                  <div key={field.path} className="input-channel-help-item">
                    <code>{field.path}</code>
                    <p>{field.description}</p>
                    <span className="input-channel-help-meta">
                      {translate(locale, 'fieldRange')}: {help.range}
                      {help.unit ? ` · ${translate(locale, 'fieldUnit')}: ${help.unit}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </details>
        </section>

        <div className="input-channel-actions">
          <button type="button" disabled={disabled} onClick={onRead}>
            {translate(locale, 'inputsReadChannel')}
          </button>
          <button type="button" disabled={disabled || !isAnalog || raw === undefined} onClick={onCaptureMin}>
            {translate(locale, 'inputsCaptureMin')}
          </button>
          <button type="button" disabled={disabled || !isAnalog || raw === undefined} onClick={onCaptureMax}>
            {translate(locale, 'inputsCaptureMax')}
          </button>
          <button type="button" disabled={disabled || !dirty} onClick={onApply}>
            {translate(locale, 'inputsApplyChannel')}
          </button>
        </div>
      </div>
    </Card>
  );
}

function GpioConfigField({
  locale,
  field,
  value,
  dirty,
  disabled,
  inactive = false,
  onChange,
}: {
  locale: Locale;
  field: ConfigField;
  value: string;
  dirty: boolean;
  disabled: boolean;
  inactive?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`input-channel-field${dirty ? ' is-dirty' : ''}${inactive ? ' is-inactive' : ''}`}>
      <span className="input-channel-field-label">
        {field.label}
        {dirty ? <span className="input-channel-field-dot" aria-hidden /> : null}
      </span>
      {field.type === 'enum' && field.options ? (
        <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          <option value="">{translate(locale, 'enumEmptyOption')}</option>
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : field.type === 'bool' ? (
        <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          <option value="">{translate(locale, 'enumEmptyOption')}</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {localizeOptionLabel(locale, field, opt.value, opt.label)}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="number"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <span className="input-channel-field-desc">{field.description}</span>
    </label>
  );
}

function InputLiveDisplay({
  mode,
  raw,
  min,
  max,
  locale,
  emptyLabel,
}: {
  mode: string;
  raw: number | null;
  min: number;
  max: number;
  locale: Locale;
  emptyLabel: string;
}) {
  const label = translate(locale, 'inputsLiveSignal');

  return (
    <div className="input-channel-live">
      {mode === '2' ? (
        <LinearAnalogAxis label={label} value={raw} min={min} max={max} tone="ok" emptyLabel={emptyLabel} />
      ) : mode === '1' ? (
        <ButtonInputControl
          label={label}
          pressed={isButtonPressed(raw, min, max)}
          raw={raw}
          pressedLabel={translate(locale, 'inputButtonPressed')}
          releasedLabel={translate(locale, 'inputButtonReleased')}
          emptyLabel={emptyLabel}
        />
      ) : mode === '3' ? (
        <ZeroWheelInputControl
          label={label}
          active={isButtonPressed(raw, min, max)}
          raw={raw}
          readyLabel={translate(locale, 'inputZeroReady')}
          triggeredLabel={translate(locale, 'inputZeroTriggered')}
          hint={translate(locale, 'inputZeroHint')}
          emptyLabel={emptyLabel}
        />
      ) : (
        <div className="input-channel-live-idle">
          <span className="input-control-label">{label}</span>
          <span className="input-channel-live-idle-value">{emptyLabel}</span>
        </div>
      )}
    </div>
  );
}
