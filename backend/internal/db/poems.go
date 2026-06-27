package db

import (
	"database/sql"
	"encoding/json"
	"strings"
)

// Poem is one row in the poems table.
type Poem struct {
	ID        int      `json:"id"`
	PoetID    string   `json:"poetId"`
	Title     string   `json:"title"`
	Form      string   `json:"form"`
	Lines     []string `json:"lines"`
	Content   string   `json:"content"`
	PoemIndex int      `json:"poemIdx"` // 0-based index within this poet's poems[], used by search hits
}

// InsertPoem inserts one poem. FTS is kept in sync via triggers.
func InsertPoem(db *sql.DB, p Poem) (int64, error) {
	jsn, err := json.Marshal(p.Lines)
	if err != nil {
		return 0, err
	}
	res, err := db.Exec(
		`INSERT INTO poems (poet_id, title, form, lines, content) VALUES (?, ?, ?, ?, ?)`,
		p.PoetID, p.Title, p.Form, string(jsn), p.Content,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// InsertPoemsBatch inserts many poems for one poet in a single transaction.
func InsertPoemsBatch(db *sql.DB, poetID string, poems []Poem) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT INTO poems (poet_id, title, form, lines, content) VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, p := range poems {
		jsn, err := json.Marshal(p.Lines)
		if err != nil {
			return err
		}
		if _, err := stmt.Exec(poetID, p.Title, p.Form, string(jsn), p.Content); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// PoemsByPoet returns all poems for a poet, ordered by rowid.
func PoemsByPoet(db *sql.DB, poetID string) ([]Poem, error) {
	rows, err := db.Query(
		`SELECT id, poet_id, title, form, lines, content FROM poems WHERE poet_id = ? ORDER BY id`,
		poetID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanPoems(rows)
}

// SearchPoems performs FTS5 full-text search on poems.
// The subquery computes poem_index = 0-based position within the poet's poem list, matching
// the frontend's poemIdx (array index into the poet's poems[]).
func SearchPoems(db *sql.DB, query string, limit int) ([]Poem, error) {
	// Escape FTS5 special chars and build a prefix query per character for
	// CJK-friendly matching (each character is a token).
	terms := buildFTSTerms(query)
	if terms == "" {
		return nil, nil
	}
	rows, err := db.Query(
		`SELECT p.id, p.poet_id, p.title, p.form, p.lines, p.content,
		        (SELECT COUNT(*) FROM poems p2 WHERE p2.poet_id = p.poet_id AND p2.id < p.id) AS poem_index
		 FROM poems_fts f JOIN poems p ON p.id = f.rowid
		 WHERE poems_fts MATCH ?
		 ORDER BY rank LIMIT ?`,
		terms, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanPoemsWithIndex(rows)
}

func buildFTSTerms(q string) string {
	parts := strings.Fields(q)
	var out []string
	for _, p := range parts {
		// Each CJK char is its own token in FTS5 with default tokenizer.
		out = append(out, `"`+p+`"`)
	}
	return strings.Join(out, " OR ")
}

func scanPoems(rows *sql.Rows) ([]Poem, error) {
	var out []Poem
	for rows.Next() {
		var p Poem
		var linesJSON string
		if err := rows.Scan(&p.ID, &p.PoetID, &p.Title, &p.Form, &linesJSON, &p.Content); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(linesJSON), &p.Lines); err != nil {
			p.Lines = []string{linesJSON}
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// scanPoemsWithIndex is like scanPoems but also reads the poem_index column
// (0-based per-poet position, used for search results).
func scanPoemsWithIndex(rows *sql.Rows) ([]Poem, error) {
	var out []Poem
	for rows.Next() {
		var p Poem
		var linesJSON string
		if err := rows.Scan(&p.ID, &p.PoetID, &p.Title, &p.Form, &linesJSON, &p.Content, &p.PoemIndex); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(linesJSON), &p.Lines); err != nil {
			p.Lines = []string{linesJSON}
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// PoemCount returns the total number of poems.
func PoemCount(db *sql.DB) (int, error) {
	var n int
	err := db.QueryRow(`SELECT COUNT(*) FROM poems`).Scan(&n)
	return n, err
}
