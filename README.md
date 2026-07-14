# PropPredict

A professional, white-label **prediction markets platform for prop firms**. Each firm gets a fully branded trading environment — evaluation challenges, prediction market trading, equity curves, a trading journal, and leaderboards — served from a single deployment.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15 (App Router, React 19), Tailwind CSS v4, shadcn/ui conventions, Recharts |
| Backend | FastAPI (Python 3.12), SQLAlchemy 2 (async), Alembic |
| Database | PostgreSQL 17 (SQLite fallback for bare local dev) |
| Cache / Pub-Sub | Redis 7 |
| Real-time | WebSockets (per-tenant channels, Redis-backed fan-out) |
| Auth | JWT (bearer) with roles: `Trader`, `PropFirmAdmin`, `SuperAdmin` |
| Deployment | Docker + docker-compose |

## Project structure

```
.
├── docker-compose.yml         # postgres + redis + backend + frontend
├── .env.example               # copy to .env
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic/               # database migrations
│   └── app/
│       ├── main.py            # FastAPI app factory, CORS, lifespan (seed, ticker)
│       ├── core/
│       │   ├── config.py      # pydantic-settings (PP_* env vars)
│       │   └── security.py    # JWT issue/verify, password hashing
│       ├── db/
│       │   ├── session.py     # async engine + request-scoped sessions
│       │   └── seed.py        # idempotent dev seed (tenants + demo users)
│       ├── models/            # SQLAlchemy: Tenant, User (+ roles)
│       ├── schemas/           # Pydantic request/response models
│       ├── api/
│       │   ├── deps.py        # tenant resolution, current user, role guards
│       │   └── routes/        # auth, tenants, trading, polymarket, health, ws
│       ├── integrations/
│       │   ├── polymarket/    # py-clob-client-v2 wrapper, service, caching
│       │   └── kalshi/        # Trading API client, demo account market data
│       ├── services/
│       │   └── account_provisioning.py  # Kalshi demo account issuance
│       └── ws/
│           ├── manager.py     # tenant-aware WebSocket fan-out via Redis pub/sub
│           └── ticker.py      # demo market price broadcaster
└── frontend/
    ├── Dockerfile
    ├── components.json        # shadcn/ui configuration
    └── src/
        ├── middleware.ts      # tenant resolution: query → subdomain → cookie
        ├── lib/               # tenant registry, domain types, services, formatting
        ├── app/
        │   ├── layout.tsx     # injects tenant brand CSS variables on <html>
        │   ├── (platform)/    # dashboard, markets, portfolio, journal, leaderboard, settings
        │   └── api/           # demo REST endpoints (markets, orders, portfolio…)
        └── components/        # ui primitives, app shell, charts, dashboard, markets
```

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:8000](http://localhost:8000) · interactive docs at [/docs](http://localhost:8000/docs)
- Postgres: `localhost:5432` · Redis: `localhost:6379`

On first boot the backend creates tables and seeds two demo firms (`app`, `apex`) with one user per role.

## Local development (without Docker)

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Without `PP_DATABASE_URL` set, the backend falls back to a local SQLite file so it runs with zero infrastructure. Point it at Postgres with:

```bash
export PP_DATABASE_URL=postgresql+asyncpg://proppredict:proppredict@localhost:5432/proppredict
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Demo credentials

Seeded in development (password for all: `demo-password-123`):

| Role | Email | Tenant |
| --- | --- | --- |
| Trader | `trader@app.proppredict.com` | PropPredict (`app`) |
| PropFirmAdmin | `admin@app.proppredict.com` | PropPredict (`app`) |
| SuperAdmin | `root@proppredict.com` | platform-wide |
| Trader | `trader@apex.proppredict.com` | Apex Forecast (`apex`) |
| PropFirmAdmin | `admin@apex.proppredict.com` | Apex Forecast (`apex`) |

## Multi-tenancy & white-labeling

- **Backend:** every request resolves a tenant from the `X-Tenant-Slug` header (or the subdomain in production) via the `get_current_tenant` dependency. JWTs embed the tenant id; a token minted for one firm is rejected on another firm's domain. All tenant-owned tables carry a `tenant_id` foreign key.
- **Theming:** `GET /api/v1/tenants/current` returns the firm's white-label config (colors, logo, name, feature flags, program rules). The frontend applies branding as CSS variables on `<html>`, so the entire UI re-skins per firm with zero component changes. Firm admins update their theme via `PATCH /api/v1/tenants/current`.
- **Roles:** `Trader` (trades markets), `PropFirmAdmin` (manages one firm's traders, branding, and program), `SuperAdmin` (onboards firms platform-wide). Enforced by the `require_roles(...)` dependency; SuperAdmin implicitly passes every check.

## API overview

| Endpoint | Method | Auth | Description |
| --- | --- | --- | --- |
| `/health` | GET | — | Liveness probe |
| `/api/v1/auth/register` | POST | — | Trader signup (tenant-scoped) |
| `/api/v1/auth/login` | POST | — | Login → JWT |
| `/api/v1/auth/me` | GET | any role | Current user |
| `/api/v1/tenants/current` | GET | — | White-label config for the requesting firm |
| `/api/v1/tenants/current` | PATCH | PropFirmAdmin | Update branding / features / program |
| `/api/v1/tenants` | GET/POST | SuperAdmin | List / onboard firms |
| `/api/polymarket/markets` | GET | — | List Polymarket markets (paginated, filterable) |
| `/api/polymarket/markets/{id}` | GET | — | Single Polymarket market |
| `/api/polymarket/search` | GET | — | Search Polymarket markets (`q` required) |
| `/api/polymarket/status` | GET | — | Polymarket CLOB + cache health |
| `/api/kalshi/markets` | GET | — | List Kalshi markets (paginated) |
| `/api/kalshi/status` | GET | — | Kalshi API + cache health |
| `/api/v1/webhooks/accounts` | POST | — | Auto-provision evaluation account (purchase webhook) |
| `/api/v1/admin/accounts/provision` | POST | PropFirmAdmin | Manually issue evaluation account |
| `/api/v1/trading/orders/preview` | POST | Trader | Pre-trade risk check |
| `/ws/markets/{tenant_slug}` | WS | — | Real-time price ticks (per-tenant channel) |

## Real-time pipeline

`app/ws/ticker.py` broadcasts simulated price ticks through the same path production trades will take: **publisher → Redis pub/sub → every API replica → tenant's WebSocket clients**. Without Redis (bare local dev) fan-out degrades gracefully to in-process delivery.

## Migrations

```bash
cd backend
alembic revision --autogenerate -m "description"
alembic upgrade head
```

In development the app auto-creates tables on startup; production should rely on Alembic only.

## Polymarket integration

PropPredict can display live [Polymarket](https://polymarket.com) prediction markets alongside internal LMSR markets. The integration uses the official [`py-clob-client-v2`](https://github.com/Polymarket/py-clob-client-v2) SDK, wrapped for async use and Redis caching.

**Detailed docs:** [`backend/integrations/polymarket/README.md`](backend/integrations/polymarket/README.md)

### Enable

1. Dependency is already in `backend/requirements.txt` (`py-clob-client-v2`).
2. Set environment variables (read-only mode works with defaults only):

```bash
PP_POLYMARKET_HOST=https://clob.polymarket.com
PP_POLYMARKET_CHAIN_ID=137
PP_REDIS_URL=redis://localhost:6379/0   # recommended for caching
```

Optional credentials for authenticated trading (L2):

```bash
PP_POLYMARKET_PRIVATE_KEY=0x...
PP_POLYMARKET_API_KEY=...
PP_POLYMARKET_API_SECRET=...
PP_POLYMARKET_API_PASSPHRASE=...
```

3. Restart the backend. Verify connectivity:

```bash
curl http://localhost:8000/api/polymarket/status
```

### Python SDK wrapper

```python
import asyncio
from integrations.polymarket import PolymarketClient, get_polymarket_service

async def main() -> None:
    # Low-level async client (wraps py-clob-client-v2)
    client = PolymarketClient.from_settings()
    page = await client.get_markets()
    print(len(page.data), "markets on first page")

    # High-level cached service
    service = get_polymarket_service()
    markets = await service.get_active_markets()
    print(len(markets), "active markets")

asyncio.run(main())
```

### REST examples

```bash
# List active markets (paginated)
curl "http://localhost:8000/api/polymarket/markets?active=true&page=1&pageSize=10"

# Search
curl "http://localhost:8000/api/polymarket/search?q=bitcoin"

# Single market
curl "http://localhost:8000/api/polymarket/markets/poly-0x..."
```

### Trader UI

- `/markets` — toggle **All Markets** / **Internal** / **Polymarket** (hybrid view is the default)
- `/dashboard` — hybrid preview section with the same three-way toggle
- `/platform/integrations` — Super Admin connection status (SuperAdmin)

Hybrid listings use `GET /api/v1/trading/markets?source=all` (default) and return per-source counts.

## Kalshi demo accounts

Prop firms can issue **Kalshi-linked virtual evaluation accounts** to traders. Each account gets a simulated bankroll, live Kalshi market prices, and the same risk engine used for internal LMSR markets (max bet size, drawdown, profit target, daily loss, etc.).

**Detailed docs:** [`backend/integrations/kalshi/README.md`](backend/integrations/kalshi/README.md)

### How it works

1. **Purchase webhook** — your prop firm website calls `POST /api/v1/webhooks/accounts` after checkout (optional `provider="kalshi"`, defaults to Kalshi).
2. **Provisioning** — the platform creates or updates the trader, links live Kalshi market tickers, applies challenge rules, and logs a `SoldAccount` audit row.
3. **Trader login** — the trader sees live Kalshi markets on the dashboard, places virtual bets at current prices, and challenge progress updates in real time.

Firm admins can also issue accounts manually from **Admin → Accounts** (`POST /api/v1/admin/accounts/provision`) with full challenge rule overrides.

### Webhook example

```bash
curl -X POST http://localhost:8000/api/v1/webhooks/accounts \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: apex" \
  -H "X-Webhook-Secret: your-webhook-secret" \
  -d '{
    "email": "trader@example.com",
    "provider": "kalshi",
    "account_size": 25000,
    "model_type": "1step",
    "external_order_id": "order-12345",
    "challenge_rules": { "profit_target_pct": 10, "max_daily_loss_pct": 5 }
  }'
```

Response includes `account_id`, `provider`, `kalshi_live_integration_enabled`, and `kalshi_market_tickers`.

### Manual issuance (Prop Firm Admin)

```bash
curl -X POST http://localhost:8000/api/v1/admin/accounts/provision \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: apex" \
  -d '{
    "email": "trader@example.com",
    "provider": "kalshi",
    "account_size": 50000,
    "model_type": "2step",
    "send_credentials_email": true
  }'
```

### Trader experience

- Dashboard shows a **Kalshi** badge and a **Kalshi Markets** section when `provider=kalshi`
- Virtual bets use live Kalshi prices; P&amp;L and equity curve update on each portfolio refresh
- Pre-trade warnings appear when an order would breach stake or exposure limits
- Challenge progress panel tracks profit target, drawdown, daily loss, and min trading days

### Environment

| Variable | Purpose |
| --- | --- |
| `PP_KALSHI_API_KEY` | Optional — Kalshi API key ID for authenticated endpoints |
| `PP_KALSHI_API_SECRET` | Optional — RSA private key PEM or file path |
| `PP_WEBHOOK_SECRET` | Optional — validates `X-Webhook-Secret` on purchase webhooks |
| `PP_REDIS_URL` | Recommended — caches Kalshi market listings and live prices |

Public market data works without API keys. Verify connectivity at `GET /api/kalshi/status` or **Platform → Integrations** in the Super Admin UI.
