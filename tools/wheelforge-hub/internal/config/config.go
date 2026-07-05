package config

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
)

type Config struct {
	HTTPHost       string  `json:"httpHost"`
	HTTPPort       int     `json:"httpPort"`
	UDPHost        string  `json:"udpHost"`
	UDPPort        int     `json:"udpPort"`
	ChartHz        int     `json:"chartHz"`
	SerialPath     string  `json:"serialPath"`
	AxisRangeDeg   float64 `json:"axisRangeDeg"`
	MaxTorqueNm    float64 `json:"maxTorqueNm"`
	BufferWindowMs int     `json:"bufferWindowMs"`
	MaxSamples     int     `json:"maxSamples"`
	SerialOnly     bool    `json:"serialOnly"`
}

func Default() Config {
	return Config{
		HTTPHost:       "0.0.0.0",
		HTTPPort:       8765,
		UDPHost:        "127.0.0.1",
		UDPPort:        45890,
		ChartHz:        60,
		SerialPath:     "",
		AxisRangeDeg:   900,
		MaxTorqueNm:    8,
		BufferWindowMs: 300_000,
		MaxSamples:     18_000,
		SerialOnly:     false,
	}
}

func Load(configPath string, args []string) (Config, error) {
	cfg := Default()

	if configPath != "" {
		data, err := os.ReadFile(configPath)
		if err == nil {
			if err := json.Unmarshal(data, &cfg); err != nil {
				return cfg, fmt.Errorf("invalid config: %w", err)
			}
		} else if !os.IsNotExist(err) {
			return cfg, err
		}
	}

	fs := flag.NewFlagSet("wheelforge-hub", flag.ContinueOnError)
	port := fs.Int("port", cfg.HTTPPort, "HTTP port")
	udpPort := fs.Int("udp-port", cfg.UDPPort, "UDP port for AC mod")
	chartHz := fs.Int("chart-hz", cfg.ChartHz, "chart sample rate cap")
	serial := fs.String("serial", cfg.SerialPath, "COM port (e.g. COM6)")
	axisRange := fs.Float64("axis-range", cfg.AxisRangeDeg, "wheel range in degrees")
	serialOnly := fs.Bool("serial-only", cfg.SerialOnly, "serial only (game mode)")
	gameMode := fs.Bool("game-mode", false, "alias for --serial-only")

	if err := fs.Parse(args); err != nil {
		return cfg, err
	}

	cfg.HTTPPort = *port
	cfg.UDPPort = *udpPort
	cfg.ChartHz = *chartHz
	cfg.SerialPath = *serial
	cfg.AxisRangeDeg = *axisRange
	cfg.SerialOnly = *serialOnly || *gameMode

	return cfg, nil
}

func ConfigPathNearExe() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	return filepath.Join(filepath.Dir(exe), "config.json")
}
