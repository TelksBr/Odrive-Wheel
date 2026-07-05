package hub

type TelemetryPacket struct {
	V            int      `json:"v"`
	T            int64    `json:"t"`
	Vbus         *float64 `json:"vbus,omitempty"`
	Ibus         *float64 `json:"ibus,omitempty"`
	Iq           *float64 `json:"iq,omitempty"`
	Ibrake       *float64 `json:"ibrake,omitempty"`
	TorqueNm     *float64 `json:"torqueNm,omitempty"`
	PositionDeg  *float64 `json:"positionDeg,omitempty"`
	VelocityDegS *float64 `json:"velocityDegS,omitempty"`
	Source       string   `json:"source"`
	Hz           float64  `json:"hz,omitempty"`
}

type Health struct {
	OK              bool     `json:"ok"`
	Source          string   `json:"source"`
	ChartHz         int      `json:"chartHz"`
	SampleCount     int      `json:"sampleCount"`
	UptimeSec       int      `json:"uptimeSec"`
	HidAvailable    bool     `json:"hidAvailable"`
	SerialAvailable bool     `json:"serialAvailable"`
	LastPacketMs    *int64   `json:"lastPacketMs"`
	LastVbus        *float64 `json:"lastVbus,omitempty"`
	LastIbus        *float64 `json:"lastIbus,omitempty"`
}

type SnapshotResponse struct {
	Samples []TelemetryPacket `json:"samples"`
	Latest  *TelemetryPacket  `json:"latest"`
	Health  Health            `json:"health"`
}

type WsSnapshot struct {
	Type    string            `json:"type"`
	Samples []TelemetryPacket `json:"samples"`
}
