# Kalshi integration

PropPredict integrates with [Kalshi](https://kalshi.com) via the official
[Trading API](https://docs.kalshi.com/). Normalized Kalshi markets can be
displayed alongside internal LMSR and Polymarket markets in the trader dashboard.

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  FastAPI routes     │────▶│  KalshiService       │────▶│  KalshiClient       │
│  /api/kalshi/*      │     │  (cache + normalize) │     │  (httpx + RSA auth) │
└─────────────────────┘     └──────────┬───────────┘     └──────────┬──────────┘
                                       │                            │
                                       ▼                            ▼
                              ┌────────────────┐          ┌──────────────────┐
                              │ Redis (opt.)   │          │ api.elections.   │
                              │ live prices    │          │ kalshi.com       │
                              └────────────────┘          └──────────────────┘
```

| Module | Responsibility |
| --- | --- |
| `kalshi_client.py` | Async httpx client, RSA-PSS signing, rate limiting, retries |
| `kalshi_service.py` | Market listing, search, normalization, Redis caching |
| `exceptions.py` | `KalshiError`, `KalshiApiError`, `KalshiAuthError`, `KalshiTimeoutError` |

## Enable the integration

### 1. Configure environment variables

PropPredict reads Kalshi settings with the `PP_` prefix (see `app/core/config.py`).
Bare `KALSHI_*` names are also accepted for convenience.

| Variable | Default | Description |
| --- | --- | --- |
| `PP_KALSHI_BASE_URL` | `https://api.elections.kalshi.com/trade-api/v2` | Production API root |
| `PP_KALSHI_DEMO_BASE_URL` | `https://demo-api.kalshi.co/trade-api/v2` | Demo API root |
| `PP_KALSHI_USE_DEMO` | `false` | Use demo environment |
| `PP_KALSHI_API_KEY` / `KALSHI_API_KEY` | — | API Key ID (UUID) |
| `PP_KALSHI_API_SECRET` / `KALSHI_API_SECRET` | — | RSA private key PEM or `.key` file path |
| `PP_KALSHI_REQUEST_TIMEOUT_SECONDS` | `30` | Per-request timeout |
| `PP_KALSHI_CACHE_TTL_SECONDS` | `300` | Single-market cache TTL |
| `PP_KALSHI_LIST_CACHE_TTL_SECONDS` | `600` | Full list cache TTL |
| `PP_KALSHI_PRICE_CACHE_TTL_SECONDS` | `30` | Live price / orderbook cache TTL |
| `PP_KALSHI_MAX_FETCH_PAGES` | `10` | Max pagination pages per sync |
| `PP_KALSHI_RATE_LIMIT_PER_MINUTE` | `60` | Outbound request rate limit |
| `PP_REDIS_URL` | `redis://localhost:6379/0` | Redis for cross-process caching |

**Public market data** (`get_markets`, `get_market`, `get_orderbook`) works with
**no credentials**.

**Authenticated endpoints** (portfolio, orders) require both API key id and the
RSA private key downloaded when the key was created. Kalshi signs each request
with RSA-PSS (SHA-256); `KALSHI_API_SECRET` is the PEM private key, not an HMAC
secret.

Example `.env`:

```bash
PP_KALSHI_BASE_URL=https://api.elections.kalshi.com/trade-api/v2
PP_REDIS_URL=redis://localhost:6379/0

# Optional — demo account
# PP_KALSHI_USE_DEMO=true
# KALSHI_API_KEY=a952bcbe-ec3b-4b5b-b8f9-11dae589608c
# KALSHI_API_SECRET=/path/to/kalshi-private.key
```

## REST API

Routes are registered at `/api/kalshi` (see `app/api/routes/kalshi.py`).

### `GET /api/kalshi/status`

Operator health check — API latency, Redis cache, auth mode.

```bash
curl http://localhost:8000/api/kalshi/status
```

### `GET /api/kalshi/markets`

List normalized markets with pagination and filters.

| Query param | Default | Description |
| --- | --- | --- |
| `category` | `all` | `crypto`, `stocks`, `economics`, … |
| `status` | — | `open`, `closing_soon`, `resolved` |
| `active` | `false` | Only markets accepting orders |
| `sort` | `volume` | `volume`, `closing`, `newest`, `movers` |
| `page` | `1` | Page number (1-based) |
| `pageSize` | `20` | Items per page (max 100) |
| `refresh` | `false` | Bypass cache |

```bash
curl "http://localhost:8000/api/kalshi/markets?active=true&page=1&pageSize=10"
```

### `GET /api/kalshi/markets/{market_id}`

Fetch one market by internal id (`kalshi-TICKER`) or raw ticker.

```bash
curl http://localhost:8000/api/kalshi/markets/kalshi-KXBTC-25DEC31
```

### `GET /api/kalshi/markets/{market_id}/orderbook`

Fetch cached order book (short TTL for live prices).

```bash
curl http://localhost:8000/api/kalshi/markets/kalshi-KXBTC-25DEC31/orderbook
```

### `GET /api/kalshi/search`

Search markets by title, ticker, or event ticker.

```bash
curl "http://localhost:8000/api/kalshi/search?q=bitcoin&category=crypto"
```

## Python usage

### Low-level client (`KalshiClient`)

```python
import asyncio
from integrations.kalshi import KalshiClient

async def main() -> None:
    client = KalshiClient()  # public read-only

    page = await client.get_markets(limit=10, status="open")
    print(f"Fetched {len(page.markets)} markets")

    ticker = page.markets[0]["ticker"]
    market = await client.get_market(ticker)
    orderbook = await client.get_orderbook(ticker)
    results = await client.search_markets("fed rate")

    await client.aclose()

asyncio.run(main())
```

### From application settings

```python
from integrations.kalshi import KalshiClient

client = KalshiClient.from_settings()
```

### Authenticated client

```python
client = KalshiClient(
    api_key="your-api-key-id",
    api_secret="-----BEGIN RSA PRIVATE KEY-----\n...",
)
assert client.is_authenticated
```

### High-level service (`KalshiService`)

```python
import asyncio
from integrations.kalshi import get_kalshi_service

async def main() -> None:
    service = get_kalshi_service()

    markets = await service.get_all_markets()
    active = await service.get_active_markets()
    results = await service.search_markets("election")
    one = await service.get_market_by_id("kalshi-KXBTC-25DEC31")
    price = await service.get_live_price("KXBTC-25DEC31")

    status = await service.get_integration_status()
    print(status["healthy"], status["latencyMs"])

asyncio.run(main())
```

### Normalized market shape

`normalize_kalshi_market()` maps Kalshi payloads into the same camelCase JSON
used by internal LMSR markets (`yesPrice`, `closesAt`, `history`, etc.) plus:

- `source`: `"kalshi"`
- `externalTicker`
- `eventTicker`, `seriesTicker`
- `acceptingOrders`
- `outcomes[]` with Yes/No prices

## Error handling

```python
from integrations.kalshi import (
    KalshiApiError,
    KalshiAuthError,
    KalshiError,
    KalshiRateLimitError,
    KalshiTimeoutError,
)

try:
    await client.get_market("KXBTC-25DEC31")
except KalshiAuthError:
    ...  # invalid API key / private key
except KalshiRateLimitError:
    ...  # HTTP 429 after retries
except KalshiApiError as exc:
    ...  # HTTP error (exc.status_code)
except KalshiTimeoutError:
    ...  # exceeded PP_KALSHI_REQUEST_TIMEOUT_SECONDS
except KalshiError:
    ...  # other integration failures
```

## Caching

Redis keys use the `pp:kalshi:` prefix:

| Key | TTL | Purpose |
| --- | --- | --- |
| `pp:kalshi:markets:all` | 600s | Full normalized list |
| `pp:kalshi:markets:active` | 300s | Active markets |
| `pp:kalshi:market:{ticker}` | 300s | Single market |
| `pp:kalshi:orderbook:{ticker}` | 30s | Order book snapshot |
| `pp:kalshi:price:{ticker}` | 30s | Live YES price |

Falls back to in-process TTL cache when Redis is unavailable.

## Testing

```bash
cd backend
pytest tests/test_kalshi_client.py tests/test_kalshi_service.py tests/test_kalshi_api.py -q
```

Tests mock httpx and Redis — no live API keys required.
