package db

import (
	"database/sql"
	"fmt"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// Open initialises (or opens) the SQLite database at `dbPath`, runs schema
// migrations if needed, and returns the ready pool.
func Open(dbPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("sqlite open: %w", err)
	}
	db.SetMaxOpenConns(1) // SQLite serialises writes

	if err := migrate(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("sqlite migrate: %w", err)
	}
	return db, nil
}

// DefaultPath returns the conventional data directory + file name.
func DefaultPath(dataDir string) string {
	return filepath.Join(dataDir, "shiyun.db")
}

func migrate(db *sql.DB) error {
	for _, ddl := range SchemaSQL() {
		if _, err := db.Exec(ddl); err != nil {
			return fmt.Errorf("ddl: %w\n%s", err, ddl)
		}
	}
	return nil
}
