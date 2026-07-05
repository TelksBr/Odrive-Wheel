-- CSP Lua app — folder name and this file name must match (case sensitive).

local config = require('config')
local colors = require('colors')
local telemetry = require('telemetry')
local history = require('history')
local charts = require('charts')
local uiu = require('ui_util')
local display = require('display')
local drag = require('drag')

local C_VBUS = colors.VBUS
local C_IBUS = colors.IBUS
local C_IQ = colors.IQ
local C_TORQUE = colors.TORQUE
local C_POS = colors.POS
local C_VEL = colors.VEL
local C_OK = colors.OK
local C_ERR = colors.ERR
local C_LABEL = colors.LABEL
local C_MUTED = colors.MUTED

local HEADER_H = 28
local PAD = 8

function script.update(dt)
  telemetry.poll()
end

local function fmtVal(value, digits, unit)
  if value == nil then return '—' end
  return string.format('%.' .. digits .. 'f%s', value, unit)
end

local function liveMetric(label, key, value, unit, color, digits)
  local v = value
  if v ~= nil then
    v = display.formatValue('pill:' .. label, value, digits)
  end
  return { label = label, text = fmtVal(v, digits, unit), color = color }
end

local function drawLiveMetrics(cfg, s, col2)
  local row1L, row1R, row2L, row2R
  if cfg.showVbus then row1L = liveMetric('Vbus', 'vbus', s.vbus, ' V', C_VBUS, 2) end
  if cfg.showIbus then
    if not row1L then row1L = liveMetric('Ibus', 'ibus', s.ibus, ' A', C_IBUS, 3)
    else row1R = liveMetric('Ibus', 'ibus', s.ibus, ' A', C_IBUS, 3) end
  end
  if row1L or row1R then uiu.metricPair(row1L, row1R, col2) end

  if cfg.showIq then row2L = liveMetric('Iq', 'iq', s.iq, ' A', C_IQ, 3) end
  if cfg.showTorque then
    if not row2L then row2L = liveMetric('Torque', 'torqueNm', s.torqueNm, ' Nm', C_TORQUE, 2)
    else row2R = liveMetric('Torque', 'torqueNm', s.torqueNm, ' Nm', C_TORQUE, 2) end
  end
  if row2L or row2R then uiu.metricPair(row2L, row2R, col2) end

  local row3L, row3R
  if cfg.showPosition then row3L = liveMetric('Pos', 'positionDeg', s.positionDeg, '°', C_POS, 1) end
  if cfg.showVelocity then
    row3R = liveMetric('Vel', 'velocityDegS', s.velocityDegS, ' °/s', C_VEL, 0)
  end
  if row3L or row3R then uiu.metricPair(row3L, row3R, col2) end
end

local function drawWindowPresets(cfg)
  uiu.colored('Window', C_MUTED)
  local win, winChanged = uiu.windowPresetButtons(cfg.windowSec)
  if winChanged then
    cfg.windowSec = win
    history.reset()
    charts.reset()
  end
end

local function drawOverlayBody(cfg, s, st, offline, col2)
  charts.setOpacity(cfg.overlayOpacity)

  if offline then
    uiu.colored('WheelForge OFFLINE', C_ERR)
    if st.error then
      uiu.colored('Hub: ' .. st.error, C_LABEL)
    else
      uiu.colored('Start: Start-TelemetryHub.ps1 -GameMode', C_LABEL)
      uiu.colored(config.hubWs(), C_MUTED)
    end
    uiu.colored(string.format('Packets: %d', st.packets), C_MUTED)
    return
  end

  uiu.colored(string.format(
    'Live · %s · %.1f Hz',
    s.source or 'serial',
    display.smoothHz(s.hz or 0)
  ), C_OK)
  ui.separator()

  drawWindowPresets(cfg)
  ui.separator()

  drawLiveMetrics(cfg, s, col2)

  if cfg.showStatsTable then
    ui.separator()
    uiu.colored('Session stats (' .. config.windowLabel(cfg.windowSec) .. ')', C_LABEL)
    ui.dummy(vec2(0, 2))
    if cfg.showVbus then charts.statsRow('Vbus', history.stats('vbus'), 'V', C_VBUS, 2) end
    if cfg.showIbus then charts.statsRow('Ibus', history.stats('ibus'), 'A', C_IBUS, 3) end
    if cfg.showIq then charts.statsRow('Iq', history.stats('iq'), 'A', C_IQ, 3) end
    if cfg.showTorque then charts.statsRow('Torque', history.stats('torqueNm'), 'Nm', C_TORQUE, 2) end
  end

  if cfg.showCharts then
    ui.separator()
    local winMs = cfg.windowSec * 1000
    charts.drawPanel('DC bus', {
      { key = 'vbus', color = C_VBUS, label = 'Vbus' },
      { key = 'ibus', color = C_IBUS, label = 'Ibus' },
    }, 76, winMs)
    charts.drawPanel('Torque', {
      { key = 'torqueNm', color = C_TORQUE, label = 'Torque' },
    }, 76, winMs)
    charts.drawPanel('Wheel', {
      { key = 'positionDeg', color = C_POS, label = 'Pos' },
      { key = 'velocityDegS', color = C_VEL, label = 'Vel' },
    }, 76, winMs)
  end
end

function script.drawOverlay(dt)
  local cfg = config.get()
  if not cfg.showOverlay then return end

  config.clampOverlay(cfg)
  cfg.overlayH = config.suggestHeight(cfg)

  local s = history.getLatest()
  local st = telemetry.getStatus()
  local offline = history.isOffline()
  local contentW = config.contentWidth(cfg)
  local col2 = math.floor(contentW * 0.52)
  local pos = vec2(cfg.overlayX, cfg.overlayY)
  local size = vec2(cfg.overlayW, cfg.overlayH)
  local op = math.max(0.15, cfg.overlayOpacity)
  local bgA = math.max(0.5, 0.3 + op * 0.65)

  ui.transparentWindow('wheelForgeTelemetry', pos, size, true, true, function()
    ui.beginOutline()
    drag.header(cfg, HEADER_H)
    ui.offsetCursor(vec2(PAD, PAD))
    charts.setContentWidth(contentW)
    drawOverlayBody(cfg, s, st, offline, col2)
    ui.dummy(vec2(0, PAD))
    ui.endOutline(rgbm(0.03, 0.03, 0.06, bgA))
  end)
end

function script.windowMain(dt)
  local st = telemetry.getStatus()

  ui.text('WheelForge Telemetry')
  ui.text('Hub: ' .. config.hubWs())
  ui.separator()

  if history.isOffline() then
    uiu.colored('No telemetry yet', rgbm(1, 0.4, 0.4, 1))
    if st.error then ui.text('Error: ' .. st.error) end
    ui.text(string.format('Packets: %d · transport: %s', st.packets, st.transport))
  else
    local s = history.getLatest()
    uiu.colored(string.format('Live · %s @ %.1f Hz', s.source or 'serial', s.hz or 0), C_OK)
    ui.text(string.format('Vbus %.2f V · Ibus %.3f A · Iq %.3f A · Torque %.2f Nm',
      s.vbus or 0, s.ibus or 0, s.iq or 0, s.torqueNm or 0))
    ui.text(string.format('Position %.1f° · Velocity %.0f°/s', s.positionDeg or 0, s.velocityDegS or 0))
  end

  ui.separator()
  ui.text('Settings (ícone ⚙): overlay, gráficos, opacidade, posição.')
end

function script.windowSettings(dt)
  local cfg = config.get()

  ui.text('WheelForge Telemetry — Settings')
  ui.separator()

  ui.text('Hub')
  uiu.portInput('Hub port', cfg.hubPort, function(port)
    cfg.hubPort = port
    telemetry.disconnect()
  end)
  uiu.colored(config.hubWs(), C_MUTED)

  ui.text('Chart window')
  local win, winChanged = uiu.windowPresetButtons(cfg.windowSec)
  if winChanged then
    cfg.windowSec = win
    history.reset()
    charts.reset()
  end

  ui.separator()
  ui.text('In-game overlay')
  cfg.showOverlay = uiu.checkbox('Show HUD overlay', cfg.showOverlay)
  cfg.showCharts = uiu.checkbox('Sparkline charts', cfg.showCharts)
  cfg.showStatsTable = uiu.checkbox('Min / max / avg rows', cfg.showStatsTable)

  if cfg.overlayOpacity < 0.15 then cfg.overlayOpacity = 0.15 end
  local op, opChanged = uiu.sliderFloat('##opacity', cfg.overlayOpacity, 0.15, 1.0, 'Panel opacity: %.2f')
  if opChanged then cfg.overlayOpacity = math.max(0.15, op) end
  uiu.colored('0.15 = translúcido · 1.0 = painel sólido', C_MUTED)

  local ow, owChanged = uiu.inputInt('Overlay width (px)', cfg.overlayW, 280, 900)
  if owChanged then cfg.overlayW = ow end

  cfg.overlayH = config.suggestHeight(cfg)
  uiu.colored(string.format('Overlay height: %d px (auto)', cfg.overlayH), C_MUTED)

  ui.text(string.format('Position: %.0f, %.0f', cfg.overlayX, cfg.overlayY))
  if ui.button('Reset overlay position') then
    cfg.overlayX = 20
    cfg.overlayY = 20
    drag.reset()
  end

  ui.separator()
  ui.text('Metrics')
  cfg.showVbus = uiu.checkbox('Vbus', cfg.showVbus)
  ui.sameLine()
  cfg.showIbus = uiu.checkbox('Ibus', cfg.showIbus)
  ui.sameLine()
  cfg.showIq = uiu.checkbox('Iq', cfg.showIq)
  cfg.showTorque = uiu.checkbox('Torque', cfg.showTorque)
  ui.sameLine()
  cfg.showPosition = uiu.checkbox('Position', cfg.showPosition)
  ui.sameLine()
  cfg.showVelocity = uiu.checkbox('Velocity', cfg.showVelocity)

  ui.separator()
  if ui.button('Reset session stats') then
    history.reset()
    charts.reset()
    display.reset()
  end
  ui.sameLine()
  if ui.button('Reconnect hub') then telemetry.disconnect() end
end
