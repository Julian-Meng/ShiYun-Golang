package db

// SchemaSQL returns the DDL statements to initialise a fresh SQLite database.
func SchemaSQL() []string {
	return []string{
		// ── poets ──
		`CREATE TABLE IF NOT EXISTS poets (
			id          TEXT PRIMARY KEY,
			name        TEXT NOT NULL,
			dynasty     TEXT NOT NULL,
			poem_count   INTEGER NOT NULL DEFAULT 0,
			cluster_size REAL NOT NULL DEFAULT 1
		);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_poets_name_dynasty ON poets(name, dynasty);`,
		`CREATE INDEX IF NOT EXISTS idx_poets_dynasty ON poets(dynasty);`,

		// ── poems ──
		`CREATE TABLE IF NOT EXISTS poems (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			poet_id     TEXT NOT NULL REFERENCES poets(id),
			title       TEXT NOT NULL,
			form        TEXT NOT NULL DEFAULT 'other',
			lines       TEXT NOT NULL,
			content     TEXT NOT NULL,
			created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE INDEX IF NOT EXISTS idx_poems_poet ON poems(poet_id);`,
		`CREATE INDEX IF NOT EXISTS idx_poems_form ON poems(form);`,

		// ── FTS5 (full-text search on poem content) ──
		`CREATE VIRTUAL TABLE IF NOT EXISTS poems_fts USING fts5(
			title,
			content,
			content=poems,
			content_rowid=id
		);`,

		// FTS sync triggers
		`CREATE TRIGGER IF NOT EXISTS poems_ai AFTER INSERT ON poems BEGIN
			INSERT INTO poems_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
		END;`,
		`CREATE TRIGGER IF NOT EXISTS poems_ad AFTER DELETE ON poems BEGIN
			INSERT INTO poems_fts(poems_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
		END;`,
		`CREATE TRIGGER IF NOT EXISTS poems_au AFTER UPDATE ON poems BEGIN
			INSERT INTO poems_fts(poems_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
			INSERT INTO poems_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
		END;`,

		// ── gift edges ──
		`CREATE TABLE IF NOT EXISTS gift_edges (
			from_poet_id TEXT NOT NULL REFERENCES poets(id),
			to_poet_id   TEXT NOT NULL REFERENCES poets(id),
			weight       INTEGER NOT NULL DEFAULT 1,
			PRIMARY KEY (from_poet_id, to_poet_id)
		);`,
		`CREATE INDEX IF NOT EXISTS idx_gift_from ON gift_edges(from_poet_id);`,
		`CREATE INDEX IF NOT EXISTS idx_gift_to ON gift_edges(to_poet_id);`,

		// ── charset ──
		`CREATE TABLE IF NOT EXISTS charset (
			id   INTEGER PRIMARY KEY,
			char TEXT NOT NULL UNIQUE
		);`,
		`CREATE INDEX IF NOT EXISTS idx_charset_char ON charset(char);`,

		// ── lexicon ──
		`CREATE TABLE IF NOT EXISTS lexicon_meta (
			key TEXT PRIMARY KEY,
			val TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS lexicon_tone (
			char_id INTEGER PRIMARY KEY REFERENCES charset(id),
			tone    INTEGER NOT NULL,
			rhyme   INTEGER,
			ping_rank INTEGER,
			ze_rank   INTEGER
		);`,
		`CREATE TABLE IF NOT EXISTS lexicon_rhyme_groups (
			id   INTEGER PRIMARY KEY,
			size INTEGER NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS lexicon_rhyme_members (
			group_id INTEGER REFERENCES lexicon_rhyme_groups(id),
			char_id  INTEGER REFERENCES charset(id),
			rank     INTEGER,
			PRIMARY KEY (group_id, char_id)
		);`,
	}
}
