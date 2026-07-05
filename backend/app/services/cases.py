"""Incoming-patient case store.

When the victim app taps "Confirm & alert hospital", it POSTs a case here; the
hospital dashboard reads it back (scoped to the logged-in facility). In-memory
for the demo — a restart resets to the seeded examples. Newest first, deduped by
id, capped so the list stays readable.
"""

from __future__ import annotations

import threading
import time

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


def _load() -> list[dict]:
    global _cases
    if _cases is None:
        _cases = [dict(c) for c in _SEED]
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
        return dict(rec)
