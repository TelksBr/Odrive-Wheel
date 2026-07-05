package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/wheelforge/wheelforge-hub/internal/config"
	"github.com/wheelforge/wheelforge-hub/internal/hub"
	"github.com/wheelforge/wheelforge-hub/internal/serial"
	"github.com/wheelforge/wheelforge-hub/internal/server"
)

func main() {
	cfgPath := config.ConfigPathNearExe()
	cfg, err := config.Load(cfgPath, os.Args[1:])
	if err != nil {
		log.Fatalf("[hub] config: %v", err)
	}

	h := hub.New(hub.Config{
		ChartHz:        cfg.ChartHz,
		UDPHost:        cfg.UDPHost,
		UDPPort:        cfg.UDPPort,
		BufferWindowMs: cfg.BufferWindowMs,
		MaxSamples:     cfg.MaxSamples,
	})
	if err := h.StartUDP(); err != nil {
		log.Fatalf("[hub] udp: %v", err)
	}
	defer h.Close()

	var serialSrc *serial.Source
	if cfg.SerialPath != "" {
		if cfg.SerialOnly {
			log.Println("[hub] serial-only mode — CDC telemetry; HID FFB left to the game")
		}
		src, err := serial.Start(cfg.SerialPath, cfg.MaxTorqueNm, cfg.ChartHz, func(packet hub.TelemetryPacket) {
			h.SetSource("serial")
			h.SetSerialAvailable(true)
			h.Ingest(packet)
		})
		if err != nil {
			log.Printf("[serial] open failed: %v", err)
			if strings.Contains(strings.ToLower(err.Error()), "access denied") {
				log.Println("[serial] COM in use — close WheelForge browser tab (Disconnect serial) before starting hub")
			}
			h.SetSource("none")
		} else {
			serialSrc = src
			h.SetSerialAvailable(true)
		}
	} else {
		log.Println("[hub] no serial port — use --serial COM6")
	}

	addr := fmt.Sprintf("%s:%d", cfg.HTTPHost, cfg.HTTPPort)
	srv := server.New(h, addr)

	log.Printf("[hub] HTTP http://localhost:%d", cfg.HTTPPort)
	log.Printf("[hub] overlay http://localhost:%d/overlay/", cfg.HTTPPort)
	log.Printf("[hub] WebSocket ws://localhost:%d/live", cfg.HTTPPort)

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[hub] http: %v", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("[hub] shutting down…")
	if serialSrc != nil {
		serialSrc.Stop()
	}
	_ = srv.Shutdown()
}
