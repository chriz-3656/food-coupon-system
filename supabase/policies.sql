-- policies.sql
-- We are largely going to rely on the service role key from our Vercel functions, 
-- but let's lock down the tables so public/anon access is denied by default.

ALTER TABLE event_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Deny all access to anonymous or authenticated users on the client side.
-- All database interactions should go through our Vercel serverless functions,
-- which authenticate using the SUPABASE_SECRET_KEY (Service Role key).
