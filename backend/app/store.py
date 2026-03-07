from __future__ import annotations

import json
import os
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from typing import Literal, TypedDict

from .models import Plan, ProductEventName, UsageOp

_DB_PATH = Path(
    os.getenv("LITOPC_DB_PATH")
    or os.getenv("OPCLAB_DB_PATH")
    or str(Path(__file__).resolve().parent.parent / "litopc.db")
)
_INIT_LOCK = Lock()
_INITIALIZED = False
_USER_ID_RE = re.compile(r"[^a-zA-Z0-9_.:@\-]")


class EntitlementRecord(TypedDict):
    user_id: str
    plan: Plan
    source: str
    pro_expires_at_utc: str | None
    updated_at_utc: str


class UsageBucket(TypedDict):
    runs: int
    sweep_points: int
    exports: int


class PolicyAuditRow(TypedDict):
    ts_utc: str
    endpoint: str
    method: str
    client_id: str
    plan: str | None
    decision: str
    reason: str | None
    meta: dict[str, str]


class ProductEventRow(TypedDict):
    name: str
    day_utc: str
    event_ts_utc: str
    ingested_ts_utc: str
    client_id: str
    payload: dict[str, object]


class InviteRecord(TypedDict):
    email: str
    role: str
    plan_default: Plan
    expires_at_utc: str | None
    used_at_utc: str | None
    updated_at_utc: str


class BillingSubscriptionRecord(TypedDict):
    user_id: str
    stripe_customer_id: str | None
    stripe_subscription_id: str | None
    status: str | None
    current_period_end_utc: str | None
    updated_at_utc: str


class BillingCustomerRecord(TypedDict):
    user_id: str
    stripe_customer_id: str
    email: str | None
    updated_at_utc: str


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso(raw: str | None) -> datetime | None:
    if not raw:
        return None
    normalized = raw.strip()
    if not normalized:
        return None
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def sanitize_user_id(raw: str | None) -> str:
    if not raw:
        return ""
    cleaned = _USER_ID_RE.sub("", raw.strip())
    return cleaned[:120]


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_db() -> None:
    global _INITIALIZED
    if _INITIALIZED:
        return
    with _INIT_LOCK:
        if _INITIALIZED:
            return
        _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        conn = _connect()
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS user_entitlements (
                    user_id TEXT PRIMARY KEY,
                    plan TEXT NOT NULL CHECK(plan IN ('FREE','PRO')),
                    source TEXT NOT NULL,
                    pro_expires_at_utc TEXT,
                    updated_at_utc TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_user_entitlements_plan
                ON user_entitlements(plan)
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS usage_daily (
                    user_id TEXT NOT NULL,
                    day_utc TEXT NOT NULL,
                    runs INTEGER NOT NULL DEFAULT 0,
                    sweep_points INTEGER NOT NULL DEFAULT 0,
                    exports INTEGER NOT NULL DEFAULT 0,
                    updated_at_utc TEXT NOT NULL,
                    PRIMARY KEY (user_id, day_utc)
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_usage_daily_day
                ON usage_daily(day_utc)
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS policy_audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts_utc TEXT NOT NULL,
                    endpoint TEXT NOT NULL,
                    method TEXT NOT NULL,
                    client_id TEXT NOT NULL,
                    plan TEXT,
                    decision TEXT NOT NULL,
                    reason TEXT,
                    meta_json TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_policy_audit_ts
                ON policy_audit_log(ts_utc DESC)
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS product_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    day_utc TEXT NOT NULL,
                    event_ts_utc TEXT NOT NULL,
                    ingested_ts_utc TEXT NOT NULL,
                    client_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_product_events_day
                ON product_events(day_utc)
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS invite_allowlist (
                    email TEXT PRIMARY KEY,
                    role TEXT NOT NULL,
                    plan_default TEXT NOT NULL CHECK(plan_default IN ('FREE','PRO')),
                    expires_at_utc TEXT,
                    used_at_utc TEXT,
                    updated_at_utc TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_invite_allowlist_expiry
                ON invite_allowlist(expires_at_utc)
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS billing_customers (
                    user_id TEXT PRIMARY KEY,
                    stripe_customer_id TEXT NOT NULL UNIQUE,
                    email TEXT,
                    updated_at_utc TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS billing_subscriptions (
                    stripe_subscription_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    stripe_customer_id TEXT,
                    status TEXT,
                    current_period_end_utc TEXT,
                    updated_at_utc TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_user
                ON billing_subscriptions(user_id)
                """
            )
            conn.commit()
        finally:
            conn.close()
        _INITIALIZED = True


def _row_to_record(row: sqlite3.Row) -> EntitlementRecord:
    return EntitlementRecord(
        user_id=str(row["user_id"]),
        plan=str(row["plan"]),  # type: ignore[typeddict-item]
        source=str(row["source"]),
        pro_expires_at_utc=row["pro_expires_at_utc"],
        updated_at_utc=str(row["updated_at_utc"]),
    )


def _auto_downgrade_if_expired(record: EntitlementRecord) -> EntitlementRecord:
    if record["plan"] != "PRO":
        return record
    expires = _parse_iso(record["pro_expires_at_utc"])
    if expires is None:
        return record
    if expires > datetime.now(timezone.utc):
        return record
    updated = set_user_entitlement(
        user_id=record["user_id"],
        plan="FREE",
        source="auto_expired",
        pro_expires_at_utc=None,
    )
    return updated


def get_user_entitlement(user_id: str) -> EntitlementRecord | None:
    ensure_db()
    uid = sanitize_user_id(user_id)
    if not uid:
        return None
    conn = _connect()
    try:
        row = conn.execute(
            """
            SELECT user_id, plan, source, pro_expires_at_utc, updated_at_utc
            FROM user_entitlements
            WHERE user_id = ?
            """,
            (uid,),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    record = _row_to_record(row)
    return _auto_downgrade_if_expired(record)


def set_user_entitlement(
    user_id: str,
    plan: Plan,
    source: str = "admin_manual",
    pro_expires_at_utc: str | None = None,
) -> EntitlementRecord:
    ensure_db()
    uid = sanitize_user_id(user_id)
    if not uid:
        raise ValueError("user_id is required")
    now = _now_iso()
    src = source.strip()[:64] if source else "admin_manual"
    expires = None
    if plan == "PRO":
        expires = pro_expires_at_utc
    conn = _connect()
    try:
        conn.execute(
            """
            INSERT INTO user_entitlements (user_id, plan, source, pro_expires_at_utc, updated_at_utc)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                plan = excluded.plan,
                source = excluded.source,
                pro_expires_at_utc = excluded.pro_expires_at_utc,
                updated_at_utc = excluded.updated_at_utc
            """,
            (uid, plan, src, expires, now),
        )
        conn.commit()
    finally:
        conn.close()
    return EntitlementRecord(
        user_id=uid,
        plan=plan,
        source=src,
        pro_expires_at_utc=expires,
        updated_at_utc=now,
    )


def grant_pro_days(user_id: str, days: int, source: str = "admin_manual") -> EntitlementRecord:
    days = max(1, min(days, 3650))
    expires = datetime.now(timezone.utc) + timedelta(days=days)
    return set_user_entitlement(
        user_id=user_id,
        plan="PRO",
        source=source,
        pro_expires_at_utc=expires.isoformat(),
    )


def _empty_usage_bucket() -> UsageBucket:
    return UsageBucket(runs=0, sweep_points=0, exports=0)


def _usage_column(op: UsageOp) -> Literal["runs", "sweep_points", "exports"]:
    if op == "runs":
        return "runs"
    if op == "sweep_points":
        return "sweep_points"
    return "exports"


def get_usage_bucket(user_id: str, day_utc: str) -> UsageBucket:
    ensure_db()
    uid = sanitize_user_id(user_id)
    if not uid:
        return _empty_usage_bucket()
    conn = _connect()
    try:
        row = conn.execute(
            """
            SELECT runs, sweep_points, exports
            FROM usage_daily
            WHERE user_id = ? AND day_utc = ?
            """,
            (uid, day_utc),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return _empty_usage_bucket()
    return UsageBucket(
        runs=int(row["runs"] or 0),
        sweep_points=int(row["sweep_points"] or 0),
        exports=int(row["exports"] or 0),
    )


def consume_usage_quota(
    user_id: str,
    day_utc: str,
    op: UsageOp,
    amount: int,
    limit: int,
    clamp: bool,
) -> tuple[bool, int, UsageBucket]:
    ensure_db()
    uid = sanitize_user_id(user_id)
    if not uid:
        return False, 0, _empty_usage_bucket()
    amt = max(0, int(amount))
    if amt <= 0:
        return False, 0, get_usage_bucket(uid, day_utc)

    col = _usage_column(op)
    now = _now_iso()
    conn = _connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            """
            SELECT runs, sweep_points, exports
            FROM usage_daily
            WHERE user_id = ? AND day_utc = ?
            """,
            (uid, day_utc),
        ).fetchone()
        if row is None:
            conn.execute(
                """
                INSERT INTO usage_daily (user_id, day_utc, runs, sweep_points, exports, updated_at_utc)
                VALUES (?, ?, 0, 0, 0, ?)
                """,
                (uid, day_utc, now),
            )
            used = 0
        else:
            used = int(row[col] or 0)

        available = max(0, int(limit) - used)
        granted = amt if amt <= available else (available if clamp else 0)
        allowed = granted > 0

        if granted > 0:
            conn.execute(
                f"""
                UPDATE usage_daily
                SET {col} = {col} + ?, updated_at_utc = ?
                WHERE user_id = ? AND day_utc = ?
                """,
                (granted, now, uid, day_utc),
            )
        else:
            conn.execute(
                """
                UPDATE usage_daily
                SET updated_at_utc = ?
                WHERE user_id = ? AND day_utc = ?
                """,
                (now, uid, day_utc),
            )
        conn.commit()
    finally:
        conn.close()
    return allowed, granted, get_usage_bucket(uid, day_utc)


def insert_policy_audit(row: PolicyAuditRow, max_rows: int) -> None:
    ensure_db()
    cap = max(1, int(max_rows))
    conn = _connect()
    try:
        conn.execute(
            """
            INSERT INTO policy_audit_log
            (ts_utc, endpoint, method, client_id, plan, decision, reason, meta_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["ts_utc"],
                row["endpoint"],
                row["method"],
                row["client_id"],
                row["plan"],
                row["decision"],
                row["reason"],
                json.dumps(row["meta"], ensure_ascii=True),
            ),
        )
        conn.execute(
            """
            DELETE FROM policy_audit_log
            WHERE id NOT IN (
                SELECT id
                FROM policy_audit_log
                ORDER BY id DESC
                LIMIT ?
            )
            """,
            (cap,),
        )
        conn.commit()
    finally:
        conn.close()


def list_policy_audit(limit: int) -> list[PolicyAuditRow]:
    ensure_db()
    capped = max(1, min(int(limit), 1000))
    conn = _connect()
    try:
        rows = conn.execute(
            """
            SELECT ts_utc, endpoint, method, client_id, plan, decision, reason, meta_json
            FROM policy_audit_log
            ORDER BY id DESC
            LIMIT ?
            """,
            (capped,),
        ).fetchall()
    finally:
        conn.close()

    out: list[PolicyAuditRow] = []
    for row in rows:
        try:
            meta = json.loads(row["meta_json"]) if row["meta_json"] else {}
        except Exception:
            meta = {}
        out.append(
            PolicyAuditRow(
                ts_utc=str(row["ts_utc"]),
                endpoint=str(row["endpoint"]),
                method=str(row["method"]),
                client_id=str(row["client_id"]),
                plan=row["plan"],
                decision=str(row["decision"]),
                reason=row["reason"],
                meta=meta if isinstance(meta, dict) else {},
            )
        )
    return out


def ingest_product_events(rows: list[ProductEventRow], max_rows: int) -> tuple[int, int]:
    ensure_db()
    if not rows:
        return 0, 0
    cap = max(1, int(max_rows))
    accepted = 0
    conn = _connect()
    try:
        for row in rows:
            conn.execute(
                """
                INSERT INTO product_events
                (name, day_utc, event_ts_utc, ingested_ts_utc, client_id, payload_json)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    row["name"],
                    row["day_utc"],
                    row["event_ts_utc"],
                    row["ingested_ts_utc"],
                    row["client_id"],
                    json.dumps(row["payload"], ensure_ascii=True),
                ),
            )
            accepted += 1
        count_row = conn.execute("SELECT COUNT(1) AS c FROM product_events").fetchone()
        total = int(count_row["c"] or 0) if count_row is not None else 0
        dropped = max(0, total - cap)
        if dropped > 0:
            conn.execute(
                """
                DELETE FROM product_events
                WHERE id IN (
                    SELECT id
                    FROM product_events
                    ORDER BY id ASC
                    LIMIT ?
                )
                """,
                (dropped,),
            )
        conn.commit()
    finally:
        conn.close()
    return accepted, dropped


def list_product_events(day_from_utc: str, day_to_utc: str) -> list[ProductEventRow]:
    ensure_db()
    conn = _connect()
    try:
        rows = conn.execute(
            """
            SELECT name, day_utc, event_ts_utc, ingested_ts_utc, client_id, payload_json
            FROM product_events
            WHERE day_utc >= ? AND day_utc <= ?
            ORDER BY id ASC
            """,
            (day_from_utc, day_to_utc),
        ).fetchall()
    finally:
        conn.close()
    out: list[ProductEventRow] = []
    for row in rows:
        try:
            payload = json.loads(row["payload_json"]) if row["payload_json"] else {}
        except Exception:
            payload = {}
        out.append(
            ProductEventRow(
                name=str(row["name"]),
                day_utc=str(row["day_utc"]),
                event_ts_utc=str(row["event_ts_utc"]),
                ingested_ts_utc=str(row["ingested_ts_utc"]),
                client_id=str(row["client_id"]),
                payload=payload if isinstance(payload, dict) else {},
            )
        )
    return out


def normalize_email(raw: str | None) -> str:
    if not raw:
        return ""
    return raw.strip().lower()[:255]


def set_invite_allowlist(
    email: str,
    role: str,
    plan_default: Plan,
    expires_at_utc: str | None = None,
) -> InviteRecord:
    ensure_db()
    em = normalize_email(email)
    if not em:
        raise ValueError("email is required")
    now = _now_iso()
    rl = (role.strip() or "tester")[:32]
    conn = _connect()
    try:
        conn.execute(
            """
            INSERT INTO invite_allowlist (email, role, plan_default, expires_at_utc, used_at_utc, updated_at_utc)
            VALUES (?, ?, ?, ?, NULL, ?)
            ON CONFLICT(email) DO UPDATE SET
                role = excluded.role,
                plan_default = excluded.plan_default,
                expires_at_utc = excluded.expires_at_utc,
                updated_at_utc = excluded.updated_at_utc
            """,
            (em, rl, plan_default, expires_at_utc, now),
        )
        conn.commit()
    finally:
        conn.close()
    return InviteRecord(
        email=em,
        role=rl,
        plan_default=plan_default,
        expires_at_utc=expires_at_utc,
        used_at_utc=None,
        updated_at_utc=now,
    )


def list_invite_allowlist(limit: int = 200) -> list[InviteRecord]:
    ensure_db()
    capped = max(1, min(int(limit), 1000))
    conn = _connect()
    try:
        rows = conn.execute(
            """
            SELECT email, role, plan_default, expires_at_utc, used_at_utc, updated_at_utc
            FROM invite_allowlist
            ORDER BY updated_at_utc DESC
            LIMIT ?
            """,
            (capped,),
        ).fetchall()
    finally:
        conn.close()
    out: list[InviteRecord] = []
    for row in rows:
        out.append(
            InviteRecord(
                email=str(row["email"]),
                role=str(row["role"]),
                plan_default=str(row["plan_default"]),  # type: ignore[typeddict-item]
                expires_at_utc=row["expires_at_utc"],
                used_at_utc=row["used_at_utc"],
                updated_at_utc=str(row["updated_at_utc"]),
            )
        )
    return out


def get_invite_allowlist(email: str) -> InviteRecord | None:
    ensure_db()
    em = normalize_email(email)
    if not em:
        return None
    conn = _connect()
    try:
        row = conn.execute(
            """
            SELECT email, role, plan_default, expires_at_utc, used_at_utc, updated_at_utc
            FROM invite_allowlist
            WHERE email = ?
            """,
            (em,),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return InviteRecord(
        email=str(row["email"]),
        role=str(row["role"]),
        plan_default=str(row["plan_default"]),  # type: ignore[typeddict-item]
        expires_at_utc=row["expires_at_utc"],
        used_at_utc=row["used_at_utc"],
        updated_at_utc=str(row["updated_at_utc"]),
    )


def mark_invite_used(email: str) -> None:
    ensure_db()
    em = normalize_email(email)
    if not em:
        return
    now = _now_iso()
    conn = _connect()
    try:
        conn.execute(
            """
            UPDATE invite_allowlist
            SET used_at_utc = ?, updated_at_utc = ?
            WHERE email = ?
            """,
            (now, now, em),
        )
        conn.commit()
    finally:
        conn.close()


def is_invite_allowed(email: str, now_utc: datetime | None = None) -> bool:
    ensure_db()
    em = normalize_email(email)
    if not em:
        return False
    now = now_utc or datetime.now(timezone.utc)
    conn = _connect()
    try:
        row = conn.execute(
            """
            SELECT expires_at_utc
            FROM invite_allowlist
            WHERE email = ?
            """,
            (em,),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return False
    exp = _parse_iso(row["expires_at_utc"])
    if exp is None:
        return True
    return exp > now


def get_billing_customer_by_user(user_id: str) -> BillingCustomerRecord | None:
    ensure_db()
    uid = sanitize_user_id(user_id)
    if not uid:
        return None
    conn = _connect()
    try:
        row = conn.execute(
            """
            SELECT user_id, stripe_customer_id, email, updated_at_utc
            FROM billing_customers
            WHERE user_id = ?
            """,
            (uid,),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return BillingCustomerRecord(
        user_id=str(row["user_id"]),
        stripe_customer_id=str(row["stripe_customer_id"]),
        email=row["email"],
        updated_at_utc=str(row["updated_at_utc"]),
    )


def get_user_id_by_billing_customer(stripe_customer_id: str) -> str | None:
    ensure_db()
    sid = (stripe_customer_id or "").strip()
    if not sid:
        return None
    conn = _connect()
    try:
        row = conn.execute(
            """
            SELECT user_id
            FROM billing_customers
            WHERE stripe_customer_id = ?
            """,
            (sid,),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return str(row["user_id"])


def upsert_billing_customer(user_id: str, stripe_customer_id: str, email: str | None = None) -> BillingCustomerRecord:
    ensure_db()
    uid = sanitize_user_id(user_id)
    sid = (stripe_customer_id or "").strip()[:120]
    if not uid or not sid:
        raise ValueError("user_id and stripe_customer_id are required")
    now = _now_iso()
    em = normalize_email(email) if email else None
    conn = _connect()
    try:
        conn.execute(
            """
            INSERT INTO billing_customers (user_id, stripe_customer_id, email, updated_at_utc)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                stripe_customer_id = excluded.stripe_customer_id,
                email = excluded.email,
                updated_at_utc = excluded.updated_at_utc
            """,
            (uid, sid, em, now),
        )
        conn.commit()
    finally:
        conn.close()
    return BillingCustomerRecord(
        user_id=uid,
        stripe_customer_id=sid,
        email=em,
        updated_at_utc=now,
    )


def get_billing_subscription_by_user(user_id: str) -> BillingSubscriptionRecord | None:
    ensure_db()
    uid = sanitize_user_id(user_id)
    if not uid:
        return None
    conn = _connect()
    try:
        row = conn.execute(
            """
            SELECT user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end_utc, updated_at_utc
            FROM billing_subscriptions
            WHERE user_id = ?
            ORDER BY updated_at_utc DESC
            LIMIT 1
            """,
            (uid,),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return BillingSubscriptionRecord(
        user_id=str(row["user_id"]),
        stripe_customer_id=row["stripe_customer_id"],
        stripe_subscription_id=row["stripe_subscription_id"],
        status=row["status"],
        current_period_end_utc=row["current_period_end_utc"],
        updated_at_utc=str(row["updated_at_utc"]),
    )


def get_billing_subscription_by_id(stripe_subscription_id: str) -> BillingSubscriptionRecord | None:
    ensure_db()
    sid = (stripe_subscription_id or "").strip()
    if not sid:
        return None
    conn = _connect()
    try:
        row = conn.execute(
            """
            SELECT user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end_utc, updated_at_utc
            FROM billing_subscriptions
            WHERE stripe_subscription_id = ?
            """,
            (sid,),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return BillingSubscriptionRecord(
        user_id=str(row["user_id"]),
        stripe_customer_id=row["stripe_customer_id"],
        stripe_subscription_id=row["stripe_subscription_id"],
        status=row["status"],
        current_period_end_utc=row["current_period_end_utc"],
        updated_at_utc=str(row["updated_at_utc"]),
    )


def upsert_billing_subscription(
    user_id: str,
    stripe_subscription_id: str,
    stripe_customer_id: str | None = None,
    status: str | None = None,
    current_period_end_utc: str | None = None,
) -> BillingSubscriptionRecord:
    ensure_db()
    uid = sanitize_user_id(user_id)
    sub_id = (stripe_subscription_id or "").strip()[:120]
    if not uid or not sub_id:
        raise ValueError("user_id and stripe_subscription_id are required")
    customer_id = (stripe_customer_id or "").strip()[:120] or None
    st = (status or "").strip()[:40] or None
    now = _now_iso()
    conn = _connect()
    try:
        conn.execute(
            """
            INSERT INTO billing_subscriptions
            (stripe_subscription_id, user_id, stripe_customer_id, status, current_period_end_utc, updated_at_utc)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(stripe_subscription_id) DO UPDATE SET
                user_id = excluded.user_id,
                stripe_customer_id = excluded.stripe_customer_id,
                status = excluded.status,
                current_period_end_utc = excluded.current_period_end_utc,
                updated_at_utc = excluded.updated_at_utc
            """,
            (sub_id, uid, customer_id, st, current_period_end_utc, now),
        )
        conn.commit()
    finally:
        conn.close()
    return BillingSubscriptionRecord(
        user_id=uid,
        stripe_customer_id=customer_id,
        stripe_subscription_id=sub_id,
        status=st,
        current_period_end_utc=current_period_end_utc,
        updated_at_utc=now,
    )
