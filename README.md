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

## My Portfolio

Trader **My Portfolio** (`/portfolio`, also on the Dashboard) shows live open positions across every market provider:

| Filter | Markets |
| --- | --- |
| Internal | LMSR demo catalog (`mkt-*`) |
| Polymarket | `poly-*` / CLOB virtual fills |
| Kalshi | `kalshi-*` live / demo fills |
| S&P 500 | `sp500-*` 0DTE / weekly stock events |

Features:

- Mark-to-market P&L with live price ticks (WebSocket when available)
- Instant updates when you place or close a bet (`new_position` / `portfolio_update`)
- Tenor filters (All / 0DTE / Weekly) and provider filters
- Challenge-rule warnings when you approach max drawdown or daily loss limits
- Empty state: **“You have no open positions yet”** with a link to Browse markets
- Loading skeletons while portfolio data refreshes

API: `GET /api/trader/portfolio` (BFF → FastAPI when `PP_API_URL` is set; otherwise in-memory Next.js store).

## Manual issuance emails

When a Prop Firm Admin clicks **Issue Account** on `/admin/accounts`:

1. `POST /api/admin/accounts/provision` runs `provisionNewAccount` (Prisma account + challenge config + credentials)
2. With `send_credentials_email: true` (default), `sendProvisioningEmails` sends:
   - **Trader email** — subject `Your [Firm] Prediction Markets Account is Ready` (credentials / magic link, model type, challenge rules, login + dashboard links, support contact)
   - **Optional firm admin copy** — confirmation to the issuing admin (non-fatal if it fails)
3. Delivery uses Resend when `RESEND_API_KEY` is set; otherwise emails are logged to the server console (`lib/email/send.ts`)

Disable with `PROVISIONING_EMAILS_ENABLED=false`. Support address: `SUPPORT_EMAIL` / `SUPPORT_CONTACT`.

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
| `/api/portfolio` | GET | Legacy portfolio snapshot |
| `/api/trader/portfolio` | GET | Live open positions + summary (My Portfolio) |
| `/api/journal` | GET, POST | Trading journal |
| `/api/tenant` | GET | Public tenant config |
| `/api/polymarket/markets` | GET | Polymarket CLOB listings |
| `/api/polymarket/search` | GET | Search Polymarket markets |
| `/api/platform/integrations/polymarket` | GET | Polymarket integration health |
| `/api/platform/integrations/alpaca` | GET | Alpaca Market Data (IEX) health |
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

**Prop Firm Admin UI:** `/admin/accounts` — issue evaluation accounts; `/admin/provisioning` — firm defaults; `/admin/challenge-templates` — per-model-type challenge rules.

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

### Per-Model-Type Challenge Rules

Each prop firm can save a **challenge template** per evaluation model (`1step`, `2step`, `3step`, `instant`). Templates drive profit targets, daily/max drawdown, max bet size, consistency, min trading days, and optional JSON policies.

| Surface | Path |
| --- | --- |
| Firm Admin editor | `/admin/challenge-templates` |
| Issue New Account prefill | `/admin/accounts` → Issue New Account |
| Super Admin audit (read-only) | `/platform/firms/[id]` |
| APIs | `GET/PUT/DELETE /api/admin/challenge-templates[/{modelType}]` |

**Resolution order at issuance** (highest priority last):

1. Platform preset for the model type  
2. Firm program defaults (`Tenant.program`) and Prop Firm Settings  
3. Saved `PropFirmChallengeTemplate` for that model (when present)  
4. Per-account overrides (`custom_rules` on webhook, or edited fields on manual issuance)

Webhook purchases and manual issuance share the same fallback. Max drawdown must be **greater than** daily drawdown. Issued accounts register those limits on the in-process risk engine (`lib/engine/risk.ts`); Python trading uses the FastAPI risk engine with the same template wiring.

### Seed test traders (FastAPI)

Idempotent script that creates **3–5 test traders for every prop firm**, distributes model types evenly (`1step` / `2step` / `3step` / `instant`), rotates market providers (internal / Kalshi / Polymarket / S&P 500), applies each firm’s `PropFirmChallengeTemplate`, provisions via `provision_new_account`, and places sample positions so each trader’s **Portfolio** has visible open bets.

```bash
cd backend
pip install -r requirements.txt   # once
# Ensure Postgres is up and base tenants exist (API boot runs seed_database)

PYTHONPATH=. python scripts/seed_test_traders.py
PYTHONPATH=. python scripts/seed_test_traders.py --traders-per-firm 5 --with-positions
PYTHONPATH=. python scripts/seed_test_traders.py --tenant-slug apex
PYTHONPATH=. python scripts/seed_test_traders.py --no-positions
PYTHONPATH=. python scripts/seed_test_traders.py --replace   # reset seed accounts
```

**What to verify after a run**

| Check | Expected |
| --- | --- |
| Traders per firm | 3–5 (`--traders-per-firm`, clamped) |
| Model types | Even mix of `1step`, `2step`, `3step`, `instant` |
| Accounts | Each email has a provisioned `TraderDemoAccount` + challenge config |
| Portfolio | Sample positions on the in-memory trading session (provider-tagged) |

Emails are **not** sent for seed traders (`send_credentials_email=False`). Use Prop Firm Admin → Issue Account to exercise the welcome-email path.

See `backend/scripts/README.md` for flags, idempotency keys, and login notes.

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

## S&P 500 Stock Prediction Markets (0DTE & Weekly) – MVP

PropPredict can provision evaluation accounts against **dynamically generated S&P 500 stock prediction markets** (same-day 0DTE and weekly strikes). Traders bet Yes/No on whether a name closes above a strike; P&L is **virtual only** and flows through the same challenge risk engine as Kalshi/internal markets.

| Piece | Location |
| --- | --- |
| Market provider | `provider = "sp500_dynamic"` on challenge configs / sold accounts |
| Spot + bars (MVP) | [Alpaca Market Data IEX](https://alpaca.markets/docs/api-references/market-data-api/) — paper keys |
| Generator | `backend/services/sp500_market_generator.py`, `lib/sp500/` |
| Live quotes | Alpaca REST (viewed tickers) + optional IEX WebSocket bridge |
| EOD resolution | `backend/services/sp500_resolution_service.py` (daily close → settle LMSR) |
| Trader UI | Dashboard **S&P 500 Markets** section |
| Admin | Issue New Account → provider **S&P 500 Dynamic**; Sold Accounts filter/badge |
| Analytics | Super Admin overview — most-traded underlyings |

**Flow:** purchase/webhook or admin issue (`provider=sp500_dynamic`) → ticker allowlist on the demo session → live `sp500-{TICKER}-{0dte\|weekly}-…` markets → stake/exposure rules enforced → EOD resolve.

Env (paper keys recommended for MVP):

```bash
ALPACA_API_KEY=PK...
ALPACA_SECRET_KEY=...
# Optional: PP_ALPACA_FEED=iex  PP_ALPACA_WS_MAX_SYMBOLS=30
```

See `backend/integrations/alpaca/README.md` for free-key setup and endpoint links.

> **Scaling note:** Alpaca IEX is for the MVP. **Polygon.io will replace Alpaca when scaling many accounts** (full SIP, higher rate limits).

## Alpaca integration (S&P 500 / IEX)

Optional Python package at `backend/integrations/alpaca/` plus the Next.js path in `lib/sp500/`:

- REST + WebSocket client (`AlpacaClient`, `AlpacaStockStream`)
- Redis-cached service façade (`AlpacaService`)
- Super Admin health: `/platform/integrations` and `GET /api/platform/integrations/alpaca`
- Docs: https://alpaca.markets/docs/ · https://alpaca.markets/docs/api-references/market-data-api/

## License

Proprietary — thehumanoidgroup
