# Phase 2B Release Checklist (Trust)

Date: 2026-02-25
Scope: benchmark integrity, change-log discipline, and trust dashboard readiness.

## 1) Benchmark Suite
- [ ] `backend/trust/benchmark-suite.v1.json` contains >= 10 fixed cases.
- [ ] Case IDs match public Benchmark Gallery IDs.
- [ ] Expected behavior text is explicit and reproducible.

## 2) Benchmark Execution
- [ ] Run benchmark suite:
  - `.\dev-trust-benchmark.ps1`
  - (or directly run `backend/scripts/run_benchmark_suite.py` from backend venv)
- [ ] Verify artifact files generated:
  - `backend/trust/artifacts/benchmark-latest.json`
  - `backend/trust/artifacts/benchmark-history.json`
  - `backend/trust/artifacts/benchmark-run-<timestamp>.json`
- [ ] Latest run pass rate is >= 0.95.

## 3) Change Log Publishing
- [ ] Update `frontend/lib/trust-assets.ts` model change entries if behavior changed.
- [ ] Add/update entry using `docs/model-change-log-template.md`.
- [ ] Publish within 48h of behavior-affecting changes.

## 4) Trust Dashboard
- [ ] API check: `GET /trust/benchmarks/trend?limit=20` returns `latest` + `trend`.
- [ ] UI check: `/litopc/trust-dashboard` renders latest metrics and case status table.
- [ ] No 500/parse errors when history is empty.

## 5) Gate B Decision
- [ ] Benchmark suite and model change log are publicly accessible.
- [ ] Regression run is repeatable and auditable from repository artifacts.
