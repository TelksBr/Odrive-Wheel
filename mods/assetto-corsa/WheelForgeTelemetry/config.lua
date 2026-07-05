local M = {}

M.WINDOW_PRESETS = {
  { sec = 30, label = '30s' },
  { sec = 60, label = '1m' },
  { sec = 300, label = '5m' },
}

local defaults = {
  hubPort = 8765,
  windowSec = 60,
  offlineMs = 2500,
  showOverlay = true,
  showCharts = true,
  showStatsTable = true,
  overlayX = 20,
  overlayY = 20,
  overlayW = 420,
  overlayH = 580,
  overlayOpacity = 0.88,
  showVbus = true,
  showIbus = true,
  showIq = true,
  showTorque = true,
  showPosition = true,
  showVelocity = false,
}

local storage = ac.storage(defaults, 'WheelForgeTelemetry_v4')

function M.get()
  local cfg = storage
  cfg.windowSec = M.clampWindowSec(cfg.windowSec)
  cfg.overlayOpacity = math.max(0.15, math.min(1, tonumber(cfg.overlayOpacity) or 0.88))
  cfg.overlayW = math.max(280, math.floor(tonumber(cfg.overlayW) or 420))
  cfg.overlayH = math.max(200, math.floor(tonumber(cfg.overlayH) or 580))
  return cfg
end

function M.contentWidth(cfg)
  return math.max(200, cfg.overlayW - 24)
end

function M.clampWindowSec(sec)
  sec = tonumber(sec) or 60
  local best, bestDist = 60, math.huge
  for i = 1, #M.WINDOW_PRESETS do
    local p = M.WINDOW_PRESETS[i].sec
    local dist = math.abs(p - sec)
    if dist < bestDist then
      best = p
      bestDist = dist
    end
  end
  return best
end

function M.windowLabel(sec)
  sec = M.clampWindowSec(sec)
  for i = 1, #M.WINDOW_PRESETS do
    if M.WINDOW_PRESETS[i].sec == sec then
      return M.WINDOW_PRESETS[i].label
    end
  end
  return tostring(sec) .. 's'
end

function M.hubWs()
  return string.format('ws://127.0.0.1:%d/live', storage.hubPort)
end

function M.hubSnapshot()
  return string.format('http://127.0.0.1:%d/api/snapshot?windowMs=%d', storage.hubPort, M.clampWindowSec(storage.windowSec) * 1000)
end

function M.clampOverlay(cfg)
  local ws = ac.getUI().windowSize
  local w = math.max(200, cfg.overlayW)
  local h = math.max(120, cfg.overlayH)
  cfg.overlayX = math.max(0, math.min(cfg.overlayX, ws.x - w))
  cfg.overlayY = math.max(0, math.min(cfg.overlayY, ws.y - h))
end

function M.suggestHeight(cfg)
  local h = 88
  h = h + 30
  local metricRows = 0
  if cfg.showVbus or cfg.showIbus then metricRows = metricRows + 1 end
  if cfg.showIq or cfg.showTorque then metricRows = metricRows + 1 end
  if cfg.showPosition or cfg.showVelocity then metricRows = metricRows + 1 end
  h = h + metricRows * 20 + 8
  if cfg.showStatsTable then
    local rows = 0
    if cfg.showVbus then rows = rows + 1 end
    if cfg.showIbus then rows = rows + 1 end
    if cfg.showIq then rows = rows + 1 end
    if cfg.showTorque then rows = rows + 1 end
    h = h + 24 + rows * 34
  end
  if cfg.showCharts then
    h = h + 12 + 3 * require('charts').panelHeight()
  end
  return math.max(180, h + 48)
end

return M
