local history = require('history')
local uiu = require('ui_util')
local display = require('display')
local colors = require('colors')

local M = {}

local scaleCache = {}
local panelOpacity = 0.88
local contentWidth = 396
local MAX_SEGMENTS = 48
local PANEL_H = 76

local MIN_SPAN = {
  vbus = 2.0,
  ibus = 0.5,
  iq = 0.5,
  torqueNm = 2.0,
  positionDeg = 25.0,
  velocityDegS = 80.0,
}

local TICK_DIGITS = {
  vbus = 2,
  ibus = 2,
  iq = 2,
  torqueNm = 2,
  positionDeg = 1,
  velocityDegS = 0,
}

function M.setOpacity(alpha)
  panelOpacity = math.max(0.15, math.min(1, alpha or 0.88))
end

function M.setContentWidth(w)
  contentWidth = math.max(200, w or 396)
end

function M.panelHeight()
  return PANEL_H + 18
end

local function insetBg()
  return rgbm(0.02, 0.02, 0.05, 0.55 + panelOpacity * 0.35)
end

local function vivid(c)
  return colors.vivid(c)
end

local function plotRect()
  local r1 = ui.itemRectMin()
  local r2 = ui.itemRectMax()
  return vec2(r1.x, r1.y), vec2(r2.x, r2.y)
end

local function ensureMinSpan(vmin, vmax, key)
  local minSpan = MIN_SPAN[key] or 1
  if vmax - vmin < minSpan then
    local mid = (vmax + vmin) * 0.5
    vmin = mid - minSpan * 0.5
    vmax = mid + minSpan * 0.5
  end
  return vmin, vmax
end

local function boundsForSeries(pts, key)
  if #pts == 0 then return nil, nil end
  local vmin, vmax = pts[1].v, pts[1].v
  for i = 1, #pts do
    local v = pts[i].v
    if v < vmin then vmin = v end
    if v > vmax then vmax = v end
  end
  return ensureMinSpan(vmin, vmax, key)
end

local function smoothScale(id, vmin, vmax, key)
  vmin, vmax = ensureMinSpan(vmin, vmax, key)
  local pad = (vmax - vmin) * 0.04
  local lo, hi = vmin - pad, vmax + pad
  local s = scaleCache[id]
  if not s then
    s = { min = lo, max = hi }
    scaleCache[id] = s
  else
    s.min = s.min + (lo - s.min) * 0.04
    s.max = s.max + (hi - s.max) * 0.04
  end
  return ensureMinSpan(s.min, s.max, key)
end

local function formatTick(value, key)
  return string.format('%.' .. (TICK_DIGITS[key] or 1) .. 'f', value)
end

local function smoothPoints(pts)
  if #pts < 3 then return pts end
  local out = {}
  for i = 1, #pts do
    local v = pts[i].v
    if i > 1 and i < #pts then
      v = (pts[i - 1].v + pts[i].v * 2 + pts[i + 1].v) * 0.25
    end
    out[i] = { t = pts[i].t, v = v }
  end
  return out
end

local function decimate(pts, maxSegs)
  local n = #pts
  if n <= maxSegs then return pts end
  local step = math.max(1, math.floor(n / maxSegs))
  local out = {}
  for i = 1, n, step do
    out[#out + 1] = pts[i]
  end
  if out[#out].t ~= pts[n].t then
    out[#out + 1] = pts[n]
  end
  return out
end

function M.drawPanel(title, seriesList, height, windowMs)
  height = height or PANEL_H
  local plotW = contentWidth

  uiu.colored(title, colors.LABEL)
  ui.dummy(vec2(0, 2))
  ui.invisibleButton('##wfPlot_' .. title, vec2(plotW, height))
  local p1, p2 = plotRect()

  for i = 1, #seriesList do
    local pts = history.getTimedSeries(seriesList[i].key, windowMs)
    pts = smoothPoints(pts)
    seriesList[i].pts = pts
    if #pts > 0 then
      seriesList[i].smin, seriesList[i].smax = boundsForSeries(pts, seriesList[i].key)
    end
  end

  local marginL, marginR = 40, 4
  local plotL = p1.x + marginL
  local plotR = p2.x - marginR
  local innerW = plotR - plotL
  local innerH = p2.y - p1.y

  ui.pushClipRect(p1, p2, true)
  ui.drawRectFilled(p1, p2, insetBg(), 4)

  if innerW > 8 and innerH > 8 then
    for g = 0, 4 do
      local y = p1.y + (innerH * g) / 4
      ui.drawLine(vec2(plotL, y), vec2(plotR, y), rgbm(1, 1, 1, 0.08), 1)
    end

    local maxSegs = math.min(MAX_SEGMENTS, math.max(20, math.floor(innerW * 0.3)))
    for s = 1, #seriesList do
      local def = seriesList[s]
      local pts = def.pts
      if pts and #pts >= 1 and def.smin then
        local ymin, ymax = smoothScale(title .. ':' .. def.key, def.smin, def.smax, def.key)
        local span = math.max(ymax - ymin, 1e-9)

        colors.shadowWrite(formatTick(ymax, def.key), vec2(p1.x + 2, p1.y), vivid(def.color))
        colors.shadowWrite(formatTick(ymin, def.key), vec2(p1.x + 2, p2.y - 12), vivid(def.color))

        local drawPts = decimate(pts, maxSegs)
        local col = vivid(def.color)
        local n = #drawPts
        if n >= 2 then
          for i = 1, n - 1 do
            local a, b = drawPts[i], drawPts[i + 1]
            local x1 = plotL + ((i - 1) / (n - 1)) * innerW
            local x2 = plotL + (i / (n - 1)) * innerW
            local y1 = p2.y - ((a.v - ymin) / span) * innerH
            local y2 = p2.y - ((b.v - ymin) / span) * innerH
            ui.drawLine(vec2(x1, y1), vec2(x2, y2), col, 1.5)
          end
        else
          local y = p2.y - ((drawPts[1].v - ymin) / span) * innerH
          ui.drawLine(vec2(plotL, y), vec2(plotR, y), col, 1.5)
        end
      end
    end
  end
  ui.popClipRect()
  ui.dummy(vec2(0, 4))
end

function M.statsRow(label, st, unit, color, digits)
  digits = digits or 2
  uiu.colored(label, colors.LABEL)
  if not st then
    uiu.colored('  no data', colors.MUTED)
    return
  end
  local use = display.snapshotStats(label, st) or st
  local now = display.formatValue('stat:' .. label, use.last, digits) or use.last or 0
  uiu.colored(string.format(
    '  %.*f   avg %.*f   min %.*f   max %.*f %s',
    digits, now, digits, use.avg or 0, digits, use.min or 0, digits, use.max or 0, unit
  ), vivid(color))
end

function M.reset()
  scaleCache = {}
  display.reset()
end

return M
