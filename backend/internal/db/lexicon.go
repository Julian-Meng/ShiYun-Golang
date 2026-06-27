package db

import (
	"database/sql"
	"fmt"
	"strings"
)

// InsertCharset inserts all characters from a concatenated string.
// Each char (code-point split) gets its index as id.
func InsertCharset(db *sql.DB, chars string) (int, error) {
	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT OR IGNORE INTO charset (id, char) VALUES (?, ?)`)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()

	runes := []rune(chars)
	for i, r := range runes {
		if _, err := stmt.Exec(i, string(r)); err != nil {
			return 0, err
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return len(runes), nil
}

// GetCharset returns the full ordered charset as a string.
func GetCharset(db *sql.DB) (string, error) {
	rows, err := db.Query(`SELECT char FROM charset ORDER BY id`)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	var b strings.Builder
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return "", err
		}
		b.WriteString(c)
	}
	return b.String(), rows.Err()
}

// LexiconAsset mirrors the incoming lexicon.json shape.
type LexiconAsset struct {
	Version      int     `json:"version"`
	N            int     `json:"n"`
	PingList     []int   `json:"pingList"`
	ZeList       []int   `json:"zeList"`
	ToneClass    []int   `json:"toneClass"`
	RhymeOf      []int   `json:"rhymeOf"`
	RhymeMembers [][]int `json:"rhymeMembers"`
}

// InsertLexicon stores the lexicon tables.
func InsertLexicon(db *sql.DB, lx *LexiconAsset) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// lexicon_meta
	if _, err := tx.Exec(`INSERT OR REPLACE INTO lexicon_meta (key, val) VALUES ('n', ?)`, fmt.Sprint(lx.N)); err != nil {
		return err
	}

	// tone data: one row per charId
	toneStmt, err := tx.Prepare(`INSERT OR REPLACE INTO lexicon_tone (char_id, tone, rhyme, ping_rank, ze_rank) VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer toneStmt.Close()

	// Build rank lookups
	pingRank := make(map[int]int, len(lx.PingList))
	for i, id := range lx.PingList {
		pingRank[id] = i
	}
	zeRank := make(map[int]int, len(lx.ZeList))
	for i, id := range lx.ZeList {
		zeRank[id] = i
	}

	for id := 0; id < lx.N; id++ {
		tone := 0
		if id < len(lx.ToneClass) {
			tone = lx.ToneClass[id]
		}
		rhyme := -1
		if id < len(lx.RhymeOf) {
			rhyme = lx.RhymeOf[id]
		}
		pr := -1
		if r, ok := pingRank[id]; ok {
			pr = r
		}
		zr := -1
		if r, ok := zeRank[id]; ok {
			zr = r
		}
		if _, err := toneStmt.Exec(id, tone, rhyme, pr, zr); err != nil {
			return err
		}
	}

	// rhyme groups
	for i, members := range lx.RhymeMembers {
		if _, err := tx.Exec(`INSERT OR REPLACE INTO lexicon_rhyme_groups (id, size) VALUES (?, ?)`, i, len(members)); err != nil {
			return err
		}
		for rank, charID := range members {
			if _, err := tx.Exec(
				`INSERT OR REPLACE INTO lexicon_rhyme_members (group_id, char_id, rank) VALUES (?, ?, ?)`,
				i, charID, rank,
			); err != nil {
				return err
			}
		}
	}

	return tx.Commit()
}
