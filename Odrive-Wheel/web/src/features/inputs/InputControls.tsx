import { useSmoothedValue } from './useSmoothedValue';
import { toCenteredPercent, toLinearPercent } from './analogAxisMath';

type Tone = 'accent' | 'ok' | 'warn';

interface CenteredAnalogAxisProps {
  label: string;
  value: number | null;
  maxAbs: number;
  unit: string;
  tone?: Tone;
  smooth?: boolean;
  minLabel?: string;
  maxLabel?: string;
  emptyLabel: string;
}

export function CenteredAnalogAxis({
  label,
  value,
  maxAbs,
  unit,
  tone = 'accent',
  smooth = true,
  minLabel,
  maxLabel,
  emptyLabel,
}: CenteredAnalogAxisProps) {
  const smoothed = useSmoothedValue(value, 0.22);
  const display = smooth ? smoothed : value;
  const percent = display === null ? null : toCenteredPercent(display, maxAbs);
  const valueLabel = formatSigned(display, unit, emptyLabel);

  return (
    <div className={`input-control input-control--centered${smooth ? '' : ' input-control--instant'}`}>
      <div className="input-control-header">
        <span className="input-control-label">{label}</span>
        <strong className="input-control-value">{valueLabel}</strong>
      </div>
      <div className="input-control-track input-control-track--centered" aria-hidden="true">
        <span className="input-control-center" />
        <CenteredFill percent={percent} tone={tone} />
      </div>
      {(minLabel || maxLabel) && (
        <div className="input-control-scale">
          <span>{minLabel ?? ''}</span>
          <span>{maxLabel ?? ''}</span>
        </div>
      )}
    </div>
  );
}

interface LinearAnalogAxisProps {
  label: string;
  value: number | null;
  min: number;
  max: number;
  tone?: Tone;
  smooth?: boolean;
  emptyLabel: string;
}

export function LinearAnalogAxis({
  label,
  value,
  min,
  max,
  tone = 'ok',
  smooth = true,
  emptyLabel,
}: LinearAnalogAxisProps) {
  const smoothed = useSmoothedValue(value, 0.25);
  const display = smooth ? smoothed : value;
  const percent = display === null ? null : toLinearPercent(display, min, max);
  const valueLabel =
    percent === null ? emptyLabel : `${percent.toFixed(0)}%`;

  return (
    <div className="input-control input-control--linear">
      <div className="input-control-header">
        <span className="input-control-label">{label}</span>
        <strong className="input-control-value">{valueLabel}</strong>
      </div>
      <div className="input-control-track input-control-track--linear" aria-hidden="true">
        <span className={`input-control-fill tone-${tone}`} style={{ width: `${percent ?? 0}%` }} />
      </div>
      <div className="input-control-scale">
        <span>{min}</span>
        <span>{percent === null ? emptyLabel : `${percent.toFixed(0)}%`}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

interface ButtonInputControlProps {
  label: string;
  pressed: boolean;
  raw: number | null;
  pressedLabel: string;
  releasedLabel: string;
  emptyLabel: string;
}

export function ButtonInputControl({
  label,
  pressed,
  raw,
  pressedLabel,
  releasedLabel,
  emptyLabel,
}: ButtonInputControlProps) {
  return (
    <div className={`input-control input-control--button${pressed ? ' is-pressed' : ''}`}>
      <div className="input-control-header">
        <span className="input-control-label">{label}</span>
        <strong className="input-control-value">
          {raw === null ? emptyLabel : pressed ? pressedLabel : releasedLabel}
        </strong>
      </div>
      <div className="input-control-button-pad" aria-hidden="true">
        <span className="input-control-button-cap" />
      </div>
      {raw !== null && (
        <div className="input-control-scale">
          <span>ADC {raw}</span>
        </div>
      )}
    </div>
  );
}

interface ZeroWheelInputControlProps {
  label: string;
  active: boolean;
  raw: number | null;
  readyLabel: string;
  triggeredLabel: string;
  hint: string;
  emptyLabel: string;
}

export function ZeroWheelInputControl({
  label,
  active,
  raw,
  readyLabel,
  triggeredLabel,
  hint,
  emptyLabel,
}: ZeroWheelInputControlProps) {
  return (
    <div className={`input-control input-control--zero${active ? ' is-active' : ''}`}>
      <div className="input-control-header">
        <span className="input-control-label">{label}</span>
        <strong className="input-control-value">
          {raw === null ? emptyLabel : active ? triggeredLabel : readyLabel}
        </strong>
      </div>
      <div className="input-control-zero-pad" aria-hidden="true">
        <span className="input-control-zero-ring" />
        <span className="input-control-zero-dot" />
      </div>
      <p className="input-control-zero-hint">{hint}</p>
    </div>
  );
}

function CenteredFill({ percent, tone }: { percent: number | null; tone: Tone }) {
  if (percent === null || !Number.isFinite(percent) || percent === 0) {
    return null;
  }
  const clamped = Math.max(-100, Math.min(100, percent));
  if (clamped > 0) {
    return <span className={`input-control-fill tone-${tone}`} style={{ left: '50%', width: `${clamped / 2}%` }} />;
  }
  const width = Math.abs(clamped) / 2;
  return <span className={`input-control-fill tone-${tone}`} style={{ left: `${50 - width}%`, width: `${width}%` }} />;
}

function formatSigned(value: number | null, unit: string, emptyLabel: string, digits = 1): string {
  if (value === null || !Number.isFinite(value)) {
    return emptyLabel;
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}${unit}`;
}
