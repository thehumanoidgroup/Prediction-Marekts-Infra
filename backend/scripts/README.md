# Backend scripts

Idempotent maintenance / seed utilities for the FastAPI trading backend.

## Seed test traders

Creates 3–5 demo traders per prop firm with evenly distributed challenge model
types (`1step`, `2step`, `3step`, `instant`), applies each firm’s
`PropFirmChallengeTemplate`, provisions via `provision_new_account`, and
optionally places sample positions for the Portfolio view across **internal**,
**Kalshi**, **Polymarket**, and **S&P 500** providers (provider-tagged virtual
fills + LMSR where applicable).

```bash
cd backend
pip install -r requirements.txt

# Ensure base tenants exist (development API boot runs seed_database), then:
PYTHONPATH=. python scripts/seed_test_traders.py

# Options
PYTHONPATH=. python scripts/seed_test_traders.py --traders-per-firm 5
PYTHONPATH=. python scripts/seed_test_traders.py --tenant-slug apex --with-positions
PYTHONPATH=. python scripts/seed_test_traders.py --no-positions
PYTHONPATH=. python scripts/seed_test_traders.py --replace   # reset existing seed accounts

# Local verification (SQLite — no Postgres required):
PP_DATABASE_URL=sqlite+aiosqlite:///./verify_seed.db \
  PYTHONPATH=. python3 scripts/verify_seed_portfolio.py
```

### Idempotency

- Emails are stable: `test-trader-{n}-{model}@{firm-slug}.seed.proppredict.com`
- Unique keys: `(tenant_id, email)` on users, `(tenant_id, user_id)` on trader demo accounts
- Re-runs skip `provision_new_account` when the seed email already has a demo account
  (avoids wiping in-memory positions via session reset)
- Sample positions are only placed when the trader session has none
- `--replace` re-provisions balances/config for those seed emails

### Login

Seeded traders use the same flow as other provisioned accounts. With
`--replace` / first create under `IssuanceSource.MANUAL`, temporary credentials
are generated but **not emailed** (`send_credentials_email=False`). Prefer the
firm admin issuance UI or set a known password in local DB when you need UI login.
To exercise welcome emails, use **Prop Firm Admin → Issue Account** (see root README).
