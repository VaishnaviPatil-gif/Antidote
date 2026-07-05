"""Application configuration, loaded from environment / .env.

The Gemini API key lives here and ONLY here — server-side. It is never
serialised into a response or exposed to the frontend.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed settings sourced from environment variables / a local .env file."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore"
    )

    # Secret — server-side only. Empty => run in safe-fallback mode (no Gemini).
    gemini_api_key: str | None = None

    # Sarvam AI key — server-side only. Empty => TTS/STT disabled (voice chat
    # won't work, but the rest of the app is unaffected).
    sarvam_api_key: str | None = None

    # Default Sarvam TTS voice. MUST be a bulbul:v3 speaker (priya, neha, pooja,
    # kavya, shreya, …). v2 voices like "anushka"/"meera" 400 on bulbul:v3.
    sarvam_speaker: str = "priya"

    # Gemini model used for both vision and text. flash-lite has a SEPARATE daily
    # free-tier quota bucket from flash, so switching here restores the AI brain
    # once flash is exhausted (the free tier is only ~20 requests/day/model).
    gemini_model: str = "gemini-2.5-flash-lite"

    # CORS origins (comma-separated). Defaults cover the Vite dev server AND the
    # Capacitor Android WebView origins (https://localhost, capacitor://localhost)
    # so AI calls work in the packaged APK, not only in the browser.
    allowed_origins: str = (
        "http://localhost:5173,https://localhost,capacitor://localhost,"
        "http://localhost:5174,http://127.0.0.1:5174"
    )

    # Secret used to sign hospital-dashboard auth tokens. Override in prod.
    auth_secret: str = "antidote-dev-secret-change-me"

    # Logging level.
    log_level: str = "INFO"

    # Confidence floor for snake identification (safety-first policy). Below this
    # the proxy refuses to name a species and assumes venomous — in a medical
    # emergency, no identification is safer than a wrong one.
    low_confidence: float = 0.9

    @property
    def origins(self) -> list[str]:
        """ALLOWED_ORIGINS parsed into a clean list."""
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def gemini_enabled(self) -> bool:
        """True when a key is configured (the proxy can call Gemini)."""
        return bool(self.gemini_api_key)

    @property
    def sarvam_enabled(self) -> bool:
        """True when a Sarvam key is configured (voice chat available)."""
        return bool(self.sarvam_api_key)


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()


settings = get_settings()
