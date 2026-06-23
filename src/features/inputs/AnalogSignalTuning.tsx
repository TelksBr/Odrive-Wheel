import { translate, type Locale } from '../../i18n/messages';
import { ANALOG_FILTER_PRESETS_HZ } from './useGpioAnalogProcessor';

interface AnalogSignalTuningProps {
  locale: Locale;
  filterOn: boolean;
  cutoffRaw: string;
  cutoffValid: boolean;
  cutoffNum: number;
  disabled: boolean;
  onToggleFilter: (enabled: boolean) => void;
  onCutoffChange: (value: string) => void;
  onCutoffCommit: () => void;
  onCutoffPreset: (hz: number) => void;
}

/** Controles compactos de suavização — firmware global, UI por eixo. */
export function AnalogSignalTuning({
  locale,
  filterOn,
  cutoffRaw,
  cutoffValid,
  cutoffNum,
  disabled,
  onToggleFilter,
  onCutoffChange,
  onCutoffCommit,
  onCutoffPreset,
}: AnalogSignalTuningProps) {
  return (
    <details className="input-analog-tuning">
      <summary title={translate(locale, 'inputsAxisSmoothingTip')}>
        {translate(locale, 'inputsAxisSmoothing')}
        {filterOn ? (
          <span className="input-analog-tuning-badge">{cutoffValid ? `${cutoffNum.toFixed(0)} Hz` : '—'}</span>
        ) : null}
      </summary>
      <div className="input-analog-tuning-body">
        <div className="input-analog-tuning-row">
          <label className="input-analog-tuning-check">
            <input
              type="checkbox"
              checked={filterOn}
              disabled={disabled}
              onChange={(event) => onToggleFilter(event.target.checked)}
            />
            <span>{translate(locale, 'inputsAxisFilterShort')}</span>
          </label>
          <label className="input-analog-tuning-cutoff">
            <input
              type="number"
              min={0.5}
              max={500}
              step={1}
              value={cutoffRaw}
              disabled={disabled || !filterOn}
              onChange={(event) => onCutoffChange(event.target.value)}
              onBlur={onCutoffCommit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  onCutoffCommit();
                }
              }}
            />
            <span>Hz</span>
          </label>
        </div>
        {filterOn ? (
          <div className="chip-row input-analog-tuning-presets">
            {ANALOG_FILTER_PRESETS_HZ.map((hz) => (
              <button
                key={hz}
                type="button"
                className={cutoffValid && Math.abs(cutoffNum - hz) < 0.05 ? 'active' : ''}
                disabled={disabled}
                onClick={() => onCutoffPreset(hz)}
              >
                {hz}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}
