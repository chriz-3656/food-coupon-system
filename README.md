# One-Time Food Coupon System - Freshers Day 2026

A highly secure, serverless digital food coupon system for College of Engineering, Aranmula.

## Features
- **Serverless Architecture:** Deployed on Vercel utilizing lightweight Node.js Serverless Functions.
- **Atomic Redemptions:** Guaranteed double-spend prevention using PostgreSQL row-level locking (`SELECT ... FOR UPDATE`).
- **Cryptographic Tokens:** Coupons are secured via 256-bit cryptographically random tokens, never exposed to unauthorized users.
- **Data Minimization:** APIs sanitize payloads and strip secrets before transmitting to the browser.
- **XSS & Injection Protection:** Admin dashboards dynamically construct DOM nodes. CSV exports prepend quotes to formulas to prevent spreadsheet injection. 
- **Role-Based Access Control:** `SECURITY DEFINER` RPCs are isolated from `PUBLIC` access. Serverless functions operate via the Supabase Service Role Key while enforcing JWT-based `HttpOnly` cookie sessions for admins and volunteers.
- **Brutalist UI:** A high-contrast, edgy aesthetic optimized for fast mobile scanning.

## Architecture
- **Frontend:** Vanilla HTML/CSS/JS (mobile-first, CDN dependencies only).
- **Backend:** Node.js Vercel Serverless Functions (`/api/*`). No long-running Express server.
- **Database:** Supabase PostgreSQL.
- **Security:** "Exactly once" redemption is strictly enforced atomically at the database level using a PL/pgSQL function (`redeem_coupon`) with row-level locking (`FOR UPDATE`). Concurrent scans or API abuse will fail safely.

## Security Model & Threat Mitigation
| Threat | Risk | Mitigation |
|---|---|---|
| Double Redemption | CRITICAL | PostgreSQL transaction wraps a `FOR UPDATE` lock on the coupon row. 20 concurrent network hits will result in exactly 1 success and 19 `ALREADY_USED` rejections. |
| Stored XSS | HIGH | All admin dashboard records (names, IDs) are safely injected via `textContent` rather than `innerHTML`. |
| CSV Injection | MEDIUM | Any student name/department beginning with `=`, `+`, `-`, or `@` is prefixed with a `'` prior to CSV export. |
| Unauthorized RPC | HIGH | `redeem_coupon` and `register_student_and_coupon` RPCs have `EXECUTE` privileges revoked from `PUBLIC`, `anon`, and `authenticated`. |
| Token Sniffing | HIGH | Coupon view relies on `HttpOnly` secure JWT cookies rather than `localStorage`. `verify` API hides token if a manual code is entered. |

## Folder Structure
```text
food-coupon-system/
├── public/                 # Static frontend (Vercel @vercel/static)
│   ├── css/style.css       # Mobile-first styles
│   ├── index.html          # Entry page
│   ├── register.html       # Student registration
│   ├── registration-status.html
│   ├── coupon.html         # Digital coupon with QR
│   ├── verify.html         # Volunteer QR Scanner (html5-qrcode)
│   ├── volunteer-login.html
│   ├── admin-login.html
│   └── admin.html          # Admin dashboard
├── api/                    # Vercel Serverless Functions (@vercel/node)
│   ├── _utils.js           # Shared utilities (DB, JWT, rate limits)
│   ├── register.js         
│   ├── verify.js           # Volunteer verify check
│   ├── redeem.js           # Atomic redemption (RPC call)
│   └── ...                 # Other endpoints
├── supabase/               # Database definitions
│   ├── schema.sql          # Tables, constraints, indexes
│   ├── functions.sql       # RPCs (redeem_coupon)
│   └── policies.sql        # RLS (locked down)
├── tests/                  # Automated tests
├── vercel.json             # Vercel config
├── package.json            # Node dependencies
└── .env.example            # Env template
```

## Database Setup
1. Create a Supabase project (https://supabase.com).
2. Go to the SQL Editor.
3. Run the contents of `supabase/schema.sql`.
4. Run the contents of `supabase/functions.sql`.
5. Run the contents of `supabase/policies.sql`.
6. (Optional) Insert an event record via `INSERT INTO event_config (event_name) VALUES ('My Event');`.
7. Go to Project Settings -> API and get your `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## Environment Variables
In your Vercel project, go to **Settings -> Environment Variables** and add:
- `SUPABASE_URL`: Your Supabase URL.
- `SUPABASE_SECRET_KEY`: Your Supabase **service_role** secret (NEVER EXPOSE THIS IN THE FRONTEND).
- `ADMIN_USERNAME`: Admin login username (e.g., `admin`).
- `ADMIN_PASSWORD`: Admin password.
- `VOLUNTEER_PASSWORD`: The PIN/password for volunteers to access the scanner.
- `SESSION_SECRET`: A long random string for signing JWT cookies.

## Vercel Deployment
1. Push this repository to GitHub.
2. Log into Vercel and Import the repository.
3. Add the Environment Variables (as listed above).
4. Deploy!
5. (Note: For local testing, you can use `vercel dev`).

## Event-Day Checklist
- [ ] Verify Supabase database is active and schema is loaded.
- [ ] Verify Vercel deployment is successful and environment variables are set.
- [ ] Test a registration flow from start to finish.
- [ ] Verify the student in the Admin dashboard.
- [ ] Open the coupon on a mobile device.
- [ ] Log in as a volunteer on another device and scan the QR.
- [ ] Confirm Redemption.
- [ ] **Crucial Test:** Scan the exact same QR again. It MUST show "ALREADY USED".
- [ ] Ensure volunteer phones have adequate battery and internet connection.

## Security Model
- The database enforces uniqueness (student ID, coupon codes) and valid states.
- The `redeem_coupon` RPC locks the specific row (`FOR UPDATE`) so that even if 50 network requests arrive simultaneously for the exact same QR code, the database processes them sequentially. The first one changes the status to `USED`, and the remaining 49 will instantly fail because the status is no longer `ACTIVE`.
- No sensitive Supabase keys are passed to the frontend. All interactions go through Serverless Functions.
- Volunteers and Admins are authenticated via `HttpOnly` secure cookies.
- Rate limits protect public endpoints like `/api/register` and logins.
