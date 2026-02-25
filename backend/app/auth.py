from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
from dataclasses import dataclass

from fastapi import HTTPException, Request

from .store import sanitize_user_id

_TOKEN_RE = re.compile(r"^Bearer\s+(.+)$", re.IGNORECASE)


@dataclass
class AuthIdentity:
    user_id: str
    email: str | None
    source: str
    authenticated: bool


def _b64url_decode(segment: str) -> bytes:
    pad = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + pad)


def _safe_json(raw: bytes) -> dict[str, object]:
    try:
        payload = json.loads(raw.decode("utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _decode_payload(token: str) -> dict[str, object]:
    parts = token.split(".")
    if len(parts) < 2:
        raise HTTPException(status_code=401, detail="Invalid bearer token format.")
    payload = _safe_json(_b64url_decode(parts[1]))
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid bearer token payload.")
    return payload


def _verify_hs256_if_configured(token: str) -> None:
    secret = os.getenv("AUTH_JWT_HS256_SECRET", "").strip()
    if not secret:
        return
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=401, detail="Invalid JWT format.")
    signing_input = f"{parts[0]}.{parts[1]}".encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    actual = _b64url_decode(parts[2])
    if not hmac.compare_digest(expected, actual):
        raise HTTPException(status_code=401, detail="JWT signature verification failed.")


def _extract_bearer_token(request: Request) -> str | None:
    raw = request.headers.get("authorization")
    if not raw:
        return None
    m = _TOKEN_RE.match(raw.strip())
    if not m:
        return None
    return m.group(1).strip()


def resolve_auth_identity(request: Request) -> AuthIdentity:
    auth_required = os.getenv("AUTH_REQUIRED", "0").strip() == "1"
    allow_header_user = os.getenv("AUTH_ALLOW_HEADER_USER", "1").strip() == "1"

    token = _extract_bearer_token(request)
    if token:
        _verify_hs256_if_configured(token)
        payload = _decode_payload(token)
        raw_sub = payload.get("sub")
        raw_email = payload.get("email")
        header_email = request.headers.get("x-opclab-email")
        subject = sanitize_user_id(str(raw_sub)) if raw_sub is not None else ""
        email = str(raw_email) if isinstance(raw_email, str) else (header_email.strip() if header_email else None)
        if subject:
            return AuthIdentity(
                user_id=f"auth:{subject}",
                email=email,
                source="bearer_jwt",
                authenticated=True,
            )
        raise HTTPException(status_code=401, detail="Bearer token missing subject.")

    if allow_header_user:
        header_user = sanitize_user_id(request.headers.get("x-opclab-user-id"))
        header_email = request.headers.get("x-opclab-email")
        if header_user:
            return AuthIdentity(
                user_id=f"hdr:{header_user}",
                email=header_email.strip() if header_email else None,
                source="header_user",
                authenticated=False,
            )

    client_id = sanitize_user_id(request.headers.get("x-opclab-client-id"))
    if client_id:
        return AuthIdentity(
            user_id=f"cid:{client_id}",
            email=None,
            source="client_id",
            authenticated=False,
        )

    if auth_required:
        raise HTTPException(status_code=401, detail="Authentication required.")

    return AuthIdentity(user_id="anon:unknown", email=None, source="anonymous", authenticated=False)
