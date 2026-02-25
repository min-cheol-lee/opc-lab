# OPC Lab Product Direction (Revenue + Reputation)

## 1. Positioning (recommended)
- Primary message:
  `Physics-informed, benchmarked educational OPC simulator`
- Avoid:
  `Industry-standard sign-off`
- Why:
  - Preserves trust with engineers.
  - Still supports premium value through speed, UX, and reproducible workflows.

## 2. Primary Customer (Phase 1)
- Semiconductor students
- New OPC/lithography engineers
- Process/device researchers and AE/FAE profiles

## 3. Monetization Strategy
- Core paid value is not "pretty graphics".
- Core paid value is workflow productivity:
  - fast what-if sweeps
  - A/B result comparison
  - report/export
  - save/share scenarios

## 4. Product Packaging
- Free:
  - limited runs/day
  - limited scenario slots
  - lower export quality or watermark
- Pro Individual:
  - batch sweep
  - compare mode
  - unlimited saved scenarios
  - high-res export (SVG/PNG/CSV/PDF)
- Pro Team:
  - shared workspaces
  - curated scenario templates
  - role-based access + training mode

## 5. Trust Strategy (for reputation)
- Always display model assumptions, limits, and version.
- Keep a public benchmark gallery with known behaviors.
- Publish model-change logs (what changed, why).

## 6. Release Strategy
- Phase 1: Engineer-first release (current app base).
- Phase 2: Public showcase mode (separate presentation-focused variant).

## 7. Advanced Analytics Policy (Bossung Curve)
- Bossung curve is valuable for technical credibility and training.
- But for near-term revenue, it is secondary to:
  - sweep
  - compare
  - export/report
- Recommendation:
  - keep Bossung as Pro advanced analytics in Phase 2C.
  - do not block monetization infrastructure (Phase 2A) on it.

## 8. Post-Week1-2 Priority (must reorder)
To maximize revenue and reputation together, execute in this order:

1) Phase 2A: Monetization Infrastructure (Revenue First)
- Server-enforced usage metering:
  - run/day quota
  - sweep point/day quota
  - export quota or quality gate
- Upgrade funnel instrumentation:
  - paywall exposure
  - upgrade click-through
  - checkout start/completion
- Plan entitlements and policy consistency:
  - free/pro behavior must match on frontend/backend
  - no policy bypass via direct API calls

2) Phase 2B: Reputation Infrastructure (Trust First)
- Public benchmark gallery expansion (fixed reproducible cases).
- Model change log process (versioned, dated, user-impact oriented).
- Regression board:
  - benchmark pass/fail trend by model version
  - visible assumptions and known limits

3) Phase 2C: Advanced Analytics (Bossung / Process Window)
- Start only after 2A and 2B minimum gates are green.
- Position as Pro differentiator and technical authority amplifier.

## 9. Phase Gates (Go/No-Go)
- Gate A (before 2B/2C):
  - usage metering live
  - upgrade funnel events live
  - policy parity validated (frontend/backend)
- Gate B (before 2C API integration):
  - benchmark gallery + change log published
  - regression smoke + benchmark checks repeatable

## 10. KPI Targets (4-8 week operating view)
Revenue KPIs:
- Visitor -> Upgrade Click Rate: >= 8%
- Upgrade Click -> Paid Conversion: >= 2.5%
- Pro weekly retention (W1 -> W2): >= 55%
- Export-intent to paid conversion uplift: positive trend week-over-week

Reputation KPIs:
- Public benchmark cases with clear expected behavior: >= 10
- Benchmark pass rate on active model version: >= 95%
- Mean time to publish model change note after behavior change: <= 48h
- Technical showcase assets (blog/demo/notebook): >= 1 major artifact/month

Execution principle:
- If revenue KPIs degrade, prioritize 2A hardening over new analytics.
- If trust KPIs degrade, pause feature velocity and restore benchmark integrity first.
