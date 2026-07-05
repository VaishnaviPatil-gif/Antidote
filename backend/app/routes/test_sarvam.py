"""Dev-only test routes for Sarvam TTS/STT verification.

These routes exist purely for manual testing during development:
  GET  /api/test-tts → generates Telugu speech and returns MP3 audio
  POST /api/test-stt → accepts an audio file and returns the transcript
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

from ..services import sarvam

logger = logging.getLogger("antidote.test_sarvam")
router = APIRouter()

# Telugu test string: "Have you been bitten by a snake?"
_TEST_TEXT = "మీరు పాము కాటుకు గురయ్యారా?"


@router.get("/test-tts", tags=["dev"])
def test_tts() -> Response:
    """Generate speech for a Telugu test string and return the MP3 file.

    Usage:  curl http://localhost:8000/api/test-tts --output test_output.mp3
    """
    audio_bytes = sarvam.generate_speech(text=_TEST_TEXT, language_code="te-IN")
    if audio_bytes is None:
        raise HTTPException(
            status_code=502,
            detail="TTS failed. Is SARVAM_API_KEY set in backend/.env?",
        )
    logger.info("test_tts: generated %d bytes of audio", len(audio_bytes))
    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={"Content-Disposition": 'attachment; filename="test_output.mp3"'},
    )


@router.post("/test-stt", tags=["dev"])
async def test_stt(
    audio: UploadFile = File(..., description="Audio file to transcribe."),
) -> dict:
    """Accept an audio file and return the Sarvam STT transcript.

    Usage:  curl -X POST http://localhost:8000/api/test-stt -F "audio=@test_output.mp3"
    """
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file.")

    result = sarvam.transcribe_audio(audio_bytes, filename=audio.filename or "audio.wav")
    if result is None:
        raise HTTPException(
            status_code=502,
            detail="STT failed. Check Sarvam API key and audio format.",
        )
    transcript, language = result
    return {"transcript": transcript, "language": language, "test_text": _TEST_TEXT}
