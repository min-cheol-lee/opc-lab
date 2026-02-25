"use client";

import React, { useEffect, useRef, useState } from "react";
import { ControlPanel } from "../../components/ControlPanel";
import { Viewport } from "../../components/Viewport";
import {
  BatchSimRequest,
  BatchSimResponse,
  MaskShape,
  RunRecord,
  SimRequest,
  SimResponse,
  SweepParam,
} from "../../lib/types";
import { SavedScenario, loadScenarios, saveScenarios } from "../../lib/scenarios";
import { exportSweepCsv } from "../../lib/export";
import { createCheckoutSession, createPortalSession, fetchBillingStatus, type BillingStatus } from "../../lib/billing";
import { getApiBase } from "../../lib/api-base";
import {
  clientHeaders,
  consumeUsage,
  fetchCurrentEntitlement,
  fetchEntitlements,
  fetchUsageStatus,
  type CurrentEntitlementResponse,
  type EntitlementsResponse,
  type UsageStatus,
} from "../../lib/usage";
import { flushProductEvents, trackProductEvent } from "../../lib/telemetry";

const API_BASE = getApiBase();
const FREE_PRESETS: Array<SimRequest["preset_id"]> = ["DUV_193_DRY", "EUV_LNA"];
const FREE_TEMPLATES_BASE: Array<NonNullable<SimRequest["mask"]["template_id"]>> = ["ISO_LINE", "DENSE_LS", "CONTACT_RAW"];
const PRO_TEMPLATES_BASE: Array<NonNullable<SimRequest["mask"]["template_id"]>> = [
  "ISO_LINE",
  "DENSE_LS",
  "CONTACT_RAW",
  "CONTACT_OPC_SERIF",
  "STAIRCASE",
];
const ADVANCED_CORNER_TEMPLATES: Array<NonNullable<SimRequest["mask"]["template_id"]>> = [
  "LINE_END_RAW",
  "LINE_END_OPC_HAMMER",
  "L_CORNER_RAW",
  "L_CORNER_OPC_SERIF",
];
const ENABLE_ADVANCED_CORNER_TEMPLATES = false;
const FREE_DOSE_MIN = 0.3;
const FREE_DOSE_MAX = 0.8;
const FREE_CUSTOM_RECT_LIMIT = 3;
const PRO_CUSTOM_SHAPE_LIMIT = 48;
const FREE_SWEEP_MAX_POINTS = 24;
const PRO_SWEEP_MAX_POINTS = 120;
const FREE_SCENARIO_LIMIT = 8;
const CUSTOM_MASK_LIBRARY_KEY = "opclab_mask_library_v2";
const SWEEP_LIBRARY_KEY = "opclab_sweep_library_v1";
const SIDEBAR_EXPANDED_KEY = "opclab_sidebar_expanded_v1";
const WORKSPACE_SCALE_KEY = "opclab_workspace_scale_v1";
const WORKSPACE_SCALE_MIN = 0.78;
const WORKSPACE_SCALE_MAX = 1.85;

type SavedSweepSnapshot = {
  id: string;
  name: string;
  createdAt: string;
  param: SweepParam;
  main: BatchSimResponse;
  compareA: BatchSimResponse | null;
  compareB: BatchSimResponse | null;
};

type CustomMaskPreset = {
  id: string;
  name: string;
  createdAt: string;
  mode: "TEMPLATE" | "CUSTOM";
  template_id?: SimRequest["mask"]["template_id"];
  params_nm: Record<string, number>;
  shapes: Array<MaskShape>;
};

const DEFAULT_PARAMS: Record<string, number> = {
  fov_nm: 1100,
  cd_nm: 80,
  w_nm: 80,
  length_nm: 900,
  pitch_nm: 140,
  serif_nm: 28,
  hammer_w_nm: 160,
  hammer_h_nm: 28,
  sraf_on: 0,
  sraf_w_nm: 30,
  sraf_offset_nm: 80,
  step_w_nm: 40,
  step_h_nm: 40,
  n_steps: 12,
  thickness_nm: 80,
};

export default function Page() {
  const FREE_TEMPLATES = FREE_TEMPLATES_BASE;
  const PRO_TEMPLATES = ENABLE_ADVANCED_CORNER_TEMPLATES
    ? [...PRO_TEMPLATES_BASE, ...ADVANCED_CORNER_TEMPLATES]
    : PRO_TEMPLATES_BASE;
  const [plan, setPlan] = useState<"FREE" | "PRO">("FREE");
  const [maskMode, setMaskMode] = useState<"TEMPLATE" | "CUSTOM">("TEMPLATE");
  const [presetId, setPresetId] = useState<SimRequest["preset_id"]>("DUV_193_DRY");
  const [templateId, setTemplateId] = useState<SimRequest["mask"]["template_id"]>("ISO_LINE");
  const [customShapes, setCustomShapes] = useState<Array<MaskShape>>([]);
  const [selectedCustomShapeIndex, setSelectedCustomShapeIndex] = useState<number>(-1);
  const [selectedCustomShapeIndexes, setSelectedCustomShapeIndexes] = useState<number[]>([]);
  const [drawRectMode, setDrawRectMode] = useState(false);

  const [dose, setDose] = useState(0.5);
  const [params, setParams] = useState<Record<string, number>>(DEFAULT_PARAMS);

  const [sim, setSim] = useState<SimResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [runHistory, setRunHistory] = useState<RunRecord[]>([]);
  const [currentRunId, setCurrentRunId] = useState("");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareAId, setCompareAId] = useState("");
  const [compareBId, setCompareBId] = useState("");
  const [customMaskPresets, setCustomMaskPresets] = useState<Array<CustomMaskPreset>>([]);
  const [sweepParam, setSweepParam] = useState<SweepParam>("dose");
  const [sweepCustomTargetIndex, setSweepCustomTargetIndex] = useState(0);
  const [sweepStart, setSweepStart] = useState(0.3);
  const [sweepStop, setSweepStop] = useState(0.8);
  const [sweepStep, setSweepStep] = useState(0.1);
  const [sweepLoading, setSweepLoading] = useState(false);
  const [sweepResult, setSweepResult] = useState<BatchSimResponse | null>(null);
  const [sweepCompareA, setSweepCompareA] = useState<BatchSimResponse | null>(null);
  const [sweepCompareB, setSweepCompareB] = useState<BatchSimResponse | null>(null);
  const [savedSweeps, setSavedSweeps] = useState<SavedSweepSnapshot[]>([]);
  const [customLimitNotice, setCustomLimitNotice] = useState<string | null>(null);
  const [usageStatus, setUsageStatus] = useState<UsageStatus | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [entitlementWarning, setEntitlementWarning] = useState<string | null>(null);
  const [currentEntitlement, setCurrentEntitlement] = useState<CurrentEntitlementResponse | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [workspaceScale, setWorkspaceScale] = useState(1);
  const workspacePinchRef = useRef<{ startDistance: number; startScale: number } | null>(null);

  const grid = plan === "PRO" ? 1024 : 512;
  const returnIntensity = plan === "PRO";
  const effectiveParams = { ...params, sraf_on: 0 };

  const req: SimRequest = {
    plan,
    grid,
    preset_id: presetId,
    dose,
    focus: 0,
    return_intensity: returnIntensity,
    mask: {
      mode: maskMode,
      template_id: maskMode === "TEMPLATE" ? templateId! : undefined,
      params_nm: effectiveParams,
      shapes: maskMode === "CUSTOM" ? customShapes : undefined,
    },
  };
  const scenarioLimit = plan === "FREE" ? FREE_SCENARIO_LIMIT : null;
  const scenarioLimitReached = scenarioLimit !== null && scenarios.length >= scenarioLimit;
  const sweepLocked = plan === "FREE";
  const isPitchSweepAllowed = maskMode === "TEMPLATE" && templateId === "DENSE_LS";
  const isSerifSweepAllowed = maskMode === "TEMPLATE" && templateId === "CONTACT_OPC_SERIF";
  const customShapeLimit = plan === "FREE" ? FREE_CUSTOM_RECT_LIMIT : PRO_CUSTOM_SHAPE_LIMIT;
  const customLimitReached = customShapes.length >= customShapeLimit;

  async function refreshUsageStatus(nextPlan: "FREE" | "PRO" = plan) {
    setUsageLoading(true);
    setUsageError(null);
    try {
      const status = await fetchUsageStatus(nextPlan);
      setUsageStatus(status);
      setPlan((prev) => (prev === status.plan ? prev : status.plan));
    } catch (err) {
      setUsageError(toUiFetchError(err, "Failed to load usage status."));
    } finally {
      setUsageLoading(false);
    }
  }

  async function refreshAccountState() {
    setAccountLoading(true);
    setAccountError(null);
    try {
      const [me, billing] = await Promise.all([fetchCurrentEntitlement(), fetchBillingStatus()]);
      setCurrentEntitlement(me);
      setBillingStatus(billing);
      setPlan((prev) => (prev === me.plan ? prev : me.plan));
      void refreshUsageStatus(me.plan);
    } catch (err) {
      setAccountError(toUiFetchError(err, "Failed to load account state."));
    } finally {
      setAccountLoading(false);
    }
  }

  useEffect(() => {
    if (plan !== "FREE") return;
    if (!FREE_PRESETS.includes(presetId)) setPresetId("DUV_193_DRY");
    if (!templateId || !FREE_TEMPLATES.includes(templateId)) setTemplateId("ISO_LINE");
    if (dose < FREE_DOSE_MIN) setDose(FREE_DOSE_MIN);
    if (dose > FREE_DOSE_MAX) setDose(FREE_DOSE_MAX);
    if (maskMode === "CUSTOM") {
      const trimmed = customShapes.filter((s) => s.type === "rect").slice(0, FREE_CUSTOM_RECT_LIMIT);
      if (trimmed.length !== customShapes.length) {
        setCustomShapes(trimmed);
        setSelectedCustomShapeIndex(trimmed.length ? Math.min(selectedCustomShapeIndex, trimmed.length - 1) : -1);
      }
    }
  }, [plan, presetId, templateId, dose, maskMode, customShapes, selectedCustomShapeIndex]);

  useEffect(() => {
    void refreshAccountState();
  }, []);

  useEffect(() => {
    void refreshUsageStatus(plan);
  }, [plan]);

  useEffect(() => {
    async function checkParity() {
      try {
        const res = await fetchEntitlements();
        const mismatch = findEntitlementMismatch(res);
        if (!mismatch) return;
        setEntitlementWarning(mismatch);
      } catch {
        // Ignore parity check network errors; usage status path already reports critical connectivity issues.
      }
    }
    void checkParity();
  }, []);

  useEffect(() => {
    const qp = new URLSearchParams(window.location.search);
    if (qp.get("opclab_checkout") !== "stub") return;
    setAccountError("Checkout session created. Ask admin to complete entitlement via billing webhook mock.");
    void refreshAccountState();
  }, []);

  useEffect(() => {
    if (plan !== "PRO" || maskMode !== "CUSTOM") return;
    if (customShapes.length <= PRO_CUSTOM_SHAPE_LIMIT) return;
    setCustomShapes((prev) => prev.slice(0, PRO_CUSTOM_SHAPE_LIMIT));
    setSelectedCustomShapeIndex((prev) => Math.min(prev, PRO_CUSTOM_SHAPE_LIMIT - 1));
  }, [plan, maskMode, customShapes.length]);

  useEffect(() => {
    void flushProductEvents();
    const timer = window.setInterval(() => {
      void flushProductEvents();
    }, 20000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const valid = selectedCustomShapeIndexes
      .filter((i) => i >= 0 && i < customShapes.length)
      .sort((a, b) => a - b);
    const deduped = valid.filter((v, i) => i === 0 || valid[i - 1] !== v);
    if (deduped.length !== selectedCustomShapeIndexes.length || deduped.some((v, i) => v !== selectedCustomShapeIndexes[i])) {
      setSelectedCustomShapeIndexes(deduped);
    }
    if (selectedCustomShapeIndex >= customShapes.length) {
      setSelectedCustomShapeIndex(customShapes.length ? customShapes.length - 1 : -1);
    }
  }, [customShapes.length, selectedCustomShapeIndex, selectedCustomShapeIndexes, customShapes]);

  useEffect(() => {
    if (maskMode !== "CUSTOM" && drawRectMode) setDrawRectMode(false);
  }, [maskMode, drawRectMode]);

  useEffect(() => {
    setScenarios(loadScenarios());
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SIDEBAR_EXPANDED_KEY);
      if (raw === "1") {
        setSidebarExpanded(true);
        return;
      }
      if (raw === "0") {
        setSidebarExpanded(false);
        return;
      }
      if (window.matchMedia("(max-width: 1180px)").matches) {
        setSidebarExpanded(false);
      }
    } catch {
      // ignore local storage issues
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_EXPANDED_KEY, sidebarExpanded ? "1" : "0");
    } catch {
      // ignore local storage issues
    }
  }, [sidebarExpanded]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WORKSPACE_SCALE_KEY);
      if (!raw) return;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      const clamped = Math.max(WORKSPACE_SCALE_MIN, Math.min(WORKSPACE_SCALE_MAX, parsed));
      setWorkspaceScale(clamped);
    } catch {
      // ignore local storage issues
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(WORKSPACE_SCALE_KEY, String(workspaceScale));
    } catch {
      // ignore local storage issues
    }
  }, [workspaceScale]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CUSTOM_MASK_LIBRARY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Array<Partial<CustomMaskPreset>>;
      if (!Array.isArray(parsed)) return;
      const normalized: Array<CustomMaskPreset> = parsed.map((p) => {
        const shapes = (p.shapes ?? []).filter((s): s is MaskShape => !!s && s.type === "rect");
        const inferredMode: "TEMPLATE" | "CUSTOM" = p.mode ?? (shapes.length ? "CUSTOM" : "TEMPLATE");
        return {
          id: p.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: p.name ?? "Saved Mask",
          createdAt: p.createdAt ?? new Date().toISOString(),
          mode: inferredMode,
          template_id: p.template_id ?? "ISO_LINE",
          params_nm: { ...DEFAULT_PARAMS, ...(p.params_nm ?? {}) },
          shapes,
        };
      });
      setCustomMaskPresets(normalized);
    } catch {
      // ignore broken local cache
    }
  }, []);

  useEffect(() => {
    saveScenarios(scenarios);
  }, [scenarios]);

  useEffect(() => {
    window.localStorage.setItem(CUSTOM_MASK_LIBRARY_KEY, JSON.stringify(customMaskPresets));
  }, [customMaskPresets]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SWEEP_LIBRARY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Array<Partial<SavedSweepSnapshot>>;
      if (!Array.isArray(parsed)) return;
      const normalized = parsed
        .map((s) => {
          const main = compactSweepResponse(s.main as BatchSimResponse | null);
          if (!main) return null;
          return {
            id: s.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: s.name ?? `Sweep ${main.param}`,
            createdAt: s.createdAt ?? new Date().toISOString(),
            param: (s.param as SweepParam) ?? (main.param as SweepParam),
            main,
            compareA: compactSweepResponse(s.compareA as BatchSimResponse | null),
            compareB: compactSweepResponse(s.compareB as BatchSimResponse | null),
          } as SavedSweepSnapshot;
        })
        .filter((v): v is SavedSweepSnapshot => !!v);
      setSavedSweeps(normalized.slice(0, 24));
    } catch {
      // ignore broken local cache
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SWEEP_LIBRARY_KEY, JSON.stringify(savedSweeps));
  }, [savedSweeps]);

  useEffect(() => {
    if (!runHistory.length) return;
    if (!compareAId || !runHistory.some((r) => r.id === compareAId)) {
      setCompareAId(runHistory[0].id);
    }
    if (!compareBId || !runHistory.some((r) => r.id === compareBId)) {
      setCompareBId(runHistory.length > 1 ? runHistory[1].id : runHistory[0].id);
    }
  }, [runHistory, compareAId, compareBId]);

  useEffect(() => {
    if (!currentRunId) return;
    if (!runHistory.some((r) => r.id === currentRunId)) setCurrentRunId("");
  }, [currentRunId, runHistory]);

  useEffect(() => {
    if (sweepParam === "pitch" && !isPitchSweepAllowed) {
      setSweepParam("width");
      return;
    }
    if (sweepParam === "serif" && !isSerifSweepAllowed) {
      setSweepParam("width");
    }
  }, [sweepParam, isPitchSweepAllowed, isSerifSweepAllowed]);

  function getSweepBaseValue(param: SweepParam): number {
    if (param === "dose") return dose;
    if (param === "pitch") return params.pitch_nm ?? 140;
    if (param === "serif") return params.serif_nm ?? 28;
    if (param === "height") {
      if (maskMode === "CUSTOM") {
        const idx = Math.max(0, Math.min(sweepCustomTargetIndex, customShapes.length - 1));
        const s = customShapes[idx];
        return s && s.type === "rect" ? s.h_nm : (params.length_nm ?? 900);
      }
      return templateId === "STAIRCASE" ? (params.step_h_nm ?? 40) : (params.length_nm ?? 900);
    }
    if (maskMode === "CUSTOM") {
      const idx = Math.max(0, Math.min(sweepCustomTargetIndex, customShapes.length - 1));
      const s = customShapes[idx];
      return s && s.type === "rect" ? s.w_nm : (params.cd_nm ?? 80);
    }
    if (templateId === "CONTACT_RAW" || templateId === "CONTACT_OPC_SERIF") return params.w_nm ?? params.cd_nm ?? 80;
    if (templateId === "STAIRCASE") return params.thickness_nm ?? params.cd_nm ?? 80;
    return params.cd_nm ?? 80;
  }

  useEffect(() => {
    const base = getSweepBaseValue(sweepParam);
    if (!Number.isFinite(base)) return;
    if (sweepParam === "dose") {
      const pad = 0.2;
      const lo = plan === "FREE" ? FREE_DOSE_MIN : 0;
      const hi = plan === "FREE" ? FREE_DOSE_MAX : 1;
      setSweepStart(Math.max(lo, Math.min(hi, base - pad)));
      setSweepStop(Math.max(lo, Math.min(hi, base + pad)));
      setSweepStep(plan === "FREE" ? 0.1 : 0.2);
      return;
    }
    if (sweepParam === "serif") {
      const span = Math.max(4, base * 0.4);
      const start = Math.max(1, base - span);
      const stop = Math.max(start + 1, base + span);
      setSweepStart(Math.floor(start));
      setSweepStop(Math.ceil(stop));
      setSweepStep(2);
      return;
    }

    const span = Math.max(5, base * 0.3);
    const start = Math.max(1, base - span);
    const stop = Math.max(start + 1, base + span);
    const startRounded = Math.max(10, Math.floor(start / 10) * 10);
    const stopRounded = Math.max(startRounded + 10, Math.ceil(stop / 10) * 10);
    setSweepStart(startRounded);
    setSweepStop(stopRounded);
    setSweepStep(10);
  }, [sweepParam, sweepCustomTargetIndex, maskMode, customShapes, presetId, templateId, params, dose, plan]);

  useEffect(() => {
    if (!compareEnabled || !compareAId || !compareBId) {
      setSweepCompareA(null);
      setSweepCompareB(null);
    }
  }, [compareEnabled, compareAId, compareBId]);

  function applyRequestToControls(r: SimRequest) {
    setPlan(r.plan);
    setMaskMode(r.mask.mode ?? "TEMPLATE");
    setPresetId(r.preset_id);
    setTemplateId(r.mask.template_id ?? "ISO_LINE");
    setDose(r.dose);
    setParams({ ...DEFAULT_PARAMS, ...(r.mask.params_nm ?? {}) });
    setCustomShapes(((r.mask.shapes ?? []) as Array<MaskShape>).filter((s) => s.type === "rect"));
    setSelectedCustomShapeIndex(-1);
    setSelectedCustomShapeIndexes([]);
    setDrawRectMode(false);
  }

  function selectCustomShape(index: number, additive: boolean = false) {
    const safe = Math.max(0, Math.min(index, customShapes.length - 1));
    if (!Number.isFinite(safe) || customShapes.length === 0) return;
    if (!additive) {
      setSelectedCustomShapeIndex(safe);
      setSelectedCustomShapeIndexes([safe]);
      return;
    }
    setSelectedCustomShapeIndex(safe);
    setSelectedCustomShapeIndexes((prev) => {
      const has = prev.includes(safe);
      const next = has ? prev.filter((i) => i !== safe) : [...prev, safe];
      return next.length ? next.sort((a, b) => a - b) : [safe];
    });
  }

  function saveCurrentScenario(name: string) {
    const trimmed = name.trim();
    if (!trimmed || scenarioLimitReached) return;
    const snapshot: SavedScenario = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      createdAt: new Date().toISOString(),
      request: req,
    };
    const cap = scenarioLimit ?? 200;
    setScenarios((prev) => [snapshot, ...prev].slice(0, cap));
  }

  function loadScenarioById(id: string) {
    const target = scenarios.find((s) => s.id === id);
    if (!target) return;
    applyRequestToControls(target.request);
    setSim(null);
    setCurrentRunId("");
  }

  function deleteScenarioById(id: string) {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
  }

  function addCustomRect() {
    if (plan === "FREE") {
      setCustomLimitNotice("Quick Add is available on Pro plan only.");
      return;
    }
    const cap = PRO_CUSTOM_SHAPE_LIMIT;
    if (customShapes.length >= cap) return;
    const cd = Math.max(20, Math.min(900, params.cd_nm ?? 80));
    const h = Math.max(60, Math.min(900, params.length_nm ?? 260));
    const cx = (params.fov_nm ?? 1100) * 0.5;
    const cy = (params.fov_nm ?? 1100) * 0.5;
    const next: MaskShape = { type: "rect", x_nm: cx - cd / 2, y_nm: cy - h / 2, w_nm: cd, h_nm: h };
    setCustomShapes((prev) => {
      const out = [...prev, next];
      setSelectedCustomShapeIndex(out.length - 1);
      setSelectedCustomShapeIndexes([out.length - 1]);
      return out;
    });
    setCustomLimitNotice(null);
  }

  function addCustomRectFromDrag(rect: { x_nm: number; y_nm: number; w_nm: number; h_nm: number }) {
    const cap = plan === "FREE" ? FREE_CUSTOM_RECT_LIMIT : PRO_CUSTOM_SHAPE_LIMIT;
    if (customShapes.length >= cap) {
      setCustomLimitNotice(
        plan === "FREE"
          ? `Free supports up to ${FREE_CUSTOM_RECT_LIMIT} rectangles.`
          : `Pro supports up to ${PRO_CUSTOM_SHAPE_LIMIT} shapes.`
      );
      return;
    }
    const next: MaskShape = {
      type: "rect",
      x_nm: rect.x_nm,
      y_nm: rect.y_nm,
      w_nm: Math.max(1, rect.w_nm),
      h_nm: Math.max(1, rect.h_nm),
    };
    setCustomShapes((prev) => {
      const out = [...prev, next];
      setSelectedCustomShapeIndex(out.length - 1);
      setSelectedCustomShapeIndexes([out.length - 1]);
      return out;
    });
    setDrawRectMode(false);
    setCustomLimitNotice(null);
  }

  function deleteCustomShape(index: number) {
    setCustomShapes((prev) => {
      const out = prev.filter((_, i) => i !== index);
      setSelectedCustomShapeIndex((s) => (out.length ? Math.min(s, out.length - 1) : -1));
      setSelectedCustomShapeIndexes((sel) => {
        const next = sel
          .filter((i) => i !== index)
          .map((i) => (i > index ? i - 1 : i))
          .filter((i) => i >= 0 && i < out.length);
        return next.length ? next : (out.length ? [Math.min(index, out.length - 1)] : []);
      });
      return out;
    });
  }

  function updateCustomShape(index: number, shape: MaskShape) {
    setCustomShapes((prev) => prev.map((s, i) => (i === index ? shape : s)));
  }

  function saveCustomMaskPreset(name: string) {
    const trimmed = name.trim();
    if (!trimmed || plan !== "PRO") return;
    const shapesToSave = maskMode === "CUSTOM" ? customShapes.filter((s) => s.type === "rect") : [];
    if (maskMode === "CUSTOM" && shapesToSave.length === 0) return;
    const entry: CustomMaskPreset = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      createdAt: new Date().toISOString(),
      mode: maskMode,
      template_id: maskMode === "TEMPLATE" ? templateId : undefined,
      params_nm: { ...params },
      shapes: shapesToSave,
    };
    setCustomMaskPresets((prev) => [entry, ...prev].slice(0, 60));
  }

  function loadCustomMaskPreset(id: string) {
    const preset = customMaskPresets.find((p) => p.id === id);
    if (!preset) return;
    const nextMode: "TEMPLATE" | "CUSTOM" = preset.mode ?? ((preset.shapes?.length ?? 0) > 0 ? "CUSTOM" : "TEMPLATE");
    setMaskMode(nextMode);
    setTemplateId((preset.template_id as SimRequest["mask"]["template_id"]) ?? "ISO_LINE");
    setParams({ ...DEFAULT_PARAMS, ...(preset.params_nm ?? {}) });
    const nextShapes = (preset.shapes ?? []).filter((s) => s.type === "rect").map((s) => ({ ...s }));
    setCustomShapes(nextShapes);
    setSelectedCustomShapeIndex(nextMode === "CUSTOM" && nextShapes.length ? 0 : -1);
    setSelectedCustomShapeIndexes(nextMode === "CUSTOM" && nextShapes.length ? [0] : []);
    setDrawRectMode(false);
  }

  function deleteCustomMaskPreset(id: string) {
    setCustomMaskPresets((prev) => prev.filter((p) => p.id !== id));
  }

  async function runSim() {
    trackProductEvent("run_sim_clicked", { plan, presetId, maskMode });
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...clientHeaders() },
        body: JSON.stringify(req),
      });
      const data = (await r.json()) as SimResponse & { detail?: string };
      if (!r.ok) {
        throw new Error(data.detail ?? "Simulation failed");
      }
      setSim(data);
      const record: RunRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        created_at: new Date().toISOString(),
        label: `${presetId} / ${maskMode === "CUSTOM" ? "Custom" : templateLabel(templateId ?? "ISO_LINE")} / dose ${dose.toFixed(2)}`,
        request: req,
        response: data,
      };
      setRunHistory((prev) => [record, ...prev].slice(0, 30));
      setCurrentRunId(record.id);
      trackProductEvent("run_sim_succeeded", { plan, presetId, maskMode });
    } catch (err) {
      console.error(err);
      const reason = err instanceof Error ? err.message : "unknown";
      trackProductEvent("run_sim_failed", { reason });
      if (reason.toLowerCase().includes("quota")) {
        trackProductEvent("usage_quota_exhausted", { op: "runs", reason });
      }
    } finally {
      setLoading(false);
      void refreshUsageStatus(plan);
    }
  }

  async function runSweep() {
    if (sweepLocked) return;
    trackProductEvent("sweep_run_clicked", { plan, sweepParam, maskMode });
    const step = Math.max(0.0001, Math.abs(sweepStep));

    const toBackendParam = (param: SweepParam): BatchSimRequest["param"] => {
      switch (param) {
        case "width":
          if (maskMode === "TEMPLATE" && (templateId === "CONTACT_RAW" || templateId === "CONTACT_OPC_SERIF")) return "mask.params_nm.w_nm";
          if (maskMode === "TEMPLATE" && templateId === "STAIRCASE") return "mask.params_nm.thickness_nm" as BatchSimRequest["param"];
          return "mask.params_nm.cd_nm";
        case "height":
          return templateId === "STAIRCASE" ? "mask.params_nm.step_h_nm" : "mask.params_nm.length_nm";
        case "pitch":
          if (!(maskMode === "TEMPLATE" && templateId === "DENSE_LS")) {
            throw new Error("Pitch sweep is only available for Dense L/S template.");
          }
          return "mask.params_nm.pitch_nm";
        case "serif":
          if (!(maskMode === "TEMPLATE" && templateId === "CONTACT_OPC_SERIF")) {
            throw new Error("Serif sweep is only available for Contact (OPC Serif) template.");
          }
          return "mask.params_nm.serif_nm";
        default:
          return "dose";
      }
    };

    const makeRange = () => {
      const out: number[] = [];
      const dir = sweepStop >= sweepStart ? 1 : -1;
      const delta = Math.abs(step) * dir;
      let v = sweepStart;
      for (let i = 0; i < 512; i++) {
        out.push(Number(v.toFixed(6)));
        if ((dir > 0 && v >= sweepStop) || (dir < 0 && v <= sweepStop)) break;
        const nv = v + delta;
        if ((dir > 0 && nv > sweepStop) || (dir < 0 && nv < sweepStop)) {
          v = sweepStop;
        } else {
          v = nv;
        }
      }
      return out;
    };

    async function fetchBatch(baseReq: SimRequest): Promise<BatchSimResponse> {
      const isCustomLocalSweep = baseReq.mask.mode === "CUSTOM" && (
        sweepParam === "width" || sweepParam === "height"
      );
      if (isCustomLocalSweep) {
        const maxPoints = baseReq.plan === "FREE" ? FREE_SWEEP_MAX_POINTS : PRO_SWEEP_MAX_POINTS;
        let values = makeRange();
        let clampedByPlan = false;
        if (values.length > maxPoints) {
          values = values.slice(0, maxPoints);
          clampedByPlan = true;
        }
        const points: BatchSimResponse["points"] = [];
        for (const value of values) {
          const localReq: SimRequest = JSON.parse(JSON.stringify(baseReq));
          if (sweepParam === "width") {
            const idx = Math.max(0, Math.min(sweepCustomTargetIndex, (localReq.mask.shapes?.length ?? 1) - 1));
            const s = localReq.mask.shapes?.[idx];
            if (s && s.type === "rect") {
              const cx = s.x_nm + s.w_nm * 0.5;
              s.w_nm = Math.max(1, value);
              s.x_nm = cx - s.w_nm * 0.5;
            }
          } else if (sweepParam === "height") {
            const idx = Math.max(0, Math.min(sweepCustomTargetIndex, (localReq.mask.shapes?.length ?? 1) - 1));
            const s = localReq.mask.shapes?.[idx];
            if (s && s.type === "rect") {
              const cy = s.y_nm + s.h_nm * 0.5;
              s.h_nm = Math.max(1, value);
              s.y_nm = cy - s.h_nm * 0.5;
            }
          }
          const r = await fetch(`${API_BASE}/simulate`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...clientHeaders({ "x-opclab-usage-kind": "sweep-point" }),
            },
            body: JSON.stringify(localReq),
          });
          const data = (await r.json()) as SimResponse;
          if (!r.ok) throw new Error((data as any)?.detail ?? "Sweep point failed");
          points.push({ value, metrics: data.metrics, contours_nm: data.contours_nm ?? null });
        }
        return {
          param: sweepParam,
          points,
          count: points.length,
          clamped_by_plan: clampedByPlan,
          note: clampedByPlan
            ? `Point count clamped to ${maxPoints} for plan ${baseReq.plan}.`
            : `Custom sweep target: R${Math.max(1, sweepCustomTargetIndex + 1)}`,
        };
      }

      const payload: BatchSimRequest = {
        base: baseReq,
        param: toBackendParam(sweepParam),
        start: sweepStart,
        stop: sweepStop,
        step,
        include_contours: true,
        max_points_per_contour: 1200,
      };
      const r = await fetch(`${API_BASE}/simulate/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...clientHeaders() },
        body: JSON.stringify(payload),
      });
      const data = (await r.json()) as BatchSimResponse;
      if (!r.ok) throw new Error((data as any)?.detail ?? "Batch sweep failed");
      return { ...data, param: sweepParam };
    }

    setSweepLoading(true);
    try {
      const main = await fetchBatch(req);
      setSweepResult(main);

      if (compareActive && compareA && compareB) {
        const [aRes, bRes] = await Promise.all([
          fetchBatch(compareA.request),
          fetchBatch(compareB.request),
        ]);
        setSweepCompareA(aRes);
        setSweepCompareB(bRes);
      } else {
        setSweepCompareA(null);
        setSweepCompareB(null);
      }
      trackProductEvent("sweep_run_succeeded", {
        plan,
        sweepParam,
        points: main.count,
        compare: compareActive,
      });
    } catch (err) {
      console.error(err);
      setSweepResult(null);
      setSweepCompareA(null);
      setSweepCompareB(null);
      const reason = err instanceof Error ? err.message : "unknown";
      trackProductEvent("sweep_run_failed", { reason });
      if (reason.toLowerCase().includes("quota")) {
        trackProductEvent("usage_quota_exhausted", { op: "sweep_points", reason });
      }
    } finally {
      setSweepLoading(false);
      void refreshUsageStatus(plan);
    }
  }

  function compactSweepResponse(res: BatchSimResponse | null): BatchSimResponse | null {
    if (!res) return null;
    return {
      ...res,
      points: res.points.map((p) => ({
        value: p.value,
        metrics: { ...p.metrics },
        contours_nm: null,
      })),
    };
  }

  function saveSweepSnapshot(name: string) {
    if (!sweepResult) return;
    const trimmed = name.trim();
    const entry: SavedSweepSnapshot = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed || `Sweep ${sweepResult.param} ${new Date().toLocaleString()}`,
      createdAt: new Date().toISOString(),
      param: sweepResult.param as SweepParam,
      main: compactSweepResponse(sweepResult)!,
      compareA: compactSweepResponse(sweepCompareA),
      compareB: compactSweepResponse(sweepCompareB),
    };
    setSavedSweeps((prev) => [entry, ...prev].slice(0, 24));
  }

  function loadSweepSnapshot(id: string) {
    const target = savedSweeps.find((s) => s.id === id);
    if (!target) return;
    setSweepResult(target.main);
    setSweepCompareA(target.compareA);
    setSweepCompareB(target.compareB);
  }

  function deleteSweepSnapshot(id: string) {
    setSavedSweeps((prev) => prev.filter((s) => s.id !== id));
  }

  async function exportSweepResultCsv() {
    if (!sweepResult) return;
    trackProductEvent("export_attempted", { kind: "sweep_csv", plan });
    try {
      const consumed = await consumeUsage(plan, "exports", 1, false);
      setUsageStatus(consumed.status);
      if (!consumed.allowed || consumed.granted < 1) {
        const reason = consumed.reason ?? "Daily export quota exceeded.";
        trackProductEvent("export_blocked_quota", { kind: "sweep_csv", reason });
        trackProductEvent("usage_quota_exhausted", { op: "exports", reason });
        window.alert(reason);
        return;
      }
      exportSweepCsv(sweepResult, sweepCompareA, sweepCompareB);
      trackProductEvent("export_completed", { kind: "sweep_csv", plan });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Failed to verify export quota.";
      trackProductEvent("export_blocked_quota", { kind: "sweep_csv", reason });
      if (reason.toLowerCase().includes("quota")) {
        trackProductEvent("usage_quota_exhausted", { op: "exports", reason });
      }
      window.alert(reason);
    } finally {
      void refreshUsageStatus(plan);
    }
  }

  async function startUpgradeCheckout(source: string) {
    setAccountError(null);
    try {
      const returnUrl = `${window.location.origin}/opclab?upgrade_source=${encodeURIComponent(source)}`;
      const session = await createCheckoutSession(returnUrl, returnUrl);
      window.location.assign(session.url);
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Failed to start checkout.");
    }
  }

  async function openBillingPortal() {
    setAccountError(null);
    try {
      const returnUrl = `${window.location.origin}/opclab`;
      const portal = await createPortalSession(returnUrl);
      window.location.assign(portal.url);
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Failed to open billing portal.");
    }
  }

  function loadHistoryRun(id: string) {
    const target = runHistory.find((r) => r.id === id);
    if (!target) return;
    applyRequestToControls(target.request);
    setSim(target.response);
    setCurrentRunId(target.id);
  }

  function clearHistory() {
    setRunHistory([]);
    setCompareAId("");
    setCompareBId("");
    setCurrentRunId("");
  }

  const compareA = runHistory.find((r) => r.id === compareAId) ?? null;
  const compareB = runHistory.find((r) => r.id === compareBId) ?? null;
  const compareActive = compareEnabled && !!compareA && !!compareB && compareA.id !== compareB.id;
  const templateOptions = (plan === "FREE" ? FREE_TEMPLATES : PRO_TEMPLATES).map((id) => ({ id, label: templateLabel(id) }));

  const touchDistance = (a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }) => {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.hypot(dx, dy);
  };

  const onWorkspaceTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 2) return;
    const d = touchDistance(e.touches[0], e.touches[1]);
    if (d <= 8) return;
    workspacePinchRef.current = { startDistance: d, startScale: workspaceScale };
  };

  const onWorkspaceTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const pinch = workspacePinchRef.current;
    if (!pinch || e.touches.length !== 2) return;
    const d = touchDistance(e.touches[0], e.touches[1]);
    if (d <= 8) return;
    e.preventDefault();
    const scaled = pinch.startScale * (d / pinch.startDistance);
    const clamped = Math.max(WORKSPACE_SCALE_MIN, Math.min(WORKSPACE_SCALE_MAX, scaled));
    setWorkspaceScale((prev) => (Math.abs(prev - clamped) < 0.002 ? prev : Number(clamped.toFixed(3))));
  };

  const onWorkspaceTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      workspacePinchRef.current = null;
    }
  };

  return (
    <div className={`opclab-shell-wrap ${sidebarExpanded ? "" : "sidebar-collapsed"}`}>
      <button
        type="button"
        className="shell-sidebar-toggle"
        onClick={() => setSidebarExpanded((v) => !v)}
        aria-label={sidebarExpanded ? "Collapse left control panel" : "Expand left control panel"}
        title={sidebarExpanded ? "Hide controls panel" : "Show controls panel"}
      >
        <span className="shell-sidebar-toggle-glyph">{sidebarExpanded ? "◂" : "▸"}</span>
        <span className="shell-sidebar-toggle-label" aria-hidden="true">
          {sidebarExpanded ? "Hide" : "Show"}
        </span>
        <span className="sr-only">{sidebarExpanded ? "Hide Panel" : "Show Panel"}</span>
      </button>
      <div className={`opclab-shell ${sidebarExpanded ? "" : "shell-sidebar-collapsed"}`}>
        <div className={`opclab-sidebar ${sidebarExpanded ? "" : "is-hidden"}`}>
          <ControlPanel
        plan={plan}
        setPlan={setPlan}
        maskMode={maskMode}
        setMaskMode={setMaskMode}
        presetId={presetId}
        setPresetId={setPresetId}
        templateId={templateId}
        setTemplateId={setTemplateId}
        templateOptions={templateOptions}
        advancedTemplatesDisabled={!ENABLE_ADVANCED_CORNER_TEMPLATES}
        dose={dose}
        setDose={setDose}
        params={params}
        setParams={setParams}
        customShapes={customShapes}
        selectedCustomShapeIndex={selectedCustomShapeIndex}
        setSelectedCustomShapeIndex={(i) => {
          setSelectedCustomShapeIndex(i);
          setSelectedCustomShapeIndexes(i >= 0 ? [i] : []);
        }}
        selectedCustomShapeIndexes={selectedCustomShapeIndexes}
        onSelectCustomShapeChip={selectCustomShape}
        drawRectMode={drawRectMode}
        setDrawRectMode={setDrawRectMode}
        onAddCustomRect={addCustomRect}
        onDeleteCustomShape={deleteCustomShape}
        onUpdateCustomShape={updateCustomShape}
        freeCustomRectLimit={FREE_CUSTOM_RECT_LIMIT}
        proCustomShapeLimit={PRO_CUSTOM_SHAPE_LIMIT}
        customLimitReached={customLimitReached}
        customLimitNotice={customLimitNotice}
        customMaskPresets={customMaskPresets}
        onSaveCustomMaskPreset={saveCustomMaskPreset}
        onLoadCustomMaskPreset={loadCustomMaskPreset}
        onDeleteCustomMaskPreset={deleteCustomMaskPreset}
        loading={loading}
        onRun={runSim}
        scenarios={scenarios}
        scenarioLimit={scenarioLimit}
        scenarioLimitReached={scenarioLimitReached}
        onSaveScenario={saveCurrentScenario}
        onLoadScenario={loadScenarioById}
        onDeleteScenario={deleteScenarioById}
        freeDoseMin={FREE_DOSE_MIN}
        freeDoseMax={FREE_DOSE_MAX}
        runHistory={runHistory}
        currentRunId={currentRunId}
        onLoadHistoryRun={loadHistoryRun}
        onClearHistory={clearHistory}
        compareEnabled={compareEnabled}
        onSetCompareEnabled={setCompareEnabled}
        compareAId={compareAId}
        onSetCompareAId={setCompareAId}
        compareBId={compareBId}
        onSetCompareBId={setCompareBId}
        sweepParam={sweepParam}
        onSetSweepParam={setSweepParam}
        sweepStart={sweepStart}
        sweepCustomTargetIndex={sweepCustomTargetIndex}
        onSetSweepCustomTargetIndex={setSweepCustomTargetIndex}
        onSetSweepStart={setSweepStart}
        sweepStop={sweepStop}
        onSetSweepStop={setSweepStop}
        sweepStep={sweepStep}
        onSetSweepStep={setSweepStep}
        sweepLoading={sweepLoading}
        sweepResult={sweepResult}
        sweepCompareA={sweepCompareA}
        sweepCompareB={sweepCompareB}
        sweepCompareALabel={compareA?.label ?? null}
        sweepCompareBLabel={compareB?.label ?? null}
        sweepLocked={sweepLocked}
        onRunSweep={runSweep}
        sweepSavedSnapshots={savedSweeps.map((s) => ({ id: s.id, name: s.name, createdAt: s.createdAt, count: s.main.count, param: s.param }))}
        onSaveSweepSnapshot={saveSweepSnapshot}
        onLoadSweepSnapshot={loadSweepSnapshot}
        onDeleteSweepSnapshot={deleteSweepSnapshot}
        onExportSweepCsv={() => { void exportSweepResultCsv(); }}
        usageStatus={usageStatus}
        usageLoading={usageLoading}
        usageError={usageError ?? entitlementWarning}
        accountUserId={currentEntitlement?.user_id ?? null}
        accountSource={currentEntitlement?.source ?? null}
        accountProExpiresAt={currentEntitlement?.pro_expires_at_utc ?? null}
        billingStatus={billingStatus?.subscription_status ?? null}
        billingRenewalAt={billingStatus?.current_period_end_utc ?? null}
        accountLoading={accountLoading}
        accountError={accountError}
        onRefreshAccount={() => { void refreshAccountState(); }}
        onOpenBillingPortal={() => { void openBillingPortal(); }}
        onUpgradeIntent={(source) => { void startUpgradeCheckout(source); }}
          />
        </div>
        <div
          className="opclab-workspace-scroll"
          onTouchStart={onWorkspaceTouchStart}
          onTouchMove={onWorkspaceTouchMove}
          onTouchEnd={onWorkspaceTouchEnd}
          onTouchCancel={onWorkspaceTouchEnd}
        >
          <div className="opclab-workspace-inner" style={{ zoom: workspaceScale }}>
            <Viewport
              sim={sim}
              req={req}
              runHistory={runHistory}
              onCustomShapesChange={setCustomShapes}
              selectedCustomShapeIndex={selectedCustomShapeIndex}
              selectedCustomShapeIndexes={selectedCustomShapeIndexes}
              onSelectCustomShape={selectCustomShape}
              drawRectMode={drawRectMode}
              onSetDrawRectMode={setDrawRectMode}
              onAddCustomRectFromDrag={addCustomRectFromDrag}
              compareActive={compareActive}
              compareALabel={compareA?.label ?? null}
              compareBLabel={compareB?.label ?? null}
              compareAContours={compareA?.response.contours_nm ?? null}
              compareBContours={compareB?.response.contours_nm ?? null}
              compareACd={compareA?.response.metrics.cd_nm ?? null}
              compareBCd={compareB?.response.metrics.cd_nm ?? null}
              sweepResult={sweepResult}
              sweepCustomTargetIndex={sweepCustomTargetIndex}
              sweepCompareA={sweepCompareA}
              sweepCompareB={sweepCompareB}
              sweepCompareALabel={compareA?.label ?? null}
              sweepCompareBLabel={compareB?.label ?? null}
              onUsageConsumed={() => { void refreshUsageStatus(plan); }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function toUiFetchError(err: unknown, fallback: string): string {
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return `${fallback} Network/API connection issue detected. Check Vercel NEXT_PUBLIC_API_BASE and Railway CORS/allowlist settings.`;
  }
  return err instanceof Error ? err.message : fallback;
}

function findEntitlementMismatch(res: EntitlementsResponse): string | null {
  const byPlan = new Map(res.plans.map((p) => [p.plan, p] as const));
  const free = byPlan.get("FREE");
  const pro = byPlan.get("PRO");
  if (!free || !pro) return "Entitlement payload is missing FREE/PRO plans.";

  const checks: Array<{ ok: boolean; msg: string }> = [
    { ok: free.max_custom_rects === FREE_CUSTOM_RECT_LIMIT, msg: "FREE custom rect limit mismatch" },
    { ok: pro.max_custom_rects === PRO_CUSTOM_SHAPE_LIMIT, msg: "PRO custom rect limit mismatch" },
    { ok: free.max_sweep_points_per_run === FREE_SWEEP_MAX_POINTS, msg: "FREE sweep cap mismatch" },
    { ok: pro.max_sweep_points_per_run === PRO_SWEEP_MAX_POINTS, msg: "PRO sweep cap mismatch" },
    { ok: (free.scenario_limit ?? null) === FREE_SCENARIO_LIMIT, msg: "FREE scenario limit mismatch" },
    { ok: free.quick_add_enabled === false, msg: "FREE quick add entitlement mismatch" },
    { ok: pro.quick_add_enabled === true, msg: "PRO quick add entitlement mismatch" },
    { ok: free.batch_sweep_enabled === false, msg: "FREE batch sweep entitlement mismatch" },
    { ok: pro.batch_sweep_enabled === true, msg: "PRO batch sweep entitlement mismatch" },
  ];
  const broken = checks.find((c) => !c.ok);
  return broken ? `Policy parity warning: ${broken.msg}` : null;
}

function templateLabel(id: NonNullable<SimRequest["mask"]["template_id"]>): string {
  switch (id) {
    case "ISO_LINE":
      return "Isolated Line";
    case "DENSE_LS":
      return "Dense L/S";
    case "CONTACT_RAW":
      return "Contact (Raw)";
    case "CONTACT_OPC_SERIF":
      return "Contact (OPC Serif)";
    case "STAIRCASE":
      return "Staircase";
    case "LINE_END_RAW":
      return "Legacy Pattern A";
    case "LINE_END_OPC_HAMMER":
      return "Legacy Pattern B";
    case "L_CORNER_RAW":
      return "Legacy Pattern C";
    case "L_CORNER_OPC_SERIF":
      return "Legacy Pattern D";
    default:
      return id;
  }
}
















