package main

import (
	"net/http"
	"strconv"
)

func (a *api) listHomeMembers(w http.ResponseWriter, r *http.Request) {
	homeID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid home id")
		return
	}
	rows, err := a.db.Query(r.Context(), `
		SELECT hm.home_id, hm.user_id, hm.role, hm.joined_at, u.full_name, u.email
		FROM household_members hm
		JOIN users u ON u.user_id = hm.user_id
		WHERE hm.home_id = $1
		ORDER BY hm.role, u.full_name`, homeID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	members := []HouseholdMember{}
	for rows.Next() {
		var m HouseholdMember
		if err := rows.Scan(&m.HomeID, &m.UserID, &m.Role, &m.JoinedAt, &m.FullName, &m.Email); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		members = append(members, m)
	}
	writeJSON(w, http.StatusOK, members)
}

func (a *api) addHomeMember(w http.ResponseWriter, r *http.Request) {
	homeID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid home id")
		return
	}
	var in struct {
		UserID int    `json:"user_id"`
		Role   string `json:"role"`
	}
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if in.Role != "owner" && in.Role != "member" && in.Role != "guest" {
		writeError(w, http.StatusBadRequest, "role must be one of owner, member, guest")
		return
	}

	var m HouseholdMember
	err = a.db.QueryRow(r.Context(), `
		INSERT INTO household_members (home_id, user_id, role) VALUES ($1, $2, $3)
		RETURNING home_id, user_id, role, joined_at`,
		homeID, in.UserID, in.Role,
	).Scan(&m.HomeID, &m.UserID, &m.Role, &m.JoinedAt)
	if err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, m)
}

func (a *api) updateHomeMember(w http.ResponseWriter, r *http.Request) {
	homeID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid home id")
		return
	}
	userID, err := strconv.Atoi(r.PathValue("user_id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	var in struct {
		Role string `json:"role"`
	}
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if in.Role != "owner" && in.Role != "member" && in.Role != "guest" {
		writeError(w, http.StatusBadRequest, "role must be one of owner, member, guest")
		return
	}

	tag, err := a.db.Exec(r.Context(),
		`UPDATE household_members SET role = $1 WHERE home_id = $2 AND user_id = $3`,
		in.Role, homeID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "membership not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (a *api) removeHomeMember(w http.ResponseWriter, r *http.Request) {
	homeID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid home id")
		return
	}
	userID, err := strconv.Atoi(r.PathValue("user_id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	tag, err := a.db.Exec(r.Context(),
		`DELETE FROM household_members WHERE home_id = $1 AND user_id = $2`, homeID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "membership not found")
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}
