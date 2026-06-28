package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"shiyun-backend/internal/api"
	"shiyun-backend/internal/db"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	dataDir := os.Getenv("SHIYUN_DATA_DIR")
	if dataDir == "" {
		dataDir = "data"
	}

	sqlDB, err := db.Open(db.DefaultPath(dataDir))
	if err != nil {
		log.Fatalf("db open: %v", err)
	}
	defer sqlDB.Close()

	if err := api.LoadEngine(sqlDB); err != nil {
		log.Fatalf("engine load: %v", err)
	}
	log.Println("engine data loaded")

	handler := api.NewRouter(sqlDB)

	// Production: serve frontend static files with SPA fallback when dist/ exists.
	// In dev mode (go run from backend/) the dist/ directory won't be found,
	// so the router's own catch-all handles 404s as before.
	if _, err := os.Stat("dist"); err == nil {
		handler = spaHandler(handler, "dist")
		log.Println("static file serving enabled: dist/")
	}

	log.Printf("shiyun-backend listening on :%s", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("server: %v", err)
	}
}

// spaHandler routes /api/* to the Go backend and everything else to static files
// with SPA fallback (non-existent paths serve index.html).
func spaHandler(api http.Handler, distDir string) http.Handler {
	fs := http.FileServer(http.Dir(distDir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			api.ServeHTTP(w, r)
			return
		}
		path := filepath.Join(distDir, filepath.Clean(r.URL.Path))
		if _, err := os.Stat(path); os.IsNotExist(err) {
			r.URL.Path = "/"
		}
		fs.ServeHTTP(w, r)
	})
}
