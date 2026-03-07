export type Plan = "FREE" | "PRO";
export type PresetID = "DUV_193_DRY" | "DUV_193_IMM" | "EUV_LNA" | "EUV_HNA";
export type TemplateID =
  | "ISO_LINE"
  | "DENSE_LS"
  | "CONTACT_RAW"
  | "CONTACT_OPC_SERIF"
  | "LINE_END_RAW"
  | "LINE_END_OPC_HAMMER"
  | "L_CORNER_RAW"
  | "L_CORNER_OPC_SERIF"
  | "STAIRCASE"
  | "STAIRCASE_OPC";

export type ShapeOp = "add" | "subtract";
export type RectMaskShape = { type: "rect"; op?: ShapeOp; x_nm: number; y_nm: number; w_nm: number; h_nm: number };
export type PolygonMaskShape = { type: "polygon"; op?: ShapeOp; points_nm: Array<{ x_nm: number; y_nm: number }> };
export type MaskShape = RectMaskShape | PolygonMaskShape;

export type SimRequest = {
  plan: Plan;
  grid: number;
  preset_id: PresetID;
  dose: number;
  focus: number;
  return_intensity: boolean;
  mask: {
    mode: "TEMPLATE" | "CUSTOM";
    template_id?: TemplateID;
    params_nm: Record<string, number>;
    shapes?: Array<MaskShape>;
    target_shapes?: Array<MaskShape>;
    preset_feature_overrides?: Array<{ anchorIndex: number; rect: RectMaskShape }>;
    preset_target_overrides?: Array<{ anchorIndex: number; rect: RectMaskShape }>;
  };
};

export type SimResponse = {
  grid_used: number;
  nm_per_pixel: number;
  contours_nm: Array<{ points_nm: Array<{ x: number; y: number }> }>;
  metrics: { cd_nm?: number | null; epe_mean_nm?: number | null; epe_max_nm?: number | null };
  intensity?: { w: number; h: number; vmin: number; vmax: number; data: number[] } | null;
};

export type RunRecord = {
  id: string;
  created_at: string;
  label: string;
  request: SimRequest;
  response: SimResponse;
};

export type SweepParam =
  | "dose"
  | "width"
  | "height"
  | "pitch"
  | "serif";

export type SweepGeometryScope = "LOCAL" | "GLOBAL";

export type BatchSimRequest = {
  base: SimRequest;
  param: string;
  start: number;
  stop: number;
  step: number;
  include_contours?: boolean;
  max_points_per_contour?: number;
};

export type BatchSimPoint = {
  value: number;
  metrics: { cd_nm?: number | null; epe_mean_nm?: number | null; epe_max_nm?: number | null };
  contours_nm?: Array<{ points_nm: Array<{ x: number; y: number }> }> | null;
};

export type BatchSimResponse = {
  param: string;
  points: BatchSimPoint[];
  count: number;
  clamped_by_plan?: boolean;
  note?: string | null;
};
