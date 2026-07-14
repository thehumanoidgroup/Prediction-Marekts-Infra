"""Shared pytest fixtures for API integration tests."""

import os

os.environ.setdefault("PP_INGESTION_ENABLED", "false")

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient

from app.db.session import SessionLocal, engine
from app.main import app
from app.models import Base


@pytest_asyncio.fixture
async def setup_database():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest_asyncio.fixture
async def db_session(setup_database):
    async with SessionLocal() as session:
        yield session
        await session.rollback()


@pytest.fixture(scope="session")
def client() -> TestClient:
    """TestClient with lifespan — creates tables and seeds demo data."""
    with TestClient(app) as test_client:
        yield test_client
