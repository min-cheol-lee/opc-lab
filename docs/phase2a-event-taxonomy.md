# Phase 2A Event Taxonomy (Baseline)

Date: 2026-02-24  
Scope: Funnel + quota behavior instrumentation for revenue monitoring.

## Event Names
- `run_sim_clicked`
- `run_sim_succeeded`
- `run_sim_failed`
- `sweep_run_clicked`
- `sweep_run_succeeded`
- `sweep_run_failed`
- `export_attempted`
- `export_completed`
- `export_blocked_quota`
- `usage_quota_exhausted`
- `upgrade_prompt_viewed`
- `upgrade_prompt_clicked`

## Emission Paths
- Main simulation flow: `frontend/app/opclab/page.tsx`
- Export actions from viewport toolbar: `frontend/components/Viewport.tsx`
- Upgrade prompt view/click in locked UI: `frontend/components/ControlPanel.tsx`
- Queue + flush to backend ingest: `frontend/lib/telemetry.ts`

## Backend Collection
- Ingest endpoint: `POST /events/ingest`
- Summary endpoint: `GET /events/summary?window_days=7|14|30`
- Storage: in-memory bounded ring (Phase 2A baseline)

## Baseline KPIs (computed from summary API)
- Upgrade prompt CTR: `upgrade_prompt_clicked / upgrade_prompt_viewed`
- Export block rate: `export_blocked_quota / export_attempted`
- Quota pressure count: `usage_quota_exhausted`
- Interaction volume:
  - `run_sim_clicked`
  - `sweep_run_clicked`

## Notes
- This is baseline instrumentation (no payment events yet).
- For production, replace in-memory event store with durable analytics pipeline.
