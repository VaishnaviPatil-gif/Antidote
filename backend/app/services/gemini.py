"""Gemini integration — the proxy's only external dependency.

Design rules:
  * Never raise to the caller. Every path returns a usable, SAFE value.
  * Identification falls back to "assume venomous" on any failure or low
    confidence. We never expose raw provider errors.
  * Summarisation falls back to a deterministic local sentence (mirroring the
    frontend composer) so the feature works even with no key / no network.
"""

from __future__ import annotations

import base64
import json
import logging
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from ..config import settings

logger = logging.getLogger("antidote.gemini")

# The safe default, identical to the frontend's contract.
SAFE_DEFAULT = {
    "species": "Unidentified",
    "common_name": "Unidentified",
    "scientific_name": None,
    "reasoning": ["Insufficient visual evidence."],
    "validation_status": "Fallback Active",
    "validation_reason": "Process failed",
    "confidence": 0.0,
    "venomous": True,
}

# Species labels (any casing) that mean "no identification".
_UNIDENTIFIED = {"", "unidentified", "unknown", "none"}

# ── Post-response validation tuning ──────────────────────────────────────────
# A confident identification must be internally consistent and medically
# defensible, not merely high-confidence. These gate the validator below.
_MIN_REASONING = 2         # a real ID cites at least two independent observations
_STRONG_CONFIDENCE = 0.98  # at/above this we require more corroborating detail

# Generic filler tokens that do NOT constitute a diagnostic observation. We keep
# NO allow-list of anatomical vocabulary — Gemini phrases features many valid
# ways ("ocular stripe", "broad neck", "dark crossbars", "strongly patterned
# dorsum") and an allow-list would reject them. Instead we only reject items that
# are empty or built solely from these generic words (e.g. "looks venomous").
_GENERIC_TOKENS = {
    "a", "an", "the", "it", "its", "is", "are", "this", "that", "of", "with",
    "and", "to", "in", "on",
    "snake", "serpent", "reptile", "venomous", "poisonous", "nonvenomous",
    "dangerous", "deadly", "harmful", "typical", "common", "looks", "look",
    "like", "appears", "appear", "seems", "seem", "probably", "likely",
    "possible", "possibly", "maybe", "matches", "match", "resembles",
    "resemble", "species", "image", "photo", "picture", "clearly", "very",
    "quite", "somewhat", "sure", "confident", "certain", "obvious", "evident",
}


@dataclass(frozen=True)
class ValidationResult:
    """Outcome of semantic validation (Issue: structured reasons, not pass/fail)."""

    accepted: bool
    reason: str


class GeminiIdentification(BaseModel):
    """Schema for the model's identification JSON (structural validation).

    Structural only — semantic/medical rules live in `_validate_identification`.
    Unknown keys are ignored and malformed values are coerced to safe defaults
    (never raising), so a junk response degrades to "not identified" instead of
    crashing the endpoint. `confidence` is kept raw here and range-checked by
    `_normalise_confidence` so impossible values (-5, 300, "very sure") are
    rejected rather than silently clamped.
    """

    model_config = ConfigDict(extra="ignore")

    identified: bool = False
    confidence: Any = None
    species: str | None = None
    common_name: str | None = None
    scientific_name: str | None = None
    venomous: bool = True  # assume venomous unless the model clearly says otherwise
    reasoning: list[str] = Field(default_factory=list)

    @field_validator("identified", "venomous", mode="before")
    @classmethod
    def _coerce_bool(cls, v, info):
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            return v.strip().lower() in {"true", "yes", "y", "1"}
        if isinstance(v, (int, float)):
            return bool(v)
        # Missing / junk → safe default: identified=False, venomous=True.
        return info.field_name == "venomous"

    @field_validator("species", "common_name", "scientific_name", mode="before")
    @classmethod
    def _coerce_optional_str(cls, v):
        return None if v is None else str(v)

    @field_validator("reasoning", mode="before")
    @classmethod
    def _coerce_reasoning(cls, v):
        if v is None:
            return []
        if isinstance(v, str):
            return [v]
        if isinstance(v, (list, tuple)):
            return [str(x) for x in v if str(x).strip()]
        return []

_IDENTIFY_PROMPT = (
    "You are an expert Indian herpetologist assisting Antidote+, an emergency "
    "snakebite application that may be used during real medical emergencies. "
    "Your highest priority is PATIENT SAFETY. Never guess, never fabricate, and "
    "never identify a snake unless the visible evidence strongly supports a "
    "SINGLE species. A wrong identification is more dangerous than refusing to "
    "identify.\n"
    "TASK: analyse the uploaded image using ONLY visible evidence. Do NOT rely "
    "on assumptions, prior probabilities, or common species. If important "
    "identifying features are missing, return identified=false.\n"
    "VISIBLE FEATURES - inspect only what is actually visible and never infer "
    "hidden features: head shape; eye visibility; hood (ONLY if physically "
    "expanded); neck width; body thickness; tail; scale texture; body colour; "
    "dorsal markings; belly markings (if visible); bands; crossbars; diamonds; "
    "zig-zag patterns; spectacle mark; chevron markings; any unique identifying "
    "characteristics.\n"
    "IDENTIFICATION RULES - name a species ONLY if: multiple unique diagnostic "
    "features are visible; no equally plausible alternative species exists; and "
    "confidence is at least 90%. Otherwise return identified=false. Never "
    "identify a cobra unless a real expanded hood is visible OR another unique "
    "cobra diagnostic characteristic is clearly visible - a slightly widened "
    "neck is NOT evidence of a cobra.\n"
    "CONFIDENCE: 95-100 when multiple unique diagnostic features are visible; "
    "90-94 when very likely; below 90 do NOT identify.\n"
    "OUTPUT - return ONLY valid minified JSON, with no text outside it.\n"
    'If identified: {"identified":true,"species":<name>,"common_name":<common '
    'name>,"scientific_name":<latin name>,"venomous":<true|false>,"confidence":'
    '<90-100>,"reasoning":[<visible cues you actually saw>]}.\n'
    'Otherwise: {"identified":false,"confidence":<0-89>,"reason":"Insufficient '
    'visual evidence for safe identification.","possible_matches":[<0-2 '
    "plausible names>]}.\n"
    "FINAL VALIDATION - before returning a species, ask: would an experienced "
    "field herpetologist confidently identify this snake from THIS image alone? "
    "If the answer is anything other than YES, return identified=false. Do not "
    "guess."
)

_SUMMARIZE_PROMPT = (
    "You are assisting a clinician who is about to receive a snakebite patient. "
    "From the monitoring log below, write ONE concise English handover sentence "
    "(max ~40 words) covering: minutes since the bite, swelling spread, "
    "neurotoxic signs (ptosis, blurred/double vision, slurred speech, "
    "drowsiness), haematotoxic signs (bleeding), breathing difficulty, the "
    "current severity and its trend. Do NOT give a definitive diagnosis — this "
    "supports clinical assessment. Return only the sentence.\n\n"
)


def _genai():
    """Return a configured google.generativeai module, or None if unavailable.

    None means: the SDK could not be imported/configured, OR no API key is set.
    Callers then use safe fallbacks. Every failure is logged WITH its real
    traceback and the running interpreter, so an environment mismatch or a
    broken dependency is never silently misreported as "not installed".
    """
    if not settings.gemini_enabled:
        return None

    try:
        import google.generativeai as genai
    except ImportError:
        # `ImportError` (and its subclass `ModuleNotFoundError`) fires for more
        # than a genuinely-absent package, so do NOT hardcode "not installed":
        #   1. The package really isn't installed in THIS interpreter — e.g. the
        #      server was started with a different Python than the venv where you
        #      ran `pip show` (the usual cause of "installed but not found").
        #   2. It IS installed but one of its transitive deps failed to import.
        # Logging the actual exception + sys.executable makes the cause obvious.
        logger.exception(
            "Could not import google.generativeai under interpreter %s - the "
            "package is missing here or a dependency failed to import; using "
            "safe fallbacks. Verify the server runs the venv that has it.",
            sys.executable,
        )
        return None

    try:
        genai.configure(api_key=settings.gemini_api_key)
    except Exception:  # noqa: BLE001 — never raise to callers; fall back safely
        # configure() previously sat outside the try/except, so a configuration
        # failure escaped uncaught. Keep the safe-fallback contract and surface
        # the real error instead.
        logger.exception(
            "google.generativeai imported OK but configure() failed; using "
            "safe fallbacks"
        )
        return None

    return genai


def _normalise_confidence(value) -> float | None:
    """Coerce a model confidence to a clamped 0-1 float, or None if invalid.

    Accepts a 0-100 percentage (the safety-first schema, e.g. 94) or a 0-1
    fraction (legacy). Returns None for impossible or non-numeric values
    (e.g. -5, 300, "very sure") so the validator can treat confidence as
    unusable instead of silently clamping a bad number.
    """
    if isinstance(value, bool):  # bool is a numeric subtype; not a real confidence
        return None
    try:
        c = float(value)
    except (TypeError, ValueError):
        return None
    if c < 0 or c > 100:  # impossible on either the 0-1 or 0-100 scale
        return None
    if c > 1.0:  # a percentage like 94 → 0.94
        c /= 100.0
    return max(0.0, min(1.0, c))


def _extract_json(text: str) -> dict:
    """Pull the first JSON object out of a model response (tolerates fences)."""
    if not text:
        return {}
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        return {}
    try:
        return json.loads(text[start : end + 1])
    except (ValueError, TypeError):
        return {}


def _descriptive_count(reasoning: list[str]) -> int:
    """Count reasoning items that are concrete, independent observations.

    'Descriptive' means an item has real content beyond generic filler: at least
    two words AND at least one word that is not in _GENERIC_TOKENS. We do NOT
    require any specific anatomical vocabulary, so valid observations phrased in
    many ways ("dark crossbars", "broad neck", "ocular stripe", "strongly
    patterned dorsum") all pass; only empty or purely generic statements
    ("looks venomous", "typical dangerous snake") are excluded.
    """
    count = 0
    for item in reasoning:
        words = re.findall(r"[a-z]+", str(item).lower())
        if len(words) < 2:
            continue
        if any(w not in _GENERIC_TOKENS for w in words):
            count += 1
    return count


def _validate_identification(
    gm: GeminiIdentification, species: str, confidence: float | None
) -> ValidationResult:
    """Validate a claimed identification before it can reach the frontend.

    Fails CLOSED — a wrong identification is more dangerous than "Unidentified".
    Returns a ValidationResult carrying a human-readable reason. A species is
    accepted only when the response is internally consistent and medically
    defensible: the model affirmatively identified it, a real name and scientific
    name are present, confidence is valid and at/above the floor, and there are
    enough descriptive (non-generic) observations to support it. No species-
    specific rules — the prompt does that reasoning; here we only check that the
    response holds together.
    """
    if not gm.identified:
        return ValidationResult(False, "model did not affirmatively identify a species")
    if confidence is None:
        return ValidationResult(False, "confidence missing or out of range")
    if confidence < settings.low_confidence:
        return ValidationResult(
            False, f"confidence {confidence:.2f} below floor {settings.low_confidence:.2f}"
        )
    if species.lower() in _UNIDENTIFIED:
        return ValidationResult(False, "species is empty")
    if not (gm.scientific_name or "").strip():
        return ValidationResult(False, "scientific_name missing")

    total = len(gm.reasoning)
    descriptive = _descriptive_count(gm.reasoning)
    if descriptive < _MIN_REASONING:
        return ValidationResult(
            False,
            f"only {descriptive}/{total} reasoning item(s) are descriptive; "
            f"need >= {_MIN_REASONING} independent observations",
        )
    # Extreme confidence must be corroborated by more independent detail.
    if confidence >= _STRONG_CONFIDENCE and descriptive < 3:
        return ValidationResult(
            False,
            f"confidence {confidence:.2f} demands >= 3 descriptive observations, "
            f"got {descriptive}",
        )
    return ValidationResult(True, "internally consistent")


def identify(image_b64: str, mime: str = "image/jpeg") -> dict:
    """Identify a snake from a base64 image. Always returns a safe dict."""
    genai = _genai()
    if genai is None:
        logger.info("identify: no Gemini; returning safe default")
        return dict(SAFE_DEFAULT)
    try:
        data = base64.b64decode(image_b64, validate=False)
        model = genai.GenerativeModel(settings.gemini_model)
        resp = model.generate_content(
            [_IDENTIFY_PROMPT, {"mime_type": mime, "data": data}]
        )

        # ── Pipeline diagnostics ─────────────────────────────────────────────
        # Make the whole path observable so it is always clear whether a name
        # like "Spectacled Cobra" came from Gemini itself or from our code. We
        # log the (static) prompt, the RAW model text before parsing, the parsed
        # JSON, and the final dict. We never log the API key or image bytes.
        raw_text = getattr(resp, "text", "") or ""
        logger.debug("identify: prompt sent -> %s", _IDENTIFY_PROMPT)  # STEP 1
        logger.info("identify: raw Gemini response -> %s", raw_text[:2000])  # STEP 2

        parsed = _extract_json(raw_text)
        logger.info("identify: parsed JSON -> %s", parsed)  # STEP 3

        # STEP 4 — schema validation. Coerce the raw JSON into a typed model;
        # malformed values degrade to safe defaults rather than raising.
        try:
            gm = GeminiIdentification.model_validate(parsed)
        except ValidationError as exc:
            gm = GeminiIdentification()  # empty → not identified
            logger.info("identify: schema validation failed (%s); treating as no ID", exc)

        # Range-check confidence (None when impossible / non-numeric).
        confidence = _normalise_confidence(gm.confidence)
        # Display name: prefer the common name for a rural first responder.
        species = (gm.common_name or gm.species or "Unidentified").strip() or "Unidentified"

        # STEP 5 — semantic validation. Structured, human-readable verdict.
        verdict = _validate_identification(gm, species, confidence)

        if verdict.accepted:
            result = {
                "species": species,
                "common_name": (gm.common_name or gm.species or "Unidentified").strip(),
                "scientific_name": (gm.scientific_name or "").strip() or None,
                "reasoning": gm.reasoning,
                "validation_status": "Validated",
                "validation_reason": None,
                "confidence": confidence,
                "venomous": gm.venomous,
            }
            logger.info("identify: validation -> ACCEPTED (%s, %.2f)", species, confidence)
        else:
            # Fail closed → Unidentified, assume venomous. PRESERVE Gemini's
            # confidence so the client can still show "AI confidence NN%,
            # below safe identification threshold"; only fall back to 0.0 when the
            # confidence itself was missing / out of range (nothing to preserve).
            display_conf = confidence if confidence is not None else 0.0
            result = {
                "species": "Unidentified",
                "common_name": "Unidentified",
                "scientific_name": None,
                "reasoning": [verdict.reason] if verdict.reason else ["Insufficient visual evidence."],
                "validation_status": "Fallback Active",
                "validation_reason": verdict.reason,
                "confidence": display_conf,
                "venomous": True,
            }
            logger.info("identify: validation -> REJECTED (reason: %s)", verdict.reason)

        logger.info("identify: final response -> %s", result)  # STEP 6
        return result
    except Exception:  # noqa: BLE001 — never leak provider errors to the client
        logger.exception("identify failed; returning safe default")
        return dict(SAFE_DEFAULT)


def _parse_iso(value: str | None) -> datetime | None:
    """Parse an ISO timestamp (tolerating a trailing 'Z')."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _compose_fallback(symptom_log: list, bite_time: str | None) -> str:
    """Deterministic clinician sentence — mirrors the frontend composer.

    Used whenever Gemini is unavailable so /api/summarize is always useful.
    """
    if not symptom_log:
        return "No monitoring data recorded yet."

    last = symptom_log[-1]
    answers = last.get("answers", {}) if isinstance(last, dict) else {}
    level = (last.get("level") if isinstance(last, dict) else None) or "mild"

    bt = _parse_iso(bite_time)
    mins = None
    if bt is not None:
        now = datetime.now(timezone.utc)
        if bt.tzinfo is None:
            bt = bt.replace(tzinfo=timezone.utc)
        mins = max(0, int((now - bt).total_seconds() // 60))

    swell = {
        "none": "no spreading swelling",
        "local": "local swelling only",
        "spreading": "swelling spreading up the limb",
    }.get(answers.get("swelling"), "swelling not noted")

    signs = []
    if answers.get("breathing") == "yes":
        signs.append("breathing difficulty")
    if answers.get("vision") == "yes":
        signs.append("ptosis / blurred or double vision")
    if answers.get("bleeding") == "yes":
        signs.append("bleeding from gums, urine or bite site")
    if answers.get("drowsy") == "yes":
        signs.append("drowsiness or slurred speech")

    neuro = answers.get("vision") == "yes" or answers.get("drowsy") == "yes"
    hemato = answers.get("bleeding") == "yes"
    if neuro and hemato:
        impression = "possible neuro- and haematotoxic envenomation"
    elif neuro:
        impression = "possible neurotoxic envenomation"
    elif hemato:
        impression = "possible haematotoxic envenomation"
    elif level == "mild":
        impression = "local effects only so far"
    else:
        impression = "systemic features developing"

    mins_str = f"{mins}-min-old bite" if mins is not None else "bite (time unknown)"
    sign_str = f"; {', '.join(signs)}" if signs else ""
    return (
        f"{mins_str}; {swell}{sign_str}. Impression: {impression}, severity "
        f"{level}. Prepare for snakebite envenomation; share with receiving hospital."
    )


def summarize(symptom_log: list, bite_time: str | None, language: str = "en") -> dict:
    """Summarise the monitoring log. Always returns {summary, source}."""
    fallback = _compose_fallback(symptom_log, bite_time)
    genai = _genai()
    if genai is None:
        return {"summary": fallback, "source": "fallback"}
    try:
        model = genai.GenerativeModel(settings.gemini_model)
        context = {"biteTime": bite_time, "symptomLog": symptom_log}
        resp = model.generate_content(_SUMMARIZE_PROMPT + json.dumps(context))
        text = (getattr(resp, "text", "") or "").strip()
        if not text:
            return {"summary": fallback, "source": "fallback"}
        return {"summary": text, "source": "gemini"}
    except Exception:  # noqa: BLE001
        logger.exception("summarize failed; returning fallback")
        return {"summary": fallback, "source": "fallback"}
