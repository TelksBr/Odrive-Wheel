import type { ConfigField } from './fieldCatalog';
import { readField, writeField } from '../board/BoardProtocol';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { getFieldHelp } from './fieldHelp';

export function ConfigFieldRow({ field }: { field: ConfigField }) {
  return field.readonly ? <ReadonlyRow field={field} /> : <EditableRow field={field} />;
}

/* ── Readonly — just a live readout ──────────────────────────────────────── */
function ReadonlyRow({ field }: { field: ConfigField }) {
  const { state, dispatch } = useAppState();
  const value = state.fieldValues[field.path] ?? '';

  async function handleRead() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const next = await readField(field);
      dispatch({ type: 'set-field', path: field.path, value: next, dirty: false });
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  return (
    <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 12px', alignItems: 'start' }}>
      <div>
        <div className="field-title-row">
          <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{field.label}</label>
          <span className={`protocol-badge ${field.protocol}`}>{field.protocol === 'openffboard' ? 'OFFB' : 'ODrive'}</span>
          <span className="pill" style={{ fontSize: 10, padding: '1px 6px', color: 'var(--muted-2)', borderColor: 'var(--border)' }}>read-only</span>
        </div>
        <code style={{ fontSize: 11, color: 'var(--muted-2)' }}>{field.path}</code>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 15,
            color: value ? 'var(--text)' : 'var(--muted-2)',
            letterSpacing: '-0.02em',
            whiteSpace: 'nowrap',
          }}
        >
          {value || '—'}
        </strong>
        <button
          type="button"
          className="compact-button ghost-button"
          disabled={!state.connected || state.busy}
          onClick={() => void handleRead()}
          title={field.description}
        >
          {translate(state.locale, 'readField')}
        </button>
      </div>

      {field.description && (
        <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 11, color: 'var(--muted-2)', lineHeight: 1.4 }}>
          {field.description}
        </p>
      )}
    </div>
  );
}

/* ── Editable — full edit/apply controls ─────────────────────────────────── */
function EditableRow({ field }: { field: ConfigField }) {
  const { state, dispatch } = useAppState();
  const value = state.fieldValues[field.path] ?? '';
  const dirty = state.dirtyPaths.includes(field.path);
  const help = getFieldHelp(field, state.locale);

  async function handleRead() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const next = await readField(field);
      dispatch({ type: 'set-field', path: field.path, value: next, dirty: false });
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function handleWrite() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const reply = await writeField(field, value);
      dispatch({ type: 'append-log', direction: 'info', message: `${field.path}: ${reply}` });
      dispatch({ type: 'set-field', path: field.path, value, dirty: false });
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  return (
    <div className={`field-row ${dirty ? 'dirty' : ''}`}>
      <div className="field-copy">
        <div className="field-title-row">
          <label htmlFor={`field-${field.path}`}>{field.label}</label>
          <span className={`protocol-badge ${field.protocol}`}>{field.protocol === 'openffboard' ? 'OFFB' : 'ODrive'}</span>
          {dirty && <span className="dirty-badge">modified</span>}
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
        {field.type === 'enum' || field.type === 'bool' ? (
          <select
            id={`field-${field.path}`}
            value={value}
            onChange={(e) => dispatch({ type: 'set-field', path: field.path, value: e.target.value })}
          >
            <option value="">-</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
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
            onChange={(e) => dispatch({ type: 'set-field', path: field.path, value: e.target.value })}
          />
        )}
        <div className="field-actions">
          <button type="button" disabled={!state.connected || state.busy} onClick={() => void handleRead()}>
            {translate(state.locale, 'readField')}
          </button>
          <button type="button" disabled={!state.connected || state.busy || !dirty} onClick={() => void handleWrite()}>
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
