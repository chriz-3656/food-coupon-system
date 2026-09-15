-- Canonical seed based on recreate_database.sql
INSERT INTO event_config (event_name, registration_open, coupon_expires_at) 
VALUES ('Food Distribution', true, now() + interval '1 day')
ON CONFLICT (id) DO NOTHING;
