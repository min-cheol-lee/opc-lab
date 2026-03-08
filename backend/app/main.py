import os
import math
import re
import json
import hmac
import hashlib
from pathlib import Path
from datetime import datetime, timedelta, timezone
from urllib import error as urlerror, request as urlrequest
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .models import (
    BatchPoint,
    BatchSimRequest,
    BatchSimResponse,
    Polyline,
    PresetResponse,
    SimRequest,
    SimResponse,
    EntitlementsResponse,
    PlanEntitlements,
    PolicyAuditRecord,
    PolicyAuditResponse,
    EventIngestRequest,
    EventIngestResponse,
    EventSummaryResponse,
    EventDailySummary,
    ProductEventName,
    PolicyDecision,
    BenchmarkRunSummary,
    BenchmarkTrendPoint,
    BenchmarkTrendResponse,
    CurrentEntitlementResponse,
    AdminEntitlementSetRequest,
    AdminEntitlementSetResponse,
    AdminInviteSetRequest,
    AdminInviteListResponse,
    InviteAllowlistItem,
    BillingCheckoutRequest,
    BillingCheckoutResponse,
    BillingPortalRequest,
    BillingPortalResponse,
    BillingStatusResponse,
    BillingWebhookMockRequest,
    UsageConsumeRequest,
    UsageConsumeResponse,
    UsageStatus,
    UsageOp,
    Plan,
)
from .auth import resolve_auth_identity
from .store import (
    consume_usage_quota as db_consume_usage_quota,
    ensure_db,
    get_user_entitlement,
    get_usage_bucket as db_get_usage_bucket,
    grant_pro_days,
    ingest_product_events,
    insert_policy_audit,
    is_invite_allowed,
    get_billing_customer_by_user,
    get_user_id_by_billing_customer,
    get_billing_subscription_by_user,
    get_invite_allowlist,
    list_invite_allowlist,
    list_policy_audit,
    list_product_events,
    mark_invite_used,
    sanitize_user_id,
    set_invite_allowlist,
    upsert_billing_customer,
    upsert_billing_subscription,
    set_user_entitlement,
)
from .sim.presets import PRESETS
from .sim.pipeline import run_simulation

app = FastAPI(title="litopc API", version="0.1.0")

# Product toggle: keep disabled for now, easy to re-enable later.
ENABLE_ADVANCED_CORNER_TEMPLATES = False

DISABLED_TEMPLATES = {
    "LINE_END_RAW",
    "LINE_END_OPC_HAMMER",
    "L_CORNER",
}

FREE_CUSTOM_MAX_RECTS = 3
PRO_CUSTOM_MAX_SHAPES = 48
FREE_SWEEP_MAX_POINTS = 24
PRO_SWEEP_MAX_POINTS = 120
FREE_RUNS_PER_DAY = 80
FREE_SWEEP_POINTS_PER_DAY = 600
FREE_EXPORTS_PER_DAY = 30
PRO_RUNS_PER_DAY = 2000
PRO_SWEEP_POINTS_PER_DAY = 12000
PRO_EXPORTS_PER_DAY = 600
FREE_SCENARIO_LIMIT = 8
ENTITLEMENT_VERSION = "2026-02-24"
POLICY_AUDIT_MAX_ROWS = 2000
PRODUCT_EVENT_MAX_ROWS = 6000
TRUST_BENCHMARK_ARTIFACT_DIR = Path(__file__).resolve().parent.parent / "trust" / "artifacts"
TRUST_BENCHMARK_LATEST_FILE = TRUST_BENCHMARK_ARTIFACT_DIR / "benchmark-latest.json"
TRUST_BENCHMARK_HISTORY_FILE = TRUST_BENCHMARK_ARTIFACT_DIR / "benchmark-history.json"
_PRODUCT_EVENT_NAMES: tuple[ProductEventName, ...] = (
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
)


def _env_first(*names: str, default: str = "") -> str:
    for name in names:
        value = (os.getenv(name, "") or "").strip()
        if value:
            return value
    return default


def _request_header_first(request: Request, *names: str) -> str | None:
    for name in names:
        value = request.headers.get(name)
        if value:
            return value
    return None

if os.getenv("ENV", "development").lower() == "production":
    allow_origins = [
        origin.strip()
        for origin in os.getenv("CORS_ALLOW_ORIGINS", "").split(",")
        if origin.strip()
    ]
else:
    allow_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _bootstrap_user_id(raw_user_id: str) -> str:
    cleaned = sanitize_user_id(raw_user_id)
    if not cleaned:
        return ""
    if ":" in cleaned:
        return cleaned
    return f"hdr:{cleaned}"


def _bootstrap_local_master_pro() -> None:
    # Local/internal convenience bootstrap. Never run in production.
    if os.getenv("ENV", "development").lower() == "production":
        return
    if os.getenv("LOCAL_BOOTSTRAP_MASTER_PRO", "1").strip() != "1":
        return
    user_id = _bootstrap_user_id(os.getenv("LOCAL_BOOTSTRAP_MASTER_USER_ID", "master"))
    if not user_id:
        return
    set_user_entitlement(
        user_id=user_id,
        plan="PRO",
        source="local_bootstrap_master",
        pro_expires_at_utc=None,
    )
    email = (os.getenv("LOCAL_BOOTSTRAP_MASTER_EMAIL", "master@litopc") or "").strip().lower()
    if "@" in email:
        set_invite_allowlist(
            email=email,
            role="admin",
            plan_default="PRO",
            expires_at_utc=None,
        )


@app.on_event("startup")
def startup_init_store():
    ensure_db()
    _bootstrap_local_master_pro()

def _cors_json_response(request: Request, status_code: int, detail: str) -> JSONResponse:
    resp = JSONResponse(status_code=status_code, content={"detail": detail})
    origin = (request.headers.get("origin") or "").strip()
    if not origin:
        return resp
    if "*" in allow_origins:
        resp.headers.setdefault("Access-Control-Allow-Origin", "*")
        resp.headers.setdefault("Access-Control-Allow-Credentials", "true")
        return resp
    if origin in allow_origins:
        resp.headers.setdefault("Access-Control-Allow-Origin", origin)
        resp.headers.setdefault("Access-Control-Allow-Credentials", "true")
        resp.headers.setdefault("Vary", "Origin")
    return resp

def _has_valid_admin_token(request: Request) -> bool:
    expected = _env_first("LITOPC_ADMIN_TOKEN", "OPCLAB_ADMIN_TOKEN")
    if not expected:
        return False
    given = (_request_header_first(request, "x-litopc-admin-token", "x-opclab-admin-token") or "").strip()
    if not given:
        return False
    return hmac.compare_digest(given, expected)

def _should_bypass_allowlist(request: Request) -> bool:
    # Keep CORS preflight and liveness probe reachable regardless of invite state.
    if request.method.upper() == "OPTIONS":
        return True
    normalized_path = request.url.path.rstrip("/") or "/"
    if normalized_path == "/health":
        return True
    if normalized_path.startswith("/admin/") and _has_valid_admin_token(request):
        return True
    return False

@app.middleware("http")
async def auth_identity_middleware(request: Request, call_next):
    identity = resolve_auth_identity(request)
    enforce_allowlist = os.getenv("AUTH_ENFORCE_ALLOWLIST", "0").strip() == "1"
    if enforce_allowlist and not _should_bypass_allowlist(request):
        email = (identity.email or "").strip().lower()
        if not email:
            return _cors_json_response(request, 403, "Invite-only mode requires email identity.")
        if not is_invite_allowed(email):
            return _cors_json_response(request, 403, "This account is not allowlisted for staging.")
        invite = get_invite_allowlist(email)
        if invite is not None:
            existing = get_user_entitlement(identity.user_id)
            if existing is None and invite["plan_default"] == "PRO":
                set_user_entitlement(
                    user_id=identity.user_id,
                    plan="PRO",
                    source="invite_default",
                    pro_expires_at_utc=invite["expires_at_utc"],
                )
            mark_invite_used(email)
    request.state.litopc_user_id = identity.user_id
    request.state.litopc_auth_source = identity.source
    request.state.litopc_authenticated = identity.authenticated
    request.state.litopc_email = identity.email
    response = await call_next(request)
    response.headers.setdefault("X-LITOPC-USER-ID", identity.user_id)
    response.headers.setdefault("X-LITOPC-AUTH-SOURCE", identity.source)
    return response

@app.middleware("http")
async def entitlement_middleware(request: Request, call_next):
    client_id = _resolve_client_id(request)
    response = await call_next(request)
    response.headers.setdefault("X-LITOPC-ENTITLEMENT-VERSION", ENTITLEMENT_VERSION)
    response.headers.setdefault("X-LITOPC-CLIENT-ID", client_id)
    return response

@app.get("/")
def root():
    return {
        "message": "litopc API is running. Visit /docs for Swagger UI. Health: /health, Presets: /presets"
    }

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/presets", response_model=PresetResponse)
def get_presets():
    return PresetResponse(presets=list(PRESETS.values()))

def _validate_template_access(req: SimRequest) -> None:
    if (
        req.mask.mode == "TEMPLATE"
        and not ENABLE_ADVANCED_CORNER_TEMPLATES
        and req.mask.template_id in DISABLED_TEMPLATES
    ):
        raise HTTPException(status_code=403, detail="This template is temporarily disabled.")

def _validate_custom_mode(req: SimRequest) -> None:
    if req.mask.mode == "CUSTOM":
        shapes = req.mask.shapes or []
        if any(getattr(s, "type", "rect") != "rect" for s in shapes):
            raise HTTPException(
                status_code=403,
                detail="Custom mode currently supports rectangle-only shapes.",
            )
        if req.plan == "FREE":
            if len(shapes) > FREE_CUSTOM_MAX_RECTS:
                raise HTTPException(
                    status_code=400,
                    detail=f"FREE custom mode allows up to {FREE_CUSTOM_MAX_RECTS} rectangles.",
                )
        else:
            if len(shapes) > PRO_CUSTOM_MAX_SHAPES:
                raise HTTPException(
                    status_code=400,
                    detail=f"PRO custom mode allows up to {PRO_CUSTOM_MAX_SHAPES} shapes.",
                )

def _enforce_plan(req: SimRequest) -> None:
    # Disable SRAF for all plans (temporary)
    req.mask.params_nm["sraf_on"] = 0.0

    # Enforce FREE constraints server-side
    if req.plan == "FREE":
        req.grid = 512
        # FREE: EUV is low-NA only
        if req.preset_id == "EUV_HNA":
            req.preset_id = "EUV_LNA"

def _apply_request_policy(req: SimRequest) -> SimRequest:
    out = req.model_copy(deep=True)
    _validate_template_access(out)
    _validate_custom_mode(out)
    _enforce_plan(out)
    return out

def _day_utc() -> str:
    return datetime.now(timezone.utc).date().isoformat()

def _limits_for_plan(plan: Plan) -> dict[UsageOp, int]:
    if plan == "FREE":
        return {
            "runs": FREE_RUNS_PER_DAY,
            "sweep_points": FREE_SWEEP_POINTS_PER_DAY,
            "exports": FREE_EXPORTS_PER_DAY,
        }
    return {
        "runs": PRO_RUNS_PER_DAY,
        "sweep_points": PRO_SWEEP_POINTS_PER_DAY,
        "exports": PRO_EXPORTS_PER_DAY,
    }

def _sanitize_client_id(raw: str | None) -> str:
    if not raw:
        return ""
    cleaned = re.sub(r"[^a-zA-Z0-9_.:-]", "", raw.strip())
    return cleaned[:72]

def _resolve_client_id(request: Request) -> str:
    cached = getattr(request.state, "litopc_client_id", None)
    if isinstance(cached, str) and cached:
        return cached
    header = _sanitize_client_id(_request_header_first(request, "x-litopc-client-id", "x-opclab-client-id"))
    if header:
        request.state.litopc_client_id = header
        return header
    host = request.client.host if request.client else "anon"
    fallback = f"ip:{host}"
    request.state.litopc_client_id = fallback
    return fallback

def _resolve_user_id(request: Request) -> str:
    cached = getattr(request.state, "litopc_user_id", None)
    if isinstance(cached, str) and cached:
        return cached
    # Function-level calls (tests/smoke) can bypass middleware.
    identity = resolve_auth_identity(request)
    request.state.litopc_user_id = identity.user_id
    request.state.litopc_auth_source = identity.source
    request.state.litopc_authenticated = identity.authenticated
    request.state.litopc_email = identity.email
    return identity.user_id

def _resolve_actor_id(request: Request) -> str:
    uid = _resolve_user_id(request)
    if uid:
        return uid
    return _resolve_client_id(request)

def _effective_plan_for_user(user_id: str) -> Plan:
    sanitized = sanitize_user_id(user_id)
    if not sanitized:
        return "FREE"
    rec = get_user_entitlement(sanitized)
    if rec is None:
        return "FREE"
    return rec["plan"]

def _effective_plan_for_request(request: Request) -> Plan:
    return _effective_plan_for_user(_resolve_user_id(request))

def _build_usage_status(day: str, plan: Plan, bucket: dict[str, int]) -> UsageStatus:
    limits = _limits_for_plan(plan)
    usage = {
        "runs": int(bucket.get("runs", 0)),
        "sweep_points": int(bucket.get("sweep_points", 0)),
        "exports": int(bucket.get("exports", 0)),
    }
    remaining = {
        "runs": max(0, limits["runs"] - usage["runs"]),
        "sweep_points": max(0, limits["sweep_points"] - usage["sweep_points"]),
        "exports": max(0, limits["exports"] - usage["exports"]),
    }
    return UsageStatus(day_utc=day, plan=plan, limits=limits, usage=usage, remaining=remaining)

def _now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _meta_strings(meta: dict[str, object] | None) -> dict[str, str]:
    if not meta:
        return {}
    out: dict[str, str] = {}
    for key, value in meta.items():
        out[str(key)] = str(value)
    return out

def _record_policy_audit(
    endpoint: str,
    method: str,
    client_id: str,
    decision: PolicyDecision,
    plan: Plan | None = None,
    reason: str | None = None,
    meta: dict[str, object] | None = None,
) -> None:
    insert_policy_audit(
        {
            "ts_utc": _now_utc_iso(),
            "endpoint": endpoint,
            "method": method,
            "client_id": client_id,
            "plan": plan,
            "decision": decision,
            "reason": reason,
            "meta": _meta_strings(meta),
        },
        POLICY_AUDIT_MAX_ROWS,
    )

def _policy_adjustments(before: SimRequest, after: SimRequest) -> dict[str, str]:
    out: dict[str, str] = {}
    if before.grid != after.grid:
        out["grid"] = f"{before.grid}->{after.grid}"
    if before.return_intensity != after.return_intensity:
        out["return_intensity"] = f"{before.return_intensity}->{after.return_intensity}"
    if before.preset_id != after.preset_id:
        out["preset_id"] = f"{before.preset_id}->{after.preset_id}"
    before_sraf = before.mask.params_nm.get("sraf_on")
    after_sraf = after.mask.params_nm.get("sraf_on")
    if before_sraf != after_sraf:
        out["sraf_on"] = f"{before_sraf}->{after_sraf}"
    return out

def _safe_rate(numerator: int, denominator: int) -> float | None:
    if denominator <= 0:
        return None
    return round(numerator / denominator, 4)

def _event_day_from_ts(raw_ts: str | None) -> str:
    if not raw_ts:
        return _day_utc()
    normalized = raw_ts.strip()
    if not normalized:
        return _day_utc()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(normalized)
    except ValueError:
        return _day_utc()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).date().isoformat()

def _zero_event_counts() -> dict[ProductEventName, int]:
    return {name: 0 for name in _PRODUCT_EVENT_NAMES}

def _read_json_dict(path: Path) -> dict[str, object] | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    return payload

def _load_trust_latest() -> BenchmarkRunSummary | None:
    raw = _read_json_dict(TRUST_BENCHMARK_LATEST_FILE)
    if raw is None:
        return None
    try:
        return BenchmarkRunSummary(**raw)
    except Exception:
        return None

def _load_trust_history(limit: int) -> tuple[list[BenchmarkTrendPoint], int]:
    raw = _read_json_dict(TRUST_BENCHMARK_HISTORY_FILE)
    rows = raw.get("runs") if raw else None
    if not isinstance(rows, list):
        return [], 0
    points: list[BenchmarkTrendPoint] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            points.append(BenchmarkTrendPoint(**row))
        except Exception:
            continue
    total = len(points)
    if limit > 0:
        points = points[-limit:]
    return points, total

def _require_admin_token(request: Request) -> None:
    expected = _env_first("LITOPC_ADMIN_TOKEN", "OPCLAB_ADMIN_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="Admin token is not configured.")
    given = (_request_header_first(request, "x-litopc-admin-token", "x-opclab-admin-token") or "").strip()
    if given != expected:
        raise HTTPException(status_code=403, detail="Admin token is invalid.")


def _billing_mode() -> str:
    return (os.getenv("BILLING_MODE", "stub") or "stub").strip().lower()


def _iso_after_days(days: int) -> str:
    safe_days = max(1, min(days, 3650))
    return (datetime.now(timezone.utc) + timedelta(days=safe_days)).isoformat()


def _mock_checkout_session_id(user_id: str) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    suffix = sanitize_user_id(user_id).replace(":", "_").replace(".", "_")[-24:]
    return f"cs_mock_{ts}_{suffix or 'anon'}"


def _mock_customer_id(user_id: str) -> str:
    suffix = sanitize_user_id(user_id).replace(":", "_").replace(".", "_")[-24:]
    return f"cus_mock_{suffix or 'anon'}"


def _mock_subscription_id(user_id: str) -> str:
    suffix = sanitize_user_id(user_id).replace(":", "_").replace(".", "_")[-24:]
    return f"sub_mock_{suffix or 'anon'}"


def _resolve_billing_status_for_user(user_id: str) -> BillingStatusResponse:
    sub = get_billing_subscription_by_user(user_id)
    customer = get_billing_customer_by_user(user_id)
    plan = _effective_plan_for_user(user_id)
    return BillingStatusResponse(
        user_id=user_id,
        plan=plan,
        stripe_customer_id=(sub["stripe_customer_id"] if sub else None) or (customer["stripe_customer_id"] if customer else None),
        stripe_subscription_id=sub["stripe_subscription_id"] if sub else None,
        subscription_status=sub["status"] if sub else None,
        current_period_end_utc=sub["current_period_end_utc"] if sub else None,
        source=_billing_mode(),
    )


def _append_query_params(base_url: str, params: dict[str, str]) -> str:
    parsed = urlparse(base_url)
    current = dict(parse_qsl(parsed.query, keep_blank_values=True))
    current.update(params)
    return urlunparse(parsed._replace(query=urlencode(current)))


def _validate_return_url(raw: str, field_name: str) -> str:
    value = raw.strip()
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=400, detail=f"{field_name} must be an absolute http(s) URL.")
    return value


def _stripe_secret_key() -> str:
    key = _env_first("STRIPE_SECRET_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="STRIPE_SECRET_KEY is not configured.")
    return key


def _is_mock_billing_customer_id(customer_id: str | None) -> bool:
    return bool(customer_id and customer_id.startswith("cus_mock_"))


def _stripe_webhook_secret() -> str:
    secret = _env_first("STRIPE_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=503, detail="STRIPE_WEBHOOK_SECRET is not configured.")
    return secret


def _stripe_price_id(payload_price_id: str | None) -> str:
    price_id = (payload_price_id or _env_first("STRIPE_PRICE_ID_PRO", "STRIPE_PRICE_ID_PRO_MONTHLY")).strip()
    if not price_id:
        raise HTTPException(status_code=503, detail="Stripe price id is not configured.")
    return price_id


def _stripe_api_request(
    path: str,
    params: list[tuple[str, str]],
    *,
    method: str = "POST",
    idempotency_key: str | None = None,
) -> dict[str, object]:
    data = urlencode(params).encode("utf-8") if params else None
    req = urlrequest.Request(f"https://api.stripe.com{path}", data=data, method=method.upper())
    req.add_header("Authorization", f"Bearer {_stripe_secret_key()}")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    api_version = _env_first("STRIPE_API_VERSION")
    if api_version:
        req.add_header("Stripe-Version", api_version)
    if idempotency_key:
        req.add_header("Idempotency-Key", idempotency_key)
    try:
        with urlrequest.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urlerror.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {}
        message = None
        if isinstance(payload, dict):
            error_payload = payload.get("error")
            if isinstance(error_payload, dict):
                message = error_payload.get("message")
        detail = str(message or raw or "Stripe request failed.")
        raise HTTPException(status_code=502, detail=f"Stripe API error: {detail}") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Stripe API request failed.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="Stripe API returned an invalid payload.")
    return payload


def _stripe_ensure_customer(user_id: str, email: str | None) -> dict[str, str | None]:
    existing = get_billing_customer_by_user(user_id)
    normalized_email = (email or "").strip().lower() or None
    if existing is not None:
        if normalized_email and normalized_email != existing["email"]:
            _stripe_api_request(
                f"/v1/customers/{existing['stripe_customer_id']}",
                [
                    ("email", normalized_email),
                    ("metadata[litopc_user_id]", user_id),
                ],
                idempotency_key=f"litopc-customer-update-{sanitize_user_id(user_id)}",
            )
            return upsert_billing_customer(
                user_id=user_id,
                stripe_customer_id=existing["stripe_customer_id"],
                email=normalized_email,
            )
        return existing

    create_payload = [
        ("metadata[litopc_user_id]", user_id),
    ]
    if normalized_email:
        create_payload.append(("email", normalized_email))
    response = _stripe_api_request(
        "/v1/customers",
        create_payload,
        idempotency_key=f"litopc-customer-create-{sanitize_user_id(user_id)}",
    )
    customer_id = str(response.get("id") or "").strip()
    if not customer_id:
        raise HTTPException(status_code=502, detail="Stripe customer creation did not return an id.")
    return upsert_billing_customer(user_id=user_id, stripe_customer_id=customer_id, email=normalized_email)


def _stripe_parse_signature(header_value: str | None) -> tuple[int | None, list[str]]:
    if not header_value:
        return None, []
    timestamp: int | None = None
    signatures: list[str] = []
    for part in header_value.split(","):
        key, _, value = part.partition("=")
        key = key.strip()
        value = value.strip()
        if key == "t":
            try:
                timestamp = int(value)
            except ValueError:
                timestamp = None
        elif key == "v1" and value:
            signatures.append(value)
    return timestamp, signatures


def _verify_stripe_signature(header_value: str | None, body: bytes) -> None:
    timestamp, signatures = _stripe_parse_signature(header_value)
    if timestamp is None or not signatures:
        raise HTTPException(status_code=400, detail="Missing or invalid Stripe signature.")
    now = int(datetime.now(timezone.utc).timestamp())
    if abs(now - timestamp) > 300:
        raise HTTPException(status_code=400, detail="Stripe signature timestamp is outside tolerance.")
    signed_payload = f"{timestamp}.".encode("utf-8") + body
    expected = hmac.new(
        _stripe_webhook_secret().encode("utf-8"),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()
    if not any(hmac.compare_digest(expected, candidate) for candidate in signatures):
        raise HTTPException(status_code=400, detail="Stripe signature verification failed.")


def _stripe_unix_to_iso(raw: object) -> str | None:
    if isinstance(raw, int):
        return datetime.fromtimestamp(raw, timezone.utc).isoformat()
    if isinstance(raw, float):
        return datetime.fromtimestamp(int(raw), timezone.utc).isoformat()
    if isinstance(raw, str) and raw.isdigit():
        return datetime.fromtimestamp(int(raw), timezone.utc).isoformat()
    return None


def _stripe_metadata_user_id(obj: dict[str, object]) -> str:
    raw_meta = obj.get("metadata")
    if isinstance(raw_meta, dict):
        for key in ("litopc_user_id", "user_id"):
            value = raw_meta.get(key)
            if isinstance(value, str):
                sanitized = sanitize_user_id(value)
                if sanitized:
                    return sanitized
    for key in ("client_reference_id",):
        value = obj.get(key)
        if isinstance(value, str):
            sanitized = sanitize_user_id(value)
            if sanitized:
                return sanitized
    return ""


def _billing_user_from_stripe_object(obj: dict[str, object]) -> str:
    direct = _stripe_metadata_user_id(obj)
    if direct:
        return direct

    subscription_id = obj.get("id") if str(obj.get("object") or "") == "subscription" else obj.get("subscription")
    if isinstance(subscription_id, str):
        existing_sub = get_billing_subscription_by_id(subscription_id)
        if existing_sub is not None:
            return existing_sub["user_id"]

    customer_id = obj.get("customer")
    if isinstance(customer_id, str):
        existing_user = get_user_id_by_billing_customer(customer_id)
        if existing_user:
            return existing_user
    return ""


def _stripe_period_end_from_object(obj: dict[str, object]) -> str | None:
    for key in ("current_period_end",):
        period_end = _stripe_unix_to_iso(obj.get(key))
        if period_end:
            return period_end
    lines = obj.get("lines")
    if isinstance(lines, dict):
        data = lines.get("data")
        if isinstance(data, list):
            for item in data:
                if not isinstance(item, dict):
                    continue
                period = item.get("period")
                if not isinstance(period, dict):
                    continue
                period_end = _stripe_unix_to_iso(period.get("end"))
                if period_end:
                    return period_end
    return None


def _apply_billing_state(
    *,
    user_id: str,
    source: str,
    customer_id: str | None,
    subscription_id: str | None,
    status: str | None,
    period_end: str | None,
    email: str | None = None,
) -> None:
    if customer_id:
        upsert_billing_customer(user_id=user_id, stripe_customer_id=customer_id, email=email)
    if subscription_id:
        upsert_billing_subscription(
            user_id=user_id,
            stripe_subscription_id=subscription_id,
            stripe_customer_id=customer_id,
            status=status,
            current_period_end_utc=period_end,
        )
    if status in {"active", "trialing", "past_due"}:
        set_user_entitlement(user_id=user_id, plan="PRO", source=source, pro_expires_at_utc=period_end)
    elif status:
        set_user_entitlement(user_id=user_id, plan="FREE", source=source, pro_expires_at_utc=None)


def _handle_stripe_event(event_type: str, obj: dict[str, object]) -> None:
    user_id = _billing_user_from_stripe_object(obj)
    customer_id = obj.get("customer") if isinstance(obj.get("customer"), str) else None
    subscription_id: str | None = None
    email: str | None = None
    status: str | None = None
    period_end: str | None = None

    if event_type == "checkout.session.completed":
        subscription_id = obj.get("subscription") if isinstance(obj.get("subscription"), str) else None
        if isinstance(obj.get("customer_email"), str):
            email = str(obj.get("customer_email")).strip().lower()
        customer_details = obj.get("customer_details")
        if not email and isinstance(customer_details, dict) and isinstance(customer_details.get("email"), str):
            email = str(customer_details.get("email")).strip().lower()
        status = "checkout_completed"
        period_end = None
    elif event_type == "invoice.paid":
        subscription_id = obj.get("subscription") if isinstance(obj.get("subscription"), str) else None
        status = "active"
        period_end = _stripe_period_end_from_object(obj)
    elif event_type == "customer.subscription.updated":
        subscription_id = obj.get("id") if isinstance(obj.get("id"), str) else None
        status = str(obj.get("status") or "").strip().lower() or None
        period_end = _stripe_period_end_from_object(obj)
    elif event_type == "customer.subscription.deleted":
        subscription_id = obj.get("id") if isinstance(obj.get("id"), str) else None
        status = "canceled"
        period_end = None
    else:
        return

    if not user_id:
        _record_policy_audit(
            endpoint="/billing/webhook/stripe",
            method="POST",
            client_id=customer_id or subscription_id or "stripe:unknown",
            decision="observed",
            reason="stripe_user_resolution_failed",
            meta={"event_type": event_type},
        )
        return

    _apply_billing_state(
        user_id=user_id,
        source="stripe_webhook",
        customer_id=customer_id,
        subscription_id=subscription_id,
        status=status,
        period_end=period_end,
        email=email,
    )
    _record_policy_audit(
        endpoint="/billing/webhook/stripe",
        method="POST",
        client_id=user_id,
        plan=_effective_plan_for_user(user_id),
        decision="observed",
        meta={
            "event_type": event_type,
            "status": status or "none",
            "customer_id": customer_id or "",
            "subscription_id": subscription_id or "",
        },
    )

def _plan_entitlements(plan: Plan) -> PlanEntitlements:
    return PlanEntitlements(
        plan=plan,
        limits=_limits_for_plan(plan),
        max_custom_rects=FREE_CUSTOM_MAX_RECTS if plan == "FREE" else PRO_CUSTOM_MAX_SHAPES,
        max_sweep_points_per_run=FREE_SWEEP_MAX_POINTS if plan == "FREE" else PRO_SWEEP_MAX_POINTS,
        scenario_limit=FREE_SCENARIO_LIMIT if plan == "FREE" else None,
        quick_add_enabled=plan == "PRO",
        batch_sweep_enabled=plan == "PRO",
        high_res_export_enabled=plan == "PRO",
        updated_at_utc=_now_utc_iso(),
    )

def _current_entitlement_for_user(user_id: str) -> CurrentEntitlementResponse:
    plan = _effective_plan_for_user(user_id)
    rec = get_user_entitlement(sanitize_user_id(user_id))
    source = rec["source"] if rec is not None else "default_free"
    pro_expires = rec["pro_expires_at_utc"] if rec is not None else None
    base = _plan_entitlements(plan)
    return CurrentEntitlementResponse(
        user_id=user_id,
        plan=plan,
        source=source,
        pro_expires_at_utc=pro_expires,
        limits=base.limits,
        max_custom_rects=base.max_custom_rects,
        max_sweep_points_per_run=base.max_sweep_points_per_run,
        scenario_limit=base.scenario_limit,
        quick_add_enabled=base.quick_add_enabled,
        batch_sweep_enabled=base.batch_sweep_enabled,
        high_res_export_enabled=base.high_res_export_enabled,
        updated_at_utc=base.updated_at_utc,
    )

def _consume_usage_quota(
    plan: Plan,
    client_id: str,
    op: UsageOp,
    amount: int = 1,
    clamp: bool = False,
) -> tuple[bool, int, UsageStatus, str | None]:
    if amount <= 0:
        raise ValueError("amount must be positive")
    day = _day_utc()
    limits = _limits_for_plan(plan)
    limit = limits[op]
    allowed, granted, bucket = db_consume_usage_quota(
        user_id=client_id,
        day_utc=day,
        op=op,
        amount=amount,
        limit=limit,
        clamp=clamp,
    )
    used = int(bucket.get(op, 0))
    reason = None
    if not allowed:
        reason = f"Daily {op} quota exceeded ({used}/{limit})."
    status = _build_usage_status(day, plan, bucket)
    return allowed, granted, status, reason

def _build_sweep_values(start: float, stop: float, step: float) -> list[float]:
    if step <= 0:
        raise HTTPException(status_code=400, detail="step must be > 0")
    direction = 1 if stop >= start else -1
    signed_step = abs(step) * direction
    values = []
    v = start
    guard = 0
    while (v <= stop + 1e-12) if direction > 0 else (v >= stop - 1e-12):
        values.append(float(v))
        v += signed_step
        guard += 1
        if guard > 20000:
            break
    if not values:
        values = [float(start)]
    return values

def _set_sweep_param(req: SimRequest, param: str, value: float) -> None:
    if param == "dose":
        req.dose = float(value)
        return
    if param == "focus":
        req.focus = float(value)
        return
    prefix = "mask.params_nm."
    if param.startswith(prefix):
        key = param[len(prefix) :]
        req.mask.params_nm[key] = float(value)
        return
    raise HTTPException(status_code=400, detail=f"Unsupported sweep param: {param}")

def _decimate_polyline(poly: Polyline, max_points: int) -> Polyline:
    pts = poly.points_nm
    n = len(pts)
    if n <= max_points:
        return poly
    stride = max(1, math.ceil(n / max_points))
    sampled = [pts[i] for i in range(0, n, stride)]
    if sampled and sampled[-1] != pts[-1]:
        sampled.append(pts[-1])
    return Polyline(points_nm=sampled[:max_points])

@app.get("/entitlements", response_model=EntitlementsResponse)
def entitlements():
    return EntitlementsResponse(
        version=ENTITLEMENT_VERSION,
        plans=[_plan_entitlements("FREE"), _plan_entitlements("PRO")],
    )

@app.get("/entitlements/me", response_model=CurrentEntitlementResponse)
def entitlements_me(request: Request):
    user_id = _resolve_user_id(request)
    return _current_entitlement_for_user(user_id)

@app.post("/admin/entitlements/set", response_model=AdminEntitlementSetResponse)
def admin_set_entitlement(payload: AdminEntitlementSetRequest, request: Request):
    _require_admin_token(request)
    user_id = sanitize_user_id(payload.user_id)
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid user_id.")
    if payload.plan == "PRO" and payload.pro_days:
        rec = grant_pro_days(user_id=user_id, days=payload.pro_days, source=payload.source)
    else:
        rec = set_user_entitlement(
            user_id=user_id,
            plan=payload.plan,
            source=payload.source,
            pro_expires_at_utc=None,
        )
    return AdminEntitlementSetResponse(
        ok=True,
        user_id=rec["user_id"],
        plan=rec["plan"],
        source=rec["source"],
        pro_expires_at_utc=rec["pro_expires_at_utc"],
        updated_at_utc=rec["updated_at_utc"],
    )

@app.post("/admin/invites/set", response_model=InviteAllowlistItem)
def admin_set_invite(payload: AdminInviteSetRequest, request: Request):
    _require_admin_token(request)
    email = payload.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email.")
    expires_at = None
    if payload.expires_in_days is not None:
        expires_at = (datetime.now(timezone.utc) + timedelta(days=payload.expires_in_days)).isoformat()
    rec = set_invite_allowlist(
        email=email,
        role=payload.role,
        plan_default=payload.plan_default,
        expires_at_utc=expires_at,
    )
    return InviteAllowlistItem(
        email=rec["email"],
        role=rec["role"],
        plan_default=rec["plan_default"],
        expires_at_utc=rec["expires_at_utc"],
        used_at_utc=rec["used_at_utc"],
        updated_at_utc=rec["updated_at_utc"],
    )

@app.get("/admin/invites", response_model=AdminInviteListResponse)
def admin_list_invites(request: Request, limit: int = 200):
    _require_admin_token(request)
    rows = list_invite_allowlist(limit=limit)
    items = [
        InviteAllowlistItem(
            email=row["email"],
            role=row["role"],
            plan_default=row["plan_default"],
            expires_at_utc=row["expires_at_utc"],
            used_at_utc=row["used_at_utc"],
            updated_at_utc=row["updated_at_utc"],
        )
        for row in rows
    ]
    return AdminInviteListResponse(count=len(items), items=items)


@app.get("/billing/me", response_model=BillingStatusResponse)
def billing_me(request: Request):
    user_id = _resolve_user_id(request)
    return _resolve_billing_status_for_user(user_id)


@app.post("/billing/checkout/session", response_model=BillingCheckoutResponse)
def billing_checkout_session(payload: BillingCheckoutRequest, request: Request):
    mode = _billing_mode()
    user_id = _resolve_user_id(request)
    success_url = _validate_return_url(payload.success_url, "success_url")
    cancel_url = _validate_return_url(payload.cancel_url, "cancel_url")
    email = getattr(request.state, "litopc_email", None)

    if mode == "stub":
        customer = get_billing_customer_by_user(user_id)
        if customer is None:
            customer = upsert_billing_customer(user_id=user_id, stripe_customer_id=_mock_customer_id(user_id), email=email)

        session_id = _mock_checkout_session_id(user_id)
        sub_id = _mock_subscription_id(user_id)
        upsert_billing_subscription(
            user_id=user_id,
            stripe_subscription_id=sub_id,
            stripe_customer_id=customer["stripe_customer_id"],
            status="checkout_started",
            current_period_end_utc=None,
        )
        redirect_url = _append_query_params(
            success_url,
            {"litopc_checkout": "stub", "session_id": session_id, "user": user_id},
        )
        _record_policy_audit(
            endpoint="/billing/checkout/session",
            method="POST",
            client_id=user_id,
            plan=_effective_plan_for_user(user_id),
            decision="observed",
            meta={
                "mode": mode,
                "price_id": payload.price_id or "env_default",
                "cancel_url": cancel_url,
                "redirect_url": redirect_url,
            },
        )
        return BillingCheckoutResponse(url=redirect_url, session_id=session_id)

    if mode != "stripe":
        raise HTTPException(status_code=503, detail=f"Unsupported BILLING_MODE: {mode}")

    if not email:
        raise HTTPException(status_code=400, detail="Billing checkout requires an email identity.")

    customer = _stripe_ensure_customer(user_id=user_id, email=email)
    session_payload = _stripe_api_request(
        "/v1/checkout/sessions",
        [
            ("mode", "subscription"),
            ("success_url", success_url),
            ("cancel_url", cancel_url),
            ("customer", customer["stripe_customer_id"]),
            ("client_reference_id", user_id),
            ("allow_promotion_codes", "true"),
            ("line_items[0][price]", _stripe_price_id(payload.price_id)),
            ("line_items[0][quantity]", "1"),
            ("metadata[litopc_user_id]", user_id),
            ("subscription_data[metadata][litopc_user_id]", user_id),
        ],
        idempotency_key=f"litopc-checkout-{sanitize_user_id(user_id)}-{int(datetime.now(timezone.utc).timestamp())}",
    )
    session_id = str(session_payload.get("id") or "").strip()
    redirect_url = str(session_payload.get("url") or "").strip()
    if not session_id or not redirect_url:
        raise HTTPException(status_code=502, detail="Stripe checkout session did not return a redirect URL.")
    _record_policy_audit(
        endpoint="/billing/checkout/session",
        method="POST",
        client_id=user_id,
        plan=_effective_plan_for_user(user_id),
        decision="observed",
        meta={
            "mode": mode,
            "price_id": payload.price_id or "env_default",
            "cancel_url": cancel_url,
            "session_id": session_id,
        },
    )
    return BillingCheckoutResponse(url=redirect_url, session_id=session_id)


@app.post("/billing/portal/session", response_model=BillingPortalResponse)
def billing_portal_session(payload: BillingPortalRequest, request: Request):
    mode = _billing_mode()
    user_id = _resolve_user_id(request)
    return_url = _validate_return_url(payload.return_url, "return_url")
    customer = get_billing_customer_by_user(user_id)
    if customer is None:
        raise HTTPException(status_code=400, detail="No billing customer exists for this user yet.")
    if mode == "stripe" and _is_mock_billing_customer_id(customer["stripe_customer_id"]):
        raise HTTPException(
            status_code=400,
            detail="Stripe billing portal is unavailable for legacy mock entitlements. Start a fresh upgrade checkout instead.",
        )

    if mode == "stub":
        url = _append_query_params(
            return_url,
            {"litopc_portal": "stub", "customer_id": customer["stripe_customer_id"], "user": user_id},
        )
        _record_policy_audit(
            endpoint="/billing/portal/session",
            method="POST",
            client_id=user_id,
            plan=_effective_plan_for_user(user_id),
            decision="observed",
            meta={"mode": mode, "portal_url": url},
        )
        return BillingPortalResponse(url=url)

    if mode != "stripe":
        raise HTTPException(status_code=503, detail=f"Unsupported BILLING_MODE: {mode}")

    session_payload = _stripe_api_request(
        "/v1/billing_portal/sessions",
        [
            ("customer", customer["stripe_customer_id"]),
            ("return_url", return_url),
        ],
        idempotency_key=f"litopc-portal-{sanitize_user_id(user_id)}-{int(datetime.now(timezone.utc).timestamp())}",
    )
    url = str(session_payload.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=502, detail="Stripe billing portal did not return a redirect URL.")
    _record_policy_audit(
        endpoint="/billing/portal/session",
        method="POST",
        client_id=user_id,
        plan=_effective_plan_for_user(user_id),
        decision="observed",
        meta={"mode": mode, "portal_url": url},
    )
    return BillingPortalResponse(url=url)


@app.post("/billing/webhook/mock", response_model=BillingStatusResponse)
def billing_webhook_mock(payload: BillingWebhookMockRequest, request: Request):
    _require_admin_token(request)
    mode = _billing_mode()
    if mode != "stub":
        raise HTTPException(status_code=503, detail="Mock webhook is only available in BILLING_MODE=stub.")

    user_id = sanitize_user_id(payload.user_id)
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid user_id.")

    if payload.stripe_customer_id:
        customer_id = payload.stripe_customer_id
    else:
        known_customer = get_billing_customer_by_user(user_id)
        customer_id = known_customer["stripe_customer_id"] if known_customer else _mock_customer_id(user_id)
    upsert_billing_customer(user_id=user_id, stripe_customer_id=customer_id)

    if payload.stripe_subscription_id:
        subscription_id = payload.stripe_subscription_id
    else:
        existing_sub = get_billing_subscription_by_user(user_id)
        subscription_id = existing_sub["stripe_subscription_id"] if existing_sub else _mock_subscription_id(user_id)
    if not subscription_id:
        subscription_id = _mock_subscription_id(user_id)

    event_type = payload.event_type
    incoming_status = (payload.status or "").strip().lower()
    if event_type == "customer.subscription.deleted":
        effective_status = "canceled"
    elif incoming_status:
        effective_status = incoming_status
    else:
        effective_status = "active"

    period_days = payload.period_days if payload.period_days is not None else 30
    period_end = _iso_after_days(period_days) if effective_status in {"active", "trialing", "past_due"} else None

    upsert_billing_subscription(
        user_id=user_id,
        stripe_subscription_id=subscription_id,
        stripe_customer_id=customer_id,
        status=effective_status,
        current_period_end_utc=period_end,
    )

    if effective_status in {"active", "trialing", "past_due"}:
        set_user_entitlement(user_id=user_id, plan="PRO", source=payload.source, pro_expires_at_utc=period_end)
    else:
        set_user_entitlement(user_id=user_id, plan="FREE", source=payload.source, pro_expires_at_utc=None)

    _record_policy_audit(
        endpoint="/billing/webhook/mock",
        method="POST",
        client_id=user_id,
        plan=_effective_plan_for_user(user_id),
        decision="observed",
        meta={
            "event_type": event_type,
            "status": effective_status,
            "subscription_id": subscription_id,
            "customer_id": customer_id,
        },
    )
    return _resolve_billing_status_for_user(user_id)


@app.post("/billing/webhook/stripe")
async def billing_webhook_stripe(request: Request):
    mode = _billing_mode()
    if mode != "stripe":
        raise HTTPException(status_code=503, detail="Stripe webhook is only available in BILLING_MODE=stripe.")

    raw_body = await request.body()
    _verify_stripe_signature(request.headers.get("stripe-signature"), raw_body)
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid Stripe webhook payload.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid Stripe webhook envelope.")

    event_type = str(payload.get("type") or "").strip()
    data = payload.get("data")
    obj = data.get("object") if isinstance(data, dict) else None
    if not isinstance(obj, dict):
        raise HTTPException(status_code=400, detail="Stripe webhook object is missing.")

    _handle_stripe_event(event_type, obj)
    return {"ok": True}

@app.get("/policy/audit", response_model=PolicyAuditResponse)
def policy_audit(limit: int = 120):
    capped = max(1, min(limit, 1000))
    rows = list_policy_audit(capped)
    records = [
        PolicyAuditRecord(
            ts_utc=row["ts_utc"],
            endpoint=row["endpoint"],
            method=row["method"],
            client_id=row["client_id"],
            plan=row["plan"],
            decision=row["decision"],  # type: ignore[arg-type]
            reason=row["reason"],
            meta=row["meta"],
        )
        for row in rows
    ]
    return PolicyAuditResponse(count=len(records), records=records)

@app.post("/events/ingest", response_model=EventIngestResponse)
def ingest_events(payload: EventIngestRequest, request: Request):
    client_id = _resolve_actor_id(request)
    now = _now_utc_iso()
    rows = [
        {
            "name": event.name,
            "day_utc": _event_day_from_ts(event.ts),
            "event_ts_utc": event.ts or now,
            "ingested_ts_utc": now,
            "client_id": client_id,
            "payload": event.payload,
        }
        for event in payload.events
    ]
    accepted, dropped = ingest_product_events(rows, PRODUCT_EVENT_MAX_ROWS)
    return EventIngestResponse(accepted=accepted, dropped=dropped)

@app.get("/events/summary", response_model=EventSummaryResponse)
def events_summary(window_days: int = 7):
    window = max(1, min(window_days, 30))
    today = datetime.now(timezone.utc).date()
    day_keys = [(today - timedelta(days=i)).isoformat() for i in range(window - 1, -1, -1)]
    by_day_counts: dict[str, dict[ProductEventName, int]] = {day: _zero_event_counts() for day in day_keys}
    min_day = day_keys[0]
    max_day = day_keys[-1]
    events_snapshot = list_product_events(min_day, max_day)

    for row in events_snapshot:
        day = row["day_utc"]
        name = row["name"]
        if day not in by_day_counts:
            continue
        if name not in _PRODUCT_EVENT_NAMES:
            continue
        by_day_counts[day][name] += 1  # type: ignore[index]

    totals = _zero_event_counts()
    by_day: list[EventDailySummary] = []
    for day in day_keys:
        counts = by_day_counts[day]
        for name in _PRODUCT_EVENT_NAMES:
            totals[name] += counts[name]
        by_day.append(
            EventDailySummary(
                day_utc=day,
                counts=counts,
                upgrade_click_rate=_safe_rate(
                    counts["upgrade_prompt_clicked"], counts["upgrade_prompt_viewed"]
                ),
                export_block_rate=_safe_rate(
                    counts["export_blocked_quota"], counts["export_attempted"]
                ),
            )
        )

    return EventSummaryResponse(
        generated_at_utc=_now_utc_iso(),
        window_days=window,
        totals=totals,
        by_day=by_day,
        upgrade_click_rate=_safe_rate(
            totals["upgrade_prompt_clicked"], totals["upgrade_prompt_viewed"]
        ),
        export_block_rate=_safe_rate(
            totals["export_blocked_quota"], totals["export_attempted"]
        ),
    )

@app.get("/trust/benchmarks/trend", response_model=BenchmarkTrendResponse)
def trust_benchmark_trend(limit: int = 30):
    capped = max(1, min(limit, 365))
    points, history_count = _load_trust_history(capped)
    return BenchmarkTrendResponse(
        generated_at_utc=_now_utc_iso(),
        history_count=history_count,
        latest=_load_trust_latest(),
        trend=points,
    )

@app.get("/usage/status", response_model=UsageStatus)
def usage_status(request: Request, plan: Plan | None = None):
    actor_id = _resolve_actor_id(request)
    effective_plan = _effective_plan_for_request(request)
    day = _day_utc()
    bucket = db_get_usage_bucket(actor_id, day)
    return _build_usage_status(day, effective_plan, bucket)

@app.post("/usage/consume", response_model=UsageConsumeResponse)
def usage_consume(payload: UsageConsumeRequest, request: Request):
    actor_id = _resolve_actor_id(request)
    effective_plan = _effective_plan_for_request(request)
    allowed, granted, status, reason = _consume_usage_quota(
        effective_plan, actor_id, payload.op, payload.amount, payload.clamp
    )
    _record_policy_audit(
        endpoint="/usage/consume",
        method="POST",
        client_id=actor_id,
        plan=effective_plan,
        decision="allowed" if allowed else "blocked",
        reason=reason,
        meta={
            "op": payload.op,
            "amount_requested": payload.amount,
            "amount_granted": granted,
            "clamp": payload.clamp,
            "requested_plan": payload.plan,
        },
    )
    return UsageConsumeResponse(allowed=allowed, granted=granted, reason=reason, status=status)

@app.post("/simulate", response_model=SimResponse)
def simulate(req: SimRequest, request: Request):
    actor_id = _resolve_actor_id(request)
    effective_plan = _effective_plan_for_request(request)
    requested_plan = req.plan
    req = req.model_copy(deep=True)
    req.plan = effective_plan
    try:
        policy_req = _apply_request_policy(req)
    except HTTPException as exc:
        _record_policy_audit(
            endpoint="/simulate",
            method="POST",
            client_id=actor_id,
            plan=effective_plan,
            decision="blocked",
            reason=str(exc.detail),
            meta={"stage": "request_policy"},
        )
        raise
    adjustments = _policy_adjustments(req, policy_req)
    if adjustments:
        _record_policy_audit(
            endpoint="/simulate",
            method="POST",
            client_id=actor_id,
            plan=effective_plan,
            decision="adjusted",
            meta=adjustments,
        )
    if requested_plan != effective_plan:
        _record_policy_audit(
            endpoint="/simulate",
            method="POST",
            client_id=actor_id,
            plan=effective_plan,
            decision="adjusted",
            reason="Request plan overridden by server entitlement.",
            meta={"requested_plan": requested_plan, "effective_plan": effective_plan},
        )
    usage_kind = (_request_header_first(request, "x-litopc-usage-kind", "x-opclab-usage-kind") or "run").strip().lower()
    op: UsageOp = "sweep_points" if usage_kind == "sweep-point" else "runs"
    allowed, _, status, reason = _consume_usage_quota(policy_req.plan, actor_id, op, 1, clamp=False)
    if not allowed:
        _record_policy_audit(
            endpoint="/simulate",
            method="POST",
            client_id=actor_id,
            plan=policy_req.plan,
            decision="blocked",
            reason=reason,
            meta={"stage": "quota", "op": op},
        )
        raise HTTPException(
            status_code=429,
            detail=reason or f"Daily {op} quota exceeded.",
            headers={"X-LITOPC-USAGE-REMAINING": str(status.remaining[op])},
        )
    _record_policy_audit(
        endpoint="/simulate",
        method="POST",
        client_id=actor_id,
        plan=policy_req.plan,
        decision="allowed",
        meta={"op": op},
    )
    return run_simulation(policy_req)

@app.post("/simulate/batch", response_model=BatchSimResponse)
def simulate_batch(batch: BatchSimRequest, request: Request):
    actor_id = _resolve_actor_id(request)
    effective_plan = _effective_plan_for_request(request)
    requested_plan = batch.base.plan
    batch = batch.model_copy(deep=True)
    batch.base.plan = effective_plan
    try:
        base = _apply_request_policy(batch.base)
    except HTTPException as exc:
        _record_policy_audit(
            endpoint="/simulate/batch",
            method="POST",
            client_id=actor_id,
            plan=effective_plan,
            decision="blocked",
            reason=str(exc.detail),
            meta={"stage": "request_policy"},
        )
        raise
    adjustments = _policy_adjustments(batch.base, base)
    if adjustments:
        _record_policy_audit(
            endpoint="/simulate/batch",
            method="POST",
            client_id=actor_id,
            plan=effective_plan,
            decision="adjusted",
            meta=adjustments,
        )
    if requested_plan != effective_plan:
        _record_policy_audit(
            endpoint="/simulate/batch",
            method="POST",
            client_id=actor_id,
            plan=effective_plan,
            decision="adjusted",
            reason="Request plan overridden by server entitlement.",
            meta={"requested_plan": requested_plan, "effective_plan": effective_plan},
        )
    values = _build_sweep_values(batch.start, batch.stop, batch.step)
    requested_points = len(values)
    max_points = FREE_SWEEP_MAX_POINTS if base.plan == "FREE" else PRO_SWEEP_MAX_POINTS
    clamped_by_plan = False
    if len(values) > max_points:
        values = values[:max_points]
        clamped_by_plan = True
        _record_policy_audit(
            endpoint="/simulate/batch",
            method="POST",
            client_id=actor_id,
            plan=base.plan,
            decision="clamped",
            reason="Plan sweep point cap applied.",
            meta={"requested_points": requested_points, "granted_points": len(values)},
        )

    quota_note = None
    allowed, granted, status, reason = _consume_usage_quota(
        base.plan, actor_id, "sweep_points", len(values), clamp=True
    )
    if not allowed:
        _record_policy_audit(
            endpoint="/simulate/batch",
            method="POST",
            client_id=actor_id,
            plan=base.plan,
            decision="blocked",
            reason=reason,
            meta={"stage": "quota", "op": "sweep_points"},
        )
        raise HTTPException(
            status_code=429,
            detail=reason or "Daily sweep_points quota exceeded.",
            headers={"X-LITOPC-USAGE-REMAINING": str(status.remaining["sweep_points"])},
        )
    if granted < len(values):
        before_quota = len(values)
        values = values[:granted]
        quota_note = (
            f"Point count clamped by daily quota: granted {granted}, "
            f"remaining {status.remaining['sweep_points']}."
        )
        _record_policy_audit(
            endpoint="/simulate/batch",
            method="POST",
            client_id=actor_id,
            plan=base.plan,
            decision="clamped",
            reason="Daily sweep point quota clamp applied.",
            meta={"requested_points": before_quota, "granted_points": granted},
        )

    points: list[BatchPoint] = []
    for value in values:
        req = base.model_copy(deep=True)
        _set_sweep_param(req, batch.param, value)
        req = _apply_request_policy(req)
        sim = run_simulation(req)

        contours = None
        if batch.include_contours:
            contours = [_decimate_polyline(c, batch.max_points_per_contour) for c in sim.contours_nm]

        points.append(
            BatchPoint(
                value=float(value),
                metrics=sim.metrics,
                contours_nm=contours,
            )
        )

    note = None
    if clamped_by_plan:
        note = f"Point count clamped to {max_points} for plan {base.plan}."
    if quota_note:
        note = f"{note + ' ' if note else ''}{quota_note}"

    _record_policy_audit(
        endpoint="/simulate/batch",
        method="POST",
        client_id=actor_id,
        plan=base.plan,
        decision="clamped" if (clamped_by_plan or quota_note is not None) else "allowed",
        meta={"requested_points": requested_points, "returned_points": len(points)},
    )

    return BatchSimResponse(
        param=batch.param,
        points=points,
        count=len(points),
        clamped_by_plan=clamped_by_plan,
        note=note,
    )
