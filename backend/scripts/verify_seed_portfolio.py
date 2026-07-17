#!/usr/bin/env python3
"""Verify seed_test_traders end-to-end against a local SQLite DB.

Run from backend/::

    PP_DATABASE_URL=sqlite+aiosqlite:///./verify_seed.db \\
      PYTHONPATH=. python3 scripts/verify_seed_portfolio.py
"""

from __future__ import annotations

import asyncio
import os
import sys
from collections import Counter
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

os.environ.setdefault("PP_INGESTION_ENABLED", "false")
os.environ.setdefault("PP_SP500_GENERATOR_ENABLED", "false")
os.environ.setdefault("PP_SP500_RESOLUTION_ENABLED", "false")
os.environ.setdefault(
    "PP_DATABASE_URL",
    "sqlite+aiosqlite:///./verify_seed.db",
)

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.seed import seed_database
from app.db.session import SessionLocal, engine
from app.models import Base, Tenant, TraderDemoAccount, User
from app.runtime.store import get_trading_store
from scripts.seed_test_traders import MODEL_TYPES, run_seed


async def main() -> int:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as db:
        await seed_database(db)

    summaries = await run_seed(
        traders_per_firm=4,
        with_positions=True,
        replace_existing=True,
    )
    assert summaries, "run_seed returned no firms"
    print(f"Seeded {len(summaries)} firm(s)")

    store = get_trading_store()
    async with SessionLocal() as db:
        for summary in summaries:
            slug = summary["tenant"]
            traders = summary["traders"]
            print(f"\n[{slug}] traders={len(traders)}")
            assert 3 <= len(traders) <= 5

            models = Counter(t["model_type"] for t in traders)
            print(f"  model types: {dict(models)}")
            assert set(models) == set(MODEL_TYPES)

            tenant = (
                await db.execute(select(Tenant).where(Tenant.slug == slug))
            ).scalar_one()

            for row in traders:
                user = (
                    await db.execute(select(User).where(User.id == row["user_id"]))
                ).scalar_one()
                account = (
                    await db.execute(
                        select(TraderDemoAccount)
                        .where(
                            TraderDemoAccount.tenant_id == tenant.id,
                            TraderDemoAccount.user_id == user.id,
                        )
                        .options(selectinload(TraderDemoAccount.challenge_config))
                    )
                ).scalar_one()
                assert account.challenge_config_id, f"{user.email}: missing challenge config"
                assert float(account.virtual_balance) > 0

                sessions = [
                    s
                    for s in store.iter_sessions()
                    if s.tenant_slug == slug and s.user_id == str(user.id)
                ]
                assert sessions, f"{user.email}: no trading session"
                positions = list(sessions[0].bankroll.positions())
                print(
                    f"  {user.email}: provider={row['provider']} "
                    f"model={row['model_type']} positions={len(positions)} "
                    f"placed={row['positions_placed']}"
                )
                assert len(positions) >= 1, f"{user.email}: Portfolio has no open positions"

    print("\n✓ Seeder verification passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
