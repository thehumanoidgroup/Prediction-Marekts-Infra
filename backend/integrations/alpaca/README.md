# Alpaca Market Data (IEX free tier)

Stock pricing for PropPredict **S&P 500 Stock Prediction Markets (0DTE & Weekly) – MVP**.

Official documentation:

- Platform overview: https://alpaca.markets/docs/
- Market Data API: https://alpaca.markets/docs/api-references/market-data-api/
- Real-time stock pricing (WebSocket):
  https://alpaca.markets/docs/api-references/market-data-api/stock-pricing-data/realtime/

> **Polygon.io will replace Alpaca when scaling many accounts.**  
> Keep the `AlpacaService` method names (or a shared `StockDataProvider` protocol) so generators, quote bridges, and EOD resolution can swap providers behind env flags without rewriting call sites.

---

## How to get free Alpaca API keys

1. Create a free account at [Alpaca](https://alpaca.markets/) (Broker / Trading dashboard).
2. Open the [API Keys](https://app.alpaca.markets/brokerage/dashboard/overview) page (or **Paper Trading → API Keys**).
3. Generate a **paper trading** key pair (`PK…` key id + secret). Paper keys are enough for Market Data on the Basic / IEX tier.
4. Copy the values into your environment (never commit secrets):

```bash
export ALPACA_API_KEY=PK................................
export ALPACA_SECRET_KEY=................................
```

5. Restart the app / backend. Super Admin → **Integrations** should show Alpaca as connected after a successful snapshot probe.

Optional overrides (also accepted as `PP_ALPACA_*`):

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

Without keys, the Next.js path falls back to mock spots so the dashboard still renders.

---

## Endpoints used by this package

Base REST host: `https://data.alpaca.markets/v2`  
Auth headers: `APCA-API-KEY-ID`, `APCA-API-SECRET-KEY`  
Docs index: https://alpaca.markets/docs/api-references/market-data-api/

| PropPredict helper | HTTP / WS | Alpaca path | Docs |
| --- | --- | --- | --- |
| `get_current_price` | `GET` | `/v2/stocks/{symbol}/trades/latest` | [Latest trade](https://docs.alpaca.markets/reference/stocklatesttrade-1) |
| `get_snapshot` | `GET` | `/v2/stocks/{symbol}/snapshot` | [Snapshot](https://docs.alpaca.markets/reference/stocksnapshot-1) |
| `get_snapshots_all` | `GET` | `/v2/stocks/snapshots?symbols=…&feed=iex` | [Multi-snapshot](https://docs.alpaca.markets/reference/stockssnapshots-1) |
| `get_daily_bars` | `GET` | `/v2/stocks/{symbol}/bars?timeframe=1Day` | [Bars](https://docs.alpaca.markets/reference/stockbars-1) |
| `AlpacaStockStream` | `WSS` | `wss://stream.data.alpaca.markets/v2/iex` | [Realtime](https://alpaca.markets/docs/api-references/market-data-api/stock-pricing-data/realtime/) |

S&P 500 ticker universe is a static curated list in `sp500_tickers.py` (Market Data does not expose an S&P 500 membership endpoint on the free tier).

---

## Usage

```python
from integrations.alpaca import AlpacaClient, AlpacaService, AlpacaStockStream

# Docs: https://alpaca.markets/docs/
#       https://alpaca.markets/docs/api-references/market-data-api/
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

---

## Free-tier limits (Basic / IEX)

- Live coverage: **IEX only** (not full SIP)
- Historical REST: ~**200 calls/minute**
- Websocket: **30 symbols** max
- Auth required on all market-data endpoints

**Polygon.io will replace Alpaca when scaling many accounts** — higher throughput, SIP coverage, and multi-tenant quote fan-out beyond IEX caps.
