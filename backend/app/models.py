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
    venom_type: str | None = Field(default=None, description="Type of venom (e.g. Neurotoxic, Hemotoxic, None).")
    danger_level: str | None = Field(default=None, description="Dangerous level classification.")
    similar_snakes: list[str] | None = Field(default_factory=list, description="Similar looking snakes.")
    typical_habitat: str | None = Field(default=None, description="Typical habitat of the species.")
    first_aid_steps: list[str] | None = Field(default_factory=list, description="Emergency first aid steps.")


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


# ── /api/hospitals ───────────────────────────────────────────────────────────
class Hospital(BaseModel):
    """One facility in the live antivenom-stock registry."""

    id: str
    name: str
    tier: str = Field(..., description="phc | chc | ah | dh | tertiary")
    lat: float
    lng: float
    vials: int = Field(..., ge=0, description="ASV vials currently in stock.")
    icu: bool = Field(default=False, description="ICU available.")
    sector: str = Field(default="govt", description="govt | private")
    beds: int = Field(default=0, ge=0, description="Emergency beds available.")
    updated_at: str = Field(..., description="ISO timestamp of the last stock update.")


class HospitalsResponse(BaseModel):
    """The full registry plus a server timestamp for cache-age display."""

    hospitals: list[Hospital]
    server_time: str = Field(..., description="ISO time the list was served.")


class StockUpdateRequest(BaseModel):
    """An ASHA worker / hospital-staff stock update."""

    vials: int = Field(..., ge=0, description="New ASV vial count.")
    beds: int | None = Field(default=None, ge=0, description="Optional new bed count.")


# ── /health ────────────────────────────────────────────────────────────────
class HealthResponse(BaseModel):
    """Liveness + whether the proxy is configured to reach Gemini."""

    status: str = "ok"
    gemini: bool = Field(..., description="True when a Gemini key is configured.")
    version: str


# ── /api/severity ───────────────────────────────────────────────────────────
class SeverityRequest(BaseModel):
    symptoms: dict
    snake: dict | None = None
    mins_since_bite: int
    swelling_progression: str = "local"


class SeverityResponse(BaseModel):
    severity: str = Field(..., description="Mild | Moderate | Severe | Critical")
    confidence: float = Field(..., ge=0.0, le=1.0)
    reasoning: list[str] = Field(default_factory=list)
    disclaimer: str
    source: str = Field(..., description='"gemini" or "fallback"')


# ── /api/voice-chat ────────────────────────────────────────────────────────
class VoiceChatResponse(BaseModel):
    """Full voice-chat loop response: transcript + AI reply + audio."""

    transcript: str = Field(..., description="What the user said (STT output).")
    language: str = Field(..., description="Detected language code (e.g. te-IN).")
    ai_response: str = Field(..., description="Gemini's first-aid reply text.")
    audio_base64: str = Field(..., description="Base64-encoded MP3 of the spoken reply.")
    action: str = Field(
        default="none",
        description=(
            "In-app action the user asked for, so the frontend can navigate/act. "
            "One of: route_hospital, sos, identify_snake, track_symptoms, "
            "first_aid, none."
        ),
    )


# ── /api/tts ───────────────────────────────────────────────────────────────
class TtsRequest(BaseModel):
    """Text-to-speech request."""

    text: str = Field(..., description="Text to convert to speech.")
    language: str = Field(default="te-IN", description="BCP-47 language code.")
    speaker: str = Field(default="priya", description="Sarvam bulbul:v3 voice name.")
    pace: float = Field(default=1.0, ge=0.5, le=2.0, description="Speech pace.")


class TtsResponse(BaseModel):
    """Base64 audio returned from TTS."""

    audio_base64: str = Field(..., description="Base64-encoded MP3 audio.")


# ── /api/stt ───────────────────────────────────────────────────────────────
class SttResponse(BaseModel):
    """Speech-to-text response."""

    transcript: str = Field(..., description="Transcribed text.")
    language: str = Field(..., description="Detected language code.")
