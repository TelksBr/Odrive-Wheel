package hub

import (
	"encoding/json"
	"log"
	"net"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Hub struct {
	cfg             Config
	buffer          *RingBuffer
	source          string
	packetsInWindow int
	windowStart     time.Time
	startedAt       time.Time
	lastPacketAt    time.Time
	serialAvailable bool

	mu      sync.Mutex
	clients map[*websocket.Conn]struct{}
	udpConn *net.UDPConn
}

type Config struct {
	ChartHz        int
	UDPHost        string
	UDPPort        int
	BufferWindowMs int
	MaxSamples     int
}

func New(cfg Config) *Hub {
	return &Hub{
		cfg:         cfg,
		buffer:      NewRingBuffer(cfg.BufferWindowMs, cfg.MaxSamples, cfg.ChartHz),
		source:      "none",
		windowStart: time.Now(),
		startedAt:   time.Now(),
		clients:     make(map[*websocket.Conn]struct{}),
	}
}

func (h *Hub) SetSource(source string) {
	h.mu.Lock()
	h.source = source
	h.mu.Unlock()
}

func (h *Hub) SetSerialAvailable(ok bool) {
	h.mu.Lock()
	h.serialAvailable = ok
	h.mu.Unlock()
}

func (h *Hub) Ingest(packet TelemetryPacket) {
	h.mu.Lock()
	packet.Hz = h.effectiveHzLocked()
	h.packetsInWindow++
	h.mu.Unlock()

	if !h.buffer.Push(packet, false) {
		return
	}
	h.mu.Lock()
	h.lastPacketAt = time.Now()
	h.mu.Unlock()

	data, err := json.Marshal(packet)
	if err != nil {
		return
	}
	h.broadcastWS(data)
	h.sendUDP(data)
}

func (h *Hub) effectiveHzLocked() float64 {
	elapsed := time.Since(h.windowStart).Seconds()
	if elapsed >= 1 {
		hz := float64(h.packetsInWindow) / elapsed
		h.packetsInWindow = 0
		h.windowStart = time.Now()
		return float64(int(hz*10+0.5)) / 10
	}
	return float64(h.cfg.ChartHz)
}

func (h *Hub) RegisterWS(conn *websocket.Conn) {
	h.mu.Lock()
	h.clients[conn] = struct{}{}
	h.mu.Unlock()

	snap := h.buffer.Snapshot(60_000)
	payload, _ := json.Marshal(WsSnapshot{Type: "snapshot", Samples: snap})
	_ = conn.WriteMessage(websocket.TextMessage, payload)
}

func (h *Hub) UnregisterWS(conn *websocket.Conn) {
	h.mu.Lock()
	delete(h.clients, conn)
	h.mu.Unlock()
}

func (h *Hub) broadcastWS(data []byte) {
	h.mu.Lock()
	clients := make([]*websocket.Conn, 0, len(h.clients))
	for c := range h.clients {
		clients = append(clients, c)
	}
	h.mu.Unlock()

	for _, c := range clients {
		if err := c.WriteMessage(websocket.TextMessage, data); err != nil {
			h.UnregisterWS(c)
			_ = c.Close()
		}
	}
}

func (h *Hub) StartUDP() error {
	addr, err := net.ResolveUDPAddr("udp", "0.0.0.0:0")
	if err != nil {
		return err
	}
	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		return err
	}
	h.udpConn = conn
	log.Printf("[hub] UDP target %s:%d", h.cfg.UDPHost, h.cfg.UDPPort)
	return nil
}

func (h *Hub) sendUDP(data []byte) {
	if h.udpConn == nil || len(data) > 480 {
		return
	}
	addr, err := net.ResolveUDPAddr("udp", net.JoinHostPort(h.cfg.UDPHost, strconv.Itoa(h.cfg.UDPPort)))
	if err != nil {
		return
	}
	_, _ = h.udpConn.WriteToUDP(data, addr)
}

func (h *Hub) Health() Health {
	h.mu.Lock()
	source := h.source
	serialOK := h.serialAvailable
	lastAt := h.lastPacketAt
	h.mu.Unlock()

	last := h.buffer.Last()
	health := Health{
		OK:              source != "none",
		Source:          source,
		ChartHz:         h.cfg.ChartHz,
		SampleCount:     h.buffer.Len(),
		UptimeSec:       int(time.Since(h.startedAt).Seconds()),
		HidAvailable:    false,
		SerialAvailable: serialOK,
	}
	if !lastAt.IsZero() {
		ms := time.Since(lastAt).Milliseconds()
		health.LastPacketMs = &ms
	}
	if last != nil {
		health.LastVbus = last.Vbus
		health.LastIbus = last.Ibus
	}
	return health
}

func (h *Hub) Snapshot(windowMs int64) SnapshotResponse {
	samples := h.buffer.Snapshot(windowMs)
	var latest *TelemetryPacket
	if len(samples) > 0 {
		last := samples[len(samples)-1]
		latest = &last
	}
	return SnapshotResponse{
		Samples: samples,
		Latest:  latest,
		Health:  h.Health(),
	}
}

func (h *Hub) Close() {
	if h.udpConn != nil {
		_ = h.udpConn.Close()
	}
}
