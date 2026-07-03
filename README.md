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
│       │   └── routes/        # auth, tenants (theming), health, ws
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
