# Staging Deployment Environment Checklist

Date: 2026-02-25

## Frontend (Vercel)
- `NEXT_PUBLIC_API_BASE` = backend staging URL
- Optional dev fallback keys for internal testing:
  - `opclab_user_id_v1` (localStorage)
  - `opclab_email_v1` (localStorage)

## Backend (Render/Railway)
- `OPCLAB_DB_PATH` (if sqlite file path override needed)
- `OPCLAB_ADMIN_TOKEN` (required for admin endpoints)
- `AUTH_REQUIRED` (`0` for header fallback, `1` for strict JWT mode)
- `AUTH_ALLOW_HEADER_USER` (`1` for internal fallback, `0` to disable)
- `AUTH_JWT_HS256_SECRET` (optional JWT signature verify for HS256)
- `AUTH_ENFORCE_ALLOWLIST` (`1` to enable invite-only mode)
- `BILLING_MODE` (`stub` for internal pilot)
- `CORS_ALLOW_ORIGINS` (comma-separated frontend origins in production mode)

## Template files
- Backend template: `backend/.env.staging.example`
- Frontend template: `frontend/.env.staging.example`

## Internal pilot recommended values
- `AUTH_REQUIRED=0`
- `AUTH_ALLOW_HEADER_USER=1`
- `AUTH_ENFORCE_ALLOWLIST=1`
- `BILLING_MODE=stub`
- Use `x-opclab-user-id` + `x-opclab-email` fallback from frontend localStorage.
- Tester login UI:
  - `/opclab/internal-login`

## Before public opening
- Set `AUTH_REQUIRED=1`
- Disable header fallback: `AUTH_ALLOW_HEADER_USER=0`
- Use real auth provider JWT verification (`AUTH_JWT_*` / JWK flow).
