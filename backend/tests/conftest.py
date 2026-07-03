"""Shared pytest fixtures for API integration tests."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client() -> TestClient:
    """TestClient with lifespan — creates tables and seeds demo data."""
    with TestClient(app) as test_client:
        yield test_client
