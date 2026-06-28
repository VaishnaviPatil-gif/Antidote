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

    # Gemini model used for both vision and text.
    gemini_model: str = "gemini-1.5-flash"

    # CORS origins (comma-separated) — the Vite dev server by default.
    allowed_origins: str = "http://localhost:5173"

    # Logging level.
    log_level: str = "INFO"

    # Confidence floor for snake identification.
    low_confidence: float = 0.6

    @property
    def origins(self) -> list[str]:
        """ALLOWED_ORIGINS parsed into a clean list."""
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def gemini_enabled(self) -> bool:
        """True when a key is configured (the proxy can call Gemini)."""
        return bool(self.gemini_api_key)


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()


settings = get_settings()
