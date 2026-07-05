/** @typedef {{ t: number; vbus?: number; ibus?: number; iq?: number; ibrake?: number; torqueNm?: number; positionDeg?: number; velocityDegS?: number; source?: string; hz?: number }} Sample */

/** @type {Sample[]} */
const samples = [];
const MAX_SAMPLES = 18000;

const METRICS = [
  { key: 'vbus', label: 'Vbus', unit: 'V', digits: 2, color: '#38bdf8' },
  { key: 'ibus', label: 'Ibus', unit: 'A', digits: 3, color: '#fbbf24' },
  { key: 'iq', label: 'Iq', unit: 'A', digits: 3, color: '#4ade80' },
  { key: 'torqueNm', label: 'Torque', unit: 'Nm', digits: 2, color: '#f87171' },
  { key: 'positionDeg', label: 'Position', unit: '°', digits: 1, color: '#fb923c' },
  { key: 'velocityDegS', label: 'Velocity', unit: '°/s', digits: 0, color: '#c084fc' },
];

const STATS_MS = 200;
const CHART_MS = 50;
const RANGE_MS = 500;
const DISPLAY_ALPHA = 0.1;

const MIN_SPAN = {
  vbus: 2,
  ibus: 0.5,
  iq: 0.5,
  torqueNm: 2,
  positionDeg: 30,
  velocityDegS: 80,
};

const TICK_DIGITS = {
  vbus: 1,
  ibus: 2,
  iq: 2,
  torqueNm: 1,
  positionDeg: 0,
  velocityDegS: 0,
};

const WINDOW_PRESETS = [30000, 60000, 300000];

const connEl = document.getElementById('conn');
const hzEl = document.getElementById('hz');
const sourceEl = document.getElementById('source');
const statsEl = document.getElementById('stats');
const statsTableBody = document.querySelector('#stats-table tbody');
const windowPresetsEl = document.getElementById('window-presets');
const busCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('chart-bus'));
const torqueCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('chart-torque'));
const motionCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('chart-motion'));
const rangeBusEl = document.getElementById('range-bus');
const rangeTorqueEl = document.getElementById('range-torque');
const rangeMotionEl = document.getElementById('range-motion');

function clampWindowMs(ms) {
  const n = Number(ms) || 60000;
  let best = WINDOW_PRESETS[1];
  let bestDist = Infinity;
  for (const preset of WINDOW_PRESETS) {
    const dist = Math.abs(preset - n);
    if (dist < bestDist) {
      best = preset;
      bestDist = dist;
    }
  }
  return best;
}

function setWindowMs(ms) {
  windowMs = clampWindowMs(ms);
  localStorage.setItem('wf-window-ms', String(windowMs));
  chartScales.clear();
  displaySmooth.clear();
  if (windowPresetsEl) {
    for (const btn of windowPresetsEl.querySelectorAll('.preset')) {
      btn.classList.toggle('active', Number(btn.dataset.ms) === windowMs);
    }
  }
  scheduleCharts();
}

let windowMs = clampWindowMs(localStorage.getItem('wf-window-ms') || 60000);
if (windowPresetsEl) {
  for (const btn of windowPresetsEl.querySelectorAll('.preset')) {
    btn.addEventListener('click', () => setWindowMs(Number(btn.dataset.ms)));
    btn.classList.toggle('active', Number(btn.dataset.ms) === windowMs);
  }
}

/** @type {Record<string, HTMLElement>} */
const pillEls = {};
/** @type {Record<string, { now: HTMLElement; avg: HTMLElement; min: HTMLElement; max: HTMLElement; digits: number }>} */
const tableCells = {};
const canvasState = new WeakMap();
const chartScales = new Map();
/** @type {Map<string, number>} */
const displaySmooth = new Map();

let wsOpen = false;
let dirtyCharts = true;
let lastStatsAt = 0;
let lastChartAt = 0;
let lastRangeAt = 0;
let lastHzText = '';
let lastConnState = '';
let lastSourceText = '';
/** @type {Record<string, string>} */
const lastRangeText = {};

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

function smoothDisplay(key, value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return value;
  const prev = displaySmooth.get(key);
  if (prev === undefined) {
    displaySmooth.set(key, value);
    return value;
  }
  const next = prev + (value - prev) * DISPLAY_ALPHA;
  displaySmooth.set(key, next);
  return next;
}

function seriesBounds(values, key) {
  if (values.length === 0) return null;
  const minSpan = MIN_SPAN[key] ?? 1;
  const tail = values.slice(-16);
  const center = tail.reduce((a, b) => a + b, 0) / tail.length;
  let lo = center - minSpan / 2;
  let hi = center + minSpan / 2;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  return { min: lo, max: hi };
}

function stableScale(chartId, serKey, rawMin, rawMax) {
  const id = `${chartId}:${serKey}`;
  const minSpan = MIN_SPAN[serKey] ?? 1;
  let vmin = rawMin;
  let vmax = rawMax;
  if (vmax - vmin < minSpan) {
    const mid = (vmax + vmin) / 2;
    vmin = mid - minSpan / 2;
    vmax = mid + minSpan / 2;
  }
  const pad = (vmax - vmin) * 0.05;
  const targetLo = vmin - pad;
  const targetHi = vmax + pad;

  let s = chartScales.get(id);
  if (!s) {
    s = { min: targetLo, max: targetHi };
    chartScales.set(id, s);
  } else {
    s.min += (targetLo - s.min) * 0.06;
    s.max += (targetHi - s.max) * 0.06;
  }
  if (s.max - s.min < minSpan) {
    const mid = (s.max + s.min) / 2;
    s.min = mid - minSpan / 2;
    s.max = mid + minSpan / 2;
  }
  return { min: s.min, max: s.max, span: s.max - s.min || 1 };
}

function fmtTick(value, key) {
  const digits = TICK_DIGITS[key] ?? 1;
  return value.toFixed(digits);
}

function initDom() {
  statsEl.replaceChildren();
  for (const m of METRICS.slice(0, 4)) {
    const div = document.createElement('div');
    div.className = 'pill';
    const label = document.createElement('span');
    label.textContent = m.label;
    const val = document.createElement('strong');
    val.style.color = m.color;
    val.textContent = '—';
    div.append(label, val);
    statsEl.appendChild(div);
    pillEls[m.key] = val;
  }

  statsTableBody.replaceChildren();
  for (const m of METRICS) {
    const tr = document.createElement('tr');
    const tdLabel = document.createElement('td');
    tdLabel.className = 'metric-label';
    tdLabel.textContent = m.label;
    tr.appendChild(tdLabel);
    const cells = { digits: m.digits, color: m.color };
    for (const col of ['now', 'avg', 'min', 'max']) {
      const td = document.createElement('td');
      td.className = 'metric-value';
      td.style.color = m.color;
      td.textContent = '—';
      tr.appendChild(td);
      cells[col] = td;
    }
    statsTableBody.appendChild(tr);
    tableCells[m.key] = cells;
  }
}

function pushSample(s) {
  samples.push(s);
  const cutoff = (samples.at(-1)?.t ?? s.t) - windowMs;
  while (samples.length > 0 && samples[0].t < cutoff) samples.shift();
  while (samples.length > MAX_SAMPLES) samples.shift();
}

function visibleSamples() {
  const tMax = samples.at(-1)?.t ?? 0;
  const tMin = tMax - windowMs;
  return samples.filter((s) => s.t >= tMin);
}

function latest() {
  return samples.at(-1);
}

function fmt(v, digits = 1) {
  return v === undefined || v === null || Number.isNaN(v) ? '—' : v.toFixed(digits);
}

/** @param {keyof Sample} key */
function computeStats(key) {
  const vals = visibleSamples()
    .map((s) => s[key])
    .filter((v) => typeof v === 'number');
  if (vals.length === 0) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { min, max, avg, last: vals.at(-1), count: vals.length };
}

function renderStats(now) {
  if (now - lastStatsAt < STATS_MS) return;
  lastStatsAt = now;

  const s = latest();
  if (!s) return;

  for (const m of METRICS.slice(0, 4)) {
    const el = pillEls[m.key];
    const raw = s[m.key];
    if (!el || typeof raw !== 'number') continue;
    const smooth = smoothDisplay(`pill:${m.key}`, raw);
    setText(el, `${fmt(smooth, m.digits)} ${m.unit}`);
  }

  for (const m of METRICS) {
    const cells = tableCells[m.key];
    const st = computeStats(m.key);
    if (!cells) continue;
    if (!st) {
      setText(cells.now, '—');
      setText(cells.avg, '—');
      setText(cells.min, '—');
      setText(cells.max, '—');
      continue;
    }
    const smoothNow = typeof st.last === 'number'
      ? smoothDisplay(`tbl:${m.key}`, st.last)
      : st.last;
    setText(cells.now, fmt(smoothNow, cells.digits));
    setText(cells.avg, fmt(st.avg, cells.digits));
    setText(cells.min, fmt(st.min, cells.digits));
    setText(cells.max, fmt(st.max, cells.digits));
  }
}

function effectiveHz() {
  const last = samples.at(-1)?.t ?? 0;
  const recent = samples.filter((s) => s.t >= last - 5000);
  const raw = recent.length > 1 ? (recent.length - 1) / 5 : 0;
  const smooth = smoothDisplay('hz', raw);
  return smooth.toFixed(1);
}

function setupCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const prev = canvasState.get(canvas);
  if (!prev || prev.w !== w || prev.h !== h || prev.dpr !== dpr) {
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvasState.set(canvas, { w, h, dpr });
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function smoothScale(chartId, serKey, rawMin, rawMax) {
  return stableScale(chartId, serKey, rawMin, rawMax);
}

function setRangeText(id, text, now) {
  if (now - lastRangeAt < RANGE_MS && lastRangeText[id] === text) return;
  lastRangeText[id] = text;
  lastRangeAt = now;
  const el = id === 'bus' ? rangeBusEl : id === 'torque' ? rangeTorqueEl : rangeMotionEl;
  if (el && el.textContent !== text) el.textContent = text;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} chartId
 * @param {HTMLElement | null} rangeEl
 * @param {Array<{ key: keyof Sample; color: string; label: string }>} series
 * @param {number} now
 */
function drawChart(canvas, chartId, rangeEl, series, now) {
  const ctx = setupCanvas(canvas);
  if (!ctx) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  const visible = visibleSamples();
  if (visible.length < 2 || h < 24) return;

  const pad = { l: 36, r: 8, t: 8, b: 14 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const maxPts = Math.min(visible.length, Math.max(40, Math.floor(plotW * 0.35)));
  const step = Math.max(1, Math.floor(visible.length / maxPts));

  const ranges = [];
  for (const ser of series) {
    const rawVals = [];
    for (let i = 0; i < visible.length; i += step) {
      const v = visible[i][ser.key];
      if (typeof v === 'number') rawVals.push(v);
    }
    const last = visible.at(-1)[ser.key];
    if (typeof last === 'number') rawVals.push(last);
    const bounds = seriesBounds(rawVals, ser.key);
    if (!bounds) continue;

    const scale = stableScale(chartId, ser.key, bounds.min, bounds.max);
    ser._min = scale.min;
    ser._max = scale.max;
    ser._span = scale.span;
    ser._last = typeof last === 'number' ? last : bounds.max;
    ranges.push(`${ser.label} ${fmtTick(ser._last, ser.key)}`);
  }
  if (ranges.length === 0) return;
  setRangeText(chartId, ranges.join(' · '), now);

  ctx.font = '10px ui-monospace, monospace';
  ctx.strokeStyle = 'rgba(255,255,255,.06)';
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + plotW, y);
    ctx.stroke();
  }

  for (const ser of series) {
    if (ser._min === undefined) continue;

    ctx.fillStyle = ser.color;
    ctx.globalAlpha = 1;
    ctx.fillText(fmtTick(ser._max, ser.key), 2, pad.t + 8);
    ctx.fillText(fmtTick((ser._max + ser._min) / 2, ser.key), 2, pad.t + plotH * 0.5);
    ctx.fillText(fmtTick(ser._min, ser.key), 2, pad.t + plotH);
    ctx.globalAlpha = 1;

    const pts = [];
    for (let i = 0; i < visible.length; i += step) {
      const v = visible[i][ser.key];
      if (typeof v === 'number') pts.push(v);
    }
    if (pts.length < 2) continue;

    ctx.strokeStyle = ser.color;
    ctx.lineWidth = w < 480 ? 1.25 : 1.5;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = pad.l + (i / (pts.length - 1)) * plotW;
      const y = pad.t + plotH - ((pts[i] - ser._min) / ser._span) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (typeof ser._last === 'number') {
      const ly = pad.t + plotH - ((ser._last - ser._min) / ser._span) * plotH;
      ctx.beginPath();
      ctx.moveTo(pad.l + plotW - 8, ly);
      ctx.lineTo(pad.l + plotW, ly);
      ctx.stroke();
    }
  }

  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t + plotH);
  ctx.lineTo(pad.l + plotW, pad.t + plotH);
  ctx.stroke();
}

function updateHeader() {
  const hz = `${effectiveHz()} Hz`;
  if (hz !== lastHzText) {
    lastHzText = hz;
    hzEl.textContent = hz;
  }

  const s = latest();
  const sourceText = s?.source ? `· ${s.source}` : '';
  if (sourceText !== lastSourceText) {
    lastSourceText = sourceText;
    sourceEl.textContent = sourceText;
  }

  const dataFresh = s && Date.now() - s.t < 3000;
  let connState = 'disconnected';
  let connText = 'disconnected';
  let connClass = 'err';
  if (!wsOpen) {
    connState = 'disconnected';
  } else if (!dataFresh) {
    connState = 'no-data';
    connText = 'connected · no data';
    connClass = 'warn';
  } else {
    connState = 'online';
    connText = 'online';
    connClass = 'ok';
  }
  if (connState !== lastConnState) {
    lastConnState = connState;
    connEl.textContent = connText;
    connEl.className = connClass;
  }
}

function drawCharts(now) {
  drawChart(busCanvas, 'bus', rangeBusEl, [
    { key: 'vbus', color: '#38bdf8', label: 'Vbus' },
    { key: 'ibus', color: '#fbbf24', label: 'Ibus' },
  ], now);
  drawChart(torqueCanvas, 'torque', rangeTorqueEl, [
    { key: 'torqueNm', color: '#f87171', label: 'Torque' },
  ], now);
  drawChart(motionCanvas, 'motion', rangeMotionEl, [
    { key: 'positionDeg', color: '#fb923c', label: 'Pos' },
    { key: 'velocityDegS', color: '#c084fc', label: 'Vel' },
  ], now);
  dirtyCharts = false;
}

function scheduleCharts() {
  dirtyCharts = true;
}

function frame(now) {
  updateHeader();
  renderStats(now);
  if (dirtyCharts || now - lastChartAt >= CHART_MS) {
    drawCharts(now);
    lastChartAt = now;
  }
  requestAnimationFrame(frame);
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/live`);
  ws.onopen = () => {
    wsOpen = true;
    lastConnState = '';
    scheduleCharts();
  };
  ws.onclose = () => {
    wsOpen = false;
    lastConnState = '';
    setTimeout(connect, 1500);
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'snapshot' && Array.isArray(msg.samples)) {
        samples.length = 0;
        chartScales.clear();
        displaySmooth.clear();
        for (const s of msg.samples) pushSample(s);
      } else if (msg.v === 1) {
        pushSample(msg);
      }
      scheduleCharts();
    } catch {
      // ignore
    }
  };
}

initDom();
connect();
requestAnimationFrame(frame);
window.addEventListener('resize', () => {
  canvasState.delete(busCanvas);
  canvasState.delete(torqueCanvas);
  canvasState.delete(motionCanvas);
  scheduleCharts();
});
