"""Incoming-patient case store.

When the victim app taps "Confirm & alert hospital", it POSTs a case here; the
hospital dashboard reads it back (scoped to the logged-in facility).

The store is held in memory and mirrored to a JSON file (mirroring the hospital
registry in hospitals.py) so a backend restart mid-demo doesn't wipe the board —
a real risk when the free-tier server recycles or is restarted between rounds.
Newest first, deduped by id, capped so the list stays readable.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path

logger = logging.getLogger("antidote.cases")

# Persist next to the app package, alongside the hospital store.
_STORE_PATH = Path(__file__).resolve().parent.parent / "data" / "cases_store.json"

_lock = threading.Lock()
_cases: list[dict] | None = None
_MAX = 25

# Empty by default so the dashboard starts fresh for live emergency testing.
_SEED = []


def _persist() -> None:
    """Best-effort write of the in-memory list to disk (never raises)."""
    if _cases is None:
        return
    try:
        _STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _STORE_PATH.write_text(json.dumps(_cases, indent=2), encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        logger.warning("could not persist case store: %s", exc)


def _load() -> list[dict]:
    """Load from disk, falling back to (and persisting) the seed examples."""
    global _cases
    if _cases is not None:
        return _cases
    try:
        if _STORE_PATH.exists():
            data = json.loads(_STORE_PATH.read_text(encoding="utf-8"))
            if isinstance(data, list):
                _cases = [dict(c) for c in data if isinstance(c, dict)]
                return _cases
    except Exception as exc:  # noqa: BLE001 — corrupt / unreadable → reseed
        logger.warning("case store unreadable, reseeding: %s", exc)
    _cases = [dict(c) for c in _SEED]
    _persist()
    return _cases


def list_cases(hospital_id: str | None) -> list[dict]:
    """All cases (admin or hospital staff) — allows any logged-in control dashboard to see live alerts."""
    with _lock:
        cases = _load()
        return [dict(c) for c in cases]


def get_case(case_id: str) -> dict | None:
    """Return a single case by id, or None if not found."""
    with _lock:
        cases = _load()
        for c in cases:
            if c.get("id") == case_id:
                return dict(c)
    return None


def add_case(data: dict) -> dict:
    """Add (or replace, by id) a case from the victim app's hospital alert."""
    with _lock:
        cases = _load()
        cid = data.get("id") or f"ANT-{int(time.time()) % 100000:05d}"
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime())
        rec = {
            **data,
            "id": cid,
            "live": True,
            "created_at": now_iso,
            "updates": data.get("updates", []),
            "preparation": data.get("preparation", {}),
            "timeline": data.get("timeline", [
                {"event": "Bite Reported", "ts": now_iso, "source": "victim"},
                {"event": "Hospital Alerted", "ts": now_iso, "source": "system"},
            ]),
            "last_location": data.get("last_location"),
        }
        # Replace any existing case with the same id, then push to the front.
        cases[:] = [c for c in cases if c.get("id") != cid]
        cases.insert(0, rec)
        del cases[_MAX:]
        _persist()
        return dict(rec)


def update_case_field(case_id: str, field: str, value) -> dict | None:
    """Update a single top-level field on a case."""
    with _lock:
        cases = _load()
        for c in cases:
            if c.get("id") == case_id:
                c[field] = value
                _persist()
                return dict(c)
    return None


def add_case_update(case_id: str, update_data: dict) -> bool:
    """Append an update record to the case's update log and timeline."""
    with _lock:
        cases = _load()
        for c in cases:
            if c.get("id") == case_id:
                if "updates" not in c:
                    c["updates"] = []
                c["updates"].append(update_data)
                # Also add to timeline
                if "timeline" not in c:
                    c["timeline"] = []
                event_text = update_data.get("message") or f"{update_data.get('field', 'update')}: {update_data.get('value', '')}"
                c["timeline"].append({
                    "event": event_text,
                    "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime()),
                    "source": update_data.get("from", "system"),
                })
                _persist()
                return True
    return False


def update_case_preparation(case_id: str, field: str, value, ts: float) -> bool:
    """Update a specific preparation field on a case."""
    with _lock:
        cases = _load()
        for c in cases:
            if c.get("id") == case_id:
                if "preparation" not in c:
                    c["preparation"] = {}
                c["preparation"][field] = {"value": value, "ts": ts}
                _persist()
                return True
    return False


def update_case_location(case_id: str, lat: float, lng: float, ts: float) -> bool:
    """Update the latest GPS location for a case."""
    with _lock:
        cases = _load()
        for c in cases:
            if c.get("id") == case_id:
                c["last_location"] = {"lat": lat, "lng": lng, "ts": ts}
                _persist()
                return True
    return False
