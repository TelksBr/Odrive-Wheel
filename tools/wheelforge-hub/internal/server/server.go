package server

import (
	"embed"
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"github.com/wheelforge/wheelforge-hub/internal/hub"
)

//go:embed all:public
var publicFS embed.FS

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Server struct {
	hub    *hub.Hub
	static fs.FS
	server *http.Server
}

func New(h *hub.Hub, addr string) *Server {
	static, err := fs.Sub(publicFS, "public")
	if err != nil {
		log.Fatalf("[server] embed fs: %v", err)
	}

	s := &Server{hub: h, static: static}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/api/snapshot", s.handleSnapshot)
	mux.HandleFunc("/api/stats", s.handleStats)
	mux.HandleFunc("/live", s.handleLive)
	mux.HandleFunc("/", s.handleStatic)

	s.server = &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	return s
}

func (s *Server) ListenAndServe() error {
	return s.server.ListenAndServe()
}

func (s *Server) Shutdown() error {
	return s.server.Close()
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, s.hub.Health())
}

func (s *Server) handleSnapshot(w http.ResponseWriter, r *http.Request) {
	windowMs := int64(60_000)
	if v := r.URL.Query().Get("windowMs"); v != "" {
		if parsed, err := strconv.ParseInt(v, 10, 64); err == nil {
			windowMs = parsed
		}
	}
	writeJSON(w, s.hub.Snapshot(windowMs))
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	windowMs := int64(60_000)
	if v := r.URL.Query().Get("windowMs"); v != "" {
		if parsed, err := strconv.ParseInt(v, 10, 64); err == nil {
			windowMs = parsed
		}
	}
	writeJSON(w, s.hub.Stats(windowMs))
}

func (s *Server) handleLive(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "websocket upgrade failed", http.StatusBadRequest)
		return
	}
	s.hub.RegisterWS(conn)
	defer func() {
		s.hub.UnregisterWS(conn)
		_ = conn.Close()
	}()
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			return
		}
	}
}

func (s *Server) handleStatic(w http.ResponseWriter, r *http.Request) {
	filePath := resolveStatic(r.URL.Path)
	data, err := fs.ReadFile(s.static, strings.TrimPrefix(filePath, "/"))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", contentType(filePath))
	_, _ = w.Write(data)
}

func resolveStatic(urlPath string) string {
	if urlPath == "/" {
		return "/index.html"
	}
	if strings.HasSuffix(urlPath, "/") {
		return urlPath + "index.html"
	}
	lastSlash := strings.LastIndex(urlPath, "/")
	base := urlPath
	if lastSlash >= 0 {
		base = urlPath[lastSlash+1:]
	}
	if !strings.Contains(base, ".") {
		return urlPath + "/index.html"
	}
	return urlPath
}

func contentType(path string) string {
	switch {
	case strings.HasSuffix(path, ".html"):
		return "text/html; charset=utf-8"
	case strings.HasSuffix(path, ".js"):
		return "application/javascript; charset=utf-8"
	case strings.HasSuffix(path, ".css"):
		return "text/css; charset=utf-8"
	case strings.HasSuffix(path, ".json"):
		return "application/json; charset=utf-8"
	case strings.HasSuffix(path, ".svg"):
		return "image/svg+xml"
	default:
		return "application/octet-stream"
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	_ = enc.Encode(v)
}
