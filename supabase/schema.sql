-- schema.sql

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
    student_id TEXT UNIQUE NOT NULL,
    phone TEXT,
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

-- Indexes
CREATE INDEX idx_students_student_id ON students(student_id);
CREATE INDEX idx_students_verification_status ON students(verification_status);
CREATE INDEX idx_coupons_coupon_code ON coupons(coupon_code);
CREATE INDEX idx_coupons_coupon_token ON coupons(coupon_token);
CREATE INDEX idx_coupons_status ON coupons(status);
