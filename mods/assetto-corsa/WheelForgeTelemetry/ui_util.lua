local colors = require('colors')

local M = {}

function M.colored(text, color)
  ui.textColored(text, color)
end

function M.checkbox(label, value)
  if ui.checkbox(label, value) then
    return not value
  end
  return value
end

function M.sliderFloat(label, value, min, max, format)
  local v, changed = ui.slider(label, value, min, max, format or '%.2f', true)
  if changed then return v, true end
  return value, false
end

function M.portInput(label, value, onApply)
  local text = tostring(value)
  local newText, changed = ui.inputText(label, text, ui.InputTextFlags.CharsDecimal)
  if changed then
    local n = tonumber(newText)
    if n and n >= 1024 and n <= 65535 then
      local port = math.floor(n)
      if port ~= value then
        if onApply then onApply(port) end
        return port, true
      end
    end
  end
  return value, false
end

function M.inputInt(label, value, min, max)
  local text = tostring(value)
  local newText, changed = ui.inputText(label, text, ui.InputTextFlags.CharsDecimal)
  if changed then
    local n = tonumber(newText)
    if n and n >= min and n <= max then
      return math.floor(n + 0.5), true
    end
  end
  return value, false
end

function M.windowPresetButtons(value, presets)
  presets = presets or require('config').WINDOW_PRESETS
  value = require('config').clampWindowSec(value)
  for i = 1, #presets do
    local p = presets[i]
    if i > 1 then ui.sameLine() end
    local active = value == p.sec
    if active then
      ui.pushStyleColor(ui.StyleColor.Button, rgbm(0.18, 0.32, 0.52, 0.95))
      ui.pushStyleColor(ui.StyleColor.ButtonHovered, rgbm(0.22, 0.38, 0.58, 0.95))
      ui.pushStyleColor(ui.StyleColor.ButtonActive, rgbm(0.26, 0.42, 0.62, 0.95))
    end
    if ui.button(p.label) then
      if active then ui.popStyleColor(3) end
      return p.sec, true
    end
    if active then ui.popStyleColor(3) end
  end
  return value, false
end

function M.windowButtons(label, value, options)
  if label ~= '' then ui.text(label) end
  for i = 1, #options do
    local opt = options[i]
    if i > 1 then ui.sameLine() end
    if ui.button(opt .. 's' .. (value == opt and ' *' or '')) then
      return opt, true
    end
  end
  return value, false
end

--- Label + value on one line (no ui.columns).
function M.metricLine(m)
  if not m then return end
  M.colored(m.label, colors.MUTED)
  ui.sameLine()
  M.colored(m.text, m.color)
end

--- Two metrics on one row via sameLine offsets — layout stays identical with/without stats.
function M.metricPair(left, right, col2)
  col2 = col2 or 200
  if left then
    M.colored(left.label, colors.MUTED)
    ui.sameLine()
    M.colored(left.text, left.color)
  end
  if right then
    ui.sameLine(col2)
    M.colored(right.label, colors.MUTED)
    ui.sameLine()
    M.colored(right.text, right.color)
  end
end

return M
