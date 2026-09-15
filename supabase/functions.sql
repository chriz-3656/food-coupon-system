-- Canonical functions based on recreate_database.sql

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

REVOKE ALL ON FUNCTION redeem_coupon(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION redeem_coupon(TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION redeem_coupon(TEXT, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION redeem_coupon(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

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

CREATE OR REPLACE FUNCTION admin_verify_student(
    p_student_id UUID,
    p_coupon_code TEXT,
    p_coupon_token TEXT
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_config RECORD;
    v_expires_at TIMESTAMPTZ;
    v_student RECORD;
BEGIN
    SELECT * INTO v_student FROM students WHERE id = p_student_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Student not found.');
    END IF;

    IF v_student.verification_status = 'VERIFIED' THEN
        RETURN jsonb_build_object('success', false, 'code', 'ALREADY_VERIFIED', 'message', 'Already verified.');
    END IF;

    SELECT * INTO v_config FROM event_config LIMIT 1;
    v_expires_at := v_config.coupon_expires_at;

    INSERT INTO coupons (student_id, coupon_code, coupon_token, status, expires_at)
    VALUES (p_student_id, p_coupon_code, p_coupon_token, 'ACTIVE', v_expires_at);

    UPDATE students SET verification_status = 'VERIFIED', verified_at = now(), verified_by = 'admin' WHERE id = p_student_id;

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'code', 'COUPON_EXISTS', 'message', 'Coupon already exists.');
END;
$$;

REVOKE ALL ON FUNCTION admin_verify_student(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_verify_student(UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION admin_verify_student(UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION admin_verify_student(UUID, TEXT, TEXT) TO service_role;
