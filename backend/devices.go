package main

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
)

const deviceSelect = `
	SELECT d.device_id, d.room_id, d.device_type_id, d.name, d.manufacturer,
	       d.status, d.is_online, d.installed_at,
	       rm.name, rm.home_id, dt.name, dt.category
	FROM devices d
	JOIN rooms rm ON rm.room_id = d.room_id
	JOIN device_types dt ON dt.device_type_id = d.device_type_id
`

func scanDevice(row interface{ Scan(...any) error }) (Device, error) {
	var d Device
	err := row.Scan(&d.DeviceID, &d.RoomID, &d.DeviceTypeID, &d.Name, &d.Manufacturer,
		&d.Status, &d.IsOnline, &d.InstalledAt,
		&d.RoomName, &d.HomeID2, &d.DeviceTypeName, &d.Category)
	return d, err
}

func (a *api) listHomeDevices(w http.ResponseWriter, r *http.Request) {
	homeID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid home id")
		return
	}
	rows, err := a.db.Query(r.Context(), deviceSelect+` WHERE rm.home_id = $1 ORDER BY rm.name, d.name`, homeID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	devices := []Device{}
	for rows.Next() {
		d, err := scanDevice(rows)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		devices = append(devices, d)
	}
	writeJSON(w, http.StatusOK, devices)
}

func (a *api) listRoomDevices(w http.ResponseWriter, r *http.Request) {
	roomID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid room id")
		return
	}
	rows, err := a.db.Query(r.Context(), deviceSelect+` WHERE d.room_id = $1 ORDER BY d.name`, roomID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	devices := []Device{}
	for rows.Next() {
		d, err := scanDevice(rows)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		devices = append(devices, d)
	}
	writeJSON(w, http.StatusOK, devices)
}

func (a *api) getDevice(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid device id")
		return
	}
	row := a.db.QueryRow(r.Context(), deviceSelect+` WHERE d.device_id = $1`, id)
	d, err := scanDevice(row)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "device not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, d)
}

func (a *api) createDevice(w http.ResponseWriter, r *http.Request) {
	roomID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid room id")
		return
	}
	var in struct {
		DeviceTypeID int     `json:"device_type_id"`
		Name         string  `json:"name"`
		Manufacturer *string `json:"manufacturer"`
		Status       string  `json:"status"`
	}
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if in.Name == "" || in.DeviceTypeID == 0 {
		writeError(w, http.StatusBadRequest, "name and device_type_id are required")
		return
	}
	if in.Status == "" {
		in.Status = "off"
	}

	var newID int
	err = a.db.QueryRow(r.Context(),
		`INSERT INTO devices (room_id, device_type_id, name, manufacturer, status)
		 VALUES ($1, $2, $3, $4, $5) RETURNING device_id`,
		roomID, in.DeviceTypeID, in.Name, in.Manufacturer, in.Status,
	).Scan(&newID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	row := a.db.QueryRow(r.Context(), deviceSelect+` WHERE d.device_id = $1`, newID)
	d, err := scanDevice(row)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, d)
}

func (a *api) updateDevice(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid device id")
		return
	}
	var in struct {
		Name         string  `json:"name"`
		Manufacturer *string `json:"manufacturer"`
		Status       string  `json:"status"`
		IsOnline     bool    `json:"is_online"`
	}
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	tag, err := a.db.Exec(r.Context(),
		`UPDATE devices SET name = $1, manufacturer = $2, status = $3, is_online = $4 WHERE device_id = $5`,
		in.Name, in.Manufacturer, in.Status, in.IsOnline, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "device not found")
		return
	}

	// Log the state change as telemetry, consistent with sql/02_seed.sql conventions.
	if _, err := a.db.Exec(r.Context(),
		`INSERT INTO device_events (device_id, event_type, value) VALUES ($1, 'state_change', $2)`,
		id, in.Status); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	row := a.db.QueryRow(r.Context(), deviceSelect+` WHERE d.device_id = $1`, id)
	d, err := scanDevice(row)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, d)
}

func (a *api) deleteDevice(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid device id")
		return
	}
	tag, err := a.db.Exec(r.Context(), `DELETE FROM devices WHERE device_id = $1`, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "device not found")
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}
