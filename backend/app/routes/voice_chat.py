"""Voice chat endpoints — /api/voice-chat, /api/tts, /api/stt.

The frontend sends audio to these endpoints (never to Sarvam directly),
keeping the API key server-side. This follows the same proxy pattern used
for the Gemini endpoints.

Full voice-chat loop (/api/voice-chat):
  1. User records audio → uploads as multipart
  2. Backend transcribes with Sarvam STT (auto-detects language)
  3. Transcript → Gemini for first-aid response (in detected language)
  4. AI response → Sarvam TTS → audio bytes
  5. Return JSON with transcript, AI text, and base64 audio
"""

from __future__ import annotations

import base64
import logging
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..models import (
    SttResponse,
    TtsRequest,
    TtsResponse,
    VoiceChatResponse,
    VoiceReplyRequest,
    VoiceReplyResponse,
)
from ..services import gemini
from ..services import sarvam

logger = logging.getLogger("antidote.voice_chat")
router = APIRouter()


@router.post("/voice-chat", response_model=VoiceChatResponse, tags=["voice"])
async def voice_chat(
    audio: UploadFile = File(..., description="Audio file from the user's mic."),
    history: Optional[str] = Form(
        default=None,
        description="JSON-encoded conversation history (list of {role, text} dicts).",
    ),
    context: Optional[str] = Form(
        default=None,
        description=(
            "JSON-encoded live app context so the assistant can answer factual "
            "questions — e.g. {\"hospitals\":[{name,vials,km,eta_min}], "
            "\"recommended\":{...}}. Optional."
        ),
    ),
) -> VoiceChatResponse:
    """Full voice conversation loop: STT → Gemini → TTS.

    Accepts a multipart audio upload and an optional JSON conversation history.
    Returns the user's transcript, the AI reply, and a base64-encoded MP3 of
    the spoken reply.
    """
    import json

    # Step 1: Read the uploaded audio bytes
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file.")

    filename = audio.filename or "audio.wav"

    # Step 2: Transcribe with Sarvam STT
    stt_result = sarvam.transcribe_audio(audio_bytes, filename=filename)
    if stt_result is None:
        raise HTTPException(
            status_code=502,
            detail="Speech-to-text failed. Check Sarvam API key and audio format.",
        )
    transcript, language = stt_result

    # Step 3: Parse conversation history + live app context (if provided)
    conv_history = None
    if history:
        try:
            conv_history = json.loads(history)
        except (json.JSONDecodeError, TypeError):
            logger.warning("voice_chat: invalid history JSON, ignoring")

    app_context = None
    if context:
        try:
            app_context = json.loads(context)
        except (json.JSONDecodeError, TypeError):
            logger.warning("voice_chat: invalid context JSON, ignoring")

    # Step 4: Get Gemini's reply text AND the in-app action to trigger.
    result = gemini.voice_chat_respond(
        user_text=transcript,
        language=language,
        conversation_history=conv_history,
        app_context=app_context,
    )
    ai_response = result["reply"]
    action = result["action"]

    # Step 5: Convert AI response to speech with Sarvam TTS
    tts_bytes = sarvam.generate_speech(text=ai_response, language_code=language)
    if tts_bytes is None:
        # TTS failed — still return the text response, just with empty audio
        logger.warning("voice_chat: TTS failed, returning text-only response")
        audio_b64 = ""
    else:
        audio_b64 = base64.b64encode(tts_bytes).decode("ascii")

    return VoiceChatResponse(
        transcript=transcript,
        language=language,
        ai_response=ai_response,
        audio_base64=audio_b64,
        action=action,
    )


@router.post("/voice-reply", response_model=VoiceReplyResponse, tags=["voice"])
def voice_reply(req: VoiceReplyRequest) -> VoiceReplyResponse:
    """Second half of the two-step voice flow: text → Gemini reply → TTS audio.

    The client transcribes the mic audio with /api/stt first (so it can show the
    user's words immediately), then calls this with that transcript. Splitting
    the loop keeps the transcript from being blocked on the slower Gemini+TTS
    round trip. Never raises — the Gemini brain and TTS both fall back safely.
    """
    result = gemini.voice_chat_respond(
        user_text=req.text,
        language=req.language,
        conversation_history=req.history,
        app_context=req.context,
    )
    ai_response = result["reply"]
    action = result["action"]

    tts_bytes = sarvam.generate_speech(text=ai_response, language_code=req.language)
    if tts_bytes is None:
        logger.warning("voice_reply: TTS failed, returning text-only response")
        audio_b64 = ""
    else:
        audio_b64 = base64.b64encode(tts_bytes).decode("ascii")

    return VoiceReplyResponse(
        ai_response=ai_response,
        action=action,
        audio_base64=audio_b64,
        language=req.language,
    )


@router.post("/tts", response_model=TtsResponse, tags=["voice"])
def text_to_speech(req: TtsRequest) -> TtsResponse:
    """Convert text to speech using Sarvam TTS.

    Simple endpoint for speaking AI responses without the full voice-chat loop.
    """
    audio_bytes = sarvam.generate_speech(
        text=req.text,
        language_code=req.language,
        speaker=req.speaker,
        pace=req.pace,
    )
    if audio_bytes is None:
        raise HTTPException(
            status_code=502,
            detail="Text-to-speech failed. Check Sarvam API key.",
        )
    audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
    return TtsResponse(audio_base64=audio_b64)


@router.post("/stt", response_model=SttResponse, tags=["voice"])
async def speech_to_text(
    audio: UploadFile = File(..., description="Audio file to transcribe."),
) -> SttResponse:
    """Transcribe audio using Sarvam STT.

    Auto-detects the spoken language — useful since users might switch between
    Telugu and English mid-sentence.
    """
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file.")

    result = sarvam.transcribe_audio(audio_bytes, filename=audio.filename or "audio.wav")
    if result is None:
        raise HTTPException(
            status_code=502,
            detail="Speech-to-text failed. Check Sarvam API key and audio format.",
        )
    transcript, language = result
    return SttResponse(transcript=transcript, language=language)
