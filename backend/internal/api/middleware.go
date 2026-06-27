package api

import (
	"log"
	"net/http"
	"time"
)

// CORS allows any origin for local dev / CDN-hosting. Restrict in production.
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequestLog logs each request with method, path, status, and duration.
func RequestLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		wr := &responseRecorder{ResponseWriter: w, status: 200}
		next.ServeHTTP(wr, r)
		log.Printf("%s %s → %d (%s)", r.Method, r.URL.Path, wr.status, time.Since(start).Round(time.Microsecond))
	})
}

type responseRecorder struct {
	http.ResponseWriter
	status int
}

func (r *responseRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}
