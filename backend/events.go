package main

import (
	"net/http"
	"strconv"
)

func (a *api) listDeviceEvents(w http.ResponseWriter, r *http.Request) {
	deviceID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid device id")
		return
	}

	limit := 50
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}

	rows, err := a.db.Query(r.Context(), `
		SELECT event_id, device_id, event_type, value, recorded_at
		FROM device_events
		WHERE device_id = $1
		ORDER BY recorded_at DESC
		LIMIT $2`, deviceID, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	events := []DeviceEvent{}
	for rows.Next() {
		var e DeviceEvent
		if err := rows.Scan(&e.EventID, &e.DeviceID, &e.EventType, &e.Value, &e.RecordedAt); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		events = append(events, e)
	}
	writeJSON(w, http.StatusOK, events)
}

func (a *api) createDeviceEvent(w http.ResponseWriter, r *http.Request) {
	deviceID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid device id")
		return
	}
	var in struct {
		EventType string `json:"event_type"`
		Value     string `json:"value"`
	}
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if in.EventType == "" || in.Value == "" {
		writeError(w, http.StatusBadRequest, "event_type and value are required")
		return
	}

	var e DeviceEvent
	err = a.db.QueryRow(r.Context(), `
		INSERT INTO device_events (device_id, event_type, value) VALUES ($1, $2, $3)
		RETURNING event_id, device_id, event_type, value, recorded_at`,
		deviceID, in.EventType, in.Value,
	).Scan(&e.EventID, &e.DeviceID, &e.EventType, &e.Value, &e.RecordedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, e)
}
