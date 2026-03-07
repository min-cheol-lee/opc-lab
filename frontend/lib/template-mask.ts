import type { MaskShape, RectMaskShape, TemplateID } from "./types";

export type PresetFeatureOverride = {
  anchorIndex: number;
  rect: RectMaskShape;
};

type RectNm = { x: number; y: number; w: number; h: number };

function rect(x_nm: number, y_nm: number, w_nm: number, h_nm: number): RectMaskShape {
  return { type: "rect", op: "add", x_nm, y_nm, w_nm, h_nm };
}

function pushRect(rects: RectNm[], x: number, y: number, w: number, h: number) {
  rects.push({ x, y, w, h });
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

function appendLShapeRaw(rects: RectNm[], p: Record<string, number>, cx: number, cy: number) {
  const cd = p.cd_nm ?? 92;
  const horiz = p.length_nm ?? 470;
  const vert = p.arm_nm ?? 432;
  const elbowX = cx + (p.elbow_x_offset_nm ?? 170);
  const elbowY = cy + (p.elbow_y_offset_nm ?? 132);
  pushRect(rects, elbowX - horiz, elbowY - cd, horiz, cd);
  pushRect(rects, elbowX - cd, elbowY - vert, cd, vert);
}

function appendLShapeOpc(rects: RectNm[], p: Record<string, number>, cx: number, cy: number) {
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

function appendSteppedTrack(rects: RectNm[], x: number, y: number, thickness: number, run: number[], rise: number[]) {
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

function appendSteppedInterconnectRaw(rects: RectNm[], p: Record<string, number>, cx: number, cy: number) {
  const run = p.step_w_nm ?? 180;
  const rise = p.step_h_nm ?? 110;
  const thickness = p.thickness_nm ?? p.cd_nm ?? 88;
  appendSteppedTrack(rects, cx - 300, cy + 90, thickness, [run, run, run + 30], [rise, rise]);
}

function appendSteppedInterconnectOpc(rects: RectNm[], p: Record<string, number>, cx: number, cy: number) {
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

function rectsToShapes(rects: RectNm[]): RectMaskShape[] {
  return rects.map((item) => rect(item.x, item.y, item.w, item.h));
}

function rectsNearlyEqual(a: RectMaskShape, b: RectMaskShape): boolean {
  return Math.abs(a.x_nm - b.x_nm) < 0.01
    && Math.abs(a.y_nm - b.y_nm) < 0.01
    && Math.abs(a.w_nm - b.w_nm) < 0.01
    && Math.abs(a.h_nm - b.h_nm) < 0.01;
}

export function buildTemplateBaseShapes(templateId: TemplateID, params: Record<string, number>): RectMaskShape[] {
  const fov = params.fov_nm ?? 1100;
  const cx = fov * 0.5;
  const cy = fov * 0.5;
  const rects: RectNm[] = [];

  if (templateId === "ISO_LINE") {
    const cd = params.cd_nm ?? 100;
    const h = params.length_nm ?? 900;
    pushRect(rects, cx - cd / 2, cy - h / 2, cd, h);
  } else if (templateId === "DENSE_LS") {
    const cd = params.cd_nm ?? 60;
    const pitch = params.pitch_nm ?? 140;
    const nReq = Math.max(1, Math.floor(params.n_lines ?? 7));
    const n = fitDenseLineCountInFov(cd, pitch, nReq, fov);
    const h = params.length_nm ?? 900;
    const start = cx - ((n - 1) * pitch) / 2;
    for (let i = 0; i < n; i++) {
      pushRect(rects, start + i * pitch - cd / 2, cy - h / 2, cd, h);
    }
  } else if (templateId === "LINE_END_RAW") {
    const cd = params.cd_nm ?? 100;
    const h = params.length_nm ?? 900;
    pushRect(rects, cx - cd / 2, cy - h / 2, cd, h);
  } else if (templateId === "LINE_END_OPC_HAMMER") {
    const cd = params.cd_nm ?? 100;
    const h = params.length_nm ?? 900;
    const hammerW = params.hammer_w_nm ?? Math.max(1.8 * cd, cd + 40);
    const hammerH = params.hammer_h_nm ?? Math.max(0.35 * cd, 24);
    const x = cx - cd / 2;
    const y = cy - h / 2;
    pushRect(rects, x, y, cd, h);
    pushRect(rects, cx - hammerW / 2, y + h - hammerH / 2, hammerW, hammerH);
    pushRect(rects, cx - hammerW / 2, y - hammerH / 2, hammerW, hammerH);
  } else if (templateId === "L_CORNER_RAW") {
    appendLShapeRaw(rects, params, cx, cy);
  } else if (templateId === "L_CORNER_OPC_SERIF") {
    appendLShapeOpc(rects, params, cx, cy);
  } else if (templateId === "CONTACT_RAW") {
    const w = params.w_nm ?? params.cd_nm ?? 100;
    pushRect(rects, cx - w / 2, cy - w / 2, w, w);
  } else if (templateId === "CONTACT_OPC_SERIF") {
    const w = params.w_nm ?? params.cd_nm ?? 100;
    const serif = params.serif_nm ?? Math.max(0.35 * w, 20);
    const half = w / 2;
    pushRect(rects, cx - half, cy - half, w, w);
    pushRect(rects, cx - half - serif / 2, cy - half - serif / 2, serif, serif);
    pushRect(rects, cx + half - serif / 2, cy - half - serif / 2, serif, serif);
    pushRect(rects, cx - half - serif / 2, cy + half - serif / 2, serif, serif);
    pushRect(rects, cx + half - serif / 2, cy + half - serif / 2, serif, serif);
  } else if (templateId === "STAIRCASE") {
    appendSteppedInterconnectRaw(rects, params, cx, cy);
  } else if (templateId === "STAIRCASE_OPC") {
    appendSteppedInterconnectOpc(rects, params, cx, cy);
  } else {
    const w = params.w_nm ?? params.cd_nm ?? 100;
    pushRect(rects, cx - w / 2, cy - w / 2, w, w);
  }

  if ((params.sraf_on ?? 0) >= 0.5) {
    const srafW = params.sraf_w_nm ?? 30;
    const srafOff = params.sraf_offset_nm ?? 80;
    pushRect(rects, cx - srafOff - srafW / 2, cy - srafW / 2, srafW, srafW);
    pushRect(rects, cx + srafOff - srafW / 2, cy - srafW / 2, srafW, srafW);
  }

  return rectsToShapes(rects);
}

export function applyPresetFeatureOverrides(
  baseShapes: RectMaskShape[],
  anchorShapes: RectMaskShape[],
  overrides: PresetFeatureOverride[],
): RectMaskShape[] {
  const next = baseShapes.map((shape) => ({ ...shape }));
  for (const override of overrides) {
    const anchor = anchorShapes[override.anchorIndex];
    if (!anchor) continue;
    const matchIndex = next.findIndex((shape) => rectsNearlyEqual(shape, anchor));
    if (matchIndex >= 0) {
      next.splice(matchIndex, 1, { ...override.rect, op: "add" });
    } else {
      next.push({ ...override.rect, op: "add" });
    }
  }
  return next;
}

export function cloneMaskShapes(shapes: MaskShape[]): MaskShape[] {
  return shapes.map((shape) => (
    shape.type === "rect"
      ? { ...shape }
      : { ...shape, points_nm: shape.points_nm.map((point) => ({ ...point })) }
  ));
}
