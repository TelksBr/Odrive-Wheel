package hub

import "math"

type FieldStats struct {
	Min   *float64 `json:"min,omitempty"`
	Max   *float64 `json:"max,omitempty"`
	Avg   *float64 `json:"avg,omitempty"`
	Last  *float64 `json:"last,omitempty"`
	Count int      `json:"count"`
}

type StatsResponse struct {
	WindowMs int64                  `json:"windowMs"`
	Fields   map[string]FieldStats  `json:"fields"`
	Health   Health                 `json:"health"`
}

var statFields = []struct {
	key    string
	getter func(TelemetryPacket) *float64
}{
	{"vbus", func(p TelemetryPacket) *float64 { return p.Vbus }},
	{"ibus", func(p TelemetryPacket) *float64 { return p.Ibus }},
	{"iq", func(p TelemetryPacket) *float64 { return p.Iq }},
	{"ibrake", func(p TelemetryPacket) *float64 { return p.Ibrake }},
	{"torqueNm", func(p TelemetryPacket) *float64 { return p.TorqueNm }},
	{"positionDeg", func(p TelemetryPacket) *float64 { return p.PositionDeg }},
	{"velocityDegS", func(p TelemetryPacket) *float64 { return p.VelocityDegS }},
}

func (h *Hub) Stats(windowMs int64) StatsResponse {
	samples := h.buffer.Snapshot(windowMs)
	fields := make(map[string]FieldStats, len(statFields))

	for _, spec := range statFields {
		var min, max, sum float64
		count := 0
		var last *float64
		for _, sample := range samples {
			v := spec.getter(sample)
			if v == nil {
				continue
			}
			val := *v
			if count == 0 {
				min, max = val, val
			} else {
				min = math.Min(min, val)
				max = math.Max(max, val)
			}
			sum += val
			count++
			last = v
		}
		fs := FieldStats{Count: count, Last: last}
		if count > 0 {
			avg := sum / float64(count)
			fs.Min = &min
			fs.Max = &max
			fs.Avg = &avg
		}
		fields[spec.key] = fs
	}

	return StatsResponse{
		WindowMs: windowMs,
		Fields:   fields,
		Health:   h.Health(),
	}
}
