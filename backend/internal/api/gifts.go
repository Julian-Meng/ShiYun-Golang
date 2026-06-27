package api

import (
	"database/sql"
	"net/http"

	"shiyun-backend/internal/db"
)

// GiftHandler groups gift-network endpoints under /api/gifts.
type GiftHandler struct {
	DB *sql.DB
}

// List returns all gift edges.
func (h *GiftHandler) List(w http.ResponseWriter, r *http.Request) {
	edges, err := db.AllGifts(h.DB)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	count, _ := db.GiftEdgeCount(h.DB)
	writeJSON(w, 200, map[string]any{
		"version":   1,
		"edgeCount": count,
		"edges":     edges,
	})
}

// Path finds a shortest BFS path between two poets over the gift graph.
func (h *GiftHandler) Path(w http.ResponseWriter, r *http.Request) {
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")
	if from == "" || to == "" {
		writeError(w, 400, "missing ?from= or ?to=")
		return
	}

	path, err := bfsPath(h.DB, from, to)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{
		"from": from,
		"to":   to,
		"path": path,
	})
}

// bfsPath performs breadth-first search on the gift_edges table.
// Returns nil if no path exists, empty slice if from == to.
func bfsPath(db *sql.DB, from, to string) ([]string, error) {
	if from == to {
		return []string{from}, nil
	}

	// Load adjacency list — 5k edges fits in memory easily
	adj := map[string][]string{}
	rows, err := db.Query(`SELECT from_poet_id, to_poet_id FROM gift_edges`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var f, t string
		if err := rows.Scan(&f, &t); err != nil {
			return nil, err
		}
		adj[f] = append(adj[f], t)
		// treat edges as undirected for pathfinding
		if f != t {
			adj[t] = append(adj[t], f)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// BFS
	parent := map[string]string{from: ""}
	queue := []string{from}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		if cur == to {
			// Reconstruct path
			var path []string
			for cur != "" {
				path = append([]string{cur}, path...)
				cur = parent[cur]
			}
			return path, nil
		}
		for _, nxt := range adj[cur] {
			if _, ok := parent[nxt]; !ok {
				parent[nxt] = cur
				queue = append(queue, nxt)
			}
		}
	}
	return nil, nil // no path
}
