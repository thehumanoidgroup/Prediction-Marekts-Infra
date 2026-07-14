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
 * Connects to `{NEXT_PUBLIC_WS_URL}/ws/markets/{tenantSlug}` and applies
 * `price_update`, `status_change`, and `new_event` messages from the live
 * event broadcaster. Legacy `price_tick` frames are still accepted.
 */

export type FeedStatus = "connecting" | "live" | "simulated";

interface LivePricesContextValue {
  prices: Record<string, number>;
  events: LiveEvent[];
  status: FeedStatus;
  mergeEvents: (events: LiveEvent[]) => void;
}

const LivePricesContext = createContext<LivePricesContextValue | null>(null);

const SIMULATOR_INTERVAL_MS = 1_800;
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

export function LivePricesProvider({
  initialPrices,
  initialEvents = [],
  tenantSlug,
  children,
}: {
  initialPrices: Record<string, number>;
  initialEvents?: LiveEvent[];
  tenantSlug: string;
  children: ReactNode;
}) {
  const [prices, setPrices] = useState(initialPrices);
  const [events, setEvents] = useState<LiveEvent[]>(initialEvents);
  const [status, setStatus] = useState<FeedStatus>("connecting");
  const simulatorRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    const base = process.env.NEXT_PUBLIC_WS_URL;
    if (!base) {
      startSimulator();
      return;
    }

    let socket: WebSocket | null = null;
    let closed = false;
    try {
      socket = new WebSocket(`${base}/ws/markets/${tenantSlug}`);
    } catch {
      startSimulator();
      return;
    }

    socket.onopen = () => {
      if (simulatorRef.current) {
        clearInterval(simulatorRef.current);
        simulatorRef.current = null;
      }
      setStatus("live");
      socket?.send(JSON.stringify({ type: "subscribe", rooms: ["all"] }));
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);

        if (message.type === "price_tick" && typeof message.market_id === "string") {
          const yes = clamp(Number(message.yes_price));
          setPrices((current) =>
            message.market_id in current ? { ...current, [message.market_id]: yes } : current,
          );
          setEvents((current) => applyPriceToEvents(current, message.market_id, yes));
        }

        if (message.type === "price_update" && message.data) {
          const externalId = message.data.external_id as string | undefined;
          const probabilities = message.data.probabilities as { yes?: number } | undefined;
          const yes = clamp(Number(probabilities?.yes ?? 0.5));
          const key = externalId ?? message.event_id;
          if (typeof key === "string") {
            setPrices((current) => ({ ...current, [key]: yes }));
            setEvents((current) =>
              applyPriceToEvents(current, key, yes).map((item) =>
                item.externalId === key || item.id === message.event_id
                  ? {
                      ...item,
                      yesPrice: yes,
                      probabilities: { yes, no: clamp(1 - yes) },
                      change24h: Number(message.data.change_24h ?? item.change24h),
                      source: (message.data.source as LiveEvent["source"]) ?? item.source,
                    }
                  : item,
              ),
            );
          }
        }

        if (message.type === "status_change" && message.data) {
          const statusValue = message.data.status as LiveEventStatus;
          setEvents((current) =>
            current.map((item) =>
              item.id === message.event_id || item.externalId === message.data.external_id
                ? { ...item, status: statusValue }
                : item,
            ),
          );
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
            };
            setEvents((current) => upsertEvent(current, incoming));
            setPrices((current) => ({ ...current, [externalId]: yes }));
          } else {
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

        if (message.type === "portfolio_update") {
          window.dispatchEvent(new CustomEvent("pp:portfolio-refresh"));
        }
      } catch {
        // Ignore malformed frames.
      }
    };

    socket.onerror = () => {
      if (!closed) startSimulator();
    };
    socket.onclose = () => {
      if (!closed) startSimulator();
    };

    return () => {
      closed = true;
      socket?.close();
      if (simulatorRef.current) {
        clearInterval(simulatorRef.current);
        simulatorRef.current = null;
      }
    };
  }, [tenantSlug, startSimulator]);

  const value = useMemo(
    () => ({ prices, events, status, mergeEvents }),
    [prices, events, status, mergeEvents],
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

export function useLiveEvents(): LiveEvent[] {
  return useContext(LivePricesContext)?.events ?? [];
}

export function useLiveEventsContext() {
  const context = useContext(LivePricesContext);
  if (!context) {
    throw new Error("useLiveEventsContext must be used within LivePricesProvider");
  }
  return context;
}
