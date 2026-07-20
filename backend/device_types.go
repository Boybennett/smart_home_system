package main

import (
	"net/http"
	"strconv"
)

func (a *api) listDeviceTypes(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(),
		`SELECT device_type_id, name, category FROM device_types ORDER BY category, name`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	types := []DeviceType{}
	for rows.Next() {
		var dt DeviceType
		if err := rows.Scan(&dt.DeviceTypeID, &dt.Name, &dt.Category); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		types = append(types, dt)
	}
	writeJSON(w, http.StatusOK, types)
}

func (a *api) createDeviceType(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name     string `json:"name"`
		Category string `json:"category"`
	}
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if in.Name == "" || in.Category == "" {
		writeError(w, http.StatusBadRequest, "name and category are required")
		return
	}

	var dt DeviceType
	err := a.db.QueryRow(r.Context(),
		`INSERT INTO device_types (name, category) VALUES ($1, $2)
		 RETURNING device_type_id, name, category`,
		in.Name, in.Category,
	).Scan(&dt.DeviceTypeID, &dt.Name, &dt.Category)
	if err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, dt)
}

func (a *api) deleteDeviceType(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid device type id")
		return
	}
	tag, err := a.db.Exec(r.Context(), `DELETE FROM device_types WHERE device_type_id = $1`, id)
	if err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "device type not found")
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}
