import type { LiveEvent, LiveEventsPayload, Market, MarketViewSource } from "@/lib/types";
import { getMockPolymarketMarkets } from "@/lib/polymarket-mock";
import { listMarkets } from "@/lib/services";
import { buildMarketsFromQuotes, MOCK_SPOTS } from "@/lib/sp500/generator";
import { SP500_DASHBOARD_TICKERS } from "@/lib/sp500/sectors";

interface BackendLiveEvent {
  id: string;
  external_id: string;
  source: LiveEvent["source"];
  category: LiveEvent["category"];
  status: LiveEvent["status"];
  question: string;
  probabilities: { yes?: number; no?: number };
  volume: number;
  volume_24h: number;
  change_24h: number;
  last_updated: string;
  stock_ticker?: string | null;
  strike_price?: number | null;
  expiration_type?: LiveEvent["expirationType"];
  expiration_date?: string | null;
}

interface BackendLiveEventsPayload {
  events: BackendLiveEvent[];
  count: number;
  counts?: {
    internal: number;
    polymarket: number;
    kalshi: number;
    sp500_dynamic?: number;
    external?: number;
  };
  source?: MarketViewSource;
}

const LIVE_EVENTS_PER_SOURCE = Number(process.env.LIVE_EVENTS_PER_SOURCE ?? 24);

export function mapLiveEvent(raw: BackendLiveEvent): LiveEvent {
  const yes = Number(raw.probabilities?.yes ?? 0.5);
  const no = Number(raw.probabilities?.no ?? 1 - yes);

  return {
    id: raw.id,
    externalId: raw.external_id,
    source: raw.source,
    provider: raw.source,
    category: raw.category,
    status: raw.status,
    question: raw.question,
    probabilities: { yes, no },
    yesPrice: yes,
    volume: raw.volume,
    volume24h: raw.volume_24h,
    change24h: raw.change_24h,
    lastUpdated: raw.last_updated,
    stockTicker: raw.stock_ticker ?? null,
    strikePrice: raw.strike_price ?? null,
    expirationType: raw.expiration_type ?? null,
    expirationDate: raw.expiration_date ?? null,
  };
}

export function mapLiveEventsPayload(raw: BackendLiveEventsPayload): LiveEventsPayload {
  const events = raw.events.map(mapLiveEvent);
  return {
    events,
    count: raw.count,
    counts: raw.counts ?? {
      internal: events.filter((event) => event.source === "internal").length,
      polymarket: events.filter((event) => event.source === "polymarket").length,
      kalshi: events.filter((event) => event.source === "kalshi").length,
      sp500_dynamic: events.filter((event) => event.source === "sp500_dynamic").length,
    },
    source: raw.source ?? "all",
  };
}

export function liveEventToMarket(event: LiveEvent): Market {
  return {
    id: event.externalId,
    question: event.question,
    category: event.category,
    status: event.status,
    yesPrice: event.yesPrice,
    change24h: event.change24h,
    volume: event.volume,
    volume24h: event.volume24h,
    openInterest: Math.round(event.volume * 0.35),
    traders: 0,
    closesAt: Date.now() + 90 * 24 * 3_600_000,
    history: [],
    source: event.source,
    externalConditionId:
      event.source === "polymarket" ? event.externalId.replace(/^poly-/, "") : undefined,
    acceptingOrders: event.status !== "resolved",
    stockTicker: event.stockTicker ?? undefined,
    strikePrice: event.strikePrice ?? undefined,
    expirationType: event.expirationType ?? undefined,
    expirationDate: event.expirationDate ?? undefined,
  };
}

function marketToLiveEvent(market: Market): LiveEvent {
  return mapLiveEvent({
    id: `live-${market.id}`,
    external_id: market.id,
    source: market.source,
    category: market.category,
    status: market.status,
    question: market.question,
    probabilities: { yes: market.yesPrice, no: 1 - market.yesPrice },
    volume: market.volume24h || market.volume || market.openInterest || 0,
    volume_24h: market.volume24h || market.volume || 0,
    change_24h: market.change24h,
    last_updated: new Date().toISOString(),
    stock_ticker: market.stockTicker,
    strike_price: market.strikePrice,
    expiration_type: market.expirationType,
    expiration_date: market.expirationDate,
  });
}

function sortByActivity(markets: Market[]): Market[] {
  return [...markets].sort(
    (a, b) =>
      (b.volume24h || b.volume || b.openInterest || 0) -
        (a.volume24h || a.volume || a.openInterest || 0) ||
      a.question.localeCompare(b.question),
  );
}

function takeTop(markets: Market[], limit: number): Market[] {
  return sortByActivity(markets).slice(0, Math.max(0, limit));
}

/** Interleave sources so dashboard "all" views don't hide external feeds. */
function interleaveBySource(groups: Market[][]): Market[] {
  const result: Market[] = [];
  const queues = groups.map((group) => [...group]);
  let added = true;
  while (added) {
    added = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (next) {
        result.push(next);
        added = true;
      }
    }
  }
  return result;
}

function buildPayload(markets: Market[], source: MarketViewSource): LiveEventsPayload {
  const events = markets.map(marketToLiveEvent);
  return {
    events,
    count: events.length,
    counts: {
      internal: events.filter((event) => event.source === "internal").length,
      polymarket: events.filter((event) => event.source === "polymarket").length,
      kalshi: events.filter((event) => event.source === "kalshi").length,
      sp500_dynamic: events.filter((event) => event.source === "sp500_dynamic").length,
    },
    source,
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadPolymarketMarkets(refresh: boolean): Promise<Market[]> {
  try {
    const { getActivePolymarketMarkets } = await import("@/lib/polymarket/service");
    const markets = await withTimeout(getActivePolymarketMarkets(refresh), 8_000, []);
    if (markets.length > 0) return markets;
  } catch {
    /* fall through to mock */
  }
  return getMockPolymarketMarkets({ active: true });
}

async function loadKalshiMarkets(refresh: boolean): Promise<Market[]> {
  try {
    const { getActiveKalshiMarkets } = await import("@/lib/kalshi/service");
    return await withTimeout(getActiveKalshiMarkets(refresh), 8_000, []);
  } catch {
    return [];
  }
}

async function loadSp500Markets(refresh: boolean): Promise<Market[]> {
  try {
    const { getActiveSp500Markets } = await import("@/lib/sp500/service");
    return await withTimeout(getActiveSp500Markets(refresh), 8_000, []);
  } catch {
    return [];
  }
}

/**
 * Live event feed for the Vercel single-app deployment.
 * Pulls in-process internal LMSR, Polymarket CLOB, Kalshi, and S&P 500 markets.
 */
export async function listLiveEvents(options: {
  category?: string;
  source?: MarketViewSource;
  refresh?: boolean;
  perSource?: number;
} = {}): Promise<LiveEventsPayload> {
  const source = options.source ?? "all";
  const category = options.category ?? "all";
  const refresh = options.refresh ?? false;
  const perSource = options.perSource ?? LIVE_EVENTS_PER_SOURCE;

  const wantInternal = source === "internal" || source === "all";
  const wantPolymarket = source === "polymarket" || source === "all";
  const wantKalshi = source === "kalshi" || source === "all";
  const wantSp500 = source === "sp500_dynamic" || source === "all";

  const [internalRaw, polymarketRaw, kalshiRaw, sp500Raw] = await Promise.all([
    wantInternal
      ? Promise.resolve(
          listMarkets({
            category: category === "all" ? "all" : (category as Market["category"]),
            query: "",
            sort: "volume",
          }),
        )
      : Promise.resolve([] as Market[]),
    wantPolymarket ? loadPolymarketMarkets(refresh) : Promise.resolve([] as Market[]),
    wantKalshi ? loadKalshiMarkets(refresh) : Promise.resolve([] as Market[]),
    wantSp500 ? loadSp500Markets(refresh) : Promise.resolve([] as Market[]),
  ]);

  const filterCategory = (markets: Market[]) =>
    category === "all" ? markets : markets.filter((market) => market.category === category);

  const internal = takeTop(filterCategory(internalRaw), perSource);
  const polymarket = takeTop(filterCategory(polymarketRaw), perSource);
  const kalshi = takeTop(filterCategory(kalshiRaw), perSource);
  const sp500 = takeTop(filterCategory(sp500Raw), perSource);

  const markets =
    source === "all"
      ? interleaveBySource([internal, polymarket, kalshi, sp500])
      : source === "internal"
        ? internal
        : source === "polymarket"
          ? polymarket
          : source === "kalshi"
            ? kalshi
            : sp500;

  return buildPayload(markets, source);
}

/**
 * Sync fallback for cold paths / client-side when the API is unavailable.
 * Includes mock Polymarket and generated S&P 500 markets.
 */
export function listFallbackLiveEvents(options: {
  category?: string;
  source?: MarketViewSource;
} = {}): LiveEventsPayload {
  const source = options.source ?? "all";
  const category = options.category ?? "all";
  const markets: Market[] = [];

  if (source === "internal" || source === "all") {
    markets.push(
      ...listMarkets({
        category: category === "all" ? "all" : (category as Market["category"]),
        query: "",
        sort: "volume",
      }),
    );
  }

  if (source === "polymarket" || source === "all") {
    markets.push(...getMockPolymarketMarkets({ active: true }));
  }

  if (source === "sp500_dynamic" || source === "all") {
    const quotes = SP500_DASHBOARD_TICKERS.slice(0, 12).map((ticker) => ({
      ticker,
      lastPrice: MOCK_SPOTS[ticker] ?? 100,
      previousClose: MOCK_SPOTS[ticker] ?? 100,
    }));
    markets.push(...buildMarketsFromQuotes(quotes));
  }

  let filtered = markets;
  if (category !== "all") {
    filtered = filtered.filter((market) => market.category === category);
  }

  if (source === "all") {
    const internal = takeTop(
      filtered.filter((market) => market.source === "internal"),
      LIVE_EVENTS_PER_SOURCE,
    );
    const polymarket = takeTop(
      filtered.filter((market) => market.source === "polymarket"),
      LIVE_EVENTS_PER_SOURCE,
    );
    const sp500 = takeTop(
      filtered.filter((market) => market.source === "sp500_dynamic"),
      LIVE_EVENTS_PER_SOURCE,
    );
    return buildPayload(interleaveBySource([internal, polymarket, sp500]), source);
  }

  return buildPayload(takeTop(filtered, LIVE_EVENTS_PER_SOURCE), source);
}

export function initialPricesFromEvents(events: LiveEvent[]): Record<string, number> {
  return Object.fromEntries(events.map((event) => [event.externalId, event.yesPrice]));
}
