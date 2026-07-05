local config = require('config')
local history = require('history')

local M = {}

local ws = nil
local linkError = nil
local packetsRx = 0
local lastHttpPoll = 0
local connectedPort = nil

local function parseNumber(v)
  if v == nil then return nil end
  if type(v) == 'number' then return v end
  if type(v) == 'string' then return tonumber(v) end
  return nil
end

local function field(pkt, ...)
  for i = 1, select('#', ...) do
    local key = select(i, ...)
    local v = pkt[key]
    if v ~= nil then return v end
  end
  return nil
end

local function packetFromRaw(pkt)
  if not pkt or type(pkt) ~= 'table' then return nil end
  return {
    hubT = parseNumber(field(pkt, 't', 'T')),
    vbus = parseNumber(field(pkt, 'vbus', 'Vbus')),
    ibus = parseNumber(field(pkt, 'ibus', 'Ibus')),
    iq = parseNumber(field(pkt, 'iq', 'Iq')),
    torqueNm = parseNumber(field(pkt, 'torqueNm', 'torque_nm', 'TorqueNm')),
    positionDeg = parseNumber(field(pkt, 'positionDeg', 'position_deg')),
    velocityDegS = parseNumber(field(pkt, 'velocityDegS', 'velocity_deg_s')),
    source = pkt.source or pkt.Source,
    hz = parseNumber(pkt.hz),
  }
end

local function ingestSample(pkt)
  local sample = packetFromRaw(pkt)
  if not sample then return end
  if sample.vbus == nil and sample.ibus == nil and sample.iq == nil and sample.torqueNm == nil then
    return
  end
  history.ingest(sample)
  packetsRx = packetsRx + 1
  linkError = nil
end

local function ingestSnapshot(msg)
  if not msg or type(msg) ~= 'table' then return end

  if msg.type == 'snapshot' and msg.samples then
    local samples = msg.samples
    local count = #samples
    if count == 0 then
      for _, s in pairs(samples) do
        ingestSample(s)
      end
    else
      for i = 1, count do
        ingestSample(samples[i])
      end
    end
    return
  end

  if msg.latest then
    ingestSample(msg.latest)
  end

  if msg.v == 1 or msg.v == '1' or msg.vbus ~= nil then
    ingestSample(msg)
  end
end

local function decodeMessage(data)
  if type(data) == 'table' then
    return data
  end
  if type(data) == 'string' and #data > 0 then
    local ok, decoded = pcall(function() return JSON.parse(data) end)
    if ok and decoded then return decoded end
  end
  return nil
end

local function onWsData(data)
  local msg = decodeMessage(data)
  if msg then ingestSnapshot(msg) end
end

function M.disconnect()
  if ws and ws.close then
    pcall(function() ws.close() end)
  end
  ws = nil
  connectedPort = nil
end

function M.ensureConnected()
  local port = config.get().hubPort
  if ws and connectedPort ~= port then
    M.disconnect()
  end
  if ws then return end

  ws = web.socket(config.hubWs(), onWsData, {
    encoding = 'json',
    reconnect = true,
    onError = function(err)
      linkError = err or 'websocket error'
    end,
    onClose = function()
      ws = nil
      connectedPort = nil
    end,
  })
  connectedPort = port
  if not ws then
    linkError = 'web.socket failed'
  end
end

local function pollHttp()
  local now = os.clock()
  if now - lastHttpPoll < 1.5 then return end
  lastHttpPoll = now

  web.get(config.hubSnapshot(), function(err, response)
    if err then
      linkError = err
      return
    end
    if not response or response.status ~= 200 then
      linkError = 'hub http ' .. tostring(response and response.status)
      return
    end
    local ok, body = pcall(function() return JSON.parse(response.body) end)
    if ok and body then
      ingestSnapshot(body)
    end
  end)
end

function M.poll()
  M.ensureConnected()
  pollHttp()
end

function M.getStatus()
  return {
    error = linkError,
    packets = packetsRx,
    transport = ws and 'ws' or 'none',
  }
end

return M
