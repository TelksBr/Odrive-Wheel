local M = {}

-- Labels / títulos — alto contraste em qualquer pista
M.LABEL = rgbm(1, 0.97, 0.92, 1)
M.MUTED = rgbm(0.82, 0.84, 0.9, 1)

M.VBUS = rgbm(0.2, 0.82, 1.0, 1)
M.IBUS = rgbm(1.0, 0.76, 0.1, 1)
M.IQ = rgbm(0.15, 0.98, 0.45, 1)
M.TORQUE = rgbm(1.0, 0.35, 0.35, 1)
M.POS = rgbm(1.0, 0.62, 0.15, 1)
M.VEL = rgbm(0.82, 0.55, 1.0, 1)
M.OK = rgbm(0.35, 0.95, 0.45, 1)
M.ERR = rgbm(1, 0.35, 0.35, 1)

function M.vivid(c)
  return rgbm(c.r, c.g, c.b, 1)
end

function M.shadowWrite(text, pos, color)
  if ui.dwrite then
    ui.dwrite(text, vec2(pos.x + 1, pos.y + 1), rgbm(0, 0, 0, 0.9))
    ui.dwrite(text, pos, color)
  end
end

return M
