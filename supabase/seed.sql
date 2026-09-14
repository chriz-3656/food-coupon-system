-- seed.sql
-- Run this if you want to test the system with some dummy data.

INSERT INTO event_config (event_name, registration_open) 
VALUES ('Spring Festival Food Distribution', true)
ON CONFLICT (id) DO NOTHING;

-- You can safely run this on a fresh database to ensure settings exist.
