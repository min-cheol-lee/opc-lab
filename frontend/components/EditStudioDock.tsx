"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { MaskShape, Plan, TemplateID } from "../lib/types";
import type {
  CornerAnchor,
  EditorLayer,
  EditorTool,
  EdgeAnchor,
  SrafOrientation,
  TargetGuide,
} from "../lib/opc-workspace";
import { trackProductEvent } from "../lib/telemetry";

function StudioToolIcon(props: { kind: "select" | "add" | "subtract" | "sraf" }) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (props.kind === "select") {
    return (
      <svg className="workspace-tool-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3 2.7 10.6 8 7.5 8.6 9.6 13.3 7.8 14 5.7 9.3 3.4 11z" {...stroke} />
      </svg>
    );
  }

  if (props.kind === "add") {
    return (
      <svg className="workspace-tool-icon" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2.5" y="2.5" width="8.5" height="8.5" rx="1.8" {...stroke} />
        <path d="M12 9.8v3.7M10.2 11.6h3.6" {...stroke} />
      </svg>
    );
  }

  if (props.kind === "subtract") {
    return (
      <svg className="workspace-tool-icon" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2.5" y="2.5" width="8.5" height="8.5" rx="1.8" {...stroke} />
        <path d="M10.2 11.6h3.6" {...stroke} />
      </svg>
    );
  }

  return (
    <svg className="workspace-tool-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 5h11M2.5 8h11M2.5 11h11" {...stroke} />
    </svg>
  );
}

function AssistActionIcon() {
  return (
    <svg className="workspace-assist-action-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 3.2v9.6M3.2 8h9.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function templateInspectorLabel(templateId: TemplateID) {
  switch (templateId) {
    case "ISO_LINE":
      return "Isolated Line";
    case "DENSE_LS":
      return "Dense L/S";
    case "CONTACT_RAW":
      return "Square";
    case "CONTACT_OPC_SERIF":
      return "Square OPC";
    case "L_CORNER_RAW":
      return "L-Shape";
    case "L_CORNER_OPC_SERIF":
      return "L-Shape OPC";
    case "STAIRCASE":
      return "Stepped Interconnect";
    case "STAIRCASE_OPC":
      return "Stepped Interconnect OPC";
    default:
      return "Pattern";
  }
}

export function EditStudioDock(props: {
  layout?: "full" | "side";
  plan: Plan;
  maskMode: "TEMPLATE" | "CUSTOM";
  activeEditLayer: EditorLayer;
  onSetActiveEditLayer: (v: EditorLayer) => void;
  editorTool: EditorTool;
  onSetEditorTool: (v: EditorTool) => void;
  templateId: TemplateID;
  params: Record<string, number>;
  setParams: (v: Record<string, number>) => void;
  targetGuide: TargetGuide | null;
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
  onCopyTargetToMask: () => void;
  onCopyMaskToTarget: () => void;
  onClearTargetLayer: () => void;
  onUpgradeIntent: (source: string) => void;
}) {
  const {
    layout = "full",
    plan,
    maskMode,
    activeEditLayer,
    onSetActiveEditLayer,
    editorTool,
    onSetEditorTool,
    templateId,
    params,
    setParams,
    targetGuide,
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
    onCopyTargetToMask,
    onCopyMaskToTarget,
    onClearTargetLayer,
    onUpgradeIntent,
  } = props;

  const targetEditing = activeEditLayer === "TARGET";
  const canUseSubtractTools = !targetEditing;
  const presetAnchorAvailable = maskMode === "TEMPLATE" && presetAnchorShapes.length > 0;
  const hasManualSelection = selectedCustomShapeIndexes.length > 0;
  const hasPresetSelection =
    presetAnchorAvailable &&
    !hasManualSelection &&
    selectedPresetAnchorIndex >= 0 &&
    selectedPresetAnchorIndex < presetAnchorShapes.length;
  const selectedManualIndex = selectedCustomShapeIndexes.length === 1
    ? selectedCustomShapeIndexes[0]
    : selectedCustomShapeIndex;
  const selectedShape = selectedManualIndex >= 0 ? editableShapes[selectedManualIndex] ?? null : null;
  const hasMultiManualSelection = selectedCustomShapeIndexes.length > 1;
  const manualSelectedRect = selectedCustomShapeIndexes.length === 1 && selectedShape?.type === "rect" ? selectedShape : null;
  const editingPresetFeature =
    maskMode === "TEMPLATE" &&
    !hasManualSelection &&
    !manualSelectedRect &&
    !!currentPresetFeatureRect;
  const selectedRect = manualSelectedRect ?? (editingPresetFeature ? currentPresetFeatureRect : null);
  const fovNm = params.fov_nm ?? 1100;
  const maxRectX = selectedRect ? Math.max(0, fovNm - selectedRect.w_nm) : fovNm;
  const maxRectY = selectedRect ? Math.max(0, fovNm - selectedRect.h_nm) : fovNm;
  const steppedTemplate = templateId === "STAIRCASE" || templateId === "STAIRCASE_OPC";
  const squareTemplate = templateId === "CONTACT_RAW" || templateId === "CONTACT_OPC_SERIF";
  const canUseGlobalInspector = maskMode === "TEMPLATE" && activeEditLayer === "MASK";
  const [inspectorScope, setInspectorScope] = useState<"LOCAL" | "GLOBAL">("LOCAL");
  const globalInspector = canUseGlobalInspector && inspectorScope === "GLOBAL";
  const dockMeta = useMemo(
    () =>
      maskMode === "TEMPLATE"
        ? "Preset"
        : "Custom",
    [maskMode],
  );
  useEffect(() => {
    if (!canUseGlobalInspector && inspectorScope !== "LOCAL") {
      setInspectorScope("LOCAL");
    }
  }, [canUseGlobalInspector, inspectorScope]);
  const inspectorChip = useMemo(() => {
    if (globalInspector) {
      return {
        label: templateInspectorLabel(templateId),
        kind: "template" as const,
        title: "Pattern-wide parameters",
      };
    }
    if (hasMultiManualSelection) {
      return { label: `${selectedCustomShapeIndexes.length} edits`, kind: "multi" as const, title: "Multiple manual edits selected" };
    }
    if (editingPresetFeature) {
      return {
        label: `M${selectedPresetAnchorIndex + 1}`,
        kind: "preset" as const,
        title: `${activeEditLayer === "TARGET" ? "Target" : "Mask"} feature M${selectedPresetAnchorIndex + 1}`,
      };
    }
    if (manualSelectedRect && selectedManualIndex >= 0) {
      const prefix = manualSelectedRect.op === "subtract" ? "-" : "+";
      return {
        label: `${prefix}R${selectedManualIndex + 1}`,
        kind: manualSelectedRect.op === "subtract" ? "subtract" as const : "manual" as const,
        title: manualSelectedRect.op === "subtract" ? "Subtract edit" : "Add edit",
      };
    }
    return { label: "Template", kind: "template" as const, title: "Template defaults" };
  }, [globalInspector, templateId, hasMultiManualSelection, selectedCustomShapeIndexes.length, editingPresetFeature, selectedPresetAnchorIndex, activeEditLayer, manualSelectedRect, selectedManualIndex]);

  function clamp(v: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, v));
  }

  function setParam(key: string, v: number) {
    setParams({ ...params, [key]: v });
  }

  function requestUpgrade(source: string) {
    trackProductEvent("upgrade_prompt_clicked", { source, fromPlan: plan });
    onUpgradeIntent(source);
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

  function setGlobalWidth(v: number) {
    const bounded = clamp(v, 1, 900);
    const next = { ...params };
    if (squareTemplate) {
      next.w_nm = bounded;
      next.cd_nm = bounded;
    } else if (steppedTemplate) {
      next.thickness_nm = bounded;
      next.cd_nm = bounded;
    } else {
      next.cd_nm = bounded;
    }
    setParams(next);
  }

  function setGlobalHeight(v: number) {
    const bounded = clamp(v, 1, 900);
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
        onUpdatePresetFeatureRect({ ...selectedRect, x_nm: clamp(next, 0, maxRectX) });
        return;
      }
      onUpdatePresetFeatureRect({ ...selectedRect, y_nm: clamp(next, 0, maxRectY) });
      return;
    }
    if (!manualSelectedRect || selectedManualIndex < 0) return;
    if (axis === "x") {
      onUpdateCustomShape(selectedManualIndex, { ...selectedRect, x_nm: clamp(next, 0, maxRectX) });
      return;
    }
    onUpdateCustomShape(selectedManualIndex, { ...selectedRect, y_nm: clamp(next, 0, maxRectY) });
  }

  function renderInspectorControl(
    label: string,
    value: number,
    onChange: (next: number) => void,
    min: number,
    max: number,
    step = 1,
  ) {
    return (
      <>
        <label className="label workspace-inspector-label">{label}</label>
        <div className="row workspace-inspector-row">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={Math.round(value)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="workspace-inspector-number"
          />
        </div>
      </>
    );
  }

  return (
    <div className={`workspace-edit-dock ${layout === "side" ? "workspace-edit-dock-side-layout" : ""}`}>
      <div className="workspace-edit-dock-head">
        <div className="workspace-edit-dock-eyebrow">Edit</div>
        <div className="workspace-edit-dock-meta">{dockMeta}</div>
      </div>

      <div className="workspace-edit-dock-grid">
        <div className="workspace-edit-dock-main">
          <div className="workspace-studio-block workspace-layer-block">
            <div className="workspace-layer-inline">
              <div className="workspace-layer-eyebrow">Edit Layer</div>
              <div className="workspace-layer-toggle workspace-layer-toggle-inline">
                <button
                  className={activeEditLayer === "MASK" ? "is-active" : ""}
                  onClick={() => onSetActiveEditLayer("MASK")}
                  disabled={activeEditLayer === "MASK"}
                >
                  Mask
                </button>
                <button
                  className={activeEditLayer === "TARGET" ? "is-active" : ""}
                  onClick={() => onSetActiveEditLayer("TARGET")}
                  disabled={activeEditLayer === "TARGET"}
                >
                  Target
                </button>
              </div>
            </div>
            {maskMode === "CUSTOM" && (
              <div className="workspace-inline-actions workspace-layer-actions">
                <button className="mini-btn slim" onClick={onCopyTargetToMask}>Target -&gt; Mask</button>
                <button className="mini-btn slim" onClick={onCopyMaskToTarget}>Mask -&gt; Target</button>
                <button className="mini-btn slim" onClick={onClearTargetLayer}>Clear</button>
              </div>
            )}
          </div>

          <div className="workspace-edit-dock-row">
            <div className="workspace-studio-block">
              <div className="workspace-mini-head">
                <span>Edit Tools</span>
                <span>{targetEditing ? "Target locked" : "Mask editing"}</span>
              </div>
              <div className="draw-action-row workspace-tool-grid workspace-tool-grid-compact">
                <button
                  className={`mini-btn draw-action workspace-tool-button ${editorTool === "SELECT" ? "active-draw-btn" : ""}`}
                  onClick={() => onSetEditorTool("SELECT")}
                  title="Select and move features."
                  aria-label="Select"
                >
                  <StudioToolIcon kind="select" />
                  <span>Select</span>
                </button>
                <button
                  className={`mini-btn draw-action workspace-tool-button ${editorTool === "DRAW_ADD_RECT" ? "active-draw-btn" : ""}`}
                  onClick={() => onSetEditorTool(editorTool === "DRAW_ADD_RECT" ? "SELECT" : "DRAW_ADD_RECT")}
                  title="Add a rectangular patch."
                  aria-label="Add rectangle"
                >
                  <StudioToolIcon kind="add" />
                  <span>Add Rect</span>
                </button>
                <button
                  className={`mini-btn draw-action workspace-tool-button ${editorTool === "DRAW_SUBTRACT_RECT" ? "active-draw-btn" : ""}`}
                  onClick={() => onSetEditorTool(editorTool === "DRAW_SUBTRACT_RECT" ? "SELECT" : "DRAW_SUBTRACT_RECT")}
                  disabled={!canUseSubtractTools}
                  title={canUseSubtractTools ? "Subtract a rectangular patch." : "Target layer is additive only."}
                  aria-label="Subtract rectangle"
                >
                  <StudioToolIcon kind="subtract" />
                  <span>Sub Rect</span>
                </button>
              </div>
            </div>

            {(presetAnchorAvailable || !targetEditing) && (
              <div className="workspace-studio-block">
                <div className="workspace-mini-head">
                  <span>{presetAnchorAvailable ? "Selections" : "Manual Edits"}</span>
                  <span>
                    {presetAnchorAvailable
                      ? hasManualSelection
                        ? `${selectedCustomShapeIndexes.length} edit${selectedCustomShapeIndexes.length > 1 ? "s" : ""} selected`
                        : hasPresetSelection
                          ? "Feature selected"
                          : "None selected"
                      : `${editableShapes.length}/${plan === "FREE" ? freeCustomRectLimit : proCustomShapeLimit} used`}
                  </span>
                </div>
                {presetAnchorAvailable && (
                  <div className="workspace-selection-section">
                    <div className="workspace-selection-label">
                      {activeEditLayer === "TARGET" ? "Target Feature" : "Mask Feature"}
                    </div>
                    <div className="shape-chip-list workspace-chip-row">
                      {presetAnchorShapes.map((_, i) => (
                        <div
                          key={`dock-preset-anchor-${i}`}
                          className={`shape-chip workspace-feature-chip ${hasPresetSelection && selectedPresetAnchorIndex === i ? "selected" : ""} ${presetFeatureOverrideActive && hasPresetSelection && selectedPresetAnchorIndex === i ? "shape-chip-has-reset" : ""}`}
                        >
                          <button className="mini-btn slim" onClick={() => onSetSelectedPresetAnchorIndex(i)}>
                            {`M${i + 1}`}
                          </button>
                          {presetFeatureOverrideActive && hasPresetSelection && selectedPresetAnchorIndex === i && (
                            <button
                              className="workspace-chip-reset"
                              onClick={(e) => {
                                e.stopPropagation();
                                onResetPresetFeatureRect();
                              }}
                              title="Reset this feature"
                              aria-label={`Reset M${i + 1}`}
                            >
                              R
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!targetEditing && (
                  <>
                    {(customLimitReached || customLimitNotice) && (
                      <div className="upgrade-inline-wrap">
                        <div className="small-note tiny-note">
                          {customLimitNotice
                            ? customLimitNotice
                            : (plan === "FREE"
                                ? `Free limit: ${freeCustomRectLimit} manual shapes per layer.`
                                : `Edit capacity reached (${proCustomShapeLimit}).`)}
                        </div>
                        {plan === "FREE" && (
                          <button className="mini-btn slim upgrade-inline-cta" onClick={() => requestUpgrade("custom_shape_limit")}>
                            Upgrade
                          </button>
                        )}
                      </div>
                    )}
                    <div className={`workspace-selection-section ${presetAnchorAvailable ? "workspace-selection-section-split" : ""}`}>
                      {presetAnchorAvailable && <div className="workspace-selection-label">Manual Edits</div>}
                      <div className="shape-chip-list workspace-chip-row">
                        {editableShapes.length === 0 && (
                          <div className="workspace-empty-chip">No edits yet</div>
                        )}
                        {editableShapes.map((shape, i) => {
                          const label = `${shape.op === "subtract" ? "-" : "+"}R${i + 1}`;
                          return (
                            <div key={i} className={`shape-chip ${selectedCustomShapeIndexes.includes(i) ? "selected" : ""}`}>
                              <button
                                className="mini-btn slim"
                                onClick={(e) => onSelectCustomShapeChip(i, e.shiftKey || e.ctrlKey || e.metaKey)}
                              >
                                {label}
                              </button>
                              <button className="mini-btn slim danger" onClick={() => onDeleteCustomShape(i)} aria-label={`Delete edit ${i + 1}`}>x</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {!targetEditing && (
            <div className="workspace-studio-block">
                <div className="workspace-mini-head">
                  <span>Assist Setup</span>
                  <span>{selectedRect ? "Selection ready" : "Pick a feature in 2D"}</span>
                </div>
                <div className="workspace-field-grid workspace-field-grid-wide">
                  <div className="workspace-field">
                    <label className="label">Hammerhead Edge</label>
                    <div className="workspace-assist-inline">
                      <select value={hammerheadEdge} onChange={(e) => onSetHammerheadEdge(e.target.value as EdgeAnchor)} style={{ width: "100%" }}>
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                        <option value="top">Top</option>
                        <option value="bottom">Bottom</option>
                      </select>
                      <button
                        className="mini-btn slim workspace-assist-icon-btn"
                        onClick={onAddHammerheadToSelected}
                        disabled={(maskMode === "CUSTOM" && !selectedRect) || (maskMode === "TEMPLATE" && !presetAnchorAvailable)}
                        title="Add a hammerhead using the selected edge."
                        aria-label="Add hammerhead"
                      >
                        <AssistActionIcon />
                      </button>
                    </div>
                  </div>
                  <div className="workspace-field">
                    <label className="label">Serif Corner</label>
                    <div className="workspace-assist-inline">
                      <select value={serifCorner} onChange={(e) => onSetSerifCorner(e.target.value as CornerAnchor)} style={{ width: "100%" }}>
                        <option value="nw">Top Left</option>
                        <option value="ne">Top Right</option>
                        <option value="sw">Bottom Left</option>
                        <option value="se">Bottom Right</option>
                      </select>
                      <button
                        className="mini-btn slim workspace-assist-icon-btn"
                        onClick={onAddSerifToSelected}
                        disabled={(maskMode === "CUSTOM" && !selectedRect) || (maskMode === "TEMPLATE" && !presetAnchorAvailable)}
                        title="Add a serif at the selected corner."
                        aria-label="Add serif"
                      >
                        <AssistActionIcon />
                      </button>
                    </div>
                  </div>
                  <div className="workspace-field">
                    <label className="label">Mousebite Edge</label>
                    <div className="workspace-assist-inline">
                      <select value={mousebiteEdge} onChange={(e) => onSetMousebiteEdge(e.target.value as EdgeAnchor)} style={{ width: "100%" }}>
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                        <option value="top">Top</option>
                        <option value="bottom">Bottom</option>
                      </select>
                      <button
                        className="mini-btn slim workspace-assist-icon-btn"
                        onClick={onAddMousebiteToSelected}
                        disabled={(maskMode === "CUSTOM" && !selectedRect) || (maskMode === "TEMPLATE" && !presetAnchorAvailable)}
                        title="Cut a mousebite on the selected edge."
                        aria-label="Add mousebite"
                      >
                        <AssistActionIcon />
                      </button>
                    </div>
                  </div>
                  <div className="workspace-field">
                    <label className="label">SRAF Orientation</label>
                    <div className="workspace-assist-inline">
                      <select value={srafOrientation} onChange={(e) => onSetSrafOrientation(e.target.value as SrafOrientation)} style={{ width: "100%" }}>
                        <option value="horizontal">Horizontal</option>
                        <option value="vertical">Vertical</option>
                      </select>
                      <button
                        className={`mini-btn slim workspace-assist-icon-btn ${editorTool === "PLACE_SRAF" ? "active" : ""}`}
                        onClick={() => onSetEditorTool(editorTool === "PLACE_SRAF" ? "SELECT" : "PLACE_SRAF")}
                        disabled={targetEditing}
                        title="Place an assist bar using the selected orientation."
                        aria-label="Place assist bar"
                      >
                        <AssistActionIcon />
                      </button>
                    </div>
                  </div>
                </div>
            </div>
          )}
        </div>

        <div className="workspace-edit-dock-side">
          <div className="workspace-studio-block workspace-edit-inspector">
            <div className="workspace-edit-inspector-head">
              <div className="workspace-edit-inspector-headline">
                <div className="workspace-layer-eyebrow">Inspector</div>
                <div className={`workspace-inspector-chip workspace-inspector-chip-${inspectorChip.kind}`} title={inspectorChip.title}>
                  {inspectorChip.label}
                </div>
              </div>
              <div className="workspace-edit-inspector-actions">
                {canUseGlobalInspector && (
                  <div className="workspace-inspector-scope">
                    <button
                      className={inspectorScope === "LOCAL" ? "is-active" : ""}
                      onClick={() => setInspectorScope("LOCAL")}
                      disabled={inspectorScope === "LOCAL"}
                      title="Adjust the selected geometry"
                    >
                      Local
                    </button>
                    <button
                      className={inspectorScope === "GLOBAL" ? "is-active" : ""}
                      onClick={() => setInspectorScope("GLOBAL")}
                      disabled={inspectorScope === "GLOBAL"}
                      title="Adjust pattern-wide parameters"
                    >
                      Global
                    </button>
                  </div>
                )}
                <div className="workspace-layer-meta">
                  {globalInspector
                    ? "Pattern parameters"
                    : hasMultiManualSelection
                      ? "Move only"
                      : selectedRect
                        ? `${Math.round(selectedRect.w_nm)} x ${Math.round(selectedRect.h_nm)} nm`
                        : "Selected geometry"}
                </div>
              </div>
            </div>

            {globalInspector ? (
              <>
                {(templateId === "ISO_LINE" || templateId === "DENSE_LS") && renderInspectorControl(
                  "Width (nm)",
                  params.cd_nm ?? 100,
                  (next) => setGlobalWidth(next),
                  1,
                  900,
                )}
                {(templateId === "ISO_LINE" || templateId === "DENSE_LS") && renderInspectorControl(
                  "Height (nm)",
                  params.length_nm ?? 900,
                  (next) => setGlobalHeight(next),
                  10,
                  900,
                )}
                {templateId === "DENSE_LS" && renderInspectorControl(
                  "Pitch (nm)",
                  params.pitch_nm ?? 140,
                  (next) => setParam("pitch_nm", next),
                  60,
                  300,
                )}

                {(templateId === "CONTACT_RAW" || templateId === "CONTACT_OPC_SERIF") && renderInspectorControl(
                  "Side (nm)",
                  params.w_nm ?? params.cd_nm ?? 100,
                  (next) => {
                    const bounded = clamp(next, 1, 900);
                    setParams({ ...params, w_nm: bounded, cd_nm: bounded });
                  },
                  1,
                  900,
                )}
                {templateId === "CONTACT_OPC_SERIF" && renderInspectorControl(
                  "Serif Size (nm)",
                  params.serif_nm ?? 28,
                  (next) => setParam("serif_nm", next),
                  5,
                  200,
                )}

                {(templateId === "L_CORNER_RAW" || templateId === "L_CORNER_OPC_SERIF") && renderInspectorControl(
                  "Width (nm)",
                  params.cd_nm ?? 92,
                  (next) => setGlobalWidth(next),
                  1,
                  300,
                )}
                {(templateId === "L_CORNER_RAW" || templateId === "L_CORNER_OPC_SERIF") && renderInspectorControl(
                  "Horizontal Arm (nm)",
                  params.length_nm ?? 470,
                  (next) => setParam("length_nm", next),
                  80,
                  900,
                )}
                {(templateId === "L_CORNER_RAW" || templateId === "L_CORNER_OPC_SERIF") && renderInspectorControl(
                  "Vertical Arm (nm)",
                  params.arm_nm ?? 432,
                  (next) => setParam("arm_nm", next),
                  80,
                  900,
                )}
                {templateId === "L_CORNER_OPC_SERIF" && renderInspectorControl(
                  "Serif Size (nm)",
                  params.serif_nm ?? 18,
                  (next) => setParam("serif_nm", next),
                  5,
                  200,
                )}

                {(templateId === "STAIRCASE" || templateId === "STAIRCASE_OPC") && renderInspectorControl(
                  "Track Width (nm)",
                  params.thickness_nm ?? params.cd_nm ?? 88,
                  (next) => {
                    const bounded = clamp(next, 1, 400);
                    setParams({ ...params, thickness_nm: bounded, cd_nm: bounded });
                  },
                  1,
                  400,
                )}
                {(templateId === "STAIRCASE" || templateId === "STAIRCASE_OPC") && renderInspectorControl(
                  "Step Run (nm)",
                  params.step_w_nm ?? 180,
                  (next) => setParam("step_w_nm", next),
                  30,
                  400,
                )}
                {(templateId === "STAIRCASE" || templateId === "STAIRCASE_OPC") && renderInspectorControl(
                  "Step Rise (nm)",
                  params.step_h_nm ?? 110,
                  (next) => setParam("step_h_nm", next),
                  20,
                  300,
                )}
                {templateId === "STAIRCASE_OPC" && renderInspectorControl(
                  "Corner Pad (nm)",
                  params.serif_nm ?? 18,
                  (next) => setParam("serif_nm", next),
                  5,
                  120,
                )}
              </>
            ) : hasMultiManualSelection ? (
              <div className="small-note tiny-note workspace-inspector-note">
                Multi-selection is move-only. Use a single selected feature to adjust geometry.
              </div>
            ) : selectedRect ? (
              <>
                {renderInspectorControl(
                  "X (nm)",
                  clamp(selectedRect.x_nm, 0, Math.max(1, maxRectX)),
                  (next) => setRectAxis("x", next),
                  0,
                  Math.max(1, maxRectX),
                )}
                {renderInspectorControl(
                  "Y (nm)",
                  clamp(selectedRect.y_nm, 0, Math.max(1, maxRectY)),
                  (next) => setRectAxis("y", next),
                  0,
                  Math.max(1, maxRectY),
                )}
              </>
            ) : (
              <div className="small-note tiny-note workspace-inspector-note">
                {canUseGlobalInspector
                  ? "Select a feature to edit locally, or switch to Global for pattern-wide tuning."
                  : "Select a manual rectangle or a preset main feature to tune its geometry."}
              </div>
            )}

            {!globalInspector && !hasMultiManualSelection && selectedRect && renderInspectorControl(
              "Width (nm)",
              selectedRect.w_nm,
              (next) => setCd(next),
              1,
              900,
            )}

            {!globalInspector && !hasMultiManualSelection && selectedRect && renderInspectorControl(
              steppedTemplate ? "Step Height (nm)" : "Height (nm)",
              selectedRect.h_nm,
              (next) => setHeight(next),
              10,
              900,
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
