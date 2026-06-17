import { useEffect, useRef, useState } from 'react';
import type { TelemetrySample, TelemetrySeries } from './types';

interface TimeSeriesChartProps {
  title: string;
  samples: TelemetrySample[];
  series: TelemetrySeries[];
  windowMs?: number;
  height?: number;
  compact?: boolean;
  /** When provided, renders toggle buttons in the legend. */
  onToggleSeries?: (key: keyof TelemetrySample) => void;
}

export function TimeSeriesChart({
  title,
  samples,
  series,
  windowMs = 60_000,
  height = 280,
  compact = false,
  onToggleSeries,
}: TimeSeriesChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [localSeries, setLocalSeries] = useState<TelemetrySeries[]>(series);

  // Sync external series changes into local state (e.g. when parent re-creates array)
  useEffect(() => {
    setLocalSeries(series);
  }, [series]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    drawChart(canvas, samples, localSeries, windowMs, compact);
  }, [compact, localSeries, samples, windowMs]);

  function toggle(key: keyof TelemetrySample) {
    setLocalSeries((prev) =>
      prev.map((item) => (item.key === key ? { ...item, visible: !item.visible } : item)),
    );
    onToggleSeries?.(key);
  }

  const windowLabel = windowMs >= 60_000
    ? `${windowMs / 60_000} min`
    : `${windowMs / 1000} s`;

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
                title={item.visible ? 'Click to hide' : 'Click to show'}
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
                    {latest.toFixed(item.unit === 'V' ? 1 : 2)} {item.unit}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>
      <canvas ref={canvasRef} style={{ height }} />
    </section>
  );
}

function drawChart(
  canvas: HTMLCanvasElement,
  allSamples: TelemetrySample[],
  series: TelemetrySeries[],
  windowMs: number,
  compact: boolean,
) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 800;
  const height = canvas.clientHeight || 280;
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

  const now = allSamples.at(-1)?.t ?? performance.now();
  const samples = allSamples.filter((s) => s.t >= now - windowMs);
  const visible = series.filter((item) => item.visible);

  const padL = compact ? 48 : 62;
  const padR = compact ? 48 : 62;
  const padT = compact ? 10 : 16;
  const padB = compact ? 18 : 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  if (plotW <= 0 || plotH <= 0) {
    return;
  }

  const leftScale = scaleFor(samples, visible.filter((item) => item.axis === 'left'));
  const rightScale = scaleFor(samples, visible.filter((item) => item.axis === 'right'));

  drawGrid(ctx, width, height, padL, padR, padT, padB, leftScale, rightScale, compact, windowMs);

  // Draw zero line if either axis crosses zero
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

  // Empty state label
  if (samples.length < 2) {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font = compact ? '11px ui-sans-serif, sans-serif' : '13px ui-sans-serif, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('waiting for samples…', padL + plotW / 2, padT + plotH / 2);
  }
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

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  padL: number,
  padR: number,
  padT: number,
  padB: number,
  leftScale: { min: number; max: number },
  rightScale: { min: number; max: number },
  compact: boolean,
  windowMs: number,
) {
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  ctx.font = compact ? '10px ui-monospace, monospace' : '12px ui-monospace, monospace';
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
    ctx.fillText(leftValue.toFixed(1), padL - 5, y);
    ctx.textAlign = 'left';
    ctx.fillText(rightValue.toFixed(1), width - padR + 5, y);
  }

  // Time axis label
  const windowLabel = windowMs >= 60_000 ? `-${windowMs / 60_000}m` : `-${windowMs / 1000}s`;
  ctx.fillStyle = '#55555f';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(windowLabel, padL, height - 6);
  ctx.textAlign = 'right';
  ctx.fillText('now', width - padR, height - 6);
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

function latestValue(samples: TelemetrySample[], key: keyof TelemetrySample): number | null {
  for (let i = samples.length - 1; i >= 0; i--) {
    const value = samples[i][key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}
