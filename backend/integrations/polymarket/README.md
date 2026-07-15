# Polymarket integration

PropPredict integrates with [Polymarket](https://polymarket.com) via the official
[`py-clob-client-v2`](https://github.com/Polymarket/py-clob-client-v2) Python SDK.
Normalized Polymarket markets can be displayed alongside internal LMSR markets in
the trader dashboard.

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  FastAPI routes     │────▶│  PolymarketService   │────▶│  PolymarketClient   │
│  /api/polymarket/*  │     │  (cache + normalize) │     │  (py-clob-client-v2)│
└─────────────────────┘     └──────────┬───────────┘     └──────────┬──────────┘
                                       │                            │
                                       ▼                            ▼
                              ┌────────────────┐          ┌──────────────────┐
                              │ Redis (opt.)   │          │ clob.polymarket  │
                              └────────────────┘          └──────────────────┘
```

| Module | Responsibility |
| --- | --- |
| `polymarket_client.py` | Thin async wrapper around the synchronous SDK (`asyncio.to_thread`) |
| `polymarket_service.py` | Market listing, search, normalization, Redis caching |
| `exceptions.py` | `PolymarketError`, `PolymarketApiError`, `PolymarketAuthError`, `PolymarketTimeoutError` |

## Enable the integration

### 1. Install dependencies

Already included in `backend/requirements.txt`:

```txt
py-clob-client-v2==1.0.2
```

### 2. Configure environment variables

All settings use the `PP_` prefix (see `app/core/config.py`):

| Variable | Default | Description |
| --- | --- | --- |
| `PP_POLYMARKET_HOST` | `https://clob.polymarket.com` | CLOB API host |
| `PP_POLYMARKET_CHAIN_ID` | `137` | Polygon mainnet chain id |
| `PP_POLYMARKET_PRIVATE_KEY` | — | Wallet key for L1/L2 auth (optional) |
| `PP_POLYMARKET_API_KEY` | — | L2 API key (optional) |
| `PP_POLYMARKET_API_SECRET` | — | L2 API secret (optional) |
| `PP_POLYMARKET_API_PASSPHRASE` | — | L2 API passphrase (optional) |
| `PP_POLYMARKET_REQUEST_TIMEOUT_SECONDS` | `30` | Per-request timeout |
| `PP_POLYMARKET_CACHE_TTL_SECONDS` | `300` | Single-market cache TTL |
| `PP_POLYMARKET_LIST_CACHE_TTL_SECONDS` | `600` | Full list cache TTL |
| `PP_POLYMARKET_MAX_FETCH_PAGES` | `10` | Max CLOB pagination pages per sync |
| `PP_REDIS_URL` | `redis://localhost:6379/0` | Redis for cross-process caching |

**Read-only market data** works with no credentials (SDK auth level **L0**).

**Trading** requires a wallet private key plus derived or configured API credentials (level **L2**).

Example `.env`:

```bash
PP_POLYMARKET_HOST=https://clob.polymarket.com
PP_POLYMARKET_CHAIN_ID=137
PP_REDIS_URL=redis://localhost:6379/0
# Optional — only needed for authenticated trading endpoints
# PP_POLYMARKET_PRIVATE_KEY=0x...
# PP_POLYMARKET_API_KEY=...
# PP_POLYMARKET_API_SECRET=...
# PP_POLYMARKET_API_PASSPHRASE=...
```

## REST API

Routes are registered at `/api/polymarket` (see `app/api/routes/polymarket.py`).

### `GET /api/polymarket/status`

Operator health check — CLOB latency, Redis cache, auth mode.

```bash
curl http://localhost:8000/api/polymarket/status
```

### `GET /api/polymarket/markets`

List normalized markets with pagination and filters.

| Query param | Default | Description |
| --- | --- | --- |
| `category` | `all` | `crypto`, `stocks`, `forex`, … |
| `status` | — | `open`, `closing_soon`, `resolved` |
| `active` | `false` | Only markets accepting orders |
| `sort` | `volume` | `volume`, `closing`, `newest`, `movers` |
| `page` | `1` | Page number (1-based) |
| `pageSize` | `20` | Items per page (max 100) |
| `refresh` | `false` | Bypass cache |

```bash
curl "http://localhost:8000/api/polymarket/markets?active=true&page=1&pageSize=10"
```

### `GET /api/polymarket/markets/{market_id}`

Fetch one market by internal id (`poly-0x…`) or raw condition id.

```bash
curl http://localhost:8000/api/polymarket/markets/poly-0xabc123...
```

### `GET /api/polymarket/search`

Search markets by question, slug, category, or outcome labels.

```bash
curl "http://localhost:8000/api/polymarket/search?q=bitcoin&category=crypto"
```

## Python SDK wrapper usage

### Low-level client (`PolymarketClient`)

```python
import asyncio
from integrations.polymarket import PolymarketClient

async def main() -> None:
    client = PolymarketClient()  # public read-only (L0)

    page = await client.get_markets()
    print(f"Fetched {len(page.data)} markets")

    market = await client.get_market(page.data[0]["condition_id"])
    print(market["question"])

asyncio.run(main())
```

### From application settings

```python
from integrations.polymarket import PolymarketClient

client = PolymarketClient.from_settings()
```

### Authenticated client (trading)

```python
client = PolymarketClient(
    private_key="0x...",
    api_key="...",
    api_secret="...",
    api_passphrase="...",
)

# Or derive API creds from the wallet:
await client.authenticate()
assert client.can_trade
```

### High-level service (`PolymarketService`)

```python
import asyncio
from integrations.polymarket import get_polymarket_service, normalize_polymarket_market

async def main() -> None:
    service = get_polymarket_service()

    markets = await service.get_all_markets()
    active = await service.get_active_markets()
    results = await service.search_markets("fed rate")
    one = await service.get_market_by_id("poly-0x...")

    status = await service.get_integration_status()
    print(status["healthy"], status["latencyMs"])

asyncio.run(main())
```

### Normalized market shape

`normalize_polymarket_market()` maps CLOB payloads into the same camelCase JSON
used by internal LMSR markets (`yesPrice`, `closesAt`, `history`, etc.) plus:

- `source`: `"polymarket"`
- `externalConditionId`
- `marketSlug`
- `acceptingOrders`
- `outcomes[]` with token prices

## Error handling

```python
from integrations.polymarket import (
    PolymarketApiError,
    PolymarketAuthError,
    PolymarketError,
    PolymarketTimeoutError,
)

try:
    await client.get_market("0x...")
except PolymarketAuthError:
    ...  # missing wallet / API credentials
except PolymarketApiError as exc:
    ...  # HTTP error from CLOB (exc.status_code)
except PolymarketTimeoutError:
    ...  # exceeded PP_POLYMARKET_REQUEST_TIMEOUT_SECONDS
except PolymarketError:
    ...  # other integration failures
```

## Caching

- Full market lists and single markets are cached in **Redis** when `PP_REDIS_URL` is reachable.
- Falls back to an in-process TTL cache when Redis is unavailable (local dev).
- Pass `refresh=true` on REST list/search endpoints to bypass cache.
- Call `await service.invalidate_cache()` to clear all Polymarket keys.

## Frontend

The trader UI reads Polymarket data via Next.js BFF routes:

- `GET /api/polymarket/markets`
- `GET /api/polymarket/search`
- `GET /api/polymarket/markets/[id]`

Toggle **Internal Markets** / **Polymarket Markets** on `/markets` and the dashboard.

Super Admin operators can view connection status at `/platform/integrations`.

## Testing

```bash
cd backend
pytest tests/test_polymarket_client.py tests/test_polymarket_service.py tests/test_polymarket_api.py -q
```

Tests mock the SDK and Redis — no live API keys required.

## TypeScript / viem (future)

On-chain wallet signing for a future TypeScript service should use
[`viem`](https://viem.sh) with `chainId: 137` (Polygon), matching
`PP_POLYMARKET_CHAIN_ID`. This Python package remains the source of truth for
CLOB market data and order signing via `py-clob-client-v2`.
