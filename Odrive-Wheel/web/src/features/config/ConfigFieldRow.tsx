import type { ConfigField } from './fieldCatalog';
import { applyConfigField } from '../board/fieldApply';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { localizeOptionLabel } from '../../i18n/fieldMeta';
import { getFieldHelp } from './fieldHelp';
import { getFieldEditState } from './fieldEditState';

/** Normalizes any board reply to a JS boolean. Handles 'true'/'1'/truthy strings. */
function parseBool(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

export function ConfigFieldRow({ field }: { field: ConfigField }) {
  return field.readonly ? <ReadonlyRow field={field} /> : <EditableRow field={field} />;
}

/* ── Readonly — value shown, no per-field read button (use header ↻) ─────── */
function ReadonlyRow({ field }: { field: ConfigField }) {
  const { state } = useAppState();
  const value = state.fieldValues[field.path] ?? '';
  const isBool = field.type === 'bool';

  return (
    <div className="field-row readonly-field-row" id={`config-field-${field.path}`}>
      <div className="field-title-row">
        <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{field.label}</label>
        <span className={`protocol-badge ${field.protocol}`}>
          {translate(state.locale, field.protocol === 'openffboard' ? 'protocolOffb' : 'protocolOdrive')}
        </span>
        <span className="pill" style={{ fontSize: 10, padding: '1px 6px', color: 'var(--muted-2)', borderColor: 'var(--border)' }}>
          {translate(state.locale, 'fieldReadonly')}
        </span>
      </div>
      <code style={{ fontSize: 11, color: 'var(--muted-2)' }}>{field.path}</code>
      {field.description && (
        <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--muted-2)', lineHeight: 1.4 }}>
          {field.description}
        </p>
      )}
      {isBool && value ? (
        <BoolBadge value={parseBool(value)} />
      ) : (
        <strong
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 15,
            color: value ? 'var(--text)' : 'var(--muted-2)',
            letterSpacing: '-0.02em',
            marginTop: 4,
          }}
        >
          {value || translate(state.locale, 'fieldEmptyValue')}
        </strong>
      )}
    </div>
  );
}

/* ── Editable — edit/apply controls (no per-field "Read" — use header ↻) ─── */
function EditableRow({ field }: { field: ConfigField }) {
  const { state, dispatch } = useAppState();
  const value = state.fieldValues[field.path] ?? '';
  const dirty = state.dirtyPaths.includes(field.path);
  const help = getFieldHelp(field, state.locale);
  const editState = getFieldEditState(field.path, state.fieldValues);
  const inert = editState === 'inert';
  const partial = editState === 'partial';
  const disabled = !state.connected || state.busy || inert;

  async function handleWrite() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const result = await applyConfigField(field, value);
      const applied = result.applied[field.path] ?? value;
      let message = `${field.path} = ${applied}`;
      if (field.protocol === 'openffboard') {
        message += result.persistedFfb
          ? ` — ${translate(state.locale, 'applyLogFfbEepromOk')}`
          : ` — ${translate(state.locale, 'applyLogFfbEepromFail')}`;
      } else {
        message += ` — ${translate(state.locale, 'applyLogOdriveRam')}`;
      }
      dispatch({ type: 'append-log', direction: 'rx', message });
      dispatch({ type: 'set-field', path: field.path, value: applied, dirty: false });
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  return (
    <div className={`field-row ${dirty ? 'dirty' : ''}${inert ? ' ignored-in-torque' : ''}${partial ? ' partial-in-torque' : ''}`} id={`config-field-${field.path}`}>
      <div className="field-copy">
        <div className="field-title-row">
          <label htmlFor={`field-${field.path}`}>
            {field.label}
            {inert ? (
              <span className="inert-tag"> [{translate(state.locale, 'ctrlTagIgnored')}]</span>
            ) : partial ? (
              <span className="inert-tag partial"> [{translate(state.locale, 'ctrlTagPartial')}]</span>
            ) : null}
          </label>
          <span className={`protocol-badge ${field.protocol}`}>
            {translate(state.locale, field.protocol === 'openffboard' ? 'protocolOffb' : 'protocolOdrive')}
          </span>
          {dirty && <span className="dirty-badge">{translate(state.locale, 'fieldModified')}</span>}
        </div>
        <code>{field.path}</code>
        <p>{field.description}</p>
        <div className="field-help-grid">
          <HelpItem label={translate(state.locale, 'fieldDefault')} value={help.defaultValue} />
          <HelpItem label={translate(state.locale, 'fieldExample')} value={help.exampleValue} />
          <HelpItem label={translate(state.locale, 'fieldRange')} value={help.range} />
          {help.unit ? <HelpItem label={translate(state.locale, 'fieldUnit')} value={help.unit} /> : null}
        </div>
        {help.options ? (
          <details className="field-help-details">
            <summary>{translate(state.locale, 'fieldOptions')}</summary>
            <span>{help.options}</span>
          </details>
        ) : null}
        <details className="field-help-details">
          <summary>{translate(state.locale, 'fieldGuidance')}</summary>
          <span>{help.guidance}</span>
          <code>{translate(state.locale, 'fieldReadCommand')}: {help.readCommand}</code>
          {help.writeCommand ? <code>{translate(state.locale, 'fieldWriteCommand')}: {help.writeCommand}</code> : null}
        </details>
      </div>

      <div className="field-control">
        {field.type === 'bool' ? (
          <BoolToggle
            value={value ? parseBool(value) : false}
            disabled={disabled}
            onChange={(next) =>
              dispatch({ type: 'set-field', path: field.path, value: next ? 'true' : 'false' })
            }
          />
        ) : field.type === 'enum' ? (
          <select
            id={`field-${field.path}`}
            value={value}
            disabled={disabled}
            onChange={(e) => dispatch({ type: 'set-field', path: field.path, value: e.target.value })}
          >
            <option value="">{translate(state.locale, 'enumEmptyOption')}</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {localizeOptionLabel(state.locale, field, opt.value, opt.label)}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={`field-${field.path}`}
            type={field.type === 'float' || field.type === 'int' ? 'number' : 'text'}
            min={field.min}
            max={field.max}
            step={field.step}
            value={value}
            disabled={disabled}
            onChange={(e) => dispatch({ type: 'set-field', path: field.path, value: e.target.value })}
          />
        )}
        <div className="field-actions">
          <button
            type="button"
            disabled={disabled || !dirty}
            title={
              field.protocol === 'openffboard'
                ? translate(state.locale, 'applyFieldHintFfb')
                : translate(state.locale, 'applyFieldHintOdrive')
            }
            onClick={() => void handleWrite()}
          >
            {translate(state.locale, 'applyField')}
          </button>
        </div>
      </div>
    </div>
  );
}

function HelpItem({ label, value }: { label: string; value: string }) {
  return (
    <span className="field-help-item">
      <b>{label}</b>
      <code>{value}</code>
    </span>
  );
}

/* ── Toggle switch for boolean fields ─────────────────────────────────────── */
function BoolToggle({
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

/* ── Status badge for readonly boolean values ─────────────────────────────── */
function BoolBadge({ value }: { value: boolean }) {
  const { state } = useAppState();
  return (
    <span className={`bool-badge ${value ? 'bool-on' : 'bool-off'}`}>
      {value ? translate(state.locale, 'boolOnBadge') : translate(state.locale, 'boolOffBadge')}
    </span>
  );
}
