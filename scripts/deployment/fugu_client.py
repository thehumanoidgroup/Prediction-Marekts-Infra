"""Thin Sakana Fugu client for deployment automation.

Fugu is Sakana's multi-agent orchestration API, exposed as an OpenAI-compatible
REST interface. This module is used by PropPredict deployment scripts to get
structured deployment guidance and review generated configs.

Docs: https://console.sakana.ai/get-started
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Literal

import httpx

DEFAULT_BASE_URL = "https://api.sakana.ai/v1"
DEFAULT_MODEL = "fugu"
DEFAULT_TIMEOUT_SECONDS = 180.0


class FuguError(Exception):
    """Raised when the Sakana Fugu API returns an error."""


class FuguAuthError(FuguError):
    """Raised when SAKANA_API_KEY is missing or rejected."""


@dataclass(frozen=True, slots=True)
class FuguResponse:
    """Normalized response from chat completions or responses API."""

    text: str
    model: str
    raw: dict[str, Any]


class FuguClient:
    """OpenAI-compatible async client for Sakana Fugu."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str = DEFAULT_BASE_URL,
        model: Literal["fugu", "fugu-ultra"] = DEFAULT_MODEL,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
        reasoning_effort: Literal["high", "xhigh", "max"] = "high",
    ) -> None:
        self.api_key = api_key or os.environ.get("SAKANA_API_KEY")
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.reasoning_effort = reasoning_effort
        self._http: httpx.AsyncClient | None = None

    @classmethod
    def from_env(cls) -> FuguClient:
        return cls()

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    async def aclose(self) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None

    async def _get_http(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout_seconds,
                headers=self._auth_headers(),
            )
        return self._http

    def _auth_headers(self) -> dict[str, str]:
        if not self.is_configured:
            raise FuguAuthError(
                "SAKANA_API_KEY is not set. Export it or add it to your .env file."
            )
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def chat(
        self,
        *,
        system: str,
        user: str,
        response_format: dict[str, Any] | None = None,
    ) -> FuguResponse:
        """Send a chat completion request to Fugu."""
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "reasoning": {"effort": self.reasoning_effort},
        }
        if response_format is not None:
            payload["response_format"] = response_format

        client = await self._get_http()
        response = await client.post("/chat/completions", json=payload)

        if response.status_code == 401:
            raise FuguAuthError("Sakana API rejected SAKANA_API_KEY (401).")
        if response.status_code >= 400:
            raise FuguError(
                f"Sakana API error {response.status_code}: {_safe_text(response)}"
            )

        data = response.json()
        text = _extract_chat_text(data)
        return FuguResponse(text=text, model=self.model, raw=data)

    async def verify_connection(self) -> FuguResponse:
        """Lightweight health check — confirms API key and model routing."""
        return await self.chat(
            system="Reply with exactly: ok",
            user="ping",
        )


def _extract_chat_text(data: dict[str, Any]) -> str:
    choices = data.get("choices") or []
    if not choices:
        raise FuguError("Sakana API returned no choices.")

    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text") or ""))
        joined = "\n".join(part for part in parts if part).strip()
        if joined:
            return joined

    raise FuguError("Could not parse Sakana API response content.")


def _safe_text(response: httpx.Response) -> str:
    try:
        return json.dumps(response.json())
    except ValueError:
        return response.text[:500]


__all__ = [
    "DEFAULT_BASE_URL",
    "DEFAULT_MODEL",
    "FuguAuthError",
    "FuguClient",
    "FuguError",
    "FuguResponse",
]
