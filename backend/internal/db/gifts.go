package db

import "database/sql"

// GiftEdge is one directed edge in the gift network.
type GiftEdge struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Weight int    `json:"weight"`
}

// InsertGifts inserts all edges in a single transaction.
func InsertGifts(db *sql.DB, edges []GiftEdge) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT OR IGNORE INTO gift_edges (from_poet_id, to_poet_id, weight) VALUES (?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, e := range edges {
		if _, err := stmt.Exec(e.From, e.To, e.Weight); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// AllGifts returns every edge.
func AllGifts(db *sql.DB) ([]GiftEdge, error) {
	rows, err := db.Query(`SELECT from_poet_id, to_poet_id, weight FROM gift_edges ORDER BY weight DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []GiftEdge
	for rows.Next() {
		var e GiftEdge
		if err := rows.Scan(&e.From, &e.To, &e.Weight); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// GiftEdgeCount returns the total number of edges.
func GiftEdgeCount(db *sql.DB) (int, error) {
	var n int
	err := db.QueryRow(`SELECT COUNT(*) FROM gift_edges`).Scan(&n)
	return n, err
}
