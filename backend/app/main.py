"""Antidote+ backend — application entry point.

A deliberately thin FastAPI service whose only job is to proxy Gemini calls so
the API key stays server-side. Two AI endpoints under /api plus a /health
check. No database, no business logic beyond safe fallbacks.

Run (from the backend/ directory):
    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import settings
from .logging_config import configure_logging
from .routes import health, hospitals, identify, summarize, severity, auth, cases, voice_chat, test_sarvam

configure_logging(settings.log_level)
logger = logging.getLogger("antidote")

app = FastAPI(
    title="Antidote+ API",
    version=__version__,
    description="Thin Gemini proxy for the Antidote+ snakebite emergency app.",
)

# CORS — allow only the configured frontend origin(s).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Routes: /health at root; AI endpoints under /api.
app.include_router(health.router)
app.include_router(identify.router, prefix="/api")
app.include_router(summarize.router, prefix="/api")
app.include_router(hospitals.router, prefix="/api")
app.include_router(severity.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(cases.router, prefix="/api")
app.include_router(voice_chat.router, prefix="/api")
app.include_router(test_sarvam.router, prefix="/api")


@app.on_event("startup")
def _startup() -> None:
    logger.info(
        "Antidote+ API v%s started (gemini=%s, sarvam=%s, origins=%s)",
        __version__,
        settings.gemini_enabled,
        settings.sarvam_enabled,
        ",".join(settings.origins),
    )
