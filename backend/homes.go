package main

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
)

func (a *api) listHomes(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(),
		`SELECT home_id, name, address, timezone, created_at FROM homes ORDER BY name`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	homes := []Home{}
	for rows.Next() {
		var h Home
		if err := rows.Scan(&h.HomeID, &h.Name, &h.Address, &h.Timezone, &h.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		homes = append(homes, h)
	}
	writeJSON(w, http.StatusOK, homes)
}

func (a *api) getHome(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid home id")
		return
	}
	var h Home
	err = a.db.QueryRow(r.Context(),
		`SELECT home_id, name, address, timezone, created_at FROM homes WHERE home_id = $1`, id,
	).Scan(&h.HomeID, &h.Name, &h.Address, &h.Timezone, &h.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "home not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, h)
}

func (a *api) createHome(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name     string `json:"name"`
		Address  string `json:"address"`
		Timezone string `json:"timezone"`
	}
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if in.Name == "" || in.Address == "" {
		writeError(w, http.StatusBadRequest, "name and address are required")
		return
	}
	if in.Timezone == "" {
		in.Timezone = "Africa/Lagos"
	}

	var h Home
	err := a.db.QueryRow(r.Context(),
		`INSERT INTO homes (name, address, timezone) VALUES ($1, $2, $3)
		 RETURNING home_id, name, address, timezone, created_at`,
		in.Name, in.Address, in.Timezone,
	).Scan(&h.HomeID, &h.Name, &h.Address, &h.Timezone, &h.CreatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, h)
}

func (a *api) updateHome(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid home id")
		return
	}
	var in struct {
		Name     string `json:"name"`
		Address  string `json:"address"`
		Timezone string `json:"timezone"`
	}
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var h Home
	err = a.db.QueryRow(r.Context(),
		`UPDATE homes SET name = $1, address = $2, timezone = $3 WHERE home_id = $4
		 RETURNING home_id, name, address, timezone, created_at`,
		in.Name, in.Address, in.Timezone, id,
	).Scan(&h.HomeID, &h.Name, &h.Address, &h.Timezone, &h.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "home not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, h)
}

func (a *api) deleteHome(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid home id")
		return
	}
	tag, err := a.db.Exec(r.Context(), `DELETE FROM homes WHERE home_id = $1`, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "home not found")
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

func (a *api) getHomeSummary(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid home id")
		return
	}

	var s HomeSummary
	s.HomeID = id
	err = a.db.QueryRow(r.Context(), `
		SELECT
			(SELECT COUNT(*) FROM rooms WHERE home_id = $1),
			(SELECT COUNT(*) FROM devices d JOIN rooms rm ON rm.room_id = d.room_id WHERE rm.home_id = $1),
			(SELECT COUNT(*) FROM devices d JOIN rooms rm ON rm.room_id = d.room_id WHERE rm.home_id = $1 AND d.is_online),
			(SELECT COUNT(*) FROM household_members WHERE home_id = $1),
			(SELECT COUNT(*) FROM automation_rules WHERE home_id = $1 AND is_enabled),
			(SELECT COUNT(*) FROM automation_rules WHERE home_id = $1)
	`, id).Scan(&s.RoomCount, &s.DeviceCount, &s.OnlineCount, &s.MemberCount, &s.ActiveRules, &s.TotalRules)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, s)
}
