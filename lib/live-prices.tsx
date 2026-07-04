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
import type { RealtimeEvent } from "@/lib/realtime/types";

/**
 * Live market prices for the whole app.
 *
 * Connects to the WebSocket real-time server when `NEXT_PUBLIC_REALTIME_WS_URL`
 * is set and the server is reachable; otherwise falls back to a client-side
 * simulator so the UI stays responsive on Vercel without a WS process.
 */

export type FeedStatus = "connecting" | "live" | "simulated";

interface LivePricesContextValue {
  prices: Record<string, number>;
  status: FeedStatus;
}

const LivePricesContext = createContext<LivePricesContextValue | null>(null);

const SIMULATOR_INTERVAL_MS = 1_800;
const WS_RECONNECT_MS = 5_000;
const clamp = (p: number) => Math.min(0.97, Math.max(0.03, p));

function getWsUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_REALTIME_WS_URL;
  if (!url || url === "false" || url === "off") return null;
  return url;
}

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
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const useSimulatorRef = useRef(false);

  const stopSimulator = useCallback(() => {
    if (simulatorRef.current) {
      clearInterval(simulatorRef.current);
      simulatorRef.current = null;
    }
  }, []);

  const startSimulator = useCallback(() => {
    if (simulatorRef.current) return;
    useSimulatorRef.current = true;
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

  const applyEvent = useCallback((event: RealtimeEvent) => {
    if (event.type !== "price_update") return;
    setPrices((current) => ({ ...current, [event.marketId]: event.yesPrice }));
  }, []);

  const reconnectAttempts = useRef(0);

  const connectWebSocket = useCallback(() => {
    const wsUrl = getWsUrl();
    if (!wsUrl) {
      startSimulator();
      return;
    }

    stopSimulator();
    useSimulatorRef.current = false;
    setStatus("connecting");

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttempts.current = 0;
        setStatus("live");
        ws.send(JSON.stringify({ op: "subscribe", scope: "all" }));
        ws.send(JSON.stringify({ op: "subscribe", scope: "event", eventType: "price_update" }));
      };

      ws.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data as string) as {
            type: string;
            event?: RealtimeEvent;
          };
          if (payload.type === "event" && payload.event) {
            applyEvent(payload.event);
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onclose = () => {
        wsRef.current = null;
        reconnectAttempts.current += 1;
        if (reconnectAttempts.current > 3) {
          startSimulator();
          return;
        }
        reconnectRef.current = setTimeout(connectWebSocket, WS_RECONNECT_MS);
      };
    } catch {
      startSimulator();
    }
  }, [applyEvent, startSimulator, stopSimulator]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      stopSimulator();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connectWebSocket, stopSimulator]);

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
