package api

import (
	"database/sql"
	"net/http"
	"strconv"

	"shiyun-backend/internal/db"
)

// PoetHandler groups endpoints under /api/poets.
type PoetHandler struct {
	DB *sql.DB
}

// List returns poets, optionally filtered by ?q= and limited by ?limit=.
func (h *PoetHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	limit := 40
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	if q != "" {
		poets, err := db.SearchPoets(h.DB, q, limit)
		if err != nil {
			writeError(w, 500, err.Error())
			return
		}
		writeJSON(w, 200, poets)
		return
	}
	poets, err := db.AllPoets(h.DB)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	// Cap at limit when no query — 32k poets is large but acceptable as JSON;
	// the frontend typically uses this only with a ?q= filter.
	if len(poets) > limit {
		poets = poets[:limit]
	}
	writeJSON(w, 200, poets)
}

// Get returns a single poet by id.
func (h *PoetHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	poet, err := db.GetPoet(h.DB, id)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if poet == nil {
		writeError(w, 404, "poet not found")
		return
	}
	writeJSON(w, 200, poet)
}

// Poems returns all poems for a poet.
func (h *PoetHandler) Poems(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	// Verify poet exists
	if p, _ := db.GetPoet(h.DB, id); p == nil {
		writeError(w, 404, "poet not found")
		return
	}
	poems, err := db.PoemsByPoet(h.DB, id)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if poems == nil {
		poems = []db.Poem{}
	}
	writeJSON(w, 200, map[string]any{
		"poetId": id,
		"poems":  poems,
	})
}
