local M = {}

local smooth = {}
local seriesTail = {}
local statSnapshots = {}
local lastLegend = {}

local DISPLAY_ALPHA = 0.05
local HZ_ALPHA = 0.04
local STATS_INTERVAL = 0.35
local LEGEND_INTERVAL = 1.0
local CHART_EMA = 0.07
local lastLegendClock = 0

function M.reset()
  smooth = {}
  seriesTail = {}
  statSnapshots = {}
  lastLegend = {}
  lastLegendClock = 0
end

function M.smooth(key, value, alpha)
  if value == nil then return nil end
  alpha = alpha or DISPLAY_ALPHA
  local prev = smooth[key]
  if prev == nil then
    smooth[key] = value
    return value
  end
  prev = prev + (value - prev) * alpha
  smooth[key] = prev
  return prev
end

function M.smoothHz(value)
  if value == nil then return 0 end
  return M.smooth('hz', value, HZ_ALPHA) or value
end

function M.formatValue(key, value, digits)
  local v = M.smooth(key, value)
  if v == nil then return nil end
  digits = digits or 2
  local scale = 10 ^ digits
  return math.floor(v * scale + 0.5) / scale
end

function M.snapshotStats(label, st)
  if not st then return nil end
  local now = os.clock()
  local entry = statSnapshots[label]
  if not entry or (now - entry.t) >= STATS_INTERVAL then
    statSnapshots[label] = { t = now, st = st }
    return st
  end
  return entry.st
end

function M.legendText(key, text)
  local now = os.clock()
  if lastLegend[key] == nil or (now - lastLegendClock) >= LEGEND_INTERVAL then
    lastLegend[key] = text
    lastLegendClock = now
  elseif text ~= lastLegend[key] then
    lastLegend[key] = text
  end
  return lastLegend[key] or text
end

--- EMA along time series for calmer chart lines.
function M.smoothSeries(key, pts)
  if #pts == 0 then return pts end
  local out = {}
  local ema = seriesTail[key] or pts[1].v
  for i = 1, #pts do
    ema = ema + (pts[i].v - ema) * CHART_EMA
    out[i] = { t = pts[i].t, v = ema }
  end
  seriesTail[key] = ema
  return out
end

return M
