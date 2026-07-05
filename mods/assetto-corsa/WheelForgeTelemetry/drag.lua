local config = require('config')

local M = {}

local dragging = false
local originX = 0
local originY = 0

function M.header(cfg, height)
  height = height or 28
  local w = ui.availableSpace().x
  local bgA = 0.18 + cfg.overlayOpacity * 0.35

  ui.pushStyleColor(ui.StyleColor.Button, rgbm(0.08, 0.08, 0.11, bgA))
  ui.pushStyleColor(ui.StyleColor.ButtonHovered, rgbm(0.12, 0.12, 0.16, bgA))
  ui.pushStyleColor(ui.StyleColor.ButtonActive, rgbm(0.14, 0.14, 0.18, bgA))
  ui.pushStyleColor(ui.StyleColor.Text, rgbm(0.92, 0.92, 0.95, 1))
  ui.button('☰  WheelForge Telemetry', vec2(w, height))

  if ui.itemActive() then
    if not dragging then
      dragging = true
      originX = cfg.overlayX
      originY = cfg.overlayY
    end
    local d = ui.mouseDragDelta(0)
    cfg.overlayX = originX + d.x
    cfg.overlayY = originY + d.y
    config.clampOverlay(cfg)
  else
    dragging = false
  end

  ui.popStyleColor(4)
end

function M.reset()
  dragging = false
end

return M
