package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

type api struct {
	db *pgxpool.Pool
}

func main() {

	err := godotenv.Load() // Load environment variables from .env file
	if err != nil {
		log.Fatalf("error loading .env file: %v", err)
	}
	
	pool := mustConnectDB()
	defer pool.Close()

	a := &api{db: pool}

	mux := http.NewServeMux()

	// Health
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Users
	mux.HandleFunc("GET /api/users", a.listUsers)
	mux.HandleFunc("POST /api/users", a.createUser)
	mux.HandleFunc("GET /api/users/{id}", a.getUser)
	mux.HandleFunc("PUT /api/users/{id}", a.updateUser)
	mux.HandleFunc("DELETE /api/users/{id}", a.deleteUser)

	// Homes
	mux.HandleFunc("GET /api/homes", a.listHomes)
	mux.HandleFunc("POST /api/homes", a.createHome)
	mux.HandleFunc("GET /api/homes/{id}", a.getHome)
	mux.HandleFunc("PUT /api/homes/{id}", a.updateHome)
	mux.HandleFunc("DELETE /api/homes/{id}", a.deleteHome)
	mux.HandleFunc("GET /api/homes/{id}/summary", a.getHomeSummary)

	// Household members (nested under home)
	mux.HandleFunc("GET /api/homes/{id}/members", a.listHomeMembers)
	mux.HandleFunc("POST /api/homes/{id}/members", a.addHomeMember)
	mux.HandleFunc("PUT /api/homes/{id}/members/{user_id}", a.updateHomeMember)
	mux.HandleFunc("DELETE /api/homes/{id}/members/{user_id}", a.removeHomeMember)

	// Rooms (nested under home) + direct room mutation
	mux.HandleFunc("GET /api/homes/{id}/rooms", a.listHomeRooms)
	mux.HandleFunc("POST /api/homes/{id}/rooms", a.createRoom)
	mux.HandleFunc("PUT /api/rooms/{id}", a.updateRoom)
	mux.HandleFunc("DELETE /api/rooms/{id}", a.deleteRoom)

	// Device types (global lookup)
	mux.HandleFunc("GET /api/device-types", a.listDeviceTypes)
	mux.HandleFunc("POST /api/device-types", a.createDeviceType)
	mux.HandleFunc("DELETE /api/device-types/{id}", a.deleteDeviceType)

	// Devices
	mux.HandleFunc("GET /api/homes/{id}/devices", a.listHomeDevices)
	mux.HandleFunc("GET /api/rooms/{id}/devices", a.listRoomDevices)
	mux.HandleFunc("POST /api/rooms/{id}/devices", a.createDevice)
	mux.HandleFunc("GET /api/devices/{id}", a.getDevice)
	mux.HandleFunc("PUT /api/devices/{id}", a.updateDevice)
	mux.HandleFunc("DELETE /api/devices/{id}", a.deleteDevice)

	// Device events (telemetry log)
	mux.HandleFunc("GET /api/devices/{id}/events", a.listDeviceEvents)
	mux.HandleFunc("POST /api/devices/{id}/events", a.createDeviceEvent)

	// Automation rules
	mux.HandleFunc("GET /api/homes/{id}/rules", a.listHomeRules)
	mux.HandleFunc("POST /api/homes/{id}/rules", a.createRule)
	mux.HandleFunc("PUT /api/rules/{id}", a.updateRule)
	mux.HandleFunc("DELETE /api/rules/{id}", a.deleteRule)

	handler := withCORS(withLogging(mux))

	port := os.Getenv("PORT")

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      handler,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	log.Printf("smart home API listening on :%s", port)
	log.Fatal(srv.ListenAndServe())
}
