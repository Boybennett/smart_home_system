package main

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
)

func (a *api) listHomeRooms(w http.ResponseWriter, r *http.Request) {
	homeID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid home id")
		return
	}
	rows, err := a.db.Query(r.Context(),
		`SELECT room_id, home_id, name, floor FROM rooms WHERE home_id = $1 ORDER BY floor, name`, homeID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	rooms := []Room{}
	for rows.Next() {
		var rm Room
		if err := rows.Scan(&rm.RoomID, &rm.HomeID, &rm.Name, &rm.Floor); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		rooms = append(rooms, rm)
	}
	writeJSON(w, http.StatusOK, rooms)
}

func (a *api) createRoom(w http.ResponseWriter, r *http.Request) {
	homeID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid home id")
		return
	}
	var in struct {
		Name  string `json:"name"`
		Floor int    `json:"floor"`
	}
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if in.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	var rm Room
	err = a.db.QueryRow(r.Context(),
		`INSERT INTO rooms (home_id, name, floor) VALUES ($1, $2, $3)
		 RETURNING room_id, home_id, name, floor`,
		homeID, in.Name, in.Floor,
	).Scan(&rm.RoomID, &rm.HomeID, &rm.Name, &rm.Floor)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, rm)
}

func (a *api) updateRoom(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid room id")
		return
	}
	var in struct {
		Name  string `json:"name"`
		Floor int    `json:"floor"`
	}
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var rm Room
	err = a.db.QueryRow(r.Context(),
		`UPDATE rooms SET name = $1, floor = $2 WHERE room_id = $3
		 RETURNING room_id, home_id, name, floor`,
		in.Name, in.Floor, id,
	).Scan(&rm.RoomID, &rm.HomeID, &rm.Name, &rm.Floor)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "room not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rm)
}

func (a *api) deleteRoom(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid room id")
		return
	}
	tag, err := a.db.Exec(r.Context(), `DELETE FROM rooms WHERE room_id = $1`, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "room not found")
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}
