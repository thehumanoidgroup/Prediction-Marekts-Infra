"""Tenant white-label config API tests."""

from fastapi.testclient import TestClient


def test_current_tenant_config_camel_case(client: TestClient):
    response = client.get("/api/v1/tenants/current", headers={"X-Tenant-Slug": "apex"})
    assert response.status_code == 200
    data = response.json()
    assert data["slug"] == "apex"
    assert data["id"] == "apex"
    assert data["branding"]["accentHover"] == "#0ea5e9"
    assert data["program"]["drawdownMode"] == "trailing"
    assert data["features"]["journal"] is True


def test_patch_branding_persists(client: TestClient):
    response = client.patch(
        "/api/v1/tenants/current",
        headers={"X-Tenant-Slug": "nova"},
        json={
            "name": "Nova Markets",
            "branding": {
                "accent": "#f59e0b",
                "accentHover": "#d97706",
                "accentSoft": "rgba(245, 158, 11, 0.12)",
                "accentForeground": "#0a0d12",
                "logoGlyph": "N",
            },
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["branding"]["accent"] == "#f59e0b"

    again = client.get("/api/v1/tenants/current", headers={"X-Tenant-Slug": "nova"})
    assert again.json()["branding"]["accent"] == "#f59e0b"
