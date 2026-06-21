import { fieldByPath } from '../calibration/calibrationPresets';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { localizeField, localizeOptionLabel } from '../../i18n/fieldMeta';
import type { ConfigField } from '../config/fieldCatalog';

export interface SetupFormSpec {
  path: string;
  type: 'number' | 'text' | 'bool';
  defaultValue: string | boolean | number;
}

interface SetupParamFormProps {
  specs: SetupFormSpec[];
  values: Record<string, string>;
  onChange: (path: string, value: string) => void;
  disabled?: boolean;
}

function resolveField(spec: SetupFormSpec): ConfigField | undefined {
  return fieldByPath(spec.path);
}

function inputType(field: ConfigField | undefined, spec: SetupFormSpec): 'number' | 'text' {
  if (spec.type === 'number') {
    return 'number';
  }
  if (field?.type === 'int' || field?.type === 'float') {
    return 'number';
  }
  return 'text';
}

function SetupBoolToggle({
  value,
  disabled,
  onChange,
}: {
  value: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  const { state } = useAppState();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      className="bool-toggle"
      onClick={() => onChange(!value)}
      style={{ background: 'none', border: 'none', padding: 0, opacity: disabled ? 0.45 : 1 }}
    >
      <span className={`bool-toggle-track${value ? ' on' : ''}`}>
        <span className="bool-toggle-thumb" />
      </span>
      <span className="bool-toggle-state">
        {value ? translate(state.locale, 'boolOn') : translate(state.locale, 'boolOff')}
      </span>
    </button>
  );
}

export function SetupParamForm({ specs, values, onChange, disabled = false }: SetupParamFormProps) {
  const { state } = useAppState();
  const locale = state.locale;

  return (
    <div className="setup-params-form">
      {specs.map((spec) => {
        const rawField = resolveField(spec);
        const field = rawField ? localizeField(rawField, locale) : undefined;
        const label = field?.label ?? spec.path;
        const description = field?.description ?? '';
        const protocol = field?.protocol ?? (spec.path.startsWith('axis.') || spec.path.startsWith('sys.') ? 'openffboard' : 'odrive');
        const value = values[spec.path] ?? (typeof spec.defaultValue === 'boolean' ? (spec.defaultValue ? 'true' : 'false') : String(spec.defaultValue));
        const isBool = spec.type === 'bool' || field?.type === 'bool';
        const isEnum = field?.type === 'enum' && (field.options?.length ?? 0) > 0;
        const inputId = `setup-field-${spec.path.replace(/\./g, '-')}`;

        return (
          <div className="setup-param-row field-row" key={spec.path}>
            <div className="field-copy">
              <div className="field-title-row">
                <label htmlFor={inputId}>{label}</label>
                <span className={`protocol-badge ${protocol}`}>
                  {translate(locale, protocol === 'openffboard' ? 'protocolOffb' : 'protocolOdrive')}
                </span>
              </div>
              <code>{spec.path}</code>
              {description ? <p>{description}</p> : null}
            </div>
            <div className="field-control setup-param-control">
              {isBool ? (
                <SetupBoolToggle
                  value={value === 'true'}
                  disabled={disabled}
                  onChange={(next) => onChange(spec.path, next ? 'true' : 'false')}
                />
              ) : isEnum && field ? (
                <select
                  id={inputId}
                  value={value}
                  disabled={disabled}
                  onChange={(e) => onChange(spec.path, e.target.value)}
                >
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {localizeOptionLabel(locale, field, opt.value, opt.label)}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="setup-param-input-wrap">
                  <input
                    id={inputId}
                    type={inputType(field, spec)}
                    min={field?.min}
                    max={field?.max}
                    step={field?.step ?? 'any'}
                    value={value}
                    disabled={disabled}
                    onChange={(e) => onChange(spec.path, e.target.value)}
                  />
                  {field?.unit ? <span className="setup-param-unit">{field.unit}</span> : null}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function initialFormValues(specs: SetupFormSpec[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const spec of specs) {
    out[spec.path] = typeof spec.defaultValue === 'boolean' ? (spec.defaultValue ? 'true' : 'false') : String(spec.defaultValue);
  }
  return out;
}

export function specsToWrites(specs: SetupFormSpec[], values: Record<string, string>) {
  return specs.map((spec) => ({
    path: spec.path,
    value: spec.type === 'bool' ? values[spec.path] === 'true' : values[spec.path],
  }));
}
