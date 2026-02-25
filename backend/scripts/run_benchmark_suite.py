from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from starlette.requests import Request

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.main import app as opclab_app  # noqa: E402
from app.main import simulate, simulate_batch  # noqa: E402
from app.models import BatchSimRequest, MaskSpec, SimRequest  # noqa: E402

SUITE_FILE = ROOT_DIR / "trust" / "benchmark-suite.v1.json"
ARTIFACT_DIR = ROOT_DIR / "trust" / "artifacts"
LATEST_FILE = ARTIFACT_DIR / "benchmark-latest.json"
HISTORY_FILE = ARTIFACT_DIR / "benchmark-history.json"
MODEL_VERSION = "v0.1.0-edu-guard-1"
RUNNER_CLIENT_ID = "trust-benchmark-runner"


def make_request(path: str, method: str = "POST") -> Request:
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("latin-1"),
        "query_string": b"",
        "headers": [(b"x-opclab-client-id", RUNNER_CLIENT_ID.encode("latin-1"))],
        "client": ("127.0.0.1", 0),
        "server": ("localhost", 8000),
    }

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    return Request(scope, receive)


def non_increasing(values: list[float]) -> bool:
    return all(values[i + 1] <= values[i] + 1e-9 for i in range(len(values) - 1))


def non_decreasing(values: list[float]) -> bool:
    return all(values[i + 1] >= values[i] - 1e-9 for i in range(len(values) - 1))


def load_suite_meta() -> tuple[str, dict[str, dict[str, str]]]:
    if not SUITE_FILE.exists():
        return "unknown", {}
    try:
        payload = json.loads(SUITE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return "unknown", {}
    cases = payload.get("cases", [])
    case_map: dict[str, dict[str, str]] = {}
    if isinstance(cases, list):
        for row in cases:
            if not isinstance(row, dict):
                continue
            case_id = str(row.get("id", "")).strip()
            if not case_id:
                continue
            case_map[case_id] = {
                "title": str(row.get("title", case_id)),
                "intent": str(row.get("intent", "")),
            }
    suite_version = str(payload.get("suite_version", "unknown"))
    return suite_version, case_map


def build_base_request(
    *,
    preset_id: str,
    template_id: str,
    params_nm: dict[str, float],
    dose: float = 0.4,
    focus: float = 0.0,
    plan: str = "PRO",
    grid: int = 512,
    return_intensity: bool = False,
) -> SimRequest:
    return SimRequest(
        plan=plan,  # type: ignore[arg-type]
        grid=grid,
        preset_id=preset_id,  # type: ignore[arg-type]
        mask=MaskSpec(mode="TEMPLATE", template_id=template_id, params_nm=params_nm),  # type: ignore[arg-type]
        dose=dose,
        focus=focus,
        return_intensity=return_intensity,
    )


def case_iso_dose_monotonic_duv_imm() -> tuple[list[dict[str, object]], dict[str, object]]:
    base = build_base_request(
        preset_id="DUV_193_IMM",
        template_id="ISO_LINE",
        params_nm={"fov_nm": 1100, "cd_nm": 80, "length_nm": 900, "sraf_on": 0},
    )
    out = simulate_batch(
        BatchSimRequest(base=base, param="dose", start=0.3, stop=0.6, step=0.1, include_contours=False),
        make_request("/simulate/batch"),
    )
    cds = [p.metrics.cd_nm for p in out.points]
    cds_clean = [float(v) for v in cds if v is not None]
    checks = [
        {"name": "point_count", "ok": out.count == 4, "actual": out.count},
        {"name": "all_cd_present", "ok": len(cds_clean) == 4, "actual": cds},
        {"name": "cd_non_increasing", "ok": len(cds_clean) == 4 and non_increasing(cds_clean), "actual": cds},
    ]
    return checks, {"cds": cds}


def case_iso_dose_extinction_duv_dry() -> tuple[list[dict[str, object]], dict[str, object]]:
    low = build_base_request(
        preset_id="DUV_193_DRY",
        template_id="ISO_LINE",
        params_nm={"fov_nm": 1100, "cd_nm": 80, "length_nm": 900, "sraf_on": 0},
        dose=0.3,
    )
    high = low.model_copy(deep=True)
    high.dose = 0.6
    low_out = simulate(low, make_request("/simulate"))
    high_out = simulate(high, make_request("/simulate"))
    checks = [
        {"name": "low_dose_prints", "ok": low_out.metrics.cd_nm is not None and len(low_out.contours_nm) > 0, "actual": low_out.metrics.cd_nm},
        {"name": "high_dose_extinct", "ok": high_out.metrics.cd_nm is None and len(high_out.contours_nm) == 0, "actual": high_out.metrics.cd_nm},
    ]
    return checks, {"low_cd": low_out.metrics.cd_nm, "high_cd": high_out.metrics.cd_nm}


def case_contact_width_monotonic_duv_dry() -> tuple[list[dict[str, object]], dict[str, object]]:
    base = build_base_request(
        preset_id="DUV_193_DRY",
        template_id="CONTACT_RAW",
        params_nm={"fov_nm": 1100, "w_nm": 120, "cd_nm": 120, "sraf_on": 0},
        dose=0.4,
    )
    out = simulate_batch(
        BatchSimRequest(base=base, param="mask.params_nm.w_nm", start=120, stop=180, step=20, include_contours=False),
        make_request("/simulate/batch"),
    )
    cds = [p.metrics.cd_nm for p in out.points]
    cds_clean = [float(v) for v in cds if v is not None]
    checks = [
        {"name": "point_count", "ok": out.count == 4, "actual": out.count},
        {"name": "all_cd_present", "ok": len(cds_clean) == 4, "actual": cds},
        {"name": "cd_non_decreasing", "ok": len(cds_clean) == 4 and non_decreasing(cds_clean), "actual": cds},
    ]
    return checks, {"cds": cds}


def case_contact_serif_monotonic_duv_dry() -> tuple[list[dict[str, object]], dict[str, object]]:
    serif_values = [0, 20, 40, 60]
    cds: list[float | None] = []
    for serif in serif_values:
        if serif == 0:
            req = build_base_request(
                preset_id="DUV_193_DRY",
                template_id="CONTACT_RAW",
                params_nm={"fov_nm": 1100, "w_nm": 120, "cd_nm": 120, "sraf_on": 0},
                dose=0.4,
            )
        else:
            req = build_base_request(
                preset_id="DUV_193_DRY",
                template_id="CONTACT_OPC_SERIF",
                params_nm={"fov_nm": 1100, "w_nm": 120, "serif_nm": float(serif), "sraf_on": 0},
                dose=0.4,
            )
        out = simulate(req, make_request("/simulate"))
        cds.append(out.metrics.cd_nm)
    cds_clean = [float(v) for v in cds if v is not None]
    checks = [
        {"name": "all_cd_present", "ok": len(cds_clean) == len(serif_values), "actual": cds},
        {"name": "cd_non_decreasing", "ok": len(cds_clean) == len(serif_values) and non_decreasing(cds_clean), "actual": cds},
        {"name": "serif_gain", "ok": len(cds_clean) == len(serif_values) and cds_clean[-1] > cds_clean[0], "actual": cds},
    ]
    return checks, {"serif_nm": serif_values, "cds": cds}


def case_staircase_dose_monotonic_duv_dry() -> tuple[list[dict[str, object]], dict[str, object]]:
    base = build_base_request(
        preset_id="DUV_193_DRY",
        template_id="STAIRCASE",
        params_nm={"fov_nm": 1100, "step_w_nm": 40, "step_h_nm": 40, "n_steps": 12, "thickness_nm": 100, "sraf_on": 0},
        dose=0.3,
    )
    out = simulate_batch(
        BatchSimRequest(base=base, param="dose", start=0.3, stop=0.6, step=0.1, include_contours=False),
        make_request("/simulate/batch"),
    )
    cds = [p.metrics.cd_nm for p in out.points]
    cds_clean = [float(v) for v in cds if v is not None]
    checks = [
        {"name": "all_cd_present", "ok": len(cds_clean) == 4, "actual": cds},
        {"name": "cd_non_increasing", "ok": len(cds_clean) == 4 and non_increasing(cds_clean), "actual": cds},
        {"name": "point_count", "ok": out.count == 4, "actual": out.count},
    ]
    return checks, {"cds": cds}


def case_guard_nonprint_small_iso_duv_dry() -> tuple[list[dict[str, object]], dict[str, object]]:
    small = build_base_request(
        preset_id="DUV_193_DRY",
        template_id="ISO_LINE",
        params_nm={"fov_nm": 1100, "cd_nm": 50, "length_nm": 900, "sraf_on": 0},
        dose=0.3,
    )
    ref = build_base_request(
        preset_id="DUV_193_DRY",
        template_id="ISO_LINE",
        params_nm={"fov_nm": 1100, "cd_nm": 60, "length_nm": 900, "sraf_on": 0},
        dose=0.3,
    )
    small_out = simulate(small, make_request("/simulate"))
    ref_out = simulate(ref, make_request("/simulate"))
    checks = [
        {"name": "small_is_non_print", "ok": small_out.metrics.cd_nm is None and len(small_out.contours_nm) == 0, "actual": small_out.metrics.cd_nm},
        {"name": "reference_prints", "ok": ref_out.metrics.cd_nm is not None and len(ref_out.contours_nm) > 0, "actual": ref_out.metrics.cd_nm},
    ]
    return checks, {"small_cd": small_out.metrics.cd_nm, "reference_cd": ref_out.metrics.cd_nm}


def case_euv_contact_dose_stability() -> tuple[list[dict[str, object]], dict[str, object]]:
    base = build_base_request(
        preset_id="EUV_LNA",
        template_id="CONTACT_RAW",
        params_nm={"fov_nm": 1100, "w_nm": 120, "cd_nm": 120, "sraf_on": 0},
        dose=0.3,
    )
    out = simulate_batch(
        BatchSimRequest(base=base, param="dose", start=0.3, stop=0.6, step=0.1, include_contours=False),
        make_request("/simulate/batch"),
    )
    cds = [p.metrics.cd_nm for p in out.points]
    cds_clean = [float(v) for v in cds if v is not None]
    checks = [
        {"name": "all_cd_present", "ok": len(cds_clean) == 4, "actual": cds},
        {"name": "cd_non_increasing", "ok": len(cds_clean) == 4 and non_increasing(cds_clean), "actual": cds},
        {"name": "point_count", "ok": out.count == 4, "actual": out.count},
    ]
    return checks, {"cds": cds}


def case_batch_contract_count() -> tuple[list[dict[str, object]], dict[str, object]]:
    base = build_base_request(
        preset_id="DUV_193_IMM",
        template_id="ISO_LINE",
        params_nm={"fov_nm": 1100, "cd_nm": 80, "length_nm": 900, "sraf_on": 0},
        dose=0.3,
    )
    out = simulate_batch(
        BatchSimRequest(base=base, param="dose", start=0.3, stop=0.7, step=0.1, include_contours=False),
        make_request("/simulate/batch"),
    )
    checks = [
        {"name": "count_is_expected", "ok": out.count == 5, "actual": out.count},
        {"name": "points_len_matches_count", "ok": len(out.points) == out.count, "actual": len(out.points)},
        {"name": "all_metrics_present", "ok": all(p.metrics is not None for p in out.points), "actual": len(out.points)},
    ]
    return checks, {"count": out.count}


def case_batch_contour_decimation() -> tuple[list[dict[str, object]], dict[str, object]]:
    base = build_base_request(
        preset_id="DUV_193_IMM",
        template_id="ISO_LINE",
        params_nm={"fov_nm": 1100, "cd_nm": 80, "length_nm": 900, "sraf_on": 0},
        dose=0.3,
    )
    out = simulate_batch(
        BatchSimRequest(
            base=base,
            param="dose",
            start=0.3,
            stop=0.7,
            step=0.1,
            include_contours=True,
            max_points_per_contour=120,
        ),
        make_request("/simulate/batch"),
    )
    contour_sizes = [
        len(poly.points_nm)
        for point in out.points
        for poly in (point.contours_nm or [])
    ]
    checks = [
        {"name": "contours_payload_present", "ok": all(point.contours_nm is not None for point in out.points), "actual": len(out.points)},
        {"name": "contour_size_capped", "ok": all(size <= 120 for size in contour_sizes), "actual": max(contour_sizes) if contour_sizes else 0},
        {"name": "at_least_one_contour", "ok": len(contour_sizes) > 0, "actual": len(contour_sizes)},
    ]
    return checks, {"max_contour_points": max(contour_sizes) if contour_sizes else 0}


def case_dense_ls_euv_presence() -> tuple[list[dict[str, object]], dict[str, object]]:
    req = build_base_request(
        preset_id="EUV_LNA",
        template_id="DENSE_LS",
        params_nm={"fov_nm": 1100, "cd_nm": 80, "length_nm": 900, "pitch_nm": 200, "n_lines": 7, "sraf_on": 0},
        dose=0.4,
    )
    out = simulate(req, make_request("/simulate"))
    cd = out.metrics.cd_nm
    checks = [
        {"name": "contour_non_empty", "ok": len(out.contours_nm) > 0, "actual": len(out.contours_nm)},
        {"name": "cd_present", "ok": cd is not None, "actual": cd},
        {"name": "cd_in_expected_band", "ok": cd is not None and 60.0 <= float(cd) <= 90.0, "actual": cd},
    ]
    return checks, {"cd_nm": cd, "contours": len(out.contours_nm)}


CASE_FUNCS: dict[str, Callable[[], tuple[list[dict[str, object]], dict[str, object]]]] = {
    "bk-iso-dose-monotonic-duv-imm": case_iso_dose_monotonic_duv_imm,
    "bk-iso-dose-extinction-duv-dry": case_iso_dose_extinction_duv_dry,
    "bk-contact-width-monotonic-duv-dry": case_contact_width_monotonic_duv_dry,
    "bk-contact-serif-monotonic-duv-dry": case_contact_serif_monotonic_duv_dry,
    "bk-staircase-dose-monotonic-duv-dry": case_staircase_dose_monotonic_duv_dry,
    "bk-guard-nonprint-small-iso-duv-dry": case_guard_nonprint_small_iso_duv_dry,
    "bk-euv-contact-dose-stability": case_euv_contact_dose_stability,
    "bk-batch-contract-count": case_batch_contract_count,
    "bk-batch-contour-decimation": case_batch_contour_decimation,
    "bk-dense-ls-euv-presence": case_dense_ls_euv_presence,
}


def run_case(case_id: str, title: str, fn: Callable[[], tuple[list[dict[str, object]], dict[str, object]]]) -> dict[str, object]:
    started = time.perf_counter()
    try:
        checks, detail = fn()
        checks_total = len(checks)
        checks_passed = sum(1 for check in checks if bool(check.get("ok")))
        status = "passed" if checks_passed == checks_total else "failed"
        error = None
    except Exception as exc:
        checks = []
        detail = {}
        checks_total = 0
        checks_passed = 0
        status = "failed"
        error = str(exc)
    duration_ms = int((time.perf_counter() - started) * 1000)
    return {
        "case_id": case_id,
        "title": title,
        "status": status,
        "checks_passed": checks_passed,
        "checks_total": checks_total,
        "duration_ms": duration_ms,
        "error": error,
        "detail": detail,
        "checks": checks,
    }


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


def load_history_rows() -> list[dict[str, object]]:
    if not HISTORY_FILE.exists():
        return []
    try:
        payload = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    rows = payload.get("runs") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        return []
    return [row for row in rows if isinstance(row, dict)]


def main() -> int:
    suite_version, case_meta = load_suite_meta()
    now = datetime.now(timezone.utc)
    run_id = f"bench-{now.strftime('%Y%m%dT%H%M%SZ')}"
    model_version = opclab_app.version or MODEL_VERSION
    results: list[dict[str, object]] = []

    for case_id, fn in CASE_FUNCS.items():
        title = case_meta.get(case_id, {}).get("title", case_id)
        results.append(run_case(case_id, title, fn))

    cases_total = len(results)
    cases_passed = sum(1 for row in results if row["status"] == "passed")
    pass_rate = round(cases_passed / cases_total, 4) if cases_total else 0.0
    timestamp = now.strftime("%Y%m%dT%H%M%SZ")
    artifact_file = f"benchmark-run-{timestamp}.json"

    run_payload = {
        "run_id": run_id,
        "generated_at_utc": now.isoformat(),
        "model_version": model_version,
        "suite_version": suite_version,
        "cases_total": cases_total,
        "cases_passed": cases_passed,
        "pass_rate": pass_rate,
        "artifact_file": artifact_file,
        "cases": [
            {
                "case_id": row["case_id"],
                "title": row["title"],
                "status": row["status"],
                "checks_passed": row["checks_passed"],
                "checks_total": row["checks_total"],
                "duration_ms": row["duration_ms"],
                "error": row["error"],
            }
            for row in results
        ],
        "details": results,
    }

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    write_json(ARTIFACT_DIR / artifact_file, run_payload)
    write_json(LATEST_FILE, run_payload)

    history_rows = load_history_rows()
    history_rows.append(
        {
            "run_id": run_id,
            "generated_at_utc": now.isoformat(),
            "model_version": model_version,
            "cases_total": cases_total,
            "cases_passed": cases_passed,
            "pass_rate": pass_rate,
        }
    )
    history_rows = history_rows[-365:]
    write_json(HISTORY_FILE, {"runs": history_rows})

    print(f"[benchmark] run_id={run_id} model_version={model_version}")
    print(f"[benchmark] pass_rate={pass_rate:.4f} ({cases_passed}/{cases_total})")
    for row in results:
        if row["status"] != "passed":
            print(f"[failed] {row['case_id']}: {row.get('error') or row.get('checks')}")

    return 0 if cases_passed == cases_total else 1


if __name__ == "__main__":
    raise SystemExit(main())
