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

# Seed examples so the dashboard isn't empty before the first live alert.
_SEED = [
    {
        "id": "P-882-901", "severity": "severe", "species": "Indian Cobra",
        "confidence": 0.95, "gps": "17.523, 78.462", "eta_min": 12,
        "assigned_hospital_id": "gandhi", "assigned_hospital": "Gandhi Hospital, Secunderabad",
        "mins_since_bite": 25, "status": "enroute", "live": False,
    },
    {
        "id": "P-491-008", "severity": "mild", "species": "Common Sand Boa",
        "confidence": 0.78, "gps": "17.528, 78.363", "eta_min": 15,
        "assigned_hospital_id": "slg", "assigned_hospital": "SLG Hospitals, Bachupally",
        "mins_since_bite": 95, "status": "arrived", "live": False,
    },
]


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
    """All cases (admin) or only those routed to `hospital_id`."""
    with _lock:
        cases = _load()
        if hospital_id is None:
            return [dict(c) for c in cases]
        return [dict(c) for c in cases if c.get("assigned_hospital_id") == hospital_id]


def add_case(data: dict) -> dict:
    """Add (or replace, by id) a case from the victim app's hospital alert."""
    with _lock:
        cases = _load()
        cid = data.get("id") or f"P-{int(time.time()) % 100000:05d}"
        rec = {**data, "id": cid, "live": True}
        # Replace any existing case with the same id, then push to the front.
        cases[:] = [c for c in cases if c.get("id") != cid]
        cases.insert(0, rec)
        del cases[_MAX:]
        _persist()
        return dict(rec)
