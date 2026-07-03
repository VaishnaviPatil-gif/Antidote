"""POST /api/severity — AI Severity Engine.

Evaluates clinical severity based on symptoms, snake identification, bite duration, and swelling progression.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter

from ..models import SeverityRequest, SeverityResponse
from ..services import gemini

logger = logging.getLogger("antidote.severity")
router = APIRouter()


@router.post("/severity", response_model=SeverityResponse, tags=["ai"])
def evaluate_severity(req: SeverityRequest) -> SeverityResponse:
    """Evaluate severity of the envenomation."""
    result = gemini.evaluate_severity(
        req.symptoms,
        req.snake,
        req.mins_since_bite,
        req.swelling_progression
    )
    return SeverityResponse(**result)
