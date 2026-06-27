package main

import (
	"log"
	"net/http"
	"os"

	"shiyun-backend/internal/api"
	"shiyun-backend/internal/db"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	dataDir := os.Getenv("SHIYUN_DATA_DIR")
	if dataDir == "" {
		dataDir = "data"
	}

	sqlDB, err := db.Open(db.DefaultPath(dataDir))
	if err != nil {
		log.Fatalf("db open: %v", err)
	}
	defer sqlDB.Close()

	if err := api.LoadEngine(sqlDB); err != nil {
		log.Fatalf("engine load: %v", err)
	}
	log.Println("engine data loaded")

	handler := api.NewRouter(sqlDB)

	log.Printf("shiyun-backend listening on :%s", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("server: %v", err)
	}
}
