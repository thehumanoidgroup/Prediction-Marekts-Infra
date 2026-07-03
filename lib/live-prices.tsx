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
 * Uses a client-side random-walk simulator so prices feel real-time on Vercel
 * without a separate WebSocket server. Server components render initial prices;
 * hydration is safe because client state starts from the same `initialPrices`.
 */

export type FeedStatus = "connecting" | "live" | "simulated";

interface LivePricesContextValue {
  prices: Record<string, number>;
  status: FeedStatus;
}

const LivePricesContext = createContext<LivePricesContextValue | null>(null);

const SIMULATOR_INTERVAL_MS = 1_800;
const clamp = (p: number) => Math.min(0.97, Math.max(0.03, p));

export function LivePricesProvider({
  initialPrices,
  children,
}: {
  initialPrices: Record<string, number>;
  tenantSlug?: string;
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
    startSimulator();
    return () => {
      if (simulatorRef.current) {
        clearInterval(simulatorRef.current);
        simulatorRef.current = null;
      }
    };
  }, [startSimulator]);

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
