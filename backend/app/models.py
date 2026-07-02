"""Pydantic request/response models — the API contract.

These mirror the shapes the frontend already expects (see src/lib/api.js and
EmergencyContext), so the proxy is a drop-in for the client's safe defaults.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


# ── /api/identify ──────────────────────────────────────────────────────────
class IdentifyRequest(BaseModel):
    """A captured snake image to analyse."""

    image: str = Field(..., description="Base64-encoded image (no data-URL prefix).")
    mime: str = Field(default="image/jpeg", description="Image MIME type.")


class IdentifyResponse(BaseModel):
    """Tentative, AI-assisted identification. Never authoritative."""

    species: str = Field(..., description='Best guess, or "Unidentified".')
    confidence: float = Field(..., ge=0.0, le=1.0, description="0–1 confidence.")
    venomous: bool = Field(..., description="Assume venomous unless clearly not.")
    common_name: str | None = Field(default=None, description="Common name of the species.")
    scientific_name: str | None = Field(default=None, description="Scientific name of the species.")
    reasoning: list[str] | None = Field(default_factory=list, description="Reasoning or diagnostic features.")
    validation_status: str | None = Field(default=None, description="Validation status of the analysis.")
    validation_reason: str | None = Field(default=None, description="Reason for validation state.")


# ── /api/summarize ─────────────────────────────────────────────────────────
class SymptomEntry(BaseModel):
    """One timestamped monitoring round from the severity tracker."""

    t: str | None = Field(default=None, description="ISO timestamp of the check.")
    answers: dict = Field(default_factory=dict, description="Checklist answers.")
    level: str | None = Field(default=None, description="mild | moderate | severe.")


class SummarizeRequest(BaseModel):
    """The monitoring log plus the bite time, for a clinician handover line."""

    symptomLog: list[SymptomEntry] = Field(default_factory=list)
    biteTime: str | None = Field(default=None, description="ISO bite timestamp.")
    language: str | None = Field(default="en")


class SummarizeResponse(BaseModel):
    """A short clinician-facing handover sentence."""

    summary: str
    source: str = Field(..., description='"gemini" or "fallback".')


# ── /health ────────────────────────────────────────────────────────────────
class HealthResponse(BaseModel):
    """Liveness + whether the proxy is configured to reach Gemini."""

    status: str = "ok"
    gemini: bool = Field(..., description="True when a Gemini key is configured.")
    version: str
