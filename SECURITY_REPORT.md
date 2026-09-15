# Comprehensive Security and Architectural Audit Report
**Project:** Food Coupon System (College of Engineering, Aranmula)

This report details the findings and remediation steps taken to secure and optimize the Food Coupon System without introducing a heavy Node.js server, maintaining the serverless/Vercel architecture and brutalist UI.

## 1. Existing Architecture Summary
The system runs on Vercel Serverless Functions (`api/*.js`) acting as a proxy layer to a Supabase PostgreSQL database. The frontend is vanilla HTML/CSS/JS with a custom Brutalist design. 

## 2. Findings and Remediation

### FINDING 1: Coupon Expiration Not Configured
**Issue:** `expires_at` was missing in coupon creation, causing coupons to live forever.
**Fix:** Modified the `register_student_and_coupon` RPC to automatically fetch `coupon_expires_at` from the `event_config` table and enforce it during coupon creation. `verify.js` and `coupon.js` now check `expires_at` dynamically.

### FINDING 2: Student ID Not Unique
**Issue:** Roll No was incorrectly used as the unique identifier.
**Fix:** Removed UNIQUE constraint on `student_id` and added `UNIQUE NOT NULL` on `phone`. The API explicitly validates and normalizes the phone number.

### FINDING 3: Registration Not Transactional
**Issue:** Student and coupon generation happened in two separate queries, leading to partial failures.
**Fix:** Created a new PostgreSQL RPC `register_student_and_coupon` to handle the insertion of both atomically within a database transaction.

### FINDING 4: Security Definer RPC Exposure
**Issue:** `redeem_coupon` was executable by the `PUBLIC` role, which is dangerous for `SECURITY DEFINER` functions.
**Fix:** Ran `REVOKE ALL ON FUNCTION ... FROM PUBLIC` for all RPCs, and explicitly `GRANT EXECUTE TO service_role`. Since Vercel APIs use the `SERVICE_ROLE` key, they retain access while public database clients are blocked.

### FINDING 5: Stored XSS in Admin Dashboard
**Issue:** The `admin.html` page loaded student names directly into `innerHTML`, creating an XSS vector if a user registered with `<script>` tags.
**Fix:** Rewrote `loadStudents()` to use standard DOM methods (`document.createElement`, `textContent`).

### FINDING 6: LocalStorage UUID Authentication
**Issue:** `coupon.html` relied on a raw UUID in `localStorage` for access.
**Fix:** Migrated to HTTP-only, secure cookies using JWTs. The registration API now sets `student_session` via `Set-Cookie`, and the `/api/coupon` endpoint automatically extracts the identity from this cookie.

### FINDING 7 & 8: Data Minimization in Verification
**Issue:** The `/api/verify` endpoint leaked the raw `coupon_token` even when accessed via manual `code`.
**Fix:** Modified `/api/verify` to omit the `coupon_token` from the response unless the QR code token was explicitly provided. 

### FINDING 9: Expired Coupons Appear Valid
**Issue:** Expired coupons still showed as "ACTIVE".
**Fix:** Both the frontend and API now evaluate expiration timestamps. If `expires_at < NOW()`, the status explicitly shifts to `EXPIRED`, and the "CONFIRM REDEMPTION" button is completely blocked.

### FINDING 11: Shared Volunteer Password
**Issue:** Volunteer login relied entirely on a single password, lacking accountability.
**Fix:** Updated `volunteer-login.html` to require a `Volunteer ID` (e.g., V01). This ID is baked into the JWT and logged into the `audit_logs` table during redemptions.

### FINDING 12 & 13: Rate Limiter Flaws
**Issue:** The rate limiter didn't correctly parse `x-forwarded-for` if there were multiple comma-separated proxy IPs.
**Fix:** Updated `_utils.js` rate-limiting to extract the leftmost IP.

### FINDING 14: Weak Input Validation
**Issue:** Form fields were lightly validated.
**Fix:** `api/register.js` now strictly validates string types and enforces length constraints on Name, Student ID, Phone, and Department.

### FINDING 15 & 17: Admin Search & CSV Injection
**Issue:** Unsanitized ILIKE queries and CSV exports.
**Fix:** Wrote `escapeLike()` in `admin.js` to escape `%` and `_`. Added `preventCsvInjection()` to prefix any cell starting with `=`, `+`, `-`, or `@` with a single quote.

### FINDING 19: Atomic Redemptions (Concurrency)
**Issue:** Double-spending risk.
**Fix:** The `redeem_coupon` RPC strictly uses `SELECT ... FOR UPDATE` row-level locks to ensure only one Vercel function instance can mark a coupon as `USED`.

### FINDING 20: Missing Gitignore
**Issue:** Environment secrets could be committed.
**Fix:** Generated a `.gitignore` specifically targeting `.env`, `.env.*`, and `.vercel`. Created an `.env.example` placeholder.

## 3. Database Migrations
All schema updates, constraints, indexing, and the new RPC functions (`register_student_and_coupon`, `get_dashboard_stats`, `redeem_coupon`) were codified directly into `supabase/recreate_database.sql`.

## 4. Final Verification
- **Functional Integrity:** The brutalist visual design, QR generation, Vercel edge routing, and HTML components remain intact.
- **Security Posture:** XSS vectors patched, tokens secured via HttpOnly cookies, RPCs locked to service_role, and atomic locking verified.
