# PropPredict

A professional, white-label **prediction markets platform for prop firms**. Each firm gets a fully branded trading environment — evaluation challenges, real-money-style market trading, equity curves, a trading journal, and leaderboards — served from a single deployment.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app ships with deterministic seeded demo data, so every page is fully populated out of the box.

### Trying multi-tenancy locally

Tenants are resolved per request by the middleware. Locally, switch firms with the query param (persisted to a cookie) or the firm switcher in the top bar:

- `http://localhost:3000/?tenant=proppredict` — PropPredict (green)
- `http://localhost:3000/?tenant=apex` — Apex Forecast (sky blue)
- `http://localhost:3000/?tenant=nova` — Nova Markets (violet)

In production, each firm lives on its own subdomain (`apex.proppredict.com`), which the same middleware resolves automatically.

## Architecture

```
src/
├── middleware.ts             # Tenant resolution: query → subdomain → cookie → default
├── lib/
│   ├── tenants.ts            # White-label registry: branding, features, program rules
│   ├── tenant-server.ts      # Tenant accessor for server components
│   ├── tenant-request.ts     # Tenant accessor for API routes
│   ├── types.ts              # Domain model (markets, positions, challenges, journal…)
│   ├── store.ts              # Seeded in-memory store (stands in for Postgres + matching engine)
│   ├── services.ts           # Tenant-scoped service layer — the only data API pages use
│   ├── rng.ts                # Deterministic PRNG for reproducible demo data
│   └── format.ts             # Consistent number/date/price formatting
├── app/
│   ├── layout.tsx            # Injects tenant brand CSS variables on <html>
│   ├── (platform)/           # Dashboard, markets, portfolio, journal, leaderboard, settings
│   └── api/                  # REST endpoints: markets, orders, portfolio, leaderboard, tenant
└── components/
    ├── layout/               # App shell: sidebar, topbar, mobile bottom nav
    ├── charts/               # Recharts equity curve + market price charts
    ├── dashboard/            # Stat cards, objectives tracker, positions table, movers
    ├── markets/              # Market cards, filters, order ticket
    └── ui/                   # Primitives: card, button, badge, progress, sparkline, icons
```

### Multi-tenancy & white-labeling

- **Resolution** happens once per request in `src/middleware.ts` and is forwarded via the `x-tenant-id` header — server components, layouts, and API routes all read the same resolved tenant.
- **Branding** is applied as CSS variables (`--tenant-accent`, etc.) on `<html>`; every accent-colored element in the design system derives from those tokens, so a firm is re-skinned with zero component changes.
- **Feature flags** (`journal`, `leaderboard`, `payouts`) gate navigation and routes per firm.
- **Program rules** (profit target, loss limits, profit split, account sizes) come from the tenant config and drive the challenge objectives shown on the dashboard.

Adding a firm = one entry in the tenant registry. In production the registry would live in a database behind an admin panel; the `TenantConfig` shape is the contract the rest of the app codes against.

### Data layer

The in-memory store (`src/lib/store.ts`) is deliberately isolated behind a service layer (`src/lib/services.ts`): pages and API routes never touch storage directly, so swapping in Postgres and a real matching engine is a single-module change. Demo data is generated with a seeded PRNG, so charts, positions, and stats are stable across restarts and renders.

### API

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/markets` | GET | List markets (`?category=`, `?q=`, `?sort=volume\|movers\|closing`) |
| `/api/markets/:id` | GET | Market detail with price history |
| `/api/orders` | POST | Fill a market order `{ marketId, outcome, side, shares }` |
| `/api/portfolio` | GET | Account, enriched positions, and trade statistics |
| `/api/leaderboard` | GET | Tenant leaderboard |
| `/api/tenant` | GET | Resolved tenant config |

All endpoints are tenant-scoped via the middleware.

## Stack

- **Next.js 15** (App Router, React 19, server components)
- **Tailwind CSS v4** (CSS-variable theme tokens for white-labeling)
- **Recharts** for equity and probability charts
- **TypeScript** end to end

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (includes type checking) |
| `npm run start` | Serve the production build |
| `npm run typecheck` | Type-check without emitting |
