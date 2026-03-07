# Internal Tester Onboarding (Login + Access + Plan Test)

Date: 2026-02-25

## 1) Goal
- Let invited testers log in to staging simulator quickly.
- Validate Free/Pro entitlement behavior with persistent server-side enforcement.
- Validate upgrade flow using billing stub + webhook mock.

## 2) Required backend env (staging)
- `LITOPC_ADMIN_TOKEN=<strong-secret>`
- `AUTH_REQUIRED=0`
- `AUTH_ALLOW_HEADER_USER=1`
- `AUTH_ENFORCE_ALLOWLIST=1`
- `BILLING_MODE=stub`
- `CORS_ALLOW_ORIGINS=<frontend-staging-origin>`

## 3) Invite tester before first login
PowerShell example:

```powershell
$admin = "your-admin-token"
$api = "https://your-backend-staging.example.com"

Invoke-RestMethod `
  -Method POST `
  -Uri "$api/admin/invites/set" `
  -Headers @{ "x-litopc-admin-token" = $admin } `
  -ContentType "application/json" `
  -Body '{"email":"alice@example.com","role":"tester","plan_default":"FREE","expires_in_days":14}'
```

## 4) Tester login flow (browser)
1. Open:
   - `https://your-frontend-staging.example.com/litopc/internal-login`
2. Fill:
   - `Tester User ID` (example: `tester-alice`)
   - `Tester Email` (must match invited email, example: `alice@example.com`)
   - `JWT Access Token` keep empty in current internal mode
3. Click `Save & Open Simulator`.
4. Simulator opens at `/litopc` with identity headers from local storage.

## 5) Verify account state in simulator
- In the left account card:
  - `User` should show `hdr:tester-alice`
  - `Plan Source` should show current entitlement source (default or admin-set)
  - `Billing` shows stub subscription status if any

You can also verify via API:

```powershell
Invoke-RestMethod `
  -Method GET `
  -Uri "$api/entitlements/me" `
  -Headers @{
    "x-litopc-user-id" = "tester-alice"
    "x-litopc-email"   = "alice@example.com"
  }
```

## 6) Grant internal Pro directly (admin shortcut)
```powershell
Invoke-RestMethod `
  -Method POST `
  -Uri "$api/admin/entitlements/set" `
  -Headers @{ "x-litopc-admin-token" = $admin } `
  -ContentType "application/json" `
  -Body '{"user_id":"hdr:tester-alice","plan":"PRO","source":"internal_test","pro_days":14}'
```

## 7) Billing upgrade test (stub mode)
1. In simulator account card, click `Upgrade`.
2. Checkout stub session is created and browser returns to `/litopc`.
3. Finalize entitlement with webhook mock:

```powershell
Invoke-RestMethod `
  -Method POST `
  -Uri "$api/billing/webhook/mock" `
  -Headers @{ "x-litopc-admin-token" = $admin } `
  -ContentType "application/json" `
  -Body '{"user_id":"hdr:tester-alice","event_type":"invoice.paid","status":"active","period_days":30}'
```

4. In simulator account card, click `Refresh`.
5. Plan becomes Pro on server enforcement path.

## 8) Revoke/downgrade test
```powershell
Invoke-RestMethod `
  -Method POST `
  -Uri "$api/billing/webhook/mock" `
  -Headers @{ "x-litopc-admin-token" = $admin } `
  -ContentType "application/json" `
  -Body '{"user_id":"hdr:tester-alice","event_type":"customer.subscription.deleted"}'
```

Then click `Refresh` in simulator and confirm Free limits apply again.
