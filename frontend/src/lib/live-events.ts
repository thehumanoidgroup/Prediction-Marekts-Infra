import type { LiveEvent, LiveEventsPayload, Market, MarketViewSource } from "@/lib/types";
import { getMockPolymarketMarkets } from "@/lib/polymarket-mock";
import { listMarkets } from "@/lib/services";

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
}

interface BackendLiveEventsPayload {
  events: BackendLiveEvent[];
  count: number;
  counts?: { internal: number; polymarket: number };
  source?: MarketViewSource;
}

export function mapLiveEvent(raw: BackendLiveEvent): LiveEvent {
  const yes = Number(raw.probabilities?.yes ?? 0.5);
  const no = Number(raw.probabilities?.no ?? 1 - yes);

  return {
    id: raw.id,
    externalId: raw.external_id,
    source: raw.source,
    category: raw.category,
    status: raw.status,
    question: raw.question,
    probabilities: { yes, no },
    yesPrice: yes,
    volume: raw.volume,
    volume24h: raw.volume_24h,
    change24h: raw.change_24h,
    lastUpdated: raw.last_updated,
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
  };
}

/** Client-side fallback when the live-events API is unavailable. */
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

  let filtered = markets;
  if (category !== "all") {
    filtered = filtered.filter((market) => market.category === category);
  }

  const events = filtered.map((market) =>
    mapLiveEvent({
      id: `local-${market.id}`,
      external_id: market.id,
      source: market.source,
      category: market.category,
      status: market.status,
      question: market.question,
      probabilities: { yes: market.yesPrice, no: 1 - market.yesPrice },
      volume: market.volume,
      volume_24h: market.volume24h,
      change_24h: market.change24h,
      last_updated: new Date().toISOString(),
    }),
  );

  return {
    events,
    count: events.length,
    counts: {
      internal: events.filter((event) => event.source === "internal").length,
      polymarket: events.filter((event) => event.source === "polymarket").length,
    },
    source,
  };
}

export function initialPricesFromEvents(events: LiveEvent[]): Record<string, number> {
  return Object.fromEntries(events.map((event) => [event.externalId, event.yesPrice]));
}
