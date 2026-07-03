"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError, type FetchState } from "@/lib/api-client";
import type { PolymarketMarket } from "@/lib/types";

export interface PolymarketFilters {
  query?: string;
  active?: boolean;
}

export function usePolymarketMarkets(
  filters: PolymarketFilters = {},
  options: { enabled?: boolean; limit?: number } = {},
) {
  const enabled = options.enabled ?? true;
  const limit = options.limit;

  const [state, setState] = useState<FetchState<PolymarketMarket[]>>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!enabled) return;

      if (!silent) {
        setState((current) => (current.status === "success" ? current : { status: "loading" }));
      } else {
        setRefreshing(true);
      }

      try {
        const params = new URLSearchParams();
        if (filters.query) params.set("q", filters.query);
        if (filters.active) params.set("active", "true");

        const response = await apiFetch<{ markets: PolymarketMarket[] }>(
          `/api/polymarket/markets?${params.toString()}`,
        );

        const markets = limit ? response.markets.slice(0, limit) : response.markets;
        setState({ status: "success", data: markets });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load Polymarket markets";
        const statusCode = error instanceof ApiError ? error.status : undefined;
        setState((current) =>
          current.status === "success"
            ? current
            : { status: "error", error: message, statusCode },
        );
      } finally {
        setRefreshing(false);
      }
    },
    [enabled, filters.active, filters.query, limit],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!enabled) return undefined;
    const interval = setInterval(() => void load(true), 60_000);
    return () => clearInterval(interval);
  }, [enabled, load]);

  return {
    markets: state,
    refreshing,
    reload: () => load(false),
  };
}
