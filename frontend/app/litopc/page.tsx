"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ControlPanel } from "../../components/ControlPanel";
import { EditStudioDock } from "../../components/EditStudioDock";
import { Viewport } from "../../components/Viewport";
import {
  BatchSimRequest,
  BatchSimResponse,
  MaskShape,
  RunRecord,
  SimRequest,
  SimResponse,
  SweepGeometryScope,
  SweepParam,
} from "../../lib/types";
import { SavedScenario, loadScenarios, saveScenarios } from "../../lib/scenarios";
import { exportSweepCsv } from "../../lib/export";
import { createCheckoutSession, createPortalSession, fetchBillingStatus, type BillingStatus } from "../../lib/billing";
import { getApiBase } from "../../lib/api-base";
import { getAccessToken, getDevEmail, getDevUserId } from "../../lib/auth";
import { downloadCustomMaskFile, parseCustomMaskFile } from "../../lib/custom-mask-files";
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
import {
  cloneMaskShapes,
  createHammerheadShape,
  createMousebiteShape,
  createSerifShape,
  createSrafShape,
  EditorLayer,
  EditorTool,
  EdgeAnchor,
  evaluateTargetScore,
  getCustomTargetGuide,
  getPresetTargetGuide,
  SrafOrientation,
  TargetGuide,
} from "../../lib/opc-workspace";
import {
  applyPresetFeatureOverrides,
  buildTemplateBaseShapes,
  cloneMaskShapes as cloneTemplateMaskShapes,
  type PresetFeatureOverride,
} from "../../lib/template-mask";

const API_BASE = getApiBase();
const FREE_PRESETS: Array<SimRequest["preset_id"]> = ["DUV_193_DRY", "EUV_LNA"];
const FREE_TEMPLATES_BASE: Array<NonNullable<SimRequest["mask"]["template_id"]>> = ["ISO_LINE", "DENSE_LS", "CONTACT_RAW"];
const PRO_TEMPLATES_BASE: Array<NonNullable<SimRequest["mask"]["template_id"]>> = [
  "ISO_LINE",
  "DENSE_LS",
  "CONTACT_RAW",
  "CONTACT_OPC_SERIF",
  "STAIRCASE",
  "STAIRCASE_OPC",
  "L_CORNER_RAW",
  "L_CORNER_OPC_SERIF",
];
const ADVANCED_CORNER_TEMPLATES: Array<NonNullable<SimRequest["mask"]["template_id"]>> = [
  "LINE_END_RAW",
  "LINE_END_OPC_HAMMER",
];
const ENABLE_ADVANCED_CORNER_TEMPLATES = false;
const FREE_DOSE_MIN = 0.3;
const FREE_DOSE_MAX = 0.8;
const FREE_CUSTOM_RECT_LIMIT = 3;
const PRO_CUSTOM_SHAPE_LIMIT = 48;
const FREE_SWEEP_MAX_POINTS = 24;
const PRO_SWEEP_MAX_POINTS = 120;
const FREE_SCENARIO_LIMIT = 8;
const CUSTOM_MASK_LIBRARY_KEY = "litopc_mask_library_v2";
const LEGACY_CUSTOM_MASK_LIBRARY_KEY = "opclab_mask_library_v2";
const SWEEP_LIBRARY_KEY = "litopc_sweep_library_v1";
const LEGACY_SWEEP_LIBRARY_KEY = "opclab_sweep_library_v1";
const SIDEBAR_EXPANDED_KEY = "litopc_sidebar_expanded_v1";
const LEGACY_SIDEBAR_EXPANDED_KEY = "opclab_sidebar_expanded_v1";
const WORKSPACE_SCALE_KEY = "litopc_workspace_scale_v1";
const LEGACY_WORKSPACE_SCALE_KEY = "opclab_workspace_scale_v1";
const WORKSPACE_MODE_KEY = "litopc_workspace_mode_v1";
const LEGACY_WORKSPACE_MODE_KEY = "opclab_workspace_mode_v1";
const FOCUS_CONTROLS_VISIBLE_KEY = "litopc_focus_controls_visible_v1";
const LEGACY_FOCUS_CONTROLS_VISIBLE_KEY = "opclab_focus_controls_visible_v1";
const FOCUS_EDIT_VISIBLE_KEY = "litopc_focus_edit_visible_v1";
const LEGACY_FOCUS_EDIT_VISIBLE_KEY = "opclab_focus_edit_visible_v1";
const FOCUS_SURFACE_VISIBLE_KEY = "litopc_focus_surface_visible_v1";
const LEGACY_FOCUS_SURFACE_VISIBLE_KEY = "opclab_focus_surface_visible_v1";
const WORKSPACE_SCALE_MIN = 0.78;
const WORKSPACE_SCALE_MAX = 1.85;

function getFirstStoredValue(...keys: string[]): string | null {
  if (typeof window === "undefined") return null;
  for (const key of keys) {
    const value = window.localStorage.getItem(key);
    if (value !== null) return value;
  }
  return null;
}

function maskShapeEquals(a: MaskShape, b: MaskShape) {
  if (a.type !== b.type) return false;
  if ((a.op ?? "add") !== (b.op ?? "add")) return false;
  if (a.type === "rect" && b.type === "rect") {
    return a.x_nm === b.x_nm && a.y_nm === b.y_nm && a.w_nm === b.w_nm && a.h_nm === b.h_nm;
  }
  if (a.type === "polygon" && b.type === "polygon") {
    if (a.points_nm.length !== b.points_nm.length) return false;
    for (let i = 0; i < a.points_nm.length; i += 1) {
      if (a.points_nm[i].x_nm !== b.points_nm[i].x_nm || a.points_nm[i].y_nm !== b.points_nm[i].y_nm) return false;
    }
    return true;
  }
  return false;
}

function maskShapeListEquals(a: Array<MaskShape>, b: Array<MaskShape>) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!maskShapeEquals(a[i], b[i])) return false;
  }
  return true;
}

type SavedSweepSnapshot = {
  id: string;
  name: string;
  createdAt: string;
  param: SweepParam;
  main: BatchSimResponse;
  compareA: BatchSimResponse | null;
  compareB: BatchSimResponse | null;
};

type WorkspaceMode = "STUDIO" | "FOCUS";

type CustomMaskPreset = {
  id: string;
  name: string;
  createdAt: string;
  mode: "TEMPLATE" | "CUSTOM";
  template_id?: SimRequest["mask"]["template_id"];
  params_nm: Record<string, number>;
  shapes: Array<MaskShape>;
  target_shapes?: Array<MaskShape>;
};

const DEFAULT_PARAMS: Record<string, number> = {
  fov_nm: 1100,
  cd_nm: 100,
  w_nm: 100,
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
  thickness_nm: 100,
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
  const [presetEditShapes, setPresetEditShapes] = useState<Array<MaskShape>>([]);
  const [presetFeatureOverrides, setPresetFeatureOverrides] = useState<Array<PresetFeatureOverride>>([]);
  const [presetTargetOverrides, setPresetTargetOverrides] = useState<Array<PresetFeatureOverride>>([]);
  const [customShapes, setCustomShapes] = useState<Array<MaskShape>>([]);
  const [targetShapes, setTargetShapes] = useState<Array<MaskShape>>([]);
  const [customTargetTemplateId, setCustomTargetTemplateId] = useState<SimRequest["mask"]["template_id"] | null>(null);
  const [selectedCustomShapeIndex, setSelectedCustomShapeIndex] = useState<number>(-1);
  const [selectedCustomShapeIndexes, setSelectedCustomShapeIndexes] = useState<number[]>([]);
  const [selectedPresetAnchorIndex, setSelectedPresetAnchorIndex] = useState<number>(0);
  const [activeEditLayer, setActiveEditLayer] = useState<EditorLayer>("MASK");
  const [editorTool, setEditorTool] = useState<EditorTool>("SELECT");
  const [hammerheadEdge, setHammerheadEdge] = useState<EdgeAnchor>("right");
  const [mousebiteEdge, setMousebiteEdge] = useState<EdgeAnchor>("right");
  const [serifCorner, setSerifCorner] = useState<"nw" | "ne" | "sw" | "se">("ne");
  const [srafOrientation, setSrafOrientation] = useState<SrafOrientation>("horizontal");

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
  const [sweepGeometryScope, setSweepGeometryScope] = useState<SweepGeometryScope>("GLOBAL");
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
  const [customMaskFileStatus, setCustomMaskFileStatus] = useState<string | null>(null);
  const [usageStatus, setUsageStatus] = useState<UsageStatus | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [entitlementWarning, setEntitlementWarning] = useState<string | null>(null);
  const [currentEntitlement, setCurrentEntitlement] = useState<CurrentEntitlementResponse | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("STUDIO");
  const [focusControlsVisible, setFocusControlsVisible] = useState(true);
  const [focusEditVisible, setFocusEditVisible] = useState(true);
  const [focusSurfaceVisible, setFocusSurfaceVisible] = useState(true);
  const [workspaceScale, setWorkspaceScale] = useState(1);
  const workspacePinchRef = useRef<{ startDistance: number; startScale: number } | null>(null);

  const grid = plan === "PRO" ? 768 : 512;
  const returnIntensity = true;
  const effectiveParams = { ...params, sraf_on: 0 };
  const basePresetGuide = useMemo(
    () => getPresetTargetGuide(templateId ?? "ISO_LINE", presetId, effectiveParams),
    [templateId, presetId, effectiveParams],
  );
  const presetMaskAnchorShapes = useMemo(
    () => !templateId
      ? []
      : buildTemplateBaseShapes(templateId, effectiveParams)
        .filter((shape): shape is Extract<MaskShape, { type: "rect" }> => shape.type === "rect"),
    [templateId, effectiveParams],
  );
  const currentPresetMaskRect = useMemo<Extract<MaskShape, { type: "rect" }> | null>(() => {
    if (!presetMaskAnchorShapes.length) return null;
    if (selectedPresetAnchorIndex < 0) return null;
    const safe = Math.max(0, Math.min(selectedPresetAnchorIndex, presetMaskAnchorShapes.length - 1));
    const base = presetMaskAnchorShapes[safe] ?? null;
    if (!base) return null;
    const override = presetFeatureOverrides.find((entry) => entry.anchorIndex === safe);
    return override?.rect ?? base;
  }, [presetMaskAnchorShapes, presetFeatureOverrides, selectedPresetAnchorIndex]);
  const resolvedPresetMaskAnchorShapes = useMemo<Array<Extract<MaskShape, { type: "rect" }>>>(
    () => applyPresetFeatureOverrides(presetMaskAnchorShapes, presetMaskAnchorShapes, presetFeatureOverrides),
    [presetMaskAnchorShapes, presetFeatureOverrides],
  );
  const resolvedTemplateMaskShapes = useMemo<Array<MaskShape>>(() => {
    if (maskMode !== "TEMPLATE" || !templateId) return [];
    const baseShapes = buildTemplateBaseShapes(templateId, effectiveParams);
    return applyPresetFeatureOverrides(baseShapes, presetMaskAnchorShapes, presetFeatureOverrides);
  }, [maskMode, templateId, effectiveParams, presetMaskAnchorShapes, presetFeatureOverrides]);
  const presetTargetAnchorShapes = useMemo(
    () => basePresetGuide.targetShapes
      .filter((shape): shape is Extract<MaskShape, { type: "rect" }> => shape.type === "rect"),
    [basePresetGuide],
  );
  const currentPresetTargetRect = useMemo<Extract<MaskShape, { type: "rect" }> | null>(() => {
    if (!presetTargetAnchorShapes.length) return null;
    if (selectedPresetAnchorIndex < 0) return null;
    const safe = Math.max(0, Math.min(selectedPresetAnchorIndex, presetTargetAnchorShapes.length - 1));
    const base = presetTargetAnchorShapes[safe] ?? null;
    if (!base) return null;
    const override = presetTargetOverrides.find((entry) => entry.anchorIndex === safe);
    return override?.rect ?? base;
  }, [presetTargetAnchorShapes, presetTargetOverrides, selectedPresetAnchorIndex]);
  const resolvedPresetTargetAnchorShapes = useMemo<Array<Extract<MaskShape, { type: "rect" }>>>(
    () => applyPresetFeatureOverrides(presetTargetAnchorShapes, presetTargetAnchorShapes, presetTargetOverrides),
    [presetTargetAnchorShapes, presetTargetOverrides],
  );
  const resolvedPresetTargetShapes = useMemo<Array<MaskShape>>(
    () => applyPresetFeatureOverrides(presetTargetAnchorShapes, presetTargetAnchorShapes, presetTargetOverrides),
    [presetTargetAnchorShapes, presetTargetOverrides],
  );
  const presetAnchorShapes = activeEditLayer === "TARGET" ? resolvedPresetTargetAnchorShapes : resolvedPresetMaskAnchorShapes;
  const currentPresetFeatureRect = activeEditLayer === "TARGET" ? currentPresetTargetRect : currentPresetMaskRect;
  const manualMaskShapes = maskMode === "TEMPLATE" ? presetEditShapes : customShapes;
  const resolvedMaskShapes = useMemo<Array<MaskShape>>(
    () => (maskMode === "TEMPLATE"
      ? [...cloneTemplateMaskShapes(resolvedTemplateMaskShapes), ...cloneTemplateMaskShapes(presetEditShapes)]
      : cloneTemplateMaskShapes(customShapes)),
    [maskMode, resolvedTemplateMaskShapes, presetEditShapes, customShapes],
  );
  const editableShapes = maskMode === "CUSTOM"
    ? (activeEditLayer === "TARGET" ? targetShapes : customShapes)
    : (activeEditLayer === "TARGET" ? [] : presetEditShapes);
  const targetGuide = useMemo<TargetGuide | null>(() => {
    if (maskMode === "CUSTOM") {
      if (customTargetTemplateId) {
        const presetGuide = getPresetTargetGuide(customTargetTemplateId, presetId, effectiveParams);
        return { ...presetGuide, targetShapes: cloneMaskShapes(targetShapes) };
      }
      return getCustomTargetGuide(targetShapes, presetId);
    }
    if (presetTargetOverrides.length === 0) return basePresetGuide;
    const customGuide = getCustomTargetGuide(resolvedPresetTargetShapes, presetId);
    if (!customGuide) return basePresetGuide;
    return {
      ...basePresetGuide,
      targetShapes: customGuide.targetShapes,
      targetContours: customGuide.targetContours,
    };
  }, [maskMode, targetShapes, presetId, effectiveParams, customTargetTemplateId, resolvedPresetTargetShapes, basePresetGuide, presetTargetOverrides.length]);
  const targetMetrics = useMemo(
    () => evaluateTargetScore({ guide: targetGuide, sim, maskShapes: resolvedMaskShapes }),
    [targetGuide, sim, resolvedMaskShapes],
  );

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
      shapes: manualMaskShapes,
      target_shapes: targetShapes,
      preset_feature_overrides: maskMode === "TEMPLATE" ? presetFeatureOverrides : undefined,
      preset_target_overrides: maskMode === "TEMPLATE" ? presetTargetOverrides : undefined,
    },
  };
  const scenarioLimit = plan === "FREE" ? FREE_SCENARIO_LIMIT : null;
  const scenarioLimitReached = scenarioLimit !== null && scenarios.length >= scenarioLimit;
  const sweepLocked = plan === "FREE";
  const isPitchSweepAllowed = maskMode === "TEMPLATE" && templateId === "DENSE_LS";
  const isSerifSweepAllowed = maskMode === "TEMPLATE" && supportsSerifSweep(templateId);
  const customShapeLimit = plan === "FREE" ? FREE_CUSTOM_RECT_LIMIT : PRO_CUSTOM_SHAPE_LIMIT;
  const activeManualShapeCount = maskMode === "TEMPLATE"
    ? presetEditShapes.length + presetFeatureOverrides.length
    : editableShapes.length;
  const customLimitReached = activeManualShapeCount >= customShapeLimit;

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
    const hasExplicitLogin = Boolean(getAccessToken() || getDevUserId() || getDevEmail());
    let nextPlan: "FREE" | "PRO" = "FREE";
    try {
      try {
        const me = await fetchCurrentEntitlement();
        setCurrentEntitlement(me);
        nextPlan = me.plan;
        setPlan((prev) => (prev === me.plan ? prev : me.plan));
      } catch (err) {
        setCurrentEntitlement(null);
        setPlan("FREE");
        if (hasExplicitLogin) {
          throw err;
        }
      }

      if (hasExplicitLogin) {
        try {
          const billing = await fetchBillingStatus();
          setBillingStatus(billing);
        } catch (err) {
          setBillingStatus(null);
          setAccountError(toUiFetchError(err, "Failed to load billing status."));
        }
      } else {
        setBillingStatus(null);
      }
    } catch (err) {
      setPlan("FREE");
      setAccountError(toUiFetchError(err, "Failed to load account state."));
    } finally {
      void refreshUsageStatus(nextPlan);
      setAccountLoading(false);
    }
  }

  useEffect(() => {
    if (plan !== "FREE") return;
    if (!FREE_PRESETS.includes(presetId)) setPresetId("DUV_193_DRY");
    if (!templateId || !FREE_TEMPLATES.includes(templateId)) setTemplateId("ISO_LINE");
    if (dose < FREE_DOSE_MIN) setDose(FREE_DOSE_MIN);
    if (dose > FREE_DOSE_MAX) setDose(FREE_DOSE_MAX);
    const trimmedPresetShapes = presetEditShapes.slice(0, FREE_CUSTOM_RECT_LIMIT);
    if (trimmedPresetShapes.length !== presetEditShapes.length) {
      setPresetEditShapes(trimmedPresetShapes);
    }
    const trimmedPresetOverrides = presetFeatureOverrides.slice(0, FREE_CUSTOM_RECT_LIMIT);
    if (trimmedPresetOverrides.length !== presetFeatureOverrides.length) {
      setPresetFeatureOverrides(trimmedPresetOverrides);
    }
    const trimmedPresetTargetOverrides = presetTargetOverrides.slice(0, FREE_CUSTOM_RECT_LIMIT);
    if (trimmedPresetTargetOverrides.length !== presetTargetOverrides.length) {
      setPresetTargetOverrides(trimmedPresetTargetOverrides);
    }
    const trimmedMaskShapes = customShapes.slice(0, FREE_CUSTOM_RECT_LIMIT);
    if (trimmedMaskShapes.length !== customShapes.length) {
      setCustomShapes(trimmedMaskShapes);
    }
    const trimmedTargetShapes = targetShapes.slice(0, FREE_CUSTOM_RECT_LIMIT);
    if (trimmedTargetShapes.length !== targetShapes.length) {
      setTargetShapes(trimmedTargetShapes);
    }
  }, [plan, presetId, templateId, dose, presetEditShapes, presetFeatureOverrides, presetTargetOverrides, customShapes, targetShapes]);

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
    if (qp.get("litopc_checkout") !== "stub" && qp.get("opclab_checkout") !== "stub") return;
    setAccountError("Checkout session created. Ask admin to complete entitlement via billing webhook mock.");
    void refreshAccountState();
  }, []);

  useEffect(() => {
    if (plan !== "PRO") return;
    if (presetEditShapes.length > PRO_CUSTOM_SHAPE_LIMIT) {
      setPresetEditShapes((prev) => prev.slice(0, PRO_CUSTOM_SHAPE_LIMIT));
    }
    if (presetFeatureOverrides.length > PRO_CUSTOM_SHAPE_LIMIT) {
      setPresetFeatureOverrides((prev) => prev.slice(0, PRO_CUSTOM_SHAPE_LIMIT));
    }
    if (presetTargetOverrides.length > PRO_CUSTOM_SHAPE_LIMIT) {
      setPresetTargetOverrides((prev) => prev.slice(0, PRO_CUSTOM_SHAPE_LIMIT));
    }
    if (customShapes.length > PRO_CUSTOM_SHAPE_LIMIT) {
      setCustomShapes((prev) => prev.slice(0, PRO_CUSTOM_SHAPE_LIMIT));
    }
    if (targetShapes.length > PRO_CUSTOM_SHAPE_LIMIT) {
      setTargetShapes((prev) => prev.slice(0, PRO_CUSTOM_SHAPE_LIMIT));
    }
  }, [plan, presetEditShapes.length, presetFeatureOverrides.length, presetTargetOverrides.length, customShapes.length, targetShapes.length]);

  useEffect(() => {
    void flushProductEvents();
    const timer = window.setInterval(() => {
      void flushProductEvents();
    }, 20000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const valid = selectedCustomShapeIndexes
      .filter((i) => i >= 0 && i < editableShapes.length)
      .sort((a, b) => a - b);
    const deduped = valid.filter((v, i) => i === 0 || valid[i - 1] !== v);
    if (deduped.length !== selectedCustomShapeIndexes.length || deduped.some((v, i) => v !== selectedCustomShapeIndexes[i])) {
      setSelectedCustomShapeIndexes(deduped);
    }
    if (selectedCustomShapeIndex >= editableShapes.length) {
      setSelectedCustomShapeIndex(editableShapes.length ? editableShapes.length - 1 : -1);
    }
  }, [editableShapes.length, selectedCustomShapeIndex, selectedCustomShapeIndexes, editableShapes]);

  useEffect(() => {
    if (!presetAnchorShapes.length) {
      setSelectedPresetAnchorIndex(0);
      return;
    }
    if (selectedPresetAnchorIndex >= presetAnchorShapes.length) {
      setSelectedPresetAnchorIndex(presetAnchorShapes.length - 1);
    }
  }, [presetAnchorShapes, selectedPresetAnchorIndex]);

  useEffect(() => {
    setScenarios(loadScenarios());
  }, []);

  useEffect(() => {
    try {
      const raw = getFirstStoredValue(SIDEBAR_EXPANDED_KEY, LEGACY_SIDEBAR_EXPANDED_KEY);
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
      const modeRaw = getFirstStoredValue(WORKSPACE_MODE_KEY, LEGACY_WORKSPACE_MODE_KEY);
      if (modeRaw === "STUDIO" || modeRaw === "FOCUS") {
        setWorkspaceMode(modeRaw);
      }
      const controlsRaw = getFirstStoredValue(FOCUS_CONTROLS_VISIBLE_KEY, LEGACY_FOCUS_CONTROLS_VISIBLE_KEY);
      if (controlsRaw === "1" || controlsRaw === "0") {
        setFocusControlsVisible(controlsRaw === "1");
      }
      const editRaw = getFirstStoredValue(FOCUS_EDIT_VISIBLE_KEY, LEGACY_FOCUS_EDIT_VISIBLE_KEY);
      if (editRaw === "1" || editRaw === "0") {
        setFocusEditVisible(editRaw === "1");
      }
      const surfaceRaw = getFirstStoredValue(FOCUS_SURFACE_VISIBLE_KEY, LEGACY_FOCUS_SURFACE_VISIBLE_KEY);
      if (surfaceRaw === "1" || surfaceRaw === "0") {
        setFocusSurfaceVisible(surfaceRaw === "1");
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
      window.localStorage.setItem(WORKSPACE_MODE_KEY, workspaceMode);
      window.localStorage.setItem(FOCUS_CONTROLS_VISIBLE_KEY, focusControlsVisible ? "1" : "0");
      window.localStorage.setItem(FOCUS_EDIT_VISIBLE_KEY, focusEditVisible ? "1" : "0");
      window.localStorage.setItem(FOCUS_SURFACE_VISIBLE_KEY, focusSurfaceVisible ? "1" : "0");
    } catch {
      // ignore local storage issues
    }
  }, [workspaceMode, focusControlsVisible, focusEditVisible, focusSurfaceVisible]);

  useEffect(() => {
    try {
      const raw = getFirstStoredValue(WORKSPACE_SCALE_KEY, LEGACY_WORKSPACE_SCALE_KEY);
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
      const raw = getFirstStoredValue(CUSTOM_MASK_LIBRARY_KEY, LEGACY_CUSTOM_MASK_LIBRARY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Array<Partial<CustomMaskPreset>>;
      if (!Array.isArray(parsed)) return;
      const normalized: Array<CustomMaskPreset> = parsed.map((p) => normalizeCustomMaskPreset(p));
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
      const raw = getFirstStoredValue(SWEEP_LIBRARY_KEY, LEGACY_SWEEP_LIBRARY_KEY);
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

  useEffect(() => {
    if (sweepParam !== "width" && sweepParam !== "height") {
      if (sweepGeometryScope !== "GLOBAL") setSweepGeometryScope("GLOBAL");
      return;
    }
    if (maskMode !== "TEMPLATE") {
      if (sweepGeometryScope !== "LOCAL") setSweepGeometryScope("LOCAL");
      return;
    }
    if (selectedPresetAnchorIndex < 0 && sweepGeometryScope === "LOCAL") {
      setSweepGeometryScope("GLOBAL");
    }
  }, [sweepParam, maskMode, selectedPresetAnchorIndex, sweepGeometryScope]);

  function getSweepBaseValue(param: SweepParam): number {
    if (param === "dose") return dose;
    if (param === "pitch") return params.pitch_nm ?? 140;
    if (param === "serif") return params.serif_nm ?? 28;
    if (param === "height") {
      if (maskMode === "TEMPLATE" && sweepGeometryScope === "LOCAL") {
        return currentPresetMaskRect?.h_nm ?? (isSteppedTemplate(templateId) ? (params.step_h_nm ?? 110) : (params.length_nm ?? 900));
      }
      if (maskMode === "CUSTOM") {
        const idx = Math.max(0, Math.min(sweepCustomTargetIndex, customShapes.length - 1));
        const s = customShapes[idx];
        return s && s.type === "rect" ? s.h_nm : (params.length_nm ?? 900);
      }
      return isSteppedTemplate(templateId) ? (params.step_h_nm ?? 110) : (params.length_nm ?? 900);
    }
    if (maskMode === "TEMPLATE" && sweepGeometryScope === "LOCAL") {
      return currentPresetMaskRect?.w_nm ?? (params.cd_nm ?? 100);
    }
    if (maskMode === "CUSTOM") {
      const idx = Math.max(0, Math.min(sweepCustomTargetIndex, customShapes.length - 1));
      const s = customShapes[idx];
      return s && s.type === "rect" ? s.w_nm : (params.cd_nm ?? 100);
    }
    if (isSquareTemplate(templateId)) return params.w_nm ?? params.cd_nm ?? 100;
    if (isSteppedTemplate(templateId)) return params.thickness_nm ?? params.cd_nm ?? 88;
    return params.cd_nm ?? 100;
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

  const replaceEditableShapes = useCallback((nextShapes: Array<MaskShape>) => {
    if (maskMode === "CUSTOM" && activeEditLayer === "TARGET") {
      setTargetShapes((prev) => (maskShapeListEquals(prev, nextShapes) ? prev : nextShapes));
      setCustomTargetTemplateId((prev) => (prev === null ? prev : null));
      return;
    }
    if (maskMode === "TEMPLATE") {
      setPresetEditShapes((prev) => (maskShapeListEquals(prev, nextShapes) ? prev : nextShapes));
      return;
    }
    setCustomShapes((prev) => (maskShapeListEquals(prev, nextShapes) ? prev : nextShapes));
  }, [maskMode, activeEditLayer]);

  function appendShapeToActiveLayer(nextShape: MaskShape) {
    const cap = plan === "FREE" ? FREE_CUSTOM_RECT_LIMIT : PRO_CUSTOM_SHAPE_LIMIT;
    if (activeManualShapeCount >= cap) {
      setCustomLimitNotice(
        plan === "FREE"
          ? `Free supports up to ${FREE_CUSTOM_RECT_LIMIT} manual shapes per layer.`
          : `Pro supports up to ${PRO_CUSTOM_SHAPE_LIMIT} manual shapes per layer.`
      );
      return;
    }
    replaceEditableShapes([...editableShapes, nextShape]);
    setSelectedPresetAnchorIndex(-1);
    setSelectedCustomShapeIndex(editableShapes.length);
    setSelectedCustomShapeIndexes([editableShapes.length]);
    setCustomLimitNotice(null);
  }

  function clearSelection() {
    setSelectedCustomShapeIndex(-1);
    setSelectedCustomShapeIndexes([]);
  }

  function applyRequestToControls(r: SimRequest) {
    const nextMode = r.mask.mode ?? "TEMPLATE";
    const nextShapes = cloneMaskShapes((r.mask.shapes ?? []) as Array<MaskShape>);
    setPlan(r.plan);
    setMaskMode(nextMode);
    setPresetId(r.preset_id);
    setTemplateId(r.mask.template_id ?? "ISO_LINE");
    setDose(r.dose);
    setParams({ ...DEFAULT_PARAMS, ...(r.mask.params_nm ?? {}) });
    if (nextMode === "TEMPLATE") {
      setPresetEditShapes(nextShapes);
    } else {
      setCustomShapes(nextShapes);
    }
    setPresetFeatureOverrides((r.mask.preset_feature_overrides ?? []).map((entry) => ({ anchorIndex: entry.anchorIndex, rect: { ...entry.rect } })));
    setPresetTargetOverrides((r.mask.preset_target_overrides ?? []).map((entry) => ({ anchorIndex: entry.anchorIndex, rect: { ...entry.rect } })));
    setTargetShapes(cloneMaskShapes((r.mask.target_shapes ?? []) as Array<MaskShape>));
    setCustomTargetTemplateId(null);
    setActiveEditLayer("MASK");
    clearSelection();
    setEditorTool("SELECT");
  }

  function handleTemplateSelection(nextTemplateId: NonNullable<SimRequest["mask"]["template_id"]>) {
    setTemplateId(nextTemplateId);
    setParams((prev) => ({ ...prev, ...templateParamDefaults(nextTemplateId) }));
    setPresetEditShapes([]);
    setPresetFeatureOverrides([]);
    setPresetTargetOverrides([]);
    setSim(null);
    setCurrentRunId("");
    clearSelection();
    setSelectedPresetAnchorIndex(0);
    setEditorTool("SELECT");
  }

  function selectCustomShape(index: number, additive: boolean = false) {
    const safe = Math.max(0, Math.min(index, editableShapes.length - 1));
    if (!Number.isFinite(safe) || editableShapes.length === 0) return;
    setSelectedPresetAnchorIndex(-1);
    if (!additive) {
      if (selectedCustomShapeIndexes.length === 1 && selectedCustomShapeIndexes[0] === safe) {
        clearSelection();
        return;
      }
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

  function addCustomRectFromDrag(rect: { x_nm: number; y_nm: number; w_nm: number; h_nm: number }) {
    const next: MaskShape = {
      type: "rect",
      op: maskMode === "CUSTOM" && activeEditLayer === "TARGET" ? "add" : (editorTool === "DRAW_SUBTRACT_RECT" ? "subtract" : "add"),
      x_nm: rect.x_nm,
      y_nm: rect.y_nm,
      w_nm: Math.max(1, rect.w_nm),
      h_nm: Math.max(1, rect.h_nm),
    };
    appendShapeToActiveLayer(next);
    setEditorTool("SELECT");
  }

  function deleteCustomShape(index: number) {
    const out = editableShapes.filter((_, i) => i !== index);
    replaceEditableShapes(out);
    setSelectedCustomShapeIndex(out.length ? Math.min(index, out.length - 1) : -1);
    setSelectedCustomShapeIndexes(out.length ? [Math.min(index, out.length - 1)] : []);
  }

  function updateCustomShape(index: number, shape: MaskShape) {
    replaceEditableShapes(editableShapes.map((s, i) => (i === index ? shape : s)));
  }

  function switchToCustomEditMode() {
    if (targetShapes.length === 0) {
      const seededTarget = targetGuide?.targetShapes ?? getPresetTargetGuide(templateId ?? "ISO_LINE", presetId, effectiveParams).targetShapes;
      setTargetShapes(cloneMaskShapes(seededTarget));
      setCustomTargetTemplateId(templateId ?? "ISO_LINE");
    }
    setMaskMode("CUSTOM");
    setActiveEditLayer("MASK");
    clearSelection();
    setEditorTool("SELECT");
  }

  function setTargetLayer(nextLayer: EditorLayer) {
    setActiveEditLayer(nextLayer);
    clearSelection();
    setEditorTool("SELECT");
  }

  function selectPresetAnchor(index: number) {
    const safe = Math.max(0, Math.min(index, presetAnchorShapes.length - 1));
    if (!presetAnchorShapes.length) return;
    if (selectedPresetAnchorIndex === safe) {
      setSelectedPresetAnchorIndex(-1);
      clearSelection();
      setEditorTool("SELECT");
      return;
    }
    setSelectedPresetAnchorIndex(safe);
    clearSelection();
    setEditorTool("SELECT");
  }

  function updatePresetFeatureRect(nextRect: Extract<MaskShape, { type: "rect" }>) {
    const anchorShapes = activeEditLayer === "TARGET" ? presetTargetAnchorShapes : presetMaskAnchorShapes;
    if (!anchorShapes.length) return;
    if (selectedPresetAnchorIndex < 0) return;
    const safe = Math.max(0, Math.min(selectedPresetAnchorIndex, anchorShapes.length - 1));
    const base = anchorShapes[safe];
    if (!base) return;
    const clamped = clampRectToFov(nextRect, params.fov_nm ?? 1100);
    const setter = activeEditLayer === "TARGET" ? setPresetTargetOverrides : setPresetFeatureOverrides;
    setter((prev) => {
      const withoutCurrent = prev.filter((entry) => entry.anchorIndex !== safe);
      if (rectsNearlyEqual(base, clamped)) return withoutCurrent;
      return [...withoutCurrent, { anchorIndex: safe, rect: clamped }];
    });
  }

  function resetPresetFeatureRect() {
    const anchorShapes = activeEditLayer === "TARGET" ? presetTargetAnchorShapes : presetMaskAnchorShapes;
    if (!anchorShapes.length) return;
    if (selectedPresetAnchorIndex < 0) return;
    const safe = Math.max(0, Math.min(selectedPresetAnchorIndex, anchorShapes.length - 1));
    const setter = activeEditLayer === "TARGET" ? setPresetTargetOverrides : setPresetFeatureOverrides;
    setter((prev) => prev.filter((entry) => entry.anchorIndex !== safe));
  }

  function clearTargetLayer() {
    setTargetShapes([]);
    setCustomTargetTemplateId(null);
    if (maskMode === "CUSTOM" && activeEditLayer === "TARGET") clearSelection();
  }

  function copyTargetToMask() {
    if (targetShapes.length === 0) {
      setCustomLimitNotice("Draw a target first, then copy it to the mask layer.");
      return;
    }
    setCustomShapes(cloneMaskShapes(targetShapes).map((shape) => (
      shape.type === "rect" ? { ...shape, op: "add" as const } : { ...shape, op: "add" as const }
    )));
    setActiveEditLayer("MASK");
    clearSelection();
    setEditorTool("SELECT");
    setCustomLimitNotice("Copied target layout into the mask layer.");
  }

  function copyMaskToTarget() {
    const additiveMaskShapes = customShapes.filter((shape) => shape.op !== "subtract");
    setTargetShapes(cloneMaskShapes(additiveMaskShapes).map((shape) => (
      shape.type === "rect" ? { ...shape, op: "add" as const } : { ...shape, op: "add" as const }
    )));
    setCustomTargetTemplateId(null);
    if (maskMode === "CUSTOM") {
      setActiveEditLayer("TARGET");
      clearSelection();
    }
  }

  function resolveToolAnchorRect(): Extract<MaskShape, { type: "rect" }> | null {
    const selectedShape = editableShapes[selectedCustomShapeIndex];
    if (selectedShape?.type === "rect") return selectedShape;
    if (maskMode !== "TEMPLATE") return null;
    return currentPresetFeatureRect;
  }

  function addHammerheadToSelected() {
    const selectedShape = resolveToolAnchorRect();
    if (!selectedShape) return;
    if (maskMode === "CUSTOM" && activeEditLayer === "TARGET") return;
    appendShapeToActiveLayer(createHammerheadShape(selectedShape, hammerheadEdge, params.cd_nm ?? 100));
  }

  function addSerifToSelected() {
    const selectedShape = resolveToolAnchorRect();
    if (!selectedShape) return;
    if (maskMode === "CUSTOM" && activeEditLayer === "TARGET") return;
    appendShapeToActiveLayer(createSerifShape(selectedShape, serifCorner, params.cd_nm ?? 100));
  }

  function addMousebiteToSelected() {
    const selectedShape = resolveToolAnchorRect();
    if (!selectedShape) return;
    if (maskMode === "CUSTOM" && activeEditLayer === "TARGET") return;
    appendShapeToActiveLayer(createMousebiteShape(selectedShape, mousebiteEdge, params.cd_nm ?? 100));
  }

  function placeSrafAtPoint(point: { x_nm: number; y_nm: number }) {
    if (maskMode === "CUSTOM" && activeEditLayer === "TARGET") return;
    appendShapeToActiveLayer(createSrafShape(point, srafOrientation, params.cd_nm ?? 100));
    setEditorTool("SELECT");
  }

  function buildCurrentCustomMaskPreset(name?: string): CustomMaskPreset | null {
    if (maskMode === "CUSTOM" && customShapes.length === 0) return null;
    const trimmed = name?.trim() ?? "";
    return normalizeCustomMaskPreset({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed || defaultMaskPresetName(maskMode, templateId ?? "ISO_LINE"),
      createdAt: new Date().toISOString(),
      mode: maskMode,
      template_id: maskMode === "TEMPLATE" ? templateId : undefined,
      params_nm: { ...params },
      shapes: cloneMaskShapes(manualMaskShapes),
      target_shapes: cloneMaskShapes(targetShapes),
    });
  }

  function applyCustomMaskPreset(preset: CustomMaskPreset) {
    const normalized = normalizeCustomMaskPreset(preset);
    const nextMode: "TEMPLATE" | "CUSTOM" = normalized.mode;
    setMaskMode(nextMode);
    setTemplateId((normalized.template_id as SimRequest["mask"]["template_id"]) ?? "ISO_LINE");
    setParams({ ...DEFAULT_PARAMS, ...(normalized.params_nm ?? {}) });
    const nextShapes = cloneMaskShapes(normalized.shapes ?? []);
    const nextTargetShapes = cloneMaskShapes(normalized.target_shapes ?? []);
    if (nextMode === "TEMPLATE") {
      setPresetEditShapes(nextShapes);
    } else {
      setCustomShapes(nextShapes);
    }
    setTargetShapes(nextTargetShapes);
    setCustomTargetTemplateId(null);
    setActiveEditLayer("MASK");
    clearSelection();
    setEditorTool("SELECT");
  }

  function saveCustomMaskPreset(name: string) {
    if (plan !== "PRO") return;
    const entry = buildCurrentCustomMaskPreset(name);
    if (!entry) return;
    setCustomMaskPresets((prev) => [entry, ...prev].slice(0, 60));
    setCustomMaskFileStatus(`Saved "${entry.name}" to local mask library.`);
  }

  function exportCustomMaskPresetFile(name: string) {
    if (plan !== "PRO") return;
    const entry = buildCurrentCustomMaskPreset(name);
    if (!entry) return;
    downloadCustomMaskFile({
      name: entry.name,
      mode: entry.mode,
      template_id: entry.template_id,
      params_nm: entry.params_nm,
      shapes: entry.shapes,
      target_shapes: entry.target_shapes,
      createdAt: entry.createdAt,
    });
    setCustomMaskFileStatus(`Downloaded "${entry.name}" as a mask data file.`);
  }

  async function importCustomMaskPresetFile(file: File) {
    if (plan !== "PRO") return;
    try {
      const imported = parseCustomMaskFile(await file.text());
      const entry = normalizeCustomMaskPreset({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: imported.name,
        createdAt: imported.createdAt ?? new Date().toISOString(),
        mode: imported.mode,
        template_id: imported.template_id,
        params_nm: imported.params_nm,
        shapes: imported.shapes,
        target_shapes: imported.target_shapes,
      });
      setCustomMaskPresets((prev) => [entry, ...prev].slice(0, 60));
      applyCustomMaskPreset(entry);
      setCustomMaskFileStatus(`Loaded "${entry.name}" from file and added it to Mask Library.`);
    } catch (err) {
      setCustomMaskFileStatus(err instanceof Error ? err.message : "Failed to read mask file.");
    }
  }

  function loadCustomMaskPreset(id: string) {
    const preset = customMaskPresets.find((p) => p.id === id);
    if (!preset) return;
    applyCustomMaskPreset(preset);
    setCustomMaskFileStatus(`Loaded "${preset.name}" from Mask Library.`);
  }

  function deleteCustomMaskPreset(id: string) {
    setCustomMaskPresets((prev) => prev.filter((p) => p.id !== id));
  }

  function resolveSimulationRequest(baseReq: SimRequest, options?: { forceTemplateCustom?: boolean }): SimRequest {
    if (baseReq.mask.mode !== "TEMPLATE") return baseReq;
    const overrides = baseReq.mask.preset_feature_overrides ?? [];
    if (!overrides.length && !options?.forceTemplateCustom) return baseReq;
    const nextTemplateId = baseReq.mask.template_id ?? "ISO_LINE";
    const nextParams = baseReq.mask.params_nm ?? {};
    const baseShapes = buildTemplateBaseShapes(nextTemplateId, nextParams);
    const anchorShapes = baseShapes.filter((shape): shape is Extract<MaskShape, { type: "rect" }> => shape.type === "rect");
    const effectiveBase = applyPresetFeatureOverrides(baseShapes, anchorShapes, overrides);
    return {
      ...baseReq,
      mask: {
        ...baseReq.mask,
        mode: "CUSTOM",
        template_id: undefined,
        shapes: [...cloneTemplateMaskShapes(effectiveBase), ...cloneTemplateMaskShapes(baseReq.mask.shapes ?? [])],
        preset_feature_overrides: undefined,
      },
    };
  }

  async function runSim() {
    trackProductEvent("run_sim_clicked", { plan, presetId, maskMode });
    setLoading(true);
    try {
      const executeReq = resolveSimulationRequest(req);
      const r = await fetch(`${API_BASE}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...clientHeaders() },
        body: JSON.stringify(executeReq),
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
    trackProductEvent("sweep_run_clicked", { plan, sweepParam, maskMode, sweepGeometryScope });
    const step = Math.max(0.0001, Math.abs(sweepStep));

    const toBackendParam = (param: SweepParam): BatchSimRequest["param"] => {
      switch (param) {
        case "width":
          if (maskMode === "TEMPLATE" && isSquareTemplate(templateId)) return "mask.params_nm.w_nm";
          if (maskMode === "TEMPLATE" && isSteppedTemplate(templateId)) return "mask.params_nm.thickness_nm" as BatchSimRequest["param"];
          return "mask.params_nm.cd_nm";
        case "height":
          return isSteppedTemplate(templateId) ? "mask.params_nm.step_h_nm" : "mask.params_nm.length_nm";
        case "pitch":
          if (!(maskMode === "TEMPLATE" && templateId === "DENSE_LS")) {
            throw new Error("Pitch sweep is only available for Dense L/S template.");
          }
          return "mask.params_nm.pitch_nm";
        case "serif":
          if (!(maskMode === "TEMPLATE" && supportsSerifSweep(templateId))) {
            throw new Error("Serif sweep is only available for Square OPC or L-Shape OPC template.");
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
      const isTemplateLocalSweep = baseReq.mask.mode === "TEMPLATE"
        && sweepGeometryScope === "LOCAL"
        && (sweepParam === "width" || sweepParam === "height")
        && selectedPresetAnchorIndex >= 0;
      const executeBaseReq = isTemplateLocalSweep
        ? resolveSimulationRequest(baseReq, { forceTemplateCustom: true })
        : resolveSimulationRequest(baseReq);
      const isCustomLocalSweep = executeBaseReq.mask.mode === "CUSTOM" && (
        sweepParam === "width" || sweepParam === "height"
      );
      if (isCustomLocalSweep || isTemplateLocalSweep) {
        const maxPoints = executeBaseReq.plan === "FREE" ? FREE_SWEEP_MAX_POINTS : PRO_SWEEP_MAX_POINTS;
        let values = makeRange();
        let clampedByPlan = false;
        if (values.length > maxPoints) {
          values = values.slice(0, maxPoints);
          clampedByPlan = true;
        }
        const points: BatchSimResponse["points"] = [];
        for (const value of values) {
          const localReq: SimRequest = JSON.parse(JSON.stringify(executeBaseReq));
          const targetIndex = isTemplateLocalSweep
            ? Math.max(0, Math.min(selectedPresetAnchorIndex, (localReq.mask.shapes?.length ?? 1) - 1))
            : Math.max(0, Math.min(sweepCustomTargetIndex, (localReq.mask.shapes?.length ?? 1) - 1));
          if (sweepParam === "width") {
            const s = localReq.mask.shapes?.[targetIndex];
            if (s && s.type === "rect") {
              const cx = s.x_nm + s.w_nm * 0.5;
              s.w_nm = Math.max(1, value);
              s.x_nm = cx - s.w_nm * 0.5;
            }
          } else if (sweepParam === "height") {
            const s = localReq.mask.shapes?.[targetIndex];
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
              ...clientHeaders({ "x-litopc-usage-kind": "sweep-point" }),
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
            : isTemplateLocalSweep
              ? `Local sweep target: M${Math.max(1, selectedPresetAnchorIndex + 1)}`
              : `Custom sweep target: R${Math.max(1, sweepCustomTargetIndex + 1)}`,
        };
      }

      const payload: BatchSimRequest = {
        base: executeBaseReq,
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
      const returnUrl = `${window.location.origin}/litopc?upgrade_source=${encodeURIComponent(source)}`;
      const session = await createCheckoutSession(returnUrl, returnUrl);
      window.location.assign(session.url);
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Failed to start checkout.");
    }
  }

  async function openBillingPortal() {
    setAccountError(null);
    try {
      const returnUrl = `${window.location.origin}/litopc`;
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

  const isFocusMode = workspaceMode === "FOCUS";
  const isStudioMode = workspaceMode === "STUDIO";
  const sidebarVisible = isFocusMode ? focusControlsVisible : sidebarExpanded;
  const surfacePanelActive = plan === "PRO" && focusSurfaceVisible;
  const sidebarToggleLabel = sidebarVisible ? "Hide" : "Show";
  const sidebarToggleTitle = isFocusMode
    ? (sidebarVisible ? "Hide controls overlay" : "Show controls overlay")
    : (sidebarVisible ? "Hide controls panel" : "Show controls panel");
  const sidebarToggleAria = isFocusMode
    ? (sidebarVisible ? "Hide controls overlay" : "Show controls overlay")
    : (sidebarVisible ? "Collapse left control panel" : "Expand left control panel");
  const editPanelVisible = focusEditVisible;
  const editToggleLabel = editPanelVisible ? "Hide" : "Show";
  const editToggleTitle = isFocusMode
    ? (editPanelVisible ? "Hide edit overlay" : "Show edit overlay")
    : (editPanelVisible ? "Collapse right edit panel" : "Expand right edit panel");
  const editToggleAria = isFocusMode
    ? (editPanelVisible ? "Hide edit overlay" : "Show edit overlay")
    : (editPanelVisible ? "Collapse right edit panel" : "Expand right edit panel");

  const toggleSidebarPanel = () => {
    if (isFocusMode) {
      setFocusControlsVisible((v) => !v);
      return;
    }
    setSidebarExpanded((v) => !v);
  };
  const toggleEditDockPanel = () => setFocusEditVisible((v) => !v);
  const toggleSurfacePanel = () => {
    if (plan !== "PRO") return;
    setFocusSurfaceVisible((v) => !v);
  };

  const canvasLeftInset = isFocusMode && sidebarVisible ? 382 : 0;
  const canvasModeHud = (
    <div className="canvas-mode-strip" role="toolbar" aria-label="Workspace and overlay panels">
      <div className="workspace-mode-switch" role="group" aria-label="Workspace mode">
        <button
          type="button"
          className={`workspace-mode-chip ${workspaceMode === "STUDIO" ? "is-active" : ""}`}
          onClick={() => setWorkspaceMode("STUDIO")}
        >
          Studio
        </button>
        <button
          type="button"
          className={`workspace-mode-chip ${workspaceMode === "FOCUS" ? "is-active" : ""}`}
          onClick={() => setWorkspaceMode("FOCUS")}
        >
          Canvas
        </button>
      </div>
      <div className="workspace-mode-switch workspace-panel-switch" role="group" aria-label="Panel visibility">
        <button
          type="button"
          className={`workspace-mode-chip ${sidebarVisible ? "is-active" : ""}`}
          onClick={toggleSidebarPanel}
          title={sidebarVisible ? "Hide control panel" : "Show control panel"}
          aria-label={sidebarVisible ? "Hide control panel" : "Show control panel"}
        >
          Control
        </button>
        <button
          type="button"
          className={`workspace-mode-chip ${focusEditVisible ? "is-active" : ""}`}
          onClick={toggleEditDockPanel}
          title={focusEditVisible ? "Hide edit panel" : "Show edit panel"}
          aria-label={focusEditVisible ? "Hide edit panel" : "Show edit panel"}
        >
          Edit
        </button>
        <button
          type="button"
          className={`workspace-mode-chip ${focusSurfaceVisible ? "is-active" : ""}`}
          onClick={toggleSurfacePanel}
          disabled={plan !== "PRO"}
          title={plan !== "PRO"
            ? "3D panel is available on Pro."
            : (focusSurfaceVisible ? "Hide 3D panel" : "Show 3D panel")}
          aria-label={focusSurfaceVisible ? "Hide 3D panel" : "Show 3D panel"}
        >
          3D
        </button>
      </div>
    </div>
  );

  return (
    <div className={`litopc-shell-wrap ${sidebarVisible ? "" : "sidebar-collapsed"} ${editPanelVisible ? "" : "edit-collapsed"} ${surfacePanelActive ? "surface-visible" : ""} ${isFocusMode ? "is-focus-mode" : ""}`}>
      <button
        type="button"
        className="shell-sidebar-toggle"
        onClick={toggleSidebarPanel}
        aria-label={sidebarToggleAria}
        title={sidebarToggleTitle}
      >
        <span className="shell-sidebar-toggle-glyph">{sidebarVisible ? "◂" : "▸"}</span>
        <span className="shell-sidebar-toggle-label" aria-hidden="true">
          {sidebarToggleLabel}
        </span>
        <span className="sr-only">{sidebarVisible ? "Hide Panel" : "Show Panel"}</span>
      </button>
      <button
        type="button"
        className="shell-edit-toggle"
        onClick={toggleEditDockPanel}
        aria-label={editToggleAria}
        title={editToggleTitle}
      >
        <span className="shell-sidebar-toggle-glyph">{editPanelVisible ? "▸" : "◂"}</span>
        <span className="shell-sidebar-toggle-label" aria-hidden="true">
          {editToggleLabel}
        </span>
        <span className="sr-only">{editPanelVisible ? "Hide Edit Panel" : "Show Edit Panel"}</span>
      </button>
      <div className={`litopc-shell ${isFocusMode || !sidebarExpanded ? "shell-sidebar-collapsed" : ""} ${isFocusMode ? "shell-focus-mode" : ""}`}>
        <div className={`litopc-sidebar ${isFocusMode ? "focus-overlay-sidebar" : ""} ${sidebarVisible ? "" : "is-hidden"}`}>
          <ControlPanel
        plan={plan}
        setPlan={setPlan}
        maskMode={maskMode}
        setMaskMode={setMaskMode}
        onEnterCustomEditMode={switchToCustomEditMode}
        activeEditLayer={activeEditLayer}
        onSetActiveEditLayer={setTargetLayer}
        editorTool={editorTool}
        onSetEditorTool={setEditorTool}
        presetId={presetId}
        setPresetId={setPresetId}
        templateId={templateId}
        setTemplateId={handleTemplateSelection}
        templateOptions={templateOptions}
        targetGuide={targetGuide}
        targetMetrics={targetMetrics}
        onCopyTargetToMask={copyTargetToMask}
        onCopyMaskToTarget={copyMaskToTarget}
        onClearTargetLayer={clearTargetLayer}
        advancedTemplatesDisabled={!ENABLE_ADVANCED_CORNER_TEMPLATES}
        dose={dose}
        setDose={setDose}
        params={params}
        setParams={setParams}
        editableShapes={editableShapes}
        maskShapes={resolvedMaskShapes}
        targetShapes={targetShapes}
        presetAnchorShapes={presetAnchorShapes}
        currentPresetFeatureRect={currentPresetFeatureRect}
        presetFeatureOverrideActive={(activeEditLayer === "TARGET" ? presetTargetOverrides : presetFeatureOverrides).some((entry) => entry.anchorIndex === selectedPresetAnchorIndex)}
        onUpdatePresetFeatureRect={updatePresetFeatureRect}
        onResetPresetFeatureRect={resetPresetFeatureRect}
        selectedPresetAnchorIndex={selectedPresetAnchorIndex}
        onSetSelectedPresetAnchorIndex={selectPresetAnchor}
        selectedCustomShapeIndex={selectedCustomShapeIndex}
        selectedCustomShapeIndexes={selectedCustomShapeIndexes}
        onSelectCustomShapeChip={selectCustomShape}
        onDeleteCustomShape={deleteCustomShape}
        onUpdateCustomShape={updateCustomShape}
        onAddHammerheadToSelected={addHammerheadToSelected}
        onAddSerifToSelected={addSerifToSelected}
        onAddMousebiteToSelected={addMousebiteToSelected}
        hammerheadEdge={hammerheadEdge}
        onSetHammerheadEdge={setHammerheadEdge}
        serifCorner={serifCorner}
        onSetSerifCorner={setSerifCorner}
        mousebiteEdge={mousebiteEdge}
        onSetMousebiteEdge={setMousebiteEdge}
        srafOrientation={srafOrientation}
        onSetSrafOrientation={setSrafOrientation}
        freeCustomRectLimit={FREE_CUSTOM_RECT_LIMIT}
        proCustomShapeLimit={PRO_CUSTOM_SHAPE_LIMIT}
        customLimitReached={customLimitReached}
        customLimitNotice={customLimitNotice}
        customMaskPresets={customMaskPresets}
        onSaveCustomMaskPreset={saveCustomMaskPreset}
        onLoadCustomMaskPreset={loadCustomMaskPreset}
        onDeleteCustomMaskPreset={deleteCustomMaskPreset}
        onExportCustomMaskFile={exportCustomMaskPresetFile}
        onImportCustomMaskFile={(file) => { void importCustomMaskPresetFile(file); }}
        customMaskFileStatus={customMaskFileStatus}
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
        sweepGeometryScope={sweepGeometryScope}
        onSetSweepGeometryScope={setSweepGeometryScope}
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
        showBrand={!isStudioMode}
          />
        </div>
        <div
          className="litopc-workspace-scroll"
          onTouchStart={onWorkspaceTouchStart}
          onTouchMove={onWorkspaceTouchMove}
          onTouchEnd={onWorkspaceTouchEnd}
          onTouchCancel={onWorkspaceTouchEnd}
        >
          <div className="litopc-workspace-inner" style={{ zoom: workspaceScale }}>
            <Viewport
              sim={sim}
              req={req}
              editDock={(
                <EditStudioDock
                  layout="side"
                  plan={plan}
                  maskMode={maskMode}
                  activeEditLayer={activeEditLayer}
                  onSetActiveEditLayer={setTargetLayer}
                  editorTool={editorTool}
                  onSetEditorTool={setEditorTool}
                  templateId={templateId}
                  params={params}
                  setParams={setParams}
                  targetGuide={targetGuide}
                  editableShapes={editableShapes}
                  maskShapes={resolvedMaskShapes}
                  targetShapes={targetShapes}
                  presetAnchorShapes={presetAnchorShapes}
                  currentPresetFeatureRect={currentPresetFeatureRect}
                  presetFeatureOverrideActive={(activeEditLayer === "TARGET" ? presetTargetOverrides : presetFeatureOverrides).some((entry) => entry.anchorIndex === selectedPresetAnchorIndex)}
                  onUpdatePresetFeatureRect={updatePresetFeatureRect}
                  onResetPresetFeatureRect={resetPresetFeatureRect}
                  selectedPresetAnchorIndex={selectedPresetAnchorIndex}
                  onSetSelectedPresetAnchorIndex={selectPresetAnchor}
                  selectedCustomShapeIndex={selectedCustomShapeIndex}
                  selectedCustomShapeIndexes={selectedCustomShapeIndexes}
                  onSelectCustomShapeChip={selectCustomShape}
                  onDeleteCustomShape={deleteCustomShape}
                  onUpdateCustomShape={updateCustomShape}
                  onAddHammerheadToSelected={addHammerheadToSelected}
                  onAddSerifToSelected={addSerifToSelected}
                  onAddMousebiteToSelected={addMousebiteToSelected}
                  hammerheadEdge={hammerheadEdge}
                  onSetHammerheadEdge={setHammerheadEdge}
                  serifCorner={serifCorner}
                  onSetSerifCorner={setSerifCorner}
                  mousebiteEdge={mousebiteEdge}
                  onSetMousebiteEdge={setMousebiteEdge}
                  srafOrientation={srafOrientation}
                  onSetSrafOrientation={setSrafOrientation}
                  freeCustomRectLimit={FREE_CUSTOM_RECT_LIMIT}
                  proCustomShapeLimit={PRO_CUSTOM_SHAPE_LIMIT}
                  customLimitReached={customLimitReached}
                  customLimitNotice={customLimitNotice}
                  onCopyTargetToMask={copyTargetToMask}
                  onCopyMaskToTarget={copyMaskToTarget}
                  onClearTargetLayer={clearTargetLayer}
                  onUpgradeIntent={(source) => { void startUpgradeCheckout(source); }}
                />
              )}
              resolvedMaskShapes={maskMode === "TEMPLATE" ? resolvedMaskShapes : undefined}
              runHistory={runHistory}
              editableShapes={editableShapes}
              onEditableShapesChange={replaceEditableShapes}
              presetAnchorShapes={presetAnchorShapes}
              selectedPresetAnchorIndex={selectedPresetAnchorIndex}
              onSelectPresetAnchor={selectPresetAnchor}
              selectedCustomShapeIndex={selectedCustomShapeIndex}
              selectedCustomShapeIndexes={selectedCustomShapeIndexes}
              onSelectCustomShape={selectCustomShape}
              activeEditLayer={activeEditLayer}
              editorTool={editorTool}
              onAddCustomRectFromDrag={addCustomRectFromDrag}
              onPlaceSrafAtPoint={placeSrafAtPoint}
              targetGuide={targetGuide}
              targetMetrics={targetMetrics}
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
              panelLayoutMode={isFocusMode ? "overlay" : "side"}
              showEditDockPanel={focusEditVisible}
              showSurfacePanel={focusSurfaceVisible}
              showMetricsFooter={!isStudioMode}
              canvasModeHud={canvasModeHud}
              canvasLeftInset={canvasLeftInset}
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
      return "Square";
    case "CONTACT_OPC_SERIF":
      return "Square OPC";
    case "STAIRCASE":
      return "Stepped Interconnect";
    case "STAIRCASE_OPC":
      return "Stepped Interconnect OPC";
    case "LINE_END_RAW":
      return "Legacy Pattern A";
    case "LINE_END_OPC_HAMMER":
      return "Legacy Pattern B";
    case "L_CORNER_RAW":
      return "L-Shape";
    case "L_CORNER_OPC_SERIF":
      return "L-Shape OPC";
    default:
      return id;
  }
}

function isSquareTemplate(id: SimRequest["mask"]["template_id"] | undefined): boolean {
  return id === "CONTACT_RAW" || id === "CONTACT_OPC_SERIF";
}

function isSteppedTemplate(id: SimRequest["mask"]["template_id"] | undefined): boolean {
  return id === "STAIRCASE" || id === "STAIRCASE_OPC";
}

function supportsSerifSweep(id: SimRequest["mask"]["template_id"] | undefined): boolean {
  return id === "CONTACT_OPC_SERIF" || id === "L_CORNER_OPC_SERIF";
}

function templateParamDefaults(id: NonNullable<SimRequest["mask"]["template_id"]>): Record<string, number> {
  switch (id) {
    case "CONTACT_RAW":
      return {
        cd_nm: 116,
        w_nm: 116,
        serif_nm: 28,
      };
    case "CONTACT_OPC_SERIF":
      return {
        cd_nm: 116,
        w_nm: 116,
        serif_nm: 28,
      };
    case "L_CORNER_RAW":
      return {
        cd_nm: 92,
        length_nm: 470,
        arm_nm: 432,
        elbow_x_offset_nm: 170,
        elbow_y_offset_nm: 132,
      };
    case "L_CORNER_OPC_SERIF":
      return {
        cd_nm: 92,
        length_nm: 470,
        arm_nm: 432,
        serif_nm: 18,
        elbow_x_offset_nm: 170,
        elbow_y_offset_nm: 132,
        opc_h_ext_nm: 26,
        opc_v_ext_nm: 30,
        opc_bias_nm: 14,
        left_hammer_w_nm: 28,
        left_hammer_h_nm: 124,
        bottom_hammer_w_nm: 146,
        bottom_hammer_h_nm: 28,
      };
    case "STAIRCASE":
      return {
        cd_nm: 88,
        thickness_nm: 88,
        step_w_nm: 180,
        step_h_nm: 110,
      };
    case "STAIRCASE_OPC":
      return {
        cd_nm: 88,
        thickness_nm: 88,
        step_w_nm: 180,
        step_h_nm: 110,
        serif_nm: 18,
        opc_bias_nm: 12,
        end_extension_nm: 24,
      };
    default:
      return {};
  }
}

function defaultMaskPresetName(
  mode: "TEMPLATE" | "CUSTOM",
  templateId: NonNullable<SimRequest["mask"]["template_id"]>,
): string {
  return mode === "CUSTOM" ? "Custom Mask" : `${templateLabel(templateId)} Mask`;
}

function normalizeCustomMaskPreset(p: Partial<CustomMaskPreset>): CustomMaskPreset {
  const shapes = cloneMaskShapes((p.shapes ?? []).filter((s): s is MaskShape => !!s));
  const target_shapes = cloneMaskShapes((p.target_shapes ?? []).filter((s): s is MaskShape => !!s).map((shape) => (
    shape.type === "rect" ? { ...shape, op: "add" as const } : { ...shape, op: "add" as const }
  )));
  const inferredMode: "TEMPLATE" | "CUSTOM" = p.mode ?? (shapes.length ? "CUSTOM" : "TEMPLATE");
  const params_nm = Object.fromEntries(
    Object.entries({ ...DEFAULT_PARAMS, ...(p.params_nm ?? {}) }).filter(([, value]) => typeof value === "number" && Number.isFinite(value))
  );
  return {
    id: p.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: p.name?.trim() || "Saved Mask",
    createdAt: p.createdAt ?? new Date().toISOString(),
    mode: inferredMode,
    template_id: p.template_id ?? "ISO_LINE",
    params_nm,
    shapes,
    target_shapes,
  };
}

function rectsNearlyEqual(
  a: Extract<MaskShape, { type: "rect" }>,
  b: Extract<MaskShape, { type: "rect" }>,
  eps: number = 0.25,
): boolean {
  return (
    Math.abs(a.x_nm - b.x_nm) <= eps &&
    Math.abs(a.y_nm - b.y_nm) <= eps &&
    Math.abs(a.w_nm - b.w_nm) <= eps &&
    Math.abs(a.h_nm - b.h_nm) <= eps
  );
}

function clampRectToFov(
  rect: Extract<MaskShape, { type: "rect" }>,
  fovNm: number,
): Extract<MaskShape, { type: "rect" }> {
  const w_nm = Math.max(1, Math.min(rect.w_nm, fovNm));
  const h_nm = Math.max(1, Math.min(rect.h_nm, fovNm));
  const x_nm = Math.max(0, Math.min(fovNm - w_nm, rect.x_nm));
  const y_nm = Math.max(0, Math.min(fovNm - h_nm, rect.y_nm));
  return { ...rect, x_nm, y_nm, w_nm, h_nm };
}
















