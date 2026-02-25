# OPC Lab Model Change Log Template

Date: 2026-02-25  
Purpose: standardize model-impact communication for Phase 2B trust operations.

## Entry Template
- Change ID: `chg-YYYY-MM-DD-short-tag`
- Version Tag: `vX.Y.Z-...`
- Released On (UTC date): `YYYY-MM-DD`
- Scope: `model` | `simulation` | `visualization` | `ux`

### Summary
- One sentence describing what changed.

### User Impact
- What users will notice in behavior or workflow.

### Validation
- Benchmark case IDs executed (from `backend/trust/benchmark-suite.v1.json`).
- Benchmark pass rate and artifact reference:
  - `run_id`
  - `pass_rate`
  - `artifact_file`
- Additional manual validation notes (if any).

### Risk / Rollback
- Known risk:
- Rollback condition:
- Rollback action:

### Links
- Benchmark artifact: `backend/trust/artifacts/benchmark-run-*.json`
- Dashboard page: `/opclab/trust-dashboard`
- Related PR/commit:

## Publishing Rule
- Publish or update this entry within 48 hours after a behavior-affecting change.
