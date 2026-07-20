package main

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
)

const ruleSelect = `
	SELECT ar.rule_id, ar.home_id, ar.created_by, ar.name,
	       ar.trigger_device_id, ar.trigger_condition,
	       ar.action_device_id, ar.action_command,
	       ar.is_enabled, ar.created_at,
	       u.full_name, td.name, ad.name
	FROM automation_rules ar
	JOIN users u ON u.user_id = ar.created_by
	JOIN devices td ON td.device_id = ar.trigger_device_id
	JOIN devices ad ON ad.device_id = ar.action_device_id
`

func scanRule(row interface{ Scan(...any) error }) (AutomationRule, error) {
	var rule AutomationRule
	err := row.Scan(&rule.RuleID, &rule.HomeID, &rule.CreatedBy, &rule.Name,
		&rule.TriggerDeviceID, &rule.TriggerCondition,
		&rule.ActionDeviceID, &rule.ActionCommand,
		&rule.IsEnabled, &rule.CreatedAt,
		&rule.CreatedByName, &rule.TriggerDeviceName, &rule.ActionDeviceName)
	return rule, err
}

func (a *api) listHomeRules(w http.ResponseWriter, r *http.Request) {
	homeID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid home id")
		return
	}
	rows, err := a.db.Query(r.Context(), ruleSelect+` WHERE ar.home_id = $1 ORDER BY ar.created_at DESC`, homeID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	rules := []AutomationRule{}
	for rows.Next() {
		rule, err := scanRule(rows)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		rules = append(rules, rule)
	}
	writeJSON(w, http.StatusOK, rules)
}

func (a *api) createRule(w http.ResponseWriter, r *http.Request) {
	homeID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid home id")
		return
	}
	var in struct {
		CreatedBy        int    `json:"created_by"`
		Name             string `json:"name"`
		TriggerDeviceID  int    `json:"trigger_device_id"`
		TriggerCondition string `json:"trigger_condition"`
		ActionDeviceID   int    `json:"action_device_id"`
		ActionCommand    string `json:"action_command"`
	}
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if in.Name == "" || in.TriggerDeviceID == 0 || in.ActionDeviceID == 0 {
		writeError(w, http.StatusBadRequest, "name, trigger_device_id and action_device_id are required")
		return
	}

	var newID int
	err = a.db.QueryRow(r.Context(), `
		INSERT INTO automation_rules
			(home_id, created_by, name, trigger_device_id, trigger_condition, action_device_id, action_command)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING rule_id`,
		homeID, in.CreatedBy, in.Name, in.TriggerDeviceID, in.TriggerCondition, in.ActionDeviceID, in.ActionCommand,
	).Scan(&newID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	row := a.db.QueryRow(r.Context(), ruleSelect+` WHERE ar.rule_id = $1`, newID)
	rule, err := scanRule(row)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, rule)
}

func (a *api) updateRule(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid rule id")
		return
	}
	var in struct {
		Name             string `json:"name"`
		TriggerCondition string `json:"trigger_condition"`
		ActionCommand    string `json:"action_command"`
		IsEnabled        bool   `json:"is_enabled"`
	}
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	tag, err := a.db.Exec(r.Context(), `
		UPDATE automation_rules
		SET name = $1, trigger_condition = $2, action_command = $3, is_enabled = $4
		WHERE rule_id = $5`,
		in.Name, in.TriggerCondition, in.ActionCommand, in.IsEnabled, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "rule not found")
		return
	}

	row := a.db.QueryRow(r.Context(), ruleSelect+` WHERE ar.rule_id = $1`, id)
	rule, err := scanRule(row)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "rule not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rule)
}

func (a *api) deleteRule(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid rule id")
		return
	}
	tag, err := a.db.Exec(r.Context(), `DELETE FROM automation_rules WHERE rule_id = $1`, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "rule not found")
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}
