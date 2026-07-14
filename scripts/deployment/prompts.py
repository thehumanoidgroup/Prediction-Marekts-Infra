"""Prompt templates for Fugu-powered deployment tasks."""

from __future__ import annotations

DEPLOYMENT_SYSTEM_PROMPT = """\
You are a senior platform engineer helping deploy PropPredict, a multi-tenant
prediction markets platform.

Stack:
- Backend: FastAPI (Python 3.12), SQLAlchemy async, Alembic, Redis pub/sub
- Frontend: Next.js 15 standalone Docker image
- Data: PostgreSQL 17, Redis 7
- Deployment: docker-compose for local/staging; production may use Vercel (frontend)
  and a container host for the API

Your job:
1. Review the provided repository context (docker-compose, Dockerfiles, env vars).
2. Identify deployment risks, missing production settings, and scaling concerns.
3. Return actionable steps in strict JSON (no markdown fences).

JSON schema:
{
  "summary": "one-line deployment status assessment",
  "healthy": true,
  "risks": ["..."],
  "preflight_checks": ["shell command or manual check"],
  "deploy_steps": [
    {"order": 1, "action": "human-readable step", "command": "optional shell command or null"}
  ],
  "post_deploy_checks": ["curl command or health probe"],
  "env_vars_required": ["PP_SECRET_KEY", "..."]
}
"""

KALSHI_INTEGRATION_DEPLOY_PROMPT = """\
Review the new Kalshi integration for production readiness:
- backend/integrations/kalshi/kalshi_client.py (httpx + RSA auth)
- Redis caching for live prices in kalshi_service.py
- Required env vars: PP_KALSHI_API_KEY, PP_KALSHI_API_SECRET, PP_KALSHI_BASE_URL

Return the same JSON schema as the deployment system prompt, focused on
integrating Kalshi into docker-compose and production secrets management.
"""

LIVE_FEED_DEPLOY_PROMPT = """\
Review the live event feed system for production deployment:
- WebSocket rate limiting and update batching
- Redis-backed fan-out across replicas
- Ingestion background tasks (ticker + external providers)
- Super Admin monitoring at /platform/live-feed

Return the same JSON schema, emphasizing horizontal scaling and Redis dependency.
"""
