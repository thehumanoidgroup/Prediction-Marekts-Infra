from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, loaded from environment / .env.

    Every value has a sane local-dev default; docker-compose and production
    override via environment variables.
    """

    model_config = SettingsConfigDict(env_file=".env", env_prefix="PP_", extra="ignore")

    app_name: str = "PropPredict API"
    environment: str = "development"
    debug: bool = True

    # sqlite fallback keeps the scaffold runnable without Postgres;
    # docker-compose sets the real asyncpg URL.
    database_url: str = "sqlite+aiosqlite:///./proppredict.db"
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    cors_origins: list[str] = ["http://localhost:3000"]

    # Demo market ticker broadcast interval (seconds).
    ticker_interval_seconds: float = 2.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
