import type { MaskShape, PresetID, RectMaskShape, ShapeOp, SimResponse, TemplateID } from "./types";

export type EditorLayer = "MASK" | "TARGET";
export type EditorTool = "SELECT" | "DRAW_ADD_RECT" | "DRAW_SUBTRACT_RECT" | "PLACE_SRAF";
export type EdgeAnchor = "left" | "right" | "top" | "bottom";
export type CornerAnchor = "nw" | "ne" | "sw" | "se";
export type SrafOrientation = "horizontal" | "vertical";

type TargetContour = {
  points_nm: Array<{ x: number; y: number }>;
};

export type TargetGuide = {
  title: string;
  subtitle: string;
  objective: string;
  hint: string;
  hotspotThresholdNm: number;
  baselineShapeCount: number;
  targetShapes: Array<MaskShape>;
  targetContours: Array<TargetContour>;
};

export type TargetScoreMetrics = {
  epeMeanNm: number | null;
  epeMaxNm: number | null;
  hotspotCount: number;
  hotspotPenalty: number;
  complexityPenalty: number;
  penaltyIndex: number;
  score: number | null;
  grade: string;
  recommendation: string;
  hotspotMarkers: Array<{ x: number; y: number; severity: "warn" | "critical" }>;
};

function rect(x_nm: number, y_nm: number, w_nm: number, h_nm: number, op: ShapeOp = "add"): RectMaskShape {
  return { type: "rect", op, x_nm, y_nm, w_nm, h_nm };
}

export function getShapeOp(shape: MaskShape): ShapeOp {
  return shape.op === "subtract" ? "subtract" : "add";
}

export function cloneMaskShapes(shapes: Array<MaskShape>): Array<MaskShape> {
  return shapes.map((shape) => (
    shape.type === "rect"
      ? { ...shape }
      : { ...shape, points_nm: shape.points_nm.map((point) => ({ ...point })) }
  ));
}

function defaultPresetSubtitle(presetId: PresetID): string {
  switch (presetId) {
    case "DUV_193_DRY":
      return "DUV | 193 nm Dry";
    case "DUV_193_IMM":
      return "DUV | 193 nm Immersion";
    case "EUV_LNA":
      return "EUV | 13.5 nm Low-NA";
    case "EUV_HNA":
      return "EUV | 13.5 nm High-NA";
    default:
      return presetId;
  }
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

function templateRawShapes(templateId: TemplateID, params: Record<string, number>): Array<MaskShape> {
  const fov = params.fov_nm ?? 1100;
  const cx = fov * 0.5;
  const cy = fov * 0.5;

  if (templateId === "ISO_LINE" || templateId === "LINE_END_RAW" || templateId === "LINE_END_OPC_HAMMER") {
    const cd = params.cd_nm ?? 100;
    const h = params.length_nm ?? 900;
    return [rect(cx - cd / 2, cy - h / 2, cd, h)];
  }

  if (templateId === "DENSE_LS") {
    const cd = params.cd_nm ?? 60;
    const pitch = params.pitch_nm ?? 140;
    const nReq = Math.max(1, Math.floor(params.n_lines ?? 7));
    const n = fitDenseLineCountInFov(cd, pitch, nReq, fov);
    const h = params.length_nm ?? 900;
    const start = cx - ((n - 1) * pitch) / 2;
    return Array.from({ length: n }, (_, index) => rect(start + index * pitch - cd / 2, cy - h / 2, cd, h));
  }

  if (templateId === "CONTACT_RAW" || templateId === "CONTACT_OPC_SERIF") {
    const w = params.w_nm ?? params.cd_nm ?? 116;
    return [rect(cx - w / 2, cy - w / 2, w, w)];
  }

  if (templateId === "L_CORNER_RAW" || templateId === "L_CORNER_OPC_SERIF") {
    const cd = params.cd_nm ?? 92;
    const horiz = params.length_nm ?? 470;
    const vert = params.arm_nm ?? 432;
    const elbowX = cx + (params.elbow_x_offset_nm ?? 170);
    const elbowY = cy + (params.elbow_y_offset_nm ?? 132);
    return [
      rect(elbowX - horiz, elbowY - cd, horiz, cd),
      rect(elbowX - cd, elbowY - vert, cd, vert),
    ];
  }

  if (templateId === "STAIRCASE" || templateId === "STAIRCASE_OPC") {
    const run = params.step_w_nm ?? 180;
    const rise = params.step_h_nm ?? 110;
    const thickness = params.thickness_nm ?? params.cd_nm ?? 88;
    return [
      rect(cx - 300, cy + 90, run, thickness),
      rect(cx - 208, cy + 90 - rise, thickness, rise + thickness),
      rect(cx - 208, cy + 90 - rise, run, thickness),
      rect(cx - 116, cy + 90 - rise - rise, thickness, rise + thickness),
      rect(cx - 116, cy + 90 - rise - rise, run + 30, thickness),
    ];
  }

  const fallback = params.w_nm ?? params.cd_nm ?? 100;
  return [rect(cx - fallback / 2, cy - fallback / 2, fallback, fallback)];
}

function rectContours(shapes: Array<MaskShape>): Array<TargetContour> {
  const rects = shapes.filter((shape): shape is RectMaskShape => shape.type === "rect" && getShapeOp(shape) !== "subtract");
  if (!rects.length) return [];

  const xs = Array.from(new Set(rects.flatMap((shape) => [shape.x_nm, shape.x_nm + shape.w_nm]))).sort((a, b) => a - b);
  const ys = Array.from(new Set(rects.flatMap((shape) => [shape.y_nm, shape.y_nm + shape.h_nm]))).sort((a, b) => a - b);
  if (xs.length < 2 || ys.length < 2) {
    return rects.map((shape) => ({
      points_nm: [
        { x: shape.x_nm, y: shape.y_nm },
        { x: shape.x_nm + shape.w_nm, y: shape.y_nm },
        { x: shape.x_nm + shape.w_nm, y: shape.y_nm + shape.h_nm },
        { x: shape.x_nm, y: shape.y_nm + shape.h_nm },
        { x: shape.x_nm, y: shape.y_nm },
      ],
    }));
  }

  const filled = new Set<string>();
  for (let yi = 0; yi < ys.length - 1; yi++) {
    const y0 = ys[yi];
    const y1 = ys[yi + 1];
    const cy = (y0 + y1) * 0.5;
    for (let xi = 0; xi < xs.length - 1; xi++) {
      const x0 = xs[xi];
      const x1 = xs[xi + 1];
      const cx = (x0 + x1) * 0.5;
      if (rects.some((shape) => cx > shape.x_nm && cx < shape.x_nm + shape.w_nm && cy > shape.y_nm && cy < shape.y_nm + shape.h_nm)) {
        filled.add(`${xi},${yi}`);
      }
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

  const keyOf = (point: { x: number; y: number }) => `${point.x.toFixed(4)},${point.y.toFixed(4)}`;
  const startMap = new Map<string, number[]>();
  edges.forEach((edge, idx) => {
    const key = keyOf(edge.from);
    const list = startMap.get(key);
    if (list) list.push(idx);
    else startMap.set(key, [idx]);
  });

  const used = new Set<number>();
  const contours: Array<TargetContour> = [];
  for (let i = 0; i < edges.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const points = [edges[i].from, edges[i].to];
    let current = edges[i].to;
    const startKey = keyOf(edges[i].from);
    while (keyOf(current) !== startKey) {
      const nextCandidates = startMap.get(keyOf(current)) ?? [];
      const nextIdx = nextCandidates.find((candidate) => !used.has(candidate));
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
      if (!collinear) continue;
      deduped.splice(i, 1);
      changed = true;
      break;
    }
  }
  return deduped;
}

function presetTargetGuide(templateId: TemplateID, presetId: PresetID, params: Record<string, number>): TargetGuide {
  const subtitle = defaultPresetSubtitle(presetId);
  const rawShapes = templateRawShapes(templateId, params);

  if (templateId === "L_CORNER_RAW" || templateId === "L_CORNER_OPC_SERIF") {
    const fov = params.fov_nm ?? 1100;
    const cx = fov * 0.5;
    const cy = fov * 0.5;
    const cd = params.cd_nm ?? 92;
    const horiz = params.length_nm ?? 470;
    const vert = params.arm_nm ?? 432;
    const elbowX = cx + (params.elbow_x_offset_nm ?? 170);
    const elbowY = cy + (params.elbow_y_offset_nm ?? 132);
    const left = elbowX - horiz;
    const right = elbowX;
    const bottom = elbowY - vert;
    const elbowInner = elbowX - cd;
    return {
      title: "L-Shape Target",
      subtitle,
      objective: "Recover line-end pullback and the lower terminal without printing detached islands.",
      hint: "Connected hammerheads and modest local bias are more stable here than tiny floating assists.",
      hotspotThresholdNm: 22,
      baselineShapeCount: templateId === "L_CORNER_OPC_SERIF" ? 0 : 0,
      targetShapes: rawShapes,
      targetContours: [
        {
          points_nm: [
            { x: left, y: elbowY },
            { x: right, y: elbowY },
            { x: right, y: bottom },
            { x: elbowInner, y: bottom },
            { x: elbowInner, y: elbowY - cd },
            { x: left, y: elbowY - cd },
            { x: left, y: elbowY },
          ],
        },
      ],
    };
  }

  if (templateId === "STAIRCASE" || templateId === "STAIRCASE_OPC") {
    const fov = params.fov_nm ?? 1100;
    const cx = fov * 0.5;
    const cy = fov * 0.5;
    const run = params.step_w_nm ?? 180;
    const rise = params.step_h_nm ?? 110;
    const thick = params.thickness_nm ?? params.cd_nm ?? 88;
    const x0 = cx - 300;
    const y0 = cy + 90;
    const x1 = x0 + run - thick;
    const x2 = x1 + run - thick;
    const x3 = x2 + run + 30;
    return {
      title: "Stepped Interconnect Target",
      subtitle,
      objective: "Hold the jog corners and terminal lengths while keeping the path simple and connected.",
      hint: "Use mild bias and short connected pads before trying more aggressive assist geometry.",
      hotspotThresholdNm: 24,
      baselineShapeCount: 0,
      targetShapes: rawShapes,
      targetContours: [
        {
          points_nm: [
            { x: x0, y: y0 },
            { x: x0, y: y0 + thick },
            { x: x0 + run, y: y0 + thick },
            { x: x0 + run, y: y0 + thick - rise },
            { x: x1 + run, y: y0 + thick - rise },
            { x: x1 + run, y: y0 + thick - rise - rise },
            { x: x3, y: y0 + thick - rise - rise },
            { x: x3, y: y0 - rise - rise },
            { x: x2, y: y0 - rise - rise },
            { x: x2, y: y0 - rise },
            { x: x1, y: y0 - rise },
            { x: x1, y: y0 },
            { x: x0, y: y0 },
          ],
        },
      ],
    };
  }

  if (templateId === "CONTACT_RAW" || templateId === "CONTACT_OPC_SERIF") {
    return {
      title: "Square Target",
      subtitle,
      objective: "Match the printed contact to the intended square footprint with minimal corner loss.",
      hint: "Use balanced corner treatment. Oversized serif pads often add complexity faster than they improve EPE.",
      hotspotThresholdNm: 18,
      baselineShapeCount: 0,
      targetShapes: rawShapes,
      targetContours: rectContours(rawShapes),
    };
  }

  if (templateId === "DENSE_LS") {
    return {
      title: "Dense L/S Target",
      subtitle,
      objective: "Hold line width and pitch without bridging neighboring lines.",
      hint: "Keep edits symmetric and watch dense-space hotspots before adding small features.",
      hotspotThresholdNm: 18,
      baselineShapeCount: 0,
      targetShapes: rawShapes,
      targetContours: rectContours(rawShapes),
    };
  }

  return {
    title: "Target",
    subtitle,
    objective: "Keep the printed contour aligned to the intended target.",
    hint: "Favor connected edits over tiny disconnected assists in this educational model.",
    hotspotThresholdNm: 18,
    baselineShapeCount: 0,
    targetShapes: rawShapes,
    targetContours: rectContours(rawShapes),
  };
}

export function getPresetTargetGuide(templateId: TemplateID, presetId: PresetID, params: Record<string, number>): TargetGuide {
  return presetTargetGuide(templateId, presetId, params);
}

export function getCustomTargetGuide(targetShapes: Array<MaskShape>, presetId: PresetID): TargetGuide | null {
  const addShapes = targetShapes.filter((shape) => getShapeOp(shape) !== "subtract");
  if (!addShapes.length) return null;
  return {
    title: "Custom Target",
    subtitle: defaultPresetSubtitle(presetId),
    objective: "Draw a target first, then copy it to the mask layer and close the target-to-contour gap.",
    hint: "Start from the target geometry itself. Then add hammerheads, serifs, SRAFs, or subtractive notches only where hotspots remain.",
    hotspotThresholdNm: 20,
    baselineShapeCount: addShapes.length,
    targetShapes: cloneMaskShapes(addShapes),
    targetContours: rectContours(addShapes),
  };
}

function pointToSegmentDistance(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-9) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(point.x - px, point.y - py);
}

function nearestDistanceToContours(
  point: { x: number; y: number },
  contours: Array<{ points_nm: Array<{ x: number; y: number }> }>,
): number {
  let best = Number.POSITIVE_INFINITY;
  for (const contour of contours) {
    const points = contour.points_nm ?? [];
    for (let index = 0; index < points.length - 1; index++) {
      best = Math.min(best, pointToSegmentDistance(point, points[index], points[index + 1]));
    }
  }
  return best;
}

function sampleContour(contour: TargetContour, stepNm: number): Array<{ x: number; y: number }> {
  const points = contour.points_nm ?? [];
  if (points.length < 2) return [];
  const samples: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / stepNm));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      samples.push({ x: a.x + dx * t, y: a.y + dy * t });
    }
  }
  samples.push(points[points.length - 1]);
  return samples;
}

function maskComplexityPenalty(baselineShapeCount: number, maskShapes: Array<MaskShape>): number {
  const rects = maskShapes.filter((shape): shape is RectMaskShape => shape.type === "rect");
  const subtractRects = rects.filter((shape) => getShapeOp(shape) === "subtract").length;
  const addRects = rects.filter((shape) => getShapeOp(shape) !== "subtract");
  const extraRects = Math.max(0, rects.length - baselineShapeCount);
  const microRects = rects.filter((shape) => Math.min(shape.w_nm, shape.h_nm) < 24).length;
  const thinRects = rects.filter((shape) => Math.min(shape.w_nm, shape.h_nm) < 16).length;
  return extraRects * 3 + microRects * 1.5 + thinRects * 2 + subtractRects * 1.25 + Math.max(0, addRects.length - baselineShapeCount) * 0.4;
}

function buildRecommendation(guide: TargetGuide, score: number | null, hotspotCount: number, hasContour: boolean): string {
  if (!hasContour) {
    return "No printed contour. Increase connected mask area first before adding smaller OPC features.";
  }
  if (hotspotCount >= 3 || (score ?? 0) < 45) {
    return "Prioritize one hotspot at a time. Use connected hammerheads or local bias before detached assists.";
  }
  if ((score ?? 0) < 72) {
    return "Contour is getting closer. Trim over-bias and keep only the smallest set of edits that reduce the hotspot count.";
  }
  return guide.hint;
}

export function evaluateTargetScore(args: {
  guide: TargetGuide | null;
  sim: SimResponse | null;
  maskShapes: Array<MaskShape>;
}): TargetScoreMetrics | null {
  const { guide, sim, maskShapes } = args;
  if (!guide) return null;

  const complexityPenalty = maskComplexityPenalty(guide.baselineShapeCount, maskShapes);
  if (!sim) {
    return {
      epeMeanNm: null,
      epeMaxNm: null,
      hotspotCount: 0,
      hotspotPenalty: 0,
      complexityPenalty,
      penaltyIndex: Number(complexityPenalty.toFixed(1)),
      score: null,
      grade: "Run to score",
      recommendation: guide.hint,
      hotspotMarkers: [],
    };
  }

  const actualContours = sim.contours_nm ?? [];
  if (actualContours.length === 0) {
    const penaltyIndex = Number((100 + complexityPenalty).toFixed(1));
    return {
      epeMeanNm: null,
      epeMaxNm: null,
      hotspotCount: 0,
      hotspotPenalty: 0,
      complexityPenalty,
      penaltyIndex,
      score: 0,
      grade: "No contour",
      recommendation: buildRecommendation(guide, 0, 0, false),
      hotspotMarkers: [],
    };
  }

  const sampleStepNm = 18;
  const allDistances: number[] = [];

  for (const contour of guide.targetContours) {
    const samples = sampleContour(contour, sampleStepNm);
    for (const sample of samples) {
      const dist = nearestDistanceToContours(sample, actualContours);
      allDistances.push(dist);
    }
  }

  const epeMeanNm = allDistances.length
    ? Number((allDistances.reduce((sum, value) => sum + value, 0) / allDistances.length).toFixed(1))
    : null;
  const epeMaxNm = allDistances.length ? Number(Math.max(...allDistances).toFixed(1)) : null;
  const penaltyIndex = epeMeanNm == null
    ? Number(complexityPenalty.toFixed(1))
    : Number((epeMeanNm + (epeMaxNm ?? 0) * 0.3 + complexityPenalty).toFixed(1));
  const score = epeMeanNm == null ? null : Number(Math.max(0, Math.min(100, 100 - penaltyIndex)).toFixed(1));
  const grade = score == null
    ? "Run to score"
    : score >= 90
      ? "Excellent"
      : score >= 75
        ? "Good"
        : score >= 60
          ? "Improving"
          : "Needs work";

  return {
    epeMeanNm,
    epeMaxNm,
    hotspotCount: 0,
    hotspotPenalty: 0,
    complexityPenalty: Number(complexityPenalty.toFixed(1)),
    penaltyIndex,
    score,
    grade,
    recommendation: buildRecommendation(guide, score, 0, true),
    hotspotMarkers: [],
  };
}

function shapeCd(shape: RectMaskShape, fallbackCd: number): number {
  return Math.max(12, Math.min(shape.w_nm, shape.h_nm, fallbackCd || Math.min(shape.w_nm, shape.h_nm)));
}

export function createHammerheadShape(shape: RectMaskShape, edge: EdgeAnchor, fallbackCd: number): RectMaskShape {
  const cd = shapeCd(shape, fallbackCd);
  const ext = Math.max(14, Number((cd * 0.3).toFixed(1)));
  const span = Math.max(28, Number((cd * 1.22).toFixed(1)));
  if (edge === "left") return rect(shape.x_nm - ext + 2, shape.y_nm + shape.h_nm / 2 - span / 2, ext, span, "add");
  if (edge === "right") return rect(shape.x_nm + shape.w_nm - 2, shape.y_nm + shape.h_nm / 2 - span / 2, ext, span, "add");
  if (edge === "top") return rect(shape.x_nm + shape.w_nm / 2 - span / 2, shape.y_nm + shape.h_nm - 2, span, ext, "add");
  return rect(shape.x_nm + shape.w_nm / 2 - span / 2, shape.y_nm - ext + 2, span, ext, "add");
}

export function createSerifShape(shape: RectMaskShape, corner: CornerAnchor, fallbackCd: number): RectMaskShape {
  const cd = shapeCd(shape, fallbackCd);
  const size = Math.max(14, Number((cd * 0.22).toFixed(1)));
  if (corner === "nw") return rect(shape.x_nm - size * 0.5, shape.y_nm + shape.h_nm - size * 0.5, size, size, "add");
  if (corner === "ne") return rect(shape.x_nm + shape.w_nm - size * 0.5, shape.y_nm + shape.h_nm - size * 0.5, size, size, "add");
  if (corner === "sw") return rect(shape.x_nm - size * 0.5, shape.y_nm - size * 0.5, size, size, "add");
  return rect(shape.x_nm + shape.w_nm - size * 0.5, shape.y_nm - size * 0.5, size, size, "add");
}

export function createMousebiteShape(shape: RectMaskShape, edge: EdgeAnchor, fallbackCd: number): RectMaskShape {
  const cd = shapeCd(shape, fallbackCd);
  const depth = Math.max(10, Number((cd * 0.12).toFixed(1)));
  const span = Math.max(20, Number((cd * 0.24).toFixed(1)));
  if (edge === "left") return rect(shape.x_nm, shape.y_nm + shape.h_nm / 2 - span / 2, depth, span, "subtract");
  if (edge === "right") return rect(shape.x_nm + shape.w_nm - depth, shape.y_nm + shape.h_nm / 2 - span / 2, depth, span, "subtract");
  if (edge === "top") return rect(shape.x_nm + shape.w_nm / 2 - span / 2, shape.y_nm + shape.h_nm - depth, span, depth, "subtract");
  return rect(shape.x_nm + shape.w_nm / 2 - span / 2, shape.y_nm, span, depth, "subtract");
}

export function createSrafShape(point: { x_nm: number; y_nm: number }, orientation: SrafOrientation, fallbackCd: number): RectMaskShape {
  const cd = Math.max(12, fallbackCd);
  const width = Math.max(14, Number((cd * 0.22).toFixed(1)));
  const length = Math.max(60, Number((cd * 1.7).toFixed(1)));
  if (orientation === "horizontal") {
    return rect(point.x_nm - length / 2, point.y_nm - width / 2, length, width, "add");
  }
  return rect(point.x_nm - width / 2, point.y_nm - length / 2, width, length, "add");
}
