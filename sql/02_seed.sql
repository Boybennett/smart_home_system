-- Smart Home Demo — Mock Data
-- Run as: psql -d smart_home -f 02_seed.sql

-- USERS
INSERT INTO users (full_name, email, phone) VALUES
    ('Amara Obi',        'amara@obiveri.com',   '+234-801-000-0001'),
    ('Chidi Obi',        'chidi@obiveri.com',   '+234-801-000-0002'),
    ('Ngozi Eze',        'ngozi@example.com',   '+234-801-000-0003'),
    ('Tunde Bakare',     'tunde@example.com',   '+234-801-000-0004');

-- HOMES
INSERT INTO homes (name, address, timezone) VALUES
    ('Obiveri Residence', '12 Palm Grove Street, Lekki, Lagos', 'Africa/Lagos'),
    ('Eze Family Home',   '4 Ridge Road, Enugu',                 'Africa/Lagos');

-- HOUSEHOLD_MEMBERS (M:N users <-> homes, with role)
INSERT INTO household_members (home_id, user_id, role) VALUES
    (1, 1, 'owner'),    -- Amara owns Obiveri Residence
    (1, 2, 'member'),   -- Chidi lives there too
    (1, 4, 'guest'),    -- Tunde is a guest with temporary access
    (2, 3, 'owner');    -- Ngozi owns the Eze Family Home

-- ROOMS (belong to one home each)
INSERT INTO rooms (home_id, name, floor) VALUES
    (1, 'Living Room', 0),
    (1, 'Kitchen',     0),
    (1, 'Main Bedroom',1),
    (1, 'Front Porch', 0),
    (2, 'Living Room', 0),
    (2, 'Bedroom',     1);

-- DEVICE_TYPES (lookup)
INSERT INTO device_types (name, category) VALUES
    ('Smart Light',    'lighting'),
    ('Thermostat',     'climate'),
    ('Smart Lock',     'security'),
    ('Security Camera','security'),
    ('Motion Sensor',  'security'),
    ('Smart Plug',     'energy');

-- DEVICES (one room, one type each)
INSERT INTO devices (room_id, device_type_id, name, manufacturer, status, is_online) VALUES
    (1, 1, 'Living Room Lamp',      'Philips Hue', 'off',    true),   -- 1
    (1, 4, 'Living Room Camera',    'Ring',        'active', true),   -- 2
    (2, 6, 'Kitchen Coffee Maker',  'TP-Link',     'off',    true),   -- 3
    (3, 2, 'Bedroom Thermostat',    'Nest',        '21C',    true),   -- 4
    (4, 3, 'Front Door Lock',       'August',      'locked', true),   -- 5
    (4, 5, 'Porch Motion Sensor',   'Ring',        'idle',   true),   -- 6
    (5, 1, 'Living Room Light',     'Xiaomi',      'on',     true),   -- 7
    (6, 2, 'Bedroom Thermostat',    'Ecobee',      '19C',    false);  -- 8 (offline)

-- DEVICE_EVENTS (history log per device)
INSERT INTO device_events (device_id, event_type, value, recorded_at) VALUES
    (1, 'state_change',        'on',        now() - interval '2 hours'),
    (1, 'state_change',        'off',       now() - interval '1 hour'),
    (4, 'temperature_reading', '21.0',      now() - interval '3 hours'),
    (4, 'temperature_reading', '21.5',      now() - interval '1 hour'),
    (5, 'state_change',        'unlocked',  now() - interval '5 hours'),
    (5, 'state_change',        'locked',    now() - interval '4 hours'),
    (6, 'motion_detected',     'detected',  now() - interval '30 minutes'),
    (6, 'motion_detected',     'clear',     now() - interval '20 minutes'),
    (8, 'temperature_reading', '19.0',      now() - interval '6 hours');

-- AUTOMATION_RULES (trigger device -> action device)
INSERT INTO automation_rules (home_id, created_by, name, trigger_device_id, trigger_condition, action_device_id, action_command, is_enabled) VALUES
    (1, 1, 'Porch light on when motion detected', 6, 'motion = detected', 1, 'turn_on', true),
    (1, 1, 'Lock door at night',                   5, 'time = 22:00',      5, 'lock',    true),
    (2, 3, 'Warm up bedroom in the morning',       8, 'time = 06:00',      8, 'set_21C', false);
