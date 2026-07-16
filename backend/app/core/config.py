from functools import lru_cache
import os
from typing import Any

from pydantic import model_validator
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

    # WebSocket limits and broadcast batching.
    ws_max_connections_per_tenant: int = 500
    ws_connection_rate_per_minute: int = 60
    ws_message_rate_per_minute: int = 120
    ws_broadcast_batch_ms: float = 300.0
    ws_min_price_delta: float = 0.005

    # External live data ingestion (sports/politics/crypto polling).
    ingestion_enabled: bool = True
    ingestion_interval_seconds: float = 15.0
    ingestion_providers: list[str] = ["sports", "polymarket", "kalshi"]

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

    # Kalshi Trading API (httpx + RSA-PSS auth)
    kalshi_base_url: str = "https://api.elections.kalshi.com/trade-api/v2"
    kalshi_demo_base_url: str = "https://demo-api.kalshi.co/trade-api/v2"
    kalshi_use_demo: bool = False
    kalshi_api_key: str | None = None
    kalshi_api_secret: str | None = None
    kalshi_request_timeout_seconds: float = 30.0
    kalshi_cache_ttl_seconds: float = 300.0
    kalshi_list_cache_ttl_seconds: float = 600.0
    kalshi_price_cache_ttl_seconds: float = 30.0
    kalshi_max_fetch_pages: int | None = 10
    kalshi_rate_limit_per_minute: int = 60
    kalshi_max_retries: int = 3
    kalshi_retry_backoff_seconds: float = 0.5

    # Alpaca Market Data API (IEX free tier — paper keys for MVP)
    # Docs: https://alpaca.markets/docs/api-references/market-data-api/
    # Replace with Polygon.io client when scaling.
    alpaca_api_key: str | None = None
    alpaca_secret_key: str | None = None
    alpaca_data_base_url: str = "https://data.alpaca.markets/v2"
    alpaca_iex_stream_url: str = "wss://stream.data.alpaca.markets/v2/iex"
    alpaca_feed: str = "iex"
    alpaca_request_timeout_seconds: float = 30.0
    alpaca_rate_limit_per_minute: int = 180
    alpaca_max_retries: int = 3
    alpaca_retry_backoff_seconds: float = 0.5
    alpaca_cache_ttl_seconds: float = 60.0
    alpaca_price_cache_ttl_seconds: float = 15.0
    alpaca_list_cache_ttl_seconds: float = 86_400.0
    alpaca_bars_cache_ttl_seconds: float = 3_600.0
    alpaca_ws_max_symbols: int = 30

    # S&P 500 dynamic market generator (Alpaca IEX MVP).
    # Alpaca used for MVP. Will switch to Polygon for scale.
    sp500_generator_enabled: bool = True
    sp500_generator_interval_seconds: float = 86_400.0
    # Cap tickers processed per daily run (free-tier rate limits).
    sp500_generator_ticker_limit: int | None = 50
    # Run shortly after the loop starts when True (useful in development).
    sp500_generator_run_on_startup: bool = False

    # Account provisioning
    provisioning_email_enabled: bool = True
    webhook_secret: str | None = None
    trader_login_base_url: str = "http://localhost:3000/login"

    @model_validator(mode="before")
    @classmethod
    def _load_unprefixed_kalshi_env(cls, data: Any) -> Any:
        """Accept ``KALSHI_API_KEY`` / ``KALSHI_API_SECRET`` without the ``PP_`` prefix."""
        if not isinstance(data, dict):
            return data
        if data.get("kalshi_api_key") is None and os.environ.get("KALSHI_API_KEY"):
            data["kalshi_api_key"] = os.environ["KALSHI_API_KEY"]
        if data.get("kalshi_api_secret") is None and os.environ.get("KALSHI_API_SECRET"):
            data["kalshi_api_secret"] = os.environ["KALSHI_API_SECRET"]
        if data.get("kalshi_use_demo") is None and os.environ.get("KALSHI_USE_DEMO", "").lower() in {
            "1",
            "true",
            "yes",
        }:
            data["kalshi_use_demo"] = True
        # Alpaca paper/live keys (unprefixed names requested for MVP).
        if data.get("alpaca_api_key") is None and os.environ.get("ALPACA_API_KEY"):
            data["alpaca_api_key"] = os.environ["ALPACA_API_KEY"]
        if data.get("alpaca_secret_key") is None and os.environ.get("ALPACA_SECRET_KEY"):
            data["alpaca_secret_key"] = os.environ["ALPACA_SECRET_KEY"]
        return data


@lru_cache
def get_settings() -> Settings:
    return Settings()
