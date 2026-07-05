"""Sarvam AI integration — Text-to-Speech and Speech-to-Text.

Design rules (same contract as gemini.py):
  * Never raise to the caller. Every path returns a usable value or None.
  * Failures are logged with full tracebacks; callers get safe fallbacks.
  * The API key lives in settings and is NEVER exposed to the frontend.
"""

from __future__ import annotations

import base64
import io
import logging
import sys

from ..config import settings

logger = logging.getLogger("antidote.sarvam")


def _client():
    """Return a configured SarvamAI client, or None if unavailable.

    None means: the SDK could not be imported, OR no API key is set.
    Callers then use safe fallbacks.
    """
    if not settings.sarvam_enabled:
        logger.debug("sarvam: no API key configured; voice features disabled")
        return None

    try:
        from sarvamai import SarvamAI
    except ImportError:
        logger.exception(
            "Could not import sarvamai under interpreter %s — the package is "
            "missing here or a dependency failed to import; voice features "
            "disabled. Install with: pip install sarvamai",
            sys.executable,
        )
        return None

    try:
        return SarvamAI(api_subscription_key=settings.sarvam_api_key)
    except Exception:  # noqa: BLE001
        logger.exception("sarvamai imported OK but client init failed")
        return None


def generate_speech(
    text: str,
    language_code: str = "te-IN",
    speaker: str | None = None,
    pace: float = 1.0,
) -> bytes | None:
    """Convert text to speech using Sarvam TTS (bulbul:v3).

    Returns MP3 audio bytes (base64-decoded) on success, or None on failure.
    The caller decides how to serve them (as a file download, base64 in JSON, etc.).

    NOTE: the speaker MUST be a bulbul:v3 voice (e.g. priya, neha, pooja, kavya) —
    v2 voices like "anushka"/"meera" return a 400. The default is configurable via
    SARVAM_SPEAKER so voices can be swapped without a code change.
    """
    client = _client()
    if client is None:
        return None

    speaker = speaker or settings.sarvam_speaker
    try:
        response = client.text_to_speech.convert(
            text=text,
            target_language_code=language_code,
            model="bulbul:v3",
            speaker=speaker,
            pace=pace,
            enable_preprocessing=True,
            output_audio_codec="mp3",
        )
        # response.audios is a list of base64-encoded audio strings
        if response.audios and len(response.audios) > 0:
            audio_b64 = response.audios[0]
            # The SDK may return raw bytes or a base64 string depending on version
            if isinstance(audio_b64, bytes):
                return audio_b64
            # It's a base64 string — decode it
            return base64.b64decode(audio_b64)
        logger.warning("generate_speech: Sarvam returned empty audios list")
        return None
    except Exception:  # noqa: BLE001
        logger.exception("generate_speech failed")
        return None


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.wav") -> tuple[str, str] | None:
    """Transcribe audio using Sarvam STT (saaras:v3).

    Auto-detects the spoken language — useful since users may switch between
    Telugu and English mid-sentence.

    Returns (transcript, language_code) on success, or None on failure.
    """
    client = _client()
    if client is None:
        return None

    try:
        # Wrap bytes in a file-like object for the SDK
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = filename

        # saarika:v2.5 transcribes IN the spoken language (auto-detected via
        # language_code="unknown"), so the assistant can reply in that same
        # language. saaras:v3 would translate to English and lose it.
        response = client.speech_to_text.transcribe(
            file=audio_file,
            model="saarika:v2.5",
            language_code="unknown",
        )
        transcript = getattr(response, "transcript", "") or ""
        lang_code = getattr(response, "language_code", "te-IN") or "te-IN"
        # Auto-detect may report "unknown" — default to Telugu-India so TTS still
        # has a valid target language for the reply.
        if not lang_code or lang_code == "unknown":
            lang_code = "te-IN"

        if not transcript.strip():
            logger.warning("transcribe_audio: Sarvam returned empty transcript")
            return None

        logger.info(
            "transcribe_audio: transcript=%s, lang=%s",
            transcript[:200],
            lang_code,
        )
        return transcript.strip(), lang_code
    except Exception:  # noqa: BLE001
        logger.exception("transcribe_audio failed")
        return None
