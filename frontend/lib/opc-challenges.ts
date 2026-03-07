import type { MaskShape, PresetID, SimResponse } from "./types";

export type OpcChallengeId = "L_SHAPE_DUV" | "STEPPED_LINK";

type TargetContour = {
  points_nm: Array<{ x: number; y: number }>;
};

export type OpcChallengeSpec = {
  id: OpcChallengeId;
  title: string;
  subtitle: string;
  presetId: PresetID;
  recommendedDose: number;
  fovNm: number;
  paramsNm: Record<string, number>;
  targetShapes: Array<MaskShape>;
  starterMaskShapes: Array<MaskShape>;
  targetContours: Array<TargetContour>;
  objective: string;
  hint: string;
  hotspotThresholdNm: number;
};

export type OpcChallengeMetrics = {
  epeMeanNm: number | null;
  epeMaxNm: number | null;
  hotspotCount: number;
  complexityPenalty: number;
  score: number | null;
  grade: string;
  recommendation: string;
  hotspotMarkers: Array<{ x: number; y: number; severity: "warn" | "critical" }>;
};

function rect(x_nm: number, y_nm: number, w_nm: number, h_nm: number): MaskShape {
  return { type: "rect", x_nm, y_nm, w_nm, h_nm };
}

const L_SHAPE_TARGET: Array<MaskShape> = [
  rect(250, 590, 470, 92),
  rect(628, 250, 92, 432),
];

const L_SHAPE_CONTOUR: TargetContour = {
  points_nm: [
    { x: 250, y: 590 },
    { x: 720, y: 590 },
    { x: 720, y: 250 },
    { x: 628, y: 250 },
    { x: 628, y: 682 },
    { x: 250, y: 682 },
    { x: 250, y: 590 },
  ],
};

const STEPPED_TARGET: Array<MaskShape> = [
  rect(250, 640, 180, 88),
  rect(342, 530, 88, 198),
  rect(342, 530, 180, 88),
  rect(434, 420, 88, 198),
  rect(434, 420, 210, 88),
];

const STEPPED_CONTOUR: TargetContour = {
  points_nm: [
    { x: 250, y: 640 },
    { x: 250, y: 728 },
    { x: 430, y: 728 },
    { x: 430, y: 618 },
    { x: 522, y: 618 },
    { x: 522, y: 508 },
    { x: 644, y: 508 },
    { x: 644, y: 420 },
    { x: 434, y: 420 },
    { x: 434, y: 530 },
    { x: 342, y: 530 },
    { x: 342, y: 640 },
    { x: 250, y: 640 },
  ],
};

export const OPC_CHALLENGES: Array<OpcChallengeSpec> = [
  {
    id: "L_SHAPE_DUV",
    title: "L-Shape Rescue",
    subtitle: "DUV | 193 nm Dry",
    presetId: "DUV_193_DRY",
    recommendedDose: 0.5,
    fovNm: 1100,
    paramsNm: {
      fov_nm: 1100,
      cd_nm: 92,
      length_nm: 470,
      arm_nm: 432,
    },
    targetShapes: L_SHAPE_TARGET,
    starterMaskShapes: L_SHAPE_TARGET,
    targetContours: [L_SHAPE_CONTOUR],
    objective: "Recover left line-end pullback and the lower terminal without printing detached islands.",
    hint: "Start from the raw target. Add connected hammerheads or local bias before you try tiny detached assists.",
    hotspotThresholdNm: 22,
  },
  {
    id: "STEPPED_LINK",
    title: "Stepped Link Repair",
    subtitle: "EUV | 13.5 nm Low-NA",
    presetId: "EUV_LNA",
    recommendedDose: 0.5,
    fovNm: 1100,
    paramsNm: {
      fov_nm: 1100,
      cd_nm: 88,
      thickness_nm: 88,
      step_w_nm: 180,
      step_h_nm: 110,
    },
    targetShapes: STEPPED_TARGET,
    starterMaskShapes: STEPPED_TARGET,
    targetContours: [STEPPED_CONTOUR],
    objective: "Hold the jog corners and terminal lengths while keeping the path simple and connected.",
    hint: "Use mild line bias and short connected end extensions. This educational model is more stable than floating assists here.",
    hotspotThresholdNm: 24,
  },
];

export function getOpcChallengeSpec(id: OpcChallengeId): OpcChallengeSpec {
  return OPC_CHALLENGES.find((challenge) => challenge.id === id) ?? OPC_CHALLENGES[0];
}

export function cloneMaskShapes(shapes: Array<MaskShape>): Array<MaskShape> {
  return shapes.map((shape) => (
    shape.type === "rect"
      ? { ...shape }
      : { ...shape, points_nm: shape.points_nm.map((point) => ({ ...point })) }
  ));
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
    for (let i = 0; i < points.length - 1; i++) {
      best = Math.min(best, pointToSegmentDistance(point, points[i], points[i + 1]));
    }
  }
  return best;
}

function sampleContour(contour: TargetContour, stepNm: number): Array<{ x: number; y: number }> {
  const points = contour.points_nm ?? [];
  if (points.length < 2) return [];
  const samples: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
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

function maskComplexityPenalty(spec: OpcChallengeSpec, shapes: Array<MaskShape>): number {
  const rects = shapes.filter((shape): shape is Extract<MaskShape, { type: "rect" }> => shape.type === "rect");
  const baseCount = spec.starterMaskShapes.filter((shape) => shape.type === "rect").length;
  const extraRects = Math.max(0, rects.length - baseCount);
  const microRects = rects.filter((rectShape) => Math.min(rectShape.w_nm, rectShape.h_nm) < 24).length;
  const thinRects = rects.filter((rectShape) => Math.min(rectShape.w_nm, rectShape.h_nm) < 16).length;
  return extraRects * 3 + microRects * 1.5 + thinRects * 2;
}

function buildRecommendation(
  spec: OpcChallengeSpec,
  score: number | null,
  hotspotCount: number,
  hasContour: boolean,
): string {
  if (!hasContour) {
    return spec.id === "L_SHAPE_DUV"
      ? "No printed contour. Increase connected end extension on the left and lower terminals before adding small features."
      : "No printed contour. Increase connected line bias and keep the stepped path continuous.";
  }
  if (spec.id === "L_SHAPE_DUV") {
    if (hotspotCount >= 3 || (score ?? 0) > 55) {
      return "Focus on connected hammerheads at the left and lower terminals. Remove detached bars that print as islands.";
    }
    if ((score ?? 0) > 30) {
      return "Keep the main L connected, then trim local bias near the outer elbow until the contour sits on target.";
    }
    return "Main hotspot is under control. Trim excess terminal bias if the contour now overshoots the target.";
  }
  if (hotspotCount >= 3 || (score ?? 0) > 55) {
    return "Use one continuous stepped path with mild end extension. Avoid floating assists in this simplified case.";
  }
  if ((score ?? 0) > 30) {
    return "The path is close. Reduce over-bias at the jog corners and keep only short connected pads.";
  }
  return "Contour is close to target. Fine-tune jog corners and terminal length instead of adding more rectangles.";
}

export function evaluateOpcChallenge(args: {
  spec: OpcChallengeSpec | null;
  sim: SimResponse | null;
  maskShapes: Array<MaskShape>;
}): OpcChallengeMetrics | null {
  const { spec, sim, maskShapes } = args;
  if (!spec) return null;

  const complexityPenalty = maskComplexityPenalty(spec, maskShapes);
  if (!sim) {
    return {
      epeMeanNm: null,
      epeMaxNm: null,
      hotspotCount: 0,
      complexityPenalty,
      score: null,
      grade: "Run to score",
      recommendation: spec.hint,
      hotspotMarkers: [],
    };
  }

  const actualContours = sim.contours_nm ?? [];
  if (actualContours.length === 0) {
    return {
      epeMeanNm: null,
      epeMaxNm: null,
      hotspotCount: spec.targetContours.length,
      complexityPenalty,
      score: Number((220 + complexityPenalty).toFixed(1)),
      grade: "No contour",
      recommendation: buildRecommendation(spec, 220 + complexityPenalty, spec.targetContours.length, false),
      hotspotMarkers: spec.targetContours.map((contour) => contour.points_nm[0]).filter((point): point is { x: number; y: number } => !!point).map((point) => ({
        x: point.x,
        y: point.y,
        severity: "critical" as const,
      })),
    };
  }

  const sampleStepNm = 18;
  const allDistances: number[] = [];
  const hotspotMarkers: Array<{ x: number; y: number; severity: "warn" | "critical" }> = [];
  let hotspotCount = 0;

  for (const contour of spec.targetContours) {
    const samples = sampleContour(contour, sampleStepNm);
    let clusterActive = false;
    let clusterWorst = -1;
    let clusterPoint: { x: number; y: number } | null = null;

    for (const sample of samples) {
      const dist = nearestDistanceToContours(sample, actualContours);
      allDistances.push(dist);
      if (dist > spec.hotspotThresholdNm) {
        if (!clusterActive) {
          clusterActive = true;
          hotspotCount += 1;
          clusterWorst = dist;
          clusterPoint = sample;
        } else if (dist > clusterWorst) {
          clusterWorst = dist;
          clusterPoint = sample;
        }
      } else if (clusterActive) {
        hotspotMarkers.push({
          x: clusterPoint?.x ?? sample.x,
          y: clusterPoint?.y ?? sample.y,
          severity: clusterWorst > spec.hotspotThresholdNm * 1.7 ? "critical" : "warn",
        });
        clusterActive = false;
        clusterWorst = -1;
        clusterPoint = null;
      }
    }

    if (clusterActive && clusterPoint) {
      hotspotMarkers.push({
        x: clusterPoint.x,
        y: clusterPoint.y,
        severity: clusterWorst > spec.hotspotThresholdNm * 1.7 ? "critical" : "warn",
      });
    }
  }

  const epeMeanNm = allDistances.length
    ? Number((allDistances.reduce((sum, value) => sum + value, 0) / allDistances.length).toFixed(1))
    : null;
  const epeMaxNm = allDistances.length ? Number(Math.max(...allDistances).toFixed(1)) : null;
  const score = epeMeanNm == null ? null : Number((epeMeanNm + hotspotCount * 6 + complexityPenalty).toFixed(1));
  const grade = score == null
    ? "Run to score"
    : score < 22 && hotspotCount <= 1
      ? "Excellent"
      : score < 36 && hotspotCount <= 2
        ? "Good"
        : score < 56
          ? "Improving"
          : "Needs work";

  return {
    epeMeanNm,
    epeMaxNm,
    hotspotCount,
    complexityPenalty: Number(complexityPenalty.toFixed(1)),
    score,
    grade,
    recommendation: buildRecommendation(spec, score, hotspotCount, true),
    hotspotMarkers,
  };
}
