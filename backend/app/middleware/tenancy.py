"""Multi-tenancy middleware: one tenant per request, resolved once.

``TenantContextMiddleware`` is a pure ASGI middleware (no BaseHTTPMiddleware
overhead, works for both HTTP and WebSocket scopes) that resolves the
tenant *slug* for every inbound connection and exposes it in two places:

- ``request.state.tenant_slug`` — for dependencies and route handlers.
- :data:`current_tenant_slug` (a ``ContextVar``) — for code with no access
  to the request, e.g. logging filters, background helpers, audit trails.

Resolution priority:

1. ``X-Tenant-Slug`` header — set by the frontend / API clients.
2. Left-most label of the ``Host`` header — subdomain routing in
   production (``apex.proppredict.com`` → ``apex``).

The middleware stays deliberately I/O-free (no database lookups) so it
adds zero latency; validating that the slug exists and is active stays in
the :func:`app.api.deps.get_current_tenant` dependency, which needs a
session anyway and 404s unknown firms.
"""

from __future__ import annotations

from contextvars import ContextVar

from starlette.types import ASGIApp, Receive, Scope, Send

TENANT_HEADER = b"x-tenant-slug"

current_tenant_slug: ContextVar[str | None] = ContextVar("current_tenant_slug", default=None)


def resolve_tenant_slug(headers: list[tuple[bytes, bytes]]) -> str | None:
    """Extracts the tenant slug from raw ASGI headers (header, then host)."""
    host = None
    for name, value in headers:
        if name == TENANT_HEADER:
            slug = value.decode("latin-1").strip().lower()
            if slug:
                return slug
        elif name == b"host":
            host = value.decode("latin-1")
    if host:
        label = host.split(":")[0].split(".")[0].strip().lower()
        return label or None
    return None


class TenantContextMiddleware:
    """Stamps every HTTP/WebSocket connection with its tenant slug."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        slug = resolve_tenant_slug(scope.get("headers", []))
        scope.setdefault("state", {})["tenant_slug"] = slug

        token = current_tenant_slug.set(slug)
        try:
            await self.app(scope, receive, send)
        finally:
            current_tenant_slug.reset(token)
