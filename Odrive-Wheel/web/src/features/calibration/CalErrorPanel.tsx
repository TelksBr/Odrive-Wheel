import { useCallback, useEffect, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { serialService } from '../serial/SerialService';
import { decodeErr, ERR_BITS_AXIS, ERR_BITS_ENCODER, ERR_BITS_MOTOR } from '../live/errorDecoder';
import { clearErrors } from './calibrationRunner';
import type { SetupErrorField } from './calibrationActions';

const MAPS = {
  AXIS: ERR_BITS_AXIS,
  MOTOR: ERR_BITS_MOTOR,
  ENCODER: ERR_BITS_ENCODER,
} as const;

interface ErrorRowState {
  hex: string;
  bits: string[];
  ok: boolean;
}

export function CalErrorPanel({ fields, visible }: { fields: SetupErrorField[]; visible: boolean }) {
  const { state } = useAppState();
  const locale = state.locale;
  const [rows, setRows] = useState<Record<string, ErrorRowState>>({});

  const refresh = useCallback(async () => {
    const next: Record<string, ErrorRowState> = {};
    for (const field of fields) {
      try {
        const raw = await serialService.sendCommand(field.command, true, 2500, false);
        const decoded = decodeErr(raw, MAPS[field.map]);
        next[field.id] = {
          hex: decoded.hex,
          bits: decoded.bits,
          ok: decoded.ok,
        };
      } catch {
        next[field.id] = { hex: '?', bits: [translate(locale, 'liveTimeoutBit')], ok: false };
      }
    }
    setRows(next);
  }, [fields, locale]);

  useEffect(() => {
    if (visible && state.connected) {
      void refresh();
    }
  }, [visible, state.connected, refresh]);

  if (!visible) {
    return null;
  }

  return (
    <div className="cal-err-panel">
      <div className="cal-err-panel-header">
        <span>{translate(locale, 'setupErrTitle')}</span>
        <button type="button" disabled={!state.connected || state.busy} onClick={() => void refresh()}>
          {translate(locale, 'setupErrRefresh')}
        </button>
        <button
          type="button"
          disabled={!state.connected || state.busy}
          onClick={() => void clearErrors().then(() => refresh())}
        >
          {translate(locale, 'setupErrClear')}
        </button>
      </div>
      {fields.map((field) => {
        const row = rows[field.id];
        return (
          <div key={field.id} className={`cal-err-row${row && !row.ok ? ' has-error' : ''}`}>
            <span className="lbl">{field.label}</span>
            <code className={`hex${row?.ok ? ' ok' : ' err'}`}>{row?.hex ?? '—'}</code>
            <span className="bits">
              {row?.ok
                ? ''
                : row?.bits.map((bit) => (
                    <span key={bit} className="bit-tag">
                      {bit}
                    </span>
                  ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
