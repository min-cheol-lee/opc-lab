# Internal Auth + Entitlement Quickstart

Date: 2026-02-25

## What is implemented now
- Server-side effective plan resolution from user entitlement table.
- `plan` in simulation request is no longer trusted as source of authority.
- Current user entitlement endpoint:
  - `GET /entitlements/me`
- Admin manual plan set endpoint:
  - `POST /admin/entitlements/set`
  - header: `x-opclab-admin-token`
- Admin invite allowlist endpoints:
  - `POST /admin/invites/set`
  - `GET /admin/invites`
- Billing endpoints (stub mode):
  - `GET /billing/me`
  - `POST /billing/checkout/session`
  - `POST /billing/portal/session`
  - `POST /billing/webhook/mock` (admin token required)

## Local staging quick flow
1. Start backend with admin token:
   - PowerShell:
     - `$env:OPCLAB_ADMIN_TOKEN = "your-admin-token"`
     - `.\dev-backend.ps1`
2. Open internal login page:
   - `/opclab/internal-login`
3. Set acting user id:
   - value example: `tester-alice`
4. Set tester email (recommended; required in invite-only mode):
   - value example: `alice@example.com`
4. Open app and verify current plan:
   - `GET /entitlements/me` should return user_id `hdr:tester-alice`
5. Grant Pro manually:
   - `POST /admin/entitlements/set`
   - body example:
     - `{"user_id":"hdr:tester-alice","plan":"PRO","source":"internal_test","pro_days":14}`
6. Refresh app and confirm plan is now Pro from server side.

## Invite-only staging mode
1. Set backend env:
   - `AUTH_ENFORCE_ALLOWLIST=1`
2. Add invite before login:
   - `POST /admin/invites/set`
   - body example:
     - `{"email":"alice@example.com","role":"tester","plan_default":"FREE","expires_in_days":14}`
3. Requests with non-allowlisted email will be blocked in invite-only mode.

## Notes
- If `AUTH_REQUIRED=1` is enabled, requests without valid auth identity are rejected.
- Until external auth provider is wired, internal testing can use:
  - `x-opclab-user-id` fallback via localStorage key `opclab_user_id_v1`
  - `x-opclab-email` fallback via localStorage key `opclab_email_v1`
- End-to-end tester runbook:
  - `docs/internal-tester-onboarding.md`
