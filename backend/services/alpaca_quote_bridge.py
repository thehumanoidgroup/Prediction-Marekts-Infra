"""Alpaca IEX WebSocket bridge → PropPredict live event broadcasts.

Alpaca WebSocket for MVP. Polygon WebSocket ready for later scaling.
Polygon.io will replace Alpaca when scaling many accounts.

Official docs:
- https://alpaca.markets/docs/
- https://alpaca.markets/docs/api-references/market-data-api/
- https://alpaca.markets/docs/api-references/market-data-api/stock-pricing-data/realtime/

Subscribes **only to actively viewed** S&P 500 tickers (from live feed
analytics / card view tracking), fans trade/quote updates through the
existing Redis + WebSocket batcher as ``stock_quote`` messages.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from sqlalchemy import select

from app.core.config import Settings, get_settings
from app.db.session import SessionLocal
from app.models.live_event import LiveEvent, LiveEventSource
from integrations.alpaca import AlpacaAuthError, AlpacaStockStream, AlpacaWebSocketError
from realtime.event_broadcaster import broadcast_stock_quote
from services.live_feed_analytics import LiveFeedAnalytics, analytics

logger = logging.getLogger(__name__)


class AlpacaQuoteBridge:
    """Own one Alpaca IEX stream and reconcile subscriptions to viewed tickers.

    Alpaca WebSocket for MVP. Polygon WebSocket ready for later scaling.
    """

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        feed_analytics: LiveFeedAnalytics | None = None,
        reconcile_interval_seconds: float = 5.0,
    ) -> None:
        self._settings = settings or get_settings()
        self._analytics = feed_analytics or analytics
        self._reconcile_interval = max(2.0, reconcile_interval_seconds)
        self._stream: AlpacaStockStream | None = None
        self._desired: set[str] = set()
        self._running = False
        self._tasks: list[asyncio.Task[None]] = []
        self._last_prices: dict[str, float] = {}
        self._event_index: dict[str, list[tuple[str, str]]] = {}
        self._index_refreshed_at = 0.0
        self._lock = asyncio.Lock()

    @property
    def max_symbols(self) -> int:
        return max(1, int(self._settings.alpaca_ws_max_symbols or 30))

    async def start(self) -> None:
        if self._running:
            return
        if not self._settings.alpaca_api_key or not self._settings.alpaca_secret_key:
            logger.info(
                "Alpaca quote bridge idle — set ALPACA_API_KEY / ALPACA_SECRET_KEY to enable"
            )
            return

        self._running = True
        try:
            self._stream = AlpacaStockStream.from_settings(
                self._settings,
                on_trade=self._on_trade,
                on_quote=self._on_quote,
                on_error=self._on_error,
            )
            await self._stream.connect()
        except (AlpacaAuthError, AlpacaWebSocketError) as exc:
            logger.warning("Alpaca quote bridge failed to connect: %s", exc)
            self._running = False
            self._stream = None
            return

        self._tasks = [
            asyncio.create_task(self._stream.run_forever(), name="alpaca-iex-stream"),
            asyncio.create_task(self._reconcile_loop(), name="alpaca-iex-reconcile"),
        ]
        logger.info(
            "Alpaca quote bridge started (max_symbols=%s). "
            "Alpaca WebSocket for MVP. Polygon WebSocket ready for later scaling.",
            self.max_symbols,
        )

    async def stop(self) -> None:
        self._running = False
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception:  # noqa: BLE001
                logger.exception("Alpaca quote bridge task shutdown error")
        self._tasks = []
        if self._stream is not None:
            await self._stream.close()
            self._stream = None

    async def touch_ticker(self, ticker: str) -> None:
        """Called when a client views an sp500_dynamic market card."""
        symbol = ticker.strip().upper()
        if not symbol:
            return
        self._analytics.touch_ticker(symbol)
        await self.reconcile_subscriptions()

    async def reconcile_subscriptions(self) -> None:
        if self._stream is None or not self._running:
            return

        desired = set(self._analytics.active_tickers(max_symbols=self.max_symbols))
        async with self._lock:
            current = set(self._stream._subscribed_trades) | set(self._stream._subscribed_quotes)
            to_add = sorted(desired - current)
            to_remove = sorted(current - desired)
            self._desired = desired

            if to_remove:
                # Unsubscribe both channels in case a prior revision used quotes.
                await self._stream.unsubscribe(trades=to_remove, quotes=to_remove)
            if to_add:
                # Efficient free-tier usage: trades-only for last price.
                # Quotes double the message volume and burn the 30-symbol budget
                # faster under fan-out — fall back to REST for thin/after-hours.
                await self._stream.subscribe(trades=to_add, quotes=[])
                logger.info(
                    "Alpaca IEX subscribed trades-only to %s (%s symbols)",
                    ",".join(to_add),
                    len(desired),
                )

    async def _reconcile_loop(self) -> None:
        while self._running:
            try:
                await self.reconcile_subscriptions()
                await self._refresh_event_index()
            except Exception:  # noqa: BLE001
                logger.exception("Alpaca quote bridge reconcile failed")
            await asyncio.sleep(self._reconcile_interval)

    async def _refresh_event_index(self) -> None:
        """Map ticker → open sp500_dynamic live events for fan-out."""
        now = time.time()
        if now - self._index_refreshed_at < 30.0 and self._event_index:
            return
        try:
            async with SessionLocal() as db:
                result = await db.execute(
                    select(LiveEvent.id, LiveEvent.external_id, LiveEvent.stock_ticker).where(
                        LiveEvent.source == LiveEventSource.SP500_DYNAMIC,
                        LiveEvent.stock_ticker.isnot(None),
                    )
                )
                index: dict[str, list[tuple[str, str]]] = {}
                for event_id, external_id, ticker in result.all():
                    if not ticker:
                        continue
                    symbol = str(ticker).upper()
                    index.setdefault(symbol, []).append((str(event_id), str(external_id)))
                self._event_index = index
                self._index_refreshed_at = now
        except Exception:  # noqa: BLE001
            logger.exception("Failed to refresh sp500_dynamic event index")

    async def _on_trade(self, message: dict[str, Any]) -> None:
        ticker = str(message.get("S") or "").upper()
        price = message.get("p")
        if not ticker or price is None:
            return
        await self._emit_quote(ticker, float(price))

    async def _on_quote(self, message: dict[str, Any]) -> None:
        ticker = str(message.get("S") or "").upper()
        if not ticker:
            return
        bid = message.get("bp")
        ask = message.get("ap")
        mid: float | None = None
        if bid is not None and ask is not None and float(bid) > 0 and float(ask) > 0:
            mid = (float(bid) + float(ask)) / 2.0
        elif ask is not None and float(ask) > 0:
            mid = float(ask)
        elif bid is not None and float(bid) > 0:
            mid = float(bid)
        if mid is None:
            return
        await self._emit_quote(
            ticker,
            mid,
            bid=float(bid) if bid is not None else None,
            ask=float(ask) if ask is not None else None,
        )

    async def _on_error(self, error: Exception) -> None:
        logger.error("Alpaca IEX stream error: %s", error)

    async def _emit_quote(
        self,
        ticker: str,
        last_price: float,
        *,
        bid: float | None = None,
        ask: float | None = None,
    ) -> None:
        previous = self._last_prices.get(ticker)
        if previous is not None and abs(previous - last_price) < 0.005:
            return
        self._last_prices[ticker] = last_price

        targets = self._event_index.get(ticker) or []
        if not targets:
            # Still broadcast ticker-room update so dashboards can bind by symbol.
            await broadcast_stock_quote(stock_ticker=ticker, last_price=last_price, bid=bid, ask=ask)
            return

        for event_id, external_id in targets:
            await broadcast_stock_quote(
                stock_ticker=ticker,
                last_price=last_price,
                event_id=event_id,
                external_id=external_id,
                bid=bid,
                ask=ask,
            )


_bridge: AlpacaQuoteBridge | None = None


def get_alpaca_quote_bridge() -> AlpacaQuoteBridge:
    global _bridge
    if _bridge is None:
        _bridge = AlpacaQuoteBridge()
    return _bridge


async def start_alpaca_quote_bridge(settings: Settings | None = None) -> AlpacaQuoteBridge:
    bridge = get_alpaca_quote_bridge()
    if settings is not None:
        bridge._settings = settings
    await bridge.start()
    return bridge


async def stop_alpaca_quote_bridge() -> None:
    global _bridge
    if _bridge is not None:
        await _bridge.stop()
