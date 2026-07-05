package hub

import "sync"

type RingBuffer struct {
	mu            sync.RWMutex
	samples       []TelemetryPacket
	lastPushMs    int64
	minIntervalMs int64
	maxAgeMs      int64
	maxLen        int
}

func NewRingBuffer(maxAgeMs, maxLen, chartHz int) *RingBuffer {
	if chartHz < 1 {
		chartHz = 1
	}
	return &RingBuffer{
		minIntervalMs: int64(1000 / chartHz),
		maxAgeMs:      int64(maxAgeMs),
		maxLen:        maxLen,
	}
}

func (b *RingBuffer) Push(packet TelemetryPacket, force bool) bool {
	b.mu.Lock()
	defer b.mu.Unlock()

	if !force && packet.T-b.lastPushMs < b.minIntervalMs {
		return false
	}
	b.lastPushMs = packet.T

	cutoff := packet.T - b.maxAgeMs
	start := 0
	for start < len(b.samples) && b.samples[start].T < cutoff {
		start++
	}
	if start > 0 {
		b.samples = append([]TelemetryPacket(nil), b.samples[start:]...)
	}

	b.samples = append(b.samples, packet)
	if len(b.samples) > b.maxLen {
		b.samples = b.samples[len(b.samples)-b.maxLen:]
	}
	return true
}

func (b *RingBuffer) Snapshot(windowMs int64) []TelemetryPacket {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if len(b.samples) == 0 {
		return nil
	}
	if windowMs <= 0 {
		out := make([]TelemetryPacket, len(b.samples))
		copy(out, b.samples)
		return out
	}

	cutoff := b.samples[len(b.samples)-1].T - windowMs
	start := 0
	for start < len(b.samples) && b.samples[start].T < cutoff {
		start++
	}
	out := make([]TelemetryPacket, len(b.samples)-start)
	copy(out, b.samples[start:])
	return out
}

func (b *RingBuffer) Last() *TelemetryPacket {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if len(b.samples) == 0 {
		return nil
	}
	last := b.samples[len(b.samples)-1]
	return &last
}

func (b *RingBuffer) Len() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.samples)
}
