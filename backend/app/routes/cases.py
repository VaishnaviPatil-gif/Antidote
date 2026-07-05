"""Incoming-patient cases — the bridge between the victim app and the dashboard.

  POST /api/cases  — the victim app's "Confirm & alert hospital" writes a case
                     here (no login: the victim isn't a hospital user).
  GET  /api/cases  — hospital staff read their incoming patients (login required;
                     admin sees every facility).
"""

from __future__ import annotations

import logging

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


@router.get("/cases", tags=["cases"])
def get_cases(who=Depends(current_hospital)) -> dict:
    hid = who["hospital_id"]
    return {"cases": store.list_cases(hid), "scope": who["name"], "hospital_id": hid}


@router.post("/cases", tags=["cases"])
def create_case(req: CaseSubmit) -> dict:
    """Victim app → alert a hospital of an incoming patient. Public by design."""
    rec = store.add_case(req.model_dump())
    logger.info("case alert: %s → %s (%s)", rec["id"], rec.get("assigned_hospital_id"), rec["severity"])
    return rec
