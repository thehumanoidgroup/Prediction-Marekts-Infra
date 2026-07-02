import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, health, tenants, ws
from app.core.config import get_settings
from app.db.seed import seed_database
from app.db.session import SessionLocal, engine
from app.middleware.tenancy import TenantContextMiddleware
from app.models import Base
from app.ws.manager import manager
from app.ws.ticker import start_ticker, stop_ticker

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()

    # Dev convenience: create tables and seed demo data. Production relies
    # on Alembic migrations (`alembic upgrade head`) instead.
    if settings.environment == "development":
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with SessionLocal() as db:
            await seed_database(db)

    await manager.startup()
    ticker = start_ticker()
    yield
    await stop_ticker(ticker)
    await manager.shutdown()
    await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.debug else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # Resolves the tenant slug (header/subdomain) for every HTTP and
    # WebSocket connection; see app/middleware/tenancy.py.
    app.add_middleware(TenantContextMiddleware)

    app.include_router(health.router)
    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(tenants.router, prefix="/api/v1")
    app.include_router(ws.router)

    return app


app = create_app()
