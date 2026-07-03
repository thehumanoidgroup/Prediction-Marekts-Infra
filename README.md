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
├── app/
│   ├── (platform)/          # Dashboard, markets, admin, platform pages
│   └── api/                 # All backend endpoints (Route Handlers)
├── components/              # UI, dashboard, markets, admin, platform
├── hooks/                   # Client data hooks
├── lib/                     # Store, auth, db, polymarket, tenants
├── services/                # Business logic layer
├── types/                   # Shared TypeScript types
├── prisma/schema.prisma     # Database schema
├── middleware.ts            # Tenant resolution (query → subdomain → cookie)
├── package.json
├── next.config.ts
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
| `/api/markets` | GET | Hybrid market list (`?source=all\|internal\|polymarket`) |
| `/api/markets/[id]` | GET | Single market |
| `/api/orders` | POST | Place order |
| `/api/portfolio` | GET | Portfolio snapshot |
| `/api/journal` | GET, POST | Trading journal |
| `/api/tenant` | GET | Public tenant config |
| `/api/polymarket/markets` | GET | Polymarket CLOB listings |
| `/api/polymarket/search` | GET | Search Polymarket markets |
| `/api/platform/integrations/polymarket` | GET | Integration health |

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
npx prisma studio  # Browse database
```

## License

Proprietary — thehumanoidgroup
