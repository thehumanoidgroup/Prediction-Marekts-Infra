"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError, type FetchState } from "@/lib/api-client";
import type { HybridMarketsPayload, MarketViewSource } from "@/lib/types";
import type { MarketFilters } from "@/lib/services";

export interface HybridMarketFilters extends MarketFilters {
  source?: MarketViewSource;
}

export function useHybridMarkets(
  filters: HybridMarketFilters = {},
  options: { enabled?: boolean; limit?: number } = {},
) {
  const enabled = options.enabled ?? true;
  const limit = options.limit;
  const source = filters.source ?? "all";

  const [state, setState] = useState<FetchState<HybridMarketsPayload>>({ status: "loading" });
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
        params.set("source", source);
        if (filters.category && filters.category !== "all") params.set("category", filters.category);
        if (filters.query) params.set("q", filters.query);
        if (filters.sort) params.set("sort", filters.sort);

        const response = await apiFetch<HybridMarketsPayload>(`/api/markets?${params.toString()}`);
        let markets = response.markets;
        if (limit && source === "all") {
          // Interleave sources so S&P 500 / Kalshi are not crowded out by LMSR volume.
          const order = ["internal", "polymarket", "kalshi", "sp500_dynamic"] as const;
          const groups = order.map((key) =>
            response.markets.filter((market) => market.source === key),
          );
          const mixed: typeof markets = [];
          let added = true;
          while (added && mixed.length < limit) {
            added = false;
            for (const group of groups) {
              const next = group.shift();
              if (next) {
                mixed.push(next);
                added = true;
                if (mixed.length >= limit) break;
              }
            }
          }
          markets = mixed;
        } else if (limit) {
          markets = response.markets.slice(0, limit);
        }
        setState({
          status: "success",
          data: { ...response, markets },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load markets";
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
    [enabled, filters.category, filters.query, filters.sort, limit, source],
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
    payload: state,
    refreshing,
    reload: () => load(false),
  };
}
