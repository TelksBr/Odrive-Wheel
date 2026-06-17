import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useAppLocale } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import type { Locale } from '../../i18n/messages';
import type { TelemetrySample, TelemetrySeries } from './types';

interface TimeSeriesChartProps {
  title: string;
  samples: TelemetrySample[];
  series: TelemetrySeries[];
  windowMs?: number;
  height?: number;
  compact?: boolean;
  locale?: Locale;
  /** When provided, renders toggle buttons in the legend. */
  onToggleSeries?: (key: keyof TelemetrySample) => void;
}

interface ChartLayout {
  width: number;
  height: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
  plotW: number;
  plotH: number;
}

interface ChartHover {
  sample: TelemetrySample;
  x: number;
  offsetMs: number;
}

export function TimeSeriesChart({
  title,
  samples,
  series,
  windowMs = 60_000,
  height = 280,
  compact = false,
  locale: localeProp,
  onToggleSeries,
}: TimeSeriesChartProps) {
  const locale = useAppLocale(localeProp);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [localSeries, setLocalSeries] = useState<TelemetrySeries[]>(series);
  const [hover, setHover] = useState<ChartHover | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    setLocalSeries(series);
  }, [series]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const layout = getChartLayout(canvas, compact);
    const now = samples.at(-1)?.t ?? performance.now();
    const windowSamples = samples.filter((s) => s.t >= now - windowMs);
    const visible = localSeries.filter((item) => item.visible);
    const leftScale = scaleFor(windowSamples, visible.filter((item) => item.axis === 'left'));
    const rightScale = scaleFor(windowSamples, visible.filter((item) => item.axis === 'right'));
    drawChart(canvas, windowSamples, localSeries, windowMs, compact, locale, layout, leftScale, rightScale, hover);
  }, [compact, hover, localSeries, locale, samples, windowMs]);

  function toggle(key: keyof TelemetrySample) {
    setLocalSeries((prev) =>
      prev.map((item) => (item.key === key ? { ...item, visible: !item.visible } : item)),
    );
    onToggleSeries?.(key);
  }

  function handleMouseMove(event: MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage || samples.length < 2) {
      setHover(null);
      setTooltipPos(null);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const layout = getChartLayout(canvas, compact);
    if (x < layout.padL || x > layout.padL + layout.plotW) {
      setHover(null);
      setTooltipPos(null);
      return;
    }

    const now = samples.at(-1)?.t ?? performance.now();
    const windowSamples = samples.filter((s) => s.t >= now - windowMs);
    const sample = sampleAtX(windowSamples, x, now, windowMs, layout);
    if (!sample) {
      setHover(null);
      setTooltipPos(null);
      return;
    }

    setHover({ sample, x, offsetMs: now - sample.t });

    const stageRect = stage.getBoundingClientRect();
    const tooltipW = 168;
    const tooltipH = 96;
    let left = event.clientX - stageRect.left + 14;
    let top = event.clientY - stageRect.top - 12;
    if (left + tooltipW > stageRect.width - 4) {
      left = event.clientX - stageRect.left - tooltipW - 14;
    }
    if (top + tooltipH > stageRect.height - 4) {
      top = stageRect.height - tooltipH - 4;
    }
    if (top < 4) {
      top = 4;
    }
    setTooltipPos({ left, top });
  }

  function handleMouseLeave() {
    setHover(null);
    setTooltipPos(null);
  }

  const windowLabel = windowMs >= 60_000
    ? `${windowMs / 60_000} min`
    : `${windowMs / 1000} s`;

  const visibleSeries = localSeries.filter((item) => item.visible);

  return (
    <section className={compact ? 'chart-card compact' : 'chart-card'}>
      <header>
        <h3>{title}</h3>
        {!compact && (
          <span style={{ color: 'var(--muted-2)', fontSize: 11, marginLeft: 6 }}>
            {windowLabel}
          </span>
        )}
        <div className="chart-legend">
          {localSeries.map((item) => {
            const latest = latestValue(samples, item.key);
            return (
              <button
                key={String(item.key)}
                type="button"
                onClick={() => toggle(item.key)}
                title={item.visible ? translate(locale, 'chartHideSeries') : translate(locale, 'chartShowSeries')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'transparent',
                  border: 'none',
                  padding: '2px 4px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: item.visible ? item.color : 'var(--muted-2)',
                  fontSize: compact ? 10 : 11,
                  textDecoration: item.visible ? 'none' : 'line-through',
                  opacity: item.visible ? 1 : 0.5,
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: item.visible ? item.color : 'var(--muted-2)',
                    flexShrink: 0,
                  }}
                />
                {item.label}
                {item.visible && latest !== null && (
                  <span style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                    {formatValue(latest, item.unit)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      <div className="chart-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          style={{ height }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
        {hover && tooltipPos && (
          <div className="chart-tooltip" style={{ left: tooltipPos.left, top: tooltipPos.top }}>
            <div className="chart-tooltip-time">
              {formatHoverTime(hover.offsetMs, locale)}
            </div>
            {visibleSeries.map((item) => {
              const value = hover.sample[item.key];
              if (typeof value !== 'number' || !Number.isFinite(value)) {
                return null;
              }
              return (
                <div key={String(item.key)} className="chart-tooltip-row">
                  <span className="chart-tooltip-dot" style={{ background: item.color }} />
                  <span className="chart-tooltip-label">{item.label}</span>
                  <span className="chart-tooltip-value">{formatValue(value, item.unit)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function getChartLayout(canvas: HTMLCanvasElement, compact: boolean): ChartLayout {
  const width = canvas.clientWidth || 800;
  const height = canvas.clientHeight || 280;
  const padL = compact ? 52 : 68;
  const padR = compact ? 52 : 68;
  const padT = compact ? 14 : 20;
  const padB = compact ? 18 : 26;
  return {
    width,
    height,
    padL,
    padR,
    padT,
    padB,
    plotW: width - padL - padR,
    plotH: height - padT - padB,
  };
}

function drawChart(
  canvas: HTMLCanvasElement,
  samples: TelemetrySample[],
  series: TelemetrySeries[],
  windowMs: number,
  compact: boolean,
  locale: import('../../i18n/messages').Locale,
  layout: ChartLayout,
  leftScale: { min: number; max: number },
  rightScale: { min: number; max: number },
  hover: ChartHover | null,
) {
  const dpr = window.devicePixelRatio || 1;
  const { width, height, padL, padT, plotW, plotH } = layout;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const visible = series.filter((item) => item.visible);
  if (plotW <= 0 || plotH <= 0) {
    return;
  }

  const now = samples.at(-1)?.t ?? performance.now();
  const leftUnit = axisUnit(visible, 'left');
  const rightUnit = axisUnit(visible, 'right');

  drawGrid(ctx, layout, leftScale, rightScale, compact, windowMs, leftUnit, rightUnit, locale);

  for (const scale of [leftScale, rightScale]) {
    if (scale.min < 0 && scale.max > 0) {
      const y = padT + plotH - ((-scale.min) / (scale.max - scale.min)) * plotH;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.restore();
      break;
    }
  }

  for (const item of visible) {
    const scale = item.axis === 'left' ? leftScale : rightScale;
    drawSeries(ctx, samples, item, scale, now, windowMs, padL, padT, plotW, plotH);
  }

  if (hover) {
    drawHover(ctx, hover, visible, leftScale, rightScale, padT, plotH);
  }

  if (samples.length < 2) {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font = compact ? '11px ui-sans-serif, sans-serif' : '13px ui-sans-serif, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(translate(locale, 'chartWaitingSamples'), padL + plotW / 2, padT + plotH / 2);
  }
}

function axisUnit(series: TelemetrySeries[], axis: 'left' | 'right'): string | null {
  const units = [...new Set(series.filter((item) => item.axis === axis).map((item) => item.unit))];
  if (units.length === 0) {
    return null;
  }
  return units.length === 1 ? units[0] : units.join('/');
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  layout: ChartLayout,
  leftScale: { min: number; max: number },
  rightScale: { min: number; max: number },
  compact: boolean,
  windowMs: number,
  leftUnit: string | null,
  rightUnit: string | null,
  locale: import('../../i18n/messages').Locale,
) {
  const { width, height, padL, padR, padT, plotW, plotH } = layout;
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  ctx.font = compact ? '10px ui-monospace, monospace' : '11px ui-monospace, monospace';
  ctx.textBaseline = 'middle';

  const gridLines = compact ? 3 : 4;
  for (let i = 0; i <= gridLines; i += 1) {
    const y = padT + (plotH * i) / gridLines;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();

    const leftValue = leftScale.max - ((leftScale.max - leftScale.min) * i) / gridLines;
    const rightValue = rightScale.max - ((rightScale.max - rightScale.min) * i) / gridLines;
    ctx.fillStyle = '#888896';
    ctx.textAlign = 'right';
    ctx.fillText(formatTick(leftValue, leftUnit), padL - 6, y);
    ctx.textAlign = 'left';
    ctx.fillText(formatTick(rightValue, rightUnit), width - padR + 6, y);
  }

  if (leftUnit) {
    ctx.fillStyle = '#a0a0ac';
    ctx.font = compact ? 'bold 10px ui-monospace, monospace' : 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(formatAxisUnit(leftUnit), padL, padT - 4);
  }
  if (rightUnit) {
    ctx.fillStyle = '#a0a0ac';
    ctx.font = compact ? 'bold 10px ui-monospace, monospace' : 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(formatAxisUnit(rightUnit), width - padR, padT - 4);
  }

  const windowLabel = windowMs >= 60_000 ? `-${windowMs / 60_000}m` : `-${windowMs / 1000}s`;
  ctx.fillStyle = '#55555f';
  ctx.font = compact ? '10px ui-monospace, monospace' : '11px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(windowLabel, padL, height - 6);
  ctx.textAlign = 'right';
  ctx.fillText(translate(locale, 'chartAxisNow'), width - padR, height - 6);
}

function drawSeries(
  ctx: CanvasRenderingContext2D,
  samples: TelemetrySample[],
  item: TelemetrySeries,
  scale: { min: number; max: number },
  now: number,
  windowMs: number,
  padL: number,
  padT: number,
  plotW: number,
  plotH: number,
) {
  const points = samples
    .map((s) => ({ t: s.t, value: s[item.key] }))
    .filter((p): p is { t: number; value: number } => typeof p.value === 'number' && Number.isFinite(p.value));
  if (points.length < 2) {
    return;
  }

  ctx.strokeStyle = item.color;
  ctx.lineWidth = 1.7;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = padL + plotW - ((now - p.t) / windowMs) * plotW;
    const y = padT + plotH - ((p.value - scale.min) / (scale.max - scale.min)) * plotH;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
}

function drawHover(
  ctx: CanvasRenderingContext2D,
  hover: ChartHover,
  visible: TelemetrySeries[],
  leftScale: { min: number; max: number },
  rightScale: { min: number; max: number },
  padT: number,
  plotH: number,
) {
  const x = hover.x;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x, padT);
  ctx.lineTo(x, padT + plotH);
  ctx.stroke();
  ctx.restore();

  for (const item of visible) {
    const value = hover.sample[item.key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }
    const scale = item.axis === 'left' ? leftScale : rightScale;
    const y = padT + plotH - ((value - scale.min) / (scale.max - scale.min)) * plotH;
    ctx.beginPath();
    ctx.fillStyle = item.color;
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function sampleAtX(
  samples: TelemetrySample[],
  x: number,
  now: number,
  windowMs: number,
  layout: ChartLayout,
): TelemetrySample | null {
  if (samples.length === 0) {
    return null;
  }
  const fraction = (x - layout.padL) / layout.plotW;
  const targetT = now - windowMs * (1 - fraction);
  let best = samples[0];
  let bestDist = Math.abs(best.t - targetT);
  for (const sample of samples) {
    const dist = Math.abs(sample.t - targetT);
    if (dist < bestDist) {
      best = sample;
      bestDist = dist;
    }
  }
  return best;
}

function scaleFor(samples: TelemetrySample[], series: TelemetrySeries[]) {
  const values = series.flatMap((item) =>
    samples
      .map((s) => s[item.key])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v)),
  );
  if (values.length === 0) {
    return { min: -1, max: 1 };
  }
  let min = Math.min(...values);
  let max = Math.max(...values);
  const crossesZero = min < 0 && max > 0;
  if (crossesZero) {
    const abs = Math.max(Math.abs(min), Math.abs(max), 0.5) * 1.1;
    return { min: -abs, max: abs };
  }
  const pad = Math.max((max - min) * 0.12, 0.5);
  min -= pad;
  max += pad;
  if (min === max) {
    min -= 1;
    max += 1;
  }
  return { min, max };
}

function formatAxisUnit(unit: string): string {
  if (unit === 'deg') {
    return '°';
  }
  return unit;
}

function formatTick(value: number, unit: string | null): string {
  if (!unit) {
    return value.toFixed(1);
  }
  if (unit === 'Nm') {
    return `${value.toFixed(2)} Nm`;
  }
  if (unit === 'deg') {
    return `${value.toFixed(1)}°`;
  }
  return `${value.toFixed(1)} ${unit}`;
}

function formatValue(value: number, unit: string): string {
  if (unit === 'V') {
    return `${value.toFixed(1)} V`;
  }
  if (unit === 'Nm') {
    return `${value.toFixed(2)} Nm`;
  }
  if (unit === 'deg') {
    return `${value.toFixed(1)}°`;
  }
  return `${value.toFixed(2)} ${unit}`;
}

function formatHoverTime(offsetMs: number, locale: import('../../i18n/messages').Locale): string {
  if (offsetMs < 500) {
    return translate(locale, 'chartHoverNow');
  }
  if (offsetMs < 60_000) {
    return translate(locale, 'chartHoverSeconds', { s: (offsetMs / 1000).toFixed(1) });
  }
  return translate(locale, 'chartHoverMinutes', { m: (offsetMs / 60_000).toFixed(1) });
}

function latestValue(samples: TelemetrySample[], key: keyof TelemetrySample): number | null {
  for (let i = samples.length - 1; i >= 0; i--) {
    const value = samples[i][key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}
