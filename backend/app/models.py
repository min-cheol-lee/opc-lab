from typing import List, Literal, Optional, Dict, Union
from pydantic import BaseModel, Field, ConfigDict

Plan = Literal["FREE", "PRO"]
MaskMode = Literal["TEMPLATE", "CUSTOM"]
UsageOp = Literal["runs", "sweep_points", "exports"]
PolicyDecision = Literal["allowed", "adjusted", "blocked", "clamped", "observed"]
ProductEventName = Literal[
    "run_sim_clicked",
    "run_sim_succeeded",
    "run_sim_failed",
    "sweep_run_clicked",
    "sweep_run_succeeded",
    "sweep_run_failed",
    "export_attempted",
    "export_completed",
    "export_blocked_quota",
    "usage_quota_exhausted",
    "upgrade_prompt_viewed",
    "upgrade_prompt_clicked",
]

PresetID = Literal["DUV_193_DRY", "DUV_193_IMM", "EUV_LNA", "EUV_HNA"]
TemplateID = Literal[
    "ISO_LINE",
    "DENSE_LS",
    "L_CORNER",
    "CONTACT",
    "STAIRCASE",
    "CONTACT_RAW",
    "CONTACT_OPC_SERIF",
    "LINE_END_RAW",
    "LINE_END_OPC_HAMMER",
    "L_CORNER_RAW",
    "L_CORNER_OPC_SERIF",
]

ShapeType = Literal["rect", "polygon"]

class RectShape(BaseModel):
    type: Literal["rect"] = "rect"
    x_nm: float  # left
    y_nm: float  # bottom
    w_nm: float
    h_nm: float

class PolygonPointNM(BaseModel):
    x_nm: float
    y_nm: float

class PolygonShape(BaseModel):
    type: Literal["polygon"] = "polygon"
    points_nm: List[PolygonPointNM] = Field(default_factory=list, min_length=3, max_length=64)

Shape = Union[RectShape, PolygonShape]

class MaskSpec(BaseModel):
    mode: MaskMode = "TEMPLATE"
    template_id: Optional[TemplateID] = None
    params_nm: Dict[str, float] = Field(default_factory=dict)
    shapes: List[Shape] = Field(default_factory=list)  # for CUSTOM (Phase 2)

class SimRequest(BaseModel):
    plan: Plan = "FREE"
    grid: int = 512
    preset_id: PresetID = "DUV_193_DRY"
    mask: MaskSpec
    dose: float = Field(0.5, ge=0.0, le=1.0)           # threshold proxy
    focus: float = Field(0.0, ge=0.0, le=1.0)          # Pro blur proxy
    return_intensity: bool = False                     # Optional aerial intensity payload


SweepParam = Literal[
    "dose",
    "focus",
    "mask.params_nm.cd_nm",
    "mask.params_nm.w_nm",
    "mask.params_nm.pitch_nm",
    "mask.params_nm.length_nm",
    "mask.params_nm.thickness_nm",
    "mask.params_nm.step_h_nm",
    "mask.params_nm.serif_nm",
]


class BatchSimRequest(BaseModel):
    base: SimRequest
    param: SweepParam = "dose"
    start: float
    stop: float
    step: float = Field(..., gt=0.0)
    include_contours: bool = False
    max_points_per_contour: int = Field(800, ge=16, le=5000)

class Preset(BaseModel):
    preset_id: str
    title: str
    description: str
    wavelength_nm: float
    na: float
    sigma: float
    is_immersion: bool = False
    blur_sensitivity: float = 1.0  # used to make Hi-NA more focus-sensitive

class PresetResponse(BaseModel):
    presets: List[Preset]

class PointNM(BaseModel):
    x: float
    y: float

class Polyline(BaseModel):
    points_nm: List[PointNM]

class IntensityPayload(BaseModel):
    w: int
    h: int
    vmin: float
    vmax: float
    data: List[float]  # flattened row-major

class Metrics(BaseModel):
    cd_nm: Optional[float] = None
    epe_mean_nm: Optional[float] = None
    epe_max_nm: Optional[float] = None

class SimResponse(BaseModel):
    grid_used: int
    nm_per_pixel: float
    contours_nm: List[Polyline]
    metrics: Metrics
    intensity: Optional[IntensityPayload] = None


class BatchPoint(BaseModel):
    value: float
    metrics: Metrics
    contours_nm: Optional[List[Polyline]] = None


class BatchSimResponse(BaseModel):
    param: str
    points: List[BatchPoint]
    count: int
    clamped_by_plan: bool = False
    note: Optional[str] = None


class UsageStatus(BaseModel):
    day_utc: str
    plan: Plan
    limits: Dict[UsageOp, int]
    usage: Dict[UsageOp, int]
    remaining: Dict[UsageOp, int]


class UsageConsumeRequest(BaseModel):
    plan: Plan
    op: UsageOp
    amount: int = Field(1, ge=1, le=10000)
    clamp: bool = False


class UsageConsumeResponse(BaseModel):
    allowed: bool
    granted: int
    reason: Optional[str] = None
    status: UsageStatus


class PlanEntitlements(BaseModel):
    plan: Plan
    limits: Dict[UsageOp, int]
    max_custom_rects: int
    max_sweep_points_per_run: int
    scenario_limit: Optional[int] = None
    quick_add_enabled: bool
    batch_sweep_enabled: bool
    high_res_export_enabled: bool
    updated_at_utc: str


class EntitlementsResponse(BaseModel):
    version: str
    plans: List[PlanEntitlements]


class PolicyAuditRecord(BaseModel):
    ts_utc: str
    endpoint: str
    method: str
    client_id: str
    plan: Optional[Plan] = None
    decision: PolicyDecision
    reason: Optional[str] = None
    meta: Dict[str, str] = Field(default_factory=dict)


class PolicyAuditResponse(BaseModel):
    count: int
    records: List[PolicyAuditRecord]


class EventItem(BaseModel):
    name: ProductEventName
    ts: Optional[str] = None
    payload: Dict[str, Union[str, int, float, bool, None]] = Field(default_factory=dict)


class EventIngestRequest(BaseModel):
    events: List[EventItem] = Field(..., min_length=1, max_length=200)


class EventIngestResponse(BaseModel):
    accepted: int
    dropped: int = 0


class EventDailySummary(BaseModel):
    day_utc: str
    counts: Dict[ProductEventName, int]
    upgrade_click_rate: Optional[float] = None
    export_block_rate: Optional[float] = None


class EventSummaryResponse(BaseModel):
    generated_at_utc: str
    window_days: int
    totals: Dict[ProductEventName, int]
    by_day: List[EventDailySummary]
    upgrade_click_rate: Optional[float] = None
    export_block_rate: Optional[float] = None


BenchmarkCaseStatus = Literal["passed", "failed"]


class BenchmarkCaseResult(BaseModel):
    case_id: str
    title: str
    status: BenchmarkCaseStatus
    checks_passed: int
    checks_total: int
    duration_ms: int
    error: Optional[str] = None


class BenchmarkRunSummary(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    run_id: str
    generated_at_utc: str
    model_version: str
    suite_version: str
    cases_total: int
    cases_passed: int
    pass_rate: float
    artifact_file: Optional[str] = None
    cases: List[BenchmarkCaseResult] = Field(default_factory=list)


class BenchmarkTrendPoint(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    run_id: str
    generated_at_utc: str
    model_version: str
    cases_total: int
    cases_passed: int
    pass_rate: float


class BenchmarkTrendResponse(BaseModel):
    generated_at_utc: str
    history_count: int
    latest: Optional[BenchmarkRunSummary] = None
    trend: List[BenchmarkTrendPoint] = Field(default_factory=list)


class CurrentEntitlementResponse(BaseModel):
    user_id: str
    plan: Plan
    source: str
    pro_expires_at_utc: Optional[str] = None
    limits: Dict[UsageOp, int]
    max_custom_rects: int
    max_sweep_points_per_run: int
    scenario_limit: Optional[int] = None
    quick_add_enabled: bool
    batch_sweep_enabled: bool
    high_res_export_enabled: bool
    updated_at_utc: str


class AdminEntitlementSetRequest(BaseModel):
    user_id: str = Field(..., min_length=3, max_length=120)
    plan: Plan
    source: str = Field("admin_manual", min_length=3, max_length=64)
    pro_days: Optional[int] = Field(None, ge=1, le=3650)


class AdminEntitlementSetResponse(BaseModel):
    ok: bool
    user_id: str
    plan: Plan
    source: str
    pro_expires_at_utc: Optional[str] = None
    updated_at_utc: str


class InviteAllowlistItem(BaseModel):
    email: str
    role: str = "tester"
    plan_default: Plan = "FREE"
    expires_at_utc: Optional[str] = None
    used_at_utc: Optional[str] = None
    updated_at_utc: str


class AdminInviteSetRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)
    role: str = Field("tester", min_length=3, max_length=32)
    plan_default: Plan = "FREE"
    expires_in_days: Optional[int] = Field(None, ge=1, le=3650)


class AdminInviteListResponse(BaseModel):
    count: int
    items: List[InviteAllowlistItem]


class BillingCheckoutRequest(BaseModel):
    success_url: str
    cancel_url: str
    price_id: Optional[str] = None


class BillingCheckoutResponse(BaseModel):
    url: str
    session_id: str


class BillingPortalRequest(BaseModel):
    return_url: str


class BillingPortalResponse(BaseModel):
    url: str


class BillingStatusResponse(BaseModel):
    user_id: str
    plan: Plan
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    subscription_status: Optional[str] = None
    current_period_end_utc: Optional[str] = None
    source: str = "none"


BillingWebhookEventType = Literal[
    "checkout.session.completed",
    "invoice.paid",
    "customer.subscription.updated",
    "customer.subscription.deleted",
]


class BillingWebhookMockRequest(BaseModel):
    user_id: str = Field(..., min_length=3, max_length=120)
    event_type: BillingWebhookEventType
    status: Optional[str] = Field(None, min_length=3, max_length=40)
    stripe_customer_id: Optional[str] = Field(None, min_length=6, max_length=120)
    stripe_subscription_id: Optional[str] = Field(None, min_length=6, max_length=120)
    period_days: Optional[int] = Field(30, ge=1, le=3650)
    source: str = Field("billing_webhook_mock", min_length=3, max_length=64)
