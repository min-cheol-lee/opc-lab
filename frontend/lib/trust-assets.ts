export type BenchmarkCase = {
  id: string;
  title: string;
  intent: string;
  preset: string;
  mask: string;
  setup: string;
  expected: string[];
  status: "verified" | "partial" | "draft";
  lastReviewed: string;
};

export type ModelChangeEntry = {
  id: string;
  versionTag: string;
  releasedOn: string;
  scope: "model" | "simulation" | "visualization" | "ux";
  summary: string;
  userImpact: string;
  validation: string[];
  status: "active" | "rolled_back" | "experimental";
};

export const BENCHMARK_GALLERY: BenchmarkCase[] = [
  {
    id: "bk-iso-dose-monotonic-duv-imm",
    title: "ISO Line Dose Monotonicity (DUV Immersion)",
    intent: "Higher dose threshold should shrink printed contour width in a monotonic trend.",
    preset: "DUV_193_IMM",
    mask: "ISO_LINE (cd=80, length=900)",
    setup: "Dose sweep 0.30 -> 0.60, step 0.10, focus=0.0",
    expected: [
      "Contour exists for all sampled points.",
      "Extracted CD trend is monotonic non-increasing vs dose.",
      "Sweep point count and order are stable.",
    ],
    status: "verified",
    lastReviewed: "2026-02-25",
  },
  {
    id: "bk-iso-dose-extinction-duv-dry",
    title: "ISO Line Extinction at High Dose (DUV Dry)",
    intent: "At fixed geometry, high threshold should eventually produce a no-print contour state.",
    preset: "DUV_193_DRY",
    mask: "ISO_LINE (cd=80, length=900)",
    setup: "Single-run comparison dose=0.30 vs 0.60",
    expected: [
      "Low-dose case prints (non-empty contour).",
      "High-dose case is non-print (no contour, CD=null).",
      "Transition is reproducible run-to-run.",
    ],
    status: "verified",
    lastReviewed: "2026-02-25",
  },
  {
    id: "bk-contact-width-monotonic-duv-dry",
    title: "Square Width Monotonicity (DUV Dry)",
    intent: "Larger square mask width should not reduce printed CD under fixed process settings.",
    preset: "DUV_193_DRY",
    mask: "Square / CONTACT_RAW (w sweep)",
    setup: "Width sweep 120 -> 180, step 20, dose=0.40",
    expected: [
      "All sampled width points print valid contour.",
      "Extracted CD trend is monotonic non-decreasing vs width.",
      "No out-of-order width mapping in batch output.",
    ],
    status: "verified",
    lastReviewed: "2026-02-25",
  },
  {
    id: "bk-contact-serif-monotonic-duv-dry",
    title: "Square OPC Serif Response (DUV Dry)",
    intent: "Increasing serif size should increase effective printed CD for the Square OPC mask.",
    preset: "DUV_193_DRY",
    mask: "Square OPC / CONTACT_OPC_SERIF (w=120, serif sweep)",
    setup: "Serif sweep 0 -> 60, representative samples",
    expected: [
      "Baseline without serif is printable.",
      "Printed CD is monotonic non-decreasing with serif size.",
      "No contour disappearance across sampled serif points.",
    ],
    status: "verified",
    lastReviewed: "2026-02-25",
  },
  {
    id: "bk-staircase-dose-monotonic-duv-dry",
    title: "Stepped Interconnect Dose Monotonicity (EUV Low-NA)",
    intent: "The stepped interconnect template should preserve monotonic CD shrink with increasing dose threshold.",
    preset: "EUV_LNA",
    mask: "Stepped Interconnect / STAIRCASE (thickness=88)",
    setup: "Dose sweep 0.30 -> 0.60, step 0.10",
    expected: [
      "All sampled points print valid contour.",
      "Extracted CD trend is monotonic non-increasing vs dose.",
      "Contour count remains stable (single main contour).",
    ],
    status: "verified",
    lastReviewed: "2026-02-25",
  },
  {
    id: "bk-guard-nonprint-small-iso-duv-dry",
    title: "Guardrail Non-Print for Small ISO (DUV Dry)",
    intent: "Sub-guard requested CD should be blocked as non-print by educational model guardrails.",
    preset: "DUV_193_DRY",
    mask: "ISO_LINE (cd=50 vs cd=60)",
    setup: "Compare two runs at dose=0.30, focus=0.0",
    expected: [
      "cd=50 run returns no contour and CD=null.",
      "cd=60 run remains printable (CD present).",
      "Behavior aligns with published educational guard model.",
    ],
    status: "verified",
    lastReviewed: "2026-02-25",
  },
  {
    id: "bk-euv-contact-dose-stability",
    title: "EUV Square Dose Stability",
    intent: "EUV square should remain printable across moderate dose sweep with smooth CD trend.",
    preset: "EUV_LNA",
    mask: "Square / CONTACT_RAW (w=120)",
    setup: "Dose sweep 0.30 -> 0.60, step 0.10",
    expected: [
      "All sampled points print valid contour.",
      "CD trend is monotonic non-increasing with dose.",
      "No abrupt contour loss in this range.",
    ],
    status: "verified",
    lastReviewed: "2026-02-25",
  },
  {
    id: "bk-batch-contract-count",
    title: "Batch API Point Count Contract",
    intent: "Batch response count and points length should match deterministic sweep size.",
    preset: "DUV_193_IMM",
    mask: "ISO_LINE (cd=80, length=900)",
    setup: "Batch dose 0.30 -> 0.70, step 0.10, include_contours=false",
    expected: [
      "Response `count` equals expected sweep point count.",
      "`points.length` equals `count`.",
      "Each point includes metric payload.",
    ],
    status: "verified",
    lastReviewed: "2026-02-25",
  },
  {
    id: "bk-batch-contour-decimation",
    title: "Batch Contour Decimation Contract",
    intent: "When contour payload is requested, per-polyline point caps should be respected.",
    preset: "DUV_193_IMM",
    mask: "ISO_LINE (cd=80, length=900)",
    setup: "Batch dose 0.30 -> 0.70, step 0.10, include_contours=true, max_points_per_contour=120",
    expected: [
      "Each batch point includes contours array (possibly empty).",
      "No contour polyline exceeds configured max point cap.",
      "Active CD metrics remain available alongside contour payload.",
    ],
    status: "verified",
    lastReviewed: "2026-02-25",
  },
  {
    id: "bk-dense-ls-euv-presence",
    title: "Dense L/S EUV Presence Check",
    intent: "Representative dense pattern should print and remain inside expected CD band.",
    preset: "EUV_LNA",
    mask: "DENSE_LS (cd=80, pitch=200, n_lines=7)",
    setup: "Single run on EUV_LNA, dose=0.40, focus=0.0",
    expected: [
      "Contour set is non-empty.",
      "Extracted CD falls in expected educational range (60nm ~ 90nm).",
      "Run remains reproducible at fixed inputs.",
    ],
    status: "verified",
    lastReviewed: "2026-02-25",
  },
];

export const MODEL_CHANGE_LOG: ModelChangeEntry[] = [
  {
    id: "chg-2026-02-20-base",
    versionTag: "v0.1.0-edu-guard-1",
    releasedOn: "2026-02-20",
    scope: "model",
    summary: "Baseline educational guard model with CD_min check and contour extraction pipeline.",
    userImpact: "Users see conservative non-print behavior below guard threshold.",
    validation: [
      "Contour smoke test on synthetic rectangle field.",
      "Preset guard values displayed in trust strip.",
    ],
    status: "active",
  },
  {
    id: "chg-2026-02-23-sweep-overlay",
    versionTag: "v0.1.0-edu-guard-1+overlay-r2",
    releasedOn: "2026-02-23",
    scope: "visualization",
    summary: "Added sweep overlay in 2D/3D with active-point focus and stack controls.",
    userImpact: "Sweep trends can be inspected directly on geometry/contour overlays.",
    validation: [
      "Dose sweep overlay visible on 2D and 3D panels.",
      "Focus-point slider updates active condition consistently.",
    ],
    status: "active",
  },
  {
    id: "chg-2026-02-24-nondose-stack",
    versionTag: "v0.1.0-edu-guard-1+overlay-r3",
    releasedOn: "2026-02-24",
    scope: "visualization",
    summary: "Enabled non-dose stack view and separated 3D sweep rendering by silicon/mask plane.",
    userImpact: "Non-dose sweep stack is readable in both 2D and 3D at steep view angles.",
    validation: [
      "Non-dose stack: mask dotted, contour solid, active contour highlighted.",
      "3D mask-plane overlay remains visible across camera rotations.",
    ],
    status: "active",
  },
];
