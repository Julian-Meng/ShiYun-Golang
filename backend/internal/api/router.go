package api

import (
	"database/sql"
	"net/http"

	"shiyun-backend/internal/db"
)

// NewRouter builds the chi mux with all API routes wired.
func NewRouter(conn *sql.DB) http.Handler {
	mux := http.NewServeMux()

	poets := &PoetHandler{DB: conn}
	poems := &PoemHandler{DB: conn}
	gifts := &GiftHandler{DB: conn}
	charset := &CharsetHandler{DB: conn}

	// Health
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})

	// Manifest
	mux.HandleFunc("GET /api/manifest", func(w http.ResponseWriter, r *http.Request) {
		var n int
		conn.QueryRow("SELECT COUNT(*) FROM charset").Scan(&n)
		pc, _ := db.PoetCount(conn)
		pmc, _ := db.PoemCount(conn)
		writeJSON(w, 200, map[string]any{
			"version":   1,
			"n":         n,
			"poetCount": pc,
			"poemCount": pmc,
		})
	})

	// Poets
	mux.HandleFunc("GET /api/poets", poets.List)
	mux.HandleFunc("GET /api/poets/{id}", poets.Get)
	mux.HandleFunc("GET /api/poets/{id}/poems", poets.Poems)

	// Poems
	mux.HandleFunc("GET /api/poems/search", poems.Search)
	mux.HandleFunc("GET /api/poems/babel/{index}", poems.BabelIndex)
	mux.HandleFunc("GET /api/poems/pull", poems.Pull)

	// Gifts
	mux.HandleFunc("GET /api/gifts", gifts.List)
	mux.HandleFunc("GET /api/gifts/path", gifts.Path)

	// Charset & Lexicon
	mux.HandleFunc("GET /api/charset", charset.GetCharset)
	mux.HandleFunc("GET /api/lexicon", charset.GetLexicon)

	// 404
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, 404, "not found")
	})

	// Middleware stack
	var h http.Handler = mux
	h = RequestLog(h)
	h = CORS(h)
	return h
}
