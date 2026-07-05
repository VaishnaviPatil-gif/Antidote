"""Hospital antivenom-stock registry endpoints.

  GET  /api/hospitals              — the live inventory (stock + timestamps).
  POST /api/hospitals/{id}/stock   — an ASHA worker / hospital-staff update.

This is what makes the routing screen's "has ASV in stock" claim real: the
numbers are fetched and timestamped, not hardcoded in the client.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from ..auth import current_hospital
from ..models import Hospital, HospitalsResponse, StockUpdateRequest
from ..services import hospitals as store

logger = logging.getLogger("antidote.hospitals")
router = APIRouter()


@router.get("/hospitals", response_model=HospitalsResponse, tags=["hospitals"])
def get_hospitals() -> HospitalsResponse:
    """Return every facility with its current ASV stock and last-updated time."""
    rows = [Hospital(**h) for h in store.list_hospitals()]
    return HospitalsResponse(
        hospitals=rows, server_time=datetime.now(timezone.utc).isoformat()
    )


@router.post("/hospitals/{hospital_id}/stock", response_model=Hospital, tags=["hospitals"])
def update_stock(hospital_id: str, req: StockUpdateRequest, who=Depends(current_hospital)) -> Hospital:
    """Update a facility's ASV stock (and optionally beds). Requires a hospital
    login; a non-admin account may only update its own facility."""
    if who["hospital_id"] is not None and who["hospital_id"] != hospital_id:
        raise HTTPException(status_code=403, detail="You can only update your own hospital's stock")
    updated = store.update_stock(hospital_id, req.vials, req.beds)
    if updated is None:
        raise HTTPException(status_code=404, detail="Unknown hospital id")
    logger.info("stock updated by %s: %s -> %s vials", who["username"], hospital_id, updated["vials"])
    return Hospital(**updated)
