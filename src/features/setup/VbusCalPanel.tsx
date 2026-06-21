import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { applyConfigField } from '../board/fieldApply';
import { fieldByPath } from '../calibration/calibrationPresets';
import { useVbusLivePoll } from './useVbusLivePoll';

const APPLY_DEBOUNCE_MS = 350;

interface VbusCalPanelProps {
  active: boolean;
  onVbusReading?: (v: number | null) => void;
  onMultimeterV?: (v: number | null) => void;
}

export function VbusCalPanel({ active, onVbusReading, onMultimeterV }: VbusCalPanelProps) {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const field = fieldByPath('sys.vbusdiv');
  const { vbusV, polling } = useVbusLivePoll(active && state.connected && !state.busy);

  const [vbusdiv, setVbusdiv] = useState(() => state.fieldValues['sys.vbusdiv'] || '19');
  const [expectedV, setExpectedV] = useState('');
  const [applying, setApplying] = useState(false);
  const debounceRef = useRef(0);

  useEffect(() => {
    const cached = state.fieldValues['sys.vbusdiv']?.trim();
    if (cached) {
      setVbusdiv(cached);
    }
  }, [state.fieldValues]);

  const applyVbusdiv = useCallback(
    async (value: string) => {
      if (!field || !state.connected || state.busy) {
        return;
      }
      setApplying(true);
      try {
        const result = await applyConfigField(field, value);
        const applied = result.applied['sys.vbusdiv'] ?? value;
        setVbusdiv(applied);
        dispatch({ type: 'set-field', path: 'sys.vbusdiv', value: applied, dirty: false });
      } catch (error) {
        dispatch({
          type: 'append-log',
          direction: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setApplying(false);
      }
    },
    [dispatch, field, state.busy, state.connected],
  );

  function scheduleApply(next: string) {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void applyVbusdiv(next);
    }, APPLY_DEBOUNCE_MS);
  }

  useEffect(() => () => window.clearTimeout(debounceRef.current), []);

  const expected = parseFloat(expectedV);
  const hasExpected = Number.isFinite(expected);
  const delta = hasExpected && vbusV !== null ? vbusV - expected : null;
  const matched = delta !== null && Math.abs(delta) < 0.15;

  useEffect(() => {
    onVbusReading?.(vbusV);
  }, [onVbusReading, vbusV]);

  useEffect(() => {
    onMultimeterV?.(hasExpected && expected > 0 ? expected : null);
  }, [expected, hasExpected, onMultimeterV]);

  return (
    <div className="setup-vbus-cal">
      <div className="setup-vbus-meters">
        <div className="setup-vbus-meter">
          <span className="setup-vbus-label">{translate(locale, 'setupStepVbusLive')}</span>
          <strong className={`setup-vbus-value${vbusV !== null && vbusV > 8 ? ' ok' : ''}`}>
            {vbusV !== null ? `${vbusV.toFixed(2)} V` : '—'}
          </strong>
          {polling && state.connected ? (
            <span className="setup-vbus-pill">{translate(locale, 'setupStepVbusPolling')}</span>
          ) : null}
        </div>
        <div className="setup-vbus-meter">
          <span className="setup-vbus-label">{translate(locale, 'setupStepVbusExpected')}</span>
          <input
            type="number"
            step="0.01"
            min="0"
            max="60"
            className="setup-vbus-expected-input"
            placeholder="24.0"
            value={expectedV}
            onChange={(e) => setExpectedV(e.target.value)}
          />
          {hasExpected && delta !== null ? (
            <span className={`setup-vbus-delta${matched ? ' ok' : ' warn'}`}>
              {translate(locale, matched ? 'setupStepVbusMatch' : 'setupStepVbusDelta', {
                delta: delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2),
              })}
            </span>
          ) : null}
        </div>
      </div>

      <div className="setup-vbus-divider-row">
        <label htmlFor="setup-vbusdiv">
          <code>sys.vbusdiv</code>
          <span className="hint">{translate(locale, 'setupStepVbusDividerHint')}</span>
        </label>
        <div className="setup-vbus-divider-controls">
          <button
            type="button"
            disabled={!state.connected || state.busy || applying}
            onClick={() => {
              const next = String(Math.max(1, parseInt(vbusdiv, 10) - 1));
              setVbusdiv(next);
              scheduleApply(next);
            }}
          >
            −
          </button>
          <input
            id="setup-vbusdiv"
            type="number"
            min={1}
            max={50}
            step={1}
            value={vbusdiv}
            disabled={!state.connected || state.busy}
            onChange={(e) => {
              setVbusdiv(e.target.value);
              scheduleApply(e.target.value);
            }}
          />
          <button
            type="button"
            disabled={!state.connected || state.busy || applying}
            onClick={() => {
              const next = String(Math.min(50, parseInt(vbusdiv, 10) + 1));
              setVbusdiv(next);
              scheduleApply(next);
            }}
          >
            +
          </button>
          {applying ? <span className="setup-vbus-applying">{translate(locale, 'setupStepVbusApplying')}</span> : null}
        </div>
      </div>

      <p className="setup-vbus-footnote">{translate(locale, 'setupStepVbusFootnote')}</p>
    </div>
  );
}
