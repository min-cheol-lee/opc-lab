# Phase 2A-2C Execution Plan (Revenue + Reputation)

Date: 2026-02-24  
Status: Active planning baseline

## Objective
- Objective 1: maximize revenue conversion and retention.
- Objective 2: maximize technical trust and personal/professional reputation.

## Ordering Rule
1. Phase 2A (Monetization Infrastructure) first.
2. Phase 2B (Reputation Infrastructure) second, partially parallelizable.
3. Phase 2C (Advanced Analytics) after 2A/2B gates are green.

---

## Phase 2A: Monetization Infrastructure
### Scope
- Usage metering and quota enforcement on server.
- Upgrade funnel instrumentation and dashboard wiring.
- Plan entitlements parity check (frontend/backend).
- Paid-value packaging hardening:
  - pro export/report path
  - clear upgrade prompts tied to user intent

### Tickets
- 2A-01: server quota model (`run/day`, `sweep points/day`, `export/day`).
- 2A-02: entitlement middleware and policy audit logging.
- 2A-03: frontend usage meter + quota exhausted UX.
- 2A-04: funnel event taxonomy and event emitters.
- 2A-05: conversion dashboard baseline (daily/weekly).

### Current Status (2026-02-24 checkpoint)
- 2A-01: Done (server quota endpoints + enforcement on `/simulate` and `/simulate/batch`).
- 2A-02: Done (entitlement middleware, `/entitlements`, policy audit log + `/policy/audit`).
- 2A-03: Done (frontend usage meter and quota block UX in run/sweep/export paths).
- 2A-04: Done (event taxonomy + emitters + browser queue + backend ingest endpoint).
- 2A-05: Baseline done (`/events/summary` API + `/opclab/revenue-dashboard`).

### KPIs
- Visitor -> upgrade click rate >= 8%.
- Upgrade click -> paid conversion >= 2.5%.
- Pro W1->W2 retention >= 55%.
- Policy bypass incidents = 0.

### Exit Gate A
- All 2A tickets merged.
- Live metering in production path.
- KPI pipeline collecting reliable events for >= 7 days.

---

## Phase 2B: Reputation Infrastructure
### Scope
- Benchmark gallery expansion to reproducible fixed suite.
- Model change log publishing discipline.
- Regression board per model version.

### Tickets
- 2B-01: benchmark suite definition (>= 10 fixed cases).
- 2B-02: benchmark runner script + pass/fail artifact output.
- 2B-03: change-log template and release checklist integration.
- 2B-04: trust dashboard page (version vs pass rate trend).

### Current Status (2026-02-25 checkpoint)
- 2B-01: Done (`backend/trust/benchmark-suite.v1.json` + gallery expanded to 10 fixed cases).
- 2B-02: Done (`backend/scripts/run_benchmark_suite.py` + artifact outputs under `backend/trust/artifacts`).
- 2B-03: Done (`docs/model-change-log-template.md` + `docs/phase2b-release-checklist.md` integrated).
- 2B-04: Done (`/trust/benchmarks/trend` API + `/opclab/trust-dashboard` page).

### KPIs
- Benchmark cases with explicit expected behavior >= 10.
- Active model version benchmark pass rate >= 95%.
- Change-log publish latency <= 48h after behavior change.
- Public technical artifact cadence >= 1/month.

### Exit Gate B
- Benchmark suite and change log publicly accessible.
- Regression run is repeatable and auditable.

---

## Phase 2C: Advanced Analytics (Bossung + Process Window)
### Scope
- Bossung chart API integration.
- Process window map API integration.
- Pro positioning and export/report hooks.

### Tickets
- 2C-01: finalize advanced analytics request/response contracts.
- 2C-02: `/simulate/advanced/bossung` backend endpoint.
- 2C-03: `/simulate/advanced/window` backend endpoint.
- 2C-04: frontend state integration and interaction UX.
- 2C-05: export/report integration and regression validation.

### KPIs
- Advanced analytics page adoption among Pro users >= 25% weekly.
- Advanced analytics export usage >= 20% of analytics sessions.
- No negative regression in core paid workflows (sweep/compare/export).

### Exit Gate C
- 2C endpoints and UI integrated.
- KPI trend non-negative for core paid workflows over 2 consecutive weeks.

---

## Weekly Operating Cadence
- Monday:
  - review KPI deltas (revenue + trust).
  - decide focus: 2A vs 2B vs 2C.
- Wednesday:
  - regression + benchmark checkpoint.
- Friday:
  - release note + change-log publication.
  - next-week gate decision.

## Decision Rule (hard)
- If revenue KPIs degrade, halt 2C feature expansion and return to 2A.
- If trust KPIs degrade, halt new feature work and recover 2B integrity first.

## Immediate Next (Internal Launch)
- Before Phase 2C implementation, run internal online monetization test plan:
  - `docs/internal-launch-revenue-experiment-plan.md`
- Focus: identity-bound entitlement, persistent usage/events, invite-only staging, and controlled upgrade experiment.
