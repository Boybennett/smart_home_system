package main

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
)

func (a *api) listUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(),
		`SELECT user_id, full_name, email, phone, created_at FROM users ORDER BY full_name`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	users := []User{}
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.UserID, &u.FullName, &u.Email, &u.Phone, &u.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		users = append(users, u)
	}
	writeJSON(w, http.StatusOK, users)
}

func (a *api) getUser(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	var u User
	err = a.db.QueryRow(r.Context(),
		`SELECT user_id, full_name, email, phone, created_at FROM users WHERE user_id = $1`, id,
	).Scan(&u.UserID, &u.FullName, &u.Email, &u.Phone, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, u)
}

func (a *api) createUser(w http.ResponseWriter, r *http.Request) {
	var in struct {
		FullName string  `json:"full_name"`
		Email    string  `json:"email"`
		Phone    *string `json:"phone"`
	}
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if in.FullName == "" || in.Email == "" {
		writeError(w, http.StatusBadRequest, "full_name and email are required")
		return
	}

	var u User
	err := a.db.QueryRow(r.Context(),
		`INSERT INTO users (full_name, email, phone) VALUES ($1, $2, $3)
		 RETURNING user_id, full_name, email, phone, created_at`,
		in.FullName, in.Email, in.Phone,
	).Scan(&u.UserID, &u.FullName, &u.Email, &u.Phone, &u.CreatedAt)
	if err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, u)
}

func (a *api) updateUser(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	var in struct {
		FullName string  `json:"full_name"`
		Email    string  `json:"email"`
		Phone    *string `json:"phone"`
	}
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var u User
	err = a.db.QueryRow(r.Context(),
		`UPDATE users SET full_name = $1, email = $2, phone = $3 WHERE user_id = $4
		 RETURNING user_id, full_name, email, phone, created_at`,
		in.FullName, in.Email, in.Phone, id,
	).Scan(&u.UserID, &u.FullName, &u.Email, &u.Phone, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, u)
}

func (a *api) deleteUser(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	tag, err := a.db.Exec(r.Context(), `DELETE FROM users WHERE user_id = $1`, id)
	if err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}
