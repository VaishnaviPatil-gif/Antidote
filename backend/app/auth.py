"""Hospital-staff authentication for the web dashboard.

Deliberately dependency-free: HMAC-signed opaque tokens (stdlib only), so the
demo needs no JWT library and no database. Each hospital has a login that maps
to a facility id in the stock registry, so a logged-in hospital sees/updates
its own inventory.

Production would move accounts to a DB with per-user password hashes and rotate
AUTH_SECRET; the token format here (signed {sub, hid, exp}) is JWT-shaped enough
to swap for real JWTs later.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import threading
import time
from pathlib import Path

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings

# Token lifetime (seconds). 12h is plenty for a shift / a demo.
_TTL = 12 * 60 * 60


# ── Demo accounts ────────────────────────────────────────────────────────────
# username -> {password, hospital_id (None = admin/all), name}. Passwords are
# demo-plain on purpose so judges can log in live; swap for hashes in prod.
_ACCOUNTS_PATH = Path(__file__).resolve().parent / "data" / "accounts_store.json"
_accounts_lock = threading.Lock()
_accounts_cache: dict[str, dict] | None = None

DEFAULT_ACCOUNTS = {
    "mrn":       {"password": "mrn123",     "hospital_id": "mrn",       "name": "Malla Reddy Narayana"},
    "gandhi":    {"password": "gandhi123",  "hospital_id": "gandhi",    "name": "Gandhi Hospital"},
    "slg":       {"password": "slg123",     "hospital_id": "slg",       "name": "SLG Hospitals"},
    "reach":     {"password": "reach123",   "hospital_id": "reach",     "name": "Reach Super Speciality"},
    "arundathi": {"password": "arun123",    "hospital_id": "arundathi", "name": "Arundathi Hospital"},
    "basti":     {"password": "basti123",   "hospital_id": "basti",     "name": "Basti Dawakhana"},
    # District health officer — sees every facility.
    "admin":     {"password": "admin123",   "hospital_id": None,        "name": "District Health Office"},
}

def load_accounts() -> dict[str, dict]:
    global _accounts_cache
    if _accounts_cache is not None:
        return _accounts_cache
    try:
        if _ACCOUNTS_PATH.exists():
            data = json.loads(_ACCOUNTS_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict) and data:
                _accounts_cache = data
                return _accounts_cache
    except Exception as exc:
        pass
    _accounts_cache = dict(DEFAULT_ACCOUNTS)
    save_accounts()
    return _accounts_cache

def save_accounts() -> None:
    if _accounts_cache is None:
        return
    try:
        _ACCOUNTS_PATH.parent.mkdir(parents=True, exist_ok=True)
        _ACCOUNTS_PATH.write_text(json.dumps(_accounts_cache, indent=2), encoding="utf-8")
    except Exception as exc:
        pass

def add_account(username: str, data: dict) -> None:
    with _accounts_lock:
        accounts = load_accounts()
        accounts[username.strip().lower()] = data
        save_accounts()

class AccountsProxy(dict):
    def __getitem__(self, key):
        return load_accounts()[key]
    def __setitem__(self, key, value):
        add_account(key, value)
    def __contains__(self, key):
        return key in load_accounts()
    def get(self, key, default=None):
        return load_accounts().get(key, default)
    def keys(self):
        return load_accounts().keys()
    def values(self):
        return load_accounts().values()
    def items(self):
        return load_accounts().items()
    def __len__(self):
        return len(load_accounts())

ACCOUNTS = AccountsProxy()


def _secret() -> bytes:
    """Signing key. Falls back to a fixed dev secret so tokens survive restarts;
    override with AUTH_SECRET in prod (see config)."""
    return (getattr(settings, "auth_secret", None) or "antidote-dev-secret").encode()


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def create_token(username: str) -> str:
    """Sign a token for `username` (assumed already authenticated)."""
    acct = ACCOUNTS[username]
    payload = {"sub": username, "hid": acct["hospital_id"], "exp": int(time.time()) + _TTL}
    body = _b64e(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64e(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def verify_token(token: str) -> dict:
    """Return the payload for a valid, unexpired token, else raise 401."""
    try:
        body, sig = token.split(".", 1)
        expected = _b64e(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            raise ValueError("bad signature")
        payload = json.loads(_b64d(body))
        if int(payload.get("exp", 0)) < int(time.time()):
            raise ValueError("expired")
        return payload
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired session ({exc})",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def authenticate(username: str, password: str) -> str | None:
    """Return a token if credentials are valid, else None."""
    acct = ACCOUNTS.get((username or "").strip().lower())
    if acct and hmac.compare_digest(acct["password"], password or ""):
        return create_token((username or "").strip().lower())
    return None


_bearer = HTTPBearer(auto_error=True)


def current_hospital(creds: HTTPAuthorizationCredentials = Depends(_bearer)) -> dict:
    """FastAPI dependency: resolve the logged-in hospital from the Bearer token.

    Returns {username, hospital_id (None=admin), name}."""
    payload = verify_token(creds.credentials)
    username = payload.get("sub")
    acct = ACCOUNTS.get(username)
    if not acct:
        raise HTTPException(status_code=401, detail="Unknown account")
    return {"username": username, "hospital_id": acct["hospital_id"], "name": acct["name"]}
