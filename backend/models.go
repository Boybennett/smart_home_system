package main

import "time"

type User struct {
	UserID    int       `json:"user_id"`
	FullName  string    `json:"full_name"`
	Email     string    `json:"email"`
	Phone     *string   `json:"phone"`
	CreatedAt time.Time `json:"created_at"`
}

type Home struct {
	HomeID    int       `json:"home_id"`
	Name      string    `json:"name"`
	Address   string    `json:"address"`
	Timezone  string    `json:"timezone"`
	CreatedAt time.Time `json:"created_at"`
}

type HouseholdMember struct {
	HomeID   int       `json:"home_id"`
	UserID   int       `json:"user_id"`
	Role     string    `json:"role"`
	JoinedAt time.Time `json:"joined_at"`
	FullName string    `json:"full_name,omitempty"`
	Email    string    `json:"email,omitempty"`
}

type Room struct {
	RoomID  int    `json:"room_id"`
	HomeID  int    `json:"home_id"`
	Name    string `json:"name"`
	Floor   int    `json:"floor"`
}

type DeviceType struct {
	DeviceTypeID int    `json:"device_type_id"`
	Name         string `json:"name"`
	Category     string `json:"category"`
}

type Device struct {
	DeviceID     int       `json:"device_id"`
	RoomID       int       `json:"room_id"`
	DeviceTypeID int       `json:"device_type_id"`
	Name         string    `json:"name"`
	Manufacturer *string   `json:"manufacturer"`
	Status       string    `json:"status"`
	IsOnline     bool      `json:"is_online"`
	InstalledAt  time.Time `json:"installed_at"`

	// Joined convenience fields (populated on list/detail queries)
	RoomName       string `json:"room_name,omitempty"`
	HomeID2        int    `json:"home_id,omitempty"`
	DeviceTypeName string `json:"device_type_name,omitempty"`
	Category       string `json:"category,omitempty"`
}

type DeviceEvent struct {
	EventID    int64     `json:"event_id"`
	DeviceID   int       `json:"device_id"`
	EventType  string    `json:"event_type"`
	Value      string    `json:"value"`
	RecordedAt time.Time `json:"recorded_at"`
}

type AutomationRule struct {
	RuleID           int       `json:"rule_id"`
	HomeID           int       `json:"home_id"`
	CreatedBy        int       `json:"created_by"`
	Name             string    `json:"name"`
	TriggerDeviceID  int       `json:"trigger_device_id"`
	TriggerCondition string    `json:"trigger_condition"`
	ActionDeviceID   int       `json:"action_device_id"`
	ActionCommand    string    `json:"action_command"`
	IsEnabled        bool      `json:"is_enabled"`
	CreatedAt        time.Time `json:"created_at"`

	// Joined convenience fields
	CreatedByName    string `json:"created_by_name,omitempty"`
	TriggerDeviceName string `json:"trigger_device_name,omitempty"`
	ActionDeviceName  string `json:"action_device_name,omitempty"`
}

type HomeSummary struct {
	HomeID        int `json:"home_id"`
	RoomCount     int `json:"room_count"`
	DeviceCount   int `json:"device_count"`
	OnlineCount   int `json:"online_count"`
	MemberCount   int `json:"member_count"`
	ActiveRules   int `json:"active_rules"`
	TotalRules    int `json:"total_rules"`
}
