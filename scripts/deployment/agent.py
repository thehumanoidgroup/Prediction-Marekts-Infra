#!/usr/bin/env python3
"""Fugu-powered deployment assistant for PropPredict.

Usage
-----
Verify API key:
    export SAKANA_API_KEY=sk-...
    python scripts/deployment/agent.py verify

Review docker-compose deployment:
    python scripts/deployment/agent.py review --task deploy

Review live feed production readiness:
    python scripts/deployment/agent.py review --task live-feed

Review Kalshi integration rollout:
    python scripts/deployment/agent.py review --task kalshi
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT / "scripts" / "deployment") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "scripts" / "deployment"))

from fugu_client import FuguAuthError, FuguClient, FuguError  # noqa: E402
from prompts import (  # noqa: E402
    DEPLOYMENT_SYSTEM_PROMPT,
    KALSHI_INTEGRATION_DEPLOY_PROMPT,
    LIVE_FEED_DEPLOY_PROMPT,
)

CONTEXT_FILES = {
    "deploy": [
        "docker-compose.yml",
        ".env.example",
        "backend/Dockerfile",
        "frontend/Dockerfile",
        "README.md",
    ],
    "live-feed": [
        "docker-compose.yml",
        "backend/app/core/config.py",
        "backend/app/ws/manager.py",
        "backend/realtime/update_batcher.py",
        "backend/app/main.py",
    ],
    "kalshi": [
        "backend/integrations/kalshi/kalshi_client.py",
        "backend/integrations/kalshi/kalshi_service.py",
        "backend/app/core/config.py",
        ".env.example",
    ],
}

TASK_PROMPTS = {
    "deploy": "Review PropPredict docker-compose deployment for staging/production.",
    "live-feed": LIVE_FEED_DEPLOY_PROMPT,
    "kalshi": KALSHI_INTEGRATION_DEPLOY_PROMPT,
}


def _load_context(task: str) -> str:
    files = CONTEXT_FILES.get(task, CONTEXT_FILES["deploy"])
    chunks: list[str] = []
    for rel_path in files:
        path = REPO_ROOT / rel_path
        if not path.exists():
            chunks.append(f"--- {rel_path} (missing) ---\n")
            continue
        content = path.read_text(encoding="utf-8")
        if len(content) > 12000:
            content = content[:12000] + "\n... [truncated] ..."
        chunks.append(f"--- {rel_path} ---\n{content}\n")
    return "\n".join(chunks)


def _parse_json_response(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(cleaned)


async def cmd_verify(client: FuguClient) -> int:
    try:
        response = await client.verify_connection()
    except FuguAuthError as exc:
        print(f"Auth error: {exc}", file=sys.stderr)
        return 1
    except FuguError as exc:
        print(f"API error: {exc}", file=sys.stderr)
        return 1
    finally:
        await client.aclose()

    print("Sakana Fugu connection OK")
    print(f"Model: {response.model}")
    print(f"Response: {response.text[:200]}")
    return 0


async def cmd_review(client: FuguClient, task: str, *, model: str) -> int:
    user_prompt = TASK_PROMPTS.get(task, TASK_PROMPTS["deploy"])
    context = _load_context(task)
    full_user = f"{user_prompt}\n\nRepository context:\n\n{context}"

    try:
        response = await client.chat(
            system=DEPLOYMENT_SYSTEM_PROMPT,
            user=full_user,
            response_format={"type": "json_object"},
        )
    except FuguAuthError as exc:
        print(f"Auth error: {exc}", file=sys.stderr)
        return 1
    except FuguError as exc:
        print(f"API error: {exc}", file=sys.stderr)
        return 1
    finally:
        await client.aclose()

    try:
        plan = _parse_json_response(response.text)
    except json.JSONDecodeError:
        print(response.text)
        return 0

    print(json.dumps(plan, indent=2))
    return 0 if plan.get("healthy", True) else 2


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="PropPredict Fugu deployment assistant")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("verify", help="Verify SAKANA_API_KEY and Fugu connectivity")

    review = sub.add_parser("review", help="Ask Fugu to review deployment readiness")
    review.add_argument(
        "--task",
        choices=sorted(TASK_PROMPTS),
        default="deploy",
        help="Deployment review focus area",
    )
    review.add_argument(
        "--model",
        choices=["fugu", "fugu-ultra"],
        default="fugu",
        help="Sakana model (fugu-ultra for complex multi-step reviews)",
    )

    return parser


async def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    model = getattr(args, "model", "fugu")
    client = FuguClient(model=model)

    if args.command == "verify":
        return await cmd_verify(client)
    if args.command == "review":
        return await cmd_review(client, args.task, model=model)

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
