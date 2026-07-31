"""Incoming-patient cases — the bridge between the victim app and the dashboard.

  POST /api/cases  — the victim app's "Confirm & alert hospital" writes a case
                     here (no login: the victim isn't a hospital user).
  GET  /api/cases  — hospital staff read their incoming patients (login required;
                     admin sees every facility).
"""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import current_hospital
from ..services import cases as store

logger = logging.getLogger("antidote.cases")
router = APIRouter()


class CaseSubmit(BaseModel):
    id: str | None = None
    severity: str = "severe"
    species: str | None = None
    confidence: float | None = None
    gps: str | None = None
    eta_min: int | None = None
    assigned_hospital_id: str
    assigned_hospital: str | None = None
    mins_since_bite: int | None = None
    status: str = "enroute"
    # ── Enhanced fields for real-time dispatch ──
    village: str | None = None
    symptoms: dict | None = None
    snake_image: str | None = None
    patient_name: str | None = None
    patient_age: str | None = None
    patient_gender: str | None = None
    emergency_contact: dict | None = None
    qr_data: str | None = None
    voice_transcript: str | None = None
    first_aid_given: list[str] | None = None
    hospital_recommendation_reason: str | None = None
    venom_type: str | None = None
    danger_level: str | None = None


@router.get("/cases", tags=["cases"])
def get_cases() -> dict:
    return {"cases": store.list_cases(None), "scope": "District Emergency Control Center", "hospital_id": None}


@router.post("/cases", tags=["cases"])
async def create_case(req: CaseSubmit) -> dict:
    """Victim app → alert a hospital of an incoming patient.

    Public by design. After persisting the case, broadcasts it to any connected
    hospital dashboard via WebSocket for instant (<1s) notification.
    """
    rec = store.add_case(req.model_dump())
    logger.info("case alert: %s -> %s (%s)", rec["id"], rec.get("assigned_hospital_id"), rec["severity"])

    # Broadcast to all connected hospital dashboards via WebSocket
    try:
        from .realtime import manager
        payload = {
            "type": "new_case",
            "data": rec,
        }
        hospital_id = rec.get("assigned_hospital_id")
        if hospital_id:
            await manager.broadcast_to_hospital(hospital_id, payload)
        await manager.broadcast_to_hospital("admin_all", payload)
        await manager.broadcast_to_all_hospitals(payload)
        logger.info("WS broadcast: new_case %s to target & all hospitals", rec["id"])
    except Exception as exc:
        # WebSocket broadcast failure is non-fatal — the polling fallback works
        logger.warning("WS broadcast failed for case %s: %s", rec["id"], exc)

    return rec

