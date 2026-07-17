"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { LiveEvent, LiveEventStatus } from "@/lib/types";

/**
 * Live market prices and events for the whole app.
 *
 * YES probabilities use a client simulator on Vercel. Underlying S&P 500
 * equity quotes poll Alpaca REST for **viewed tickers only** (and consume
 * ``stock_quote`` WebSocket frames when a backend bridge is connected).
 *
 * Alpaca WebSocket for MVP. Polygon WebSocket ready for later scaling.
 */

export type FeedStatus = "connecting" | "live" | "simulated";

interface OptimisticEntry {
  yes: number;
  expiresAt: number;
}

interface LivePricesContextValue {
  prices: Record<string, number>;
  /** Underlying equity last prices keyed by ticker (e.g. AAPL). */
  stockQuotes: Record<string, number>;
  events: LiveEvent[];
  status: FeedStatus;
  mergeEvents: (events: LiveEvent[]) => void;
  optimisticUpdatePrice: (marketId: string, yes: number) => void;
  registerViewedTicker: (ticker: string) => void;
}

const LivePricesContext = createContext<LivePricesContextValue | null>(null);

const SIMULATOR_INTERVAL_MS = 1_800;
const OPTIMISTIC_TTL_MS = 2_500;
const STOCK_QUOTE_POLL_MS = 2_000;
const clamp = (p: number) => Math.min(0.97, Math.max(0.03, p));

function applyPriceToEvents(events: LiveEvent[], externalId: string, yes: number): LiveEvent[] {
  return events.map((event) =>
    event.externalId === externalId
      ? {
          ...event,
          yesPrice: yes,
          probabilities: { yes, no: clamp(1 - yes) },
        }
      : event,
  );
}

function upsertEvent(events: LiveEvent[], incoming: LiveEvent): LiveEvent[] {
  const index = events.findIndex(
    (event) => event.id === incoming.id || event.externalId === incoming.externalId,
  );
  if (index === -1) return [incoming, ...events];
  const next = [...events];
  next[index] = { ...next[index], ...incoming };
  return next;
}

function applyLiveMessage(
  message: Record<string, unknown>,
  setPrices: React.Dispatch<React.SetStateAction<Record<string, number>>>,
  setEvents: React.Dispatch<React.SetStateAction<LiveEvent[]>>,
  setStockQuotes: React.Dispatch<React.SetStateAction<Record<string, number>>>,
  clearOptimistic: (marketId: string) => void,
) {
  if (message.type === "batch_update" && Array.isArray(message.updates)) {
    for (const update of message.updates as Record<string, unknown>[]) {
      applyLiveMessage(update, setPrices, setEvents, setStockQuotes, clearOptimistic);
    }
    return;
  }

  if (message.type === "stock_quote" && message.data) {
    const data = message.data as Record<string, unknown>;
    const ticker = String(data.stock_ticker ?? "").toUpperCase();
    const last = Number(data.last_price);
    if (!ticker || !Number.isFinite(last)) return;
    setStockQuotes((current) =>
      current[ticker] === last ? current : { ...current, [ticker]: last },
    );
    return;
  }

  if (message.type === "price_tick" && typeof message.market_id === "string") {
    const marketId = message.market_id;
    const yes = clamp(Number(message.yes_price));
    clearOptimistic(marketId);
    setPrices((current) =>
      marketId in current ? { ...current, [marketId]: yes } : current,
    );
    setEvents((current) => applyPriceToEvents(current, marketId, yes));
    return;
  }

  if (message.type === "price_update" && message.data) {
    const data = message.data as Record<string, unknown>;
    const externalId = data.external_id as string | undefined;
    const probabilities = data.probabilities as { yes?: number } | undefined;
    const yes = clamp(Number(probabilities?.yes ?? 0.5));
    const key = externalId ?? String(message.event_id);
    clearOptimistic(key);
    setPrices((current) => ({ ...current, [key]: yes }));
    setEvents((current) =>
      applyPriceToEvents(current, key, yes).map((item) =>
        item.externalId === key || item.id === message.event_id
          ? {
              ...item,
              yesPrice: yes,
              probabilities: { yes, no: clamp(1 - yes) },
              change24h: Number(data.change_24h ?? item.change24h),
              source: (data.source as LiveEvent["source"]) ?? item.source,
            }
          : item,
      ),
    );
    return;
  }

  if (message.type === "status_change" && message.data) {
    const data = message.data as Record<string, unknown>;
    const statusValue = data.status as LiveEventStatus;
    setEvents((current) =>
      current.map((item) =>
        item.id === message.event_id || item.externalId === data.external_id
          ? { ...item, status: statusValue }
          : item,
      ),
    );
    return;
  }

  if (message.type === "new_event" && message.data) {
    const data = message.data as Record<string, unknown>;
    const externalId = String(data.external_id ?? message.event_id);
    const yes = clamp(Number((data.probabilities as { yes?: number } | undefined)?.yes ?? 0.5));

    if (data.question) {
      const incoming: LiveEvent = {
        id: String(message.event_id),
        externalId,
        source: (data.source as LiveEvent["source"]) ?? "internal",
        category: (data.category as LiveEvent["category"]) ?? "economics",
        status: (data.status as LiveEventStatus) ?? "open",
        question: String(data.question),
        probabilities: { yes, no: clamp(1 - yes) },
        yesPrice: yes,
        volume: Number(data.volume ?? 0),
        volume24h: Number(data.volume_24h ?? 0),
        change24h: Number(data.change_24h ?? 0),
        lastUpdated: new Date().toISOString(),
        stockTicker: data.stock_ticker ? String(data.stock_ticker) : null,
        strikePrice: data.strike_price != null ? Number(data.strike_price) : null,
      };
      clearOptimistic(externalId);
      setEvents((current) => upsertEvent(current, incoming));
      setPrices((current) => ({ ...current, [externalId]: yes }));
      return;
    }

    setEvents((current) =>
      current.map((item) =>
        item.id === message.event_id || item.externalId === externalId
          ? {
              ...item,
              volume: Number(data.volume ?? item.volume),
              volume24h: Number(data.volume_24h ?? item.volume24h),
            }
          : item,
      ),
    );
  }
}

export function LivePricesProvider({
  initialPrices,
  initialEvents = [],
  tenantSlug = "app",
  children,
}: {
  initialPrices: Record<string, number>;
  initialEvents?: LiveEvent[];
  tenantSlug?: string;
  children: ReactNode;
}) {
  const [prices, setPrices] = useState(initialPrices);
  const [stockQuotes, setStockQuotes] = useState<Record<string, number>>({});
  const [events, setEvents] = useState<LiveEvent[]>(initialEvents);
  const [status, setStatus] = useState<FeedStatus>("connecting");
  const [optimistic, setOptimistic] = useState<Record<string, OptimisticEntry>>({});
  const [viewedTickers, setViewedTickers] = useState<string[]>([]);
  const simulatorRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingMessages = useRef<Record<string, unknown>[]>([]);
  const flushScheduled = useRef(false);

  const clearOptimistic = useCallback((marketId: string) => {
    setOptimistic((current) => {
      if (!(marketId in current)) return current;
      const next = { ...current };
      delete next[marketId];
      return next;
    });
  }, []);

  const flushPending = useCallback(() => {
    flushScheduled.current = false;
    const batch = pendingMessages.current.splice(0);
    if (batch.length === 0) return;

    for (const message of batch) {
      applyLiveMessage(message, setPrices, setEvents, setStockQuotes, clearOptimistic);
    }
  }, [clearOptimistic]);

  const queueMessage = useCallback(
    (message: Record<string, unknown>) => {
      pendingMessages.current.push(message);
      if (flushScheduled.current) return;
      flushScheduled.current = true;
      requestAnimationFrame(flushPending);
    },
    [flushPending],
  );

  const registerViewedTicker = useCallback((ticker: string) => {
    const symbol = ticker.trim().toUpperCase();
    if (!symbol) return;
    setViewedTickers((current) =>
      current.includes(symbol) ? current : [...current, symbol].slice(-30),
    );
  }, []);

  const mergeEvents = useCallback((incoming: LiveEvent[]) => {
    setEvents((current) => {
      let next = [...current];
      for (const event of incoming) {
        next = upsertEvent(next, event);
      }
      return next;
    });
    setPrices((current) => {
      const next = { ...current };
      for (const event of incoming) {
        next[event.externalId] = event.yesPrice;
      }
      return next;
    });
    // Do not auto-register every sp500_dynamic ticker from feed merges —
    // that floods the free-tier 30-symbol envelope. Cards call
    // useRegisterViewedTicker / useLiveEventView when actually on screen.
  }, []);

  const optimisticUpdatePrice = useCallback((marketId: string, yes: number) => {
    const normalized = clamp(yes);
    setOptimistic((current) => ({
      ...current,
      [marketId]: { yes: normalized, expiresAt: Date.now() + OPTIMISTIC_TTL_MS },
    }));
    setPrices((current) => ({ ...current, [marketId]: normalized }));
    setEvents((current) => applyPriceToEvents(current, marketId, normalized));
  }, []);

  const startSimulator = useCallback(() => {
    if (simulatorRef.current) return;
    setStatus("simulated");
    simulatorRef.current = setInterval(() => {
      setPrices((current) => {
        const ids = Object.keys(current);
        if (ids.length === 0) return current;
        const next = { ...current };
        const moves = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < moves; i++) {
          const id = ids[Math.floor(Math.random() * ids.length)];
          next[id] = clamp(next[id] + (Math.random() - 0.5) * 0.02);
        }
        return next;
      });
      setEvents((current) =>
        current.map((event) => {
          // Keep LMSR YES simulation; do not drift underlying equity quotes.
          if (event.source === "sp500_dynamic") return event;
          const drift = (Math.random() - 0.5) * 0.02;
          const yes = clamp(event.yesPrice + drift);
          return {
            ...event,
            yesPrice: yes,
            probabilities: { yes, no: clamp(1 - yes) },
          };
        }),
      );
    }, SIMULATOR_INTERVAL_MS);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setOptimistic((current) => {
        const stale = Object.entries(current).filter(([, entry]) => entry.expiresAt <= now);
        if (stale.length === 0) return current;
        const next = { ...current };
        for (const [marketId] of stale) {
          delete next[marketId];
        }
        return next;
      });
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    startSimulator();
    return () => {
      if (simulatorRef.current) {
        clearInterval(simulatorRef.current);
        simulatorRef.current = null;
      }
    };
  }, [startSimulator]);

  // Poll Alpaca REST for currently viewed S&P 500 tickers only.
  // Alpaca WebSocket for MVP. Polygon WebSocket ready for later scaling.
  useEffect(() => {
    if (viewedTickers.length === 0) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/sp500/quotes?tickers=${encodeURIComponent(viewedTickers.join(","))}`,
          { cache: "no-store" },
        );
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as {
          quotes?: Record<string, { lastPrice?: number }>;
        };
        const quotes = payload.quotes ?? {};
        if (cancelled) return;
        setStockQuotes((current) => {
          let changed = false;
          const next = { ...current };
          for (const [ticker, row] of Object.entries(quotes)) {
            const price = Number(row.lastPrice);
            if (!Number.isFinite(price)) continue;
            if (next[ticker] !== price) {
              next[ticker] = price;
              changed = true;
            }
          }
          return changed ? next : current;
        });
        setStatus((current) => (current === "connecting" ? "live" : current));
      } catch {
        // keep last quotes
      }
    };

    void poll();
    const interval = setInterval(() => {
      void poll();
    }, STOCK_QUOTE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [viewedTickers]);

  // Optional FastAPI markets WebSocket (when NEXT_PUBLIC_MARKETS_WS_URL is set).
  useEffect(() => {
    const wsBase = process.env.NEXT_PUBLIC_MARKETS_WS_URL;
    if (!wsBase) return;
    const url = `${wsBase.replace(/\/$/, "")}/ws/markets/${encodeURIComponent(tenantSlug)}`;
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(url);
    } catch {
      return;
    }
    socket.onopen = () => setStatus("live");
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as Record<string, unknown>;
        queueMessage(message);
      } catch {
        // ignore malformed frames
      }
    };
    return () => {
      socket?.close();
    };
  }, [queueMessage, tenantSlug]);

  const mergedPrices = useMemo(() => {
    const next = { ...prices };
    const now = Date.now();
    for (const [marketId, entry] of Object.entries(optimistic)) {
      if (entry.expiresAt > now) {
        next[marketId] = entry.yes;
      }
    }
    return next;
  }, [optimistic, prices]);

  const value = useMemo(
    () => ({
      prices: mergedPrices,
      stockQuotes,
      events,
      status,
      mergeEvents,
      optimisticUpdatePrice,
      registerViewedTicker,
    }),
    [
      mergedPrices,
      stockQuotes,
      events,
      status,
      mergeEvents,
      optimisticUpdatePrice,
      registerViewedTicker,
    ],
  );

  return <LivePricesContext.Provider value={value}>{children}</LivePricesContext.Provider>;
}

export function useFeedStatus(): FeedStatus {
  return useContext(LivePricesContext)?.status ?? "connecting";
}

/** Current YES price for a market, falling back to the SSR value. */
export function useLivePrice(marketId: string, fallback: number): number {
  const context = useContext(LivePricesContext);
  return context?.prices[marketId] ?? fallback;
}

/** Live YES price map from the shared WebSocket / simulator feed. */
export function useLivePricesMap(): Record<string, number> {
  return useContext(LivePricesContext)?.prices ?? {};
}

/** Underlying equity last price for an S&P 500 ticker (Alpaca IEX). */
export function useLiveStockPrice(ticker: string | null | undefined): number | null {
  const context = useContext(LivePricesContext);
  if (!ticker) return null;
  const price = context?.stockQuotes[ticker.toUpperCase()];
  return typeof price === "number" ? price : null;
}

export function useRegisterViewedTicker(): (ticker: string) => void {
  const context = useContext(LivePricesContext);
  return context?.registerViewedTicker ?? (() => undefined);
}

export function useLiveEvents(): LiveEvent[] {
  return useContext(LivePricesContext)?.events ?? [];
}

export function useOptimisticPriceUpdate() {
  const context = useContext(LivePricesContext);
  return context?.optimisticUpdatePrice ?? (() => undefined);
}

export function useLiveEventsContext() {
  const context = useContext(LivePricesContext);
  if (!context) {
    throw new Error("useLiveEventsContext must be used within LivePricesProvider");
  }
  return context;
}
