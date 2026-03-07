# litopc Rename Audit

## Scope

This audit classifies the former `opc-lab` / `opclab` identifiers into three buckets and records what was renamed versus what intentionally remains as a compatibility fallback.

## 1. Branding

Primary branding strings were switched to `litopc` in:

- frontend app metadata and default route
- simulator app route namespace (`/litopc`)
- marketing site config and launch targets
- export labels and frontend package naming
- backend API title and root message

Examples:

- `frontend/app/layout.tsx`
- `frontend/app/page.tsx`
- `frontend/app/litopc/**`
- `frontend/lib/export.ts`
- `marketing-pages/site-config.js`
- `backend/app/main.py`

## 2. Pathing

Primary path references were switched from `opclab` to `litopc` in:

- `frontend/app/opclab` -> `frontend/app/litopc`
- legacy route traffic redirected by `frontend/app/opclab/[[...slug]]/page.tsx`
- docs that referenced the old repo path or old app route
- frontend API default base changed to `https://api.litopc.com`

Examples:

- `frontend/app/litopc/page.tsx`
- `frontend/app/opclab/[[...slug]]/page.tsx`
- `frontend/lib/api-base.ts`
- `docs/**`

## 3. Settings And Compatibility

Current settings were renamed to `litopc`, and the old names remain only where a migration fallback prevents breaking deployed clients, persisted browser state, or existing environment variables.

### Intentionally retained legacy fallbacks

- old request headers:
  - `x-opclab-client-id`
  - `x-opclab-user-id`
  - `x-opclab-email`
  - `x-opclab-admin-token`
  - `x-opclab-usage-kind`
- old env vars:
  - `OPCLAB_ADMIN_TOKEN`
  - `OPCLAB_DB_PATH`
- old localStorage keys:
  - `opclab_*`
  - `opc_lab_saved_scenarios_v1`
- old custom mask schema:
  - `opclab-mask-v1`
- old billing callback query:
  - `opclab_checkout`
- legacy ignored local DB file:
  - `backend/opclab.db`

### Fallback locations

- `backend/app/auth.py`
- `backend/app/main.py`
- `backend/app/store.py`
- `frontend/app/litopc/page.tsx`
- `frontend/components/ControlPanel.tsx`
- `frontend/lib/auth.ts`
- `frontend/lib/custom-mask-files.ts`
- `frontend/lib/scenarios.ts`
- `frontend/lib/telemetry.ts`
- `frontend/lib/usage.ts`
- `.gitignore`

## Non-source leftovers

These are not part of the production rename target:

- `frontend/build.log`
- `frontend/tsconfig.tsbuildinfo`
- `notes.tct.txt`

## Result

The active product identity is now `litopc`.

Any remaining `opc-lab` / `opclab` references in source code are limited to migration-safe compatibility shims, not primary branding, routing, or default configuration.
