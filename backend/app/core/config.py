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

    # Polymarket CLOB (py-clob-client-v2)
    polymarket_host: str = "https://clob.polymarket.com"
    polymarket_chain_id: int = 137
    polymarket_private_key: str | None = None
    polymarket_api_key: str | None = None
    polymarket_api_secret: str | None = None
    polymarket_api_passphrase: str | None = None
    polymarket_request_timeout_seconds: float = 30.0
    polymarket_use_server_time: bool = False
    polymarket_retry_on_error: bool = False
    polymarket_cache_ttl_seconds: float = 300.0
    polymarket_list_cache_ttl_seconds: float = 600.0
    polymarket_max_fetch_pages: int | None = 10
    polymarket_rate_limit_per_minute: int = 60
    polymarket_rate_limit_burst: int = 10
    polymarket_max_retries: int = 3
    polymarket_retry_backoff_seconds: float = 0.5


@lru_cache
def get_settings() -> Settings:
    return Settings()
