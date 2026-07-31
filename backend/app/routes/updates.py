"""Bidirectional case updates — REST endpoints for hospital ↔ victim sync.

These complement the WebSocket channel with HTTP endpoints so updates survive
connection drops and enable catch-up after reconnection:

  POST /api/cases/{case_id}/hospital-updates  — hospital sends preparation or message
  GET  /api/cases/{case_id}/updates           — all updates for a case
  POST /api/cases/{case_id}/location          — victim pushes GPS
  GET  /api/cases/{case_id}/location          — hospital reads latest GPS
"""

from __future__ import annotations

import asyncio
import logging
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import current_hospital
from ..services import cases as store

logger = logging.getLogger("antidote.updates")
router = APIRouter()


# ── Request Models ──────────────────────────────────────────────────────────

class HospitalUpdate(BaseModel):
    """An update from the hospital: preparation status or a text message."""
    type: str  # "preparation" | "message" | "status_change"
    field: str | None = None  # e.g. "asv_prepared", "team_ready", "patient_received"
    value: str | bool | None = None
    message: str | None = None


class LocationUpdate(BaseModel):
    """GPS push from the victim app."""
    lat: float
    lng: float


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/cases/{case_id}/hospital-updates", tags=["updates"])
async def send_hospital_update(case_id: str, req: HospitalUpdate, who=Depends(current_hospital)) -> dict:
    """Hospital sends a preparation update or message for an incoming patient.

    This writes the update to the case store AND broadcasts it to the victim
    via WebSocket so the victim app shows it instantly.
    """
    case = store.get_case(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")

    ts = time.time()
    update_record = {
        "type": req.type,
        "field": req.field,
        "value": req.value,
        "message": req.message,
        "from": "hospital",
        "hospital_name": who["name"],
        "ts": ts,
    }

    # Persist the update
    store.add_case_update(case_id, update_record)

    # If it's a preparation update, also update the preparation dict on the case
    if req.type == "preparation" and req.field:
        store.update_case_preparation(case_id, req.field, req.value, ts)

    # If it's a status change, update the case status
    if req.type == "status_change" and req.value:
        store.update_case_field(case_id, "status", str(req.value))

    # Broadcast to victim via WebSocket
    from .realtime import manager
    await manager.broadcast_to_victim(case_id, {
        "type": "hospital_update",
        "data": update_record,
    })

    # Also broadcast the update to the hospital's own dashboard (for multi-tab sync)
    hid = case.get("assigned_hospital_id")
    if hid:
        payload = {
            "type": "case_update",
            "data": {**store.get_case(case_id), "_trigger": "hospital_update"},
        }
        await manager.broadcast_to_hospital(hid, payload)
        await manager.broadcast_to_hospital("admin_all", payload)

    logger.info("hospital update: %s -> case %s (%s: %s)", who["name"], case_id, req.type, req.field or req.message)
    return {"ok": True, "update": update_record}


@router.get("/cases/{case_id}/updates", tags=["updates"])
def get_case_updates(case_id: str) -> dict:
    """All updates for a case — used for reconnection catch-up.

    Public by design (the victim app has no login), but the case_id is
    effectively an unguessable token.
    """
    case = store.get_case(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return {
        "case_id": case_id,
        "status": case.get("status", "waiting"),
        "updates": case.get("updates", []),
        "preparation": case.get("preparation", {}),
        "timeline": case.get("timeline", []),
    }


@router.post("/cases/{case_id}/location", tags=["updates"])
async def push_location(case_id: str, req: LocationUpdate) -> dict:
    """Victim app pushes its current GPS coordinates.

    Public by design — the victim isn't logged in. The case_id acts as the
    access token.
    """
    case = store.get_case(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")

    ts = time.time()
    store.update_case_location(case_id, req.lat, req.lng, ts)

    # Forward to the hospital dashboard via WebSocket
    from .realtime import manager
    hid = case.get("assigned_hospital_id")
    if hid:
        payload = {
            "type": "location_update",
            "data": {"case_id": case_id, "lat": req.lat, "lng": req.lng, "ts": ts},
        }
        await manager.broadcast_to_hospital(hid, payload)
        await manager.broadcast_to_hospital("admin_all", payload)

    return {"ok": True}


@router.get("/cases/{case_id}/location", tags=["updates"])
def get_location(case_id: str, who=Depends(current_hospital)) -> dict:
    """Hospital reads the latest GPS for a patient. Auth required."""
    case = store.get_case(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")
    loc = case.get("last_location")
    return {"case_id": case_id, "location": loc}
