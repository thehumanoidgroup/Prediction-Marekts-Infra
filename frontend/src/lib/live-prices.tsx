"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Live market prices for the whole app.
 *
 * The provider connects to the FastAPI WebSocket feed
 * (`{NEXT_PUBLIC_WS_URL}/ws/markets/{tenantSlug}`) and applies `price_tick`
 * events. When the backend is unreachable (or no URL is configured, e.g.
 * frontend running standalone) it degrades to a client-side random-walk
 * simulator so the UI always feels real-time.
 *
 * Server components render initial prices; hydration is safe because the
 * client state starts from the same `initialPrices` and only diverges
 * after mount.
 */

export type FeedStatus = "connecting" | "live" | "simulated";

interface LivePricesContextValue {
  prices: Record<string, number>;
  status: FeedStatus;
}

const LivePricesContext = createContext<LivePricesContextValue | null>(null);

const SIMULATOR_INTERVAL_MS = 2_500;
const clamp = (p: number) => Math.min(0.97, Math.max(0.03, p));

export function LivePricesProvider({
  initialPrices,
  tenantSlug,
  children,
}: {
  initialPrices: Record<string, number>;
  tenantSlug: string;
  children: ReactNode;
}) {
  const [prices, setPrices] = useState(initialPrices);
  const [status, setStatus] = useState<FeedStatus>("connecting");
  const simulatorRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);
        if (message.type === "price_tick" && typeof message.market_id === "string") {
          setPrices((current) =>
            message.market_id in current
              ? { ...current, [message.market_id]: clamp(Number(message.yes_price)) }
              : current,
          );
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

  return (
    <LivePricesContext.Provider value={{ prices, status }}>{children}</LivePricesContext.Provider>
  );
}

export function useFeedStatus(): FeedStatus {
  return useContext(LivePricesContext)?.status ?? "connecting";
}

/** Current YES price for a market, falling back to the SSR value. */
export function useLivePrice(marketId: string, fallback: number): number {
  const context = useContext(LivePricesContext);
  return context?.prices[marketId] ?? fallback;
}
