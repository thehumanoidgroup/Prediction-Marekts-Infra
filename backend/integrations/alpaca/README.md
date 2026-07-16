# Alpaca Market Data (IEX free tier) — S&P 500 stock data for the MVP
#
# Official docs:
#   https://alpaca.markets/docs/
#   https://alpaca.markets/docs/api-references/market-data-api/
#   https://alpaca.markets/docs/api-references/market-data-api/stock-pricing-data/realtime/
#
# Use paper trading keys from the Alpaca dashboard for the MVP.
# Replace with a Polygon.io client when scaling beyond IEX / free-tier limits.

## Setup

```bash
# Paper keys (recommended for MVP)
export ALPACA_API_KEY=PK...
export ALPACA_SECRET_KEY=...

# Optional overrides (also accepted as PP_ALPACA_*)
export ALPACA_FEED=iex
export PP_REDIS_URL=redis://localhost:6379/0
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `ALPACA_API_KEY` | — | Paper/live API key id |
| `ALPACA_SECRET_KEY` | — | Paper/live secret |
| `PP_ALPACA_DATA_BASE_URL` | `https://data.alpaca.markets/v2` | REST root |
| `PP_ALPACA_IEX_STREAM_URL` | `wss://stream.data.alpaca.markets/v2/iex` | Realtime stream |
| `PP_ALPACA_FEED` | `iex` | Free-tier feed (`sip` needs paid plan) |
| `PP_ALPACA_RATE_LIMIT_PER_MINUTE` | `180` | Outbound REST budget (Basic ≈ 200/min) |
| `PP_ALPACA_WS_MAX_SYMBOLS` | `30` | Free-tier websocket subscription cap |
| `PP_REDIS_URL` | `redis://localhost:6379/0` | Shared cache |

## Usage

```python
from integrations.alpaca import AlpacaClient, AlpacaService, AlpacaStockStream

async with AlpacaClient.from_settings() as client:
    tickers = client.get_sp500_tickers()
    price = await client.get_current_price("AAPL")
    snap = await client.get_snapshot("MSFT")
    snaps = await client.get_snapshots_all(["AAPL", "MSFT", "NVDA"])
    bars = await client.get_daily_bars("AAPL", "2026-07-15")

service = AlpacaService.from_settings()
await service.get_current_price("AAPL")  # Redis-cached

async def on_trade(msg: dict) -> None:
    print(msg["S"], msg["p"])

stream = AlpacaStockStream.from_settings(on_trade=on_trade)
await stream.connect()
await stream.subscribe(trades=["AAPL", "MSFT"], quotes=["AAPL"])
await stream.run_forever()
```

## Free-tier limits (Basic / IEX)

- Live coverage: **IEX only** (not full SIP)
- Historical REST: ~**200 calls/minute**
- Websocket: **30 symbols** max
- Auth required on all market-data endpoints

When you outgrow these constraints, **replace this package with a Polygon.io client**
and keep the `AlpacaService` method names as a stable façade (or introduce a shared
`StockDataProvider` protocol).
