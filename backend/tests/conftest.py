"""Shared pytest fixtures for API integration tests."""

import asyncio
import os

os.environ.setdefault("PP_INGESTION_ENABLED", "false")
os.environ.setdefault("PP_SP500_GENERATOR_ENABLED", "false")
os.environ.setdefault("PP_SP500_RESOLUTION_ENABLED", "false")
os.environ["PP_DATABASE_URL"] = "sqlite+aiosqlite:///./test_pp.db"

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient

from app.db.seed import seed_database
from app.db.session import SessionLocal, engine
from app.main import app
from app.models import Base


@pytest.fixture(scope="session", autouse=True)
def prepare_database():
    """Fresh schema + demo seed for every test session."""

    async def _prepare() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
        async with SessionLocal() as db:
            await seed_database(db)

    asyncio.run(_prepare())
    yield


@pytest_asyncio.fixture
async def db_session(prepare_database):
    async with SessionLocal() as session:
        yield session
        await session.rollback()


@pytest.fixture(scope="session")
def client() -> TestClient:
    """TestClient with lifespan — tables and seed data prepared by ``prepare_database``."""
    with TestClient(app) as test_client:
        yield test_client
