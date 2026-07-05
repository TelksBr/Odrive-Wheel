package serial

import (
	"bufio"
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"go.bug.st/serial"

	"github.com/wheelforge/wheelforge-hub/internal/hub"
)

type rotField struct {
	id  string
	cmd string
	set func(*hub.TelemetryPacket, *float64)
}

var rotFields = []rotField{
	{id: "vbus_voltage", cmd: "r vbus_voltage", set: func(p *hub.TelemetryPacket, v *float64) { p.Vbus = v }},
	{id: "ibus", cmd: "r ibus", set: func(p *hub.TelemetryPacket, v *float64) { p.Ibus = v }},
	{id: "iq_meas", cmd: "r axis0.motor.current_control.Iq_measured", set: func(p *hub.TelemetryPacket, v *float64) { p.Iq = v }},
	{id: "ibrake", cmd: "r brake_resistor_current", set: func(p *hub.TelemetryPacket, v *float64) { p.Ibrake = v }},
	{id: "ffb_pos", cmd: "axis.curpos?", set: func(p *hub.TelemetryPacket, v *float64) { p.PositionDeg = v }},
	{id: "ffb_spd", cmd: "axis.curspd?", set: func(p *hub.TelemetryPacket, v *float64) { p.VelocityDegS = v }},
}

var bracketRe = regexp.MustCompile(`^\[[^\]|]+\|([^\]]*)\]$`)
var ltRe = regexp.MustCompile(`lt=(-?\d+(?:\.\d+)?)`)
var nmRe = regexp.MustCompile(`nm=(-?\d+(?:\.\d+)?)`)

const (
	cmdTimeout   = 350 * time.Millisecond
	torqueCmd    = "T"
	emitterHz    = 60
)

type Source struct {
	stop chan struct{}
	wg   sync.WaitGroup
}

func Start(path string, maxTorqueNm float64, chartHz int, onSample func(hub.TelemetryPacket)) (*Source, error) {
	_ = chartHz // emitter runs at 60 Hz; chartHz caps ring buffer only

	mode := &serial.Mode{BaudRate: 115200}
	port, err := serial.Open(path, mode)
	if err != nil {
		return nil, err
	}
	if err := port.SetDTR(true); err != nil {
		log.Printf("[serial] set DTR: %v", err)
	}
	if err := port.SetRTS(true); err != nil {
		log.Printf("[serial] set RTS: %v", err)
	}
	log.Printf("[serial] opened %s (target %d Hz emit, round-robin poll)", path, emitterHz)

	queue := newCommandQueue(port)

	if pong, err := queue.send("sys.ping?", 800*time.Millisecond); err != nil {
		log.Printf("[serial] ping failed: %v", err)
	} else {
		log.Printf("[serial] ping → %s", pong)
	}

	var mu sync.Mutex
	state := hub.TelemetryPacket{V: 1, Source: "serial"}

	src := &Source{stop: make(chan struct{})}

	// Serial reader: one command per cycle, as fast as the port allows.
	src.wg.Add(1)
	go func() {
		defer src.wg.Done()
		idx := 0
		for {
			select {
			case <-src.stop:
				return
			default:
			}

			if idx >= len(rotFields) {
				raw, err := queue.send(torqueCmd, cmdTimeout)
				if err == nil {
					mu.Lock()
					state.TorqueNm = parseTorque(&raw, maxTorqueNm)
					mu.Unlock()
				}
				idx = 0
			} else {
				field := rotFields[idx]
				raw, err := queue.send(field.cmd, cmdTimeout)
				if err == nil {
					val := parseNumber(raw)
					mu.Lock()
					field.set(&state, val)
					mu.Unlock()
				}
				idx++
			}
		}
	}()

	// Emitter: steady 60 Hz stream (re-uses last values between serial updates).
	src.wg.Add(1)
	go func() {
		defer src.wg.Done()
		defer port.Close()

		ticker := time.NewTicker(time.Second / emitterHz)
		defer ticker.Stop()

		for {
			select {
			case <-src.stop:
				return
			case <-ticker.C:
				mu.Lock()
				pkt := state
				pkt.T = time.Now().UnixMilli()
				mu.Unlock()
				onSample(pkt)
			}
		}
	}()

	return src, nil
}

func (s *Source) Stop() {
	close(s.stop)
	s.wg.Wait()
}

type commandQueue struct {
	port    serial.Port
	mu      sync.Mutex
	reader  *bufio.Reader
	pending chan string
	errc    chan error
}

func newCommandQueue(port serial.Port) *commandQueue {
	q := &commandQueue{
		port:    port,
		reader:  bufio.NewReader(port),
		pending: make(chan string, 1),
		errc:    make(chan error, 1),
	}
	go q.readLoop()
	return q
}

func (q *commandQueue) readLoop() {
	for {
		line, err := q.reader.ReadString('\n')
		if err != nil {
			select {
			case q.errc <- err:
			default:
			}
			return
		}
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		select {
		case q.pending <- line:
		default:
		}
	}
}

func (q *commandQueue) send(cmd string, timeout time.Duration) (string, error) {
	q.mu.Lock()
	defer q.mu.Unlock()

	select {
	case <-q.pending:
	default:
	}

	if _, err := q.port.Write([]byte(cmd + "\n")); err != nil {
		return "", err
	}

	timer := time.NewTimer(timeout)
	defer timer.Stop()

	select {
	case line := <-q.pending:
		return line, nil
	case err := <-q.errc:
		return "", err
	case <-timer.C:
		return "", fmt.Errorf("timeout: %s", cmd)
	}
}

func normalizeReply(raw string) string {
	raw = strings.TrimSpace(raw)
	if m := bracketRe.FindStringSubmatch(raw); len(m) == 2 {
		return strings.TrimSpace(m[1])
	}
	return raw
}

func parseNumber(raw string) *float64 {
	if raw == "" || raw == "?" {
		return nil
	}
	token := strings.Fields(normalizeReply(raw))[0]
	v, err := strconv.ParseFloat(token, 64)
	if err != nil {
		return nil
	}
	return &v
}

func parseTorque(raw *string, maxTorqueNm float64) *float64 {
	if raw == nil {
		return nil
	}
	text := normalizeReply(*raw)
	if m := ltRe.FindStringSubmatch(text); len(m) == 2 && maxTorqueNm > 0 {
		lt, err := strconv.ParseFloat(m[1], 64)
		if err == nil {
			v := (lt / 32767) * maxTorqueNm
			return &v
		}
	}
	if m := nmRe.FindStringSubmatch(text); len(m) == 2 {
		v, err := strconv.ParseFloat(m[1], 64)
		if err == nil {
			return &v
		}
	}
	return nil
}
