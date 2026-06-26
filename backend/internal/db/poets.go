package db

import "database/sql"

// Poet is one row in the poets table.
type Poet struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Dynasty     string  `json:"dynasty"`
	PoemCount   int     `json:"poemCount"`
	ClusterSize float64 `json:"clusterSize"`
}

// InsertPoet inserts or ignores (id conflict).
func InsertPoet(db *sql.DB, p Poet) error {
	_, err := db.Exec(
		`INSERT OR IGNORE INTO poets (id, name, dynasty, poem_count, cluster_size) VALUES (?, ?, ?, ?, ?)`,
		p.ID, p.Name, p.Dynasty, p.PoemCount, p.ClusterSize,
	)
	return err
}

// AllPoets returns every poet ordered by poem_count DESC.
func AllPoets(db *sql.DB) ([]Poet, error) {
	rows, err := db.Query(`SELECT id, name, dynasty, poem_count, cluster_size FROM poets ORDER BY poem_count DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Poet
	for rows.Next() {
		var p Poet
		if err := rows.Scan(&p.ID, &p.Name, &p.Dynasty, &p.PoemCount, &p.ClusterSize); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// GetPoet returns a single poet by id, or nil.
func GetPoet(db *sql.DB, id string) (*Poet, error) {
	var p Poet
	err := db.QueryRow(
		`SELECT id, name, dynasty, poem_count, cluster_size FROM poets WHERE id = ?`, id,
	).Scan(&p.ID, &p.Name, &p.Dynasty, &p.PoemCount, &p.ClusterSize)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// SearchPoets returns poets whose name contains `q` (case-sensitive, CJK).
func SearchPoets(db *sql.DB, q string, limit int) ([]Poet, error) {
	rows, err := db.Query(
		`SELECT id, name, dynasty, poem_count, cluster_size FROM poets WHERE name LIKE ? ORDER BY poem_count DESC LIMIT ?`,
		"%"+q+"%", limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Poet
	for rows.Next() {
		var p Poet
		if err := rows.Scan(&p.ID, &p.Name, &p.Dynasty, &p.PoemCount, &p.ClusterSize); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// PoetCount returns the total number of poets.
func PoetCount(db *sql.DB) (int, error) {
	var n int
	err := db.QueryRow(`SELECT COUNT(*) FROM poets`).Scan(&n)
	return n, err
}
