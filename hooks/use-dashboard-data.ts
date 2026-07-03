"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError, type FetchState } from "@/lib/api-client";
import type { EnrichedPosition } from "@/lib/services";
import type { ChallengeAccount, JournalEntry, Market, PortfolioSummary } from "@/lib/types";

export interface DashboardData {
  account: ChallengeAccount;
  summary: PortfolioSummary;
  positions: EnrichedPosition[];
  journal: JournalEntry[];
  movers: Market[];
}

export const PORTFOLIO_REFRESH_EVENT = "pp:portfolio-refresh";

export function useDashboardData(initial?: Partial<DashboardData>) {
  const [portfolio, setPortfolio] = useState<FetchState<{
    account: ChallengeAccount;
    summary: PortfolioSummary;
    positions: EnrichedPosition[];
  }>>(
    initial?.account && initial.summary && initial.positions
      ? {
          status: "success",
          data: {
            account: initial.account,
            summary: initial.summary,
            positions: initial.positions,
          },
        }
      : { status: "loading" },
  );

  const [journal, setJournal] = useState<FetchState<JournalEntry[]>>(
    initial?.journal
      ? { status: "success", data: initial.journal }
      : { status: "loading" },
  );

  const [movers, setMovers] = useState<FetchState<Market[]>>(
    initial?.movers ? { status: "success", data: initial.movers } : { status: "loading" },
  );

  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setPortfolio((s) => (s.status === "success" ? s : { status: "loading" }));
    } else {
      setRefreshing(true);
    }

    try {
      const [portfolioRes, journalRes, marketsRes] = await Promise.all([
        apiFetch<{
          account: ChallengeAccount;
          summary: PortfolioSummary;
          positions: EnrichedPosition[];
        }>("/api/portfolio"),
        apiFetch<{ journal: JournalEntry[] }>("/api/journal"),
        apiFetch<{ markets: Market[] }>("/api/markets?sort=movers"),
      ]);

      setPortfolio({ status: "success", data: portfolioRes });
      setJournal({ status: "success", data: journalRes.journal });
      setMovers({ status: "success", data: marketsRes.markets.slice(0, 5) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load dashboard";
      const statusCode = error instanceof ApiError ? error.status : undefined;
      setPortfolio((s) =>
        s.status === "success" ? s : { status: "error", error: message, statusCode },
      );
      setJournal((s) =>
        s.status === "success" ? s : { status: "error", error: message, statusCode },
      );
      setMovers((s) =>
        s.status === "success" ? s : { status: "error", error: message, statusCode },
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!initial?.account) {
      void load();
    }
  }, [initial?.account, load]);

  useEffect(() => {
    const onRefresh = () => void load(true);
    window.addEventListener(PORTFOLIO_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(PORTFOLIO_REFRESH_EVENT, onRefresh);
  }, [load]);

  // Periodic refresh for equity / challenge metrics
  useEffect(() => {
    const interval = setInterval(() => void load(true), 30_000);
    return () => clearInterval(interval);
  }, [load]);

  return {
    portfolio,
    journal,
    movers,
    refreshing,
    reload: () => load(false),
  };
}

export function notifyPortfolioRefresh() {
  window.dispatchEvent(new Event(PORTFOLIO_REFRESH_EVENT));
}
