local config = require('config')

local M = {}

local series = {
  vbus = {},
  ibus = {},
  iq = {},
  torqueNm = {},
  positionDeg = {},
  velocityDegS = {},
}

local latest = {
  t = 0,
  hubT = 0,
  vbus = nil,
  ibus = nil,
  iq = nil,
  torqueNm = nil,
  positionDeg = nil,
  velocityDegS = nil,
  source = nil,
  hz = 0,
}

local hzSamples = 0
local hzWindowStart = 0

local function maxPoints()
  return math.max(600, config.get().windowSec * 70)
end

local function trim(buf)
  local limit = maxPoints()
  while #buf > limit do
    table.remove(buf, 1)
  end
end

local function pushSeries(key, value, t)
  if value == nil then return end
  local buf = series[key]
  if not buf then return end
  table.insert(buf, { t = t, v = value })
  trim(buf)
end

local function updateHz(t)
  hzSamples = hzSamples + 1
  if hzWindowStart == 0 then
    hzWindowStart = t
  end
  local elapsed = (t - hzWindowStart) / 1000
  if elapsed >= 1 then
    latest.hz = hzSamples / elapsed
    hzSamples = 0
    hzWindowStart = t
  end
end

local function setIfPresent(dst, key, value)
  if value ~= nil then dst[key] = value end
end

function M.ingest(pkt)
  local nowMs = os.clock() * 1000
  local t = nowMs
  latest.t = nowMs
  latest.hubT = pkt.hubT or 0
  setIfPresent(latest, 'vbus', pkt.vbus)
  setIfPresent(latest, 'ibus', pkt.ibus)
  setIfPresent(latest, 'iq', pkt.iq)
  setIfPresent(latest, 'torqueNm', pkt.torqueNm)
  setIfPresent(latest, 'positionDeg', pkt.positionDeg)
  setIfPresent(latest, 'velocityDegS', pkt.velocityDegS)
  setIfPresent(latest, 'source', pkt.source)
  if pkt.hz ~= nil then latest.hz = pkt.hz end

  updateHz(t)
  pushSeries('vbus', pkt.vbus, t)
  pushSeries('ibus', pkt.ibus, t)
  pushSeries('iq', pkt.iq, t)
  pushSeries('torqueNm', pkt.torqueNm, t)
  pushSeries('positionDeg', pkt.positionDeg, t)
  pushSeries('velocityDegS', pkt.velocityDegS, t)
end

function M.getLatest()
  return latest
end

function M.getSeries(key)
  local buf = series[key] or {}
  local out = {}
  for i = 1, #buf do
    out[i] = buf[i].v
  end
  return out
end

function M.getTimedSeries(key, windowMs)
  local buf = series[key] or {}
  if #buf == 0 then return {} end
  local tMax = buf[#buf].t
  local tMin = tMax - windowMs
  local out = {}
  for i = 1, #buf do
    local pt = buf[i]
    if pt.t >= tMin then
      out[#out + 1] = pt
    end
  end
  if #out == 0 then
    return buf
  end
  return out
end

function M.stats(key)
  local buf = series[key]
  if not buf or #buf == 0 then return nil end
  local windowMs = config.get().windowSec * 1000
  local tMax = buf[#buf].t
  local tMin = tMax - windowMs
  local min, max, sum, count = nil, nil, 0, 0
  for i = 1, #buf do
    local pt = buf[i]
    if pt.t >= tMin then
      local v = pt.v
      if min == nil or v < min then min = v end
      if max == nil or v > max then max = v end
      sum = sum + v
      count = count + 1
    end
  end
  if count == 0 then
    min, max, sum, count = buf[1].v, buf[1].v, 0, #buf
    for i = 1, #buf do
      local v = buf[i].v
      if v < min then min = v end
      if v > max then max = v end
      sum = sum + v
    end
  end
  if count == 0 then return nil end
  return {
    min = min,
    max = max,
    avg = sum / count,
    last = buf[#buf].v,
    count = count,
  }
end

function M.isOffline()
  if latest.t == 0 then return true end
  return (os.clock() * 1000 - latest.t) > config.get().offlineMs
end

function M.reset()
  for k in pairs(series) do
    series[k] = {}
  end
  hzSamples = 0
  hzWindowStart = 0
end

return M
