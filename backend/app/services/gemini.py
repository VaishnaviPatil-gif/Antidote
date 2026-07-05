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
    "venom_type": "Unknown (Assume Neurotoxic & Hemotoxic)",
    "danger_level": "Critical (Safety Fallback Active)",
    "similar_snakes": [],
    "typical_habitat": "Rural and agricultural regions of South Asia",
    "first_aid_steps": [
        "Keep calm and minimize movement.",
        "Immobilize the bitten limb at or below heart level.",
        "Remove tight jewelry, watches, or clothing.",
        "Reach a medical facility with antivenom immediately.",
        "DO NOT cut, suck, or apply tourniquets."
    ],
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
    """Schema for the model's identification JSON (structural validation)."""

    model_config = ConfigDict(extra="ignore")

    identified: bool = False
    confidence: Any = None
    species: str | None = None
    common_name: str | None = None
    scientific_name: str | None = None
    venomous: bool = True
    reasoning: list[str] = Field(default_factory=list)
    venom_type: str | None = None
    danger_level: str | None = None
    similar_snakes: list[str] = Field(default_factory=list)
    typical_habitat: str | None = None
    first_aid_steps: list[str] = Field(default_factory=list)

    @field_validator("identified", "venomous", mode="before")
    @classmethod
    def _coerce_bool(cls, v, info):
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            return v.strip().lower() in {"true", "yes", "y", "1"}
        if isinstance(v, (int, float)):
            return bool(v)
        return info.field_name == "venomous"

    @field_validator("species", "common_name", "scientific_name", "venom_type", "danger_level", "typical_habitat", mode="before")
    @classmethod
    def _coerce_optional_str(cls, v):
        return None if v is None else str(v)

    @field_validator("reasoning", "similar_snakes", "first_aid_steps", mode="before")
    @classmethod
    def _coerce_lists(cls, v):
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
    '<90-100>,"reasoning":[<visible cues you actually saw>],"venom_type":'
    '<Neurotoxic|Hemotoxic|Cytotoxic|None>,"danger_level":<Critical|Highly '
    'Dangerous|Moderately Dangerous|Harmless>,"similar_snakes":[<1-2 similar looking '
    'snakes>],"typical_habitat":<habitat description>,"first_aid_steps":[<3-5 '
    'key safety-first first aid steps>]}.\n'
    'Otherwise: {"identified":false,"confidence":<0-89>,"reason":"Insufficient '
    'visual evidence for safe identification.","possible_matches":[<0-2 '
    "plausible names>]}.\n"
    "FINAL VALIDATION - before returning a species, ask: would an experienced "
    "field herpetologist confidently identify this snake from THIS image alone? "
    "If the answer is anything other than YES, return identified=false. Do not "
    "guess."
)

_SEVERITY_PROMPT = (
    "You are an expert clinical toxicologist specializing in snakebite envenomation triage.\n"
    "Evaluate the clinical severity based on the following input:\n"
    "Inputs:\n"
    "- Symptoms: {symptoms}\n"
    "- Snake Identification: {snake}\n"
    "- Time Since Bite: {time_since_bite}\n"
    "- Swelling Progression: {swelling_progression}\n\n"
    "Outputs must be in valid JSON format matching this schema:\n"
    "{{\n"
    '  "severity": "Mild" | "Moderate" | "Severe" | "Critical",\n'
    '  "confidence": <float between 0.0 and 1.0>,\n'
    '  "reasoning": [<list of short clinical bullet points justifying the classification>]\n'
    "}}\n\n"
    "Safety Guidelines (Safety-First):\n"
    "1. CRITICAL: If there are systemic neurotoxic signs (e.g. drooping eyelids/ptosis, slurred speech, drowsiness, breathing issues) OR significant bleeding, severity must be classified as Severe or Critical.\n"
    "2. If the snake is identified as highly venomous (e.g. Russell's Viper, Indian Cobra, Saw-scaled Viper, Common Krait) and there are systemic symptoms, evaluate as Severe or Critical. If there are no symptoms yet but the bite time is short, rate as Moderate or Severe to ensure safety.\n"
    "3. Output MUST be valid JSON only, no markdown fences, no extra text."
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
                "venom_type": (gm.venom_type or ("Neurotoxic & Hemotoxic" if gm.venomous else "None")).strip(),
                "danger_level": (gm.danger_level or ("Highly Dangerous" if gm.venomous else "Harmless")).strip(),
                "similar_snakes": gm.similar_snakes or [],
                "typical_habitat": (gm.typical_habitat or "Vikarabad region").strip(),
                "first_aid_steps": gm.first_aid_steps or [
                    "Keep calm and minimize movement.",
                    "Immobilize the bitten limb at or below heart level.",
                    "Remove tight jewelry, watches, or clothing.",
                    "Reach a medical facility with antivenom immediately.",
                    "DO NOT cut, suck, or apply tourniquets."
                ]
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
                "venom_type": "Unknown (Assume Neurotoxic & Hemotoxic)",
                "danger_level": "Critical (Safety Fallback Active)",
                "similar_snakes": [],
                "typical_habitat": "Rural and agricultural regions of South Asia",
                "first_aid_steps": [
                    "Keep calm and minimize movement.",
                    "Immobilize the bitten limb at or below heart level.",
                    "Remove tight jewelry, watches, or clothing.",
                    "Reach a medical facility with antivenom immediately.",
                    "DO NOT cut, suck, or apply tourniquets."
                ]
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


def _compose_severity_fallback(symptoms: dict, snake: dict | None, mins_since_bite: int, swelling_progression: str) -> dict:
    has_breathing = symptoms.get("breathing") == "yes"
    has_vision = symptoms.get("vision") == "yes"
    has_bleeding = symptoms.get("bleeding") == "yes"
    has_drowsy = symptoms.get("drowsy") == "yes"
    
    is_venomous = snake.get("venomous") if snake else True
    
    reasoning = []
    
    if has_breathing:
        reasoning.append("Respiratory compromise or breathing difficulty reported.")
    if has_vision:
        reasoning.append("Neurotoxic signs detected (vision impairment or ptosis).")
    if has_bleeding:
        reasoning.append("Hemotoxic signs detected (spontaneous bleeding).")
    if has_drowsy:
        reasoning.append("Systemic neurological depression (drowsiness / slurred speech).")
        
    if swelling_progression == "spreading":
        reasoning.append("Rapidly spreading localized swelling up the bitten limb.")
    elif swelling_progression == "local":
        reasoning.append("Swelling localized to bite site area.")
        
    if snake and snake.get("species") and snake.get("species") != "Unidentified":
        reasoning.append(f"Identified species: {snake.get('species')} ({'Venomous' if is_venomous else 'Non-Venomous'}).")
    else:
        reasoning.append("Snake species remains unidentified; treating as potentially venomous for safety.")

    if has_breathing or (has_vision and has_drowsy):
        severity_level = "Critical"
    elif has_vision or has_bleeding or has_drowsy:
        severity_level = "Severe"
    elif swelling_progression == "spreading":
        severity_level = "Moderate"
    else:
        severity_level = "Mild"
        
    reasoning.append(f"Bite duration: {mins_since_bite} minutes elapsed since exposure.")
    reasoning.append("Clinical assessment always overrides automated triage recommendations.")

    return {
        "severity": severity_level,
        "confidence": 0.85,
        "reasoning": reasoning,
        "disclaimer": "Never replace professional medical advice. Always remain safety-first. Triage recommendations are tentative.",
        "source": "fallback"
    }


def evaluate_severity(symptoms: dict, snake: dict | None, mins_since_bite: int, swelling_progression: str) -> dict:
    """Evaluate triage severity using Gemini or fallback."""
    fallback = _compose_severity_fallback(symptoms, snake, mins_since_bite, swelling_progression)
    genai = _genai()
    if genai is None:
        return fallback
    try:
        model = genai.GenerativeModel(settings.gemini_model)
        prompt = _SEVERITY_PROMPT.format(
            symptoms=json.dumps(symptoms),
            snake=json.dumps(snake) if snake else "None",
            time_since_bite=f"{mins_since_bite} minutes",
            swelling_progression=swelling_progression
        )
        resp = model.generate_content(prompt)
        text = (getattr(resp, "text", "") or "").strip()
        if not text:
            return fallback
            
        data = _extract_json(text)
        if not data or "severity" not in data:
            return fallback
            
        # Validate/clean
        severity_val = str(data["severity"]).capitalize()
        if severity_val not in ["Mild", "Moderate", "Severe", "Critical"]:
            severity_val = fallback["severity"]
            
        confidence_val = data.get("confidence", 0.85)
        try:
            confidence_val = float(confidence_val)
        except (ValueError, TypeError):
            confidence_val = 0.85
            
        reasoning_list = data.get("reasoning", [])
        if not isinstance(reasoning_list, list):
            reasoning_list = [str(reasoning_list)]
        if not reasoning_list:
            reasoning_list = fallback["reasoning"]
            
        return {
            "severity": severity_val,
            "confidence": confidence_val,
            "reasoning": reasoning_list,
            "disclaimer": "Never replace professional medical advice. Always remain safety-first. Triage recommendations are tentative.",
            "source": "gemini"
        }
    except Exception:  # noqa: BLE001
        logger.exception("evaluate_severity failed; returning fallback")
        return fallback


# ── Voice chat (Sarvam TTS/STT + Gemini brain) ──────────────────────────────

# The in-app actions the assistant can trigger. The frontend maps each to a
# screen (route_hospital → /routing, sos → /sos, etc.). "none" = just talk.
VOICE_ACTIONS = {
    "route_hospital",   # take me to / book / reach a hospital with antivenom
    "hospital_stock",   # QUESTION: how many vials / which hospital has antivenom
    "sos",              # call for help / ambulance / send SOS
    "identify_snake",   # identify the snake / open the camera
    "track_symptoms",   # log or check symptoms over time
    "first_aid",        # what do I do right now (advice, no navigation)
    "none",             # general talk / reassurance / unclear
}

# Keyword fallback intent detection, used when Gemini is down or over its daily
# quota (the free tier is only ~20 requests/day, so this path runs often during a
# demo). Order matters: the most decisive intents are checked first. English +
# native + transliterated Hindi/Telugu cues so a spoken command still routes with
# NO Gemini call at all. Both साँप (nuqta) and सांप (anusvara) spellings included.
_ACTION_KEYWORDS = [
    # Stock QUESTIONS first — "how many vials at the nearest hospital" mentions
    # "hospital" too, so it must beat route_hospital to the match.
    ("hospital_stock", ("how many", "vial", "antivenom", "anti-venom", "asv",
                        "in stock", "available", "kitne", "కెన్ని", "ఎన్ని",
                        "సీసా", "శీశి", "कितनी", "शीशी", "स्टॉक", "stock")),
    ("sos", ("ambulance", "call help", "call for help", "emergency call", "108",
             "112", "madad", "bulao", "sahayam", "సహాయం", "పిలవండి", "मदद", "बुलाओ")),
    ("route_hospital", ("hospital", "book", "take me", "directions", "route",
                        "nearest", "reach", "go to", "asupatri", "aspatal",
                        "ఆసుపత్రి", "తీసుకెళ్", "अस्पताल", "ले चलो", "ले जाओ")),
    ("identify_snake", ("identify", "which snake", "what snake", "photo", "camera",
                        "picture", "pehchan", "pamu", "పాము", "గుర్తించు",
                        "saanp", "साँप", "सांप", "पहचान")),
    ("track_symptoms", ("symptom", "swelling", "feeling", "track", "vomit",
                        "lakshan", "లక్షణ", "వాపు", "लक्षण", "सूजन")),
    ("first_aid", ("first aid", "what do i do", "what should", "help me",
                   "bandage", "tourniquet", "pratham", "prathamik",
                   "ప్రథమ", "प्राथमिक")),
]


def _keyword_action(text: str) -> str:
    """Best-effort intent from raw text — the offline / no-quota fallback."""
    low = (text or "").lower()
    for action, cues in _ACTION_KEYWORDS:
        if any(cue in low for cue in cues):
            return action
    return "none"


# Per-action spoken fallback replies (te/hi/en), used when Gemini is unavailable.
# Each CONFIRMS the action so the spoken reply matches the screen we navigate to,
# keeping the assistant coherent even with zero Gemini calls.
_ACTION_REPLY = {
    "route_hospital": {
        "te": "సరే, యాంటివీనమ్ ఉన్న సమీప ఆసుపత్రికి మిమ్మల్ని తీసుకెళ్తున్నాను. ప్రశాంతంగా ఉండండి.",
        "hi": "ठीक है, मैं आपको एंटीवेनम वाले नज़दीकी अस्पताल ले जा रहा हूँ। शांत रहें।",
        "en": "Okay, taking you to the nearest hospital that has antivenom. Stay calm.",
    },
    "sos": {
        "te": "సహాయం కోసం SOS తెరుస్తున్నాను. మీ అత్యవసర పరిచయాలకు అలర్ట్ పంపవచ్చు.",
        "hi": "मैं मदद के लिए SOS खोल रहा हूँ। आप अपने आपातकालीन संपर्कों को अलर्ट भेज सकते हैं।",
        "en": "Opening SOS for help. You can alert your emergency contacts now.",
    },
    "identify_snake": {
        "te": "పామును గుర్తించడానికి కెమెరా తెరుస్తున్నాను. పాము ఫోటో తీయండి.",
        "hi": "साँप पहचानने के लिए कैमरा खोल रहा हूँ। साँप की फ़ोटो लें।",
        "en": "Opening the camera to identify the snake. Take a photo of it.",
    },
    "track_symptoms": {
        "te": "లక్షణాలను నమోదు చేయడానికి ట్రాకర్ తెరుస్తున్నాను.",
        "hi": "लक्षण दर्ज करने के लिए ट्रैकर खोल रहा हूँ।",
        "en": "Opening the symptom tracker so you can log how you feel.",
    },
    "first_aid": {
        "te": "ప్రశాంతంగా ఉండండి, కాటు అవయవాన్ని కదపకండి, కోయవద్దు లేదా కట్టు కట్టవద్దు. వెంటనే ఆసుపత్రికి వెళ్ళండి.",
        "hi": "शांत रहें, काटे हुए अंग को न हिलाएं, न काटें न बांधें। तुरंत अस्पताल जाएं।",
        "en": "Stay calm, keep the bitten limb still, don't cut or tie it. Reach a hospital quickly.",
    },
    "hospital_stock": {
        # Only used when NO live context was supplied — otherwise we answer with
        # real numbers via _stock_answer().
        "te": "ప్రస్తుత స్టాక్ సమాచారం కోసం, ఆసుపత్రి స్క్రీన్ తెరవండి. యాంటివీనమ్ ఉన్న సమీప ఆసుపత్రిని చూపిస్తాను.",
        "hi": "मौजूदा स्टॉक के लिए अस्पताल स्क्रीन खोलें। मैं एंटीवेनम वाला नज़दीकी अस्पताल दिखाता हूँ।",
        "en": "For live stock, open the hospital screen — I'll show the nearest hospital that has antivenom.",
    },
    "none": {
        "te": "ప్రశాంతంగా ఉండండి. కాటు వేసిన అవయవాన్ని కదపకండి. వెంటనే సమీపంలోని ఆసుపత్రికి వెళ్ళండి.",
        "hi": "शांत रहें। काटे हुए अंग को न हिलाएं। तुरंत नजदीकी अस्पताल जाएं।",
        "en": "Stay calm. Don't move the bitten limb. Get to the nearest hospital with antivenom immediately.",
    },
}


def _hospital_context_text(app_context: dict | None) -> str:
    """Compact, prompt-ready summary of the live hospital feed (or "" if none)."""
    if not app_context or not isinstance(app_context, dict):
        return ""
    hospitals = app_context.get("hospitals") or []
    rec = app_context.get("recommended") or None
    if not hospitals and not rec:
        return ""

    lines = ["LIVE HOSPITAL DATA — use ONLY these numbers for stock/distance "
             "questions, never invent them:"]
    if rec:
        lines.append(
            f"- Recommended (nearest WITH antivenom in stock): {rec.get('name')} "
            f"— {rec.get('vials')} vials, ~{rec.get('km')} km, ~{rec.get('eta_min')} min away."
        )
    if hospitals:
        parts = [
            f"{h.get('name')} ({h.get('vials')} vials, ~{h.get('km')} km)"
            for h in hospitals[:6]
        ]
        lines.append("- All nearby: " + "; ".join(parts) + ".")
    return "\n".join(lines)


def _stock_answer(app_context: dict | None, lang: str) -> str | None:
    """Deterministic spoken answer to a stock question, straight from live data.

    Quota-proof: needs no Gemini call. Returns None if we have no data to answer
    with (caller then uses the generic hospital_stock fallback line).
    """
    if not app_context or not isinstance(app_context, dict):
        return None
    rec = app_context.get("recommended")
    if not rec or rec.get("vials") is None:
        return None
    name, vials = rec.get("name"), rec.get("vials")
    km, eta = rec.get("km"), rec.get("eta_min")
    if lang == "hi":
        return (f"एंटीवेनम वाला सबसे नज़दीकी अस्पताल {name} है, लगभग {km} किलोमीटर दूर। "
                f"वहाँ {vials} शीशियाँ एंटीवेनम तैयार हैं, पहुँचने में करीब {eta} मिनट।")
    if lang == "te":
        return (f"యాంటివీనమ్ ఉన్న సమీప ఆసుపత్రి {name}, సుమారు {km} కిలోమీటర్ల దూరంలో ఉంది. "
                f"అక్కడ {vials} సీసాల యాంటివీనమ్ సిద్ధంగా ఉంది, చేరడానికి సుమారు {eta} నిమిషాలు.")
    return (f"The nearest hospital with antivenom is {name}, about {km} km away. "
            f"It has {vials} vials of antivenom ready — roughly {eta} minutes to reach.")


def _lang_key(language: str) -> str:
    """Map a BCP-47 code (te-IN) to our reply table key (te), default en."""
    short = (language or "en").split("-")[0].lower()
    return short if short in ("te", "hi", "en") else "en"


_VOICE_CHAT_PROMPT = (
    "You are the voice assistant for Antidote+, a snakebite emergency app used in "
    "rural India. A patient (or bystander) is speaking to you by voice during a "
    "real emergency. Decide (a) a SHORT spoken reply and (b) which single in-app "
    "ACTION they want.\n\n"
    "ACTIONS (choose exactly one):\n"
    "- route_hospital: they want to GO TO / reach / be taken to a hospital, get "
    "directions, or \"book\" a hospital that has antivenom.\n"
    "- hospital_stock: they only ASK about vial counts / antivenom availability / "
    "which hospital has stock, WITHOUT asking to be taken there. Answer with the "
    "live numbers; do NOT navigate.\n"
    "- sos: they want to call for help, an ambulance, or send an SOS to contacts.\n"
    "- identify_snake: they want to identify the snake or use the camera.\n"
    "- track_symptoms: they want to log or check symptoms (swelling, breathing).\n"
    "- first_aid: they are asking what to do right now (advice only, no screen).\n"
    "- none: general talk, reassurance, or unclear.\n\n"
    "REPLY RULES:\n"
    "1. Same language the user spoke ({language}); match a mixed style if they mix.\n"
    "2. SHORT — 2-4 sentences, it is read aloud by text-to-speech.\n"
    "3. Calm, reassuring, safety-first. Never give dosage or medication advice.\n"
    "4. If the action navigates (route_hospital, sos, identify_snake, "
    "track_symptoms), the reply must CONFIRM you are opening that screen now "
    "(e.g. \"Okay, taking you to the nearest hospital that has antivenom.\").\n"
    "5. If breathing difficulty, vision problems or heavy bleeding are mentioned, "
    "urge them to reach emergency care immediately.\n"
    "6. For hospital_stock questions, ANSWER using the live hospital data below "
    "(vial counts, distances). Never invent numbers; if none is given, tell them "
    "to open the hospital screen.\n\n"
    "{hospital_data}"
    "Conversation so far:\n{history}\n\n"
    "Patient just said: \"{user_text}\"\n\n"
    "Return ONLY minified JSON, no text outside it: "
    '{{"reply":"<spoken reply in {language}>","action":"<one action>"}}'
)


def voice_chat_respond(
    user_text: str,
    language: str = "te-IN",
    conversation_history: list[dict] | None = None,
    app_context: dict | None = None,
) -> dict:
    """Generate a voice-assistant reply AND the in-app action, in one call.

    Returns {"reply": <text to speak>, "action": <one of VOICE_ACTIONS>}. Never
    raises: on any failure it falls back to a safe sentence plus a keyword-based
    action so the assistant still navigates offline.
    """
    # Map language codes to human-readable names for the prompt
    lang_names = {
        "te-IN": "Telugu", "te": "Telugu",
        "hi-IN": "Hindi", "hi": "Hindi",
        "en-IN": "English", "en": "English",
        "kn-IN": "Kannada", "kn": "Kannada",
        "ta-IN": "Tamil", "ta": "Tamil",
        "ml-IN": "Malayalam", "ml": "Malayalam",
        "mr-IN": "Marathi", "mr": "Marathi",
        "bn-IN": "Bengali", "bn": "Bengali",
        "gu-IN": "Gujarati", "gu": "Gujarati",
    }
    lang_name = lang_names.get(language, "the same language as the patient")

    # Format conversation history
    history_str = ""
    if conversation_history:
        for entry in conversation_history[-6:]:  # Last 6 turns max
            role = entry.get("role", "user")
            text = entry.get("text", "")
            history_str += f"{'Patient' if role == 'user' else 'Assistant'}: {text}\n"
    if not history_str:
        history_str = "(This is the start of the conversation.)"

    # Build a fallback that CONFIRMS the keyword-detected action, in the user's
    # language — so even with no Gemini call, the spoken reply matches the screen
    # we navigate to. This is the common path once the daily Gemini quota is hit.
    fb_action = _keyword_action(user_text)
    fb_key = _lang_key(language)
    if fb_action == "hospital_stock":
        # Answer stock questions straight from live data — no Gemini needed.
        answer = _stock_answer(app_context, fb_key)
        fb_reply = answer if answer else _ACTION_REPLY["hospital_stock"][fb_key]
    else:
        fb_reply = _ACTION_REPLY[fb_action][fb_key]
    fallback = {"reply": fb_reply, "action": fb_action}

    genai = _genai()
    if genai is None:
        logger.info("voice_chat_respond: no Gemini; returning keyword fallback")
        return fallback

    hospital_data = _hospital_context_text(app_context)
    try:
        model = genai.GenerativeModel(settings.gemini_model)
        prompt = _VOICE_CHAT_PROMPT.format(
            language=lang_name,
            history=history_str,
            user_text=user_text,
            hospital_data=(hospital_data + "\n\n") if hospital_data else "",
        )
        resp = model.generate_content(prompt)
        text = (getattr(resp, "text", "") or "").strip()
        if not text:
            return fallback

        parsed = _extract_json(text)
        reply = str(parsed.get("reply") or "").strip()
        action = str(parsed.get("action") or "").strip().lower()
        if action not in VOICE_ACTIONS:
            action = _keyword_action(user_text)
        if not reply:
            # Model spoke but gave no JSON reply — use its raw text, keep action.
            reply = text if "{" not in text else fallback["reply"]

        logger.info("voice_chat_respond: action=%s reply=%s", action, reply[:200])
        return {"reply": reply, "action": action}
    except Exception:  # noqa: BLE001
        logger.exception("voice_chat_respond failed; returning fallback")
        return fallback
