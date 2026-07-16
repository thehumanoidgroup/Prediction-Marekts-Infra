# PropPredict

A professional, white-label **prediction markets platform for prop firms**. Each firm gets a fully branded trading environment — evaluation challenges, prediction market trading, equity curves, a trading journal, and leaderboards — from a **single Vercel deployment**.

## Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 15 (App Router, React 19) |
| Styling | Tailwind CSS v4, shadcn/ui conventions, Recharts |
| Database | PostgreSQL via Prisma (`Tenant`, `User`) |
| Trading engine | In-memory LMSR market maker (`lib/store.ts`) |
| Polymarket | TypeScript CLOB client (`lib/polymarket/`) |
| Auth | JWT (jose) + bcrypt password hashing |
| Deployment | **Vercel** — one repo, one build, no separate backend |

## Project structure

```
.
├── app/                     # Next.js App Router pages and API route handlers
├── components/              # UI, dashboard, markets, admin, platform
├── hooks/                   # Client data hooks
├── lib/                     # Store, auth, db, polymarket, kalshi, tenants
├── services/                # Business logic layer
├── types/                   # Shared TypeScript types
├── prisma/schema.prisma     # Database schema (Vercel deployment)
├── middleware.ts
├── package.json
└── .env.example
```

## Quick start

```bash
cp .env.example .env.local
# Set DATABASE_URL to a PostgreSQL connection string

npm install
npx prisma db push    # create tables
npm run dev           # http://localhost:3000
```

### Demo credentials (after first DB seed)

| Tenant | Trader | Admin |
| --- | --- | --- |
| `app` (default) | `trader@app.demo` | `admin@app.demo` |
| `apex` (`?tenant=apex`) | `trader@apex.demo` | `admin@apex.demo` |
| `nova` (`?tenant=nova`) | `trader@nova.demo` | `admin@nova.demo` |

Password for all demo users: `demo-password-123`

Super Admin: `super@proppredict.demo`

## Deploy to Vercel

1. Import this GitHub repository into Vercel
2. Set environment variables from `.env.example` (at minimum `SECRET_KEY` and `DATABASE_URL`)
3. Deploy — no additional backend service required

Recommended: connect [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres) or [Neon](https://neon.tech) for `DATABASE_URL`.

## API overview

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/health` | GET | Liveness check |
| `/api/auth/login` | POST | JWT login |
| `/api/auth/register` | POST | Trader signup |
| `/api/auth/me` | GET | Current user (Bearer token) |
| `/api/markets` | GET | Hybrid market list (`?source=all\|internal\|polymarket\|kalshi`) |
| `/api/markets/[id]` | GET | Single market |
| `/api/orders` | POST | Place order |
| `/api/portfolio` | GET | Portfolio snapshot |
| `/api/journal` | GET, POST | Trading journal |
| `/api/tenant` | GET | Public tenant config |
| `/api/polymarket/markets` | GET | Polymarket CLOB listings |
| `/api/polymarket/search` | GET | Search Polymarket markets |
| `/api/platform/integrations/polymarket` | GET | Polymarket integration health |
| `/api/kalshi/status` | GET | Kalshi integration health |
| `/api/orders/preview` | POST | Pre-trade risk check |
| `/api/admin/accounts/provision` | POST | Firm admin Kalshi demo issuance |

### Account provisioning

Automated prop firm account provisioning: sold evaluations, encrypted credentials, challenge rules, emails, and audit logging.

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/provisioning/webhook` | POST | Per-firm API key | Checkout webhook (rate-limited) |
| `/api/provisioning/manual` | POST | Super Admin JWT | Manual account creation |
| `/api/provisioning/accounts` | GET | Super Admin JWT | List provisioned accounts |
| `/api/provisioning/accounts/[id]` | GET | Super Admin JWT | Account detail |
| `/api/provisioning/jobs/[id]` | GET | Super Admin JWT | Async job status |
| `/api/admin/provisioning-settings` | GET, PATCH | Prop Firm Admin | Default rules per model type |

**Super Admin UI:** `/platform/provisioning` — manual provisioning, audit log, recent accounts.

**Prop Firm Admin UI:** `/admin/accounts` — issue Kalshi demo accounts; `/admin/provisioning` — firm defaults.

```bash
# Example webhook (after npx prisma db push and seed)
curl -X POST https://your-app.vercel.app/api/provisioning/webhook \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ppk_..." \
  -d '{
    "prop_firm_id": "<tenant-uuid>",
    "trader_email": "buyer@example.com",
    "model_type": "2step",
    "account_size": "100K",
    "custom_rules": { "profitTarget": 9 }
  }'
```

Key environment variables:

| Variable | Purpose |
| --- | --- |
| `CREDENTIALS_ENCRYPTION_KEY` | AES-256-GCM encryption for stored login credentials (required in production) |
| `RESEND_API_KEY` | Provisioning notification emails |
| `PROVISIONING_ASYNC` | Enqueue provisioning instead of inline processing |
| `PROVISIONING_WEBHOOK_RATE_LIMIT` | Max webhook requests per window (default 60/min) |

See `lib/provisioning/README.md` for the full provisioning architecture.

## Multi-tenancy

Tenant resolution order (see `middleware.ts`):

1. `?tenant=<id>` query param (persisted to cookie)
2. Subdomain (`apex.yourdomain.com`)
3. `pp-tenant` cookie
4. Default tenant (`proppredict`)

## Polymarket integration

Read-only Polymarket CLOB listings work out of the box. Optional env vars for trading credentials:

- `POLYMARKET_API_KEY`, `POLYMARKET_API_SECRET`, `POLYMARKET_API_PASSPHRASE`
- `POLYMARKET_PRIVATE_KEY`

## Development

```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run typecheck  # TypeScript check
npm test           # Provisioning unit tests (Vitest)
npx prisma studio  # Browse database
```

## Kalshi integration

Kalshi market listings and demo account issuance run **in the same Next.js deployment**:

- **Markets** — `GET /api/markets?source=kalshi` fetches public Kalshi data via `lib/kalshi/`
- **Demo accounts** — Firm admins issue from **Admin → Accounts** or `POST /api/admin/accounts/provision` (Prisma + in-process risk engine)
- **Purchase webhook** — `POST /api/provisioning/webhook` with `custom_rules.provider: "kalshi"` if desired

Optional env vars: `PP_KALSHI_BASE_URL`, `PP_KALSHI_API_KEY`, `PP_KALSHI_API_SECRET`, `KALSHI_CACHE_TTL_SECONDS`.

## Alpaca integration (S&P 500 / IEX)

Optional Python backend package at `backend/integrations/alpaca/` for free-tier IEX stock data:

- REST + WebSocket client (`AlpacaClient`, `AlpacaStockStream`)
- Redis-cached service façade (`AlpacaService`)
- Env: `ALPACA_API_KEY`, `ALPACA_SECRET_KEY` (paper keys for MVP)

Docs: https://alpaca.markets/docs/api-references/market-data-api/ — replace with Polygon.io when scaling.

## License

Proprietary — thehumanoidgroup
