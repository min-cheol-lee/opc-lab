# Week 1-2 Execution Backlog

Scope rule:
- Keep existing app structure and `/simulate` contract intact.
- Add features incrementally without breaking current flow.

---

## Sprint Goal
- Turn OPC Lab from "single-run viewer" into "repeatable analysis tool".

## Ticket W1-01: Scenario Save/Load (Local)
- Priority: P0
- Owner: Frontend
- Files:
  - `frontend/app/opclab/page.tsx`
  - `frontend/components/ControlPanel.tsx`
  - `frontend/lib/types.ts`
  - `frontend/lib/scenarios.ts` (new)
- Description:
  - Save current request state (`plan/preset/template/params/dose/focus`).
  - Load/delete saved scenarios from localStorage.
- Acceptance:
  - Can save scenario with name.
  - Can load saved scenario and run immediately.
  - Data persists after page refresh.

## Ticket W1-02: Run History (Last N)
- Priority: P0
- Owner: Frontend
- Files:
  - `frontend/app/opclab/page.tsx`
  - `frontend/components/Viewport.tsx`
  - `frontend/lib/types.ts`
- Description:
  - Keep last N runs (e.g., 20) with request + response + timestamp.
  - Show list with quick restore.
- Acceptance:
  - User can click any history item and view result.
  - Current run clearly marked.

## Ticket W1-03: A/B Compare Mode
- Priority: P0
- Owner: Frontend
- Files:
  - `frontend/app/opclab/page.tsx`
  - `frontend/components/Viewport.tsx`
  - `frontend/components/ControlPanel.tsx`
- Description:
  - Choose Run A and Run B from history.
  - Overlay contours and show delta metrics.
- Acceptance:
  - Two runs can be toggled/overlaid.
  - Delta CD is shown.
  - No change to backend API required.

## Ticket W1-04: Batch Sweep (MVP)
- Priority: P1
- Owner: Frontend + Backend
- Backend files:
  - `backend/app/models.py`
  - `backend/app/main.py`
  - `backend/app/sim/pipeline.py`
- Frontend files:
  - `frontend/components/ControlPanel.tsx`
  - `frontend/app/opclab/page.tsx`
- Description:
  - Add `POST /simulate/batch` (new endpoint, `/simulate` unchanged).
  - Inputs: parameter name + min/max/step.
  - Output: array of per-run metrics and optional sampled contours.
- Acceptance:
  - Batch result table rendered in UI.
  - Free/Pro gates can limit batch size.

## Ticket W1-05: Export Pack (MVP)
- Priority: P1
- Owner: Frontend
- Files:
  - `frontend/components/Viewport.tsx`
  - `frontend/app/opclab/page.tsx`
  - `frontend/lib/export.ts` (new)
- Description:
  - Export current visualization and metrics:
    - PNG/SVG for figure
    - CSV for runs
- Acceptance:
  - Exports include request metadata (preset/template/grid/dose/focus).
  - Free mode applies watermark if required.

## Ticket W1-06: Plan Gate UX
- Priority: P1
- Owner: Frontend
- Files:
  - `frontend/components/ControlPanel.tsx`
  - `frontend/app/opclab/page.tsx`
  - `frontend/app/globals.css`
- Description:
  - Clearly mark locked features:
    - batch sweep
    - unlimited saves
    - high-res export
- Acceptance:
  - Locked controls show tooltip/upgrade prompt.
  - Existing run flow unaffected.

## Ticket W1-07: Trust Panel (Model Card Lite)
- Priority: P0
- Owner: Frontend
- Files:
  - `frontend/components/Viewport.tsx`
  - `frontend/app/opclab/model-summary/page.tsx`
- Description:
  - Always show:
    - model version tag
    - guard formula (`CD_min ~= k1*lambda/NA`)
    - active k1 by preset
- Acceptance:
  - User can identify assumptions in one glance.
  - No hidden model behavior.

---

## Recommended Sequence
1. W1-01 Scenario Save/Load
2. W1-02 Run History
3. W1-03 A/B Compare
4. W1-07 Trust Panel
5. W1-05 Export Pack
6. W1-04 Batch Sweep
7. W1-06 Plan Gate UX

---

## Non-goals for Week 1-2
- Full calibrated sign-off model
- Cloud account/payment integration
- Team workspace backend
- Consumer-facing showcase app

---

## Phase 2+ Candidate (Revenue/Education)
### Bossung Curve / Process Window Map (Pro-first, post-PMF)
- Intent:
  - Educational clarity for dose/focus/CD trade-off.
  - Reputation lift for technical users and presentations.
- Suggested MVP:
  - Bossung curve plot: CD vs Focus for multiple dose conditions.
  - Companion map (dose vs focus), color by printable CD error or pass/fail.
  - Template-aware comparison (ISO_LINE, DENSE_LS, CONTACT first).
- Priority note:
  - Keep out of Week 1-2 core. Implement after sweep/compare/export shows usage traction.
  - In execution order, place after:
    1) Phase 2A monetization infrastructure
    2) Phase 2B reputation infrastructure
