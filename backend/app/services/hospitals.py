"""Hospital antivenom-stock registry â€” the live inventory behind the routing.

Antidote+'s differentiator is routing a victim to the nearest facility that
ACTUALLY HAS anti-snake-venom (ASV) in stock. That only means something if the
stock number is *live* rather than hardcoded in the client. This module is the
authoritative store:

  - Seeded with the Vikarabad-district facilities the app ships with.
  - Held in memory and mirrored to a JSON file so an ASHA worker's stock update
    (POST /api/hospitals/{id}/stock) survives a server restart.
  - No external database â€” a single JSON file keeps the demo self-contained and
    the deployment trivial, while still being a real fetched-with-timestamp feed.

Every record carries an ISO `updated_at` so the client can render "stock updated
N min ago" from real wall-clock time and flag stale inventory for reconfirmation.
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

logger = logging.getLogger("antidote.hospitals")

# Persist next to the app package so it is writable in dev and in a container.
_STORE_PATH = Path(__file__).resolve().parent.parent / "data" / "hospitals_store.json"

_lock = threading.Lock()
_store: dict[str, dict] | None = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ago(minutes: int) -> str:
    """ISO timestamp `minutes` in the past â€” used to seed realistic update ages."""
    return (_now() - timedelta(minutes=minutes)).isoformat()


# â”€â”€ Seed inventory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Mirrors src/lib/hospitals.js SEED_FACILITIES so the client's offline fallback
# and this live feed agree. Coordinates are real; `vials` is the seeded stock.
def _seed() -> dict[str, dict]:
    # Facilities near CMR Group of Institutions, Kandlakoya / Medchal Road.
    # Mirrors src/lib/hospitals.js SEED_FACILITIES.
    rows = [
        # id,              name,                                      tier,       lat,       lng,       vials, icu,   sector,    beds, updated_min
        ("cmrims",          "CMR Institute of Medical Sciences",       "tertiary", 17.59620, 78.48630, 28, True,  "private", 32, 12),
        ("srikara",         "Srikara Hospitals, Kompally",            "tertiary", 17.53142, 78.48750, 20, True,  "private", 26, 24),
        ("mrn",             "Malla Reddy Narayana Multispeciality",   "tertiary", 17.54399, 78.43338, 22, True,  "private", 30, 20),
        ("govt_medchal",    "Government Hospital, Medchal",           "ah",       17.62972, 78.48139, 18, False, "govt",    18, 18),
        ("chc_shamirpet",   "CHC Shamirpet",                          "chc",      17.59280, 78.57480, 14, False, "govt",    12, 42),
        ("area_malkajgiri", "Area Hospital Malkajgiri",               "ah",       17.45048, 78.53212, 24, False, "govt",    24, 36),
    ]
    return {
        r[0]: {
            "id": r[0],
            "name": r[1],
            "tier": r[2],
            "lat": r[3],
            "lng": r[4],
            "vials": r[5],
            "icu": r[6],
            "sector": r[7],
            "beds": r[8],
            "updated_at": _ago(r[9]),
        }
        for r in rows
    }


def _load() -> dict[str, dict]:
    """Load the store from disk, falling back to (and persisting) the seed."""
    global _store
    if _store is not None:
        return _store
    try:
        if _STORE_PATH.exists():
            data = json.loads(_STORE_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict) and data:
                _store = data
                return _store
    except Exception as exc:  # corrupt / unreadable file â†’ reseed
        logger.warning("hospital store unreadable, reseeding: %s", exc)
    _store = _seed()
    _persist()
    return _store


def _persist() -> None:
    """Best-effort write of the in-memory store to disk (never raises)."""
    if _store is None:
        return
    try:
        _STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _STORE_PATH.write_text(json.dumps(_store, indent=2), encoding="utf-8")
    except Exception as exc:
        logger.warning("could not persist hospital store: %s", exc)


def list_hospitals() -> list[dict]:
    """All facilities with their current stock and last-updated timestamps."""
    with _lock:
        store = _load()
        return [dict(v) for v in store.values()]


def get_hospital(hospital_id: str) -> dict | None:
    with _lock:
        return dict(_load().get(hospital_id)) if hospital_id in _load() else None


def update_stock(hospital_id: str, vials: int, beds: int | None = None) -> dict | None:
    """Set a facility's ASV stock (and optionally beds), stamping `updated_at`.

    Returns the updated record, or None if the id is unknown. This is the ASHA
    worker / hospital-staff action that makes the inventory *live*.
    """
    with _lock:
        store = _load()
        rec = store.get(hospital_id)
        if rec is None:
            return None
        rec["vials"] = max(0, int(vials))
        if beds is not None:
            rec["beds"] = max(0, int(beds))
        rec["updated_at"] = _now().isoformat()
        _persist()
        return dict(rec)


def add_hospital(hospital_id: str, data: dict) -> dict:
    """Register a new hospital with the specified credentials and details."""
    with _lock:
        store = _load()
        store[hospital_id] = {
            "id": hospital_id,
            "name": data["name"],
            "tier": data.get("tier", "tertiary"),
            "lat": float(data["lat"]),
            "lng": float(data["lng"]),
            "vials": int(data.get("vials", 0)),
            "icu": bool(data.get("icu", True)),
            "sector": data.get("sector", "private"),
            "beds": int(data.get("beds", 0)),
            "updated_at": _now().isoformat(),
        }
        _persist()
        return dict(store[hospital_id])

