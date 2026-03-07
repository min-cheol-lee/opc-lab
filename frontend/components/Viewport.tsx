"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { BatchSimResponse, MaskShape, RunRecord, SimRequest, SimResponse, SweepParam } from "../lib/types";
import type { EditorLayer, EditorTool, TargetGuide, TargetScoreMetrics } from "../lib/opc-workspace";
import { getShapeOp } from "../lib/opc-workspace";
import { exportPngWithMeta, exportRunsCsv, exportSvgWithMeta, type ExportSweepPayload } from "../lib/export";
import { consumeUsage } from "../lib/usage";
import { trackProductEvent } from "../lib/telemetry";

const DEFAULT_FOV = 1100;
const COMPARE_A_COLOR = "#2f7dff";
const COMPARE_B_COLOR = "#bf5af2";
const MODEL_VERSION_TAG = "v0.1.0 · edu-guard-1";

type TrustPresetInfo = {
  title: string;
  wavelengthNm: number;
  na: number;
  k1: number;
};

const TRUST_PRESET_INFO: Record<SimRequest["preset_id"], TrustPresetInfo> = {
  DUV_193_DRY: { title: "DUV | 193 nm Dry", wavelengthNm: 193.0, na: 0.93, k1: 0.28 },
  DUV_193_IMM: { title: "DUV | 193 nm Immersion", wavelengthNm: 193.0, na: 1.35, k1: 0.26 },
  EUV_LNA: { title: "EUV | 13.5 nm Low-NA", wavelengthNm: 13.5, na: 0.33, k1: 0.3 },
  EUV_HNA: { title: "EUV | 13.5 nm High-NA", wavelengthNm: 13.5, na: 0.55, k1: 0.26 },
};

export function Viewport(props: {
  sim: SimResponse | null;
  req: SimRequest;
  editDock?: React.ReactNode;
  resolvedMaskShapes?: Array<MaskShape>;
  runHistory?: RunRecord[];
  editableShapes?: Array<MaskShape>;
  onEditableShapesChange?: (shapes: Array<MaskShape>) => void;
  presetAnchorShapes?: Array<Extract<MaskShape, { type: "rect" }>>;
  selectedPresetAnchorIndex?: number;
  onSelectPresetAnchor?: (i: number) => void;
  selectedCustomShapeIndex?: number;
  selectedCustomShapeIndexes?: number[];
  onSelectCustomShape?: (i: number, additive?: boolean) => void;
  activeEditLayer?: EditorLayer;
  editorTool?: EditorTool;
  onAddCustomRectFromDrag?: (rect: { x_nm: number; y_nm: number; w_nm: number; h_nm: number }) => void;
  onPlaceSrafAtPoint?: (point: { x_nm: number; y_nm: number }) => void;
  targetGuide?: TargetGuide | null;
  targetMetrics?: TargetScoreMetrics | null;
  compareActive?: boolean;
  compareALabel?: string | null;
  compareBLabel?: string | null;
  compareAContours?: Array<{ points_nm: Array<{ x: number; y: number }> }> | null;
  compareBContours?: Array<{ points_nm: Array<{ x: number; y: number }> }> | null;
  compareACd?: number | null;
  compareBCd?: number | null;
  sweepResult?: BatchSimResponse | null;
  sweepCustomTargetIndex?: number;
  sweepCompareA?: BatchSimResponse | null;
  sweepCompareB?: BatchSimResponse | null;
  sweepCompareALabel?: string | null;
  sweepCompareBLabel?: string | null;
  panelLayoutMode?: "side" | "overlay";
  showEditDockPanel?: boolean;
  showSurfacePanel?: boolean;
  showMetricsFooter?: boolean;
  canvasModeHud?: React.ReactNode;
  canvasLeftInset?: number;
  onUsageConsumed?: () => void;
}) {
  const {
    sim,
    req,
    editDock = null,
    resolvedMaskShapes,
    runHistory = [],
    editableShapes = [],
    onEditableShapesChange,
    presetAnchorShapes = [],
    selectedPresetAnchorIndex = 0,
    onSelectPresetAnchor,
    selectedCustomShapeIndex = -1,
    selectedCustomShapeIndexes = [],
    onSelectCustomShape,
    activeEditLayer = "MASK",
    editorTool = "SELECT",
    onAddCustomRectFromDrag,
    onPlaceSrafAtPoint,
    targetGuide = null,
    targetMetrics = null,
    compareActive = false,
    compareALabel = null,
    compareBLabel = null,
    compareAContours = null,
    compareBContours = null,
    compareACd = null,
    compareBCd = null,
    sweepResult = null,
    sweepCustomTargetIndex = 0,
    sweepCompareA = null,
    sweepCompareB = null,
    sweepCompareALabel = null,
    sweepCompareBLabel = null,
    panelLayoutMode = "side",
    showEditDockPanel = true,
    showSurfacePanel = true,
    showMetricsFooter = true,
    canvasModeHud = null,
    canvasLeftInset = 0,
    onUsageConsumed,
  } = props;
  type RulerKey = "mask" | "contour";
  type RulerAxis = "H" | "V";
  type RulerDragTarget =
    | "mask-start"
    | "mask-end"
    | "mask-line"
    | "contour-start"
    | "contour-end"
    | "contour-line";
  type SnapMode = "AUTO" | "OFF" | "MASK" | "CONTOUR";
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [showLegend, setShowLegend] = useState(true);
  const [showRulers, setShowRulers] = useState(true);
  const [rulerAxis, setRulerAxis] = useState<RulerAxis>("H");
  const [showMainContour, setShowMainContour] = useState(true);
  const [showTargetOverlay, setShowTargetOverlay] = useState(true);
  const [showAerial, setShowAerial] = useState(true);
  const [showSurface3d, setShowSurface3d] = useState(true);
  const [showSurfaceControls, setShowSurfaceControls] = useState(false);
  const [surfaceSwapMain, setSurfaceSwapMain] = useState(false);
  const [compareContourMode, setCompareContourMode] = useState<"MIXED" | "AB_ONLY">("AB_ONLY");
  const [showSweepOverlay, setShowSweepOverlay] = useState(true);
  const [sweepStackAll, setSweepStackAll] = useState(true);
  const [sweepPointIndex, setSweepPointIndex] = useState(0);
  const [surfAzimuth, setSurfAzimuth] = useState(34);
  const [surfElevation, setSurfElevation] = useState(34);
  const [surfRoll, setSurfRoll] = useState(0);
  const [surfOffsetX, setSurfOffsetX] = useState(0);
  const [surfOffsetY, setSurfOffsetY] = useState(0);
  const [surfOffsetZ, setSurfOffsetZ] = useState(0);
  const maskOpacityPreset: "REVEAL" = "REVEAL";
  const surfDepth = 0.85;
  const snapMode: SnapMode = "AUTO";
  const [selectedRuler, setSelectedRuler] = useState<RulerKey | null>(null);
  const [dragging, setDragging] = useState(false);
  const [maskRuler, setMaskRuler] = useState<{ x0: number; x1: number; y: number } | null>(null);
  const [contourRuler, setContourRuler] = useState<{ x0: number; x1: number; y: number } | null>(null);
  const maskRulerRef = useRef<{ x0: number; x1: number; y: number } | null>(null);
  const contourRulerRef = useRef<{ x0: number; x1: number; y: number } | null>(null);
  const [heatmapUrl, setHeatmapUrl] = useState<string | null>(null);
  const [surfaceQuality, setSurfaceQuality] = useState<"FAST" | "FULL">("FULL");
  const dragStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const surfaceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const contourDebugKeyRef = useRef<string>("");
  const surfaceDragRef = useRef<
    | { mode: "rotate"; x: number; y: number; az: number; el: number }
    | { mode: "pan"; x: number; y: number; ox: number; oy: number }
    | null
  >(null);
  const surfaceQualityTimerRef = useRef<number | null>(null);
  const rulerDragRef = useRef<{
    target: RulerDragTarget;
    x: number;
    y: number;
    start: { x0: number; x1: number; y: number };
  } | null>(null);
  const customShapeDragRef = useRef<{
    indexes: number[];
    x: number;
    y: number;
    startShapes: Array<MaskShape>;
  } | null>(null);
  const customRectResizeRef = useRef<{
    index: number;
    corner: "nw" | "ne" | "sw" | "se";
    startShapes: Array<MaskShape>;
  } | null>(null);
  const customRectCreateRef = useRef<{ x: number; y: number } | null>(null);
  const [customRectDraft, setCustomRectDraft] = useState<{ x_nm: number; y_nm: number; w_nm: number; h_nm: number } | null>(null);
  const [srafHintPoint, setSrafHintPoint] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasCommandRef = useRef<HTMLDivElement | null>(null);
  const [canvasCommandHeight, setCanvasCommandHeight] = useState(86);
  const templateId = req.mask.template_id ?? "";
  const paramsSignature = JSON.stringify(req.mask.params_nm ?? {});
  const maskShapesSignature = JSON.stringify(req.mask.shapes ?? []);
  const editableShapesSignature = JSON.stringify(editableShapes ?? []);
  const contourLockedByCompare = compareActive && compareContourMode === "AB_ONLY";
  const effectiveShowMainContour = showMainContour && !contourLockedByCompare;
  const fovNm = useMemo(() => {
    return req.mask.params_nm?.fov_nm ?? DEFAULT_FOV;
  }, [req.mask.params_nm]);
  const trustPreset = useMemo(() => TRUST_PRESET_INFO[req.preset_id], [req.preset_id]);
  const trustCdMinNm = useMemo(
    () => (trustPreset.k1 * trustPreset.wavelengthNm) / Math.max(trustPreset.na, 1e-6),
    [trustPreset]
  );
  const trustTooltipText = useMemo(
    () =>
      `Model ${MODEL_VERSION_TAG}\n` +
      `Formula: CDmin ~ k1*lambda/NA\n` +
      `${trustPreset.title} · k1=${trustPreset.k1.toFixed(2)} · λ=${trustPreset.wavelengthNm.toFixed(1)} nm · NA=${trustPreset.na.toFixed(2)} · CDmin~${trustCdMinNm.toFixed(1)} nm`,
    [trustPreset, trustCdMinNm]
  );
  const templateMaskRects = useMemo(
    () => (req.mask.mode === "TEMPLATE" ? maskRectsFromTemplate({ ...req, mask: { ...req.mask, shapes: [] } }, fovNm) : []),
    [req, fovNm],
  );
  const targetOverlayPath = useMemo(
    () => (targetGuide ? targetGuide.targetShapes.map((shape) => maskShapeToPath(shape, fovNm)).join(" ") : ""),
    [targetGuide, fovNm],
  );
  const targetContours = useMemo(
    () => targetGuide?.targetContours ?? [],
    [targetGuide],
  );
  const editableShapePaths = useMemo(
    () => editableShapes.map((shape) => maskShapeToPath(shape, fovNm)),
    [editableShapesSignature, editableShapes, fovNm]
  );
  const maskBaseShapes = useMemo(() => (
    resolvedMaskShapes
      ? resolvedMaskShapes
      : req.mask.mode === "CUSTOM"
      ? (req.mask.shapes ?? [])
      : [
          ...rectsToMaskShapes(templateMaskRects),
          ...(req.mask.shapes ?? []),
        ]
  ), [resolvedMaskShapes, req.mask.mode, req.mask.shapes, templateMaskRects]);
  const overlayEditShapes = useMemo(
    () => (req.mask.mode === "TEMPLATE" ? (req.mask.shapes ?? []) : editableShapes),
    [req.mask.mode, req.mask.shapes, editableShapes],
  );
  const maskAddShapes = useMemo(
    () => maskBaseShapes.filter((shape) => getShapeOp(shape) !== "subtract"),
    [maskBaseShapes],
  );
  const maskSubtractShapes = useMemo(
    () => maskBaseShapes.filter((shape) => getShapeOp(shape) === "subtract"),
    [maskBaseShapes],
  );
  const overlayAddShapes = useMemo(
    () => overlayEditShapes.filter((shape) => getShapeOp(shape) !== "subtract"),
    [overlayEditShapes],
  );
  const maskAddPaths = useMemo(
    () => maskAddShapes.map((shape) => maskShapeToPath(shape, fovNm)),
    [maskAddShapes, fovNm],
  );
  const maskSubtractPaths = useMemo(
    () => maskSubtractShapes.map((shape) => maskShapeToPath(shape, fovNm)),
    [maskSubtractShapes, fovNm],
  );
  const overlayAddPaths = useMemo(
    () => overlayAddShapes.map((shape) => maskShapeToPath(shape, fovNm)),
    [overlayAddShapes, fovNm],
  );
  const maskAddRects = useMemo(() => shapesToRects(maskAddShapes), [maskAddShapes]);
  const maskSubtractRects = useMemo(() => shapesToRects(maskSubtractShapes), [maskSubtractShapes]);
  const overlayAddRects = useMemo(() => shapesToRects(overlayAddShapes), [overlayAddShapes]);
  const finalMaskContours = useMemo(
    () => rectBooleanContours(maskAddRects, maskSubtractRects),
    [maskAddRects, maskSubtractRects],
  );
  const finalMaskContourPaths = useMemo(
    () => finalMaskContours.map((contour) => polylineToPath(contour.points_nm, fovNm)),
    [finalMaskContours, fovNm],
  );
  useEffect(() => {
    if (editorTool !== "PLACE_SRAF" && srafHintPoint) {
      setSrafHintPoint(null);
    }
  }, [editorTool, srafHintPoint]);
  const finalMaskCompoundPath = useMemo(
    () => finalMaskContourPaths.join(" "),
    [finalMaskContourPaths],
  );
  const maskRects = maskAddRects;
  const presetAnchorPaths = useMemo(
    () => presetAnchorShapes.map((shape) => maskShapeToPath(shape, fovNm)),
    [presetAnchorShapes, fovNm],
  );
  const maskBounds = useMemo(() => rectsBoundsSvg(maskRects, fovNm), [maskRects, fovNm]);
  const selectedCustomRect = useMemo(() => {
    const s = editableShapes[selectedCustomShapeIndex];
    if (!s || s.type !== "rect") return null;
    return s;
  }, [editableShapesSignature, editableShapes, selectedCustomShapeIndex]);
  const maskCdNm = useMemo(() => estimateMaskCdNm(req, resolvedMaskShapes), [templateId, paramsSignature, req.mask.mode, maskShapesSignature, resolvedMaskShapes]);
  const contourCdNm = sim?.metrics?.cd_nm ?? null;
  // Keep contour styling visually stable across CD/template size.
  const contourUnderWidth = 3.35;
  const contourMainWidth = 1.95;
  const compareContourWidth = 2.1;
  const compareDash2d = `8 5`;
  const exportRuns = useMemo<RunRecord[]>(() => {
    if (runHistory.length > 0) return runHistory;
    if (!sim) return [];
    return [
      {
        id: "current",
        created_at: new Date().toISOString(),
        label: `${req.preset_id} / ${req.mask.mode === "CUSTOM" ? "Custom" : req.mask.template_id ?? "Preset"} / dose ${req.dose.toFixed(2)}`,
        request: req,
        response: sim,
      },
    ];
  }, [runHistory, sim, req]);
  const exportSweep = useMemo<ExportSweepPayload | null>(() => {
    if (!sweepResult) return null;

    const toSeries = (
      res: BatchSimResponse | null | undefined,
      label: string,
      color: string,
      dashed: boolean
    ) => {
      if (!res) return null;
      const points = res.points
        .filter((p) => p.metrics.cd_nm != null && Number.isFinite(p.value))
        .map((p) => ({ x: p.value, y: p.metrics.cd_nm as number }));
      if (points.length < 2) return null;
      return { label, color, dashed, points };
    };

    const main = toSeries(sweepResult, "Main", "#0a84ff", false);
    if (!main) return null;
    const series = [main];
    const a = toSeries(sweepCompareA, sweepCompareALabel ? `A (${sweepCompareALabel})` : "A", "#2f7dff", true);
    const b = toSeries(sweepCompareB, sweepCompareBLabel ? `B (${sweepCompareBLabel})` : "B", "#bf5af2", true);
    if (a) series.push(a);
    if (b) series.push(b);

    return {
      title: "Sweep Summary",
      xLabel: sweepResult.param,
      yLabel: "CD (nm)",
      series,
    };
  }, [sweepResult, sweepCompareA, sweepCompareB, sweepCompareALabel, sweepCompareBLabel]);
  const sweepPoints = sweepResult?.points ?? [];
  const sweepPointsWithContours = useMemo(
    () => sweepPoints.filter((p) => (p.contours_nm?.length ?? 0) > 0),
    [sweepPoints]
  );
  const sweepIndexClamped = Math.max(0, Math.min(sweepPointIndex, Math.max(0, sweepPoints.length - 1)));
  const activeSweepPoint = sweepPoints[sweepIndexClamped] ?? null;
  const activeSweepContours = activeSweepPoint?.contours_nm ?? [];
  const nonDoseStackSweepPoints = useMemo(() => {
    if (!sweepStackAll || !showSweepOverlay || !sweepResult || sweepResult.param === "dose" || !sweepPoints.length) return [] as Array<{ idx: number; value: number; contours_nm?: Array<{ points_nm: Array<{ x: number; y: number }> }> | null }>;
    const total = sweepPoints.length;
    const maxStack = 24;
    const stride = Math.max(1, Math.ceil(total / maxStack));
    const indexes: number[] = [];
    for (let i = 0; i < total; i += stride) indexes.push(i);
    if (indexes[indexes.length - 1] !== total - 1) indexes.push(total - 1);
    return indexes.map((idx) => ({ idx, value: sweepPoints[idx].value, contours_nm: sweepPoints[idx].contours_nm }));
  }, [sweepStackAll, showSweepOverlay, sweepResult, sweepPoints]);
  const nonDoseStackContourSets = useMemo(() => {
    const visible = nonDoseStackSweepPoints.filter((p) => (p.contours_nm?.length ?? 0) > 0);
    if (!visible.length) return [] as Array<{
      contours: Array<{ points_nm: Array<{ x: number; y: number }> }>;
      color: string;
      underColor: string;
    }>;
    const n = Math.max(1, visible.length - 1);
    return visible.map((p, order) => {
      const t = order / n;
      const hue = 204 - t * 124;
      return {
        contours: p.contours_nm ?? [],
        color: `hsla(${hue.toFixed(1)}, 88%, 72%, 0.56)`,
        underColor: "rgba(174,206,240,0.34)",
      };
    });
  }, [nonDoseStackSweepPoints]);
  const stackedDoseSweepPoints = useMemo(
    () => (sweepStackAll && sweepResult?.param === "dose" ? sweepPointsWithContours : []),
    [sweepStackAll, sweepResult?.param, sweepPointsWithContours]
  );
  const sweepMaskOverlay = useMemo(() => {
    const empty = {
      stacked: [] as Array<{
        contours: Array<{ points_nm: Array<{ x: number; y: number }> }>;
        color: string;
        dash?: [number, number];
        underColor?: string;
      }>,
      active: null as null | {
        contours: Array<{ points_nm: Array<{ x: number; y: number }> }>;
        color: string;
        dash?: [number, number];
        underColor?: string;
      },
    };
    if (!showSweepOverlay || !sweepResult || sweepResult.param === "dose" || !sweepPoints.length) return empty;
    const n = Math.max(1, nonDoseStackSweepPoints.length - 1);
    const stacked = nonDoseStackSweepPoints.map((p, order) => {
      const t = order / n;
      const hue = 214 - t * 84;
      const reqAtValue = buildSweepMaskRequest(req, sweepResult.param as SweepParam, p.value, sweepCustomTargetIndex);
      const contours = rectsToClosedContours(maskRectsFromTemplate(reqAtValue, fovNm));
      return {
        contours,
        color: `hsla(${hue.toFixed(1)}, 86%, 72%, 0.48)`,
        dash: [3, 2] as [number, number],
        underColor: "rgba(140,192,248,0.26)",
      };
    });
    const reqActive = buildSweepMaskRequest(req, sweepResult.param as SweepParam, sweepPoints[sweepIndexClamped]?.value ?? 0, sweepCustomTargetIndex);
    return {
      stacked,
      active: {
        contours: rectsToClosedContours(maskRectsFromTemplate(reqActive, fovNm)),
        color: "rgba(124,215,255,0.96)",
        dash: [5, 2] as [number, number],
        underColor: "rgba(195,236,255,0.46)",
      },
    };
  }, [showSweepOverlay, sweepResult, sweepPoints, req, fovNm, sweepCustomTargetIndex, sweepIndexClamped, nonDoseStackSweepPoints]);
  const sweepRuler = useMemo(() => {
    if (!maskBounds || !activeSweepPoint?.metrics?.cd_nm) return null;
    const cd = Math.max(1, activeSweepPoint.metrics.cd_nm);
    const cx = (maskBounds.minX + maskBounds.maxX) * 0.5;
    const y = (maskBounds.minY + maskBounds.maxY) * 0.5;
    const yNm = fovNm - y;
    return { x0: cx - cd * 0.5, x1: cx + cd * 0.5, y, cd, yNm };
  }, [maskBounds, activeSweepPoint?.metrics?.cd_nm, fovNm]);

  useEffect(() => {
    setSweepPointIndex((idx) => Math.max(0, Math.min(idx, Math.max(0, sweepPoints.length - 1))));
  }, [sweepPoints.length]);

  useEffect(() => {
    if (!sweepResult) {
      setShowSweepOverlay(true);
      setSweepStackAll(true);
      return;
    }
    if (sweepResult.param !== "dose") setSweepStackAll(false);
  }, [sweepResult?.param, !!sweepResult]);
  const sweepContourSets3d = useMemo(() => {
    if (!showSweepOverlay || !sweepResult) return [] as Array<{
      contours: Array<{ points_nm: Array<{ x: number; y: number }> }>;
      color: string;
      opacity: number;
      dash?: [number, number];
      underColor?: string;
      baseZ?: number;
      plane?: "silicon" | "mask";
    }>;
    const sets: Array<{
      contours: Array<{ points_nm: Array<{ x: number; y: number }> }>;
      color: string;
      opacity: number;
      dash?: [number, number];
      underColor?: string;
      baseZ?: number;
      plane?: "silicon" | "mask";
    }> = [];
    if (sweepResult.param === "dose") {
      if (stackedDoseSweepPoints.length > 1) {
        const n = Math.max(1, stackedDoseSweepPoints.length - 1);
        stackedDoseSweepPoints.forEach((p, idx) => {
          const t = idx / n;
          const hue = 210 - t * 120;
          sets.push({
            contours: p.contours_nm ?? [],
            color: `hsla(${hue.toFixed(1)}, 86%, 72%, 0.58)`,
            opacity: 0.32,
            underColor: "rgba(184,208,236,0.34)",
            baseZ: -0.0188,
            plane: "silicon",
          });
        });
      }
      if (activeSweepContours.length) {
        sets.push({
          contours: activeSweepContours,
          color: "rgba(255,176,74,0.96)",
          opacity: 0.95,
          underColor: "rgba(255,225,168,0.5)",
          baseZ: -0.018,
          plane: "silicon",
        });
      }
      return sets;
    }
    if (sweepStackAll) {
      sweepMaskOverlay.stacked.forEach((set) => {
        if (!set.contours.length) return;
        sets.push({
          contours: set.contours,
          color: set.color,
          opacity: 0.5,
          dash: set.dash,
          underColor: set.underColor,
          baseZ: 0.442,
          plane: "mask",
        });
      });
      nonDoseStackContourSets.forEach((set) => {
        sets.push({
          contours: set.contours,
          color: set.color,
          opacity: 0.56,
          underColor: set.underColor,
          baseZ: -0.0188,
          plane: "silicon",
        });
      });
    }
    if (sweepMaskOverlay.active?.contours.length) {
      sets.push({
        contours: sweepMaskOverlay.active.contours,
        color: sweepMaskOverlay.active.color,
        opacity: 0.92,
        dash: sweepMaskOverlay.active.dash,
        underColor: sweepMaskOverlay.active.underColor,
        baseZ: 0.444,
        plane: "mask",
      });
    }
    if (activeSweepContours.length) {
      sets.push({
        contours: activeSweepContours,
        color: "rgba(255,176,74,0.96)",
        opacity: 0.95,
        underColor: "rgba(255,225,168,0.5)",
        baseZ: -0.018,
        plane: "silicon",
      });
    }
    return sets;
  }, [showSweepOverlay, sweepResult, stackedDoseSweepPoints, activeSweepContours, sweepMaskOverlay, sweepStackAll, nonDoseStackContourSets]);

  async function guardExportQuota(kind: "figure_png" | "figure_svg" | "runs_csv"): Promise<boolean> {
    trackProductEvent("export_attempted", { kind, plan: req.plan });
    try {
      const consumed = await consumeUsage(req.plan, "exports", 1, false);
      onUsageConsumed?.();
      if (!consumed.allowed || consumed.granted < 1) {
        const reason = consumed.reason ?? "Daily export quota exceeded.";
        trackProductEvent("export_blocked_quota", { kind, reason });
        trackProductEvent("usage_quota_exhausted", { op: "exports", reason });
        window.alert(reason);
        return false;
      }
      return true;
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Failed to verify export quota.";
      trackProductEvent("export_blocked_quota", { kind, reason });
      if (reason.toLowerCase().includes("quota")) {
        trackProductEvent("usage_quota_exhausted", { op: "exports", reason });
      }
      window.alert(reason);
      return false;
    }
  }

  async function onExportPng() {
    if (!svgRef.current) return;
    if (!(await guardExportQuota("figure_png"))) return;
    await exportPngWithMeta(svgRef.current, req, sim, {
      legend: showLegend,
      mainContour: effectiveShowMainContour,
      aerial: showAerial,
      rulers: showRulers,
      compare: compareActive,
      scalePct: scale * 100,
    }, exportSweep);
    trackProductEvent("export_completed", { kind: "figure_png", plan: req.plan });
  }

  async function onExportSvg() {
    if (!svgRef.current) return;
    if (!(await guardExportQuota("figure_svg"))) return;
    exportSvgWithMeta(svgRef.current, req, sim, {
      legend: showLegend,
      mainContour: effectiveShowMainContour,
      aerial: showAerial,
      rulers: showRulers,
      compare: compareActive,
      scalePct: scale * 100,
    }, exportSweep);
    trackProductEvent("export_completed", { kind: "figure_svg", plan: req.plan });
  }

  async function onExportCsv() {
    if (!(await guardExportQuota("runs_csv"))) return;
    exportRunsCsv(exportRuns);
    trackProductEvent("export_completed", { kind: "runs_csv", plan: req.plan });
  }

  function setSurfaceFastMode() {
    if (surfaceQualityTimerRef.current !== null) {
      window.clearTimeout(surfaceQualityTimerRef.current);
      surfaceQualityTimerRef.current = null;
    }
    setSurfaceQuality("FAST");
  }

  function scheduleSurfaceFullMode(delayMs: number = 120) {
    if (surfaceQualityTimerRef.current !== null) {
      window.clearTimeout(surfaceQualityTimerRef.current);
    }
    surfaceQualityTimerRef.current = window.setTimeout(() => {
      setSurfaceQuality("FULL");
      surfaceQualityTimerRef.current = null;
    }, delayMs);
  }

  useEffect(() => {
    return () => {
      if (surfaceQualityTimerRef.current !== null) {
        window.clearTimeout(surfaceQualityTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (compareActive) setCompareContourMode("AB_ONLY");
  }, [compareActive]);

  useEffect(() => {
    const intensity = sim?.intensity;
    if (!intensity) {
      setHeatmapUrl(null);
      return;
    }

    const { w, h, data, vmin, vmax } = intensity;
    if (!w || !h || data.length !== w * h) return;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = ctx.createImageData(w, h);
    const span = Math.max(vmax - vmin, 1e-9);

    for (let i = 0; i < data.length; i++) {
      const tRaw = (data[i] - vmin) / span;
      const t = Math.max(0, Math.min(1, tRaw));
      const { r, g, b } = appleColorMap(t);
      const j = i * 4;
      img.data[j] = r;
      img.data[j + 1] = g;
      img.data[j + 2] = b;
      const tCut = Math.max(0, (t - 0.08) / 0.92);
      const alpha = Math.round(Math.pow(tCut, 1.8) * 220);
      img.data[j + 3] = alpha;
    }

    ctx.putImageData(img, 0, 0);
    setHeatmapUrl(canvas.toDataURL("image/png"));
  }, [sim?.intensity]);

  useEffect(() => {
    const canvas = surfaceCanvasRef.current;
    const intensity = sim?.intensity;
    if (!canvas || !intensity || req.plan !== "PRO" || !showSurface3d) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSurface3D(ctx, cssW, cssH, intensity.w, intensity.h, intensity.data, {
      azimuthDeg: surfAzimuth,
      elevationDeg: surfElevation,
      rollDeg: surfRoll,
      offsetX: surfOffsetX,
      offsetY: surfOffsetY,
      offsetZ: surfOffsetZ,
      depthScale: surfDepth,
      zoomScale: scale,
      qualityMode: surfaceQuality,
      fovNm,
      maskAddRects,
      maskSubtractRects,
      overlayAddRects,
      finalMaskContours,
      contours: sim?.contours_nm ?? [],
      targetContours,
      showTargetOverlay,
      compareActive,
      compareAContours: compareAContours ?? [],
      compareBContours: compareBContours ?? [],
      sweepContourSets: sweepContourSets3d,
      showMainContour: effectiveShowMainContour,
      showAerial,
      maskOpacityPreset,
      nmPerPixel: sim?.nm_per_pixel ?? (fovNm / Math.max(1, intensity.w)),
    });
  }, [sim?.intensity, sim?.contours_nm, surfAzimuth, surfElevation, surfRoll, surfOffsetX, surfOffsetY, surfOffsetZ, surfDepth, scale, surfaceQuality, req.plan, showSurface3d, fovNm, compareActive, compareAContours, compareBContours, sweepContourSets3d, effectiveShowMainContour, showAerial, maskOpacityPreset, maskAddRects, maskSubtractRects, overlayAddRects, finalMaskContours, targetContours, showTargetOverlay]);

  useEffect(() => {
    const contours = sim?.contours_nm;
    const nmPerPixel = sim?.nm_per_pixel ?? (fovNm / 1024);
    if (!contours?.length) return;
    const key = `${contours.length}:${contours.reduce((s, c) => s + (c.points_nm?.length ?? 0), 0)}:${nmPerPixel.toFixed(4)}:${templateId}:${paramsSignature}`;
    if (contourDebugKeyRef.current === key) return;
    contourDebugKeyRef.current = key;

    const jumps: number[] = [];
    for (const c of contours) {
      const pts = c.points_nm ?? [];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
        jumps.push(Math.hypot(b.x - a.x, b.y - a.y));
      }
    }
    if (!jumps.length) return;
    const hist = buildJumpHistogram(jumps, 18);
    const cutoff = inferAdaptiveJumpCutoff(jumps, nmPerPixel, fovNm);
    console.groupCollapsed(
      `[ContourDebug] jumps: n=${jumps.length}, cutoff=${Number.isFinite(cutoff) ? cutoff.toFixed(2) : "none"} nm, nm/px=${nmPerPixel.toFixed(3)}`
    );
    console.table(hist);
    console.groupEnd();
  }, [sim?.contours_nm, sim?.nm_per_pixel, fovNm, templateId, paramsSignature]);

  useEffect(() => {
    if (!maskBounds) return;
    const cx = (maskBounds.minX + maskBounds.maxX) * 0.5;
    const cy = (maskBounds.minY + maskBounds.maxY) * 0.5;
    const nextScale = clampScale(calcFitScale(maskBounds, fovNm));
    setScale(nextScale);
    setTx(fovNm * 0.5 - cx * nextScale);
    setTy(fovNm * 0.5 - cy * nextScale);
  }, [fovNm, templateId, paramsSignature, maskBounds?.minX, maskBounds?.minY, maskBounds?.maxX, maskBounds?.maxY]);

  useEffect(() => {
    maskRulerRef.current = maskRuler;
  }, [maskRuler]);

  useEffect(() => {
    contourRulerRef.current = contourRuler;
  }, [contourRuler]);

  useEffect(() => {
    if (!maskBounds) return;
    const cx = (maskBounds.minX + maskBounds.maxX) * 0.5;
    const maskW = Math.max(1, maskCdNm);
    const yMid = (maskBounds.minY + maskBounds.maxY) * 0.5;
    const nextMaskBase = maskRulerRef.current
      ? normalizeRuler(maskRulerRef.current, fovNm)
      : { x0: cx - maskW * 0.5, x1: cx + maskW * 0.5, y: yMid };
    const nextMask = snapRulerToRectEdges(nextMaskBase, maskRects, fovNm, rulerAxis);
    setMaskRuler(nextMask);

    const hasContour = !!sim?.contours_nm?.length;
    if (hasContour) {
      const contourW = Math.max(1, contourCdNm ?? maskCdNm);
      const nextContourBase = contourRulerRef.current
        ? normalizeRuler(contourRulerRef.current, fovNm)
        : { x0: cx - contourW * 0.5, x1: cx + contourW * 0.5, y: nextMask.y };
      const nextContour = snapRulerToContourEdges(nextContourBase, sim.contours_nm ?? [], fovNm, rulerAxis, maskRects);
      setContourRuler(nextContour);
    } else {
      setContourRuler(null);
    }
  }, [maskBounds, maskCdNm, contourCdNm, sim?.contours_nm, maskRects, fovNm, rulerAxis]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!selectedRuler) return;
      const base = selectedRuler === "mask" ? maskRuler : contourRuler;
      if (!base) return;
      const step = e.shiftKey ? 10 : 1;
      const width = Math.max(1, Math.abs(base.x1 - base.x0));
      const centerX = (base.x0 + base.x1) * 0.5;
      const y = base.y;

      const hasCustomSelection = req.mask.mode === "CUSTOM" && (
        selectedCustomShapeIndexes.length > 0 || selectedCustomShapeIndex >= 0
      );
      if (hasCustomSelection && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "[", "]", "{", "}"].includes(e.key)) {
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (rulerAxis === "H") {
          applyRuler(selectedRuler, { x0: centerX - width * 0.5 - step, x1: centerX + width * 0.5 - step, y });
        } else {
          applyRuler(selectedRuler, { ...base, y: y - step });
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (rulerAxis === "H") {
          applyRuler(selectedRuler, { x0: centerX - width * 0.5 + step, x1: centerX + width * 0.5 + step, y });
        } else {
          applyRuler(selectedRuler, { ...base, y: y + step });
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (rulerAxis === "H") {
          applyRuler(selectedRuler, { ...base, y: y - step });
        } else {
          applyRuler(selectedRuler, { x0: centerX - width * 0.5 - step, x1: centerX + width * 0.5 - step, y });
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (rulerAxis === "H") {
          applyRuler(selectedRuler, { ...base, y: y + step });
        } else {
          applyRuler(selectedRuler, { x0: centerX - width * 0.5 + step, x1: centerX + width * 0.5 + step, y });
        }
      } else if (e.key === "[" || e.key === "{") {
        e.preventDefault();
        const w = Math.max(1, width - step);
        applyRuler(selectedRuler, { x0: centerX - w * 0.5, x1: centerX + w * 0.5, y });
      } else if (e.key === "]" || e.key === "}") {
        e.preventDefault();
        const w = width + step;
        applyRuler(selectedRuler, { x0: centerX - w * 0.5, x1: centerX + w * 0.5, y });
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (snapMode !== "OFF") maybeSnapRuler(selectedRuler, false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedRuler, maskRuler, contourRuler, fovNm, req.mask.mode, selectedCustomShapeIndex, selectedCustomShapeIndexes, rulerAxis]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!onEditableShapesChange) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      const shapes = editableShapes;
      const activeIndexes = selectedCustomShapeIndexes.length
        ? selectedCustomShapeIndexes
        : (selectedCustomShapeIndex >= 0 ? [selectedCustomShapeIndex] : []);
      if (!activeIndexes.length) return;

      const step = e.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        dx = -step;
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        dx = step;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        dy = step;
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        dy = -step;
      } else {
        return;
      }
      const set = new Set(activeIndexes);
      onEditableShapesChange(
        shapes.map((s, i) => {
          if (!set.has(i) || s.type !== "rect") return s;
          return clampRectToFov({ ...s, x_nm: s.x_nm + dx, y_nm: s.y_nm + dy }, fovNm);
        })
      );
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedRuler, editableShapes, selectedCustomShapeIndex, selectedCustomShapeIndexes, onEditableShapesChange, fovNm]);

  function clampScale(v: number) {
    const safe = Number.isFinite(v) ? v : 1;
    return Math.max(0.15, Math.min(16, safe));
  }

  function centerViewToMask() {
    if (!maskBounds) {
      setScale(1);
      setTx(0);
      setTy(0);
      return;
    }
    const cx = (maskBounds.minX + maskBounds.maxX) * 0.5;
    const cy = (maskBounds.minY + maskBounds.maxY) * 0.5;
    const nextScale = clampScale(calcFitScale(maskBounds, fovNm));
    setScale(nextScale);
    setTx(fovNm * 0.5 - cx * nextScale);
    setTy(fovNm * 0.5 - cy * nextScale);
  }

  function pointerToSvgUnits(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: fovNm / 2, y: fovNm / 2 };
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * fovNm;
    const y = ((clientY - rect.top) / rect.height) * fovNm;
    return { x, y };
  }

  function pointerToWorldUnits(clientX: number, clientY: number) {
    const p = pointerToSvgUnits(clientX, clientY);
    const safeScale = Math.max(1e-9, scale);
    return {
      x: (p.x - tx) / safeScale,
      y: (p.y - ty) / safeScale,
    };
  }

  function pointerToMaskNm(clientX: number, clientY: number) {
    const p = pointerToWorldUnits(clientX, clientY);
    return { x_nm: p.x, y_nm: fovNm - p.y };
  }

  function zoomAt(nextScaleRaw: number, cx: number, cy: number) {
    const nextScale = clampScale(nextScaleRaw);
    const safeScale = clampScale(scale);
    if (nextScale === safeScale) return;
    const ratio = nextScale / safeScale;
    setTx(cx - (cx - tx) * ratio);
    setTy(cy - (cy - ty) * ratio);
    setScale(nextScale);
  }

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const p = pointerToSvgUnits(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomAt(scale * factor, p.x, p.y);
  }

  function onMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (rulerDragRef.current || customShapeDragRef.current || customRectResizeRef.current) return;
    if ((editorTool === "DRAW_ADD_RECT" || editorTool === "DRAW_SUBTRACT_RECT") && onAddCustomRectFromDrag) {
      const p = pointerToMaskNm(e.clientX, e.clientY);
      customRectCreateRef.current = { x: p.x_nm, y: p.y_nm };
      setCustomRectDraft({ x_nm: p.x_nm, y_nm: p.y_nm, w_nm: 1, h_nm: 1 });
      setDragging(true);
      return;
    }
    if (editorTool === "PLACE_SRAF" && onPlaceSrafAtPoint) {
      const p = pointerToMaskNm(e.clientX, e.clientY);
      onPlaceSrafAtPoint(p);
      return;
    }
    const p = pointerToSvgUnits(e.clientX, e.clientY);
    dragStart.current = { x: p.x, y: p.y, tx, ty };
    setDragging(true);
  }

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (editorTool === "PLACE_SRAF") {
      const p = pointerToSvgUnits(e.clientX, e.clientY);
      const clamped = {
        x: clampNm(p.x, fovNm),
        y: clampNm(p.y, fovNm),
      };
      setSrafHintPoint(clamped);
    }
    if (customRectCreateRef.current) {
      const p = pointerToMaskNm(e.clientX, e.clientY);
      const s = customRectCreateRef.current;
      const x_nm = Math.min(s.x, p.x_nm);
      const y_nm = Math.min(s.y, p.y_nm);
      const w_nm = Math.max(1, Math.abs(p.x_nm - s.x));
      const h_nm = Math.max(1, Math.abs(p.y_nm - s.y));
      setCustomRectDraft({ x_nm, y_nm, w_nm, h_nm });
      return;
    }
    if (customRectResizeRef.current && onEditableShapesChange) {
      const p = pointerToMaskNm(e.clientX, e.clientY);
      const d = customRectResizeRef.current;
      const next = d.startShapes.map((s, i) => {
        if (i !== d.index || s.type !== "rect") return s;
        return resizeRectFromCorner(s, d.corner, p.x_nm, p.y_nm, fovNm);
      });
      onEditableShapesChange(next);
      return;
    }
    if (customShapeDragRef.current && onEditableShapesChange) {
      const p = pointerToMaskNm(e.clientX, e.clientY);
      const d = customShapeDragRef.current;
      const dx = p.x_nm - d.x;
      const dy = p.y_nm - d.y;
      const activeSet = new Set(d.indexes);
      const next = d.startShapes.map((s, i) => {
        if (!activeSet.has(i)) return s;
        const moved = translateMaskShape(s, dx, dy);
        if (moved.type === "rect") return clampRectToFov(moved, fovNm);
        return moved;
      });
      onEditableShapesChange(next);
      return;
    }
    if (rulerDragRef.current) {
      const p = pointerToWorldUnits(e.clientX, e.clientY);
      const d = rulerDragRef.current;
      const dx = p.x - d.x;
      const dy = p.y - d.y;
      if (d.target.startsWith("mask") && maskRuler) {
        const base = d.start;
        if (rulerAxis === "H") {
          if (d.target === "mask-start") setMaskRuler({ ...maskRuler, x0: clampNm(base.x0 + dx, fovNm) });
          else if (d.target === "mask-end") setMaskRuler({ ...maskRuler, x1: clampNm(base.x1 + dx, fovNm) });
          else setMaskRuler({ x0: clampNm(base.x0 + dx, fovNm), x1: clampNm(base.x1 + dx, fovNm), y: clampNm(base.y + dy, fovNm) });
        } else {
          if (d.target === "mask-start") setMaskRuler({ ...maskRuler, x0: clampNm(base.x0 + dy, fovNm) });
          else if (d.target === "mask-end") setMaskRuler({ ...maskRuler, x1: clampNm(base.x1 + dy, fovNm) });
          else setMaskRuler({ x0: clampNm(base.x0 + dy, fovNm), x1: clampNm(base.x1 + dy, fovNm), y: clampNm(base.y + dx, fovNm) });
        }
      } else if (d.target.startsWith("contour") && contourRuler) {
        const base = d.start;
        if (rulerAxis === "H") {
          if (d.target === "contour-start") setContourRuler({ ...contourRuler, x0: clampNm(base.x0 + dx, fovNm) });
          else if (d.target === "contour-end") setContourRuler({ ...contourRuler, x1: clampNm(base.x1 + dx, fovNm) });
          else setContourRuler({ x0: clampNm(base.x0 + dx, fovNm), x1: clampNm(base.x1 + dx, fovNm), y: clampNm(base.y + dy, fovNm) });
        } else {
          if (d.target === "contour-start") setContourRuler({ ...contourRuler, x0: clampNm(base.x0 + dy, fovNm) });
          else if (d.target === "contour-end") setContourRuler({ ...contourRuler, x1: clampNm(base.x1 + dy, fovNm) });
          else setContourRuler({ x0: clampNm(base.x0 + dy, fovNm), x1: clampNm(base.x1 + dy, fovNm), y: clampNm(base.y + dx, fovNm) });
        }
      }
      return;
    }
    if (!dragStart.current) return;
    const p = pointerToSvgUnits(e.clientX, e.clientY);
    setTx(dragStart.current.tx + (p.x - dragStart.current.x));
    setTy(dragStart.current.ty + (p.y - dragStart.current.y));
  }

  function applyRuler(which: RulerKey, next: { x0: number; x1: number; y: number }) {
    const normalized = normalizeRuler(next, fovNm);
    if (which === "mask") setMaskRuler(normalized);
    else setContourRuler(normalized);
  }

  function maybeSnapRuler(which: RulerKey, forceAuto: boolean) {
    const mode = forceAuto ? "AUTO" : snapMode;
    const base = which === "mask" ? maskRuler : contourRuler;
    if (!base) return;
    let snapped = base;
    if (mode === "MASK" || (mode === "AUTO" && which === "mask")) {
      snapped = snapRulerToRectEdges(base, maskRects, fovNm, rulerAxis);
    } else if (mode === "CONTOUR" || (mode === "AUTO" && which === "contour")) {
      if (sim?.contours_nm?.length) snapped = snapRulerToContourEdges(base, sim.contours_nm, fovNm, rulerAxis, maskRects);
    } else if (mode === "AUTO" && which === "contour" && sim?.contours_nm?.length) {
      snapped = snapRulerToContourEdges(base, sim.contours_nm, fovNm, rulerAxis, maskRects);
    }
    applyRuler(which, snapped);
  }

  function onMouseUp(e?: React.MouseEvent<SVGSVGElement>) {
    if (customRectCreateRef.current && customRectDraft && onAddCustomRectFromDrag) {
      if (customRectDraft.w_nm >= 1 && customRectDraft.h_nm >= 1) {
        onAddCustomRectFromDrag(customRectDraft);
      }
      customRectCreateRef.current = null;
      setCustomRectDraft(null);
    }
    const d = rulerDragRef.current;
    if (d) {
      const forceAuto = !!e?.shiftKey;
      if (d.target.startsWith("mask") && maskRuler && (snapMode !== "OFF" || forceAuto)) maybeSnapRuler("mask", forceAuto);
      else if (d.target.startsWith("contour") && contourRuler && (snapMode !== "OFF" || forceAuto)) maybeSnapRuler("contour", forceAuto);
    }
    rulerDragRef.current = null;
    customShapeDragRef.current = null;
    customRectResizeRef.current = null;
    dragStart.current = null;
    setDragging(false);
  }

  function renderSweepStatusLine(panel: "2d" | "3d") {
    if (!sweepResult || sweepPoints.length === 0 || !showSweepOverlay || !activeSweepPoint) return null;
    const prefix = panel === "3d" ? "3D" : "2D";
    return (
      <div className={`sweep-inline-status ${panel === "3d" ? "sweep-inline-status-3d" : ""} ${panel === "2d" && overlayPanelsVisible ? "sweep-inline-status-has-overlay" : ""}`}>
        {prefix} · {sweepResult.param} {activeSweepPoint.value.toFixed(3)} · {sweepIndexClamped + 1}/{sweepPoints.length}
        {activeSweepPoint.metrics.cd_nm == null ? "" : ` · CD ${activeSweepPoint.metrics.cd_nm.toFixed(1)} nm`}
      </div>
    );
  }

  const twoDPanelHeight = panelLayoutMode === "overlay"
    ? "100dvh"
    : "calc(100dvh - 24px)";
  const allowSurfacePanel = req.plan === "PRO" && showSurfacePanel;
  const surfacePanelVisible = allowSurfacePanel && showSurface3d;
  const canSwapSurfaceMain = surfacePanelVisible;
  const surfaceAsBackground = canSwapSurfaceMain && surfaceSwapMain;
  const hasEditDock = Boolean(editDock);
  const editDockVisible = hasEditDock && showEditDockPanel;
  const bothRightPanelsVisible = surfacePanelVisible && editDockVisible;
  const surfacePanelHeight = panelLayoutMode === "overlay"
    ? (bothRightPanelsVisible ? "clamp(248px, 32vh, 392px)" : "clamp(320px, 44vh, 560px)")
    : (bothRightPanelsVisible ? "clamp(238px, 30vh, 352px)" : "clamp(272px, 35vh, 430px)");
  const rightRailOccupied = editDockVisible || surfacePanelVisible;
  const rightRailCollapsed = !rightRailOccupied;
  const sideSurfaceOverlay = panelLayoutMode === "side" && surfacePanelVisible && !editDockVisible;
  const useOverlayRail = panelLayoutMode === "overlay" || sideSurfaceOverlay;
  const workspaceHasRightRail = panelLayoutMode === "side" && rightRailOccupied && !sideSurfaceOverlay;
  const overlayPanelsVisible = useOverlayRail && rightRailOccupied;
  const overlayPanelsMounted = useOverlayRail && rightRailOccupied;
  const isCanvasLayout = panelLayoutMode === "overlay";
  const sideRailWidth = "342px";
  const overlayRailWidth = sideRailWidth;
  const viewInvZoom = 1 / Math.max(0.25, Math.min(16, scale || 1));
  const overlayRailGap = overlayPanelsVisible ? "20px" : "10px";
  const overlayRailInset = overlayPanelsVisible ? `calc(${overlayRailWidth} + ${overlayRailGap})` : overlayRailGap;
  const mainCanvasLeftInset = `calc(10px + ${isCanvasLayout ? canvasLeftInset : 0}px)`;
  const canvasCommandRight = overlayRailInset;

  useEffect(() => {
    if (!canSwapSurfaceMain && surfaceSwapMain) setSurfaceSwapMain(false);
  }, [canSwapSurfaceMain, surfaceSwapMain]);

  useEffect(() => {
    if (!surfacePanelVisible && showSurfaceControls) setShowSurfaceControls(false);
  }, [surfacePanelVisible, showSurfaceControls]);

  useEffect(() => {
    if (!isCanvasLayout) return;
    const node = canvasCommandRef.current;
    if (!node) return;

    const syncHeight = () => {
      const next = Math.max(52, Math.ceil(node.getBoundingClientRect().height));
      setCanvasCommandHeight((prev) => (Math.abs(prev - next) < 1 ? prev : next));
    };

    syncHeight();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => syncHeight());
      observer.observe(node);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", syncHeight);
    return () => window.removeEventListener("resize", syncHeight);
  }, [isCanvasLayout]);

  const renderSurfacePanel = (slot: "rail" | "main") => {
    const isMainSurface = slot === "main";
    const panelTop = isMainSurface ? Math.max(12, canvasCommandHeight + 8) : 10;
    return (
      <div
        className="viewport-panel-shell viewport-panel-shell-3d"
        style={{
          position: isMainSurface ? "absolute" : "relative",
          inset: isMainSurface ? -1 : undefined,
          border: "none",
          borderRadius: isMainSurface ? 0 : 16,
          background: "transparent",
          boxShadow: "none",
          overflow: "hidden",
          height: isMainSurface ? twoDPanelHeight : surfacePanelHeight,
          display: "flex",
          flexDirection: "column",
          isolation: "isolate",
          zIndex: isMainSurface ? 2 : 1,
          ["--canvas-left-inset" as any]: `${panelLayoutMode === "overlay" ? canvasLeftInset : 0}px`,
        }}
      >
        {isMainSurface && (
          <div ref={canvasCommandRef} className={`canvas-command-strip ${overlayPanelsVisible ? "has-overlay-rail" : ""}`} style={{ right: canvasCommandRight }}>
            <div className="canvas-command-primary">
              <div className="canvas-command-logo" aria-label="litopc">
                <span className="canvas-command-logo-lit">lit</span>
                <span className="canvas-command-logo-opc">opc</span>
              </div>
              {canvasModeHud}
              {canvasToolbar}
            </div>
          </div>
        )}
        {canSwapSurfaceMain && (
          <div className="panel-corner-actions" style={isMainSurface ? { top: panelTop + 2 } : undefined}>
            <button
              type="button"
              className={`panel-mini-toggle ${surfaceAsBackground ? "is-active" : ""}`}
              onClick={() => setSurfaceSwapMain((v) => !v)}
              title={surfaceAsBackground ? "Swap back to 3D mini" : "Swap 3D to main"}
              aria-label={surfaceAsBackground ? "Swap back to 3D mini" : "Swap 3D to main"}
            >
              2D↔3D
            </button>
          </div>
        )}
        {!isMainSurface && surfacePanelVisible && (
          <div className="panel-corner-actions panel-corner-actions-bottom-left">
            <button
              type="button"
              className={`panel-mini-control ${showSurfaceControls ? "is-active" : ""}`}
              onClick={() => setShowSurfaceControls((v) => !v)}
              title={showSurfaceControls ? "Hide 3D control" : "Show 3D control"}
              aria-label={showSurfaceControls ? "Hide 3D control" : "Show 3D control"}
            >
              <ToolbarIcon kind="cube" />
              3D Ctrl
            </button>
          </div>
        )}
        {!isMainSurface && renderSweepStatusLine("3d")}
        <div style={{ padding: 0, flex: 1, minHeight: 0, position: "relative", zIndex: 1 }}>
          <canvas
            ref={surfaceCanvasRef}
            style={{
              width: isMainSurface ? "calc(100% + 2px)" : "100%",
              height: isMainSurface ? "calc(100% + 2px)" : "100%",
              marginLeft: isMainSurface ? -1 : 0,
              marginTop: isMainSurface ? -1 : 0,
              border: isMainSurface ? "none" : "1px solid rgba(96,108,132,0.4)",
              borderRadius: isMainSurface ? 0 : 16,
              background:
                "radial-gradient(168% 158% at 18% 2%, #334763 0%, #25364e 40%, #172538 78%, #121c2b 100%)",
              boxShadow: isMainSurface
                ? "none"
                : "inset 0 1px 0 rgba(244,248,255,0.18), inset 0 -34px 72px rgba(4,10,22,0.46), 0 10px 20px rgba(20,30,46,0.22)",
              cursor: "grab",
            }}
            onMouseDown={(e) => {
              if (e.shiftKey) {
                surfaceDragRef.current = { mode: "pan", x: e.clientX, y: e.clientY, ox: surfOffsetX, oy: surfOffsetY };
              } else {
                surfaceDragRef.current = { mode: "rotate", x: e.clientX, y: e.clientY, az: surfAzimuth, el: surfElevation };
              }
              setSurfaceFastMode();
            }}
            onMouseMove={(e) => {
              if (!surfaceDragRef.current) return;
              const d = surfaceDragRef.current;
              const dx = e.clientX - d.x;
              const dy = e.clientY - d.y;
              if (d.mode === "rotate") {
                setSurfAzimuth(Math.max(-160, Math.min(160, d.az + dx * 0.3)));
                setSurfElevation(Math.max(-12, Math.min(85, d.el + dy * 0.22)));
              } else {
                setSurfOffsetX(Math.max(-1, Math.min(1, d.ox + dx / 240)));
                setSurfOffsetY(Math.max(-1, Math.min(1, d.oy + dy / 240)));
              }
              setSurfaceFastMode();
            }}
            onMouseUp={() => {
              surfaceDragRef.current = null;
              scheduleSurfaceFullMode(120);
            }}
            onMouseLeave={() => {
              surfaceDragRef.current = null;
              scheduleSurfaceFullMode(120);
            }}
          />
          {!sim?.intensity && (
            <div className="small-note" style={{ marginTop: 6 }}>
              Run simulation to generate 3D aerial surface.
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderRightRailPanels = () => (
    <div
      className={`viewport-side-stack ${useOverlayRail ? "viewport-side-stack-overlay" : ""} ${editDockVisible && !surfacePanelVisible ? "viewport-side-stack-edit-only" : ""} ${useOverlayRail && editDockVisible && !surfacePanelVisible ? "viewport-side-stack-overlay-edit-only" : ""} ${!editDockVisible && surfacePanelVisible ? "viewport-side-stack-no-edit" : ""} ${rightRailCollapsed ? "is-hidden" : ""}`}
      style={useOverlayRail ? { width: rightRailCollapsed ? "0px" : overlayRailWidth, minWidth: rightRailCollapsed ? "0px" : overlayRailWidth, maxWidth: rightRailCollapsed ? "0px" : overlayRailWidth } : { width: rightRailCollapsed ? "0px" : sideRailWidth, minWidth: rightRailCollapsed ? "0px" : sideRailWidth, maxWidth: rightRailCollapsed ? "0px" : sideRailWidth }}
    >
      {surfacePanelVisible && !surfaceAsBackground && renderSurfacePanel("rail")}
      {surfaceAsBackground && (
        <div style={{ height: surfacePanelHeight, pointerEvents: "none" }} />
      )}
      {hasEditDock && (
        <div className={`viewport-edit-slot ${editDockVisible ? "" : "is-hidden"}`}>
          {editDock}
        </div>
      )}
      {!surfaceAsBackground && showSurfaceControls && surfacePanelVisible && (
        <div className="surface-controls-overlay-rail">
          <div className="surface-controls surface-controls-compact">
            <div className="surface-controls-title surface-controls-title-compact">
              <span className="surface-controls-title-icon"><ToolbarIcon kind="cube" /></span>
              3D Control
            </div>
            <label className="surface-inline-item">
              <span className="surface-inline-label"><ToolbarIcon kind="azimuth" /> Az</span>
              <input
                type="range"
                min={-160}
                max={160}
                step={1}
                value={surfAzimuth}
                onChange={(e) => setSurfAzimuth(Number(e.target.value))}
              />
            </label>
            <label className="surface-inline-item">
              <span className="surface-inline-label"><ToolbarIcon kind="elevation" /> El</span>
              <input
                type="range"
                min={-12}
                max={85}
                step={1}
                value={surfElevation}
                onChange={(e) => setSurfElevation(Number(e.target.value))}
              />
            </label>
            <label className="surface-inline-item">
              <span className="surface-inline-label"><ToolbarIcon kind="roll" /> Roll</span>
              <input
                type="range"
                min={-140}
                max={140}
                step={1}
                value={surfRoll}
                onChange={(e) => setSurfRoll(Number(e.target.value))}
              />
            </label>
            <label className="surface-inline-item">
              <span className="surface-inline-label"><ToolbarIcon kind="axisx" /> X</span>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={surfOffsetX}
                onChange={(e) => setSurfOffsetX(Number(e.target.value))}
              />
            </label>
            <label className="surface-inline-item">
              <span className="surface-inline-label"><ToolbarIcon kind="axisy" /> Y</span>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={surfOffsetY}
                onChange={(e) => setSurfOffsetY(Number(e.target.value))}
              />
            </label>
            <label className="surface-inline-item">
              <span className="surface-inline-label"><ToolbarIcon kind="axisz" /> Z</span>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={surfOffsetZ}
                onChange={(e) => setSurfOffsetZ(Number(e.target.value))}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );

  const contourRulerAvailable = Boolean(contourRuler || sim?.contours_nm?.length);
  const activeRulerMode: "MASK" | "CONTOUR" = selectedRuler === "contour" ? "CONTOUR" : "MASK";

  const applyRulerMode = (mode: "MASK" | "CONTOUR") => {
    if (mode === "MASK") {
      setSelectedRuler("mask");
      return;
    }
    if (!contourRulerAvailable) {
      setSelectedRuler("mask");
      return;
    }
    setSelectedRuler("contour");
  };

  const rulerKeyboardHelp = "Ruler keyboard\nArrow: move\n[ ]: resize span\nEnter: snap\nShift: coarse step (10nm)";

  const toggleRulerVisibilityFromView = () => {
    if (showRulers) {
      setShowRulers(false);
      setSelectedRuler(null);
      return;
    }
    setShowRulers(true);
    setSelectedRuler((prev) => (prev === "contour" && contourRulerAvailable ? "contour" : "mask"));
  };

  const rulerFloatingControl = showRulers ? (
    <div className={`ruler-floating-box ${overlayPanelsVisible ? "has-overlay-rail" : ""}`} style={{ left: mainCanvasLeftInset, right: "auto" }}>
      <div className="canvas-toolbar-group ruler-floating-group" aria-label="Ruler toolbox">
        <span className="ruler-floating-title"><ToolbarIcon kind="ruler" /> Ruler</span>
        <div className="ruler-floating-seg" role="group" aria-label="Ruler target">
          <button
            type="button"
            className={`toolbar-pill ruler-floating-pill ${activeRulerMode === "MASK" ? "is-active" : ""}`}
            onClick={() => applyRulerMode("MASK")}
            title="Mask"
            aria-label="Ruler mask"
          >
            Mask
          </button>
          <button
            type="button"
            className={`toolbar-pill ruler-floating-pill ${activeRulerMode === "CONTOUR" ? "is-active" : ""}`}
            onClick={() => applyRulerMode("CONTOUR")}
            title={contourRulerAvailable ? "Contour" : "Contour not available yet"}
            aria-label="Ruler contour"
            disabled={!contourRulerAvailable}
          >
            Contour
          </button>
        </div>
        <div className="ruler-floating-seg" role="group" aria-label="Ruler axis">
          <button
            type="button"
            className={`toolbar-pill ruler-floating-pill ruler-axis-pill ${rulerAxis === "H" ? "is-active" : ""}`}
            onClick={() => setRulerAxis("H")}
            title="Horizontal"
            aria-label="Horizontal ruler"
          >
            <span className="ruler-axis-glyph" aria-hidden="true">
              <svg viewBox="0 0 12 12">
                <path d="M1.6 6h8.8" />
                <path d="M3.3 4.3 1.6 6l1.7 1.7" />
                <path d="M8.7 4.3 10.4 6 8.7 7.7" />
              </svg>
            </span>
          </button>
          <button
            type="button"
            className={`toolbar-pill ruler-floating-pill ruler-axis-pill ${rulerAxis === "V" ? "is-active" : ""}`}
            onClick={() => setRulerAxis("V")}
            title="Vertical"
            aria-label="Vertical ruler"
          >
            <span className="ruler-axis-glyph" aria-hidden="true">
              <svg viewBox="0 0 12 12">
                <path d="M6 1.6v8.8" />
                <path d="M4.3 3.3 6 1.6l1.7 1.7" />
                <path d="M4.3 8.7 6 10.4l1.7-1.7" />
              </svg>
            </span>
          </button>
        </div>
        <span className="ruler-help-anchor" title={rulerKeyboardHelp} aria-label="Ruler keyboard help">?</span>
      </div>
    </div>
  ) : null;

  const canvasToolbar = (
    <div className="toolbar toolbar-compact canvas-toolbar-inline">
      <div className="canvas-toolbar-group">
        <button
          type="button"
          className="toolbar-pill canvas-icon-pill"
          title="Zoom In"
          aria-label="Zoom In"
          onClick={() => zoomAt(scale * 1.2, fovNm / 2, fovNm / 2)}
        >
          <ToolbarIcon kind="zoomin" />
        </button>
        <button
          type="button"
          className="toolbar-pill canvas-icon-pill"
          title="Zoom Out"
          aria-label="Zoom Out"
          onClick={() => zoomAt(scale / 1.2, fovNm / 2, fovNm / 2)}
        >
          <ToolbarIcon kind="zoomout" />
        </button>
        <button
          type="button"
          className="toolbar-pill canvas-icon-pill"
          title="Reset View"
          aria-label="Reset View"
          onClick={() => {
            centerViewToMask();
          }}
        >
          <ToolbarIcon kind="reset" />
        </button>
      </div>
      <div className="canvas-toolbar-group">
        <details className="view-menu view-menu-align-right">
          <summary className="toolbar-pill">
            <ToolbarIcon kind="view" /> View
          </summary>
          <div className="view-menu-panel view-menu-panel-minimal">
            <div className="view-chip-grid">
              <button type="button" className={`view-chip ${showLegend ? "on" : ""}`} onClick={() => setShowLegend((v) => !v)}>
                Legend
              </button>
              <button
                type="button"
                className={`view-chip ${(contourLockedByCompare ? false : showMainContour) ? "on" : ""}`}
                onClick={() => setShowMainContour((v) => !v)}
                disabled={contourLockedByCompare}
              >
                Contour
              </button>
              <button
                type="button"
                className={`view-chip ${targetGuide && showTargetOverlay ? "on" : ""}`}
                onClick={() => setShowTargetOverlay((v) => !v)}
                disabled={!targetGuide}
              >
                Target
              </button>
              <button type="button" className={`view-chip ${showAerial ? "on" : ""}`} onClick={() => setShowAerial((v) => !v)}>
                Aerial
              </button>
              <button type="button" className={`view-chip ${showRulers ? "on" : ""}`} onClick={toggleRulerVisibilityFromView}>
                Ruler
              </button>
              {allowSurfacePanel && (
                <button type="button" className={`view-chip ${showSurface3d ? "on" : ""}`} onClick={() => setShowSurface3d((v) => !v)}>
                  3D
                </button>
              )}
            </div>
            {contourLockedByCompare && (
              <div className="view-inline-note">Contour is locked by compare clean mode.</div>
            )}
            {compareActive && (
              <div className="view-compare-mode">
                <button
                  type="button"
                  className={`view-chip view-chip-wide ${compareContourMode === "AB_ONLY" ? "on" : ""}`}
                  onClick={() => setCompareContourMode((m) => (m === "AB_ONLY" ? "MIXED" : "AB_ONLY"))}
                >
                  Compare Clean Mode
                </button>
                <div className="view-compare-note">Hide main contour during A/B overlay.</div>
              </div>
            )}
          </div>
        </details>
        <details className="view-menu view-menu-align-right">
          <summary className="toolbar-pill">
            <ToolbarIcon kind="export" /> Export
          </summary>
          <div className="view-menu-panel view-menu-panel-minimal export-menu-panel">
            <button
              type="button"
              className="view-chip"
              disabled={!sim}
              onClick={(e) => {
                e.preventDefault();
                void onExportPng();
                const d = e.currentTarget.closest("details") as HTMLDetailsElement | null;
                if (d) d.open = false;
              }}
            >
              Figure PNG
            </button>
            <button
              type="button"
              className="view-chip"
              disabled={!sim}
              onClick={(e) => {
                e.preventDefault();
                void onExportSvg();
                const d = e.currentTarget.closest("details") as HTMLDetailsElement | null;
                if (d) d.open = false;
              }}
            >
              Figure SVG
            </button>
            <button
              type="button"
              className="view-chip view-chip-wide"
              disabled={exportRuns.length === 0}
              onClick={(e) => {
                e.preventDefault();
                void onExportCsv();
                const d = e.currentTarget.closest("details") as HTMLDetailsElement | null;
                if (d) d.open = false;
              }}
            >
              Runs CSV
            </button>
            {req.plan === "FREE" && (
              <>
                <button
                  type="button"
                  className="view-chip view-chip-wide"
                  disabled
                  title="Upgrade to Pro for high-resolution export."
                >
                  High-Res Export (Pro)
                </button>
                <div className="view-inline-note">
                  Free exports include watermark and standard resolution.
                </div>
              </>
            )}
          </div>
        </details>
      </div>
      {sweepResult && sweepPoints.length > 0 && (
        <details className="view-menu view-menu-align-right">
          <summary className="toolbar-pill">
            <ToolbarIcon kind="contour" /> Sweep View
          </summary>
          <div className="view-menu-panel view-menu-panel-minimal sweep-view-menu-panel">
            <div className="view-chip-grid sweep-view-grid">
              <button type="button" className={`view-chip ${showSweepOverlay ? "on" : ""}`} onClick={() => setShowSweepOverlay((v) => !v)}>
                Overlay
              </button>
              <button type="button" className={`view-chip ${sweepStackAll ? "on" : ""}`} onClick={() => setSweepStackAll((v) => !v)}>
                Stack All
              </button>
            </div>
            <label className="sweep-view-slider">
              <span className="sweep-view-slider-label">
                Focus point
                <b>{sweepIndexClamped + 1}/{sweepPoints.length}</b>
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(0, sweepPoints.length - 1)}
                step={1}
                value={sweepIndexClamped}
                onChange={(e) => setSweepPointIndex(Number(e.target.value))}
              />
            </label>
            {activeSweepPoint && (
              <div className="view-inline-note">
                {sweepResult.param}={activeSweepPoint.value.toFixed(3)}
                {activeSweepPoint.metrics.cd_nm == null ? "" : ` · CD ${activeSweepPoint.metrics.cd_nm.toFixed(1)} nm`}
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );

  return (
    <div className={`viewport-frame ${panelLayoutMode === "overlay" ? "viewport-frame-focus" : ""}`} style={{ display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
      <div
        className="viewport-panels-grid"
        style={{
          gridTemplateColumns: workspaceHasRightRail
            ? (isCanvasLayout ? "minmax(0, 1fr) minmax(360px, 34%)" : `minmax(0, 1fr) ${sideRailWidth}`)
            : "minmax(0, 1fr)",
          gap: isCanvasLayout ? 0 : 8,
          padding: isCanvasLayout ? "0" : "4px 6px 0",
          ["--viewport-main-height" as any]: twoDPanelHeight,
          ["--overlay-rail-width" as any]: overlayRailWidth,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: isCanvasLayout ? 0 : 8, minWidth: 0, position: "relative", height: twoDPanelHeight }}>
          {surfaceAsBackground && renderSurfacePanel("main")}
          <div
            className="viewport-panel-shell viewport-panel-shell-2d"
            style={{
              position: surfaceAsBackground ? "absolute" : "relative",
              top: surfaceAsBackground ? 14 : undefined,
              right: surfaceAsBackground ? 10 : undefined,
              left: surfaceAsBackground ? "auto" : undefined,
              width: surfaceAsBackground ? overlayRailWidth : "100%",
              height: surfaceAsBackground ? surfacePanelHeight : twoDPanelHeight,
              border: surfaceAsBackground
                ? "1px solid rgba(96,108,132,0.4)"
                : (isCanvasLayout ? "none" : "1px solid rgba(162,186,224,0.34)"),
              borderRadius: surfaceAsBackground ? 16 : (isCanvasLayout ? 0 : 16),
              background: "radial-gradient(160% 150% at 18% 4%, #23344d 0%, #16263c 45%, #0b1626 100%)",
              boxShadow: surfaceAsBackground
                ? "inset 0 1px 0 rgba(238,246,255,0.28), inset 0 -30px 66px rgba(2,10,22,0.46), 0 10px 20px rgba(20,30,46,0.22)"
                : (isCanvasLayout
                  ? "none"
                  : "inset 0 1px 0 rgba(238,246,255,0.28), inset 0 -40px 80px rgba(2,10,22,0.42), 0 18px 36px rgba(4,10,18,0.38)"),
              overflow: "hidden",
              zIndex: surfaceAsBackground ? 8 : 1,
              ["--canvas-left-inset" as any]: `${(!surfaceAsBackground && panelLayoutMode === "overlay") ? canvasLeftInset : 0}px`,
              ["--canvas-command-h" as any]: `${(!surfaceAsBackground && isCanvasLayout) ? canvasCommandHeight : 0}px`,
            }}
          >
            {!surfaceAsBackground && (
              <div ref={canvasCommandRef} className={`canvas-command-strip ${overlayPanelsVisible ? "has-overlay-rail" : ""}`} style={{ right: canvasCommandRight }}>
                <div className="canvas-command-primary">
                  <div className="canvas-command-logo" aria-label="litopc">
                    <span className="canvas-command-logo-lit">lit</span>
                    <span className="canvas-command-logo-opc">opc</span>
                  </div>
                  {canvasModeHud}
                  {canvasToolbar}
                </div>
              </div>
            )}
            {surfaceAsBackground && (
              <>
                <div className="panel-corner-actions" style={{ top: 10, right: 10, zIndex: 9 }}>
                  <button
                    type="button"
                    className="panel-mini-toggle"
                    onClick={() => setSurfaceSwapMain(false)}
                    title="Swap back to 2D main"
                    aria-label="Swap back to 2D main"
                  >
                    2D↔3D
                  </button>
                </div>
                {surfacePanelVisible && (
                  <div className="panel-corner-actions panel-corner-actions-bottom-left" style={{ zIndex: 9 }}>
                    <button
                      type="button"
                      className={`panel-mini-control ${showSurfaceControls ? "is-active" : ""}`}
                      onClick={() => setShowSurfaceControls((v) => !v)}
                      title={showSurfaceControls ? "Hide 3D control" : "Show 3D control"}
                      aria-label={showSurfaceControls ? "Hide 3D control" : "Show 3D control"}
                    >
                      <ToolbarIcon kind="cube" />
                      3D Ctrl
                    </button>
                  </div>
                )}
              </>
            )}
            {(showLegend || !surfaceAsBackground) && (
              <div
                className="canvas-bottom-right-stack"
                style={{
                  position: surfaceAsBackground ? "fixed" : "absolute",
                  right: overlayRailInset,
                  bottom: 14,
                  zIndex: surfaceAsBackground ? 12 : 9,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: showLegend && !surfaceAsBackground ? 7 : 0,
                  maxWidth: `calc(100% - ${mainCanvasLeftInset} - ${overlayRailInset} - 12px)`,
                  pointerEvents: "none",
                }}
              >
                {!surfaceAsBackground && (
                  <div
                    className={`canvas-tech-text ${overlayPanelsVisible ? "has-overlay-rail" : ""}`}
                    style={{ position: "relative", right: "auto", bottom: "auto", top: "auto" }}
                  >
                    {sim ? `grid=${sim.grid_used} · nm/px=${sim.nm_per_pixel.toFixed(2)}` : "Run to simulate"}
                  </div>
                )}
                {showLegend && (
                  <div
                    className={`legend-card canvas-legend ${overlayPanelsVisible ? "has-overlay-rail" : ""}`}
                    style={{
                      position: "relative",
                      top: "auto",
                      bottom: "auto",
                      right: "auto",
                      left: "auto",
                      zIndex: surfaceAsBackground ? 12 : 3,
                      margin: 0,
                      backdropFilter: "blur(10px)",
                      background: "linear-gradient(180deg, rgba(255,255,255,0.86), rgba(248,250,255,0.62))",
                      pointerEvents: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                      rowGap: 4,
                      maxWidth: "100%",
                      fontSize: 12,
                      lineHeight: 1,
                      padding: "6px 9px",
                    }}
                  >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 11, fontWeight: 560 }}>
                <span
                  style={{
                    width: 16,
                    height: 8,
                    border: "1.2px solid #cc2d64",
                    borderRadius: 2,
                    background: "repeating-linear-gradient(-28deg, rgba(255,232,242,0.38) 0px, rgba(255,232,242,0.38) 2px, rgba(255,90,138,0.16) 2px, rgba(255,90,138,0.16) 8px)",
                  }}
                />
                Final Mask
              </span>
              {!!overlayAddPaths.length && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 11, fontWeight: 560 }}>
                  <span style={{ width: 16, height: 8, borderRadius: 2, background: "rgba(176,216,255,0.14)", border: "1px solid rgba(176,216,255,0.32)" }} />
                  Add
                </span>
              )}
                {!!maskSubtractPaths.length && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 11, fontWeight: 560 }}>
                    <span style={{ width: 16, height: 8, borderRadius: 2, background: "rgba(22,42,74,0.18)", border: "1px solid rgba(124,162,228,0.44)" }} />
                    Subtract
                  </span>
                )}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 11, fontWeight: 560 }}>
                <span style={{ width: 16, height: 8, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ width: "100%", borderTop: "1.6px solid #1f1f1f", display: "block", transform: "translateY(-0.5px)" }} />
                </span>
                <span style={{ transform: "translateY(-0.5px)", opacity: effectiveShowMainContour ? 1 : 0.45 }}>Contour</span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 560, opacity: showAerial ? 1 : 0.45 }}>
                <span style={{ width: 16, height: 8, borderRadius: 2, background: "linear-gradient(90deg, rgba(92,225,230,0.65), rgba(255,69,58,0.62))" }} />
                Aerial
              </span>
              {targetGuide && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 11, fontWeight: 560, opacity: showTargetOverlay ? 1 : 0.45 }}>
                  <span style={{ width: 16, borderTop: "1.6px dashed rgba(98,242,214,0.95)" }} />
                  Target
                </span>
              )}
              {compareActive && (
                <>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 11, fontWeight: 560 }}>
                    <span style={{ width: 16, borderTop: `1.6px dashed ${COMPARE_A_COLOR}` }} />
                    A
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 8, fontWeight: 560 }}>
                    <span style={{ width: 16, borderTop: `1.6px dashed ${COMPARE_B_COLOR}` }} />
                    B
                  </span>
                </>
              )}
                  </div>
                )}
              </div>
            )}
          {!surfaceAsBackground && renderSweepStatusLine("2d")}
          {!surfaceAsBackground && editorTool === "PLACE_SRAF" && (
            <div
              className="sraf-place-hint"
              style={{
                left: `${(((srafHintPoint?.x ?? (fovNm * 0.5)) / Math.max(1, fovNm)) * 100).toFixed(3)}%`,
                top: `${(((srafHintPoint?.y ?? (fovNm * 0.5)) / Math.max(1, fovNm)) * 100).toFixed(3)}%`,
              }}
            >
              <span className="sraf-place-hint-dot" aria-hidden="true" />
              Click in 2D to place SRAF
            </div>
          )}
          <svg
            ref={svgRef}
            viewBox={`0 0 ${fovNm} ${fovNm}`}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              cursor: editorTool === "DRAW_ADD_RECT" || editorTool === "DRAW_SUBTRACT_RECT" || editorTool === "PLACE_SRAF"
                ? "crosshair"
                : (dragging ? "grabbing" : "grab"),
            }}
            onWheel={onWheel}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
              <defs>
                <linearGradient id="panel-base" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1f3452" />
                  <stop offset="48%" stopColor="#13253d" />
                  <stop offset="100%" stopColor="#081325" />
                </linearGradient>
                <linearGradient id="panel-accent" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="rgba(166, 206, 255, 0.14)" />
                  <stop offset="42%" stopColor="rgba(130, 170, 232, 0.075)" />
                  <stop offset="100%" stopColor="rgba(58, 78, 120, 0.02)" />
                </linearGradient>
                <linearGradient id="panel-fog" x1="0" y1="0" x2="0.85" y2="1">
                  <stop offset="0%" stopColor="rgba(226,240,255,0.055)" />
                  <stop offset="38%" stopColor="rgba(188,216,248,0.022)" />
                  <stop offset="100%" stopColor="rgba(120,152,212,0.01)" />
                </linearGradient>
                <radialGradient id="panel-vignette" cx="50%" cy="50%" r="64%">
                  <stop offset="0%" stopColor="rgba(0,0,0,0)" />
                  <stop offset="72%" stopColor="rgba(0,0,0,0.14)" />
                  <stop offset="100%" stopColor="rgba(0,0,0,0.42)" />
                </radialGradient>
                <radialGradient id="panel-glass-bloom" cx="52%" cy="44%" r="56%">
                  <stop offset="0%" stopColor="rgba(198,232,255,0.16)" />
                  <stop offset="46%" stopColor="rgba(146,194,248,0.055)" />
                  <stop offset="100%" stopColor="rgba(86,126,188,0)" />
                </radialGradient>
                <linearGradient id="panel-water-sheen" x1="0" y1="0" x2="0.9" y2="1">
                  <stop offset="0%" stopColor="rgba(246,251,255,0.18)" />
                  <stop offset="22%" stopColor="rgba(222,238,255,0.07)" />
                  <stop offset="62%" stopColor="rgba(170,210,255,0.03)" />
                  <stop offset="100%" stopColor="rgba(150,194,246,0)" />
                </linearGradient>
                <linearGradient id="panel-reflect-top" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
                  <stop offset="16%" stopColor="rgba(236,246,255,0.2)" />
                  <stop offset="32%" stopColor="rgba(210,232,255,0.06)" />
                  <stop offset="100%" stopColor="rgba(180,214,255,0)" />
                </linearGradient>
                <radialGradient id="panel-caustic-core" cx="52%" cy="48%" r="36%">
                  <stop offset="0%" stopColor="rgba(214,236,255,0.18)" />
                  <stop offset="48%" stopColor="rgba(178,214,255,0.06)" />
                  <stop offset="100%" stopColor="rgba(130,176,236,0)" />
                </radialGradient>
                <pattern id="panel-texture" width={12} height={12} patternUnits="userSpaceOnUse">
                  <path d="M 0 12 L 12 0" fill="none" stroke="rgba(190,214,244,0.042)" strokeWidth="0.45" />
                  <circle cx="2" cy="2" r="0.55" fill="rgba(182,208,238,0.028)" />
                  <circle cx="8" cy="6" r="0.45" fill="rgba(176,202,234,0.022)" />
                </pattern>
                <pattern id="panel-ripples" width={120} height={120} patternUnits="userSpaceOnUse">
                  <path d="M -20 62 Q 12 46, 44 62 T 108 62 T 172 62" fill="none" stroke="rgba(214,234,255,0.11)" strokeWidth="1.1" />
                  <path d="M -26 84 Q 10 70, 46 84 T 118 84 T 190 84" fill="none" stroke="rgba(182,214,250,0.08)" strokeWidth="0.9" />
                </pattern>
                <pattern id="opc-grid" width={80} height={80} patternUnits="userSpaceOnUse">
                  <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgba(166,198,236,0.065)" strokeWidth="1" />
                </pattern>
                <pattern id="target-hatch" width={14} height={14} patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
                  <path d="M 0 0 L 0 14" fill="none" stroke="rgba(98,242,214,0.24)" strokeWidth="2" />
                </pattern>
                <pattern id="final-mask-hatch" width={18} height={18} patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
                  <path d="M 0 0 L 0 18" fill="none" stroke="rgba(255,226,242,0.09)" strokeWidth="3" />
                </pattern>
                <linearGradient id="mask-fill" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="rgba(255,204,225,0.58)" />
                  <stop offset="60%" stopColor="rgba(255,132,179,0.24)" />
                  <stop offset="100%" stopColor="rgba(255,82,150,0.3)" />
                </linearGradient>
                <filter id="mask-glow" x="-35%" y="-35%" width="170%" height="170%">
                  <feGaussianBlur stdDeviation="3.6" result="b" />
                  <feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 0.35 0 0 0  0 0 0.2 0 0  0 0 0 0.22 0" />
                </filter>
              </defs>
              <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
              {showAerial && heatmapUrl && (
                <image
                  href={heatmapUrl}
                  x={0}
                  y={0}
                  width={fovNm}
                  height={fovNm}
                  preserveAspectRatio="none"
                  opacity={0.58}
                  transform={`translate(0 ${fovNm}) scale(1 -1)`}
                />
              )}
              {editableShapes.map((shape, idx) => (
                <path
                  key={`custom-hit-${idx}`}
                  d={editableShapePaths[idx] ?? ""}
                  fill="rgba(255,255,255,0.001)"
                  stroke={selectedCustomShapeIndexes.includes(idx) ? (activeEditLayer === "TARGET" ? "rgba(98,242,214,0.98)" : "rgba(255,132,196,0.94)") : "rgba(0,0,0,0)"}
                  strokeWidth={selectedCustomShapeIndexes.includes(idx) ? 1.2 : 0.001}
                  vectorEffect="non-scaling-stroke"
                  style={{ cursor: "move" }}
                  onMouseDown={(e) => {
                    if (editorTool !== "SELECT") return;
                    e.stopPropagation();
                    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
                    onSelectCustomShape?.(idx, additive);
                    const ps = pointerToMaskNm(e.clientX, e.clientY);
                    const activeIndexes = selectedCustomShapeIndexes.includes(idx)
                      ? selectedCustomShapeIndexes
                      : [idx];
                    customShapeDragRef.current = {
                      indexes: activeIndexes,
                      x: ps.x_nm,
                      y: ps.y_nm,
                      startShapes: editableShapes.map(cloneViewportShape),
                    };
                    setDragging(true);
                  }}
                />
              ))}
              {req.mask.mode === "TEMPLATE" && activeEditLayer !== "TARGET" && presetAnchorShapes.map((_, idx) => {
                const d = presetAnchorPaths[idx] ?? "";
                const selected = selectedCustomShapeIndexes.length === 0 && idx === selectedPresetAnchorIndex;
                return (
                  <g key={`preset-anchor-${idx}`}>
                    <path
                      d={d}
                      fill="rgba(255,132,196,0.01)"
                      stroke={selected ? "rgba(255,132,196,0.96)" : "rgba(255,182,220,0.34)"}
                      strokeWidth={selected ? 1.4 : 0.95}
                      strokeDasharray={selected ? "8 4" : "4 4"}
                      vectorEffect="non-scaling-stroke"
                      style={{ cursor: "pointer" }}
                      onMouseDown={(e) => {
                        if (editorTool !== "SELECT") return;
                        e.stopPropagation();
                        onSelectPresetAnchor?.(idx);
                      }}
                    />
                  </g>
                );
              })}
              {selectedCustomRect && (() => {
                const handleRadiusNm = 4.2 / Math.max(scale, 0.0001);
                const left = selectedCustomRect.x_nm;
                const right = selectedCustomRect.x_nm + selectedCustomRect.w_nm;
                const top = fovNm - (selectedCustomRect.y_nm + selectedCustomRect.h_nm);
                const bottom = fovNm - selectedCustomRect.y_nm;
                const corners: Array<{ key: "nw" | "ne" | "sw" | "se"; x: number; y: number }> = [
                  { key: "nw", x: left, y: top },
                  { key: "ne", x: right, y: top },
                  { key: "sw", x: left, y: bottom },
                  { key: "se", x: right, y: bottom },
                ];
                return (
                  <g>
                    <rect
                      x={left}
                      y={top}
                      width={Math.max(1, selectedCustomRect.w_nm)}
                      height={Math.max(1, selectedCustomRect.h_nm)}
                      fill="none"
                      stroke="rgba(255,132,196,0.96)"
                      strokeWidth={1.25}
                      strokeDasharray="4 3"
                      vectorEffect="non-scaling-stroke"
                    />
                    {corners.map((c) => (
                      <circle
                        key={`rect-handle-${c.key}`}
                        cx={c.x}
                        cy={c.y}
                        r={handleRadiusNm}
                        fill="rgba(235,246,255,0.95)"
                        stroke="rgba(214,88,150,0.94)"
                        strokeWidth={1.1}
                        vectorEffect="non-scaling-stroke"
                        style={{ cursor: c.key === "nw" || c.key === "se" ? "nwse-resize" : "nesw-resize" }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          customRectResizeRef.current = {
                            index: selectedCustomShapeIndex,
                            corner: c.key,
                            startShapes: editableShapes.map(cloneViewportShape),
                          };
                          setDragging(true);
                        }}
                      />
                    ))}
                  </g>
                );
              })()}
              {customRectDraft && (
                <path
                  d={rectPath(customRectDraft.x_nm, customRectDraft.y_nm, customRectDraft.w_nm, customRectDraft.h_nm, fovNm)}
                  fill={editorTool === "DRAW_SUBTRACT_RECT" ? "rgba(255,142,118,0.12)" : "rgba(120,190,255,0.16)"}
                  stroke={editorTool === "DRAW_SUBTRACT_RECT" ? "rgba(255,142,118,0.98)" : "rgba(120,190,255,0.95)"}
                  strokeWidth={1.2}
                  strokeDasharray="5 4"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {finalMaskCompoundPath && (
                <>
                  <path
                    d={finalMaskCompoundPath}
                    fill="url(#mask-fill)"
                    fillRule="evenodd"
                    clipRule="evenodd"
                    filter="url(#mask-glow)"
                  />
                  <path
                    d={finalMaskCompoundPath}
                    fill="url(#final-mask-hatch)"
                    fillRule="evenodd"
                    clipRule="evenodd"
                    opacity={0.72}
                  />
                </>
              )}
              {targetGuide && showTargetOverlay && targetContours.map((contour, idx) => {
                const d = polylineToPath(contour.points_nm, fovNm);
                return (
                  <g key={`target-contour-${idx}`}>
                    <path
                      d={d}
                      fill="none"
                      stroke="rgba(10,42,44,0.62)"
                      strokeWidth={4.1}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke="rgba(12,42,44,0.28)"
                      strokeWidth={2.15}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke="rgba(98,242,214,0.9)"
                      strokeWidth={1.12}
                      strokeDasharray="5 3"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}
              {overlayAddPaths.map((d, idx) => (
                <g key={`overlay-add-${idx}`}>
                  <path
                    d={d}
                    fill="rgba(176,216,255,0.07)"
                    stroke="none"
                  />
                </g>
              ))}
              {overlayAddPaths.map((d, idx) => (
                <path
                  key={`overlay-add-outline-${idx}`}
                  d={d}
                  fill="none"
                  stroke="rgba(255,142,202,0.84)"
                  strokeWidth={0.92}
                  strokeDasharray="4 3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {maskSubtractPaths.map((d, idx) => (
                <g key={`mask-sub-outline-${idx}`}>
                  <path
                    d={d}
                    fill="rgba(22,42,74,0.18)"
                    stroke="none"
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke="rgba(124,162,228,0.44)"
                    strokeWidth={0.96}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              ))}
              {finalMaskContourPaths.map((d, idx) => (
                <g key={`mask-outline-${idx}`}>
                  <path
                    d={d}
                    fill="none"
                    stroke="rgba(70,28,60,0.7)"
                    strokeWidth={1.62}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke="rgba(255,236,246,0.98)"
                    strokeWidth={1.06}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              ))}
              {targetGuide && showTargetOverlay && targetContours.map((contour, idx) => {
                const d = polylineToPath(contour.points_nm, fovNm);
                return (
                  <path
                    key={`target-contour-top-${idx}`}
                    d={d}
                    fill="none"
                    stroke="rgba(118,255,230,0.92)"
                    strokeWidth={1.08}
                    strokeDasharray="5 3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
              {effectiveShowMainContour && sim?.contours_nm?.map((c, idx) => {
                const d = polylineToPath(c.points_nm, fovNm);
                return (
                  <g key={idx}>
                    <path
                      d={d}
                      fill="none"
                      stroke="rgba(36,50,76,0.72)"
                      strokeWidth={contourUnderWidth}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke="rgba(236,243,255,0.96)"
                      strokeWidth={contourMainWidth}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}
              {compareActive && compareAContours?.map((c, idx) => {
                const d = polylineToPath(c.points_nm, fovNm);
                return (
                  <path
                    key={`cmp-a-${idx}`}
                    d={d}
                    fill="none"
                    stroke={COMPARE_A_COLOR}
                    strokeWidth={compareContourWidth}
                    strokeDasharray={compareDash2d}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    opacity={0.9}
                  />
                );
              })}
              {compareActive && compareBContours?.map((c, idx) => {
                const d = polylineToPath(c.points_nm, fovNm);
                return (
                  <path
                    key={`cmp-b-${idx}`}
                    d={d}
                    fill="none"
                    stroke={COMPARE_B_COLOR}
                    strokeWidth={compareContourWidth}
                    strokeDasharray={compareDash2d}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    opacity={0.92}
                  />
                );
              })}
              {showSweepOverlay && sweepResult?.param === "dose" && stackedDoseSweepPoints.map((pt, pIdx) => {
                const n = Math.max(1, stackedDoseSweepPoints.length - 1);
                const t = pIdx / n;
                const hue = 212 - t * 132;
                return (pt.contours_nm ?? []).map((c, cIdx) => {
                  const d = polylineToPath(c.points_nm, fovNm);
                  return (
                    <path
                      key={`sweep-dose-${pIdx}-${cIdx}`}
                      d={d}
                      fill="none"
                      stroke={`hsla(${hue.toFixed(1)}, 90%, 72%, 0.52)`}
                      strokeWidth={1.35}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      opacity={0.52}
                    />
                  );
                });
              })}
              {showSweepOverlay && sweepResult?.param !== "dose" && sweepStackAll && sweepMaskOverlay.stacked.map((set, pIdx) => (
                <g key={`sweep-mask-stack-${pIdx}`}>
                  {set.contours.map((c, cIdx) => {
                    const d = polylineToPath(c.points_nm, fovNm);
                    return (
                      <path
                        key={`sweep-mask-stack-${pIdx}-${cIdx}`}
                        d={d}
                        fill="none"
                        stroke={set.color}
                        strokeWidth={1.35}
                        strokeDasharray={set.dash?.join(" ")}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                        opacity={0.54}
                      />
                    );
                  })}
                </g>
              ))}
              {showSweepOverlay && sweepResult?.param !== "dose" && sweepStackAll && nonDoseStackContourSets.map((set, pIdx) => (
                <g key={`sweep-contour-stack-${pIdx}`}>
                  {set.contours.map((c, cIdx) => {
                    const d = polylineToPath(c.points_nm, fovNm);
                    return (
                      <path
                        key={`sweep-contour-stack-${pIdx}-${cIdx}`}
                        d={d}
                        fill="none"
                        stroke={set.color}
                        strokeWidth={1.32}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                        opacity={0.56}
                      />
                    );
                  })}
                </g>
              ))}
              {showSweepOverlay && activeSweepContours.map((c, idx) => {
                const d = polylineToPath(c.points_nm, fovNm);
                return (
                  <g key={`sweep-active-${idx}`}>
                    <path
                      d={d}
                      fill="none"
                      stroke="rgba(255,218,162,0.58)"
                      strokeWidth={2.85}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke="rgba(255,165,46,0.95)"
                      strokeWidth={1.7}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}
              {showSweepOverlay && sweepResult?.param !== "dose" && sweepMaskOverlay.active?.contours.map((c, idx) => {
                const d = polylineToPath(c.points_nm, fovNm);
                return (
                  <g key={`sweep-active-mask-${idx}`}>
                    <path
                      d={d}
                      fill="none"
                      stroke={sweepMaskOverlay.active?.underColor ?? "rgba(195,236,255,0.46)"}
                      strokeWidth={2.7}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke={sweepMaskOverlay.active?.color ?? "rgba(124,215,255,0.96)"}
                      strokeWidth={1.5}
                      strokeDasharray={sweepMaskOverlay.active?.dash?.join(" ")}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}
              {showSweepOverlay && sweepRuler && (
                <g>
                  <line
                    x1={sweepRuler.x0}
                    y1={sweepRuler.y}
                    x2={sweepRuler.x1}
                    y2={sweepRuler.y}
                    stroke="rgba(255,181,71,0.96)"
                    strokeWidth={1.45}
                    strokeDasharray="5 3"
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1={sweepRuler.x0}
                    y1={sweepRuler.y - 5.5 * viewInvZoom}
                    x2={sweepRuler.x0}
                    y2={sweepRuler.y + 5.5 * viewInvZoom}
                    stroke="rgba(255,181,71,0.96)"
                    strokeWidth={1.2}
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1={sweepRuler.x1}
                    y1={sweepRuler.y - 5.5 * viewInvZoom}
                    x2={sweepRuler.x1}
                    y2={sweepRuler.y + 5.5 * viewInvZoom}
                    stroke="rgba(255,181,71,0.96)"
                    strokeWidth={1.2}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              )}
              {showRulers && maskBounds && (
                <>
                  {maskRuler && (
                    <CdRuler
                      x0={maskRuler.x0}
                      x1={maskRuler.x1}
                      y={maskRuler.y}
                      axis={rulerAxis}
                      color="#cc2d64"
                      label={`Mask ${Math.abs(maskRuler.x1 - maskRuler.x0).toFixed(1)} nm`}
                      labelDy={-14}
                      zoomScale={scale}
                      onGrab={(target, p) => {
                        setSelectedRuler("mask");
                        const ps = pointerToWorldUnits(p.x, p.y);
                        rulerDragRef.current = { target, x: ps.x, y: ps.y, start: { ...maskRuler } };
                      }}
                      handlePrefix="mask"
                      selected={selectedRuler === "mask"}
                    />
                  )}
                  {contourRuler && (
                    <CdRuler
                      x0={contourRuler.x0}
                      x1={contourRuler.x1}
                      y={contourRuler.y}
                      axis={rulerAxis}
                      color="#d6e0f2"
                      label={`Contour ${Math.abs(contourRuler.x1 - contourRuler.x0).toFixed(1)} nm`}
                      labelDy={22}
                      zoomScale={scale}
                      onGrab={(target, p) => {
                        setSelectedRuler("contour");
                        const ps = pointerToWorldUnits(p.x, p.y);
                        rulerDragRef.current = { target, x: ps.x, y: ps.y, start: { ...contourRuler } };
                      }}
                      handlePrefix="contour"
                      selected={selectedRuler === "contour"}
                    />
                  )}
                </>
              )}
            </g>
          </svg>
        </div>
          {overlayPanelsMounted && (
            <div className="viewport-overlay-panels">
              {renderRightRailPanels()}
            </div>
          )}
          {rulerFloatingControl}
          {showSurfaceControls && surfacePanelVisible && surfaceAsBackground && (
            <div
              className={`surface-controls-overlay-main ${overlayPanelsVisible ? "has-overlay-rail" : ""}`}
              style={{ top: 14, right: overlayRailInset }}
            >
              <div className="surface-controls surface-controls-compact">
                <div className="surface-controls-title surface-controls-title-compact">
                  <span className="surface-controls-title-icon"><ToolbarIcon kind="cube" /></span>
                  3D Control
                </div>
                <label className="surface-inline-item">
                  <span className="surface-inline-label"><ToolbarIcon kind="azimuth" /> Az</span>
                  <input
                    type="range"
                    min={-160}
                    max={160}
                    step={1}
                    value={surfAzimuth}
                    onChange={(e) => setSurfAzimuth(Number(e.target.value))}
                  />
                </label>
                <label className="surface-inline-item">
                  <span className="surface-inline-label"><ToolbarIcon kind="elevation" /> El</span>
                  <input
                    type="range"
                    min={-12}
                    max={85}
                    step={1}
                    value={surfElevation}
                    onChange={(e) => setSurfElevation(Number(e.target.value))}
                  />
                </label>
                <label className="surface-inline-item">
                  <span className="surface-inline-label"><ToolbarIcon kind="roll" /> Roll</span>
                  <input
                    type="range"
                    min={-140}
                    max={140}
                    step={1}
                    value={surfRoll}
                    onChange={(e) => setSurfRoll(Number(e.target.value))}
                  />
                </label>
                <label className="surface-inline-item">
                  <span className="surface-inline-label"><ToolbarIcon kind="axisx" /> X</span>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.01}
                    value={surfOffsetX}
                    onChange={(e) => setSurfOffsetX(Number(e.target.value))}
                  />
                </label>
                <label className="surface-inline-item">
                  <span className="surface-inline-label"><ToolbarIcon kind="axisy" /> Y</span>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.01}
                    value={surfOffsetY}
                    onChange={(e) => setSurfOffsetY(Number(e.target.value))}
                  />
                </label>
                <label className="surface-inline-item">
                  <span className="surface-inline-label"><ToolbarIcon kind="axisz" /> Z</span>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.01}
                    value={surfOffsetZ}
                    onChange={(e) => setSurfOffsetZ(Number(e.target.value))}
                  />
                </label>
              </div>
            </div>
          )}
        </div>
        {workspaceHasRightRail && renderRightRailPanels()}
      </div>

      {!isCanvasLayout && showMetricsFooter && (
        <>
          <div className="metrics-strip">
            <div className="metrics-strip-head">
              <div className="metrics-strip-primary">
                <span className="metrics-strip-label">Metrics</span>
                <span className="metrics-strip-value">{sim?.metrics?.cd_nm ? `CD ~ ${sim.metrics.cd_nm.toFixed(1)} nm` : "-"}</span>
                {compareActive && typeof compareACd === "number" && typeof compareBCd === "number" && (
                  <span className="metrics-strip-compare">
                    A {compareACd.toFixed(1)} nm · B {compareBCd.toFixed(1)} nm · Delta {(compareBCd - compareACd).toFixed(1)} nm
                  </span>
                )}
              </div>
              {compareActive && (
                <span className="metrics-strip-note">
                  {compareALabel ? `A=${compareALabel}` : ""}{compareALabel && compareBLabel ? " · " : ""}{compareBLabel ? `B=${compareBLabel}` : ""}
                </span>
              )}
            </div>
            {targetGuide && (
              <div className="target-metrics-card">
                <div className="target-metrics-head">
                  <div className="target-metrics-title">
                    <span className="target-metrics-eyebrow">Target Workspace</span>
                    <strong>{targetGuide.title}</strong>
                  </div>
                  <div className="target-metrics-score">
                    {targetMetrics?.score == null ? "Run to score" : `${targetMetrics.score.toFixed(1)}/100`}
                  </div>
                </div>
                <div className="target-metrics-sub">
                  {targetMetrics?.recommendation ?? targetGuide.hint}
                </div>
                <div className="target-metrics-tags">
                  <span>{targetMetrics?.grade ?? "Run to score"}</span>
                  <span>Mean EPE {targetMetrics?.epeMeanNm == null ? "-" : `${targetMetrics.epeMeanNm.toFixed(1)} nm`}</span>
                  <span>Mask Penalty {targetMetrics?.complexityPenalty?.toFixed(1) ?? "0.0"}</span>
                </div>
              </div>
            )}
          </div>

          <div className="trust-strip trust-strip-bottom" title={trustTooltipText}>
            <div className="trust-row trust-row-minimal" title={trustTooltipText}>
              <span className="trust-info-dot" aria-hidden="true">i</span>
              <span className="trust-chip trust-chip-formula trust-chip-min">
                CDmin ? k1·λ/NA
              </span>
              <span className="trust-chip trust-chip-active trust-chip-min" title={trustTooltipText}>
                {trustPreset.title} · k1 {trustPreset.k1.toFixed(2)} · {trustCdMinNm.toFixed(1)} nm
              </span>
              <span className="trust-chip trust-chip-version trust-chip-min trust-chip-tail">
                {MODEL_VERSION_TAG}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ToolbarIcon(props: { kind: "plus" | "minus" | "zoomin" | "zoomout" | "reset" | "legend" | "ruler" | "cube" | "contour" | "aerial" | "view" | "export" | "plane2d" | "camera" | "azimuth" | "elevation" | "roll" | "axisx" | "axisy" | "axisz" }) {
  const { kind } = props;
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "zoomin") {
    return (
      <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="6.6" cy="6.6" r="3.4" {...stroke} />
        <path d="M9.2 9.2 13.2 13.2" {...stroke} />
        <path d="M6.6 4.9V8.3M4.9 6.6H8.3" {...stroke} />
      </svg>
    );
  }
  if (kind === "zoomout") {
    return (
      <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="6.6" cy="6.6" r="3.4" {...stroke} />
        <path d="M9.2 9.2 13.2 13.2" {...stroke} />
        <path d="M4.9 6.6H8.3" {...stroke} />
      </svg>
    );
  }
  if (kind === "plus") {
    return (
      <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 3V13M3 8H13" {...stroke} />
      </svg>
    );
  }
  if (kind === "minus") {
    return (
      <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3 8H13" {...stroke} />
      </svg>
    );
  }
  if (kind === "export") {
    return (
      <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 2V10M8 2L5.5 4.6M8 2L10.5 4.6" {...stroke} />
        <rect x="3" y="10.5" width="10" height="3" rx="1" {...stroke} />
      </svg>
    );
  }
  if (kind === "reset") {
    return (
      <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3.5 8A4.5 4.5 0 1 0 5 4.7" {...stroke} />
        <path d="M3 3.5V6.5H6" {...stroke} />
      </svg>
    );
  }
  if (kind === "legend") {
    return (
      <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2.5" y="3" width="11" height="10" rx="2" {...stroke} />
        <path d="M5 6.2H11M5 9.8H9.4" {...stroke} />
      </svg>
    );
  }
  if (kind === "ruler") {
    return (
      <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3 11.8L11.8 3l1.2 1.2-8.8 8.8H3z" {...stroke} />
        <path d="M8 6.8l1.2 1.2M6.4 8.4l1.2 1.2" {...stroke} />
      </svg>
    );
  }
  if (kind === "contour") {
    return (
      <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2.5 9.2c1.6-4.8 9.4-4.8 11 0" {...stroke} />
        <path d="M2.5 11.8c2-2.2 9-2.2 11 0" {...stroke} />
      </svg>
    );
  }
  if (kind === "aerial") {
    return (
      <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="5.2" {...stroke} />
        <path d="M8 2.8V13.2M2.8 8H13.2" {...stroke} />
      </svg>
    );
  }
  if (kind === "view") {
    return (
      <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2.5 4h11M2.5 8h11M2.5 12h11" {...stroke} />
        <circle cx="5.2" cy="4" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="10.8" cy="8" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="7.2" cy="12" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (kind === "plane2d") {
    return (
      <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2.7" y="2.7" width="10.6" height="10.6" rx="2" {...stroke} />
        <path d="M2.7 8H13.3M8 2.7V13.3" {...stroke} />
      </svg>
    );
  }
  if (kind === "camera") {
    return (
      <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2.3" y="4.2" width="11.4" height="8.8" rx="2" {...stroke} />
        <circle cx="8" cy="8.6" r="2.1" {...stroke} />
        <path d="M5.2 4.2 6.3 2.8H9.7L10.8 4.2" {...stroke} />
      </svg>
    );
  }
  if (kind === "azimuth") {
    return (
      <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2.8 8h10.4M10.2 5.6 13.2 8l-3 2.4" {...stroke} />
      </svg>
    );
  }
  if (kind === "elevation") {
    return (
      <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 13.2V2.8M5.6 5.8 8 2.8l2.4 3" {...stroke} />
      </svg>
    );
  }
  if (kind === "roll") {
    return (
      <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3.2 11.3a5.1 5.1 0 1 0 0-6.6" {...stroke} />
        <path d="M2.6 8.1 5 8.2 4.9 5.8" {...stroke} />
      </svg>
    );
  }
  if (kind === "axisx") {
    return (
      <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2.6 8h10.8M10.4 5.6 13.4 8l-3 2.4" {...stroke} />
      </svg>
    );
  }
  if (kind === "axisy") {
    return (
      <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 13.4V2.6M5.6 5.6 8 2.6l2.4 3" {...stroke} />
      </svg>
    );
  }
  if (kind === "axisz") {
    return (
      <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3.3 11.9 12.7 4.1M9.5 3.5 13.3 4.1 12.7 8" {...stroke} />
      </svg>
    );
  }
  return (
    <svg className="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2.4l4.7 2.3v6.6L8 13.6 3.3 11.3V4.7z" {...stroke} />
      <path d="M8 2.4v11.2M3.3 4.7 8 7l4.7-2.3" {...stroke} />
    </svg>
  );
}

function polylineToPath(pts: Array<{ x: number; y: number }>, fovNm: number) {
  if (!pts || pts.length === 0) return "";
  const { x: x0, y: y0 } = pts[0];
  let d = `M ${x0} ${fovNm - y0}`;
  for (let i = 1; i < pts.length; i++) {
    const { x, y } = pts[i];
    d += ` L ${x} ${fovNm - y}`;
  }
  return d;
}

function createSurfaceProjector(view: {
  azimuthDeg: number;
  elevationDeg: number;
  rollDeg: number;
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
  zoomScale: number;
  wPx: number;
  hPx: number;
  featureBoost?: number;
}) {
  const safe = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);
  const safeAzimuthDeg = safe(view.azimuthDeg, 34);
  const safeElevationDeg = safe(view.elevationDeg, 34);
  const safeRollDeg = safe(view.rollDeg, 0);
  const safeOffsetX = safe(view.offsetX ?? 0, 0);
  const safeOffsetY = safe(view.offsetY ?? 0, 0);
  const safeOffsetZ = safe(view.offsetZ ?? 0, 0);
  const safeZoomScale = safe(view.zoomScale, 1);
  const safeWPx = Math.max(1, safe(view.wPx, 1));
  const safeHPx = Math.max(1, safe(view.hPx, 1));
  const safeFeatureBoost = safe(view.featureBoost ?? 1, 1);
  const az = (safeAzimuthDeg * Math.PI) / 180;
  const el = (safeElevationDeg * Math.PI) / 180;
  const roll = (safeRollDeg * Math.PI) / 180;
  const cosA = Math.cos(az);
  const sinA = Math.sin(az);
  const cosE = Math.cos(el);
  const sinE = Math.sin(el);
  const cosR = Math.cos(roll);
  const sinR = Math.sin(roll);
  const zoomIn = Math.max(0.15, Math.min(16, safeZoomScale));
  // Compromise mapping: less aggressive than linear, but more responsive than sqrt-only.
  const zoomBoost = 0.52 + 0.48 * Math.pow(zoomIn, 0.9);
  const featureBoostRaw = Math.max(0.9, Math.min(3.2, safeFeatureBoost));
  // Mild dampening so tiny features still remain visible while zoom feels responsive.
  const featureDampen = 1 / (1 + 0.1 * Math.max(0, zoomIn - 1));
  const featureBoost = 1 + (featureBoostRaw - 1) * featureDampen;
  const scale = Math.min(safeWPx, safeHPx) * 0.63 * zoomBoost * featureBoost;
  const cx = safeWPx * 0.5;
  const cy = safeHPx * 0.64;
  const shiftX = safeOffsetX * 0.36;
  const shiftY = safeOffsetY * 0.36;
  const shiftZ = safeOffsetZ * 0.36;
  const perspectiveFocal = 2.9;
  const perspectiveStrength = 0.9;
  const perspectiveMin = 0.72;
  const perspectiveMax = 1.58;

  return (xN: number, yN: number, zN: number) => {
    const xIn = safe(xN, 0) + shiftX;
    const yIn = safe(yN, 0) + shiftY;
    const zIn = safe(zN, 0) + shiftZ;
    const x1 = xIn * cosA - yIn * sinA;
    const y1 = xIn * sinA + yIn * cosA;
    const z1 = zIn;
    const x2 = x1;
    const y2 = y1 * cosE - z1 * sinE;
    const z2 = y1 * sinE + z1 * cosE;
    const x3 = x2 * cosR + z2 * sinR;
    const y3 = y2;
    const z3 = -x2 * sinR + z2 * cosR;
    const depth = y3 + z3 * 0.35;
    const perspectiveDen = Math.max(0.42, perspectiveFocal - depth * perspectiveStrength);
    const perspective = Math.max(
      perspectiveMin,
      Math.min(perspectiveMax, perspectiveFocal / perspectiveDen)
    );
    return {
      sx: cx + x3 * scale * perspective,
      sy: cy + y3 * scale * 0.9 * perspective,
      depth,
    };
  };
}

function drawSurface3D(
  ctx: CanvasRenderingContext2D,
  wPx: number,
  hPx: number,
  w: number,
  h: number,
  data: number[],
  opts: {
    azimuthDeg: number;
    elevationDeg: number;
    rollDeg: number;
    offsetX?: number;
    offsetY?: number;
    offsetZ?: number;
    depthScale: number;
    zoomScale: number;
    qualityMode: "FAST" | "FULL";
    fovNm: number;
    maskAddRects: Array<{ x: number; y: number; w: number; h: number }>;
    maskSubtractRects: Array<{ x: number; y: number; w: number; h: number }>;
    overlayAddRects: Array<{ x: number; y: number; w: number; h: number }>;
    finalMaskContours: Array<{ points_nm: Array<{ x: number; y: number }> }>;
    contours: Array<{ points_nm: Array<{ x: number; y: number }> }>;
    targetContours: Array<{ points_nm: Array<{ x: number; y: number }> }>;
    showTargetOverlay: boolean;
    compareActive: boolean;
    compareAContours: Array<{ points_nm: Array<{ x: number; y: number }> }>;
    compareBContours: Array<{ points_nm: Array<{ x: number; y: number }> }>;
    sweepContourSets?: Array<{
      contours: Array<{ points_nm: Array<{ x: number; y: number }> }>;
      color: string;
      opacity: number;
      dash?: [number, number];
      underColor?: string;
      baseZ?: number;
      plane?: "silicon" | "mask";
    }>;
    showMainContour: boolean;
    showAerial: boolean;
    maskOpacityPreset: "BALANCED" | "REVEAL";
    nmPerPixel: number;
  }
) {
  ctx.clearRect(0, 0, wPx, hPx);

  if (!w || !h || data.length !== w * h) return;
  let vmin = Number.POSITIVE_INFINITY;
  let vmax = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v < vmin) vmin = v;
    if (v > vmax) vmax = v;
  }
  const span = Math.max(1e-9, vmax - vmin);
  const surfaceFeatureBoost = calcSurfaceFeatureBoost(opts.maskAddRects, opts.fovNm);
  // Keep 3D contour thickness/glow independent from feature size (CD).
  const contourUnder3d = 3.35;
  const contourMain3d = 1.95;
  const compareUnder3d = 2.2;
  const compareMain3d = 1.7;
  const compareDash3d: [number, number] = [8, 5];
  const project = createSurfaceProjector({
    azimuthDeg: opts.azimuthDeg,
    elevationDeg: opts.elevationDeg,
    rollDeg: opts.rollDeg,
    offsetX: opts.offsetX,
    offsetY: opts.offsetY,
    offsetZ: opts.offsetZ,
    zoomScale: opts.zoomScale,
    wPx,
    hPx,
    featureBoost: surfaceFeatureBoost,
  });
  const detailTarget =
    opts.qualityMode === "FAST"
      ? 88
      : Math.min(196, Math.max(112, Math.round(112 * surfaceFeatureBoost)));
  const meshStep = Math.max(
    opts.qualityMode === "FAST" ? 3 : 2,
    Math.floor(Math.max(w, h) / detailTarget)
  );
  const maskZTop = 0.44;
  const siliconZ = -0.02;
  const isRevealMask = opts.maskOpacityPreset === "REVEAL";
  const maskPlateAlpha = isRevealMask ? 0.09 : 0.16;
  const apertureAlpha = isRevealMask ? 0.22 : 0.3;
  const featureCenterNm = (() => {
    if (!opts.maskAddRects.length) return { x: opts.fovNm * 0.5, y: opts.fovNm * 0.5 };
    let sx = 0;
    let sy = 0;
    let c = 0;
    for (const r of opts.maskAddRects) {
      sx += r.x + r.w * 0.5;
      sy += r.y + r.h * 0.5;
      c += 1;
    }
    return { x: sx / Math.max(1, c), y: sy / Math.max(1, c) };
  })();
  const featureCenterN = {
    x: featureCenterNm.x / opts.fovNm - 0.5,
    y: (opts.fovNm - featureCenterNm.y) / opts.fovNm - 0.5,
  };

  const bgGrad = ctx.createLinearGradient(0, 0, 0, hPx);
  bgGrad.addColorStop(0, "#091422");
  bgGrad.addColorStop(0.5, "#0e1a2c");
  bgGrad.addColorStop(1, "#111f33");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, wPx, hPx);
  const backBloom = ctx.createRadialGradient(wPx * 0.52, hPx * 0.44, hPx * 0.08, wPx * 0.52, hPx * 0.44, hPx * 0.82);
  backBloom.addColorStop(0, "rgba(196,224,255,0.2)");
  backBloom.addColorStop(0.35, "rgba(148,188,240,0.08)");
  backBloom.addColorStop(1, "rgba(76,118,188,0)");
  ctx.fillStyle = backBloom;
  ctx.fillRect(0, 0, wPx, hPx);

  function intensityAt(ix: number, iy: number, src: number[]) {
    const sy = Math.max(0, Math.min(h - 1, iy));
    return (src[sy * w + ix] - vmin) / span;
  }

  function drawPlane(z: number, fill: string, stroke: string) {
    const p0 = project(-0.5, -0.5, z);
    const p1 = project(0.5, -0.5, z);
    const p2 = project(0.5, 0.5, z);
    const p3 = project(-0.5, 0.5, z);
    ctx.beginPath();
    ctx.moveTo(p0.sx, p0.sy);
    ctx.lineTo(p1.sx, p1.sy);
    ctx.lineTo(p2.sx, p2.sy);
    ctx.lineTo(p3.sx, p3.sy);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke && stroke !== "none") {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }
    return { p0, p1, p2, p3 };
  }

  function drawMaskLayer() {
    const top = drawPlane(maskZTop, `rgba(138,152,176,${maskPlateAlpha.toFixed(3)})`, "none");
    const chrome = ctx.createLinearGradient(top.p0.sx, top.p0.sy, top.p2.sx, top.p2.sy);
    chrome.addColorStop(0, `rgba(246,250,255,${isRevealMask ? 0.12 : 0.18})`);
    chrome.addColorStop(0.25, `rgba(210,222,240,${isRevealMask ? 0.06 : 0.1})`);
    chrome.addColorStop(0.6, `rgba(102,122,156,${isRevealMask ? 0.04 : 0.07})`);
    chrome.addColorStop(0.88, `rgba(226,236,250,${isRevealMask ? 0.08 : 0.12})`);
    chrome.addColorStop(1, `rgba(250,253,255,${isRevealMask ? 0.1 : 0.16})`);
    ctx.fillStyle = chrome;
    ctx.beginPath();
    ctx.moveTo(top.p0.sx, top.p0.sy);
    ctx.lineTo(top.p1.sx, top.p1.sy);
    ctx.lineTo(top.p2.sx, top.p2.sy);
    ctx.lineTo(top.p3.sx, top.p3.sy);
    ctx.closePath();
    ctx.fill();

    // Soft transparent portal near feature center so silicon remains readable.
    const focal = project(featureCenterN.x, featureCenterN.y, maskZTop + 0.001);
    const portal = ctx.createRadialGradient(
      focal.sx,
      focal.sy,
      Math.max(18, Math.min(wPx, hPx) * 0.05),
      focal.sx,
      focal.sy,
      Math.max(120, Math.min(wPx, hPx) * 0.42)
    );
    portal.addColorStop(0, "rgba(252,214,234,0.02)");
    portal.addColorStop(0.42, `rgba(236,168,204,${isRevealMask ? 0.03 : 0.05})`);
    portal.addColorStop(1, `rgba(116,88,128,${isRevealMask ? 0.06 : 0.1})`);
    ctx.fillStyle = portal;
    ctx.beginPath();
    ctx.moveTo(top.p0.sx, top.p0.sy);
    ctx.lineTo(top.p1.sx, top.p1.sy);
    ctx.lineTo(top.p2.sx, top.p2.sy);
    ctx.lineTo(top.p3.sx, top.p3.sy);
    ctx.closePath();
    ctx.fill();

    if (opts.finalMaskContours.length) {
      const clip = new Path2D();
      for (const contour of opts.finalMaskContours) {
        const pts = contour.points_nm ?? [];
        if (pts.length < 3) continue;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const q = project(p.x / opts.fovNm - 0.5, (opts.fovNm - p.y) / opts.fovNm - 0.5, maskZTop + 0.0022);
          if (i === 0) clip.moveTo(q.sx, q.sy);
          else clip.lineTo(q.sx, q.sy);
        }
        clip.closePath();
      }
      const apertureTone = apertureAlpha * (isRevealMask ? 0.5 : 0.58);
      const aperture = ctx.createLinearGradient(top.p0.sx, top.p0.sy, top.p2.sx, top.p2.sy);
      aperture.addColorStop(0, `rgba(242,226,236,${Math.max(0, apertureTone - 0.08)})`);
      aperture.addColorStop(0.45, `rgba(224,178,206,${Math.max(0, apertureTone - 0.12)})`);
      aperture.addColorStop(1, `rgba(208,136,178,${Math.max(0, apertureTone - 0.16)})`);
      ctx.save();
      ctx.clip(clip, "evenodd");
      ctx.fillStyle = aperture;
      ctx.shadowColor = `rgba(224,122,176,${isRevealMask ? 0.04 : 0.08})`;
      ctx.shadowBlur = isRevealMask ? 2 : 4;
      ctx.beginPath();
      ctx.moveTo(top.p0.sx, top.p0.sy);
      ctx.lineTo(top.p1.sx, top.p1.sy);
      ctx.lineTo(top.p2.sx, top.p2.sy);
      ctx.lineTo(top.p3.sx, top.p3.sy);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.save();
      ctx.clip(clip, "evenodd");
      ctx.strokeStyle = `rgba(255,235,244,${isRevealMask ? 0.07 : 0.11})`;
      ctx.lineWidth = 0.8;
      for (let t = -Math.max(wPx, hPx); t < Math.max(wPx, hPx) * 1.5; t += 10) {
        ctx.beginPath();
        ctx.moveTo(t, -24);
        ctx.lineTo(t + Math.max(wPx, hPx) * 0.42, hPx + 24);
        ctx.stroke();
      }
      ctx.restore();
      ctx.restore();
    }

    for (const contour of opts.finalMaskContours) {
      const pts = contour.points_nm ?? [];
      if (pts.length < 2) continue;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const q = project(p.x / opts.fovNm - 0.5, (opts.fovNm - p.y) / opts.fovNm - 0.5, maskZTop + 0.0034);
        if (i === 0) ctx.moveTo(q.sx, q.sy);
        else ctx.lineTo(q.sx, q.sy);
      }
      ctx.strokeStyle = `rgba(76,34,64,${isRevealMask ? 0.38 : 0.56})`;
      ctx.lineWidth = 1.08;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,232,242,${isRevealMask ? 0.62 : 0.84})`;
      ctx.lineWidth = 0.72;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
    }

    return top;
  }

  function drawSiliconBase() {
    const siliconPlate = drawPlane(siliconZ - 0.0015, "rgba(126,168,226,0.2)", "none");
    const plateGlow = ctx.createLinearGradient(siliconPlate.p0.sx, siliconPlate.p0.sy, siliconPlate.p2.sx, siliconPlate.p2.sy);
    plateGlow.addColorStop(0, "rgba(216,236,255,0.2)");
    plateGlow.addColorStop(0.45, "rgba(164,206,252,0.1)");
    plateGlow.addColorStop(1, "rgba(94,138,198,0.08)");
    ctx.fillStyle = plateGlow;
    ctx.beginPath();
    ctx.moveTo(siliconPlate.p0.sx, siliconPlate.p0.sy);
    ctx.lineTo(siliconPlate.p1.sx, siliconPlate.p1.sy);
    ctx.lineTo(siliconPlate.p2.sx, siliconPlate.p2.sy);
    ctx.lineTo(siliconPlate.p3.sx, siliconPlate.p3.sy);
    ctx.closePath();
    ctx.fill();
    const plateSheen = ctx.createLinearGradient(siliconPlate.p0.sx, siliconPlate.p0.sy, siliconPlate.p1.sx, siliconPlate.p1.sy);
    plateSheen.addColorStop(0, "rgba(244,250,255,0.26)");
    plateSheen.addColorStop(0.34, "rgba(208,232,255,0.08)");
    plateSheen.addColorStop(1, "rgba(168,208,250,0.02)");
    ctx.fillStyle = plateSheen;
    ctx.beginPath();
    ctx.moveTo(siliconPlate.p0.sx, siliconPlate.p0.sy);
    ctx.lineTo(siliconPlate.p1.sx, siliconPlate.p1.sy);
    ctx.lineTo(siliconPlate.p2.sx, siliconPlate.p2.sy);
    ctx.lineTo(siliconPlate.p3.sx, siliconPlate.p3.sy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(214,234,255,0.24)";
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // Soft "floating on liquid" contact shadow under silicon plate.
    const cp = project(0, 0, siliconZ - 0.05);
    const shadow = ctx.createRadialGradient(cp.sx, cp.sy, hPx * 0.05, cp.sx, cp.sy, hPx * 0.34);
    shadow.addColorStop(0, "rgba(12,20,32,0.26)");
    shadow.addColorStop(0.45, "rgba(10,16,26,0.1)");
    shadow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shadow;
    ctx.fillRect(0, 0, wPx, hPx);
    return siliconPlate;
  }

  function drawSiliconSurface(primary: number[]) {
    const siliconPlate = drawSiliconBase();

    const quads: Array<{
      p00: ReturnType<typeof project>;
      p10: ReturnType<typeof project>;
      p11: ReturnType<typeof project>;
      p01: ReturnType<typeof project>;
      z: number;
      d: number;
      t: number;
    }> = [];

    for (let y = 0; y < h - meshStep; y += meshStep) {
      for (let x = 0; x < w - meshStep; x += meshStep) {
        const nx = x / (w - 1) - 0.5;
        const ny = 0.5 - y / (h - 1);
        const nx2 = (x + meshStep) / (w - 1) - 0.5;
        const ny2 = 0.5 - (y + meshStep) / (h - 1);
        const z00 = siliconZ;
        const z10 = siliconZ;
        const z11 = siliconZ;
        const z01 = siliconZ;
        const p00 = project(nx, ny, z00);
        const p10 = project(nx2, ny, z10);
        const p11 = project(nx2, ny2, z11);
        const p01 = project(nx, ny2, z01);
        const z = (z00 + z10 + z11 + z01) * 0.25;
        const d = (p00.depth + p10.depth + p11.depth + p01.depth) * 0.25;
        const t00 = intensityAt(x, y, primary);
        const t10 = intensityAt(x + meshStep, y, primary);
        const t11 = intensityAt(x + meshStep, y + meshStep, primary);
        const t01 = intensityAt(x, y + meshStep, primary);
        const t = (t00 + t10 + t11 + t01) * 0.25;
        quads.push({ p00, p10, p11, p01, z, d, t });
      }
    }
    quads.sort((a, b) => a.d - b.d);

    for (const q of quads) {
      const t = Math.max(0, Math.min(1, q.t));
      const c = appleColorMap(t);
      ctx.beginPath();
      ctx.moveTo(q.p00.sx, q.p00.sy);
      ctx.lineTo(q.p10.sx, q.p10.sy);
      ctx.lineTo(q.p11.sx, q.p11.sy);
      ctx.lineTo(q.p01.sx, q.p01.sy);
      ctx.closePath();
      ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${isRevealMask ? 0.9 : 0.84})`;
      ctx.fill();
      ctx.strokeStyle = "rgba(224,238,255,0.1)";
      ctx.lineWidth = 0.36;
      ctx.stroke();
    }

    const siliconSheen = ctx.createLinearGradient(siliconPlate.p0.sx, siliconPlate.p0.sy, siliconPlate.p2.sx, siliconPlate.p2.sy);
    siliconSheen.addColorStop(0, "rgba(220,236,255,0.16)");
    siliconSheen.addColorStop(0.5, "rgba(170,206,246,0.03)");
    siliconSheen.addColorStop(1, "rgba(120,168,224,0)");
    ctx.fillStyle = siliconSheen;
    ctx.beginPath();
    ctx.moveTo(siliconPlate.p0.sx, siliconPlate.p0.sy);
    ctx.lineTo(siliconPlate.p1.sx, siliconPlate.p1.sy);
    ctx.lineTo(siliconPlate.p2.sx, siliconPlate.p2.sy);
    ctx.lineTo(siliconPlate.p3.sx, siliconPlate.p3.sy);
    ctx.closePath();
    ctx.fill();
    return siliconPlate;
  }

  const siliconPlate = opts.showAerial ? drawSiliconSurface(data) : drawSiliconBase();
  const maskPlate = drawMaskLayer();

  // Soft glossy highlight over silicon plane
  const gloss = ctx.createLinearGradient(0, hPx * 0.28, 0, hPx * 0.86);
  gloss.addColorStop(0, "rgba(255,255,255,0.12)");
  gloss.addColorStop(0.4, "rgba(255,255,255,0.04)");
  gloss.addColorStop(1, "rgba(255,255,255,0.0)");
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, wPx, hPx);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(siliconPlate.p0.sx, siliconPlate.p0.sy);
  ctx.lineTo(siliconPlate.p1.sx, siliconPlate.p1.sy);
  ctx.lineTo(siliconPlate.p2.sx, siliconPlate.p2.sy);
  ctx.lineTo(siliconPlate.p3.sx, siliconPlate.p3.sy);
  ctx.closePath();
  ctx.clip();

  if (opts.showTargetOverlay && opts.targetContours.length) {
    drawContourOnSurface(ctx, opts.targetContours, opts.fovNm, w, h, data, vmin, span, {
      azimuthDeg: opts.azimuthDeg,
      elevationDeg: opts.elevationDeg,
      rollDeg: opts.rollDeg,
      offsetX: opts.offsetX,
      offsetY: opts.offsetY,
      offsetZ: opts.offsetZ,
      zoomScale: opts.zoomScale,
      depthScale: opts.depthScale,
      wPx,
      hPx,
      baseZ: siliconZ + 0.0006,
      featureBoost: surfaceFeatureBoost,
    }, {
      underStroke: "rgba(12,44,46,0.62)",
      underWidth: 3,
      mainStroke: "rgba(98,242,214,0.96)",
      mainWidth: 1.45,
      dash: [5, 3],
      glowColor: "rgba(98,242,214,0.24)",
      glowBlur: 3.8,
      nmPerPixel: opts.nmPerPixel,
    });
  }

  if (opts.showMainContour) {
    drawContourOnSurface(ctx, opts.contours, opts.fovNm, w, h, data, vmin, span, {
      azimuthDeg: opts.azimuthDeg,
      elevationDeg: opts.elevationDeg,
      rollDeg: opts.rollDeg,
      offsetX: opts.offsetX,
      offsetY: opts.offsetY,
      offsetZ: opts.offsetZ,
      zoomScale: opts.zoomScale,
      depthScale: opts.depthScale,
      wPx,
      hPx,
      baseZ: siliconZ,
      featureBoost: surfaceFeatureBoost,
    }, {
      underStroke: "rgba(36,50,76,0.72)",
      underWidth: contourUnder3d,
      mainStroke: "rgba(236,243,255,0.96)",
      mainWidth: contourMain3d,
      glowColor: "rgba(236,243,255,0.2)",
      glowBlur: 3.2,
      nmPerPixel: opts.nmPerPixel,
    });
  }

  if (opts.compareActive) {
    drawContourOnSurface(ctx, opts.compareAContours, opts.fovNm, w, h, data, vmin, span, {
      azimuthDeg: opts.azimuthDeg,
      elevationDeg: opts.elevationDeg,
      rollDeg: opts.rollDeg,
      offsetX: opts.offsetX,
      offsetY: opts.offsetY,
      offsetZ: opts.offsetZ,
      zoomScale: opts.zoomScale,
      depthScale: opts.depthScale,
      wPx,
      hPx,
      baseZ: siliconZ + 0.001,
      featureBoost: surfaceFeatureBoost,
    }, {
      underStroke: "rgba(198,227,255,0.72)",
      underWidth: compareUnder3d,
      mainStroke: COMPARE_A_COLOR,
      mainWidth: compareMain3d,
      dash: compareDash3d,
      glowColor: "rgba(64,158,255,0.35)",
      glowBlur: 4.4,
      nmPerPixel: opts.nmPerPixel,
    });

    drawContourOnSurface(ctx, opts.compareBContours, opts.fovNm, w, h, data, vmin, span, {
      azimuthDeg: opts.azimuthDeg,
      elevationDeg: opts.elevationDeg,
      rollDeg: opts.rollDeg,
      offsetX: opts.offsetX,
      offsetY: opts.offsetY,
      offsetZ: opts.offsetZ,
      zoomScale: opts.zoomScale,
      depthScale: opts.depthScale,
      wPx,
      hPx,
      baseZ: siliconZ + 0.001,
      featureBoost: surfaceFeatureBoost,
    }, {
      underStroke: "rgba(224,202,255,0.76)",
      underWidth: compareUnder3d,
      mainStroke: COMPARE_B_COLOR,
      mainWidth: compareMain3d,
      dash: compareDash3d,
      glowColor: "rgba(191,90,242,0.42)",
      glowBlur: 4.4,
      nmPerPixel: opts.nmPerPixel,
    });
  }
  const drawSweepSet3d = (set: NonNullable<typeof opts.sweepContourSets>[number]) => {
    if (!set.contours.length) return;
    const isMaskPlane = set.plane === "mask";
    drawContourOnSurface(ctx, set.contours, opts.fovNm, w, h, data, vmin, span, {
      azimuthDeg: opts.azimuthDeg,
      elevationDeg: opts.elevationDeg,
      rollDeg: opts.rollDeg,
      offsetX: opts.offsetX,
      offsetY: opts.offsetY,
      offsetZ: opts.offsetZ,
      zoomScale: opts.zoomScale,
      depthScale: opts.depthScale,
      wPx,
      hPx,
      baseZ: set.baseZ ?? (siliconZ + 0.0008),
      featureBoost: surfaceFeatureBoost,
    }, {
      underStroke: set.underColor ?? (isMaskPlane ? "rgba(210,236,255,0.56)" : "rgba(255,224,172,0.42)"),
      underWidth: isMaskPlane ? 2.05 : 1.72,
      mainStroke: set.color,
      mainWidth: isMaskPlane ? 1.38 : 1.25,
      dash: set.dash,
      glowColor: set.color,
      glowBlur: isMaskPlane ? 3.8 : 3.2,
      nmPerPixel: opts.nmPerPixel,
    });
  };

  if (opts.sweepContourSets?.length) {
    for (const set of opts.sweepContourSets) {
      if (set.plane === "mask") continue;
      drawSweepSet3d(set);
    }
  }
  ctx.restore();

  if (opts.sweepContourSets?.some((set) => set.plane === "mask")) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(maskPlate.p0.sx, maskPlate.p0.sy);
    ctx.lineTo(maskPlate.p1.sx, maskPlate.p1.sy);
    ctx.lineTo(maskPlate.p2.sx, maskPlate.p2.sy);
    ctx.lineTo(maskPlate.p3.sx, maskPlate.p3.sy);
    ctx.closePath();
    ctx.clip();
    for (const set of opts.sweepContourSets) {
      if (set.plane !== "mask") continue;
      drawSweepSet3d(set);
    }
    ctx.restore();
  }

  // Vignette and frame finish
  const v = ctx.createRadialGradient(wPx * 0.5, hPx * 0.5, hPx * 0.25, wPx * 0.5, hPx * 0.5, hPx * 0.9);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(4,10,18,0.32)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, wPx, hPx);
  ctx.strokeStyle = "rgba(210,224,242,0.38)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, wPx - 1, hPx - 1);
}

function drawContourOnSurface(
  ctx: CanvasRenderingContext2D,
  contours: Array<{ points_nm: Array<{ x: number; y: number }> }>,
  fovNm: number,
  w: number,
  h: number,
  data: number[],
  vmin: number,
  span: number,
  view: {
    azimuthDeg: number;
    elevationDeg: number;
    rollDeg: number;
    offsetX?: number;
    offsetY?: number;
    offsetZ?: number;
    zoomScale: number;
    depthScale: number;
    wPx: number;
    hPx: number;
    baseZ: number;
    featureBoost?: number;
  },
  style?: {
    underStroke?: string;
    underWidth?: number;
    mainStroke?: string;
    mainWidth?: number;
    dash?: number[];
    glowColor?: string;
    glowBlur?: number;
    nmPerPixel?: number;
  }
) {
  if (!contours?.length) return;
  const project = createSurfaceProjector({
    azimuthDeg: view.azimuthDeg,
    elevationDeg: view.elevationDeg,
    rollDeg: view.rollDeg,
    offsetX: view.offsetX,
    offsetY: view.offsetY,
    offsetZ: view.offsetZ,
    zoomScale: view.zoomScale,
    wPx: view.wPx,
    hPx: view.hPx,
    featureBoost: view.featureBoost,
  });

  function projNm(xNm: number, yNm: number) {
    const X = xNm / fovNm - 0.5;
    const Y = (1 - yNm / fovNm) - 0.5;
    const p = project(X, Y, view.baseZ);
    return { sx: p.sx, sy: p.sy };
  }

  ctx.save();
  const nmPerPixel = Math.max(1e-6, style?.nmPerPixel ?? (fovNm / Math.max(w, h)));

  for (const c of contours) {
    const rawPts = c.points_nm?.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) ?? [];
    const pts = normalizeContourLoop(rawPts, nmPerPixel, fovNm);
    if (pts.length < 2) continue;

    const drawEdgesPath = (closePath: boolean) => {
      ctx.beginPath();
      const p0 = pts[0];
      const p0r = projNm(p0.x, p0.y);
      ctx.moveTo(p0r.sx, p0r.sy);
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        const pr = projNm(p.x, p.y);
        ctx.lineTo(pr.sx, pr.sy);
      }
      if (closePath) {
        ctx.closePath();
      }
    };

    const isClosed =
      pts.length >= 3 &&
      Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) <= Math.max(3, nmPerPixel * 3);

    drawEdgesPath(isClosed);
    ctx.strokeStyle = style?.underStroke ?? "rgba(36,50,76,0.72)";
    ctx.lineWidth = style?.underWidth ?? 3.35;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash(style?.dash?.length ? style.dash : []);
    ctx.stroke();

    drawEdgesPath(isClosed);
    ctx.shadowColor = style?.glowColor ?? "rgba(0,0,0,0)";
    ctx.shadowBlur = style?.glowBlur ?? 0;
    ctx.strokeStyle = style?.mainStroke ?? "rgba(236,243,255,0.96)";
    ctx.lineWidth = style?.mainWidth ?? 1.95;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash(style?.dash?.length ? style.dash : []);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function normalizeContourLoop(
  input: Array<{ x: number; y: number }>,
  nmPerPixel: number,
  fovNm: number
): Array<{ x: number; y: number }> {
  if (!input.length) return [];
  if (input.length <= 2) return input.slice();

  const eps = Math.max(1e-6, nmPerPixel * 0.25);
  const pts: Array<{ x: number; y: number }> = [];
  for (const p of input) {
    if (!pts.length) {
      pts.push(p);
      continue;
    }
    const q = pts[pts.length - 1];
    if (Math.hypot(p.x - q.x, p.y - q.y) >= eps) pts.push(p);
  }
  if (pts.length <= 2) return pts;

  const jumps: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    jumps.push(Math.hypot(b.x - a.x, b.y - a.y));
  }

  const sorted = jumps.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length * 0.5)] || 0;
  const maxJump = Math.max(...jumps);
  const maxIdx = jumps.indexOf(maxJump);
  const seamThreshold = Math.max(median * 6, nmPerPixel * 10, fovNm * 0.03);

  let ordered = pts;
  if (maxJump > seamThreshold && maxIdx >= 0 && maxIdx < pts.length - 1) {
    ordered = pts.slice(maxIdx + 1).concat(pts.slice(0, maxIdx + 1));
  }

  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const closeThreshold = Math.max(median * 2, nmPerPixel * 2.5, 1.5);
  if (Math.hypot(first.x - last.x, first.y - last.y) > closeThreshold) {
    ordered = ordered.concat([{ x: first.x, y: first.y }]);
  }

  return ordered;
}

function maskPathFromRequest(req: SimRequest, fovNm: number): string {
  if (req.mask.mode === "CUSTOM") {
    return (req.mask.shapes ?? []).map((s) => maskShapeToPath(s, fovNm)).join(" ");
  }
  return rectsToPath(maskRectsFromTemplate(req, fovNm), fovNm);
}

function maskShapeToPath(shape: MaskShape, fovNm: number): string {
  if (shape.type === "rect") {
    return rectPath(shape.x_nm, shape.y_nm, shape.w_nm, shape.h_nm, fovNm);
  }
  if (shape.type === "polygon") {
    return polygonPath(shape.points_nm, fovNm);
  }
  return "";
}

function polygonPath(points: Array<{ x_nm: number; y_nm: number }>, fovNm: number): string {
  if (!points?.length) return "";
  const start = points[0];
  let d = `M ${start.x_nm} ${fovNm - start.y_nm}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x_nm} ${fovNm - points[i].y_nm}`;
  }
  return `${d} Z`;
}

function translateMaskShape(shape: MaskShape, dx: number, dy: number): MaskShape {
  if (shape.type === "rect") {
    return {
      ...shape,
      x_nm: shape.x_nm + dx,
      y_nm: shape.y_nm + dy,
    };
  }
  return {
    ...shape,
    points_nm: shape.points_nm.map((p) => ({ x_nm: p.x_nm + dx, y_nm: p.y_nm + dy })),
  };
}

function resizeRectFromCorner(
  start: { type: "rect"; x_nm: number; y_nm: number; w_nm: number; h_nm: number },
  corner: "nw" | "ne" | "sw" | "se",
  px: number,
  py: number,
  fovNm: number
): { type: "rect"; x_nm: number; y_nm: number; w_nm: number; h_nm: number } {
  let x0 = start.x_nm;
  let x1 = start.x_nm + start.w_nm;
  let y0 = start.y_nm;
  let y1 = start.y_nm + start.h_nm;

  if (corner === "nw") {
    x0 = px;
    y1 = py;
  } else if (corner === "ne") {
    x1 = px;
    y1 = py;
  } else if (corner === "sw") {
    x0 = px;
    y0 = py;
  } else if (corner === "se") {
    x1 = px;
    y0 = py;
  }

  const minX = clampNm(Math.min(x0, x1), fovNm);
  const maxX = clampNm(Math.max(x0, x1), fovNm);
  const minY = clampNm(Math.min(y0, y1), fovNm);
  const maxY = clampNm(Math.max(y0, y1), fovNm);
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  return clampRectToFov({ type: "rect", x_nm: minX, y_nm: minY, w_nm: w, h_nm: h }, fovNm);
}

function clampRectToFov(
  rect: { type: "rect"; x_nm: number; y_nm: number; w_nm: number; h_nm: number },
  fovNm: number
): { type: "rect"; x_nm: number; y_nm: number; w_nm: number; h_nm: number } {
  const w_nm = Math.max(1, Math.min(rect.w_nm, fovNm));
  const h_nm = Math.max(1, Math.min(rect.h_nm, fovNm));
  const x_nm = Math.max(0, Math.min(fovNm - w_nm, rect.x_nm));
  const y_nm = Math.max(0, Math.min(fovNm - h_nm, rect.y_nm));
  return { type: "rect", x_nm, y_nm, w_nm, h_nm };
}

function fitDenseLineCountInFov(cdNm: number, pitchNm: number, requestedN: number, fovNm: number): number {
  const cd = Math.max(0, Number.isFinite(cdNm) ? cdNm : 0);
  const pitch = Math.abs(Number.isFinite(pitchNm) ? pitchNm : 0);
  const nReq = Math.max(1, Math.floor(Number.isFinite(requestedN) ? requestedN : 1));
  const fov = Math.max(1e-6, Number.isFinite(fovNm) ? fovNm : 1);
  if (pitch < 1e-9) return 1;
  if (fov <= cd) return 1;
  const maxN = Math.floor((fov - cd) / pitch) + 1;
  return Math.max(1, Math.min(nReq, maxN));
}

function isSquareTemplate(templateId: SimRequest["mask"]["template_id"] | undefined): boolean {
  return templateId === "CONTACT_RAW" || templateId === "CONTACT_OPC_SERIF";
}

function isSteppedTemplate(templateId: SimRequest["mask"]["template_id"] | undefined): boolean {
  return templateId === "STAIRCASE" || templateId === "STAIRCASE_OPC";
}

function pushRect(
  rects: Array<{ x: number; y: number; w: number; h: number }>,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  rects.push({ x, y, w, h });
}

function appendLShapeRaw(
  rects: Array<{ x: number; y: number; w: number; h: number }>,
  p: Record<string, number>,
  cx: number,
  cy: number,
) {
  const cd = p.cd_nm ?? 92;
  const horiz = p.length_nm ?? 470;
  const vert = p.arm_nm ?? 432;
  const elbowX = cx + (p.elbow_x_offset_nm ?? 170);
  const elbowY = cy + (p.elbow_y_offset_nm ?? 132);
  pushRect(rects, elbowX - horiz, elbowY - cd, horiz, cd);
  pushRect(rects, elbowX - cd, elbowY - vert, cd, vert);
}

function appendLShapeOpc(
  rects: Array<{ x: number; y: number; w: number; h: number }>,
  p: Record<string, number>,
  cx: number,
  cy: number,
) {
  const cd = p.cd_nm ?? 92;
  const horiz = p.length_nm ?? 470;
  const vert = p.arm_nm ?? 432;
  const elbowX = cx + (p.elbow_x_offset_nm ?? 170);
  const elbowY = cy + (p.elbow_y_offset_nm ?? 132);
  const horizExt = p.opc_h_ext_nm ?? 26;
  const vertExt = p.opc_v_ext_nm ?? 30;
  const bias = p.opc_bias_nm ?? 14;
  const serif = p.serif_nm ?? 18;
  const leftHammerW = p.left_hammer_w_nm ?? 28;
  const leftHammerH = p.left_hammer_h_nm ?? 124;
  const bottomHammerW = p.bottom_hammer_w_nm ?? 146;
  const bottomHammerH = p.bottom_hammer_h_nm ?? 28;

  const horizH = cd + bias;
  const vertW = cd + bias;
  const xh = elbowX - horiz - horizExt;
  const yh = elbowY - cd - bias * 0.5;
  const xv = elbowX - cd - bias * 0.5;
  const yv = elbowY - vert - vertExt;
  pushRect(rects, xh, yh, horiz + horizExt, horizH);
  pushRect(rects, xv, yv, vertW, vert + vertExt);
  pushRect(rects, xh - 22, yh - 16, leftHammerW, leftHammerH);
  pushRect(rects, xv - 18, yv - 20, bottomHammerW, bottomHammerH);
  pushRect(rects, elbowX - serif * 0.28, elbowY - serif * 0.28, serif, serif);
}

function appendSteppedTrack(
  rects: Array<{ x: number; y: number; w: number; h: number }>,
  x: number,
  y: number,
  thickness: number,
  run: number[],
  rise: number[],
) {
  let nextX = x;
  let nextY = y;
  for (let i = 0; i < run.length; i++) {
    pushRect(rects, nextX, nextY, run[i], thickness);
    if (i >= rise.length) continue;
    nextX = nextX + run[i] - thickness;
    pushRect(rects, nextX, nextY - rise[i], thickness, rise[i] + thickness);
    nextY -= rise[i];
  }
}

function appendSteppedInterconnectRaw(
  rects: Array<{ x: number; y: number; w: number; h: number }>,
  p: Record<string, number>,
  cx: number,
  cy: number,
) {
  const run = p.step_w_nm ?? 180;
  const rise = p.step_h_nm ?? 110;
  const thickness = p.thickness_nm ?? p.cd_nm ?? 88;
  appendSteppedTrack(rects, cx - 300, cy + 90, thickness, [run, run, run + 30], [rise, rise]);
}

function appendSteppedInterconnectOpc(
  rects: Array<{ x: number; y: number; w: number; h: number }>,
  p: Record<string, number>,
  cx: number,
  cy: number,
) {
  const run = p.step_w_nm ?? 180;
  const rise = p.step_h_nm ?? 110;
  const thickness = p.thickness_nm ?? p.cd_nm ?? 88;
  const bias = p.opc_bias_nm ?? 12;
  const endExt = p.end_extension_nm ?? 24;
  const serif = p.serif_nm ?? 18;
  const thick = thickness + bias;
  const x0 = cx - 312 - endExt * 0.5;
  const y0 = cy + 90;

  appendSteppedTrack(rects, x0, y0, thick, [run + endExt, run + 12, run + 30 + endExt], [rise, rise]);
  pushRect(rects, x0 + run - serif * 0.2, y0 - rise + thick - serif * 0.55, serif, serif);
  pushRect(rects, x0 + run + run - thick + 8, y0 - rise - rise + thick - serif * 0.55, serif, serif);
}

function maskRectsFromTemplate(req: SimRequest, fovNm: number): Array<{ x: number; y: number; w: number; h: number }> {
  const t = req.mask.template_id;
  const p = req.mask.params_nm ?? {};
  const fov = p.fov_nm ?? fovNm;
  const cx = fov * 0.5;
  const cy = fov * 0.5;
  const rects: Array<{ x: number; y: number; w: number; h: number }> = [];

  if (req.mask.mode === "CUSTOM") {
    for (const shape of req.mask.shapes ?? []) {
      if (getShapeOp(shape) === "subtract") continue;
      if (shape.type === "rect") {
        rects.push({ x: shape.x_nm, y: shape.y_nm, w: shape.w_nm, h: shape.h_nm });
      } else if (shape.type === "polygon" && shape.points_nm.length >= 3) {
        const xs = shape.points_nm.map((pt) => pt.x_nm);
        const ys = shape.points_nm.map((pt) => pt.y_nm);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        rects.push({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
      }
    }
    return rects;
  }

  if (t === "ISO_LINE") {
    const cd = p.cd_nm ?? 100;
    const h = p.length_nm ?? 900;
    rects.push({ x: cx - cd / 2, y: cy - h / 2, w: cd, h });
  }

  else if (t === "DENSE_LS") {
    const cd = p.cd_nm ?? 60;
    const pitch = p.pitch_nm ?? 140;
    const nReq = Math.max(1, Math.floor(p.n_lines ?? 7));
    const n = fitDenseLineCountInFov(cd, pitch, nReq, fov);
    const h = p.length_nm ?? 900;
    const start = cx - ((n - 1) * pitch) / 2;
    for (let i = 0; i < n; i++) {
      rects.push({ x: start + i * pitch - cd / 2, y: cy - h / 2, w: cd, h });
    }
  }

  else if (t === "LINE_END_RAW") {
    const cd = p.cd_nm ?? 100;
    const h = p.length_nm ?? 900;
    rects.push({ x: cx - cd / 2, y: cy - h / 2, w: cd, h });
  }

  else if (t === "LINE_END_OPC_HAMMER") {
    const cd = p.cd_nm ?? 100;
    const h = p.length_nm ?? 900;
    const hammerW = p.hammer_w_nm ?? Math.max(1.8 * cd, cd + 40);
    const hammerH = p.hammer_h_nm ?? Math.max(0.35 * cd, 24);
    const x = cx - cd / 2;
    const y = cy - h / 2;
    rects.push({ x, y, w: cd, h });
    rects.push({ x: cx - hammerW / 2, y: y + h - hammerH / 2, w: hammerW, h: hammerH });
    rects.push({ x: cx - hammerW / 2, y: y - hammerH / 2, w: hammerW, h: hammerH });
  }

  else if (t === "L_CORNER_RAW") {
    appendLShapeRaw(rects, p, cx, cy);
  }

  else if (t === "L_CORNER_OPC_SERIF") {
    appendLShapeOpc(rects, p, cx, cy);
  }

  else if (t === "CONTACT_RAW") {
    const w = p.w_nm ?? p.cd_nm ?? 100;
    rects.push({ x: cx - w / 2, y: cy - w / 2, w, h: w });
  }

  else if (t === "CONTACT_OPC_SERIF") {
    const w = p.w_nm ?? p.cd_nm ?? 100;
    const serif = p.serif_nm ?? Math.max(0.35 * w, 20);
    const half = w / 2;
    rects.push({ x: cx - half, y: cy - half, w, h: w });
    rects.push({ x: cx - half - serif / 2, y: cy - half - serif / 2, w: serif, h: serif });
    rects.push({ x: cx + half - serif / 2, y: cy - half - serif / 2, w: serif, h: serif });
    rects.push({ x: cx - half - serif / 2, y: cy + half - serif / 2, w: serif, h: serif });
    rects.push({ x: cx + half - serif / 2, y: cy + half - serif / 2, w: serif, h: serif });
  }

  else if (t === "STAIRCASE") {
    appendSteppedInterconnectRaw(rects, p, cx, cy);
  }

  else if (t === "STAIRCASE_OPC") {
    appendSteppedInterconnectOpc(rects, p, cx, cy);
  }

  else {
    const w = p.w_nm ?? 100;
    rects.push({ x: cx - w / 2, y: cy - w / 2, w, h: w });
  }

  // Match backend Phase-1 SRAF append.
  const srafOn = (p.sraf_on ?? 0) >= 0.5;
  if (srafOn) {
    const srafW = p.sraf_w_nm ?? 30;
    const srafOff = p.sraf_offset_nm ?? 80;
    rects.push({ x: cx - srafOff - srafW / 2, y: cy - srafW / 2, w: srafW, h: srafW });
    rects.push({ x: cx + srafOff - srafW / 2, y: cy - srafW / 2, w: srafW, h: srafW });
  }

  for (const shape of req.mask.shapes ?? []) {
    if (getShapeOp(shape) === "subtract") continue;
    if (shape.type === "rect") {
      rects.push({ x: shape.x_nm, y: shape.y_nm, w: shape.w_nm, h: shape.h_nm });
    } else if (shape.type === "polygon" && shape.points_nm.length >= 3) {
      const xs = shape.points_nm.map((pt) => pt.x_nm);
      const ys = shape.points_nm.map((pt) => pt.y_nm);
      rects.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
    }
  }

  return rects;
}

function rectsToPath(rects: Array<{ x: number; y: number; w: number; h: number }>, fovNm: number): string {
  return rects.map((r) => rectPath(r.x, r.y, r.w, r.h, fovNm)).join(" ");
}

function rectsToClosedContours(rects: Array<{ x: number; y: number; w: number; h: number }>): Array<{ points_nm: Array<{ x: number; y: number }> }> {
  return rects.map((r) => ({
    points_nm: [
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x + r.w, y: r.y + r.h },
      { x: r.x, y: r.y + r.h },
      { x: r.x, y: r.y },
    ],
  }));
}

function rectBooleanContours(
  addRects: Array<{ x: number; y: number; w: number; h: number }>,
  subtractRects: Array<{ x: number; y: number; w: number; h: number }>
): Array<{ points_nm: Array<{ x: number; y: number }> }> {
  if (!addRects.length) return [];
  const xs = Array.from(new Set(addRects.concat(subtractRects).flatMap((r) => [r.x, r.x + r.w]))).sort((a, b) => a - b);
  const ys = Array.from(new Set(addRects.concat(subtractRects).flatMap((r) => [r.y, r.y + r.h]))).sort((a, b) => a - b);
  if (xs.length < 2 || ys.length < 2) return rectsToClosedContours(addRects);

  const filled = new Set<string>();
  for (let yi = 0; yi < ys.length - 1; yi++) {
    const y0 = ys[yi];
    const y1 = ys[yi + 1];
    const cy = (y0 + y1) * 0.5;
    for (let xi = 0; xi < xs.length - 1; xi++) {
      const x0 = xs[xi];
      const x1 = xs[xi + 1];
      const cx = (x0 + x1) * 0.5;
      const inAdd = addRects.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h);
      if (!inAdd) continue;
      const inSubtract = subtractRects.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h);
      if (!inSubtract) filled.add(`${xi},${yi}`);
    }
  }
  if (!filled.size) return [];

  const edges: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> = [];
  const has = (xi: number, yi: number) => filled.has(`${xi},${yi}`);
  for (let yi = 0; yi < ys.length - 1; yi++) {
    for (let xi = 0; xi < xs.length - 1; xi++) {
      if (!has(xi, yi)) continue;
      const x0 = xs[xi];
      const x1 = xs[xi + 1];
      const y0 = ys[yi];
      const y1 = ys[yi + 1];
      if (!has(xi, yi - 1)) edges.push({ from: { x: x0, y: y0 }, to: { x: x1, y: y0 } });
      if (!has(xi + 1, yi)) edges.push({ from: { x: x1, y: y0 }, to: { x: x1, y: y1 } });
      if (!has(xi, yi + 1)) edges.push({ from: { x: x1, y: y1 }, to: { x: x0, y: y1 } });
      if (!has(xi - 1, yi)) edges.push({ from: { x: x0, y: y1 }, to: { x: x0, y: y0 } });
    }
  }

  const keyOf = (p: { x: number; y: number }) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
  const startMap = new Map<string, number[]>();
  edges.forEach((edge, idx) => {
    const key = keyOf(edge.from);
    const list = startMap.get(key);
    if (list) list.push(idx);
    else startMap.set(key, [idx]);
  });
  const used = new Set<number>();
  const contours: Array<{ points_nm: Array<{ x: number; y: number }> }> = [];

  for (let i = 0; i < edges.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const points = [edges[i].from, edges[i].to];
    let current = edges[i].to;
    const startKey = keyOf(edges[i].from);
    while (keyOf(current) !== startKey) {
      const nextList = startMap.get(keyOf(current)) ?? [];
      const nextIdx = nextList.find((idx) => !used.has(idx));
      if (nextIdx == null) break;
      used.add(nextIdx);
      current = edges[nextIdx].to;
      points.push(current);
    }
    const simplified = simplifyOrthogonalLoop(points);
    if (simplified.length >= 4) contours.push({ points_nm: simplified });
  }
  return contours;
}

function simplifyOrthogonalLoop(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length <= 2) return points;
  const deduped: Array<{ x: number; y: number }> = [];
  for (const point of points) {
    const prev = deduped[deduped.length - 1];
    if (!prev || prev.x !== point.x || prev.y !== point.y) deduped.push(point);
  }
  if (deduped.length > 1) {
    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    if (first.x !== last.x || first.y !== last.y) deduped.push({ ...first });
  }
  let changed = true;
  while (changed && deduped.length >= 4) {
    changed = false;
    for (let i = 1; i < deduped.length - 1; i++) {
      const a = deduped[i - 1];
      const b = deduped[i];
      const c = deduped[i + 1];
      const collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
      if (collinear) {
        deduped.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return deduped;
}

function rectsToMaskShapes(rects: Array<{ x: number; y: number; w: number; h: number }>): Array<MaskShape> {
  return rects.map((rect) => ({ type: "rect", x_nm: rect.x, y_nm: rect.y, w_nm: rect.w, h_nm: rect.h }));
}

function shapesToRects(shapes: Array<MaskShape>): Array<{ x: number; y: number; w: number; h: number }> {
  const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (const shape of shapes) {
    if (shape.type === "rect") {
      rects.push({ x: shape.x_nm, y: shape.y_nm, w: shape.w_nm, h: shape.h_nm });
      continue;
    }
    if (shape.points_nm.length < 3) continue;
    const xs = shape.points_nm.map((point) => point.x_nm);
    const ys = shape.points_nm.map((point) => point.y_nm);
    rects.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
  }
  return rects;
}

function cloneViewportShape(shape: MaskShape): MaskShape {
  if (shape.type === "rect") return { ...shape };
  return { ...shape, points_nm: shape.points_nm.map((point) => ({ ...point })) };
}

function buildSweepMaskRequest(baseReq: SimRequest, param: SweepParam, value: number, customTargetIndex: number): SimRequest {
  const next: SimRequest = {
    ...baseReq,
    mask: {
      ...baseReq.mask,
      params_nm: { ...(baseReq.mask.params_nm ?? {}) },
      shapes: baseReq.mask.shapes?.map((s) => (
        s.type === "rect"
          ? { ...s }
          : { ...s, points_nm: s.points_nm.map((p) => ({ ...p })) }
      )),
    },
  };
  if (param === "dose") return next;
  if (param === "pitch") {
    next.mask.params_nm.pitch_nm = value;
    return next;
  }
  if (param === "serif") {
    next.mask.params_nm.serif_nm = Math.max(1, value);
    return next;
  }
  if (next.mask.mode === "CUSTOM") {
    const shapes = next.mask.shapes ?? [];
    const idx = Math.max(0, Math.min(customTargetIndex, Math.max(0, shapes.length - 1)));
    const s = shapes[idx];
    if (s && s.type === "rect") {
      if (param === "width") {
        const cx = s.x_nm + s.w_nm * 0.5;
        s.w_nm = Math.max(1, value);
        s.x_nm = cx - s.w_nm * 0.5;
      } else if (param === "height") {
        const cy = s.y_nm + s.h_nm * 0.5;
        s.h_nm = Math.max(1, value);
        s.y_nm = cy - s.h_nm * 0.5;
      }
    }
    return next;
  }
  if (param === "width") {
    const t = next.mask.template_id;
    if (isSquareTemplate(t)) {
      next.mask.params_nm.w_nm = value;
    } else if (isSteppedTemplate(t)) {
      next.mask.params_nm.thickness_nm = value;
    } else {
      next.mask.params_nm.cd_nm = value;
    }
    return next;
  }
  if (param === "height") {
    const t = next.mask.template_id;
    if (isSteppedTemplate(t)) next.mask.params_nm.step_h_nm = value;
    else next.mask.params_nm.length_nm = value;
  }
  return next;
}

function rectsBoundsSvg(rects: Array<{ x: number; y: number; w: number; h: number }>, fovNm: number) {
  if (!rects.length) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const r of rects) {
    const x0 = r.x;
    const x1 = r.x + r.w;
    const y0 = fovNm - (r.y + r.h);
    const y1 = fovNm - r.y;
    minX = Math.min(minX, x0);
    maxX = Math.max(maxX, x1);
    minY = Math.min(minY, y0);
    maxY = Math.max(maxY, y1);
  }
  return { minX, minY, maxX, maxY };
}

function rectPath(x: number, y: number, w: number, h: number, fovNm: number): string {
  const yTop = fovNm - (y + h);
  const yBottom = fovNm - y;
  return `M ${x} ${yTop} H ${x + w} V ${yBottom} H ${x} Z`;
}

function estimateMaskCdNm(req: SimRequest, resolvedMaskShapes?: Array<MaskShape>): number {
  if (resolvedMaskShapes?.length) {
    const shapes = resolvedMaskShapes.filter((shape) => getShapeOp(shape) !== "subtract");
    if (!shapes.length) return 100;
    const first = shapes[0];
    if (first.type === "rect") return Math.max(1, first.w_nm);
    const xs = first.points_nm.map((p) => p.x_nm);
    if (!xs.length) return 100;
    return Math.max(1, Math.max(...xs) - Math.min(...xs));
  }
  if (req.mask.mode === "CUSTOM") {
    const shapes = (req.mask.shapes ?? []).filter((shape) => getShapeOp(shape) !== "subtract");
    if (!shapes.length) return 100;
    const first = shapes[0];
    if (first.type === "rect") return Math.max(1, first.w_nm);
    const xs = first.points_nm.map((p) => p.x_nm);
    if (!xs.length) return 100;
    return Math.max(1, Math.max(...xs) - Math.min(...xs));
  }
  const p = req.mask.params_nm ?? {};
  const t = req.mask.template_id;
  if (isSquareTemplate(t)) return p.w_nm ?? p.cd_nm ?? 100;
  if (isSteppedTemplate(t)) return p.thickness_nm ?? p.cd_nm ?? 88;
  return p.cd_nm ?? 100;
}

function calcContourStrokeScale(
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null,
  fovNm: number
): number {
  if (!bounds) return 1;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  const ratio = span / Math.max(1, fovNm);
  const raw = 0.28 + ratio * 1.4;
  return Math.max(0.32, Math.min(1.08, raw));
}

function calcContourStrokeScaleFromRects(
  rects: Array<{ x: number; y: number; w: number; h: number }>,
  fovNm: number
): number {
  if (!rects.length) return 1;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  const span = Math.max(maxX - minX, maxY - minY);
  const ratio = span / Math.max(1, fovNm);
  const raw = 0.28 + ratio * 1.4;
  return Math.max(0.32, Math.min(1.08, raw));
}

function calcSurfaceFeatureBoost(
  rects: Array<{ x: number; y: number; w: number; h: number }>,
  fovNm: number
): number {
  if (!rects.length) return 1;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  const span = Math.max(maxX - minX, maxY - minY);
  const ratio = span / Math.max(1, fovNm);
  const boost = 0.62 / Math.max(0.05, ratio);
  return Math.max(1, Math.min(3.2, boost));
}

function calcFitScale(bounds: { minX: number; minY: number; maxX: number; maxY: number }, fovNm: number): number {
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  const target = fovNm * 0.6;
  const fit = Math.min(target / w, target / h);
  return Math.max(0.6, Math.min(12, fit));
}

function CdRuler(props: {
  x0: number;
  x1: number;
  y: number;
  axis: "H" | "V";
  color: string;
  label: string;
  labelDy: number;
  zoomScale: number;
  onGrab: (
    target: "mask-start" | "mask-end" | "mask-line" | "contour-start" | "contour-end" | "contour-line",
    p: { x: number; y: number }
  ) => void;
  handlePrefix: "mask" | "contour";
  selected: boolean;
}) {
  const { x0, x1, y, axis, color, label, labelDy, zoomScale, onGrab, handlePrefix, selected } = props;
  const invZoom = 1 / Math.max(0.25, Math.min(16, zoomScale || 1));
  const tick = 6 * invZoom;
  const centerPrimary = (x0 + x1) * 0.5;
  const fontSize = (selected ? 23 : 20) * invZoom;
  const labelColor =
    handlePrefix === "contour"
      ? selected
        ? "rgba(238,244,255,0.96)"
        : "rgba(224,234,248,0.92)"
      : selected
        ? "rgba(255,132,184,0.98)"
        : "rgba(246,119,174,0.94)";
  const startTarget = `${handlePrefix}-start` as
    | "mask-start"
    | "mask-end"
    | "mask-line"
    | "contour-start"
    | "contour-end"
    | "contour-line";
  const endTarget = `${handlePrefix}-end` as
    | "mask-start"
    | "mask-end"
    | "mask-line"
    | "contour-start"
    | "contour-end"
    | "contour-line";
  const lineTarget = `${handlePrefix}-line` as
    | "mask-start"
    | "mask-end"
    | "mask-line"
    | "contour-start"
    | "contour-end"
    | "contour-line";
  const isH = axis === "H";
  const lineX1 = isH ? x0 : y;
  const lineY1 = isH ? y : x0;
  const lineX2 = isH ? x1 : y;
  const lineY2 = isH ? y : x1;
  const tickAX1 = isH ? x0 : y - tick;
  const tickAY1 = isH ? y - tick : x0;
  const tickAX2 = isH ? x0 : y + tick;
  const tickAY2 = isH ? y + tick : x0;
  const tickBX1 = isH ? x1 : y - tick;
  const tickBY1 = isH ? y - tick : x1;
  const tickBX2 = isH ? x1 : y + tick;
  const tickBY2 = isH ? y + tick : x1;
  const handleA = { x: isH ? x0 : y, y: isH ? y : x0 };
  const handleB = { x: isH ? x1 : y, y: isH ? y : x1 };
  const labelX = isH ? centerPrimary : y + labelDy * invZoom;
  const labelY = isH ? y + labelDy * invZoom : centerPrimary;
  const labelAnchor = isH ? "middle" : "start";
  return (
    <g>
      <line
        x1={lineX1}
        y1={lineY1}
        x2={lineX2}
        y2={lineY2}
        stroke={color}
        strokeWidth={(selected ? 2.2 : 1.7) * invZoom}
        style={{ cursor: "move" }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onGrab(lineTarget, { x: e.clientX, y: e.clientY });
        }}
      />
      <line x1={tickAX1} y1={tickAY1} x2={tickAX2} y2={tickAY2} stroke={color} strokeWidth={(selected ? 2.2 : 1.7) * invZoom} />
      <line x1={tickBX1} y1={tickBY1} x2={tickBX2} y2={tickBY2} stroke={color} strokeWidth={(selected ? 2.2 : 1.7) * invZoom} />
      <circle
        cx={handleA.x}
        cy={handleA.y}
        r={(selected ? 5 : 4.2) * invZoom}
        fill={color}
        style={{ cursor: isH ? "ew-resize" : "ns-resize" }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onGrab(startTarget, { x: e.clientX, y: e.clientY });
        }}
      />
      <circle
        cx={handleB.x}
        cy={handleB.y}
        r={(selected ? 5 : 4.2) * invZoom}
        fill={color}
        style={{ cursor: isH ? "ew-resize" : "ns-resize" }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onGrab(endTarget, { x: e.clientX, y: e.clientY });
        }}
      />
      <text
        x={labelX}
        y={labelY}
        fill={labelColor}
        fontSize={fontSize}
        fontWeight={selected ? 610 : 560}
        textAnchor={labelAnchor}
        style={{ letterSpacing: 0.02, opacity: selected ? 1 : 0.92 }}
      >
        {label}
      </text>
    </g>
  );
}

function clampNm(v: number, fovNm: number): number {
  return Math.max(0, Math.min(fovNm, v));
}

function normalizeRuler(r: { x0: number; x1: number; y: number }, fovNm: number) {
  let x0 = clampNm(r.x0, fovNm);
  let x1 = clampNm(r.x1, fovNm);
  if (x1 < x0) [x0, x1] = [x1, x0];
  if (x1 - x0 < 1) x1 = Math.min(fovNm, x0 + 1);
  const y = clampNm(r.y, fovNm);
  return { x0, x1, y };
}

function RulerNumericEditor(props: {
  ruler: { x0: number; x1: number; y: number } | null;
  disabled: boolean;
  onChange: (next: { x0: number; x1: number; y: number }) => void;
  onCommit?: () => void;
}) {
  const { ruler, disabled, onChange, onCommit } = props;
  const [centerText, setCenterText] = useState("0");
  const [yText, setYText] = useState("0");
  const [widthText, setWidthText] = useState("0");

  useEffect(() => {
    if (!ruler) {
      setCenterText("0");
      setYText("0");
      setWidthText("0");
      return;
    }
    setCenterText(String(Math.round((ruler.x0 + ruler.x1) * 0.5)));
    setYText(String(Math.round(ruler.y)));
    setWidthText(String(Math.round(Math.abs(ruler.x1 - ruler.x0))));
  }, [ruler?.x0, ruler?.x1, ruler?.y]);

  function commit(next?: { center?: string; y?: string; width?: string }) {
    if (!ruler) return;
    const center = Number(next?.center ?? centerText);
    const y = Number(next?.y ?? yText);
    const width = Math.max(1, Number(next?.width ?? widthText));
    if (!Number.isFinite(center) || !Number.isFinite(y) || !Number.isFinite(width)) return;
    onChange({ x0: center - width * 0.5, x1: center + width * 0.5, y });
    onCommit?.();
  }

  function onEnter(e: React.KeyboardEvent<HTMLInputElement>, payload?: { center?: string; y?: string; width?: string }) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    commit(payload);
  }

  return (
    <>
      <label>Center X</label>
      <input
        type="number"
        disabled={disabled}
        value={centerText}
        style={{ width: 88 }}
        onChange={(e) => {
          setCenterText(e.target.value);
        }}
        onBlur={() => commit()}
        onKeyDown={(e) => onEnter(e, { center: (e.target as HTMLInputElement).value })}
      />
      <label>Y</label>
      <input
        type="number"
        disabled={disabled}
        value={yText}
        style={{ width: 80 }}
        onChange={(e) => {
          setYText(e.target.value);
        }}
        onBlur={() => commit()}
        onKeyDown={(e) => onEnter(e, { y: (e.target as HTMLInputElement).value })}
      />
      <label>Width</label>
      <input
        type="number"
        disabled={disabled}
        value={widthText}
        style={{ width: 88 }}
        onChange={(e) => {
          setWidthText(e.target.value);
        }}
        onBlur={() => commit()}
        onKeyDown={(e) => onEnter(e, { width: (e.target as HTMLInputElement).value })}
      />
    </>
  );
}

function snapRulerToRectEdges(
  ruler: { x0: number; x1: number; y: number },
  rects: Array<{ x: number; y: number; w: number; h: number }>,
  fovNm: number,
  axis: "H" | "V"
) {
  const center = (ruler.x0 + ruler.x1) * 0.5;
  const pairAtScan = (scan: number) => {
    const hits = axis === "H"
      ? intersectionsWithRectsAtY(rects, scan, fovNm)
      : intersectionsWithRectsAtX(rects, scan, fovNm);
    return pickIntersectionPair(hits, center);
  };

  const directPair = pairAtScan(ruler.y);
  if (directPair) return { ...ruler, x0: directPair[0], x1: directPair[1] };

  const nearestScan = findNearestRectScan(rects, ruler.y, fovNm, axis);
  if (nearestScan == null) return ruler;

  const nearestPair = pairAtScan(nearestScan);
  if (!nearestPair) return { ...ruler, y: nearestScan };
  return { ...ruler, x0: nearestPair[0], x1: nearestPair[1], y: nearestScan };
}

function snapRulerToContourEdges(
  ruler: { x0: number; x1: number; y: number },
  contours: Array<{ points_nm: Array<{ x: number; y: number }> }>,
  fovNm: number,
  axis: "H" | "V",
  fallbackRects: Array<{ x: number; y: number; w: number; h: number }> = []
) {
  const center = (ruler.x0 + ruler.x1) * 0.5;
  const pairAtScan = (scan: number): [number, number] | null => {
    const hits: number[] = [];
    for (const c of contours) {
      const pts = c.points_nm;
      if (!pts || pts.length < 2) continue;
      for (let i = 0; i < pts.length - 1; i++) {
        const x1 = pts[i].x;
        const y1 = fovNm - pts[i].y;
        const x2 = pts[i + 1].x;
        const y2 = fovNm - pts[i + 1].y;
        if (axis === "H") collectSegmentIntersectionAtY(hits, x1, y1, x2, y2, scan);
        else collectSegmentIntersectionAtX(hits, x1, y1, x2, y2, scan);
      }
    }
    return pickIntersectionPair(hits, center);
  };

  const directPair = pairAtScan(ruler.y);
  if (directPair) return { ...ruler, x0: directPair[0], x1: directPair[1] };

  const scanAnchors: number[] = [];
  if (fallbackRects.length) {
    const nearest = findNearestRectScan(fallbackRects, ruler.y, fovNm, axis);
    if (nearest != null) scanAnchors.push(nearest);
  }
  if (scanAnchors.length === 0) scanAnchors.push(ruler.y);

  let best: { pair: [number, number]; scan: number; dist: number } | null = null;
  const register = (scan: number, pair: [number, number] | null) => {
    if (!pair) return;
    const dist = Math.abs(scan - ruler.y);
    if (!best || dist < best.dist) {
      best = { pair, scan, dist };
    }
  };

  for (const anchor of scanAnchors) {
    register(anchor, pairAtScan(anchor));
    const stepNm = 2;
    const maxSteps = 72;
    for (let i = 1; i <= maxSteps; i++) {
      const delta = i * stepNm;
      const s1 = anchor - delta;
      const s2 = anchor + delta;
      if (s1 >= 0) register(s1, pairAtScan(s1));
      if (s2 <= fovNm) register(s2, pairAtScan(s2));
      if (best) break;
    }
    if (best) break;
  }

  if (!best) return ruler;
  return { ...ruler, x0: best.pair[0], x1: best.pair[1], y: best.scan };
}

function findNearestRectScan(
  rects: Array<{ x: number; y: number; w: number; h: number }>,
  scan: number,
  fovNm: number,
  axis: "H" | "V"
): number | null {
  let bestScan: number | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const r of rects) {
    const spanStart = axis === "H" ? fovNm - (r.y + r.h) : r.x;
    const spanEnd = axis === "H" ? fovNm - r.y : (r.x + r.w);
    const lo = Math.min(spanStart, spanEnd);
    const hi = Math.max(spanStart, spanEnd);
    if (hi - lo < 1e-6) continue;

    const candidate = Math.max(lo, Math.min(hi, scan));
    const dist = Math.abs(candidate - scan);
    if (dist < bestDist) {
      bestDist = dist;
      bestScan = candidate;
    }
  }

  return bestScan;
}

function intersectionsWithRectsAtY(
  rects: Array<{ x: number; y: number; w: number; h: number }>,
  y: number,
  fovNm: number
): number[] {
  const xs: number[] = [];
  for (const r of rects) {
    const x0 = r.x;
    const x1 = r.x + r.w;
    const yTop = fovNm - (r.y + r.h);
    const yBottom = fovNm - r.y;
    if (y >= yTop && y <= yBottom) {
      xs.push(x0, x1);
    }
  }
  return uniqueSorted(xs);
}

function intersectionsWithRectsAtX(
  rects: Array<{ x: number; y: number; w: number; h: number }>,
  x: number,
  fovNm: number
): number[] {
  const ys: number[] = [];
  for (const r of rects) {
    const x0 = r.x;
    const x1 = r.x + r.w;
    if (!(x >= x0 && x <= x1)) continue;
    const yTop = fovNm - (r.y + r.h);
    const yBottom = fovNm - r.y;
    ys.push(yTop, yBottom);
  }
  return uniqueSorted(ys);
}

function collectSegmentIntersectionAtY(xs: number[], x1: number, y1: number, x2: number, y2: number, y: number) {
  if (Math.abs(y2 - y1) < 1e-9) return;
  const lo = Math.min(y1, y2);
  const hi = Math.max(y1, y2);
  if (!(y >= lo && y < hi)) return;
  const t = (y - y1) / (y2 - y1);
  if (t < 0 || t > 1) return;
  xs.push(x1 + t * (x2 - x1));
}

function collectSegmentIntersectionAtX(ys: number[], x1: number, y1: number, x2: number, y2: number, x: number) {
  if (Math.abs(x2 - x1) < 1e-9) return;
  const lo = Math.min(x1, x2);
  const hi = Math.max(x1, x2);
  if (!(x >= lo && x < hi)) return;
  const t = (x - x1) / (x2 - x1);
  if (t < 0 || t > 1) return;
  ys.push(y1 + t * (y2 - y1));
}

function pickIntersectionPair(xsRaw: number[], centerX: number): [number, number] | null {
  const xs = uniqueSorted(xsRaw);
  if (xs.length < 2) return null;
  let left: number | null = null;
  let right: number | null = null;
  for (const x of xs) {
    if (x <= centerX) left = x;
    if (x >= centerX && right === null) right = x;
  }
  if (left !== null && right !== null && right > left) return [left, right];
  let best: [number, number] | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < xs.length - 1; i++) {
    if (xs[i + 1] <= xs[i]) continue;
    const mid = (xs[i] + xs[i + 1]) * 0.5;
    const d = Math.abs(mid - centerX);
    if (d < bestDist) {
      bestDist = d;
      best = [xs[i], xs[i + 1]];
    }
  }
  return best;
}

function uniqueSorted(xs: number[]): number[] {
  if (!xs.length) return [];
  const arr = [...xs].sort((a, b) => a - b);
  const out = [arr[0]];
  for (let i = 1; i < arr.length; i++) {
    if (Math.abs(arr[i] - out[out.length - 1]) > 1e-6) out.push(arr[i]);
  }
  return out;
}

function splitContourAdaptive(
  pts: Array<{ x: number; y: number }>,
  nmPerPixel: number,
  fovNm: number
): Array<Array<{ x: number; y: number }>> {
  if (pts.length < 3) return [];
  const jumps: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    jumps.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const cutoff = inferAdaptiveJumpCutoff(jumps, nmPerPixel, fovNm);
  if (!Number.isFinite(cutoff)) return [pts];

  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const d = jumps[i - 1];
    if (d > cutoff) {
      if (current.length >= 3) segments.push(current);
      current = [pts[i]];
    } else {
      current.push(pts[i]);
    }
  }
  if (current.length >= 3) segments.push(current);
  return segments.length ? segments : [pts];
}

function inferAdaptiveJumpCutoff(jumps: number[], nmPerPixel: number, fovNm: number): number {
  if (!jumps.length) return Number.POSITIVE_INFINITY;
  const sorted = [...jumps].filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length < 8) return Number.POSITIVE_INFINITY;

  const floor = Math.max(nmPerPixel * 1.5, 0.2);
  let bestIdx = -1;
  let bestRatio = 1;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = Math.max(sorted[i], floor);
    const b = sorted[i + 1];
    const ratio = b / a;
    const delta = b - a;
    if (ratio > bestRatio && ratio >= 3.0 && delta >= Math.max(nmPerPixel * 3, 1.0)) {
      bestRatio = ratio;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return Number.POSITIVE_INFINITY;
  const low = sorted[bestIdx];
  const high = sorted[bestIdx + 1];
  const cutoffRaw = Math.sqrt(low * high);
  // Hard cap in pixel-domain: block inter-feature bridges, but keep in-loop continuity.
  const capPx = 24.0;
  const capNm = capPx * nmPerPixel;
  const minNm = Math.max(nmPerPixel * 6.0, 1.2);
  // Guard floor to avoid over-splitting at rounded ends on dense patterns.
  const continuityFloorNm = Math.max(nmPerPixel * 18.0, 6.0);
  return Math.max(minNm, Math.max(continuityFloorNm, Math.min(cutoffRaw, capNm, fovNm * 0.15)));
}

function buildJumpHistogram(jumps: number[], bins: number): Array<{ range_nm: string; count: number }> {
  if (!jumps.length || bins < 1) return [];
  const finite = jumps.filter(Number.isFinite);
  if (!finite.length) return [];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (Math.abs(max - min) < 1e-12) {
    return [{ range_nm: `${min.toFixed(2)}..${max.toFixed(2)}`, count: finite.length }];
  }
  const width = (max - min) / bins;
  const counts = new Array<number>(bins).fill(0);
  for (const v of finite) {
    const raw = Math.floor((v - min) / width);
    const idx = Math.max(0, Math.min(bins - 1, raw));
    counts[idx] += 1;
  }
  const out: Array<{ range_nm: string; count: number }> = [];
  for (let i = 0; i < bins; i++) {
    const a = min + i * width;
    const b = i === bins - 1 ? max : min + (i + 1) * width;
    out.push({ range_nm: `${a.toFixed(2)}..${b.toFixed(2)}`, count: counts[i] });
  }
  return out;
}

function appleColorMap(tRaw: number): { r: number; g: number; b: number } {
  const t = Math.max(0, Math.min(1, tRaw));
  const stops = [
    { t: 0.0, c: [14, 20, 30] },     // deep slate
    { t: 0.22, c: [39, 67, 108] },   // steel blue
    { t: 0.45, c: [94, 92, 230] },   // indigo
    { t: 0.68, c: [191, 90, 242] },  // purple
    { t: 0.86, c: [255, 69, 58] },   // warm red
    { t: 1.0, c: [255, 214, 10] },   // yellow
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t >= a.t && t <= b.t) {
      const u = (t - a.t) / Math.max(1e-9, b.t - a.t);
      return {
        r: Math.round(a.c[0] + (b.c[0] - a.c[0]) * u),
        g: Math.round(a.c[1] + (b.c[1] - a.c[1]) * u),
        b: Math.round(a.c[2] + (b.c[2] - a.c[2]) * u),
      };
    }
  }
  const last = stops[stops.length - 1].c;
  return { r: last[0], g: last[1], b: last[2] };
}





