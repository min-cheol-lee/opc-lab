# Week 1-2 Hardening Checklist

Date: 2026-02-24
Scope: stabilize Week1-2 deliverables before Phase 2 work.

## Automated Smoke (Baseline)
- Command: `.\dev-hardening-smoke.ps1`
- Includes:
  - frontend typecheck (`npx --no-install tsc --noEmit`)
  - backend contour smoke (`python -m app.sim.contour_smoke_test`)
  - backend `simulate` + `simulate/batch` smoke (inline Python)
- Current result: PASS (re-verified on 2026-02-24 after quota/event/audit integration)

## Functional Regression Checklist
- [ ] Scenario save/load/delete works after refresh.
- [ ] Run history restore works and current run badge is correct.
- [ ] A/B compare overlay and delta CD render correctly.
- [ ] Sweep runs for dose/width/height/pitch and shows point list/chart.
- [ ] Sweep overlay control behaves in toolbar (Overlay, Stack All, Focus point).
- [ ] Non-dose stack view shows mask(dotted) + contour(solid) in 2D/3D.
- [ ] Export actions work: Figure PNG, Figure SVG, Runs CSV, Sweep CSV.
- [ ] Free/Pro plan gate messages are visible and accurate.

## UX/Visual Hardening Checklist
- [ ] 2D/3D panel overlays do not occlude core controls at default size.
- [ ] Ruler interactions (arrow keys, shift x10, bracket width adjust) are stable.
- [ ] Custom mask multi-select drag/keyboard move remains functional.
- [ ] Top toolbar icons and labels render without broken glyphs.
- [ ] Mobile width (<=1280px) keeps controls reachable without overflow breakage.

## Persistence/State Checklist
- [ ] Scenarios persist in localStorage and recover cleanly.
- [ ] Saved sweep snapshots persist and load correctly.
- [ ] Invalid/broken localStorage entries fail gracefully (no crash).

## Release Gate for Week1-2 Close
- [ ] Automated smoke passes on clean pull.
- [ ] No blocker in functional regression checklist.
- [ ] No blocker visual regression on 2D/3D overlay and ruler flows.
- [ ] Product direction alignment confirmed (sweep/compare/export/scenario focus).

## Immediate Next Actions (after checklist pass)
1. Freeze Week1-2 as release candidate.
2. Start Phase 2A monetization infrastructure:
   - server metering and quota enforcement
   - upgrade funnel instrumentation
   - plan entitlement parity check
3. Start Phase 2B reputation infrastructure:
   - benchmark suite expansion
   - model change log operating flow
   - run `.\dev-trust-benchmark.ps1` and publish artifacts
   - follow `docs/phase2b-release-checklist.md`
4. Start Phase 2C advanced analytics integration only after Gate A/B.
