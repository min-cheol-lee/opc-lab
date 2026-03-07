# Phase 2 MVP Scope: Bossung + Process Window

Date: 2026-02-24  
Owner: Frontend + Backend  
Status: Draft (Phase 2C candidate; gated by 2A/2B)

## 1) Goal
- Add Pro-grade advanced analytics for technical credibility:
  - Bossung curve (CD vs Focus at multiple dose conditions)
  - Process window map (dose-focus plane with pass/fail region)
- Keep current `/simulate` flow intact.
- Keep monetization and trust infra priority above this scope.

## 2) Non-goals (MVP)
- No foundry-calibrated sign-off claim.
- No resist stochastic model in this phase.
- No cloud collaboration dependency.

## 3) User Value
- Engineers can understand dose/focus trade-offs quickly.
- Training/education impact improves with visual process window.
- Pro differentiation becomes clearer beyond basic sweep/export.

## 3.1) Phase Gate Prerequisites (must-pass before full integration)
- Gate A complete:
  - usage metering and quota enforcement live
  - upgrade funnel instrumentation live
  - frontend/backend plan policy parity validated
- Gate B complete:
  - benchmark gallery and model change log published
  - repeatable benchmark regression checks running

## 4) MVP UX Scope
- New page: `/litopc/advanced-analytics`
- Two tabs:
  - `Bossung`:
    - dose set input (e.g. 0.35, 0.45, 0.55)
    - focus range (min/max/step)
    - overlay curves by dose
  - `Process Window`:
    - 2D heat/map over dose-focus grid
    - pass/fail threshold controls (CD error tolerance)
- Shared:
  - metadata strip (preset/template/grid/version)
  - export hooks (Phase 2.1: PNG/CSV)

## 5) Backend MVP Scope
- Add new endpoint (candidate):
  - `POST /simulate/advanced/bossung`
  - input: base request + dose list + focus sweep config
  - output: per-dose series of `(focus, cd, epe)` points
- Add new endpoint (candidate):
  - `POST /simulate/advanced/window`
  - input: base request + dose range + focus range + tolerance config
  - output: grid of `(dose, focus, cd, epe, pass)` points
- Keep policy enforcement (FREE/PRO) consistent with existing batch logic.

## 6) Frontend MVP Scope
- UI skeleton and chart scaffolding first.
- Integrate API after skeleton stabilization.
- Initial data contract adapters for:
  - series chart
  - grid/heat panel

## 7) Acceptance Criteria
- Bossung:
  - At least 3 dose series render on same chart.
  - Focus axis and CD axis labels/units explicit.
  - Selected point details visible.
- Process Window:
  - Dose-focus map renders with clear pass/fail visual encoding.
  - Tolerance changes update pass/fail map.
- Trust:
  - Version and assumptions visible on page.
  - No sign-off wording.

## 8) Delivery Plan (Short)
1. UI skeleton page + sample data wiring (done in this step).
2. Backend contract proposal + mock response fixtures.
3. Bossung endpoint integration (after Gate A/B).
4. Process window endpoint integration (after Gate A/B).
5. Export/report hooks and regression pass.

## 8.1) Success Metrics (2C scope)
- Advanced analytics page adoption among Pro users: >= 25% weekly active.
- Bossung export usage among advanced analytics users: >= 20%.
- No statistically significant drop in core paid workflows:
  - sweep usage
  - compare usage
  - export usage

## 9) Risks
- Compute cost can spike with dense dose/focus grids.
- Visual interpretation can mislead without clear assumptions.
- Mitigation:
  - cap grid sizes by plan
  - display assumptions + limits inline
