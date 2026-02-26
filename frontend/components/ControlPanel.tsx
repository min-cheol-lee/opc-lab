"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  BatchSimResponse,
  MaskShape,
  Plan,
  PresetID,
  RunRecord,
  SweepParam,
  TemplateID,
} from "../lib/types";
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
};

export function ControlPanel(props: {
  plan: Plan; setPlan: (v: Plan) => void;
  maskMode: "TEMPLATE" | "CUSTOM"; setMaskMode: (v: "TEMPLATE" | "CUSTOM") => void;
  presetId: PresetID; setPresetId: (v: PresetID) => void;
  templateId: TemplateID; setTemplateId: (v: TemplateID) => void;
  templateOptions: Array<{ id: TemplateID; label: string }>;
  advancedTemplatesDisabled: boolean;
  dose: number; setDose: (v: number) => void;
  params: Record<string, number>;
  setParams: (v: Record<string, number>) => void;
  customShapes: Array<MaskShape>;
  selectedCustomShapeIndex: number;
  setSelectedCustomShapeIndex: (i: number) => void;
  selectedCustomShapeIndexes: number[];
  onSelectCustomShapeChip: (i: number, additive?: boolean) => void;
  drawRectMode: boolean;
  setDrawRectMode: (v: boolean) => void;
  onAddCustomRect: () => void;
  onDeleteCustomShape: (i: number) => void;
  onUpdateCustomShape: (i: number, shape: MaskShape) => void;
  freeCustomRectLimit: number;
  proCustomShapeLimit: number;
  customLimitReached: boolean;
  customLimitNotice: string | null;
  customMaskPresets: Array<CustomMaskPreset>;
  onSaveCustomMaskPreset: (name: string) => void;
  onLoadCustomMaskPreset: (id: string) => void;
  onDeleteCustomMaskPreset: (id: string) => void;
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
  accountUserId: string | null;
  accountSource: string | null;
  accountProExpiresAt: string | null;
  billingStatus: string | null;
  billingRenewalAt: string | null;
  accountLoading: boolean;
  accountError: string | null;
  onRefreshAccount: () => void;
  onOpenBillingPortal: () => void;
  onUpgradeIntent: (source: string) => void;
}) {
  const {
    plan,
    setPlan,
    maskMode,
    setMaskMode,
    presetId,
    setPresetId,
    templateId,
    setTemplateId,
    templateOptions,
    advancedTemplatesDisabled,
    dose,
    setDose,
    params,
    setParams,
    customShapes,
    selectedCustomShapeIndex,
    setSelectedCustomShapeIndex,
    selectedCustomShapeIndexes,
    onSelectCustomShapeChip,
    drawRectMode,
    setDrawRectMode,
    onAddCustomRect,
    onDeleteCustomShape,
    onUpdateCustomShape,
    freeCustomRectLimit,
    proCustomShapeLimit,
    customLimitReached,
    customLimitNotice,
    customMaskPresets,
    onSaveCustomMaskPreset,
    onLoadCustomMaskPreset,
    onDeleteCustomMaskPreset,
    loading,
    onRun,
    scenarios,
    scenarioLimit,
    scenarioLimitReached,
    onSaveScenario,
    onLoadScenario,
    onDeleteScenario,
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
    accountUserId,
    accountSource,
    accountProExpiresAt,
    billingStatus,
    billingRenewalAt,
    accountLoading,
    accountError,
    onRefreshAccount,
    onOpenBillingPortal,
    onUpgradeIntent,
  } = props;

  const [scenarioName, setScenarioName] = useState("");
  const [maskPresetName, setMaskPresetName] = useState("");
  const [analysisTab, setAnalysisTab] = useState<"COMPARE" | "SWEEP">("COMPARE");
  const [libraryTab, setLibraryTab] = useState<"SCENARIOS" | "HISTORY">("SCENARIOS");
  const [sweepLogY, setSweepLogY] = useState(false);
  const [sweepSnapshotName, setSweepSnapshotName] = useState("");
  const [planPanelCollapsed, setPlanPanelCollapsed] = useState(false);

  const doseMin = plan === "FREE" ? freeDoseMin : 0;
  const doseMax = plan === "FREE" ? freeDoseMax : 1;
  const doseStep = plan === "FREE" ? 0.05 : 0.01;
  const dosePolicyText = plan === "FREE" ? "Range 0.30-0.80, step 0.05" : "Range 0.00-1.00, step 0.01";

  const selectedShape = customShapes[selectedCustomShapeIndex] ?? null;
  const selectedRect = selectedShape?.type === "rect" ? selectedShape : null;
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
  const quickAddLocked = plan === "FREE";
  const quickAddTitle = quickAddLocked
    ? "Quick Add is available on Pro."
    : (customLimitReached ? "Shape limit reached." : "Add a rectangle quickly.");
  const pitchSweepAllowed = maskMode === "TEMPLATE" && templateId === "DENSE_LS";
  const serifSweepAllowed = maskMode === "TEMPLATE" && templateId === "CONTACT_OPC_SERIF";
  const quickAddPromptVisible = maskMode === "CUSTOM" && quickAddLocked;
  const sweepPromptVisible = analysisTab === "SWEEP" && sweepLocked;
  const scenarioPromptVisible = libraryTab === "SCENARIOS" && scenarioLimitReached;
  const promptSeenRef = useRef<Record<string, boolean>>({});

  function clamp(v: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, v));
  }

  function setParam(key: string, v: number) {
    setParams({ ...params, [key]: v });
  }

  function setCd(v: number) {
    const bounded = clamp(v, 1, 900);
    if (maskMode === "CUSTOM" && selectedRect && selectedCustomShapeIndex >= 0) {
      const nextW = bounded;
      const cx = selectedRect.x_nm + selectedRect.w_nm * 0.5;
      const nextX = clamp(cx - nextW * 0.5, 0, Math.max(0, fovNm - nextW));
      onUpdateCustomShape(selectedCustomShapeIndex, { ...selectedRect, x_nm: nextX, w_nm: nextW });
      setParams({ ...params, cd_nm: bounded });
      return;
    }
    const next: Record<string, number> = { ...params, cd_nm: bounded };
    if (templateId === "STAIRCASE") next.thickness_nm = bounded;
    if (templateId === "CONTACT_RAW" || templateId === "CONTACT_OPC_SERIF") next.w_nm = bounded;
    setParams(next);
  }

  function setHeight(v: number) {
    const bounded = clamp(v, 1, 900);
    if (maskMode === "CUSTOM" && selectedRect && selectedCustomShapeIndex >= 0) {
      const nextH = bounded;
      const cy = selectedRect.y_nm + selectedRect.h_nm * 0.5;
      const nextY = clamp(cy - nextH * 0.5, 0, Math.max(0, fovNm - nextH));
      onUpdateCustomShape(selectedCustomShapeIndex, { ...selectedRect, y_nm: nextY, h_nm: nextH });
      setParams({ ...params, length_nm: bounded });
      return;
    }
    if (templateId === "STAIRCASE") {
      setParam("step_h_nm", bounded);
      return;
    }
    setParam("length_nm", bounded);
  }

  function setRectAxis(axis: "x" | "y", next: number) {
    if (!selectedRect || selectedCustomShapeIndex < 0) return;
    if (axis === "x") {
      const x = clamp(next, 0, maxRectX);
      onUpdateCustomShape(selectedCustomShapeIndex, { ...selectedRect, x_nm: x });
      return;
    }
    const y = clamp(next, 0, maxRectY);
    onUpdateCustomShape(selectedCustomShapeIndex, { ...selectedRect, y_nm: y });
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

  useEffect(() => {
    markUpgradePromptViewed("custom_quick_add", quickAddPromptVisible);
  }, [quickAddPromptVisible, plan]);

  useEffect(() => {
    markUpgradePromptViewed("sweep_batch", sweepPromptVisible);
  }, [sweepPromptVisible, plan]);

  useEffect(() => {
    markUpgradePromptViewed("scenario_slots", scenarioPromptVisible);
  }, [scenarioPromptVisible, plan]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("opclab_plan_panel_collapsed_v1");
    setPlanPanelCollapsed(raw === "1");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("opclab_plan_panel_collapsed_v1", planPanelCollapsed ? "1" : "0");
  }, [planPanelCollapsed]);

  return (
    <div className="opclab-panel panel-compact" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="panel-head panel-head-compact panel-brand-head">
        <div className="panel-brand">
          <div className="panel-brand-text">
            <h2 className="panel-brand-wordmark">
              <span className="wordmark-opc">OPC</span>
              <span className="wordmark-lab">LAB</span>
            </h2>
            <div className="panel-brand-divider" aria-hidden="true" />
            <div className="panel-brand-sub">Simulator</div>
          </div>
        </div>
      </div>
      <div className="panel-body panel-body-compact">
        <div className="group-card compact">
          <div className="plan-row">
            <span className="group-title-inline">Plan</span>
            <div className="plan-row-controls">
              <div className="mini-seg">
                <button onClick={() => setPlan("FREE")} disabled={plan === "FREE"}>Free</button>
                <button onClick={() => setPlan("PRO")} disabled={plan === "PRO"}>Pro</button>
              </div>
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
                {accountUserId ? `User ${accountUserId}` : "User not set"}
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

            <div className="plan-meta-card">
              <div className="plan-meta-row">
                <span className="plan-meta-k">User</span>
                <span className="plan-meta-v mono">{accountUserId ?? "-"}</span>
              </div>
              <div className="plan-meta-row">
                <span className="plan-meta-k">Plan Source</span>
                <span className="plan-meta-v">{accountSource ?? "-"}</span>
              </div>
              <div className="plan-meta-row">
                <span className="plan-meta-k">Billing</span>
                <span className="plan-meta-v">{billingStatus ?? "none"}</span>
              </div>
              {(accountProExpiresAt || billingRenewalAt) && (
                <div className="plan-meta-row">
                  <span className="plan-meta-k">Renewal</span>
                  <span className="plan-meta-v">{(billingRenewalAt ?? accountProExpiresAt ?? "").replace("T", " ").slice(0, 16)}</span>
                </div>
              )}
            </div>

            <div className="plan-actions-grid">
              <button className="mini-btn slim plan-action-btn" onClick={onRefreshAccount} disabled={accountLoading}>
                {accountLoading ? "Refreshing" : "Refresh"}
              </button>
              <button className="mini-btn slim plan-action-btn upgrade" onClick={() => requestUpgrade("account_panel")}>
                Upgrade
              </button>
              <button className="mini-btn slim plan-action-btn" onClick={onOpenBillingPortal}>
                Billing
              </button>
              <a href="/opclab/internal-login" className="mini-btn slim plan-action-btn plan-action-link">
                Internal Login
              </a>
            </div>

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
            <option value="DUV_193_DRY">DUV 193 Dry</option>
            <option value="EUV_LNA">EUV Low-NA 0.33</option>
            {plan === "PRO" && <option value="DUV_193_IMM">DUV 193 Immersion (Pro)</option>}
            {plan === "PRO" && <option value="EUV_HNA">EUV High-NA 0.55 (Pro)</option>}
          </select>
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
            <button onClick={() => setMaskMode("CUSTOM")} disabled={maskMode === "CUSTOM"}>
              <span className="mode-btn-icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.8 12.8h3.6v-3.6H2.8zM9.6 13.2l3.6-3.6M11.3 2.8h2v2h-2zM2.8 2.8h2v2h-2z" />
                  <path d="M4.8 4.8l5 5M9.8 9.8l1.5 1.5" />
                </svg>
              </span>
              Custom Mask
            </button>
          </div>

          {maskMode === "TEMPLATE" ? (
            <>
              <label className="label">Pattern</label>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value as any)} style={{ width: "100%" }}>
                {templateOptions.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </>
          ) : (
            <>
              <div className="draw-action-row" style={{ marginBottom: 6 }}>
                <button className={`mini-btn draw-action ${drawRectMode ? "active-draw-btn" : ""}`} onClick={() => setDrawRectMode(!drawRectMode)}>
                  <span className="mode-btn-icon" aria-hidden="true">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 3h10v10H3zM3 7h10M7 3v10" />
                    </svg>
                  </span>
                  {drawRectMode ? "Drawing..." : "Draw Rectangular"}
                </button>
                <button
                  className="mini-btn draw-action"
                  onClick={onAddCustomRect}
                  disabled={!quickAddLocked && customShapes.length >= proCustomShapeLimit}
                  title={quickAddTitle}
                >
                  <span className="mode-btn-icon" aria-hidden="true">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3.2v9.6M3.2 8h9.6" />
                    </svg>
                  </span>
                  {quickAddLocked ? "Quick Add (Pro)" : "Quick Add"}
                </button>
              </div>
              <div className="dose-policy-row">
                <span className="dose-policy-tag">Shape limit</span>
                <span
                  className="dose-policy-info"
                  title={
                    plan === "FREE"
                      ? `Free: up to ${freeCustomRectLimit} rectangulars. Quick Add is Pro-only.`
                      : `Pro: up to ${proCustomShapeLimit} rectangulars`
                  }
                >
                  i
                </span>
              </div>
              {(customLimitReached || customLimitNotice || quickAddLocked) && (
                <div className="upgrade-inline-wrap">
                  <div className="small-note tiny-note">
                    {customLimitNotice
                      ? customLimitNotice
                      : (quickAddLocked
                          ? `Free limit: ${freeCustomRectLimit} rectangles. Draw on canvas is enabled; Quick Add is Pro-only.`
                          : `Shape limit reached (${proCustomShapeLimit}).`)}
                  </div>
                  {quickAddLocked && (
                    <button className="mini-btn slim upgrade-inline-cta" onClick={() => requestUpgrade("custom_quick_add")}>
                      Upgrade
                    </button>
                  )}
                </div>
              )}
              <div className="shape-chip-list">
                {customShapes.length === 0 && <div className="small-note tiny-note">Draw in 2D panel.</div>}
                {customShapes.map((_, i) => (
                  <div key={i} className={`shape-chip ${selectedCustomShapeIndexes.includes(i) ? "selected" : ""}`}>
                    <button
                      className="mini-btn slim"
                      onClick={(e) => onSelectCustomShapeChip(i, e.shiftKey || e.ctrlKey || e.metaKey)}
                    >
                      R{i + 1}
                    </button>
                    <button className="mini-btn slim danger" onClick={() => onDeleteCustomShape(i)}>Del</button>
                  </div>
                ))}
              </div>
              <div className="small-note tiny-note editor-help-note">
                Move guide: select one R chip (single) or use Shift/Ctrl/Cmd+click for multi-select, then drag in 2D or use Arrow keys (Shift+Arrow = x10).
              </div>

              {selectedRect && (
                <>
                  <label className="label" style={{ marginTop: 7 }}>X Position (nm)</label>
                  <div className="row">
                    <input
                      type="range"
                      min={0}
                      max={Math.max(1, maxRectX)}
                      step={1}
                      value={clamp(selectedRect.x_nm, 0, Math.max(1, maxRectX))}
                      onChange={(e) => setRectAxis("x", Number(e.target.value))}
                      style={{ flex: 1 }}
                    />
                    <input
                      type="number"
                      min={0}
                      max={Math.max(1, maxRectX)}
                      step={1}
                      value={Math.round(selectedRect.x_nm)}
                      onChange={(e) => setRectAxis("x", Number(e.target.value))}
                      style={{ width: 88 }}
                    />
                  </div>
                  <label className="label" style={{ marginTop: 7 }}>Y Position (nm)</label>
                  <div className="row">
                    <input
                      type="range"
                      min={0}
                      max={Math.max(1, maxRectY)}
                      step={1}
                      value={clamp(selectedRect.y_nm, 0, Math.max(1, maxRectY))}
                      onChange={(e) => setRectAxis("y", Number(e.target.value))}
                      style={{ flex: 1 }}
                    />
                    <input
                      type="number"
                      min={0}
                      max={Math.max(1, maxRectY)}
                      step={1}
                      value={Math.round(selectedRect.y_nm)}
                      onChange={(e) => setRectAxis("y", Number(e.target.value))}
                      style={{ width: 88 }}
                    />
                  </div>
                </>
              )}

              <div className="small-note tiny-note" style={{ marginTop: 4 }}>
                Tip: clicking a ruler handle gives arrow control to ruler; reselect any R chip to move rectangles.
              </div>
            </>
          )}

          <label className="label" style={{ marginTop: 8 }}>Width (nm)</label>
          <div className="row">
            <input
              type="range"
              min={1}
              max={900}
              step={1}
              value={maskMode === "CUSTOM" && selectedRect ? selectedRect.w_nm : (params.cd_nm ?? 100)}
              onChange={(e) => setCd(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min={1}
              max={900}
              step={1}
              value={Math.round(maskMode === "CUSTOM" && selectedRect ? selectedRect.w_nm : (params.cd_nm ?? 100))}
              onChange={(e) => setCd(parseFloat(e.target.value))}
              style={{ width: 88 }}
            />
          </div>

          {(maskMode === "CUSTOM" || templateId === "ISO_LINE" || templateId === "DENSE_LS" || templateId === "STAIRCASE") && (
            <>
              <label className="label" style={{ marginTop: 8 }}>
                {templateId === "STAIRCASE" ? "Step Height (nm)" : "Height (nm)"}
              </label>
              <div className="row">
                <input
                  type="range"
                  min={10}
                  max={900}
                  step={1}
                  value={
                    maskMode === "CUSTOM" && selectedRect
                      ? selectedRect.h_nm
                      : (templateId === "STAIRCASE" ? (params.step_h_nm ?? 40) : (params.length_nm ?? 900))
                  }
                  onChange={(e) => setHeight(parseFloat(e.target.value))}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  min={10}
                  max={900}
                  step={1}
                  value={Math.round(
                    maskMode === "CUSTOM" && selectedRect
                      ? selectedRect.h_nm
                      : (templateId === "STAIRCASE" ? (params.step_h_nm ?? 40) : (params.length_nm ?? 900))
                  )}
                  onChange={(e) => setHeight(parseFloat(e.target.value))}
                  style={{ width: 88 }}
                />
              </div>
            </>
          )}

          {maskMode === "TEMPLATE" && templateId === "DENSE_LS" && (
            <>
              <label className="label" style={{ marginTop: 8 }}>Pitch (nm)</label>
              <div className="row">
                <input
                  type="range"
                  min={60}
                  max={300}
                  step={1}
                  value={params.pitch_nm ?? 140}
                  onChange={(e) => setParam("pitch_nm", parseFloat(e.target.value))}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  min={60}
                  max={300}
                  step={1}
                  value={params.pitch_nm ?? 140}
                  onChange={(e) => setParam("pitch_nm", parseFloat(e.target.value))}
                  style={{ width: 88 }}
                />
              </div>
            </>
          )}

          {maskMode === "TEMPLATE" && (templateId === "CONTACT_OPC_SERIF" || templateId === "L_CORNER_OPC_SERIF") && (
            <>
              <label className="label" style={{ marginTop: 8 }}>Serif Size (nm)</label>
              <div className="row">
                <input
                  type="range"
                  min={5}
                  max={200}
                  step={1}
                  value={params.serif_nm ?? 28}
                  onChange={(e) => setParam("serif_nm", parseFloat(e.target.value))}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  min={5}
                  max={200}
                  step={1}
                  value={Math.round(params.serif_nm ?? 28)}
                  onChange={(e) => setParam("serif_nm", parseFloat(e.target.value))}
                  style={{ width: 88 }}
                />
              </div>
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
                  disabled={!maskPresetName.trim() || (maskMode === "CUSTOM" && customShapes.length === 0)}
                  onClick={() => {
                    onSaveCustomMaskPreset(maskPresetName);
                    setMaskPresetName("");
                  }}
                >
                  Save
                </button>
              </div>
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
                    <button className="mini-btn slim danger" onClick={() => onDeleteCustomMaskPreset(m.id)}>Del</button>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                    Width, height, and dose are baseline options. Pitch is available only for Dense L/S, and Serif is available only for Contact (OPC Serif).
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
                        {customShapes.map((s, i) =>
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
                        {s.param} · {s.count} pts · {new Date(s.createdAt).toLocaleString()}
                      </div>
                      <div className="analysis-actions">
                        <button className="mini-btn slim" onClick={() => onLoadSweepSnapshot(s.id)}>Load</button>
                        <button className="mini-btn slim danger" onClick={() => onDeleteSweepSnapshot(s.id)}>Del</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="group-card compact" style={{ marginBottom: 0 }}>
          <p className="group-title">Workspace</p>
          <div className="analysis-panel">
            <div className="analysis-seg compact">
              <button className={libraryTab === "SCENARIOS" ? "active" : ""} onClick={() => setLibraryTab("SCENARIOS")}>
                Scenarios ({scenarios.length}{scenarioLimit !== null ? `/${scenarioLimit}` : ""})
              </button>
              <button className={libraryTab === "HISTORY" ? "active" : ""} onClick={() => setLibraryTab("HISTORY")}>
                History ({runHistory.length})
              </button>
            </div>
            {libraryTab === "SCENARIOS" && (
              <div className="analysis-panel">
                <div className="row">
                  <input
                    type="text"
                    value={scenarioName}
                    onChange={(e) => setScenarioName(e.target.value)}
                    placeholder="scenario name"
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={() => {
                      const next = scenarioName.trim();
                      if (!next) return;
                      onSaveScenario(next);
                      setScenarioName("");
                    }}
                    disabled={!scenarioName.trim() || scenarioLimitReached}
                    className="mini-btn"
                    title={scenarioLimitReached ? "Upgrade to Pro for unlimited scenario saves." : undefined}
                  >
                    Save
                  </button>
                </div>
                {scenarioLimitReached && (
                  <div className="upgrade-inline-wrap">
                    <div className="small-note tiny-note">
                      Free scenario slots are full. Upgrade to Pro for unlimited saves.
                    </div>
                    <button className="mini-btn slim upgrade-inline-cta" onClick={() => requestUpgrade("scenario_slots")}>
                      Upgrade
                    </button>
                  </div>
                )}
                <div className="analysis-list">
                  {scenarios.length === 0 && <div className="small-note tiny-note">No scenarios.</div>}
                  {scenarios.map((s) => (
                    <div key={s.id} className="analysis-item">
                      <div className="analysis-item-title">{s.name}</div>
                      <div className="analysis-actions">
                        <button className="mini-btn slim" onClick={() => onLoadScenario(s.id)}>Load</button>
                        <button className="mini-btn slim danger" onClick={() => onDeleteScenario(s.id)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {libraryTab === "HISTORY" && (
              <div className="analysis-panel">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div className="small-note tiny-note">{runHistory.length} run(s)</div>
                  <button className="mini-btn slim" onClick={onClearHistory} disabled={!runHistory.length}>Clear</button>
                </div>
                {currentRun && (
                  <div className="small-note tiny-note">
                    Current run is pinned: {currentRun.label}
                  </div>
                )}
                <div className="analysis-list">
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
            )}
          </div>

          <p className="small-note tiny-note" style={{ margin: "8px 2px 2px" }}>
            Educational approximation. Not calibrated.
          </p>
          <a href="/opclab/model-summary" className="model-guide-link" style={{ marginTop: 10 }}>
            <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center" }}>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2.2" y="2.3" width="11.6" height="11.2" rx="2.1" />
                <path d="M5.1 5.2h5.8M5.1 8h5.8M5.1 10.8h3.9" />
              </svg>
            </span>
            Imaging & Limits Guide
          </a>
          <div className="trust-links-row" style={{ marginTop: 8 }}>
            <a href="/opclab/revenue-dashboard" className="trust-link-mini">Revenue Dashboard</a>
          </div>
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












