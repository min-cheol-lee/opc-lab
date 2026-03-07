$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontend = Join-Path $root "frontend"
$backend = Join-Path $root "backend"
$python = Join-Path $backend ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
  throw "Backend virtualenv python not found: $python"
}

Write-Host "[1/3] Frontend typecheck"
Push-Location $frontend
npx --no-install tsc --noEmit
Pop-Location

Write-Host "[2/3] Backend contour smoke"
Push-Location $backend
& $python -m app.sim.contour_smoke_test
Pop-Location

Write-Host "[3/3] Backend simulate + batch smoke"
$smoke = @'
from starlette.requests import Request

from app.main import (
    entitlements,
    events_summary,
    ingest_events,
    policy_audit,
    simulate,
    simulate_batch,
)
from app.models import BatchSimRequest, EventIngestRequest, MaskSpec, SimRequest

def make_request(path: str, method: str = "POST", headers: dict[str, str] | None = None, client_host: str = "127.0.0.1"):
    headers = headers or {}
    raw_headers = [(k.lower().encode("latin-1"), v.encode("latin-1")) for k, v in headers.items()]
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("latin-1"),
        "query_string": b"",
        "headers": raw_headers,
        "client": (client_host, 0),
        "server": ("localhost", 8000),
    }

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    return Request(scope, receive)

request_headers = {"x-litopc-client-id": "smoke-hardening-cli"}

base = SimRequest(
    plan="FREE",
    grid=512,
    preset_id="DUV_193_DRY",
    mask=MaskSpec(
        mode="TEMPLATE",
        template_id="ISO_LINE",
        params_nm={
            "fov_nm": 1100,
            "cd_nm": 80,
            "length_nm": 900,
            "pitch_nm": 140,
            "sraf_on": 0,
        },
    ),
    dose=0.5,
    focus=0.0,
    return_intensity=False,
)

sim = simulate(base, make_request("/simulate", method="POST", headers=request_headers))
assert sim.metrics.cd_nm is not None
assert len(sim.contours_nm) >= 1

batch_req = BatchSimRequest(
        base=base,
        param="dose",
        start=0.4,
        stop=0.6,
        step=0.1,
        include_contours=True,
        max_points_per_contour=400,
)
res = simulate_batch(batch_req, make_request("/simulate/batch", method="POST", headers=request_headers))
assert res.count == 3
assert len(res.points) == 3
assert res.points[0].contours_nm is not None

ent = entitlements()
plans = [p.plan for p in ent.plans]
assert "FREE" in plans and "PRO" in plans

events = ingest_events(
    EventIngestRequest(
        events=[
            {"name": "upgrade_prompt_viewed", "ts": "2026-02-24T00:00:00Z", "payload": {"source": "smoke"}},
            {"name": "upgrade_prompt_clicked", "ts": "2026-02-24T00:00:01Z", "payload": {"source": "smoke"}},
        ]
    ),
    make_request("/events/ingest", method="POST", headers=request_headers),
)
assert events.accepted >= 2

summary = events_summary(window_days=7)
assert summary.totals["upgrade_prompt_viewed"] >= 1

audit = policy_audit(limit=20)
assert audit.count >= 1

print("OK: simulate + batch + entitlement/event/audit smoke")
'@

Push-Location $backend
$smoke | & $python -
Pop-Location

Write-Host "Hardening smoke checks passed."
