-- functions.sql

CREATE OR REPLACE FUNCTION redeem_coupon(
    p_coupon_token TEXT,
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
    -- 1. Find coupon and explicitly lock it to serialize concurrent requests
    SELECT * INTO v_coupon
    FROM coupons
    WHERE coupon_token = p_coupon_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'COUPON_NOT_FOUND', 'message', 'This coupon could not be verified.');
    END IF;

    -- 2. State checks
    IF v_coupon.status = 'USED' THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'COUPON_ALREADY_USED', 
            'message', 'This coupon has already been redeemed.',
            'redeemed_at', v_coupon.used_at
        );
    END IF;

    IF v_coupon.status != 'ACTIVE' THEN
        RETURN jsonb_build_object('success', false, 'code', 'COUPON_INVALID_STATUS', 'message', 'This coupon is not active. Status: ' || v_coupon.status);
    END IF;

    IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < NOW() THEN
        RETURN jsonb_build_object('success', false, 'code', 'COUPON_EXPIRED', 'message', 'This coupon has expired.');
    END IF;

    -- 3. Atomic Update
    UPDATE coupons 
    SET status = 'USED', 
        used_at = NOW(), 
        used_by = p_volunteer_id 
    WHERE id = v_coupon.id;

    -- 4. Get Student info for success message
    SELECT * INTO v_student FROM students WHERE id = v_coupon.student_id;

    -- 5. Record Redemption & Audit
    INSERT INTO redemptions (coupon_id, volunteer_id, verification_method, request_id) 
    VALUES (v_coupon.id, p_volunteer_id, p_verification_method, p_request_id);
    
    INSERT INTO audit_logs (action, entity_type, entity_id, actor) 
    VALUES ('REDEEM', 'coupons', v_coupon.id, p_volunteer_id);

    -- Return success with needed data
    RETURN jsonb_build_object(
        'success', true, 
        'status', 'REDEEMED', 
        'message', 'Coupon successfully redeemed.',
        'student', jsonb_build_object(
            'name', v_student.name,
            'student_id', v_student.student_id,
            'department', v_student.department
        ),
        'coupon_code', v_coupon.coupon_code,
        'redeemed_at', NOW()
    );
END;
$$;
