-- recreate_database.sql
-- This script completely deletes the existing tables and recreates them.
-- WARNING: This will permanently delete all existing student and coupon data!

-- 1. Drop existing tables if they exist
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS redemptions CASCADE;
DROP TABLE IF EXISTS coupons CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS event_config CASCADE;

-- Drop old functions
DROP FUNCTION IF EXISTS redeem_coupon(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS redeem_coupon(TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS register_student_and_coupon(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS get_dashboard_stats();

-- 2. Create the tables
CREATE TABLE event_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,
    registration_open BOOLEAN DEFAULT true,
    registration_closes_at TIMESTAMPTZ,
    coupon_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    student_id TEXT NOT NULL, -- Roll No (No longer unique)
    phone TEXT UNIQUE NOT NULL, -- Mobile Number is now the unique identifier
    department TEXT,
    year TEXT,
    verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
    created_at TIMESTAMPTZ DEFAULT now(),
    verified_at TIMESTAMPTZ,
    verified_by TEXT
);

CREATE TABLE coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID UNIQUE REFERENCES students(id) ON DELETE CASCADE,
    coupon_code TEXT UNIQUE NOT NULL,
    coupon_token TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'USED', 'EXPIRED', 'REVOKED')),
    created_at TIMESTAMPTZ DEFAULT now(),
    activated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,
    used_by TEXT
);

CREATE TABLE redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID REFERENCES coupons(id) ON DELETE CASCADE,
    redeemed_at TIMESTAMPTZ DEFAULT now(),
    volunteer_id TEXT,
    verification_method TEXT CHECK (verification_method IN ('QR', 'MANUAL')),
    request_id TEXT,
    ip_address TEXT,
    user_agent TEXT
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    actor TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create Indexes
CREATE INDEX idx_students_student_id ON students(student_id);
CREATE INDEX idx_students_verification_status ON students(verification_status);
CREATE INDEX idx_coupons_coupon_code ON coupons(coupon_code);
CREATE INDEX idx_coupons_coupon_token ON coupons(coupon_token);
CREATE INDEX idx_coupons_status ON coupons(status);
CREATE INDEX idx_coupons_expires_at ON coupons(expires_at);

-- 4. Enable Row Level Security (Lockdown)
ALTER TABLE event_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 5. Seed initial config (default expiration is end of day for example, or leave null for no default, let's say tomorrow)
INSERT INTO event_config (event_name, registration_open, coupon_expires_at) 
VALUES ('Food Distribution', true, now() + interval '1 day')
ON CONFLICT (id) DO NOTHING;

-- 6. Recreate the atomic redemption function
CREATE OR REPLACE FUNCTION redeem_coupon(
    p_coupon_token TEXT,
    p_coupon_code TEXT,
    p_volunteer_id TEXT,
    p_verification_method TEXT,
    p_request_id TEXT DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coupon RECORD;
    v_student RECORD;
BEGIN
    IF p_coupon_token IS NOT NULL THEN
        SELECT * INTO v_coupon FROM coupons WHERE coupon_token = p_coupon_token FOR UPDATE;
    ELSE
        SELECT * INTO v_coupon FROM coupons WHERE coupon_code = p_coupon_code FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'COUPON_NOT_FOUND', 'message', 'This coupon could not be verified.');
    END IF;

    IF v_coupon.status = 'USED' THEN
        RETURN jsonb_build_object('success', false, 'code', 'COUPON_ALREADY_USED', 'message', 'This coupon has already been redeemed.', 'redeemed_at', v_coupon.used_at);
    END IF;

    IF v_coupon.status = 'REVOKED' THEN
        RETURN jsonb_build_object('success', false, 'code', 'COUPON_REVOKED', 'message', 'This coupon has been revoked.');
    END IF;

    IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < NOW() THEN
        RETURN jsonb_build_object('success', false, 'code', 'COUPON_EXPIRED', 'message', 'This coupon has expired.');
    END IF;

    IF v_coupon.status != 'ACTIVE' THEN
        RETURN jsonb_build_object('success', false, 'code', 'COUPON_INVALID_STATUS', 'message', 'This coupon is not active. Status: ' || v_coupon.status);
    END IF;

    UPDATE coupons SET status = 'USED', used_at = NOW(), used_by = p_volunteer_id WHERE id = v_coupon.id;

    SELECT * INTO v_student FROM students WHERE id = v_coupon.student_id;

    INSERT INTO redemptions (coupon_id, volunteer_id, verification_method, request_id) VALUES (v_coupon.id, p_volunteer_id, p_verification_method, p_request_id);
    INSERT INTO audit_logs (action, entity_type, entity_id, actor) VALUES ('REDEEM', 'coupons', v_coupon.id, p_volunteer_id);

    RETURN jsonb_build_object(
        'success', true, 
        'status', 'REDEEMED', 
        'message', 'Coupon successfully redeemed.',
        'student', jsonb_build_object('name', v_student.name, 'student_id', v_student.student_id, 'department', v_student.department),
        'coupon_code', v_coupon.coupon_code,
        'redeemed_at', NOW()
    );
END;
$$;

-- Revoke public access to redeem_coupon
REVOKE ALL ON FUNCTION redeem_coupon(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION redeem_coupon(TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION redeem_coupon(TEXT, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION redeem_coupon(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- 7. Add RPC for transactional registration
CREATE OR REPLACE FUNCTION register_student_and_coupon(
    p_name TEXT,
    p_student_id TEXT,
    p_phone TEXT,
    p_department TEXT,
    p_year TEXT,
    p_coupon_code TEXT,
    p_coupon_token TEXT
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_config RECORD;
    v_expires_at TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_config FROM event_config LIMIT 1;
    IF v_config.registration_open = false OR (v_config.registration_closes_at IS NOT NULL AND v_config.registration_closes_at < now()) THEN
        RETURN jsonb_build_object('success', false, 'code', 'REGISTRATION_CLOSED');
    END IF;

    v_expires_at := v_config.coupon_expires_at;

    INSERT INTO students (name, student_id, phone, department, year, verification_status, verified_at, verified_by)
    VALUES (p_name, p_student_id, p_phone, p_department, p_year, 'VERIFIED', now(), 'system')
    RETURNING id INTO v_student_id;

    INSERT INTO coupons (student_id, coupon_code, coupon_token, status, expires_at)
    VALUES (v_student_id, p_coupon_code, p_coupon_token, 'ACTIVE', v_expires_at);

    RETURN jsonb_build_object('success', true, 'student_uuid', v_student_id);
EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'code', 'STUDENT_ALREADY_REGISTERED');
END;
$$;

REVOKE ALL ON FUNCTION register_student_and_coupon(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION register_student_and_coupon(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION register_student_and_coupon(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION register_student_and_coupon(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- 8. Add RPC for admin stats (optimizes dashboard loading)
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_students INT;
    v_verified_students INT;
    v_pending_students INT;
    v_total_coupons INT;
    v_active_coupons INT;
    v_used_coupons INT;
BEGIN
    SELECT COUNT(*) INTO v_total_students FROM students;
    SELECT COUNT(*) INTO v_verified_students FROM students WHERE verification_status = 'VERIFIED';
    SELECT COUNT(*) INTO v_pending_students FROM students WHERE verification_status = 'PENDING';
    
    SELECT COUNT(*) INTO v_total_coupons FROM coupons;
    SELECT COUNT(*) INTO v_active_coupons FROM coupons WHERE status = 'ACTIVE';
    SELECT COUNT(*) INTO v_used_coupons FROM coupons WHERE status = 'USED';

    RETURN jsonb_build_object(
        'total_students', v_total_students,
        'verified_students', v_verified_students,
        'pending_students', v_pending_students,
        'total_coupons', v_total_coupons,
        'active_coupons', v_active_coupons,
        'used_coupons', v_used_coupons
    );
END;
$$;

REVOKE ALL ON FUNCTION get_dashboard_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_dashboard_stats() FROM anon;
REVOKE ALL ON FUNCTION get_dashboard_stats() FROM authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_stats() TO service_role;
