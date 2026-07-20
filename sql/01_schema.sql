-- Smart Home Demo — Physical Schema (PostgreSQL)
-- Run as: psql -d smart_home -f 01_schema.sql

DROP TABLE IF EXISTS automation_rules CASCADE;
DROP TABLE IF EXISTS device_events CASCADE;
DROP TABLE IF EXISTS devices CASCADE;
DROP TABLE IF EXISTS device_types CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS household_members CASCADE;
DROP TABLE IF EXISTS homes CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. USERS
-- People who can access the system. Independent of any one home so the
-- same person can belong to multiple households (M:N with homes).
CREATE TABLE users (
    user_id     SERIAL PRIMARY KEY,
    full_name   TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    phone       TEXT,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);

-- 2. HOMES
-- A physical property running the smart home system. Deliberately has no
-- "owner_id" column — ownership is just a role inside household_members,
-- so a home isn't forced to have exactly one fixed owner column.
CREATE TABLE homes (
    home_id     SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    address     TEXT NOT NULL,
    timezone    TEXT NOT NULL DEFAULT 'Africa/Lagos',
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);

-- 3. HOUSEHOLD_MEMBERS (associative/junction entity)
-- Resolves the M:N relationship between users and homes: one user can
-- belong to several homes (e.g. own home + parents' home), and one home
-- has several users (family members). "role" carries the relationship's
-- own attribute (owner/member/guest), which is why it can't just be a
-- plain FK on either side.
CREATE TABLE household_members (
    home_id     INTEGER NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('owner', 'member', 'guest')),
    joined_at   TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (home_id, user_id)
);

-- 4. ROOMS
-- A home is physically divided into rooms. 1:N from homes -> rooms
-- (a room belongs to exactly one home; a home has many rooms).
CREATE TABLE rooms (
    room_id     SERIAL PRIMARY KEY,
    home_id     INTEGER NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    floor       INTEGER NOT NULL DEFAULT 0
);

-- 5. DEVICE_TYPES (lookup/reference entity)
-- Normalizes the fixed vocabulary of device kinds instead of hardcoding
-- a free-text "type" string on every device row. 1:N -> devices.
CREATE TABLE device_types (
    device_type_id  SERIAL PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,   -- e.g. 'Smart Light', 'Thermostat'
    category        TEXT NOT NULL           -- e.g. 'lighting', 'climate', 'security'
);

-- 6. DEVICES
-- A physical smart device installed in one room. 1:N from rooms -> devices
-- and from device_types -> devices.
CREATE TABLE devices (
    device_id       SERIAL PRIMARY KEY,
    room_id         INTEGER NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
    device_type_id  INTEGER NOT NULL REFERENCES device_types(device_type_id),
    name            TEXT NOT NULL,
    manufacturer    TEXT,
    status          TEXT NOT NULL DEFAULT 'off',  -- current simple state e.g. on/off/locked
    is_online       BOOLEAN NOT NULL DEFAULT true,
    installed_at    TIMESTAMP NOT NULL DEFAULT now()
);

-- 7. DEVICE_EVENTS
-- Append-only history/telemetry log for a device: every state change or
-- sensor reading. 1:N from devices -> device_events. Kept generic
-- (event_type + value as text) since this is a mock demo, not a
-- production time-series store.
CREATE TABLE device_events (
    event_id     BIGSERIAL PRIMARY KEY,
    device_id    INTEGER NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    event_type   TEXT NOT NULL,   -- e.g. 'state_change', 'temperature_reading', 'motion_detected'
    value        TEXT NOT NULL,   -- e.g. 'on', '22.5', 'detected'
    recorded_at  TIMESTAMP NOT NULL DEFAULT now()
);

-- 8. AUTOMATION_RULES
-- A simple "if trigger device meets condition, run action on action
-- device" rule. Two FKs into devices (trigger_device_id, action_device_id)
-- model that a rule reads one device and acts on another (or the same
-- one). Tied to a home (scope) and to the user who authored it.
CREATE TABLE automation_rules (
    rule_id             SERIAL PRIMARY KEY,
    home_id             INTEGER NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
    created_by          INTEGER NOT NULL REFERENCES users(user_id),
    name                TEXT NOT NULL,
    trigger_device_id   INTEGER NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    trigger_condition   TEXT NOT NULL,   -- e.g. 'motion = detected'
    action_device_id    INTEGER NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    action_command      TEXT NOT NULL,   -- e.g. 'turn_on'
    is_enabled          BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMP NOT NULL DEFAULT now()
);

-- Helpful indexes for the FK columns most queried against
CREATE INDEX idx_rooms_home ON rooms(home_id);
CREATE INDEX idx_devices_room ON devices(room_id);
CREATE INDEX idx_devices_type ON devices(device_type_id);
CREATE INDEX idx_events_device ON device_events(device_id);
CREATE INDEX idx_rules_home ON automation_rules(home_id);
