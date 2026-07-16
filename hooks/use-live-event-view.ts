"use client";

import { useEffect, useRef } from "react";
import type { LiveEvent } from "@/lib/types";
import { useRegisterViewedTicker } from "@/lib/live-prices";

/** Fire-and-forget view tracking for live event analytics + Alpaca ticker interest. */
export function useLiveEventView(event: LiveEvent) {
  const tracked = useRef(false);
  const registerTicker = useRegisterViewedTicker();

  useEffect(() => {
    if (event.source === "sp500_dynamic" && event.stockTicker) {
      registerTicker(event.stockTicker);
    }
  }, [event.source, event.stockTicker, registerTicker]);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;

    void fetch(`/api/live-events/${encodeURIComponent(event.id)}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stockTicker: event.stockTicker ?? undefined,
        source: event.source,
      }),
      keepalive: true,
    }).catch(() => {
      tracked.current = false;
    });
  }, [event.id, event.source, event.stockTicker]);
}
