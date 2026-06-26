package main

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"

	"shiyun-backend/internal/db"
)

// ── Ingestible JSON shapes ──

type poetIndexEntry struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Dynasty     string  `json:"dynasty"`
	PoemCount   int     `json:"poemCount"`
	ClusterSize float64 `json:"clusterSize"`
}

type charsetJSON struct {
	Version int    `json:"version"`
	N       int    `json:"n"`
	Hash    string `json:"hash"`
	Chars   string `json:"chars"`
}

type giftsJSON struct {
	Version   int     `json:"version"`
	EdgeCount int     `json:"edgeCount"`
	Edges     [][]any `json:"edges"`
}

type manifestJSON struct {
	Version   int      `json:"version"`
	N         int      `json:"n"`
	PoetCount int      `json:"poetCount"`
	PoemCount int      `json:"poemCount"`
	Buckets   []string `json:"buckets"`
}

type poemRecordJSON struct {
	Title string   `json:"t"`
	Form  string   `json:"f"`
	Lines []string `json:"p"`
}

// poemShardJSON is a flat map: { "poetId": [{t,f,p}, ...], ... }
type poemShardJSON = map[string][]poemRecordJSON

func main() {
	log.SetFlags(log.Ltime)
	dataDir := flagDataDir()
	srcDir := flagSrcDir()

	log.Printf("source data: %s", srcDir)
	log.Printf("database:    %s", dataDir)

	// Open DB
	dbPath := db.DefaultPath(dataDir)
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		log.Fatalf("mkdir %s: %v", dataDir, err)
	}
	sqlDB, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer sqlDB.Close()

	// 1. Charset
	log.Println("--- charset ---")
	charset := mustReadJSON[charsetJSON](srcDir, "charset.json")
	n, err := db.InsertCharset(sqlDB, charset.Chars)
	must("charset insert", err)
	log.Printf("  inserted %d chars (N=%d)", n, charset.N)

	// 2. Lexicon
	log.Println("--- lexicon ---")
	lex := mustReadJSON[db.LexiconAsset](srcDir, "lexicon.json")
	must("lexicon insert", db.InsertLexicon(sqlDB, &lex))
	log.Printf("  inserted lexicon (N=%d, rhyme groups=%d)", lex.N, len(lex.RhymeMembers))

	// 3. Poets
	log.Println("--- poets ---")
	poets := mustReadJSON[[]poetIndexEntry](srcDir, "poets.index.json")
	for _, p := range poets {
		must("poet insert", db.InsertPoet(sqlDB, db.Poet{
			ID:          p.ID,
			Name:        p.Name,
			Dynasty:     p.Dynasty,
			PoemCount:   p.PoemCount,
			ClusterSize: p.ClusterSize,
		}))
	}
	pc, _ := db.PoetCount(sqlDB)
	log.Printf("  inserted %d/%d poets", pc, len(poets))

	// 4. Poems (if poems/ directory exists)
	log.Println("--- poems ---")
	poemDir := filepath.Join(srcDir, "poems")
	if info, err := os.Stat(poemDir); err == nil && info.IsDir() {
		manifest := mustReadJSON[manifestJSON](srcDir, "manifest.json")
		total := 0
		for _, b := range manifest.Buckets {
			shard := mustReadJSON[poemShardJSON](poemDir, b+".json")
			for poetID, records := range shard {
				var poems []db.Poem
				for _, r := range records {
					poems = append(poems, db.Poem{
						PoetID:  poetID,
						Title:   r.Title,
						Form:    r.Form,
						Lines:   r.Lines,
						Content: strings.Join(r.Lines, "\n"),
					})
				}
				if err := db.InsertPoemsBatch(sqlDB, poetID, poems); err != nil {
					log.Printf("  WARN: poet %s poems insert: %v", poetID, err)
				}
				total += len(poems)
			}
		}
		pc, _ := db.PoemCount(sqlDB)
		log.Printf("  inserted %d/%d poems", pc, total)
	} else {
		log.Println("  poems/ not found — run pipeline first or import later")
	}

	// 5. Gifts
	log.Println("--- gifts ---")
	gifts := mustReadJSON[giftsJSON](srcDir, "gifts.json")
	var edges []db.GiftEdge
	for _, e := range gifts.Edges {
		if len(e) < 3 {
			continue
		}
		from, _ := e[0].(string)
		to, _ := e[1].(string)
		w, _ := e[2].(float64)
		edges = append(edges, db.GiftEdge{From: from, To: to, Weight: int(w)})
	}
	must("gift insert", db.InsertGifts(sqlDB, edges))
	gec, _ := db.GiftEdgeCount(sqlDB)
	log.Printf("  inserted %d/%d edges", gec, len(edges))

	log.Println("--- DONE ---")
}

// ── helpers ──

func flagDataDir() string {
	if d, ok := os.LookupEnv("SHIYUN_DATA_DIR"); ok {
		return d
	}
	return filepath.Join(".", "data")
}

func flagSrcDir() string {
	if d, ok := os.LookupEnv("SHIYUN_SRC_DATA"); ok {
		return d
	}
	return filepath.Join("..", "public", "data")
}

func mustReadJSON[T any](dir, file string) T {
	path := filepath.Join(dir, file)
	data, err := os.ReadFile(path)
	if err != nil {
		log.Fatalf("read %s: %v", path, err)
	}
	var v T
	if err := json.Unmarshal(data, &v); err != nil {
		log.Fatalf("parse %s: %v", path, err)
	}
	return v
}

func must(context string, err error) {
	if err != nil {
		log.Fatalf("%s: %v", context, err)
	}
}
