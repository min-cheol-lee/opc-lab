import type { MaskShape, ShapeOp, TemplateID } from "./types";

export type PortableMaskPreset = {
  name: string;
  mode: "TEMPLATE" | "CUSTOM";
  template_id?: TemplateID;
  params_nm: Record<string, number>;
  shapes: Array<MaskShape>;
  target_shapes?: Array<MaskShape>;
  createdAt?: string;
};

type CustomMaskFileV1 = {
  schema: "litopc-mask-v1" | "opclab-mask-v1";
  exported_at: string;
  mask: PortableMaskPreset;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isShapeOp(value: unknown): value is ShapeOp | undefined {
  return value === undefined || value === "add" || value === "subtract";
}

function isRectShape(value: unknown): value is Extract<MaskShape, { type: "rect" }> {
  if (!value || typeof value !== "object") return false;
  const shape = value as Record<string, unknown>;
  return (
    shape.type === "rect"
    && isShapeOp(shape.op)
    && isFiniteNumber(shape.x_nm)
    && isFiniteNumber(shape.y_nm)
    && isFiniteNumber(shape.w_nm)
    && isFiniteNumber(shape.h_nm)
  );
}

function isPolygonShape(value: unknown): value is Extract<MaskShape, { type: "polygon" }> {
  if (!value || typeof value !== "object") return false;
  const shape = value as Record<string, unknown>;
  return (
    shape.type === "polygon"
    && isShapeOp(shape.op)
    && Array.isArray(shape.points_nm)
    && shape.points_nm.length >= 3
    && shape.points_nm.every((point) => {
      if (!point || typeof point !== "object") return false;
      const candidate = point as Record<string, unknown>;
      return isFiniteNumber(candidate.x_nm) && isFiniteNumber(candidate.y_nm);
    })
  );
}

function clonePortableShape(shape: MaskShape): MaskShape {
  if (shape.type === "rect") return { ...shape };
  return { ...shape, points_nm: shape.points_nm.map((point) => ({ ...point })) };
}

function normalizePortablePreset(input: Partial<PortableMaskPreset>): PortableMaskPreset {
  const rawShapes = Array.isArray(input.shapes) ? input.shapes : [];
  const shapes = rawShapes
    .filter((shape): shape is MaskShape => isRectShape(shape) || isPolygonShape(shape))
    .map(clonePortableShape);
  const rawTargetShapes = Array.isArray(input.target_shapes) ? input.target_shapes : [];
  const target_shapes = rawTargetShapes
    .filter((shape): shape is MaskShape => isRectShape(shape) || isPolygonShape(shape))
    .map((shape) => {
      const cloned = clonePortableShape(shape);
      if (cloned.type === "rect") return { ...cloned, op: "add" as const };
      return { ...cloned, op: "add" as const };
    });
  const mode: "TEMPLATE" | "CUSTOM" =
    input.mode === "CUSTOM" || input.mode === "TEMPLATE"
      ? input.mode
      : (shapes.length > 0 ? "CUSTOM" : "TEMPLATE");
  const paramsEntries = Object.entries(input.params_nm ?? {}).filter(([, value]) => isFiniteNumber(value));
  const params_nm = Object.fromEntries(paramsEntries);
  return {
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : "Imported Mask",
    mode,
    template_id: input.template_id,
    params_nm,
    shapes,
    target_shapes,
    createdAt: typeof input.createdAt === "string" && input.createdAt ? input.createdAt : undefined,
  };
}

function sanitizeFileStem(name: string): string {
  const stem = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return stem || "litopc-mask";
}

export function downloadCustomMaskFile(preset: PortableMaskPreset): void {
  if (typeof window === "undefined") return;
  const normalized = normalizePortablePreset(preset);
  const payload: CustomMaskFileV1 = {
    schema: "litopc-mask-v1",
    exported_at: new Date().toISOString(),
    mask: normalized,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFileStem(normalized.name)}.opcmask.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

export function parseCustomMaskFile(raw: string): PortableMaskPreset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Mask file is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Mask file payload is invalid.");
  }
  const file = parsed as Partial<CustomMaskFileV1>;
  if (file.schema !== "litopc-mask-v1" && file.schema !== "opclab-mask-v1") {
    throw new Error("Unsupported mask file schema.");
  }
  if (!file.mask || typeof file.mask !== "object") {
    throw new Error("Mask file does not contain a mask payload.");
  }
  const normalized = normalizePortablePreset(file.mask);
  if (normalized.mode === "CUSTOM" && normalized.shapes.length === 0) {
    throw new Error("Custom mask file does not contain any supported rectangular shapes.");
  }
  return normalized;
}
