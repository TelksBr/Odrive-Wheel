import { useEffect, useRef } from 'react';
import type { PerfTestResults } from './perfTestTypes';

interface PerfTestChartProps {
  results: PerfTestResults;
}

export function PerfTestChart({ results }: PerfTestChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { samples, peakRPMIdx, peakAccelIdx, halfRange } = results;

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || samples.length < 2) {
      return;
    }

    const draw = () => {
      if (cv.clientWidth === 0 || cv.clientHeight === 0) {
        requestAnimationFrame(draw);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      cv.width = cv.clientWidth * dpr;
      cv.height = cv.clientHeight * dpr;
      const ctx = cv.getContext('2d');
      if (!ctx) {
        return;
      }
      ctx.scale(dpr, dpr);

      const W = cv.clientWidth;
      const H = cv.clientHeight;
      ctx.clearRect(0, 0, W, H);

      const padL = 50;
      const padR = 50;
      const padT = 18;
      const padB = 24;
      const subGap = 18;
      const innerW = W - padL - padR;
      const innerH = H - padT - padB - subGap;
      const subH = innerH / 2;

      const ts = samples.map((s) => s.t);
      const rpms = samples.map((s) => Math.abs(s.rpm ?? 0));
      const poss = samples.map((s) => s.pos);
      const accels = samples.map((s) => Math.abs(s.accel ?? 0));
      const tMin = ts[0];
      const tMax = ts[ts.length - 1];
      const rpmMax = Math.max(...rpms, 1);
      const accelPeakReal = peakAccelIdx >= 0 && peakAccelIdx < samples.length
        ? Math.abs(samples[peakAccelIdx].accel ?? 0)
        : Math.max(...accels, 1);
      const accelMax = Math.max(accelPeakReal, 1);
      const halfR = halfRange || Math.max(Math.abs(Math.min(...poss)), Math.abs(Math.max(...poss)), 1);
      const xOf = (t: number) => padL + ((t - tMin) / (tMax - tMin || 1)) * innerW;

      const drawSub = (
        yTop: number,
        traces: { values: number[]; color: string; width?: number; dash?: number[]; norm: (v: number) => number }[],
        leftLabel: string,
        rightLabel: string,
        peakX: number | null,
      ) => {
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL, yTop);
        ctx.lineTo(padL, yTop + subH);
        ctx.lineTo(padL + innerW, yTop + subH);
        ctx.stroke();

        ctx.strokeStyle = '#222';
        for (let i = 1; i <= 4; i++) {
          const y = yTop + (subH * i) / 5;
          ctx.beginPath();
          ctx.moveTo(padL, y);
          ctx.lineTo(padL + innerW, y);
          ctx.stroke();
        }

        if (rightLabel.includes('pos')) {
          const yZero = yTop + subH / 2;
          ctx.strokeStyle = '#333';
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(padL, yZero);
          ctx.lineTo(padL + innerW, yZero);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        for (const tr of traces) {
          ctx.strokeStyle = tr.color;
          ctx.lineWidth = tr.width ?? 1.6;
          ctx.setLineDash(tr.dash ?? []);
          ctx.beginPath();
          let started = false;
          for (let i = 0; i < samples.length; i++) {
            const v = tr.values[i];
            if (!Number.isFinite(v)) {
              continue;
            }
            const x = xOf(ts[i]);
            const y = yTop + subH - tr.norm(v) * subH;
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }

        if (peakX !== null) {
          ctx.strokeStyle = '#ffa726';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(peakX, yTop);
          ctx.lineTo(peakX, yTop + subH);
          ctx.stroke();
        }

        ctx.font = '11px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = traces[0].color;
        ctx.fillText(leftLabel, padL, yTop - 4);
        if (rightLabel) {
          ctx.textAlign = 'right';
          ctx.fillStyle = traces[traces.length - 1].color;
          ctx.fillText(rightLabel, padL + innerW, yTop - 4);
        }
        ctx.textAlign = 'left';
      };

      const peakRpmX = peakRPMIdx >= 0 && peakRPMIdx < samples.length ? xOf(samples[peakRPMIdx].t) : null;
      drawSub(
        padT,
        [
          { values: rpms, color: '#4fc3f7', width: 2, norm: (v) => Math.max(0, Math.min(1, v / rpmMax)) },
          { values: poss, color: '#ab47bc', width: 1.4, norm: (v) => Math.max(0, Math.min(1, (v + halfR) / (2 * halfR))) },
        ],
        `RPM: ${rpmMax.toFixed(0)}`,
        `pos: ±${halfR.toFixed(0)}°`,
        peakRpmX,
      );

      const peakAccelX = peakAccelIdx >= 0 && peakAccelIdx < samples.length ? xOf(samples[peakAccelIdx].t) : null;
      const yBot = padT + subH + subGap;
      drawSub(
        yBot,
        [
          { values: accels, color: '#ef5350', width: 1.6, dash: [4, 4], norm: (v) => Math.max(0, Math.min(1, v / accelMax)) },
        ],
        `a: ${accelMax.toFixed(0)} RPM/s`,
        '',
        peakAccelX,
      );

      ctx.fillStyle = '#888';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('0', padL - 4, padT + innerH + subGap + padB - 8);
      ctx.textAlign = 'right';
      ctx.fillText(`${tMax.toFixed(0)} ms`, padL + innerW, padT + innerH + subGap + padB - 8);
      ctx.textAlign = 'center';
      ctx.fillText('t (ms)', padL + innerW / 2, padT + innerH + subGap + padB - 8);
      ctx.textAlign = 'left';
    };

    draw();
  }, [samples, peakRPMIdx, peakAccelIdx, halfRange]);

  return <canvas ref={canvasRef} className="perf-chart-canvas" />;
}
