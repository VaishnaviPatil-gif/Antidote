"""POST /api/identify — proxy a snake image to Gemini vision.

Returns a tentative, AI-assisted guess, or the safe default (assume venomous)
on anything we can't trust. Never surfaces a raw provider error.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter

from ..models import IdentifyRequest, IdentifyResponse
from ..services import gemini

logger = logging.getLogger("antidote.identify")
router = APIRouter()


@router.post("/identify", response_model=IdentifyResponse, tags=["ai"])
def identify(req: IdentifyRequest) -> IdentifyResponse:
    """Identify a snake from a base64 image (optional helper, never a diagnosis)."""
    if not req.image:
        # Nothing to analyse → safe default, not an error.
        return IdentifyResponse(**gemini.SAFE_DEFAULT)
    result = gemini.identify(req.image, req.mime)
    return IdentifyResponse(**result)
