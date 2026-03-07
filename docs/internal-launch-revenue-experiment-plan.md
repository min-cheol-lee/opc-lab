# litopc Simulator Internal Launch Plan

Date: 2026-02-25  
Owner: Product + Engineering  
Goal: start paid-conversion experiments safely with internal testers before public launch.

## 1) Target Outcome (2 weeks)
- Put the simulator online (`staging`) for you + invited contacts.
- Support real user identity (login), not client-side plan switching.
- Support account-based `FREE/PRO` entitlement.
- Run controlled monetization experiment with measurable KPIs.

## 2) Current Risk Snapshot (must fix before paid test)
- Request payload still carries plan selection (`plan: Plan`): [models.py](c:\Users\minch\project\litopc\backend\app\models.py:64)
- Usage/event/policy storage is in-memory only (data resets on restart): [main.py](c:\Users\minch\project\litopc\backend\app\main.py:88)
- Quota decision depends on request-level plan path in simulate flow: [main.py](c:\Users\minch\project\litopc\backend\app\main.py:592)

If left as-is, conversion metrics and policy integrity are not reliable enough for billing experiments.

## 3) Recommended Minimal Stack
- Frontend hosting: `Vercel` (Next.js)
- Backend hosting: `Render` (FastAPI) or `Railway`
- Database: `Supabase Postgres` or `Neon Postgres`
- Auth: `Supabase Auth` (magic link) or `Clerk`
- Billing: `Stripe` (Checkout + Billing Portal + Webhook)

Why this stack now:
- Fast integration and low ops overhead.
- Clear separation: authentication, billing, entitlement, product logic.

## 4) Ticket Backlog (Minimal, Executable)

### IL-01 Auth Identity Plumbing (P0)
Scope:
- Add authenticated user identity (`user_id`) to every backend request.
- Keep existing anonymous fallback only for local development.

Backend tasks:
- Add auth middleware (`Authorization: Bearer <JWT>` verify).
- Extract `user_id` from JWT subject claim.
- Add request context helper `resolve_user_id()`.

Frontend tasks:
- Add auth session provider and login guard on `/litopc`.
- Send access token with API calls.

Acceptance:
- Unauthenticated staging user is redirected to login.
- Authenticated requests expose stable `user_id` on backend.

### IL-02 Server-Side Entitlement Source of Truth (P0)
Scope:
- Remove trust in client-sent `plan`.
- Backend computes plan from entitlement table by `user_id`.

Backend tasks:
- New table `entitlements(user_id, plan, limits, updated_at)`.
- Replace plan usage in simulation/quota paths with DB lookup.
- Keep `/entitlements` endpoint but back it by DB + defaults.

Key touchpoints:
- [models.py](c:\Users\minch\project\litopc\backend\app\models.py:64)
- [main.py](c:\Users\minch\project\litopc\backend\app\main.py:366)
- [main.py](c:\Users\minch\project\litopc\backend\app\main.py:592)

Acceptance:
- Forging `plan=PRO` in request body no longer unlocks Pro features.
- User plan changes take effect on next request.

### IL-03 Persistent Usage Metering (P0)
Scope:
- Move usage counters from memory to database.

Backend tasks:
- New table `usage_daily(user_id, day_utc, runs, sweep_points, exports)`.
- Atomic increment/update per operation.
- Keep existing quota behavior and API response shape.

Current in-memory locations:
- [main.py](c:\Users\minch\project\litopc\backend\app\main.py:88)

Acceptance:
- Server restart does not reset daily counters.
- Quota checks remain consistent under concurrent requests.

### IL-04 Persistent Product Events + Audit (P1)
Scope:
- Persist events and policy audit logs to DB for trustworthy KPI tracking.

Backend tasks:
- New tables:
  - `product_events(user_id, name, day_utc, ts_utc, payload_json)`
  - `policy_audit_log(user_id, endpoint, decision, reason, ts_utc, meta_json)`
- Update `/events/ingest`, `/events/summary`, `/policy/audit` to query DB.

Acceptance:
- KPI dashboard survives restarts and deploys.
- 7-day trend query returns stable counts.

### IL-05 Internal Pro Grant Admin Flow (P0 for internal test)
Scope:
- Let admin manually assign and revoke internal Pro.

Tasks:
- Add admin-only endpoint:
  - `POST /admin/entitlements/grant-pro`
  - `POST /admin/entitlements/revoke-pro`
- Store source metadata (`source=internal_test`) and optional expiry.

Acceptance:
- You can grant Pro to specific invited emails in < 1 min.
- Expired internal Pro downgrades automatically to Free.

### IL-06 Invitation/Allowlist Control (P0 for internal test)
Scope:
- Restrict staging signup to invited users.

Tasks:
- Add `invite_allowlist(email, role, plan_default, expires_at, used_at)`.
- Enforce allowlist during first login in staging.

Acceptance:
- Non-invited user cannot access product.
- Invited user lands in Free or Pro based on invite policy.

### IL-07 Stripe Billing Integration (P1)
Scope:
- Add real subscription lifecycle for post-internal pilot.

Tasks:
- Create Stripe Checkout Session endpoint.
- Add Customer Portal endpoint.
- Webhook handler:
  - `checkout.session.completed`
  - `invoice.paid`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Map Stripe status -> entitlement plan.

Acceptance:
- Paid subscription upgrades entitlement to Pro automatically.
- Cancellation/delinquency downgrades according to policy.

### IL-08 Frontend Billing UX (P1)
Scope:
- Upgrade CTA opens checkout and shows account plan status.

Tasks:
- Account menu: current plan, renewal date, manage billing.
- Upgrade buttons use backend checkout session endpoint.
- Locked feature copy remains consistent with entitlement policy.

Acceptance:
- User can complete upgrade without manual support.
- Plan badges and locked controls update after webhook sync.

### IL-09 Staging Deployment + Environment Separation (P0)
Scope:
- Keep `staging` and `production` isolated.

Tasks:
- Deploy frontend/backend staging services.
- Set environment variables:
  - frontend: `NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_AUTH_*`
  - backend: `DATABASE_URL`, `CORS_ALLOW_ORIGINS`, `AUTH_*`, `STRIPE_*`
- Add staging-only banner in UI.

Acceptance:
- Internal testers use stable URL.
- Production data is untouched during testing.

### IL-10 Experiment Instrumentation and KPI Board (P0)
Scope:
- Track conversion funnel with account identity.

Required metrics:
- Sign-up completion
- First simulation run
- First sweep
- Upgrade click
- Checkout started
- Paid activated
- W1 retained

Acceptance:
- Dashboard can answer: "Which invited users became paid and retained?"

## 5) Suggested 2-Week Execution Order

Week 1:
1. IL-01 Auth identity plumbing  
2. IL-02 Entitlement source of truth  
3. IL-03 Persistent usage metering  
4. IL-05 Internal Pro grant flow  
5. IL-06 Invite allowlist  
6. IL-09 Staging deployment

Week 2:
1. IL-04 Persistent events/audit  
2. IL-10 KPI instrumentation stabilization  
3. IL-07 Stripe integration (test mode first)  
4. IL-08 Billing UX polish  
5. Internal pilot report and go/no-go decision

## 6) Typical SaaS Login/Subscription Pattern (Industry)
- Authentication provider handles identity and session.
- Billing provider handles payment and subscription contracts.
- Product backend owns entitlement and policy enforcement.
- Webhook is the sync bridge between billing and entitlement.
- Frontend only reflects state; backend always enforces final access.

This is the same pattern used by most B2B/B2C SaaS tools to prevent plan spoofing and keep auditability.

## 7) Go/No-Go Gate Before Public Open
- Identity-bound entitlement enforcement is live (no body-plan bypass).
- At least 7 days of persistent conversion events collected.
- Internal pilot users can complete upgrade flow end-to-end.
- Support runbook exists for refund/cancel/downgrade/manual grant.

## 8) Immediate Next Step (today)
- Start IL-01 + IL-02 first.  
- Do not start Stripe production mode until IL-03 and IL-10 are stable.
- Quick operator guide:
  - `docs/internal-auth-entitlement-quickstart.md`
  - `docs/staging-deployment-env-checklist.md`
  - `docs/internal-tester-onboarding.md`
  - `docs/github-pages-cheap-launch-playbook.md`
