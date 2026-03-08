"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  BatchSimResponse,
  MaskShape,
  Plan,
  PresetID,
  RunRecord,
  SweepGeometryScope,
  SweepParam,
  TemplateID,
} from "../lib/types";
import type {
  CornerAnchor,
  EditorLayer,
  EditorTool,
  EdgeAnchor,
  SrafOrientation,
  TargetGuide,
  TargetScoreMetrics,
} from "../lib/opc-workspace";
import type { SavedScenario } from "../lib/scenarios";
import type { UsageStatus } from "../lib/usage";
import { trackProductEvent } from "../lib/telemetry";

type CustomMaskPreset = {
  id: string;
  name: string;
  createdAt: string;
  mode: "TEMPLATE" | "CUSTOM";
  template_id?: TemplateID;
  params_nm: Record<string, number>;
  shapes: Array<MaskShape>;
  target_shapes?: Array<MaskShape>;
};

export function ControlPanel(props: {
  plan: Plan;
  maskMode: "TEMPLATE" | "CUSTOM"; setMaskMode: (v: "TEMPLATE" | "CUSTOM") => void;
  onEnterCustomEditMode: () => void;
  activeEditLayer: EditorLayer;
  onSetActiveEditLayer: (v: EditorLayer) => void;
  editorTool: EditorTool;
  onSetEditorTool: (v: EditorTool) => void;
  presetId: PresetID; setPresetId: (v: PresetID) => void;
  templateId: TemplateID; setTemplateId: (v: TemplateID) => void;
  templateOptions: Array<{ id: TemplateID; label: string }>;
  targetGuide: TargetGuide | null;
  targetMetrics: TargetScoreMetrics | null;
  onCopyTargetToMask: () => void;
  onCopyMaskToTarget: () => void;
  onClearTargetLayer: () => void;
  advancedTemplatesDisabled: boolean;
  dose: number; setDose: (v: number) => void;
  params: Record<string, number>;
  setParams: (v: Record<string, number>) => void;
  editableShapes: Array<MaskShape>;
  maskShapes: Array<MaskShape>;
  targetShapes: Array<MaskShape>;
  presetAnchorShapes: Array<Extract<MaskShape, { type: "rect" }>>;
  currentPresetFeatureRect: Extract<MaskShape, { type: "rect" }> | null;
  presetFeatureOverrideActive: boolean;
  onUpdatePresetFeatureRect: (rect: Extract<MaskShape, { type: "rect" }>) => void;
  onResetPresetFeatureRect: () => void;
  selectedPresetAnchorIndex: number;
  onSetSelectedPresetAnchorIndex: (i: number) => void;
  selectedCustomShapeIndex: number;
  selectedCustomShapeIndexes: number[];
  onSelectCustomShapeChip: (i: number, additive?: boolean) => void;
  onDeleteCustomShape: (i: number) => void;
  onUpdateCustomShape: (i: number, shape: MaskShape) => void;
  onAddHammerheadToSelected: () => void;
  onAddSerifToSelected: () => void;
  onAddMousebiteToSelected: () => void;
  hammerheadEdge: EdgeAnchor;
  onSetHammerheadEdge: (v: EdgeAnchor) => void;
  serifCorner: CornerAnchor;
  onSetSerifCorner: (v: CornerAnchor) => void;
  mousebiteEdge: EdgeAnchor;
  onSetMousebiteEdge: (v: EdgeAnchor) => void;
  srafOrientation: SrafOrientation;
  onSetSrafOrientation: (v: SrafOrientation) => void;
  freeCustomRectLimit: number;
  proCustomShapeLimit: number;
  customLimitReached: boolean;
  customLimitNotice: string | null;
  customMaskPresets: Array<CustomMaskPreset>;
  onSaveCustomMaskPreset: (name: string) => void;
  onLoadCustomMaskPreset: (id: string) => void;
  onDeleteCustomMaskPreset: (id: string) => void;
  onExportCustomMaskFile: (name: string) => void;
  onImportCustomMaskFile: (file: File) => void | Promise<void>;
  customMaskFileStatus: string | null;
  loading: boolean;
  onRun: () => void;
  scenarios: SavedScenario[];
  scenarioLimit: number | null;
  scenarioLimitReached: boolean;
  onSaveScenario: (name: string) => void;
  onLoadScenario: (id: string) => void;
  onDeleteScenario: (id: string) => void;
  freeDoseMin: number;
  freeDoseMax: number;
  runHistory: RunRecord[];
  currentRunId: string;
  onLoadHistoryRun: (id: string) => void;
  onClearHistory: () => void;
  compareEnabled: boolean;
  onSetCompareEnabled: (v: boolean) => void;
  compareAId: string;
  onSetCompareAId: (id: string) => void;
  compareBId: string;
  onSetCompareBId: (id: string) => void;
  sweepParam: SweepParam;
  sweepGeometryScope: SweepGeometryScope;
  onSetSweepGeometryScope: (v: SweepGeometryScope) => void;
  onSetSweepParam: (v: SweepParam) => void;
  sweepStart: number;
  sweepCustomTargetIndex: number;
  onSetSweepCustomTargetIndex: (v: number) => void;
  onSetSweepStart: (v: number) => void;
  sweepStop: number;
  onSetSweepStop: (v: number) => void;
  sweepStep: number;
  onSetSweepStep: (v: number) => void;
  sweepLoading: boolean;
  sweepResult: BatchSimResponse | null;
  sweepCompareA: BatchSimResponse | null;
  sweepCompareB: BatchSimResponse | null;
  sweepCompareALabel?: string | null;
  sweepCompareBLabel?: string | null;
  sweepLocked: boolean;
  onRunSweep: () => void;
  sweepSavedSnapshots: Array<{ id: string; name: string; createdAt: string; count: number; param: SweepParam }>;
  onSaveSweepSnapshot: (name: string) => void;
  onLoadSweepSnapshot: (id: string) => void;
  onDeleteSweepSnapshot: (id: string) => void;
  onExportSweepCsv: () => void;
  usageStatus: UsageStatus | null;
  usageLoading: boolean;
  usageError: string | null;
  showBrand?: boolean;
  accountUserId: string | null;
  accountSource: string | null;
  accountProExpiresAt: string | null;
  billingStatus: string | null;
  billingRenewalAt: string | null;
  billingPortalAvailable: boolean;
  upgradeRequiresIdentity: boolean;
  accountError: string | null;
  onUpgradeIntent: (source: string) => void;
  onManageBillingIntent: (source: string) => void;
}) {
  const PLAN_PANEL_COLLAPSED_KEY = "litopc_plan_panel_collapsed_v1";
  const LEGACY_PLAN_PANEL_COLLAPSED_KEY = "opclab_plan_panel_collapsed_v1";
  const {
    plan,
    maskMode,
    setMaskMode,
    onEnterCustomEditMode,
    activeEditLayer,
    onSetActiveEditLayer,
    editorTool,
    onSetEditorTool,
    presetId,
    setPresetId,
    templateId,
    setTemplateId,
    templateOptions,
    targetGuide,
    onCopyTargetToMask,
    onCopyMaskToTarget,
    onClearTargetLayer,
    advancedTemplatesDisabled,
    dose,
    setDose,
    params,
    setParams,
    editableShapes,
    maskShapes,
    targetShapes,
    presetAnchorShapes,
    currentPresetFeatureRect,
    presetFeatureOverrideActive,
    onUpdatePresetFeatureRect,
    onResetPresetFeatureRect,
    selectedPresetAnchorIndex,
    onSetSelectedPresetAnchorIndex,
    selectedCustomShapeIndex,
    selectedCustomShapeIndexes,
    onSelectCustomShapeChip,
    onDeleteCustomShape,
    onUpdateCustomShape,
    onAddHammerheadToSelected,
    onAddSerifToSelected,
    onAddMousebiteToSelected,
    hammerheadEdge,
    onSetHammerheadEdge,
    serifCorner,
    onSetSerifCorner,
    mousebiteEdge,
    onSetMousebiteEdge,
    srafOrientation,
    onSetSrafOrientation,
    freeCustomRectLimit,
    proCustomShapeLimit,
    customLimitReached,
    customLimitNotice,
    customMaskPresets,
    onSaveCustomMaskPreset,
    onLoadCustomMaskPreset,
    onDeleteCustomMaskPreset,
    onExportCustomMaskFile,
    onImportCustomMaskFile,
    customMaskFileStatus,
    loading,
    onRun,
    freeDoseMin,
    freeDoseMax,
    runHistory,
    currentRunId,
    onLoadHistoryRun,
    onClearHistory,
    compareEnabled,
    onSetCompareEnabled,
    compareAId,
    onSetCompareAId,
    compareBId,
    onSetCompareBId,
    sweepParam,
    sweepGeometryScope,
    onSetSweepGeometryScope,
    onSetSweepParam,
    sweepStart,
    sweepCustomTargetIndex,
    onSetSweepCustomTargetIndex,
    onSetSweepStart,
    sweepStop,
    onSetSweepStop,
    sweepStep,
    onSetSweepStep,
    sweepLoading,
    sweepResult,
    sweepCompareA,
    sweepCompareB,
    sweepCompareALabel = null,
    sweepCompareBLabel = null,
    sweepLocked,
    onRunSweep,
    sweepSavedSnapshots,
    onSaveSweepSnapshot,
    onLoadSweepSnapshot,
    onDeleteSweepSnapshot,
    onExportSweepCsv,
    usageStatus,
    usageLoading,
    usageError,
    showBrand = true,
    accountUserId,
    accountSource,
    accountProExpiresAt,
  billingStatus,
  billingRenewalAt,
  billingPortalAvailable,
  upgradeRequiresIdentity,
  accountError,
  onUpgradeIntent,
  onManageBillingIntent,
  } = props;

  const [maskPresetName, setMaskPresetName] = useState("");
  const [analysisTab, setAnalysisTab] = useState<"COMPARE" | "SWEEP">("COMPARE");
  const [sweepLogY, setSweepLogY] = useState(false);
  const [sweepSnapshotName, setSweepSnapshotName] = useState("");
  const [planPanelCollapsed, setPlanPanelCollapsed] = useState(false);
  const [editStudioOpen, setEditStudioOpen] = useState(true);
  const [geometryInspectorOpen, setGeometryInspectorOpen] = useState(true);
  const maskFileInputRef = useRef<HTMLInputElement | null>(null);

  const doseMin = plan === "FREE" ? freeDoseMin : 0;
  const doseMax = plan === "FREE" ? freeDoseMax : 1;
  const doseStep = plan === "FREE" ? 0.05 : 0.01;
  const dosePolicyText = plan === "FREE" ? "Range 0.30-0.80, step 0.05" : "Range 0.00-1.00, step 0.01";

  const selectedManualIndex = selectedCustomShapeIndexes.length === 1
    ? selectedCustomShapeIndexes[0]
    : selectedCustomShapeIndex;
  const selectedShape = selectedManualIndex >= 0 ? editableShapes[selectedManualIndex] ?? null : null;
  const manualSelectedRect = selectedCustomShapeIndexes.length === 1 && selectedShape?.type === "rect" ? selectedShape : null;
  const editingPresetFeature = maskMode === "TEMPLATE" && !manualSelectedRect && !!currentPresetFeatureRect;
  const selectedRect = manualSelectedRect ?? (editingPresetFeature ? currentPresetFeatureRect : null);
  const fovNm = params.fov_nm ?? 1100;
  const maxRectX = selectedRect ? Math.max(0, fovNm - selectedRect.w_nm) : fovNm;
  const maxRectY = selectedRect ? Math.max(0, fovNm - selectedRect.h_nm) : fovNm;
  const currentRun = runHistory.find((r) => r.id === currentRunId) ?? null;
  const orderedHistory = useMemo(() => {
    if (!currentRunId) return runHistory;
    const idx = runHistory.findIndex((r) => r.id === currentRunId);
    if (idx <= 0) return runHistory;
    const pinned = runHistory[idx];
    return [pinned, ...runHistory.slice(0, idx), ...runHistory.slice(idx + 1)];
  }, [runHistory, currentRunId]);
  const pitchSweepAllowed = maskMode === "TEMPLATE" && templateId === "DENSE_LS";
  const serifSweepAllowed = maskMode === "TEMPLATE" && (templateId === "CONTACT_OPC_SERIF" || templateId === "L_CORNER_OPC_SERIF");
  const steppedTemplate = templateId === "STAIRCASE" || templateId === "STAIRCASE_OPC";
  const squareTemplate = templateId === "CONTACT_RAW" || templateId === "CONTACT_OPC_SERIF";
  const customShapePromptVisible = plan === "FREE" && customLimitReached;
  const sweepPromptVisible = analysisTab === "SWEEP" && sweepLocked;
  const planLabel = plan === "PRO" ? "Pro" : "Free";
  const planSourceLabel = (accountSource ?? "server_managed").replace(/_/g, " ");
  const upgradeLocked = plan === "PRO";
  const manageBillingVisible = billingPortalAvailable;
  const planIdentityLabel = accountUserId ?? "Anonymous session";
  const planStatusLabel = billingStatus ?? (plan === "PRO" ? "active" : "none");
  const renewalLabel = (billingRenewalAt ?? accountProExpiresAt ?? "").replace("T", " ").slice(0, 16);
  const internalTesterIdentity = Boolean(accountUserId?.startsWith("hdr:"));
  const legacyTesterPro = upgradeLocked && !manageBillingVisible && internalTesterIdentity && accountSource !== "stripe";
  const planActionLabel = manageBillingVisible
    ? "Manage Billing"
    : legacyTesterPro
      ? "Legacy Pro Tester"
      : upgradeLocked
        ? "Pro Active"
        : upgradeRequiresIdentity
          ? "Sign in to upgrade"
          : "Upgrade";
  const planActionTitle = manageBillingVisible
    ? "Open Stripe billing portal"
    : legacyTesterPro
      ? "This internal tester already has a legacy Pro entitlement. Use a fresh tester identity to exercise Stripe checkout."
      : upgradeRequiresIdentity
        ? "Sign in with an email identity before starting checkout."
        : upgradeLocked
          ? "Pro is active. Billing portal is not available for this entitlement."
          : "Start upgrade flow";
  const promptSeenRef = useRef<Record<string, boolean>>({});
  const targetEditing = activeEditLayer === "TARGET";
  const canUseSubtractTools = !targetEditing;
  const presetAnchorAvailable = maskMode === "TEMPLATE" && presetAnchorShapes.length > 0;
  const geometrySweepScopeVisible = maskMode === "TEMPLATE" && (sweepParam === "width" || sweepParam === "height");
  const localTemplateSweepAvailable = maskMode === "TEMPLATE" && presetAnchorAvailable && selectedPresetAnchorIndex >= 0;

  function clamp(v: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, v));
  }

  function setParam(key: string, v: number) {
    setParams({ ...params, [key]: v });
  }

  function setCd(v: number) {
    const bounded = clamp(v, 1, 900);
    if (manualSelectedRect && selectedManualIndex >= 0) {
      const nextW = bounded;
      const cx = selectedRect.x_nm + selectedRect.w_nm * 0.5;
      const nextX = clamp(cx - nextW * 0.5, 0, Math.max(0, fovNm - nextW));
      onUpdateCustomShape(selectedManualIndex, { ...selectedRect, x_nm: nextX, w_nm: nextW });
      return;
    }
    if (editingPresetFeature && selectedRect) {
      const nextW = bounded;
      const cx = selectedRect.x_nm + selectedRect.w_nm * 0.5;
      const nextX = clamp(cx - nextW * 0.5, 0, Math.max(0, fovNm - nextW));
      onUpdatePresetFeatureRect({ ...selectedRect, x_nm: nextX, w_nm: nextW });
      return;
    }
    const next: Record<string, number> = { ...params, cd_nm: bounded };
    if (steppedTemplate) next.thickness_nm = bounded;
    if (squareTemplate) next.w_nm = bounded;
    setParams(next);
  }

  function setHeight(v: number) {
    const bounded = clamp(v, 1, 900);
    if (manualSelectedRect && selectedManualIndex >= 0) {
      const nextH = bounded;
      const cy = selectedRect.y_nm + selectedRect.h_nm * 0.5;
      const nextY = clamp(cy - nextH * 0.5, 0, Math.max(0, fovNm - nextH));
      onUpdateCustomShape(selectedManualIndex, { ...selectedRect, y_nm: nextY, h_nm: nextH });
      return;
    }
    if (editingPresetFeature && selectedRect) {
      const nextH = bounded;
      const cy = selectedRect.y_nm + selectedRect.h_nm * 0.5;
      const nextY = clamp(cy - nextH * 0.5, 0, Math.max(0, fovNm - nextH));
      onUpdatePresetFeatureRect({ ...selectedRect, y_nm: nextY, h_nm: nextH });
      return;
    }
    if (steppedTemplate) {
      setParam("step_h_nm", bounded);
      return;
    }
    setParam("length_nm", bounded);
  }

  function setRectAxis(axis: "x" | "y", next: number) {
    if (!selectedRect) return;
    if (editingPresetFeature) {
      if (axis === "x") {
        const x = clamp(next, 0, maxRectX);
        onUpdatePresetFeatureRect({ ...selectedRect, x_nm: x });
        return;
      }
      const y = clamp(next, 0, maxRectY);
      onUpdatePresetFeatureRect({ ...selectedRect, y_nm: y });
      return;
    }
    if (!manualSelectedRect || selectedManualIndex < 0) return;
    if (axis === "x") {
      const x = clamp(next, 0, maxRectX);
      onUpdateCustomShape(selectedManualIndex, { ...selectedRect, x_nm: x });
      return;
    }
    const y = clamp(next, 0, maxRectY);
    onUpdateCustomShape(selectedManualIndex, { ...selectedRect, y_nm: y });
  }

  function markUpgradePromptViewed(source: string, visible: boolean) {
    if (!visible || promptSeenRef.current[source]) return;
    promptSeenRef.current[source] = true;
    trackProductEvent("upgrade_prompt_viewed", { source, plan });
  }

  function requestUpgrade(source: string) {
    trackProductEvent("upgrade_prompt_clicked", { source, fromPlan: plan });
    onUpgradeIntent(source);
  }

  function requestManageBilling(source: string) {
    onManageBillingIntent(source);
  }

  useEffect(() => {
    markUpgradePromptViewed("custom_shape_limit", customShapePromptVisible);
  }, [customShapePromptVisible, plan]);

  useEffect(() => {
    markUpgradePromptViewed("sweep_batch", sweepPromptVisible);
  }, [sweepPromptVisible, plan]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(PLAN_PANEL_COLLAPSED_KEY)
      ?? window.localStorage.getItem(LEGACY_PLAN_PANEL_COLLAPSED_KEY);
    setPlanPanelCollapsed(raw === "1");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PLAN_PANEL_COLLAPSED_KEY, planPanelCollapsed ? "1" : "0");
  }, [planPanelCollapsed]);

  return (
    <div className="litopc-panel panel-compact control-panel-shell" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      {showBrand && (
        <div className="panel-head panel-head-compact panel-brand-head">
          <div className="panel-brand">
            <div className="panel-brand-text panel-brand-retixel">
              <h2 className="panel-brand-wordmark-retixel" aria-label="litopc">
                <span className="panel-brand-wordmark-lit">lit</span>
                <span className="panel-brand-wordmark-opc">opc</span>
              </h2>
            </div>
          </div>
        </div>
      )}
      <div className="panel-body panel-body-compact">
        <div className="workspace-edit-dock-head control-panel-head">
          <div className="workspace-edit-dock-eyebrow">Control</div>
        </div>
        <div className="group-card compact">
          <div className="plan-row">
            <span className="group-title-inline">Plan</span>
            <div className="plan-row-controls">
              <div className="plan-readonly-indicator" aria-label={`Current plan ${planLabel}`}>
                <span className={`plan-status-pill ${plan === "PRO" ? "is-pro" : "is-free"}`}>{planLabel}</span>
                <span className="plan-status-note">Server managed</span>
              </div>
              <a href="/litopc/internal-login" className="plan-utility-link" title="Internal tester identity">
                Tester
              </a>
              <button
                className="mini-btn slim plan-collapse-btn"
                onClick={() => setPlanPanelCollapsed((prev) => !prev)}
                aria-expanded={!planPanelCollapsed}
                title={planPanelCollapsed ? "Show plan details" : "Hide plan details"}
              >
                {planPanelCollapsed ? "Show" : "Hide"}
              </button>
            </div>
          </div>
          {planPanelCollapsed ? (
            <div className="plan-collapsed-summary">
              <div className="plan-collapsed-primary">
                {usageLoading
                  ? "Loading usage..."
                  : usageStatus
                    ? `Runs ${usageStatus.usage.runs}/${usageStatus.limits.runs} | Sweep ${usageStatus.usage.sweep_points}/${usageStatus.limits.sweep_points} | Export ${usageStatus.usage.exports}/${usageStatus.limits.exports}`
                    : "Usage unavailable"}
              </div>
              <div className="plan-collapsed-secondary">
                {`${planLabel} - ${planSourceLabel}`}
              </div>
            </div>
          ) : (
            <div className="plan-cockpit">
              {usageLoading && <div className="small-note tiny-note">Loading usage...</div>}
              {usageStatus && (
                <div className="plan-metrics-inline">
                  <span><b>Runs</b> {usageStatus.usage.runs}/{usageStatus.limits.runs}</span>
                  <span><b>Sweep</b> {usageStatus.usage.sweep_points}/{usageStatus.limits.sweep_points}</span>
                  <span><b>Export</b> {usageStatus.usage.exports}/{usageStatus.limits.exports}</span>
                </div>
              )}

              <div className="plan-summary-card">
                <div className="plan-summary-line">
                  <span className="plan-summary-k">Identity</span>
                  <span className="plan-summary-v mono">{planIdentityLabel}</span>
                </div>
                <div className="plan-summary-chip-row">
                  <span className="plan-summary-chip">{planSourceLabel}</span>
                  <span className="plan-summary-chip">{planStatusLabel}</span>
                  {renewalLabel && <span className="plan-summary-chip">{`Renews ${renewalLabel}`}</span>}
                </div>
              </div>

              <div className="plan-actions-grid plan-actions-grid-single">
                <button
                  className="mini-btn slim plan-action-btn upgrade"
                  onClick={() => (manageBillingVisible ? requestManageBilling("account_panel") : requestUpgrade("account_panel"))}
                  disabled={upgradeLocked && !manageBillingVisible}
                  title={planActionTitle}
                >
                  {planActionLabel}
                </button>
              </div>

              {legacyTesterPro && (
                <div className="plan-governance-note plan-tester-guidance">
                  This tester already has legacy Pro access. Use a fresh tester identity from{" "}
                  <a href="/litopc/internal-login" className="plan-inline-link">
                    Tester
                  </a>{" "}
                  to run Stripe checkout.
                </div>
              )}

              {(usageError || accountError) && (
                <div className="plan-error-stack">
                  {usageError && <div className="small-note tiny-note plan-inline-error">{usageError}</div>}
                  {accountError && <div className="small-note tiny-note plan-inline-error">{accountError}</div>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="group-card compact">
          <p className="group-title">Optics Setup</p>
          <label className="label">Imaging Tool</label>
          <select value={presetId} onChange={(e) => setPresetId(e.target.value as any)} style={{ width: "100%" }}>
            <option value="DUV_193_DRY">DUV | 193 nm Dry</option>
            <option value="EUV_LNA">EUV | 13.5 nm Low-NA</option>
            {plan === "PRO" && <option value="DUV_193_IMM">DUV | 193 nm Immersion (Pro)</option>}
            {plan === "PRO" && <option value="EUV_HNA">EUV | 13.5 nm High-NA (Pro)</option>}
          </select>
        </div>

        <div className="group-card compact run-card">
          <button className="run-main-btn" onClick={onRun} disabled={loading}>
            {loading ? "Running..." : "Run Simulation"}
          </button>
        </div>

        <div className="group-card compact">
          <p className="group-title">Mask & Geometry</p>
          <label className="label">Mask Source</label>
          <div className="mask-mode-seg" style={{ marginBottom: 8 }}>
            <button onClick={() => setMaskMode("TEMPLATE")} disabled={maskMode === "TEMPLATE"}>
              <span className="mode-btn-icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2.1" />
                  <path d="M5 5h6M5 8h6M5 11h4.2" />
                </svg>
              </span>
              Preset
            </button>
            <button onClick={onEnterCustomEditMode} disabled={maskMode === "CUSTOM"}>
              <span className="mode-btn-icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.8 12.8h3.6v-3.6H2.8zM9.6 13.2l3.6-3.6M11.3 2.8h2v2h-2zM2.8 2.8h2v2h-2z" />
                  <path d="M4.8 4.8l5 5M9.8 9.8l1.5 1.5" />
                </svg>
              </span>
              Custom Edit
            </button>
          </div>

          {maskMode === "TEMPLATE" && (
            <>
              <label className="label">Pattern</label>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value as any)} style={{ width: "100%" }}>
                {templateOptions.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </>
          )}

          {plan === "PRO" && (
            <div className="mask-library mask-library-bottom">
              <div className="small-note tiny-note">Mask Library (Pro)</div>
              <div className="row">
                <input
                  type="text"
                  placeholder="mask name"
                  value={maskPresetName}
                  onChange={(e) => setMaskPresetName(e.target.value)}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button
                  className="mini-btn"
                  disabled={!maskPresetName.trim() || (maskMode === "CUSTOM" && maskShapes.length === 0)}
                  onClick={() => {
                    onSaveCustomMaskPreset(maskPresetName);
                    setMaskPresetName("");
                  }}
                >
                  Save
                </button>
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                <button
                  className="mini-btn"
                  disabled={maskMode === "CUSTOM" && maskShapes.length === 0}
                  onClick={() => onExportCustomMaskFile(maskPresetName)}
                  title="Download current mask as a litopc mask data file."
                >
                  Save File
                </button>
                <button
                  className="mini-btn"
                  onClick={() => maskFileInputRef.current?.click()}
                  title="Import a saved litopc mask data file and keep it in Mask Library."
                >
                  Load File
                </button>
                <input
                  ref={maskFileInputRef}
                  type="file"
                  accept=".opcmask,.json,.opcmask.json"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.currentTarget.value = "";
                    if (!file) return;
                    void onImportCustomMaskFile(file);
                  }}
                />
              </div>
              {customMaskFileStatus && <div className="small-note tiny-note" style={{ marginTop: 6 }}>{customMaskFileStatus}</div>}
              <div className="shape-chip-list pro">
                {customMaskPresets.length === 0 && <div className="small-note tiny-note">No saved masks.</div>}
                {customMaskPresets.map((m) => (
                  <div key={m.id} className="shape-chip">
                    <span
                      className={`mask-type-badge ${m.mode === "CUSTOM" ? "custom" : "template"}`}
                      title={m.mode === "CUSTOM" ? "Custom Mask" : "Preset Mask"}
                    >
                      {m.mode === "CUSTOM" ? "C" : "T"}
                    </span>
                    <button className="mini-btn slim" onClick={() => onLoadCustomMaskPreset(m.id)}>{m.name}</button>
                    <button className="mini-btn slim danger" onClick={() => onDeleteCustomMaskPreset(m.id)} aria-label={`Delete ${m.name}`}>x</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="group-card compact">
          <p className="group-title">Exposure</p>
          <label className="label">Dose (threshold)</label>
          <div className="row">
            <input
              type="range"
              min={doseMin}
              max={doseMax}
              step={doseStep}
              value={dose}
              onChange={(e) => setDose(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min={doseMin}
              max={doseMax}
              step={doseStep}
              value={dose}
              onChange={(e) => setDose(parseFloat(e.target.value))}
              style={{ width: 88 }}
            />
          </div>
          <div className="dose-policy-row">
            <span className="dose-policy-tag">{plan === "FREE" ? "Free policy" : "Pro policy"}</span>
            <span className="dose-policy-info" title={dosePolicyText}>i</span>
          </div>
        </div>

        <div className="group-card compact">
          <p className="group-title">Analysis</p>
          <div className="analysis-panel">
            <div className="analysis-seg compact">
              <button className={analysisTab === "COMPARE" ? "active" : ""} onClick={() => setAnalysisTab("COMPARE")}>A/B</button>
              <button className={analysisTab === "SWEEP" ? "active" : ""} onClick={() => setAnalysisTab("SWEEP")}>Sweep</button>
            </div>
            {analysisTab === "COMPARE" && (
              <div className="analysis-panel">
                <div className="analysis-head">
                  <div className="analysis-title">A/B Compare</div>
                  <div className="analysis-sub">
                    Pin two saved runs to inspect contour deltas, CD shifts, and recipe tradeoffs side by side in the viewport.
                  </div>
                </div>
                <label className="analysis-switch-row">
                  <span>Overlay compare</span>
                  <input type="checkbox" checked={compareEnabled} onChange={(e) => onSetCompareEnabled(e.target.checked)} />
                </label>
                <div className="row">
                  <span className="tiny-label">A</span>
                  <select
                    value={compareAId}
                    onChange={(e) => onSetCompareAId(e.target.value)}
                    style={{ flex: 1, minWidth: 0, width: "100%" }}
                    disabled={!runHistory.length}
                  >
                    {runHistory.length === 0 && <option value="">No run</option>}
                    {runHistory.map((h) => (
                      <option key={`a-${h.id}`} value={h.id}>{h.label}</option>
                    ))}
                  </select>
                </div>
                <div className="row">
                  <span className="tiny-label">B</span>
                  <select
                    value={compareBId}
                    onChange={(e) => onSetCompareBId(e.target.value)}
                    style={{ flex: 1, minWidth: 0, width: "100%" }}
                    disabled={!runHistory.length}
                  >
                    {runHistory.length === 0 && <option value="">No run</option>}
                    {runHistory.map((h) => (
                      <option key={`b-${h.id}`} value={h.id}>{h.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {analysisTab === "SWEEP" && (
              <div className="analysis-panel">
                <div className="analysis-head">
                  <div className="analysis-title">Sweep Studio</div>
                  <div className="analysis-sub">
                    {geometrySweepScopeVisible
                      ? sweepGeometryScope === "LOCAL"
                        ? (localTemplateSweepAvailable
                            ? "Local geometry sweep changes only the selected mask feature from Edit Studio."
                            : "Select a mask feature in Edit Studio to enable local geometry sweep.")
                        : "Global geometry sweep changes pattern-wide parameters. Dense L/S keeps repetition linked to width and pitch."
                      : "Width, height, and dose are baseline options. Pitch is available only for Dense L/S, and Serif is available only for Square OPC or L-Shape OPC."}
                  </div>
                </div>
                {sweepLocked && (
                  <div className="upgrade-inline-wrap">
                    <div className="small-note tiny-note">
                      Batch sweep is a Pro feature. Upgrade to unlock this workflow.
                    </div>
                    <button className="mini-btn slim upgrade-inline-cta" onClick={() => requestUpgrade("sweep_batch")}>
                      Upgrade
                    </button>
                  </div>
                )}
                <div className="row sweep-scale-row">
                  <div className="small-note tiny-note">Y scale</div>
                  <button
                    className={`mini-btn slim sweep-scale-toggle ${sweepLogY ? "active" : ""}`}
                    disabled={sweepLocked}
                    title={sweepLocked ? "Upgrade to Pro to use batch sweep." : undefined}
                    onClick={() => setSweepLogY((v) => !v)}
                  >
                    {sweepLogY ? "Log" : "Linear"}
                  </button>
                </div>
                {geometrySweepScopeVisible && (
                  <div className="analysis-seg compact" style={{ marginBottom: 10 }}>
                    <button
                      className={sweepGeometryScope === "LOCAL" ? "active" : ""}
                      onClick={() => onSetSweepGeometryScope("LOCAL")}
                      disabled={sweepLocked || !localTemplateSweepAvailable}
                      title={localTemplateSweepAvailable ? "Sweep the selected mask feature only." : "Select a mask feature first."}
                    >
                      Local
                    </button>
                    <button
                      className={sweepGeometryScope === "GLOBAL" ? "active" : ""}
                      onClick={() => onSetSweepGeometryScope("GLOBAL")}
                      disabled={sweepLocked}
                      title="Sweep pattern-wide geometry parameters."
                    >
                      Global
                    </button>
                  </div>
                )}
                <div className="sweep-grid">
                  <label className="label" style={{ marginBottom: 0 }}>
                    Parameter
                    <select
                      value={sweepParam}
                      onChange={(e) => onSetSweepParam(e.target.value as SweepParam)}
                      disabled={sweepLocked}
                      style={{ width: "100%", marginTop: 4 }}
                    >
                      <option value="width">Width</option>
                      <option value="height">Height</option>
                      {pitchSweepAllowed && <option value="pitch">Pitch</option>}
                      {serifSweepAllowed && <option value="serif">Serif</option>}
                      <option value="dose">Dose</option>
                    </select>
                  </label>
                  {maskMode === "CUSTOM" && sweepParam !== "dose" && (
                    <div>
                      <div className="small-note tiny-note" style={{ marginBottom: 4 }}>Target Rect</div>
                      <div className="shape-chip-list sweep-target-list">
                        {maskShapes.map((s, i) =>
                          s.type === "rect" ? (
                            <div key={`sweep-target-${i}`} className={`shape-chip ${i === sweepCustomTargetIndex ? "selected target" : ""}`}>
                              <button
                                className="mini-btn slim"
                                disabled={sweepLocked}
                                onClick={() => onSetSweepCustomTargetIndex(i)}
                              >
                                R{i + 1}
                              </button>
                            </div>
                          ) : null
                        )}
                      </div>
                    </div>
                  )}
                  <div className="row">
                    <label className="label" style={{ marginBottom: 0, flex: 1 }}>
                      Start
                      <input
                        type="number"
                        value={sweepStart}
                        step={0.01}
                        disabled={sweepLocked}
                        onChange={(e) => onSetSweepStart(Number(e.target.value))}
                        style={{ width: "100%", marginTop: 4 }}
                      />
                    </label>
                    <label className="label" style={{ marginBottom: 0, flex: 1 }}>
                      Stop
                      <input
                        type="number"
                        value={sweepStop}
                        step={0.01}
                        disabled={sweepLocked}
                        onChange={(e) => onSetSweepStop(Number(e.target.value))}
                        style={{ width: "100%", marginTop: 4 }}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label className="label" style={{ marginBottom: 0, flex: 1 }}>
                      Step
                      <input
                        type="number"
                        value={sweepStep}
                        min={0.0001}
                        step={0.01}
                        disabled={sweepLocked}
                        onChange={(e) => onSetSweepStep(Math.abs(Number(e.target.value)))}
                        style={{ width: "100%", marginTop: 4 }}
                      />
                    </label>
                    <button
                      className="mini-btn run-sweep-btn"
                      onClick={onRunSweep}
                      disabled={sweepLocked || sweepLoading}
                      title={sweepLocked ? "Upgrade to Pro to use batch sweep." : undefined}
                      style={{ marginTop: 22 }}
                    >
                      {sweepLocked ? "Pro Only" : (sweepLoading ? "Sweeping..." : "Run Sweep")}
                    </button>
                  </div>
                  <div className="row">
                    <input
                      type="text"
                      value={sweepSnapshotName}
                      onChange={(e) => setSweepSnapshotName(e.target.value)}
                      placeholder="sweep snapshot name"
                      style={{ flex: 1 }}
                      disabled={!sweepResult}
                    />
                    <button
                      className="mini-btn"
                      disabled={!sweepResult}
                      onClick={() => {
                        onSaveSweepSnapshot(sweepSnapshotName);
                        setSweepSnapshotName("");
                      }}
                    >
                      Store
                    </button>
                    <button
                      className="mini-btn slim"
                      disabled={!sweepResult}
                      onClick={onExportSweepCsv}
                    >
                      CSV
                    </button>
                  </div>
                </div>
                <div className="analysis-list sweep-list">
                  {!sweepResult && <div className="small-note tiny-note">No sweep result yet.</div>}
                  {sweepResult && (
                    <>
                      <SweepCdChart result={sweepResult} logY={sweepLogY} compareA={sweepCompareA} compareB={sweepCompareB} compareALabel={sweepCompareALabel} compareBLabel={sweepCompareBLabel} />
                      <div className="small-note tiny-note">
                        {sweepResult.count} pts
                        {sweepResult.clamped_by_plan ? " (clamped by plan)" : ""}
                      </div>
                      {sweepResult.note && <div className="small-note tiny-note">{sweepResult.note}</div>}
                      {sweepResult.points.map((p, idx) => (
                        <div key={`sweep-${idx}`} className="analysis-item sweep-item">
                          <div className="analysis-item-title">{p.value.toFixed(3)}</div>
                          <div className="small-note tiny-note">CD: {p.metrics.cd_nm == null ? "-" : `${p.metrics.cd_nm.toFixed(1)} nm`}</div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
                <div className="analysis-list">
                  {sweepSavedSnapshots.length === 0 && (
                    <div className="small-note tiny-note">No stored sweep snapshots.</div>
                  )}
                  {sweepSavedSnapshots.map((s) => (
                    <div key={s.id} className="analysis-item">
                      <div className="analysis-item-title">
                        {s.name}
                      </div>
                      <div className="small-note tiny-note">
                        {s.param} 쨌 {s.count} pts 쨌 {new Date(s.createdAt).toLocaleString()}
                      </div>
                      <div className="analysis-actions">
                        <button className="mini-btn slim" onClick={() => onLoadSweepSnapshot(s.id)}>Load</button>
                        <button className="mini-btn slim danger" onClick={() => onDeleteSweepSnapshot(s.id)} aria-label={`Delete ${s.name}`}>x</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="group-card compact history-panel-card">
          <div className="history-panel-head">
            <p className="group-title">History</p>
            <span className="history-panel-count">{runHistory.length} run{runHistory.length === 1 ? "" : "s"}</span>
          </div>
          <div className="analysis-head history-panel-copy">
            <div className="analysis-title">Recent simulation states</div>
            <div className="analysis-sub">Reopen prior runs or send them directly into A/B compare.</div>
          </div>
          <div className="history-panel-toolbar">
            <div className="small-note tiny-note">
              {currentRun ? `Current run: ${currentRun.label}` : "Runs are stored automatically after each simulation."}
            </div>
            <button className="mini-btn slim" onClick={onClearHistory} disabled={!runHistory.length}>Clear</button>
          </div>
          <div className="analysis-list history-panel-list">
            {runHistory.length === 0 && <div className="small-note tiny-note">No runs yet.</div>}
            {orderedHistory.map((h) => (
              <div
                key={h.id}
                className={`analysis-item ${h.id === currentRunId ? "analysis-item-current" : ""}`}
                aria-current={h.id === currentRunId ? "true" : undefined}
              >
                <div className="analysis-item-title history-item-head">
                  <span>{h.label}</span>
                  {h.id === currentRunId && <span className="history-current-badge">Current</span>}
                </div>
                <div className="analysis-actions">
                  <button className="mini-btn slim" onClick={() => onLoadHistoryRun(h.id)}>View</button>
                  <button className="mini-btn slim" onClick={() => onSetCompareAId(h.id)}>A</button>
                  <button className="mini-btn slim" onClick={() => onSetCompareBId(h.id)}>B</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="group-card compact resource-panel-card" style={{ marginBottom: 0 }}>
          <div className="resource-panel-head">
            <p className="group-title">Resources</p>
            <span className="resource-panel-chip">Guide & profile</span>
          </div>
          <div className="resource-link-grid">
            <a href="/litopc/model-summary" className="resource-link-card">
              <span className="resource-link-icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2.2" y="2.3" width="11.6" height="11.2" rx="2.1" />
                  <path d="M5.1 5.2h5.8M5.1 8h5.8M5.1 10.8h3.9" />
                </svg>
              </span>
              <span className="resource-link-copy">
                <strong>Imaging & Limits Guide</strong>
                <small>Optics presets, model boundaries, and interpretation notes.</small>
              </span>
            </a>
            <a href="/litopc/revenue-dashboard" className="resource-link-card resource-link-card-accent">
              <span className="resource-link-icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.4 13.2h11.2" />
                  <path d="M4.3 10.2V7.8" />
                  <path d="M8 10.2V4.8" />
                  <path d="M11.7 10.2V6.1" />
                </svg>
              </span>
              <span className="resource-link-copy">
                <strong>Revenue Dashboard</strong>
                <small>Commercial signals, conversion checkpoints, and pricing telemetry.</small>
              </span>
            </a>
          </div>
          <div className="resource-docs-block">
            <div className="resource-docs-head">
              <span className="resource-docs-title">Model details</span>
              <a href="/litopc/model-summary" className="resource-docs-anchor">Open</a>
            </div>
            <div className="resource-docs-links">
              <a href="/litopc/benchmark-gallery">Benchmark Gallery</a>
              <a href="/litopc/model-change-log">Model Change Log</a>
              <a href="/litopc/trust-dashboard">Trust Dashboard</a>
              <a href="/litopc/advanced-analytics">Advanced Analytics</a>
            </div>
          </div>
          <div className="creator-profile-card">
            <div className="creator-profile-head">
              <div>
                <div className="creator-profile-eyebrow">Creator</div>
                <div className="creator-profile-name">Min-Cheol Lee</div>
              </div>
              <div className="creator-profile-role">Software 쨌 Physics 쨌 OPC</div>
            </div>
            <div className="creator-profile-links">
              <a href="mailto:mincheol.chris.lee@gmail.com">Email</a>
              <a href="https://www.linkedin.com/in/min-cheol-lee/" target="_blank" rel="noreferrer">LinkedIn</a>
              <a href="https://mincheollee.com" target="_blank" rel="noreferrer">Website</a>
            </div>
          </div>
          <p className="small-note tiny-note resource-footnote">
            Educational approximation. Not calibrated for sign-off.
          </p>
        </div>
      </div>
    </div>
  );
}

function SweepCdChart(props: {
  result: BatchSimResponse;
  logY: boolean;
  compareA?: BatchSimResponse | null;
  compareB?: BatchSimResponse | null;
  compareALabel?: string | null;
  compareBLabel?: string | null;
}) {
  const { result, logY, compareA = null, compareB = null, compareALabel = null, compareBLabel = null } = props;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const toPts = (res: BatchSimResponse | null) => {
    if (!res) return [] as Array<{ x: number; y: number; yt: number }>;
    return res.points
      .filter((p) => p.metrics.cd_nm != null && Number.isFinite(p.value))
      .map((p) => ({ x: p.value, y: p.metrics.cd_nm as number }))
      .filter((p) => (logY ? p.y > 0 : true))
      .map((p) => ({ ...p, yt: logY ? Math.log10(Math.max(1e-9, p.y)) : p.y }));
  };

  const mainPts = toPts(result);
  const aPts = toPts(compareA);
  const bPts = toPts(compareB);

  if (mainPts.length < 2) {
    return <div className="small-note tiny-note">Not enough valid CD points for plotting.</div>;
  }

  const series = [
    { key: "main", label: "Main", color: "#0a84ff", dash: "", pts: mainPts },
    ...(aPts.length >= 2 ? [{ key: "a", label: compareALabel ? `A (${compareALabel})` : "A", color: "#2f7dff", dash: "5 3", pts: aPts }] : []),
    ...(bPts.length >= 2 ? [{ key: "b", label: compareBLabel ? `B (${compareBLabel})` : "B", color: "#bf5af2", dash: "5 3", pts: bPts }] : []),
  ];

  let minX = Math.min(...series.flatMap((s) => s.pts.map((p) => p.x)));
  let maxX = Math.max(...series.flatMap((s) => s.pts.map((p) => p.x)));
  let minYT = Math.min(...series.flatMap((s) => s.pts.map((p) => p.yt)));
  let maxYT = Math.max(...series.flatMap((s) => s.pts.map((p) => p.yt)));

  if (minX === maxX) {
    minX -= 0.5;
    maxX += 0.5;
  }
  if (minYT === maxYT) {
    minYT -= 0.5;
    maxYT += 0.5;
  }

  const padX = (maxX - minX) * 0.05;
  const padY = (maxYT - minYT) * 0.08;
  minX -= padX;
  maxX += padX;
  minYT -= padY;
  maxYT += padY;

  const w = 320;
  const h = 156;
  const left = 34;
  const right = 10;
  const top = 12;
  const bottom = 26;
  const plotW = w - left - right;
  const plotH = h - top - bottom;

  const sx = (x: number) => left + ((x - minX) / (maxX - minX)) * plotW;
  const sy = (yt: number) => top + (1 - (yt - minYT) / (maxYT - minYT)) * plotH;

  const mainIndex = hoverIndex == null ? -1 : Math.max(0, Math.min(hoverIndex, mainPts.length - 1));
  const activeMain = mainIndex >= 0 ? mainPts[mainIndex] : null;

  const nearestByX = (pts: Array<{ x: number; y: number; yt: number }>, x: number) => {
    if (!pts.length) return null;
    let best = pts[0];
    let bestD = Math.abs(best.x - x);
    for (let i = 1; i < pts.length; i++) {
      const d = Math.abs(pts[i].x - x);
      if (d < bestD) {
        best = pts[i];
        bestD = d;
      }
    }
    return best;
  };

  const aActive = activeMain ? nearestByX(aPts, activeMain.x) : null;
  const bActive = activeMain ? nearestByX(bPts, activeMain.x) : null;

  const allY = series.flatMap((s) => s.pts.map((p) => p.y));
  const minYRaw = Math.min(...allY);
  const maxYRaw = Math.max(...allY);

  return (
    <div className="sweep-chart-wrap">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="sweep-chart"
        role="img"
        aria-label="Sweep CD plot"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <rect x={left} y={top} width={plotW} height={plotH} rx={8} className="sweep-chart-bg" />
        <line x1={left} y1={top + plotH} x2={left + plotW} y2={top + plotH} className="sweep-axis" />
        <line x1={left} y1={top} x2={left} y2={top + plotH} className="sweep-axis" />

        {series.map((s) => {
          const d = s.pts.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x).toFixed(2)} ${sy(p.yt).toFixed(2)}`).join(" ");
          return <path key={`line-${s.key}`} d={d} className="sweep-line" style={{ stroke: s.color, strokeDasharray: s.dash || undefined }} />;
        })}

        {mainPts.map((p, i) => {
          const cx = sx(p.x);
          const cy = sy(p.yt);
          const isActive = i === mainIndex;
          return (
            <circle
              key={`pt-${i}`}
              cx={cx}
              cy={cy}
              r={isActive ? 3.8 : 2.7}
              className={`sweep-point ${isActive ? "active" : ""}`}
              onMouseEnter={() => setHoverIndex(i)}
            />
          );
        })}

        {activeMain && (
          <>
            <line
              x1={sx(activeMain.x)}
              y1={top}
              x2={sx(activeMain.x)}
              y2={top + plotH}
              className="sweep-hover-line"
            />
            <g
              className="sweep-tooltip"
              transform={`translate(${Math.min(w - 168, Math.max(left + 4, sx(activeMain.x) + 8))} ${Math.max(top + 4, sy(activeMain.yt) - 58)})`}
            >
              <rect x="0" y="0" width="162" height="54" rx="8" />
              <text x="8" y="12">{`${result.param}: ${activeMain.x.toFixed(3)}`}</text>
              <text x="8" y="24">{`Main: ${activeMain.y.toFixed(2)} nm`}</text>
              {aActive && <text x="8" y="36">{`A: ${aActive.y.toFixed(2)} nm`}</text>}
              {bActive && <text x="8" y="48">{`B: ${bActive.y.toFixed(2)} nm`}</text>}
            </g>
          </>
        )}

        <text x={left} y={h - 7} className="sweep-tick">{minX.toFixed(2)}</text>
        <text x={left + plotW} y={h - 7} textAnchor="end" className="sweep-tick">{maxX.toFixed(2)}</text>
        <text x={left - 7} y={top + 3} textAnchor="end" className="sweep-tick">{maxYRaw.toFixed(1)}</text>
        <text x={left - 7} y={top + plotH} dy={3} textAnchor="end" className="sweep-tick">{minYRaw.toFixed(1)}</text>
        <text x={w / 2} y={h - 7} textAnchor="middle" className="sweep-label">
          {result.param}
        </text>
        <text x={10} y={h / 2} textAnchor="middle" className="sweep-label" transform={`rotate(-90 10 ${h / 2})`}>
          {logY ? "CD (nm, log)" : "CD (nm)"}
        </text>
      </svg>

      <div className="sweep-series-legend">
        {series.map((s) => (
          <span key={`legend-${s.key}`} className="sweep-series-item" title={s.label}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}












