"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError, type FetchState } from "@/lib/api-client";
import type { EnrichedPosition } from "@/lib/services";
import type { ChallengeAccount, JournalEntry, Market, PortfolioSummary } from "@/lib/types";
import {
  applyYesPriceToPositions,
  mergePortfolioPositions,
  notifyPortfolioWs,
  notifyTraderUserId,
  PORTFOLIO_WS_EVENT,
  POSITION_MARK_EVENT,
  summarizeOpenPnl,
  type PortfolioWsPayload,
  type PositionMarkPayload,
} from "@/lib/portfolio-realtime";

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

  const applyWsPayload = useCallback((payload: PortfolioWsPayload) => {
    setPortfolio((state) => {
      if (state.status !== "success") return state;
      const positions = mergePortfolioPositions(state.data.positions, payload);
      const openPnl = summarizeOpenPnl(positions);
      const summary: PortfolioSummary = {
        ...state.data.summary,
        ...(payload.summary ?? {}),
        openPnl: payload.summary?.openPnl ?? openPnl,
        openPositions: positions.length,
        numberOfOpenPositions: positions.length,
        positionsValue:
          payload.summary?.positionsValue ??
          positions.reduce((sum, p) => sum + (p.value ?? 0), 0),
      };
      const account = {
        ...state.data.account,
        balance: summary.balance ?? state.data.account.balance,
        equity: summary.equity ?? summary.totalValue ?? state.data.account.equity,
        totalPnl: summary.totalPnl ?? state.data.account.totalPnl,
      };
      return { status: "success", data: { account, summary, positions } };
    });
  }, []);

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
          events?: unknown[];
          traderId?: string;
        }>("/api/trader/portfolio"),
        apiFetch<{ journal: JournalEntry[] }>("/api/journal"),
        apiFetch<{ markets: Market[] }>("/api/markets?sort=movers"),
      ]);

      setPortfolio({ status: "success", data: portfolioRes });
      setJournal({ status: "success", data: journalRes.journal });
      setMovers({ status: "success", data: marketsRes.markets.slice(0, 5) });
      if (portfolioRes.traderId) {
        notifyTraderUserId(portfolioRes.traderId);
      }
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

  // Instant portfolio updates from WebSocket / local order fills.
  useEffect(() => {
    const onWs = (event: Event) => {
      const detail = (event as CustomEvent<PortfolioWsPayload>).detail;
      if (!detail) return;
      applyWsPayload(detail);
    };
    const onMark = (event: Event) => {
      const detail = (event as CustomEvent<PositionMarkPayload>).detail;
      if (!detail?.marketId || !Number.isFinite(detail.yesPrice)) return;
      setPortfolio((state) => {
        if (state.status !== "success") return state;
        const positions = applyYesPriceToPositions(
          state.data.positions,
          detail.marketId,
          detail.yesPrice,
        );
        if (positions === state.data.positions) return state;
        const openPnl = summarizeOpenPnl(positions);
        return {
          status: "success",
          data: {
            ...state.data,
            positions,
            summary: {
              ...state.data.summary,
              openPnl,
              positionsValue: positions.reduce((sum, p) => sum + (p.value ?? 0), 0),
              openPositions: positions.length,
              numberOfOpenPositions: positions.length,
            },
          },
        };
      });
    };
    window.addEventListener(PORTFOLIO_WS_EVENT, onWs);
    window.addEventListener(POSITION_MARK_EVENT, onMark);
    return () => {
      window.removeEventListener(PORTFOLIO_WS_EVENT, onWs);
      window.removeEventListener(POSITION_MARK_EVENT, onMark);
    };
  }, [applyWsPayload]);

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

/** Instant local portfolio patch after an order fill (also used when WS is down). */
export function notifyPortfolioPosition(payload: PortfolioWsPayload) {
  notifyPortfolioWs(payload);
  // Soft reconcile with server shortly after optimistic merge.
  window.setTimeout(() => notifyPortfolioRefresh(), 750);
}
